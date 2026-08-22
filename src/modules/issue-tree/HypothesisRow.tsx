import { buttonBase } from '@/components/button-styles'
import { CellInput, type FieldState } from '@/components/CellInput'
import type { Rect } from '@/core/canvas/viewport'
import type { JudgementEvent } from '@/types/issue-tree'
import { badgeClass } from './badge-styles'
import { hypothesisCellKey, type HypothesisCell } from './cell-keys'
import { badgeGroupOf, BADGE_LABELS, EVENT_KIND_LABELS, latestKind } from './derive'
import type { HypothesisPlacement } from './layout'
import { ADD_NOTE_LABEL, NO_JUDGEMENT_TEXT, SECTION_LABELS } from './layout'
import { BADGE_HEIGHT, ISSUE_BORDER, PANEL_BOX_CLASS, ROW_DOT_INSET, ROW_DOT_SIZE } from './measure'

/**
 * `data-cell` の値は `./cell-keys` が作る。**ここに書き写さないこと**
 *——エディタは同じ文字列でフォーカスの予約を引くので、2つ目のコピーが
 * できると「予約したのに当たらない」が静かに起きる（cell-keys.ts の解説）
 */

export interface HypothesisRowProps {
  /** 行の鍵（`computeRowKeys`）。`data-cell` はこれから作る */
  hypothesisKey: string
  /** アクセシブル名の接頭（`仮説{N}`） */
  label: string
  /** レイアウトが返した矩形。**行は寸法を再計算しない** */
  placement: HypothesisPlacement
  /** 親の箱の左上（世界座標）。行は箱の中に絶対配置されるので差し引く */
  origin: { x: number; y: number }
  text: string
  rationale: string
  notes: readonly string[]
  events: readonly JudgementEvent[]
  /** 整合性検証で赤表示の対象になっているか */
  invalid: boolean
  /** 祖先の見送りで抑制されているか */
  suppressed: boolean
  /** 展開しているか（`placement.expanded !== null` と一致する。エディタが両方を同じ状態から作る） */
  expanded: boolean
  onExpand: () => void
  onTextChange: (next: string) => void
  onRationaleChange: (next: string) => void
  onNoteChange: (noteIndex: number, next: string) => void
  /** **最新イベントの根拠だけが編集できる**（`setEventNote` が同じ規則を持つ） */
  onEventNoteChange: (eventIndex: number, next: string) => void
  /** FB1件を最新イベントの根拠へ移す */
  onPromoteNote: (noteIndex: number) => void
  onAddNote: () => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState, cell: HypothesisCell) => void
  /**
   * 判断イベントのドロップダウン。エディタが `menuPropsFor` で組んで渡す。
   * **必須にしてある**（`IssueBox` の `deferralMenu` と同じ）——省略できると、
   * 判断を付ける動線がマウスから消えていても型は通る
   */
  judgementMenu: React.ReactNode
}

/**
 * 入力欄の共通クラス。**面と文字色を持たない**——箱の面の上に透明で乗り、
 * 文字色は箱から継承する（抑制された配下がそのまま薄い文字に落ちる）。
 *
 * 余白も持たない。レイアウトは各行を「余白 0」で測っているので、ここで
 * padding を足すとブラウザが測定より早く折り返して文字が切れる
 */
const inputClass =
  'h-full w-full resize-none overflow-hidden bg-transparent whitespace-pre-wrap break-all outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-inset focus:ring-ring'

/** 節の見出し（text-xs）。レイアウトは `fonts.small` の1行で場所を空けている */
const sectionLabelClass = 'absolute overflow-hidden text-xs leading-none font-medium text-ink-muted select-none'

/** 読み取り専用の文章（以前の判断の根拠・「判断はまだ無い」） */
const staticTextClass = 'absolute overflow-hidden text-sm break-all whitespace-pre-wrap text-ink-muted'

/**
 * 仮説1件＝**課題の箱の中の1行**（M3 の文法）。
 *
 * 畳まれているときは「点・文言・行末のバッジ」の1行だけで、由来・根拠・FB・
 * 以前の判断は**展開したときにだけ**下のパネルへ出る。展開はビュー状態であり、
 * ファイルには書かない。
 *
 * **畳まれた行の `<button>` と、展開後の文言の `<textarea>` は同じ `data-cell`
 * を名乗る。** エディタはその文字列でフォーカスを予約するので（Tab で行に
 * 着いた瞬間に textarea へ移す継ぎ目）、**2つが同時に DOM にあってはならない**
 * ——`querySelector` は先頭を掴み、予約が静かに外れる。下の `open` 1つで
 * 分岐を束ね、両方が描かれる枝を構造的に作らない
 */
