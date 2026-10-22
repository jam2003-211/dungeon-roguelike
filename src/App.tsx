import { useCallback, useEffect, useState } from 'react'
import { createInitialNavigation, getPreviousNavigation, navigate, readNavigationState, type NavigationState, type ScreenId } from './navigation'
import { createTestEnemies } from './game/combat/combat'
import { attackWithWeapon, createBattleState, moveBattlePlayer, useSkill, type BattleState } from './game/battle'
import type { Direction } from './game/exploration'
import { calculateStats, changeJob, createPlayerState, type JobId, type PlayerState, type SkillId } from './game/player'
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

function App() {
  const [navigation, setNavigation] = useState<NavigationState>(initialNavigation)
  const [player, setPlayer] = useState<PlayerState>(createPlayerState)
  const [exploration, setExploration] = useState<BattleState>(() => createBattleState(createPlayerState(), createTestEnemies()))
  const [explorationMenuOpen, setExplorationMenuOpen] = useState(false)
  const [resultTurn, setResultTurn] = useState(0)
  const [resultExperience, setResultExperience] = useState(0)
  const [resultKind, setResultKind] = useState<'任意帰還' | '探索失敗'>('任意帰還')

  useEffect(() => {
    window.history.replaceState(initialNavigation, '')

    const handlePopState = (event: PopStateEvent) => {
      const restored = readNavigationState(event.state)
      if (restored === null) {
        const fallback = createInitialNavigation()
        window.history.replaceState(fallback, '')
        setNavigation(fallback)
        return
      }
      setNavigation(restored)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const openScreen = useCallback((screen: ScreenId) => {
    const next = navigate(navigation, screen)
    if (next === navigation) return
    window.history.pushState(next, '')
    setNavigation(next)
  }, [navigation])

  const goBack = useCallback(() => {
    if (getPreviousNavigation(navigation) !== navigation) window.history.back()
  }, [navigation])

  const startTestExploration = useCallback(() => {
    setExploration(createBattleState(player, createTestEnemies()))
    setExplorationMenuOpen(false)
    const next = navigate(navigation, 'exploration')
    window.history.pushState(next, '')
    setNavigation(next)
  }, [navigation, player])

  const handleMove = useCallback((direction: Direction) => {
    setExploration((current) => moveBattlePlayer(current, direction))
  }, [])

  const handleAttack = useCallback((x: number, y: number) => {
    setExploration((current) => attackWithWeapon(current, { x, y }))
  }, [])

  const handleSkill = useCallback((id: SkillId, x?: number, y?: number) => { setExploration((current) => useSkill(current, id, x === undefined || y === undefined ? undefined : { x, y })) }, [])

  useEffect(() => {
    if (navigation.current !== 'exploration' || !exploration.combat.finished) return
    setPlayer(exploration.player)
    setResultTurn(exploration.combat.turn)
    setResultExperience(exploration.experienceEarned)
    setResultKind('探索失敗')
    setExplorationMenuOpen(false)
    const next: NavigationState = { current: 'explorationResult', previous: navigation.previous }
    window.history.replaceState(next, '')
    setNavigation(next)
  }, [exploration, navigation.current, navigation.previous])

  const finishExploration = useCallback(() => {
    setPlayer(exploration.player)
    setResultTurn(exploration.combat.turn)
    setResultExperience(exploration.experienceEarned)
    setResultKind('任意帰還')
    setExplorationMenuOpen(false)
    const next: NavigationState = { current: 'explorationResult', previous: navigation.previous }
    window.history.replaceState(next, '')
    setNavigation(next)
  }, [exploration, navigation.previous])

  const updatePlayer = useCallback((next: PlayerState) => setPlayer(next), [])
  const updateJob = useCallback((job: JobId) => setPlayer((current) => changeJob(current, job)), [])
  const unlockJobsForTest = useCallback(() => setPlayer((current) => { const next = { ...current, level: 30, experience: 0 }; return { ...next, currentHp: calculateStats(next).maxHp } }), [])
  const viewingExplorationData = navigation.current === 'exploration' || navigation.previous.includes('exploration')
  const visiblePlayer = viewingExplorationData ? exploration.player : player

  const returnToTown = useCallback(() => {
    const next: NavigationState = { current: 'town', previous: ['title'] }
    window.history.replaceState(next, '')
    setNavigation(next)
  }, [])

  switch (navigation.current) {
    case 'title':
      return <TitleScreen onStart={() => openScreen('town')} onSettings={() => openScreen('settings')} />
    case 'town':
      return <TownScreen player={player} onNavigate={openScreen} />
    case 'dungeon':
      return <DungeonScreen onBack={goBack} onStartTest={startTestExploration} />
    case 'exploration':
      return <ExplorationScreen battle={exploration} menuOpen={explorationMenuOpen} onMove={handleMove} onAttack={handleAttack} onSkill={handleSkill} onMenuOpenChange={setExplorationMenuOpen} onOpenStatus={() => openScreen('status')} onOpenEquipment={() => openScreen('equipment')} onReturn={finishExploration} onClearNotice={() => setExploration((current) => ({ ...current, levelNotices: [] }))} />
    case 'explorationResult':
      return <ExplorationResultScreen turn={resultTurn} experience={resultExperience} resultKind={resultKind} onTown={returnToTown} />
    case 'equipment':
      return <EquipmentScreen player={visiblePlayer} readOnly={viewingExplorationData} onChange={updatePlayer} onBack={goBack} />
    case 'status':
      return <StatusScreen player={visiblePlayer} onBack={goBack} onOpenEquipment={() => openScreen('equipment')} />
    case 'jobs':
      return <JobsScreen player={player} onChange={updateJob} onUnlockTest={unlockJobsForTest} onBack={goBack} />
    case 'settings':
      return <SettingsScreen onBack={goBack} />
  }
}

export default App
