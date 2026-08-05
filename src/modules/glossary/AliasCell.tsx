import { useEffect, useRef, useState } from 'react'
import { CellInput, type FieldState } from '@/components/CellInput'
import { resolveCommand, toKeyEventLike } from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import { insertAt, moveItem, removeAt } from '@/core/list-ops'
import { splitPastedAliases } from './alias-paste'

const PLATFORM = currentPlatform()

const aliasInput =
  'w-full bg-transparent px-2 py-1 text-ink outline-none focus:bg-surface rounded-sm'

export interface AliasCellProps {
  aliases: string[]
  onAliasesChange: (next: string[]) => void
  /** 閉じているときのセルの data-cell 属性値（フォーカス移動が引く） */
  cellId: string
  /** aria-label（例: 別名（1行目）） */
  label: string
  /** 導出表示中は並び替えを止める（行と同じ規則を別名にも適用する） */
  reorderEnabled: boolean
  /** 閉じている状態で受けたキーを行の操作言語へ渡す */
  onClosedKeyDown: (e: React.KeyboardEvent) => void
  /** パネルを Tab / Shift+Tab で抜けたとき、隣のセルへフォーカスを移す */
  onLeave: (direction: 1 | -1) => void
}

/**
 * 別名セル。フォーカスが入ると1行1別名のパネルが開く。
 *
 * - パネル内も行と同じ resolveCommand を使う（Enter＝別名を1件追加、
 *   空欄 Backspace＝削除、↑↓＝別名間移動、Alt+↑↓＝並び替え）。
 *   共通モジュールに一元化した操作言語が、入れ子のリストでも動くことの実証
 * - パネルは Radix の Popover を使わず素の絶対配置。フォーカスと矢印キーの
 *   制御を自前の操作言語に一本化し、モーダル境界規則を発火させないため
 * - 空行は draft（ローカル状態）でだけ持つ。aliases の要素はスキーマで
 *   minLength 1 なので、空文字をデータに載せてはいけない
 */
