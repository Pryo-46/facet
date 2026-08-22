import { buildTree, orderFlatNodes, siblingsOf, subtreeEnd, type BuiltTree } from '@/core/canvas/flat-tree'
import { insertAt, moveItem, removeAt } from '@/core/list-ops'
import { newId } from '@/core/new-id'
import type {
  DeferralEvent,
  Hypothesis,
  IssueNode,
  IssueTreeSchemaVersion2,
  JudgementEvent,
} from '@/types/issue-tree'

/**
 * 操作後に編集させたい欄。**`index` はそれぞれの配列（issues / hypotheses）の位置。**
 * 課題と仮説で配列が分かれているので、ロジックツリーのような `focusIndex: number`
 * ひとつでは行き先を表せない
 */
export type FocusTarget =
  | { cell: 'issue'; index: number }
  | { cell: 'deferral'; index: number }
  | { cell: 'hypothesis'; index: number }
  | { cell: 'rationale'; index: number }
  | { cell: 'note'; index: number; noteIndex: number }
  | { cell: 'event'; index: number; eventIndex: number }

export interface EditResult {
  data: IssueTreeSchemaVersion2
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
export function normalizeOrder(data: IssueTreeSchemaVersion2): IssueTreeSchemaVersion2 {
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
function withIssues(data: IssueTreeSchemaVersion2, issues: IssueNode[]): IssueTreeSchemaVersion2 {
  return normalizeOrder({ ...data, issues })
}

/**
 * 並べ替えた配列の上で作業するための下ごしらえ。
 * **位置は参照の同一性で引き直す**——normalizeOrder で配列位置が動くため、
 * 呼び出し元が渡した index をそのまま使うと別の課題を操作する
 */
function prepare(
  data: IssueTreeSchemaVersion2,
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
export function addRootIssue(data: IssueTreeSchemaVersion2): EditResult {
  const created = newIssue(null)
  const next = withIssues(data, [...orderFlatNodes(data.issues), created])
  return { data: next, focus: { cell: 'issue', index: next.issues.indexOf(created) } }
}

/** 末尾の子を足す（Tab／ノードの「+」ハンドルが呼ぶのはこの関数） */
export function addChildIssue(data: IssueTreeSchemaVersion2, parentIndex: number): EditResult {
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
export function addSiblingIssueAfter(data: IssueTreeSchemaVersion2, index: number): EditResult {
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
export function deleteIssueSubtree(data: IssueTreeSchemaVersion2, index: number): EditResult {
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
  data: IssueTreeSchemaVersion2,
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
  data: IssueTreeSchemaVersion2,
  index: number,
  text: string,
): IssueTreeSchemaVersion2 {
  return { ...data, issues: data.issues.map((n, i) => (i === index ? { ...n, text } : n)) }
}

function newHypothesis(issueId: string): Hypothesis {
  return { id: newId('hypothesis'), issueId, text: '', rationale: '', events: [], pendingNotes: [] }
}

function replaceHypothesis(
  data: IssueTreeSchemaVersion2,
  index: number,
  next: Hypothesis,
): IssueTreeSchemaVersion2 {
  return { ...data, hypotheses: data.hypotheses.map((h, i) => (i === index ? next : h)) }
}

/**
 * 課題に仮説を足す（主修飾キー＋Enter／ノードの「＋仮説」ボタン）。
 *
 * **どの課題にも付けられる**（D1）。中間ノードへの「当たりをつける」仮説を
 * 制約違反にすると、形式的な子ノードを作る迂回入力を強いることになる。
 * 「仮説は？」の問いが葉にしか立たないのは別の話で、そちらは derive.ts の担当
 */
export function addHypothesis(data: IssueTreeSchemaVersion2, issueIndex: number): EditResult {
  const issue = data.issues[issueIndex]
  if (issue === undefined) return { data, focus: null }
  const created = newHypothesis(issue.id)
  // 末尾に足してから正規化する。**位置は参照の同一性で引き直す**
  //（正規化で配列位置が動くため、足した位置をそのまま使うと別の仮説を指す）
  const next = normalizeOrder({ ...data, hypotheses: [...data.hypotheses, created] })
  return { data: next, focus: { cell: 'hypothesis', index: next.hypotheses.indexOf(created) } }
}

/** 直後に仮説を足す（仮説セルでの Enter）。**同じ課題にぶら下げる** */
export function addHypothesisAfter(data: IssueTreeSchemaVersion2, index: number): EditResult {
  const ref = data.hypotheses[index]
  if (ref === undefined) return { data, focus: null }
  const created = newHypothesis(ref.issueId)
  const next = normalizeOrder({ ...data, hypotheses: insertAt(data.hypotheses, index + 1, created) })
  return { data: next, focus: { cell: 'hypothesis', index: next.hypotheses.indexOf(created) } }
}

/** 仮説を消す（空欄 Backspace）。イベントもメモも一緒に消える */
export function deleteHypothesis(data: IssueTreeSchemaVersion2, index: number): EditResult {
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
  data: IssueTreeSchemaVersion2,
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

/** 文言の置き換え。**並べ替えない**——打鍵のたびに配列が動くとフォーカスを見失う */
export function setHypothesisText(data: IssueTreeSchemaVersion2, index: number, text: string) {
  const h = data.hypotheses[index]
  return h === undefined ? data : replaceHypothesis(data, index, { ...h, text })
}

export function setRationale(data: IssueTreeSchemaVersion2, index: number, rationale: string) {
  const h = data.hypotheses[index]
  return h === undefined ? data : replaceHypothesis(data, index, { ...h, rationale })
}

/** FBメモを1件足す（由来セルの Enter／メモセルの Enter／「メモ」ボタン） */
export function addPendingNote(data: IssueTreeSchemaVersion2, index: number): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined) return { data, focus: null }
  const pendingNotes = [...h.pendingNotes, '']
  return {
    data: replaceHypothesis(data, index, { ...h, pendingNotes }),
    focus: { cell: 'note', index, noteIndex: pendingNotes.length - 1 },
  }
}

/**
 * 直後にFBメモを1件足す（メモセルの Enter）。**押した位置の次に入る**
 *——末尾に足すと、3件の1件目で Enter を押したときに生まれるのは4件目で、
 * フォーカスがカードの一番下へ飛ぶ（`addHypothesisAfter` と同じ規律）。
 *
 * 由来セルの Enter が使うのは `addPendingNote`（末尾）の方である
 *——あちらは「移動先が無ければ生やす」であって、間に差し込む操作ではない
 */
export function addPendingNoteAfter(
  data: IssueTreeSchemaVersion2,
  index: number,
  noteIndex: number,
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.pendingNotes[noteIndex] === undefined) return { data, focus: null }
  const at = noteIndex + 1
  return {
    data: replaceHypothesis(data, index, {
      ...h,
      pendingNotes: insertAt(h.pendingNotes, at, ''),
    }),
    focus: { cell: 'note', index, noteIndex: at },
  }
}

export function setPendingNote(
  data: IssueTreeSchemaVersion2,
  index: number,
  noteIndex: number,
  text: string,
): IssueTreeSchemaVersion2 {
  const h = data.hypotheses[index]
  if (h === undefined || h.pendingNotes[noteIndex] === undefined) return data
  return replaceHypothesis(data, index, {
    ...h,
    pendingNotes: h.pendingNotes.map((n, i) => (i === noteIndex ? text : n)),
  })
}

export function removePendingNote(
  data: IssueTreeSchemaVersion2,
  index: number,
  noteIndex: number,
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.pendingNotes[noteIndex] === undefined) return { data, focus: null }
  const pendingNotes = removeAt(h.pendingNotes, noteIndex)
  const at = noteIndex > 0 ? noteIndex - 1 : null
  return {
    data: replaceHypothesis(data, index, { ...h, pendingNotes }),
    focus: at === null ? { cell: 'rationale', index } : { cell: 'note', index, noteIndex: at },
  }
}

/**
 * FBメモを1件動かす（Alt+↑↓）。**同じ仮説の中でしか動かない**
 *——メモは仮説に属する配列そのもので、またぐという意味が無い。
 *
 * 端を越える移動は「動かなかった編集」として同じ参照を返す
 *（`moveHypothesis` と同じ約束。呼び出し側はこれで履歴の空振りを落とす）
 */
export function movePendingNote(
  data: IssueTreeSchemaVersion2,
  index: number,
  noteIndex: number,
  delta: -1 | 1,
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.pendingNotes[noteIndex] === undefined) return { data, focus: null }
  const to = noteIndex + delta
  if (h.pendingNotes[to] === undefined) return { data, focus: null }
  return {
    data: replaceHypothesis(data, index, {
      ...h,
      pendingNotes: moveItem(h.pendingNotes, noteIndex, to),
    }),
    // 動いた先を追いかける（並び替えの後もフォーカスは同じメモに残る）
    focus: { cell: 'note', index, noteIndex: to },
  }
}

/**
 * 判断イベントを追記する（D2）。**追記専用**——過去の要素は書き換えない。
 *
 * `note` は空で作り、直後に最新イベントの note セルへフォーカスを移す。
 * **pendingNotes を自動で流し込まない**（D9）——雑談メモを公式の根拠へ
 * 昇格させない選別の余地を残すため、移動は promoteNote で1件ずつ行う
 */
export function appendJudgement(
  data: IssueTreeSchemaVersion2,
  index: number,
  kind: JudgementEvent['kind'],
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined) return { data, focus: null }
  const events = [...h.events, { kind, note: '' }]
  return {
    data: replaceHypothesis(data, index, { ...h, events }),
    focus: { cell: 'event', index, eventIndex: events.length - 1 },
  }
}

