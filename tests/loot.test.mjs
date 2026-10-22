import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

// 既存テストと同じTypeScript変換。型専用依存は除去し、実行時依存だけを解決する。
const modules = new Map()
async function load(path) {
  if (modules.has(path.href)) return modules.get(path.href)
  let output = ts.transpileModule(await readFile(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  for (const match of [...output.matchAll(/from '(\.[^']+)'/g)]) {
    const dependency = await load(new URL(match[1] + '.ts', path))
    output = output.replace(match[0], `from '${dependency}'`)
  }
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`
  modules.set(path.href, url); return url
}
const moduleAt = async (path) => import(await load(new URL(path, import.meta.url)))
const loot = await moduleAt('../src/game/loot.ts')
const battle = await moduleAt('../src/game/battle.ts')
const player = await moduleAt('../src/game/player.ts')
const combat = await moduleAt('../src/game/combat/combat.ts')
const runs = await moduleAt('../src/game/dungeonRun.ts')

const map = Array.from({ length: 20 }, () => Array(20).fill('grass'))
function dungeon(totalFloors = 6) {
  return { version: 1, level: 10, featuredCategory: 'weapon', totalFloors, enemyKinds: ['goblin', 'boar', 'ghost'], bossKind: 'goblin', floors: Array.from({ length: totalFloors }, (_, i) => ({ floor: i + 1, map, start: { x: 2, y: 17 }, stairs: { x: 17, y: 2 }, chestCandidate: i === totalFloors - 1 ? null : { x: 10, y: 10 }, enemies: [{ id: `f${i + 1}-enemy`, kind: 'goblin', level: 1, position: { x: 8, y: 8 }, isBoss: i === totalFloors - 1 }] })) }
}
function sequence(values, fallback = .2) { let i = 0; return () => values[i++] ?? fallback }
function state(enemies = []) { const value = battle.createBattleState(player.createPlayerState(), enemies); return { ...value, loot: loot.createLootState(dungeon(), () => .2) } }
function enemy(id, boss = false) { return { ...combat.createEnemy(id, 'goblin', 1, { x: 2, y: 16 }, boss), hp: 1 } }
const config = dungeon()

test('宝箱個数の全確率境界0〜4を検証する', () => {
  for (const [value, expected] of [[0, 0], [.099999, 0], [.1, 1], [.449999, 1], [.45, 2], [.799999, 2], [.8, 3], [.949999, 3], [.95, 4], [.999999, 4]]) assert.equal(loot.rollChestCount(value), expected)
})
test('宝箱は階数で上限補正し、通常階の固定候補へ重複なしで配置する', () => {
  for (const floors of [1, 2, 3, 15]) {
    const generated = dungeon(floors); const result = loot.createLootState(generated, () => .99)
    assert.equal(result.chests.length, Math.min(4, floors - 1)); assert.equal(new Set(result.chests.map((chest) => chest.floor)).size, result.chests.length)
    for (const chest of result.chests) { assert.ok(chest.floor < floors); assert.deepEqual(chest.position, generated.floors[chest.floor - 1].chestCandidate); assert.equal(chest.opened, false) }
  }
})
test('再探索では出現数・階を再抽選し、開封・報酬・撃破記録を持ち込まない', () => {
  const first = loot.createLootState(config, sequence([.8, 0, 0, 0])); first.chests[0].opened = true
  const second = loot.createLootState(config, sequence([.1, .99])); assert.equal(second.chests.length, 1); assert.notEqual(first.chests[0].floor, second.chests[0].floor)
  assert.deepEqual(second.items, []); assert.deepEqual(second.resolvedEnemyIds, []); assert.equal(second.chests[0].opened, false)
})
test('開封は上下左右のみ・0ターン・HPとCD維持・自動追加・二重開封禁止', () => {
  const initial = state(); initial.loot.chests = [{ floor: 1, position: { x: 10, y: 10 }, opened: false }]; initial.cooldowns = { strongStrike: 2 }
  for (const position of [{ x: 10, y: 8 }, { x: 9, y: 9 }, { x: 10, y: 10 }]) assert.equal(loot.openLootChest({ ...initial, combat: { ...initial.combat, position } }, 1, { x: 10, y: 10 }, config).loot, initial.loot)
  for (const position of [{ x: 10, y: 9 }, { x: 9, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 11 }]) {
    const adjacent = { ...initial, combat: { ...initial.combat, position } }
    const opened = loot.openLootChest(adjacent, 1, { x: 10, y: 10 }, config, () => .2, () => 'chest-item')
    assert.equal(opened.combat, adjacent.combat); assert.deepEqual(opened.cooldowns, initial.cooldowns); assert.equal(opened.player.currentHp, initial.player.currentHp)
    assert.equal(opened.player.inventory.length, initial.player.inventory.length + 1); assert.equal(opened.loot.items.length, 1); assert.equal(opened.loot.notices.length, 1)
    assert.equal(loot.openLootChest(opened, 1, { x: 10, y: 10 }, config), opened)
  }
  assert.equal(loot.openLootChest(initial, 2, { x: 10, y: 10 }, config), initial)
})
test('レアリティ60/25/12/3と得意カテゴリ50/25/25の境界', () => {
  for (const [value, rarity] of [[0, 'common'], [.599999, 'common'], [.6, 'rare'], [.849999, 'rare'], [.85, 'epic'], [.969999, 'epic'], [.97, 'legendary'], [.9999, 'legendary']]) assert.equal(loot.rollRarity(value), rarity)
  for (const featured of ['weapon', 'armor', 'accessory']) {
    const rest = ['weapon', 'armor', 'accessory'].filter((category) => category !== featured)
    for (const [value, expected] of [[0, featured], [.499999, featured], [.5, rest[0]], [.749999, rest[0]], [.75, rest[1]], [.99999, rest[1]]]) assert.equal(loot.rollCategory(featured, value), expected)
  }
})
test('装備Lv±5・最低1・ID一意・JSON化・同名基本値の再現', () => {
  const ids = new Set()
  for (let i = 0; i < 100; i += 1) { const item = loot.generateEquipment(config, () => (i + .5) / 100); assert.ok(item.level >= 5 && item.level <= 15); ids.add(item.id); assert.deepEqual(JSON.parse(JSON.stringify(item)), item); assert.equal(item.testOnly, false) }
  assert.equal(ids.size, 100)
  assert.equal(loot.generateEquipment(config, sequence([0, 0, 0, 0])).level, 5)
  assert.equal(loot.generateEquipment(config, sequence([0, 0, .999999, .999999])).level, 15)
  assert.equal(loot.generateEquipment({ ...config, level: 1 }, () => 0).level, 1)
  const a = loot.generateEquipment(config, sequence([0, .7, .5, .5, 0, 0])); const b = loot.generateEquipment(config, sequence([0, .7, .5, .5, 0, .99]))
  assert.equal(a.name, b.name); assert.equal(a.level, b.level); assert.equal(a.rarity, b.rarity); assert.deepEqual(player.itemBonuses(a), player.itemBonuses(b)); assert.notEqual(a.specialEffect, b.specialEffect)
})
test('武器8特殊効果と防具の重装1・軽装3スキルを付与する', () => {
  const effects = new Set()
  for (let i = 0; i < 8; i += 1) effects.add(loot.generateEquipment(config, sequence([0, 0, .5, .5, 0, (i + .1) / 8])).specialEffect)
  assert.equal(effects.size, 8)
  for (const [subtypeRoll, count] of [[0, 1], [.25, 3], [.5, 1], [.75, 3]]) {
    const item = loot.generateEquipment({ ...config, featuredCategory: 'armor' }, sequence([0, 0, .5, .5, subtypeRoll]))
    assert.equal(item.skills.length, count); assert.equal(new Set(item.skills).size, count); assert.equal(item.specialEffect, null)
  }
})
test('アクセサリーは50%スキル・50%能力値で、名前ごとの基礎補正が同一', () => {
  const cfg = { ...config, featuredCategory: 'accessory' }
  const skill = loot.generateEquipment(cfg, sequence([0, 0, .5, .5, .499999])); assert.equal(skill.skills.length, 1); assert.equal(skill.baseHp + skill.basePhysical + skill.baseMagic, 0)
  for (const [roll, bonus] of [[0, [8, 0, 0]], [.4, [0, 2, 0]], [.9, [0, 0, 2]]]) {
    const item = loot.generateEquipment(cfg, sequence([0, 0, .5, .5, .5, roll])); assert.equal(item.skills.length, 0); assert.deepEqual([item.baseHp, item.basePhysical, item.baseMagic], bonus)
  }
})
test('通常敵ドロップ5%境界・ボス100%・失敗抽選も1体につき1回', () => {
  for (const [roll, count] of [[.049999, 1], [.05, 0]]) {
    const before = state([enemy('normal')]); const after = { ...before, combat: { ...before.combat, enemies: [] } }
    const resolved = loot.resolveEnemyLoot(before, after, config, sequence([roll]), () => 'drop')
    assert.equal(resolved.loot.items.length, count); assert.deepEqual(resolved.loot.resolvedEnemyIds, ['normal'])
    assert.equal(loot.resolveEnemyLoot(before, resolved, config, () => { throw Error('再抽選'); }), resolved)
  }
  const before = state([enemy('boss', true)]); const after = { ...before, combat: { ...before.combat, enemies: [] } }
  assert.equal(loot.resolveEnemyLoot(before, after, config, () => .99).loot.items.length, 1)
})
test('通常攻撃・毒・燃焼・範囲同時撃破の経験値とドロップを独立加算する', () => {
  let before = state([enemy('direct')]); let after = battle.attackWithWeapon(before, { x: 2, y: 16 }, map)
  after = loot.resolveEnemyLoot(before, after, config, () => 0); assert.equal(after.experienceEarned, 20); assert.equal(after.loot.items.length, 1)
  for (const effect of ['poison', 'burn']) {
    const target = { ...enemy(effect), statuses: { poison: 0, burn: 0, slow: 0, stun: 0, [effect]: 1 } }
    before = state([target]); after = battle.moveBattlePlayer(before, 'right', map); after = loot.resolveEnemyLoot(before, after, config, () => 0)
    assert.equal(after.combat.enemies.length, 0); assert.equal(after.experienceEarned, 20); assert.equal(after.loot.items.length, 1)
  }
  before = state([enemy('a'), { ...enemy('b'), position: { x: 3, y: 17 } }]); before.player = player.equipItem(before.player, 'test-short-staff')
  after = battle.attackWithWeapon(before, { x: 2, y: 16 }, map, () => .99); after = loot.resolveEnemyLoot(before, after, config, () => 0)
  assert.equal(after.experienceEarned, 40); assert.equal(after.loot.items.length, 2); assert.equal(after.player.inventory.length, before.player.inventory.length + 2)
})
test('階層移動・死亡・帰還・クリア後に渡すプレイヤーへ獲得装備を保持する', () => {
  const cfg = dungeon(2); let run = runs.startDungeonRun(player.createPlayerState(), cfg)
  run.battle = { ...run.battle, loot: loot.createLootState(cfg, () => .2), combat: { ...run.battle.combat, position: { x: 10, y: 9 } } }
  run.battle = loot.openLootChest(run.battle, 1, { x: 10, y: 10 }, cfg, () => .2, () => 'retained')
  run.battle.combat.position = cfg.floors[0].stairs
  const advanced = runs.advanceDungeonRun(run, cfg).run
  assert.equal(advanced.battle.player.inventory.some((item) => item.id === 'retained'), true); assert.equal(advanced.battle.loot.items.length, 1)
  const attacker = { ...enemy('fatal'), attack: 999, warning: { remaining: 1, cells: [{ x: 3, y: 17 }], direction: 'down', target: { x: 3, y: 17 } } }
  const dead = battle.moveBattlePlayer({ ...advanced.battle, combat: { ...advanced.battle.combat, enemies: [attacker] } }, 'right', map)
  assert.equal(dead.combat.finished, true); assert.equal(dead.player.inventory.some((item) => item.id === 'retained'), true); assert.equal(dead.loot.items.length, 1)
  const cleared = { ...advanced, battle: { ...advanced.battle, combat: { ...advanced.battle.combat, position: cfg.floors[1].stairs, enemies: [] } } }
  assert.equal(runs.advanceDungeonRun(cleared, cfg).cleared, true); assert.equal(cleared.battle.player.inventory.some((item) => item.id === 'retained'), true)
})
test('範囲スキルでの同時撃破も各敵1回のドロップと経験値を取得する', () => {
  let before = state([{ ...enemy('skill-a'), position: { x: 2, y: 15 } }, { ...enemy('skill-b'), position: { x: 3, y: 15 } }])
  before.player = player.equipItem(before.player, 'test-light-robe')
  const attacked = battle.useSkill(before, 'flame', { x: 2, y: 15 }, map)
  const after = loot.resolveEnemyLoot(before, attacked, config, () => 0)
  assert.equal(after.combat.enemies.length, 0); assert.equal(after.experienceEarned, 40); assert.equal(after.loot.items.length, 2)
  assert.equal(new Set(after.loot.items.map((item) => item.id)).size, 2)
  assert.equal(loot.resolveEnemyLoot(before, after, config, () => { throw Error('二重抽選'); }), after)
})
test('結果のレアリティ降順・同レアLv降順・0件を処理し元データを変えない', () => {
  const base = loot.generateEquipment(config, () => .2)
  const items = [{ ...base, id: 'a', rarity: 'rare', level: 10 }, { ...base, id: 'b', rarity: 'legendary', level: 1 }, { ...base, id: 'c', rarity: 'rare', level: 20 }, { ...base, id: 'd', rarity: 'common', level: 30 }]
  assert.deepEqual(loot.sortRewards(items).map((item) => item.id), ['b', 'c', 'a', 'd']); assert.equal(items[0].id, 'a'); assert.deepEqual(loot.sortRewards([]), [])
})
