import assert from 'node:assert/strict'
import { databaseAccess } from './save-browser.mjs'

export async function runResumeBrowserChecks({ evaluate, command, clickButton, clickExactButton, clickMapCell, assertScreen, assertExplorationScreen, waitFor, captureScreen }) {
  const read = () => evaluate(`(${databaseAccess})()`)
  const write = (data) => evaluate(`(${databaseAccess})('readwrite', ${JSON.stringify(data)})`)
  const waitSaved = (predicate = 'true') => waitFor(`(async () => {
    if (document.querySelector('.save-status')?.dataset.saving !== 'false') return false;
    const data = await (${databaseAccess})(); return !!data && (${predicate});
  })()`, '確定状態の自動保存が完了しません。')
  const reload = async () => {
    await evaluate('window.__e2eReloadMarker = true')
    await command('Page.reload', { ignoreCache: true })
    await waitFor("window.__e2eReloadMarker !== true && document.readyState === 'complete'", '新しいドキュメントを読み込めません。')
    await assertScreen('ローグライク'); await waitFor("!document.querySelector('.title-start')?.disabled", '起動時の検証が終わりません。')
  }
  const approach = async (label) => { await clickButton('探索メニューを開く'); await clickButton('ダンジョン情報'); await clickButton(label) }
  const visible = () => evaluate(`(() => { const canvas = document.querySelector('.dungeon-map'); return {
    player: canvas.dataset.player, enemies: canvas.dataset.enemies, layout: canvas.dataset.layout, seed: canvas.dataset.visualSeed,
    chest: canvas.dataset.chest, opened: canvas.dataset.chestOpened, yellow: canvas.dataset.yellowWarnings, red: canvas.dataset.redWarnings,
    turn: document.querySelector('.turn-display strong').textContent, hp: document.querySelector('.exploration-player > span:nth-of-type(2)').textContent,
    skills: [...document.querySelectorAll('[data-skill-id]')].map((button) => [button.dataset.skillId, button.querySelector('small').textContent])
  }; })()`)
  const move = async () => {
    const direction = await evaluate(`(() => {
      const canvas = document.querySelector('.dungeon-map'); const player = JSON.parse(canvas.dataset.player); const enemies = JSON.parse(canvas.dataset.enemies);
      return [['上',0,-1],['左',-1,0],['右',1,0],['下',0,1]].find(([,dx,dy]) => { const x=player.x+dx, y=player.y+dy; return x>=0 && x<20 && y>=0 && y<20 && canvas.dataset.layout[y*20+x]==='0' && !enemies.some((enemy)=>enemy.x===x&&enemy.y===y); })?.[0];
    })()`)
    assert.ok(direction); await clickButton(direction + 'へ移動')
  }
  await reload(); await clickButton('ゲーム開始'); await assertScreen('町メニュー')
  await clickButton('ダンジョン'); await clickExactButton('探索開始'); await assertExplorationScreen()
  await clickButton('上へ移動')
  await approach('開発テスト：敵へ接近')
  const beforeAttack = await visible(); await clickButton('攻撃')
  assert.equal(Number((await visible()).turn), Number(beforeAttack.turn) + 1)
  assert.notEqual((await visible()).enemies, beforeAttack.enemies)
  await approach('開発テスト：宝箱へ接近')
  const chest = await evaluate("JSON.parse(document.querySelector('.dungeon-map').dataset.chest)")
  await clickButton('開ける')
  await waitFor("document.querySelector('.dungeon-map').dataset.chestOpened === 'true'", '宝箱が開封されません。')
  await waitSaved("data.run?.battle.loot.chests.some((chest) => chest.opened) && data.run.battle.combat.turn === Number(document.querySelector('.turn-display strong').textContent)")
  const saved = await read(); const before = await visible()
  assert.ok(saved.run); assert.ok(saved.run.battle.loot.items.length > 0)
  assert.ok(Object.values(saved.run.battle.cooldowns).some((turns)=>turns>0))
  assert.equal(saved.player.currentHp, saved.run.battle.combat.playerHp)
  assert.equal(saved.run.battle.loot.chests.filter((chest) => chest.opened).length, 1)
  for (const width of [360, 390, 430]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    await reload()
    assert.equal(await evaluate("document.querySelector('.title-start').textContent.includes('探索を再開')"), true)
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth && document.querySelector('.resume-info').getBoundingClientRect().right <= innerWidth"), true)
    await clickButton('探索を再開'); await assertExplorationScreen()
    assert.deepEqual(await visible(), before, '再開時に探索状態が変化しました。')
    await clickButton('探索メニューを開く'); await clickButton('閉じる')
    assert.deepEqual(await read(), saved, '再開や再描画だけで保存・ターン処理が発生しました。')
    if (width === 390) await captureScreen('resume-390')
  }
  await clickMapCell(chest.x, chest.y)
  assert.deepEqual(await read(), saved, '開封済み宝箱を再取得しました。')
  await move(); await waitSaved(`data.run?.battle.combat.turn === ${saved.run.battle.combat.turn + 1}`)
  await clickButton('探索メニューを開く'); await clickButton('町へ帰還'); await clickButton('帰還する'); await assertScreen('探索結果')
  await waitSaved('data.run === null')
  await clickButton('町へ戻る')
  await waitSaved("data.player.currentHp === (await import('/src/game/player.ts')).calculateStats(data.player).maxHp")
  const townSave = await read()
  assert.ok(saved.run.battle.loot.items.every((item) => townSave.player.treasures.some((owned) => owned.id === item.id)))
  // 結果画面で直ちに再読み込みしても終了済みの探索へは戻らない。
  await reload()
  assert.equal(await evaluate("document.querySelector('.title-start').textContent.includes('探索を再開')"), false)
  assert.deepEqual(await read(), townSave)

  // 実IndexedDBに攻撃予告直前の検証済みデータを用意し、実際の1移動で死亡を起こす。
  const death = await evaluate(`(async () => {
    const data = ${JSON.stringify(saved)};
    const { getAttackCells } = await import('/src/game/combat/combat.ts');
    const { isPassable } = await import('/src/game/forestMap.ts'); const { readSaveData } = await import('/src/persistence/saveData.ts');
    const run = data.run, combat = run.battle.combat, map = data.stocks[run.stockId-1].dungeon.floors[run.floor-1].map;
    let chosen;
    for (const enemy of combat.enemies) { enemy.warning = null; enemy.statuses = { poison:0,burn:0,slow:0,stun:0 }; }
    for (const enemy of combat.enemies) for (const direction of ['up','left','right','down']) {
      if (chosen) continue;
      const cells = getAttackCells(enemy, direction, combat.position, map);
      for (const target of cells) {
        if (combat.enemies.some((other)=>other.position.x===target.x&&other.position.y===target.y)) continue;
        for (const [label,dx,dy] of [['右',-1,0],['左',1,0],['下',0,-1],['上',0,1]]) {
          const origin={x:target.x+dx,y:target.y+dy};
          if (!chosen && isPassable(map,origin) && !combat.enemies.some((other)=>other.position.x===origin.x&&other.position.y===origin.y)) {
            combat.position=origin; enemy.warning={remaining:1,cells:getAttackCells(enemy,direction,target,map),direction,target}; chosen=label;
          }
        }
      }
    }
    data.player.currentHp=1; combat.playerHp=1; run.battle.guardTurns=0;
    if (!chosen) throw new Error('死亡の検証位置がありません。');
    return { data: readSaveData(data), direction: chosen };
  })()`)
  await write(death.data); await reload(); await clickButton('探索を再開'); await assertExplorationScreen(); await clickButton(death.direction + 'へ移動')
  await assertScreen('探索結果'); await waitSaved('data.run === null && data.player.currentHp === 0')
  await clickButton('町へ戻る')
  await waitSaved("data.player.currentHp === (await import('/src/game/player.ts')).calculateStats(data.player).maxHp && data.player.currentHp > 0")
  await reload(); assert.equal(await evaluate("document.querySelector('.title-start').textContent.includes('探索を再開')"), false)

  // 最終階の状態をIndexedDBから復元し、既存のボス撃破・階段処理で終了する。
  const final = await evaluate(`(async () => {
    const data=${JSON.stringify(saved)}; const run=data.run, stock=data.stocks[run.stockId-1], dungeon=stock.dungeon;
    const { createBattleState }=await import('/src/game/battle.ts'); const { instantiateEnemies }=await import('/src/game/dungeon.ts');
    run.floor=dungeon.totalFloors; stock.highestFloor=run.floor; stock.totalFloorsKnown=true;
    const floor=dungeon.floors[run.floor-1]; run.battle.combat=createBattleState(data.player,instantiateEnemies(floor),floor.start).combat;
    const { readSaveData }=await import('/src/persistence/saveData.ts'); return readSaveData(data);
  })()`)
  await write(final); await reload(); await clickButton('探索を再開'); await assertExplorationScreen()
  await approach('開発テスト：階段へ移動')
  await clickButton('探索メニューを開く'); await clickButton('ダンジョン情報'); await clickButton('開発テスト：ボス撃破'); await clickButton('探索メニューへ戻る'); await clickButton('閉じる')
  await clickButton('階段を使ってクリア'); await assertScreen('探索結果'); await waitSaved('data.run === null && data.stocks[0].cleared')
  await reload(); assert.equal(await evaluate("document.querySelector('.title-start').textContent.includes('探索を再開')"), false)

  const legacy = { ...townSave, schemaVersion: 1 }; delete legacy.run
  await write(legacy); await reload(); await clickButton('ゲーム開始'); await assertScreen('町メニュー')
  assert.equal(await evaluate("document.querySelector('.level-chip strong').textContent"), 'Lv.' + legacy.player.level)
  assert.deepEqual(await read(), legacy, 'v1を読んだだけで上書きしました。')
  await clickButton('装備・所持品'); await clickExactButton('防具')
  await evaluate("[...document.querySelectorAll('.inventory-item')].find((button) => button.querySelector('strong').textContent.includes('試験用軽鎧')).click()")
  await clickButton('お気に入り解除'); await clickButton('閉じる')
  await waitSaved('data.schemaVersion === 3 && data.run === null && !data.player.inventory.find((item)=>item.id === "test-light-armor").favorite')
  const migrated = await read()
  const invalid = { ...migrated, schemaVersion: 99 }
  await write(invalid); await reload(); await clickButton('ゲーム開始'); await clickButton('装備・所持品'); await evaluate("[...document.querySelectorAll('.equipment-slot')].find(b=>!b.disabled).click()")
  assert.deepEqual(await read(), invalid, '未対応データを自動保存で上書きしました。')
  await write(migrated); await reload()
  await clickButton('データ削除')
  assert.equal(await evaluate("document.querySelector('[role=alertdialog]') !== null"), true)
  await clickButton('キャンセル')
  assert.deepEqual(await read(), migrated, '削除キャンセルで既存セーブが変化しました')
  await clickButton('データ削除'); await clickButton('削除する')
  await waitFor("document.querySelector('.title-delete')===null && document.querySelector('.title-start').textContent.includes('ゲーム開始')", '削除後のタイトル表示が更新されません')
  assert.equal(await read(), undefined, '町と探索中のセーブが削除されませんでした')
  await reload(); assert.equal(await read(), undefined, '再読み込み後に削除済みセーブが戻りました')
  await clickButton('ゲーム開始'); await assertScreen('町メニュー')
  assert.equal(await evaluate("document.querySelector('.level-chip strong').textContent"), 'Lv.1')
  assert.equal(await read(), undefined, '初期状態が無操作で自動保存されました')
  await clickButton('ダンジョン'); await clickExactButton('生成')
  await waitSaved('data.schemaVersion===3 && data.stocks[0].dungeon !== null && data.player.level===1')
  await clickExactButton('探索開始'); await waitSaved('data.run !== null')
  await reload(); await clickButton('データ削除'); await clickButton('削除する')
  await waitFor("document.querySelector('.title-start').textContent.includes('ゲーム開始')", '探索中データ削除後の表示が更新されません')
  assert.equal(await read(), undefined, '探索中のセーブが削除されませんでした')
  console.log('自動保存・再開E2E: 移動/攻撃/回復/開封後の原子的保存、実再読み込みで全探索状態一致、再開時0ターン、再取得防止、継続、帰還/死亡/クリア後の探索消去、v1移行、破損保護、360/390/430×844を確認しました。')
}
