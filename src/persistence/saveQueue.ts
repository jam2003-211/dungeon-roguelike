import type { SaveData } from './saveData'
import type { SaveRepository } from './saveStorage'

// 自動・手動保存は同じ列へ入れる。ロード開始時には未着手の保存を無効化する。
export class SaveQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private epoch = 0
  private revision = 0
  loading = false
  constructor(private repository: SaveRepository) {}

  private append<T>(action: () => Promise<T>): Promise<T> {
    const task = this.tail.then(action)
    this.tail = task.catch(() => undefined)
    return task
  }

  autosave(data: SaveData): Promise<SaveData | null> {
    if (this.loading) return Promise.resolve(null)
    const snapshot = structuredClone(data); const epoch = this.epoch; const revision = ++this.revision
    return this.append(async () => {
      if (epoch !== this.epoch || revision !== this.revision) return null
      await this.repository.write(snapshot)
      return snapshot
    })
  }

  manual<T>(action: () => Promise<T>): Promise<T | null> {
    if (this.loading) return Promise.reject(new Error('ロード中です。'))
    const epoch = this.epoch
    return this.append(async () => epoch === this.epoch ? action() : null)
  }

  async load(): Promise<unknown> {
    if (this.loading) throw new Error('ロード中です。')
    this.loading = true; ++this.epoch; ++this.revision
    try { return await this.append(() => this.repository.read()) }
    finally { this.loading = false }
  }
}
