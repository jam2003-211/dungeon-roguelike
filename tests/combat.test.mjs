import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function transpile(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
}

const mapOutput = await transpile('../src/game/forestMap.ts')
const mapUrl = `data:text/javascript;base64,${Buffer.from(mapOutput).toString('base64')}`
const levelsOutput = await transpile('../src/game/effectLevels.ts')
const levelsUrl = `data:text/javascript;base64,${Buffer.from(levelsOutput).toString('base64')}`
const playerOutput = (await transpile('../src/game/player.ts')).replace("'./effectLevels'", `'${levelsUrl}'`)
const playerUrl = `data:text/javascript;base64,${Buffer.from(playerOutput).toString('base64')}`
const combatOutput = (await transpile('../src/game/combat/combat.ts')).replace("'../forestMap'", `'${mapUrl}'`).replace("'../player'", `'${playerUrl}'`)
const combat = await import(`data:text/javascript;base64,${Buffer.from(combatOutput).toString('base64')}`)

function openMap(obstacles = []) {
  const map = Array.from({ length: 20 }, (_, y) => Array.from({ length: 20 }, (_, x) => x === 0 || y === 0 || x === 19 || y === 19 ? 'wall' : 'grass'))
  for (const { x, y } of obstacles) map[y][x] = 'wall'
  return map
}

test('敵6種類の基礎能力値・索敵距離・準備ターンが定義どおり', () => {
  const actual = Object.values(combat.ENEMY_DEFINITIONS).map(({ name, baseHp, baseAttack, detectionRange, preparationTurns }) => [name, baseHp, baseAttack, detectionRange, preparationTurns])
  assert.deepEqual(actual, [
    ['ゴブリン', 20, 15, 4, 1], ['イノシシ', 20, 20, 5, 2], ['スライムキング', 30, 10, 4, 2],
    ['一つ目コウモリ', 10, 15, 7, 1], ['ストーンゴーレム', 30, 15, 5, 2], ['ゴースト', 10, 20, 8, 2],
  ])
})

test('敵レベルとボス倍率を整数式で反映する', () => {
  const normal = combat.createEnemy('e', 'boar', 4, { x: 5, y: 5 })
  assert.equal(normal.maxHp, 50); assert.equal(normal.attack, 32)
  const boss = combat.createEnemy('b', 'boar', 4, { x: 5, y: 5 }, true)
  assert.equal(boss.maxHp, 150); assert.equal(boss.attack, 48)
})

test('索敵はマンハッタン距離の境界を含み、障害物で視線が遮られる', () => {
  const enemy = combat.createEnemy('e', 'goblin', 1, { x: 5, y: 5 })
  assert.equal(combat.canDetect(enemy, { x: 5, y: 9 }, openMap()), true)
  assert.equal(combat.canDetect(enemy, { x: 5, y: 10 }, openMap()), false)
  assert.equal(combat.canDetect(enemy, { x: 5, y: 9 }, openMap([{ x: 5, y: 7 }])), false)
})

test('発見後は視界外でも追跡し、障害物を迂回する', () => {
  const map = openMap([{ x: 5, y: 6 }])
  const enemy = { ...combat.createEnemy('e', 'goblin', 1, { x: 5, y: 5 }), discovered: true }
  const state = { position: { x: 5, y: 9 }, turn: 1, playerHp: 100, playerMaxHp: 100, enemies: [enemy], finished: false }
  const next = combat.processEnemyTurn(state, map)
  assert.equal(next.enemies[0].discovered, true)
  assert.deepEqual(next.enemies[0].position, { x: 4, y: 5 })
})

