export type JobId = 'unemployed' | 'warrior' | 'mage' | 'hunter' | 'paladin' | 'spellblade'
export type EquipmentCategory = 'weapon' | 'armor' | 'accessory'
export type WeaponType = 'sword' | 'spear' | 'bow' | 'shortStaff' | 'longStaff'
export type ArmorType = 'heavyArmor' | 'lightArmor' | 'heavyRobe' | 'lightRobe'
import { levelMultiplier, type EffectLevel } from './effectLevels'

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' // 旧セーブの移行専用
export type SpecialEffectId = 'poison' | 'burn' | 'slow' | 'stun' | 'knockback' | 'critical' | 'lifesteal' | 'extraAttack'
export type SkillId = 'strongStrike' | 'magicBolt' | 'piercingShot' | 'shockwave' | 'flame' | 'smallHeal' | 'largeHeal' | 'poisonStrike' | 'slowSpell' | 'stunStrike' | 'dash' | 'guard'

export interface EquipmentItem {
  id: string
  name: string
  category: EquipmentCategory
  subtype: WeaponType | ArmorType | 'commonAccessory'
  level: number
  statMultiplier: number
  effectRate: number
  legacySkillPower: number
  baseHp: number
  basePhysical: number
  baseMagic: number
  skills: SkillId[]
  skillLevels: Partial<Record<SkillId, EffectLevel>>
  specialEffect: SpecialEffectId | null
  specialEffectLevel: EffectLevel | null
  favorite: boolean
  testOnly?: boolean
}

export interface UnidentifiedTreasure { id: string; level: number; item: EquipmentItem }

export interface EquipmentSlots { weapon: string | null; armor: string | null; accessory1: string | null; accessory2: string | null }
export interface PlayerState { level: number; experience: number; currentHp: number; job: JobId; inventory: EquipmentItem[]; treasures: UnidentifiedTreasure[]; equipment: EquipmentSlots; specialBossClears: ('forest' | 'ruins' | 'castle')[] }
export interface PlayerStats { maxHp: number; physical: number; magic: number }

export const RARITY_MULTIPLIERS: Readonly<Record<Rarity, number>> = { common: 1, rare: 1.25, epic: 1.5, legendary: 2 }
export const SPECIAL_EFFECT_RATES: Readonly<Record<Rarity, number>> = { common: .1, rare: .25, epic: .5, legendary: .75 }
export const SUBTYPE_LABELS: Readonly<Record<EquipmentItem['subtype'], string>> = { sword: '剣', spear: '槍', bow: '弓', shortStaff: '短杖', longStaff: '長杖', heavyArmor: '重鎧', lightArmor: '軽鎧', heavyRobe: '重装束', lightRobe: '軽装束', commonAccessory: '共通アクセサリー' }

export const JOBS = {
  unemployed: { name: '無職', unlockLevel: 1, hp: .8, physical: .8, magic: .8, weapons: ['sword', 'spear', 'bow', 'shortStaff', 'longStaff'], armors: ['heavyArmor', 'lightArmor', 'heavyRobe', 'lightRobe'] },
  warrior: { name: '戦士', unlockLevel: 5, hp: 1.3, physical: 1.2, magic: .6, weapons: ['sword', 'spear'], armors: ['heavyArmor', 'lightArmor'] },
  mage: { name: '魔法使い', unlockLevel: 5, hp: .8, physical: .5, magic: 1.5, weapons: ['shortStaff', 'longStaff'], armors: ['heavyRobe', 'lightRobe'] },
  hunter: { name: '狩人', unlockLevel: 20, hp: .9, physical: 1.4, magic: .7, weapons: ['sword', 'bow'], armors: ['lightArmor', 'lightRobe'] },
  paladin: { name: '聖騎士', unlockLevel: 25, hp: 1.6, physical: 1.1, magic: .9, weapons: ['sword', 'spear', 'shortStaff'], armors: ['heavyArmor', 'heavyRobe'] },
  spellblade: { name: '魔法剣士', unlockLevel: 30, hp: .8, physical: 1.3, magic: 1.3, weapons: ['sword', 'shortStaff', 'longStaff'], armors: ['lightArmor', 'lightRobe'] },
} as const

// Lv1～5は従来の速度を維持し、以降は10階探索の敵数に合わせて必要量を増やす。
export function experienceToNext(level: number): number { const later = Math.max(0, level - 5); return 100 + 25 * (level - 1) + 250 * later + 10 * later * later }
export function baseStats(level: number): PlayerStats { const attack = 12 + 5 * (level - 1); return { maxHp: 100 + 20 * (level - 1), physical: attack, magic: attack } }
const WEAPON_TARGET_OFFSET: Readonly<Record<WeaponType, number>> = { sword: 2, spear: 0, bow: -2, shortStaff: -2, longStaff: -5 }
export const STANDARD_ENEMY_BASE_HP = 20
export function standardEnemyHp(level: number): number { return STANDARD_ENEMY_BASE_HP + 10 * (level - 1) }

