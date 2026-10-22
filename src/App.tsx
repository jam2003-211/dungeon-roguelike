import { SaveStatus } from './components/SaveStatus'
import { captureRun, restoreBattle } from './persistence/savedRun'
import { useSaveGame } from './persistence/useSaveGame'
import type { SaveData } from './persistence/saveData'
import { useCallback, useEffect, useState } from 'react'
import { attackWithWeapon, createBattleState, moveBattlePlayer, useSkill, type BattleState } from './game/battle'
import { createDungeon, createDungeonStocks, replaceDungeonStock, updateStockProgress, type DungeonStockId } from './game/dungeon'
import { advanceDungeonRun, startDungeonRun } from './game/dungeonRun'
import { createLootState, openLootChest, resolveEnemyLoot } from './game/loot'
import type { Direction } from './game/exploration'
import { isPassable } from './game/forestMap'
import { calculateStats, changeJob, createPlayerState, type EquipmentItem, type JobId, type PlayerState, type SkillId } from './game/player'
import { createInitialNavigation, getPreviousNavigation, navigate, readNavigationState, type NavigationState, type ScreenId } from './navigation'
import { DungeonScreen } from './screens/DungeonScreen'
import { EquipmentScreen } from './screens/EquipmentScreen'
import { ExplorationResultScreen } from './screens/ExplorationResultScreen'
import { ExplorationScreen } from './screens/ExplorationScreen'
import { JobsScreen } from './screens/JobsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { StatusScreen } from './screens/StatusScreen'
import { TitleScreen } from './screens/TitleScreen'
import { TownScreen } from './screens/TownScreen'

