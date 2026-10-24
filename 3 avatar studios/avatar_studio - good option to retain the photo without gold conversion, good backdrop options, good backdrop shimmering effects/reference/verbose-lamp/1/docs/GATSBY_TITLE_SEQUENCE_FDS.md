Phase | Progress: Finalize | FDS reverse-engineered from a working build; 100% of sections populated, DRAFT items listed in §15

# FUNCTIONAL DESIGN SPEC — "GATSBY DECO TITLES" (WebGL Art Deco Title Sequence)

## 0. Metadata {#meta}

| Field | Value |
|---|---|
| Document version | 1.0 |
| Date | 2026-10-23 |
| Status | Reverse-engineered from implemented build; ready for use as a construction prompt |
| Meta prompt version | FDS_BUILDER V1 MERGED (wshyang/greenfield, read 2026-10-23) |
| Session summary | 1 build session; 5 title acts; 9 source modules; 0 open blockers |
| Tag conventions | `[DRAFT — {source}]` unconfirmed; `[CUSTOM: … because …]` deliberate deviation; `[SEED]` preseeded data; `[BLOCKED — …]` missing surface |
| Anchor prefixes | `#obj-` object, `#feat-` feature, `#flow-` user flow, `#surf-` surface, `#nfr-` non-functional requirement, `#boot-` bootstrap |

How to use this document as a prompt: hand §1–§14 verbatim to a coding AI together with the stack constraint in §1.4. Every directive carries a "because" so the implementer can resolve unanticipated trade-offs in the intended direction. Nothing in this document is diagrammatic or language-specific; pseudocode is language-agnostic.

---

## 1. Intent Alignment `[INTENT_ALIGNED]` {#intent}

### 1.1 First-order intent (literal ask)
Build a single-page web application that reproduces, in real-time WebGL, the animated golden Art Deco frames that draw themselves around title text in the 2013 film *The Great Gatsby*.

### 1.2 Second-order intent (operational workflow)
The user wants to watch the sequence play automatically, scrub to any moment, inspect the 3D frames from arbitrary angles, and substitute their own words into the hero title lockup — because a fixed video would not prove that the effect is procedurally generated.

### 1.3 Third-order intent (strategic driver)
Demonstrate that the film's signature motion vocabulary (multi-plane bevelled gold rails that grow outward from symmetry axes, hold, then part as a camera flies through) can be synthesized entirely on the GPU with no pre-rendered assets — because the artefact is a portfolio-grade proof of research fidelity plus engineering capability.

### 1.4 Stack constraint (non-negotiable input, not a design choice)
React + Vite + Tailwind CSS v4, TypeScript strict, Three.js (r186 line) for WebGL, output bundled as a single HTML file. No image or video assets may be shipped; every texture is generated at runtime — because the deliverable must be self-contained and provably procedural.

### 1.5 Research findings the design is bound to (confirmed from public sources)
1. Logotype and bespoke "Deco Pinstripe" alphabet: Like Minded Studio (Sydney) with Bazmark; inspiration K.H. Schaefer Deco plates and the inline face *Atlas*.
2. Interlocking octagonal "GG" signet monogram: Bazmark with Tiffany & Co.
3. 3D rendering/animation of titles: Deva Studios (opening) and Method Studios (end credits); title design Silvana Azzi Heras, title direction Finn Spencer.
4. Typographic rule: solid chiseled metallic glyphs alternate letter-by-letter with hollow 4-line inline pinstriped glyphs; front faces read as platinum/silver, extruded sides as warm gold.
5. Motion rule: gold rails are 3D chamfered bars on several depth planes; they grow symmetrically from the centre, miter around 45° octagon corners and stepped "ziggurat" brackets, fan into Chrysler-style sunbursts, hold while the camera pushes in, then split left/right as the camera passes through.
6. Bookend rule: the film opens in flickering monochrome "silver-nitrate" projection that blooms into colour 3D; a distant green dock light appears at both ends.

---

## 2. Executive Summary {#summary}

A 38-second looping title sequence composed of five sequential "acts". Each act is a 3D title card: a multi-plane golden frame assembly plus extruded Deco typography positioned at a fixed depth along a corridor. A directed camera pushes through the corridor; when it reaches each card the frame draws on, the type wipes in from the centre, the card holds, and then the frame parts to let the camera through. A HUD provides transport, scrubbing, act jumping, an orbit-inspection camera, a monochrome nitrate filter, procedural audio, and a hero-title customiser that regenerates Act V's geometry live. A research dossier modal documents the design lineage.

---

## 3. Phase Scope Summary {#phases}