// 実際の無職の補正と装備補正の切り捨てを使い、目標HPに届く最小の基礎値を求める。
export function weaponBaseAttack(level: number, type: WeaponType): number {
  const scale = 1 + .1 * (level - 1)
  const magic = type === 'shortStaff' || type === 'longStaff'
  const reference = Math.floor(baseStats(level)[magic ? 'magic' : 'physical'] * JOBS.unemployed[magic ? 'magic' : 'physical'])
  const target = standardEnemyHp(Math.max(1, level + WEAPON_TARGET_OFFSET[type]))
  const required = Math.max(0, target - reference)
  let base = Math.max(0, Math.ceil(required / scale))
  while (Math.floor(base * scale) < required) base += 1
  while (base > 0 && Math.floor((base - 1) * scale) >= required) base -= 1
  // 目標敵Lvが1に張り付く序盤は基礎攻撃の成長で必要値が下がる。
  // その区間の最大値を保持し、装備Lvの上昇で武器の基礎値を下げない。
  if (level > 1 && level <= 6) return Math.max(base, ...Array.from({ length: level - 1 }, (_, index) => weaponBaseAttack(index + 1, type)))
  if (level > 6 && WEAPON_TARGET_OFFSET[type] < 0) return Math.max(base, weaponBaseAttack(6, type))
  return base
}
export function itemBonuses(item: EquipmentItem): PlayerStats {
  const multiplier = item.statMultiplier ?? 1
  const scale = 1 + .1 * (item.level - 1)
  return { maxHp: Math.floor(item.baseHp * scale * multiplier), physical: Math.floor(item.basePhysical * scale * multiplier), magic: Math.floor(item.baseMagic * scale * multiplier) }
}
export function equippedItems(player: PlayerState): EquipmentItem[] {
  const ids = Object.values(player.equipment).filter((id): id is string => id !== null)
  return ids.map((id) => player.inventory.find((item) => item.id === id)).filter((item): item is EquipmentItem => item !== undefined)
}
export function calculateStats(player: PlayerState): PlayerStats {
  const base = baseStats(player.level); const job = JOBS[player.job]
  return equippedItems(player).reduce((stats, item) => { const bonus = itemBonuses(item); return { maxHp: stats.maxHp + bonus.maxHp, physical: stats.physical + bonus.physical, magic: stats.magic + bonus.magic } }, { maxHp: Math.floor(base.maxHp * job.hp), physical: Math.floor(base.physical * job.physical), magic: Math.floor(base.magic * job.magic) })
}

export function createPlayerState(): PlayerState {
  return { level: 1, experience: 0, currentHp: 80, job: 'unemployed', treasures: [], inventory: [
    { id: 'initial-sword', name: '剣', category: 'weapon', subtype: 'sword', level: 1, statMultiplier: 1, effectRate: .1, legacySkillPower: 1, baseHp: 0, basePhysical: weaponBaseAttack(1, 'sword'), baseMagic: 0, skills: [], skillLevels: {}, specialEffect: null, specialEffectLevel: null, favorite: false, testOnly: false },
    { id: 'initial-armor', name: '軽鎧', category: 'armor', subtype: 'lightArmor', level: 1, statMultiplier: 1, effectRate: .1, legacySkillPower: 1, baseHp: 0, basePhysical: 0, baseMagic: 0, skills: [], skillLevels: {}, specialEffect: null, specialEffectLevel: null, favorite: false, testOnly: false },
  ], equipment: { weapon: 'initial-sword', armor: 'initial-armor', accessory1: null, accessory2: null }, specialBossClears: [] }
}
export function canEquip(jobId: JobId, item: EquipmentItem): boolean { if (item.category === 'accessory') return true; const job = JOBS[jobId]; return item.category === 'weapon' ? (job.weapons as readonly string[]).includes(item.subtype) : (job.armors as readonly string[]).includes(item.subtype) }
export function isEquipped(player: PlayerState, id: string): boolean { return Object.values(player.equipment).includes(id) }

