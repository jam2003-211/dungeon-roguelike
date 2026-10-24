import { FOREST_MAP, isPassable, type ForestMap, type Position } from './forestMap'
import { hasLineOfSight, manhattanDistance, processEnemyTurn, type CombatState, type EnemyState } from './combat/combat'
import { SKILLS } from './skills'
import { availableSkillLevel, availableSkillPower, availableSkills, calculateStats, enemyExperience, equippedWeapon, gainExperience, type PlayerState, type SkillId, type SpecialEffectId, type WeaponType } from './player'
import { BURN_TURNS, CRITICAL_MULTIPLIER, DASH_STEPS, GUARD_REDUCTION, KNOCKBACK_STEPS, LEVEL_MULTIPLIERS, LIFESTEAL_RATE, POISON_TURNS, SLOW_TURNS, STUN_BONUS, type EffectLevel } from './effectLevels'
import type { Direction } from './exploration'
import type { LootState } from './loot'
import type { BattleEffect } from './combatVisuals'

export interface BattleState { combat: CombatState; player: PlayerState; cooldowns: Partial<Record<SkillId, number>>; guardTurns: number; levelNotices: number[]; experienceEarned: number; loot?: LootState; actionNotice?: { turn: number; label: string; skillId?: SkillId }; visualEvents?: BattleEffect[] }
export const WEAPON_RANGES: Readonly<Record<WeaponType, number>> = { sword: 1, spear: 2, bow: 3, shortStaff: 2, longStaff: 3 }
const offsets: Record<Direction, Position> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
const POISON_RATE = .05; const BURN_DAMAGE = 3

export function createBattleState(player: PlayerState, enemies?: EnemyState[], start: Position = { x: 2, y: 17 }): BattleState {
  const stats = calculateStats(player)
  return { combat: { position: { ...start }, turn: 0, playerHp: Math.min(player.currentHp, stats.maxHp), playerMaxHp: stats.maxHp, enemies: enemies ?? [], finished: false }, player: { ...player, currentHp: Math.min(player.currentHp, stats.maxHp) }, cooldowns: {}, guardTurns: 0, levelNotices: [], experienceEarned: 0 }
}
function same(a: Position, b: Position) { return a.x === b.x && a.y === b.y }
function weaponType(player: PlayerState): WeaponType { const weapon = equippedWeapon(player); return weapon?.category === 'weapon' ? weapon.subtype as WeaponType : 'sword' }

export function getPlayerAttackCells(player: PlayerState, origin: Position, map: ForestMap = FOREST_MAP): Position[] {
  const type = weaponType(player); const cells: Position[] = []
  for (let y = 0; y < 20; y += 1) for (let x = 0; x < 20; x += 1) {
    const cell = { x, y }; const distance = manhattanDistance(origin, cell); const straight = x === origin.x || y === origin.y
    const range = WEAPON_RANGES[type]
    if (distance < 1 || distance > range || !isPassable(map, cell)) continue
    if (type === 'bow' && (!straight || !hasLineOfSight(map, origin, cell))) continue
    if ((type === 'shortStaff' || type === 'longStaff') && !hasLineOfSight(map, origin, cell)) continue
    cells.push(cell)
  }
  return cells
}

