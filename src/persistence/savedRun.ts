import type { BattleState } from '../game/battle'
import type { LootState } from '../game/loot'
import { calculateStats, enemyExperience, type EquipmentItem, type PlayerState, type UnidentifiedTreasure } from '../game/player'
import { createEnemy, ENEMY_DEFINITIONS, getAttackCells, type EnemyState } from '../game/combat/combat'
import { isPassable, type Position } from '../game/forestMap'
import type { DungeonStock, DungeonStockId } from '../game/dungeon'
import { SKILLS } from '../game/skills'

export interface SavedRun {
  stockId: DungeonStockId
  floor: number
  startLevel: number
  battle: Omit<BattleState, 'player' | 'loot' | 'levelNotices' | 'actionNotice'> & { loot: Omit<LootState, 'notices'> }
}

export function captureRun(stockId: DungeonStockId, floor: number, battle: BattleState, startLevel = battle.player.level): SavedRun {
  if (!battle.loot) throw new Error('探索の報酬データがありません。')
  const { player: _player, levelNotices: _notices, actionNotice: _actionNotice, loot, ...state } = battle
  const { notices: _lootNotices, ...rewards } = loot
  return { stockId, floor, startLevel, battle: { ...state, loot: rewards } }
}

export function restoreBattle(player: PlayerState, run: SavedRun): BattleState {
  return { ...structuredClone(run.battle), player: structuredClone(player), levelNotices: [], loot: { ...structuredClone(run.battle.loot), notices: [] } }
}

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const int = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
const pos = (value: unknown): value is Position => object(value) && int(value.x, 0, 19) && int(value.y, 0, 19)
const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y
const statuses = (value: unknown): boolean => object(value) && int(value.poison, 0, 5) && int(value.burn, 0, 3) && int(value.slow, 0, 3) && int(value.stun, 0, 1)

export function validSavedRun(value: unknown, player: PlayerState, stocks: DungeonStock[], validTreasure: (value: unknown) => value is UnidentifiedTreasure): value is SavedRun {
  if (!object(value) || !int(value.stockId, 1, 3) || !int(value.floor, 1, 15) || !int(value.startLevel, 1, player.level) || !object(value.battle)) return false
  const stock = stocks.find((candidate) => candidate.id === value.stockId)
  const dungeon = stock?.dungeon; const floor = dungeon?.floors[value.floor - 1]
  if (!dungeon || !floor || !stock || stock.highestFloor < value.floor || player.level < stock.unlockLevel) return false
  const battle = value.battle; const combat = battle.combat; const loot = battle.loot
  if (!object(combat) || !pos(combat.position) || !isPassable(floor.map, combat.position) || !int(combat.turn) || combat.finished !== false
    || player.currentHp <= 0 || combat.playerHp !== player.currentHp || combat.playerMaxHp !== calculateStats(player).maxHp
    || !Array.isArray(combat.enemies) || !object(battle.cooldowns) || !int(battle.guardTurns, 0, 3) || !int(battle.experienceEarned)
    || !object(loot) || !Array.isArray(loot.chests) || !Array.isArray(loot.items) || !Array.isArray(loot.resolvedEnemyIds)) return false
  if (!Object.entries(battle.cooldowns).every(([id, turns]) => Object.hasOwn(SKILLS, id) && int(turns, 0, SKILLS[id as keyof typeof SKILLS].cooldown))) return false
  const occupied = new Set([`${combat.position.x},${combat.position.y}`]); const living = new Set<string>()
  for (const value of combat.enemies) {
    if (!object(value) || typeof value.id !== 'string' || !pos(value.position) || !isPassable(floor.map, value.position)) return false
    const spawn = floor.enemies.find((candidate) => candidate.id === value.id)
    if (!spawn || value.kind !== spawn.kind || value.level !== spawn.level || value.isBoss !== spawn.isBoss || typeof value.discovered !== 'boolean') return false
    const initial = createEnemy(spawn.id, spawn.kind, spawn.level, spawn.position, spawn.isBoss)
    if (value.maxHp !== initial.maxHp || value.attack !== initial.attack || !int(value.hp, 1, initial.maxHp) || (value.statuses !== undefined && !statuses(value.statuses))) return false
    const key = `${value.position.x},${value.position.y}`
    if (occupied.has(key) || living.has(value.id)) return false
    occupied.add(key); living.add(value.id)
    if (value.warning !== null) {
      const warning = value.warning
      if (!object(warning) || !int(warning.remaining, 1, ENEMY_DEFINITIONS[spawn.kind].preparationTurns) || !pos(warning.target)
        || !['up', 'left', 'right', 'down'].includes(warning.direction as string) || !Array.isArray(warning.cells) || !warning.cells.every(pos)) return false
      const expected = getAttackCells(value as unknown as EnemyState, warning.direction as 'up', warning.target, floor.map)
      if (JSON.stringify(expected) !== JSON.stringify(warning.cells)) return false
    }
  }
  const resolved = loot.resolvedEnemyIds
  const spawns = dungeon.floors.filter((candidate) => candidate.floor <= floor.floor).flatMap((candidate) => candidate.enemies)
  if (new Set(resolved).size !== resolved.length || !resolved.every((id) => typeof id === 'string' && spawns.some((spawn) => spawn.id === id) && !living.has(id))) return false
  if (!floor.enemies.every((spawn) => living.has(spawn.id) || resolved.includes(spawn.id))) return false
  if (battle.experienceEarned !== spawns.filter((spawn) => resolved.includes(spawn.id)).reduce((sum, spawn) => sum + enemyExperience(spawn.level, spawn.isBoss), 0)) return false
  const chestFloors = new Set<number>()
  if (loot.chests.length > Math.min(4, dungeon.totalFloors - 1)) return false
  for (const chest of loot.chests) {
    if (!object(chest) || !int(chest.floor, 1, dungeon.totalFloors - 1) || !pos(chest.position) || typeof chest.opened !== 'boolean' || chestFloors.has(chest.floor)) return false
    const candidate = dungeon.floors[chest.floor - 1].chestCandidate
    if (!candidate || !same(candidate, chest.position) || (chest.opened && chest.floor > floor.floor)) return false
    chestFloors.add(chest.floor)
  }
  if (!loot.items.every(validTreasure) || new Set(loot.items.map((item) => item.id)).size !== loot.items.length) return false
  if (!loot.items.every((item) => player.treasures.some((owned) => JSON.stringify(owned) === JSON.stringify(item)))) return false
  return loot.items.length >= loot.chests.filter((chest) => chest.opened).length
}
