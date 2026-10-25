import { useState } from 'react'
import { equipmentAssetPath } from '../assets'
import { Icon, type IconName } from '../components/Icon'
import { PixelAsset } from '../components/PixelAsset'
import { SkillIcon } from '../components/SkillIcon'
import { SpecialEffectIcon } from '../components/SpecialEffectIcon'
import { AppShell, Panel, ScreenHeader } from '../components/Ui'
import { SUBTYPE_LABELS, availableSkillLevel, availableSkills, availableSpecialEffects, canEquip, discardItem, equipItem, isEquipped, itemBonuses, skillEnabled, specialEffectEnabled, toggleFavorite, toggleSkillEnabled, toggleSpecialEffectEnabled, unequipSlot, type EquipmentCategory, type EquipmentItem, type EquipmentSlots, type PlayerState, type SkillId, type SpecialEffectId } from '../game/player'
import { filterInventory, type InventoryFilter, type InventorySort } from '../game/inventoryView'
import { EFFECT_LABELS, describeSpecialEffect } from '../game/effectLevels'
import { SKILLS, describeSkill } from '../game/skills'

const tabs: Array<{ id: EquipmentCategory; label: string }> = [{ id: 'weapon', label: '武器' }, { id: 'armor', label: '防具' }, { id: 'accessory', label: 'アクセサリー' }]
const slots: Array<{ id: keyof EquipmentSlots; label: string; icon: IconName }> = [{ id: 'weapon', label: '武器', icon: 'weapon' }, { id: 'armor', label: '防具', icon: 'armor' }, { id: 'accessory1', label: 'アクセサリー 1', icon: 'accessory' }, { id: 'accessory2', label: 'アクセサリー 2', icon: 'accessory' }]

function EquipmentImage({ item, fallbackIcon, className }: { item: EquipmentItem | undefined; fallbackIcon: IconName; className?: string }) {
  const path = item ? equipmentAssetPath(item) : null
  return path ? <PixelAsset className={className ?? 'equipment-image'} src={path} fallbackIcon={fallbackIcon} fallbackSize="large" alt="" /> : <Icon name={fallbackIcon} size="large" />
}

export function ItemDetail({ item, player, readOnly, inspectionOnly = false, onClose, onChange }: { item: EquipmentItem; player: PlayerState; readOnly: boolean; inspectionOnly?: boolean; onClose: () => void; onChange: (player: PlayerState) => void }) {
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
    <p>{SUBTYPE_LABELS[item.subtype]} / Lv.{item.level}{item.testOnly ? ' / 開発テスト用' : ''}</p>
    <dl><div><dt>最大HP</dt><dd>{bonus.maxHp}（{bonus.maxHp - currentBonus.maxHp >= 0 ? '+' : ''}{bonus.maxHp - currentBonus.maxHp}）</dd></div><div><dt>物理</dt><dd>{bonus.physical}（{bonus.physical - currentBonus.physical >= 0 ? '+' : ''}{bonus.physical - currentBonus.physical}）</dd></div><div><dt>魔法</dt><dd>{bonus.magic}（{bonus.magic - currentBonus.magic >= 0 ? '+' : ''}{bonus.magic - currentBonus.magic}）</dd></div></dl>
    {item.specialEffect && <p>特殊効果：<SpecialEffectIcon effect={item.specialEffect} /> {EFFECT_LABELS[item.specialEffect]} Lv.{item.specialEffectLevel ?? 1}<small className="skill-effect-copy">{describeSpecialEffect(item.specialEffect, item.specialEffectLevel ?? 1)}</small></p>}{item.skills.length > 0 && <p>スキル：<span className="skill-inline-list">{item.skills.map((id) => <span key={id} className="skill-inline-item"><SkillIcon skillId={id} />{SKILLS[id].name} Lv.{item.skillLevels?.[id] ?? 1}<small className="skill-effect-copy">{describeSkill(id, item.skillLevels?.[id] ?? 1)} / CD {SKILLS[id].cooldown}</small></span>)}</span></p>}{!allowed && <p className="error-text">現在の職業では装備できません。</p>}
    {readOnly ? <p>探索中は閲覧のみです。</p> : inspectionOnly ? <p>鑑定結果</p> : <div className="item-actions"><button type="button" disabled={!allowed || equipped} onClick={() => item.category === 'accessory' && player.equipment.accessory1 && player.equipment.accessory2 ? setChooseAccessory(true) : equip()}>{equipped ? '装備中' : '装備する'}</button><button type="button" onClick={() => onChange(toggleFavorite(player, item.id))}>{item.favorite ? 'お気に入り解除' : 'お気に入り登録'}</button><button type="button" disabled={item.favorite || equipped} onClick={() => setConfirmDiscard(true)}>廃棄</button></div>}
    {chooseAccessory && <div className="slot-choice"><p>交換する枠を選択</p><button onClick={() => equip('accessory1')}>アクセサリー1</button><button onClick={() => equip('accessory2')}>アクセサリー2</button></div>}
    {confirmDiscard && <div className="slot-choice"><p>この装備を廃棄しますか？</p><button onClick={() => setConfirmDiscard(false)}>キャンセル</button><button onClick={() => { onChange(discardItem(player, item.id)); onClose() }}>廃棄する</button></div>}
    <button type="button" onClick={onClose}>閉じる</button>
  </Panel></div>
}

