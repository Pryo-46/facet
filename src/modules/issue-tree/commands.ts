import { buildTree, orderFlatNodes, siblingsOf, subtreeEnd, type BuiltTree } from '@/core/canvas/flat-tree'
import { insertAt, moveItem, removeAt } from '@/core/list-ops'
import { newId } from '@/core/new-id'
import { todayString } from '@/core/today'
import type {
  Ask,
  Feedback,
  Hypothesis,
  IssueNode,
  IssueTreeSchemaVersion4,
  JudgementEvent,
} from '@/types/issue-tree'
import type { IssueEventKind } from './derive'

/**
 * 操作後に編集させたい欄。**`index` はそれぞれの配列（issues / hypotheses）の位置。**
 * 課題と仮説で配列が分かれているので、ロジックツリーのような `focusIndex: number`
 * ひとつでは行き先を表せない。
 *
 * **v3 で2つ変わった**: 由来（`rationale`）が廃止されて席が消え、課題の理由の欄が
 * 見送り専用でなくなった（`deferral` → `issueEvent`。解決の理由もここに書く）
 */
export type FocusTarget =
  | { cell: 'issue'; index: number }
  | { cell: 'issueEvent'; index: number }
  | { cell: 'hypothesis'; index: number }
  | { cell: 'detail'; index: number }
  | { cell: 'value'; index: number }
  | { cell: 'ask'; index: number; askIndex: number }
  | { cell: 'feedback'; index: number; feedbackIndex: number }
  | { cell: 'event'; index: number; eventIndex: number }

export interface EditResult {
  data: IssueTreeSchemaVersion4
  /** 行き先が無いときは null */
  focus: FocusTarget | null
}

/**
 * イベント列の型。**v4 のスキーマが `maxItems: 1` を課したので、生成される型は
 * 配列ではなくタプルの union（`[] | [E]`）である**——「0 件か 1 件」が `tsc` の
 * 検査対象になった。追記する実装（`[...events, e]`）はここで型が落ちるので、
 * 「差し替えは前の1件を消してから足す」という規律がコメントではなく型で守られる。
 * **`derive.ts` はこの型を読む側なので1文字も変わらない**（見るのは
 * `events.length === 0` と最後の要素だけ）
 */
type JudgementEvents = Hypothesis['events']
type IssueEvents = IssueNode['events']

/**
 * 課題を DFS 行きがけ順に、仮説を「ぶら下がり先の課題の順」に整える
 *（スキーマの配列順の規約）。
 *
 * **同じ課題にぶら下がる仮説どうしの相対順は変えない**——そこは表示順の正
 * であり、`Array.prototype.sort` は安定（ES2019 以降）なのでこれが保たれる。
 *
 * ぶら下がり先が実在しない仮説は**末尾に元の順で残す。消さないこと**
 *——ファイルにあるものが黙って減るのが一番たちが悪い（参照切れは
 * 整合性検証が赤くする）
 */
export function normalizeOrder(data: IssueTreeSchemaVersion4): IssueTreeSchemaVersion4 {
  const issues = orderFlatNodes(data.issues)
  const rank = new Map<string, number>()
  // ID 重複は先に現れた方を採る（core/canvas/flat-tree.ts と同じ規則）
  issues.forEach((node, i) => {
    if (!rank.has(node.id)) rank.set(node.id, i)
  })
  const attached: Hypothesis[] = []
  const orphans: Hypothesis[] = []
  for (const h of data.hypotheses) (rank.has(h.issueId) ? attached : orphans).push(h)
  attached.sort((a, b) => (rank.get(a.issueId) ?? 0) - (rank.get(b.issueId) ?? 0))
  return { ...data, issues, hypotheses: [...attached, ...orphans] }
}

function newIssue(parentId: string | null): IssueNode {
  return { id: newId('issue'), parentId, text: '', events: [] }
}

/**
 * 課題の構造編集の結果を組み立てる。`issues` は既に行きがけ順に整っている
 * （挿入位置＝部分木の直後、という規則がそれを保つ）ので `normalizeOrder` は
 * 課題の並びを動かさない。**通すのは仮説のため**——課題を動かすと
 * 「ぶら下がり先の課題の順」が崩れるので、ここで一緒に引き直す
 */
function withIssues(data: IssueTreeSchemaVersion4, issues: IssueNode[]): IssueTreeSchemaVersion4 {
  return normalizeOrder({ ...data, issues })
}

