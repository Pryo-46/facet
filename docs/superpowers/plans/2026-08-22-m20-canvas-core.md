# M20 キャンバス基盤のコア化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ロジックツリーとシーケンスが独立に複製しているキャンバスの土台（ビューポート・測定層・フォント読み取り・平坦木の組み立て・木のレイアウト）を `src/core/canvas/` へ引き上げ、複製を消す。**アプリの挙動は1つも変えない。**

**Architecture:** 移設であって書き直しではない。引用元の実物をそのまま移し、変えるのは import 元のパス・識別子の名前・特定ツールを名指ししているコメントの語だけ。入力の型だけを構造的に広げて（`FlatNode` / `LayoutTreeNode`）、複数のツールのノード型が同じ関数を通れるようにする。

**Tech Stack:** TypeScript / React 19 / d3-zoom / Vitest（jsdom）

**Spec:**
- [`docs/open-issues.md`](../../open-issues.md) の「キャンバスの土台が logic-tree と sequence で丸ごと複製されている」（`[sequence-m1]` タグ、「小さな負債」の節）——**これが解消の対象そのものである**
- [`docs/overview-rev.md`](../../overview-rev.md) 6章「キャンバス系ツールのレイアウト関数は当面モジュールが持つ（sequence M1 時点）」——「規約化するか各モジュール任せにするかは、この2実例を材料に**別マイルストーンで判断する**」と保留していた宿題

## なぜ今か

**3本目のキャンバスツール（課題ツリー。[`docs/issue-tree/仮説検証モジュール-設計ノート.md`](../../issue-tree/仮説検証モジュール-設計ノート.md)）が来るため。** rev 6章の「モジュール規約の境界（コア / 各ツールモジュール）は跨がないこと」により、新しいツールから `@/modules/logic-tree/...` を import することはできない。したがって選択肢は「コアへ引き上げる」か「3度目の複製を作る」の二択で、後者は open-issues が sequence M1 以来の負債として記録している形そのものである。

**判断の材料は既に揃っている**（open-issues の当該項が実測を記録している）:

- `viewport.ts` は**先頭コメント3行以外 diff ゼロ**
- `useViewport.ts` / `useViewport.dom.test.tsx` / `viewport.test.ts` も、差分はヘッダのコメントと**ツール名を含む1行だけ**
- フォント読み取りには既に差が1点ある（`seq-font.ts` にのみ `FALLBACK_LABEL_FONT` がある）——**複製が実際にドリフトし始めている**
- 一方**レイアウト関数の性質は大きく違う**（ツリーは Reingold–Tilford 型の再帰、シーケンスは X も Y も単純な積み上げ）ので、そこは引き上げない

**ただし `buildTree` と `layoutTree`（ロジックツリー側）は引き上げる。** 現在の利用者は logic-tree だけだが、課題ツリーが2人目になり、シーケンスは使わない——「2本目の実例が出てから引き上げる」というこのリポジトリの既定の手順（リストエディタ・Markdown 表と同じ）にちょうど当たる。

---

## Global Constraints（全タスクの要件に暗黙に含まれる）

- **これは移設であって書き直しではない。** 変えてよいのは (a) import 元のパス、(b) 識別子の改名、(c) 特定ツールを名指ししているコメントの語だけ。**アルゴリズム・定数・JSDoc の本文を書き直さないこと。**
- **既存のテストが全部緑であることが完了条件である。** 移設先で赤が出るなら中身を書き換えている。**テストを期待値の側で直して通さないこと**——それは挙動を変えた事実を隠す操作である
- **既存の JSDoc は移設先でも正しい**（「親は最初の子と最後の子の中心に置く」「次の部分木を下げる量は重なる全深さの中で一番きつい制約で決まる」等）。消さずに運ぶ
- **`src/core/` にコンポーネント（`.tsx`）を置かない。** コアが提供するのは純関数と小さなフックで、描画はモジュール側が持つ（rev 6章「抽象の粒度は純関数＋小さなフック1本」）。エッジの SVG レイヤは各モジュールに残し、パスの生成だけを純関数として引き上げる
- ファイル名は kebab-case（`src/core/` の既存の流儀。`use-list-rows.ts` が前例）
- **計画の指示が矛盾していたら、辻褄を合わせずに「計画の矛盾」として報告する。** 報告には**実行した検証コマンドとその出力を貼る**こと

