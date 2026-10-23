import { AppShell, Panel } from '../components/Ui'
import { sortRewards } from '../game/loot'
import type { UnidentifiedTreasure } from '../game/player'

export function ExplorationResultScreen({ dungeonName, items, turn, experience, floor, startLevel, endLevel, resultKind, onTown }: {
  dungeonName: string
  items: UnidentifiedTreasure[]
  turn: number
  experience: number
  floor: number
  startLevel: number
  endLevel: number
  resultKind: string
  onTown: () => void
}) {
  return <AppShell className="result-screen">
    <h1>探索結果</h1>
    <Panel className="result-panel">
      <strong className="result-kind">{resultKind}</strong>
      <dl><div><dt>ダンジョン</dt><dd>{dungeonName}</dd></div><div><dt>到達階</dt><dd>{floor}階</dd></div><div><dt>経過ターン</dt><dd>{turn}</dd></div><div><dt>獲得経験値</dt><dd>{experience}</dd></div><div><dt>レベル</dt><dd>Lv.{startLevel} → Lv.{endLevel}</dd></div><div><dt>お宝</dt><dd>{items.length}個</dd></div></dl>
      {items.length === 0 ? <p className="empty-rewards">お宝なし</p> : <ul className="reward-list">{sortRewards(items).map((treasure) => <li key={treasure.id} className="reward-item treasure-reward" data-treasure-id={treasure.id}>
        <span className="treasure-icon" aria-hidden="true">?</span><span><strong>お宝 Lv.{treasure.level}</strong></span>
      </li>)}</ul>}
    </Panel>
    <button type="button" className="primary-button result-town-button" onClick={onTown}>町へ戻る</button>
  </AppShell>
}
