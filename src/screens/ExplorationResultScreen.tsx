import { AppShell, Panel } from '../components/Ui'

export function ExplorationResultScreen({ turn, onTown }: { turn: number; onTown: () => void }) {
  return (
    <AppShell className="result-screen">
      <p className="eyebrow">TEST EXPLORATION RESULT</p>
      <h1>探索結果</h1>
      <Panel className="result-panel">
        <strong className="result-kind">任意帰還</strong>
        <dl><div><dt>到達階</dt><dd>1階</dd></div><div><dt>経過ターン</dt><dd>{turn}</dd></div><div><dt>経験値獲得</dt><dd>0</dd></div><div><dt>獲得装備</dt><dd>なし</dd></div></dl>
        <p>テスト探索のため、報酬や探索記録は保存されません。</p>
      </Panel>
      <button type="button" className="primary-button result-town-button" onClick={onTown}>町へ戻る</button>
    </AppShell>
  )
}