### 検証コマンド（全タスク共通）

```bash
npm test && npx tsc -b && npm run lint
```

---

## File Structure

### 新規（コア）

| ファイル | 責務 | 引用元 |
| --- | --- | --- |
| `src/core/canvas/viewport.ts` | `Transform` / `INITIAL_TRANSFORM` / `CANVAS_MARGIN` / `cssTransform` / `svgTransform` / `Rect` / `panIntoView` | `src/modules/logic-tree/viewport.ts` |
| `src/core/canvas/use-viewport.ts` | d3-zoom の配線と Space 監視、`ensureVisible` | `src/modules/logic-tree/useViewport.ts` |
| `src/core/canvas/canvas-font.ts` | 実効フォントの読み取りと canvas 測定器の生成 | `src/modules/logic-tree/node-font.ts` ＋ `sequence/seq-font.ts` の `FALLBACK_LABEL_FONT` |
| `src/core/canvas/wrap.ts` | `wrapWithin` / `createEstimateMeasurer` | `src/modules/sequence/measure.ts`（一般形の側） |
| `src/core/canvas/edges.ts` | 親→子のベジェパスの生成 | `src/modules/logic-tree/TreeEdges.tsx` の `edgePath` |
| `src/core/canvas/flat-tree.ts` | 平坦配列→木（循環に耐える全域関数）・DFS 正規化・部分木の終端・兄弟の列挙 | `src/modules/logic-tree/tree.ts` ＋ `commands.ts` の private 関数3本 |
| `src/core/canvas/tree-layout.ts` | `(木, サイズMap) → 座標Map` の純関数 | `src/modules/logic-tree/layout.ts` |

### 削除

`src/modules/logic-tree/` … `viewport.ts` / `viewport.test.ts` / `useViewport.ts` / `useViewport.dom.test.tsx` / `node-font.ts` / `tree.ts` / `tree.test.ts` / `layout.ts` / `layout.test.ts`

`src/modules/sequence/` … `viewport.ts` / `viewport.test.ts` / `useViewport.ts` / `useViewport.dom.test.tsx` / `seq-font.ts`

### 変更

`src/modules/logic-tree/` … `measure.ts` / `measure.test.ts` / `commands.ts` / `consistency.ts` / `LogicTreeEditor.tsx` / `LogicTreeEditor.font.dom.test.tsx` / `TreeEdges.tsx` と、上記を import しているテスト

`src/modules/sequence/` … `measure.ts` / `measure.test.ts` / `SequenceEditor.tsx` / `SequenceEdges.tsx`

`docs/` … `open-issues.md` / `overview-rev.md`（6章・9章）／`history/m20-core-canvas.md`（新規）

---
## Task 1: キャンバス基盤（ビューポート・測定・フォント）をコアへ引き上げる

**Files:**
- Create: `src/core/canvas/viewport.ts`, `src/core/canvas/use-viewport.ts`, `src/core/canvas/canvas-font.ts`, `src/core/canvas/wrap.ts`, `src/core/canvas/edges.ts`
- Create (test): `src/core/canvas/viewport.test.ts`, `src/core/canvas/use-viewport.dom.test.tsx`, `src/core/canvas/wrap.test.ts`, `src/core/canvas/edges.test.ts`
- Delete: `src/modules/logic-tree/viewport.ts`, `src/modules/logic-tree/viewport.test.ts`, `src/modules/logic-tree/useViewport.ts`, `src/modules/logic-tree/useViewport.dom.test.tsx`, `src/modules/logic-tree/node-font.ts`, `src/modules/sequence/viewport.ts`, `src/modules/sequence/viewport.test.ts`, `src/modules/sequence/useViewport.ts`, `src/modules/sequence/useViewport.dom.test.tsx`, `src/modules/sequence/seq-font.ts`
- Modify: `src/modules/logic-tree/measure.ts`, `src/modules/logic-tree/measure.test.ts`, `src/modules/logic-tree/LogicTreeEditor.tsx`, `src/modules/logic-tree/LogicTreeEditor.font.dom.test.tsx`, `src/modules/logic-tree/TreeEdges.tsx`, `src/modules/sequence/measure.ts`, `src/modules/sequence/measure.test.ts`, `src/modules/sequence/SequenceEditor.tsx`, `src/modules/sequence/SequenceEdges.tsx`

