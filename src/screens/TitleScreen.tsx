import { Icon } from '../components/Icon'
import { AppShell, Panel } from '../components/Ui'
import { useState } from 'react'
import { getGameStartScreen } from '../navigation'
import type { SaveGameControls } from '../persistence/useSaveGame'

interface TitleScreenProps {
  saveControls: SaveGameControls
  onStart: () => void
}

export function TitleScreen({ onStart, saveControls }: TitleScreenProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const handleStart = () => {
    if (getGameStartScreen() === 'town') onStart()
  }

  return (
    <AppShell className="title-screen">
      <div className="title-emblem" aria-hidden="true"><Icon name="castle" size="large" /></div>
      <h1 className="game-title">ダンジョン<br />ローグライク</h1>
      <div className="title-actions">
        {saveControls.resumeInfo && <p className="resume-info">{saveControls.resumeInfo}<br />{saveControls.metadata.savedAt && new Date(saveControls.metadata.savedAt).toLocaleString('ja-JP')}</p>}
        <button className="primary-button title-start" type="button" disabled={saveControls.checking || saveControls.busy} onClick={saveControls.resumeInfo ? saveControls.resume : handleStart}><Icon name="play" /> {saveControls.resumeInfo ? '探索を再開' : 'ゲーム開始'}</button>
        {saveControls.metadata.exists && <button type="button" className="title-delete" disabled={saveControls.checking || saveControls.busy} onClick={() => setConfirmDelete(true)}>データ削除</button>}
        {!saveControls.error && saveControls.message && <p role="status">{saveControls.message}</p>}
      </div>
      {confirmDelete && <div className="modal-layer"><Panel className="dialog-panel" role="alertdialog" aria-modal="true" aria-labelledby="delete-save-title"><h2 id="delete-save-title">データを削除しますか？</h2><p>町と探索中のセーブデータを削除します。この操作は取り消せません。</p><div className="dialog-actions"><button type="button" disabled={saveControls.busy} onClick={() => { setConfirmDelete(false); void saveControls.remove() }}>削除する</button><button type="button" disabled={saveControls.busy} onClick={() => setConfirmDelete(false)}>キャンセル</button></div></Panel></div>}
    </AppShell>
  )
}