| Phase | Scope | Status in reference build |
|---|---|---|
| P1 Core | Five-act sequence, directed camera, frame draw-on shader, Deco type generator, post-processing, transport HUD | Implemented |
| P2 Interaction | Orbit camera, act jump, nitrate toggle, HUD hide, keyboard shortcuts | Implemented |
| P3 Customisation & Documentation | Hero title customiser with presets, research dossier modal, procedural audio | Implemented |
| P4 Deferred | Audio file playback, export to video, mobile touch tuning, multi-language glyph set | Not started `[DRAFT — author scoping]` |

---

## 4. Core Objects {#objects}

All objects are in-memory; there is no persistence and no network I/O (P14 note: every capability must still be reachable by a surface, see §7).

### 4.1 SequenceChapter {#obj-sequence-chapter}
Phase: P1. Description: an immutable description of one act (title card) in the timeline.

| Attribute | Type | Phase | Constraints | Validation Rule | Error Message |
|---|---|---|---|---|---|
| id | string(max:24) | P1 | required, unique, kebab-case | matches `^[a-z][a-z0-9-]*$` | "Chapter id must be lowercase kebab-case." |
| actNumber | string(enum: I,II,III,IV,V) | P1 | required | one of the roman numerals | "Act number must be a Roman numeral I–V." |
| label | string(max:40) | P1 | required | non-empty after trim | "Chapter label is required." |
| archetype | enum(FrameArchetype) | P1 | required | one of `monogram_gate`, `ziggurat_chevron`, `sunburst_octagon`, `diamond_gateway`, `gatsby_hero` | "Unknown frame archetype." |
| startTime | number(seconds, ≥0) | P1 | required | `startTime < endTime`; equals previous chapter's `endTime` (contiguous) | "Chapters must be contiguous and non-overlapping." |
| endTime | number(seconds) | P1 | required | `≤ TOTAL_SEQUENCE_DURATION` | "Chapter end exceeds sequence duration." |
| zPosition | number(world units) | P1 | required | strictly decreasing with index (camera travels toward −Z) | "Chapter depth must decrease with act order." |
| topLine | string(max:46) | P1 | optional | glyphs in supported set (§4.5) | "Unsupported character in title line." |
| middleLine | string(max:18) | P1 | optional, hero only | as above | as above |
| mainLine | string(max:24) | P1 | required | as above; non-empty | "Main title line is required." |
| bottomLine | string(max:46) | P1 | optional | as above | as above |
| description | string(max:300) | P1 | required | non-empty | "Chapter description is required." |

Reference values `[SEED]` (fictional-safe; names are the public film credits):

| id | act | archetype | start | end | z | mainLine |
|---|---|---|---|---|---|---|
| monogram | I | monogram_gate | 0.0 | 7.2 | 0 | GG |
| dicaprio | II | ziggurat_chevron | 7.2 | 14.0 | −26 | LEONARDO DICAPRIO |
| ensemble | III | sunburst_octagon | 14.0 | 20.8 | −52 | CAREY MULLIGAN |
| director | IV | diamond_gateway | 20.8 | 27.5 | −78 | BAZ LUHRMANN |
| hero | V | gatsby_hero | 27.5 | 38.0 | −108 | GATSBY |

States: none (immutable). Relationships: 1 SequenceChapter → 1 TitleCardRig (§4.3). Edge/failure: boundary — a chapter shorter than 2.5 s cannot complete draw + hold + part (see §6.1 timing fractions), reject at authoring time; invalid input — unsupported glyph falls back to the letter "O" silhouette `[CUSTOM: fallback glyph rather than throw because a missing glyph must never blank the whole card]`; adversarial, race, dependency, auth-change — not applicable (static data). Empty states: not applicable (array is seeded; see §10).

### 4.2 HeroTitleConfig {#obj-hero-title-config}
Phase: P3. Description: user-editable text for Act V.

| Attribute | Type | Phase | Constraints | Validation Rule | Error Message |
|---|---|---|---|---|---|
| keystone | string(max:8) | P3 | required, default "THE" | trimmed, upper-cased; empty → default | "Keystone falls back to THE when empty." (informational) |
| preTitle | string(max:18) | P3 | optional, default "GREAT" | trimmed, upper-cased | — |
| mainTitle | string(max:16) | P3 | required, default "GATSBY" | trimmed, upper-cased; empty → default | "Main title falls back to GATSBY when empty." (informational) |
| subCredit | string(max:46) | P3 | optional | trimmed, upper-cased | — |
| pinstripeAlternation | boolean | P3 | default true | — | — |

