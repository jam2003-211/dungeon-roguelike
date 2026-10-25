import { isInsideMap, type Position } from './forestMap'
export const VIEW_SIZE = 11
export const VIEW_RADIUS = Math.floor(VIEW_SIZE / 2)
export function cameraOrigin(player: Position): Position {
  return { x: player.x - VIEW_RADIUS, y: player.y - VIEW_RADIUS }
}
export function viewToMap(player: Position, column: number, row: number, mapSize = 20): Position | null {
  if (column < 0 || row < 0 || column >= VIEW_SIZE || row >= VIEW_SIZE) return null
  const origin = cameraOrigin(player)
  const position = { x: origin.x + column, y: origin.y + row }
  return isInsideMap(position) && position.x < mapSize && position.y < mapSize ? position : null
}
export function isInView(player: Position, position: Position): boolean {
  return isInsideMap(position) && Math.abs(position.x - player.x) <= VIEW_RADIUS && Math.abs(position.y - player.y) <= VIEW_RADIUS
}
