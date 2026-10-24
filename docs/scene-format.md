# Scene format 1.0

A scene is a JSON object with `version`, `document`, `objects`, and optional top-level `gradients` and `layers`. Unknown properties are rejected with structured schema errors.

## Document

| Property | Type | Required | Description |
|---|---|---:|---|
| `width` | integer | yes | Width from 1 to 16,384 |
| `height` | integer | yes | Height from 1 to 16,384 |
| `unit` | string | no | `px`, `pt`, `mm`, `cm`, or `in`; defaults to `px` |
| `background` | color | no | Hexadecimal color or `none` |
| `gradients` | array | no | Linear or radial gradient definitions |
| `workspaces` | array | no | Named rectangular export regions (`{ id, name?, x, y, width, height }`) |

Colors accept `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA`, `none`, or `url(#gradientId)` paint references.

## Gradients

`linear` and `radial` gradients contain at least two stops (`{ offset: 0..1, color, opacity? }`), optional `gradientUnits` (`objectBoundingBox` or `userSpaceOnUse`), and optional `spreadMethod` (`pad`, `reflect`, or `repeat`). Unsupported gradient types emit `unsupported.gradient`.

## Layers

Optional `layers` entries (`{ id, name?, visible?, opacity?, objects }`) organize objects into named exportable layers while preserving array draw order. Individual objects may also declare `layerId`.

## Common object properties

| Property | Type | Default |
|---|---|---|
| `id` | string | required |
| `name` | string | optional |
| `layerId` | string | optional |
| `type` | string | required |
| `fill` | color, `url(#id)`, or `none` | shape dependent |
| `stroke` | color, `url(#id)`, or `none` | shape dependent |
| `strokeWidth` | number | `1` |
| `opacity` | number from 0 to 1 | `1` |
| `blendMode` | string | `'normal'` |
| `visible` | boolean | `true` |
| `transform` | object | identity |
