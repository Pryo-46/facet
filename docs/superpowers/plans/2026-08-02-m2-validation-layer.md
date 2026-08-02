# M2: 検証レイヤの完成 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 整合性検証（レベル2＝受け入れて赤表示）・warning のセル単位可視化・プロジェクト全体の検証スコープ（ファイル一覧の赤バッジ）を完成させ、あわせて M1 の申し送り（close 時 flush／自動保存失敗の可視化／listOnly 文言／openFolder 失敗時 UI／レジストリ自己重複検査）を解消する。

**Architecture:** 整合性検証は rev 6章の責務内訳に従い2つに分かれる。**モジュール内検証**（ID重複・name重複・alias重複・alias/name衝突）は用語集モジュールの提供物（`src/modules/glossary/consistency.ts`）、**コア横断検証**（用語集の単一性違反）はコアの仕事（`src/core/project-consistency.ts`）。検証結果は共通型 `ConsistencyIssue`（コア）で表し、額縁（App）が走査時と編集時に計算してファイル一覧のバッジとエディタの赤表示に流す。ロジックはすべて純 TypeScript でユニットテスト可能にし、Tauri 依存（ウィンドウ close の横取り）は `src/fs/` のアダプタに隔離する。

**Tech Stack:** M1 と同じ（Tauri 2 ＋ Vite ＋ React 19 ＋ TypeScript strict ＋ Tailwind v4 ＋ Vitest。新規依存の追加なし）。

## Global Constraints

- **文字正規化（rev 5章）**: name 重複判定・alias 照合の規則は **NFKC ＋ 英字大文字小文字同一視のみ**。実装は `s.normalize('NFKC').toLowerCase()`。カナ同一視・送り仮名吸収はしない（判断はアルゴリズムでなくデータに置く）。ID の比較は正規化しない完全一致
- **レベル2は「受け入れて赤表示」**: 整合性検証の不合格でファイルを開けなくしない。編集は継続でき、人間がアプリ内で直せる（rev 5章）
- **スキーマの正は `schemas/glossary.schema.json` の1ファイル。コピーを作らない**
- **型は手書きしない**: `src/types/glossary.ts` は生成物（gitignore 済み、`pretest`/`predev` 等で自動再生成）
- **Rust を書かない。Tauri コマンドを追加しない**。capabilities は close 横取りに `core:window:allow-destroy` の1行追加のみ必要（最終レビューで判明。フォルダ走査は M1 で `recursive: true` の scope 導通済み）
- **色値の直書き禁止**: 役割トークン（`text-ink` / `text-warning` / `bg-warning` / `text-warning-fg` / `border-rule` / `bg-surface` / `text-ink-muted` / `bg-canvas` 等）のみ。`bg-warning/15` のような不透明度修飾はトークン由来なので可
- **読み込み・閲覧では書き戻さない**。書き込みは編集起点のみ（rev 5章）
- **Skill 側（`.claude/skills/glossary-term-register/`）は変更しない**。name 重複検査はアプリ側にのみ追加する（実装スコープ定義書 4節 M2。Skill スクリプトへの同検査の追加は別セッションの仕事として本計画のスコープ外）
- **M2 のスコープ外（実装しないこと)**: 表記ゆれの「指摘（suggestion）」レイヤ／参照切れ検証（参照する側のツールが無い）／キーボード操作・IME・Undo・検索（M3）／ファイル新規作成・削除・用語集自動生成（M4）／外部変更検知（M5）／Markdown 出力（M6）／色値の確定（M7）
- テストは Vitest（environment: node）。UI（App / GlossaryEditor）は DOM 環境を入れず、最終タスクの手動 E2E で検証する（M1 と同じ方針）
- コミットメッセージは日本語・`M2:` プレフィクス。各コミット末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` を付ける

## ファイル構成（M2 完了時。★=新規）

```
src/
  core/
    canonical.ts / canonical.test.ts        # 変更なし
    schema-validation.ts                    # 変更なし
    registry.ts                             # 変更: idPrefixes 自己重複検査＋規約スロット追加
    registry.test.ts                        # 変更
    load.ts                                 # 変更: 文言整備・rejected に type を追加
    load.test.ts                            # 変更
    autosave.ts                             # 変更: flush が成否を返す・onError/onSuccess
    autosave.test.ts                        # 変更
  ★ normalize.ts / normalize.test.ts        # 照合用文字正規化（NFKC＋小文字化）
  ★ consistency.ts                          # ConsistencyIssue 共通型（ロジックなし）
  ★ project-consistency.ts / .test.ts       # コア横断検証（単一性違反）
  modules/glossary/
    module.ts                               # 変更: displayName / checkConsistency / singleton
  ★ consistency.ts / consistency.test.ts    # モジュール内検証（4ルール）
    GlossaryEditor.tsx                      # 変更: 赤表示・warning セル・issue 一覧
  fs/
    project-fs.ts                           # 変更なし
  ★ app-window.ts                           # close 要求の横取り（Tauri アダプタ）
  App.tsx                                   # 変更: 検証配線・赤バッジ・close flush・openFolder 修正
sample-project-broken/                      # ★ 手動 E2E 用の壊れたプロジェクト一式
```

---

### Task 1: レジストリの idPrefixes 自己重複検査

M1 申し送り。`['term', 'term']` のような同一モジュール内の重複が検査をすり抜ける。2本目のモジュールを書く前に塞ぐ。

**Files:**
- Modify: `src/core/registry.ts`（`createRegistry` の `register` 内）
- Test: `src/core/registry.test.ts`

**Interfaces:**
- Consumes: 既存の `createRegistry` / `AnyToolModule`
- Produces: 変更なし（例外を投げるケースが1つ増えるだけ）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/registry.test.ts` の describe 内に追加:

```ts
  it('同一モジュール内の ID プレフィクス重複も例外', () => {
    const registry = createRegistry()
    expect(() => registry.register(fakeModule('glossary', ['term', 'term']))).toThrow(/term/)
  })
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/core/registry.test.ts`
Expected: FAIL（例外が投げられず assertion が落ちる）

- [ ] **Step 3: 最小実装**

`src/core/registry.ts` の `register` 内、既存の prefix 検査ループを次に置き換える:

```ts
      const seen = new Set<string>()
      for (const p of module.idPrefixes) {
        if (seen.has(p)) {
          throw new Error(`ID プレフィクスがモジュール内で重複しています: ${p}（${module.type}）`)
        }
        seen.add(p)
        const owner = prefixOwner.get(p)
        if (owner) {
          throw new Error(`ID プレフィクスが重複しています: ${p}（${owner} と ${module.type}）`)
        }
      }
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/registry.test.ts`
Expected: PASS（既存4件＋新規1件）

- [ ] **Step 5: コミット**

```bash
git add src/core/registry.ts src/core/registry.test.ts
git commit -m "M2: レジストリの idPrefixes 自己重複検査を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 読み込みパイプラインの文言整備と rejected への type 追加

M1 申し送り（`src/core/load.ts`）。分類は正しいが文言が不正確な箇所を直す。あわせて `rejected` にも `type` を持たせる。これは Task 5 の単一性検査が「スキーマ違反の用語集ファイル」も `type: glossary` として数えるために必要（単一性の仕様は「`type: glossary` のファイルが2つ以上」という物理条件。rev 5章）。

**Files:**
- Modify: `src/core/load.ts`
- Test: `src/core/load.test.ts`

**Interfaces:**
- Consumes: 既存の `classifyFile`
- Produces: `LoadResult` の rejected variant が `type: string | null` を持つ:

```ts
export type LoadResult =
  | { status: 'editable'; type: string; title: string; data: unknown }
  | { status: 'rejected'; type: string | null; title: string | null; reason: string; errors: string[] }
  | { status: 'listOnly'; type: string | null; title: string | null; reason: string }
