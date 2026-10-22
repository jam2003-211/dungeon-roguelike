import { useEffect, useRef, useState } from 'react'
import type { PlayerState } from '../game/player'
import type { DungeonStock } from '../game/dungeon'
import { createSaveData, readSaveData, type SaveData } from './saveData'
import type { SavedRun } from './savedRun'
import { SaveOperations, saveMetadata, type SaveMetadata } from './saveOperations'
import { createSaveRepository } from './saveStorage'

const repository = createSaveRepository()
interface Progress { player: PlayerState; stocks: DungeonStock[]; run: SavedRun | null }
const progressKey = ({ player, stocks, run }: Progress) => JSON.stringify({ player, stocks, run })

export function useSaveGame(isTown: boolean, progress: Progress, onLoad: (data: SaveData, enterGame: boolean) => void) {
  const town = useRef(isTown); town.current = isTown
  const current = useRef(progress); current.current = progress
  const operations = useRef<SaveOperations | null>(null)
  if (!operations.current) operations.current = new SaveOperations(repository, () => town.current)
  const [metadata, setMetadata] = useState<SaveMetadata>({ exists: false, savedAt: null })
  const [resumeInfo, setResumeInfo] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [opened, setOpened] = useState(false)
  const [confirmation, setConfirmation] = useState<'save' | 'load' | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const protectedSave = useRef(true); const paused = useRef(false)
  const refreshGeneration = useRef(0)
  const key = progressKey(progress); const previousKey = useRef(key); const request = useRef(0)

  const describe = (data: SaveData) => data.run ? `${data.stocks[data.run.stockId - 1].name} Lv.${data.stocks[data.run.stockId - 1].dungeon!.level} / ${data.run.floor}階` : null
  const acknowledge = (data: SaveData) => { setMetadata(saveMetadata(data)); setResumeInfo(describe(data)) }
  const refresh = async (boot = false) => {
    const generation = ++refreshGeneration.current
    setChecking(true)
    try {
      const value = await repository.read()
      if (generation !== refreshGeneration.current) return
      setMetadata(saveMetadata(value))
      if (value !== undefined) {
        const data = readSaveData(value); acknowledge(data)
        if (boot) {
          // タイトルを保ち、探索は明示的な再開操作まで実行しない。
          previousKey.current = progressKey({ ...data, run: null }); onLoad(data, false)
          protectedSave.current = data.run !== null
        }
      } else if (boot) protectedSave.current = false
      setMessage(''); setError(false)
    } catch (cause) {
      if (generation !== refreshGeneration.current) return
      protectedSave.current = true; setResumeInfo(null); setError(true)
      setMessage(`保存データを確認できません。自動保存を停止しています。${cause instanceof Error ? cause.message : '再確認してください。'}`)
    } finally { if (generation === refreshGeneration.current) { setChecking(false); if (boot) setReady(true) } }
  }
  useEffect(() => { void refresh(true) }, [])
  useEffect(() => { if (!isTown) { setOpened(false); setConfirmation(null) } }, [isTown])

  const autosave = async (committed: Progress = current.current) => {
    if (protectedSave.current || paused.current || operations.current!.queue.loading) return
    const revision = ++request.current
    setSaving(true)
    try {
      const { player, stocks, run } = committed
      const data = await operations.current!.queue.autosave(createSaveData(player, stocks, new Date(), run))
      if (data && revision === request.current) { acknowledge(data); setError(false); setMessage('') }
    } catch (cause) {
      if (revision === request.current) { setError(true); setMessage(`自動保存できませんでした。${cause instanceof Error ? cause.message : '再試行してください。'}`) }
    } finally { if (revision === request.current) setSaving(false) }
  }
  useEffect(() => {
    if (!ready || key === previousKey.current) return
    previousKey.current = key
    // このeffectが属する確定済みrenderの状態を保存する。
    void autosave(progress)
  }, [key, ready])

  const load = async () => {
    if (checking || operations.current!.busy || paused.current) return
    paused.current = true; ++request.current; setSaving(false); setBusy(true); setConfirmation(null); setMessage('')
    try {
      const value = town.current ? await operations.current!.load(true) : readSaveData(await operations.current!.queue.load())
      if (value) {
        previousKey.current = progressKey(value); protectedSave.current = false
        onLoad(value, true); acknowledge(value); setError(false); setMessage(value.run ? '探索を再開しました。' : 'ロードしました。町から再開します。')
      }
    } catch (cause) { protectedSave.current = true; setError(true); setMessage(`ロードに失敗しました。自動保存を停止しています。${cause instanceof Error ? cause.message : '再試行してください。'}`) }
    finally { paused.current = false; setBusy(false) }
  }
  const save = async (confirmed: boolean) => {
    if (checking || operations.current!.busy || !town.current) return
    setBusy(true); setMessage(''); setConfirmation(null)
    try {
      const data = await operations.current!.save(current.current.player, current.current.stocks, confirmed)
      if (!data) { setMetadata({ ...metadata, exists: true }); setConfirmation('save'); return }
      protectedSave.current = false; acknowledge(data); setError(false); setMessage('セーブしました。')
    } catch (cause) { setError(true); setMessage(`セーブに失敗しました。${cause instanceof Error ? cause.message : '再試行してください。'}`) }
    finally { setBusy(false) }
  }
  return {
    metadata, checking, busy, saving, opened, confirmation, message, error, resumeInfo,
    open: () => { setOpened(true); setConfirmation(null) },
    close: () => { if (!busy) { setOpened(false); setConfirmation(null) } },
    cancel: () => setConfirmation(null),
    save: () => metadata.exists ? setConfirmation('save') : void save(false),
    load: () => setConfirmation('load'),
    confirm: () => { if (confirmation === 'load') void load(); else if (confirmation === 'save') void save(true) },
    resume: () => void load(), refresh: () => refresh(), retry: () => { if (protectedSave.current) void load(); else void autosave() },
  }
}
export type SaveGameControls = ReturnType<typeof useSaveGame>
