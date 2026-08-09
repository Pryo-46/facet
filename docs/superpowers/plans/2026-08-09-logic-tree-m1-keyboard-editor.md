# ロジックツリーエディタ M1（キーボードで打ち切れる状態）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 空の状態から、キーボードだけで会議1回分（30〜50ノード）のロジックツリーを打ち切れて、閉じて開き直すと同じ形で出るエディタを作る。

**Architecture:** データは座標を持たない。`nodes` の平坦な配列（各ノードが `parentId` で親を指す）を正とし、そこから毎回 **木の再構成 → 文言の測定 → レイアウト → 描画** の4段で図を導出する。木の再構成・測定・レイアウトはすべて DOM 非依存の純関数で、ユニットテストの対象。描画は「背景／エッジ（SVG）／ノード（絶対配置 DOM）」の3レイヤに同一の transform を当て、ビューポートは d3-zoom が返す `{x, y, k}` だけを受け取る。キー判定はコアの `resolveCommand` に一元化し、エディタは意味（コマンド）を自分の構造へ写像するだけを担う。

**Tech Stack:** TypeScript / React 19 / Tailwind v4 / Vitest（+ jsdom）／ Ajv（既存のスキーマ検証）／ d3-zoom・d3-selection（新規。ビューポートのみ）

## この計画が前提とする資料

- `docs/logic-tree/logic-tree-m1-scope.md` — **範囲の正**
- `docs/logic-tree/logic-tree-canvas-tech-notes.md` — 設計判断の根拠
- `docs/overview-rev.md` 5章（データ・ID・二段検証）／6章（モジュール規約）／9章（デザイントークン）／10章（操作言語）
- `docs/lessons-for-planning.md` — **着手前に読むこと**

## 計画時に確定した設計判断（スコープに書かれていなかったもの）

| 論点 | 決定 | 根拠 |
| --- | --- | --- |
| ノードの持ち方 | **平坦な配列 ＋ `parentId`** | 入れ子だと循環・多重ルートが表現できず、スコープが要求する整合性検証3件のうち2件が「壊しても緑のままのテスト」になる。`children: string[]` だと1ノードが2つの親から参照でき、レイアウトの戻り値 `Map<キー, {x,y}>` が表現できるものを超える。`parentId` は親が1つであることがフィールドの形そのもの |
| 配列の順序 | **DFS 行きがけ順（preorder）を保つ。構造を変える操作は必ず `orderNodes` を通す** | 兄弟順の正本は配列順（rev 5章）。preorder を保つと配列を上から読むだけで木の形が追え、挿入位置の計算が「部分木の直後」という一つの規則で済む |
| `toMarkdown` | **モジュール規約で任意（`toMarkdown?`）にする。** ロジックツリーは M1 では持たない | 出力は M2。必須のままだと、押すと壊れた文字列が出るボタンが残る |
| 折り返しの単位 | **コードポイント単位のグリーディ（CSS の `word-break: break-all` と一致させる）** | 日本語は任意位置で折り返す。単語単位にすると測定層とブラウザの判断がずれる |
| ノードの入力欄 | **常に `<textarea>`（`CellInput` を再利用）。フォーカス＝編集中** | IME 対応・ドラフト・Undo 反映・キャレット位置の判定が既に `CellInput` にあり、テスト済み（`CellInput.dom.test.tsx`）。M1 最大の risk（変換確定 Enter の誤爆）を新規コードに載せ替えない |
| ルート上の `Enter` | **子を追加する**（兄弟ではなく） | 兄弟を作ると多重ルートになる。単一ルートの木という制約と矛盾しない唯一の意味 |
| 空欄 `Backspace` | **部分木ごと削除する** | 確認ダイアログを挟まないのは rev 5章の既定方針（会議中の入力速度）。1操作1コミットの Undo で戻せる。葉だけに限ると、M1 にはドラッグも右クリックも無いため誤った枝を消す手段が一つも無くなる |
| 新ノードへのビュー追従 | **画面外なら収まるだけパンする（倍率は変えない）** | 打った直後のノードが画面外だと、何を打っているか見えないまま入力することになり、完了条件1が成立しない |

## スコープからの逸脱（意図的なもの。実装者が勝手に変えないこと）

1. **整合性検証を4ルールにする。** スコープの3件（ID重複・循環・ルート単一性）に加えて `missing-parent`（`parentId` が実在しない）を足す。足さないと、親を失ったノードが黙ってもう1つのルートとして描かれ、多重ルートの原因が画面から読み取れない
2. **`src/core/keyboard/keymap.ts` と `src/components/CellInput.tsx` に手を入れる。** どちらもコアだが、rev 10章 実装規約が「キーボード処理はツールごとに自前実装しない」と定めている以上、ツリーが必要とする意味（Tab＝子追加、←→＝親子移動）はコアの `resolveCommand` に足す以外にない
3. **`src/core/registry.ts` の `toMarkdown` を任意にする**（上表のとおり）

---

## Global Constraints

**この節の内容は全タスクの要件に含まれる。** 値はスコープ・rev から逐語で写している。

- **キャンバスライブラリ（React Flow / tldraw / elkjs / dagre）を導入しないこと。** 検討済みで不採用
- **座標・幅・表示状態をデータ（JSON）に入れないこと。** 位置はレイアウト関数が毎回導出し、幅は測定層が文言から算出する
- **`core/canvas` 等への共通化・抽象化を行わないこと。** シーケンスエディタと共有できそうな部分があっても、この段階では素直に `src/modules/logic-tree/` の中に書く
- **`Ctrl+C` / `Ctrl+V` に他の意味を割り当てないこと**
- **色値の直書き禁止**（`#rrggbb` / `rgb()` / `hsl()` / `oklch()` / `bg-red-500` のような Tailwind 標準パレット）。役割トークン（`text-ink` / `bg-surface` / `border-rule` / `stroke-rule` / `bg-warning` …）だけを使う。`src/styles/conventions.test.ts` が機械検査する
- **フォントサイズは `text-xs` / `text-sm` / `text-base` / `text-lg` の4段のみ。** `text-xl` 以上と任意値 `text-[13px]` は同じ検査が弾く
- **フォーカスは面の塗り替えではなくリングで示す**（`focus:ring-2 focus:ring-inset focus:ring-ring`）
- **新しいボタンは `src/components/button-styles.ts` の `buttonBase` を通す**
- ID 規約: `node_` ＋ 英数字62文字（`A-Za-z0-9`）10文字固定。採番は `src/core/new-id.ts` の `newId('node')`。**連番禁止**
- `schemaVersion` は `const: 1`
- ファイルへの書き出しは必ず `src/core/canonical.ts` の `serialize`（正規形）を通る。エディタは書き込みに触らない（額縁の担当）
- 実装は `npm test` / `npx tsc -b` / `npm run lint` の3つがすべて緑であること。**「このタスクに関係するテストだけ回す」をしないこと**
- **計画の指示が矛盾していたら、辻褄を合わせずに「計画の矛盾」として報告すること。** 報告には実行した検証コマンドとその出力を貼ること

---

## File Structure

### 新規（`src/modules/logic-tree/`）

| ファイル | 責務 |
| --- | --- |
| `tree.ts` | 平坦な `nodes` → 木（`NodeTree`）の再構成。親・子・深さ・到達不能ノードの算出。**DOM 非依存** |
| `consistency.ts` | 整合性検証（規約4）。`tree.ts` の結果を `ConsistencyIssue[]` に翻訳する |
| `measure.ts` | 折り返しとノード寸法の計算。**DOM 非依存**（幅の測り方は関数で注入される） |
| `node-font.ts` | DOM からフォントを読む／canvas の測定器を作る。`measure.ts` の DOM 依存部分をここだけに閉じる |
| `layout.ts` | `(木, サイズ表) → Map<キー, {x, y}>`。**完全な純関数** |
| `commands.ts` | 編集コマンド（追加・削除・並び替え・文言変更）と `orderNodes`。**すべて純関数** |
| `viewport.ts` | `Transform` 型とビュー追従の計算。**純関数** |
| `useViewport.ts` | d3-zoom の配線（ホイール・ドラッグ・Space 監視）。React フック |
| `NodeBox.tsx` | ノード1つの描画（`CellInput` を包む） |
| `TreeEdges.tsx` | エッジ（SVG のパス）の描画 |
| `LogicTreeEditor.tsx` | 4段の結線・フォーカス管理・コマンドの写像 |
| `module.ts` | モジュール規約の実体 |
| `migrate.ts` | マイグレータ（初版につき恒等） |

### 新規（その他）

- `schemas/logic-tree.schema.json` — **データ形式の正**
- `src/types/logic-tree.ts` — 上から自動生成（手で編集しない）

### 変更

| ファイル | 変更内容 |
| --- | --- |
| `package.json` | `gen:types` をツールごとの2本に割る |
| `src/core/registry.ts` | `toMarkdown` を任意にする |
| `src/core/app-controller.ts` | `toMarkdown` を持たないモジュールでの出力要求を止める |
| `src/App.tsx` | `canExport` の条件。`globalKeyContext` に新フィールド |
| `src/core/keyboard/keymap.ts` | `insert-child` / `focus-parent` / `focus-child` と `KeyContext.hierarchical` |
| `src/components/CellInput.tsx` | `autoSize` プロパティ（高さを外から決める経路） |
| `src/modules/glossary/GlossaryEditor.tsx` / `AliasCell.tsx` | `hierarchical: false` を渡す |
| `src/modules/index.ts` | `logicTreeModule` の登録1行 |

---

## Task 1: スキーマと型生成

**Files:**
- Create: `schemas/logic-tree.schema.json`
- Create: `src/modules/logic-tree/schema.test.ts`
- Create: `src/modules/logic-tree/migrate.ts`
- Modify: `package.json`（`scripts.gen:types`）
- 生成物: `src/types/logic-tree.ts`（**手で書かない**）

**Interfaces:**
- Produces: 生成された型 `LogicTreeSchemaVersion1`（`{ schemaVersion: 1; type: 'logicTree'; title: string; nodes: TreeNode[] }`）と `TreeNode`（`{ id: string; parentId: string | null; text: string }`）。以降の全タスクがこの2つを `@/types/logic-tree` から import する
- Produces: `migrateLogicTree(data: unknown, fromVersion: number): LogicTreeSchemaVersion1`

- [ ] **Step 1: スキーマを書く**

`schemas/logic-tree.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "logic-tree.schema.json",
  "title": "ロジックツリー (logicTree) schemaVersion 1",
  "description": "仕様整理ツール詰め合わせのロジックツリーファイル。1ファイル＝1本の木（単一ルート）。ノードの位置・幅・折りたたみ状態は持たない——図はこのデータから毎回導出する（rev 3章）。キーの正規順序は本スキーマの properties 記載順とする。",
  "type": "object",
  "properties": {
    "schemaVersion": {
      "description": "スキーマの版。logicTree の初版は 1。アプリは検証前にこの値を読み、未知の新版は「一覧表示のみ・編集不可」として扱う。",
      "const": 1
    },
    "type": {
      "description": "ツール種別。ロジックツリーは logicTree 固定。",
      "const": "logicTree"
    },
    "title": {
      "description": "表示名。プロジェクトのファイル一覧に使う。",
      "type": "string"
    },
    "nodes": {
      "description": "ノードの配列。親子関係は parentId が持ち、配列順は「同じ親を持つノードどうしの並び順（＝兄弟順）」の正である。アプリは編集のたびに配列を DFS 行きがけ順へ整える（兄弟の相対順は変えない）ので、上から読むと木の形が追える。",
      "type": "array",
      "items": { "$ref": "#/$defs/treeNode" }
    }
  },
  "required": ["schemaVersion", "type", "title", "nodes"],
  "additionalProperties": false,
  "$defs": {
    "treeNode": {
      "description": "ノード1件。全キー常在（欠損でなく空の値で「未記入」を表現する）。",
      "type": "object",
      "properties": {
        "id": {
          "description": "不変ID。プレフィクス node_ ＋ nanoid（英数字62文字カスタムアルファベット）10文字固定。連番禁止。",
          "type": "string",
          "pattern": "^node_[A-Za-z0-9]{10}$"
        },
        "parentId": {
          "description": "親ノードのID。ルートは null。単一ルートであること・循環が無いこと・参照先が実在することはスキーマでは表せないため、整合性検証（レベル2）で受け止める。",
          "type": ["string", "null"],
          "pattern": "^node_[A-Za-z0-9]{10}$"
        },
        "text": {
          "description": "ノードの文言。空文字＝「未記入」。空を許すのは、追加した直後の状態がそのままファイルに載りうるため（空を禁じると、打ち終わる前の自動保存がレベル1違反ファイルを作る）。表示上の折り返しはデータに持たない——アプリ内の表示都合であり、ユーザーが明示的に入れた改行（\\n）だけが文言の一部である。",
          "type": "string"
        }
      },
      "required": ["id", "parentId", "text"],
      "additionalProperties": false
    }
  }
}
```

- [ ] **Step 2: 型生成を2本に割る**

`package.json` の `scripts` を次の形にする（`gen:types` を呼んでいる `predev` / `prebuild` / `pretest` / `prepare` はそのまま）:

```json
    "gen:types": "npm run gen:types:glossary && npm run gen:types:logic-tree",
    "gen:types:glossary": "json2ts --input schemas/glossary.schema.json --output src/types/glossary.ts --bannerComment \"/* schemas/glossary.schema.json から自動生成。手で編集しないこと（npm run gen:types で再生成される）。 */\" --additionalProperties false",
    "gen:types:logic-tree": "json2ts --input schemas/logic-tree.schema.json --output src/types/logic-tree.ts --bannerComment \"/* schemas/logic-tree.schema.json から自動生成。手で編集しないこと（npm run gen:types で再生成される）。 */\" --additionalProperties false",
```

- [ ] **Step 3: 生成して、名前を目で確認する**

```bash
npm run gen:types
```

`src/types/logic-tree.ts` を開いて、**エクスポートされている型名が `LogicTreeSchemaVersion1` と `TreeNode` であることを確認する。**

json2ts はルート型名を `title` から、`$defs` の型名をキー名から導く（用語集では `"用語集 (glossary) schemaVersion 1"` → `GlossarySchemaVersion1`、`$defs/term` → `Term` になっている）。**もし別の名前が出たら、計画の予測が外れているので、生成された実際の名前を以降のタスクで使い、「計画と生成物の名前が違う」ことを報告すること。**

`$defs` のキーを `node` にしていないのは、生成される型名 `Node` が DOM のグローバル型 `Node` と衝突するため。**`treeNode` から改名しないこと。**

- [ ] **Step 4: マイグレータを書く**

`src/modules/logic-tree/migrate.ts`:

```ts
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'

/**
 * 規約6: マイグレータ。schemaVersion 1 が初版のため旧版が存在せず、
 * 恒等変換の枠だけを置く。schemaVersion 2 が生まれた時点で最初の変換を実装する。
 */
export function migrateLogicTree(data: unknown, _fromVersion: number): LogicTreeSchemaVersion1 {
  return data as LogicTreeSchemaVersion1
}
```

- [ ] **Step 5: スキーマ検証のテストを書く（失敗させる）**

`src/modules/logic-tree/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createSchemaValidator, type JsonSchema } from '@/core/schema-validation'
import logicTreeSchema from '../../../schemas/logic-tree.schema.json'

const validate = createSchemaValidator(logicTreeSchema as unknown as JsonSchema)

const base = {
  schemaVersion: 1,
  type: 'logicTree',
  title: '退会フローの検討',
  nodes: [
    { id: 'node_aB3xY9kLm2', parentId: null, text: '退会できない' },
    { id: 'node_Qw7zR1nP4t', parentId: 'node_aB3xY9kLm2', text: '導線が分からない' },
  ],
}

describe('logicTree のスキーマ検証（レベル1）', () => {
  it('最小の正しいファイルを受け入れる', () => {
    expect(validate(base).ok).toBe(true)
  })

  it('ノード0件（新規作成直後）を受け入れる', () => {
    expect(validate({ ...base, nodes: [] }).ok).toBe(true)
  })

  it('空の文言を受け入れる', () => {
    // 追加した直後の状態がそのまま自動保存されうる。ここを弾くと
    // 打ち終わる前の保存が「自分で作った開けないファイル」になる
    expect(validate({ ...base, nodes: [{ id: 'node_aB3xY9kLm2', parentId: null, text: '' }] }).ok).toBe(true)
  })

  it('ID のプレフィクスが違うものを拒否する', () => {
    expect(validate({ ...base, nodes: [{ id: 'term_aB3xY9kLm2', parentId: null, text: 'x' }] }).ok).toBe(false)
  })

  it('ID の長さが違うものを拒否する', () => {
    expect(validate({ ...base, nodes: [{ id: 'node_aB3xY9kLm', parentId: null, text: 'x' }] }).ok).toBe(false)
  })

  it('未知のキーを拒否する', () => {
    // 座標をデータに入れる経路をスキーマで塞ぐ（rev 3章）
    expect(
      validate({ ...base, nodes: [{ id: 'node_aB3xY9kLm2', parentId: null, text: 'x', x: 10 }] }).ok,
    ).toBe(false)
  })

  it('parentId の欠損を拒否する（全キー常在）', () => {
    expect(validate({ ...base, nodes: [{ id: 'node_aB3xY9kLm2', text: 'x' }] }).ok).toBe(false)
  })

  it('循環しているファイルはスキーマ検証を通る（レベル2の担当）', () => {
    // 「拒否は解釈不能な場合に限る」（rev 5章）。構造は読めるので開ける
    expect(
      validate({
        ...base,
        nodes: [
          { id: 'node_aB3xY9kLm2', parentId: 'node_Qw7zR1nP4t', text: 'a' },
          { id: 'node_Qw7zR1nP4t', parentId: 'node_aB3xY9kLm2', text: 'b' },
        ],
      }).ok,
    ).toBe(true)
  })
})
```

