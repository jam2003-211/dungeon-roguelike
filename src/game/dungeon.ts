import { createEnemy, type EnemyKind, type EnemyState } from './combat/combat'
import { MAP_SIZE, isPassable, type ForestMap, type Position, type TileType } from './forestMap'
import type { EquipmentCategory } from './player'

export type DungeonTheme = 'forest' | 'ruins' | 'castle'
export type DungeonStockId = 1 | 2 | 3

export interface EnemySpawn {
  id: string
  kind: EnemyKind
  level: number
  position: Position
  isBoss: boolean
}

export interface DungeonFloor {
  floor: number
  map: ForestMap
  start: Position
  stairs: Position
  chestCandidate: Position | null
  enemies: EnemySpawn[]
}

export interface GeneratedDungeon {
  visualSeed?: number
  version: 1
  level: number
  totalFloors: number
  enemyKinds: EnemyKind[]
  bossKind: EnemyKind
  featuredCategory: EquipmentCategory
  floors: DungeonFloor[]
}

export interface DungeonStock {
  id: DungeonStockId
  theme: DungeonTheme
  name: string
  unlockLevel: number
  dungeon: GeneratedDungeon | null
  highestFloor: number
  totalFloorsKnown: boolean
  cleared: boolean
}

export const MAX_DUNGEON_LEVEL = 1_000_000
export const DUNGEON_THEMES: Readonly<Record<DungeonTheme, { ground: TileType; obstacles: readonly TileType[] }>> = {
  forest: { ground: 'grass', obstacles: ['tree', 'rock', 'stump'] },
  ruins: { ground: 'ruinsFloor', obstacles: ['wall', 'pillar'] },
  castle: { ground: 'castleFloor', obstacles: ['castleWall', 'pillar'] },
}
const ALL_ENEMIES: EnemyKind[] = ['goblin', 'boar', 'slimeKing', 'cyclopsBat', 'stoneGolem', 'ghost']
const CATEGORIES: EquipmentCategory[] = ['weapon', 'armor', 'accessory']
const START: Position = { x: 2, y: 17 }
const directions: Position[] = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]
const ROOM_GRID_SIZE = 3
const ROOM_SLOT_SIZE = 6
const MIN_ROOM_SIZE = 3
const MAX_ROOM_SIZE = 5

export function createDungeonStocks(): DungeonStock[] {
  return [
    { id: 1, theme: 'forest', name: '森', unlockLevel: 1, dungeon: null, highestFloor: 0, totalFloorsKnown: false, cleared: false },
    { id: 2, theme: 'ruins', name: '遺跡', unlockLevel: 15, dungeon: null, highestFloor: 0, totalFloorsKnown: false, cleared: false },
    { id: 3, theme: 'castle', name: '城', unlockLevel: 30, dungeon: null, highestFloor: 0, totalFloorsKnown: false, cleared: false },
  ]
}

export function parseDungeonLevel(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null
  const level = Number(value)
  return Number.isSafeInteger(level) && level <= MAX_DUNGEON_LEVEL ? level : null
}

function integer(random: () => number, min: number, max: number): number {
  return min + Math.floor(Math.min(.999999999, Math.max(0, random())) * (max - min + 1))
}

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = integer(random, 0, index); [result[index], result[other]] = [result[other], result[index]]
  }
  return result
}

function key(position: Position): string { return `${position.x},${position.y}` }

export function reachableDistances(map: ForestMap, start: Position): Map<string, number> {
  const distances = new Map<string, number>([[key(start), 0]])
  const queue: Position[] = [start]
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]; const distance = distances.get(key(current)) ?? 0
    for (const offset of directions) {
      const next = { x: current.x + offset.x, y: current.y + offset.y }; const nextKey = key(next)
      if (!distances.has(nextKey) && isPassable(map, next)) { distances.set(nextKey, distance + 1); queue.push(next) }
    }
  }
  return distances
}

