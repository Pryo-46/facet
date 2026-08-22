import type {
  DeferralEvent,
  Hypothesis,
  IssueNode,
  IssueTreeSchemaVersion2,
  JudgementEvent,
} from '@/types/issue-tree'

/**
 * 課題ツリーの導出（設計ノート D1〜D3・D9。このツールの心臓部）。
 *
 * 仮説と課題は**ミュータブルな状態を持たない**。現在ステータスは追記専用の
 * イベント列の最新から、問いの立ち方は木の形と件数から、抑制は祖先を遡って
 * 導出する。導出元のない手動ステータスは更新忘れで嘘をつく（D2）。
 *
 * **この導出をユーザー・ツール設定・ノード側の宣言で変えられるようにしては
 * ならない**——問いのセットが可変になった瞬間、「埋めるべき穴がいくつ
 * 残っているか」をツールが判定できなくなり、未決の可視化が成立しない
 *（シーケンスの questions.ts と同じ位置づけ）。
 *
 * **このファイルは登録 Skill（.claude/skills/issue-tree-register/scripts/derive.ts）
 * へバイト一致でコピーされる（issue-tree-m2 で作る）。** だから値 import・
 * 相対 import・enum を持たない——Node の型ストリップでコピー側が相対解決
 * できなくなるため。ズレを検知するテストは Skill と同時に置く
 */

export type DeferralKind = DeferralEvent['kind']
export type JudgementKind = JudgementEvent['kind']

/** 仮説の現在ステータス。events が空＝未決 */
export type HypothesisStatus = JudgementKind | 'undecided'
/** 課題の現在ステータス。events が空＝見送られていない */
export type IssueStatus = DeferralKind | 'open'

/** 最新イベントの kind。空なら null（＝未決） */
export function latestKind<K extends string>(events: readonly { kind: K }[]): K | null {
  return events.length === 0 ? null : events[events.length - 1].kind
}

export function hypothesisStatus(h: Pick<Hypothesis, 'events'>): HypothesisStatus {
  return latestKind(h.events) ?? 'undecided'
}

export function issueStatus(node: Pick<IssueNode, 'events'>): IssueStatus {
  return latestKind(node.events) ?? 'open'
}

/**
 * 見送りが効いている課題の ID 集合（D3）。自分自身の見送りも含む。
 *
 * **課題ノードのイベントは見送り系2種しか無い**（スキーマ）ので、1件でもあれば
 * 抑制される。見送りを解除して拾い直すときは、配下の仮説へ新しい判断イベントを
 * 追記して最新を更新する——課題側から解除イベントを打つ機構は持たない。
 *
 * **循環しているファイルでも止まらないこと**が要件。循環・参照切れは整合性検証
 * （レベル2）が受け止める＝ファイルは開ける（rev 5章）ので、ここには壊れた木が
 * 渡ってくる。祖先を辿る経路ごとに訪問済みを持ち、戻ってきたら打ち切る
 */
export function suppressedIssueIds(issues: readonly IssueNode[]): Set<string> {
  const byId = new Map<string, IssueNode>()
  // 同じ id が2件あるときは先に現れた方を親とする（core/canvas/flat-tree.ts と同じ規則）
  for (const node of issues) if (!byId.has(node.id)) byId.set(node.id, node)

  const out = new Set<string>()
  for (const start of issues) {
    const seen = new Set<string>()
    let node: IssueNode | undefined = start
    while (node !== undefined && !seen.has(node.id)) {
      seen.add(node.id)
      if (latestKind(node.events) !== null) {
        out.add(start.id)
        break
      }
      node = node.parentId === null ? undefined : byId.get(node.parentId)
    }
  }
  return out
}

/**
 * 子を持たない課題の ID 集合（D1「問いが立つのは葉だけ」の判定）。
 *
 * **親が実在しない課題は、その親を非葉にしない。** 参照切れの課題は図の上で
 * ルートとして描かれる（整合性検証が別に赤くする）ので、存在しない id を
 * 親として数えると、どこにも無いノードのせいで問いが消える
 */
export function leafIssueIds(issues: readonly IssueNode[]): Set<string> {
  const existing = new Set<string>()
  for (const node of issues) existing.add(node.id)
  const hasChild = new Set<string>()
  for (const node of issues) {
    if (node.parentId !== null && existing.has(node.parentId)) hasChild.add(node.parentId)
  }
  const out = new Set<string>()
  for (const node of issues) if (!hasChild.has(node.id)) out.add(node.id)
  return out
}

