import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

const cache = new Map()
function moduleUrl(path) {
  if (cache.has(path)) return cache.get(path)
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from '([^']+)'/g, (match, dependency) => dependency.startsWith('.') ? `from '${moduleUrl(resolve(dirname(path), dependency + '.ts'))}'` : match)
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
  cache.set(path, url); return url
}
const load = (path) => import(moduleUrl(fileURLToPath(new URL('../src/' + path + '.ts', import.meta.url))))
const player = await load('game/player'); const battle = await load('game/battle'); const combat = await load('game/combat/combat')
const loot = await load('game/loot'); const levels = await load('game/effectLevels'); const skills = await load('game/skills')
const auto = await load('game/autoCombat')
const map = Array.from({ length: 20 }, () => Array(20).fill('grass'))
const point = { x: 10, y: 10 }
const target = { x: 11, y: 10 }
function enemy() { return { ...combat.createEnemy('level-target', 'goblin', 1, target), hp: 1000, maxHp: 1000, attack: 0, statuses: { poison: 0, burn: 0, slow: 0, stun: 1 } } }
function skillState(id, level) {
  const base = player.createPlayerState()
  const gear = { ...base.inventory[1], id: 'level-gear', skills: [id], skillLevels: { [id]: level } }
  const owner = { ...base, inventory: [...base.inventory, gear], equipment: { ...base.equipment, armor: gear.id }, currentHp: 30 }
  return battle.createBattleState(owner, [enemy()], point)
}
function effectState(id, level) {
  const base = player.createPlayerState()
  const weapon = { ...base.inventory[0], id: 'effect-weapon', specialEffect: id, specialEffectLevel: level, effectRate: .75 }
  const owner = { ...base, inventory: [...base.inventory, weapon], equipment: { ...base.equipment, weapon: weapon.id }, currentHp: 30 }
  return battle.createBattleState(owner, [enemy()], point)
}

test('効果Lvの境界は50/25/15/8/2で、装備Lvと独立する', () => {
  for (const [value, expected] of [[0, 1], [.49999, 1], [.5, 2], [.74999, 2], [.75, 3], [.89999, 3], [.9, 4], [.97999, 4], [.98, 5], [.99999, 5]]) {
    assert.equal(levels.rollEffectLevel(() => value), expected)
  }
  const sequence = (values) => { let index = 0; return () => values[index++] ?? .2 }
  const low = loot.generateEquipment({ level: 1, featuredCategory: 'weapon' }, sequence([0, 0, 0, 0, 0, 0, .99, .2]), () => 'low-level-high-effect')
  assert.equal(low.specialEffectLevel, 5); assert.equal(low.level, 1); assert.equal('rarity' in low, false)
  const armor = loot.generateEquipment({ level: 1, featuredCategory: 'armor' }, sequence([0, .2, .5, .5, .25, 0, 0, 0, 0, .5, .98, .2]), () => 'independent-skills')
  assert.equal(armor.skills.length, 3); assert.deepEqual(Object.values(armor.skillLevels), [1, 2, 5])
  assert.equal(armor.level, 1)
})

test('12スキルは各Lvを保持し、自動発動の重複スキルは最高Lvを使う', () => {
  assert.equal(Object.keys(skills.SKILLS).length, 12)
  for (const id of Object.keys(skills.SKILLS)) for (const level of [1, 2, 3, 4, 5]) {
    const state = skillState(id, level)
    assert.equal(player.availableSkillLevel(state.player, id), level)
    assert.equal(player.availableSkillPower(state.player, id), levels.LEVEL_MULTIPLIERS[level - 1])
  }
  for (const id of ['strongStrike', 'magicBolt', 'piercingShot', 'shockwave', 'flame', 'poisonStrike', 'stunStrike']) {
    const invoke = (level) => battle.useSkill(skillState(id, level), id, id === 'shockwave' ? undefined : target, map)
    const first = invoke(1); const last = invoke(5)
    assert.ok(first.combat.enemies[0].hp > last.combat.enemies[0].hp, id)
    assert.equal(first.combat.turn, 1); assert.equal(last.combat.turn, 1)
  }
  for (const id of ['smallHeal', 'largeHeal']) {
    const first = battle.useSkill(skillState(id, 1), id, undefined, map)
    const last = battle.useSkill(skillState(id, 5), id, undefined, map)
    assert.ok(last.player.currentHp > first.player.currentHp, id)
    assert.ok(last.player.currentHp <= player.calculateStats(last.player).maxHp)
  }
  for (const id of ['poisonStrike', 'slowSpell']) {
    const first = battle.useSkill(skillState(id, 1), id, target, map)
    const last = battle.useSkill(skillState(id, 5), id, target, map)
    const status = id === 'poisonStrike' ? 'poison' : 'slow'
    assert.ok(last.combat.enemies[0].statuses[status] > first.combat.enemies[0].statuses[status], id)
  }
  const dashState1 = skillState('dash', 1); dashState1.combat.enemies = []
  const dashState5 = skillState('dash', 5); dashState5.combat.enemies = []
  const dash1 = battle.useSkill(dashState1, 'dash', { x: 13, y: 10 }, map)
  const dash5 = battle.useSkill(dashState5, 'dash', { x: 15, y: 10 }, map)
  assert.equal(dash1.combat.position.x, 13); assert.equal(dash5.combat.position.x, 15)
  for (const level of [1, 2, 3, 4, 5]) {
    const state = skillState('guard', level)
    state.combat.enemies[0].attack = 20
    state.combat.enemies[0].statuses.stun = 0
    state.combat.enemies[0].warning = { remaining: 1, cells: [point], direction: 'left', target: point }
    const guarded = battle.useSkill(state, 'guard', undefined, map)
    assert.equal(guarded.player.currentHp, 30 - Math.floor(20 * (1 - levels.GUARD_REDUCTION[level - 1])))
  }
  const duplicate = skillState('strongStrike', 5)
  const charm = { ...duplicate.player.inventory[0], id: 'weak-charm', category: 'accessory', subtype: 'commonAccessory', skills: ['strongStrike'], skillLevels: { strongStrike: 1 } }
  duplicate.player = { ...duplicate.player, inventory: [...duplicate.player.inventory, charm], equipment: { ...duplicate.player.equipment, accessory1: charm.id } }
  const automatic = auto.performAutoAttack(duplicate, map)
  assert.equal(automatic.actionNotice.label, '強撃 Lv.5'); assert.equal(automatic.combat.turn, 1)
})

