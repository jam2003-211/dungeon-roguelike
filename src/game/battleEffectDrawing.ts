import type { BattleEffect } from './combatVisuals'
import type { Position } from './forestMap'

const CELL = 40
const DOT = 4
const snap = (value: number) => Math.round(value / DOT) * DOT

function pixel(c: CanvasRenderingContext2D, x: number, y: number, width = DOT, height = DOT) {
  c.fillRect(snap(x), snap(y), Math.max(DOT, snap(width)), Math.max(DOT, snap(height)))
}

function beam(c: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, thickness = DOT) {
  const count = Math.max(1, Math.ceil(Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY)) / DOT))
  for (let i = 0; i <= count; i++) pixel(c, fromX + (toX - fromX) * i / count, fromY + (toY - fromY) * i / count, thickness, thickness)
}

function frame(c: CanvasRenderingContext2D, radius: number) {
  const r = Math.max(DOT, snap(radius))
  pixel(c, -r, -r, r * 2 + DOT, DOT)
  pixel(c, -r, r, r * 2 + DOT, DOT)
  pixel(c, -r, -r, DOT, r * 2 + DOT)
  pixel(c, r, -r, DOT, r * 2 + DOT)
}

function cross(c: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = snap(size)
  pixel(c, x - s / 2, y, s + DOT, DOT)
  pixel(c, x, y - s / 2, DOT, s + DOT)
}

function star(c: CanvasRenderingContext2D, x: number, y: number, size: number) {
  cross(c, x, y, size)
  const r = snap(size / 2)
  for (const signX of [-1, 1]) for (const signY of [-1, 1]) {
    pixel(c, x + signX * r, y + signY * r)
    pixel(c, x + signX * (r - DOT), y + signY * (r - DOT))
  }
}

function slash(c: CanvasRenderingContext2D, size: number, reverse = false) {
  const r = snap(size)
  for (let x = -r; x <= r; x += DOT) {
    const y = reverse ? x : -x
    pixel(c, x, y, DOT * 2, DOT)
  }
}

function fire(c: CanvasRenderingContext2D, progress: number, large: boolean) {
  const rise = snap(progress * 8)
  const columns = large ? [-12, 0, 12] : [0]
  c.fillStyle = '#ed4b34'
  for (const x of columns) {
    pixel(c, x - DOT, 8 - rise, DOT * 3, DOT * 2)
    pixel(c, x, -4 - rise, DOT * 2, DOT * 3)
    pixel(c, x + DOT, -12 - rise, DOT, DOT * 2)
  }
  c.fillStyle = '#ff9d35'
  for (const x of columns) pixel(c, x, 0 - rise, DOT * 2, DOT * 2)
  c.fillStyle = '#ffe487'
  pixel(c, 0, 4 - rise, DOT, DOT * 2)
}

function particles(c: CanvasRenderingContext2D, progress: number, count: number, spread: number) {
  for (let i = 0; i < count; i++) {
    const x = (i % 5 - 2) * spread
    const y = (Math.floor(i / 5) - 1) * spread - snap(progress * (8 + i % 3 * 4))
    pixel(c, x, y)
  }
}

function wave(c: CanvasRenderingContext2D, progress: number, count: number) {
  for (let i = 0; i < count; i++) frame(c, 4 + snap(progress * 16) + i * 8)
}

