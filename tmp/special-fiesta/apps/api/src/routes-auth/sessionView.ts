import type { SessionView } from '@psd/contracts';
import type { Actor } from '../lib/session.js';
import { participantView } from '../views/participants.js';

export interface SessionViewInput {
  actor: Actor;
  stationLabel: string | null;
}

/** F3/F19/F20 — one shape the web app reads on boot to know who it is talking to. */
export function sessionView(input: SessionViewInput): SessionView {
  const { actor } = input;
  if (actor.type === 'participant') {
    return { actorType: 'participant', participant: participantView(actor.participant) };
  }
  if (actor.type === 'superadmin') {
    return {
      actorType: 'superadmin',
      staff: { id: actor.superadmin.id, username: actor.superadmin.username, displayLabel: null },
    };
  }
  return {
    actorType: 'facilitator',
    staff: {
      id: actor.facilitator.id,
      username: actor.facilitator.username,
      displayLabel: actor.facilitator.displayLabel,
    },
    defaultStation: {
      type: actor.facilitator.defaultStationType,
      id: actor.facilitator.defaultStationId,
      label: input.stationLabel,
    },
  };
}
