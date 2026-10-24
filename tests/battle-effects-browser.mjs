import assert from 'node:assert/strict'

export async function runBattleEffectsBrowserChecks({ evaluate, command, waitFor, captureScreen }) {
  const inBrowser = (fn) => evaluate('(' + fn.toString() + ')()')
  // 開発サーバー上の描画部品を検証。ゲーム状態や本番セーブは変更しない。
  await inBrowser(async () => {
    const React = await import('/node_modules/.vite/deps/react.js')
    const dom = await import('/node_modules/.vite/deps/react-dom_client.js')
    const createRoot = dom.createRoot ?? dom.default.createRoot
    const { BattleEffectsCanvas } = await import('/src/components/BattleEffectsCanvas.tsx')
    const host = document.createElement('div'); host.id = 'effects-test'
    Object.assign(host.style, { position: 'fixed', inset: '0', width: '330px', height: '330px', background: '#101010', zIndex: '90' })
    document.body.append(host)
    const skills = ['strongStrike', 'magicBolt', 'piercingShot', 'shockwave', 'flame', 'smallHeal', 'largeHeal', 'poisonStrike', 'slowSpell', 'stunStrike', 'dash', 'guard']
    const specials = ['poison', 'burn', 'slow', 'stun', 'knockback', 'critical', 'lifesteal', 'extraAttack']
    const events = [...skills.map(effect => ({ kind: 'skill', effect })), ...specials.map(effect => ({ kind: 'special', effect }))]
      .map((event, i) => ({ ...event, position: { x: 1 + i % 5 * 2, y: 1 + Math.floor(i / 5) * 2 }, from: { x: i % 5 * 2, y: 1 + Math.floor(i / 5) * 2 } }))
    window.effectsTest = { root: createRoot(host), React: React.default, Component: BattleEffectsCanvas, events, turn: 0 }
  })
  try {
    for (const width of [360, 390, 430]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true })
      await inBrowser(() => { const t = window.effectsTest; t.root.render(t.React.createElement(t.Component, { events: t.events, turn: ++t.turn, camera: { x: 0, y: 0 } })) })
      await waitFor("document.querySelector('#effects-test canvas')?.dataset.effects?.split(' ').length===20", '20種の同時エフェクトが開始しません。')
      assert.equal(await inBrowser(() => {
        const c = document.querySelector('#effects-test canvas')
        return c.getContext('2d').getImageData(0, 0, 440, 440).data.some((v, i) => i % 4 === 3 && v > 0)
          && getComputedStyle(c).pointerEvents === 'none' && c.getBoundingClientRect().right <= innerWidth
      }), true)
      if (width === 390) await captureScreen('combat-effects-20')
      await waitFor("document.querySelector('#effects-test canvas').dataset.effects===''", '同時エフェクトが終了しません。')
      assert.equal(await evaluate("document.querySelector('#effects-test canvas').getContext('2d').getImageData(0,0,440,440).data.every(v=>v===0)"), true)
    }
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await inBrowser(() => { const t = window.effectsTest; t.root.render(t.React.createElement(t.Component, { events: [t.events[11]], turn: ++t.turn, camera: { x: 0, y: 0 } })) })
    await waitFor("document.querySelector('#effects-test canvas').dataset.effects==='skill:guard'", 'reduced-motionで防御を表示できません。')
    await waitFor("document.querySelector('#effects-test canvas').dataset.effects===''", 'reduced-motionの演出が終了しません。')
    // 連続入力でも前のフレームを残さず、アンマウント時も描画とタイマーを終了する。
    await inBrowser(() => { const t = window.effectsTest; t.root.render(t.React.createElement(t.Component, { events: t.events, turn: ++t.turn, camera: { x: 0, y: 0 } })) })
    await waitFor("document.querySelector('#effects-test canvas').dataset.effects?.split(' ').length===20", '再発動が表示されません。')
    await inBrowser(() => { window.effectsTest.root.unmount(); document.querySelector('#effects-test').remove(); delete window.effectsTest })
    assert.equal(await evaluate("document.querySelectorAll('#effects-test canvas').length"), 0)
  } finally {
    await command('Emulation.setEmulatedMedia', { features: [] })
    await inBrowser(() => { if (window.effectsTest) { window.effectsTest.root.unmount(); delete window.effectsTest } document.querySelector('#effects-test')?.remove() })
  }
}
