// テスト専用の固定装備。ゲーム本体からは読み込まない。
export function createEquipmentFixture(legacy = false) {
  const item = (id, name, category, subtype, level, rarity, baseHp, basePhysical, baseMagic, skills = [], specialEffect = null, testOnly = legacy) => ({ id, name, category, subtype, level, rarity, baseHp, basePhysical, baseMagic, skills, specialEffect, favorite: false, testOnly })
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
export function createFixturePlayer(base = { level: 1, experience: 0, currentHp: 100, job: 'unemployed', equipment: { weapon: 'initial-sword', armor: 'initial-armor', accessory1: null, accessory2: null } }) {
  return { ...base, inventory: createEquipmentFixture() }
}
export function withEquipmentFixture(player) { return { ...player, createPlayerState: () => createFixturePlayer(player.createPlayerState()) } }