**`@/core/schema-validation` の実際のエクスポート名（`createSchemaValidator` の引数型）を開いて確認し、上の import を合わせること。** `JsonSchema` が `@/core/canonical` 側にあるならそちらから取る。

- [ ] **Step 6: 実行して落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/schema.test.ts
```

期待: スキーマファイルまたは型が無い段階なら import で失敗する。Step 1〜4 を終えている場合は緑になる。**緑になった場合は、テストを1つ意図的に壊して（例: `pattern` を消す）落ちることを確認してから戻すこと**——通っているのがスキーマのおかげか確かめる。

- [ ] **Step 7: 全体を回す**

```bash
npm test && npx tsc -b && npm run lint
```

- [ ] **Step 8: コミット**

```bash
git add schemas/logic-tree.schema.json src/types/logic-tree.ts src/modules/logic-tree/migrate.ts src/modules/logic-tree/schema.test.ts package.json
git commit -m "feat(logic-tree): logicTree のスキーマと型生成を足す"
```

---

## Task 2: 木の再構成（`tree.ts`）

**Files:**
- Create: `src/modules/logic-tree/tree.ts`
- Create: `src/modules/logic-tree/tree.test.ts`

**Interfaces:**
- Consumes: `TreeNode`（Task 1）／`computeRowKeys`（`@/core/row-keys`）
- Produces:
  ```ts
  export interface NodeTree {
    /** data.nodes の配列位置 */
    index: number
    /** 同一性の鍵（computeRowKeys の出力。ID 重複ファイルでも一意） */
    key: string
    id: string
    text: string
    children: NodeTree[]
  }
  export interface BuiltTree {
    roots: NodeTree[]
    /** 配列位置 → 深さ。根から到達できないノードは -1 */
    depths: number[]
    /** 配列位置 → 親の配列位置。ルートと到達不能ノードは null */
    parents: (number | null)[]
    /** 配列位置 → 子の配列位置（配列順） */
    children: number[][]
    /** 循環していて根から到達できないノードの配列位置（昇順） */
    unreachable: number[]
    /** parentId が実在しないノードの配列位置（昇順）。ルートとして扱われる */
    missingParent: number[]
  }
  export function buildTree(nodes: readonly TreeNode[]): BuiltTree
  ```

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/logic-tree/tree.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { TreeNode } from '@/types/logic-tree'
import { buildTree } from './tree'

const n = (id: string, parentId: string | null, text = ''): TreeNode => ({ id, parentId, text })

const ID = {
  a: 'node_aaaaaaaaaa',
  b: 'node_bbbbbbbbbb',
  c: 'node_cccccccccc',
  d: 'node_dddddddddd',
}

describe('buildTree', () => {
  it('空の配列から空の結果を返す', () => {
    const t = buildTree([])
    expect(t.roots).toEqual([])
    expect(t.unreachable).toEqual([])
  })

  it('親子を組み立てる', () => {
    const t = buildTree([n(ID.a, null), n(ID.b, ID.a), n(ID.c, ID.a)])
    expect(t.roots.map((r) => r.id)).toEqual([ID.a])
    expect(t.roots[0].children.map((c) => c.id)).toEqual([ID.b, ID.c])
    expect(t.depths).toEqual([0, 1, 1])
    expect(t.parents).toEqual([null, 0, 0])
    expect(t.children).toEqual([[1, 2], [], []])
  })

  it('兄弟の順は配列の出現順で決まる（配列順が正）', () => {
    // 親より後ろに並んでいなくても、同じ親を持つ2件の相対順だけが効く
    const t = buildTree([n(ID.c, ID.a), n(ID.a, null), n(ID.b, ID.a)])
    expect(t.roots[0].children.map((c) => c.id)).toEqual([ID.c, ID.b])
  })

  it('循環しているノードは到達不能として分離する（無限ループしない）', () => {
    const t = buildTree([n(ID.a, ID.b), n(ID.b, ID.a)])
    expect(t.roots).toEqual([])
    expect(t.unreachable).toEqual([0, 1])
    expect(t.depths).toEqual([-1, -1])
  })

  it('自分自身を親にしているノードも到達不能になる', () => {
    const t = buildTree([n(ID.a, null), n(ID.b, ID.b)])
    expect(t.roots.map((r) => r.id)).toEqual([ID.a])
    expect(t.unreachable).toEqual([1])
  })

  it('parentId が実在しないノードはルートとして扱い、位置を記録する', () => {
    // 消えると原因が画面から読み取れなくなるので、握りつぶさず必ず描く
    const t = buildTree([n(ID.a, null), n(ID.b, ID.d)])
    expect(t.roots.map((r) => r.id)).toEqual([ID.a, ID.b])
    expect(t.missingParent).toEqual([1])
  })

  it('ルートが複数あってもすべて返す', () => {
    const t = buildTree([n(ID.a, null), n(ID.b, null)])
    expect(t.roots.map((r) => r.id)).toEqual([ID.a, ID.b])
  })

  it('ID が重複していても key で区別できる', () => {
    const t = buildTree([n(ID.a, null), n(ID.a, null)])
    expect(t.roots.map((r) => r.key)).toEqual([`${ID.a}#0`, `${ID.a}#1`])
  })

  it('ID が重複しているとき、その ID を親に指すノードは先に現れた方に付く', () => {
    // 曖昧さは残るが挙動は決めておく（重複自体は整合性検証が赤で見せる）
    const t = buildTree([n(ID.a, null), n(ID.a, null), n(ID.b, ID.a)])
    expect(t.roots[0].children.map((c) => c.id)).toEqual([ID.b])
    expect(t.roots[1].children).toEqual([])
  })
})
```

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/tree.test.ts
```

期待: FAIL（`./tree` が存在しない）

- [ ] **Step 3: 実装する**

`src/modules/logic-tree/tree.ts`:

```ts
import { computeRowKeys } from '@/core/row-keys'
import type { TreeNode } from '@/types/logic-tree'

/**
 * 平坦な nodes 配列から組み立てた木。**同一性の鍵は id ではなく key**
 *（ID 重複ファイルを「受け入れて赤表示」する以上、id では一意にならず、
 *  レイアウトの戻り値 Map<キー, 座標> が2ノードで衝突する）
 */
export interface NodeTree {
  index: number
  key: string
  id: string
  text: string
  children: NodeTree[]
}

export interface BuiltTree {
  roots: NodeTree[]
  depths: number[]
  parents: (number | null)[]
  children: number[][]
  unreachable: number[]
  missingParent: number[]
}

/**
 * 平坦な配列を木に戻す（純関数・DOM 非依存）。
 *
 * **全域であること**が要件。壊れたファイル（循環・多重ルート・参照切れ）は
 * 受け入れて開くのがこのアプリの方針（rev 5章）なので、この関数の後段に
 * ある測定・レイアウト・描画には「循環の無い木」しか渡さない。循環の検出に
 * 専用のアルゴリズムは要らない——**根から到達できなかったノードが、
 * そのまま循環している集合**である（循環内のノードは必ず循環内のノードを
 * 親に持つので、根からは辿り着けない）。
 */
export function buildTree(nodes: readonly TreeNode[]): BuiltTree {
  const keys = computeRowKeys(nodes)
  // 同じ id が2件あるときは先に現れた方を親とする（曖昧さは残るが挙動は決める）
  const firstIndexById = new Map<string, number>()
  nodes.forEach((node, i) => {
    if (!firstIndexById.has(node.id)) firstIndexById.set(node.id, i)
  })

  const parents: (number | null)[] = []
  const children: number[][] = nodes.map(() => [])
  const rootIndices: number[] = []
  const missingParent: number[] = []

  nodes.forEach((node, i) => {
    if (node.parentId === null) {
      parents[i] = null
      rootIndices.push(i)
      return
    }
    const p = firstIndexById.get(node.parentId)
    if (p === undefined) {
      // 参照切れ。消さずにルートとして描き、位置を記録して赤表示に回す
      parents[i] = null
      rootIndices.push(i)
      missingParent.push(i)
      return
    }
    parents[i] = p
    children[p].push(i)
  })

  const depths: number[] = nodes.map(() => -1)
  const build = (index: number, depth: number): NodeTree => {
    depths[index] = depth
    return {
      index,
      key: keys[index],
      id: nodes[index].id,
      text: nodes[index].text,
      // 循環は根から到達できないのでここには来ないが、
      // 万一に備えて訪問済みは辿らない（depths で判定できる）
      children: children[index]
        .filter((c) => depths[c] === -1)
        .map((c) => build(c, depth + 1)),
    }
  }
  const roots = rootIndices.map((i) => build(i, 0))

  const unreachable: number[] = []
  depths.forEach((d, i) => {
    if (d === -1) unreachable.push(i)
  })

  return { roots, depths, parents, children, unreachable, missingParent }
}
```

- [ ] **Step 4: 実行して緑になることを確認する**

```bash
npx vitest run src/modules/logic-tree/tree.test.ts
```

期待: このファイルの `it` がすべて緑

- [ ] **Step 5: 「守っていないテスト」でないことを確かめる**

`buildTree` の `children[index].filter((c) => depths[c] === -1)` を `children[index]` に戻して、循環のテストが**落ちないこと**を確認する（落ちないのが正しい——循環は根から到達しないので、この filter は保険であって循環検出の本体ではない）。確認したら戻す。

そのうえで `rootIndices.push(i)`（参照切れの分岐）を消し、`parentId が実在しないノード` のテストが落ちることを確認してから戻す。

- [ ] **Step 6: 全体を回してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/modules/logic-tree/tree.ts src/modules/logic-tree/tree.test.ts
git commit -m "feat(logic-tree): 平坦な nodes から木を再構成する"
```

---

## Task 3: 整合性検証（`consistency.ts`）

**Files:**
- Create: `src/modules/logic-tree/consistency.ts`
- Create: `src/modules/logic-tree/consistency.test.ts`

**Interfaces:**
- Consumes: `buildTree`（Task 2）／`ConsistencyIssue`・`ConsistencyLocation`（`@/core/consistency`）
- Produces: `checkLogicTreeConsistency(data: LogicTreeSchemaVersion1): ConsistencyIssue[]`
  - ルール識別子は `duplicate-id` / `cyclic-parent` / `multiple-root` / `missing-parent` の4つ。**この文字列は安定させる**（テストと UI が参照する）

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/logic-tree/consistency.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { LogicTreeSchemaVersion1, TreeNode } from '@/types/logic-tree'
import { checkLogicTreeConsistency } from './consistency'

const ID = {
  a: 'node_aaaaaaaaaa',
  b: 'node_bbbbbbbbbb',
  c: 'node_cccccccccc',
  missing: 'node_zzzzzzzzzz',
}

const file = (nodes: TreeNode[]): LogicTreeSchemaVersion1 => ({
  schemaVersion: 1,
  type: 'logicTree',
  title: 'テスト',
  nodes,
})

const rules = (nodes: TreeNode[]): string[] =>
  checkLogicTreeConsistency(file(nodes)).map((i) => i.rule)

describe('checkLogicTreeConsistency', () => {
  it('正しい木では指摘が出ない', () => {
    expect(
      rules([
        { id: ID.a, parentId: null, text: '退会できない' },
        { id: ID.b, parentId: ID.a, text: '導線が分からない' },
      ]),
    ).toEqual([])
  })

  it('ノード0件は正常（新規作成直後）', () => {
    expect(rules([])).toEqual([])
  })

  it('ID の重複を指摘する', () => {
    expect(
      rules([
        { id: ID.a, parentId: null, text: 'x' },
        { id: ID.a, parentId: null, text: 'y' },
      ]),
    ).toContain('duplicate-id')
  })

  it('ID 重複の locations は重複した全件の配列位置を指す', () => {
    const issues = checkLogicTreeConsistency(
      file([
        { id: ID.a, parentId: null, text: 'x' },
        { id: ID.a, parentId: null, text: 'y' },
      ]),
    )
    const dup = issues.find((i) => i.rule === 'duplicate-id')
    expect(dup?.locations.map((l) => l.entityIndex)).toEqual([0, 1])
  })

  it('循環を指摘する', () => {
    expect(
      rules([
        { id: ID.a, parentId: ID.b, text: 'x' },
        { id: ID.b, parentId: ID.a, text: 'y' },
      ]),
    ).toContain('cyclic-parent')
  })

  it('ルートが2つ以上あることを指摘する', () => {
    expect(
      rules([
        { id: ID.a, parentId: null, text: 'x' },
        { id: ID.b, parentId: null, text: 'y' },
      ]),
    ).toContain('multiple-root')
  })

  it('ルートが1つなら指摘しない', () => {
    expect(rules([{ id: ID.a, parentId: null, text: 'x' }])).toEqual([])
  })

  it('親が実在しないことを指摘する', () => {
    const got = rules([
      { id: ID.a, parentId: null, text: 'x' },
      { id: ID.b, parentId: ID.missing, text: 'y' },
    ])
    expect(got).toContain('missing-parent')
    // 参照切れのノードはルート扱いになるので多重ルートも同時に出る。
    // 両方出ることが正しい（片方だけ直しても図は1本にならない）
    expect(got).toContain('multiple-root')
  })

  it('親が実在しないノードの locations は parentId のセルを指す', () => {
    const issues = checkLogicTreeConsistency(
      file([
        { id: ID.a, parentId: null, text: 'x' },
        { id: ID.b, parentId: ID.missing, text: 'y' },
      ]),
    )
    const miss = issues.find((i) => i.rule === 'missing-parent')
    expect(miss?.locations).toEqual([{ entityId: ID.b, entityIndex: 1, field: 'parentId' }])
  })

  it('メッセージは日本語で、どのノードの話か分かる', () => {
    const issues = checkLogicTreeConsistency(
      file([
        { id: ID.a, parentId: null, text: '退会できない' },
        { id: ID.b, parentId: null, text: '解約できない' },
      ]),
    )
    expect(issues[0].message).toContain('退会できない')
    expect(issues[0].message).toContain('解約できない')
  })
})
```

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/consistency.test.ts
```

期待: FAIL（`./consistency` が存在しない）

- [ ] **Step 3: 実装する**

`src/modules/logic-tree/consistency.ts`:

```ts
import type { ConsistencyIssue, ConsistencyLocation } from '@/core/consistency'
import type { LogicTreeSchemaVersion1, TreeNode } from '@/types/logic-tree'
import { buildTree } from './tree'

/** 文言でノードを指す。空のノードは配列位置で呼ぶ（「（未記入）」だけだと区別できない） */
function label(node: TreeNode, index: number): string {
  return node.text.trim() === '' ? `（未記入・${index + 1}番目）` : `「${node.text}」`
}

function at(nodes: readonly TreeNode[], index: number, field: string): ConsistencyLocation {
  return { entityId: nodes[index].id, entityIndex: index, field }
}

/**
 * ロジックツリーのモジュール内検証（規約4。rev 6章の責務内訳の「モジュール内」側）。
 *
 * locations は配列位置（entityIndex）でノードを指す。ID 重複ファイルを
 * 「受け入れて赤表示」する以上、entityId だけでは一意に特定できない。
 */