function validAttackTarget(state: BattleState, target: Position, map: ForestMap) { return getPlayerAttackCells(state.player, state.combat.position, map).some((cell) => same(cell, target)) }
function awardDefeated(state: BattleState, before: EnemyState[], after: EnemyState[]): BattleState {
  const remaining = new Set(after.map((enemy) => enemy.id)); let player = state.player; const notices = [...state.levelNotices]
  let experienceEarned = state.experienceEarned
  for (const enemy of before) if (!remaining.has(enemy.id)) { const xp = enemyExperience(enemy.level, enemy.isBoss, player.level); const gained = gainExperience(player, xp); player = gained.player; experienceEarned += xp; if (gained.levelsGained) notices.push(player.level) }
  return { ...state, player, levelNotices: notices, experienceEarned }
}
function tickStatuses(state: BattleState): BattleState {
  const before = state.combat.enemies; const enemies = before.map((enemy) => { const statuses = enemy.statuses ?? { poison: 0, burn: 0, slow: 0, stun: 0 }; let hp = enemy.hp; if (statuses.poison > 0) hp -= Math.max(1, Math.ceil(enemy.maxHp * POISON_RATE)); if (statuses.burn > 0) hp -= BURN_DAMAGE; return { ...enemy, hp, statuses: { ...statuses, poison: Math.max(0, statuses.poison - 1), burn: Math.max(0, statuses.burn - 1) } } }).filter((enemy) => enemy.hp > 0)
  return awardDefeated({ ...state, combat: { ...state.combat, enemies } }, before, enemies)
}
function decrementCooldowns(cooldowns: BattleState['cooldowns'], used?: SkillId) { const next = { ...cooldowns }; for (const key of Object.keys(next) as SkillId[]) if (key !== used) next[key] = Math.max(0, (next[key] ?? 0) - 1); return next }
function beginAction(state: BattleState, used?: SkillId): BattleState { return tickStatuses({ ...state, visualEvents: [], cooldowns: decrementCooldowns(state.cooldowns, used), guardTurns: used === 'guard' ? state.guardTurns : Math.max(0, state.guardTurns - 1) }) }
function finishAction(prepared: BattleState, combat: CombatState, map: ForestMap): BattleState {
  const hpBefore = combat.playerHp; const processed = processEnemyTurn(combat, map); let hp = processed.playerHp; let guardTurns = prepared.guardTurns
  if (hp < hpBefore && guardTurns > 0) { hp = hpBefore - Math.floor((hpBefore - hp) * (1 - GUARD_REDUCTION[availableSkillLevel(prepared.player, 'guard') - 1])); guardTurns = 0 }
  const stats = calculateStats(prepared.player); const player = { ...prepared.player, currentHp: Math.min(stats.maxHp, hp) }
  return { ...prepared, player, guardTurns, combat: { ...processed, playerHp: player.currentHp, playerMaxHp: stats.maxHp, finished: player.currentHp <= 0 } }
}

export function moveBattlePlayer(state: BattleState, direction: Direction, map: ForestMap = FOREST_MAP): BattleState {
  if (state.combat.finished) return state; const offset = offsets[direction]; const destination = { x: state.combat.position.x + offset.x, y: state.combat.position.y + offset.y }
  if (!isPassable(map, destination) || state.combat.enemies.some((enemy) => same(enemy.position, destination))) return state
  const prepared = beginAction(state); return finishAction(prepared, { ...prepared.combat, position: destination, turn: prepared.combat.turn + 1 }, map)
}

function applyStatus(enemy: EnemyState, effect: SpecialEffectId, level: EffectLevel = 1): EnemyState { const statuses = enemy.statuses ?? { poison: 0, burn: 0, slow: 0, stun: 0 }; if (effect === 'poison') return { ...enemy, statuses: { ...statuses, poison: POISON_TURNS[level - 1] } }; if (effect === 'burn') return { ...enemy, statuses: { ...statuses, burn: BURN_TURNS[level - 1] } }; if (effect === 'slow') return { ...enemy, statuses: { ...statuses, slow: SLOW_TURNS[level - 1] } }; if (effect === 'stun') return (('stunRecovery' in statuses ? statuses.stunRecovery ?? 0 : 0) > 0) ? enemy : { ...enemy, statuses: { ...statuses, stun: 1, stunRecovery: 2 } }; return enemy }
function knockback(enemy: EnemyState, source: Position, enemies: EnemyState[], map: ForestMap, steps: number): EnemyState { const dx = Math.sign(enemy.position.x - source.x); const dy = dx === 0 ? Math.sign(enemy.position.y - source.y) : 0; let position = enemy.position; for (let step = 0; step < steps; step += 1) { const next = { x: position.x + dx, y: position.y + dy }; if (!isPassable(map, next) || enemies.some((other) => other.id !== enemy.id && same(other.position, next))) break; position = next } return { ...enemy, position, warning: null } }

