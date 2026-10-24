import { messages, voidRequestSchema } from '@psd/contracts';
import { Hono } from 'hono';
import {
  appendVoidAudit,
  findScanById,
  findSwagClaimById,
  requireScanRecord,
  requireSwagClaimRecord,
  listScans,
  listSwagClaims,
  listVoidAudit,
  setScanVoided,
  setSwagClaimVoided,
} from '../db/entities/index.js';
import { notFound, readBody, requireParam } from '../lib/http.js';
import { requireSuperadmin, type AppBindings, type AppContext } from '../lib/session.js';
import { auditView, scanView } from './views.js';
import { swagClaimView } from '../views/swag.js';

/**
 * F45–F46, F50 — corrections with a full audit trail (S50–S51, S55).
 * Every void/unvoid writes a NEW VoidAuditEntry; nothing is ever rewritten (fds.md §2.13).
 *
 * ADR-270 — the match corrections (F42–F44) left with the old tournament; the rebuilt tournament
 * carries its own correction desk.
 */
export function superadminCorrectionRoutes(): Hono<AppBindings> {
  const routes = new Hono<AppBindings>();
  registerScanCorrections(routes);
  registerSwagClaimCorrections(routes);
  registerAuditReads(routes);
  return routes;
}

/** F45–F46 — S50–S51 scan corrections. */
function registerScanCorrections(routes: Hono<AppBindings>): void {
  routes.get('/scans', async (c) => {
    requireSuperadmin(c);
    const scans = await listScans(c.get('db'), {
      activityId: c.req.query('activityId'),
      participantId: c.req.query('participantId'),
      roundId: c.req.query('roundId'),
    });
    return c.json({ items: scans.map(scanView) });
  });

  routes.post('/scans/:scanId/void', async (c) => {
    return applyScanVoid(c, { action: 'void' });
  });

  routes.post('/scans/:scanId/unvoid', async (c) => {
    return applyScanVoid(c, { action: 'unvoid' });
  });

}

/**
 * ADR-159 — the swag counter's claims, reversible at last.
 *
 * Deliberately the same shape as the scan corrections above rather than a new idea: a
 * filterable list, a void, an unvoid, each carrying a reason into the same append-only
 * ledger. The design doc called this the asymmetry that would bite — every other recorded
 * fact on the day could be taken back and a handout could not, so the remedy for a wrong
 * scan was a points adjustment that restored neither the allowance nor the stock.
 *
 * Unvoid exists for the same reason it does for scans: a void entered against the wrong row
 * is itself a mistake, and a correction path that cannot be corrected makes people hesitate
 * to use it.
 */
function registerSwagClaimCorrections(routes: Hono<AppBindings>): void {
  routes.get('/swag-claims', async (c) => {
    requireSuperadmin(c);
    const claims = await listSwagClaims(c.get('db'), {
      stationId: c.req.query('stationId'),
      participantId: c.req.query('participantId'),
      roundId: c.req.query('roundId'),
    });
    return c.json({ items: claims.map(swagClaimView) });
  });

  routes.post('/swag-claims/:claimId/void', async (c) => {
    return applySwagClaimVoid(c, { action: 'void' });
  });

  routes.post('/swag-claims/:claimId/unvoid', async (c) => {
    return applySwagClaimVoid(c, { action: 'unvoid' });
  });
}

async function applySwagClaimVoid(c: AppContext, input: { action: 'void' | 'unvoid' }) {
  const actor = requireSuperadmin(c);
  const body = await readBody(c, voidRequestSchema);
  const claimId = requireParam(c, 'claimId');
  const claim = await findSwagClaimById(c.get('db'), claimId);
  if (!claim) throw notFound(messages.swagClaimNotFound);
  await setSwagClaimVoided(c.get('db'), { claimId, isVoided: input.action === 'void' });
  await appendVoidAudit(c.get('db'), {
    targetType: 'swagclaim',
    targetId: claimId,
    action: input.action,
    reason: body.reason,
    superadminId: actor.superadmin.id,
  });
  return c.json({ claim: swagClaimView(await requireSwagClaimRecord(c.get('db'), claimId)) });
}

/** F50 — S55 #surf-void-audit-log. */
function registerAuditReads(routes: Hono<AppBindings>): void {
  routes.get('/void-audit', async (c) => {
    requireSuperadmin(c);
    const entries = await listVoidAudit(c.get('db'), {
      targetType: c.req.query('targetType') as 'fringescan' | 'swagclaim' | 'awardbatch' | undefined,
      targetId: c.req.query('targetId'),
      superadminId: c.req.query('superadminId'),
    });
    return c.json({ items: entries.map(auditView) });
  });
}

async function applyScanVoid(c: AppContext, input: { action: 'void' | 'unvoid' }) {
  const actor = requireSuperadmin(c);
  const body = await readBody(c, voidRequestSchema);
  const scanId = requireParam(c, 'scanId');
  const scan = await findScanById(c.get('db'), scanId);
  if (!scan) throw notFound(messages.notFound);
  await setScanVoided(c.get('db'), { scanId, isVoided: input.action === 'void' });
  await appendVoidAudit(c.get('db'), {
    targetType: 'fringescan',
    targetId: scanId,
    action: input.action,
    reason: body.reason,
    superadminId: actor.superadmin.id,
  });
  return c.json({ scan: scanView(await requireScanRecord(c.get('db'), scanId)) });
}
