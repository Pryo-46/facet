# デシジョンテーブル m3 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** デシジョンテーブルに Markdown 出力（条件・結果・判定表の3節）と表形式コピー（判定表1本）を足し、絞り込んだ行だけを出せるようにする。

**Architecture:** 判定表の組み立ては `table.ts` の `decisionTableToTable` 1本に置く。`markdown.ts` は、同じ関数が返した `Table` のセルをエスケープして `### 判定表` に使う。絞り込みは、エディタが額縁へ報告する鍵と同じ `rowKeyOf` で引く。あわせて、5ファイルに複製されている「（未定義）」の文言を `src/core/output-labels.ts` の1箇所へ寄せ、ソースを走査するテストで固定する。

**Tech Stack:** TypeScript, React, Vitest

**Spec:** `docs/superpowers/specs/2026-09-10-decision-table-design.md` の「9. 出力」

**基底:** worktree は `origin/decision-table`（`b4ab6aee56afe47ab50b26e12d236dcd64dd9845`）から切っている。PR の宛先は `decision-table` で、`main` ではない。

## Global Constraints

### 文書とコメントの書き方

次の3つは文書にもコメントにも掛かる。

- 現在形で書く。マイルストーン番号・日付・レビュー指摘・依頼者の指示・変更前の状態・「〜で確定した」の記録を書かない
- 罠は「当初 X していたため Y を取り逃がした」ではなく「X を条件にすると Y を取り逃がす」の形で書く
- テストの名前は守っている性質を名前にする。番号を使わない。テストの件数を文書に書かない

次の2つは **`docs/` の `.md` だけ**に掛かる。コードのコメントには課さない。

- 1項目は2文まで。太字は1段落に1箇所まで。全角括弧の入れ子を作らない
- 語順は「状況→条件→結論」。人でないものを主語にして人の動作を書かない

### この計画が守る設計上の約束

- **行の鍵は `rowKeyOf`（`src/modules/decision-table/rows.ts`）だけが作る。** `toMarkdown` も `toTable` も `visible.has(rowKeyOf(row))` で引く。2つ目の鍵の作り方を作らない
- **絞り込んでも No を振り直さない。** No は行の呼び名（`#N`）で、行の配列位置 + 1 である
- **`UNFILLED_LABEL`（未記入）を出力に使わない。** あれは画面の語で、出力の空欄は `UNDEFINED_TEXT`（（未定義））と書く
- **`起こりえない` は画面と出力で同じ語を使う。** `IMPOSSIBLE_LABEL` を参照し、文字列を書き直さない（`docs/missing-semantics.md` 規約2）
- **セルのエスケープは `src/core/markdown-table.ts` の `escapeCell` を使う。** 書き直さない
- `outputs` は1本（`id: 'default'`、`label: 'Markdown'`、`fileSuffix: ''`）で、`describeIssueEffect` を持つ
- `tableExport.options` は `['numbering', 'showUndefined']` だけ。`numberStyle` と `repeatParent` は木の都合なので宣言しない
- `clipboardExchanges` は持たない

### spec と実物の食い違い（実物を正とする）

- **spec 9節は Markdown に「畳んだ表」を入れると書くが、この計画では入れない。** 畳みは `decision-table-m5` の担当で、`fold.ts` はまだ無い
- **spec 9節は条件・結果の節の列見出しを `条件`／`結果` と書くが、画面の定義部は `条件名`／`結果名` を出している**（`DecisionTableEditor.tsx:639` と `:675` の `nameLabel`）。出力は画面の語に合わせ、`labels.ts` の定数から引く

### この計画で拾わない同じ範囲の残件

- **表に貼ると `=`／`+`／`-`／`@` で始まるセルが数式として実行されうる件。** 先頭に `'` を足す対策はセルの見た目を変える。デシジョンテーブルでは `-` を「どちらでもよい」の意味で値ラベルに使う表があり、効き目は貼り先（Excel・Google スプレッドシート・HTML を受ける先）ごとに実機で確かめるまで決まらない。3ツール共通のコアの変更でもあるので、`docs/open-issues.md` の文を書き換えて残す（Task 5）
- **表本体が上限を超える行数のファイルに歯止めを掛けない件、列幅を変えられない件。** どちらも画面の話で、出力とは継ぎ目を持たない

---

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `src/core/output-labels.ts`（新規） | 出力に書く「（未定義）」の唯一の置き場 |
| `src/core/output-labels.test.ts`（新規） | `src/` の本番コードで、文字列リテラルの「（未定義）」を持つファイルが上記1つだけであることの機械検査 |
| `src/modules/decision-table/labels.ts`（変更） | `No`・`条件名`・`値`・`結果名`・`選択肢` の語の定数を足す |
| `src/modules/decision-table/table.ts`（新規） | 判定表の `Table` を作る。表形式コピーと Markdown の判定表が共有する |
| `src/modules/decision-table/markdown.ts`（新規） | Markdown 出力と `describeIssueEffect` |
| `src/modules/decision-table/module.ts`（変更） | `outputs` と `tableExport` を宣言する |

---

### Task 1: 「（未定義）」を1箇所へ寄せる

いまは次の5ファイルが文字列リテラルとして持っている（`grep -rn "'（未定義）'" src --include=*.ts --include=*.tsx | grep -v '\.test\.'` の出力から取った）。

- `src/core/table-export.ts:73`（`UNDEFINED_TEXT`）
- `src/modules/glossary/markdown.ts:24`（`UNDEFINED_DEFINITION`）
- `src/modules/error-catalog/markdown.ts:28`（`UNDEFINED_VALUE`）
- `src/modules/logic-tree/markdown.ts:20`（`UNDEFINED_TEXT`）
- `src/modules/sequence/output-labels.ts:11`（`UNDEFINED_VALUE`）

`docs/open-issues.md` は4箇所と書いているが、シーケンスの1つを数え落としている。デシジョンテーブルは6つ目の複製を作る側なので、先に寄せる。**このタスクは出力の文字列を1文字も変えない。** 各ツールの既存テストが「（未定義）」を期待値に持っているので、それが番人になる。