Validation logic (numbered): 1) upper-case all strings because the glyph set is capitals-only; 2) hard-truncate at max length because frame width is derived from text width and must stay inside the camera frustum; 3) substitute defaults for empty required fields rather than reject, because the modal must never leave Act V without text. States: none. Relationships: 1 HeroTitleConfig → regenerates 1 TitleCardRig (hero). Edge: boundary — 16-glyph main title at hero scale still fits because frame half-width = `max(4.45, textWidth × 0.54 + 0.78)` and camera pulls back for narrow aspect (§6.4); adversarial — characters outside glyph set fall back as in §4.1; others not applicable.

### 4.3 TitleCardRig {#obj-title-card-rig}
Phase: P1. Description: the renderable 3D assembly for one chapter: one frame mesh plus zero or more DecoTextRigs, parented to a group placed at `zPosition`.

| Attribute | Type | Phase | Constraints | Validation Rule | Error Message |
|---|---|---|---|---|---|
| chapter | reference(#obj-sequence-chapter) | P1 | required | — | — |
| root | scene-graph group | P1 | required | position.z = chapter.zPosition | — |
| drawProgress | number(0..1) | P1 | per-frame input | clamp | — |
| textProgress | number(0..1) | P1 | per-frame input | clamp | — |
| partOpen | number(0..1) | P1 | per-frame input | clamp; always 0 for hero because the finale holds | — |
| opacity | number(0..1) | P1 | per-frame input | rig hidden when < 0.01 to skip draw calls | — |

States (derived each frame from local time `u = (t − start) / (end − start)`), see §6.1 for exact fractions:

| State | Entry condition | Visible behaviour |
|---|---|---|
| Dormant | u < −0.18 or u > 1.18 | not rendered |
| Approaching | −0.18 ≤ u < −0.04 | fades in from fog, frame not yet drawn |
| Drawing | −0.04 ≤ u < 0.42 | gold rails grow from symmetry axes; molten tip visible |
| Revealing | 0.14 ≤ u < 0.50 (overlaps Drawing) | type wipes from centre outward |
| Holding | 0.50 ≤ u < 0.80 | full card; camera pushes in |
| Parting | 0.80 ≤ u < 1.03 (non-hero only) | left/right halves slide apart up to 5.2 units; type fades |
| Receding | 0.94 ≤ u ≤ 1.18 | opacity → 0 after camera has passed |

Forbidden transitions: any state may not be entered out of order within a playthrough except by scrubbing, because the states are pure functions of time (scrubbing is therefore always safe — rationale for stateless design). Relationships: 1 rig → 1 frame geometry; 1 rig → 0..4 DecoTextRigs. Edge: dependency failure — if WebGL context is lost the whole scene is torn down and rebuilt on next mount `[DRAFT — not exercised in reference build]`.

### 4.4 FrameSpec (polyline) {#obj-frame-spec}
Phase: P1. Description: one 2D polyline that is swept into a 3D chamfered gold bar. A frame archetype is a list of these.

| Attribute | Type | Phase | Constraints | Validation Rule | Error Message |
|---|---|---|---|---|---|
| points | list(point2d, min:2) | P1 | required | ≥ 2 points; consecutive points not coincident | "Polyline needs ≥ 2 distinct points." |
| closed | boolean | P1 | default false | — | — |
| width | number(>0) | P1 | required; 0.02–0.075 typical | — | — |
| depth | number(>0) | P1 | required; 0.05–0.14 typical | — | — |
| z | number | P1 | required; −0.68..+0.42 relative to card | — | — |
| delay | number(0..0.7) | P1 | required | stagger offset; higher = draws later | — |
| partDir | enum(−1, 0, +1) | P1 | default 0 (auto by sign of x) | — | — |

Additive metadata `role` (primary/monogram/ornament/echo/band/rosette) is non-rendering; see Addendum 0002.

Cross-section contract: 6 vertices — outer-left-back, left 45° chamfer, crest-left, crest-right, right 45° chamfer, outer-right-back — because a flat crest flanked by two 45° facets is what makes raking light glint at every corner. Corners are mitered with miter scale clamped to ≤ 2.3 because unclamped miters spike at acute sunburst angles. Per-vertex attributes carried to the shader: normalised arc-length `u` (0..1), `delay`, `partSide`.

### 4.5 DecoTextRig {#obj-deco-text-rig}
Phase: P1. Description: a word rendered in the bespoke Deco alphabet, extruded into a 3D block.

| Attribute | Type | Phase | Constraints | Validation Rule | Error Message |
|---|---|---|---|---|---|
| text | string(max:46) | P1 | required | upper-cased; supported set `A–Z 0–9 & . · - '` and space | fallback glyph per §4.1 |
| worldHeight | number(>0) | P1 | required | 0.22–1.58 | — |
| extrudeDepth | number(≥0) | P1 | default `min(0.22, worldHeight × 0.14)` | — | — |
| finish | enum(platinum-gold, pure-gold) | P1 | default platinum-gold | — | — |
| alternatePinstripes | boolean | P1 | default true | — | — |
| tracking | number | P1 | default 0.18 (hero) / 0.24 | — | — |
| weight | enum(hero, regular, fine) | P1 | default hero | stroke px 32 / 24 / 18 at 220 px cap height | — |

Glyph construction rules (because they encode the research in §1.5-4): 1) condensed geometric skeleton strokes, low crossbars on A/E/H, narrow tall G with inward horizontal spur; 2) alternate glyphs (even visible index, excluding I, 1 and punctuation) are rendered as four concentric inline stripes by stroking the skeleton at widths 1.00, 0.72 (cut), 0.44, 0.15 (cut) of stroke width; 3) a chamfer-distance heightfield is computed from the alpha mask and converted to a tangent-space normal map so every glyph has 45° bevelled edges; 4) platinum-gold finish tints the bevel champagne gold and the crest cool silver; 5) the 3D body is the front plane plus 11 rear slices scaled +0.8 % per slice in a warm gold material. Reveal contract: a centre-out curtain in UV space with a soft 0.16 edge and an emissive spark at the moving edge.

