# 課題ツリー（issueTree）モジュール issue-tree-m1 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PoC の「試さないと分からないこと」を課題として分解し、仮説と追記専用のイベント列で検証の履歴を持つ5本目のツール（`type: issueTree`）を、キャンバスエディタ・整合性検証・登録 Skill・お手本データまで揃えて追加する。

**Architecture:** ロジックツリーとシーケンスが独立に複製していたキャンバス基盤（ビューポート・測定・フォント読み取り・平坦木の組み立て・木のレイアウト）を先に `src/core/canvas/` へ引き上げ、3本目のキャンバスツールはそこに載せる（3度目の複製を作らない）。課題ツリー固有の心臓部は `src/modules/issue-tree/derive.ts` 1枚——「どの問いが立つか」「祖先の見送りで抑制されるか」「仮説の現在ステータス」はすべてここが導出し、アプリと登録 Skill が**バイト一致コピー**で同じ関数を読む。

**Tech Stack:** TypeScript / React 19 / Tailwind 4（役割トークン経由）/ d3-zoom / Ajv 2020 / Vitest（jsdom）/ Node 22.18+（Skill スクリプトの型ストリップ）

**Spec:**
- 設計の正: [`docs/issue-tree/仮説検証モジュール-設計ノート.md`](../../issue-tree/仮説検証モジュール-設計ノート.md)（判断 D1〜D9・スコープの IN/OUT）
- データ形式の正: [`schemas/issue-tree.schema.json`](../../../schemas/issue-tree.schema.json)（導出ルールは description に明記済み）
- 見え方の参考: [`docs/issue-tree/仮説検証モック.jsx`](../../issue-tree/仮説検証モック.jsx)（**モックはネスト構造だが、実装はフラット配列＋`parentId` が正**。色分けも不採用——下の Global Constraints を見よ）

---

## この計画が置いた前提（着手前に読むこと）

**1. キャンバス基盤をコアへ引き上げる（Task 1・2）。** ブリーフは「ロジックツリーエディタの基盤を**再利用**」と指示している。rev 6章の「モジュール規約の境界（コア / 各ツールモジュール）は跨がないこと」により、`@/modules/logic-tree/...` を課題ツリーから import することはできない。したがって選択肢は「コアへ引き上げる」か「3度目の複製を作る」の二択で、後者は [`docs/open-issues.md`](../../open-issues.md) が sequence M1 以来の負債として記録している形そのものである。rev 6章は「規約化するか各モジュール任せにするかは、この2実例を材料に**別マイルストーンで判断する**」と保留しており、3本目が来た本マイルストーンがその判断の場になる。

**この前提が否決される場合、Task 1・2 を落として課題ツリー側に4度目の複製を置く形へ縮退できる**（その場合は複製の記録を open-issues に足すこと）。ただし**着手後に切り替えないこと**——Task 3 以降のすべてが `@/core/canvas/*` から import する。

**2. 実物が正。** 計画のコードは検証済みの正ではない（[`docs/lessons-for-planning.md`](../../lessons-for-planning.md) 大原則）。**ただしその例外として、既存実装と一致すべきもの——移設するファイルの中身・整合性検証の文言・正規形の出力・Skill のディレクトリ規約——は実物が正である。** 本計画が引用元のパスを示している箇所は、パラフレーズではなく実物から写すこと。

**3. 計画の指示が矛盾していたら、辻褄を合わせずに「計画の矛盾」として報告する。** 報告には**実行した検証コマンドとその出力を貼る**こと（実行していない作業を完了として報告する経路を塞ぐため）。

---

## Global Constraints（全タスクの要件に暗黙に含まれる）

以下は本計画のどのタスクでも守る。値は既存実装・スキーマ・rev から**逐語で写してある**。

### データ

- `schemaVersion: 1` / `type: "issueTree"` 固定。**スキーマは既に確定しており、本マイルストーンで `schemas/issue-tree.schema.json` を変更しない。**
- ID は `issue_` + 英数字62文字アルファベット10文字 ／ `hypothesis_` + 同10文字。**連番禁止**（rev 5章）。採番はアプリ側 `src/core/new-id.ts` の `newId('issue')` / `newId('hypothesis')`、Skill 側 `scripts/new-id.mjs` のみを通す。
- **全キー常在。** `text` / `rationale` の空文字＝未記入、`events: []`＝未決、`pendingNotes: []`＝判断待ち無し。**欠落キーで未決を表さない。**
- `issues` の配列順は DFS 行きがけ順（兄弟順の正）。`hypotheses` の配列順は、ぶら下がり先の課題の順→同一課題内の表示順。
- **イベントは追記専用。** 過去の要素を書き換えない・削除しない。編集を許すのは**最新イベントの `note` だけ**（追記した直後に根拠を書く経路が要るため）。誤った追記の取り消しは Undo（1操作1コミット）に委ねる。
- 座標・幅・折りたたみ状態・選択状態をデータに入れない（rev 3章。スキーマの `additionalProperties: false` が塞いでいる）。

### 導出ルール（スキーマ description の逐語。実装は `derive.ts` 1箇所）

- 「仮説は？」＝ **子を持たない課題**に仮説が0件（D1 の折衷案。中間ノードには立たない）
- 「検証結果は？」＝ 仮説の `events` が0件
- 「判断は？」＝ 仮説の `pendingNotes` が空でない（D9 のレビュー締め忘れ検出）
- **祖先課題（自分自身を含む）の最新イベントが見送りのとき、配下の問いは立たない。** 抑制は祖先を遡る導出であり、**子に値をコピーしない**（D3）
- 仮説の現在ステータスは `events` の最新要素の `kind` から導出する。**ミュータブルな状態フィールドを持たない**（D2）
- 課題ノードの `events` は見送り系2種だけなので、**1件でもあれば抑制**（解除は配下の仮説への新イベント追記で行う。スキーマ description のとおり）

### 色・フォント（機械検査が走査する）

- **色値の直書き禁止。** 役割トークン（`text-ink` / `text-ink-muted` / `bg-surface` / `bg-canvas` / `border-rule` / `border-warning` / `bg-warning/10` / `bg-warning/20` / `ring-ring`）だけを使う。`src/styles/conventions.test.ts` が `src/` 全体を走査し、`#rrggbb` / `rgb(` / `oklch(` と **Tailwind 標準パレット**（`bg-rose-600` 等）を弾く。
- **半透明の warning は `/10`（未決）と `/20`（整合性エラー）の2つだけ。** `src/styles/palette.test.ts` は `src/modules/` 配下の `.tsx` を**ディレクトリで**走査し、`(bg|border|text)-warning/NN` の `NN` が検算済み（10 と 20）以外なら落ちる。**新モジュールの部品も最初からこの走査に入る。**
- `const errorCell = 'bg-warning/20'` / `const warnCell = 'bg-warning/10'` という名前で宣言する場合、値はこの2つでなければならない（同テストが名前と値の対応を固定している）。
- **`bg-warning/*` の面の上に置く文字は `text-ink` か `text-ink-muted` だけ**（`text-warning` を置かない。M8 決定12）。
- フォントサイズは `text-xs` / `text-sm` / `text-base` / `text-lg` / `text-2xl` の5段のみ。**`text-xl` と任意値 `text-[13px]` は使えない。**
- フォーカス表示は面の塗り替えではなくリング（`focus:ring-2 focus:ring-inset focus:ring-ring`）。
- **モックの色分け（emerald / rose / stone / sky / indigo のイベント種別チップ）は採らない。** 理由は2つあり、どちらか片方でも成立する: (1) Tailwind 標準パレットは配色差し替えに追従しないので上の機械検査が弾く、(2) D8 が「色は使わない（赤＝未定義の意味論を汚染しない）」と決めており、`warning` を「棄却」に流用すると未決の意味論が壊れる。**イベントの種類は文字ラベル（支持／棄却／自明に成立／検証せず棄却／今回見送り／本開発送り）で区別し、面は無地にする。**

### 操作言語（rev 10章。キーの判定はコアの `resolveCommand` の外に書かない）

- 課題セルは `hierarchical: true`（`Tab`＝子課題を追加、`←→`＝親子移動）。仮説・由来・メモ・イベントのセルは `hierarchical: false`（`Tab`＝欄移動）。`horizontal` はどこでも `false`。
- `Shift+Enter` / `Alt+Enter` は誰も消費しない（＝ブラウザ既定のセル内改行が生きる）。**止めないこと。**
- IME 対応は `CellInput` と `toKeyEventLike` が持つ。**各セルの `onKeyDown` に IME 判定を撒かない。**
- モーダルが開いている間は `modalOpen` を `KeyContext` と `useViewport(ref, !modalOpen)` にそのまま渡す。
- **主修飾キー＋`Enter`（コアの `toggle-item-state`）を、このツールでは「そのセルの主たる副操作」に写像する。** 写像はツール側の `runCommand` に置き、`src/core/keyboard/keymap.ts` は変更しない（rev 10章「意味の解決はコアのまま、写像だけツール側」。sequence M2 の前例と同じ層の適用）。
  - 課題セル → **仮説を追加**
  - 仮説セル → **判断イベントを追加**（種類のドロップダウンを開く）
  - メモセル → **最新イベントの根拠へ移す**（イベントが0件なら何も起きない）
  - 由来セル・イベントの note セル → 何も起きない

### テスト

- **テストの件数を計画に書かない。** 期待値は「このファイルの `it` がすべて緑」。
- 退化ケース（要素2つ・深さ1・端・空）だけをテストデータに選ばない。期待値ごとに「**隣の実装でも同じ値になるか**」を1回問い、なるなら入力を1段複雑にする（兄弟3つ・途中の子・キャレットを端に置く）。
- DOM テストは role とアクセシブル名で引く。レイアウトやクラス名に依存させない。
- 各タスクの検証は**対象を絞らずに** `npm test && npx tsc -b && npm run lint` を回す。

### 検証コマンド（全タスク共通）

```bash
npm test && npx tsc -b && npm run lint
```

---

## File Structure

### 新規（コア：キャンバス基盤）

| ファイル | 責務 |
| --- | --- |
| `src/core/canvas/viewport.ts` | `Transform` / `INITIAL_TRANSFORM` / `cssTransform` / `svgTransform` / `Rect` / `panIntoView`（純関数） |
| `src/core/canvas/use-viewport.ts` | d3-zoom の配線と Space 監視、`ensureVisible`（フック1本） |
| `src/core/canvas/canvas-font.ts` | 実効フォントの読み取りと canvas 測定器の生成 |
| `src/core/canvas/wrap.ts` | `wrapWithin` / `createEstimateMeasurer`（DOM 非依存の折り返し） |
| `src/core/canvas/flat-tree.ts` | 平坦配列→木（循環に耐える全域関数）、DFS 正規化、部分木の終端・兄弟の列挙 |
| `src/core/canvas/tree-layout.ts` | `(木, サイズMap) → 座標Map` の純関数（Reingold–Tilford 型） |
| `src/core/canvas/edges.ts` | 親→子のベジェパスの生成（純関数） |

### 新規（課題ツリーモジュール）

| ファイル | 責務 |
| --- | --- |
| `src/modules/issue-tree/derive.ts` | **導出の心臓部。**問いの立ち方・抑制・ステータス・集計・表示文言。**値 import を持たない**（Skill へバイト一致コピーするため） |
| `src/modules/issue-tree/commands.ts` | 構造編集（課題・仮説・メモ）とイベント追記。DFS 正規化を含む |
| `src/modules/issue-tree/consistency.ts` | 規約4：モジュール内検証（5ルール） |
| `src/modules/issue-tree/measure.ts` | 箱の寸法定数と、それに対応する Tailwind クラス |
| `src/modules/issue-tree/layout.ts` | 課題ノード＋ぶら下がる仮説カードを1ブロックとして畳み、コアの木レイアウトへ渡す |
| `src/modules/issue-tree/IssueBox.tsx` | 課題ノード1つ |
| `src/modules/issue-tree/HypothesisCard.tsx` | 仮説カード1枚（文言・由来・メモ・イベント行） |
| `src/modules/issue-tree/IssueTreeEdges.tsx` | エッジのレイヤ（抑制された枝を落とす） |
| `src/modules/issue-tree/IssueTreeEditor.tsx` | 規約3：エディタ本体 |
| `src/modules/issue-tree/module.ts` | 規約1〜7＋`createEmpty` |
| `src/modules/issue-tree/migrate.ts` | 規約6：初版なので恒等 |

### 新規（登録 Skill）

`.claude/skills/issue-tree-register/` … `SKILL.md` / `package.json` / `.gitignore` / `schemas/issue-tree.schema.json`（バイト一致コピー）/ `scripts/new-id.mjs` / `scripts/canonical.ts`（バイト一致コピー）/ `scripts/derive.ts`（バイト一致コピー）/ `scripts/issue-tree-write.mjs`

### 変更

| ファイル | 変更内容 |
| --- | --- |
| `src/modules/logic-tree/` | `viewport.ts` / `useViewport.ts` / `node-font.ts` / `tree.ts` / `layout.ts` と対応するテストを削除し、コアを参照する |
| `src/modules/sequence/` | `viewport.ts` / `useViewport.ts` / `seq-font.ts` と対応するテストを削除し、コアを参照する |
| `src/modules/index.ts` | `issueTreeModule` を1行 register |
| `src/core/skill-sync.ts` | `BUNDLED_SKILLS` に `issue-tree-register` を追加 |
| `src/core/skill-schema-copy.test.ts` | `SCHEMA_COPIES` に1件追加 |
| `src/core/reading-guide.md` | 課題ツリーの読み方（未解決論点5の回答）を追記 |
| `sample-project/課題ツリー.json` | お手本1本（新規。追跡対象） |
| `README.md` | ツール表・お手本表・同梱 Skill の本数 |
| `docs/README.md` / `docs/open-issues.md` / `docs/overview-rev.md` / `docs/history/issue-tree-m1-*.md` | 完了時の反映 |

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
 * 複製していたものを、3本目のキャンバスツール（課題ツリー）を足す
 * issue-tree-m1 でコアへ引き上げた。rev 6章が「2実例を材料に別マイルストーンで
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

## Task 3: 型生成の確認とスキーマ検証（レベル1）のテスト

**Files:**
- Create (test): `src/modules/issue-tree/schema.test.ts`
- 生成物: `src/types/issue-tree.ts`（`npm run gen:types` が作る。`.gitignore` 済みなのでコミットしない）

**Interfaces:**
- Produces: `IssueTreeSchemaVersion1` / `IssueNode` / `Hypothesis` / `JudgementEvent` / `DeferralEvent`（`@/types/issue-tree` から）

`scripts/gen-types.mjs` は `schemas/*.schema.json` を**走査する**ので、スキーマを足すだけで `pretest` / `prebuild` / `predev` の3経路すべてが追従する。**このタスクでスクリプトを触る必要は無い。**

- [ ] **Step 1: 型が生成されることを確かめる**

Run: `npm run gen:types`
Expected: 出力に `gen:types  issue-tree.schema.json -> src/types/issue-tree.ts` が現れる

- [ ] **Step 2: 生成された型の形を目で確かめる**

Run: `node -e "process.stdout.write(require('fs').readFileSync('src/types/issue-tree.ts','utf8'))"`
Expected: `IssueTreeSchemaVersion1` / `IssueNode` / `DeferralEvent` / `Hypothesis` / `JudgementEvent` の5つが `export interface` として出ており、**インデックスシグネチャ（`[k: string]: unknown`）が付いていない**こと。付いていたらスキーマの `additionalProperties: false` が抜けている。

- [ ] **Step 3: スキーマ検証のテストを書く**

`src/modules/logic-tree/schema.test.ts` と同じ形。**「受け入れる」側と「拒否する」側の両方を書く**——レベル1は「拒否は解釈不能な場合に限る」（rev 5章）なので、受け入れる側を落とすとファイルが開けなくなる。

