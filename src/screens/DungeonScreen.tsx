import { assetUrl } from '../assets'
import { Icon, type IconName } from '../components/Icon'
import { AppShell, Panel, PlannedBadge, ScreenHeader } from '../components/Ui'
import { dungeonStocks, initialPlayerView } from '../data/presentation'

export function DungeonScreen({ onBack, onStartTest }: { onBack: () => void; onStartTest: () => void }) {
  return (
    <AppShell>
      <ScreenHeader title="ダンジョン" subtitle="ダンジョンストック" onBack={onBack} />
      <p className="screen-intro">ストックごとに異なる外観を持ちます。ダンジョンデータはまだ生成・保存されません。</p>
      <div className="stock-list">
        {dungeonStocks.map((stock) => {
          const unlocked = initialPlayerView.level >= stock.unlockLevel
          return (
            <Panel className={`stock-card stock-card--${stock.id} ${unlocked ? '' : 'is-locked'}`} key={stock.id} style={{ backgroundImage: `linear-gradient(rgba(5, 6, 8, .86), rgba(5, 6, 8, .94)), url(${assetUrl(`assets/backgrounds/${stock.id === 1 ? 'forest' : stock.id === 2 ? 'ruins' : 'castle'}.png`)})` }}>
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
              {stock.id === 1 && <button type="button" className="test-exploration-button" onClick={onStartTest}>テスト探索</button>}
            </Panel>
          )
        })}
      </div>
    </AppShell>
  )
}
