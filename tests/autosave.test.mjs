import { withEquipmentFixture } from './equipment-fixture.mjs'
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
  cache.set(path, url); return url
}
const load = (path) => import(moduleUrl(fileURLToPath(new URL('../src/' + path + '.ts', import.meta.url))))
const player = withEquipmentFixture(await load('game/player')); const dungeon = await load('game/dungeon'); const battle = await load('game/battle'); const loot = await load('game/loot')
const combat = await load('game/combat/combat'); const runLogic = await load('game/dungeonRun'); const map = await load('game/forestMap')
const { createSaveData, readSaveData } = await load('persistence/saveData')
const { captureRun, restoreBattle } = await load('persistence/savedRun')
const { SaveQueue } = await load('persistence/saveQueue'); const { SaveOperations } = await load('persistence/saveOperations')
function seeded() { let seed = 42; let first = true; return () => { if (first) { first = false; return .1 } seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 } }
function fixture(final = false) {
  const generated = dungeon.createDungeon(1, 'forest', seeded())
  let character = player.createPlayerState(); character = { ...character, level: 30, experience: 0 }
  character = player.equipItem(character, 'test-light-armor'); character = player.equipItem(character, 'test-accessory-a'); character = player.equipItem(character, 'test-accessory-b'); character.currentHp = 137
  const floor = final ? 2 : 1
  const stocks = dungeon.replaceDungeonStock(dungeon.createDungeonStocks(), 1, generated)
  stocks[0].highestFloor = floor; stocks[0].totalFloorsKnown = final
  const state = battle.createBattleState(character, dungeon.instantiateEnemies(generated.floors[floor - 1]), generated.floors[floor - 1].start)
  state.loot = loot.createLootState(generated, () => .2)
  state.combat.turn = 7; state.cooldowns = { strongStrike: 2, smallHeal: 3 }; state.guardTurns = 2
  state.combat.enemies[0].hp -= 1; state.combat.enemies[0].discovered = true
  state.combat.enemies[0].statuses = { poison: 4, burn: 2, slow: 3, stun: 1 }
  const enemy = state.combat.enemies[0]
  const cells = combat.getAttackCells(enemy, 'up', state.combat.position, generated.floors[floor - 1].map)
  enemy.warning = { remaining: 1, cells, direction: 'up', target: { ...state.combat.position } }
  return { generated, stocks, state, floor }
}
const snapshot = (fixture) => createSaveData(fixture.state.player, fixture.stocks, new Date('2026-10-23T12:00:00Z'), captureRun(1, fixture.floor, fixture.state))
const restored = (fixture) => { const data = readSaveData(snapshot(fixture)); return restoreBattle(data.player, data.run) }

test('旧試験装備を外しても探索座標・ターン・敵・宝箱・報酬・CDを変更しない', () => {
  const data = snapshot(fixture())
  data.player.inventory.forEach((item) => { if (item.id.startsWith('test-')) item.testOnly = true })
  const original = structuredClone(data)
  const cleaned = readSaveData(data)
  original.run.battle.combat.playerHp = cleaned.player.currentHp
  original.run.battle.combat.playerMaxHp = player.calculateStats(cleaned.player).maxHp
  assert.deepEqual(cleaned.run, original.run)
  assert.deepEqual(cleaned.stocks, original.stocks)
  assert.equal(cleaned.player.inventory.length, 2)
  assert.deepEqual(readSaveData(cleaned), cleaned)
  assert.notEqual(data.run.battle.combat.playerMaxHp, cleaned.run.battle.combat.playerMaxHp)
})
test('報酬記録と結びついた非標準の試験装備は開封・獲得の整合性を優先して保持する', () => {
  const data = snapshot(fixture())
  const item = data.player.inventory.find((item) => item.id === 'test-light-armor')
  item.testOnly = true
  data.run.battle.loot.items.push(structuredClone(item))
  assert.deepEqual(readSaveData(data), data)
})

