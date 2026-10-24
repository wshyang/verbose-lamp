import { messages } from '@psd/contracts';
import { findActivityById, findCurrentRound, findRoundById } from '../db/entities/index.js';
import type { ActivityRecord, RoundRecord } from '../db/entities/index.js';
import { notFound } from '../lib/http.js';
import type { AppContext } from '../lib/session.js';

export interface StationState {
  activity: ActivityRecord;
  currentRound: RoundRecord | null;
}

/** S25 #surf-fringe-station — the activity plus whichever round is open or ended. */
export async function loadStation(c: AppContext, activityId: string): Promise<StationState> {
  const activity = await findActivityById(c.get('db'), activityId);
  if (!activity) throw notFound(messages.activityNotFound);
  const currentRound = await findCurrentRound(c.get('db'), activity.id);
  return { activity, currentRound };
}

export async function loadOpenableRound(c: AppContext, roundId: string): Promise<RoundRecord> {
  const round = await findRoundById(c.get('db'), roundId);
  if (!round) throw notFound(messages.roundNotFound);
  return round;
}
