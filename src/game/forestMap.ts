export const MAP_SIZE = 20

export type TileType = 'grass' | 'path' | 'ruinsFloor' | 'castleFloor' | 'tree' | 'rock' | 'stump' | 'wall' | 'pillar' | 'castleWall'
export type Position = Readonly<{ x: number; y: number }>
export type ForestMap = ReadonlyArray<ReadonlyArray<TileType>>

export const PLAYER_START: Position = { x: 2, y: 17 }
export const FUTURE_STAIRS_POSITION: Position = { x: 17, y: 2 }

const pathTiles: Position[] = [
  ...Array.from({ length: 18 }, (_, index) => ({ x: index + 1, y: 17 })),
  ...Array.from({ length: 16 }, (_, index) => ({ x: 9, y: index + 2 })),
  ...Array.from({ length: 9 }, (_, index) => ({ x: index + 9, y: 2 })),
  ...Array.from({ length: 9 }, (_, index) => ({ x: index + 1, y: 10 })),
]

const obstacles: ReadonlyArray<Readonly<{ tile: TileType; positions: Position[] }>> = [
  { tile: 'tree', positions: [{ x: 3, y: 4 }, { x: 6, y: 3 }, { x: 12, y: 4 }, { x: 16, y: 5 }, { x: 4, y: 8 }, { x: 14, y: 9 }, { x: 3, y: 13 }, { x: 6, y: 15 }, { x: 13, y: 14 }, { x: 16, y: 16 }] },
  { tile: 'rock', positions: [{ x: 2, y: 6 }, { x: 7, y: 7 }, { x: 12, y: 7 }, { x: 17, y: 11 }, { x: 5, y: 12 }, { x: 11, y: 15 }] },
  { tile: 'stump', positions: [{ x: 15, y: 3 }, { x: 2, y: 14 }, { x: 15, y: 13 }, { x: 4, y: 16 }] },
  { tile: 'wall', positions: [{ x: 12, y: 11 }, { x: 13, y: 11 }, { x: 14, y: 11 }, { x: 12, y: 12 }] },
]

function createForestMap(): ForestMap {
  const map: TileType[][] = Array.from({ length: MAP_SIZE }, (_, y) =>
    Array.from({ length: MAP_SIZE }, (_, x) => x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1 ? 'wall' : 'grass'),
  )

  for (const { x, y } of pathTiles) map[y][x] = 'path'
  for (const { tile, positions } of obstacles) {
    for (const { x, y } of positions) map[y][x] = tile
  }
  map[PLAYER_START.y][PLAYER_START.x] = 'path'
  map[FUTURE_STAIRS_POSITION.y][FUTURE_STAIRS_POSITION.x] = 'path'
  return map
}

export const FOREST_MAP = createForestMap()

export function isInsideMap(position: Position): boolean {
  return position.x >= 0 && position.y >= 0 && position.x < MAP_SIZE && position.y < MAP_SIZE
}

export function isPassable(map: ForestMap, position: Position): boolean {
  if (!isInsideMap(position)) return false
  const tile = map[position.y]?.[position.x]
  return tile === 'grass' || tile === 'path' || tile === 'ruinsFloor' || tile === 'castleFloor'
}
