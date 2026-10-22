export type IconName =
  | 'play' | 'settings' | 'town' | 'dungeon' | 'equipment' | 'status' | 'jobs' | 'save' | 'back'
  | 'forest' | 'ruins' | 'castle' | 'lock' | 'weapon' | 'armor' | 'accessory' | 'bag' | 'spark'
  | 'wanderer' | 'warrior' | 'mage' | 'hunter' | 'paladin' | 'spellblade' | 'volume'

interface IconProps { name: IconName; size?: 'small' | 'medium' | 'large' }

const iconColors: Record<IconName, [string, string, string]> = {
  play: ['#f5d76e', '#fff3b0', '#9a6b22'], settings: ['#8bd3ff', '#dff5ff', '#3979a7'], town: ['#e07a5f', '#f2cc8f', '#6a3d35'], dungeon: ['#67d17c', '#b9ef8d', '#315b3b'],
  equipment: ['#d8e2ec', '#77b5e8', '#546575'], status: ['#ef6a75', '#ffb0a8', '#812f42'], jobs: ['#a98bef', '#e3d6ff', '#59458a'], save: ['#7790a8', '#c4d0db', '#435364'],
  back: ['#ffffff', '#ffffff', '#8291a0'], forest: ['#55c96b', '#a9e276', '#285b36'], ruins: ['#d6ad67', '#f0d49a', '#745b35'], castle: ['#a794e8', '#d9cff8', '#574a82'],
  lock: ['#8b9299', '#c8cdd1', '#4b5158'], weapon: ['#dce8ef', '#8fc7eb', '#556a78'], armor: ['#7eb9e8', '#d5e8f7', '#3e6382'], accessory: ['#f0c959', '#fff0a8', '#9b652d'],
  bag: ['#bb8156', '#e8b377', '#70452e'], spark: ['#f4cf52', '#fff3a0', '#aa6e28'], wanderer: ['#67c8df', '#f0d5ae', '#315f75'], warrior: ['#e56b5f', '#e8d2b0', '#753b35'],
  mage: ['#9a7de0', '#f0d5ae', '#493777'], hunter: ['#68b96b', '#e0c396', '#345f38'], paladin: ['#e3c250', '#e9edf0', '#776228'], spellblade: ['#6fc7df', '#c9a0ef', '#3d5e82'],
  volume: ['#79c9eb', '#dff5ff', '#3a7090'],
}

