import { createSaveData, readSaveData, type SaveData } from './saveData'
import type { SaveRepository } from './saveStorage'
import type { PlayerState } from '../game/player'
import type { DungeonStock } from '../game/dungeon'
import { SaveQueue } from './saveQueue'

export interface SaveMetadata { exists: boolean; savedAt: string | null }
export function saveMetadata(value: unknown): SaveMetadata {
  const date = typeof value === 'object' && value !== null && 'savedAt' in value ? value.savedAt : null
  return { exists: value !== undefined, savedAt: typeof date === 'string' && Number.isFinite(Date.parse(date)) ? date : null }
}

export class SaveOperations {
  busy = false
  readonly queue: SaveQueue
  constructor(private repository: SaveRepository, private isTown: () => boolean) { this.queue = new SaveQueue(repository) }

  private async run<T>(action: () => Promise<T>): Promise<T> {
    if (!this.isTown()) throw new Error('セーブ・ロードは町でのみ操作できます。')
    if (this.busy) throw new Error('セーブ・ロードの処理中です。')
    this.busy = true
    try { return await action() } finally { this.busy = false }
  }

  save(player: PlayerState, stocks: DungeonStock[], confirmed: boolean): Promise<SaveData | null> {
    const snapshot = createSaveData(player, stocks)
    return this.run(() => this.queue.manual(async () => {
      // 起動時の確認後に作られたレコードも、保存直前に確認する。
      const previous = await this.repository.read()
      if (previous !== undefined && !confirmed) return null
      await this.repository.write(snapshot)
      return snapshot
    }))
  }

  load(confirmed: boolean): Promise<SaveData | null> {
    return this.run(async () => {
      if (!confirmed) return null
      const value = await this.queue.load()
      if (value === undefined) throw new Error('セーブデータがありません。')
      return readSaveData(value)
    })
  }
}
