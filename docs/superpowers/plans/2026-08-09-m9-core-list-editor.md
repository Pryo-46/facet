# M9 コアの拡張 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リストエディタの共通機械をコアへ引き上げ、モジュール規約5を複数出力プロファイルへ拡張し、型生成を複数スキーマ対応にする。エラーカタログ（M10）のコードは1行も書かない。

**Architecture:** 用語集モジュールに埋まっている「列構成に依存しない機械」（セルの面の判定・列幅添字の写像・Tab のセル移動・行操作とフォーカス予約・重複検出）を `src/core/list-editor/` と `src/core/duplicate.ts` へ移し、用語集をその上に載せ替える。抽象の粒度は**純関数＋小さなフック1本**とし、列データとフィールド宣言はモジュールに残す。並行して `ToolModule.toMarkdown`（単数）を `outputs`（`OutputProfile` の配列）へ置き換え、額縁は2本以上のときだけドロップダウンを出す。

**Tech Stack:** TypeScript / React 19 / Vitest（`environment: 'node'`、DOM テストはファイル先頭に `// @vitest-environment jsdom`）/ @testing-library/react / Tailwind CSS v4 / radix-ui（既存依存）/ json-schema-to-typescript

## Global Constraints

- **既存テストのアサーションの期待値を1つも変えない。** 変えてよいのは (a) 移動したファイルの import パス、(b) 規約5の変更に伴うフェイクモジュールの口（`toMarkdown` → `outputs`）と `copyMarkdown` / `exportMarkdown` の呼び出しへの引数追加だけ
- **`src/modules/glossary/consistency.test.ts` と `src/modules/glossary/GlossaryEditor.dom.test.tsx` は1バイトも変更しない。** 引き上げが振る舞いを保っている証拠になる
- **用語集の Markdown 出力バイト列と画面は不変。** `fileSuffix` は `''`
- **色値・Tailwind 標準パレット・`text-xl` 以上を書かない**（`src/styles/conventions.test.ts` が全ソースを走査して弾く）。役割トークン（`text-ink` / `bg-warning` / `border-rule` …）を使う。**例外は `src/components/ui/` のみ**（走査から除外済み）
- **コミットは毎タスク末尾で1回。** コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- 検証コマンドは `npm test`（全体）、`npx vitest run <path>`（単体）、`npx tsc -b`、`npm run lint`
- **`sample-project/` をコミットしない**（動作確認の遊び場。`../../../CLAUDE.md` の後片付け手順）

---

## ファイル構成

**新規作成**

| ファイル | 責務 |
| --- | --- |
| `src/core/duplicate.ts` | 鍵によるグループ化と重複抽出。正規化規則は持たない |
| `src/core/duplicate.test.ts` | 同上のテスト |
| `src/core/list-editor/cell-face.ts` | セルの面（error / warn / none）の判定 |
| `src/core/list-editor/cell-face.test.ts` | 同上（`glossary/cell-face.test.ts` を移動） |
| `src/core/list-editor/columns.ts` | 列仕様から幅配列の添字への写像 |
| `src/core/list-editor/columns.test.ts` | 同上のテスト |
| `src/core/list-editor/field-step.ts` | Tab / Shift+Tab のセル移動先 |
| `src/core/list-editor/field-step.test.ts` | 同上のテスト |
| `src/core/list-editor/use-list-rows.ts` | 行の挿入・削除・並び替えとフォーカス予約 |
| `src/core/list-editor/use-list-rows.dom.test.tsx` | 同上のテスト |
| `src/components/ui/dropdown-menu.tsx` | shadcn のドロップダウン（額縁専用） |
| `src/components/ExportMenu.tsx` | 出力プロファイルの選択と実行 |
| `src/components/ExportMenu.dom.test.tsx` | 同上のテスト |
| `scripts/gen-types.mjs` | `schemas/*.schema.json` → `src/types/*.ts` |

**削除**

- `src/modules/glossary/cell-face.ts` → `src/core/list-editor/cell-face.ts` へ移動
- `src/modules/glossary/cell-face.test.ts` → 同上

**変更**

| ファイル | 変更内容 |
| --- | --- |
| `src/core/registry.ts` | `toMarkdown` を `outputs: readonly OutputProfile<TData>[]` に置換 |
| `src/core/app-controller.ts` | `copyMarkdown(profile)` / `exportMarkdown(profile)` |
| `src/modules/glossary/columns.ts` | コアの汎用版に載せ替え。列データは残す |
| `src/modules/glossary/columns.test.ts` | import パス |
| `src/modules/glossary/fields.ts` | `stepField` をコアへ委譲 |
| `src/modules/glossary/consistency.ts` | `findDuplicates` / `groupByKey` を使う |
| `src/modules/glossary/GlossaryEditor.tsx` | コアの機械に載せ替え |
| `src/modules/glossary/module.ts` | `outputs` |
| `src/App.tsx` | `ExportMenu` に差し替え |
| `src/core/app-controller.test.ts` | フェイクモジュールの口＋呼び出しの引数 |
| `src/core/file-ops.test.ts` / `load.test.ts` / `project-consistency.test.ts` / `registry.test.ts` | フェイクモジュールの口 |
| `package.json` | `gen:types` をスクリプトへ |
| `.gitignore` | `src/types/glossary.ts` → `src/types/*.ts` |

---

## Task 1: 重複検出をコアへ

**Files:**
- Create: `src/core/duplicate.ts`
- Create: `src/core/duplicate.test.ts`
- Modify: `src/modules/glossary/consistency.ts`

**Interfaces:**
- Consumes: `normalizeForMatch`（`src/core/normalize.ts`、既存）
- Produces:
  - `groupByKey<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, number[]>` — 全グループ（要素1個のものを含む）。値は配列位置の昇順、Map のキー順は初出順
  - `findDuplicates<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, number[]>` — `groupByKey` のうち要素2個以上のものだけ

- [ ] **Step 1: 失敗するテストを書く**

`src/core/duplicate.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import { findDuplicates, groupByKey } from './duplicate'

describe('groupByKey', () => {
  it('全グループを返す（要素1個のものも含む）', () => {
    const got = groupByKey(['a', 'b', 'a'], (s) => s)
    expect([...got]).toEqual([
      ['a', [0, 2]],
      ['b', [1]],
    ])
  })

  it('キーの順は初出順、値は配列位置の昇順', () => {
    const got = groupByKey(['z', 'a', 'z', 'a'], (s) => s)
    expect([...got.keys()]).toEqual(['z', 'a'])
    expect(got.get('z')).toEqual([0, 2])
  })

  it('空配列は空の Map', () => {
    expect(groupByKey([], (s: string) => s).size).toBe(0)
  })
})

describe('findDuplicates', () => {
  it('2個以上のグループだけを返す', () => {
    const got = findDuplicates(['a', 'b', 'a'], (s) => s)
    expect([...got]).toEqual([['a', [0, 2]]])
  })

  it('重複が無ければ空の Map', () => {
    expect(findDuplicates(['a', 'b'], (s) => s).size).toBe(0)
  })

  it('正規化はコアが決めず keyOf に委ねる（同じ配列を別の規則で引ける）', () => {
    const items = [{ v: 'API' }, { v: 'ａｐｉ' }]
    // 完全一致では重複しない
    expect(findDuplicates(items, (i) => i.v).size).toBe(0)
    // 呼び出し側が正規化を入れれば重複する
    const fold = (s: string) => s.normalize('NFKC').toLowerCase()
    expect([...findDuplicates(items, (i) => fold(i.v))]).toEqual([['api', [0, 1]]])
  })

  it('3個以上の重複も1グループにまとまる', () => {
    expect(findDuplicates(['x', 'x', 'x'], (s) => s).get('x')).toEqual([0, 1, 2])
  })
})
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx vitest run src/core/duplicate.test.ts`
Expected: FAIL — `Failed to resolve import "./duplicate"`

- [ ] **Step 3: 最小の実装を書く**

`src/core/duplicate.ts` を新規作成:

```ts
/**
 * 重複の検出（全ツール共通・コア）。
 *
 * **正規化規則はここで決めず、呼び出し側が `keyOf` に入れる。** ID の重複は
 * 正規化なしの完全一致（ID は機械的識別子）、名称・別名の重複は
 * `normalizeForMatch` 経由——同じ関数から呼び分けられなければならない。
 * コアが正規化を強制すると、ID の重複判定が NFKC 正規化の影響を受けるという
 * 意味不明な挙動になる。
 *
 * **返すのは配列位置であって ID ではない。** ID 重複ファイルを「受け入れて
 * 赤表示」する以上、ID では行を一意に指せない（rev 5章）
 */

/** 鍵ごとの配列位置。キーは初出順、値は昇順。要素1個のグループも含む */
export function groupByKey<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): Map<string, number[]> {
  const out = new Map<string, number[]>()
  items.forEach((item, index) => {
    const key = keyOf(item)
    const group = out.get(key)
    if (group === undefined) out.set(key, [index])
    else group.push(index)
  })
  return out
}

/** `groupByKey` のうち、要素が2個以上のものだけ。順序は `groupByKey` に従う */
export function findDuplicates<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): Map<string, number[]> {
  const out = new Map<string, number[]>()
  for (const [key, indices] of groupByKey(items, keyOf)) {
    if (indices.length > 1) out.set(key, indices)
  }
  return out
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/core/duplicate.test.ts`
Expected: PASS（8件）

- [ ] **Step 5: 用語集の検証を載せ替える**

`src/modules/glossary/consistency.ts` を全面的に差し替える。**`IndexedTerm` は不要になる**（位置は `findDuplicates` が返す）。

