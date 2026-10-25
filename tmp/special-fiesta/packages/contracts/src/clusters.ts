/**
 * fds.md §2.2 #obj-cluster — the agency clusters.
 *
 * ADR-172 — this list is now the **bootstrap seed**, not the catalogue. It is what an empty
 * database starts life with; from then on the `cluster` table is the truth and a superadmin may
 * add to it, rename what it shows, and retire what is no longer used. The constant stays because
 * something has to go into an empty database, and because every test that wants a believable
 * cluster should keep naming a real one.
 *
 * It is deliberately NOT a `z.enum` source any more. While it was, the set of acceptable clusters
 * was fixed at compile time, so a cluster added at run time would have been rejected by the very
 * validator that was supposed to admit it. Display names start equal to the codes by ADR-007.
 */

export const CLUSTER_SEED_CODES = [
  'BP',
  'CentEx',
  'CHROO',
  'Comms',
  'CS',
  'Cumulus',
  'HI',
  'HRP',
  'HRPS',
  'ITC',
  'LDS',
  'OLI',
  'PCG',
  'PSC Sect',
  'PST',
  'ServiceSG',
  'SPR',
  'WD',
] as const;

/**
 * ADR-172 — a cluster code is now any string the catalogue holds, not one of sixteen literals.
 *
 * This alias is kept rather than replaced with bare `string` at ~55 call sites, because the name
 * is the documentation: it says "this string is a key into the cluster catalogue", which
 * `string` does not. What it no longer does is make the compiler check the value, so the check
 * moved to where it can see the catalogue — the database, via the foreign key, and
 * `assertClusterUsable` on the way in.
 */
export type ClusterCode = string;

/**
 * Kept as the former name so the seed and the tests that reach for "a real cluster" read the
 * same as they always did.
 */
export const CLUSTER_CODES = CLUSTER_SEED_CODES;

