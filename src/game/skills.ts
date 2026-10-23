import type { SkillId } from './player'
import { DASH_STEPS, GUARD_REDUCTION, POISON_TURNS, SLOW_TURNS, levelMultiplier, type EffectLevel } from './effectLevels'

export type SkillTarget = 'single' | 'line' | 'area' | 'self' | 'dash'
export interface SkillDefinition { id: SkillId; name: string; description: string; cooldown: number; target: SkillTarget; range: number; multiplier?: number; attackType?: 'physical' | 'magic' }

export const SKILLS: Readonly<Record<SkillId, SkillDefinition>> = {
  strongStrike: { id: 'strongStrike', name: '強撃', description: '隣接1体へ物理2倍', cooldown: 3, target: 'single', range: 1, multiplier: 2, attackType: 'physical' },
  magicBolt: { id: 'magicBolt', name: '魔法弾', description: '射程5の1体へ魔法2倍', cooldown: 3, target: 'single', range: 5, multiplier: 2, attackType: 'magic' },
  piercingShot: { id: 'piercingShot', name: '貫通撃', description: '直線4マスの全敵へ物理1.5倍', cooldown: 4, target: 'line', range: 4, multiplier: 1.5, attackType: 'physical' },
  shockwave: { id: 'shockwave', name: '衝撃波', description: '周囲8マスへ物理1.5倍', cooldown: 5, target: 'self', range: 1, multiplier: 1.5, attackType: 'physical' },
  flame: { id: 'flame', name: '火炎', description: '指定地点の3×3へ魔法1.5倍', cooldown: 6, target: 'area', range: 3, multiplier: 1.5, attackType: 'magic' },
  smallHeal: { id: 'smallHeal', name: '小回復', description: '最大HPの20%を回復', cooldown: 4, target: 'self', range: 0 },
  largeHeal: { id: 'largeHeal', name: '大回復', description: '最大HPの40%を回復', cooldown: 8, target: 'self', range: 0 },
  poisonStrike: { id: 'poisonStrike', name: '毒撃', description: '隣接1体へ物理攻撃し毒5ターン', cooldown: 4, target: 'single', range: 1, multiplier: 1, attackType: 'physical' },
  slowSpell: { id: 'slowSpell', name: '鈍足魔法', description: '射程5の1体へ鈍足3ターン', cooldown: 4, target: 'single', range: 5 },
  stunStrike: { id: 'stunStrike', name: '気絶撃', description: '隣接1体へ物理攻撃し次の行動を停止', cooldown: 6, target: 'single', range: 1, multiplier: 1, attackType: 'physical' },
  dash: { id: 'dash', name: 'ダッシュ', description: '上下左右へ最大3マス移動', cooldown: 5, target: 'dash', range: 3 },
  guard: { id: 'guard', name: '防御', description: '次の被ダメージを50%軽減（最大3ターン）', cooldown: 5, target: 'self', range: 0 },
}

export function describeSkill(id: SkillId, level: EffectLevel): string {
  const multiplier = levelMultiplier(level)
  const power = SKILLS[id].multiplier
  const ratio = power ? Number((power * multiplier).toFixed(3)) : 0
  switch (id) {
    case 'strongStrike': return `隣接1体へ物理${ratio}倍`
    case 'magicBolt': return `射程5の1体へ魔法${ratio}倍`
    case 'piercingShot': return `直線4マスの全敵へ物理${ratio}倍`
    case 'shockwave': return `周囲8マスへ物理${ratio}倍`
    case 'flame': return `指定地点の3×3へ魔法${ratio}倍`
    case 'smallHeal': return `最大HPの${Math.round(20 * multiplier)}%を回復`
    case 'largeHeal': return `最大HPの${Math.round(40 * multiplier)}%を回復`
    case 'poisonStrike': return `隣接1体へ物理${ratio}倍・毒${POISON_TURNS[level - 1]}ターン`
    case 'slowSpell': return `射程5の1体へ鈍足${SLOW_TURNS[level - 1]}ターン`
    case 'stunStrike': return `隣接1体へ物理${ratio}倍・気絶1行動`
    case 'dash': return `上下左右へ最大${DASH_STEPS[level - 1]}マス移動`
    case 'guard': return `次の被ダメージを${Math.round(GUARD_REDUCTION[level - 1] * 100)}%軽減（最大3ターン）`
  }
}
