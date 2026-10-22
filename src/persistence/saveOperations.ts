import { createSaveData, readSaveData, type SaveData } from './saveData'
import type { SaveRepository } from './saveStorage'
import type { PlayerState } from '../game/player'
import type { DungeonStock } from '../game/dungeon'

export interface SaveMetadata { exists: boolean; savedAt: string | null }
export function saveMetadata(value: unknown): SaveMetadata {
  const date = typeof value === 'object' && value !== null && 'savedAt' in value ? value.savedAt : null
  return { exists: value !== undefined, savedAt: typeof date === 'string' && Number.isFinite(Date.parse(date)) ? date : null }
}

export class SaveOperations {
  busy = false
  constructor(private repository: SaveRepository, private isTown: () => boolean) {}

  private async run<T>(action: () => Promise<T>): Promise<T> {
    if (!this.isTown()) throw new Error('セーブ・ロードは町でのみ操作できます。')
    if (this.busy) throw new Error('セーブ・ロードの処理中です。')
    this.busy = true
    try { return await action() } finally { this.busy = false }
  }

  save(player: PlayerState, stocks: DungeonStock[], confirmed: boolean): Promise<SaveData | null> {
    return this.run(async () => {
      // 起動時の確認後に作られたレコードも、保存直前に確認する。
      const previous = await this.repository.read()
      if (previous !== undefined && !confirmed) return null
      const data = createSaveData(player, stocks)
      await this.repository.write(data)
      return data
    })
  }

  load(confirmed: boolean): Promise<SaveData | null> {
    return this.run(async () => {
      if (!confirmed) return null
      const value = await this.repository.read()
      if (value === undefined) throw new Error('セーブデータがありません。')
      return readSaveData(value)
    })
  }
}
