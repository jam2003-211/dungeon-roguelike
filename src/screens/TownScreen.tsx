import { SaveLoadPanel } from '../components/SaveLoadPanel'
import type { SaveGameControls } from '../persistence/useSaveGame'
import { assetUrl, jobAssetPaths } from '../assets'
import { PixelAsset } from '../components/PixelAsset'
import { ActionButton, AppShell, Panel } from '../components/Ui'
import { JOBS, calculateStats, type PlayerState } from '../game/player'
import type { ScreenId } from '../navigation'

export function TownScreen({ player, onNavigate, saveControls }: { saveControls: SaveGameControls; player: PlayerState; onNavigate: (screen: ScreenId) => void }) {
  const stats = calculateStats(player)
  return <AppShell className="town-screen" style={{ backgroundImage: `url(${assetUrl('assets/backgrounds/town.png')})` }}>
    <header className="town-header"><div><h1>町メニュー</h1></div><div className="level-chip"><small>PLAYER</small><strong>Lv.{player.level}</strong></div></header>
    <Panel className="player-summary"><div className="avatar"><PixelAsset src={jobAssetPaths[player.job]} alt={`${JOBS[player.job].name}の姿`} /></div><div><strong>見習い冒険者</strong><span>{JOBS[player.job].name}</span></div><div className="hp-summary"><small>HP</small><strong>{player.currentHp} / {stats.maxHp}</strong></div></Panel>
    <nav className="town-menu" aria-label="町の施設"><ActionButton icon="dungeon" label="ダンジョン" detail="3つのストックを確認" onClick={() => onNavigate('dungeon')} /><ActionButton icon="bag" label="鑑定" detail={`${player.treasures.length}個のお宝`} onClick={() => onNavigate('appraisal')} /><ActionButton icon="equipment" label="装備・所持品" detail="装備変更と所持品管理" onClick={() => onNavigate('equipment')} /><ActionButton icon="status" label="ステータス" detail="能力値とスキルを確認" onClick={() => onNavigate('status')} /><ActionButton icon="jobs" label="職業変更" detail="町で職業を変更" onClick={() => onNavigate('jobs')} /><ActionButton icon="settings" label="設定" detail="音量を一時的に調整" onClick={() => onNavigate('settings')} /><ActionButton icon="save" label="セーブ・ロード" detail={saveControls.checking ? '保存情報を確認中' : saveControls.error ? '保存情報の確認が必要です' : saveControls.metadata.exists ? 'セーブデータあり' : 'セーブデータなし'} onClick={saveControls.open} /><ActionButton icon="return" label="タイトルへ戻る" detail="タイトル画面を表示" onClick={() => onNavigate('title')} /></nav>
    {saveControls.opened && <SaveLoadPanel controls={saveControls} />}
    <p className="town-save-info">自動保存 有効 / 最終保存：{saveControls.metadata.savedAt ? new Date(saveControls.metadata.savedAt).toLocaleString('ja-JP') : '未保存'}</p>
  </AppShell>
}
