import type { SaveGameControls } from '../persistence/useSaveGame'

export function SaveStatus({ controls }: { controls: SaveGameControls }) {
  return <aside className={`save-status${controls.error ? ' save-status--error' : ''}`} data-saving={String(controls.saving || controls.busy || controls.checking)} role={controls.error ? 'alert' : 'status'}>
    {controls.error ? <>{controls.message}<button type="button" onClick={controls.retry}>再試行</button><button type="button" onClick={() => void controls.refresh()}>保存情報を再確認</button></> : controls.saving || controls.busy ? '保存・読込中…' : controls.checking ? '保存情報を確認中…' : controls.metadata.exists ? '自動保存 有効・保存済み' : '自動保存 有効'}
  </aside>
}
