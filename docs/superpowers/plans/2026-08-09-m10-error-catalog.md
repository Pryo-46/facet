# M10 実装計画: エラーカタログエディタ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 5つ目のツールモジュール「エラーカタログ」を、M9 でコアへ引き上げた機械（`use-list-rows` / `cell-face` / `columns` / `field-step` / `duplicate`）と出力プロファイル（`outputs`）の上に実装し、サポート向け／開発向けの2プロファイルで画面と Markdown を出し分ける。

**Architecture:** データ形式は `schemas/error-catalog.schema.json`（`type: errorCatalog`、単一性あり、ID は `error_` ＋10文字）。モジュールが持つのは**フィールド宣言・列データ・プロファイル宣言**だけで、行操作・フォーカス予約・重複検出・セルの面の判定はコアの機械をそのまま呼ぶ。プロファイルは「フィールドの並び1本」だけを宣言し、**画面の列**（`No` ＋ `fields`）と**出力の列**（`No` ＋ `fields` から `resolutionLevel` を除いたもの）をそこから導出する。用語集のコードは**レジストリ登録の1行以外いっさい触らない**。

**Tech Stack:** TypeScript / React 19 / Tailwind v4（役割トークン）/ Vitest ＋ Testing Library（jsdom）/ Ajv（スキーマ検証）/ json-schema-to-typescript（`npm run gen:types`）

**設計の出どころ:** [`2026-08-09-m9-m10-error-catalog-design.md`](2026-08-09-m9-m10-error-catalog-design.md) 第 II 部（決定8〜18）。**本計画は決定8〜18を実装手順へ展開したものであり、決定そのものを蒸し返さない。**

---

## Global Constraints

以下は**全タスクの要件に暗黙に含まれる**。

- **用語集には触らない。** 変更してよいのは `src/modules/index.ts` の登録1行と、**Task 6 の `src/modules/glossary/markdown.ts`（コアの整形関数への委譲に載せ替える）だけ**。`src/modules/glossary/**` の**テストは1バイトも変えない**（無変更のまま緑であることが、引き上げが振る舞いを保っている証拠になる。M9 と同じやり方）。それ以外の用語集のコードを変えたくなったら「計画の矛盾」として報告する
- **額縁は無改修（決定18）。** `src/App.tsx` / `src/components/FileList.tsx` / `src/components/ExportMenu.tsx` を変更しない。新規作成メニューは `appRegistry.list()` 由来なので登録すれば出る／単一性違反は `module.singleton` を見るだけ／出力ドロップダウンは `outputs.length > 1` で自動的にメニューになる。**`App.tsx` の空状態にある「用語集を作る」ボタンにエラーカタログ版を足さない**——`ensureFileOfType` とインライン登録の競合（`open-issues.md` 記載）に呼び出し口を増やすと近づくため
- **`src/components/CellInput.tsx` の変更は Task 10 だけ**（`MAX_ROWS` 5 → 8）。それ以外のタスクで共通コンポーネントを触らない
- **検証コマンドは対象を絞らない。** 各タスクの最後は `npm test`（全件）。タスク完了時は `npm test && npx tsc -b && npm run lint`
- **色値の直書き禁止／Tailwind 標準パレット禁止／フォントサイズは `text-xs` `text-sm` `text-base` `text-lg` の4段のみ。** `src/styles/conventions.test.ts` が機械検査する。色は役割トークン（`text-ink` / `bg-warning` / `border-rule` / `bg-surface` / `bg-surface-accent` / `text-ink-muted` / `focus:ring-ring`）を使う
- **DOM テストは role とアクセシブル名で引き、クラス名・レイアウト・スタイルの解決結果を見ない。** セルの面（warning / error）の検証は純関数のテスト（`warnings.test.ts` / コアの `cell-face.test.ts`）が持つ
- **アクセシブル名の衝突に注意する（M8 の教訓）。** セルは `エラー名（No.1）`、列幅ハンドルは `エラー名の列幅を変更` で、どちらも「エラー名」で始まる。**テストの前方一致は必ず `（` まで含める**（`/^エラー名（/`）か、`getByRole('textbox' | 'separator', { name })` で引く
- **テストの件数を「期待値」として書かない。** 計画が期待するのは「このファイルの `it` がすべて緑」であって件数ではない（`docs/lessons-for-planning.md`: M4・M5 で2回とも数え間違えた）。**実行して観測した結果を報告に書くのは構わない**——それは期待値ではなく事実である
- **`schemas/error-catalog.schema.json` のファイル名を途中で変えない。** `scripts/gen-types.mjs` は消えたスキーマに対応する `src/types/*.ts` を掃除せず、`src/types/*.ts` は `.gitignore` 済みなので `git status` にも出ない（`open-issues.md` 記載）。リネームすると死んだ型が `tsc` の対象に残る
- **UI 文言・メッセージは日本語。** データとスキーマの enum は英語のまま（rev 3章・4章）
- **モジュール境界を跨がない。** コアに列データやフィールド名を持ち込まない／モジュールに行操作や重複検出を再実装しない
- **計画の指示が矛盾していたら、辻褄を合わせずに「計画の矛盾」として報告する。** 報告には**実行した検証コマンドとその出力を貼る**（M7 の教訓）
- 作業は worktree `m10-error-catalog` の中で行う。`sample-project/` の変更は**コミットしない**（実機確認後に `git checkout -- sample-project/ && git clean -fd sample-project/`）

---

## 着手前（Task 1 の前に1回だけ）

- [ ] **worktree に依存をインストールする**

```bash
npm install
```

新しい worktree には `node_modules` が無い。入れずにテストを走らせると「モジュールが見つからない」で落ち、原因を自分の変更だと誤診する（CLAUDE.md の教訓）。

- [ ] **出発点が緑であることを確認する**

```bash
npm test && npx tsc -b && npm run lint
```

すべて緑であること。ここが赤なら着手せず報告する。

---

## File Structure

| ファイル | 責務 |
| --- | --- |
| `schemas/error-catalog.schema.json` | データ形式の**正**。キーの正規順序・enum の定義順もここが持つ |
| `src/types/error-catalog.ts` | 生成物（`.gitignore` 済み）。`ErrorCatalogSchemaVersion1` / `ErrorEntry` |
| `src/modules/error-catalog/fields.ts` | フィールド宣言（`ERROR_FIELDS` / `ErrorField` / `FIELD_LABELS` / `ResolutionLevel`） |
| `src/modules/error-catalog/resolution-labels.ts` | `resolutionLevel` enum の日本語ラベル（UI と出力の見出しで共用） |
| `src/modules/error-catalog/profiles.ts` | プロファイル宣言（`fields` の並び1本）と、出力の列の導出 |
| `src/modules/error-catalog/columns.ts` | 列データ（`No` ＋ `fields`）と既定幅。幅の添字写像はコアへ委譲 |
| `src/modules/error-catalog/column-widths.ts` | 列幅ストア（**プロファイルごとに1本**）と最小幅・変化量 |
| `src/modules/error-catalog/consistency.ts` | 規約4: レベル2（赤）の3ルール |
| `src/modules/error-catalog/warnings.ts` | セルの warning（黄）の判定。**issue ではない** |
| `src/core/markdown-table.ts` | **新設。** Markdown 表のセル整形（エスケープ・行の組み立て・見出しの改行潰し）。全ツール共通 |
| `src/modules/glossary/markdown.ts` | 上記への委譲に載せ替える（**テストは無変更**） |
| `src/modules/error-catalog/markdown.ts` | 規約5: プロファイルの列で Markdown を組む純関数 |
| `src/modules/error-catalog/search.ts` | 検索・`resolutionLevel` フィルタ・導出表示の判定 |
| `src/modules/error-catalog/migrate.ts` | 規約6: 恒等マイグレータ |
| `src/modules/error-catalog/ErrorCatalogEditor.tsx` | 規約3: エディタ |
| `src/modules/error-catalog/module.ts` | モジュール定義（`outputs` を `profiles.ts` から組む） |
| `src/modules/index.ts` | **登録1行を足す**（既存の唯一の変更点） |
| `src/components/CellInput.tsx` | `MAX_ROWS` 5 → 8（決定17。全モジュール共通） |

---

## Task 1: スキーマと型生成

**Files:**
- Create: `schemas/error-catalog.schema.json`
- Test: `src/modules/error-catalog/schema.test.ts`
- 生成物: `src/types/error-catalog.ts`（`npm run gen:types`）

**Interfaces:**
- Consumes: `createSchemaValidator`（`@/core/schema-validation`）、`serialize` / `JsonSchema`（`@/core/canonical`）
- Produces: `schemas/error-catalog.schema.json` と、そこから生成される型 `ErrorCatalogSchemaVersion1`（`schemaVersion` / `type` / `title` / `errors: ErrorEntry[]`）、`ErrorEntry`（`id` / `name` / `occurrence` / `resolutionLevel: 'user'|'support'|'engineer'|'none'|'undecided'` / `causeForSupport` / `causeForSpec` / `userAction` / `supportAction` / `engineerAction` / `notes`。`resolutionLevel` 以外はすべて `string`）

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/error-catalog/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { serialize, type JsonSchema } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'

const validate = createSchemaValidator(errorCatalogSchema as JsonSchema)

function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'error_AAAAAAAAAA',
    name: 'ログインできない',
    occurrence: 'ログイン画面で送信したとき',
    resolutionLevel: 'user',
    causeForSupport: 'パスワードの入力誤り',
    causeForSpec: '認証 API が 401 を返す',
    userAction: 'パスワードを入れ直す',
    supportAction: '',
    engineerAction: '',
    notes: '',
    ...over,
  }
}

function doc(errors: unknown[] = [entry()]): Record<string, unknown> {
  return { schemaVersion: 1, type: 'errorCatalog', title: 'エラーカタログ', errors }
}

describe('error-catalog.schema.json', () => {
  it('全キーが埋まった1件を受け入れる', () => {
    expect(validate(doc()).ok).toBe(true)
  })

  it('errors が空でも受け入れる（新規作成直後の状態）', () => {
    expect(validate(doc([])).ok).toBe(true)
  })

  it('id は error_ ＋ 英数字10文字（他ツールのプレフィクスや桁足らずを拒む）', () => {
    expect(validate(doc([entry({ id: 'term_AAAAAAAAAA' })])).ok).toBe(false)
    expect(validate(doc([entry({ id: 'error_AAAAAAAAA' })])).ok).toBe(false)
    expect(validate(doc([entry({ id: 'error_AAAAAAAAAAA' })])).ok).toBe(false)
  })

  it('name の空文字を拒む（名前のないエラーは引けない）', () => {
    expect(validate(doc([entry({ name: '' })])).ok).toBe(false)
  })

  it('name 以外の散文フィールドは空文字を許す（未記入を欠損ではなく空で表す）', () => {
    const empty = entry({
      occurrence: '',
      causeForSupport: '',
      causeForSpec: '',
      userAction: '',
      supportAction: '',
      engineerAction: '',
      notes: '',
    })
    expect(validate(doc([empty])).ok).toBe(true)
  })

  it('resolutionLevel は5値の enum', () => {
    for (const level of ['user', 'support', 'engineer', 'none', 'undecided']) {
      expect(validate(doc([entry({ resolutionLevel: level })])).ok, level).toBe(true)
    }
    expect(validate(doc([entry({ resolutionLevel: 'other' })])).ok).toBe(false)
  })

  it('キーの欠損を拒む（全キー常在）', () => {
    const missing = entry()
    delete missing.notes
    expect(validate(doc([missing])).ok).toBe(false)
  })

  it('未知のキーを拒む（エンベロープ・エントリの両方）', () => {
    expect(validate(doc([entry({ severity: 'high' })])).ok).toBe(false)
    expect(validate({ ...doc(), extra: 1 }).ok).toBe(false)
  })

  it('type は errorCatalog 固定', () => {
    expect(validate({ ...doc(), type: 'glossary' }).ok).toBe(false)
  })

  it('正規形のキー順はスキーマの properties 記載順になる', () => {
    const shuffled = { errors: [], title: 'T', type: 'errorCatalog', schemaVersion: 1 }
    expect(serialize(shuffled, errorCatalogSchema as JsonSchema)).toBe(
      '{\n  "schemaVersion": 1,\n  "type": "errorCatalog",\n  "title": "T",\n  "errors": []\n}\n',
    )
  })
})
```

- [ ] **Step 2: 失敗を確認する**

```bash
npx vitest run src/modules/error-catalog/schema.test.ts
```

Expected: FAIL（`schemas/error-catalog.schema.json` が解決できない）

- [ ] **Step 3: スキーマを書く**

`schemas/error-catalog.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "error-catalog.schema.json",
  "title": "エラーカタログ (errorCatalog) schemaVersion 1",
  "description": "仕様整理ツール詰め合わせのエラーカタログファイル。プロジェクトフォルダにつき1ファイル（単一性は整合性検証で担保）。キーの正規順序は本スキーマの properties 記載順とする（JSON Schema ではキー順を強制できないため、正規化はアプリの書き込み時処理が保証する）。",
  "type": "object",
  "properties": {
    "schemaVersion": {
      "description": "スキーマの版。errorCatalog の初版は 1。アプリは検証前にこの値を読み、未知の新版は「一覧表示のみ・編集不可」として扱う。",
      "const": 1
    },
    "type": {
      "description": "ツール種別。エラーカタログは errorCatalog 固定。",
      "const": "errorCatalog"
    },
    "title": {
      "description": "表示名。プロジェクトのファイル一覧に使う。",
      "type": "string"
    },
    "errors": {
      "description": "エラーの配列。配列順＝UIの既定表示順（正）。表示Noはこの配列位置から導出する（順序フィールドを持たない）。ソート・フィルタはUI側の導出であり、この順を書き換えない。",
      "type": "array",
      "items": { "$ref": "#/$defs/errorEntry" }
    }
  },
  "required": ["schemaVersion", "type", "title", "errors"],
  "additionalProperties": false,
  "$defs": {
    "errorEntry": {
      "description": "エラー1件。全キー常在（欠損でなく空の値で「未記入」を表現する）。",
      "type": "object",
      "properties": {
        "id": {
          "description": "不変ID。プレフィクス error_ ＋ nanoid（英数字62文字カスタムアルファベット）10文字固定。連番禁止。",
          "type": "string",
          "pattern": "^error_[A-Za-z0-9]{10}$"
        },
        "name": {
          "description": "エラー名。引くためのキーであり、表記ゆれ検知の照合対象。名前のないエラーは解釈不能のため空を許さない。システムがエラーコードを持たないプロジェクトがあるため、コードを同定単位にしない。",
          "type": "string",
          "minLength": 1
        },
        "occurrence": {
          "description": "発生タイミング。本来は参照している側から逆引きして導出すべきだが、参照が実装されるまでは手入力する。空文字＝未記入として warning 可視化の対象。",
          "type": "string"
        },
        "resolutionLevel": {
          "description": "誰が解決するか。none＝検討した上で誰にも解決できない（外部サービス障害等。ok）／undecided＝まだ決めていない（warning対象）。原因の分類ではなく対応主体の分類であり、2軸を混ぜない。enumの拡張は schemaVersion の改訂として扱う。",
          "enum": ["user", "support", "engineer", "none", "undecided"]
        },
        "causeForSupport": {
          "description": "業務レベルの原因。サポート向け出力に載る。空文字＝「未定義」として warning 可視化の対象。",
          "type": "string"
        },
        "causeForSpec": {
          "description": "仕様レベルの原因。開発向け出力のみに載る。業務レベルと粒度が違うため分けている。空文字＝「未定義」として warning 可視化の対象。",
          "type": "string"
        },
        "userAction": {
          "description": "ユーザーが取るべき対応。空文字は resolutionLevel が user または none のときだけ warning。",
          "type": "string"
        },
        "supportAction": {
          "description": "サポート担当が取るべき対応（確認事項・エスカレーション先）。空文字は resolutionLevel が support または none のときだけ warning。",
          "type": "string"
        },
        "engineerAction": {
          "description": "エンジニアの介入内容（データメンテ等）。サポート向け出力にも載せる（サポートが何を依頼すべきか書けるようにするため）。空文字は resolutionLevel が engineer または none のときだけ warning。",
          "type": "string"
        },
        "notes": {
          "description": "備考。検知対象外の自由メモ。空でも warning にしない。",
          "type": "string"
        }
      },
      "required": [
        "id",
        "name",
        "occurrence",
        "resolutionLevel",
        "causeForSupport",
        "causeForSpec",
        "userAction",
        "supportAction",
        "engineerAction",
        "notes"
      ],
      "additionalProperties": false
    }
  }
}
```

- [ ] **Step 4: 型が生成されることを確認する**

```bash
npm run gen:types
```

Expected: 標準出力に `gen:types  error-catalog.schema.json -> src/types/error-catalog.ts` と `gen:types  glossary.schema.json -> src/types/glossary.ts` の2行が出る。生成された型の名前を確認する:

```bash
grep -n "export interface" src/types/error-catalog.ts
```

Expected: `export interface ErrorCatalogSchemaVersion1` と `export interface ErrorEntry` の2つ。**この2つの名前を以降のタスクがそのまま import する。違う名前が出たら「計画の矛盾」として報告する**（後続タスクの import をすべて直す必要があるため、勝手に読み替えない）。

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run src/modules/error-catalog/schema.test.ts && npm test
```