/**
 * 課題ノードへ見送りイベントを追記する（D3）。
 * **配下へ値をコピーしない**——抑制は derive.ts が祖先を遡って導出する
 */
export function appendDeferral(
  data: IssueTreeSchemaVersion2,
  index: number,
  kind: DeferralEvent['kind'],
): EditResult {
  const node = data.issues[index]
  if (node === undefined) return { data, focus: null }
  const events = [...node.events, { kind, note: '' }]
  return {
    data: { ...data, issues: data.issues.map((n, i) => (i === index ? { ...n, events } : n)) },
    // 見送りを選んだら理由を打たせる（`appendJudgement` が根拠へ飛ばすのと同じ形）。
    // **課題の文言へ戻さない**——見送りは理由が本体で、種別だけ残ると
    // 「なぜ落としたか」が figure から消える
    focus: { cell: 'deferral', index },
  }
}

/**
 * 見送りの理由を書く。**書けるのは最新の見送りだけ**（`setEventNote` と同じ規則）。
 *
 * 課題ノードのイベントも追記専用の列であり、過去の見送りの理由が後から
 * 書き換わると「そのとき何を根拠に落としたか」が消える。見送りが1件も無い
 * 課題では**同じ参照を返す**——`apply` がそれを見て何もしない契約
 */