function damageEnemies(state: BattleState, ids: Set<string>, damage: number, effect: SpecialEffectId | null, proc: boolean, map: ForestMap, level: EffectLevel = 1, allowExtra = true): BattleState {
  const before = state.combat.enemies; let healing = 0
  const events = [...(state.visualEvents ?? [])]
  const emit = (id: SpecialEffectId, position: Position, from = state.combat.position, value?: number) => events.push({ kind: 'special', effect: id, position: { ...position }, from: { ...from }, value })
  let enemies = before.map((enemy) => {
    if (!ids.has(enemy.id)) return enemy
    const hitDamage = effect === 'critical' && proc ? Math.max(1, Math.floor(damage * CRITICAL_MULTIPLIER[level - 1])) : effect === 'stun' && proc ? damage + Math.floor(damage * STUN_BONUS[level - 1]) : damage
    const actual = Math.min(enemy.hp, hitDamage)
    let next = { ...enemy, hp: enemy.hp - hitDamage }
    if (proc && effect && ['poison', 'burn', 'slow', 'stun'].includes(effect)) {
      const affected = applyStatus(next, effect, level)
      // 死亡対象や気絶耐性で無効になった状態異常は表示しない。再付与は表示する。
      if (affected !== next && affected.hp > 0) emit(effect, enemy.position)
      next = affected
    }
    if (proc && effect === 'critical') emit(effect, enemy.position)
    if (proc && effect === 'lifesteal') healing += Math.ceil(actual * LIFESTEAL_RATE[level - 1])
    return next
  }).filter((enemy) => enemy.hp > 0)
  if (proc && effect === 'knockback') enemies = enemies.map((enemy) => {
    if (!ids.has(enemy.id)) return enemy
    const moved = knockback(enemy, state.combat.position, enemies, map, KNOCKBACK_STEPS[level - 1])
    if (!same(moved.position, enemy.position)) emit('knockback', moved.position, enemy.position)
    return moved
  })
  if (proc && effect === 'extraAttack' && allowExtra) enemies = enemies.map((enemy) => {
    if (!ids.has(enemy.id)) return enemy
    emit('extraAttack', enemy.position)
    return { ...enemy, hp: enemy.hp - Math.max(1, Math.floor(damage * LEVEL_MULTIPLIERS[level - 1])) }
  }).filter((enemy) => enemy.hp > 0)
  let next = awardDefeated({ ...state, combat: { ...state.combat, enemies } }, before, enemies); const maxHp = calculateStats(next.player).maxHp
  if (healing) {
    const hp = Math.min(maxHp, next.player.currentHp + healing)
    const gained = hp - next.player.currentHp
    if (gained > 0) {
      const sources = before.filter((enemy) => ids.has(enemy.id))
      sources.forEach((enemy, index) => emit('lifesteal', state.combat.position, enemy.position, index === 0 ? gained : undefined))
    }
    next = { ...next, player: { ...next.player, currentHp: hp }, combat: { ...next.combat, playerHp: hp } }
  }
  next = { ...next, visualEvents: events }
  return next
}

export function attackWithWeapon(state: BattleState, target: Position, map: ForestMap = FOREST_MAP, random: () => number = Math.random): BattleState {
  if (!validAttackTarget(state, target, map)) return state; const stats = calculateStats(state.player); const type = weaponType(state.player); const magic = type === 'shortStaff' || type === 'longStaff'; const damage = Math.max(1, Math.floor(magic ? stats.magic : stats.physical)); const weapon = equippedWeapon(state.player); const effect = weapon?.specialEffect ?? null; const proc = effect !== null && random() < (weapon?.effectRate ?? .1)
  const prepared = beginAction(state); const ids = new Set(prepared.combat.enemies.filter((enemy) => magic ? getPlayerAttackCells(prepared.player, prepared.combat.position, map).some((cell) => same(cell, enemy.position)) : same(enemy.position, target)).map((enemy) => enemy.id))
  const damaged = damageEnemies(prepared, ids, damage, effect, proc, map, weapon?.specialEffectLevel ?? 1)
  return finishAction(damaged, { ...damaged.combat, turn: damaged.combat.turn + 1 }, map)
}