**Interfaces:**
- Consumes: なし（既存2モジュールの実物が入力）
- Produces: `Transform` / `Rect` / `INITIAL_TRANSFORM` / `CANVAS_MARGIN` / `cssTransform(t)` / `svgTransform(t)` / `panIntoView(t, rect, view, margin)` / `useViewport(ref, enabled): { transform, spaceHeld, ensureVisible }` / `CanvasFont` / `FALLBACK_CANVAS_FONT` / `FALLBACK_SMALL_FONT` / `sameFont(a, b)` / `readCanvasFont(el)` / `createCanvasMeasurer(font)` / `MeasureWidth` / `WrapOptions` / `WrappedBlock` / `wrapWithin(text, measure, lineHeight, opts)` / `createEstimateMeasurer(fontSize)` / `edgePath(from, to)`

**これは移設であって書き直しではない。** 引用元の実物をそのまま移し、変えてよいのは (a) import 元のパス、(b) 識別子の改名、(c) 特定ツールを名指ししているコメントの語だけである。**アルゴリズム・定数・JSDoc の本文を書き直さないこと。**

- [ ] **Step 1: `src/core/canvas/viewport.ts` を作る**

`src/modules/logic-tree/viewport.ts` の中身をそのまま置く（`Transform` / `CANVAS_MARGIN` / `INITIAL_TRANSFORM` / `cssTransform` / `svgTransform` / `Rect` / `fitAxis` / `panIntoView`）。冒頭に移設の由来を1つ足す:

```ts
/**
 * キャンバスのビューポート（rev 10章 キャンバスの標準操作。純関数）。
 *
 * ロジックツリー（logic-tree M1）とシーケンス（sequence M1）が同一の内容を
 * 複製していたものを M20 でコアへ引き上げた（3本目のキャンバスツール＝
 * 課題ツリーが来ることが契機）。rev 6章が「2実例を材料に別マイルストーンで
 * 判断する」と保留していた宿題にあたる
 */
```

- [ ] **Step 2: 移設したビューポートのテストを置き、緑を確かめる**

`src/modules/logic-tree/viewport.test.ts` を `src/core/canvas/viewport.test.ts` へ移す（import を `./viewport` に直すだけ）。

Run: `npx vitest run src/core/canvas/viewport.test.ts`
Expected: PASS

- [ ] **Step 3: `src/core/canvas/use-viewport.ts` を作る**

`src/modules/logic-tree/useViewport.ts` をそのまま置き、`import { INITIAL_TRANSFORM, panIntoView, type Rect, type Transform } from './viewport'` に直す。**ツール名を含むコメント1行だけを一般化する:**

```ts
      // ボタン・リンクの Space は活性化のキー。**位置ではなく役割で判定する**
      //（帯の「追加」などのボタンはキャンバスの内側にある）
```

- [ ] **Step 4: 移設したフックのテストを置く**

`src/modules/logic-tree/useViewport.dom.test.tsx` を `src/core/canvas/use-viewport.dom.test.tsx` へ移す。**sequence 側のコピーは中身が同一（差分はヘッダのコメント4行と、上と同じ1行のコメント語だけ。`diff` で確認済み）なので、2本を1本に畳む。**

Run: `npx vitest run src/core/canvas/use-viewport.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: `src/core/canvas/wrap.ts` を作る**

`src/modules/sequence/measure.ts` の `MeasureWidth` / `WrapOptions` / `WrappedBlock` / `wrapWithin` / `createEstimateMeasurer` を**そのまま**移す（sequence 側が一般形で、logic-tree の `wrapText` はその特殊化にあたる）。冒頭 JSDoc は `src/modules/logic-tree/measure.ts` の測定層の解説（「2パスにすると Enter のたびに一瞬ずれた位置に出てから飛ぶ」以下）を写す——一般形の側にはその説明が無く、なぜ同期的に測るのかが失われるため。

- [ ] **Step 6: `src/core/canvas/canvas-font.ts` を作る**

`src/modules/logic-tree/node-font.ts` をそのまま置き、識別子だけ改名する（`NodeFont`→`CanvasFont`、`FALLBACK_NODE_FONT`→`FALLBACK_CANVAS_FONT`、`readNodeFont`→`readCanvasFont`、`createNodeMeasurer`→`createCanvasMeasurer`。`sameFont` は同名）。あわせて sequence が持っていた小さい方の既定値を、その JSDoc ごと移す:

```ts
/**
 * 問いラベル列（text-xs）用の既定値。**FALLBACK_CANVAS_FONT を使い回さないこと**
 * ——text-xs は 12px・行間 1.5 で、text-sm（14px・1.65）とはサイズも行間も違う
 * （src/index.css の --text-xs--line-height / --text-sm--line-height）。
 * 揃えてしまうと、ラベル用の測定器が text-sm 相当の高さを返し続け、
 * jsdom のテストでは両者の違いを検出できなくなる
 */
