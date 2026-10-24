-- PSD Active Day — tier 2 of the data story (ADR-102): the DEFAULT SEED.
--
-- What EVERY install starts with, and nothing more: the initial superadmin and the named
-- facilitator accounts. Catalogue rows (clusters, participant titles) are deliberately NOT
-- here — they are derived from `@psd/contracts` constants by `db/seed.ts`, so the code that
-- validates a cluster code and the rows it validates against cannot drift apart.
--
-- The two placeholders are rendered by `db/seed.ts` from SUPERADMIN_INITIAL_USERNAME and
-- SUPERADMIN_INITIAL_PASSCODE before this file runs; credentials never live in the repo.
--
-- Account ids are FIXED, on purpose: tier 3 (`seed-demo.sql`, a recorded demo day) references
-- these actors by uuid, and a demo dump only replays cleanly if the accounts it points at have
-- the same ids on every install.
--
-- Every statement is guarded, so re-running on every boot is safe (ADR-049's idempotency rule).

BEGIN;

-- The initial superadmin (fds.md §8.3) — only when no superadmin exists at all, so a renamed
-- or rotated account is never resurrected by a restart.
INSERT INTO superadmin_account (id, username, passcode)
SELECT '5ad00000-0000-4000-8000-000000000001', __SUPERADMIN_USERNAME__, __SUPERADMIN_PASSCODE__
WHERE NOT EXISTS (SELECT 1 FROM superadmin_account);

-- AGENTS-database.md §2 — automated writes reference a real actor row, never the string
-- 'system'. The account carries an unusable passcode so it can never be signed into.
INSERT INTO facilitator_account (id, username, passcode, display_label, default_station_type)
SELECT 'fac10000-0000-4000-8000-000000000000', 'system', '0000', 'System', 'none'
WHERE NOT EXISTS (SELECT 1 FROM facilitator_account WHERE lower(username) = 'system');

-- The named marshal accounts an event starts from (passcodes are rotated by the superadmin
-- on S44 before the real day).
INSERT INTO facilitator_account (id, username, passcode, display_label, default_station_type)
SELECT 'fac10000-0000-4000-8000-000000000001', 'court1', '1111', 'Court 1 marshal', 'none'
WHERE NOT EXISTS (SELECT 1 FROM facilitator_account WHERE lower(username) = 'court1');

INSERT INTO facilitator_account (id, username, passcode, display_label, default_station_type)
SELECT 'fac10000-0000-4000-8000-000000000002', 'fringe1', '1111', 'Volleyball marshal', 'none'
WHERE NOT EXISTS (SELECT 1 FROM facilitator_account WHERE lower(username) = 'fringe1');

INSERT INTO facilitator_account (id, username, passcode, display_label, default_station_type)
SELECT 'fac10000-0000-4000-8000-000000000003', 'fringe2', '1111', 'Tug of war marshal', 'none'
WHERE NOT EXISTS (SELECT 1 FROM facilitator_account WHERE lower(username) = 'fringe2');

COMMIT;
