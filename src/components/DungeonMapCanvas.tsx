import { useEffect, useRef } from 'react'
import { enemyAssetPaths, enemyFallbackPaths, jobAssetPaths, loadCachedImage } from '../assets'
import { ENEMY_DEFINITIONS, getWarningLevel, positionKey, type EnemyState } from '../game/combat/combat'
import { MAP_SIZE, type ForestMap, type Position, type TileType } from '../game/forestMap'
import type { JobId } from '../game/player'

const CANVAS_SIZE = 400
const TILE_SIZE = CANVAS_SIZE / MAP_SIZE

function drawGround(context: CanvasRenderingContext2D, x: number, y: number, tile: TileType) {
  const left = x * TILE_SIZE; const top = y * TILE_SIZE; const alternate = (x + y) % 2 === 0
  const ruins = tile === 'ruinsFloor' || tile === 'pillar'
  const castle = tile === 'castleFloor' || tile === 'castleWall'
  context.fillStyle = ruins ? (alternate ? '#777064' : '#686259') : castle ? (alternate ? '#4d5362' : '#424854') : tile === 'path' ? (alternate ? '#8b6a3c' : '#806037') : (alternate ? '#3f733b' : '#396b36')
  context.fillRect(left, top, TILE_SIZE, TILE_SIZE)
  context.fillStyle = ruins ? '#918879' : castle ? '#636b7c' : tile === 'path' ? '#a17b48' : '#4c8244'
  context.fillRect(left + 3, top + 4, 2, 2); context.fillRect(left + 14, top + 13, 2, 2)
}

function drawObstacle(context: CanvasRenderingContext2D, x: number, y: number, tile: TileType) {
  const left = x * TILE_SIZE; const top = y * TILE_SIZE
  if (tile === 'tree') {
    context.fillStyle = '#254a2b'; context.fillRect(left + 3, top + 2, 14, 12); context.fillStyle = '#4f9145'; context.fillRect(left + 5, top + 2, 10, 8); context.fillStyle = '#80532f'; context.fillRect(left + 8, top + 12, 5, 7)
  } else if (tile === 'rock') {
    context.fillStyle = '#3c4445'; context.fillRect(left + 3, top + 8, 15, 9); context.fillStyle = '#7c8782'; context.fillRect(left + 5, top + 5, 10, 10); context.fillStyle = '#a5aaa1'; context.fillRect(left + 7, top + 6, 5, 3)
  } else if (tile === 'stump') {
    context.fillStyle = '#54341f'; context.fillRect(left + 4, top + 8, 13, 9); context.fillStyle = '#a46b38'; context.fillRect(left + 4, top + 5, 13, 8); context.fillStyle = '#d09959'; context.fillRect(left + 7, top + 7, 7, 3)
  } else if (tile === 'wall' || tile === 'castleWall') {
    context.fillStyle = '#252b29'; context.fillRect(left, top, TILE_SIZE, TILE_SIZE); context.fillStyle = '#626c65'; context.fillRect(left + 1, top + 2, 18, 7); context.fillStyle = '#4d5751'; context.fillRect(left + 1, top + 11, 18, 7); context.fillStyle = '#202522'; context.fillRect(left + 9, top + 2, 2, 7)
    if (tile === 'castleWall') { context.fillStyle = '#777f91'; context.fillRect(left + 2, top + 3, 16, 3) }
  } else if (tile === 'pillar') {
    context.fillStyle = '#383b42'; context.fillRect(left + 4, top + 2, 12, 17); context.fillStyle = '#8b8790'; context.fillRect(left + 6, top + 3, 8, 14); context.fillStyle = '#aaa5ad'; context.fillRect(left + 4, top + 2, 12, 3)
  }
}

function drawHighlights(context: CanvasRenderingContext2D, enemies: EnemyState[], targetCells: Position[]) {
  const targets = new Set(targetCells.map(positionKey))
  for (let y = 0; y < MAP_SIZE; y += 1) for (let x = 0; x < MAP_SIZE; x += 1) {
    const position = { x, y }; const left = x * TILE_SIZE; const top = y * TILE_SIZE
    if (targets.has(positionKey(position))) { context.fillStyle = 'rgba(40, 220, 105, .48)'; context.fillRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2) }
    const warning = getWarningLevel(enemies, position)
    if (warning) { context.fillStyle = warning === 'red' ? 'rgba(255, 35, 35, .72)' : 'rgba(255, 215, 40, .58)'; context.fillRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2) }
  }
}

function drawEnemy(context: CanvasRenderingContext2D, enemy: EnemyState, image: HTMLImageElement | undefined, selected: boolean) {
  const centerX = (enemy.position.x + .5) * TILE_SIZE; const centerY = (enemy.position.y + .5) * TILE_SIZE
  const size = enemy.isBoss ? TILE_SIZE * 1.5 : TILE_SIZE * .92; const left = centerX - size / 2; const top = centerY - size / 2
  if (image?.complete && image.naturalWidth > 0) context.drawImage(image, left, top, size, size)
  else { context.fillStyle = '#d95a5a'; context.fillRect(left + 3, top + 3, size - 6, size - 6) }
  if (selected) { context.strokeStyle = '#fff'; context.lineWidth = 2; context.strokeRect(enemy.position.x * TILE_SIZE + 1, enemy.position.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2) }
  const barLeft = enemy.position.x * TILE_SIZE + 2; const barTop = enemy.position.y * TILE_SIZE + TILE_SIZE - 4
  context.fillStyle = '#120b0b'; context.fillRect(barLeft, barTop, TILE_SIZE - 4, 3); context.fillStyle = '#e94c4c'; context.fillRect(barLeft, barTop, (TILE_SIZE - 4) * Math.max(0, enemy.hp / enemy.maxHp), 3)
}

