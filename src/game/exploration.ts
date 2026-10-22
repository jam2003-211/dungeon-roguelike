import { FOREST_MAP, PLAYER_START, isPassable, type ForestMap, type Position } from './forestMap'

export type Direction = 'up' | 'down' | 'left' | 'right'

export interface ExplorationState {
  position: Position
  turn: number
}

const directionOffsets: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export function createExplorationState(): ExplorationState {
  return { position: { ...PLAYER_START }, turn: 0 }
}

export function advanceTurn(turn: number): number {
  return turn + 1
}

export function movePlayer(state: ExplorationState, direction: Direction, map: ForestMap = FOREST_MAP): ExplorationState {
  const offset = directionOffsets[direction]
  const destination = { x: state.position.x + offset.x, y: state.position.y + offset.y }
  if (!isPassable(map, destination)) return state
  return { position: destination, turn: advanceTurn(state.turn) }
}

export function directionFromKey(key: string): Direction | null {
  const directions: Record<string, Direction> = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
  }
  return directions[key] ?? null
}
