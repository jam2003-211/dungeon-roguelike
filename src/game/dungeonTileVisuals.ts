export type DungeonVisualTheme = 'forest' | 'ruins' | 'castle'

export const DUNGEON_TILE_VARIANTS = {
  forest: {
    floor: ['forest_grass_floor', 'forest_grass_floor', 'forest_grass_floor', 'forest_dirt_floor', 'forest_grass_dense', 'forest_flower', 'forest_pebbles'],
    obstacle: ['forest_tree', 'forest_rock', 'forest_stump', 'forest_bush', 'forest_water'],
  },
  ruins: {
    floor: ['ruins_stone_floor', 'ruins_stone_floor', 'ruins_stone_floor', 'ruins_mossy_stone_floor', 'ruins_carved_stone_floor', 'ruins_cracked_stone', 'ruins_grass_moss'],
    obstacle: ['ruins_stone_wall', 'ruins_broken_stone_wall', 'ruins_column', 'ruins_rubble', 'ruins_broken_column'],
  },
  castle: {
    floor: ['castle_floor', 'castle_floor', 'castle_floor', 'castle_pattern_floor'],
    obstacle: ['castle_wall', 'castle_broken_wall', 'castle_banner_column', 'castle_statue', 'castle_torch', 'castle_banner', 'castle_decorative_wall'],
  },
} as const

export type DungeonVisualTile = (typeof DUNGEON_TILE_VARIANTS)[DungeonVisualTheme]['floor'][number] | (typeof DUNGEON_TILE_VARIANTS)[DungeonVisualTheme]['obstacle'][number] | 'forest_stairs_grass' | 'forest_stairs_dirt' | 'ruins_stairs_down' | 'castle_stairs_down' | 'castle_stairs_alt' | 'castle_red_carpet'

export function getDungeonTileVisual(theme: DungeonVisualTheme, floor: number, x: number, y: number, passable: boolean): DungeonVisualTile {
  const choices = passable ? DUNGEON_TILE_VARIANTS[theme].floor : DUNGEON_TILE_VARIANTS[theme].obstacle
  const seed = (floor * 73856093 + x * 19349663 + y * 83492791 + (theme === 'forest' ? 17 : theme === 'ruins' ? 31 : 47)) >>> 0
  if (theme === 'castle' && passable && (x === 9 || x === 10) && y > 1 && y < 18) return 'castle_red_carpet'
  return choices[seed % choices.length]
}

export function getDungeonStairsVisual(theme: DungeonVisualTheme, floor: number, dirtFloor = false): DungeonVisualTile {
  if (theme === 'forest') return dirtFloor ? 'forest_stairs_dirt' : 'forest_stairs_grass'
  if (theme === 'ruins') return 'ruins_stairs_down'
  return floor % 2 === 0 ? 'castle_stairs_alt' : 'castle_stairs_down'
}
