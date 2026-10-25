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
const player = withEquipmentFixture(await load('game/player')); const dungeon = await load('game/dungeon')
const { createSaveData, readSaveData } = await load('persistence/saveData')
const { SaveOperations } = await load('persistence/saveOperations')
const { createSaveRepository } = await load('persistence/saveStorage')
function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 } }
function fixture() {
  let character = player.createPlayerState()
  character = { ...character, level: 30, experience: 17, job: 'warrior' }
  character = player.equipItem(character, 'test-poison-sword')
  character = player.equipItem(character, 'test-light-armor')
  character = player.equipItem(character, 'test-accessory-a'); character = player.equipItem(character, 'test-accessory-b')
  character = player.toggleFavorite(character, 'test-light-armor'); character.currentHp = 83
  const stocks = dungeon.createDungeonStocks().map((stock, index) => ({ ...stock, dungeon: dungeon.createDungeon(7 + index, stock.theme, random(81 + index)), highestFloor: 1 }))
  stocks[1].highestFloor = stocks[1].dungeon.totalFloors; stocks[1].totalFloorsKnown = true; stocks[1].cleared = true
  return createSaveData(character, stocks, new Date('2026-10-23T10:00:00.000Z'))
}
const valid = fixture()
const clone = () => structuredClone(valid)
function legacyItem(item) {
  const { statMultiplier, effectRate: _rate, legacySkillPower: _power, skillLevels: _levels, specialEffectLevel: _effectLevel, ...old } = item
  return { ...old, rarity: ({ 1: 'common', 1.25: 'rare', 1.5: 'epic', 2: 'legendary' })[statMultiplier] }
}

test('旧試験装備は固定IDと専用フラグの両方で除去し、正規装備・育成・記録を維持する', () => {
  const old = clone()
  old.player.inventory.forEach((item) => { if (item.id.startsWith('test-')) item.testOnly = true })
  old.player.currentHp = player.calculateStats(old.player).maxHp
  const original = structuredClone(old)
  const restored = readSaveData(old)
  assert.deepEqual(restored.player.inventory.map((item) => item.id), ['initial-sword', 'initial-armor'])
  assert.deepEqual(restored.player.equipment, { weapon: null, armor: null, accessory1: null, accessory2: null })
  assert.equal(restored.player.currentHp, player.calculateStats(restored.player).maxHp)
  assert.equal(restored.player.level, old.player.level); assert.equal(restored.player.experience, old.player.experience); assert.equal(restored.player.job, old.player.job)
  assert.deepEqual(restored.stocks, old.stocks); assert.deepEqual(old, original)
  assert.equal(restored.schemaVersion, 8); assert.deepEqual(readSaveData(restored), restored)
  const { treasures: _treasures, ...legacyPlayer } = old.player
  const legacyLoaded = readSaveData({ ...old, schemaVersion: 1, player: { ...legacyPlayer, inventory: legacyPlayer.inventory.map(legacyItem) } })
  assert.equal(legacyLoaded.player.level, restored.player.level)
  assert.deepEqual(legacyLoaded.player.inventory.map((item) => item.id), restored.player.inventory.map((item) => item.id))
  assert.equal(legacyLoaded.player.inventory[0].basePhysical, player.weaponBaseAttack(1, 'sword'))
})
test('名前・ID・専用フラグだけでは装備を削除せず、既存HPと正規装備の性能を維持する', () => {
  const data = clone()
  data.player.inventory.push({ ...data.player.inventory[0], id: 'generated-test-name', name: '試験用の槍', testOnly: true })
  assert.deepEqual(readSaveData(data), data)
})
function memoryRepository(initial = valid) {
  let value = structuredClone(initial)
  return { read: async () => structuredClone(value), write: async (next) => { value = structuredClone(next) } }
}

