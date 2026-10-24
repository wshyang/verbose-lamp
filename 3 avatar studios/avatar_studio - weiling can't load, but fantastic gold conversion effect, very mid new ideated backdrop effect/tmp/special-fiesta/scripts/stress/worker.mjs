/**
 * One worker thread runs a slice of the crowd. Three hundred idle-ish sockets fit in a
 * single event loop, but the client must never be the bottleneck being measured: with
 * several threads the harness can still generate a burst while one thread is busy parsing
 * a 60 kB leaderboard.
 *
 * The thread owns its own collector and posts a plain summary home at the end.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { Client, sleep } from './client.mjs';
import { createCollector, record, toSummary } from './metrics.mjs';
import { PERSONAS } from './personas.mjs';

const { config, assignments, world, startAt, deadline } = workerData;
const collector = createCollector();

/** Virtual users arrive over the ramp, the way a field of phones opens the app. */
function arrivalDelay(index, total) {
  if (total <= 1) return 0;
  return Math.round((index / total) * config.rampMs);
}

async function runOne(assignment, index) {
  await sleep(Math.max(0, startAt - Date.now()) + arrivalDelay(index, assignments.length));
  const client = new Client({
    base: config.base,
    collector,
    record,
    actor: assignment.persona,
  });
  const persona = PERSONAS[assignment.persona];
  try {
    await persona({ client, account: assignment.account, config, deadline, world });
  } catch (caught) {
    // A virtual user that throws must not take the rest of the thread down with it.
    record(collector, {
      label: `${assignment.persona} crashed`,
      at: Date.now(),
      ms: 0,
      status: 0,
      ok: false,
      detail: caught instanceof Error ? caught.message : String(caught),
    });
  }
}

const progress = setInterval(() => {
  const done = [...collector.endpoints.values()].reduce((sum, bucket) => sum + bucket.count, 0);
  parentPort.postMessage({ type: 'progress', done });
}, 1000);

await Promise.all(assignments.map((assignment, index) => runOne(assignment, index)));
clearInterval(progress);
parentPort.postMessage({ type: 'done', summary: toSummary(collector) });