const initialNavigation = createInitialNavigation()
// 固定乱数は開発サーバーのE2E専用URLでのみ使用する。
const lootTest = import.meta.env.DEV && new URLSearchParams(window.location.search).get('lootTest') === '1'
const rewardRandom = () => lootTest ? .2 : Math.random()
function generationRandom(): () => number {
  if (!lootTest) return Math.random
  let seed = 42; let first = true
  return () => { if (first) { first = false; return .1 }; seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
}
type ResultKind = '任意帰還' | '探索失敗' | 'ダンジョンクリア'
interface ActiveRun { stockId: DungeonStockId; floor: number; startLevel: number }

function App() {
  const [navigation, setNavigation] = useState<NavigationState>(initialNavigation)
  const [player, setPlayer] = useState<PlayerState>(createPlayerState)
  const [stocks, setStocks] = useState(createDungeonStocks)
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null)
  const [exploration, setExploration] = useState<BattleState>(() => createBattleState(createPlayerState()))
  const [explorationMenuOpen, setExplorationMenuOpen] = useState(false)
  const [result, setResult] = useState({ turn: 0, experience: 0, floor: 1, startLevel: 1, endLevel: 1, kind: '任意帰還' as ResultKind, dungeonName: '', items: [] as EquipmentItem[] })
  const restoreSave = useCallback((data: SaveData, enterGame: boolean) => {
    setPlayer(data.player); setStocks(data.stocks)
    setActiveRun(enterGame && data.run ? { stockId: data.run.stockId, floor: data.run.floor, startLevel: data.run.startLevel } : null)
    setExploration(enterGame && data.run ? restoreBattle(data.player, data.run) : createBattleState(data.player)); setExplorationMenuOpen(false)
    if (enterGame) { const next: NavigationState = { current: data.run ? 'exploration' : 'town', previous: ['title'] }; window.history.replaceState(next, ''); setNavigation(next) }
  }, [])
  const savedRun = activeRun && !exploration.combat.finished ? captureRun(activeRun.stockId, activeRun.floor, exploration, activeRun.startLevel) : null
  const saveControls = useSaveGame(navigation.current === 'town', { player: activeRun ? exploration.player : player, stocks, run: savedRun }, restoreSave)
  const activeStock = activeRun ? stocks.find((stock) => stock.id === activeRun.stockId) ?? null : null
  const activeDungeon = activeStock?.dungeon ?? null
  const activeFloor = activeDungeon && activeRun ? activeDungeon.floors[activeRun.floor - 1] : null

  useEffect(() => {
    window.history.replaceState(initialNavigation, '')
    const handlePopState = (event: PopStateEvent) => {
      const restored = readNavigationState(event.state)
      if (restored === null) { const fallback = createInitialNavigation(); window.history.replaceState(fallback, ''); setNavigation(fallback); return }
      setNavigation(restored)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const openScreen = useCallback((screen: ScreenId) => {
    const next = navigate(navigation, screen); if (next === navigation) return
    window.history.pushState(next, ''); setNavigation(next)
  }, [navigation])
  const goBack = useCallback(() => { if (getPreviousNavigation(navigation) !== navigation) window.history.back() }, [navigation])

  const generateDungeon = useCallback((stockId: DungeonStockId, level: number): string | null => {
    const stock = stocks.find((candidate) => candidate.id === stockId)
    if (!stock || player.level < stock.unlockLevel) return 'このストックは未解放です。'
    try { const dungeon = createDungeon(level, stock.theme, generationRandom()); setStocks((current) => replaceDungeonStock(current, stockId, dungeon)); return null }
    catch (error) { return error instanceof Error ? error.message : 'ダンジョン生成に失敗しました。' }
  }, [player.level, stocks])

  const startExploration = useCallback((stockId: DungeonStockId) => {
    const stock = stocks.find((candidate) => candidate.id === stockId)
    if (!stock?.dungeon || player.level < stock.unlockLevel) return
    const run = startDungeonRun(player, stock.dungeon)
    setExploration({ ...run.battle, loot: createLootState(stock.dungeon, rewardRandom) })
    setActiveRun({ stockId, floor: run.currentFloor, startLevel: player.level }); setExplorationMenuOpen(false)
    setStocks((current) => updateStockProgress(current, stockId, 1, stock.dungeon!.totalFloors === 1))
    const next = navigate(navigation, 'exploration'); window.history.pushState(next, ''); setNavigation(next)
  }, [navigation, player, stocks])

  const applyBattleAction = useCallback((action: (battle: BattleState) => BattleState) => {
    if (activeDungeon) setExploration((current) => resolveEnemyLoot(current, action(current), activeDungeon, rewardRandom))
  }, [activeDungeon])
  const handleOpenChest = useCallback((x: number, y: number) => {
    if (activeRun && activeDungeon) setExploration((current) => openLootChest(current, activeRun.floor, { x, y }, activeDungeon, rewardRandom))
  }, [activeRun, activeDungeon])
  const handleMove = useCallback((direction: Direction) => { if (activeFloor) applyBattleAction((current) => moveBattlePlayer(current, direction, activeFloor.map)) }, [activeFloor, applyBattleAction])
  const handleAttack = useCallback((x: number, y: number) => { if (activeFloor) applyBattleAction((current) => attackWithWeapon(current, { x, y }, activeFloor.map)) }, [activeFloor, applyBattleAction])
  const handleSkill = useCallback((id: SkillId, x?: number, y?: number) => { if (activeFloor) applyBattleAction((current) => useSkill(current, id, x === undefined || y === undefined ? undefined : { x, y }, activeFloor.map)) }, [activeFloor, applyBattleAction])

  const showResult = useCallback((kind: ResultKind, cleared: boolean) => {
    if (!activeRun) return
    setPlayer(exploration.player); setActiveRun(null)
    setStocks((current) => updateStockProgress(current, activeRun.stockId, activeRun.floor, activeDungeon?.totalFloors === activeRun.floor, cleared))
    setResult({ turn: exploration.combat.turn, experience: exploration.experienceEarned, floor: activeRun.floor, startLevel: activeRun.startLevel, endLevel: exploration.player.level, kind, dungeonName: `${activeStock?.name} Lv.${activeDungeon?.level}`, items: exploration.loot?.items ?? [] })
    setExplorationMenuOpen(false)
    const next: NavigationState = { current: 'explorationResult', previous: navigation.previous }
    window.history.replaceState(next, ''); setNavigation(next)
  }, [activeDungeon?.totalFloors, activeRun, exploration, navigation.previous, player.level, activeStock?.name])

  useEffect(() => {
    if (navigation.current === 'exploration' && exploration.combat.finished) showResult('探索失敗', false)
  }, [exploration.combat.finished, navigation.current, showResult])

  const nextFloor = useCallback(() => {
    if (!activeRun || !activeDungeon || !activeFloor) return
    const advanced = advanceDungeonRun({ currentFloor: activeRun.floor, battle: exploration }, activeDungeon)
    if (advanced.cleared) { showResult('ダンジョンクリア', true); return }
    if (advanced.run.currentFloor === activeRun.floor) return
    setExploration(advanced.run.battle)
    setActiveRun({ ...activeRun, floor: advanced.run.currentFloor })
    setStocks((current) => updateStockProgress(current, activeRun.stockId, advanced.run.currentFloor, advanced.run.currentFloor === activeDungeon.totalFloors))
  }, [activeDungeon, activeFloor, activeRun, exploration, showResult])

  const updatePlayer = useCallback((next: PlayerState) => setPlayer(next), [])
  const updateJob = useCallback((job: JobId) => setPlayer((current) => changeJob(current, job)), [])
  const unlockJobsForTest = useCallback(() => setPlayer((current) => { const next = { ...current, level: 30, experience: 0 }; return { ...next, currentHp: calculateStats(next).maxHp } }), [])
  const viewingExplorationData = navigation.current === 'exploration' || navigation.previous.includes('exploration')
  const visiblePlayer = viewingExplorationData ? exploration.player : player
  useEffect(() => {
    if (activeRun && !viewingExplorationData && navigation.current !== 'explorationResult') { setPlayer(exploration.player); setActiveRun(null) }
  }, [activeRun, viewingExplorationData, navigation.current, exploration.player])
  const returnToTown = useCallback(() => { setActiveRun(null); const next: NavigationState = { current: 'town', previous: ['title'] }; window.history.replaceState(next, ''); setNavigation(next) }, [])

  const renderScreen = () => {
  switch (navigation.current) {
    case 'title': return <TitleScreen saveControls={saveControls} onStart={() => openScreen('town')} onSettings={() => openScreen('settings')} />
    case 'town': return <TownScreen saveControls={saveControls} player={player} onNavigate={openScreen} />
    case 'dungeon': return <DungeonScreen playerLevel={player.level} stocks={stocks} onBack={goBack} onGenerate={generateDungeon} onStart={startExploration} />
    case 'exploration':
      if (!activeRun || !activeStock || !activeDungeon || !activeFloor) return <TownScreen saveControls={saveControls} player={player} onNavigate={openScreen} />
      return <ExplorationScreen visualSeed={activeDungeon.visualSeed ?? 0} onOpenChest={handleOpenChest} onClearLootNotice={() => setExploration((current) => current.loot ? { ...current, loot: { ...current.loot, notices: current.loot.notices.slice(1) } } : current)} onTestApproachChest={() => setExploration((current) => {
        const chest = current.loot?.chests.find((candidate) => candidate.floor === activeRun.floor && !candidate.opened)
        if (!chest) return current
        const position = [{ x: chest.position.x, y: chest.position.y - 1 }, { x: chest.position.x - 1, y: chest.position.y }, { x: chest.position.x + 1, y: chest.position.y }, { x: chest.position.x, y: chest.position.y + 1 }].find((candidate) => isPassable(activeFloor.map, candidate))
        return position ? { ...current, combat: { ...current.combat, position } } : current
      })} battle={exploration} map={activeFloor.map} stairs={activeFloor.stairs} themeName={activeStock.name} dungeonLevel={activeDungeon.level} floor={activeRun.floor} totalFloors={activeDungeon.totalFloors} totalFloorsKnown={activeStock.totalFloorsKnown} menuOpen={explorationMenuOpen} onMove={handleMove} onAttack={handleAttack} onSkill={handleSkill} onNextFloor={nextFloor} onMenuOpenChange={setExplorationMenuOpen} onOpenStatus={() => openScreen('status')} onOpenEquipment={() => openScreen('equipment')} onReturn={() => showResult('任意帰還', false)} onClearNotice={() => setExploration((current) => ({ ...current, levelNotices: [] }))} onTestReachStairs={() => setExploration((current) => ({ ...current, combat: { ...current.combat, position: { ...activeFloor.stairs } } }))} onTestApproachEnemy={() => setExploration((current) => { const target = current.combat.enemies.find((enemy) => !enemy.isBoss) ?? current.combat.enemies[0]; if (!target) return current; const offsets = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]; const position = offsets.map((offset) => ({ x: target.position.x + offset.x, y: target.position.y + offset.y })).find((candidate) => isPassable(activeFloor.map, candidate) && !current.combat.enemies.some((enemy) => enemy.id !== target.id && enemy.position.x === candidate.x && enemy.position.y === candidate.y)); return position ? { ...current, combat: { ...current.combat, position } } : current })} onTestDefeatBoss={() => applyBattleAction((current) => {
        const boss = current.combat.enemies.find((enemy) => enemy.isBoss)
        if (!boss) return current
        // 開発用の撃破操作も通常攻撃と共通の経験値・ドロップ経路を通す。
        const position = [{ x: boss.position.x, y: boss.position.y - 1 }, { x: boss.position.x - 1, y: boss.position.y }, { x: boss.position.x + 1, y: boss.position.y }, { x: boss.position.x, y: boss.position.y + 1 }].find((candidate) => isPassable(activeFloor.map, candidate))
        if (!position) return current
        const prepared = { ...current, combat: { ...current.combat, position, enemies: current.combat.enemies.map((enemy) => enemy.id === boss.id ? { ...enemy, hp: 1 } : enemy) } }
        const attacked = attackWithWeapon(prepared, boss.position, activeFloor.map)
        return { ...attacked, combat: { ...attacked.combat, position: current.combat.position } }
      })} />
    case 'explorationResult': return <ExplorationResultScreen dungeonName={result.dungeonName} items={result.items} turn={result.turn} experience={result.experience} floor={result.floor} startLevel={result.startLevel} endLevel={result.endLevel} resultKind={result.kind} onTown={returnToTown} />
    case 'equipment': return <EquipmentScreen player={visiblePlayer} readOnly={viewingExplorationData} onChange={updatePlayer} onBack={goBack} />
    case 'status': return <StatusScreen player={visiblePlayer} onBack={goBack} onOpenEquipment={() => openScreen('equipment')} />
    case 'jobs': return <JobsScreen player={player} onChange={updateJob} onUnlockTest={unlockJobsForTest} onBack={goBack} />
    case 'settings': return <SettingsScreen onBack={goBack} />
  }
  }
  return <>{renderScreen()}<SaveStatus controls={saveControls} /></>
}

export default App