```ts
import type { ConsistencyIssue } from '@/core/consistency'
import { findDuplicates, groupByKey } from '@/core/duplicate'
import { normalizeForMatch } from '@/core/normalize'
import type { GlossarySchemaVersion1 } from '@/types/glossary'

/**
 * 用語集のモジュール内検証（規約4。rev 6章の責務内訳の「モジュール内」側）。
 * 自ファイルで完結する検証のみ。単一性違反はコア横断検証の管轄。
 * alias 系は表記ゆれ検知の照合データ自体の矛盾として扱う（session-notes 論点5）。
 *
 * locations は配列位置（entityIndex）で行を指す。ID 重複ファイルを
 * 「受け入れて赤表示」する以上、entityId だけでは行を一意に特定できない。
 *
 * **グループ化は core/duplicate.ts に一元化してある**（M9）。正規化を掛けるか
 * どうかはルールごとに違うので、keyOf に載せて呼び分ける
 */
export function checkGlossaryConsistency(data: GlossarySchemaVersion1): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const terms = data.terms

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）
  for (const [id, indices] of findDuplicates(terms, (t) => t.id)) {
    issues.push({
      rule: 'duplicate-id',
      message: `ID が重複しています（${indices.length}件）: ${id}`,
      locations: indices.map((i) => ({ entityId: id, entityIndex: i, field: 'id' })),
    })
  }

  // name 重複（同名2件は「この語を正式名とする」宣言としての矛盾。rev 5章）
  const nameKey = (name: string): string => normalizeForMatch(name)
  for (const indices of findDuplicates(terms, (t) => nameKey(t.name)).values()) {
    issues.push({
      rule: 'duplicate-name',
      message: `名称が重複しています: ${indices.map((i) => `「${terms[i].name}」`).join(' と ')}`,
      locations: indices.map((i) => ({
        entityId: terms[i].id,
        entityIndex: i,
        field: 'name',
      })),
    })
  }

  // alias 重複（同一用語内・用語間の両方を1つのルールで扱う）。
  // 別名は用語にぶら下がるので、いったん「持ち主の位置つき」に平らへ潰してから引く
  const owned = terms.flatMap((term, index) =>
    term.aliases.map((alias) => ({ index, alias })),
  )
  for (const group of findDuplicates(owned, (o) => nameKey(o.alias)).values()) {
    // 同一用語内の重複は行が1つしかないので、同じ行を2度指さない
    const seen = new Set<number>()
    const locations = []
    for (const flat of group) {
      const { index } = owned[flat]
      if (seen.has(index)) continue
      seen.add(index)
      locations.push({ entityId: terms[index].id, entityIndex: index, field: 'aliases' })
    }
    issues.push({
      rule: 'duplicate-alias',
      message: `別名「${owned[group[0]].alias}」が重複しています（${group.length}件）`,
      locations,
    })
  }

  // alias と他用語の name の衝突（自用語の name は対象外。
  // 正式名そのものを alias に持つのは冗長ではあるが矛盾ではない）。
  // 自他の判定は index で行う——ID が重複していても別の行は別の用語。
  // ここは「重複」ではなく引き当てなので groupByKey（全グループ）を使う
  const byName = groupByKey(terms, (t) => nameKey(t.name))
  terms.forEach((term, index) => {
    for (const alias of term.aliases) {
      for (const other of byName.get(nameKey(alias)) ?? []) {
        if (other === index) continue
        issues.push({
          rule: 'alias-name-collision',
          message: `「${term.name}」の別名「${alias}」が用語「${terms[other].name}」の名称と衝突しています`,
          locations: [
            { entityId: term.id, entityIndex: index, field: 'aliases' },
            { entityId: terms[other].id, entityIndex: other, field: 'name' },
          ],
        })
      }
    }
  })

  return issues
}
```

- [ ] **Step 6: 用語集の既存テストが1バイトも変えずに通ることを確認**

Run: `npx vitest run src/modules/glossary/consistency.test.ts`
Expected: PASS（13件）。**このファイルを編集してはならない。** 落ちたら実装側を直す

Run: `git diff --stat src/modules/glossary/consistency.test.ts`
Expected: 出力が空

- [ ] **Step 7: 全体が緑であることを確認**

Run: `npm test`
Expected: PASS

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/core/duplicate.ts src/core/duplicate.test.ts src/modules/glossary/consistency.ts
git commit -m "重複検出を core/duplicate.ts へ引き上げる

正規化規則はコアが決めず keyOf に載せる。ID 重複は完全一致、名称・別名は
normalizeForMatch 経由——同じ関数から呼び分けられる必要がある。

alias-name-collision は重複ではなく引き当てなので groupByKey を使う。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: セルの面をコアへ移す

**Files:**
- Create: `src/core/list-editor/cell-face.ts`（`src/modules/glossary/cell-face.ts` を移動）
- Create: `src/core/list-editor/cell-face.test.ts`（`src/modules/glossary/cell-face.test.ts` を移動）
- Delete: `src/modules/glossary/cell-face.ts`, `src/modules/glossary/cell-face.test.ts`
- Modify: `src/modules/glossary/GlossaryEditor.tsx:19`（import パス）

**Interfaces:**
- Produces:
  - `type ErrorMarks = Map<number, Set<string>>`
  - `buildErrorMarks(issues: readonly ConsistencyIssue[]): ErrorMarks`
  - `hasError(marks: ErrorMarks, index: number, field: string): boolean`
  - `type CellFace = 'error' | 'warn' | 'none'`
  - `cellFace(marks: ErrorMarks, index: number, field: string, warn?: boolean): CellFace`

**中身は1行も変えない。** 変えるのは `cellFace` の第3引数の型が `GlossaryField` から `string` になることだけ（`hasError` は既に `string` を取っている）。

- [ ] **Step 1: ファイルを移動する**

```bash
mkdir -p src/core/list-editor
git mv src/modules/glossary/cell-face.ts src/core/list-editor/cell-face.ts
git mv src/modules/glossary/cell-face.test.ts src/core/list-editor/cell-face.test.ts
```

- [ ] **Step 2: 移動先の import を直す**

`src/core/list-editor/cell-face.ts` の先頭2行:

```ts
import type { ConsistencyIssue } from '@/core/consistency'
import type { GlossaryField } from './fields'
```

を1行に置き換える:

```ts
import type { ConsistencyIssue } from '../consistency'
```

そのうえで `cellFace` のシグネチャの `field: GlossaryField` を `field: string` にする。**JSDoc は1文字も変えない。**

```ts
export function cellFace(
  marks: ErrorMarks,
  index: number,
  field: string,
  warn = false,
): CellFace {
```

`src/core/list-editor/cell-face.test.ts` の2行目を相対パスに直す:

```ts
import type { ConsistencyIssue, ConsistencyLocation } from '../consistency'
```

- [ ] **Step 3: 移したテストが通ることを確認**

Run: `npx vitest run src/core/list-editor/cell-face.test.ts`
Expected: PASS（8件）。**テストの本文（`describe` / `it` / アサーション）は1文字も変えていないこと**

- [ ] **Step 4: 呼び出し側の import を直す**

`src/modules/glossary/GlossaryEditor.tsx:19` を書き換える:

```ts
import { buildErrorMarks, cellFace, hasError } from '@/core/list-editor/cell-face'
```

（`./cell-face` からの import 行を削除し、`@/core/...` 群の並びに合わせて配置する）

- [ ] **Step 5: 全体が緑であることを確認**

Run: `npm test`
Expected: PASS

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

Run: `git diff --stat src/modules/glossary/GlossaryEditor.dom.test.tsx`
Expected: 出力が空

- [ ] **Step 6: コミット**

```bash
git add -A src/core/list-editor src/modules/glossary
git commit -m "セルの面の判定を core/list-editor へ移す

内容は変えず、cellFace の field を GlossaryField から string へ広げるだけ。
用語集の DOM テストは1バイトも変えずに緑。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: 列の添字写像をコアへ

**Files:**
- Create: `src/core/list-editor/columns.ts`
- Create: `src/core/list-editor/columns.test.ts`
- Modify: `src/modules/glossary/columns.ts`
- Modify: `src/modules/glossary/columns.test.ts`（import のみ）
- Modify: `src/modules/glossary/GlossaryEditor.tsx`（`nextWidthIndex` の呼び出し）

**Interfaces:**
- Produces:
  - `interface ColumnSpec<TField extends string> { field: TField; defaultWidth: number | null }`
  - `widthIndex(columns: readonly ColumnSpec<string>[]): (number | null)[]`
  - `defaultWidths(columns: readonly ColumnSpec<string>[]): number[]`
  - `nextWidthIndex(index: readonly (number | null)[], i: number): number | null`
- Consumes（用語集側）: `COLUMNS` は `src/modules/glossary/columns.ts` に残り、`WIDTH_INDEX` / `DEFAULT_WIDTHS` はそこで導出して再エクスポートする

**`nextWidthIndex` の引数が1つ増える。** 元は `WIDTH_INDEX` をモジュールスコープで直接見ていたが、汎用版は写像を受け取る。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/list-editor/columns.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import { defaultWidths, nextWidthIndex, widthIndex, type ColumnSpec } from './columns'

/** 3列目だけが幅を持たない（残りを埋める）列構成 */
const COLUMNS: readonly ColumnSpec<string>[] = [
  { field: 'a', defaultWidth: 176 },
  { field: 'b', defaultWidth: 128 },
  { field: 'c', defaultWidth: null },
  { field: 'd', defaultWidth: 176 },
  { field: 'e', defaultWidth: 256 },
]

describe('widthIndex', () => {
  it('列の添字を幅配列の添字へ写す。幅を持たない列は null', () => {
    // 幅配列は固定幅の列だけを並び順で持つので、列の添字とは一致しない。
    // ここを取り違えると、掴んだ列と動く列がずれる
    expect(widthIndex(COLUMNS)).toEqual([0, 1, null, 2, 3])
  })

  it('全列が幅を持つなら恒等写像', () => {
    expect(widthIndex([
      { field: 'a', defaultWidth: 10 },
      { field: 'b', defaultWidth: 20 },
    ])).toEqual([0, 1])
  })

  it('列が無ければ空', () => {
    expect(widthIndex([])).toEqual([])
  })
})

describe('defaultWidths', () => {
  it('幅を持つ列の既定幅だけを並び順で返す', () => {
    expect(defaultWidths(COLUMNS)).toEqual([176, 128, 176, 256])
  })

  it('長さが「幅を持つ列の数」と一致する', () => {
    expect(defaultWidths(COLUMNS)).toHaveLength(
      COLUMNS.filter((c) => c.defaultWidth !== null).length,
    )
  })
})

describe('nextWidthIndex', () => {
  const index = widthIndex(COLUMNS)

  it('幅を持たない列(添字2)の次は、右隣の固定幅列の幅配列上の添字', () => {
    expect(nextWidthIndex(index, 2)).toBe(2)
  })

  it('固定幅を持つ列を渡しても、そのさらに次の固定幅列を返す', () => {
    expect(nextWidthIndex(index, 0)).toBe(1)
  })

  it('最後の列より後ろには幅を持つ列が無いので null', () => {
    expect(nextWidthIndex(index, 4)).toBeNull()
  })

  it('末尾が幅を持たない列でも null を返す（範囲外を読まない）', () => {
    const tail = widthIndex([
      { field: 'a', defaultWidth: 10 },
      { field: 'b', defaultWidth: null },
    ])
    expect(nextWidthIndex(tail, 0)).toBeNull()
  })
})
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx vitest run src/core/list-editor/columns.test.ts`
Expected: FAIL — `Failed to resolve import "./columns"`

