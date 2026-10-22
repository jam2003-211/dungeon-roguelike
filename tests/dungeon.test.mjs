import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function transpile(path) { const source = await readFile(new URL(path, import.meta.url), 'utf8'); return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText }
function url(output) { return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}` }
const mapUrl = url(await transpile('../src/game/forestMap.ts'))
const playerUrl = url(await transpile('../src/game/player.ts'))
const combatUrl = url((await transpile('../src/game/combat/combat.ts')).replace("'../forestMap'", `'${mapUrl}'`))
const skillsUrl = url((await transpile('../src/game/skills.ts')).replace("'./player'", `'${playerUrl}'`))
const battleUrl = url((await transpile('../src/game/battle.ts')).replace("'./forestMap'", `'${mapUrl}'`).replace("'./combat/combat'", `'${combatUrl}'`).replace("'./skills'", `'${skillsUrl}'`).replace("'./player'", `'${playerUrl}'`))
const dungeonUrl = url((await transpile('../src/game/dungeon.ts')).replace("'./combat/combat'", `'${combatUrl}'`).replace("'./forestMap'", `'${mapUrl}'`).replace("'./player'", `'${playerUrl}'`))
const runUrl = url((await transpile('../src/game/dungeonRun.ts')).replace("'./battle'", `'${battleUrl}'`).replace("'./dungeon'", `'${dungeonUrl}'`).replace("'./player'", `'${playerUrl}'`))
const dungeon = await import(dungeonUrl); const dungeonRun = await import(runUrl); const player = await import(playerUrl); const combat = await import(combatUrl)

function seeded(seed) { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296 } }
function withFloor(total, seed = 1) { const next = seeded(seed); let first = true; return () => { if (first) { first = false; return (total - .5) / 15 } return next() } }
function positionKey(position) { return `${position.x},${position.y}` }

test('生成Lv入力は正の整数だけを受け入れ、極端な値を拒否する', () => {
  for (const invalid of ['', '0', '-1', '1.5', 'abc', ' 1', '1000001']) assert.equal(dungeon.parseDungeonLevel(invalid), null, invalid)
  assert.equal(dungeon.parseDungeonLevel('1'), 1); assert.equal(dungeon.parseDungeonLevel('1000000'), 1000000)
})

test('階層数1・2・15の境界と20×20マップを生成する', () => {
  for (const total of [1, 2, 15]) {
    const generated = dungeon.createDungeon(10, 'forest', withFloor(total, 100 + total))
    assert.equal(generated.totalFloors, total); assert.equal(generated.floors.length, total)
    for (const floor of generated.floors) { assert.equal(floor.map.length, 20); assert.ok(floor.map.every((row) => row.length === 20)); assert.equal(floor.map.flat().length, 400) }
  }
})

test('100回の生成で到達可能性・障害物率・配置・敵数・宝箱候補を保証する', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const generated = dungeon.createDungeon(12, ['forest', 'ruins', 'castle'][seed % 3], seeded(seed))
    assert.ok(generated.totalFloors >= 1 && generated.totalFloors <= 15)
    assert.ok(generated.enemyKinds.length >= 3 && generated.enemyKinds.length <= 4)
    assert.ok(generated.enemyKinds.includes(generated.bossKind)); assert.equal(dungeon.validateDungeon(generated), true)
    for (const floor of generated.floors) {
      const distances = dungeon.reachableDistances(floor.map, floor.start)
      assert.ok(distances.has(positionKey(floor.stairs)))
      const obstacles = floor.map.flat().filter((tile) => !['grass', 'path', 'ruinsFloor', 'castleFloor'].includes(tile)).length
      assert.ok(obstacles >= 40 && obstacles <= 60)
      const all = [floor.start, floor.stairs, ...floor.enemies.map((enemy) => enemy.position)]; assert.equal(new Set(all.map(positionKey)).size, all.length)
      const final = floor.floor === generated.totalFloors; const bosses = floor.enemies.filter((enemy) => enemy.isBoss)
      assert.ok(final ? floor.enemies.length >= 3 && floor.enemies.length <= 5 : floor.enemies.length >= 5 && floor.enemies.length <= 8)
      assert.equal(bosses.length, final ? 1 : 0)
      assert.ok(floor.enemies.every((enemy) => generated.enemyKinds.includes(enemy.kind) && enemy.level >= 1 && Math.abs(enemy.level - generated.level) <= 5))
      if (!final) { assert.ok(floor.chestCandidate); assert.ok((distances.get(positionKey(floor.chestCandidate)) ?? 0) >= 10); assert.ok(!all.some((position) => positionKey(position) === positionKey(floor.chestCandidate))) }
      else assert.equal(floor.chestCandidate, null)
    }
  }
})

test('ボスは選択敵種・指定Lv・既存倍率を使用する', () => {
  const generated = dungeon.createDungeon(17, 'castle', withFloor(1, 77)); const floor = generated.floors[0]
  const spawn = floor.enemies.find((enemy) => enemy.isBoss); assert.ok(spawn); assert.equal(spawn.level, 17); assert.equal(generated.enemyKinds.includes(spawn.kind), true)
  const boss = dungeon.instantiateEnemies(floor).find((enemy) => enemy.isBoss); const normal = combat.createEnemy('normal', spawn.kind, 17, spawn.position)
  assert.equal(boss.maxHp, normal.maxHp * 3); assert.equal(boss.attack, Math.floor(normal.attack * 1.5)); assert.equal(player.enemyExperience(17, true), player.enemyExperience(17, false) * 5)
})

test('再探索は固定初期データを復元し、探索中の変更を持ち込まない', () => {
  const generated = dungeon.createDungeon(8, 'ruins', withFloor(2, 88)); const first = dungeon.instantiateEnemies(generated.floors[0]); first[0].hp = 1; first[0].position = { x: 0, y: 0 }
  const second = dungeon.instantiateEnemies(generated.floors[0]); assert.deepEqual(second, dungeon.instantiateEnemies(generated.floors[0])); assert.notEqual(second[0].hp, 1); assert.notDeepEqual(second[0].position, { x: 0, y: 0 })
})

test('再生成は検証後に対象だけを置換し、キャンセル時は全データを維持する', () => {
  let stocks = dungeon.createDungeonStocks(); const original = dungeon.createDungeon(5, 'forest', withFloor(2, 9)); stocks = dungeon.replaceDungeonStock(stocks, 1, original); stocks = dungeon.updateStockProgress(stocks, 1, 2, true, true)
  const cancelled = dungeon.regenerateDungeonStock(stocks, 1, 9, false, seeded(4)); assert.equal(cancelled, stocks)
  const replaced = dungeon.regenerateDungeonStock(stocks, 1, 9, true, seeded(5)); assert.notEqual(replaced[0].dungeon, original); assert.equal(replaced[0].highestFloor, 0); assert.equal(replaced[0].cleared, false); assert.equal(replaced[1], stocks[1])
  const invalid = { ...replaced[0].dungeon, floors: [] }; assert.equal(dungeon.replaceDungeonStock(replaced, 1, invalid), replaced)
})

test('ストックはJSON化でき、解放条件と進行記録を独立保持する', () => {
  const stocks = dungeon.createDungeonStocks(); assert.deepEqual(stocks.map((stock) => stock.unlockLevel), [1, 15, 30]); assert.doesNotThrow(() => JSON.parse(JSON.stringify(stocks)))
  const updated = dungeon.updateStockProgress(stocks, 2, 4, true, true); assert.equal(updated[1].highestFloor, 4); assert.equal(updated[1].totalFloorsKnown, true); assert.equal(updated[1].cleared, true); assert.deepEqual(updated[0], stocks[0])
})

test('階段以外・通常階・ボス生存・撃破後の判定を分ける', () => {
  const generated = dungeon.createDungeon(1, 'forest', withFloor(1, 45)); const floor = generated.floors[0]; const enemies = dungeon.instantiateEnemies(floor)
  assert.equal(dungeon.stairAction(floor, 1, floor.start, enemies), 'none'); assert.equal(dungeon.stairAction(floor, 1, floor.stairs, enemies), 'blocked'); assert.equal(dungeon.stairAction(floor, 1, floor.stairs, enemies.filter((enemy) => !enemy.isBoss)), 'clear')
  const two = dungeon.createDungeon(1, 'forest', withFloor(2, 46)); assert.equal(dungeon.stairAction(two.floors[0], 2, two.floors[0].stairs, dungeon.instantiateEnemies(two.floors[0])), 'next')
})

test('階層移動はターン・HP・育成値を維持し、次階の敵を初期化する', () => {
  const generated = dungeon.createDungeon(3, 'forest', withFloor(2, 67)); let run = dungeonRun.startDungeonRun(player.createPlayerState(), generated)
  run = { ...run, battle: { ...run.battle, player: { ...run.battle.player, currentHp: 61 }, experienceEarned: 40, combat: { ...run.battle.combat, position: generated.floors[0].stairs, playerHp: 61, turn: 12, enemies: run.battle.combat.enemies.map((enemy, index) => index === 0 ? { ...enemy, hp: 1 } : enemy) } } }
  const advanced = dungeonRun.advanceDungeonRun(run, generated); assert.equal(advanced.cleared, false); assert.equal(advanced.run.currentFloor, 2); assert.equal(advanced.run.battle.combat.turn, 12); assert.equal(advanced.run.battle.player.currentHp, 61); assert.equal(advanced.run.battle.experienceEarned, 40)
  assert.deepEqual(advanced.run.battle.combat.enemies, dungeon.instantiateEnemies(generated.floors[1])); assert.deepEqual(advanced.run.battle.combat.position, generated.floors[1].start)
})

test('最終階到達で総階層を公開し、撃破だけでなく階段使用後にクリアする', () => {
  const generated = dungeon.createDungeon(1, 'forest', withFloor(1, 99)); let run = dungeonRun.startDungeonRun(player.createPlayerState(), generated)
  run = { ...run, battle: { ...run.battle, combat: { ...run.battle.combat, enemies: run.battle.combat.enemies.filter((enemy) => !enemy.isBoss) } } }
  assert.equal(dungeonRun.advanceDungeonRun(run, generated).cleared, false)
  run = { ...run, battle: { ...run.battle, combat: { ...run.battle.combat, position: generated.floors[0].stairs } } }
  assert.equal(dungeonRun.advanceDungeonRun(run, generated).cleared, true)
})