/**
 * 並べ替えた配列の上で作業するための下ごしらえ。
 * **位置は参照の同一性で引き直す**——normalizeOrder で配列位置が動くため、
 * 呼び出し元が渡した index をそのまま使うと別の課題を操作する
 */
function prepare(
  data: IssueTreeSchemaVersion4,
  index: number,
): { issues: IssueNode[]; built: BuiltTree; i: number } | null {
  const ref = data.issues[index]
  if (ref === undefined) return null
  const issues = orderFlatNodes(data.issues)
  return { issues, built: buildTree(issues), i: issues.indexOf(ref) }
}

/**
 * 最初の課題を作る。空状態からの開始（マウスでもキーボードでもここを通る）。
 *
 * **位置は参照の同一性で引き直す**——循環を含むファイルでは `orderFlatNodes` が
 * 到達不能ノードを末尾へ寄せるため、末尾に足した新ルートは `withIssues` の
 * 正規化で前へ戻る。足した位置をそのまま使うと別の実在ノードを指す
 */
export function addRootIssue(data: IssueTreeSchemaVersion4): EditResult {
  const created = newIssue(null)
  const next = withIssues(data, [...orderFlatNodes(data.issues), created])
  return { data: next, focus: { cell: 'issue', index: next.issues.indexOf(created) } }
}

/** 末尾の子を足す（Tab／ノードの「+」ハンドルが呼ぶのはこの関数） */
export function addChildIssue(data: IssueTreeSchemaVersion4, parentIndex: number): EditResult {
  const p = prepare(data, parentIndex)
  if (p === null) return { data, focus: null }
  // 行きがけ順では「部分木の直後」がそのまま「末尾の子の位置」になる
  const at = subtreeEnd(p.built, p.i)
  const node = newIssue(p.issues[p.i].id)
  return { data: withIssues(data, insertAt(p.issues, at, node)), focus: { cell: 'issue', index: at } }
}

/**
 * 直後に兄弟を足す（Enter）。
 * **ルートの上では子を足す**——ルートに兄弟を作ると多重ルートになり、
 * 単一ルートの木という制約と両立しない
 */
export function addSiblingIssueAfter(data: IssueTreeSchemaVersion4, index: number): EditResult {
  const p = prepare(data, index)
  if (p === null) return { data, focus: null }
  if (p.built.parents[p.i] === null) return addChildIssue(withIssues(data, p.issues), p.i)
  const at = subtreeEnd(p.built, p.i)
  const node = newIssue(p.issues[p.i].parentId)
  return { data: withIssues(data, insertAt(p.issues, at, node)), focus: { cell: 'issue', index: at } }
}

/**
 * 部分木ごと消す（空欄 Backspace）。**ぶら下がる仮説も一緒に消す**
 *——残すと、どの課題にも属さない孤児が黙って増える（参照切れとして
 * 赤くはなるが、ユーザーは「消したのに残っている」と見る）。
 *
 * 確認ダイアログは挟まない（rev 5章。会議中の入力速度を削ぐため）。
 * 1操作1コミットの Undo で戻せる
 */
export function deleteIssueSubtree(data: IssueTreeSchemaVersion4, index: number): EditResult {
  const p = prepare(data, index)
  if (p === null) return { data, focus: null }
  const end = subtreeEnd(p.built, p.i)
  const removedIds = new Set(p.issues.slice(p.i, end).map((n) => n.id))
  // 行き先は削除前の位置で決める: 前の兄弟 → 親 → 無し（logic-tree と同じ）
  const siblings = siblingsOf(p.built, p.i)
  const pos = siblings.indexOf(p.i)
  const target = pos > 0 ? siblings[pos - 1] : p.built.parents[p.i]
  const kept = [...p.issues.slice(0, p.i), ...p.issues.slice(end)]
  const at = target === null ? -1 : kept.indexOf(p.issues[target])
  return {
    // **正規化を通す**——`kept` は `prepare` が並べ替えた配列から作るのに対し、
    // `hypotheses` は手つかずの入力から filter するため、入力が行きがけ順で
    // なかったとき「ぶら下がり先の課題の順」という配列順の規約が破れる。
    // `kept` は既に行きがけ順なので課題の並びは動かず、focus は有効なまま
    data: normalizeOrder({
      ...data,
      issues: kept,
      hypotheses: data.hypotheses.filter((h) => !removedIds.has(h.issueId)),
    }),
    focus: at < 0 ? null : { cell: 'issue', index: at },
  }
}

