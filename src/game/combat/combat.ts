import { FOREST_MAP, MAP_SIZE, PLAYER_START, isInsideMap, isPassable, type ForestMap, type Position } from '../forestMap'
import type { Direction } from '../exploration'

export type EnemyKind = 'goblin' | 'boar' | 'slimeKing' | 'cyclopsBat' | 'stoneGolem' | 'ghost'
export type AttackWarning = Readonly<{ remaining: number; cells: Position[]; direction: Direction; target: Position }>

export interface EnemyDefinition {
  kind: EnemyKind
  name: string
  baseHp: number
  baseAttack: number
  detectionRange: number
  preparationTurns: number
  sprite: string
}

export interface EnemyState {
  id: string
  kind: EnemyKind
  level: number
  position: Position
  hp: number
  maxHp: number
  attack: number
  discovered: boolean
  isBoss: boolean
  warning: AttackWarning | null
}

export interface CombatState {
  position: Position
  turn: number
  playerHp: number
  playerMaxHp: number
  enemies: EnemyState[]
  finished: boolean
}

export const PLAYER_PHYSICAL_ATTACK = 12

export const ENEMY_DEFINITIONS: Readonly<Record<EnemyKind, EnemyDefinition>> = {
  goblin: { kind: 'goblin', name: 'ゴブリン', baseHp: 20, baseAttack: 15, detectionRange: 4, preparationTurns: 2, sprite: '/assets/enemies/goblin.svg' },
  boar: { kind: 'boar', name: 'イノシシ', baseHp: 20, baseAttack: 20, detectionRange: 5, preparationTurns: 3, sprite: '/assets/enemies/boar.svg' },
  slimeKing: { kind: 'slimeKing', name: 'スライムキング', baseHp: 30, baseAttack: 10, detectionRange: 4, preparationTurns: 3, sprite: '/assets/enemies/slime-king.svg' },
  cyclopsBat: { kind: 'cyclopsBat', name: '一つ目コウモリ', baseHp: 10, baseAttack: 15, detectionRange: 7, preparationTurns: 2, sprite: '/assets/enemies/cyclops-bat.svg' },
  stoneGolem: { kind: 'stoneGolem', name: 'ストーンゴーレム', baseHp: 30, baseAttack: 15, detectionRange: 5, preparationTurns: 3, sprite: '/assets/enemies/stone-golem.svg' },
  ghost: { kind: 'ghost', name: 'ゴースト', baseHp: 10, baseAttack: 20, detectionRange: 8, preparationTurns: 3, sprite: '/assets/enemies/ghost.svg' },
}

const directionOffsets: Readonly<Record<Direction, Position>> = {
  up: { x: 0, y: -1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 },
}
const directionOrder: Direction[] = ['up', 'left', 'right', 'down']

export function positionKey(position: Position): string {
  return `${position.x},${position.y}`
}

export function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

export function createEnemy(id: string, kind: EnemyKind, level: number, position: Position, isBoss = false): EnemyState {
  const definition = ENEMY_DEFINITIONS[kind]
  const normalHp = definition.baseHp + 10 * (level - 1)
  const normalAttack = definition.baseAttack + 4 * (level - 1)
  const maxHp = isBoss ? normalHp * 3 : normalHp
  return {
    id, kind, level, position: { ...position }, hp: maxHp, maxHp,
    attack: isBoss ? Math.floor(normalAttack * 1.5) : normalAttack,
    discovered: false, isBoss, warning: null,
  }
}

// 第3段階専用の固定配置。正式なダンジョン生成データとは分離する。
export function createTestEnemies(): EnemyState[] {
  return [
    createEnemy('enemy-01', 'goblin', 1, { x: 2, y: 15 }),
    createEnemy('enemy-02', 'boar', 1, { x: 7, y: 17 }),
    createEnemy('enemy-03', 'slimeKing', 1, { x: 7, y: 14 }),
    createEnemy('enemy-04', 'cyclopsBat', 1, { x: 9, y: 17 }),
    createEnemy('enemy-05', 'stoneGolem', 1, { x: 10, y: 12 }),
    createEnemy('enemy-06', 'ghost', 1, { x: 3, y: 10 }),
    createEnemy('boss-01', 'goblin', 1, { x: 17, y: 3 }, true),
  ]
}

export function createCombatState(enemies: EnemyState[] = createTestEnemies()): CombatState {
  return { position: { ...PLAYER_START }, turn: 0, playerHp: 100, playerMaxHp: 100, enemies, finished: false }
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y
}

