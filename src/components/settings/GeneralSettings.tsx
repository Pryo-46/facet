import type { Theme } from '@/core/settings'
import type { SettingsPanelProps } from './types'

const THEME_LABELS: readonly { value: Theme; label: string }[] = [
  { value: 'light', label: 'ライト' },
  { value: 'dark', label: 'ダーク' },
  { value: 'system', label: 'システムに合わせる' },
]

/**
 * 見た目の設定。
 *
 * **ラジオはネイティブを使う。** `TableCopyDialog` と同じ理由で、インラインで
 * 完結する入力に `<select>` を避ける動機は当たらない
 */
export function GeneralSettings({ settings, onChange }: SettingsPanelProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm text-ink-muted">テーマ</legend>
      {THEME_LABELS.map(({ value, label }) => (
        <label key={value} className="flex items-center gap-2 text-base text-ink">
          <input
            type="radio"
            name="theme"
            value={value}
            checked={settings.theme === value}
            onChange={() => onChange({ ...settings, theme: value })}
          />
          {label}
        </label>
      ))}
    </fieldset>
  )
}