export function checkLogicTreeConsistency(data: LogicTreeSchemaVersion1): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const nodes = data.nodes
  const built = buildTree(nodes)

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）
  const byId = new Map<string, number[]>()
  nodes.forEach((node, i) => byId.set(node.id, [...(byId.get(node.id) ?? []), i]))
  for (const [id, group] of byId) {
    if (group.length > 1) {
      issues.push({
        rule: 'duplicate-id',
        message: `ID が重複しています（${group.length}件）: ${id}`,
        locations: group.map((i) => at(nodes, i, 'id')),
      })
    }
  }

  // 循環（＝根から到達できないノード）。図に描かれないので、ここで見せないと
  // 「ファイルにあるのに画面に無い」ノードが黙って生まれる
  if (built.unreachable.length > 0) {
    issues.push({
      rule: 'cyclic-parent',
      message: `親子関係が循環しているノードがあります（${built.unreachable.length}件。図には表示されません）: ${built.unreachable
        .map((i) => label(nodes[i], i))
        .join('、')}`,
      locations: built.unreachable.map((i) => at(nodes, i, 'parentId')),
    })
  }

  // 参照切れ。ルートとして描かれるため、下の multiple-root も同時に立つ
  if (built.missingParent.length > 0) {
    issues.push({
      rule: 'missing-parent',
      message: `親が見つからないノードがあります（${built.missingParent.length}件）: ${built.missingParent
        .map((i) => label(nodes[i], i))
        .join('、')}`,
      locations: built.missingParent.map((i) => at(nodes, i, 'parentId')),
    })
  }

  // ルートの単一性。0件は正常な状態（新規作成直後）
  if (built.roots.length > 1) {
    issues.push({
      rule: 'multiple-root',
      message: `ルートが${built.roots.length}件あります（1本の木にしてください）: ${built.roots
        .map((r) => label(nodes[r.index], r.index))
        .join('、')}`,
      locations: built.roots.map((r) => at(nodes, r.index, 'parentId')),
    })
  }

  return issues
}
```

- [ ] **Step 4: 実行して緑になることを確認する**

```bash
npx vitest run src/modules/logic-tree/consistency.test.ts
```

期待: このファイルの `it` がすべて緑

- [ ] **Step 5: 4ルールそれぞれが「守っている」ことを確かめる**

4つの `issues.push` を1つずつコメントアウトして、対応するテストが落ちることを確認してから戻す。**4回とも落ちること。** 落ちないルールがあれば、そのテストは別の事象を見ている。

- [ ] **Step 6: 全体を回してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/modules/logic-tree/consistency.ts src/modules/logic-tree/consistency.test.ts
git commit -m "feat(logic-tree): 整合性検証（ID重複・循環・多重ルート・参照切れ）"
```

---

## Task 4: 測定層（`measure.ts`）

**Files:**
- Create: `src/modules/logic-tree/measure.ts`
- Create: `src/modules/logic-tree/measure.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MeasureWidth = (text: string) => number
  export interface WrappedText { lines: string[]; width: number; height: number }
  export const NODE_MAX_WIDTH: 320
  export const NODE_MIN_WIDTH: 96
  export const NODE_PADDING_X: 10
  export const NODE_PADDING_Y: 6
  export const NODE_BORDER: 1
  export const NODE_INSET_X: number    // = NODE_PADDING_X + NODE_BORDER
  export const NODE_INSET_Y: number    // = NODE_PADDING_Y + NODE_BORDER
  export const NODE_BOX_CLASS: string  // 上の定数に対応する Tailwind クラス
  export function wrapText(text: string, measure: MeasureWidth, lineHeight: number): WrappedText
  export function createEstimateMeasurer(fontSize: number): MeasureWidth
  ```

**この層の要点:** 幅の測り方（`MeasureWidth`）を**引数で受け取る**ので、この関数は DOM を一切触らない。本番は canvas の `measureText`、テストは決定的な概算器を渡す。

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/logic-tree/measure.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  createEstimateMeasurer,
  NODE_INSET_X,
  NODE_INSET_Y,
  NODE_MAX_WIDTH,
  NODE_MIN_WIDTH,
  wrapText,
} from './measure'

/** 半角=5px / 全角=10px の測定器。境界の計算を暗算できる値にする */
const measure = createEstimateMeasurer(10)
const LH = 20
const CONTENT_MAX = NODE_MAX_WIDTH - NODE_INSET_X * 2

describe('wrapText', () => {
  it('空文字は1行・最小幅になる', () => {
    const r = wrapText('', measure, LH)
    expect(r.lines).toEqual([''])
    expect(r.width).toBe(NODE_MIN_WIDTH)
    expect(r.height).toBe(LH + NODE_INSET_Y * 2)
  })

  it('最大幅に収まる文言は折り返さない', () => {
    const r = wrapText('あいうえお', measure, LH)
    expect(r.lines).toEqual(['あいうえお'])
    expect(r.height).toBe(LH + NODE_INSET_Y * 2)
  })

  it('幅は文言から算出し、最小幅を下回らない', () => {
    // 全角5文字 = 50px < NODE_MIN_WIDTH
    expect(wrapText('あいうえお', measure, LH).width).toBe(NODE_MIN_WIDTH)
  })

  it('最大幅を超えたら折り返し、幅は最大で止まる', () => {
    const perLine = Math.floor(CONTENT_MAX / 10)
    const r = wrapText('あ'.repeat(perLine + 3), measure, LH)
    expect(r.lines.length).toBe(2)
    expect(r.lines[0].length).toBe(perLine)
    expect(r.lines[1].length).toBe(3)
    expect(r.width).toBeLessThanOrEqual(NODE_MAX_WIDTH)
    expect(r.height).toBe(LH * 2 + NODE_INSET_Y * 2)
  })

  it('折り返した各行は、内容の幅の上限に収まる', () => {
    const r = wrapText('あ'.repeat(80), measure, LH)
    for (const line of r.lines) expect(measure(line)).toBeLessThanOrEqual(CONTENT_MAX)
  })

  it('明示改行で行を分ける', () => {
    const r = wrapText('承認\n却下\n差し戻し', measure, LH)
    expect(r.lines).toEqual(['承認', '却下', '差し戻し'])
    expect(r.height).toBe(LH * 3 + NODE_INSET_Y * 2)
  })

  it('連続した改行は空行として残す', () => {
    expect(wrapText('あ\n\nい', measure, LH).lines).toEqual(['あ', '', 'い'])
  })

  it('単語の途中でも折り返す（日本語向けの break-all と同じ規則）', () => {
    const perLine = Math.floor(CONTENT_MAX / 5)
    expect(wrapText('a'.repeat(perLine + 2), measure, LH).lines.length).toBe(2)
  })

  it('1文字で最大幅を超えても、その1文字だけの行を作る（無限ループしない）', () => {
    const huge = (t: string): number => t.length * (CONTENT_MAX + 50)
    expect(wrapText('あい', huge, LH).lines).toEqual(['あ', 'い'])
  })

  it('サロゲートペアを割らない', () => {
    expect(wrapText('𩸽', measure, LH).lines).toEqual(['𩸽'])
  })

  it('同じ入力からは同じ結果が出る（純関数）', () => {
    expect(wrapText('あ'.repeat(50), measure, LH)).toEqual(wrapText('あ'.repeat(50), measure, LH))
  })
})

describe('createEstimateMeasurer', () => {
  it('半角は全角の半分の幅にする', () => {
    const m = createEstimateMeasurer(14)
    expect(m('ab')).toBe(14)
    expect(m('あい')).toBe(28)
  })
})
```

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/measure.test.ts
```

期待: FAIL（`./measure` が存在しない）

- [ ] **Step 3: 実装する**

`src/modules/logic-tree/measure.ts`:

```ts
/**
 * 測定層（DOM 非依存・純関数）。
 *
 * レイアウト計算には各ノードの幅と高さが必要だが、高さは折り返し行数で決まり、
 * 行数は幅で決まる。「描画 → 実測 → レイアウト → 再描画」の2パスにすると
 * Enter のたびに一瞬ずれた位置に出てから飛ぶ。ここで**同期的に**確定させて
 * 「入力 → サイズ計算 → レイアウト → 一度だけ描画」の1パスにする。
 *
 * **幅の測り方は引数で受け取る。** 本番は canvas の measureText（node-font.ts）、
 * テストは決定的な概算器。この関数自体は DOM を知らない。
 */

/** ノード矩形の最大幅。日本語で全角20文字前後（tech-notes 論点4） */
export const NODE_MAX_WIDTH = 320
/** ノード矩形の最小幅。空のノードが点にならないための下限 */
export const NODE_MIN_WIDTH = 96
export const NODE_PADDING_X = 10
export const NODE_PADDING_Y = 6
export const NODE_BORDER = 1

/**
 * 測定が使う内側の余白。**CSS の padding と border の合計と必ず一致させること。**
 * ここが実際より小さいと、ブラウザに与えられる幅が測定の前提より狭くなり、
 * 測定より多い行数に折り返して文字が切れる
 */
export const NODE_INSET_X = NODE_PADDING_X + NODE_BORDER
export const NODE_INSET_Y = NODE_PADDING_Y + NODE_BORDER

/**
 * 上の定数に対応する Tailwind クラス。**片方だけ変えないこと。**
 * px-2.5 = 10px ／ py-1.5 = 6px ／ border = 1px
 */
export const NODE_BOX_CLASS = 'border px-2.5 py-1.5'

export type MeasureWidth = (text: string) => number

export interface WrappedText {
  /** 折り返し後の行。**描画側と同じフォント指定を前提に確定させてある** */
  lines: string[]
  /** ノード矩形の幅（余白込み） */
  width: number
  /** ノード矩形の高さ（余白込み） */
  height: number
}

/**
 * 文言を折り返してノード矩形の寸法を出す。
 *
 * 折り返しは**コードポイント単位のグリーディ**で、CSS の `word-break: break-all`
 * と同じ規則。日本語は任意位置で折り返せるので単語単位にする意味がなく、
 * 単語単位にすると測定層とブラウザの判断がずれる。
 *
 * 幅は各行の実測の最大値を切り上げて使う。**切り上げているので、描画側に
 * 渡る内容幅は測定時の前提以上になり、ブラウザが測定より早く折り返すことはない**
 *（遅く折り返して行数が減る方向は、余白が1行分増えるだけで文字は切れない）。
 */
export function wrapText(text: string, measure: MeasureWidth, lineHeight: number): WrappedText {
  const maxContent = NODE_MAX_WIDTH - NODE_INSET_X * 2
  const lines: string[] = []
  for (const segment of text.split('\n')) {
    let line = ''
    // for...of は文字列をコードポイント単位で回す（サロゲートペアを割らない）
    for (const ch of segment) {
      if (line === '') {
        line = ch
        continue
      }
      if (measure(line + ch) > maxContent) {
        lines.push(line)
        line = ch
      } else {
        line += ch
      }
    }
    lines.push(line)
  }
  const contentWidth = lines.reduce((w, line) => Math.max(w, measure(line)), 0)
  const width = Math.min(
    NODE_MAX_WIDTH,
    Math.max(NODE_MIN_WIDTH, Math.ceil(contentWidth) + NODE_INSET_X * 2),
  )
  const height = Math.ceil(lines.length * lineHeight) + NODE_INSET_Y * 2
  return { lines, width, height }
}

/**
 * 測れない環境（jsdom には canvas が無い）用の概算。ASCII を半分の幅とみなす。
 * **本番では使わない**——等幅を前提にした計算が日本語で成立しないことが、
 * measureText を選んだ理由そのものである（tech-notes 論点4）
 */
export function createEstimateMeasurer(fontSize: number): MeasureWidth {
  return (text) => {
    let width = 0
    for (const ch of text) {
      width += ((ch.codePointAt(0) ?? 0) < 0x80 ? 0.5 : 1) * fontSize
    }
    return width
  }
}
```

- [ ] **Step 4: 実行して緑になることを確認する**

```bash
npx vitest run src/modules/logic-tree/measure.test.ts
```

期待: このファイルの `it` がすべて緑

- [ ] **Step 5: 折り返しが「守られている」ことを確かめる**

`measure(line + ch) > maxContent` を `measure(line + ch) > maxContent * 2` に書き換えて、折り返し系のテストが落ちることを確認してから戻す。

- [ ] **Step 6: 全体を回してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/modules/logic-tree/measure.ts src/modules/logic-tree/measure.test.ts
git commit -m "feat(logic-tree): 測定層（折り返しとノード寸法の算出）"
```

---

## Task 5: レイアウト層（`layout.ts`）

**Files:**
- Create: `src/modules/logic-tree/layout.ts`
- Create: `src/modules/logic-tree/layout.test.ts`

**Interfaces:**
- Consumes: `NodeTree`（Task 2）
- Produces:
  ```ts
  export interface Size { width: number; height: number }
  export interface Point { x: number; y: number }
  export interface LayoutResult {
    positions: Map<string, Point>  // キーは NodeTree.key
    width: number                  // 全ノードを含む矩形の幅
    height: number
  }
  export const COLUMN_GAP: 48
  export const SIBLING_GAP: 12
  export function layoutTree(roots: readonly NodeTree[], sizes: ReadonlyMap<string, Size>): LayoutResult
  ```

**アルゴリズム:** 横向き（親が左・子が右）の Reingold–Tilford 系。`x` は**深さごとの列**で決める（その深さの最大幅 ＋ `COLUMN_GAP` を積み上げる）ので、兄弟部分木の衝突は同じ深さどうしでしか起きない。したがって輪郭（contour）は**深さごとの上端・下端の配列**で足り、次の兄弟部分木は「全深さで下端＋`SIBLING_GAP` を下回らない最小の移動量」だけ下げれば衝突しない。

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/logic-tree/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { TreeNode } from '@/types/logic-tree'
import { buildTree, type NodeTree } from './tree'
import { COLUMN_GAP, layoutTree, SIBLING_GAP, type LayoutResult, type Size } from './layout'

const ID = (n: number): string => `node_${String(n).padStart(10, 'a')}`
const KEY = (n: number): string => `${ID(n)}#0`

/** id/parentId を数字で書けるようにする小道具 */
const flat = (spec: [number, number | null][]): TreeNode[] =>
  spec.map(([id, parent]) => ({
    id: ID(id),
    parentId: parent === null ? null : ID(parent),
    text: '',
  }))

/** すべてのノードを 100x30 とみなすサイズ表 */
function uniformSizes(nodes: TreeNode[]): Map<string, Size> {
  const out = new Map<string, Size>()
  const walk = (n: NodeTree): void => {
    out.set(n.key, { width: 100, height: 30 })
    for (const c of n.children) walk(c)
  }
  for (const r of buildTree(nodes).roots) walk(r)
  return out
}

function run(nodes: TreeNode[], sizes: ReadonlyMap<string, Size>): LayoutResult {
  return layoutTree(buildTree(nodes).roots, sizes)
}

/** どの2つのノード矩形も重ならないことを検査する（レイアウトの一番の失敗） */
function expectNoOverlap(result: LayoutResult, sizes: ReadonlyMap<string, Size>): void {
  const rects = [...result.positions].map(([key, p]) => ({
    key,
    left: p.x,
    top: p.y,
    right: p.x + (sizes.get(key)?.width ?? 0),
    bottom: p.y + (sizes.get(key)?.height ?? 0),
  }))
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]
      const b = rects[j]
      const overlaps = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      expect(overlaps, `${a.key} と ${b.key} が重なっている`).toBe(false)
    }
  }
}

describe('layoutTree', () => {
  it('ノードが無ければ空の結果を返す', () => {
    const r = layoutTree([], new Map())
    expect(r.positions.size).toBe(0)
    expect(r.width).toBe(0)
    expect(r.height).toBe(0)
  })

  it('1ノードは原点に置き、全体の大きさはそのノードの大きさになる', () => {
    const nodes = flat([[1, null]])
    const r = run(nodes, uniformSizes(nodes))
    expect(r.positions.get(KEY(1))).toEqual({ x: 0, y: 0 })
    expect(r.width).toBe(100)
    expect(r.height).toBe(30)
  })

  it('子は親の右の列に置く（列の間隔は COLUMN_GAP）', () => {
    const nodes = flat([[1, null], [2, 1]])
    expect(run(nodes, uniformSizes(nodes)).positions.get(KEY(2))?.x).toBe(100 + COLUMN_GAP)
  })

  it('同じ深さのノードは列が揃う', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1]])
    const r = run(nodes, uniformSizes(nodes))
    expect(r.positions.get(KEY(2))?.x).toBe(r.positions.get(KEY(3))?.x)
  })

  it('列の幅はその深さの最大幅で決まる', () => {
    const nodes = flat([[1, null], [2, 1]])
    const sizes = uniformSizes(nodes)
    sizes.set(KEY(1), { width: 200, height: 30 })
    expect(run(nodes, sizes).positions.get(KEY(2))?.x).toBe(200 + COLUMN_GAP)
  })

  it('兄弟は SIBLING_GAP だけ空けて縦に並ぶ', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1]])
    const r = run(nodes, uniformSizes(nodes))
    expect((r.positions.get(KEY(3))?.y ?? 0) - (r.positions.get(KEY(2))?.y ?? 0)).toBe(
      30 + SIBLING_GAP,
    )
  })

  it('親は最初の子と最後の子の中心に来る', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1]])
    const r = run(nodes, uniformSizes(nodes))
    const first = (r.positions.get(KEY(2))?.y ?? 0) + 15
    const last = (r.positions.get(KEY(3))?.y ?? 0) + 15
    expect((r.positions.get(KEY(1))?.y ?? 0) + 15).toBeCloseTo((first + last) / 2)
  })

  it('孫を持つ兄弟部分木どうしが重ならない', () => {
    // 輪郭を持たない素朴な実装がここで必ず壊れる
    const nodes = flat([
      [1, null],
      [2, 1], [4, 2], [5, 2], [6, 2],
      [3, 1], [7, 3], [8, 3], [9, 3],
    ])
    const sizes = uniformSizes(nodes)
    expectNoOverlap(run(nodes, sizes), sizes)
  })

  it('高さがばらばらでも重ならない', () => {
    const nodes = flat([
      [1, null],
      [2, 1], [4, 2], [5, 2],
      [3, 1], [6, 3], [7, 3],
    ])
    const sizes = uniformSizes(nodes)
    sizes.set(KEY(4), { width: 100, height: 120 })
    sizes.set(KEY(3), { width: 100, height: 90 })
    expectNoOverlap(run(nodes, sizes), sizes)
  })

  it('ルートが複数あっても縦に積んで重ならない', () => {
    const nodes = flat([[1, null], [2, 1], [3, null], [4, 3]])
    const sizes = uniformSizes(nodes)
    expectNoOverlap(run(nodes, sizes), sizes)
  })

  it('すべての座標が 0 以上に正規化される', () => {
    // 親が子より高いと内部座標が負になる。描画前にここで揃える
    const nodes = flat([[1, null], [2, 1]])
    const sizes = uniformSizes(nodes)
    sizes.set(KEY(1), { width: 100, height: 200 })
    for (const p of run(nodes, sizes).positions.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('全体の大きさは全ノードを含む', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1]])
    const sizes = uniformSizes(nodes)
    const r = run(nodes, sizes)
    for (const [key, p] of r.positions) {
      expect(p.x + (sizes.get(key)?.width ?? 0)).toBeLessThanOrEqual(r.width)
      expect(p.y + (sizes.get(key)?.height ?? 0)).toBeLessThanOrEqual(r.height)
    }
  })

  it('同じ入力からは同じ出力が出る（純関数）', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1], [4, 2]])
    const sizes = uniformSizes(nodes)
    expect([...run(nodes, sizes).positions]).toEqual([...run(nodes, sizes).positions])
  })

  it('サイズ表に無いノードでも落ちない', () => {
    const nodes = flat([[1, null], [2, 1]])
    expect(run(nodes, new Map()).positions.size).toBe(2)
  })
})
```

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/layout.test.ts
```