export function setDeferralNote(
  data: IssueTreeSchemaVersion2,
  index: number,
  note: string,
): IssueTreeSchemaVersion2 {
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
  data: IssueTreeSchemaVersion2,
  index: number,
  eventIndex: number,
  note: string,
): IssueTreeSchemaVersion2 {
  const h = data.hypotheses[index]
  if (h === undefined || eventIndex !== h.events.length - 1) return data
  return replaceHypothesis(data, index, {
    ...h,
    events: h.events.map((e, i) => (i === eventIndex ? { ...e, note } : e)),
  })
}

/**
 * FBメモ1件を**最新イベントの根拠へ移す**（D9 の選別移動）。
 * イベントが1件も無ければ何も起きない（根拠の行き先が無い）。
 * 既に根拠があるときは改行で連結する
 */
export function promoteNote(
  data: IssueTreeSchemaVersion2,
  index: number,
  noteIndex: number,
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.events.length === 0) return { data, focus: null }
  const text = h.pendingNotes[noteIndex]
  if (text === undefined) return { data, focus: null }
  const last = h.events.length - 1
  const merged = h.events[last].note === '' ? text : `${h.events[last].note}\n${text}`
  return {
    data: replaceHypothesis(data, index, {
      ...h,
      events: h.events.map((e, i) => (i === last ? { ...e, note: merged } : e)),
      pendingNotes: removeAt(h.pendingNotes, noteIndex),
    }),
    focus: { cell: 'event', index, eventIndex: last },
  }
}