function createMap(theme: DungeonTheme, random: () => number): ForestMap {
  const definition = DUNGEON_THEMES[theme]
  const map: TileType[][] = Array.from({ length: MAP_SIZE }, () => Array.from({ length: MAP_SIZE }, () => definition.obstacles[integer(random, 0, definition.obstacles.length - 1)]))
  const centers: Position[][] = []
  const carve = (x: number, y: number, corridor = false) => { map[y][x] = corridor && theme === 'forest' ? 'path' : definition.ground }
  const connect = (from: Position, to: Position) => {
    const corner = random() < .5 ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
    for (const [start, end] of [[from, corner], [corner, to]]) {
      const dx = Math.sign(end.x - start.x); const dy = Math.sign(end.y - start.y)
      for (let x = start.x, y = start.y; ; x += dx, y += dy) {
        carve(x, y, true)
        if (x === end.x && y === end.y) break
      }
    }
  }
  for (let row = 0; row < ROOM_GRID_SIZE; row += 1) {
    centers[row] = []
    for (let column = 0; column < ROOM_GRID_SIZE; column += 1) {
      const width = integer(random, MIN_ROOM_SIZE, MAX_ROOM_SIZE)
      const height = integer(random, MIN_ROOM_SIZE, MAX_ROOM_SIZE)
      const left = row === 2 && column === 0 ? 1 : column * ROOM_SLOT_SIZE + 1 + integer(random, 0, ROOM_SLOT_SIZE - width)
      const top = row === 2 && column === 0 ? MAP_SIZE - 1 - height : row * ROOM_SLOT_SIZE + 1 + integer(random, 0, ROOM_SLOT_SIZE - height)
      for (let y = top; y < top + height; y += 1) for (let x = left; x < left + width; x += 1) carve(x, y)
      centers[row][column] = { x: left + Math.floor(width / 2), y: top + Math.floor(height / 2) }
    }
  }
  for (let row = 0; row < ROOM_GRID_SIZE; row += 1) for (let column = 0; column < ROOM_GRID_SIZE; column += 1) {
    if (column > 0) connect(centers[row][column - 1], centers[row][column])
    if (row > 0) connect(centers[row - 1][column], centers[row][column])
  }
  return map
}

function chooseLevel(baseLevel: number, random: () => number): number {
  const centeredOffset = Math.floor(((random() + random()) / 2) * 11) - 5
  return Math.max(1, baseLevel + centeredOffset)
}

function createFloor(theme: DungeonTheme, floor: number, totalFloors: number, level: number, pool: EnemyKind[], bossKind: EnemyKind, random: () => number): DungeonFloor {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const map = createMap(theme, random); const distances = reachableDistances(map, START)
    const far = shuffled([...distances.entries()].filter(([, distance]) => distance >= 20).map(([position]) => { const [x, y] = position.split(',').map(Number); return { x, y } }), random)
    if (far.length === 0) continue
    const stairs = far[0]
    const occupied = new Set([key(START), key(stairs)])
    const isFinal = floor === totalFloors
    const normalCount = isFinal ? integer(random, 3, 5) : integer(random, 6, 9)
    const spawnCandidates = shuffled([...distances.entries()].filter(([, distance]) => distance >= 6).map(([position]) => { const [x, y] = position.split(',').map(Number); return { x, y } }).filter((position) => !occupied.has(key(position)) && Math.abs(position.x - stairs.x) + Math.abs(position.y - stairs.y) > 1), random)
    if (spawnCandidates.length < normalCount + (isFinal ? 1 : 0)) continue
    const enemies: EnemySpawn[] = []
    for (let index = 0; index < normalCount; index += 1) {
      const candidateIndex = spawnCandidates.findIndex((position) => enemies.every((enemy) => Math.abs(enemy.position.x - position.x) + Math.abs(enemy.position.y - position.y) >= 3))
      if (candidateIndex < 0) break
      const [position] = spawnCandidates.splice(candidateIndex, 1); occupied.add(key(position))
      enemies.push({ id: `f${floor}-enemy-${index + 1}`, kind: pool[integer(random, 0, pool.length - 1)], level: chooseLevel(level, random), position, isBoss: false })
    }
    if (enemies.length !== normalCount) continue
    if (isFinal) {
      const bossIndex = spawnCandidates.findIndex((position) => enemies.every((enemy) => Math.abs(enemy.position.x - position.x) + Math.abs(enemy.position.y - position.y) >= 3))
      if (bossIndex < 0) continue
      const [position] = spawnCandidates.splice(bossIndex, 1); occupied.add(key(position))
      enemies.push({ id: `f${floor}-boss`, kind: bossKind, level, position, isBoss: true })
    }
    const chestCandidate = isFinal ? null : far.find((position) => !occupied.has(key(position))) ?? null
    if (!isFinal && chestCandidate === null) continue
    return { floor, map, start: { ...START }, stairs, chestCandidate, enemies }
  }
  throw new Error(`${floor}階の生成に失敗しました。`)
}

export function createDungeon(level: number, theme: DungeonTheme, random: () => number = Math.random): GeneratedDungeon {
  if (!Number.isSafeInteger(level) || level < 1 || level > MAX_DUNGEON_LEVEL) throw new Error('ダンジョンLvが不正です。')
  const totalFloors = integer(random, 1, 10)
  const enemyKinds = shuffled(ALL_ENEMIES, random)
  const bossKind = enemyKinds[integer(random, 0, enemyKinds.length - 1)]
  const featuredCategory = CATEGORIES[integer(random, 0, CATEGORIES.length - 1)]
  const floors = Array.from({ length: totalFloors }, (_, index) => createFloor(theme, index + 1, totalFloors, level, enemyKinds, bossKind, random))
  // 地形・敵配置の乱数列を変えないよう、生成後に外観専用シードを取る。
  const visualSeed = integer(random, 0, 0xffffffff)
  const dungeon: GeneratedDungeon = { visualSeed, version: 1, level, totalFloors, enemyKinds, bossKind, featuredCategory, floors }
  if (!validateDungeon(dungeon)) throw new Error('生成したダンジョンの検証に失敗しました。')
  return dungeon
}

