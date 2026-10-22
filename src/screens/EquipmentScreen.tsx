import { useState } from 'react'
import { equipmentAssetPath } from '../assets'
import { Icon, type IconName } from '../components/Icon'
import { PixelAsset } from '../components/PixelAsset'
import { SpecialEffectIcon } from '../components/SpecialEffectIcon'
import { AppShell, Panel, ScreenHeader } from '../components/Ui'
import { RARITY_LABELS, SUBTYPE_LABELS, canEquip, discardItem, equipItem, isEquipped, itemBonuses, sortAndFilterInventory, toggleFavorite, unequipSlot, type EquipmentCategory, type EquipmentItem, type EquipmentSlots, type PlayerState } from '../game/player'
import { SKILLS } from '../game/skills'

const tabs: Array<{ id: EquipmentCategory; label: string }> = [{ id: 'weapon', label: '武器' }, { id: 'armor', label: '防具' }, { id: 'accessory', label: 'アクセサリー' }]
const slots: Array<{ id: keyof EquipmentSlots; label: string; icon: IconName }> = [{ id: 'weapon', label: '武器', icon: 'weapon' }, { id: 'armor', label: '防具', icon: 'armor' }, { id: 'accessory1', label: 'アクセサリー 1', icon: 'accessory' }, { id: 'accessory2', label: 'アクセサリー 2', icon: 'accessory' }]

function EquipmentImage({ item, fallbackIcon, className }: { item: EquipmentItem | undefined; fallbackIcon: IconName; className?: string }) {
  const path = item ? equipmentAssetPath(item) : null
  return path ? <PixelAsset className={className ?? 'equipment-image'} src={path} alt="" /> : <Icon name={fallbackIcon} size="large" />
}

function ItemDetail({ item, player, readOnly, onClose, onChange }: { item: EquipmentItem; player: PlayerState; readOnly: boolean; onClose: () => void; onChange: (player: PlayerState) => void }) {
  const bonus = itemBonuses(item)
  const equipped = isEquipped(player, item.id)
  const comparableId = item.category === 'weapon' ? player.equipment.weapon : item.category === 'armor' ? player.equipment.armor : player.equipment.accessory1
  const current = player.inventory.find((candidate) => candidate.id === comparableId)
  const currentBonus = current ? itemBonuses(current) : { maxHp: 0, physical: 0, magic: 0 }
  const allowed = canEquip(player.job, item)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [chooseAccessory, setChooseAccessory] = useState(false)
  const equip = (slot?: 'accessory1' | 'accessory2') => { const next = equipItem(player, item.id, slot); onChange(next); onClose() }
  return <div className="modal-layer modal-layer--front"><Panel className="dialog-panel item-detail" role="dialog" aria-modal="true">
    <EquipmentImage item={item} fallbackIcon={item.category} className="item-detail__image" />
    <h2>{item.favorite ? '★ ' : ''}{item.name}</h2>
    <p>{SUBTYPE_LABELS[item.subtype]} / Lv.{item.level} / {RARITY_LABELS[item.rarity]}{item.testOnly ? ' / 開発テスト用' : ''}</p>
    <dl><div><dt>最大HP</dt><dd>{bonus.maxHp}（{bonus.maxHp - currentBonus.maxHp >= 0 ? '+' : ''}{bonus.maxHp - currentBonus.maxHp}）</dd></div><div><dt>物理</dt><dd>{bonus.physical}（{bonus.physical - currentBonus.physical >= 0 ? '+' : ''}{bonus.physical - currentBonus.physical}）</dd></div><div><dt>魔法</dt><dd>{bonus.magic}（{bonus.magic - currentBonus.magic >= 0 ? '+' : ''}{bonus.magic - currentBonus.magic}）</dd></div></dl>
    {item.specialEffect && <p>特殊効果：<SpecialEffectIcon effect={item.specialEffect} /> {item.specialEffect}</p>}{item.skills.length > 0 && <p>スキル：{item.skills.map((id) => SKILLS[id].name).join('、')}</p>}{!allowed && <p className="error-text">現在の職業では装備できません。</p>}
    {readOnly ? <p>探索中は閲覧のみです。</p> : <div className="item-actions"><button type="button" disabled={!allowed || equipped} onClick={() => item.category === 'accessory' && player.equipment.accessory1 && player.equipment.accessory2 ? setChooseAccessory(true) : equip()}>{equipped ? '装備中' : '装備する'}</button><button type="button" onClick={() => onChange(toggleFavorite(player, item.id))}>{item.favorite ? 'お気に入り解除' : 'お気に入り登録'}</button><button type="button" disabled={item.favorite || equipped} onClick={() => setConfirmDiscard(true)}>廃棄</button></div>}
    {chooseAccessory && <div className="slot-choice"><p>交換する枠を選択</p><button onClick={() => equip('accessory1')}>アクセサリー1</button><button onClick={() => equip('accessory2')}>アクセサリー2</button></div>}
    {confirmDiscard && <div className="slot-choice"><p>この装備を廃棄しますか？</p><button onClick={() => setConfirmDiscard(false)}>キャンセル</button><button onClick={() => { onChange(discardItem(player, item.id)); onClose() }}>廃棄する</button></div>}
    <button type="button" onClick={onClose}>閉じる</button>
  </Panel></div>
}

