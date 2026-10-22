import { useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { AppShell, Panel, PlannedBadge, ScreenHeader } from '../components/Ui'
import { initialPlayerView } from '../data/presentation'

const equipmentSlots = [
  { label: '武器', value: initialPlayerView.equipment.weapon, icon: 'weapon', rarity: 'common' },
  { label: '防具', value: initialPlayerView.equipment.armor, icon: 'armor', rarity: 'common' },
  { label: 'アクセサリー 1', value: initialPlayerView.equipment.accessory1, icon: 'accessory', rarity: 'empty' },
  { label: 'アクセサリー 2', value: initialPlayerView.equipment.accessory2, icon: 'accessory', rarity: 'empty' },
] as const

const tabs = ['武器', '防具', 'アクセサリー'] as const
type EquipmentTab = (typeof tabs)[number]

export function EquipmentScreen({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<EquipmentTab>('武器')

  return (
    <AppShell>
      <ScreenHeader title="装備・所持品" subtitle="装備内容の確認" onBack={onBack} />
      <p className="screen-intro">この段階では閲覧用の画面です。装備変更やアイテム操作はできません。</p>
      <div className="section-heading"><h2>現在の装備</h2><PlannedBadge /></div>
      <div className="equipment-grid">
        {equipmentSlots.map((slot) => (
          <Panel className={`equipment-slot rarity-${slot.rarity}`} key={slot.label}>
            <Icon name={slot.icon as IconName} size="large" />
            <small>{slot.label}</small>
            <strong>{slot.value}</strong>
          </Panel>
        ))}
      </div>
      <div className="section-heading inventory-heading"><h2>所持品</h2><span className="item-count">0 items</span></div>
      <div className="category-tabs" role="tablist" aria-label="所持品の分類">
        {tabs.map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} className={activeTab === tab ? 'is-active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
      </div>
      <Panel className="empty-inventory" role="tabpanel">
        <Icon name="bag" size="large" />
        <strong>{activeTab}の所持品はありません</strong>
        <p>アイテムの獲得・装備変更は今後実装予定です。</p>
      </Panel>
    </AppShell>
  )
}