/** 仮説1件に立つ問い */
export interface HypothesisQuestions {
  /** 「検証結果は？」＝ events が0件 */
  result: boolean
  /** 「判断は？」＝ pendingNotes が空でない（レビューの締め忘れ） */
  judgement: boolean
}

export interface PosedQuestions {
  /** issues と同じ添字。true＝「仮説は？」が立つ */
  issueNeedsHypothesis: boolean[]
  /** hypotheses と同じ添字 */
  hypothesisQuestions: HypothesisQuestions[]
}

/**
 * 問いの導出。**戻り値は入力の配列と同じ添字で並ぶ。** 呼び出し側（レイアウト
 * と描画）は課題・仮説を添字で引くので、ID を鍵にした Map で返すと、ID 重複
 * ファイル（受け入れて赤表示する）では2件が1エントリに潰れ、**片方が引けなく
 * なる**。配列で返すのはその席を人数分そのまま残すためである。
 *
 * **保たれるのは席の数と並びだけで、答えの区別ではない。** 抑制・葉・仮説の
 * 有無はいずれも ID を鍵にした集合から引くので、**同じ ID を持つ2件には必ず
 * 同じ答えが出る。** ID 重複ファイルがここで正しく扱われるわけではない——
 * 正しい状態はユーザーが ID を直すことで、赤表示（整合性検証の
 * `duplicate-id`）がそれを促す
 */
export function poseQuestions(
  data: Pick<IssueTreeSchemaVersion2, 'issues' | 'hypotheses'>,
): PosedQuestions {
  const suppressed = suppressedIssueIds(data.issues)
  const leaves = leafIssueIds(data.issues)
  const hasHypothesis = new Set<string>()
  for (const h of data.hypotheses) hasHypothesis.add(h.issueId)

  const issueNeedsHypothesis = data.issues.map(
    (node) => !suppressed.has(node.id) && leaves.has(node.id) && !hasHypothesis.has(node.id),
  )
  const hypothesisQuestions = data.hypotheses.map((h) => {
    // ぶら下がり先が実在しない仮説は抑制されない（どの課題の配下でもない）。
    // 参照切れそのものは整合性検証（レベル2）が赤くする
    const off = suppressed.has(h.issueId)
    return {
      result: !off && h.events.length === 0,
      judgement: !off && h.pendingNotes.length > 0,
    }
  })
  return { issueNeedsHypothesis, hypothesisQuestions }
}

export interface IssueTreeTally {
  hypothesis: number
  result: number
  judgement: number
  total: number
}

/** 立っている問いだけを数える（抑制された配下は勘定に入らない） */
export function tallyQuestions(posed: PosedQuestions): IssueTreeTally {
  let hypothesis = 0
  let result = 0
  let judgement = 0
  for (const needs of posed.issueNeedsHypothesis) if (needs) hypothesis += 1
  for (const q of posed.hypothesisQuestions) {
    if (q.result) result += 1
    if (q.judgement) judgement += 1
  }
  return { hypothesis, result, judgement, total: hypothesis + result + judgement }
}

/** 問いの文言。**アプリの画面と Skill の報告が同じ言葉を出すため、ここ1箇所に置く** */
export const QUESTION_LABELS = {
  hypothesis: '仮説は？',
  result: '検証結果は？',
  judgement: '判断は？',
} as const

/** イベント種別の表示ラベル。**色では区別しない**（D8。役割トークンの意味論を汚さない） */
export const EVENT_KIND_LABELS: Record<JudgementKind, string> = {
  supported: '支持',
  rejected: '棄却',
  supportedWithoutTest: '自明に成立',
  rejectedWithoutTest: '検証せず棄却',
  onHold: '保留',
  deferred: '今回見送り',
  deferredToMainDev: '本開発送り',
}

/** 集計の1行。エディタの帯と Skill の報告が逐語で同じ文字列を出す */
export function tallyLine(t: IssueTreeTally): string {
  return `⚠ 未決 ${t.total}（${QUESTION_LABELS.hypothesis} ${t.hypothesis} ／ ${QUESTION_LABELS.result} ${t.result} ／ ${QUESTION_LABELS.judgement} ${t.judgement}）`
}

/** 抑制された配下に添える1文（「なぜここには問いが無いのか」の説明） */
export const SUPPRESSED_NOTE = '祖先の見送りにより問いは立たない（導出。子に値は持たない）'
