import { cameraOrigin, isInView, viewToMap, VIEW_SIZE } from '../game/dungeonCamera'
import { useEffect, useRef } from 'react'
import { chestAssetPaths, dungeonTileAssetPaths, enemyAssetPaths, enemyFallbackPaths, jobAssetPaths, loadCachedImage } from '../assets'
import { ENEMY_DEFINITIONS, getEnemyWarningLevel, getWarningLevel, positionKey, type EnemyState } from '../game/combat/combat'
import { MAP_SIZE, type ForestMap, type Position, type TileType } from '../game/forestMap'
import type { LootChest } from '../game/loot'
import type { JobId } from '../game/player'
import type { DungeonTheme } from '../game/dungeon'
import { getDungeonStairsVisual, getDungeonTileVisual } from '../game/dungeonTileVisuals'

const CANVAS_SIZE = 440
const TILE_SIZE = CANVAS_SIZE / VIEW_SIZE
type DungeonTileKey = keyof typeof dungeonTileAssetPaths

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
    const warning = getWarningLevel(enemies, position)
    // 地形→グリッド→青枠／予告の薄い面→階段・宝箱・敵・プレイヤー→危険枠。
    if (warning) {
      context.fillStyle = warning === 'red' ? 'rgba(255, 45, 45, .20)' : 'rgba(255, 215, 40, .14)'
      context.fillRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2)
    } else if (targets.has(positionKey(position))) {
      context.strokeStyle = 'rgba(90, 175, 255, .65)'; context.lineWidth = 1.5
      context.strokeRect(left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4)
    }
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

function drawMap(context: CanvasRenderingContext2D, map: ForestMap, stairs: Position, theme: DungeonTheme, floor: number, visualSeed: number, player: Position, enemies: EnemyState[], targetCells: Position[], selectedEnemyId: string | null, images: Map<string, HTMLImageElement>, playerImage: HTMLImageElement | null, chest: LootChest | null) {
  context.imageSmoothingEnabled = false
  context.fillStyle = '#080e19'; context.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  const origin = cameraOrigin(player)
  context.save(); context.translate(-origin.x * TILE_SIZE, -origin.y * TILE_SIZE)
  context.beginPath(); context.rect(0, 0, MAP_SIZE * TILE_SIZE, MAP_SIZE * TILE_SIZE); context.clip()
  context.save(); context.filter = 'saturate(70%) brightness(88%)'
  for (let y = 0; y < MAP_SIZE; y += 1) for (let x = 0; x < MAP_SIZE; x += 1) {
    if (!isInView(player, { x, y })) continue
    const tile = map[y][x]; const passable = ['grass', 'path', 'ruinsFloor', 'castleFloor'].includes(tile); const image = images.get(getDungeonTileVisual(theme, floor, x, y, passable, visualSeed))
    if (image?.complete && image.naturalWidth > 0) context.drawImage(image, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE)
    else { drawGround(context, x, y, tile); if (!['grass', 'path', 'ruinsFloor', 'castleFloor'].includes(tile)) drawObstacle(context, x, y, tile) }
  }
  context.restore()
  for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
    if (!isInView(player, { x, y })) continue
    context.strokeStyle = 'rgba(15, 23, 32, .35)'; context.lineWidth = 1
    context.strokeRect(x * TILE_SIZE + .5, y * TILE_SIZE + .5, TILE_SIZE - 1, TILE_SIZE - 1)
  }
  drawHighlights(context, enemies, targetCells)
  const stairLeft = stairs.x * TILE_SIZE; const stairTop = stairs.y * TILE_SIZE
  const stairKey: DungeonTileKey = getDungeonStairsVisual(theme, floor, map[stairs.y][stairs.x] === 'path')
  const stairImage = images.get(stairKey)
  if (stairImage?.complete && stairImage.naturalWidth > 0) context.drawImage(stairImage, stairLeft, stairTop, TILE_SIZE, TILE_SIZE)
  else { context.fillStyle = '#17191d'; context.fillRect(stairLeft + 3, stairTop + 3, 14, 14); context.fillStyle = '#f0d372'; context.fillRect(stairLeft + 5, stairTop + 5, 10, 3); context.fillRect(stairLeft + 7, stairTop + 9, 8, 3); context.fillRect(stairLeft + 9, stairTop + 13, 6, 3) }
  if (chest) {
    const x = chest.position.x * TILE_SIZE; const y = chest.position.y * TILE_SIZE
    const image = images.get(chest.opened ? 'chest_open' : 'chest_closed')
    if (image?.complete && image.naturalWidth > 0) context.drawImage(image, x, y, TILE_SIZE, TILE_SIZE)
    else {
      context.fillStyle = '#2c180b'; context.fillRect(x + 2, y + 5, 16, 13)
      context.fillStyle = '#b8752d'; context.fillRect(x + 3, y + 6, 14, 10)
      context.fillStyle = '#f4d46b'; context.fillRect(x + 3, y + 10, 14, 2); context.fillRect(x + 9, y + 9, 3, 5)
    }
  }
  for (const enemy of enemies.filter((candidate) => isInView(player, candidate.position))) drawEnemy(context, enemy, images.get(enemy.kind), selectedEnemyId === enemy.id)
  const left = player.x * TILE_SIZE; const top = player.y * TILE_SIZE
  context.fillStyle = '#f5d76e'; context.fillRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2); context.fillStyle = '#111'; context.fillRect(left + 3, top + 3, TILE_SIZE - 6, TILE_SIZE - 6)
  if (playerImage?.complete && playerImage.naturalWidth > 0) context.drawImage(playerImage, left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4)
  // 最外周だけを最後に描く。人物を暗くせず、プレイヤー上の危険も隠さない。
  for (let y = 0; y < MAP_SIZE; y++) for (let x = 0; x < MAP_SIZE; x++) {
    if (!isInView(player, { x, y })) continue
    const warning = getWarningLevel(enemies, { x, y })
    if (!warning) continue
    context.strokeStyle = warning === 'red' ? '#ff4848' : '#f2d650'; context.lineWidth = 2
    context.strokeRect(x * TILE_SIZE + 1, y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2)
  }
  context.restore()
}

