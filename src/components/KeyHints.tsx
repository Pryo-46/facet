import { formatHintKeys, type KeyHint } from '@/core/keyboard/hint-text'
import { currentPlatform } from '@/core/keyboard/platform'

/**
 * 操作ヒントの帯（rev 9章の共通コンポーネント方針）。
 *
 * **プラットフォームはここで1度だけ解決する。** 呼び出し側は
 * `$mod` / `$alt` のまま宣言を書き、Ctrl か Cmd かを知らない
 */
export function KeyHints(props: { hints: readonly KeyHint[]; className?: string }) {
  const platform = currentPlatform()
  return (
    <div className={`text-xs text-ink-muted ${props.className ?? ''}`}>
      {props.hints.map((hint) => (
        <span key={hint.keys} className="ml-3 first:ml-0">
          <span className="text-ink">{formatHintKeys(hint.keys, platform)}</span>: {hint.label}
        </span>
      ))}
    </div>
  )
}