for (const [name, select] of [
  ['現在階', (data) => data.run.floor], ['プレイヤー座標', (data) => data.run.battle.combat.position],
  ['現在HP', (data) => data.player.currentHp], ['ターン数', (data) => data.run.battle.combat.turn],
  ['スキルCD', (data) => data.run.battle.cooldowns], ['防御の残りターン', (data) => data.run.battle.guardTurns],
  ['敵HP', (data) => data.run.battle.combat.enemies.map((enemy) => enemy.hp)], ['敵座標', (data) => data.run.battle.combat.enemies.map((enemy) => enemy.position)],
  ['敵状態異常', (data) => data.run.battle.combat.enemies.map((enemy) => enemy.statuses)], ['攻撃予告', (data) => data.run.battle.combat.enemies.map((enemy) => enemy.warning)],
  ['宝箱配置', (data) => data.run.battle.loot.chests], ['所持品・装備', (data) => data.player],
  ['地形・外観シード', (data) => data.stocks],
]) test(`探索途中の${name}を変更せず復元する`, () => {
  const data = snapshot(fixture()); assert.deepEqual(select(readSaveData(JSON.parse(JSON.stringify(data)))), select(data))
})
test('最終階のボス状態を初期化せず復元する', () => {
  const f = fixture(true); const boss = f.state.combat.enemies.find((enemy) => enemy.isBoss); boss.hp -= 2; boss.discovered = true
  assert.deepEqual(restored(f).combat.enemies.find((enemy) => enemy.isBoss), boss)
})
test('ロードだけではターン・CD・敵行動・HPが変化しない', () => {
  const f = fixture(); const before = structuredClone(f.state)
  assert.deepEqual(restored(f), before); assert.deepEqual(restored(f), before)
})
test('プレイヤーを探索データに重複保存せず、開始Lvと継続効果を維持する', () => {
  const f = fixture(); const run = captureRun(1, 1, f.state, 20)
  const data = readSaveData(createSaveData(f.state.player, f.stocks, new Date(), run))
  assert.equal(data.run.startLevel, 20)
  assert.equal('player' in data.run.battle, false)
  assert.equal('levelNotices' in data.run.battle, false)
  assert.equal('notices' in data.run.battle.loot, false)
  assert.equal(data.run.battle.guardTurns, 2)
})
function approach(f, target) {
  const floor = f.generated.floors[f.floor - 1]
  const position = [{ x: target.x - 1, y: target.y }, { x: target.x + 1, y: target.y }, { x: target.x, y: target.y - 1 }, { x: target.x, y: target.y + 1 }].find((position) => map.isPassable(floor.map, position) && !f.state.combat.enemies.some((enemy) => enemy.position.x === position.x && enemy.position.y === position.y))
  assert.ok(position); f.state.combat.position = position
}
test('開封・取得装備を一括復元し、同じ宝箱から再取得できない', () => {
  const f = fixture(); const chest = f.state.loot.chests[0]; approach(f, chest.position)
  f.state = loot.openLootChest(f.state, 1, chest.position, f.generated, () => .2, () => 'saved-chest-item')
  const loaded = restored(f)
  assert.equal(loaded.loot.chests[0].opened, true)
  assert.equal(loaded.loot.items[0].id, 'saved-chest-item')
  assert.equal(loaded.player.inventory.filter((item) => item.id === 'saved-chest-item').length, 1)
  assert.equal(loot.openLootChest(loaded, 1, chest.position, f.generated, () => .2), loaded)
})
test('撃破とドロップの記録を復元し、報酬を再取得できない', () => {
  const f = fixture(); const enemy = f.state.combat.enemies[0]
  enemy.hp = 1; enemy.statuses = { poison: 0, burn: 0, slow: 0, stun: 0 }; enemy.warning = null
  approach(f, enemy.position)
  const attacked = battle.attackWithWeapon(f.state, enemy.position, f.generated.floors[0].map, () => 1)
  f.state = loot.resolveEnemyLoot(f.state, attacked, f.generated, () => 0, () => 'saved-drop')
  const loaded = restored(f)
  assert.ok(!loaded.combat.enemies.some((candidate) => candidate.id === enemy.id))
  assert.ok(loaded.loot.resolvedEnemyIds.includes(enemy.id))
  assert.equal(loaded.loot.items[0].id, 'saved-drop')
  assert.deepEqual(loot.resolveEnemyLoot(loaded, loaded, f.generated, () => 0), loaded)
  assert.equal(loaded.experienceEarned, player.enemyExperience(enemy.level, false))
})
test('階段移動後の現在階・開始位置と持越しCD・防御を復元する', () => {
  const f = fixture(); f.state.combat.position = f.generated.floors[0].stairs
  const advanced = runLogic.advanceDungeonRun({ currentFloor: 1, battle: f.state }, f.generated)
  f.floor = 2; f.state = advanced.run.battle; f.stocks[0].highestFloor = 2; f.stocks[0].totalFloorsKnown = true
  assert.deepEqual(restored(f), f.state); assert.equal(snapshot(f).run.floor, 2)
})
for (const reason of ['帰還', '死亡', 'クリア']) test(`${reason}後は所持品・経験値を保持し探索中データを残さない`, () => {
  const f = fixture(reason === 'クリア'); if (reason === '死亡') f.state.player.currentHp = 0
  if (reason === 'クリア') f.stocks[0].cleared = true
  const data = readSaveData(createSaveData(f.state.player, f.stocks))
  assert.equal(data.run, null); assert.deepEqual(data.player, f.state.player)
})
test('v1を町のv2へ移行し、装備と能力値を二重適用しない', () => {
  const f = fixture(); const legacy = { schemaVersion: 1, savedAt: new Date().toISOString(), player: f.state.player, stocks: f.stocks }
  const migrated = readSaveData(legacy)
  assert.equal(migrated.schemaVersion, 2); assert.equal(migrated.run, null)
  assert.deepEqual(migrated.player, legacy.player); assert.deepEqual(migrated.stocks, legacy.stocks)
  assert.deepEqual(player.calculateStats(migrated.player), player.calculateStats(legacy.player))
})
test('探索の不整合なHP・敵ID・死亡敵・CD・宝箱・報酬を拒否する', () => {
  for (const mutate of [
    (data) => { data.run.floor = 15 }, (data) => { data.run.stockId = 3 }, (data) => { data.run.battle.combat.playerHp -= 1 },
    (data) => { data.run.battle.combat.position = { x: -1, y: 0 } }, (data) => { data.run.battle.cooldowns.unknown = 1 },
    (data) => { data.run.battle.combat.enemies[0].id = 'unknown' }, (data) => { data.run.battle.combat.enemies[0].hp = 0 },
    (data) => { data.run.battle.combat.enemies.pop() }, (data) => { data.run.battle.loot.chests[0].position.x = 20 },
    (data) => { data.run.battle.loot.resolvedEnemyIds = ['unknown'] }, (data) => { data.run.battle.combat.enemies[0].warning.remaining = 99 },
  ]) { const data = snapshot(fixture()); mutate(data); assert.throws(() => readSaveData(data), /破損/) }
})
const tick = () => new Promise((resolve) => setImmediate(resolve))
function repository(initial) {
  let value = initial; const writes = []; let release; let fail = false
  return { writes, get value() { return value }, set fail(value) { fail = value }, release: () => release(),
    read: async () => structuredClone(value),
    write: async (data) => { writes.push(data); await new Promise((resolve) => { release = resolve }); if (fail) throw new Error('failed'); value = structuredClone(data) },
  }
}
test('古い実行中保存の後に最新要求を保存し、中間の要求はまとめる', async () => {
  const data = snapshot(fixture()); const repo = repository(); const queue = new SaveQueue(repo)
  const first = queue.autosave(data); await tick()
  const middle = queue.autosave({ ...data, savedAt: '2026-10-24T00:00:00Z' })
  const newest = queue.autosave({ ...data, savedAt: '2026-10-25T00:00:00Z' })
  repo.release(); await first; assert.equal(await middle, null); await tick(); repo.release(); await newest
  assert.equal(repo.writes.length, 2); assert.equal(repo.value.savedAt, '2026-10-25T00:00:00Z')
})
test('自動保存と手動保存は同じ列を使い、古い状態を最後に書かない', async () => {
  const data = snapshot(fixture()); const repo = repository(); const operations = new SaveOperations(repo, () => true)
  const manual = operations.save(data.player, data.stocks, true)
  const auto = operations.queue.autosave(data)
  await tick(); repo.release(); await manual; await tick(); repo.release(); await auto
  assert.deepEqual(repo.value, data)
})
test('ロード開始で未着手保存を破棄し、ロード中の書込みを抑止する', async () => {
  const data = snapshot(fixture()); const repo = repository(data); const queue = new SaveQueue(repo)
  const saving = queue.autosave(data); await tick()
  const stale = queue.autosave({ ...data, savedAt: '2026-10-25T00:00:00Z' })
  const loading = queue.load(); assert.equal(await queue.autosave(data), null)
  repo.release(); await saving; assert.equal(await stale, null)
  assert.deepEqual(await loading, data); assert.equal(repo.writes.length, 1)
})
test('終了前の保存を待ってから終了済み状態を保存する', async () => {
  const data = snapshot(fixture()); const repo = repository(); const queue = new SaveQueue(repo)
  const playing = queue.autosave(data); await tick()
  const ended = queue.autosave({ ...data, run: null }); repo.release(); await playing; await tick(); repo.release(); await ended
  assert.equal(repo.value.run, null)
})
test('保存失敗は旧データを保持し、後続の再試行を妨げない', async () => {
  const data = snapshot(fixture()); const repo = repository(data); const queue = new SaveQueue(repo); repo.fail = true
  const saving = queue.autosave({ ...data, run: null }); const rejected = assert.rejects(saving)
  await tick(); repo.release(); await rejected; assert.deepEqual(repo.value, data)
  repo.fail = false; const retry = queue.autosave({ ...data, run: null }); await tick(); repo.release(); await retry
  assert.equal(repo.value.run, null)
})
test('要求後の参照先変更では保存スナップショットを書き換えられない', async () => {
  const data = snapshot(fixture()); const repo = repository(); const queue = new SaveQueue(repo)
  const expected = structuredClone(data); const saving = queue.autosave(data)
  data.player.currentHp = 1; data.run.battle.combat.turn = 99
  await tick(); repo.release(); await saving
  assert.deepEqual(repo.value, expected)
})
test('手動上書きをキャンセルしても先行する自動保存は失われない', async () => {
  const data = snapshot(fixture()); const repo = repository(data); const operations = new SaveOperations(repo, () => true)
  const auto = operations.queue.autosave(data)
  const manual = operations.save(data.player, data.stocks, false)
  await tick(); assert.equal(repo.writes.length, 1); repo.release(); await auto
  assert.equal(await manual, null); assert.deepEqual(repo.value, data)
})
