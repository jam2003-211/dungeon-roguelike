import { useState } from 'react'
import { Icon, type IconName } from './Icon'

interface PixelAssetProps {
  src: string
  fallbackSrc?: string
  fallbackIcon?: IconName
  fallbackSize?: 'small' | 'medium' | 'large'
  alt: string
  className?: string
}

export function PixelAsset({ src, fallbackSrc, fallbackIcon, fallbackSize, alt, className }: PixelAssetProps) {
  const [failed, setFailed] = useState(false)
  if (failed && !fallbackSrc) return fallbackIcon ? <Icon name={fallbackIcon} size={fallbackSize} /> : null
  return <img className={className} src={failed ? fallbackSrc : src} alt={alt} draggable={false} onError={() => setFailed(true)} />
}
