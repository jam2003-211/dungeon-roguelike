import type { BattleEffect } from './combatVisuals'
import type { Position } from './forestMap'

const CELL = 40
const TAU = Math.PI * 2

function line(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke()
}
function ring(c: CanvasRenderingContext2D, radius: number) {
  c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.stroke()
}
function cross(c: CanvasRenderingContext2D, x: number, y: number, size: number) {
  c.fillRect(x - size / 2, y - 2, size, 4); c.fillRect(x - 2, y - size / 2, 4, size)
}
function star(c: CanvasRenderingContext2D, x: number, y: number, size: number, points = 5) {
  c.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const a = i * Math.PI / points - Math.PI / 2, r = i % 2 ? size * .4 : size
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
    if (i) c.lineTo(px, py); else c.moveTo(px, py)
  }
  c.closePath(); c.fill()
}
function slash(c: CanvasRenderingContext2D, size: number, reverse = false) {
  const sign = reverse ? -1 : 1
  line(c, -size, size * sign, size, -size * sign)
}
function fire(c: CanvasRenderingContext2D, p: number, large: boolean) {
  c.fillStyle = large ? '#ff681f' : '#ed4b34'
  for (let i = 0; i < (large ? 3 : 1); i++) {
    const x = (i - (large ? 1 : 0)) * 9, height = 16 + Math.sin(p * 8 + i) * 5
    c.beginPath(); c.moveTo(x - 7, 9); c.lineTo(x - 4, -height / 2); c.lineTo(x, -height); c.lineTo(x + 7, 9); c.closePath(); c.fill()
  }
  c.fillStyle = '#ffd66f'; c.fillRect(-3, -5, 6, 12)
}

