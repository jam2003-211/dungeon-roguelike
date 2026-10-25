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
  cache.set(path, url)
  return url
}
const load = (path) => import(moduleUrl(fileURLToPath(new URL('../src/' + path + '.ts', import.meta.url))))
const player = await load('game/player')
const combat = await load('game/combat/combat')
const battle = await load('game/battle')
const loot = await load('game/loot')
const dungeon = await load('game/dungeon')
const saves = await load('persistence/saveData')
const runs = await load('persistence/savedRun')
const types = ['sword', 'spear', 'bow', 'shortStaff', 'longStaff']
const offsets = [2, 0, -2, -2, -5]
const levels = [1, 5, 10, 20, 30, 50, 75, 100]
const openMap = Array.from({ length: 20 }, () => Array(20).fill('grass'))

function equipped(level, type, multiplier = 1) {
  const initial = player.createPlayerState()
  const weapon = { ...initial.inventory[0], id: 'reference-weapon', subtype: type, level, statMultiplier: multiplier,
    basePhysical: type === 'shortStaff' || type === 'longStaff' ? 0 : player.weaponBaseAttack(level, type),
    baseMagic: type === 'shortStaff' || type === 'longStaff' ? player.weaponBaseAttack(level, type) : 0 }
  return { ...initial, level, inventory: [...initial.inventory, weapon], equipment: { ...initial.equipment, weapon: weapon.id } }
}

function actualDamage(character, kind = 'goblin', enemyLevel = character.level) {
  const enemy = combat.createEnemy('reference-enemy', kind, enemyLevel, { x: 11, y: 10 })
  // HPを高くして実際の攻撃処理で減った量を直接測る。
  enemy.hp = enemy.maxHp = 100000000
  const state = battle.createBattleState(character, [enemy], { x: 10, y: 10 })
  const next = battle.attackWithWeapon(state, enemy.position, openMap, () => 1)
  assert.equal(next.combat.turn, state.combat.turn + 1)
  return enemy.hp - next.combat.enemies[0].hp
}

function survivesHit(character, enemyLevel) {
  const enemy = combat.createEnemy('normal-enemy', 'goblin', enemyLevel, { x: 11, y: 10 })
  const state = battle.createBattleState(character, [enemy], { x: 10, y: 10 })
  return battle.attackWithWeapon(state, enemy.position, openMap, () => 1).combat.enemies.length > 0
}

test('五武器の実ダメージは標準敵の目標HP以上で、基礎値はLvとともに減らない', () => {
  for (const type of types) {
    let previous = -1
    for (let level = 1; level <= 100; level += 1) {
      const base = player.weaponBaseAttack(level, type)
      assert.ok(base >= previous, `${type} Lv${level}`)
      previous = base
      if (!levels.includes(level)) continue
      const targetLevel = Math.max(1, level + offsets[types.indexOf(type)])
      const damage = actualDamage(equipped(level, type))
      assert.ok(damage >= combat.normalEnemyHp('goblin', targetLevel), `${type} Lv${level}: ${damage}`)
      assert.equal(survivesHit(equipped(level, type), targetLevel), false)
      if (damage < combat.normalEnemyHp('goblin', targetLevel + 1)) assert.equal(survivesHit(equipped(level, type), targetLevel + 1), true)
      const bonus = player.itemBonuses(equipped(level, type).inventory.at(-1))
      assert.equal(type.endsWith('Staff') ? bonus.magic : bonus.physical, Math.floor(base * (1 + .1 * (level - 1))))
    }
  }
})

test('能力値倍率は一度だけ適用され、職業と敵種・ボスにも通常の戦闘式を適用する', () => {
  const base = actualDamage(equipped(50, 'sword'))
  for (const multiplier of [1.25, 1.5, 2]) {
    const character = equipped(50, 'sword', multiplier)
    const expected = Math.floor(player.baseStats(50).physical * player.JOBS.unemployed.physical) + Math.floor(player.weaponBaseAttack(50, 'sword') * 5.9 * multiplier)
    assert.equal(actualDamage(character), expected)
    assert.ok(expected > base)
  }
  const sword = equipped(50, 'sword')
  assert.equal(actualDamage({ ...sword, job: 'warrior' }), Math.floor(player.baseStats(50).physical * player.JOBS.warrior.physical) + player.itemBonuses(sword.inventory.at(-1)).physical)
  assert.ok(combat.createEnemy('a', 'cyclopsBat', 50, { x: 11, y: 10 }).maxHp < combat.normalEnemyHp('goblin', 50))
  assert.ok(combat.createEnemy('b', 'stoneGolem', 50, { x: 11, y: 10 }).maxHp > combat.normalEnemyHp('goblin', 50))
  assert.equal(combat.createEnemy('c', 'goblin', 50, { x: 11, y: 10 }, true).maxHp, 3 * combat.normalEnemyHp('goblin', 50))
  assert.equal(actualDamage(equipped(50, 'shortStaff')), actualDamage(equipped(50, 'bow')))
  const olderWeapon = equipped(30, 'sword')
  assert.equal(actualDamage({ ...olderWeapon, level: 50 }), Math.floor(player.baseStats(50).physical * player.JOBS.unemployed.physical) + player.itemBonuses(olderWeapon.inventory.at(-1)).physical)
})

