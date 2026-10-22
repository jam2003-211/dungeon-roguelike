import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const mapUrl = url(compile('../src/game/forestMap.ts'))
const camera = await import(url(compile('../src/game/dungeonCamera.ts').replace("'./forestMap'", `'${mapUrl}'`)))
const map = await import(mapUrl)

test('11×11カメラは全座標でプレイヤーを6行6列に保ち、外側タップを無視する', () => {
  assert.equal(camera.VIEW_SIZE, 11)
  for (let y = 0; y < 20; y += 1) for (let x = 0; x < 20; x += 1) {
    const player = { x, y }
    const origin = camera.cameraOrigin(player)
    assert.deepEqual(camera.viewToMap(player, 5, 5), player)
    for (let row = 0; row < 11; row += 1) for (let col = 0; col < 11; col += 1) {
      const expected = { x: origin.x + col, y: origin.y + row }
      assert.deepEqual(camera.viewToMap(player, col, row), map.isInsideMap(expected) ? expected : null)
      assert.equal(camera.isInView(player, expected), map.isInsideMap(expected))
    }
    assert.equal(camera.viewToMap(player, -1, 5), null)
    assert.equal(camera.viewToMap(player, 11, 5), null)
  }
  assert.deepEqual(camera.cameraOrigin({ x: 0, y: 19 }), { x: -5, y: 14 })
  assert.deepEqual(camera.cameraOrigin({ x: 1, y: 18 }), { x: -4, y: 13 })
})
