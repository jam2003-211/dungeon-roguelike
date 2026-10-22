import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]
const browserPath = browserCandidates.find(existsSync)
assert.ok(browserPath, 'ChromeまたはEdgeが見つかりません。')

const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:5173/'
const screenshotDirectory = process.env.SCREENSHOT_DIR
const debuggingPort = 10000 + Math.floor(Math.random() * 40000)
const profileDirectory = mkdtempSync(join(tmpdir(), 'roguelike-browser-test-'))
const browser = spawn(browserPath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${profileDirectory}`,
  '--window-size=390,844', 'about:blank',
], { stdio: 'ignore', windowsHide: true })

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function getPageTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debuggingPort}/json/list`)
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page')
      if (page) return page
    } catch {
      await delay(100)
    }
  }
  throw new Error('ヘッドレスブラウザへ接続できませんでした。')
}

const target = await getPageTarget()
const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
const exceptions = []
let commandId = 0

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  }
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text)
  if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    exceptions.push(`${message.params.entry.text}${message.params.entry.url ? ` (${message.params.entry.url})` : ''}`)
  }
})

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

function command(method, params = {}) {
  commandId += 1
  return new Promise((resolve, reject) => {
    pending.set(commandId, { resolve, reject })
    socket.send(JSON.stringify({ id: commandId, method, params }))
  })
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function waitFor(expression, message) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await evaluate(expression)) return
    await delay(50)
  }
  throw new Error(message)
}

async function assertScreen(title) {
  try {
    await waitFor(`document.querySelector('h1')?.textContent.includes(${JSON.stringify(title)})`, `${title}画面へ遷移できません。`)
  } catch (error) {
    const diagnostics = await evaluate(`({ url: location.href, title: document.title, text: document.body?.innerText.slice(0, 300) })`)
    diagnostics.exceptions = [...exceptions]
    throw new Error(`${error.message} ${JSON.stringify(diagnostics)}`)
  }
  assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `${title}画面が横にはみ出しています。`)
}

async function assertExplorationScreen() {
  await waitFor("document.querySelector('.dungeon-map')?.getAttribute('aria-label')?.includes('20×20')", 'テスト探索画面へ遷移できません。')
  const layout = await evaluate(`(() => {
    const canvas = document.querySelector('.dungeon-map');
    const map = canvas.getBoundingClientRect();
    const skills = document.querySelector('.skill-bar').getBoundingClientRect();
    return {
      canvasWidth: canvas.width, canvasHeight: canvas.height,
      square: Math.abs(map.width - map.height) < 0.1,
      insideViewport: map.left >= 0 && map.right <= innerWidth && map.top >= 0 && skills.bottom <= innerHeight,
      noHorizontalScroll: document.documentElement.scrollWidth <= innerWidth,
      noVerticalScroll: document.documentElement.scrollHeight <= innerHeight,
    };
  })()`)
  assert.deepEqual(layout, { canvasWidth: 400, canvasHeight: 400, square: true, insideViewport: true, noHorizontalScroll: true, noVerticalScroll: true }, '探索画面が縦画面内に正しく収まっていません。')
}

async function clickButton(label) {
  const clicked = await evaluate(`(() => {
    const element = [...document.querySelectorAll('button')].find((button) => button.textContent.includes(${JSON.stringify(label)}) || button.getAttribute('aria-label')?.includes(${JSON.stringify(label)}));
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`)
  assert.equal(clicked, true, `${label}ボタンを操作できません。`)
}

async function clickExactButton(label) {
  const clicked = await evaluate(`(() => { const element = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === ${JSON.stringify(label)}); if (!element || element.disabled) return false; element.click(); return true; })()`)
  assert.equal(clicked, true, `${label}ボタンを操作できません。`)
}

