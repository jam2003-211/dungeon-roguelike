import type { SkillId, SpecialEffectId } from './player'

export type EffectLevel = 1 | 2 | 3 | 4 | 5
export const LEVEL_MULTIPLIERS: readonly number[] = [1, 1.15, 1.3, 1.5, 1.75]
const thresholds = [.5, .75, .9, .98, 1]

export function rollEffectLevel(random: () => number): EffectLevel {
  const value = random()
  return (thresholds.findIndex((limit) => value < limit) + 1 || 5) as EffectLevel
}
export function levelMultiplier(level: EffectLevel): number { return LEVEL_MULTIPLIERS[level - 1] }

export const SKILL_PREFIXES: Readonly<Record<SkillId, string>> = {
  strongStrike: '強撃', magicBolt: '魔弾', piercingShot: '貫通', shockwave: '衝撃', flame: '火炎',
  smallHeal: '小再生', largeHeal: '再生', poisonStrike: '毒撃', slowSpell: '鈍足', stunStrike: '気絶',
  dash: '疾走', guard: '守護',
}
export const EFFECT_PREFIXES: Readonly<Record<SpecialEffectId, string>> = {
  poison: '毒', burn: '燃焼', slow: '鈍足', stun: '気絶', knockback: '吹飛',
  critical: '会心', lifesteal: '吸血', extraAttack: '追撃',
}
export const EFFECT_LABELS: Readonly<Record<SpecialEffectId, string>> = {
  poison: '毒', burn: '燃焼', slow: '鈍足', stun: '気絶', knockback: 'ノックバック',
  critical: '会心', lifesteal: '吸血', extraAttack: '追加攻撃',
}

export const POISON_TURNS = [5, 6, 7, 8, 9] as const
export const BURN_TURNS = [3, 4, 5, 6, 7] as const
export const SLOW_TURNS = [3, 4, 5, 6, 7] as const
export const KNOCKBACK_STEPS = [3, 3, 4, 4, 5] as const
export const DASH_STEPS = [3, 3, 4, 4, 5] as const
export const GUARD_REDUCTION = [.5, .55, .6, .65, .7] as const
export const CRITICAL_MULTIPLIER = [1.5, 1.65, 1.8, 2, 2.25] as const
export const LIFESTEAL_RATE = [.5, .58, .65, .75, .85] as const
export const STUN_BONUS = [0, .1, .2, .3, .4] as const

export function describeSpecialEffect(id: SpecialEffectId, level: EffectLevel): string {
  const index = level - 1
  switch (id) {
    case 'poison': return `毒${POISON_TURNS[index]}ターン（毎ターン最大HPの5%）`
    case 'burn': return `燃焼${BURN_TURNS[index]}ターン（毎ターン3ダメージ）`
    case 'slow': return `鈍足${SLOW_TURNS[index]}ターン`
    case 'stun': return `気絶1行動・命中ダメージ+${Math.round(STUN_BONUS[index] * 100)}%`
    case 'knockback': return `最大${KNOCKBACK_STEPS[index]}マス押し出す`
    case 'critical': return `命中ダメージ${CRITICAL_MULTIPLIER[index]}倍`
    case 'lifesteal': return `与ダメージの${Math.round(LIFESTEAL_RATE[index] * 100)}%を回復`
    case 'extraAttack': return `追加ダメージ${Math.round(LEVEL_MULTIPLIERS[index] * 100)}%`
  }
}
