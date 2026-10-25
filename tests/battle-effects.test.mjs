import assert from 'node:assert/strict'
import test from 'node:test'
import { loadGameModule as load, pwaFixture } from './pwa-fixture.mjs'
const player = await load('game/player'), battle = await load('game/battle'), auto = await load('game/autoCombat')
const { SKILLS } = await load('game/skills'), combat = await load('game/combat/combat')
const { drawBattleEffect } = await load('game/battleEffectDrawing')
const saved = await load('persistence/savedRun'), saves = await load('persistence/saveData')
const point = { x: 10, y: 10 }, target = { x: 11, y: 10 }
const map = Array.from({ length: 20 }, () => Array(20).fill('grass'))
const specials = ['poison', 'burn', 'slow', 'stun', 'knockback', 'critical', 'lifesteal', 'extraAttack']
function state(ids = [], effect = null, subtype = 'sword') {
  const p = player.createPlayerState()
  p.currentHp = 30
  p.inventory[0] = { ...p.inventory[0], subtype, specialEffect: effect, specialEffectLevel: effect ? 3 : null, effectRate: .5 }
  p.inventory[1] = { ...p.inventory[1], skills: ids, skillLevels: Object.fromEntries(ids.map(id => [id, 3])) }
  const enemy = { ...combat.createEnemy('e', 'goblin', 20, target), hp: 1000, maxHp: 1000 }
  return battle.createBattleState(p, [enemy], point)
}

test('指定の攻撃7種類だけCDを2増やし、鈍足・回復・移動・防御は維持する', () => {
  const expected = { strongStrike: 5, magicBolt: 5, piercingShot: 6, shockwave: 7, flame: 8, poisonStrike: 6, stunStrike: 8, slowSpell: 4, smallHeal: 4, largeHeal: 8, dash: 5, guard: 5 }
  assert.deepEqual(Object.fromEntries(Object.entries(SKILLS).map(([id, skill]) => [id, skill.cooldown])), expected)
  const s = state(['strongStrike']); const hit = auto.performAutoAttack(s, map)
  assert.equal(hit.cooldowns.strongStrike, 5)
  const normal = auto.performAutoAttack(hit, map)
  assert.equal(normal.actionNotice.label, '通常攻撃'); assert.equal(normal.cooldowns.strongStrike, 4)
})

test('武器の青枠・通常攻撃・自動対象は新射程と遮蔽を共有する', () => {
  for (const [type, range] of Object.entries({ sword: 1, spear: 2, bow: 3, shortStaff: 2, longStaff: 3 })) {
    const s = state([], null, type)
    s.combat.enemies[0].position = { x: 10 + range, y: 10 }
    assert.ok(battle.getPlayerAttackCells(s.player, point, map).some(p => p.x === 10 + range && p.y === 10))
    assert.equal(battle.selectAutoTarget(s, map)?.id, 'e')
    assert.equal(battle.attackWithWeapon(s, s.combat.enemies[0].position, map).combat.turn, 1)
    s.combat.enemies[0].position.x++
    assert.equal(battle.selectAutoTarget(s, map), null)
    assert.equal(battle.attackWithWeapon(s, s.combat.enemies[0].position, map), s)
    if (['bow', 'shortStaff', 'longStaff'].includes(type)) {
      s.combat.enemies[0].position.x--
      const blocked = structuredClone(map); blocked[10][11] = 'wall'
      assert.equal(battle.selectAutoTarget(s, blocked), null)
      assert.equal(battle.attackWithWeapon(s, s.combat.enemies[0].position, blocked), s)
    }
  }
})

for (const id of Object.keys(SKILLS)) test(`スキル演出は実発動の位置と一致する：${id}`, () => {
  const s = state([id])
  const destination = id === 'dash' ? { x: 10, y: 12 } : SKILLS[id].target === 'self' ? undefined : target
  const next = battle.useSkill(s, id, destination, map)
  const events = next.visualEvents.filter(e => e.kind === 'skill' && e.effect === id)
  assert.equal(events.length, 1)
  assert.deepEqual(events[0].from, point)
  assert.deepEqual(events[0].position, id === 'dash' ? destination : ['self'].includes(SKILLS[id].target) ? point : target)
  if (id.endsWith('Heal')) assert.ok(events[0].value > 0)
  assert.equal(battle.useSkill(next, id, destination, map), next)
  const moved = battle.moveBattlePlayer(next, 'left', map)
  assert.deepEqual(moved.visualEvents, [])
})

