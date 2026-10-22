import { useState } from 'react'
import { Icon } from '../components/Icon'
import { AppShell, Panel, ScreenHeader } from '../components/Ui'

function VolumeControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="volume-control">
      <span><Icon name="volume" /><strong>{label}</strong><output>{value}%</output></span>
      <input type="range" min="0" max="100" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <span className="range-labels"><small>OFF</small><small>MAX</small></span>
    </label>
  )
}

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const [bgmVolume, setBgmVolume] = useState(70)
  const [seVolume, setSeVolume] = useState(70)
  return (
    <AppShell>
      <ScreenHeader title="設定" subtitle="サウンド設定" onBack={onBack} />
      <Panel className="settings-panel">
        <VolumeControl label="BGM音量" value={bgmVolume} onChange={setBgmVolume} />
        <VolumeControl label="効果音音量" value={seVolume} onChange={setSeVolume} />
      </Panel>
      <Panel className="notice-panel">
        <Icon name="settings" />
        <div><strong>一時設定です</strong><p>音声再生と設定の保存はまだ実装されていません。再読み込みすると70%に戻ります。</p></div>
      </Panel>
    </AppShell>
  )
}