Expected: PASS（新規ファイルの `it` がすべて緑。既存テストも全件緑）

- [ ] **Step 6: コミット**

```bash
git add schemas/error-catalog.schema.json src/modules/error-catalog/schema.test.ts
git commit -m "feat(error-catalog): スキーマ（schemaVersion 1）を追加する"
```

---

## Task 2: フィールド宣言とラベル

**Files:**
- Create: `src/modules/error-catalog/fields.ts`
- Create: `src/modules/error-catalog/resolution-labels.ts`
- Test: `src/modules/error-catalog/fields.test.ts`
- Test: `src/modules/error-catalog/resolution-labels.test.ts`

**Interfaces:**
- Consumes: 生成型 `ErrorEntry`（Task 1）、`schemas/error-catalog.schema.json`
- Produces:
  - `ERROR_FIELDS: readonly ErrorField[]`（スキーマの `errorEntry` のキーから `id` を除いた並び）
  - `type ErrorField = 'name'|'occurrence'|'resolutionLevel'|'causeForSupport'|'causeForSpec'|'userAction'|'supportAction'|'engineerAction'|'notes'`
  - `type ProseField = Exclude<ErrorField, 'resolutionLevel'>`
  - `type ResolutionLevel = ErrorEntry['resolutionLevel']`
  - `FIELD_LABELS: Record<ErrorField, string>`
  - `resolutionLabel(level: string): string` / `RESOLUTION_LABELS: Record<string, string>`

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/error-catalog/fields.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'
import { ERROR_FIELDS, FIELD_LABELS } from './fields'

describe('ERROR_FIELDS', () => {
  it('スキーマの errorEntry のキーから id を除いたものと順序まで一致する', () => {
    // 列の足し忘れ・並びのずれを機械的に検出する。スキーマにフィールドを
    // 足したのにここへ足さないと、画面にも出力にも出ないまま静かに残る
    const keys = Object.keys(errorCatalogSchema.$defs.errorEntry.properties).filter(
      (k) => k !== 'id',
    )
    expect([...ERROR_FIELDS]).toEqual(keys)
  })

  it('全フィールドに日本語ラベルがある', () => {
    for (const field of ERROR_FIELDS) {
      expect(FIELD_LABELS[field], `${field} のラベルがありません`).toBeTruthy()
    }
  })

  it('2つの原因は画面上で見分けられるラベルを持つ（開発向けでは両方が並ぶ）', () => {
    expect(FIELD_LABELS.causeForSupport).not.toBe(FIELD_LABELS.causeForSpec)
  })
})
```

`src/modules/error-catalog/resolution-labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'
import { RESOLUTION_LABELS, resolutionLabel } from './resolution-labels'

describe('resolutionLabel', () => {
  it('スキーマの enum の全値に日本語ラベルがある', () => {
    // enum を拡張したらここが赤くなる（ラベルの足し忘れを機械的に検出する）
    for (const level of errorCatalogSchema.$defs.errorEntry.properties.resolutionLevel.enum) {
      expect(RESOLUTION_LABELS[level], `${level} のラベルがありません`).toBeTruthy()
    }
  })

  it('undecided は用語集の出力と同じ「未分類」', () => {
    expect(resolutionLabel('undecided')).toBe('未分類')
  })

  it('未知の値は生値のまま返す（未知 enum でクラッシュしない）', () => {
    expect(resolutionLabel('escalated')).toBe('escalated')
  })
})
```

- [ ] **Step 2: 失敗を確認する**

```bash
npx vitest run src/modules/error-catalog/fields.test.ts src/modules/error-catalog/resolution-labels.test.ts
```

Expected: FAIL（`./fields` と `./resolution-labels` が解決できない）

- [ ] **Step 3: 実装を書く**

`src/modules/error-catalog/fields.ts`:

```ts
import type { ErrorEntry } from '@/types/error-catalog'

/**
 * エラーカタログエディタのフィールド宣言（M10 決定8）。
 * ID は列に出さない（機械用の参照キーであり、人間が常時見る情報ではない）。
 *
 * **並びはスキーマの properties 記載順と一致させること**（fields.test.ts が検査する）。
 * 正規形のキー順・画面の列順・出力の列順を1つの並びに揃えておくと、
 * どこかだけがずれるという事故が起きない
 */
export const ERROR_FIELDS = [
  'name',
  'occurrence',
  'resolutionLevel',
  'causeForSupport',
  'causeForSpec',
  'userAction',
  'supportAction',
  'engineerAction',
  'notes',
] as const

export type ErrorField = (typeof ERROR_FIELDS)[number]

/** 値が string のフィールド（resolutionLevel だけが enum なので外れる） */
export type ProseField = Exclude<ErrorField, 'resolutionLevel'>

export type ResolutionLevel = ErrorEntry['resolutionLevel']

export const FIELD_LABELS: Record<ErrorField, string> = {
  name: 'エラー名',
  occurrence: '発生タイミング',
  resolutionLevel: '解決レベル',
  // 開発向けでは2つの原因が並ぶので、括弧で粒度を書き分ける
  causeForSupport: '原因（業務）',
  causeForSpec: '原因（仕様）',
  userAction: 'ユーザーの対応',
  supportAction: 'サポートの対応',
  engineerAction: 'エンジニアの対応',
  notes: '備考',
}
```

`src/modules/error-catalog/resolution-labels.ts`:

```ts
/**
 * 解決レベル enum の日本語ラベル（UI 層だけの対応表）。
 * データ・スキーマは英語 enum のまま——JSON は AI との交換形式であり、
 * 表示名は人間向けの都合だから（rev 3章・4章）。
 * 画面のフィルタボタンと Markdown の h3 見出しで同じラベルを使う。
 * enum を拡張したらここにも足す。足し忘れはテストが検出する。
 */
export const RESOLUTION_LABELS: Record<string, string> = {
  user: 'ユーザー対応',
  support: 'サポート対応',
  engineer: 'エンジニア対応',
  // 検討した上で誰にも解決できない（外部サービス障害・仕様上の制約）。
  // 「復旧不可」とは別物で、案内文は存在する（session-notes 2-3）
  none: '解決不可',
  // 用語集の Markdown 出力の見出し「### 未分類」と表記を揃える
  undecided: '未分類',
}

/** ラベルの無い値（将来の enum 拡張）は生値をそのまま返す */
export function resolutionLabel(level: string): string {
  return RESOLUTION_LABELS[level] ?? level
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/modules/error-catalog && npm test
```

Expected: PASS（両ファイルの `it` がすべて緑。既存テストも全件緑）

- [ ] **Step 5: コミット**

```bash
git add src/modules/error-catalog/fields.ts src/modules/error-catalog/fields.test.ts src/modules/error-catalog/resolution-labels.ts src/modules/error-catalog/resolution-labels.test.ts
git commit -m "feat(error-catalog): フィールド宣言と解決レベルのラベルを追加する"
```

---

## Task 3: プロファイル・列・列幅ストア

**Files:**
- Create: `src/modules/error-catalog/profiles.ts`
- Create: `src/modules/error-catalog/columns.ts`
- Create: `src/modules/error-catalog/column-widths.ts`
- Test: `src/modules/error-catalog/profiles.test.ts`
- Test: `src/modules/error-catalog/columns.test.ts`

**Interfaces:**
- Consumes: `ErrorField` / `ERROR_FIELDS`（Task 2）、コアの `ColumnSpec` / `widthIndex` / `defaultWidths` / `nextWidthIndex`（`@/core/list-editor/columns`）、`createColumnWidthStore` / `ColumnWidthStore`（`@/core/column-resize`）
- Produces:
  - `type ProfileId = 'support' | 'dev'`
  - `interface ErrorProfile { id: ProfileId; label: string; fileSuffix: string; fields: readonly ErrorField[] }`
  - `SUPPORT_PROFILE` / `DEV_PROFILE` / `PROFILES: readonly ErrorProfile[]`
  - `markdownFields(profile: ErrorProfile): readonly ErrorField[]`
  - `type ErrorColumn = 'no' | ErrorField`、`NO_COLUMN_LABEL: 'No'`
  - `PROFILE_COLUMNS: Record<ProfileId, ProfileColumns>`（`columns` / `widthIndex` / `defaultWidths` / `nextWidthIndex(i)`）
  - `errorColumnWidths: Record<ProfileId, ColumnWidthStore>`、`MIN_COLUMN_WIDTH` / `CAUSE_MIN_WIDTH` / `RESIZE_STEP`

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/error-catalog/profiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ERROR_FIELDS } from './fields'
import { DEV_PROFILE, markdownFields, PROFILES, SUPPORT_PROFILE } from './profiles'

describe('プロファイル宣言', () => {
  it('サポート向けは仕様レベルの原因と備考を持たない', () => {
    expect(SUPPORT_PROFILE.fields).not.toContain('causeForSpec')
    expect(SUPPORT_PROFILE.fields).not.toContain('notes')
  })

  it('サポート向けもエンジニアの対応を持つ（何を依頼すべきかを書けるようにする）', () => {
    expect(SUPPORT_PROFILE.fields).toContain('engineerAction')
  })

  it('開発向けは全フィールドを宣言順のまま持つ', () => {
    expect([...DEV_PROFILE.fields]).toEqual([...ERROR_FIELDS])
  })

  it('サポート向けの列は開発向けの部分集合で、並びの前後が入れ替わらない', () => {
    const dev = [...DEV_PROFILE.fields]
    const support = [...SUPPORT_PROFILE.fields]
    for (const field of support) expect(dev).toContain(field)
    const positions = support.map((f) => dev.indexOf(f))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('id・label・fileSuffix が一意（書き出し名が衝突しない）', () => {
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(PROFILES.length)
    expect(new Set(PROFILES.map((p) => p.label)).size).toBe(PROFILES.length)
    expect(new Set(PROFILES.map((p) => p.fileSuffix)).size).toBe(PROFILES.length)
  })

  it('fileSuffix は label から導出しない（表示名と書き出し名は別の軸）', () => {
    expect(SUPPORT_PROFILE.fileSuffix).toBe('-サポート向け')
    expect(DEV_PROFILE.fileSuffix).toBe('-開発向け')
  })
})

describe('markdownFields', () => {
  it('resolutionLevel だけを落とし、他は宣言順のまま残す（グルーピング軸は h3 見出しになる）', () => {
    for (const profile of PROFILES) {
      const md = markdownFields(profile)
      expect(md).not.toContain('resolutionLevel')
      expect([...md]).toEqual(profile.fields.filter((f) => f !== 'resolutionLevel'))
    }
  })
})
```

`src/modules/error-catalog/columns.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PROFILE_COLUMNS } from './columns'
import { CAUSE_MIN_WIDTH } from './column-widths'
import { DEV_PROFILE, PROFILES, SUPPORT_PROFILE } from './profiles'

/** 1440px の窓からサイドバーと余白を引いた実効幅の目安（M10 決定17） */
const EFFECTIVE_WIDTH = 1150

describe('PROFILE_COLUMNS', () => {
  it('画面の列は No ＋ プロファイルの fields', () => {
    for (const profile of PROFILES) {
      const fields = PROFILE_COLUMNS[profile.id].columns.map((c) => c.field)
      expect(fields).toEqual(['no', ...profile.fields])
    }
  })

  it('幅を持たない列は causeForSupport だけ（残り幅を吸収する列）', () => {
    for (const profile of PROFILES) {
      const flex = PROFILE_COLUMNS[profile.id].columns.filter((c) => c.defaultWidth === null)
      expect(flex.map((c) => c.field)).toEqual(['causeForSupport'])
    }
  })

  it('widthIndex は幅を持つ列に 0 からの連番、持たない列に null を返す', () => {
    const support = PROFILE_COLUMNS.support
    const assigned = support.widthIndex.filter((w): w is number => w !== null)
    expect(assigned).toEqual(assigned.map((_, i) => i))
    expect(support.defaultWidths).toHaveLength(assigned.length)
  })

  it('causeForSupport の位置から nextWidthIndex を引くと右隣の列の幅添字が返る', () => {
    const support = PROFILE_COLUMNS.support
    const i = support.columns.findIndex((c) => c.field === 'causeForSupport')
    const next = support.nextWidthIndex(i)
    expect(next).not.toBeNull()
    // 右隣（サポート向けでは userAction）の幅添字であること
    expect(next).toBe(support.widthIndex[i + 1])
  })

  it('既定幅の合計は、実効幅から吸収列の最小幅を引いた残りに収まる（横スクロールを出さない）', () => {
    for (const profile of PROFILES) {
      const sum = PROFILE_COLUMNS[profile.id].defaultWidths.reduce((a, b) => a + b, 0)
      expect(sum + CAUSE_MIN_WIDTH, profile.id).toBeLessThan(EFFECTIVE_WIDTH)
    }
  })

  it('開発向けの散文列はサポート向けより狭い（列が2本多いぶんを吸収する）', () => {
    const widthOf = (id: 'support' | 'dev', field: string): number | null =>
      PROFILE_COLUMNS[id].columns.find((c) => c.field === field)?.defaultWidth ?? null
    expect(widthOf(DEV_PROFILE.id, 'userAction')).toBeLessThan(
      widthOf(SUPPORT_PROFILE.id, 'userAction') as number,
    )
  })
})
```

- [ ] **Step 2: 失敗を確認する**

```bash
npx vitest run src/modules/error-catalog/profiles.test.ts src/modules/error-catalog/columns.test.ts
```

Expected: FAIL（`./profiles` `./columns` `./column-widths` が解決できない）

- [ ] **Step 3: 実装を書く**

`src/modules/error-catalog/profiles.ts`:

```ts
import type { ErrorField } from './fields'

/**
 * 出力プロファイル（M10 決定11）。
 *
 * **プロファイルが持つのはフィールドの並び1本だけ。** ここから
 * 画面の列（No ＋ fields）と Markdown の列（No ＋ fields − resolutionLevel）の
 * 両方を導出する。列セットの定義が2箇所にあると、片方だけ直したときに黙ってずれる。
 *
 * `fields` に `resolutionLevel` を含めるのは**画面には列として出す**ため。
 * 出力で列から消えるのは、グルーピング軸が h3 見出しになるからであって、
 * プロファイルが持っていないからではない
 */
export type ProfileId = 'support' | 'dev'

export interface ErrorProfile {
  /** 安定識別子。列幅ストアの鍵・出力プロファイルの id・テストが参照する */
  id: ProfileId
  /** ツールバーのトグルと出力ドロップダウンの表示名 */
  label: string
  /**
   * 書き出しの既定ファイル名に足す接尾辞。
   * **`label` から導出しない**（rev 6章 規約5。表示名は画面の都合で変わるが、
   * 書き出したファイル名は Git に成果物として残る側）
   */
  fileSuffix: string
  /** このプロファイルが扱うフィールドの並び */
  fields: readonly ErrorField[]
}

export const SUPPORT_PROFILE: ErrorProfile = {
  id: 'support',
  label: 'サポート向け',
  fileSuffix: '-サポート向け',
  fields: [
    'name',
    'occurrence',
    'resolutionLevel',
    'causeForSupport',
    'userAction',
    'supportAction',
    // エンジニアの対応もサポート向けに載せる（サポートが「エンジニアに何を
    // 依頼すべきか」を書けるようにするため。session-notes 2-6）
    'engineerAction',
  ],
}

export const DEV_PROFILE: ErrorProfile = {
  id: 'dev',
  label: '開発向け',
  fileSuffix: '-開発向け',
  fields: [
    'name',
    'occurrence',
    'resolutionLevel',
    'causeForSupport',
    'causeForSpec',
    'userAction',
    'supportAction',
    'engineerAction',
    'notes',
  ],
}

/** 並び順＝出力ドロップダウンとツールバーのトグルの並び。既定はサポート向け */
export const PROFILES: readonly ErrorProfile[] = [SUPPORT_PROFILE, DEV_PROFILE]

/**
 * Markdown の列（No 列を除く）。`resolutionLevel` は h3 のグループ見出しに
 * なるので列からは落とす
 */
export function markdownFields(profile: ErrorProfile): readonly ErrorField[] {
  return profile.fields.filter((f) => f !== 'resolutionLevel')
}
```

`src/modules/error-catalog/columns.ts`:

```ts
import {
  defaultWidths,
  nextWidthIndex as nextWidthIndexOf,
  widthIndex,
  type ColumnSpec,
} from '@/core/list-editor/columns'
import type { ErrorField } from './fields'
import { DEV_PROFILE, SUPPORT_PROFILE, type ErrorProfile, type ProfileId } from './profiles'

/**
 * 表の列（M10 決定10・決定16）。
 *
 * `'no'` は編集対象ではない**導出列**（データ配列の index + 1）。フィールドでは
 * ないので `ErrorField` には入れず、列としてだけ先頭に足す。
 *
 * **幅を持たない列は `causeForSupport`**（用語集の `definition` に相当する位置）。
 * 他の列が px を持ち1列が残りを取るので、テーブルは常に親幅に収まる。
 * 写像の実装は `@/core/list-editor/columns` にある（M9 で引き上げ）
 */
export type ErrorColumn = 'no' | ErrorField

export const NO_COLUMN_LABEL = 'No'

/**
 * 個別に幅を決める列。ここに無いフィールドは散文列として `PROSE_WIDTH` を使う。
 * **`causeForSupport` を明示的に null で置く**——`undefined`（未登録）と
 * 区別が付かないと、吸収列がプロファイルごとにずれる
 */
const FIXED_WIDTH: Partial<Record<ErrorColumn, number | null>> = {
  no: 56,
  name: 152,
  occurrence: 128,
  resolutionLevel: 112,
  causeForSupport: null,
}

/**
 * 散文列の既定幅。**開発向けは列が2本多いので狭くする。** 同じ幅にすると
 * 1440px の窓で固定幅の合計が実効幅を越え、吸収列が潰れて横スクロールが出る
 */
const PROSE_WIDTH: Record<ProfileId, number> = { support: 168, dev: 104 }

function columnsFor(profile: ErrorProfile): readonly ColumnSpec<ErrorColumn>[] {
  const columns: ErrorColumn[] = ['no', ...profile.fields]
  return columns.map((field) => {
    const fixed = FIXED_WIDTH[field]
    return { field, defaultWidth: fixed === undefined ? PROSE_WIDTH[profile.id] : fixed }
  })
}

export interface ProfileColumns {
  columns: readonly ColumnSpec<ErrorColumn>[]
  /** 列の添字 → 幅配列の添字。幅を持たない列は null */
  widthIndex: readonly (number | null)[]
  /** 固定幅を持つ列の既定幅（並び順）。列幅 store の初期値になる */
  defaultWidths: readonly number[]
  /** `i` より後ろで最初に幅を持つ列の、幅配列上の添字。無ければ null */
  nextWidthIndex: (i: number) => number | null
}

function profileColumns(profile: ErrorProfile): ProfileColumns {
  const columns = columnsFor(profile)
  const index = widthIndex(columns)
  return {
    columns,
    widthIndex: index,
    defaultWidths: defaultWidths(columns),
    nextWidthIndex: (i) => nextWidthIndexOf(index, i),
  }
}

/**
 * プロファイルごとの列表。**モジュールスコープで1回だけ組む**——
 * レンダごとに作ると `<colgroup>` の参照が毎回変わる
 */
export const PROFILE_COLUMNS: Record<ProfileId, ProfileColumns> = {
  support: profileColumns(SUPPORT_PROFILE),
  dev: profileColumns(DEV_PROFILE),
}
```

`src/modules/error-catalog/column-widths.ts`:

```ts
import { createColumnWidthStore, type ColumnWidthStore } from '@/core/column-resize'
import { PROFILE_COLUMNS } from './columns'
import type { ProfileId } from './profiles'

/**
 * エラーテーブルの列幅（M10 決定16）。
 *
 * **プロファイルごとに1本持つ。** 列数が変わるので1本では持てない——
 * 幅配列は固定幅の列を並び順で持つだけなので、列が増減すると同じ添字が
 * 別の列を指してしまう。
 *
 * アプリを閉じるまで保持し、ファイル切替をまたぐ（エディタは App 側で
 * `key={selected.path}` により作り直されるため、エディタ内の state には置けない）。
 *
 * **モジュールスコープの可変状態はテスト間で漏れる。**
 * DOM テストの beforeEach で両方の `reset()` を呼ぶこと
 */
export const errorColumnWidths: Record<ProfileId, ColumnWidthStore> = {
  support: createColumnWidthStore(PROFILE_COLUMNS.support.defaultWidths),
  dev: createColumnWidthStore(PROFILE_COLUMNS.dev.defaultWidths),
}

/** 列の最小幅(px)。用語集と同じ値に揃える */
export const MIN_COLUMN_WIDTH = 88

/** 原因（業務）列（幅を持たない列）に残す最小幅(px) */
export const CAUSE_MIN_WIDTH = 144

/** キーボード（←→）1回あたりの変化量(px) */
export const RESIZE_STEP = 16
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/modules/error-catalog && npm test
```

Expected: PASS（新規2ファイルの `it` がすべて緑。既存テストも全件緑）

- [ ] **Step 5: コミット**

```bash
git add src/modules/error-catalog/profiles.ts src/modules/error-catalog/profiles.test.ts src/modules/error-catalog/columns.ts src/modules/error-catalog/columns.test.ts src/modules/error-catalog/column-widths.ts
git commit -m "feat(error-catalog): プロファイル宣言と列・列幅ストアを追加する"
```

---

## Task 4: 整合性検証（レベル2・赤）

**Files:**
- Create: `src/modules/error-catalog/consistency.ts`
- Test: `src/modules/error-catalog/consistency.test.ts`

**Interfaces:**
- Consumes: `ConsistencyIssue`（`@/core/consistency`）、`findDuplicates`（`@/core/duplicate`）、`normalizeForMatch`（`@/core/normalize`）、`FIELD_LABELS`（Task 2）、`resolutionLabel`（Task 2）
- Produces: `checkErrorCatalogConsistency(data: ErrorCatalogSchemaVersion1): ConsistencyIssue[]`。ルールは `duplicate-id` / `duplicate-name` / `resolution-action-missing` の3本のみ

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/error-catalog/consistency.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ErrorCatalogSchemaVersion1, ErrorEntry } from '@/types/error-catalog'
import { checkErrorCatalogConsistency } from './consistency'

