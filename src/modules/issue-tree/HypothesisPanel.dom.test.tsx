// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { badgeClass } from '@/components/badge-styles'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion3 } from '@/types/issue-tree'
import { badgeVariantOf } from './badge-variant'
import { EVENT_KIND_LABELS, poseQuestions } from './derive'
import { HypothesisPanel } from './HypothesisPanel'
import {
  layoutIssueTree,
  NO_JUDGEMENT_TEXT,
  SECTION_LABELS,
  type IssueTreeFonts,
} from './layout'
import { ACTION_HEIGHT_CLASS, HYPO_TITLE_FONT_CLASS } from './measure'

afterEach(cleanup)

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/** 測定は決定的な概算器で行う（jsdom はレイアウトを持たない） */
const fonts: IssueTreeFonts = {
  title: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  expandedTitle: { measure: createEstimateMeasurer(18), lineHeight: 27 },
  body: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  small: { measure: createEstimateMeasurer(14), lineHeight: 18 },
}

/**
 * **目印の文字列を使う**（`HypothesisRow.dom.test.tsx` と同じ流儀）——「出ている」を
 * 空でない値で見ると、フィクスチャを変えただけで意味が変わる
 */
const DETAIL_SENTINEL = '受信を待たずに画面を返す（DETAIL）'
const VALUE_SENTINEL = '応募者を待たせない（VALUE）'
const ASK_SENTINEL = '待ち画面で離脱しないか（ASK）'
/**
 * 判断のドロップダウンの目印。**中身はエディタが組む**（m5 Task 6 で状態の
 * バッジもトリガーの中へ入った）ので、パネルの側で見るのは「帯のどこに
 * 置かれるか」だけである——ここに本物のバッジを書き写すと、テストが
 * パネルではなく写しを検査することになる
 */
const MENU_SENTINEL = '判断のトリガー（MENU）'

/**
 * 課題2件・仮説3件のファイル。**退化した形（仮説1件・イベント1件）を避ける**
 * ——「最新だけ編集できる」は要素が1つだと「全部編集できる」と区別が付かない
 */
const data: IssueTreeSchemaVersion3 = {
  schemaVersion: 3,
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
      detail: DETAIL_SENTINEL,
      value: VALUE_SENTINEL,
      asks: [{ id: 'ask_AAAAAAAAAA', text: ASK_SENTINEL }],
      feedbacks: [],
      events: [
        { kind: 'supported', note: '前回の実測値がそのまま使える', date: '2026-08-01' },
        { kind: 'rejected', note: '実機では3秒を超えた', date: '2026-08-13' },
      ],
    },
    {
      // **詳細も価値仮説も判断も空の仮説**（D7 の番人と「日付は判断があるときだけ」の裏）
      id: H(2),
      issueId: I(1),
      title: 'webhook受信に切り替える',
      detail: '',
      value: '',
      asks: [],
      feedbacks: [
        { askId: null, text: '受信の重複をどう畳むか', by: '', sentiment: 'note', date: '2026-08-01' },
        { askId: null, text: '再送の窓は何分か', by: '', sentiment: 'note', date: '2026-08-01' },
      ],
      events: [],
    },
    {
      id: H(3),
      issueId: I(0),
      title: '先に受付IDだけ返す',
      detail: '',
      value: '',
      asks: [],
      feedbacks: [
        { askId: null, text: '画面側の待ち表示は別課題', by: '', sentiment: 'note', date: '2026-08-01' },
      ],
      events: [{ kind: 'supported', note: '', date: '2026-08-01' }],
    },
  ],
}

const posed = poseQuestions(data)

