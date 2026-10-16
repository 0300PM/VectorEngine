# Scene format 1.0

A scene is a JSON object with `version`, `document`, and `objects` properties. Unknown properties are rejected.

## Document

| Property | Type | Required | Description |
|---|---|---:|---|
| `width` | integer | yes | Width from 1 to 16,384 |
| `height` | integer | yes | Height from 1 to 16,384 |
| `unit` | string | no | `px`, `pt`, `mm`, `cm`, or `in`; defaults to `px` |
| `background` | color | no | Hexadecimal color or `none` |

Colors accept `#RGB`, `#RGBA`, `#RRGGBB`, and `#RRGGBBAA`.

## Common object properties

| Property | Type | Default |
|---|---|---|
| `id` | string | required |
| `type` | string | required |
| `fill` | color or `none` | shape dependent |
| `stroke` | color or `none` | shape dependent |
| `strokeWidth` | number | `1` |
| `opacity` | number from 0 to 1 | `1` |
| `visible` | boolean | `true` |
| `transform` | object | identity |

Identifiers must start with an ASCII letter and may continue with letters, digits, `_`, `.`, `:`, or `-`. Identifiers are unique across the entire scene, including nested groups.

## Transform

A transform object may contain:

- `translateX` and `translateY`
- `rotate` in degrees
- `scaleX` and `scaleY`
- `skewX` and `skewY` in degrees
- `originX` and `originY`

The normalized operation order is translation, origin translation, rotation, skew, scale, and inverse origin translation.

## Rectangle

Required properties are `x`, `y`, `width`, and `height`. Optional `rx` and `ry` create rounded corners.

## Circle

Required properties are `cx`, `cy`, and `radius`.

## Ellipse

Required properties are `cx`, `cy`, `rx`, and `ry`.

## Line

Required properties are `x1`, `y1`, `x2`, and `y2`. The default stroke is `#171717` and default fill is `none`.

## Polygon and polyline

`points` is an array of `{ "x": number, "y": number }` objects. A polygon requires at least three points. A polyline requires at least two points.

## Path

`d` contains SVG-compatible path data. Version 1.0 supports `M`, `L`, `H`, `V`, `C`, `S`, `Q`, `T`, `A`, and `Z`, including relative forms. `fillRule` accepts `nonzero` or `evenodd`.

Path data cannot contain scripts, URLs, style declarations, or external references.

## Text

Required properties are `x`, `y`, and `content`. Optional properties are:

- `fontSize`
- `fontFamily`
- `fontWeight` from 100 to 900
- `textAnchor` as `start`, `middle`, or `end`
- `letterSpacing`

SVG output preserves the declared text properties. Native raster output uses a deterministic built-in ASCII font and replaces unsupported characters with `?`. Browser raster export uses the browser's local font resolver.

## Group

A group contains a `children` array of scene objects. Group transforms and opacity compose with child values. Group nesting is limited to 32 levels.

## Draw order

Objects are painted in array order. Later objects appear above earlier objects. Group children follow the same rule.