### 4.6 PlaybackState {#obj-playback-state}
Phase: P1/P2. Description: the single mutable controller for time and camera.

| Attribute | Type | Phase | Constraints | Validation Rule | Error Message |
|---|---|---|---|---|---|
| currentTime | number(0 ≤ t < 38.0) | P1 | required | wraps to 0 at end (loop) | — |
| isPlaying | boolean | P1 | default true | — | — |
| cameraMode | enum(cinema, orbit) | P2 | default cinema | — | — |
| nitrateForced | boolean | P2 | default false | — | — |
| hudHidden | boolean | P2 | default false | — | — |
| soundOn | boolean | P3 | default false | requires a user gesture to enable because browsers block autoplay audio | "Audio starts only after you click the sound button." (informational) |

State machine (cameraMode):

| From | To | Trigger | Guard | Side effect |
|---|---|---|---|---|
| cinema | orbit | Orbit button / key O | none | pause if local u < 0.42 or > 0.85 and snap to u = 0.56 so the full frame is visible; orbit target = (0,0,z_chapter) |
| orbit | cinema | Orbit button / key O / Replay / Apply custom title | none | camera up-vector reset; directed path resumes |

Forbidden: entering orbit while a modal is open — keyboard shortcuts are suppressed when a modal or text input has focus, because keystrokes typed into the customiser must not drive the scene.

---

## 5. Relationship Map {#relationships}

| Object A | Cardinality | Object B | Relationship | Constraints | Data-carrying? | Surface coverage |
|---|---|---|---|---|---|---|
| SequenceChapter | 1:1 | TitleCardRig | materialises | built once at mount; hero rebuilt on config change | No | create: #surf-stage mount; list: #surf-act-buttons; remove: unmount |
| TitleCardRig | 1:N | FrameSpec | composed of | N from archetype builder | No | implicit (not user-editable) |
| TitleCardRig | 1:0..4 | DecoTextRig | contains | hero: 4 lines; monogram: 2 lines; others: 3 | No | implicit |
| HeroTitleConfig | 1:1 | TitleCardRig(hero) | regenerates | atomic swap of rig | No | create/edit: #surf-customiser; view: #surf-stage; reset: customiser Reset |
| PlaybackState | 1:N | TitleCardRig | drives | per-frame | No | #surf-transport, #surf-scrubber, keyboard |

Narrative: chapters are static authoring data; rigs are their GPU form; the playback state is the only thing that changes over time, and it drives every rig purely as a function of time, which is why scrubbing never desynchronises anything. No N:M relationships exist, so the R1 junction pass yields nothing `[CUSTOM: no junction objects because there is no persistence layer]`.

---

## 6. Cross-Object Constraints {#constraints}

### 6.1 Timing fractions (apply to every non-hero chapter; hero differs where noted)
- drawProgress = smoothstep(u, −0.04, 0.42)
- textProgress = smoothstep(u, 0.14, 0.50)
- partOpen = smoothstep(u, 0.80, 1.03); hero: 0
- opacity = smoothstep(u, −0.15, 0.04) × (1 − smoothstep(u, 0.94, 1.08)); hero fade-out window 0.91–0.995 so it ends before loop wrap
- Per-rail local draw = clamp((drawProgress − delay) / max(0.25, 1 − delay)) eased by `1 − (1 − x)^2.4`; fragments with arc-length u > local draw are discarded — because discarding (not alpha) keeps depth-correct ends on overlapping planes.

