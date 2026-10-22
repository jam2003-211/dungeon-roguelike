import type { EnemyKind } from './game/combat/combat'
import type { ArmorType, EquipmentItem, JobId, SkillId, WeaponType } from './game/player'

const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`

export function assetUrl(path: string): string {
  return `${baseUrl}${path.replace(/^\//, '')}`
}

export const enemyAssetPaths: Readonly<Record<EnemyKind, string>> = {
  goblin: assetUrl('assets/enemies/goblin.png'),
  boar: assetUrl('assets/enemies/boar.png'),
  slimeKing: assetUrl('assets/enemies/slime_king.png'),
  cyclopsBat: assetUrl('assets/enemies/one_eye_bat.png'),
  stoneGolem: assetUrl('assets/enemies/stone_golem.png'),
  ghost: assetUrl('assets/enemies/ghost.png'),
}

export const enemyFallbackPaths: Readonly<Record<EnemyKind, string>> = {
  goblin: assetUrl('assets/enemies/goblin.svg'),
  boar: assetUrl('assets/enemies/boar.svg'),
  slimeKing: assetUrl('assets/enemies/slime-king.svg'),
  cyclopsBat: assetUrl('assets/enemies/cyclops-bat.svg'),
  stoneGolem: assetUrl('assets/enemies/stone-golem.svg'),
  ghost: assetUrl('assets/enemies/ghost.svg'),
}

export const jobAssetPaths: Readonly<Record<JobId, string>> = {
  unemployed: assetUrl('assets/jobs/none.png'),
  warrior: assetUrl('assets/jobs/warrior.png'),
  mage: assetUrl('assets/jobs/mage.png'),
  hunter: assetUrl('assets/jobs/hunter.png'),
  paladin: assetUrl('assets/jobs/paladin.png'),
  spellblade: assetUrl('assets/jobs/spellblade.png'),
}

export const weaponAssetPaths: Readonly<Record<WeaponType, string>> = {
  sword: assetUrl('assets/weapons/sword.png'),
  spear: assetUrl('assets/weapons/spear.png'),
  bow: assetUrl('assets/weapons/bow.png'),
  shortStaff: assetUrl('assets/weapons/wand.png'),
  longStaff: assetUrl('assets/weapons/staff.png'),
}

export const armorAssetPaths: Readonly<Record<ArmorType, string>> = {
  heavyArmor: assetUrl('assets/armors/heavy_armor.png'),
  lightArmor: assetUrl('assets/armors/light_armor.png'),
  heavyRobe: assetUrl('assets/armors/heavy_clothes.png'),
  lightRobe: assetUrl('assets/armors/light_clothes.png'),
}

export const skillAssetPaths: Readonly<Record<SkillId, string>> = {
  strongStrike: assetUrl('assets/skills/strong_strike.png'),
  magicBolt: assetUrl('assets/skills/magic_bullet.png'),
  piercingShot: assetUrl('assets/skills/piercing_strike.png'),
  shockwave: assetUrl('assets/skills/shockwave.png'),
  flame: assetUrl('assets/skills/flame.png'),
  smallHeal: assetUrl('assets/skills/minor_heal.png'),
  largeHeal: assetUrl('assets/skills/major_heal.png'),
  poisonStrike: assetUrl('assets/skills/poison_strike.png'),
  slowSpell: assetUrl('assets/skills/slow_magic.png'),
  stunStrike: assetUrl('assets/skills/stun_strike.png'),
  dash: assetUrl('assets/skills/dash.png'),
  guard: assetUrl('assets/skills/guard.png'),
}

export function equipmentAssetPath(item: EquipmentItem): string | null {
  if (item.category === 'weapon') return weaponAssetPaths[item.subtype as WeaponType]
  if (item.category === 'armor') return armorAssetPaths[item.subtype as ArmorType]
  if (item.name === '力の護符' || item.name === '魔力の護符') return assetUrl('assets/accessories/ring.png')
  return assetUrl('assets/accessories/necklace.png')
}

const imageCache = new Map<string, HTMLImageElement>()

export function loadCachedImage(path: string, fallbackPath?: string): HTMLImageElement {
  const cached = imageCache.get(path)
  if (cached) return cached
  const image = new Image()
  image.decoding = 'async'
  if (fallbackPath) image.addEventListener('error', () => {
    if (image.src !== new URL(fallbackPath, window.location.href).href) image.src = fallbackPath
  }, { once: true })
  image.src = path
  imageCache.set(path, image)
  return image
}
