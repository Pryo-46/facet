export interface GhostSlotProps {
  /** 元の問いの汎用文言（下の GHOST_QUESTION_LABEL） */
  question: string
  /** 答えの表示テキスト。notApplicable で text 無しは '考慮不要' を渡す（M22） */
  text: string
  'aria-label': string
  x: number
  y: number
  labelWidth: number
  answerWidth: number
  height: number
  onDelete: () => void
}

/**
 * 立っていない問いへの答え（種別切替の残骸）のグレースロット（ブレスト決定4）。
 * 編集はさせない——立っていない問いに答えを「書き足す」のは矛盾の拡大で、
 * できるのは消すか、種別を戻して復活させるかの二択。削除の確認は
 * 呼び出し側（エディタ）が ConfirmDialog で行い、ここは onDelete を叩くだけ
 */
export function GhostSlot(props: GhostSlotProps) {
  return (
    <div
      className="pointer-events-auto absolute flex items-start gap-1"
      style={{ left: props.x, top: props.y, height: props.height }}
    >
      <div
        className="shrink-0 py-1 text-xs text-ink-muted line-through"
        style={{ width: props.labelWidth }}
      >
        {props.question}
      </div>
      <div
        className="whitespace-pre-wrap break-all rounded-sm border border-dashed border-rule bg-surface px-2 py-1 text-sm text-ink-muted"
        style={{ width: props.answerWidth, minHeight: props.height }}
      >
        {props.text}
      </div>
      <button
        type="button"
        className="shrink-0 rounded-sm border border-rule bg-surface px-1.5 py-0.5 text-xs text-ink-muted hover:bg-canvas focus:ring-2 focus:ring-inset focus:ring-ring"
        aria-label={props['aria-label']}
        onClick={props.onDelete}
      >
        ✕
      </button>
    </div>
  )
}
