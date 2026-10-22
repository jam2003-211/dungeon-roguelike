import { Icon } from '../components/Icon'
import { AppShell } from '../components/Ui'
import { getGameStartScreen } from '../navigation'
import type { SaveGameControls } from '../persistence/useSaveGame'

interface TitleScreenProps {
  saveControls: SaveGameControls
  onStart: () => void
  onSettings: () => void
}

export function TitleScreen({ onStart, onSettings, saveControls }: TitleScreenProps) {
  const handleStart = () => {
    if (getGameStartScreen() === 'town') onStart()
  }

  return (
    <AppShell className="title-screen">
      <div className="title-ornament" aria-hidden="true"><span>✦</span><i /><span>✦</span></div>
      <div className="title-emblem" aria-hidden="true"><Icon name="castle" size="large" /></div>
      <p className="title-kicker">TURN-BASED DUNGEON ADVENTURE</p>
      <h1 className="game-title">ローグライク<br /><span>RPG</span></h1>
      <p className="title-description">三つのダンジョンを巡る、縦画面専用の冒険</p>
      <div className="title-actions">
        {saveControls.resumeInfo && <p className="resume-info">{saveControls.resumeInfo}<br />{saveControls.metadata.savedAt && new Date(saveControls.metadata.savedAt).toLocaleString('ja-JP')}</p>}
        <button className="primary-button title-start" type="button" disabled={saveControls.checking || saveControls.busy} onClick={saveControls.resumeInfo ? saveControls.resume : handleStart}><Icon name="play" /> {saveControls.resumeInfo ? '探索を再開' : 'ゲーム開始'}</button>
        <button className="secondary-button" type="button" onClick={onSettings}><Icon name="settings" /> 設定</button>
      </div>
      <p className="version-label">PROTOTYPE · STAGE 2</p>
    </AppShell>
  )
}