test('スキル固有射程と自動選択・実発動を一致させ、範囲攻撃も壁越しに命中しない', () => {
  const s = state(['magicBolt'])
  s.combat.enemies[0].position = { x: 15, y: 10 }
  assert.equal(auto.chooseAutoAction(s, map).skillId, 'magicBolt')
  assert.equal(battle.useSkill(s, 'magicBolt', s.combat.enemies[0].position, map).combat.turn, 1)
  s.combat.enemies[0].position.x = 16
  assert.equal(auto.chooseAutoAction(s, map), null)
  const blocked = structuredClone(map); blocked[10][11] = 'wall'
  const area = state(['flame'])
  area.combat.enemies[0].position = { x: 12, y: 10 }
  area.combat.enemies.push({ ...area.combat.enemies[0], id: 'visible', position: { x: 11, y: 9 } })
  const result = battle.useSkill(area, 'flame', { x: 11, y: 9 }, blocked)
  assert.equal(result.combat.enemies.find(e => e.id === 'e').hp, 1000)
  assert.ok(result.combat.enemies.find(e => e.id === 'visible').hp < 1000)
  assert.deepEqual(result.visualEvents.map(e => e.position), [{ x: 11, y: 9 }])
  const wave = state(['shockwave'])
  assert.equal(auto.chooseAutoAction(wave, blocked), null, '衝撃波の自動判定にも現在階の地形を使う')
})

for (const id of specials) test(`特殊効果は実発動時だけ演出を作る：${id}`, () => {
  const s = state([], id)
  const proc = battle.attackWithWeapon(s, target, map, () => 0)
  assert.equal(proc.visualEvents.filter(e => e.kind === 'special' && e.effect === id).length, 1)
  assert.deepEqual(battle.attackWithWeapon(s, target, map, () => 1).visualEvents, [])
  assert.equal(s.visualEvents, undefined)
})

test('無効状態・死亡・移動不可・回復上限では架空の発動演出を出さず、再付与は表示する', () => {
  const immune = state([], 'stun'); immune.combat.enemies[0].statuses = { poison: 0, burn: 0, slow: 0, stun: 0, stunRecovery: 2 }
  assert.deepEqual(battle.attackWithWeapon(immune, target, map, () => 0).visualEvents, [])
  for (const id of ['poison', 'burn', 'slow', 'stun', 'knockback', 'extraAttack']) {
    const dying = state([], id); dying.combat.enemies[0].hp = 1
    assert.deepEqual(battle.attackWithWeapon(dying, target, map, () => 0).visualEvents, [])
  }
  const stuck = state([], 'knockback'), blocked = structuredClone(map); blocked[10][12] = 'wall'
  assert.deepEqual(battle.attackWithWeapon(stuck, target, blocked, () => 0).visualEvents, [])
  const full = state([], 'lifesteal'); full.player.currentHp = player.calculateStats(full.player).maxHp; full.combat.playerHp = full.player.currentHp
  assert.deepEqual(battle.attackWithWeapon(full, target, map, () => 0).visualEvents, [])
  const refreshed = state([], 'poison'); refreshed.combat.enemies[0].statuses = { poison: 5, burn: 0, slow: 0, stun: 0 }
  assert.equal(battle.attackWithWeapon(refreshed, target, map, () => 0).visualEvents[0].effect, 'poison')
})

