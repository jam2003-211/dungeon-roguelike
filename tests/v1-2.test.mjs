import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGameModule } from './pwa-fixture.mjs'

const dungeon = await loadGameModule('game/dungeon')
const player = await loadGameModule('game/player')
const { createSaveData, readSaveData } = await loadGameModule('persistence/saveData')
const { combatVisuals } = await loadGameModule('game/combatVisuals')
const { SaveQueue } = await loadGameModule('persistence/saveQueue')
function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 } }

test('新生成の森・遺跡・城は全マスが床で、敵数・到達性・ボスを維持する', () => {
  for (const theme of ['forest', 'ruins', 'castle']) for (let seed = 1; seed <= 12; seed++) {
    const generated = dungeon.createDungeon(20, theme, random(seed))
    assert.equal(dungeon.validateDungeon(generated), true)
    for (const floor of generated.floors) {
      assert.ok(floor.map.flat().every(tile => ['grass', 'path', 'ruinsFloor', 'castleFloor'].includes(tile)))
      const final = floor.floor === generated.totalFloors
      assert.ok(final ? floor.enemies.length >= 4 && floor.enemies.length <= 6 : floor.enemies.length >= 6 && floor.enemies.length <= 9)
      assert.ok(dungeon.reachableDistances(floor.map, floor.start).has(`${floor.stairs.x},${floor.stairs.y}`))
      assert.equal(floor.enemies.filter(enemy => enemy.isBoss).length, Number(final))
    }
  }
})

test('旧生成済みの障害物付き地形と敵数も検証でき、変更されない', () => {
  const generated = dungeon.createDungeon(1, 'forest', () => 0)
  const floor = generated.floors[0]
  const occupied = new Set([floor.start, floor.stairs, ...floor.enemies.map(enemy => enemy.position)].map(position => `${position.x},${position.y}`))
  let count = 0
  for (let y = 10; y < 20 && count < 40; y++) for (let x = 10; x < 20 && count < 40; x++) {
    if (occupied.has(`${x},${y}`)) continue
    floor.map[y][x] = 'tree'; count++
  }
  assert.equal(count, 40)
  assert.equal(dungeon.validateDungeon(generated), true)
  assert.equal(floor.map.flat().filter(tile => tile === 'tree').length, 40)
  const stocks = dungeon.createDungeonStocks(); stocks[0].dungeon = generated
  const saved = createSaveData(player.createPlayerState(), stocks)
  assert.deepEqual(readSaveData(saved).stocks[0].dungeon, generated)
})

test('確定した戦闘差分だけ敵とプレイヤーの短いヒット演出になる', () => {
  const previous = { turn: 3, playerHp: 80, position: { x: 2, y: 2 }, enemies: [{ id: 'a', hp: 20, position: { x: 3, y: 2 } }, { id: 'b', hp: 1, position: { x: 4, y: 2 } }] }
  const current = { ...previous, turn: 4, playerHp: 74, enemies: [{ ...previous.enemies[0], hp: 14 }] }
  assert.deepEqual(combatVisuals(previous, current), [
    { id: 'a', kind: 'enemy', damage: 6, position: { x: 3, y: 2 } },
    { id: 'b', kind: 'enemy', damage: 1, position: { x: 4, y: 2 } },
    { id: 'player', kind: 'player', damage: 6, position: { x: 2, y: 2 } },
  ])
  assert.deepEqual(combatVisuals(previous, { ...current, turn: 3 }), [])
})

test('削除は進行中の古い自動保存の後に実行し、待機中の保存を無効化する', async () => {
  let stored = { version: 'old' }, release
  const repo = { read: async () => stored, write: async data => { await new Promise(resolve => { release = resolve }); stored = data }, remove: async () => { stored = undefined } }
  const queue = new SaveQueue(repo)
  const first = queue.autosave({ version: 'first' })
  await new Promise(resolve => setImmediate(resolve))
  const stale = queue.autosave({ version: 'stale' })
  const deletion = queue.remove()
  assert.equal(await queue.autosave({ version: 'too-late' }), null)
  release(); await first; assert.equal(await stale, null); await deletion
  assert.equal(stored, undefined)
})
