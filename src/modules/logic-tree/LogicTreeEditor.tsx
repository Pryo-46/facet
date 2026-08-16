import { Plus } from 'lucide-react'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { KeyHints } from '@/components/KeyHints'
import { buttonBase } from '@/components/button-styles'
import type { CaptureLayers } from '@/core/image-export'
import type { KeyHint } from '@/core/keyboard/hint-text'
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

/** 木の操作ヒント。`$alt` は KeyHints が解決する */
const TREE_HINTS: readonly KeyHint[] = [
  { keys: 'Enter', label: '兄弟を追加' },
  { keys: 'Tab', label: '子を追加' },
  { keys: '←→', label: '親子移動' },
  { keys: '$alt+↑↓', label: '並び替え' },
]

const PLATFORM = currentPlatform()

export function LogicTreeEditor({
  data,
  onChange,
  issues,
  modalOpen,
  captureRef,
}: EditorProps<LogicTreeSchemaVersion1>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const backgroundLayerRef = useRef<HTMLDivElement>(null)
  const edgesGroupRef = useRef<SVGGElement>(null)
  const nodesLayerRef = useRef<HTMLDivElement>(null)
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

  // 画像出力対象のDOM層を額縁へ公開する（M18）。3レイヤのいずれかが
  // まだマウントされていなければ null（額縁側は null を「まだキャプチャできない」
  // として扱う）。ref オブジェクト自体は毎レンダー同じなので、空配列でよい。
  //
  // **型引数を明示すること。** `captureRef` は `Ref<CaptureLayers | null>` だが、
  // useImperativeHandle は `<T, R extends T>` で、T の推論は Ref の内部にある
  // RefObject（共変）と RefCallback（反変、優先度が高い）の2候補に割れ、
  // 後者が勝つと T が `CaptureLayers`（null を含まない）に狭まってしまう。
  // 型引数を両方 `CaptureLayers | null` に固定して R extends T を満たしつつ、
  // 狭まりを止める（sequence モジュールの Task 7 で踏んだのと同じ罠）
  useImperativeHandle<CaptureLayers | null, CaptureLayers | null>(
    captureRef,
    () => {
      const root = containerRef.current
      const background = backgroundLayerRef.current
      const nodes = nodesLayerRef.current
      const edgesGroup = edgesGroupRef.current
      if (root === null || background === null || nodes === null || edgesGroup === null) return null
      return { root, cssLayers: [background, nodes], svgLayers: [edgesGroup] }
    },
    [],
  )

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
      horizontal: false,
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

      {/* **指摘の一覧はここに置かない**（rev 6章。額縁がキャンバスの外に出す）
          ——ここに置くと件数が増えるほど木の上部を覆う */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-stretch"
        data-export-role="chrome"
      >
        {/* 見出しとヒントの帯。**面は透過させる**——下のキャンバスのパンと
            ヒットテストを、帯の外側で奪わないため */}
        <div className="pointer-events-none m-2 flex items-center gap-3">
          {/* **ファイル名（title）はここに出さない。** 額縁の `FileHeader` が
              4ツール共通で出しており、ここに置くと二重になる（rev 6章。
              指摘の一覧を額縁へ寄せたのと同じ理由） */}
          {/* **0件のときだけ出す。** 雛形はルート1件を持つので、ここに来るのは
              外部で作られた0件ファイルだけ。マウスだけの人がノードを増やす
              一般的な動線が無いのは M14 以前からの別の穴（open-issues 参照） */}
          {data.nodes.length === 0 && (
            <button
              type="button"
              className={`${buttonBase} pointer-events-auto shrink-0 gap-1 border border-rule bg-surface px-3 py-1 text-sm text-ink hover:bg-canvas`}
              onClick={createRoot}
            >
              <Plus aria-hidden className="size-4" />
              ノードを追加
            </button>
          )}
          <KeyHints hints={TREE_HINTS} className="ml-auto shrink-0 bg-surface/80 px-2 py-1" />
        </div>
      </div>

      {/* 背景レイヤ（M1 は空。シーケンスの失敗ゾーンのために枠だけ確保する） */}
      <div
        ref={backgroundLayerRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="background"
      />

      <TreeEdges
        roots={built.roots}
        positions={positions}
        sizes={sizes}
        transform={transform}
        groupRef={edgesGroupRef}
      />

      {/* **レイヤ自体は操作を取らない。** ここは inset-0 の透明な面。
          pointer-events を切らないと、この面がキャンバス全体を覆う単一の
          ヒット領域になり、useViewport がコンテナに付けた背景パン／ズームの
          ハンドラまで mousedown が届かなくなる。操作を受けるのはノードの矩形
          だけでよいので、NodeBox 側で auto に戻す */}
      <div
        ref={nodesLayerRef}
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
