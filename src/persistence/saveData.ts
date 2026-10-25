import { baseStats, calculateStats, canEquip, experienceToNext, JOBS, RARITY_MULTIPLIERS, SPECIAL_EFFECT_RATES, SUBTYPE_LABELS, weaponBaseAttack, type EquipmentItem, type PlayerState, type Rarity, type UnidentifiedTreasure } from '../game/player'
import { SKILLS } from '../game/skills'
import { ENEMY_DEFINITIONS } from '../game/combat/combat'
import { createDungeonStocks, MAX_DUNGEON_LEVEL, validateDungeon, type DungeonStock, type GeneratedDungeon } from '../game/dungeon'
import type { SavedRun } from './savedRun'
import { validSavedRun } from './savedRun'
import { removeLegacyTestEquipment } from './legacyTestEquipment'

export interface SaveData { schemaVersion: 6; savedAt: string; player: PlayerState; stocks: DungeonStock[]; run: SavedRun | null }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0
const member = (value: unknown, values: object): value is string => typeof value === 'string' && Object.hasOwn(values, value)
const position = (value: unknown): boolean => record(value) && integer(value.x, 0, 19) && integer(value.y, 0, 19)
const effects = ['poison', 'burn', 'slow', 'stun', 'knockback', 'critical', 'lifesteal', 'extraAttack']
const subtypes = { weapon: ['sword', 'spear', 'bow', 'shortStaff', 'longStaff'], armor: ['heavyArmor', 'lightArmor', 'heavyRobe', 'lightRobe'], accessory: ['commonAccessory'] }
const tiles = { forest: ['grass', 'path', 'tree', 'rock', 'stump'], ruins: ['ruinsFloor', 'wall', 'pillar'], castle: ['castleFloor', 'castleWall', 'pillar'] }

function isJson(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || ancestors.has(value) || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype)) return false
  if (Array.isArray(value) && Array.from({ length: value.length }, (_, index) => Object.hasOwn(value, index)).some((present) => !present)) return false
  ancestors.add(value)
  const valid = Object.values(value).every((entry) => isJson(entry, ancestors))
  ancestors.delete(value)
  return valid
}

export function validItem(value: unknown): value is EquipmentItem {
  if (!record(value) || !text(value.id) || !text(value.name) || !member(value.category, subtypes) || !member(value.subtype, SUBTYPE_LABELS)) return false
  return subtypes[value.category as keyof typeof subtypes].includes(value.subtype)
    && integer(value.level, 1) && !Object.hasOwn(value, 'rarity')
    && Object.values(RARITY_MULTIPLIERS).includes(value.statMultiplier as number)
    && Object.values(SPECIAL_EFFECT_RATES).includes(value.effectRate as number)
    && Object.values(RARITY_MULTIPLIERS).includes(value.legacySkillPower as number)
    && [value.baseHp, value.basePhysical, value.baseMagic].every((number) => integer(number))
    && Array.isArray(value.skills) && value.skills.every((id) => member(id, SKILLS))
    && new Set(value.skills).size === value.skills.length
    && record(value.skillLevels) && Object.keys(value.skillLevels).length === value.skills.length
    && value.skills.every((id) => integer((value.skillLevels as Record<string, unknown>)[id], 1, 5))
    && (value.specialEffect === null || effects.includes(value.specialEffect as string))
    && (value.specialEffect === null ? value.specialEffectLevel === null : integer(value.specialEffectLevel, 1, 5))
    && typeof value.favorite === 'boolean' && (value.testOnly === undefined || typeof value.testOnly === 'boolean')
}

