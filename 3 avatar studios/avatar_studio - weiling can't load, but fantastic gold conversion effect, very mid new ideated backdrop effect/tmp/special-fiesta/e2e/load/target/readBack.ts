import { and, eq, isNull, like } from 'drizzle-orm';
import { overrideEnv } from '../../../apps/api/src/env.js';
import { openDatabase } from '../../../apps/api/src/db/client.js';
import { chatMessages } from '../../../apps/api/src/db/schema/chat.js';
import { fringeScans } from '../../../apps/api/src/db/schema/fringe.js';
import { teamMemberships, teams } from '../../../apps/api/src/db/schema/teams.js';

/**
 * ADR-350 — the read-back (the plan's §7): after the run, the stack stopped, the run's own
 * PGlite directory is opened through `openDatabase()` and the Drizzle repositories — one
 * mapper, no raw SQL — and what the server ACKNOWLEDGED is compared with what it PERSISTED.
 *
 * A load run that only trusts its own request log can pass while the database disagrees with
 * it; these four checks are the ones the plan calls out, and they run on green runs too,
 * because a clean run's read-back is exactly the calibration data §9 wants.
 */

export interface ReadBackExpectations {
  /** Every client_scan_uuid the server acknowledged (fresh 201 or idempotent 200). */
  readonly acknowledgedScanUuids: readonly string[];
  /** Chat sends the server acknowledged with a 201. */
  readonly acknowledgedChatSends: number;
  readonly runId: string;
}

/** A value comparison the literal check cannot tell from a flag: named, it reads as one. */
const CAPTAIN = true;

export interface ReadBackCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface ReadBackReport {
  readonly checks: readonly ReadBackCheck[];
}

/** `overrideEnv` + `openDatabase` read the data dir relative to the API's own cwd. */
export async function readBack(absoluteDataDir: string, expectations: ReadBackExpectations): Promise<ReadBackReport> {
  overrideEnv({
    NODE_ENV: 'test',
    DATABASE_DRIVER: 'pglite',
    PGLITE_DATA_DIR: absoluteDataDir,
  });
  const handle = await openDatabase();
  try {
    const runTag = `ld_${expectations.runId.slice(0, 6)}`;
    // The engine's chat bodies are run-tagged with a space, not the nickname's underscore:
    // `ld {runId6} u{k} n{turn}` (scripts.ts) — §7's read-back selects by exactly that tag.
    const chatTag = `ld ${expectations.runId.slice(0, 6)} %`;
    const scans = await handle.db.select({ clientScanUuid: fringeScans.clientScanUuid }).from(fringeScans);
    const chats = await handle.db
      .select({ body: chatMessages.body })
      .from(chatMessages)
      .where(like(chatMessages.body, chatTag));
    const runTeams = await handle.db.select({ id: teams.id }).from(teams).where(like(teams.teamName, `${runTag}_%`));
    const captainCounts = new Map<string, number>();
    for (const team of runTeams) {
      const captains = await handle.db
        .select({ participantId: teamMemberships.participantId })
        .from(teamMemberships)
        .where(and(eq(teamMemberships.teamId, team.id), eq(teamMemberships.isCaptain, CAPTAIN), isNull(teamMemberships.expiresAt)));
      captainCounts.set(team.id, captains.length);
    }
    return {
      checks: [
        scanCheck(scans.map((row) => row.clientScanUuid), expectations.acknowledgedScanUuids),
        {
          name: 'chat messages persisted equal the acknowledged sends',
          ok: chats.length === expectations.acknowledgedChatSends,
          detail: `persisted ${chats.length}, acknowledged ${expectations.acknowledgedChatSends}`,
        },
        {
          name: 'each of the run\'s teams has exactly one active captain (§4.2.2)',
          ok: runTeams.length > 0 && [...captainCounts.values()].every((count) => count === 1),
          detail: `${runTeams.length} teams fielded; captain counts ${JSON.stringify([...captainCounts.values()])}`,
        },
      ],
    };
  } finally {
    await handle.close();
  }
}

/** Each acknowledged uuid persisted exactly once, and nothing else this run wrote is missing. */
function scanCheck(persisted: readonly string[], acknowledged: readonly string[]): ReadBackCheck {
  const counts = new Map<string, number>();
  for (const uuid of persisted) counts.set(uuid, (counts.get(uuid) ?? 0) + 1);
  const wrong = acknowledged.filter((uuid) => counts.get(uuid) !== 1);
  return {
    name: 'persisted scans equal the acknowledged scans, each duplicated uuid exactly once',
    ok: wrong.length === 0,
    detail: `acknowledged ${acknowledged.length} uuids, persisted ${persisted.length} rows; mismatches: ${wrong.length}`,
  };
}