```

（3 variant すべてが `type` を持つので、利用側は `result.type` で分岐なしに読める）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/load.test.ts` の describe 内に追加:

```ts
  it('type が非文字列なら「文字列ではありません」の文言で listOnly', () => {
    const result = classifyFile('{"type": 42, "title": "数値type"}', makeRegistry())
    expect(result.status).toBe('listOnly')
    if (result.status === 'listOnly') {
      expect(result.reason).toContain('文字列ではありません')
    }
  })

  it('schemaVersion 欠落は「ありません」の文言で listOnly（新版とは区別）', () => {
    const result = classifyFile('{"type": "glossary", "title": "版なし"}', makeRegistry())
    expect(result.status).toBe('listOnly')
    if (result.status === 'listOnly') {
      expect(result.reason).toContain('schemaVersion がありません')
    }
  })

  it('スキーマ違反の rejected も type を保持する（単一性検査が数えるため）', () => {
    const broken = JSON.parse(sampleRaw) as { terms: Record<string, unknown>[] }
    delete broken.terms[0].notes
    const result = classifyFile(JSON.stringify(broken), makeRegistry())
    expect(result.status).toBe('rejected')
    if (result.status === 'rejected') expect(result.type).toBe('glossary')
  })
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/core/load.test.ts`
Expected: FAIL 3件（文言不一致2件・type プロパティ欠落1件）

- [ ] **Step 3: 実装**

`src/core/load.ts` を修正:

1. JSON parse 失敗の return に `type: null,` を追加
2. 非オブジェクトの return に `type: null,` を追加
3. type の判定を「欠落」と「非文字列」に分ける（`title` 取得行の直後から）:

```ts
  if (!('type' in record)) {
    return {
      status: 'listOnly',
      type: null,
      title,
      reason: 'ツールのファイルではありません（type がありません）',
    }
  }
  if (type === null) {
    return {
      status: 'listOnly',
      type: null,
      title,
      reason: 'ツールのファイルではありません（type が文字列ではありません）',
    }
  }
```

4. schemaVersion の判定も「欠落」を先に分ける（`registry.get` 成功後）:

```ts
  if (!('schemaVersion' in record)) {
    return {
      status: 'listOnly',
      type,
      title,
      reason: 'schemaVersion がありません（このバージョンでは編集できません）',
    }
  }
  if (record.schemaVersion !== module.schemaVersion) {
    // （既存のまま）
```

5. スキーマ検証失敗の return に `type,` を追加

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/load.test.ts`
Expected: PASS（既存8件＋新規3件）

- [ ] **Step 5: 全テストと型チェック**

Run: `npm test && npx tsc -b`
Expected: すべて PASS（App.tsx は rejected の追加フィールドを読んでいないので壊れない）

- [ ] **Step 6: コミット**

```bash
git add src/core/load.ts src/core/load.test.ts
git commit -m "M2: listOnly/rejected の理由文言を整備し rejected に type を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 照合用の文字正規化（コア）

name 重複判定と alias 照合が共有する正規化規則（rev 5章: NFKC＋英字大文字小文字同一視のみ）。M3 の検索でも使う想定でコアに置く。

**Files:**
- Create: `src/core/normalize.ts`
- Test: `src/core/normalize.test.ts`

**Interfaces:**
- Consumes: なし（依存ゼロの純関数）
- Produces: `normalizeForMatch(s: string): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/normalize.test.ts` を作成:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeForMatch } from './normalize'

describe('normalizeForMatch', () => {
  it('全角英数を半角に揃える（NFKC）', () => {
    expect(normalizeForMatch('ＡＰＩ')).toBe('api')
  })

  it('英字の大文字小文字を同一視する', () => {
    expect(normalizeForMatch('OrderAPI')).toBe(normalizeForMatch('orderapi'))
  })

  it('半角カナを全角に揃える（NFKC）', () => {
    expect(normalizeForMatch('ｵｰﾀﾞｰ')).toBe('オーダー')
  })

  it('カナ同一視はしない（ひらがな・カタカナは別物のまま）', () => {
    expect(normalizeForMatch('おーだー')).not.toBe(normalizeForMatch('オーダー'))
  })

  it('日本語はそのまま', () => {
    expect(normalizeForMatch('受注')).toBe('受注')
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/core/normalize.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 最小実装**

`src/core/normalize.ts` を作成:

```ts
/**
 * 照合用の文字正規化（rev 5章）: NFKC ＋ 英字大文字小文字同一視のみ。
 * カナ同一視・送り仮名吸収はしない——恣意性が入るため、必要な表現は
 * alias に登録する運用に倒す（判断をアルゴリズムでなくデータに置く）。
 * name 重複判定と alias 照合はこの同じ規則を使うこと（規則を分けない）。
 */
export function normalizeForMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase()
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/normalize.test.ts`
Expected: PASS 5件

- [ ] **Step 5: コミット**

```bash
git add src/core/normalize.ts src/core/normalize.test.ts
git commit -m "M2: 照合用の文字正規化（NFKC＋英字大小同一視）を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 用語集のモジュール内整合性検証（4ルール）

M2 の本丸。ID重複／name重複（今回新設の検査）／alias重複（同一用語内・用語間）／alias と他用語の name 衝突。すべて純ロジックで、期待値が完全に決定的なテスト価値の高い箇所（実装スコープ定義書 5節）。

**Files:**
- Create: `src/core/consistency.ts`（共通型のみ）
- Create: `src/modules/glossary/consistency.ts`
- Test: `src/modules/glossary/consistency.test.ts`

**Interfaces:**
- Consumes: `normalizeForMatch`（Task 3）、生成型 `GlossarySchemaVersion1` / `Term`
- Produces:
  - `src/core/consistency.ts`:

```ts
export interface ConsistencyLocation {
  /** 該当エンティティの ID */
  entityId: string
  /** セルまで特定できる場合のフィールド名。'id' は「行全体」の意味で使う（ID 列は UI に無い） */
  field: string | null
}

export interface ConsistencyIssue {
  /** ルール識別子（安定。テストと UI が参照する） */
  rule: string
  /** 人間向けの日本語メッセージ（ファイル一覧・エディタに表示） */
  message: string
  /** 赤表示すべき箇所。ファイル単位の問題（単一性違反など）は空配列 */
  locations: ConsistencyLocation[]
}
```

  - `src/modules/glossary/consistency.ts`: `checkGlossaryConsistency(data: GlossarySchemaVersion1): ConsistencyIssue[]`
  - rule 識別子（後続タスクとテストが参照する固定値）: `'duplicate-id'` / `'duplicate-name'` / `'duplicate-alias'` / `'alias-name-collision'`

- [ ] **Step 1: 共通型を書く（ロジックなし・テスト対象外）**

`src/core/consistency.ts` を作成:

```ts
/**
 * 整合性検証（レベル2＝受け入れて赤表示。rev 5章）の共通型。
 * スキーマ検証（レベル1）と違い、不合格でもファイルは開けて編集を継続できる。
 * 検証ロジックは2箇所に分かれる（rev 6章の責務内訳）:
 * - モジュール内検証: 自ファイルで完結する検証。各モジュールの checkConsistency
 * - コア横断検証: 単一ファイルでは判定できない検証。core/project-consistency.ts
 */
export interface ConsistencyLocation {
  /** 該当エンティティの ID */
  entityId: string
  /** セルまで特定できる場合のフィールド名。'id' は「行全体」の意味で使う（ID 列は UI に無い） */
  field: string | null
}

export interface ConsistencyIssue {
  /** ルール識別子（安定。テストと UI が参照する） */
  rule: string
  /** 人間向けの日本語メッセージ（ファイル一覧・エディタに表示） */
  message: string
  /** 赤表示すべき箇所。ファイル単位の問題（単一性違反など）は空配列 */
  locations: ConsistencyLocation[]
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/modules/glossary/consistency.test.ts` を作成:

```ts
import { describe, expect, it } from 'vitest'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import { checkGlossaryConsistency } from './consistency'

function term(over: Partial<Term> & { id: string; name: string }): Term {
  return { kind: 'other', definition: '定義あり', aliases: [], notes: '', ...over }
}

function glossary(terms: Term[]): GlossarySchemaVersion1 {
  return { schemaVersion: 1, type: 'glossary', title: 'テスト用語集', terms }
}

describe('checkGlossaryConsistency', () => {
  it('問題のないデータは issue なし', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['オーダー'] }),
      term({ id: 'term_bbbbbbbbbb', name: '発注' }),
    ])
    expect(checkGlossaryConsistency(data)).toEqual([])
  })

  it('ID 重複を検出する（行全体の赤表示として field は id）', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
      term({ id: 'term_aaaaaaaaaa', name: '発注' }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('duplicate-id')
    expect(issues[0].locations).toEqual([{ entityId: 'term_aaaaaaaaaa', field: 'id' }])
  })

  it('name 重複を NFKC＋大文字小文字同一視で検出する', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: 'API連携' }),
      term({ id: 'term_bbbbbbbbbb', name: 'ＡＰＩ連携' }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('duplicate-name')
    expect(issues[0].locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', field: 'name' },
      { entityId: 'term_bbbbbbbbbb', field: 'name' },
    ])
  })

  it('表記が完全一致しない name は重複にしない', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
      term({ id: 'term_bbbbbbbbbb', name: '受注データ' }),
    ])
    expect(checkGlossaryConsistency(data)).toEqual([])
  })

  it('同一用語内の alias 重複を検出する', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '顧客', aliases: ['クライアント', 'クライアント'] }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('duplicate-alias')
    expect(issues[0].locations).toEqual([{ entityId: 'term_aaaaaaaaaa', field: 'aliases' }])
  })

  it('用語間の alias 重複を検出する', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '案件', aliases: ['取引'] }),
      term({ id: 'term_bbbbbbbbbb', name: '商談', aliases: ['取引'] }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('duplicate-alias')
    expect(issues[0].locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', field: 'aliases' },
      { entityId: 'term_bbbbbbbbbb', field: 'aliases' },
    ])
  })

  it('alias と他用語の name の衝突を検出する（両側の箇所を指す）', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
      term({ id: 'term_bbbbbbbbbb', name: '見積', aliases: ['受注'] }),
    ])
    const issues = checkGlossaryConsistency(data)
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('alias-name-collision')
    expect(issues[0].locations).toEqual([
      { entityId: 'term_bbbbbbbbbb', field: 'aliases' },
      { entityId: 'term_aaaaaaaaaa', field: 'name' },
    ])
  })

  it('自用語の name と同じ alias は衝突にしない', () => {
    const data = glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['受注'] })])
    expect(checkGlossaryConsistency(data)).toEqual([])
  })

  it('複数種類の問題は全部まとめて返す', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
    ])
    const rules = checkGlossaryConsistency(data).map((i) => i.rule)
    expect(rules).toContain('duplicate-id')
    expect(rules).toContain('duplicate-name')
  })
})
```

- [ ] **Step 3: テストが落ちることを確認する**

Run: `npm test -- src/modules/glossary/consistency.test.ts`
Expected: FAIL（`./consistency` が存在しない）

- [ ] **Step 4: 実装**

`src/modules/glossary/consistency.ts` を作成:

```ts
import type { ConsistencyIssue } from '@/core/consistency'
import { normalizeForMatch } from '@/core/normalize'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'

