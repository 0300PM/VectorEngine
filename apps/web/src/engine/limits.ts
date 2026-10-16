export const engineLimits = {
  sourceBytes: 4 * 1024 * 1024,
  documentDimension: 16_384,
  outputDimension: 16_384,
  outputPixels: 67_108_864,
  objects: 10_000,
  depth: 32,
  pathLength: 1_000_000,
} as const
