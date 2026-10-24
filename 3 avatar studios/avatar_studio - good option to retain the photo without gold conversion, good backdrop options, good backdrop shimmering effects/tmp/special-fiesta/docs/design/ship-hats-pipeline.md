# SHIP-HATS: the pipeline files, kept inert until someone activates them

Date: 2026-10-11. Sources: the public SHIP-HATS documentation
(`docs.developer.tech.gov.sg/docs/ship-hats-docs/`, mirrored at
`github.com/sg-developer-portal/ship-hats-docs-clone`, cloned and read 2026-10-11) and this
repo's own build files. No internal SGTS resource was reachable from where this was written —
see §6 for what that leaves unverified.

## 1. What is in the repo

Five files, none of which runs anything:

| File | Read by | Purpose |
| --- | --- | --- |
| `.gitlab-ci.yml.shiphats` | nobody | The file GitLab would read, if it were named `.gitlab-ci.yml`: the `include:` of the SHIP-HATS webapp E2E template, the three local includes, `workflow:` rules, every `variables:` the other three files reference, and the `default:` block (image, npm cache, registry and Maven-settings setup). |
| `BUILD.gitlab-ci.yml.shiphats` | nobody | `build-and-package`: Kaniko build of the image into a tarball that *is* `$OUTPUT_ARTEFACT`, its `.sha512`, an optional `crane push`, and the lockfile upload. |
| `TEST.gitlab-ci.yml.shiphats` | nobody | `development`: `lint-job`, `unit-test-job`, `depcheck-job` (the documented trio) plus `image-audit-job`, which checks the tarball it is shipping, and `config-check-job` in `planning`: one cheap job that fails at once when a switch is on but the credential it reads was never added in GitLab. |
| `DEPLOY.gitlab-ci.yml.shiphats` | nobody | `runtime-test`: the repo's own Playwright suite against the deployed container. `deploy-to-testing` / `deploy-to-production`: `deploy-testing-job` and `deploy-final-job` (name fixed by the template), loading the tarball with `docker load` over SSH. |
| `shiphats-activate.sh` → `scripts/ship-hats-activate.mjs` | the operator | Asks for the values only a human knows, substitutes them into the four files above, and renames them into place. |

The `.shiphats` suffix is the whole inertness mechanism: GitLab looks for `.gitlab-ci.yml` at
the repo root and nothing else, so a differently-named file is documentation with a `.yml`
shape. `git ls-files | grep -i gitlab` before this change returned nothing — the project has
never had a CI configuration in version control, so nothing is being disabled here.

`./shiphats-activate.sh --dry-run` shows what would be written; `--revert` puts it back.

The set's consistency is not left to memory. `scripts/check-standards.mjs` has an 18th rule,
`shiphats-pipeline-set`, which fails the gate when the four files are not all present, when a
placeholder in them has no prompt in the activator's schema, when a live pipeline file still carries
a placeholder or has dropped one of the three local includes, and when the activator or this doc goes
missing while the set exists. ADR-243 records why that and not a test; `GREENFIELD.md` §9.3 and its
checklist item 19 carry the same rules worded for any platform that prescribes a pipeline, so a new
project writes the set, the script and the record in the same change as the platform decision.

## 2. What SHIP-HATS is (researched, from the public docs)

GovTech's CI/CD component of the Singapore Government Tech Stack: GitLab Ultimate as a SaaS on
`sgts.gitlab-dedicated.com`, with a container registry at `registry.sgts.gitlab-dedicated.com`,
shared runners, Nexus Repo and IQ, SonarQube and Fortify on Demand wired in, and a compliance
framework that injects the security jobs so no project can forget them by editing its own YAML.

Two facts in it shaped these files more than anything else:

* **The shared runners are Docker runners with no DinD and no privileged mode.** The docs'
  runner FAQ names the alternatives and the runner tags that carry them: Kaniko builds on
  `ship_docker` + `non_privileged` (root, unprivileged), Skopeo and Crane run on `cstack` +
  `non_privileged` (no root). So `build-job` calls `/kaniko/executor` and the registry push
  calls `crane push`, and no job anywhere in these files says `docker build`.
