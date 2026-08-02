/**
 * 修飾キーのプラットフォーム抽象（rev 10章）。
 * 各コンポーネントは Ctrl を直接見ない——Tauri は macOS でも動くため、
 * Ctrl 直書きだと macOS で Undo が効かない。
 */
export type Platform = 'mac' | 'other'

export interface ModifierState {
  ctrlKey: boolean
  metaKey: boolean
}

export function detectPlatform(userAgent: string): Platform {
  return /Mac|iPhone|iPad|iPod/i.test(userAgent) ? 'mac' : 'other'
}

/** 実行環境のプラットフォーム。navigator が無い環境（テストの node）では 'other' */
export function currentPlatform(): Platform {
  return typeof navigator === 'undefined' ? 'other' : detectPlatform(navigator.userAgent)
}

/**
 * 主修飾キー（Windows/Linux: Ctrl、macOS: Cmd）が押されているか。
 * もう一方が同時に押されている組み合わせは別のキーストロークなので false
 */
export function isPrimaryModifier(e: ModifierState, platform: Platform): boolean {
  return platform === 'mac' ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
}

/** キーヒント表示用のラベル（UI に「Ctrl+Z」と出すため） */
export function primaryModifierLabel(platform: Platform): string {
  return platform === 'mac' ? 'Cmd' : 'Ctrl'
}

export function altModifierLabel(platform: Platform): string {
  return platform === 'mac' ? 'Option' : 'Alt'
}