function entry(over: Partial<ErrorEntry> = {}): ErrorEntry {
  return {
    id: 'error_AAAAAAAAAA',
    name: 'エラー',
    occurrence: '',
    resolutionLevel: 'none',
    causeForSupport: '',
    causeForSpec: '',
    userAction: '',
    supportAction: '',
    engineerAction: '',
    notes: '',
    ...over,
  }
}

function catalog(errors: ErrorEntry[]): ErrorCatalogSchemaVersion1 {
  return { schemaVersion: 1, type: 'errorCatalog', title: 'テストカタログ', errors }
}

const rules = (data: ErrorCatalogSchemaVersion1): string[] =>
  checkErrorCatalogConsistency(data).map((i) => i.rule)

describe('duplicate-id', () => {
  it('同じ ID の全行を配列位置で指す（ID では行を一意に指せない）', () => {
    const issues = checkErrorCatalogConsistency(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: 'A' }),
        entry({ id: 'error_BBBBBBBBBB', name: 'B' }),
        entry({ id: 'error_AAAAAAAAAA', name: 'C' }),
      ]),
    )
    const dup = issues.filter((i) => i.rule === 'duplicate-id')
    expect(dup).toHaveLength(1)
    expect(dup[0].locations.map((l) => l.entityIndex)).toEqual([0, 2])
    expect(dup[0].locations.every((l) => l.field === 'id')).toBe(true)
  })

  it('ID は正規化しない完全一致で見る（大小の違う ID は別物）', () => {
    expect(
      rules(
        catalog([
          entry({ id: 'error_AAAAAAAAAA', name: 'A' }),
          entry({ id: 'error_aaaaaaaaaa', name: 'B' }),
        ]),
      ),
    ).not.toContain('duplicate-id')
  })
})

describe('duplicate-name', () => {
  it('同名の行を name セルで指す', () => {
    const issues = checkErrorCatalogConsistency(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: 'ログイン失敗' }),
        entry({ id: 'error_BBBBBBBBBB', name: 'ログイン失敗' }),
      ]),
    )
    const dup = issues.filter((i) => i.rule === 'duplicate-name')
    expect(dup).toHaveLength(1)
    expect(dup[0].locations.map((l) => l.entityIndex)).toEqual([0, 1])
    expect(dup[0].locations.every((l) => l.field === 'name')).toBe(true)
  })

  it('照合は用語集と同じ規則（NFKC ＋ 前後空白 ＋ 大小同一視）', () => {
    expect(
      rules(
        catalog([
          entry({ id: 'error_AAAAAAAAAA', name: 'ログイン' }),
          entry({ id: 'error_BBBBBBBBBB', name: ' ﾛｸﾞｲﾝ ' }),
        ]),
      ),
    ).toContain('duplicate-name')
  })
})

describe('resolution-action-missing', () => {
  it('user を宣言しているのにユーザーの対応が空なら、そのセルを指す', () => {
    const issues = checkErrorCatalogConsistency(
      catalog([entry({ name: 'A', resolutionLevel: 'user', userAction: '' })]),
    )
    const missing = issues.filter((i) => i.rule === 'resolution-action-missing')
    expect(missing).toHaveLength(1)
    expect(missing[0].locations).toEqual([
      { entityId: 'error_AAAAAAAAAA', entityIndex: 0, field: 'userAction' },
    ])
  })

  it('support / engineer もそれぞれの対応セルを指す', () => {
    const issues = checkErrorCatalogConsistency(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: 'A', resolutionLevel: 'support' }),
        entry({ id: 'error_BBBBBBBBBB', name: 'B', resolutionLevel: 'engineer' }),
      ]),
    )
    expect(
      issues
        .filter((i) => i.rule === 'resolution-action-missing')
        .map((i) => i.locations[0].field),
    ).toEqual(['supportAction', 'engineerAction'])
  })

  it('宣言したレベルの対応が埋まっていれば出ない（他の対応が空でも関係ない）', () => {
    expect(
      rules(
        catalog([
          entry({ name: 'A', resolutionLevel: 'user', userAction: 'やり直す', supportAction: '' }),
        ]),
      ),
    ).not.toContain('resolution-action-missing')
  })

  it('none と undecided では出ない（対応文の空は warning であって赤ではない）', () => {
    expect(rules(catalog([entry({ name: 'A', resolutionLevel: 'none' })]))).not.toContain(
      'resolution-action-missing',
    )
    expect(rules(catalog([entry({ name: 'B', resolutionLevel: 'undecided' })]))).not.toContain(
      'resolution-action-missing',
    )
  })
})

describe('ルールの範囲', () => {
  it('レベル2は3ルールだけ（warning を issue に混ぜない）', () => {
    // 空欄だらけでも undecided でも、赤の指摘は増えない。
    // 混ぜると issue 一覧が warning で埋まり、赤の指摘が読めなくなる
    expect(
      rules(catalog([entry({ id: 'error_AAAAAAAAAA', name: 'A', resolutionLevel: 'undecided' })])),
    ).toEqual([])
  })
})
```

- [ ] **Step 2: 失敗を確認する**

```bash
npx vitest run src/modules/error-catalog/consistency.test.ts
```

Expected: FAIL（`./consistency` が解決できない）

- [ ] **Step 3: 実装を書く**

`src/modules/error-catalog/consistency.ts`:

```ts
import type { ConsistencyIssue } from '@/core/consistency'
import { findDuplicates } from '@/core/duplicate'
import { normalizeForMatch } from '@/core/normalize'
import type { ErrorCatalogSchemaVersion1 } from '@/types/error-catalog'
import { FIELD_LABELS, type ResolutionLevel } from './fields'
import { resolutionLabel } from './resolution-labels'

/**
 * エラーカタログのモジュール内検証（規約4。M10 決定13）。
 * レベル2＝受け入れて赤表示。自ファイルで完結する検証のみで、
 * 単一性違反はコア横断検証の管轄。
 *
 * **warning（対応文・原因の空、undecided）はここに載せない。** warning は
 * セルの面であってエディタが直接塗る（`warnings.ts`）——issue 一覧が
 * warning で埋まると、赤の指摘が読めなくなる。
 *
 * locations は配列位置（entityIndex）で行を指す。ID 重複ファイルを
 * 「受け入れて赤表示」する以上、entityId だけでは行を一意に特定できない
 */
type ActionField = 'userAction' | 'supportAction' | 'engineerAction'

/** そのレベルを宣言したときに埋まっているべき対応。none / undecided は誰も宣言しない */
const REQUIRED_ACTION: Partial<Record<ResolutionLevel, ActionField>> = {
  user: 'userAction',
  support: 'supportAction',
  engineer: 'engineerAction',
}

export function checkErrorCatalogConsistency(
  data: ErrorCatalogSchemaVersion1,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const errors = data.errors

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）
  for (const [id, indices] of findDuplicates(errors, (e) => e.id)) {
    issues.push({
      rule: 'duplicate-id',
      message: `ID が重複しています（${indices.length}件）: ${id}`,
      locations: indices.map((i) => ({ entityId: id, entityIndex: i, field: 'id' })),
    })
  }

  // エラー名の重複（同名2件は「この語で引ける」という前提の矛盾）。
  // 照合規則は用語集の duplicate-name と同じ normalizeForMatch を使う
  //——同じアプリの中で「同じ語とみなす規則」を2つ持たない
  for (const indices of findDuplicates(errors, (e) => normalizeForMatch(e.name)).values()) {
    issues.push({
      rule: 'duplicate-name',
      message: `エラー名が重複しています: ${indices.map((i) => `「${errors[i].name}」`).join(' と ')}`,
      locations: indices.map((i) => ({
        entityId: errors[i].id,
        entityIndex: i,
        field: 'name',
      })),
    })
  }

  // 宣言したレベルと対応文の矛盾（例: user なのに userAction が空）
  errors.forEach((entry, index) => {
    const field = REQUIRED_ACTION[entry.resolutionLevel]
    if (field === undefined || entry[field] !== '') return
    issues.push({
      rule: 'resolution-action-missing',
      message: `「${entry.name}」は${resolutionLabel(entry.resolutionLevel)}としていますが、${FIELD_LABELS[field]}が空です`,
      locations: [{ entityId: entry.id, entityIndex: index, field }],
    })
  })

  return issues
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/modules/error-catalog && npm test
```

Expected: PASS（`consistency.test.ts` の `it` がすべて緑。既存テストも全件緑）

- [ ] **Step 5: コミット**

```bash
git add src/modules/error-catalog/consistency.ts src/modules/error-catalog/consistency.test.ts
git commit -m "feat(error-catalog): 整合性検証の3ルールを追加する"
```

---

## Task 5: セルの warning 判定

**Files:**
- Create: `src/modules/error-catalog/warnings.ts`
- Test: `src/modules/error-catalog/warnings.test.ts`

**Interfaces:**
- Consumes: `ErrorEntry`（Task 1）、`ErrorField`（Task 2）
- Produces: `isWarnCell(entry: ErrorEntry, field: ErrorField): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/error-catalog/warnings.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ErrorEntry } from '@/types/error-catalog'
import { isWarnCell } from './warnings'

function entry(over: Partial<ErrorEntry> = {}): ErrorEntry {
  return {
    id: 'error_AAAAAAAAAA',
    name: 'エラー',
    occurrence: '',
    resolutionLevel: 'user',
    causeForSupport: '',
    causeForSpec: '',
    userAction: '',
    supportAction: '',
    engineerAction: '',
    notes: '',
    ...over,
  }
}

describe('発生タイミングと原因', () => {
  it('空なら resolutionLevel によらず常に warning', () => {
    for (const level of ['user', 'support', 'engineer', 'none', 'undecided'] as const) {
      const e = entry({ resolutionLevel: level })
      expect(isWarnCell(e, 'occurrence'), level).toBe(true)
      expect(isWarnCell(e, 'causeForSupport'), level).toBe(true)
      expect(isWarnCell(e, 'causeForSpec'), level).toBe(true)
    }
  })

  it('埋まっていれば warning にならない', () => {
    const e = entry({ occurrence: '送信時', causeForSupport: '入力誤り', causeForSpec: '401' })
    expect(isWarnCell(e, 'occurrence')).toBe(false)
    expect(isWarnCell(e, 'causeForSupport')).toBe(false)
    expect(isWarnCell(e, 'causeForSpec')).toBe(false)
  })
})

describe('対応3種', () => {
  it('宣言されたレベルの対応が空なら warning', () => {
    expect(isWarnCell(entry({ resolutionLevel: 'user' }), 'userAction')).toBe(true)
    expect(isWarnCell(entry({ resolutionLevel: 'support' }), 'supportAction')).toBe(true)
    expect(isWarnCell(entry({ resolutionLevel: 'engineer' }), 'engineerAction')).toBe(true)
  })

  it('関与しないレベルの対応は空でも warning にしない（表の半分が黄色になるのを避ける）', () => {
    const user = entry({ resolutionLevel: 'user' })
    expect(isWarnCell(user, 'supportAction')).toBe(false)
    expect(isWarnCell(user, 'engineerAction')).toBe(false)
  })

  it('none は3つとも warning（復旧不可でも案内文は存在する）', () => {
    const none = entry({ resolutionLevel: 'none' })
    expect(isWarnCell(none, 'userAction')).toBe(true)
    expect(isWarnCell(none, 'supportAction')).toBe(true)
    expect(isWarnCell(none, 'engineerAction')).toBe(true)
  })

  it('undecided は対応3種を warning にしない（まだ誰が対応するか決めていない）', () => {
    const undecided = entry({ resolutionLevel: 'undecided' })
    expect(isWarnCell(undecided, 'userAction')).toBe(false)
    expect(isWarnCell(undecided, 'supportAction')).toBe(false)
    expect(isWarnCell(undecided, 'engineerAction')).toBe(false)
  })

  it('埋まっていれば warning にならない', () => {
    expect(
      isWarnCell(entry({ resolutionLevel: 'none', userAction: '作り直す' }), 'userAction'),
    ).toBe(false)
  })
})

