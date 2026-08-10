// logic-tree/useViewport.ts の複製（sequence M1）。core への共通化は
// 2本目完成後に別マイルストーンで判断する（scope の禁止事項）。差分を
// 作らないこと——直すときは両方を直し、open-issues の複製の項に従う

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
 * キャンバスの外に「Space を必要とする物」がフォーカスされているか。
 *
 * ボタンやリンクは Space が活性化のキーなので、奪うと**押しても何も起きない
 * ボタン**になる（フックが載っている間ずっと、額縁のツールバーまで効く）。
 * `null` と `<body>` は「どこにも合わせていない」通常の状態——キャンバスを
 * クリックした直後がまさにこれなので、ここは通す
 */
function focusIsOutsideCanvas(canvas: HTMLElement | null, active: Element | null): boolean {
  if (active === null || active === document.body) return false
  return canvas === null || !canvas.contains(active)
}

/**
 * ビューポート（rev 10章 キャンバスの標準操作）。
 *
 * - `Ctrl+ホイール` ＝ カーソル中心ズーム
 * - `Space+ドラッグ` または中ボタンドラッグ ＝ パン
 *
 * **d3-zoom の既定（v3.0.0）は3点とも要求の逆を向いている。** 既定の filter は
 * `(!event.ctrlKey || event.type === 'wheel') && !event.button` なので、
 * (a) 修飾キーの無いホイールでもズームし、(b) 素の左ドラッグがパンになり
 *（ノードの文字を選べなくなる）、(c) 中ボタンのドラッグは弾かれる。
 * 既定の wheelDelta は ctrl 付きに10倍を掛けるので、1ノッチで4倍になり
 * 使い物にならない。両方を差し替える
 *
 * `enabled` に false を渡している間はキー監視を止める（モーダルが開いている
 * 間は操作言語を停止する。rev 10章 境界規則）
 */
export function useViewport(
  ref: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
): ViewportControl {
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

  // Space の押下監視（rev 10章 境界規則）。**window に張るので、取ってよい
  // 場面かを3つ確かめてから取る**——Space は文字であり、ボタンの活性化でもある
  useEffect(() => {
    const release = (): void => {
      spaceHeldRef.current = false
      setSpaceHeld(false)
    }
    if (!enabled) {
      // モーダルが開いている間はエディタの操作言語を止め、キーはモーダルが取る。
      // 押しっぱなしで開いたときのために、押下の状態も落とす（blur と同じ理由）
      release()
      return
    }
    const down = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || e.repeat) return
      const active = document.activeElement
      // ノードの入力欄は常に textarea。ここを抜くと文字（空白）が打てなくなる
      if (isTextEntry(active)) return
      // ボタン・リンクの Space は活性化のキー。**位置ではなく役割で判定する**
      //（空状態の「クリックして開始」はキャンバスの内側にある）
      if (active instanceof HTMLButtonElement || active instanceof HTMLAnchorElement) return
      // 額縁のツールバーなど、キャンバスの外の物にも渡さない
      if (focusIsOutsideCanvas(ref.current, active)) return
      spaceHeldRef.current = true
      setSpaceHeld(true)
      // 何も入力していないときの Space はページのスクロールに使われる
      e.preventDefault()
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
  }, [enabled, ref])

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