期待: FAIL（`./layout` が存在しない）

- [ ] **Step 3: 実装する**

`src/modules/logic-tree/layout.ts`:

```ts
import type { NodeTree } from './tree'

export interface Size {
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export interface LayoutResult {
  /** NodeTree.key → 座標 */
  positions: Map<string, Point>
  width: number
  height: number
}

/** 列（深さ）どうしの間隔 */
export const COLUMN_GAP = 48
/** 兄弟の部分木どうしの最小の空き */
export const SIBLING_GAP = 12

/** 部分木を配置した中間結果。y は「その部分木の内部座標」で、負の値も取る */
interface Placed {
  ys: Map<string, number>
  /** 相対深さ d における上端 */
  top: number[]
  /** 相対深さ d における下端 */
  bottom: number[]
}

function sizeOf(sizes: ReadonlyMap<string, Size>, key: string): Size {
  return sizes.get(key) ?? { width: 0, height: 0 }
}

/** 深さごとの最大幅を積み上げて、各深さの x を決める */
function columnXs(roots: readonly NodeTree[], sizes: ReadonlyMap<string, Size>): number[] {
  const maxWidth: number[] = []
  const walk = (node: NodeTree, depth: number): void => {
    maxWidth[depth] = Math.max(maxWidth[depth] ?? 0, sizeOf(sizes, node.key).width)
    for (const child of node.children) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)
  const xs: number[] = []
  let acc = 0
  for (let d = 0; d < maxWidth.length; d++) {
    xs[d] = acc
    acc += maxWidth[d] + COLUMN_GAP
  }
  return xs
}

function shiftPlaced(p: Placed, dy: number): void {
  if (dy === 0) return
  for (const [key, y] of p.ys) p.ys.set(key, y + dy)
  for (let d = 0; d < p.top.length; d++) {
    p.top[d] += dy
    p.bottom[d] += dy
  }
}

/** b は必ず a の下に置かれた後で呼ばれる */
function mergePlaced(a: Placed, b: Placed): Placed {
  const ys = new Map(a.ys)
  for (const [key, y] of b.ys) ys.set(key, y)
  const len = Math.max(a.top.length, b.top.length)
  const top: number[] = []
  const bottom: number[] = []
  for (let d = 0; d < len; d++) {
    if (d >= a.top.length) {
      top[d] = b.top[d]
      bottom[d] = b.bottom[d]
    } else if (d >= b.top.length) {
      top[d] = a.top[d]
      bottom[d] = a.bottom[d]
    } else {
      top[d] = Math.min(a.top[d], b.top[d])
      bottom[d] = Math.max(a.bottom[d], b.bottom[d])
    }
  }
  return { ys, top, bottom }
}

/**
 * 兄弟の並びを詰める。**次の部分木を下げる量は、重なる全深さの中で
 * 一番きつい制約で決まる**——1つの深さだけ見ると、孫の代で衝突する
 */
function packSiblings(nodes: readonly NodeTree[], sizes: ReadonlyMap<string, Size>): Placed {
  let acc: Placed | null = null
  for (const node of nodes) {
    const p = placeSubtree(node, sizes)
    if (acc !== null) {
      let shift = 0
      const overlap = Math.min(acc.bottom.length, p.top.length)
      for (let d = 0; d < overlap; d++) {
        shift = Math.max(shift, acc.bottom[d] + SIBLING_GAP - p.top[d])
      }
      shiftPlaced(p, shift)
    }
    acc = acc === null ? p : mergePlaced(acc, p)
  }
  return acc ?? { ys: new Map(), top: [], bottom: [] }
}

function placeSubtree(node: NodeTree, sizes: ReadonlyMap<string, Size>): Placed {
  const height = sizeOf(sizes, node.key).height
  if (node.children.length === 0) {
    return { ys: new Map([[node.key, 0]]), top: [0], bottom: [height] }
  }
  const inner = packSiblings(node.children, sizes)
  const first = node.children[0]
  const last = node.children[node.children.length - 1]
  const firstCenter = (inner.ys.get(first.key) ?? 0) + sizeOf(sizes, first.key).height / 2
  const lastCenter = (inner.ys.get(last.key) ?? 0) + sizeOf(sizes, last.key).height / 2
  // 親は最初の子と最後の子の中心に置く（全子の平均ではない。平均だと
  // 子の数が偏ったときに、親から出る線が束の片側に寄って見える）
  const y = (firstCenter + lastCenter) / 2 - height / 2
  const ys = new Map(inner.ys)
  ys.set(node.key, y)
  // 子の輪郭は相対深さ1以降。自分の分を先頭に足す
  return { ys, top: [y, ...inner.top], bottom: [y + height, ...inner.bottom] }
}

/**
 * ツリーのレイアウト（**完全な純関数**）。
 *
 * 入力が同じなら出力が同じ、が保たれることで「図は導出」（rev 3章）が
 * コードレベルで担保される。**ここに「前回どこにあったか」の状態を
 * 混ぜないこと**——同じデータから違う図が出るようになった時点で思想が崩れる。
 *
 * x は深さごとの列で決める。列が揃うので兄弟部分木の衝突は同じ深さでしか
 * 起きず、輪郭は深さごとの上端・下端の配列で足りる。
 */
export function layoutTree(
  roots: readonly NodeTree[],
  sizes: ReadonlyMap<string, Size>,
): LayoutResult {
  const xs = columnXs(roots, sizes)
  const depths = new Map<string, number>()
  const walk = (node: NodeTree, depth: number): void => {
    depths.set(node.key, depth)
    for (const child of node.children) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)

  const packed = packSiblings(roots, sizes)
  const minY = packed.top.length > 0 ? Math.min(...packed.top) : 0

  const positions = new Map<string, Point>()
  let width = 0
  let height = 0
  for (const [key, y] of packed.ys) {
    const point = { x: xs[depths.get(key) ?? 0] ?? 0, y: y - minY }
    positions.set(key, point)
    const size = sizeOf(sizes, key)
    width = Math.max(width, point.x + size.width)
    height = Math.max(height, point.y + size.height)
  }
  return { positions, width, height }
}
```

- [ ] **Step 4: 実行して緑になることを確認する**

```bash
npx vitest run src/modules/logic-tree/layout.test.ts
```

期待: このファイルの `it` がすべて緑

- [ ] **Step 5: 輪郭が「守られている」ことを確かめる**

`packSiblings` の `for (let d = 0; d < overlap; d++)` を `for (let d = 0; d < 1; d++)`（自分の深さだけ見る）に書き換えて、**「孫を持つ兄弟部分木どうしが重ならない」が落ちること**を確認してから戻す。落ちなければ、そのテストは輪郭を検査していない。

- [ ] **Step 6: 全体を回してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/modules/logic-tree/layout.ts src/modules/logic-tree/layout.test.ts
git commit -m "feat(logic-tree): レイアウト層（可変サイズ対応の横向きツリー配置）"
```

---

## Task 6: 編集コマンド（`commands.ts`）

**Files:**
- Create: `src/modules/logic-tree/commands.ts`
- Create: `src/modules/logic-tree/commands.test.ts`

**Interfaces:**
- Consumes: `buildTree`（Task 2）／`insertAt`（`@/core/list-ops`）／`newId`（`@/core/new-id`）
- Produces:
  ```ts
  export interface EditResult {
    data: LogicTreeSchemaVersion1
    /** 操作後に編集させたいノードの配列位置。行き先が無いときは null */
    focusIndex: number | null
  }
  export function orderNodes(nodes: readonly TreeNode[]): TreeNode[]
  export function addRoot(data: LogicTreeSchemaVersion1): EditResult
  export function addChild(data: LogicTreeSchemaVersion1, parentIndex: number): EditResult
  export function addSiblingAfter(data: LogicTreeSchemaVersion1, index: number): EditResult
  export function deleteSubtree(data: LogicTreeSchemaVersion1, index: number): EditResult
  export function moveSibling(data: LogicTreeSchemaVersion1, index: number, delta: -1 | 1): EditResult
  export function setText(data: LogicTreeSchemaVersion1, index: number, text: string): LogicTreeSchemaVersion1
  ```

**この層の要点:**

- **`newId` は差し替えられるようにしない。** テストは戻り値の ID を `expect` せず、「増えた」「親が正しい」だけを見る（`src/core/new-id.test.ts` が採番自体を担保している）
- **構造を変える操作は必ず `orderNodes` を通す。** 配列を DFS 行きがけ順に保つことで、挿入位置が「参照ノードの部分木の直後」という1つの規則で表せる
- **`setText` だけは並べ替えない。** 打鍵のたびに配列が動くと、フォーカス中の配列位置が入力中にずれる

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/logic-tree/commands.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { LogicTreeSchemaVersion1, TreeNode } from '@/types/logic-tree'
import {
  addChild,
  addRoot,
  addSiblingAfter,
  deleteSubtree,
  moveSibling,
  orderNodes,
  setText,
} from './commands'

const ID = (n: number): string => `node_${String(n).padStart(10, 'a')}`

const flat = (spec: [number, number | null][]): TreeNode[] =>
  spec.map(([id, parent]) => ({
    id: ID(id),
    parentId: parent === null ? null : ID(parent),
    text: `n${id}`,
  }))

const file = (spec: [number, number | null][]): LogicTreeSchemaVersion1 => ({
  schemaVersion: 1,
  type: 'logicTree',
  title: 'テスト',
  nodes: flat(spec),
})

/** 配列を [id, 親id] の数字の組で読み出す（期待値を目で追えるようにする） */
const shape = (data: LogicTreeSchemaVersion1): string[] =>
  data.nodes.map((n) => `${n.id}<-${n.parentId ?? 'root'}`)

const at = (data: LogicTreeSchemaVersion1, index: number): TreeNode => data.nodes[index]

describe('orderNodes', () => {
  it('DFS 行きがけ順に並べ替える', () => {
    // 1 -(2 -(4), 3)
    const nodes = flat([[4, 2], [3, 1], [1, null], [2, 1]])
    // 兄弟の相対順は元の配列順（3 が先、2 が後）を保つ
    expect(orderNodes(nodes).map((n) => n.id)).toEqual([ID(1), ID(3), ID(2), ID(4)])
  })

  it('すでに整っている配列は変えない', () => {
    const nodes = flat([[1, null], [2, 1], [3, 1]])
    expect(orderNodes(nodes).map((n) => n.id)).toEqual([ID(1), ID(2), ID(3)])
  })

  it('循環して到達できないノードは末尾に元の順で残す（消さない）', () => {
    const nodes = flat([[2, 3], [1, null], [3, 2]])
    const out = orderNodes(nodes)
    expect(out.map((n) => n.id)).toEqual([ID(1), ID(2), ID(3)])
    expect(out.length).toBe(3)
  })

  it('ノードを取りこぼさない', () => {
    const nodes = flat([[1, null], [2, 1], [3, 2], [4, null]])
    expect(orderNodes(nodes).length).toBe(4)
  })
})

describe('addRoot', () => {
  it('空のファイルに最初のノードを作る', () => {
    const r = addRoot(file([]))
    expect(r.data.nodes.length).toBe(1)
    expect(r.data.nodes[0].parentId).toBe(null)
    expect(r.data.nodes[0].text).toBe('')
    expect(r.focusIndex).toBe(0)
  })

  it('採番した ID は ID 規約に従う', () => {
    expect(addRoot(file([])).data.nodes[0].id).toMatch(/^node_[A-Za-z0-9]{10}$/)
  })
})

describe('addChild', () => {
  it('子を末尾に足す', () => {
    const r = addChild(file([[1, null], [2, 1]]), 0)
    expect(r.data.nodes.length).toBe(3)
    // 末尾の子なので、既存の子 2 より後ろに入る
    expect(r.focusIndex).toBe(2)
    expect(at(r.data, 2).parentId).toBe(ID(1))
    expect(shape(r.data).slice(0, 2)).toEqual([`${ID(1)}<-root`, `${ID(2)}<-${ID(1)}`])
  })

  it('孫がいる子の後ろに入る（部分木の直後）', () => {
    // 1 -(2 -(3))
    const r = addChild(file([[1, null], [2, 1], [3, 2]]), 0)
    expect(r.focusIndex).toBe(3)
    expect(at(r.data, 3).parentId).toBe(ID(1))
  })

  it('葉に子を足すと直後に入る', () => {
    const r = addChild(file([[1, null], [2, 1], [3, 1]]), 1)
    expect(r.focusIndex).toBe(2)
    expect(at(r.data, 2).parentId).toBe(ID(2))
  })

  it('範囲外の位置では何も起きない', () => {
    const before = file([[1, null]])
    const r = addChild(before, 5)
    expect(r.data).toBe(before)
    expect(r.focusIndex).toBe(null)
  })
})

describe('addSiblingAfter', () => {
  it('直後に兄弟を足す', () => {
    const r = addSiblingAfter(file([[1, null], [2, 1], [3, 1]]), 1)
    expect(r.focusIndex).toBe(2)
    expect(at(r.data, 2).parentId).toBe(ID(1))
    expect(at(r.data, 3).id).toBe(ID(3))
  })

  it('部分木を飛び越えて直後に入る', () => {
    // 1 -(2 -(4), 3)。2 の直後の兄弟は 4 の後ろ
    const r = addSiblingAfter(file([[1, null], [2, 1], [4, 2], [3, 1]]), 1)
    expect(r.focusIndex).toBe(3)
    expect(at(r.data, 3).parentId).toBe(ID(1))
    expect(at(r.data, 4).id).toBe(ID(3))
  })

  it('ルートの上では兄弟ではなく子を足す（多重ルートを作らない）', () => {
    const r = addSiblingAfter(file([[1, null]]), 0)
    expect(r.data.nodes.length).toBe(2)
    expect(at(r.data, 1).parentId).toBe(ID(1))
    expect(r.data.nodes.filter((n) => n.parentId === null).length).toBe(1)
  })
})

describe('deleteSubtree', () => {
  it('子ごと消す', () => {
    // 1 -(2 -(4), 3)
    const r = deleteSubtree(file([[1, null], [2, 1], [4, 2], [3, 1]]), 1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3)])
  })

  it('消したら前の兄弟へフォーカスを移す', () => {
    const r = deleteSubtree(file([[1, null], [2, 1], [3, 1]]), 2)
    expect(at(r.data, r.focusIndex ?? -1).id).toBe(ID(2))
  })

  it('前の兄弟が無ければ親へ移す', () => {
    const r = deleteSubtree(file([[1, null], [2, 1], [3, 1]]), 1)
    expect(at(r.data, r.focusIndex ?? -1).id).toBe(ID(1))
  })

  it('最後の1件を消したら行き先は無い', () => {
    const r = deleteSubtree(file([[1, null]]), 0)
    expect(r.data.nodes).toEqual([])
    expect(r.focusIndex).toBe(null)
  })

  it('範囲外の位置では何も起きない', () => {
    const before = file([[1, null]])
    expect(deleteSubtree(before, 9).data).toBe(before)
  })
})

describe('moveSibling', () => {
  it('上へ動かす', () => {
    const r = moveSibling(file([[1, null], [2, 1], [3, 1]]), 2, -1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3), ID(2)])
    expect(at(r.data, r.focusIndex ?? -1).id).toBe(ID(3))
  })

  it('下へ動かす', () => {
    const r = moveSibling(file([[1, null], [2, 1], [3, 1]]), 1, 1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3), ID(2)])
    expect(at(r.data, r.focusIndex ?? -1).id).toBe(ID(2))
  })

  it('下へ動かすとき、部分木ごと相手を飛び越える', () => {
    // 1 -(2, 3 -(4))。2 を下へ ⇒ 3 とその子 4 の後ろに来る
    const r = moveSibling(file([[1, null], [2, 1], [3, 1], [4, 3]]), 1, 1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3), ID(4), ID(2)])
    expect(at(r.data, r.focusIndex ?? -1).id).toBe(ID(2))
  })

  it('自分の部分木ごと動く', () => {
    // 1 -(2 -(4), 3)。2 を下へ ⇒ 3 の後ろに 2 と 4 が並ぶ
    const r = moveSibling(file([[1, null], [2, 1], [4, 2], [3, 1]]), 1, 1)
    expect(r.data.nodes.map((n) => n.id)).toEqual([ID(1), ID(3), ID(2), ID(4)])
  })

  it('端では何も起きない', () => {
    const before = file([[1, null], [2, 1], [3, 1]])
    expect(moveSibling(before, 1, -1).data).toBe(before)
    expect(moveSibling(before, 2, 1).data).toBe(before)
  })

  it('親が違うノードとは入れ替わらない', () => {
    // 1 -(2 -(3))。3 は一人っ子なので上にも下にも動かない
    const before = file([[1, null], [2, 1], [3, 2]])
    expect(moveSibling(before, 2, -1).data).toBe(before)
  })
})

describe('setText', () => {
  it('文言を置き換える', () => {
    const r = setText(file([[1, null], [2, 1]]), 1, '導線が分からない')
    expect(r.nodes[1].text).toBe('導線が分からない')
  })

  it('配列の並びを動かさない（入力中に位置がずれない）', () => {
    const before = file([[1, null], [2, 1], [3, 1]])
    expect(setText(before, 1, 'x').nodes.map((n) => n.id)).toEqual(
      before.nodes.map((n) => n.id),
    )
  })

  it('元のデータを書き換えない', () => {
    const before = file([[1, null]])
    setText(before, 0, 'x')
    expect(before.nodes[0].text).toBe('n1')
  })
})
```

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/commands.test.ts
```

期待: FAIL（`./commands` が存在しない）

- [ ] **Step 3: 実装する**

`src/modules/logic-tree/commands.ts`:

```ts
import { insertAt } from '@/core/list-ops'
import { newId } from '@/core/new-id'
import type { LogicTreeSchemaVersion1, TreeNode } from '@/types/logic-tree'
import { buildTree, type BuiltTree, type NodeTree } from './tree'