/**
 * 用語集のモジュール内検証（規約4。rev 6章の責務内訳の「モジュール内」側）。
 * 自ファイルで完結する検証のみ。単一性違反はコア横断検証の管轄。
 * alias 系は表記ゆれ検知の照合データ自体の矛盾として扱う（session-notes 論点5）。
 */
export function checkGlossaryConsistency(data: GlossarySchemaVersion1): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const terms = data.terms

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）
  const idCount = new Map<string, number>()
  for (const t of terms) idCount.set(t.id, (idCount.get(t.id) ?? 0) + 1)
  for (const [id, count] of idCount) {
    if (count > 1) {
      issues.push({
        rule: 'duplicate-id',
        message: `ID が重複しています（${count}件）: ${id}`,
        locations: [{ entityId: id, field: 'id' }],
      })
    }
  }

  // name 重複（同名2件は「この語を正式名とする」宣言としての矛盾。rev 5章）
  const byName = new Map<string, Term[]>()
  for (const t of terms) {
    const key = normalizeForMatch(t.name)
    byName.set(key, [...(byName.get(key) ?? []), t])
  }
  for (const group of byName.values()) {
    if (group.length > 1) {
      issues.push({
        rule: 'duplicate-name',
        message: `名称が重複しています: ${group.map((t) => `「${t.name}」`).join(' と ')}`,
        locations: group.map((t) => ({ entityId: t.id, field: 'name' })),
      })
    }
  }

  // alias 重複（同一用語内・用語間の両方を1つのルールで扱う）
  const aliasOwners = new Map<string, { term: Term; alias: string }[]>()
  for (const t of terms) {
    for (const alias of t.aliases) {
      const key = normalizeForMatch(alias)
      aliasOwners.set(key, [...(aliasOwners.get(key) ?? []), { term: t, alias }])
    }
  }
  for (const owners of aliasOwners.values()) {
    if (owners.length > 1) {
      const uniqueTermIds = [...new Set(owners.map((o) => o.term.id))]
      issues.push({
        rule: 'duplicate-alias',
        message: `別名「${owners[0].alias}」が重複しています（${owners.length}件）`,
        locations: uniqueTermIds.map((id) => ({ entityId: id, field: 'aliases' })),
      })
    }
  }

  // alias と他用語の name の衝突（自用語の name は対象外。
  // 正式名そのものを alias に持つのは冗長ではあるが矛盾ではない）
  for (const t of terms) {
    for (const alias of t.aliases) {
      for (const other of byName.get(normalizeForMatch(alias)) ?? []) {
        if (other.id === t.id) continue
        issues.push({
          rule: 'alias-name-collision',
          message: `「${t.name}」の別名「${alias}」が用語「${other.name}」の名称と衝突しています`,
          locations: [
            { entityId: t.id, field: 'aliases' },
            { entityId: other.id, field: 'name' },
          ],
        })
      }
    }
  }

  return issues
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npm test -- src/modules/glossary/consistency.test.ts`
Expected: PASS 9件

- [ ] **Step 6: コミット**

```bash
git add src/core/consistency.ts src/modules/glossary/consistency.ts src/modules/glossary/consistency.test.ts
git commit -m "M2: 用語集のモジュール内整合性検証（ID/name/alias の4ルール）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: モジュール規約の拡張とコア横断検証（単一性違反）

`ToolModule` に規約4のスロット（`checkConsistency`）を足し、用語集モジュールに配線する。あわせて「プロジェクトにつき1ファイル」を宣言する `singleton` フラグと、コア側の横断検証（singleton な type のファイルが2つ以上→全該当ファイルに issue）を実装する。エラーメッセージ用に `displayName` も追加する（M4 の新規作成 UI でも使う）。

**Files:**
- Modify: `src/core/registry.ts`（`ToolModule` インターフェイス）
- Modify: `src/modules/glossary/module.ts`
- Modify: `src/core/registry.test.ts` / `src/core/load.test.ts`（フェイクモジュールに新フィールド追加）
- Create: `src/core/project-consistency.ts`
- Test: `src/core/project-consistency.test.ts`

**Interfaces:**
- Consumes: `ConsistencyIssue`（Task 4）、`checkGlossaryConsistency`（Task 4）
- Produces:
  - `ToolModule` に追加されるフィールド（すべて必須）:

