import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function transpile(path) { const source = await readFile(new URL(path, import.meta.url), 'utf8'); return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText }
function url(output) { return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}` }
const mapUrl = url(await transpile('../src/game/forestMap.ts'))
const levelsUrl = url(await transpile('../src/game/effectLevels.ts'))
const playerUrl = url((await transpile('../src/game/player.ts')).replace("'./effectLevels'", `'${levelsUrl}'`))
const specialUrl = url(await transpile('../src/game/specialBoss.ts'))
const combatUrl = url((await transpile('../src/game/combat/combat.ts')).replace("'../forestMap'", `'${mapUrl}'`).replace("'../player'", `'${playerUrl}'`).replace("'../specialBoss'", `'${specialUrl}'`))
const skillsUrl = url((await transpile('../src/game/skills.ts')).replace("'./player'", `'${playerUrl}'`).replace("'./effectLevels'", `'${levelsUrl}'`))
const battleUrl = url((await transpile('../src/game/battle.ts')).replace("'./forestMap'", `'${mapUrl}'`).replace("'./combat/combat'", `'${combatUrl}'`).replace("'./skills'", `'${skillsUrl}'`).replace("'./player'", `'${playerUrl}'`).replace("'./effectLevels'", `'${levelsUrl}'`).replace("'./specialBoss'", `'${specialUrl}'`))
const dungeonUrl = url((await transpile('../src/game/dungeon.ts')).replace("'./combat/combat'", `'${combatUrl}'`).replace("'./forestMap'", `'${mapUrl}'`).replace("'./player'", `'${playerUrl}'`))
const runUrl = url((await transpile('../src/game/dungeonRun.ts')).replace("'./battle'", `'${battleUrl}'`).replace("'./dungeon'", `'${dungeonUrl}'`).replace("'./player'", `'${playerUrl}'`))
const dungeon = await import(dungeonUrl); const dungeonRun = await import(runUrl); const player = await import(playerUrl); const combat = await import(combatUrl)

function seeded(seed) { let value = seed >>> 0; return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296 } }
function withFloor(total, seed = 1) { const next = seeded(seed); let first = true; return () => { if (first) { first = false; return (total - .5) / 10 } return next() } }
function positionKey(position) { return `${position.x},${position.y}` }

test('外観シードは生成データのJSON往復で保持され、地形・通行判定を変えない', () => {
  for (const theme of ['forest', 'ruins', 'castle']) {
    const generated = dungeon.createDungeon(1, theme, withFloor(2, 41))
    const restored = JSON.parse(JSON.stringify(generated))
    assert.equal(restored.visualSeed, generated.visualSeed)
    assert.ok(Number.isInteger(restored.visualSeed))
    assert.equal(dungeon.validateDungeon(restored), true)
    const other = dungeon.createDungeon(1, theme, withFloor(2, 42))
    assert.notEqual(other.visualSeed, generated.visualSeed)
    assert.deepEqual(generated.floors, restored.floors)
    const noVisual = { ...restored }; delete noVisual.visualSeed
    assert.equal(dungeon.validateDungeon(noVisual), true)
    for (let i = 0; i < generated.floors.length; i += 1) assert.deepEqual(dungeon.reachableDistances(generated.floors[i].map, generated.floors[i].start), dungeon.reachableDistances(restored.floors[i].map, restored.floors[i].start))
  }
})

test('生成Lv入力は正の整数だけを受け入れ、極端な値を拒否する', () => {
  for (const invalid of ['', '0', '-1', '1.5', 'abc', ' 1', '1000001']) assert.equal(dungeon.parseDungeonLevel(invalid), null, invalid)
  assert.equal(dungeon.parseDungeonLevel('1'), 1); assert.equal(dungeon.parseDungeonLevel('1000000'), 1000000)
})

test('新規階層数1・2・10の境界と20×20マップを生成する', () => {
  for (const total of [1, 2, 10]) {
    const generated = dungeon.createDungeon(10, 'forest', withFloor(total, 100 + total))
    assert.equal(generated.totalFloors, total); assert.equal(generated.floors.length, total)
    for (const floor of generated.floors) { assert.equal(floor.map.length, 20); assert.ok(floor.map.every((row) => row.length === 20)); assert.equal(floor.map.flat().length, 400) }
  }
})

test('100回の小部屋生成で全敵種・到達可能性・配置・敵数・宝箱候補を保証する', () => {
  const appearedKinds = new Set()
  for (let seed = 1; seed <= 100; seed += 1) {
    const generated = dungeon.createDungeon(12, ['forest', 'ruins', 'castle'][seed % 3], seeded(seed))
    assert.ok(generated.totalFloors >= 1 && generated.totalFloors <= 10)
    assert.equal(generated.enemyKinds.length, 6)
    assert.equal(new Set(generated.enemyKinds).size, 6)
    assert.ok(generated.enemyKinds.includes(generated.bossKind)); assert.equal(dungeon.validateDungeon(generated), true)
    for (const floor of generated.floors) {
      const distances = dungeon.reachableDistances(floor.map, floor.start)
      assert.ok(distances.has(positionKey(floor.stairs)))
      const obstacles = floor.map.flat().filter((tile) => !['grass', 'path', 'ruinsFloor', 'castleFloor'].includes(tile)).length
      assert.ok(obstacles >= 120 && obstacles <= 280)
      assert.equal(distances.size, 400 - obstacles)
      for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) {
        const left = column * 6 + 1; const top = row * 6 + 1
        const hasRoom = Array.from({ length: 4 }, (_, dy) => Array.from({ length: 4 }, (_, dx) =>
          Array.from({ length: 3 }, (_, iy) => Array.from({ length: 3 }, (_, ix) =>
            ['grass', 'path', 'ruinsFloor', 'castleFloor'].includes(floor.map[top + dy + iy][left + dx + ix])).every(Boolean)).every(Boolean)).some(Boolean)).some(Boolean)
        assert.ok(hasRoom, `seed ${seed}: room ${row},${column}`)
      }
      const all = [floor.start, floor.stairs, ...floor.enemies.map((enemy) => enemy.position)]; assert.equal(new Set(all.map(positionKey)).size, all.length)
      for (let i = 0; i < floor.enemies.length; i += 1) for (let j = i + 1; j < floor.enemies.length; j += 1) {
        const a = floor.enemies[i].position; const b = floor.enemies[j].position
        assert.ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) >= 3)
      }
      assert.ok(floor.enemies.every((enemy) => Math.abs(enemy.position.x - floor.stairs.x) + Math.abs(enemy.position.y - floor.stairs.y) > 1))
      const final = floor.floor === generated.totalFloors; const bosses = floor.enemies.filter((enemy) => enemy.isBoss)
      assert.ok(final ? floor.enemies.length >= 4 && floor.enemies.length <= 6 : floor.enemies.length >= 6 && floor.enemies.length <= 9)
      assert.equal(bosses.length, final ? 1 : 0)
      assert.ok(floor.enemies.every((enemy) => generated.enemyKinds.includes(enemy.kind) && enemy.level >= 1 && Math.abs(enemy.level - generated.level) <= 5))
      floor.enemies.forEach((enemy) => appearedKinds.add(enemy.kind))
      assert.ok(floor.enemies.every((enemy) => distances.has(positionKey(enemy.position))))
      if (!final) { assert.ok(floor.chestCandidate); assert.ok((distances.get(positionKey(floor.chestCandidate)) ?? 0) >= 10); assert.ok(!all.some((position) => positionKey(position) === positionKey(floor.chestCandidate))) }
      else assert.equal(floor.chestCandidate, null)
    }
  }
  assert.equal(appearedKinds.size, 6)
})

test('ボスは選択敵種・指定Lv・槍12回分のHPを使用する', () => {
  const generated = dungeon.createDungeon(17, 'castle', withFloor(1, 77)); const floor = generated.floors[0]
  const spawn = floor.enemies.find((enemy) => enemy.isBoss); assert.ok(spawn); assert.equal(spawn.level, 17); assert.equal(generated.enemyKinds.includes(spawn.kind), true)
  const boss = dungeon.instantiateEnemies(floor).find((enemy) => enemy.isBoss); const normal = combat.createEnemy('normal', spawn.kind, 17, spawn.position)
  assert.equal(boss.maxHp, combat.referenceSpearDamage(17) * 12); assert.equal(boss.attack, Math.floor(normal.attack * 1.5)); assert.equal(player.enemyExperience(17, true), player.enemyExperience(17, false) * 5)
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