test('敵は同じマスへ移動せず、開始位置を交換しない', () => {
  const first = { ...combat.createEnemy('a', 'goblin', 1, { x: 4, y: 5 }), discovered: true }
  const second = { ...combat.createEnemy('b', 'goblin', 1, { x: 5, y: 5 }), discovered: true }
  const state = { position: { x: 8, y: 5 }, turn: 1, playerHp: 100, playerMaxHp: 100, enemies: [first, second], finished: false }
  const next = combat.processEnemyTurn(state, openMap())
  assert.notEqual(combat.positionKey(next.enemies[0].position), combat.positionKey(next.enemies[1].position))
  assert.notDeepEqual([next.enemies[0].position, next.enemies[1].position], [second.position, first.position])
})

test('準備中は警告なし、攻撃1ターン前だけ赤を表示して固定範囲を攻撃する', () => {
  const enemy = { ...combat.createEnemy('e', 'boar', 1, { x: 5, y: 5 }), discovered: true }
  const state = { position: { x: 5, y: 6 }, turn: 1, playerHp: 100, playerMaxHp: 100, enemies: [enemy], finished: false }
  const preparing = combat.processEnemyTurn(state, openMap())
  assert.deepEqual(preparing.enemies[0].position, enemy.position); assert.equal(preparing.enemies[0].warning.remaining, 2)
  assert.equal(combat.getWarningLevel(preparing.enemies, { x: 5, y: 6 }), null)
  const frozenCells = structuredClone(preparing.enemies[0].warning.cells)
  const escaped = { ...preparing, position: { x: 6, y: 6 } }
  const red = combat.processEnemyTurn(escaped, openMap())
  assert.equal(red.enemies[0].warning.remaining, 1); assert.deepEqual(red.enemies[0].warning.cells, frozenCells)
  assert.equal(combat.getWarningLevel(red.enemies, { x: 5, y: 6 }), 'red')
  const resolved = combat.processEnemyTurn(red, openMap())
  assert.equal(resolved.playerHp, 100); assert.equal(resolved.enemies[0].warning, null)
})

test('短縮後の準備・重複警告・気絶・撃破でも赤は次行動で攻撃する敵だけ', () => {
  const enemy = { ...combat.createEnemy('boar', 'boar', 1, { x: 5, y: 5 }), discovered: true }
  const state = { position: { x: 5, y: 6 }, turn: 0, playerHp: 100, playerMaxHp: 100, enemies: [enemy], finished: false }
  const prepared = combat.processEnemyTurn(state, openMap())
  assert.equal(prepared.enemies[0].warning.remaining, 2)
  assert.equal(combat.getWarningLevel(prepared.enemies, state.position), null)
  const waiting = combat.processEnemyTurn(prepared, openMap())
  assert.equal(waiting.enemies[0].warning.remaining, 1)
  const ready = waiting
  assert.equal(combat.getWarningLevel([...waiting.enemies, ...ready.enemies], state.position), 'red')
  assert.equal(combat.getWarningLevel([{ ...ready.enemies[0], hp: 0 }], state.position), null)
  assert.equal(combat.getWarningLevel([{ ...ready.enemies[0], statuses: { poison: 0, burn: 0, slow: 0, stun: 1 } }], state.position), null)
  const resolved = combat.processEnemyTurn(ready, openMap())
  assert.equal(resolved.playerHp, 100 - enemy.attack)
  assert.equal(combat.getWarningLevel(resolved.enemies, state.position), null)
})

test('固定予告内に残ると攻撃力ぶんダメージを受ける', () => {
  const enemy = { ...combat.createEnemy('e', 'goblin', 1, { x: 5, y: 5 }), discovered: true }
  const state = { position: { x: 5, y: 6 }, turn: 1, playerHp: 100, playerMaxHp: 100, enemies: [enemy], finished: false }
  const red = combat.processEnemyTurn(state, openMap()); const hit = combat.processEnemyTurn(red, openMap())
  assert.equal(hit.playerHp, 85)
})