```ts
import { describe, expect, it } from 'vitest'
import type { JsonSchema } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import issueTreeSchema from '../../../schemas/issue-tree.schema.json'

const validate = createSchemaValidator(issueTreeSchema as JsonSchema)

const ISSUE_A = 'issue_aB3xY9kLm2'
const ISSUE_B = 'issue_Qw7zR1nP4t'
const HYP_A = 'hypothesis_Kd4hR6yU1c'

const base = {
  schemaVersion: 1,
  type: 'issueTree',
  title: '適性検査サービス連携PoC',
  issues: [
    { id: ISSUE_A, parentId: null, text: '適性検査サービス連携（PoCテーマ）', events: [] },
    { id: ISSUE_B, parentId: ISSUE_A, text: '結果取得を画面遷移の中で待てるか', events: [] },
  ],
  hypotheses: [
    {
      id: HYP_A,
      issueId: ISSUE_B,
      text: 'webhook受信＋非同期表示に切り替えれば体験が成立する',
      rationale: '類似連携の実測が3〜8秒だったため',
      events: [{ kind: 'supported', note: 'スパイクで受信まで中央値4.2秒（n=50）' }],
      pendingNotes: [],
    },
  ],
}

describe('issueTree のスキーマ検証（レベル1）', () => {
  it('最小の正しいファイルを受け入れる', () => {
    expect(validate(base).ok).toBe(true)
  })

  it('課題0件・仮説0件（新規作成直後）を受け入れる', () => {
    expect(validate({ ...base, issues: [], hypotheses: [] }).ok).toBe(true)
  })

  it('空の文言・空の由来を受け入れる', () => {
    // 追加した直後の状態がそのまま自動保存されうる。ここを弾くと
    // 打ち終わる前の保存が「自分で作った開けないファイル」になる
    const issues = [{ id: ISSUE_A, parentId: null, text: '', events: [] }]
    const hypotheses = [
      { id: HYP_A, issueId: ISSUE_A, text: '', rationale: '', events: [], pendingNotes: [] },
    ]
    expect(validate({ ...base, issues, hypotheses }).ok).toBe(true)
  })

  it('イベントの note が空文字でも受け入れる', () => {
    const hypotheses = [{ ...base.hypotheses[0], events: [{ kind: 'deferred', note: '' }] }]
    expect(validate({ ...base, hypotheses }).ok).toBe(true)
  })

  it('pendingNotes を持つ仮説を受け入れる', () => {
    const hypotheses = [{ ...base.hypotheses[0], pendingNotes: ['SHが「分単位窓では？」と発言'] }]
    expect(validate({ ...base, hypotheses }).ok).toBe(true)
  })

  it('課題ノードに支持・棄却のイベントを付けたものを拒否する', () => {
    // 課題は「支持・棄却を判定される主張」ではない。付けられるのは見送り系2種だけ
    const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [{ kind: 'supported', note: '' }] }]
    expect(validate({ ...base, issues }).ok).toBe(false)
  })

  it('課題ノードに見送り系2種のイベントを付けたものは受け入れる', () => {
    for (const kind of ['deferred', 'deferredToMainDev']) {
      const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [{ kind, note: '理由' }] }]
      expect(validate({ ...base, issues }).ok, kind).toBe(true)
    }
  })

  it('仮説のイベント種別6種をすべて受け入れる', () => {
    for (const kind of [
      'supported',
      'rejected',
      'supportedWithoutTest',
      'rejectedWithoutTest',
      'deferred',
      'deferredToMainDev',
    ]) {
      const hypotheses = [{ ...base.hypotheses[0], events: [{ kind, note: '' }] }]
      expect(validate({ ...base, hypotheses }).ok, kind).toBe(true)
    }
  })

  it('未知のイベント種別を拒否する（enum の拡張は schemaVersion の改訂）', () => {
    const hypotheses = [{ ...base.hypotheses[0], events: [{ kind: 'memo', note: 'x' }] }]
    expect(validate({ ...base, hypotheses }).ok).toBe(false)
  })

  it('ID のプレフィクス・長さが違うものを拒否する', () => {
    expect(validate({ ...base, issues: [{ id: 'node_aB3xY9kLm2', parentId: null, text: 'x', events: [] }] }).ok).toBe(false)
    expect(validate({ ...base, issues: [{ id: 'issue_aB3xY9kLm', parentId: null, text: 'x', events: [] }] }).ok).toBe(false)
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], id: 'issue_aB3xY9kLm2' }] }).ok).toBe(false)
  })

  it('未知のキーを拒否する（座標をデータに入れる経路を塞ぐ）', () => {
    const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [], x: 10 }]
    expect(validate({ ...base, issues }).ok).toBe(false)
    const hypotheses = [{ ...base.hypotheses[0], status: 'supported' }]
    expect(validate({ ...base, hypotheses }).ok).toBe(false)
  })

  it('キーの欠損を拒否する（全キー常在）', () => {
    expect(validate({ ...base, issues: [{ id: ISSUE_A, parentId: null, text: 'x' }] }).ok).toBe(false)
    const { rationale: _r, ...withoutRationale } = base.hypotheses[0]
    expect(validate({ ...base, hypotheses: [withoutRationale] }).ok).toBe(false)
    const { pendingNotes: _p, ...withoutNotes } = base.hypotheses[0]
    expect(validate({ ...base, hypotheses: [withoutNotes] }).ok).toBe(false)
  })

  it('循環・多重ルート・参照切れのファイルはスキーマ検証を通る（レベル2の担当）', () => {
    // 「拒否は解釈不能な場合に限る」（rev 5章）。構造は読めるので開ける
    const cyclic = [
      { id: ISSUE_A, parentId: ISSUE_B, text: 'a', events: [] },
      { id: ISSUE_B, parentId: ISSUE_A, text: 'b', events: [] },
    ]
    expect(validate({ ...base, issues: cyclic, hypotheses: [] }).ok).toBe(true)
    const dangling = [{ ...base.hypotheses[0], issueId: 'issue_ZZZZZZZZZZ' }]
    expect(validate({ ...base, hypotheses: dangling }).ok).toBe(true)
  })
})
```

- [ ] **Step 4: テストを走らせる**

Run: `npx vitest run src/modules/issue-tree/schema.test.ts`
Expected: PASS（`schemas/issue-tree.schema.json` は既に確定済みなので、赤くなったらスキーマではなくテストの側を疑う。**スキーマを直さないこと**——直したくなったら「計画の矛盾」として報告する）

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(issue-tree): スキーマ検証（レベル1）の境界をテストで固定する"
```

---

## Task 4: `derive.ts` ——導出の心臓部

**Files:**
- Create: `src/modules/issue-tree/derive.ts`
- Create (test): `src/modules/issue-tree/derive.test.ts`

**Interfaces:**
- Consumes: `@/types/issue-tree` の型（Task 3）
- Produces: `DeferralKind` / `JudgementKind` / `HypothesisStatus` / `IssueStatus` / `latestKind(events)` / `hypothesisStatus(h)` / `issueStatus(node)` / `suppressedIssueIds(issues)` / `leafIssueIds(issues)` / `PosedQuestions` / `poseQuestions(data)` / `IssueTreeTally` / `tallyQuestions(posed)` / `QUESTION_LABELS` / `EVENT_KIND_LABELS` / `tallyLine(t)` / `SUPPRESSED_NOTE`

**このファイルは登録 Skill へバイト一致コピーされる（Task 11）。したがって守るべき制約が3つある:**

1. **値 import を持たない**（`import type` だけ。Node の型ストリップでコピー側が相対解決できなくなるため）
2. **`enum` とパラメータプロパティを使わない**（型ストリップで消せない構文）
3. 相対 import を持たない（`@/types/issue-tree` の型 import のみ）

Task 11 のテストがこの3つを機械的に固定するが、**ここで守っておかないと Task 11 で書き直しになる。**

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import type { Hypothesis, IssueNode } from '@/types/issue-tree'
import {
  EVENT_KIND_LABELS,
  hypothesisStatus,
  latestKind,
  leafIssueIds,
  poseQuestions,
  suppressedIssueIds,
  tallyLine,
  tallyQuestions,
} from './derive'

const id = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const hid = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/** 根(0) — 子(1) — 孫(2) ／ 根 — 子(3) ／ 子(1) — 孫(4)。兄弟3つ・深さ2を含む */
function issues(): IssueNode[] {
  return [
    { id: id(0), parentId: null, text: '根', events: [] },
    { id: id(1), parentId: id(0), text: '中間', events: [] },
    { id: id(2), parentId: id(1), text: '葉A', events: [] },
    { id: id(3), parentId: id(0), text: '葉B', events: [] },
    { id: id(4), parentId: id(1), text: '葉C', events: [] },
  ]
}

function hypothesis(n: number, issueId: string, over: Partial<Hypothesis> = {}): Hypothesis {
  return { id: hid(n), issueId, text: `仮説${n}`, rationale: '', events: [], pendingNotes: [], ...over }
}

describe('latestKind / ステータスの導出（D2）', () => {
  it('events が空なら null（＝未決）', () => {
    expect(latestKind([])).toBe(null)
    expect(hypothesisStatus(hypothesis(1, id(2)))).toBe('undecided')
  })

  it('**最後の**要素の kind を返す（判断の覆りが履歴を消さずに表現できる）', () => {
    // 先頭を返す実装と取り違えられないよう、3件で最初・中間・最後をすべて別の値にする
    const h = hypothesis(1, id(2), {
      events: [
        { kind: 'rejected', note: '一度は棄却' },
        { kind: 'deferred', note: '見送り' },
        { kind: 'supported', note: '半年後に復活して支持' },
      ],
    })
    expect(hypothesisStatus(h)).toBe('supported')
  })
})

describe('leafIssueIds（D1: 問いが立つのは葉だけ）', () => {
  it('子を持つ課題は葉に数えない', () => {
    expect([...leafIssueIds(issues())].sort()).toEqual([id(2), id(3), id(4)].sort())
  })

  it('親が実在しない課題は、その親を非葉にしない', () => {
    // 参照切れは図の上でルートとして描かれる（整合性検証が別に赤くする）。
    // 存在しない親の id で葉判定を左右させない
    const broken: IssueNode[] = [
      { id: id(0), parentId: null, text: '根', events: [] },
      { id: id(9), parentId: 'issue_ZZZZZZZZZZ', text: '迷子', events: [] },
    ]
    expect([...leafIssueIds(broken)].sort()).toEqual([id(0), id(9)].sort())
  })
})

describe('suppressedIssueIds（D3: 抑制は祖先を遡る導出）', () => {
  it('見送りを付けた課題と、その子孫すべてを含む', () => {
    const list = issues()
    list[1] = { ...list[1], events: [{ kind: 'deferred', note: '初回受検フローの成立が先' }] }
    expect([...suppressedIssueIds(list)].sort()).toEqual([id(1), id(2), id(4)].sort())
  })

  it('本開発送りも抑制する（見送り系2種のどちらでも同じ）', () => {
    const list = issues()
    list[1] = { ...list[1], events: [{ kind: 'deferredToMainDev', note: '' }] }
    expect(suppressedIssueIds(list).has(id(2))).toBe(true)
  })

  it('兄弟の枝には及ばない', () => {
    const list = issues()
    list[1] = { ...list[1], events: [{ kind: 'deferred', note: '' }] }
    expect(suppressedIssueIds(list).has(id(3))).toBe(false)
  })

  it('循環しているファイルでも止まらない（レベル2は受け入れて開く）', () => {
    const cyclic: IssueNode[] = [
      { id: id(0), parentId: id(1), text: 'a', events: [] },
      { id: id(1), parentId: id(0), text: 'b', events: [] },
    ]
    expect(() => suppressedIssueIds(cyclic)).not.toThrow()
    expect(suppressedIssueIds(cyclic).size).toBe(0)
  })
})

describe('poseQuestions（問いの立ち方）', () => {
  it('葉で仮説が0件なら「仮説は？」が立ち、中間ノードには立たない（D1 折衷案）', () => {
    const posed = poseQuestions({ issues: issues(), hypotheses: [] })
    expect(posed.issueNeedsHypothesis).toEqual([false, false, true, true, true])
  })

  it('中間ノードに仮説を付けても、その仮説の「検証結果は？」は立つ', () => {
    // 仮説はどのノードにも付けられる。抑えているのは「仮説は？」の問いだけ
    const posed = poseQuestions({ issues: issues(), hypotheses: [hypothesis(1, id(1))] })
    expect(posed.issueNeedsHypothesis[1]).toBe(false)
    expect(posed.hypothesisQuestions[0].result).toBe(true)
  })

  it('仮説が付いた葉には「仮説は？」が立たない', () => {
    const posed = poseQuestions({ issues: issues(), hypotheses: [hypothesis(1, id(2))] })
    expect(posed.issueNeedsHypothesis[2]).toBe(false)
    expect(posed.issueNeedsHypothesis[3]).toBe(true)
  })

  it('pendingNotes が残っていれば「判断は？」が立つ（D9 の締め忘れ検出）', () => {
    const h = hypothesis(1, id(2), {
      events: [{ kind: 'supported', note: '' }],
      pendingNotes: ['SHが「分単位窓では？」と発言'],
    })
    const posed = poseQuestions({ issues: issues(), hypotheses: [h] })
    expect(posed.hypothesisQuestions[0]).toEqual({ result: false, judgement: true })
  })

  it('祖先が見送りなら配下の3つの問いはすべて立たない', () => {
    const list = issues()
    list[1] = { ...list[1], events: [{ kind: 'deferred', note: '' }] }
    const h = hypothesis(1, id(2), { pendingNotes: ['メモ'] })
    const posed = poseQuestions({ issues: list, hypotheses: [h] })
    expect(posed.issueNeedsHypothesis[2]).toBe(false)
    expect(posed.issueNeedsHypothesis[4]).toBe(false)
    expect(posed.hypothesisQuestions[0]).toEqual({ result: false, judgement: false })
    // 抑制の外にある兄弟の枝は立ったまま
    expect(posed.issueNeedsHypothesis[3]).toBe(true)
  })
})

describe('集計と表示文言（アプリと Skill が同じ文字列を出す）', () => {
  it('立っている問いだけを数える', () => {
    const list = issues()
    const hypotheses = [
      hypothesis(1, id(2)), // 検証結果は？
      hypothesis(2, id(3), { events: [{ kind: 'supported', note: '' }], pendingNotes: ['x'] }), // 判断は？
    ]
    const t = tallyQuestions(poseQuestions({ issues: list, hypotheses }))
    // 葉は 2/3/4 の3つ。2 と 3 には仮説が付いたので「仮説は？」は 4 の1件だけ
    expect(t).toEqual({ hypothesis: 1, result: 1, judgement: 1, total: 3 })
  })

  it('帯に出す1行が組み立てられる', () => {
    expect(tallyLine({ hypothesis: 1, result: 2, judgement: 0, total: 3 })).toBe(
      '⚠ 未決 3（仮説は？ 1 ／ 検証結果は？ 2 ／ 判断は？ 0）',
    )
  })

  it('6種すべてに表示ラベルがある', () => {
    expect(EVENT_KIND_LABELS.supported).toBe('支持')
    expect(EVENT_KIND_LABELS.rejected).toBe('棄却')
    expect(EVENT_KIND_LABELS.supportedWithoutTest).toBe('自明に成立')
    expect(EVENT_KIND_LABELS.rejectedWithoutTest).toBe('検証せず棄却')
    expect(EVENT_KIND_LABELS.deferred).toBe('今回見送り')
    expect(EVENT_KIND_LABELS.deferredToMainDev).toBe('本開発送り')
  })
})
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npx vitest run src/modules/issue-tree/derive.test.ts`
Expected: FAIL（`Failed to resolve import "./derive"`）

- [ ] **Step 3: `derive.ts` を実装する**

```ts
import type {
  DeferralEvent,
  Hypothesis,
  IssueNode,
  IssueTreeSchemaVersion1,
  JudgementEvent,
} from '@/types/issue-tree'

/**
 * 課題ツリーの導出（設計ノート D1〜D3・D9。このツールの心臓部）。
 *
 * 仮説と課題は**ミュータブルな状態を持たない**。現在ステータスは追記専用の
 * イベント列の最新から、問いの立ち方は木の形と件数から、抑制は祖先を遡って
 * 導出する。導出元のない手動ステータスは更新忘れで嘘をつく（D2）。
 *
 * **この導出をユーザー・ツール設定・ノード側の宣言で変えられるようにしては
 * ならない**——問いのセットが可変になった瞬間、「埋めるべき穴がいくつ
 * 残っているか」をツールが判定できなくなり、未決の可視化が成立しない
 *（シーケンスの questions.ts と同じ位置づけ）。
 *
 * **このファイルは登録 Skill（.claude/skills/issue-tree-register/scripts/derive.ts）
 * へバイト一致でコピーされる。** だから値 import・相対 import・enum を
 * 持たない。ズレは src/modules/issue-tree/skill-copy.test.ts が検知する
 */

export type DeferralKind = DeferralEvent['kind']
export type JudgementKind = JudgementEvent['kind']

/** 仮説の現在ステータス。events が空＝未決 */
export type HypothesisStatus = JudgementKind | 'undecided'
/** 課題の現在ステータス。events が空＝見送られていない */
export type IssueStatus = DeferralKind | 'open'

/** 最新イベントの kind。空なら null（＝未決） */
export function latestKind<K extends string>(events: readonly { kind: K }[]): K | null {
  return events.length === 0 ? null : events[events.length - 1].kind
}

export function hypothesisStatus(h: Pick<Hypothesis, 'events'>): HypothesisStatus {
  return latestKind(h.events) ?? 'undecided'
}

export function issueStatus(node: Pick<IssueNode, 'events'>): IssueStatus {
  return latestKind(node.events) ?? 'open'
}

/**
 * 見送りが効いている課題の ID 集合（D3）。自分自身の見送りも含む。
 *
 * **課題ノードのイベントは見送り系2種しか無い**（スキーマ）ので、1件でもあれば
 * 抑制される。見送りを解除して拾い直すときは、配下の仮説へ新しい判断イベントを
 * 追記して最新を更新する——課題側から解除イベントを打つ機構は持たない。
 *
 * **循環しているファイルでも止まらないこと**が要件。循環・参照切れは整合性検証
 * （レベル2）が受け止める＝ファイルは開ける（rev 5章）ので、ここには壊れた木が
 * 渡ってくる。祖先を辿る経路ごとに訪問済みを持ち、戻ってきたら打ち切る
 */
export function suppressedIssueIds(issues: readonly IssueNode[]): Set<string> {
  const byId = new Map<string, IssueNode>()
  // 同じ id が2件あるときは先に現れた方を親とする（core/canvas/flat-tree.ts と同じ規則）
  for (const node of issues) if (!byId.has(node.id)) byId.set(node.id, node)

  const out = new Set<string>()
  for (const start of issues) {
    const seen = new Set<string>()
    let node: IssueNode | undefined = start
    while (node !== undefined && !seen.has(node.id)) {
      seen.add(node.id)
      if (latestKind(node.events) !== null) {
        out.add(start.id)
        break
      }
      node = node.parentId === null ? undefined : byId.get(node.parentId)
    }
  }
  return out
}

/**
 * 子を持たない課題の ID 集合（D1「問いが立つのは葉だけ」の判定）。
 *
 * **親が実在しない課題は、その親を非葉にしない。** 参照切れの課題は図の上で
 * ルートとして描かれる（整合性検証が別に赤くする）ので、存在しない id を
 * 親として数えると、どこにも無いノードのせいで問いが消える
 */
export function leafIssueIds(issues: readonly IssueNode[]): Set<string> {
  const existing = new Set<string>()
  for (const node of issues) existing.add(node.id)
  const hasChild = new Set<string>()
  for (const node of issues) {
    if (node.parentId !== null && existing.has(node.parentId)) hasChild.add(node.parentId)
  }
  const out = new Set<string>()
  for (const node of issues) if (!hasChild.has(node.id)) out.add(node.id)
  return out
}

/** 仮説1件に立つ問い */
export interface HypothesisQuestions {
  /** 「検証結果は？」＝ events が0件 */
  result: boolean
  /** 「判断は？」＝ pendingNotes が空でない（レビューの締め忘れ） */
  judgement: boolean
}

export interface PosedQuestions {
  /** issues と同じ添字。true＝「仮説は？」が立つ */
  issueNeedsHypothesis: boolean[]
  /** hypotheses と同じ添字 */
  hypothesisQuestions: HypothesisQuestions[]
}

/**
 * 問いの導出。**戻り値は入力の配列と同じ添字で並ぶ**——ID を鍵にすると、
 * ID 重複ファイル（受け入れて赤表示する）で2件が同じ鍵に潰れる
 */
export function poseQuestions(
  data: Pick<IssueTreeSchemaVersion1, 'issues' | 'hypotheses'>,
): PosedQuestions {
  const suppressed = suppressedIssueIds(data.issues)
  const leaves = leafIssueIds(data.issues)
  const hasHypothesis = new Set<string>()
  for (const h of data.hypotheses) hasHypothesis.add(h.issueId)

  const issueNeedsHypothesis = data.issues.map(
    (node) => !suppressed.has(node.id) && leaves.has(node.id) && !hasHypothesis.has(node.id),
  )
  const hypothesisQuestions = data.hypotheses.map((h) => {
    // ぶら下がり先が実在しない仮説は抑制されない（どの課題の配下でもない）。
    // 参照切れそのものは整合性検証（レベル2）が赤くする
    const off = suppressed.has(h.issueId)
    return {
      result: !off && h.events.length === 0,
      judgement: !off && h.pendingNotes.length > 0,
    }
  })
  return { issueNeedsHypothesis, hypothesisQuestions }
}

export interface IssueTreeTally {
  hypothesis: number
  result: number
  judgement: number
  total: number
}

/** 立っている問いだけを数える（抑制された配下は勘定に入らない） */
export function tallyQuestions(posed: PosedQuestions): IssueTreeTally {
  let hypothesis = 0
  let result = 0
  let judgement = 0
  for (const needs of posed.issueNeedsHypothesis) if (needs) hypothesis += 1
  for (const q of posed.hypothesisQuestions) {
    if (q.result) result += 1
    if (q.judgement) judgement += 1
  }
  return { hypothesis, result, judgement, total: hypothesis + result + judgement }
}

/** 問いの文言。**アプリの画面と Skill の報告が同じ言葉を出すため、ここ1箇所に置く** */
export const QUESTION_LABELS = {
  hypothesis: '仮説は？',
  result: '検証結果は？',
  judgement: '判断は？',
} as const

/** イベント種別の表示ラベル。**色では区別しない**（D8。役割トークンの意味論を汚さない） */
export const EVENT_KIND_LABELS: Record<JudgementKind, string> = {
  supported: '支持',
  rejected: '棄却',
  supportedWithoutTest: '自明に成立',
  rejectedWithoutTest: '検証せず棄却',
  deferred: '今回見送り',
  deferredToMainDev: '本開発送り',
}

/** 集計の1行。エディタの帯と Skill の報告が逐語で同じ文字列を出す */
export function tallyLine(t: IssueTreeTally): string {
  return `⚠ 未決 ${t.total}（${QUESTION_LABELS.hypothesis} ${t.hypothesis} ／ ${QUESTION_LABELS.result} ${t.result} ／ ${QUESTION_LABELS.judgement} ${t.judgement}）`
}

/** 抑制された配下に添える1文（「なぜここには問いが無いのか」の説明） */
export const SUPPRESSED_NOTE = '祖先の見送りにより問いは立たない（導出。子に値は持たない）'
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/modules/issue-tree/derive.test.ts`
Expected: PASS

