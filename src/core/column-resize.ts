import { useCallback, useRef, useSyncExternalStore } from 'react'

/**
 * 表の列幅（rev 10章の実装規約「キーボード・マウス処理は共通フック／
 * モジュールに一元化し、全ツールがそれを使う」のマウス側）。
 *
 * **表を持つツールはこのモジュールを使う。** いまは用語集だけだが、
 * 状態遷移の遷移表が2本目になる。ツールごとに書き直さないこと
 */

/** 幅の変更要求。純関数なので単体でテストできる */
export interface ColumnResizeSpec {
  /** 固定幅を持つ列だけを並び順で持つ配列 */
  widths: readonly number[]
  index: number
  delta: number
  minWidth: number
  /**
   * テーブルが使える内寸(px)。**0 以下＝不明**として上限を掛けない。
   * jsdom にはレイアウトが無く clientWidth が 0 になるため、ここで
   * 上限を掛けるとキーボード操作のテストが「広げられない」に落ちる
   */
  available: number
  /** 幅を持たない列（残りを埋める列）に残す最小幅 */
  flexMinWidth: number
}

/**
 * 1列の幅を変えた結果を返す。**引数の配列は書き換えない。**
 * 仕事は「残りを埋める列が潰れる操作を止めること」に尽きる
 */
export function resizeColumns(spec: ColumnResizeSpec): number[] {
  const { widths, index, delta, minWidth, available, flexMinWidth } = spec
  const next = [...widths]
  const current = next[index]
  if (current === undefined) return next
  const others = next.reduce((sum, w, i) => (i === index ? sum : sum + w), 0)
  const upper =
    available > 0
      ? Math.max(minWidth, available - flexMinWidth - others)
      : Number.POSITIVE_INFINITY
  next[index] = Math.min(Math.max(current + delta, minWidth), upper)
  return next
}

export interface ColumnWidthStore {
  /** 既定幅。1列だけ戻すときの参照元 */
  readonly defaults: readonly number[]
  getSnapshot: () => readonly number[]
  subscribe: (listener: () => void) => () => void
  set: (widths: readonly number[]) => void
  reset: () => void
}

/**
 * 列幅を **アプリを閉じるまで** 保持する外部ストアを作る（M8 決定7）。
 *
 * 各ツールがモジュールスコープで1個持つ。エディタが `key={path}` で
 * 作り直されても値が残り、額縁（App）は列構成を一切知らずに済む。
 * 永続化はしない——「アプリを閉じるまで」がモジュールの生存期間と
 * ちょうど一致するので、保存先やキー命名の設計判断が要らない。
 *
 * **モジュールスコープの可変状態はテスト間で漏れる。**
 * テストの beforeEach で `reset()` を呼ぶこと
 */
export function createColumnWidthStore(defaults: readonly number[]): ColumnWidthStore {
  const initial: readonly number[] = [...defaults]
  // **同一参照を返し続けること。** useSyncExternalStore は getSnapshot が
  // 毎回新しい配列を返すと無限ループする
  let current: readonly number[] = initial
  const listeners = new Set<() => void>()
  const emit = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    defaults: initial,
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (widths) => {
      current = [...widths]
      emit()
    },
    reset: () => {
      current = initial
      emit()
    },
  }
}

export interface ColumnResizeOptions {
  store: ColumnWidthStore
  minWidth: number
  flexMinWidth: number
  /** キーボード（←→）1回あたりの変化量(px) */
  step: number
  /** 利用可能幅を測る要素。ドラッグ開始時に1度だけ clientWidth を読む */
  containerRef: React.RefObject<HTMLElement | null>
}

export interface HandleOptions {
  /**
   * ドラッグの向きを反転する。**幅を持たない列（残りを埋める列）の右端に
   * 置くハンドル用。** その位置で掴めるのは右隣の列の幅なので、右へ引いたら
   * 右隣が狭まる＝この列が広がる、という見た目どおりの動きにする
   */
  invert?: boolean
}

/**
 * `invert` オプションに応じて delta の符号を合わせる。純関数として
 * 単体でテストできるよう、向き反転の判断をここ1箇所に閉じる
 */
export function invertDelta(delta: number, invert?: boolean): number {
  return invert === true ? -delta : delta
}

/** ハンドル要素に展開する props。ツール側は配線を書かない */
export interface HandleProps {
  role: 'separator'
  'aria-orientation': 'vertical'
  tabIndex: 0
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
  onDoubleClick: () => void
}

/**
 * 列幅ドラッグの配線（M8 決定8・9・10）。
 *
 * ポインタは `setPointerCapture` で掴んだ要素に固定する——window へ
 * リスナーを張り替えなくて済み、カーソルがテーブルの外へ出ても追従し、
 * `pointercancel` で後始末が入る。
 *
 * **利用可能幅はドラッグ開始時に1度だけ読む。** ドラッグ中に窓は変わらない
 */
export function useColumnResize(options: ColumnResizeOptions): {
  widths: readonly number[]
  getHandleProps: (index: number, handleOptions?: HandleOptions) => HandleProps
} {
  const { store, minWidth, flexMinWidth, step, containerRef } = options
  const widths = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const drag = useRef<{
    index: number
    startX: number
    startWidths: readonly number[]
    available: number
  } | null>(null)

  const apply = useCallback(
    (index: number, delta: number, from: readonly number[], available: number): void => {
      store.set(
        resizeColumns({ widths: from, index, delta, minWidth, available, flexMinWidth }),
      )
    },
    [store, minWidth, flexMinWidth],
  )

  /** その列だけ既定へ戻す（ダブルクリック・Home）。全列は戻さない */
  const resetColumn = useCallback(
    (index: number): void => {
      const next = [...store.getSnapshot()]
      const fallback = store.defaults[index]
      if (fallback === undefined) return
      next[index] = fallback
      store.set(next)
    },
    [store],
  )

  const getHandleProps = useCallback(
    (index: number, handleOptions?: HandleOptions): HandleProps => {
      // 幅を持たない列（残りを埋める列）の右端に置くハンドルは、右隣の列の
      // 幅を逆向きに動かす。resetColumn は既定へ戻すだけで向きが無いので反転しない
      const invert = handleOptions?.invert
      return {
        role: 'separator',
        'aria-orientation': 'vertical',
        tabIndex: 0,
        onPointerDown: (e) => {
          // 既定動作（テキスト選択）を止めないとドラッグ中に選択が走る
          e.preventDefault()
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = {
            index,
            startX: e.clientX,
            startWidths: store.getSnapshot(),
            available: containerRef.current?.clientWidth ?? 0,
          }
        },
        onPointerMove: (e) => {
          const d = drag.current
          if (d === null || d.index !== index) return
          // **開始時の幅からの差分で計算する。** 直前の幅に足し込むと
          // クランプに当たった後にカーソルを戻したとき追従しなくなる
          apply(index, invertDelta(e.clientX - d.startX, invert), d.startWidths, d.available)
        },
        onPointerUp: () => {
          drag.current = null
        },
        onPointerCancel: () => {
          drag.current = null
        },
        onKeyDown: (e) => {
          if (e.key === 'Home') {
            e.preventDefault()
            resetColumn(index)
            return
          }
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
          e.preventDefault()
          apply(
            index,
            invertDelta(e.key === 'ArrowLeft' ? -step : step, invert),
            store.getSnapshot(),
            containerRef.current?.clientWidth ?? 0,
          )
        },
        onDoubleClick: () => resetColumn(index),
      }
    },
    [store, apply, resetColumn, step, containerRef],
  )

  return { widths, getHandleProps }
}
