import type { BattleState } from '../game/battle'
import type { LootState } from '../game/loot'
import { calculateStats, enemyExperience, type EquipmentItem, type PlayerState, type UnidentifiedTreasure } from '../game/player'
import { createEnemy, createAttackWarning, ENEMY_DEFINITIONS, getAttackCells, normalEnemyHp, type EnemyState } from '../game/combat/combat'
import { isPassable, type Position } from '../game/forestMap'
import { SPECIAL_REWARD_POSITIONS, type DungeonStock, type DungeonStockId } from '../game/dungeon'
import { bossCells, specialBossPlan } from '../game/specialBoss'
import { SKILLS } from '../game/skills'

export interface SavedRun {
  stockId: DungeonStockId
  floor: number
  startLevel: number
  battle: Omit<BattleState, 'player' | 'loot' | 'levelNotices' | 'actionNotice' | 'visualEvents'> & { loot: Omit<LootState, 'notices'> }
}

export function captureRun(stockId: DungeonStockId, floor: number, battle: BattleState, startLevel = battle.player.level): SavedRun {
  if (!battle.loot) throw new Error('探索の報酬データがありません。')
  const { player: _player, levelNotices: _notices, actionNotice: _actionNotice, visualEvents: _visualEvents, loot, ...state } = battle
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
const statuses = (value: unknown): boolean => object(value) && int(value.poison, 0, 9) && int(value.burn, 0, 7) && int(value.slow, 0, 7) && int(value.stun, 0, 1) && (value.stunRecovery === undefined || int(value.stunRecovery, 0, 2))

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
    const initial = createEnemy(spawn.id, spawn.kind, spawn.level, spawn.position, spawn.isBoss, spawn.specialBoss)
    const legacyBossHp = spawn.isBoss && !spawn.specialBoss ? normalEnemyHp(spawn.kind, spawn.level) * 3 : null
    if ((value.maxHp !== initial.maxHp && value.maxHp !== legacyBossHp) || value.attack !== initial.attack || !int(value.hp, 1, value.maxHp as number) || (value.statuses !== undefined && !statuses(value.statuses))
      || value.specialBoss !== spawn.specialBoss || (spawn.isBoss && value.attackIndex !== undefined && !int(value.attackIndex))) return false
    for (const part of bossCells(value.position as Position, Boolean(spawn.specialBoss))) {
      if (!isPassable(floor.map, part) || occupied.has(`${part.x},${part.y}`)) return false
      occupied.add(`${part.x},${part.y}`)
    }
    if (living.has(value.id)) return false
    living.add(value.id)
    if (value.warning !== null) {
      const warning = value.warning
      // 旧版で保存された準備残り(最大3)も、攻撃予告とともに引き継ぐ。
      if (!object(warning) || !int(warning.remaining, 1, ENEMY_DEFINITIONS[spawn.kind].preparationTurns + 1) || !pos(warning.target)
        || !['up', 'left', 'right', 'down'].includes(warning.direction as string) || !Array.isArray(warning.cells) || !warning.cells.every(pos)) return false
      if (spawn.specialBoss && warning.pattern !== undefined) {
        // 予告後にHPが50%を跨いでも、予告時に固定した範囲を変更しない。
        const plans = [false, true].map((enraged) => specialBossPlan(spawn.specialBoss!, value.position as Position, warning.target as Position, floor.map, (value.attackIndex as number) ?? 0, enraged))
        if (!plans.some((plan) => plan.pattern === warning.pattern
          && JSON.stringify(warning.phase === 2 ? plan.followUpCells : plan.cells) === JSON.stringify(warning.cells)
          && (warning.phase !== 1 || JSON.stringify(plan.followUpCells) === JSON.stringify(warning.followUpCells))
          && JSON.stringify(plan.destination) === JSON.stringify(warning.destination))) return false
        if (warning.pattern === 'doubleBurst' ? warning.phase !== 1 && warning.phase !== 2 : warning.phase !== undefined || warning.followUpCells !== undefined) return false
        if (warning.phase === 2 && warning.followUpCells !== undefined) return false
      } else {
        const planned = warning.pattern === undefined ? null : createAttackWarning(value as unknown as EnemyState, warning.target as Position, floor.map)
        const expected = warning.pattern === undefined
          ? getAttackCells(value as unknown as EnemyState, warning.direction as 'up', warning.target as Position, floor.map)
          : planned?.cells
        if (!expected || JSON.stringify(expected) !== JSON.stringify(warning.cells) || (warning.pattern !== undefined && warning.pattern !== planned?.pattern)
          || warning.destination !== undefined || warning.phase !== undefined || warning.followUpCells !== undefined) return false
      }
      if (warning.pattern !== undefined && !['strike', 'ground', 'normalCross', 'roots', 'sweep', 'surround', 'slam', 'cross', 'charge', 'flameWave', 'burst', 'doubleBurst', 'release'].includes(warning.pattern as string)) return false
      if (warning.destination !== undefined && (!pos(warning.destination) || !bossCells(warning.destination, Boolean(spawn.specialBoss)).every((part) => isPassable(floor.map, part)))) return false
    }
  }
  const resolved = loot.resolvedEnemyIds
  const spawns = dungeon.floors.filter((candidate) => candidate.floor <= floor.floor).flatMap((candidate) => candidate.enemies)
  if (new Set(resolved).size !== resolved.length || !resolved.every((id) => typeof id === 'string' && spawns.some((spawn) => spawn.id === id) && !living.has(id))) return false
  if (!floor.enemies.every((spawn) => living.has(spawn.id) || resolved.includes(spawn.id))) return false
  const defeated = spawns.filter((spawn) => resolved.includes(spawn.id))
  const minimumExperience = defeated.reduce((sum, spawn) => sum + enemyExperience(spawn.level, spawn.isBoss, value.startLevel as number), 0)
  const legacyExperience = defeated.reduce((sum, spawn) => sum + enemyExperience(spawn.level, spawn.isBoss), 0)
  // 旧セーブは無制限、新規セーブは討伐時のプレイヤーLvで格上経験値を制限する。
  if (battle.experienceEarned < minimumExperience || battle.experienceEarned > legacyExperience) return false
  const chestFloors = new Set<number>()
  if (loot.chests.length > Math.min(4, dungeon.totalFloors - 1) + (floor.specialArena ? 3 : 0)) return false
  for (const chest of loot.chests) {
    if (!object(chest) || !int(chest.floor, 1, dungeon.totalFloors) || !pos(chest.position) || typeof chest.opened !== 'boolean') return false
    if (chest.floor === dungeon.totalFloors) {
      if (!floor.specialArena || !SPECIAL_REWARD_POSITIONS.some((position) => same(position, chest.position as Position)) || !chest.item || !validTreasure({ id: (chest.item as EquipmentItem).id, level: (chest.item as EquipmentItem).level, item: chest.item })) return false
      continue
    }
    if (chestFloors.has(chest.floor)) return false
    const candidate = dungeon.floors[chest.floor - 1].chestCandidate
    if (!candidate || !same(candidate, chest.position) || (chest.opened && chest.floor > floor.floor)) return false
    chestFloors.add(chest.floor)
  }
  const finalChests = loot.chests.filter((chest) => chest.floor === dungeon.totalFloors)
  if (floor.specialArena && (finalChests.length !== (resolved.includes(floor.enemies[0].id) ? 3 : 0)
    || new Set(finalChests.map((chest) => `${chest.position.x},${chest.position.y}`)).size !== finalChests.length
    || !finalChests.every((chest) => !chest.opened || (loot.items as UnidentifiedTreasure[]).some((item) => JSON.stringify(item.item) === JSON.stringify(chest.item))))) return false
  if (floor.specialArena && resolved.includes(floor.enemies[0].id) && !player.specialBossClears.includes(floor.enemies[0].specialBoss!)) return false
  if (new Set(finalChests.map((chest) => (chest.item as EquipmentItem)?.id)).size !== finalChests.length) return false
  if (finalChests.some((chest) => !chest.opened && [...player.inventory, ...player.treasures].some((owned) => owned.id === (chest.item as EquipmentItem).id))) return false
  if (!loot.items.every(validTreasure) || new Set(loot.items.map((item) => item.id)).size !== loot.items.length) return false
  if (!loot.items.every((item) => player.treasures.some((owned) => JSON.stringify(owned) === JSON.stringify(item)))) return false
  return loot.items.length >= loot.chests.filter((chest) => chest.opened).length
}
