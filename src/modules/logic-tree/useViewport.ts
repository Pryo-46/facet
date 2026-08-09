import { useCallback, useEffect, useRef, useState } from 'react'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom'
import { INITIAL_TRANSFORM, panIntoView, type Rect, type Transform } from './viewport'

const MIN_SCALE = 0.2
const MAX_SCALE = 3
/** 追従したときにノードの周りに残す余白（画面上の px） */
const FOLLOW_MARGIN = 48

export interface ViewportControl {
  transform: Transform
  spaceHeld: boolean
  ensureVisible: (rect: Rect) => void
}

/** テキスト入力中か。Space をパンに使ってよいかの判定に要る（rev 10章 境界規則） */
function isTextEntry(el: Element | null): boolean {
  if (el === null) return false
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return true
  return el instanceof HTMLElement && el.isContentEditable
}

/**
 * ビューポート（rev 10章 キャンバスの標準操作）。
 *
 * - `Ctrl+ホイール` ＝ カーソル中心ズーム
 * - `Space+ドラッグ` または中ボタンドラッグ ＝ パン
 *
 * **d3-zoom の既定はどちらも違う。** 既定の filter は `!event.ctrlKey` で
 * Ctrl+ホイールを**弾き**（ブラウザがピンチを ctrl 付きホイールとして送るため）、
 * 既定の wheelDelta は ctrl 付きに10倍を掛ける（1ノッチで4倍になり使い物に
 * ならない）。両方を差し替える
 */
export function useViewport(ref: React.RefObject<HTMLDivElement | null>): ViewportControl {
  const [transform, setTransform] = useState<Transform>(INITIAL_TRANSFORM)
  const [spaceHeld, setSpaceHeld] = useState(false)
  // ハンドラはマウント時に1回しか張らないので、最新値は ref から読む
  const spaceHeldRef = useRef(false)
  const behaviorRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null)
  const transformRef = useRef<Transform>(INITIAL_TRANSFORM)
  transformRef.current = transform

  useEffect(() => {
    const el = ref.current
    if (el === null) return
    const behavior = zoom<HTMLDivElement, unknown>()
      .scaleExtent([MIN_SCALE, MAX_SCALE])
      // ctrl 付きの10倍を外す。1ノッチ（deltaY=100）で約1.15倍
      .wheelDelta((event: WheelEvent) => {
        const unit = event.deltaMode === 1 ? 0.05 : event.deltaMode !== 0 ? 1 : 0.002
        return -event.deltaY * unit
      })
      .filter((event: Event) => {
        if (event.type === 'wheel') {
          const e = event as WheelEvent
          return e.ctrlKey || e.metaKey
        }
        if (event.type === 'mousedown') {
          const e = event as MouseEvent
          // 中ボタン、または Space を押しながらの左ボタン
          return e.button === 1 || (e.button === 0 && spaceHeldRef.current)
        }
        // ダブルクリックズームとタッチは使わない
        return false
      })
      .on('zoom', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        setTransform({ x: event.transform.x, y: event.transform.y, k: event.transform.k })
      })
    const selection = select(el)
    selection.call(behavior)
    // 初期値を d3 側にも持たせる（以後 d3 の内部状態と React の state が一致する）
    selection.call(
      behavior.transform,
      zoomIdentity.translate(INITIAL_TRANSFORM.x, INITIAL_TRANSFORM.y).scale(INITIAL_TRANSFORM.k),
    )
    behaviorRef.current = behavior
    return () => {
      selection.on('.zoom', null)
      behaviorRef.current = null
    }
  }, [ref])

  // Space の押下監視。**テキスト入力中は無視する**——ノードの入力欄は常に
  // textarea なので、ここを抜くと文字が打てなくなる（rev 10章 境界規則）
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || e.repeat) return
      if (isTextEntry(document.activeElement)) return
      spaceHeldRef.current = true
      setSpaceHeld(true)
      // 何も入力していないときの Space はページのスクロールに使われる
      e.preventDefault()
    }
    const release = (): void => {
      spaceHeldRef.current = false
      setSpaceHeld(false)
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space') release()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    // 押しっぱなしのまま窓を離れると押されたままになる
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', release)
    }
  }, [])

  const ensureVisible = useCallback(
    (rect: Rect) => {
      const el = ref.current
      const behavior = behaviorRef.current
      if (el === null || behavior === null) return
      const view = { width: el.clientWidth, height: el.clientHeight }
      if (view.width === 0 || view.height === 0) return
      const next = panIntoView(transformRef.current, rect, view, FOLLOW_MARGIN)
      const current = transformRef.current
      if (next.x === current.x && next.y === current.y) return
      // **必ず d3 を経由して動かす。** setTransform だけ呼ぶと d3 の内部状態が
      // 古いままになり、次のホイールで表示が飛ぶ
      select(el).call(behavior.transform, zoomIdentity.translate(next.x, next.y).scale(next.k))
    },
    [ref],
  )

  return { transform, spaceHeld, ensureVisible }
}