// マス中心を結ぶ supercover 線上の障害物を調べる。始点と終点は遮蔽判定から除く。
export function hasLineOfSight(map: ForestMap, from: Position, to: Position): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  if (steps === 0) return true
  for (let step = 1; step < steps; step += 1) {
    const x = from.x + dx * step / steps
    const y = from.y + dy * step / steps
    const candidates = new Set<string>()
    const floorX = Math.floor(x); const ceilX = Math.ceil(x)
    const floorY = Math.floor(y); const ceilY = Math.ceil(y)
    for (const candidateX of [floorX, ceilX]) for (const candidateY of [floorY, ceilY]) candidates.add(`${candidateX},${candidateY}`)
    for (const key of candidates) {
      const [candidateX, candidateY] = key.split(',').map(Number)
      if (!isPassable(map, { x: candidateX, y: candidateY })) return false
    }
  }
  return true
}

export function canDetect(enemy: EnemyState, player: Position, map: ForestMap = FOREST_MAP): boolean {
  return manhattanDistance(enemy.position, player) <= ENEMY_DEFINITIONS[enemy.kind].detectionRange
    && hasLineOfSight(map, enemy.position, player)
}

function chooseFacing(from: Position, target: Position): Direction {
  const dx = target.x - from.x
  const dy = target.y - from.y
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'up' : 'down'
  return dx < 0 ? 'left' : 'right'
}

function add(position: Position, direction: Direction, distance: number, side = 0): Position {
  const forward = directionOffsets[direction]
  const perpendicular = { x: -forward.y, y: forward.x }
  return { x: position.x + forward.x * distance + perpendicular.x * side, y: position.y + forward.y * distance + perpendicular.y * side }
}

function rawAttackCells(kind: EnemyKind, origin: Position, direction: Direction, target: Position, isBoss: boolean): Position[] {
  if (kind === 'ghost') return [{ ...target }]
  if (kind === 'slimeKing') {
    const radius = isBoss ? 2 : 1
    const cells: Position[] = []
    for (let y = -radius; y <= radius; y += 1) for (let x = -radius; x <= radius; x += 1) {
      if (x !== 0 || y !== 0) cells.push({ x: origin.x + x, y: origin.y + y })
    }
    return cells
  }
  if (kind === 'stoneGolem') {
    const depth = isBoss ? 3 : 2
    const cells: Position[] = []
    for (let distance = 1; distance <= depth; distance += 1) for (let side = -1; side <= 1; side += 1) cells.push(add(origin, direction, distance, side))
    return cells
  }
  const normalRange = kind === 'goblin' ? 1 : kind === 'boar' ? 3 : 5
  const range = normalRange + (isBoss ? 1 : 0)
  return Array.from({ length: range }, (_, index) => add(origin, direction, index + 1))
}

export function getAttackCells(enemy: EnemyState, direction: Direction, target: Position, map: ForestMap = FOREST_MAP): Position[] {
  return rawAttackCells(enemy.kind, enemy.position, direction, target, enemy.isBoss)
    .filter((cell) => isInsideMap(cell) && isPassable(map, cell) && hasLineOfSight(map, enemy.position, cell))
}

function attackPlanFrom(enemy: EnemyState, origin: Position, player: Position, map: ForestMap): AttackWarning | null {
  const temporary = { ...enemy, position: origin }
  if (enemy.kind === 'ghost') {
    const range = enemy.isBoss ? 9 : 8
    if (manhattanDistance(origin, player) > range || !hasLineOfSight(map, origin, player)) return null
    return { remaining: ENEMY_DEFINITIONS[enemy.kind].preparationTurns, cells: [{ ...player }], direction: chooseFacing(origin, player), target: { ...player } }
  }
  for (const direction of directionOrder) {
    const cells = getAttackCells(temporary, direction, player, map)
    if (cells.some((cell) => samePosition(cell, player))) {
      return { remaining: ENEMY_DEFINITIONS[enemy.kind].preparationTurns, cells, direction, target: { ...player } }
    }
  }
  return null
}

export function createAttackWarning(enemy: EnemyState, player: Position, map: ForestMap = FOREST_MAP): AttackWarning | null {
  return attackPlanFrom(enemy, enemy.position, player, map)
}