function drawBoss(c: CanvasRenderingContext2D, event: Extract<BattleEffect, { kind: 'boss' }>, p: number, dx: number, dy: number) {
  if (event.theme === 'forest') {
    c.fillStyle = '#765337'
    if (event.effect === 'sweep') {
      beam(c, -20, 8 - p * 8, 20, 8 - p * 8, 8)
      c.fillStyle = '#7fb654'; for (let x = -16; x <= 16; x += 8) pixel(c, x, -8 - p * 8)
    } else if (event.effect === 'surround') {
      for (const x of [-16, 0, 16]) { pixel(c, x, 8, 8, 8); pixel(c, x + 4, -8 - p * 8, 4, 16) }
      c.fillStyle = '#7fb654'; particles(c, p, 5, 8)
    } else {
      pixel(c, -8, 8, 20, 8); pixel(c, -4, -8 - p * 8, 12, 20)
      c.fillStyle = '#7fb654'; pixel(c, -12, -12 - p * 8); pixel(c, 8, -16 - p * 8)
    }
    return
  }
  if (event.theme === 'ruins') {
    c.fillStyle = '#8795a3'
    if (event.effect === 'charge') {
      beam(c, dx, dy, 0, 0, 8)
      c.fillStyle = '#83c9ef'; for (const offset of [-8, 0, 8]) pixel(c, offset, -8, 8, 8)
    } else if (event.effect === 'cross') {
      cross(c, 0, 0, 38); c.fillStyle = '#83c9ef'; cross(c, 0, 0, 22)
    } else {
      frame(c, 8 + p * 12)
      for (const offset of [-12, 0, 12]) beam(c, offset, 12, offset + 4, -12, 4)
      c.fillStyle = '#83c9ef'; pixel(c, 0, 0, 8, 8)
    }
    return
  }
  c.fillStyle = '#d84b54'
  if (event.effect === 'flameWave') {
    for (const x of [-12, 0, 12]) { pixel(c, x, 8, 8, 8); pixel(c, x + 4, -8 - p * 12, 4, 20) }
    c.fillStyle = '#ad70e1'; particles(c, p, 5, 8)
  } else if (event.effect === 'doubleBurst') {
    frame(c, 6 + p * 12); c.fillStyle = '#ad70e1'; star(c, 0, 0, 20)
  } else if (event.effect === 'release') {
    wave(c, p, 2); c.fillStyle = '#ad70e1'; particles(c, p, 10, 7)
  } else {
    star(c, 0, 0, 16 + p * 12); c.fillStyle = '#ad70e1'; particles(c, p, 5, 8)
  }
}

