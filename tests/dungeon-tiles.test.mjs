import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/game/dungeonTileVisuals.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const visuals = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const assetsSource = readFileSync(new URL('../src/assets.ts', import.meta.url), 'utf8')
const assets = Object.fromEntries([...assetsSource.matchAll(/^  (\w+): assetUrl\('assets\/dungeon-tiles\/([\w_]+\.png)'\),$/gm)].map((match) => [match[1], match[2]]))

test('床はシードで固定され、テーマ全体で短い周期を持たず基本床が多い', () => {
  for (const theme of ['forest', 'ruins', 'castle']) {
    const pattern = (seed) => Array.from({ length: 400 }, (_, i) => visuals.getDungeonTileVisual(theme, 1, i % 20, Math.floor(i / 20), true, seed))
    const first = pattern(123456)
    assert.deepEqual(first, pattern(123456))
    assert.notDeepEqual(first, pattern(654321))
    assert.notDeepEqual(first, Array.from({ length: 400 }, (_, i) => visuals.getDungeonTileVisual(theme, 2, i % 20, Math.floor(i / 20), true, 123456)))
    for (let period = 1; period <= 20; period += 1) assert.ok(first.some((tile, i) => i >= period && tile !== first[i - period]))
    const base = visuals.DUNGEON_TILE_VARIANTS[theme].floor[0]
    assert.ok(first.filter((tile) => tile === base).length > 200)
    for (let i = 0; i < 400; i += 1) assert.equal(visuals.getDungeonTileVisual(theme, 1, i % 20, Math.floor(i / 20), false, 1), visuals.getDungeonTileVisual(theme, 1, i % 20, Math.floor(i / 20), false, 2))
  }
})

test('35種のダンジョンタイル画像が128×128 PNGとして登録されている', () => {
  assert.equal(Object.keys(assets).length, 35)
  for (const filename of Object.values(assets)) {
    const path = new URL(`../public/assets/dungeon-tiles/${filename}`, import.meta.url)
    assert.equal(existsSync(path), true, `${filename} がありません`)
    const png = readFileSync(path)
    assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG')
    assert.equal(png.readUInt32BE(16), 128)
    assert.equal(png.readUInt32BE(20), 128)
  }
})

test('テーマごとの地形選択は決定的で通行可否を変えず、階段はすべて下り', () => {
  for (const theme of ['forest', 'ruins', 'castle']) {
    for (const passable of [true, false]) {
      const first = visuals.getDungeonTileVisual(theme, 3, 7, 11, passable)
      assert.equal(visuals.getDungeonTileVisual(theme, 3, 7, 11, passable), first)
      const allowed = visuals.DUNGEON_TILE_VARIANTS[theme][passable ? 'floor' : 'obstacle']
      assert.ok(allowed.includes(first))
    }
  }
  assert.equal(visuals.getDungeonStairsVisual('forest', 1, true), 'forest_stairs_dirt')
  assert.equal(visuals.getDungeonStairsVisual('forest', 1, false), 'forest_stairs_grass')
  assert.equal(visuals.getDungeonStairsVisual('ruins', 1), 'ruins_stairs_down')
  assert.ok(['castle_stairs_down', 'castle_stairs_alt'].includes(visuals.getDungeonStairsVisual('castle', 2)))
  const canvas = readFileSync(new URL('../src/components/DungeonMapCanvas.tsx', import.meta.url), 'utf8')
  assert.match(canvas, /loadCachedImage\(path\)/)
  assert.match(canvas, /image\?\.complete && image\.naturalWidth > 0\) context\.drawImage/)
  assert.match(canvas, /function drawTile\(/)
  assert.match(canvas, /context\.globalAlpha = passable \? \.45 : \.98/)
  assert.match(canvas, /context\.fillStyle = passable \? '#101010' : '#080808'/)
  assert.match(canvas, /context\.strokeStyle = 'rgba\(255, 65, 65, \.9\)'/)
  assert.doesNotMatch(canvas, /getDungeonTileVisual\(/)
  const screen = readFileSync(new URL('../src/screens/ExplorationScreen.tsx', import.meta.url), 'utf8')
  assert.match(screen, /rgba\(5, 6, 8, \.2\).*assets\/backgrounds\/" \+ theme \+ "\.png/)
})
