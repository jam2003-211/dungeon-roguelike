import { useState } from 'react'

interface PixelAssetProps {
  src: string
  fallbackSrc?: string
  alt: string
  className?: string
}

export function PixelAsset({ src, fallbackSrc, alt, className }: PixelAssetProps) {
  const [failed, setFailed] = useState(false)
  if (failed && !fallbackSrc) return null
  return <img className={className} src={failed ? fallbackSrc : src} alt={alt} draggable={false} onError={() => setFailed(true)} />
}
