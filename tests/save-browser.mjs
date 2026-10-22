import assert from 'node:assert/strict'

// 本物のIndexedDBを同じブラウザプロファイルで読み書きする。アプリ状態の注入は行わない。
export const databaseAccess = `async (mode = 'readonly', value) => {
  const { SAVE_DATABASE, SAVE_STORE, SAVE_KEY } = await import('/src/persistence/saveStorage.ts');
  const database = await new Promise((resolve, reject) => { const request = indexedDB.open(SAVE_DATABASE, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try { return await new Promise((resolve, reject) => {
    const transaction = database.transaction(SAVE_STORE, mode);
    const request = mode === 'readonly' ? transaction.objectStore(SAVE_STORE).get(SAVE_KEY) : transaction.objectStore(SAVE_STORE).put(value, SAVE_KEY);
    let result; request.onsuccess = () => { result = request.result; }; transaction.oncomplete = () => resolve(result); transaction.onabort = () => reject(transaction.error);
  }); } finally { database.close(); }
}`

export async function runSaveBrowserChecks({ evaluate, command, clickButton, clickExactButton, assertScreen, assertExplorationScreen, waitFor, captureScreen }) {
  const readDatabase = () => evaluate(`(${databaseAccess})()`)
  const writeDatabase = (value) => evaluate(`(${databaseAccess})('readwrite', ${JSON.stringify(value)})`)
  const openPanel = async () => { await clickButton('セーブ・ロード'); await waitFor("document.querySelector('.save-load-panel') && !document.querySelector('.save-load-panel fieldset').disabled", '保存情報の確認が完了しません。') }
  const notification = (text) => waitFor(`document.querySelector('.save-load-panel [role=status]')?.textContent.includes(${JSON.stringify(text)})`, text + 'の通知がありません。')
  const load = async () => { await clickExactButton('ロード'); await clickExactButton('ロードする'); await notification('ロードしました') }
  const status = async () => {
    await clickButton('ステータス'); await assertScreen('ステータス')
    const text = await evaluate("document.querySelector('main').innerText")
    await clickButton('前の画面へ戻る'); await assertScreen('町メニュー'); return text
  }
  const inventory = async () => {
    await clickButton('装備・所持品'); await assertScreen('装備・所持品')
    const rows = {}
    for (const category of ['武器', '防具', 'アクセサリー']) {
      await clickExactButton(category)
      rows[category] = await evaluate("[...document.querySelectorAll('.inventory-item')].map((item) => item.innerText)")
    }
    rows.slots = await evaluate("[...document.querySelectorAll('.equipment-slot')].map((item) => item.innerText)")
    await clickButton('前の画面へ戻る'); return rows
  }
  const dungeonView = async () => {
    await clickButton('ダンジョン'); await assertScreen('ダンジョン')
    const stocks = await evaluate("[...document.querySelectorAll('.stock-card')].map((card) => card.innerText)")
    await evaluate("document.querySelector('.stock-card--1 .planned-actions button:nth-child(2)').click()")
    await assertExplorationScreen()
    const view = await evaluate("(() => { const canvas = document.querySelector('.dungeon-map'); return { layout: canvas.dataset.layout, enemies: canvas.dataset.enemies, seed: canvas.dataset.visualSeed, stairs: canvas.dataset.stairs, floor: canvas.dataset.floor }; })()")
    assert.equal(view.floor, '1')
    await clickButton('探索メニューを開く'); await clickButton('町へ帰還'); await clickButton('帰還する'); await assertScreen('探索結果'); await clickButton('町へ戻る')
    return { stocks, view }
  }

  const beforeStatus = await status(); const beforeInventory = await inventory()
  const beforeDungeon = await dungeonView()
  await waitFor("document.querySelector('.save-status')?.dataset.saving === 'false'", '自動保存が完了しません。')
  await openPanel()
  assert.equal(await evaluate("document.querySelector('.save-presence').textContent.includes('あり')"), true)
  assert.equal(await evaluate("[...document.querySelectorAll('.save-load-panel button')].find((button) => button.textContent === 'ロード').disabled"), false)
  for (const width of [360, 390, 430]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    assert.equal(await evaluate("(() => { const panel = document.querySelector('.save-load-panel').getBoundingClientRect(); return panel.left >= 0 && panel.right <= innerWidth && panel.top >= 0 && panel.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth; })()"), true, 'セーブ・ロードUIがはみ出します。')
    await captureScreen('save-load-' + width)
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await clickExactButton('セーブ'); await clickExactButton('上書きする'); await notification('セーブしました')
  const saved = await readDatabase()
  assert.equal(saved.schemaVersion, 2); assert.equal(saved.player.level, 30); assert.equal(saved.player.job, 'warrior')
  assert.equal(saved.stocks.length, 3); assert.ok(saved.stocks.every((stock) => stock.dungeon && Number.isInteger(stock.dungeon.visualSeed)))
  assert.ok(saved.player.inventory.some((item) => item.favorite))
  assert.ok(saved.player.inventory.some((item) => item.specialEffect))
  assert.ok(saved.player.inventory.some((item) => item.skills.length))
  assert.deepEqual(Object.keys(saved).sort(), ['player', 'run', 'savedAt', 'schemaVersion', 'stocks'])
  assert.equal(saved.run, null)
  await clickExactButton('セーブ'); await clickExactButton('キャンセル')
  assert.deepEqual(await readDatabase(), saved, '上書きキャンセルで保存データが変化しました。')

  // put後にトランザクションを中断し、成功表示と旧レコード保護を確認する。
  await evaluate("window.originalSavePut = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...args) { const request = window.originalSavePut.apply(this, args); this.transaction.abort(); return request; }")
  await clickExactButton('セーブ'); await clickExactButton('上書きする')
  await waitFor("document.querySelector('.save-load-panel [role=alert]')?.textContent.includes('保存できません')", '保存失敗が通知されません。')
  assert.equal(await evaluate("document.querySelector('.save-load-panel').innerText.includes('セーブしました')"), false)
  await evaluate('IDBObjectStore.prototype.put = window.originalSavePut; delete window.originalSavePut')
  assert.deepEqual(await readDatabase(), saved, '保存失敗で前回セーブが失われました。')

  // 同一タブの実際の再読み込み。初期状態から保存済み状態を手動ロードする。
  await command('Page.reload', { ignoreCache: true }); await assertScreen('ローグライク')
  await waitFor("!document.querySelector('.title-start')?.disabled", '起動時の保存確認が完了しません。')
  await clickButton('ゲーム開始'); await assertScreen('町メニュー')
  assert.equal(await evaluate("document.querySelector('.level-chip strong').textContent"), 'Lv.30', '町のデータが復元されません。')
  await openPanel()
  assert.equal(await evaluate("document.querySelector('.save-presence').textContent.includes('あり')"), true)
  assert.equal(await evaluate("document.querySelector('.save-timestamp').textContent.includes('未保存')"), false)
  assert.deepEqual(await readDatabase(), saved, '起動時に初期状態で上書きされました。')
  await clickExactButton('ロード'); await clickExactButton('キャンセル')
  assert.equal(await evaluate("document.querySelector('.level-chip strong').textContent"), 'Lv.30')
  await load(); await load(); await clickButton('閉じる')
  assert.equal(await status(), beforeStatus, '能力値・HP・職業・スキルが復元されません。')
  assert.deepEqual(await inventory(), beforeInventory, '所持品・装備が復元されません。')
  const afterDungeon = await dungeonView()
  assert.deepEqual(afterDungeon, beforeDungeon, '同じダンジョンの地形・初期敵・階段・外観シード・攻略記録が復元されません。')
  await waitFor("document.querySelector('.save-status')?.dataset.saving === 'false'", '帰還の保存が完了しません。')

  await openPanel()
  for (const broken of [{ ...saved, schemaVersion: 99 }, { ...saved, player: { ...saved.player, inventory: [] } }]) {
    await writeDatabase(broken); await clickExactButton('ロード'); await clickExactButton('ロードする')
    await waitFor("document.querySelector('.save-load-panel [role=alert]') !== null", '破損・バージョン不一致が通知されません。')
    assert.equal(await evaluate("document.querySelector('.level-chip strong').textContent"), 'Lv.30')
    assert.deepEqual(await readDatabase(), broken, '不正データを自動削除・上書きしました。')
  }
  await writeDatabase(saved)
  await evaluate("window.originalSaveGet = IDBObjectStore.prototype.get; IDBObjectStore.prototype.get = function() { throw new Error('E2E read failure'); }")
  await clickExactButton('ロード'); await clickExactButton('ロードする')
  await waitFor("document.querySelector('.save-load-panel [role=alert]') !== null", '読み込み失敗が通知されません。')
  await evaluate('IDBObjectStore.prototype.get = window.originalSaveGet; delete window.originalSaveGet')
  await clickButton('閉じる')
  assert.equal(await status(), beforeStatus)
  assert.deepEqual(await inventory(), beforeInventory)
  assert.deepEqual(await readDatabase(), saved)
  console.log('保存E2E: 実IndexedDB保存・再読み込み・手動ロード、Lv.30/職業/HP/能力値/全所持品/装備/スキル/特殊効果/3ストック/外観シード、複数回ロード、上書きキャンセル、保存abort・破損・未対応版・読取失敗時の保持、360/390/430×844を確認しました。')
}
