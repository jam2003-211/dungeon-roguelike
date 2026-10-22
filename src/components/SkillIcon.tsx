import type { SkillId } from '../game/player'
import { skillAssetPaths } from '../assets'
import { PixelAsset } from './PixelAsset'

export function SkillIcon({ skillId, className = 'skill-icon' }: { skillId: SkillId; className?: string }) {
  return <PixelAsset className={className} src={skillAssetPaths[skillId]} fallbackIcon="spark" fallbackSize="small" alt="" />
}