/**
 * 兄弟の中で1つ動かす（Alt+↑↓）。**部分木ごと動く。**
 *
 * 挿入位置は「削除前の位置」で決めてから、自分を抜いた分だけ補正する
 *——先に削除すると後続が前へずれ、下方向への移動が1つ手前に着地する
 */
export function moveIssueSibling(
  data: IssueTreeSchemaVersion4,
  index: number,
  delta: -1 | 1,
): EditResult {
  const p = prepare(data, index)
  if (p === null) return { data, focus: null }
  const siblings = siblingsOf(p.built, p.i)
  const pos = siblings.indexOf(p.i)
  const to = pos + delta
  if (pos < 0 || to < 0 || to >= siblings.length) return { data, focus: null }

  const start = p.i
  const end = subtreeEnd(p.built, p.i)
  const block = p.issues.slice(start, end)
  const rest = [...p.issues.slice(0, start), ...p.issues.slice(end)]

  const other = siblings[to]
  const at =
    delta === -1
      ? other // 前の兄弟は自分より前にあるので、抜いてもその位置は動かない
      : subtreeEnd(p.built, other) - block.length // 後ろの兄弟は自分の分だけ前へずれる

  const next = [...rest.slice(0, at), ...block, ...rest.slice(at)]
  return { data: withIssues(data, next), focus: { cell: 'issue', index: at } }
}

/**
 * 課題の文言を置き換える。**並べ替えない**——打鍵のたびに配列が動くと、
 * 入力中のノードの配列位置がずれてフォーカスを見失う
 */
export function setIssueText(
  data: IssueTreeSchemaVersion4,
  index: number,
  text: string,
): IssueTreeSchemaVersion4 {
  return { ...data, issues: data.issues.map((n, i) => (i === index ? { ...n, text } : n)) }
}

function newHypothesis(issueId: string): Hypothesis {
  return {
    id: newId('hypothesis'),
    issueId,
    title: '',
    detail: '',
    value: '',
    asks: [],
    feedbacks: [],
    events: [],
  }
}

function replaceHypothesis(
  data: IssueTreeSchemaVersion4,
  index: number,
  next: Hypothesis,
): IssueTreeSchemaVersion4 {
  return { ...data, hypotheses: data.hypotheses.map((h, i) => (i === index ? next : h)) }
}

/**
 * 課題に仮説を足す（主修飾キー＋Enter／ノードの「＋仮説」ボタン）。
 *
 * **どの課題にも付けられる**（D1）。中間ノードへの「当たりをつける」仮説を
 * 制約違反にすると、形式的な子ノードを作る迂回入力を強いることになる。
 * 「仮説は？」の問いが葉にしか立たないのは別の話で、そちらは derive.ts の担当
 */
export function addHypothesis(data: IssueTreeSchemaVersion4, issueIndex: number): EditResult {
  const issue = data.issues[issueIndex]
  if (issue === undefined) return { data, focus: null }
  const created = newHypothesis(issue.id)
  // 末尾に足してから正規化する。**位置は参照の同一性で引き直す**
  //（正規化で配列位置が動くため、足した位置をそのまま使うと別の仮説を指す）
  const next = normalizeOrder({ ...data, hypotheses: [...data.hypotheses, created] })
  return { data: next, focus: { cell: 'hypothesis', index: next.hypotheses.indexOf(created) } }
}

/** 直後に仮説を足す（仮説セルでの Enter）。**同じ課題にぶら下げる** */
export function addHypothesisAfter(data: IssueTreeSchemaVersion4, index: number): EditResult {
  const ref = data.hypotheses[index]
  if (ref === undefined) return { data, focus: null }
  const created = newHypothesis(ref.issueId)
  const next = normalizeOrder({ ...data, hypotheses: insertAt(data.hypotheses, index + 1, created) })
  return { data: next, focus: { cell: 'hypothesis', index: next.hypotheses.indexOf(created) } }
}

/** 仮説を消す（空欄 Backspace）。イベントも FB も一緒に消える */
export function deleteHypothesis(data: IssueTreeSchemaVersion4, index: number): EditResult {
  if (data.hypotheses[index] === undefined) return { data, focus: null }
  const kept = removeAt(data.hypotheses, index)
  const at = index > 0 && kept[index - 1]?.issueId === data.hypotheses[index].issueId ? index - 1 : null
  return { data: { ...data, hypotheses: kept }, focus: at === null ? null : { cell: 'hypothesis', index: at } }
}