describe('解決レベル・エラー名・備考', () => {
  it('解決レベルは undecided のときだけ warning', () => {
    expect(isWarnCell(entry({ resolutionLevel: 'undecided' }), 'resolutionLevel')).toBe(true)
    expect(isWarnCell(entry({ resolutionLevel: 'none' }), 'resolutionLevel')).toBe(false)
    expect(isWarnCell(entry({ resolutionLevel: 'user' }), 'resolutionLevel')).toBe(false)
  })

  it('エラー名と備考は warning にならない（空はスキーマ違反／検知対象外の自由メモ）', () => {
    const e = entry({ notes: '' })
    expect(isWarnCell(e, 'name')).toBe(false)
    expect(isWarnCell(e, 'notes')).toBe(false)
  })
})
```

- [ ] **Step 2: 失敗を確認する**

```bash
npx vitest run src/modules/error-catalog/warnings.test.ts
```

Expected: FAIL（`./warnings` が解決できない）

- [ ] **Step 3: 実装を書く**

`src/modules/error-catalog/warnings.ts`:

```ts
import type { ErrorEntry } from '@/types/error-catalog'
import type { ErrorField, ResolutionLevel } from './fields'

/**
 * セルの warning（黄色い面）の判定（M10 決定14）。
 *
 * **warning は `ConsistencyIssue` ではない。** 用語集と同じく、エディタが
 * この判定を直接見てセルを塗る（`term.definition === ''` を見ているのと同じ形）。
 * issue に載せると一覧が warning で埋まり、赤の指摘が読めなくなる。
 *
 * **対応3種は「そのレベルが関与するとき」だけ黄色くする。** 全 Action の
 * 空文字を常に warning にすると、ほとんどのエラーは1レベルしか関与しないため
 * 表の半分が常時黄色になり、警告としての信号が死ぬ。
 * `none`（誰にも解決できない）だけは3つとも対象——復旧不可でも
 * 「作り直してください」「この状態で進めて問題ありません」という案内は存在し、
 * そこがサポートサイトで最も需要の高い問い合わせになる（session-notes 2-3）
 */
const DECLARED_BY: Record<'userAction' | 'supportAction' | 'engineerAction', ResolutionLevel> = {
  userAction: 'user',
  supportAction: 'support',
  engineerAction: 'engineer',
}

export function isWarnCell(entry: ErrorEntry, field: ErrorField): boolean {
  switch (field) {
    // 発生タイミングと原因2種は resolutionLevel の宣言と無関係なので、空なら常に
    case 'occurrence':
    case 'causeForSupport':
    case 'causeForSpec':
      return entry[field] === ''
    case 'userAction':
    case 'supportAction':
    case 'engineerAction':
      return (
        entry[field] === '' &&
        (entry.resolutionLevel === DECLARED_BY[field] || entry.resolutionLevel === 'none')
      )
    case 'resolutionLevel':
      return entry.resolutionLevel === 'undecided'
    // name は空をスキーマが禁じており（minLength 1）、notes は検知対象外の自由メモ
    case 'name':
    case 'notes':
      return false
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/modules/error-catalog && npm test
```

Expected: PASS（`warnings.test.ts` の `it` がすべて緑。既存テストも全件緑）

- [ ] **Step 5: コミット**

```bash
git add src/modules/error-catalog/warnings.ts src/modules/error-catalog/warnings.test.ts
git commit -m "feat(error-catalog): セルの warning 判定を追加する"
```

---

## Task 6: Markdown 出力

**Files:**
- Create: `src/core/markdown-table.ts`
- Test: `src/core/markdown-table.test.ts`
- Modify: `src/modules/glossary/markdown.ts`（コアへの委譲に載せ替える。**テストは触らない**）
- Create: `src/modules/error-catalog/markdown.ts`
- Test: `src/modules/error-catalog/markdown.test.ts`

**Interfaces:**
- Consumes: `FIELD_LABELS` / `ErrorField`（Task 2）、`NO_COLUMN_LABEL`（Task 3）、`markdownFields` / `SUPPORT_PROFILE` / `DEV_PROFILE`（Task 3）、`resolutionLabel`（Task 2）、`schemas/error-catalog.schema.json`
- Produces:
  - `escapeCell(text: string): string` / `row(cells: readonly string[]): string` / `dividerRow(count: number): string` / `headingText(text: string): string`（`@/core/markdown-table`）
  - `errorCatalogToMarkdown(data: ErrorCatalogSchemaVersion1, fields: readonly ErrorField[]): string`

**このタスクは2コミットに分ける。** 前半（Step 1〜4）で Markdown 表の整形をコアへ引き上げ、用語集をその上に載せ替える。後半（Step 5〜8）でエラーカタログの出力を載せる。**引き上げが振る舞いを保っている証拠は「用語集の `markdown.test.ts` を1バイトも変えずに緑」であること**（M9 と同じやり方）。エスケープ規則をアプリ内で2つ持たないための引き上げなので、**用語集側に同じ実装を残さない。**

- [ ] **Step 1: コアの整形関数の失敗するテストを書く**

`src/core/markdown-table.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dividerRow, escapeCell, headingText, row } from './markdown-table'

describe('escapeCell', () => {
  it('| をエスケープする（列区切りと衝突する）', () => {
    expect(escapeCell('a|b')).toBe('a\\|b')
  })

  it('改行は <br> にする（CRLF・CR・LF のすべて）', () => {
    expect(escapeCell('1\r\n2\r3\n4')).toBe('1<br>2<br>3<br>4')
  })

  it('バックスラッシュを先に処理する（順序が逆だと自分が入れた \\ を二重エスケープする）', () => {
    expect(escapeCell('C:\\Users\\bin')).toBe('C:\\\\Users\\\\bin')
    // 生の `a\|b` は、リテラルの `\` ＋ エスケープされた `|` で `a\\\|b`
    expect(escapeCell('a\\|b')).toBe('a\\\\\\|b')
  })

  it('空文字はそのまま（空セルは列として残る）', () => {
    expect(escapeCell('')).toBe('')
  })
})

describe('row', () => {
  it('セルを | で挟んで連ねる', () => {
    expect(row(['a', 'b'])).toBe('| a | b |')
  })

  it('空セルも列として残す（列数が崩れない）', () => {
    expect(row(['a', '', 'c'])).toBe('| a |  | c |')
  })
})

describe('dividerRow', () => {
  it('列数ぶんの --- を並べる', () => {
    expect(dividerRow(3)).toBe('| --- | --- | --- |')
  })
})

describe('headingText', () => {
  it('改行を空白へ潰す（h1 の混入経路を塞ぐ）', () => {
    expect(headingText('用語集\n# 見出しのつもり')).toBe('用語集 # 見出しのつもり')
  })

  it('| はエスケープしない（見出しに列区切りは無い）', () => {
    expect(headingText('a|b')).toBe('a|b')
  })
})
```

- [ ] **Step 2: 失敗を確認する**

```bash
npx vitest run src/core/markdown-table.test.ts
```

Expected: FAIL（`./markdown-table` が解決できない）

- [ ] **Step 3: コアへ引き上げる**

`src/core/markdown-table.ts`:

```ts
/**
 * Markdown の表の組み立て（全ツール共通・コア。M10 で用語集の `markdown.ts` から引き上げ）。
 *
 * **表のセルは書き手を信用せずエスケープする**（rev 8章）。定義・原因・対応は
 * 自由記述欄であり、Windows パスや正規表現、外部（Skill・エディタ）が書いた
 * 複数行の値が入ると表が途中で割れて1件まるごと読めなくなる。
 *
 * **この規則をアプリ内で2つ持たない。** ツールごとに書き直すと、エスケープの
 * 順序や改行の扱いがツールによって食い違い、「あるツールの出力だけ表が割れる」
 * という最悪の挙動になる（`normalizeForMatch` を1つに保っているのと同じ理由）
 */

/**
 * 表のセルに収める。`|` は列区切りと衝突するのでエスケープし、改行は `<br>` にする。
 * **バックスラッシュを先に処理する**——順序を逆にすると、`|` エスケープで入れた
 * `\` まで二重エスケープされる
 */
export function escapeCell(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r\n|\r|\n/g, '<br>')
}

/** セルを1行に組む。空セルも列として残す（列数が崩れない） */
export function row(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`
}

/** 見出し行の下の区切り行。列数を引数に取ることで見出しとの本数ずれを防ぐ */
export function dividerRow(count: number): string {
  return row(Array.from({ length: count }, () => '---'))
}

/**
 * 見出しに収める。エンベロープの `title` も enum の値もスキーマ上はただの
 * `string` なので、外部が書いた改行入りの値をそのまま `## ` の直後に出すと
 * Markdown 上で新しい見出し（最悪 `# ` から始まる h1）が混入しうる。
 * **`escapeCell` は表専用**（`|` をエスケープする）なので、見出しには使えない
 */
export function headingText(text: string): string {
  return text.replace(/\r\n|\r|\n/g, ' ')
}
```

- [ ] **Step 4: 用語集を委譲に載せ替え、テストが無変更のまま緑であることを確認する**

`src/modules/glossary/markdown.ts` から `cell` / `row` / `heading` の**3つの関数定義を削除**し、コアの import に置き換える。呼び出し箇所は次のとおり読み替える（**それ以外は1文字も変えない**）:

| 変更前 | 変更後 |
| --- | --- |
| `function cell(text) {...}` / `function row(cells) {...}` / `function heading(text) {...}` の定義 | 削除し、冒頭に `import { dividerRow, escapeCell, headingText, row } from '@/core/markdown-table'` |
| `cell(...)`（`termRow` 内の4箇所） | `escapeCell(...)` |
| `heading(...)`（2箇所） | `headingText(...)` |
| `row(...)` | そのまま（コア版と同じ名前・同じ挙動） |
| `const divider = row(FIELD_ORDER.map(() => '---'))` | `const divider = dividerRow(FIELD_ORDER.length)` |

削除する関数に付いていた JSDoc のうち、エスケープ順序の理由はコア側へ移してある。用語集側には残さない。

```bash
git diff --stat -- src/modules/glossary
npm test
```

Expected: `git diff --stat` に出るのは `src/modules/glossary/markdown.ts` **1ファイルだけ**（テストは無変更）。`npm test` は全件緑——**`glossary/markdown.test.ts` が1バイトも変わらずに通ることが、引き上げが出力バイト列を変えていない証拠になる。**

- [ ] **Step 5: エラーカタログの失敗するテストを書く**

`src/modules/error-catalog/markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ErrorCatalogSchemaVersion1, ErrorEntry } from '@/types/error-catalog'
import { errorCatalogToMarkdown } from './markdown'
import { DEV_PROFILE, markdownFields, SUPPORT_PROFILE } from './profiles'

const SUPPORT = markdownFields(SUPPORT_PROFILE)
const DEV = markdownFields(DEV_PROFILE)

function entry(over: Partial<ErrorEntry> = {}): ErrorEntry {
  return {
    id: 'error_AAAAAAAAAA',
    name: 'ログインできない',
    occurrence: '送信したとき',
    resolutionLevel: 'user',
    causeForSupport: '入力誤り',
    causeForSpec: '401 が返る',
    userAction: '入れ直す',
    supportAction: '確認する',
    engineerAction: '調べる',
    notes: 'メモ',
    ...over,
  }
}

function catalog(errors: ErrorEntry[], title = 'テストカタログ'): ErrorCatalogSchemaVersion1 {
  return { schemaVersion: 1, type: 'errorCatalog', title, errors }
}

describe('見出しと構造', () => {
  it('title は h2、解決レベルのグループは h3。h1 は使わない', () => {
    const md = errorCatalogToMarkdown(catalog([entry()]), SUPPORT)
    expect(md).toContain('## テストカタログ')
    expect(md).toContain('### ユーザー対応')
    expect(md.split('\n').some((line) => /^# /.test(line))).toBe(false)
  })

  it('グループは enum の定義順に並ぶ（データの登場順ではない）', () => {
    const md = errorCatalogToMarkdown(
      catalog([
        entry({ id: 'error_BBBBBBBBBB', name: 'あと', resolutionLevel: 'engineer' }),
        entry({ id: 'error_CCCCCCCCCC', name: 'さき', resolutionLevel: 'user' }),
      ]),
      SUPPORT,
    )
    expect(md.indexOf('### ユーザー対応')).toBeLessThan(md.indexOf('### エンジニア対応'))
  })

  it('空のグループは見出しごと省略する', () => {
    const md = errorCatalogToMarkdown(catalog([entry({ resolutionLevel: 'user' })]), SUPPORT)
    expect(md).toContain('### ユーザー対応')
    expect(md).not.toContain('### サポート対応')
    expect(md).not.toContain('### 未分類')
  })

  it('グループ内はデータ配列順（並べ替えない）', () => {
    const md = errorCatalogToMarkdown(
      catalog([
        entry({ id: 'error_BBBBBBBBBB', name: 'ん' }),
        entry({ id: 'error_CCCCCCCCCC', name: 'あ' }),
      ]),
      SUPPORT,
    )
    expect(md.indexOf('| ん |')).toBeLessThan(md.indexOf('| あ |'))
  })

  it('undecided は「未分類」グループとして出す（サポート向けでも省略しない）', () => {
    const md = errorCatalogToMarkdown(
      catalog([entry({ resolutionLevel: 'undecided' })]),
      SUPPORT,
    )
    expect(md).toContain('### 未分類')
  })

  it('enum に無い解決レベルも落とさず末尾のグループに出す', () => {
    const data = catalog([
      entry({ name: '未知レベル', resolutionLevel: 'escalated' as ErrorEntry['resolutionLevel'] }),
    ])
    const md = errorCatalogToMarkdown(data, SUPPORT)
    expect(md).toContain('### escalated')
    expect(md).toContain('| 未知レベル |')
  })

  it('title に改行が入っていても h1 が混入しない', () => {
    const md = errorCatalogToMarkdown(catalog([], 'カタログ\n# 見出しのつもり'), SUPPORT)
    expect(md.split('\n').some((line) => /^# /.test(line))).toBe(false)
    expect(md).toBe('## カタログ # 見出しのつもり\n')
  })

  it('0件なら見出しだけ。末尾は改行1つ', () => {
    expect(errorCatalogToMarkdown(catalog([]), SUPPORT)).toBe('## テストカタログ\n')
  })
})

describe('プロファイルごとの列', () => {
  it('サポート向けは仕様レベルの原因・備考・解決レベルを列に出さない', () => {
    const md = errorCatalogToMarkdown(catalog([entry()]), SUPPORT)
    expect(md).toContain(
      '| No | エラー名 | 発生タイミング | 原因（業務） | ユーザーの対応 | サポートの対応 | エンジニアの対応 |',
    )
    expect(md).not.toContain('原因（仕様）')
    expect(md).not.toContain('| 備考 |')
    expect(md).not.toContain('| 解決レベル |')
    expect(md).not.toContain('401 が返る')
    expect(md).not.toContain('メモ')
  })

  it('開発向けは仕様レベルの原因と備考も出す（解決レベルは見出しに出るので列にしない）', () => {
    const md = errorCatalogToMarkdown(catalog([entry()]), DEV)
    expect(md).toContain(
      '| No | エラー名 | 発生タイミング | 原因（業務） | 原因（仕様） | ユーザーの対応 | サポートの対応 | エンジニアの対応 | 備考 |',
    )
    expect(md).toContain('401 が返る')
    expect(md).toContain('メモ')
    expect(md).not.toContain('| 解決レベル |')
  })

  it('区切り行の列数が見出し行と一致する', () => {
    const md = errorCatalogToMarkdown(catalog([entry()]), DEV)
    const lines = md.split('\n')
    const header = lines.find((l) => l.startsWith('| No |')) as string
    const divider = lines[lines.indexOf(header) + 1]
    expect(divider.split('|')).toHaveLength(header.split('|').length)
  })

  it('ID は出さない', () => {
    const md = errorCatalogToMarkdown(catalog([entry({ id: 'error_ZZZZZZZZZZ' })]), DEV)
    expect(md).not.toContain('error_ZZZZZZZZZZ')
  })
})

describe('No 列', () => {
  it('No はデータ配列の位置（index + 1）。グループをまたいでも振り直さない', () => {
    const md = errorCatalogToMarkdown(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: '1件目', resolutionLevel: 'user' }),
        entry({ id: 'error_BBBBBBBBBB', name: '2件目', resolutionLevel: 'support' }),
        entry({ id: 'error_CCCCCCCCCC', name: '3件目', resolutionLevel: 'user' }),
      ]),
      SUPPORT,
    )
    // 画面の No と同じ番号を指す（会議中に口頭で指すための目印）
    expect(md).toContain('| 1 | 1件目 |')
    expect(md).toContain('| 2 | 2件目 |')
    expect(md).toContain('| 3 | 3件目 |')
  })
})