export const FALLBACK_SMALL_FONT: CanvasFont = {
  font: 'normal 400 12px sans-serif',
  fontSize: 12,
  lineHeight: 12 * 1.5,
}
```

**`readCanvasFont(el)` の `el === null` 時の戻り値は `FALLBACK_CANVAS_FONT`（14px）のままにすること。** sequence は `text-xs` の見本要素に対しても `readSeqFont` を呼び、null のとき 14px の既定に落ちる——これは既存の挙動であり、この移設で変えない（変えると sequence の行高が静かにずれる）。

- [ ] **Step 7: 折り返しのテストを置く**

`src/modules/sequence/measure.test.ts` のうち `wrapWithin` / `createEstimateMeasurer` を対象にした `it` を `src/core/canvas/wrap.test.ts` へ移し、`src/modules/logic-tree/measure.test.ts` が見ている同じ性質（コードポイント単位のグリーディ・最大幅の切り上げ・明示改行）でコア側に無い観点があれば足す。**`NODE_*` / `LABEL_*` のような各ツールの定数を検証している `it` は移さない**（それらはモジュール側に残る）。

Run: `npx vitest run src/core/canvas/wrap.test.ts`
Expected: PASS

- [ ] **Step 8: `src/core/canvas/edges.ts` を作る**

`src/modules/logic-tree/TreeEdges.tsx` の `edgePath` を、コメントごと純関数として移す。**矩形を引数に取る形へ広げる**——課題ツリーはブロック（課題ノード＋仮説カード）でレイアウトし、線は**課題ノードの矩形**から引くため、位置とサイズを別々に渡せる必要がある。

```ts
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
```

- [ ] **Step 9: エッジのテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import { edgePath } from './edges'

describe('edgePath', () => {
  it('親の右辺の中央から子の左辺の中央へ引く', () => {
    const d = edgePath({ x: 0, y: 0, width: 100, height: 40 }, { x: 200, y: 100, width: 80, height: 20 })
    expect(d.startsWith('M 100 20 ')).toBe(true)
    expect(d.endsWith(' 200 110')).toBe(true)
  })

  it('列が近すぎても最低 16px は曲げる（直線に潰さない）', () => {
    // 張り出しが (x2 - x1) / 2 = 2 になる配置。16 に引き上がること
    const d = edgePath({ x: 0, y: 0, width: 100, height: 40 }, { x: 104, y: 0, width: 80, height: 40 })
    expect(d).toContain('C 116 20, 88 20,')
  })
})
```

**2件目は退化ケース回避のために置いてある**——`Math.max(16, ...)` を `(x2 - x1) / 2` に差し替えても1件目は通る。

Run: `npx vitest run src/core/canvas/edges.test.ts`
Expected: PASS

- [ ] **Step 10: ロジックツリーをコアへ載せ替える**

1. `src/modules/logic-tree/measure.ts`: `MeasureWidth` / `WrappedText` / `wrapText` / `createEstimateMeasurer` の実装を消し、`NODE_*` 定数と `NODE_BOX_CLASS` を残したうえで薄い包みを置く:

```ts
import { wrapWithin, type MeasureWidth, type WrappedBlock } from '@/core/canvas/wrap'

export type { MeasureWidth }
export type WrappedText = WrappedBlock

/** ノード矩形の寸法。折り返しの規則そのものは core/canvas/wrap.ts が持つ */
export function wrapText(text: string, measure: MeasureWidth, lineHeight: number): WrappedText {
  return wrapWithin(text, measure, lineHeight, {
    maxWidth: NODE_MAX_WIDTH,
    minWidth: NODE_MIN_WIDTH,
    insetX: NODE_INSET_X,
    insetY: NODE_INSET_Y,
  })
}
```

