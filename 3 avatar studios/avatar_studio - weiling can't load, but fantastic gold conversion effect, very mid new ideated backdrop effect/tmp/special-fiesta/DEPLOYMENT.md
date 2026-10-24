# Deployment Guide

How to run PSD Active Day somewhere real. The short version: **one container, one
Postgres, a handful of environment variables.** Everything below is the long version,
with Northflank as the worked example.

There are no migrations. The schema is a single snapshot (`apps/api/src/db/schema.sql`)
that the app applies itself on boot (ADR-049), and it stamps the database with a schema
version (`schema_state`, currently **3**) so a database built by an older build is
recognised rather than silently run on.

---

## 1. Environment variables — quick reference

Set these on the deployment (Northflank: service → Environment). Defaults are what
you get if you say nothing.

### The ones you must decide

| Variable | Example | What it does |
|---|---|---|
| `SUPERADMIN_INITIAL_PASSCODE` | *(a 4-digit secret you choose)* | Seeds the first superadmin account on first boot. **Required** — boot fails loudly without it on a fresh database. Afterwards it does nothing; change passcodes in the console. |
| `DATABASE_URL` | `postgresql://user:pass@host:5432/db?sslmode=require` | External Postgres. Set it and the app uses that server; leave it unset and the whole database is embedded PGlite on the `/data` volume (fine for a single container you control, see §3). |
| `COOKIE_SECURE` | `true` | Session cookies are `Secure`. **Always `true` behind HTTPS** (which Northflank gives you), or browsers will drop the cookie and sign-in will loop. |
| `PSD_VENUE` | `sentosa` | Which venue theme the participant app wears: `sentosa`, `tessensohn`, or `kallang`. A typo stops the boot (deliberately). Changing it needs a restart; phones pick it up on next page load. |
| `PSD_SEED` | `default` | `demo` additionally loads the recorded demo day (80 participants, a live tournament, chat, photos) — once only, never into a database that already has participants. The `Dockerfile` image defaults to `demo`; `Dockerfile-prd` to `default`. |

### Database provisioning (set beside each other)

| Variable | Values | What it does |
|---|---|---|
| `DB_INIT` | `schema` \| `demo` | Provision `DATABASE_URL`'s database as an explicit step of boot, before the port opens. `schema` = schema + default seed; `demo` = that, then the demo day. Leave unset for the ordinary self-provisioning boot. **Recommended on Northflank: `schema`.** |
| `DB_INIT_RESET` | `stale` | Only works **beside `DB_INIT`** (alone it is inert and the boot log warns). Before `DB_INIT` runs: if the database's stamped schema version is older than this build's — **including no stamp at all, which reads as version 0, the legacy case** — drop the snapshot's tables (`db-reset.sh`) and let `DB_INIT` rebuild. A database stamped *newer* than the build refuses to boot rather than being reset backwards. **This deletes all event data.** Use for one deploy, then remove it. |
| `DATABASE_URL_ADMIN` | a second connection string | Optional least-privilege split: provisioning runs as this (DDL-capable) role and the app role in `DATABASE_URL` is granted read/write on what was built. The running app still connects as `DATABASE_URL`. |

### Usually left alone

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | Set `production` (the image does). |
| `PORT` | `8787` (`3000` in `Dockerfile-prd`) | The one port. Liveness: `GET /api/health`. Readiness: `GET /api/health/ready` (ADR-324). |
| `SUPERADMIN_INITIAL_USERNAME` | `superadmin` | Name of the seeded superadmin. |
| `SESSION_TTL_DAYS` | `30` | Session lifetime; 30 covers the whole event. |
| `COOKIE_SAMESITE` | `Lax` | Only change if the app is embedded inside another site's page (`None` + `COOKIE_SECURE=true` + `COOKIE_PARTITIONED=true`). |
| `DATABASE_DRIVER` | *(follows `DATABASE_URL`)* | Override only to force `pglite` despite a `DATABASE_URL`. |
| `PGLITE_DATA_DIR` | `.data/dev` (`/data` in the image) | Where the embedded database lives when no `DATABASE_URL` is set. |
| `LOG_AUTH_CARRIER` | `false` | Debug: logs which credential carrier each request used. Turn on only while diagnosing sign-in. |
| `PROCESS_SUPERVISED`, `WEB_DIST` | set by the image | Don't touch. `PROCESS_SUPERVISED=true` enables the superadmin Restart button, which exits 0 and relies on a restart policy (ADR-118, ADR-323). |

### Container-only (Cloudflare tunnel) variables

The image bundles `cloudflared` under supervisord (ADR-043). **On Northflank you do
not need it** — Northflank terminates HTTPS itself — so set `TUNNEL_DISABLE=1`. The
tunnel knobs only matter for a bare `docker run`:

| Variable | Effect |
|---|---|
| `TUNNEL_DISABLE=1` | No tunnel; publish port 8787 yourself. **Set this on Northflank.** |
| `TUNNEL_TOKEN` | Cloudflare named-tunnel token (production tunnel). Unset = a throwaway `trycloudflare.com` URL printed in the logs. |

