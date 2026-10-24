import { useCallback, useEffect, useState } from "react";
import type { TournamentModeView } from "@psd/contracts";
import { askToSwitch, fetchTournamentMode } from "../api/stations.js";
// ADR-009's idempotency key, minted where this app is allowed to mint one.
import { newClientScanUuid } from "../offline/scanQueue.js";
import { describeError } from "./useAsyncData.js";

/**
 * ADR-336 §5.4 — the facilitator's half of the switch: what the room is doing on this court, and the
 * ask if the day is still playing fixtures.
 *
 * The ask is deliberately not a button that switches anything: it names a person and a reason, and it
 * waits for the desk. Polled, because a marshal holds the phone in their hand and the answer changes
 * without them touching it — the desk may decline, or the day may switch from another court's ask.
 *
 * ADR-342 — the ask never expires, and a decline comes back with its reason: the marshal learns why
 * rather than watching their words vanish. A key is one question's lifetime — once this marshal's
 * question has been answered, its row keeps the key forever, so the next press mints a fresh one
 * (ADR-009's replay stays true for the case it exists for: a double tap on a live question).
 */

/** How often a court page re-asks the mode. The room changes on a person's timescale, not a clock's. */
export const MODE_POLL_MS = 15_000;

/** No court id means the question is about the venue: every court, asked from the station picker. */
export function useModeAsk(courtId?: string) {
  const [view, setView] = useState<TournamentModeView | null>(null);
  const [reason, setReason] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key per unanswered question: a retried press on a dropped connection returns the same ask
  // rather than a second one for the desk to read. An answered question needs a new key, which `ask`
  // mints — a reload mints a new one too, which is the same rule.
  const [clientUuid, setClientUuid] = useState(newClientScanUuid);
  // The answer this page has already accounted for. Undefined until the first read lands: an answer
  // that was waiting when the page opened is history, not news, and is not surfaced — only an answer
  // that arrives while the marshal is holding the phone closes the loop out loud.
  const [seenAnswerId, setSeenAnswerId] = useState<string | undefined>(
    undefined,
  );

  const load = useCallback(async () => {
    try {
      const next = await fetchTournamentMode(courtId);
      setView(next);
      setSeenAnswerId((seen) =>
        seen === undefined ? (next.lastAnswer?.id ?? undefined) : seen,
      );
    } catch (caught) {
      setError(describeError(caught));
    }
  }, [courtId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), MODE_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const ask = useCallback(async (): Promise<boolean> => {
    if (reason.trim() === "") return false;
    setIsBusy(true);
    setError(null);
    // ADR-342 — a new question needs a new key once the old one was answered, declined or confirmed.
    const key = view?.lastAnswer == null ? clientUuid : newClientScanUuid();
    setClientUuid(key);
    try {
      const next = await askToSwitch({
        reason: reason.trim(),
        ...(courtId === undefined ? {} : { courtId }),
        clientUuid: key,
      });
      setView(next);
      setReason("");
      return true;
    } catch (caught) {
      setError(describeError(caught));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [clientUuid, courtId, reason, view]);

  /** A decline nobody has dismissed yet, delivered while this page was open. Null once read. */
  const declinedAnswer =
    view?.lastAnswer != null &&
    view.lastAnswer.resolution === "declined" &&
    view.lastAnswer.id !== seenAnswerId
      ? view.lastAnswer
      : null;
  const dismissDeclined = useCallback(() => {
    setSeenAnswerId((seen) =>
      view?.lastAnswer != null && view.lastAnswer.resolution === "declined"
        ? view.lastAnswer.id
        : seen,
    );
  }, [view]);

  return {
    mode: view?.mode ?? "fixtures",
    isAwarding: view?.isAwarding ?? false,
    pendingRequest: view?.pendingRequest ?? null,
    declinedAnswer,
    dismissDeclined,
    reason,
    setReason,
    ask,
    isBusy,
    error,
  };
}

export type ModeAsk = ReturnType<typeof useModeAsk>;