- [ ] **Step 5: Skill コピーの前提3つを機械的に確かめる**

```bash
grep -n "^import" src/modules/issue-tree/derive.ts
```
Expected: `import type {` で始まる1文だけ（値 import が無い）

```bash
grep -nE "^\s*(export\s+)?(const\s+)?enum\s|from '\./" src/modules/issue-tree/derive.ts
```
Expected: 一致0件

- [ ] **Step 6: 全体の検証と Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "feat(issue-tree): 問いの立ち方・抑制・ステータスの導出を derive.ts に置く"
```

---

## Task 5: `commands.ts` ——構造編集とイベント追記

**Files:**
- Create: `src/modules/issue-tree/commands.ts`
- Create (test): `src/modules/issue-tree/commands.test.ts`

**Interfaces:**
- Consumes: `buildTree` / `orderFlatNodes` / `subtreeEnd` / `siblingsOf`（`@/core/canvas/flat-tree`、Task 2）、`insertAt` / `removeAt` / `moveItem`（`@/core/list-ops`）、`newId`（`@/core/new-id`）
- Produces: `FocusTarget` / `EditResult` / `normalizeOrder(data)` / `addRootIssue(data)` / `addChildIssue(data, i)` / `addSiblingIssueAfter(data, i)` / `deleteIssueSubtree(data, i)` / `moveIssueSibling(data, i, delta)` / `setIssueText(data, i, text)` / `appendDeferral(data, i, kind)` / `addHypothesis(data, issueIndex)` / `addHypothesisAfter(data, i)` / `deleteHypothesis(data, i)` / `moveHypothesis(data, i, delta)` / `setHypothesisText(data, i, text)` / `setRationale(data, i, text)` / `addPendingNote(data, i)` / `setPendingNote(data, i, noteIndex, text)` / `removePendingNote(data, i, noteIndex)` / `promoteNote(data, i, noteIndex)` / `appendJudgement(data, i, kind)` / `setEventNote(data, i, eventIndex, note)`

**課題側の構造編集は `src/modules/logic-tree/commands.ts` と同じ形にする。** `prepare`（参照の同一性で位置を引き直す）・`subtreeEnd`（挿入位置＝部分木の直後）・`addSiblingAfter` がルート上では子を足す、といった規則は**実物が正**であり、写して `IssueNode` 用に読み替えるだけにする。以下は課題ツリー固有の差分だけを書く。

- [ ] **Step 1: 失敗するテストを書く（正規化・課題の構造編集）**

```ts
import { describe, expect, it } from 'vitest'
import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'
import {
  addChildIssue,
  addHypothesis,
  addPendingNote,
  appendDeferral,
  appendJudgement,
  deleteIssueSubtree,
  moveHypothesis,
  normalizeOrder,
  promoteNote,
  setEventNote,
} from './commands'

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

/** 根(0) — 子(1) — 孫(2), 孫(4) ／ 根 — 子(3)。兄弟3つ・深さ2を含む */
function data(): IssueTreeSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'issueTree',
    title: 'T',
    issues: [
      { id: I(0), parentId: null, text: '根', events: [] },
      { id: I(1), parentId: I(0), text: '中間', events: [] },
      { id: I(2), parentId: I(1), text: '葉A', events: [] },
      { id: I(4), parentId: I(1), text: '葉C', events: [] },
      { id: I(3), parentId: I(0), text: '葉B', events: [] },
    ],
    hypotheses: [
      { id: H(1), issueId: I(3), text: '仮説1', rationale: '', events: [], pendingNotes: [] },
      { id: H(2), issueId: I(2), text: '仮説2', rationale: '', events: [], pendingNotes: [] },
      { id: H(3), issueId: I(2), text: '仮説3', rationale: '', events: [], pendingNotes: [] },
    ],
  }
}

describe('normalizeOrder', () => {
  it('課題を DFS 行きがけ順に、仮説をその課題順に並べ替える', () => {
    const next = normalizeOrder(data())
    expect(next.issues.map((n) => n.id)).toEqual([I(0), I(1), I(2), I(4), I(3)])
    // I(2) が I(3) より先に来たので、そこにぶら下がる仮説2・3 が前へ出る
    expect(next.hypotheses.map((h) => h.id)).toEqual([H(2), H(3), H(1)])
  })

  it('同じ課題の中の相対順は変えない（表示順の正だから）', () => {
    const d = data()
    d.hypotheses = [d.hypotheses[2], d.hypotheses[1], d.hypotheses[0]] // H3, H2, H1
    expect(normalizeOrder(d).hypotheses.map((h) => h.id)).toEqual([H(3), H(2), H(1)])
  })

  it('ぶら下がり先が実在しない仮説は末尾に元の順で残す（消さない）', () => {
    const d = data()
    d.hypotheses = [
      { id: H(9), issueId: 'issue_ZZZZZZZZZZ', text: '迷子', rationale: '', events: [], pendingNotes: [] },
      ...d.hypotheses,
    ]
    const next = normalizeOrder(d)
    expect(next.hypotheses.map((h) => h.id)).toEqual([H(2), H(3), H(1), H(9)])
  })
})

describe('課題の構造編集', () => {
  it('子を足すと部分木の直後に入り、そこへフォーカスが行く', () => {
    const next = addChildIssue(normalizeOrder(data()), 1) // I(1) の子
    expect(next.data.issues.map((n) => n.id).slice(0, 5)).toEqual([I(0), I(1), I(2), I(4), expect.any(String)])
    expect(next.data.issues[4].parentId).toBe(I(1))
    expect(next.focus).toEqual({ cell: 'issue', index: 4 })
  })

  it('部分木を消すと、その配下にぶら下がる仮説も一緒に消える', () => {
    // **仮説を残すと、どの課題にも属さない孤児が黙って増える**
    const next = deleteIssueSubtree(normalizeOrder(data()), 1) // I(1) 以下（I(2), I(4)）
    expect(next.data.issues.map((n) => n.id)).toEqual([I(0), I(3)])
    expect(next.data.hypotheses.map((h) => h.id)).toEqual([H(1)])
  })
})

describe('仮説とメモ', () => {
  it('仮説を足すと、その課題の末尾に入る', () => {
    const next = addHypothesis(normalizeOrder(data()), 2) // I(2)
    const forIssue2 = next.data.hypotheses.filter((h) => h.issueId === I(2))
    expect(forIssue2.map((h) => h.id).slice(0, 2)).toEqual([H(2), H(3)])
    expect(forIssue2).toHaveLength(3)
    expect(forIssue2[2].text).toBe('')
    expect(forIssue2[2].id.startsWith('hypothesis_')).toBe(true)
  })

  it('仮説の並び替えは同じ課題の中だけで起きる', () => {
    // 隣の課題の仮説と入れ替える実装と取り違えられないよう、
    // 別の課題の仮説を挟んだ状態（正規化前）で端の仮説を動かす
    const d = normalizeOrder(data())
    const at = d.hypotheses.findIndex((h) => h.id === H(3))
    const next = moveHypothesis(d, at, 1) // 課題内の末尾。動かない
    expect(next.data.hypotheses.map((h) => h.id)).toEqual([H(2), H(3), H(1)])
    expect(next.focus).toBe(null)
  })

  it('メモを足すと空文字が1件増え、そこへフォーカスが行く', () => {
    const next = addPendingNote(normalizeOrder(data()), 0)
    expect(next.data.hypotheses[0].pendingNotes).toEqual([''])
    expect(next.focus).toEqual({ cell: 'note', index: 0, noteIndex: 0 })
  })
})

describe('イベントの追記（D2: 追記専用）', () => {
  it('判断イベントは末尾に足され、過去の要素を書き換えない', () => {
    const d = normalizeOrder(data())
    const once = appendJudgement(d, 0, 'rejected')
    const twice = appendJudgement(once.data, 0, 'supported')
    expect(twice.data.hypotheses[0].events).toEqual([
      { kind: 'rejected', note: '' },
      { kind: 'supported', note: '' },
    ])
    expect(twice.focus).toEqual({ cell: 'event', index: 0, eventIndex: 1 })
  })

  it('課題ノードへは見送り系だけを追記する', () => {
    const next = appendDeferral(normalizeOrder(data()), 1, 'deferred')
    expect(next.data.issues[1].events).toEqual([{ kind: 'deferred', note: '' }])
  })

  it('最新イベントの note は書けるが、過去のイベントは書き換えられない', () => {
    const d = appendJudgement(appendJudgement(normalizeOrder(data()), 0, 'rejected').data, 0, 'supported').data
    const ok = setEventNote(d, 0, 1, '中央値4.2秒')
    expect(ok.hypotheses[0].events[1].note).toBe('中央値4.2秒')
    const blocked = setEventNote(d, 0, 0, '後から根拠を足す')
    expect(blocked).toBe(d) // 同一参照＝何も起きていない
  })

  it('メモは選んだものだけが最新イベントの根拠へ移る（D9）', () => {
    let d = normalizeOrder(data())
    d = addPendingNote(d, 0).data
    d = { ...d, hypotheses: d.hypotheses.map((h, i) => (i === 0 ? { ...h, pendingNotes: ['採る', '雑談', '採る2'] } : h)) }
    d = appendJudgement(d, 0, 'supported').data
    d = promoteNote(d, 0, 0).data
    d = promoteNote(d, 0, 1).data // 「雑談」を飛ばして「採る2」を採る（添字は詰まっている）
    expect(d.hypotheses[0].events[0].note).toBe('採る\n採る2')
    expect(d.hypotheses[0].pendingNotes).toEqual(['雑談'])
  })

  it('イベントが1件も無いときメモは移せない（根拠の行き先が無い）', () => {
    let d = normalizeOrder(data())
    d = { ...d, hypotheses: d.hypotheses.map((h, i) => (i === 0 ? { ...h, pendingNotes: ['メモ'] } : h)) }
    expect(promoteNote(d, 0, 0).data).toBe(d)
  })
})
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npx vitest run src/modules/issue-tree/commands.test.ts`
Expected: FAIL（`Failed to resolve import "./commands"`）

- [ ] **Step 3: 正規化とフォーカスの型を実装する**

```ts
import { buildTree, orderFlatNodes, siblingsOf, subtreeEnd } from '@/core/canvas/flat-tree'
import { insertAt, moveItem, removeAt } from '@/core/list-ops'
import { newId } from '@/core/new-id'
import type {
  DeferralEvent,
  Hypothesis,
  IssueNode,
  IssueTreeSchemaVersion1,
  JudgementEvent,
} from '@/types/issue-tree'

/**
 * 操作後に編集させたい欄。**`index` はそれぞれの配列（issues / hypotheses）の位置。**
 * 課題と仮説で配列が分かれているので、ロジックツリーのような `focusIndex: number`
 * ひとつでは行き先を表せない
 */
export type FocusTarget =
  | { cell: 'issue'; index: number }
  | { cell: 'hypothesis'; index: number }
  | { cell: 'rationale'; index: number }
  | { cell: 'note'; index: number; noteIndex: number }
  | { cell: 'event'; index: number; eventIndex: number }

export interface EditResult {
  data: IssueTreeSchemaVersion1
  /** 行き先が無いときは null */
  focus: FocusTarget | null
}

/**
 * 課題を DFS 行きがけ順に、仮説を「ぶら下がり先の課題の順」に整える
 *（スキーマの配列順の規約）。
 *
 * **同じ課題にぶら下がる仮説どうしの相対順は変えない**——そこは表示順の正
 * であり、`Array.prototype.sort` は安定（ES2019 以降）なのでこれが保たれる。
 *
 * ぶら下がり先が実在しない仮説は**末尾に元の順で残す。消さないこと**
 *——ファイルにあるものが黙って減るのが一番たちが悪い（参照切れは
 * 整合性検証が赤くする）
 */
export function normalizeOrder(data: IssueTreeSchemaVersion1): IssueTreeSchemaVersion1 {
  const issues = orderFlatNodes(data.issues)
  const rank = new Map<string, number>()
  // ID 重複は先に現れた方を採る（core/canvas/flat-tree.ts と同じ規則）
  issues.forEach((node, i) => {
    if (!rank.has(node.id)) rank.set(node.id, i)
  })
  const attached: Hypothesis[] = []
  const orphans: Hypothesis[] = []
  for (const h of data.hypotheses) (rank.has(h.issueId) ? attached : orphans).push(h)
  attached.sort((a, b) => (rank.get(a.issueId) ?? 0) - (rank.get(b.issueId) ?? 0))
  return { ...data, issues, hypotheses: [...attached, ...orphans] }
}
```

- [ ] **Step 4: 課題側の構造編集を実装する**

`src/modules/logic-tree/commands.ts` の `prepare` / `addRoot` / `addChild` / `addSiblingAfter` / `deleteSubtree` / `moveSibling` / `setText` を写し、次の3点だけを読み替える:

1. `newNode(parentId)` → `newIssue(parentId)` は `{ id: newId('issue'), parentId, text: '', events: [] }`
2. `orderNodes` の呼び出しを `normalizeOrder` に置き換える（仮説の並びも一緒に整えるため）
3. **`deleteIssueSubtree` は、消える課題の id 集合を作って `hypotheses` からも落とす:**

```ts
/**
 * 部分木ごと消す（空欄 Backspace）。**ぶら下がる仮説も一緒に消す**
 *——残すと、どの課題にも属さない孤児が黙って増える（参照切れとして
 * 赤くはなるが、ユーザーは「消したのに残っている」と見る）。
 *
 * 確認ダイアログは挟まない（rev 5章。会議中の入力速度を削ぐため）。
 * 1操作1コミットの Undo で戻せる
 */
export function deleteIssueSubtree(data: IssueTreeSchemaVersion1, index: number): EditResult {
  const p = prepare(data, index)
  if (p === null) return { data, focus: null }
  const end = subtreeEnd(p.built, p.i)
  const removedIds = new Set(p.issues.slice(p.i, end).map((n) => n.id))
  // 行き先は削除前の位置で決める: 前の兄弟 → 親 → 無し（logic-tree と同じ）
  const siblings = siblingsOf(p.built, p.i)
  const pos = siblings.indexOf(p.i)
  const target = pos > 0 ? siblings[pos - 1] : p.built.parents[p.i]
  const kept = [...p.issues.slice(0, p.i), ...p.issues.slice(end)]
  const at = target === null ? -1 : kept.indexOf(p.issues[target])
  return {
    data: {
      ...data,
      issues: kept,
      hypotheses: data.hypotheses.filter((h) => !removedIds.has(h.issueId)),
    },
    focus: at < 0 ? null : { cell: 'issue', index: at },
  }
}
```

- [ ] **Step 5: 仮説・由来・メモの編集を実装する**

```ts
function newHypothesis(issueId: string): Hypothesis {
  return { id: newId('hypothesis'), issueId, text: '', rationale: '', events: [], pendingNotes: [] }
}

function replaceHypothesis(
  data: IssueTreeSchemaVersion1,
  index: number,
  next: Hypothesis,
): IssueTreeSchemaVersion1 {
  return { ...data, hypotheses: data.hypotheses.map((h, i) => (i === index ? next : h)) }
}

/**
 * 課題に仮説を足す（主修飾キー＋Enter／ノードの「＋仮説」ボタン）。
 *
 * **どの課題にも付けられる**（D1）。中間ノードへの「当たりをつける」仮説を
 * 制約違反にすると、形式的な子ノードを作る迂回入力を強いることになる。
 * 「仮説は？」の問いが葉にしか立たないのは別の話で、そちらは derive.ts の担当
 */