/**
 * 同じ課題の中で1つ動かす（Alt+↑↓）。
 * **課題をまたがない**——またぐと `issueId` を書き換えることになり、
 * 「並び替え」が「付け替え」に化ける
 */
export function moveHypothesis(
  data: IssueTreeSchemaVersion4,
  index: number,
  delta: -1 | 1,
): EditResult {
  const ref = data.hypotheses[index]
  if (ref === undefined) return { data, focus: null }
  const to = index + delta
  const other = data.hypotheses[to]
  if (other === undefined || other.issueId !== ref.issueId) return { data, focus: null }
  return {
    data: { ...data, hypotheses: moveItem(data.hypotheses, index, to) },
    focus: { cell: 'hypothesis', index: to },
  }
}

/**
 * ソリューション仮説のタイトルを置き換える。**並べ替えない**——打鍵のたびに
 * 配列が動くと、入力中の仮説の配列位置がずれてフォーカスを見失う。
 */
export function setHypothesisTitle(
  data: IssueTreeSchemaVersion4,
  index: number,
  title: string,
): IssueTreeSchemaVersion4 {
  const h = data.hypotheses[index]
  return h === undefined ? data : replaceHypothesis(data, index, { ...h, title })
}

/** 仮説の詳細（どう作るか）を置き換える。**並べ替えない**（`setHypothesisTitle` と同じ理由） */
export function setHypothesisDetail(
  data: IssueTreeSchemaVersion4,
  index: number,
  detail: string,
): IssueTreeSchemaVersion4 {
  const h = data.hypotheses[index]
  return h === undefined ? data : replaceHypothesis(data, index, { ...h, detail })
}

/** 価値仮説（なぜ効くか）を置き換える。**並べ替えない**（`setHypothesisTitle` と同じ理由） */
export function setHypothesisValue(
  data: IssueTreeSchemaVersion4,
  index: number,
  value: string,
): IssueTreeSchemaVersion4 {
  const h = data.hypotheses[index]
  return h === undefined ? data : replaceHypothesis(data, index, { ...h, value })
}

function newAsk(): Ask {
  return { id: newId('ask'), text: '' }
}

/** 問いを1件足す（「＋ 聞きたいことを追加」ボタン） */
export function addAsk(data: IssueTreeSchemaVersion4, index: number): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined) return { data, focus: null }
  const asks = [...h.asks, newAsk()]
  return {
    data: replaceHypothesis(data, index, { ...h, asks }),
    focus: { cell: 'ask', index, askIndex: asks.length - 1 },
  }
}

/** 問いの文言を書き換える。**並べ替えない**（`setHypothesisTitle` と同じ理由） */
export function setAskText(
  data: IssueTreeSchemaVersion4,
  index: number,
  askIndex: number,
  text: string,
): IssueTreeSchemaVersion4 {
  const h = data.hypotheses[index]
  if (h === undefined || h.asks[askIndex] === undefined) return data
  return replaceHypothesis(data, index, {
    ...h,
    asks: h.asks.map((a, i) => (i === askIndex ? { ...a, text } : a)),
  })
}

/**
 * 問いを1件消す。**行き先は `removeFeedback` と同じ規律**——前の問いがあれば
 * それ、無ければ展開パネルの中で必ず存在する仮説の文言へ返す。
 *
 * **消した問いを指していた FB の `askId` を `null` に付け替える。** 放置すると、
 * その FB は「どの問いのブロックにも属さず、`askId === null` のブロックにも
 * 属さない」状態になり、画面から黙って消える。
 * 「ファイルにあるものが黙って減るのが一番たちが悪い」は `normalizeOrder` の註が
 * 既に述べている、このコードベースの価値である。付け替えれば「どの問いにも
 * 紐づかない FB」のブロックに現れて残る。
 *
 * スキーマは「存在しない ask を指していてもファイルは開ける」と言っているので、
 * 手書き／AI が書いたファイルには依然として宙に浮いた `askId` がありうる——
 * その扱いは画面側の仕事で、ここでは何もしない
 */
