# Format adapters, compatibility and loss reports

This document is the authoritative description of what each format adapter supports. Every
statement here is backed by a test in `src/formats/**/*.test.ts` (the capability matrix below is
asserted by `src/formats/capabilities.test.ts`); a feature that is not listed as supported should
be treated as unsupported, even if a particular file happens to work.

## Adapter pipeline

All exports run through the same pipeline (`src/formats/compatibility`):

1. **Requirements** – `collectRequirements(document)` lists the document features in use
   (node types, fill/stroke, even-odd fills, opacity, colour alpha, layers, units, colour space,
   assets, metadata) together with the ids of the objects that use them.
2. **Capabilities** – every writer declares `capabilities: Record<DocumentFeature, FeatureSupport>`
   with one of `native`, `converted`, `rasterized`, `dropped` or `unsupported`.
3. **Analysis** – `analyzeCompatibility(document, writer)` combines both into a
   `CompatibilityReport` with issues classified as `info`, `warning`, `error` or `critical`,
   remedies per issue (`skip_objects`, `rasterize`, `flatten_alpha`, `convert_units`,
   `substitute_font`, `convert_colors`, `choose_other_format`, `cancel`) and a verdict:
   `faithful`, `lossy` or `blocked`. The verdict is `blocked` when every drawable object would be
   lost; the UI disables saving in that case.
4. **Conversion** – `convertDocument(writer, document, context)` writes the file and returns a
   `ConversionReport` (`processedObjects`, `skippedObjects`, `transformations`, `validation`,
   the pre-conversion issues, timestamps). Reports can be downloaded as JSON
   (`serializeConversionReport`, `reportVersion: 1`).

Severity rules (`src/formats/compatibility/analyze.ts`): content features (shapes, text, images,
groups) are `warning` when converted and `error` when dropped or unsupported; style features are
`warning` for any loss (rounded corners converted is `info`); structural features (layers, locks,
metadata) are `info`, except assets which are `warning`. `physicalUnits` converted is `info`.

Validation statuses: `passed` (the output was re-parsed successfully), `failed` (the output did
not parse) and `not_verified` (no parser available – e.g. SVG written outside a browser without an
injected XML parser).

## Capability matrix

| Feature               | `.vex` / JSON | SVG       | PDF         | PNG / WebP / TIFF / ICO | JPEG        |
| --------------------- | ------------- | --------- | ----------- | ----------------------- | ----------- |
| rectangle / ellipse   | native        | native    | native      | native                  | native      |
| path                  | native        | native    | native      | native                  | native      |
| text                  | native        | native    | converted   | unsupported             | unsupported |
| image                 | native        | converted | unsupported | unsupported             | unsupported |
| group                 | native        | native    | native      | native                  | native      |
| fill / stroke         | native        | native    | native      | native                  | native      |
| evenodd               | native        | native    | native      | converted               | converted   |
| cornerRadius          | native        | native    | native      | native                  | native      |
| nodeOpacity           | native        | native    | native      | native                  | native      |
| groupOpacity          | native        | native    | converted   | converted               | converted   |
| colorAlpha            | native        | native    | native      | native                  | dropped     |
| transparentBackground | native        | native    | native      | native                  | dropped     |
| layers                | native        | converted | dropped     | dropped                 | dropped     |
| hiddenLayers          | native        | converted | dropped     | dropped                 | dropped     |
| lockedLayers          | native        | converted | dropped     | dropped                 | dropped     |
| physicalUnits         | native        | native    | native      | converted               | converted   |
| displayP3             | native        | converted | converted   | converted               | converted   |
| assets                | converted     | converted | dropped     | dropped                 | dropped     |
| metadata              | native        | converted | native      | dropped                 | dropped     |

"converted" means the information survives in another form (documented below); "dropped" means it
is removed and reported; "unsupported" means the affected objects are skipped and reported. Raster
targets declare rendered geometry as `native` because the pixels are the faithful result of the
rendering; they are marked `medium: 'raster'` so the analyser never proposes rasterisation as a
remedy for them.

## SVG

Files: `src/formats/svg`. Reader and writer share the XML helpers, number/length parsing,
transform and path-data grammars. The XML parser is injectable (`createSvgReader(parse)`,
`createSvgWriter({ parse })`); the browser `DOMParser` is used by the application and
`@xmldom/xmldom` by the tests.