describe('空欄とエスケープ', () => {
  it('空フィールドは（未定義）と書く（負債を出力にも残す）', () => {
    const md = errorCatalogToMarkdown(
      catalog([entry({ occurrence: '', causeForSupport: '', userAction: '' })]),
      SUPPORT,
    )
    expect(md).toContain('| 1 | ログインできない | （未定義） | （未定義） | （未定義） |')
  })

  it('備考の空欄は（未定義）にしない（検知対象外の自由メモ。用語集と揃える）', () => {
    const md = errorCatalogToMarkdown(catalog([entry({ notes: '' })]), DEV)
    const row = md.split('\n').find((l) => l.startsWith('| 1 |')) as string
    expect(row.endsWith('| 調べる |  |')).toBe(true)
  })

  it('セル内の | はエスケープし、改行は <br> にする（表を壊さない）', () => {
    const md = errorCatalogToMarkdown(
      catalog([entry({ causeForSupport: 'a|b', userAction: '1行目\n2行目' })]),
      SUPPORT,
    )
    expect(md).toContain('a\\|b')
    expect(md).toContain('1行目<br>2行目')
    expect(md.split('\n').filter((l) => l.startsWith('| 1 |'))).toHaveLength(1)
  })

  it('バックスラッシュを先にエスケープする（順序が逆だと二重エスケープになる）', () => {
    const md = errorCatalogToMarkdown(
      catalog([entry({ causeForSupport: 'C:\\Users\\bin' })]),
      SUPPORT,
    )
    expect(md).toContain('C:\\\\Users\\\\bin')
    expect(md.split('\n').filter((l) => l.includes('C:\\\\Users\\\\bin'))).toHaveLength(1)
  })
})
```

- [ ] **Step 6: 失敗を確認する**

```bash
npx vitest run src/modules/error-catalog/markdown.test.ts
```

Expected: FAIL（`./markdown` が解決できない）

- [ ] **Step 7: 実装を書く**

`src/modules/error-catalog/markdown.ts`:

```ts
import { dividerRow, escapeCell, headingText, row } from '@/core/markdown-table'
import type { ErrorCatalogSchemaVersion1, ErrorEntry } from '@/types/error-catalog'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'
import { NO_COLUMN_LABEL } from './columns'
import { FIELD_LABELS, type ErrorField } from './fields'
import { resolutionLabel } from './resolution-labels'

/**
 * エラーカタログの Markdown 出力（モジュール規約5。M10 決定15）。
 * 用語集の出力仕様（rev 8章）をそのままなぞる。
 *
 * - **h1 は使わない**（NotePM のページタイトルと階層が衝突する）。
 *   `title` が h2、解決レベルのグループが h3
 * - グループ順は **enum の定義順**をスキーマから実行時に導出する。
 *   空のグループは見出しごと省略し、グループ内はデータ配列順
 * - 空フィールドは `（未定義）`、`undecided` は「未分類」グループとして
 *   **サポート向け出力でも省略しない**。仕様書に貼った瞬間に未定義が
 *   見えなくなるのは文章仕様書の悪癖の再生産である（rev 5章）
 * - 列は呼び出し側（`profiles.ts` の `markdownFields`）が渡す。
 *   `resolutionLevel` はグルーピング軸として h3 に出るので列には来ない
 */

/** グループ順はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂で静かにずれる） */
const LEVEL_ORDER: readonly string[] =
  errorCatalogSchema.$defs.errorEntry.properties.resolutionLevel.enum

const UNDEFINED_VALUE = '（未定義）'

/**
 * セルの値。**空は「（未定義）」と書いて負債を出力にも残す。**
 * ただし `notes` は検知対象外の自由メモなので空のまま——用語集の備考と揃える。
 * エスケープはコア（`@/core/markdown-table`）が持つ
 */
function value(entry: ErrorEntry, field: ErrorField): string {
  const raw: string = entry[field]
  if (raw === '' && field !== 'notes') return UNDEFINED_VALUE
  return escapeCell(raw)
}

export function errorCatalogToMarkdown(
  data: ErrorCatalogSchemaVersion1,
  fields: readonly ErrorField[],
): string {
  // enum 順のグループを先に作っておくことで、出力順が enum の定義順に固定される。
  // 値ではなく配列位置を持つ——No がデータ配列の位置だから
  const groups = new Map<string, number[]>(LEVEL_ORDER.map((level) => [level, []]))
  data.errors.forEach((entry, index) => {
    const group = groups.get(entry.resolutionLevel)
    // enum に無い値（将来の拡張版を古いアプリで開いた等）は末尾へ足す。
    // 落とすと「出力に出ないエラー」が黙って生まれる
    if (group === undefined) groups.set(entry.resolutionLevel, [index])
    else group.push(index)
  })

  const header = row([NO_COLUMN_LABEL, ...fields.map((f) => FIELD_LABELS[f])])
  // No 列のぶんを足す。見出しと本数がずれないよう列数から作る
  const divider = dividerRow(fields.length + 1)
  const blocks: string[] = [`## ${headingText(data.title)}`]
  for (const [level, indices] of groups) {
    if (indices.length === 0) continue
    blocks.push(`### ${headingText(resolutionLabel(level))}`)
    const rows = indices.map((index) =>
      // **No はデータ配列の位置（index + 1）。** グループごとに 1 から振り直さない
      //——画面の No と出力の No が食い違うと、口頭で指すための目印として使えない
      row([`${index + 1}`, ...fields.map((f) => value(data.errors[index], f))]),
    )
    blocks.push([header, divider, ...rows].join('\n'))
  }
  return `${blocks.join('\n\n')}\n`
}
```

- [ ] **Step 8: テストが通ることを確認する**

```bash
npx vitest run src/core/markdown-table.test.ts src/modules/error-catalog && npm test && npx tsc -b && npm run lint
```

Expected: PASS（`markdown-table.test.ts` と `markdown.test.ts` の `it` がすべて緑。既存テストも全件緑。**用語集のテストは1バイトも変えていない**）

- [ ] **Step 9: コミット（引き上げと新規実装を分ける）**

```bash
git add src/core/markdown-table.ts src/core/markdown-table.test.ts src/modules/glossary/markdown.ts
git commit -m "refactor(core): Markdown 表の整形をコアへ引き上げる"
git add src/modules/error-catalog/markdown.ts src/modules/error-catalog/markdown.test.ts
git commit -m "feat(error-catalog): プロファイル別の Markdown 出力を追加する"
```

---

## Task 7: 検索とフィルタ

**Files:**
- Create: `src/modules/error-catalog/search.ts`
- Test: `src/modules/error-catalog/search.test.ts`

**Interfaces:**
- Consumes: `normalizeForMatch`（`@/core/normalize`）、`ErrorEntry`（Task 1）
- Produces: `interface ErrorFilter { query: string; levels: readonly string[] }`、`EMPTY_FILTER`、`isDerivedView(filter): boolean`、`filterErrorIndices(errors, filter): number[]`

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/error-catalog/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ErrorEntry } from '@/types/error-catalog'
import { EMPTY_FILTER, filterErrorIndices, isDerivedView } from './search'

function entry(over: Partial<ErrorEntry> = {}): ErrorEntry {
  return {
    id: 'error_AAAAAAAAAA',
    name: 'エラー',
    occurrence: '',
    resolutionLevel: 'user',
    causeForSupport: '',
    causeForSpec: '',
    userAction: '',
    supportAction: '',
    engineerAction: '',
    notes: '',
    ...over,
  }
}

const entries: ErrorEntry[] = [
  entry({ id: 'error_AAAAAAAAAA', name: 'ログインできない', resolutionLevel: 'user' }),
  entry({
    id: 'error_BBBBBBBBBB',
    name: '保存に失敗する',
    resolutionLevel: 'engineer',
    causeForSupport: 'ディスクの空きがない',
  }),
  entry({
    id: 'error_CCCCCCCCCC',
    name: '印刷できない',
    resolutionLevel: 'undecided',
    notes: 'ログインの話ではない',
  }),
]

describe('filterErrorIndices', () => {
  it('絞り込みなしなら元配列の位置をそのまま返す', () => {
    expect(filterErrorIndices(entries, EMPTY_FILTER)).toEqual([0, 1, 2])
  })

  it('検索は原因や対応も横断する', () => {
    expect(filterErrorIndices(entries, { query: 'ディスク', levels: [] })).toEqual([1])
  })

  it('備考は検索対象に含めない（検知対象外の自由メモ）', () => {
    // 「ログイン」は 0 の name と 2 の notes に出るが、2 は引っかからない
    expect(filterErrorIndices(entries, { query: 'ログイン', levels: [] })).toEqual([0])
  })

  it('照合は重複判定と同じ normalizeForMatch（NFKC・大小同一視）', () => {
    expect(filterErrorIndices(entries, { query: 'ﾛｸﾞｲﾝ', levels: [] })).toEqual([0])
  })

  it('エントリ側の値も正規化して照合する（クエリ側だけの正規化では拾えない）', () => {
    // 半角カナ・大文字で書かれたエントリを、全角・小文字のクエリで引く。
    // entry 側の normalizeForMatch を外すとこのテストだけが赤くなる
    const skewed: ErrorEntry[] = [
      entry({ id: 'error_DDDDDDDDDD', name: 'ﾛｸﾞｲﾝできない' }),
      entry({ id: 'error_EEEEEEEEEE', name: 'CSV 出力に失敗する', causeForSupport: 'ENCODING の不一致' }),
    ]
    expect(filterErrorIndices(skewed, { query: 'ログイン', levels: [] })).toEqual([0])
    expect(filterErrorIndices(skewed, { query: 'encoding', levels: [] })).toEqual([1])
  })

  it('解決レベルの絞り込みは複数指定が OR', () => {
    expect(filterErrorIndices(entries, { query: '', levels: ['user', 'engineer'] })).toEqual([0, 1])
  })

  it('検索と解決レベルは AND', () => {
    expect(filterErrorIndices(entries, { query: 'できない', levels: ['user'] })).toEqual([0])
  })
})

describe('isDerivedView', () => {
  it('検索文字列か解決レベルの絞り込みがあれば導出表示', () => {
    expect(isDerivedView(EMPTY_FILTER)).toBe(false)
    expect(isDerivedView({ query: 'a', levels: [] })).toBe(true)
    expect(isDerivedView({ query: '', levels: ['user'] })).toBe(true)
  })

  it('空白だけのクエリは導出表示にしない（前後空白は入力ノイズ）', () => {
    expect(isDerivedView({ query: '  ', levels: [] })).toBe(false)
  })
})
```

- [ ] **Step 2: 失敗を確認する**

```bash
npx vitest run src/modules/error-catalog/search.test.ts
```

Expected: FAIL（`./search` が解決できない）

- [ ] **Step 3: 実装を書く**

`src/modules/error-catalog/search.ts`:

```ts
import { normalizeForMatch } from '@/core/normalize'
import type { ErrorEntry } from '@/types/error-catalog'
import type { ProseField } from './fields'

/**
 * 検索・解決レベルフィルタ（M10 決定16）。
 * 照合は重複判定と同じ `normalizeForMatch` を使う——同じアプリの中で
 * 「同じ語とみなす規則」を2つ持たない。
 *
 * **検索対象は表示中のプロファイルに依らない。** サポート向け表示でも
 * `causeForSpec` を検索する——プロファイルは「誰に見せるか」の切り替えで
 * あって、データの一部を無かったことにする機能ではない。
 * `notes` だけは検知対象外の自由メモなので外す（用語集と同じ判断）
 */
const SEARCH_FIELDS: readonly ProseField[] = [
  'name',
  'occurrence',
  'causeForSupport',
  'causeForSpec',
  'userAction',
  'supportAction',
  'engineerAction',
]

export interface ErrorFilter {
  /** インクリメンタル検索の文字列 */
  query: string
  /** 解決レベルの絞り込み。空配列＝絞り込みなし。複数指定は OR */
  levels: readonly string[]
}

export const EMPTY_FILTER: ErrorFilter = { query: '', levels: [] }

/**
 * 導出表示か（＝データ順と表示順が食い違いうるか）。
 * true の間は並び替え（Alt+↑↓）と行追加を無効にする
 */
export function isDerivedView(filter: ErrorFilter): boolean {
  return normalizeForMatch(filter.query) !== '' || filter.levels.length > 0
}

/** 表示するエラーの「元配列での index」を配列順のまま返す */
export function filterErrorIndices(
  errors: readonly ErrorEntry[],
  filter: ErrorFilter,
): number[] {
  const query = normalizeForMatch(filter.query)
  const levels = new Set(filter.levels)
  const out: number[] = []
  errors.forEach((entry, index) => {
    if (levels.size > 0 && !levels.has(entry.resolutionLevel)) return
    if (query !== '' && !matches(entry, query)) return
    out.push(index)
  })
  return out
}

function matches(entry: ErrorEntry, normalizedQuery: string): boolean {
  return SEARCH_FIELDS.some((f) => normalizeForMatch(entry[f]).includes(normalizedQuery))
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/modules/error-catalog && npm test
```

Expected: PASS（`search.test.ts` の `it` がすべて緑。既存テストも全件緑）

- [ ] **Step 5: コミット**

```bash
git add src/modules/error-catalog/search.ts src/modules/error-catalog/search.test.ts
git commit -m "feat(error-catalog): 検索と解決レベルフィルタを追加する"
```

---

## Task 8: エディタ