2. `LogicTreeEditor.tsx`: `./useViewport` → `@/core/canvas/use-viewport`、`./viewport` → `@/core/canvas/viewport`、`./node-font` → `@/core/canvas/canvas-font`。識別子の改名に追従する。
3. `TreeEdges.tsx`: `edgePath` をコアから import し、`positions`＋`sizes` から `Rect` を組んで渡す。
4. `LogicTreeEditor.font.dom.test.tsx` / `measure.test.ts` の import を直す。

- [ ] **Step 11: シーケンスをコアへ載せ替える**

`src/modules/sequence/measure.ts` から `wrapWithin` / `createEstimateMeasurer` / `MeasureWidth` / `WrapOptions` / `WrappedBlock` の実装を消し、`@/core/canvas/wrap` の再エクスポートに置き換える（`SequenceEditor.tsx` が `./measure` から引き続き読める形にして、変更を1ファイルに閉じる）。`SequenceEditor.tsx` は `./useViewport` / `./viewport` / `./seq-font` の import 元をコアへ向け、`SeqFont`→`CanvasFont`・`FALLBACK_SEQ_FONT`→`FALLBACK_CANVAS_FONT`・`FALLBACK_LABEL_FONT`→`FALLBACK_SMALL_FONT`・`readSeqFont`→`readCanvasFont`・`createSeqMeasurer`→`createCanvasMeasurer` に追従する。`SequenceEdges.tsx` は `svgTransform` の import 元を直す。

- [ ] **Step 12: 移設漏れが無いことを機械的に確かめる**

```bash
grep -rn "from './useViewport'|from './viewport'|from './seq-font'|from './node-font'" -E src/modules/
```
Expected: 一致0件

```bash
ls src/modules/logic-tree/viewport.ts src/modules/sequence/useViewport.ts
```
Expected: 2件とも「そのようなファイルはありません」

- [ ] **Step 13: 全体の検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。**とくに `src/modules/logic-tree/` と `src/modules/sequence/` の既存テストが全部緑であること**——ここが赤いなら移設で中身を書き換えている。

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "refactor(canvas): ビューポート・測定・フォント読み取りを core/canvas へ引き上げる"
```

---

## Task 2: 平坦木の組み立てと木のレイアウトをコアへ引き上げる

**Files:**
- Create: `src/core/canvas/flat-tree.ts`, `src/core/canvas/tree-layout.ts`
- Create (test): `src/core/canvas/flat-tree.test.ts`, `src/core/canvas/tree-layout.test.ts`
- Delete: `src/modules/logic-tree/tree.ts`, `src/modules/logic-tree/tree.test.ts`, `src/modules/logic-tree/layout.ts`, `src/modules/logic-tree/layout.test.ts`
- Modify: `src/modules/logic-tree/commands.ts`, `src/modules/logic-tree/consistency.ts`, `src/modules/logic-tree/LogicTreeEditor.tsx`, `src/modules/logic-tree/TreeEdges.tsx`, および上記を import しているテスト

**Interfaces:**
- Consumes: `Rect` / `edgePath`（Task 1）
- Produces: `FlatNode` / `FlatTreeNode` / `BuiltTree` / `buildTree(nodes)` / `orderFlatNodes(nodes)` / `subtreeEnd(built, index)` / `siblingsOf(built, index)` / `Point` / `Size` / `LayoutTreeNode` / `LayoutResult` / `COLUMN_GAP` / `SIBLING_GAP` / `layoutTree(roots, sizes)`

- [ ] **Step 1: `src/core/canvas/flat-tree.ts` を作る**

`src/modules/logic-tree/tree.ts` の `buildTree` を**そのまま**移し、入力と戻り値の型だけ構造的に広げる。**`text` を持たせない**——`NodeTree.text` は構築時にコピーされるだけで、`layout.ts` も `TreeEdges.tsx` も読んでいない（grep で確認済み）。

```ts
import { computeRowKeys } from '@/core/row-keys'

/** 平坦配列の1件が満たすべき最小の形。各ツールのノード型がこれを満たす */
export interface FlatNode {
  id: string
  parentId: string | null
}