### Writer (`.svg` export)

- Root `<svg>` with `width`/`height` in document units and `viewBox` in document coordinates.
- Document name as `<title>`; opaque or translucent background as a `<rect data-role="background">`.
- Layers become top-level `<g id data-layer data-locked>` with `display="none"` for hidden layers
  and `opacity` for layer opacity (transformation `layers_as_groups`).
- Nodes: `rect` (with `rx`), `ellipse`, `path` (`fill-rule="evenodd"` when needed), `text`
  (`font-family`, `font-size`, `font-weight`, `font-style`, `xml:space="preserve"`), `image`
  (`href` to the asset path), `g` for groups. Transforms are written as `matrix(...)`.
- Colours are written as `#rrggbb` plus `fill-opacity` / `stroke-opacity`; strokes always use
  round joins and caps (what the rasteriser draws).
- Images whose asset reference is missing are skipped and listed in the report
  (`objects_skipped`); Display-P3 values are written as plain sRGB numbers (`colors_converted`).
- Output is validated by re-parsing it with the injected parser (`validation: passed/failed`).

### Reader (`.svg` import)

Supported:

- `width`/`height` in px, pt, mm, cm, in (percentages resolve against the `viewBox`); physical
  units become the document unit. `viewBox` plus `preserveAspectRatio` `xMidYMid meet` or `none`
  is baked into the top-level transforms. Missing sizes default to 300 × 150 px.
- Top-level `<g>` → layers (`data-layer`, `inkscape:label`, `data-locked`, `display:none`
  round-trip); loose shapes are collected into implicit layers in document order.
- Elements: `rect` (incl. `rx`/`ry`), `circle`, `ellipse`, `line`, `polyline`, `polygon`,
  `path` (full path-data grammar incl. arcs, relative and shorthand commands), `text` (text
  content with `tspan`s flattened), `image` (`href`/`xlink:href` kept as an asset reference),
  `g`, `a`, `switch` (treated as groups). `<title>` becomes the document name.
- Style cascade for presentation attributes and the `style` attribute: `fill`, `stroke`,
  `stroke-width`, `fill-opacity`, `stroke-opacity`, `opacity`, `fill-rule`, `color` /
  `currentColor`, `font-family`, `font-size` (keywords, em/%, units), `font-weight`,
  `font-style`, `display`, `visibility`.
- Colours: named colours, hex, `rgb()/rgba()`, `hsl()` as supported by `parseColor`; opacity is
  folded into the colour alpha.
- Gradients (`linearGradient`, `radialGradient`) are flattened to their first stop colour;
  unknown or unsupported paint servers (`pattern`, missing references) become `#808080`.
- Duplicate ids are renamed; ids are never left empty.

Not supported (reported as warnings, never silently): embedded CSS (`<style>`), `use`,
`symbol`, `marker`, `clipPath`, `mask`, `filter`, `foreignObject`, dash patterns, non-round joins
and caps, text layout (`text-anchor`, positioned `tspan`s, `textPath`), elliptical corner radii,
relative length units (approximated with 16 px), percentages inside shapes resolved against the
viewBox, CSS classes and external stylesheets. Malformed XML and non-`<svg>` roots fail the
import with a message; malformed transforms, path data and degenerate shapes skip only the
affected element.

## PDF

Files: `src/formats/pdf`. Writer only; no external dependency except `fflate` for FlateDecode.

- PDF 1.4, one page, `MediaBox` in points (`px` ×72/96, `pt`, `in` ×72, `mm` ×72/25.4,
  `cm` ×72/2.54), a top-level `cm` that flips the y axis so content is emitted in document units.
- Paths: `m`/`l`/`c`/`h` (quadratics are elevated to cubics), rounded rectangles and ellipses as
  Bézier approximations, `f`/`f*`/`S`/`B`/`B*` with round joins and caps (`1 J 1 j`).
- Transparency: object and layer opacity multiplied with colour alpha and expressed through
  `ExtGState` (`ca`/`CA`). Group opacity is applied to each child separately
  (`group_opacity_approximated`): overlapping translucent children composite differently than
  a true transparency group.
