import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { buttonBase } from '@/components/button-styles'
import {
  resolveCommand,
  toKeyEventLike,
  type Command,
  type KeyContext,
} from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import type { EditorProps } from '@/core/registry'
import { computeRowKeys } from '@/core/row-keys'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import {
  addChild,
  addRoot,
  addSiblingAfter,
  deleteSubtree,
  moveSibling,
  setText,
  type EditResult,
} from './commands'
import { layoutTree, type Size } from './layout'
import { wrapText, type MeasureWidth, type WrappedText } from './measure'
import {
  createNodeMeasurer,
  FALLBACK_NODE_FONT,
  readNodeFont,
  sameFont,
  type NodeFont,
} from './node-font'
import { NodeBox } from './NodeBox'
import { buildTree } from './tree'
import { TreeEdges } from './TreeEdges'
import { useViewport } from './useViewport'
import { cssTransform } from './viewport'

/** 測定結果のキャッシュ。会議1回分の打鍵で無限に増えないよう頭を押さえる */
const MEASURE_CACHE_LIMIT = 2000

/** ノードの文言に当たるクラスのうち、フォントを決めている部分。見本要素と共有する */
const NODE_FONT_CLASS = 'text-sm'

const PLATFORM = currentPlatform()

export function LogicTreeEditor({
  data,
  onChange,
  issues,
  modalOpen,
}: EditorProps<LogicTreeSchemaVersion1>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [font, setFont] = useState<NodeFont>(FALLBACK_NODE_FONT)
  // ズーム・パン（Ctrl+ホイール／Space・中ボタンのドラッグ）と新ノードへの追従。
  // モーダルが開いている間は止める（キーはモーダルが取る。rev 10章 境界規則）
  const { transform, spaceHeld, ensureVisible } = useViewport(containerRef, !modalOpen)

  // 構造操作の後、新しい DOM が出てからフォーカスを移すための予約
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)

  // Web フォントの読み込みで canvas の measureText の結果は変わるが、
  // getComputedStyle が返す値は変わらない（宣言されたファミリ列を返すだけで、
  // どのフェイスに解決されたかは映らない）。だからフォントの同一性では
  // 判定できず、読み込み完了を世代として数えて測り直す
  const [fontGeneration, setFontGeneration] = useState(0)

  const readFont = (): void => {
    setFont((prev) => {
      const next = readNodeFont(probeRef.current)
      return sameFont(prev, next) ? prev : next
    })
  }

  useLayoutEffect(readFont, [])

  // **Web フォントの読み込み前に測るとフォールバック書体の幅になる。**
  // Geist は日本語グリフを持たず和文はフォールバックに落ちるが、
  // 欧文の幅は読み込みの前後で変わる。読み込み完了で測り直す
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return
    let alive = true
    void document.fonts.ready.then(() => {
      if (!alive) return
      readFont()
      setFontGeneration((n) => n + 1)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readFont は毎レンダー再生成される安定した処理。購読はマウント時の1回でよい
  }, [])

  useEffect(() => {
    if (pendingFocus === null) return
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${pendingFocus}"]`)
    // **スクロールはさせない。** 画面外の要素にフォーカスするとブラウザが
    // 祖先の scrollLeft/scrollTop を動かすが、位置は transform で持っており
    // panIntoView はスクロール量を勘定に入れていない（二重に動いて狂う）
    el?.focus({ preventScroll: true })
    const point = positions.get(pendingFocus)
    const size = sizes.get(pendingFocus)
    // 打った直後のノードが画面外だと、何を打っているか見えない
    if (point !== undefined && size !== undefined) {
      ensureVisible({ x: point.x, y: point.y, width: size.width, height: size.height })
    }
    setPendingFocus(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- positions / sizes は毎レンダー作り直される導出値。予約が入ったときだけ走らせる
  }, [pendingFocus])

  // 測定器はフォントが変わったときだけ作り直す。**キャッシュはフォントに
  // 紐づく**ので、同じ入れ物の中で持つ（別々に持つと片方だけ古くなる）。
  //
  // 鍵に lineHeight と世代を混ぜる。**`font.font` の文字列には行間が
  // 入っていない**のに `wrapText` の height は lineHeight に依存するので、
  // 書体が同じまま行間だけ変わるとキャッシュが古い高さを返し続ける。
  // 世代は上の document.fonts.ready が進めるカウンタで、
  // 「読み込み後に測り直す」を成立させるのはこちらである
  const measurerKey = `${font.font}|${font.lineHeight}|${fontGeneration}`
  const measurerRef = useRef<{
    key: string
    measure: MeasureWidth
    cache: Map<string, WrappedText>
  } | null>(null)
  if (measurerRef.current === null || measurerRef.current.key !== measurerKey) {
    measurerRef.current = { key: measurerKey, measure: createNodeMeasurer(font), cache: new Map() }
  }
  const measurer = measurerRef.current

  const nodeKeys = computeRowKeys(data.nodes)
  const sizes = new Map<string, Size>()
  data.nodes.forEach((node, index) => {
    let wrapped = measurer.cache.get(node.text)
    if (wrapped === undefined) {
      wrapped = wrapText(node.text, measurer.measure, font.lineHeight)
      if (measurer.cache.size >= MEASURE_CACHE_LIMIT) measurer.cache.clear()
      measurer.cache.set(node.text, wrapped)
    }
    sizes.set(nodeKeys[index], { width: wrapped.width, height: wrapped.height })
  })

  const built = buildTree(data.nodes)
  const { positions } = layoutTree(built.roots, sizes)

  // 赤表示の対象。issues の locations が指す配列位置を集める
  const invalid = new Set<number>()
  for (const issue of issues) {
    for (const location of issue.locations) {
      if (location.entityIndex !== null) invalid.add(location.entityIndex)
    }
  }

  const createRoot = (): void => {
    const result = addRoot(data)
    onChange(result.data, null)
    if (result.focusIndex !== null) {
      setPendingFocus(computeRowKeys(result.data.nodes)[result.focusIndex])
    }
  }

  /** 編集結果を額縁へ渡し、次に編集させたいノードへフォーカスを予約する */
  const apply = (result: EditResult): void => {
    if (result.data === data) return
    // 構造操作は mergeKey に null を渡す（1操作1コミット。rev 10章）
    onChange(result.data, null)
    setPendingFocus(
      result.focusIndex === null ? null : computeRowKeys(result.data.nodes)[result.focusIndex],
    )
  }

  const focusNodeAt = (index: number | null | undefined): boolean => {
    if (index === null || index === undefined) return false
    const key = nodeKeys[index]
    if (key === undefined) return false
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${key}"]`)
    if (!el) return false
    // pendingFocus の effect（上）と同じ理由: 画面外の要素に focus するとブラウザが
    // 祖先の scrollLeft/scrollTop を動かすが、位置は transform で持っており
    // panIntoView はスクロール量を見ていない（追従と二重に動いて以後ずれ続ける）。
    // overflow-hidden にはスクロールバーが無いので、一度ずれると UI から戻す手段が無い
    el.focus({ preventScroll: true })
    const point = positions.get(key)
    const size = sizes.get(key)
    if (point !== undefined && size !== undefined) {
      ensureVisible({ x: point.x, y: point.y, width: size.width, height: size.height })
    }
    return true
  }

  /** 兄弟の並びの中で delta だけ動いた位置のノードへ移る */
  const focusSibling = (index: number, delta: -1 | 1): boolean => {
    const parent = built.parents[index]
    const siblings = parent === null ? built.roots.map((r) => r.index) : built.children[parent]
    const pos = siblings.indexOf(index)
    if (pos < 0) return false
    return focusNodeAt(siblings[pos + delta])
  }

  /** コマンドをツリーの構造へ写像する。戻り値 true＝消費した（既定動作を止める） */
  const runCommand = (cmd: Command, index: number): boolean => {
    switch (cmd) {
      case 'insert-item-after':
        apply(addSiblingAfter(data, index))
        return true
      case 'insert-child':
        apply(addChild(data, index))
        return true
      case 'delete-item':
        apply(deleteSubtree(data, index))
        return true
      case 'move-item-up':
        apply(moveSibling(data, index, -1))
        return true
      case 'move-item-down':
        apply(moveSibling(data, index, 1))
        return true
      case 'focus-prev':
        return focusSibling(index, -1)
      case 'focus-next':
        return focusSibling(index, 1)
      case 'focus-parent':
        return focusNodeAt(built.parents[index])
      case 'focus-child':
        return focusNodeAt(built.children[index]?.[0])
      case 'cancel':
        // 編集の打ち切り。フォーカスを外すと CellInput が確定値に戻す
        ;(document.activeElement as HTMLElement | null)?.blur()
        return true
      default:
        // undo / redo は額縁（App）のグローバル層が取る。ここでは消費しない
        return false
    }
  }

  /** ノードのキー入力。キーの判定はコアの resolveCommand に委ねる（rev 10章） */
  const onNodeKeyDown = (e: React.KeyboardEvent, index: number, state: FieldState): void => {
    const context: KeyContext = {
      platform: PLATFORM,
      modalOpen,
      editing: true,
      fieldEmpty: state.empty,
      // ノードの文言は1つしかないので、空欄 Backspace の削除を認める欄でもある
      deletableField: true,
      caretAtStart: state.caretAtStart,
      caretAtEnd: state.caretAtEnd,
      arrowsOwnedByField: false,
      // M1 には導出表示（検索・フィルタ）が無いので並び替えは常に有効
      reorderEnabled: true,
      // 子を持てる構造。Tab＝子追加、←→＝親子移動になる
      hierarchical: true,
    }
    const cmd = resolveCommand(toKeyEventLike(e), context)
    if (cmd === null) return
    if (runCommand(cmd, index)) e.preventDefault()
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-canvas bg-grid-paper ${
        spaceHeld ? 'cursor-grab' : ''
      }`}
    >
      {/* 測定用の見本。**描画されるノードと同じフォントのクラスを持たせる**
          ことで、測定と描画が同一の情報源を見る（rev 9章）。
          opacity-0 で見せないだけにするのは、display:none だと
          getComputedStyle がフォントを返さない環境があるため */}
      <span
        ref={probeRef}
        aria-hidden="true"
        className={`${NODE_FONT_CLASS} pointer-events-none absolute left-0 top-0 select-none opacity-0`}
      >
        あ
      </span>

      {issues.length > 0 && (
        <ul className="absolute left-0 right-0 top-0 z-10 list-disc bg-surface px-6 py-2 pl-10 text-sm text-warning">
          {issues.map((issue, i) => (
            <li key={`${issue.rule}-${i}`}>{issue.message}</li>
          ))}
        </ul>
      )}

      {data.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <button
            type="button"
            className={`${buttonBase} border border-rule bg-surface px-4 py-2 text-sm text-ink hover:bg-canvas`}
            onClick={createRoot}
          >
            クリックして開始
          </button>
        </div>
      )}

      {/* 背景レイヤ（M1 は空。シーケンスの失敗ゾーンのために枠だけ確保する） */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="background"
      />

      <TreeEdges roots={built.roots} positions={positions} sizes={sizes} transform={transform} />

      {/* **レイヤ自体は操作を取らない。** ここは inset-0 の透明な面で、
          ツリー順では空状態のボタンより後ろ（＝上）に来る。z-index はどちらも
          auto なので、pointer-events を切らないと中央のヒットテストを
          この面が奪い、「クリックして開始」が押せなくなる。操作を受けるのは
          ノードの矩形だけでよいので、NodeBox 側で auto に戻す。
          Task 11 の「背景を掴んでパンする」もこの形のまま効く */}
      <div
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="nodes"
      >
        {data.nodes.map((node, index) => {
          const key = nodeKeys[index]
          const point = positions.get(key)
          const size = sizes.get(key)
          // 循環して根から到達できないノードは図に位置を持たない
          //（存在は整合性検証の指摘として画面上部に出ている）
          if (point === undefined || size === undefined) return null
          return (
            <NodeBox
              key={key}
              nodeKey={key}
              label={`ノード${index + 1}`}
              text={node.text}
              x={point.x}
              y={point.y}
              width={size.width}
              height={size.height}
              invalid={invalid.has(index)}
              onTextChange={(next) => onChange(setText(data, index, next), `${key}:text`)}
              onFieldKeyDown={(e, state) => onNodeKeyDown(e, index, state)}
            />
          )
        })}
      </div>
    </div>
  )
}
