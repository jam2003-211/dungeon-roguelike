export const SCREEN_IDS = ['title', 'town', 'dungeon', 'equipment', 'status', 'jobs', 'settings'] as const

export type ScreenId = (typeof SCREEN_IDS)[number]

export interface NavigationState {
  current: ScreenId
  previous: ScreenId[]
}

export function isScreenId(value: unknown): value is ScreenId {
  return typeof value === 'string' && SCREEN_IDS.some((screen) => screen === value)
}

export function createInitialNavigation(): NavigationState {
  return { current: 'title', previous: [] }
}

// 将来、セーブ有無や初回起動処理をここで判定して遷移先を変える。
export function getGameStartScreen(): ScreenId {
  return 'town'
}

export function navigate(state: NavigationState, target: ScreenId): NavigationState {
  if (state.current === target) return state
  return { current: target, previous: [...state.previous, state.current] }
}

export function getPreviousNavigation(state: NavigationState): NavigationState {
  const previousScreen = state.previous.at(-1)
  if (previousScreen === undefined) return state
  return { current: previousScreen, previous: state.previous.slice(0, -1) }
}

export function readNavigationState(value: unknown): NavigationState | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as { current?: unknown; previous?: unknown }
  if (!isScreenId(candidate.current) || !Array.isArray(candidate.previous) || !candidate.previous.every(isScreenId)) return null
  return { current: candidate.current, previous: [...candidate.previous] }
}
