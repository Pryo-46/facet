import { useLayoutEffect, useRef, useState } from 'react'

/** キー処理に必要な入力欄の状態。操作言語の KeyContext に詰め替えて使う */
export interface FieldState {
  empty: boolean
  caretAtStart: boolean
  caretAtEnd: boolean
}

/** 折り返しの上限。これを超えたらセル内スクロールに切り替わる（M8 決定5） */
const MAX_ROWS = 5

export interface CellInputProps {
  value: string
  onValueChange: (next: string) => void
  /**
   * 生入力をデータに載せる値へ変換する。null＝この入力はデータに反映しない。
   * 例: 名称はスキーマで minLength 1 なので、空にしている途中の状態を
   * 書き込むとレベル1違反ファイルを自分で作ってしまう
   */
  sanitize?: (raw: string) => string | null
  /** キー処理は呼び出し側（操作言語）が行う。ここではキーの意味を決めない */
  onFieldKeyDown?: (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    state: FieldState,
  ) => void
  /**
   * 折り返す（textarea にする）。定義・備考のように自由記述が入る欄だけ true。
   *
   * **名称・別名は false のままにすること。** input はブラウザ既定で改行を
   * 含むペーストから改行を落とすので、「名称に改行が入って Markdown の
   * 見出しと表が壊れる」経路が構造的に塞がる（M8 決定4）
   */
  multiline?: boolean
  placeholder?: string
  className?: string
  'aria-label': string
  'data-cell'?: string
}

/**
 * 表のセル用の制御入力。IME 対応（rev 10章）を1箇所に閉じる。
 *
 * - 変換中は親へ値を上げない。上げると親の再レンダリングで未確定文字列が
 *   巻き戻り、IME が壊れる（日本語入力アプリ最大の地雷）
 * - 親から来た value が変わったらドラフトを捨てる。これが Undo と
 *   外部変更の取り込みを表示に反映する経路になる
 * - キーの意味は決めない。onFieldKeyDown に状態を添えて渡すだけ。
 *   **Enter を止めるのも呼び出し側の仕事**である——素の Enter は
 *   操作言語が行追加として消費し（preventDefault される）、
 *   Shift+Enter / Alt+Enter は誰も消費しないのでブラウザが改行を入れる
 */
export function CellInput(props: CellInputProps) {
  const { value, onValueChange, sanitize, onFieldKeyDown, multiline, placeholder, className } =
    props
  // 未反映の生入力。null＝表示は親の value をそのまま使う
  const [draft, setDraft] = useState<string | null>(null)
  // 直近に見た親の value。変わったらドラフトを捨てる
  const [seenValue, setSeenValue] = useState(value)
  const composing = useRef(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const [rows, setRows] = useState(1)

  if (value !== seenValue) {
    setSeenValue(value)
    setDraft(null)
  }

  const commit = (raw: string) => {
    const next = sanitize ? sanitize(raw) : raw
    if (next !== null) onValueChange(next)
  }

  /**
   * 内容に合わせて行数を決める。**ピクセルの max-height を書かない**ので、
   * フォントサイズや行間（M7 が確定した 1.65）を変えても自動で追従する。
   *
   * **jsdom はレイアウトを持たない**（scrollHeight が常に 0、lineHeight は
   * 空文字）。そこで抜けないと rows={NaN} を React へ渡すことになるため、
   * 測れないときは何もしない。5行上限が効いているかの確認は実機で行う
   */
  useLayoutEffect(() => {
    const el = areaRef.current
    if (el === null) return
    const style = getComputedStyle(el)
    const lineHeight = Number.parseFloat(style.lineHeight)
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) return
    const paddingTop = Number.parseFloat(style.paddingTop)
    const paddingBottom = Number.parseFloat(style.paddingBottom)
    const padding =
      (Number.isFinite(paddingTop) ? paddingTop : 0) +
      (Number.isFinite(paddingBottom) ? paddingBottom : 0)
    // 測るために一度1行へ戻す。React は次のレンダで rows を書き戻す
    el.rows = 1
    const needed = Math.max(1, Math.round((el.scrollHeight - padding) / lineHeight))
    const next = Math.min(needed, MAX_ROWS)
    el.rows = next
    setRows((prev) => (prev === next ? prev : next))
  }, [draft, value, multiline])

  const shared = {
    className,
    placeholder,
    'aria-label': props['aria-label'],
    'data-cell': props['data-cell'],
    value: draft ?? value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = e.target.value
      setDraft(raw)
      if (composing.current) return
      commit(raw)
    },
    onCompositionStart: () => {
      composing.current = true
    },
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composing.current = false
      const raw = e.currentTarget.value
      setDraft(raw)
      commit(raw)
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const el = e.currentTarget
      onFieldKeyDown?.(e, {
        empty: el.value === '',
        // 折り返しの途中では caretAtStart / caretAtEnd が false になるので、
        // ↑↓ は操作言語に取られずブラウザの行内移動が生きる（M8 決定4）。
        //
        // **選択範囲があるときは両方 false になる（＝行間移動に1打鍵余分に要る）。
        // これは仕様である**——Excel をはじめ表形式の入力欄は同じ挙動で、
        // 「選択したまま矢印でセルを移る」を許すと選択の解除と移動の
        // どちらを意図したのか判別できない（M8 で残件から落とした）
        caretAtStart: el.selectionStart === 0 && el.selectionEnd === 0,
        caretAtEnd:
          el.selectionStart === el.value.length && el.selectionEnd === el.value.length,
      })
    },
    // 反映されなかった入力（空の名称など）を残さない。抜けたら確定値に戻す
    onBlur: () => setDraft(null),
  }

  if (multiline) {
    return <textarea {...shared} ref={areaRef} rows={rows} />
  }
  return <input {...shared} />
}