- Text: the standard 14 fonts only (`Helvetica`, `Times`, `Courier` families, bold and italic
  variants chosen from weight ≥ 600 and `font-style: italic`), reported as `font_substituted`.
  Non-ASCII characters are encoded through a `/Differences` array with Adobe glyph names for
  Latin-1 Supplement, Latin Extended-A and common punctuation; characters without a glyph name
  (or beyond 128 custom codes per font) become `?` and are reported as `text_encoded`. Whether a
  viewer renders those glyphs depends on its substitute font – fonts are not embedded.
- Images are unsupported and skipped; hidden layers are omitted; layers, locks and assets are
  dropped (all reported). `/Info` carries title, producer, creator and dates.
- Content streams are Flate-compressed by default (`content_compressed`, lossless).
- Self-validation (`validatePdfStructure`): header, `%%EOF`, `startxref`, 20-byte xref entries
  pointing at matching `N 0 obj` headers, trailer `/Root` and `/Size`. This is a structural check,
  not a full PDF parse; the output has additionally been verified with external readers
  (pypdf in strict mode, MuPDF) during development.

## Raster (PNG, JPEG, WebP, TIFF, ICO)

Files: `src/formats/raster`. Documents are rendered with the active engine into straight
(non-premultiplied) RGBA pixels; the encoders then produce the file. Text and images are not
rendered by the engines yet and are reported as unsupported; even-odd fills are rendered with the
non-zero rule (`fill_rule_converted`); physical units are converted to pixels at the document DPI
(or the DPI of the export variant). Hidden layers are omitted, visible layers flattened. Raster
sizes are limited to 16 384 px per side and 50 megapixels per image (`size_too_large` in export
plans) to keep memory bounded.

| Format | Encoder                                   | Notes                                                                                                                                                                                                                                                |
| ------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PNG    | in-house (`png.ts`, zlib via `fflate`)    | 8-bit RGBA, filter type 0, single `IDAT`, `pHYs` chunk with the export DPI. Deterministic output, works outside the browser. Files are somewhat larger than adaptive-filter encoders.                                                                |
| JPEG   | browser `canvas.toBlob` / `convertToBlob` | Transparency is flattened onto white (`alpha_flattened`); quality 0.1–1.                                                                                                                                                                             |
| WebP   | browser encoder                           | Lossy with quality 0.1–1; availability depends on the browser. Not available in Node tests without a canvas implementation.                                                                                                                          |
| TIFF   | in-house (`tiff.ts`)                      | Baseline TIFF 6.0, little-endian, uncompressed, 8-bit RGBA (`ExtraSamples = 2`, unassociated alpha), one strip, `XResolution`/`YResolution` in dpi. No compression, no multi-page, no CMYK or 16-bit; large images produce large files (4 bytes/px). |
| ICO    | in-house (`ico.ts`, PNG entries)          | 1–65535 images, each ≤ 256 × 256 px with unique sizes, stored as PNG (Windows Vista+ and all current browsers; very old readers that expect BMP entries are not supported). Multi-size ICOs are produced by export sets / Asset Studio.              |

Capabilities: PNG, WebP, TIFF and the composite ICO target share the PNG column of the matrix;
JPEG additionally drops colour alpha and transparent backgrounds. Encoders validate buffer sizes
and reject invalid dimensions; the ICO writer rejects oversized or duplicated sizes.
Outputs were additionally verified with ImageMagick (`identify`, pixel comparison PNG ↔ TIFF)
during development.

## Export sets and presets

Files: `src/formats/export-set`. An `ExportSet` is a list of variants plus a scope, evaluated
against the same document model and adapters as single-file export:

- **Variant**: `format` (`svg`, `pdf`, `png`, `jpeg`, `webp`, `tiff`, `ico`), `size`
  (`original`, `scale × factor`, `fixed` width × height with uniform "contain" fitting, or
  `sizes` for ICO), `background` (`document`, `transparent`, `color`), `padding` (fraction of the
  shorter side, ≤ 0.45), optional `recolor` (every fill and stroke gets one colour, images are
  left untouched), `quality` (JPEG/WebP), `dpi`, `suffix` or an explicit `fileName`.
- **Scope**: the whole document or a set of node ids; the selection is cropped to the union of
  the rendered bounds of those nodes (stroke width included) plus a proportional margin. Nodes
  without fill or stroke have no bounds and lead to `empty_scope`.
