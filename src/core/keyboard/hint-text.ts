/**
 * 操作ヒントの文字列（rev 10章の表示側）。
 *
 * **ヒントに `Ctrl` と直接書かないこと**——Tauri は macOS でも動くので、
 * 直書きは画面の上で嘘になる（キーの解釈側は `isPrimaryModifier` が
 * 既に抽象化しており、表示側だけが取り残されていた）。
 * プレースホルダの解決口はこの関数1つに閉じる
 */
import { altModifierLabel, primaryModifierLabel, type Platform } from './platform'

/** 操作ヒント1件。`keys` は `$mod`（Ctrl / Cmd）・`$alt`（Alt / Option）を含みうる */
export interface KeyHint {
  keys: string
  label: string
}

export function formatHintKeys(keys: string, platform: Platform): string {
  return keys
    .replace(/\$mod/g, primaryModifierLabel(platform))
    .replace(/\$alt/g, altModifierLabel(platform))
}