```ts
  /** 一覧・エラーメッセージで使う表示名（例: 用語集） */
  displayName: string
  /** 規約4: 整合性検証ルール（モジュール内検証。レベル2＝受け入れて赤表示） */
  checkConsistency: (data: TData) => ConsistencyIssue[]
  /** プロジェクト内に同 type のファイルを1つしか許さないか（コア横断検証が使う） */
  singleton: boolean
```

  - `src/core/project-consistency.ts`:

```ts
export interface ProjectFileEntry {
  path: string
  /** classifyFile が読み取った type（読めなかったファイルは null） */
  type: string | null
}

export function checkProjectConsistency(
  files: ProjectFileEntry[],
  registry: ModuleRegistry,
): Map<string, ConsistencyIssue[]>  // キーは path。issue の rule は 'singleton-violation'
```

- [ ] **Step 1: ToolModule を拡張する**

`src/core/registry.ts` の先頭に import を追加し、`ToolModule` にフィールドを足す:

```ts
import type { ConsistencyIssue } from './consistency'
```

`ToolModule` の `schemaVersion` の後に:

```ts
  /** 一覧・エラーメッセージで使う表示名（例: 用語集） */
  displayName: string
```

`Editor` の後に:

```ts
  /** 規約4: 整合性検証ルール（モジュール内検証。レベル2＝受け入れて赤表示） */
  checkConsistency: (data: TData) => ConsistencyIssue[]
  /** プロジェクト内に同 type のファイルを1つしか許さないか（コア横断検証が使う） */
  singleton: boolean
```

- [ ] **Step 2: 既存のフェイクモジュールと用語集モジュールを追随させる**

`src/core/registry.test.ts` の `fakeModule`:

```ts
function fakeModule(type: string, prefixes: string[]): AnyToolModule {
  return {
    type,
    displayName: type,
    schemaVersion: 1,
    schema: {},
    idPrefixes: prefixes,
    Editor: () => null,
    checkConsistency: () => [],
    singleton: false,
    migrate: (d) => d,
  }
}
```

`src/core/load.test.ts` の `makeRegistry` 内の `mod` にも同じ3フィールド（`displayName: 'glossary'` / `checkConsistency: () => []` / `singleton: false`）を追加。

`src/modules/glossary/module.ts`:

```ts
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { GlossarySchemaVersion1 } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { checkGlossaryConsistency } from './consistency'
import { GlossaryEditor } from './GlossaryEditor'
import { migrateGlossary } from './migrate'

export const glossaryModule: ToolModule<GlossarySchemaVersion1> = {
  type: 'glossary',
  displayName: '用語集',
  schemaVersion: 1,
  schema: glossarySchema as JsonSchema,
  idPrefixes: ['term'],
  Editor: GlossaryEditor,
  checkConsistency: checkGlossaryConsistency,
  // 用語集はハブなのでプロジェクトにつき1つ（rev 5章の単一性）
  singleton: true,
  migrate: migrateGlossary,
}
```

Run: `npm test && npx tsc -b`
Expected: すべて PASS（コンパイルが通ることを確認してから次へ）

- [ ] **Step 3: コア横断検証の失敗するテストを書く**

`src/core/project-consistency.test.ts` を作成:

```ts
import { describe, expect, it } from 'vitest'
import { checkProjectConsistency } from './project-consistency'
import { createRegistry, type AnyToolModule } from './registry'

function fakeModule(type: string, singleton: boolean): AnyToolModule {
  return {
    type,
    displayName: type === 'glossary' ? '用語集' : type,
    schemaVersion: 1,
    schema: {},
    idPrefixes: [type],
    Editor: () => null,
    checkConsistency: () => [],
    singleton,
    migrate: (d) => d,
  }
}

function makeRegistry() {
  const registry = createRegistry()
  registry.register(fakeModule('glossary', true))
  registry.register(fakeModule('sequence', false))
  return registry
}

describe('checkProjectConsistency', () => {
  it('singleton の type が1ファイルだけなら issue なし', () => {
    const out = checkProjectConsistency(
      [{ path: 'C:\\p\\glossary.json', type: 'glossary' }],
      makeRegistry(),
    )
    expect(out.size).toBe(0)
  })

  it('singleton の type が2ファイルあると両方に singleton-violation が付く', () => {
    const out = checkProjectConsistency(
      [
        { path: 'C:\\p\\a.json', type: 'glossary' },
        { path: 'C:\\p\\b.json', type: 'glossary' },
        { path: 'C:\\p\\seq.json', type: 'sequence' },
      ],
      makeRegistry(),
    )
    expect([...out.keys()].sort()).toEqual(['C:\\p\\a.json', 'C:\\p\\b.json'])
    const issue = out.get('C:\\p\\a.json')![0]
    expect(issue.rule).toBe('singleton-violation')
    expect(issue.message).toContain('用語集')
    expect(issue.message).toContain('2件')
    expect(issue.locations).toEqual([])
  })

  it('singleton でない type は複数あっても issue なし', () => {
    const out = checkProjectConsistency(
      [
        { path: 'C:\\p\\s1.json', type: 'sequence' },
        { path: 'C:\\p\\s2.json', type: 'sequence' },
      ],
      makeRegistry(),
    )
    expect(out.size).toBe(0)
  })

  it('未知の type と type null は対象外（クラッシュしない）', () => {
    const out = checkProjectConsistency(
      [
        { path: 'C:\\p\\x1.json', type: 'unknownTool' },
        { path: 'C:\\p\\x2.json', type: 'unknownTool' },
        { path: 'C:\\p\\plain.json', type: null },
      ],
      makeRegistry(),
    )
    expect(out.size).toBe(0)
  })
})
```

- [ ] **Step 4: テストが落ちることを確認する**

Run: `npm test -- src/core/project-consistency.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 5: 実装**

`src/core/project-consistency.ts` を作成:

```ts
import type { ConsistencyIssue } from './consistency'
import type { ModuleRegistry } from './registry'

export interface ProjectFileEntry {
  path: string
  /** classifyFile が読み取った type（読めなかったファイルは null） */
  type: string | null
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * コア横断検証（rev 6章の責務内訳の「コア」側）。単一ファイルでは判定できない検証。
 * 現状は singleton モジュールの単一性違反（用語集の単一性。rev 5章）のみ。
 * rejected / listOnly のファイルも type が読めていれば数える——仕様は
 * 「type: glossary のファイルが2つ以上」という物理条件であり、
 * 壊れた用語集ファイルも「どちらを正とするか」の人間の判断対象に含まれるため。
 */
export function checkProjectConsistency(
  files: ProjectFileEntry[],
  registry: ModuleRegistry,
): Map<string, ConsistencyIssue[]> {
  const byType = new Map<string, ProjectFileEntry[]>()
  for (const f of files) {
    if (f.type === null) continue
    byType.set(f.type, [...(byType.get(f.type) ?? []), f])
  }
  const out = new Map<string, ConsistencyIssue[]>()
  for (const [type, group] of byType) {
    const module = registry.get(type)
    if (!module?.singleton || group.length <= 1) continue
    const names = group.map((f) => fileName(f.path)).join('、')
    const issue: ConsistencyIssue = {
      rule: 'singleton-violation',
      message: `${module.displayName}のファイルがプロジェクトに${group.length}件あります（1つにしてください）: ${names}`,
      locations: [],
    }
    for (const f of group) out.set(f.path, [issue])
  }
  return out
}
```

- [ ] **Step 6: 全テストが通ることを確認する**

Run: `npm test && npx tsc -b`
Expected: すべて PASS

- [ ] **Step 7: コミット**

```bash
git add src/core/registry.ts src/core/registry.test.ts src/core/load.test.ts src/core/project-consistency.ts src/core/project-consistency.test.ts src/modules/glossary/module.ts
git commit -m "M2: モジュール規約に整合性検証スロットを追加しコア横断検証（単一性）を実装

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 額縁の検証配線（全ファイル検証・赤バッジ・編集時の再検証）

プロジェクトを開いた時点でフォルダ内全ファイルの issue を計算し、ファイル一覧に赤バッジ（件数）を出す。編集のたびに開いているファイルの issue を再計算する（rev 5章「ファイル変更を契機に再検証」の自己編集側。外部変更側は M5）。エディタには `issues` を props で渡す。

**Files:**
- Modify: `src/core/registry.ts`（`EditorProps` に `issues` を追加）
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `checkProjectConsistency`（Task 5）、`module.checkConsistency`（Task 5）、`LoadResult.type`（Task 2）
- Produces:
  - `EditorProps` の新形（Task 7 の GlossaryEditor が受け取る）:

```ts
export interface EditorProps<TData> {
  data: TData
  onChange: (next: TData) => void
  /** このファイルの整合性検証結果（レベル2）。エディタはセル・行の赤表示に使う */
  issues: ConsistencyIssue[]
}
```