test('Lv・経験値・HP・職業をJSON互換スナップショットへ保存・復元する', () => {
  const restored = readSaveData(JSON.parse(JSON.stringify(valid)))
  assert.deepEqual(restored.player, valid.player)
  assert.equal(restored.player.level, 30); assert.equal(restored.player.experience, 17); assert.equal(restored.player.currentHp, 83); assert.equal(restored.player.job, 'warrior')
  assert.equal(restored.savedAt, '2026-10-23T10:00:00.000Z')
})
test('全所持品・装備4枠・ID・レアリティ・お気に入りを維持する', () => {
  const restored = readSaveData(valid)
  assert.deepEqual(restored.player.inventory, valid.player.inventory)
  assert.deepEqual(restored.player.equipment, valid.player.equipment)
  assert.equal(restored.player.inventory.find((item) => item.id === 'test-light-armor').favorite, true)
})
test('特殊効果と付与スキルを再抽選せず、能力値を二重加算しない', () => {
  const restored = readSaveData(valid)
  assert.equal(player.equippedWeapon(restored.player).specialEffect, 'poison')
  assert.deepEqual(player.availableSkills(restored.player), player.availableSkills(valid.player))
  assert.deepEqual(player.calculateStats(restored.player), player.calculateStats(valid.player))
})
test('3ストックの地形・初期敵・ボス・外観シード・攻略記録を保持する', () => {
  const restored = readSaveData(valid)
  assert.deepEqual(restored.stocks, valid.stocks)
  for (const stock of restored.stocks) {
    assert.equal(dungeon.validateDungeon(stock.dungeon), true)
    assert.ok(Number.isInteger(stock.dungeon.visualSeed))
  }
  assert.equal(restored.stocks[1].cleared, true)
})
test('未生成のストックを保存でき、探索中の状態をスナップショットに含めない', () => {
  const data = createSaveData(player.createPlayerState(), dungeon.createDungeonStocks())
  assert.equal(data.stocks.filter((stock) => stock.dungeon === null).length, 3)
  assert.deepEqual(Object.keys(data).sort(), ['player', 'run', 'savedAt', 'schemaVersion', 'stocks'])
  for (const key of ['combat', 'loot', 'cooldowns', 'activeRun', 'turn']) assert.equal(key in data, false)
})
test('対応外バージョンを識別して拒否する', () => {
  for (const schemaVersion of [undefined, 0, 9, '1']) assert.throws(() => readSaveData({ ...valid, schemaVersion }), /バージョン/)
})
test('不正なLv・経験値・HP・職業・保存日時を拒否する', () => {
  for (const [key, value] of [['level', 0], ['level', 1.5], ['experience', -1], ['experience', 999999], ['currentHp', -1], ['currentHp', 999999], ['job', 'unknown']]) {
    const data = clone(); data.player[key] = value; assert.throws(() => readSaveData(data), /破損/)
  }
  assert.throws(() => readSaveData({ ...valid, savedAt: 'invalid' }), /破損/)
})
test('装備配列の破損・重複ID・不明な装備とスキル・特殊効果IDを拒否する', () => {
  for (const mutate of [
    (data) => { data.player.inventory = null },
    (data) => { data.player.inventory.push(data.player.inventory[0]) },
    (data) => { data.player.inventory[0].subtype = 'unknown' },
    (data) => { data.player.inventory[0].skills = ['unknown'] },
    (data) => { data.player.inventory[0].specialEffect = 'unknown' },
    (data) => { data.player.inventory[0].rarity = 'unknown' },
    (data) => { data.player.inventory[0].statMultiplier = 99 },
    (data) => { data.player.inventory[0].effectRate = -1 },
    (data) => { data.player.inventory[0].specialEffect = 'poison'; data.player.inventory[0].specialEffectLevel = 6 },
    (data) => { data.player.inventory.find((item) => item.id === 'test-light-armor').skillLevels.strongStrike = 0 },
  ]) { const data = clone(); mutate(data); assert.throws(() => readSaveData(data), /破損/) }
})
test('装備中IDの参照・カテゴリ・重複装備・職業条件を検証する', () => {
  for (const mutate of [
    (data) => { data.player.equipment.weapon = 'missing' },
    (data) => { data.player.equipment.weapon = 'initial-armor' },
    (data) => { data.player.equipment.accessory2 = data.player.equipment.accessory1 },
    (data) => { data.player.equipment.weapon = 'test-bow' },
    (data) => { delete data.player.equipment.armor },
  ]) { const data = clone(); mutate(data); assert.throws(() => readSaveData(data), /破損/) }
})
test('ストック構造・生成データ・地形・敵・シード・到達記録の破損を拒否する', () => {
  for (const mutate of [
    (data) => data.stocks.pop(),
    (data) => { data.stocks[0].id = 2 },
    (data) => { data.stocks[0].dungeon.floors[0].map[0][0] = 'unknown' },
    (data) => { data.stocks[0].dungeon.floors[0].stairs.x = 20 },
    (data) => { data.stocks[0].dungeon.floors[0].enemies[0].kind = 'unknown' },
    (data) => { data.stocks[0].dungeon.visualSeed = -1 },
    (data) => { data.stocks[0].highestFloor = 16 },
    (data) => { data.stocks[0].dungeon = {} },
  ]) { const data = clone(); mutate(data); assert.throws(() => readSaveData(data), /破損/) }
})
test('関数・非有限値・循環参照を持つデータは保存しない', () => {
  for (const value of [() => 1, Infinity, new Date()]) assert.throws(() => readSaveData({ ...valid, extra: value }), /破損/)
  const data = clone(); data.extra = data; assert.throws(() => readSaveData(data), /破損/)
  const sparse = clone(); delete sparse.stocks[0].dungeon.floors[0].map[0][0]; assert.throws(() => readSaveData(sparse), /破損/)
})
test('同じセーブを繰り返しロードしても所持品・能力値・報酬が増殖しない', async () => {
  const operations = new SaveOperations(memoryRepository(), () => true)
  const first = await operations.load(true); const second = await operations.load(true)
  assert.deepEqual(first, second); assert.notEqual(first.player, second.player)
  first.player.inventory.pop(); assert.deepEqual(await operations.load(true), second)
})
test('ロード失敗と破損拒否では現在状態と保存済みデータを変更しない', async () => {
  const current = clone()
  for (const repository of [
    { read: async () => { throw new Error('read failed') }, write: async () => assert.fail() },
    memoryRepository({ ...valid, schemaVersion: 99 }),
  ]) { const operations = new SaveOperations(repository, () => true); await assert.rejects(operations.load(true)); assert.deepEqual(current, valid); assert.equal(operations.busy, false) }
})
test('保存失敗はrejectし、ゲーム状態と旧セーブを保持する', async () => {
  const repository = memoryRepository(); repository.write = async () => { throw new Error('quota') }
  const operations = new SaveOperations(repository, () => true)
  await assert.rejects(operations.save(valid.player, valid.stocks, true), /quota/)
  assert.deepEqual(await repository.read(), valid); assert.equal(operations.busy, false)
})
test('町以外ではセーブ・ロードを実行せずリポジトリに触れない', async () => {
  const operations = new SaveOperations({ read: async () => assert.fail(), write: async () => assert.fail() }, () => false)
  await assert.rejects(operations.save(valid.player, valid.stocks, true), /町/)
  await assert.rejects(operations.load(true), /町/)
})
test('上書き確認・ロード確認のキャンセルで保存済みデータを変えない', async () => {
  const repository = memoryRepository(); const operations = new SaveOperations(repository, () => true)
  assert.equal(await operations.save(valid.player, valid.stocks, false), null)
  assert.equal(await operations.load(false), null)
  assert.deepEqual(await repository.read(), valid)
})
test('保存中の連打・セーブとロードの重複実行を防ぐ', async () => {
  let release
  const operations = new SaveOperations({ read: async () => undefined, write: () => new Promise((resolve) => { release = resolve }) }, () => true)
  const saving = operations.save(valid.player, valid.stocks, false)
  await assert.rejects(operations.save(valid.player, valid.stocks, true), /処理中/)
  await assert.rejects(operations.load(true), /処理中/)
  release(); await saving; assert.equal(operations.busy, false)
})

