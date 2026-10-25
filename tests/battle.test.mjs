import { withEquipmentFixture } from './equipment-fixture.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

async function transpile(path) { const source = await readFile(new URL(path, import.meta.url), 'utf8'); return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText }
function url(output) { return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}` }
const mapUrl = url(await transpile('../src/game/forestMap.ts'))
const levelsUrl = url(await transpile('../src/game/effectLevels.ts'))
const playerUrl = url((await transpile('../src/game/player.ts')).replace("'./effectLevels'", `'${levelsUrl}'`))
const skillsOutput = (await transpile('../src/game/skills.ts')).replace("'./player'", `'${playerUrl}'`).replace("'./effectLevels'", `'${levelsUrl}'`)
const skillsUrl = url(skillsOutput)
const combatOutput = (await transpile('../src/game/combat/combat.ts')).replace("'../forestMap'", `'${mapUrl}'`).replace("'../player'", `'${playerUrl}'`)
const combatUrl = url(combatOutput)
const battleOutput = (await transpile('../src/game/battle.ts')).replace("'./forestMap'", `'${mapUrl}'`).replace("'./combat/combat'", `'${combatUrl}'`).replace("'./skills'", `'${skillsUrl}'`).replace("'./player'", `'${playerUrl}'`).replace("'./effectLevels'", `'${levelsUrl}'`)
const battle = await import(url(battleOutput)); const player = withEquipmentFixture(await import(playerUrl)); const combat = await import(combatUrl); const skills = await import(skillsUrl)

function openMap(obstacles = []) { const map = Array.from({ length: 20 }, (_, y) => Array.from({ length: 20 }, (_, x) => x === 0 || y === 0 || x === 19 || y === 19 ? 'wall' : 'grass')); for (const p of obstacles) map[p.y][p.x] = 'wall'; return map }
function enemy(id, x, y, level = 5, boss = false) { return combat.createEnemy(id, 'goblin', level, { x, y }, boss) }
function withWeapon(id) { let state = player.createPlayerState(); return player.equipItem(state, id) }
function withAllSkills() { const state = player.createPlayerState(); const armor = { ...state.inventory.find((item) => item.id === 'test-light-armor'), id: 'all-skills', skills: Object.keys(skills.SKILLS) }; return { ...state, inventory: [...state.inventory, armor], equipment: { ...state.equipment, armor: 'all-skills' } } }

test('自動対象は距離・HP・右左上下・安定座標の順で決定する', () => {
  const state = battle.createBattleState(withAllSkills(), [enemy('down', 10, 11), enemy('up', 10, 9), enemy('left', 9, 10), enemy('right', 11, 10)], { x: 10, y: 10 })
  for (const id of ['right', 'left', 'up', 'down']) {
    assert.equal(battle.selectAutoTarget(state, openMap()).id, id)
    assert.equal(battle.selectAutoTarget(state, openMap(), 'strongStrike').id, id)
    state.combat.enemies = state.combat.enemies.filter((candidate) => candidate.id !== id)
  }
  state.combat.enemies = [enemy('near', 10, 11), { ...enemy('far', 12, 10), hp: 1 }]
  assert.equal(battle.selectAutoTarget(state, openMap(), 'magicBolt').id, 'near')
  state.combat.enemies = [enemy('right', 11, 10), { ...enemy('left', 9, 10), hp: 1 }]
  assert.equal(battle.selectAutoTarget(state, openMap()).id, 'left')
  state.combat.enemies = [enemy('left-up', 9, 9), enemy('right-down', 11, 11), enemy('right-up', 11, 9)]
  assert.equal(battle.selectAutoTarget(state, openMap(), 'magicBolt').id, 'right-up')
  state.combat.enemies.reverse()
  assert.equal(battle.selectAutoTarget(state, openMap(), 'magicBolt').id, 'right-up')
  state.combat.enemies = [enemy('b', 12, 9), enemy('a', 11, 8)]
  assert.equal(battle.selectAutoTarget(state, openMap(), 'magicBolt').id, 'a')
})

test('自動対象は射程・遮蔽・生存・CDを判定し、対象なしでは状態を消費しない', () => {
  const state = battle.createBattleState(withAllSkills(), [enemy('far', 16, 10), enemy('blocked', 12, 10), { ...enemy('dead', 10, 11), hp: 0 }], { x: 10, y: 10 })
  const map = openMap([{ x: 11, y: 10 }])
  const before = structuredClone(state)
  assert.equal(battle.selectAutoTarget(state, map), null)
  assert.equal(battle.selectAutoTarget(state, map, 'magicBolt'), null)
  assert.deepEqual(state, before)
  const bow = battle.createBattleState(withWeapon('test-bow'), [enemy('blocked', 12, 10), enemy('diagonal', 11, 11)], { x: 10, y: 10 })
  assert.equal(battle.selectAutoTarget(bow, map), null)
  for (const id of ['flame', 'piercingShot', 'shockwave', 'smallHeal', 'guard', 'dash']) assert.equal(battle.selectAutoTarget(state, map, id), null)
  state.cooldowns.magicBolt = 1
  assert.equal(battle.selectAutoTarget(state, openMap(), 'magicBolt'), null)
})

test('自動対象への通常攻撃・単体スキルは既存の倍率と状態異常を維持する', () => {
  for (const id of [undefined, 'strongStrike', 'magicBolt', 'poisonStrike', 'slowSpell', 'stunStrike']) {
    const state = battle.createBattleState(withAllSkills(), [enemy('target', 11, 10)], { x: 10, y: 10 })
    const target = battle.selectAutoTarget(state, openMap(), id)
    const next = id ? battle.useSkill(state, id, target.position, openMap()) : battle.attackWithWeapon(state, target.position, openMap(), () => 1)
    const expected = id ? battle.useSkill(state, id, { x: 11, y: 10 }, openMap()) : battle.attackWithWeapon(state, { x: 11, y: 10 }, openMap(), () => 1)
    assert.equal(next.combat.turn, 1)
    assert.deepEqual(next, expected)
  }
})

test('表示範囲外の敵も有効行動後に追跡を続ける', () => {
  const distant = { ...enemy('offscreen', 17, 10), discovered: true }
  const state = battle.createBattleState(player.createPlayerState(), [distant], { x: 10, y: 10 })
  const next = battle.moveBattlePlayer(state, 'left', openMap())
  assert.equal(next.combat.turn, 1)
  assert.notDeepEqual(next.combat.enemies[0].position, distant.position)
})

test('武器5種類の攻撃範囲と遮蔽を判定する', () => {
  const expected = { 'initial-sword': 4, 'test-spear': 12, 'test-bow': 12, 'test-short-staff': 12, 'test-long-staff': 24 }
  for (const [id, count] of Object.entries(expected)) { const state = battle.createBattleState(withWeapon(id), []); state.combat.position = { x: 10, y: 10 }; assert.equal(battle.getPlayerAttackCells(state.player, state.combat.position, openMap()).length, count, id) }
  const bow = battle.createBattleState(withWeapon('test-bow'), []); bow.combat.position = { x: 5, y: 5 }; const cells = battle.getPlayerAttackCells(bow.player, bow.combat.position, openMap([{ x: 5, y: 7 }]))
  assert.equal(cells.some((cell) => cell.x === 5 && cell.y === 8), false)
})

test('杖の通常攻撃は射程内の全敵へ魔法ダメージを与え、空振りも1ターン', () => {
  const state = battle.createBattleState(withWeapon('test-short-staff'), [enemy('a', 2, 15), enemy('b', 3, 16), enemy('far', 10, 10)])
  const hit = battle.attackWithWeapon(state, { x: 2, y: 16 }, openMap(), () => 1)
  assert.ok(hit.combat.enemies.find((e) => e.id === 'a').hp < state.combat.enemies[0].hp); assert.ok(hit.combat.enemies.find((e) => e.id === 'b').hp < state.combat.enemies[1].hp); assert.equal(hit.combat.enemies.find((e) => e.id === 'far').hp, state.combat.enemies[2].hp)
  const empty = battle.createBattleState(withWeapon('test-short-staff'), [])
  assert.equal(battle.attackWithWeapon(empty, { x: 2, y: 16 }, openMap()), empty)
})

test('敵撃破時に一度だけ通常・ボス経験値を加算する', () => {
  const p = { ...withWeapon('initial-sword'), level: 10 }; const normal = { ...enemy('a', 2, 16, 1), hp: 1 }; const boss = { ...enemy('b', 3, 17, 1, true), hp: 1 }
  let state = battle.createBattleState(p, [normal, boss]); state = battle.attackWithWeapon(state, { x: 2, y: 16 }, openMap(), () => 1); assert.equal(state.player.experience, 20)
  state = battle.attackWithWeapon(state, { x: 3, y: 17 }, openMap(), () => 1); assert.equal(state.player.experience, 120)
})

test('12スキルを定義し、攻撃・範囲・回復・状態・移動・防御を実行する', () => {
  assert.equal(Object.keys(skills.SKILLS).length, 12)
  const all = withAllSkills(); const target = { x: 2, y: 16 }
  for (const id of ['strongStrike', 'magicBolt', 'poisonStrike', 'slowSpell', 'stunStrike']) { const state = battle.createBattleState(all, [enemy('e', 2, 16, 10)]); const used = battle.useSkill(state, id, target, openMap()); assert.equal(used.combat.turn, 1, id); assert.equal(used.cooldowns[id], skills.SKILLS[id].cooldown) }
  for (const id of ['piercingShot', 'flame']) { const state = battle.createBattleState(all, [enemy('e', 2, 15, 10)]); const used = battle.useSkill(state, id, { x: 2, y: 15 }, openMap()); assert.equal(used.combat.turn, 1, id) }
  const wave = battle.useSkill(battle.createBattleState(all, [enemy('e', 2, 16, 10)]), 'shockwave', undefined, openMap()); assert.equal(wave.combat.turn, 1)
  for (const id of ['smallHeal', 'largeHeal']) { const hurt = { ...all, currentHp: 1 }; const healed = battle.useSkill(battle.createBattleState(hurt, []), id, undefined, openMap()); assert.ok(healed.player.currentHp > 1); assert.ok(healed.player.currentHp <= player.calculateStats(healed.player).maxHp) }
  const dashed = battle.useSkill(battle.createBattleState(all, []), 'dash', { x: 5, y: 17 }, openMap()); assert.deepEqual(dashed.combat.position, { x: 5, y: 17 })
  const guarded = battle.useSkill(battle.createBattleState(all, []), 'guard', undefined, openMap()); assert.equal(guarded.guardTurns, 3)
})

test('クールダウンは使用ターンに減らず、有効な別行動だけで減る', () => {
  const all = withAllSkills(); let state = battle.useSkill(battle.createBattleState(all, []), 'smallHeal', undefined, openMap()); assert.equal(state.cooldowns.smallHeal, 4)
  assert.equal(battle.useSkill(state, 'smallHeal', undefined, openMap()), state)
  const invalid = battle.moveBattlePlayer(state, 'left', openMap([{ x: 1, y: 17 }])); assert.equal(invalid, state)
  state = battle.moveBattlePlayer(state, 'up', openMap()); assert.equal(state.cooldowns.smallHeal, 3)
})

test('防御は次の被ダメージを50%軽減し、鈍足は移動行動を間引く', () => {
  const all = withAllSkills(); const attacker = { ...enemy('e', 2, 16, 1), discovered: true, warning: { remaining: 1, cells: [{ x: 2, y: 17 }], direction: 'down', target: { x: 2, y: 17 } } }
  const guarded = battle.useSkill(battle.createBattleState(all, [attacker]), 'guard', undefined, openMap())
  assert.equal(guarded.player.currentHp, 73); assert.equal(guarded.guardTurns, 0)
  const slowedEnemy = { ...enemy('s', 2, 14, 10), discovered: true, statuses: { poison: 0, burn: 0, slow: 3, stun: 0 } }
  let slowed = battle.createBattleState(all, [slowedEnemy]); slowed = battle.moveBattlePlayer(slowed, 'right', openMap())
  assert.deepEqual(slowed.combat.enemies[0].position, { x: 2, y: 14 })
  slowed = battle.moveBattlePlayer(slowed, 'down', openMap()); assert.notDeepEqual(slowed.combat.enemies[0].position, { x: 2, y: 14 })
})

test('毒・燃焼・鈍足・気絶・ノックバック・会心・吸血・追加攻撃を発動する', () => {
  const cases = [
    ['test-poison-sword', 'poison'], ['test-burn-sword', 'burn'], ['test-slow-sword', 'slow'], ['test-stun-sword', 'stun'],
  ]
  for (const [weapon, status] of cases) { const original = enemy('e', 2, 16, 10); const state = battle.createBattleState(withWeapon(weapon), [original]); const hit = battle.attackWithWeapon(state, { x: 2, y: 16 }, openMap(), () => 0); if (status === 'stun') { assert.deepEqual(hit.combat.enemies[0].position, original.position); assert.equal(hit.combat.enemies[0].statuses.stun, 0) } else assert.ok(hit.combat.enemies[0].statuses[status] > 0, status) }
  const knock = battle.attackWithWeapon(battle.createBattleState(withWeapon('test-spear'), [enemy('e', 2, 16, 10)]), { x: 2, y: 16 }, openMap(), () => 0); assert.ok(knock.combat.enemies[0].position.y <= 14); assert.equal(knock.combat.enemies[0].warning, null)
  const baseEnemy = enemy('e', 2, 16, 10); const critical = battle.attackWithWeapon(battle.createBattleState(withWeapon('test-bow'), [baseEnemy]), { x: 2, y: 16 }, openMap(), () => 0); assert.ok(baseEnemy.hp - critical.combat.enemies[0].hp > player.calculateStats(withWeapon('test-bow')).physical)
  const hurt = { ...withWeapon('test-short-staff'), currentHp: 30 }; const drained = battle.attackWithWeapon(battle.createBattleState(hurt, [enemy('e', 2, 16, 10)]), { x: 2, y: 16 }, openMap(), () => 0); assert.ok(drained.player.currentHp > 30)
  const extraBase = enemy('e', 2, 16, 10); const extra = battle.attackWithWeapon(battle.createBattleState(withWeapon('test-long-staff'), [extraBase]), { x: 2, y: 16 }, openMap(), () => 0); const dealt = extraBase.hp - extra.combat.enemies[0].hp; assert.equal(dealt, player.calculateStats(withWeapon('test-long-staff')).magic * 2)
})

test('状態異常は再付与で残り時間を更新し、毒・燃焼は後続ターンで終了する', () => {
  let state = battle.createBattleState(withWeapon('test-poison-sword'), [enemy('e', 2, 16, 20)]); state = battle.attackWithWeapon(state, { x: 2, y: 16 }, openMap(), () => 0); assert.equal(state.combat.enemies[0].statuses.poison, 5)
  state = battle.attackWithWeapon(state, { x: 2, y: 16 }, openMap(), () => 0); assert.equal(state.combat.enemies[0].statuses.poison, 5)
  state = { ...state, player: withWeapon('initial-sword') }; for (let i = 0; i < 5; i += 1) state = battle.attackWithWeapon(state, { x: 2, y: 16 }, openMap(), () => 1)
  if (state.combat.enemies[0]) assert.equal(state.combat.enemies[0].statuses.poison, 0)
})
