// @vitest-environment jsdom
import { useState } from 'react'
import { MessageSquare, ThumbsUp, TriangleAlert, CircleHelp } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { badgeClass } from '@/components/badge-styles'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { Feedback, IssueTreeSchemaVersion4 } from '@/types/issue-tree'
import {
  addAsk,
  addFeedback,
  removeAsk,
  removeFeedback,
  setAskText,
  setFeedbackSentiment,
  setFeedbackText,
} from './commands'
import { poseQuestions, QUESTION_LABELS } from './derive'
import { HypothesisPanel } from './HypothesisPanel'
import {
  ADD_ASK_LABEL,
  ADD_NOTE_LABEL,
  layoutIssueTree,
  NO_ASK_TEXT,
  SENTIMENT_LABELS,
  SENTIMENT_ORDER,
  type IssueTreeFonts,
} from './layout'
import {
  FB_DELETE_WIDTH_CLASS,
  MINI_ACTION_HEIGHT_CLASS,
  MINI_ICON_GAP_CLASS,
} from './measure'

afterEach(cleanup)

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`
const A = (n: number): string => `ask_${String(n).padStart(10, 'A')}`

/** 測定は決定的な概算器で行う（jsdom はレイアウトを持たない） */
const fonts: IssueTreeFonts = {
  title: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  expandedTitle: { measure: createEstimateMeasurer(18), lineHeight: 27 },
  body: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  small: { measure: createEstimateMeasurer(14), lineHeight: 18 },
}

/**
 * **目印の文字列を使う**（`HypothesisPanel.dom.test.tsx` と同じ流儀）。
 * 「出ている」を空でない値で見ると、フィクスチャを変えただけで意味が変わる
 */
const ASK_ANSWERED = '3時間で十分か（ASK1）'
const ASK_AWAITING = '受け損ねをどう防ぐか（ASK2）'
const FB_LIKE = '朝夕の2回で十分（LIKE）'
const FB_CONCERN = '応募直後に見たいので遅い（CONCERN）'
const FB_LOOSE = '媒体ごとに仕様が違うのでは（LOOSE）'
const FB_GHOST = '消えた問いへの答え（GHOST）'

const feedback = (over: Partial<Feedback>): Feedback => ({
  askId: null,
  text: '',
  by: '',
  sentiment: 'note',
  date: '2026-08-12',
  ...over,
})

/**
 * 課題2件・仮説2件。仮説1は**問い2件（答えのある問い／FB待ちの問い）と、
 * 紐づかない FB・宙に浮いた `askId` の FB** を持つ。調子は4種そろえてある
 */
const data: IssueTreeSchemaVersion4 = {
  schemaVersion: 4,
  type: 'issueTree',
  title: 'テスト',
  issues: [
    { id: I(0), parentId: null, text: '結果取得を画面遷移の中で待てるか', events: [] },
    { id: I(1), parentId: I(0), text: '待てないなら何を先に返すか', events: [] },
  ],
  hypotheses: [
    {
      id: H(1),
      issueId: I(1),
      title: '同期取得で間に合う',
      detail: '',
      value: '',
      asks: [
        { id: A(1), text: ASK_ANSWERED },
        { id: A(2), text: ASK_AWAITING },
      ],
      feedbacks: [
        feedback({ askId: A(1), text: FB_LIKE, by: '佐藤さん', sentiment: 'like' }),
        feedback({ askId: null, text: FB_LOOSE, sentiment: 'note', date: '2026-08-13' }),
        feedback({
          askId: A(1),
          text: FB_CONCERN,
          by: '田中さん',
          sentiment: 'concern',
          date: '2026-08-14',
        }),
        // **実在しない問いを指す FB。** スキーマは「存在しない ask を指していても
        // ファイルは開ける」と明記している（手書き・AI が書いたファイル）
        feedback({ askId: A(9), text: FB_GHOST, sentiment: 'question', date: '2026-08-15' }),
      ],
      events: [],
    },
    {
      // **FB 3件の仮説**（削除の番人。2件だと「常に末尾を消す」実装と区別が付かない）
      id: H(2),
      issueId: I(1),
      title: 'webhook受信に切り替える',
      detail: '',
      value: '',
      asks: [],
      feedbacks: [
        feedback({ text: 'FB1' }),
        feedback({ text: 'FB2' }),
        feedback({ text: 'FB3' }),
      ],
      events: [],
    },
  ],
}

/** 祖先が見送っている木（抑制の番人）。仮説と問いはそのまま */
const deferredData: IssueTreeSchemaVersion4 = {
  ...data,
  issues: [
    {
      ...data.issues[0],
      events: [{ kind: 'deferred', note: '今回は追わない', date: '2026-08-01' }],
    },
    data.issues[1],
  ],
}

/**
 * パネル1枚を状態つきで描く。**コマンド（`commands.ts`）を通して書き戻す**
 *——「押すと何が起きるか」はボタンとコマンドの継ぎ目に宿るので、
 * spy だけで受けると配線の間違い（渡す `askId` や添字）が緑のまま通る
 */
function Harness(props: {
  index: number
  initial?: IssueTreeSchemaVersion4
  onAdd?: (askId: string | null) => void
  /** 書き戻された**ファイルそのもの**を受ける（保存された値を見るため） */
  onFile?: (next: IssueTreeSchemaVersion4) => void
}) {
  const [file, setFile] = useState(props.initial ?? data)
  // **調子のドロップダウンの開閉は鍵1つ**（本番は `IssueTreeEditor` の `openCell`）。
  // ここでも1つしか持たない——ブロックの側に状態を持たせる実装では、
  // 「同時に1つ」が場所ごとに破れることに気づけない
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const index = props.index
  const h = file.hypotheses[index]
  const ownerIndex = file.issues.findIndex((n) => n.id === h.issueId)
  const posed = poseQuestions(file)
  const layout = layoutIssueTree(file, posed, fonts, ownerIndex)
  const placement = layout.hypotheses[index]
  const owner = layout.issues[ownerIndex]
  if (placement === null || placement.expanded === null || owner === null) {
    throw new Error(`仮説${index + 1}のパネルが無い`)
  }
  const suppressed = file.issues.some((n) => n.events.length > 0)
  return (
    <HypothesisPanel
      hypothesisKey={`row${index}`}
      label={`仮説${index + 1}`}
      panel={placement.expanded}
      origin={owner.rect}
      hypothesis={h}
      invalid={false}
      suppressed={suppressed}
      onTitleChange={vi.fn()}
      onDetailChange={vi.fn()}
      onValueChange={vi.fn()}
      onAskTextChange={(askIndex, next) => setFile(setAskText(file, index, askIndex, next))}
      onAddAsk={() => setFile(addAsk(file, index).data)}
      onRemoveAsk={(askIndex) => setFile(removeAsk(file, index, askIndex).data)}
      onFeedbackTextChange={(fi, next) => setFile(setFeedbackText(file, index, fi, next))}
      onFeedbackSentimentChange={(fi, next) => {
        const updated = setFeedbackSentiment(file, index, fi, next)
        props.onFile?.(updated)
        setFile(updated)
      }}
      sentimentMenuProps={(fi) => ({
        open: openMenu === fi,
        onOpenChange: (open) => setOpenMenu(open ? fi : null),
      })}
      onEventNoteChange={vi.fn()}
      onAddFeedback={(askId) => {
        props.onAdd?.(askId)
        setFile(addFeedback(file, index, askId, '2026-08-30').data)
      }}
      onRemoveFeedback={(fi) => setFile(removeFeedback(file, index, fi).data)}
      onDelete={vi.fn()}
      judgementMenu={<button type="button">判断を追加</button>}
    />
  )
}

/** 問いブロック（`role="group"`）を名前で引く */
const block = (name: string): HTMLElement => screen.getByRole('group', { name })
const looseBlock = (label = '仮説1'): HTMLElement => block(`${label} の${NO_ASK_TEXT}`)

/** DOM 順（＝描画順）で a が b より前にあるか */
function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

/** アイコンの「形」＝ svg の中身。**クラス名に依らずに図形そのものを見る** */
function shapeOf(icon: React.ReactElement): string {
  const host = document.createElement('div')
  const view = render(icon, { container: host })
  const svg = host.querySelector('svg')
  const shape = svg === null ? '' : svg.innerHTML
  view.unmount()
  return shape
}

describe('AskBlock: 問いと FB の入れ子', () => {
  it('FB は答えた問いのブロックの中に、データの順で並ぶ', () => {
    render(<Harness index={0} />)
    const answered = block('仮説1 の聞きたいこと1')
    expect(within(answered).getByRole('textbox', { name: '仮説1 のFB1' })).toBeTruthy()
    expect(within(answered).getByRole('textbox', { name: '仮説1 のFB3' })).toBeTruthy()
    // 別の問いの FB も、紐づかない FB もこのブロックには入らない
    expect(within(answered).queryByRole('textbox', { name: '仮説1 のFB2' })).toBeNull()
    expect(
      within(answered).getAllByRole('textbox', { name: /^仮説1 のFB/ }).map((e) => e.textContent),
    ).toHaveLength(2)
    // ブロックは asks の順。**FB待ちの問いも中身が空のまま出る**
    expect(precedes(answered, block('仮説1 の聞きたいこと2'))).toBe(true)
  })

  it('FB が0件の問いには FB待ち が立ち、答えのある問いには立たない', () => {
    render(<Harness index={0} />)
    const awaiting = within(block('仮説1 の聞きたいこと2')).getByText(QUESTION_LABELS.feedback)
    // **畳まれた行の「FB待ち」と同じ語彙**（着信＝返事を待っている。derive.ts）
    expect(awaiting.className).toBe(badgeClass('pending'))
    expect(
      within(block('仮説1 の聞きたいこと1')).queryByText(QUESTION_LABELS.feedback),
    ).toBeNull()
  })

  /**
   * **数え直していないことの番人。** 抑制（祖先の見送り・解決）で問いが立たない
   * ことを決めているのは `derive.ts` だけで、ここはその結果（`posed`）を読む。
   * 自前で「FB が0件か」を数え始めると、見送った枝の中で FB待ちが復活する
   */
  it('祖先が見送っている仮説には FB待ち が立たない', () => {
    render(<Harness index={0} initial={deferredData} />)
    expect(screen.queryByText(QUESTION_LABELS.feedback)).toBeNull()
  })

  it('どの問いにも紐づかない FB は最後のブロックに出る', () => {
    render(<Harness index={0} />)
    const loose = looseBlock()
    expect(within(loose).getByRole('textbox', { name: '仮説1 のFB2' })).toBeTruthy()
    // 末尾＝どの問いのブロックよりも後ろ
    expect(precedes(block('仮説1 の聞きたいこと2'), loose)).toBe(true)
    // 見出しは固定文で、編集できない（問いではないので `ask` の欄を持たない）
    expect(within(loose).getByText(NO_ASK_TEXT)).toBeTruthy()
    expect(within(loose).queryByRole('textbox', { name: /聞きたいこと/ })).toBeNull()
  })

  /**
   * **裁定A。** スキーマは「存在しない ask を指していてもファイルは開ける」と
   * 言っているので、手書き・AI が書いたファイルには宙に浮いた `askId` がありうる。
   * 素朴に「問いごとに絞る＋`askId === null` を集める」と、それらはどの
   * ブロックにも入らず**画面から黙って消える**（ファイルにあるものが黙って
   * 減るのが一番たちが悪い＝`normalizeOrder` の註）
   */
  it('実在しない askId を持つ FB も末尾のブロックに出る（黙って消えない）', () => {
    render(<Harness index={0} />)
    const ghost = screen.getByRole('textbox', { name: '仮説1 のFB4' })
    expect((ghost as HTMLTextAreaElement).value).toBe(FB_GHOST)
    expect(looseBlock().contains(ghost)).toBe(true)
    // ファイルの FB は1件も減っていない
    expect(screen.getAllByRole('textbox', { name: /^仮説1 のFB\d+$/ })).toHaveLength(4)
  })

  it('問いブロックの「＋FB」は、その問いの askId を渡す', () => {
    const onAdd = vi.fn()
    render(<Harness index={0} onAdd={onAdd} />)
    fireEvent.click(
      within(block('仮説1 の聞きたいこと2')).getByRole('button', {
        name: '仮説1 の聞きたいこと2にFBを足す',
      }),
    )
    // **`null` を渡す実装でも「FB が1件増える」は緑になる**ので、渡した値を見る
    expect(onAdd).toHaveBeenCalledWith(A(2))
    // 足した FB はその問いのブロックに入り、FB待ちは解ける
    const awaiting = block('仮説1 の聞きたいこと2')
    expect(within(awaiting).getByRole('textbox', { name: '仮説1 のFB5' })).toBeTruthy()
    expect(within(awaiting).queryByText(QUESTION_LABELS.feedback)).toBeNull()
  })

  it('末尾のブロックの「＋FB」は、どの問いにも紐づかない FB を作る', () => {
    const onAdd = vi.fn()
    render(<Harness index={0} onAdd={onAdd} />)
    fireEvent.click(
      within(looseBlock()).getByRole('button', {
        name: `仮説1 に${NO_ASK_TEXT}を足す`,
      }),
    )
    expect(onAdd).toHaveBeenCalledWith(null)
    expect(within(looseBlock()).getByRole('textbox', { name: '仮説1 のFB5' })).toBeTruthy()
  })
})

describe('AskBlock: FB の行', () => {
  it('削除ボタンを押すとその1件だけが消える', () => {
    render(<Harness index={1} />)
    fireEvent.click(screen.getByRole('button', { name: '仮説2 のFB2を消す' }))
    // **件数だけを見ない**（常に末尾を消す実装でも 3 → 2 は合う）。残った本文を見る
    const rest = screen
      .getAllByRole('textbox', { name: /^仮説2 のFB\d+$/ })
      .map((e) => (e as HTMLTextAreaElement).value)
    expect(rest).toEqual(['FB1', 'FB3'])
  })

  it('発言者と日付が行の右に出る（日付の入力欄は作らない）', () => {
    render(<Harness index={0} />)
    const row = block('仮説1 の聞きたいこと1')
    expect(within(row).getByText('佐藤さん · 8/12')).toBeTruthy()
    expect(within(row).getByText('田中さん · 8/14')).toBeTruthy()
    // 発言者が空なら日付だけ（中黒が浮かない）
    expect(within(looseBlock()).getByText('8/13')).toBeTruthy()
    // 日付は**アプリが追記時に入れる**。打たせる欄を作らない
    expect(screen.queryByRole('textbox', { name: /日付/ })).toBeNull()
  })

  it('sentiment ごとにアイコンの形が変わり、色は付かない', () => {
    render(<Harness index={0} />)
    const iconOf = (sentiment: string): HTMLElement => {
      const found = document.querySelector(`[data-sentiment="${sentiment}"] svg`)
      if (found === null) throw new Error(`${sentiment} のアイコンが無い`)
      return found as unknown as HTMLElement
    }
    // **形そのもの（svg の中身）で見る**——クラス名の付け方はライブラリの都合
    expect(iconOf('like').innerHTML).toBe(shapeOf(<ThumbsUp />))
    expect(iconOf('concern').innerHTML).toBe(shapeOf(<TriangleAlert />))
    expect(iconOf('question').innerHTML).toBe(shapeOf(<CircleHelp />))
    expect(iconOf('note').innerHTML).toBe(shapeOf(<MessageSquare />))
    // 4種が互いに違う形であること（同じ形に潰れていたら区別が付かない）
    const shapes = ['like', 'concern', 'question', 'note'].map((s) => iconOf(s).innerHTML)
    expect(new Set(shapes).size).toBe(4)
    // **意味軸の色（欠落・無効・着信・判断）を使わない**——sentiment は判断ではない
    for (const s of ['like', 'concern', 'question', 'note']) {
      const wrapper = document.querySelector(`[data-sentiment="${s}"]`)
      expect(wrapper?.className).not.toMatch(/missing|invalid|pending|judge/)
    }
  })
})

/**
 * **調子（`sentiment`）を選べるようにした**（m5 の追加作業）。それまでスキーマの
 * 4語のうちアプリから入るのは `note` だけで（`newFeedback` の既定）、
 * `like` / `concern` / `question` は Skill か手書きでしか入らなかった
 *——「スキーマが受け入れる値を、アプリからは選べない」の形である。
 *
 * **トリガーはアイコンそのもの**（判断のバッジと同じ考え方。`KindMenu`）
 */
describe('AskBlock: 調子を選ぶ', () => {
  /** 調子のトリガー（アイコン）を FB の番号で引く */
  const trigger = (n: number, label = '仮説1'): HTMLElement =>
    screen.getByRole('button', { name: `${label} のFB${n}の調子` })

  it('アイコンを押すと4語が出る（語はスキーマの説明から）', async () => {
    render(<Harness index={0} />)
    // トリガーはいまの調子を名乗る（FB1 は `like`）
    expect(trigger(1).getAttribute('data-sentiment')).toBe('like')
    fireEvent.pointerDown(trigger(1), { button: 0 })
    expect((await screen.findAllByRole('menuitem')).map((e) => e.textContent)).toEqual([
      SENTIMENT_LABELS.like,
      SENTIMENT_LABELS.concern,
      SENTIMENT_LABELS.question,
      SENTIMENT_LABELS.note,
    ])
    // **4語が尽きていること**——スキーマが増えたら `SENTIMENT_LABELS` で
    // `tsc` が落ち、この並びもそこから導かれる
    expect(SENTIMENT_ORDER).toHaveLength(4)
  })

  /**
   * **保存された値を見る。** アイコンの見た目だけを見ると、
   * `onFeedbackSentimentChange` を配線し忘れた実装（＝アイコンは押せるが値は
   * 変わらない）でも、再描画で元の形が出るだけなので緑になりかねない
   */
  it('選ぶとその FB の sentiment だけが差し替わる（保存された値で見る）', async () => {
    const onFile = vi.fn()
    render(<Harness index={0} onFile={onFile} />)
    fireEvent.pointerDown(trigger(1), { button: 0 })
    fireEvent.click(await screen.findByRole('menuitem', { name: SENTIMENT_LABELS.question }))
    const next: IssueTreeSchemaVersion4 = onFile.mock.calls[0][0]
    expect(next.hypotheses[0].feedbacks.map((f) => f.sentiment)).toEqual([
      'question',
      'note',
      'concern',
      'question',
    ])
    // **文言・発言者・日付は動かない**（分類し直しは「いつ言われたか」を変えない）
    expect(next.hypotheses[0].feedbacks[0]).toEqual({
      askId: A(1),
      text: FB_LIKE,
      by: '佐藤さん',
      sentiment: 'question',
      date: '2026-08-12',
    })
    // 画面のアイコンも新しい調子を名乗る（見る場所と変える場所が1つ）
    expect(trigger(1).getAttribute('data-sentiment')).toBe('question')
  })

  /**
   * **同時に開くのは1つ**（`openCell` の鍵1つ、という既存の約束）。
   * ブロックの側で `useState` を持つ実装だと、FB の数だけ独立した開閉ができる
   */
  it('メニューは同時に1つしか開かない', async () => {
    render(<Harness index={1} />)
    // **開いている間、外側は a11y ツリーから隠される**（Radix の modal な
    // メニュー）ので、2つ目のトリガーは `getByRole` では引けない。
    // DOM から直に引く
    const node = (n: number): HTMLElement => {
      const el = document.querySelector(`[aria-label="仮説2 のFB${n}の調子"]`)
      if (el === null) throw new Error(`FB${n} の調子のトリガーが無い`)
      return el as HTMLElement
    }
    const openMenus = (): number => document.querySelectorAll('[role="menu"]').length

    fireEvent.pointerDown(node(1), { button: 0 })
    expect(await screen.findAllByRole('menuitem')).toHaveLength(4)
    expect(openMenus()).toBe(1)
    // **ブロックごとに `useState` を持つ実装なら 2 つ開いたままになる**
    // ——開いている鍵は（本番も harness も）1つだけである
    fireEvent.pointerDown(node(2), { button: 0 })
    expect(openMenus()).toBeLessThanOrEqual(1)
    fireEvent.pointerDown(node(3), { button: 0 })
    expect(openMenus()).toBeLessThanOrEqual(1)
  })
})

describe('AskBlock: 節の末尾のボタン', () => {
  it('「聞きたいことを追加」で問いのブロックが増える', () => {
    render(<Harness index={1} />)
    // 仮説2 は問いを持たない（ブロックは「紐づかないFB」の1つだけ）
    expect(screen.getAllByRole('group')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '仮説2 にSHに聞きたいことを足す' }))
    const added = screen.getByRole('textbox', { name: '仮説2 の聞きたいこと1の文言' })
    expect((added as HTMLTextAreaElement).value).toBe('')
    fireEvent.change(added, { target: { value: '何回設定できれば足りるか' } })
    expect(
      (screen.getByRole('textbox', { name: '仮説2 の聞きたいこと1の文言' }) as HTMLTextAreaElement)
        .value,
    ).toBe('何回設定できれば足りるか')
  })

  /**
   * **文言は定数から引く**（打ち直さない）。「FBを追加」はキャンバスの逐語、
   * 「SHに聞きたいことを追加」は画面用の言い換え
   *——**画面だけが「誰に聞くか」まで言い、データと Skill の語彙は `asks` ＝
   * 「聞きたいこと」のまま**である（`ADD_ASK_LABEL` の解説）
   */
  it('2つのボタンの文言は定数のとおり', () => {
    render(<Harness index={0} />)
    expect(screen.getByRole('button', { name: '仮説1 にSHに聞きたいことを足す' }).textContent).toBe(
      ADD_ASK_LABEL,
    )
    expect(screen.getByRole('button', { name: '仮説1 にFBを足す' }).textContent).toBe(
      ADD_NOTE_LABEL,
    )
  })

  it('紐づかない FB が1件も無ければ、末尾のブロックは出ない', () => {
    const clean: IssueTreeSchemaVersion4 = {
      ...data,
      hypotheses: [
        {
          ...data.hypotheses[0],
          feedbacks: [data.hypotheses[0].feedbacks[0]],
        },
        data.hypotheses[1],
      ],
    }
    render(<Harness index={0} initial={clean} />)
    expect(screen.queryByText(NO_ASK_TEXT)).toBeNull()
    expect(screen.getAllByRole('group')).toHaveLength(2)
  })
})

/**
 * **「測定と描画」の対の、描画側の番人**（`Badge.dom.test.tsx` の
 * `h-[${BADGE_BOX_HEIGHT}px]` と同じ形）。`measure.ts` は定数とクラスを対で
 * 直す約束を註に持つが、**その約束を守っているかを見ているのは測定側だけ**
 * である。当たっているかだけを見る——寸法そのものは
 * jsdom に版組が無いので測れず、実機確認が守る
 */
describe('AskBlock: 測定と描画の対', () => {
  it('「＋FB」の高さとアイコンの空きは `MINI_ACTION_*` と対のクラス', () => {
    render(<Harness index={0} />)
    const mini = screen.getByRole('button', { name: '仮説1 の聞きたいこと1にFBを足す' })
    expect(mini.className).toContain(MINI_ACTION_HEIGHT_CLASS)
    expect(mini.className).toContain(MINI_ICON_GAP_CLASS)
  })

  it('削除ボタンの列幅は `FB_DELETE_WIDTH` と対のクラス（問いの見出しと FB の行で同じ）', () => {
    render(<Harness index={0} />)
    // レイアウトは `FB_DELETE_WIDTH` ぶんの列を空けている（`layout.ts`）。
    // 幅のクラスがずれると、押せる面と空けた列が食い違う
    expect(
      screen.getByRole('button', { name: '仮説1 の聞きたいこと1を消す' }).className,
    ).toContain(FB_DELETE_WIDTH_CLASS)
    expect(screen.getByRole('button', { name: '仮説1 のFB1を消す' }).className).toContain(
      FB_DELETE_WIDTH_CLASS,
    )
  })
})
