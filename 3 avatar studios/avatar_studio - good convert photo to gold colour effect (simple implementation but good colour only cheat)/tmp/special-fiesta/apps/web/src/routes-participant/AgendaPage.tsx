import { emptyStates } from '@psd/contracts';
import type { AgendaItemView } from '@psd/contracts';
import { FeedTabs } from './FeedTabs.js';
import { GameboyShell } from '../components/participant/GameboyShell.js';
import { StateMessage } from '../components/shared/StateMessage.js';
import { useAgenda } from '../lib/hooks/useBoard.js';
import { pullHintFor, usePullToRefresh } from '../lib/hooks/usePullToRefresh.js';
import { formatTime } from '../lib/format.js';

/**
 * ADR-177 — the Agenda segment of the Ball tab: the day's run sheet.
 *
 * It lives beside Results and Line-ups rather than in a seventh bottom-bar tab, which is the
 * same call ADR-046 and ADR-125 made for chat and photos. The three belong together: Results is
 * what happened, Line-ups is who plays next, and the Agenda is what the whole afternoon is doing
 * — all three are the question "what is going on, and when".
 *
 * The one row that matters is NOW, so it gets the treatment the Line-ups tab gives the viewer's
 * own team: gold border, tint and a badge, rather than a subtlety the sun would erase. NEXT gets
 * a quieter marker — it is the second question, never the first.
 */
export function AgendaPage() {
  const agenda = useAgenda();
  const pull = usePullToRefresh<HTMLDivElement>(agenda.reload);

  return (
    <GameboyShell title="MATCH FEED" subtitle="Programme for the day">
      <FeedTabs />
      <div
        ref={pull.ref}
        data-testid="agenda__pull"
        style={{
          transform: `translateY(${pull.state.pullPx}px)`,
          transition: pull.state.pullPx === 0 ? 'transform 200ms ease-out' : 'none',
        }}
      >
        {pull.state.pullPx > 0 || pull.state.isRefreshing ? (
          <p className="gb-hint gb-pull__hint" role="status" data-testid="agenda__pull-hint">
            {pullHintFor(pull.state)}
          </p>
        ) : null}
        <section className="gb-panel">
          <StateMessage
            isLoading={agenda.isLoading}
            error={agenda.error}
            isEmpty={agenda.items.length === 0}
            emptyText={emptyStates.agenda}
            testId="agenda"
          />
          {agenda.items.length > 0 ? (
            <ol className="gb-agenda" data-testid="agenda__list">
              {agenda.items.map((item) => (
                <AgendaRow
                  key={item.id}
                  item={item}
                  isNow={item.id === agenda.nowId}
                  isNext={item.id === agenda.nextId}
                />
              ))}
            </ol>
          ) : null}
        </section>
      </div>
    </GameboyShell>
  );
}

/**
 * One line of the programme.
 *
 * A cancelled item is struck through and labelled rather than hidden, which is the point of the
 * whole `is_active` design: somebody who memorised a 3pm item has to find out it is off, and an
 * item that silently vanishes tells them nothing except that they misremembered.
 */
function AgendaRow(props: { item: AgendaItemView; isNow: boolean; isNext: boolean }) {
  const { item, isNow, isNext } = props;
  const classNames = ['gb-agenda__item'];
  if (isNow) classNames.push('gb-agenda__item--now');
  if (!item.isActive) classNames.push('gb-agenda__item--off');

  return (
    <li className={classNames.join(' ')} data-testid="agenda__item">
      <span className="gb-agenda__when">{timeRangeOf(item)}</span>
      <span className="gb-agenda__what">
        <span className="gb-agenda__title">{item.title}</span>
        {isNow ? <span className="gb-badge">NOW</span> : null}
        {isNext ? <span className="gb-agenda__next">Up next</span> : null}
        {item.isActive ? null : <span className="gb-badge gb-badge--off">CANCELLED</span>}
        {item.location ? <span className="gb-agenda__where">{item.location}</span> : null}
        {item.detail ? <span className="gb-hint">{item.detail}</span> : null}
      </span>
    </li>
  );
}

/**
 * The clock column.
 *
 * Three shapes, because the run sheet really has all three: a block ("2.30pm – 4.30pm"), a
 * moment ("1.45pm"), and an item with no time at all, which gets an em dash rather than a
 * fabricated one. The server sends ISO instants and the formatting happens here, so the time a
 * participant reads is their own device's rendering of it.
 */
function timeRangeOf(item: AgendaItemView): string {
  if (!item.startsAt) return '—';
  if (!item.endsAt) return formatTime(item.startsAt);
  return `${formatTime(item.startsAt)} – ${formatTime(item.endsAt)}`;
}