export function findPathToAttack(enemy: EnemyState, player: Position, enemies: EnemyState[], map: ForestMap = FOREST_MAP, reserved: ReadonlySet<string> = new Set()): Position[] | null {
  if (attackPlanFrom(enemy, enemy.position, player, map)) return []
  const blocked = new Set(enemies.filter((candidate) => candidate.id !== enemy.id).map((candidate) => positionKey(candidate.position)))
  for (const key of reserved) blocked.add(key)
  blocked.add(positionKey(player))
  const queue: Array<{ position: Position; path: Position[] }> = [{ position: enemy.position, path: [] }]
  const visited = new Set([positionKey(enemy.position)])
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break
    for (const direction of directionOrder) {
      const offset = directionOffsets[direction]
      const next = { x: current.position.x + offset.x, y: current.position.y + offset.y }
      const key = positionKey(next)
      if (visited.has(key) || blocked.has(key) || !isPassable(map, next)) continue
      const path = [...current.path, next]
      if (attackPlanFrom(enemy, next, player, map)) return path
      visited.add(key)
      queue.push({ position: next, path })
    }
  }
  return null
}

export function processEnemyTurn(state: CombatState, map: ForestMap = FOREST_MAP): CombatState {
  if (state.finished) return state
  let playerHp = state.playerHp
  const originalPositions = new Set(state.enemies.map((enemy) => positionKey(enemy.position)))
  let enemies = state.enemies.map((enemy) => ({ ...enemy, position: { ...enemy.position }, warning: enemy.warning ? { ...enemy.warning, cells: enemy.warning.cells.map((cell) => ({ ...cell })) } : null }))
  const order = [...enemies].sort((a, b) => a.id.localeCompare(b.id))
  for (const orderedEnemy of order) {
    if (playerHp <= 0) break
    const index = enemies.findIndex((enemy) => enemy.id === orderedEnemy.id)
    let enemy = enemies[index]
    if (enemy.warning) {
      if (enemy.warning.remaining > 1) enemy = { ...enemy, warning: { ...enemy.warning, remaining: enemy.warning.remaining - 1 } }
      else {
        if (enemy.warning.cells.some((cell) => samePosition(cell, state.position))) playerHp = Math.max(0, playerHp - enemy.attack)
        enemy = { ...enemy, warning: null }
      }
      enemies[index] = enemy
      continue
    }
    const discovered = enemy.discovered || canDetect(enemy, state.position, map)
    if (!discovered) continue
    enemy = { ...enemy, discovered: true }
    const warning = createAttackWarning(enemy, state.position, map)
    if (warning) enemy = { ...enemy, warning }
    else {
      const occupiedNow = new Set(enemies.filter((candidate) => candidate.id !== enemy.id).map((candidate) => positionKey(candidate.position)))
      const reserved = new Set([...originalPositions, ...occupiedNow])
      reserved.delete(positionKey(enemy.position))
      const path = findPathToAttack(enemy, state.position, enemies, map, reserved)
      if (path && path.length > 0) enemy = { ...enemy, position: path[0] }
    }
    enemies[index] = enemy
  }
  return { ...state, playerHp, enemies, finished: playerHp <= 0 }
}

export function moveCombatPlayer(state: CombatState, direction: Direction, map: ForestMap = FOREST_MAP): CombatState {
  if (state.finished) return state
  const offset = directionOffsets[direction]
  const destination = { x: state.position.x + offset.x, y: state.position.y + offset.y }
  if (!isPassable(map, destination) || state.enemies.some((enemy) => samePosition(enemy.position, destination))) return state
  return processEnemyTurn({ ...state, position: destination, turn: state.turn + 1 }, map)
}

export function isPlayerAttackCell(player: Position, target: Position, map: ForestMap = FOREST_MAP): boolean {
  return manhattanDistance(player, target) === 1 && isPassable(map, target)
}

export function attackCell(state: CombatState, target: Position, map: ForestMap = FOREST_MAP): CombatState {
  if (state.finished || !isPlayerAttackCell(state.position, target, map)) return state
  const enemies = state.enemies
    .map((enemy) => samePosition(enemy.position, target) ? { ...enemy, hp: enemy.hp - Math.max(1, PLAYER_PHYSICAL_ATTACK) } : enemy)
    .filter((enemy) => enemy.hp > 0)
  return processEnemyTurn({ ...state, enemies, turn: state.turn + 1 }, map)
}

export function getWarningLevel(enemies: EnemyState[], position: Position): 'red' | 'yellow' | null {
  let level: 'red' | 'yellow' | null = null
  for (const enemy of enemies) {
    if (!enemy.warning?.cells.some((cell) => samePosition(cell, position))) continue
    if (enemy.warning.remaining === 1) return 'red'
    level = 'yellow'
  }
  return level
}
