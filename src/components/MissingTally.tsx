import type { MissingTally as Tally } from '@/core/missing-tally'
import { TALLY_TOTAL_LABEL } from '@/core/missing-tally'
import { badgeClass } from './badge-styles'

/**
 * 欠落の集計の帯（M22。docs/missing-semantics.md 規約4）。
 * 課題ツリーの「⚠ 要対応 N ＋内訳チップ」を部品化したもの。
 * 部品はモジュールの語彙を知らない——語（label）と鍵（kind）は tally が運ぶ。
 *
 * キャンバスの帯（pointer-events-none）に置かれる前提で、チップだけ
 * pointer-events-auto に戻す（M22 前の IssueTreeEditor の CHIP_BASE と同じ理由）。
 * 0 件の内訳はチップを描かない——押しても行き先が無いボタンを置かない
 */
export function MissingTally(props: {
  tally: Tally
  /** あれば内訳が押せるチップになる。引数は part.kind */
  onJump?: (kind: string) => void
  className?: string
}) {
  const { tally, onJump } = props
  return (
    <div
      className={`pointer-events-none flex items-center gap-2 whitespace-nowrap text-sm text-ink-muted${
        props.className === undefined ? '' : ` ${props.className}`
      }`}
    >
      <span>
        {tally.total === 0 ? `${TALLY_TOTAL_LABEL} 0` : `⚠ ${TALLY_TOTAL_LABEL} ${tally.total}`}
      </span>
      {tally.parts.map((p) =>
        p.count === 0 ? null : onJump === undefined ? (
          <span key={p.kind} className={badgeClass(p.variant)}>{`${p.label} ${p.count}`}</span>
        ) : (
          <button
            key={p.kind}
            type="button"
            className={`pointer-events-auto transition-colors ${badgeClass(p.variant)}`}
            aria-label={`次の${p.label}へ`}
            onClick={() => onJump(p.kind)}
          >
            {`${p.label} ${p.count}`}
          </button>
        ),
      )}
    </div>
  )
}
