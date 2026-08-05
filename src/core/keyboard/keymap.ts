import { isPrimaryModifier, type Platform } from './platform'

/**
 * 操作言語のコマンド（rev 10章）。各ツールは「意味の集合」を受け取り、
 * 自分の構造に写像する。キーの判定はこのモジュールの外に書かない。
 * 用語集は行のリストだが、別名パネル（入れ子のリスト）も同じ集合を使う
 */
export type Command =
  | 'undo'
  | 'redo'
  | 'cancel'
  | 'insert-item-after'
  | 'delete-item'
  | 'move-item-up'
  | 'move-item-down'
  | 'focus-prev'
  | 'focus-next'
  | 'focus-next-field'
  | 'focus-prev-field'

export interface KeyEventLike {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  /** IME 変換中か。true の間は操作言語の対象外（rev 10章） */
  isComposing: boolean
}

export interface KeyContext {
  platform: Platform
  /** モーダル表示中は操作言語を停止する（キーはモーダル側が取る） */
  modalOpen: boolean
  /** テキスト編集中か。矢印の扱いが変わる */
  editing: boolean
  /** 編集中の欄が空か（空欄 Backspace ＝削除の判定） */
  fieldEmpty: boolean
  /** 空欄 Backspace で要素の削除を認める欄か（用語集では名称セルのみ true） */
  deletableField: boolean
  /** キャレットが先頭／末尾にあるか（端でだけ行間移動に切り替える） */
  caretAtStart: boolean
  caretAtEnd: boolean
  /** 素の↑↓を欄自身が使うか（select は選択肢の切り替えに使う） */
  arrowsOwnedByField: boolean
  /** 並び替えが有効か。導出表示中は false（session-notes 論点4） */
  reorderEnabled: boolean
}

/**
 * キー入力を操作言語のコマンドに解決する。null＝アプリは関与しない
 *（既定動作を止めないこと）。
 *
 * 規則の順序に意味がある:
 *   1. IME 変換中は何も起こさない（日本語入力アプリ最大の地雷）
 *   2. モーダル表示中は停止（Esc の取り合いを構造的に排除）
 *   3. グローバル層（Undo/Redo）。テキスト編集中も操作言語が取る
 *   4. 構造依存層（階層・リスト系ファミリー標準）
 */
export function resolveCommand(e: KeyEventLike, ctx: KeyContext): Command | null {
  if (e.isComposing) return null
  if (ctx.modalOpen) return null

  if (isPrimaryModifier(e, ctx.platform)) {
    // 制御入力ではブラウザ標準の Undo が React の再レンダリングと食い違うため、
    // 編集中もアプリの履歴に一本化する（境界規則への明示的な例外）
    if (e.key === 'z' || e.key === 'Z') return e.shiftKey ? 'redo' : 'undo'
    // Windows/Linux のデファクトは Ctrl+Y も「やり直し」（rev 10章の拡張規則）。
    // macOS に Cmd+Y を Redo とする慣習は無いので割り当てない
    if (ctx.platform !== 'mac' && !e.shiftKey && (e.key === 'y' || e.key === 'Y')) return 'redo'
    // Ctrl+C / Ctrl+A などは奪わない
    return null
  }

  switch (e.key) {
    case 'Escape':
      return 'cancel'
    case 'Enter':
      return e.altKey || e.shiftKey ? null : 'insert-item-after'
    case 'Tab':
      if (e.altKey) return null
      return e.shiftKey ? 'focus-prev-field' : 'focus-next-field'
    case 'Backspace':
      if (e.altKey || e.shiftKey) return null
      return ctx.fieldEmpty && ctx.deletableField ? 'delete-item' : null
    case 'ArrowUp':
      if (e.altKey) return ctx.reorderEnabled ? 'move-item-up' : null
      if (e.shiftKey || ctx.arrowsOwnedByField) return null
      return !ctx.editing || ctx.caretAtStart ? 'focus-prev' : null
    case 'ArrowDown':
      if (e.altKey) return ctx.reorderEnabled ? 'move-item-down' : null
      if (e.shiftKey || ctx.arrowsOwnedByField) return null
      return !ctx.editing || ctx.caretAtEnd ? 'focus-next' : null
    default:
      return null
  }
}

/**
 * React の合成イベントと DOM の KeyboardEvent の差を吸収する。
 * React の合成イベントは isComposing を持たず nativeEvent 側にある
 */
export function toKeyEventLike(e: {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  isComposing?: boolean
  nativeEvent?: { isComposing?: boolean }
}): KeyEventLike {
  return {
    key: e.key,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
    isComposing: e.nativeEvent?.isComposing ?? e.isComposing ?? false,
  }
}