// IndexedDBの完了イベント順を注入し、put成功後のabortも再現する。
function fakeFactory(initial) {
  let stored = initial; let transaction; let staged; let closed = false
  const database = { close: () => { closed = true }, transaction: () => {
    transaction = { objectStore: () => ({
      get: () => { const request = {}; queueMicrotask(() => { request.result = stored; request.onsuccess(); transaction.oncomplete() }); return request },
      put: (data) => { staged = data; const request = {}; queueMicrotask(() => { request.onsuccess() }); return request },
      delete: () => { staged = undefined; const request = {}; queueMicrotask(() => { request.onsuccess() }); return request },
    }) }; return transaction
  } }
  return { factory: { open: () => { const request = {}; queueMicrotask(() => { request.result = database; request.onsuccess() }); return request } },
    commit: () => { stored = staged; transaction.oncomplete() }, abort: () => transaction.onabort(), value: () => stored, closed: () => closed }
}
test('IndexedDBの単一スロット削除はトランザクション完了後に確定し、abort時は旧セーブを保持する', async () => {
  const fake = fakeFactory(valid); const repository = createSaveRepository(fake.factory)
  let completed = false
  const deletion = repository.remove().then(() => { completed = true })
  await new Promise((resolve) => setImmediate(resolve)); assert.equal(completed, false)
  assert.deepEqual(fake.value(), valid)
  fake.abort(); await assert.rejects(deletion)
  assert.deepEqual(fake.value(), valid)
  const retry = repository.remove()
  await new Promise((resolve) => setImmediate(resolve)); fake.commit(); await retry
  assert.equal(await repository.read(), undefined)
})
test('IndexedDBはput成功後もトランザクション完了まで成功にしない', async () => {
  const fake = fakeFactory(undefined); const repository = createSaveRepository(fake.factory)
  let completed = false; const promise = repository.write(valid).then(() => { completed = true })
  await new Promise((resolve) => setImmediate(resolve)); assert.equal(completed, false)
  fake.commit(); await promise; assert.equal(completed, true); assert.equal(fake.closed(), true)
  assert.deepEqual(await repository.read(), valid)
})
test('IndexedDBはput成功後にabortしても旧セーブを維持する', async () => {
  const fake = fakeFactory(valid); const repository = createSaveRepository(fake.factory)
  const promise = repository.write({ ...valid, savedAt: '2026-10-24T00:00:00.000Z' })
  const rejected = assert.rejects(promise, /保存できません/)
  await new Promise((resolve) => setImmediate(resolve)); fake.abort(); await rejected
  assert.deepEqual(fake.value(), valid); assert.equal(fake.closed(), true)
})
test('初回セーブは確認なしで保存し、不在データのロードを拒否する', async () => {
  const repository = memoryRepository(undefined); const operations = new SaveOperations(repository, () => true)
  // デフォルト引数を避け、存在しないレコードを明示する。
  repository.read = async () => undefined
  await assert.rejects(operations.load(true), /ありません/)
  const data = await operations.save(valid.player, valid.stocks, false)
  assert.deepEqual(data.player, valid.player); assert.equal(data.schemaVersion, 8)
})
