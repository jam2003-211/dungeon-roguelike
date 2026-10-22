import { Panel } from './Ui'
import type { SaveGameControls } from '../persistence/useSaveGame'

export function SaveLoadPanel({ controls }: { controls: SaveGameControls }) {
  const { checking, busy, metadata, confirmation, message, error } = controls
  return <div className="modal-layer"><Panel className="dialog-panel save-load-panel" role="dialog" aria-modal="true" aria-labelledby="save-load-title">
    <h2 id="save-load-title">セーブ・ロード</h2>
    <p>町での手動保存のみです。探索途中には戻れません。再読み込み後は、町でロードしてください。</p>
    <p className="save-presence">{checking ? '保存情報を確認中…' : metadata.exists ? 'セーブデータあり（1スロット）' : 'セーブデータなし'}</p>
    <p className="save-timestamp">最終保存日時：{metadata.savedAt ? new Date(metadata.savedAt).toLocaleString('ja-JP') : metadata.exists ? '不明' : '未保存'}</p>
    <fieldset disabled={busy || checking}>
      {confirmation ? <>
        <p>{confirmation === 'save' ? '前回のセーブデータを上書きしますか？' : '現在の進行状況をセーブデータに置き換えますか？'}</p>
        <button type="button" onClick={controls.confirm}>{confirmation === 'save' ? '上書きする' : 'ロードする'}</button>
        <button type="button" onClick={controls.cancel}>キャンセル</button>
      </> : <>
        <button type="button" onClick={controls.save}>セーブ</button>
        <button type="button" onClick={controls.load} disabled={!metadata.exists}>ロード</button>
        <button type="button" onClick={() => void controls.refresh()}>保存情報を再確認</button>
      </>}
    </fieldset>
    {busy && <p role="status">処理中…</p>}
    {message && <p className={error ? 'error-text' : ''} role={error ? 'alert' : 'status'}>{message}</p>}
    <button type="button" disabled={busy || checking} onClick={controls.close}>閉じる</button>
  </Panel></div>
}