---

## 2. Deploying on Northflank

### Shape (read this first)

Run **exactly one instance**. The app's live buses (chat, status streams, announcements),
its caches and its presence tracking are in-process by design, and PGlite is a
single-writer database. One container is the architecture, not a limitation to scale
past. The browser client already sends a stable per-browser `x-sticky-session` header
on every request (ADR-263) precisely so a platform load balancer can pin one browser
to one instance if that ever changes — see step 5.

### Steps

1. **Postgres.** In your Northflank project: *Addons → PostgreSQL*, create the database.
   Copy its internal connection string. (Alternatively skip this and use the embedded
   PGlite on a persistent volume — §3 — but the addon is the better default: backups
   and restarts stop being your problem.)
2. **Service.** *Add service → Deployment*, connect this repository, and build from
   the Dockerfile:
   - `Dockerfile` — boots with the demo day on a fresh database. Good for evaluation.
   - `Dockerfile-prd` — the same bits, but a fresh database starts **empty**, and it runs
     as ONE process (no supervisord, no tunnel) on port **3000** (ADR-323). **Use this for a
     real event.** The service's restart policy must be *always* (Northflank's default):
     the console's Restart button exits the process and expects the platform to start it.
   Build context is the repo root; no build args are needed.
3. **Port.** Expose HTTP port **8787** for `Dockerfile`, or **3000** for `Dockerfile-prd` (the service's public URL then fronts the whole
   app — the API serves the built SPA same-origin, so there is no second service and
   no CORS to configure). Northflank's TLS is why `COOKIE_SECURE=true` is safe to set.
4. **Environment.** Set at minimum:

   ```
   NODE_ENV=production
   TUNNEL_DISABLE=1
   DATABASE_URL=<the addon connection string>
   DB_INIT=schema
   SUPERADMIN_INITIAL_PASSCODE=<your 4-digit secret>   (store as a secret)
   SUPERADMIN_INITIAL_USERNAME=superadmin
   COOKIE_SECURE=true
   PSD_VENUE=sentosa            (or tessensohn / kallang)
   PSD_SEED=default             (real event; the prd image already defaults to this)
   ```

5. **Sticky sessions.** In the service's networking/load-balancing settings, enable
   **consistent hashing by custom header** and name the header **`X-Sticky-Session`**.
   Every browser already sends a stable value in it. With one instance this is a
   no-op today; set it anyway so the day somebody scales the service out, streams
   and sign-ins stay pinned per browser instead of breaking mysteriously.
6. **Deploy and check.** First boot provisions the schema, seeds the superadmin and
   starts empty (or with the demo day). Watch the logs for the `[db]` boot lines —
   they state the schema outcome (`provisioned`) and any env warnings verbatim.
   Open the URL, sign in as the superadmin, and set up facilitators from the console.

### Upgrading to a build with a newer schema

Check the release note for "schema version". If the new build's version is higher
than your database's stamp and the change is not additive, an ordinary boot will
**refuse** and tell you so (ADR-271 — it will not silently re-stamp). To trade the
database in, **accepting the loss of all its data**:

1. Add `DB_INIT_RESET=stale` beside the existing `DB_INIT`.
2. Redeploy. Boot log shows the reset, then a fresh provision and seed.
3. **Remove `DB_INIT_RESET`** and redeploy, so a future restart can never reset by
   accident.

A database with **no schema version at all** (created before version stamping
existed) is recognised as version 0 — legacy — and takes this same reset path. A
completely empty database also reads as version 0 but has nothing to drop; it just
provisions.

### On the day

- Rehearse on the real deployment, then clear the practice data from inside the app:
  superadmin → **Operations → Reset the system** (ADR-307). It deletes participants,
  teams, socials, tournaments and matches while keeping facilitators, courts,
  activities and configuration — no redeploy, no env surgery.
- Or start from `Dockerfile-prd` and never rehearse in production at all.

---

## 3. The embedded-database option (no external Postgres)

Leave `DATABASE_URL` unset and the database is PGlite inside the container at
`/data`. On Northflank that means: attach a **persistent volume mounted at `/data`**
— without it, every redeploy is a fresh event. This is a legitimate single-container
setup (it is what `docker run -v psd-data:/data psd-active-day` does), but prefer
the Postgres addon: Northflank addons are backed up; a volume is just a disk.

## 4. Bare Docker, for reference

```sh
docker build -t psd-active-day -f Dockerfile-prd .     # empty start, real event, port 3000
docker run -d -p 3000:3000 --restart unless-stopped \
  -e SUPERADMIN_INITIAL_PASSCODE=1234 -v psd-data:/data psd-active-day
```

`Dockerfile-prd` has no supervisord: tini is PID 1 and the platform owns restarts, so keep
`--restart always` or `unless-stopped` (`on-failure` leaves the app down after the Restart
button, which exits 0). Plain `docker run` does not restart a container the HEALTHCHECK marks
unhealthy; only an orchestrator does. Ingress and TLS are the platform's job.