**Files:**
- Create: `src/modules/error-catalog/ErrorCatalogEditor.tsx`
- Test: `src/modules/error-catalog/ErrorCatalogEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `EditorProps`（`@/core/registry`）、`useListRows` / `cellId`（`@/core/list-editor/use-list-rows`）、`buildErrorMarks` / `cellFace` / `hasError`（`@/core/list-editor/cell-face`）、`stepField`（`@/core/list-editor/field-step`、**3引数のコア版**）、`useColumnResize`（`@/core/column-resize`）、`resolveCommand` / `toKeyEventLike`（`@/core/keyboard/keymap`）、`altModifierLabel` / `currentPlatform`（`@/core/keyboard/platform`）、`CellInput` / `FieldState`（`@/components/CellInput`）、`buttonBase`（`@/components/button-styles`）、`newId`（`@/core/new-id`）、Task 2〜7 の全モジュール
- Produces: `ErrorCatalogEditor: ComponentType<EditorProps<ErrorCatalogSchemaVersion1>>`。新規行の既定名は `新しいエラー`、既定 `resolutionLevel` は `undecided`

**この タスクの設計上の要点（実装前に読むこと）:**

1. **プロファイルはエディタの state。** 切り替えても data は変わらない（履歴も積まない）。App は `key={selected.path}` でエディタを作り直すため、ファイルを切り替えるとサポート向けに戻る
2. **列幅ストアはプロファイルごとに引き分ける**（`errorColumnWidths[profile.id]`）。`useColumnResize` に渡す `store` がレンダ間で変わるが、`useSyncExternalStore` が購読を張り替えるので問題ない
3. **No 列には列幅ハンドルを出さない。** 導出列で幅を動かす意味が無く、既定幅 56px は `MIN_COLUMN_WIDTH`（88）を下回るため、ハンドルを出すと初回操作で幅が跳ねる
4. **プロファイル切替でフォーカスが飛ぶ心配は要らない。** トグルはボタンなので、押した時点でフォーカスはボタンにある（消える列のセルにフォーカスが載ったまま切り替わる経路が無い）。**この経路を塞ぐ追加コードを書かないこと**
5. **`<th>` に `relative` を付けない。** `sticky` 自体が絶対配置の包含ブロックになるので不要（用語集に残っている `sticky` ＋ `relative` の重複は `open-issues.md` の小さな負債。新しいモジュールで再生産しない）
6. **テーブルを包む div に `overflow` を付けない。** 既定幅は横スクロールが出ない前提で決めてあり（`columns.test.ts` が検査）、`overflow` を足すと `sticky` の親が変わって見出しの固定が静かに壊れる

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/error-catalog/ErrorCatalogEditor.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ErrorCatalogSchemaVersion1, ErrorEntry } from '@/types/error-catalog'
import { errorColumnWidths, RESIZE_STEP } from './column-widths'
import { PROFILE_COLUMNS } from './columns'
import { ErrorCatalogEditor } from './ErrorCatalogEditor'

afterEach(cleanup)
beforeEach(() => {
  // モジュールスコープの store はテスト間で漏れる
  errorColumnWidths.support.reset()
  errorColumnWidths.dev.reset()
})

function entry(over: Partial<ErrorEntry> & { id: string; name: string }): ErrorEntry {
  return {
    occurrence: '',
    resolutionLevel: 'user',
    causeForSupport: '',
    causeForSpec: '',
    userAction: 'やり直す',
    supportAction: '',
    engineerAction: '',
    notes: '',
    ...over,
  }
}

function catalog(errors: ErrorEntry[]): ErrorCatalogSchemaVersion1 {
  return { schemaVersion: 1, type: 'errorCatalog', title: 'テストカタログ', errors }
}

/** 額縁の代わり。onChange を受けて data を差し替える最小の親 */
function Harness(props: {
  initial: ErrorCatalogSchemaVersion1
  onChange: (next: ErrorCatalogSchemaVersion1, mergeKey?: string | null) => void
  modalOpen?: boolean
}) {
  const [data, setData] = useState(props.initial)
  return (
    <ErrorCatalogEditor
      data={data}
      issues={[]}
      modalOpen={props.modalOpen ?? false}
      onChange={(next, mergeKey) => {
        setData(next)
        props.onChange(next, mergeKey)
      }}
    />
  )
}

function renderEditor(initial: ErrorCatalogSchemaVersion1, modalOpen = false) {
  const onChange = vi.fn()
  render(<Harness initial={initial} onChange={onChange} modalOpen={modalOpen} />)
  const latest = () => onChange.mock.calls.at(-1)?.[0] as ErrorCatalogSchemaVersion1 | undefined
  return { onChange, latest }
}

const twoErrors = catalog([
  entry({ id: 'error_AAAAAAAAAA', name: 'ログインできない' }),
  entry({ id: 'error_BBBBBBBBBB', name: '保存に失敗する', resolutionLevel: 'engineer' }),
])

describe('ErrorCatalogEditor: IME', () => {
  it('変換確定の Enter では行が増えない（日本語入力アプリ最大の地雷）', () => {
    renderEditor(twoErrors)
    const cell = screen.getByLabelText('エラー名（No.1）')
    fireEvent.compositionStart(cell)
    fireEvent.keyDown(cell, { key: 'Enter', isComposing: true })
    expect(screen.getAllByLabelText(/^エラー名（/)).toHaveLength(2)
  })
})

describe('ErrorCatalogEditor: 行の操作言語', () => {
  it('Enter で直後に行が増え、新しい行のエラー名セルにフォーカスが移る', () => {
    const { latest } = renderEditor(twoErrors)
    fireEvent.keyDown(screen.getByLabelText('エラー名（No.1）'), { key: 'Enter' })
    const names = screen.getAllByLabelText(/^エラー名（/) as HTMLInputElement[]
    expect(names).toHaveLength(3)
    expect(names[1].value).toBe('新しいエラー')
    expect(document.activeElement).toBe(names[1])
    // 既定名は全選択で渡す（打ち始めればそのまま置き換わる）
    expect(names[1].selectionStart).toBe(0)
    expect(names[1].selectionEnd).toBe(names[1].value.length)
    expect(latest()?.errors[1].resolutionLevel).toBe('undecided')
    expect(latest()?.errors[1].id).toMatch(/^error_[A-Za-z0-9]{10}$/)
  })

  it('空のエラー名セルで Backspace すると行が消える', () => {
    renderEditor(twoErrors)
    const cell = screen.getByLabelText('エラー名（No.2）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(screen.getAllByLabelText(/^エラー名（/)).toHaveLength(1)
  })

  it('空のユーザーの対応セルで Backspace しても行は消えない（空が常態なので事故になる）', () => {
    renderEditor(twoErrors)
    const cell = screen.getByLabelText('ユーザーの対応（No.2）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(screen.getAllByLabelText(/^エラー名（/)).toHaveLength(2)
  })

  it('Tab の移動先はプロファイルの列順（サポート向けでは原因（業務）の次がユーザーの対応）', () => {
    renderEditor(twoErrors)
    fireEvent.keyDown(screen.getByLabelText('原因（業務）（No.1）'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('ユーザーの対応（No.1）'))
  })

  it('Alt+↑ で行が入れ替わる', () => {
    const { latest } = renderEditor(twoErrors)
    fireEvent.keyDown(screen.getByLabelText('エラー名（No.2）'), { key: 'ArrowUp', altKey: true })
    expect(latest()?.errors.map((e) => e.name)).toEqual(['保存に失敗する', 'ログインできない'])
  })

  it('検索中は Alt+↑↓ で並び替えできない（導出表示中の境界規則）', () => {
    const { onChange } = renderEditor(twoErrors)
    fireEvent.change(screen.getByLabelText('エラーを検索'), { target: { value: 'できない' } })
    onChange.mockClear()
    fireEvent.keyDown(screen.getByLabelText('エラー名（No.1）'), { key: 'ArrowUp', altKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('検索中の Enter では行が増えない（絞り込みに掛からない見えない行を作らない）', () => {
    const { onChange } = renderEditor(twoErrors)
    fireEvent.change(screen.getByLabelText('エラーを検索'), { target: { value: 'できない' } })
    onChange.mockClear()
    fireEvent.keyDown(screen.getByLabelText('エラー名（No.1）'), { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('最後の1行を消したら「エラーを追加」ボタンへフォーカスが移る', async () => {
    renderEditor(catalog([entry({ id: 'error_AAAAAAAAAA', name: 'ログインできない' })]))
    const cell = screen.getByRole('textbox', { name: 'エラー名（No.1）' }) as HTMLInputElement
    cell.focus()
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    const add = await screen.findByRole('button', { name: 'エラーを追加' })
    expect(document.activeElement).toBe(add)
  })
})

describe('ErrorCatalogEditor: No 列', () => {
  it('No はデータ配列の位置。絞り込んでも番号が動かない', () => {
    renderEditor(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: 'ログインできない' }),
        entry({ id: 'error_BBBBBBBBBB', name: '保存に失敗する', resolutionLevel: 'engineer' }),
        entry({ id: 'error_CCCCCCCCCC', name: '印刷できない' }),
      ]),
    )
    fireEvent.change(screen.getByLabelText('エラーを検索'), { target: { value: '印刷' } })
    // 3件目だけが残る。表示位置は1行目だが No は 3 のまま
    const names = screen.getAllByLabelText(/^エラー名（/) as HTMLInputElement[]
    expect(names).toHaveLength(1)
    expect(names[0].getAttribute('aria-label')).toBe('エラー名（No.3）')
  })
})

describe('ErrorCatalogEditor: プロファイル', () => {
  it('既定はサポート向けで、仕様レベルの原因と備考の列を出さない', () => {
    renderEditor(twoErrors)
    expect(screen.getByRole('button', { name: 'サポート向け' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.queryByLabelText('原因（仕様）（No.1）')).toBeNull()
    expect(screen.queryByLabelText('備考（No.1）')).toBeNull()
  })

  it('開発向けに切り替えると仕様レベルの原因と備考が出る', () => {
    renderEditor(twoErrors)
    fireEvent.click(screen.getByRole('button', { name: '開発向け' }))
    expect(screen.getByLabelText('原因（仕様）（No.1）')).not.toBeNull()
    expect(screen.getByLabelText('備考（No.1）')).not.toBeNull()
    // サポート向けの列は消えない（開発向けは上位集合）
    expect(screen.getByLabelText('原因（業務）（No.1）')).not.toBeNull()
  })

  it('切り替えてもデータは変わらない（onChange を呼ばない）', () => {
    const { onChange } = renderEditor(twoErrors)
    onChange.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '開発向け' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('ErrorCatalogEditor: 表示とフィルタ', () => {
  it('解決レベルは日本語ラベルで表示する', () => {
    renderEditor(twoErrors)
    const select = screen.getByLabelText('解決レベル（No.1）') as HTMLSelectElement
    expect(select.value).toBe('user')
    expect(screen.getAllByRole('option', { name: 'ユーザー対応' }).length).toBeGreaterThan(0)
  })

  it('解決レベルのボタンで絞り込める', () => {
    renderEditor(twoErrors)
    fireEvent.click(screen.getByRole('button', { name: 'エンジニア対応' }))
    const names = screen.getAllByLabelText(/^エラー名（/) as HTMLInputElement[]
    expect(names.map((n) => n.value)).toEqual(['保存に失敗する'])
  })

  it('検索は原因も横断する', () => {
    renderEditor(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: 'ログインできない', causeForSupport: '入力誤り' }),
        entry({ id: 'error_BBBBBBBBBB', name: '保存に失敗する' }),
      ]),
    )
    fireEvent.change(screen.getByLabelText('エラーを検索'), { target: { value: '入力誤り' } })
    const names = screen.getAllByLabelText(/^エラー名（/) as HTMLInputElement[]
    expect(names.map((n) => n.value)).toEqual(['ログインできない'])
  })
})

describe('ErrorCatalogEditor: エラーを追加ボタン', () => {
  it('押すと末尾に行が増える', () => {
    const { latest } = renderEditor(twoErrors)
    fireEvent.click(screen.getByRole('button', { name: 'エラーを追加' }))
    expect(latest()?.errors).toHaveLength(3)
    expect(latest()?.errors[2].name).toBe('新しいエラー')
    expect(latest()?.errors[0].name).toBe('ログインできない')
  })

  it('検索・フィルタ中は出さない（行の追加が無効な状態と揃える）', () => {
    renderEditor(twoErrors)
    fireEvent.change(screen.getByLabelText('エラーを検索'), { target: { value: 'できない' } })
    expect(screen.queryByRole('button', { name: 'エラーを追加' })).toBeNull()
  })
})

describe('ErrorCatalogEditor: 列幅', () => {
  it('→ で広げ、← で狭められる', () => {
    renderEditor(twoErrors)
    const handle = screen.getByRole('separator', { name: 'エラー名の列幅を変更' })
    const before = PROFILE_COLUMNS.support.defaultWidths[1]
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(errorColumnWidths.support.getSnapshot()[1]).toBe(before + RESIZE_STEP)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(errorColumnWidths.support.getSnapshot()[1]).toBe(before)
  })

  it('No 列にはハンドルを出さない（導出列なので幅を動かさない）', () => {
    renderEditor(twoErrors)
    expect(screen.queryByRole('separator', { name: 'Noの列幅を変更' })).toBeNull()
  })

  it('幅を持たない原因（業務）列にも、右隣を掴むハンドルが出る', () => {
    renderEditor(twoErrors)
    expect(screen.queryByRole('separator', { name: '原因（業務）の列幅を変更' })).not.toBeNull()
  })

  it('プロファイルごとに幅が独立している（列数が違うので1本では持てない）', () => {
    renderEditor(twoErrors)
    fireEvent.keyDown(screen.getByRole('separator', { name: 'エラー名の列幅を変更' }), {
      key: 'ArrowRight',
    })
    expect(errorColumnWidths.support.getSnapshot()[1]).not.toBe(
      PROFILE_COLUMNS.support.defaultWidths[1],
    )
    expect([...errorColumnWidths.dev.getSnapshot()]).toEqual([
      ...PROFILE_COLUMNS.dev.defaultWidths,
    ])
  })

  it('エディタを作り直しても幅が残る（ファイル切替をまたぐ）', () => {
    renderEditor(twoErrors)
    fireEvent.keyDown(screen.getByRole('separator', { name: 'エラー名の列幅を変更' }), {
      key: 'ArrowRight',
    })
    const widened = errorColumnWidths.support.getSnapshot()[1]
    cleanup()
    renderEditor(twoErrors)
    expect(errorColumnWidths.support.getSnapshot()[1]).toBe(widened)
  })
})

describe('ErrorCatalogEditor: モーダル表示中', () => {
  it('Enter で行が増えない（キーはモーダル側が取る。rev 10章の境界規則）', () => {
    renderEditor(twoErrors, true)
    fireEvent.keyDown(screen.getByLabelText('エラー名（No.1）'), { key: 'Enter' })
    expect(screen.getAllByLabelText(/^エラー名（/)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: 失敗を確認する**

```bash
npx vitest run src/modules/error-catalog/ErrorCatalogEditor.dom.test.tsx
```

Expected: FAIL（`./ErrorCatalogEditor` が解決できない）

- [ ] **Step 3: 実装を書く**

`src/modules/error-catalog/ErrorCatalogEditor.tsx`:

```tsx
import { useRef, useState } from 'react'
import { CellInput, type FieldState } from '@/components/CellInput'
import { buttonBase } from '@/components/button-styles'
import { useColumnResize } from '@/core/column-resize'
import {
  resolveCommand,
  toKeyEventLike,
  type Command,
  type KeyContext,
} from '@/core/keyboard/keymap'
import { altModifierLabel, currentPlatform } from '@/core/keyboard/platform'
import { buildErrorMarks, cellFace, hasError } from '@/core/list-editor/cell-face'
import { stepField } from '@/core/list-editor/field-step'
import { cellId, useListRows } from '@/core/list-editor/use-list-rows'
import { newId } from '@/core/new-id'
import type { EditorProps } from '@/core/registry'
import type { ErrorCatalogSchemaVersion1, ErrorEntry } from '@/types/error-catalog'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'
import {
  CAUSE_MIN_WIDTH,
  errorColumnWidths,
  MIN_COLUMN_WIDTH,
  RESIZE_STEP,
} from './column-widths'
import { NO_COLUMN_LABEL, PROFILE_COLUMNS } from './columns'
import { FIELD_LABELS, type ErrorField, type ProseField } from './fields'
import { PROFILES, SUPPORT_PROFILE, type ErrorProfile } from './profiles'
import { resolutionLabel } from './resolution-labels'
import { EMPTY_FILTER, filterErrorIndices, isDerivedView, type ErrorFilter } from './search'
import { isWarnCell } from './warnings'

// 解決レベルの選択肢はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂時に静かにずれる）
const LEVEL_OPTIONS = errorCatalogSchema.$defs.errorEntry.properties.resolutionLevel.enum

// フォーカスは面の塗り替えではなくリングで示す（M8 修正3）。エラー・未記入セルは
// bg-warning/20・/10 の面を警告として持っているので、フォーカスで背景を塗り替えると
// その警告表示が消えてしまう
const cellInput =
  'w-full resize-none overflow-y-auto bg-transparent px-2 py-1 text-ink outline-none rounded-sm align-middle focus:ring-2 focus:ring-inset focus:ring-ring'
// レベル2エラー（受け入れて赤表示）と warning はどちらも同系色の面で示し、
// 濃さで強度を区別する（M8 決定13。合成後のコントラストは palette.test.ts が機械検査する）
const errorCell = 'bg-warning/20'
const warnCell = 'bg-warning/10'

/** 列の境界の縦罫。先頭列（No）には引かない（M8 決定2） */
const colBorder = 'border-l border-grid'

const PLATFORM = currentPlatform()

/**
 * 新規行の既定のエラー名。空文字はスキーマ違反（minLength 1）なので置けない——
 * 空のまま自動保存が走ると、次に開けないファイルを自分で作ることになる
 */
const NEW_ERROR_NAME = '新しいエラー'

function newEntry(): ErrorEntry {
  return {
    id: newId('error'),
    name: NEW_ERROR_NAME,
    // 未記入は「まだ決めていない」であって「誰にも解決できない（none）」ではない
    resolutionLevel: 'undecided',
    occurrence: '',
    causeForSupport: '',
    causeForSpec: '',
    userAction: '',
    supportAction: '',
    engineerAction: '',
    notes: '',
  }
}

