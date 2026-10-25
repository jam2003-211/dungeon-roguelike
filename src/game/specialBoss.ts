import type { DungeonTheme } from './dungeon'
import type { ForestMap, Position } from './forestMap'

export type BossPattern = 'roots' | 'sweep' | 'surround' | 'slam' | 'cross' | 'charge' | 'flameWave' | 'burst' | 'doubleBurst' | 'release'
export const SPECIAL_BOSS_PATTERNS: Readonly<Record<DungeonTheme, readonly BossPattern[]>> = {
  forest: ['roots', 'sweep', 'surround'], ruins: ['slam', 'cross', 'charge'], castle: ['flameWave', 'burst', 'doubleBurst', 'release'],
}
export const SPECIAL_BOSS_INTERVALS: Readonly<Record<BossPattern, number>> = {
  roots: 3, sweep: 5, surround: 7, slam: 3, cross: 5, charge: 7, flameWave: 3, burst: 5, doubleBurst: 7, release: 8,
}
export interface BossPlan { pattern: BossPattern; cells: Position[]; destination?: Position; followUpCells?: Position[] }

export function bossCells(anchor: Position, special = false): Position[] {
  return special ? [anchor, { x: anchor.x + 1, y: anchor.y }, { x: anchor.x, y: anchor.y + 1 }, { x: anchor.x + 1, y: anchor.y + 1 }] : [anchor]
}
export function occupiesBoss(anchor: Position, cell: Position, special = false): boolean {
  return bossCells(anchor, special).some((part) => part.x === cell.x && part.y === cell.y)
}
export function distanceToBoss(from: Position, anchor: Position, special = false): number {
  return Math.min(...bossCells(anchor, special).map((part) => Math.abs(part.x - from.x) + Math.abs(part.y - from.y)))
}

const inside = (map: ForestMap, p: Position) => p.x >= 0 && p.y >= 0 && p.y < map.length && p.x < (map[p.y]?.length ?? 0)
const area = (center: Position, radius: number): Position[] => {
  const cells: Position[] = []
  for (let y = center.y - radius; y <= center.y + radius; y++) for (let x = center.x - radius; x <= center.x + radius; x++) cells.push({ x, y })
  return cells
}
// 着弾点と斜めを危険にし、上下左右には1歩で逃げられる道を残す。
const dodgeableBurst = (center: Position, enraged: boolean): Position[] => [
  center,
  ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y]) => ({ x: center.x + x, y: center.y + y })),
  ...(enraged ? [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2]].map(([x, y]) => ({ x: center.x + x, y: center.y + y })) : []),
]
const unique = (cells: Position[], map: ForestMap): Position[] => {
  const seen = new Set<string>()
  return cells.filter((cell) => { const key = `${cell.x},${cell.y}`; if (!inside(map, cell) || seen.has(key)) return false; seen.add(key); return true })
}

// 予告と実際の命中判定は同じ cells を使用する。対象地点は作成時に固定する。
export function specialBossPlan(theme: DungeonTheme, anchor: Position, player: Position, map: ForestMap, attackIndex: number, enraged: boolean): BossPlan {
  const footprint = bossCells(anchor, true)
  const center = { x: anchor.x + 1, y: anchor.y + 1 }
  if (theme === 'forest') {
    const pattern = (['roots', 'sweep', 'surround'] as const)[attackIndex % 3]
    if (pattern === 'roots') return { pattern, cells: unique(dodgeableBurst(player, enraged), map) }
    if (pattern === 'sweep') return { pattern, cells: unique(Array.from({ length: map.length }, (_, n) => Math.abs(player.x - center.x) > Math.abs(player.y - center.y) ? { x: n, y: player.y } : { x: player.x, y: n }), map) }
    const offsets = enraged ? [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2]] : [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]]
    return { pattern, cells: unique(offsets.map(([x, y]) => ({ x: player.x + x, y: player.y + y })), map) }
  }
  if (theme === 'ruins') {
    const pattern = (['slam', 'cross', 'charge'] as const)[attackIndex % 3]
    if (pattern === 'slam') return { pattern, cells: unique([...footprint.flatMap((part) => area(part, 1)), ...(enraged ? [
      { x: anchor.x - 2, y: anchor.y - 2 }, { x: anchor.x + 3, y: anchor.y - 2 },
      { x: anchor.x - 2, y: anchor.y + 3 }, { x: anchor.x + 3, y: anchor.y + 3 },
    ] : [])], map) }
    if (pattern === 'cross') return { pattern, cells: unique(Array.from({ length: map.length }, (_, n) => [{ x: n, y: center.y }, { x: center.x, y: n }]).flat(), map) }
    const horizontal = Math.abs(player.x - center.x) >= Math.abs(player.y - center.y)
    const step = horizontal ? { x: Math.sign(player.x - center.x), y: 0 } : { x: 0, y: Math.sign(player.y - center.y) }
    let destination = anchor; const cells: Position[] = []
    for (let n = 0; n < (enraged ? 4 : 3); n++) {
      const next = { x: destination.x + step.x, y: destination.y + step.y }
      if (!bossCells(next, true).every((part) => inside(map, part))) break
      if (occupiesBoss(next, player, true)) { cells.push({ ...player }); break }
      destination = next; cells.push(...bossCells(destination, true))
    }
    return { pattern, cells: unique(cells, map), destination }
  }
  const pattern = (['flameWave', 'burst', 'doubleBurst', 'release'] as const)[attackIndex % 4]
  if (pattern === 'flameWave') return { pattern, cells: unique(Array.from({ length: map.length }, (_, n) => [{ x: n, y: player.y }, ...(enraged ? [{ x: n, y: Math.min(map.length - 1, player.y + 2) }] : [])]).flat(), map) }
  if (pattern === 'burst') return { pattern, cells: unique(dodgeableBurst(player, enraged), map) }
  if (pattern === 'doubleBurst') {
    const second = { x: Math.max(0, Math.min(map.length - 1, player.x + (player.x < center.x ? -3 : 3))), y: player.y }
    return { pattern, cells: unique(dodgeableBurst(player, false), map), followUpCells: unique(dodgeableBurst(second, enraged), map) }
  }
  return { pattern, cells: unique([...footprint.flatMap((part) => area(part, 1)), ...(enraged ? [
    { x: anchor.x - 2, y: anchor.y - 2 }, { x: anchor.x + 3, y: anchor.y - 2 },
    { x: anchor.x - 2, y: anchor.y + 3 }, { x: anchor.x + 3, y: anchor.y + 3 },
  ] : [])], map) }
}

export function specialBossPlanForPattern(theme: DungeonTheme, anchor: Position, player: Position, map: ForestMap, pattern: BossPattern, enraged: boolean): BossPlan {
  const index = SPECIAL_BOSS_PATTERNS[theme].indexOf(pattern)
  if (index < 0) throw new Error('このボスが使用できない攻撃です。')
  return specialBossPlan(theme, anchor, player, map, index, enraged)
}
