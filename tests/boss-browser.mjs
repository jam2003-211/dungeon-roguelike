import assert from 'node:assert/strict'
import { loadGameModule as load } from './pwa-fixture.mjs'
import { databaseAccess } from './save-browser.mjs'

export async function runBossBrowserChecks({ evaluate, command, clickButton, clickExactButton, assertScreen, waitFor, captureScreen }) {
  const dungeon = await load('game/dungeon')
  const player = await load('game/player')
  const saves = await load('persistence/saveData')
  let first = true, seed = 42
  const random = () => { if (first) { first = false; return .05 } seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const original = player.createPlayerState()
  const hero = { ...original, level: 100, currentHp: 0 }
  hero.currentHp = player.calculateStats(hero).maxHp
  const forest = dungeon.createDungeon(100, 'forest', random)
  const stock = { ...dungeon.createDungeonStocks()[0], dungeon: forest }
  const fixture = saves.createSaveData(hero, [stock, ...dungeon.createDungeonStocks().slice(1)])
  await evaluate(`(${databaseAccess})('readwrite', ${JSON.stringify(fixture)})`)
  await command('Page.reload')
  await waitFor("document.querySelector('.title-start')&&!document.querySelector('.title-start').disabled", '特殊ボス用データを読み込めません。')
  await clickButton('ゲーム開始'); await clickButton('ダンジョン')
  assert.match(await evaluate("document.querySelector('.stock-card--1').innerText"), /Lv\.100/)
  await clickExactButton('探索開始')
  await waitFor("document.querySelector('.dungeon-map')?.dataset.mapSize==='13'", '13×13専用フロアを描画できません。')
  for (const width of [360, 390, 430]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth && document.querySelector('.dungeon-map').getBoundingClientRect().right<=innerWidth"), true)
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await waitFor("performance.getEntriesByType('resource').some((entry)=>entry.name.endsWith('/assets/bosses/treant.png'))", 'トレント画像が読み込まれません。')
  await captureScreen('boss-treant-390')
  assert.deepEqual(await evaluate("JSON.parse(document.querySelector('.dungeon-map').dataset.enemies).map((enemy)=>enemy.specialBoss)"), ['forest'])
  await clickButton('上へ移動')
  await waitFor(`(${databaseAccess})().then((data)=>data?.run?.battle.combat.turn===1)`, '特殊ボス階の移動を保存できません。')
  const beforeReload = await evaluate(`(${databaseAccess})()`)
  await command('Page.reload')
  await waitFor("document.querySelector('.title-start')&&!document.querySelector('.title-start').disabled", '特殊ボス戦を再読込できません。')
  await clickButton('探索を再開')
  await waitFor("document.querySelector('.dungeon-map')?.dataset.mapSize==='13'", '特殊ボス戦を再開できません。')
  assert.equal(Number(await evaluate("document.querySelector('.dungeon-map').dataset.turn")), 1)
  assert.deepEqual(await evaluate("JSON.parse(document.querySelector('.dungeon-map').dataset.player)"), beforeReload.run.battle.combat.position)
  assert.deepEqual(await evaluate("JSON.parse(document.querySelector('.dungeon-map').dataset.enemies).map((enemy)=>enemy.hp)"), beforeReload.run.battle.combat.enemies.map((enemy)=>enemy.hp))
  await clickButton('探索メニューを開く'); await clickButton('ダンジョン情報'); await clickButton('開発テスト：敵へ接近')
  const bossHp = await evaluate("JSON.parse(document.querySelector('.dungeon-map').dataset.enemies)[0].hp")
  await clickButton('攻撃')
  await waitFor(`JSON.parse(document.querySelector('.dungeon-map').dataset.enemies)[0].hp < ${bossHp}`, '特殊ボスを攻撃できません。')
  await clickButton('探索メニューを開く'); await clickButton('ダンジョン情報'); await clickButton('開発テスト：ボス撃破')
  await waitFor(`(${databaseAccess})().then((data)=>data?.player.specialBossClears.includes('forest') && data.run.battle.loot.chests.filter((chest)=>chest.floor===1).length===3)`, '撃破・3箱・クリア記録を保存できません。')
  await clickButton('探索メニューへ戻る'); await clickButton('閉じる')
  for (let count = 1; count <= 3; count++) {
    await clickButton('探索メニューを開く'); await clickButton('ダンジョン情報'); await clickButton('開発テスト：宝箱へ接近')
    await clickButton('拾う')
    await waitFor(`(${databaseAccess})().then((data)=>data?.run?.battle.loot.chests.filter((chest)=>chest.floor===1&&chest.opened).length===${count})`, `${count}個目の報酬を保存できません。`)
  }
  const rewards = await evaluate(`(${databaseAccess})()`)
  assert.equal(rewards.player.treasures.length, 3)
  await command('Page.reload')
  await waitFor("document.querySelector('.title-start')&&!document.querySelector('.title-start').disabled", '報酬取得後に再読込できません。')
  await clickButton('探索を再開')
  await waitFor("document.querySelector('.dungeon-map')?.dataset.mapSize==='13'", '報酬取得後に探索再開できません。')
  assert.equal(await evaluate("JSON.parse(document.querySelector('.dungeon-map').dataset.chests).filter((chest)=>chest.opened).length"), 3)
  await clickButton('探索メニューを開く'); await clickButton('ダンジョン情報'); await clickButton('開発テスト：階段へ移動')
  await clickButton('階段を使ってクリア'); await clickButton('町へ戻る')
  await waitFor(`(${databaseAccess})().then((data)=>data?.run===null && data.player.specialBossClears.includes('forest') && data.player.treasures.length===3)`, 'クリア後の恒久記録と報酬を保存できません。')
  await clickButton('ダンジョン')
  assert.match(await evaluate("document.querySelector('.stock-card--1 .stock-status').innerText"), /クリア/)
  await clickButton('前の画面へ戻る')
  await assertScreen('町メニュー')
}
