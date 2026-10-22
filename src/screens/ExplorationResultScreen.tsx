import { AppShell, Panel } from '../components/Ui'

export function ExplorationResultScreen({ turn, experience, floor, startLevel, endLevel, resultKind, onTown }: { turn: number; experience: number; floor: number; startLevel: number; endLevel: number; resultKind: '任意帰還' | '探索失敗' | 'ダンジョンクリア'; onTown: () => void }) {
  return (
    <AppShell className="result-screen">
      <p className="eyebrow">EXPLORATION RESULT</p>
      <h1>探索結果</h1>
      <Panel className="result-panel">
        <strong className="result-kind">{resultKind}</strong>
        <dl><div><dt>到達階</dt><dd>{floor}階</dd></div><div><dt>経過ターン</dt><dd>{turn}</dd></div><div><dt>経験値獲得</dt><dd>{experience}</dd></div><div><dt>レベル</dt><dd>Lv.{startLevel} → Lv.{endLevel}</dd></div><div><dt>獲得装備</dt><dd>なし</dd></div></dl>
        <p>記録はアプリ起動中のみ保持されます。装備報酬と永続保存は未実装です。</p>
      </Panel>
      <button type="button" className="primary-button result-town-button" onClick={onTown}>町へ戻る</button>
    </AppShell>
  )
}
