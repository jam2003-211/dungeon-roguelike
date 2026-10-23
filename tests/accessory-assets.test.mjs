import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../src/assets.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source.replaceAll('import.meta.env.BASE_URL', "'/'"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { equipmentAssetPath } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('アクセサリー画像は名前に依存せず実際のスキル付与データから選ぶ', () => {
  for (const name of ['力の護符', '魔力の護符', '任意の名前']) {
    const item = { category: 'accessory', name, skills: ['guard'], basePhysical: 0, baseMagic: 0, baseHp: 0, specialEffect: null }
    assert.equal(equipmentAssetPath(item), '/assets/accessories/necklace.png')
    assert.equal(equipmentAssetPath({ ...item, skills: [], basePhysical: 5 }), '/assets/accessories/ring.png')
    assert.equal(equipmentAssetPath({ ...item, skills: [], specialEffect: 'poison' }), '/assets/accessories/ring.png')
  }
  for (const screen of ['EquipmentScreen', 'StatusScreen']) {
    assert.match(readFileSync(new URL(`../src/screens/${screen}.tsx`, import.meta.url), 'utf8'), /equipmentAssetPath\(item\)/)
  }
  const result = readFileSync(new URL('../src/screens/ExplorationResultScreen.tsx', import.meta.url), 'utf8')
  assert.match(result, /お宝 Lv\.\{treasure\.level\}/)
  assert.doesNotMatch(result, /equipmentAssetPath|treasure\.item\.(name|category|rarity|skills|specialEffect)/)
})
