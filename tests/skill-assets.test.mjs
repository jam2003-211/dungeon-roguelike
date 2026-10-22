import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const expected = {
  strongStrike: 'strong_strike.png',
  magicBolt: 'magic_bullet.png',
  piercingShot: 'piercing_strike.png',
  shockwave: 'shockwave.png',
  flame: 'flame.png',
  smallHeal: 'minor_heal.png',
  largeHeal: 'major_heal.png',
  poisonStrike: 'poison_strike.png',
  slowSpell: 'slow_magic.png',
  stunStrike: 'stun_strike.png',
  dash: 'dash.png',
  guard: 'guard.png',
}

test('12スキルIDが対応画像へ正しく結び付き、PNG素材が揃っている', () => {
  const source = readFileSync(new URL('../src/assets.ts', import.meta.url), 'utf8')
  const mapping = Object.fromEntries([...source.matchAll(/^  (\w+): assetUrl\('assets\/skills\/([\w_]+\.png)'\),$/gm)].map((match) => [match[1], match[2]]))
  assert.deepEqual(mapping, expected)

  for (const filename of Object.values(expected)) {
    const path = new URL(`../public/assets/skills/${filename}`, import.meta.url)
    assert.equal(existsSync(path), true, `${filename} がありません`)
    const image = readFileSync(path)
    assert.equal(image.subarray(1, 4).toString('ascii'), 'PNG', `${filename} はPNGではありません`)
    assert.ok(image.readUInt32BE(16) > 0 && image.readUInt32BE(20) > 0, `${filename} の寸法を読み取れません`)
  }
})

test('スキル画像は既存のスパークアイコンへフォールバックする', () => {
  const component = readFileSync(new URL('../src/components/SkillIcon.tsx', import.meta.url), 'utf8')
  assert.match(component, /fallbackIcon="spark"/)
  assert.match(component, /skillAssetPaths\[skillId\]/)
})