### 6.2 Camera path (cinema mode)
- Non-hero: hold phase (u < 0.78) lerps camera z from chapter.z + 12.2 to chapter.z + 9.0; fly phase (0.78–1.0) eases to next chapter.z + 12.2 (or + 15.2 if next is hero).
- Hero: eases from z + 15.2 to z + 12.4 over the first 52 % then drifts 0.75 units.
- Aspect pull-back: if aspect < 1.65 add clamp((1.65 − aspect) × 6.5, 0, 5.8) to all distances — because side chevron wings must not clip on portrait or square viewports.
- Pointer parallax: ±0.56 x, ±0.36 y world offset, ±0.018 rad roll, smoothed at 4.5/s.

### 6.3 Frame width derivation
Frame half-width = max(archetype minimum, mainTextWidth × 0.56 + 0.75) (hero: × 0.54 + 0.78) — because the frame must enclose arbitrary custom text.

### 6.4 Monochrome bookend
Nitrate amount = 0.82 × (1 − smoothstep(t, 0.35, 2.55)) unless forced (0.92). Green light intensity = max(1 − smoothstep(t, 4.8, 7.6), 0.65 × smoothstep(t, 34.8, 37.6)); the light sits 7.5 units behind Act I, and behind Act V after t > 30.

---

## 7. Surface Inventory {#surfaces}

| Anchor | Surface | Phase | Reaches capability |
|---|---|---|---|
| #surf-stage | Full-viewport WebGL canvas | P1 | view sequence; pointer parallax; orbit drag/zoom in orbit mode |
| #surf-header | Top bar: Research, Customize Title, 3D Orbit, 1920s Nitrate, Sound | P2/P3 | open dossier; open customiser; toggle camera mode; toggle filter; toggle audio |
| #surf-transport | Play/Pause, Replay | P1 | start/stop; restart at t=0 in cinema mode |
| #surf-scrubber | Range input 0–38 s step 0.05 with diamond thumb | P1 | seek |
| #surf-act-buttons | Five act buttons (label of V reflects custom mainTitle) | P2 | jump to act start + 0.15 s |
| #surf-act-caption | Act numeral, label, one-line description | P1 | orientation |
| #surf-hud-toggle | Floating eye button, always visible | P2 | hide/show all HUD |
| #surf-customiser | Modal form with presets, four text fields, pinstripe checkbox, Reset, Render | P3 | edit HeroTitleConfig |
| #surf-frame-studio | Two sections. **Title frame**: Style (Sunburst / Fluted), one merged Design gallery (#0 = original), Ornament density slider, opt-in Fine-tune proportions. **Screen border**: toggle and weight. Shared readout and reset-to-original | P3 | decorate the title cards (0002–0004) and draw the poster's edge border at the viewport edge (0005) |
| #surf-screen-border | Persistent camera-parented proscenium; off by default; rebuilds on resize | P3 | the printed one-sheet border around the picture, independent of any card |
| #surf-dossier | Scrollable modal with 3 inline SVG figures and 4 research sections | P3 | read research lineage `[CUSTOM: SVG figures permitted in the product UI because the no-diagram rule binds this spec document, not the shipped product]` |
| Keyboard | Space, 1–5, O, H | P2 | play/pause; jump; orbit toggle; HUD toggle |

R5 parity audit: every PlaybackState mutation and the HeroTitleConfig edit have a surface; no `[ORPHAN-CAPABILITY]` remains.

---

## 8. Features {#features}

### 8.1 Five-act directed sequence {#feat-sequence}
Phase P1. Objects: SequenceChapter, TitleCardRig, PlaybackState. Precondition: WebGL2-capable browser.
User story: as a viewer I watch the frames draw, hold and part while the camera flies through, so that the film's motion language is reproduced.
BDD:
- Given the page has loaded, When 0 s elapse, Then the view is monochrome with flicker and scratch lines and the GG gate begins to draw by 0.35 s.
- Given Act II is at u = 0.50, When I observe the frame, Then all rails are fully drawn, the name is fully revealed, and the camera is between z+12.2 and z+9.0 of that act.
- Given Act II reaches u = 0.90, When I observe the frame, Then the left and right halves have separated and the text is ≤ 15 % opaque.
- Given t reaches 38.0 s, When playback continues, Then t wraps to 0 with no visible pop because the hero card has faded by u = 0.995 and the nitrate filter re-engages.
- Empty-state: not applicable (chapters are seeded).
Verification strategy: visual regression at t ∈ {1, 5, 10.5, 17.4, 24.1, 33} s on 16:9 and 4:3; shader compile check for every material at mount.

