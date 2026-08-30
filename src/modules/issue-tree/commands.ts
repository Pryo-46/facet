import { buildTree, orderFlatNodes, siblingsOf, subtreeEnd, type BuiltTree } from '@/core/canvas/flat-tree'
import { insertAt, moveItem, removeAt } from '@/core/list-ops'
import { newId } from '@/core/new-id'
import { todayString } from '@/core/today'
import type {
  Feedback,
  Hypothesis,
  IssueEvent,
  IssueNode,
  IssueTreeSchemaVersion3,
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
  | { cell: 'feedback'; index: number; feedbackIndex: number }
  | { cell: 'event'; index: number; eventIndex: number }

export interface EditResult {
  data: IssueTreeSchemaVersion3
  /** 行き先が無いときは null */
  focus: FocusTarget | null
}

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
export function normalizeOrder(data: IssueTreeSchemaVersion3): IssueTreeSchemaVersion3 {
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
function withIssues(data: IssueTreeSchemaVersion3, issues: IssueNode[]): IssueTreeSchemaVersion3 {
  return normalizeOrder({ ...data, issues })
}

/**
 * 並べ替えた配列の上で作業するための下ごしらえ。
 * **位置は参照の同一性で引き直す**——normalizeOrder で配列位置が動くため、
 * 呼び出し元が渡した index をそのまま使うと別の課題を操作する
 */
function prepare(
  data: IssueTreeSchemaVersion3,
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
export function addRootIssue(data: IssueTreeSchemaVersion3): EditResult {
  const created = newIssue(null)
  const next = withIssues(data, [...orderFlatNodes(data.issues), created])
  return { data: next, focus: { cell: 'issue', index: next.issues.indexOf(created) } }
}

/** 末尾の子を足す（Tab／ノードの「+」ハンドルが呼ぶのはこの関数） */
export function addChildIssue(data: IssueTreeSchemaVersion3, parentIndex: number): EditResult {
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
export function addSiblingIssueAfter(data: IssueTreeSchemaVersion3, index: number): EditResult {
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
export function deleteIssueSubtree(data: IssueTreeSchemaVersion3, index: number): EditResult {
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
  data: IssueTreeSchemaVersion3,
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
  data: IssueTreeSchemaVersion3,
  index: number,
  text: string,
): IssueTreeSchemaVersion3 {
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
  data: IssueTreeSchemaVersion3,
  index: number,
  next: Hypothesis,
): IssueTreeSchemaVersion3 {
  return { ...data, hypotheses: data.hypotheses.map((h, i) => (i === index ? next : h)) }
}

/**
 * 課題に仮説を足す（主修飾キー＋Enter／ノードの「＋仮説」ボタン）。
 *
 * **どの課題にも付けられる**（D1）。中間ノードへの「当たりをつける」仮説を
 * 制約違反にすると、形式的な子ノードを作る迂回入力を強いることになる。
 * 「仮説は？」の問いが葉にしか立たないのは別の話で、そちらは derive.ts の担当
 */
export function addHypothesis(data: IssueTreeSchemaVersion3, issueIndex: number): EditResult {
  const issue = data.issues[issueIndex]
  if (issue === undefined) return { data, focus: null }
  const created = newHypothesis(issue.id)
  // 末尾に足してから正規化する。**位置は参照の同一性で引き直す**
  //（正規化で配列位置が動くため、足した位置をそのまま使うと別の仮説を指す）
  const next = normalizeOrder({ ...data, hypotheses: [...data.hypotheses, created] })
  return { data: next, focus: { cell: 'hypothesis', index: next.hypotheses.indexOf(created) } }
}

/** 直後に仮説を足す（仮説セルでの Enter）。**同じ課題にぶら下げる** */
export function addHypothesisAfter(data: IssueTreeSchemaVersion3, index: number): EditResult {
  const ref = data.hypotheses[index]
  if (ref === undefined) return { data, focus: null }
  const created = newHypothesis(ref.issueId)
  const next = normalizeOrder({ ...data, hypotheses: insertAt(data.hypotheses, index + 1, created) })
  return { data: next, focus: { cell: 'hypothesis', index: next.hypotheses.indexOf(created) } }
}

/** 仮説を消す（空欄 Backspace）。イベントも FB も一緒に消える */
export function deleteHypothesis(data: IssueTreeSchemaVersion3, index: number): EditResult {
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
  data: IssueTreeSchemaVersion3,
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
 *
 * **`detail` / `value` の setter はここに無い**（m4 は出す画面を持たない。m5 が足す）
 */
export function setHypothesisTitle(
  data: IssueTreeSchemaVersion3,
  index: number,
  title: string,
): IssueTreeSchemaVersion3 {
  const h = data.hypotheses[index]
  return h === undefined ? data : replaceHypothesis(data, index, { ...h, title })
}

/** アプリが作る FB。**調子は `note`（ただのメモ）が既定**——m4 は選ばせる画面を持たず、嘘の分類を残さないため */
function newFeedback(today: string): Feedback {
  return { askId: null, text: '', by: '', sentiment: 'note', date: today }
}

/** FB を1件足す（「＋ FB」ボタン） */
export function addFeedback(
  data: IssueTreeSchemaVersion3,
  index: number,
  today: string = todayString(),
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined) return { data, focus: null }
  const feedbacks = [...h.feedbacks, newFeedback(today)]
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
  data: IssueTreeSchemaVersion3,
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
      feedbacks: insertAt(h.feedbacks, at, newFeedback(today)),
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
  data: IssueTreeSchemaVersion3,
  index: number,
  feedbackIndex: number,
  text: string,
): IssueTreeSchemaVersion3 {
  const h = data.hypotheses[index]
  if (h === undefined || h.feedbacks[feedbackIndex] === undefined) return data
  return replaceHypothesis(data, index, {
    ...h,
    feedbacks: h.feedbacks.map((f, i) => (i === feedbackIndex ? { ...f, text } : f)),
  })
}

/**
 * FB を1件消す（空欄 Backspace／削除）。**`events` と違って消せるのはここだけ**
 *——打ち間違いが残るのは実務的でない一方、判断の履歴は「そのとき何を根拠に
 * 決めたか」の記録なので追記専用を守る。
 *
 * **先頭を消したときの行き先は仮説の文言。** v2 は由来の欄へ返していたが、
 * その欄は廃止された（`rationale`）。展開パネルの中で必ず存在する欄は
 * 仮説の文言だけなので、そこへ返す
 */
export function removeFeedback(
  data: IssueTreeSchemaVersion3,
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
  data: IssueTreeSchemaVersion3,
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
 * 判断イベントを追記する（D2）。**追記専用**——過去の要素は書き換えない。
 * **仮説側は例外を持たない**（例外は課題の旗だけ。`toggleIssueEvent`）。
 *
 * `note` は空で作り、直後に最新イベントの note セルへフォーカスを移す。
 * **FB は1件も動かない**（v3 で「根拠へ移す」を廃止した。判断の理由は
 * 複数の FB を踏まえて人が自分の言葉で書くものであり、FB の文言をそのまま
 * 移す操作は分かりづらいわりに何も要約していない）
 */
export function appendJudgement(
  data: IssueTreeSchemaVersion3,
  index: number,
  kind: JudgementEvent['kind'],
  today: string = todayString(),
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined) return { data, focus: null }
  const events = [...h.events, { kind, note: '', date: today }]
  return {
    data: replaceHypothesis(data, index, { ...h, events }),
    focus: { cell: 'event', index, eventIndex: events.length - 1 },
  }
}

/**
 * 課題ノードの旗を**入り切りする**（D3）。**配下へ値をコピーしない**
 *——抑制は derive.ts が祖先を遡って導出する。
 *
 * **ここだけが D2 の追記専用の例外である。** 旗は「選ぶ」操作ではなく
 * 「入っているか／入っていないか」の操作なので、「切る」の意味を決める必要が
 * あり、**最新の旗を消す**を採った。追記による取り消しイベントは作らない：
 * `events` が「旗が1件」ではなく「掲げて戻した履歴」になった瞬間、抑制の導出
 * （最新があるか）と俯瞰のバッジが列の中身に依存し始める。**代償は、一度掲げて
 * 戻した事実とそのとき書いた理由が消えることである**——受け入れた上での選択で、
 * 取り消しは Undo（1操作1コミット）が戻す。**仮説側（`appendJudgement`）は
 * 追記専用のまま。**
 *
 * **v3 で旗が2種になった（見送り／解決）。規則は3つ:**
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
 * **消すのは最新の1件だけ。** アプリが作る `events` は高々1件だが、手書きの
 * ファイルは2件以上を持ちうる——そこで全部消すと、書いた人が見ていない過去の
 * 理由まで1押しで飛ぶ
 */
export function toggleIssueEvent(
  data: IssueTreeSchemaVersion3,
  index: number,
  kind: IssueEventKind,
  today: string = todayString(),
): EditResult {
  const node = data.issues[index]
  if (node === undefined) return { data, focus: null }
  const latest = node.events[node.events.length - 1]
  const off = latest !== undefined && latest.kind === kind
  const kept = latest === undefined ? node.events : node.events.slice(0, -1)
  const events: IssueEvent[] = off ? kept : [...kept, { kind, note: '', date: today }]
  return {
    data: { ...data, issues: data.issues.map((n, i) => (i === index ? { ...n, events } : n)) },
    // **付けたら理由を打たせる**（`appendJudgement` が根拠へ飛ばすのと同じ形）。
    // 課題の文言へ戻さないのは、旗は理由が本体で、バッジだけ残ると
    // 「なぜ落としたか／なぜ閉じたか」が図から消えるため。
    //
    // **外したときは、残った理由の欄の有無によらず課題の文言へ返す。**
    // 手書きの2件以上では剥がしても理由の欄は残るが、そちらへ返さない——
    // **残っている理由はいま剥がしたものではなく1つ前のもの**であり、
    // カーソルを置けば書き換えを誘う（`setIssueEventNote` は最新を書き換えるので
    // 実際に書き換わり、過去の理由が消える）。
    //
    // null（＝どこへも移さない）にするとフォーカスはトグルのボタンに残るが、
    // ボタンの上では木の操作言語（Enter／Tab／←→）が1つも効かない
    focus: off ? { cell: 'issue', index } : { cell: 'issueEvent', index },
  }
}

/**
 * 旗の理由を書く。**書けるのは最新の旗だけ**（`setEventNote` と同じ規則）。
 *
 * 課題の `events` は `toggleIssueEvent` が最新1件を消せる列になったが、
 * **書き換えの側は最新に限ったままである**——過去の旗の理由が後から
 * 書き換わると「そのとき何を根拠に落としたか／閉じたか」が消える。旗が1件も無い
 * 課題では**同じ参照を返す**——`apply` がそれを見て何もしない契約
 */
export function setIssueEventNote(
  data: IssueTreeSchemaVersion3,
  index: number,
  note: string,
): IssueTreeSchemaVersion3 {
  const node = data.issues[index]
  if (node === undefined || node.events.length === 0) return data
  const last = node.events.length - 1
  return {
    ...data,
    issues: data.issues.map((n, i) =>
      i === index ? { ...n, events: n.events.map((e, j) => (j === last ? { ...e, note } : e)) } : n,
    ),
  }
}

/**
 * イベントの根拠を書く。**編集できるのは最新イベントだけ。**
 *
 * 追記した直後に根拠を打つ経路は要るが、過去のイベントに後から根拠を足せると
 * 「そのとき何を根拠に決めたか」が書き換わる——追記専用の列である意味が消える。
 * 誤った追記の取り消しは Undo（1操作1コミット）に委ねる
 */
export function setEventNote(
  data: IssueTreeSchemaVersion3,
  index: number,
  eventIndex: number,
  note: string,
): IssueTreeSchemaVersion3 {
  const h = data.hypotheses[index]
  if (h === undefined || eventIndex !== h.events.length - 1) return data
  return replaceHypothesis(data, index, {
    ...h,
    events: h.events.map((e, i) => (i === eventIndex ? { ...e, note } : e)),
  })
}
