import type { MissingTally } from '@/core/missing-tally'
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
 * 仮説と課題は**ミュータブルな状態を持たない**。現在ステータスはイベント列の
 * 最新から、問いの立ち方は木の形と件数から、抑制は祖先を遡って導出する。
 * 導出元のない手動ステータスは更新忘れで嘘をつく（D2）。
 *
 * **列が追記専用なのは仮説側だけである**——課題の見送りはトグルになり、
 * 戻すときに最新1件を消す（D2 の反転節）。ここの導出はどちらでも変わらない
 *——見るのは常に「最新の1件」であって、列がどう変わったかではない。
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
 * **課題ノードのイベントは見送り（deferred）しか無い**（スキーマ）ので、1件でもあれば
 * 抑制される。見送りを解除して拾い直すときは、**最新の見送りイベントを消す**
 *（`commands.ts` の `toggleDeferral`）——解除を表す種別を追記する機構は持たない。
 * 打ち消しのイベントを足す形にすると、「1件でもあれば抑制」がここで成立しなくなり、
 * 列の中身を数えることになる。
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
  /** 「未決」＝ events が0件 */
  result: boolean
  /** 「保留」＝最新が onHold（見たが判断できなかった。次のレビューで拾い直す） */
  hold: boolean
  /** 「未判断」＝ pendingNotes が空でない（レビューの締め忘れ） */
  judgement: boolean
}

export interface PosedQuestions {
  /** issues と同じ添字。true＝「仮説なし」が立つ */
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
      hold: !off && latestKind(h.events) === 'onHold',
      judgement: !off && h.pendingNotes.length > 0,
    }
  })
  return { issueNeedsHypothesis, hypothesisQuestions }
}

export interface IssueTreeTally {
  hypothesis: number
  result: number
  hold: number
  judgement: number
  total: number
}

/** 立っている問いだけを数える（抑制された配下は勘定に入らない） */
export function tallyQuestions(posed: PosedQuestions): IssueTreeTally {
  let hypothesis = 0
  let result = 0
  let hold = 0
  let judgement = 0
  for (const needs of posed.issueNeedsHypothesis) if (needs) hypothesis += 1
  for (const q of posed.hypothesisQuestions) {
    if (q.result) result += 1
    if (q.hold) hold += 1
    if (q.judgement) judgement += 1
  }
  return { hypothesis, result, hold, judgement, total: hypothesis + result + hold + judgement }
}

/** 問いの文言。**アプリの画面と Skill の報告が同じ言葉を出すため、ここ1箇所に置く** */
export const QUESTION_LABELS = {
  hypothesis: '仮説なし',
  result: '未決',
  hold: '保留',
  judgement: '未判断',
} as const

/**
 * イベント種別の表示ラベル（展開したときの「以前の判断」に出る文言）。
 *
 * **いまは `BADGE_LABELS` と同じ語しか並んでいない**——判断の種別を5語に畳んだ
 * ため、俯瞰のバッジと展開の行が同じ言葉を出す。それでも `BADGE_LABELS` と
 * 別に置くのは、鍵が違う（こちらは `JudgementKind`、あちらは `BadgeGroup`）
 * からであり、俯瞰と詳細をまた別の言葉に分けたくなったとき、片方だけ動かせる
 * ようにしておくため（`ISSUE_DEFERRED_LABEL` を別に置いているのと同じ理由）
 */
export const EVENT_KIND_LABELS: Record<JudgementKind, string> = {
  supported: '支持',
  rejected: '棄却',
  onHold: '保留',
  deferred: '見送り',
}

export const TALLY_TOTAL_LABEL = '要対応'