function migrateLegacyItem(value: unknown): EquipmentItem {
  if (!record(value) || !member(value.rarity, RARITY_MULTIPLIERS)) throw new Error()
  const { rarity, ...item } = value
  const converted = {
    ...item, statMultiplier: RARITY_MULTIPLIERS[rarity as Rarity], effectRate: SPECIAL_EFFECT_RATES[rarity as Rarity],
    legacySkillPower: RARITY_MULTIPLIERS[rarity as Rarity],
    skillLevels: Array.isArray(value.skills) ? Object.fromEntries(value.skills.map((id) => [id, 1])) : null,
    specialEffectLevel: value.specialEffect === null ? null : 1,
  }
  if (!validItem(converted)) throw new Error()
  return converted
}

function rebalanceExistingWeapon(value: unknown): EquipmentItem {
  if (!validItem(value)) throw new Error()
  if (value.category !== 'weapon') return value
  const power = weaponBaseAttack(value.level, value.subtype as 'sword' | 'spear' | 'bow' | 'shortStaff' | 'longStaff')
  return value.subtype === 'shortStaff' || value.subtype === 'longStaff'
    ? { ...value, baseMagic: power }
    : { ...value, basePhysical: power }
}

export function validTreasure(value: unknown): value is UnidentifiedTreasure {
  return record(value) && text(value.id) && integer(value.level, 1) && validItem(value.item)
    && value.id === value.item.id && value.level === value.item.level
}

function validPlayer(value: unknown): value is PlayerState {
  if (!record(value) || !integer(value.level, 1) || !integer(value.experience) || !integer(value.currentHp) || !member(value.job, JOBS)
    || !Array.isArray(value.inventory) || !value.inventory.every(validItem) || !Array.isArray(value.treasures) || !value.treasures.every(validTreasure) || !record(value.equipment)
    || !Array.isArray(value.specialBossClears) || value.specialBossClears.some((theme) => !['forest', 'ruins', 'castle'].includes(theme)) || new Set(value.specialBossClears).size !== value.specialBossClears.length) return false
  const ids = [...value.inventory.map((item) => item.id), ...value.treasures.map((item) => item.id)]
  if (new Set(ids).size !== ids.length) return false
  const player = value as unknown as PlayerState
  if (player.level < JOBS[player.job].unlockLevel || player.experience >= experienceToNext(player.level)) return false
  const equipped: string[] = []
  for (const slot of ['weapon', 'armor', 'accessory1', 'accessory2'] as const) {
    const id = player.equipment[slot]
    if (id === null) continue
    if (!text(id) || equipped.includes(id)) return false
    const item = player.inventory.find((candidate) => candidate.id === id)
    if (!item || item.category !== (slot.startsWith('accessory') ? 'accessory' : slot) || !canEquip(player.job, item)) return false
    equipped.push(id)
  }
  const stats = calculateStats(player)
  return Object.values(stats).every((number) => integer(number)) && player.currentHp <= legacyMaxHp(player)
}

// v1.0の無職は基礎HP1倍。装備補正は変えず旧上限まで検証した後、新上限へ正規化する。
function legacyMaxHp(player: PlayerState): number {
  const base = baseStats(player.level).maxHp
  return calculateStats(player).maxHp + (player.job === 'unemployed' ? base - Math.floor(base * JOBS.unemployed.hp) : 0)
}

function validDungeon(value: unknown, theme: DungeonStock['theme']): value is GeneratedDungeon {
  if (!record(value) || value.version !== 1 || !integer(value.level, 1, MAX_DUNGEON_LEVEL) || !integer(value.totalFloors, 1, 15)
    || !Array.isArray(value.enemyKinds) || !value.enemyKinds.every((kind) => member(kind, ENEMY_DEFINITIONS))
    || new Set(value.enemyKinds).size !== value.enemyKinds.length || !member(value.bossKind, ENEMY_DEFINITIONS)
    || !member(value.featuredCategory, subtypes) || !integer(value.visualSeed, 0, 0xffffffff)
    || !Array.isArray(value.floors) || value.floors.length !== value.totalFloors) return false
  for (const floor of value.floors) {
    const size = floor.specialArena === true ? 13 : 20
    if (!record(floor) || !integer(floor.floor, 1, 15) || !position(floor.start) || !position(floor.stairs)
      || !(floor.chestCandidate === null || position(floor.chestCandidate))
      || !Array.isArray(floor.map) || floor.map.length !== size || !floor.map.every((row) => Array.isArray(row) && row.length === size && row.every((tile) => tiles[theme].includes(tile)))
      || !Array.isArray(floor.enemies) || !floor.enemies.every((enemy) => record(enemy) && text(enemy.id) && member(enemy.kind, ENEMY_DEFINITIONS) && integer(enemy.level, 1) && position(enemy.position) && typeof enemy.isBoss === 'boolean' && (enemy.specialBoss === undefined || enemy.specialBoss === theme))) return false
    if (new Set(floor.enemies.map((enemy) => enemy.id)).size !== floor.enemies.length) return false
  }
  return validateDungeon(value as unknown as GeneratedDungeon)
}

