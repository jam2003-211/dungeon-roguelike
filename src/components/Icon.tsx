export type IconName =
  | 'play' | 'settings' | 'town' | 'dungeon' | 'equipment' | 'status' | 'jobs' | 'save' | 'back'
  | 'forest' | 'ruins' | 'castle' | 'lock' | 'weapon' | 'armor' | 'accessory' | 'bag' | 'spark'
  | 'wanderer' | 'warrior' | 'mage' | 'hunter' | 'paladin' | 'spellblade' | 'volume'

const glyphs: Record<IconName, string> = {
  play: '▶', settings: '⚙', town: '⌂', dungeon: '◆', equipment: '⚔', status: '♥', jobs: '♜', save: '▣', back: '‹',
  forest: '♣', ruins: 'Π', castle: '♛', lock: '●', weapon: '†', armor: '⬟', accessory: '◇', bag: '▤', spark: '✦',
  wanderer: '○', warrior: '⚔', mage: '✧', hunter: '➶', paladin: '♜', spellblade: '✦', volume: '◖',
}

interface IconProps {
  name: IconName
  size?: 'small' | 'medium' | 'large'
}

export function Icon({ name, size = 'medium' }: IconProps) {
  return <span className={`icon icon--${size}`} aria-hidden="true">{glyphs[name]}</span>
}
