import { useEffect, useRef, useState } from 'react'
import type { PlayerState } from '../game/player'
import type { DungeonStock } from '../game/dungeon'
import type { SaveData } from './saveData'
import { SaveOperations, saveMetadata, type SaveMetadata } from './saveOperations'
import { createSaveRepository } from './saveStorage'

const repository = createSaveRepository()
export function useSaveGame(isTown: boolean, player: PlayerState, stocks: DungeonStock[], onLoad: (data: SaveData) => void) {
  const town = useRef(isTown); town.current = isTown
  const operations = useRef<SaveOperations | null>(null)
  if (!operations.current) operations.current = new SaveOperations(repository, () => town.current)
  const [metadata, setMetadata] = useState<SaveMetadata>({ exists: false, savedAt: null })
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState(false)
  const [confirmation, setConfirmation] = useState<'save' | 'load' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

  const refresh = async () => {
    setChecking(true)
    try { setMetadata(saveMetadata(await repository.read())); setMessage(''); setError(false) }
    catch { setMessage('保存情報を読み取れませんでした。再確認してください。'); setError(true) }
    finally { setChecking(false) }
  }
  useEffect(() => { void refresh() }, [])
  useEffect(() => { if (!isTown) { setOpened(false); setConfirmation(null) } }, [isTown])

  const execute = async (action: 'save' | 'load', confirmed: boolean) => {
    if (checking || operations.current!.busy || !town.current) return
    setBusy(true); setMessage(''); setError(false); setConfirmation(null)
    try {
      if (action === 'save') {
        const data = await operations.current!.save(player, stocks, confirmed)
        if (!data) { setMetadata({ exists: true, savedAt: metadata.savedAt }); setConfirmation('save'); return }
        setMetadata(saveMetadata(data)); setMessage('セーブしました。')
      } else {
        const data = await operations.current!.load(confirmed)
        if (data && town.current) { onLoad(data); setMetadata(saveMetadata(data)); setMessage('ロードしました。町から再開します。') }
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : '再試行してください。'
      setError(true); setMessage(`${action === 'save' ? 'セーブに失敗しました。' : 'ロードに失敗しました。'}${detail}`)
    } finally { setBusy(false) }
  }

  return {
    metadata, checking, busy, opened, confirmation, message, error,
    open: () => { setOpened(true); setConfirmation(null) },
    close: () => { if (!busy) { setOpened(false); setConfirmation(null) } },
    cancel: () => setConfirmation(null),
    save: () => metadata.exists ? setConfirmation('save') : void execute('save', false),
    load: () => setConfirmation('load'),
    confirm: () => { if (confirmation) void execute(confirmation, true) },
    refresh,
  }
}
export type SaveGameControls = ReturnType<typeof useSaveGame>