export function addHypothesis(data: IssueTreeSchemaVersion1, issueIndex: number): EditResult {
  const issue = data.issues[issueIndex]
  if (issue === undefined) return { data, focus: null }
  const created = newHypothesis(issue.id)
  // 末尾に足してから正規化する。**位置は参照の同一性で引き直す**
  //（正規化で配列位置が動くため、足した位置をそのまま使うと別の仮説を指す）
  const next = normalizeOrder({ ...data, hypotheses: [...data.hypotheses, created] })
  return { data: next, focus: { cell: 'hypothesis', index: next.hypotheses.indexOf(created) } }
}

/** 直後に仮説を足す（仮説セルでの Enter）。**同じ課題にぶら下げる** */
export function addHypothesisAfter(data: IssueTreeSchemaVersion1, index: number): EditResult {
  const ref = data.hypotheses[index]
  if (ref === undefined) return { data, focus: null }
  const created = newHypothesis(ref.issueId)
  const next = normalizeOrder({ ...data, hypotheses: insertAt(data.hypotheses, index + 1, created) })
  return { data: next, focus: { cell: 'hypothesis', index: next.hypotheses.indexOf(created) } }
}

/** 仮説を消す（空欄 Backspace）。イベントもメモも一緒に消える */
export function deleteHypothesis(data: IssueTreeSchemaVersion1, index: number): EditResult {
  if (data.hypotheses[index] === undefined) return { data, focus: null }
  const kept = removeAt(data.hypotheses, index)
  const at = index > 0 && kept[index - 1]?.issueId === data.hypotheses[index].issueId ? index - 1 : null
  return { data: { ...data, hypotheses: kept }, focus: at === null ? null : { cell: 'hypothesis', index: at } }
}

/**
 * 同じ課題の中で1つ動かす（Alt+↑↓）。
 * **課題をまたがない**——またぐと `issueId` を書き換えることになり、
 * 「並び替え」が「付け替え」に化ける
 */
export function moveHypothesis(
  data: IssueTreeSchemaVersion1,
  index: number,
  delta: -1 | 1,
): EditResult {
  const ref = data.hypotheses[index]
  if (ref === undefined) return { data, focus: null }
  const to = index + delta
  const other = data.hypotheses[to]
  if (other === undefined || other.issueId !== ref.issueId) return { data, focus: null }
  return {
    data: { ...data, hypotheses: moveItem(data.hypotheses, index, to) },
    focus: { cell: 'hypothesis', index: to },
  }
}

/** 文言の置き換え。**並べ替えない**——打鍵のたびに配列が動くとフォーカスを見失う */
export function setHypothesisText(data: IssueTreeSchemaVersion1, index: number, text: string) {
  const h = data.hypotheses[index]
  return h === undefined ? data : replaceHypothesis(data, index, { ...h, text })
}

export function setRationale(data: IssueTreeSchemaVersion1, index: number, rationale: string) {
  const h = data.hypotheses[index]
  return h === undefined ? data : replaceHypothesis(data, index, { ...h, rationale })
}

/** FBメモを1件足す（由来セルの Enter／メモセルの Enter／「メモ」ボタン） */
export function addPendingNote(data: IssueTreeSchemaVersion1, index: number): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined) return { data, focus: null }
  const pendingNotes = [...h.pendingNotes, '']
  return {
    data: replaceHypothesis(data, index, { ...h, pendingNotes }),
    focus: { cell: 'note', index, noteIndex: pendingNotes.length - 1 },
  }
}

export function setPendingNote(
  data: IssueTreeSchemaVersion1,
  index: number,
  noteIndex: number,
  text: string,
): IssueTreeSchemaVersion1 {
  const h = data.hypotheses[index]
  if (h === undefined || h.pendingNotes[noteIndex] === undefined) return data
  return replaceHypothesis(data, index, {
    ...h,
    pendingNotes: h.pendingNotes.map((n, i) => (i === noteIndex ? text : n)),
  })
}

export function removePendingNote(
  data: IssueTreeSchemaVersion1,
  index: number,
  noteIndex: number,
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.pendingNotes[noteIndex] === undefined) return { data, focus: null }
  const pendingNotes = removeAt(h.pendingNotes, noteIndex)
  const at = noteIndex > 0 ? noteIndex - 1 : null
  return {
    data: replaceHypothesis(data, index, { ...h, pendingNotes }),
    focus: at === null ? { cell: 'rationale', index } : { cell: 'note', index, noteIndex: at },
  }
}
```

- [ ] **Step 6: イベントの追記を実装する**

```ts
/**
 * 判断イベントを追記する（D2）。**追記専用**——過去の要素は書き換えない。
 *
 * `note` は空で作り、直後に最新イベントの note セルへフォーカスを移す。
 * **pendingNotes を自動で流し込まない**（D9）——雑談メモを公式の根拠へ
 * 昇格させない選別の余地を残すため、移動は promoteNote で1件ずつ行う
 */
export function appendJudgement(
  data: IssueTreeSchemaVersion1,
  index: number,
  kind: JudgementEvent['kind'],
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined) return { data, focus: null }
  const events = [...h.events, { kind, note: '' }]
  return {
    data: replaceHypothesis(data, index, { ...h, events }),
    focus: { cell: 'event', index, eventIndex: events.length - 1 },
  }
}

/**
 * 課題ノードへ見送りイベントを追記する（D3）。
 * **配下へ値をコピーしない**——抑制は derive.ts が祖先を遡って導出する
 */
export function appendDeferral(
  data: IssueTreeSchemaVersion1,
  index: number,
  kind: DeferralEvent['kind'],
): EditResult {
  const node = data.issues[index]
  if (node === undefined) return { data, focus: null }
  const events = [...node.events, { kind, note: '' }]
  return {
    data: { ...data, issues: data.issues.map((n, i) => (i === index ? { ...n, events } : n)) },
    focus: { cell: 'issue', index },
  }
}

/**
 * イベントの根拠を書く。**編集できるのは最新イベントだけ。**
 *
 * 追記した直後に根拠を打つ経路は要るが、過去のイベントに後から根拠を足せると
 * 「そのとき何を根拠に決めたか」が書き換わる——追記専用の列である意味が消える。
 * 誤った追記の取り消しは Undo（1操作1コミット）に委ねる
 */
export function setEventNote(
  data: IssueTreeSchemaVersion1,
  index: number,
  eventIndex: number,
  note: string,
): IssueTreeSchemaVersion1 {
  const h = data.hypotheses[index]
  if (h === undefined || eventIndex !== h.events.length - 1) return data
  return replaceHypothesis(data, index, {
    ...h,
    events: h.events.map((e, i) => (i === eventIndex ? { ...e, note } : e)),
  })
}

/**
 * FBメモ1件を**最新イベントの根拠へ移す**（D9 の選別移動）。
 * イベントが1件も無ければ何も起きない（根拠の行き先が無い）。
 * 既に根拠があるときは改行で連結する
 */
export function promoteNote(
  data: IssueTreeSchemaVersion1,
  index: number,
  noteIndex: number,
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.events.length === 0) return { data, focus: null }
  const text = h.pendingNotes[noteIndex]
  if (text === undefined) return { data, focus: null }
  const last = h.events.length - 1
  const merged = h.events[last].note === '' ? text : `${h.events[last].note}\n${text}`
  return {
    data: replaceHypothesis(data, index, {
      ...h,
      events: h.events.map((e, i) => (i === last ? { ...e, note: merged } : e)),
      pendingNotes: removeAt(h.pendingNotes, noteIndex),
    }),
    focus: { cell: 'event', index, eventIndex: last },
  }
}
```

- [ ] **Step 7: テストが通ることを確かめる**

Run: `npx vitest run src/modules/issue-tree/commands.test.ts`
Expected: PASS

- [ ] **Step 8: 「壊したら落ちるか」を1回確かめる**

`moveHypothesis` の `other.issueId !== ref.issueId` のガードを一時的に外して `npx vitest run src/modules/issue-tree/commands.test.ts` を走らせ、**落ちること**を確認してから戻す。落ちないなら、テストデータが退化している（課題をまたぐ位置に隣の仮説が無い）ので入力を1段複雑にする。

- [ ] **Step 9: 全体の検証と Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "feat(issue-tree): 課題・仮説・メモの構造編集とイベント追記を実装する"
```

---

## Task 6: `consistency.ts` ——モジュール内検証（規約4）

**Files:**
- Create: `src/modules/issue-tree/consistency.ts`
- Create (test): `src/modules/issue-tree/consistency.test.ts`

**Interfaces:**
- Consumes: `ConsistencyIssue` / `ConsistencyLocation`（`@/core/consistency`）、`findDuplicates`（`@/core/duplicate`）、`buildTree`（`@/core/canvas/flat-tree`）
- Produces: `checkIssueTreeConsistency(data): ConsistencyIssue[]`

**ここで決めるメッセージ文言は、Task 11 の登録 Skill が逐語で複製する。** 一致は Task 11 の smoke テストが実行結果の突き合わせで固定するので、**ここが正**である。

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'
import { checkIssueTreeConsistency } from './consistency'

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

function make(over: Partial<IssueTreeSchemaVersion1>): IssueTreeSchemaVersion1 {
  return { schemaVersion: 1, type: 'issueTree', title: 'T', issues: [], hypotheses: [], ...over }
}

describe('checkIssueTreeConsistency', () => {
  it('健全なファイルでは何も出ない', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: I(0), text: '葉', events: [] },
      ],
      hypotheses: [
        { id: H(1), issueId: I(1), text: '仮説', rationale: '', events: [], pendingNotes: [] },
      ],
    })
    expect(checkIssueTreeConsistency(data)).toEqual([])
  })

  it('中間ノードにぶら下がる仮説は指摘しない（D1: どのノードにも付けられる）', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: I(0), text: '葉', events: [] },
      ],
      hypotheses: [
        { id: H(1), issueId: I(0), text: '当たりをつける', rationale: '', events: [], pendingNotes: [] },
      ],
    })
    expect(checkIssueTreeConsistency(data)).toEqual([])
  })

  it('課題の ID 重複を1件にまとめて指摘する', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: 'a', events: [] },
        { id: I(0), parentId: null, text: 'b', events: [] },
        { id: I(0), parentId: null, text: 'c', events: [] },
      ],
    })
    const issues = checkIssueTreeConsistency(data)
    const dup = issues.filter((i) => i.rule === 'duplicate-id')
    expect(dup).toHaveLength(1)
    expect(dup[0].message).toBe(`課題の ID が重複しています（3件）: ${I(0)}`)
    expect(dup[0].locations.map((l) => l.entityIndex)).toEqual([0, 1, 2])
  })

  it('仮説の ID 重複も指摘する（課題とは別のメッセージ）', () => {
    const h = { issueId: I(0), text: '', rationale: '', events: [], pendingNotes: [] }
    const data = make({
      issues: [{ id: I(0), parentId: null, text: 'a', events: [] }],
      hypotheses: [{ id: H(1), ...h }, { id: H(1), ...h }],
    })
    const dup = checkIssueTreeConsistency(data).filter((i) => i.rule === 'duplicate-id')
    expect(dup.map((i) => i.message)).toEqual([`仮説の ID が重複しています（2件）: ${H(1)}`])
  })

  it('循環・参照切れ・多重ルートを指摘し、未記入は配列位置で呼ぶ', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: 'issue_ZZZZZZZZZZ', text: '', events: [] },
        { id: I(2), parentId: I(3), text: '循環a', events: [] },
        { id: I(3), parentId: I(2), text: '循環b', events: [] },
      ],
    })
    const byRule = new Map(checkIssueTreeConsistency(data).map((i) => [i.rule, i.message]))
    expect(byRule.get('missing-parent')).toBe('親が見つからない課題があります（1件）: （未記入・2番目）')
    expect(byRule.get('cyclic-parent')).toBe(
      '親子関係が循環している課題があります（2件。図には表示されません）: 「循環a」、「循環b」',
    )
    expect(byRule.get('multiple-root')).toBe('ルートが2件あります（1本の木にしてください）: 「根」、（未記入・2番目）')
  })

  it('ぶら下がり先が実在しない仮説を指摘する', () => {
    const data = make({
      issues: [{ id: I(0), parentId: null, text: '根', events: [] }],
      hypotheses: [
        { id: H(1), issueId: 'issue_ZZZZZZZZZZ', text: '迷子', rationale: '', events: [], pendingNotes: [] },
      ],
    })
    const found = checkIssueTreeConsistency(data).filter((i) => i.rule === 'missing-issue')
    expect(found).toHaveLength(1)
    expect(found[0].message).toBe('ぶら下がり先の課題が見つからない仮説があります（1件）: 「迷子」')
    expect(found[0].locations).toEqual([{ entityId: H(1), entityIndex: 0, field: 'issueId' }])
  })
})
```

- [ ] **Step 2: テストが落ちることを確かめる**

Run: `npx vitest run src/modules/issue-tree/consistency.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/modules/logic-tree/consistency.ts` を写し、課題ツリー用に読み替える。**`locations` は配列位置（`entityIndex`）で指す**——ID 重複ファイルを受け入れる以上 `entityId` だけでは一意にならない。

```ts
import type { ConsistencyIssue, ConsistencyLocation } from '@/core/consistency'
import { buildTree } from '@/core/canvas/flat-tree'
import { findDuplicates } from '@/core/duplicate'
import type { Hypothesis, IssueNode, IssueTreeSchemaVersion1 } from '@/types/issue-tree'

/** 文言で指す。空のものは配列位置で呼ぶ（「（未記入）」だけだと区別できない） */
function label(text: string, index: number): string {
  return text.trim() === '' ? `（未記入・${index + 1}番目）` : `「${text}」`
}

function at(id: string, index: number, field: string): ConsistencyLocation {
  return { entityId: id, entityIndex: index, field }
}

/**
 * 課題ツリーのモジュール内検証（規約4。rev 6章の責務内訳の「モジュール内」側）。
 *
 * **仮説がどの課題にぶら下がっているかは検証しない**——中間ノードへの仮説は
 * D1 で明示的に許した形であり、指摘すると「当たりをつける」入力が
 * 制約違反として赤くなる
 */
export function checkIssueTreeConsistency(data: IssueTreeSchemaVersion1): ConsistencyIssue[] {
  const out: ConsistencyIssue[] = []
  const issues = data.issues
  const built = buildTree(issues)

  for (const [id, indices] of findDuplicates(issues, (n: IssueNode) => n.id)) {
    out.push({
      rule: 'duplicate-id',
      message: `課題の ID が重複しています（${indices.length}件）: ${id}`,
      locations: indices.map((i) => at(id, i, 'id')),
    })
  }
  for (const [id, indices] of findDuplicates(data.hypotheses, (h: Hypothesis) => h.id)) {
    out.push({
      rule: 'duplicate-id',
      message: `仮説の ID が重複しています（${indices.length}件）: ${id}`,
      locations: indices.map((i) => at(id, i, 'id')),
    })
  }

  // 循環（＝根から到達できない課題）。図に描かれないので、ここで見せないと
  // 「ファイルにあるのに画面に無い」課題が黙って生まれる
  if (built.unreachable.length > 0) {
    out.push({
      rule: 'cyclic-parent',
      message: `親子関係が循環している課題があります（${built.unreachable.length}件。図には表示されません）: ${built.unreachable
        .map((i) => label(issues[i].text, i))
        .join('、')}`,
      locations: built.unreachable.map((i) => at(issues[i].id, i, 'parentId')),
    })
  }

  // 参照切れ。ルートとして描かれるため、下の multiple-root も同時に立つ
  if (built.missingParent.length > 0) {
    out.push({
      rule: 'missing-parent',
      message: `親が見つからない課題があります（${built.missingParent.length}件）: ${built.missingParent
        .map((i) => label(issues[i].text, i))
        .join('、')}`,
      locations: built.missingParent.map((i) => at(issues[i].id, i, 'parentId')),
    })
  }

  // ルートの単一性。0件は正常な状態（新規作成直後）
  if (built.roots.length > 1) {
    out.push({
      rule: 'multiple-root',
      message: `ルートが${built.roots.length}件あります（1本の木にしてください）: ${built.roots
        .map((r) => label(issues[r.index].text, r.index))
        .join('、')}`,
      locations: built.roots.map((r) => at(issues[r.index].id, r.index, 'parentId')),
    })
  }

  // 仮説の参照切れ（「参照する側」のモジュールが持つ検証。rev 6章）
  const existing = new Set(issues.map((n) => n.id))
  const dangling = data.hypotheses
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => !existing.has(h.issueId))
  if (dangling.length > 0) {
    out.push({
      rule: 'missing-issue',
      message: `ぶら下がり先の課題が見つからない仮説があります（${dangling.length}件）: ${dangling
        .map(({ h, i }) => label(h.text, i))
        .join('、')}`,
      locations: dangling.map(({ h, i }) => at(h.id, i, 'issueId')),
    })
  }

  return out
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npx vitest run src/modules/issue-tree/consistency.test.ts`
Expected: PASS

- [ ] **Step 5: 全体の検証と Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "feat(issue-tree): モジュール内検証（規約4）の5ルールを実装する"
```

---

## Task 7: `measure.ts` と `layout.ts` ——ブロックの寸法と配置

**Files:**
- Create: `src/modules/issue-tree/measure.ts`, `src/modules/issue-tree/layout.ts`
- Create (test): `src/modules/issue-tree/layout.test.ts`

**Interfaces:**
- Consumes: `wrapWithin` / `MeasureWidth`（`@/core/canvas/wrap`）、`buildTree`（`@/core/canvas/flat-tree`）、`layoutTree` / `Size` / `Point`（`@/core/canvas/tree-layout`）、`Rect`（`@/core/canvas/viewport`）、`poseQuestions` / `suppressedIssueIds` / `EVENT_KIND_LABELS`（`./derive`）
- Produces: `measure.ts` の寸法定数と対応する Tailwind クラス、`IssuePlacement` / `HypothesisPlacement` / `IssueTreeLayout` / `layoutIssueTree(...)`

**配置の考え方（1つだけ覚えればよい）:** 課題ノードと、そこにぶら下がる仮説カードを縦に積んだものを**1つのブロック**として畳み、そのブロックのサイズをコアの `layoutTree` へ渡す。木のレイアウトそのものはロジックツリーと同じ関数がやる。

- [ ] **Step 1: `measure.ts` を書く**

