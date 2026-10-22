import { assetUrl } from '../assets'
import type { SpecialEffectId } from './player'

export const specialEffectAssetPaths: Readonly<Record<SpecialEffectId, string>> = {
  poison: assetUrl('assets/special-effects/poison.png'),
  burn: assetUrl('assets/special-effects/burn.png'),
  slow: assetUrl('assets/special-effects/slow.png'),
  stun: assetUrl('assets/special-effects/stun.png'),
  knockback: assetUrl('assets/special-effects/knockback.png'),
  critical: assetUrl('assets/special-effects/critical.png'),
  lifesteal: assetUrl('assets/special-effects/lifesteal.png'),
  extraAttack: assetUrl('assets/special-effects/extra_attack.png'),
}