export function removeAsk(
  data: IssueTreeSchemaVersion4,
  index: number,
  askIndex: number,
): EditResult {
  const h = data.hypotheses[index]
  const removed = h?.asks[askIndex]
  if (h === undefined || removed === undefined) return { data, focus: null }
  const asks = removeAt(h.asks, askIndex)
  const feedbacks = h.feedbacks.map((f) => (f.askId === removed.id ? { ...f, askId: null } : f))
  const at = askIndex > 0 ? askIndex - 1 : null
  return {
    data: replaceHypothesis(data, index, { ...h, asks, feedbacks }),
    focus: at === null ? { cell: 'hypothesis', index } : { cell: 'ask', index, askIndex: at },
  }
}

/** アプリが作る FB。**調子は `note`（ただのメモ）が既定**——嘘の分類を記録として残さないため */
function newFeedback(askId: string | null, today: string): Feedback {
  return { askId, text: '', by: '', sentiment: 'note', date: today }
}

/**
 * FB を1件足す（「＋ FB」ボタン）。**`askId` は既定値を与えず必須**——「＋FB」
 * ボタンは必ずどこかのブロック（どの問いにも紐づかない／特定の問い）の中にあり、
 * 呼ぶ側は自分がどの問いの下にいるかを知っている。既定 `null` にすると、
 * 配線を忘れた「＋FB」が黙ってどの問いにも紐づかない FB を作る
 */
export function addFeedback(
  data: IssueTreeSchemaVersion4,
  index: number,
  askId: string | null,
  today: string = todayString(),
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined) return { data, focus: null }
  const feedbacks = [...h.feedbacks, newFeedback(askId, today)]
  return {
    data: replaceHypothesis(data, index, { ...h, feedbacks }),
    focus: { cell: 'feedback', index, feedbackIndex: feedbacks.length - 1 },
  }
}

/**
 * 直後に FB を1件足す（FB セルの Enter）。**押した位置の次に入る**
 *——末尾に足すと、3件の1件目で Enter を押したときに生まれるのは4件目で、
 * フォーカスが展開パネルの一番下へ飛ぶ（`addHypothesisAfter` と同じ規律）
 */
export function addFeedbackAfter(
  data: IssueTreeSchemaVersion4,
  index: number,
  feedbackIndex: number,
  today: string = todayString(),
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.feedbacks[feedbackIndex] === undefined) return { data, focus: null }
  const at = feedbackIndex + 1
  return {
    data: replaceHypothesis(data, index, {
      ...h,
      feedbacks: insertAt(h.feedbacks, at, newFeedback(null, today)),
    }),
    focus: { cell: 'feedback', index, feedbackIndex: at },
  }
}

/**
 * FB の文言を書き換える。**日付は書き換えない**——`date` は「いつ言われたか」で
 * あって「いつ打ち直したか」ではない（打鍵のたびに更新すると、誤字を直しただけで
 * 発言日が今日になる）
 */
export function setFeedbackText(
  data: IssueTreeSchemaVersion4,
  index: number,
  feedbackIndex: number,
  text: string,
): IssueTreeSchemaVersion4 {
  const h = data.hypotheses[index]
  if (h === undefined || h.feedbacks[feedbackIndex] === undefined) return data
  return replaceHypothesis(data, index, {
    ...h,
    feedbacks: h.feedbacks.map((f, i) => (i === feedbackIndex ? { ...f, text } : f)),
  })
}

/**
 * FB の調子（`sentiment`）を差し替える（アイコンのドロップダウン）。
 *
 * **`setFeedbackText` と同じ規律**——並べ替えない、**日付も文言も書き換えない**
 *（`date` は「いつ言われたか」であって「いつ分類し直したか」ではない）。
 *
 * **これが無いあいだ、`sentiment` はアプリから一度も変えられなかった**
 *——`newFeedback` が `note` 固定で作り、画面はアイコンで**表示するだけ**
 * だったので、`like` / `concern` / `question` は Skill か手書きでしか入らなかった。
 * 「スキーマが受け入れる値を、アプリからは選べない」は
 * `JUDGEMENT_MENU_ORDER` の註が名指ししている失敗と同じ形である
 */
