import type { VoidTargetType } from '@psd/contracts';
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { superadminAccounts } from './identity.js';

/** fds.md §2.13 #obj-voidauditentry — append-only. Never updated, never deleted. */
export const voidAuditEntries = pgTable('void_audit_entry', {
  id: uuid('id').primaryKey(),
  // ADR-248 — 'awardbatch': a reversed batch is a taken-back decision, which is what this register
  // counts. ADR-270 — the CHECK in schema.sql carries the same values as `VoidTargetType`.
  targetType: text('target_type').$type<VoidTargetType>().notNull(),
  targetId: uuid('target_id').notNull(),
  action: text('action').$type<'void' | 'unvoid'>().notNull(),
  reason: text('reason').notNull(),
  performedBySuperadminId: uuid('performed_by_superadmin_id')
    .notNull()
    .references(() => superadminAccounts.id),
  performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
});

export type VoidAuditEntryRow = typeof voidAuditEntries.$inferSelect;