/** 集計の1行。エディタの帯と Skill の報告が逐語で同じ文字列を出す。0 の内訳は出さない */
export function tallyLine(t: IssueTreeTally): string {
  const parts = (
    [
      [QUESTION_LABELS.hypothesis, t.hypothesis],
      [QUESTION_LABELS.result, t.result],
      [QUESTION_LABELS.hold, t.hold],
      [QUESTION_LABELS.judgement, t.judgement],
    ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} ${n}`)
  if (t.total === 0) return `${TALLY_TOTAL_LABEL} 0`
  return `⚠ ${TALLY_TOTAL_LABEL} ${t.total}（${parts.join(' ／ ')}）`
}

/**
 * 帯（MissingTally 部品）へ渡す共通形。kind は OpenKind と同じ語で、
 * チップの onJump がそのまま goToNextOpen に渡せる。
 * variant の対応は元々 badge-variant.ts の chipVariantOf が持っていたものと
 * 同じ——未決・仮説なしは破線（open）、保留は実線（hold）、未判断は着信の青
 *（pending）。M22 でここに一本化し、chipVariantOf は削った
 */
export function toMissingTally(t: IssueTreeTally): MissingTally {
  return {
    total: t.total,
    parts: [
      { kind: 'hypothesis', label: QUESTION_LABELS.hypothesis, count: t.hypothesis, variant: 'open' as const },
      { kind: 'result', label: QUESTION_LABELS.result, count: t.result, variant: 'open' as const },
      { kind: 'hold', label: QUESTION_LABELS.hold, count: t.hold, variant: 'hold' as const },
      { kind: 'judgement', label: QUESTION_LABELS.judgement, count: t.judgement, variant: 'pending' as const },
    ].filter((p) => p.count > 0),
  }
}

/**
 * 俯瞰のバッジの5語。**判断を5語に畳んだいまは `JudgementKind` の4種＋未決と
 * 一対一で、`badgeGroupOf` はほぼ名前の付け替えにすぎない。** それでも別の型に
 * してあるのは、俯瞰の語彙（バッジ）と保存する種別（`kind`）が別の関心事だから
 * である——`undecided` は保存されない導出値であり、この型でしか名前を持たない
 */
export type BadgeGroup = 'yes' | 'no' | 'hold' | 'open' | 'deferred'

export function badgeGroupOf(status: HypothesisStatus): BadgeGroup {
  switch (status) {
    case 'supported':
      return 'yes'
    case 'rejected':
      return 'no'
    case 'onHold':
      return 'hold'
    case 'deferred':
      return 'deferred'
    case 'undecided':
      return 'open'
  }
}

export const BADGE_LABELS: Record<BadgeGroup, string> = {
  yes: '支持',
  no: '棄却',
  hold: '保留',
  open: '未決',
  deferred: '見送り',
}

/** 課題側の見送りバッジ。値は `BADGE_LABELS.deferred` と同じだが、課題と仮説を独立に変えられるよう別名で持つ */
export const ISSUE_DEFERRED_LABEL = '見送り'

/**
 * 見送りを掲げた課題の数（UI ノート D17 の別枠「見送り N」）。
 *
 * 数えるのは**自分自身が見送りを掲げている課題**だけ——配下の抑制
 * （`suppressedIssueIds`）は数えない。別枠は「誰が何を落としたか」の台帳
 * なので、入れ子の見送りもそれぞれ1と数える。課題のイベントは見送りしか
 * 無い（スキーマ）ので、判定は「events が空でない」と同値である。
 *
 * **配下に眠る凍結中の問いの数は導出しない**——出す画面が無い（人間の裁定。
 * 別枠は件数だけ）。必要が出たら poseQuestions を抑制なしで回す形で足せる
 */
export function deferredIssueCount(issues: readonly Pick<IssueNode, 'events'>[]): number {
  let count = 0
  for (const node of issues) if (latestKind(node.events) !== null) count += 1
  return count
}

/** 別枠の1行。アプリのチップと Skill の報告が逐語で同じ文字列を出す。0件のときは呼び出し側が行ごと出さない（チップも描かない） */
export function deferralLine(count: number): string {
  return `${ISSUE_DEFERRED_LABEL} ${count}`
}

/** 別枠の注意書き。チップの title と Skill の報告の補足が同じ文を出す */
export const DEFERRAL_NOTE = `見送り配下の問いは${TALLY_TOTAL_LABEL}に数えません`