export interface EditResult {
  data: LogicTreeSchemaVersion1
  /** 操作後に編集させたいノードの配列位置。行き先が無いときは null */
  focusIndex: number | null
}

function withNodes(
  data: LogicTreeSchemaVersion1,
  nodes: TreeNode[],
): LogicTreeSchemaVersion1 {
  return { ...data, nodes }
}

function newNode(parentId: string | null): TreeNode {
  return { id: newId('node'), parentId, text: '' }
}

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
export function orderNodes(nodes: readonly TreeNode[]): TreeNode[] {
  const built = buildTree(nodes)
  const out: TreeNode[] = []
  const walk = (node: NodeTree): void => {
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
function subtreeEnd(built: BuiltTree, index: number): number {
  const depth = built.depths[index]
  for (let j = index + 1; j < built.depths.length; j++) {
    if (built.depths[j] <= depth) return j
  }
  return built.depths.length
}

/** 兄弟（同じ親を持つノード）の配列位置を、並び順で返す */
function siblingsOf(built: BuiltTree, index: number): number[] {
  const parent = built.parents[index]
  return parent === null ? built.roots.map((r) => r.index) : built.children[parent]
}

/**
 * 並べ替えた配列の上で作業するための下ごしらえ。
 * **位置は参照の同一性で引き直す**——orderNodes で配列位置が動くため、
 * 呼び出し元が渡した index をそのまま使うと別のノードを操作する
 */
function prepare(
  data: LogicTreeSchemaVersion1,
  index: number,
): { nodes: TreeNode[]; built: BuiltTree; i: number } | null {
  const ref = data.nodes[index]
  if (ref === undefined) return null
  const nodes = orderNodes(data.nodes)
  return { nodes, built: buildTree(nodes), i: nodes.indexOf(ref) }
}

/** 最初のノードを作る。空状態からの開始（マウスでもキーボードでもここを通る） */
export function addRoot(data: LogicTreeSchemaVersion1): EditResult {
  const nodes = [...orderNodes(data.nodes), newNode(null)]
  return { data: withNodes(data, nodes), focusIndex: nodes.length - 1 }
}

/** 末尾の子を足す（Tab／将来の「+」ハンドルが呼ぶのはこの関数） */
export function addChild(data: LogicTreeSchemaVersion1, parentIndex: number): EditResult {
  const p = prepare(data, parentIndex)
  if (p === null) return { data, focusIndex: null }
  // 行きがけ順では「部分木の直後」がそのまま「末尾の子の位置」になる
  const at = subtreeEnd(p.built, p.i)
  const node = newNode(p.nodes[p.i].id)
  return { data: withNodes(data, insertAt(p.nodes, at, node)), focusIndex: at }
}

/**
 * 直後に兄弟を足す（Enter）。
 * **ルートの上では子を足す**——ルートに兄弟を作ると多重ルートになり、
 * 単一ルートの木という制約と両立しない
 */
export function addSiblingAfter(data: LogicTreeSchemaVersion1, index: number): EditResult {
  const p = prepare(data, index)
  if (p === null) return { data, focusIndex: null }
  if (p.built.parents[p.i] === null) return addChild(withNodes(data, p.nodes), p.i)
  const at = subtreeEnd(p.built, p.i)
  const node = newNode(p.nodes[p.i].parentId)
  return { data: withNodes(data, insertAt(p.nodes, at, node)), focusIndex: at }
}

/**
 * 部分木ごと消す（空欄 Backspace）。
 *
 * 確認ダイアログは挟まない（rev 5章。会議中の入力速度を削ぐため）。
 * 1操作1コミットの Undo で戻せる。葉だけに限らないのは、M1 には
 * ドラッグも右クリックも無いため、限ると誤った枝を消す手段が消えるから
 */
export function deleteSubtree(data: LogicTreeSchemaVersion1, index: number): EditResult {
  const p = prepare(data, index)
  if (p === null) return { data, focusIndex: null }
  const end = subtreeEnd(p.built, p.i)
  // 行き先は削除前の位置で決める: 前の兄弟 → 親 → 無し
  const siblings = siblingsOf(p.built, p.i)
  const pos = siblings.indexOf(p.i)
  const target = pos > 0 ? siblings[pos - 1] : p.built.parents[p.i]
  const kept = [...p.nodes.slice(0, p.i), ...p.nodes.slice(end)]
  const focusIndex = target === null ? -1 : kept.indexOf(p.nodes[target])
  return { data: withNodes(data, kept), focusIndex: focusIndex < 0 ? null : focusIndex }
}

/**
 * 兄弟の中で1つ動かす（Alt+↑↓）。**部分木ごと動く。**
 *
 * 挿入位置は「削除前の位置」で決めてから、自分を抜いた分だけ補正する
 *——先に削除すると後続が前へずれ、下方向への移動が1つ手前に着地する
 */
export function moveSibling(
  data: LogicTreeSchemaVersion1,
  index: number,
  delta: -1 | 1,
): EditResult {
  const p = prepare(data, index)
  if (p === null) return { data, focusIndex: null }
  const siblings = siblingsOf(p.built, p.i)
  const pos = siblings.indexOf(p.i)
  const to = pos + delta
  if (pos < 0 || to < 0 || to >= siblings.length) return { data, focusIndex: null }

  const start = p.i
  const end = subtreeEnd(p.built, p.i)
  const block = p.nodes.slice(start, end)
  const rest = [...p.nodes.slice(0, start), ...p.nodes.slice(end)]

  const other = siblings[to]
  const at =
    delta === -1
      ? other // 前の兄弟は自分より前にあるので、抜いてもその位置は動かない
      : subtreeEnd(p.built, other) - block.length // 後ろの兄弟は自分の分だけ前へずれる

  const next = [...rest.slice(0, at), ...block, ...rest.slice(at)]
  return { data: withNodes(data, next), focusIndex: at }
}

/**
 * 文言を置き換える。**並べ替えない**——打鍵のたびに配列が動くと、
 * 入力中のノードの配列位置がずれてフォーカスを見失う
 */
export function setText(
  data: LogicTreeSchemaVersion1,
  index: number,
  text: string,
): LogicTreeSchemaVersion1 {
  return { ...data, nodes: data.nodes.map((n, i) => (i === index ? { ...n, text } : n)) }
}
```

- [ ] **Step 4: 実行して緑になることを確認する**

```bash
npx vitest run src/modules/logic-tree/commands.test.ts
```

期待: このファイルの `it` がすべて緑

- [ ] **Step 5: 「下へ動かすときの補正」が守られていることを確かめる**

`moveSibling` の `subtreeEnd(p.built, other) - block.length` を `subtreeEnd(p.built, other)` に変えて、**「下へ動かす」と「下へ動かすとき、部分木ごと相手を飛び越える」が落ちること**を確認してから戻す。これが tech-notes が挙げている「同一親内移動のインデックスずれ」そのもので、落ちなければテストが緩い。

- [ ] **Step 6: 全体を回してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/modules/logic-tree/commands.ts src/modules/logic-tree/commands.test.ts
git commit -m "feat(logic-tree): 編集コマンド（追加・削除・並び替えと行きがけ順の正規化）"
```

---

## Task 7: 操作言語に階層の意味を足す（`keymap.ts`）

**Files:**
- Modify: `src/core/keyboard/keymap.ts`
- Modify: `src/core/keyboard/keymap.test.ts`
- Modify: `src/App.tsx:80-92`（`globalKeyContext`）
- Modify: `src/modules/glossary/GlossaryEditor.tsx:244-249`
- Modify: `src/modules/glossary/AliasCell.tsx:128-139`

**Interfaces:**
- Produces: `Command` に `'insert-child'` / `'focus-parent'` / `'focus-child'` が加わる。`KeyContext` に `hierarchical: boolean` が加わる

**なぜコアを触るのか:** rev 10章 実装規約が「キーボード処理は共通フック／モジュールに一元化し、ツールごとのハンドラ自前実装を禁止」と定めている。ツリーが必要とする意味（**Tab＝子追加**は rev 10章が挙げる階層・リスト系ファミリーの標準そのもの、←→＝親子移動）は、`resolveCommand` の外に書けない。

**用語集への影響:** `hierarchical: false` を渡すので挙動は一切変わらない。**変わっていないことをテストで確認する**（既存の `keymap.test.ts` が緑のままであること）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/keyboard/keymap.test.ts` に次の `describe` を**追記する**（既存の記述は消さない）。冒頭のヘルパ（`KeyContext` を組む関数）が既にあるはずなので、その形に合わせて `hierarchical` を渡すこと。既存ヘルパの既定値は `hierarchical: false` にする:

```ts
describe('階層構造（hierarchical: true）', () => {
  it('Tab で子を追加する（rev 10章 階層・リスト系の標準）', () => {
    expect(
      resolveCommand(key({ key: 'Tab' }), ctx({ hierarchical: true })),
    ).toBe('insert-child')
  })

  it('Shift+Tab には意味を与えない（キャンバスから抜ける経路として残す）', () => {
    expect(
      resolveCommand(key({ key: 'Tab', shiftKey: true }), ctx({ hierarchical: true })),
    ).toBe(null)
  })

  it('← はキャレットが先頭にあるとき親へ移る', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft' }),
        ctx({ hierarchical: true, editing: true, caretAtStart: true }),
      ),
    ).toBe('focus-parent')
  })

  it('← は文中では何もしない（キャレット移動が生きる）', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft' }),
        ctx({ hierarchical: true, editing: true, caretAtStart: false }),
      ),
    ).toBe(null)
  })

  it('→ はキャレットが末尾にあるとき子へ移る', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowRight' }),
        ctx({ hierarchical: true, editing: true, caretAtEnd: true }),
      ),
    ).toBe('focus-child')
  })

  it('Enter は階層でも「直後に追加」のまま', () => {
    expect(resolveCommand(key({ key: 'Enter' }), ctx({ hierarchical: true }))).toBe(
      'insert-item-after',
    )
  })

  it('Ctrl+C / Ctrl+V は階層でも奪わない（複製を後から入れるため）', () => {
    expect(resolveCommand(key({ key: 'c', ctrlKey: true }), ctx({ hierarchical: true }))).toBe(null)
    expect(resolveCommand(key({ key: 'v', ctrlKey: true }), ctx({ hierarchical: true }))).toBe(null)
  })

  it('IME 変換中は階層でも何も起こさない', () => {
    expect(
      resolveCommand(key({ key: 'Tab', isComposing: true }), ctx({ hierarchical: true })),
    ).toBe(null)
  })
})

describe('階層でない構造（hierarchical: false）は挙動が変わらない', () => {
  it('Tab は欄の移動のまま', () => {
    expect(resolveCommand(key({ key: 'Tab' }), ctx({ hierarchical: false }))).toBe(
      'focus-next-field',
    )
  })

  it('← / → には意味を与えない', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft' }),
        ctx({ hierarchical: false, editing: true, caretAtStart: true }),
      ),
    ).toBe(null)
    expect(
      resolveCommand(
        key({ key: 'ArrowRight' }),
        ctx({ hierarchical: false, editing: true, caretAtEnd: true }),
      ),
    ).toBe(null)
  })
})
```

**既存のヘルパ名（`key` / `ctx` に相当するもの）を `keymap.test.ts` から読み取って合わせること。** ヘルパが無ければ、既存テストが使っているオブジェクトリテラルの形をそのまま使う。

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
npx vitest run src/core/keyboard/keymap.test.ts
```

期待: FAIL（`hierarchical` が型に無い／`insert-child` が返らない）

- [ ] **Step 3: `keymap.ts` を書き換える**

`Command` に3つ足す:

```ts
export type Command =
  | 'undo'
  | 'redo'
  | 'cancel'
  | 'insert-item-after'
  | 'insert-child'
  | 'delete-item'
  | 'move-item-up'
  | 'move-item-down'
  | 'focus-prev'
  | 'focus-next'
  | 'focus-parent'
  | 'focus-child'
  | 'focus-next-field'
  | 'focus-prev-field'
```

`KeyContext` に1つ足す（`reorderEnabled` の下）:

```ts
  /**
   * 子を持てる構造か（ツリー・アウトライン）。true のとき Tab は
   * ファミリー標準の「子追加」になり、←→ が親子間の移動になる（rev 10章）。
   * 用語集のようなフラットなリストは false——「子」という意味が存在しない
   */
  hierarchical: boolean
```

`switch` の `Tab` と矢印を書き換える:

```ts
    case 'Tab':
      if (e.altKey) return null
      // 階層構造では Tab は子追加（rev 10章 階層・リスト系の標準）。
      // Shift+Tab に「親にする」を割り当てるのは M1 の範囲外——意味を
      // 与えないことで、キャンバスから Tab 順で抜ける経路として残る
      if (ctx.hierarchical) return e.shiftKey ? null : 'insert-child'
      return e.shiftKey ? 'focus-prev-field' : 'focus-next-field'
```

```ts
    case 'ArrowLeft':
      if (!ctx.hierarchical || e.altKey || e.shiftKey) return null
      // 端でだけ構造の移動に切り替える（↑↓ と同じ規則）
      return !ctx.editing || ctx.caretAtStart ? 'focus-parent' : null
    case 'ArrowRight':
      if (!ctx.hierarchical || e.altKey || e.shiftKey) return null
      return !ctx.editing || ctx.caretAtEnd ? 'focus-child' : null
```

`ArrowUp` / `ArrowDown` / `Enter` / `Backspace` / `Escape` は**変更しない**。

- [ ] **Step 4: 呼び出し側3箇所に `hierarchical: false` を足す**

`tsc` が漏れを教えるので、`npx tsc -b` を回して出た箇所を潰す。想定は次の3つ:

- `src/App.tsx` の `globalKeyContext`（`reorderEnabled: false` の隣）
- `src/modules/glossary/GlossaryEditor.tsx` の `onCellKeyDown` 内（`reorderEnabled,` の隣）
- `src/modules/glossary/AliasCell.tsx` の `resolveCommand` 呼び出し（`reorderEnabled,` の隣）

いずれも `hierarchical: false,` の1行。**用語集はフラットなリストで「子」が存在しない**（rev 10章の適用例）ことをコメントに1行残す。

- [ ] **Step 5: 実行して緑になることを確認する**

```bash
npx vitest run src/core/keyboard/keymap.test.ts src/modules/glossary
```

期待: 追記したテストが緑。**既存の用語集のテストが1つも落ちていないこと**——落ちたら `hierarchical: false` の意味づけが間違っている。

