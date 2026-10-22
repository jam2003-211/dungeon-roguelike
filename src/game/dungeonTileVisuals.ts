export type DungeonVisualTheme = 'forest' | 'ruins' | 'castle'

export const DUNGEON_TILE_VARIANTS = {
  forest: {
    floor: ['forest_grass_floor', 'forest_grass_floor', 'forest_grass_floor', 'forest_grass_floor', 'forest_grass_floor', 'forest_grass_floor', 'forest_dirt_floor', 'forest_grass_dense', 'forest_flower', 'forest_pebbles'],
    obstacle: ['forest_tree', 'forest_rock', 'forest_stump', 'forest_bush', 'forest_water'],
  },
  ruins: {
    floor: ['ruins_stone_floor', 'ruins_stone_floor', 'ruins_stone_floor', 'ruins_stone_floor', 'ruins_stone_floor', 'ruins_stone_floor', 'ruins_mossy_stone_floor', 'ruins_carved_stone_floor', 'ruins_cracked_stone', 'ruins_grass_moss'],
    obstacle: ['ruins_stone_wall', 'ruins_broken_stone_wall', 'ruins_column', 'ruins_rubble', 'ruins_broken_column'],
  },
  castle: {
    floor: ['castle_floor', 'castle_floor', 'castle_floor', 'castle_pattern_floor'],
    obstacle: ['castle_wall', 'castle_broken_wall', 'castle_banner_column', 'castle_statue', 'castle_torch', 'castle_banner', 'castle_decorative_wall'],
  },
} as const

export type DungeonVisualTile = (typeof DUNGEON_TILE_VARIANTS)[DungeonVisualTheme]['floor'][number] | (typeof DUNGEON_TILE_VARIANTS)[DungeonVisualTheme]['obstacle'][number] | 'forest_stairs_grass' | 'forest_stairs_dirt' | 'ruins_stairs_down' | 'castle_stairs_down' | 'castle_stairs_alt' | 'castle_red_carpet'

export function getDungeonTileVisual(theme: DungeonVisualTheme, floor: number, x: number, y: number, passable: boolean, visualSeed = 0): DungeonVisualTile {
  const choices = passable ? DUNGEON_TILE_VARIANTS[theme].floor : DUNGEON_TILE_VARIANTS[theme].obstacle
  if (!passable) {
    const seed = (floor * 73856093 + x * 19349663 + y * 83492791 + (theme === 'forest' ? 17 : theme === 'ruins' ? 31 : 47)) >>> 0
    return choices[seed % choices.length]
  }
  // 外観シードと座標を混ぜ、隣接マスの周期的な模様を崩す。
  let seed = (visualSeed ^ Math.imul(floor, 73856093) ^ Math.imul(x, 19349663) ^ Math.imul(y, 83492791) ^ (theme === 'forest' ? 17 : theme === 'ruins' ? 31 : 47)) >>> 0
  seed = Math.imul(seed ^ (seed >>> 16), 0x7feb352d)
  seed = Math.imul(seed ^ (seed >>> 15), 0x846ca68b)
  seed = (seed ^ (seed >>> 16)) >>> 0
  return choices[seed % choices.length]
}

export function getDungeonStairsVisual(theme: DungeonVisualTheme, floor: number, dirtFloor = false): DungeonVisualTile {
  if (theme === 'forest') return dirtFloor ? 'forest_stairs_dirt' : 'forest_stairs_grass'
  if (theme === 'ruins') return 'ruins_stairs_down'
  return floor % 2 === 0 ? 'castle_stairs_alt' : 'castle_stairs_down'
}