export function setFeedbackSentiment(
  data: IssueTreeSchemaVersion4,
  index: number,
  feedbackIndex: number,
  sentiment: Feedback['sentiment'],
): IssueTreeSchemaVersion4 {
  const h = data.hypotheses[index]
  const current = h?.feedbacks[feedbackIndex]
  // **同じ調子を選び直したら「動かなかった編集」**（`moveFeedback` と同じ約束で
  // 同じ参照を返す）——ドロップダウンはいまの値も選べるので、素通しにすると
  // 中身の同じコミットが積まれて Undo が空振りする
  if (h === undefined || current === undefined || current.sentiment === sentiment) return data
  return replaceHypothesis(data, index, {
    ...h,
    feedbacks: h.feedbacks.map((f, i) => (i === feedbackIndex ? { ...f, sentiment } : f)),
  })
}

/**
 * FB を1件消す（空欄 Backspace／削除）。**`events` と違って何件でも並ぶ列である**
 *——こちらは「何を言われたか」の記録なので順番も件数も意味を持つ。判断の側は
 * 高々1件で「いま何が決まっているか」だけを表し、消すのは `clearJudgement`。
 *
 * **先頭を消したときの行き先は仮説の文言。** v2 は由来の欄へ返していたが、
 * その欄は廃止された（`rationale`）。展開パネルの中で必ず存在する欄は
 * 仮説の文言だけなので、そこへ返す
 */
export function removeFeedback(
  data: IssueTreeSchemaVersion4,
  index: number,
  feedbackIndex: number,
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.feedbacks[feedbackIndex] === undefined) return { data, focus: null }
  const feedbacks = removeAt(h.feedbacks, feedbackIndex)
  const at = feedbackIndex > 0 ? feedbackIndex - 1 : null
  return {
    data: replaceHypothesis(data, index, { ...h, feedbacks }),
    focus:
      at === null ? { cell: 'hypothesis', index } : { cell: 'feedback', index, feedbackIndex: at },
  }
}

/**
 * FB を1件動かす（Alt+↑↓）。**同じ仮説の中でしか動かない**
 *——FB は仮説に属する配列そのもので、またぐという意味が無い。
 *
 * 端を越える移動は「動かなかった編集」として同じ参照を返す
 *（`moveHypothesis` と同じ約束。呼び出し側はこれで履歴の空振りを落とす）
 */
export function moveFeedback(
  data: IssueTreeSchemaVersion4,
  index: number,
  feedbackIndex: number,
  delta: -1 | 1,
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.feedbacks[feedbackIndex] === undefined) return { data, focus: null }
  const to = feedbackIndex + delta
  if (h.feedbacks[to] === undefined) return { data, focus: null }
  return {
    data: replaceHypothesis(data, index, {
      ...h,
      feedbacks: moveItem(h.feedbacks, feedbackIndex, to),
    }),
    // 動いた先を追いかける（並び替えの後もフォーカスは同じ FB に残る）
    focus: { cell: 'feedback', index, feedbackIndex: to },
  }
}

/**
 * 判断を**差し替える**（D2）。**課題の旗（`toggleIssueEvent`）と同じ規律**で、
 * 前の1件を消してから足す——履歴として追記すると、**間違えて付けた判断を
 * 消せなくなる**。取り消しは Undo（1操作1コミット）の仕事であって、判断
 * イベントの列には持たせない。列に2件並べると「いまどちらが有効か」が
 * 列の中身に依存し始め、「最新1件で決まる」という導出の芯が崩れる
 *（スキーマの `maxItems: 1` が同じことをファイルの側で言っている）。
 *
 * **同じ種別を選び直したら「動かなかった編集」**（`setFeedbackSentiment` と同じ
 * 約束で同じ参照を返す）——ドロップダウンはいまの種別も選べるので、素通しにすると
 * **書いてある理由が空に戻り、日付だけが今日へ動く**。「今回も同じ判断・理由も
 * 同じ」なら何も触らないのは D2 の規律でもある。
 *
 * 種別が変わったときは `note` を空で作り直し、直後にその note セルへフォーカスを
 * 移す——**残すと、前の判断のために書いた理由が新しい判断の理由の顔をする**
 *（`toggleIssueEvent` が旗の差し替えで同じことをしている）。
 * **FB は1件も動かない**（v3 で「根拠へ移す」を廃止した。判断の理由は
 * 複数の FB を踏まえて人が自分の言葉で書くものであり、FB の文言をそのまま
 * 移す操作は分かりづらいわりに何も要約していない）
 */