- [ ] **Step 3: 最小の実装を書く**

`src/core/list-editor/columns.ts` を新規作成:

```ts
/**
 * 表の列の仕様と、幅配列への添字の写像（全ツール共通・コア）。
 *
 * **`defaultWidth` が null の列は幅を持たず、残りを埋める。** 他の列が px を
 * 持ち1列が残りを取るので、テーブルは常に親幅に収まり横スクロールが出ない。
 * 「この列を広げたい」は他の列を狭めることで達成される。窓を狭めたときも
 * 幅を持たない列が縮んで吸収する（M8 決定1で用語集について確定した形を、
 * M9 で列構成に依存しない形へ一般化した）
 */
export interface ColumnSpec<TField extends string> {
  field: TField
  defaultWidth: number | null
}

/**
 * 列の添字 → 幅配列の添字。幅を持たない列は null。
 *
 * **幅配列は固定幅を持つ列だけを並び順で持つ**ので、列の添字とは一致しない。
 * 対応をここ1箇所に閉じ、コンポーネント側で添字を計算しない
 */
export function widthIndex(columns: readonly ColumnSpec<string>[]): (number | null)[] {
  let n = 0
  return columns.map((c) => (c.defaultWidth === null ? null : n++))
}

/** 固定幅を持つ列の既定幅（並び順）。列幅 store の初期値になる */
export function defaultWidths(columns: readonly ColumnSpec<string>[]): number[] {
  return columns.flatMap((c) => (c.defaultWidth === null ? [] : [c.defaultWidth]))
}

/**
 * `i` より後ろで最初に幅を持つ列の、幅配列上の添字を返す。無ければ null。
 *
 * 幅を持たない列の右端にハンドルを置くとき、掴めるのは右隣の固定幅の列の幅
 * なので、その添字をここで引く（M8 Task 15）
 */
export function nextWidthIndex(
  index: readonly (number | null)[],
  i: number,
): number | null {
  for (let j = i + 1; j < index.length; j++) {
    const w = index[j]
    if (w !== null) return w
  }
  return null
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/core/list-editor/columns.test.ts`
Expected: PASS（9件）

- [ ] **Step 5: 用語集の列をコアに載せる**

`src/modules/glossary/columns.ts` を差し替える。**`COLUMNS` の中身と JSDoc の意図は残し、写像の実装だけコアへ委ねる。**

```ts
import {
  defaultWidths,
  nextWidthIndex as nextWidthIndexOf,
  widthIndex,
  type ColumnSpec,
} from '@/core/list-editor/columns'
import type { GlossaryField } from './fields'

/**
 * 用語テーブルの列（M8 決定1）。
 *
 * **定義列だけが幅を持たず、残りを埋める。** 他4列が px を持つので、
 * テーブルは常に親幅に収まり横スクロールが出ない。「定義を広げたい」は
 * 他の列を狭めることで達成される。
 *
 * 写像の実装は `@/core/list-editor/columns` にある（M9 で引き上げ）。
 * このファイルが持つのは**列データそのものだけ**
 */
export const COLUMNS: readonly ColumnSpec<GlossaryField>[] = [
  { field: 'name', defaultWidth: 176 },
  { field: 'kind', defaultWidth: 128 },
  { field: 'definition', defaultWidth: null },
  { field: 'aliases', defaultWidth: 176 },
  // 備考は自由記述で長くなりやすいので、名称・別名より広く取る（M7 の要望7）
  { field: 'notes', defaultWidth: 256 },
]

/** COLUMNS の添字 → 幅配列の添字。幅を持たない列は null */
export const WIDTH_INDEX: readonly (number | null)[] = widthIndex(COLUMNS)

/** 固定幅を持つ列の既定幅（並び順）。列幅 store の初期値になる */
export const DEFAULT_WIDTHS: readonly number[] = defaultWidths(COLUMNS)

/** `i` より後ろで最初に幅を持つ列の、幅配列上の添字。無ければ null */
export function nextWidthIndex(i: number): number | null {
  return nextWidthIndexOf(WIDTH_INDEX, i)
}
```

**`nextWidthIndex(i)` の1引数の口を用語集側に残すのが要点。** これで `columns.test.ts` の期待値と `GlossaryEditor.tsx` の呼び出しが変わらない。

- [ ] **Step 6: 用語集の既存テストが変わらず通ることを確認**

Run: `npx vitest run src/modules/glossary/columns.test.ts`
Expected: PASS（8件）

Run: `git diff --stat src/modules/glossary/columns.test.ts`
Expected: 出力が空（import も変わらない——`./columns` から同じ4つを取るため）

- [ ] **Step 7: 全体が緑であることを確認**

Run: `npm test`
Expected: PASS

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/core/list-editor/columns.ts src/core/list-editor/columns.test.ts src/modules/glossary/columns.ts
git commit -m "列の添字写像を core/list-editor へ引き上げる

用語集側には COLUMNS（列データ）だけを残し、写像は導出にする。
nextWidthIndex は用語集側で1引数に束ねるので、呼び出しと既存テストは不変。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Tab のセル移動をコアへ

**Files:**
- Create: `src/core/list-editor/field-step.ts`
- Create: `src/core/list-editor/field-step.test.ts`
- Modify: `src/modules/glossary/fields.ts`

**Interfaces:**
- Produces:
  - `interface FieldStep<TField extends string> { field: TField; rowDelta: -1 | 0 | 1 }`
  - `stepField<TField extends string>(order: readonly TField[], field: TField, direction: 1 | -1): FieldStep<TField>`
- Consumes（用語集側）: `src/modules/glossary/fields.ts` が `FIELD_ORDER` を束ねた `stepField(field, direction)` を引き続きエクスポートする（呼び出し側と `fields.test.ts` を変えないため）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/list-editor/field-step.test.ts` を新規作成:

```ts
import { describe, expect, it } from 'vitest'
import { stepField } from './field-step'

const ORDER = ['a', 'b', 'c'] as const

describe('stepField', () => {
  it('Tab は右のセルへ', () => {
    expect(stepField(ORDER, 'a', 1)).toEqual({ field: 'b', rowDelta: 0 })
  })

  it('Shift+Tab は左のセルへ', () => {
    expect(stepField(ORDER, 'b', -1)).toEqual({ field: 'a', rowDelta: 0 })
  })

  it('右端の Tab は次の行の先頭列へ折り返す', () => {
    expect(stepField(ORDER, 'c', 1)).toEqual({ field: 'a', rowDelta: 1 })
  })

  it('左端の Shift+Tab は前の行の末尾列へ折り返す', () => {
    expect(stepField(ORDER, 'a', -1)).toEqual({ field: 'c', rowDelta: -1 })
  })

  it('1列しかないときは、どちらへ動いても同じ列のまま行だけ動く', () => {
    const one = ['only'] as const
    expect(stepField(one, 'only', 1)).toEqual({ field: 'only', rowDelta: 1 })
    expect(stepField(one, 'only', -1)).toEqual({ field: 'only', rowDelta: -1 })
  })
})
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx vitest run src/core/list-editor/field-step.test.ts`
Expected: FAIL — `Failed to resolve import "./field-step"`

- [ ] **Step 3: 最小の実装を書く**

`src/core/list-editor/field-step.ts` を新規作成:

```ts
/**
 * Tab / Shift+Tab のセル移動先（全ツール共通・コア）。
 * 行端では隣の行へ折り返す。移動先の行が無い場合は呼び出し側が何もしない
 *（既定の Tab 動作を止めない）
 */
export interface FieldStep<TField extends string> {
  field: TField
  /** 行の移動量。1＝次の行の先頭列へ、-1＝前の行の末尾列へ */
  rowDelta: -1 | 0 | 1
}

