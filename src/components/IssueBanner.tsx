import { useState } from 'react'
import { buttonBase } from '@/components/button-styles'
import type { ConsistencyIssue } from '@/core/consistency'

/**
 * 整合性検証の指摘一覧（rev 5章「問題は防ぐものではなく赤く見せるもの」の出口）。
 *
 * **指摘を画面に出すのは額縁の仕事で、モジュールではない**（rev 6章）。
 * M13 以前は4つのエディタと額縁の計5箇所が同じ `<ul>` を持っており、
 * 面も余白もばらついていた。さらにキャンバス系（シーケンス・ロジックツリー）は
 * 絶対配置の帯の中に置いていたため、指摘が増えるほど図を覆った。
 * ここに一本化し、通常フローに置くことで「増えたぶんキャンバスが下がる」に変わる
 */
export interface IssueBannerProps {
  issues: readonly ConsistencyIssue[]
  /** 置き場所は呼び出し側が決める（この部品はレイアウトを持たない） */
  className?: string
}

/**
 * 畳まずに見せる件数。**これを超えたぶんだけを畳む**（4件目以降が「他 N 件」）。
 * 3件までは全部見えるので、よくある1〜2件の指摘では開閉の操作が要らない
 */
export const ISSUE_PREVIEW_COUNT = 3

export function IssueBanner({ issues, className = '' }: IssueBannerProps) {
  const [expanded, setExpanded] = useState(false)
  if (issues.length === 0) return null
  const hidden = issues.length - ISSUE_PREVIEW_COUNT
  const shown = expanded || hidden <= 0 ? issues : issues.slice(0, ISSUE_PREVIEW_COUNT)
  return (
    <div className={`border-b border-rule bg-surface px-6 py-2 ${className}`}>
      <ul className="list-disc pl-4 text-sm text-warning">
        {shown.map((issue, i) => (
          <li key={`${issue.rule}-${i}`}>{issue.message}</li>
        ))}
      </ul>
      {/* **件数を出す。** 「他 N 件」と言われないと、畳まれていること自体に
          気づけない（赤が出ているファイルほど残りが知りたい） */}
      {hidden > 0 && (
        <button
          type="button"
          className={`${buttonBase} mt-1 text-xs text-ink-muted underline`}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '折りたたむ' : `他 ${hidden} 件を表示`}
        </button>
      )}
    </div>
  )
}