/**
 * 組み立てた木の節点。**同一性の鍵は id ではなく key**
 *（ID 重複ファイルを「受け入れて赤表示」する以上、id では一意にならず、
 *  レイアウトの戻り値 Map<キー, 座標> が2ノードで衝突する）
 */
export interface FlatTreeNode {
  index: number
  key: string
  id: string
  children: FlatTreeNode[]
}

export interface BuiltTree {
  roots: FlatTreeNode[]
  depths: number[]
  parents: (number | null)[]
  children: number[][]
  unreachable: number[]
  missingParent: number[]
}

export function buildTree(nodes: readonly FlatNode[]): BuiltTree { /* tree.ts の実装をそのまま */ }
```

あわせて `src/modules/logic-tree/commands.ts` の `orderNodes` / `subtreeEnd` / `siblingsOf` をここへ移す（`orderNodes` は `orderFlatNodes` に改名し、要素の型を保つジェネリックにする）:

```ts
/**
 * 配列を DFS 行きがけ順に整える（兄弟の相対順は変えない）。
 *
 * 兄弟順の正本は配列順（rev 5章）なので、並べ替えても意味は変わらない。
 * この順を保つことで「挿入位置＝参照ノードの部分木の直後」という1つの規則が
 * 成立し、上から読めば木の形が追える JSON になる。
 *
 * 循環して根から到達できないノードは、末尾に元の順で残す。**消さないこと**
 *——ファイルにあるものが黙って減るのが一番たちが悪い
 */
export function orderFlatNodes<T extends FlatNode>(nodes: readonly T[]): T[] {
  const built = buildTree(nodes)
  const out: T[] = []
  const walk = (node: FlatTreeNode): void => {
    out.push(nodes[node.index])
    for (const child of node.children) walk(child)
  }
  for (const root of built.roots) walk(root)
  for (const index of built.unreachable) out.push(nodes[index])
  return out
}

/**
 * 行きがけ順の配列で、index の部分木が終わる位置（＝次の兄弟がいる位置）。
 * 深さが自分以下になる最初の位置を探せばよい
 */
export function subtreeEnd(built: BuiltTree, index: number): number { /* commands.ts の実装をそのまま */ }

/** 兄弟（同じ親を持つノード）の配列位置を、並び順で返す */
export function siblingsOf(built: BuiltTree, index: number): number[] { /* 同上 */ }
```

- [ ] **Step 2: 平坦木のテストを置き、緑を確かめる**

`src/modules/logic-tree/tree.test.ts` を `src/core/canvas/flat-tree.test.ts` へ移す（`text` を読んでいる `it` があれば `id` / `key` で見る形に直す）。`subtreeEnd` / `siblingsOf` / `orderFlatNodes` を直接見る `it` を足す。**兄弟3つ以上・深さ2以上の入力にすること**——兄弟2つ・深さ1では「常に先頭」「常に末尾」に差し替えても偶然一致する（logic-tree M1 が実際に踏んだ形）。

Run: `npx vitest run src/core/canvas/flat-tree.test.ts`
Expected: PASS

- [ ] **Step 3: `src/core/canvas/tree-layout.ts` を作る**

`src/modules/logic-tree/layout.ts` を**そのまま**移し、入力の型だけ構造的に広げる:

```ts
/** レイアウトが要求する木の形。FlatTreeNode がこれを満たす */
export interface LayoutTreeNode {
  key: string
  children: readonly LayoutTreeNode[]
}
```

`NodeTree` を参照している箇所を `LayoutTreeNode` に置き換える以外、**アルゴリズムと JSDoc を1行も変えない**（「親は最初の子と最後の子の中心に置く」「次の部分木を下げる量は重なる全深さの中で一番きつい制約で決まる」等の説明は移設先でも正しい）。

- [ ] **Step 4: レイアウトのテストを移す**

`src/modules/logic-tree/layout.test.ts` を `src/core/canvas/tree-layout.test.ts` へ移す。テストが `NodeTree` を組み立てているなら `{ key, children }` のリテラルに直す。

Run: `npx vitest run src/core/canvas/tree-layout.test.ts`
Expected: PASS

- [ ] **Step 5: ロジックツリーを載せ替える**

`commands.ts` は `orderNodes` / `subtreeEnd` / `siblingsOf` の定義を消してコアから import する。**`orderNodes` は既存の公開 API なので、名前を残す薄い包みを置く**（`commands.test.ts` と他の呼び出し元を巻き込まないため）:

```ts
import { buildTree, orderFlatNodes, siblingsOf, subtreeEnd, type BuiltTree } from '@/core/canvas/flat-tree'
import type { TreeNode } from '@/types/logic-tree'

