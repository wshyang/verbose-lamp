import { useCallback, useState } from "react";
import {
  messages,
  type AwardTier,
  type ModeRequestView,
  type TournamentOperatingMode,
} from "@psd/contracts";
import * as desk from "../api/tournament.js";
// ADR-009's idempotency key, minted by the one module in this app allowed to mint one. The switch
// needs what a queued scan needs: a retry must be an acknowledgement, never a second act.
import { newClientScanUuid as newClientRequestUuid } from "../offline/scanQueue.js";
import { describeError } from "./useAsyncData.js";
import type { TournamentDesk } from "./useTournamentDesk.js";

/**
 * ADR-336 §5 — the desk's switch form.
 *
 * The one act in the app that cannot be undone, so the form asks for two things a slip cannot supply:
 * a typed word and a reason. The tiers open at what the day's own paid rates already are (§4) — the
 * desk may correct them, and what it confirms is what the award day starts with.
 *
 * The client id is minted when the form opens, not when it is confirmed: a second click, a retried
 * request or a page reload mid-flight all replay the first switch rather than starting a second day.
 * It is replaced only when the form is opened again, which is the point at which the desk is choosing
 * a new act.
 */

export interface TierDraft {
  label: string;
  points: string;
}

export const SWITCH_WORD = "switch";

function draftOf(tiers: readonly AwardTier[]): TierDraft[] {
  return tiers.map((tier) => ({
    label: tier.label,
    points: String(tier.points),
  }));
}

/** A tier set the API will accept: at least one, integral points in the bounds the schema enforces. */
export function tiersOrNull(drafts: readonly TierDraft[]): AwardTier[] | null {
  const kept = drafts.filter((draft) => draft.label.trim() !== "");
  if (kept.length === 0 || kept.length > 8) return null;
  const tiers: AwardTier[] = [];
  for (const draft of kept) {
    const points = Number(draft.points.trim());
    if (!Number.isInteger(points) || points < 1 || points > 100) return null;
    if (
      tiers.some(
        (tier) => tier.label.toLowerCase() === draft.label.trim().toLowerCase(),
      )
    )
      return null;
    tiers.push({ label: draft.label.trim(), points });
  }
  return tiers;
}

export function useTournamentSwitch(deskState: TournamentDesk) {
  const { perform } = deskState;
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [word, setWord] = useState("");
  const [tiers, setTiers] = useState<TierDraft[]>([]);
  const [clientUuid, setClientUuid] = useState("");
  // ADR-336 §5.4 — the ask being answered, when the desk opened the form from the banner. ADR-342 —
  // the whole ask travels with it, because a confirm that cannot see how long the question has
  // waited is the clock this ruling replaced with the desk's own eyes.
  const [reviewing, setReviewing] = useState<ModeRequestView | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Opens the form. Given an ask, the desk is reviewing a marshal's question rather than starting a
   * switch of its own: the ask's reason is the starting point and the switch answers that ask, so the
   * banner clears with the same commit.
   */
  const open = useCallback(
    (request?: ModeRequestView) => {
      setReason(request?.reason ?? "");
      setReviewing(request ?? null);
      setWord("");
      setTiers(draftOf(deskState.suggestedTiers));
      setClientUuid(newClientRequestUuid());
      setError(null);
      setIsOpen(true);
    },
    [deskState.suggestedTiers],
  );

  const close = useCallback(() => {
    setIsOpen(false);
    setError(null);
  }, []);

  const patchTier = useCallback((index: number, patch: Partial<TierDraft>) => {
    setTiers((current) =>
      current.map((tier, at) => (at === index ? { ...tier, ...patch } : tier)),
    );
  }, []);

  const addTier = useCallback(
    () => setTiers((current) => [...current, { label: "", points: "" }]),
    [],
  );
  const removeTier = useCallback(
    (index: number) =>
      setTiers((current) => current.filter((_tier, at) => at !== index)),
    [],
  );

  const settled = tiersOrNull(tiers);
  const isReady =
    word.trim().toLowerCase() === SWITCH_WORD &&
    reason.trim() !== "" &&
    settled !== null;

  const confirm = useCallback(async (): Promise<boolean> => {
    if (!isReady || settled === null) {
      setError(
        word.trim().toLowerCase() !== SWITCH_WORD
          ? messages.modeSwitchNeedsWord
          : messages.tierListInvalid,
      );
      return false;
    }
    setIsPending(true);
    setError(null);
    try {
      const worked = await perform(() =>
        desk.switchToAwards({
          reason: reason.trim(),
          confirmation: word.trim(),
          clientUuid,
          tiers: settled,
          ...(reviewing === null ? {} : { requestId: reviewing.id }),
        }),
      );
      if (worked) setIsOpen(false);
      return worked;
    } catch (caught) {
      setError(describeError(caught));
      return false;
    } finally {
      setIsPending(false);
    }
  }, [clientUuid, isReady, perform, reason, reviewing, settled, word]);

  return {
    isOpen,
    open,
    close,
    reviewing,
    reason,
    setReason,
    word,
    setWord,
    tiers,
    patchTier,
    addTier,
    removeTier,
    isReady,
    isPending,
    error,
    confirm,
  };
}

export type TournamentSwitch = ReturnType<typeof useTournamentSwitch>;

/**
 * ADR-336 §6.3 — the desk's own sentence for the mode, and what it is waiting for.
 *
 * The two are one question ("what is the room doing right now"), so they are one named input rather
 * than a mode plus a boolean whose meaning depends on which mode it came with.
 */
export function modeLine(input: {
  mode: TournamentOperatingMode;
  isDraining: boolean;
}): string {
  if (input.mode === "fixtures") return "The day is playing fixtures.";
  if (input.mode === "switching" && input.isDraining) {
    return "Courts are awarding points — the matches still on court finish first.";
  }
  return "Courts are awarding points.";
}