export function HypothesisRow(props: HypothesisRowProps) {
  const { placement, label, events, notes } = props
  const panel = props.expanded ? placement.expanded : null
  const open = panel !== null

  const cellOf = (cell: HypothesisCell): string => hypothesisCellKey(props.hypothesisKey, cell)

  /** 世界座標 → 箱の中（絶対配置の原点はパディングボックス＝枠線の内側） */
  const inBox = (r: Rect): React.CSSProperties => ({
    left: r.x - props.origin.x - ISSUE_BORDER,
    top: r.y - props.origin.y - ISSUE_BORDER,
    width: r.width,
    height: r.height,
  })
  /** 畳まれた行の中（ボタンの矩形が原点。ボタンは枠線を持たない） */
  const inRow = (r: Rect): React.CSSProperties => ({
    left: r.x - placement.rect.x,
    top: r.y - placement.rect.y,
    width: r.width,
    height: r.height,
  })

  // 現在ステータスは**最新イベントからの導出**（`derive.ts`）。
  // `hypothesisStatus` ではなく `latestKind` を呼ぶのは、props の
  // `readonly` な配列をそのまま渡せるため（写しを作らない）
  const group = badgeGroupOf(latestKind(events) ?? 'undecided')
  /**
   * 行頭の点（モックの `.row::before`）。**バッジと同じ高さに揃える**
   *——展開すると文言が折り返して行が縦に伸びるので、行の中央に置くと
   * 点だけがパネルの横まで下がる
   */
  const dot: Rect = {
    x: placement.rect.x + ROW_DOT_INSET,
    y: placement.badge.y + Math.floor((BADGE_HEIGHT - ROW_DOT_SIZE) / 2),
    width: ROW_DOT_SIZE,
    height: ROW_DOT_SIZE,
  }

  if (!open) {
    return (
      <button
        type="button"
        className="absolute rounded-sm text-left outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
        style={inBox(placement.rect)}
        aria-label={`${label}を開く`}
        data-cell={cellOf({ cell: 'hypothesis' })}
        // **Tab で行に着いた瞬間に開く。** エディタが同じ `data-cell` へ
        // フォーカスを予約するので、描画後に textarea へ移る
        onFocus={props.onExpand}
        onClick={props.onExpand}
      >
        <span
          aria-hidden="true"
          className={`absolute rounded-full ${props.suppressed ? 'bg-ink-faint' : 'bg-ink-muted'}`}
          style={inRow(dot)}
        />
        {/* 畳まれた行は**必ず1行**。レイアウトも1行で測っているので、
            改行は空白に潰してから省略記号に任せる */}
        <span
          className={`absolute truncate text-sm ${props.text === '' ? 'text-ink-muted' : ''}`}
          style={inRow(placement.text)}
        >
          {props.text === '' ? '仮説' : props.text.replace(/\n/g, ' ')}
        </span>
        <span className="absolute flex items-center justify-end" style={inRow(placement.badge)}>
          <span className={badgeClass(group, props.suppressed)}>{BADGE_LABELS[group]}</span>
        </span>
      </button>
    )
  }

  const latestIndex = events.length - 1
  const latest = events[latestIndex]

  return (
    <>
      <span
        aria-hidden="true"
        className={`absolute rounded-full ${props.suppressed ? 'bg-ink-faint' : 'bg-ink-muted'}`}
        style={inBox(dot)}
      />
      <div className="absolute" style={inBox(placement.text)}>
        <CellInput
          multiline
          autoSize={false}
          // 整合性検証の赤。**濃さは検算した `bg-warning/20`**（palette-requirements.ts の OVERLAYS）
          className={`${inputClass} text-sm font-medium ${props.invalid ? 'bg-warning/20' : ''}`}
          aria-label={label}
          placeholder="仮説"
          data-cell={cellOf({ cell: 'hypothesis' })}
          value={props.text}
          onValueChange={props.onTextChange}
          onFieldKeyDown={(e, state) => props.onFieldKeyDown?.(e, state, { cell: 'hypothesis' })}
        />
      </div>
      <span className="absolute flex items-center justify-end" style={inBox(placement.badge)}>
        <span className={badgeClass(group, props.suppressed)}>{BADGE_LABELS[group]}</span>
      </span>

      {/* パネルは面だけを描き、中身は同じ座標系（箱の中）に置く。
          後に描かれる要素が上に乗る＝面が中身を覆うことはない */}
      <div
        aria-hidden="true"
        className={`absolute rounded border-rule bg-canvas ${PANEL_BOX_CLASS}`}
        style={inBox(panel.panel)}
      />

      <div className={sectionLabelClass} style={inBox(panel.judgement.label)}>
        {SECTION_LABELS.judgement}
      </div>
      <span className="absolute flex items-start" style={inBox(panel.judgement.badge)}>
        <span className={badgeClass(latest === undefined ? 'open' : badgeGroupOf(latest.kind), props.suppressed)}>
          {latest === undefined ? BADGE_LABELS.open : EVENT_KIND_LABELS[latest.kind]}
        </span>
      </span>
      {latest === undefined ? (
        <div className={staticTextClass} style={inBox(panel.judgement.note)}>
          {NO_JUDGEMENT_TEXT}
        </div>
      ) : (
        <div className="absolute" style={inBox(panel.judgement.note)}>
          <CellInput
            multiline
            autoSize={false}
            className={`${inputClass} text-sm`}
            aria-label={`${label} の${EVENT_KIND_LABELS[latest.kind]}の根拠`}
            data-cell={cellOf({ cell: 'event', eventIndex: latestIndex })}
            value={latest.note}
            onValueChange={(next) => props.onEventNoteChange(latestIndex, next)}
            onFieldKeyDown={(e, state) =>
              props.onFieldKeyDown?.(e, state, { cell: 'event', eventIndex: latestIndex })
            }
          />
        </div>
      )}
      <div className="absolute flex items-start justify-end" style={inBox(panel.judgement.trigger)}>
        {props.judgementMenu}
      </div>

      {/* 以前の判断。**`CellInput` にしない**——追記専用の列であり、
          「そのとき何を根拠に決めたか」が後から書き換わってはならない。
          バッジは俯瞰の5語ではなく**正確な種別**で、面は薄い枠にする
          （いま決まっているのは最新1件だけだと見せる） */}
      {panel.previousLabel !== null && (
        <div className={sectionLabelClass} style={inBox(panel.previousLabel)}>
          {SECTION_LABELS.previous}
        </div>
      )}
      {panel.previous.map((rects, j) => {
        const event = events[j]
        if (event === undefined) return null
        return (
          <span key={`prev:${j}`}>
            <span className="absolute flex items-start" style={inBox(rects.badge)}>
              <span className={badgeClass(badgeGroupOf(event.kind), true)}>
                {EVENT_KIND_LABELS[event.kind]}
              </span>
            </span>
            <span className={staticTextClass} style={inBox(rects.note)}>
              {event.note}
            </span>
          </span>
        )
      })}

      <div className={sectionLabelClass} style={inBox(panel.rationale.label)}>
        {SECTION_LABELS.rationale}
      </div>
      <div className="absolute" style={inBox(panel.rationale.cell)}>
        <CellInput
          multiline
          autoSize={false}
          className={`${inputClass} text-sm`}
          aria-label={`${label} の由来`}
          placeholder="由来（任意）"
          data-cell={cellOf({ cell: 'rationale' })}
          value={props.rationale}
          onValueChange={props.onRationaleChange}
          onFieldKeyDown={(e, state) => props.onFieldKeyDown?.(e, state, { cell: 'rationale' })}
        />
      </div>

      <div className={sectionLabelClass} style={inBox(panel.notes.label)}>
        {SECTION_LABELS.notes}
      </div>
      {panel.notes.cells.map((r, i) => (
        <div key={`note:${i}`} className="group/note absolute" style={inBox(r)}>
          <CellInput
            multiline
            autoSize={false}
            className={`${inputClass} text-sm`}
            aria-label={`${label} のFB${i + 1}`}
            data-cell={cellOf({ cell: 'note', noteIndex: i })}
            value={notes[i] ?? ''}
            onValueChange={(next) => props.onNoteChange(i, next)}
            onFieldKeyDown={(e, state) =>
              props.onFieldKeyDown?.(e, state, { cell: 'note', noteIndex: i })
            }
          />
          {/* **イベントが1件以上あるときだけ出す**（0件では移動先が無く、
              押しても何も起きないボタンになる）。**常時は出さない**——FB の
              幅は測定した折り返し幅そのもので、上に不透明なボタンを重ねると
              1行目の末尾が読めなくなる。ホバーだけでなく focus-within でも
              出すので、キーボードでは FB の欄から Tab で辿り着ける */}
          {events.length > 0 && (
            <button
              type="button"
              className={`${buttonBase} invisible absolute top-0 right-0 border border-rule bg-surface px-1 text-xs group-hover/note:visible group-focus-within/note:visible hover:bg-canvas`}
              aria-label={`${label} のFB${i + 1} を根拠へ移す`}
              onClick={() => props.onPromoteNote(i)}
            >
              根拠へ
            </button>
          )}
        </div>
      ))}
      <div className="absolute flex items-center" style={inBox(panel.notes.add)}>
        <button
          type="button"
          className={`${buttonBase} gap-1 border border-rule bg-surface px-1 text-xs text-ink-muted hover:bg-canvas`}
          aria-label={`${label} にFBを足す`}
          onClick={props.onAddNote}
        >
          {ADD_NOTE_LABEL}
        </button>
      </div>
    </>
  )
}