export function EquipmentScreen({ player, readOnly, onChange, onBack }: { player: PlayerState; readOnly: boolean; onChange: (player: PlayerState) => void; onBack: () => void }) {
  const [category, setCategory] = useState<EquipmentCategory>('weapon')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const items = sortAndFilterInventory(player, category, query)
  const selectedItem = player.inventory.find((item) => item.id === selected) ?? null
  return <AppShell>
    <ScreenHeader title="装備・所持品" subtitle={readOnly ? '探索中：閲覧のみ' : '町：装備を変更可能'} onBack={onBack} />
    <p className="screen-intro">獲得装備と開発テスト用装備を表示しています。試験用の装備は詳細に明記しています。</p>
    <div className="section-heading"><h2>現在の装備</h2></div>
    <div className="equipment-grid">{slots.map((slot) => { const equipped = player.inventory.find((item) => item.id === player.equipment[slot.id]); return <button type="button" className={`panel equipment-slot rarity-${equipped?.rarity ?? 'empty'}`} key={slot.id} disabled={readOnly || !equipped} onClick={() => onChange(unequipSlot(player, slot.id))}><EquipmentImage item={equipped} fallbackIcon={slot.icon} /><small>{slot.label}</small><strong>{equipped?.name ?? 'なし'}</strong>{!readOnly && equipped && <em>タップで解除</em>}</button> })}</div>
    <div className="section-heading inventory-heading"><h2>所持品</h2><span className="item-count">{player.inventory.length} items</span></div>
    <input className="inventory-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名前で検索" aria-label="装備名検索" />
    <div className="category-tabs" role="tablist">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={category === tab.id} className={category === tab.id ? 'is-active' : ''} onClick={() => setCategory(tab.id)}>{tab.label}</button>)}</div>
    <div className="inventory-list">{items.map((item) => <button type="button" className={`panel inventory-item rarity-${item.rarity}`} key={item.id} onClick={() => setSelected(item.id)}><EquipmentImage item={item} fallbackIcon={item.category} className="inventory-item__image" /><strong>{item.favorite ? '★ ' : ''}{item.name}</strong><span>Lv.{item.level} {RARITY_LABELS[item.rarity]}</span><small>{isEquipped(player, item.id) ? '装備中' : canEquip(player.job, item) ? '装備可能' : '装備不可'}</small></button>)}</div>
    {selectedItem && <ItemDetail item={selectedItem} player={player} readOnly={readOnly} onClose={() => setSelected(null)} onChange={onChange} />}
  </AppShell>
}