export function validateDungeon(dungeon: GeneratedDungeon): boolean {
  if (dungeon.version !== 1 || dungeon.floors.length !== dungeon.totalFloors || dungeon.totalFloors < 1 || dungeon.totalFloors > 15 || dungeon.enemyKinds.length < 3 || dungeon.enemyKinds.length > ALL_ENEMIES.length || new Set(dungeon.enemyKinds).size !== dungeon.enemyKinds.length || dungeon.enemyKinds.some((kind) => !ALL_ENEMIES.includes(kind)) || !dungeon.enemyKinds.includes(dungeon.bossKind)) return false
  return dungeon.floors.every((floor, index) => {
    if (floor.floor !== index + 1 || floor.map.length !== MAP_SIZE || floor.map.some((row) => row.length !== MAP_SIZE)) return false
    const distances = reachableDistances(floor.map, floor.start); const positions = [floor.start, floor.stairs, ...floor.enemies.map((enemy) => enemy.position)]
    if (!isPassable(floor.map, floor.start) || !isPassable(floor.map, floor.stairs) || !distances.has(key(floor.stairs)) || new Set(positions.map(key)).size !== positions.length) return false
    const obstacles = floor.map.flat().filter((tile) => !['grass', 'path', 'ruinsFloor', 'castleFloor'].includes(tile)).length
    const openFloor = obstacles === 0
    const legacyObstacles = obstacles >= 40 && obstacles <= 60
    const roomObstacles = obstacles >= 120 && obstacles <= 280
    if (!openFloor && !legacyObstacles && !roomObstacles) return false
    if (roomObstacles && distances.size !== MAP_SIZE * MAP_SIZE - obstacles) return false
    const final = floor.floor === dungeon.totalFloors; const bosses = floor.enemies.filter((enemy) => enemy.isBoss)
    if (final ? bosses.length !== 1 || bosses[0].kind !== dungeon.bossKind || bosses[0].level !== dungeon.level || floor.enemies.length < (legacyObstacles ? 3 : 4) || floor.enemies.length > (legacyObstacles ? 5 : 6) : bosses.length !== 0 || floor.enemies.length < (legacyObstacles ? 5 : 6) || floor.enemies.length > (legacyObstacles ? 8 : 9)) return false
    if (!final && (!floor.chestCandidate || !isPassable(floor.map, floor.chestCandidate) || (distances.get(key(floor.chestCandidate)) ?? 0) < 10 || positions.some((position) => key(position) === key(floor.chestCandidate!)))) return false
    return floor.enemies.every((enemy) => dungeon.enemyKinds.includes(enemy.kind) && isPassable(floor.map, enemy.position) && enemy.level >= 1 && Math.abs(enemy.level - dungeon.level) <= 5)
  })
}

export function instantiateEnemies(floor: DungeonFloor): EnemyState[] {
  return floor.enemies.map((enemy) => createEnemy(enemy.id, enemy.kind, enemy.level, enemy.position, enemy.isBoss))
}

export function replaceDungeonStock(stocks: DungeonStock[], stockId: DungeonStockId, dungeon: GeneratedDungeon): DungeonStock[] {
  if (!validateDungeon(dungeon)) return stocks
  return stocks.map((stock) => stock.id === stockId ? { ...stock, dungeon, highestFloor: 0, totalFloorsKnown: false, cleared: false } : stock)
}

export function updateStockProgress(stocks: DungeonStock[], stockId: DungeonStockId, reachedFloor: number, totalKnown = false, cleared = false): DungeonStock[] {
  return stocks.map((stock) => stock.id === stockId ? { ...stock, highestFloor: Math.max(stock.highestFloor, reachedFloor), totalFloorsKnown: stock.totalFloorsKnown || totalKnown, cleared: stock.cleared || cleared } : stock)
}

export function regenerateDungeonStock(stocks: DungeonStock[], stockId: DungeonStockId, level: number, confirmed: boolean, random: () => number = Math.random): DungeonStock[] {
  if (!confirmed) return stocks
  const stock = stocks.find((candidate) => candidate.id === stockId)
  if (!stock) return stocks
  const dungeon = createDungeon(level, stock.theme, random)
  return replaceDungeonStock(stocks, stockId, dungeon)
}

export function stairAction(floor: DungeonFloor, totalFloors: number, player: Position, enemies: EnemyState[]): 'none' | 'blocked' | 'next' | 'clear' {
  if (key(player) !== key(floor.stairs)) return 'none'
  if (floor.floor < totalFloors) return 'next'
  return enemies.some((enemy) => enemy.isBoss) ? 'blocked' : 'clear'
}