/** 配列を DFS 行きがけ順に整える（規則はコアの orderFlatNodes が持つ） */
export const orderNodes = (nodes: readonly TreeNode[]): TreeNode[] => orderFlatNodes(nodes)
```

`consistency.ts` / `LogicTreeEditor.tsx` / `TreeEdges.tsx` は `./tree` / `./layout` の import 元をコアへ向ける。

- [ ] **Step 6: 移設漏れが無いことを機械的に確かめる**

```bash
grep -rn "from './tree'|from './layout'" -E src/modules/logic-tree/
```
Expected: 一致0件

- [ ] **Step 7: 全体の検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(canvas): 平坦木の組み立てと木のレイアウトを core/canvas へ引き上げる"
```

---

## Task 3: ドキュメントへの反映（マイルストーン完了時の3箇所）

**Files:**
- Create: `docs/history/m20-core-canvas.md`
- Modify: `docs/open-issues.md`, `docs/overview-rev.md`, `docs/README.md`

**Interfaces:**
- Consumes: Task 1・2 の結果
- Produces: 次の計画者が「正」として読む文書の更新

**`overview-rev.md` への反映はこのコミットで済ませ、申し送りに TODO として残さない**（M4 の教訓。次の計画者は rev を正として読むため、反映漏れは設計と実装の食い違いとして伝播する）。

- [ ] **Step 1: `docs/history/m20-core-canvas.md` を書く（追記専用・以後変えない）**

書くのは「そのとき何が起きたか」。少なくとも次を含める:

- **引き上げた範囲と、引き上げなかったもの**（レイアウト関数の性質がツールで大きく違うので、`layoutTree` は「木を描くツールのための関数」としてコアに置いたが、シーケンスの積み上げ型レイアウトは各モジュールに残した）
- **`FlatNode` / `LayoutTreeNode` という構造的な型で受ける形にした判断**——各ツールのノード型を継承やジェネリック制約で縛らず、「この形を満たしていれば通る」にした
- **`buildTree` の戻り値から `text` を落とした**こと（構築時にコピーされるだけで誰も読んでいなかった。grep で確認した）
- **`readCanvasFont(el)` の null 時の戻り値を 14px のまま据え置いた**こと——sequence は `text-xs` の見本要素に対してもこの関数を呼び、null のとき 14px の既定に落ちる。既存の挙動であり、移設で変えると行高が静かにずれる
- **移設で見つかったドリフト**（あれば）。open-issues は「フォント読み取りに既に差が1点ある」と記録していたので、他にも差があったかを書く
- Task 4（実機確認）の結果。**未実施ならその旨を明記し、確認項目のチェックリストを空のまま残す**

- [ ] **Step 2: `docs/open-issues.md` を編集する**

**消すもの:**

- **「キャンバスの土台が logic-tree と sequence で丸ごと複製されている」の項**（`[sequence-m1]` タグ、「小さな負債」の節）

**書き換えるもの（消さない。移設でパスが変わっただけ）:**

この項が末尾で「**この複製によってそのまま2本に増えている**」と書いている logic-tree 側の既知の穴3件は、**複製が消えたので1本に戻っただけで、穴そのものは消えていない。** それぞれの記録を探し、ファイルパスを `src/core/canvas/` へ直す:

- **モーダル中もホイール／ドラッグが生きている**——これは sequence M3 で両方の `useViewport.ts` を直して**既に解消済み**（rev 10章 境界規則の項に記録がある）。open-issues に残っていたら、解消済みとして消してよいかを確認したうえで判断する
- **ドラッグ中にアンマウントすると d3 が window に張ったリスナーが残る**（「挙動の穴」の節）→ パスを `src/core/canvas/use-viewport.ts` へ
- **`FOLLOW_MARGIN`(48) > `CANVAS_MARGIN`(40) で初回の追従が 8px ずれる**（「挙動の穴」の節）→ パスを `src/core/canvas/use-viewport.ts` / `viewport.ts` へ

**古いパスを残さないこと**——探しても見つからない記録は、読んだ人の時間を静かに奪う（M17 の教訓）。

