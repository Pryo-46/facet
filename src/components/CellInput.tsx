import { useLayoutEffect, useRef, useState } from 'react'
import { isCompositionTail, isImeProcessingKey } from '@/core/keyboard/ime'

/** キー処理に必要な入力欄の状態。操作言語の KeyContext に詰め替えて使う */
export interface FieldState {
  empty: boolean
  caretAtStart: boolean
  caretAtEnd: boolean
}

/**
 * 折り返しの上限。これを超えたらセル内スクロールに切り替わる。
 * M8 は5行で確定したが、エラーカタログ（M10 決定17）が8列を1440pxの窓に
 * 並べると1列170px前後になり、日本語で1行11文字・5行で55文字が上限になる。
 * 対応文の多くが内部スクロールに落ちるため8行へ上げた（88文字まで表示できる）。
 * 行の高さが揃わなくなるが、読めないよりよい。
 * **全モジュール共通の値**なので、用語集の定義・備考セルも8行まで伸びる
 */
const MAX_ROWS = 8

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
  /**
   * 内容から行数を測って高さを決めるか（既定 true）。
   *
   * **false にするのは、呼び出し側が既に高さを知っているときだけ。**
   * ロジックツリーのノードは測定層が幅と行数を確定させており（1パスで
   * 描くための前提）、ここで再計測すると `MAX_ROWS` の上限に切り詰められる
   */
  autoSize?: boolean
}

/**
 * 表のセル用の制御入力。IME 対応（rev 10章）を1箇所に閉じる。
 *
 * - 変換中は親へ値を上げない。上げると親の再レンダリングで未確定文字列が
 *   巻き戻り、IME が壊れる（日本語入力アプリ最大の地雷）
 * - 親から来た value が変わったらドラフトを捨てる。これが Undo と
 *   外部変更の取り込みを表示に反映する経路になる
 * - 変換に属する打鍵は onFieldKeyDown を呼ばない。**変換中だけでなく
 *   「確定した直後」も含む**——WebKit（macOS / Linux）は確定の Enter を
 *   compositionend の後に isComposing: false で投げてくるので、操作言語の
 *   IME ガードだけでは行追加として消費されてしまう（`isCompositionTail`）
 * - キーの意味は決めない。onFieldKeyDown に状態を添えて渡すだけ。
 *   **Enter を止めるのも呼び出し側の仕事**である——素の Enter は
 *   操作言語が行追加として消費し（preventDefault される）、
 *   Shift+Enter / Alt+Enter は誰も消費しないのでブラウザが改行を入れる
 */
export function CellInput(props: CellInputProps) {
  const {
    value,
    onValueChange,
    sanitize,
    onFieldKeyDown,
    multiline,
    placeholder,
    className,
    autoSize = true,
  } = props
  // 未反映の生入力。null＝表示は親の value をそのまま使う
  const [draft, setDraft] = useState<string | null>(null)
  // 直近に見た親の value。変わったらドラフトを捨てる
  const [seenValue, setSeenValue] = useState(value)
  const composing = useRef(false)
  // 直近に変換が終わった時刻。WebKit はここから遅れて確定の keydown を投げてくる
  // （`isCompositionTail` の解説を読むこと）。null＝確定の尾を待っていない
  const composedAt = useRef<number | null>(null)
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
   * 測れないときは何もしない。`MAX_ROWS` の上限が効いているかの確認は実機で行う。
   *
   * 関数として括り出してあるのは、内容が変わったとき（値の変化）だけでなく
   * **幅が変わったとき**にも呼び直す必要があるため（下の ResizeObserver）。
   * 列幅ドラッグや窓リサイズで折り返しに必要な行数が変わっても元の実装は
   * 依存配列に幅を持たず再計算しなかった。既定の overflow: auto で
   * はみ出た行が隠れ、「入れたはずの行が消えた」ように見えていた
   */
  const measure = () => {
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
  }

  useLayoutEffect(() => {
    if (!autoSize) return
    measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure は毎レンダー再生成される安定した処理。値と幅の変化だけを見る
  }, [draft, value, multiline, autoSize])

  /**
   * 幅の変化に反応する。列幅ドラッグ（M8 決定8〜10）で定義・備考列が
   * 狭まったとき、あるいは窓リサイズで定義列が縮んで吸収したとき
   * （M8 決定9）、textarea 自身の幅が変わる。ResizeObserver で
   * それを直接検知する——値の変化を見る上の effect では幅の変化は拾えない
   *
   * **multiline のときだけ張る。** 単一行の <input> は折り返さないので
   * 幅の変化と行数は無関係であり、キー入力のたびに ResizeObserver の
   * 生成・破棄を繰り返す理由が無い
   *
   * **jsdom には ResizeObserver が無い。** テスト環境では張らずに抜ける
   * ——上の measure() が「測れないときは何もしない」形になっているのと
   * 同じ考え方で、無ければ動作をスキップするだけにしてテストを壊さない
   */
  useLayoutEffect(() => {
    if (!autoSize) return
    if (!multiline) return
    const el = areaRef.current
    if (el === null) return
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure は毎レンダー再生成される安定した処理。observer の張り替えは multiline と autoSize の変化だけで駆動する
  }, [multiline, autoSize])

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
      composedAt.current = null
    },
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composing.current = false
      composedAt.current = e.timeStamp
      const raw = e.currentTarget.value
      setDraft(raw)
      commit(raw)
    },
    // キーを離したら確定の尾は終わり。**これが Chromium 側の安全弁になっている**
    // ——あちらは compositionend のあとに確定キーの keyup が来るので、
    // 次の打鍵が窓に入る余地がそもそも無くなる（`isCompositionTail` の解説）
    onKeyUp: () => {
      composedAt.current = null
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // 変換に属する打鍵は呼び出し側へ渡さない。**IME の面倒はここで完結させる**
      // ——各ツールの keydown ハンドラに同じ判定を撒くと、次に増えるツールが
      // 落とす（操作言語は「意味」だけを受け取る、が rev 10章の建て付け）
      if (composing.current) return
      // IME が食った打鍵（keyCode 229）。WKWebView では確定の Enter がこれで来る
      if (isImeProcessingKey(e.nativeEvent.keyCode)) return
      if (isCompositionTail(e.timeStamp, composedAt.current)) {
        // 一度きり。確定の Enter を捨てたあとの打鍵は普通の操作として通す
        composedAt.current = null
        return
      }
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
    onBlur: () => {
      composedAt.current = null
      setDraft(null)
    },
  }

  if (multiline) {
    return <textarea {...shared} ref={areaRef} rows={rows} />
  }
  return <input {...shared} />
}
