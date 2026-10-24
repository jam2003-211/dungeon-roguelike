import type { CombatState } from './combat/combat'
import type { Position } from './forestMap'
import type { SkillId, SpecialEffectId } from './player'

// 1行動の確定結果だけを表す表示用情報。乱数判定や保存には使用しない。
export type BattleEffect = { kind: 'skill'; effect: SkillId; position: Position; from: Position; value?: number }
  | { kind: 'special'; effect: SpecialEffectId; position: Position; from: Position; value?: number }
export const BATTLE_EFFECT_DURATION = 420

export interface CombatVisual { id: string; position: Position; damage: number; kind: 'enemy' | 'player' }

// 確定済みの戦闘状態から演出だけを作る。ダメージ計算や敵AIには関与しない。
export function combatVisuals(previous: CombatState, current: CombatState): CombatVisual[] {
  if (current.turn <= previous.turn) return []
  const visuals: CombatVisual[] = []
  for (const enemy of previous.enemies) {
    const next = current.enemies.find((candidate) => candidate.id === enemy.id)
    const damage = Math.max(0, enemy.hp - (next?.hp ?? 0))
    if (damage) visuals.push({ id: enemy.id, position: next?.position ?? enemy.position, damage, kind: 'enemy' })
  }
  const playerDamage = Math.max(0, previous.playerHp - current.playerHp)
  if (playerDamage) visuals.push({ id: 'player', position: current.position, damage: playerDamage, kind: 'player' })
  return visuals
}
