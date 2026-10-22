import { Icon, type IconName } from '../components/Icon'
import { AppShell, Panel, PlannedBadge, ScreenHeader } from '../components/Ui'
import { dungeonStocks, initialPlayerView } from '../data/presentation'

export function DungeonScreen({ onBack }: { onBack: () => void }) {
  return (
    <AppShell>
      <ScreenHeader title="ダンジョン" subtitle="ダンジョンストック" onBack={onBack} />
      <p className="screen-intro">ストックごとに異なる外観を持ちます。ダンジョンデータはまだ生成・保存されません。</p>
      <div className="stock-list">
        {dungeonStocks.map((stock) => {
          const unlocked = initialPlayerView.level >= stock.unlockLevel
          return (
            <Panel className={`stock-card stock-card--${stock.id} ${unlocked ? '' : 'is-locked'}`} key={stock.id}>
              <div className="stock-card__top">
                <div className="stock-icon"><Icon name={stock.icon as IconName} size="large" /></div>
                <div className="stock-title"><small>ストック {stock.id}</small><h2>{stock.name}</h2><p>{stock.description}</p></div>
                {!unlocked && <Icon name="lock" />}
              </div>
              <div className="stock-status">
                <span>{unlocked ? '解放済み' : `Lv.${stock.unlockLevel}で解放`}</span>
                <PlannedBadge />
              </div>
              <div className="planned-actions" aria-label={`${stock.name}の未実装操作`}>
                <button type="button" disabled>レベル指定・生成</button>
                <button type="button" disabled>探索開始</button>
              </div>
            </Panel>
          )
        })}
      </div>
    </AppShell>
  )
}