```ts
/**
 * 課題ツリーの箱の寸法（DOM 非依存の定数だけ）。折り返しの規則は
 * core/canvas/wrap.ts が持つ。
 *
 * **定数と Tailwind クラスは必ず対で直すこと。** 測定が実際より小さいと、
 * ブラウザに与えられる幅が前提より狭くなり、測定より多い行数に折り返して
 * 文字が切れる（logic-tree M1 の measure.ts と同じ約束）
 */

/** 課題ノード。ロジックツリーのノードと同じ寸法（同じ役割の箱だから） */
export const ISSUE_MAX_WIDTH = 320
export const ISSUE_MIN_WIDTH = 96
export const ISSUE_PADDING_X = 10
export const ISSUE_PADDING_Y = 6
export const ISSUE_BORDER = 1
export const ISSUE_INSET_X = ISSUE_PADDING_X + ISSUE_BORDER
export const ISSUE_INSET_Y = ISSUE_PADDING_Y + ISSUE_BORDER
/** px-2.5 = 10px ／ py-1.5 = 6px ／ border = 1px */
export const ISSUE_BOX_CLASS = 'border px-2.5 py-1.5'

/**
 * 仮説カード。**幅は導出しない（固定）。**
 *
 * カードの中には文言・由来・メモ・イベントの根拠という**性質の違う文章が
 * 縦に積まれる**ので、一番長い行に幅を合わせると、短い仮説と長い仮説で
 * カード幅がばらつき、木が階段状に見える。シーケンスがガター幅を導出しない
 * と決めた（design-notes 論点7）のと同じ判断
 */
export const CARD_WIDTH = 320
export const CARD_PADDING_X = 10
export const CARD_PADDING_Y = 6
export const CARD_BORDER = 1
export const CARD_INSET_X = CARD_PADDING_X + CARD_BORDER
export const CARD_INSET_Y = CARD_PADDING_Y + CARD_BORDER
export const CARD_BOX_CLASS = 'border px-2.5 py-1.5'

/** カードを課題ノードの下へずらす量（「この課題に属する」ことを字下げで見せる） */
export const CARD_INDENT = 16
/** 課題ノードとカード、カードどうしの空き */
export const CARD_GAP = 6
/** カードの中の行どうしの空き */
export const ROW_GAP = 4
/** メモ行・イベントの根拠行の字下げ */
export const ROW_INDENT = 8
/** 問いバッジ・イベント種別ラベルの行の高さ（どちらも1行で固定） */
export const BADGE_HEIGHT = 20

/** カードの中の文章が使える幅 */
export const CARD_CONTENT_WIDTH = CARD_WIDTH - CARD_INSET_X * 2
```

- [ ] **Step 2: 失敗するテストを書く**

**期待値は丸めの境界に置かないこと**（M8 Task 1 の教訓）。概算器は ASCII を半分幅に数えるので、和文だけの入力にして境界を避ける。

```ts
import { describe, expect, it } from 'vitest'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'
import { poseQuestions } from './derive'
import { CARD_INDENT, CARD_WIDTH } from './measure'
import { layoutIssueTree } from './layout'

const I = (n: number): string => `issue_${String(n).padStart(10, 'A')}`
const H = (n: number): string => `hypothesis_${String(n).padStart(10, 'A')}`

const fonts = { body: { measure: createEstimateMeasurer(14), lineHeight: 23 }, small: { measure: createEstimateMeasurer(12), lineHeight: 18 } }

function run(data: IssueTreeSchemaVersion1) {
  return layoutIssueTree(data, poseQuestions(data), fonts)
}

function make(over: Partial<IssueTreeSchemaVersion1>): IssueTreeSchemaVersion1 {
  return { schemaVersion: 1, type: 'issueTree', title: 'T', issues: [], hypotheses: [], ...over }
}

describe('layoutIssueTree', () => {
  it('同じ入力からは同じ出力が出る（図は導出。前回の位置を混ぜない）', () => {
    const data = make({ issues: [{ id: I(0), parentId: null, text: '根', events: [] }] })
    expect(run(data)).toEqual(run(data))
  })

  it('仮説カードは課題ノードの下に字下げして積まれる', () => {
    const data = make({
      issues: [{ id: I(0), parentId: null, text: '結果取得を画面遷移の中で待てるか', events: [] }],
      hypotheses: [
        { id: H(1), issueId: I(0), text: '同期取得で間に合う', rationale: '', events: [], pendingNotes: [] },
        { id: H(2), issueId: I(0), text: 'webhook受信に切り替える', rationale: '', events: [], pendingNotes: [] },
      ],
    })
    const out = run(data)
    const node = out.issues[0]!.rect
    const [a, b] = [out.hypotheses[0]!.rect, out.hypotheses[1]!.rect]
    expect(a.x).toBe(node.x + CARD_INDENT)
    expect(a.width).toBe(CARD_WIDTH)
    expect(a.y).toBeGreaterThan(node.y + node.height - 1)
    expect(b.y).toBeGreaterThan(a.y + a.height - 1)
  })

  it('問いが立っている仮説にだけバッジの場所が確保される', () => {
    const data = make({
      issues: [{ id: I(0), parentId: null, text: '根', events: [] }],
      hypotheses: [
        { id: H(1), issueId: I(0), text: '未決の仮説', rationale: '', events: [], pendingNotes: [] },
        { id: H(2), issueId: I(0), text: '決着した仮説', rationale: '', events: [{ kind: 'supported', note: '' }], pendingNotes: [] },
      ],
    })
    const out = run(data)
    expect(out.hypotheses[0]!.badge).not.toBe(null)
    expect(out.hypotheses[1]!.badge).toBe(null)
  })

  it('イベントは種類ラベルの行と根拠の行を持つ', () => {
    const data = make({
      issues: [{ id: I(0), parentId: null, text: '根', events: [] }],
      hypotheses: [
        {
          id: H(1),
          issueId: I(0),
          text: '仮説',
          rationale: '',
          events: [{ kind: 'rejected', note: '制限は日次でなく分単位窓と判明。夜間に寄せても超過する' }],
          pendingNotes: [],
        },
      ],
    })
    const card = run(data).hypotheses[0]!
    expect(card.events).toHaveLength(1)
    expect(card.events[0].note.y).toBeGreaterThan(card.events[0].label.y)
    // 根拠は字下げされる
    expect(card.events[0].note.x).toBeGreaterThan(card.rect.x)
  })

  it('子の課題は親より右の列に置かれ、親のブロックとは重ならない', () => {
    // **兄弟3つ・深さ2にする**——兄弟2つ・深さ1では「常に先頭」「常に末尾」
    // のような別実装でも同じ座標になりうる
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: I(0), text: '子A', events: [] },
        { id: I(2), parentId: I(1), text: '孫', events: [] },
        { id: I(3), parentId: I(0), text: '子B', events: [] },
        { id: I(4), parentId: I(0), text: '子C', events: [] },
      ],
    })
    const out = run(data)
    const [root, a, g, b, c] = out.issues.map((p) => p!.rect)
    expect(a.x).toBeGreaterThan(root.x)
    expect(g.x).toBeGreaterThan(a.x)
    expect(b.y).toBeGreaterThan(a.y)
    expect(c.y).toBeGreaterThan(b.y)
  })

  it('循環して根から到達できない課題は位置を持たない（図に描かれない）', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '根', events: [] },
        { id: I(1), parentId: I(2), text: 'a', events: [] },
        { id: I(2), parentId: I(1), text: 'b', events: [] },
      ],
    })
    const out = run(data)
    expect(out.issues[0]).not.toBe(null)
    expect(out.issues[1]).toBe(null)
    expect(out.issues[2]).toBe(null)
  })

  it('見送りイベントは課題ノードの直下に行を持ち、抑制された子には説明の行が出る', () => {
    const data = make({
      issues: [
        { id: I(0), parentId: null, text: '再受検の扱い', events: [{ kind: 'deferred', note: '初回受検フローの成立が先' }] },
        { id: I(1), parentId: I(0), text: '受検IDの再発行が要るか', events: [] },
      ],
    })
    const out = run(data)
    expect(out.issues[0]!.deferrals).toHaveLength(1)
    expect(out.issues[0]!.suppressedNote).toBe(null) // 自分が見送りを持つ側には出さない
    expect(out.issues[1]!.deferrals).toEqual([])
    expect(out.issues[1]!.suppressedNote).not.toBe(null)
  })
})
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `npx vitest run src/modules/issue-tree/layout.test.ts`
Expected: FAIL

- [ ] **Step 4: `layout.ts` を実装する**

```ts
import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import { layoutTree, type Size } from '@/core/canvas/tree-layout'
import type { Rect } from '@/core/canvas/viewport'
import { wrapWithin, type MeasureWidth } from '@/core/canvas/wrap'
import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'
import { SUPPRESSED_NOTE, suppressedIssueIds, type PosedQuestions } from './derive'
import {
  BADGE_HEIGHT,
  CARD_CONTENT_WIDTH,
  CARD_GAP,
  CARD_INDENT,
  CARD_INSET_X,
  CARD_INSET_Y,
  CARD_WIDTH,
  ISSUE_INSET_X,
  ISSUE_INSET_Y,
  ISSUE_MAX_WIDTH,
  ISSUE_MIN_WIDTH,
  ROW_GAP,
  ROW_INDENT,
} from './measure'

/** 本文（text-sm）と小さい文字（text-xs）の測定器。エディタが DOM から作る */
export interface IssueTreeFonts {
  body: { measure: MeasureWidth; lineHeight: number }
  small: { measure: MeasureWidth; lineHeight: number }
}

export interface IssuePlacement {
  /** 課題ノードの矩形（世界座標） */
  rect: Rect
  /** 見送りイベントの行（世界座標。読み取り専用の表示） */
  deferrals: Rect[]
  /** 「祖先の見送りにより問いは立たない」の1行。抑制されていなければ null */
  suppressedNote: Rect | null
}

export interface HypothesisPlacement {
  /** カードの外枠 */
  rect: Rect
  text: Rect
  /** 立っている問いのバッジ。立っていなければ null */
  badge: Rect | null
  rationale: Rect
  notes: Rect[]
  events: { label: Rect; note: Rect }[]
}

export interface IssueTreeLayout {
  /** issues と同じ添字。循環して根から到達できないものは null */
  issues: (IssuePlacement | null)[]
  /** hypotheses と同じ添字。ぶら下がり先が図に無いものは null */
  hypotheses: (HypothesisPlacement | null)[]
  width: number
  height: number
}

/** カード内の1行を測る（余白はカードが1度だけ持つので、ここでは 0） */
function rowHeight(text: string, font: { measure: MeasureWidth; lineHeight: number }, width: number): number {
  return wrapWithin(text, font.measure, font.lineHeight, {
    maxWidth: width,
    minWidth: 0,
    insetX: 0,
    insetY: 0,
  }).height
}

/**
 * 課題ツリーのレイアウト（**完全な純関数**）。
 *
 * 課題ノードと、そこにぶら下がる仮説カードを縦に積んだものを1つのブロックと
 * して畳み、ブロックのサイズをコアの `layoutTree` へ渡す。木の畳み方
 *（親を最初の子と最後の子の中心に置く／兄弟の衝突を全深さで見る）は
 * ロジックツリーと同じ関数がやる。
 *
 * **ここに「前回どこにあったか」の状態を混ぜないこと**——同じデータから
 * 違う図が出るようになった時点で「図は導出」（rev 3章）が崩れる
 */
export function layoutIssueTree(
  data: IssueTreeSchemaVersion1,
  posed: PosedQuestions,
  fonts: IssueTreeFonts,
): IssueTreeLayout {
  const suppressed = suppressedIssueIds(data.issues)

  // --- 1. 仮説カードの中身を測る（課題ごとにまとめる） ---
  interface CardPlan { height: number; build: (x: number, y: number) => HypothesisPlacement }
  const plans: (CardPlan | null)[] = data.hypotheses.map((h, hi) => {
    const q = posed.hypothesisQuestions[hi]
    const hasBadge = q.result || q.judgement
    const textH = rowHeight(h.text, fonts.body, CARD_CONTENT_WIDTH)
    const rationaleH = rowHeight(h.rationale, fonts.small, CARD_CONTENT_WIDTH)
    const noteHs = h.pendingNotes.map((n) => rowHeight(n, fonts.small, CARD_CONTENT_WIDTH - ROW_INDENT))
    const eventHs = h.events.map((e) => rowHeight(e.note, fonts.small, CARD_CONTENT_WIDTH - ROW_INDENT))
    let height = CARD_INSET_Y * 2 + textH
    if (hasBadge) height += ROW_GAP + BADGE_HEIGHT
    height += ROW_GAP + rationaleH
    for (const nh of noteHs) height += ROW_GAP + nh
    for (const eh of eventHs) height += ROW_GAP + BADGE_HEIGHT + ROW_GAP + eh
    return {
      height,
      build: (x, y) => {
        let cursor = y + CARD_INSET_Y
        const left = x + CARD_INSET_X
        const text: Rect = { x: left, y: cursor, width: CARD_CONTENT_WIDTH, height: textH }
        cursor += textH
        let badge: Rect | null = null
        if (hasBadge) {
          cursor += ROW_GAP
          badge = { x: left, y: cursor, width: CARD_CONTENT_WIDTH, height: BADGE_HEIGHT }
          cursor += BADGE_HEIGHT
        }
        cursor += ROW_GAP
        const rationale: Rect = { x: left, y: cursor, width: CARD_CONTENT_WIDTH, height: rationaleH }
        cursor += rationaleH
        const notes = noteHs.map((nh) => {
          cursor += ROW_GAP
          const r: Rect = { x: left + ROW_INDENT, y: cursor, width: CARD_CONTENT_WIDTH - ROW_INDENT, height: nh }
          cursor += nh
          return r
        })
        const events = eventHs.map((eh) => {
          cursor += ROW_GAP
          const labelRect: Rect = { x: left, y: cursor, width: CARD_CONTENT_WIDTH, height: BADGE_HEIGHT }
          cursor += BADGE_HEIGHT + ROW_GAP
          const noteRect: Rect = { x: left + ROW_INDENT, y: cursor, width: CARD_CONTENT_WIDTH - ROW_INDENT, height: eh }
          cursor += eh
          return { label: labelRect, note: noteRect }
        })
        return { rect: { x, y, width: CARD_WIDTH, height }, text, badge, rationale, notes, events }
      },
    }
  })

  const cardsOf = new Map<string, number[]>()
  data.hypotheses.forEach((h, i) => {
    cardsOf.set(h.issueId, [...(cardsOf.get(h.issueId) ?? []), i])
  })

  // --- 2. 課題ノードとブロックの寸法を測る ---
  const built = buildTree(data.issues)
  const nodeSizes: Size[] = data.issues.map((node) => {
    const w = wrapWithin(node.text, fonts.body.measure, fonts.body.lineHeight, {
      maxWidth: ISSUE_MAX_WIDTH,
      minWidth: ISSUE_MIN_WIDTH,
      insetX: ISSUE_INSET_X,
      insetY: ISSUE_INSET_Y,
    })
    return { width: w.width, height: w.height }
  })
  const deferralHs: number[][] = data.issues.map((node) =>
    node.events.map((e) => BADGE_HEIGHT + ROW_GAP + rowHeight(e.note, fonts.small, CARD_WIDTH - ROW_INDENT)),
  )
  const suppressedNoteH: (number | null)[] = data.issues.map((node) =>
    suppressed.has(node.id) && node.events.length === 0
      ? rowHeight(SUPPRESSED_NOTE, fonts.small, CARD_WIDTH)
      : null,
  )

  const blockSizes = new Map<string, Size>()
  const blockSizeOf = (index: number): Size => {
    let height = nodeSizes[index].height
    for (const dh of deferralHs[index]) height += ROW_GAP + dh
    const note = suppressedNoteH[index]
    if (note !== null) height += ROW_GAP + note
    let width = nodeSizes[index].width
    const cards = cardsOf.get(data.issues[index].id) ?? []
    for (const ci of cards) {
      const plan = plans[ci]
      if (plan === null) continue
      height += CARD_GAP + plan.height
      width = Math.max(width, CARD_INDENT + CARD_WIDTH)
    }
    if (deferralHs[index].length > 0 || note !== null) width = Math.max(width, CARD_WIDTH)
    return { width, height }
  }
  const walkSizes = (node: FlatTreeNode): void => {
    blockSizes.set(node.key, blockSizeOf(node.index))
    for (const child of node.children) walkSizes(child)
  }
  for (const root of built.roots) walkSizes(root)

  // --- 3. コアの木レイアウトへ渡す ---
  const { positions, width, height } = layoutTree(built.roots, blockSizes)

  // --- 4. 世界座標へ展開する ---
  const issues: (IssuePlacement | null)[] = data.issues.map(() => null)
  const hypotheses: (HypothesisPlacement | null)[] = data.hypotheses.map(() => null)
  const walkPlace = (node: FlatTreeNode): void => {
    const point = positions.get(node.key)
    if (point !== undefined) {
      const i = node.index
      let cursor = point.y + nodeSizes[i].height
      const deferrals = deferralHs[i].map((dh) => {
        cursor += ROW_GAP
        const r: Rect = { x: point.x + ROW_INDENT, y: cursor, width: CARD_WIDTH - ROW_INDENT, height: dh }
        cursor += dh
        return r
      })
      const noteH = suppressedNoteH[i]
      let suppressedNote: Rect | null = null
      if (noteH !== null) {
        cursor += ROW_GAP
        suppressedNote = { x: point.x, y: cursor, width: CARD_WIDTH, height: noteH }
        cursor += noteH
      }
      issues[i] = {
        rect: { x: point.x, y: point.y, width: nodeSizes[i].width, height: nodeSizes[i].height },
        deferrals,
        suppressedNote,
      }
      for (const ci of cardsOf.get(data.issues[i].id) ?? []) {
        const plan = plans[ci]
        if (plan === null) continue
        cursor += CARD_GAP
        hypotheses[ci] = plan.build(point.x + CARD_INDENT, cursor)
        cursor += plan.height
      }
    }
    for (const child of node.children) walkPlace(child)
  }
  for (const root of built.roots) walkPlace(root)

  return { issues, hypotheses, width, height }
}
```

**import に `FlatTreeNode`（型）と `SUPPRESSED_NOTE` を足すこと**——上の断片は本文の説明に集中しており、import 行を省いてある。文言の正は `derive.ts` の1箇所であり、`'祖先の見送りにより…'` をここで打ち直さない。

- [ ] **Step 5: テストが通ることを確かめる**

Run: `npx vitest run src/modules/issue-tree/layout.test.ts`
Expected: PASS

- [ ] **Step 6: 「壊したら落ちるか」を確かめる**

`blockSizeOf` の中でカードの高さを足している行（`height += CARD_GAP + plan.height`）を一時的に消し、`npx vitest run src/modules/issue-tree/layout.test.ts` が**落ちること**を確認してから戻す。落ちないなら、兄弟のブロックが重ならないことを見ているテストが退化している。

- [ ] **Step 7: 全体の検証と Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "feat(issue-tree): 課題ノードと仮説カードをブロックとして畳むレイアウトを実装する"
```

