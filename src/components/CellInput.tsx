import { useRef, useState } from 'react'

/** キー処理に必要な入力欄の状態。操作言語の KeyContext に詰め替えて使う */
export interface FieldState {
  empty: boolean
  caretAtStart: boolean
  caretAtEnd: boolean
}

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
  onFieldKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>, state: FieldState) => void
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
 * - キーの意味は決めない。onFieldKeyDown に状態を添えて渡すだけ
 */
export function CellInput(props: CellInputProps) {
  const { value, onValueChange, sanitize, onFieldKeyDown, placeholder, className } = props
  // 未反映の生入力。null＝表示は親の value をそのまま使う
  const [draft, setDraft] = useState<string | null>(null)
  // 直近に見た親の value。変わったらドラフトを捨てる
  const [seenValue, setSeenValue] = useState(value)
  const composing = useRef(false)

  if (value !== seenValue) {
    setSeenValue(value)
    setDraft(null)
  }

  const commit = (raw: string) => {
    const next = sanitize ? sanitize(raw) : raw
    if (next !== null) onValueChange(next)
  }

  return (
    <input
      className={className}
      placeholder={placeholder}
      aria-label={props['aria-label']}
      data-cell={props['data-cell']}
      value={draft ?? value}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        if (composing.current) return
        commit(raw)
      }}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={(e) => {
        composing.current = false
        const raw = e.currentTarget.value
        setDraft(raw)
        commit(raw)
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget
        onFieldKeyDown?.(e, {
          empty: el.value === '',
          caretAtStart: el.selectionStart === 0 && el.selectionEnd === 0,
          caretAtEnd:
            el.selectionStart === el.value.length && el.selectionEnd === el.value.length,
        })
      }}
      // 反映されなかった入力（空の名称など）を残さない。抜けたら確定値に戻す
      onBlur={() => setDraft(null)}
    />
  )
}
