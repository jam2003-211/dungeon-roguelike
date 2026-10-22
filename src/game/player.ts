export type JobId = 'unemployed' | 'warrior' | 'mage' | 'hunter' | 'paladin' | 'spellblade'
export type EquipmentCategory = 'weapon' | 'armor' | 'accessory'
export type WeaponType = 'sword' | 'spear' | 'bow' | 'shortStaff' | 'longStaff'
export type ArmorType = 'heavyArmor' | 'lightArmor' | 'heavyRobe' | 'lightRobe'
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export type SpecialEffectId = 'poison' | 'burn' | 'slow' | 'stun' | 'knockback' | 'critical' | 'lifesteal' | 'extraAttack'
export type SkillId = 'strongStrike' | 'magicBolt' | 'piercingShot' | 'shockwave' | 'flame' | 'smallHeal' | 'largeHeal' | 'poisonStrike' | 'slowSpell' | 'stunStrike' | 'dash' | 'guard'

export interface EquipmentItem {
  id: string
  name: string
  category: EquipmentCategory
  subtype: WeaponType | ArmorType | 'commonAccessory'
  level: number
  rarity: Rarity
  baseHp: number
  basePhysical: number
  baseMagic: number
  skills: SkillId[]
  specialEffect: SpecialEffectId | null
  favorite: boolean
  testOnly?: boolean
}

export interface EquipmentSlots { weapon: string | null; armor: string | null; accessory1: string | null; accessory2: string | null }
export interface PlayerState { level: number; experience: number; currentHp: number; job: JobId; inventory: EquipmentItem[]; equipment: EquipmentSlots }
export interface PlayerStats { maxHp: number; physical: number; magic: number }

export const RARITY_MULTIPLIERS: Readonly<Record<Rarity, number>> = { common: 1, rare: 1.25, epic: 1.5, legendary: 2 }
export const SPECIAL_EFFECT_RATES: Readonly<Record<Rarity, number>> = { common: .1, rare: .25, epic: .5, legendary: .75 }
export const RARITY_LABELS: Readonly<Record<Rarity, string>> = { common: 'コモン', rare: 'レア', epic: 'エピック', legendary: 'レジェンダリー' }
export const SUBTYPE_LABELS: Readonly<Record<EquipmentItem['subtype'], string>> = { sword: '剣', spear: '槍', bow: '弓', shortStaff: '短杖', longStaff: '長杖', heavyArmor: '重鎧', lightArmor: '軽鎧', heavyRobe: '重装束', lightRobe: '軽装束', commonAccessory: '共通アクセサリー' }

export const JOBS = {
  unemployed: { name: '無職', unlockLevel: 1, hp: 1, physical: 1, magic: 1, weapons: ['sword', 'spear', 'bow', 'shortStaff', 'longStaff'], armors: ['heavyArmor', 'lightArmor', 'heavyRobe', 'lightRobe'] },
  warrior: { name: '戦士', unlockLevel: 5, hp: 1.3, physical: 1.2, magic: .6, weapons: ['sword', 'spear'], armors: ['heavyArmor', 'lightArmor'] },
  mage: { name: '魔法使い', unlockLevel: 5, hp: .8, physical: .5, magic: 1.5, weapons: ['shortStaff', 'longStaff'], armors: ['heavyRobe', 'lightRobe'] },
  hunter: { name: '狩人', unlockLevel: 20, hp: .9, physical: 1.4, magic: .7, weapons: ['sword', 'bow'], armors: ['lightArmor', 'lightRobe'] },
  paladin: { name: '聖騎士', unlockLevel: 25, hp: 1.6, physical: 1.1, magic: .9, weapons: ['sword', 'spear', 'shortStaff'], armors: ['heavyArmor', 'heavyRobe'] },
  spellblade: { name: '魔法剣士', unlockLevel: 30, hp: .8, physical: 1.3, magic: 1.3, weapons: ['sword', 'shortStaff', 'longStaff'], armors: ['lightArmor', 'lightRobe'] },
} as const

