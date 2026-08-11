import { useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { normalizeForMatch } from '@/core/normalize'

export interface ActorRefCellProps {
  value: string | undefined
  actors: readonly { id: string; name: string }[]
  invalid: boolean
  'aria-label': string
  'data-cell': string
  onSelect: (actorId: string) => void
  onCreate: (name: string) => void
  onFieldKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>, state: FieldState) => void
}

/**
 * from / to の参加者参照セル（design-notes 論点9）。
 *
 * - 表示は参照先の名前（参照切れは空表示＋赤）
 * - ↑↓＝actors 配列順の即時切替（arrowsOwnedByField: true として扱われる前提。
 *   ドロップダウンは出さない——会議の速度でリストを目で追わせない）
 * - 文字を打つとドラフトになり、blur / Tab / Enter で確定:
 *   正規化一致（normalizeForMatch。照合規則はアプリで1つ）→ その参加者
 *   ／前方一致が1人 → その参加者／未登録名 → onCreate（インライン追加）
 *   ／空 → 変更なし（元の表示に戻す）
 * - IME 変換中は候補切替しない（rev 10章）
 *
 * CellInput を使わないのは、value が「テキスト」ではなく「参照」であり、
 * ドラフト確定の規則（照合・新規作成）が CellInput の commit と別物のため。
 * IME 対応（変換中は確定しない）はこの部品が自前で持つ
 */
export function ActorRefCell(props: ActorRefCellProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const resolved = props.actors.find((a) => a.id === props.value)?.name ?? ''

  const commit = (): void => {
    if (draft === null) return
    setDraft(null)
    if (draft === '') return
    const needle = normalizeForMatch(draft)
    const exact = props.actors.find((a) => normalizeForMatch(a.name) === needle)
    if (exact !== undefined) {
      props.onSelect(exact.id)
      return
    }
    const prefix = props.actors.filter((a) => normalizeForMatch(a.name).startsWith(needle))
    if (prefix.length === 1) {
      props.onSelect(prefix[0].id)
      return
    }
    props.onCreate(draft)
  }

  const cycle = (delta: -1 | 1): void => {
    if (props.actors.length === 0) return
    const at = props.actors.findIndex((a) => a.id === props.value)
    const next = (at + delta + props.actors.length) % props.actors.length
    setDraft(null)
    props.onSelect(props.actors[next].id)
  }

  const face = props.invalid
    ? 'border-warning bg-warning/20'
    : 'border-rule bg-surface'

  return (
    <input
      className={`w-full rounded-sm border px-1.5 py-0.5 text-sm text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring ${face}`}
      aria-label={props['aria-label']}
      data-cell={props['data-cell']}
      value={draft ?? resolved}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        const composing =
          (e.nativeEvent as { isComposing?: boolean }).isComposing ??
          (e as unknown as { isComposing?: boolean }).isComposing ??
          false
        if (!composing && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          cycle(e.key === 'ArrowUp' ? -1 : 1)
          return
        }
        if (!composing && (e.key === 'Enter' || e.key === 'Tab')) {
          const hadDraft = draft !== null
          commit()
          // **ドラフトの確定と「次のステップを足す」を同じ打鍵で起こさない。**
          // ここで親へ委譲すると、操作言語が Enter を insert-item-after と読み、
          // エディタが commit() の onSelect / onCreate より**古い data**から
          // 追加を作って直前の変更を上書きする。未登録名のときは、
          // インライン作成した参加者ごと消える（実測で再現）。
          // Tab は欄を移るだけでデータを触らないので、従来どおり委譲する
          if (hadDraft && e.key === 'Enter') {
            e.preventDefault()
            return
          }
        }
        const el = e.currentTarget
        props.onFieldKeyDown?.(e, {
          empty: el.value === '',
          caretAtStart: el.selectionStart === 0 && el.selectionEnd === 0,
          caretAtEnd:
            el.selectionStart === el.value.length && el.selectionEnd === el.value.length,
        })
      }}
      onBlur={commit}
    />
  )
}
