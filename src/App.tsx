import { useCallback, useEffect, useState } from 'react'
import { attackWithWeapon, createBattleState, moveBattlePlayer, useSkill, type BattleState } from './game/battle'
import { createDungeon, createDungeonStocks, replaceDungeonStock, updateStockProgress, type DungeonStockId } from './game/dungeon'
import { advanceDungeonRun, startDungeonRun } from './game/dungeonRun'
import type { Direction } from './game/exploration'
import { isPassable } from './game/forestMap'
import { calculateStats, changeJob, createPlayerState, type JobId, type PlayerState, type SkillId } from './game/player'
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
type ResultKind = '任意帰還' | '探索失敗' | 'ダンジョンクリア'
interface ActiveRun { stockId: DungeonStockId; floor: number }

function App() {
  const [navigation, setNavigation] = useState<NavigationState>(initialNavigation)
  const [player, setPlayer] = useState<PlayerState>(createPlayerState)
  const [stocks, setStocks] = useState(createDungeonStocks)
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null)
  const [exploration, setExploration] = useState<BattleState>(() => createBattleState(createPlayerState()))
  const [explorationMenuOpen, setExplorationMenuOpen] = useState(false)
  const [result, setResult] = useState({ turn: 0, experience: 0, floor: 1, startLevel: 1, endLevel: 1, kind: '任意帰還' as ResultKind })
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
    try { const dungeon = createDungeon(level, stock.theme); setStocks((current) => replaceDungeonStock(current, stockId, dungeon)); return null }
    catch (error) { return error instanceof Error ? error.message : 'ダンジョン生成に失敗しました。' }
  }, [player.level, stocks])

  const startExploration = useCallback((stockId: DungeonStockId) => {
    const stock = stocks.find((candidate) => candidate.id === stockId)
    if (!stock?.dungeon || player.level < stock.unlockLevel) return
    const run = startDungeonRun(player, stock.dungeon)
    setExploration(run.battle)
    setActiveRun({ stockId, floor: run.currentFloor }); setExplorationMenuOpen(false)
    setStocks((current) => updateStockProgress(current, stockId, 1, stock.dungeon!.totalFloors === 1))
    const next = navigate(navigation, 'exploration'); window.history.pushState(next, ''); setNavigation(next)
  }, [navigation, player, stocks])

  const handleMove = useCallback((direction: Direction) => { if (activeFloor) setExploration((current) => moveBattlePlayer(current, direction, activeFloor.map)) }, [activeFloor])
  const handleAttack = useCallback((x: number, y: number) => { if (activeFloor) setExploration((current) => attackWithWeapon(current, { x, y }, activeFloor.map)) }, [activeFloor])
  const handleSkill = useCallback((id: SkillId, x?: number, y?: number) => { if (activeFloor) setExploration((current) => useSkill(current, id, x === undefined || y === undefined ? undefined : { x, y }, activeFloor.map)) }, [activeFloor])

  const showResult = useCallback((kind: ResultKind, cleared: boolean) => {
    if (!activeRun) return
    setPlayer(exploration.player)
    setStocks((current) => updateStockProgress(current, activeRun.stockId, activeRun.floor, activeDungeon?.totalFloors === activeRun.floor, cleared))
    setResult({ turn: exploration.combat.turn, experience: exploration.experienceEarned, floor: activeRun.floor, startLevel: player.level, endLevel: exploration.player.level, kind })
    setExplorationMenuOpen(false)
    const next: NavigationState = { current: 'explorationResult', previous: navigation.previous }
    window.history.replaceState(next, ''); setNavigation(next)
  }, [activeDungeon?.totalFloors, activeRun, exploration, navigation.previous, player.level])

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
  const returnToTown = useCallback(() => { setActiveRun(null); const next: NavigationState = { current: 'town', previous: ['title'] }; window.history.replaceState(next, ''); setNavigation(next) }, [])

  switch (navigation.current) {
    case 'title': return <TitleScreen onStart={() => openScreen('town')} onSettings={() => openScreen('settings')} />
    case 'town': return <TownScreen player={player} onNavigate={openScreen} />
    case 'dungeon': return <DungeonScreen playerLevel={player.level} stocks={stocks} onBack={goBack} onGenerate={generateDungeon} onStart={startExploration} />
    case 'exploration':
      if (!activeRun || !activeStock || !activeDungeon || !activeFloor) return <TownScreen player={player} onNavigate={openScreen} />
      return <ExplorationScreen battle={exploration} map={activeFloor.map} stairs={activeFloor.stairs} themeName={activeStock.name} dungeonLevel={activeDungeon.level} floor={activeRun.floor} totalFloors={activeDungeon.totalFloors} totalFloorsKnown={activeStock.totalFloorsKnown} menuOpen={explorationMenuOpen} onMove={handleMove} onAttack={handleAttack} onSkill={handleSkill} onNextFloor={nextFloor} onMenuOpenChange={setExplorationMenuOpen} onOpenStatus={() => openScreen('status')} onOpenEquipment={() => openScreen('equipment')} onReturn={() => showResult('任意帰還', false)} onClearNotice={() => setExploration((current) => ({ ...current, levelNotices: [] }))} onTestReachStairs={() => setExploration((current) => ({ ...current, combat: { ...current.combat, position: { ...activeFloor.stairs } } }))} onTestApproachEnemy={() => setExploration((current) => { const target = current.combat.enemies.find((enemy) => !enemy.isBoss) ?? current.combat.enemies[0]; if (!target) return current; const offsets = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]; const position = offsets.map((offset) => ({ x: target.position.x + offset.x, y: target.position.y + offset.y })).find((candidate) => isPassable(activeFloor.map, candidate) && !current.combat.enemies.some((enemy) => enemy.id !== target.id && enemy.position.x === candidate.x && enemy.position.y === candidate.y)); return position ? { ...current, combat: { ...current.combat, position } } : current })} onTestDefeatBoss={() => setExploration((current) => ({ ...current, combat: { ...current.combat, enemies: current.combat.enemies.filter((enemy) => !enemy.isBoss) } }))} />
    case 'explorationResult': return <ExplorationResultScreen turn={result.turn} experience={result.experience} floor={result.floor} startLevel={result.startLevel} endLevel={result.endLevel} resultKind={result.kind} onTown={returnToTown} />
    case 'equipment': return <EquipmentScreen player={visiblePlayer} readOnly={viewingExplorationData} onChange={updatePlayer} onBack={goBack} />
    case 'status': return <StatusScreen player={visiblePlayer} onBack={goBack} onOpenEquipment={() => openScreen('equipment')} />
    case 'jobs': return <JobsScreen player={player} onChange={updateJob} onUnlockTest={unlockJobsForTest} onBack={goBack} />
    case 'settings': return <SettingsScreen onBack={goBack} />
  }
}

export default App
