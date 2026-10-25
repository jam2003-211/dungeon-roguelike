import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadGameModule as load } from './pwa-fixture.mjs'

const dungeon = await load('game/dungeon')
const combat = await load('game/combat/combat')
const player = await load('game/player')
const battle = await load('game/battle')
const loot = await load('game/loot')
const auto = await load('game/autoCombat')
const plans = await load('game/specialBoss')
const saves = await load('persistence/saveData')
const runs = await load('persistence/savedRun')

function seeded(levels, seed = 17) {
  let first = true
  return () => { if (first) { first = false; return (levels - .5) / 10 } seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
}
function character(level, type = 'spear', multiplier = 1) {
  const original = player.createPlayerState()
  const weapon = { ...original.inventory[0], subtype: type, level, statMultiplier: multiplier,
    basePhysical: type === 'shortStaff' || type === 'longStaff' ? 0 : player.weaponBaseAttack(level, type),
    baseMagic: type === 'shortStaff' || type === 'longStaff' ? player.weaponBaseAttack(level, type) : 0 }
  const next = { ...original, level, inventory: [weapon, original.inventory[1]], currentHp: 0 }
  return { ...next, currentHp: player.calculateStats(next).maxHp }
}
const open13 = Array.from({ length: 13 }, () => Array(13).fill('grass'))

test('Lv90は通常最終階、Lv91以上は各テーマ固有の13×13専用階になる', () => {
  for (const theme of ['forest', 'ruins', 'castle']) for (const level of [90, 91, 100]) {
    const generated = dungeon.createDungeon(level, theme, seeded(3))
    assert.equal(generated.totalFloors, 3)
    assert.equal(generated.floors[0].map.length, 20)
    const final = generated.floors.at(-1)
    assert.equal(final.specialArena === true, level >= 91)
    assert.equal(final.map.length, level >= 91 ? 13 : 20)
    if (level >= 91) {
      assert.equal(final.map.flat().every((tile) => tile === final.map[0][0]), true)
      assert.equal(final.enemies.length, 1)
      assert.equal(final.enemies[0].specialBoss, theme)
      assert.equal(final.enemies[0].isBoss, true)
      assert.equal(dungeon.reachableDistances(final.map, final.start).size, 169)
      assert.ok(plans.distanceToBoss(final.start, final.enemies[0].position, true) >= 7)
    }
    assert.equal(dungeon.validateDungeon(generated), true)
  }
  assert.equal(dungeon.createDungeon(91, 'forest', seeded(10)).totalFloors, 10)
})

test('通常ボスは槍12回、特殊ボスは槍30回の実戦ダメージに対応する', () => {
  for (const level of [1, 10, 30, 50, 90]) {
    const enemy = combat.createEnemy('boss', 'goblin', level, { x: 11, y: 10 }, true)
    const state = battle.createBattleState(character(level), [enemy], { x: 10, y: 10 })
    const hit = battle.attackWithWeapon(state, { x: 11, y: 10 }, Array.from({ length: 20 }, () => Array(20).fill('grass')))
    assert.equal(enemy.maxHp / (enemy.hp - hit.combat.enemies[0].hp), 12)
  }
  for (const level of [91, 100, 150]) {
    const enemy = combat.createEnemy('boss', 'goblin', level, { x: 5, y: 2 }, true, 'forest')
    const state = battle.createBattleState(character(level), [enemy], { x: 5, y: 5 })
    const hit = battle.attackWithWeapon(state, { x: 5, y: 3 }, open13)
    assert.equal(enemy.maxHp / (enemy.hp - hit.combat.enemies[0].hp), 30)
  }
})

test('2×2の全マスが1体への攻撃対象で、範囲攻撃は多重命中せず通行不可', () => {
  const enemy = combat.createEnemy('boss', 'goblin', 100, { x: 5, y: 2 }, true, 'forest')
  for (const part of plans.bossCells(enemy.position, true)) {
    assert.equal(plans.occupiesBoss(enemy.position, part, true), true)
  }
  const hero = character(100, 'shortStaff')
  const state = battle.createBattleState(hero, [enemy], { x: 4, y: 3 })
  const target = auto.chooseAutoAction(state, open13)
  assert.ok(target && plans.occupiesBoss(enemy.position, target.target, true))
  const hit = battle.attackWithWeapon(state, { x: 5, y: 3 }, open13)
  assert.equal(enemy.hp - hit.combat.enemies[0].hp, player.calculateStats(hero).magic)
  assert.equal(battle.moveBattlePlayer(state, 'right', open13), state)
  const edge = battle.createBattleState(hero, [], { x: 0, y: 0 })
  assert.equal(battle.moveBattlePlayer(edge, 'left', open13), edge)
})

test('特殊ボスの各技は固定予告範囲を実攻撃に使用し、個別CDを開始する', () => {
  for (const theme of ['forest', 'ruins', 'castle']) {
    for (const pattern of plans.SPECIAL_BOSS_PATTERNS[theme]) {
      const enemy = { ...combat.createEnemy('boss', 'goblin', 100, { x: 5, y: 2 }, true, theme), attack: 7, discovered: true,
        abilityCooldowns: Object.fromEntries(plans.SPECIAL_BOSS_PATTERNS[theme].map((id) => [id, id === pattern ? 0 : 2])) }
      const target = { x: 6, y: 7 }
      const warning = combat.createAttackWarning(enemy, target, open13)
      assert.equal(warning.pattern, pattern)
      assert.equal(warning.scheduled, true)
      const result = combat.processEnemyTurn({ position: target, turn: 1, playerHp: 100, playerMaxHp: 100, enemies: [{ ...enemy, warning }], finished: false }, open13)
      assert.equal(result.playerHp, warning.cells.some((cell) => cell.x === target.x && cell.y === target.y) ? 93 : 100)
      assert.equal(result.bossEvents?.[0]?.pattern, pattern)
      if (warning.followUpCells) {
        assert.deepEqual(result.enemies[0].warning.cells, warning.followUpCells)
      } else {
        assert.equal(result.enemies[0].abilityCooldowns[pattern], plans.SPECIAL_BOSS_INTERVALS[pattern] - 1)
      }
      assert.ok(warning.cells.length < 169)
    }
    const fresh = combat.createEnemy('boss', 'goblin', 100, { x: 5, y: 2 }, true, theme)
    const enraged = { ...fresh, hp: Math.floor(fresh.maxHp / 2) }
    const before = combat.createAttackWarning(fresh, { x: 6, y: 7 }, open13)
    const after = combat.createAttackWarning(enraged, { x: 6, y: 7 }, open13)
    assert.equal(before.remaining, 1)
    assert.equal(after.remaining, 1)
    assert.ok(after.cells.length >= before.cells.length)
  }
})

test('通常ボスは1×1で元モンスターと同じ範囲・準備時間・移動AIを使う', () => {
  const map = Array.from({ length: 20 }, () => Array(20).fill('grass'))
  const target = { x: 10, y: 11 }
  for (const kind of Object.keys(combat.ENEMY_DEFINITIONS)) {
    const normal = { ...combat.createEnemy('normal', kind, 30, { x: 10, y: 10 }), discovered: true }
    const boss = { ...combat.createEnemy('boss', kind, 30, { x: 10, y: 10 }, true), discovered: true }
    assert.deepEqual(combat.createAttackWarning(boss, target, map)?.cells, combat.createAttackWarning(normal, target, map)?.cells)
    assert.equal(combat.createAttackWarning(boss, target, map)?.remaining, combat.ENEMY_DEFINITIONS[kind].preparationTurns)
    assert.equal(combat.createAttackWarning(boss, target, map)?.pattern, undefined)
    let normalState = { position: target, turn: 0, playerHp: 100000, playerMaxHp: 100000, enemies: [normal], finished: false }
    let bossState = { ...normalState, enemies: [boss] }
    for (let turn = 0; turn < 12; turn++) {
      normalState = combat.processEnemyTurn(normalState, map)
      bossState = combat.processEnemyTurn(bossState, map)
      assert.deepEqual(bossState.enemies[0].position, normalState.enemies[0].position)
      assert.deepEqual(bossState.enemies[0].warning, normalState.enemies[0].warning)
    }
    assert.ok(boss.attack > normal.attack)
  }
})

test('ガーディアンは近接高威力、魔王は中間、トレントは広範囲基準の攻撃力', () => {
  const anchor = { x: 5, y: 2 }
  const attack = (theme) => combat.createEnemy('boss', 'goblin', 100, anchor, true, theme).attack
  assert.ok(attack('ruins') > attack('castle'))
  assert.ok(attack('castle') > attack('forest'))
  assert.equal(attack('forest'), combat.createEnemy('normal', 'goblin', 100, anchor, true).attack)
})

test('特殊ボスの予告には徒歩1マスで避けられる通行可能な隣接マスが残る', () => {
  const anchor = { x: 5, y: 2 }, target = { x: 6, y: 4 }
  for (const [theme, count] of [['forest', 3], ['ruins', 3], ['castle', 4]]) for (let index = 0; index < count; index++) for (const enraged of [false, true]) {
    const plan = plans.specialBossPlan(theme, anchor, target, open13, index, enraged)
    if (!plan.cells.some((cell) => cell.x === target.x && cell.y === target.y)) continue
    const neighbors = [{ x: 5, y: 4 }, { x: 7, y: 4 }, { x: 6, y: 5 }, { x: 6, y: 3 }]
    assert.ok(neighbors.some((cell) => !plans.occupiesBoss(anchor, cell, true) && !plan.cells.some((danger) => danger.x === cell.x && danger.y === cell.y)), `${theme}/${plan.pattern}/${enraged}`)
  }
})

test('特殊ボス撃破で3箱と恒久記録を一度だけ作り、拾った内容を再抽選せず保存・再開する', () => {
  const generated = dungeon.createDungeon(100, 'forest', seeded(1))
  const stock = { ...dungeon.createDungeonStocks()[0], dungeon: generated, highestFloor: 1, totalFloorsKnown: true }
  const hero = character(100)
  const boss = { ...dungeon.instantiateEnemies(generated.floors[0])[0], hp: 1, attack: 0 }
  let before = { ...battle.createBattleState(hero, [boss], { x: 5, y: 5 }), loot: loot.createLootState(generated, () => 0) }
  const attacked = battle.attackWithWeapon(before, { x: 5, y: 3 }, open13)
  let serial = 0
  let result = loot.resolveEnemyLoot(before, attacked, generated, () => .2, () => `boss-treasure-${++serial}`)
  assert.equal(result.combat.enemies.length, 0)
  assert.deepEqual(result.player.specialBossClears, ['forest'])
  assert.equal(result.loot.chests.length, 3)
  assert.equal(result.loot.items.length, 0)
  assert.equal(loot.resolveEnemyLoot(result, result, generated), result)
  for (const chest of result.loot.chests) {
    result = { ...result, combat: { ...result.combat, position: chest.position } }
    result = loot.openLootChest(result, 1, chest.position, generated, () => .9)
    assert.equal(loot.openLootChest(result, 1, chest.position, generated), result)
  }
  assert.equal(result.player.treasures.length, 3)
  assert.ok(result.loot.chests.every((chest) => chest.opened))
  const saved = saves.createSaveData(result.player, [stock, ...dungeon.createDungeonStocks().slice(1)], new Date(), runs.captureRun(1, 1, result, 100))
  const restored = saves.readSaveData(saved)
  assert.deepEqual(restored.player.treasures, result.player.treasures)
  assert.deepEqual(restored.run.battle.loot.chests, result.loot.chests)
  assert.deepEqual(restored.player.specialBossClears, ['forest'])
  assert.equal(runs.restoreBattle(restored.player, restored.run).combat.turn, result.combat.turn)
  const v5 = structuredClone(saved); v5.schemaVersion = 5; delete v5.player.specialBossClears; v5.run = null
  assert.deepEqual(saves.readSaveData(v5).player.specialBossClears, [])
})

test('ボス戦途中のHP・強化フェーズ・固定予告・連続攻撃後段を旧探索へ混ぜず復元する', () => {
  const generated = dungeon.createDungeon(100, 'castle', seeded(1))
  const stock = { ...dungeon.createDungeonStocks()[2], dungeon: generated, highestFloor: 1, totalFloorsKnown: true }
  const hero = character(100)
  const original = dungeon.instantiateEnemies(generated.floors[0])[0]
  const boss = { ...original, hp: Math.floor(original.maxHp / 2) + 1, attackIndex: 2, discovered: true }
  const first = combat.createAttackWarning(boss, { x: 6, y: 11 }, generated.floors[0].map)
  assert.ok(first.followUpCells)
  // 予告を作った後に50%を跨いでも、固定済みの前半・後半は保存できる。
  const { followUpCells, ...rest } = first
  const second = { ...rest, phase: 2, cells: followUpCells, remaining: 1 }
  const runBoss = { ...boss, hp: Math.floor(original.maxHp / 2), warning: second }
  const state = { ...battle.createBattleState(hero, [runBoss], generated.floors[0].start), loot: loot.createLootState(generated, () => 0) }
  const stocks = [dungeon.createDungeonStocks()[0], dungeon.createDungeonStocks()[1], stock]
  const saved = saves.createSaveData(hero, stocks, new Date(), runs.captureRun(3, 1, state, 100))
  assert.deepEqual(runs.restoreBattle(saved.player, saved.run).combat.enemies[0], runBoss)
  assert.equal(runs.restoreBattle(saved.player, saved.run).combat.turn, 0)
  const old = structuredClone(saved); old.schemaVersion = 5; old.run = null; delete old.player.specialBossClears
  assert.deepEqual(saves.readSaveData(old).player.inventory, hero.inventory)
})

test('特殊ボスは毒・燃焼・鈍足を受け、気絶は連続せず、ノックバックは無効', () => {
  for (const effect of ['poison', 'burn', 'slow', 'stun', 'knockback']) {
    const hero = character(100, 'sword')
    hero.inventory[0] = { ...hero.inventory[0], specialEffect: effect, specialEffectLevel: 1, effectRate: 1 }
    const boss = combat.createEnemy('boss', 'goblin', 100, { x: 5, y: 2 }, true, 'forest')
    const state = battle.createBattleState(hero, [boss], { x: 5, y: 4 })
    const attacked = battle.attackWithWeapon(state, { x: 5, y: 3 }, open13, () => 0)
    const after = attacked.combat.enemies[0]
    if (effect === 'knockback') assert.deepEqual(after.position, boss.position)
    else if (effect === 'stun') {
      assert.equal(after.statuses.stunRecovery, 1)
      const repeated = battle.attackWithWeapon(attacked, { x: 5, y: 3 }, open13, () => 0)
      assert.equal(repeated.combat.enemies[0].statuses.stun, 0)
    } else assert.ok(after.statuses[effect] > 0)
    if (effect === 'poison') {
      const ticked = battle.moveBattlePlayer(attacked, 'right', open13)
      assert.ok(after.hp - ticked.combat.enemies[0].hp >= Math.ceil(boss.maxHp * .05))
    }
  }
})

test('ガーディアン突進は予告した経路に限り、プレイヤーの移動先へ2×2で重ならない', () => {
  const boss = { ...combat.createEnemy('boss', 'goblin', 100, { x: 5, y: 2 }, true, 'ruins'), attackIndex: 2, discovered: true }
  const warning = combat.createAttackWarning(boss, { x: 6, y: 7 }, open13)
  assert.equal(warning.pattern, 'charge')
  assert.ok(warning.destination)
  assert.ok(warning.cells.some((cell) => cell.x === 6 && cell.y === 5))
  const state = { position: { x: 6, y: 5 }, turn: 1, playerHp: 100000, playerMaxHp: 100000, enemies: [{ ...boss, warning: { ...warning, remaining: 1 } }], finished: false }
  const result = combat.processEnemyTurn(state, open13)
  assert.deepEqual(result.enemies[0].position, boss.position)
  assert.equal(result.playerHp, 100000 - boss.attack)
})

test('3体の透過PNGは128×128で、画像ファイルを読み込める', async () => {
  for (const name of ['treant', 'guardian', 'demon_king']) {
    const bytes = await readFile(new URL(`../public/assets/bosses/${name}.png`, import.meta.url))
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
    assert.equal(bytes.readUInt32BE(16), 128)
    assert.equal(bytes.readUInt32BE(20), 128)
  }
})
