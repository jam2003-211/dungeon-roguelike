import { useEffect, useRef } from 'react'
import { FOREST_MAP, MAP_SIZE, type Position, type TileType } from '../game/forestMap'

const CANVAS_SIZE = 400
const TILE_SIZE = CANVAS_SIZE / MAP_SIZE

function drawGround(context: CanvasRenderingContext2D, x: number, y: number, tile: TileType) {
  const left = x * TILE_SIZE
  const top = y * TILE_SIZE
  const alternate = (x + y) % 2 === 0
  context.fillStyle = tile === 'path' ? (alternate ? '#8b6a3c' : '#806037') : (alternate ? '#3f733b' : '#396b36')
  context.fillRect(left, top, TILE_SIZE, TILE_SIZE)
  context.fillStyle = tile === 'path' ? '#a17b48' : '#4c8244'
  context.fillRect(left + 3, top + 4, 2, 2)
  context.fillRect(left + 14, top + 13, 2, 2)
}

function drawObstacle(context: CanvasRenderingContext2D, x: number, y: number, tile: TileType) {
  const left = x * TILE_SIZE
  const top = y * TILE_SIZE
  if (tile === 'tree') {
    context.fillStyle = '#254a2b'; context.fillRect(left + 3, top + 2, 14, 12)
    context.fillStyle = '#4f9145'; context.fillRect(left + 5, top + 2, 10, 8)
    context.fillStyle = '#80532f'; context.fillRect(left + 8, top + 12, 5, 7)
  } else if (tile === 'rock') {
    context.fillStyle = '#3c4445'; context.fillRect(left + 3, top + 8, 15, 9)
    context.fillStyle = '#7c8782'; context.fillRect(left + 5, top + 5, 10, 10)
    context.fillStyle = '#a5aaa1'; context.fillRect(left + 7, top + 6, 5, 3)
  } else if (tile === 'stump') {
    context.fillStyle = '#54341f'; context.fillRect(left + 4, top + 8, 13, 9)
    context.fillStyle = '#a46b38'; context.fillRect(left + 4, top + 5, 13, 8)
    context.fillStyle = '#d09959'; context.fillRect(left + 7, top + 7, 7, 3)
  } else if (tile === 'wall') {
    context.fillStyle = '#252b29'; context.fillRect(left, top, TILE_SIZE, TILE_SIZE)
    context.fillStyle = '#626c65'; context.fillRect(left + 1, top + 2, 18, 7)
    context.fillStyle = '#4d5751'; context.fillRect(left + 1, top + 11, 18, 7)
    context.fillStyle = '#202522'; context.fillRect(left + 9, top + 2, 2, 7)
  }
}

function drawMap(context: CanvasRenderingContext2D, player: Position, playerImage: HTMLImageElement | null) {
  context.imageSmoothingEnabled = false
  for (let y = 0; y < MAP_SIZE; y += 1) {
    for (let x = 0; x < MAP_SIZE; x += 1) {
      const tile = FOREST_MAP[y][x]
      drawGround(context, x, y, tile)
      if (tile !== 'grass' && tile !== 'path') drawObstacle(context, x, y, tile)
      context.strokeStyle = 'rgba(4, 12, 7, .22)'
      context.strokeRect(x * TILE_SIZE + .5, y * TILE_SIZE + .5, TILE_SIZE - 1, TILE_SIZE - 1)
    }
  }

  const left = player.x * TILE_SIZE
  const top = player.y * TILE_SIZE
  context.fillStyle = '#f5d76e'
  context.fillRect(left + 1, top + 1, TILE_SIZE - 2, TILE_SIZE - 2)
  context.fillStyle = '#111'
  context.fillRect(left + 3, top + 3, TILE_SIZE - 6, TILE_SIZE - 6)
  if (playerImage?.complete && playerImage.naturalWidth > 0) {
    context.drawImage(playerImage, left + 2, top + 2, TILE_SIZE - 4, TILE_SIZE - 4)
  } else {
    context.fillStyle = '#67c8df'; context.fillRect(left + 6, top + 4, 8, 12)
    context.fillStyle = '#f0d5ae'; context.fillRect(left + 8, top + 5, 4, 4)
  }
}

export function DungeonMapCanvas({ player }: { player: Position }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const image = new Image()
    const redraw = () => drawMap(context, player, image)
    image.addEventListener('load', redraw)
    image.src = '/assets/icons/player.png'
    drawMap(context, player, null)
    return () => image.removeEventListener('load', redraw)
  }, [player])

  return (
    <canvas
      ref={canvasRef}
      className="dungeon-map"
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      role="img"
      aria-label={`20×20マスの森マップ。プレイヤー位置は横${player.x + 1}、縦${player.y + 1}`}
    />
  )
}
