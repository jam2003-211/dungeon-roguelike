import { Icon } from '../components/Icon'
import { ActionButton, AppShell, Panel } from '../components/Ui'
import type { ScreenId } from '../navigation'

export function TownScreen({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  return (
    <AppShell className="town-screen">
      <header className="town-header">
        <div><p className="eyebrow">ADVENTURE BASE</p><h1>町メニュー</h1><p>冒険の準備を整えましょう</p></div>
        <div className="level-chip"><small>PLAYER</small><strong>Lv.1</strong></div>
      </header>
      <Panel className="player-summary">
        <div className="avatar"><Icon name="wanderer" size="large" /></div>
        <div><strong>見習い冒険者</strong><span>無職</span></div>
        <div className="hp-summary"><small>HP</small><strong>100 / 100</strong></div>
      </Panel>
      <nav className="town-menu" aria-label="町の施設">
        <ActionButton icon="dungeon" label="ダンジョン" detail="3つのストックを確認" onClick={() => onNavigate('dungeon')} />
        <ActionButton icon="equipment" label="装備・所持品" detail="装備枠と所持品を確認" onClick={() => onNavigate('equipment')} />
        <ActionButton icon="status" label="ステータス" detail="能力値と装備情報を確認" onClick={() => onNavigate('status')} />
        <ActionButton icon="jobs" label="職業変更" detail="職業の特徴と解放条件" onClick={() => onNavigate('jobs')} />
        <ActionButton icon="settings" label="設定" detail="音量を一時的に調整" onClick={() => onNavigate('settings')} />
        <ActionButton icon="save" label="セーブ" detail="今後実装予定・現在は保存されません" disabled />
        <ActionButton icon="back" label="タイトルへ戻る" detail="タイトル画面を表示" onClick={() => onNavigate('title')} />
      </nav>
    </AppShell>
  )
}
