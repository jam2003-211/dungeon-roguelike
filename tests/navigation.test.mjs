import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/navigation.ts', import.meta.url), 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const navigation = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`)

test('初期画面はタイトルで、ゲーム開始先は町', () => {
  assert.deepEqual(navigation.createInitialNavigation(), { current: 'title', previous: [] })
  assert.equal(navigation.getGameStartScreen(), 'town')
})

test('町から第1段階の各画面へ遷移し、町へ戻れる', () => {
  const town = navigation.navigate(navigation.createInitialNavigation(), 'town')
  for (const screen of ['dungeon', 'equipment', 'status', 'jobs', 'settings']) {
    const destination = navigation.navigate(town, screen)
    assert.equal(destination.current, screen)
    assert.deepEqual(navigation.getPreviousNavigation(destination), town)
  }
})

test('ステータスから装備を開いた場合はステータスへ戻る', () => {
  const title = navigation.createInitialNavigation()
  const town = navigation.navigate(title, 'town')
  const status = navigation.navigate(town, 'status')
  const equipment = navigation.navigate(status, 'equipment')
  assert.deepEqual(navigation.getPreviousNavigation(equipment), status)
})

test('同じ画面への遷移と履歴がない戻る操作では状態を変えない', () => {
  const title = navigation.createInitialNavigation()
  assert.equal(navigation.navigate(title, 'title'), title)
  assert.equal(navigation.getPreviousNavigation(title), title)
})

test('ブラウザ履歴から不正な画面状態を復元しない', () => {
  assert.equal(navigation.readNavigationState({ current: 'battle', previous: [] }), null)
  assert.equal(navigation.readNavigationState({ current: 'town', previous: ['broken'] }), null)
  assert.deepEqual(navigation.readNavigationState({ current: 'status', previous: ['title', 'town'] }), {
    current: 'status', previous: ['title', 'town'],
  })
  assert.deepEqual(navigation.readNavigationState({ current: 'exploration', previous: ['title', 'town', 'dungeon'] }), {
    current: 'exploration', previous: ['title', 'town', 'dungeon'],
  })
})