* **The templates are pinned by tag and barely maintained.** Versioned tags exist from v1.1.0,
  and the E2E template set is documented as not actively maintained after it. The activation
  script therefore defaults the ref to `v1.1.0` rather than `main`, and says so in the note.

## 3. The contract, and where each requirement landed

The webapp E2E template's requirements, as documented, mapped onto this repo:

| Requirement (docs) | Where it is satisfied |
| --- | --- |
| Repo-root `.gitlab-ci.yml` that `include:`s the template plus `BUILD.gitlab-ci.yml`, `TEST.gitlab-ci.yml`, `DEPLOY.gitlab-ci.yml` | `.gitlab-ci.yml.shiphats`, with the template project/ref/file as prompted values |
| BUILD must produce `$OUTPUT_ARTEFACT`, built inside `$WORKING_DIR`; the file is what gets signed, scanned and published | `build-job`: `--no-push --tarPath` makes Kaniko's tarball the artefact; `WORKING_DIR` defaults to `.` and the script *refuses* any other value unless the two literal `artifacts:` paths are edited too, because GitLab does not expand variables in `artifacts:paths` |
| TEST holds linting, dependency checking, unit/integration tests | the three documented job names, each running the commands `npm run verify` already runs (`npm run lint`, `npm run standards`, `npm run typecheck`, both vitest suites) |
| DEPLOY holds `deploy-testing-job` and `deploy-final-job`; the latter's name must not change | both present; `deploy-final-job` is `when: manual`, `allow_failure: false`, and tagged-rules only — the framework's verification jobs attach around it |
| Stages must not be renamed; the compliance framework keys off them | no `stages:` block at all in these files: the stage list comes from the template, and each job names its stage (`build-and-package`, `development`, `runtime-test`, `deploy-to-testing`, `deploy-to-production`) |
| Readiness: `wait-for-web-app-ready-job` waits for `WEBAPP_URL` and greps for `WEBAPP_NAME` | `WEBAPP_URL` / `WEBAPP_NAME` variables, defaulted from this repo: `/api/health/ready` returns `{"ok":true,…}` only when the listener, event loop and a read-only database round trip all pass (ADR-324), so the search text is `ok` |
| `NEXUSREPO_REPO_ID`, `NEXUSREPO_REPO_GROUP_ID`, `ARTEFACT_ID` (no whitespace), `ARTEFACT_PACKAGE`, `MVN_SETTINGS_FILE`, `MAVEN_SETTINGS_SERVER_ID` | all in the variables block; the settings.xml is written in `default:before_script` with one `printf`, since a heredoc loses its terminator to YAML block-scalar indentation |
| Secrets are GitLab CI/CD variables, never file contents | the script has no secret prompts at all; it prints the list to create in Settings → CI/CD → Variables (`COSIGN_PASSWORD`, and `SONAR_*` / `FOD_*` / `NEXUS_IQ_*` / `NEXUS_REPO_*` as the switches are turned on) |
| `ship-hats-webapp-compliance` applied under Settings → General → Compliance framework | step 2 of the printed checklist — the four files without it are a pipeline with no gates, and a failing compliance job deliberately does not fail this pipeline |

## 4. How this repo's build fits, and where it does not

Verified against the repo (read, not assumed): one image, `node:22-alpine` builder and runtime,
`PORT=3000` in `Dockerfile-prd` (ADR-323; the demo `Dockerfile` keeps 8787), `HEALTHCHECK` on `/api/health/ready` (ADR-324), `WEB_DIST=/app/apps/web/dist`, `PGLITE_DATA_DIR=/data`,
one process under tini with no supervisord in `Dockerfile-prd`, and supervisord + cloudflared only in the demo image (ADR-043, ADR-323). `Dockerfile` and
`Dockerfile-prd` build the same bits and differ in the data tier (`PSD_SEED`) and the runtime shell — which a rule in
`scripts/check-standards.mjs` enforces, and that is why `DOCKERFILE` is a *prompted* value with
`Dockerfile-prd` as the default and a warning if you answer otherwise: a production pipeline built
from `Dockerfile` ships 120 demo participants.

