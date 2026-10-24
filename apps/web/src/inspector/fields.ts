import type { FillRule, SceneObject, TextAnchor, Transform } from '@/types/scene'

export type FieldSection = 'Transform' | 'Appearance' | 'Shape'
export type ObjectType = SceneObject['type']
export type NumericBound = number | ((object: SceneObject) => number)

export interface FieldBase {
  key: string
  label: string
  section: FieldSection
  types: readonly ObjectType[] | 'all'
}

export interface NumberField extends FieldBase {
  kind: 'number'
  min: NumericBound
  max: NumericBound
  step?: number
  unit?: string
  integer?: boolean
  multipleOf?: number
  dimensionRole?: 'width' | 'height'
  pairedKey?: string
  read: (object: SceneObject) => number | undefined
  write: (object: SceneObject, value: number) => Record<string, unknown>
}

export interface ColorField extends FieldBase {
  kind: 'color'
  allowNone: boolean
  read: (object: SceneObject) => string | undefined
  write: (object: SceneObject, value: string) => Record<string, unknown>
}

export interface SelectField extends FieldBase {
  kind: 'select'
  options: readonly { value: string; label: string }[]
  read: (object: SceneObject) => string | undefined
  write: (object: SceneObject, value: string) => Record<string, unknown>
}

export interface TextField extends FieldBase {
  kind: 'text'
  read: (object: SceneObject) => string | undefined
  write: (object: SceneObject, value: string) => Record<string, unknown>
  placeholder?: string
  maxlength?: number
}

export interface InfoField extends FieldBase {
  kind: 'info'
  read: (object: SceneObject) => string
}

export type InspectorField =
  | NumberField
  | ColorField
  | SelectField
  | TextField
  | InfoField

export interface FieldState {
  field: InspectorField
  value: number | string | null
  mixed: boolean
  supportedCount: number
  totalCount: number
  representative: SceneObject | null
}

const coordMax = 1_000_000
const sizeMax = 1_000_000
const derivedSizeMax = 2_000_000

const transformOf = (object: SceneObject): Transform => object.transform ?? {}

const setTransform = (
  object: SceneObject,
  patch: Partial<Transform>,
): Record<string, unknown> => ({
  transform: { ...transformOf(object), ...patch },
})

const readTransform = (
  object: SceneObject,
  key: keyof Transform,
  fallback: number,
): number => {
  const value = transformOf(object)[key]
  return typeof value === 'number' ? value : fallback
}

const readPosition = (object: SceneObject, axis: 'x' | 'y'): number | undefined => {
  switch (object.type) {
    case 'rect':
    case 'text':
      return axis === 'x' ? object.x : object.y
    case 'circle':
    case 'ellipse':
      return axis === 'x' ? object.cx : object.cy
    case 'line':
      return axis === 'x' ? object.x1 : object.y1
    case 'group':
      return readTransform(object, axis === 'x' ? 'translateX' : 'translateY', 0)
    default:
      return undefined
  }
}

const writePosition = (
  object: SceneObject,
  axis: 'x' | 'y',
  value: number,
): Record<string, unknown> => {
  switch (object.type) {
    case 'rect':
    case 'text':
      return axis === 'x' ? { x: value } : { y: value }
    case 'circle':
    case 'ellipse':
      return axis === 'x' ? { cx: value } : { cy: value }
    case 'line':
      return axis === 'x' ? { x1: value } : { y1: value }
    case 'group':
      return setTransform(object, axis === 'x' ? { translateX: value } : { translateY: value })
    default:
      return {}
  }
}

const readDimension = (
  object: SceneObject,
  role: 'width' | 'height',
): number | undefined => {
  switch (object.type) {
    case 'rect':
      return role === 'width' ? object.width : object.height
    case 'circle':
      return object.radius * 2
    case 'ellipse':
      return role === 'width' ? object.rx * 2 : object.ry * 2
    default:
      return undefined
  }
}

const writeDimension = (
  object: SceneObject,
  role: 'width' | 'height',
  value: number,
): Record<string, unknown> => {
  switch (object.type) {
    case 'rect':
      return role === 'width' ? { width: value } : { height: value }
    case 'circle':
      return { radius: value / 2 }
    case 'ellipse':
      return role === 'width' ? { rx: value / 2 } : { ry: value / 2 }
    default:
      return {}
  }
}