export function equipItem(player: PlayerState, id: string, accessorySlot?: 'accessory1' | 'accessory2'): PlayerState {
  const item = player.inventory.find((candidate) => candidate.id === id); if (!item || !canEquip(player.job, item)) return player
  let equipment = { ...player.equipment }
  if (item.category === 'weapon') equipment.weapon = id
  else if (item.category === 'armor') equipment.armor = id
  else { const slot = accessorySlot ?? (equipment.accessory1 === null ? 'accessory1' : equipment.accessory2 === null ? 'accessory2' : null); if (!slot) return player; equipment[slot] = id }
  const next = { ...player, equipment }; return { ...next, currentHp: Math.min(calculateStats(next).maxHp, player.currentHp) }
}
export function unequipSlot(player: PlayerState, slot: keyof EquipmentSlots): PlayerState { const next = { ...player, equipment: { ...player.equipment, [slot]: null } }; return { ...next, currentHp: Math.min(player.currentHp, calculateStats(next).maxHp) } }
export function changeJob(player: PlayerState, job: JobId): PlayerState {
  if (player.level < JOBS[job].unlockLevel || player.job === job) return player
  const equipment = { ...player.equipment }
  for (const slot of ['weapon', 'armor'] as const) { const equipped = player.inventory.find((candidate) => candidate.id === equipment[slot]); if (equipped && !canEquip(job, equipped)) equipment[slot] = null }
  const next = { ...player, job, equipment }; return { ...next, currentHp: calculateStats(next).maxHp }
}
export function gainExperience(player: PlayerState, amount: number): { player: PlayerState; levelsGained: number } {
  let level = player.level; let experience = player.experience + Math.max(0, amount); let levelsGained = 0
  const oldMax = calculateStats(player).maxHp
  while (experience >= experienceToNext(level)) { experience -= experienceToNext(level); level += 1; levelsGained += 1 }
  const next = { ...player, level, experience }; const maxIncrease = calculateStats(next).maxHp - oldMax
  return { player: { ...next, currentHp: Math.min(calculateStats(next).maxHp, player.currentHp + Math.max(0, maxIncrease)) }, levelsGained }
}
// 大幅な格上を倒しても、経験値はプレイヤーより5レベル上までで計算する。
export function enemyExperience(level: number, boss: boolean, playerLevel = level): number { const normal = 20 + 5 * (Math.min(level, playerLevel + 5) - 1); return boss ? normal * 5 : normal }
export function toggleFavorite(player: PlayerState, id: string): PlayerState { return { ...player, inventory: player.inventory.map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item) } }
export function discardItem(player: PlayerState, id: string): PlayerState { const target = player.inventory.find((item) => item.id === id); if (!target || target.favorite || isEquipped(player, id)) return player; return { ...player, inventory: player.inventory.filter((item) => item.id !== id) } }
export function sortAndFilterInventory(player: PlayerState, category: EquipmentCategory, query: string): EquipmentItem[] { const normalized = query.trim().toLocaleLowerCase('ja'); return player.inventory.filter((item) => item.category === category && item.name.toLocaleLowerCase('ja').includes(normalized)).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.level - a.level || a.id.localeCompare(b.id)) }
export function availableSkills(player: PlayerState): SkillId[] { return [...new Set(equippedItems(player).flatMap((item) => item.skills))] }
export function availableSkillLevel(player: PlayerState, skillId: SkillId): EffectLevel { return Math.max(1, ...equippedItems(player).filter((item) => item.skills.includes(skillId)).map((item) => item.skillLevels?.[skillId] ?? 1)) as EffectLevel }
export function availableSkillPower(player: PlayerState, skillId: SkillId): number { const level = availableSkillLevel(player, skillId); return levelMultiplier(level) * Math.max(1, ...equippedItems(player).filter((item) => item.skills.includes(skillId) && (item.skillLevels?.[skillId] ?? 1) === level).map((item) => item.legacySkillPower ?? 1)) }
export function equippedWeapon(player: PlayerState): EquipmentItem | null { return player.inventory.find((item) => item.id === player.equipment.weapon) ?? null }

export function recoverInTown(player: PlayerState): PlayerState { return { ...player, currentHp: calculateStats(player).maxHp } }

export function appraiseTreasure(player: PlayerState, id: string): { player: PlayerState; item: EquipmentItem | null } {
  const treasure = player.treasures.find((candidate) => candidate.id === id)
  if (!treasure) return { player, item: null }
  return { player: { ...player, treasures: player.treasures.filter((candidate) => candidate.id !== id), inventory: [...player.inventory, treasure.item] }, item: treasure.item }
}

export function appraiseAllTreasures(player: PlayerState): { player: PlayerState; items: EquipmentItem[] } {
  if (player.treasures.length === 0) return { player, items: [] }
  const items = player.treasures.map((treasure) => treasure.item)
  return { player: { ...player, treasures: [], inventory: [...player.inventory, ...items] }, items }
}
