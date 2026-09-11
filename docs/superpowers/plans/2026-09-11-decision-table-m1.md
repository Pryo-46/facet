# デシジョンテーブル m1 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 6本目のツールモジュール `decisionTable` を足し、条件3つの表を打ち切れて抜けが空欄として見える状態にする。

**Architecture:** 行は条件の値の直積で、人は行を足しも消しもしない。定義部（`family: 'list'`）で条件と結果を編集し、表本体（`family: 'grid'`）で結果セルだけを埋める。定義部を触るたび、アプリが行を直積へ整え直す。

**Tech Stack:** TypeScript / React / Vitest / oxlint / JSON Schema (ajv)

**Spec:** [`docs/superpowers/specs/2026-09-10-decision-table-design.md`](../specs/2026-09-10-decision-table-design.md)。m1 のスコープは「マイルストーン分割」の表の2行目

## Global Constraints

### 文書とコメントの書き方

次の3つは文書にもコメントにも掛かる。

- 現在形で書く。マイルストーン番号・日付・レビュー指摘・依頼者の指示・変更前の状態・「〜で確定した」の記録を書かない
- 罠は「当初 X していたため Y を取り逃がした」ではなく「X を条件にすると Y を取り逃がす」の形で書く
- テストの名前は守っている性質を名前にする。番号を使わない。テストの件数を文書に書かない

次の2つは **`docs/` の `.md` だけ**に掛かる。コードのコメントには課さない（`CLAUDE.md` はコメントの規則を別の節に持ち、そこに字数の制限が無い）。

- 1項目は2文まで。太字は1段落に1箇所まで。全角括弧の入れ子（`（…（…）…）`）を作らない
- 語順は「状況→条件→結論」。人でないものを主語にして人の動作を書かない

### この計画が守る設計上の約束

- `Command` の語彙を増やさない。行移動は `focus-prev` / `focus-next`、列移動は `focus-prev-field` / `focus-next-field`、`impossible` の入り切りは `toggle-item-state` に写す
- キーの判定を `src/core/keyboard/` の外に書かない。ツール側が書くのは `KeyContext` の組み立てと `runCommand` の写像だけ
- 出力は持たない。`outputs: []` を宣言する（rev 6章が認めている形）
- 表記ゆれ検知の対象フィールド宣言は `ToolModule` に規約が無いので持たない（spec のスコープ外）
- 色値を直書きしない。役割トークン（`text-ink` / `bg-missing-face` 等）を使う
- 文字の段は `text-sm` / `text-base` / `text-xl` の3段だけ。`leading-*` は `none` と `normal` だけ。角丸は `rounded-sm` / `rounded-md` / `rounded-full` だけ

### 検証

- 検証コマンドは `npm test && npx tsc -b && npm run lint`
- 着手時点の全体は緑である（169 ファイル・2274 テスト・`tsc -b` と `oxlint` は終了コード0）
- **vitest は型を検査しない。** `vite:oxc` が型注釈を落とすだけなので、「型が合わないから落ちる」という期待値は成立しない。落ちる／落ちないは実行時の値で決まる
- **`src/modules/*/skill-write.smoke.test.ts` の5本は全体実行でまれに落ちる。** 単体で再実行して通れば既知の不安定さであり、この計画の変更とは無関係である
- `src/types/*.ts` は `.gitignore` の対象で、`npm run gen:types` が毎回作り直す。コミットに含めない

## File Structure

| ファイル | 役割 | 扱い |
| --- | --- | --- |
| `schemas/decision-table.schema.json` | データ形式の正。キーの正規順序も兼ねる | 新規 |
| `src/modules/decision-table/rows.ts` | 直積の展開と、行の再構築（純関数） | 新規 |
| `src/modules/decision-table/commands.ts` | 定義部の編集。行の再構築を必ず通す | 新規 |
| `src/modules/decision-table/missing.ts` | 欠落の判定と集計 | 新規 |
| `src/modules/decision-table/consistency.ts` | 整合性検証と、指摘を区画ごとに引き直す写像 | 新規 |
| `src/modules/decision-table/labels.ts` | 画面に出す語の定数 | 新規 |
| `src/modules/decision-table/DefinitionList.tsx` | 定義部の一覧。条件と結果で同じ部品を使う | 新規 |
| `src/modules/decision-table/GridBody.tsx` | 表本体 | 新規 |
| `src/modules/decision-table/DecisionTableEditor.tsx` | 帯・定義部・表本体の配線 | 新規 |
| `src/modules/decision-table/module.ts` | モジュール規約の実装 | 新規 |
| `src/modules/decision-table/migrate.ts` | マイグレータの枠（初版につき恒等） | 新規 |
| `src/modules/index.ts` | レジストリへの登録 | 変更（2行） |
| `src/components/CellSelect.tsx` | セルのドロップダウン。閉じた見た目と項目の文字を分ける | 変更 |
| `docs/decision-table/decision-table-design-notes.md` | このツールの設計の正 | 新規 |
| `docs/README.md` ／ `docs/overview-rev.md` ／ `docs/missing-semantics.md` ／ `docs/open-issues.md` | 横断文書 | 変更 |
| `plugins/facet/skills/read-project/SKILL.md` | AI 側の読み方 | 変更 |

条件と結果は「名前＋ラベルの配列」という同じ形なので、定義部の部品は1つで足りる。表本体を別ファイルに割るのは、キーボードの家族が定義部と違うためである。

---

## Task 1: スキーマと型

**Files:**
- Create: `schemas/decision-table.schema.json`
- Test: `src/modules/decision-table/schema.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `npm run gen:types` が `src/types/decision-table.ts` に `DecisionTableSchemaVersion1`（`schemaVersion` / `type` / `title` / `conditions` / `outcomes` / `rows`）と `Condition`（`id` / `name` / `values`）と `Outcome`（`id` / `name` / `choices`）と `Row`（`values` / `impossible` / `results`）を出す

- [ ] **Step 1: スキーマを書く**

`schemas/decision-table.schema.json` を新規作成する。`properties` の記載順がそのまま正規形のキー順になるので、並びを変えないこと。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "decision-table.schema.json",
  "title": "デシジョンテーブル (decisionTable) schemaVersion 1",
  "description": "仕様整理ツール詰め合わせのデシジョンテーブルファイル。条件の組み合わせで結果が決まる仕様を、全組み合わせを展開した表として持つ。行は conditions の値の直積であり、人は行を足しも消しもしない——アプリが条件の編集のたびに直積へ整え直す。キーの正規順序は本スキーマの properties 記載順とする。",
  "type": "object",
  "properties": {
    "schemaVersion": {
      "description": "スキーマの版。decisionTable の初版は 1。アプリは検証前にこの値を読み、未知の新版は「一覧表示のみ・編集不可」として扱う。",
      "const": 1
    },
    "type": {
      "description": "ツール種別。デシジョンテーブルは decisionTable 固定。",
      "const": "decisionTable"
    },
    "title": {
      "description": "表示名。プロジェクトのファイル一覧に使う。",
      "type": "string"
    },
    "conditions": {
      "description": "条件の配列。配列順が行の並び順を決める（左端の条件が最もゆっくり回る）。",
      "type": "array",
      "items": { "$ref": "#/$defs/condition" }
    },
    "outcomes": {
      "description": "結果の配列。配列順が rows[].results の並び順と一致する。",
      "type": "array",
      "items": { "$ref": "#/$defs/outcome" }
    },
    "rows": {
      "description": "判定表の行。conditions の値の直積を展開したもので、欠け・余り・順序違いは整合性検証（レベル2）で赤表示する。",
      "type": "array",
      "items": { "$ref": "#/$defs/row" }
    }
  },
  "required": ["schemaVersion", "type", "title", "conditions", "outcomes", "rows"],
  "additionalProperties": false,
  "$defs": {
    "condition": {
      "description": "条件1つ。全キー常在（欠損でなく空の値で「未記入」を表現する）。",
      "type": "object",
      "properties": {
        "id": {
          "description": "不変ID。プレフィクス cond_ ＋ nanoid（英数字62文字カスタムアルファベット）10文字固定。連番禁止。",
          "type": "string",
          "pattern": "^cond_[A-Za-z0-9]{10}$"
        },
        "name": {
          "description": "条件名。空文字＝「未記入」として欠落表示の対象。",
          "type": "string"
        },
        "values": {
          "description": "この条件がとりうる値のラベル。行はラベルを直接持つので、ここを書き換えるとアプリが全行を書き直す。同じラベルが2件以上あってもスキーマでは拒否せず、整合性検証（レベル2）で赤表示する——打ち終わる前の自動保存がレベル1違反ファイルを作らないようにするため。",
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "required": ["id", "name", "values"],
      "additionalProperties": false
    },
    "outcome": {
      "description": "結果1つ。全キー常在（欠損でなく空の値で「未記入」を表現する）。",
      "type": "object",
      "properties": {
        "id": {
          "description": "不変ID。プレフィクス out_ ＋ nanoid（英数字62文字カスタムアルファベット）10文字固定。連番禁止。",
          "type": "string",
          "pattern": "^out_[A-Za-z0-9]{10}$"
        },
        "name": {
          "description": "結果名。空文字＝「未記入」として欠落表示の対象。",
          "type": "string"
        },
        "choices": {
          "description": "この結果が取りうる値のラベル。rows[].results はここから選ぶ。重複はスキーマで拒否せず整合性検証で赤表示する（values と同じ理由）。",
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "required": ["id", "name", "choices"],
      "additionalProperties": false
    },
    "row": {
      "description": "判定表の行1つ。行は導出物なので ID を持たない——位置（先頭を #1 とする番号）で指す。",
      "type": "object",
      "properties": {
        "values": {
          "description": "条件の値。conditions と同じ長さ・同じ順で、各要素は conditions[i].values のいずれかのラベル。",
          "type": "array",
          "items": { "type": "string" }
        },
        "impossible": {
          "description": "現実には起こりえない組み合わせか。条件同士が独立でないと直積にそうした行が出るので、永遠に埋まらない欠落を残さないために持つ。理由の記述欄は持たない。",
          "type": "boolean"
        },
        "results": {
          "description": "結果。outcomes と同じ長さ・同じ順で、各要素は outcomes[j].choices のいずれかのラベルか空文字。空文字＝「未記入」で、impossible が true の行では欠落として数えない。",
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "required": ["values", "impossible", "results"],
      "additionalProperties": false
    }
  }
}
```

- [ ] **Step 2: 型が生成されることを確認する**

Run: `npm run gen:types`
Expected: 出力に `gen:types  decision-table.schema.json -> src/types/decision-table.ts` の行がある

続けて生成物の名前を確かめる。

Run: `grep -n "^export interface" src/types/decision-table.ts`
Expected:

```
6:export interface DecisionTableSchemaVersion1 {
35:export interface Condition {
52:export interface Outcome {
69:export interface Row {
```

行番号は description の長さで動く。**名前の4つが出ていれば合格**とする。

- [ ] **Step 3: スキーマ検証のテストを書く**

`src/modules/decision-table/schema.test.ts` を新規作成する。既存4モジュールの `schema.test.ts` と同じ形で、正常データを1点ずつ崩す。

```ts
import { describe, expect, it } from 'vitest'
import type { JsonSchema } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import decisionTableSchema from '../../../schemas/decision-table.schema.json'

const validate = createSchemaValidator(decisionTableSchema as JsonSchema)

/** 全フィールドが埋まった正常データ。各テストはここから1点だけ崩す */
function valid() {
  return {
    schemaVersion: 1,
    type: 'decisionTable',
    title: '送料の決定',
    conditions: [
      { id: 'cond_Aaaaaaaaa1', name: '会員か', values: ['はい', 'いいえ'] },
      { id: 'cond_Aaaaaaaaa2', name: '5000円以上か', values: ['はい', 'いいえ'] },
    ],
    outcomes: [{ id: 'out_Aaaaaaaaa1', name: '送料', choices: ['無料', '500円'] }],
    rows: [
      { values: ['はい', 'はい'], impossible: false, results: ['無料'] },
      { values: ['はい', 'いいえ'], impossible: false, results: ['無料'] },
      { values: ['いいえ', 'はい'], impossible: false, results: ['無料'] },
      { values: ['いいえ', 'いいえ'], impossible: true, results: [''] },
    ],
  }
}

describe('decisionTable スキーマ（レベル1）', () => {
  it('正常データを受け入れる', () => {
    expect(validate(valid()).ok).toBe(true)
  })

  it('空の表を受け入れる（新規作成の雛形）', () => {
    expect(
      validate({
        schemaVersion: 1,
        type: 'decisionTable',
        title: '新しい表',
        conditions: [],
        outcomes: [],
        rows: [],
      }).ok,
    ).toBe(true)
  })

  it('条件名が空でも受け入れる（空は欠落であって構造の破れではない）', () => {
    const d = valid()
    d.conditions[0].name = ''
    expect(validate(d).ok).toBe(true)
  })

  it('値ラベルの重複を受け入れる（整合性検証の担当）', () => {
    const d = valid()
    d.conditions[0].values = ['はい', 'はい']
    expect(validate(d).ok).toBe(true)
  })

  it('直積と一致しない行を受け入れる（整合性検証の担当）', () => {
    const d = valid()
    d.rows = [d.rows[0]]
    expect(validate(d).ok).toBe(true)
  })

  it('条件 ID のプレフィクス違いを拒否する', () => {
    const d = valid()
    d.conditions[0].id = 'out_Aaaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })

  it('結果 ID のプレフィクス違いを拒否する', () => {
    const d = valid()
    d.outcomes[0].id = 'cond_Aaaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })

  it('ID が11文字だと拒否する（長すぎる方向）', () => {
    const d = valid()
    d.conditions[0].id = 'cond_Aaaaaaaaa12'
    expect(validate(d).ok).toBe(false)
  })

  it('ID が9文字だと拒否する（短すぎる方向）', () => {
    const d = valid()
    d.conditions[0].id = 'cond_Aaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })

  it('schemaVersion の const 違反を拒否する', () => {
    const d = valid() as Record<string, unknown>
    d.schemaVersion = 2
    expect(validate(d).ok).toBe(false)
  })

  it('type の const 違反を拒否する', () => {
    const d = valid() as Record<string, unknown>
    d.type = 'glossary'
    expect(validate(d).ok).toBe(false)
  })

  it('impossible が無い行を拒否する（三値に開かない）', () => {
    const d = valid()
    delete (d.rows[0] as Record<string, unknown>).impossible
    expect(validate(d).ok).toBe(false)
  })

  it('impossible が文字列だと拒否する', () => {
    const d = valid()
    ;(d.rows[0] as Record<string, unknown>).impossible = 'true'
    expect(validate(d).ok).toBe(false)
  })

  it('results に文字列以外が混ざると拒否する', () => {
    const d = valid()
    ;(d.rows[0].results as unknown[])[0] = null
    expect(validate(d).ok).toBe(false)
  })

  it('トップレベルの未知キーを拒否する', () => {
    const d = valid() as Record<string, unknown>
    d.folds = []
    expect(validate(d).ok).toBe(false)
  })

  it('条件の未知キーを拒否する', () => {
    const d = valid()
    ;(d.conditions[0] as Record<string, unknown>).note = 'x'
    expect(validate(d).ok).toBe(false)
  })

  it('結果の未知キーを拒否する', () => {
    const d = valid()
    ;(d.outcomes[0] as Record<string, unknown>).color = 'red'
    expect(validate(d).ok).toBe(false)
  })

  it('行の未知キーを拒否する', () => {
    const d = valid()
    ;(d.rows[0] as Record<string, unknown>).reason = '在庫切れ'
    expect(validate(d).ok).toBe(false)
  })
})
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/decision-table/schema.test.ts`
Expected: PASS（全件）

