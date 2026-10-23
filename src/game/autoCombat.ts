import { attackWithWeapon, getSkillAffectedEnemies, getSkillTargetCells, selectAutoTarget, useSkill, type BattleState } from './battle'
import { availableSkillLevel, availableSkills, calculateStats, type SkillId } from './player'
import { DASH_STEPS } from './effectLevels'
import { getWarningLevel, manhattanDistance } from './combat/combat'
import { isPassable, type ForestMap, type Position } from './forestMap'
import { SKILLS } from './skills'

// 回復→目前の防御→攻撃（定義順）→緊急退避。入力・乱数によらず固定する。
export const AUTO_SKILL_PRIORITY: readonly SkillId[] = ['largeHeal', 'smallHeal', 'guard', 'strongStrike', 'magicBolt', 'piercingShot', 'shockwave', 'flame', 'poisonStrike', 'slowSpell', 'stunStrike', 'dash']
type AutoAction = { skillId: SkillId; target?: Position } | { target: Position; skillId?: undefined }

export function chooseAutoAction(state: BattleState, map: ForestMap): AutoAction | null {
  if (state.combat.finished) return null
  const origin = state.combat.position
  for (const id of AUTO_SKILL_PRIORITY) {
    if (!availableSkills(state.player).includes(id) || (state.cooldowns[id] ?? 0) > 0) continue
    if (id === 'smallHeal' || id === 'largeHeal') {
      if (state.player.currentHp <= calculateStats(state.player).maxHp * .5) return { skillId: id }
      continue
    }
    if (id === 'guard') {
      if (state.guardTurns === 0 && getWarningLevel(state.combat.enemies, origin) === 'red') return { skillId: id }
      continue
    }
    if (id === 'dash') {
      if (getWarningLevel(state.combat.enemies, origin) !== 'red') continue
      // 右・左・上・下の順で、経路が通行可能かつ予告外に出られる最長距離へ退避する。
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
        const cells: Position[] = []
        for (let step = 1; step <= DASH_STEPS[availableSkillLevel(state.player, 'dash') - 1]; step++) {
          const cell = { x: origin.x + dx * step, y: origin.y + dy * step }
          if (!isPassable(map, cell) || state.combat.enemies.some((enemy) => enemy.position.x === cell.x && enemy.position.y === cell.y)) break
          if (!getWarningLevel(state.combat.enemies, cell)) cells.push(cell)
        }
        if (cells.length) return { skillId: id, target: cells.at(-1)! }
      }
      continue
    }
    if (SKILLS[id].target === 'single') {
      const effect = id === 'poisonStrike' ? 'poison' : id === 'slowSpell' ? 'slow' : id === 'stunStrike' ? 'stun' : null
      const candidates = effect ? { ...state, combat: { ...state.combat, enemies: state.combat.enemies.filter((enemy) => (enemy.statuses?.[effect] ?? 0) === 0 && (effect !== 'stun' || (enemy.statuses?.stunRecovery ?? 0) === 0)) } } : state
      const enemy = selectAutoTarget(candidates, map, id)
      if (enemy) return { skillId: id, target: enemy.position }
    } else if (SKILLS[id].target === 'self') {
      if (getSkillAffectedEnemies(state, id).length) return { skillId: id }
    } else {
      const candidates = getSkillTargetCells(state, id, map).map((target) => ({ target, hits: getSkillAffectedEnemies(state, id, target, map).length }))
        .filter(({ hits }) => hits > 0).sort((a, b) => b.hits - a.hits || manhattanDistance(origin, a.target) - manhattanDistance(origin, b.target) || a.target.y - b.target.y || a.target.x - b.target.x)
      if (candidates.length) return { skillId: id, target: candidates[0].target }
    }
  }
  const enemy = selectAutoTarget(state, map)
  return enemy ? { target: enemy.position } : null
}

export function performAutoAttack(state: BattleState, map: ForestMap, random: () => number = Math.random): BattleState {
  let candidates = state
  for (let attempt = 0; attempt <= AUTO_SKILL_PRIORITY.length; attempt++) {
    const action = chooseAutoAction(candidates, map)
    if (!action) return state
    const next = action.skillId ? useSkill(state, action.skillId, action.target, map) : attackWithWeapon(state, action.target!, map, random)
    if (next !== state) return { ...next, actionNotice: { turn: next.combat.turn, label: action.skillId ? `${SKILLS[action.skillId].name} Lv.${availableSkillLevel(state.player, action.skillId)}` : '通常攻撃', skillId: action.skillId } }
    // 行動開始時の毒等で対象が消える場合も、未確定の状態は採用せず次候補へ。
    if (!action.skillId) return state
    candidates = { ...candidates, cooldowns: { ...candidates.cooldowns, [action.skillId]: 1 } }
  }
  return state
}
