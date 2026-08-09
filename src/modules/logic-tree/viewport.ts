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
