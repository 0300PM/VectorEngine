export type Unit = 'px' | 'pt' | 'mm' | 'cm' | 'in'
export type FillRule = 'nonzero' | 'evenodd'
export type TextAnchor = 'start' | 'middle' | 'end'
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
export type GradientUnits = 'objectBoundingBox' | 'userSpaceOnUse'
export type SpreadMethod = 'pad' | 'reflect' | 'repeat'

export interface Point {
  x: number
  y: number
}

export interface Transform {
  translateX?: number
  translateY?: number
  rotate?: number
  scaleX?: number
  scaleY?: number
  skewX?: number
  skewY?: number
  originX?: number
  originY?: number
}

export interface GradientStop {
  offset: number
  color: string
  opacity?: number
}

export interface LinearGradient {
  id: string
  type: 'linear'
  gradientUnits?: GradientUnits
  spreadMethod?: SpreadMethod
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  stops: GradientStop[]
}

export interface RadialGradient {
  id: string
  type: 'radial'
  gradientUnits?: GradientUnits
  spreadMethod?: SpreadMethod
  cx?: number
  cy?: number
  r?: number
  fx?: number
  fy?: number
  stops: GradientStop[]
}

export type SceneGradient = LinearGradient | RadialGradient

export interface SceneWorkspace {
  id: string
  name?: string
  x: number
  y: number
  width: number
  height: number
}

export interface CommonObject {
  id: string
  name?: string
  layerId?: string
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  blendMode?: BlendMode
  transform?: Transform
  visible?: boolean
}

export interface RectangleObject extends CommonObject {
  type: 'rect'
  x: number
  y: number
  width: number
  height: number
  rx?: number
  ry?: number
}

export interface CircleObject extends CommonObject {
  type: 'circle'
  cx: number
  cy: number
  radius: number
}

export interface EllipseObject extends CommonObject {
  type: 'ellipse'
  cx: number
  cy: number
  rx: number
  ry: number
}

export interface LineObject extends CommonObject {
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PolygonObject extends CommonObject {
  type: 'polygon'
  points: Point[]
}

export interface PolylineObject extends CommonObject {
  type: 'polyline'
  points: Point[]
}

export interface PathObject extends CommonObject {
  type: 'path'
  d: string
  fillRule?: FillRule
}

export interface TextObject extends CommonObject {
  type: 'text'
  x: number
  y: number
  content: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: number
  textAnchor?: TextAnchor
  letterSpacing?: number
}

export interface GroupObject extends CommonObject {
  type: 'group'
  children: SceneObject[]
}

export type SceneObject =
  | RectangleObject
  | CircleObject
  | EllipseObject
  | LineObject
  | PolygonObject
  | PolylineObject
  | PathObject
  | TextObject
  | GroupObject

export interface SceneLayer {
  id: string
  name?: string
  visible?: boolean
  opacity?: number
  objects: SceneObject[]
}

export interface SceneDocument {
  width: number
  height: number
  unit?: Unit
  background?: string
  gradients?: SceneGradient[]
  workspaces?: SceneWorkspace[]
}

export interface VectorScene {
  version: '1.0'
  document: SceneDocument
  gradients?: SceneGradient[]
  layers?: SceneLayer[]
  objects: SceneObject[]
}
