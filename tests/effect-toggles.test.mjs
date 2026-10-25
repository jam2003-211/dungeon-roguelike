import assert from 'node:assert/strict'
import test from 'node:test'
import { loadGameModule as load } from './pwa-fixture.mjs'

const player = await load('game/player')
const battle = await load('game/battle')
const auto = await load('game/autoCombat')
const combat = await load('game/combat/combat')
const dungeon = await load('game/dungeon')
const save = await load('persistence/saveData')
const map = Array.from({ length: 20 }, () => Array(20).fill('grass'))
const target = { x: 11, y: 10 }

function equippedPlayer() {
  const character = player.createPlayerState()
  const sword = { ...character.inventory[0], skills: ['strongStrike', 'smallHeal', 'guard'], skillLevels: { strongStrike: 2, smallHeal: 3, guard: 1 }, specialEffect: 'poison', specialEffectLevel: 3, effectRate: .75 }
  const armor = { ...character.inventory[1], skills: ['strongStrike', 'dash'], skillLevels: { strongStrike: 5, dash: 2 } }
  const accessory = { ...sword, id: 'accessory', category: 'accessory', subtype: 'commonAccessory', skills: ['strongStrike'], skillLevels: { strongStrike: 4 }, specialEffectLevel: 5 }
  const unowned = { ...sword, id: 'spare', skills: ['flame'], skillLevels: { flame: 5 }, specialEffect: 'burn' }
  return { ...character, inventory: [sword, armor, accessory, unowned], equipment: { ...character.equipment, accessory1: 'accessory' }, currentHp: 50 }
}

function state(character = equippedPlayer()) {
  const enemy = { ...combat.createEnemy('target', 'goblin', 1, target), hp: 100000, maxHp: 100000, attack: 0 }
  return battle.createBattleState(character, [enemy], { x: 10, y: 10 })
}

test('装備中の効果だけを種類ごとに集約し、最大Lvを表示用に返す', () => {
  const character = equippedPlayer()
  assert.deepEqual(player.availableSkills(character), ['strongStrike', 'smallHeal', 'guard', 'dash'])
  assert.equal(player.availableSkillLevel(character, 'strongStrike'), 5)
  assert.deepEqual(player.availableSpecialEffects(character), [{ id: 'poison', level: 5 }])
  const disabled = player.toggleSkillEnabled(player.toggleSpecialEffectEnabled(character, 'poison'), 'strongStrike')
  const unequipped = player.unequipSlot(disabled, 'accessory1')
  assert.equal(player.availableSkillLevel(unequipped, 'strongStrike'), 5)
  assert.equal(player.skillEnabled(unequipped, 'strongStrike'), false)
  assert.equal(player.specialEffectEnabled(unequipped, 'poison'), false)
  const restored = player.equipItem(unequipped, 'accessory')
  assert.equal(player.availableSpecialEffects(restored)[0].level, 5)
  assert.equal(player.specialEffectEnabled(restored, 'poison'), false)
})

test('攻撃スキルOFFは通常攻撃へ戻り、ONでは既存優先順位で発動する', () => {
  const initial = state()
  assert.equal(auto.chooseAutoAction(initial, map).skillId, 'strongStrike')
  const disabled = { ...initial, player: player.toggleSkillEnabled(initial.player, 'strongStrike') }
  assert.equal(auto.chooseAutoAction(disabled, map).skillId, undefined)
  const result = auto.performAutoAttack(disabled, map, () => 1)
  assert.equal(result.combat.turn, 1)
  assert.equal(result.cooldowns.strongStrike ?? 0, 0)
  assert.equal(auto.chooseAutoAction({ ...disabled, player: player.toggleSkillEnabled(disabled.player, 'strongStrike') }, map).skillId, 'strongStrike')
})

test('手動スキルOFFはターンとCDを消費せず、OFF中も既存のCD減少則を保つ', () => {
  for (const id of ['smallHeal', 'guard', 'dash']) {
    const initial = state()
    const disabled = { ...initial, player: player.toggleSkillEnabled(initial.player, id) }
    assert.equal(battle.useSkill(disabled, id, id === 'dash' ? { x: 10, y: 8 } : undefined, map), disabled)
  }
  const initial = state()
  initial.cooldowns = { strongStrike: 3, smallHeal: 3 }
  const disabled = { ...initial, player: player.toggleSkillEnabled(player.toggleSkillEnabled(initial.player, 'smallHeal'), 'strongStrike') }
  const moved = battle.moveBattlePlayer(disabled, 'up', map)
  assert.equal(moved.cooldowns.strongStrike, 3)
  assert.equal(moved.cooldowns.smallHeal, 2)
  const attacked = battle.attackWithWeapon(disabled, target, map, () => 1)
  assert.equal(attacked.cooldowns.strongStrike, 2)
  assert.equal(attacked.cooldowns.smallHeal, 2)
  assert.equal(player.skillEnabled(player.toggleSkillEnabled(attacked.player, 'strongStrike'), 'strongStrike'), true)
})

test('特殊効果OFFは抽選も演出も行わず、再ONで同じ確率とLvを使う', () => {
  const initial = state()
  let draws = 0
  const disabled = { ...initial, player: player.toggleSpecialEffectEnabled(initial.player, 'poison') }
  const off = battle.attackWithWeapon(disabled, target, map, () => { draws += 1; return 0 })
  assert.equal(draws, 0)
  assert.equal(off.combat.enemies[0].statuses.poison, 0)
  assert.equal(off.visualEvents.some((event) => event.effect === 'poison'), false)
  const enabled = { ...initial, player: player.toggleSpecialEffectEnabled(disabled.player, 'poison') }
  const on = battle.attackWithWeapon(enabled, target, map, () => { draws += 1; return 0 })
  assert.equal(draws, 1)
  assert.ok(on.combat.enemies[0].statuses.poison > 0)
  assert.equal(on.visualEvents.some((event) => event.effect === 'poison'), true)
})

test('v7の設定は保存・再開で維持され、v6は全ONで読み込む', () => {
  const character = player.toggleSpecialEffectEnabled(player.toggleSkillEnabled(equippedPlayer(), 'strongStrike'), 'poison')
  const stocks = dungeon.createDungeonStocks()
  const saved = save.createSaveData(character, stocks)
  assert.equal(saved.schemaVersion, 7)
  assert.deepEqual(save.readSaveData(saved).player.disabledSkills, ['strongStrike'])
  assert.deepEqual(save.readSaveData(saved).player.disabledEffects, ['poison'])
  const old = structuredClone(saved)
  old.schemaVersion = 6
  delete old.player.disabledSkills
  delete old.player.disabledEffects
  const migrated = save.readSaveData(old)
  assert.deepEqual(migrated.player.disabledSkills, [])
  assert.deepEqual(migrated.player.disabledEffects, [])
  assert.equal(migrated.player.inventory.length, character.inventory.length)
  assert.throws(() => save.readSaveData({ ...saved, player: { ...saved.player, disabledSkills: ['fake'] } }), /破損/)
  assert.throws(() => save.readSaveData({ ...saved, player: { ...saved.player, disabledEffects: ['poison', 'poison'] } }), /破損/)
})
