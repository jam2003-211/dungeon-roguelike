import { useEffect, useState } from 'react'
import { DungeonMapCanvas } from '../components/DungeonMapCanvas'
import { Icon } from '../components/Icon'
import { AppShell, Panel } from '../components/Ui'
import { directionFromKey, type Direction, type ExplorationState } from '../game/exploration'
import { initialPlayerView as player } from '../data/presentation'

interface ExplorationScreenProps {
  exploration: ExplorationState
  menuOpen: boolean
  onMove: (direction: Direction) => void
  onMenuOpenChange: (open: boolean) => void
  onOpenStatus: () => void
  onOpenEquipment: () => void
  onReturn: () => void
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function ExplorationScreen({ exploration, menuOpen, onMove, onMenuOpenChange, onOpenStatus, onOpenEquipment, onReturn }: ExplorationScreenProps) {
  const [showDungeonInfo, setShowDungeonInfo] = useState(false)
  const [showReturnConfirmation, setShowReturnConfirmation] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (showReturnConfirmation) setShowReturnConfirmation(false)
        else if (showDungeonInfo) setShowDungeonInfo(false)
        else onMenuOpenChange(!menuOpen)
        return
      }
      if (menuOpen) return
      const direction = directionFromKey(event.key)
      if (direction !== null) {
        event.preventDefault()
        onMove(direction)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen, onMenuOpenChange, onMove, showDungeonInfo, showReturnConfirmation])

  const move = (direction: Direction) => {
    if (!menuOpen) onMove(direction)
  }

  return (
    <AppShell className="exploration-screen">
      <header className="exploration-hud panel">
        <div className="exploration-player"><span className="exploration-avatar"><Icon name="player" /></span><strong>Lv.{player.level} / {player.job}</strong><span>HP {player.hp}/{player.maxHp}</span></div>
        <div className="exploration-place"><strong>森 Lv.1</strong><span>1階 / ?階</span><em>テスト探索</em></div>
        <button type="button" className="menu-button" onClick={() => onMenuOpenChange(true)} aria-label="探索メニューを開く">メニュー</button>
      </header>

      <div className="turn-display" aria-live="polite">TURN <strong>{exploration.turn}</strong></div>
      <div className="map-frame"><DungeonMapCanvas player={exploration.position} /></div>

      <div className="exploration-controls">
        <div className="d-pad" aria-label="移動用十字キー">
          <button type="button" className="d-pad__up" onClick={() => move('up')} aria-label="上へ移動"><img src="/assets/arrows/arrow-up-32.png" alt="" /></button>
          <button type="button" className="d-pad__left" onClick={() => move('left')} aria-label="左へ移動"><img src="/assets/arrows/arrow-left-32.png" alt="" /></button>
          <span aria-hidden="true" />
          <button type="button" className="d-pad__right" onClick={() => move('right')} aria-label="右へ移動"><img src="/assets/arrows/arrow-right-32.png" alt="" /></button>
          <button type="button" className="d-pad__down" onClick={() => move('down')} aria-label="下へ移動"><img src="/assets/arrows/arrow-down-32.png" alt="" /></button>
        </div>
        <button type="button" className="attack-button" disabled aria-label="攻撃（未実装）"><Icon name="weapon" size="large" /><span>攻撃</span><small>未実装</small></button>
      </div>
      <div className="skill-bar" aria-label="スキル欄"><span>スキル未取得</span><button type="button" disabled>使用不可</button><button type="button" disabled>使用不可</button></div>

      {menuOpen && (
        <div className="modal-layer" role="presentation">
          <Panel className="exploration-menu" role="dialog" aria-modal="true" aria-labelledby="exploration-menu-title">
            <h2 id="exploration-menu-title">探索メニュー</h2>
            <button type="button" onClick={onOpenStatus}>ステータス確認</button>
            <button type="button" onClick={onOpenEquipment}>所持品確認</button>
            <button type="button" onClick={() => setShowDungeonInfo(true)}>ダンジョン情報</button>
            <button type="button" onClick={() => setShowReturnConfirmation(true)}>町へ帰還</button>
            <button type="button" onClick={() => onMenuOpenChange(false)}>閉じる</button>
          </Panel>
        </div>
      )}

      {showDungeonInfo && (
        <div className="modal-layer modal-layer--front" role="presentation">
          <Panel className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="dungeon-info-title">
            <h2 id="dungeon-info-title">ダンジョン情報</h2>
            <dl><div><dt>ダンジョン</dt><dd>森 Lv.1</dd></div><div><dt>階層</dt><dd>1階 / ?階</dd></div><div><dt>経過ターン</dt><dd>{exploration.turn}</dd></div><div><dt>探索種別</dt><dd>テスト探索</dd></div></dl>
            <button type="button" onClick={() => setShowDungeonInfo(false)}>探索メニューへ戻る</button>
          </Panel>
        </div>
      )}

      {showReturnConfirmation && (
        <div className="modal-layer modal-layer--front" role="presentation">
          <Panel className="dialog-panel" role="alertdialog" aria-modal="true" aria-labelledby="return-confirm-title">
            <h2 id="return-confirm-title">町へ帰還しますか？</h2>
            <p>テスト探索を終了し、探索結果を表示します。</p>
            <div className="dialog-actions"><button type="button" onClick={() => setShowReturnConfirmation(false)}>キャンセル</button><button type="button" onClick={onReturn}>帰還する</button></div>
          </Panel>
        </div>
      )}
    </AppShell>
  )
}