export function getSkillTargetCells(state: BattleState, skillId: SkillId, map: ForestMap = FOREST_MAP): Position[] { const skill = SKILLS[skillId]; const range = skillId === 'dash' ? DASH_STEPS[availableSkillLevel(state.player, 'dash') - 1] : skill.range; const cells: Position[] = []; for (let y = 0; y < 20; y += 1) for (let x = 0; x < 20; x += 1) { const cell = { x, y }; const distance = manhattanDistance(state.combat.position, cell); if (!isPassable(map, cell) || distance < 1 || distance > range) continue; if (skill.target === 'line' || skill.target === 'dash') { if (x !== state.combat.position.x && y !== state.combat.position.y) continue } if (['single', 'line', 'area'].includes(skill.target) && !hasLineOfSight(map, state.combat.position, cell)) continue; cells.push(cell) } return cells }

export function useSkill(state: BattleState, skillId: SkillId, target?: Position, map: ForestMap = FOREST_MAP): BattleState {
  if (state.combat.finished || !availableSkills(state.player).includes(skillId) || (state.cooldowns[skillId] ?? 0) > 0) return state; const skill = SKILLS[skillId]
  if (!['self'].includes(skill.target) && (!target || !getSkillTargetCells(state, skillId, map).some((cell) => same(cell, target)))) return state
  if ((skillId === 'smallHeal' || skillId === 'largeHeal') && state.player.currentHp >= calculateStats(state.player).maxHp) return state
  if (skillId === 'dash' && target) {
    const origin = state.combat.position
    const distance = manhattanDistance(origin, target)
    const step = { x: Math.sign(target.x - origin.x), y: Math.sign(target.y - origin.y) }
    for (let index = 1; index <= distance; index += 1) {
      const cell = { x: origin.x + step.x * index, y: origin.y + step.y * index }
      if (!isPassable(map, cell) || state.combat.enemies.some((enemy) => same(enemy.position, cell))) return state
    }
  }
  let next = beginAction(state, skillId); next = { ...next, cooldowns: { ...next.cooldowns, [skillId]: skill.cooldown } }; const stats = calculateStats(next.player); const skillPower = availableSkillPower(next.player, skillId); const skillLevel = availableSkillLevel(next.player, skillId)
  const origin = { ...next.combat.position }
  let effectPositions: Position[] = [origin]
  let recovered: number | undefined
  if (skillId === 'smallHeal' || skillId === 'largeHeal') { const rate = (skillId === 'smallHeal' ? .2 : .4) * skillPower; const hp = Math.min(stats.maxHp, next.player.currentHp + Math.ceil(stats.maxHp * rate)); recovered = hp - next.player.currentHp; next = { ...next, player: { ...next.player, currentHp: hp }, combat: { ...next.combat, playerHp: hp } } }
  else if (skillId === 'guard') next = { ...next, guardTurns: 3 }
  else if (skillId === 'dash' && target) { const direction: Direction = target.x > next.combat.position.x ? 'right' : target.x < next.combat.position.x ? 'left' : target.y > next.combat.position.y ? 'down' : 'up'; let position = next.combat.position; const steps = Math.min(DASH_STEPS[skillLevel - 1], manhattanDistance(position, target)); for (let i = 0; i < steps; i += 1) { const candidate = { x: position.x + offsets[direction].x, y: position.y + offsets[direction].y }; if (!isPassable(map, candidate) || next.combat.enemies.some((enemy) => same(enemy.position, candidate))) break; position = candidate } next = { ...next, combat: { ...next.combat, position } } }
  else {
    const targets = getSkillAffectedEnemies(next, skillId, target, map)
    if ((skill.multiplier || ['slowSpell'].includes(skillId)) && targets.length === 0) return state
    effectPositions = skillId === 'shockwave' ? [origin] : targets.map((enemy) => ({ ...enemy.position }))
    if (skill.multiplier) next = damageEnemies(next, new Set(targets.map((enemy) => enemy.id)), Math.max(1, Math.floor((skill.attackType === 'magic' ? stats.magic : stats.physical) * skill.multiplier * skillPower)), null, false, map)
    if (skillId === 'poisonStrike' || skillId === 'slowSpell' || skillId === 'stunStrike') { const effect = skillId === 'poisonStrike' ? 'poison' : skillId === 'slowSpell' ? 'slow' : 'stun'; const ids = new Set(targets.map((enemy) => enemy.id)); next = { ...next, combat: { ...next.combat, enemies: next.combat.enemies.map((enemy) => ids.has(enemy.id) ? applyStatus(enemy, effect, skillLevel) : enemy) } } }
  }
  if (skillId === 'dash') effectPositions = [{ ...next.combat.position }]
  next = { ...next, visualEvents: [...(next.visualEvents ?? []), ...effectPositions.map((position): BattleEffect => ({ kind: 'skill', effect: skillId, position, from: origin, value: recovered }))] }
  return finishAction(next, { ...next.combat, turn: next.combat.turn + 1 }, map)
}

