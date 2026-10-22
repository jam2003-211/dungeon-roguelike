import { useEffect, useState } from 'react'
import { DungeonMapCanvas } from '../components/DungeonMapCanvas'
import { Icon } from '../components/Icon'
import { AppShell, Panel } from '../components/Ui'
import { ENEMY_DEFINITIONS, isPlayerAttackCell, type CombatState, type EnemyState } from '../game/combat/combat'
import { directionFromKey, type Direction } from '../game/exploration'

interface ExplorationScreenProps {
  exploration: CombatState
  menuOpen: boolean
  onMove: (direction: Direction) => void
  onAttack: (x: number, y: number) => void
  onMenuOpenChange: (open: boolean) => void
  onOpenStatus: () => void
  onOpenEquipment: () => void
  onReturn: () => void
}

function isEditableTarget(target: EventTarget | null): boolean { return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) }

function EnemyInfo({ enemy, onClose }: { enemy: EnemyState; onClose: () => void }) {
  const definition = ENEMY_DEFINITIONS[enemy.kind]
  return <div className="enemy-sheet" role="dialog" aria-modal="true" aria-labelledby="enemy-info-title"><button type="button" className="enemy-sheet__close" onClick={onClose} aria-label="敵情報を閉じる">×</button><img src={definition.sprite} alt="" /><div><strong id="enemy-info-title">{definition.name}{enemy.isBoss ? ' ボス' : ''}</strong><span>Lv.{enemy.level}　HP {enemy.hp} / {enemy.maxHp}</span><span>攻撃力 {enemy.attack}　{enemy.warning ? `準備中 残り${enemy.warning.remaining}` : enemy.discovered ? '追跡中' : '待機中'}</span></div></div>
}

