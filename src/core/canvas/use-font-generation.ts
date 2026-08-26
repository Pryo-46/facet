import { useEffect, useState } from 'react'

/**
 * Web フォントの読み込みを「世代」として数えるフック（M26）。
 *
 * getComputedStyle は宣言されたファミリ列を返すだけで、どのフェイスに
 * 解決されたかは映らない——だからフォントの同一性では測り直しを起こせず、
 * 読み込みの完了を世代として数え、測定器の鍵に混ぜる（rev 9章）。
 *
 * 2 つの契機で進む:
 * - 初回の読み込み完了（document.fonts.ready）
 * - **その後の遅延スライスの到着（loadingdone）**。同梱フォントは
 *   unicode-range で分割されており、珍しい字が初めて入力されたとき
 *   該当スライスだけが後から届く。ready は初回しか解決しないので、
 *   これを拾わないと後から届いた字の幅・高さが古いまま残る
 *
 * ready の直後は loadingdone も発火して 2 回進み得るが、再測定が
 * 2 回走るだけで結果は同じ（冪等）なので、重複は取り除かない
 */
export function useFontGeneration(): number {
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return
    let alive = true
    const bump = (): void => {
      if (alive) setGeneration((n) => n + 1)
    }
    void document.fonts.ready.then(bump)
    const onLoadingDone = (e: Event): void => {
      // 1 つも読み込まれなかった loadingdone（全件エラー等）では測り直さない
      const faces = (e as { fontfaces?: readonly unknown[] }).fontfaces
      if (faces === undefined || faces.length > 0) bump()
    }
    document.fonts.addEventListener('loadingdone', onLoadingDone)
    return () => {
      alive = false
      document.fonts.removeEventListener('loadingdone', onLoadingDone)
    }
  }, [])
  return generation
}