**足すもの（`[M20]` タグを付ける）:**

- 移設の過程で気づいたが直さなかったものがあれば書く。**無ければ足さない**（無理に足す項目ではない）

**冒頭の「最終更新」の段落を更新すること**（何を消し何を足したかを書く形が既存の流儀）。

- [ ] **Step 3: `docs/overview-rev.md` へ反映する**

| 章 | 反映内容 |
| --- | --- |
| 6章 拡張要件 | **「キャンバス系ツールのレイアウト関数は当面モジュールが持つ（sequence M1 時点）」の項を書き換える。** ビューポート・測定層・フォント読み取り・平坦木の組み立て・木のレイアウトは `src/core/canvas/` へ引き上げた（**3本目のキャンバスツールが来ることが判断の契機**）。各モジュールに残るのは**箱の寸法定数と、そのツール固有の畳み方**であること。**「意図的に複製した」という現状説明の文を、過去の経緯として書き直す**——現在形のまま残すと、次の計画者が複製がまだあると読む |
| 9章 確定要素 | **測定層と描画層が同一のフォントトークンを参照する規約**の項の実装パスを `src/core/canvas/canvas-font.ts` へ直す |
| 10章 実装規約 | **キャンバス系ツールの実装構成**（ノードは絶対配置の DOM／エッジは SVG／ビューポートは d3-zoom）の項に、土台がコアの共有物になったことを反映する。**「3レイヤに同一の transform を当てる」という規約自体は変わらない** |

**`rev N章` は 249 箇所から参照されている通称。ファイル名と章番号を動かさないこと。**

- [ ] **Step 4: `docs/README.md` の「マイルストーンの履歴」に1行足す**

```markdown
| [M20](history/m20-core-canvas.md) | キャンバス基盤のコア化 | コア |
```

- [ ] **Step 5: 反映漏れが無いか機械的に確かめる**

```bash
grep -rn "modules/logic-tree/viewport|modules/sequence/useViewport|seq-font|node-font" -E docs/ src/
```
Expected: 一致0件（`docs/history/` の**過去のマイルストーンの記録**に出るのは正しい——それらは不変の記録なので直さない。出た行がすべて `docs/history/` 配下であることを目で確かめる）

- [ ] **Step 6: Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "docs(m20): 申し送り・残件・rev をキャンバス基盤のコア化に合わせる"
```

---

## Task 4: 実機確認（**人間の作業**）

**Files:** なし（確認のみ）

**サブエージェントは GUI を操作できない。このタスクは人間が行う。** Task 3 の申し送りは、この結果が出るまで「未実施」と明記したままにする。

**このマイルストーンは挙動を1つも変えないので、確認するのは「変わっていないこと」である。** ズーム・パンの配線は d3 が window にリスナーを張り替える形（rev 10章の明示的な例外）で、jsdom のテストは張り替えの先までは追えない。

```bash
npm install        # 省略しない。マージが依存を増やしていることがある
npm run tauri dev
```

- [ ] **1. ロジックツリー**を開き、`Ctrl+ホイール`（カーソル中心ズーム）／`Space+ドラッグ`／中ボタンドラッグ が効く
- [ ] **2. 素のホイールでズームしない・素の左ドラッグでパンしない**（d3 の既定を差し替えている部分が生きているか）
- [ ] **3. 画面外にノードを足したとき、視点がそこへ寄る**（`ensureVisible` の経路）
- [ ] **4. モーダル（削除の確認ダイアログ等）を開いている間、裏でキャンバスがズーム・パンしない**
- [ ] **5. シーケンス**を開いて 1〜4 を通す
- [ ] **6. シーケンスのセルのドロップダウンを開いたまま**キャンバスを動かしても破綻しない（境界規則の例外。**ここは止めない**のが正しい挙動）
- [ ] **7. 日本語を長く打ったノード／ステップの文字が枠から切れていない**（測定層とフォント読み取りが同じ情報源を見ているか。**Web フォントの読み込み後に測り直す**経路も含むので、リロード直後と数秒後の両方を見る）
- [ ] **8. 開発機と違う OS**（Windows で開発したなら mac、逆も同じ）で 1・7 を通す

**見つかったことは、症状（何が起きるか）と人間の言葉（何が嫌か）を分けて記録する。**
