# ロジックツリー登録 Skill（logic-tree-m2）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 会話やメモから `type: "logicTree"` の JSON を組み立てられる5本目の同梱 Skill（`logic-tree-register`）を作り、アプリの配布経路・テスト・ドキュメントに載せる。

**Architecture:** `src/core/canvas/flat-tree.ts` から `key`（React の行同一性）を持たない純粋部分を `flat-tree-core.ts` として切り出し、これを Skill へ**バイト一致でコピー**する。木の組み立て（全域性・循環・参照切れ）と DFS 行きがけ順の正規化はコピーが持ち、書き出しスクリプトが手で複製するのは「整合性の4メッセージ」「`findDuplicates`」「集計行」の3つだけに絞る。Skill 自体はフェーズA（木を起こして書き出す）のみで、問いを詰めるフェーズB を持たない。

**Tech Stack:** TypeScript / React / Vitest（アプリ側）、Node ESM ＋ 型ストリップ（`.mjs` から `.ts` を直接 import）、ajv 8（スキーマ検証）

**Spec:** [`../specs/2026-08-29-logic-tree-register-skill-design.md`](../specs/2026-08-29-logic-tree-register-skill-design.md)

## Global Constraints

- **worktree は作成済み。** `C:\Dev\Projects\facet\.claude\worktrees\logic-tree-m2-register-skill`（ブランチ `worktree-logic-tree-m2-register-skill`）。**主チェックアウトで作業しない**
- **バイト一致コピーの条件**（rev 4章）: コピー元は**値 import・相対 import・enum・パラメータプロパティを持たない**。型 import とエイリアス import（`@/...`）の型のみ使用は可
- **ID 規約**（rev 5章）: `node_` ＋ 英数字62文字アルファベットの nanoid 10文字。**連番禁止**
- **正規形**: キー順＝スキーマの `properties` 記載順、インデント半角2、**LF**、末尾改行あり、BOM なし、非 ASCII はそのまま
- **整合性検証の文言はアプリが正。** `src/modules/logic-tree/consistency.ts` の `message` を**逐語**で複製する（言い換え・句読点の変更も不可）
- **集計行の文言**: `⚠ 要対応 N（未記入 N）` ／ 0件のときは `要対応 0`（`src/core/missing-tally.ts` の `tallyLine`）
- **Node の要求版**: 型ストリップがフラグ無しで動く版（22.18+ / 23.6+ / 24+）
- **`sample-project/` のお手本を書き換えない**（`応募が書類選考に進まないケース.json` は README の表と対になっている）
- **既存テストを弱めない。** 既存の `COPIES` 定数から要素を削除しない
- 検証コマンドは `npm test && npx tsc -b && npm run lint`

---

### Task 1: `flat-tree-core.ts` の切り出し（アプリ側）

`src/core/canvas/flat-tree.ts` の唯一の値 import は `computeRowKeys`（`FlatTreeNode.key` を作るためだけに使う）。Skill が必要とする `roots` / `unreachable` / `missingParent` / DFS 順は `key` を使わないので、`key` を持たない index ベースの層を切り出してコピー可能にする。**公開 API は変えない**——`commands.ts` と3モジュールのエディタは無変更で緑のままであること。

**Files:**
- Create: `src/core/canvas/flat-tree-core.ts`
- Modify: `src/core/canvas/flat-tree.ts:1-145`（全面。中身は `flat-tree-core.ts` へ移し、`key` を被せる層だけ残す）
- Test: `src/core/canvas/flat-tree-core.test.ts`（新規。制約の検査のみ）
- Test（無変更で緑であること）: `src/core/canvas/flat-tree.test.ts`

**Interfaces:**
- Consumes: なし（このタスクが最初）
- Produces:
  - `src/core/canvas/flat-tree-core.ts` が export するもの:
    - `interface FlatNode { id: string; parentId: string | null }`
    - `interface FlatTreeCoreNode { index: number; children: FlatTreeCoreNode[] }`
    - `interface BuiltFlatTree { roots: FlatTreeCoreNode[]; depths: number[]; parents: (number | null)[]; children: number[][]; unreachable: number[]; missingParent: number[] }`
    - `function buildFlatTree(nodes: readonly FlatNode[]): BuiltFlatTree`
    - `function orderFlatNodes<T extends FlatNode>(nodes: readonly T[]): T[]`
    - `function subtreeEnd(built: { depths: readonly number[] }, index: number): number`
    - `function siblingsOf(built: { parents: readonly (number | null)[]; children: readonly number[][]; roots: readonly { index: number }[] }, index: number): number[]`
  - `src/core/canvas/flat-tree.ts` は今までどおり `FlatNode` / `FlatTreeNode` / `BuiltTree` / `buildTree` / `orderFlatNodes` / `subtreeEnd` / `siblingsOf` を export する

- [ ] **Step 1: 制約を縛る失敗テストを書く**

`src/core/canvas/flat-tree-core.test.ts` を新規作成する。

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractImportStatements, isValueImportStatement } from '@/core/import-analysis'
import { buildFlatTree, orderFlatNodes } from './flat-tree-core'

/**
 * このファイルは登録 Skill（logic-tree-register）へバイト一致でコピーされる。
 * コピー先は Node の型ストリップで実行されるので、値 import も enum も持てない。
 * **制約を破った瞬間にここが赤くなる**——バイト一致そのものの検査は
 * src/modules/logic-tree/skill-copy.test.ts が持つ
 */
