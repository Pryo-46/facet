import type { SeqLayoutResult } from './layout'
import { svgTransform, type Transform } from './viewport'

export interface EdgeStep {
  key: string
  shape: 'call-sync' | 'call-async' | 'reply' | 'self'
  fromIndex: number | null
  toIndex: number | null
}

export interface SequenceEdgesProps {
  steps: EdgeStep[]
  layout: SeqLayoutResult
  transform: Transform
  /** エッジレイヤの `<g>` を親（画像出力の captureRef）へ公開するための ref（M18） */
  groupRef?: React.Ref<SVGGElement>
}

/**
 * エッジレイヤ（SVG）。矢印の形は導出（design-notes 論点8）:
 * call-sync＝実線・塗り矢頭／call-async＝実線・開き矢頭／reply＝破線・開き矢頭。
 * self はノードレイヤの DOM ボックスが担うのでここでは描かない。
 * 参照切れ（fromIndex / toIndex が null）と from==to の呼出は線を描かない
 * ——赤表示はガターと行の側にあり、無い線をでっち上げない
 */
export function SequenceEdges(props: SequenceEdgesProps) {
  return (
    <svg
      aria-hidden="true"
      data-layer="edges"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      <defs>
        <marker
          id="seq-arrow-solid"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" className="fill-ink" />
        </marker>
        <marker
          id="seq-arrow-open"
          markerWidth="9"
          markerHeight="9"
          refX="7"
          refY="4.5"
          orient="auto"
        >
          <path d="M0,0 L8,4.5 L0,9" className="fill-none stroke-ink" strokeWidth="1.3" />
        </marker>
      </defs>
      <g ref={props.groupRef} transform={svgTransform(props.transform)}>
        {props.steps.map((step, i) => {
          if (step.shape === 'self') return null
          if (step.fromIndex === null || step.toIndex === null) return null
          if (step.fromIndex === step.toIndex) return null
          const row = props.layout.rows[i]
          const x1 = props.layout.actorX[step.fromIndex]
          const x2 = props.layout.actorX[step.toIndex]
          // 矢頭ぶんだけ手前で止める
          const dir = x2 > x1 ? -4 : 4
          return (
            <line
              key={step.key}
              x1={x1}
              y1={row.arrowY}
              x2={x2 + dir}
              y2={row.arrowY}
              className="stroke-ink"
              strokeWidth="1.5"
              strokeDasharray={step.shape === 'reply' ? '5 3' : undefined}
              markerEnd={
                step.shape === 'call-sync' ? 'url(#seq-arrow-solid)' : 'url(#seq-arrow-open)'
              }
            />
          )
        })}
      </g>
    </svg>
  )
}