export function ErrorCatalogEditor({
  data,
  onChange,
  issues,
  modalOpen,
}: EditorProps<ErrorCatalogSchemaVersion1>) {
  // 表示プロファイルはエディタの state。切り替えてもデータは動かない（履歴も積まない）。
  // App は key={selected.path} でエディタを作り直すので、ファイルを切り替えると既定へ戻る
  const [profile, setProfile] = useState<ErrorProfile>(SUPPORT_PROFILE)
  const [filter, setFilter] = useState<ErrorFilter>(EMPTY_FILTER)

  const rows = useListRows<ErrorEntry>({
    items: data.errors,
    onItemsChange: (errors, mergeKey) => onChange({ ...data, errors }, mergeKey),
    makeItem: newEntry,
    firstField: 'name',
    // 0件の一覧に絞り込みを残す意味は無く、残すと導出表示扱いで
    //「エラーを追加」が出ずフォーカスの行き先が消える
    onEmptied: () => setFilter(EMPTY_FILTER),
  })
  const { rowKeys } = rows

  // 列と列幅ストアはプロファイルごとに引き分ける（列数が変わるので1本では持てない）
  const cols = PROFILE_COLUMNS[profile.id]
  const tableRef = useRef<HTMLDivElement>(null)
  const { widths, getHandleProps } = useColumnResize({
    store: errorColumnWidths[profile.id],
    minWidth: MIN_COLUMN_WIDTH,
    flexMinWidth: CAUSE_MIN_WIDTH,
    step: RESIZE_STEP,
    containerRef: tableRef,
  })

  const visible = filterErrorIndices(data.errors, filter)

  /** 散文フィールドの更新。resolutionLevel だけは enum なので別口 */
  const updateProse = (
    index: number,
    field: ProseField,
    value: string,
    mergeKey: string | null,
  ) => {
    const errors = data.errors.map((e, i) => {
      if (i !== index) return e
      const next: ErrorEntry = { ...e }
      next[field] = value
      return next
    })
    onChange({ ...data, errors }, mergeKey)
  }

  const updateLevel = (index: number, level: ErrorEntry['resolutionLevel']) => {
    const errors = data.errors.map((e, i) => (i === index ? { ...e, resolutionLevel: level } : e))
    onChange({ ...data, errors }, null)
  }

  // 導出表示中（検索・フィルタ適用中）は並び替えを止める（session-notes 2-5）
  const derivedView = isDerivedView(filter)
  const reorderEnabled = !derivedView

  /** 表示中の並びで n 番目の行の指定セルへフォーカスする */
  const focusVisible = (visiblePos: number, field: ErrorField): boolean => {
    const index = visible[visiblePos]
    if (index === undefined) return false
    return rows.focusCell(rowKeys[index], field)
  }

  /** コマンドをエラーカタログの構造へ写像する。戻り値 true＝消費した */
  const runCommand = (
    cmd: Command,
    at: { index: number; visiblePos: number; field: ErrorField },
  ): boolean => {
    switch (cmd) {
      case 'insert-item-after':
        // 導出表示中に挿入すると、絞り込みに掛からない行が見えないまま増える
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
      case 'focus-prev':
        return focusVisible(at.visiblePos - 1, at.field)
      case 'focus-next':
        return focusVisible(at.visiblePos + 1, at.field)
      case 'focus-next-field': {
        // 移動先はプロファイルの列順で決まる（サポート向けでは causeForSpec を飛ばす）
        const step = stepField(profile.fields, at.field, 1)
        return focusVisible(at.visiblePos + step.rowDelta, step.field)
      }
      case 'focus-prev-field': {
        const step = stepField(profile.fields, at.field, -1)
        return focusVisible(at.visiblePos + step.rowDelta, step.field)
      }
      case 'cancel':
        // 編集の打ち切り。フォーカスを外すと CellInput が確定値に戻す
        ;(document.activeElement as HTMLElement | null)?.blur()
        return true
      default:
        // undo / redo は額縁（App）のグローバル層が取る。ここでは消費しない
        return false
    }
  }

  /** セルのキー入力。キーの判定はコアの resolveCommand に委ねる（rev 10章） */
  const onCellKeyDown = (
    e: React.KeyboardEvent,
    at: { index: number; visiblePos: number; field: ErrorField },
    field: Pick<
      KeyContext,
      | 'editing'
      | 'fieldEmpty'
      | 'deletableField'
      | 'caretAtStart'
      | 'caretAtEnd'
      | 'arrowsOwnedByField'
    >,
  ) => {
    const cmd = resolveCommand(toKeyEventLike(e), {
      platform: PLATFORM,
      modalOpen,
      reorderEnabled,
      ...field,
    })
    if (cmd === null) return
    if (runCommand(cmd, at)) e.preventDefault()
  }

  /** テキストセル共通の文脈。空欄 Backspace の行削除はエラー名セルだけ認める */
  const textFieldContext = (state: FieldState, deletableField: boolean) => ({
    editing: true,
    fieldEmpty: state.empty,
    deletableField,
    caretAtStart: state.caretAtStart,
    caretAtEnd: state.caretAtEnd,
    arrowsOwnedByField: false,
  })

  // locations を「配列位置 → 赤表示するフィールド集合」に引き直す（コアの純関数）
  const marks = buildErrorMarks(issues)

  /** セルの面のクラス名。判定そのものは cell-face.ts の cellFace（純関数）が持つ */
  const cellClass = (index: number, field: ErrorField, warn: boolean): string => {
    const face = cellFace(marks, index, field, warn)
    return face === 'error' ? errorCell : face === 'warn' ? warnCell : ''
  }

  /** セルの中身。列ごとの違いはここ1箇所に閉じる */
  const cellNode = (
    at: { index: number; visiblePos: number; field: ErrorField },
    entry: ErrorEntry,
    rowKey: string,
  ) => {
    const field = at.field
    const label = `${FIELD_LABELS[field]}（No.${at.index + 1}）`
    if (field === 'resolutionLevel') {
      return (
        <>
          <select
            className={`${cellInput} appearance-none pr-6`}
            aria-label={label}
            data-cell={cellId(rowKey, field)}
            value={entry.resolutionLevel}
            onChange={(e) =>
              updateLevel(at.index, e.target.value as ErrorEntry['resolutionLevel'])
            }
            onKeyDown={(e) =>
              onCellKeyDown(e, at, {
                editing: false,
                fieldEmpty: false,
                deletableField: false,
                caretAtStart: true,
                caretAtEnd: true,
                // 素の↑↓は select の選択肢切り替えに使う（Alt+↑↓ は有効）
                arrowsOwnedByField: true,
              })
            }
          >
            {LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>
                {resolutionLabel(level)}
              </option>
            ))}
          </select>
          {/* appearance-none で消えた矢印を描き直す。背景画像の data URI は
              使わない——色値を書くことになり conventions.test.ts が弾く */}
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 fill-none stroke-current stroke-2 text-ink-muted"
          >
            <path d="M3 4.5 L6 7.5 L9 4.5" />
          </svg>
        </>
      )
    }
    if (field === 'name') {
      return (
        <CellInput
          className={cellInput}
          aria-label={label}
          data-cell={cellId(rowKey, field)}
          value={entry.name}
          // 空のエラー名はスキーマ違反（minLength 1）なのでデータに載せない
          sanitize={(raw) => (raw.trim() === '' ? null : raw)}
          onValueChange={(v) => updateProse(at.index, 'name', v, `${rowKey}:name`)}
          // エラー名セルだけが空欄 Backspace で行を消せる。他のセルは空が常態なので
          // そこで消えると事故になる
          onFieldKeyDown={(e, s) => onCellKeyDown(e, at, textFieldContext(s, true))}
        />
      )
    }
    return (
      <CellInput
        multiline
        className={`${cellInput} placeholder:text-ink-muted`}
        aria-label={label}
        data-cell={cellId(rowKey, field)}
        // 空欄は「未定義」と明示する（Markdown 出力が （未定義） と書く仕様と揃える）。
        // 備考だけは検知対象外の自由メモなので置かない
        placeholder={field === 'notes' ? undefined : '未定義'}
        value={entry[field]}
        onValueChange={(v) => updateProse(at.index, field, v, `${rowKey}:${field}`)}
        onFieldKeyDown={(e, s) => onCellKeyDown(e, at, textFieldContext(s, false))}
      />
    )
  }

  return (
    <div ref={rows.containerRef} className="p-4">
      <h2 className="mb-3 text-base font-bold text-ink">{data.title}</h2>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="エラーを検索"
          className="w-64 rounded-sm border border-rule bg-canvas px-2 py-1 text-sm text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
          placeholder="エラー名・原因・対応を検索"
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
        />
        <span className="text-xs text-ink-muted">表示</span>
        <div role="group" aria-label="表示プロファイル" className="flex items-center gap-1">
          {PROFILES.map((p) => {
            const active = p.id === profile.id
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                className={`${buttonBase} border border-rule px-2 py-1 text-xs ${
                  active ? 'bg-ink text-canvas' : 'bg-canvas text-ink hover:bg-surface'
                }`}
                onClick={() => setProfile(p)}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <span className="text-xs text-ink-muted">絞り込み</span>
        <div
          role="group"
          aria-label="解決レベルで絞り込む"
          className="flex flex-wrap items-center gap-1"
        >
          {LEVEL_OPTIONS.map((level) => {
            const active = filter.levels.includes(level)
            return (
              <button
                key={level}
                type="button"
                aria-pressed={active}
                className={`${buttonBase} border border-rule px-2 py-1 text-xs ${
                  active ? 'bg-ink text-canvas' : 'bg-canvas text-ink hover:bg-surface'
                }`}
                onClick={() =>
                  setFilter((f) => ({
                    ...f,
                    levels: active ? f.levels.filter((l) => l !== level) : [...f.levels, level],
                  }))
                }
              >
                {resolutionLabel(level)}
              </button>
            )
          })}
        </div>
        <span className="text-xs text-ink-muted">
          {visible.length} / {data.errors.length} 件
        </span>
        {!reorderEnabled && (
          <span className="text-xs text-ink-muted">
            検索・フィルタ中は行の追加（Enter）と並び替え（{altModifierLabel(PLATFORM)}+↑↓）を使えません
          </span>
        )}
      </div>
      {issues.length > 0 && (
        <ul className="mb-3 list-disc pl-5 text-sm text-warning">
          {issues.map((issue, i) => (
            <li key={`${issue.rule}-${i}`}>{issue.message}</li>
          ))}
        </ul>
      )}
      {/* テーブルは surface の面に載せ、外枠だけ rule で締める（M8 決定2）。
          **overflow を掛けない**——既定幅は横スクロールが出ない前提で決めてあり
          （columns.test.ts が検査）、overflow を足すと sticky の親が変わって
          見出しの固定が静かに壊れる */}
      <div ref={tableRef} className="border border-rule bg-surface">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            {cols.columns.map((col, i) => {
              const w = cols.widthIndex[i]
              return <col key={col.field} style={w === null ? undefined : { width: widths[w] }} />
            })}
          </colgroup>
          <thead>
            <tr className="text-left text-ink">
              {cols.columns.map((col, i) => {
                const w = cols.widthIndex[i]
                const label = col.field === 'no' ? NO_COLUMN_LABEL : FIELD_LABELS[col.field]
                const next = cols.nextWidthIndex(i)
                return (
                  <th
                    key={col.field}
                    // sticky 自体が絶対配置の包含ブロックになるので relative は要らない
                    className={`sticky top-0 z-10 border-b border-rule bg-surface-accent px-2 py-1 font-bold${i === 0 ? '' : ` ${colBorder}`}`}
                  >
                    {label}
                    {/* No 列は導出（データ配列の index+1）なのでハンドルを出さない。
                        幅を持たない原因（業務）列は、右隣の固定幅列を反転して掴む */}
                    {col.field === 'no' ? null : w !== null ? (
                      <span
                        {...getHandleProps(w)}
                        aria-label={`${label}の列幅を変更`}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-rule"
                      />
                    ) : (
                      next !== null && (
                        <span
                          {...getHandleProps(next, { invert: true })}
                          aria-label={`${label}の列幅を変更`}
                          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-rule"
                        />
                      )
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((index, visiblePos) => {
              const entry = data.errors[index]
              const rowKey = rowKeys[index]
              return (
                <tr
                  key={rowKey}
                  className={`border-b border-grid align-middle${hasError(marks, index, 'id') ? ` ${errorCell}` : ''}`}
                >
                  {/* No は編集対象ではない。データ配列の位置なので絞り込んでも動かない */}
                  <td className="px-2 py-1 text-ink-muted">{index + 1}</td>
                  {profile.fields.map((field) => (
                    <td
                      key={field}
                      className={`${colBorder}${field === 'resolutionLevel' ? ' relative' : ''} ${cellClass(index, field, isWarnCell(entry, field))}`}
                    >
                      {cellNode({ index, visiblePos, field }, entry, rowKey)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {data.errors.length > 0 && visible.length === 0 && (
        <p className="mt-3 text-sm text-ink-muted">該当するエラーがありません。</p>
      )}
      {!derivedView && (
        // **0件のときだけでなく常に出す。** 行の追加が Enter だけだと、
        // マウスで操作する人に手段が無い（rev 10章）
        <button
          ref={rows.addButtonRef}
          type="button"
          className={`${buttonBase} mt-3 border border-rule px-3 py-1 text-sm text-ink hover:bg-surface`}
          onClick={() => rows.insertAfter(data.errors.length - 1)}
        >
          エラーを追加
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/modules/error-catalog && npm test && npx tsc -b && npm run lint
```

Expected: PASS（DOM テストの `it` がすべて緑。既存テストも全件緑。型検査・lint も緑）

- [ ] **Step 5: コミット**

```bash
git add src/modules/error-catalog/ErrorCatalogEditor.tsx src/modules/error-catalog/ErrorCatalogEditor.dom.test.tsx
git commit -m "feat(error-catalog): エディタを追加する"
```

---

## Task 9: モジュール定義とレジストリ登録

**Files:**
- Create: `src/modules/error-catalog/migrate.ts`
- Create: `src/modules/error-catalog/module.ts`
- Modify: `src/modules/index.ts`（登録1行）
- Test: `src/modules/error-catalog/module.test.ts`

**Interfaces:**
- Consumes: `ToolModule` / `OutputProfile`（`@/core/registry`）、`JsonSchema`（`@/core/canonical`）、Task 1〜8 の成果物
- Produces: `errorCatalogModule: ToolModule<ErrorCatalogSchemaVersion1>`（`type: 'errorCatalog'` / `displayName: 'エラーカタログ'` / `idPrefixes: ['error']` / `singleton: true` / `outputs` は2本）、`migrateErrorCatalog(data, fromVersion)`

**このタスクで額縁のコードを一切書かない（決定18）。** 登録した瞬間に、`FileList` の新規作成メニュー（`appRegistry.list()` 由来）・単一性違反の検出（`module.singleton`）・出力ドロップダウン（`ExportMenu` が `outputs.length > 1` で切り替える）が自動で効く。**効かない箇所があれば、額縁を直すのではなく「計画の矛盾」として報告する**——決定18は「M9 の一般化が本当に効いているか」の検証を兼ねている。

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/error-catalog/module.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { serialize } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import { appRegistry } from '@/modules'
import type { ErrorCatalogSchemaVersion1 } from '@/types/error-catalog'
import { errorCatalogModule } from './module'

const validate = createSchemaValidator(errorCatalogModule.schema)

describe('errorCatalogModule', () => {
  it('規約1・単一性・ID プレフィクスを宣言している', () => {
    expect(errorCatalogModule.type).toBe('errorCatalog')
    expect(errorCatalogModule.displayName).toBe('エラーカタログ')
    expect(errorCatalogModule.schemaVersion).toBe(1)
    expect([...errorCatalogModule.idPrefixes]).toEqual(['error'])
    // プロジェクトにつき1ファイル（コア横断検証が singleton フラグだけを見る）
    expect(errorCatalogModule.singleton).toBe(true)
  })

  it('createEmpty はスキーマ検証を通り、正規形で書ける', () => {
    const empty = errorCatalogModule.createEmpty('エラーカタログ')
    expect(validate(empty).ok).toBe(true)
    expect(serialize(empty, errorCatalogModule.schema)).toBe(
      '{\n  "schemaVersion": 1,\n  "type": "errorCatalog",\n  "title": "エラーカタログ",\n  "errors": []\n}\n',
    )
  })

  it('マイグレータは恒等（初版なので旧版が存在しない）', () => {
    const data = errorCatalogModule.createEmpty('T')
    expect(errorCatalogModule.migrate(data, 1)).toBe(data)
  })
})

describe('出力プロファイル（規約5）', () => {
  it('2本を宣言し、id と fileSuffix が定義どおり', () => {
    expect(errorCatalogModule.outputs.map((o) => o.id)).toEqual(['support', 'dev'])
    expect(errorCatalogModule.outputs.map((o) => o.label)).toEqual(['サポート向け', '開発向け'])
    expect(errorCatalogModule.outputs.map((o) => o.fileSuffix)).toEqual([
      '-サポート向け',
      '-開発向け',
    ])
  })

  it('プロファイルごとに違う列で出す', () => {
    const data: ErrorCatalogSchemaVersion1 = {
      schemaVersion: 1,
      type: 'errorCatalog',
      title: 'T',
      errors: [
        {
          id: 'error_AAAAAAAAAA',
          name: 'E',
          occurrence: '',
          resolutionLevel: 'user',
          causeForSupport: '',
          causeForSpec: '仕様レベルの原因',
          userAction: '',
          supportAction: '',
          engineerAction: '',
          notes: '',
        },
      ],
    }
    const [support, dev] = errorCatalogModule.outputs
    expect(support.toMarkdown(data)).not.toContain('仕様レベルの原因')
    expect(dev.toMarkdown(data)).toContain('仕様レベルの原因')
  })
})

describe('レジストリ登録', () => {
  it('appRegistry から type で引ける（新規作成メニューに出る）', () => {
    expect(appRegistry.get('errorCatalog')).toBe(errorCatalogModule)
  })

  it('用語集の登録を壊していない', () => {
    expect(appRegistry.get('glossary')?.type).toBe('glossary')
    expect(appRegistry.list().map((m) => m.type)).toContain('errorCatalog')
  })
})
```

- [ ] **Step 2: 失敗を確認する**

```bash
npx vitest run src/modules/error-catalog/module.test.ts
```

Expected: FAIL（`./module` が解決できない）

- [ ] **Step 3: 実装を書く**

`src/modules/error-catalog/migrate.ts`:

```ts
import type { ErrorCatalogSchemaVersion1 } from '@/types/error-catalog'

/**
 * 規約6: マイグレータ。schemaVersion 1 が初版のため旧版が存在せず、
 * 恒等変換の枠だけを置く。schemaVersion 2 が生まれた時点で最初の変換を実装する
 *（occurrence を「手入力」から「参照からの導出」へ移すときが最有力候補。
 *  session-notes 3節の申し送り）
 */
export function migrateErrorCatalog(
  data: unknown,
  _fromVersion: number,
): ErrorCatalogSchemaVersion1 {
  return data as ErrorCatalogSchemaVersion1
}
```

`src/modules/error-catalog/module.ts`:

```ts
import type { JsonSchema } from '@/core/canonical'
import type { OutputProfile, ToolModule } from '@/core/registry'
import type { ErrorCatalogSchemaVersion1 } from '@/types/error-catalog'
import errorCatalogSchema from '../../../schemas/error-catalog.schema.json'
import { checkErrorCatalogConsistency } from './consistency'
import { ErrorCatalogEditor } from './ErrorCatalogEditor'
import { errorCatalogToMarkdown } from './markdown'
import { migrateErrorCatalog } from './migrate'
import { markdownFields, PROFILES } from './profiles'

/**
 * 規約5: 出力プロファイル。**列セットはプロファイル宣言から導出する**
 *（`markdownFields` が `resolutionLevel` を落とす）。ここに列を書き並べると
 * 画面の列と二重管理になり、片方だけ直したときに黙ってずれる
 */
const outputs: readonly OutputProfile<ErrorCatalogSchemaVersion1>[] = PROFILES.map((profile) => ({
  id: profile.id,
  label: profile.label,
  fileSuffix: profile.fileSuffix,
  toMarkdown: (data: ErrorCatalogSchemaVersion1) =>
    errorCatalogToMarkdown(data, markdownFields(profile)),
}))

export const errorCatalogModule: ToolModule<ErrorCatalogSchemaVersion1> = {
  type: 'errorCatalog',
  displayName: 'エラーカタログ',
  schemaVersion: 1,
  schema: errorCatalogSchema as JsonSchema,
  idPrefixes: ['error'],
  Editor: ErrorCatalogEditor,
  checkConsistency: checkErrorCatalogConsistency,
  outputs,
  // エラーカタログはプロジェクトにつき1つ（rev 5章の単一性）
  singleton: true,
  migrate: migrateErrorCatalog,
  // 新規プロジェクトでは0件が正常。エラーは行追加で増える
  createEmpty: (title) => ({ schemaVersion: 1, type: 'errorCatalog', title, errors: [] }),
}
```

`src/modules/index.ts`（既存ファイルへ2行足す。**用語集の行は動かさない**）:

```ts
import { createRegistry } from '@/core/registry'
import { errorCatalogModule } from './error-catalog/module'
import { glossaryModule } from './glossary/module'

/** アプリ全体で使うレジストリ。新ツールはここに register を1行足す（rev 6章）。 */
export const appRegistry = createRegistry()
appRegistry.register(glossaryModule)
appRegistry.register(errorCatalogModule)
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/modules/error-catalog && npm test && npx tsc -b && npm run lint
```

Expected: PASS（`module.test.ts` の `it` がすべて緑。**既存テストも全件緑**——特に `FileList.dom.test.tsx` と `external-change.test.ts` は `appRegistry` を使うので、登録が増えても壊れないことをここで確認する）

- [ ] **Step 5: コミット**

```bash
git add src/modules/error-catalog/migrate.ts src/modules/error-catalog/module.ts src/modules/error-catalog/module.test.ts src/modules/index.ts
git commit -m "feat(error-catalog): モジュールを登録して額縁から使えるようにする"
```

---

## Task 10: `CellInput` の行数上限を8にする

**Files:**
- Modify: `src/components/CellInput.tsx:11`（`MAX_ROWS`）

**Interfaces:**
- Consumes: なし
- Produces: なし（定数の変更。全モジュールの `multiline` セルに効く）

**テストを書かない理由（記録として残す）:** `MAX_ROWS` は `measure()` の中でしか使われず、`measure()` は **jsdom がレイアウトを持たない**（`scrollHeight` が常に 0、`lineHeight` が空文字）ため「測れないときは何もしない」で抜ける。したがって jsdom では行数の上限を観測できない。定数そのものを assert するテストは実装の写経であり、壊れたときに落ちる保証にならない。**確認は Task 11 の実機確認で行う。**

- [ ] **Step 1: 変更前に既存テストが緑であることを確認する**

```bash
npx vitest run src/components/CellInput.dom.test.tsx
```

Expected: PASS

- [ ] **Step 2: 定数とコメントを直す**

`src/components/CellInput.tsx` の10〜11行目を置き換える:

```ts
/**
 * 折り返しの上限。これを超えたらセル内スクロールに切り替わる。
 * M8 は5行で確定したが、エラーカタログ（M10 決定17）が8列を1440pxの窓に
 * 並べると1列170px前後になり、日本語で1行11文字・5行で55文字が上限になる。
 * 対応文の多くが内部スクロールに落ちるため8行へ上げた（88文字まで表示できる）。
 * 行の高さが揃わなくなるが、読めないよりよい。
 * **全モジュール共通の値**なので、用語集の定義・備考セルも8行まで伸びる
 */
const MAX_ROWS = 8
```

- [ ] **Step 3: 既存テストが緑のままであることを確認する**

```bash
npm test && npx tsc -b && npm run lint
```

Expected: すべて緑（jsdom では行数を観測しないので、既存の DOM テストは影響を受けない）

- [ ] **Step 4: コミット**

```bash
git add src/components/CellInput.tsx
git commit -m "feat(cell-input): 折り返しの上限を8行へ上げる"
```

---

## Task 11: 実機確認（**人間の作業**）

**Files:** なし（コード変更なし。結果を Task 12 の申し送りに書く）

サブエージェントは GUI を操作できない。**このタスクは人間が行う。**

- [ ] **Step 1: アプリを起動する**

```bash
npm install
npm run tauri dev
```

- [ ] **Step 2: 次の順で確認し、結果をメモする**

1. **新規作成**: サイドバーの「＋ エラーカタログを新規作成」が出ること。押すと `エラーカタログ.json` ができ、エディタが開くこと（決定18: 額縁は無改修で効く）
2. **入力**: 10行程度を入れる。Enter で行追加、Alt+↑↓ で並び替え、Tab でセル移動、空のエラー名で Backspace して行削除
3. **No 列**: 検索で絞り込んでも No が動かないこと（決定10）
4. **warning の見え方**: `resolutionLevel` を `undecided` にしたセルと、宣言したレベルの対応が空のセルだけが黄色いこと。**表の半分が黄色くなっていないこと**（決定14の目的）
   - あわせて**プレースホルダの「未定義」の見え方**を見る。いまの実装は `notes` 以外の空欄すべてに「未定義」を出すので、黄色くならないセル（例: `resolutionLevel: user` の行の「エンジニアの対応」）にも「未定義」と出る。**決定14 が「関与しないレベルは黄色くしない」と決めた意図と、この文言が食い違って見えないか**を実機で判断する（Task 8 のレビューが Minor として挙げた点。直すなら `placeholder={isWarnCell(entry, field) ? '未定義' : undefined}` の1行）
5. **赤の指摘**: エラー名を2件同じにすると赤くなり、issue 一覧に出ること。`user` を宣言して「ユーザーの対応」を空にすると、そのセルが赤くなること
6. **行数上限（決定17）**: 対応文に長文（100文字程度）を入れ、8行まで伸びてから内部スクロールになること。**初回マウントの体感**（行数ぶんの強制リフロー。`open-issues.md` 性能の項）が悪化していないか
7. **プロファイル切替**: サポート向け⇄開発向けで列が増減すること。**横スクロールが出ないこと**。各プロファイルの列幅が独立して保持されること
8. **書き出し**: 額縁のボタンがドロップダウンになり、「サポート向け」「開発向け」を選べること。書き出したファイル名が `エラーカタログ-サポート向け.md` / `エラーカタログ-開発向け.md` になること。コピーも同様に2択になること
9. **用語集が変わっていないこと**: 用語集を開き、ボタンが2つのまま（ドロップダウンになっていない）で、書き出し名が `<用語集のファイル名>.md` のままであること
10. **単一性違反**: エラーカタログをもう1つ作ろうとするとボタンが disabled であること。外部で2つ目を置いた状態でフォルダを開き直すと、単一性違反が表示されること
11. **外部変更の取り込み**: エディタで開いたまま外部エディタで `errors` を書き換え、取り込みが効くこと

- [ ] **Step 3: 実機確認の痕跡を捨てる**

```bash
git checkout -- sample-project/ && git clean -fd sample-project/
git status --short
```

Expected: 空（`sample-project/` の変更をコミットしない。CLAUDE.md の後片付け手順）

---

## Task 12: ドキュメント更新とマイルストーン完了

**Files:**
- Create: `docs/history/m10-error-catalog-editor.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`
- Modify: `docs/README.md`

- [ ] **Step 1: 申し送りを書く**

`docs/history/m10-error-catalog-editor.md` を新規作成する。冒頭に必ず次の但し書きを置く（他の `history/` と同じ形）:

```markdown
# M10 申し送り: エラーカタログエディタ

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。
```

続けて、**実装・レビュー・実機確認で新たに確定した事実だけ**を書く（設計の全体は設計スペック第 II 部にあるので繰り返さない）。最低限、次を含めること:

- M9 で引き上げた5つの機械（`duplicate` / `cell-face` / `columns` / `field-step` / `use-list-rows`）を2本目の実例が**実際にどう使ったか**——特に `stepField` はコア版（3引数）を直接呼んだこと（用語集のような1引数ラッパーを置かなかった理由：プロファイルによって列順が変わるため、束ねる「1つの並び」が存在しない）
- 「プロファイルはフィールドの並び1本だけを宣言し、画面の列と出力の列を導出する」という形が実装で成立したか。ずれた点があればそれ
- 列幅ストアをプロファイルごとに2本持った帰結
- No 列を導出にした帰結（ハンドルを出さない判断を含む）
- `CellInput` の8行化について、**実機で観測した体感**（Task 11 の6番）
- Task 11 の各項目の結果（特に7・8・9番）
- 実装中に見つかった想定外・繰り越した Minor
- rev への反映事項（Step 3 で実際に反映した内容）

- [ ] **Step 2: `open-issues.md` を更新する**

**解消したものを消し、新しく見つけたものを足す。** M10 の時点で分かっている追記は次の2件（`## 将来の機能を作った瞬間に踏むもの` と `## 性能` にそれぞれ足す）:

```markdown
- **エラー登録 Skill が無い**（`.claude/skills/`）: 用語集には `glossary-term-register` があるが、エラーカタログには対応物が無い。会議中に出たエラーを AI 経由で登録する動線が用語集にだけある状態。**アプリと Skill の正規形はバイト単位で一致していなければならない**ので、作るときは `scripts/` の書き出し実装をアプリの `serialize` と突き合わせること `[M10]`
```

```markdown
- **`CellInput` の行数上限を8にした影響**（`src/components/CellInput.tsx`）: 初回マウントの強制リフローのコストは行数に比例する（上の項目と同じ機構）。M10 の実機確認で体感が出なければ据え置き、出たら差分計算へ `[M10]`
```

さらに `## 小さな負債` へ1件足す（M10 で意図的に複製した箇所の記録）:

```markdown
- **エディタのキー処理が用語集とエラーカタログで二重化している**（`GlossaryEditor.tsx` / `ErrorCatalogEditor.tsx`）: `runCommand` の switch・`onCellKeyDown`・`textFieldContext`・セルの面のクラス定数（計 約80行）がほぼ同一。M10 は意図的に複製した——いま抽象を決めても、3本目（ロジックツリーは列を持たない図系）が必要とする形と一致する保証がないため（M9 決定1が万能フックを退けたのと同じ理由）。**3本目が列を持つツール（状態遷移の遷移表など）だったら、その時点で引き上げる。** 判断材料は「2本の差が3点（プロファイルトグル・列幅ストア2本・吸収列）に収まっているか」 `[M10]`
```

**`open-issues.md` 冒頭の「最終更新」を M10 完了時点に直す。** 既存の項目のうち、M10 で解消したものがあれば消す（規約8と `gen-types` の残骸掃除は**どちらも M10 では解消しない**ので残す——規約8は検知エンジンごと作るときの話であり、`gen-types` はスキーマを消す・作り直すときに踏む話で、M10 はスキーマを1本足しただけ）。実装中に別の残件を見つけていたらここへ足す。

- [ ] **Step 3: `overview-rev.md` へ反映する**

M10 で**実装が確定させた事実**を「正」へ書き戻す。次の2箇所:

1. **6章「拡張要件」の「出力は複数プロファイルを持てる」の項**に、実装確定を1行足す:

```markdown
  - **M10 で2プロファイルの実例が実装確定した**：モジュールが宣言するのは**フィールドの並び1本**（`profiles.ts`）で、画面の列（`No` ＋ `fields`）と出力の列（`No` ＋ `fields` から グルーピング軸を除いたもの）を**そこから導出する**。列セットを2箇所に書くと片方だけ直したときに黙ってずれるため、`OutputProfile`（コアの契約）には列を持たせず、列の関心はモジュール内に閉じる。
```

2. **6章「拡張要件」の「列を持つツールの共通機械はコアに置く（M9で確定）」の項**に、M10 で足した引き上げを書き加える:

```markdown
  **M10 で Markdown 表の整形（`src/core/markdown-table.ts`：セルのエスケープ・行と区切り行の組み立て・見出しの改行潰し）も加わった。** 表のセルのエスケープ規則は `normalizeForMatch`（照合規則）と同じく**アプリ内で1つだけ**——ツールごとに書き直すと、順序や改行の扱いが食い違って「あるツールの出力だけ表が割れる」という最悪の挙動になる。
```

3. **8章「出力はNotePM向けMarkdown」**の用語集の出力仕様の項の直後に、エラーカタログの実装確定を1項足す:

```markdown
- **エラーカタログの出力仕様（M10で実装し確定）**：見出し階層は用語集と同じ（`##`＝エンベロープの `title`、`###`＝`resolutionLevel` のグループ、h1不使用）。グループ順は**enumの定義順をスキーマから実行時に導出**、空のグループは見出しごと省略、グループ内はデータ配列順。列は `No` ＋ プロファイルの宣言から `resolutionLevel` を除いたもの（サポート向け7列／開発向け9列）。**`No` はデータ配列の位置（index+1）**であり、グループごとに振り直さない——画面のNoと出力のNoが食い違うと、会議中に口頭で指すための目印として使えなくなる。空フィールドは `（未定義）`、`undecided` は `未分類` グループとして**サポート向け出力でも省略しない**。備考の空欄だけは `（未定義）` にしない（検知対象外の自由メモ。用語集の備考と同じ扱い）。
```

**実装が上記と食い違っていたら、rev ではなく実装の方を疑い、判断が変わったなら rev の文面をその判断に合わせて書く**（rev は「正」であって、実装の後追いメモではない）。

- [ ] **Step 4: `docs/README.md` の履歴表に M10 を足す**

「マイルストーンの履歴」の表の末尾に1行足す:

```markdown
| [M10](history/m10-error-catalog-editor.md) | エラーカタログエディタ | エラーカタログ |
```

あわせて「ツールが増えたとき」の図が実態（`docs/error-catalog/` が既に存在する）と合っているかを確認し、ずれていれば直す。

- [ ] **Step 5: 全体の検証**

```bash
npm test && npx tsc -b && npm run lint
```

Expected: すべて緑。**出力を報告に貼ること。**

- [ ] **Step 6: コミット**

```bash
git add docs/
git commit -m "docs: M10 の申し送りと rev への反映を書く"
```

---

## M10 の完了条件（設計スペック 11節）

- [ ] スキーマ検証・整合性検証・Markdown 出力・エディタ操作の単体テストと DOM テストがある
- [ ] 用語集の既存テストが緑のまま。次で確認する:

```bash
git diff --stat origin/main -- src/modules/glossary
```

Expected: **`src/modules/glossary/markdown.ts` の1ファイルだけ**（Task 6 の委譲への載せ替え）。**テストファイルが1つも出ないこと**——用語集のテストが無変更のまま緑であることが、引き上げが振る舞いを保っている証拠になる

- [ ] `npm test && npx tsc -b && npm run lint` が緑
- [ ] 実機確認（Task 11）を終え、結果が申し送りに書かれている
- [ ] `docs/history/m10-error-catalog-editor.md` / `docs/open-issues.md` / `docs/overview-rev.md` / `docs/README.md` の4箇所を更新した
