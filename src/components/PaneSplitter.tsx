import { useColumnResize, type ColumnWidthStore } from '@/core/column-resize'

/**
 * 端末ペインの幅を掴むハンドル。
 *
 * **`column-resize.ts` を再利用する**（設計 決定5）。幅1要素の配列として渡すと、
 * ポインタキャプチャ・キーボード（←→）・ダブルクリックで既定へ戻す・
 * エディタが潰れない上限クランプが全部ついてくる。3本目のリサイズ実装を生やさない
 */

/** ペインをこれより狭くしない */
const PANE_MIN_WIDTH = 320
/** エディタに必ず残す幅 */
const EDITOR_MIN_WIDTH = 480
/** ←→ 1回あたり */
const STEP = 16

export interface PaneSplitterProps {
  containerRef: React.RefObject<HTMLElement | null>
  store: ColumnWidthStore
}

export function PaneSplitter({ containerRef, store }: PaneSplitterProps): React.JSX.Element {
  const { getHandleProps } = useColumnResize({
    store,
    minWidth: PANE_MIN_WIDTH,
    flexMinWidth: EDITOR_MIN_WIDTH,
    step: STEP,
    containerRef,
  })
  return (
    <div
      // ペインの左端にあるので、右へ引いたらペインが狭まる＝invert
      {...getHandleProps(0, { invert: true })}
      aria-label="Claude Code ペインの幅"
      className="w-1 shrink-0 cursor-col-resize bg-rule"
    />
  )
}
