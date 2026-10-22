import { Icon } from '../components/Icon'
import { AppShell } from '../components/Ui'
import { getGameStartScreen } from '../navigation'
import type { SaveGameControls } from '../persistence/useSaveGame'

interface TitleScreenProps {
  saveControls: SaveGameControls
  onStart: () => void
}

export function TitleScreen({ onStart, saveControls }: TitleScreenProps) {
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
      </div>
    </AppShell>
  )
}
