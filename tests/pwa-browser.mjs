import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs'
import { basename, dirname, extname, join, resolve, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { build } from 'vite'
import { startBrowser } from './pwa-browser-driver.mjs'
import { pwaFixture } from './pwa-fixture.mjs'

const temporary = mkdtempSync(join(tmpdir(), 'roguelike-pwa-'))
const fixture = await pwaFixture()
const walk = (path) => readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)])
const images = walk(resolve('public')).filter((path) => /\.(png|svg)$/.test(path)).map((path) => relative(resolve('public'), path).split(sep).join('/'))
const database = `async (value) => {
  const db = await new Promise((resolve,reject)=>{const request=indexedDB.open('roguelike-game',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  try{return await new Promise((resolve,reject)=>{const tx=db.transaction('saves', value ? 'readwrite':'readonly');const request=value?tx.objectStore('saves').put(value,'main'):tx.objectStore('saves').get('main');let result;request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error)})}finally{db.close()}
}`

async function checkBuild(base, outDir, profileDirectory) {
  const oldBase = process.env.VITE_BASE_PATH
  process.env.VITE_BASE_PATH = base
  try { await build({ build: { outDir, emptyOutDir: false }, logLevel: 'warn' }) }
  finally { if (oldBase === undefined) delete process.env.VITE_BASE_PATH; else process.env.VITE_BASE_PATH = oldBase }
  const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.webmanifest'), 'utf8'))
  assert.equal(manifest.start_url, base); assert.equal(manifest.scope, base)
  assert.ok(manifest.icons.every((icon) => icon.src.startsWith(base + 'pwa/')))
  const sw = readFileSync(join(outDir, 'sw.js'), 'utf8')
  for (const image of images) assert.ok(sw.includes(image), image + 'がプリキャッシュ対象にありません')
  assert.ok(!sw.includes('.zip')); assert.ok(!sw.includes('deleteDatabase'))
  const html = readFileSync(join(outDir, 'index.html'), 'utf8')
  assert.ok(html.includes(`href="${base}manifest.webmanifest"`)); assert.ok(html.includes(`src="${base}assets/`))
  const css = walk(join(outDir, 'assets')).filter((path) => path.endsWith('.css')).map((path) => readFileSync(path,'utf8')).join('')
  if (base !== '/') assert.doesNotMatch(css, /url\(["']?\/assets\//)

  let networkAvailable = true; let revision = 1; const wrongPaths = []
  const server = createServer((request, response) => {
    if (!networkAvailable) { response.writeHead(503); response.end(); return }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    if (!pathname.startsWith(base)) { wrongPaths.push(pathname); response.writeHead(404); response.end(); return }
    const file = resolve(outDir, pathname.slice(base.length) || 'index.html')
    if (!file.startsWith(resolve(outDir) + sep)) { response.writeHead(403); response.end(); return }
    try {
      let data = readFileSync(file)
      if (basename(file) === 'sw.js') data = Buffer.concat([Buffer.from(`// test revision ${revision}\n`), data])
      response.writeHead(200, { 'Content-Type': { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml' }[extname(file)] ?? 'application/octet-stream', 'Cache-Control':'no-store' }); response.end(data)
    } catch { wrongPaths.push(pathname); response.writeHead(404); response.end() }
  })
  await new Promise((resolve) => server.listen(0,'127.0.0.1',resolve))
  const appUrl = `http://127.0.0.1:${server.address().port}${base}`
  const browser = await startBrowser(profileDirectory); let page = browser.page; let installed = false
  try {
    await page.command('Runtime.enable'); await page.command('Page.enable'); await page.command('Network.enable')
    await page.command('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true })
    await page.command('Page.navigate', { url:appUrl })
    await page.waitFor("document.querySelector('.title-start') && !document.querySelector('.title-start').disabled", '起動できません')
    await page.waitFor("navigator.serviceWorker.ready.then((registration)=>registration.active?.state==='activated')", 'キャッシュとSW有効化が完了しません')
    assert.equal(await page.evaluate('navigator.serviceWorker.ready.then((registration)=>registration.scope)'), appUrl)
    assert.equal(await page.evaluate(`Promise.all(${JSON.stringify(images.map((path)=>appUrl+path))}.map(async(url)=>!!await caches.match(url,{ignoreSearch:true}))).then((found)=>found.every(Boolean))`), true, '未表示画像がキャッシュされていません')
    await page.reload()
    assert.equal(await page.evaluate('!!navigator.serviceWorker.controller'), true)
    const installability = await page.command('Page.getInstallabilityErrors')
    assert.deepEqual(installability.installabilityErrors, [], 'インストール条件が成立しません')

    // テスト専用のブラウザプロファイルへ実際にインストールし、standaloneで起動する。
    try {
      await browser.browser.command('PWA.install', { manifestId:appUrl, installUrlOrBundleUrl:appUrl }); installed = true
      await browser.browser.command('PWA.changeAppUserSettings', { manifestId:appUrl, displayMode:'standalone' })
      await browser.browser.command('PWA.launch', { manifestId:appUrl })
      const { targetInfos } = await browser.browser.command('Target.getTargets')
      const appTarget=targetInfos.find((target)=>target.type==='page' && target.url.startsWith(appUrl) && !target.attached)
      assert.ok(appTarget, 'インストール済みアプリのページがありません')
      page = await browser.attach(appTarget.targetId)
      await page.command('Runtime.enable'); await page.command('Page.enable'); await page.command('Network.enable')
      await page.waitFor("document.querySelector('.title-start') && !document.querySelector('.title-start').disabled", 'インストール済みPWAを起動できません')
      assert.equal(await page.evaluate("matchMedia('(display-mode: standalone)').matches"), true)
      console.log(`PWA ${base}: PCインストールとstandalone起動を確認`)
    } catch (error) { if (installed || !/wasn't found|not supported/i.test(error.message)) throw error; console.log(`PWA ${base}: このヘッドレスブラウザのインストール操作は未対応: ${error.message}`) }
    await page.command('Emulation.setDeviceMetricsOverride', { width:390,height:844,deviceScaleFactor:1,mobile:true })
    await page.evaluate(`(${database})(${JSON.stringify(fixture)})`)
    await page.reload(); await page.click('探索を再開')
    await page.waitFor("document.querySelector('.dungeon-map')?.dataset.viewSize==='11'", '探索を再開できません')
    const read = () => page.evaluate(`(${database})()`)
    const saved = (condition) => page.waitFor(`(async()=>{if(document.querySelector('.save-status').dataset.saving!=='false')return false;const data=await (${database})();return ${condition}})()`, '自動保存が完了しません')
    const move = async (label) => { await page.click(label+'へ移動'); await saved("data.run.battle.combat.turn===Number(document.querySelector('.dungeon-map').dataset.turn)") }
    // 実操作で敵へ接近する。経路だけテスト側で計算し、状態変更はすべてゲームUIに任せる。
    const plan = (data, targets, distance = 1) => {
      const combat=data.run.battle.combat, origin=combat.position, map=data.stocks[0].dungeon.floors[data.run.floor-1].map
      const occupied=new Set(combat.enemies.map((enemy)=>`${enemy.position.x},${enemy.position.y}`)); const queue=[{...origin,first:null}];const seen=new Set([`${origin.x},${origin.y}`])
      for(let i=0;i<queue.length;i++){
        const current=queue[i]
        if(targets.some((target)=>Math.abs(current.x-target.x)+Math.abs(current.y-target.y)===distance)) return current.first
        for(const [label,dx,dy]of[['上',0,-1],['左',-1,0],['右',1,0],['下',0,1]]){const x=current.x+dx,y=current.y+dy,key=`${x},${y}`;if(x<0||y<0||x>=20||y>=20||seen.has(key)||occupied.has(key)||!['grass','path','ruinsFloor','castleFloor'].includes(map[y][x]))continue;seen.add(key);queue.push({x,y,first:current.first??label})}
      } throw new Error('操作可能な経路がありません')
    }
    await move('上')
    let attacked=false
    for(let i=0;i<70;i++){
      const data=await read(); const combat=data.run.battle.combat
      const direction=plan(data,combat.enemies.map((enemy)=>enemy.position))
      if(direction===null){await page.click('攻撃');await saved(`data.run.battle.combat.turn===${combat.turn+1}`);attacked=true;break}
      await move(direction)
    }
    assert.ok(attacked); const onlineSave=await read(); assert.ok(onlineSave.run.battle.loot.resolvedEnemyIds.length)
    networkAvailable=false
    await page.command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
    await page.reload(); assert.equal(await page.evaluate('navigator.onLine'),false)
    await page.click('探索を再開'); await page.waitFor("document.querySelector('.dungeon-map')",'オフラインで再開できません')
    assert.deepEqual(await read(),onlineSave,'再開だけで保存状態が変わりました')
    // 初回に表示していなかった全画像もネットワークなしでデコードする。
    assert.equal(await page.evaluate(`Promise.all(${JSON.stringify(images.map((path)=>appUrl+path))}.map(async(url)=>{const image=new Image();image.src=url;try{await image.decode();return image.naturalWidth>0}catch{return false}})).then((loaded)=>loaded.every(Boolean))`),true,'オフラインで画像が欠落しました')
    const chest=(await read()).run.battle.loot.chests[0]; assert.ok(chest)
    for(let i=0;i<150;i++){
      const data=await read(); const combat=data.run.battle.combat
      const adjacent=combat.enemies.some((enemy)=>Math.abs(enemy.position.x-combat.position.x)+Math.abs(enemy.position.y-combat.position.y)===1)
      if(adjacent){await page.click('攻撃');await saved(`data.run.battle.combat.turn===${combat.turn+1}`);continue}
      const direction=plan(data,[chest.position],0); if(direction===null)break
      await move(direction)
    }
    const clickCell=async(position)=>page.evaluate(`(()=>{const canvas=document.querySelector('.dungeon-map'),origin=JSON.parse(canvas.dataset.cameraOrigin),bounds=canvas.getBoundingClientRect();canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:bounds.left+(${position.x}-origin.x+.5)*bounds.width/11,clientY:bounds.top+(${position.y}-origin.y+.5)*bounds.height/11}))})()`)
    await page.click('拾う'); await saved('data.run.battle.loot.chests.some((chest)=>chest.opened)')
    const offlineSave=await read();assert.ok(offlineSave.run.battle.loot.items.length);assert.equal(offlineSave.schemaVersion,5)
    await page.reload();await page.click('探索を再開');await page.waitFor("document.querySelector('.dungeon-map')",'オフライン再起動に失敗')
    assert.deepEqual(await read(),offlineSave);await clickCell(chest.position);assert.deepEqual(await read(),offlineSave,'二重報酬が発生しました')
    for(const width of [360,390,430]){
      await page.command('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true})
      assert.equal(await page.evaluate("(()=>{const canvas=document.querySelector('.dungeon-map'),map=canvas.getBoundingClientRect(),skills=document.querySelector('.exploration-controls').getBoundingClientRect();return canvas.dataset.viewSize==='11'&&map.left>=0&&map.right<=innerWidth&&skills.bottom<=innerHeight&&document.documentElement.scrollWidth<=innerWidth})()"),true,`${width}で表示がはみ出します`)
    }
    const stairs=fixture.stocks[0].dungeon.floors[0].stairs
    for(let i=0;i<150;i++){
      const data=await read(),combat=data.run.battle.combat
      if(combat.enemies.some((enemy)=>Math.abs(enemy.position.x-combat.position.x)+Math.abs(enemy.position.y-combat.position.y)===1)) {await page.click('攻撃');await saved(`data.run.battle.combat.turn===${combat.turn+1}`);continue}
      const direction=plan(data,[stairs],0);if(direction===null)break
      await move(direction)
    }
    await page.click('次の階へ');await saved('data.run.floor===2')
    const floorSave=await read();assert.ok(floorSave.run.battle.combat.enemies.some((enemy)=>enemy.isBoss))
    await page.reload();await page.click('探索を再開');await page.waitFor("document.querySelector('.dungeon-map')?.dataset.floor==='2'",'階層移動後の再開に失敗')
    assert.deepEqual(await read(),floorSave)
    // 更新を実際にwaitingへ進める。探索中は通知のみで、勝手に再読み込みしない。
    networkAvailable=true; revision=2
    await page.command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
    await page.evaluate("window.__updateMarker=true; navigator.serviceWorker.getRegistration().then((registration)=>registration.update()).then(()=>true)")
    await page.waitFor("document.querySelector('.pwa-update button')",'更新通知が表示されません')
    assert.equal(await page.evaluate("document.querySelector('.pwa-update button').disabled && window.__updateMarker===true"),true)
    assert.deepEqual(await read(),floorSave)
    await page.click('探索メニューを開く');await page.click('町へ帰還');await page.click('帰還する');await page.waitFor("document.querySelector('.result-town-button')",'帰還できません')
    await saved('data.run===null');await page.click('町へ戻る')
    await page.waitFor("document.querySelector('.pwa-update button')?.disabled===false",'保存後に更新できません')
    const beforeUpdate=await read();await page.click('更新する')
    await page.waitFor("window.__updateMarker!==true && document.querySelector('.title-start') && !document.querySelector('.title-start').disabled",'更新が完了しません')
    assert.deepEqual(await read(),beforeUpdate,'SW更新で保存データが変化しました')
    assert.equal((await read()).schemaVersion,5)
    assert.deepEqual(page.errors,[],'アプリの実行時エラーが発生しました')
    assert.deepEqual(wrongPaths,[],'サブパス外または欠落したリソースへアクセスしました')
    console.log(`PWA ${base}: Manifest/SW/scope、全${images.length}画像のオフライン読み込み、操作・取得・自動保存・再開・更新・360/390/430表示が成功`)
  } finally {
    if(installed) await browser.browser.command('PWA.uninstall',{manifestId:appUrl}).catch(()=>undefined)
    if(page!==browser.page)page.close()
    await browser.stop();await new Promise((resolve)=>server.close(resolve))
  }
}

try {
  await checkBuild('/',join(temporary,'root'),join(temporary,'profile-root'))
  await checkBuild('/pwa-check/',join(temporary,'subpath'),join(temporary,'profile-subpath'))
} finally {
  // 作成したTemp直下の専用ディレクトリだけを削除する。
  if(dirname(resolve(temporary))!==resolve(tmpdir()) || !basename(temporary).startsWith('roguelike-pwa-'))throw new Error('予期しない削除対象です')
  rmSync(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200})
}