describe('flat-tree-core.ts のコピー制約', () => {
  const src = readFileSync('src/core/canvas/flat-tree-core.ts', 'utf8')

  it('値 import を持たない', () => {
    expect(extractImportStatements(src).filter(isValueImportStatement)).toEqual([])
  })

  it('相対 import を持たない', () => {
    expect(extractImportStatements(src).filter((s) => /from\s+['"]\./.test(s))).toEqual([])
  })

  it('消去できない構文（enum / パラメータプロパティ）を持たない', () => {
    expect(src).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\s/m)
    expect(src).not.toMatch(/constructor\s*\([^)]*\b(public|private|protected|readonly)\s/)
  })
})

describe('buildFlatTree', () => {
  it('循環しているノードを unreachable に入れ、parents を null に倒す', () => {
    const built = buildFlatTree([
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'c' },
      { id: 'c', parentId: 'b' },
    ])
    expect(built.roots.map((r) => r.index)).toEqual([0])
    expect(built.unreachable).toEqual([1, 2])
    expect(built.parents[1]).toBeNull()
    expect(built.parents[2]).toBeNull()
  })

  it('親の参照切れはルート扱いにし、位置を missingParent に記録する', () => {
    const built = buildFlatTree([
      { id: 'a', parentId: null },
      { id: 'b', parentId: 'zzz' },
    ])
    expect(built.missingParent).toEqual([1])
    expect(built.roots.map((r) => r.index)).toEqual([0, 1])
  })
})

describe('orderFlatNodes', () => {
  it('乱れた配列を DFS 行きがけ順へ戻し、到達不能なノードを末尾に残す', () => {
    const ordered = orderFlatNodes([
      { id: 'c', parentId: 'a' },
      { id: 'a', parentId: null },
      { id: 'x', parentId: 'y' },
      { id: 'b', parentId: 'a' },
      { id: 'y', parentId: 'x' },
    ])
    expect(ordered.map((n) => n.id)).toEqual(['a', 'c', 'b', 'x', 'y'])
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/core/canvas/flat-tree-core.test.ts`
Expected: FAIL（`Failed to resolve import "./flat-tree-core"`）

- [ ] **Step 3: `flat-tree-core.ts` を作る**

`src/core/canvas/flat-tree.ts` の本体を、`key` を落として移す。**`buildTree` の全域性の作り（循環＝根から到達できない集合、参照切れはルート扱い、到達不能の `parents` を `null` に倒す）を変えないこと。**

```ts
/**
 * 平坦配列を木に戻す純粋部分（index ベース。`key` を持たない）。
 *
 * **このファイルは登録 Skill へバイト一致でコピーされる**
 *（`.claude/skills/logic-tree-register/scripts/flat-tree-core.ts`）。
 * だから値 import・相対 import・enum を持たない——コピー先は Node の
 * 型ストリップでそのまま実行される。ズレは
 * `src/modules/logic-tree/skill-copy.test.ts` が検知し、制約違反は
 * `src/core/canvas/flat-tree-core.test.ts` が検知する。
 *
 * `key`（行の同一性）を被せるのは `flat-tree.ts` の役目である。Skill 側が
 * 要るのはルート位置・参照切れ・到達不能・DFS 行きがけ順だけで、`key` を
 * 作る `computeRowKeys` を値 import すると上の制約を満たせなくなる
 */

/** 平坦配列の1件が満たすべき最小の形。各ツールのノード型がこれを満たす */
export interface FlatNode {
  id: string
  parentId: string | null
}

/** 組み立てた木の節点（index ベース。同一性の鍵は `flat-tree.ts` が足す） */
export interface FlatTreeCoreNode {
  index: number
  children: FlatTreeCoreNode[]
}

export interface BuiltFlatTree {
  roots: FlatTreeCoreNode[]
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
export function buildFlatTree(nodes: readonly FlatNode[]): BuiltFlatTree {
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
  const build = (index: number, depth: number): FlatTreeCoreNode => {
    depths[index] = depth
    return {
      index,
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
    if (d === -1) {
      unreachable.push(i)
      // 到達不能＝循環の中にいる。parents を残すと「親を遡る」コードが
      // そこで無限ループする（この関数が全域である意味が消える）
      parents[i] = null
    }
  })

  return { roots, depths, parents, children, unreachable, missingParent }
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
export function orderFlatNodes<T extends FlatNode>(nodes: readonly T[]): T[] {
  const built = buildFlatTree(nodes)
  const out: T[] = []
  const walk = (node: FlatTreeCoreNode): void => {
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
export function subtreeEnd(built: { depths: readonly number[] }, index: number): number {
  const depth = built.depths[index]
  for (let j = index + 1; j < built.depths.length; j++) {
    if (built.depths[j] <= depth) return j
  }
  return built.depths.length
}

/** 兄弟（同じ親を持つノード）の配列位置を、並び順で返す */
export function siblingsOf(
  built: {
    parents: readonly (number | null)[]
    children: readonly number[][]
    roots: readonly { index: number }[]
  },
  index: number,
): number[] {
  const parent = built.parents[index]
  return parent === null ? built.roots.map((r) => r.index) : built.children[parent]
}
```

> **`built.children[parent]` をコピーせずそのまま返すこと。** 元の実装と同じ挙動を保つ（配列を複製すると呼び出し側の同一性が変わる）。`children: readonly number[][]` は外側だけが読み取り専用なので、内側の `number[]` はそのまま返せる。

- [ ] **Step 4: `flat-tree.ts` を薄い層に置き換える**

`src/core/canvas/flat-tree.ts` の中身を丸ごと次に差し替える。**公開 API（名前・型）を変えない。**

```ts
import {
  buildFlatTree,
  type BuiltFlatTree,
  type FlatNode,
  type FlatTreeCoreNode,
} from '@/core/canvas/flat-tree-core'
import { computeRowKeys } from '@/core/row-keys'

export type { FlatNode } from '@/core/canvas/flat-tree-core'
export { orderFlatNodes, siblingsOf, subtreeEnd } from '@/core/canvas/flat-tree-core'

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

export interface BuiltTree extends Omit<BuiltFlatTree, 'roots'> {
  roots: FlatTreeNode[]
}

/**
 * 平坦な配列を木に戻し、行の同一性の鍵を被せる。
 *
 * **木の組み立て自体は `flat-tree-core.ts` が持つ**——あちらは登録 Skill へ
 * バイト一致でコピーされるため値 import を持てず、`computeRowKeys` を
 * 使う本関数と分けてある（logic-tree-m2 で分離）
 */
export function buildTree(nodes: readonly FlatNode[]): BuiltTree {
  const core = buildFlatTree(nodes)
  const keys = computeRowKeys(nodes)
  const decorate = (node: FlatTreeCoreNode): FlatTreeNode => ({
    index: node.index,
    key: keys[node.index],
    id: nodes[node.index].id,
    children: node.children.map(decorate),
  })
  return { ...core, roots: core.roots.map(decorate) }
}
```

- [ ] **Step 5: 新旧テストがどちらも通ることを確認する**

Run: `npx vitest run src/core/canvas/ src/modules/logic-tree/ src/modules/issue-tree/ src/modules/sequence/`
Expected: PASS。**`src/core/canvas/flat-tree.test.ts` を1バイトも変えずに緑であること**（変更が必要になったら公開 API を壊している。差し替えを見直す）

- [ ] **Step 6: 型と lint を通す**

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/core/canvas/flat-tree-core.ts src/core/canvas/flat-tree-core.test.ts src/core/canvas/flat-tree.ts
git commit -m "refactor(core): flat-tree から key を持たない純粋部分を切り出す

登録 Skill へバイト一致コピーできる形にする。公開 API は変えない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Skill ディレクトリの骨格とコピー

Skill の入れ物・依存・ID 採番・2本のバイト一致コピーを置き、コピーのズレをテストで縛る。**書き出しスクリプトは Task 3 で作る。**

**Files:**
- Create: `.claude/skills/logic-tree-register/package.json`
- Create: `.claude/skills/logic-tree-register/.gitignore`
- Create: `.claude/skills/logic-tree-register/schemas/logic-tree.schema.json`（`schemas/logic-tree.schema.json` のバイト一致コピー）
- Create: `.claude/skills/logic-tree-register/scripts/canonical.ts`（`src/core/canonical.ts` のバイト一致コピー）
- Create: `.claude/skills/logic-tree-register/scripts/flat-tree-core.ts`（`src/core/canvas/flat-tree-core.ts` のバイト一致コピー）
- Create: `.claude/skills/logic-tree-register/scripts/new-id.mjs`
- Test: `src/modules/logic-tree/skill-copy.test.ts`

**Interfaces:**
- Consumes: Task 1 の `src/core/canvas/flat-tree-core.ts`
- Produces:
  - `node .claude/skills/logic-tree-register/scripts/new-id.mjs [件数] [--prefix node]` → `node_XXXXXXXXXX` を1行1件。誤ったプレフィクス・範囲外の件数は exit 2
  - `scripts/canonical.ts` が `serialize(value, schema)` と `stripBom(text)` を export（Task 3 が import する）
  - `scripts/flat-tree-core.ts` が `buildFlatTree` / `orderFlatNodes` を export（Task 3 が import する）

- [ ] **Step 1: コピーの一致を縛る失敗テストを書く**

`src/modules/logic-tree/skill-copy.test.ts` を新規作成する。

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractImportStatements, isValueImportStatement } from '@/core/import-analysis'

/**
 * 同梱 Skill（logic-tree-register）は、アプリのソース2本のバイト一致コピーを持つ。
 *
 * **なぜコピーなのか。** Skill はアプリがユーザーのプロジェクトフォルダへ
 * 置き直すため（src/core/skill-sync.ts）、実行時に src/ は存在しない。
 * 一方で手で複製すると「追従漏れがテストで検知されない」状態になる。
 * **バイト一致のコピー＋この検査**なら、ズレた瞬間に赤くなる
 */
const COPIES = [
  {
    app: 'src/core/canvas/flat-tree-core.ts',
    skill: '.claude/skills/logic-tree-register/scripts/flat-tree-core.ts',
  },
  {
    app: 'src/core/canonical.ts',
    skill: '.claude/skills/logic-tree-register/scripts/canonical.ts',
  },
]

describe.each(COPIES)('logic-tree-register 同梱の $app', ({ app, skill }) => {
  it('アプリ側とバイト一致する', () => {
    expect(readFileSync(skill)).toEqual(readFileSync(app))
  })

  it('値 import を持たない（コピーが Node で解決できる条件）', () => {
    // 値 import があるとコピー側で解決できず、logic-tree-write.mjs が落ちる。
    const src = readFileSync(app, 'utf8')
    expect(extractImportStatements(src).filter(isValueImportStatement)).toEqual([])
  })

  it('消去できない構文（enum / パラメータプロパティ）を持たない', () => {
    // 型ストリップは型注釈しか消せない。enum は実行時の値を持つので落ちる
    const src = readFileSync(app, 'utf8')
    expect(src).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\s/m)
    expect(src).not.toMatch(/constructor\s*\([^)]*\b(public|private|protected|readonly)\s/)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/modules/logic-tree/skill-copy.test.ts`
Expected: FAIL（`ENOENT` — `.claude/skills/logic-tree-register/scripts/...` が無い）

- [ ] **Step 3: ディレクトリとコピーを置く**

**`cp` で置く。手で書き写さない**（1バイトでも違うと Step 5 が赤くなる）。

```bash
mkdir -p .claude/skills/logic-tree-register/scripts .claude/skills/logic-tree-register/schemas
cp src/core/canonical.ts .claude/skills/logic-tree-register/scripts/canonical.ts
cp src/core/canvas/flat-tree-core.ts .claude/skills/logic-tree-register/scripts/flat-tree-core.ts
cp schemas/logic-tree.schema.json .claude/skills/logic-tree-register/schemas/logic-tree.schema.json
```

- [ ] **Step 4: `package.json` と `.gitignore` を作る**

`.claude/skills/logic-tree-register/package.json`:

```json
{
  "name": "logic-tree-register-skill",
  "private": true,
  "type": "module",
  "description": "ロジックツリー登録Skillの同梱スクリプト（ID採番・検証・正規形書き出し）",
  "dependencies": {
    "ajv": "^8.17.1"
  }
}
```

`.claude/skills/logic-tree-register/.gitignore`（**末尾に改行を入れない**——既存4本と同じ形にそろえる）:

```
node_modules/
package-lock.json
```

- [ ] **Step 5: コピーのテストが通ることを確認する**

Run: `npx vitest run src/modules/logic-tree/skill-copy.test.ts`
Expected: PASS（6件）

- [ ] **Step 6: `new-id.mjs` を作る**

`.claude/skills/logic-tree-register/scripts/new-id.mjs`:

```js
#!/usr/bin/env node
// ID採番。プロジェクトのID規約（overview-rev.md 5章）に従い
// <entityPrefix>_<英数字62文字アルファベットの nanoid 10文字> を出力する。
//
// 使い方:
//   node scripts/new-id.mjs                  → node_XXXXXXXXXX を1件
//   node scripts/new-id.mjs 15               → 15件（1行1件）
//
// ロジックツリーの ID は1種類（node）しか無い。--prefix を受けるのは
// 既存4本の登録 Skill とインタフェースを揃えるためで、node 以外は exit 2。
//
// 連番IDは禁止（アプリとAIが並行してノードを追加するため、連番は必ず衝突する）。
// 乱数は crypto.randomInt（偏りのない一様分布）を使う。

import { randomInt } from "node:crypto";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LENGTH = 10;

const argv = process.argv.slice(2);
let count = 1;
let prefix = "node";

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--prefix") {
    prefix = argv[++i];
  } else if (/^\d+$/.test(a)) {
    count = Number(a);
  } else {
    console.error(`不明な引数: ${a}`);
    process.exit(2);
  }
}

if (prefix !== "node") {
  console.error(
    `--prefix は node だけです（ロジックツリーのIDは1種類）: 受け取った値 = ${JSON.stringify(prefix)}`
  );
  process.exit(2);
}
if (count < 1 || count > 1000) {
  console.error(`件数は 1〜1000 の範囲で指定してください: ${count}`);
  process.exit(2);
}

const ids = [];
for (let n = 0; n < count; n++) {
  let body = "";
  for (let i = 0; i < LENGTH; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  ids.push(`${prefix}_${body}`);
}
process.stdout.write(ids.join("\n") + "\n");
```

- [ ] **Step 7: 採番を実際に動かして確かめる**

```bash
node .claude/skills/logic-tree-register/scripts/new-id.mjs 3
node .claude/skills/logic-tree-register/scripts/new-id.mjs --prefix issue; echo "exit=$?"
```

Expected: 1つ目は `node_` ＋英数字10文字が3行。2つ目は `--prefix は node だけです…` と **`exit=2`**

- [ ] **Step 8: コミット**

```bash
git add .claude/skills/logic-tree-register src/modules/logic-tree/skill-copy.test.ts
git commit -m "feat(logic-tree): 登録 Skill の骨格とバイト一致コピーを置く

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `logic-tree-write.mjs`（検証・整合性・DFS 正規化・書き出し）

スキーマ検証・整合性検証（4種）・DFS 行きがけ順への正規化・正規形での書き出し・未記入の集計を行う。**木の組み立てと並べ替えはコピー（`flat-tree-core.ts`）が持ち、手で複製するのは `findDuplicates`・4メッセージ・集計行の3つだけ。**

**Files:**
- Create: `.claude/skills/logic-tree-register/scripts/logic-tree-write.mjs`
- Test: `src/modules/logic-tree/skill-write.smoke.test.ts`

**Interfaces:**
- Consumes: Task 2 の `scripts/canonical.ts`（`serialize` / `stripBom`）と `scripts/flat-tree-core.ts`（`buildFlatTree` / `orderFlatNodes`）
- Produces:
  - `node scripts/logic-tree-write.mjs --in <下書き.json> --out <出力先.json>` → 正規形（キー順・DFS 順・LF・末尾改行）で書き出す
  - `node scripts/logic-tree-write.mjs --check <ファイル>` → 検証のみ
  - `--schema <path>` / 環境変数 `FACET_LOGIC_TREE_SCHEMA` でスキーマを明示できる
  - 終了コード 0＝成功（警告はあり得る）／1＝スキーマ検証失敗・JSON 破損／2＝使い方の誤り

- [ ] **Step 1: 依存を入れる**

```bash
cd .claude/skills/logic-tree-register && npm install && cd -
```

Expected: `node_modules/ajv` ができる。`.gitignore` により `git status` は汚れない（Step 8 で確認する）

- [ ] **Step 2: 実行 smoke テストを書く（まだ落ちる）**

`src/modules/logic-tree/skill-write.smoke.test.ts` を新規作成する。**アプリの `checkLogicTreeConsistency` と `tallyMissing`/`tallyLine` を実際に呼び、その出力が stdout に逐語で現れることを契約にする。**

```ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { tallyLine } from '@/core/missing-tally'
import { checkLogicTreeConsistency } from './consistency'
import { tallyMissing } from './missing'

/**
 * `logic-tree-write.mjs` を実際に spawn し、整合性警告の文言と要対応の
 * 集計行がアプリと一致していることを確かめる。
 *
 * consistency.ts はコアの `buildTree` / `findDuplicates` を値 import して
 * いるためバイト一致コピーにできず、スクリプト側は**文言だけ**手複製である
 *（木の組み立ては flat-tree-core.ts のコピーが持つ）。**文言のズレは実行結果の
 * 突き合わせでしか塞げない。** 加えて本テストは flat-tree-core.ts /
 * canonical.ts の型ストリップ import 経路を実際に読む唯一の実行テストを兼ねる
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCRIPT = path.join(REPO_ROOT, '.claude/skills/logic-tree-register/scripts/logic-tree-write.mjs')

/**
 * consistency.ts が message を出す4ブロックをすべて一度に炙り出す fixture。
 * スキーマ検証は通る形にしてある（ID は node_ ＋英数字10文字・全キー常在）
 */
const FIXTURE = {
  schemaVersion: 1,
  type: 'logicTree',
  title: '検証用',
  nodes: [
    // ルート1本目
    { id: 'node_AAAAAAAAAA', parentId: null, text: '応募が進まないのはどんなときか' },
    // 同一 ID → duplicate-id。空文字なので「（未記入・2番目）」で呼ばれる。ルート2本目
    { id: 'node_AAAAAAAAAA', parentId: null, text: '' },
    // 親が存在しない → missing-parent。ルートとして描かれるのでルート3本目
    { id: 'node_BBBBBBBBBB', parentId: 'node_ZZZZZZZZZZ', text: '親を消されたノード' },
    // 互いを親にする2件 → 根から到達できない＝ cyclic-parent
    { id: 'node_CCCCCCCCCC', parentId: 'node_DDDDDDDDDD', text: '循環その1' },
    { id: 'node_DDDDDDDDDD', parentId: 'node_CCCCCCCCCC', text: '循環その2' },
  ],
}

function run(args: string[]): { status: number; stdout: string } {
  try {
    return { status: 0, stdout: execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' }) }
  } catch (err) {
    const e = err as { status: number | null; stdout?: string }
    return { status: e.status ?? -1, stdout: e.stdout ?? '' }
  }
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), 'logic-tree-write-smoke-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function check(data: unknown): { status: number; stdout: string } {
  return withTempDir((dir) => {
    const file = path.join(dir, 'fixture.json')
    writeFileSync(file, JSON.stringify(data), 'utf8')
    return run(['--check', file])
  })
}

describe('logic-tree-write.mjs（実行 smoke ＋ 警告文言のアプリ一致）', () => {
  it('アプリの整合性 message がすべて stdout に逐語で現れる', () => {
    const issues = checkLogicTreeConsistency(FIXTURE as never)
    // fixture が退化していないことを先に固める（issues が空なら以降の
    // toContain が空回りで緑になる）
    expect(new Set(issues.map((i) => i.rule))).toEqual(
      new Set(['duplicate-id', 'cyclic-parent', 'missing-parent', 'multiple-root']),
    )
    expect(issues).toHaveLength(4)

    const { status, stdout } = check(FIXTURE)
    expect(status).toBe(0) // 警告は exit code を変えない（die は構文・スキーマ違反のみ）
    for (const issue of issues) expect(stdout).toContain(issue.message)
  }, 20000)

  it('要対応の集計行がアプリの tallyLine と逐語で一致する', () => {
    const { stdout } = check(FIXTURE)
    expect(stdout).toContain(tallyLine(tallyMissing(FIXTURE.nodes)))
  }, 20000)

  it('欠陥の無いファイルは警告なしの exit 0 で「要対応 0」', () => {
    const { status, stdout } = check({
      schemaVersion: 1,
      type: 'logicTree',
      title: '検証用',
      nodes: [
        { id: 'node_AAAAAAAAAA', parentId: null, text: '応募が進まないのはどんなときか' },
        { id: 'node_BBBBBBBBBB', parentId: 'node_AAAAAAAAAA', text: '応募そのものが成立しない' },
      ],
    })
    expect(status).toBe(0)
    expect(stdout).not.toContain('整合性の警告')
    expect(stdout).toContain(tallyLine({ total: 0, parts: [] }))
  }, 20000)

  it('--out は配列を DFS 行きがけ順に整えて正規形で書き出し、--check が冪等に通る', () => {
    // 兄弟の相対順（b → c）は変えずに、行きがけ順へ入れ替わること
    const scrambled = {
      schemaVersion: 1,
      type: 'logicTree',
      title: '並び順の検証',
      nodes: [
        { id: 'node_CCCCCCCCCC', parentId: 'node_BBBBBBBBBB', text: 'b の子' },
        { id: 'node_BBBBBBBBBB', parentId: 'node_AAAAAAAAAA', text: 'b' },
        { id: 'node_AAAAAAAAAA', parentId: null, text: '根' },
      ],
    }
    withTempDir((dir) => {
      const src = path.join(dir, 'draft.json')
      const dst = path.join(dir, 'out.json')
      writeFileSync(src, JSON.stringify(scrambled), 'utf8')

      expect(run(['--in', src, '--out', dst]).status).toBe(0)
      const written = readFileSync(dst, 'utf8')
      expect(JSON.parse(written).nodes.map((n: { id: string }) => n.id)).toEqual([
        'node_AAAAAAAAAA',
        'node_BBBBBBBBBB',
        'node_CCCCCCCCCC',
      ])
      expect(written.endsWith('}\n')).toBe(true)
      expect(written).not.toContain('\r')

      // 書き出したものを --check へ戻すと「正規形と一致」になる（冪等）
      const back = run(['--check', dst])
      expect(back.status).toBe(0)
      expect(back.stdout).toContain('正規形と一致しています')
    })
  }, 20000)

  it('スキーマ違反は exit 1', () => {
    const { status } = check({ schemaVersion: 1, type: 'logicTree', title: 'x', nodes: [{ id: 'bad', parentId: null, text: '' }] })
    expect(status).toBe(1)
  }, 20000)
})
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `npx vitest run src/modules/logic-tree/skill-write.smoke.test.ts`
Expected: FAIL（スクリプトが無いので `status` が -1 か 1、`stdout` が空）

- [ ] **Step 4: `logic-tree-write.mjs` を書く**

`.claude/skills/logic-tree-register/scripts/logic-tree-write.mjs`:

```js
#!/usr/bin/env node
// ロジックツリーファイルの検証＋正規形での書き出し。
//
// このスクリプトが担うのは4つ:
//   1. スキーマ検証（アプリと同一の logic-tree.schema.json を参照。同梱するコピーは
//      バイト一致がテストで強制されているので「古い版で通る」が起きない）
//   2. 配列順の正規化（DFS 行きがけ順。兄弟の相対順は変えない）
//   3. 正規化（キー順をスキーマの properties 記載順から実行時に導出し、LF・2スペース・
//      非ASCIIそのまま・末尾改行あり・BOMなしで書き出す）
//   4. 整合性検証（ID重複 / 循環 / 親の参照切れ / 多重ルート）と未記入の集計を報告する。
//      アプリ側のレベル2と同じ性質なので書き込みは止めない。
//
// **配列順の正規化を、既存2本と違ってここで行う。** sequence / issue-tree の
// 書き出しスクリプトは順序を触らない——あちらの normalizeOrder は値 import を
// 持つのでバイト一致コピーにできず、手複製の追従漏れがテストに映らないためである。
// ロジックツリーは flat-tree-core.ts（コピー）が orderFlatNodes を持つので、
// その制約が無い。アプリの normalizeOrder は編集コマンドからしか呼ばれず
// 「開くだけでは並びは整わない」ので、書く側で整えておくほうが安い。
//
// **木の組み立ては手で複製しない。** ./flat-tree-core.ts は
// src/core/canvas/flat-tree-core.ts のバイト一致コピーで、ズレは
// src/modules/logic-tree/skill-copy.test.ts が検知する。
//
// 使い方:
//   node scripts/logic-tree-write.mjs --in draft.json --out <project>/応募が進まないケース.json
//   node scripts/logic-tree-write.mjs --check <project>/応募が進まないケース.json
//   （--schema <path> でスキーマを明示指定できる。省略時は自動探索）
//
// 終了コード: 0=成功（警告はあり得る） / 1=スキーマ検証失敗 / 2=使い方の誤り

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const SKILL_DIR = path.resolve(fileURLToPath(import.meta.url), "../..");

// ---------- アプリのコピー（手で複製しない） ----------
//
// flat-tree-core.ts = 木の組み立てと DFS 行きがけ順（src/core/canvas/flat-tree-core.ts）
// canonical.ts      = 正規形シリアライザ（src/core/canonical.ts）
// どちらもバイト一致コピーで、ズレは src/modules/logic-tree/skill-copy.test.ts が検知する

let T, C;
try {
  [T, C] = await Promise.all([import("./flat-tree-core.ts"), import("./canonical.ts")]);
} catch (e) {
  die(
    2,
    `同梱の .ts を読み込めません。Node の型ストリップが要ります（22.18+ / 23.6+ / 24+。現在 ${process.version}）\n  ${e.message}`
  );
}

// ---------- 引数 ----------

const argv = process.argv.slice(2);
const opt = { in: null, out: null, check: null, schema: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--in") opt.in = argv[++i];
  else if (a === "--out") opt.out = argv[++i];
  else if (a === "--check") opt.check = argv[++i];
  else if (a === "--schema") opt.schema = argv[++i];
  else die(2, `不明な引数: ${a}`);
}
if (opt.check && (opt.in || opt.out)) die(2, "--check は --in/--out と併用できません。");
if (!opt.check && (!opt.in || !opt.out)) die(2, "--in <下書き.json> --out <ロジックツリー.json> か --check <file> を指定してください。");

const sourcePath = path.resolve(opt.check ?? opt.in);
const targetPath = opt.check ? null : path.resolve(opt.out);

// ---------- スキーマの解決（正は一つ。アプリと同じ実体を読む） ----------

function findSchema() {
  if (opt.schema) return path.resolve(opt.schema);
  if (process.env.FACET_LOGIC_TREE_SCHEMA) return path.resolve(process.env.FACET_LOGIC_TREE_SCHEMA);
  const starts = [path.dirname(targetPath ?? sourcePath), process.cwd(), SKILL_DIR];
  for (const start of starts) {
    let dir = path.resolve(start);
    for (;;) {
      for (const rel of ["logic-tree.schema.json", path.join("schemas", "logic-tree.schema.json")]) {
        const p = path.join(dir, rel);
        if (fs.existsSync(p)) return p;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  die(2, "logic-tree.schema.json が見つかりません。--schema <path> で指定してください。");
}

const schemaPath = findSchema();
const schema = readJson(schemaPath, "スキーマ");

// ---------- 入力 ----------

const data = readJson(sourcePath, "入力ファイル");

// ---------- スキーマ検証（不合格＝レベル1。アプリは開けない） ----------

let AjvCtor;
try {
  const m = require("ajv/dist/2020.js");
  AjvCtor = m.default ?? m;
} catch {
  die(2, `ajv が見つかりません。次を実行してください:\n  cd "${SKILL_DIR}" && npm install`);
}
const ajv = new AjvCtor({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

if (!validate(data)) {
  console.error(`✗ スキーマ検証に失敗しました（アプリはこのファイルを開けません）`);
  console.error(`  スキーマ: ${schemaPath}`);
  for (const e of validate.errors) {
    const at = e.instancePath || "(ルート)";
    const extra = e.params?.allowedValues ? `（許可値: ${e.params.allowedValues.join(", ")}）` : "";
    console.error(`  - ${at}: ${e.message}${extra}`);
  }
  console.error(`\n直してから再実行してください。IDは必ず scripts/new-id.mjs で採番します。`);
  process.exit(1);
}

// ---------- 配列順の正規化（DFS 行きがけ順） ----------
//
// 兄弟順の正本は配列順（rev 5章）なので、行きがけ順へ整えても意味は変わらない。
// 到達不能なノードは orderFlatNodes が末尾へ元の順で残す（消さない）

const ordered = { ...data, nodes: T.orderFlatNodes(data.nodes) };

// ---------- 正規化 ----------
//
// serialize がキー順（スキーマの properties 記載順）・2スペース・末尾改行を担う

const text = C.serialize(ordered, schema);

// ---------- 以降の報告は「入力ファイルの並び」で行う ----------
//
// **並べ替えた配列を見ないこと。** 整合性の message は
// 「（未記入・N番目）」のように**配列位置でノードを指す**ので、並べ替えた
// あとの位置で報告すると、アプリが同じファイルを開いたときの指し方と食い違う。
// アプリ（checkLogicTreeConsistency）が見るのは読み込んだファイルそのままの
// 並びであり、ここもそれに合わせる

const nodes = data.nodes ?? [];

// ---------- 整合性検証（レベル2相当。警告にとどめる） ----------
//
// アプリの src/modules/logic-tree/consistency.ts が message を出す4ブロックを
// そのまま見る。あちらは core の buildTree / findDuplicates を値 import して
// いるのでファイルごとのコピーにはできず、**文言だけ**ここで複製している
//（木の組み立ては flat-tree-core.ts のコピーが持つ）。**文言はアプリが正**——
// ズレると同じ問題が2つの言葉で説明され、ユーザーが別問題だと思う。
// ズレたら src/modules/logic-tree/skill-write.smoke.test.ts が赤くなる

const warnings = [];

/** 文言でノードを指す。空のノードは配列位置で呼ぶ（「（未記入）」だけだと区別できない） */
const label = (text_, index) =>
  text_.trim() === "" ? `（未記入・${index + 1}番目）` : `「${text_}」`;

/** 鍵ごとの配列位置のうち、2件以上のものだけ（core/duplicate.ts の findDuplicates） */
function findDuplicates(items, keyOf) {
  const groups = new Map();
  items.forEach((item, index) => {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [index]);
    else group.push(index);
  });
  const out = new Map();
  for (const [key, indices] of groups) if (indices.length > 1) out.set(key, indices);
  return out;
}

const built = T.buildFlatTree(nodes);

// ID 重複（ID は機械的識別子なので正規化しない完全一致）
for (const [id, indices] of findDuplicates(nodes, (n) => n.id)) {
  warnings.push(`ID が重複しています（${indices.length}件）: ${id}`);
}

// 循環（＝根から到達できないノード）。図に描かれないので、ここで見せないと
// 「ファイルにあるのに画面に無い」ノードが黙って生まれる
if (built.unreachable.length > 0) {
  warnings.push(
    `親子関係が循環しているノードがあります（${built.unreachable.length}件。図には表示されません）: ${built.unreachable
      .map((i) => label(nodes[i].text, i))
      .join("、")}`
  );
}

// 参照切れ。ルートとして描かれるため、下の multiple-root も同時に立つ
if (built.missingParent.length > 0) {
  warnings.push(
    `親が見つからないノードがあります（${built.missingParent.length}件）: ${built.missingParent
      .map((i) => label(nodes[i].text, i))
      .join("、")}`
  );
}

// ルートの単一性。0件は正常な状態（新規作成直後）
if (built.roots.length > 1) {
  warnings.push(
    `ルートが${built.roots.length}件あります（1本の木にしてください）: ${built.roots
      .map((r) => label(nodes[r.index].text, r.index))
      .join("、")}`
  );
}

if (targetPath) {
  const dir = path.dirname(targetPath);
  // 改行コードの担保（プロジェクト雛形の責務だが、雛形が無い場合に備えて気づけるようにする）
  if (fs.existsSync(path.join(dir, ".git")) && !hasJsonEolRule(dir)) {
    warnings.push(`.gitattributes に「*.json text eol=lf」がありません（autocrlf 環境で全行diffになります）`);
  }
}

// ---------- 要対応の集計（アプリの帯と同一規則） ----------
//
// ロジックツリーの欠落は「text が空のノード」1種類だけである
//（src/modules/logic-tree/missing.ts）。文言は src/core/missing-tally.ts の
// tallyLine が正で、ズレたら skill-write.smoke.test.ts が赤くなる

const blank = nodes.filter((n) => n.text === "").length;
const tallyLine = blank === 0 ? "要対応 0" : `⚠ 要対応 ${blank}（未記入 ${blank}）`;
const blankAt = nodes
  .map((n, i) => (n.text === "" ? `${i + 1}番目` : null))
  .filter((v) => v !== null);

// ---------- 書き出し ----------

if (targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, text, "utf8"); // LF・BOMなし・末尾改行あり
  console.log(`✓ 正規形で書き出しました: ${targetPath}`);
} else {
  const raw = fs.readFileSync(sourcePath, "utf8");
  console.log(`✓ スキーマ検証OK: ${sourcePath}`);
  console.log(raw === text ? "✓ 正規形と一致しています" : "△ 正規形と差があります（--in/--out で書き直せます）");
}
console.log(`  スキーマ: ${schemaPath}`);
console.log(`  ノード: ${nodes.length}件 ／ 深さ: ${maxDepth(built)}`);
console.log(`  ${tallyLine}`);
if (blankAt.length) console.log(`  未記入のノード: ${blankAt.join("、")}`);

if (warnings.length) {
  console.log(`\n⚠ 整合性の警告（アプリでは赤表示。ファイルは開けます）`);
  for (const w of warnings) console.log(`  - ${w}`);
}

// ---------- 補助 ----------

/** 根を 1 とした最大の深さ（0件なら 0）。報告用の数字であって検証には使わない */
function maxDepth(built_) {
  let max = 0;
  for (const d of built_.depths) if (d >= 0 && d + 1 > max) max = d + 1;
  return max;
}

function readJson(p, label_) {
  let raw;
  try { raw = fs.readFileSync(p, "utf8"); } catch { die(2, `${label_}が読めません: ${p}`); }
  try { return JSON.parse(C.stripBom(raw)); } catch (e) { die(1, `${label_}が JSON として壊れています: ${p}\n  ${e.message}`); }
}

function hasJsonEolRule(dir) {
  const p = path.join(dir, ".gitattributes");
  if (!fs.existsSync(p)) return false;
  return /^\s*\*(\.json)?\s+.*eol=lf/m.test(fs.readFileSync(p, "utf8"));
}

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}
```

- [ ] **Step 5: smoke テストが通ることを確認する**

Run: `npx vitest run src/modules/logic-tree/skill-write.smoke.test.ts`
Expected: PASS（5件）

**落ちたときの読み方**: 「message が stdout に無い」は文言のズレ（**アプリが正**。スクリプト側を直す）。「DFS 順が違う」は `orderFlatNodes` を通す位置の誤り（`serialize` の**前**に通すこと）。

- [ ] **Step 6: お手本で実際に動かす（スペックの完了条件1）**

```bash
node .claude/skills/logic-tree-register/scripts/logic-tree-write.mjs --check "sample-project/応募が書類選考に進まないケース.json"
```

Expected: `✓ スキーマ検証OK` ／ `✓ 正規形と一致しています` ／ `ノード: 15件` ／ **`⚠ 要対応 1（未記入 1）`** ／ 整合性の警告は**0件**

**`△ 正規形と差があります` が出たら、お手本を書き換えないこと。** 何が違うのか（キー順か配列順か）を突き止め、**報告に残す**（お手本は README の表と対になっており、書き換えると実機確認の前提が動く）。

- [ ] **Step 7: 冪等性を手でも確かめる**

```bash
node .claude/skills/logic-tree-register/scripts/logic-tree-write.mjs \
  --in "sample-project/応募が書類選考に進まないケース.json" --out /tmp/lt-roundtrip.json
diff "sample-project/応募が書類選考に進まないケース.json" /tmp/lt-roundtrip.json; echo "diff exit=$?"
```

Expected: `diff exit=0`（差が無い）。差が出たら Step 6 と同じ扱い（**お手本を書き換えない**）

- [ ] **Step 8: `git status` が汚れていないことを確認する**

Run: `git status --short`
Expected: `.claude/skills/logic-tree-register/node_modules/` と `package-lock.json` が**現れない**（Skill の `.gitignore` が効いている）

- [ ] **Step 9: コミット**

```bash
git add .claude/skills/logic-tree-register/scripts/logic-tree-write.mjs src/modules/logic-tree/skill-write.smoke.test.ts
git commit -m "feat(logic-tree): 書き出しスクリプト（検証・DFS 正規化・整合性・集計）を作る

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `SKILL.md`

会話・メモから木を起こして書き出すまでの手順書。**フェーズB を持たない1フェーズの Skill** であることと、`issue-tree-register` との境界を明示する。

**Files:**
- Create: `.claude/skills/logic-tree-register/SKILL.md`

**Interfaces:**
- Consumes: Task 2 の `new-id.mjs`、Task 3 の `logic-tree-write.mjs`
- Produces: `name: logic-tree-register` の frontmatter（Task 5 の `BUNDLED_SKILLS` 登録が前提にする）

- [ ] **Step 1: frontmatter を書く**

`description` は**次を逐語で使う**（起動語と境界の1文が入っている）:

```markdown
---
name: logic-tree-register
description: 仕様整理ツールのロジックツリーファイル（type=logicTree / schemaVersion 1 の JSON）を、会話やメモの内容から作成・追記・更新する。「ロジックツリーを作って」「ツリーにして」といった依頼のほか、「どんなときに◯◯になるか洗い出して」「ケースを網羅して」「パターンを整理して」「原因を分解して」「MECE に分けて」と言われたとき、場合分け・分岐の網羅を頼まれたとき、プロジェクトフォルダに type: logicTree の JSON があるときは、明示的に「ロジックツリー」と言われていなくてもこのSkillを使うこと。ただし仮説・検証・PoC・支持／棄却・見送りを伴う整理は課題ツリー（issue-tree-register）の担当なので、そちらを使う。IDの採番とスキーマ検証・正規形での書き出しは同梱スクリプトが行うため、手書きでJSONを作らない。
---
```

- [ ] **Step 2: 本文を書く**

以下の節を、この順で書く。**太字で示した文は逐語で入れる**（規律の要であり、言い換えると効かなくなる）。

**冒頭**

- 「仕様整理ツール（Tauri製アプリ）のロジックツリーファイルを、会話やメモの内容から組み立てる」
- **「このSkillが紐づく対象: `type: "logicTree"` × `schemaVersion 1`。」** スキーマが改訂されたらこのSkillも追従させる
- **「木の組み立てと DFS 行きがけ順の正規化（`scripts/flat-tree-core.ts`）はアプリの `src/core/canvas/flat-tree-core.ts` のバイト一致コピーである。手で編集しない。」** 直すときはアプリ側を直してコピーし直す
- **「このSkillはフェーズを1つしか持たない。」** シーケンス・課題ツリーの「問いを詰めるフェーズB」に当たるものは無い——ロジックツリーのスキーマには問いの仕組みが無く、欠落は「`text` が空」1種類だけだからである
- 初回のみ Skill ディレクトリで `npm install`（ajv）。**Node は型ストリップがフラグ無しで動く版が要る**（22.18+ / 23.6+ / 24+）

**1. 対象を決める**

- **ロジックツリーはプロジェクトに何本あってもよい**（`singleton: false`）
- **既定は新規作成。** プロジェクト内の `type: "logicTree"` を探して追記しない
- **既存への書き足しは、ユーザーが名指ししたときだけ**
- ファイル名は `title` 由来。**既存と衝突したら報告して確認する**（勝手に上書きしない）
- **単一性の警告は出さない。** 複数本あるのは正常な状態である
- **アプリでそのプロジェクトを開いたまま作業しない。** 自動保存で書き戻されるため、同時編集は片方の変更を消す。作業前に「アプリで開いているなら閉じてください」と一言伝える
- `title` は会話から付けて**報告で伝える**（確認は取らない。違えばユーザーがアプリで直せる）

**2. 材料を見分ける**

| 材料 | 振る舞い |
| --- | --- |
| 会話・メモに論点が出ている | **転記する。** 言葉もなるべくそのまま使う |
| テーマだけ渡された | **AI が下書きを起こす** |

- **どこが人間発でどこが AI 発かは、報告文で分ける。** ロジックツリーには `notes` に相当する欄が無く、**出どころはファイルに残らない**。報告文が唯一の伝達手段である

**3. 木を組む**

- **ルートは1つ。** 複数ルートは整合性の警告になる
- **ルートには問いの形を置く**（「応募が書類選考に進まないのはどんなときか」）。これが木の読み方を決める
- **同じ親の子は1つの軸で分ける。** 「原因」と「時期」を同じ層に混ぜない
- **配列は DFS 行きがけ順で下書きする**（スクリプトが整えるが、下書きの時点で揃えておくと差分が読める）
- **`text` の空文字は「未記入」であって欠陥ではない。** 埋まらないものを推測で埋めない
- **座標・幅・折りたたみ状態をデータに入れない**（図はデータから毎回導出される）

**4. ID採番**

```
node scripts/new-id.mjs 15               → node_XXXXXXXXXX を15件
```

- **IDを自分で書かない。** 必ずこのスクリプトの出力をそのまま使う。連番も禁止
- **既存の `id` は絶対に変更しない**（不変ID）

**5. 書き込み**

- **下書きは対象プロジェクトフォルダの外に置く。** 中に置くと、アプリのファイル一覧に下書きが本物として並ぶ

```
node scripts/logic-tree-write.mjs --in <下書き.json> --out <プロジェクト>/<タイトル>.json
```

- 検証だけしたいときは `--check <ファイル>`。終了コードは 0＝成功（警告はあり得る）／1＝スキーマ検証失敗／2＝使い方の誤り。**0 でも未記入の集計と整合性の警告は出ている**ので、終了コードだけを見ず標準出力を読むこと
- スキーマは同梱コピー → `--schema <path>` → 環境変数 `FACET_LOGIC_TREE_SCHEMA` の順で探索する
- **書き出すと配列は DFS 行きがけ順に並び替わる。** 既存ファイルが既に行きがけ順なら差分は追加分だけだが、乱れた順のファイルを渡すと配列全体が動く。その場合は報告で伝える

構造の例（詳細は `schemas/logic-tree.schema.json` を読む。スキーマが正）:

```json
{
  "schemaVersion": 1,
  "type": "logicTree",
  "title": "応募が書類選考に進まないケース",
  "nodes": [
    { "id": "node_Bbq4uYt1Hi", "parentId": null, "text": "応募が書類選考に進まないのはどんなときか" },
    { "id": "node_ws5egePuG4", "parentId": "node_Bbq4uYt1Hi", "text": "応募そのものが成立しない" }
  ]
}
```

**全キー常在である**（`id` / `parentId` / `text` は必ず置く。`parentId` はルートだけ `null`）。

**警告が出たときの扱いは、出どころで分ける**

| 出どころ | 扱い |
| --- | --- |
| **今回このSkillが書いた部分**の警告 | **自分の書き間違い。直して再実行する**（ユーザーに聞かない） |
| **既存ファイルに元からあった**警告 | **報告して確認する。勝手に直さない** |

**6. 報告**

- 作ったファイルのパスと `title`
- ノード数と深さ
- **AI が起こした枝**（会話に無かったもの）
- `⚠ 要対応 N（未記入 N）`（アプリの帯と同じ文言。言い換えない）
- 整合性の警告があれば、何が衝突しているか

**7. 既存ファイルへの書き足し**

1. 既存ファイルを読み、**どの木か**をユーザーに確定させる（名前が似ているものがあるので勝手に選ばない）
2. **既存の JSON 全体を下書きに含め、足す枝だけを加えて**書き出す（既存ノードに新しいIDを採番しない）
3. 守ること: **`id` を変えない** ／ **`title` を書き換えない** ／ **触っていないノードを1バイトも変えない**
4. 書き出したら `git diff` に出る行が意図した範囲に収まっているかをユーザーに伝える

**やらないこと**

- **会話に無い枝を「網羅のため」に足して、人間の決定として報告しない**（下書きとして起こしたものは下書きと呼ぶ）
- **網羅性を主張しない。** 「これで全部のケースが拾えました」と言わない
- **未記入を催促しない**
- **仮説・検証・判断を木に持たせない。** それは課題ツリーの担当である（`issue-tree-register`）
- **複数ルートを作らない**（1ファイル＝1本の木）
- **座標・行番号・幅をデータに入れない**
- **MCP的な書き込みツールを作らない。** アプリとの接点はファイルだけ（決定済み。蒸し返さない）
- **既存データの勝手な整形・並べ替え・言い換えをしない**

- [ ] **Step 3: frontmatter が読めることを確認する**

Run: `node -e "const s=require('fs').readFileSync('.claude/skills/logic-tree-register/SKILL.md','utf8'); const m=s.match(/^---\n([\s\S]*?)\n---/); console.log(m ? m[1].split('\n')[0] : 'NO FRONTMATTER')"`
Expected: `name: logic-tree-register`

- [ ] **Step 4: コミット**

```bash
git add .claude/skills/logic-tree-register/SKILL.md
git commit -m "docs(logic-tree): 登録 Skill の手順書を書く

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: アプリへの登録と、canonical コピーの網羅アサーション

`BUNDLED_SKILLS` に載せて配布経路に乗せる。あわせて `canonical.ts` のコピー検査に**網羅アサーション**を置き、台帳の残件（`[issue-tree-m2]`「書き忘れても緑で通る」）を1件畳む。

**Files:**
- Modify: `src/core/skill-sync.ts:21-26`（`BUNDLED_SKILLS`）
- Modify: `src/core/skill-sync.test.ts:330-341`（配列リテラルとテスト名の件数）
- Modify: `src/core/skill-schema-copy.test.ts`（`SCHEMA_COPIES` に5本目）
- Modify: `src/core/skill-canonical-copy.test.ts`（全面。5本を1つの表に集約し、網羅アサーションを足す）
- Modify: `src/core/reading-guide.md:66`（Skill 名の一覧）

**Interfaces:**
- Consumes: Task 4 の `SKILL.md`（`BUNDLED_SKILLS` に載せる Skill は SKILL.md を持っていなければならない）
- Produces: `BUNDLED_SKILLS` が5要素になる

- [ ] **Step 1: 失敗させてから直す（`skill-sync.test.ts`）**

`src/core/skill-sync.test.ts:331` のテスト名と配列リテラルを更新する。

```ts
  it('ユーザーのデータを作る Skill が5本とも載っている', () => {
    // アプリが置き直さない Skill は、プロジェクトフォルダで claude を起動した
    // ユーザーには存在しない。ここから漏れると Skill が黙って使えなくなる
    expect([...BUNDLED_SKILLS]).toEqual([
      'glossary-term-register',
      'error-catalog-register',
      'sequence-register',
      'issue-tree-register',
      'logic-tree-register',
    ])
  })
```

Run: `npx vitest run src/core/skill-sync.test.ts`
Expected: FAIL（`BUNDLED_SKILLS` はまだ4要素）

- [ ] **Step 2: `BUNDLED_SKILLS` に足す**

`src/core/skill-sync.ts:21-26`:

```ts
export const BUNDLED_SKILLS: readonly string[] = [
  'glossary-term-register',
  'error-catalog-register',
  'sequence-register',
  'issue-tree-register',
  'logic-tree-register',
]
```

Run: `npx vitest run src/core/skill-sync.test.ts`
Expected: PASS

- [ ] **Step 3: `SCHEMA_COPIES` に5本目を足す**

`src/core/skill-schema-copy.test.ts` の `SCHEMA_COPIES` 配列の末尾に追加する。

```ts
  {
    skill: 'logic-tree-register',
    schema: 'logic-tree.schema.json',
    script: 'scripts/logic-tree-write.mjs',
  },
```

Run: `npx vitest run src/core/skill-schema-copy.test.ts`
Expected: PASS（網羅アサーション「BUNDLED_SKILLS のすべてを網羅する」を含む）

- [ ] **Step 4: `skill-canonical-copy.test.ts` を全面的に置き換える**

いまの `COPIES` は旧2本しか見ておらず、sequence / issue-tree の分は各モジュールのテストに散っている（**同種の網羅アサーションがどこにも無い**）。**5本を1つの表に集約し、網羅を強制する。**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUNDLED_SKILLS } from './skill-sync'

/**
 * すべての同梱 Skill は src/core/canonical.ts のバイト一致コピーを持つ
 *（sequence-register が確立した方式——手複製は追従漏れが検知されない）。
 *
 * **この表は網羅を強制するためにある。** かつて検査は3ファイルに散っていて
 *（旧2本＝ここ／sequence・issue-tree＝各モジュールの skill-copy.test.ts）、
 * 新しい Skill がコピーを持ったのに検査を書き忘れても緑で通った。
 * logic-tree-m2 で1箇所へ集約し、`SCHEMA_COPIES` と同型の網羅アサーションを
 * 置いた。**6本目を足した人は、ここに足さないと赤くなる。**
 *
 * 「値 import を持たないこと」の検査は元ファイル共通なので各モジュールの
 * skill-copy.test.ts に任せる（あちらは自分のモジュール固有のコピーも見る）
 */
const CANONICAL_COPIES = [
  { skill: 'glossary-term-register' },
  { skill: 'error-catalog-register' },
  { skill: 'sequence-register' },
  { skill: 'issue-tree-register' },
  { skill: 'logic-tree-register' },
]

describe('canonical.ts のバイト一致コピー', () => {
  it('BUNDLED_SKILLS のすべてを網羅する', () => {
    expect(CANONICAL_COPIES.map((c) => c.skill).sort()).toEqual([...BUNDLED_SKILLS].sort())
  })

  it.each(CANONICAL_COPIES)('$skill が src/core/canonical.ts とバイト一致する', ({ skill }) => {
    expect(readFileSync(`.claude/skills/${skill}/scripts/canonical.ts`)).toEqual(
      readFileSync('src/core/canonical.ts'),
    )
  })
})
```

> **`CANONICAL_COPIES` を `BUNDLED_SKILLS` から導出しないこと。** `map` で作ると網羅アサーションが自分自身を比べるだけの**恒真式**になり、何も縛らなくなる。`SCHEMA_COPIES` と同じく**手で書いた配列リテラル**にして、6本目を足した人がここにも足さないと赤くなる状態にする。

**既存の `src/modules/sequence/skill-copy.test.ts` と `src/modules/issue-tree/skill-copy.test.ts` から `canonical.ts` の行を消さないこと。** あちらは同じファイルに対して「値 import を持たない」「enum を持たない」も回しており、消すと検査が減る。バイト一致の二重チェックは無害である。

Run: `npx vitest run src/core/skill-canonical-copy.test.ts`
Expected: PASS（網羅1件 ＋ バイト一致5件）

- [ ] **Step 5: `reading-guide.md` の Skill 名一覧に足す**

`src/core/reading-guide.md:66` の一文を、次のとおり `logic-tree-register` を含む形へ直す（**この箇所を縛るテストは無い。忘れても緑で通る**）。

```
このフォルダの JSON を直接手で編集しない。`.claude/skills/` に登録用 Skill（glossary-term-register / error-catalog-register / sequence-register / issue-tree-register / logic-tree-register）があれば必ずそれを使う（ID 採番・スキーマ検証・正規形書き出しを通すため）。
```

（同じ文の後半「Skill が無い種類のファイルを編集する場合も、最低限次を守る…」以降は**変えない**）

- [ ] **Step 6: 全体が緑であることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

- [ ] **Step 7: コミット**

```bash
git add src/core/skill-sync.ts src/core/skill-sync.test.ts src/core/skill-schema-copy.test.ts src/core/skill-canonical-copy.test.ts src/core/reading-guide.md
git commit -m "feat(core): logic-tree-register を同梱 Skill に登録し、canonical コピーの網羅を強制する

canonical.ts のコピー検査が3ファイルに散っていて書き忘れても緑で通る問題
（open-issues の [issue-tree-m2]）を、1箇所への集約と網羅アサーションで畳む。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: evals（起動精度と出力の機械判定）

`sequence-register/evals/` と同じ形。**5ケースのうち2ケースを `issue-tree-register` との誤起動の実測に割く。** `evals/` は配布されない（`shouldSyncSkillFile` が除外する）。

**Files:**
- Create: `.claude/skills/logic-tree-register/evals/evals.json`
- Create: `.claude/skills/logic-tree-register/evals/grade.mjs`
- Create: `.claude/skills/logic-tree-register/evals/fixtures/existing-project/応募が書類選考に進まないケース.json`

**Interfaces:**
- Consumes: Task 3 の `logic-tree-write.mjs`（`--check` を spawn して判定に使う）
- Produces: `node evals/grade.mjs <iteration-dir>` が各 run ディレクトリに `grading.json` を書く

- [ ] **Step 1: fixture を置く**

`evals/fixtures/existing-project/応募が書類選考に進まないケース.json` を、**お手本のコピーではなく eval 専用の小さな木**として作る（お手本を参照すると、お手本を直したとき eval が黙って壊れる）。ID は `new-id.mjs` で採番したものを使わず、**判定で名指しできる固定値**にする。

```json
{
  "schemaVersion": 1,
  "type": "logicTree",
  "title": "応募が書類選考に進まないケース",
  "nodes": [
    { "id": "node_Aa1Bb2Cc3D", "parentId": null, "text": "応募が書類選考に進まないのはどんなときか" },
    { "id": "node_Ee4Ff5Gg6H", "parentId": "node_Aa1Bb2Cc3D", "text": "応募そのものが成立しない" },
    { "id": "node_Ii7Jj8Kk9L", "parentId": "node_Ee4Ff5Gg6H", "text": "応募フォームの送信に失敗した" }
  ]
}
```

- [ ] **Step 2: `evals.json` を書く**

```json
{
  "skill_name": "logic-tree-register",
  "evals": [
    {
      "id": 0,
      "name": "new-tree-from-theme",
      "prompt": "採用管理の話をしています。応募者が選考の途中で離脱するのはどんなときか、ケースを洗い出しておきたいです。プロジェクトフォルダは <PROJECT_DIR> です。",
      "expected_output": "<PROJECT_DIR> に type=logicTree の JSON が1つ作られる。ルートが1つだけで、ルートの text が問いの形になっている。すべての id が node_ ＋英数字10文字。ファイルは正規形（キー順・LF・末尾改行）で、nodes の配列が DFS 行きがけ順に並んでいる。type=issueTree のファイルは作られていない。",
      "files": []
    },
    {
      "id": 1,
      "name": "transcribe-conversation",
      "prompt": "さっきの打ち合わせで、応募が書類選考に進まない原因を3つ挙げました。応募フォームの送信に失敗した場合、添付書類の形式が対象外だった場合、同じ求人に重複応募した場合です。これをツリーにしてください。プロジェクトフォルダは <PROJECT_DIR> です。",
      "expected_output": "type=logicTree の JSON が1つ作られる。会話に出た3つの原因が枝として入っており、会話に出ていない原因（例: 選考担当の見落とし、応募資格の不一致）を AI が足していない。ルートは会話の主題を問いの形にしたもの1つだけ。",
      "files": []
    },
    {
      "id": 2,
      "name": "route-to-logic-tree",
      "prompt": "決済のバッチが夜間に失敗することがあります。どんなときに失敗するのか、パターンを整理しておきたいです。プロジェクトフォルダは <PROJECT_DIR> です。",
      "expected_output": "type=logicTree の JSON が作られる。type=issueTree の JSON は作られていない（「整理」「パターン」は課題ツリーではなくロジックツリーの担当）。",
      "files": []
    },
    {
      "id": 3,
      "name": "defer-to-issue-tree",
      "prompt": "適性検査サービスの連携について PoC をやります。何を確かめるべきか、仮説を立てて整理しておきたいです。プロジェクトフォルダは <PROJECT_DIR> です。",
      "expected_output": "type=logicTree の JSON が作られていない。仮説・検証を伴う整理は課題ツリー（issue-tree-register）の担当なので、そちらへ譲っている（issueTree の JSON が作られるか、課題ツリーの Skill を使う旨を伝えている）。",
      "files": []
    },
    {
      "id": 4,
      "name": "append-to-existing",
      "prompt": "<PROJECT_DIR> の「応募が書類選考に進まないケース」の木に、応募そのものが成立しない場合として「添付書類の形式・サイズが対象外だった」を足してください。",
      "expected_output": "既存の 応募が書類選考に進まないケース.json が更新される（2つ目のファイルを作らない）。node_Aa1Bb2Cc3D / node_Ee4Ff5Gg6H / node_Ii7Jj8Kk9L の id と text が1バイトも変わらず、title も変わらない。足されたノードの parentId が node_Ee4Ff5Gg6H で、id は新しく採番された node_ ＋英数字10文字。",
      "files": ["fixtures/existing-project/応募が書類選考に進まないケース.json"]
    }
  ]
}
```

- [ ] **Step 3: `grade.mjs` を書く**

`sequence-register/evals/grade.mjs` と同じ骨格。**ケース2・3は `type` 別のファイル本数で判定する**（誤起動は「どちらの型のファイルが増えたか」で機械的に見える）。

```js
// テストケースの機械判定。
// 使い方: node evals/grade.mjs <iteration-dir>
// 各 run ディレクトリに grading.json を書き出す。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ITER = path.resolve(process.argv[2] ?? ".");
const SKILL = path.resolve(fileURLToPath(import.meta.url), "../..");
const SCHEMA = path.resolve(SKILL, "schemas/logic-tree.schema.json");
const NODE_RE = /^node_[A-Za-z0-9]{10}$/;

/** プロジェクト内の JSON を走査し、type ごとに拾う */
function filesOfType(dir, type) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!e.name.toLowerCase().endsWith(".json")) continue;
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
        if (j?.type === type) out.push({ path: p, json: j });
      } catch { /* 壊れたJSONは数えない */ }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/** スキーマ検証・正規形・整合性の警告をスクリプトから取る */
function inspect(file) {
  try {
    const out = execFileSync(
      "node",
      [path.join(SKILL, "scripts/logic-tree-write.mjs"), "--check", file, "--schema", SCHEMA],
      { encoding: "utf8" }
    );
    return { schemaOk: true, canonicalOk: out.includes("正規形と一致"), warned: out.includes("整合性の警告"), out };
  } catch {
    return { schemaOk: false, canonicalOk: false, warned: true, out: "" };
  }
}

/**
 * nodes が DFS 行きがけ順に並んでいるか（--check の「正規形と一致」にも含まれるが、単独でも見る）。
 *
 * 祖先を積んだスタックを持ち、各ノードの親が**スタックの上から辿って見つかる**
 * ことを要求する。**「親が既出か」だけを見ると不十分**——[A, B(A), D(A), C(B)]
 * のような、親は既出だが行きがけ順ではない並びを通してしまう
 */
function isDfsOrdered(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  const stack = [];
  for (const n of nodes) {
    // 親が居ない・参照切れのノードは、ルートとして描かれる＝スタックを畳む
    if (n.parentId === null || !ids.has(n.parentId)) {
      stack.length = 0;
    } else {
      while (stack.length && stack[stack.length - 1] !== n.parentId) stack.pop();
      if (stack.length === 0) return false; // 親が祖先の連なりに無い＝行きがけ順ではない
    }
    stack.push(n.id);
  }
  return true;
}

function rootsOf(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes.filter((n) => n.parentId === null || !ids.has(n.parentId));
}

function grade(runDir) {
  const project = path.join(runDir, "project");
  const trees = filesOfType(project, "logicTree");
  const issueTrees = filesOfType(project, "issueTree");
  const checks = [];
  const add = (name, ok, note = "") => checks.push({ name, ok, note });

  const evalId = Number(path.basename(runDir).split("-")[0]);

  if (evalId === 3) {
    // 課題ツリーへ譲るべきケース。logicTree を作っていないことが合格
    add("logicTree を作っていない", trees.length === 0, `logicTree=${trees.length}`);
    return checks;
  }

  add("logicTree が1つある", trees.length === 1, `logicTree=${trees.length}`);
  add("issueTree を作っていない", issueTrees.length === 0, `issueTree=${issueTrees.length}`);
  if (trees.length !== 1) return checks;

  const { path: file, json } = trees[0];
  const nodes = json.nodes ?? [];
  const info = inspect(file);

  add("スキーマ検証を通る", info.schemaOk);
  add("正規形と一致する", info.canonicalOk);
  add("整合性の警告が無い", !info.warned);
  add("ルートが1つ", rootsOf(nodes).length === 1, `roots=${rootsOf(nodes).length}`);
  add("すべての id が node_ ＋英数字10文字", nodes.every((n) => NODE_RE.test(n.id)));
  add("nodes が DFS 行きがけ順", isDfsOrdered(nodes));

  if (evalId === 4) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    add("title が変わっていない", json.title === "応募が書類選考に進まないケース", json.title);
    add(
      "既存3ノードの text が変わっていない",
      byId.get("node_Aa1Bb2Cc3D")?.text === "応募が書類選考に進まないのはどんなときか" &&
        byId.get("node_Ee4Ff5Gg6H")?.text === "応募そのものが成立しない" &&
        byId.get("node_Ii7Jj8Kk9L")?.text === "応募フォームの送信に失敗した"
    );
    add("ノードが1つ増えている", nodes.length === 4, `nodes=${nodes.length}`);
    const added = nodes.filter((n) => !["node_Aa1Bb2Cc3D", "node_Ee4Ff5Gg6H", "node_Ii7Jj8Kk9L"].includes(n.id));
    add("足したノードの親が node_Ee4Ff5Gg6H", added.length === 1 && added[0].parentId === "node_Ee4Ff5Gg6H");
  }

  return checks;
}

for (const name of fs.readdirSync(ITER)) {
  const runDir = path.join(ITER, name);
  if (!fs.statSync(runDir).isDirectory()) continue;
  const checks = grade(runDir);
  const passed = checks.every((c) => c.ok);
  fs.writeFileSync(
    path.join(runDir, "grading.json"),
    JSON.stringify({ run: name, passed, checks }, null, 2) + "\n",
    "utf8"
  );
  console.log(`${passed ? "PASS" : "FAIL"} ${name}  (${checks.filter((c) => c.ok).length}/${checks.length})`);
}
```

- [ ] **Step 4: `grade.mjs` が動くことを手で確かめる**

evals の実行ハーネス自体は無いので、**判定器だけを合成データで動かす**。

```bash
mkdir -p /tmp/lt-eval/0-new-tree-from-theme/project
cp .claude/skills/logic-tree-register/evals/fixtures/existing-project/応募が書類選考に進まないケース.json /tmp/lt-eval/0-new-tree-from-theme/project/
node .claude/skills/logic-tree-register/evals/grade.mjs /tmp/lt-eval
cat /tmp/lt-eval/0-new-tree-from-theme/grading.json
```

Expected: `PASS 0-new-tree-from-theme` と、`grading.json` に6件の `checks` が全部 `ok: true` で入る（fixture は単一ルート・DFS 順・正規形なので全項目通る）

- [ ] **Step 5: `evals/` が配布されないことを確認する**

Run: `npx vitest run src/core/skill-sync.test.ts src/core/skill-schema-copy.test.ts`
Expected: PASS（`shouldSyncSkillFile('evals/evals.json')` が false であることは既存テストが見ている）

- [ ] **Step 6: コミット**

```bash
git add .claude/skills/logic-tree-register/evals
git commit -m "test(logic-tree): 登録 Skill の evals を置く（課題ツリーとの誤起動を2ケースで測る）

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: ドキュメント反映と申し送り

rev（正）・README・docs の地図・台帳・申し送りを更新する。**rev への反映は完了コミットで済ませ、TODO として申し送りに残さない**（M4 の教訓）。

**Files:**
- Modify: `README.md:144`（お手本の表の行——**中身は変えないので確認のみ**）／`README.md:155`（Skill の本数と一覧）
- Modify: `docs/README.md`（「リポジトリ内の他の『正』」の Skill の説明、マイルストーンの履歴の表）
- Modify: `docs/overview-rev.md:17`（2章のロジックツリーの行に実装状況を添える）／4章（同梱 Skill 5本・バイト一致コピー3例目・smoke 5スクリプト）／`docs/overview-rev.md:235`（シーケンスの出力プロファイルの古い記述を正す）
- Modify: `docs/open-issues.md`
- Create: `docs/history/logic-tree-m2-register-skill.md`

**Interfaces:**
- Consumes: Task 1〜6 の実装結果（申し送りは**実測した事実**を書く。計画の予定を書かない）
- Produces: なし（最終タスク）

- [ ] **Step 1: `README.md` の Skill の本数を直す**

`README.md:155` の一文を次に置き換える。

```
プロジェクトフォルダを開くと、`.claude/skills/` に登録用 Skill が5本置かれる（`glossary-term-register` / `error-catalog-register` / `sequence-register` / `issue-tree-register` / `logic-tree-register`）。**会話でヒアリングしながらデータを組み立てる** ためのもので、ID の採番・スキーマ検証・正規形での書き出しは同梱スクリプトが行う。手書きの JSON が混ざらない。
```

**`README.md:125` の「5ツールを同じ題材で埋めたお手本」と `README.md:144` のお手本の表は変えない**（ツールの数は増えていない。増えたのは Skill の数である）。

- [ ] **Step 2: `docs/README.md` を直す**

2箇所。

1. 「リポジトリ内の他の『正』」の `.claude/skills/` の項——「ユーザーのデータを作るもの（用語集・エラーカタログ・シーケンス・課題ツリー。…）」に**ロジックツリー**を足す
2. 「マイルストーンの履歴」の表の末尾に行を足す

```
| [logic-tree-m2](history/logic-tree-m2-register-skill.md) | ロジックツリー登録 Skill（会話→ JSON）と flat-tree の分割 | ロジックツリー・コア |
```

- [ ] **Step 3: `docs/overview-rev.md` 2章のロジックツリーの行に実装状況を添える**

`docs/overview-rev.md:17` は現在「1. ロジックツリーエディタ — 分岐・パターンの網羅」だけで、実装状況を持たない（6番目の課題ツリーの行は持っている）。同じ形で添える。

```
1. ロジックツリーエディタ — 分岐・パターンの網羅（**エディタは logic-tree M1、登録 Skill（`logic-tree-register`）は logic-tree-m2 で実装済み。後続は出力プロファイルのみ**）
```

- [ ] **Step 4: `docs/overview-rev.md` 4章を直す**

`grep -n "同梱 Skill\|バイト一致\|4本\|4スクリプト" docs/overview-rev.md` で該当箇所を洗い出し、次の3点を反映する。

1. 同梱 Skill が**5本**になったこと
2. バイト一致コピーが `questions.ts`（sequence M4）・`derive.ts`（issue-tree-m2）に続く**3例目**（`flat-tree-core.ts`）であること。**今回は「先に JSDoc へ制約を書く」ではなく「制約を満たすようにファイルを切り出した」形である**——既存関数に値 import があったので、コピーする側の都合でコアを分割した。**この形は初めてなので、そう書く**
3. 実行 smoke テストが「4スクリプト」→**5スクリプト**

- [ ] **Step 5: `docs/overview-rev.md:235` の古い記述を正す**

現在「用語集は現時点で1プロファイル、ロジックツリーとシーケンスは0本（それぞれ M2 以降で足す）」だが、**シーケンスは sequence-m3 で Markdown と Mermaid を持った**（`src/modules/sequence/markdown.ts` / `mermaid.ts`）。ロジックツリーが0本なのは正しい。

```
  - 用語集は現時点で1プロファイル、シーケンスは2プロファイル（Markdown・Mermaid。sequence-m3）、ロジックツリーは0本。規約上は「**0本以上**の出力プロファイル」に統一する。
```

- [ ] **Step 6: `docs/open-issues.md` を更新する**

**消す（1件）**

- `[issue-tree-m2]`「`canonical.ts` のバイト一致コピーに『網羅』のアサーションが無い」——Task 5 Step 4 で解消した

**書き換える（1件・消さない）**

- 「登録**4** Skill は整合性検証の警告文言・計上規則を、アプリと独立に複製している」→ **5本**。ただし**ロジックツリーは木の組み立てを複製していない**（`flat-tree-core.ts` のバイト一致コピーが持つ）ので、複製しているのは**文言と集計行だけ**である旨を添える
- 併せて「`palette-fit.mjs` が Node の型ストリップに依存している」の列挙に `logic-tree-register`（`flat-tree-core.ts` / `canonical.ts`）を足す

**足す（2件）**

- **実機確認が未実施**であること（サブエージェントは Tauri の GUI を操作できない）。「次に手を付ける候補」へ
- **`logic-tree-register` の evals は定義しただけで、実行ハーネスに掛けていない**こと（`grade.mjs` は合成データで動作確認したのみ。**起動精度の実測はまだ無い**）

**冒頭の「最終更新」行を、logic-tree-m2 完了時点・消した1件／足した2件／書き換えた1件の内訳とともに更新する。**

- [ ] **Step 7: 申し送りを書く**

`docs/history/logic-tree-m2-register-skill.md` を新規作成する。**追記専用の記録**として、次を含める。

- 冒頭に定型の注記（「**追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は `../open-issues.md` を見ること**」）
- 何を作ったか（Skill の構成。**既存4本と違うところ**——フェーズB を持たない／木の組み立てを手複製していない／`--out` で配列順を正規化する）
- 実装で確定した事項:
  - **バイト一致コピーの3例目は「制約を先に書いた」のではなく「制約を満たすようにコアを割った」**。既存2例（`questions.ts` / `derive.ts`）は書く時点で JSDoc に制約が書いてあり `cp` 1回で済んだが、`flat-tree.ts` は先に存在していて値 import を持っていた。**この形の1例目である**
  - **配列順の正規化をスクリプトに持たせられた理由**（`orderFlatNodes` がコピー可能になったから）。sequence / issue-tree との違いを書く
  - Task 実行中に**実測した数字**（お手本の `--check` の出力、smoke テストの件数、`npm test` の総数）
- 実機確認について（**未実施**である旨と、計画のチェックリストを**空のまま**写す）
- 計画自身の誤り（**辻褄を合わせず記録する**）
- 繰り越し（`open-issues.md` に記録済みのもの）
- rev への反映事項（**本節の分は反映済み**と書く。TODO を残さない）

**実機確認のチェックリスト（空のまま写す）:**

```markdown
- [ ] 1. Skill が置かれる——プロジェクトフォルダを開き直し、`.claude/skills/logic-tree-register/` が現れる。`evals/` と `node_modules/` が**置かれていない**こと、`package.json` と `.gitignore` と `schemas/logic-tree.schema.json` が**置かれている**こと
- [ ] 2. 利用者の手順を踏む——置かれた先の Skill ディレクトリで `npm install` を実行する
- [ ] 3. その後の状態でもう一度アプリにフォルダを走査させる——**失敗トーストが出ないこと**、`node_modules` が消されていないこと
- [ ] 4. `git status` が汚れていない（Skill の `.gitignore` が効いている）
- [ ] 5. Skill を実際に使う——Claude Code で「どんなときに◯◯が起きるか洗い出して」と**「ロジックツリー」と言わずに**頼み、Skill が起動すること
- [ ] 6. **課題ツリーと取り違えないこと**——「PoC で何を確かめるか整理して」と頼み、`logic-tree-register` が起動**しない**こと
- [ ] 7. 書かれたファイルがアプリで開ける——赤表示（整合性エラー）が出ないこと。未記入の集計がスクリプトの出力と一致すること
- [ ] 8. アプリで一度編集して自動保存させても、配列順が動かないこと（Skill が既に DFS 行きがけ順で書いているため）
- [ ] 9. お手本を開く——`sample-project/応募が書類選考に進まないケース.json` が今までどおり開き、未記入1件が出ること
- [ ] 10. 開発機と違う OS（Windows で開発したなら mac、逆も同じ）で 1〜4 を通す——**`fs` scope の glob 判定は OS で既定が反転する**
```

- [ ] **Step 8: 全体の緑を確認する**

```bash
npm test && npx tsc -b && npm run lint
```

Expected: すべて緑

```bash
cd src-tauri && cargo test; cd -
```

Expected: 緑（Rust 側は触っていないので変化なし）

- [ ] **Step 9: コミット**

```bash
git add README.md docs/
git commit -m "docs: logic-tree-m2 を rev・台帳・申し送りへ反映する

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## 実行後の後片付け（CLAUDE.md の規約）

**マージ前に、worktree の中で実機確認の痕跡を捨てる。**

```bash
git checkout -- sample-project/ && git clean -fdx sample-project/
git status --short          # 空になること
```

`.claude/skills/logic-tree-register/node_modules/` は Skill 自身の `.gitignore` が効いているので追跡されないが、**worktree を消すときに数百 MB を掴んでいる**ことに注意する（`npm run tauri dev` を閉じてから消す）。

---

## 自己レビュー結果

**スペックの節と、それを実装するタスクの対応:**

| スペックの節 | タスク |
| --- | --- |
| 1フェーズであること | Task 4（SKILL.md 冒頭に逐語で入れる） |
| 起動条件と、課題ツリーとの境界 | Task 4 Step 1（description）／ Task 6（ケース2・3で実測） |
| ファイルの扱い | Task 4 Step 2「1. 対象を決める」 |
| 材料の扱い | Task 4 Step 2「2. 材料を見分ける」 |
| 木の組み立ての規律 | Task 4 Step 2「3. 木を組む」 |
| `flat-tree-core.ts` の切り出し | Task 1 |
| 同梱スクリプト（構成・`new-id.mjs`） | Task 2 |
| 同梱スクリプト（`logic-tree-write.mjs`） | Task 3 |
| SKILL.md の規律 | Task 4 |
| 既存ファイルへの書き足し | Task 4 Step 2「7.」／ Task 6 ケース4 |
| テスト（skill-copy / smoke / 登録3箇所） | Task 1・2・3・5 |
| canonical の網羅アサーション | Task 5 Step 4 |
| evals 5ケース | Task 6 |
| ドキュメントへの反映 | Task 7 |
| 完了条件 1〜8 | Task 3 Step 6（1）／ Task 2 Step 5・Task 1 Step 1（2）／ Task 3 Step 5（3）／ Task 3 Step 5（4）／ Task 5 Step 4（5）／ Task 7 Step 8（6）／ Task 6（7）／ Task 7 Step 6（8） |

**スペックに書いてあり、この計画が意図的に落としたもの:** 無し。

**型の一貫性:** `buildFlatTree` / `orderFlatNodes` / `FlatTreeCoreNode` / `BuiltFlatTree` は Task 1 で定義し、Task 2（コピー）・Task 3（`T.orderFlatNodes` / `T.buildFlatTree`）が同じ名前で使う。`serialize` / `stripBom` は既存 `canonical.ts` の名前をそのまま使う。`tallyLine` は**アプリ側の関数名**であり、`logic-tree-write.mjs` 内の同名のローカル変数は文字列（アプリの関数を import しているわけではない）——smoke テストが両者の一致を縛る。
