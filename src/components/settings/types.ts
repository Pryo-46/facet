import type { AppSettings } from '@/core/settings'

/** 設定のパネルはどれもこの形。`SETTINGS_TABS` の `Panel` がこれを取る */
export interface SettingsPanelProps {
  settings: AppSettings
  /** 値が変わるたび呼ぶ。保存はダイアログの呼び手が行う */
  onChange: (next: AppSettings) => void
}
