# Export formats

## SVG

SVG is serialized directly from the normalized scene graph. Geometry, paths, text, colors, opacity, and affine matrices remain vector values. XML text and attribute values are escaped. Output never includes external URLs, scripts, stylesheets, or foreign objects.

## PNG

PNG encodes the common RGBA buffer with lossless compression. Transparent document regions retain their alpha values unless a background override is selected.

## JPEG

JPEG converts RGBA pixels to RGB and composites transparency against the selected background. A missing background resolves to white. Quality is clamped to the inclusive range from 1 to 100.

## BMP

BMP output uses the Windows BITMAPINFOHEADER layout with:

- 24 bits per pixel
- BGR channel order
- Bottom-up rows
- Four-byte row alignment
- No compression
- Transparency composited against the selected background

## Dimensions

Output width and height are positive integers up to 16,384. Total raster area is limited to 67,108,864 pixels. SVG changes its output dimensions while preserving the document view box. Raster formats scale document coordinates into the requested pixel dimensions.