- **Plan** (`planExportSet`): resolves file names (`<base><suffix>.<ext>`, sanitised), pixel
  sizes, a compatibility report per variant (using the writer's capabilities, the raster target
  or the ICO target) and problems: `unsupported_format`, `invalid_size`, `size_too_large`,
  `ico_size_out_of_range`, `duplicate_file_name` (case-insensitive), `empty_scope`, `blocked`.
  A set only runs when the plan has no problems.
- **Run** (`runExportSet`): vector variants are framed at document level (`frameDocument`,
  a translated/scaled wrapper group), raster variants render the scene once per variant and fit
  it into the target pixels (`fitRenderScene`); ICO renders every size separately. Each output
  carries a `ConversionReport`; failures are collected per variant, an `AbortSignal` cancels the
  remaining variants. Padding and background are applied identically to vector and raster outputs.
- **Presets**: built-in `web-logo` (SVG, PNG 256/512/1024 transparent, PDF), `raster-scales`
  (PNG 1×/2×/3×) and `favicon`; custom presets are validated with a Zod schema and stored in
  `localStorage` (`vector-engine.export-presets`). The application downloads a single file directly
  (with its report) and several files as a ZIP with `export-report.json`.

Limitations: no artboards yet (one document = one page), fixed sizes always use "contain"
(no cropping/cover mode), `recolor` ignores images and gradients, the SVG/PDF writers keep their own
documented limits.

## Batch conversion

Files: `src/formats/batch`. `BatchQueue` is a framework-free queue of independent jobs:

- Each job has a unique id, the input bytes, a content hash (FNV-1a + length), a state
  (`pending`, `running`, `done`, `done_with_warnings`, `failed`, `cancelled`, `skipped`), outputs,
  warnings and timestamps. Files whose content hash was already queued are marked `skipped` with
  `duplicateOf` (can be disabled or retried).
- Jobs run with a configurable concurrency limit (1–8); the queue can be paused, resumed,
  reordered, jobs cancelled (running jobs via `AbortSignal`), retried or removed. A failing or
  cancelled job never affects the others.
- The processor (`createBatchProcessor`) reads the file through the `FormatRegistry` (extension and
  content sniffing), then runs the current export set; import warnings and partial failures mark
  the job `done_with_warnings`, unreadable or unsupported files mark it `failed`.
- Packaging (`createBatchArchive`): outputs are placed flat or under their original folder
  (`keepStructure`), name conflicts are resolved with `rename` (`name (2).ext`), `overwrite` or
  `skip`, and a `batch-report.json` session report (`reportVersion: 1`, per-job states, timings,
  per-output compatibility issues and transformations, dropped files) is added to the ZIP.

Limitations: inputs and outputs stay in memory until the queue is cleared (the browser tab is the
bound); the export set used by a job is the one selected when the job starts; the queue is not
persisted across reloads; folders are read through `webkitdirectory` / `webkitGetAsEntry`, which
all current browsers support but which is not part of a formal standard.

## Asset Studio

Files: `src/formats/asset-studio`. Both generators are thin layers over export sets, so they share
the rendering, framing, background and recolour pipeline.

- **Favicon set**: `favicon.ico` (16/32/48), `apple-touch-icon.png` (180), `icon-192.png`,
  `icon-512.png`, optional `icon.svg`, `site.webmanifest` (name, icons, theme colour) and
  `favicon.html` with the `<link>`/`<meta>` snippet. Missing required files are reported
  (`missing_file`).
- **App icon set**: `icon-<size>.png` for 48–1024 px (configurable sizes), optional monochrome
  (`recolor`, transparent background) and dark (`color` background, optional recolour) variants,
  plus `icons.json` describing every file.
- **Checks** (`checkIconReadability`): the icon is rendered at 16 px; `icon_sparse` when less than
  5 % of the pixels are opaque on a transparent background, `icon_overflow` when more than 98 %
  are, `strokes_too_thin` when a stroke is thinner than one device pixel at that size. These are
  heuristics meant to catch obviously broken icons, not a substitute for visual review.

Limitations: no maskable/adaptive-icon safe-zone validation beyond the padding option, no
platform-specific bundles (Xcode asset catalogs, Android mipmap folders) and no rounded-corner
masking; the SVG icon is the plain document export.

## `.vex` and document JSON

Both are lossless for the document model; assets are referenced but not embedded yet
(`assets: converted`). Readers report legacy formats, missing manifests, unknown container
entries and missing assets.