- [ ] **Step 6: 全体を回してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/core/keyboard/keymap.ts src/core/keyboard/keymap.test.ts src/App.tsx src/modules/glossary/GlossaryEditor.tsx src/modules/glossary/AliasCell.tsx
git commit -m "feat(core): 操作言語に階層構造の意味（Tab=子追加・←→=親子移動）を足す"
```

---

## Task 8: `CellInput` の高さを外から決められるようにする

**Files:**
- Modify: `src/components/CellInput.tsx`
- Modify: `src/components/CellInput.dom.test.tsx`

**Interfaces:**
- Produces: `CellInputProps` に `autoSize?: boolean`（既定 `true`）が加わる

**なぜ触るのか:** ノードの入力欄は `CellInput` を使う。IME 対応・ドラフト・Undo 反映・キャレット位置の判定が既にここに閉じており、テストも済んでいる（M1 最大の risk をここに乗せるのが目的）。ただし `CellInput` は `scrollHeight` から行数を測って `rows` を決め、**5行で頭打ちにする**。ツリーのノードは測定層が高さを持っているので、その自前計測を止める口が要る。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/CellInput.dom.test.tsx` に追記する:

```ts
  it('autoSize={false} のとき rows を自分で決めない（高さは CSS に委ねる）', () => {
    render(
      <CellInput
        multiline
        autoSize={false}
        aria-label="ノード"
        value={'あ\nい\nう'}
        onValueChange={() => {}}
      />,
    )
    const el = screen.getByLabelText('ノード') as HTMLTextAreaElement
    expect(el.rows).toBe(1)
  })

  it('autoSize={false} でも IME 変換中は親へ値を上げない', () => {
    const onValueChange = vi.fn()
    render(
      <CellInput multiline autoSize={false} aria-label="ノード" value="" onValueChange={onValueChange} />,
    )
    const el = screen.getByLabelText('ノード')
    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'じゅちゅう' } })
    expect(onValueChange).not.toHaveBeenCalled()
    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    expect(onValueChange).toHaveBeenCalledWith('受注')
  })
```

**既存ファイルの import（`vi` / `fireEvent` / `screen` / `render`）と `describe` の入れ子に合わせて置くこと。**

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
npx vitest run src/components/CellInput.dom.test.tsx
```

期待: FAIL（`autoSize` が型に無い）

- [ ] **Step 3: 実装する**

`CellInputProps` に足す:

```ts
  /**
   * 内容から行数を測って高さを決めるか（既定 true）。
   *
   * **false にするのは、呼び出し側が既に高さを知っているときだけ。**
   * ロジックツリーのノードは測定層が幅と行数を確定させており（1パスで
   * 描くための前提）、ここで再計測すると 5行上限に切り詰められる
   */
  autoSize?: boolean
```

分割代入に `autoSize = true` を足し、2つの `useLayoutEffect` の先頭で抜ける:

```ts
  useLayoutEffect(() => {
    if (!autoSize) return
    measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure は毎レンダー再生成される安定した処理。値と幅の変化だけを見る
  }, [draft, value, multiline, autoSize])
```

```ts
  useLayoutEffect(() => {
    if (!autoSize) return
    if (!multiline) return
    ...
  }, [multiline, autoSize])
```

`rows` の初期値（`useState(1)`）はそのままでよい——`autoSize={false}` では誰も更新しないので 1 のまま渡り、高さは CSS が決める。

- [ ] **Step 4: 実行して緑になることを確認する**

```bash
npx vitest run src/components/CellInput.dom.test.tsx
```

期待: このファイルの `it` がすべて緑（**既存の用語集向けの挙動が1つも落ちないこと**）

- [ ] **Step 5: 全体を回してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/components/CellInput.tsx src/components/CellInput.dom.test.tsx
git commit -m "feat(core): CellInput に autoSize を足す（高さを呼び出し側が決められるようにする）"
```

---

## Task 9: エディタの描画とモジュール登録

**Files:**
- Create: `src/modules/logic-tree/node-font.ts`
- Create: `src/modules/logic-tree/viewport.ts`
- Create: `src/modules/logic-tree/NodeBox.tsx`
- Create: `src/modules/logic-tree/TreeEdges.tsx`
- Create: `src/modules/logic-tree/LogicTreeEditor.tsx`
- Create: `src/modules/logic-tree/LogicTreeEditor.dom.test.tsx`
- Create: `src/modules/logic-tree/module.ts`
- Modify: `src/core/registry.ts`（`toMarkdown` を任意に）
- Modify: `src/core/app-controller.ts:728-783`（`currentDocument` のガード）
- Modify: `src/core/app-controller.test.ts`（ガードのテストを追記）
- Modify: `src/App.tsx`（`canExport`）
- Modify: `src/modules/index.ts`（登録1行）

**Interfaces:**
- Consumes: `buildTree` / `layoutTree` / `wrapText` / `addRoot` / `setText`
- Produces: `logicTreeModule`（`ToolModule<LogicTreeSchemaVersion1>`）／`Transform`・`INITIAL_TRANSFORM`（Task 11 が使う）

**このタスクの範囲:** 画面に木が出て、文言を打てて、空状態からルートを作れるところまで。**構造を変えるキー操作は Task 10、ズーム・パンは Task 11。**

- [ ] **Step 1: モジュール規約の `toMarkdown` を任意にする**

`src/core/registry.ts`:

```ts
  /**
   * 規約5: 出力ロジック（rev 6章・8章）。NotePM 向けの Markdown を返す。
   * 額縁がクリップボードへのコピーと `.md` 書き出しの両方に使うので、
   * **副作用を持たない純関数**であること（ファイルにもクリップボードにも触らない）。
   * Mermaid を含むツールも戻り値はこの1本の文字列に収める。
   *
   * **省略可。** 出力を作っていないツール（着手直後のツール）は持たない。
   * 額縁は持たないモジュールに対して出力の導線自体を出さない——「押せるが
   * 壊れた文字列が出るボタン」を作らないため
   */
  toMarkdown?: (data: TData) => string
```

- [ ] **Step 2: 額縁側を「持たないなら出さない」にする**

`src/core/app-controller.ts` の `currentDocument`（**出力の対象を決めている関数**）を書き換える:

```ts
  /** 出力の対象。editable な選択中ファイルと、額縁が持つ編集中データが揃ったときだけ */
  const currentDocument = (): {
    path: string
    module: AnyToolModule
    data: unknown
    toMarkdown: (data: unknown) => string
  } | null => {
    if (selectedPath === null) return null
    const entry = files.find((f) => f.path === selectedPath)
    if (entry === undefined || entry.result.status !== 'editable') return null
    const module = registry.get(entry.result.type)
    if (module === undefined) return null
    // 出力ロジックを持たないツールは出力の対象にならない（rev 6章 規約5）
    const toMarkdown = module.toMarkdown
    if (toMarkdown === undefined) return null
    const data = host.getEditingData()
    if (data === null) return null
    return { path: selectedPath, module, data, toMarkdown }
  }
```

`copyMarkdown` の `doc.module.toMarkdown(doc.data)` を `doc.toMarkdown(doc.data)` に、`exportMarkdown` の `fresh.module.toMarkdown(fresh.data)` を `fresh.toMarkdown(fresh.data)` に変える。

`src/App.tsx`:

```ts
  // 出力できるのは「出力ロジックを持つツールのファイルを選んでいて、編集中データが
  // 揃っている」とき。コントローラ側でも同じ条件を確認しているが、UI はそれを
  // 押せる／押せないの形で見せる
  const canExport = selectedModule?.toMarkdown !== undefined && editingData !== null
```

`src/core/app-controller.test.ts` に追記する（既存のテストが使っているモジュールの組み立て方に合わせること）:

```ts
  it('toMarkdown を持たないモジュールのファイルでは Markdown をコピーしない', async () => {
    // 出力未実装のツール。押せてしまうと壊れた文字列がクリップボードに入る
    ...（既存のセットアップで toMarkdown を外したモジュールを登録し、
        controller.copyMarkdown() の後に io.copyText が呼ばれていないことを確認する）
  })
```

- [ ] **Step 3: フォントの読み取りを書く**

`src/modules/logic-tree/node-font.ts`:

```ts
import { createEstimateMeasurer, type MeasureWidth } from './measure'

export interface NodeFont {
  /** canvas の ctx.font に渡す値（CSS の font 短縮形と同じ書式） */
  font: string
  fontSize: number
  lineHeight: number
}

/**
 * 測れない環境（jsdom はレイアウトを持たない）用の既定値。
 * text-sm（14px）・行間 1.65（rev 9章 M7 決定6）
 */
export const FALLBACK_NODE_FONT: NodeFont = {
  font: 'normal 400 14px sans-serif',
  fontSize: 14,
  lineHeight: 14 * 1.65,
}

export function sameFont(a: NodeFont, b: NodeFont): boolean {
  return a.font === b.font && a.fontSize === b.fontSize && a.lineHeight === b.lineHeight
}

/**
 * 実際に解決されたフォントを DOM から読む。
 *
 * **測定と描画は同一の情報源を見る必要がある**（rev 9章）。定数で二重に
 * 持つと、トークンを変えたときに全ノードのサイズが静かに狂う。描画される
 * ノードと同じクラスを当てた見本要素から読むことで、その口を1つに保つ
 */
export function readNodeFont(el: HTMLElement | null): NodeFont {
  if (el === null || typeof getComputedStyle !== 'function') return FALLBACK_NODE_FONT
  const style = getComputedStyle(el)
  const fontSize = Number.parseFloat(style.fontSize)
  if (!Number.isFinite(fontSize) || fontSize <= 0) return FALLBACK_NODE_FONT
  const parsed = Number.parseFloat(style.lineHeight)
  const lineHeight = Number.isFinite(parsed) && parsed > 0 ? parsed : fontSize * 1.65
  const family = style.fontFamily === '' ? 'sans-serif' : style.fontFamily
  const weight = style.fontWeight === '' ? '400' : style.fontWeight
  const fontStyle = style.fontStyle === '' ? 'normal' : style.fontStyle
  return { font: `${fontStyle} ${weight} ${fontSize}px ${family}`, fontSize, lineHeight }
}

/**
 * 幅の測定器を作る。**canvas の measureText は DOM に触れずリフローも
 * 起こさない**ので、入力のたびに同期的に呼んでよい。
 * canvas が使えない環境（jsdom）では概算に落ちる
 */
export function createNodeMeasurer(font: NodeFont): MeasureWidth {
  if (typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d')
    if (ctx !== null) {
      ctx.font = font.font
      return (text) => ctx.measureText(text).width
    }
  }
  return createEstimateMeasurer(font.fontSize)
}
```

- [ ] **Step 4: ビューポートの型を置く**

`src/modules/logic-tree/viewport.ts`:

```ts
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
```

- [ ] **Step 5: ノードとエッジのコンポーネントを書く**

`src/modules/logic-tree/NodeBox.tsx`:

```tsx
import { CellInput, type FieldState } from '@/components/CellInput'
import { NODE_BOX_CLASS } from './measure'

export interface NodeBoxProps {
  /** DOM 上の識別子。フォーカス移動が querySelector で引く */
  nodeKey: string
  label: string
  text: string
  x: number
  y: number
  width: number
  height: number
  /** 整合性検証で赤表示の対象になっているか */
  invalid: boolean
  onTextChange: (next: string) => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState) => void
}

/**
 * ノード1つ。**入力欄は常に textarea で、フォーカスされている＝編集中。**
 * 用語集のセルと同じ模型で、IME・ドラフト・Undo 反映は CellInput が持つ。
 *
 * 高さは測定層が決めた値を CSS で当てる（autoSize={false}）。折り返しは
 * `break-all`——測定層のコードポイント単位のグリーディと同じ規則にすることで、
 * ブラウザが測定より早く折り返して文字が切れることを防ぐ
 */
export function NodeBox(props: NodeBoxProps) {
  // **面と枠のクラスは片方だけ出す。** bg-surface と bg-warning/20 を両方
  // 並べても、勝つのは生成 CSS の順序であってクラス名の順序ではない
  //（M8 が cascade layers で踏んだのと同じ形）。
  // 赤表示の濃さは M8 で確定した「エラーは warning/20 の面」に揃える
  const face = props.invalid ? 'border-warning bg-warning/20' : 'border-rule bg-surface'
  return (
    <div
      className="absolute"
      style={{ left: props.x, top: props.y, width: props.width, height: props.height }}
    >
      <CellInput
        multiline
        autoSize={false}
        className={`h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-all rounded-sm ${NODE_BOX_CLASS} ${face} text-sm text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring`}
        aria-label={props.label}
        data-cell={props.nodeKey}
        value={props.text}
        onValueChange={props.onTextChange}
        onFieldKeyDown={props.onFieldKeyDown}
      />
    </div>
  )
}
```

`src/modules/logic-tree/TreeEdges.tsx`:

```tsx
import type { Point, Size } from './layout'
import type { NodeTree } from './tree'
import { svgTransform, type Transform } from './viewport'

export interface TreeEdgesProps {
  roots: readonly NodeTree[]
  positions: ReadonlyMap<string, Point>
  sizes: ReadonlyMap<string, Size>
  transform: Transform
}

interface Edge {
  key: string
  d: string
}

/** 親の右辺の中央から子の左辺の中央へ。左右方向にだけ張り出す3次ベジェ */
function edgePath(from: Point, fromSize: Size, to: Point, toSize: Size): string {
  const x1 = from.x + fromSize.width
  const y1 = from.y + fromSize.height / 2
  const x2 = to.x
  const y2 = to.y + toSize.height / 2
  // 制御点の張り出しは列の間隔の半分。近すぎるときも最低限は曲げる
  const dx = Math.max(16, (x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

/**
 * エッジのレイヤ（SVG）。ノードのレイヤ（DOM）と**同一の transform** を当てる
 * ので、座標系が同じでズレは原理的に起きない。
 *
 * `pointer-events-none` を敷いているのは、下にあるこのレイヤが上の DOM の
 * 操作を奪わないため。エッジをクリック可能にする日が来たら、パス要素だけ
 * `auto` に戻す（tech-notes 論点3）
 */
export function TreeEdges({ roots, positions, sizes, transform }: TreeEdgesProps) {
  const edges: Edge[] = []
  const walk = (node: NodeTree): void => {
    const from = positions.get(node.key)
    const fromSize = sizes.get(node.key)
    for (const child of node.children) {
      const to = positions.get(child.key)
      const toSize = sizes.get(child.key)
      if (from && fromSize && to && toSize) {
        edges.push({ key: `${node.key}->${child.key}`, d: edgePath(from, fromSize, to, toSize) })
      }
      walk(child)
    }
  }
  for (const root of roots) walk(root)

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      data-layer="edges"
    >
      <g transform={svgTransform(transform)}>
        {edges.map((edge) => (
          <path key={edge.key} d={edge.d} className="fill-none stroke-rule" strokeWidth={1} />
        ))}
      </g>
    </svg>
  )
}
```

- [ ] **Step 6: エディタ本体を書く**

`src/modules/logic-tree/LogicTreeEditor.tsx`:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { buttonBase } from '@/components/button-styles'
import type { EditorProps } from '@/core/registry'
import { computeRowKeys } from '@/core/row-keys'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { addRoot, setText } from './commands'
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
import { cssTransform, INITIAL_TRANSFORM, type Transform } from './viewport'

/** 測定結果のキャッシュ。会議1回分の打鍵で無限に増えないよう頭を押さえる */
const MEASURE_CACHE_LIMIT = 2000

/** ノードの文言に当たるクラスのうち、フォントを決めている部分。見本要素と共有する */
const NODE_FONT_CLASS = 'text-sm'