### 8.2 Golden frame archetypes {#feat-archetypes}
Phase P1. **Amended by Addenda 0002, 0003 and 0004:** a second frame family (one-sheet poster) is selectable; the lists below describe the default `sequence` family. each act is now a declarative recipe of parametric motifs evaluated under a base genome (0003); the lists below are the recipe values at the signature genome `G₀`, which the intricacy engine (0002) treats as its fixed point at `0.50`. Richer and poorer settings on both axes are generated around that point; the lists below remain the reference render.

Each archetype must contain the listed ornaments because they map to §1.5-5:
- monogram_gate: 3 nested cut-corner octagons on 3 depth planes; two interlocking geometric "G" polylines with inner pinstripe; side triple columns; top 11-ray and bottom 9-ray sunbursts; flanking diamonds; split credit rules.
- ziggurat_chevron: 3 nested 3-step ziggurat frames; split rules above/below name; 4 chevron wings per side; top/bottom diamond clasps.
- sunburst_octagon: 4 nested octagons; 13-ray crown and 11-ray base fan; side diamond spears with rails.
- diamond_gateway: alternating ziggurat/octagon portals on 4 depth planes (+0.42 to −0.52); 3 diamonds per side; split rules.
- gatsby_hero: 3 nested ziggurats + 2 outer octagons; upper keystone arch for `keystone` with 3 wing bars per side; frieze divider with diamond between `preTitle` and `mainTitle`; lower rule and diamond above `subCredit`; 4 chevron wings per side; 2 diamonds + rail per side; 15-ray crown, 11-ray base fan.
BDD: Given any archetype, When drawProgress = 1, Then every polyline in its list is fully visible; Given drawProgress = 0.2, Then rails with delay ≥ 0.2 show zero length.

### 8.3 Deco pinstripe typography {#feat-typography}
Phase P1. BDD:
- Given mainTitle "GATSBY" with alternation on, When rendered, Then G, T, B are 4-stripe inline and A, S, Y are solid.
- Given alternation off, When rendered, Then all glyphs are solid.
- Given a character outside the supported set, When rendered, Then the "O" silhouette is drawn and no exception is raised.
- Given textProgress = 0.5, When viewed, Then glyphs within the central 50 % of the word width are visible and a bright edge spark sits at the reveal boundary.

### 8.4 Transport and scrubbing {#feat-transport}
Phase P1. BDD: Given playing, When Space is pressed, Then isPlaying is false and the frame freezes within one animation frame; Given scrubber dragged to 20.0 s, When released, Then Act III is displayed at u ≈ 0.88 (parting) immediately; Given Replay in orbit mode, When clicked, Then mode returns to cinema and t = 0.

### 8.5 Orbit inspection {#feat-orbit}
Phase P2. Authorization: not role-dependent. BDD: Given cinema mode at Act IV u = 0.2, When O is pressed, Then playback pauses, t snaps to u = 0.56, the camera sits at (2.4, 0.9, z+9.2) looking at (0,0,z), and drag rotates around the card; Given orbit mode, When an act button is clicked, Then the orbit target moves to that act's depth. Constraints: zoom distance 3.2–26.

### 8.6 Nitrate filter {#feat-nitrate}
Phase P2. BDD: Given toggle on, When any t, Then output is desaturated to luma × (1.06, 1.02, 0.93), flickers at 27 Hz × 13 Hz product between 0.88 and 1.0, and shows sparse vertical scratches; Given toggle off at t > 2.55 s, Then full colour.

### 8.7 Hero title customiser {#feat-customiser}
Phase P3. BDD:
- Given the modal open, When I choose preset "Trimalchio", Then the four fields populate and alternation is true.
- Given mainTitle "ROARING TWENTIES" (16 chars), When Render is clicked, Then the hero rig is rebuilt, the sequence jumps to Act V in cinema mode and plays, and the frame encloses the text with ≥ 0.75 units margin.
- Given empty keystone and mainTitle, When Render is clicked, Then "THE" and "GATSBY" are used.
- Empty-state: not applicable (defaults always exist).
Verification: rebuild time < 400 ms on a mid-range laptop `[DRAFT — measured informally]`; previous rig's GPU resources disposed (no texture leak after 20 rebuilds).

### 8.8 Research dossier {#feat-dossier}
Phase P3. BDD: Given header Research clicked, When modal opens, Then four sections (lineage; lattice & trim-path; typography; WebGL method) are readable and the modal closes on backdrop click, X, or re-click.

