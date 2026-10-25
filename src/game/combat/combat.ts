import { FOREST_MAP, MAP_SIZE, PLAYER_START, isInsideMap, isPassable, type ForestMap, type Position } from '../forestMap'
import type { Direction } from '../exploration'
import { STANDARD_ENEMY_BASE_HP, standardEnemyHp, baseStats, JOBS, weaponBaseAttack } from '../player'
import { bossCells, distanceToBoss, occupiesBoss, specialBossPlan, type BossPattern } from '../specialBoss'
import type { DungeonTheme } from '../dungeon'

export type EnemyKind = 'goblin' | 'boar' | 'slimeKing' | 'cyclopsBat' | 'stoneGolem' | 'ghost'
export type AttackWarning = Readonly<{ remaining: number; cells: Position[]; direction: Direction; target: Position; pattern?: BossPattern | 'strike' | 'ground' | 'normalCross'; destination?: Position; followUpCells?: Position[]; phase?: 1 | 2 }>

export interface EnemyDefinition {
  kind: EnemyKind
  name: string
  baseHp: number
  baseAttack: number
  detectionRange: number
  preparationTurns: number
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
  specialBoss?: DungeonTheme
  attackIndex?: number
  warning: AttackWarning | null
  statuses?: { poison: number; burn: number; slow: number; stun: number; stunRecovery?: number }
}

export interface CombatState {
  position: Position
  turn: number
  playerHp: number
  playerMaxHp: number
  enemies: EnemyState[]
  finished: boolean
  bossEvents?: { theme: DungeonTheme; pattern: BossPattern; cells: Position[]; from: Position }[]
}

export const PLAYER_PHYSICAL_ATTACK = 12

export function normalEnemyHp(kind: EnemyKind, level: number): number {
  return standardEnemyHp(level) + ENEMY_DEFINITIONS[kind].baseHp - STANDARD_ENEMY_BASE_HP
}

export function referenceSpearDamage(level: number): number {
  return Math.floor(baseStats(level).physical * JOBS.unemployed.physical)
    + Math.floor(weaponBaseAttack(level, 'spear') * (1 + .1 * (level - 1)))
}
export function bossMaxHp(level: number, special = false): number { return referenceSpearDamage(level) * (special ? 30 : 12) }

