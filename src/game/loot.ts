import { SUBTYPE_LABELS, weaponBaseAttack, type EquipmentCategory, type EquipmentItem, type SkillId, type SpecialEffectId, type UnidentifiedTreasure } from './player'
import { EFFECT_PREFIXES, SKILL_PREFIXES, rollEffectLevel } from './effectLevels'
import { SPECIAL_REWARD_POSITIONS, type GeneratedDungeon } from './dungeon'
import type { Position } from './forestMap'
import type { BattleState } from './battle'

export interface LootChest { floor: number; position: Position; opened: boolean; item?: EquipmentItem }
export interface LootState {
  chests: LootChest[]
  items: UnidentifiedTreasure[]
  resolvedEnemyIds: string[]
  notices: UnidentifiedTreasure[]
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
// 旧レア度の60/25/12/3分布を能力個体差と発動率へ別々に写す。
export function rollStatMultiplier(value: number): number { return value < .6 ? 1 : value < .85 ? 1.25 : value < .97 ? 1.5 : 2 }
export function rollEffectRate(value: number): number { return value < .6 ? .1 : value < .85 ? .25 : value < .97 ? .5 : .75 }
export function rollCategory(featured: EquipmentCategory, value: number): EquipmentCategory {
  return value < .5 ? featured : categories.filter((category) => category !== featured)[value < .75 ? 0 : 1]
}

export function generateEquipment(dungeon: Pick<GeneratedDungeon, 'level' | 'featuredCategory'>, random: RandomSource = Math.random, createId: () => string = () => crypto.randomUUID()): EquipmentItem {
  const category = rollCategory(dungeon.featuredCategory, random())
  const statMultiplier = rollStatMultiplier(random())
  const level = Math.max(1, dungeon.level + Math.min(5, Math.floor((random() + random()) / 2 * 11) - 5))
  const item: EquipmentItem = { id: createId(), category, subtype: 'commonAccessory', name: '', level, statMultiplier, effectRate: .1, legacySkillPower: 1, baseHp: 0, basePhysical: 0, baseMagic: 0, skills: [], skillLevels: {}, specialEffect: null, specialEffectLevel: null, favorite: false, testOnly: false }
  if (category === 'weapon' || category === 'armor') {
    const subtype = category === 'weapon' ? pick(['sword', 'spear', 'bow', 'shortStaff', 'longStaff'] as const, random) : pick(['heavyArmor', 'lightArmor', 'heavyRobe', 'lightRobe'] as const, random)
    const [hp, physical, magic] = EQUIPMENT_BASES[subtype]
    const weaponPower = category === 'weapon' ? weaponBaseAttack(level, subtype as 'sword' | 'spear' | 'bow' | 'shortStaff' | 'longStaff') : 0
    Object.assign(item, { subtype, name: SUBTYPE_LABELS[subtype], baseHp: hp, basePhysical: category === 'weapon' && physical > 0 ? weaponPower : physical, baseMagic: category === 'weapon' && magic > 0 ? weaponPower : magic })
    if (category === 'weapon') { item.specialEffect = pick(effects, random); item.specialEffectLevel = rollEffectLevel(random) }
    else item.skills = uniquePicks(skills, subtype === 'heavyArmor' || subtype === 'heavyRobe' ? 1 : 3, random)
  } else if (random() < .5) {
    item.name = '技の護符'; item.skills = [pick(skills, random)]
  } else {
    const bonus = index(random, 3)
    item.name = ['生命の護符', '力の護符', '魔力の護符'][bonus]
    item.baseHp = bonus === 0 ? 8 : 0; item.basePhysical = bonus === 1 ? 2 : 0; item.baseMagic = bonus === 2 ? 2 : 0
  }
  for (const skill of item.skills) item.skillLevels[skill] = rollEffectLevel(random)
  item.effectRate = rollEffectRate(random())
  const representative = skills.find((skill) => item.skills.includes(skill))
  if (representative) item.name = `${SKILL_PREFIXES[representative]}の${category === 'accessory' ? '護符' : SUBTYPE_LABELS[item.subtype]}`
  else if (item.specialEffect) item.name = `${EFFECT_PREFIXES[item.specialEffect]}の${SUBTYPE_LABELS[item.subtype]}`
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
  const treasure: UnidentifiedTreasure = { id: item.id, level: item.level, item }
  return { ...battle, player: { ...battle.player, treasures: [...battle.player.treasures, treasure] }, loot: { ...battle.loot, items: [...battle.loot.items, treasure], notices: [...battle.loot.notices, treasure] } }
}

// 全行動の前後で消えた敵を共通処理。毒・燃焼・範囲攻撃も同じ経路を通る。
export function resolveEnemyLoot(before: BattleState, after: BattleState, dungeon: GeneratedDungeon, random: RandomSource = Math.random, createId?: () => string): BattleState {
  if (!after.loot || before === after) return after
  const remaining = new Set(after.combat.enemies.map((enemy) => enemy.id))
  let next = after
  for (const enemy of before.combat.enemies) {
    if (remaining.has(enemy.id) || next.loot!.resolvedEnemyIds.includes(enemy.id)) continue
    next = { ...next, loot: { ...next.loot!, resolvedEnemyIds: [...next.loot!.resolvedEnemyIds, enemy.id] } }
    if (enemy.specialBoss) {
      const theme = enemy.specialBoss
      next = { ...next, player: { ...next.player, specialBossClears: [...new Set([...(next.player.specialBossClears ?? []), theme])] }, loot: { ...next.loot!, chests: [...next.loot!.chests, ...SPECIAL_REWARD_POSITIONS.map((position) => ({ floor: dungeon.totalFloors, position: { ...position }, opened: false, item: generateEquipment(dungeon, random, createId) }))] } }
    } else if (enemy.isBoss || random() < .05) next = receiveItem(next, generateEquipment(dungeon, random, createId))
  }
  return next
}

export function openLootChest(battle: BattleState, floor: number, target: Position, dungeon: GeneratedDungeon, random: RandomSource = Math.random, createId?: () => string): BattleState {
  if (!battle.loot || battle.combat.finished || battle.combat.position.x !== target.x || battle.combat.position.y !== target.y) return battle
  const chest = battle.loot.chests.find((candidate) => candidate.floor === floor && candidate.position.x === target.x && candidate.position.y === target.y)
  if (!chest || chest.opened) return battle
  const item = chest.item ?? generateEquipment(dungeon, random, createId)
  const next = { ...battle, loot: { ...battle.loot, chests: battle.loot.chests.map((candidate) => candidate === chest ? { ...candidate, opened: true } : candidate) } }
  return receiveItem(next, item)
}

export function sortRewards(items: UnidentifiedTreasure[]): UnidentifiedTreasure[] {
  return [...items].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))
}