export const dimensionRatio = (object: SceneObject): number | null => {
  switch (object.type) {
    case 'rect':
      return object.height > 0 ? object.width / object.height : null
    case 'circle':
      return 1
    case 'ellipse':
      return object.ry > 0 ? object.rx / object.ry : null
    default:
      return null
  }
}

const sizeBound = (object: SceneObject): number =>
  object.type === 'rect' ? sizeMax : derivedSizeMax

export const INSPECTOR_FIELDS: readonly InspectorField[] = [
  {
    key: 'posX',
    label: 'Position X',
    section: 'Transform',
    types: ['rect', 'circle', 'ellipse', 'line', 'text', 'group'],
    kind: 'number',
    min: -coordMax,
    max: coordMax,
    step: 1,
    unit: 'px',
    read: (object) => readPosition(object, 'x'),
    write: (object, value) => writePosition(object, 'x', value),
  },
  {
    key: 'posY',
    label: 'Position Y',
    section: 'Transform',
    types: ['rect', 'circle', 'ellipse', 'line', 'text', 'group'],
    kind: 'number',
    min: -coordMax,
    max: coordMax,
    step: 1,
    unit: 'px',
    read: (object) => readPosition(object, 'y'),
    write: (object, value) => writePosition(object, 'y', value),
  },
  {
    key: 'width',
    label: 'Width',
    section: 'Transform',
    types: ['rect', 'circle', 'ellipse'],
    kind: 'number',
    min: 0,
    max: sizeBound,
    step: 1,
    unit: 'px',
    dimensionRole: 'width',
    pairedKey: 'height',
    read: (object) => readDimension(object, 'width'),
    write: (object, value) => writeDimension(object, 'width', value),
  },
  {
    key: 'height',
    label: 'Height',
    section: 'Transform',
    types: ['rect', 'circle', 'ellipse'],
    kind: 'number',
    min: 0,
    max: sizeBound,
    step: 1,
    unit: 'px',
    dimensionRole: 'height',
    pairedKey: 'width',
    read: (object) => readDimension(object, 'height'),
    write: (object, value) => writeDimension(object, 'height', value),
  },
  {
    key: 'rotation',
    label: 'Rotation',
    section: 'Transform',
    types: 'all',
    kind: 'number',
    min: -360,
    max: 360,
    step: 1,
    unit: '°',
    read: (object) => readTransform(object, 'rotate', 0),
    write: (object, value) => setTransform(object, { rotate: value }),
  },
  {
    key: 'scaleX',
    label: 'Scale X',
    section: 'Transform',
    types: 'all',
    kind: 'number',
    min: -10,
    max: 10,
    step: 0.01,
    read: (object) => readTransform(object, 'scaleX', 1),
    write: (object, value) => setTransform(object, { scaleX: value }),
  },
  {
    key: 'scaleY',
    label: 'Scale Y',
    section: 'Transform',
    types: 'all',
    kind: 'number',
    min: -10,
    max: 10,
    step: 0.01,
    read: (object) => readTransform(object, 'scaleY', 1),
    write: (object, value) => setTransform(object, { scaleY: value }),
  },
  {
    key: 'originX',
    label: 'Origin X',
    section: 'Transform',
    types: 'all',
    kind: 'number',
    min: -coordMax,
    max: coordMax,
    step: 1,
    unit: 'px',
    read: (object) => readTransform(object, 'originX', 0),
    write: (object, value) => setTransform(object, { originX: value }),
  },
  {
    key: 'originY',
    label: 'Origin Y',
    section: 'Transform',
    types: 'all',
    kind: 'number',
    min: -coordMax,
    max: coordMax,
    step: 1,
    unit: 'px',
    read: (object) => readTransform(object, 'originY', 0),
    write: (object, value) => setTransform(object, { originY: value }),
  },
  {
    key: 'fill',
    label: 'Fill',
    section: 'Appearance',
    types: 'all',
    kind: 'color',
    allowNone: true,
    read: (object) => object.fill,
    write: (_object, value) => ({ fill: value }),
  },
  {
    key: 'stroke',
    label: 'Stroke',
    section: 'Appearance',
    types: 'all',
    kind: 'color',
    allowNone: true,
    read: (object) => object.stroke,
    write: (_object, value) => ({ stroke: value }),
  },
  {
    key: 'strokeWidth',
    label: 'Stroke Width',
    section: 'Appearance',
    types: 'all',
    kind: 'number',
    min: 0,
    max: 10_000,
    step: 1,
    unit: 'px',
    read: (object) => object.strokeWidth,
    write: (_object, value) => ({ strokeWidth: value }),
  },
  {
    key: 'opacity',
    label: 'Opacity',
    section: 'Appearance',
    types: 'all',
    kind: 'number',
    min: 0,
    max: 1,
    step: 0.01,
    read: (object) => object.opacity,
    write: (_object, value) => ({ opacity: value }),
  },
  {
    key: 'rx',
    label: 'Corner Radius X',
    section: 'Shape',
    types: ['rect'],
    kind: 'number',
    min: 0,
    max: sizeMax,
    step: 1,
    unit: 'px',
    read: (object) => (object.type === 'rect' ? object.rx : undefined),
    write: (object, value) => (object.type === 'rect' ? { rx: value } : {}),
  },
  {
    key: 'ry',
    label: 'Corner Radius Y',
    section: 'Shape',
    types: ['rect'],
    kind: 'number',
    min: 0,
    max: sizeMax,
    step: 1,
    unit: 'px',
    read: (object) => (object.type === 'rect' ? object.ry : undefined),
    write: (object, value) => (object.type === 'rect' ? { ry: value } : {}),
  },
  {
    key: 'radius',
    label: 'Radius',
    section: 'Shape',
    types: ['circle'],
    kind: 'number',
    min: 0,
    max: sizeMax,
    step: 1,
    unit: 'px',
    read: (object) => (object.type === 'circle' ? object.radius : undefined),
    write: (object, value) => (object.type === 'circle' ? { radius: value } : {}),
  },
  {
    key: 'ellipseRx',
    label: 'Radius X',
    section: 'Shape',
    types: ['ellipse'],
    kind: 'number',
    min: 0,
    max: sizeMax,
    step: 1,
    unit: 'px',
    read: (object) => (object.type === 'ellipse' ? object.rx : undefined),
    write: (object, value) => (object.type === 'ellipse' ? { rx: value } : {}),
  },
  {
    key: 'ellipseRy',
    label: 'Radius Y',
    section: 'Shape',
    types: ['ellipse'],
    kind: 'number',
    min: 0,
    max: sizeMax,
    step: 1,
    unit: 'px',
    read: (object) => (object.type === 'ellipse' ? object.ry : undefined),
    write: (object, value) => (object.type === 'ellipse' ? { ry: value } : {}),
  },
  {
    key: 'lineEndX',
    label: 'End X',
    section: 'Shape',
    types: ['line'],
    kind: 'number',
    min: -coordMax,
    max: coordMax,
    step: 1,
    unit: 'px',
    read: (object) => (object.type === 'line' ? object.x2 : undefined),
    write: (object, value) => (object.type === 'line' ? { x2: value } : {}),
  },
  {
    key: 'lineEndY',
    label: 'End Y',
    section: 'Shape',
    types: ['line'],
    kind: 'number',
    min: -coordMax,
    max: coordMax,
    step: 1,
    unit: 'px',
    read: (object) => (object.type === 'line' ? object.y2 : undefined),
    write: (object, value) => (object.type === 'line' ? { y2: value } : {}),
  },
  {
    key: 'vertexCount',
    label: 'Vertices',
    section: 'Shape',
    types: ['polygon', 'polyline'],
    kind: 'info',
    read: (object) => (object.type === 'polygon' || object.type === 'polyline'
      ? String(object.points.length)
      : '0'),
  },
  {
    key: 'fillRule',
    label: 'Fill Rule',
    section: 'Shape',
    types: ['path'],
    kind: 'select',
    options: [
      { value: 'nonzero', label: 'Non-zero' },
      { value: 'evenodd', label: 'Even-odd' },
    ],
    read: (object) => (object.type === 'path' ? (object.fillRule ?? 'nonzero') : undefined),
    write: (object, value) => (object.type === 'path' ? { fillRule: value as FillRule } : {}),
  },
  {
    key: 'pathLength',
    label: 'Path Length',
    section: 'Shape',
    types: ['path'],
    kind: 'info',
    read: (object) => (object.type === 'path' ? String(object.d.length) : '0'),
  },
  {
    key: 'content',
    label: 'Text',
    section: 'Shape',
    types: ['text'],
    kind: 'text',
    placeholder: 'Enter text',
    maxlength: 100_000,
    read: (object) => (object.type === 'text' ? object.content : undefined),
    write: (object, value) => (object.type === 'text' ? { content: value } : {}),
  },
  {
    key: 'fontSize',
    label: 'Font Size',
    section: 'Shape',
    types: ['text'],
    kind: 'number',
    min: 1,
    max: sizeMax,
    step: 1,
    unit: 'px',
    read: (object) => (object.type === 'text' ? object.fontSize : undefined),
    write: (object, value) => (object.type === 'text' ? { fontSize: value } : {}),
  },
  {
    key: 'fontWeight',
    label: 'Font Weight',
    section: 'Shape',
    types: ['text'],
    kind: 'number',
    min: 100,
    max: 900,
    step: 100,
    integer: true,
    multipleOf: 100,
    read: (object) => (object.type === 'text' ? object.fontWeight : undefined),
    write: (object, value) => (object.type === 'text' ? { fontWeight: value } : {}),
  },
  {
    key: 'textAnchor',
    label: 'Text Anchor',
    section: 'Shape',
    types: ['text'],
    kind: 'select',
    options: [
      { value: 'start', label: 'Start' },
      { value: 'middle', label: 'Middle' },
      { value: 'end', label: 'End' },
    ],
    read: (object) => (object.type === 'text' ? (object.textAnchor ?? 'start') : undefined),
    write: (object, value) => (object.type === 'text' ? { textAnchor: value as TextAnchor } : {}),
  },
  {
    key: 'letterSpacing',
    label: 'Letter Spacing',
    section: 'Shape',
    types: ['text'],
    kind: 'number',
    min: -1000,
    max: 1000,
    step: 0.1,
    unit: 'px',
    read: (object) => (object.type === 'text' ? object.letterSpacing : undefined),
    write: (object, value) => (object.type === 'text' ? { letterSpacing: value } : {}),
  },
  {
    key: 'fontFamily',
    label: 'Font Family',
    section: 'Shape',
    types: ['text'],
    kind: 'text',
    placeholder: 'sans-serif',
    maxlength: 128,
    read: (object) => (object.type === 'text' ? object.fontFamily : undefined),
    write: (object, value) => (object.type === 'text' ? { fontFamily: value } : {}),
  },
]

