# Workspace layout: collapsible panels and sections

The workspace shell is a grid with four optional areas: Source (JSON editor),
canvas, Inspector, and Export. Every area can be collapsed without losing its
state, and both collapse levels are remembered across reloads.

## Panel columns

| State | How to reach it | Result |
|---|---|---|
| Expanded | default | Full column at the tier width (`--col-source`, `--col-properties`, `--col-export`) |
| Rail | header toggle (1st click) or the chevron in the panel header | 44 px vertical rail (`--rail`) with the panel label; click it to expand |
| Hidden | header toggle (2nd click) | Column removed from the grid |

The header toggle therefore cycles **expanded → rail → hidden → expanded** on
desktop. Below 901 px the toggle falls back to plain show/hide, because panels
are tabbed there. When all three columns sit in rail state, a *Restore panels*
button appears in the bottom-right corner of the canvas.

State lives in the engine store:

```ts
store.panelCollapsed          // { json, properties, export }
store.setPanelCollapsed('json', true)
store.togglePanelCollapsed('json')
store.collapsePanels()        // every column to a rail
store.expandPanels()          // every column back to full width
```

`panelVisible` (per panel, including `toolbar`, `statusbar`, `banner`) and
`panelCollapsed` persist to `localStorage` under `vector-engine.panels` and
`vector-engine.panel-collapse`.

## Sections inside the panels

Every group header inside the Inspector and the six Export steps is a toggle
button with `aria-expanded`/`aria-controls`:

- Inspector: `Layers`, `Transform`, `Appearance`, `Shape`
- Export: `1. Target` … `6. Preview`

```vue
<InspectorSection id="inspector-transform" title="Transform" storage-key="inspector.transform">
  …fields…
</InspectorSection>
```

Groups use `useCollapsibleSection(storageKey)`, which keeps state in a module
level reactive map and persists it under `vector-engine.sections`. Sections are
open by default; pass `:default-open="false"` for groups that should start
collapsed and `:collapsible="false"` to pin one open.

## Product banner

`AppBanner.vue` renders a dismissible announcement strip between the header and
the workspace. It advertises the engine capabilities and holds the brand mark.
Dismissing stores `panelVisible.banner = false`; the info button in the header
brand lockup brings it back. The banner is hidden automatically in fullscreen
mode, on very short viewports (≤ 820 px tall), and its secondary list collapses
below 1180 px.

The shell reserves the banner row with
`.app-shell:not(:has(.app-banner))`, so hiding the banner collapses the row
without leaving a gap.

## Brand assets

| File | Purpose |
|---|---|
| `public/favicon.svg` | Primary vector favicon |
| `public/favicon.ico` | Legacy 16/32/48 px favicon |
| `public/favicon-32.png` | PNG favicon |
| `public/apple-touch-icon.png` | 180 px iOS icon |
| `public/icon-192.png`, `public/icon-512.png` | Web app manifest icons |
| `public/site.webmanifest` | Installable PWA metadata |
| `public/brand/social-card.png` | 1200 × 630 Open Graph / Twitter card |
| `public/brand/banner.png` | Source banner artwork |
| `public/brand/banner-icon.svg` | In-app banner mark |

`index.html` wires the favicon set, the manifest, and the `og:` / `twitter:`
metadata. `npm run build` runs `scripts/verify-deployment.mjs`, which fails if
any of these files or the metadata disappears from the output.
