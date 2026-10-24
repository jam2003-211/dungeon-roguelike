import { useEffect, useRef } from 'react'
import { drawBattleEffect } from '../game/battleEffectDrawing'
import { BATTLE_EFFECT_DURATION, type BattleEffect } from '../game/combatVisuals'
import type { Position } from '../game/forestMap'

interface Props { events: BattleEffect[]; turn: number; camera: Position }

export function BattleEffectsCanvas({ events, turn, camera }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current, context = canvas?.getContext('2d')
    if (!canvas || !context || !events.length) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? 150 : BATTLE_EFFECT_DURATION
    let frame = 0
    const start = performance.now()
    canvas.dataset.effects = events.map((event) => `${event.kind}:${event.effect}`).join(' ')
    const draw = (time: number) => {
      const progress = (time - start) / duration
      context.clearRect(0, 0, 440, 440)
      if (progress >= 1) { canvas.dataset.effects = ''; return }
      context.save()
      // マップ外には演出を描かない。飛び道具は画面外の発射元にも対応する。
      context.beginPath(); context.rect(-camera.x * 40, -camera.y * 40, 800, 800); context.clip()
      for (const event of events) drawBattleEffect(context, event, reduced ? .55 : progress, camera)
      context.restore()
      if (!reduced) frame = requestAnimationFrame(draw)
    }
    draw(start)
    const timer = reduced ? window.setTimeout(() => { context.clearRect(0, 0, 440, 440); canvas.dataset.effects = '' }, duration) : undefined
    return () => {
      cancelAnimationFrame(frame); window.clearTimeout(timer)
      context.clearRect(0, 0, 440, 440); canvas.dataset.effects = ''
    }
  }, [events, turn, camera.x, camera.y])
  return <canvas ref={canvasRef} className="battle-effects" width={440} height={440} aria-hidden="true" />
}
