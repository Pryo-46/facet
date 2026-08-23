import type { IssueTreeSchemaVersion2 } from '@/types/issue-tree'
import type { FocusTarget } from './commands'
import type { PosedQuestions } from './derive'

/**
 * 「次の要対応へ」の巡回列（帯のチップが押されたときの行き先）。
 *
 * キャンバスを選んだ代償として、**開いている問いは平面に散らばる**——
 * アウトラインなら上から下へ舐めれば済むが、図では「あと何が残っているか」を
 * 数えられても、そこへ行く手段が無ければ数は読み上げにしかならない。
 * だから集計と同じ根（`poseQuestions` の結果）から、順序付きの行き先の列を作る。
 *
 * **問いの条件をここで書き直さないこと。** 見るのは `posed.issueNeedsHypothesis`
 * と `posed.hypothesisQuestions` だけで、`events.length === 0` のような判定は
 * 一切持たない——二度書いた瞬間、帯とキャンバスは別々の答えを出し始める
 *（片方だけ直したときに落ちるテストが無い種類のずれ）。
 */

/** 問いの4種。`QUESTION_LABELS` の鍵と同じ（文言はあちらから引く） */
export type OpenKind = 'hypothesis' | 'result' | 'hold' | 'judgement'

export interface OpenTarget {
  kind: OpenKind
  /** 行き先のセル。**課題の欄か仮説の文言の欄しか出さない**（詳細は展開してから見る） */
  focus: FocusTarget
}

/**
 * 要対応の並び。課題の DFS（＝`issues` の配列順。スキーマの規約で DFS 行きがけ順に
 * 整えられている）で、**課題自身の「仮説なし」→ その課題にぶら下がる仮説の問い**、
 * の順に並べる。
 *
 * **仮説を配列順で舐めるのではなく、課題ごとにまとめる。** 図の上で近くにあるもの
 * どうしが列でも隣り合うのが「次へ」の意味であり、配列は正規化で課題順に整うとはいえ
 * それに寄りかかると、手で編んだファイル（正規化を通っていない）で図と列が食い違う。
 *
 * 1つの仮説に複数の問いが立つ（保留のまま FB が残っている等）ときは
 * 未決 → 保留 → 未判断 の順。`tallyLine` の内訳の並びに合わせてある。
 *
 * **ぶら下がり先の課題が図に無い仮説は列に入らない。** そういう仮説はどの箱にも
 * 描かれておらず（参照切れは整合性検証が赤くする）、行き先にしても視点は動かない
 * ——動かないと次に押しても同じものが返り、巡回がそこで止まる。
 * 集計（`tallyQuestions`）はそれらも数えるので、**壊れたファイルでは
 * チップの数より列が短くなることがある**
 */
export function listOpenTargets(
  data: Pick<IssueTreeSchemaVersion2, 'issues' | 'hypotheses'>,
  posed: PosedQuestions,
): OpenTarget[] {
  /** 課題 ID → ぶら下がる仮説の添字（配列順） */
  const rowsOf = new Map<string, number[]>()
  data.hypotheses.forEach((h, index) => {
    rowsOf.set(h.issueId, [...(rowsOf.get(h.issueId) ?? []), index])
  })

  const out: OpenTarget[] = []
  // ID が重複しているファイル（受け入れて赤表示する）では同じ列が2度引ける。
  // 2度入れると巡回が同じ仮説を二度通り、チップの数（集計は1件と数える）とずれる
  const listed = new Set<number>()
  data.issues.forEach((node, index) => {
    if (posed.issueNeedsHypothesis[index]) {
      out.push({ kind: 'hypothesis', focus: { cell: 'issue', index } })
    }
    for (const hi of rowsOf.get(node.id) ?? []) {
      if (listed.has(hi)) continue
      listed.add(hi)
      const q = posed.hypothesisQuestions[hi]
      if (q === undefined) continue
      const focus: FocusTarget = { cell: 'hypothesis', index: hi }
      if (q.result) out.push({ kind: 'result', focus })
      if (q.hold) out.push({ kind: 'hold', focus })
      if (q.judgement) out.push({ kind: 'judgement', focus })
    }
  })
  return out
}

/** 行き先の同一性。**`cell` と `index` だけ**（この列に出るのは課題と仮説の2種） */
function sameFocus(a: FocusTarget, b: FocusTarget): boolean {
  return a.cell === b.cell && a.index === b.index
}

/**
 * `kind` で絞った列の中で `current` の次。**末尾なら先頭へ戻る**（押し続ければ
 * 一巡して戻ってくる＝「見落としが無い」ことが押すだけで分かる）。
 * `current` が列に無ければ先頭、列が空なら null（＝チップは描かれていない）
 */
export function nextOpenTarget(
  targets: readonly OpenTarget[],
  kind: OpenKind,
  current: FocusTarget | null,
): OpenTarget | null {
  const ofKind = targets.filter((t) => t.kind === kind)
  if (ofKind.length === 0) return null
  // 見つからないとき findIndex は -1。**その -1 が「先頭を返す」を兼ねている**
  //（(-1 + 1) % n === 0）。末尾の次が先頭へ戻るのも同じ剰余ひとつで済む
  const at = current === null ? -1 : ofKind.findIndex((t) => sameFocus(t.focus, current))
  return ofKind[(at + 1) % ofKind.length]
}