function validStocks(value: unknown): value is DungeonStock[] {
  if (!Array.isArray(value) || value.length !== 3) return false
  return createDungeonStocks().every((base, index) => {
    const stock: unknown = value[index]
    if (!record(stock) || stock.id !== base.id || stock.theme !== base.theme || stock.name !== base.name || stock.unlockLevel !== base.unlockLevel
      || !integer(stock.highestFloor, 0, 15) || typeof stock.totalFloorsKnown !== 'boolean' || typeof stock.cleared !== 'boolean') return false
    if (stock.dungeon === null) return stock.highestFloor === 0 && !stock.totalFloorsKnown && !stock.cleared
    if (!validDungeon(stock.dungeon, base.theme)) return false
    return stock.highestFloor <= stock.dungeon.totalFloors
      && (!stock.cleared || (stock.totalFloorsKnown && stock.highestFloor === stock.dungeon.totalFloors))
      && (stock.highestFloor !== stock.dungeon.totalFloors || stock.totalFloorsKnown)
  })
}

export function readSaveData(value: unknown): SaveData {
  if (!record(value)) throw new Error('セーブデータが不正です。')
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3 && value.schemaVersion !== 4 && value.schemaVersion !== 5 && value.schemaVersion !== 6) throw new Error('未対応のセーブデータバージョンです。現在のデータは変更していません。')
  try {
    if (!isJson(value) || !text(value.savedAt) || !Number.isFinite(Date.parse(value.savedAt)) || !record(value.player) || !validStocks(value.stocks)) throw new Error()
    const playerCandidate = JSON.parse(JSON.stringify(value.player)) as Record<string, unknown>
    if (!Object.hasOwn(playerCandidate, 'treasures')) {
      if (value.schemaVersion >= 3) throw new Error()
      playerCandidate.treasures = []
    }
    if (value.schemaVersion < 6) playerCandidate.specialBossClears = []
    const run = value.schemaVersion === 1 ? null : JSON.parse(JSON.stringify(value.run)) as unknown
    if (value.schemaVersion < 4) {
      if (!Array.isArray(playerCandidate.inventory) || !Array.isArray(playerCandidate.treasures)) throw new Error()
      playerCandidate.inventory = playerCandidate.inventory.map(migrateLegacyItem)
      playerCandidate.treasures = playerCandidate.treasures.map((entry) => {
        if (!record(entry)) throw new Error()
        return { ...entry, item: migrateLegacyItem(entry.item) }
      })
      if (record(run) && record(run.battle) && record(run.battle.loot) && Array.isArray(run.battle.loot.items)) {
        run.battle.loot.items = run.battle.loot.items.map((entry) => {
          if (value.schemaVersion === 2) return migrateLegacyItem(entry)
          if (!record(entry)) throw new Error()
          return { ...entry, item: migrateLegacyItem(entry.item) }
        })
      }
    }
    // v2の探索報酬は所持品に直接入っていた。報酬記録と一致する品だけを未鑑定へ移行する。
    if (value.schemaVersion === 2 && record(run) && record(run.battle) && record(run.battle.loot) && Array.isArray(run.battle.loot.items)
      && run.battle.loot.items.length > 0 && run.battle.loot.items.every(validItem)) {
      const rewards = run.battle.loot.items as EquipmentItem[]
      const inventory = playerCandidate.inventory
      if (!Array.isArray(inventory) || !rewards.every((item) => inventory.some((owned) => JSON.stringify(owned) === JSON.stringify(item)))) throw new Error()
      const rewardIds = new Set(rewards.map((item) => item.id))
      const treasures = playerCandidate.treasures
      if (!Array.isArray(treasures)) throw new Error()
      playerCandidate.inventory = inventory.filter((owned) => !rewardIds.has((owned as EquipmentItem).id))
      playerCandidate.treasures = [...treasures, ...rewards.map((item) => ({ id: item.id, level: item.level, item }))]
      run.battle.loot.items = rewards.map((item) => ({ id: item.id, level: item.level, item }))
    }
    if (value.schemaVersion < 5) {
      playerCandidate.inventory = (playerCandidate.inventory as unknown[]).map(rebalanceExistingWeapon)
      playerCandidate.treasures = (playerCandidate.treasures as unknown[]).map((entry) => {
        if (!record(entry)) throw new Error()
        return { ...entry, item: rebalanceExistingWeapon(entry.item) }
      })
      if (record(run) && record(run.battle) && record(run.battle.loot) && Array.isArray(run.battle.loot.items)) {
        run.battle.loot.items = run.battle.loot.items.map((entry) => {
          if (!record(entry)) throw new Error()
          return { ...entry, item: rebalanceExistingWeapon(entry.item) }
        })
      }
    }
    if (!validPlayer(playerCandidate)) throw new Error()
    const player = { ...playerCandidate, currentHp: Math.min(playerCandidate.currentHp, calculateStats(playerCandidate).maxHp) } as PlayerState
    if (record(run) && record(run.battle) && record(run.battle.combat) && player.job === 'unemployed') {
      const combat = run.battle.combat
      if (combat.playerMaxHp === legacyMaxHp(playerCandidate as unknown as PlayerState) && combat.playerHp === playerCandidate.currentHp) {
        combat.playerHp = player.currentHp; combat.playerMaxHp = calculateStats(player).maxHp
      }
    }
    if (run !== null && !validSavedRun(run, player, value.stocks, validTreasure)) throw new Error()
    const data = JSON.parse(JSON.stringify({ schemaVersion: 6, savedAt: value.savedAt, player, stocks: value.stocks, run })) as SaveData
    const previousPlayer = data.player
    data.player = removeLegacyTestEquipment(data.player, new Set(data.run?.battle.loot.items.map((item) => item.id) ?? []))
    // 既知の初期IDと旧名称だけを更新し、装備性能・付与効果は一切変更しない。
    data.player.inventory = data.player.inventory.map((item) => {
      if (item.id === 'initial-sword' && item.name === '初心者用の剣' && item.subtype === 'sword' && item.skills.length === 0 && item.specialEffect === null) return { ...item, name: '剣' }
      if (item.id === 'initial-armor' && item.name === '初期軽鎧' && item.subtype === 'lightArmor' && item.skills.length === 0 && item.specialEffect === null) return { ...item, name: '軽鎧' }
      return item
    })
    if (data.run && data.player !== previousPlayer) {
      data.run.battle.combat.playerHp = data.player.currentHp
      data.run.battle.combat.playerMaxHp = calculateStats(data.player).maxHp
    }
    return data
  } catch { throw new Error('セーブデータが破損しています。現在のデータは変更していません。') }
}

export function createSaveData(player: PlayerState, stocks: DungeonStock[], now = new Date(), run: SavedRun | null = null): SaveData {
  return readSaveData({ schemaVersion: 6, savedAt: now.toISOString(), player, stocks, run })
}