// 判定済みの発動位置に短い矩形ドットを重ねる。描画は戦闘の確定を待たせない。
export function drawBattleEffect(c: CanvasRenderingContext2D, event: BattleEffect, progress: number, camera: Position) {
  const p = Math.max(0, Math.min(1, progress))
  const dx = (event.from.x - event.position.x) * CELL
  const dy = (event.from.y - event.position.y) * CELL
  c.save()
  c.imageSmoothingEnabled = false
  c.translate((event.position.x - camera.x + .5) * CELL, (event.position.y - camera.y + .5) * CELL)
  // 赤い警告を覆わないよう、明るい点だけを半透明で描く。
  c.globalAlpha = Math.min(.78, (1 - p) * 1.6)
  c.fillStyle = '#fff3b0'
  if (event.kind === 'boss') drawBoss(c, event, p, dx, dy)
  else switch (`${event.kind}:${event.effect}`) {
    case 'skill:strongStrike':
      slash(c, 20); c.fillStyle = '#fff'; slash(c, 12); break
    case 'skill:magicBolt': {
      const x = snap(dx * (1 - p)), y = snap(dy * (1 - p))
      c.fillStyle = '#9679ff'; beam(c, dx, dy, x, y)
      c.fillStyle = '#eee2ff'; pixel(c, x - 4, y - 4, 12, 12); break
    }
    case 'skill:piercingShot':
      c.fillStyle = '#63f3ff'; beam(c, dx, dy, 0, 0, 8)
      c.fillStyle = '#fff'; beam(c, dx, dy, 0, 0); break
    case 'skill:shockwave':
      c.fillStyle = '#eed9ad'; wave(c, p, 2); break
    case 'skill:flame': fire(c, p, true); break
    case 'skill:smallHeal':
      c.fillStyle = '#86f8a5'; cross(c, 0, -p * 12, 12); particles(c, p, 3, 8); break
    case 'skill:largeHeal':
      c.fillStyle = '#a5ffcd'; cross(c, 0, -p * 8, 20); frame(c, 8 + p * 12); particles(c, p, 10, 8); break
    case 'skill:poisonStrike':
      c.fillStyle = '#cf8dff'; slash(c, 16); c.fillStyle = '#a85bd6'; particles(c, p, 5, 8); break
    case 'skill:slowSpell':
      c.fillStyle = '#85c9ff'; wave(c, p, 2); pixel(c, -8, 4 - p * 8); pixel(c, 8, 4 - p * 8); break
    case 'skill:stunStrike':
      c.fillStyle = '#fff59a'; star(c, 0, 0, 24); star(c, -16, -16 - p * 8, 8); star(c, 16, -16 - p * 8, 8); break
    case 'skill:dash':
      c.fillStyle = '#a4e5ff'
      for (let i = 0; i < 4; i++) {
        c.globalAlpha = (1 - p) * (4 - i) / 5
        const x = snap(dx * (1 - p) * i / 3), y = snap(dy * (1 - p) * i / 3)
        pixel(c, x - 8, y - 12, 16, 4); pixel(c, x - 8, y - 8, 4, 20); pixel(c, x + 4, y - 8, 4, 20)
      }
      break
    case 'skill:guard':
      c.fillStyle = '#80c7ff'
      pixel(c, -12, -16, 28, 4); pixel(c, -12, -12, 4, 20); pixel(c, 12, -12, 4, 20)
      pixel(c, -8, 8, 20, 4); pixel(c, -4, 12, 12, 4); pixel(c, 0, 16)
      c.fillStyle = '#c6e6ff'; cross(c, 0, -4, 12); break
    case 'special:poison':
      c.fillStyle = '#c673ec'; particles(c, p, 4, 8); pixel(c, -8, -12 - p * 8, 8, 8); break
    case 'special:burn': fire(c, p, false); break
    case 'special:slow':
      c.fillStyle = '#67bcff'; for (const y of [-12, 0, 12]) { pixel(c, -16, y + p * 4, 12, 4); pixel(c, -4, y + 4 + p * 4, 12, 4); pixel(c, 8, y + p * 4, 8, 4) } break
    case 'special:stun':
      c.fillStyle = '#ffe567'; star(c, -12, -12 - p * 8, 8); star(c, 12, -8 - p * 8, 8); star(c, 0, 8 - p * 8, 8); break
    case 'special:knockback':
      c.fillStyle = '#e4f5ff'
      for (let i = 0; i < 3; i++) { const x = snap(-20 + i * 12 + p * 8); pixel(c, x, -8, 12, 4); pixel(c, x + 4, 0, 12, 4); pixel(c, x, 8, 12, 4) } break
    case 'special:critical':
      c.fillStyle = '#ffcb4b'; star(c, 0, 0, 32); c.fillStyle = '#fff'; cross(c, 0, 0, 16); break
    case 'special:lifesteal':
      c.fillStyle = '#fa6d85'
      for (let i = 0; i < 4; i++) { const t = Math.max(0, 1 - p - i * .09); pixel(c, dx * t, dy * t + (i % 2 ? 8 : -8)) } break
    case 'special:extraAttack':
      c.fillStyle = '#e1c9ff'; slash(c, 16)
      if (p > .25) { c.fillStyle = '#fff'; slash(c, 20, true) } break
  }
  if (event.value) {
    c.globalAlpha = Math.min(1, (1 - p) * 2)
    c.fillStyle = '#a5ffbd'; c.strokeStyle = '#101010'; c.lineWidth = 3
    c.font = 'bold 12px monospace'; c.textAlign = 'center'
    c.strokeText(`+${event.value}`, 0, snap(-24 - p * 8))
    c.fillText(`+${event.value}`, 0, snap(-24 - p * 8))
  }
  c.restore()
}
