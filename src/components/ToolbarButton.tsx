import type { MouseEvent, ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export interface ToolbarButtonProps {
  /**
   * 押せない理由。**null なら押せる。** 文字列を渡すと、その文がツールチップに出る
   */
  unusable: string | null
  onClick: () => void
  children: ReactNode
}

/**
 * 「このツールは対応していません」——ツールが宣言していない出力・交換に共通の
 * 理由。**ボタンの label が「何を」に当たるので、理由の中で繰り返さない**
 * （`表形式でコピー` ボタンにわざわざ「表形式コピーに対応していません」と
 * 言い直さない）。分かれていると、直すときに1箇所だけ直り忘れて文言が
 * 食い違う。呼び出し側（`App.tsx` / `ExportMenu.tsx`）はこれを import して使うこと
 */
export const UNSUPPORTED_REASON = 'このツールは対応していません'

/**
 * 額縁の出力ボタン（ExportMenu・表形式でコピー・Miro 交換）の共通の土台。
 * 「どのボタンがいま使えるのか、なぜ押せないのか」を画面で答えるための部品。
 *
 * **`disabled` 属性を使わない。** ブラウザは `disabled` な要素からポインタ
 * イベントを丸ごと落とすため、`:hover` を起点にする `title` のツールチップが
 * 二度と出ない——押せない理由を説明できる唯一の経路がまさにそこで塞がれる。
 * ここでは代わりに `aria-disabled` で「押せない」ことをアクセシビリティツリーへ
 * 伝えつつ、`onClick` 自身をガードして実行だけを止める。ポインタイベントは
 * 殺さないので、ホバーで `title` が読める（これがこのコンポーネントの存在理由）。
 *
 * 見た目は `text-ink-faint` / `border-rule-muted` で一段沈める。**`opacity` は
 * 使わない**——`src/styles/conventions.test.ts`「役割トークンに透過を掛けていない」
 * が言う「一段薄くしたければ ink-muted / ink-faint の段を使う」を、そのまま体現した形。
 * **ダークモードは `dark:border-rule-muted` を別に持つ**——`variant="outline"` は
 * `dark:border-input` を内蔵しており、`border-input` と `border-rule-muted` の
 * ダーク値は別の変数（`--input` は `--rule` 相当、`--rule-muted` はそれより
 * 明確に暗い。`src/styles/palette.css`）を指すため、暗いテーマでは `dark:` 側を
 * 名指しで上書きしないと `border-rule-muted` を書いた意味が消える。
 *
 * ホバーで見た目が変わらないようにする。**important 修飾（`!`）は使わない。**
 * `Button` は `cn()`（`src/lib/utils.ts` の `twMerge(clsx(...))`）でクラスを
 * 合成しており、**twMerge は modifier チェーン（`hover:` / `dark:hover:` などの
 * 前置き部分）が完全に一致するクラス同士でだけ重複排除する**——一致した組の中で
 * 同じ CSS プロパティを取り合えば、後に書いた方が前を消す。`border-rule-muted` が
 * `outline` 変種の `border-border`（modifier 無し同士）を消して勝つのも、まさに
 * この重複排除のおかげ。ここでの `hover:bg-transparent` / `hover:text-ink-faint` /
 * `dark:hover:bg-transparent` も同じ理屈で `hover:bg-muted` / `hover:text-foreground` /
 * `dark:hover:bg-input/50` をクラス一覧から消し去るので、生成 CSS 側で
 * 特異性を争う場面がそもそも生まれない。**`!` を付けると twMerge はそれを別グループ
 * として重複排除の対象から外してしまい**、負けるはずの `hover:bg-muted` 等が
 * 死んだクラスとして残ってしまう。**modifier チェーンが完全一致しない組は、twMerge には
 * 重複と見えない**——bare の `border-rule-muted` と `dark:border-input` は
 * チェーンが違う（無し vs `dark:`）ので消し合わず、両方生き残ってしまう。
 * 上で `dark:border-rule-muted` を別出しで書いたのは、まさにこのケースに
 * 当たったため
 *
 * フォーカスは殺さない——`aria-disabled` は `disabled` と違ってタブ移動の対象から
 * 外れない。キーボードで辿り着けて、スクリーンリーダーがラベルと状態を読み上げる。
 *
 * **クリック時の「押した」演出（`active:not-aria-\[haspopup\]:translate-y-px`。
 * `buttonVariants` 由来）も止める。** 何も起きないのに沈む演出は「押せた」という
 * 嘘のアフォーダンスになる。同じ modifier 列（`active:not-aria-[haspopup]:`）に
 * `translate-y-0` を重ねることで、上と同じ twMerge の重複排除に乗せて消している
 */
export function ToolbarButton({ unusable, onClick, children }: ToolbarButtonProps) {
  if (unusable !== null) {
    const guard = (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()
    }
    return (
      <Button
        type="button"
        variant="outline"
        aria-disabled="true"
        title={unusable}
        className="text-ink-faint border-rule-muted dark:border-rule-muted hover:bg-transparent hover:text-ink-faint dark:hover:bg-transparent active:not-aria-[haspopup]:translate-y-0"
        onClick={guard}
      >
        {children}
      </Button>
    )
  }
  return (
    <Button variant="outline" onClick={onClick}>
      {children}
    </Button>
  )
}