function PixelArt({ name }: { name: IconName }) {
  const [main, light, dark] = iconColors[name]
  switch (name) {
    case 'back': return <path fill={main} d="M3 7h8v2H3zm0 0 5-5v3h5v6H8v3z" />
    case 'play': return <><path fill={dark} d="M3 2h3v12H3z"/><path fill={main} d="M6 3h3v2h3v2h2v2h-2v2H9v2H6z"/><path fill={light} d="M6 4h2v7H6z"/></>
    case 'settings': return <><path fill={dark} d="M6 1h4l1 3 3 1v4l-3 1-1 4H6l-1-4-3-1V5l3-1z"/><rect fill={main} x="4" y="4" width="8" height="8"/><rect fill="#101216" x="6" y="6" width="4" height="4"/><rect fill={light} x="7" y="6" width="2" height="2"/></>
    case 'dungeon': return <><path fill={dark} d="M2 6l6-5 6 5v9H2z"/><path fill={main} d="M4 7h8v7H4z"/><path fill="#121212" d="M6 9h4v5H6z"/><rect fill={light} x="7" y="9" width="1" height="2"/></>
    case 'equipment': case 'weapon': case 'spellblade': return <><path fill={light} d="M11 1h3v3L7 11 5 9z"/><path fill={main} d="M2 11l2-2 3 3-2 2z"/><path fill={dark} d="M2 13h4v2H2zM8 2h2v4H8z"/>{name === 'spellblade' && <rect fill="#b77bea" x="10" y="2" width="2" height="2"/>}</>
    case 'status': return <><path fill={dark} d="M1 5l2-3h3l2 2 2-2h3l2 3v4l-7 6-7-6z"/><path fill={main} d="M3 5l1-1h2l2 2 2-2h2l1 1v3l-5 4-5-4z"/><rect fill={light} x="4" y="5" width="2" height="2"/></>
    case 'jobs': case 'paladin': return <><path fill={dark} d="M3 2h10v5l-2 6-3 2-3-2-2-6z"/><path fill={main} d="M5 4h6v4H9v4H7V8H5z"/><rect fill={light} x="6" y="4" width="2" height="3"/></>
    case 'save': return <><path fill={dark} d="M2 1h11l2 2v12H2z"/><path fill={main} d="M4 2h7v5H4zM4 9h9v5H4z"/><rect fill={light} x="6" y="10" width="5" height="3"/><rect fill="#1a2025" x="9" y="3" width="2" height="3"/></>
    case 'forest': return <><path fill={dark} d="M6 1h4v2h2v2h2v5H9v5H6v-5H2V5h2V3h2z"/><path fill={main} d="M4 5h8v4H4z"/><rect fill={light} x="6" y="3" width="3" height="3"/><rect fill="#765234" x="7" y="10" width="2" height="5"/></>
    case 'ruins': return <><path fill={dark} d="M2 3h12v3h-1v8H3V6H2z"/><path fill={main} d="M4 6h2v7H4zm6 0h2v7h-2zM7 6h2v3H7z"/><path fill={light} d="M3 2h10v2H3z"/></>
    case 'castle': case 'town': return <><path fill={dark} d="M1 3h3v3h3V3h3v3h3V3h2v12H1z"/><path fill={main} d="M3 7h10v7H3z"/><path fill="#151515" d="M7 10h3v4H7z"/><rect fill={light} x="4" y="8" width="2" height="2"/><rect fill={light} x="11" y="8" width="1" height="2"/></>
    case 'lock': return <><path fill={dark} d="M4 6V4l2-3h4l2 3v2h2v9H2V6zm2 0h4V4L9 3H7L6 4z"/><rect fill={main} x="4" y="8" width="8" height="5"/><rect fill={light} x="7" y="9" width="2" height="2"/></>
    case 'armor': return <><path fill={dark} d="M4 2l4-1 4 1 3 4-3 2v7H4V8L1 6z"/><path fill={main} d="M5 3l3 2 3-2 2 3-3 2v5H6V8L3 6z"/><rect fill={light} x="6" y="5" width="2" height="6"/></>
    case 'accessory': return <><path fill={dark} d="M5 1h6l3 5-6 9-6-9z"/><path fill={main} d="M5 3h6l1 3-4 6-4-6z"/><rect fill={light} x="6" y="4" width="3" height="3"/></>
    case 'bag': return <><path fill={dark} d="M5 1h6l1 4 3 3-1 7H2L1 8l3-3z"/><path fill={main} d="M4 6h8l1 2-1 5H4L3 8z"/><path fill={light} d="M6 2h4v3H6z"/></>
    case 'spark': return <><path fill={dark} d="M7 0h2l1 5 5 2v2l-5 2-1 5H7l-2-5-5-2V7l5-2z"/><path fill={main} d="M8 3l1 4 4 1-4 1-1 4-1-4-4-1 4-1z"/><rect fill={light} x="7" y="6" width="2" height="2"/></>
    case 'warrior': case 'wanderer': case 'mage': case 'hunter': return <><path fill={dark} d="M5 1h6l3 5-2 4v5H4v-5L2 6z"/><path fill={main} d={name === 'mage' ? 'M3 5l5-5 5 5-2 2v6H5V7z' : 'M4 4h8v5l-2 3H6L4 9z'}/><rect fill={light} x="6" y="5" width="2" height="2"/><rect fill={light} x="10" y="5" width="1" height="2"/>{name === 'hunter' && <path fill="#7a5432" d="M1 2h2v12H1zm12 0h2v12h-2z"/>}</>
    case 'volume': return <><path fill={dark} d="M1 6h4l4-4v12l-4-4H1z"/><path fill={main} d="M3 7h3l2-2v6L6 9H3z"/><path fill={light} d="M11 5h2v2h1v2h-1v2h-2V9h1V7h-1z"/></>
  }
}

export function Icon({ name, size = 'medium' }: IconProps) {
  return <span className={`icon icon--${size} icon--${name}`} aria-hidden="true"><svg viewBox="0 0 16 16" role="presentation" focusable="false"><PixelArt name={name} /></svg></span>
}