async function pressKey(key, repeat = false) {
  await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, repeat: ${repeat} }))`)
}

async function setInputValue(selector, value) {
  await evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
}

async function clickMapCell(x, y) {
  await evaluate(`(() => {
    const canvas = document.querySelector('.dungeon-map');
    const bounds = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: bounds.left + (${x} + .5) * bounds.width / 20,
      clientY: bounds.top + (${y} + .5) * bounds.height / 20,
    }));
  })()`)
}

async function assertAllDisabled(selector, expectedCount, message) {
  const result = await evaluate(`(() => {
    const buttons = [...document.querySelectorAll(${JSON.stringify(selector)})];
    return { count: buttons.length, allDisabled: buttons.every((button) => button.disabled) };
  })()`)
  assert.equal(result.count, expectedCount, `${message}のボタン数が想定と異なります。`)
  assert.equal(result.allDisabled, true, `${message}に操作可能なボタンがあります。`)
}

async function assertImageAssets(paths) {
  const results = await evaluate(`Promise.all(${JSON.stringify(paths)}.map((path) => new Promise((resolve) => {
    const image = new Image();
    image.addEventListener('load', () => resolve({ path, width: image.naturalWidth, height: image.naturalHeight }));
    image.addEventListener('error', () => resolve({ path, error: true }));
    image.src = path;
  })))`)
  for (const result of results) {
    assert.equal(result.error, undefined, `${result.path}を読み込めません。`)
    assert.ok(result.width > 0 && result.height > 0, `${result.path}の画像サイズが不正です。`)
  }
}

async function assertTransparentPixelAssets(paths) {
  const results = await evaluate(`(async () => {
    const results = [];
    for (const path of ${JSON.stringify(paths)}) {
      const image = new Image(); image.src = path; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0; let opaqueDark = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] === 0) transparent += 1;
        if (pixels[index + 3] > 200 && pixels[index] < 45 && pixels[index + 1] < 45 && pixels[index + 2] < 45) opaqueDark += 1;
      }
      results.push({ path, width: canvas.width, height: canvas.height, transparent, opaqueDark });
    }
    return results;
  })()`)
  for (const result of results) {
    assert.equal(result.width, result.height, `${result.path}の縦横比が正方形ではありません。`)
    assert.ok(result.transparent > 0, `${result.path}に透明背景がありません。`)
    assert.ok(result.opaqueDark > 0, `${result.path}の黒い輪郭または目が透明化されています。`)
  }
}

async function captureScreen(name) {
  if (!screenshotDirectory) return
  mkdirSync(screenshotDirectory, { recursive: true })
  const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(join(screenshotDirectory, `${name}.png`), Buffer.from(screenshot.data, 'base64'))
}

try {
  await command('Runtime.enable')
  await command('Page.enable')
  await command('Log.enable')
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await command('Page.navigate', { url: appUrl })
  await assertScreen('ローグライク')
  await captureScreen('01-title')

  await clickButton('ゲーム開始')
  await assertScreen('町メニュー')
  assert.match(await evaluate("getComputedStyle(document.querySelector('.town-screen')).backgroundImage"), /assets\/backgrounds\/town\.png/, '町背景が指定画像ではありません。')
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.town-menu .action-button__icon img')].map((image) => image.getAttribute('src'))"), [
    '/assets/icons/dungeon.png', '/assets/icons/equipment.png', '/assets/icons/status.png', '/assets/icons/jobs.png',
    '/assets/icons/settings.png', '/assets/icons/save.png', '/assets/icons/return.png',
  ], '町メニューのアイコンが指定画像と一致しません。')
  assert.equal(await evaluate("[...document.querySelectorAll('.town-menu .action-button__chevron img')].every((image) => image.getAttribute('src') === '/assets/arrows/arrow-right-16.png' && image.complete && image.naturalWidth === 16)"), true, '町メニューの右矢印が正しく表示されていません。')
  assert.equal(await evaluate("document.querySelector('.player-summary .avatar img')?.getAttribute('src')"), '/assets/jobs/none.png', '町メニューに無職画像が表示されていません。')
  await captureScreen('02-town')

  for (const [button, heading] of [
    ['ダンジョン', 'ダンジョン'], ['装備・所持品', '装備・所持品'], ['職業変更', '職業変更'],
  ]) {
    await clickButton(button)
    await assertScreen(heading)
    await captureScreen(`screen-${heading}`)
    if (heading === 'ダンジョン') {
      await assertAllDisabled('.planned-actions button', 6, 'ダンジョン未実装操作')
      assert.deepEqual(await evaluate("[...document.querySelectorAll('.stock-icon img')].map((image) => image.getAttribute('src'))"), [
        '/assets/icons/forest.png', '/assets/icons/ruins.png', '/assets/icons/castle_dark.png',
      ], 'ダンジョンストックのアイコンが指定画像と一致しません。')
      assert.equal(await evaluate("[...document.querySelectorAll('.stock-card')].every((card, index) => getComputedStyle(card).backgroundImage.includes(['/assets/backgrounds/forest.png', '/assets/backgrounds/ruins.png', '/assets/backgrounds/castle.png'][index]))"), true, 'ストックカードの背景が指定画像と一致しません。')
      assert.equal(await evaluate("document.querySelectorAll('.test-exploration-button').length"), 1, '森以外にもテスト探索ボタンがあります。')
      await clickButton('テスト探索')
      await assertExplorationScreen()
      assert.equal(await evaluate("document.querySelector('.turn-display strong').textContent"), '0', '探索開始時のターンが0ではありません。')
      assert.equal(await evaluate("document.querySelector('.dungeon-map').getAttribute('aria-label').includes('横3、縦18')"), true, '探索開始位置が不正です。')
      assert.equal(await evaluate("!document.querySelector('.attack-button').disabled && [...document.querySelectorAll('.skill-bar button')].every((button) => button.disabled)"), true, '通常攻撃または未実装スキルの有効状態が不正です。')
      assert.equal(await evaluate("document.querySelector('.dungeon-map').getAttribute('aria-label').includes('敵7体')"), true, '通常敵6種とボスの固定配置がありません。')
      assert.equal(await evaluate("document.querySelector('.exploration-avatar img')?.getAttribute('src')"), '/assets/jobs/none.png', '探索HUDに現在職業の画像が表示されていません。')
      await clickButton('攻撃')
      assert.equal(await evaluate("document.querySelector('.attack-button').getAttribute('aria-pressed')"), 'true', '攻撃モードを開始できません。')
      await clickMapCell(10, 10)
      assert.equal(await evaluate("document.querySelector('.turn-display strong').textContent"), '0', '無効な攻撃対象でターンが進みました。')
      await clickButton('攻撃')
      assert.equal(await evaluate("document.querySelector('.attack-button').getAttribute('aria-pressed')"), 'false', '攻撃ボタン再押下で解除されません。')
      await clickMapCell(2, 15)
      await waitFor("document.querySelector('.enemy-sheet') !== null", '敵情報パネルが開きません。')
      assert.match(await evaluate("document.querySelector('.enemy-sheet').innerText"), /ゴブリン[\s\S]*Lv\.1[\s\S]*HP 20 \/ 20[\s\S]*攻撃力 15/, '敵情報が不正です。')
      assert.equal(await evaluate("document.querySelector('.enemy-sheet img')?.getAttribute('src')"), '/assets/enemies/goblin.png', '敵情報に正式ゴブリン画像が表示されていません。')
      await clickButton('敵情報を閉じる')
      await captureScreen('03-test-exploration')

      await clickButton('上へ移動')
      await waitFor("document.querySelector('.turn-display strong').textContent === '1'", '十字キーの移動でターンが進みません。')
      await waitFor("Number(document.querySelector('.dungeon-map').dataset.yellowWarnings) > 0", '黄色の攻撃予告が表示されません。')
      const hpBeforeEvade = await evaluate("document.querySelector('.exploration-player > span:nth-of-type(2)').textContent")
      await pressKey('ArrowRight')
      await waitFor("document.querySelector('.turn-display strong').textContent === '2'", '矢印キーの移動でターンが進みません。')
      await waitFor("Number(document.querySelector('.dungeon-map').dataset.redWarnings) > 0", '赤色の攻撃予告へ変化しません。')
      await captureScreen('03b-red-warning')
      await pressKey('ArrowRight')
      assert.equal(await evaluate("document.querySelector('.turn-display strong').textContent"), '2', '障害物への移動でターンが進みました。')
      await pressKey('s')
      await waitFor("document.querySelector('.turn-display strong').textContent === '3'", 'WASD移動でターンが進みません。')
      assert.equal(await evaluate("document.querySelector('.exploration-player > span:nth-of-type(2)').textContent"), hpBeforeEvade, '予告範囲外へ退避したのにダメージを受けました。')
      await pressKey('ArrowDown', true)
      assert.equal(await evaluate("document.querySelector('.turn-display strong').textContent"), '3', 'キーリピートで移動しました。')

      await clickButton('攻撃')
      await clickMapCell(3, 16)
      await waitFor("document.querySelector('.turn-display strong').textContent === '4'", '空マスへの通常攻撃でターンが進みません。')

      await clickButton('攻撃')
      await clickButton('探索メニューを開く')
      await waitFor("document.querySelector('.exploration-menu') !== null", '探索メニューが開きません。')
      assert.equal(await evaluate("document.querySelector('.attack-button').getAttribute('aria-pressed')"), 'false', 'メニューを開いても攻撃モードが解除されません。')
      await pressKey('ArrowUp')
      assert.equal(await evaluate("document.querySelector('.turn-display strong').textContent"), '4', 'メニュー表示中に移動しました。')
      await clickButton('ステータス確認')
      await assertScreen('ステータス')
      await clickButton('装備画面へ')
      await assertScreen('装備・所持品')
      assert.match(await evaluate("document.body.innerText"), /探索中：閲覧のみ/, '探索中ステータス経由で装備変更が可能になりました。')
      await evaluate('history.back()')
      await assertScreen('ステータス')
      await clickButton('前の画面へ戻る')
      await assertExplorationScreen()
      assert.equal(await evaluate("document.querySelector('.exploration-menu') !== null"), true, 'ステータスから探索メニューへ戻りません。')
      await clickButton('所持品確認')
      await assertScreen('装備・所持品')
      assert.match(await evaluate("document.body.innerText"), /探索中：閲覧のみ/, '探索中の所持品が閲覧専用ではありません。')
      assert.equal(await evaluate("document.querySelectorAll('.equipment-slot:not(:disabled)').length"), 0, '探索中に装備解除が可能です。')
      await clickButton('前の画面へ戻る')
      await assertExplorationScreen()
      await clickButton('ダンジョン情報')
      await waitFor("document.querySelector('#dungeon-info-title') !== null", 'ダンジョン情報が開きません。')
      assert.match(await evaluate("document.querySelector('.dialog-panel').innerText"), /経過ターン\s*4/, 'ダンジョン情報のターン表示が不正です。')
      await clickButton('探索メニューへ戻る')
      await clickButton('町へ帰還')
      await waitFor("document.querySelector('#return-confirm-title') !== null", '帰還確認が開きません。')
      await clickButton('キャンセル')
      assert.equal(await evaluate("document.querySelector('#return-confirm-title') === null"), true, '帰還をキャンセルできません。')
      await clickButton('町へ帰還')
      await clickButton('帰還する')
      await assertScreen('探索結果')
      assert.match(await evaluate("document.querySelector('.result-panel').innerText"), /経過ターン\s*4/, '探索結果のターン表示が不正です。')
      await captureScreen('04-exploration-result')
      await clickButton('町へ戻る')
      await assertScreen('町メニュー')
      continue
    }
    if (heading === '装備・所持品') {
      assert.match(await evaluate("document.querySelector('.screen-intro').innerText"), /開発テスト用装備/, 'テスト装備が正式報酬と区別されていません。')
      assert.deepEqual(await evaluate("[...new Set([...document.querySelectorAll('.inventory-item__image')].map((image) => image.getAttribute('src')))].sort()"), ['/assets/weapons/bow.png', '/assets/weapons/spear.png', '/assets/weapons/staff.png', '/assets/weapons/sword.png', '/assets/weapons/wand.png'], '武器5種類の画像対応が不正です。')
      await clickExactButton('防具')
      assert.deepEqual(await evaluate("[...new Set([...document.querySelectorAll('.inventory-item__image')].map((image) => image.getAttribute('src')))].sort()"), ['/assets/armors/heavy_armor.png', '/assets/armors/heavy_clothes.png', '/assets/armors/light_armor.png', '/assets/armors/light_clothes.png'], '防具4種類の画像対応が不正です。')
      await setInputValue('.inventory-search', '試験用軽鎧')
      await clickButton('試験用軽鎧')
      await clickButton('お気に入り登録')
      assert.equal(await evaluate("document.querySelector('.item-detail button:nth-of-type(3)').disabled"), true, 'お気に入り装備を廃棄できます。')
      await clickButton('装備する')
      await setInputValue('.inventory-search', '')
      await clickExactButton('アクセサリー')
      await clickButton('試験護符・戦技'); await clickButton('装備する')
      await clickButton('試験護符・治癒'); await clickButton('装備する')
      assert.equal(await evaluate("[...document.querySelectorAll('.equipment-slot strong')].filter((node) => node.textContent.includes('試験護符')).length"), 2, 'アクセサリー2枠へ装備できません。')
    }
    if (heading === '職業変更') {
      assert.deepEqual(await evaluate("[...document.querySelectorAll('.job-icon img')].map((image) => image.getAttribute('src'))"), ['/assets/jobs/none.png', '/assets/jobs/warrior.png', '/assets/jobs/mage.png', '/assets/jobs/hunter.png', '/assets/jobs/paladin.png', '/assets/jobs/spellblade.png'], '職業6種類の画像対応が不正です。')
      await clickButton('開発テスト：Lv.30にする')
      await waitFor("[...document.querySelectorAll('.job-card')].every((card) => !card.classList.contains('is-locked'))", '職業の解放条件を反映できません。')
      const clicked = await evaluate(`(() => { const card = [...document.querySelectorAll('.job-card')].find((node) => node.querySelector('h2')?.textContent === '戦士'); const button = card?.querySelector('button'); if (!button || button.disabled) return false; button.click(); return true; })()`)
      assert.equal(clicked, true, '解放済み職業を選択できません。')
      await clickButton('変更する')
      await waitFor("document.querySelector('header')?.innerText.includes('現在の職業：戦士')", '職業変更が画面へ反映されません。')
    }
    await clickButton('前の画面へ戻る')
    await assertScreen('町メニュー')
  }

  await clickButton('ステータス')
  await assertScreen('ステータス')
  assert.match(await evaluate("document.body.innerText"), /戦士[\s\S]*Lv\.30[\s\S]*強撃[\s\S]*気絶撃/, 'レベル・職業・装備スキルがステータスへ反映されていません。')
  assert.equal(await evaluate("document.querySelector('.status-profile .avatar img')?.getAttribute('src')"), '/assets/jobs/warrior.png', '職業変更後の画像がステータスへ反映されていません。')
  await captureScreen('screen-status')
  await clickButton('装備画面へ')
  await assertScreen('装備・所持品')
  await evaluate('history.back()')
  await assertScreen('ステータス')
  await clickButton('前の画面へ戻る')
  await assertScreen('町メニュー')

  await clickButton('設定')
  await assertScreen('設定')
  await captureScreen('screen-settings')
  assert.equal(await evaluate(`(() => {
    const input = document.querySelector('input[type="range"]');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setValue.call(input, 25);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`), true)
  await waitFor(`document.querySelector('output')?.textContent === '25%'`, '音量スライダーの表示が更新されません。')
  await clickButton('前の画面へ戻る')
  await assertScreen('町メニュー')

  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find((button) => button.textContent.includes('セーブ'))?.disabled`), true, 'セーブが有効になっています。')
  await assertImageAssets([
    '/assets/arrows/arrow-right-16.png', '/assets/arrows/arrow-right-32.png',
    '/assets/arrows/arrow-left-16.png', '/assets/arrows/arrow-left-32.png',
    '/assets/arrows/arrow-up-16.png', '/assets/arrows/arrow-up-32.png',
    '/assets/arrows/arrow-down-16.png', '/assets/arrows/arrow-down-32.png',
    '/assets/enemies/goblin.png', '/assets/enemies/boar.png', '/assets/enemies/slime_king.png',
    '/assets/enemies/one_eye_bat.png', '/assets/enemies/stone_golem.png', '/assets/enemies/ghost.png',
    '/assets/jobs/none.png', '/assets/jobs/warrior.png', '/assets/jobs/mage.png', '/assets/jobs/hunter.png', '/assets/jobs/paladin.png', '/assets/jobs/spellblade.png',
    '/assets/weapons/sword.png', '/assets/weapons/spear.png', '/assets/weapons/bow.png', '/assets/weapons/wand.png', '/assets/weapons/staff.png',
    '/assets/armors/heavy_armor.png', '/assets/armors/light_armor.png', '/assets/armors/heavy_clothes.png', '/assets/armors/light_clothes.png',
  ])
  await assertTransparentPixelAssets([
    '/assets/enemies/goblin.png', '/assets/enemies/boar.png', '/assets/enemies/slime_king.png', '/assets/enemies/one_eye_bat.png', '/assets/enemies/stone_golem.png', '/assets/enemies/ghost.png',
    '/assets/jobs/none.png', '/assets/jobs/warrior.png', '/assets/jobs/mage.png', '/assets/jobs/hunter.png', '/assets/jobs/paladin.png', '/assets/jobs/spellblade.png',
    '/assets/weapons/sword.png', '/assets/weapons/spear.png', '/assets/weapons/bow.png', '/assets/weapons/wand.png', '/assets/weapons/staff.png',
    '/assets/armors/heavy_armor.png', '/assets/armors/light_armor.png', '/assets/armors/heavy_clothes.png', '/assets/armors/light_clothes.png',
  ])
  for (const width of [360, 430]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
    assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `${width}px幅で横にはみ出しています。`)
    await clickButton('ダンジョン')
    await assertScreen('ダンジョン')
    await clickButton('テスト探索')
    await assertExplorationScreen()
    assert.equal(await evaluate("document.querySelector('.turn-display strong').textContent"), '0', '再探索時にターンが初期化されていません。')
    assert.ok(await evaluate("document.querySelectorAll('.skill-bar--active button').length >= 7"), '装備由来スキルが探索欄へ反映されていません。')
    assert.equal(await evaluate("document.querySelector('.skill-bar--active').scrollWidth > document.querySelector('.skill-bar--active').clientWidth"), true, 'スキル欄が横スクロール可能ではありません。')
    await clickButton('強撃')
    assert.equal(await evaluate("[...document.querySelectorAll('.skill-bar--active button')].find((button) => button.textContent.includes('強撃')).classList.contains('is-active')"), true, 'スキル対象選択を開始できません。')
    await clickButton('強撃')
    assert.equal(await evaluate("[...document.querySelectorAll('.skill-bar--active button')].find((button) => button.textContent.includes('強撃')).classList.contains('is-active')"), false, 'スキル再押下で選択解除できません。')
    await evaluate(`(() => { const button = [...document.querySelectorAll('.skill-bar--active button')].find((node) => node.textContent.includes('強撃')); button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); })()`)
    await waitFor("document.querySelector('.skill-info') !== null", 'スキル長押し相当の説明表示が開きません。')
    assert.match(await evaluate("document.querySelector('.skill-info').innerText"), /物理2倍[\s\S]*クールダウン：3/, 'スキル説明が不正です。')
    await clickButton('閉じる')
    await captureScreen(`exploration-${width}x844`)
    await evaluate('history.back()')
    await assertScreen('ダンジョン')
    await clickButton('前の画面へ戻る')
    await assertScreen('町メニュー')
  }
  assert.deepEqual(exceptions, [], `ブラウザエラーが発生しました: ${exceptions.join(', ')}`)
  if (process.env.SCREENSHOT_PATH) {
    const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(process.env.SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'))
  }
  console.log('ブラウザE2E: 装備変更・検索・お気に入り保護・アクセサリー2枠、職業解放/変更、ステータス反映、探索中の変更禁止、スキル選択/取消/説明/横スクロール、360/390/430×844の20×20描画、既存戦闘・履歴・ブラウザエラーなしを確認しました。')
} finally {
  socket.close()
  if (browser.exitCode === null) {
    const exited = new Promise((resolve) => browser.once('exit', resolve))
    browser.kill()
    await Promise.race([exited, delay(2000)])
  }
  rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
