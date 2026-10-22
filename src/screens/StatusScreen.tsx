import { Icon } from '../components/Icon'
import { AppShell, Panel, ScreenHeader } from '../components/Ui'
import { initialPlayerView as player } from '../data/presentation'

export function StatusScreen({ onBack, onOpenEquipment }: { onBack: () => void; onOpenEquipment: () => void }) {
  return (
    <AppShell>
      <ScreenHeader title="ステータス" subtitle="プレイヤー情報" onBack={onBack} />
      <Panel className="status-profile">
        <div className="avatar avatar--large"><Icon name="wanderer" size="large" /></div>
        <div><p className="eyebrow">CURRENT JOB</p><h2>{player.job}</h2><span>Lv.{player.level} 見習い冒険者</span></div>
      </Panel>
      <div className="stat-grid">
        <Panel className="stat-card stat-card--hp"><small>HP</small><strong>{player.hp} <span>/ {player.maxHp}</span></strong></Panel>
        <Panel className="stat-card"><small>物理攻撃力</small><strong>{player.physicalAttack}</strong></Panel>
        <Panel className="stat-card"><small>魔法攻撃力</small><strong>{player.magicAttack}</strong></Panel>
        <Panel className="stat-card"><small>プレイヤーレベル</small><strong>{player.level}</strong></Panel>
      </div>
      <Panel className="experience-panel">
        <div><strong>経験値</strong><span>{player.experience} / {player.experienceToNext}</span></div>
        <div className="progress-track"><span style={{ width: `${(player.experience / player.experienceToNext) * 100}%` }} /></div>
        <small>次のレベルまで {player.experienceToNext - player.experience}</small>
      </Panel>
      <button type="button" className="panel equipment-summary" onClick={onOpenEquipment}>
        <span className="section-heading"><strong>装備情報</strong><span>装備画面へ ›</span></span>
        <span><Icon name="weapon" /> {player.equipment.weapon}</span>
        <span><Icon name="armor" /> {player.equipment.armor}</span>
      </button>
      <Panel className="effects-panel"><h2>スキル・特殊効果</h2><div className="empty-inline"><Icon name="spark" /><span>現在有効なスキル・特殊効果はありません</span></div></Panel>
    </AppShell>
  )
}