export function EquipmentScreen({ player, readOnly, onChange, onBack }: { player: PlayerState; readOnly: boolean; onChange: (player: PlayerState) => void; onBack: () => void }) {
  const [filter, setFilter] = useState<InventoryFilter>({ category: 'weapon', query: '', subtype: '', minLevel: null, maxLevel: null, hasSkill: false, hasEffect: false, skill: '', effect: '', favoritesOnly: false, sort: 'levelDesc' })
  const updateFilter = (change: Partial<InventoryFilter>) => setFilter((current) => ({ ...current, ...change }))
  const [selected, setSelected] = useState<string | null>(null)
  const items = filterInventory(player, filter)
  const selectedItem = player.inventory.find((item) => item.id === selected) ?? null
  const activeSkills = availableSkills(player)
  const activeEffects = availableSpecialEffects(player)
  const subtypeOptions = Object.entries(SUBTYPE_LABELS).filter(([id]) => filter.category === 'weapon' ? ['sword', 'spear', 'bow', 'shortStaff', 'longStaff'].includes(id) : filter.category === 'armor' ? ['heavyArmor', 'lightArmor', 'heavyRobe', 'lightRobe'].includes(id) : id === 'commonAccessory')
  return <AppShell>
    <ScreenHeader title="装備・所持品" subtitle={readOnly ? '探索中：閲覧のみ' : '町：装備を変更可能'} onBack={onBack} />
    <div className="section-heading"><h2>現在の装備</h2></div>
    <div className="equipment-grid">{slots.map((slot) => { const equipped = player.inventory.find((item) => item.id === player.equipment[slot.id]); return <button type="button" className="panel equipment-slot" key={slot.id} disabled={readOnly || !equipped} onClick={() => onChange(unequipSlot(player, slot.id))}>{equipped && <EquipmentImage item={equipped} fallbackIcon={slot.icon} />}<small>{slot.label}</small><strong>{equipped?.name ?? '未選択'}</strong>{equipped && <b className="inventory-item__level">Lv.{equipped.level}</b>}{equipped && <span className="equipment-slot__effects">{equipped.skills.map((id) => <span className="effect-badge" key={id} title={`スキル：${SKILLS[id].name} Lv.${equipped.skillLevels[id] ?? 1}`}><SkillIcon skillId={id} /><b>{equipped.skillLevels[id] ?? 1}</b></span>)}{equipped.specialEffect && <span className="effect-badge" title={`特殊効果：${EFFECT_LABELS[equipped.specialEffect]} Lv.${equipped.specialEffectLevel ?? 1}`}><SpecialEffectIcon effect={equipped.specialEffect} /><b>{equipped.specialEffectLevel ?? 1}</b></span>}</span>}{!readOnly && equipped && <em>タップで解除</em>}</button> })}</div>
    <section className="equipped-abilities" aria-label="発動スキル・特殊効果">
      <h2>発動スキル・特殊効果</h2>
      <h3>スキル</h3>
      <div className="equipped-abilities__list">{activeSkills.map((id) => { const enabled = skillEnabled(player, id); return <div className={`equipped-ability${enabled ? '' : ' is-off'}`} key={id}><SkillIcon skillId={id} /><span className="equipped-ability__name">{SKILLS[id].name} <b>Lv.{availableSkillLevel(player, id)}</b><small>{['smallHeal', 'largeHeal', 'dash', 'guard'].includes(id) ? '手動スキル' : '自動スキル'}</small></span><button type="button" className="equipped-ability__toggle" aria-label={`${SKILLS[id].name}を${enabled ? 'OFF' : 'ON'}にする`} aria-pressed={enabled} disabled={readOnly} onClick={() => onChange(toggleSkillEnabled(player, id))}>{enabled ? 'ON' : 'OFF'}</button></div> })}{activeSkills.length === 0 && <p>なし</p>}</div>
      <h3>特殊効果</h3>
      <div className="equipped-abilities__list">{activeEffects.map(({ id, level }) => { const enabled = specialEffectEnabled(player, id); return <div className={`equipped-ability${enabled ? '' : ' is-off'}`} key={id}><SpecialEffectIcon effect={id} /><span className="equipped-ability__name">{EFFECT_LABELS[id]} <b>Lv.{level}</b><small>特殊効果</small></span><button type="button" className="equipped-ability__toggle" aria-label={`${EFFECT_LABELS[id]}を${enabled ? 'OFF' : 'ON'}にする`} aria-pressed={enabled} disabled={readOnly} onClick={() => onChange(toggleSpecialEffectEnabled(player, id))}>{enabled ? 'ON' : 'OFF'}</button></div> })}{activeEffects.length === 0 && <p>なし</p>}</div>
    </section>
    <div className="section-heading inventory-heading"><h2>所持品</h2><span className="item-count">{player.inventory.length} items</span></div>
    <input className="inventory-search" value={filter.query} onChange={(event) => updateFilter({ query: event.target.value })} placeholder="名前で検索" aria-label="装備名検索" />
    <div className="category-tabs" role="tablist">{tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={filter.category === tab.id} className={filter.category === tab.id ? 'is-active' : ''} onClick={() => updateFilter({ category: tab.id, subtype: '' })}>{tab.label}</button>)}</div>
    <details className="inventory-filters"><summary>絞り込み・並び替え</summary><div className="inventory-filter-grid">
      <label>種類<select value={filter.subtype} onChange={(event) => updateFilter({ subtype: event.target.value })}><option value="">すべて</option>{subtypeOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>並び替え<select value={filter.sort} onChange={(event) => updateFilter({ sort: event.target.value as InventorySort })}><option value="levelDesc">Lv高い順</option><option value="levelAsc">Lv低い順</option><option value="statsDesc">能力値高い順</option><option value="statsAsc">能力値低い順</option><option value="skillLevel">スキル最高Lv順</option><option value="effectLevel">特殊効果最高Lv順</option><option value="newest">入手順（新）</option><option value="oldest">入手順（古）</option><option value="name">名前順</option></select></label>
      <label>最低Lv<input type="number" min="1" value={filter.minLevel ?? ''} onChange={(event) => updateFilter({ minLevel: event.target.value === '' ? null : Math.max(1, Number(event.target.value)) })} /></label>
      <label>最高Lv<input type="number" min="1" value={filter.maxLevel ?? ''} onChange={(event) => updateFilter({ maxLevel: event.target.value === '' ? null : Math.max(1, Number(event.target.value)) })} /></label>
      <label>特定スキル<select value={filter.skill} onChange={(event) => updateFilter({ skill: event.target.value as SkillId | '' })}><option value="">すべて</option>{Object.entries(SKILLS).map(([id, skill]) => <option key={id} value={id}>{skill.name}</option>)}</select></label>
      <label>特定特殊効果<select value={filter.effect} onChange={(event) => updateFilter({ effect: event.target.value as SpecialEffectId | '' })}><option value="">すべて</option>{Object.entries(EFFECT_LABELS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label><input type="checkbox" checked={filter.hasSkill} onChange={(event) => updateFilter({ hasSkill: event.target.checked })} /> スキルあり</label>
      <label><input type="checkbox" checked={filter.hasEffect} onChange={(event) => updateFilter({ hasEffect: event.target.checked })} /> 特殊効果あり</label>
      <label><input type="checkbox" checked={filter.favoritesOnly} onChange={(event) => updateFilter({ favoritesOnly: event.target.checked })} /> お気に入りのみ</label>
      <button type="button" onClick={() => setFilter({ category: filter.category, query: '', subtype: '', minLevel: null, maxLevel: null, hasSkill: false, hasEffect: false, skill: '', effect: '', favoritesOnly: false, sort: 'levelDesc' })}>条件をリセット</button>
    </div></details>
    <div className="inventory-list">{items.map((item) => <button type="button" className="panel inventory-item" key={item.id} onClick={() => setSelected(item.id)}><EquipmentImage item={item} fallbackIcon={item.category} className="inventory-item__image" /><strong>{item.favorite ? '★ ' : ''}{item.name}</strong><b className="inventory-item__level">Lv.{item.level}</b><small>{isEquipped(player, item.id) ? '装備中' : canEquip(player.job, item) ? '装備可能' : '装備不可'}</small>{(item.skills.length > 0 || item.specialEffect) && <span className="inventory-item__effects">{item.skills.length > 0 && <span className="effect-group" aria-label="スキル">技 {item.skills.map((id) => <span className="effect-badge" key={id} title={`${SKILLS[id].name} Lv.${item.skillLevels[id] ?? 1}`}><SkillIcon skillId={id} /><b>{item.skillLevels[id] ?? 1}</b></span>)}</span>}{item.specialEffect && <span className="effect-group" aria-label="特殊効果">特 <span className="effect-badge" title={`${EFFECT_LABELS[item.specialEffect]} Lv.${item.specialEffectLevel ?? 1}`}><SpecialEffectIcon effect={item.specialEffect} /><b>{item.specialEffectLevel ?? 1}</b></span></span>}</span>}</button>)}</div>
    {selectedItem && <ItemDetail item={selectedItem} player={player} readOnly={readOnly} onClose={() => setSelected(null)} onChange={onChange} />}
  </AppShell>
}