function renderPanel(index: number, opts: { suppressed?: boolean } = {}) {
  const h = data.hypotheses[index]
  const ownerIndex = data.issues.findIndex((n) => n.id === h.issueId)
  // **第4引数は「展開している課題の添字」**（m5）。パネルはその課題の全仮説に出る
  const layout = layoutIssueTree(data, posed, fonts, ownerIndex)
  const placement = layout.hypotheses[index]
  if (placement === null) throw new Error(`仮説${index + 1}が図に位置を持たない`)
  if (placement.expanded === null) throw new Error(`仮説${index + 1}のパネルが無い`)
  const owner = layout.issues[ownerIndex]
  if (owner === null) throw new Error('持ち主の課題が図に位置を持たない')
  const onAddFeedback = vi.fn()
  const onAddAsk = vi.fn()
  const onDelete = vi.fn()
  const onDetailChange = vi.fn()
  const onValueChange = vi.fn()
  render(
    <HypothesisPanel
      hypothesisKey={`row${index}`}
      label={`仮説${index + 1}`}
      panel={placement.expanded}
      origin={owner.rect}
      hypothesis={h}
      invalid={false}
      suppressed={opts.suppressed === true}
      onTitleChange={vi.fn()}
      onDetailChange={onDetailChange}
      onValueChange={onValueChange}
      onAskTextChange={vi.fn()}
      onFeedbackTextChange={vi.fn()}
      onEventNoteChange={vi.fn()}
      onAddAsk={onAddAsk}
      onRemoveAsk={vi.fn()}
      onAddFeedback={onAddFeedback}
      onRemoveFeedback={vi.fn()}
      onDelete={onDelete}
      // 判断のドロップダウンはエディタが組む（パネルは置き場所だけを持つ）。
      // **状態のバッジもその中**（m5 Task 6：バッジ自身がトリガー）なので、
      // ここは目印のボタン1つでよい
      judgementMenu={<button type="button">{MENU_SENTINEL}</button>}
    />,
  )
  return { onAddAsk, onAddFeedback, onDelete, onDetailChange, onValueChange }
}

/**
 * 節の見出しを引く。**`{ selector: 'span' }` が要る**——FB の節の見出しは
 * `FB` で、問いブロックの中の「＋FB」ボタンの文言と同じ字面だからである
 *（ボタンの側は `<button>`）
 */
const sectionLabel = (text: string): HTMLElement => screen.getByText(text, { selector: 'span' })

/** DOM 順（＝描画順）で a が b より前にあるか */
function precedes(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
}

describe('HypothesisPanel: 節の構成', () => {
  it('節が「ソリューション仮説」「価値仮説」「検証結果」「FB」の順に並ぶ', () => {
    renderPanel(0)
    const labels = [
      SECTION_LABELS.solution,
      SECTION_LABELS.value,
      SECTION_LABELS.judgement,
      SECTION_LABELS.notes,
    ].map(sectionLabel)
    for (let i = 1; i < labels.length; i += 1) {
      expect(precedes(labels[i - 1], labels[i])).toBe(true)
    }
  })

  /**
   * **「以前の判断」はキャンバスに描かれていないが消さない**——追記専用の列
   *（覆される前の判断とその根拠）を読める唯一の場所である。判断が2件以上の
   * ときだけ出るので、同じテストで有り／無しの両方を見る
   */
  it('「以前の判断」の節は判断が2件以上のときだけ、検証結果とFBの間に出る', () => {
    renderPanel(0)
    const previous = sectionLabel(SECTION_LABELS.previous)
    expect(precedes(sectionLabel(SECTION_LABELS.judgement), previous)).toBe(true)
    expect(precedes(previous, sectionLabel(SECTION_LABELS.notes))).toBe(true)
    cleanup()
    renderPanel(1)
    expect(screen.queryByText(SECTION_LABELS.previous)).toBeNull()
  })
})

