# Addenda register

Append-only decision log required by `CLAUDE.md` §1. Each addendum is independent of the base-spec numbering; the base spec (`docs/GATSBY_TITLE_SEQUENCE_FDS.md`) stays stable. Format: ADR-style with decision, why, related spec sections, impact, verification and rollback.

| No. | Date | Title | Status | Related spec |
|---|---|---|---|---|
| [0001](addenda/0001-adopt-greenfield-discipline.md) | 2026-10-23 | Adopt Greenfield as repository coding discipline | Accepted | all |
| [0002](addenda/0002-configurable-frame-intricacy.md) | 2026-10-23 | Configurable, mathematically derived frame intricacy | Accepted; partly superseded by 0003 | FDS §4.4, §6.3, §8.2, §8.7 |
| [0003](addenda/0003-base-architecture-genome.md) | 2026-10-23 | Tunable base architecture: motif genome and recursive (fractal) rules | Accepted | FDS §4.4, §6.3, §8.2; 0002 |
| [0004](addenda/0004-poster-frame-family.md) | 2026-10-23 | One-sheet poster frame as a selectable frame family | Accepted; surface relabelled by 0005 | FDS §4.4, §8.2; 0002, 0003 |
| [0005](addenda/0005-poster-edge-border-and-harmonised-studio.md) | 2026-10-23 | Poster edge border, and a harmonised Frame Studio | Accepted | FDS §4.4, §7, §8.2; 0002–0004 |

Vendored upstream: `vendor/greenfield` (pinned, read-only). Local deviations from upstream are recorded in this register, not in the vendored copy.