  - `App.tsx` 内 `ProjectFile` の新形: `{ path: string; name: string; result: LoadResult; issues: ConsistencyIssue[] }`

（UI 配線のためユニットテストなし。検証は Step 5 の型チェックと Task 11 の手動 E2E）

- [ ] **Step 1: EditorProps に issues を追加する**

`src/core/registry.ts` の `EditorProps`:

```ts
export interface EditorProps<TData> {
  data: TData
  onChange: (next: TData) => void
  /** このファイルの整合性検証結果（レベル2）。エディタはセル・行の赤表示に使う */
  issues: ConsistencyIssue[]
}
```

（`GlossaryEditor` は props を分割代入で受けているだけなので、この時点ではコンパイルが通る。使うのは Task 7）

- [ ] **Step 2: App に issue 計算を足す**

`src/App.tsx` に import を追加:

```ts
import type { ConsistencyIssue } from '@/core/consistency'
import { checkProjectConsistency } from '@/core/project-consistency'
```

`ProjectFile` を変更:

```ts
interface ProjectFile {
  path: string
  name: string
  result: LoadResult
  /** モジュール内検証＋コア横断検証の結果（レベル2）。一覧バッジとエディタ赤表示に使う */
  issues: ConsistencyIssue[]
}
```

`fileName` の下にモジュールレベルの関数を追加:

```ts
/** 全ファイルの整合性検証（レベル2）をやり直す。走査時と編集時の両方から呼ぶ */
function computeIssues(files: ProjectFile[]): ProjectFile[] {
  const cross = checkProjectConsistency(
    files.map((f) => ({ path: f.path, type: f.result.type })),
    appRegistry,
  )
  return files.map((f) => {
    const local =
      f.result.status === 'editable'
        ? (appRegistry.get(f.result.type)?.checkConsistency(f.result.data) ?? [])
        : []
    return { ...f, issues: [...local, ...(cross.get(f.path) ?? [])] }
  })
}
```

- [ ] **Step 3: 走査・選択・編集の3経路に配線する**

`openFolder` 内、`loaded.push(...)` を issues 付きに変え、`setFiles` を `computeIssues` 経由にする:

```ts
        loaded.push({ path, name: fileName(path), result: classifyFile(text, appRegistry), issues: [] })
```

```ts
      setFiles(computeIssues(loaded))
```

`selectFile` 内、再読込結果の反映も `computeIssues` 経由にする:

```ts
      setFiles((prev) =>
        computeIssues(prev.map((f) => (f.path === file.path ? { ...f, result } : f))),
      )
```

エディタの `onChange` を、編集内容を `files` にも同期して再検証する形にする:

```tsx
                onChange={(next: unknown) => {
                  setEditingData(next)
                  saverRef.current?.update(serialize(next, selectedModule.schema))
                  // 編集を契機に整合性検証をやり直す（rev 5章の「自己編集」側。外部変更は M5）
                  setFiles((prev) =>
                    computeIssues(
                      prev.map((f) =>
                        f.path === selected.path && f.result.status === 'editable'
                          ? { ...f, result: { ...f.result, data: next } }
                          : f,
                      ),
                    ),
                  )
                }}
```

- [ ] **Step 4: 一覧バッジとエディタへの受け渡しを足す**

ファイル一覧の status 表示部分を次に置き換える（issue 件数バッジは status を問わず出す）:

```tsx
                    <span className="block text-xs text-ink-muted">
                      {file.result.status === 'editable' && file.result.title}
                      {file.result.status === 'rejected' && (
                        <span className="text-warning">開けない</span>
                      )}
                      {file.result.status === 'listOnly' && '編集不可'}
                      {file.issues.length > 0 && (
                        <span className="ml-1 rounded-sm bg-warning px-1 text-xs text-warning-fg">
                          {file.issues.length}
                        </span>
                      )}
                    </span>
```

エディタ描画に `issues` を渡す:

```tsx
              <selectedModule.Editor
                key={selected.path}
                data={editingData}
                issues={selected.issues}
                onChange={...（Step 3 のとおり）}
              />
```

`listOnly` / `rejected` を選択中でも issue（単一性違反など）が見えるように、rejected ブロックの手前に追加:

```tsx
          {selected && selected.result.status !== 'editable' && selected.issues.length > 0 && (
            <ul className="list-disc px-6 pt-4 pl-10 text-sm text-warning">
              {selected.issues.map((issue, i) => (
                <li key={`${issue.rule}-${i}`}>{issue.message}</li>
              ))}
            </ul>
          )}
```

- [ ] **Step 5: 型チェックと全テスト**

Run: `npm test && npx tsc -b`
Expected: すべて PASS

- [ ] **Step 6: コミット**

```bash
git add src/core/registry.ts src/App.tsx
git commit -m "M2: 額縁の検証配線（走査時・編集時の再検証とファイル一覧の赤バッジ）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 用語集エディタの赤表示と warning セル

issue の `locations` をセル・行の赤表示に変換し、issue メッセージ一覧を表の上に出す。あわせて warning のセル単位可視化（`kind === "undecided"` → 種別セル、`definition === ""` → 定義セル）を入れる。エラー（レベル2・面の赤 `bg-warning/15`）と warning（点線下線 `border-dashed border-warning`）は強度で区別する（見た目の確定は M7）。

**Files:**
- Modify: `src/modules/glossary/GlossaryEditor.tsx`

**Interfaces:**
- Consumes: `EditorProps.issues`（Task 6）、issue の field 値 `'id'`（行全体）/ `'name'` / `'aliases'`（Task 4）
- Produces: なし（表示のみ）

（UI のためユニットテストなし。Task 11 の手動 E2E で fixture を使って検証）

- [ ] **Step 1: 実装**

`src/modules/glossary/GlossaryEditor.tsx` を次の内容に置き換える:

```tsx
import type { EditorProps } from '@/core/registry'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'

// 種別の選択肢はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂時に静かにずれる）
const KIND_OPTIONS = glossarySchema.$defs.term.properties.kind.enum

// M1 の別名セルは読点・カンマ区切りの1入力欄（暫定）。M3 で操作性ごと作り直す
function parseAliases(raw: string): string[] {
  return raw
    .split(/[、,]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const cellInput =
  'w-full bg-transparent px-2 py-1 text-ink outline-none focus:bg-surface rounded-sm'
// レベル2エラー（受け入れて赤表示）はセルの面で示す
const errorCell = 'bg-warning/15'
// warning（undecided / 未定義）はエラーより弱い点線下線。見た目の確定は M7
const warnInput = 'border-b border-dashed border-warning'

export function GlossaryEditor({ data, onChange, issues }: EditorProps<GlossarySchemaVersion1>) {
  const updateTerm = (index: number, patch: Partial<Term>) => {
    const terms = data.terms.map((t, i) => (i === index ? { ...t, ...patch } : t))
    onChange({ ...data, terms })
  }

  // locations を「entityId → 赤表示するフィールド集合」に引き直す。
  // field 'id' は ID 列が UI に無いため行全体の赤表示として扱う
  const marks = new Map<string, Set<string>>()
  for (const issue of issues) {
    for (const loc of issue.locations) {
      const set = marks.get(loc.entityId) ?? new Set<string>()
      if (loc.field !== null) set.add(loc.field)
      marks.set(loc.entityId, set)
    }
  }
  const mark = (id: string, field: string) => (marks.get(id)?.has(field) ? ` ${errorCell}` : '')

  return (
    <div className="p-4">
      <h2 className="mb-3 text-base font-bold text-ink">{data.title}</h2>
      {issues.length > 0 && (
        <ul className="mb-3 list-disc pl-5 text-sm text-warning">
          {issues.map((issue, i) => (
            <li key={`${issue.rule}-${i}`}>{issue.message}</li>
          ))}
        </ul>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-ink-muted">
            <th className="w-40 px-2 py-1 font-normal">名称</th>
            <th className="w-32 px-2 py-1 font-normal">種別</th>
            <th className="px-2 py-1 font-normal">定義</th>
            <th className="w-44 px-2 py-1 font-normal">別名</th>
            <th className="w-44 px-2 py-1 font-normal">備考</th>
          </tr>
        </thead>
        <tbody>
          {data.terms.map((term, i) => (
            // 行キーは index。ID 重複ファイルを「受け入れて赤表示」するため term.id は
            // キーに使えない（重複キーで描画が壊れる）。並び替え導入時（M3）に再検討する
            <tr
              key={i}
              className={`border-b border-rule align-top${mark(term.id, 'id')}`}
            >
              <td className={mark(term.id, 'name')}>
                <input
                  className={cellInput}
                  defaultValue={term.name}
                  onChange={(e) => {
                    // 空名称は保存対象にしない（スキーマ minLength: 1。空のまま
                    // 書き込むとレベル1違反ファイルを自分で作ることになる）。
                    // 空の間は直前の name がデータ側に残る
                    const v = e.target.value
                    if (v.trim() !== '') updateTerm(i, { name: v })
                  }}
                />
              </td>
              <td>
                <select
                  className={
                    cellInput + (term.kind === 'undecided' ? ` ${warnInput}` : '')
                  }
                  defaultValue={term.kind}
                  onChange={(e) => updateTerm(i, { kind: e.target.value as Term['kind'] })}
                >
                  {KIND_OPTIONS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input
                  className={
                    cellInput + (term.definition === '' ? ` ${warnInput}` : '')
                  }
                  defaultValue={term.definition}
                  onChange={(e) => updateTerm(i, { definition: e.target.value })}
                />
              </td>
              <td className={mark(term.id, 'aliases')}>
                <input
                  className={cellInput}
                  defaultValue={term.aliases.join('、')}
                  onChange={(e) => updateTerm(i, { aliases: parseAliases(e.target.value) })}
                />
              </td>
              <td>
                <input
                  className={cellInput}
                  defaultValue={term.notes}
                  onChange={(e) => updateTerm(i, { notes: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: 型チェックと全テスト**

Run: `npm test && npx tsc -b`
Expected: すべて PASS

- [ ] **Step 3: コミット**

```bash
git add src/modules/glossary/GlossaryEditor.tsx
git commit -m "M2: 用語集エディタの赤表示（レベル2）と warning のセル単位可視化

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: 自動保存の成否通知（flush の戻り値と onError/onSuccess）

M1 申し送り。write 失敗が console.error 止まりなのを、UI に通知できる形にする。`flush()` が「書き残しが無いか」を返すようにし（Task 9 の close 中断判定に使う）、失敗・成功のコールバックを追加する。既存の「失敗時は pending に復元して再試行」の構造は変えない。

**Files:**
- Modify: `src/core/autosave.ts`
- Test: `src/core/autosave.test.ts`

**Interfaces:**
- Consumes: 既存の `createAutoSaver`
- Produces:

```ts
export interface AutoSaver {
  update(text: string): void
  /** 保留中の書き込みを即時実行して完了を待つ。true＝書き残しなし（成功または書くものが無い） */
  flush(): Promise<boolean>
  dispose(): void
}

export function createAutoSaver(opts: {
  delayMs: number
  baseline: string
  write: (text: string) => Promise<void>
  /** write 失敗時（UI 通知用。再試行は saver 自身が pending 復元で行う） */
  onError?: (err: unknown) => void
  /** write 成功時（エラー表示の解除用） */
  onSuccess?: () => void
}): AutoSaver
```

- [ ] **Step 1: 失敗するテストを書く**

`src/core/autosave.test.ts` の describe 内に追加:

```ts
  it('flush は書き残しが無ければ true を返す', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await expect(saver.flush()).resolves.toBe(true)
  })

  it('write が失敗し続けたら flush は false を返す（pending は破棄されない）', async () => {
    const write = vi.fn(() => Promise.reject(new Error('disk full')))
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await expect(saver.flush()).resolves.toBe(false)
    // 復元された pending は次の flush で再試行される
    write.mockImplementation(() => Promise.resolve())
    await expect(saver.flush()).resolves.toBe(true)
    expect(write).toHaveBeenLastCalledWith('B')
  })

  it('write 失敗で onError、成功で onSuccess が呼ばれる', async () => {
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const write = vi.fn(() => Promise.reject(new Error('boom')))
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write, onError, onSuccess })
    saver.update('B')
    await saver.flush()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onSuccess).not.toHaveBeenCalled()
    write.mockImplementation(() => Promise.resolve())
    await saver.flush()
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/core/autosave.test.ts`
Expected: FAIL（flush の戻り値が undefined、コールバック未実装）

- [ ] **Step 3: 実装**

`src/core/autosave.ts` を修正:

1. `AutoSaver` インターフェイスの `flush` を `flush(): Promise<boolean>` にし、doc コメントを「保留中の書き込みを即時実行して完了を待つ。true＝書き残しなし（成功または書くものが無い）」に更新
2. `createAutoSaver` の opts に `onError?: (err: unknown) => void` と `onSuccess?: () => void` を追加
3. `commit` 内の write 成功後に `opts.onSuccess?.()` を呼ぶ:

```ts
        inFlight = true
        try {
          await opts.write(text)
          lastSaved = text
          opts.onSuccess?.()
        } finally {
          inFlight = false
        }
```

4. `.catch` に `opts.onError?.(err)` を追加:

```ts
      .catch((err: unknown) => {
        console.error('自動保存に失敗しました', err)
        opts.onError?.(err)
        // 失敗した内容を pending に戻し、後続の flush()/タイマーで再試行可能にする
        // （すでに新しい編集が pending にあるならそちらが優先）
        if (pending === null) pending = text
      })
```

5. `flush` を書き残し判定つきにする:

```ts
    async flush() {
      await commit()
      // 失敗時は catch が pending に復元しているので、ここで書き残しの有無が分かる
      return pending === null
    },
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/autosave.test.ts`
Expected: PASS（既存テストは戻り値を見ていないのでそのまま通る）

- [ ] **Step 5: コミット**

```bash
git add src/core/autosave.ts src/core/autosave.test.ts
git commit -m "M2: 自動保存に成否通知を追加（flush の書き残し判定と onError/onSuccess）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: ウィンドウ close 時の flush と保存失敗バナー

M1 申し送りの最重要。ウィンドウを閉じると React の unmount を経ずに webview が落ちるため、デバウンス窓内の最後の編集が消える。Tauri の `onCloseRequested` で close を横取りし、flush が成功したときだけ閉じる。flush が失敗したら**閉じない**（エラーバナーが出るので、ユーザーは再度閉じる操作で再試行できる。書けていない編集を黙って捨てない）。ファイル切替時の二重失敗エッジも同じ原則で塞ぐ: flush が false なら dispose せず切替を中断する。

**Files:**
- Create: `src/fs/app-window.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `AutoSaver.flush(): Promise<boolean>` / `onError` / `onSuccess`（Task 8）
- Produces: `interceptClose(beforeClose: () => Promise<boolean>): Promise<() => void>`（戻り値は listener 解除関数）

（Tauri のウィンドウ API に依存するためユニットテストなし。Task 11 の手動 E2E で検証）

- [ ] **Step 1: close 横取りアダプタを作る**

`src/fs/app-window.ts` を作成:

```ts
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * ウィンドウの close 要求を横取りする（Tauri は close 時に React の unmount を
 * 経ずに webview を落とすため、デバウンス中の編集はここで書き切るしかない）。
 * beforeClose が true を返したら destroy で実際に閉じる（destroy は
 * onCloseRequested を再発火させない）。false なら閉じない——書けていない
 * 編集がある状態で黙って捨てないため。エラー表示は呼び出し側の責務。
 */
export function interceptClose(beforeClose: () => Promise<boolean>): Promise<() => void> {
  const win = getCurrentWindow()
  return win.onCloseRequested(async (event) => {
    event.preventDefault()
    if (await beforeClose()) {
      await win.destroy()
    }
  })
}
```

- [ ] **Step 2: App に配線する**

`src/App.tsx` に import を追加:

```ts
import { interceptClose } from '@/fs/app-window'
```

state を追加:

```ts
  const [saveError, setSaveError] = useState<string | null>(null)
```

既存の unmount 用 `useEffect` の後に close 横取りの effect を追加:

```ts
  // ウィンドウ close を横取りして保留中の編集を書き切る。
  // flush が失敗したら閉じない（saveError バナーが出る。再度閉じる操作＝再試行）
  useEffect(() => {
    const unlisten = interceptClose(async () => {
      const saver = saverRef.current
      return saver ? saver.flush() : true
    })
    return () => {
      void unlisten.then((f) => f())
    }
  }, [])
```

`closeCurrentFile` を成否つきに変える:

```ts
  /** 現在のファイルを閉じる。false＝保留編集を書き切れず中断（saver は生かしたまま） */
  const closeCurrentFile = async (): Promise<boolean> => {
    const saver = saverRef.current
    if (saver) {
      const ok = await saver.flush()
      // flush 失敗時に dispose すると、catch が復元した pending を破棄してしまう
      //（M1 レビューの二重失敗エッジ）。dispose せず中断する
      if (!ok) return false
      saver.dispose()
      saverRef.current = null
    }
    setSelectedPath(null)
    setEditingData(null)
    return true
  }
```

`selectFile` の冒頭を中断対応にする:

```ts
    const token = ++selectSeq.current
    if (!(await closeCurrentFile())) return
```

`createAutoSaver` の呼び出しにコールバックを追加:

```ts
      saverRef.current = createAutoSaver({
        delayMs: AUTOSAVE_DELAY_MS,
        baseline: serialize(result.data, module.schema),
        write: (text) => writeProjectFile(file.path, text),
        onError: (err) =>
          setSaveError(
            `自動保存に失敗しました（編集を続けるか、もう一度閉じる操作で再試行されます）: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        onSuccess: () => setSaveError(null),
      })
```

ヘッダ下の `ioError` 表示の隣にバナーを追加（検証エラー表示と同じ枠・同じトークン）:

```tsx
      {saveError && <p className="px-6 py-2 text-sm text-warning">{saveError}</p>}
```

- [ ] **Step 3: 型チェックと全テスト**

Run: `npm test && npx tsc -b`
Expected: すべて PASS

- [ ] **Step 4: コミット**

```bash
git add src/fs/app-window.ts src/App.tsx
git commit -m "M2: ウィンドウ close 時の flush と自動保存失敗バナー（二重失敗エッジの封鎖）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: openFolder の失敗時 UI と相互ガード

M1 申し送り。フォルダ読込失敗時に選択状態だけ先にクリアされ旧フォルダの一覧が残る不整合を直す。方針: **state の入れ替えは全ファイルの読込が成功してから一括で行う**。失敗時は旧一覧をそのまま残してエラーメッセージを出す（現在のファイルは flush 済みで閉じられているので、一覧から選び直せば続きができる）。openFolder 連打・openFolder 中の selectFile はトークン `selectSeq` の相互チェックで防ぐ。

**Files:**
- Modify: `src/App.tsx`（`openFolder` のみ）

**Interfaces:**
- Consumes: `closeCurrentFile(): Promise<boolean>`（Task 9）、`computeIssues`（Task 6）
- Produces: なし

- [ ] **Step 1: openFolder を書き換える**

```ts
  const openFolder = async () => {
    const dir = await pickProjectFolder()
    if (dir === null) return
    const token = ++selectSeq.current
    // 先に現在のファイルを閉じる（flush 後の内容で走査するため）。
    // flush が失敗したらフォルダ切替を中断する（書けていない編集を捨てない）
    if (!(await closeCurrentFile())) return
    try {
      const paths = await listJsonFiles(dir)
      const loaded: ProjectFile[] = []
      for (const path of paths) {
        const text = await readProjectFile(path)
        loaded.push({ path, name: fileName(path), result: classifyFile(text, appRegistry), issues: [] })
      }
      // 後続の openFolder / selectFile が始まっていたら、この結果は破棄する
      if (token !== selectSeq.current) return
      // 全部読めてから一括で入れ替える（途中失敗で新旧が混ざった状態を作らない）
      setProjectDir(dir)
      setFiles(computeIssues(loaded))
      setIoError(null)
    } catch (err) {
      if (token !== selectSeq.current) return
      // 旧フォルダの一覧はそのまま残す。選択は closeCurrentFile 済みなので選び直せる
      setIoError(
        `フォルダの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
```

（`selectFile` 側は M1 実装＋Task 9 の変更で既にトークンガード済み。変更不要）

- [ ] **Step 2: 型チェックと全テスト**

Run: `npm test && npx tsc -b`
Expected: すべて PASS

- [ ] **Step 3: コミット**

```bash
git add src/App.tsx
git commit -m "M2: openFolder の失敗時に旧一覧を保ち相互ガードを追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: 壊れたプロジェクト fixture と手動 E2E

M2 の完了条件そのもの。「意図的に壊したファイル群を用意し、それぞれ期待どおりの区分で扱われること」を実機で確認する。fixture はリポジトリにコミットして今後の回帰確認にも使う。

**Files:**
- Create: `sample-project-broken/glossary-main.json`
- Create: `sample-project-broken/glossary-second.json`
- Create: `sample-project-broken/glossary-newer.json`
- Create: `sample-project-broken/glossary-schema-violation.json`
- Create: `sample-project-broken/unknown-type.json`
- Create: `sample-project-broken/no-type.json`
- Create: `sample-project-broken/broken-syntax.json`

**Interfaces:**
- Consumes: これまでの全タスクの成果
- Produces: 手動 E2E 用 fixture（今後のマイルストーンでも回帰確認に使う）

- [ ] **Step 1: fixture を作る**

`sample-project-broken/glossary-main.json`（モジュール内検証の4ルールと warning を全部踏む。正規形＝キー順はスキーマ順・インデント2・LF・末尾改行で書く）:

```json
{
  "schemaVersion": 1,
  "type": "glossary",
  "title": "壊れた用語集（整合性検証の確認用）",
  "terms": [
    {
      "id": "term_aaaaaaaaaa",
      "name": "受注",
      "kind": "event",
      "definition": "顧客からの注文を受け付けること。",
      "aliases": [],
      "notes": "ID 重複ペアの1件目（次の行と同じ ID）"
    },
    {
      "id": "term_aaaaaaaaaa",
      "name": "発注",
      "kind": "event",
      "definition": "仕入先へ注文を出すこと。",
      "aliases": [],
      "notes": "ID 重複ペアの2件目"
    },
    {
      "id": "term_bbbbbbbbbb",
      "name": "API連携",
      "kind": "data",
      "definition": "外部システムとの API 連携。",
      "aliases": [],
      "notes": "name 重複ペアの1件目（次の行と NFKC で同名）"
    },
    {
      "id": "term_cccccccccc",
      "name": "ＡＰＩ連携",
      "kind": "data",
      "definition": "全角表記の重複。",
      "aliases": [],
      "notes": "name 重複ペアの2件目"
    },
    {
      "id": "term_dddddddddd",
      "name": "顧客",
      "kind": "actor",
      "definition": "サービスを利用する企業・個人。",
      "aliases": ["クライアント", "クライアント"],
      "notes": "同一用語内の alias 重複"
    },
    {
      "id": "term_eeeeeeeeee",
      "name": "案件",
      "kind": "data",
      "definition": "商談の単位。",
      "aliases": ["取引"],
      "notes": "用語間 alias 重複の1件目"
    },
    {
      "id": "term_ffffffffff",
      "name": "商談",
      "kind": "event",
      "definition": "受注前の交渉。",
      "aliases": ["取引"],
      "notes": "用語間 alias 重複の2件目"
    },
    {
      "id": "term_gggggggggg",
      "name": "見積",
      "kind": "data",
      "definition": "金額の提示。",
      "aliases": ["受注"],
      "notes": "alias が用語「受注」の name と衝突"
    },
    {
      "id": "term_hhhhhhhhhh",
      "name": "請求",
      "kind": "undecided",
      "definition": "",
      "aliases": [],
      "notes": "warning 確認用（kind=undecided と definition 空）"
    }
  ]
}
```

`sample-project-broken/glossary-second.json`（単一性違反の相手）:

```json
{
  "schemaVersion": 1,
  "type": "glossary",
  "title": "2つ目の用語集（単一性違反の確認用）",
  "terms": []
}
```

`sample-project-broken/glossary-newer.json`（未知の新しい schemaVersion → listOnly。type は glossary なので単一性違反にも数えられる）:

```json
{
  "schemaVersion": 99,
  "type": "glossary",
  "title": "未来の用語集（listOnly の確認用）",
  "terms": []
}
```

`sample-project-broken/glossary-schema-violation.json`（レベル1拒否。terms の要素に必須キー notes が無い。type は読めるので単一性違反にも数えられる）:

```json
{
  "schemaVersion": 1,
  "type": "glossary",
  "title": "スキーマ違反の用語集（レベル1拒否の確認用）",
  "terms": [
    {
      "id": "term_zzzzzzzzzz",
      "name": "孤立した用語",
      "kind": "other",
      "definition": "notes キーが無いのでスキーマ検証に落ちる。",
      "aliases": []
    }
  ]
}
```

`sample-project-broken/unknown-type.json`:

```json
{
  "schemaVersion": 1,
  "type": "logic-tree",
  "title": "未知ツールのファイル（前方互換の確認用）",
  "nodes": []
}
```

`sample-project-broken/no-type.json`:

```json
{
  "title": "type キーの無いただの JSON"
}
```

`sample-project-broken/broken-syntax.json`（JSON として壊れている。この1行だけのファイル）:

```
{ "schemaVersion": 1,
```

- [ ] **Step 2: 全テスト・lint・型チェック**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

- [ ] **Step 3: 手動 E2E（アプリ起動）**

Run: `npm run tauri dev`

`sample-project-broken` フォルダを開き、以下をすべて確認する:

| ファイル | 期待する扱い |
| --- | --- |
| glossary-main.json | editable。赤バッジに件数（モジュール内5件＋単一性1件＝6）。開くと issue 一覧が表の上に出る |
| glossary-main.json の行表示 | 受注・発注の行全体が赤（ID重複）／API連携・ＡＰＩ連携の名称セルが赤／顧客の別名セルが赤／案件・商談の別名セルが赤／見積の別名セルと受注の名称セルが赤／請求の種別セルと定義セルに点線下線（warning） |
| glossary-second.json | editable。単一性違反の赤バッジ。開くと単一性メッセージ |
| glossary-newer.json | listOnly「schemaVersion」の文言＋単一性違反バッジ。クラッシュしない |
| glossary-schema-violation.json | rejected「開けない」＋単一性違反バッジ。エラー詳細が見える |
| unknown-type.json | listOnly「このバージョンでは編集できない type です: logic-tree」 |
| no-type.json | listOnly「ツールのファイルではありません（type がありません）」 |
| broken-syntax.json | rejected「JSON として解釈できません」 |
| 単一性メッセージ | 「用語集のファイルがプロジェクトに4件あります」（main / second / newer / schema-violation） |

続けて動作系の確認:

1. **編集時の再検証**: glossary-main.json の「発注」を「発注x」に直す → duplicate-id の赤は残る。「ＡＰＩ連携」を別の名前に直す → name 重複の赤表示と issue が即座に消え、バッジ件数が減る
2. **close 時 flush**: `sample-project`（正常な方）を開き、1フィールド編集して**500ms 以内にウィンドウを閉じる** → 再起動して `git diff sample-project/glossary.json` に最後の編集が入っている
3. **保存失敗バナー**: エクスプローラで `sample-project/glossary.json` を読み取り専用にする → アプリで編集 → 赤いバナーが出る。読み取り専用を解除してもう1文字編集 → 保存されバナーが消える
4. **openFolder 失敗**: フォルダを開いた後、もう一度「フォルダを開く」でネットワークドライブ等の読めない場所を選ぶ（作れなければ省略可）→ 旧一覧が残りエラーメッセージが出る

- [ ] **Step 4: 編集内容を元に戻す**

E2E で編集した fixture / sample-project の変更を破棄する:

```bash
git checkout -- sample-project/ sample-project-broken/ 2>/dev/null || git restore sample-project sample-project-broken
```

- [ ] **Step 5: コミット**

```bash
git add sample-project-broken
git commit -m "M2: 壊れたプロジェクトの E2E fixture を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## セルフレビュー記録

- **仕様カバレッジ**: 実装スコープ定義書 4節 M2 の項目 → 整合性検証5種（Task 4・5）／warning セル可視化（Task 7）／プロジェクト全体走査＋赤バッジ（Task 6）／未知 type・schemaVersion の非クラッシュと文言（Task 2、分類自体は M1 実装済み）。7節の M2 申し送り → close 時 flush と二重失敗エッジ（Task 8・9）／自動保存失敗の可視化（Task 8・9）／listOnly・rejected 文言（Task 2）／openFolder 失敗時 UI と相互ガード（Task 10）／idPrefixes 自己重複（Task 1）。完了条件の壊れファイル群（Task 11）
- **スコープ判断のメモ**: 「name 重複は Skill 側スクリプトにも現状無い検査。今回追加する」は本計画では**アプリ側への追加**として実装する。Skill スクリプト（AI 層の管轄。今回作らないもの）への同検査追加が必要なら別セッションで扱う
- **単一性違反のカウント仕様**: rejected / listOnly でも `type: glossary` と読めるファイルは数える（「type: glossary のファイルが2つ以上」という物理条件。rev 5章）。このために Task 2 で rejected に type を持たせた
- **行キーの変更**: GlossaryEditor の行キーを `term.id` から index に変更（ID 重複ファイルを「受け入れて赤表示」する以上、重複キーは許されない）。M3 の並び替えで再検討
- **型整合**: `flush(): Promise<boolean>`（Task 8 定義→Task 9 使用）／`ConsistencyIssue.locations`（Task 4 定義→Task 6・7 使用）／`LoadResult` 全 variant の `type`（Task 2 定義→Task 5・6 使用）／`checkConsistency`・`singleton`・`displayName`（Task 5 定義→Task 5 テスト・Task 6 使用）を確認済み
