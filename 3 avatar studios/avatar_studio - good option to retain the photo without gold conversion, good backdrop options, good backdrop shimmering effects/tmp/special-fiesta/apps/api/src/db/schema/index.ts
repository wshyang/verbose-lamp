/** Barrel for the Drizzle schema, split per domain (AGENTS-function-design.md §6). */
export * from './identity.js';
export * from './teams.js';
export * from './pointConfig.js';
export * from './fringe.js';
export * from './audit.js';
export * from './awards.js';
export * from './chat.js';
export * from './gallery.js';
export * from './swag.js';
export * from './agenda.js';
// ADR-275 — the rebuilt tournament: core, scheduler and points-bridge tables.
export * from './tournament.js';
