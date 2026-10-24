import type { PassportView } from '@psd/contracts';
import type { ActivityRecord } from '../db/entities/activities.js';

export interface PassportViewInput {
  activities: readonly ActivityRecord[];
  /** Counted scans per station for this participant; an absent station has none. */
  completionCounts: ReadonlyMap<string, number>;
}

/**
 * ADR-239 — the station list, each station marked with whether this participant has completed
 * it. The list keeps the order the facilitators see, so the two screens cannot disagree about
 * which station is which. ADR-261 — each station also carries how many times it was completed:
 * the tab shows one chop per completion, stacked on the same slot.
 */
export function passportView(input: PassportViewInput): PassportView {
  return {
    stations: input.activities.map((activity) => {
      const completions = input.completionCounts.get(activity.id) ?? 0;
      return {
        activityId: activity.id,
        activityName: activity.activityName,
        isCompleted: completions > 0,
        completions,
      };
    }),
  };
}
