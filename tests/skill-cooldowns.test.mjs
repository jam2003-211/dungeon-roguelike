import assert from 'node:assert/strict'
import test from 'node:test'
import { loadGameModule as load, pwaFixture } from './pwa-fixture.mjs'

const player = await load('game/player')
const battle = await load('game/battle')
const auto = await load('game/autoCombat')
const combat = await load('game/combat/combat')
const skills = await load('game/skills')
const saves = await load('persistence/saveData')
const savedRun = await load('persistence/savedRun')
const map = Array.from({ length: 20 }, () => Array(20).fill('grass'))
const origin = { x: 10, y: 10 }
const target = { x: 11, y: 10 }
const offensive = ['strongStrike', 'magicBolt', 'piercingShot', 'shockwave', 'flame', 'poisonStrike', 'slowSpell', 'stunStrike']
const manual = ['smallHeal', 'largeHeal', 'dash', 'guard']

function makeState(owned = [], subtype = 'sword', specialEffect = null, secondEnemy = false) {
  const character = player.createPlayerState()
  character.currentHp = 40
  character.inventory[0] = { ...character.inventory[0], subtype, specialEffect, specialEffectLevel: specialEffect ? 1 : null, effectRate: specialEffect ? 1 : .1 }
  character.inventory[1] = { ...character.inventory[1], skills: owned, skillLevels: Object.fromEntries(owned.map((id) => [id, 1])) }
  const enemy = (id, position) => ({ ...combat.createEnemy(id, 'goblin', 1, position), hp: 1000000, maxHp: 1000000, attack: 0 })
  return battle.createBattleState(character, [enemy('first', target), ...(secondEnemy ? [enemy('second', { x: 10, y: 11 })] : [])], origin)
}

test('攻撃8種と手動4種のCD分類・設定値を維持する', () => {
  assert.deepEqual(auto.AUTO_SKILL_PRIORITY, offensive)
  assert.deepEqual(offensive.map((id) => [id, skills.SKILLS[id].cooldown]), [
    ['strongStrike', 5], ['magicBolt', 5], ['piercingShot', 6], ['shockwave', 7],
    ['flame', 8], ['poisonStrike', 6], ['slowSpell', 4], ['stunStrike', 8],
  ])
  assert.deepEqual(manual.map((id) => [id, skills.SKILLS[id].cooldown]), [['smallHeal', 4], ['largeHeal', 8], ['dash', 5], ['guard', 5]])
  for (const id of offensive) assert.equal(skills.cooldownTrigger(id), 'normalAttack')
  for (const id of manual) assert.equal(skills.cooldownTrigger(id), 'playerAction')
})

test('移動・手動スキル・無効操作では攻撃CDを減らさず、手動CDは有効行動で減らす', () => {
  const initial = makeState([...offensive, ...manual])
  initial.cooldowns = { strongStrike: 3, magicBolt: 2, smallHeal: 2, guard: 2, dash: 2 }
  const moved = battle.moveBattlePlayer(initial, 'up', map)
  assert.equal(moved.cooldowns.strongStrike, 3)
  assert.equal(moved.cooldowns.magicBolt, 2)
  assert.equal(moved.cooldowns.smallHeal, 1)
  assert.equal(moved.cooldowns.guard, 1)
  const blockedMap = structuredClone(map); blockedMap[9][10] = 'tree'
  assert.equal(battle.moveBattlePlayer(initial, 'up', blockedMap), initial)
  assert.deepEqual(initial.cooldowns, { strongStrike: 3, magicBolt: 2, smallHeal: 2, guard: 2, dash: 2 })
  for (const id of manual) {
    const state = makeState([...offensive, ...manual])
    state.cooldowns = { strongStrike: 3, smallHeal: id === 'smallHeal' ? 0 : 2, guard: id === 'guard' ? 0 : 2 }
    const used = battle.useSkill(state, id, id === 'dash' ? { x: 10, y: 8 } : undefined, map)
    assert.notEqual(used, state, id)
    assert.equal(used.cooldowns.strongStrike, 3, id)
    assert.equal(used.cooldowns[id], skills.SKILLS[id].cooldown, id)
    if (id !== 'smallHeal') assert.equal(used.cooldowns.smallHeal, 1, id)
  }
  const full = makeState(['smallHeal', 'strongStrike']); full.player.currentHp = player.calculateStats(full.player).maxHp; full.combat.playerHp = full.player.currentHp; full.cooldowns.strongStrike = 2
  assert.equal(battle.useSkill(full, 'smallHeal', undefined, map), full)
  assert.equal(full.cooldowns.strongStrike, 2)
})

