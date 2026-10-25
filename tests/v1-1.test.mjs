import assert from 'node:assert/strict'
import test from 'node:test'
import { loadGameModule as load, pwaFixture } from './pwa-fixture.mjs'
const player = await load('game/player'), battle = await load('game/battle'), auto = await load('game/autoCombat')
const combat = await load('game/combat/combat'), saves = await load('persistence/saveData'), skills = await load('game/skills')
const map = Array.from({ length: 20 }, () => Array(20).fill('grass'))
function state(ids = [], position = { x: 11, y: 10 }) {
  const p = player.createPlayerState()
  const armor = { ...p.inventory[1], id: 'regular-skills', skills: ids }
  const equipped = player.equipItem({ ...p, inventory: [...p.inventory, armor] }, armor.id)
  const enemy = combat.createEnemy('enemy', 'goblin', 20, position, false)
  return battle.createBattleState(equipped, [enemy], { x: 10, y: 10 })
}
function warn(s) { s.combat.enemies[0].warning = { remaining: 1, cells: [{ x: 10, y: 10 }], direction: 'left', target: { x: 10, y: 10 } }; return s }

test('自動スキルは固定順で1回だけ発動し、ターンと敵の準備も1回だけ進む', () => {
  const s = state(['strongStrike', 'magicBolt']); const next = auto.performAutoAttack(s, map)
  assert.equal(auto.chooseAutoAction(s, map).skillId, 'strongStrike')
  assert.equal(next.combat.turn, 1); assert.equal(next.cooldowns.strongStrike, skills.SKILLS.strongStrike.cooldown)
  assert.equal(next.cooldowns.magicBolt, undefined)
  assert.equal(s.combat.enemies[0].hp - next.combat.enemies[0].hp, player.calculateStats(s.player).physical * 2)
  assert.equal(next.combat.enemies[0].warning.remaining, combat.ENEMY_DEFINITIONS.goblin.preparationTurns)
})
test('CD中は次候補、全スキル不可なら通常攻撃、対象なしでは0ターン', () => {
  const s = state(['strongStrike', 'magicBolt']); s.cooldowns.strongStrike = 2
  assert.equal(auto.chooseAutoAction(s, map).skillId, 'magicBolt')
  s.cooldowns.magicBolt = 1
  assert.equal(auto.performAutoAttack(s, map).actionNotice.label, '通常攻撃')
  s.combat.enemies = []; assert.equal(auto.performAutoAttack(s, map), s)
})
test('自動対象は武器とスキルの射程・障害物・視線を維持する', () => {
  const s = state(['magicBolt'], { x: 14, y: 10 })
  assert.equal(auto.chooseAutoAction(s, map).skillId, 'magicBolt')
  const blocked = structuredClone(map); blocked[10][12] = 'tree'
  assert.equal(auto.chooseAutoAction(s, blocked), null)
  assert.equal(battle.getPlayerAttackCells(s.player, { x: 10, y: 10 }, map).length, 4)
  assert.notDeepEqual(battle.getPlayerAttackCells(s.player, { x: 9, y: 10 }, map), battle.getPlayerAttackCells(s.player, { x: 10, y: 10 }, map))
})
for (const id of Object.keys(skills.SKILLS).filter((id) => !['smallHeal', 'largeHeal', 'dash', 'guard'].includes(id))) test(`自動発動条件と単一ターン：${id}`, () => {
  const s = state([id])
  const choice = auto.chooseAutoAction(s, map)
  assert.equal(choice.skillId, id)
  const next = auto.performAutoAttack(s, map)
  assert.equal(next.combat.turn, 1); assert.equal(next.cooldowns[id], skills.SKILLS[id].cooldown)
})
test('防御は手動専用で、赤予告の攻撃をLv1～5の既存軽減率で受ける', () => {
  for (const [level, reduction] of [.5, .55, .6, .65, .7].entries()) {
    const s = warn(state(['guard']))
    s.player.inventory.find((item) => item.id === 'regular-skills').skillLevels = { guard: level + 1 }
    s.combat.enemies[0].attack = 20
    assert.equal(auto.chooseAutoAction(s, map).skillId, undefined)
    const automatic = auto.performAutoAttack(s, map)
    assert.equal(automatic.cooldowns.guard, undefined)
    const defended = battle.useSkill(s, 'guard', undefined, map)
    assert.equal(defended.combat.turn, 1)
    assert.equal(defended.cooldowns.guard, skills.SKILLS.guard.cooldown)
    assert.equal(defended.player.currentHp, 80 - Math.floor(20 * (1 - reduction)))
    assert.equal(defended.guardTurns, 0)
    assert.equal(defended.combat.enemies[0].warning, null)
    assert.equal(battle.useSkill(defended, 'guard', undefined, map), defended)
  }
  const absent = state()
  assert.equal(battle.useSkill(absent, 'guard', undefined, map), absent)
})
test('防御の手動ターン後に敵が準備し、次の赤予告とCDを更新する', () => {
  const s = state(['guard'])
  const defended = battle.useSkill(s, 'guard', undefined, map)
  assert.equal(defended.combat.turn, 1)
  assert.equal(defended.guardTurns, 3)
  assert.equal(defended.cooldowns.guard, 5)
  assert.equal(combat.getWarningLevel(defended.combat.enemies, defended.combat.position), null)
  assert.equal(defended.player.currentHp, s.player.currentHp)
  const escaped = battle.moveBattlePlayer(defended, 'up', map)
  assert.equal(escaped.combat.turn, 2)
  assert.equal(escaped.cooldowns.guard, 4)
  assert.equal(escaped.player.currentHp, s.player.currentHp)
  assert.equal(escaped.combat.enemies[0].warning.remaining, 1)
  const resolved = battle.moveBattlePlayer(escaped, 'up', map)
  assert.equal(resolved.combat.enemies[0].warning, null)
})
test('回復とダッシュは自動選択せず、手動時だけ有効な行動でターンとCDを使う', () => {
  const healing = state(['smallHeal', 'largeHeal']); healing.combat.enemies = []
  assert.equal(auto.chooseAutoAction(healing, map), null)
  assert.equal(battle.useSkill(healing, 'smallHeal', undefined, map), healing)
  healing.player.currentHp = 20; healing.combat.playerHp = 20
  const healed = battle.useSkill(healing, 'smallHeal', undefined, map)
  assert.equal(healed.combat.turn, 1); assert.equal(healed.cooldowns.smallHeal, skills.SKILLS.smallHeal.cooldown)
  const dashing = state(['dash']); dashing.combat.enemies = []
  assert.equal(auto.chooseAutoAction(dashing, map), null)
  const blocked = structuredClone(map); blocked[10][11] = 'tree'
  assert.equal(battle.useSkill(dashing, 'dash', { x: 12, y: 10 }, blocked), dashing)
  const moved = battle.useSkill(dashing, 'dash', { x: 12, y: 10 }, map)
  assert.equal(moved.combat.turn, 1); assert.deepEqual(moved.combat.position, { x: 12, y: 10 })
  assert.equal(moved.cooldowns.dash, skills.SKILLS.dash.cooldown)
})
test('満タン回復・重複状態異常・対象のない範囲攻撃を無駄撃ちしない', () => {
  const s = state(['smallHeal', 'guard', 'dash', 'shockwave', 'flame']); s.combat.enemies = []
  assert.equal(auto.performAutoAttack(s, map), s)
  const poison = state(['poisonStrike']); poison.combat.enemies[0].statuses = { poison: 3, burn: 0, slow: 0, stun: 0 }
  assert.equal(auto.chooseAutoAction(poison, map).skillId, undefined)
})
test('気絶中は警告を隠し、回復後は赤の次行動で固定範囲を攻撃する', () => {
  const s = warn(state()); const enemy = s.combat.enemies[0]
  enemy.statuses = { poison: 0, burn: 0, slow: 0, stun: 1 }
  assert.equal(combat.getWarningLevel([enemy], s.combat.position), null)
  const waiting = combat.processEnemyTurn(s.combat, map)
  assert.equal(waiting.playerHp, s.combat.playerHp); assert.equal(combat.getWarningLevel(waiting.enemies, s.combat.position), 'red')
  const attacked = combat.processEnemyTurn(waiting, map)
  assert.equal(attacked.playerHp, Math.max(0, waiting.playerHp - enemy.attack)); assert.equal(attacked.enemies[0].warning, null)
  assert.equal(combat.getWarningLevel([{ ...enemy, hp: 0 }], s.combat.position), null)
})
test('無職だけ0.8倍、町への復帰は装備込み最大HPまで回復する', () => {
  assert.deepEqual(player.JOBS.unemployed.hp, .8)
  const p = player.createPlayerState(); assert.deepEqual(player.calculateStats(p), { maxHp: 80, physical: 40, magic: 9 })
  assert.equal(player.recoverInTown({ ...p, currentHp: 0 }).currentHp, 80)
  assert.equal(player.recoverInTown({ ...p, currentHp: 1 }).currentHp, 80)
  assert.equal(player.JOBS.warrior.hp, 1.3)
})
test('v1.0の無職・探索中HPを安全に再計算し、所持品・CD・地形・ターンを維持する', async () => {
  const old = await pwaFixture(); const extra = player.baseStats(old.player.level).maxHp - Math.floor(player.baseStats(old.player.level).maxHp * .8)
  old.player.currentHp = player.calculateStats(old.player).maxHp + extra
  old.run.battle.combat.playerHp = old.player.currentHp; old.run.battle.combat.playerMaxHp = old.player.currentHp
  old.run.battle.cooldowns = { smallHeal: 2 }; old.run.selectedSkill = 'smallHeal'
  const original = structuredClone(old), loaded = saves.readSaveData(old)
  assert.equal(loaded.player.currentHp, player.calculateStats(loaded.player).maxHp)
  assert.equal(loaded.run.battle.combat.playerHp, loaded.player.currentHp); assert.equal(loaded.run.battle.combat.playerMaxHp, loaded.player.currentHp)
  assert.deepEqual(loaded.player.inventory, original.player.inventory); assert.deepEqual(loaded.stocks, original.stocks)
  assert.equal(loaded.run.battle.combat.turn, original.run.battle.combat.turn); assert.deepEqual(loaded.run.battle.cooldowns, original.run.battle.cooldowns)
  assert.deepEqual(saves.readSaveData(loaded), loaded); assert.deepEqual(old, original)
})
