import { itemBonuses, type EquipmentCategory, type EquipmentItem, type PlayerState, type SkillId, type SpecialEffectId } from './player'

export type InventorySort = 'levelDesc' | 'levelAsc' | 'statsDesc' | 'statsAsc' | 'skillLevel' | 'effectLevel' | 'newest' | 'oldest' | 'name'
export interface InventoryFilter {
  category: EquipmentCategory
  query: string
  subtype: string
  minLevel: number | null
  maxLevel: number | null
  hasSkill: boolean
  hasEffect: boolean
  skill: SkillId | ''
  effect: SpecialEffectId | ''
  favoritesOnly: boolean
  sort: InventorySort
}

export function filterInventory(player: PlayerState, filter: InventoryFilter): EquipmentItem[] {
  const query = filter.query.trim().toLocaleLowerCase('ja')
  const order = new Map(player.inventory.map((item, index) => [item.id, index]))
  const score = (item: EquipmentItem) => { const bonus = itemBonuses(item); return bonus.maxHp + bonus.physical + bonus.magic }
  const highestSkill = (item: EquipmentItem) => Math.max(0, ...item.skills.map((id) => item.skillLevels[id] ?? 1))
  return player.inventory.filter((item) => item.category === filter.category
    && item.name.toLocaleLowerCase('ja').includes(query)
    && (!filter.subtype || item.subtype === filter.subtype)
    && (filter.minLevel === null || item.level >= filter.minLevel)
    && (filter.maxLevel === null || item.level <= filter.maxLevel)
    && (!filter.hasSkill || item.skills.length > 0)
    && (!filter.hasEffect || item.specialEffect !== null)
    && (!filter.skill || item.skills.includes(filter.skill))
    && (!filter.effect || item.specialEffect === filter.effect)
    && (!filter.favoritesOnly || item.favorite)
  ).sort((a, b) => {
    const index = (item: EquipmentItem) => order.get(item.id) ?? 0
    switch (filter.sort) {
      case 'levelDesc': return b.level - a.level || index(a) - index(b)
      case 'levelAsc': return a.level - b.level || index(a) - index(b)
      case 'statsDesc': return score(b) - score(a) || index(a) - index(b)
      case 'statsAsc': return score(a) - score(b) || index(a) - index(b)
      case 'skillLevel': return highestSkill(b) - highestSkill(a) || index(a) - index(b)
      case 'effectLevel': return (b.specialEffectLevel ?? 0) - (a.specialEffectLevel ?? 0) || index(a) - index(b)
      case 'newest': return index(b) - index(a)
      case 'oldest': return index(a) - index(b)
      case 'name': return a.name.localeCompare(b.name, 'ja') || index(a) - index(b)
    }
  })
}