---

## Task 8: 部品（課題ノード・仮説カード・エッジ）

**Files:**
- Create: `src/modules/issue-tree/IssueBox.tsx`, `src/modules/issue-tree/HypothesisCard.tsx`, `src/modules/issue-tree/IssueTreeEdges.tsx`
- Create (test): `src/modules/issue-tree/HypothesisCard.dom.test.tsx`

**Interfaces:**
- Consumes: `CellInput` / `FieldState`（`@/components/CellInput`）、`edgePath`（`@/core/canvas/edges`）、`svgTransform` / `Transform`（`@/core/canvas/viewport`）、`EVENT_KIND_LABELS` / `QUESTION_LABELS` / `SUPPRESSED_NOTE`（`./derive`）、`IssuePlacement` / `HypothesisPlacement`（`./layout`）
- Produces: `IssueBox` / `HypothesisCard` / `IssueTreeEdges` の3コンポーネント

**面の決め方（この3種類しかない。`palette.test.ts` が走査する）:**

```tsx
// **面と枠のクラスは片方だけ出す。** bg-surface と bg-warning/10 を両方
// 並べても、勝つのは生成 CSS の順序であってクラス名の順序ではない（M8）
const errorCell = 'bg-warning/20'   // 整合性検証の赤（entityIndex が指す欄）
const warnCell = 'bg-warning/10'    // 立っている問い（未決）
// 抑制された配下は「作業する面ではない」ことを地の色で見せる。
// **opacity で薄くしない**——文字のコントラストが検算した値を割る
const face = props.invalid
  ? `border-warning ${errorCell} text-ink`
  : props.suppressed
    ? 'border-rule bg-canvas text-ink-muted'
    : props.warn
      ? `border-warning ${warnCell} text-ink`
      : 'border-rule bg-surface text-ink'
```

- [ ] **Step 1: `IssueBox.tsx` を書く**

`src/modules/logic-tree/NodeBox.tsx` と同じ模型（入力欄は常に `textarea`、フォーカスされている＝編集中）。差分は3つ:

1. 上の3種類＋通常の面
2. 立っている問いのバッジ（`QUESTION_LABELS.hypothesis`）を、**枠の外の右**ではなく `aria-label` と面で表す——キャンバス上の絶対配置なので、バッジを枠外に出すと測定した矩形と描画がずれる。**問いはノードの面（`warnCell`）とプレースホルダで見せ、文言はスクリーンリーダ向けに `aria-describedby` ではなく `aria-label` の後半へ入れる**
3. 見送りのドロップダウンを開くボタン（`aria-label="{文言} の見送り"`）。**開閉の状態は親（エディタ）が持つ**——同時に1つのドロップダウンしか開かない制御コンポーネントにする（rev 10章 境界規則の例外。sequence M3 で確定した形）

```tsx
export interface IssueBoxProps {
  nodeKey: string
  /** ノードの文言。空なら「（未記入）」を含む名前になる */
  label: string
  text: string
  rect: { x: number; y: number; width: number; height: number }
  invalid: boolean
  suppressed: boolean
  /** 「仮説は？」が立っているか */
  warn: boolean
  onTextChange: (next: string) => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState) => void
  /** 見送りのドロップダウン。エディタが menuPropsFor で組んで渡す */
  deferralMenu: React.ReactNode
}
```

**`aria-label` は `課題{N}` を接頭に付ける**（`src/modules/logic-tree/LogicTreeEditor.tsx` の `ノード{N}` に倣う）。既存テストの前方一致クエリと衝突しないことを確かめる:

```bash
grep -rn "getByLabelText(/\^課題" src/
```
Expected: 一致0件

- [ ] **Step 2: `HypothesisCard.tsx` を書く**

レイアウトが返した `HypothesisPlacement` の各矩形へ、そのまま絶対配置で置く。**カード自身は測定の結果を CSS で当てるだけで、寸法を再計算しない**（`autoSize={false}`）。

| 行 | 中身 | アクセシブル名 |
| --- | --- | --- |
| `text` | `CellInput`（`multiline`、`text-sm`） | `仮説{N}` |
| `badge` | 立っている問いの文言（`QUESTION_LABELS.result` / `.judgement`。両方立つときは中黒で連結）。**読み取り専用の表示** | —（`aria-hidden` にしない。カードの面が未決を運ぶ） |
| `rationale` | `CellInput`（`text-xs`、プレースホルダ `由来（任意）`） | `仮説{N} の由来` |
| `notes[i]` | `CellInput`（`text-xs`）＋「根拠へ」ボタン | `仮説{N} のメモ{i+1}` ／ ボタンは `仮説{N} のメモ{i+1} を根拠へ移す` |
| `events[j].label` | `EVENT_KIND_LABELS[kind]` の静的テキスト | — |
| `events[j].note` | **最新イベントだけ `CellInput`。過去は静的テキスト**（追記専用の列だから） | `仮説{N} の{ラベル}の根拠` |

**「根拠へ」ボタンは、イベントが1件以上あるときだけ出す**（0件では移動先が無く、押しても何も起きないボタンになる）。

**プレースホルダに warning 系の文字色を使わない**（M8 決定12）。未決の面は `warnCell`、文字は `text-ink-muted`。

- [ ] **Step 3: 仮説カードの DOM テストを書く**

「壊れても画面は一見正常」な回帰に絞る。

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'   // 既存の dom テストが使っている流儀に合わせる
import { describe, expect, it, vi } from 'vitest'
```

見るのは次の3点:

1. **過去のイベントの根拠が編集できない**——イベント2件のカードを描き、1件目の根拠が `textbox` として引けず（静的テキスト）、2件目だけが引けること。**これが壊れると「追記専用」がデータの上でだけの約束になり、画面からは静かに破れる**
2. **メモが0件のイベントでは「根拠へ」ボタンが出ない**——押しても何も起きないボタンを作らないため
3. **未決のバッジ文言が `derive.ts` の `QUESTION_LABELS` と逐語で一致する**——直書きすると Skill 側の報告と食い違う（`QUESTION_LABELS.result` を import して期待値にする。**文字列リテラルを再度打たないこと**）

Run: `npx vitest run src/modules/issue-tree/HypothesisCard.dom.test.tsx`
Expected: PASS

- [ ] **Step 4: `IssueTreeEdges.tsx` を書く**

`src/modules/logic-tree/TreeEdges.tsx` と同じ構造（`pointer-events-none` の SVG に、ノードのレイヤと**同一の** transform を当てる）。差分は、**線を課題ノードの矩形から引く**ことと、抑制された枝の線を落とすこと:

```tsx
{edges.map((edge) => (
  <path
    key={edge.key}
    d={edge.d}
    className={edge.suppressed ? 'fill-none stroke-grid' : 'fill-none stroke-rule'}
    strokeWidth={1}
  />
))}
```

`stroke-grid` は装飾扱いの薄い罫線トークン（`--grid`）。**`stroke-rule` を半透明にしない**——`border-*/NN` と同じく検算していない濃さになる。

- [ ] **Step 5: 全体の検証と Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "feat(issue-tree): 課題ノード・仮説カード・エッジの部品を実装する"
```

---

## Task 9: `IssueTreeEditor.tsx` ——エディタ本体

**Files:**
- Create: `src/modules/issue-tree/IssueTreeEditor.tsx`
- Create (test): `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`

**Interfaces:**
- Consumes: Task 4〜8 のすべて、`EditorProps`（`@/core/registry`）、`useViewport`（`@/core/canvas/use-viewport`）、`readCanvasFont` / `createCanvasMeasurer` / `FALLBACK_CANVAS_FONT` / `FALLBACK_SMALL_FONT` / `sameFont`（`@/core/canvas/canvas-font`）、`resolveCommand` / `toKeyEventLike`（`@/core/keyboard/keymap`）、`computeRowKeys`（`@/core/row-keys`）、`KeyHints`（`@/components/KeyHints`）
- Produces: `IssueTreeEditor`（規約3のエディタ）

**土台は `src/modules/logic-tree/LogicTreeEditor.tsx` である。** フォントの世代管理（`document.fonts.ready` で測り直す）・測定器のキャッシュ（鍵に `lineHeight` と世代を混ぜる）・`pendingFocus` の予約と `focus({ preventScroll: true })`・3レイヤの transform・測定用の見本要素は、**そのまま写して2種類のフォント（`text-sm` / `text-xs`）に増やすだけ**にする。書き直すとロジックツリーが踏んだ欠陥を踏み直す。

- [ ] **Step 1: 骨格を書く（フォント・測定・レイアウト・描画）**

見本要素は2つ置く（`text-sm` と `text-xs`）。**描画されるセルと同じフォントのクラスを持たせること**——測定と描画が同一の情報源を見る（rev 9章）。

```tsx
/** カード・ノードの文言に当たるクラスのうち、フォントを決めている部分 */
const BODY_FONT_CLASS = 'text-sm'
/** 由来・メモ・イベントの根拠に当たるクラス */
const SMALL_FONT_CLASS = 'text-xs'

/** 木の操作ヒント。`$mod` / `$alt` は KeyHints が解決する */
const ISSUE_TREE_HINTS: readonly KeyHint[] = [
  { keys: 'Enter', label: '兄弟を追加' },
  { keys: 'Tab', label: '子課題を追加' },
  { keys: '$mod+Enter', label: '仮説／判断を追加' },
  { keys: '←→', label: '親子移動' },
  { keys: '$alt+↑↓', label: '並び替え' },
]
```

**`KeyHints` の `key` は `hint.keys` 文字列である**（`src/components/KeyHints.tsx`）。上の5件は互いに重複していないので衝突しない——**足すときは既存の表記と重ならないことを確かめる**（[`docs/open-issues.md`](../../open-issues.md) に記録のある既知の穴）。

- [ ] **Step 2: セルの鍵とフォーカス予約を実装する**

```tsx
/**
 * DOM 上のセルの識別子。**`FocusTarget` と1対1に対応させる。**
 * 課題と仮説で配列が分かれているので、ロジックツリーのように
 * `computeRowKeys` 1本では足りない
 */
function cellKey(target: FocusTarget, issueKeys: string[], hypothesisKeys: string[]): string {
  switch (target.cell) {
    case 'issue':
      return `issue:${issueKeys[target.index]}`
    case 'hypothesis':
      return `hyp:${hypothesisKeys[target.index]}`
    case 'rationale':
      return `rationale:${hypothesisKeys[target.index]}`
    case 'note':
      return `note:${hypothesisKeys[target.index]}:${target.noteIndex}`
    case 'event':
      return `event:${hypothesisKeys[target.index]}:${target.eventIndex}`
  }
}
```

`apply(result)` は logic-tree と同形（構造操作は `mergeKey` に `null` を渡す＝1操作1コミット）。**予約したフォーカスは `data-cell` で引き、`focus({ preventScroll: true })` で当ててから `ensureVisible` を呼ぶ**——画面外の要素に focus するとブラウザが祖先の `scrollLeft/scrollTop` を動かし、`panIntoView` はそれを勘定に入れていない（二重に動いて以後ずれ続ける）。

- [ ] **Step 3: 操作言語の写像を実装する**

```tsx
/**
 * コマンドを構造へ写像する。戻り値 true＝消費した（既定動作を止める）。
 *
 * **キーの判定はコアの `resolveCommand` が済ませている。** ここで
 * `e.key` を見ないこと（rev 10章 実装規約）
 */
const runIssueCommand = (cmd: Command, index: number): boolean => {
  switch (cmd) {
    case 'insert-item-after': apply(addSiblingIssueAfter(data, index)); return true
    case 'insert-child': apply(addChildIssue(data, index)); return true
    case 'delete-item': apply(deleteIssueSubtree(data, index)); return true
    case 'move-item-up': apply(moveIssueSibling(data, index, -1)); return true
    case 'move-item-down': apply(moveIssueSibling(data, index, 1)); return true
    case 'focus-prev': return focusIssueSibling(index, -1)
    case 'focus-next': return focusIssueSibling(index, 1)
    case 'focus-parent': return focusIssueAt(built.parents[index])
    case 'focus-child': return focusIssueAt(built.children[index]?.[0])
    // **主修飾キー＋Enter を「そのセルの主たる副操作」に写像する**（rev 10章
    // 「意味の解決はコアのまま、写像だけツール側」。sequence M2 と同じ層の適用）。
    // 課題セルでは仮説の追加——発散フェーズで最も打鍵数が多い操作であり、
    // `Tab`（子課題）と `Enter`（兄弟課題）は家族標準に押さえられている
    case 'toggle-item-state': apply(addHypothesis(data, index)); return true
    case 'cancel': (document.activeElement as HTMLElement | null)?.blur(); return true
    default: return false   // undo / redo は額縁のグローバル層が取る
  }
}
```

仮説側の写像:

| セル | `insert-item-after`（Enter） | `delete-item`（空欄 Backspace） | `move-item-up/down`（Alt+↑↓） | `toggle-item-state`（$mod+Enter） |
| --- | --- | --- | --- | --- |
| 仮説の文言 | 同じ課題に仮説を追加 | 仮説を削除 | 同じ課題の中で並び替え | **判断イベントのドロップダウンを開く** |
| 由来 | メモを1件足す（移動先が無ければ生やす。sequence M2 の前例） | — | — | — |
| メモ | 次のメモを足す | そのメモを削除 | メモの並び替え | **最新イベントの根拠へ移す**（イベント0件なら何もしない） |
| イベントの根拠 | — | — | — | — |

**`KeyContext` は仮説側では `hierarchical: false`（「子」という意味が無い）／`deletableField` は「その欄が空になったら要素ごと消してよいか」で決める**——由来とイベントの根拠は `false`（空にしただけで仮説やイベントが消えると、書き直しのたびに消える）。

- [ ] **Step 4: ドロップダウンを制御コンポーネントとして組む**

`src/modules/sequence/SequenceEditor.tsx` の `openCell: string | null` と `menuPropsFor` を**実物から写す**。**同時に1つしか開かない**こと、および**キャンバスのズーム・パンは止めない**ことが要件（rev 10章 境界規則の例外。止めていた頃の実害は「複数開いたまま1つ閉じるとキャンバスが復活する」だった）。

- 仮説セルのメニュー: `EVENT_KIND_LABELS` の6項目。選ぶと `appendJudgement(data, i, kind)`
- 課題ノードのメニュー: `deferred` / `deferredToMainDev` の2項目。選ぶと `appendDeferral(data, i, kind)`

**メニューの項目名は `EVENT_KIND_LABELS` から引く。文字列を打ち直さない。**

- [ ] **Step 5: 帯（未決の集計）を出す**

```tsx
<div className="pointer-events-none whitespace-nowrap text-sm text-ink-muted">
  {tallyLine(tallyQuestions(posed))}
</div>
```

**`whitespace-nowrap` を外さないこと**（`SequenceEditor.tsx` が同じ理由で付けている——折り返すと帯の高さが変わり、下の図に重なる）。帯には「ノードを追加」「仮説を追加」のボタンも常設する（**マウスだけで操作する人に構造を増やす手段を残す**。rev 10章「キーでしか到達できない意味を残さない」の裏返し）。**指摘の一覧はここに置かない**（額縁の `IssueBanner` が出す。rev 6章）。

- [ ] **Step 6: DOM テストを書く**

「壊れても画面は一見正常」な回帰に絞る。少なくとも次を見る:

1. **`Tab` が子課題を、`Enter` が兄弟課題を作る**——期待値が一致しない配置を選ぶ（葉の直後で足すと両者が同じ配列位置・同じラベルになり、差し替えても緑のままになる。logic-tree M1 が実際に踏んだ形）。**子を持つ中間ノードの上で押すこと**
2. **主修飾キー＋`Enter` が課題セルでは仮説を、仮説セルではドロップダウンを開く**——写像が入れ替わっても画面は一見正常なので、ここでしか捕まらない
3. **IME 変換確定の `Enter` で課題が増えない**——`keyCode: 229` を伴う `keydown` を送り、`onChange` が呼ばれないこと。**「呼ばれていないこと」だけを見ない**（手前で例外が飛んでも緑になる）ので、続けて素の `Enter` を送って**増えること**まで見る
4. **祖先を見送りにすると、配下の問いのバッジが画面から消える**——`derive.ts` の抑制が描画まで繋がっていることを見る唯一の窓
5. **未決の集計が `tallyLine` と一致する**——文字列を打ち直さず `tallyLine(...)` を期待値にする

Run: `npx vitest run src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`
Expected: PASS

- [ ] **Step 7: 全体の検証と Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "feat(issue-tree): キーボードで打ち切れる課題ツリーエディタを実装する"
```

---

## Task 10: `module.ts` とレジストリ登録（ツールモジュール規約）

**Files:**
- Create: `src/modules/issue-tree/module.ts`, `src/modules/issue-tree/migrate.ts`
- Create (test): `src/modules/issue-tree/module.test.ts`
- Modify: `src/modules/index.ts`

**Interfaces:**
- Consumes: Task 3〜9 のすべて、`ToolModule`（`@/core/registry`）
- Produces: `issueTreeModule` / `migrateIssueTree`

- [ ] **Step 1: `migrate.ts` を書く**

```ts
import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'

/**
 * 規約6: マイグレータ。schemaVersion 1 が初版のため旧版が存在せず、
 * 恒等変換の枠だけを置く。schemaVersion 2 が生まれた時点で最初の変換を実装する
 */
