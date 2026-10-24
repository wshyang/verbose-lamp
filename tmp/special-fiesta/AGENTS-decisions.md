# AGENTS-decisions.md — living spec + addenda discipline

> Section file of [`AGENTS.md`](AGENTS.md). Adopted from `GREENFIELD.md` §1.

## 1. What is the source of truth

| Artefact | Role |
|---|---|
| [`fds.md`](fds.md) | **The product contract.** Objects, state machines, relationships, 60 surfaces, 50 features, flows, bootstrap, empty states. Stable section numbering — treat it as append-only. |
| [`docs/addenda/ADDENDA.md`](docs/addenda/ADDENDA.md) | **The decision register.** Every decision the FDS does not dictate. Sequentially numbered `ADR-001…`, numbering independent of FDS sections so the base spec stays stable and addenda append forever. |
| `AGENTS*.md` | **How we build.** Conventions and disciplines, not product behaviour. |

The FDS already carries its own `DC-001…DC-006` decision contexts. **Do not renumber or extend
the `DC-` series** — it belongs to the spec's own history. New decisions get `ADR-NNN`.

## 2. When you must write an addendum

Write one whenever a change **is not fully dictated by `fds.md`**:

- filling a gap the spec leaves open (it says *what*, not *how*);
- adding an object, field, endpoint, index, tool or dependency;
- deviating from the spec (say so explicitly, and why);
- choosing between two defensible implementations where a future reader would ask "why?".

You do **not** need one for: straight implementation of a specified surface/feature, renames
that keep behaviour, test additions, or typo fixes.

## 3. How to write one

Append to `docs/addenda/ADDENDA.md`, in this exact shape, **in the same commit as the change**:

```md
### ADR-0NN — <imperative title>

- **Status:** Accepted | Superseded by ADR-0MM
- **Date:** YYYY-MM-DD
- **Relates to:** fds.md §<section> / #<anchor>  (or "gap — spec is silent")
- **Decision:** what was decided, in one or two sentences.
- **Why:** the forces. Include the option(s) rejected and the reason.
- **Impact:** what a future reader must know — schema/API/UI consequences, migration notes,
  what would have to change to reverse it.
```

Rules:

- **Proactive, never retrospective.** An addendum written later is archaeology; written now it
  is a contract. If you find yourself about to write "we should document that", stop and
  document it.
- **One decision per entry.** If the title needs "and", it is two entries.
- Never edit an accepted entry's decision text. Supersede it with a new one and mark the old
  `Superseded by ADR-0MM`.
- **A rename is a register event (ADR-139).** Renaming or deleting something an earlier ADR
  names by hand needs no new addendum, but it does need a row in the **supersession index** at
  the top of `ADDENDA.md`, appended in that same change. The register is append-only, so the
  old entry keeps the old name forever; without the row, the name grepped out of it leads
  nowhere. The same index records a decision superseded only *in part* — say which part.
- Reference the addendum number in the code comment where the surprising thing lives
  (`// ADR-009: offline sync trusts the client's round_ref`).

## 4. Keeping `fds.md` and the code honest

- `fds.md` is the contract; if the implementation must diverge, the divergence is an addendum —
  **do not silently edit the FDS to match the code**.
- Error strings, empty-state copy and validation bounds in the FDS tables are **normative**.
  They live once in `packages/contracts/src/messages.ts` and are imported by both sides. A
  message inlined in a component or a route is a defect.
- Anchors (`#obj-…`, `#surf-…`, `#feat-…`, `#flow-…`) are stable. Cite them in code comments,
  test names and PR descriptions: `// S27 #surf-scan`, `it('F27: rejects duplicate scan …')`.