test('8特殊効果はLv1からLv5で強まり、気絶は1行動・ノックバックは衝突を守る', () => {
  const ids = Object.keys(levels.EFFECT_LABELS); assert.equal(ids.length, 8)
  for (const id of ids) for (const level of [1, 2, 3, 4, 5]) {
    const state = effectState(id, level)
    const hit = battle.attackWithWeapon(state, target, map, () => 0)
    assert.equal(hit.combat.turn, 1)
    assert.ok(hit.combat.enemies[0].hp <= 1000)
    assert.ok(hit.player.currentHp <= player.calculateStats(hit.player).maxHp)
  }
  for (const [id, status] of [['poison', 'poison'], ['burn', 'burn'], ['slow', 'slow']]) {
    const first = battle.attackWithWeapon(effectState(id, 1), target, map, () => 0)
    const last = battle.attackWithWeapon(effectState(id, 5), target, map, () => 0)
    assert.ok(last.combat.enemies[0].statuses[status] > first.combat.enemies[0].statuses[status], id)
  }
  for (const id of ['critical', 'extraAttack', 'stun']) {
    const first = battle.attackWithWeapon(effectState(id, 1), target, map, () => 0)
    const last = battle.attackWithWeapon(effectState(id, 5), target, map, () => 0)
    assert.ok(last.combat.enemies[0].hp < first.combat.enemies[0].hp, id)
    if (id === 'stun') assert.equal(last.combat.enemies[0].statuses.stun, 0)
  }
  const firstStun = battle.attackWithWeapon(effectState('stun', 5), target, map, () => 0)
  assert.equal(firstStun.combat.enemies[0].statuses.stunRecovery, 1)
  const secondStun = battle.attackWithWeapon(firstStun, target, map, () => 0)
  assert.equal(secondStun.combat.enemies[0].statuses.stun, 0)
  assert.equal(secondStun.combat.enemies[0].statuses.stunRecovery, 0)
  assert.ok(secondStun.combat.enemies[0].warning, '連続気絶で敵行動が永久に止まらない')
  const drain1 = battle.attackWithWeapon(effectState('lifesteal', 1), target, map, () => 0)
  const drain5 = battle.attackWithWeapon(effectState('lifesteal', 5), target, map, () => 0)
  assert.ok(drain5.player.currentHp > drain1.player.currentHp)
  const push1 = battle.attackWithWeapon(effectState('knockback', 1), target, map, () => 0)
  const push5 = battle.attackWithWeapon(effectState('knockback', 5), target, map, () => 0)
  assert.equal(push1.combat.enemies[0].position.x, 14); assert.equal(push5.combat.enemies[0].position.x, 16)
})

test('装備名は代表スキルを優先し、なければ実際の特殊効果から生成する', () => {
  const armor = loot.generateEquipment({ level: 10, featuredCategory: 'armor' }, () => .2)
  const first = Object.keys(levels.SKILL_PREFIXES).find((id) => armor.skills.includes(id))
  assert.equal(armor.name, `${levels.SKILL_PREFIXES[first]}の${player.SUBTYPE_LABELS[armor.subtype]}`)
  const weapon = loot.generateEquipment({ level: 10, featuredCategory: 'weapon' }, () => .2)
  assert.equal(weapon.name, `${levels.EFFECT_PREFIXES[weapon.specialEffect]}の${player.SUBTYPE_LABELS[weapon.subtype]}`)
  assert.equal(weapon.name.includes('Lv.'), false)
})
