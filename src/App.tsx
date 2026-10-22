import { useCallback, useEffect, useState } from 'react'
import { createInitialNavigation, getPreviousNavigation, navigate, readNavigationState, type NavigationState, type ScreenId } from './navigation'
import { attackCell, createCombatState, moveCombatPlayer, type CombatState } from './game/combat/combat'
import type { Direction } from './game/exploration'
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
  const [exploration, setExploration] = useState<CombatState>(createCombatState)
  const [explorationMenuOpen, setExplorationMenuOpen] = useState(false)
  const [resultTurn, setResultTurn] = useState(0)
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
    setExploration(createCombatState())
    setExplorationMenuOpen(false)
    const next = navigate(navigation, 'exploration')
    window.history.pushState(next, '')
    setNavigation(next)
  }, [navigation])

  const handleMove = useCallback((direction: Direction) => {
    setExploration((current) => moveCombatPlayer(current, direction))
  }, [])

  const handleAttack = useCallback((x: number, y: number) => {
    setExploration((current) => attackCell(current, { x, y }))
  }, [])

  useEffect(() => {
    if (navigation.current !== 'exploration' || !exploration.finished) return
    setResultTurn(exploration.turn)
    setResultKind('探索失敗')
    setExplorationMenuOpen(false)
    const next: NavigationState = { current: 'explorationResult', previous: navigation.previous }
    window.history.replaceState(next, '')
    setNavigation(next)
  }, [exploration.finished, exploration.turn, navigation.current, navigation.previous])

  const finishExploration = useCallback(() => {
    setResultTurn(exploration.turn)
    setResultKind('任意帰還')
    setExplorationMenuOpen(false)
    const next: NavigationState = { current: 'explorationResult', previous: navigation.previous }
    window.history.replaceState(next, '')
    setNavigation(next)
  }, [exploration.turn, navigation.previous])

  const returnToTown = useCallback(() => {
    const next: NavigationState = { current: 'town', previous: ['title'] }
    window.history.replaceState(next, '')
    setNavigation(next)
  }, [])

  switch (navigation.current) {
    case 'title':
      return <TitleScreen onStart={() => openScreen('town')} onSettings={() => openScreen('settings')} />
    case 'town':
      return <TownScreen onNavigate={openScreen} />
    case 'dungeon':
      return <DungeonScreen onBack={goBack} onStartTest={startTestExploration} />
    case 'exploration':
      return <ExplorationScreen exploration={exploration} menuOpen={explorationMenuOpen} onMove={handleMove} onAttack={handleAttack} onMenuOpenChange={setExplorationMenuOpen} onOpenStatus={() => openScreen('status')} onOpenEquipment={() => openScreen('equipment')} onReturn={finishExploration} />
    case 'explorationResult':
      return <ExplorationResultScreen turn={resultTurn} resultKind={resultKind} onTown={returnToTown} />
    case 'equipment':
      return <EquipmentScreen onBack={goBack} />
    case 'status':
      return <StatusScreen onBack={goBack} onOpenEquipment={() => openScreen('equipment')} />
    case 'jobs':
      return <JobsScreen onBack={goBack} />
    case 'settings':
      return <SettingsScreen onBack={goBack} />
  }
}

export default App