export function migrateIssueTree(data: unknown, _fromVersion: number): IssueTreeSchemaVersion1 {
  return data as IssueTreeSchemaVersion1
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/modules/logic-tree/module.test.ts` と同じ形。

```ts
import { describe, expect, it } from 'vitest'
import { serialize } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import { appRegistry } from '@/modules'
import { issueTreeModule } from './module'

const validate = createSchemaValidator(issueTreeModule.schema)

describe('issueTreeModule', () => {
  it('規約1・単一性・ID プレフィクスを宣言している', () => {
    expect(issueTreeModule.type).toBe('issueTree')
    expect(issueTreeModule.displayName).toBe('課題ツリー')
    expect(issueTreeModule.schemaVersion).toBe(1)
    expect([...issueTreeModule.idPrefixes]).toEqual(['issue', 'hypothesis'])
    // PoC のテーマごとに1本作るのが普通の使い方。ハブではない
    expect(issueTreeModule.singleton).toBe(false)
  })

  it('createEmpty はルート課題1件で作り、スキーマ検証と整合性検証を通る', () => {
    const empty = issueTreeModule.createEmpty('課題ツリー')
    expect(empty.issues).toHaveLength(1)
    expect(empty.issues[0].parentId).toBe(null)
    expect(empty.issues[0].text).toBe('')
    expect(empty.issues[0].events).toEqual([])
    expect(empty.hypotheses).toEqual([])
    expect(validate(empty).ok).toBe(true)
    expect(issueTreeModule.checkConsistency(empty)).toEqual([])
  })

  it('createEmpty は正規形で書ける（キー順はスキーマの properties 記載順）', () => {
    const empty = issueTreeModule.createEmpty('課題ツリー')
    expect(serialize(empty, issueTreeModule.schema)).toBe(
      `{\n  "schemaVersion": 1,\n  "type": "issueTree",\n  "title": "課題ツリー",\n  "issues": [\n    {\n      "id": "${empty.issues[0].id}",\n      "parentId": null,\n      "text": "",\n      "events": []\n    }\n  ],\n  "hypotheses": []\n}\n`,
    )
  })

  it('マイグレータは恒等（初版なので旧版が存在しない）', () => {
    const data = issueTreeModule.createEmpty('T')
    expect(issueTreeModule.migrate(data, 1)).toBe(data)
  })

  it('整合性検証が繋がっている（多重ルートを指摘する）', () => {
    const issues = issueTreeModule.checkConsistency({
      schemaVersion: 1,
      type: 'issueTree',
      title: 'T',
      issues: [
        { id: 'issue_AAAAAAAAAA', parentId: null, text: 'a', events: [] },
        { id: 'issue_BBBBBBBBBB', parentId: null, text: 'b', events: [] },
      ],
      hypotheses: [],
    })
    expect(issues.map((i) => i.rule)).toContain('multiple-root')
  })
})

describe('出力プロファイル（規約5）', () => {
  it('0本を宣言している（Markdown 出力は観察後に判断する＝設計ノートの OUT）', () => {
    // 0本は「出力を作っていないツール」の状態として正しい。額縁の ExportMenu は
    // outputs[0] が undefined のとき両ボタンを disabled にする
    expect(issueTreeModule.outputs).toEqual([])
  })
})

describe('レジストリ登録', () => {
  it('appRegistry から type で引ける（新規作成メニューに出る）', () => {
    expect(appRegistry.get('issueTree')).toBe(issueTreeModule)
  })

  it('先行モジュールの登録を壊していない', () => {
    for (const type of ['glossary', 'errorCatalog', 'logicTree', 'sequence']) {
      expect(appRegistry.get(type)?.type).toBe(type)
    }
    expect(appRegistry.list().map((m) => m.type)).toContain('issueTree')
  })
})
```

- [ ] **Step 3: テストが落ちることを確かめる**

Run: `npx vitest run src/modules/issue-tree/module.test.ts`
Expected: FAIL

- [ ] **Step 4: `module.ts` を書く**

```ts
import { FlaskConical } from 'lucide-react'
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { IssueTreeSchemaVersion1 } from '@/types/issue-tree'
import issueTreeSchema from '../../../schemas/issue-tree.schema.json'
import { addRootIssue } from './commands'
import { checkIssueTreeConsistency } from './consistency'
import { IssueTreeEditor } from './IssueTreeEditor'
import { migrateIssueTree } from './migrate'

export const issueTreeModule: ToolModule<IssueTreeSchemaVersion1> = {
  type: 'issueTree',
  displayName: '課題ツリー',
  icon: FlaskConical,
  schemaVersion: 1,
  schema: issueTreeSchema as JsonSchema,
  // プレフィクスはエンティティ単位（rev 5章）。ツール単位で1つに統一しない
  idPrefixes: ['issue', 'hypothesis'],
  Editor: IssueTreeEditor,
  checkConsistency: checkIssueTreeConsistency,
  // 規約5: 出力プロファイルは0本。**Markdown 出力は設計ノートの OUT** で、
  // 本当に必要になるのは PoC 終盤（結果を意思決定の場に持ち込むとき）。
  // それまでが観察期間である
  outputs: [],
  // PoC のテーマごとに1本作るのが普通の使い方。用語集と違いハブではない
  singleton: false,
  migrate: migrateIssueTree,
  // **ルートの課題1件で作る。** ID の採番を commands.ts の1箇所に保つため
  // addRootIssue を通す（ここで newId を直接呼ばない）
  createEmpty: (title) =>
    addRootIssue({ schemaVersion: 1, type: 'issueTree', title, issues: [], hypotheses: [] }).data,
}
```

- [ ] **Step 5: レジストリに1行足す**

`src/modules/index.ts` に `import { issueTreeModule } from './issue-tree/module'` と `appRegistry.register(issueTreeModule)` を足す。**登録順は一覧のグループ順とファイル新規作成メニューの並びになる**（`src/core/file-grouping.ts`）ので、末尾に足す。

- [ ] **Step 6: テストが通ることを確かめる**

Run: `npx vitest run src/modules/issue-tree/module.test.ts`
Expected: PASS

- [ ] **Step 7: 既存の機械検査が新モジュールを走査対象に含んでいることを確かめる**

新しいツール・新しい種類のコンポーネントを足したので、**既存の走査が届いているか**を明示的に見る（[`docs/lessons-for-planning.md`](../../lessons-for-planning.md)「走査の母集合を今あるファイルの形で決めた瞬間に嘘になる」）。

`src/styles/palette.test.ts` に一時的に次の `it` を足して緑になることを確かめ、**確認したら消す**（検査を騙すための恒久的なコードを置かない）:

```ts
it.skip('（確認用）走査に issue-tree の tsx が入っている', () => {
  expect(componentSources.map((s) => s.file)).toContain('issue-tree/HypothesisCard.tsx')
})
```

より軽い代替として、`HypothesisCard.tsx` に一時的に `const bad = 'bg-warning/35'` を書いて `npx vitest run src/styles/palette.test.ts` が**落ちること**を確認し、消してもよい。**どちらかを必ず実施し、結果を報告に書くこと。**

- [ ] **Step 8: 全体の検証と Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "feat(issue-tree): ツールモジュール規約を満たしレジストリへ登録する"
```

---

## Task 11: 登録 Skill（`issue-tree-register`）

**Files:**
- Create: `.claude/skills/issue-tree-register/SKILL.md`, `package.json`, `.gitignore`, `schemas/issue-tree.schema.json`, `scripts/new-id.mjs`, `scripts/canonical.ts`, `scripts/derive.ts`, `scripts/issue-tree-write.mjs`
- Create (test): `src/modules/issue-tree/skill-copy.test.ts`, `src/modules/issue-tree/skill-write.smoke.test.ts`
- Modify: `src/core/skill-sync.ts`（`BUNDLED_SKILLS`）, `src/core/skill-schema-copy.test.ts`（`SCHEMA_COPIES`）

**Interfaces:**
- Consumes: `derive.ts`（Task 4）、`consistency.ts` の文言（Task 6）、`src/core/canonical.ts`
- Produces: プロジェクトフォルダへ配られる4本目の登録 Skill

**コピーは `cp` で作る。手で書き写さない。** 手複製は追従漏れがテストで検知されず、[`docs/open-issues.md`](../../open-issues.md) にエラーカタログ Skill の実例が記録されている。

**evals（`evals/evals.json` / `evals/grade.mjs` / fixtures）は本マイルストーンの範囲外とする**——設計ノートの IN 節は「ID採番・スキーマ検証・正規形書き出し」を挙げており、評価ハーネスは挙げていない。**Task 14 で `docs/open-issues.md` に1項目として足すこと**（足し忘れると静かに消える）。

- [ ] **Step 1: ディレクトリを作り、バイト一致コピーを置く**

```bash
mkdir -p .claude/skills/issue-tree-register/scripts .claude/skills/issue-tree-register/schemas
cp schemas/issue-tree.schema.json .claude/skills/issue-tree-register/schemas/issue-tree.schema.json
cp src/core/canonical.ts .claude/skills/issue-tree-register/scripts/canonical.ts
cp src/modules/issue-tree/derive.ts .claude/skills/issue-tree-register/scripts/derive.ts
```

**置き場所は `<Skill>/schemas/<名前>.schema.json` でなければならない**——書き出しスクリプトの `findSchema` は SKILL_DIR を起点に上へ辿りながら各階層で `<dir>/<名前>.schema.json` と `<dir>/schemas/<名前>.schema.json` を見るので、この位置なら第1階層で当たる（`src/core/skill-schema-copy.test.ts` の JSDoc）。

- [ ] **Step 2: `package.json` と `.gitignore` を置く**

`.claude/skills/sequence-register/package.json` を写して `name` と `description` だけ変える:

```json
{
  "name": "issue-tree-register-skill",
  "private": true,
  "type": "module",
  "description": "課題ツリー登録Skillの同梱スクリプト（ID採番・検証・正規形書き出し）",
  "dependencies": {
    "ajv": "^8.17.1"
  }
}
```

`.gitignore` は `.claude/skills/sequence-register/.gitignore` と同一（`node_modules/` と `package-lock.json`）。**`package.json` を置くこと**——置いた先にマニフェストが無いと、SKILL.md が指示する `npm install` が何もインストールせず `ajv が見つかりません` から抜けられない（sequence M4 の実機確認が掘り当てた欠陥）。

- [ ] **Step 3: `scripts/new-id.mjs` を書く**

`.claude/skills/sequence-register/scripts/new-id.mjs` を写し、prefix だけ差し替える（**既定は `issue`**——課題のほうが件数が多い）:

```js
//   node scripts/new-id.mjs 12                    → issue_XXXXXXXXXX を12件
//   node scripts/new-id.mjs 3 --prefix hypothesis → hypothesis_XXXXXXXXXX を3件
let prefix = "issue";
...
if (prefix !== "issue" && prefix !== "hypothesis") {
  console.error(
    `--prefix は issue か hypothesis のどちらかです: 受け取った値 = ${JSON.stringify(prefix)}`
  );
  process.exit(2);
}
```

- [ ] **Step 4: `scripts/issue-tree-write.mjs` を書く**

`.claude/skills/sequence-register/scripts/sequence-write.mjs` を土台に、次を差し替える。**構造（引数の解析・スキーマ探索・ajv 検証・正規化・警告・書き出し・終了コード）は写して変えない。**

1. `import("./questions.ts")` → `import("./derive.ts")`
2. スキーマ名 `sequence.schema.json` → `issue-tree.schema.json`、環境変数 `FACET_SEQUENCE_SCHEMA` → `FACET_ISSUE_TREE_SCHEMA`
3. **`normalizeSlots` は要らない**（課題ツリーに `oneOf` のスロットが無く、キー順はすべてスキーマの `properties` から導出できる）。**代わりに配列順の正規化も行わない**——アプリ側の `normalizeOrder` は値 import を持つのでコピーできず、順序の正規化はアプリに任せる。**この判断を SKILL.md に書き、「順序はアプリが開いたときに整う」と伝えること**
4. 整合性検証は Task 6 の**5ルールを逐語で**再実装する（文言は `src/modules/issue-tree/consistency.ts` が正。下の smoke テストが一致を強制する）
5. 未決の集計は `derive.js` の `poseQuestions` / `tallyQuestions` / `tallyLine` を呼ぶ（**数え直さない**）

出力の最後は次の形にする:

```js
console.log(`  スキーマ: ${schemaPath}`);
console.log(`  課題: ${issues.length}件 ／ 仮説: ${hypotheses.length}件`);
console.log(`  ${D.tallyLine(tally)}`);
if (openAt.length) console.log(`  未決の内訳: ${openAt.join("、")}`);
```

- [ ] **Step 5: `SKILL.md` を書く**

`.claude/skills/sequence-register/SKILL.md` の構成（対象を決める → データを組む → ID採番 → 書き込み → 報告 → フェーズB → 既存ファイルへの書き足し → やらないこと）を土台にする。**課題ツリー固有として必ず書くこと:**

- frontmatter の `description` は、**「仮説検証」「PoCで確かめること」「課題を分解」「検証結果を記録」「見送り」といった言い方でも起動する**ように書く（明示的に「課題ツリー」と言われなくても使う）
- **課題と仮説の書き分け**（未解決論点5の回答）: 課題＝観測された事実・望む状態とのギャップ／仮説＝支持・棄却を判定できる主張。**ただし入力時に厳密な区別を強制しない**——検証イベントを付ける段階で「支持・棄却を判定できる文か」が自然に問われる
- **`pendingNotes` は判断待ちの下書きであり、AI が勝手に判断イベントへ昇格させない**（D9）。会話に出た SH 発言はメモへ、判断は人間が下したものだけをイベントへ
- **`events` は追記専用。** 既存の要素を書き換えない・並べ替えない・削除しない
- **ステータスのフィールドを作らない。** 現在ステータスは最新イベントから導出される（`kind` を `status` のように書き足そうとすると `additionalProperties: false` で弾かれる）
- **見送りは最上位の課題に一度だけ付ける。** 配下へコピーしない（抑制は導出）
- **`rationale` が空でも warning にならない**ので、会話に由来が無ければ空のままにする
- **問いの類型を増やさない**（3つはスキーマ固定。増やすと網羅の担保が消える）
- 初回のみ `npm install`、Node は 22.18+ / 23.6+ / 24+

**「アプリでそのプロジェクトを開いたまま作業しない」の一文を落とさないこと**（自動保存と衝突して片方の変更が消える）。

- [ ] **Step 6: バイト一致と同期のテストを書く**

`src/modules/issue-tree/skill-copy.test.ts`（`src/modules/sequence/skill-copy.test.ts` を写し、`COPIES` を差し替える。**`extractImportStatements` / `isValueImportStatement` はあちらに既にあるので、そこから import して重複させない**——できない構造なら、あちらを `src/core/` へ切り出すのではなく、このテストは「バイト一致」だけを見て「値 import を持たない」は sequence 側のテストに任せる形にする。`src/core/skill-canonical-copy.test.ts` が既に同じ切り分けをしている）:

```ts
const COPIES = [
  { app: 'src/modules/issue-tree/derive.ts', skill: '.claude/skills/issue-tree-register/scripts/derive.ts' },
  { app: 'src/core/canonical.ts', skill: '.claude/skills/issue-tree-register/scripts/canonical.ts' },
]
```

**`derive.ts` については「値 import を持たない」「enum / パラメータプロパティを持たない」も必ず見る**（`canonical.ts` は既存テストが見ている）。

`src/core/skill-schema-copy.test.ts` の `SCHEMA_COPIES` に1件足す:

```ts
  {
    skill: 'issue-tree-register',
    schema: 'issue-tree.schema.json',
    script: 'scripts/issue-tree-write.mjs',
  },
```

`src/core/skill-sync.ts` の `BUNDLED_SKILLS` に `'issue-tree-register'` を足す。**`tauri.conf.json` の `bundle.resources` は `.claude/skills` をディレクトリごと同梱しているので、そちらの追従は要らない**（`skill-sync.ts` の JSDoc）。

- [ ] **Step 7: 実行 smoke テストを書く**

`src/modules/sequence/skill-write.smoke.test.ts` を写す。契約は「**アプリの `message` がスクリプトの stdout に逐語で現れる**」。fixture は Task 6 の5ルールを一度に炙り出す形（スキーマ検証は通ること）にする:

```ts
import { checkIssueTreeConsistency } from './consistency'
// ...
it('アプリの整合性 message がすべて stdout に逐語で現れる', () => {
  const issues = checkIssueTreeConsistency(FIXTURE as never)
  expect(issues.length).toBeGreaterThan(0)   // fixture が何も出さないなら検査が成立していない
  for (const issue of issues) expect(out.stdout).toContain(issue.message)
})
```

**このテストは同時に、`derive.ts` / `canonical.ts` の型ストリップ import 経路を実際に読む唯一の実行テストでもある。**

- [ ] **Step 8: Skill を実際に動かす**

```bash
cd .claude/skills/issue-tree-register && npm install
cd - && node .claude/skills/issue-tree-register/scripts/new-id.mjs 2 --prefix hypothesis
```
Expected: `hypothesis_` で始まる10文字の ID が2行

- [ ] **Step 9: 全体の検証と Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "feat(issue-tree): 課題ツリー登録 Skill を同梱する"
```

**`.claude/skills/issue-tree-register/node_modules/` と `package-lock.json` はコミットに含めないこと**（`.gitignore` が効いていることを `git status --short` で確認する）。

---

## Task 12: 読み方ガイド（`README-for-AI.md`）への追記

**Files:**
- Modify: `src/core/reading-guide.md`

**Interfaces:**
- Consumes: なし（静的テキスト。Vite の `?raw` import でバンドルへ入る）
- Produces: プロジェクトフォルダへ配られるガイドの新しい原本

**これが無いと、素の JSON を読む AI がドメイン規約を知る手段が無い。** スキーマの自己記述性は構造を説明するが、「未決を埋めてはいけない」「`pendingNotes` を勝手に昇格させない」といった**読み方の規約**は facet の docs にしかなく、ユーザーのプロジェクトフォルダには入っていない。

- [ ] **Step 1: 「ファイルの見つけ方」を直す**

現在「種類は現在4つ」と書いてある1文を5つに直し、`issueTree`（課題ツリー）を足す。**複数可の側**（`sequence` / `logicTree` と同じ扱い）に入れること。

- [ ] **Step 2: 「ID の読み方」に2つのプレフィクスを足す**

`issue_`＝課題ツリーの課題／`hypothesis_`＝課題ツリーの仮説。

- [ ] **Step 3: 「ツール別の読み方」に節を足す**

`### ロジックツリー（type: logicTree）` の後ろに置く（登録順に合わせる）。

```markdown
### 課題ツリー（type: issueTree）

- **ステータスというフィールドは存在しない。** 仮説の現在の判断は `events`（追記専用の配列）の**最後の要素**の `kind` から読む。`events` が空＝まだ決めていない（未決）。`supported`＝検証して支持／`rejected`＝検証して棄却／`supportedWithoutTest`＝自明に成立／`rejectedWithoutTest`＝検証せず棄却／`deferred`＝今回見送り／`deferredToMainDev`＝本開発送り
- **`events` は書き換えない。** 判断が覆ったときは新しいイベントを**足す**（過去の要素を直すと「そのとき何を根拠に決めたか」が消える）。同じ理由で、要素を削除したり並べ替えたりしない
- 立つ問いは3つで、いずれも導出される: **子を持たない課題**に仮説が0件なら「仮説は？」／仮説の `events` が0件なら「検証結果は？」／`pendingNotes` が空でなければ「判断は？」
- **課題ノードの `events`（見送り系2種）は、その課題と**配下すべて**の問いを止める。** 抑制は祖先を遡って計算されるので、**子に見送りをコピーしない**（親の見送りを解除したとき子が取り残される）
- **`pendingNotes` は「まだ判断に紐づいていない下書き」である。** レビュー中の発言などが入る。**ここにあるメモを、勝手に判断イベントの根拠へ昇格させない**——どれを公式の根拠に採るかは人間の選別であり、雑談メモを混ぜると「なぜそう決めたか」が汚れる
- `rationale`（仮説の発想の由来）が空なのは未決ではない。**由来の欠落は仕様の穴ではない**ので、埋めるよう促さない
- 課題＝観測された事実や、望む状態とのギャップ。仮説＝支持・棄却を判定できる主張。**ただし入力時に厳密な区別は求められていない**ので、どちらとも読める文があっても直さない
```

- [ ] **Step 4: 「書き込みたくなったら」の Skill 名一覧に足す**

`glossary-term-register / error-catalog-register / sequence-register` の並びに `issue-tree-register` を足す。

- [ ] **Step 5: 検証と Commit**

Run: `npm test`
Expected: `src/core/reading-guide.test.ts` が緑（ガイド全文は固定していないので、追記で落ちることはない。落ちたら先頭500文字の注意書きを壊している）

```bash
git add -A
git commit -m "docs(reading-guide): 課題ツリーの読み方を README-for-AI に足す"
```

---

## Task 13: お手本（`sample-project/`）と `README.md`

**Files:**
- Create: `sample-project/課題ツリー.json`（**追跡対象**）
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 11 の Skill（お手本の生成に使う）
- Produces: 4ツール → 5ツールに増えたお手本一式

**題材は既存のお手本と同じ「中途採用の応募管理」の枠内にする。** 設計ノートのモックが使った「適性検査サービス連携PoC」はその中の1テーマなので、モックの内容をそのまま素材にできる（`docs/issue-tree/仮説検証モック.jsx` の `TREE` を読むこと）。

- [ ] **Step 1: 下書きを作る**

**下書きは対象プロジェクトフォルダの外に置く**（中に置くとアプリのファイル一覧に下書きが本物として並ぶ）。ID は必ず `node .claude/skills/issue-tree-register/scripts/new-id.mjs` で採番する。

構成（モックの場面5まで進めた状態＋**わざと残す未決**）:

| 課題 | 仮説 | 仕込み |
| --- | --- | --- |
| 適性検査サービス連携（PoCテーマ・根） | — | 中間ノード |
| └ 適性検査APIの応答特性が要件を満たすか不明 | — | 中間ノード |
| 　└ 結果取得を画面遷移の中で待てるか | 同期取得で間に合う／webhook受信に切り替える | `rejectedWithoutTest` ／ `supported`。**決着した葉** |
| 　└ レート制限下で一括受検案内を捌けるか | 送信を夜間バッチに寄せる | `rejected`（棄却の学びが根拠に入る） |
| 　└ 送信キューの平準化方式 | **なし** | **「仮説は？」が立つ** |
| └ 受検結果の取り込みタイミングを決められない | 結果確定イベント起点だけでよい | `supportedWithoutTest` |
| └ 再受検の扱い | — | **課題ノードに `deferred`。配下2件の問いが抑制される** |
| 　└ 受検IDの再発行が要るか ／ スコアはどちらを正とするか | なし | 抑制されているので問いは立たない |
| └ 結果表示画面に何を出すか | スコアはサマリのみで足りる | `deferredToMainDev` |
| └ 受検案内の再送導線 | 応募者から再送依頼が来る前提でよい | **`events: []`（「検証結果は？」）＋ `pendingNotes` 1件（「判断は？」）** |

**未決が3種類とも1件以上出る形にすること**——お手本の役目は「未決が warning として残る」を見せることであり、1種類だけでは3つの問いの違いが伝わらない。`rationale` は一部だけ埋める（**空でも warning が立たない**ことを見せるため）。

- [ ] **Step 2: Skill で書き出す**

```bash
node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --in <下書き.json> --out sample-project/課題ツリー.json
```
Expected: `✓ 正規形で書き出しました` と、未決の集計（`⚠ 未決 …`）が出る。**整合性の警告が出ていないこと**（お手本が壊れていては意味がない）。

- [ ] **Step 3: 配列順を正規形に整える**

Skill は配列順を並べ替えない（Task 11 Step 4）。**アプリで一度開いて自動保存させるか、下書きの時点で DFS 行きがけ順・仮説を課題順に並べておくこと。** どちらを採ったかを報告に書く。

Run: `node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --check sample-project/課題ツリー.json`
Expected: `✓ 正規形と一致しています`

- [ ] **Step 4: `README.md` を直す**

1. 「入っているツール」の表に1行足す:

```markdown
| **課題ツリー** | PoC で「試さないと分からないこと」の分解と、仮説・検証の履歴。**ステータスを持たず、追記だけで現在が決まる** | いくつでも | なし |
```

「状態遷移エディタが次の候補」の1文はそのままでよい。

2. ツールごとの節を、ロジックツリーの後ろに足す（他の節と同じく `<!-- SCREENSHOT: ... -->` のコメントと `![...](docs/images/issue-tree-editor.png)` を置く。**画像そのものは人間が撮る**ので、Task 15 の確認項目に載せる）:

```markdown
### 課題ツリー

**仮説に「支持／棄却／検証中」のようなステータス欄は無い。** あるのは追記だけの履歴で、いまどうなっているかは**最新の1件**から決まる。だから更新忘れで嘘をつかないし、「一度棄却したものが半年後に復活した」も履歴を消さずに書ける。

問いは3つ立つ——葉の課題に仮説が無ければ「仮説は？」、仮説に検証の記録が無ければ「検証結果は？」、レビューのメモが判断に紐づかないまま残っていれば「判断は？」。**枝ごと見送った課題の配下では、この問いが立たなくなる**（見送りは最上位に一度だけ付け、配下への波及は毎回計算する）。
```

3. 「お手本」の表に1行足す:

```markdown
| `課題ツリー.json` | 仮説が無い葉が1つ／検証結果が空の仮説が1つ／レビューのメモが判断に紐づかないまま残っている仮説が1つ。対比として、枝ごと「今回見送り」にした課題の配下は問いが立たない |
```

4. 「同梱の Skill」の本数（3本→4本）と Skill 名の一覧に `issue-tree-register` を足す。

- [ ] **Step 5: お手本が実際に開けることを確かめる**

```bash
node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --check sample-project/課題ツリー.json
```
Expected: スキーマ検証 OK・正規形一致・整合性の警告なし・未決の内訳が3種類とも出る

- [ ] **Step 6: Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "docs(sample): 課題ツリーのお手本を足し README を5ツールに更新する"
```

---

## Task 14: ドキュメントへの反映（マイルストーン完了時の3箇所）

**Files:**
- Create: `docs/history/issue-tree-m1-editor-and-skill.md`
- Modify: `docs/open-issues.md`, `docs/overview-rev.md`, `docs/README.md`

**Interfaces:**
- Consumes: Task 1〜13 の結果
- Produces: 次の計画者が「正」として読む文書の更新

**`overview-rev.md` への反映はこのコミットで済ませ、申し送りに TODO として残さない**（M4 の教訓。次の計画者は rev を正として読むため、反映漏れは設計と実装の食い違いとして伝播する）。

- [ ] **Step 1: `docs/history/issue-tree-m1-editor-and-skill.md` を書く（追記専用・以後変えない）**

書くのは「そのとき何が起きたか」——実装で確定した事項・見つかった欠陥・実機確認の結果。**残件の一覧をここに書かない**（それは `open-issues.md` の仕事）。少なくとも次を含める:

- キャンバス基盤をコアへ引き上げた判断と、その範囲（何を移し、何を各モジュールに残したか）
- 主修飾キー＋`Enter` を「そのセルの主たる副操作」に写像した判断と、退けた代替案（`Shift+Tab` はキャンバスからの Tab 抜けに予約されている／コアにコマンドを増やす案）
- **モックの色分けを採らなかった判断**（Tailwind 標準パレットが配色差し替えに追従しない／D8 が色を使わないと決めている、の2つの独立した根拠）
- 抑制の見せ方を「薄くする」ではなく「地の色に落とす」にした理由（`opacity` は検算したコントラストを割る）
- 「編集できるのは最新イベントの `note` だけ」にした判断
- Task 15（実機確認）の結果。**未実施ならその旨を明記し、確認項目のチェックリストを空のまま残す**

- [ ] **Step 2: `docs/open-issues.md` を編集する**

**消すもの:**

- **「キャンバスの土台が logic-tree と sequence で丸ごと複製されている」の項**（`[sequence-m1]` タグ。「小さな負債」の節）——Task 1・2 で解消した。**この項が末尾で触れている logic-tree 側の既知の穴3件**（モーダル中もホイール／ドラッグが生きている・ドラッグ中のアンマウントでリスナーが残る・`FOLLOW_MARGIN` の 8px ずれ）**は消えていない。** うち前者2件は他の項に独立して載っているので、**`FOLLOW_MARGIN` の 8px ずれの項のファイルパスを `src/core/canvas/` へ直すこと**（「挙動の穴」の節。移設でパスが変わったのに古いパスが残ると、探しても見つからない記録になる）

**書き換えるもの（新規に足さない）:**

- **「登録3 Skill は整合性検証の警告文言・計上規則を、アプリと独立に複製している」の項**（`[Skill]` タグ）——**4本になった。** `issue-tree-register` を列挙に足し、同じく smoke テストで縛られていることを書く
- **「`palette-fit.mjs` が Node の型ストリップに依存している」の項**（`[Skill]` タグ）——同じ依存が `issue-tree-register`（`derive.ts` / `canonical.ts` を同ディレクトリから import）にもあることを列挙に足す

**足すもの（`[issue-tree-m1]` タグを付ける）:**

- **課題ノードの見送りにキーボード経路が無い**（`src/modules/issue-tree/IssueTreeEditor.tsx`）: 主修飾キー＋`Enter` は課題セルでは仮説の追加に割り当てたため、見送り（`deferred` / `deferredToMainDev`）はノードのボタンからしか付けられない。選定会議で数回だけ使う操作なのでキーを増やす側を優先しなかったが、**「キーでしか到達できない意味を残さない」の裏返しの穴**である
- **登録 Skill に evals が無い**（`.claude/skills/issue-tree-register/`）: 既存3本は評価ハーネス（`evals/evals.json` / `grade.mjs` / fixtures）を持つが、issue-tree-register は持たない。**description の起動精度を測る手段が無い**ので、他 Skill と誤起動し合っていても気づけない
- **フォーカスモードと選択ハイライト（D8）が未実装**（`src/modules/issue-tree/`）: 設計ノート D8 は「いまどの課題を説明中か」の共有を純粋なビュー状態で実現すると決めたが、本マイルストーンのスコープ IN には入っていない。**レビューで実際に困ってから作る**
- **課題ツリーに Markdown 出力が無い**（`outputs: []`）: 設計ノートの OUT。**必要になるのは PoC 終盤**（結果を意思決定の場に持ち込むとき）で、それまでが観察期間
- **仮説カードの幅が固定で、長い仮説は縦に伸びる**（`src/modules/issue-tree/measure.ts` の `CARD_WIDTH`）: 幅を導出しないことで木が階段状になるのを避けているが、**1枚のカードが極端に縦長になる形は実使用でしか分からない**
- **課題ツリーの並び替えに「別の課題へ付け替える」手段が無い**（`moveHypothesis` は課題をまたがない）: 仮説を別の課題へ移したくなったら、消して作り直すしかない
- Task 15 が未実施なら、**実機確認が未実施であること**を「次に手を付ける候補」へ1項目として足す（`history/` にだけ書くと幽霊になる）

**冒頭の「最終更新」の段落を更新すること**（何を消し何を足したかを書く形が既存の流儀）。

- [ ] **Step 3: `docs/overview-rev.md` へ反映する**

| 章 | 反映内容 |
| --- | --- |
| 2章 ツール一覧 | 課題ツリーを足す |
| 6章 拡張要件 | **「キャンバス系ツールのレイアウト関数は当面モジュールが持つ（sequence M1 時点）」の項を書き換える。** ビューポート・測定層・フォント読み取り・平坦木の組み立て・木のレイアウトは `src/core/canvas/` へ引き上げた（3本目のキャンバスツールが来たのが判断の契機）。各モジュールに残るのは**箱の寸法定数と、そのツール固有の畳み方**（課題ツリーは「課題ノード＋仮説カード」を1ブロックにしてから木のレイアウトへ渡す）であること |
| 9章 確定要素 | **測定層と描画層が同一のフォントトークンを参照する規約**の項に、実装が `src/core/canvas/canvas-font.ts` へ移ったことを反映する |
| 10章 キーボード操作 | **主修飾キー＋`Enter`（`toggle-item-state`）の写像がツールごとに違う**ことを明記する（シーケンス＝答えスロットの「考慮不要」／課題ツリー＝そのセルの主たる副操作）。「意味の解決はコアのまま、写像だけツール側」の適用例として、sequence M2 の項の近くに置く |

**`rev N章` は 249 箇所から参照されている通称。ファイル名と章番号を動かさないこと。**

- [ ] **Step 4: `docs/README.md` を直す**

- 冒頭の「用語集エディタが1本目、…」の並びに課題ツリーを足す
- 「どれを読むか」の表に `docs/issue-tree/仮説検証モジュール-設計ノート.md` の行を足す（**設計の正**として）
- 「マイルストーンの履歴」の表に `issue-tree-m1` の行を足す
- 「ツールが増えたとき」のディレクトリ例に `docs/issue-tree/` を足す
- **採番が4系統になったこと**（コア／ロジックツリー／シーケンス／課題ツリー）を、採番の説明の段落に反映する

- [ ] **Step 5: 反映漏れが無いか機械的に確かめる**

```bash
grep -rn "4つ|4ツール|4本" README.md docs/README.md src/core/reading-guide.md -E
```
Expected: 出た行を1つずつ見て、ツールの本数を指しているものが残っていないこと（**別の意味の「4」もあるので、機械的に置換しない**）

```bash
grep -rn "issueTree" docs/overview-rev.md docs/README.md README.md src/core/reading-guide.md
```
Expected: 4ファイルすべてに1件以上

- [ ] **Step 6: Commit**

```bash
npm test && npx tsc -b && npm run lint
git add -A
git commit -m "docs(issue-tree): 申し送り・残件・rev・地図を issue-tree-m1 に合わせる"
```

---

## Task 15: 実機確認（**人間の作業**）

**Files:** なし（確認のみ。見つかった欠陥は別タスクとして起こす）

**サブエージェントは GUI を操作できない。このタスクは人間が行う。** Task 14 の申し送りは、この結果が出るまで「未実施」と明記したままにする。

```bash
npm install        # 省略しない。マージが依存を増やしていることがある
npm run tauri dev
```

- [ ] **1. 新規作成**——サイドバーの新規作成に「課題ツリー」がフラスコのアイコンで出る。作るとルート課題1件・空欄で開く
- [ ] **2. キーボードだけで木を伸ばす**——`Enter`（兄弟）／`Tab`（子）／`←→`（親子移動）／`Alt+↑↓`（並び替え）／空欄 `Backspace`（部分木削除）。**日本語を IME で打ち、変換確定の `Enter` で課題が増えないこと**
- [ ] **3. 仮説を足す**——課題セルで `Ctrl+Enter`。カードが課題の下に生え、`Tab` で 文言 → 由来 → メモ と移れる
- [ ] **4. 判断イベント**——仮説セルで `Ctrl+Enter` → 6種のドロップダウン → 選ぶと行が生え、根拠のセルにフォーカスが来る。**過去のイベントの根拠が編集できないこと**
- [ ] **5. メモの選別移動**——メモセルで `Ctrl+Enter` を押すと最新イベントの根拠へ移り、「判断は？」が消える
- [ ] **6. 見送りの抑制**——課題ノードのボタンから「今回見送り」。**配下の問いが一斉に消え、面が地の色に落ちること。** 帯の集計がその分だけ減ること
- [ ] **7. ズーム・パン**——`Ctrl+ホイール`／`Space+ドラッグ`／中ボタンドラッグ。**ドロップダウンを開いたままキャンバスを動かしても破綻しないこと**（sequence M3 の実機確認で見つかった形）
- [ ] **8. 追従**——画面外に課題を足したとき、視点がそこへ寄ること
- [ ] **9. 自動保存と外部変更**——アプリを開いたまま、別の窓で Skill を走らせて同じファイルを書き換え、トーストで読み直しが起きること
- [ ] **10. Skill の実地**——**プロジェクトフォルダを開き直して `.claude/skills/issue-tree-register/` が置かれること**を確認したうえで、**そのフォルダで `npm install` を実行し、その後の状態でもう一度アプリを開いてフォルダを走査させる**（sequence M4 はこの一手で2つの欠陥を掘り当てた）。続けて Skill に会話から課題ツリーを組ませ、アプリで開けること
- [ ] **11. ライト／ダークの両方**で 3・6 の面の見分けがつくこと（未決＝`warning/10`、抑制＝地の色、エラー＝`warning/20`）
- [ ] **12. 開発機と違う OS**（Windows で開発したなら mac、逆も同じ）で 1・10 を通す——`fs` scope の glob 判定は OS で既定が反転する（M11 / sequence M4 の実例）
- [ ] **13. スクリーンショット**を撮って `docs/images/issue-tree-editor.png` に置く（README のコメントに撮り方を書いてある）

**見つかったことは、症状（何が起きるか）と人間の言葉（何が嫌か）を分けて記録する。** 対策が症状ではなく言葉の方を消しているかを確かめること（sequence M3 の教訓）。

---
