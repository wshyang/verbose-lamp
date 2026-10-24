import { Link, useNavigate } from 'react-router-dom';
import { emptyStates } from '@psd/contracts';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { useNicknameFinder } from '../lib/hooks/useNicknameFinder.js';

/**
 * ADR-164 — "I signed up already, but I can't remember what I called myself."
 *
 * This screen exists to stop a second sign-up. A duplicate cannot be detected when it happens
 * (identity is a nickname and a PIN, and nothing else) and cannot be undone afterwards — the
 * points earned under the first nickname are stranded there permanently — so the only moment
 * it can be addressed at all is right now, with somebody looking at the sign-up form.
 *
 * Which is why the way in is from `/signup`, not only from `/signin`: it has to interrupt the
 * person who is about to create the duplicate, not wait for someone who already knows they
 * have one.
 *
 * Picking a nickname carries it to sign-in rather than signing anybody in. Recognising a
 * nickname is not proof of being its owner — the PIN is — and this list is public.
 */
export function FindNicknamePage() {
  const finder = useNicknameFinder();
  const navigate = useNavigate();
  const hasFilter = finder.filter.trim() !== '';

  return (
    <GameboyShell title="FIND MY NICKNAME" subtitle="Signed up already?" showNav={false}>
      <section className="gb-panel">
        <p>Pick your cluster and look for the nickname you chose.</p>

        <label className="gb-label" htmlFor="finder-cluster">
          Cluster
        </label>
        <select
          id="finder-cluster"
          className="gb-select"
          data-testid="find-nickname__cluster"
          value={finder.clusterCode}
          onChange={(event) => finder.chooseCluster(event.target.value)}
        >
          <option value="">— choose your cluster —</option>
          {finder.clusters.map((cluster) => (
            <option key={cluster.code} value={cluster.code}>
              {cluster.displayName}
            </option>
          ))}
        </select>

        {finder.clusterCode === '' ? null : (
          <>
            <label className="gb-label" htmlFor="finder-filter">
              Does any of it come back to you?
            </label>
            <input
              id="finder-filter"
              className="gb-input"
              data-testid="find-nickname__filter"
              placeholder="Part of the nickname"
              value={finder.filter}
              onChange={(event) => finder.setFilter(event.target.value)}
            />
            <p className="gb-hint">Leave it blank to see the whole cluster.</p>
          </>
        )}
      </section>

      {finder.matches === null ? null : (
        <section className="gb-panel">
          <StateMessage
            isLoading={finder.isLoading}
            error={finder.error}
            isEmpty={finder.matches.length === 0}
            /* Two different nothings: an empty cluster is a quiet morning, an empty filter
               result is a wrong guess, and telling somebody to "try less of it" is only
               useful in the second case. */
            emptyText={hasFilter ? emptyStates.clusterNicknamesFiltered : emptyStates.clusterNicknames}
            testId="find-nickname"
          />
          <ul className="gb-list">
            {finder.matches.map((nickname) => (
              <li key={nickname}>
                <button
                  type="button"
                  className="gb-button gb-button--secondary"
                  data-testid="find-nickname__match"
                  onClick={() => navigate(`/signin?nickname=${encodeURIComponent(nickname)}`)}
                >
                  {nickname}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="gb-panel">
        <p className="gb-hint">
          Found it but forgotten the PIN? Any facilitator can reset it — far better than signing
          up again, which leaves this morning&apos;s points behind.
        </p>
        <Link className="gb-button gb-button--secondary" to="/signin" data-testid="find-nickname__signin">
          Back to sign in
        </Link>
      </section>
    </GameboyShell>
  );
}
