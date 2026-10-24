# Export formats

## SVG

SVG output preserves vector primitives, paths, text attributes, composed affine transforms, layer groups, `mix-blend-mode`, `<clipPath>` bounds clipping, and `<defs>` linear/radial gradients (`linearGradient`, `radialGradient`). Enabling `minifySvg` compacts numeric precision, path tokens, shorthand colors, and redundant default attributes without altering visual geometry.

## PNG

PNG encodes straight-alpha 8-bit RGBA channels (`colorType = 6`) losslessly. Document, custom HEX, and full alpha transparent backgrounds are preserved cleanly without premultiplication artifacts.

## JPEG

JPEG composites semi-transparent or transparent regions onto an opaque background (`#FFFFFF` when transparent background is requested, emitting an explicit alpha-flattening warning) and encodes baseline YCbCr DCT streams across quality levels `1` through `100`.

## BMP

Two explicit uncompressed bottom-up Windows BMP variants are supported:

- **24-bit BGR (`bmpBitDepth: 24`, default)**: 54-byte `BITMAPINFOHEADER`, 4-byte padded rows, opaque BGR channels composited over the resolved background (emits an explicit warning if transparency was requested).
- **32-bit BGRA (`bmpBitDepth: 32`)**: 122-byte `BITMAPV4HEADER` (`BI_BITFIELDS` sRGB masks), 4-byte BGRA pixels preserving full 8-bit alpha channel transparency.

## Scale, Dimensions, and Fit Modes

- Preset scale factors: `0.5×`, `1×`, `2×`, `3×`, `4×`, plus `Custom` pixel width and height (`1` to `16,384 px`, max `67,108,864` total pixels and `512 MB` working RAM guard).
- Aspect ratio fit modes when custom dimensions differ from source bounds: `contain` (letterbox/pad), `cover` (center crop), and `stretch` (non-uniform scale).
- Export margins (`0` to `4,096 px`), tight content bounds (`trimToBounds`), hidden element inclusion (`includeHidden`), and strict bounds clipping (`clipToBounds`).