**Files:**
- Create: `src/core/output-labels.ts`
- Create: `src/core/output-labels.test.ts`
- Modify: `src/core/table-export.ts`（`UNDEFINED_TEXT` とその JSDoc を削除）
- Modify: `src/modules/glossary/table.ts`, `src/modules/error-catalog/table.ts`, `src/modules/logic-tree/table.ts`（import 元を変える）
- Modify: `src/modules/glossary/markdown.ts`, `src/modules/error-catalog/markdown.ts`, `src/modules/logic-tree/markdown.ts`（ローカル定数を消して import する）
- Modify: `src/modules/sequence/output-labels.ts`（`UNDEFINED_VALUE` を削除）, `src/modules/sequence/markdown.ts`, `src/modules/sequence/mermaid.ts`（`UNDEFINED_VALUE` → `UNDEFINED_TEXT`）
- Modify: `docs/missing-semantics.md`（33行目と36行目の `UNDEFINED_VALUE` の参照）

**Interfaces:**
- Produces: `export const UNDEFINED_TEXT = '（未定義）'`（`@/core/output-labels`）

- [ ] **Step 1: 走査テストを書く**

`src/core/output-labels.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { UNDEFINED_TEXT } from './output-labels'

const SRC_DIR = fileURLToPath(new URL('../', import.meta.url))

/** 文言の唯一の置き場。`SRC_DIR` からの相対パス */
const HOME = 'core/output-labels.ts'

const relative = (file: string): string =>
  path.relative(SRC_DIR, file).split(path.sep).join('/')

/**
 * `src/` の本番コード。**母集合はディレクトリで取る**——ツールを名指しで並べると、
 * 7本目のツールが自前の定数を持っても検査に掛からない。
 * テストファイルは期待値として文言を持つので外す
 */
function sourceFiles(): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) {
        found.push(full)
      }
    }
  }
  walk(SRC_DIR)
  return found
}

/**
 * 引用符で囲んだ文言だけを探す。**コメントの中のバッククォートで囲んだ文言は
 * 説明であって定数ではない**ので拾わない。その代わり、テンプレートリテラルに
 * 直書きした文言も拾えない
 */
const literal = new RegExp(`['"]${UNDEFINED_TEXT}['"]`)

describe('UNDEFINED_TEXT', () => {
  it('出力の文言は既存の出力と同じ', () => {
    expect(UNDEFINED_TEXT).toBe('（未定義）')
  })

  it('置き場のファイル自身は文言を文字列リテラルで持つ（走査が空振りしていない）', () => {
    expect(literal.test(readFileSync(path.join(SRC_DIR, HOME), 'utf8'))).toBe(true)
  })

  it('本番コードで文言を文字列リテラルとして持つのは置き場の1ファイルだけ', () => {
    const offenders = sourceFiles()
      .filter((file) => relative(file) !== HOME)
      .filter((file) => literal.test(readFileSync(file, 'utf8')))
      .map(relative)
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: 赤を確かめる**

Run: `npx vitest run src/core/output-labels.test.ts`
Expected: FAIL。`./output-labels` が見つからない

- [ ] **Step 3: 置き場を作る**

`src/core/output-labels.ts`:

```ts
/**
 * 出力（Markdown・Mermaid・表形式コピー）に書く語のうち、全ツールが共有するもの。
 *
 * **空欄を（未定義）と書き、仕様書に貼った先でも負債を見えるままにする**（rev 8章）。
 * 画面は空を空のまま描いて面で欠落を示すが、出力先には面が無い。
 *
 * **ツールごとに定数を持たない。** 1ツールだけ文言を変えると、同じプロジェクトの
 * 出力で未定義の数え方が食い違う。`output-labels.test.ts` が、本番コードで
 * この文言を文字列リテラルとして持つファイルがここだけであることを検査する
 */
export const UNDEFINED_TEXT = '（未定義）'
```

- [ ] **Step 4: 走査テストの赤が5ファイルを挙げることを確かめる**

Run: `npx vitest run src/core/output-labels.test.ts`
Expected: FAIL。`offenders` に `core/table-export.ts`・`modules/error-catalog/markdown.ts`・`modules/glossary/markdown.ts`・`modules/logic-tree/markdown.ts`・`modules/sequence/output-labels.ts` の5つが並ぶ。並ばないものがあれば、走査か正規表現が壊れているので先へ進まない

- [ ] **Step 5: 5ファイルから定数を消し、読み手を `@/core/output-labels` へ向ける**

1. `src/core/table-export.ts` — 66〜73行目（`UNDEFINED_TEXT` の JSDoc と宣言）を削除する
2. `src/modules/glossary/table.ts`・`src/modules/error-catalog/table.ts` — `@/core/table-export` の import から `UNDEFINED_TEXT,` を外し、`import { UNDEFINED_TEXT } from '@/core/output-labels'` を足す
3. `src/modules/logic-tree/table.ts` — 2行目を次の2行にする

   ```ts
   import { UNDEFINED_TEXT } from '@/core/output-labels'
   import type { Table, TableOptions } from '@/core/table-export'
   ```

4. `src/modules/glossary/markdown.ts` — 24行目の `const UNDEFINED_DEFINITION = '（未定義）'` を削除し、30行目の `UNDEFINED_DEFINITION` を `UNDEFINED_TEXT` にする。import に `import { UNDEFINED_TEXT } from '@/core/output-labels'` を足す
5. `src/modules/error-catalog/markdown.ts` — 28行目の `const UNDEFINED_VALUE = '（未定義）'` を削除し、37行目の `UNDEFINED_VALUE` を `UNDEFINED_TEXT` にする。import を足す
6. `src/modules/logic-tree/markdown.ts` — 20行目の `const UNDEFINED_TEXT = '（未定義）'` を削除し、import を足す
7. `src/modules/sequence/output-labels.ts` — 10〜11行目（`UNDEFINED_VALUE` の JSDoc と宣言）を削除する
8. `src/modules/sequence/markdown.ts` — import から `UNDEFINED_VALUE,` を外し、`import { UNDEFINED_TEXT } from '@/core/output-labels'` を足す。本文の `UNDEFINED_VALUE`（33・55・61・71行目）を `UNDEFINED_TEXT` にする
9. `src/modules/sequence/mermaid.ts` — 14行目を `import { UNRESOLVED_ACTOR_LABEL } from './output-labels'` にし、`import { UNDEFINED_TEXT } from '@/core/output-labels'` を足す。34行目の `UNDEFINED_VALUE` を `UNDEFINED_TEXT` にする

import の並びは各ファイルの既存の並び（`@/` のパスのアルファベット順）に合わせる。`npm run lint`（oxlint）は並びを検査しないので、目で揃える。

- [ ] **Step 6: 取り残しが無いことを確かめる**

Run: `grep -rn "UNDEFINED_VALUE\|UNDEFINED_DEFINITION" src`
Expected: 出力なし

- [ ] **Step 7: `docs/missing-semantics.md` の参照を直す**

33行目の `（`src/modules/sequence/output-labels.ts` の `UNDEFINED_VALUE`）` を `（`src/core/output-labels.ts` の `UNDEFINED_TEXT`）` に置き換える。

36行目を次の1行に置き換える。

```md
- 語の一元管理: `src/core/output-labels.ts`（`UNDEFINED_TEXT`。全ツール共通）／`src/modules/sequence/output-labels.ts`（`NOT_APPLICABLE_LABEL` / `UNRESOLVED_ACTOR_LABEL`）
```

- [ ] **Step 8: 全体を緑にする**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS。各ツールの `markdown.test.ts`・`table.test.ts`・`mermaid.test.ts` が「（未定義）」を期待値に持ったまま緑であること

- [ ] **Step 9: 番人が効くことを壊して確かめる**

`src/modules/glossary/markdown.ts` の先頭に一時的に `const X = '（未定義）'` を足して `npx vitest run src/core/output-labels.test.ts` を実行し、`offenders` に `modules/glossary/markdown.ts` が出て FAIL することを確かめる。確かめたら足した行を消し、同じコマンドが PASS に戻ることを確かめる。実行したコマンドと出力の該当行を報告に貼る。

- [ ] **Step 10: Commit**

```bash
git add src/core/output-labels.ts src/core/output-labels.test.ts src/core/table-export.ts \
  src/modules/glossary src/modules/error-catalog src/modules/logic-tree src/modules/sequence \
  docs/missing-semantics.md
git commit -m "refactor(core): 出力の（未定義）を1箇所に寄せ、複製を走査テストで止める"
```

---

### Task 2: 判定表の `Table` を作る

**Files:**
- Modify: `src/modules/decision-table/labels.ts`
- Modify: `src/modules/decision-table/DecisionTableEditor.tsx:639-640, 675-676`（`nameLabel` / `itemLabel` を定数に）
- Modify: `src/modules/decision-table/GridBody.tsx:224`, `src/modules/decision-table/DefinitionList.tsx:115`（`No` を定数に）
- Create: `src/modules/decision-table/table.ts`
- Create: `src/modules/decision-table/table.test.ts`

**Interfaces:**
- Consumes: `UNDEFINED_TEXT`（`@/core/output-labels`。Task 1）、`rowKeyOf(row: Row): string`（`./rows`）、`IMPOSSIBLE_LABEL`（`./labels`）
- Produces:
  - `labels.ts`: `NO_COLUMN_LABEL = 'No'`、`CONDITION_NAME_LABEL = '条件名'`、`VALUE_LABEL = '値'`、`OUTCOME_NAME_LABEL = '結果名'`、`CHOICE_LABEL = '選択肢'`
  - `table.ts`: `decisionTableToTable(data: DecisionTableSchemaVersion1, options: TableOptions, visible?: VisibleRows): Table`

- [ ] **Step 1: 語の定数を足し、画面をそれに向ける**

`src/modules/decision-table/labels.ts` の末尾に足す。

```ts
/**
 * 列見出しの語。**画面の定義部・表本体と、出力の列見出しが同じ定数を読む**
 *——画面が「条件名」、出力が「条件」と書くと、貼った表と画面で同じ列を別の語で呼ぶ
 */
export const NO_COLUMN_LABEL = 'No'
export const CONDITION_NAME_LABEL = '条件名'
export const VALUE_LABEL = '値'
export const OUTCOME_NAME_LABEL = '結果名'
export const CHOICE_LABEL = '選択肢'
```

`DecisionTableEditor.tsx` の `nameLabel="条件名"` を `nameLabel={CONDITION_NAME_LABEL}`、`itemLabel="値"` を `itemLabel={VALUE_LABEL}`、`nameLabel="結果名"` を `nameLabel={OUTCOME_NAME_LABEL}`、`itemLabel="選択肢"` を `itemLabel={CHOICE_LABEL}` にし、44行目の `./labels` の import に4つを足す。

`GridBody.tsx:224` と `DefinitionList.tsx:115` の `>No<` を `>{NO_COLUMN_LABEL}<` にし、それぞれ `./labels` から import する。

Run: `npx vitest run src/modules/decision-table && npx tsc -b`
Expected: PASS。文字列は変わっていないので DOM テストの `aria-label` の照合も緑のまま

- [ ] **Step 2: 失敗するテストを書く**

`src/modules/decision-table/table.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_TABLE_OPTIONS, type TableOptions } from '@/core/table-export'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { rowKeyOf } from './rows'
import { decisionTableToTable } from './table'

const opts = (patch: Partial<TableOptions> = {}): TableOptions => ({
  ...DEFAULT_TABLE_OPTIONS,
  ...patch,
})

/** #2 の通知メールが空、#4 が起こりえない（結果は記入済みのまま） */
const data: DecisionTableSchemaVersion1 = {
  schemaVersion: 1,
  type: 'decisionTable',
  title: '送料の決定',
  conditions: [
    { id: 'cond_AAAAAAAAAA', name: '会員か', values: ['はい', 'いいえ'] },
    { id: 'cond_BBBBBBBBBB', name: '5000円以上か', values: ['はい', 'いいえ'] },
  ],
  outcomes: [
    { id: 'out_AAAAAAAAAA', name: '送料', choices: ['無料', '500円'] },
    { id: 'out_BBBBBBBBBB', name: '通知メール', choices: ['出す', '出さない'] },
  ],
  rows: [
    { values: ['はい', 'はい'], impossible: false, results: ['無料', '出す'] },
    { values: ['はい', 'いいえ'], impossible: false, results: ['無料', ''] },
    { values: ['いいえ', 'はい'], impossible: false, results: ['無料', '出す'] },
    { values: ['いいえ', 'いいえ'], impossible: true, results: ['500円', ''] },
  ],
}

describe('decisionTableToTable', () => {
  it('列は No・条件名・結果名の順（画面の表本体と同じ並び）', () => {
    expect(decisionTableToTable(data, opts()).header).toEqual([
      'No',
      '会員か',
      '5000円以上か',
      '送料',
      '通知メール',
    ])
  })

  it('行は値と結果をそのまま並べ、No は行の配列位置', () => {
    expect(decisionTableToTable(data, opts()).rows[0]).toEqual(['1', 'はい', 'はい', '無料', '出す'])
  })

  it('numbering オフなら No 列が出ない', () => {
    const table = decisionTableToTable(data, opts({ numbering: false }))
    expect(table.header[0]).toBe('会員か')
    expect(table.rows[0]).toEqual(['はい', 'はい', '無料', '出す'])
  })

  it('showUndefined オンなら空の結果を（未定義）にする', () => {
    expect(decisionTableToTable(data, opts()).rows[1][4]).toBe('（未定義）')
  })

  it('showUndefined オフなら空の結果は空のまま', () => {
    expect(decisionTableToTable(data, opts({ showUndefined: false })).rows[1][4]).toBe('')
  })

  it('空の条件名・結果名・値ラベルも showUndefined に従う', () => {
    const blank: DecisionTableSchemaVersion1 = {
      ...data,
      conditions: [{ id: 'cond_AAAAAAAAAA', name: '', values: [''] }],
      outcomes: [{ id: 'out_AAAAAAAAAA', name: '', choices: [] }],
      rows: [{ values: [''], impossible: false, results: [''] }],
    }
    expect(decisionTableToTable(blank, opts())).toEqual({
      header: ['No', '（未定義）', '（未定義）'],
      rows: [['1', '（未定義）', '（未定義）']],
    })
    expect(decisionTableToTable(blank, opts({ showUndefined: false }))).toEqual({
      header: ['No', '', ''],
      rows: [['1', '', '']],
    })
  })

  it('起こりえない行は結果列すべてに起こりえないと書く（記入済みの結果も showUndefined も効かない）', () => {
    expect(decisionTableToTable(data, opts()).rows[3]).toEqual([
      '4',
      'いいえ',
      'いいえ',
      '起こりえない',
      '起こりえない',
    ])
    expect(decisionTableToTable(data, opts({ showUndefined: false })).rows[3][4]).toBe('起こりえない')
  })

  it('visible は rowKeyOf の鍵で行を引く', () => {
    const table = decisionTableToTable(data, opts(), new Set([rowKeyOf(data.rows[2])]))
    expect(table.rows).toEqual([['3', 'いいえ', 'はい', '無料', '出す']])
  })

  it('visible で絞っても No は振り直さない', () => {
    const table = decisionTableToTable(
      data,
      opts(),
      new Set([rowKeyOf(data.rows[1]), rowKeyOf(data.rows[3])]),
    )
    expect(table.rows.map((r) => r[0])).toEqual(['2', '4'])
  })

  it('visible が null なら全行、空集合なら見出しだけ', () => {
    expect(decisionTableToTable(data, opts(), null).rows).toHaveLength(4)
    const none = decisionTableToTable(data, opts(), new Set())
    expect(none.rows).toEqual([])
    expect(none.header).toHaveLength(5)
  })

  it('列数の合わない行も見出しと同じ列数に揃える（足りない欄は空、余った欄は落とす）', () => {
    const ragged: DecisionTableSchemaVersion1 = {
      ...data,
      rows: [{ values: ['はい'], impossible: false, results: ['無料', '出す', '余り'] }],
    }
    const table = decisionTableToTable(ragged, opts())
    expect(table.rows).toEqual([['1', 'はい', '（未定義）', '無料', '出す']])
  })

  it('条件が0本なら行も0本で、見出しは No と結果名だけ', () => {
    const empty: DecisionTableSchemaVersion1 = { ...data, conditions: [], rows: [] }
    expect(decisionTableToTable(empty, opts())).toEqual({
      header: ['No', '送料', '通知メール'],
      rows: [],
    })
  })
})
```

- [ ] **Step 3: 赤を確かめる**

Run: `npx vitest run src/modules/decision-table/table.test.ts`
Expected: FAIL。`./table` が見つからない

- [ ] **Step 4: 実装する**

`src/modules/decision-table/table.ts`:

```ts
import { UNDEFINED_TEXT } from '@/core/output-labels'
import type { Table, TableOptions, VisibleRows } from '@/core/table-export'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { IMPOSSIBLE_LABEL, NO_COLUMN_LABEL } from './labels'
import { rowKeyOf } from './rows'

/**
 * 判定表（モジュール規約8）。Markdown 出力の `### 判定表` もこの関数から作る。
 *
 * **列は画面の表本体と同じ並びで、No・条件列・結果列の順。** 右端の起こりえないの
 * トグル列は出さず、起こりえない行は結果列に `IMPOSSIBLE_LABEL` を書いて示す。
 * 画面の結果セルと同じく、記入済みの結果が残っていても起こりえないが勝つ。
 *
 * **No は行の配列位置（`index + 1`）で、`visible` で絞っても振り直さない。**
 * No は行の呼び名（`#N`）であり、振り直すと貼った表と画面で同じ行を別の番号で呼ぶ。
 *
 * **`visible` は `rowKeyOf` で引く。** エディタが額縁へ報告する鍵と同じ関数である。
 * 別の作り方で鍵を組むとどの行とも一致せず、絞り込んだコピーが黙って空になる。
 * 同じ値の組み合わせの行が2本ある表では、片方だけ隠れていても両方出る——
 * その表は `row-set` か `duplicate-value` が赤で出している。
 *
 * **列数は条件と結果の本数で決め、行の配列の長さに合わせない。** `Table` は
 * header と rows の列数が揃っていることを要求する。`row-length` の行は、
 * 足りない欄を空として扱い、余った欄を落とす
 */
export function decisionTableToTable(
  data: DecisionTableSchemaVersion1,
  options: TableOptions,
  visible?: VisibleRows,
): Table {
  const text = (raw: string): string =>
    options.showUndefined && raw === '' ? UNDEFINED_TEXT : raw
  const header = [
    ...(options.numbering ? [NO_COLUMN_LABEL] : []),
    ...data.conditions.map((c) => text(c.name)),
    ...data.outcomes.map((o) => text(o.name)),
  ]
  const rows: string[][] = []
  data.rows.forEach((row, index) => {
    if (visible != null && !visible.has(rowKeyOf(row))) return
    rows.push([
      ...(options.numbering ? [String(index + 1)] : []),
      ...data.conditions.map((_, i) => text(row.values[i] ?? '')),
      ...data.outcomes.map((_, j) =>
        row.impossible ? IMPOSSIBLE_LABEL : text(row.results[j] ?? ''),
      ),
    ])
  })
  return { header, rows }
}
```

- [ ] **Step 5: 緑を確かめる**

Run: `npx vitest run src/modules/decision-table/table.test.ts`
Expected: PASS

- [ ] **Step 6: 鍵のテストが効くことを壊して確かめる**

`table.ts` の `visible.has(rowKeyOf(row))` を一時的に `visible.has(row.values.join('、'))` に変え、`npx vitest run src/modules/decision-table/table.test.ts` で「visible は rowKeyOf の鍵で行を引く」と「visible で絞っても No は振り直さない」が FAIL することを確かめる。次に `visible.has(String(index))` に変えて同じ2本が FAIL することを確かめる。元に戻して PASS に戻ることを確かめ、出力の該当行を報告に貼る。

- [ ] **Step 7: Commit**

```bash
git add src/modules/decision-table/labels.ts src/modules/decision-table/DecisionTableEditor.tsx \
  src/modules/decision-table/GridBody.tsx src/modules/decision-table/DefinitionList.tsx \
  src/modules/decision-table/table.ts src/modules/decision-table/table.test.ts
git commit -m "feat(decision-table): 判定表を表形式コピー用の Table にする"
```

---

### Task 3: Markdown 出力と `describeIssueEffect`

**Files:**
- Create: `src/modules/decision-table/markdown.ts`
- Create: `src/modules/decision-table/markdown.test.ts`

**Interfaces:**
- Consumes: `decisionTableToTable`（Task 2）、`NO_COLUMN_LABEL` / `CONDITION_NAME_LABEL` / `VALUE_LABEL` / `OUTCOME_NAME_LABEL` / `CHOICE_LABEL`（Task 2）、`UNDEFINED_TEXT`（Task 1）、`escapeCell` / `row` / `dividerRow` / `documentHeading`（`@/core/markdown-table`）
- Produces:
  - `decisionTableToMarkdown(data: DecisionTableSchemaVersion1, visible?: VisibleRows): string`
  - `describeDecisionTableIssueEffect(issues: readonly ConsistencyIssue[]): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/decision-table/markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ConsistencyIssue } from '@/core/consistency'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { decisionTableToMarkdown, describeDecisionTableIssueEffect } from './markdown'
import { decisionTableModule } from './module'
import { rowKeyOf } from './rows'

/** #2 の通知メールが空、#4 が起こりえない（結果は記入済みのまま） */
const data: DecisionTableSchemaVersion1 = {
  schemaVersion: 1,
  type: 'decisionTable',
  title: '送料の決定',
  conditions: [
    { id: 'cond_AAAAAAAAAA', name: '会員か', values: ['はい', 'いいえ'] },
    { id: 'cond_BBBBBBBBBB', name: '5000円以上か', values: ['はい', 'いいえ'] },
  ],
  outcomes: [
    { id: 'out_AAAAAAAAAA', name: '送料', choices: ['無料', '500円'] },
    { id: 'out_BBBBBBBBBB', name: '通知メール', choices: ['出す', '出さない'] },
  ],
  rows: [
    { values: ['はい', 'はい'], impossible: false, results: ['無料', '出す'] },
    { values: ['はい', 'いいえ'], impossible: false, results: ['無料', ''] },
    { values: ['いいえ', 'はい'], impossible: false, results: ['無料', '出す'] },
    { values: ['いいえ', 'いいえ'], impossible: true, results: ['500円', ''] },
  ],
}

/** 判定表の節だけを取り出す */
const judgementOf = (md: string): string => md.slice(md.indexOf('### 判定表'))

describe('decisionTableToMarkdown', () => {
  it('条件・結果・判定表の3節を h3 で並べる（全体のバイト一致）', () => {
    expect(decisionTableToMarkdown(data)).toBe(
      [
        '## 送料の決定',
        '',
        '### 条件',
        '',
        '| No | 条件名 | 値 |',
        '| --- | --- | --- |',
        '| 1 | 会員か | はい、いいえ |',
        '| 2 | 5000円以上か | はい、いいえ |',
        '',
        '### 結果',
        '',
        '| No | 結果名 | 選択肢 |',
        '| --- | --- | --- |',
        '| 1 | 送料 | 無料、500円 |',
        '| 2 | 通知メール | 出す、出さない |',
        '',
        '### 判定表',
        '',
        '| No | 会員か | 5000円以上か | 送料 | 通知メール |',
        '| --- | --- | --- | --- | --- |',
        '| 1 | はい | はい | 無料 | 出す |',
        '| 2 | はい | いいえ | 無料 | （未定義） |',
        '| 3 | いいえ | はい | 無料 | 出す |',
        '| 4 | いいえ | いいえ | 起こりえない | 起こりえない |',
        '',
      ].join('\n'),
    )
  })

  it('空の表でも3節の見出しと列見出しを出す', () => {
    expect(decisionTableToMarkdown(decisionTableModule.createEmpty('t'))).toBe(
      [
        '## t',
        '',
        '### 条件',
        '',
        '| No | 条件名 | 値 |',
        '| --- | --- | --- |',
        '',
        '### 結果',
        '',
        '| No | 結果名 | 選択肢 |',
        '| --- | --- | --- |',
        '',
        '### 判定表',
        '',
        '| No |',
        '| --- |',
        '',
      ].join('\n'),
    )
  })

  it('空の条件名と値ラベルは（未定義）、値を1つも持たない条件は空のセル', () => {
    const blank: DecisionTableSchemaVersion1 = {
      ...data,
      conditions: [
        { id: 'cond_AAAAAAAAAA', name: '', values: ['はい', ''] },
        { id: 'cond_BBBBBBBBBB', name: '値なし', values: [] },
      ],
      rows: [],
    }
    const md = decisionTableToMarkdown(blank)
    expect(md).toContain('| 1 | （未定義） | はい、（未定義） |')
    expect(md).toContain('| 2 | 値なし |  |')
  })

  it('セルの | と改行をエスケープする（定義の節にも判定表にも効く）', () => {
    const tricky: DecisionTableSchemaVersion1 = {
      ...data,
      conditions: [{ id: 'cond_AAAAAAAAAA', name: '区分\nA|B', values: ['x|y'] }],
      outcomes: [{ id: 'out_AAAAAAAAAA', name: '送料', choices: ['無料'] }],
      rows: [{ values: ['x|y'], impossible: false, results: ['無料'] }],
    }
    const md = decisionTableToMarkdown(tricky)
    expect(md).toContain('| 1 | 区分<br>A\\|B | x\\|y |')
    expect(md).toContain('| No | 区分<br>A\\|B | 送料 |')
    expect(md).toContain('| 1 | x\\|y | 無料 |')
  })

  it('絞り込みは判定表にだけ効き、No を振り直さない', () => {
    const md = decisionTableToMarkdown(data, new Set([rowKeyOf(data.rows[1])]))
    expect(md).toContain('| 2 | 5000円以上か | はい、いいえ |')
    expect(md).toContain('| 2 | 通知メール | 出す、出さない |')
    expect(judgementOf(md)).toContain('| 2 | はい | いいえ | 無料 | （未定義） |')
    expect(judgementOf(md)).not.toContain('| 1 | はい | はい |')
  })

  it('visible を渡さなければ全行を出す', () => {
    const md = decisionTableToMarkdown(data)
    expect(md).toBe(decisionTableToMarkdown(data, null))
    expect(judgementOf(md).split('\n').filter((l) => /^\| \d/.test(l))).toHaveLength(4)
  })
})

describe('describeDecisionTableIssueEffect', () => {
  const issue = (rule: string): ConsistencyIssue => ({ rule, message: '', locations: [] })

  it('行の集合が直積とずれていると、欠けた組み合わせが表に現れないことを述べる', () => {
    const text = describeDecisionTableIssueEffect([issue('row-set')])
    expect(text).toContain('欠けた組み合わせ')
    expect(text).not.toContain('列数')
  })

  it('列数の合わない行があると、（未定義）で埋めて余りを落とすことを述べる', () => {
    const text = describeDecisionTableIssueEffect([issue('row-length')])
    expect(text).toContain('（未定義）')
    expect(text).not.toContain('欠けた組み合わせ')
  })

  it('両方あれば両方を述べる', () => {
    const text = describeDecisionTableIssueEffect([issue('row-length'), issue('row-set')])
    expect(text).toContain('欠けた組み合わせ')
    expect(text).toContain('列数')
  })

  it('行の形を壊さない指摘だけなら、欠けた組み合わせにも列数にも触れない', () => {
    const text = describeDecisionTableIssueEffect([issue('duplicate-name'), issue('unknown-value')])
    expect(text).toBe('このまま出力すると、指摘のある箇所もそのまま表に出ます。')
  })
})
```

- [ ] **Step 2: 赤を確かめる**

Run: `npx vitest run src/modules/decision-table/markdown.test.ts`
Expected: FAIL。`./markdown` が見つからない

- [ ] **Step 3: 実装する**

`src/modules/decision-table/markdown.ts`:

```ts
import type { ConsistencyIssue } from '@/core/consistency'
import { dividerRow, documentHeading, escapeCell, row } from '@/core/markdown-table'
import { UNDEFINED_TEXT } from '@/core/output-labels'
import { DEFAULT_TABLE_OPTIONS, type TableOptions, type VisibleRows } from '@/core/table-export'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import {
  CHOICE_LABEL,
  CONDITION_NAME_LABEL,
  NO_COLUMN_LABEL,
  OUTCOME_NAME_LABEL,
  VALUE_LABEL,
} from './labels'
import { decisionTableToTable } from './table'

/**
 * デシジョンテーブルの Markdown 出力（モジュール規約5）。
 *
 * - **h1 は使わない**（NotePM のページタイトルと階層が衝突する）。`title` が h2、
 *   `条件`・`結果`・`判定表` の3節が h3
 * - 3節は空でも見出しと列見出しを出す。節の有無が中身で変わると、Git 上で無意味な差分になる
 * - 空欄は `（未定義）`、起こりえない行の結果列は `起こりえない` と書く（rev 8章。
 *   負債を出力にも残す）
 * - **絞り込みは判定表にだけ効く。** 条件と結果の節は定義で、No も定義部の行の番号である
 */

/**
 * 判定表の設定。**No と（未定義）を必ず出す**——Markdown 出力には設定のダイアログが
 * 無く、他ツールの Markdown も No と（未定義）を常に書く
 */
const MARKDOWN_TABLE_OPTIONS: TableOptions = {
  ...DEFAULT_TABLE_OPTIONS,
  numbering: true,
  showUndefined: true,
}

/** 見出しとセルをエスケープして表に組む。エスケープは全セルに一律に掛ける */
function markdownTable(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    row(header.map(escapeCell)),
    dividerRow(header.length),
    ...rows.map((cells) => row(cells.map(escapeCell))),
  ].join('\n')
}

const filled = (text: string): string => (text === '' ? UNDEFINED_TEXT : text)

/**
 * 値ラベル・選択肢ラベルを1セルに収める。用語集の別名と同じく読点で連ねる。
 * **ラベルを1つも持たない条件は空のセルにする**——空の配列は決定1の欠落に無い
 */
const labelList = (labels: readonly string[]): string => labels.map(filled).join('、')

export function decisionTableToMarkdown(
  data: DecisionTableSchemaVersion1,
  visible?: VisibleRows,
): string {
  const conditions = markdownTable(
    [NO_COLUMN_LABEL, CONDITION_NAME_LABEL, VALUE_LABEL],
    data.conditions.map((c, i) => [String(i + 1), filled(c.name), labelList(c.values)]),
  )
  const outcomes = markdownTable(
    [NO_COLUMN_LABEL, OUTCOME_NAME_LABEL, CHOICE_LABEL],
    data.outcomes.map((o, i) => [String(i + 1), filled(o.name), labelList(o.choices)]),
  )
  const judgement = decisionTableToTable(data, MARKDOWN_TABLE_OPTIONS, visible)
  const blocks = [
    documentHeading(data.title),
    '### 条件',
    conditions,
    '### 結果',
    outcomes,
    '### 判定表',
    markdownTable(judgement.header, judgement.rows),
  ]
  return `${blocks.join('\n\n')}\n`
}

/**
 * 整合性エラーがあるまま出力したとき、出力に何が起きるかの文
 *（`OutputProfile.describeIssueEffect`）。額縁の確認ダイアログが出す。
 *
 * **行の形を壊す2つの指摘にだけ固有の文を返す。** 行の集合が直積とずれていると、
 * 抜けた組み合わせが判定表から黙って消える。重複や未知の値は表の形を壊さないので、
 * 触れると読み手に空振りをさせる
 */
export function describeDecisionTableIssueEffect(issues: readonly ConsistencyIssue[]): string {
  const effects: string[] = []
  if (issues.some((i) => i.rule === 'row-set')) {
    effects.push('判定表には今ある行だけが並び、直積から欠けた組み合わせは表に現れません。')
  }
  if (issues.some((i) => i.rule === 'row-length')) {
    effects.push(
      `列数の合わない行は、足りない欄を${UNDEFINED_TEXT}で埋め、余った欄を落として出します。`,
    )
  }
  if (effects.length === 0) return 'このまま出力すると、指摘のある箇所もそのまま表に出ます。'
  return `このまま出力すると、${effects.join('')}`
}
```

**`（未定義）` を文面に直書きしない。** Task 1 の走査テストは引用符で囲んだ文言を拾うので、`'…足りない欄を（未定義）で埋め…'` と書くと拾われないまま複製が1つ増える。テンプレートリテラルで `UNDEFINED_TEXT` を差し込む。

- [ ] **Step 4: 緑を確かめる**

Run: `npx vitest run src/modules/decision-table/markdown.test.ts src/core/output-labels.test.ts`
Expected: PASS

- [ ] **Step 5: 絞り込みのテストが効くことを壊して確かめる**

`decisionTableToMarkdown` の `decisionTableToTable(data, MARKDOWN_TABLE_OPTIONS, visible)` を一時的に `decisionTableToTable(data, MARKDOWN_TABLE_OPTIONS)` に変え、「絞り込みは判定表にだけ効き、No を振り直さない」が FAIL することを確かめる。元に戻して PASS に戻ることを確かめ、出力の該当行を報告に貼る。

- [ ] **Step 6: Commit**

```bash
git add src/modules/decision-table/markdown.ts src/modules/decision-table/markdown.test.ts
git commit -m "feat(decision-table): 条件・結果・判定表を Markdown に出す"
```

---

### Task 4: モジュールに出力を宣言する

**Files:**
- Modify: `src/modules/decision-table/module.ts`
- Modify: `src/modules/decision-table/module.test.ts:22-29`

**Interfaces:**
- Consumes: `decisionTableToMarkdown` / `describeDecisionTableIssueEffect`（Task 3）、`decisionTableToTable`（Task 2）

- [ ] **Step 1: テストを書き換える**

`module.test.ts` の「出力を持たない（額縁が書き出しボタンを押せなくする）」と「表形式コピーもクリップボード交換も宣言しない」の2本を、次の3本に置き換える。

```ts
  it('出力は Markdown 1本で、describeIssueEffect を持つ', () => {
    expect(decisionTableModule.outputs).toHaveLength(1)
    const [only] = decisionTableModule.outputs
    expect(only.id).toBe('default')
    expect(only.label).toBe('Markdown')
    expect(only.fileSuffix).toBe('')
    expect(only.describeIssueEffect).toBeTypeOf('function')
    expect(only.toMarkdown(decisionTableModule.createEmpty('t'))).toContain('### 判定表')
  })

  it('表形式コピーは判定表1本で、設定は No 列と（未定義）だけ', () => {
    const tableExport = decisionTableModule.tableExport
    expect(tableExport?.options).toEqual(['numbering', 'showUndefined'])
    expect(tableExport?.variants.map((v) => v.id)).toEqual(['default'])
    expect(tableExport?.variants.map((v) => v.label)).toEqual(['判定表'])
  })

  it('クリップボード交換は宣言しない', () => {
    expect(decisionTableModule.clipboardExchanges).toBeUndefined()
  })
```

- [ ] **Step 2: 赤を確かめる**

Run: `npx vitest run src/modules/decision-table/module.test.ts`
Expected: FAIL。`outputs` の長さが 0、`tableExport` が undefined

- [ ] **Step 3: 宣言する**

`module.ts` の import に次を足す。

```ts
import { decisionTableToMarkdown, describeDecisionTableIssueEffect } from './markdown'
import { decisionTableToTable } from './table'
```

19〜21行目（規約5 のコメントと `outputs: [],`）を次に置き換える。

```ts
  // 規約5: 判定表を含む Markdown 1本。畳んだ表を足しても形式ごとにプロファイルを割らない
  outputs: [
    {
      id: 'default',
      label: 'Markdown',
      fileSuffix: '',
      toMarkdown: decisionTableToMarkdown,
      describeIssueEffect: describeDecisionTableIssueEffect,
    },
  ],
  // 規約8: 表形式コピー。**読み手は1本**なのでダイアログに選択を出さない。
  // 階層が無いので numberStyle も、親が無いので repeatParent も宣言しない。
  // `variants` は静的な配列なので、結果列ごとに変わる表はここに載せられない
  tableExport: {
    options: ['numbering', 'showUndefined'],
    variants: [{ id: 'default', label: '判定表', toTable: decisionTableToTable }],
  },
```

- [ ] **Step 4: 全体を緑にする**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/decision-table/module.ts src/modules/decision-table/module.test.ts
git commit -m "feat(decision-table): Markdown 出力と表形式コピーをモジュールに宣言する"
```

---

### Task 5: 文書を現在の状態に合わせる

**Files:**
- Modify: `docs/decision-table/decision-table-design-notes.md`
- Modify: `docs/overview-rev.md:21`
- Modify: `docs/missing-semantics.md`（規約2の第2段落）
- Modify: `docs/open-issues.md`

- [ ] **Step 1: 設計ノートに「出力」の節を足す**

`docs/decision-table/decision-table-design-notes.md` の `## 大きさの上限` の直前に、次の節を足す。

```md
## 出力

Markdown は1本で、`## <title>` の下に `### 条件`・`### 結果`・`### 判定表` の3節を置く。3節は空の表でも見出しと列見出しを出す。

- 空欄は `（未定義）` と書き、`起こりえない` の行の結果列には `起こりえない` と書く
- 判定表の列は画面の表本体と同じ並びで、右端のトグル列は出さない
- 列見出しの語は画面と同じ定数を読む（`src/modules/decision-table/labels.ts`）
- 絞り込みは判定表にだけ効く。条件と結果の節は定義なので、行を落とさない
- 絞り込んでも No は振り直さない。行は、エディタが額縁へ報告する鍵と同じ `rowKeyOf` で引く
- 表形式コピーは判定表1本で、設定は No 列の有無と `（未定義）` の有無だけを持つ
- 確認ダイアログの文は、`row-set` と `row-length` にだけ固有の文を返す。直積とずれた表を出力すると、抜けた組み合わせが判定表から消えるためである
```

- [ ] **Step 2: rev 2章の状態の文を直す**

`docs/overview-rev.md:21` の括弧内 `（エディタと整合性検証まで実装済み。出力・まとめて入力・畳み・登録 Skill は未実装。詳細は …）` を、次に置き換える（リンクはそのまま残す）。

```md
（エディタ・整合性検証・絞り込み・まとめて入力・Markdown 出力・表形式コピーまで実装済み。畳み・登録 Skill は未実装。詳細は [`decision-table/decision-table-design-notes.md`](decision-table/decision-table-design-notes.md)）
```

- [ ] **Step 3: 欠落の規約2に `起こりえない` を足す**

`docs/missing-semantics.md` 規約2の第2段落（`出力（Markdown / Mermaid）は画面と別の制約を持つ。` で始まる段落）の末尾に、次の1文を足す。

```md
デシジョンテーブルの `impossible` も同じ扱いで、画面・出力のどちらも `起こりえない` を書く（`src/modules/decision-table/labels.ts` の `IMPOSSIBLE_LABEL`）。
```

- [ ] **Step 4: 残件を書き換える**

`docs/open-issues.md` で次の3つを行う。

1. 「小さな負債」の `**「（未定義）」の文言が4箇所で複製されている**…` の行を削除する
2. 「挙動の穴」の `**表に貼ると `=`／`+`／`-`／`@` で始まるセルが数式として実行されうる**…` の行を、次に置き換える

   ```md
   - **表に貼ると `=`／`+`／`-`／`@` で始まるセルが数式として実行されうる**（`src/core/table-tsv.ts`, `src/core/table-html.ts`）。デシジョンテーブルは値ラベルを人が自由に打ち、`-` を「どちらでもよい」の意味で使う表もあるので、先頭に `'` を足す対策はラベルの見た目を変える。
   ```

3. 「挙動の穴」の末尾（`まとめて入力の適用先を位置で指しており…` の次）に、次の1行を足す

   ```md
   - **結果が0本の表では、出力から `起こりえない` の行を見分けられない**（`src/modules/decision-table/table.ts`）。`起こりえない` を結果列に書いて示すので、結果列が無いと書く場所が無い。
   ```

- [ ] **Step 5: 文書の差分を読み直す**

Run: `git diff docs/`
Expected: 足した文がすべて現在形であること。マイルストーン番号・日付・「〜した」の経緯が無いこと。1項目2文以内であること。削れる文があれば削る

- [ ] **Step 6: Commit**

```bash
git add docs/decision-table/decision-table-design-notes.md docs/overview-rev.md docs/missing-semantics.md docs/open-issues.md
git commit -m "docs(decision-table): 出力の設計と残件を現在の状態に合わせる"
```

---

### Task 6: 最終確認と PR

- [ ] **Step 1: 全検証**

Run: `npm test && npx tsc -b && npm run lint && (cd src-tauri && cargo test)`
Expected: すべて PASS。出力の要約を報告に貼る

- [ ] **Step 2: 実機確認の痕跡が無いことを確かめる**

Run: `git status --short`
Expected: 空

- [ ] **Step 3: PR を作る（宛先は `decision-table`）**

```bash
git push -u origin worktree-decision-table-m3
gh pr create --base decision-table --title "デシジョンテーブル m3: Markdown 出力と表形式コピー" --body-file <本文>
```

PR 本文には次を置く。

- 何を足したか（3節の Markdown、判定表の表形式コピー、「（未定義）」の集約と走査テスト）
- spec との食い違い2点（畳んだ表を入れていない、列見出しを画面の語に合わせた）
- 拾わなかった残件と理由（数式インジェクション、行数の歯止め、列幅）
- 人間に依頼する実機確認のチェックリスト:
  - [ ] 条件3つの表で「Markdown をコピー」を押し、NotePM に貼って3節の表が割れない
  - [ ] 値ラベルに `|` や改行を含めた表で、貼った表が割れない
  - [ ] 絞り込んだ状態で Markdown をコピーすると、判定表だけが絞られ、No が飛び飛びになる。トーストに「N 件中 M 件」が出る
  - [ ] 「表形式でコピー」のダイアログに読み手の選択が出ず、No 列と（未定義）の2つのチェックだけが出る
  - [ ] 表形式でコピーしたものを Excel と Google スプレッドシートに貼り、列がずれない。`起こりえない` 行の結果列が `起こりえない` になる
  - [ ] 絞り込んで表形式でコピーすると、表示中の行だけが貼られる
  - [ ] 整合性エラー（`row-set`）のあるファイルを外から置いて Markdown をコピーすると、確認ダイアログに「欠けた組み合わせ」の文が出る
  - [ ] 「.md に書き出す」は絞り込み中でも全行を書き出す