test('範囲・追撃は各対象の実際の発動位置を残し、吸血は敵からプレイヤーへ戻る', () => {
  const s = state([], 'extraAttack', 'longStaff')
  s.combat.enemies.push({ ...s.combat.enemies[0], id: 'b', position: { x: 12, y: 10 } })
  const next = battle.attackWithWeapon(s, target, map, () => 0)
  assert.deepEqual(next.visualEvents.map(e => e.position), [target, { x: 12, y: 10 }])
  const damage = player.calculateStats(s.player).magic
  for (const enemy of next.combat.enemies) assert.equal(enemy.hp, 1000 - damage - Math.max(1, Math.floor(damage * 1.3)))
  const drain = battle.attackWithWeapon(state([], 'lifesteal'), target, map, () => 0).visualEvents[0]
  assert.deepEqual(drain.from, target); assert.deepEqual(drain.position, point); assert.ok(drain.value > 0)
  const push = battle.attackWithWeapon(state([], 'knockback'), target, map, () => 0).visualEvents[0]
  assert.deepEqual(push.from, target); assert.equal(push.position.x, 15)
})

test('20種の演出は固有の描画を持ち、同時描画でもCanvas状態を復元する', () => {
  const traces = []
  for (const [kind, ids] of [['skill', Object.keys(SKILLS)], ['special', specials]]) for (const effect of ids) {
    const trace = []
    const context = new Proxy({}, { get: (_, key) => (...args) => trace.push([key, ...args]), set: (_, key, value) => { trace.push([key, value]); return true } })
    drawBattleEffect(context, { kind, effect, position: target, from: point }, .5, { x: 5, y: 5 })
    assert.equal(trace[0][0], 'save'); assert.equal(trace.at(-1)[0], 'restore')
    assert.ok(trace.length > 10)
    assert.ok(trace.some(([operation]) => operation === 'fillRect'))
    assert.equal(trace.some(([operation]) => ['arc', 'lineTo', 'moveTo', 'bezierCurveTo', 'createLinearGradient', 'rotate'].includes(operation)), false, `${kind}:${effect} に滑らかな描画が残っています。`)
    assert.ok(trace.filter(([operation]) => operation === 'fillRect').every(([, ...values]) => values.every(Number.isInteger)), `${kind}:${effect} の矩形が整数座標に揃っていません。`)
    traces.push(JSON.stringify(trace))
  }
  assert.equal(new Set(traces).size, 20)
})

test('特殊ボスの10攻撃パターンも矩形ドットで描き、予告を覆う滑らかな塗りを使わない', () => {
  const patterns = { forest: ['roots', 'sweep', 'surround'], ruins: ['slam', 'cross', 'charge'], castle: ['flameWave', 'burst', 'doubleBurst', 'release'] }
  const traces = []
  for (const [theme, ids] of Object.entries(patterns)) for (const effect of ids) {
    const trace = []
    const context = new Proxy({}, { get: (_, key) => (...args) => trace.push([key, ...args]), set: (_, key, value) => { trace.push([key, value]); return true } })
    drawBattleEffect(context, { kind: 'boss', theme, effect, position: target, from: point }, .5, { x: 5, y: 5 })
    assert.ok(trace.some(([operation]) => operation === 'fillRect'), `${theme}:${effect}`)
    assert.equal(trace.some(([operation]) => ['arc', 'lineTo', 'moveTo', 'bezierCurveTo', 'createLinearGradient', 'rotate'].includes(operation)), false)
    assert.ok(trace.filter(([operation]) => operation === 'fillRect').every(([, ...values]) => values.every(Number.isInteger)))
    assert.ok(trace.some(([key, value]) => key === 'imageSmoothingEnabled' && value === false))
    traces.push(JSON.stringify(trace))
  }
  assert.equal(new Set(traces).size, 10)
})

test('演出情報は保存対象に含めず、再開時のCD・防御・敵状態は維持する', async () => {
  const data = await pwaFixture()
  const restored = saved.restoreBattle(data.player, data.run)
  restored.visualEvents = [{ kind: 'skill', effect: 'guard', position: restored.combat.position, from: restored.combat.position }]
  const run = saved.captureRun(data.run.stockId, data.run.floor, restored, data.run.startLevel)
  assert.equal('visualEvents' in run.battle, false)
  const loaded = saves.readSaveData(saves.createSaveData(restored.player, data.stocks, new Date(), run))
  const resumed = saved.restoreBattle(loaded.player, loaded.run)
  assert.equal(resumed.visualEvents, undefined)
  assert.deepEqual(resumed.cooldowns, restored.cooldowns); assert.deepEqual(resumed.combat, restored.combat)
})