export const ENEMY_DEFINITIONS: Readonly<Record<EnemyKind, EnemyDefinition>> = {
  goblin: { kind: 'goblin', name: 'ゴブリン', baseHp: 20, baseAttack: 15, detectionRange: 4, preparationTurns: 1 },
  boar: { kind: 'boar', name: 'イノシシ', baseHp: 20, baseAttack: 20, detectionRange: 5, preparationTurns: 2 },
  slimeKing: { kind: 'slimeKing', name: 'スライムキング', baseHp: 30, baseAttack: 10, detectionRange: 4, preparationTurns: 2 },
  cyclopsBat: { kind: 'cyclopsBat', name: '一つ目コウモリ', baseHp: 10, baseAttack: 15, detectionRange: 7, preparationTurns: 1 },
  stoneGolem: { kind: 'stoneGolem', name: 'ストーンゴーレム', baseHp: 30, baseAttack: 15, detectionRange: 5, preparationTurns: 2 },
  ghost: { kind: 'ghost', name: 'ゴースト', baseHp: 10, baseAttack: 20, detectionRange: 8, preparationTurns: 2 },
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

export function createEnemy(id: string, kind: EnemyKind, level: number, position: Position, isBoss = false, specialBoss?: DungeonTheme): EnemyState {
  const definition = ENEMY_DEFINITIONS[kind]
  const normalHp = normalEnemyHp(kind, level)
  const normalAttack = definition.baseAttack + 4 * (level - 1)
  const maxHp = isBoss ? bossMaxHp(level, Boolean(specialBoss)) : normalHp
  return {
    id, kind, level, position: { ...position }, hp: maxHp, maxHp,
    attack: isBoss ? Math.floor(normalAttack * (specialBoss === 'ruins' ? 2 : specialBoss === 'castle' ? 1.8 : 1.5)) : normalAttack,
    discovered: false, isBoss, ...(specialBoss ? { specialBoss, attackIndex: 0 } : isBoss ? { attackIndex: 0 } : {}), warning: null, statuses: { poison: 0, burn: 0, slow: 0, stun: 0 },
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
  if (enemy.specialBoss) return true
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

function bossWarning(enemy: EnemyState, player: Position, map: ForestMap): AttackWarning | null {
  const direction = chooseFacing(enemy.position, player)
  if (enemy.specialBoss) {
    const plan = specialBossPlan(enemy.specialBoss, enemy.position, player, map, enemy.attackIndex ?? 0, enemy.hp * 2 <= enemy.maxHp)
    return { remaining: enemy.specialBoss === 'ruins' && enemy.hp * 2 > enemy.maxHp ? 2 : 1, cells: plan.cells, direction, target: { ...player }, pattern: plan.pattern, ...(plan.destination ? { destination: plan.destination } : {}), ...(plan.followUpCells ? { followUpCells: plan.followUpCells, phase: 1 } : {}) }
  }
  const base = attackPlanFrom(enemy, enemy.position, player, map)
  if (!base) return null
  const pattern = (['strike', 'ground', 'normalCross'] as const)[(enemy.attackIndex ?? 0) % 3]
  if (pattern === 'strike') return { ...base, remaining: 1, pattern }
  const cells = pattern === 'ground'
    ? Array.from({ length: 9 }, (_, index) => ({ x: player.x + index % 3 - 1, y: player.y + Math.floor(index / 3) - 1 }))
    : Array.from({ length: map.length }, (_, index) => [{ x: index, y: player.y }, { x: player.x, y: index }]).flat()
  return { ...base, remaining: 1, pattern, cells: cells.filter((cell) => isPassable(map, cell)) }
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
  return enemy.isBoss ? bossWarning(enemy, player, map) : attackPlanFrom(enemy, enemy.position, player, map)
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
  const bossEvents: NonNullable<CombatState['bossEvents']> = []
  const originalPositions = new Set(state.enemies.flatMap((enemy) => bossCells(enemy.position, Boolean(enemy.specialBoss)).map(positionKey)))
  let enemies = state.enemies.map((enemy) => ({ ...enemy, position: { ...enemy.position }, warning: enemy.warning ? { ...enemy.warning, cells: enemy.warning.cells.map((cell) => ({ ...cell })) } : null }))
  const order = [...enemies].sort((a, b) => a.id.localeCompare(b.id))
  for (const orderedEnemy of order) {
    if (playerHp <= 0) break
    const index = enemies.findIndex((enemy) => enemy.id === orderedEnemy.id)
    let enemy = enemies[index]
    const statuses = enemy.statuses ?? { poison: 0, burn: 0, slow: 0, stun: 0 }
    const skipSlowedMovement = statuses.slow > 0 && statuses.slow % 2 === 1
    enemy = { ...enemy, statuses: { ...statuses, slow: Math.max(0, statuses.slow - 1), ...('stunRecovery' in statuses ? { stunRecovery: Math.max(0, (statuses.stunRecovery ?? 0) - 1) } : {}) } }
    if (statuses.stun > 0) {
      enemies[index] = { ...enemy, statuses: { ...enemy.statuses!, stun: statuses.stun - 1 } }
      continue
    }
    if (enemy.warning) {
      if (enemy.warning.remaining > 1) enemy = { ...enemy, warning: { ...enemy.warning, remaining: enemy.warning.remaining - 1 } }
      else {
        if (enemy.warning.cells.some((cell) => samePosition(cell, state.position))) playerHp = Math.max(0, playerHp - enemy.attack)
        if (enemy.specialBoss && enemy.warning.pattern) bossEvents.push({ theme: enemy.specialBoss, pattern: enemy.warning.pattern as BossPattern, cells: enemy.warning.cells, from: enemy.position })
        if (enemy.warning.followUpCells?.length) {
          const { followUpCells, ...warning } = enemy.warning
          enemy = { ...enemy, warning: { ...warning, remaining: 1, cells: followUpCells, phase: 2 } }
        } else {
          enemy = { ...enemy, position: enemy.warning.destination && !occupiesBoss(enemy.warning.destination, state.position, Boolean(enemy.specialBoss)) ? { ...enemy.warning.destination } : enemy.position, warning: null, ...(enemy.isBoss ? { attackIndex: (enemy.attackIndex ?? 0) + 1 } : {}) }
        }
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
      if (skipSlowedMovement) {
        enemies[index] = enemy
        continue
      }
      if (enemy.specialBoss) { enemies[index] = enemy; continue }
      const occupiedNow = new Set(enemies.filter((candidate) => candidate.id !== enemy.id).flatMap((candidate) => bossCells(candidate.position, Boolean(candidate.specialBoss)).map(positionKey)))
      const reserved = new Set([...originalPositions, ...occupiedNow])
      reserved.delete(positionKey(enemy.position))
      const path = findPathToAttack(enemy, state.position, enemies, map, reserved)
      if (path && path.length > 0) enemy = { ...enemy, position: path[0] }
    }
    enemies[index] = enemy
  }
  return { ...state, playerHp, enemies, bossEvents, finished: playerHp <= 0 }
}

export function moveCombatPlayer(state: CombatState, direction: Direction, map: ForestMap = FOREST_MAP): CombatState {
  if (state.finished) return state
  const offset = directionOffsets[direction]
  const destination = { x: state.position.x + offset.x, y: state.position.y + offset.y }
  if (!isPassable(map, destination) || state.enemies.some((enemy) => occupiesBoss(enemy.position, destination, Boolean(enemy.specialBoss)))) return state
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

export function getWarningLevel(enemies: EnemyState[], position: Position): 'red' | null {
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || !enemy.warning?.cells.some((cell) => samePosition(cell, position))) continue
    if (getEnemyWarningLevel(enemy) === 'red') return 'red'
  }
  return null
}

// 次の有効プレイヤー行動後に攻撃する敵だけ赤。準備中や気絶中は表示しない。
export function getEnemyWarningLevel(enemy: EnemyState): 'red' | null {
  if (enemy.hp <= 0 || !enemy.warning) return null
  return enemy.warning.remaining <= 1 && (enemy.statuses?.stun ?? 0) === 0 ? 'red' : null
}
