export const initialPlayerView = {
  level: 1,
  hp: 100,
  maxHp: 100,
  physicalAttack: 12,
  magicAttack: 12,
  experience: 0,
  experienceToNext: 100,
  job: '無職',
  equipment: {
    weapon: '初心者の剣',
    armor: '初心者の軽防具',
    accessory1: 'なし',
    accessory2: 'なし',
  },
} as const

export const dungeonStocks = [
  { id: 1, name: '森', unlockLevel: 1, icon: 'forest', description: '草木と土に囲まれたダンジョン' },
  { id: 2, name: '遺跡', unlockLevel: 15, icon: 'ruins', description: '崩れた石壁が続く古代遺跡' },
  { id: 3, name: '城', unlockLevel: 30, icon: 'castle', description: '石畳と城壁で構成された古城' },
] as const

export const jobs = [
  { name: '無職', unlockLevel: 1, icon: 'wanderer', feature: '能力の偏りがなく、すべての装備カテゴリを扱える' },
  { name: '戦士', unlockLevel: 5, icon: 'warrior', feature: 'HPと物理攻撃に優れ、剣や槍を得意とする' },
  { name: '魔法使い', unlockLevel: 5, icon: 'mage', feature: '魔法攻撃に特化し、杖と衣服を扱う' },
  { name: '狩人', unlockLevel: 20, icon: 'hunter', feature: '物理攻撃が高く、剣や弓を得意とする' },
  { name: '聖騎士', unlockLevel: 25, icon: 'paladin', feature: '高いHPを持ち、武器と重装備を幅広く扱う' },
  { name: '魔法剣士', unlockLevel: 30, icon: 'spellblade', feature: '物理と魔法の両方を伸ばす複合職' },
] as const
