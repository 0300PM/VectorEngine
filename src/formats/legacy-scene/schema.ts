import { z } from 'zod'
import { isColor } from '@/core/color'

const finite = z.number()
const color = z.string().refine(isColor, { message: 'Unsupported color format' })
const vec2 = z.tuple([finite, finite])

const transformSchema = z
  .object({
    translate: vec2.optional(),
    scale: vec2.optional(),
    rotate: finite.optional(),
    origin: vec2.optional(),
  })
  .optional()

const shapeBase = {
  opacity: finite.min(0).max(1).default(1),
  transform: transformSchema,
}

const lineShapeSchema = z.object({
  ...shapeBase,
  type: z.literal('line'),
  x1: finite,
  y1: finite,
  x2: finite,
  y2: finite,
  color: color.optional(),
  stroke: color.optional(),
  thickness: finite.min(0).default(1),
})

const rectShapeSchema = z.object({
  ...shapeBase,
  type: z.literal('rect'),
  x: finite,
  y: finite,
  width: finite.min(0),
  height: finite.min(0),
  fill: color.optional(),
  stroke: color.optional(),
  strokeWidth: finite.min(0).default(1),
})

const circleShapeSchema = z.object({
  ...shapeBase,
  type: z.literal('circle'),
  cx: finite,
  cy: finite,
  r: finite.min(0),
  fill: color.optional(),
  stroke: color.optional(),
  strokeWidth: finite.min(0).default(1),
})

export const legacyShapeSchema = z.discriminatedUnion('type', [
  lineShapeSchema,
  rectShapeSchema,
  circleShapeSchema,
])

export const legacySceneSchema = z.object({
  width: finite.positive(),
  height: finite.positive(),
  background: color.default('#ffffff'),
  shapes: z.array(legacyShapeSchema),
})

export type LegacyScene = z.output<typeof legacySceneSchema>
export type LegacyShape = z.output<typeof legacyShapeSchema>
export type LegacyTransform = NonNullable<LegacyShape['transform']>