function drawMap(context: CanvasRenderingContext2D, map: ForestMap, stairs: Position, player: Position, enemies: EnemyState[], targetCells: Position[], selectedEnemyId: string | null, images: Map<string, HTMLImageElement>, playerImage: HTMLImageElement | null) {
  context.imageSmoothingEnabled = false; context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  for (let y = 0; y < MAP_SIZE; y += 1) for (let x = 0; x < MAP_SIZE; x += 1) {
    const tile = map[y][x]; drawGround(context, x, y, tile); if (!['grass', 'path', 'ruinsFloor', 'castleFloor'].includes(tile)) drawObstacle(context, x, y, tile)
    context.strokeStyle = 'rgba(4, 12, 7, .22)'; context.lineWidth = 1; context.strokeRect(x * TILE_SIZE + .5, y * TILE_SIZE + .5, TILE_SIZE - 1, TILE_SIZE - 1)
  }
  drawHighlights(context, enemies, targetCells)
  const stairLeft = stairs.x * TILE_SIZE; const stairTop = stairs.y * TILE_SIZE
  context.fillStyle = '#17191d'; context.fillRect(stairLeft + 3, stairTop + 3, 14, 14); context.fillStyle = '#f0d372'; context.fillRect(stairLeft + 5, stairTop + 5, 10, 3); context.fillRect(stairLeft + 7, stairTop + 9, 8, 3); context.fillRect(stairLeft + 9, stairTop + 13, 6, 3)
  for (const enemy of enemies) drawEnemy(context, enemy, images.get(enemy.kind), selectedEnemyId === enemy.id)
  const left = player.x * TILE_SIZE; const top = player.y * TILE_SIZE
  context.fillStyle = '#f5d76e'; context.fillRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2); context.fillStyle = '#111'; context.fillRect(left + 3, top + 3, TILE_SIZE - 6, TILE_SIZE - 6)
  if (playerImage?.complete && playerImage.naturalWidth > 0) context.drawImage(playerImage, left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4)
}

interface DungeonMapCanvasProps { map: ForestMap; stairs: Position; themeName: string; player: Position; playerJob: JobId; enemies: EnemyState[]; targetCells: Position[]; selectedEnemyId: string | null; onCellClick: (position: Position) => void }

export function DungeonMapCanvas({ map, stairs, themeName, player, playerJob, enemies, targetCells, selectedEnemyId, onCellClick }: DungeonMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const yellowWarnings = enemies.filter((enemy) => enemy.warning && enemy.warning.remaining >= 2).length
  const redWarnings = enemies.filter((enemy) => enemy.warning?.remaining === 1).length
  useEffect(() => {
    const canvas = canvasRef.current; const context = canvas?.getContext('2d'); if (!canvas || !context) return
    const playerImage = loadCachedImage(jobAssetPaths[playerJob]); const images = new Map<string, HTMLImageElement>(); const redraw = () => drawMap(context, map, stairs, player, enemies, targetCells, selectedEnemyId, images, playerImage)
    playerImage.addEventListener('load', redraw)
    for (const definition of Object.values(ENEMY_DEFINITIONS)) { const image = loadCachedImage(enemyAssetPaths[definition.kind], enemyFallbackPaths[definition.kind]); image.addEventListener('load', redraw); images.set(definition.kind, image) }
    redraw(); return () => { playerImage.removeEventListener('load', redraw); for (const image of images.values()) image.removeEventListener('load', redraw) }
  }, [enemies, map, player, playerJob, selectedEnemyId, stairs, targetCells])
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect(); const x = Math.floor((event.clientX - bounds.left) * MAP_SIZE / bounds.width); const y = Math.floor((event.clientY - bounds.top) * MAP_SIZE / bounds.height)
    if (x >= 0 && y >= 0 && x < MAP_SIZE && y < MAP_SIZE) onCellClick({ x, y })
  }
  return <canvas ref={canvasRef} className="dungeon-map" width={CANVAS_SIZE} height={CANVAS_SIZE} data-yellow-warnings={yellowWarnings} data-red-warnings={redWarnings} data-stairs={`${stairs.x},${stairs.y}`} data-enemies={JSON.stringify(enemies.map((enemy) => ({ id: enemy.id, x: enemy.position.x, y: enemy.position.y, hp: enemy.hp })))} data-layout={map.flat().map((tile) => ['grass', 'path', 'ruinsFloor', 'castleFloor'].includes(tile) ? '0' : '1').join('')} onClick={handleClick} role="img" aria-label={`20×20マスの${themeName}マップ。プレイヤー位置は横${player.x + 1}、縦${player.y + 1}。敵${enemies.length}体`} />
}
