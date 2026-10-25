import assert from 'node:assert/strict'
import test from 'node:test'
import { loadGameModule as load, pwaFixture } from './pwa-fixture.mjs'

const player = await load('game/player')
const inventory = await load('game/inventoryView')
const dungeon = await load('game/dungeon')
const battle = await load('game/battle')
const loot = await load('game/loot')
const savedRun = await load('persistence/savedRun')
const saves = await load('persistence/saveData')

function simulatedClear(start, enemyLevel, previous = false) {
  let level = start; let experience = 0
  const threshold = (value) => previous ? 100 + 25 * (value - 1) : player.experienceToNext(value)
  for (let index = 0; index < 72; index += 1) {
    const boss = index === 71
    experience += previous ? player.enemyExperience(enemyLevel, boss) : player.enemyExperience(enemyLevel, boss, level)
    while (experience >= threshold(level)) { experience -= threshold(level); level += 1 }
  }
  return { level, experience }
}

test('同レベルの10階相当討伐は序盤から高Lvまで緩やかに変化し、格上経験値に上限がある', () => {
  assert.equal(player.experienceToNext(1), 100)
  assert.equal(player.experienceToNext(5), 200)
  for (const level of [10, 20, 30, 50]) assert.ok(player.experienceToNext(level) > 100 + 25 * (level - 1))
  const results = [1, 5, 10, 20, 30, 50].map((level) => [level, simulatedClear(level, level), simulatedClear(level, level, true)])
  assert.ok(results[0][1].level >= 5)
  assert.ok(results[2][1].level - 10 <= 2)
  assert.ok(results[3][1].level - 20 <= 2)
  assert.ok(results[4][1].level - 30 <= 1)
  assert.ok(results[5][1].level - 50 <= 1)
  assert.ok(results.every(([, current, old]) => current.level <= old.level))
  assert.equal(player.enemyExperience(1000000, false, 1), player.enemyExperience(6, false))
  assert.ok(simulatedClear(1, 1000000).level <= 10)
})

test('適正Lv装備の交換は基礎成長を数レベル分補い、初期装備は無効果の通常名称', () => {
  const fresh = player.createPlayerState()
  assert.deepEqual(fresh.inventory.map((item) => item.name), ['剣', '軽鎧'])
  assert.ok(fresh.inventory.every((item) => item.skills.length === 0 && item.specialEffect === null))
  const stronger = { ...fresh.inventory[0], id: 'level-50-spear', name: '槍', subtype: 'spear', level: 50, basePhysical: player.weaponBaseAttack(50, 'spear') }
  const current = { ...fresh, level: 50 }
  const changed = player.equipItem({ ...current, inventory: [...current.inventory, stronger] }, stronger.id)
  assert.ok(player.calculateStats(changed).physical - player.calculateStats(current).physical >= 35)
})

test('装備種類・Lv・スキル・効果・お気に入りを組み合わせ、全並び替えを安定に処理する', () => {
  const fresh = player.createPlayerState()
  const source = fresh.inventory[0]
  const items = [
    { ...source, id: 'a', name: '毒の剣', level: 50, skills: ['guard'], skillLevels: { guard: 3 }, specialEffect: 'poison', specialEffectLevel: 5, favorite: true },
    { ...source, id: 'b', name: '剣', level: 10, skills: [], skillLevels: {}, specialEffect: null, specialEffectLevel: null },
    { ...source, id: 'c', name: '守護の剣', level: 30, skills: ['guard'], skillLevels: { guard: 5 }, specialEffect: 'poison', specialEffectLevel: 2 },
  ]
  const state = { ...fresh, inventory: [...fresh.inventory, ...items] }
  const filter = { category: 'weapon', query: '', subtype: 'sword', minLevel: 20, maxLevel: 50, hasSkill: true, hasEffect: true, skill: 'guard', effect: 'poison', favoritesOnly: false, sort: 'skillLevel' }
  assert.deepEqual(inventory.filterInventory(state, filter).map((item) => item.id), ['c', 'a'])
  assert.deepEqual(inventory.filterInventory(state, { ...filter, favoritesOnly: true }).map((item) => item.id), ['a'])
  assert.deepEqual(inventory.filterInventory(state, { ...filter, sort: 'effectLevel' }).map((item) => item.id), ['a', 'c'])
  assert.deepEqual(inventory.filterInventory(state, { ...filter, sort: 'newest' }).map((item) => item.id), ['c', 'a'])
  for (const sort of ['levelDesc', 'levelAsc', 'statsDesc', 'statsAsc', 'oldest', 'name']) assert.equal(inventory.filterInventory(state, { ...filter, sort }).length, 2)
})

test('旧初期装備の安全な表示名移行は性能・ID・付与効果を変更しない', async () => {
  const old = await pwaFixture()
  old.player.inventory.find((item) => item.id === 'initial-sword').name = '初心者用の剣'
  old.player.inventory.find((item) => item.id === 'initial-armor').name = '初期軽鎧'
  const loaded = saves.readSaveData(old)
  assert.deepEqual(loaded.player.inventory.slice(0, 2).map((item) => item.name), ['剣', '軽鎧'])
  assert.equal(old.player.inventory[0].name, '初心者用の剣')
  assert.deepEqual(player.calculateStats(loaded.player), player.calculateStats(old.player))
  assert.deepEqual(loaded.player.equipment, old.player.equipment)
  const effectful = structuredClone(old)
  effectful.player.inventory[0].specialEffect = 'poison'; effectful.player.inventory[0].specialEffectLevel = 1
  assert.equal(saves.readSaveData(effectful).player.inventory[0].name, '初心者用の剣')
})

test('旧11～15階ダンジョンと12階探索の保存を構成変更せず再開できる', async () => {
  let first = true, seed = 42
  const random = () => { if (first) { first = false; return .95 } seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const generated = dungeon.createDungeon(1, 'forest', random)
  assert.equal(generated.totalFloors, 10)
  const copyFloor = (source, number) => ({ ...structuredClone(source), floor: number, enemies: source.enemies.map((enemy, index) => ({ ...structuredClone(enemy), id: `f${number}-${enemy.isBoss ? 'boss' : `enemy-${index + 1}`}` })) })
  const legacy = { ...generated, totalFloors: 15, floors: [...generated.floors.slice(0, 9), ...Array.from({ length: 5 }, (_, index) => copyFloor(generated.floors[8], index + 10)), copyFloor(generated.floors[9], 15)] }
  assert.equal(dungeon.validateDungeon(legacy), true)
  const data = await pwaFixture()
  data.stocks[0] = { ...data.stocks[0], dungeon: legacy, highestFloor: 12, totalFloorsKnown: true }
  const currentFloor = legacy.floors[11]
  const active = battle.createBattleState(data.player, dungeon.instantiateEnemies(currentFloor), currentFloor.start)
  active.loot = loot.createLootState(legacy, () => .2)
  data.run = savedRun.captureRun(1, 12, active, data.player.level)
  const restored = saves.readSaveData(data)
  assert.equal(restored.stocks[0].dungeon.totalFloors, 15)
  assert.equal(restored.run.floor, 12)
  assert.deepEqual(restored.run.battle.combat.enemies, data.run.battle.combat.enemies)
})