const FIELD_BY_KEY = new Map<string, InspectorField>(
  INSPECTOR_FIELDS.map((field) => [field.key, field]),
)

export const getFieldByKey = (key: string): InspectorField | undefined =>
  FIELD_BY_KEY.get(key)

export const fieldApplies = (field: InspectorField, object: SceneObject): boolean =>
  field.types === 'all' || field.types.includes(object.type)

export const fieldAppliesToAny = (
  field: InspectorField,
  types: ReadonlySet<ObjectType>,
): boolean => field.types === 'all' || field.types.some((type) => types.has(type))

const valuesEqual = (left: number | string, right: number | string): boolean => {
  if (typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) < 1e-6
  }
  return left === right
}

export const resolveFieldState = (
  field: InspectorField,
  objects: readonly SceneObject[],
): FieldState => {
  const applicable = objects.filter((object) => fieldApplies(field, object))
  const supportedCount = applicable.length
  const representative = applicable[0] ?? null

  if (applicable.length === 0) {
    return { field, value: null, mixed: false, supportedCount, totalCount: objects.length, representative }
  }

  const raw = applicable.map((object) => field.read(object))

  if (field.kind === 'info') {
    return {
      field,
      value: raw[0] ?? '',
      mixed: false,
      supportedCount,
      totalCount: objects.length,
      representative,
    }
  }

  const defined = raw.filter((value): value is number | string => value !== undefined)
  if (defined.length === 0) {
    return { field, value: null, mixed: false, supportedCount, totalCount: objects.length, representative }
  }

  const anchor = defined[0]!
  const allEqual = defined.every((value) => valuesEqual(value, anchor))

  return {
    field,
    value: allEqual ? anchor : null,
    mixed: !allEqual,
    supportedCount,
    totalCount: objects.length,
    representative,
  }
}

export const fieldsForSection = (section: FieldSection): readonly InspectorField[] =>
  INSPECTOR_FIELDS.filter((field) => field.section === section)
