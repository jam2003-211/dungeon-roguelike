import { AppShell, Panel } from '../components/Ui'
import { Icon } from '../components/Icon'
import { PixelAsset } from '../components/PixelAsset'
import { equipmentAssetPath } from '../assets'
import { RARITY_LABELS, type EquipmentItem } from '../game/player'
import { sortRewards } from '../game/loot'

export function ExplorationResultScreen({ dungeonName, items, turn, experience, floor, startLevel, endLevel, resultKind, onTown }: { dungeonName: string; items: EquipmentItem[]; turn: number; experience: number; floor: number; startLevel: number; endLevel: number; resultKind: '任意帰還' | '探索失敗' | 'ダンジョンクリア'; onTown: () => void }) {
  return (
    <AppShell className="result-screen">
      <p className="eyebrow">EXPLORATION RESULT</p>
      <h1>探索結果</h1>
      <Panel className="result-panel">
        <strong className="result-kind">{resultKind}</strong>
        <dl><div><dt>ダンジョン</dt><dd>{dungeonName}</dd></div><div><dt>到達階</dt><dd>{floor}階</dd></div><div><dt>経過ターン</dt><dd>{turn}</dd></div><div><dt>経験値獲得</dt><dd>{experience}</dd></div><div><dt>レベル</dt><dd>Lv.{startLevel} → Lv.{endLevel}</dd></div><div><dt>獲得装備</dt><dd>{items.length}個</dd></div></dl>
        {items.length === 0 ? <p className="empty-rewards">獲得装備なし</p> : <ul className="reward-list">{sortRewards(items).map((item) => {
          const src = equipmentAssetPath(item)
          return <li key={item.id} className={`reward-item rarity-${item.rarity}`} data-item-id={item.id}>{src ? <PixelAsset src={src} alt="" /> : <Icon name={item.category} />}<span><strong>{item.name}</strong><small>Lv.{item.level} / {RARITY_LABELS[item.rarity]}</small></span></li>
        })}</ul>}
        <p>記録・所持品はアプリ起動中のみ保持されます。永続保存は未実装です。</p>
      </Panel>
      <button type="button" className="primary-button result-town-button" onClick={onTown}>町へ戻る</button>
    </AppShell>
  )
}