export function experienceToNext(level: number): number { return 100 + 25 * (level - 1) }
export function baseStats(level: number): PlayerStats { const attack = 12 + 5 * (level - 1); return { maxHp: 100 + 20 * (level - 1), physical: attack, magic: attack } }
export function itemBonuses(item: EquipmentItem): PlayerStats {
  const multiplier = RARITY_MULTIPLIERS[item.rarity]
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

function item(id: string, name: string, category: EquipmentCategory, subtype: EquipmentItem['subtype'], level: number, rarity: Rarity, baseHp: number, basePhysical: number, baseMagic: number, skills: SkillId[] = [], specialEffect: SpecialEffectId | null = null, testOnly = true): EquipmentItem {
  return { id, name, category, subtype, level, rarity, baseHp, basePhysical, baseMagic, skills, specialEffect, favorite: false, testOnly }
}

export function createTestInventory(): EquipmentItem[] {
  return [
    item('initial-sword', '初心者用の剣', 'weapon', 'sword', 1, 'common', 0, 3, 0, [], null, false),
    item('initial-armor', '初期軽鎧', 'armor', 'lightArmor', 1, 'common', 0, 0, 0, [], null, false),
    item('test-spear', '試験用の槍', 'weapon', 'spear', 5, 'rare', 0, 7, 0, [], 'knockback'),
    item('test-bow', '試験用の弓', 'weapon', 'bow', 8, 'epic', 0, 9, 0, [], 'critical'),
    item('test-short-staff', '試験用の短杖', 'weapon', 'shortStaff', 5, 'rare', 0, 0, 8, [], 'lifesteal'),
    item('test-long-staff', '試験用の長杖', 'weapon', 'longStaff', 10, 'legendary', 0, 0, 10, [], 'extraAttack'),
    item('test-poison-sword', '毒の試験剣', 'weapon', 'sword', 3, 'legendary', 0, 5, 0, [], 'poison'),
    item('test-burn-sword', '燃焼の試験剣', 'weapon', 'sword', 3, 'legendary', 0, 5, 0, [], 'burn'),
    item('test-slow-sword', '鈍足の試験剣', 'weapon', 'sword', 3, 'legendary', 0, 5, 0, [], 'slow'),
    item('test-stun-sword', '気絶の試験剣', 'weapon', 'sword', 3, 'legendary', 0, 5, 0, [], 'stun'),
    item('test-heavy-armor', '試験用重鎧', 'armor', 'heavyArmor', 5, 'rare', 30, 0, 0, ['guard']),
    item('test-light-armor', '試験用軽鎧', 'armor', 'lightArmor', 5, 'epic', 20, 0, 0, ['strongStrike', 'piercingShot', 'dash']),
    item('test-heavy-robe', '試験用重装束', 'armor', 'heavyRobe', 5, 'rare', 20, 0, 3, ['largeHeal']),
    item('test-light-robe', '試験用軽装束', 'armor', 'lightRobe', 5, 'epic', 15, 0, 5, ['magicBolt', 'flame', 'slowSpell']),
    item('test-accessory-a', '試験護符・戦技', 'accessory', 'commonAccessory', 4, 'rare', 5, 2, 0, ['shockwave', 'poisonStrike']),
    item('test-accessory-b', '試験護符・治癒', 'accessory', 'commonAccessory', 4, 'epic', 8, 0, 2, ['smallHeal', 'stunStrike']),
  ]
}

export function createPlayerState(): PlayerState { return { level: 1, experience: 0, currentHp: 100, job: 'unemployed', inventory: createTestInventory(), equipment: { weapon: 'initial-sword', armor: 'initial-armor', accessory1: null, accessory2: null } } }
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
export function enemyExperience(level: number, boss: boolean): number { const normal = 20 + 5 * (level - 1); return boss ? normal * 5 : normal }
export function toggleFavorite(player: PlayerState, id: string): PlayerState { return { ...player, inventory: player.inventory.map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item) } }
export function discardItem(player: PlayerState, id: string): PlayerState { const target = player.inventory.find((item) => item.id === id); if (!target || target.favorite || isEquipped(player, id)) return player; return { ...player, inventory: player.inventory.filter((item) => item.id !== id) } }
export function sortAndFilterInventory(player: PlayerState, category: EquipmentCategory, query: string): EquipmentItem[] { const rank: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 }; const normalized = query.trim().toLocaleLowerCase('ja'); return player.inventory.filter((item) => item.category === category && item.name.toLocaleLowerCase('ja').includes(normalized)).sort((a, b) => Number(b.favorite) - Number(a.favorite) || rank[b.rarity] - rank[a.rarity] || b.level - a.level || a.id.localeCompare(b.id)) }
export function availableSkills(player: PlayerState): SkillId[] { return [...new Set(equippedItems(player).flatMap((item) => item.skills))] }
export function availableSkillPower(player: PlayerState, skillId: SkillId): number { return Math.max(0, ...equippedItems(player).filter((item) => item.skills.includes(skillId)).map((item) => RARITY_MULTIPLIERS[item.rarity])) }
export function equippedWeapon(player: PlayerState): EquipmentItem | null { return player.inventory.find((item) => item.id === player.equipment.weapon) ?? null }
