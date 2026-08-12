import { useColumnResize, type ColumnWidthStore } from '@/core/column-resize'

/**
 * 端末ペインの幅を掴むハンドル。
 *
 * **`column-resize.ts` を再利用する**（設計 決定5）。幅1要素の配列として渡すと、
 * ポインタキャプチャ・キーボード（←→）・ダブルクリックで既定へ戻す・
 * エディタが潰れない上限クランプが全部ついてくる。3本目のリサイズ実装を生やさない
 */

/**
 * ペインをこれより狭くしない。**App.tsx（ウィンドウ幅への追従）と共有するため
 * export する**（定数を二重に書かない）
 */
export const PANE_MIN_WIDTH = 320
/** エディタに必ず残す幅。同じ理由で export する */
export const EDITOR_MIN_WIDTH = 480
/** ←→ 1回あたり */
const STEP = 16

export interface PaneSplitterProps {
  containerRef: React.RefObject<HTMLElement | null>
  store: ColumnWidthStore
  /**
   * いま画面に出している幅（App.tsx の `displayPaneWidth`）。**渡すとドラッグ／
   * キーボードの基準がこちらになる。** store（意図）を直接基準にすると、
   * ウィンドウが狭まって意図と表示が乖離した状態でハンドルに触れたときに
   * デッドゾーンが生まれ、かつクランプ後の値をそのまま意図として書き戻して
   * しまう（レビュー指摘。`column-resize.ts` の `referenceWidths` 参照）。
   *
   * **省略可能。** 省略すると `useColumnResize` が従来どおり store を基準に
   * する——このコンポーネント単体のテスト（`PaneSplitter.dom.test.tsx`）は
   * 意図と表示が乖離する状況を作らないので、渡さなくても挙動は変わらない
   */
  referenceWidth?: number
}

export function PaneSplitter({
  containerRef,
  store,
  referenceWidth,
}: PaneSplitterProps): React.JSX.Element {
  const { getHandleProps } = useColumnResize({
    store,
    minWidth: PANE_MIN_WIDTH,
    flexMinWidth: EDITOR_MIN_WIDTH,
    step: STEP,
    containerRef,
    referenceWidths: referenceWidth === undefined ? undefined : [referenceWidth],
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
