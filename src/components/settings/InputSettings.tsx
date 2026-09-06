import { PAN_KEYS, type CanvasSettings } from '@/core/settings'
import type { SettingsPanelProps } from './types'

const PAN_LABELS: Record<(typeof PAN_KEYS)[number], string> = {
  panWithEmptyDrag: '空きスペースの左ドラッグ',
  panWithSpaceDrag: 'Space を押しながらの左ドラッグ',
  panWithMiddleDrag: '中ボタンのドラッグ',
  panWithRightDrag: '右ドラッグ',
}

/**
 * キャンバスの操作の設定。
 *
 * **有効なパンの手段が1つだけになったら、それを無効化する。** 盤面を動かせない
 * 状態を設定から作らせないため（`normalizeSettings` が読み込み側で守る不変条件と
 * 同じもの）。ズームに同じ縛りが要らないのは、`Ctrl+ホイール` が設定に関わらず
 * 効くからである
 */
export function InputSettings({ settings, onChange }: SettingsPanelProps) {
  const canvas = settings.canvas
  const enabledPans = PAN_KEYS.filter((key) => canvas[key])
  // **キーを1つ受けて1つ書く形にすること。** `Partial<CanvasSettings>` を受けて
  // `{ [key]: value }` を渡すと、算出キーの型が広がって代入できない
  const update = (key: keyof CanvasSettings, value: boolean): void => {
    onChange({ ...settings, canvas: { ...canvas, [key]: value } })
  }
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-ink-muted">盤面を動かす</legend>
        {PAN_KEYS.map((key) => {
          const isLast = enabledPans.length === 1 && enabledPans[0] === key
          return (
            <label
              key={key}
              className="flex items-center gap-2 text-base text-ink"
              title={isLast ? '盤面を動かす手段が無くなるので、これは外せません' : undefined}
            >
              <input
                type="checkbox"
                checked={canvas[key]}
                disabled={isLast}
                onChange={(e) => update(key, e.target.checked)}
              />
              {PAN_LABELS[key]}
            </label>
          )
        })}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-ink-muted">拡大・縮小</legend>
        <label className="flex items-center gap-2 text-base text-ink">
          <input
            type="checkbox"
            checked={canvas.zoomWithoutModifier}
            onChange={(e) => update('zoomWithoutModifier', e.target.checked)}
          />
          修飾キーなしのホイールでズームする
        </label>
        <p className="text-sm text-ink-muted">Ctrl+ホイールはこの設定に関わらず効きます。</p>
      </fieldset>
    </div>
  )
}
