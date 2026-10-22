import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/game/player.ts', import.meta.url), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const player = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)

test('レベル能力値と必要経験値が指定式に従う', () => {
  assert.deepEqual(player.baseStats(1), { maxHp: 100, physical: 12, magic: 12 })
  assert.deepEqual(player.baseStats(4), { maxHp: 160, physical: 27, magic: 27 })
  assert.equal(player.experienceToNext(1), 100); assert.equal(player.experienceToNext(4), 175)
})

test('余剰経験値を引き継いで複数レベルアップし、最大HP増加分だけ回復する', () => {
  const initial = { ...player.createPlayerState(), currentHp: 50 }
  const gained = player.gainExperience(initial, 230)
  assert.equal(gained.player.level, 3); assert.equal(gained.player.experience, 5); assert.equal(gained.levelsGained, 2)
  assert.equal(gained.player.currentHp, 90)
})

test('職業倍率を統一して切り捨て、解放済み職業変更では全回復する', () => {
  const base = { ...player.createPlayerState(), level: 5, currentHp: 1 }
  const changed = player.changeJob(base, 'warrior')
  assert.equal(changed.job, 'warrior'); assert.deepEqual(player.calculateStats(changed), { maxHp: 234, physical: 41, magic: 19 })
  assert.equal(changed.currentHp, 234)
  assert.equal(player.changeJob(player.createPlayerState(), 'warrior').job, 'unemployed')
})

test('職業変更で非対応の武器と防具を自動解除する', () => {
  let state = { ...player.createPlayerState(), level: 5 }
  state = player.equipItem(state, 'test-short-staff'); state = player.equipItem(state, 'test-light-robe')
  const warrior = player.changeJob(state, 'warrior')
  assert.equal(warrior.equipment.weapon, null); assert.equal(warrior.equipment.armor, null)
  assert.ok(warrior.inventory.some((item) => item.id === 'test-short-staff'))
})

test('装備と解除、アクセサリー2枠、能力値・レアリティ倍率を反映する', () => {
  let state = player.createPlayerState(); const before = player.calculateStats(state)
  state = player.equipItem(state, 'test-accessory-a'); state = player.equipItem(state, 'test-accessory-b')
  assert.equal(state.equipment.accessory1, 'test-accessory-a'); assert.equal(state.equipment.accessory2, 'test-accessory-b')
  assert.ok(player.calculateStats(state).maxHp > before.maxHp)
  assert.equal(state.currentHp, 100)
  const epic = state.inventory.find((item) => item.id === 'test-accessory-b')
  assert.deepEqual(player.itemBonuses(epic), { maxHp: 15, physical: 0, magic: 3 })
  state = player.unequipSlot(state, 'accessory1'); assert.equal(state.equipment.accessory1, null)
})

test('検索・分類・並べ替え、お気に入り保護、廃棄を処理する', () => {
  let state = player.createPlayerState(); state = player.toggleFavorite(state, 'test-spear')
  const weapons = player.sortAndFilterInventory(state, 'weapon', '試験')
  assert.equal(weapons[0].id, 'test-spear')
  assert.equal(player.discardItem(state, 'test-spear'), state)
  state = player.toggleFavorite(state, 'test-spear'); const discarded = player.discardItem(state, 'test-spear')
  assert.equal(discarded.inventory.some((item) => item.id === 'test-spear'), false)
  assert.equal(player.discardItem(state, 'initial-sword'), state)
})

test('装備スキルはID単位で重複を統合する', () => {
  let state = player.createPlayerState(); state = player.equipItem(state, 'test-light-armor'); state = player.equipItem(state, 'test-accessory-a'); state = player.equipItem(state, 'test-accessory-b')
  const skills = player.availableSkills(state)
  assert.equal(new Set(skills).size, skills.length); assert.ok(skills.includes('dash')); assert.ok(skills.includes('smallHeal'))
  const weak = { ...state.inventory.find((item) => item.id === 'test-accessory-a'), id: 'weak', rarity: 'common', skills: ['smallHeal'] }
  const strong = { ...weak, id: 'strong', rarity: 'legendary' }
  const duplicate = { ...state, inventory: [...state.inventory, weak, strong], equipment: { ...state.equipment, accessory1: 'weak', accessory2: 'strong' } }
  assert.equal(player.availableSkillPower(duplicate, 'smallHeal'), 2)
})
