"""Per-sheet extraction configuration (CLAUDE §12.2).

Ignore regions are fractions (x0, y0, x1, y1) covering text baked into a
sheet; components whose centre falls inside are never extracted. Regions
tile each sheet into sprite classes with their own grouping radius (splash
droplets need a wide radius; dense character rows need almost none) and
naming scheme, verified by `extract_sprites.py --debug` overlays.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Region:
    name: str                       # sprite class / output subdir
    rect: tuple[float, float, float, float]  # fractions of sheet size
    naming: str = "numbered"        # numbered | list | grid
    prefix: str = ""
    names: tuple[str, ...] = ()     # for list naming (reading order)
    rows: tuple[str, ...] = ()      # for grid naming
    cols: tuple[str, ...] = ()      # for grid naming
    rows_cols: tuple[tuple[str, ...], ...] = ()  # per-row col labels
    group_radius: int = -1          # -1 = sheet default
    min_area: int = -1


@dataclass(frozen=True)
class Sheet:
    source: str                     # path under src/images/
    slug: str
    group_radius: int
    min_area: int
    row_tolerance: int
    ignore: tuple[tuple[float, float, float, float], ...] = ()
    regions: tuple[Region, ...] = field(default_factory=tuple)


FULL = (0.0, 0.0, 1.0, 1.0)

CHAR_COLS_12 = ("idle-front", "idle-back", "side-right", "side-left",
                "run-left", "run-right", "cheer-front", "cheer-back",
                "reach-right", "reach-left", "celebrate-front", "celebrate-back")
CHAR_COLS_13 = ("idle-front", "idle-back", "side-right", "side-left",
                "run-right-a", "run-right-b", "jog-front", "wave", "jog-back",
                "run-side-right", "run-side-left", "celebrate-front", "celebrate-back")

SHEETS: tuple[Sheet, ...] = (
    Sheet(
        source="sprite-sheets/characters-six-kits.jpeg", slug="characters",
        group_radius=1, min_area=300, row_tolerance=130,
        regions=(Region("characters", FULL, naming="grid", prefix="char",
                        rows=("red", "blue", "green", "yellow", "orange", "purple"),
                        rows_cols=(CHAR_COLS_12,) * 4 + (CHAR_COLS_13,) * 2, group_radius=1),),
    ),
    Sheet(
        source="sprite-sheets/boats-dragon-and-kayak.jpeg", slug="boats",
        group_radius=4, min_area=300, row_tolerance=70,
        regions=(
            Region("dragon-boats", (0.0, 0.0, 0.505, 0.665), naming="list",
                   names=tuple(f"dragon-boat-{c}" for c in
                               ("red", "blue", "green", "yellow", "orange", "purple")), group_radius=4),
            Region("kayaks", (0.505, 0.0, 1.0, 0.665), naming="list",
                   names=("kayak-red-k1-a", "kayak-red-k1-b", "kayak-yellow-k1-a", "kayak-yellow-k1-b",
                          "kayak-green-k2-a", "kayak-green-k2-b", "kayak-blue-k2-a", "kayak-blue-k2-b",
                          "kayak-purple-k3-a", "kayak-purple-k3-b", "kayak-orange-k2", "kayak-coral-k3"),
                   group_radius=4),
            Region("paddles", (0.0, 0.665, 0.505, 1.0), naming="numbered", prefix="paddle-wood", group_radius=2),
            Region("kayak-paddles", (0.505, 0.665, 0.76, 0.93), naming="numbered", prefix="paddle-double", group_radius=2),
            Region("paddle-splashes", (0.76, 0.665, 1.0, 0.93), naming="numbered", prefix="paddle-dip", group_radius=8),
            Region("water-effects", (0.505, 0.93, 1.0, 1.0), naming="numbered", prefix="splash", group_radius=9, min_area=150),
        ),
    ),
    Sheet(
        source="sprite-sheets/clouds.jpeg", slug="clouds",
        group_radius=10, min_area=400, row_tolerance=110,
        regions=(Region("clouds", FULL, naming="numbered", prefix="cloud", group_radius=10),),
    ),
    Sheet(
        source="sprite-sheets/water-effects-and-props-v1.jpeg", slug="props-v1",
        group_radius=6, min_area=250, row_tolerance=80,
        ignore=((0.0, 0.0, 1.0, 0.075), (0.0, 0.46, 0.62, 0.55)),
        regions=(
            Region("water-effects", (0.0, 0.075, 0.37, 0.465), naming="numbered", prefix="wake-v1", group_radius=16),
            Region("water-effects", (0.37, 0.075, 0.65, 0.25), naming="numbered", prefix="splash-v1", group_radius=12),
            Region("water-effects", (0.37, 0.25, 0.65, 0.465), naming="numbered", prefix="oar-splash-v1", group_radius=12),
            Region("water-effects", (0.65, 0.075, 1.0, 0.37), naming="numbered", prefix="ripple-v1", group_radius=16),
            Region("water-effects", (0.65, 0.37, 1.0, 0.465), naming="numbered", prefix="spray-v1", group_radius=14),
            Region("props", (0.0, 0.535, 0.36, 0.815), naming="list", group_radius=7,
                   names=("banner-psd-active-day-red-v1", "banner-psd-active-day-green-v1",
                          "flag-psd-v1", "flag-fds-v1", "banner-fds-vertical-teal-v1",
                          "banner-fds-vertical-yellow-v1", "bunting-v1-a", "bunting-v1-b",
                          "flag-pennant-red-v1", "bunting-wavy-v1-a", "bunting-wavy-v1-b")),
            Region("props", (0.36, 0.535, 0.69, 0.73), naming="list",
                   names=("tent-pair-red-blue-v1", "tent-pair-yellow-green-v1"), group_radius=7),
            Region("props", (0.69, 0.535, 1.0, 0.73), naming="list",
                   names=("balloon-arch-v1-a", "flag-rainbow-v1", "balloon-arch-v1-b"), group_radius=7),
            Region("props", (0.0, 0.815, 0.40, 1.0), naming="list",
                   names=("tent-red-v1", "tent-blue-v1", "tent-yellow-v1", "tent-green-v1"), group_radius=7),
            Region("props", (0.40, 0.73, 0.66, 1.0), naming="list", names=("arch-start-finish-v1",), group_radius=7),
            Region("props", (0.66, 0.73, 0.84, 1.0), naming="numbered", prefix="award-v1", group_radius=7),
            Region("props", (0.84, 0.73, 1.0, 1.0), naming="numbered", prefix="clutter-v1", group_radius=7),
        ),
    ),
    Sheet(
        source="sprite-sheets/water-effects-and-props-v2.jpeg", slug="props-v2",
        group_radius=6, min_area=250, row_tolerance=80,
        ignore=(
            (0.28, 0.0, 0.72, 0.065), (0.05, 0.055, 0.27, 0.10),
            (0.42, 0.055, 0.65, 0.10), (0.83, 0.055, 0.98, 0.10),
            (0.55, 0.285, 0.77, 0.33), (0.19, 0.465, 0.82, 0.525),
            (0.03, 0.52, 0.20, 0.575), (0.26, 0.52, 0.42, 0.575),
            (0.47, 0.52, 0.65, 0.575), (0.68, 0.52, 0.82, 0.575),
            (0.84, 0.52, 1.0, 0.575),
        ),
        regions=(
            Region("water-effects", (0.0, 0.10, 0.35, 0.465), naming="numbered", prefix="wake-v2", group_radius=18),
            Region("water-effects", (0.35, 0.10, 0.78, 0.30), naming="numbered", prefix="splash-v2", group_radius=12),
            Region("water-effects", (0.35, 0.30, 0.78, 0.465), naming="numbered", prefix="oar-splash-v2", group_radius=10),
            Region("water-effects", (0.78, 0.10, 1.0, 0.465), naming="numbered", prefix="ripple-v2", group_radius=16),
            Region("props", (0.0, 0.56, 0.235, 1.0), naming="list", group_radius=7,
                   names=("banner-psd-active-day-blue-v2", "feather-psd-v2-a", "flag-psd-stripes-v2",
                          "flag-pennant-rainbow-v2", "pennant-fds-red-v2", "banner-stand-v2",
                          "banner-fds-yellow-v2", "bunting-v2-a", "bunting-v2-b",
                          "feather-psd-v2-b", "feather-fds-v2", "bunting-v2-c")),
            Region("props", (0.24, 0.56, 0.45, 1.0), naming="list",
                   names=("tent-red-v2", "tent-blue-v2", "tent-yellow-v2",
                          "tent-green-v2", "tent-purple-v2", "tent-orange-v2"), group_radius=7),
            Region("props", (0.47, 0.56, 0.65, 1.0), naming="list",
                   names=("arch-start-finish-v2", "canopy-yellow-v2", "canopy-green-v2",
                          "canopy-purple-v2", "canopy-orange-v2"), group_radius=7),
            Region("props", (0.67, 0.56, 0.84, 1.0), naming="list", group_radius=7,
                   names=("podium-v2", "trophy-table-v2", "flags-pair-v2",
                          "flag-rainbow-v2", "balloon-arch-v2")),
            Region("props", (0.84, 0.56, 1.0, 1.0), naming="numbered", prefix="equipment-v2", group_radius=7),
        ),
    ),
)