export function ExplorationScreen({ exploration, menuOpen, onMove, onAttack, onMenuOpenChange, onOpenStatus, onOpenEquipment, onReturn }: ExplorationScreenProps) {
  const [showDungeonInfo, setShowDungeonInfo] = useState(false); const [showReturnConfirmation, setShowReturnConfirmation] = useState(false)
  const [attackMode, setAttackMode] = useState(false); const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null)
  const selectedEnemy = exploration.enemies.find((enemy) => enemy.id === selectedEnemyId) ?? null
  useEffect(() => { if (selectedEnemyId && !selectedEnemy) setSelectedEnemyId(null) }, [selectedEnemy, selectedEnemyId])
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || isEditableTarget(event.target)) return
      if (event.key === 'Escape') { event.preventDefault(); if (showReturnConfirmation) setShowReturnConfirmation(false); else if (showDungeonInfo) setShowDungeonInfo(false); else if (selectedEnemy) setSelectedEnemyId(null); else if (attackMode) setAttackMode(false); else onMenuOpenChange(!menuOpen); return }
      if (menuOpen || showDungeonInfo || showReturnConfirmation || selectedEnemy) return
      const direction = directionFromKey(event.key); if (direction !== null) { event.preventDefault(); setAttackMode(false); onMove(direction) }
    }
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown)
  }, [attackMode, menuOpen, onMenuOpenChange, onMove, selectedEnemy, showDungeonInfo, showReturnConfirmation])
  const openMenu = () => { setAttackMode(false); setSelectedEnemyId(null); onMenuOpenChange(true) }
  const handleCellClick = ({ x, y }: { x: number; y: number }) => {
    if (menuOpen || showDungeonInfo || showReturnConfirmation || exploration.finished) return
    if (attackMode) { if (!isPlayerAttackCell(exploration.position, { x, y })) return; onAttack(x, y); setAttackMode(false); setSelectedEnemyId(null); return }
    const enemy = exploration.enemies.find((candidate) => candidate.position.x === x && candidate.position.y === y); if (enemy) setSelectedEnemyId(enemy.id)
  }
  return <AppShell className="exploration-screen">
    <header className="exploration-hud panel"><div className="exploration-player"><span className="exploration-avatar"><Icon name="player" /></span><strong>Lv.1 / 無職</strong><span>HP {exploration.playerHp}/{exploration.playerMaxHp}</span><span className="hud-hp-track"><i style={{ width: `${exploration.playerHp}%` }} /></span></div><div className="exploration-place"><strong>森 Lv.1</strong><span>1階 / ?階</span><em>戦闘テスト</em></div><button type="button" className="menu-button" onClick={openMenu} aria-label="探索メニューを開く">メニュー</button></header>
    <div className="turn-display" aria-live="polite">TURN <strong>{exploration.turn}</strong><span>ENEMY {exploration.enemies.length}</span></div>
    <div className="map-frame"><DungeonMapCanvas player={exploration.position} enemies={exploration.enemies} attackMode={attackMode} selectedEnemyId={selectedEnemyId} onCellClick={handleCellClick} /></div>
    <div className="exploration-controls"><div className="d-pad" aria-label="移動用十字キー"><button type="button" className="d-pad__up" onClick={() => { setAttackMode(false); onMove('up') }} aria-label="上へ移動"><img src="/assets/arrows/arrow-up-32.png" alt="" /></button><button type="button" className="d-pad__left" onClick={() => { setAttackMode(false); onMove('left') }} aria-label="左へ移動"><img src="/assets/arrows/arrow-left-32.png" alt="" /></button><span aria-hidden="true" /><button type="button" className="d-pad__right" onClick={() => { setAttackMode(false); onMove('right') }} aria-label="右へ移動"><img src="/assets/arrows/arrow-right-32.png" alt="" /></button><button type="button" className="d-pad__down" onClick={() => { setAttackMode(false); onMove('down') }} aria-label="下へ移動"><img src="/assets/arrows/arrow-down-32.png" alt="" /></button></div><button type="button" className={`attack-button${attackMode ? ' is-active' : ''}`} aria-pressed={attackMode} onClick={() => { setSelectedEnemyId(null); setAttackMode((active) => !active) }}><Icon name="weapon" size="large" /><span>攻撃</span><small>{attackMode ? '対象を選択' : '通常攻撃'}</small></button></div>
    <div className="skill-bar" aria-label="スキル欄"><span>スキル未取得</span><button type="button" disabled>使用不可</button><button type="button" disabled>使用不可</button></div>
    {selectedEnemy && <EnemyInfo enemy={selectedEnemy} onClose={() => setSelectedEnemyId(null)} />}
    {menuOpen && <div className="modal-layer" role="presentation"><Panel className="exploration-menu" role="dialog" aria-modal="true" aria-labelledby="exploration-menu-title"><h2 id="exploration-menu-title">探索メニュー</h2><button type="button" onClick={onOpenStatus}>ステータス確認</button><button type="button" onClick={onOpenEquipment}>所持品確認</button><button type="button" onClick={() => setShowDungeonInfo(true)}>ダンジョン情報</button><button type="button" onClick={() => setShowReturnConfirmation(true)}>町へ帰還</button><button type="button" onClick={() => onMenuOpenChange(false)}>閉じる</button></Panel></div>}
    {showDungeonInfo && <div className="modal-layer modal-layer--front" role="presentation"><Panel className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="dungeon-info-title"><h2 id="dungeon-info-title">ダンジョン情報</h2><dl><div><dt>ダンジョン</dt><dd>森 Lv.1</dd></div><div><dt>階層</dt><dd>1階 / ?階</dd></div><div><dt>経過ターン</dt><dd>{exploration.turn}</dd></div><div><dt>探索種別</dt><dd>戦闘テスト</dd></div></dl><button type="button" onClick={() => setShowDungeonInfo(false)}>探索メニューへ戻る</button></Panel></div>}
    {showReturnConfirmation && <div className="modal-layer modal-layer--front" role="presentation"><Panel className="dialog-panel" role="alertdialog" aria-modal="true" aria-labelledby="return-confirm-title"><h2 id="return-confirm-title">町へ帰還しますか？</h2><p>テスト探索を終了し、探索結果を表示します。</p><div className="dialog-actions"><button type="button" onClick={() => setShowReturnConfirmation(false)}>キャンセル</button><button type="button" onClick={onReturn}>帰還する</button></div></Panel></div>}
  </AppShell>
}
