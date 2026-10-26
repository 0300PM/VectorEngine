# Responsive breakpoints

The workspace uses one breakpoint tier per common desktop monitor resolution. The
scale lives in two places that the test suite keeps in sync:

- `apps/web/src/styles/main.css` — the media queries that drive the layout.
- `apps/web/src/styles/breakpoints.ts` — the machine-readable scale (tier ids,
  resolutions, column budgets, query helpers).

`src/styles/breakpoints.test.ts` parses the stylesheet and fails when a tier,
column budget, or ordering drifts from the manifest.

## Width tiers

Width tiers are `min-width` queries and apply in ascending order. Every tier
redeclares all four workspace columns, so a tier never depends on the tier below
it. `sourceMin`/`previewMin` are the minimum column widths; the source column
also has a percentage upper bound.

| Tier | Monitor resolution | `min-width` | Source column | Canvas minimum | Inspector | Export |
|---|---|---:|---|---:|---:|---:|
| base | up to 1279 × 800 | — | `minmax(300px, 27%)` | 330 px | 300 px | 280 px |
| `wxga` | 1280 × 800 | 1280 px | `minmax(300px, 27%)` | 330 px | 310 px | 290 px |
| `hd` | 1366 × 768 | 1366 px | `minmax(320px, 27%)` | 340 px | 320 px | 300 px |
| `wxga-plus` | 1440 × 900 | 1440 px | `minmax(340px, 28%)` | 360 px | 340 px | 320 px |
| `hd-plus` | 1600 × 900 | 1600 px | `minmax(360px, 28%)` | 400 px | 350 px | 330 px |
| `wsxga-plus` | 1680 × 1050 | 1680 px | `minmax(380px, 29%)` | 420 px | 360 px | 340 px |
| `full-hd` | 1920 × 1080 | 1920 px | `minmax(420px, 30%)` | 480 px | 380 px | 360 px |
| `qxga` | 2048 × 1152 | 2048 px | `minmax(450px, 30%)` | 520 px | 400 px | 370 px |
| `qhd` | 2560 × 1440 | 2560 px | `minmax(480px, 31%)` | 600 px | 420 px | 380 px |
| `uwqhd` | 3440 × 1440 | 3440 px | `minmax(520px, 30%)` | 720 px | 440 px | 400 px |
| `uhd-4k` | 3840 × 2160 | 3840 px | `minmax(540px, 32%)` | 800 px | 460 px | 420 px |
| `uhd-5k` | 5120 × 2880 | 5120 px | `minmax(600px, 32%)` | 900 px | 520 px | 460 px |

The four minimum columns always fit inside their own tier width, which the test
suite asserts. Panels grow monotonically, so a wider monitor never gets a
smaller inspector or export column.

Ultrawide 21:9 monitors additionally match
`@media (min-aspect-ratio: 21/9) and (min-width: 2560px)`. That tier caps the
source column at 24% and gives the canvas at least 900 px, and the shell loses
its max-width clamp above 3840 px.

## Height tiers

Height tiers are `max-height` queries gated to `min-width: 901px`, so phones and
tablets keep the stacked layout instead of the dense desktop chrome. They are
declared from tallest to shortest so the densest matching tier wins.

| Tier | Reference | `max-height` | Header | Footer | Panel heading | Path toolbar |
|---|---|---:|---:|---:|---:|---:|
| `short` | 1600 × 900 | 900 px | 60 px | 27 px | 50 px | 42 px |
| `laptop` | 1280 × 800 | 820 px | 56 px | 26 px | 50 px | 40 px |
| `hd-laptop` | 1366 × 768 | 768 px | 54 px | 25 px | 44 px | 38 px |
| `very-short` | 1366 × 700 | 700 px | 50 px | 24 px | 42 px | 34 px |
| `compact` | 1280 × 600 | 600 px | 46 px | 22 px | 40 px | 30 px |

The `compact` tier also hides the panel eyebrow labels and reduces the status bar
to 8 px text.

## Compact (stacked) layouts

Below the desktop scale the workspace stops showing four columns at once:

| Query | Behaviour |
|---|---|
| `max-width: 1180px` | Narrower column budgets, secondary preview metadata hidden |
| `max-width: 900px` | Tabbed mobile layout, one panel at a time |
| `max-width: 600px` | Icon-only header actions, two-column format grid |

## Using the scale in code

```ts
import {
  HEIGHT_TIERS,
  WIDTH_TIERS,
  minWidthQuery,
  resolveHeightTier,
  resolveWidthTier,
} from '@/styles/breakpoints'

resolveWidthTier(window.innerWidth)?.id // 'full-hd' on a 1920 px monitor
resolveHeightTier(window.innerHeight)?.id // 'laptop' at 800 px tall
minWidthQuery(1920) // '@media (min-width: 1920px)'
```

When adding a monitor resolution, add the tier to `breakpoints.ts` and the
matching media query to `main.css`; the tests fail until both agree.