test('通常攻撃1回だけで減少し、範囲命中・追撃も追加の減少に数えない', () => {
  const single = makeState(['strongStrike', 'smallHeal'])
  single.cooldowns = { strongStrike: 3, smallHeal: 2 }
  const hit = battle.attackWithWeapon(single, target, map, () => 1)
  assert.equal(hit.cooldowns.strongStrike, 2)
  assert.equal(hit.cooldowns.smallHeal, 1)
  assert.equal(hit.combat.turn, 1)
  const area = makeState(['strongStrike'], 'shortStaff', 'extraAttack', true)
  area.cooldowns.strongStrike = 3
  const multi = battle.attackWithWeapon(area, target, map, () => 0)
  assert.equal(multi.cooldowns.strongStrike, 2)
  assert.equal(multi.combat.enemies.length, 2)
  assert.equal(multi.visualEvents.filter((event) => event.effect === 'extraAttack').length, 2)
  const empty = makeState(['strongStrike']); empty.combat.enemies = []; empty.cooldowns.strongStrike = 3
  assert.equal(battle.attackWithWeapon(empty, target, map), empty)
  assert.equal(auto.performAutoAttack(empty, map), empty)
  assert.equal(empty.cooldowns.strongStrike, 3)
  const dot = makeState(['strongStrike']); dot.cooldowns.strongStrike = 3
  dot.combat.enemies[0].hp = 1; dot.combat.enemies[0].statuses.poison = 1
  const noHit = battle.attackWithWeapon(dot, target, map)
  assert.equal(noHit.combat.turn, 1)
  assert.equal(noHit.cooldowns.strongStrike, 2)
})

for (const id of offensive) test(`${id}は発動後に${skills.SKILLS[id].cooldown}回の通常攻撃で再使用できる`, () => {
  let state = makeState([id])
  state = auto.performAutoAttack(state, map)
  assert.equal(state.actionNotice.skillId, id)
  assert.equal(state.cooldowns[id], skills.SKILLS[id].cooldown)
  for (let count = 1; count <= skills.SKILLS[id].cooldown; count += 1) {
    const next = auto.performAutoAttack(state, map)
    assert.equal(next.actionNotice.skillId, undefined, `${id}: ${count}回目は通常攻撃`)
    assert.equal(next.cooldowns[id], skills.SKILLS[id].cooldown - count)
    state = next
  }
  const ready = auto.performAutoAttack(state, map)
  assert.equal(ready.actionNotice.skillId, id)
  assert.equal(ready.cooldowns[id], skills.SKILLS[id].cooldown)
})

test('探索途中の保存・旧形式のロードはCD残量と武器移行を維持する', async () => {
  const current = await pwaFixture()
  current.run.battle.cooldowns = { strongStrike: 3, slowSpell: 1, smallHeal: 2, guard: 4 }
  const restored = saves.readSaveData(current)
  assert.deepEqual(savedRun.restoreBattle(restored.player, restored.run).cooldowns, current.run.battle.cooldowns)
  const legacy = structuredClone(current); legacy.schemaVersion = 4; legacy.player.inventory[0].basePhysical = 3
  const migrated = saves.readSaveData(legacy)
  assert.equal(migrated.schemaVersion, 8)
  assert.deepEqual(migrated.run.battle.cooldowns, current.run.battle.cooldowns)
  assert.equal(migrated.player.inventory[0].basePhysical, player.weaponBaseAttack(1, 'sword'))
  assert.deepEqual(saves.readSaveData(migrated), migrated)
})
