import type { IconName } from '@/ui/icons'

export type PathToolKind = 'select' | 'line' | 'polyline' | 'pen' | 'arc' | 'polygon' | 'star'

export interface PathToolDefinition {
  kind: PathToolKind
  label: string
  icon: IconName
  cursor: string
  hint: string
}

export const PATH_TOOLS: readonly PathToolDefinition[] = [
  { kind: 'select', label: 'Select', icon: 'cursor', cursor: 'default', hint: 'Select a path and edit its nodes' },
  { kind: 'line', label: 'Line', icon: 'line', cursor: 'crosshair', hint: 'Click to draw a segment' },
  { kind: 'polyline', label: 'Polyline', icon: 'polyline', cursor: 'crosshair', hint: 'Click to draw a polyline' },
  { kind: 'pen', label: 'Pen', icon: 'pen', cursor: 'crosshair', hint: 'Click to add a node; drag to pull handles' },
  { kind: 'arc', label: 'Arc', icon: 'arc', cursor: 'crosshair', hint: 'Press and drag to draw an arc' },
  { kind: 'polygon', label: 'Polygon', icon: 'polygon', cursor: 'crosshair', hint: 'Click to draw a polygon' },
  { kind: 'star', label: 'Star', icon: 'star', cursor: 'crosshair', hint: 'Press and drag to draw a star' },
] as const

export const PATH_TOOL_LABELS: Record<PathToolKind, string> = PATH_TOOLS.reduce(
  (accumulator, tool) => ({ ...accumulator, [tool.kind]: tool.label }),
  {} as Record<PathToolKind, string>,
)

export const getPathTool = (kind: PathToolKind): PathToolDefinition =>
  PATH_TOOLS.find((tool) => tool.kind === kind) ?? PATH_TOOLS[0]!
