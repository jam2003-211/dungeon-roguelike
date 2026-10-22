import { useCallback, useEffect, useState } from 'react'
import { createInitialNavigation, getPreviousNavigation, navigate, readNavigationState, type NavigationState, type ScreenId } from './navigation'
import { DungeonScreen } from './screens/DungeonScreen'
import { EquipmentScreen } from './screens/EquipmentScreen'
import { JobsScreen } from './screens/JobsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { StatusScreen } from './screens/StatusScreen'
import { TitleScreen } from './screens/TitleScreen'
import { TownScreen } from './screens/TownScreen'

const initialNavigation = createInitialNavigation()

function App() {
  const [navigation, setNavigation] = useState<NavigationState>(initialNavigation)

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

  switch (navigation.current) {
    case 'title':
      return <TitleScreen onStart={() => openScreen('town')} onSettings={() => openScreen('settings')} />
    case 'town':
      return <TownScreen onNavigate={openScreen} />
    case 'dungeon':
      return <DungeonScreen onBack={goBack} />
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