**このタスクのテストは最初から緑である。** スキーマ検証は ajv が行うので、先に赤にするための実装が無い。壊して赤くなることは Step 5 で確かめる。

- [ ] **Step 5: 番人が実在することを壊して確かめる**

次の2つの変異を1つずつ入れ、赤くなるテストを確認してから戻す。

| 変異 | 赤くなるテスト |
| --- | --- |
| `$defs.row` の `additionalProperties` を `true` にする | `行の未知キーを拒否する` |
| `$defs.condition.properties.id.pattern` を `"^cond_[A-Za-z0-9]+$"` にする | `ID が11文字だと拒否する（長すぎる方向）` と `ID が9文字だと拒否する（短すぎる方向）` |

戻したあと `git status --short` が Step 1 と Step 3 の変更だけを示すこと。

- [ ] **Step 6: 全体が緑であることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS。テストファイル数は 170 に増える

- [ ] **Step 7: コミット**

```bash
git add schemas/decision-table.schema.json src/modules/decision-table/schema.test.ts
git commit -m "$(cat <<'EOF'
feat(decision-table): スキーマを足す

行はラベルを直接持ち、ID で条件の値を参照しない。行が単体で読め、
ヘッダを一度読めばあとは CSV と同じ読み方で追える。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## Task 2: 行の直積と再構築

行の集合を条件の値の直積として展開し、定義部を編集したときに既存の結果を引き継ぐ。**このタスクは純関数だけで、画面も React も持たない。**

**Files:**
- Create: `src/modules/decision-table/rows.ts`
- Test: `src/modules/decision-table/rows.test.ts`

**Interfaces:**
- Consumes: Task 1 の `Condition` / `Row`（`@/types/decision-table`）
- Produces:
  - `export const MAX_ROWS = 1024`
  - `export function productSize(conditions: readonly Condition[]): number`
  - `export function valueIndicesAt(conditions: readonly Condition[], position: number): number[]`
  - `export interface Axis { from: number | null; valueFrom: readonly (number | null)[] }`
  - `export interface RebuildResult { rows: Row[]; clearedCells: number; lostCells: number }`
  - `export function identityAxes(conditions: readonly Condition[]): Axis[]`
  - `export function axesById(prev: readonly Condition[], next: readonly Condition[]): Axis[]`
  - `export function outcomeFromById(prev: readonly { id: string }[], next: readonly { id: string }[]): (number | null)[]`
  - `export function rebuildRows(prevConditions, prevRows, nextConditions, axes, outcomeFrom): RebuildResult`

- [ ] **Step 1: 落ちるテストを書く**

`src/modules/decision-table/rows.test.ts` を新規作成する。

```ts
import { describe, expect, it } from 'vitest'
import type { Condition, Row } from '@/types/decision-table'
import {
  axesById,
  identityAxes,
  outcomeFromById,
  productSize,
  rebuildRows,
  valueIndicesAt,
  type Axis,
} from './rows'

const cond = (id: string, name: string, values: string[]): Condition => ({ id, name, values })
const row = (values: string[], results: string[], impossible = false): Row => ({
  values,
  impossible,
  results,
})

/** 会員か × 5000円以上か の2条件・結果1本 */
const TWO: Condition[] = [
  cond('cond_Aaaaaaaaa1', '会員か', ['はい', 'いいえ']),
  cond('cond_Aaaaaaaaa2', '5000円以上か', ['はい', 'いいえ']),
]
const TWO_ROWS: Row[] = [
  row(['はい', 'はい'], ['無料']),
  row(['はい', 'いいえ'], ['無料']),
  row(['いいえ', 'はい'], ['無料']),
  row(['いいえ', 'いいえ'], ['500円']),
]

describe('直積の大きさ', () => {
  it('条件が0本なら行も0本', () => {
    expect(productSize([])).toBe(0)
  })

  it('値の本数の積になる', () => {
    expect(productSize(TWO)).toBe(4)
    expect(productSize([...TWO, cond('cond_Aaaaaaaaa3', '会員種別', ['金', '銀', '銅'])])).toBe(12)
  })

  it('値を持たない条件があると0本', () => {
    expect(productSize([cond('cond_Aaaaaaaaa1', '空', [])])).toBe(0)
  })
})

describe('直積の位置と値の添字', () => {
  it('左端の条件が最もゆっくり回る', () => {
    expect(valueIndicesAt(TWO, 0)).toEqual([0, 0])
    expect(valueIndicesAt(TWO, 1)).toEqual([0, 1])
    expect(valueIndicesAt(TWO, 2)).toEqual([1, 0])
    expect(valueIndicesAt(TWO, 3)).toEqual([1, 1])
  })
})

describe('行の再構築', () => {
  it('条件を触らなければ行も結果も変わらない', () => {
    const built = rebuildRows(TWO, TWO_ROWS, TWO, identityAxes(TWO), [0])
    expect(built.rows).toEqual(TWO_ROWS)
    expect(built.clearedCells).toBe(0)
    expect(built.lostCells).toBe(0)
  })

  it('条件を足すと行が増え、既存の結果が複製される', () => {
    const next = [...TWO, cond('cond_Aaaaaaaaa3', 'キャンペーン中か', ['はい', 'いいえ'])]
    const built = rebuildRows(TWO, TWO_ROWS, next, axesById(TWO, next), [0])
    expect(built.rows).toHaveLength(8)
    expect(built.rows[0]).toEqual(row(['はい', 'はい', 'はい'], ['無料']))
    expect(built.rows[1]).toEqual(row(['はい', 'はい', 'いいえ'], ['無料']))
    expect(built.rows[6]).toEqual(row(['いいえ', 'いいえ', 'はい'], ['500円']))
    expect(built.lostCells).toBe(0)
  })

  it('値を足すとその値の行だけ空から始まる', () => {
    const next: Condition[] = [
      cond('cond_Aaaaaaaaa1', '会員か', ['はい', 'いいえ', '退会済み']),
      TWO[1],
    ]
    const axes: Axis[] = [{ from: 0, valueFrom: [0, 1, null] }, { from: 1, valueFrom: [0, 1] }]
    const built = rebuildRows(TWO, TWO_ROWS, next, axes, [0])
    expect(built.rows).toHaveLength(6)
    expect(built.rows[0].results).toEqual(['無料'])
    expect(built.rows[4]).toEqual(row(['退会済み', 'はい'], ['']))
    expect(built.rows[5]).toEqual(row(['退会済み', 'いいえ'], ['']))
    expect(built.lostCells).toBe(0)
  })

  it('値を消すとその値の行が消え、記入済みだった結果が失われる', () => {
    const next: Condition[] = [cond('cond_Aaaaaaaaa1', '会員か', ['はい']), TWO[1]]
    const axes: Axis[] = [{ from: 0, valueFrom: [0] }, { from: 1, valueFrom: [0, 1] }]
    const built = rebuildRows(TWO, TWO_ROWS, next, axes, [0])
    expect(built.rows).toEqual([row(['はい', 'はい'], ['無料']), row(['はい', 'いいえ'], ['無料'])])
    expect(built.clearedCells).toBe(0)
    expect(built.lostCells).toBe(2)
  })

  it('条件を消して結果が一致するなら、そのまま残る', () => {
    // 「5000円以上か」を消す。会員＝はい の2行はどちらも無料なので食い違わない
    const next = [TWO[0]]
    const built = rebuildRows(TWO, TWO_ROWS, next, axesById(TWO, next), [0])
    expect(built.rows[0]).toEqual(row(['はい'], ['無料']))
    expect(built.rows[1]).toEqual(row(['いいえ'], ['']))
    expect(built.clearedCells).toBe(1)
    // 4件のうち、会員＝はい の2件が「無料」として1つの行へ残る
    expect(built.lostCells).toBe(2)
  })

  it('条件を消して結果が食い違うと空欄に落ちる', () => {
    // 「会員か」を消す。5000円以上＝いいえ の2行は 無料 と 500円 で食い違う
    const next = [TWO[1]]
    const built = rebuildRows(TWO, TWO_ROWS, next, axesById(TWO, next), [0])
    expect(built.rows).toEqual([row(['はい'], ['無料']), row(['いいえ'], [''])])
    expect(built.clearedCells).toBe(1)
    expect(built.lostCells).toBe(2)
  })

  it('起こりえない旗も食い違えば偽に落ちる', () => {
    const prevRows: Row[] = [
      row(['はい', 'はい'], ['無料'], true),
      row(['はい', 'いいえ'], ['無料'], false),
      row(['いいえ', 'はい'], ['無料'], true),
      row(['いいえ', 'いいえ'], ['無料'], true),
    ]
    const next = [TWO[1]]
    const built = rebuildRows(TWO, prevRows, next, axesById(TWO, next), [0])
    expect(built.rows[0].impossible).toBe(true)
    expect(built.rows[1].impossible).toBe(false)
  })

  it('条件を並び替えても結果は座標で追いつく', () => {
    const next = [TWO[1], TWO[0]]
    const built = rebuildRows(TWO, TWO_ROWS, next, axesById(TWO, next), [0])
    expect(built.rows).toEqual([
      row(['はい', 'はい'], ['無料']),
      row(['はい', 'いいえ'], ['無料']),
      row(['いいえ', 'はい'], ['無料']),
      row(['いいえ', 'いいえ'], ['500円']),
    ])
    expect(built.lostCells).toBe(0)
  })

  it('結果を足すと列が空で増える', () => {
    const built = rebuildRows(TWO, TWO_ROWS, TWO, identityAxes(TWO), [0, null])
    expect(built.rows[0].results).toEqual(['無料', ''])
    expect(built.lostCells).toBe(0)
  })

  it('結果を消すとその列の記入済みが失われる', () => {
    const built = rebuildRows(TWO, TWO_ROWS, TWO, identityAxes(TWO), [])
    expect(built.rows[0].results).toEqual([])
    expect(built.lostCells).toBe(4)
  })

  it('直積になっていない行は位置で引き直され、置き場の無い行が落ちる', () => {
    const broken: Row[] = [row(['はい', 'はい'], ['無料'])]
    const built = rebuildRows(TWO, broken, TWO, identityAxes(TWO), [0])
    expect(built.rows).toHaveLength(4)
    expect(built.rows[0].results).toEqual(['無料'])
    expect(built.rows[3].results).toEqual([''])
    expect(built.lostCells).toBe(0)
  })

  it('条件を全部消すと行も消える', () => {
    const built = rebuildRows(TWO, TWO_ROWS, [], [], [0])
    expect(built.rows).toEqual([])
    expect(built.lostCells).toBe(4)
  })
})

