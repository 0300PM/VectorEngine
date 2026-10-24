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
  { kind: 'select', label: 'Wybór', icon: 'cursor', cursor: 'default', hint: 'Wybierz ścieżkę i edytuj punkty' },
  { kind: 'line', label: 'Linia', icon: 'line', cursor: 'crosshair', hint: 'Kliknij, aby zarysować segment' },
  { kind: 'polyline', label: 'Wielościęń', icon: 'polyline', cursor: 'crosshair', hint: 'Kliknij, aby zarysować wielościęń' },
  { kind: 'pen', label: 'Rysownik', icon: 'pen', cursor: 'crosshair', hint: 'Kliknij, aby dodać punkt, długo przycisz, aby zmienić pochyłkie' },
  { kind: 'arc', label: 'Łuk', icon: 'arc', cursor: 'crosshair', hint: 'Naciśnij i pociągnij, aby zarysować łuk' },
  { kind: 'polygon', label: 'Wielokąt', icon: 'polygon', cursor: 'crosshair', hint: 'Kliknij, aby zarysować wielokąt' },
  { kind: 'star', label: 'Gwiazda', icon: 'star', cursor: 'crosshair', hint: 'Naciśnij i pociągnij, aby zarysować gwiazdę' },
] as const

export const PATH_TOOL_LABELS: Record<PathToolKind, string> = PATH_TOOLS.reduce(
  (accumulator, tool) => ({ ...accumulator, [tool.kind]: tool.label }),
  {} as Record<PathToolKind, string>,
)

export const getPathTool = (kind: PathToolKind): PathToolDefinition =>
  PATH_TOOLS.find((tool) => tool.kind === kind) ?? PATH_TOOLS[0]!
