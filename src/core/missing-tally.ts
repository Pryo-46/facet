/**
 * 欠落（未決）の集計の共通形（M22。docs/missing-semantics.md）。
 *
 * 判定と集計は各モジュールの missing.ts（課題ツリーは derive.ts）が持ち、
 * 戻り値だけをこの形に揃える。表示は components/MissingTally.tsx。
 *
 * **課題ツリーの derive.ts は同じ文字列を自前で組み立てる**（同梱 Skill の
 * バイト一致コピーが値 import を持てないため）。両者の一致は
 * derive.test.ts が機械検査する——どちらかを変えるときは必ず両方
 */
export interface MissingTallyPart {
  /** モジュール固有の鍵。MissingTally 部品の onJump に渡る */
  kind: string
  /** 画面と Skill の報告が出す語 */
  label: string
  count: number
  /** バッジの見た目。open＝破線（まだ見ていない）／hold＝実線（保留）／pending＝青（着信） */
  variant: 'open' | 'hold' | 'pending'
}

export interface MissingTally {
  total: number
  /** count 0 の part は入れないのが行儀だが、tallyLine は入っていても出さない */
  parts: MissingTallyPart[]
}

export const TALLY_TOTAL_LABEL = '要対応'

/** 集計の1行。課題ツリーの帯・Skill の報告と逐語で同じ形（derive.ts の tallyLine と一致） */
export function tallyLine(t: MissingTally): string {
  if (t.total === 0) return `${TALLY_TOTAL_LABEL} 0`
  const parts = t.parts.filter((p) => p.count > 0).map((p) => `${p.label} ${p.count}`)
  return `⚠ ${TALLY_TOTAL_LABEL} ${t.total}（${parts.join(' ／ ')}）`
}