export function LogicTreeEditor({
  data,
  onChange,
  issues,
}: EditorProps<LogicTreeSchemaVersion1>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [font, setFont] = useState<NodeFont>(FALLBACK_NODE_FONT)
  // Task 11 でビューポートのフックが差し替える。M1 の描画はこの値に従うだけ
  const [transform] = useState<Transform>(INITIAL_TRANSFORM)

  // 構造操作の後、新しい DOM が出てからフォーカスを移すための予約
  const [pendingFocus, setPendingFocus] = useState<string | null>(null)

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
      if (alive) readFont()
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readFont は毎レンダー再生成される安定した処理。購読はマウント時の1回でよい
  }, [])

  useEffect(() => {
    if (pendingFocus === null) return
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${pendingFocus}"]`)
    el?.focus()
    setPendingFocus(null)
  }, [pendingFocus])

  // 測定器はフォントが変わったときだけ作り直す。**キャッシュはフォントに
  // 紐づく**ので、同じ入れ物の中で持つ（別々に持つと片方だけ古くなる）
  const measurerRef = useRef<{
    font: string
    measure: MeasureWidth
    cache: Map<string, WrappedText>
  } | null>(null)
  if (measurerRef.current === null || measurerRef.current.font !== font.font) {
    measurerRef.current = { font: font.font, measure: createNodeMeasurer(font), cache: new Map() }
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

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-canvas bg-grid-paper"
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

      <div
        className="absolute inset-0 origin-top-left"
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
            />
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: モジュールを組んで登録する**

`src/modules/logic-tree/module.ts`:

```ts
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import logicTreeSchema from '../../../schemas/logic-tree.schema.json'
import { checkLogicTreeConsistency } from './consistency'
import { LogicTreeEditor } from './LogicTreeEditor'
import { migrateLogicTree } from './migrate'

export const logicTreeModule: ToolModule<LogicTreeSchemaVersion1> = {
  type: 'logicTree',
  displayName: 'ロジックツリー',
  schemaVersion: 1,
  schema: logicTreeSchema as JsonSchema,
  idPrefixes: ['node'],
  Editor: LogicTreeEditor,
  checkConsistency: checkLogicTreeConsistency,
  // 規約5（出力）は持たない。Markdown 出力は M2 で足す——それまで額縁は
  // 出力の導線自体を出さない
  // プロジェクトにロジックツリーは何本あってもよい（用語集と違いハブではない）
  singleton: false,
  migrate: migrateLogicTree,
  // ノード0件で作る。最初の1ノードは空状態の「クリックして開始」で生まれる
  createEmpty: (title) => ({ schemaVersion: 1, type: 'logicTree', title, nodes: [] }),
}
```

`src/modules/index.ts`:

```ts
import { createRegistry } from '@/core/registry'
import { glossaryModule } from './glossary/module'
import { logicTreeModule } from './logic-tree/module'

/** アプリ全体で使うレジストリ。新ツールはここに register を1行足す（rev 6章）。 */
export const appRegistry = createRegistry()
appRegistry.register(glossaryModule)
appRegistry.register(logicTreeModule)
```

- [ ] **Step 8: DOM テストを書く**

`src/modules/logic-tree/LogicTreeEditor.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { LogicTreeEditor } from './LogicTreeEditor'

afterEach(cleanup)

const ID = (n: number): string => `node_${String(n).padStart(10, 'a')}`

const file = (spec: [number, number | null, string][]): LogicTreeSchemaVersion1 => ({
  schemaVersion: 1,
  type: 'logicTree',
  title: 'テスト',
  nodes: spec.map(([id, parent, text]) => ({
    id: ID(id),
    parentId: parent === null ? null : ID(parent),
    text,
  })),
})

/** 額縁と同じく、onChange を state に反映する殻を被せる */
function Harness({ initial }: { initial: LogicTreeSchemaVersion1 }) {
  const [data, setData] = useState(initial)
  return <LogicTreeEditor data={data} onChange={setData} issues={[]} modalOpen={false} />
}

describe('LogicTreeEditor（描画）', () => {
  it('ノードの文言を入力欄として出す', () => {
    render(<Harness initial={file([[1, null, '退会できない'], [2, 1, '導線が分からない']])} />)
    expect((screen.getByLabelText('ノード1') as HTMLTextAreaElement).value).toBe('退会できない')
    expect((screen.getByLabelText('ノード2') as HTMLTextAreaElement).value).toBe('導線が分からない')
  })

  it('文言を打つと onChange が呼ばれる', () => {
    const onChange = vi.fn()
    render(
      <LogicTreeEditor
        data={file([[1, null, '']])}
        onChange={onChange}
        issues={[]}
        modalOpen={false}
      />,
    )
    fireEvent.change(screen.getByLabelText('ノード1'), { target: { value: '退会できない' } })
    expect(onChange.mock.calls[0][0].nodes[0].text).toBe('退会できない')
    // 同じノードへの連続入力は1履歴にまとまってほしいのでキーを渡す
    expect(onChange.mock.calls[0][1]).toBe(`${ID(1)}#0:text`)
  })

  it('IME 変換中の入力は親へ上げない（未確定文字列の巻き戻りを防ぐ）', () => {
    const onChange = vi.fn()
    render(
      <LogicTreeEditor
        data={file([[1, null, '']])}
        onChange={onChange}
        issues={[]}
        modalOpen={false}
      />,
    )
    const el = screen.getByLabelText('ノード1')
    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'たいかい' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.compositionEnd(el, { target: { value: '退会' } })
    expect(onChange.mock.calls[0][0].nodes[0].text).toBe('退会')
  })

  it('空の状態では「クリックして開始」を出し、押すとルートができてフォーカスが乗る', () => {
    render(<Harness initial={file([])} />)
    fireEvent.click(screen.getByRole('button', { name: 'クリックして開始' }))
    const node = screen.getByLabelText('ノード1')
    expect(node).toBeDefined()
    expect(document.activeElement).toBe(node)
  })

  it('ノードがあるときは「クリックして開始」を出さない', () => {
    render(<Harness initial={file([[1, null, 'x']])} />)
    expect(screen.queryByRole('button', { name: 'クリックして開始' })).toBe(null)
  })

  it('整合性検証の指摘を画面に出す', () => {
    render(
      <LogicTreeEditor
        data={file([[1, null, 'x']])}
        onChange={() => {}}
        issues={[{ rule: 'multiple-root', message: 'ルートが2件あります', locations: [] }]}
        modalOpen={false}
      />,
    )
    expect(screen.getByText('ルートが2件あります')).toBeDefined()
  })

  it('循環しているノードは図に出さない（位置を持たないので落ちない）', () => {
    // 1 は正常なルート、2 と 3 が互いを親にしている
    render(
      <Harness
        initial={{
          schemaVersion: 1,
          type: 'logicTree',
          title: 'テスト',
          nodes: [
            { id: ID(1), parentId: null, text: 'a' },
            { id: ID(2), parentId: ID(3), text: 'b' },
            { id: ID(3), parentId: ID(2), text: 'c' },
          ],
        }}
      />,
    )
    expect(screen.getByLabelText('ノード1')).toBeDefined()
    expect(screen.queryByLabelText('ノード2')).toBe(null)
  })
})
```

- [ ] **Step 9: 実行して緑になることを確認する**

```bash
npx vitest run src/modules/logic-tree src/core/app-controller.test.ts
```

期待: 追加した `it` がすべて緑。**`app-controller.test.ts` の既存テストが落ちないこと**（用語集は `toMarkdown` を持つので出力の挙動は変わらない）。

- [ ] **Step 10: 全体を回す**

```bash
npm test && npx tsc -b && npm run lint
```

**新モジュールの登録で `FileList` や `App` のテストが落ちたら、それは「新規作成の選択肢が1つ増えた」ことの反映漏れである。** 落ちたテストの期待値を実態に合わせて直し、**何を直したかを報告に書くこと。**

- [ ] **Step 11: コミット**

```bash
git add src/modules/logic-tree src/modules/index.ts src/core/registry.ts src/core/app-controller.ts src/core/app-controller.test.ts src/App.tsx
git commit -m "feat(logic-tree): エディタの描画とモジュール登録（出力ロジックは任意に）"
```

---

## Task 10: キーボード操作の結線

**Files:**
- Modify: `src/modules/logic-tree/LogicTreeEditor.tsx`
- Modify: `src/modules/logic-tree/NodeBox.tsx`（`onFieldKeyDown` を渡す。Task 9 で口は開けてある）
- Modify: `src/modules/logic-tree/LogicTreeEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `resolveCommand` / `toKeyEventLike` / `KeyContext` / `Command`（Task 7）、`addChild` / `addSiblingAfter` / `deleteSubtree` / `moveSibling`（Task 6）

**キーと意味の対応（rev 10章 階層・リスト系ファミリー標準）:**

| キー | コマンド | ツリーでの意味 |
| --- | --- | --- |
| `Enter` | `insert-item-after` | 直後に兄弟を追加（**ルート上では子を追加**） |
| `Tab` | `insert-child` | 末尾に子を追加 |
| 空欄 `Backspace` | `delete-item` | 部分木ごと削除 |
| `Alt+↑` / `Alt+↓` | `move-item-up` / `move-item-down` | 兄弟の並び替え |
| `↑` / `↓`（キャレットが端） | `focus-prev` / `focus-next` | 前後の兄弟へ |
| `←` / `→`（キャレットが端） | `focus-parent` / `focus-child` | 親へ／最初の子へ |
| `Esc` | `cancel` | フォーカスを外す（＝選択解除） |
| `Ctrl+Z` / `Ctrl+Shift+Z` | — | **額縁（App）のグローバル層が取る。エディタは関与しない** |

- [ ] **Step 1: 失敗するテストを書く**

`LogicTreeEditor.dom.test.tsx` に追記する（Task 9 の `Harness` と `file` を再利用する）:

```tsx
describe('LogicTreeEditor（キーボード操作）', () => {
  it('Enter で直後に兄弟を追加し、その入力欄にフォーカスが移る', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, '子']])} />)
    fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'Enter' })
    const added = screen.getByLabelText('ノード3')
    expect((added as HTMLTextAreaElement).value).toBe('')
    expect(document.activeElement).toBe(added)
  })

  it('IME 変換中の Enter ではノードが増えない（M1 の最重要要件）', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, '']])} />)
    const el = screen.getByLabelText('ノード2')
    fireEvent.compositionStart(el)
    fireEvent.keyDown(el, { key: 'Enter', isComposing: true })
    expect(screen.queryByLabelText('ノード3')).toBe(null)
  })

  it('ルートの上の Enter は子を作る（多重ルートを作らない）', () => {
    render(<Harness initial={file([[1, null, '親']])} />)
    fireEvent.keyDown(screen.getByLabelText('ノード1'), { key: 'Enter' })
    expect(screen.getByLabelText('ノード2')).toBeDefined()
    // 1本の木のままであること＝ルートが増えていない
    expect(screen.queryByLabelText('ノード3')).toBe(null)
  })

  it('Tab で子を追加する', () => {
    render(<Harness initial={file([[1, null, '親']])} />)
    fireEvent.keyDown(screen.getByLabelText('ノード1'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('ノード2'))
  })

  it('空欄で Backspace すると部分木ごと消える', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, ''], [3, 2, '孫']])} />)
    fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'Backspace' })
    expect(screen.queryByLabelText('ノード2')).toBe(null)
    expect(screen.getByLabelText('ノード1')).toBeDefined()
  })

  it('文言が残っているノードは Backspace で消えない', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, '子']])} />)
    fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'Backspace' })
    expect(screen.getByLabelText('ノード2')).toBeDefined()
  })

  it('Alt+↑ で兄弟の順が入れ替わる', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, 'A'], [3, 1, 'B']])} />)
    fireEvent.keyDown(screen.getByLabelText('ノード3'), { key: 'ArrowUp', altKey: true })
    expect((screen.getByLabelText('ノード2') as HTMLTextAreaElement).value).toBe('B')
    expect((screen.getByLabelText('ノード3') as HTMLTextAreaElement).value).toBe('A')
  })

  it('↓ で次の兄弟へフォーカスが移る', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, 'A'], [3, 1, 'B']])} />)
    const from = screen.getByLabelText('ノード2')
    from.focus()
    fireEvent.keyDown(from, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByLabelText('ノード3'))
  })

  it('← で親へ、→ で最初の子へ移る', () => {
    render(<Harness initial={file([[1, null, '親'], [2, 1, 'A']])} />)
    const child = screen.getByLabelText('ノード2')
    child.focus()
    fireEvent.keyDown(child, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(screen.getByLabelText('ノード1'))
    fireEvent.keyDown(screen.getByLabelText('ノード1'), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByLabelText('ノード2'))
  })

  it('Esc でフォーカスが外れる', () => {
    render(<Harness initial={file([[1, null, '親']])} />)
    const el = screen.getByLabelText('ノード1')
    el.focus()
    fireEvent.keyDown(el, { key: 'Escape' })
    expect(document.activeElement).not.toBe(el)
  })

  it('モーダルが開いている間は操作言語が止まる', () => {
    const onChange = vi.fn()
    render(
      <LogicTreeEditor
        data={file([[1, null, '親'], [2, 1, '子']])}
        onChange={onChange}
        issues={[]}
        modalOpen
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('構造の変更は履歴をまとめない（1操作1コミット）', () => {
    const onChange = vi.fn()
    render(
      <LogicTreeEditor
        data={file([[1, null, '親'], [2, 1, '子']])}
        onChange={onChange}
        issues={[]}
        modalOpen={false}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('ノード2'), { key: 'Enter' })
    expect(onChange.mock.calls[0][1]).toBe(null)
  })

  it('Undo で戻した内容が表示に反映される', () => {
    // 額縁と同じ経路（履歴の present を data に流す）を張る
    function UndoHarness() {
      const [history, setHistory] = useState(() => createHistory(file([[1, null, '親']])))
      return (
        <div>
          <button type="button" onClick={() => setHistory((h) => undoHistory(h))}>
            元に戻す
          </button>
          <LogicTreeEditor
            data={history.present}
            onChange={(next) => setHistory((h) => record(h, next, null, Date.now()))}
            issues={[]}
            modalOpen={false}
          />
        </div>
      )
    }
    render(<UndoHarness />)
    fireEvent.keyDown(screen.getByLabelText('ノード1'), { key: 'Tab' })
    expect(screen.getByLabelText('ノード2')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '元に戻す' }))
    expect(screen.queryByLabelText('ノード2')).toBe(null)
  })
})
```

`createHistory` / `record` / `undo as undoHistory` を `@/core/history` から import する（`GlossaryEditor.dom.test.tsx` と同じ形）。

- [ ] **Step 2: 実行して落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/LogicTreeEditor.dom.test.tsx
```

期待: FAIL（キーを押しても何も起きない）

- [ ] **Step 3: `NodeBox` にキーの口を通す**

`NodeBoxProps.onFieldKeyDown` は Task 9 で定義済み。`CellInput` へそのまま渡っていることを確認する（渡っていなければ渡す）。

- [ ] **Step 4: エディタにコマンドの写像を書く**

`LogicTreeEditor.tsx` に足す（`modalOpen` を props の分割代入に加えること）:

```tsx
import type { FieldState } from '@/components/CellInput'
import {
  resolveCommand,
  toKeyEventLike,
  type Command,
  type KeyContext,
} from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import { addChild, addSiblingAfter, deleteSubtree, moveSibling, type EditResult } from './commands'

const PLATFORM = currentPlatform()
```

エディタ本体の中（`createRoot` の隣）:

```tsx
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
    el.focus()
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
```

`NodeBox` の呼び出しに1行足す:

```tsx
              onFieldKeyDown={(e, state) => onNodeKeyDown(e, index, state)}
```

- [ ] **Step 5: 実行して緑になることを確認する**

```bash
npx vitest run src/modules/logic-tree/LogicTreeEditor.dom.test.tsx
```

期待: このファイルの `it` がすべて緑

- [ ] **Step 6: IME の防波堤が「守られている」ことを確かめる**

`onNodeKeyDown` の先頭に `if (false) return` を書き足す……のではなく、**`resolveCommand` の `if (e.isComposing) return null` を一時的に消して、「IME 変換中の Enter ではノードが増えない」が落ちることを確認する。** 落ちなければ、そのテストは IME を検査していない（`toKeyEventLike` が `nativeEvent.isComposing` を読めていない可能性がある）。確認したら戻す。

- [ ] **Step 7: 全体を回してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/modules/logic-tree
git commit -m "feat(logic-tree): キーボード操作（追加・削除・並び替え・フォーカス移動）"
```

---

## Task 11: ビューポート（ズーム・パン・新ノードへの追従）

**Files:**
- Modify: `package.json`（依存の追加）
- Modify: `src/modules/logic-tree/viewport.ts`（`panIntoView` を追加）
- Create: `src/modules/logic-tree/viewport.test.ts`
- Create: `src/modules/logic-tree/useViewport.ts`
- Modify: `src/modules/logic-tree/LogicTreeEditor.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface Rect { x: number; y: number; width: number; height: number }
  export function panIntoView(t: Transform, rect: Rect, view: { width: number; height: number }, margin: number): Transform
  export interface ViewportControl {
    transform: Transform
    /** Space を押している間 true（パンのカーソル表示に使う） */
    spaceHeld: boolean
    /** 世界座標の矩形が画面外なら、収まるまでパンする（倍率は変えない） */
    ensureVisible: (rect: Rect) => void
  }
  export function useViewport(ref: React.RefObject<HTMLDivElement | null>): ViewportControl
  ```

**操作:** `Ctrl+ホイール`＝カーソル中心ズーム、`Space+ドラッグ` または中ボタンドラッグ＝パン（rev 10章 キャンバスの標準操作）。

- [ ] **Step 1: 依存を入れる**

```bash
npm install d3-zoom d3-selection
npm install -D @types/d3-zoom @types/d3-selection
```

`d3-zoom` は「ホイール／ドラッグを正規化して `{x, y, k}` を返す」だけの部品で、イベント系を乗っ取らない（tech-notes 論点3）。**`d3` 本体は入れないこと**（不要なモジュールを丸ごと抱える）。

- [ ] **Step 2: `panIntoView` の失敗するテストを書く**

