import type { VoidTargetType } from '@psd/contracts';
import { and, desc, eq } from 'drizzle-orm';
import type { Executor } from '../client.js';
import { newId } from '../ids.js';
import { superadminAccounts, voidAuditEntries } from '../schema/index.js';
import type { VoidAuditEntryRow } from '../schema/index.js';
import { firstOrThrow } from '../rows.js';

/** fds.md §2.13 — every void/unvoid transition appends a new row. Nothing here ever updates. */

export interface AuditRecord extends VoidAuditEntryRow {
  performedByUsername: string;
}

export interface NewAuditEntry {
  /** ADR-248 — one list, in `wire.ts`, beside the CHECK in `schema.sql` that enforces it. */
  targetType: VoidTargetType;
  targetId: string;
  action: 'void' | 'unvoid';
  reason: string;
  superadminId: string;
}

export async function appendVoidAudit(
  db: Executor,
  input: NewAuditEntry,
): Promise<VoidAuditEntryRow> {
  return firstOrThrow(await db
    .insert(voidAuditEntries)
    .values({
      id: newId(),
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      reason: input.reason,
      performedBySuperadminId: input.superadminId,
    })
    .returning(), 'Audit insert returned no row');
}

export interface AuditFilters {
  targetType?: NewAuditEntry['targetType'] | undefined;
  targetId?: string | undefined;
  superadminId?: string | undefined;
}

/** S55 — filterable by target, actor or date order. */
export async function listVoidAudit(db: Executor, filters: AuditFilters = {}): Promise<AuditRecord[]> {
  const conditions = [
    filters.targetType ? eq(voidAuditEntries.targetType, filters.targetType) : undefined,
    filters.targetId ? eq(voidAuditEntries.targetId, filters.targetId) : undefined,
    filters.superadminId
      ? eq(voidAuditEntries.performedBySuperadminId, filters.superadminId)
      : undefined,
  ].filter(Boolean);
  const query = db
    .select({
      id: voidAuditEntries.id,
      targetType: voidAuditEntries.targetType,
      targetId: voidAuditEntries.targetId,
      action: voidAuditEntries.action,
      reason: voidAuditEntries.reason,
      performedBySuperadminId: voidAuditEntries.performedBySuperadminId,
      performedByUsername: superadminAccounts.username,
      performedAt: voidAuditEntries.performedAt,
    })
    .from(voidAuditEntries)
    .innerJoin(superadminAccounts, eq(superadminAccounts.id, voidAuditEntries.performedBySuperadminId))
    .orderBy(desc(voidAuditEntries.performedAt));
  return query.where(and(...conditions));
}
