import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { assetUrl } from '../assets'
import { Icon, type IconName } from './Icon'

export function AppShell({ children, className = '', ...mainProps }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <main className={`app-shell ${className}`} {...mainProps}>{children}</main>
}

export function ScreenHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <header className="screen-header">
      <button className="back-button" type="button" onClick={onBack} aria-label="前の画面へ戻る">
        <Icon name="back" size="large" />
      </button>
      <div>
        <p className="eyebrow">TOWN MENU</p>
        <h1>{title}</h1>
        {subtitle && <p className="header-subtitle">{subtitle}</p>}
      </div>
    </header>
  )
}

export function Panel({ children, className = '', ...sectionProps }: HTMLAttributes<HTMLElement>) {
  return <section className={`panel ${className}`} {...sectionProps}>{children}</section>
}

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  imageSrc?: string
  label: string
  detail?: string
}

export function ActionButton({ icon, imageSrc, label, detail, className = '', ...buttonProps }: ActionButtonProps) {
  return (
    <button type="button" className={`action-button ${className}`} {...buttonProps}>
      <span className="action-button__icon">{imageSrc ? <img src={imageSrc} alt="" /> : <Icon name={icon} size="large" />}</span>
      <span className="action-button__copy">
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {!buttonProps.disabled && <span className="action-button__chevron" aria-hidden="true"><img src={assetUrl('assets/arrows/arrow-right-16.png')} alt="" /></span>}
    </button>
  )
}

export function PlannedBadge() {
  return <span className="planned-badge">今後実装予定</span>
}