`src/modules/logic-tree/viewport.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { panIntoView, type Transform } from './viewport'

const VIEW = { width: 1000, height: 600 }
const MARGIN = 20
const identity: Transform = { x: 0, y: 0, k: 1 }

describe('panIntoView', () => {
  it('画面に収まっているノードでは動かさない', () => {
    expect(panIntoView(identity, { x: 100, y: 100, width: 200, height: 40 }, VIEW, MARGIN)).toEqual(
      identity,
    )
  })

  it('右にはみ出しているとき、右端が余白の内側に来るまで左へ寄せる', () => {
    const t = panIntoView(identity, { x: 900, y: 100, width: 200, height: 40 }, VIEW, MARGIN)
    expect(900 + t.x + 200).toBe(VIEW.width - MARGIN)
  })

  it('左にはみ出しているとき、左端が余白の内側に来るまで右へ寄せる', () => {
    const t = panIntoView({ x: -500, y: 0, k: 1 }, { x: 100, y: 100, width: 200, height: 40 }, VIEW, MARGIN)
    expect(100 + t.x).toBe(MARGIN)
  })

  it('下にはみ出しているときも同じように動かす', () => {
    const t = panIntoView(identity, { x: 0, y: 700, width: 100, height: 40 }, VIEW, MARGIN)
    expect(700 + t.y + 40).toBe(VIEW.height - MARGIN)
  })

  it('表示領域より大きいノードは左上に揃える（右端優先で寄せると頭が切れる）', () => {
    const t = panIntoView(identity, { x: 0, y: 0, width: 2000, height: 40 }, VIEW, MARGIN)
    expect(0 + t.x).toBe(MARGIN)
  })

  it('倍率は変えない', () => {
    const t = panIntoView({ x: 0, y: 0, k: 2 }, { x: 900, y: 0, width: 200, height: 40 }, VIEW, MARGIN)
    expect(t.k).toBe(2)
  })

  it('拡大しているときは画面上の大きさで判定する', () => {
    // k=2 では x=400 のノードは画面上 800 にあり、幅 200 は 400 になる
    const t = panIntoView({ x: 0, y: 0, k: 2 }, { x: 400, y: 0, width: 200, height: 40 }, VIEW, MARGIN)
    expect(400 * 2 + t.x + 200 * 2).toBe(VIEW.width - MARGIN)
  })
})
```

- [ ] **Step 3: 実行して落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/viewport.test.ts
```

期待: FAIL（`panIntoView` が無い）

- [ ] **Step 4: `viewport.ts` に追記する**

```ts
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
```

- [ ] **Step 5: 実行して緑になることを確認する**

```bash
npx vitest run src/modules/logic-tree/viewport.test.ts
```

期待: このファイルの `it` がすべて緑

- [ ] **Step 6: d3-zoom の配線を書く**

`src/modules/logic-tree/useViewport.ts`:

```ts
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
 * ビューポート（rev 10章 キャンバスの標準操作）。
 *
 * - `Ctrl+ホイール` ＝ カーソル中心ズーム
 * - `Space+ドラッグ` または中ボタンドラッグ ＝ パン
 *
 * **d3-zoom の既定はどちらも違う。** 既定の filter は `!event.ctrlKey` で
 * Ctrl+ホイールを**弾き**（ブラウザがピンチを ctrl 付きホイールとして送るため）、
 * 既定の wheelDelta は ctrl 付きに10倍を掛ける（1ノッチで4倍になり使い物に
 * ならない）。両方を差し替える
 */
export function useViewport(ref: React.RefObject<HTMLDivElement | null>): ViewportControl {
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
    selection.call(behavior.transform, zoomIdentity
      .translate(INITIAL_TRANSFORM.x, INITIAL_TRANSFORM.y)
      .scale(INITIAL_TRANSFORM.k))
    behaviorRef.current = behavior
    return () => {
      selection.on('.zoom', null)
      behaviorRef.current = null
    }
  }, [ref])

  // Space の押下監視。**テキスト入力中は無視する**——ノードの入力欄は常に
  // textarea なので、ここを抜くと文字が打てなくなる（rev 10章 境界規則）
  useEffect(() => {
    const down = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' || e.repeat) return
      if (isTextEntry(document.activeElement)) return
      spaceHeldRef.current = true
      setSpaceHeld(true)
      // 何も入力していないときの Space はページのスクロールに使われる
      e.preventDefault()
    }
    const release = (): void => {
      spaceHeldRef.current = false
      setSpaceHeld(false)
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
  }, [])

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
```

- [ ] **Step 7: エディタに結線する**

`LogicTreeEditor.tsx`:

- `const [transform] = useState<Transform>(INITIAL_TRANSFORM)` を削り、`const { transform, spaceHeld, ensureVisible } = useViewport(containerRef)` に差し替える
- 根の `<div>` のクラスに `${spaceHeld ? 'cursor-grab' : ''}` を足す（パンできる状態が見えるように）
- `pendingFocus` の effect で、フォーカスした後に追従させる:

```tsx
  useEffect(() => {
    if (pendingFocus === null) return
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-cell="${pendingFocus}"]`)
    el?.focus()
    const point = positions.get(pendingFocus)
    const size = sizes.get(pendingFocus)
    // 打った直後のノードが画面外だと、何を打っているか見えない
    if (point !== undefined && size !== undefined) {
      ensureVisible({ x: point.x, y: point.y, width: size.width, height: size.height })
    }
    setPendingFocus(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- positions / sizes は毎レンダー作り直される導出値。予約が入ったときだけ走らせる
  }, [pendingFocus])
```

- [ ] **Step 8: DOM テストを1つ足す**

`LogicTreeEditor.dom.test.tsx` に追記する:

```tsx
  it('jsdom でもビューポートの配線でクラッシュしない', () => {
    // d3-zoom はマウント時に listener を張るだけなので、レイアウトを持たない
    // 環境でも落ちてはいけない（ここが落ちると他の DOM テストが全部道連れになる）
    render(<Harness initial={file([[1, null, '親']])} />)
    expect(screen.getByLabelText('ノード1')).toBeDefined()
  })
```

**このテストが落ちたら、`useViewport` の effect を jsdom で安全に抜ける形にすること**（`ref.current === null` の早期 return は既にある）。

- [ ] **Step 9: 全体を回してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add package.json package-lock.json src/modules/logic-tree
git commit -m "feat(logic-tree): ビューポート（Ctrl+ホイールのズーム・Space/中ボタンのパン・新ノードへの追従）"
```

---

## Task 12: 実機確認とドキュメント反映

**Files:**
- Create: `docs/history/logic-tree-m1-keyboard-editor.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`
- Modify: `docs/README.md`

**このタスクはサブエージェントだけでは完了しない。** 実機確認は GUI 操作なので人間の作業である（`docs/lessons-for-planning.md`）。

- [ ] **Step 1: 実機で一巡する（人間の作業）**

```bash
npm run tauri dev
```

`sample-project/` を開いて、サイドバーの新規作成から「ロジックツリー」を作り、次を**ライト・ダーク両方**で確認する:

1. **空状態の「クリックして開始」でルートができ、そのまま打てる**
2. **日本語で打って、変換確定の Enter でノードが増えないこと** ← ここが崩れたら M1 は未完
3. `Enter` / `Tab` を交互に押して 30〜50 ノードを打ち切れるか（**会議のスピードに追いつくか**を体感で見る）
4. `Alt+↑↓` で並び替え、空欄 `Backspace` で削除
5. 打ったノードが画面外に出たときに追従してパンするか
6. `Ctrl+ホイール` でカーソル中心にズーム、`Space+ドラッグ` と中ボタンでパン
7. **ノードの文言が枠から切れていないか**（測定層とブラウザの折り返しがずれていないかの確認。1文字でも切れていたら `NODE_INSET_X` と `NODE_BOX_CLASS` の対応を疑う）
8. アプリを閉じて開き直し、同じ木が同じ形で出るか
9. `Ctrl+Z` / `Ctrl+Shift+Z` が1操作ずつ戻る・進むか
10. `npx vite build` で生成 CSS を確認する（スタイルのカスケードに関わる変更を含むため）

**見つかったことを記録する。** 直すか申し送るかは、崩れているのが完了条件かどうかで決める。

- [ ] **Step 2: 実機確認の痕跡を捨てる**

```bash
git checkout -- sample-project/ && git clean -fd sample-project/
git status --short
```

`sample-project/` の変更が残っていないこと（`CLAUDE.md` の後片付け1）。

- [ ] **Step 3: 申し送りを書く**

`docs/history/logic-tree-m1-keyboard-editor.md` を新規作成する。**以後書き換えない文書**なので、そのとき何が起きたかを書く:

- 実装で確定した事項（平坦＋`parentId` を選んだ理由、行きがけ順の正規化、常に textarea の模型、ルート上の Enter が子になること、空欄 Backspace が部分木ごと消すこと）
- 計画の誤りとして報告されたもの
- 実機確認の結果（**最大幅 320px が実データで窮屈だったか**は tech-notes 論点8 が待っている数値なので必ず書く）
- コアに入れた変更（`toMarkdown` の任意化、`KeyContext.hierarchical`、`CellInput.autoSize`）

ファイル名に `mN` の通し番号を使わない。**ロジックツリーの段階は `logic-tree-mN` で採番する**（用語集・コアの `m1`〜`m8` と並行して進むため、通し番号だと衝突する）。

- [ ] **Step 4: `docs/open-issues.md` を更新する**

解消したものを消し、見つけたものを足す。**この段階で足すことが分かっているもの:**

- **エッジに矢印を描いていない**（`src/modules/logic-tree/TreeEdges.tsx`）: tech-notes 論点3 は「曲線と矢印」としているが、横向きで親が左に固定されているため向きは曖昧でない。**エッジを増やす（点線・色分け）ときに再検討する** `[logic-tree-m1]`
- **方眼背景がズームに追従しない**（`src/modules/logic-tree/LogicTreeEditor.tsx`）: `bg-grid-paper` はビューポートの外側に敷いてあるので、拡大しても升目の大きさが変わらない。**「地は方眼」（rev 9章）の意図には合っているが、キャンバスとしては倍率の手がかりを失っている** `[logic-tree-m1]`
- **測定結果のキャッシュが `MEASURE_CACHE_LIMIT` で全消しになる**（`src/modules/logic-tree/LogicTreeEditor.tsx`）: LRU ではないので、上限に達した直後の1フレームだけ全ノードを測り直す `[logic-tree-m1]`
- **ID が重複しているファイルでは、その ID を親に指すノードが先頭の1つにだけ付く**（`src/modules/logic-tree/tree.ts`）: 挙動は決めてあるが、画面には「重複」としか出ない `[logic-tree-m1]`

実機確認で見つかったものを足す。

- [ ] **Step 5: `docs/overview-rev.md` へ反映する**

**完了コミットで済ませ、TODO として申し送りに残さない**（rev 反映漏れは設計と実装の食い違いとして伝播する）。tech-notes の「rev 反映候補」の節が反映先を挙げているので、そこを起点にする:

- **10章「キャンバス化の決定」**: 各ツールセッションへの申し送りに、**ロジックツリーは自動レイアウトで確定**した旨を追記。あわせて一般則として「**マウスドラッグは座標の編集とは限らない。構造の編集を入力するジェスチャとして使える**」を明記する
- **10章「実装規約」**: 「キャンバスライブラリ（React Flow / tldraw 等）は採用しない。イベント系を乗っ取るライブラリは操作言語の一元化規約と衝突するため」。あわせて「**ノードは DOM、エッジは SVG、ビューポートは d3-zoom**」を全キャンバス系ツール共通の構成として定める
- **10章「キーボード操作：二層構造」**: 階層構造では `Tab`＝子追加・`←→`＝親子移動になること（`KeyContext.hierarchical`）。用語集が `Tab` をセル移動に充てているのは「フラットなリストには子が無い」ためだという既存の記述と接続する
- **6章 モジュール規約**: **規約5（出力ロジック）は任意**とし、持たないツールには額縁が出力の導線を出さない、と改める
- **9章 デザインシステム**: 測定層と描画層が**同一のフォントトークンを参照する**必要がある旨を注記（ずれると全ノードのサイズが狂う）
- **5章**: ロジックツリーは `singleton: false`（プロジェクトに何本あってもよい）

**8章（出力）と 6章のレイアウト関数の規約化は、この段階では触らない**——Markdown 出力は M2、レイアウトの規約化はシーケンスという2つ目の実例が出てからと決めてある（tech-notes 論点8）。

- [ ] **Step 6: `docs/README.md` を更新する**

「どれを読むか」の表に2行足す:

```markdown
| 何をどの順で作るか（ロジックツリー） | [`logic-tree/logic-tree-m1-scope.md`](logic-tree/logic-tree-m1-scope.md) |
| ロジックツリーのキャンバスがなぜこの技術なのか | [`logic-tree/logic-tree-canvas-tech-notes.md`](logic-tree/logic-tree-canvas-tech-notes.md) |
```

「マイルストーンの履歴」の表に `logic-tree-m1` の行を足し、**採番が2系統（コア・用語集の `mN` と、ロジックツリーの `logic-tree-mN`）に分かれたことを1行で説明する。**

- [ ] **Step 7: 最終確認**

```bash
npm test && npx tsc -b && npm run lint
git status --short
```

`sample-project/` に変更が残っていないこと。

- [ ] **Step 8: コミット**

```bash
git add docs/
git commit -m "docs(logic-tree): M1 の申し送りと rev への反映"
```

---

## 状態を読むのは誰か・変えるのは誰か

計画時に列挙する表（`docs/lessons-for-planning.md`「状態と時間の扱い」）。**1つの状態を2つの機構が使っている箇所を先に見えるようにする。**

| 状態 | 持ち主 | 読む側 | 変える側 | 注意 |
| --- | --- | --- | --- | --- |
| `data`（木の内容） | 額縁の履歴（`history.present`） | エディタ全体 | `onChange` 経由の額縁のみ | **エディタは自分では持たない。** Undo と外部変更の取り込みがそのまま表示に反映される経路になる |
| `font` | エディタの state | 測定器の生成・`wrapText` | マウント時と `document.fonts.ready` | 変わると測定キャッシュが丸ごと無効になる（同じ入れ物で持つ） |
| `measurerRef.cache` | エディタの ref | `wrapText` の呼び出し | 同上（フォント変更で作り直し） | **render 中に書き換える。** 同じ text からは同じ結果しか出ないので冪等 |
| `pendingFocus` | エディタの state | フォーカスの effect | 構造操作（`apply` / `createRoot`） | 新しい DOM が出た**後**に焦点を移すための1回きりの予約。使ったら null に戻す |
| `transform` | `useViewport` の state | 3レイヤの transform | d3-zoom の `zoom` イベントのみ | **`setTransform` を直接呼ばない。** d3 の内部状態と食い違うと次のホイールで飛ぶ |
| `spaceHeldRef` / `spaceHeld` | `useViewport` | `filter`（ref）／カーソル表示（state） | window の keydown/keyup/blur | window のリスナーはマウント時の1回しか張らないので、**判定は必ず ref から読む** |
| `modalOpen` | 額縁 | `KeyContext` | 額縁のモーダルキュー | エディタはそのまま渡すだけ |

---

## Self-Review

**スコープの網羅（`logic-tree-m1-scope.md` の IN SCOPE と対応するタスク）**

| スコープの項目 | タスク |
| --- | --- |
| JSON Schema・ID 規約・`schemaVersion` const 1・エンベロープ | Task 1 |
| ファイル読み込み・オートセーブ | 既存の額縁がそのまま担う（Task 9 の登録で通る） |
| 二段検証（レベル1 拒否／レベル2 赤表示） | レベル1 は既存の `classifyFile`（Task 1 のスキーマで効く）／レベル2 は Task 3・表示は Task 9 |
| マイグレータの枠 | Task 1 |
| `Enter` / `Tab` / 空欄 `Backspace` / `Alt+↑↓` / 矢印 / `Esc` | Task 7（意味の定義）＋ Task 10（写像） |
| `Ctrl+Z` / `Ctrl+Shift+Z` | 既存の額縁のグローバル層（Task 10 で「エディタが消費しない」ことを確認） |
| IME 対応 | Task 8（`CellInput` の再利用）＋ Task 10 の検証手順 |
| 境界規則 | Task 10（`KeyContext`）＋ Task 11（Space の抑止） |
| 共通フックへの一元化 | Task 7 |
| 測定層 | Task 4 ＋ Task 9（フォントの読み取り） |
| レイアウト層 | Task 5 |
| 描画層 3レイヤ | Task 9 |
| ビューポート（Ctrl+ホイール／Space・中ボタン） | Task 11 |
| 空状態からの開始 | Task 9 |

**OUT OF SCOPE に触れていないことの確認**

マウス操作（ドラッグ・「+」ハンドル・右クリック・複数選択・複製）／アニメーション／折りたたみ／葉数バッジ／Markdown・Mermaid 出力／外部変更検知の新規実装／検索・フィルタ／用語集への参照——**いずれもタスクに含まれていない。** 空状態の「クリックして開始」だけはマウス操作だがスコープの IN SCOPE に明記がある。整合性検証の `missing-parent` は意図的な追加として冒頭に明記した。

**未確定のまま残すもの**（tech-notes 論点8。この計画では決めない）

- 最大幅 320px の妥当性 → Task 12 の実機確認で数値を記録する
- 折り返し後の幅の再縮小、最大幅の可変化、ノード幅の手動調整 → 実装しない
- アニメーション時間、インジケータの描画幅 → M3・M4 の管轄