// 自動選択と実発動で同じ効果範囲を共有する。
export function getSkillAffectedEnemies(state: BattleState, skillId: SkillId, target?: Position, map: ForestMap = FOREST_MAP): EnemyState[] {
  // 範囲攻撃の巻き込みも含め、壁の向こうの敵へ着弾させない。
  const enemies = state.combat.enemies.filter((enemy) => enemy.hp > 0 && isPassable(map, enemy.position) && hasLineOfSight(map, state.combat.position, enemy.position))
  if (skillId === 'shockwave') return enemies.filter((enemy) => manhattanDistance(enemy.position, state.combat.position) <= 2 && Math.max(Math.abs(enemy.position.x - state.combat.position.x), Math.abs(enemy.position.y - state.combat.position.y)) === 1)
  if (skillId === 'flame' && target) return enemies.filter((enemy) => Math.max(Math.abs(enemy.position.x - target.x), Math.abs(enemy.position.y - target.y)) <= 1)
  if (skillId === 'piercingShot' && target) return enemies.filter((enemy) => (enemy.position.x === state.combat.position.x || enemy.position.y === state.combat.position.y) && manhattanDistance(enemy.position, state.combat.position) <= SKILLS.piercingShot.range)
  return target ? enemies.filter((enemy) => same(enemy.position, target)) : []
}

// カメラの表示範囲によらず、既存の射程・遮蔽判定から生存敵を選ぶ。
export function selectAutoTarget(state: BattleState, map: ForestMap = FOREST_MAP, skillId?: SkillId): EnemyState | null {
  if (state.combat.finished || (skillId && (SKILLS[skillId].target !== 'single' || !availableSkills(state.player).includes(skillId) || (state.cooldowns[skillId] ?? 0) > 0))) return null
  const origin = state.combat.position
  const cells = skillId ? getSkillTargetCells(state, skillId, map) : getPlayerAttackCells(state.player, origin, map)
  const horizontal = (position: Position) => position.x > origin.x ? 0 : position.x < origin.x ? 1 : 2
  const vertical = (position: Position) => position.y < origin.y ? 0 : position.y === origin.y ? 1 : 2
  return state.combat.enemies.filter((enemy) => enemy.hp > 0 && cells.some((cell) => same(cell, enemy.position))).sort((a, b) =>
    manhattanDistance(origin, a.position) - manhattanDistance(origin, b.position)
    || a.hp - b.hp
    || horizontal(a.position) - horizontal(b.position)
    || vertical(a.position) - vertical(b.position)
    || a.position.y - b.position.y || a.position.x - b.position.x
    || a.id.localeCompare(b.id)
  )[0] ?? null
}
