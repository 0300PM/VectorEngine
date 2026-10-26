import { collectSceneObjects } from '@/inspector/sceneTree'
import type { PathObject, SceneObject, VectorScene } from '@/types/scene'
import { booleanOnModels, type BooleanOperation } from './boolean'
import type { HandleKind, HandleMode, PathModel, Point } from './model'
import { parsePathData, serializePathModel } from './parser'
import {
  deleteNode,
  insertNode,
  joinSubpaths,
  moveHandle,
  moveNode,
  reverseSubpath,
  setClosed,
  setNodeMode,
  simplifyPath,
  splitSegmentCommand,
  splitSubpath,
} from './ops'

export type PathCommand =
  | { kind: 'move-node'; subpath: number; node: number; position: Point }
  | { kind: 'move-handle'; subpath: number; node: number; handle: HandleKind; position: Point }
  | { kind: 'insert-node'; subpath: number; node: number; position: Point }
  | { kind: 'delete-node'; subpath: number; node: number }
  | { kind: 'split-segment'; subpath: number; node: number; t: number }
  | { kind: 'reverse'; subpath: number }
  | { kind: 'toggle-closed'; subpath: number }
  | { kind: 'set-mode'; subpath: number; node: number; mode: HandleMode }
  | { kind: 'join'; first: number; second: number }
  | { kind: 'split-subpath'; subpath: number; node: number }
  | { kind: 'simplify'; tolerance: number }

export const applyPathCommand = (model: PathModel, command: PathCommand): PathModel => {
  switch (command.kind) {
    case 'move-node':
      return moveNode(model, command.subpath, command.node, command.position)
    case 'move-handle':
      return moveHandle(model, command.subpath, command.node, command.handle, command.position)
    case 'insert-node':
      return insertNode(model, command.subpath, command.node, command.position)
    case 'delete-node':
      return deleteNode(model, command.subpath, command.node)
    case 'split-segment':
      return splitSegmentCommand(model, command.subpath, command.node, command.t)
    case 'reverse':
      return reverseSubpath(model, command.subpath)
    case 'toggle-closed':
      return setClosed(model, command.subpath, !model.subpaths[command.subpath]?.closed)
    case 'set-mode':
      return setNodeMode(model, command.subpath, command.node, command.mode)
    case 'join':
      return joinSubpaths(model, command.first, command.second)
    case 'split-subpath':
      return splitSubpath(model, command.subpath, command.node)
    case 'simplify':
      return simplifyPath(model, command.tolerance)
    default:
      return model
  }
}

export const parsePathObject = (object: SceneObject): PathModel | null => {
  if (object.type !== 'path') {
    return null
  }
  return parsePathData(object.d)
}

export const serializePath = (model: PathModel): string => serializePathModel(model)

export interface NewPathOptions {
  id: string
  name: string
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export const createPathObject = (model: PathModel, options: NewPathOptions): PathObject => ({
  id: options.id,
  name: options.name,
  type: 'path',
  d: serializePathModel(model),
  fill: options.fill ?? 'none',
  stroke: options.stroke ?? '#1B2430',
  strokeWidth: options.strokeWidth ?? 2,
})

export const nextObjectId = (scene: VectorScene, prefix: string): string => {
  const used = new Set(collectSceneObjects(scene).map((object) => object.id))
  let index = 1
  while (used.has(`${prefix}-${index}`)) {
    index += 1
  }
  return `${prefix}-${index}`
}

export interface BooleanFailure {
  object: null
  reason: string
}

export type BooleanOutcome =
  | { object: PathObject; reason: '' }
  | BooleanFailure

export const buildBooleanObject = (
  left: PathModel,
  right: PathModel,
  operation: BooleanOperation,
  options: NewPathOptions,
): BooleanOutcome => {
  const outcome = booleanOnModels(operation, left, right)
  if (!outcome.supported || outcome.polygons.length === 0) {
    return { object: null, reason: outcome.reason || 'No result' }
  }
  return { object: createPathObject(outcome.model, options), reason: '' }
}
