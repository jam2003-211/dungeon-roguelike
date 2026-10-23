import type { SaveData } from './saveData'

export const SAVE_DATABASE = 'roguelike-game'
export const SAVE_STORE = 'saves'
export const SAVE_KEY = 'main'
export interface SaveRepository { read: () => Promise<unknown>; write: (data: SaveData) => Promise<void>; remove: () => Promise<void> }

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(SAVE_DATABASE, 1)
    let blocked = false
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(SAVE_STORE)) request.result.createObjectStore(SAVE_STORE) }
    request.onerror = () => reject(new Error('保存先を開けませんでした。ブラウザの保存設定を確認して再試行してください。'))
    request.onblocked = () => { blocked = true; reject(new Error('別のタブが保存先を使用しています。他のタブを閉じて再試行してください。')) }
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return }
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

// putの成功だけでは確定しない。トランザクション完了まで待ち、失敗時は旧レコードを維持する。
async function transact(mode: IDBTransactionMode, data?: SaveData, factory: IDBFactory = indexedDB, remove = false): Promise<unknown> {
  const database = await openDatabase(factory)
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(SAVE_STORE, mode)
      const store = transaction.objectStore(SAVE_STORE)
      const request = remove ? store.delete(SAVE_KEY) : mode === 'readwrite' ? store.put(data, SAVE_KEY) : store.get(SAVE_KEY)
      let result: unknown
      request.onsuccess = () => { result = request.result }
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(new Error(mode === 'readwrite' ? '保存できませんでした。前回のセーブを保持しています。再試行してください。' : '読み込みに失敗しました。現在の状態を保持しています。再試行してください。'))
      transaction.onerror = () => { /* abortイベントで失敗を確定する。 */ }
    })
  } finally { database.close() }
}

export function createSaveRepository(factory?: IDBFactory): SaveRepository {
  return { read: () => transact('readonly', undefined, factory), write: async (data) => { await transact('readwrite', data, factory) }, remove: async () => { await transact('readwrite', undefined, factory, true) } }
}
