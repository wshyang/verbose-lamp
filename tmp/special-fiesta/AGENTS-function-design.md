# AGENTS-function-design.md — function design and module structure

> Section file of [`AGENTS.md`](AGENTS.md). Adopted from `GREENFIELD.md` §6–7.
> Machine-enforced by `eslint.config.js` and `scripts/check-standards.mjs`.

## 1. Function size and extraction

- **≤ 20 lines** target per function body; **50 lines hard limit** (ESLint
  `max-lines-per-function`).
- If a block needs a comment to explain *what* it does, extract it as a named function. Comments
  explain **why**, never what.
- One thing, at one level of abstraction. Orchestration and implementation detail do not share
  a function body.

## 2. Guard clauses over nesting

- Exit early at the top. Never nest `if/if` to reach the happy path.
- **Maximum nesting depth 3** (ESLint `max-depth`). Beyond that, extract.

```ts
// good
if (!session) return unauthorized(c);
if (!team) return notFound(c, messages.teamNotFound);
if (!isCaptain(session, team)) return forbidden(c);
return ok(c, await teams.lock(team));
```

## 3. Parameters

- **≤ 3 parameters** (ESLint `max-params`). Beyond that, introduce a typed Parameter Object.
- **No boolean/flag parameters.** `setLock(team, true)` becomes `lockTeam(team)` /
  `unlockTeam(team)`. Enforced by `check-standards.mjs`.
- **Preserve Whole Object:** pass the domain object, not three fields pulled off it.

## 4. Naming

- Names reveal intent; rename liberally as understanding sharpens.
- Booleans: `is` / `has` / `should` / `can`.
- Functions: verb + noun — `getParticipant`, `validateJoinCode`, `awardScanPoints`.
- **No abbreviations in domain code.** `facilitator`, not `fac`; `participant`, not `p`. (The
  FDS's own `S27`/`F23` anchors are fine in comments and test names — they are citations.)

## 5. Encapsulation and mutation

- **Never mutate in place.** Produce a new object: `{ ...match, status: 'completed' }`.
  No `push`/`splice`/property assignment on a value you did not just create.
- **Separate Query from Modifier.** A function either returns a value **or** causes an effect.
  `completeMatch()` writes and returns the fresh row read back — that is one effect plus its
  receipt, not a query pretending to be pure.
- Mutable state lives behind a function boundary, never as an exported mutable binding.

## 6. Module and directory structure

- **Group by domain feature, not by type:** `routes-tournament/`, `db/entities/teams.ts` —
  never `controllers/`, `models/`, `services/`.
- Files **≤ 400 LOC typical, 800 LOC hard limit** (ESLint `max-lines`). Split before merge.
- Splitting uses the **barrel pattern**: extract per-domain files, leave
  `export * from './sub/index.ts'` behind — zero call-site churn.
- No circular dependencies between peer-domain files (`check-standards.mjs` walks the import
  graph).
- One concern per file. The file name is the contract.

## 7. Code smell → remedy

| Smell | Remedy |
|---|---|
| Long Function (> 50 lines) | Extract Function |
| Deep Nesting (> 3 levels) | Guard Clauses |
| Long Parameter List (> 3) | Introduce Parameter Object |
| Boolean parameter | Remove Flag Argument (two named functions) |
| Feature Envy | Move Function |
| Message Chain | Hide Delegate |
| God Module (> 800 lines) | Per-domain split + barrel |
| Mutable Data | Encapsulate Variable, Separate Query from Modifier |
| Duplicated Code | Extract Function |
| Logic inside JSX (`filter`/`reduce` in the `return`) | Named binding above the return, or move to the hook |
| Same derivation computed twice in one expression | Introduce Explaining Variable |
| Fat inline `onChange`/`onClick` with a branch or computation | Extract Function (or move to the hook if it touches server data) |
| Speculative Generality | Remove (YAGNI) |
| Hand-written row↔domain mapper | Delete it; let Drizzle map (`AGENTS-database.md` §1) |
| Sentinel actor string (`'system'`) | Real actor row + FK |

Source: Martin Fowler's *Refactoring* (2nd ed.) via
[5-minutes-or-less-refactoring](https://github.com/mikaelvesavuori/5-minutes-or-less-refactoring).

## 8. What the gates actually check

`npm run lint` (ESLint 9 flat config):
`max-lines: 800` · `max-lines-per-function: 50` · `max-depth: 3` · `max-params: 3` ·
`complexity: 12` · `no-param-reassign` · `prefer-const` · `no-var` ·
`@typescript-eslint/no-explicit-any` · `no-restricted-syntax` for `DELETE`-style repo names.

`npm run standards` (`scripts/check-standards.mjs`) checks what a linter cannot see:
no API import inside `components/` · no `filter`/`reduce`/`sort`/`find`/`some`/`every` inside a
JSX `return` · `data-testid` on interactive elements · no hand-written mappers · UUIDs minted
only in `db/ids.ts` · user-facing strings imported from `@psd/contracts` · snapshot+migration
twins · no avatars on admin surfaces · no boolean literal arguments · the SHIP-HATS pipeline set is
complete, every `@@PLACEHOLDER@@` in it has a prompt in the activator's schema, and no live pipeline
file keeps a placeholder or has dropped one of the three local includes (`GREENFIELD.md` §9.3,
ADR-243).