test('12行動あたりの攻撃回数が増え、どの命中にも直前の赤警告がある', () => {
  for (const [kind, expected] of [['goblin', 6], ['boar', 4]]) {
    const enemy = { ...combat.createEnemy(kind, kind, 1, { x: 5, y: 5 }), discovered: true }
    let state = { position: { x: 5, y: 6 }, turn: 0, playerHp: 1000, playerMaxHp: 1000, enemies: [enemy], finished: false }
    let hits = 0
    for (let turn = 0; turn < 12; turn += 1) {
      const warned = combat.getWarningLevel(state.enemies, state.position) === 'red'
      const next = combat.processEnemyTurn(state, openMap())
      if (next.playerHp < state.playerHp) { hits++; assert.equal(warned, true, `${kind} が予告なしで攻撃`) }
      state = next
    }
    assert.equal(hits, expected)
  }
})

test('通常攻撃は隣接空マスでもターンを消費し、敵HPを12減らして撃破する', () => {
  const enemy = combat.createEnemy('e', 'cyclopsBat', 1, { x: 5, y: 6 })
  const state = { position: { x: 5, y: 5 }, turn: 0, playerHp: 100, playerMaxHp: 100, enemies: [enemy], finished: false }
  const defeated = combat.attackCell(state, { x: 5, y: 6 }, openMap())
  assert.equal(defeated.turn, 1); assert.equal(defeated.enemies.length, 0)
  const sturdyEnemy = combat.createEnemy('g', 'goblin', 1, { x: 5, y: 6 })
  const damaged = combat.attackCell({ ...state, enemies: [sturdyEnemy] }, { x: 5, y: 6 }, openMap())
  assert.equal(damaged.enemies[0].hp, 8)
  const miss = combat.attackCell({ ...state, enemies: [] }, { x: 6, y: 5 }, openMap())
  assert.equal(miss.turn, 1)
})

test('無効移動と無効攻撃は同じ状態を返してターンを進めない', () => {
  const state = combat.createCombatState([]); const map = openMap([{ x: 2, y: 16 }])
  assert.equal(combat.moveCombatPlayer(state, 'up', map), state)
  assert.equal(combat.attackCell(state, { x: 4, y: 17 }, map), state)
})

test('プレイヤーHPが0になると探索終了となり、その後の入力を受け付けない', () => {
  const warning = { remaining: 1, cells: [{ x: 5, y: 6 }], direction: 'down', target: { x: 5, y: 6 } }
  const enemy = { ...combat.createEnemy('e', 'boar', 1, { x: 5, y: 5 }), discovered: true, warning }
  const state = { position: { x: 5, y: 6 }, turn: 3, playerHp: 10, playerMaxHp: 100, enemies: [enemy], finished: false }
  const dead = combat.processEnemyTurn(state, openMap())
  assert.equal(dead.playerHp, 0); assert.equal(dead.finished, true); assert.equal(combat.moveCombatPlayer(dead, 'down', openMap()), dead)
})

test('ボスの6種類の攻撃範囲は通常種より1マス拡大する', () => {
  const expected = { goblin: [1, 2], boar: [3, 4], slimeKing: [8, 24], cyclopsBat: [5, 6], stoneGolem: [6, 9], ghost: [1, 1] }
  for (const [kind, counts] of Object.entries(expected)) {
    const normal = combat.createEnemy('n', kind, 1, { x: 10, y: 10 }); const boss = combat.createEnemy('b', kind, 1, { x: 10, y: 10 }, true)
    assert.equal(combat.getAttackCells(normal, 'up', { x: 10, y: 5 }, openMap()).length, counts[0], `${kind}通常`)
    assert.equal(combat.getAttackCells(boss, 'up', { x: 10, y: 5 }, openMap()).length, counts[1], `${kind}ボス`)
  }
})

test('障害物より先の直線攻撃マスを含めない', () => {
  const enemy = combat.createEnemy('e', 'boar', 1, { x: 5, y: 5 })
  const cells = combat.getAttackCells(enemy, 'down', { x: 5, y: 8 }, openMap([{ x: 5, y: 7 }]))
  assert.deepEqual(cells, [{ x: 5, y: 6 }])
})