interface DungeonMapCanvasProps { visualSeed: number; chest: LootChest | null; map: ForestMap; stairs: Position; themeName: string; floor: number; player: Position; playerJob: JobId; enemies: EnemyState[]; targetCells: Position[]; selectedEnemyId: string | null; onCellClick: (position: Position) => void }

export function DungeonMapCanvas({ visualSeed, chest, map, stairs, themeName, floor, player, playerJob, enemies, targetCells, selectedEnemyId, onCellClick }: DungeonMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const theme: DungeonTheme = map.flat().includes('ruinsFloor') ? 'ruins' : map.flat().includes('castleFloor') ? 'castle' : 'forest'
  const yellowWarnings = enemies.filter((enemy) => getEnemyWarningLevel(enemy) === 'yellow').length
  const redWarnings = enemies.filter((enemy) => getEnemyWarningLevel(enemy) === 'red').length
  useEffect(() => {
    const canvas = canvasRef.current; const context = canvas?.getContext('2d'); if (!canvas || !context) return
    canvas.dataset.theme = theme; canvas.dataset.floor = String(floor)
    const playerImage = loadCachedImage(jobAssetPaths[playerJob]); const images = new Map<string, HTMLImageElement>(); const redraw = () => {
      drawMap(context, map, stairs, theme, floor, visualSeed, player, enemies, targetCells, selectedEnemyId, images, playerImage, chest)
      canvas.dataset.loadedTileCount = String(Object.keys(dungeonTileAssetPaths).filter((key) => { const image = images.get(key); return image?.complete && image.naturalWidth > 0 }).length)
      canvas.dataset.stairsTile = getDungeonStairsVisual(theme, floor, map[stairs.y][stairs.x] === 'path')
      if (chest) {
        const chestKey = chest.opened ? 'open' : 'closed'
        const image = images.get(`chest_${chestKey}`)
        canvas.dataset.chestOpened = String(chest.opened)
        canvas.dataset.chestAsset = chestAssetPaths[chestKey]
        canvas.dataset.chestImageLoaded = String(Boolean(image?.complete && image.naturalWidth > 0))
      } else {
        delete canvas.dataset.chestOpened; delete canvas.dataset.chestAsset; delete canvas.dataset.chestImageLoaded
      }
    }
    playerImage.addEventListener('load', redraw)
    for (const [key, path] of Object.entries(dungeonTileAssetPaths)) { const image = loadCachedImage(path); image.addEventListener('load', redraw); images.set(key, image) }
    for (const [key, path] of Object.entries(chestAssetPaths)) { const image = loadCachedImage(path); image.addEventListener('load', redraw); images.set(`chest_${key}`, image) }
    for (const definition of Object.values(ENEMY_DEFINITIONS)) { const image = loadCachedImage(enemyAssetPaths[definition.kind], enemyFallbackPaths[definition.kind]); image.addEventListener('load', redraw); images.set(definition.kind, image) }
    redraw(); return () => { playerImage.removeEventListener('load', redraw); for (const image of images.values()) image.removeEventListener('load', redraw) }
  }, [visualSeed, chest, enemies, floor, map, player, playerJob, selectedEnemyId, stairs, targetCells, theme])
  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = viewToMap(player, Math.floor((event.clientX - bounds.left) * VIEW_SIZE / bounds.width), Math.floor((event.clientY - bounds.top) * VIEW_SIZE / bounds.height))
    if (position) onCellClick(position)
  }
  return <canvas ref={canvasRef} className="dungeon-map" data-view-size={VIEW_SIZE} data-attack-cells={JSON.stringify(targetCells)} data-camera-origin={JSON.stringify(cameraOrigin(player))} data-player={JSON.stringify(player)} data-visual-seed={visualSeed} width={CANVAS_SIZE} height={CANVAS_SIZE} data-chest={chest ? JSON.stringify(chest.position) : undefined} data-yellow-warnings={yellowWarnings} data-red-warnings={redWarnings} data-stairs={`${stairs.x},${stairs.y}`} data-enemies={JSON.stringify(enemies.map((enemy) => ({ id: enemy.id, x: enemy.position.x, y: enemy.position.y, hp: enemy.hp })))} data-layout={map.flat().map((tile) => ['grass', 'path', 'ruinsFloor', 'castleFloor'].includes(tile) ? '0' : '1').join('')} onClick={handleClick} role="img" aria-label={`20×20マスの${themeName}マップ。プレイヤー位置は横${player.x + 1}、縦${player.y + 1}。敵${enemies.length}体`} />
}
