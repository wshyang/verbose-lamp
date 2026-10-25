import type { Actor } from '../lib/session.js';
import type { NewChatMessage } from '../db/entities/index.js';
import { asClusterCode } from '../views/participants.js';

type ChatAuthor = Omit<NewChatMessage, 'body'>;

/**
 * ADR-046 — who a message says it is from, resolved once at write time.
 *
 * The label is copied here rather than joined on read, so a later rename cannot retroactively
 * change what the room saw (AGENTS.md non-negotiable #7). Staff post under their username,
 * which is deliberate in a public room: a facilitator saying "everyone to court 3" should be
 * visibly staff, not an anonymous voice.
 */
export function authorFrom(actor: Actor): ChatAuthor {
  if (actor.type === 'participant') {
    return {
      authorType: 'participant',
      participantId: actor.participant.id,
      facilitatorId: null,
      superadminId: null,
      authorLabelSnapshot: actor.participant.nickname,
      clusterCodeSnapshot: asClusterCode(actor.participant.clusterCode),
    };
  }
  if (actor.type === 'facilitator') {
    return {
      authorType: 'facilitator',
      participantId: null,
      facilitatorId: actor.facilitator.id,
      superadminId: null,
      authorLabelSnapshot: actor.facilitator.username,
      clusterCodeSnapshot: null,
    };
  }
  return {
    authorType: 'superadmin',
    participantId: null,
    facilitatorId: null,
    superadminId: actor.superadmin.id,
    authorLabelSnapshot: actor.superadmin.username,
    clusterCodeSnapshot: null,
  };
}
