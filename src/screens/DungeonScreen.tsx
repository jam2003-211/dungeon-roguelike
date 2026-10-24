import { useState } from 'react'
import { assetUrl } from '../assets'
import { Icon, type IconName } from '../components/Icon'
import { AppShell, Panel, ScreenHeader } from '../components/Ui'
import { dungeonStocks as stockPresentation } from '../data/presentation'
import { MAX_DUNGEON_LEVEL, type DungeonStock, type DungeonStockId } from '../game/dungeon'

const categoryLabels = { weapon: '武器', armor: '防具', accessory: 'アクセサリー' } as const

interface Props {
  playerLevel: number
  stocks: DungeonStock[]
  onBack: () => void
  onGenerate: (stockId: DungeonStockId, level: number) => string | null
  onStart: (stockId: DungeonStockId) => void
}

export function DungeonScreen({ playerLevel, stocks, onBack, onGenerate, onStart }: Props) {
  const [levels, setLevels] = useState<Record<number, number>>({ 1: 1, 2: 1, 3: 1 })
  const [confirmStock, setConfirmStock] = useState<DungeonStockId | null>(null)
  const [error, setError] = useState<string | null>(null)
  const generate = (stockId: DungeonStockId) => {
    const level = levels[stockId] ?? 1
    const message = onGenerate(stockId, level); setError(message); if (!message) setConfirmStock(null)
  }
  const changeLevel = (stockId: DungeonStockId, value: number) => setLevels((current) => ({ ...current, [stockId]: Math.min(MAX_DUNGEON_LEVEL, Math.max(1, value)) }))
  return <AppShell>
    <ScreenHeader title="ダンジョン" onBack={onBack} />
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="stock-list">{stocks.map((stock) => {
      const presentation = stockPresentation.find((item) => item.id === stock.id)!
      const unlocked = playerLevel >= stock.unlockLevel; const generated = stock.dungeon !== null
      const status = !unlocked ? '未解放' : stock.cleared ? 'クリア済み' : generated ? '生成済み' : '解放済み・未生成'
      return <Panel className={`stock-card stock-card--${stock.id} ${unlocked ? '' : 'is-locked'}`} key={stock.id} style={{ backgroundImage: `linear-gradient(rgba(5, 6, 8, .86), rgba(5, 6, 8, .94)), url(${assetUrl(`assets/backgrounds/${stock.theme}.png`)})` }}>
        <div className="stock-card__top"><div className="stock-icon"><Icon name={presentation.icon as IconName} size="large" /></div><div className="stock-title"><small>ストック {stock.id}</small><h2>{stock.name}</h2><p>{presentation.description}</p></div>{!unlocked && <Icon name="lock" />}</div>
        <div className="stock-status"><span>{unlocked ? status : `Lv.${stock.unlockLevel}で解放`}</span>{generated && <strong>Lv.{stock.dungeon!.level}</strong>}</div>
        {generated && <dl className="stock-details"><div><dt>総階層</dt><dd>{stock.totalFloorsKnown ? `${stock.dungeon!.totalFloors}階` : '？'}</dd></div><div><dt>最高到達</dt><dd>{stock.highestFloor || 0}階</dd></div><div><dt>得意カテゴリ</dt><dd>{categoryLabels[stock.dungeon!.featuredCategory]}</dd></div></dl>}
        <div className="dungeon-level-picker" aria-label={`ストック${stock.id}のダンジョンレベル設定`}><strong>ダンジョンLv <output aria-live="polite">{levels[stock.id].toLocaleString('ja-JP')}</output></strong><div className="dungeon-level-steps">{[-100, -10, -1, 1, 10, 100].map((step) => <button key={step} type="button" disabled={!unlocked || (step < 0 ? levels[stock.id] === 1 : levels[stock.id] === MAX_DUNGEON_LEVEL)} onClick={() => changeLevel(stock.id, levels[stock.id] + step)}>{step > 0 ? '+' : '−'}{Math.abs(step)}</button>)}</div><div className="dungeon-level-scale"><button type="button" disabled={!unlocked || levels[stock.id] === 1} onClick={() => changeLevel(stock.id, Math.floor(levels[stock.id] / 10))}>÷10</button><button type="button" disabled={!unlocked || levels[stock.id] === MAX_DUNGEON_LEVEL} onClick={() => changeLevel(stock.id, levels[stock.id] * 10)}>×10</button></div><div className="dungeon-level-presets">{[1, 10, 30, 50, 90].map((level) => <button key={level} type="button" disabled={!unlocked} onClick={() => changeLevel(stock.id, level)}>Lv.{level}</button>)}</div></div>
        <div className="planned-actions"><button type="button" disabled={!unlocked} onClick={() => generated ? setConfirmStock(stock.id) : generate(stock.id)}>{generated ? '再生成' : '生成'}</button><button type="button" disabled={!unlocked || !generated} onClick={() => onStart(stock.id)}>探索開始</button></div>
      </Panel>
    })}</div>
    {confirmStock !== null && <div className="modal-layer"><Panel className="dialog-panel" role="dialog" aria-modal="true"><h2>ダンジョン再生成</h2><p>このダンジョンを再生成すると、現在のダンジョン情報・到達記録・クリア記録が失われます。再生成しますか？</p><div className="dialog-actions"><button type="button" onClick={() => setConfirmStock(null)}>キャンセル</button><button type="button" onClick={() => generate(confirmStock)}>再生成する</button></div></Panel></div>}
  </AppShell>
}
