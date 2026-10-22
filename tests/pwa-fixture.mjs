import { withEquipmentFixture } from './equipment-fixture.mjs'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const cache = new Map()
function moduleUrl(path) {
  if (cache.has(path)) return cache.get(path)
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from '([^']+)'/g, (match, dependency) => dependency.startsWith('.') ? `from '${moduleUrl(resolve(dirname(path), dependency + '.ts'))}'` : match)
  const url = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`; cache.set(path, url); return url
}
const load = (path) => import(moduleUrl(fileURLToPath(new URL('../src/' + path + '.ts', import.meta.url))))
export async function pwaFixture() {
  const player = withEquipmentFixture(await load('game/player')); const dungeon = await load('game/dungeon'); const run = await load('game/dungeonRun')
  const loot = await load('game/loot'); const saved = await load('persistence/saveData'); const { captureRun } = await load('persistence/savedRun')
  let character = { ...player.createPlayerState(), level: 30 }
  for (const id of ['test-light-armor', 'test-accessory-a', 'test-accessory-b']) character = player.equipItem(character, id)
  character.currentHp = player.calculateStats(character).maxHp - 30
  const stocks = dungeon.createDungeonStocks().map((stock) => {
    let value = 42; let first = true
    const random = () => { if (first) { first = false; return .1 } value = (Math.imul(value,1664525)+1013904223)>>>0; return value/4294967296 }
    return { ...stock, dungeon: dungeon.createDungeon(1, stock.theme, random), highestFloor: stock.id === 1 ? 1 : 0 }
  })
  const state = run.startDungeonRun(character, stocks[0].dungeon)
  state.battle.loot = loot.createLootState(stocks[0].dungeon, () => .2)
  return saved.createSaveData(character, stocks, new Date(), captureRun(1, 1, state.battle))
}
