import { RARITY_MULTIPLIERS, SUBTYPE_LABELS, type EquipmentCategory, type EquipmentItem, type Rarity, type SkillId, type SpecialEffectId } from './player'
import type { GeneratedDungeon } from './dungeon'
import type { Position } from './forestMap'
import type { BattleState } from './battle'

export interface LootChest { floor: number; position: Position; opened: boolean }
export interface LootState {
  chests: LootChest[]
  items: EquipmentItem[]
  resolvedEnemyIds: string[]
  notices: EquipmentItem[]
}
export type RandomSource = () => number
const categories: EquipmentCategory[] = ['weapon', 'armor', 'accessory']
const effects: SpecialEffectId[] = ['poison', 'burn', 'slow', 'stun', 'knockback', 'critical', 'lifesteal', 'extraAttack']
const skills: SkillId[] = ['strongStrike', 'magicBolt', 'piercingShot', 'shockwave', 'flame', 'smallHeal', 'largeHeal', 'poisonStrike', 'slowSpell', 'stunStrike', 'dash', 'guard']

// 第4段階の装備と同じ基礎補正。生成品の調整はこの表に集約する。
export const EQUIPMENT_BASES = {
  sword: [0, 3, 0], spear: [0, 7, 0], bow: [0, 9, 0], shortStaff: [0, 0, 8], longStaff: [0, 0, 10],
  heavyArmor: [30, 0, 0], lightArmor: [20, 0, 0], heavyRobe: [20, 0, 3], lightRobe: [15, 0, 5],
} as const

function index(random: RandomSource, length: number): number { return Math.min(length - 1, Math.floor(random() * length)) }
function pick<T>(values: readonly T[], random: RandomSource): T { return values[index(random, values.length)] }
function uniquePicks<T>(values: readonly T[], count: number, random: RandomSource): T[] {
  const pool = [...values]; const result: T[] = []
  for (let i = 0; i < count; i += 1) result.push(...pool.splice(index(random, pool.length), 1))
  return result
}
export function rollChestCount(value: number): number { return value < .1 ? 0 : value < .45 ? 1 : value < .8 ? 2 : value < .95 ? 3 : 4 }
export function rollRarity(value: number): Rarity { return value < .6 ? 'common' : value < .85 ? 'rare' : value < .97 ? 'epic' : 'legendary' }
export function rollCategory(featured: EquipmentCategory, value: number): EquipmentCategory {
  return value < .5 ? featured : categories.filter((category) => category !== featured)[value < .75 ? 0 : 1]
}

export function generateEquipment(dungeon: Pick<GeneratedDungeon, 'level' | 'featuredCategory'>, random: RandomSource = Math.random, createId: () => string = () => crypto.randomUUID()): EquipmentItem {
  const category = rollCategory(dungeon.featuredCategory, random()); const rarity = rollRarity(random())
  const level = Math.max(1, dungeon.level + Math.min(5, Math.floor((random() + random()) / 2 * 11) - 5))
  const item: EquipmentItem = { id: createId(), category, subtype: 'commonAccessory', name: '', level, rarity, baseHp: 0, basePhysical: 0, baseMagic: 0, skills: [], specialEffect: null, favorite: false, testOnly: false }
  if (category === 'weapon' || category === 'armor') {
    const subtype = category === 'weapon' ? pick(['sword', 'spear', 'bow', 'shortStaff', 'longStaff'] as const, random) : pick(['heavyArmor', 'lightArmor', 'heavyRobe', 'lightRobe'] as const, random)
    const [hp, physical, magic] = EQUIPMENT_BASES[subtype]
    Object.assign(item, { subtype, name: SUBTYPE_LABELS[subtype], baseHp: hp, basePhysical: physical, baseMagic: magic })
    if (category === 'weapon') item.specialEffect = pick(effects, random)
    else item.skills = uniquePicks(skills, subtype === 'heavyArmor' || subtype === 'heavyRobe' ? 1 : 3, random)
  } else if (random() < .5) {
    item.name = '技の護符'; item.skills = [pick(skills, random)]
  } else {
    const bonus = index(random, 3)
    item.name = ['生命の護符', '力の護符', '魔力の護符'][bonus]
    item.baseHp = bonus === 0 ? 8 : 0; item.basePhysical = bonus === 1 ? 2 : 0; item.baseMagic = bonus === 2 ? 2 : 0
  }
  return item
}

export function createLootState(dungeon: GeneratedDungeon, random: RandomSource = Math.random): LootState {
  const count = Math.min(rollChestCount(random()), dungeon.totalFloors - 1)
  const candidates = dungeon.floors.filter((floor) => floor.floor < dungeon.totalFloors && floor.chestCandidate !== null)
  const chests = uniquePicks(candidates, count, random).map((floor) => ({ floor: floor.floor, position: { ...floor.chestCandidate! }, opened: false }))
  return { chests, items: [], resolvedEnemyIds: [], notices: [] }
}

function receiveItem(battle: BattleState, item: EquipmentItem): BattleState {
  if (!battle.loot) return battle
  return { ...battle, player: { ...battle.player, inventory: [...battle.player.inventory, item] }, loot: { ...battle.loot, items: [...battle.loot.items, item], notices: [...battle.loot.notices, item] } }
}

// 全行動の前後で消えた敵を共通処理。毒・燃焼・範囲攻撃も同じ経路を通る。
export function resolveEnemyLoot(before: BattleState, after: BattleState, dungeon: GeneratedDungeon, random: RandomSource = Math.random, createId?: () => string): BattleState {
  if (!after.loot || before === after) return after
  const remaining = new Set(after.combat.enemies.map((enemy) => enemy.id))
  let next = after
  for (const enemy of before.combat.enemies) {
    if (remaining.has(enemy.id) || next.loot!.resolvedEnemyIds.includes(enemy.id)) continue
    next = { ...next, loot: { ...next.loot!, resolvedEnemyIds: [...next.loot!.resolvedEnemyIds, enemy.id] } }
    if (enemy.isBoss || random() < .05) next = receiveItem(next, generateEquipment(dungeon, random, createId))
  }
  return next
}

export function openLootChest(battle: BattleState, floor: number, target: Position, dungeon: GeneratedDungeon, random: RandomSource = Math.random, createId?: () => string): BattleState {
  if (!battle.loot || battle.combat.finished || battle.combat.position.x !== target.x || battle.combat.position.y !== target.y) return battle
  const chest = battle.loot.chests.find((candidate) => candidate.floor === floor && candidate.position.x === target.x && candidate.position.y === target.y)
  if (!chest || chest.opened) return battle
  const item = generateEquipment(dungeon, random, createId)
  const next = { ...battle, loot: { ...battle.loot, chests: battle.loot.chests.map((candidate) => candidate === chest ? { ...candidate, opened: true } : candidate) } }
  return receiveItem(next, item)
}

export function sortRewards(items: EquipmentItem[]): EquipmentItem[] {
  return [...items].sort((a, b) => RARITY_MULTIPLIERS[b.rarity] - RARITY_MULTIPLIERS[a.rarity] || b.level - a.level || a.id.localeCompare(b.id))
}
