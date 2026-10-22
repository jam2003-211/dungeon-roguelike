import { calculateStats, type PlayerState } from '../game/player'

// 名前や接頭辞だけでは削除しない。旧版の固定IDと専用フラグを両方確認する。
const legacyIds = new Set([
  'test-spear', 'test-bow', 'test-short-staff', 'test-long-staff',
  'test-poison-sword', 'test-burn-sword', 'test-slow-sword', 'test-stun-sword',
  'test-heavy-armor', 'test-light-armor', 'test-heavy-robe', 'test-light-robe',
  'test-accessory-a', 'test-accessory-b',
])

export function removeLegacyTestEquipment(player: PlayerState, rewardIds: ReadonlySet<string>): PlayerState {
  // 報酬記録に含まれる非標準データは、開封記録との整合性を優先して保持する。
  const removed = new Set(player.inventory.filter((item) => item.testOnly === true && legacyIds.has(item.id) && !rewardIds.has(item.id)).map((item) => item.id))
  if (!removed.size) return player
  const equipment = { ...player.equipment }
  for (const slot of ['weapon', 'armor', 'accessory1', 'accessory2'] as const) {
    if (equipment[slot] !== null && removed.has(equipment[slot])) equipment[slot] = null
  }
  const next = { ...player, inventory: player.inventory.filter((item) => !removed.has(item.id)), equipment }
  return { ...next, currentHp: Math.min(next.currentHp, calculateStats(next).maxHp) }
}
