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
 * 額縁の出力ボタン（ExportMenu・表形式でコピー・Miro 交換）の共通の土台
 *（M29 フォローアップ。人間が実機を触って「どのボタンがいま使えるのか、
 * なぜ押せないのかが分からない」と指摘したことに端を発する）。
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
 *
 * ホバーで見た目が変わらないようにする。**`hover:*!`（important 修飾）を
 * 付けているのは、同じプロパティを取り合う2つの Tailwind ユーティリティの
 * どちらが勝つかは、クラス名を並べた順では決まらないため**（生成された CSS 側の
 * 登録順で決まり、ソースの記述順とは無関係）。`variant="outline"` が内蔵する
 * `hover:bg-muted hover:text-foreground` を確実に上書きするには、並び順に
 * 頼らない important 修飾が要る。
 *
 * フォーカスは殺さない——`aria-disabled` は `disabled` と違ってタブ移動の対象から
 * 外れない。キーボードで辿り着けて、スクリーンリーダーがラベルと状態を読み上げる
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
        className="text-ink-faint border-rule-muted hover:bg-transparent! hover:text-ink-faint! dark:hover:bg-transparent!"
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