Two places where the template and this repo genuinely disagree, each resolved rather than hidden:

* **The artefact is an image, not a zip.** The template's examples deploy an unzipped directory
  (`UNZIPPED_DIR`) onto a host. Here the artefact is a `docker save`-format tar: one file that
  Nexus can store, cosign can sign, `sha512sum` can check and `docker load` can run. The deploy
  jobs therefore copy a tarball, verify its checksum on the remote *before* loading it, load it,
  and replace one container — with no `UNZIPPED_DIR` anywhere.
* **The E2E stage is Playwright, not Robot Framework.** The template's `e2e-test-job` is a Robot
  job configured by `RF_TESTSCRIPT_FOLDER` and `OPTS`; overriding it means learning a second
  framework for one CI job. Instead `webapp-e2e-job` runs the suite the repo already maintains,
  pointed at the deployed container with the two knobs the config already honours:
  `PSD_E2E_BASE_URL=$TESTING_URL` and `PSD_E2E_NO_SERVER=1` (`playwright.config.ts:162`), with
  `PSD_E2E_ENGINES=chromium` and `PSD_E2E_VIDEO=off` so a runner without WebKit gets a real run
  rather than a loud config error, and small artefacts. `RF_TESTSCRIPT_FOLDER` is still prompted,
  for the day the Robot job is wanted.

Reporting gaps are closed in the CI command line, not by editing the apps: `unit-test-job` adds
`--reporter=junit --outputFile=…` and `--coverage.reporter=lcov --coverage.reporter=cobertura` to
each workspace's vitest call, so GitLab gets a test tab and a coverage payload and Sonar gets
`lcov.info`, while `npm test` locally keeps the output developers are used to and the coverage
floors of ADR-080 stay exactly as strict as they are today.

## 5. Activating it

```bash
./shiphats-activate.sh                # 39 questions, each showing a default from this repo
./shiphats-activate.sh --defaults     # accept the defaults, e.g. to see what the files look like
./shiphats-activate.sh --dry-run
./shiphats-activate.sh --answers a.json
./shiphats-activate.sh --revert
```

Behaviour that is worth knowing before the first run (all of it observed, §6):

* Defaults come from the repo where the repo has an answer — `PORT=3000`, `READINESS_PATH=/api/health/ready`,
  `WEBAPP_NAME=ok`, `VERSION` from `package.json` (1.0.0), `DOCKERFILE=Dockerfile-prd` checked to
  exist — and from the docs where only the docs have one. Blanks are allowed exactly where a blank
  leaves a job inert, and the summary lists every blank at the end so nothing is quietly missing.
* Answers are validated as they are typed: booleans for the `true`/`false` switches, a port number,
  tag characters for runner tags, `ARTEFACT_ID` may not contain whitespace (the docs say so),
  `DEPLOY_STRATEGY` accepts only the implemented value, and no answer may contain a double quote —
  because values are substituted into double-quoted YAML scalars, so the guard belongs at the prompt.
* It refuses to overwrite an existing `.gitlab-ci.yml` (a project that already has one cannot take
  the template include) and refuses to write a file with an unanswered placeholder in it. If the
  schema and a file disagree, that is a bug in one of them and the script says so instead of guessing.
* `E2E_IMAGE` and `DEPLOY_IMAGE` are asked for rather than assumed: `npm run e2e:install` cannot
  reach the Playwright CDN from a shared runner, and `apk add` in a deploy job cannot reach any package index either, so both images must arrive prebuilt. The deploy jobs check for `ssh`,
  `scp` and `curl` at run time and fail with that sentence rather than an `exec` error.

## 6. What is verified, what is read, and what still has to be confirmed

Labelled the way the repo labels everything else.