### 8.9 Procedural audio {#feat-audio}
Phase P3. BDD: Given sound off, When Sound clicked (user gesture), Then a low-passed drone fades in over 1.4 s and a 5-note ascending triangle-wave arpeggio plays; Given sound on, When an act boundary is crossed, Then the arpeggio replays in that act's chord and the drone root retunes over 1.2 s; Given sound on, When Sound clicked, Then master gain decays over 0.35 s and oscillators stop.

### 8.10 HUD visibility and shortcuts {#feat-hud}
Phase P2. BDD: Given H pressed, Then header, footer and proscenium hairline fade out within 500 ms and only the eye button remains; Given a text input focused, When H is typed, Then HUD does not toggle.

---

## 9. User Flows {#flows}

### 9.1 Watch the sequence {#flow-watch}
Actors: viewer. Trigger: page load. Preconditions: WebGL2 available.
1. Scene mounts; environment map, wallpaper textures, five rigs, post-processing chain are built synchronously (budget < 1.5 s `[DRAFT — informal]`).
2. Playback starts at t = 0, monochrome.
3. Each act proceeds through §4.3 states; HUD caption updates on act change.
4. At 38 s the sequence loops.
Postcondition: no state change required from the user. Exceptions: WebGL unavailable → `[DRAFT — show a static message "This experience requires WebGL 2" in place of the canvas]`.

### 9.2 Inspect a frame in 3D {#flow-inspect}
1. Viewer clicks act button III. 2. Clicks 3D Orbit (or O). 3. Playback pauses at u = 0.56; hint banner reads "Drag to orbit · Scroll to zoom · Click any act". 4. Viewer drags/zooms. 5. Viewer clicks 3D Orbit again → cinema resumes from current t. Postcondition: no data changed.

### 9.3 Inscribe a custom title {#flow-customise}
1. Click Customize Title. 2. Modal shows current config (re-synced on every open). 3. Optionally pick preset. 4. Edit fields; input is upper-cased live and truncated at max. 5. Click Render in WebGL. 6. Hero rig rebuilt; mode forced to cinema; t = 27.65; playing. 7. Act V button label now shows the custom main title. Alternate: Reset restores defaults in the form only (not applied until Render). Exception: closing without Render discards edits.

---

## 10. Day-Zero Bootstrap {#boot}

Critical section. There is no database; "empty state" is an empty scene graph.

| Step | Actor | Surface | Object populated | Unlock |
|---|---|---|---|---|
| 1 | build tool | bundler | single HTML with inlined JS/CSS; font links to a public web-font CDN `[SEED]` | page loads offline except fonts (fallback to serif) |
| 2 | app mount | #surf-stage | renderer, camera, PMREM environment `[SEED: procedural canvas]`, wallpaper textures `[SEED: procedural]` | metallic reflections available |
| 3 | app mount | #surf-stage | 5 SequenceChapters `[SEED: constants]` → 5 TitleCardRigs | sequence can play |
| 4 | app mount | #surf-stage | post chain: render → bloom (strength 0.56, radius 0.64, threshold 0.78) → nitrate → output | final image |
| 5 | app mount | #surf-header/#surf-transport | PlaybackState defaults | all controls usable |
| 6 | viewer gesture | Sound button | AudioContext | audio usable (cannot be preseeded because of autoplay policy) |

No `[BLOCKED]` rows.

---

## 11. Integrations {#integrations}
None external at runtime. Web-font CDN is a soft dependency with serif fallback. Browser APIs: WebGL2, Web Audio, pointer events, requestAnimationFrame.

---

## 12. Non-Functional Requirements {#nfr}

### 12.1 Performance {#nfr-perf}
Archetype PERF-2 (interactive real-time) `[DRAFT — archetype default]`.

| Parameter | Value | Source | Rationale |
|---|---|---|---|
| Target frame rate | ≥ 50 fps at 1920×1080, device pixel ratio capped at 2 | author | smoothness of draw-on is the product |
| React HUD update rate | ≤ 20 Hz, throttled from the render loop | author | keeps reconciliation off the hot path |
| Particle budget | 950 points | author | visual density without overdraw |
| Rig rebuild (custom title) | < 400 ms | author | perceived as instant |
| Bundle size | ≤ 900 kB uncompressed single file | measured 872 kB | single-file delivery constraint |

Testable requirements: 1) no per-frame allocations in the animation loop beyond vector lerps; 2) rigs with opacity < 0.01 are culled; 3) all textures created per rebuild are disposed on replacement.
BDD: Given 20 consecutive custom-title renders, When heap/GPU memory is sampled, Then it is flat within 10 %.

