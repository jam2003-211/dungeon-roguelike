import assert from 'node:assert/strict'
import test from 'node:test'
import { loadGameModule as load } from './pwa-fixture.mjs'

const combat = await load('game/combat/combat')
const bosses = await load('game/specialBoss')
const dungeon = await load('game/dungeon')
const player = await load('game/player')
const battle = await load('game/battle')
const loot = await load('game/loot')
const saves = await load('persistence/saveData')
const runs = await load('persistence/savedRun')
const open20 = Array.from({ length: 20 }, () => Array(20).fill('grass'))
const open13 = Array.from({ length: 13 }, () => Array(13).fill('grass'))

function traceNormal(kind, isBoss) {
  const enemy = { ...combat.createEnemy('enemy', kind, 30, { x: 5, y: 5 }, isBoss), discovered: true }
  let state = { position: { x: 5, y: 6 }, turn: 0, playerHp: 100000, playerMaxHp: 100000, enemies: [enemy], finished: false }
  const actions = { attack: 0, prepare: 0, move: 0 }
  for (let turn = 0; turn < 30; turn++) {
    const previous = state
    state = combat.processEnemyTurn(state, open20)
    if (state.playerHp < previous.playerHp) {
      actions.attack++
      assert.equal(combat.getEnemyWarningLevel(previous.enemies[0]), 'red')
    } else if (combat.positionKey(state.enemies[0].position) !== combat.positionKey(previous.enemies[0].position)) actions.move++
    else actions.prepare++
  }
  return { actions, state }
}

test('旧準備時間と30行動の攻撃頻度を復元し、射程内で攻撃後の無駄な移動をしない', () => {
  assert.deepEqual(Object.values(combat.ENEMY_DEFINITIONS).map((enemy) => enemy.preparationTurns), [2, 3, 3, 2, 3, 3])
  const goblin = traceNormal('goblin', false)
  const boar = traceNormal('boar', false)
  assert.deepEqual(goblin.actions, { attack: 10, prepare: 20, move: 0 })
  assert.deepEqual(boar.actions, { attack: 7, prepare: 23, move: 0 })
  const boss = traceNormal('goblin', true)
  assert.deepEqual(boss.actions, goblin.actions)
  assert.equal(boss.state.enemies[0].warning?.pattern, undefined)
  assert.equal(combat.createEnemy('b', 'goblin', 30, { x: 5, y: 5 }, true).maxHp, combat.referenceSpearDamage(30) * 12)
  console.log('30行動 通常敵/通常ボス:', { goblin: goblin.actions, boar: boar.actions, boss: boss.actions })
})

function traceSpecial(theme, enraged) {
  let enemy = combat.createEnemy('boss', 'goblin', 100, { x: 5, y: 2 }, true, theme)
  enemy = { ...enemy, discovered: true, hp: enraged ? Math.floor(enemy.maxHp / 2) : enemy.maxHp }
  let state = { position: { x: 6, y: 7 }, turn: 0, playerHp: 100000, playerMaxHp: 100000, enemies: [enemy], finished: false }
  const counts = Object.fromEntries(bosses.SPECIAL_BOSS_PATTERNS[theme].map((pattern) => [pattern, 0]))
  let simultaneous = 0, combo = 0
  for (let turn = 0; turn < 30; turn++) {
    const warning = state.enemies[0].warning
    const previousHp = state.playerHp
    state = combat.processEnemyTurn(state, open13)
    if (state.playerHp < previousHp) {
      assert.equal(combat.getEnemyWarningLevel({ ...state.enemies[0], warning }), 'red')
      assert.ok(warning.cells.some((cell) => cell.x === state.position.x && cell.y === state.position.y))
      assert.equal(previousHp - state.playerHp, enemy.attack)
    }
    const nextWarning = state.enemies[0].warning
    if (nextWarning && nextWarning !== warning && nextWarning.cells.some((cell) => cell.x === state.position.x && cell.y === state.position.y)) {
      const neighbors = [{ x: 5, y: 7 }, { x: 7, y: 7 }, { x: 6, y: 6 }, { x: 6, y: 8 }]
      assert.ok(neighbors.some((cell) => !nextWarning.cells.some((hazard) => hazard.x === cell.x && hazard.y === cell.y)))
    }
    if ((state.bossEvents ?? []).length > 1) simultaneous++
    if (warning?.fromCombo && (state.bossEvents ?? []).length) combo++
    for (const event of state.bossEvents ?? []) counts[event.pattern]++
  }
  return { counts, simultaneous, combo }
}