**Verified by running it (2026-10-11, in a temp copy of these files):** all four inert files parse
as YAML; so do all four after substitution, yielding 12 jobs; the two runner-tag lists expand into
two list items each; no `@@PLACEHOLDER@@` survives; `--revert` leaves the inert set and removes the
live set; an empty stdin mid-ask exits 1 with an actionable message; a bad `ARTEFACT_ID` in an
answers file is rejected with the docs' rule quoted. Every one of the 23 multi-line shell snippets
in the four files was extracted from the parsed YAML and syntax-checked under bash, dash and busybox
ash — 0 failures, before and after activation. That pass is how the unbound-variable reads and the
heredoc-terminator problem in §3 were found here instead of in someone's first pipeline. In
particular, `config-check-job` was run with *nothing* defined in the environment: it named every
missing variable and exited 1, which is the intended report rather than a crash on an unbound
variable — the reason every optional variable in that job is read as `${X:-}`.
`npm run standards` reported 591 files / 17 rules / 0 violations before that rule existed and 18 after, `npx eslint` is clean on
`scripts/ship-hats-activate.mjs`, and `shellcheck` is clean on the wrapper. `npm run standards`
now reports 591 files / 18 rules / 0 violations with `shiphats-pipeline-set` among them, and that
rule was watched to fail on six sabotages of the set: a file moved away, an unknown placeholder, a
live file holding a placeholder, a live file missing an include, this doc moved away, the activator
moved away. No app file was
modified, and no pipeline ran.

A detour worth recording, because the gate went red here and the cause was not this change: the
first full `./verify.sh` after the files above were written failed on
`apps/api/src/tests/scan-number.test.ts` with `mint sequence exhausted`. That test stages a
scan-number collision by computing `taken + 1` as the number that will *not* collide, while the
test before it mints thirty random numbers into the same database — so about one run in 330 the
premise is false (arithmetic: 30 draws over 10,000 numbers, not a measured rate), the retry collides
too, and the stub is asked for a value the test never staged.
Reproduced here by taking the neighbour deliberately (old helper → fails with exactly that error;
the fixed helper → passes), then fixed by asking the database for a free number instead of doing
arithmetic. ADR-244.

**Read from the docs:** the file set and job-name constraints of §3, the stage list, the runner
tags for Kaniko and Crane, the variables table, the secrets list, the compliance-framework
procedure, the v1.1.0 pinning note.

**Not verifiable from here, and marked `CONFIRM:` in the files:** the text of the four included
template files, which live behind `sgts.gitlab-dedicated.com`. Everything in these files about
what the template does is an inference from documentation *about* it, so the first real pipeline
will probably fail on one of exactly three things — the template project path, a stage name the
template does not declare, or a runner tag this project was not given. That is also why the whole
set sits inert: the cost of being wrong is one command's `--revert`, not a broken merge gate.

**Open decisions for the owner, not for a script:** whether the project is onboarded onto SHIP-HATS
at all (this repo is on GitHub today, and SHIP-HATS runs on SGTS GitLab — the pipeline files assume
the repo has been moved or mirrored); whether artefacts are published to Nexus or the GitLab
container registry is enough; whether the testing deploy is allowed to run the Playwright suite
against a box that holds real scans (it writes through the app's own APIs, which is fine on an
ephemeral host and not fine on a shared one); and whether `FOD_*` and `NEXUS_IQ_*` exist for this
project, since their absence is what changes the security posture from Fortify and IQ to GitLab's
native SAST/DAST and dependency scanning.

## 7. Deliberately not done

No `.gitlab-ci.yml` is committed — the point of the exercise is a reviewable proposal that costs
nothing until adopted. No Docker-in-Docker, no privileged runner, no `docker build` (not available).
No Kubernetes variant (`DEPLOY_STRATEGY` will refuse anything but `docker-ssh` and tell you which
two template files to write it from). No Robot Framework adoption. No SLSA provenance, Nexus IQ
policy profile, or Fortify audit-stamp configuration, each of which is an account-level setting
this repo cannot own. And no change to `npm run verify`, which remains the gate the project runs
today and the reason `TEST.gitlab-ci.yml` needs no new commands of its own.
