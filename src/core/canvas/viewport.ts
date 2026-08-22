/**
 * キャンバスのビューポート（rev 10章 キャンバスの標準操作。純関数）。
 *
 * ロジックツリー（logic-tree M1）とシーケンス（sequence M1）が同一の内容を
 * 複製していたものを M20 でコアへ引き上げた（3本目のキャンバスツール＝
 * 課題ツリーが来ることが契機）。rev 6章が「2実例を材料に別マイルストーンで
 * 判断する」と保留していた宿題にあたる
 */

/** d3-zoom が返すのと同じ形。ビューポートの状態はこれだけ */
export interface Transform {
  x: number
  y: number
  k: number
}

/** キャンバスの初期の余白。木が左上の角に貼りつかないようにする */
export const CANVAS_MARGIN = 40

export const INITIAL_TRANSFORM: Transform = { x: CANVAS_MARGIN, y: CANVAS_MARGIN, k: 1 }

/** 3レイヤに当てる CSS の transform（原点は左上に固定する） */
export function cssTransform(t: Transform): string {
  return `translate(${t.x}px, ${t.y}px) scale(${t.k})`
}

/** SVG の transform 属性（px を付けない。SVG のユーザー単位） */
export function svgTransform(t: Transform): string {
  return `translate(${t.x},${t.y}) scale(${t.k})`
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 1軸ぶんの寄せ。**右端を入れてから左端を見る**ので、表示領域より大きいものは左に揃う */
function fitAxis(
  offset: number,
  k: number,
  start: number,
  size: number,
  viewSize: number,
  margin: number,
): number {
  let next = offset
  const end = start * k + next + size * k
  if (end > viewSize - margin) next -= end - (viewSize - margin)
  const head = start * k + next
  if (head < margin) next += margin - head
  return next
}

/**
 * 世界座標の矩形が画面に収まるようにパンする（**倍率は変えない**）。
 *
 * キーボードで足したノードが画面外に出ると、何を打っているか見えないまま
 * 入力することになる。収まっているときは動かさない——勝手に視点が動くと
 * 画面共有中に全員が現在地を見失う（tech-notes 論点6-B）
 */
export function panIntoView(
  t: Transform,
  rect: Rect,
  view: { width: number; height: number },
  margin: number,
): Transform {
  return {
    k: t.k,
    x: fitAxis(t.x, t.k, rect.x, rect.width, view.width, margin),
    y: fitAxis(t.y, t.k, rect.y, rect.height, view.height, margin),
  }
}
