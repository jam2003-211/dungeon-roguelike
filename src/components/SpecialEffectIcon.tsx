import { PixelAsset } from './PixelAsset'
import { specialEffectAssetPaths } from '../game/specialEffectAssets'
import type { SpecialEffectId } from '../game/player'

export function SpecialEffectIcon({ effect }: { effect: SpecialEffectId }) {
  return <PixelAsset className="special-effect-icon" src={specialEffectAssetPaths[effect]} alt="" />
}