export function stepField<TField extends string>(
  order: readonly TField[],
  field: TField,
  direction: 1 | -1,
): FieldStep<TField> {
  const index = order.indexOf(field)
  const next = index + direction
  if (next < 0) return { field: order[order.length - 1], rowDelta: -1 }
  if (next >= order.length) return { field: order[0], rowDelta: 1 }
  return { field: order[next], rowDelta: 0 }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/core/list-editor/field-step.test.ts`
Expected: PASS（5件）

- [ ] **Step 5: 用語集を委譲に切り替える**

`src/modules/glossary/fields.ts` の `FieldStep` インターフェースと `stepField` 関数の定義（26行目以降）を、次に置き換える。**`FIELD_ORDER` / `GlossaryField` / `FIELD_LABELS` の宣言部分（1〜24行目）は1文字も変えない。**

```ts
import { stepField as stepFieldOf, type FieldStep } from '@/core/list-editor/field-step'

// …（FIELD_ORDER / GlossaryField / FIELD_LABELS の宣言はそのまま）…

export type { FieldStep }

/**
 * Tab / Shift+Tab の移動先。実装は `@/core/list-editor/field-step`（M9 で引き上げ）。
 * ここは用語集の列順を束ねるだけ——呼び出し側が毎回 FIELD_ORDER を渡さずに済む
 */
export function stepField(field: GlossaryField, direction: 1 | -1): FieldStep<GlossaryField> {
  return stepFieldOf(FIELD_ORDER, field, direction)
}
```

（`import` 文はファイル先頭へ置くこと）

- [ ] **Step 6: 用語集の既存テストが1バイトも変えずに通ることを確認**

Run: `npx vitest run src/modules/glossary/fields.test.ts`
Expected: PASS（6件）

Run: `git diff --stat src/modules/glossary/fields.test.ts`
Expected: 出力が空

- [ ] **Step 7: 全体が緑であることを確認**

Run: `npm test`
Expected: PASS

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/core/list-editor/field-step.ts src/core/list-editor/field-step.test.ts src/modules/glossary/fields.ts
git commit -m "Tab のセル移動を core/list-editor へ引き上げる

用語集側は FIELD_ORDER を束ねる薄い委譲だけを残すので、呼び出しと
既存テストは不変。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 行操作とフォーカス予約をフックへ

**Files:**
- Create: `src/core/list-editor/use-list-rows.ts`
- Create: `src/core/list-editor/use-list-rows.dom.test.tsx`
- Modify: `src/modules/glossary/GlossaryEditor.tsx`

**Interfaces:**
- Consumes: `insertAt` / `removeAt` / `moveItem`（`src/core/list-ops.ts`）、`computeRowKeys`（`src/core/row-keys.ts`）
- Produces:
  - `cellId(rowKey: string, field: string): string` — `data-cell` 属性の値。`${rowKey}:${field}`
  - `useListRows<T extends { id: string }>(options): ListRows`

```ts
export interface ListRowsOptions<T extends { id: string }> {
  items: readonly T[]
  /** mergeKey は Undo 履歴のまとめ単位。構造操作は常に null を渡す */
  onItemsChange: (next: T[], mergeKey: string | null) => void
  makeItem: () => T
  /** 挿入・削除の後にフォーカスするフィールド */
  firstField: string
  /** 0件になったときの通知。フィルタの解除など、エディタ側の後始末に使う */
  onEmptied?: () => void
}

export interface ListRows {
  containerRef: React.RefObject<HTMLDivElement | null>
  addButtonRef: React.RefObject<HTMLButtonElement | null>
  /** items から毎回導出した行の同一性キー */
  rowKeys: string[]
  focusCell: (rowKey: string, field: string, select?: boolean) => boolean
  insertAfter: (index: number) => void
  deleteAt: (index: number) => void
  moveBy: (index: number, delta: -1 | 1, field: string) => void
}
```

**振る舞いは現在の `GlossaryEditor.tsx` から1つも変えない。** 移すのは `cellId`（57-59行）、`focusCell`（82-94行）、`containerRef` / `pendingFocus` / `addButtonRef` / `focusAddButton` とその2つの `useEffect`（104-126行）、`insertRowAfter` / `deleteRow` / `moveRow`（150-183行）、`rowKeys`（138行）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/list-editor/use-list-rows.dom.test.tsx` を新規作成:

```tsx
// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { cellId, useListRows } from './use-list-rows'

afterEach(cleanup)

interface Row {
  id: string
  name: string
}

let seq = 0

/** フックだけを載せた最小の表。列は name の1本 */
function Harness(props: { initial: Row[]; onEmptied?: () => void }) {
  const [items, setItems] = useState<Row[]>(props.initial)
  const rows = useListRows<Row>({
    items,
    onItemsChange: (next) => setItems(next),
    makeItem: () => ({ id: `row_${++seq}`, name: '新しい行' }),
    firstField: 'name',
    onEmptied: props.onEmptied,
  })
  return (
    <div ref={rows.containerRef}>
      {items.map((item, index) => (
        <div key={rows.rowKeys[index]}>
          <input
            aria-label={`name-${index}`}
            data-cell={cellId(rows.rowKeys[index], 'name')}
            defaultValue={item.name}
          />
          <button type="button" aria-label={`insert-${index}`} onClick={() => rows.insertAfter(index)} />
          <button type="button" aria-label={`delete-${index}`} onClick={() => rows.deleteAt(index)} />
          <button type="button" aria-label={`up-${index}`} onClick={() => rows.moveBy(index, -1, 'name')} />
          <button type="button" aria-label={`down-${index}`} onClick={() => rows.moveBy(index, 1, 'name')} />
        </div>
      ))}
      <button type="button" ref={rows.addButtonRef} aria-label="add">
        追加
      </button>
    </div>
  )
}

const two = (): Row[] => [
  { id: 'row_a', name: 'A' },
  { id: 'row_b', name: 'B' },
]

function names(): string[] {
  return (screen.getAllByLabelText(/^name-/) as HTMLInputElement[]).map((el) => el.value)
}

describe('cellId', () => {
  it('行の鍵とフィールドを連結する', () => {
    expect(cellId('row_a#0', 'name')).toBe('row_a#0:name')
  })
})

describe('rowKeys', () => {
  it('ID が重複していても出現順で区別する', () => {
    render(<Harness initial={[{ id: 'dup', name: 'A' }, { id: 'dup', name: 'B' }]} />)
    const cells = screen.getAllByLabelText(/^name-/)
    expect(cells[0].getAttribute('data-cell')).toBe('dup#0:name')
    expect(cells[1].getAttribute('data-cell')).toBe('dup#1:name')
  })
})

describe('insertAfter', () => {
  it('直後に行が増え、新しい行の先頭セルへフォーカスが移り全選択される', () => {
    render(<Harness initial={two()} />)
    fireEvent.click(screen.getByLabelText('insert-0'))
    expect(names()).toEqual(['A', '新しい行', 'B'])
    const inserted = screen.getByLabelText('name-1') as HTMLInputElement
    expect(document.activeElement).toBe(inserted)
    // 既定値を打ち替えられるよう全選択する
    expect(inserted.selectionStart).toBe(0)
    expect(inserted.selectionEnd).toBe(inserted.value.length)
  })
})

describe('deleteAt', () => {
  it('削除後は同じ位置の行へフォーカスが移る', () => {
    render(<Harness initial={two()} />)
    fireEvent.click(screen.getByLabelText('delete-0'))
    expect(names()).toEqual(['B'])
    expect(document.activeElement).toBe(screen.getByLabelText('name-0'))
  })

  it('末尾を消したときは新しい末尾へ移る（body に落とさない）', () => {
    render(<Harness initial={two()} />)
    fireEvent.click(screen.getByLabelText('delete-1'))
    expect(names()).toEqual(['A'])
    expect(document.activeElement).toBe(screen.getByLabelText('name-0'))
  })

  it('0件になったら onEmptied を呼び、追加ボタンへフォーカスを逃がす', () => {
    const onEmptied = vi.fn()
    render(<Harness initial={[{ id: 'row_a', name: 'A' }]} onEmptied={onEmptied} />)
    fireEvent.click(screen.getByLabelText('delete-0'))
    expect(onEmptied).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(screen.getByLabelText('add'))
  })

  it('0件にならないときは onEmptied を呼ばない', () => {
    const onEmptied = vi.fn()
    render(<Harness initial={two()} onEmptied={onEmptied} />)
    fireEvent.click(screen.getByLabelText('delete-0'))
    expect(onEmptied).not.toHaveBeenCalled()
  })
})

describe('moveBy', () => {
  it('上へ移すと並びが入れ替わり、フォーカスが移動先の行に追従する', () => {
    render(<Harness initial={two()} />)
    fireEvent.click(screen.getByLabelText('up-1'))
    expect(names()).toEqual(['B', 'A'])
    // 動かした行（B）は今 0 番目にいる
    expect(document.activeElement).toBe(screen.getByLabelText('name-0'))
  })

  it('先頭で上、末尾で下は何も起きない（範囲外で壊れない）', () => {
    render(<Harness initial={two()} />)
    fireEvent.click(screen.getByLabelText('up-0'))
    expect(names()).toEqual(['A', 'B'])
    fireEvent.click(screen.getByLabelText('down-1'))
    expect(names()).toEqual(['A', 'B'])
  })

  it('ID が重複していても、移動後の配列から鍵を引き直して正しい行を追う', () => {
    render(<Harness initial={[{ id: 'dup', name: 'A' }, { id: 'dup', name: 'B' }]} />)
    fireEvent.click(screen.getByLabelText('down-0'))
    expect(names()).toEqual(['B', 'A'])
    // 動かした行（A）は今 1 番目。移動前の rowKeys[0]（dup#0）は別の行を指す
    expect(document.activeElement).toBe(screen.getByLabelText('name-1'))
  })
})
```

- [ ] **Step 2: テストを実行して落ちることを確認**

Run: `npx vitest run src/core/list-editor/use-list-rows.dom.test.tsx`
Expected: FAIL — `Failed to resolve import "./use-list-rows"`

- [ ] **Step 3: 最小の実装を書く**

`src/core/list-editor/use-list-rows.ts` を新規作成:

```ts
import { useEffect, useRef, useState } from 'react'
import { insertAt, moveItem, removeAt } from '../list-ops'
import { computeRowKeys } from '../row-keys'

/**
 * 行の構造操作とフォーカス予約（全ツール共通・コア。M9 で用語集エディタから引き上げ）。
 *
 * **構造操作の後、新しい DOM が出てからでないとフォーカスを移せない。** だから
 * 直接 focus せず予約（state）に積み、effect で消化する。ここを各エディタで
 * 書き直すと、M8 でつぶした「削除後にフォーカスが body へ落ちて操作不能になる」
 * 種のバグが、ツールごとに別々に再発する。
 *
 * **フィルタや導出表示は関知しない。** 0件になったことを `onEmptied` で
 * 知らせるだけで、何をするかはエディタが決める——フィルタを持たないツールが
 * 出た時点で引数が無意味に残るのを避けるため（M9 決定2）
 */

export interface ListRowsOptions<T extends { id: string }> {
  items: readonly T[]
  /** mergeKey は Undo 履歴のまとめ単位。構造操作は常に null を渡す */
  onItemsChange: (next: T[], mergeKey: string | null) => void
  makeItem: () => T
  /** 挿入・削除の後にフォーカスするフィールド */
  firstField: string
  /** 0件になったときの通知。フィルタの解除など、エディタ側の後始末に使う */
  onEmptied?: () => void
}

export interface ListRows {
  containerRef: React.RefObject<HTMLDivElement | null>
  addButtonRef: React.RefObject<HTMLButtonElement | null>
  rowKeys: string[]
  focusCell: (rowKey: string, field: string, select?: boolean) => boolean
  insertAfter: (index: number) => void
  deleteAt: (index: number) => void
  moveBy: (index: number, delta: -1 | 1, field: string) => void
}

/** セルの DOM 上の識別子。フォーカス移動が querySelector で引く */
export function cellId(rowKey: string, field: string): string {
  return `${rowKey}:${field}`
}

/** セルにフォーカスを移す。select＝既定値を打ち替えられるよう全選択する */
function focusIn(
  container: HTMLElement | null,
  rowKey: string,
  field: string,
  select: boolean,
): boolean {
  const el = container?.querySelector<HTMLElement>(`[data-cell="${cellId(rowKey, field)}"]`)
  if (!el) return false
  el.focus()
  if (select && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) el.select()
  return true
}

export function useListRows<T extends { id: string }>(
  options: ListRowsOptions<T>,
): ListRows {
  const { items, onItemsChange, makeItem, firstField, onEmptied } = options

  const containerRef = useRef<HTMLDivElement>(null)
  // 構造操作の後、新しい DOM が出てからフォーカスを移すための予約
  const [pendingFocus, setPendingFocus] = useState<{
    rowKey: string
    field: string
    select?: boolean
  } | null>(null)

  // 0件になったときの移動先。行が無いのでセルの鍵では指せない
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const [focusAddButton, setFocusAddButton] = useState(false)

  useEffect(() => {
    if (pendingFocus === null) return
    focusIn(containerRef.current, pendingFocus.rowKey, pendingFocus.field, pendingFocus.select === true)
    setPendingFocus(null)
  }, [pendingFocus])

  useEffect(() => {
    if (!focusAddButton) return
    addButtonRef.current?.focus()
    setFocusAddButton(false)
  }, [focusAddButton])

  const rowKeys = computeRowKeys(items)

  const insertAfter = (index: number): void => {
    const item = makeItem()
    onItemsChange(insertAt(items, index + 1, item), null)
    // 採番したての ID は重複しないので出現順は 0
    setPendingFocus({ rowKey: `${item.id}#0`, field: firstField, select: true })
  }

  const deleteAt = (index: number): void => {
    const next = removeAt(items, index)
    onItemsChange(next, null)
    if (next.length === 0) {
      onEmptied?.()
      setFocusAddButton(true)
      return
    }
    // 削除後の配列から鍵を引く。先頭行を消したときは新しい先頭行へ移る
    // （前の行が無いからとフォーカスを放置すると body に落ちて操作不能になる）
    setPendingFocus({
      rowKey: computeRowKeys(next)[Math.min(index, next.length - 1)],
      field: firstField,
    })
  }

  const moveBy = (index: number, delta: -1 | 1, field: string): void => {
    const to = index + delta
    if (to < 0 || to >= items.length) return
    const next = moveItem(items, index, to)
    onItemsChange(next, null)
    // 移動後の配列から鍵を引く。ID が重複していると入れ替えで出現順が変わり、
    // 移動前の rowKeys[index] は別の行を指しうる
    setPendingFocus({ rowKey: computeRowKeys(next)[to], field })
  }

  return {
    containerRef,
    addButtonRef,
    rowKeys,
    focusCell: (rowKey, field, select = false) =>
      focusIn(containerRef.current, rowKey, field, select),
    insertAfter,
    deleteAt,
    moveBy,
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npx vitest run src/core/list-editor/use-list-rows.dom.test.tsx`
Expected: PASS（11件）

- [ ] **Step 5: 用語集エディタをフックに載せ替える**

`src/modules/glossary/GlossaryEditor.tsx` を次のとおり変更する。**JSX とキーボード処理（`runCommand` / `onCellKeyDown` / `textFieldContext`）は触らない。**

1. **削除する**: 57-59行の `cellId`、82-94行の `focusCell`、104-126行の ref / state / effect 群、138行の `rowKeys`、150-183行の `insertRowAfter` / `deleteRow` / `moveRow`

2. **import を足す**（`@/core/...` 群の並びに合わせる）:

```ts
import { cellId, useListRows } from '@/core/list-editor/use-list-rows'
```

`import { insertAt, moveItem, removeAt } from '@/core/list-ops'` と `import { computeRowKeys } from '@/core/row-keys'` は**削除する**（フックの中へ移ったため）。

3. **`filter` の宣言の直後**（現 102行の直後）に置く:

```ts
  const rows = useListRows<Term>({
    items: data.terms,
    onItemsChange: (terms, mergeKey) => onChange({ ...data, terms }, mergeKey),
    makeItem: newTerm,
    firstField: 'name',
    // 0件の一覧に絞り込みを残す意味は無く、残すと導出表示扱いで
    //「用語を追加」が出ずフォーカスの行き先が消える
    onEmptied: () => setFilter(EMPTY_FILTER),
  })
  const { rowKeys } = rows
```

4. **`visible` の宣言（現 139行）はそのまま残す。** その上の `const rowKeys = computeRowKeys(data.terms)` だけを消す

5. **`focusVisible`（現 186-190行）を書き換える**:

```ts
  /** 表示中の並びで n 番目の行の指定セルへフォーカスする */
  const focusVisible = (visiblePos: number, field: GlossaryField): boolean => {
    const index = visible[visiblePos]
    if (index === undefined) return false
    return rows.focusCell(rowKeys[index], field)
  }
```

6. **`runCommand` の3つの呼び出しを差し替える**（現 201-211行）:

```ts
      case 'insert-item-after':
        if (derivedView) return true
        rows.insertAfter(at.index)
        return true
      case 'delete-item':
        rows.deleteAt(at.index)
        return true
      case 'move-item-up':
        rows.moveBy(at.index, -1, at.field)
        return true
      case 'move-item-down':
        rows.moveBy(at.index, 1, at.field)
        return true
```

7. **`containerRef` / `tableRef` / `addButtonRef` の JSX 側**:

- 277行の `<div ref={containerRef} className="p-4">` を `<div ref={rows.containerRef} className="p-4">` に
- 533行の `<button ref={addButtonRef} …>` を `<button ref={rows.addButtonRef} …>` に
- **`tableRef` は列幅の計測用なのでフックとは無関係。そのまま残す**
- 536行の `onClick={() => insertRowAfter(data.terms.length - 1)}` を `onClick={() => rows.insertAfter(data.terms.length - 1)}` に

- [ ] **Step 6: 用語集の DOM テストが1バイトも変えずに通ることを確認**

Run: `npx vitest run src/modules/glossary/GlossaryEditor.dom.test.tsx`
Expected: PASS

Run: `git diff --stat src/modules/glossary/GlossaryEditor.dom.test.tsx`
Expected: 出力が空。**落ちたらフックの実装を疑うこと。テストを直してはならない**

- [ ] **Step 7: 全体が緑であることを確認**

Run: `npm test`
Expected: PASS

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/core/list-editor/use-list-rows.ts src/core/list-editor/use-list-rows.dom.test.tsx src/modules/glossary/GlossaryEditor.tsx
git commit -m "行操作とフォーカス予約を useListRows へ引き上げる

構造操作の後は新しい DOM が出てからでないとフォーカスを移せないので、
予約を state に積んで effect で消化する。この機構を各エディタで書き直すと
M8 でつぶした「削除後にフォーカスが body へ落ちる」種のバグが再発する。

フィルタは関知せず onEmptied で通知するだけにした（M9 決定2）。
用語集の DOM テストは1バイトも変えずに緑。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: モジュール規約5を出力プロファイルへ

**Files:**
- Modify: `src/core/registry.ts`
- Modify: `src/core/app-controller.ts:104-107, 740-782`
- Modify: `src/modules/glossary/module.ts`
- Modify: `src/core/app-controller.test.ts`
- Modify: `src/core/file-ops.test.ts:17`
- Modify: `src/core/load.test.ts:26`
- Modify: `src/core/project-consistency.test.ts:15`
- Modify: `src/core/registry.test.ts:13`

**Interfaces:**
- Produces:
  - `interface OutputProfile<TData> { id: string; label: string; fileSuffix: string; toMarkdown: (data: TData) => string }`
  - `ToolModule.outputs: readonly OutputProfile<TData>[]`（`toMarkdown` を置換）
  - `AppController.copyMarkdown(profile: OutputProfile<unknown>): Promise<void>`
  - `AppController.exportMarkdown(profile: OutputProfile<unknown>): Promise<void>`

**この2つは同じコミットにまとめる。** `outputs` だけ入れると `app-controller.ts` が `doc.module.toMarkdown` を呼べず `tsc -b` が落ちるため、分けても中間状態が緑にならない。

- [ ] **Step 1: 規約の型を変える**

`src/core/registry.ts` の `ToolModule` の `toMarkdown` フィールド（44-48行）を削除し、代わりに次を置く。**`OutputProfile` の宣言は `EditorProps` の直後、`ToolModule` の直前に置く。**

```ts
/**
 * 出力プロファイル（規約5。rev 6章・8章）。**同じデータでも読み手によって
 * 出すべき列が違う**ため、モジュールは1つ以上のプロファイルを宣言する。
 * 読み手ごとにファイルを分けると二重管理が発生し、文章仕様書の問題が
 * 再生産される——だから1つのデータから出し分ける
 */
export interface OutputProfile<TData> {
  /** 安定識別子。UI の選択状態・テストが参照する */
  id: string
  /** ドロップダウンに出す表示名 */
  label: string
  /**
   * 書き出しの既定ファイル名に足す接尾辞（単一プロファイルなら ''）。
   * **`label` から導出しない。** 表示名は画面の都合でいつでも変えたくなるが、
   * 書き出したファイル名は Git に成果物として残る側なので別の軸として持つ
   */
  fileSuffix: string
  /**
   * NotePM 等へ貼る Markdown を返す。額縁がクリップボードへのコピーと
   * `.md` 書き出しの両方に使うので、**副作用を持たない純関数**であること
   *（ファイルにもクリップボードにも触らない）
   */
  toMarkdown: (data: TData) => string
}
```

`ToolModule` 内の該当箇所を置き換える:

```ts
  /** 規約5: 出力プロファイル（rev 6章・8章）。1つ以上 */
  outputs: readonly OutputProfile<TData>[]
```

`ToolModule` の JSDoc（23-26行）の「M6 の出力ロジック追加で6点セットが埋まった」の後ろに1文足す:

```
 * M9 で規約5を複数プロファイル（`outputs`）へ拡張した。
```

- [ ] **Step 2: コントローラの口を変える**

`src/core/app-controller.ts` の `AppController` インターフェース（104-107行）:

```ts
  /** 選択中ファイルの Markdown をクリップボードへ（rev 8章） */
  copyMarkdown(profile: OutputProfile<unknown>): Promise<void>
  /** 選択中ファイルの Markdown を .md として書き出す（rev 8章） */
  exportMarkdown(profile: OutputProfile<unknown>): Promise<void>
```

`registry` からの import に `OutputProfile` を足す（`import type { AnyToolModule, ModuleRegistry, OutputProfile } from './registry'` の形。既存の import 行に合わせること）。

実装（740-782行）を差し替える:

```ts
  const copyMarkdown = async (profile: OutputProfile<unknown>): Promise<void> => {
    const doc = currentDocument()
    if (doc === null) return
    try {
      await io.copyText(profile.toMarkdown(doc.data))
      host.setBanner('io', null)
      host.showToast({ key: 'export', message: 'Markdown をクリップボードにコピーしました' })
    } catch (err) {
      host.setBanner('io', `クリップボードにコピーできませんでした: ${describeError(err)}`)
    }
  }

  const exportMarkdown = async (profile: OutputProfile<unknown>): Promise<void> => {
    const doc = currentDocument()
    if (doc === null) return
    try {
      const base = doc.path.replace(/\.json$/i, '')
      const target = await io.askSavePath(`${base}${profile.fileSuffix}.md`)
      // キャンセルは失敗ではない。バナーを出さず黙って戻る
      if (target === null) return
      // **ダイアログを出す前のスナップショットで書かない。** ネイティブ
      // ダイアログが開いている数秒〜数分の間に外部変更の取り込みが走ると、
      // doc.data は取り込み前の内容を指す。ここで引き直す
      const fresh = currentDocument()
      // **プロファイルの持ち主が変わっていないことも確かめる。** 選択が別の
      // ファイル＝別のモジュールへ移っていると、手元のプロファイルは別ツールの
      // ものであり、型の違うデータを別ツールの出力関数に食わせることになる
      if (fresh === null || fresh.path !== doc.path || !fresh.module.outputs.includes(profile)) {
        host.showToast({
          key: 'export',
          message: 'Markdown を書き出しませんでした（保存先を選んでいる間に対象が変わりました）',
        })
        return
      }
      // **台帳へ記録しない**（writeAndRecord を通さない）——走査対象は .json だけなので、
      // 通常は記録しても次の再走査の retain で落ちる死に記録になる。ただし
      // 保存ダイアログはユーザーが拡張子を書き換えられる（ここで .json 強制はしない）
      // ので、「.md 書き出しは走査対象外」は実装が保証する前提ではなく、多くの場合に
      // 成り立つ想定にすぎない。仮に .json のまま書かれても、台帳に無い記録は
      // 次の外部変更として検知されるだけで、自己書き込み除外を誤って発動させる
      // 側の事故（本来検知すべき変更を見逃す）にはならない
      await io.write(target, profile.toMarkdown(fresh.data))
      host.setBanner('io', null)
      host.showToast({ key: 'export', message: `Markdown を書き出しました: ${target}` })
    } catch (err) {
      host.setBanner('io', `Markdown を書き出せませんでした: ${describeError(err)}`)
    }
  }
```

- [ ] **Step 3: 用語集モジュールを直す**

`src/modules/glossary/module.ts` の `toMarkdown: glossaryToMarkdown,` の行（18-19行のコメント込み）を置き換える:

```ts
  // 規約5: NotePM 向け Markdown（session-notes 論点7）。Mermaid は無い。
  // 用語集は1プロファイル。fileSuffix が '' なので書き出し名は M6 から不変
  outputs: [
    { id: 'default', label: 'Markdown', fileSuffix: '', toMarkdown: glossaryToMarkdown },
  ],
```

- [ ] **Step 4: フェイクモジュールの口を直す**

次の4ファイルで `toMarkdown: () => '',` の行を置き換える。**期待値は1つも変えない。**

- `src/core/file-ops.test.ts:17`
- `src/core/load.test.ts:26`
- `src/core/project-consistency.test.ts:15`
- `src/core/registry.test.ts:13`

```ts
    outputs: [{ id: 'default', label: 'Markdown', fileSuffix: '', toMarkdown: () => '' }],
```

`src/core/app-controller.test.ts:34` は本文を持つので、内容を保ったまま包む:

```ts
    outputs: [
      {
        id: 'default',
        label: 'Markdown',
        fileSuffix: '',
        toMarkdown: (d: { title: string; body: string }) => `## ${d.title}\n\n${d.body}\n`,
      },
    ],
```

- [ ] **Step 5: コントローラのテストの呼び出しに引数を足す**

`src/core/app-controller.test.ts` の `describe('Markdown 出力')` の直前にヘルパを1つ足す:

```ts
/** 額縁が module.outputs から選んで渡す想定。テストでは先頭を使う */
function firstOutput(h: { registry: ModuleRegistry }) {
  return h.registry.get('note')!.outputs[0]
}
```

そのうえで7箇所の呼び出しに引数を足す（**アサーションには一切触らない**）。

| 行 | 変更後 |
| --- | --- |
| 741 | `await h.controller.copyMarkdown(firstOutput(h))` |
| 753 | `await h.controller.copyMarkdown(firstOutput(h))` |
| 763 | `await h.controller.exportMarkdown(firstOutput(h))` |
| 773 | `await h.controller.exportMarkdown(firstOutput(h))` |
| 783 | `await h.controller.copyMarkdown(firstOutput(h))` |
| 838 | `const done = h.controller.exportMarkdown(firstOutput(h))` |
| 854 | `const done = h.controller.exportMarkdown(firstOutput(h))` |

- [ ] **Step 6: 新しいガードのテストを書く**

`src/core/app-controller.test.ts` の `describe('exportMarkdown: 保存ダイアログを開いている間の変化', …)` の中、最後の `it` の後ろに足す:

```ts
  it('その間に別モジュールのファイルへ移ったら書き出さない（他ツールの出力関数に食わせない）', async () => {
    const { askSavePath, release } = pendingSavePath()
    const h = createHarness({ [p('a.json')]: note('A') }, { askSavePath })
    // singleton でない2つ目のモジュールを足し、そのファイルへ選択を移す
    h.registry.register(
      noteModule({ type: 'memo', displayName: 'メモ', idPrefixes: ['memo'], singleton: false }),
    )
    h.disk.files.set(p('b.json'), serialize(
      { schemaVersion: 1, type: 'memo', title: 'B', body: '' },
      { ...noteSchema, properties: { ...noteSchema.properties, type: { const: 'memo' } } },
    ))
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const profile = firstOutput(h)
    const done = h.controller.exportMarkdown(profile)
    await h.controller.selectFile(p('b.json'))
    release('C:\\out\\a.md')
    await done
    expect(h.disk.files.has('C:\\out\\a.md')).toBe(false)
    expect(h.toasts().at(-1)?.message).toMatch(/書き出しませんでした/)
  })
```

**このテストが `fresh.path !== doc.path` だけでも通ってしまう場合は、`fileSuffix` の付与を確認するテストに差し替えてよい。** 重要なのはガードが増えたことが検証されていること。少なくとも次は必ず足す:

```ts
  it('fileSuffix を既定ファイル名に足す', async () => {
    const askSavePath = vi.fn<(defaultPath: string) => Promise<string | null>>()
      .mockResolvedValue(null)
    const h = createHarness({ [p('a.json')]: note('A') }, { askSavePath })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.exportMarkdown({
      id: 'support', label: 'サポート向け', fileSuffix: '-サポート向け',
      toMarkdown: () => '',
    })
    expect(askSavePath).toHaveBeenCalledWith(`${DIR}\\a-サポート向け.md`)
  })
```

- [ ] **Step 7: テストが通ることを確認**

Run: `npx vitest run src/core/app-controller.test.ts`
Expected: PASS。**既存のアサーションが1つも変わっていないこと**を `git diff src/core/app-controller.test.ts` で目視確認する（差分は `outputs` への包み、`firstOutput` の追加、7箇所の引数、新規 `it` 2件だけ）

- [ ] **Step 8: 全体が緑であることを確認**

Run: `npm test`
Expected: PASS。**`src/App.tsx` は次のタスクで直すため、この時点で `tsc -b` は `copyMarkdown` の引数不足で落ちる。** それを確認したうえで、App.tsx の呼び出しに暫定で `selectedModule!.outputs[0]` を渡して緑にしてからコミットする:

```tsx
        <Button variant="outline" disabled={!canExport} onClick={() => void controller.copyMarkdown(selectedModule!.outputs[0])}>
```

（`exportMarkdown` も同様。Task 7 でこの2行ごと `ExportMenu` に置き換える）

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

- [ ] **Step 9: コミット**

```bash
git add src/core/registry.ts src/core/app-controller.ts src/modules/glossary/module.ts src/App.tsx src/core/app-controller.test.ts src/core/file-ops.test.ts src/core/load.test.ts src/core/project-consistency.test.ts src/core/registry.test.ts
git commit -m "モジュール規約5を出力プロファイルへ拡張する

toMarkdown（単数）を outputs（OutputProfile の配列）に置き換える。
rev 6章はすでに「1つ以上の出力プロファイル」と書いていたが、コードが
追いついていなかった。

コントローラは ID ではなくプロファイルの実体を受け取る（解決失敗の経路を
作らない）。保存ダイアログ中に別モジュールへ選択が移ったとき、型の違う
データを他ツールの出力関数に食わせないためのガードを1条件足した。

用語集は fileSuffix: '' の単一プロファイルなので、書き出し名は不変。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: 額縁の出力メニュー

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/ExportMenu.tsx`
- Create: `src/components/ExportMenu.dom.test.tsx`
- Modify: `src/App.tsx:306-311`

**Interfaces:**
- Consumes: `OutputProfile`（Task 6）、`Button`（`@/components/ui/button`）
- Produces: `ExportMenu(props: { outputs: readonly OutputProfile<unknown>[]; disabled: boolean; onCopy: (p) => void; onExport: (p) => void })`

**`src/components/ui/` は `conventions.test.ts` の走査から除外されている**ので、shadcn 生成物の色指定はそのままでよい。**`ExportMenu.tsx` は除外されない**ので役割トークンだけを使うこと。

- [ ] **Step 1: shadcn のドロップダウンを置く**

まず CLI を試す:

```bash
npx shadcn@latest add dropdown-menu
```

生成された `src/components/ui/dropdown-menu.tsx` の import が `import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"`（名前空間パッケージ）になっていることを確認する。`@radix-ui/react-dropdown-menu` を個別に入れる形なら**採用しない**——`alert-dialog.tsx` と流儀が食い違い、依存が1つ増える。

CLI が使えない、または流儀が違う場合は、次を手で書く（必要な部品だけ）:

```tsx
import * as React from "react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
  )
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[8rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        "relative flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none focus:bg-muted focus:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/components/ExportMenu.dom.test.tsx` を新規作成:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { OutputProfile } from '@/core/registry'
import { ExportMenu } from './ExportMenu'

afterEach(cleanup)

const profile = (id: string, label: string): OutputProfile<unknown> => ({
  id,
  label,
  fileSuffix: '',
  toMarkdown: () => '',
})

const one = [profile('default', 'Markdown')]
const two = [profile('support', 'サポート向け'), profile('dev', '開発向け')]

describe('ExportMenu: プロファイルが1本のとき', () => {
  it('ドロップダウンを出さず、押すとその1本で実行する（用語集の画面は変わらない）', () => {
    const onCopy = vi.fn()
    const onExport = vi.fn()
    render(<ExportMenu outputs={one} disabled={false} onCopy={onCopy} onExport={onExport} />)
    fireEvent.click(screen.getByRole('button', { name: 'Markdown をコピー' }))
    expect(onCopy).toHaveBeenCalledWith(one[0])
    fireEvent.click(screen.getByRole('button', { name: 'Markdown を書き出す' }))
    expect(onExport).toHaveBeenCalledWith(one[0])
  })

  it('disabled のときは押せない', () => {
    const onCopy = vi.fn()
    render(<ExportMenu outputs={one} disabled onCopy={onCopy} onExport={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Markdown をコピー' }))
    expect(onCopy).not.toHaveBeenCalled()
  })
})

describe('ExportMenu: 出力できるファイルを選んでいないとき', () => {
  it('プロファイルが空でもボタンは出る（押せないだけ）', () => {
    const onCopy = vi.fn()
    render(<ExportMenu outputs={[]} disabled onCopy={onCopy} onExport={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Markdown をコピー' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Markdown をコピー' }))
    expect(onCopy).not.toHaveBeenCalled()
  })
})

describe('ExportMenu: プロファイルが2本以上のとき', () => {
  it('コピーはメニューを開き、選んだプロファイルで実行する', async () => {
    const onCopy = vi.fn()
    render(<ExportMenu outputs={two} disabled={false} onCopy={onCopy} onExport={vi.fn()} />)
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Markdown をコピー' }),
      { button: 0, ctrlKey: false },
    )
    const item = await screen.findByRole('menuitem', { name: '開発向け' })
    fireEvent.click(item)
    expect(onCopy).toHaveBeenCalledWith(two[1])
  })

  it('書き出しも同じ選択肢を出す', async () => {
    const onExport = vi.fn()
    render(<ExportMenu outputs={two} disabled={false} onCopy={vi.fn()} onExport={onExport} />)
    fireEvent.pointerDown(
      screen.getByRole('button', { name: 'Markdown を書き出す' }),
      { button: 0, ctrlKey: false },
    )
    const item = await screen.findByRole('menuitem', { name: 'サポート向け' })
    fireEvent.click(item)
    expect(onExport).toHaveBeenCalledWith(two[0])
  })
})
```

- [ ] **Step 3: テストを実行して落ちることを確認**

Run: `npx vitest run src/components/ExportMenu.dom.test.tsx`
Expected: FAIL — `Failed to resolve import "./ExportMenu"`

- [ ] **Step 4: 実装を書く**

`src/components/ExportMenu.tsx` を新規作成:

```tsx
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { OutputProfile } from '@/core/registry'

/**
 * 出力の実行口（rev 8章。コピーと .md 書き出しの両方）。
 *
 * **プロファイルが1本のときはドロップダウンを出さない。** 選択肢が1つしかない
 * メニューは操作を1手増やすだけで何も選ばせない。用語集は1本なので、
 * M8 までと同じ2つのボタンがそのまま出る
 */
export interface ExportMenuProps {
  outputs: readonly OutputProfile<unknown>[]
  /** 出力できる状態にないとき（ファイル未選択・編集中データなし） */
  disabled: boolean
  onCopy: (profile: OutputProfile<unknown>) => void
  onExport: (profile: OutputProfile<unknown>) => void
}

const COPY_LABEL = 'Markdown をコピー'
const EXPORT_LABEL = 'Markdown を書き出す'

function ProfileMenu(props: {
  label: string
  outputs: readonly OutputProfile<unknown>[]
  disabled: boolean
  onPick: (profile: OutputProfile<unknown>) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={props.disabled}>
          {props.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.outputs.map((profile) => (
          <DropdownMenuItem key={profile.id} onSelect={() => props.onPick(profile)}>
            {profile.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ExportMenu({ outputs, disabled, onCopy, onExport }: ExportMenuProps) {
  if (outputs.length > 1) {
    return (
      <>
        <ProfileMenu label={COPY_LABEL} outputs={outputs} disabled={disabled} onPick={onCopy} />
        <ProfileMenu label={EXPORT_LABEL} outputs={outputs} disabled={disabled} onPick={onExport} />
      </>
    )
  }
  // プロファイルが無い＝出力できるファイルを選んでいない。ボタンは出したまま
  // 押せなくする（M8 までと同じ見た目を保ち、額縁のボタンが消えたり出たりしない）
  const only = outputs[0]
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled || only === undefined}
        onClick={() => only !== undefined && onCopy(only)}
      >
        {COPY_LABEL}
      </Button>
      <Button
        variant="outline"
        disabled={disabled || only === undefined}
        onClick={() => only !== undefined && onExport(only)}
      >
        {EXPORT_LABEL}
      </Button>
    </>
  )
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx vitest run src/components/ExportMenu.dom.test.tsx`
Expected: PASS（5件）

**Radix のメニューが `fireEvent.pointerDown` で開かない場合**は、`@testing-library/user-event` を足さず、`fireEvent.keyDown(trigger, { key: 'Enter' })` に替える。それでも開かないなら `DropdownMenu` に `open` / `onOpenChange` を渡す制御コンポーネントとしてテストする。**テストのために実装へ `data-testid` を足さないこと**（role とアクセシブル名で引く方針。M8 の DOM テストと揃える）

- [ ] **Step 6: App に配線する**

`src/App.tsx` の import に足す:

```tsx
import { ExportMenu } from '@/components/ExportMenu'
```

Task 6 Step 8 で暫定にした2つの `<Button>`（306-311行）を1つに置き換える:

```tsx
        <ExportMenu
          outputs={selectedModule?.outputs ?? []}
          disabled={!canExport}
          onCopy={(profile) => void controller.copyMarkdown(profile)}
          onExport={(profile) => void controller.exportMarkdown(profile)}
        />
```

- [ ] **Step 7: 全体が緑であることを確認**

Run: `npm test`
Expected: PASS

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

Run: `npx vitest run src/styles/conventions.test.ts`
Expected: PASS（`ExportMenu.tsx` が色値・Tailwind 標準パレットを持っていないこと）

- [ ] **Step 8: コミット**

```bash
git add src/components/ui/dropdown-menu.tsx src/components/ExportMenu.tsx src/components/ExportMenu.dom.test.tsx src/App.tsx
git commit -m "額縁の出力をプロファイル対応にする

プロファイルが2本以上のときだけドロップダウンを出す。1本しかないときに
メニューを出すと、操作を1手増やすだけで何も選ばせない——用語集の画面は
M8 までと同じ2つのボタンのまま。

radix-ui は既存依存なので新規パッケージは増えない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: 型生成を複数スキーマ対応にする

**Files:**
- Create: `scripts/gen-types.mjs`
- Modify: `package.json`（`gen:types`）
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `json-schema-to-typescript` の `compileFromFile`（既存 devDependency）
- Produces: `schemas/<name>.schema.json` → `src/types/<name>.ts`

**M9 の時点でスキーマは `glossary.schema.json` 1本だけ。** 走査型にしておけば、M10 はスキーマを置くだけで型が出る。

- [ ] **Step 1: 現状の出力を退避する**

```bash
npm run gen:types
cp src/types/glossary.ts /tmp/glossary.before.ts
```

（Windows の Git Bash では `/tmp` が使える。使えない場合は `cp src/types/glossary.ts glossary.before.ts` としてリポジトリ直下に置き、Step 4 の後で消すこと）

- [ ] **Step 2: スクリプトを書く**

`scripts/gen-types.mjs` を新規作成:

```js
/**
 * JSON Schema から TypeScript の型を生成する（正は schemas/ の実体。
 * コピーを作らない——Skill 側も同じファイルを読む）。
 *
 * **schemas/*.schema.json を走査する。** 1本ずつコマンドに書き並べると、
 * ツールを増やしたときに pretest / prebuild / predev の3経路のうち
 * どれかを直し忘れ、「テストは通るがビルドで落ちる」になる
 */
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileFromFile } from 'json-schema-to-typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SCHEMA_DIR = path.join(ROOT, 'schemas')
const OUT_DIR = path.join(ROOT, 'src', 'types')

const names = (await readdir(SCHEMA_DIR))
  .filter((n) => n.endsWith('.schema.json'))
  .sort()

// 0件のまま黙って成功すると、型が無いことに tsc で初めて気づく
if (names.length === 0) {
  console.error(`schemas/ に *.schema.json がありません: ${SCHEMA_DIR}`)
  process.exit(1)
}

await mkdir(OUT_DIR, { recursive: true })

for (const name of names) {
  const base = name.replace(/\.schema\.json$/, '')
  const ts = await compileFromFile(path.join(SCHEMA_DIR, name), {
    bannerComment: `/* schemas/${name} から自動生成。手で編集しないこと（npm run gen:types で再生成される）。 */`,
    additionalProperties: false,
  })
  await writeFile(path.join(OUT_DIR, `${base}.ts`), ts, 'utf8')
  console.log(`gen:types  ${name} -> src/types/${base}.ts`)
}
```

- [ ] **Step 3: package.json を差し替える**

`scripts` の `gen:types` を置き換える:

```json
    "gen:types": "node scripts/gen-types.mjs",
```

（`predev` / `prebuild` / `pretest` / `prepare` は `npm run gen:types` を呼ぶだけなので変更不要）

- [ ] **Step 4: 出力がバイト単位で変わらないことを確認**

```bash
npm run gen:types
diff /tmp/glossary.before.ts src/types/glossary.ts
```

Expected: `diff` が何も出力しない（終了コード 0）

**差分が出たらスクリプトのバナー文字列を合わせる。** `src/types/glossary.ts` を手で直してはならない（生成物）

- [ ] **Step 5: .gitignore をパターンにする**

`.gitignore` の該当2行を書き換える:

```
# スキーマから生成する型（正は schemas/*.schema.json。npm run gen:types で再生成）
src/types/*.ts
```

**ファイル名決め打ちのままだと、M10 で `src/types/error-catalog.ts` が生成物なのに追跡対象として紛れ込む。**

Run: `git status --short src/types/`
Expected: 出力が空

- [ ] **Step 6: 全体が緑であることを確認**

Run: `npm test`
Expected: PASS（`pretest` がスクリプト経由で型を吐く）

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

- [ ] **Step 7: 退避ファイルを消してコミット**

```bash
rm -f /tmp/glossary.before.ts glossary.before.ts
git status --short
```

**`sample-project/` に差分があれば捨てる**（`git checkout -- sample-project/ && git clean -fd sample-project/`）。

```bash
git add scripts/gen-types.mjs package.json .gitignore
git commit -m "型生成を schemas/*.schema.json の走査型にする

1本ずつコマンドに書き並べると、ツールを増やしたとき
pretest / prebuild / predev のどれかを直し忘れて
「テストは通るがビルドで落ちる」になる。

.gitignore もファイル名決め打ちだったので、生成物が追跡対象に
紛れ込む前にパターンへ直す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: マイルストーン完了の締め

**Files:**
- Create: `docs/history/m9-core-list-editor-and-output-profiles.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md:189-198`

**`../../../CLAUDE.md`「マイルストーン完了時に触る3箇所」の義務。** rev への反映は完了コミットで済ませ、TODO として申し送りに残さない。

- [ ] **Step 1: 完了条件をまとめて確認する**

```bash
npm test && npx tsc -b && npm run lint
git diff --stat origin/main -- src/modules/glossary/consistency.test.ts src/modules/glossary/GlossaryEditor.dom.test.tsx src/modules/glossary/columns.test.ts src/modules/glossary/fields.test.ts
```

Expected: テストが全部緑。`git diff --stat` の出力が空（用語集の4つのテストが1バイトも変わっていない）

- [ ] **Step 2: rev 6章へ反映する**

`docs/overview-rev.md` の 194行目（規約5）の末尾に足す:

```
**M9で `outputs`（`OutputProfile` の配列）として実装が確定した**。プロファイルは `id` / `label` / `fileSuffix` / `toMarkdown` を持つ。`fileSuffix` を `label` から導出しないのは、表示名が画面の都合で変わるのに対し、書き出したファイル名はGitに成果物として残る側だから。
```

198行目（空文書の雛形）の後ろに1項目足す:

```
- **列を持つツールの共通機械はコアに置く（M9で確定）**：セルの面の判定・列幅添字の写像・Tabのセル移動・行操作とフォーカス予約・重複検出は `src/core/list-editor/` と `src/core/duplicate.ts` にある。**モジュールが持つのは列データ（`COLUMNS`）とフィールド宣言（`FIELD_ORDER` / `FIELD_LABELS`）だけで、それを動かす機械はコアが持つ。** 抽象の粒度は純関数＋小さなフック1本とし、「列定義を渡すと全部返す」1本のフックには集約しない——引数が肥大し、実例2本目で決めるには早すぎる抽象になるため。
```

- [ ] **Step 3: `docs/open-issues.md` を更新する**

「将来の機能を作った瞬間に踏むもの」に2件足す:

```
- **モジュール規約8（表記ゆれ検知の対象フィールドパス宣言）が `ToolModule` に無い**（`src/core/registry.ts`）: rev 6章は8点セットと書いているが、コードは7点＋`createEmpty`。**検知エンジン自体もコアに無い**ため、宣言だけ足しても読み手のいない死んだコードになる。エンジンを作る時点で両方を足す `[M9]`
```

**`ok` / `warning` の色覚の項、`checkConsistency` の再実行、`CellInput` のリフローの項は消さない**（M9 で触っていない）。

- [ ] **Step 4: 申し送りを書く**

`docs/history/m9-core-list-editor-and-output-profiles.md` を新規作成する。**そのとき何が起きたかの記録**であり、以後変えない。次を含めること:

- 引き上げた5つ（`duplicate` / `cell-face` / `columns` / `field-step` / `use-list-rows`）と、それぞれで**用語集側に何を残したか**（列データ・フィールド宣言・1引数に束ねた `nextWidthIndex` と `stepField`）
- **`onEmptied` を外に出した判断**とその理由（フィルタはエディタの関心。フィルタを持たないツールで引数が死ぬ）
- **規約5のプロファイル化**と、`exportMarkdown` に足したモジュール不一致ガード（保存ダイアログ中に別モジュールへ選択が移ると、型の違うデータを他ツールの出力関数に食わせる経路があった）
- **`.gitignore` がファイル名決め打ちだった**こと（M10 で生成物が追跡対象に紛れ込む寸前だった）
- 実装中に見つかった想定外があれば、それも
- **M10 への申し送り**: 設計は `2026-08-09-m9-m10-error-catalog-design.md` の第 II 部にある。M10 の計画は M10 の worktree で書く

- [ ] **Step 5: コミット**

```bash
git add docs/
git commit -m "M9 の確定内容をドキュメントへ反映する

rev 6章に規約5の outputs 化と、共通機械の置き場所の分界を追記。
open-issues に規約8の未実装を記録。申し送りを新規作成。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: 実機確認**

```bash
npm run tauri dev
```

確認すること:

1. 用語集を開き、**行の追加（Enter）・削除（空欄 Backspace）・並び替え（Alt+↑↓）・Tab のセル移動**が M8 までと同じに動く
2. 最後の1行を消したとき、絞り込みが解除され「用語を追加」ボタンにフォーカスが移る
3. 検索・種別フィルタ中に Enter と Alt+↑↓ が効かない
4. 列幅のドラッグ・←→・ダブルクリックでのリセット
5. **「Markdown をコピー」「Markdown を書き出す」がドロップダウンにならず、M8 までと同じボタンで動く**
6. 書き出しの既定ファイル名が `<用語集のファイル名>.md` のまま

**終わったら `sample-project/` の変更を捨てる**（コミットしない）:

```bash
git checkout -- sample-project/ && git clean -fd sample-project/
git status --short
```

Expected: 出力が空

---

## 自己レビューの結果

**スペック網羅**: 設計スペック第 I 部の決定1〜7がすべてタスクに対応している（決定1→Task 2/3/4/5、決定2→Task 5、決定3→Task 1、決定4→Task 6、決定5→Task 6、決定6→Task 7、決定7→Task 8）。§5 の完了条件は Task 9 Step 1 が機械的に検査する。

**型の一貫性**: `cellFace` の第3引数は Task 2 以降すべて `string`。`nextWidthIndex` はコア版が2引数・用語集版が1引数で、Task 3 の実装と `columns.test.ts` の期待値が一致する。`stepField` も同じ形（コア3引数・用語集2引数）。`OutputProfile` の4フィールド（`id` / `label` / `fileSuffix` / `toMarkdown`）は Task 6・7 で同一。

**踏みうる箇所を2つ、タスク内に明記した**:

- Task 6 は `outputs` と `app-controller` を1コミットにまとめる（分けると中間状態で `tsc -b` が落ちる）。App.tsx にも暫定の1行が要る
- Task 7 の Radix メニューは `fireEvent.pointerDown` で開かないことがあるため、代替手段を2つ書いた
