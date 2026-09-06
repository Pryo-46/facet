import { CircleAlert } from 'lucide-react'
import type { MissingTally as Tally } from '@/core/missing-tally'
import { TALLY_TOTAL_LABEL } from '@/core/missing-tally'
import { badgeClass } from './badge-styles'

/**
 * 欠落の集計の帯（docs/missing-semantics.md 規約4）。
 * 課題ツリーの「⚠ 要対応 N ＋内訳チップ」を部品化したもの。
 * 部品はモジュールの語彙を知らない——語（label）と鍵（kind）は tally が運ぶ。
 *
 * キャンバスの帯（pointer-events-none）に置かれる前提で、チップだけ
 * pointer-events-auto に戻す（IssueTreeEditor の CHIP_BASE と同じ理由）。
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
      className={`pointer-events-none flex items-center gap-2 whitespace-nowrap text-base text-ink-muted${
        props.className === undefined ? '' : ` ${props.className}`
      }`}
    >
      <span className="flex items-center gap-1">
        {/* `⚠` の絵文字は使わない。OS のカラー絵文字は色が
            rev 9章「色を持つのは意味だけ」の管理の外にあり、SVG なら欠落軸の
            `text-missing` を明示できる。**`tallyLine`（Skill が端末に出す
            文字列）は `⚠` のまま**——端末に SVG は出せない。0 件はアイコンも
            出さない（`⚠` を付けない流儀と同じ）。大きさは帯の文字（text-base
            16px）に合わせて size-4 */}
        {tally.total > 0 && (
          <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-missing" />
        )}
        {`${TALLY_TOTAL_LABEL} ${tally.total}`}
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
