import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'

async function load(path) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}
const { pwaOptions, normalizeBase } = await load('../pwa.config.ts')
const { canApplyUpdate } = await load('../src/pwa/updateSafety.ts')

test('Manifestは暫定名称・日本語・縦画面・standaloneと指定色を持つ', () => {
  const manifest = pwaOptions('/').manifest
  for (const [key, value] of Object.entries({ name: 'ダンジョンローグライク', short_name: 'ダンジョンローグライク', lang: 'ja', display: 'standalone', orientation: 'portrait', theme_color: '#0a1832', background_color: '#0a1832' })) assert.equal(manifest[key], value)
})
test('192/512/maskableのPNGを正しい用途で登録しApple/faviconも配置する', () => {
  assert.deepEqual(pwaOptions('/').manifest.icons.map(({ sizes, purpose }) => [sizes, purpose]), [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']])
  for (const [file, size] of [['icon-192.png',192], ['icon-512.png',512], ['icon-maskable-512.png',512], ['apple-touch-icon.png',180], ['favicon-32.png',32]]) {
    const data = readFileSync(new URL('../public/pwa/' + file, import.meta.url))
    assert.equal(data.subarray(1,4).toString(), 'PNG'); assert.equal(data.readUInt32BE(16), size); assert.equal(data.readUInt32BE(20), size)
  }
})
test('開発ルートと任意のPagesサブパスでscope/start_url/アイコンが一致する', () => {
  for (const value of [undefined, '/', '/example.game', '/example.game/']) {
    const base = normalizeBase(value); const options = pwaOptions(base)
    assert.equal(options.scope, base); assert.equal(options.manifest.scope, base); assert.equal(options.manifest.start_url, base)
    assert.equal(options.workbox.navigateFallback, base + 'index.html')
    assert.ok(options.manifest.icons.every((icon) => icon.src.startsWith(base + 'pwa/')))
  }
  for (const value of ['https://example.com/', '/../', '/a/../b/', '/a b/']) assert.throws(() => normalizeBase(value))
})
test('未表示画像を含むプリキャッシュを設定し、最大背景画像も上限以内にする', () => {
  const options = pwaOptions('/')
  assert.match(options.workbox.globPatterns[0], /png/); assert.ok(options.workbox.globIgnores.includes('**/*.zip'))
  const walk = (path) => readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)])
  for (const path of walk(fileURLToPath(new URL('../public', import.meta.url))).filter((path) => /\.(png|svg)$/.test(path))) assert.ok(readFileSync(path).length <= options.workbox.maximumFileSizeToCacheInBytes, path)
})
test('更新は通知方式で、保存完了後の町・タイトルでのみ適用できる', () => {
  const options = pwaOptions('/')
  assert.equal(options.registerType, 'prompt'); assert.equal(options.workbox.skipWaiting, false); assert.equal(options.workbox.clientsClaim, false)
  assert.equal(canApplyUpdate(true, false, false, false, false), true)
  for (const args of [[false,false,false,false,false], [true,true,false,false,false], [true,false,true,false,false], [true,false,false,true,false], [true,false,false,false,true]]) assert.equal(canApplyUpdate(...args), false)
  const source = readFileSync(new URL('../src/components/PwaUpdate.tsx', import.meta.url), 'utf8')
  assert.match(source, /accepted\.current && safe\.current/)
  assert.doesNotMatch(source, /deleteDatabase|indexedDB\.delete|caches\.delete/)
})
