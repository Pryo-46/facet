import type { AppSettings } from '@/core/settings'

/** 設定のパネルはどれもこの形。`SETTINGS_TABS` の `Panel` がこれを取る */
export interface SettingsPanelProps {
  settings: AppSettings
  /** 値が変わるたび呼ぶ。保存はダイアログの呼び手が行う */
  onChange: (next: AppSettings) => void
  /**
   * facet のプラグインを導入して有効にしているか。
   * 未導入なら、アプリの端末は同梱版を `--plugin-dir` で渡している
   */
  pluginInstalled: boolean
}