export function AliasCell(props: AliasCellProps) {
  const { aliases, onAliasesChange, cellId, label, reorderEnabled, onClosedKeyDown, onLeave } = props
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const cellButtonRef = useRef<HTMLButtonElement>(null)
  const [pendingFocus, setPendingFocus] = useState<number | null>(null)
  // 構造操作の直後は要素の入れ替えで一瞬フォーカスが外れる。そこで閉じない
  const keepOpen = useRef(false)
  // Esc で閉じた直後、セルにフォーカスが戻っても開き直さない
  const suppressOpen = useRef(false)
  // 自分が上げた変更かどうかの判定用（外部変更ならドラフトを作り直す）
  const lastApplied = useRef<string[] | null>(null)
  const [seenAliases, setSeenAliases] = useState(aliases)

  if (aliases !== seenAliases) {
    setSeenAliases(aliases)
    if (open && aliases !== lastApplied.current) {
      setDraft(aliases.length > 0 ? [...aliases] : [''])
    }
  }

  useEffect(() => {
    if (pendingFocus === null) return
    // パネル内の入力欄は CellInput の data-cell 属性（alias-N）で引く
    panelRef.current?.querySelector<HTMLElement>(`[data-cell="alias-${pendingFocus}"]`)?.focus()
    setPendingFocus(null)
    keepOpen.current = false
  }, [pendingFocus])

  useEffect(() => {
    if (open || !suppressOpen.current) return
    cellButtonRef.current?.focus()
  }, [open])

  const focusAlias = (index: number) => {
    keepOpen.current = true
    setPendingFocus(index)
  }

  const openPanel = () => {
    if (open) return
    setDraft(aliases.length > 0 ? [...aliases] : [''])
    setOpen(true)
    focusAlias(0)
  }

  /** draft を更新し、空要素を除いたものをデータへ上げる */
  const apply = (next: string[]) => {
    setDraft(next)
    const cleaned = next.map((s) => s.trim()).filter((s) => s !== '')
    lastApplied.current = cleaned
    onAliasesChange(cleaned)
  }

  const closeAndFocusCell = () => {
    suppressOpen.current = true
    setOpen(false)
  }

  const onAliasKeyDown = (e: React.KeyboardEvent, index: number, state: FieldState) => {
    const cmd = resolveCommand(toKeyEventLike(e), {
      platform: PLATFORM,
      modalOpen: false,
      editing: true,
      fieldEmpty: state.empty,
      // パネル内はどの欄も空欄 Backspace でその別名を消せる
      deletableField: true,
      caretAtStart: state.caretAtStart,
      caretAtEnd: state.caretAtEnd,
      arrowsOwnedByField: false,
      reorderEnabled,
    })
    if (cmd === null) return
    switch (cmd) {
      case 'insert-item-after':
        apply(insertAt(draft, index + 1, ''))
        focusAlias(index + 1)
        break
      case 'delete-item':
        apply(removeAt(draft, index))
        focusAlias(Math.max(0, index - 1))
        break
      case 'move-item-up':
        if (index === 0) return
        apply(moveItem(draft, index, index - 1))
        focusAlias(index - 1)
        break
      case 'move-item-down':
        if (index === draft.length - 1) return
        apply(moveItem(draft, index, index + 1))
        focusAlias(index + 1)
        break
      case 'focus-prev':
        if (index === 0) return
        focusAlias(index - 1)
        break
      case 'focus-next':
        if (index === draft.length - 1) return
        focusAlias(index + 1)
        break
      case 'focus-next-field':
        setOpen(false)
        onLeave(1)
        break
      case 'focus-prev-field':
        setOpen(false)
        onLeave(-1)
        break
      case 'cancel':
        closeAndFocusCell()
        break
      default:
        // undo / redo は額縁のグローバル層が取る
        return
    }
    e.preventDefault()
  }

  if (!open) {
    return (
      <button
        ref={cellButtonRef}
        type="button"
        data-cell={cellId}
        aria-label={label}
        className="flex w-full flex-wrap gap-1 rounded-sm px-2 py-1 text-left outline-none focus:bg-surface"
        onFocus={() => {
          if (suppressOpen.current) {
            suppressOpen.current = false
            return
          }
          openPanel()
        }}
        onClick={openPanel}
        onKeyDown={onClosedKeyDown}
      >
        {aliases.length === 0 ? (
          <span className="text-ink-muted">別名なし</span>
        ) : (
          aliases.map((alias, i) => (
            <span key={`${alias}-${i}`} className="rounded-sm bg-surface px-1 text-ink">
              {alias}
            </span>
          ))
        )}
      </button>
    )
  }

  return (
    <div className="relative">
      <div
        ref={panelRef}
        className="absolute left-0 top-0 z-10 w-56 rounded-sm border border-rule bg-canvas p-1 shadow-lg"
        onBlur={(e) => {
          if (keepOpen.current) return
          if (e.relatedTarget instanceof Node && panelRef.current?.contains(e.relatedTarget)) return
          setOpen(false)
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text')
          const parts = splitPastedAliases(text)
          if (parts.length <= 1) return // 単一の別名は通常の貼り付けに任せる
          e.preventDefault()
          const target = e.target as HTMLElement
          const index = draft.findIndex(
            (_, i) => target.getAttribute?.('data-cell') === `alias-${i}`,
          )
          const at = index < 0 ? draft.length - 1 : index
          // 貼り付け先の欄を先頭の別名で置き換え、残りを直後に差し込む
          const next = [...draft]
          next.splice(at, 1, ...parts)
          apply(next)
          focusAlias(at + parts.length - 1)
        }}
      >
        {draft.map((alias, i) => (
          <CellInput
            key={i}
            className={aliasInput}
            aria-label={`別名${i + 1}`}
            data-cell={`alias-${i}`}
            placeholder="別名を入力"
            value={alias}
            onValueChange={(v) => apply(draft.map((a, j) => (j === i ? v : a)))}
            onFieldKeyDown={(e, s) => onAliasKeyDown(e, i, s)}
          />
        ))}
        <p className="px-2 py-1 text-xs text-ink-muted">
          Enter＝追加／空欄 Backspace＝削除／Esc＝閉じる
        </p>
      </div>
    </div>
  )
}
