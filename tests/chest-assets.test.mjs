import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('閉・開宝箱画像は128px素材へ対応し、Canvasがキャッシュ画像と簡易描画へフォールバックする', () => {
  const assets = readFileSync(new URL('../src/assets.ts', import.meta.url), 'utf8')
  assert.match(assets, /closed: assetUrl\('assets\/chests\/128px\/chest_closed\.png'\)/)
  assert.match(assets, /open: assetUrl\('assets\/chests\/128px\/chest_open\.png'\)/)
  for (const filename of ['chest_closed.png', 'chest_open.png']) {
    const png = readFileSync(new URL(`../public/assets/chests/128px/${filename}`, import.meta.url))
    assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG')
    assert.equal(png.readUInt32BE(16), 128)
    assert.equal(png.readUInt32BE(20), 128)
  }
  const canvas = readFileSync(new URL('../src/components/DungeonMapCanvas.tsx', import.meta.url), 'utf8')
  assert.match(canvas, /loadCachedImage\(path\).*images\.set\(`chest_\$\{key\}`/)
  assert.match(canvas, /chests\.filter\(\(candidate\) => !candidate\.opened\)/)
  assert.match(canvas, /images\.get\('chest_closed'\)/)
  assert.match(canvas, /else \{\s*context\.fillStyle = '#2c180b'/)
})
