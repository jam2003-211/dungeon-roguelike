import { useEffect, useRef, useState } from 'react'
import { assetUrl, enemyAssetPaths, enemyFallbackPaths, jobAssetPaths, weaponAssetPaths } from '../assets'
import { DungeonMapCanvas } from '../components/DungeonMapCanvas'
import { PixelAsset } from '../components/PixelAsset'
import { SkillIcon } from '../components/SkillIcon'
import { SpecialEffectIcon } from '../components/SpecialEffectIcon'
import { AppShell, Panel } from '../components/Ui'
import { getPlayerAttackCells, type BattleState } from '../game/battle'
import { cameraOrigin } from '../game/dungeonCamera'
import { combatVisuals, type CombatVisual } from '../game/combatVisuals'
import { ENEMY_DEFINITIONS, type EnemyState } from '../game/combat/combat'
import { directionFromKey, type Direction } from '../game/exploration'
import type { ForestMap, Position } from '../game/forestMap'
import type { DungeonTheme } from '../game/dungeon'
import { availableSkillLevel, availableSkills, calculateStats, JOBS, type SkillId } from '../game/player'
import { SKILLS } from '../game/skills'

interface Props { visualSeed: number; theme: DungeonTheme; onOpenChest: (x: number, y: number) => void; onClearLootNotice: () => void; onTestApproachChest?: () => void; battle: BattleState; map: ForestMap; stairs: Position; themeName: string; dungeonLevel: number; floor: number; totalFloors: number; totalFloorsKnown: boolean; menuOpen: boolean; onMove: (direction: Direction) => void; onAttack: () => void; onNextFloor: () => void; onMenuOpenChange: (open: boolean) => void; onOpenStatus: () => void; onOpenEquipment: () => void; onReturn: () => void; onClearNotice: () => void; onTestReachStairs?: () => void; onTestApproachEnemy?: () => void; onTestDefeatBoss?: () => void }
function isEditableTarget(target: EventTarget | null) { return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) }
function EnemyInfo({ enemy, onClose }: { enemy: EnemyState; onClose: () => void }) { const d = ENEMY_DEFINITIONS[enemy.kind]; const statuses = enemy.statuses ?? { poison: 0, burn: 0, slow: 0, stun: 0 }; const activeEffects = (['poison', 'burn', 'slow', 'stun'] as const).filter((effect) => statuses[effect] > 0); const active = activeEffects.map((effect) => `${effect}:${statuses[effect]}`).join(' '); return <div className="enemy-sheet" role="dialog" aria-modal="true" aria-labelledby="enemy-info-title"><button type="button" className="enemy-sheet__close" onClick={onClose} aria-label="敵情報を閉じる">×</button><PixelAsset src={enemyAssetPaths[enemy.kind]} fallbackSrc={enemyFallbackPaths[enemy.kind]} alt="" /><div><strong id="enemy-info-title">{d.name}{enemy.isBoss ? ' ボス' : ''}</strong><span>Lv.{enemy.level}　HP {enemy.hp} / {enemy.maxHp}</span><span>攻撃力 {enemy.attack}　{enemy.warning ? `準備中 残り${enemy.warning.remaining}` : enemy.discovered ? '追跡中' : '待機中'}</span>{active && <span className="enemy-status-line"><span className="enemy-status-icons">{activeEffects.map((effect) => <SpecialEffectIcon key={effect} effect={effect} />)}</span>{active}</span>}</div></div> }