test('新規生成武器と初期剣の基礎値を更新し、倍率と効果抽選を維持する', () => {
  assert.equal(player.createPlayerState().inventory[0].basePhysical, player.weaponBaseAttack(1, 'sword'))
  assert.deepEqual(player.createPlayerState().inventory[0].skills, [])
  for (const [index, type] of types.entries()) {
    let roll = 0
    const sequence = [0, .9, .5, .5, (index + .1) / 5, .1, .5, .2]
    const item = loot.generateEquipment({ level: 30, featuredCategory: 'weapon' }, () => sequence[roll++] ?? .2, () => `${type}-id`)
    assert.equal(item.subtype, type)
    assert.equal(item.level, 30)
    assert.equal(item.statMultiplier, 1.5)
    assert.equal(item.basePhysical || item.baseMagic, player.weaponBaseAttack(30, type))
    assert.ok(item.specialEffect)
    assert.ok(item.specialEffectLevel >= 1)
  }
})

test('武器の上昇分は既存の攻撃スキル倍率に一度だけ反映する', () => {
  for (const [type, skillId, stat] of [['sword', 'strongStrike', 'physical'], ['longStaff', 'magicBolt', 'magic']]) {
    const character = equipped(50, type)
    character.inventory[1] = { ...character.inventory[1], skills: [skillId], skillLevels: { [skillId]: 1 } }
    const enemy = combat.createEnemy('skill-target', 'goblin', 50, { x: 11, y: 10 })
    enemy.hp = enemy.maxHp = 100000000
    const state = battle.createBattleState(character, [enemy], { x: 10, y: 10 })
    const next = battle.useSkill(state, skillId, enemy.position, openMap)
    assert.equal(enemy.hp - next.combat.enemies[0].hp, Math.floor(player.calculateStats(character)[stat] * 2))
  }
})

test('旧v4の所持・装備・未鑑定・探索報酬を一回だけ移行する', () => {
  const generated = dungeon.createDungeon(30, 'forest', () => .25)
  const stocks = dungeon.replaceDungeonStock(dungeon.createDungeonStocks(), 1, generated)
  stocks[0].highestFloor = 1
  const initial = player.createPlayerState()
  const oldWeapon = { ...initial.inventory[0], id: 'old-weapon', level: 30, statMultiplier: 1.5, basePhysical: 3, favorite: true, specialEffect: 'poison', specialEffectLevel: 4 }
  const hidden = { ...oldWeapon, id: 'hidden-weapon', subtype: 'longStaff', basePhysical: 0, baseMagic: 10, specialEffect: 'burn', specialEffectLevel: 5 }
  const treasure = { id: hidden.id, level: hidden.level, item: hidden }
  const character = { ...initial, level: 30, inventory: [...initial.inventory, oldWeapon], equipment: { ...initial.equipment, weapon: oldWeapon.id }, treasures: [treasure] }
  const floor = generated.floors[0]
  const state = battle.createBattleState(character, dungeon.instantiateEnemies(floor), floor.start)
  state.loot = { chests: [], items: [structuredClone(treasure)], resolvedEnemyIds: [], notices: [] }
  const current = saves.createSaveData(character, stocks, new Date('2026-10-25T00:00:00Z'), runs.captureRun(1, 1, state))
  const old = structuredClone(current)
  old.schemaVersion = 4
  old.player.inventory.find((item) => item.id === 'old-weapon').basePhysical = 3
  old.player.inventory.find((item) => item.id === 'initial-sword').basePhysical = 3
  old.player.treasures[0].item.baseMagic = 10
  old.run.battle.loot.items[0].item.baseMagic = 10
  const unchanged = structuredClone(old)
  const restored = saves.readSaveData(old)
  assert.deepEqual(old, unchanged)
  assert.equal(restored.schemaVersion, 5)
  assert.equal(restored.player.inventory.find((item) => item.id === 'old-weapon').basePhysical, player.weaponBaseAttack(30, 'sword'))
  assert.equal(restored.player.inventory.find((item) => item.id === 'old-weapon').statMultiplier, 1.5)
  assert.equal(restored.player.inventory.find((item) => item.id === 'old-weapon').favorite, true)
  assert.equal(restored.player.equipment.weapon, 'old-weapon')
  assert.equal(restored.player.treasures[0].item.baseMagic, player.weaponBaseAttack(30, 'longStaff'))
  assert.deepEqual(restored.run.battle.loot.items[0], restored.player.treasures[0])
  assert.deepEqual(saves.readSaveData(restored), restored)
})
