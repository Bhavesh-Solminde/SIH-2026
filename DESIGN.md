# Design

Recorded from the built surface (`sih-top10.html`, extended from `sih-top5.html`), not from intention.

## World

The category standard played straight, at documentation-craft level (the bar set: Stripe docs, Linear changelog, FT data pages). Chosen by the user over an assigned drafting-sheet direction. Flat and printed rather than app-like: **borders carry all elevation, there are no shadows anywhere**. The page reads as a serious analytical document that survives being opened cold by a judge.

## Color

Restrained: cool neutrals plus one accent, with three semantic roles kept separate from the accent.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#FBFBFC` | `#0C0E12` | page ground |
| `--raise` | `#FFFFFF` | `#13161C` | table and card surfaces |
| `--sunk` | `#F2F3F6` | `#171B22` | table head, code blocks, notes |
| `--ink` | `#0E1116` | `#E9EBEF` | primary text |
| `--ink-2` | `#3C4453` | `#B4BBC7` | body prose |
| `--muted` | `#5B6373` | `#949DAC` | labels, captions |
| `--rule` / `--rule-soft` | `#DFE2E9` / `#EAECF1` | `#262B34` / `#1D222A` | borders, hairlines |
| `--accent` | `#24405E` | `#9CB8DC` | links, active rail, neutral meters |
| `--go` / `--hold` / `--stop` | `#1C6B45` / `#8A6516` / `#A43F2E` | `#63C395` / `#D3AC5E` / `#E0897A` | commit / caution / vetoed |

Neutrals carry a slight blue cast toward the accent. Every semantic colour is paired with a drawn SVG mark and a text label, so **colour never carries meaning alone**. Verified: all text ≥4.5:1 in both themes (lowest is 4.63 light / 6.31 dark).

Theming is token-level across three states: bare `:root` defines the complete light palette, `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` redefines tokens only, and `:root[data-theme="dark"]` redefines them again so an explicit toggle wins either way. `body` sets an explicit token background.

## Type

Three faces, each with a job:

- **Archivo** — headings, labels, table headers, verdict marks, UI. Technical grotesk; tracking −0.012em to −0.035em on display sizes, never past the −0.04em floor.
- **Literata** — all body prose. Reading serif; 17px/1.65, measure capped 60–70ch (measured 629px ≈ 65ch).
- **Spline Sans Mono** — every number, PS code, score, calculation block. `font-variant-numeric: tabular-nums` throughout so digits align in columns.

`h1` clamps 2.6→4.4rem, well under the 6rem display ceiling. Uppercase labels carry .11–.13em tracking.

## Layout

Single reading spine with a sticky rank rail in a second grid column above 1120px (`1fr 168px`, 56px gap); the rail collapses below that. Section gaps run 56–152px, more space above a heading than below. Wide content (the ranking matrix) scrolls inside its own `overflow-x:auto` container with `min-width:720px`; `body` carries `overflow-x:clip` so the document never scrolls sideways. A full-bleed breakout was built and **removed** — it overflowed the page container at intermediate widths and the scroll container already solved the real problem.

## Components

- **Ranking matrix** — the page's thesis. Rank numeral at 1.5rem mono, PS code above title, five factor columns, a meter, and a marked verdict.
- **Meter** — 5px track, fill width set by a `--w` custom property, coloured by semantic class.
- **Dossier** — `article.dos` with a 2px top rule (softened to `--rule` when vetoed), a monumental mono rank numeral, and an identical block order throughout so cross-sheet comparison is positional. Ranks 1–3 run nine blocks; ranks 4–10 run five, ending on a "why it is not your pick" block that carries the exclusion argument.
- **Note** — tinted surface with a 1px border and a drawn icon. Deliberately **not** a thick coloured left bar.
- **Fact / Inference tags** — small tinted chips that make epistemic status legible before the sentence is read.
- **Chain** — a 1px-gap grid of labelled cells for the gap analysis.

## Motion

One authored moment: the meters fill via a `fillbar` keyframe on exponential ease-out (`cubic-bezier(.16,1,.3,1)`, 900ms, 55ms stagger) when scrolled into view. **Bars are at full width by default** — the animation replays them rather than revealing them — so a failed observer, absent JS, or reduced motion still renders correct values. `transform: scaleX()` rather than `width` to avoid layout thrash. `prefers-reduced-motion` disables all of it.

## Browser surfaces

Themed from the palette rather than left to defaults: `::selection`, `:focus-visible` rings, scrollbar thumb and track, link underline offset and thickness, and tabular numerals.

## Constraints this surface must keep

Single self-contained file; Google Fonts is the only external host; all non-ASCII escaped to HTML entities so the page renders correctly regardless of how it is served; no emoji standing in for icons.