// ワールド座標は発動が確定した時点のもの。カメラ移動や敵移動で着弾点を変えない。
export function drawBattleEffect(c: CanvasRenderingContext2D, event: BattleEffect, progress: number, camera: Position) {
  const p = Math.max(0, Math.min(1, progress))
  const dx = (event.from.x - event.position.x) * CELL, dy = (event.from.y - event.position.y) * CELL
  c.save()
  c.translate((event.position.x - camera.x + .5) * CELL, (event.position.y - camera.y + .5) * CELL)
  c.globalAlpha = Math.min(1, (1 - p) * 2)
  c.lineWidth = 3; c.strokeStyle = '#fff3b0'; c.fillStyle = '#fff3b0'
  if (event.kind === 'boss') {
    const palette = event.theme === 'forest' ? ['#7fb654', '#704c31'] : event.theme === 'ruins' ? ['#84c2e5', '#9aa2ab'] : ['#ff665b', '#b169db']
    c.strokeStyle = palette[0]; c.fillStyle = palette[1]; c.lineWidth = 2
    if (event.effect === 'charge' || event.effect === 'sweep' || event.effect === 'flameWave' || event.effect === 'cross') {
      line(c, -16, -16 + p * 8, 16, 16 - p * 8); line(c, -16, 16 - p * 8, 16, -16 + p * 8)
    } else if (event.effect === 'surround' || event.effect === 'doubleBurst') {
      star(c, 0, 0, 8 + p * 13, 5)
    } else {
      ring(c, 5 + p * 16); cross(c, 0, 0, 8 + p * 14)
    }
    c.restore(); return
  }
  switch (`${event.kind}:${event.effect}`) {
    case 'skill:strongStrike':
      c.lineWidth = 6; slash(c, 21 * (.5 + p)); c.strokeStyle = '#fff'; c.lineWidth = 2; slash(c, 18); break
    case 'skill:magicBolt':
      c.translate(dx * (1 - p), dy * (1 - p)); c.strokeStyle = '#c9a5ff'; line(c, dx * .15, dy * .15, 0, 0)
      c.fillStyle = '#e9dcff'; c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill(); c.strokeStyle = '#9679ff'; ring(c, 9); break
    case 'skill:piercingShot':
      c.strokeStyle = '#63f3ff'; c.lineWidth = 7 * (1 - p) + 1; line(c, dx, dy, 0, 0)
      c.strokeStyle = '#fff'; c.lineWidth = 1; line(c, dx, dy, 0, 0); break
    case 'skill:shockwave':
      c.strokeStyle = '#eed9ad'; c.lineWidth = 4 * (1 - p) + 1; ring(c, 8 + p * 50); ring(c, 3 + p * 35); break
    case 'skill:flame': fire(c, p, true); break
    case 'skill:smallHeal':
      c.fillStyle = '#86f8a5'; cross(c, 0, -p * 12, 13); c.strokeStyle = '#58d381'; ring(c, 7 + p * 10); break
    case 'skill:largeHeal':
      c.fillStyle = '#a5ffcd'; cross(c, 0, -p * 8, 21); cross(c, -15, 8 - p * 17, 8); cross(c, 15, 8 - p * 17, 8)
      c.strokeStyle = '#68efb2'; ring(c, 12 + p * 17); ring(c, 6 + p * 17); break
    case 'skill:poisonStrike':
      c.strokeStyle = '#cf8dff'; c.lineWidth = 4; slash(c, 16); c.fillStyle = '#b25be4'
      for (let i = 0; i < 4; i++) c.fillRect(-15 + i * 9, 12 - p * (10 + i * 4), 4, 4); break
    case 'skill:slowSpell':
      c.strokeStyle = '#85c9ff'; c.setLineDash([4, 4]); ring(c, 8 + p * 19); ring(c, 3 + p * 15); c.setLineDash([])
      line(c, -7, -9 + p * 12, 0, p * 12); line(c, 0, p * 12, 7, -9 + p * 12); break
    case 'skill:stunStrike':
      c.fillStyle = '#fff59a'; star(c, 0, 0, 18, 8); star(c, -14, -17 - p * 7, 6); star(c, 14, -17 - p * 7, 6); break
    case 'skill:dash':
      for (let i = 0; i < 4; i++) {
        c.globalAlpha = (1 - p) * (4 - i) / 5; c.strokeStyle = '#a4e5ff'
        c.strokeRect(dx * (1 - p) * i / 3 - 8, dy * (1 - p) * i / 3 - 11, 16, 22)
      }
      break
    case 'skill:guard':
      c.strokeStyle = '#80c7ff'; c.fillStyle = 'rgba(87, 154, 255, .2)'
      c.beginPath(); c.moveTo(-15, -17); c.lineTo(15, -17); c.lineTo(12, 5); c.lineTo(0, 18); c.lineTo(-12, 5); c.closePath(); c.fill(); c.stroke()
      c.fillStyle = '#c6e6ff'; cross(c, 0, -3, 14); break
    case 'special:poison':
      c.strokeStyle = '#c673ec'
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(-12 + i * 8, 8 - p * (18 + i * 4), 2 + i % 2, 0, TAU); c.stroke() }
      break
    case 'special:burn': fire(c, p, false); break
    case 'special:slow':
      c.strokeStyle = '#67bcff'
      for (let i = 0; i < 3; i++) { const y = -8 + i * 9 + p * 6; line(c, -15, y - 3, 0, y + 2); line(c, 0, y + 2, 15, y - 3) }
      break
    case 'special:stun':
      c.fillStyle = '#ffe567'
      for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + p * 2; star(c, Math.cos(a) * 15, -12 + Math.sin(a) * 6, 6) }
      break
    case 'special:knockback':
      c.rotate(Math.atan2(-dy, -dx)); c.strokeStyle = '#e4f5ff'
      for (let i = 0; i < 3; i++) { const x = -22 + i * 10 + p * 8; line(c, x - 5, -8, x + 2, 0); line(c, x + 2, 0, x - 5, 8) }
      break
    case 'special:critical':
      c.fillStyle = '#ffcb4b'; star(c, 0, 0, 24 * (.7 + p * .5), 8); c.fillStyle = '#fff'; star(c, 0, 0, 10, 4); break
    case 'special:lifesteal':
      c.fillStyle = '#fa6d85'
      for (let i = 0; i < 4; i++) { const t = Math.max(0, 1 - p - i * .09); c.fillRect(dx * t - 2, dy * t - 2 + Math.sin(t * Math.PI) * (i % 2 ? 8 : -8), 4, 4) }
      break
    case 'special:extraAttack':
      c.strokeStyle = '#e1c9ff'; c.lineWidth = 3; slash(c, 15)
      if (p > .25) { c.strokeStyle = '#fff'; slash(c, 18, true) }
      break
  }
  if (event.value) {
    c.globalAlpha = Math.min(1, (1 - p) * 2); c.fillStyle = '#a5ffbd'; c.strokeStyle = '#101010'; c.lineWidth = 3
    c.font = 'bold 12px monospace'; c.textAlign = 'center'
    c.strokeText(`+${event.value}`, 0, -21 - p * 10); c.fillText(`+${event.value}`, 0, -21 - p * 10)
  }
  c.restore()
}
