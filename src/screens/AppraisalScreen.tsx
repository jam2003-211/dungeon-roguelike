import { useState } from 'react'
import { Panel, AppShell, ScreenHeader } from '../components/Ui'
import type { EquipmentItem, PlayerState, UnidentifiedTreasure } from '../game/player'
import { ItemDetail } from './EquipmentScreen'

export function AppraisalScreen({ player, onAppraise, onAppraiseAll, onBack }: {
  player: PlayerState
  onAppraise: (id: string) => EquipmentItem | null
  onAppraiseAll: () => EquipmentItem[]
  onBack: () => void
}) {
  const [results, setResults] = useState<EquipmentItem[]>([])
  const [selected, setSelected] = useState<EquipmentItem | null>(null)
  const appraiseOne = (treasure: UnidentifiedTreasure) => {
    const item = onAppraise(treasure.id)
    if (item) { setResults((current) => [...current, item]); setSelected(item) }
  }
  const appraiseAll = () => {
    const items = onAppraiseAll()
    if (items.length) { setResults((current) => [...current, ...items]); setSelected(null) }
  }
  const resultPlayer = player
  return <AppShell>
    <ScreenHeader title="鑑定" onBack={onBack} />
    <Panel className="appraisal-panel">
      <div className="section-heading"><h2>未鑑定のお宝</h2><span className="item-count">{player.treasures.length}個</span></div>
      {player.treasures.length > 0 ? <>
        <ul className="treasure-list">{player.treasures.map((treasure) => <li key={treasure.id}>
          <span className="treasure-icon" aria-hidden="true">?</span><strong>お宝 Lv.{treasure.level}</strong>
          <button type="button" onClick={() => appraiseOne(treasure)}>鑑定</button>
        </li>)}</ul>
        <button type="button" className="appraise-all-button" onClick={appraiseAll}>すべて鑑定</button>
      </> : <p className="empty-inline">未鑑定のお宝はありません。</p>}
    </Panel>
    {results.length > 0 && <Panel className="appraisal-results">
      <h2>鑑定結果</h2>
      <ul className="appraised-list">{results.map((item) => <li key={item.id}>
        <button type="button" onClick={() => setSelected(item)}><strong>{item.name}</strong><span>Lv.{item.level}</span></button>
      </li>)}</ul>
    </Panel>}
    {selected && <ItemDetail item={selected} player={resultPlayer} readOnly={false} inspectionOnly onClose={() => setSelected(null)} onChange={() => undefined} />}
  </AppShell>
}
