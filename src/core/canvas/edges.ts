import type { Rect } from './viewport'

/** 親の右辺の中央から子の左辺の中央へ。左右方向にだけ張り出す3次ベジェ */
export function edgePath(from: Rect, to: Rect): string {
  const x1 = from.x + from.width
  const y1 = from.y + from.height / 2
  const x2 = to.x
  const y2 = to.y + to.height / 2
  // 制御点の張り出しは列の間隔の半分。近すぎるときも最低限は曲げる
  const dx = Math.max(16, (x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}