export function setJudgement(
  data: IssueTreeSchemaVersion4,
  index: number,
  kind: JudgementEvent['kind'],
  today: string = todayString(),
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined) return { data, focus: null }
  const latest = h.events[h.events.length - 1]
  if (latest !== undefined && latest.kind === kind) return { data, focus: null }
  // **前の1件を消してから足す**（列に2件並べない）。`JudgementEvents` は
  // タプルなので、うっかり `[...h.events, e]` と書くと `tsc` が落とす
  const events: JudgementEvents = [{ kind, note: '', date: today }]
  return {
    data: replaceHypothesis(data, index, { ...h, events }),
    focus: { cell: 'event', index, eventIndex: events.length - 1 },
  }
}

/**
 * 判断を**取り消して未決へ戻す**（v4。ドロップダウンの「取り消す」）。
 *
 * **`toggleIssueEvent` の「切る」側と同じ操作である**——打ち消しを表す種別を
 * 追記するのではなく、**立っている1件を消す**。追記で表すと、現在ステータスが
 * 「最新の kind」ではなく「列を畳んだ結果」になり、俯瞰のバッジと問いの導出
 *（`derive.ts` の `hypothesisStatus` ／ `poseQuestions`）が列の中身に依存し始める。
 *
 * **判断が無ければ「動かなかった編集」**（同じ参照を返す）——`apply` がそれを見て
 * 履歴を積まない。画面の側も未決のときは「取り消す」を出さないが、**出す・出さないの
 * 判断が画面にしか無い状態にしない**（動線が増えたときに空のコミットが積まれる）。
 *
 * **行き先は仮説の文言**（`{ cell: 'hypothesis' }`）。理由の欄は判断があるときしか
 * 存在せず（未決のパネルはそこに読み取り専用の案内文を出す）、取り消した直後には
 * **戻る先の欄そのものが消えている**。`null`（＝どこへも移さない）にすると
 * フォーカスはドロップダウンのトリガーに残り、そこでは木の操作言語
 *（Enter／Tab／←→）が1つも効かない——`toggleIssueEvent` が旗を外したときに
 * 課題の文言へ返すのと同じ理由で、**展開パネルの中で必ず存在する欄**へ返す
 *（`removeFeedback` が先頭を消したときに仮説の文言を選ぶのと同じ席）。
 *
 * **空にする＝「立っている1件を消す」である**（`toggleIssueEvent` の「切る」側と
 * 同じ）。v3 まではここで `slice(0, -1)` と書いて「最新の1件だけ」を消す必要が
 * あった——手書きの2件以上のファイルが開けたからである。v4 の `maxItems: 1` で
 * その形は開かなくなり、**生成される型がタプル（`[] | [JudgementEvent]`）に
 * なったので、2つの書き方の区別そのものが型から消えた**
 */
export function clearJudgement(data: IssueTreeSchemaVersion4, index: number): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.events.length === 0) return { data, focus: null }
  const events: JudgementEvents = []
  return {
    data: replaceHypothesis(data, index, { ...h, events }),
    focus: { cell: 'hypothesis', index },
  }
}

/**
 * 課題ノードの旗を**入り切りする**（D3）。**配下へ値をコピーしない**
 *——抑制は derive.ts が祖先を遡って導出する。
 *
 * 旗は「選ぶ」操作ではなく「入っているか／入っていないか」の操作なので、
 * 「切る」の意味を決める必要があり、**最新の旗を消す**を採る。追記による
 * 取り消しイベントは作らない：`events` が「旗が1件」ではなく「掲げて戻した
 * 履歴」になった瞬間、抑制の導出（最新があるか）と俯瞰のバッジが列の中身に
 * 依存し始める。**代償は、一度掲げて戻した事実とそのとき書いた理由が
 * 消えることである**——受け入れた上での選択で、取り消しは Undo（1操作1
 * コミット）が戻す。**仮説側も同じ規律である**（`setJudgement` ／
 * `clearJudgement`）——追記専用の列は無い。
 *
 * **旗は2種（見送り／解決）である。規則は3つ:**
 *
 * 1. 最新が同じ `kind` → 最新1件を消す（＝切る）
 * 2. 最新が**別の** `kind` → **最新1件を消してから足す**（差し替え）。
 *    見送りと解決は意味が逆で**同時に立ってはならない**ので、列に2件並べない
 * 3. イベントが無い → 1件足す
 *
 * **入り切りを1つの関数にしてあるのは、「いまどの旗が立っているか」を決める場所を
 * 1つに保つためである。** 種別ごとに export を分けると、呼ぶ側が
 * 「別の旗が立っていたらどうするか」を自分で決めることになり、規則2が
 * 呼び出し箇所の数だけ生える。
 *
 * **v3 まではここが `node.events.slice(0, -1)` に足す形だった。** スキーマが
 * この列に `maxItems: 1` を課していなかったので**手書きの2件以上のファイルが
 * 開け**、「全部消すと、書いた人が見ていない過去の理由まで1押しで飛ぶ」を
 * 避ける必要があった（`schema.test.ts` にも「排他はスキーマの担当ではない」と
 * いう逆向きの `it` が置かれていた。反転の経緯はそちらの註にある）。
 * **v4 で `maxItems: 1` を課したのでその入力は開かなくなり、型もタプル
 * （`[] | [IssueEvent]`）になって「残す前半」が表現できなくなった**
 *（`clearJudgement` も同じ形にしてある）
 */