export function ExplorationScreen({ visualSeed, theme, onOpenChest, onClearLootNotice, onTestApproachChest, battle, map, stairs, themeName, dungeonLevel, floor, totalFloors, totalFloorsKnown, menuOpen, onMove, onAttack, onNextFloor, onMenuOpenChange, onOpenStatus, onOpenEquipment, onReturn, onClearNotice, onTestReachStairs, onTestApproachEnemy, onTestDefeatBoss }: Props) {
  const [showDungeonInfo, setShowDungeonInfo] = useState(false); const [showReturnConfirmation, setShowReturnConfirmation] = useState(false); const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null)
  const [visuals, setVisuals] = useState<CombatVisual[]>([])
  const [highlightedSkill, setHighlightedSkill] = useState<SkillId | null>(null)
  const { combat, player } = battle; const stats = calculateStats(player); const selectedEnemy = combat.enemies.find((enemy) => enemy.id === selectedEnemyId) ?? null
  const skills = availableSkills(player)
  const camera = cameraOrigin(combat.position)
  const previousCombat = useRef({ floor, combat })
  const visualTimer = useRef<number | null>(null)
  const skillTimer = useRef<number | null>(null)
  useEffect(() => {
    const previous = previousCombat.current; previousCombat.current = { floor, combat }
    if (previous.floor !== floor) { if (visualTimer.current) window.clearTimeout(visualTimer.current); setVisuals([]); return }
    if (combat.turn <= previous.combat.turn) return
    const hits = combatVisuals(previous.combat, combat)
    if (visualTimer.current) window.clearTimeout(visualTimer.current)
    setVisuals(hits)
    if (hits.length) visualTimer.current = window.setTimeout(() => setVisuals([]), 480)
  }, [combat, floor])
  useEffect(() => () => { if (visualTimer.current) window.clearTimeout(visualTimer.current) }, [])
  useEffect(() => {
    if (skillTimer.current) window.clearTimeout(skillTimer.current)
    const id = battle.actionNotice?.turn === combat.turn ? battle.actionNotice.skillId : undefined
    if (!id) { setHighlightedSkill(null); return }
    setHighlightedSkill(id)
    skillTimer.current = window.setTimeout(() => setHighlightedSkill(null), 1100)
  }, [battle.actionNotice?.turn, battle.actionNotice?.skillId, combat.turn])
  useEffect(() => () => { if (skillTimer.current) window.clearTimeout(skillTimer.current) }, [])
  const clearLoot = useRef(onClearLootNotice); clearLoot.current = onClearLootNotice
  const clearLevel = useRef(onClearNotice); clearLevel.current = onClearNotice
  const chest = battle.loot?.chests.find((candidate) => candidate.floor === floor) ?? null
  const lootNotice = battle.loot?.notices[0]
  useEffect(() => { if (!lootNotice) return; const timer = window.setTimeout(() => clearLoot.current(), 2000); return () => window.clearTimeout(timer) }, [lootNotice?.id])
  const onStairs = combat.position.x === stairs.x && combat.position.y === stairs.y
  const bossAlive = combat.enemies.some((enemy) => enemy.isBoss)
  const targetCells = getPlayerAttackCells(player, combat.position, map)
  useEffect(() => { if (selectedEnemyId && !selectedEnemy) setSelectedEnemyId(null) }, [selectedEnemy, selectedEnemyId])
  useEffect(() => { if (battle.levelNotices.length === 0) return; const timer = window.setTimeout(() => clearLevel.current(), 1800); return () => window.clearTimeout(timer) }, [battle.levelNotices])
  useEffect(() => { const handler = (event: KeyboardEvent) => {
    if (event.repeat || isEditableTarget(event.target)) return
    if (event.key === 'Escape') { event.preventDefault(); if (showReturnConfirmation) setShowReturnConfirmation(false); else if (showDungeonInfo) setShowDungeonInfo(false); else if (selectedEnemy) setSelectedEnemyId(null); else onMenuOpenChange(!menuOpen); return }
    if (menuOpen || showDungeonInfo || showReturnConfirmation || selectedEnemy) return
    const direction = directionFromKey(event.key)
    if (direction) { event.preventDefault(); onMove(direction) }
    else if (event.code === 'Space') { event.preventDefault(); onAttack() }
  }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [menuOpen, onMenuOpenChange, onMove, onAttack, selectedEnemy, showDungeonInfo, showReturnConfirmation])
  const openMenu = () => { setSelectedEnemyId(null); onMenuOpenChange(true) }
  const handleCell = ({ x, y }: Position) => { if (menuOpen || showDungeonInfo || showReturnConfirmation || combat.finished) return; const enemy = combat.enemies.find((candidate) => candidate.position.x === x && candidate.position.y === y); if (enemy) setSelectedEnemyId(enemy.id) }
  const onChest = chest && !chest.opened && chest.position.x === combat.position.x && chest.position.y === combat.position.y
  return <AppShell className="exploration-screen">
    <header className="exploration-hud panel"><div className="exploration-player"><span className="exploration-avatar"><PixelAsset src={jobAssetPaths[player.job]} alt={`${JOBS[player.job].name}の姿`} /></span><strong>Lv.{player.level} / {JOBS[player.job].name}</strong><span>HP {player.currentHp}/{stats.maxHp}</span><span className="hud-hp-track"><i style={{ width: `${player.currentHp / stats.maxHp * 100}%` }} /></span></div><div className="exploration-place"><strong>{themeName} Lv.{dungeonLevel}</strong><span>{floor}階 / {totalFloorsKnown ? totalFloors : '？'}階</span><em>{floor === totalFloors ? '最終階' : '探索中'}</em></div><button type="button" className="menu-button" onClick={openMenu} aria-label="探索メニューを開く">メニュー</button></header>
    <div className="turn-display" aria-live="polite">TURN <strong>{combat.turn}</strong><span>ENEMY {combat.enemies.length}</span>{battle.actionNotice?.turn === combat.turn && <output className="action-notice">{battle.actionNotice.label}</output>}</div><div className="map-frame" style={{ backgroundImage: "linear-gradient(rgba(5, 6, 8, .2), rgba(5, 6, 8, .2)), url(" + assetUrl("assets/backgrounds/" + theme + ".png") + ")" }}><DungeonMapCanvas visualSeed={visualSeed} chest={chest} map={map} stairs={stairs} themeName={themeName} floor={floor} player={combat.position} playerJob={player.job} enemies={combat.enemies} targetCells={targetCells} selectedEnemyId={selectedEnemyId} onCellClick={handleCell} />{visuals.filter(({ position }) => position.x >= camera.x && position.x < camera.x + 11 && position.y >= camera.y && position.y < camera.y + 11).map((visual) => <span key={`${combat.turn}-${visual.id}`} className={`combat-hit combat-hit--${visual.kind}`} style={{ left: `${(visual.position.x - camera.x + .5) / 11 * 100}%`, top: `${(visual.position.y - camera.y + .5) / 11 * 100}%` }} aria-hidden="true"><i>✦</i><b>-{visual.damage}</b></span>)}</div>
    <div className="floor-actions">{onChest && <button type="button" className="next-floor-button open-chest-button" onClick={() => onOpenChest(chest!.position.x, chest!.position.y)}>開ける</button>}{onStairs && <button type="button" className="next-floor-button" disabled={floor === totalFloors && bossAlive} onClick={onNextFloor}>{floor === totalFloors ? bossAlive ? 'ボス撃破後に使用可能' : '階段を使ってクリア' : '次の階へ'}</button>}</div>
    <div className="exploration-controls"><div className="d-pad" aria-label="移動用十字キー">{(['up', 'left', 'right', 'down'] as Direction[]).map((direction) => <button key={direction} type="button" className={`d-pad__${direction}`} onClick={() => onMove(direction)} onContextMenu={(event) => event.preventDefault()} aria-label={`${direction === 'up' ? '上' : direction === 'down' ? '下' : direction === 'left' ? '左' : '右'}へ移動`}><img src={assetUrl(`assets/arrows/arrow-${direction}-32.png`)} alt="" /></button>)}<button type="button" className="attack-button" onClick={() => { setSelectedEnemyId(null); onAttack() }} onContextMenu={(event) => event.preventDefault()} aria-label="攻撃"><PixelAsset src={weaponAssetPaths.sword} className="icon icon--large" fallbackIcon="weapon" fallbackSize="large" alt="" /><span>攻撃</span></button></div><div className="auto-skill-panel" aria-label="自動スキル情報"><strong>スキル</strong><div className="auto-skill-grid">{skills.length ? skills.map((id) => <span key={id} className={`auto-skill-slot${highlightedSkill === id ? ' is-triggered' : ''}${(battle.cooldowns[id] ?? 0) > 0 ? ' is-cooling' : ''}`} data-auto-skill-id={id} role="img" aria-label={`${SKILLS[id].name} Lv.${availableSkillLevel(player, id)}${(battle.cooldowns[id] ?? 0) > 0 ? ` CD ${battle.cooldowns[id]}` : ' 使用可能'}`} title={`${SKILLS[id].name} Lv.${availableSkillLevel(player, id)}`}><SkillIcon skillId={id} />{(battle.cooldowns[id] ?? 0) > 0 && <small>{battle.cooldowns[id]}</small>}</span>) : <span className="auto-skill-empty">なし</span>}</div>{highlightedSkill && <output className="auto-skill-notice" role="status">{battle.actionNotice?.label}</output>}</div></div>
    {lootNotice && <div className="loot-toast" role="status">お宝 Lv.{lootNotice.level}を入手</div>}
    {battle.levelNotices.length > 0 && <div className="level-toast" role="status">Lv.{battle.levelNotices.at(-1)}に上がった！</div>}{selectedEnemy && <EnemyInfo enemy={selectedEnemy} onClose={() => setSelectedEnemyId(null)} />}
    {menuOpen && <div className="modal-layer"><Panel className="exploration-menu" role="dialog" aria-modal="true"><h2>探索メニュー</h2><button type="button" onClick={onOpenStatus}>ステータス確認</button><button type="button" onClick={onOpenEquipment}>所持品確認</button><button type="button" onClick={() => setShowDungeonInfo(true)}>ダンジョン情報</button><button type="button" onClick={() => setShowReturnConfirmation(true)}>町へ帰還</button><button type="button" onClick={() => onMenuOpenChange(false)}>閉じる</button></Panel></div>}
    {showDungeonInfo && <div className="modal-layer modal-layer--front"><Panel className="dialog-panel"><h2 id="dungeon-info-title">ダンジョン情報</h2><dl><div><dt>ダンジョン</dt><dd>{themeName} Lv.{dungeonLevel}</dd></div><div><dt>階層</dt><dd>{floor}階 / {totalFloorsKnown ? totalFloors : '？'}階</dd></div><div><dt>経過ターン</dt><dd>{combat.turn}</dd></div><div><dt>探索種別</dt><dd>通常探索</dd></div></dl>{import.meta.env.DEV && chest && onTestApproachChest && <button type="button" className="test-level-button" onClick={() => { onTestApproachChest(); setShowDungeonInfo(false); onMenuOpenChange(false) }}>開発テスト：宝箱へ接近</button>}{import.meta.env.DEV && onTestApproachEnemy && <button type="button" className="test-level-button" onClick={() => { onTestApproachEnemy(); setShowDungeonInfo(false); onMenuOpenChange(false) }}>開発テスト：敵へ接近</button>}{import.meta.env.DEV && onTestReachStairs && <button type="button" className="test-level-button" onClick={() => { onTestReachStairs(); setShowDungeonInfo(false); onMenuOpenChange(false) }}>開発テスト：階段へ移動</button>}{import.meta.env.DEV && floor === totalFloors && bossAlive && onTestDefeatBoss && <button type="button" className="test-level-button" onClick={onTestDefeatBoss}>開発テスト：ボス撃破</button>}<button type="button" onClick={() => setShowDungeonInfo(false)}>探索メニューへ戻る</button></Panel></div>}
    {showReturnConfirmation && <div className="modal-layer modal-layer--front"><Panel className="dialog-panel"><h2 id="return-confirm-title">町へ帰還しますか？</h2><p>帰還後も獲得した装備や育成状態は保持され、自動保存されます。</p><div className="dialog-actions"><button type="button" onClick={() => setShowReturnConfirmation(false)}>キャンセル</button><button type="button" onClick={onReturn}>帰還する</button></div></Panel></div>}
  </AppShell>
}