describe('対応づけ', () => {
  it('id が一致する条件を引き当て、無い条件は新設として null を返す', () => {
    const next = [TWO[1], cond('cond_Aaaaaaaaa9', '新しい条件', ['はい', 'いいえ'])]
    expect(axesById(TWO, next)).toEqual([
      { from: 1, valueFrom: [0, 1] },
      { from: null, valueFrom: [] },
    ])
  })

  it('結果も id で引き当てる', () => {
    const prev = [{ id: 'out_Aaaaaaaaa1' }, { id: 'out_Aaaaaaaaa2' }]
    expect(outcomeFromById(prev, [{ id: 'out_Aaaaaaaaa2' }, { id: 'out_Aaaaaaaaa9' }])).toEqual([
      1,
      null,
    ])
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/modules/decision-table/rows.test.ts`
Expected: FAIL。`Error: Cannot find module './rows' imported from ...` が出て `Failed Suites 1` ／ `Tests  no tests` になる

- [ ] **Step 3: `rows.ts` を書く**

```ts
import type { Condition, Row } from '@/types/decision-table'

/**
 * 行数の上限。2値の条件なら10本、3値なら6本まで立てられる。
 *
 * **直積は条件を1つ足すごとに倍以上になる。** 上限が無いと、ボタン1回で
 * 数万行の DOM を作って画面が固まる。上限に達したら定義部の追加ボタンを
 * 押せなくする（`DecisionTableEditor`）
 */
export const MAX_ROWS = 1024

/**
 * 条件の値の直積の行数。**条件が0本なら0とする。**
 * 数学的な直積は空タプル1本だが、条件を立てる前の表に行を出しても人が埋めるものが無い
 */
export function productSize(conditions: readonly Condition[]): number {
  if (conditions.length === 0) return 0
  return conditions.reduce((n, c) => n * c.values.length, 1)
}

/**
 * 直積の位置 → 条件ごとの値の添字。**左端の条件が最もゆっくり回る**ので、
 * 右端から順に剰余を取る。
 *
 * **`productSize` が0のときに呼ばない。** 値を持たない条件があると
 * 0 で割ることになる。呼び出し側は `position < productSize(conditions)` を守る
 */
export function valueIndicesAt(conditions: readonly Condition[], position: number): number[] {
  const out: number[] = []
  let rest = position
  for (let i = conditions.length - 1; i >= 0; i--) {
    const n = conditions[i].values.length
    out[i] = rest % n
    rest = Math.floor(rest / n)
  }
  return out
}

/**
 * 新しい条件1本の引き継ぎ元。
 *
 * `from` が null のときは旧に対応が無いので、その軸は制約を置かない
 *（＝旧の1行が新しい複数行へ複製される）。`from` がある軸で
 * `valueFrom[v]` が null のときは、その値に引き継ぐ元が無い（＝空から始まる）
 */
export interface Axis {
  /** 旧 conditions の添字。null＝新しく足した条件 */
  from: number | null
  /** 新しい値の添字 → 旧の値の添字。null＝新しく足した値。`from` が null なら読まない */
  valueFrom: readonly (number | null)[]
}

export interface RebuildResult {
  rows: Row[]
  /** まとまった行で値が食い違い、空欄に落ちた結果セルの数 */
  clearedCells: number
  /** 記入済みだったのに新しい表に残らない結果セルの数。`clearedCells` の分を含む */
  lostCells: number
}

/** 値の増減が無いときの対応づけ。条件も値もその位置のまま引き継ぐ */
export function identityAxes(conditions: readonly Condition[]): Axis[] {
  return conditions.map((c, i) => ({ from: i, valueFrom: c.values.map((_, v) => v) }))
}

/**
 * 条件の追加・削除・並び替えの対応づけ。**値の増減はこの関数では表せない**
 *（ラベルからは「消した」と「書き換えた」を見分けられない）ので、
 * 値を触る操作は `Axis` を自分で組み立てる。
 *
 * **ID が重複していると先頭の1件に引き当たる。** 重複は整合性検証が赤で出す
 */
export function axesById(prev: readonly Condition[], next: readonly Condition[]): Axis[] {
  return next.map((c) => {
    const from = prev.findIndex((p) => p.id === c.id)
    return from < 0
      ? { from: null, valueFrom: [] }
      : { from, valueFrom: prev[from].values.map((_, v) => v) }
  })
}

/** 結果の追加・削除・並び替えの対応づけ。null＝新しく足した結果 */
export function outcomeFromById(
  prev: readonly { id: string }[],
  next: readonly { id: string }[],
): (number | null)[] {
  return next.map((o) => {
    const from = prev.findIndex((p) => p.id === o.id)
    return from < 0 ? null : from
  })
}

/** 全要素が同じ値ならその値、違えば null。空の配列も null */
function agreed<T>(values: readonly T[]): T | null {
  if (values.length === 0) return null
  const first = values[0]
  return values.every((v) => v === first) ? first : null
}

/**
 * 新しい行1つに対応する、旧の行の位置。
 *
 * 制約を置かない旧の軸（消した条件）は全ての値を走査するので、
 * 戻り値が2件以上になる＝行がまとまる＝結果が食い違いうる
 */
function sourceRows(
  prevConditions: readonly Condition[],
  prevRows: readonly Row[],
  axes: readonly Axis[],
  indices: readonly number[],
): number[] {
  const pin: (number | null)[] = prevConditions.map(() => null)
  for (let a = 0; a < axes.length; a++) {
    const axis = axes[a]
    if (axis.from === null) continue
    const pv = axis.valueFrom[indices[a]]
    if (pv === null || pv === undefined) return []
    pin[axis.from] = pv
  }
  let positions: number[] = [0]
  for (let i = 0; i < prevConditions.length; i++) {
    const n = prevConditions[i].values.length
    const fixed = pin[i]
    const next: number[] = []
    for (const base of positions) {
      if (fixed === null) {
        for (let v = 0; v < n; v++) next.push(base * n + v)
      } else {
        next.push(base * n + fixed)
      }
    }
    positions = next
  }
  // 旧の行が直積になっていないファイルでは、位置に行が無いことがある
  return positions.filter((p) => prevRows[p] !== undefined)
}

/**
 * 行の集合を直積へ整え直し、既存の結果を座標で引き継ぐ。
 *
 * **旧の行は「旧の直積での位置」で引く。** ラベルで引くと、値のラベルが
 * 重複しているファイルでどの行を指しているか決められない。位置で引く形は
 * 直積になっていないファイルを整え直す経路も兼ねる
 */
export function rebuildRows(
  prevConditions: readonly Condition[],
  prevRows: readonly Row[],
  nextConditions: readonly Condition[],
  axes: readonly Axis[],
  outcomeFrom: readonly (number | null)[],
): RebuildResult {
  const total = productSize(nextConditions)
  const rows: Row[] = []
  let clearedCells = 0
  /** 新しい表へ持ち越せた、旧の（行の位置, 結果の添字）の組 */
  const survived = new Set<string>()

  for (let position = 0; position < total; position++) {
    const indices = valueIndicesAt(nextConditions, position)
    const values = nextConditions.map((c, i) => c.values[indices[i]])
    const sources = sourceRows(prevConditions, prevRows, axes, indices)
    const results: string[] = []
    for (let j = 0; j < outcomeFrom.length; j++) {
      const pj = outcomeFrom[j]
      if (pj === null || sources.length === 0) {
        results.push('')
        continue
      }
      const picked = agreed(sources.map((s) => prevRows[s].results[pj] ?? ''))
      if (picked === null) {
        results.push('')
        clearedCells += 1
        continue
      }
      results.push(picked)
      if (picked !== '') for (const s of sources) survived.add(`${s}:${pj}`)
    }
    const impossible = agreed(sources.map((s) => prevRows[s].impossible)) ?? false
    rows.push({ values, impossible, results })
  }

  let filled = 0
  for (const prev of prevRows) {
    for (const value of prev.results) if (value !== '') filled += 1
  }
  return { rows, clearedCells, lostCells: filled - survived.size }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/decision-table/rows.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: 番人が実在することを壊して確かめる**

次の3つの変異を1つずつ入れ、赤くなるテストを確認してから戻す。

| 変異 | 赤くなるテスト |
| --- | --- |
| `valueIndicesAt` のループを `for (let i = 0; i < conditions.length; i++)` にする | `左端の条件が最もゆっくり回る` |
| `sourceRows` の `if (pv === null \|\| pv === undefined) return []` を消す | `値を足すとその値の行だけ空から始まる` |
| `rebuildRows` の `if (picked === null)` の分岐で `results.push(sources.map(...)[0])` を返すようにする | `条件を消して結果が食い違うと空欄に落ちる` |

戻したあと `git status --short` が Step 1 と Step 3 の変更だけを示すこと。

- [ ] **Step 6: 全体が緑であることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/modules/decision-table/rows.ts src/modules/decision-table/rows.test.ts
git commit -m "$(cat <<'EOF'
feat(decision-table): 行を直積へ整える純関数を足す

旧の行を直積での位置で引くので、値のラベルが重複していても
どの行を引き継ぐかが決まる。直積になっていないファイルを整え直す経路も兼ねる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## Task 3: 定義部の編集コマンド

定義部の編集を関数にまとめ、行の再構築を必ず通す。**画面はこれらの関数しか呼ばない**ので、「行を直積へ整えるのを忘れた経路」が生まれない。

**Files:**
- Create: `src/modules/decision-table/commands.ts`
- Test: `src/modules/decision-table/commands.test.ts`

**Interfaces:**
- Consumes: Task 2 の `rebuildRows` / `identityAxes` / `axesById` / `outcomeFromById` / `Axis`
- Produces:
  - `export interface Applied { data: DecisionTableSchemaVersion1; clearedCells: number; lostCells: number }`
  - `export function newCondition(): Condition` ／ `export function newOutcome(): Outcome`
  - 定義部の操作（戻り値は `Applied`）: `setConditions(data, next)` ／ `setOutcomes(data, next)` ／ `renameCondition(data, index, name)` ／ `renameOutcome(data, index, name)` ／ `addValue(data, condIndex)` ／ `removeValue(data, condIndex, valueIndex)` ／ `renameValue(data, condIndex, valueIndex, label)` ／ `addChoice(data, outIndex)` ／ `removeChoice(data, outIndex, choiceIndex)` ／ `renameChoice(data, outIndex, choiceIndex, label)`
  - 表本体の操作（戻り値は `DecisionTableSchemaVersion1`。行は変わらない）: `setResult(data, rowIndex, outIndex, value)` ／ `toggleImpossible(data, rowIndex)`

- [ ] **Step 1: 落ちるテストを書く**

`src/modules/decision-table/commands.test.ts` を新規作成する。

```ts
import { describe, expect, it } from 'vitest'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import {
  addChoice,
  addValue,
  newCondition,
  newOutcome,
  removeChoice,
  removeValue,
  renameChoice,
  renameCondition,
  renameValue,
  setConditions,
  setOutcomes,
  setResult,
  toggleImpossible,
} from './commands'

function table(): DecisionTableSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'decisionTable',
    title: '送料の決定',
    conditions: [
      { id: 'cond_Aaaaaaaaa1', name: '会員か', values: ['はい', 'いいえ'] },
      { id: 'cond_Aaaaaaaaa2', name: '5000円以上か', values: ['はい', 'いいえ'] },
    ],
    outcomes: [{ id: 'out_Aaaaaaaaa1', name: '送料', choices: ['無料', '500円'] }],
    rows: [
      { values: ['はい', 'はい'], impossible: false, results: ['無料'] },
      { values: ['はい', 'いいえ'], impossible: false, results: ['無料'] },
      { values: ['いいえ', 'はい'], impossible: false, results: ['無料'] },
      { values: ['いいえ', 'いいえ'], impossible: false, results: ['500円'] },
    ],
  }
}

describe('採番', () => {
  it('新しい条件は名前が空で、はい／いいえ の2値から始まる', () => {
    const c = newCondition()
    expect(c.id).toMatch(/^cond_[A-Za-z0-9]{10}$/)
    expect(c.name).toBe('')
    expect(c.values).toEqual(['はい', 'いいえ'])
  })

  it('新しい結果は名前も選択肢も空から始まる', () => {
    const o = newOutcome()
    expect(o.id).toMatch(/^out_[A-Za-z0-9]{10}$/)
    expect(o.name).toBe('')
    expect(o.choices).toEqual([])
  })
})

describe('条件の増減', () => {
  it('条件を足すと行が倍になり、既存の結果が複製される', () => {
    const data = table()
    const added = { id: 'cond_Aaaaaaaaa3', name: '', values: ['はい', 'いいえ'] }
    const out = setConditions(data, [...data.conditions, added])
    expect(out.data.rows).toHaveLength(8)
    expect(out.data.rows[0].results).toEqual(['無料'])
    expect(out.data.rows[1].results).toEqual(['無料'])
    expect(out.lostCells).toBe(0)
  })

  it('条件を消すと食い違った結果が空欄に落ちる', () => {
    const data = table()
    const out = setConditions(data, [data.conditions[1]])
    expect(out.data.rows.map((r) => r.results[0])).toEqual(['無料', ''])
    expect(out.clearedCells).toBe(1)
    expect(out.lostCells).toBe(2)
  })

  it('条件名を変えても行は変わらない', () => {
    const data = table()
    const out = renameCondition(data, 0, '会員ランクが上位か')
    expect(out.data.conditions[0].name).toBe('会員ランクが上位か')
    expect(out.data.rows).toEqual(data.rows)
    expect(out.lostCells).toBe(0)
  })
})

describe('値の増減', () => {
  it('値を足すと行が増え、新しい値の行だけ空から始まる', () => {
    const out = addValue(table(), 0)
    expect(out.data.conditions[0].values).toEqual(['はい', 'いいえ', ''])
    expect(out.data.rows).toHaveLength(6)
    expect(out.data.rows[4].values).toEqual(['', 'はい'])
    expect(out.data.rows[4].results).toEqual([''])
    expect(out.lostCells).toBe(0)
  })

  it('値を消すとその値の行が消える', () => {
    const out = removeValue(table(), 0, 1)
    expect(out.data.conditions[0].values).toEqual(['はい'])
    expect(out.data.rows).toEqual([
      { values: ['はい', 'はい'], impossible: false, results: ['無料'] },
      { values: ['はい', 'いいえ'], impossible: false, results: ['無料'] },
    ])
    expect(out.lostCells).toBe(2)
  })

  it('最後の値は消せない（消すと行が全滅する）', () => {
    const data = removeValue(table(), 0, 1).data
    const out = removeValue(data, 0, 0)
    expect(out.data).toEqual(data)
    expect(out.lostCells).toBe(0)
  })

  it('値の名前を変えると全行のラベルが書き変わる', () => {
    const out = renameValue(table(), 0, 0, '会員')
    expect(out.data.conditions[0].values).toEqual(['会員', 'いいえ'])
    expect(out.data.rows.map((r) => r.values[0])).toEqual(['会員', '会員', 'いいえ', 'いいえ'])
    expect(out.data.rows.map((r) => r.results[0])).toEqual(['無料', '無料', '無料', '500円'])
    expect(out.lostCells).toBe(0)
  })
})

describe('結果の増減', () => {
  it('結果を足すと列が空で増える', () => {
    const data = table()
    const out = setOutcomes(data, [...data.outcomes, { id: 'out_Aaaaaaaaa2', name: '', choices: [] }])
    expect(out.data.rows.map((r) => r.results)).toEqual([
      ['無料', ''],
      ['無料', ''],
      ['無料', ''],
      ['500円', ''],
    ])
    expect(out.lostCells).toBe(0)
  })

  it('結果を消すとその列の記入済みが失われる', () => {
    const out = setOutcomes(table(), [])
    expect(out.data.rows.map((r) => r.results)).toEqual([[], [], [], []])
    expect(out.lostCells).toBe(4)
  })

  it('選択肢を足しても行は変わらない', () => {
    const data = table()
    const out = addChoice(data, 0)
    expect(out.data.outcomes[0].choices).toEqual(['無料', '500円', ''])
    expect(out.data.rows).toEqual(data.rows)
    expect(out.lostCells).toBe(0)
  })

  it('選択肢を消すと、その選択肢を選んでいた行が空欄に戻る', () => {
    const out = removeChoice(table(), 0, 0)
    expect(out.data.outcomes[0].choices).toEqual(['500円'])
    expect(out.data.rows.map((r) => r.results[0])).toEqual(['', '', '', '500円'])
    expect(out.lostCells).toBe(3)
  })

  it('選択肢の名前を変えると、その選択肢を選んでいた行も書き変わる', () => {
    const out = renameChoice(table(), 0, 0, '送料無料')
    expect(out.data.outcomes[0].choices).toEqual(['送料無料', '500円'])
    expect(out.data.rows.map((r) => r.results[0])).toEqual([
      '送料無料',
      '送料無料',
      '送料無料',
      '500円',
    ])
    expect(out.lostCells).toBe(0)
  })
})

describe('表本体', () => {
  it('結果を書き込んでも他の行は変わらない', () => {
    const data = table()
    const next = setResult(data, 3, 0, '無料')
    expect(next.rows[3].results).toEqual(['無料'])
    expect(next.rows[0]).toEqual(data.rows[0])
  })

  it('起こりえないは入り切りする', () => {
    const data = table()
    const on = toggleImpossible(data, 1)
    expect(on.rows[1].impossible).toBe(true)
    expect(toggleImpossible(on, 1).rows[1].impossible).toBe(false)
  })

  it('起こりえないにしても結果の値は消さない（戻せば元に戻る）', () => {
    const on = toggleImpossible(table(), 0)
    expect(on.rows[0].results).toEqual(['無料'])
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/modules/decision-table/commands.test.ts`
Expected: FAIL。`Error: Cannot find module './commands' imported from ...` が出て `Failed Suites 1` ／ `Tests  no tests` になる

- [ ] **Step 3: `commands.ts` を書く**

```ts
import { newId } from '@/core/new-id'
import type { Condition, DecisionTableSchemaVersion1, Outcome } from '@/types/decision-table'
import {
  axesById,
  identityAxes,
  outcomeFromById,
  rebuildRows,
  type Axis,
} from './rows'

/**
 * 定義部の編集の結果。**画面はこの3つ組しか受け取らない**ので、
 * 行を直積へ整え忘れた経路が生まれない。
 *
 * `lostCells` が0でないとき、画面は要素を減らす操作に限って確認を挟む
 */
export interface Applied {
  data: DecisionTableSchemaVersion1
  /** まとまった行で値が食い違い、空欄に落ちた結果セルの数 */
  clearedCells: number
  /** 記入済みだったのに新しい表に残らない結果セルの数 */
  lostCells: number
}

/**
 * 新しい条件。**値は はい／いいえ から始める。** 条件は真偽で分けるものが
 * 大半で、名前だけが人にしか決められない。名前は空のままにして欠落として見せる
 */
export function newCondition(): Condition {
  return { id: newId('cond'), name: '', values: ['はい', 'いいえ'] }
}

/**
 * 新しい結果。**選択肢は空から始める。** 結果が取りうる値に一般の既定は無く、
 * 決めるまで表本体のセルは埋められない
 */
export function newOutcome(): Outcome {
  return { id: newId('out'), name: '', choices: [] }
}

function apply(
  data: DecisionTableSchemaVersion1,
  conditions: Condition[],
  outcomes: Outcome[],
  axes: readonly Axis[],
  outcomeFrom: readonly (number | null)[],
): Applied {
  const built = rebuildRows(data.conditions, data.rows, conditions, axes, outcomeFrom)
  return {
    data: { ...data, conditions, outcomes, rows: built.rows },
    clearedCells: built.clearedCells,
    lostCells: built.lostCells,
  }
}

/**
 * 条件の追加・削除・並び替え。対応づけは `id` で行う。
 *
 * **値の増減をこの関数に渡さないこと。** 対応づけが値の位置を同じとみなすので、
 * 値が増減した配列を渡すと引き継ぎ先が1つずつずれる
 */
export function setConditions(
  data: DecisionTableSchemaVersion1,
  next: readonly Condition[],
): Applied {
  return apply(
    data,
    [...next],
    data.outcomes,
    axesById(data.conditions, next),
    data.outcomes.map((_, j) => j),
  )
}

/** 結果の追加・削除・並び替え。対応づけは `id` で行う */
export function setOutcomes(
  data: DecisionTableSchemaVersion1,
  next: readonly Outcome[],
): Applied {
  return apply(
    data,
    data.conditions,
    [...next],
    identityAxes(data.conditions),
    outcomeFromById(data.outcomes, next),
  )
}

/** 条件名。行は条件名を持たないので書き換えない */
export function renameCondition(
  data: DecisionTableSchemaVersion1,
  index: number,
  name: string,
): Applied {
  const conditions = data.conditions.map((c, i) => (i === index ? { ...c, name } : c))
  return { data: { ...data, conditions }, clearedCells: 0, lostCells: 0 }
}

/** 結果名。行は結果名を持たないので書き換えない */
export function renameOutcome(
  data: DecisionTableSchemaVersion1,
  index: number,
  name: string,
): Applied {
  const outcomes = data.outcomes.map((o, i) => (i === index ? { ...o, name } : o))
  return { data: { ...data, outcomes }, clearedCells: 0, lostCells: 0 }
}

export function addValue(data: DecisionTableSchemaVersion1, condIndex: number): Applied {
  const target = data.conditions[condIndex]
  const conditions = data.conditions.map((c, i) =>
    i === condIndex ? { ...c, values: [...c.values, ''] } : c,
  )
  const axes = identityAxes(data.conditions)
  axes[condIndex] = { from: condIndex, valueFrom: [...target.values.map((_, v) => v), null] }
  return apply(data, conditions, data.outcomes, axes, data.outcomes.map((_, j) => j))
}

/**
 * 値を1つ消す。**最後の1つは消せない。** 値が0本になると直積が空になり、
 * 条件ごと消したのと画面上で見分けが付かなくなる
 */
export function removeValue(
  data: DecisionTableSchemaVersion1,
  condIndex: number,
  valueIndex: number,
): Applied {
  const target = data.conditions[condIndex]
  if (target.values.length <= 1) return { data, clearedCells: 0, lostCells: 0 }
  const conditions = data.conditions.map((c, i) =>
    i === condIndex ? { ...c, values: c.values.filter((_, v) => v !== valueIndex) } : c,
  )
  const axes = identityAxes(data.conditions)
  axes[condIndex] = {
    from: condIndex,
    valueFrom: target.values.map((_, v) => v).filter((v) => v !== valueIndex),
  }
  return apply(data, conditions, data.outcomes, axes, data.outcomes.map((_, j) => j))
}

/**
 * 値のラベルを書き換える。行がラベルを直接持つので、再構築を通して全行を書き直す。
 * 位置で引き継ぐため、同じラベルが2件あっても引き継ぎ先は決まる
 */
export function renameValue(
  data: DecisionTableSchemaVersion1,
  condIndex: number,
  valueIndex: number,
  label: string,
): Applied {
  const conditions = data.conditions.map((c, i) =>
    i === condIndex ? { ...c, values: c.values.map((v, k) => (k === valueIndex ? label : v)) } : c,
  )
  return apply(
    data,
    conditions,
    data.outcomes,
    identityAxes(data.conditions),
    data.outcomes.map((_, j) => j),
  )
}

export function addChoice(data: DecisionTableSchemaVersion1, outIndex: number): Applied {
  const outcomes = data.outcomes.map((o, i) =>
    i === outIndex ? { ...o, choices: [...o.choices, ''] } : o,
  )
  return { data: { ...data, outcomes }, clearedCells: 0, lostCells: 0 }
}

/**
 * 選択肢を1つ消し、その選択肢を選んでいた結果セルを空へ戻す。
 *
 * **同じラベルの選択肢が2件あると、残る側を選んだ行も空に戻る。**
 * 結果セルはラベルで選択肢を指すので、重複したラベルからは行を選り分けられない
 */
export function removeChoice(
  data: DecisionTableSchemaVersion1,
  outIndex: number,
  choiceIndex: number,
): Applied {
  const removed = data.outcomes[outIndex].choices[choiceIndex]
  const outcomes = data.outcomes.map((o, i) =>
    i === outIndex ? { ...o, choices: o.choices.filter((_, k) => k !== choiceIndex) } : o,
  )
  let lostCells = 0
  const rows = data.rows.map((row) => {
    if (row.results[outIndex] !== removed) return row
    if (removed !== '') lostCells += 1
    return { ...row, results: row.results.map((v, j) => (j === outIndex ? '' : v)) }
  })
  return { data: { ...data, outcomes, rows }, clearedCells: 0, lostCells }
}

/**
 * 選択肢のラベルを書き換え、その選択肢を選んでいた結果セルも追従させる。
 *
 * **同じラベルの選択肢が2件あると、両方を選んだ行が同じ新しいラベルになる**
 *（`removeChoice` と同じ理由）
 */
export function renameChoice(
  data: DecisionTableSchemaVersion1,
  outIndex: number,
  choiceIndex: number,
  label: string,
): Applied {
  const old = data.outcomes[outIndex].choices[choiceIndex]
  const outcomes = data.outcomes.map((o, i) =>
    i === outIndex ? { ...o, choices: o.choices.map((c, k) => (k === choiceIndex ? label : c)) } : o,
  )
  const rows = data.rows.map((row) =>
    row.results[outIndex] === old
      ? { ...row, results: row.results.map((v, j) => (j === outIndex ? label : v)) }
      : row,
  )
  return { data: { ...data, outcomes, rows }, clearedCells: 0, lostCells: 0 }
}

/** 表本体の結果セル。行の集合は変わらない */
export function setResult(
  data: DecisionTableSchemaVersion1,
  rowIndex: number,
  outIndex: number,
  value: string,
): DecisionTableSchemaVersion1 {
  const rows = data.rows.map((row, i) =>
    i === rowIndex ? { ...row, results: row.results.map((v, j) => (j === outIndex ? value : v)) } : row,
  )
  return { ...data, rows }
}

/**
 * 起こりえないの入り切り。**結果の値は消さない**ので、戻せば元の値が見える
 *（シーケンスの考慮不要が答えの本文を消さないのと同じ扱い）
 */
export function toggleImpossible(
  data: DecisionTableSchemaVersion1,
  rowIndex: number,
): DecisionTableSchemaVersion1 {
  const rows = data.rows.map((row, i) =>
    i === rowIndex ? { ...row, impossible: !row.impossible } : row,
  )
  return { ...data, rows }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/decision-table/commands.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: 番人が実在することを壊して確かめる**

次の3つの変異を1つずつ入れ、赤くなるテストを確認してから戻す。

| 変異 | 赤くなるテスト |
| --- | --- |
| `removeValue` の `if (target.values.length <= 1) return ...` を消す | `最後の値は消せない（消すと行が全滅する）` |
| `addValue` の `valueFrom` の末尾を `null` から `0` にする | `値を足すと行が増え、新しい値の行だけ空から始まる` |
| `toggleImpossible` で `results` も空配列に落とす | `起こりえないにしても結果の値は消さない（戻せば元に戻る）` |

戻したあと `git status --short` が Step 1 と Step 3 の変更だけを示すこと。

- [ ] **Step 6: 全体が緑であることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/modules/decision-table/commands.ts src/modules/decision-table/commands.test.ts
git commit -m "$(cat <<'EOF'
feat(decision-table): 定義部の編集コマンドを足す

定義部の操作はすべて行の再構築を通す。画面がこの関数しか呼ばないので、
行を直積へ整え忘れる経路が生まれない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## Task 4: 欠落の判定と集計

**Files:**
- Create: `src/modules/decision-table/labels.ts`
- Create: `src/modules/decision-table/missing.ts`
- Test: `src/modules/decision-table/missing.test.ts`

**Interfaces:**
- Consumes: Task 1 の型、`@/core/missing-tally` の `MissingTally`
- Produces:
  - `labels.ts`: `export const IMPOSSIBLE_LABEL = '起こりえない'` ／ `export const CLEAR_RESULT_LABEL = '空にする'`
  - `missing.ts`: `export function isMissingResult(row: Row, outcomeIndex: number): boolean` ／ `export function isMissingLabel(text: string): boolean` ／ `export function tallyMissing(data: DecisionTableSchemaVersion1): MissingTally` ／ `export const RESULT_KIND = 'result'` ／ `export const LABEL_KIND = 'label'`

- [ ] **Step 1: 落ちるテストを書く**

`src/modules/decision-table/missing.test.ts` を新規作成する。

```ts
import { describe, expect, it } from 'vitest'
import { tallyLine } from '@/core/missing-tally'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { isMissingLabel, isMissingResult, tallyMissing } from './missing'

function table(): DecisionTableSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'decisionTable',
    title: '送料の決定',
    conditions: [{ id: 'cond_Aaaaaaaaa1', name: '会員か', values: ['はい', 'いいえ'] }],
    outcomes: [{ id: 'out_Aaaaaaaaa1', name: '送料', choices: ['無料', '500円'] }],
    rows: [
      { values: ['はい'], impossible: false, results: ['無料'] },
      { values: ['いいえ'], impossible: false, results: [''] },
    ],
  }
}

describe('結果セルの欠落', () => {
  it('空の結果セルは欠落', () => {
    expect(isMissingResult(table().rows[1], 0)).toBe(true)
  })

  it('埋まった結果セルは欠落ではない', () => {
    expect(isMissingResult(table().rows[0], 0)).toBe(false)
  })

  it('起こりえない行の空セルは欠落ではない（決めた上で該当なし）', () => {
    const row = { ...table().rows[1], impossible: true }
    expect(isMissingResult(row, 0)).toBe(false)
  })

  it('結果の本数より results が短くても空として扱う', () => {
    expect(isMissingResult({ values: [], impossible: false, results: [] }, 0)).toBe(true)
  })
})

describe('名前の欠落', () => {
  it('空の文字列は欠落', () => {
    expect(isMissingLabel('')).toBe(true)
    expect(isMissingLabel('会員か')).toBe(false)
  })
})

describe('集計', () => {
  it('埋まっていれば要対応0', () => {
    const data = table()
    data.rows[1].results = ['500円']
    expect(tallyMissing(data)).toEqual({ total: 0, parts: [] })
  })

  it('結果セルの空を未記入として数える', () => {
    expect(tallyMissing(table())).toEqual({
      total: 1,
      parts: [{ kind: 'result', label: '未記入', count: 1, variant: 'open' }],
    })
  })

  it('条件名・値・結果名・選択肢の空を名前なしとして数える', () => {
    const data = table()
    data.conditions[0].name = ''
    data.conditions[0].values = ['', 'いいえ']
    data.outcomes[0].name = ''
    data.outcomes[0].choices = ['無料', '']
    const tally = tallyMissing(data)
    expect(tally.parts.find((p) => p.kind === 'label')).toEqual({
      kind: 'label',
      label: '名前なし',
      count: 4,
      variant: 'open',
    })
  })

  it('起こりえない行は結果の数に入らない', () => {
    const data = table()
    data.rows[1].impossible = true
    expect(tallyMissing(data).total).toBe(0)
  })

  it('集計の1行はコアの組み立てと同じ形になる', () => {
    expect(tallyLine(tallyMissing(table()))).toBe('⚠ 要対応 1（未記入 1）')
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/modules/decision-table/missing.test.ts`
Expected: FAIL。`Error: Cannot find module './missing' imported from ...` が出て `Failed Suites 1` ／ `Tests  no tests` になる

- [ ] **Step 3: `labels.ts` と `missing.ts` を書く**

`src/modules/decision-table/labels.ts`

```ts
/**
 * 画面に出す語の定数。**`起こりえない` は画面と出力のどちらも同じ語を使う**
 *（シーケンスの `考慮不要` と同じ扱い。docs/missing-semantics.md 規約2）。
 * 出力は m3 で足すが、語の置き場をここに決めておくと2箇所に生えない
 */
export const IMPOSSIBLE_LABEL = '起こりえない'

/**
 * 結果セルのドロップダウンで、空へ戻す項目の文字。
 *
 * **これは操作の名前であって、セルの値の表示ではない。** 閉じたセルには
 * 空をそのまま描く（欠落の面が空であることを運ぶ）
 */
export const CLEAR_RESULT_LABEL = '空にする'
```

`src/modules/decision-table/missing.ts`

```ts
import type { MissingTally } from '@/core/missing-tally'
import type { DecisionTableSchemaVersion1, Row } from '@/types/decision-table'

/** 帯のチップの鍵。ジャンプ先の区画がこれで決まる */
export const RESULT_KIND = 'result'
export const LABEL_KIND = 'label'

/**
 * 結果セルの欠落判定（docs/missing-semantics.md 決定1）。
 *
 * **`impossible` の行は数えない。** 起こりえない組み合わせに結果を求めると、
 * 永遠に埋まらない欠落が残る
 */
export function isMissingResult(row: Row, outcomeIndex: number): boolean {
  if (row.impossible) return false
  return (row.results[outcomeIndex] ?? '') === ''
}

/** 条件名・値ラベル・結果名・選択肢ラベルの欠落判定 */
export function isMissingLabel(text: string): boolean {
  return text === ''
}

/**
 * 帯の集計。**判定関数と同じファイルに置く**ので、画面に面が付く箇所と
 * 数える箇所が同じ関数から出る（規約4）
 */
export function tallyMissing(data: DecisionTableSchemaVersion1): MissingTally {
  let result = 0
  for (const row of data.rows) {
    for (let j = 0; j < data.outcomes.length; j++) {
      if (isMissingResult(row, j)) result += 1
    }
  }
  let label = 0
  for (const c of data.conditions) {
    if (isMissingLabel(c.name)) label += 1
    for (const v of c.values) if (isMissingLabel(v)) label += 1
  }
  for (const o of data.outcomes) {
    if (isMissingLabel(o.name)) label += 1
    for (const c of o.choices) if (isMissingLabel(c)) label += 1
  }
  const parts = [
    { kind: RESULT_KIND, label: '未記入', count: result, variant: 'open' as const },
    { kind: LABEL_KIND, label: '名前なし', count: label, variant: 'open' as const },
  ].filter((p) => p.count > 0)
  return { total: result + label, parts }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/decision-table/missing.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: 番人が実在することを壊して確かめる**

次の2つの変異を1つずつ入れ、赤くなるテストを確認してから戻す。

| 変異 | 赤くなるテスト |
| --- | --- |
| `isMissingResult` の `if (row.impossible) return false` を消す | `起こりえない行の空セルは欠落ではない（決めた上で該当なし）` と `起こりえない行は結果の数に入らない` |
| `tallyMissing` の値ラベルを数えるループを消す | `条件名・値・結果名・選択肢の空を名前なしとして数える` |

戻したあと `git status --short` が Step 1 と Step 3 の変更だけを示すこと。

- [ ] **Step 6: 全体が緑であることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/modules/decision-table/labels.ts src/modules/decision-table/missing.ts src/modules/decision-table/missing.test.ts
git commit -m "$(cat <<'EOF'
feat(decision-table): 欠落の判定と集計を足す

起こりえない行の結果セルは数えない。起こりえない組み合わせに結果を求めると、
永遠に埋まらない欠落が残る。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## Task 5: 整合性検証

**Files:**
- Create: `src/modules/decision-table/consistency.ts`
- Test: `src/modules/decision-table/consistency.test.ts`

**Interfaces:**
- Consumes: Task 1 の型、`@/core/consistency` の `ConsistencyIssue`、`@/core/duplicate` の `findDuplicates`、`@/core/normalize` の `normalizeForMatch`、`@/core/row-ref` の `rowRef`、`@/core/list-editor/cell-face` の `buildErrorMarks` / `ErrorMarks`、Task 2 の `productSize` / `valueIndicesAt`
- Produces:
  - `export type Section = 'condition' | 'outcome' | 'row'`
  - `export function locationField(section: Section, field: string): string`
  - `export function sectionMarks(issues: readonly ConsistencyIssue[], section: Section): ErrorMarks`
  - `export function checkDecisionTableConsistency(data: DecisionTableSchemaVersion1): ConsistencyIssue[]`

`ConsistencyLocation.field` に `condition:` ／ `outcome:` ／ `row:` の接頭辞を付ける。**接頭辞が無いと3つの索引空間が1つの `ErrorMarks` に混ざり、条件の3行目の赤が表本体の3行目にも出る。**

- [ ] **Step 1: 落ちるテストを書く**

`src/modules/decision-table/consistency.test.ts` を新規作成する。

```ts
import { describe, expect, it } from 'vitest'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { checkDecisionTableConsistency, locationField, sectionMarks } from './consistency'

function table(): DecisionTableSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'decisionTable',
    title: '送料の決定',
    conditions: [
      { id: 'cond_Aaaaaaaaa1', name: '会員か', values: ['はい', 'いいえ'] },
      { id: 'cond_Aaaaaaaaa2', name: '5000円以上か', values: ['はい', 'いいえ'] },
    ],
    outcomes: [{ id: 'out_Aaaaaaaaa1', name: '送料', choices: ['無料', '500円'] }],
    rows: [
      { values: ['はい', 'はい'], impossible: false, results: ['無料'] },
      { values: ['はい', 'いいえ'], impossible: false, results: ['無料'] },
      { values: ['いいえ', 'はい'], impossible: false, results: ['無料'] },
      { values: ['いいえ', 'いいえ'], impossible: false, results: ['500円'] },
    ],
  }
}

const rules = (data: DecisionTableSchemaVersion1): string[] =>
  checkDecisionTableConsistency(data).map((i) => i.rule)

describe('正常なデータ', () => {
  it('指摘が出ない', () => {
    expect(checkDecisionTableConsistency(table())).toEqual([])
  })

  it('空の表でも指摘が出ない', () => {
    expect(
      checkDecisionTableConsistency({
        schemaVersion: 1,
        type: 'decisionTable',
        title: '新しい表',
        conditions: [],
        outcomes: [],
        rows: [],
      }),
    ).toEqual([])
  })
})

describe('ID 重複', () => {
  it('条件の ID が重なると指摘が出る', () => {
    const data = table()
    data.conditions[1].id = data.conditions[0].id
    expect(rules(data)).toContain('duplicate-id')
  })

  it('結果の ID が重なると指摘が出る', () => {
    const data = table()
    data.outcomes.push({ ...data.outcomes[0], name: '通知' })
    data.rows = data.rows.map((r) => ({ ...r, results: [...r.results, '無料'] }))
    expect(rules(data)).toContain('duplicate-id')
  })

  it('条件と結果でプレフィクスが違うので混ざらない', () => {
    expect(rules(table())).not.toContain('duplicate-id')
  })
})

describe('名前の重複', () => {
  it('条件名が重なると指摘が出る', () => {
    const data = table()
    data.conditions[1].name = '会員か'
    expect(rules(data)).toContain('duplicate-name')
  })

  it('全角と半角・大小は同じ名前として扱う', () => {
    const data = table()
    data.conditions[0].name = 'VIP'
    data.conditions[1].name = 'ｖｉｐ'
    expect(rules(data)).toContain('duplicate-name')
  })

  it('空の名前どうしは重複にしない（未記入が2つあるだけ）', () => {
    const data = table()
    data.conditions[0].name = ''
    data.conditions[1].name = ''
    expect(rules(data)).not.toContain('duplicate-name')
  })
})

describe('ラベルの重複', () => {
  it('1つの条件の中で値が重なると指摘が出る', () => {
    const data = table()
    data.conditions[0].values = ['はい', 'はい']
    data.rows = data.rows.map((r) => ({ ...r, values: ['はい', r.values[1]] }))
    expect(rules(data)).toContain('duplicate-value')
  })

  it('条件をまたいだ同じ値は重複にしない', () => {
    expect(rules(table())).not.toContain('duplicate-value')
  })

  it('1つの結果の中で選択肢が重なると指摘が出る', () => {
    const data = table()
    data.outcomes[0].choices = ['無料', '無料']
    expect(rules(data)).toContain('duplicate-choice')
  })

  it('空のラベルどうしは重複にしない', () => {
    const data = table()
    data.outcomes[0].choices = ['', '']
    data.rows = data.rows.map((r) => ({ ...r, results: [''] }))
    expect(rules(data)).not.toContain('duplicate-choice')
  })
})

describe('長さの不一致', () => {
  it('values が条件の本数と違うと指摘が出る', () => {
    const data = table()
    data.rows[0].values = ['はい']
    expect(rules(data)).toContain('row-length')
  })

  it('results が結果の本数と違うと指摘が出る', () => {
    const data = table()
    data.rows[0].results = []
    expect(rules(data)).toContain('row-length')
  })
})

describe('未知の値', () => {
  it('条件に無い値を持つ行に指摘が出る', () => {
    const data = table()
    data.rows[0].values = ['不明', 'はい']
    expect(rules(data)).toContain('unknown-value')
  })

  it('選択肢に無い結果を持つ行に指摘が出る', () => {
    const data = table()
    data.rows[0].results = ['300円']
    expect(rules(data)).toContain('unknown-value')
  })

  it('空文字は未知の値にしない（未記入である）', () => {
    const data = table()
    data.rows[0].results = ['']
    expect(rules(data)).not.toContain('unknown-value')
  })
})

describe('直積との不一致', () => {
  it('行が足りないと指摘が出る', () => {
    const data = table()
    data.rows = data.rows.slice(0, 3)
    expect(rules(data)).toContain('row-set')
  })

  it('行が余ると指摘が出る', () => {
    const data = table()
    data.rows = [...data.rows, data.rows[0]]
    expect(rules(data)).toContain('row-set')
  })

  it('順序が違うと指摘が出る', () => {
    const data = table()
    data.rows = [data.rows[1], data.rows[0], data.rows[2], data.rows[3]]
    expect(rules(data)).toContain('row-set')
  })

  it('直積どおりなら指摘が出ない', () => {
    expect(rules(table())).not.toContain('row-set')
  })
})

describe('指摘の引き直し', () => {
  it('区画ごとに分かれ、条件の赤が行へ漏れない', () => {
    const data = table()
    data.conditions[1].name = '会員か'
    const issues = checkDecisionTableConsistency(data)
    expect(sectionMarks(issues, 'condition').get(1)?.has('name')).toBe(true)
    expect(sectionMarks(issues, 'row').get(1)).toBeUndefined()
  })

  it('区画の接頭辞を付けた文字列を返す', () => {
    expect(locationField('row', 'result:2')).toBe('row:result:2')
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/modules/decision-table/consistency.test.ts`
Expected: FAIL。`Error: Cannot find module './consistency' imported from ...` が出て `Failed Suites 1` ／ `Tests  no tests` になる

- [ ] **Step 3: `consistency.ts` を書く**

```ts
import type { ConsistencyIssue } from '@/core/consistency'
import { findDuplicates } from '@/core/duplicate'
import { buildErrorMarks, type ErrorMarks } from '@/core/list-editor/cell-face'
import { normalizeForMatch } from '@/core/normalize'
import { rowRef } from '@/core/row-ref'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { productSize, valueIndicesAt } from './rows'

/**
 * 指摘が指す区画。条件・結果・行はそれぞれ別の索引空間を持つ。
 *
 * **接頭辞を落とすと、3つの索引空間が1つの `ErrorMarks` に混ざる**
 *——条件の3行目の赤が表本体の3行目にも出る
 */
export type Section = 'condition' | 'outcome' | 'row'

export function locationField(section: Section, field: string): string {
  return `${section}:${field}`
}

/** 指摘を区画で絞り、接頭辞を外して `cellFace` が読める形にする */
export function sectionMarks(
  issues: readonly ConsistencyIssue[],
  section: Section,
): ErrorMarks {
  const prefix = `${section}:`
  const narrowed = issues.map((issue) => ({
    ...issue,
    locations: issue.locations.flatMap((loc) =>
      loc.field !== null && loc.field.startsWith(prefix)
        ? [{ ...loc, field: loc.field.slice(prefix.length) }]
        : [],
    ),
  }))
  return buildErrorMarks(narrowed)
}

/** 空は未記入であって矛盾ではない。重複の判定から外す */
const named = (text: string): boolean => text !== ''

/**
 * デシジョンテーブルのモジュール内検証（規約4）。自ファイルで完結する検証のみ。
 *
 * **行は ID を持たない**ので `entityId` は空文字を渡す。位置は `entityIndex` が指し、
 * メッセージは `#N` で行を呼ぶ（rev 9章 D4）
 */
export function checkDecisionTableConsistency(
  data: DecisionTableSchemaVersion1,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const { conditions, outcomes, rows } = data

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）
  for (const [section, items] of [
    ['condition', conditions],
    ['outcome', outcomes],
  ] as const) {
    for (const [id, indices] of findDuplicates(items, (x) => x.id)) {
      issues.push({
        rule: 'duplicate-id',
        message: `ID が重複しています（${indices.length}件。${indices.map(rowRef).join(' ／ ')}）: ${id}`,
        locations: indices.map((i) => ({
          entityId: id,
          entityIndex: i,
          field: locationField(section, 'id'),
        })),
      })
    }
  }

  // 名前の重複（同名2件は宣言としての矛盾。rev 5章）
  for (const [section, items, what] of [
    ['condition', conditions, '条件名'],
    ['outcome', outcomes, '結果名'],
  ] as const) {
    const targets = items.filter((x) => named(x.name))
    for (const indices of findDuplicates(targets, (x) => normalizeForMatch(x.name)).values()) {
      const at = indices.map((i) => items.indexOf(targets[i]))
      issues.push({
        rule: 'duplicate-name',
        message: `${what}「${targets[indices[0]].name}」が${indices.length}件重複しています（${at.map(rowRef).join(' ／ ')}）`,
        locations: at.map((i) => ({
          entityId: items[i].id,
          entityIndex: i,
          field: locationField(section, 'name'),
        })),
      })
    }
  }

  // 値ラベル・選択肢ラベルの重複（1つの条件・結果の中だけを見る）
  conditions.forEach((c, index) => {
    const labels = c.values.filter(named)
    for (const group of findDuplicates(labels, (v) => normalizeForMatch(v)).values()) {
      issues.push({
        rule: 'duplicate-value',
        message: `${rowRef(index)}「${c.name}」の値「${labels[group[0]]}」が${group.length}件重複しています`,
        locations: [
          { entityId: c.id, entityIndex: index, field: locationField('condition', 'values') },
        ],
      })
    }
  })
  outcomes.forEach((o, index) => {
    const labels = o.choices.filter(named)
    for (const group of findDuplicates(labels, (v) => normalizeForMatch(v)).values()) {
      issues.push({
        rule: 'duplicate-choice',
        message: `${rowRef(index)}「${o.name}」の選択肢「${labels[group[0]]}」が${group.length}件重複しています`,
        locations: [
          { entityId: o.id, entityIndex: index, field: locationField('outcome', 'choices') },
        ],
      })
    }
  })

  // 長さの不一致と未知の値
  rows.forEach((row, index) => {
    if (row.values.length !== conditions.length || row.results.length !== outcomes.length) {
      issues.push({
        rule: 'row-length',
        message: `${rowRef(index)} の列数が条件・結果の本数と違います（値 ${row.values.length}／${conditions.length}、結果 ${row.results.length}／${outcomes.length}）`,
        locations: [{ entityId: '', entityIndex: index, field: locationField('row', 'id') }],
      })
    }
    row.values.forEach((value, i) => {
      const condition = conditions[i]
      if (condition === undefined || value === '' || condition.values.includes(value)) return
      issues.push({
        rule: 'unknown-value',
        message: `${rowRef(index)} の「${condition.name}」に、条件の値にない「${value}」が入っています`,
        locations: [{ entityId: '', entityIndex: index, field: locationField('row', 'id') }],
      })
    })
    row.results.forEach((value, j) => {
      const outcome = outcomes[j]
      if (outcome === undefined || value === '' || outcome.choices.includes(value)) return
      issues.push({
        rule: 'unknown-value',
        message: `${rowRef(index)} の「${outcome.name}」に、選択肢にない「${value}」が入っています`,
        locations: [
          { entityId: '', entityIndex: index, field: locationField('row', `result:${j}`) },
        ],
      })
    })
  })

  // 直積との不一致。**欠け・余り・順序違いをまとめて1件で出す**
  // ——行ごとに出すと、条件を1つ足しただけで全行が赤くなる
  const total = productSize(conditions)
  const matches =
    rows.length === total &&
    rows.every((row, position) => {
      const indices = valueIndicesAt(conditions, position)
      return conditions.every((c, i) => row.values[i] === c.values[indices[i]])
    })
  if (!matches) {
    issues.push({
      rule: 'row-set',
      message: `行の集合が条件の直積と一致しません（${rows.length}行／${total}行）。条件か値を編集すると整い直します`,
      locations: [],
    })
  }

  return issues
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/decision-table/consistency.test.ts`
Expected: PASS（全件）

- [ ] **Step 5: 番人が実在することを壊して確かめる**

次の3つの変異を1つずつ入れ、赤くなるテストを確認してから戻す。

| 変異 | 赤くなるテスト |
| --- | --- |
| `named` を `() => true` にする | `空の名前どうしは重複にしない（未記入が2つあるだけ）` と `空のラベルどうしは重複にしない` |
| `matches` の判定から `rows.length === total` を外す | `行が余ると指摘が出る` |
| `locationField` を `(_, field) => field` にする | `区画ごとに分かれ、条件の赤が行へ漏れない` と `区画の接頭辞を付けた文字列を返す` |

戻したあと `git status --short` が Step 1 と Step 3 の変更だけを示すこと。

- [ ] **Step 6: 全体が緑であることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add src/modules/decision-table/consistency.ts src/modules/decision-table/consistency.test.ts
git commit -m "$(cat <<'EOF'
feat(decision-table): 整合性検証を足す

指摘の field に区画の接頭辞を付ける。接頭辞が無いと、条件・結果・行の
3つの索引空間が1つの赤表示の表に混ざる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## Task 6: 定義部のエディタとモジュール登録

条件と結果を編集できる画面を作り、レジストリに登録する。**表本体は Task 7 で足す**ので、このタスクの完了時点では行が画面に出ない。行が直積へ整い直していることは DOM テストではなく `commands.test.ts` が押さえている。

**Files:**
- Create: `src/modules/decision-table/DefinitionList.tsx`
- Create: `src/modules/decision-table/DecisionTableEditor.tsx`
- Create: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`
- Create: `src/modules/decision-table/migrate.ts`
- Create: `src/modules/decision-table/module.ts`
- Create: `src/modules/decision-table/module.test.ts`
- Modify: `src/modules/index.ts`

**Interfaces:**
- Consumes: Task 3 の `commands.ts` 全体、Task 4 の `missing.ts`、Task 5 の `sectionMarks`、Task 2 の `MAX_ROWS` / `productSize`
- Produces:
  - `export function DefinitionList(props: DefinitionListProps)`
  - `export function DecisionTableEditor(props: EditorProps<DecisionTableSchemaVersion1>)`
  - `export const decisionTableModule: ToolModule<DecisionTableSchemaVersion1>`

- [ ] **Step 1: `DefinitionList.tsx` を書く**

条件と結果は「名前＋ラベルの配列」という同じ形なので、部品は1つにする。**呼び出し側が語（見出し・列名）と手続きを渡す。**

構造は次のとおり。

- 見出し（`heading`）＋ `<table className="w-full table-fixed border-collapse text-sm">`
- 列は No（56px 固定）／名前（176px 固定）／ラベル（幅なし。残りを埋める）／削除（40px 固定）
- 名前セルは `CellInput`（`multiline` を付けない。名前に改行が入ると表が割れる）
- ラベルセルは `flex flex-wrap gap-1` の中に、ラベル1つにつき `CellInput`（`w-32`）と ✕ ボタンを並べ、末尾に「＋」ボタンを置く
- 行末の ✕ は行そのものを消す
- セルの面は `CELL_FACE_CLASS[cellFace(marks, index, field, warn, rowAnchor)]`。No セルだけ `rowAnchor` を真にする
- 欠落の面は名前セルとラベルセルに付ける（`isMissingLabel`）

`props` は次の形にする。

```ts
export interface DefinitionRow {
  id: string
  name: string
  labels: string[]
}

export interface DefinitionListProps {
  heading: string
  nameLabel: string
  itemLabel: string
  rows: readonly DefinitionRow[]
  marks: ErrorMarks
  /** ラベルをこの本数より減らせない。条件は1、結果は0 */
  minLabels: number
  /** 追加を押せるか。行数の上限に達していれば偽 */
  canAddRow: boolean
  canAddLabel: (index: number) => boolean
  addRowLabel: string
  /** 行の鍵。`useListRows` の rowKeys をそのまま渡す。条件と結果で別々の配列なので衝突しない */
  rowKeys: readonly string[]
  onRenameRow: (index: number, name: string) => void
  onRenameLabel: (index: number, labelIndex: number, label: string) => void
  onAddRow: () => void
  onRemoveRow: (index: number) => void
  onAddLabel: (index: number) => void
  onRemoveLabel: (index: number, labelIndex: number) => void
  onCellKeyDown: (
    e: React.KeyboardEvent,
    at: { index: number; field: string },
    state: FieldState,
    deletableField: boolean,
  ) => void
  addButtonRef: React.RefObject<HTMLButtonElement | null>
}
```

セルの鍵は `cellId(rowKeys[index], field)` で作り、`field` は名前セルが `'name'`、ラベルセルが `` `label:${labelIndex}` `` とする。

アクセシブル名は `${nameLabel}（${index + 1}行目）` と `${itemLabel}（${index + 1}行目の${labelIndex + 1}つ目）` にする。削除ボタンは `${heading}を消す（${index + 1}行目）` と `${itemLabel}を消す（${index + 1}行目の${labelIndex + 1}つ目）`。

- [ ] **Step 2: `DecisionTableEditor.tsx` を書く（定義部まで）**

上から順に次を並べる。

1. 帯: `MissingTally`（`tallyMissing(data)`）と `KeyHints`
2. 行数の上限に達しているときの一文
3. 条件の `DefinitionList`
4. 結果の `DefinitionList`
5. `ConfirmDialog`

要点は次のとおり。

**行の鍵とフォーカス。** 条件と結果でそれぞれ `useListRows` を1つずつ持つ。`onItemsChange` が唯一の絞り込み点で、ここで `setConditions` / `setOutcomes` を呼ぶ。

```ts
const conditionRows = useListRows<Condition>({
  items: data.conditions,
  onItemsChange: (next) => applyDefinition(setConditions(data, next), null, next.length < data.conditions.length),
  makeItem: newCondition,
  firstField: 'name',
})
```

**確認ダイアログ。** 記入済みの結果が失われ、かつ要素を減らす操作のときだけ挟む。

```ts
const [pending, setPending] = useState<{ applied: Applied; mergeKey: string | null } | null>(null)

/**
 * 定義部の編集の唯一の出口。
 *
 * **確認を挟むのは要素を減らすときだけ。** 名前の打鍵ごとに再構築が走るので、
 * 直積になっていないファイルを整え直す分の損失で確認が出ると、文字を打つたびに
 * ダイアログが開く
 */
const applyDefinition = (applied: Applied, mergeKey: string | null, shrinking: boolean): void => {
  if (shrinking && applied.lostCells > 0) {
    setPending({ applied, mergeKey })
    return
  }
  onChange(applied.data, mergeKey)
}
```

ダイアログの文面は次のとおり。`clearedCells` が0なら2文目を出さない。

- title: `記入済みの結果が失われます`
- description: `記入済みの結果 ${lostCells} 件が失われます。` ＋（`clearedCells > 0` なら）`うち ${clearedCells} 件は、まとまった行で値が食い違うため空欄になります。` ＋ `Undo で戻せます。`
- confirmLabel: `続ける`

**キーの文脈。** 定義部は `family: 'list'`。`modalOpen` は額縁のものと `pending !== null` の論理和を渡す。

```ts
const anyModalOpen = modalOpen || pending !== null
```

`runCommand` の写像は次のとおり。**`focus-next-field` / `focus-prev-field` は消費しない**ので `false` を返し、ブラウザの Tab 順が生きる。列の本数が行ごとに違うので、写せる列の並びが無い。

| コマンド | 条件の一覧 | 結果の一覧 |
| --- | --- | --- |
| `insert-item-after` | 上限に達していなければ条件を足す | 上限に関わらず結果を足す |
| `delete-item` | 名前セルなら条件を消し、ラベルセルならラベルを消す | 同左 |
| `move-item-up` / `move-item-down` | 名前セルのときだけ行を動かす | 同左 |
| `focus-prev` / `focus-next` | 名前セルのときだけ上下の行の名前へ移る | 同左 |
| `cancel` | `document.activeElement` を `blur` する | 同左 |
| その他 | `false`（額縁が取る） | 同左 |

ラベルセルの `KeyContext` は `reorderEnabled: false` を渡す。**値の並び替えはこの段階で持たない**ので、`Alt+↑↓` を無意味に消費させない。

**行数の上限。** `productSize` で先に測る。

```ts
/**
 * 条件を1本足したあとの行数。**`newCondition()` を呼ばないこと**——
 * 描画のたびに ID を採番することになる。数えるのに要るのは値の本数だけである
 */
const PROBE_CONDITION = { id: '', name: '', values: ['はい', 'いいえ'] }
const canAddCondition = productSize([...data.conditions, PROBE_CONDITION]) <= MAX_ROWS
const canAddValue = (index: number): boolean =>
  productSize(
    data.conditions.map((c, i) => (i === index ? { ...c, values: [...c.values, ''] } : c)),
  ) <= MAX_ROWS
```

`canAddCondition` が偽のとき、帯の下に次の一文を出す。

```
行数の上限（1024行）に達しているので、条件と値をこれ以上足せません。
```

**`KeyHints`。** 定義部の分を出す。`$alt` は部品が解決する。

```ts
const DEFINITION_HINTS: KeyHint[] = [
  { keys: 'Enter', label: '下に追加' },
  { keys: '$alt+↑↓', label: '並び替え' },
  { keys: '空欄で Backspace', label: '削除' },
]
```

**欠落のジャンプ。** `MissingTally` の `onJump` は `LABEL_KIND` のときだけ動く（`RESULT_KIND` は Task 7 で足す）。`GlossaryEditor` の `jumpAt` と同じ巡回 ref を使い、空の名前セル・ラベルセルを順に巡る。

- [ ] **Step 3: `migrate.ts` と `module.ts` を書く**

`src/modules/decision-table/migrate.ts`

```ts
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'

/**
 * 規約6: マイグレータ。schemaVersion 1 が初版のため旧版が存在せず、
 * 恒等変換の枠だけを置く。schemaVersion 2 が生まれた時点で最初の変換を実装する。
 */
export function migrateDecisionTable(
  data: unknown,
  _fromVersion: number,
): DecisionTableSchemaVersion1 {
  return data as DecisionTableSchemaVersion1
}
```

`src/modules/decision-table/module.ts`

```ts
import { Table } from 'lucide-react'
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import decisionTableSchema from '../../../schemas/decision-table.schema.json'
import { checkDecisionTableConsistency } from './consistency'
import { DecisionTableEditor } from './DecisionTableEditor'
import { migrateDecisionTable } from './migrate'

export const decisionTableModule: ToolModule<DecisionTableSchemaVersion1> = {
  type: 'decisionTable',
  displayName: 'デシジョンテーブル',
  icon: Table,
  schemaVersion: 1,
  schema: decisionTableSchema as JsonSchema,
  idPrefixes: ['cond', 'out'],
  Editor: DecisionTableEditor,
  checkConsistency: checkDecisionTableConsistency,
  // 規約5: 出力は持たない。額縁は outputs[0] が無いと書き出し・コピーの
  // 両ボタンを押せなくする（rev 6章が認めている「0本」の状態）
  outputs: [],
  // 論点ごとに表を分けるのが普通の使い方なので、1プロジェクトに何本でも置ける
  singleton: false,
  migrate: migrateDecisionTable,
  // 条件も結果も無い空の表から始める。行は条件の直積なので、条件が無ければ0本
  createEmpty: (title) => ({
    schemaVersion: 1,
    type: 'decisionTable',
    title,
    conditions: [],
    outcomes: [],
    rows: [],
  }),
}
```

- [ ] **Step 4: レジストリに登録する**

`src/modules/index.ts` に2行足す。**登録順が一覧の見出しの順になる**ので、末尾に置く。

```ts
import { decisionTableModule } from './decision-table/module'
```

```ts
appRegistry.register(decisionTableModule)
```

- [ ] **Step 5: `module.test.ts` を書く**

```ts
import { describe, expect, it } from 'vitest'
import { createSchemaValidator } from '@/core/schema-validation'
import { appRegistry } from '@/modules'
import { decisionTableModule } from './module'

const validate = createSchemaValidator(decisionTableModule.schema)

describe('decisionTableModule', () => {
  it('createEmpty はスキーマ検証を通る（雛形が壊れていたら新規作成が全滅する）', () => {
    const empty = decisionTableModule.createEmpty('新しい表')
    expect(validate(empty).ok).toBe(true)
    expect(decisionTableModule.checkConsistency(empty)).toEqual([])
  })

  it('createEmpty は条件も結果も持たない', () => {
    const empty = decisionTableModule.createEmpty('新しい表')
    expect(empty.conditions).toEqual([])
    expect(empty.outcomes).toEqual([])
    expect(empty.rows).toEqual([])
  })

  it('出力を持たない（額縁が書き出しボタンを押せなくする）', () => {
    expect(decisionTableModule.outputs).toEqual([])
  })

  it('表形式コピーもクリップボード交換も宣言しない', () => {
    expect(decisionTableModule.tableExport).toBeUndefined()
    expect(decisionTableModule.clipboardExchanges).toBeUndefined()
  })

  it('単一性を宣言しない（論点ごとに表を分ける）', () => {
    expect(decisionTableModule.singleton).toBe(false)
  })

  it('migrate は現行版に対して恒等', () => {
    const empty = decisionTableModule.createEmpty('t')
    expect(decisionTableModule.migrate(empty, 1)).toEqual(empty)
  })

  it('レジストリに登録されている', () => {
    expect(appRegistry.get('decisionTable')?.displayName).toBe('デシジョンテーブル')
  })

  it('ID プレフィクスが他のモジュールと衝突しない', () => {
    // createRegistry は重複を register の時点で投げる。ここでは引けることを見る
    expect(decisionTableModule.idPrefixes).toEqual(['cond', 'out'])
  })
})
```

- [ ] **Step 6: DOM テストを書く**

`src/modules/decision-table/DecisionTableEditor.dom.test.tsx` を新規作成する。**コードは計画に書かない**——`@testing-library/react` の操作を計画に貼ると、部品の内部事情まで固定してしまう。既存の `GlossaryEditor.dom.test.tsx` の書き方に合わせ、role とアクセシブル名で引く。

見る性質は次のとおり。

1. 空の表で「条件を追加」を押すと条件が1本増え、`onChange` が渡すデータの `conditions` が1件になる
2. 条件が1本ある表で「値を追加」を押すと、その条件の `values` が1つ増える
3. 条件名を打つと `onChange` が呼ばれ、`rows` は変わらない
4. 値の名前を打つと、`onChange` が渡す `rows` の該当列のラベルが全行で書き変わる
5. 記入済みの結果がある表で条件を1本消すと、`onChange` は即座に呼ばれず確認ダイアログが出る
6. 確認ダイアログの「続ける」を押すと `onChange` が呼ばれ、「キャンセル」を押すと呼ばれない
7. 記入済みの結果が無い表で条件を消すと、確認ダイアログは出ず `onChange` が呼ばれる
8. 値が1つしかない条件の「値を消す」ボタンは押せない
9. 条件名セルで `Enter` を押すと条件が1本増える
10. 空の条件名セルで `Backspace` を押すと条件が消える
11. 帯に「要対応」と内訳が出て、件数が `tallyMissing` と一致する

- [ ] **Step 7: 全体が緑になることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

続けて、モジュールが6本になっていることを確かめる。

Run: `grep -c "appRegistry.register" src/modules/index.ts`
Expected: `6`

- [ ] **Step 8: 番人が実在することを壊して確かめる**

次の2つの変異を1つずつ入れ、赤くなるテストを確認してから戻す。

| 変異 | 赤くなるテスト |
| --- | --- |
| `applyDefinition` の `if (shrinking && applied.lostCells > 0)` を `if (false)` にする | `記入済みの結果がある表で条件を1本消すと確認ダイアログが出る` |
| `module.ts` の `outputs: []` を `outputs: [{ id: 'default', label: 'Markdown', fileSuffix: '', toMarkdown: () => '' }]` にする | `出力を持たない（額縁が書き出しボタンを押せなくする）` |

戻したあと `git status --short` が Step 1〜6 の変更だけを示すこと。

- [ ] **Step 9: コミット**

```bash
git add src/modules/decision-table src/modules/index.ts
git commit -m "$(cat <<'EOF'
feat(decision-table): 定義部を作りモジュールを登録する

定義部の編集はすべて一つの出口を通る。要素を減らす操作が記入済みの結果を
失わせるときだけ確認を挟み、名前の打鍵では挟まない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## Task 7: 表本体

`family: 'grid'` の表を足し、結果セルと起こりえないを操作できるようにする。

**Files:**
- Create: `src/modules/decision-table/GridBody.tsx`
- Modify: `src/modules/decision-table/DecisionTableEditor.tsx`
- Modify: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`
- Modify: `src/components/CellSelect.tsx`
- Modify: `src/components/CellSelect.dom.test.tsx`

**Interfaces:**
- Consumes: Task 6 の `DecisionTableEditor`、Task 3 の `setResult` / `toggleImpossible`、Task 4 の `isMissingResult` / `RESULT_KIND`、Task 5 の `sectionMarks`、`labels.ts` の `IMPOSSIBLE_LABEL` / `CLEAR_RESULT_LABEL`
- Produces: `export function GridBody(props: GridBodyProps)` と、`CellSelect` の任意 prop `itemLabelOf?: (value: string) => string`

- [ ] **Step 1: `CellSelect` に項目の文字を分ける口を足す**

`src/components/CellSelect.tsx` に任意の prop を1つ足す。**既定は `labelOf`** なので、既存の2つの呼び出し側は1文字も変わらない。

```ts
  /**
   * 開いたメニューの項目の文字。既定は `labelOf`。
   *
   * **閉じたセルの文字と分けるための口である。** 空を選べるセルでは
   * 項目に `空にする` のような操作の名前を出す一方、閉じたセルには空を
   * そのまま描く必要がある（データに無い語をセルに書かない）
   */
  itemLabelOf?: (value: string) => string
```

`DropdownMenuRadioItem` の中を `{(props.itemLabelOf ?? props.labelOf)(option)}` にする。トリガーの `{props.labelOf(props.value)}` は変えない。

`src/components/CellSelect.dom.test.tsx` に1件足す。見る性質は「`itemLabelOf` を渡すと、開いた項目の文字だけが変わり、閉じたセルの文字は `labelOf` のまま」。

- [ ] **Step 2: `GridBody.tsx` を書く**

構造は次のとおり。

- `<table className="w-full table-fixed border-collapse text-sm">`
- `<colgroup>` は No だけ `style={{ width: 56 }}` を持ち、条件列と結果列は `<col />` のまま。**`table-fixed` は幅を持たない列に残りを等分する**ので、列の本数がデータで変わってもテーブルが親幅に収まる
- ヘッダは No ／ 条件名（空なら空のまま）／ 結果名。条件列と結果列は見た目で分ける必要があるので、結果列のヘッダに `border-l border-l-rule` を引く
- 行は `data.rows` をそのまま描く。**直積から描き直さない**ので、直積と一致しないファイルでも中身が見える
- No セルは `rowAnchor` を真にして `cellFace` を呼ぶ
- 条件セルは読み取り専用の `<td>`。`text-ink-muted` で描き、フォーカスを持たせない
- 結果セルは、`impossible` が偽なら `CellSelect`、真なら `<button>` にする

**結果セルの本数を行ごとに変えないこと。** `impossible` の行で列をまとめると、`Tab` の送り先が行によって消える。

行のループでは、行データを `row`、表示上の行番号を `rowNo`（＝`index + 1`）、行の鍵を `rowKey` とする。

```tsx
// impossible の行のセル。押すと起こりえないを解除する
<button
  type="button"
  data-cell={cellId(rowKey, `result:${j}`)}
  aria-label={`${outcome.name}（${rowNo}行目）: ${IMPOSSIBLE_LABEL}`}
  className={`${cellInput} text-left text-ink-muted`}
  onClick={() => onToggleImpossible(index)}
  onKeyDown={(e) => onCellKeyDown(e, { index, field: `result:${j}` })}
>
  {IMPOSSIBLE_LABEL}
</button>
```

`CellSelect` に渡す値は次のとおり。

```tsx
<CellSelect
  className={`${cellInput} appearance-none pr-6`}
  aria-label={`${outcome.name}（${rowNo}行目）`}
  data-cell={cellId(rowKey, `result:${j}`)}
  value={row.results[j] ?? ''}
  options={['', ...outcome.choices]}
  labelOf={(v) => v}
  itemLabelOf={(v) => (v === '' ? CLEAR_RESULT_LABEL : v)}
  onPick={(v) => onPickResult(index, j, v)}
  onKeyDown={(e) => onCellKeyDown(e, { index, field: `result:${j}` })}
/>
```

セルの面は欠落（`isMissingResult`）と無効（`sectionMarks(issues, 'row')`）の両方を見る。

- [ ] **Step 3: エディタに表本体を配線する**

`DecisionTableEditor.tsx` に次を足す。

**キーの文脈。** 表本体は `family: 'grid'`、`reorderEnabled: false`（行は導出物なので並び替えない）、`deletableField: false`（空欄 `Backspace` で行を消させない）。

```ts
/**
 * 表本体のセルの文脈。
 *
 * **`arrowsOwnedByField` を真にしないこと。** `CellSelect` は素の ↑↓ を
 * 自分で消費して `onKeyDown` を呼ばないので、ここで真にすると届いた ←→ まで
 * 止まり、列移動が消える
 */
const gridContext = { editing: false, fieldEmpty: false, deletableField: false, caretAtStart: true, caretAtEnd: true, arrowsOwnedByField: false }
```

**コマンドの写像。**

| コマンド | 写像 |
| --- | --- |
| `focus-prev` / `focus-next` | 上下の行の同じ結果列へ移る |
| `focus-prev-field` / `focus-next-field` | 隣の結果列へ移る。行端では `stepField` の `rowDelta` に従って上下の行へ折り返す |
| `toggle-item-state` | その行の `impossible` を入り切りする |
| `cancel` | `document.activeElement` を `blur` する |
| その他 | `false` |

列の並びは `data.outcomes.map((_, j) => \`result:${j}\`)` を `stepField`（`@/core/list-editor/field-step`）に渡して作る。

**行の鍵。** 行は ID を持たないので `computeRowKeys` を使えない。位置をそのまま鍵にする。

```ts
/** 行の鍵。行は導出物で ID を持たないので、位置がそのまま鍵になる */
const gridRowKey = (index: number): string => `row-${index}`
```

**フォーカス。** 表本体は行の増減をキーで起こさないので、`useListRows` の予約は要らない。`containerRef.current?.querySelector('[data-cell="..."]')` を直接引く関数を1つ持つ。

**`KeyHints`。**

```ts
const GRID_HINTS: KeyHint[] = [
  { keys: 'Enter', label: '下の行へ' },
  { keys: 'Tab', label: '次の列へ' },
  { keys: '←→', label: '隣の列へ' },
  { keys: '$mod+Enter', label: IMPOSSIBLE_LABEL },
]
```

**欠落のジャンプ。** `RESULT_KIND` のチップは、空の結果セルを順に巡る。

**条件が0本のとき**は表本体を描かず、次の一文を出す。

```
条件を1つ以上足すと、値の組み合わせの行が出ます。
```

- [ ] **Step 4: DOM テストを足す**

`DecisionTableEditor.dom.test.tsx` に足す。見る性質は次のとおり。

1. 条件2本・結果1本の表で、行が4本（`#1`〜`#4`）描かれる
2. 条件セルが読み取り専用で、入力欄になっていない
3. 結果セルを選ぶと `onChange` が渡す `rows[i].results[j]` が変わる
4. 結果セルを開くと、選択肢に加えて「空にする」が並ぶ
5. 結果セルで主修飾キー＋`Enter` を押すと `impossible` が真になり、セルの文字が「起こりえない」になる
6. 起こりえない行のセルを押すと `impossible` が偽に戻る
7. 起こりえない行の結果セルの本数が、普通の行と同じである
8. 結果セルで `Enter` を押すと下の行の同じ列へフォーカスが移り、行は増えない
9. 結果セルで `→` を押すと隣の結果列へフォーカスが移る
10. 空の結果セルに欠落の面が付き、起こりえない行のセルには付かない
11. 条件が0本のとき、表本体の代わりに案内の一文が出る

**`Enter` で行が増えないこと**は、この画面の要である。`resolveCommand` の `'grid'` 分岐が効いていることを、ここで画面ごしに固定する。

- [ ] **Step 5: 全体が緑になることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 6: 番人が実在することを壊して確かめる**

次の3つの変異を1つずつ入れ、赤くなるテストを確認してから戻す。

| 変異 | 赤くなるテスト |
| --- | --- |
| エディタの `family: 'grid'` を `'list'` にする | `結果セルで Enter を押すと下の行の同じ列へフォーカスが移り、行は増えない` |
| `gridContext` の `arrowsOwnedByField` を `true` にする | `結果セルで → を押すと隣の結果列へフォーカスが移る` |
| `GridBody` の `impossible` の分岐で `colSpan={outcomes.length}` の1セルにまとめる | `起こりえない行の結果セルの本数が、普通の行と同じである` |

戻したあと `git status --short` が Step 1〜4 の変更だけを示すこと。

- [ ] **Step 7: コミット**

```bash
git add src/modules/decision-table src/components/CellSelect.tsx src/components/CellSelect.dom.test.tsx
git commit -m "$(cat <<'EOF'
feat(decision-table): 表本体を足す

起こりえない行でも結果セルの本数を変えない。行ごとにセルの数が変わると、
Tab の送り先が行によって消える。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## Task 8: 文書の更新

**Files:**
- Create: `docs/decision-table/decision-table-design-notes.md`
- Modify: `docs/README.md`
- Modify: `docs/overview-rev.md`（2章と5章）
- Modify: `docs/missing-semantics.md`
- Modify: `docs/open-issues.md`
- Modify: `plugins/facet/skills/read-project/SKILL.md`

**Interfaces:**
- Consumes: Task 1〜7 の実装
- Produces: なし

`docs/missing-semantics.md` と `plugins/facet/skills/read-project/SKILL.md` は**同じコミットで直す**。判定源が一対一なので、片方だけ進むと画面と AI の読みがずれる。

- [ ] **Step 1: `docs/decision-table/decision-table-design-notes.md` を書く**

節は次の6つにする。**現在形で書き、マイルストーン番号・日付・経緯を書かない。**

| 節 | 述べること |
| --- | --- |
| データモデル | 行がラベルを直接持つ理由（行が単体で読める）。ID を持つのは `conditions` と `outcomes` だけで、行は位置で指す |
| 行の導出 | 直積であること。並び順は左端の条件が最もゆっくり回ること。定義部を触るたびに整い直すこと。引き継ぎは位置で行い、ラベルでは行わないこと |
| 欠落 | 結果セルの空が欠落で、`impossible` の行は数えないこと。条件名・値・結果名・選択肢の空も欠落であること |
| 整合性検証 | 6つのルール（ID 重複・名前の重複・値ラベル重複・選択肢ラベル重複・長さ不一致・未知の値・直積との不一致）。重複をスキーマの `uniqueItems` で拒否しない理由 |
| キーボード | 定義部が `'list'`、表本体が `'grid'`。`Command` の語彙を増やさないこと。`impossible` を `toggle-item-state` に写すこと |
| 大きさの上限 | 行数の上限が1024であること。上限に達すると定義部の追加を押せなくなること |

- [ ] **Step 2: `docs/README.md` を直す**

冒頭の一文のツールの列挙に「デシジョンテーブル」を足し、「5ツール」を「6ツール」にする。

「どれを読むか」の表に1行足す。置く場所は課題ツリーの行の次。

```markdown
| デシジョンテーブルの設計 | [`decision-table/decision-table-design-notes.md`](decision-table/decision-table-design-notes.md) |
```

- [ ] **Step 3: `docs/overview-rev.md` を直す**

2章のツール一覧の末尾（課題ツリーの次）に7番として1行足す。

```markdown
7. **デシジョンテーブルエディタ** — 条件の組み合わせで結果が決まる仕様を、全組み合わせを展開した表で扱う。行は条件の値の直積であり、人は行を足しも消しもしない。（エディタと整合性検証まで実装済み。出力・まとめて入力・畳み・登録 Skill は未実装。詳細は [`decision-table/decision-table-design-notes.md`](decision-table/decision-table-design-notes.md)）
```

5章の共通エンベロープの `type` の列挙に `decisionTable` を足す。

- [ ] **Step 4: `docs/missing-semantics.md` を直す**

決定1の表の末尾に1行足す。

```markdown
| デシジョンテーブル | 結果セルが空（未記入）／条件名・値ラベル・結果名・選択肢ラベルが空（未記入） | `impossible: true` の行の結果セル（決めた上で該当なし） |
```

規約1の「判定を持つファイル」の列挙と、規約4の「各モジュールの判定・集計」の列挙に `src/modules/decision-table/missing.ts` を足す。

- [ ] **Step 5: `plugins/facet/skills/read-project/SKILL.md` を直す**

5箇所を直す。

1. frontmatter の `description` の型の列挙に `decisionTable` を足す
2. 「ファイルの見つけ方」の「種類は現在5つ」を6つにし、`decisionTable`（デシジョンテーブル）を足す。何ファイルあってもよい側に入れる
3. 「ID の読み方」のプレフィクスの列挙に `cond_`＝デシジョンテーブルの条件／`out_`＝デシジョンテーブルの結果を足す
4. 「ツール別の読み方」に節を1つ足す

```markdown
### デシジョンテーブル（type: decisionTable）

- **行は `conditions` の値の直積で、人が足したり消したりするものではない。** 行を足す・消す提案をせず、条件か値を増減する形で書く
- 行の並び順は `conditions` の配列順にネストしたループで、左端の条件が最もゆっくり回る。行は ID を持たないので、`#1` から数えた位置で指す
- `rows[].values` は `conditions` と同じ長さ・同じ順で、各要素は `conditions[i].values` のラベルそのものである。`rows[].results` と `outcomes` も同じ関係にある
- `results` の空文字は「未記入」（未決）。ただし `impossible: true` の行の空は未決ではない——**その組み合わせは現実に起こりえないと決めた**という意思表示である
- 条件名・値ラベル・結果名・選択肢ラベルの空文字も「未記入」（未決）
```

5. 「書き込みたくなったら」に、`decisionTable` には対応する Skill がまだ無いことを足す。既にある「対応する Skill が無い種類のファイル」の指示がそのまま効くので、種類の名前を1つ挙げるだけにする

- [ ] **Step 6: `docs/open-issues.md` を直す**

見つけた項目を足す。**解消した項目は無い。**

「挙動の穴」に次を足す。

```markdown
- **`impossible` の入り切りにマウスの入口が無い**（`src/modules/decision-table/GridBody.tsx`）。起こりえない行を戻すのはセルのクリックでできるが、立てるのは主修飾キー＋`Enter` だけ。シーケンスの「考慮不要」と同じ穴で、同時に塞ぐべきもの。
- **デシジョンテーブルの定義部の欄の移動がブラウザの `Tab` 順に依存する**（`src/modules/decision-table/DecisionTableEditor.tsx`）。ラベルの本数が行ごとに違うので、`focus-next-field` に写せる列の並びが無い。
```

「デザイン」に次を足す。

```markdown
- **デシジョンテーブルの列幅を変えられない**（`src/modules/decision-table/GridBody.tsx`）。列の本数がデータで変わるので、`useColumnResize` が要求する幅の配列を持てない。
```

- [ ] **Step 7: 文書が実装と食い違っていないことを確認する**

決定を1つずつ挙げ、それを述べている文を指す形で確かめる。**「矛盾していない」を「書いてある」と読み替えないこと。**

| 確かめる決定 | 指すべき文 |
| --- | --- |
| `impossible` の行の結果セルは欠落ではない | `missing-semantics.md` 決定1の表の右欄と、`read-project/SKILL.md` の該当行 |
| 行は ID を持たず位置で指す | 設計ノートの「データモデル」と `read-project/SKILL.md` の該当行 |
| 引き継ぎはラベルでなく位置で行う | 設計ノートの「行の導出」 |
| 出力を持たない | rev 2章の7番 |

Run: `grep -rn "decisionTable" docs plugins/facet/skills/read-project/SKILL.md`
Expected: `docs/README.md` ／ `docs/overview-rev.md` ／ `docs/decision-table/decision-table-design-notes.md` ／ `docs/missing-semantics.md` ／ `docs/open-issues.md` ／ `docs/superpowers/specs/2026-09-10-decision-table-design.md` ／ この計画ファイル ／ `SKILL.md` にだけ出る

- [ ] **Step 8: 全体が緑であることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

`SKILL.md` の `name:` は変えないので `src/core/skills.test.ts` は緑のまま通る。登録 Skill は5本のままなので `scripts/gen-skills.test.mjs` も変わらない。

- [ ] **Step 9: コミット**

```bash
git add docs plugins/facet/skills/read-project/SKILL.md
git commit -m "$(cat <<'EOF'
docs(decision-table): 6本目のツールを文書に足す

欠落の規約と read-project Skill を同じコミットで直す。判定源が一対一なので、
片方だけ進むと画面と AI の読みがずれる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## この計画が触らないもの

- **ルートの `README.md`。** 利用者向けの紹介で、`sample-project/` のお手本と screenshot を前提にしている。デシジョンテーブルのお手本は登録 Skill（m4）が書けるようになってから足す
- **`sample-project/`。** 同じ理由で足さない。実機確認で編集したら `git checkout -- sample-project/ && git clean -fdx sample-project/` で戻す
- **表記ゆれ検知の対象フィールド宣言。** 宣言の規約が `ToolModule` に無く、他ツールも持たない（spec のスコープ外）
- **まとめて入力・畳み・Markdown 出力・表形式コピー・登録 Skill。** それぞれ m2・m3・m4 が担当する

## 人間への依頼

実機確認はサブエージェントには行えない。PR の本文にチェックリストを置き、マージ前に確かめてもらう。

## 分岐

PR の base は `decision-table`。`main` ではない。