export function toggleIssueEvent(
  data: IssueTreeSchemaVersion4,
  index: number,
  kind: IssueEventKind,
  today: string = todayString(),
): EditResult {
  const node = data.issues[index]
  if (node === undefined) return { data, focus: null }
  const latest = node.events[node.events.length - 1]
  const off = latest !== undefined && latest.kind === kind
  // **立っていれば消し、立っていなければ（別の旗ごと）差し替える。** v3 まではここが
  // `node.events.slice(0, -1)` に足す形だった——手書きの2件以上が開けたので
  // 「最新の1件だけ」を消す必要があった。v4 の `maxItems: 1` でその形は開かなくなり、
  // 型もタプルになったので、残す前半そのものが存在しない
  const events: IssueEvents = off ? [] : [{ kind, note: '', date: today }]
  return {
    data: { ...data, issues: data.issues.map((n, i) => (i === index ? { ...n, events } : n)) },
    // **付けたら理由を打たせる**（`setJudgement` が根拠へ飛ばすのと同じ形）。
    // 課題の文言へ戻さないのは、旗は理由が本体で、バッジだけ残ると
    // 「なぜ落としたか／なぜ閉じたか」が図から消えるため。
    //
    // **外したときは課題の文言へ返す。** 理由の欄は旗があるときしか存在しないので、
    // 剥がした先に戻る欄は無い（`clearJudgement` が仮説の文言へ返すのと同じ席の
    // 選び方である）。null（＝どこへも移さない）にするとフォーカスはトグルの
    // ボタンに残るが、ボタンの上では木の操作言語（Enter／Tab／←→）が1つも効かない
    focus: off ? { cell: 'issue', index } : { cell: 'issueEvent', index },
  }
}

/**
 * 旗の理由を書く。**書けるのは立っている旗だけ**（`setEventNote` と同じ規則）。
 * 旗が1件も無い課題では**同じ参照を返す**——`apply` がそれを見て何もしない契約
 */
export function setIssueEventNote(
  data: IssueTreeSchemaVersion4,
  index: number,
  note: string,
): IssueTreeSchemaVersion4 {
  const node = data.issues[index]
  const current = node?.events[0]
  if (node === undefined || current === undefined) return data
  const events: IssueEvents = [{ ...current, note }]
  return {
    ...data,
    issues: data.issues.map((n, i) => (i === index ? { ...n, events } : n)),
  }
}

/**
 * イベントの根拠を書く。**編集できるのは最新イベントだけ**（`setIssueEventNote` と
 * 同じ規則）。
 *
 * 判断を付けた直後に根拠を打つ経路は要るが、**添字を無条件に信じると、画面が
 * 出していない席への書き込みを受け付ける**——v4 のスキーマは列を高々1件に
 * したので通常そんな席は無いが、この門があるかぎり「いま画面に出ている1件」
 * 以外は書き換わらない。誤って付けた判断は `clearJudgement` が取り消す
 */
export function setEventNote(
  data: IssueTreeSchemaVersion4,
  index: number,
  eventIndex: number,
  note: string,
): IssueTreeSchemaVersion4 {
  const h = data.hypotheses[index]
  const current = h?.events[0]
  if (h === undefined || current === undefined || eventIndex !== h.events.length - 1) return data
  const events: JudgementEvents = [{ ...current, note }]
  return replaceHypothesis(data, index, { ...h, events })
}
