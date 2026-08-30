import type { FocusTarget } from './commands'

/**
 * DOM 上のセルの識別子（`data-cell` の値）を作る**唯一の場所**。
 *
 * フォーカスの予約は `data-cell` で引く（`commands.ts` が返した `FocusTarget` を
 * 文字列に直し、描画後に `querySelector` で当てる）。**作る側（`HypothesisRow`）と
 * 引く側（`IssueTreeEditor`）が別々に文字列を組み立てると、片方だけ変えた瞬間に
 * 「予約したのに当たらない」が静かに起きる**——フォーカスが当たらないことを
 * 落ちるテストは無いので、気づくのは実機で打っているときになる。
 *
 * だから部品でもエディタでもない普通のモジュールに出してある（部品のファイルは
 * コンポーネントだけを export する制約があり、そこからは共有できない）。
 * **ここ以外で `hyp:` などの接頭辞を書かないこと。**
 */

/** 仮説の行（展開パネルを含む）の中の欄。`commands.ts` の `FocusTarget` と同じ名前で並べる */
export type HypothesisCell =
  | { cell: 'hypothesis' }
  | { cell: 'detail' }
  | { cell: 'value' }
  | { cell: 'ask'; askIndex: number }
  | { cell: 'feedback'; feedbackIndex: number }
  | { cell: 'event'; eventIndex: number }

/** 課題ノードの入力欄 */
export function issueCellKey(issueKey: string): string {
  return `issue:${issueKey}`
}

/**
 * 課題ノードの旗（見送り／解決）の理由の欄。**課題の文言とは別の鍵**——同じ箱の中に
 * 2つの入力欄があるので、1つの鍵で引くと予約したのに別の欄が掴まれる。
 *
 * **鍵に旗の種別を混ぜない。** 種別は同じ1つの欄の中身であって、別の席ではない
 *——混ぜると、見送りから解決へ差し替えた瞬間に予約した鍵が当たらなくなる
 */
export function issueEventCellKey(issueKey: string): string {
  return `issue-event:${issueKey}`
}

/**
 * 仮説の行の中の入力欄。**畳まれた行の `<button>` と、展開後の文言の
 * `<textarea>` は同じ鍵（`hyp:`）を名乗る**——エディタは行に着いた瞬間に
 * この鍵でフォーカスを予約し、展開後の DOM でそれを当てる。だから
 * `HypothesisRow` は2つを同時に描かない
 */
export function hypothesisCellKey(hypothesisKey: string, cell: HypothesisCell): string {
  switch (cell.cell) {
    case 'hypothesis':
      return `hyp:${hypothesisKey}`
    case 'detail':
      return `detail:${hypothesisKey}`
    case 'value':
      return `value:${hypothesisKey}`
    case 'ask':
      return `ask:${hypothesisKey}:${cell.askIndex}`
    case 'feedback':
      return `feedback:${hypothesisKey}:${cell.feedbackIndex}`
    case 'event':
      return `event:${hypothesisKey}:${cell.eventIndex}`
  }
}

/**
 * 編集結果の行き先（`FocusTarget`）を `data-cell` の値に直す。
 * **`FocusTarget` と1対1に対応させる。** 課題と仮説で配列が分かれているので、
 * ロジックツリーのように `computeRowKeys` 1本では足りず、両方の鍵を受け取る。
 *
 * **文字列は上の2つの関数に委ねる**——ここで組み立て直すと、それが
 * 「2つ目のコピー」になる（このファイルを作った理由そのもの）
 */
export function cellKey(
  target: FocusTarget,
  issueKeys: readonly string[],
  hypothesisKeys: readonly string[],
): string {
  switch (target.cell) {
    case 'issue':
      return issueCellKey(issueKeys[target.index])
    case 'issueEvent':
      return issueEventCellKey(issueKeys[target.index])
    case 'hypothesis':
      return hypothesisCellKey(hypothesisKeys[target.index], { cell: 'hypothesis' })
    case 'detail':
      return hypothesisCellKey(hypothesisKeys[target.index], { cell: 'detail' })
    case 'value':
      return hypothesisCellKey(hypothesisKeys[target.index], { cell: 'value' })
    case 'ask':
      return hypothesisCellKey(hypothesisKeys[target.index], {
        cell: 'ask',
        askIndex: target.askIndex,
      })
    case 'feedback':
      return hypothesisCellKey(hypothesisKeys[target.index], {
        cell: 'feedback',
        feedbackIndex: target.feedbackIndex,
      })
    case 'event':
      return hypothesisCellKey(hypothesisKeys[target.index], {
        cell: 'event',
        eventIndex: target.eventIndex,
      })
  }
}
