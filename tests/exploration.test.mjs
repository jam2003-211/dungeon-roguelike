import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function transpile(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8')
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

const mapOutput = await transpile('../src/game/forestMap.ts')
const mapUrl = `data:text/javascript;base64,${Buffer.from(mapOutput).toString('base64')}`
const map = await import(mapUrl)
const explorationOutput = (await transpile('../src/game/exploration.ts')).replace("'./forestMap'", `'${mapUrl}'`)
const exploration = await import(`data:text/javascript;base64,${Buffer.from(explorationOutput).toString('base64')}`)

test('固定マップは20×20で、開始地点と将来の階段予定地が通行可能', () => {
  assert.equal(map.FOREST_MAP.length, 20)
  assert.equal(map.FOREST_MAP.every((row) => row.length === 20), true)
  assert.equal(map.FOREST_MAP.flat().length, 400)
  assert.equal(map.isPassable(map.FOREST_MAP, map.PLAYER_START), true)
  assert.equal(map.isPassable(map.FOREST_MAP, map.FUTURE_STAIRS_POSITION), true)
})

test('上下左右の有効移動だけ位置を変えてターンを進める', () => {
  const initial = exploration.createExplorationState()
  const up = exploration.movePlayer(initial, 'up')
  assert.deepEqual(up, { position: { x: 2, y: 16 }, turn: 1 })
  const left = exploration.movePlayer(up, 'left')
  assert.deepEqual(left, { position: { x: 1, y: 16 }, turn: 2 })
  const down = exploration.movePlayer(left, 'down')
  assert.deepEqual(down, { position: { x: 1, y: 17 }, turn: 3 })
  const right = exploration.movePlayer(down, 'right')
  assert.deepEqual(right, { position: { x: 2, y: 17 }, turn: 4 })
})

test('障害物とマップ外への移動は同じ状態を返し、ターンを消費しない', () => {
  const beforeTree = { position: { x: 3, y: 5 }, turn: 7 }
  assert.equal(map.FOREST_MAP[4][3], 'tree')
  assert.equal(exploration.movePlayer(beforeTree, 'up'), beforeTree)

  const atLeftEdge = { position: { x: 0, y: 1 }, turn: 4 }
  assert.equal(exploration.movePlayer(atLeftEdge, 'left'), atLeftEdge)
  assert.equal(map.isPassable(map.FOREST_MAP, { x: -1, y: 1 }), false)
  assert.equal(map.isPassable(map.FOREST_MAP, { x: 20, y: 1 }), false)
})

test('キーボード入力を方向へ変換し、無関係なキーは無視する', () => {
  assert.equal(exploration.directionFromKey('ArrowUp'), 'up')
  assert.equal(exploration.directionFromKey('S'), 'down')
  assert.equal(exploration.directionFromKey('a'), 'left')
  assert.equal(exploration.directionFromKey('d'), 'right')
  assert.equal(exploration.directionFromKey('Enter'), null)
})