test('特殊ボス3体は独立CDで全技・同時技・連続技を予告し、30行動を安全に処理する', () => {
  assert.deepEqual(bosses.SPECIAL_BOSS_INTERVALS, { roots: 3, sweep: 5, surround: 7, slam: 3, cross: 5, charge: 7, flameWave: 3, burst: 5, doubleBurst: 7, release: 8 })
  const results = {}
  for (const theme of ['forest', 'ruins', 'castle']) {
    const normal = traceSpecial(theme, false)
    const enraged = traceSpecial(theme, true)
    assert.ok(Object.values(normal.counts).every((count) => count > 0), theme)
    assert.ok(normal.simultaneous > 0 && normal.combo > 0, theme)
    assert.ok(enraged.simultaneous > 0 && enraged.combo > 0, theme)
    results[theme] = { normal, enraged }
  }
  assert.ok(results.forest.enraged.simultaneous > results.forest.normal.simultaneous)
  assert.ok(results.ruins.enraged.counts.slam > results.ruins.normal.counts.slam)
  assert.ok(results.castle.enraged.combo > results.castle.normal.combo)
  console.log('30行動 特殊ボス:', JSON.stringify(results))
})

test('同時技の重複範囲は1回だけ被弾し、技別CDだけを更新する', () => {
  const enemy = { ...combat.createEnemy('boss', 'goblin', 100, { x: 5, y: 2 }, true, 'forest'), discovered: true, attack: 7, attackIndex: 1 }
  const target = { x: 6, y: 7 }
  const warning = combat.createAttackWarning(enemy, target, open13)
  assert.equal(warning.simultaneous?.length, 2)
  const state = { position: target, turn: 0, playerHp: 100, playerMaxHp: 100, enemies: [{ ...enemy, warning }], finished: false }
  const next = combat.processEnemyTurn(state, open13)
  assert.equal(next.bossEvents.length, 2)
  assert.equal(next.playerHp, warning.cells.some((cell) => cell.x === target.x && cell.y === target.y) ? 93 : 100)
  for (const { pattern } of warning.simultaneous) assert.ok(next.enemies[0].abilityCooldowns[pattern] > 0)
})

test('旧v7の通常ボス戦と特殊ボス戦は保存状態を保持してv8へ移行する', () => {
  for (const level of [30, 100]) {
    let seed = 1
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    const generated = dungeon.createDungeon(level, 'forest', random)
    const floor = generated.floors.at(-1)
    const stock = { ...dungeon.createDungeonStocks()[0], dungeon: generated, highestFloor: generated.totalFloors, totalFloorsKnown: true }
    const hero = { ...player.createPlayerState(), level }
    hero.currentHp = player.calculateStats(hero).maxHp
    const enemies = dungeon.instantiateEnemies(floor)
    const boss = enemies.find((candidate) => candidate.isBoss)
    const current = { ...boss, discovered: true, attackIndex: level === 30 ? 1 : 0 }
    if (level === 30) {
      const target = { x: 6, y: 7 }
      current.warning = { remaining: 1, cells: Array.from({ length: 9 }, (_, index) => ({ x: target.x + index % 3 - 1, y: target.y + Math.floor(index / 3) - 1 })).filter((cell) => floor.map[cell.y]?.[cell.x] === 'grass' || floor.map[cell.y]?.[cell.x] === 'path'), direction: 'down', target, pattern: 'ground' }
    } else current.warning = combat.createAttackWarning(current, floor.start, floor.map)
    const active = { ...battle.createBattleState(hero, enemies.map((enemy) => enemy.id === boss.id ? current : enemy), floor.start), loot: loot.createLootState(generated, () => 0) }
    const saved = saves.createSaveData(hero, [stock, ...dungeon.createDungeonStocks().slice(1)], new Date(), runs.captureRun(1, generated.totalFloors, active, level))
    const legacy = structuredClone(saved)
    legacy.schemaVersion = 7
    const legacyBoss = legacy.run.battle.combat.enemies.find((enemy) => enemy.id === boss.id)
    delete legacyBoss.abilityCooldowns
    delete legacyBoss.comboQueue
    if (level === 100) delete legacyBoss.warning.scheduled
    const restored = saves.readSaveData(legacy)
    assert.equal(restored.schemaVersion, 8)
    assert.deepEqual(restored.run.battle.combat.enemies.find((enemy) => enemy.id === boss.id).warning, legacyBoss.warning)
    if (level === 100) {
      const advancing = structuredClone(saved)
      const activeBoss = advancing.run.battle.combat.enemies.find((enemy) => enemy.id === boss.id)
      activeBoss.warning = null
      activeBoss.abilityCooldowns = { roots: 2, sweep: 0, surround: 4 }
      activeBoss.comboQueue = ['sweep']
      const resumed = saves.readSaveData(advancing)
      assert.deepEqual(resumed.run.battle.combat.enemies.find((enemy) => enemy.id === boss.id).abilityCooldowns, activeBoss.abilityCooldowns)
      assert.deepEqual(resumed.run.battle.combat.enemies.find((enemy) => enemy.id === boss.id).comboQueue, activeBoss.comboQueue)
      assert.deepEqual(combat.processEnemyTurn(resumed.run.battle.combat, floor.map), combat.processEnemyTurn(advancing.run.battle.combat, floor.map))
    }
  }
})
