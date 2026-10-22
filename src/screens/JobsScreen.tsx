import { Icon, type IconName } from '../components/Icon'
import { AppShell, Panel, PlannedBadge, ScreenHeader } from '../components/Ui'
import { initialPlayerView, jobs } from '../data/presentation'

export function JobsScreen({ onBack }: { onBack: () => void }) {
  return (
    <AppShell>
      <ScreenHeader title="職業変更" subtitle={`現在の職業：${initialPlayerView.job}`} onBack={onBack} />
      <p className="screen-intro">職業の変更処理と装備制限の適用は今後実装予定です。</p>
      <div className="job-list">
        {jobs.map((job) => {
          const unlocked = initialPlayerView.level >= job.unlockLevel
          const current = job.name === initialPlayerView.job
          return (
            <Panel className={`job-card ${unlocked ? '' : 'is-locked'}`} key={job.name}>
              <div className="job-icon"><Icon name={job.icon as IconName} size="large" /></div>
              <div className="job-copy">
                <div><h2>{job.name}</h2>{current && <span className="current-badge">現在</span>}</div>
                <p>{unlocked ? job.feature : `Lv.${job.unlockLevel}で解放`}</p>
              </div>
              <div className="job-action">{unlocked ? <PlannedBadge /> : <Icon name="lock" />}</div>
              <button type="button" disabled>{current ? '選択中' : unlocked ? '変更（今後実装予定）' : `Lv.${job.unlockLevel}が必要`}</button>
            </Panel>
          )
        })}
      </div>
    </AppShell>
  )
}