describe('HypothesisPanel: 仮説の削除', () => {
  /**
   * **ゴミ箱は「ソリューション仮説」の見出しの帯の中**（キャンバスの `.trash`）。
   * 名前で引くだけだと、帯の外——たとえばパネルの隅——に置いても緑になる。
   * 帯そのものを親として見る（`ml-auto` が右端へ寄せるのはその帯の中である）
   */
  it('ゴミ箱は「ソリューション仮説」の見出しの帯の中にある', () => {
    const { onDelete } = renderPanel(0)
    const trash = screen.getByRole('button', { name: '仮説1を削除' })
    const band = sectionLabel(SECTION_LABELS.solution).parentElement
    expect(band).not.toBeNull()
    expect(band!.contains(trash)).toBe(true)
    // 帯の中で右端へ寄る（帯は flex。矩形はレイアウトが測った1つだけ）
    expect(trash.className).toContain('ml-auto')
    // **確認ダイアログを挟まない**——押したら消える（Undo は額縁側）
    fireEvent.click(trash)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})

describe('HypothesisPanel: ソリューション仮説と価値仮説', () => {
  it('タイトル・詳細・価値仮説がそれぞれ欄になる', () => {
    const { onDetailChange, onValueChange } = renderPanel(0)
    // タイトルは閉じた行と同じ鍵（`hyp:`）を名乗る欄。名前は接頭のまま
    expect(screen.getByRole('textbox', { name: '仮説1' })).toBeInstanceOf(HTMLTextAreaElement)
    const detail = screen.getByRole('textbox', { name: '仮説1 の詳細' })
    const value = screen.getByRole('textbox', { name: '仮説1 の価値仮説' })
    expect((detail as HTMLTextAreaElement).value).toBe(DETAIL_SENTINEL)
    expect((value as HTMLTextAreaElement).value).toBe(VALUE_SENTINEL)
    fireEvent.change(detail, { target: { value: '書き換えた詳細' } })
    expect(onDetailChange).toHaveBeenCalledWith('書き換えた詳細')
    fireEvent.change(value, { target: { value: '書き換えた価値' } })
    expect(onValueChange).toHaveBeenCalledWith('書き換えた価値')
  })

  /**
   * **設計ノート D7 の規律。** `detail` / `value` は空でも問いを立てない
   *（スキーマにも「空でも warning にしない」と書いてある）。欠落の面
   *（`missing-face`）や欠落の枠が付き始めたら、空の仮説が図の大半で
   * 警告色になり、地の色が意味を失う
   */
  it('詳細と価値仮説が空でも問いは立たない（欠落の印を付けない）', () => {
    renderPanel(1)
    for (const name of ['仮説2 の詳細', '仮説2 の価値仮説']) {
      const field = screen.getByRole('textbox', { name })
      expect((field as HTMLTextAreaElement).value).toBe('')
      // 欄にも、欄を包む枠にも欠落・無効の面や線を付けない
      expect(/missing|invalid/.test(field.className)).toBe(false)
      expect(/missing|invalid/.test((field.parentElement as HTMLElement).className)).toBe(false)
    }
    // **パネルは欠落の語彙をひとつも使わない。** 「未決」のバッジは m5 Task 6 で
    // 判断のトリガー（＝エディタが組む）の中へ移ったので、ここに `missing` の
    // 面や線が現れたら、それは空の欄のために増えた印である
    expect(
      Array.from(document.querySelectorAll('[class*="missing"]')).map((e) => e.textContent),
    ).toEqual([])
  })

  /**
   * **`layout.test.ts` の `SECTION_LABELS` の鍵の並びテストと対の番人**
   *（m4 から引き継ぎ、m5 Task 4 で行からパネルへ移した）。`Hypothesis` 型に
   * `rationale` が無いので型も番人ではあるが、**画面の側にも置いておく**
   *——v3 で廃止した欄が「詳細」や「価値仮説」の顔で復活するのを、
   * 節を増やすときに気づける場所はここしかない
   */
  it('展開しても「由来」の欄は無い（v3 で廃止）', () => {
    renderPanel(0)
    expect(screen.queryByRole('textbox', { name: /の由来$/ })).toBeNull()
    expect(screen.queryByText('由来')).toBeNull()
  })

  /**
   * 問い（`asks`）は FB の節の中の**ブロック**として出る（m5 Task 5）。
   * 入れ子の中身は `AskBlock.dom.test.tsx` が見るので、ここでは
   * 「節の中に出ている」ことだけを確かめる
   */
  it('問い（asks）は FB の節の中に出る', () => {
    renderPanel(0)
    const ask = screen.getByRole('textbox', { name: '仮説1 の聞きたいこと1の文言' })
    expect((ask as HTMLTextAreaElement).value).toBe(ASK_SENTINEL)
    expect(precedes(sectionLabel(SECTION_LABELS.notes), ask)).toBe(true)
  })
})

describe('HypothesisPanel: 検証結果', () => {
  it('判断があれば日付が見出しの行に出る（状態の語はトリガーが運ぶ）', () => {
    renderPanel(0)
    // 日付は `YYYY-MM-DD` をそのまま出さない（画面は月日だけ）
    const date = screen.getByText('8/13 更新')
    expect(precedes(sectionLabel(SECTION_LABELS.judgement), date)).toBe(true)
    // **最新の判断の語をパネルは自分で描かない**（m5 Task 6）——描くと、
    // トリガーのバッジと合わせて同じ語が帯に2つ出る
    expect(screen.queryByText(EVENT_KIND_LABELS.rejected)).toBeNull()
  })

  it('検証結果の日付は判断があるときだけ出る', () => {
    renderPanel(1)
    expect(screen.queryByText(/更新$/)).toBeNull()
    // プレースホルダと、判断を付ける動線（バッジのトリガー）は出る
    expect(screen.getByText(NO_JUDGEMENT_TEXT)).toBeTruthy()
    const trigger = screen.getByRole('button', { name: MENU_SENTINEL })
    // **トリガーは見出しの帯の中**——見出しの隣に、同じ1行の要素として並ぶ
    expect(trigger.parentElement).toBe(sectionLabel(SECTION_LABELS.judgement).parentElement)
    expect(precedes(sectionLabel(SECTION_LABELS.judgement), trigger)).toBe(true)
  })

  /**
   * これが壊れると「追記専用」がデータの上（`setEventNote`）だけの約束になり、
   * 画面からは静かに破れる——過去の根拠が編集できると、
   * 「そのとき何を根拠に決めたか」が後から書き換わる
   */
  it('根拠を編集できるのは最新のイベントだけ', () => {
    renderPanel(0)
    expect(screen.getAllByRole('textbox', { name: /の根拠$/ })).toHaveLength(1)
    expect(
      screen.getByRole('textbox', { name: `仮説1 の${EVENT_KIND_LABELS.rejected}の根拠` }),
    ).toBeInstanceOf(HTMLTextAreaElement)
    // 「引けない」だけでは消えていても緑になる。読めることまで見る
    expect(screen.getByText('前回の実測値がそのまま使える')).toBeTruthy()
  })

  /**
   * 覆される前の判断が「いま決まっていること」に見えないのは薄い枠のおかげで、
   * それが崩れると履歴が現役の判断の顔をする（語では区別できない）
   */
  it('以前の判断は薄い面で出る', () => {
    renderPanel(0)
    expect(screen.getByText(EVENT_KIND_LABELS.supported).className).toBe(
      badgeClass(badgeVariantOf('yes', true)),
    )
  })
})

describe('HypothesisPanel: FB', () => {
  it('FB は1件ずつ欄になり、末尾に2つの追加ボタンがある', () => {
    const { onAddAsk, onAddFeedback } = renderPanel(1)
    expect(screen.getByRole('textbox', { name: '仮説2 のFB1' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '仮説2 のFB2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '仮説2 に聞きたいことを足す' }))
    expect(onAddAsk).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '仮説2 にFBを足す' }))
    // **節の末尾の「＋ FBを追加」は、どの問いにも紐づかない FB を作る**
    //（`addFeedback` の `askId` は必須。既定 `null` に頼らない）
    expect(onAddFeedback).toHaveBeenCalledWith(null)
  })
})

/**
 * **「測定と描画」の対の、描画側の番人**（`Badge.dom.test.tsx` の
 * `h-[${BADGE_BOX_HEIGHT}px]` と同じ形）。
 *
 * `measure.ts` の定数と Tailwind クラスは対で直す約束だが、**その約束を
 * 守っているかを見ているのは測定側だけ**という状態が m5 で4件出た。
 * ここは「定数の指すクラスが、実際にその要素へ当たっている」ことだけを
 * 見る——jsdom に版組は無いので、寸法そのものは実機確認が守る
 */
describe('HypothesisPanel: 測定と描画の対', () => {
  it('仮説のタイトルは `HYPO_TITLE_FONT_CLASS` で描かれる（測るのは fonts.title）', () => {
    renderPanel(0)
    expect(screen.getByRole('textbox', { name: '仮説1' }).className).toContain(
      HYPO_TITLE_FONT_CLASS,
    )
  })

  it('節の末尾の追加ボタンの高さは `ACTION_HEIGHT` と対のクラス', () => {
    renderPanel(1)
    // レイアウトは `ACTION_HEIGHT` ぶんの帯を空けている（`layout.ts`）。
    // クラスを当て忘れるとボタンの実高だけが縮み、定数が静かに嘘になる
    for (const name of ['仮説2 に聞きたいことを足す', '仮説2 にFBを足す']) {
      expect(screen.getByRole('button', { name }).className, name).toContain(ACTION_HEIGHT_CLASS)
    }
  })
})
