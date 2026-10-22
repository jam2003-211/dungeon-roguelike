import { useCallback, useEffect, useState } from 'react'
import { createInitialNavigation, getPreviousNavigation, navigate, readNavigationState, type NavigationState, type ScreenId } from './navigation'
import { createExplorationState, movePlayer, type Direction, type ExplorationState } from './game/exploration'
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
  const [exploration, setExploration] = useState<ExplorationState>(createExplorationState)
  const [explorationMenuOpen, setExplorationMenuOpen] = useState(false)
  const [resultTurn, setResultTurn] = useState(0)

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
    setExploration(createExplorationState())
    setExplorationMenuOpen(false)
    const next = navigate(navigation, 'exploration')
    window.history.pushState(next, '')
    setNavigation(next)
  }, [navigation])

  const handleMove = useCallback((direction: Direction) => {
    setExploration((current) => movePlayer(current, direction))
  }, [])

  const finishExploration = useCallback(() => {
    setResultTurn(exploration.turn)
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
      return <ExplorationScreen exploration={exploration} menuOpen={explorationMenuOpen} onMove={handleMove} onMenuOpenChange={setExplorationMenuOpen} onOpenStatus={() => openScreen('status')} onOpenEquipment={() => openScreen('equipment')} onReturn={finishExploration} />
    case 'explorationResult':
      return <ExplorationResultScreen turn={resultTurn} onTown={returnToTown} />
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
