import { useRegisterSW } from 'virtual:pwa-register/react'
import { useRef, useState } from 'react'
import { canApplyUpdate } from '../pwa/updateSafety'
import type { SaveGameControls } from '../persistence/useSaveGame'

export function PwaUpdate({ atRest, controls }: { atRest: boolean; controls: SaveGameControls }) {
  const allowed = canApplyUpdate(atRest, controls.saving, controls.busy, controls.checking, controls.error)
  const safe = useRef(allowed); safe.current = allowed
  const accepted = useRef(false)
  const [error, setError] = useState(false)
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    immediate: true,
    // 別ウィンドウが先にSWを切り替えた場合も、この画面を勝手に再読み込みしない。
    onNeedReload() { if (accepted.current && safe.current) window.location.reload() },
    onRegisterError() { setError(true) },
    onRegisteredSW(_url, registration) {
      // 再表示時にも更新を確認する。オフライン時の失敗は次回に任せる。
      window.addEventListener('focus', () => { if (navigator.onLine) void registration?.update().catch(() => undefined) })
    },
  })
  if (error) return <aside className="pwa-update" role="alert">オフライン用データを準備できませんでした。通信状態を確認して、町で保存後に再読み込みしてください。</aside>
  if (!needRefresh) return null
  return <aside className="pwa-update" role="status">
    <span>新しいバージョンがあります。{!allowed && '町に戻り、保存完了後に更新できます。'}</span>
    <button type="button" disabled={!allowed} onClick={async () => {
      if (!safe.current) return
      accepted.current = true
      const registration = await navigator.serviceWorker.getRegistration()
      if (!safe.current) { accepted.current = false; return }
      if (registration?.waiting) await updateServiceWorker(true)
      else window.location.reload()
    }}>更新する</button>
  </aside>
}