### 12.2 Security {#nfr-sec}
Archetype SEC-1 (static client, no data) `[DRAFT — archetype default]`. User text is only ever drawn to an offscreen canvas and never inserted as HTML, because that closes injection paths. No network writes, no storage.

### 12.3 Audit/Logging {#nfr-log}
Archetype LOG-1 (none in production). Development builds may log shader compile failures to console `[DRAFT]`.

### 12.4 Accessibility {#nfr-a11y}
Archetype A11Y-2 (controls accessible; canvas content decorative) `[DRAFT — archetype default]`. Requirements: all buttons have accessible names; range input labelled "Sequence timeline"; keyboard operates transport; HUD hide is reversible from a persistent button; reduced-motion preference is not yet honoured `[ACCEPTED-AS-DRAFT] — implementation may require clarification`.

### 12.5 Scalability, Observability, i18n, Privacy
Explicitly skipped with confirmation: client-only artefact with no users-per-second dimension, no telemetry, capitals-only Latin glyph set by design (P4 deferred), no personal data collected.

---

## 13. Anti-pattern Register {#antipatterns}
1. Do not pre-render frames to video or images — defeats the procedural proof.
2. Do not fade rails in with alpha; use arc-length discard — alpha blending breaks depth ordering across planes.
3. Do not store per-rig animation state — derive everything from time so scrubbing is free.
4. Do not share one shader program cache key across the three custom material variants — cache collisions silently swap shaders.
5. Do not tie HUD React state to every animation frame — throttle.

---

## 14. Changelog {#changelog}

| Decision Context | Change | Impact |
|---|---|---|
| DC-001 | Camera distances increased (12.2/9.0 hold; 15.2/12.4 hero) and aspect pull-back added | prevents clipping of sunburst crowns and wings on narrow viewports |
| DC-002 | Glyphs C, S, 6 redrawn with tangent-continuous arcs | removes visible kinks in pinstripe channels |
| DC-003 | Customiser form re-syncs from live config on open | prevents stale edits after Reset/Apply |
| DC-004 | Explicit program cache keys on custom materials | prevents shader cache collisions |
| DC-005 | Adopt Greenfield; add addenda register (Addendum 0001) | recorded process, tests and limits |
| DC-006 | Replace hardcoded frames with intricacy-derived engine; signature frozen at 0.50 (Addendum 0002) | tunable richness, provable preservation, headless tests |
| DC-007 | Base architecture genome, recursive motif rules, variant explorer, frame-only hot-swap (Addendum 0003) | the original is the point (G₀, 0.50) of a two-axis design space |
| DC-008 | Poster frame family with fan/pilaster/comb/ring motifs (Addendum 0004) | a second title-frame vocabulary; relabelled Sunburst/Fluted by 0005 |
| DC-009 | Screen border as a camera-parented object, plus a harmonised studio (Addendum 0005) | the poster's edge border is a distinct object from a title frame; one mechanism per control |

---

## 15. Open DRAFT Register {#drafts}
- WebGL-unavailable fallback message (§9.1) — not implemented.
- Context-loss recovery (§4.3) — not exercised.
- Reduced-motion handling (§12.4) — `[ACCEPTED-AS-DRAFT]`.
- Performance numbers (§12.1) — informal measurements only.
- P4 deferred scope (§3) — author scoping, unconfirmed.

---

## Appendix A — Language-agnostic pseudocode for the per-frame driver {#appendix-driver}

```
each animation frame:
  dt ← min(0.05, elapsed since last frame)
  if playing: t ← (t + dt) mod 38.0
  act ← chapter whose [start, end) contains t
  for each rig:
    u ← (t − rig.start) / (rig.end − rig.start)
    if u < −0.18 or u > 1.18: hide rig; continue
    rig.draw  ← smoothstep(u, −0.04, 0.42)
    rig.text  ← smoothstep(u,  0.14, 0.50)
    rig.part  ← rig.isHero ? 0 : smoothstep(u, 0.80, 1.03)
    rig.alpha ← smoothstep(u, −0.15, 0.04) × (1 − smoothstep(u, fadeStart, fadeEnd))
  if cameraMode = cinema: camera.z ← path(act, u, aspect) per §6.2; apply pointer parallax
  else: orbit controls update
  backdrop.z ← camera.z − 12; lights follow camera.z − 6.5
  nitrate ← forced ? 0.92 : 0.82 × (1 − smoothstep(t, 0.35, 2.55))
  render post chain; emit telemetry (throttled)
```

## Appendix B — Example fictional custom title (D17)
keystone "AN", preTitle "EVENING AT", mainTitle "WEST EGG", subCredit "A PRIVATE RECEPTION · MCMXXII", alternation true.
