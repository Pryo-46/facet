# M3: エディタの操作性 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用語集エディタに共通の操作言語（キーボード操作・IME 対応・境界規則・Undo/Redo・検索/フィルタ）を入れ、あわせて M1/M2 の申し送り（別名セル・kind の日本語ラベル・非制御入力からの移行・行キーが配列 index・セル赤表示のキーが entityId のみ）を解消する。

**Architecture:** rev 10章の「キーボード処理は共通フック／モジュールに一元化」に従い、**キー入力の解釈はコア（`src/core/keyboard/`）に集約**する。キーマップは純関数 `resolveCommand(event, context) → Command | null` として実装し、修飾キーはプラットフォーム抽象（Windows: Ctrl/Alt、macOS: Cmd/Option）を通す。各コンポーネントは「文脈（編集中か・空欄か・導出表示中か）を渡し、返ってきたコマンドを自分の意味に写像する」だけで、キーの判定は一切書かない。この構造の実証として、**別名パネル（入れ子のリスト UI）も同じ `resolveCommand` を使う**。Undo/Redo はグローバル層なので額縁（App）が window で受け、履歴（`src/core/history.ts`）は純関数のイミュータブル構造として持つ。IME は「変換中は操作言語の対象外」を `resolveCommand` の第1規則として構造的に排除し、制御入力側（`CellInput`）は変換中に親へ値を上げないことで巻き戻りを防ぐ。

**Tech Stack:** M2 と同じ（Tauri 2 ＋ Vite ＋ React 19 ＋ TypeScript strict ＋ Tailwind v4 ＋ Vitest）。**最終盤の Task 16 でのみ** devDependencies に `jsdom` / `@testing-library/react` / `@testing-library/user-event` を追加する。

## Global Constraints

- **キー判定を各コンポーネントに書かない**（rev 10章の実装規約）。キー→コマンドの解釈は `src/core/keyboard/keymap.ts` の `resolveCommand` ただ1箇所。コンポーネントが `e.key === 'Enter'` を直接見るのは禁止（`CellInput` が composition 状態を作る箇所と、検索欄のような操作言語の外にある UI を除く）
- **修飾キーはプラットフォーム抽象を通す**。`Ctrl` を直接見ない。Windows: Ctrl / Alt、macOS: Cmd / Option。M0 時点の動作確認は Windows のみで、以下のキー表記は Windows 側の呼び方
- **IME 対応**: `isComposing` が true の間は操作言語を一切動かさない。変換確定の Enter が行追加に誤爆する問題は日本語入力アプリ最大の地雷（rev 10章）
- **境界規則**: モーダル表示中は操作言語を停止（M3 にモーダルは無いが `KeyContext.modalOpen` の配線点は用意する）。テキスト編集中は編集境界キー（Enter / Tab / Esc / 空欄 Backspace）のみ操作言語が取る
- **導出表示中（検索・フィルタ適用中）は Alt+↑↓ を無効化**（session-notes 論点4）。データ順と表示順が食い違う状態での並び替えは結果が予測不能になるため
- **正規形（実装スコープ定義書 3節）を壊さない**: キー順はスキーマからの実行時導出、インデント2、LF、末尾改行あり、BOM なし、非ASCII エスケープなし。M3 は `src/core/canonical.ts` を触らない
- **スキーマの正は `schemas/glossary.schema.json` の1ファイル。コピーを作らない**。種別 enum はここから実行時に導出する（ハードコード禁止）
- **型は手書きしない**: `src/types/glossary.ts` は生成物（gitignore 済み。`pretest` / `predev` 等で自動再生成）
- **空の `name` をデータに載せない**: スキーマは `minLength: 1`。空のまま書き込むとレベル1違反ファイルを自分で作ることになる（次回開けない）
- **照合の正規化は `src/core/normalize.ts` の `normalizeForMatch` に一本化する**。検索の照合と重複判定で規則を分けない（M2 申し送り）
- **Rust を書かない。Tauri コマンドを追加しない**。M3 で新しい Tauri JS API は使わないので capabilities の変更も無い
- **色値の直書き禁止**: 役割トークン（`text-ink` / `text-ink-muted` / `bg-warning` / `text-warning` / `border-rule` / `bg-surface` / `bg-canvas` / `text-warning-fg`）のみを使う。`bg-warning/25` のような不透明度修飾はトークン由来なので可。色値そのものの確定は M7
- **Skill 側（`.claude/skills/glossary-term-register/`）は変更しない**
- **M3 のスコープ外（実装しないこと）**: ファイルの新規作成・削除・用語集の自動生成（M4）／外部変更検知（M5）／Markdown 出力（M6）／トークンの色値確定・フォントスタック（M7）／表記ゆれの「指摘（suggestion）」レイヤ／インライン登録コンポーネント
- テストは Vitest。**Task 15 まではすべて `environment: node` の純ロジックテスト**。DOM を使うテストは Task 16 でのみ導入し、ファイル先頭の `// @vitest-environment jsdom` で切り替える（グローバル設定は node のまま）
- コミットメッセージは日本語・`M3:` プレフィクス。各コミット末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける

## 設計判断（実装前に読むこと）

計画時に決めた、仕様書に明示が無い箇所の判断。実装中に迷ったらここに従う。

1. **テキスト編集中の Ctrl+Z はアプリの Undo が取る**（rev 10章の境界規則に対する明示的な例外）。理由: M3 で入力を制御方式に移行するため、ブラウザ標準の Undo は React の再レンダリングと食い違って壊れる。セル内とセル外で Ctrl+Z の結果が変わる状態を避け、挙動を一本化する
2. **空欄 Backspace で行を削除できるのは名称セルだけ**。理由: 定義セルは空（未定義 warning）が常態であり、そこで行が消えるのは重大な事故になる。名称は必須かつ行の代表
3. **矢印での行間移動はキャレットが端にあるときだけ**。理由: rev は「矢印は編集対象のもの（カーソル移動）」としつつ、リスト系ファミリー標準として「矢印＝行間フォーカス移動」も定めている。用語集は全セルが常時入力欄なので、両立させるにはキャレット位置で切り替えるしかない（一般的なリスト UI のデファクトでもある）。種別セル（select）は素の↑↓を select 自身が使う
4. **新規行の名称は `新しい用語` で埋める**。理由: 空文字はスキーマ違反（`minLength: 1`）で、自動保存が走った瞬間に自分でレベル1違反ファイルを作る。既定値を入れておけばデータは常にスキーマ適合を保てる。放置すると2件目から名称重複で赤くなるが、これは「名前を付けていない用語が2つある」という正しい指摘であり、「未定義を消せなくする」という設計思想に沿う
5. **別名パネルは Radix の Popover を使わず素の絶対配置 div で作る**。理由: フォーカスと矢印キーの制御を自前の操作言語に一本化するため。Radix Popover はフォーカストラップとキーハンドリングを持ち込み、モーダル境界規則を不必要に発火させる
6. **別名の分割は貼り付け時の改行・タブのみ**。読点や全角カンマでは分割しない。理由: パネル方式では1行＝1別名なので区切り文字を打つ必要が無くなり、逆に別名そのものに含まれる読点を壊すほうが害になる（M1 の区切り方式はここで廃止される）
7. **行の同一性キーは `${id}#${出現順}`**（`src/core/row-keys.ts`）。理由: ID 重複ファイルを「受け入れて赤表示」する以上 `id` 単体では一意にならず、配列 index は並び替えで行の同一性が保てない。ID が一意なら常に同じキーになり、データから毎回導出できる（状態を持たないので履歴・再読込と食い違わない）
8. **セルの赤表示は `entityIndex`（配列位置）で引く**。理由: `entityId` だけだと ID 重複時に同じ ID を持つ全行へマークが波及する（M2 申し送り）

## ファイル構成（M3 完了時。★=新規）

```
src/
  core/
    consistency.ts                   # 変更: ConsistencyLocation に entityIndex
    project-consistency.ts           # 変更: issue を上書きでなく追記する
    project-consistency.test.ts      # 変更
    registry.ts                      # 変更: EditorProps.onChange に mergeKey
    normalize.ts                     # 変更なし（検索の照合でも使う）
    canonical.ts / autosave.ts       # 変更なし
  ★ history.ts / history.test.ts     # Undo/Redo の履歴（純関数・汎用）
  ★ new-id.ts / new-id.test.ts       # ID 採番（Skill の new-id.mjs と同規約）
  ★ list-ops.ts / list-ops.test.ts   # 配列の挿入・削除・移動
  ★ row-keys.ts / row-keys.test.ts   # 行の同一性キー
  ★ keyboard/
  ★   platform.ts / platform.test.ts # 修飾キーのプラットフォーム抽象
  ★   keymap.ts / keymap.test.ts     # キー→コマンド解決（操作言語の本体）
  components/
  ★ CellInput.tsx                    # 制御入力＋IME＋sanitize
  ★ CellInput.dom.test.tsx           # Task 16
  modules/glossary/
    consistency.ts / .test.ts        # 変更: locations に entityIndex
  ★ kind-labels.ts / .test.ts        # 種別 enum の日本語ラベル
  ★ search.ts / search.test.ts       # 検索・種別フィルタ
  ★ fields.ts / fields.test.ts       # 列の順序と Tab 移動
  ★ alias-paste.ts / .test.ts        # 貼り付けテキストの分割
  ★ AliasCell.tsx                    # 別名パネル
    GlossaryEditor.tsx               # 変更: 全面作り直し
  ★ GlossaryEditor.dom.test.tsx      # Task 16
  App.tsx                            # 変更: 履歴配線・グローバルショートカット
package.json                         # 変更: Task 16 で devDependencies 追加
```

---

### Task 1: 赤表示の位置を配列 index で指す（ConsistencyLocation の拡張）

M2 申し送り。`ConsistencyLocation` が `entityId` しか持たないため、ID 重複時に同じ ID を持つ全行へセルマークが波及する。あわせて `checkProjectConsistency` の「issue の上書き代入」（コア横断ルールが2本目になった瞬間に先のルールを消す）も塞ぐ。

**Files:**
- Modify: `src/core/consistency.ts`
- Modify: `src/core/project-consistency.ts`
- Modify: `src/core/project-consistency.test.ts`
- Modify: `src/modules/glossary/consistency.ts`
- Modify: `src/modules/glossary/consistency.test.ts`

**Interfaces:**
- Consumes: 既存の `ConsistencyIssue` / `checkGlossaryConsistency` / `checkProjectConsistency`
- Produces:
  - `ConsistencyLocation = { entityId: string; entityIndex: number | null; field: string | null }`
  - `addIssue(out: Map<string, ConsistencyIssue[]>, path: string, issue: ConsistencyIssue): void`
  - `checkGlossaryConsistency` の locations が全て `entityIndex` に配列位置を入れる（Task 11 の赤表示が使う）

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/glossary/consistency.test.ts` の既存の locations 期待値を、配列位置つきに書き換える。該当する4箇所を次に置き換える:

```ts
    expect(issues[0].locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', entityIndex: 0, field: 'id' },
      { entityId: 'term_aaaaaaaaaa', entityIndex: 1, field: 'id' },
    ])
```

（`ID 重複を検出する` の it 内。`toHaveLength(1)` と `rule` の行はそのまま）

```ts
    expect(issues[0].locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', entityIndex: 0, field: 'name' },
      { entityId: 'term_bbbbbbbbbb', entityIndex: 1, field: 'name' },
    ])
```

（`name 重複を NFKC＋大文字小文字同一視で検出する` の it 内）

```ts
    expect(issues[0].locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', entityIndex: 0, field: 'aliases' },
    ])
```

（`同一用語内の alias 重複を検出する` の it 内。同じ行を2度指さない）

```ts
    expect(issues[0].locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', entityIndex: 0, field: 'aliases' },
      { entityId: 'term_bbbbbbbbbb', entityIndex: 1, field: 'aliases' },
    ])
```

（`用語間の alias 重複を検出する` の it 内）

```ts
    expect(issues[0].locations).toEqual([
      { entityId: 'term_bbbbbbbbbb', entityIndex: 1, field: 'aliases' },
      { entityId: 'term_aaaaaaaaaa', entityIndex: 0, field: 'name' },
    ])
```

（`alias と他用語の name の衝突を検出する` の it 内）

さらに、ID 重複行が混ざっても行を取り違えないことのテストを describe の末尾に追加する:

```ts
  it('ID が重複していても name 重複は該当の行だけを指す', () => {
    const data = glossary([
      term({ id: 'term_aaaaaaaaaa', name: '受注' }),
      term({ id: 'term_aaaaaaaaaa', name: '見積' }),
      term({ id: 'term_bbbbbbbbbb', name: '見積' }),
    ])
    const nameIssue = checkGlossaryConsistency(data).find((i) => i.rule === 'duplicate-name')
    expect(nameIssue?.locations).toEqual([
      { entityId: 'term_aaaaaaaaaa', entityIndex: 1, field: 'name' },
      { entityId: 'term_bbbbbbbbbb', entityIndex: 2, field: 'name' },
    ])
  })
```

`src/core/project-consistency.test.ts` の末尾（describe 内）に追記する:

```ts
  it('同じファイルへの issue は上書きせず積み上げる', () => {
    const out = new Map<string, ConsistencyIssue[]>()
    addIssue(out, 'a.json', { rule: 'r1', message: 'one', locations: [] })
    addIssue(out, 'a.json', { rule: 'r2', message: 'two', locations: [] })
    expect(out.get('a.json')?.map((i) => i.rule)).toEqual(['r1', 'r2'])
  })
```

この test ファイルの import に `addIssue` と `ConsistencyIssue` 型を足す:

```ts
import type { ConsistencyIssue } from './consistency'
import { addIssue, checkProjectConsistency } from './project-consistency'
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/modules/glossary/consistency.test.ts src/core/project-consistency.test.ts`
Expected: FAIL（locations の期待値不一致と `addIssue is not a function`）

- [ ] **Step 3: 型を拡張する**

`src/core/consistency.ts` の `ConsistencyLocation` を次に置き換える:

```ts
export interface ConsistencyLocation {
  /** 該当エンティティの ID（メッセージ用。ID 重複時は一意でないことがある） */
  entityId: string
  /**
   * そのモジュールのデータ内での配列位置。UI はこれで行を特定する。
   * ID 重複ファイルを受け入れる以上 entityId では行を一意に指せない。
   * 位置の概念を持たない検証（ファイル単位の問題）は null
   */
  entityIndex: number | null
  /** セルまで特定できる場合のフィールド名。'id' は「行全体」の意味で使う（ID 列は UI に無い） */
  field: string | null
}
```

- [ ] **Step 4: モジュール内検証を配列位置つきに書き換える**

`src/modules/glossary/consistency.ts` の全体を次に置き換える:

```ts
import type { ConsistencyIssue } from '@/core/consistency'
import { normalizeForMatch } from '@/core/normalize'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'

/** 検証中の用語（配列位置つき）。locations の entityIndex に使う */
interface IndexedTerm {
  term: Term
  index: number
}

/**
 * 用語集のモジュール内検証（規約4。rev 6章の責務内訳の「モジュール内」側）。
 * 自ファイルで完結する検証のみ。単一性違反はコア横断検証の管轄。
 * alias 系は表記ゆれ検知の照合データ自体の矛盾として扱う（session-notes 論点5）。
 *
 * locations は配列位置（entityIndex）で行を指す。ID 重複ファイルを
 * 「受け入れて赤表示」する以上、entityId だけでは行を一意に特定できない。
 */
export function checkGlossaryConsistency(data: GlossarySchemaVersion1): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const terms: IndexedTerm[] = data.terms.map((term, index) => ({ term, index }))

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）
  const byId = new Map<string, IndexedTerm[]>()
  for (const t of terms) byId.set(t.term.id, [...(byId.get(t.term.id) ?? []), t])
  for (const [id, group] of byId) {
    if (group.length > 1) {
      issues.push({
        rule: 'duplicate-id',
        message: `ID が重複しています（${group.length}件）: ${id}`,
        locations: group.map((t) => ({ entityId: id, entityIndex: t.index, field: 'id' })),
      })
    }
  }

  // name 重複（同名2件は「この語を正式名とする」宣言としての矛盾。rev 5章）
  const byName = new Map<string, IndexedTerm[]>()
  for (const t of terms) {
    const key = normalizeForMatch(t.term.name)
    byName.set(key, [...(byName.get(key) ?? []), t])
  }
  for (const group of byName.values()) {
    if (group.length > 1) {
      issues.push({
        rule: 'duplicate-name',
        message: `名称が重複しています: ${group.map((t) => `「${t.term.name}」`).join(' と ')}`,
        locations: group.map((t) => ({
          entityId: t.term.id,
          entityIndex: t.index,
          field: 'name',
        })),
      })
    }
  }

  // alias 重複（同一用語内・用語間の両方を1つのルールで扱う）
  const aliasOwners = new Map<string, { owner: IndexedTerm; alias: string }[]>()
  for (const t of terms) {
    for (const alias of t.term.aliases) {
      const key = normalizeForMatch(alias)
      aliasOwners.set(key, [...(aliasOwners.get(key) ?? []), { owner: t, alias }])
    }
  }
  for (const owners of aliasOwners.values()) {
    if (owners.length > 1) {
      // 同一用語内の重複は行が1つしかないので、同じ行を2度指さない
      const seen = new Set<number>()
      const locations = []
      for (const o of owners) {
        if (seen.has(o.owner.index)) continue
        seen.add(o.owner.index)
        locations.push({
          entityId: o.owner.term.id,
          entityIndex: o.owner.index,
          field: 'aliases',
        })
      }
      issues.push({
        rule: 'duplicate-alias',
        message: `別名「${owners[0].alias}」が重複しています（${owners.length}件）`,
        locations,
      })
    }
  }

  // alias と他用語の name の衝突（自用語の name は対象外。
  // 正式名そのものを alias に持つのは冗長ではあるが矛盾ではない）。
  // 自他の判定は index で行う——ID が重複していても別の行は別の用語
  for (const t of terms) {
    for (const alias of t.term.aliases) {
      for (const other of byName.get(normalizeForMatch(alias)) ?? []) {
        if (other.index === t.index) continue
        issues.push({
          rule: 'alias-name-collision',
          message: `「${t.term.name}」の別名「${alias}」が用語「${other.term.name}」の名称と衝突しています`,
          locations: [
            { entityId: t.term.id, entityIndex: t.index, field: 'aliases' },
            { entityId: other.term.id, entityIndex: other.index, field: 'name' },
          ],
        })
      }
    }
  }

  return issues
}
```

- [ ] **Step 5: コア横断検証を追記方式にする**

`src/core/project-consistency.ts` に `addIssue` を追加し、`checkProjectConsistency` の末尾ループを書き換える。

ファイル末尾（`checkProjectConsistency` の外）に追加:

```ts
/**
 * 検証結果への追記。コア横断ルールが2本目になったとき、先のルールの
 * issue を上書きで消さないためのヘルパ。新しいルールは必ずこれを通すこと
 */
export function addIssue(
  out: Map<string, ConsistencyIssue[]>,
  path: string,
  issue: ConsistencyIssue,
): void {
  out.set(path, [...(out.get(path) ?? []), issue])
}
```

`checkProjectConsistency` 内の `for (const f of group) out.set(f.path, [issue])` を次に置き換える:

```ts
    for (const f of group) addIssue(out, f.path, issue)
```

- [ ] **Step 6: テストが通ることを確認する**

Run: `npm test -- src/modules/glossary/consistency.test.ts src/core/project-consistency.test.ts`
Expected: PASS

- [ ] **Step 7: 既存エディタの型エラーを解消する**

`src/modules/glossary/GlossaryEditor.tsx` は `loc.entityId` でマークを引いているため、型は通るが Task 11 まで暫定のまま。ここでは触らない。全体の型チェックだけ確認する。

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

- [ ] **Step 8: コミット**

```bash
git add src/core/consistency.ts src/core/project-consistency.ts src/core/project-consistency.test.ts src/modules/glossary/consistency.ts src/modules/glossary/consistency.test.ts
git commit -m "M3: 整合性検証の locations に配列位置を追加し、横断検証を追記方式に変更

ID 重複時に同じ ID を持つ全行へセルマークが波及する問題（M2 申し送り）を
行の特定を entityIndex に変えて解消する。あわせてコア横断検証の issue が
上書き代入で消える経路を addIssue に集約した。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 種別 enum の日本語ラベル

M1 申し送り。kind セルが enum 生値（`actor` 等）をそのまま表示している。データ・スキーマは英語 enum のままで、UI 層にだけ対応表を持たせる。

**Files:**
- Create: `src/modules/glossary/kind-labels.ts`
- Test: `src/modules/glossary/kind-labels.test.ts`

**Interfaces:**
- Consumes: `schemas/glossary.schema.json`（テストが enum を読む）
- Produces: `kindLabel(kind: string): string` / `KIND_LABELS: Record<string, string>`（Task 11・14 が使う）

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/glossary/kind-labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { KIND_LABELS, kindLabel } from './kind-labels'

describe('kindLabel', () => {
  it('スキーマの enum の全値に日本語ラベルがある', () => {
    // enum を拡張したらここが赤くなる（ラベルの足し忘れを機械的に検出する）
    for (const kind of glossarySchema.$defs.term.properties.kind.enum) {
      expect(KIND_LABELS[kind], `${kind} のラベルがありません`).toBeTruthy()
    }
  })

  it('undecided は M6 の Markdown 出力と同じ「未分類」', () => {
    expect(kindLabel('undecided')).toBe('未分類')
  })

  it('未知の値は生値のまま返す（未知 enum でクラッシュしない）', () => {
    expect(kindLabel('condition')).toBe('condition')
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/modules/glossary/kind-labels.test.ts`
Expected: FAIL（`Failed to resolve import './kind-labels'`）

- [ ] **Step 3: 最小実装**

`src/modules/glossary/kind-labels.ts`:

```ts
/**
 * 種別 enum の日本語ラベル（UI 層だけの対応表）。
 * データ・スキーマは英語 enum のまま——JSON は AI との交換形式であり、
 * 表示名は人間向けの都合だから（rev 3章・4章）。
 * enum を拡張したらここにも足す。足し忘れはテストが検出する。
 */
export const KIND_LABELS: Record<string, string> = {
  actor: 'アクター',
  state: '状態',
  event: 'イベント',
  screen: '画面',
  data: 'データ',
  other: 'その他',
  // M6 の Markdown 出力の見出し「### 未分類」と表記を揃える
  undecided: '未分類',
}

/** ラベルの無い値（将来の enum 拡張）は生値をそのまま返す */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/modules/glossary/kind-labels.test.ts`
Expected: PASS（3件）

- [ ] **Step 5: コミット**

```bash
git add src/modules/glossary/kind-labels.ts src/modules/glossary/kind-labels.test.ts
git commit -m "M3: 種別 enum の日本語ラベル対応表を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 修飾キーのプラットフォーム抽象

rev 10章。各コンポーネントが `Ctrl` を直接見ないための土台。Tauri なので macOS で動く可能性は残っており、Ctrl 直書きだと macOS で Undo が効かない。

**Files:**
- Create: `src/core/keyboard/platform.ts`
- Test: `src/core/keyboard/platform.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `Platform`（`'mac' | 'other'`）/ `detectPlatform(userAgent)` / `currentPlatform()` / `isPrimaryModifier(e, platform)` / `primaryModifierLabel(platform)` / `altModifierLabel(platform)`（Task 4・11・13・15 が使う）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/keyboard/platform.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  altModifierLabel,
  detectPlatform,
  isPrimaryModifier,
  primaryModifierLabel,
} from './platform'

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)'
const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'

describe('detectPlatform', () => {
  it('macOS を判定する', () => {
    expect(detectPlatform(MAC_UA)).toBe('mac')
  })

  it('Windows は other', () => {
    expect(detectPlatform(WIN_UA)).toBe('other')
  })
})

describe('isPrimaryModifier', () => {
  const none = { ctrlKey: false, metaKey: false }

  it('Windows では Ctrl が主修飾キー', () => {
    expect(isPrimaryModifier({ ...none, ctrlKey: true }, 'other')).toBe(true)
    expect(isPrimaryModifier({ ...none, metaKey: true }, 'other')).toBe(false)
  })

  it('macOS では Cmd が主修飾キー', () => {
    expect(isPrimaryModifier({ ...none, metaKey: true }, 'mac')).toBe(true)
    expect(isPrimaryModifier({ ...none, ctrlKey: true }, 'mac')).toBe(false)
  })

  it('両方押されている組み合わせは主修飾キーとして扱わない', () => {
    expect(isPrimaryModifier({ ctrlKey: true, metaKey: true }, 'other')).toBe(false)
    expect(isPrimaryModifier({ ctrlKey: true, metaKey: true }, 'mac')).toBe(false)
  })
})

describe('キーヒントのラベル', () => {
  it('プラットフォームごとの呼び方を返す', () => {
    expect(primaryModifierLabel('other')).toBe('Ctrl')
    expect(primaryModifierLabel('mac')).toBe('Cmd')
    expect(altModifierLabel('other')).toBe('Alt')
    expect(altModifierLabel('mac')).toBe('Option')
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/core/keyboard/platform.test.ts`
Expected: FAIL（`Failed to resolve import './platform'`）

- [ ] **Step 3: 最小実装**

`src/core/keyboard/platform.ts`:

```ts
/**
 * 修飾キーのプラットフォーム抽象（rev 10章）。
 * 各コンポーネントは Ctrl を直接見ない——Tauri は macOS でも動くため、
 * Ctrl 直書きだと macOS で Undo が効かない。
 */
export type Platform = 'mac' | 'other'

export interface ModifierState {
  ctrlKey: boolean
  metaKey: boolean
}

export function detectPlatform(userAgent: string): Platform {
  return /Mac|iPhone|iPad|iPod/i.test(userAgent) ? 'mac' : 'other'
}

/** 実行環境のプラットフォーム。navigator が無い環境（テストの node）では 'other' */
export function currentPlatform(): Platform {
  return typeof navigator === 'undefined' ? 'other' : detectPlatform(navigator.userAgent)
}

/**
 * 主修飾キー（Windows/Linux: Ctrl、macOS: Cmd）が押されているか。
 * もう一方が同時に押されている組み合わせは別のキーストロークなので false
 */
export function isPrimaryModifier(e: ModifierState, platform: Platform): boolean {
  return platform === 'mac' ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
}

/** キーヒント表示用のラベル（UI に「Ctrl+Z」と出すため） */
export function primaryModifierLabel(platform: Platform): string {
  return platform === 'mac' ? 'Cmd' : 'Ctrl'
}

export function altModifierLabel(platform: Platform): string {
  return platform === 'mac' ? 'Option' : 'Alt'
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/keyboard/platform.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: コミット**

```bash
git add src/core/keyboard/platform.ts src/core/keyboard/platform.test.ts
git commit -m "M3: 修飾キーのプラットフォーム抽象を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 操作言語のキーマップ（コア）

M3 の心臓部。キー→コマンドの解釈をここ1箇所に閉じる（rev 10章の実装規約）。IME・境界規則・導出表示中の無効化もすべてこの純関数の中で決まる。

**Files:**
- Create: `src/core/keyboard/keymap.ts`
- Test: `src/core/keyboard/keymap.test.ts`

**Interfaces:**
- Consumes: `isPrimaryModifier` / `Platform`（Task 3）
- Produces:
  - `Command`（`'undo' | 'redo' | 'cancel' | 'insert-item-after' | 'delete-item' | 'move-item-up' | 'move-item-down' | 'focus-prev' | 'focus-next' | 'focus-next-field' | 'focus-prev-field'`）
  - `KeyEventLike` / `KeyContext`
  - `resolveCommand(e: KeyEventLike, ctx: KeyContext): Command | null`
  - `toKeyEventLike(e): KeyEventLike`（React の合成イベント／DOM イベントの両方を受ける）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/keyboard/keymap.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveCommand, toKeyEventLike, type KeyContext, type KeyEventLike } from './keymap'

function key(over: Partial<KeyEventLike> & { key: string }): KeyEventLike {
  return { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, ...over }
}

/** 名称セルを編集中（テキスト入力・空でない・キャレットは中間）の既定文脈 */
function ctx(over: Partial<KeyContext> = {}): KeyContext {
  return {
    platform: 'other',
    modalOpen: false,
    editing: true,
    fieldEmpty: false,
    deletableField: true,
    caretAtStart: false,
    caretAtEnd: false,
    arrowsOwnedByField: false,
    reorderEnabled: true,
    ...over,
  }
}

describe('resolveCommand: IME と境界規則', () => {
  it('変換中のキーは一切コマンドにしない（変換確定 Enter の誤爆防止）', () => {
    expect(resolveCommand(key({ key: 'Enter', isComposing: true }), ctx())).toBeNull()
    expect(resolveCommand(key({ key: 'Escape', isComposing: true }), ctx())).toBeNull()
  })

  it('モーダル表示中は操作言語を停止する（Esc の取り合いを排除）', () => {
    expect(resolveCommand(key({ key: 'Enter' }), ctx({ modalOpen: true }))).toBeNull()
    expect(resolveCommand(key({ key: 'Escape' }), ctx({ modalOpen: true }))).toBeNull()
  })
})

describe('resolveCommand: グローバル層', () => {
  it('Ctrl+Z / Ctrl+Shift+Z（Windows）', () => {
    expect(resolveCommand(key({ key: 'z', ctrlKey: true }), ctx())).toBe('undo')
    expect(resolveCommand(key({ key: 'z', ctrlKey: true, shiftKey: true }), ctx())).toBe('redo')
  })

  it('macOS では Cmd+Z / Cmd+Shift+Z', () => {
    const mac = ctx({ platform: 'mac' })
    expect(resolveCommand(key({ key: 'z', metaKey: true }), mac)).toBe('undo')
    expect(resolveCommand(key({ key: 'Z', metaKey: true, shiftKey: true }), mac)).toBe('redo')
    // macOS で Ctrl+Z は主修飾キーではない
    expect(resolveCommand(key({ key: 'z', ctrlKey: true }), mac)).toBeNull()
  })

  it('テキスト編集中でも Undo は操作言語が取る（制御入力なので標準 Undo に任せない）', () => {
    expect(resolveCommand(key({ key: 'z', ctrlKey: true }), ctx({ editing: true }))).toBe('undo')
  })

  it('その他の主修飾キー付き（Ctrl+C など）は奪わない', () => {
    expect(resolveCommand(key({ key: 'c', ctrlKey: true }), ctx())).toBeNull()
    expect(resolveCommand(key({ key: 'a', ctrlKey: true }), ctx())).toBeNull()
  })

  it('Esc は編集のキャンセル', () => {
    expect(resolveCommand(key({ key: 'Escape' }), ctx())).toBe('cancel')
  })
})

describe('resolveCommand: 階層・リスト系ファミリー標準', () => {
  it('Enter は直後に行追加', () => {
    expect(resolveCommand(key({ key: 'Enter' }), ctx())).toBe('insert-item-after')
  })

  it('修飾つき Enter は取らない', () => {
    expect(resolveCommand(key({ key: 'Enter', shiftKey: true }), ctx())).toBeNull()
    expect(resolveCommand(key({ key: 'Enter', ctrlKey: true }), ctx())).toBeNull()
  })

  it('Tab はセル間移動（用語集に「子」が無いためファミリー標準の子追加には使わない）', () => {
    expect(resolveCommand(key({ key: 'Tab' }), ctx())).toBe('focus-next-field')
    expect(resolveCommand(key({ key: 'Tab', shiftKey: true }), ctx())).toBe('focus-prev-field')
  })

  it('空欄 Backspace は行削除。空でなければ通常の文字削除', () => {
    expect(resolveCommand(key({ key: 'Backspace' }), ctx({ fieldEmpty: true }))).toBe('delete-item')
    expect(resolveCommand(key({ key: 'Backspace' }), ctx({ fieldEmpty: false }))).toBeNull()
  })

  it('削除を認めない欄（定義セルなど）では空欄 Backspace でも行を消さない', () => {
    expect(
      resolveCommand(key({ key: 'Backspace' }), ctx({ fieldEmpty: true, deletableField: false })),
    ).toBeNull()
  })

  it('Alt+↑↓ は並び替え', () => {
    expect(resolveCommand(key({ key: 'ArrowUp', altKey: true }), ctx())).toBe('move-item-up')
    expect(resolveCommand(key({ key: 'ArrowDown', altKey: true }), ctx())).toBe('move-item-down')
  })

  it('導出表示中（検索・フィルタ適用中）は並び替えを無効化する', () => {
    const derived = ctx({ reorderEnabled: false })
    expect(resolveCommand(key({ key: 'ArrowUp', altKey: true }), derived)).toBeNull()
    expect(resolveCommand(key({ key: 'ArrowDown', altKey: true }), derived)).toBeNull()
  })
})

describe('resolveCommand: 矢印の境界規則', () => {
  it('編集中はキャレットが端にあるときだけ行間移動になる', () => {
    expect(resolveCommand(key({ key: 'ArrowUp' }), ctx({ caretAtStart: true }))).toBe('focus-prev')
    expect(resolveCommand(key({ key: 'ArrowUp' }), ctx({ caretAtStart: false }))).toBeNull()
    expect(resolveCommand(key({ key: 'ArrowDown' }), ctx({ caretAtEnd: true }))).toBe('focus-next')
    expect(resolveCommand(key({ key: 'ArrowDown' }), ctx({ caretAtEnd: false }))).toBeNull()
  })

  it('欄自身が↑↓を使う場合（select）は行間移動にしない', () => {
    const select = ctx({ editing: false, arrowsOwnedByField: true, caretAtStart: true, caretAtEnd: true })
    expect(resolveCommand(key({ key: 'ArrowUp' }), select)).toBeNull()
    // Alt+↑↓ の並び替えは select でも有効
    expect(resolveCommand(key({ key: 'ArrowUp', altKey: true }), select)).toBe('move-item-up')
  })

  it('Shift+矢印は選択拡張なので取らない', () => {
    expect(
      resolveCommand(key({ key: 'ArrowUp', shiftKey: true }), ctx({ caretAtStart: true })),
    ).toBeNull()
  })

  it('割り当ての無いキーは null', () => {
    expect(resolveCommand(key({ key: 'a' }), ctx())).toBeNull()
    expect(resolveCommand(key({ key: ' ' }), ctx())).toBeNull()
  })
})

describe('toKeyEventLike', () => {
  it('React の合成イベントは nativeEvent.isComposing を読む', () => {
    const e = {
      key: 'Enter',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      nativeEvent: { isComposing: true },
    }
    expect(toKeyEventLike(e).isComposing).toBe(true)
  })

  it('DOM イベントは自身の isComposing を読む', () => {
    const e = {
      key: 'Enter',
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
    }
    expect(toKeyEventLike(e).isComposing).toBe(false)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/core/keyboard/keymap.test.ts`
Expected: FAIL（`Failed to resolve import './keymap'`）

- [ ] **Step 3: 最小実装**

`src/core/keyboard/keymap.ts`:

```ts
import { isPrimaryModifier, type Platform } from './platform'

/**
 * 操作言語のコマンド（rev 10章）。各ツールは「意味の集合」を受け取り、
 * 自分の構造に写像する。キーの判定はこのモジュールの外に書かない。
 * 用語集は行のリストだが、別名パネル（入れ子のリスト）も同じ集合を使う
 */
export type Command =
  | 'undo'
  | 'redo'
  | 'cancel'
  | 'insert-item-after'
  | 'delete-item'
  | 'move-item-up'
  | 'move-item-down'
  | 'focus-prev'
  | 'focus-next'
  | 'focus-next-field'
  | 'focus-prev-field'

export interface KeyEventLike {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  /** IME 変換中か。true の間は操作言語の対象外（rev 10章） */
  isComposing: boolean
}

export interface KeyContext {
  platform: Platform
  /** モーダル表示中は操作言語を停止する（キーはモーダル側が取る） */
  modalOpen: boolean
  /** テキスト編集中か。矢印の扱いが変わる */
  editing: boolean
  /** 編集中の欄が空か（空欄 Backspace ＝削除の判定） */
  fieldEmpty: boolean
  /** 空欄 Backspace で要素の削除を認める欄か（用語集では名称セルのみ true） */
  deletableField: boolean
  /** キャレットが先頭／末尾にあるか（端でだけ行間移動に切り替える） */
  caretAtStart: boolean
  caretAtEnd: boolean
  /** 素の↑↓を欄自身が使うか（select は選択肢の切り替えに使う） */
  arrowsOwnedByField: boolean
  /** 並び替えが有効か。導出表示中は false（session-notes 論点4） */
  reorderEnabled: boolean
}

/**
 * キー入力を操作言語のコマンドに解決する。null＝アプリは関与しない
 *（既定動作を止めないこと）。
 *
 * 規則の順序に意味がある:
 *   1. IME 変換中は何も起こさない（日本語入力アプリ最大の地雷）
 *   2. モーダル表示中は停止（Esc の取り合いを構造的に排除）
 *   3. グローバル層（Undo/Redo）。テキスト編集中も操作言語が取る
 *   4. 構造依存層（階層・リスト系ファミリー標準）
 */
export function resolveCommand(e: KeyEventLike, ctx: KeyContext): Command | null {
  if (e.isComposing) return null
  if (ctx.modalOpen) return null

  if (isPrimaryModifier(e, ctx.platform)) {
    // 制御入力ではブラウザ標準の Undo が React の再レンダリングと食い違うため、
    // 編集中もアプリの履歴に一本化する（境界規則への明示的な例外）
    if (e.key === 'z' || e.key === 'Z') return e.shiftKey ? 'redo' : 'undo'
    // Ctrl+C / Ctrl+A などは奪わない
    return null
  }

  switch (e.key) {
    case 'Escape':
      return 'cancel'
    case 'Enter':
      return e.altKey || e.shiftKey ? null : 'insert-item-after'
    case 'Tab':
      if (e.altKey) return null
      return e.shiftKey ? 'focus-prev-field' : 'focus-next-field'
    case 'Backspace':
      if (e.altKey || e.shiftKey) return null
      return ctx.fieldEmpty && ctx.deletableField ? 'delete-item' : null
    case 'ArrowUp':
      if (e.altKey) return ctx.reorderEnabled ? 'move-item-up' : null
      if (e.shiftKey || ctx.arrowsOwnedByField) return null
      return !ctx.editing || ctx.caretAtStart ? 'focus-prev' : null
    case 'ArrowDown':
      if (e.altKey) return ctx.reorderEnabled ? 'move-item-down' : null
      if (e.shiftKey || ctx.arrowsOwnedByField) return null
      return !ctx.editing || ctx.caretAtEnd ? 'focus-next' : null
    default:
      return null
  }
}

/**
 * React の合成イベントと DOM の KeyboardEvent の差を吸収する。
 * React の合成イベントは isComposing を持たず nativeEvent 側にある
 */
export function toKeyEventLike(e: {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  isComposing?: boolean
  nativeEvent?: { isComposing?: boolean }
}): KeyEventLike {
  return {
    key: e.key,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
    isComposing: e.nativeEvent?.isComposing ?? e.isComposing ?? false,
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/keyboard/keymap.test.ts`
Expected: PASS（19件）

- [ ] **Step 5: コミット**

```bash
git add src/core/keyboard/keymap.ts src/core/keyboard/keymap.test.ts
git commit -m "M3: 操作言語のキーマップ（コア）を追加

キー→コマンドの解釈を resolveCommand の1箇所に閉じる（rev 10章）。
IME 変換中の停止・モーダル境界・導出表示中の並び替え無効化も
この純関数の中で決まる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Undo/Redo の履歴（コア）とエディタ規約の拡張

ファイル単位・メモリ内の履歴（rev 10章）。同一セルへの連続入力は1履歴にまとめ、構造操作（行追加・削除・並び替え）は常に1単位にする。あわせて、まとめ判定に使う `mergeKey` をエディタが渡せるよう `EditorProps.onChange` を拡張する。

**Files:**
- Create: `src/core/history.ts`
- Test: `src/core/history.test.ts`
- Modify: `src/core/registry.ts`（`EditorProps.onChange`）

**Interfaces:**
- Consumes: なし
- Produces:
  - `HistoryState<T>` / `createHistory<T>(present: T): HistoryState<T>`
  - `record<T>(h, next: T, mergeKey: string | null, now: number): HistoryState<T>`
  - `undo<T>(h): HistoryState<T>` / `redo<T>(h): HistoryState<T>`（変化しないときは同一参照を返す）
  - `canUndo(h): boolean` / `canRedo(h): boolean`
  - `EditorProps.onChange: (next: TData, mergeKey?: string | null) => void`（Task 11 以降のエディタと Task 15 の App が使う）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canRedo, canUndo, createHistory, record, redo, undo, HISTORY_LIMIT } from './history'

describe('history', () => {
  it('初期状態は undo も redo もできない', () => {
    const h = createHistory('a')
    expect(h.present).toBe('a')
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('record したら undo で1つ前に戻り、redo で進む', () => {
    let h = createHistory('a')
    h = record(h, 'b', null, 1000)
    expect(canUndo(h)).toBe(true)
    h = undo(h)
    expect(h.present).toBe('a')
    expect(canRedo(h)).toBe(true)
    h = redo(h)
    expect(h.present).toBe('b')
  })

  it('同じ mergeKey の連続入力は1つの履歴にまとめる', () => {
    let h = createHistory('')
    h = record(h, '受', 'row1:name', 1000)
    h = record(h, '受注', 'row1:name', 1200)
    h = record(h, '受注書', 'row1:name', 1400)
    h = undo(h)
    // 1打鍵ずつではなく、入力を始める前まで戻る
    expect(h.present).toBe('')
  })

  it('間が空いたら別の履歴になる', () => {
    let h = createHistory('')
    h = record(h, '受', 'row1:name', 1000)
    h = record(h, '受注', 'row1:name', 3000)
    h = undo(h)
    expect(h.present).toBe('受')
  })

  it('別のセルへ移ったら別の履歴になる', () => {
    let h = createHistory('a')
    h = record(h, 'b', 'row1:name', 1000)
    h = record(h, 'c', 'row2:name', 1100)
    h = undo(h)
    expect(h.present).toBe('b')
  })

  it('mergeKey が null（構造操作）は常に別の履歴', () => {
    let h = createHistory('a')
    h = record(h, 'b', null, 1000)
    h = record(h, 'c', null, 1001)
    h = undo(h)
    expect(h.present).toBe('b')
  })

  it('undo の直後の入力は、戻る前の状態にまとめられない', () => {
    let h = createHistory('a')
    h = record(h, 'b', 'row1:name', 1000)
    h = undo(h)
    h = record(h, 'c', 'row1:name', 1050)
    h = undo(h)
    expect(h.present).toBe('a')
  })

  it('record すると redo 先は捨てられる', () => {
    let h = createHistory('a')
    h = record(h, 'b', null, 1000)
    h = undo(h)
    h = record(h, 'c', null, 2000)
    expect(canRedo(h)).toBe(false)
    expect(h.present).toBe('c')
  })

  it('戻れないときの undo / 進めないときの redo は同じ状態を返す', () => {
    const h = createHistory('a')
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })

  it('履歴は上限で古いほうから捨てる（メモリ内なので無限に伸ばさない）', () => {
    let h = createHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = record(h, i, null, i * 10_000)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]).toBe(10)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/core/history.test.ts`
Expected: FAIL（`Failed to resolve import './history'`）

- [ ] **Step 3: 最小実装**

`src/core/history.ts`:

```ts
/**
 * Undo/Redo の履歴（コア・純関数。React 非依存）。
 * 開いているファイル単位・メモリ内のみ。それ以前への復帰は Git の担当
 *（rev 5章の二層構造 / rev 10章のグローバル層）。
 */
export interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
  /** 直近 record のまとめキー。null＝まとめない（構造操作） */
  lastKey: string | null
  /** 直近 record の時刻（ミリ秒） */
  lastAt: number
}

/** 保持する履歴の上限。会議1回分の編集には十分で、メモリは有界にする */
export const HISTORY_LIMIT = 100
/** 同一セルへの連続入力を1履歴にまとめる時間窓（ミリ秒） */
export const COALESCE_MS = 500

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: Number.NEGATIVE_INFINITY }
}

/**
 * 新しい状態を積む。mergeKey が直前と同じで時間窓の内なら、履歴を増やさず
 * present だけ差し替える（1打鍵＝1履歴だと会議中に使い物にならないため）
 */
export function record<T>(
  h: HistoryState<T>,
  next: T,
  mergeKey: string | null,
  now: number,
): HistoryState<T> {
  const mergeable = mergeKey !== null && mergeKey === h.lastKey && now - h.lastAt <= COALESCE_MS
  if (mergeable) {
    return { ...h, present: next, future: [], lastAt: now }
  }
  const past = [...h.past, h.present]
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    future: [],
    lastKey: mergeKey,
    lastAt: now,
  }
}

export function canUndo(h: HistoryState<unknown>): boolean {
  return h.past.length > 0
}

export function canRedo(h: HistoryState<unknown>): boolean {
  return h.future.length > 0
}

/** 戻れないときは同一参照を返す（呼び出し側が「変化なし」を参照比較で判定できる） */
export function undo<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.past.length === 0) return h
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    // 戻った直後の入力を、戻る前の履歴にまとめない
    lastKey: null,
    lastAt: Number.NEGATIVE_INFINITY,
  }
}

export function redo<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.future.length === 0) return h
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
    lastKey: null,
    lastAt: Number.NEGATIVE_INFINITY,
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/history.test.ts`
Expected: PASS（10件）

- [ ] **Step 5: エディタ規約に mergeKey を足す**

`src/core/registry.ts` の `EditorProps` を次に置き換える:

```ts
export interface EditorProps<TData> {
  data: TData
  /**
   * 編集の反映。mergeKey は Undo 履歴のまとめ単位（同一セルへの連続入力は
   * 同じキーを渡すと1履歴にまとまる）。構造操作（行追加・削除・並び替え）は
   * null を渡して常に独立した履歴にする
   */
  onChange: (next: TData, mergeKey?: string | null) => void
  /** このファイルの整合性検証結果（レベル2）。エディタはセル・行の赤表示に使う */
  issues: ConsistencyIssue[]
}
```

- [ ] **Step 6: 型チェックと全テスト**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS（App / GlossaryEditor は引数を増やしただけなので既存コードのまま通る）

- [ ] **Step 7: コミット**

```bash
git add src/core/history.ts src/core/history.test.ts src/core/registry.ts
git commit -m "M3: Undo/Redo の履歴（コア）と EditorProps の mergeKey を追加

同一セルへの連続入力は時間窓でまとめ、構造操作は常に1履歴にする。
1打鍵＝1履歴では会議中の実用性が無いため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 新規用語の ID 採番（コア）

Enter による行追加で必要になる。Skill 側の `scripts/new-id.mjs` と同じ規約（`<entityPrefix>_` ＋ 62文字アルファベットの10文字）。アプリと AI が並行して要素を追加するため連番は使えない。

**Files:**
- Create: `src/core/new-id.ts`
- Test: `src/core/new-id.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `newId(prefix: string, randomBytes?: RandomBytes): string` / `RandomBytes = (count: number) => Uint8Array`（Task 12 が使う）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/new-id.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import glossarySchema from '../../schemas/glossary.schema.json'
import { newId, type RandomBytes } from './new-id'

/** 決められたバイト列を順に返す乱数源（呼び出しごとに次の配列） */
function bytesFrom(...queue: number[][]): RandomBytes {
  let i = 0
  return () => new Uint8Array(queue[Math.min(i++, queue.length - 1)])
}

describe('newId', () => {
  it('prefix ＋ 62文字アルファベットの10文字を返す', () => {
    expect(newId('term', bytesFrom([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe('term_ABCDEFGHIJ')
  })

  it('剰余の偏りを作らないため 248 以上のバイトは捨てる', () => {
    const id = newId(
      'term',
      bytesFrom([248, 249, 250, 251, 252, 253, 254, 255, 0, 1], [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    )
    expect(id).toBe('term_ABCDEFGHIJ')
  })

  it('スキーマの ID パターンに一致する（実際の乱数源で）', () => {
    const pattern = new RegExp(glossarySchema.$defs.term.properties.id.pattern)
    for (let i = 0; i < 50; i++) expect(newId('term')).toMatch(pattern)
  })

  it('連番ではない（同じ値を続けて返さない）', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId('term')))
    expect(ids.size).toBe(100)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/core/new-id.test.ts`
Expected: FAIL（`Failed to resolve import './new-id'`）

- [ ] **Step 3: 最小実装**

`src/core/new-id.ts`:

```ts
/**
 * ID 採番（rev 5章の ID 規約）。<entityPrefix>_<62文字アルファベットの10文字>。
 * Skill 側の scripts/new-id.mjs と同じ規約——アプリと AI が並行して要素を
 * 追加するため、連番は必ず衝突する。
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const LENGTH = 10
/** 256 を 62 で割り切れる最大の倍数。これ以上の値を捨てて剰余の偏りを消す */
const LIMIT = 248

export type RandomBytes = (count: number) => Uint8Array

const cryptoRandomBytes: RandomBytes = (count) => crypto.getRandomValues(new Uint8Array(count))

export function newId(prefix: string, randomBytes: RandomBytes = cryptoRandomBytes): string {
  let body = ''
  while (body.length < LENGTH) {
    for (const b of randomBytes(LENGTH)) {
      if (b >= LIMIT) continue
      body += ALPHABET[b % ALPHABET.length]
      if (body.length === LENGTH) break
    }
  }
  return `${prefix}_${body}`
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/new-id.test.ts`
Expected: PASS（4件）

- [ ] **Step 5: コミット**

```bash
git add src/core/new-id.ts src/core/new-id.test.ts
git commit -m "M3: 新規用語の ID 採番（Skill の new-id.mjs と同規約）を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 配列操作と行の同一性キー（コア）

行の追加・削除・並び替えの土台と、React の key ／ 赤表示の対応づけに使う行キー。

**Files:**
- Create: `src/core/list-ops.ts`
- Test: `src/core/list-ops.test.ts`
- Create: `src/core/row-keys.ts`
- Test: `src/core/row-keys.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `insertAt<T>(items: readonly T[], index: number, item: T): T[]`
  - `removeAt<T>(items: readonly T[], index: number): T[]`
  - `moveItem<T>(items: readonly T[], from: number, to: number): T[]`
  - `computeRowKeys(items: readonly { id: string }[]): string[]`
  （Task 12・13 が使う）

- [ ] **Step 1: 失敗するテストを書く**

`src/core/list-ops.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { insertAt, moveItem, removeAt } from './list-ops'

describe('insertAt', () => {
  it('指定位置に挿入する', () => {
    expect(insertAt(['a', 'b', 'c'], 1, 'x')).toEqual(['a', 'x', 'b', 'c'])
  })

  it('末尾より後ろの位置は末尾に足す', () => {
    expect(insertAt(['a'], 5, 'x')).toEqual(['a', 'x'])
  })

  it('元の配列を書き換えない', () => {
    const src = ['a', 'b']
    insertAt(src, 0, 'x')
    expect(src).toEqual(['a', 'b'])
  })
})

describe('removeAt', () => {
  it('指定位置を取り除く', () => {
    expect(removeAt(['a', 'b', 'c'], 1)).toEqual(['a', 'c'])
  })

  it('範囲外は何も起きない', () => {
    expect(removeAt(['a'], 3)).toEqual(['a'])
    expect(removeAt(['a'], -1)).toEqual(['a'])
  })
})

describe('moveItem', () => {
  it('前に動かす', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b'])
  })

  it('後ろに動かす', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c'])
  })

  it('範囲外への移動は何も起きない（先頭で Alt+↑ を押しても壊れない）', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b'])
  })
})
```

`src/core/row-keys.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { computeRowKeys } from './row-keys'

describe('computeRowKeys', () => {
  it('ID が一意なら ID 由来の安定したキーになる', () => {
    expect(computeRowKeys([{ id: 'term_a' }, { id: 'term_b' }])).toEqual([
      'term_a#0',
      'term_b#0',
    ])
  })

  it('ID が重複していても一意なキーになる（重複キーで描画が壊れない）', () => {
    const keys = computeRowKeys([{ id: 'term_a' }, { id: 'term_a' }, { id: 'term_b' }])
    expect(keys).toEqual(['term_a#0', 'term_a#1', 'term_b#0'])
    expect(new Set(keys).size).toBe(3)
  })

  it('他の行を並び替えてもキーは変わらない（行の同一性が保てる）', () => {
    const before = computeRowKeys([{ id: 'term_a' }, { id: 'term_b' }, { id: 'term_c' }])
    const after = computeRowKeys([{ id: 'term_b' }, { id: 'term_a' }, { id: 'term_c' }])
    expect(after).toEqual([before[1], before[0], before[2]])
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/core/list-ops.test.ts src/core/row-keys.test.ts`
Expected: FAIL（両方 import 解決に失敗）

- [ ] **Step 3: 最小実装**

`src/core/list-ops.ts`:

```ts
/**
 * 配列の構造操作（コア・純関数）。すべて新しい配列を返す。
 * 範囲外の指定では「何も起きない」——先頭行で Alt+↑ を押しても壊れないこと
 */
export function insertAt<T>(items: readonly T[], index: number, item: T): T[] {
  const next = [...items]
  next.splice(index, 0, item)
  return next
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
  if (index < 0 || index >= items.length) return [...items]
  const next = [...items]
  next.splice(index, 1)
  return next
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items]
  if (to < 0 || to >= items.length || from === to) return [...items]
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
```

`src/core/row-keys.ts`:

```ts
/**
 * 行の同一性キー。React の key と、赤表示・フォーカス移動の対応づけに使う。
 *
 * ID 重複ファイルを「受け入れて赤表示」する以上 id 単体では一意にならず、
 * 配列 index は並び替えで行の同一性が保てない。出現順で曖昧さだけを解消する
 *（ID が一意なら常に同じキーになる）。データから毎回導出できるので、
 * 履歴・外部変更と食い違う内部状態を持たない
 */
export function computeRowKeys(items: readonly { id: string }[]): string[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const n = seen.get(item.id) ?? 0
    seen.set(item.id, n + 1)
    return `${item.id}#${n}`
  })
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/list-ops.test.ts src/core/row-keys.test.ts`
Expected: PASS（11件）

- [ ] **Step 5: コミット**

```bash
git add src/core/list-ops.ts src/core/list-ops.test.ts src/core/row-keys.ts src/core/row-keys.test.ts
git commit -m "M3: 配列操作と行の同一性キーをコアに追加

行キーが配列 index のままだと並び替えで行の同一性が保てない
（M2 申し送り）。ID ＋出現順で ID 重複時も一意にする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: 検索と種別フィルタ（用語集モジュール）

インクリメンタル検索（name / aliases / definition 横断）＋種別フィルタ（session-notes 論点6）。照合は重複判定と同じ `normalizeForMatch` を使う（M2 申し送り）。

**Files:**
- Create: `src/modules/glossary/search.ts`
- Test: `src/modules/glossary/search.test.ts`

**Interfaces:**
- Consumes: `normalizeForMatch`（`src/core/normalize.ts`）/ `Term`
- Produces: `GlossaryFilter` / `EMPTY_FILTER` / `isDerivedView(filter): boolean` / `filterTermIndices(terms, filter): number[]`（Task 11・12・14 が使う）

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/glossary/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Term } from '@/types/glossary'
import { EMPTY_FILTER, filterTermIndices, isDerivedView } from './search'

function term(over: Partial<Term> & { id: string; name: string }): Term {
  return { kind: 'other', definition: '', aliases: [], notes: '', ...over }
}

const terms: Term[] = [
  term({ id: 'term_a', name: '受注', kind: 'event', definition: '注文を受けること', aliases: ['オーダー'] }),
  term({ id: 'term_b', name: '見積', kind: 'data', definition: '', aliases: ['ＥＳＴ'] }),
  term({ id: 'term_c', name: '担当者', kind: 'actor', definition: '案件を持つ人', aliases: [] }),
]

describe('filterTermIndices', () => {
  it('絞り込み無しなら全件を配列順で返す', () => {
    expect(filterTermIndices(terms, EMPTY_FILTER)).toEqual([0, 1, 2])
  })

  it('name を部分一致で絞る', () => {
    expect(filterTermIndices(terms, { query: '受', kinds: [] })).toEqual([0])
  })

  it('definition も横断して絞る', () => {
    expect(filterTermIndices(terms, { query: '案件', kinds: [] })).toEqual([2])
  })

  it('aliases も横断して絞る', () => {
    expect(filterTermIndices(terms, { query: 'オーダー', kinds: [] })).toEqual([0])
  })

  it('照合は重複判定と同じ正規化を使う（NFKC＋大文字小文字＋前後空白）', () => {
    expect(filterTermIndices(terms, { query: 'est', kinds: [] })).toEqual([1])
    expect(filterTermIndices(terms, { query: '  受注  ', kinds: [] })).toEqual([0])
  })

  it('種別フィルタで絞る（複数選択は OR）', () => {
    expect(filterTermIndices(terms, { query: '', kinds: ['actor'] })).toEqual([2])
    expect(filterTermIndices(terms, { query: '', kinds: ['actor', 'data'] })).toEqual([1, 2])
  })

  it('検索と種別フィルタは AND', () => {
    expect(filterTermIndices(terms, { query: '受', kinds: ['actor'] })).toEqual([])
  })

  it('notes は検索対象外（検知対象外の自由メモ。session-notes 論点2）', () => {
    const withNotes = [term({ id: 'term_x', name: '請求', notes: 'あとで確認' })]
    expect(filterTermIndices(withNotes, { query: 'あとで', kinds: [] })).toEqual([])
  })
})

describe('isDerivedView', () => {
  it('絞り込みが無ければ導出表示ではない（並び替えできる）', () => {
    expect(isDerivedView(EMPTY_FILTER)).toBe(false)
    expect(isDerivedView({ query: '   ', kinds: [] })).toBe(false)
  })

  it('検索文字列か種別フィルタがあれば導出表示（並び替えを止める）', () => {
    expect(isDerivedView({ query: '受', kinds: [] })).toBe(true)
    expect(isDerivedView({ query: '', kinds: ['actor'] })).toBe(true)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/modules/glossary/search.test.ts`
Expected: FAIL（`Failed to resolve import './search'`）

- [ ] **Step 3: 最小実装**

`src/modules/glossary/search.ts`:

```ts
import { normalizeForMatch } from '@/core/normalize'
import type { Term } from '@/types/glossary'

/**
 * 検索・種別フィルタ（session-notes 論点6）。
 * 照合は重複判定と同じ normalizeForMatch を使う——同じアプリの中で
 * 「同じ語とみなす規則」を2つ持たない。
 * notes は検知対象外の自由メモなので検索対象に含めない（論点2）。
 */
export interface GlossaryFilter {
  /** インクリメンタル検索の文字列（name / aliases / definition 横断） */
  query: string
  /** 種別フィルタ。空配列＝絞り込みなし。複数指定は OR */
  kinds: readonly string[]
}

export const EMPTY_FILTER: GlossaryFilter = { query: '', kinds: [] }

/**
 * 導出表示か（＝データ順と表示順が食い違いうるか）。
 * true の間は並び替え（Alt+↑↓）を無効にする（session-notes 論点4）
 */
export function isDerivedView(filter: GlossaryFilter): boolean {
  return normalizeForMatch(filter.query) !== '' || filter.kinds.length > 0
}

/** 表示する用語の「元配列での index」を配列順のまま返す */
export function filterTermIndices(terms: readonly Term[], filter: GlossaryFilter): number[] {
  const query = normalizeForMatch(filter.query)
  const kinds = new Set(filter.kinds)
  const out: number[] = []
  terms.forEach((term, index) => {
    if (kinds.size > 0 && !kinds.has(term.kind)) return
    if (query !== '' && !matches(term, query)) return
    out.push(index)
  })
  return out
}

function matches(term: Term, normalizedQuery: string): boolean {
  return [term.name, term.definition, ...term.aliases].some((s) =>
    normalizeForMatch(s).includes(normalizedQuery),
  )
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/modules/glossary/search.test.ts`
Expected: PASS（10件）

- [ ] **Step 5: コミット**

```bash
git add src/modules/glossary/search.ts src/modules/glossary/search.test.ts
git commit -m "M3: 検索と種別フィルタを追加（照合は normalizeForMatch に一本化）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: 列の順序と Tab 移動（用語集モジュール）

Tab／Shift+Tab の移動先を決める純関数。行端では隣の行へ折り返す。

**Files:**
- Create: `src/modules/glossary/fields.ts`
- Test: `src/modules/glossary/fields.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `FIELD_ORDER` / `GlossaryField` / `FIELD_LABELS` / `FieldStep` / `stepField(field, direction): FieldStep`（Task 11・12・13 が使う）

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/glossary/fields.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FIELD_LABELS, FIELD_ORDER, stepField } from './fields'

describe('FIELD_ORDER', () => {
  it('列は名称／種別／定義／別名／備考の5つ（ID は列に出さない）', () => {
    expect(FIELD_ORDER).toEqual(['name', 'kind', 'definition', 'aliases', 'notes'])
  })

  it('全列に日本語の見出しがある', () => {
    for (const field of FIELD_ORDER) expect(FIELD_LABELS[field]).toBeTruthy()
  })
})

describe('stepField', () => {
  it('Tab は右のセルへ', () => {
    expect(stepField('name', 1)).toEqual({ field: 'kind', rowDelta: 0 })
  })

  it('Shift+Tab は左のセルへ', () => {
    expect(stepField('definition', -1)).toEqual({ field: 'kind', rowDelta: 0 })
  })

  it('右端の Tab は次の行の先頭列へ折り返す', () => {
    expect(stepField('notes', 1)).toEqual({ field: 'name', rowDelta: 1 })
  })

  it('左端の Shift+Tab は前の行の末尾列へ折り返す', () => {
    expect(stepField('name', -1)).toEqual({ field: 'notes', rowDelta: -1 })
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/modules/glossary/fields.test.ts`
Expected: FAIL（`Failed to resolve import './fields'`）

- [ ] **Step 3: 最小実装**

`src/modules/glossary/fields.ts`:

```ts
/**
 * 用語集エディタの列（session-notes 論点6）。
 * 名称／種別／定義／別名／備考の5列。ID は列に出さない
 *（機械用の参照キーであり、人間が常時見る情報ではない）。
 */
export const FIELD_ORDER = ['name', 'kind', 'definition', 'aliases', 'notes'] as const

export type GlossaryField = (typeof FIELD_ORDER)[number]

export const FIELD_LABELS: Record<GlossaryField, string> = {
  name: '名称',
  kind: '種別',
  definition: '定義',
  aliases: '別名',
  notes: '備考',
}

export interface FieldStep {
  field: GlossaryField
  /** 行の移動量。1＝次の行の先頭列へ、-1＝前の行の末尾列へ */
  rowDelta: -1 | 0 | 1
}

/**
 * Tab / Shift+Tab の移動先。行端では隣の行へ折り返す。
 * 移動先の行が無い場合は呼び出し側が何もしない（既定の Tab 動作を止めない）
 */
export function stepField(field: GlossaryField, direction: 1 | -1): FieldStep {
  const index = FIELD_ORDER.indexOf(field)
  const next = index + direction
  if (next < 0) return { field: FIELD_ORDER[FIELD_ORDER.length - 1], rowDelta: -1 }
  if (next >= FIELD_ORDER.length) return { field: FIELD_ORDER[0], rowDelta: 1 }
  return { field: FIELD_ORDER[next], rowDelta: 0 }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/modules/glossary/fields.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: コミット**

```bash
git add src/modules/glossary/fields.ts src/modules/glossary/fields.test.ts
git commit -m "M3: 用語集の列順序と Tab 移動の解決を追加

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: 制御入力セル（IME 対応）

M1 申し送りの「非制御入力からの移行」。`defaultValue` 方式は IME 対応を回避するための暫定で、Undo が表示に反映されない。変換中は親へ値を上げないことで巻き戻りを防ぎ、`sanitize` で「データに載せない入力」（空の名称）を表現する。

**Files:**
- Create: `src/components/CellInput.tsx`

**Interfaces:**
- Consumes: なし
- Produces:
  - `FieldState = { empty: boolean; caretAtStart: boolean; caretAtEnd: boolean }`
  - `CellInputProps`
  - `CellInput`（Task 11・13 が使う）

- [ ] **Step 1: 実装する**

このタスクの検証は Task 16 の DOM テストで行う（コンポーネントの振る舞いは形が固まってからまとめて検証する方針）。実装後は型チェックと lint で通ることを確認する。

`src/components/CellInput.tsx`:

```tsx
import { useRef, useState } from 'react'

/** キー処理に必要な入力欄の状態。操作言語の KeyContext に詰め替えて使う */
export interface FieldState {
  empty: boolean
  caretAtStart: boolean
  caretAtEnd: boolean
}

export interface CellInputProps {
  value: string
  onValueChange: (next: string) => void
  /**
   * 生入力をデータに載せる値へ変換する。null＝この入力はデータに反映しない。
   * 例: 名称はスキーマで minLength 1 なので、空にしている途中の状態を
   * 書き込むとレベル1違反ファイルを自分で作ってしまう
   */
  sanitize?: (raw: string) => string | null
  /** キー処理は呼び出し側（操作言語）が行う。ここではキーの意味を決めない */
  onFieldKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>, state: FieldState) => void
  placeholder?: string
  className?: string
  'aria-label': string
  'data-cell'?: string
}

/**
 * 表のセル用の制御入力。IME 対応（rev 10章）を1箇所に閉じる。
 *
 * - 変換中は親へ値を上げない。上げると親の再レンダリングで未確定文字列が
 *   巻き戻り、IME が壊れる（日本語入力アプリ最大の地雷）
 * - 親から来た value が変わったらドラフトを捨てる。これが Undo と
 *   外部変更の取り込みを表示に反映する経路になる
 * - キーの意味は決めない。onFieldKeyDown に状態を添えて渡すだけ
 */
export function CellInput(props: CellInputProps) {
  const { value, onValueChange, sanitize, onFieldKeyDown, placeholder, className } = props
  // 未反映の生入力。null＝表示は親の value をそのまま使う
  const [draft, setDraft] = useState<string | null>(null)
  // 直近に見た親の value。変わったらドラフトを捨てる
  const [seenValue, setSeenValue] = useState(value)
  const composing = useRef(false)

  if (value !== seenValue) {
    setSeenValue(value)
    setDraft(null)
  }

  const commit = (raw: string) => {
    const next = sanitize ? sanitize(raw) : raw
    if (next !== null) onValueChange(next)
  }

  return (
    <input
      className={className}
      placeholder={placeholder}
      aria-label={props['aria-label']}
      data-cell={props['data-cell']}
      value={draft ?? value}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        if (composing.current) return
        commit(raw)
      }}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={(e) => {
        composing.current = false
        const raw = e.currentTarget.value
        setDraft(raw)
        commit(raw)
      }}
      onKeyDown={(e) => {
        const el = e.currentTarget
        onFieldKeyDown?.(e, {
          empty: el.value === '',
          caretAtStart: el.selectionStart === 0 && el.selectionEnd === 0,
          caretAtEnd:
            el.selectionStart === el.value.length && el.selectionEnd === el.value.length,
        })
      }}
      // 反映されなかった入力（空の名称など）を残さない。抜けたら確定値に戻す
      onBlur={() => setDraft(null)}
    />
  )
}
```

- [ ] **Step 2: 型チェックと lint**

Run: `npx tsc -b && npm run lint`
Expected: PASS（未使用の警告が出ないこと）

- [ ] **Step 3: 全テストが壊れていないことを確認する**

Run: `npm test`
Expected: PASS（既存テストのみ。CellInput のテストは Task 16）

- [ ] **Step 4: コミット**

```bash
git add src/components/CellInput.tsx
git commit -m "M3: IME 対応の制御入力セルを追加

変換中は親へ値を上げず、親の value 変更でドラフトを捨てる。
M1 の defaultValue 方式（IME 回避の暫定）を置き換える土台。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: エディタを制御入力・行キー・配列位置マークへ移行

M1 暫定の作り直しの第1段。この時点ではキーボード操作を入れず、「表示と反映の仕組み」だけを差し替える（操作言語は Task 12、別名パネルは Task 13、検索 UI は Task 14）。

**Files:**
- Modify: `src/modules/glossary/GlossaryEditor.tsx`（全面置き換え）

**Interfaces:**
- Consumes: `CellInput` / `FieldState`（Task 10）、`computeRowKeys`（Task 7）、`kindLabel`（Task 2）、`FIELD_LABELS`（Task 9）、`EMPTY_FILTER` / `filterTermIndices` / `GlossaryFilter`（Task 8）、`ConsistencyLocation.entityIndex`（Task 1）、`EditorProps`（Task 5）
- Produces: `GlossaryEditor`（`src/modules/glossary/module.ts` から参照済み。props は変わらない）

- [ ] **Step 1: エディタを置き換える**

`src/modules/glossary/GlossaryEditor.tsx` の全体を次に置き換える:

```tsx
import { useState } from 'react'
import { CellInput } from '@/components/CellInput'
import type { EditorProps } from '@/core/registry'
import { computeRowKeys } from '@/core/row-keys'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { FIELD_LABELS, type GlossaryField } from './fields'
import { kindLabel } from './kind-labels'
import { EMPTY_FILTER, filterTermIndices, type GlossaryFilter } from './search'

// 種別の選択肢はスキーマの enum から実行時に導出する（ハードコードすると enum 改訂時に静かにずれる）
const KIND_OPTIONS = glossarySchema.$defs.term.properties.kind.enum

const cellInput =
  'w-full bg-transparent px-2 py-1 text-ink outline-none focus:bg-surface rounded-sm'
// レベル2エラー（受け入れて赤表示）と warning（undecided / 未定義）は
// どちらも同系色の面で示し、濃さで強度を区別する。
// 波線下線は表記ゆれの「指摘（suggestion）」用に予約されているため使わない
// （glossary-session-notes 論点5）。濃さの値は仮置きで、確定は M7
const errorCell = 'bg-warning/25'
const warnCell = 'bg-warning/10'

/** セルの DOM 上の識別子。フォーカス移動（Task 12）が querySelector で引く */
function cellId(rowKey: string, field: GlossaryField): string {
  return `${rowKey}:${field}`
}

export function GlossaryEditor({ data, onChange, issues }: EditorProps<GlossarySchemaVersion1>) {
  // 検索・フィルタの UI は Task 14 で足す。ここでは絞り込み無しで通す
  const [filter] = useState<GlossaryFilter>(EMPTY_FILTER)

  const rowKeys = computeRowKeys(data.terms)
  const visible = filterTermIndices(data.terms, filter)

  const updateTerm = (index: number, patch: Partial<Term>, mergeKey: string | null) => {
    const terms = data.terms.map((t, i) => (i === index ? { ...t, ...patch } : t))
    onChange({ ...data, terms }, mergeKey)
  }

  // locations を「配列位置 → 赤表示するフィールド集合」に引き直す。
  // entityId ではなく位置で引く——ID 重複時に同じ ID を持つ全行へ
  // マークが波及しないようにするため（M2 申し送り）。
  // field 'id' は ID 列が UI に無いため行全体の赤表示として扱う
  const marks = new Map<number, Set<string>>()
  for (const issue of issues) {
    for (const loc of issue.locations) {
      if (loc.entityIndex === null) continue
      const set = marks.get(loc.entityIndex) ?? new Set<string>()
      if (loc.field !== null) set.add(loc.field)
      marks.set(loc.entityIndex, set)
    }
  }
  const mark = (index: number, field: string) => (marks.get(index)?.has(field) ? ` ${errorCell}` : '')

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
            <th className="w-40 px-2 py-1 font-normal">{FIELD_LABELS.name}</th>
            <th className="w-32 px-2 py-1 font-normal">{FIELD_LABELS.kind}</th>
            <th className="px-2 py-1 font-normal">{FIELD_LABELS.definition}</th>
            <th className="w-44 px-2 py-1 font-normal">{FIELD_LABELS.aliases}</th>
            <th className="w-44 px-2 py-1 font-normal">{FIELD_LABELS.notes}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((index, visiblePos) => {
            const term = data.terms[index]
            const rowKey = rowKeys[index]
            const row = visiblePos + 1
            return (
              <tr key={rowKey} className={`border-b border-rule align-top${mark(index, 'id')}`}>
                <td className={mark(index, 'name')}>
                  <CellInput
                    className={cellInput}
                    aria-label={`${FIELD_LABELS.name}（${row}行目）`}
                    data-cell={cellId(rowKey, 'name')}
                    value={term.name}
                    // 空の名称はスキーマ違反（minLength 1）なのでデータに載せない。
                    // 空欄の間の表示は CellInput のドラフトが持ち、セルを抜けると戻る
                    sanitize={(raw) => (raw.trim() === '' ? null : raw)}
                    onValueChange={(v) => updateTerm(index, { name: v }, `${rowKey}:name`)}
                  />
                </td>
                <td className={term.kind === 'undecided' ? warnCell : ''}>
                  <select
                    className={cellInput}
                    aria-label={`${FIELD_LABELS.kind}（${row}行目）`}
                    data-cell={cellId(rowKey, 'kind')}
                    value={term.kind}
                    onChange={(e) =>
                      updateTerm(index, { kind: e.target.value as Term['kind'] }, null)
                    }
                  >
                    {KIND_OPTIONS.map((kind) => (
                      <option key={kind} value={kind}>
                        {kindLabel(kind)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={term.definition === '' ? warnCell : ''}>
                  <CellInput
                    className={`${cellInput} placeholder:text-warning/70`}
                    aria-label={`${FIELD_LABELS.definition}（${row}行目）`}
                    data-cell={cellId(rowKey, 'definition')}
                    // 空欄は「未定義」と明示する（負債を消えなくして見せる。
                    // M6 の Markdown 出力が空定義を「（未定義）」と書く仕様と揃える）
                    placeholder="未定義"
                    value={term.definition}
                    onValueChange={(v) =>
                      updateTerm(index, { definition: v }, `${rowKey}:definition`)
                    }
                  />
                </td>
                <td className={mark(index, 'aliases')}>
                  {/* 別名パネルへの差し替えは Task 13。ここでは M1 と同じ読点区切り */}
                  <CellInput
                    className={cellInput}
                    aria-label={`${FIELD_LABELS.aliases}（${row}行目）`}
                    data-cell={cellId(rowKey, 'aliases')}
                    value={term.aliases.join('、')}
                    onValueChange={(v) =>
                      updateTerm(
                        index,
                        { aliases: v.split('、').map((s) => s.trim()).filter((s) => s !== '') },
                        `${rowKey}:aliases`,
                      )
                    }
                  />
                </td>
                <td>
                  <CellInput
                    className={cellInput}
                    aria-label={`${FIELD_LABELS.notes}（${row}行目）`}
                    data-cell={cellId(rowKey, 'notes')}
                    value={term.notes}
                    onValueChange={(v) => updateTerm(index, { notes: v }, `${rowKey}:notes`)}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: 型チェック・lint・全テスト**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

- [ ] **Step 3: アプリで表示を確認する**

Run: `npm run tauri dev`

> **注意**: 別チェックアウト（main など）の dev サーバーが先にポート5173を掴んでいると、古いコードのアプリが表示される。`Get-NetTCPConnection -LocalPort 5173` で掴んでいるプロセスを確認してから起動すること。

`sample-project` を開き、次を確認する:

- 種別セルが日本語（アクター／状態／イベント／画面／データ／その他／未分類）で表示される
- 名称・定義・別名・備考を編集でき、自動保存される
- 名称を全部消してセルを抜けると、元の名称に戻る（空のまま保存されない）

確認後、編集を破棄する: `git restore sample-project`

- [ ] **Step 4: コミット**

```bash
git add src/modules/glossary/GlossaryEditor.tsx
git commit -m "M3: エディタを制御入力・行キー・配列位置マークへ移行

M1 の defaultValue 方式（IME 回避の暫定）と index 行キーを置き換え、
種別セルを日本語ラベルにした。赤表示は entityIndex で行を特定する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: 行の操作言語を配線する

Enter＝直後に行追加、空欄 Backspace（名称セル）＝行削除、Alt+↑↓＝並び替え、矢印＝行間フォーカス移動、Tab＝セル間移動。判定は `resolveCommand` に委ね、エディタは「コマンド→自分の構造」の写像だけを書く。

**Files:**
- Modify: `src/modules/glossary/GlossaryEditor.tsx`

**Interfaces:**
- Consumes: `resolveCommand` / `toKeyEventLike` / `Command` / `KeyContext`（Task 4）、`currentPlatform`（Task 3）、`insertAt` / `removeAt` / `moveItem`（Task 7）、`newId`（Task 6）、`stepField`（Task 9）、`isDerivedView`（Task 8）、`FieldState`（Task 10）
- Produces: 変更なし（GlossaryEditor の props は同じ）

- [ ] **Step 1: import と module スコープを足す**

`src/modules/glossary/GlossaryEditor.tsx` の import ブロックを次に置き換える:

```tsx
import { useEffect, useRef, useState } from 'react'
import { CellInput, type FieldState } from '@/components/CellInput'
import {
  resolveCommand,
  toKeyEventLike,
  type Command,
  type KeyContext,
} from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import { insertAt, moveItem, removeAt } from '@/core/list-ops'
import { newId } from '@/core/new-id'
import type { EditorProps } from '@/core/registry'
import { computeRowKeys } from '@/core/row-keys'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import glossarySchema from '../../../schemas/glossary.schema.json'
import { FIELD_LABELS, stepField, type GlossaryField } from './fields'
import { kindLabel } from './kind-labels'
import { EMPTY_FILTER, filterTermIndices, isDerivedView, type GlossaryFilter } from './search'
```

`cellId` 関数のすぐ下に次を足す:

```tsx
const PLATFORM = currentPlatform()

/**
 * 新規行の既定の名称。空文字はスキーマ違反（minLength 1）なので置けない——
 * 空のまま自動保存が走ると、次に開けないファイルを自分で作ることになる。
 * 放置すると2件目から名称重複で赤くなるが、それは「名前を付けていない用語が
 * 2つある」という正しい指摘（未定義を消せなくする、という設計思想の適用）
 */
const NEW_TERM_NAME = '新しい用語'

function newTerm(): Term {
  return {
    id: newId('term'),
    name: NEW_TERM_NAME,
    kind: 'undecided',
    definition: '',
    aliases: [],
    notes: '',
  }
}

/** セルにフォーカスを移す。data-cell 属性で引く */
function focusCell(container: HTMLElement | null, rowKey: string, field: GlossaryField): boolean {
  const el = container?.querySelector<HTMLElement>(`[data-cell="${cellId(rowKey, field)}"]`)
  if (!el) return false
  el.focus()
  return true
}
```

- [ ] **Step 2: 構造操作とコマンド写像を足す**

`GlossaryEditor` 関数の先頭（`const [filter] = useState...` の直後）に次を挿入する:

```tsx
  const containerRef = useRef<HTMLDivElement>(null)
  // 構造操作の後、新しい DOM が出てからフォーカスを移すための予約
  const [pendingFocus, setPendingFocus] = useState<{
    rowKey: string
    field: GlossaryField
  } | null>(null)

  useEffect(() => {
    if (pendingFocus === null) return
    focusCell(containerRef.current, pendingFocus.rowKey, pendingFocus.field)
    setPendingFocus(null)
  }, [pendingFocus])
```

`updateTerm` の直後に次を挿入する:

```tsx
  // 導出表示中（検索・フィルタ適用中）は並び替えを止める（session-notes 論点4）
  const reorderEnabled = !isDerivedView(filter)

  const insertRowAfter = (index: number) => {
    const term = newTerm()
    onChange({ ...data, terms: insertAt(data.terms, index + 1, term) }, null)
    // 採番したての ID は重複しないので出現順は 0
    setPendingFocus({ rowKey: `${term.id}#0`, field: 'name' })
  }

  const deleteRow = (index: number) => {
    onChange({ ...data, terms: removeAt(data.terms, index) }, null)
    if (index - 1 >= 0) setPendingFocus({ rowKey: rowKeys[index - 1], field: 'name' })
  }

  const moveRow = (index: number, delta: -1 | 1, field: GlossaryField) => {
    const to = index + delta
    if (to < 0 || to >= data.terms.length) return
    const terms = moveItem(data.terms, index, to)
    onChange({ ...data, terms }, null)
    // 移動後の配列から鍵を引く。ID が重複していると入れ替えで出現順が変わり、
    // 移動前の rowKeys[index] は別の行を指しうる
    setPendingFocus({ rowKey: computeRowKeys(terms)[to], field })
  }

  /** 表示中の並びで n 番目の行の指定セルへフォーカスする */
  const focusVisible = (visiblePos: number, field: GlossaryField): boolean => {
    const index = visible[visiblePos]
    if (index === undefined) return false
    return focusCell(containerRef.current, rowKeys[index], field)
  }

  /** コマンドを用語集の構造へ写像する。戻り値 true＝消費した（既定動作を止める） */
  const runCommand = (
    cmd: Command,
    at: { index: number; visiblePos: number; field: GlossaryField },
  ): boolean => {
    switch (cmd) {
      case 'insert-item-after':
        insertRowAfter(at.index)
        return true
      case 'delete-item':
        deleteRow(at.index)
        return true
      case 'move-item-up':
        moveRow(at.index, -1, at.field)
        return true
      case 'move-item-down':
        moveRow(at.index, 1, at.field)
        return true
      case 'focus-prev':
        return focusVisible(at.visiblePos - 1, at.field)
      case 'focus-next':
        return focusVisible(at.visiblePos + 1, at.field)
      case 'focus-next-field': {
        const step = stepField(at.field, 1)
        return focusVisible(at.visiblePos + step.rowDelta, step.field)
      }
      case 'focus-prev-field': {
        const step = stepField(at.field, -1)
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
    at: { index: number; visiblePos: number; field: GlossaryField },
    field: Pick<
      KeyContext,
      'editing' | 'fieldEmpty' | 'deletableField' | 'caretAtStart' | 'caretAtEnd' | 'arrowsOwnedByField'
    >,
  ) => {
    const cmd = resolveCommand(toKeyEventLike(e), {
      platform: PLATFORM,
      // M4 の削除確認・M5 の二択ダイアログを出すときにここへ渡す
      modalOpen: false,
      reorderEnabled,
      ...field,
    })
    if (cmd === null) return
    if (runCommand(cmd, at)) e.preventDefault()
  }

  /** テキストセル共通の文脈。空欄 Backspace の行削除は名称セルだけ認める */
  const textFieldContext = (state: FieldState, deletableField: boolean) => ({
    editing: true,
    fieldEmpty: state.empty,
    deletableField,
    caretAtStart: state.caretAtStart,
    caretAtEnd: state.caretAtEnd,
    arrowsOwnedByField: false,
  })
```

- [ ] **Step 3: 各セルにキーハンドラを配線する**

ルートの `<div className="p-4">` を `<div ref={containerRef} className="p-4">` に変える。

`<tbody>` の中の各セルに `onFieldKeyDown` / `onKeyDown` を足す。名称セルの `<CellInput>` に追加:

```tsx
                    onFieldKeyDown={(e, s) =>
                      onCellKeyDown(
                        e,
                        { index, visiblePos, field: 'name' },
                        // 名称セルだけが空欄 Backspace で行を消せる。定義セルは
                        // 空（未定義 warning）が常態なので、そこで消えると事故になる
                        textFieldContext(s, true),
                      )
                    }
```

種別セルの `<select>` に追加:

```tsx
                    onKeyDown={(e) =>
                      onCellKeyDown(
                        e,
                        { index, visiblePos, field: 'kind' },
                        {
                          editing: false,
                          fieldEmpty: false,
                          deletableField: false,
                          caretAtStart: true,
                          caretAtEnd: true,
                          // 素の↑↓は select の選択肢切り替えに使う（Alt+↑↓ は有効）
                          arrowsOwnedByField: true,
                        },
                      )
                    }
```

定義セルの `<CellInput>` に追加:

```tsx
                    onFieldKeyDown={(e, s) =>
                      onCellKeyDown(e, { index, visiblePos, field: 'definition' }, textFieldContext(s, false))
                    }
```

別名セルの `<CellInput>`（Task 13 で差し替わる暫定）に追加:

```tsx
                    onFieldKeyDown={(e, s) =>
                      onCellKeyDown(e, { index, visiblePos, field: 'aliases' }, textFieldContext(s, false))
                    }
```

備考セルの `<CellInput>` に追加:

```tsx
                    onFieldKeyDown={(e, s) =>
                      onCellKeyDown(e, { index, visiblePos, field: 'notes' }, textFieldContext(s, false))
                    }
```

- [ ] **Step 4: 用語が0件のときの追加口を置く**

`</table>` の直後に次を足す。行が1つも無いと Enter を受ける場所が無いため。

```tsx
      {data.terms.length === 0 && (
        <button
          type="button"
          className="mt-3 rounded-sm border border-rule px-3 py-1 text-sm text-ink hover:bg-surface"
          onClick={() => insertRowAfter(-1)}
        >
          用語を追加
        </button>
      )}
```

- [ ] **Step 5: 型チェック・lint・全テスト**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

- [ ] **Step 6: アプリで操作を確認する**

Run: `npm run tauri dev`

`sample-project` を開き、次を確認する（日本語入力 ON でも試すこと）:

| 操作 | 期待 |
| --- | --- |
| 名称セルで Enter | 直後に「新しい用語」の行が増え、その名称セルにフォーカスが移る |
| 日本語を入力して変換確定の Enter | 行は増えない（変換が確定するだけ） |
| 名称を全消しして Backspace | 行が消え、前の行の名称セルにフォーカスが移る |
| 定義を全消しして Backspace | 行は消えない |
| Alt+↑ / Alt+↓ | 行が入れ替わる |
| セル先頭で↑ / 末尾で↓ | 上下の行の同じ列へフォーカスが移る |
| 文字の途中で↑↓ | カーソルが動くだけで行は移らない |
| Tab / Shift+Tab | 右／左のセルへ移り、行端で隣の行に折り返す |
| 種別セルで↑↓ | 選択肢が変わる（行は移らない）。Alt+↑↓ は行が入れ替わる |

確認後、編集を破棄する: `git restore sample-project`

- [ ] **Step 7: コミット**

```bash
git add src/modules/glossary/GlossaryEditor.tsx
git commit -m "M3: 行の操作言語を配線（Enter・空欄Backspace・Alt+↑↓・矢印・Tab）

キーの判定はコアの resolveCommand に委ね、エディタはコマンドを
自分の構造へ写像するだけにした（rev 10章の実装規約）。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: 別名パネル

M1/M2 申し送り。読点・カンマ区切りの1入力欄は暫定で、1件だけ消す・並べ替えるといった操作が文字列編集になっていた。セルにフォーカスすると1行1別名のパネルが開き、行の操作言語と同じキー（同じ `resolveCommand`）で編集できるようにする。

**Files:**
- Create: `src/modules/glossary/alias-paste.ts`
- Test: `src/modules/glossary/alias-paste.test.ts`
- Create: `src/modules/glossary/AliasCell.tsx`
- Modify: `src/modules/glossary/GlossaryEditor.tsx`（別名セルの差し替え）

**Interfaces:**
- Consumes: `resolveCommand` / `toKeyEventLike`（Task 4）、`currentPlatform`（Task 3）、`insertAt` / `removeAt` / `moveItem`（Task 7）、`CellInput` / `FieldState`（Task 10）
- Produces:
  - `splitPastedAliases(text: string): string[]`
  - `AliasCell`（props は下記 `AliasCellProps`）

- [ ] **Step 1: 貼り付け分割の失敗するテストを書く**

`src/modules/glossary/alias-paste.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { splitPastedAliases } from './alias-paste'

describe('splitPastedAliases', () => {
  it('改行で分割する', () => {
    expect(splitPastedAliases('オーダー\n受注書\n注文')).toEqual(['オーダー', '受注書', '注文'])
  })

  it('CRLF とタブでも分割する（表計算からの貼り付け）', () => {
    expect(splitPastedAliases('オーダー\r\n受注書\t注文')).toEqual(['オーダー', '受注書', '注文'])
  })

  it('前後の空白を落とし、空行は捨てる', () => {
    expect(splitPastedAliases(' オーダー \n\n 受注書 ')).toEqual(['オーダー', '受注書'])
  })

  it('読点やカンマでは分割しない（1行＝1別名なので区切り文字は不要）', () => {
    expect(splitPastedAliases('受注、オーダー')).toEqual(['受注、オーダー'])
  })

  it('区切りを含まない貼り付けは1件', () => {
    expect(splitPastedAliases('オーダー')).toEqual(['オーダー'])
  })

  it('空文字は0件', () => {
    expect(splitPastedAliases('   ')).toEqual([])
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npm test -- src/modules/glossary/alias-paste.test.ts`
Expected: FAIL（`Failed to resolve import './alias-paste'`）

- [ ] **Step 3: 分割の実装**

`src/modules/glossary/alias-paste.ts`:

```ts
/**
 * 貼り付けテキストを別名に割る。区切りは改行とタブだけ——
 * 別名パネルは1行＝1別名なので区切り文字を打つ必要が無く、
 * 読点や全角カンマで割ると別名そのものに含まれる読点を壊す
 *（M1 の読点・カンマ区切り方式はここで廃止される）
 */
export function splitPastedAliases(text: string): string[] {
  return text
    .split(/[\r\n\t]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/modules/glossary/alias-paste.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: 別名パネルを実装する**

`src/modules/glossary/AliasCell.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { CellInput, type FieldState } from '@/components/CellInput'
import { resolveCommand, toKeyEventLike } from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import { insertAt, moveItem, removeAt } from '@/core/list-ops'
import { splitPastedAliases } from './alias-paste'

const PLATFORM = currentPlatform()

const aliasInput =
  'w-full bg-transparent px-2 py-1 text-ink outline-none focus:bg-surface rounded-sm'

export interface AliasCellProps {
  aliases: string[]
  onAliasesChange: (next: string[]) => void
  /** 閉じているときのセルの data-cell 属性値（フォーカス移動が引く） */
  cellId: string
  /** aria-label（例: 別名（1行目）） */
  label: string
  /** 導出表示中は並び替えを止める（行と同じ規則を別名にも適用する） */
  reorderEnabled: boolean
  /** 閉じている状態で受けたキーを行の操作言語へ渡す */
  onClosedKeyDown: (e: React.KeyboardEvent) => void
  /** パネルを Tab / Shift+Tab で抜けたとき、隣のセルへフォーカスを移す */
  onLeave: (direction: 1 | -1) => void
}

/**
 * 別名セル。フォーカスが入ると1行1別名のパネルが開く。
 *
 * - パネル内も行と同じ resolveCommand を使う（Enter＝別名を1件追加、
 *   空欄 Backspace＝削除、↑↓＝別名間移動、Alt+↑↓＝並び替え）。
 *   共通モジュールに一元化した操作言語が、入れ子のリストでも動くことの実証
 * - パネルは Radix の Popover を使わず素の絶対配置。フォーカスと矢印キーの
 *   制御を自前の操作言語に一本化し、モーダル境界規則を発火させないため
 * - 空行は draft（ローカル状態）でだけ持つ。aliases の要素はスキーマで
 *   minLength 1 なので、空文字をデータに載せてはいけない
 */
export function AliasCell(props: AliasCellProps) {
  const { aliases, onAliasesChange, cellId, label, reorderEnabled, onClosedKeyDown, onLeave } = props
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const cellButtonRef = useRef<HTMLButtonElement>(null)
  const [pendingFocus, setPendingFocus] = useState<number | null>(null)
  // 構造操作の直後は要素の入れ替えで一瞬フォーカスが外れる。そこで閉じない
  const keepOpen = useRef(false)
  // Esc で閉じた直後、セルにフォーカスが戻っても開き直さない
  const suppressOpen = useRef(false)
  // 自分が上げた変更かどうかの判定用（外部変更ならドラフトを作り直す）
  const lastApplied = useRef<string[] | null>(null)
  const [seenAliases, setSeenAliases] = useState(aliases)

  if (aliases !== seenAliases) {
    setSeenAliases(aliases)
    if (open && aliases !== lastApplied.current) {
      setDraft(aliases.length > 0 ? [...aliases] : [''])
    }
  }

  useEffect(() => {
    if (pendingFocus === null) return
    // パネル内の入力欄は CellInput の data-cell 属性（alias-N）で引く
    panelRef.current?.querySelector<HTMLElement>(`[data-cell="alias-${pendingFocus}"]`)?.focus()
    setPendingFocus(null)
    keepOpen.current = false
  }, [pendingFocus])

  useEffect(() => {
    if (open || !suppressOpen.current) return
    cellButtonRef.current?.focus()
  }, [open])

  const focusAlias = (index: number) => {
    keepOpen.current = true
    setPendingFocus(index)
  }

  const openPanel = () => {
    if (open) return
    setDraft(aliases.length > 0 ? [...aliases] : [''])
    setOpen(true)
    focusAlias(0)
  }

  /** draft を更新し、空要素を除いたものをデータへ上げる */
  const apply = (next: string[]) => {
    setDraft(next)
    const cleaned = next.map((s) => s.trim()).filter((s) => s !== '')
    lastApplied.current = cleaned
    onAliasesChange(cleaned)
  }

  const closeAndFocusCell = () => {
    suppressOpen.current = true
    setOpen(false)
  }

  const onAliasKeyDown = (e: React.KeyboardEvent, index: number, state: FieldState) => {
    const cmd = resolveCommand(toKeyEventLike(e), {
      platform: PLATFORM,
      modalOpen: false,
      editing: true,
      fieldEmpty: state.empty,
      // パネル内はどの欄も空欄 Backspace でその別名を消せる
      deletableField: true,
      caretAtStart: state.caretAtStart,
      caretAtEnd: state.caretAtEnd,
      arrowsOwnedByField: false,
      reorderEnabled,
    })
    if (cmd === null) return
    switch (cmd) {
      case 'insert-item-after':
        apply(insertAt(draft, index + 1, ''))
        focusAlias(index + 1)
        break
      case 'delete-item':
        apply(removeAt(draft, index))
        focusAlias(Math.max(0, index - 1))
        break
      case 'move-item-up':
        if (index === 0) return
        apply(moveItem(draft, index, index - 1))
        focusAlias(index - 1)
        break
      case 'move-item-down':
        if (index === draft.length - 1) return
        apply(moveItem(draft, index, index + 1))
        focusAlias(index + 1)
        break
      case 'focus-prev':
        if (index === 0) return
        focusAlias(index - 1)
        break
      case 'focus-next':
        if (index === draft.length - 1) return
        focusAlias(index + 1)
        break
      case 'focus-next-field':
        setOpen(false)
        onLeave(1)
        break
      case 'focus-prev-field':
        setOpen(false)
        onLeave(-1)
        break
      case 'cancel':
        closeAndFocusCell()
        break
      default:
        // undo / redo は額縁のグローバル層が取る
        return
    }
    e.preventDefault()
  }

  if (!open) {
    return (
      <button
        ref={cellButtonRef}
        type="button"
        data-cell={cellId}
        aria-label={label}
        className="flex w-full flex-wrap gap-1 rounded-sm px-2 py-1 text-left outline-none focus:bg-surface"
        onFocus={() => {
          if (suppressOpen.current) {
            suppressOpen.current = false
            return
          }
          openPanel()
        }}
        onClick={openPanel}
        onKeyDown={onClosedKeyDown}
      >
        {aliases.length === 0 ? (
          <span className="text-ink-muted">別名なし</span>
        ) : (
          aliases.map((alias, i) => (
            <span key={`${alias}-${i}`} className="rounded-sm bg-surface px-1 text-ink">
              {alias}
            </span>
          ))
        )}
      </button>
    )
  }

  return (
    <div className="relative">
      <div
        ref={panelRef}
        className="absolute left-0 top-0 z-10 w-56 rounded-sm border border-rule bg-canvas p-1 shadow-lg"
        onBlur={(e) => {
          if (keepOpen.current) return
          if (e.relatedTarget instanceof Node && panelRef.current?.contains(e.relatedTarget)) return
          setOpen(false)
        }}
      >
        {draft.map((alias, i) => (
          <CellInput
            key={i}
            className={aliasInput}
            aria-label={`別名${i + 1}`}
            data-cell={`alias-${i}`}
            placeholder="別名を入力"
            value={alias}
            onValueChange={(v) => apply(draft.map((a, j) => (j === i ? v : a)))}
            onFieldKeyDown={(e, s) => onAliasKeyDown(e, i, s)}
          />
        ))}
        <p className="px-2 py-1 text-xs text-ink-muted">
          Enter＝追加／空欄 Backspace＝削除／Esc＝閉じる
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 貼り付けを配線する**

`AliasCell` のパネル内 `<CellInput>` を囲むように、パネルの `<div ref={panelRef}>` に `onPaste` を足す:

```tsx
        onPaste={(e) => {
          const text = e.clipboardData.getData('text')
          const parts = splitPastedAliases(text)
          if (parts.length <= 1) return // 単一の別名は通常の貼り付けに任せる
          e.preventDefault()
          const target = e.target as HTMLElement
          const index = draft.findIndex(
            (_, i) => target.getAttribute?.('data-cell') === `alias-${i}`,
          )
          const at = index < 0 ? draft.length - 1 : index
          // 貼り付け先の欄を先頭の別名で置き換え、残りを直後に差し込む
          const next = [...draft]
          next.splice(at, 1, ...parts)
          apply(next)
          focusAlias(at + parts.length - 1)
        }}
```

- [ ] **Step 7: エディタの別名セルを差し替える**

`src/modules/glossary/GlossaryEditor.tsx` の import に追加:

```tsx
import { AliasCell } from './AliasCell'
```

別名セルの `<td>` の中身（暫定の `<CellInput>`）を次に置き換える:

```tsx
                  <AliasCell
                    aliases={term.aliases}
                    onAliasesChange={(next) => updateTerm(index, { aliases: next }, null)}
                    cellId={cellId(rowKey, 'aliases')}
                    label={`${FIELD_LABELS.aliases}（${row}行目）`}
                    reorderEnabled={reorderEnabled}
                    onClosedKeyDown={(e) =>
                      onCellKeyDown(
                        e,
                        { index, visiblePos, field: 'aliases' },
                        {
                          editing: false,
                          fieldEmpty: false,
                          deletableField: false,
                          caretAtStart: true,
                          caretAtEnd: true,
                          arrowsOwnedByField: false,
                        },
                      )
                    }
                    onLeave={(direction) => {
                      const step = stepField('aliases', direction)
                      focusVisible(visiblePos + step.rowDelta, step.field)
                    }}
                  />
```

- [ ] **Step 8: 型チェック・lint・全テスト**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

- [ ] **Step 9: アプリで操作を確認する**

Run: `npm run tauri dev`

`sample-project` を開き、次を確認する:

| 操作 | 期待 |
| --- | --- |
| Tab で別名セルへ | パネルが開き、最初の別名欄にフォーカスが入る |
| 別名を入力して Enter | 直下に空の別名欄が増える |
| 空欄で Backspace | その別名欄が消え、前の欄の末尾にフォーカスが移る |
| Alt+↑↓ | 別名の順序が入れ替わる |
| 複数行のテキストを貼り付け | 複数の別名に分割される |
| Esc | パネルが閉じ、セル（チップ表示）にフォーカスが戻る。開き直さない |
| Tab | パネルが閉じ、備考セルへ移る |
| パネル外をクリック | パネルが閉じる |
| 保存された JSON | `git diff sample-project` で aliases が配列として正規形で書かれている |

確認後、編集を破棄する: `git restore sample-project`

- [ ] **Step 10: コミット**

```bash
git add src/modules/glossary/alias-paste.ts src/modules/glossary/alias-paste.test.ts src/modules/glossary/AliasCell.tsx src/modules/glossary/GlossaryEditor.tsx
git commit -m "M3: 別名セルを1行1別名のパネルに作り直す

M1 暫定の読点・カンマ区切り1入力欄を廃止。パネル内も同じ
resolveCommand を使い、入れ子のリストでも操作言語が同じであることを
実証する。貼り付けは改行・タブで分割する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: 検索・種別フィルタの UI

Task 8 のロジックに UI を付ける。導出表示中は並び替えが無効であることを画面上でも示す。

**Files:**
- Modify: `src/modules/glossary/GlossaryEditor.tsx`

**Interfaces:**
- Consumes: `GlossaryFilter` / `EMPTY_FILTER` / `filterTermIndices` / `isDerivedView`（Task 8）、`kindLabel`（Task 2）
- Produces: 変更なし

- [ ] **Step 1: filter を更新可能にする**

`const [filter] = useState<GlossaryFilter>(EMPTY_FILTER)` を次に置き換える:

```tsx
  const [filter, setFilter] = useState<GlossaryFilter>(EMPTY_FILTER)
```

- [ ] **Step 2: ツールバーを足す**

`<h2 ...>{data.title}</h2>` の直後（issue 一覧の前）に次を挿入する:

```tsx
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="用語を検索"
          className="w-64 rounded-sm border border-rule bg-canvas px-2 py-1 text-sm text-ink outline-none focus:bg-surface"
          placeholder="名称・別名・定義を検索"
          value={filter.query}
          onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
        />
        {KIND_OPTIONS.map((kind) => {
          const active = filter.kinds.includes(kind)
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              className={`rounded-sm border border-rule px-2 py-1 text-xs ${
                active ? 'bg-ink text-canvas' : 'text-ink-muted hover:bg-surface'
              }`}
              onClick={() =>
                setFilter((f) => ({
                  ...f,
                  kinds: active ? f.kinds.filter((k) => k !== kind) : [...f.kinds, kind],
                }))
              }
            >
              {kindLabel(kind)}
            </button>
          )
        })}
        <span className="text-xs text-ink-muted">
          {visible.length} / {data.terms.length} 件
        </span>
        {!reorderEnabled && (
          // データ順と表示順が食い違う状態での並び替えは結果が予測不能になる
          // （session-notes 論点4）。無効であることを画面でも示す
          <span className="text-xs text-ink-muted">
            検索・フィルタ中は並び替え（Alt+↑↓）を使えません
          </span>
        )}
      </div>
```

- [ ] **Step 3: 絞り込み結果が0件のときの表示を足す**

`</table>` の直後、`{data.terms.length === 0 && ...}` の前に次を挿入する:

```tsx
      {data.terms.length > 0 && visible.length === 0 && (
        <p className="mt-3 text-sm text-ink-muted">該当する用語がありません。</p>
      )}
```

- [ ] **Step 4: 型チェック・lint・全テスト**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

- [ ] **Step 5: アプリで確認する**

Run: `npm run tauri dev`

- 検索文字列を入れると行が絞られ、件数表示が変わる
- 別名・定義に含まれる語でも絞られる
- 種別チップで絞れる（複数選択は OR）
- 絞り込み中は「並び替えを使えません」の注記が出て、Alt+↑↓ で行が動かない
- 検索を消すと全件に戻り、Alt+↑↓ が再び効く

確認後、編集していれば破棄する: `git restore sample-project`

- [ ] **Step 6: コミット**

```bash
git add src/modules/glossary/GlossaryEditor.tsx
git commit -m "M3: 検索・種別フィルタの UI を追加（導出表示中は並び替えを無効化）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Undo/Redo を額縁に配線する

Undo/Redo はグローバル層（全ツール共通）なので額縁（App）が window で受ける。履歴はファイル単位・メモリ内で、ファイルを切り替えたら作り直す。

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `createHistory` / `record` / `undo` / `redo` / `canUndo` / `canRedo` / `HistoryState`（Task 5）、`resolveCommand` / `toKeyEventLike` / `KeyContext`（Task 4）、`currentPlatform`（Task 3）
- Produces: 変更なし（App は最上位）

- [ ] **Step 1: import を足す**

`src/App.tsx` の import ブロックに追加する:

```tsx
import type { Dispatch, SetStateAction } from 'react'
import {
  canRedo,
  canUndo,
  createHistory,
  record,
  redo as redoHistory,
  undo as undoHistory,
  type HistoryState,
} from '@/core/history'
import { resolveCommand, toKeyEventLike, type KeyContext } from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import type { AnyToolModule } from '@/core/registry'
```

- [ ] **Step 2: module スコープの定数とヘルパを足す**

`computeIssues` 関数の直後に次を追加する:

```tsx
/**
 * 額縁が取るグローバル層のキー文脈（rev 10章）。Undo/Redo だけを扱うため
 * 構造依存層の文脈は固定値でよい。modalOpen は M4 の削除確認・
 * M5 の二択ダイアログを出すときに true にする配線点
 */
const GLOBAL_KEY_CONTEXT: KeyContext = {
  platform: currentPlatform(),
  modalOpen: false,
  editing: false,
  fieldEmpty: false,
  deletableField: false,
  caretAtStart: false,
  caretAtEnd: false,
  arrowsOwnedByField: false,
  reorderEnabled: false,
}

/**
 * 編集後の共通処理: 自動保存へ渡し、整合性検証をやり直す。
 * 編集・Undo・Redo の3経路から同じ処理を通す（外部変更の取り込みが
 * 4本目の経路になる。M5）
 */
function applyEdit(
  setFiles: Dispatch<SetStateAction<ProjectFile[]>>,
  saver: AutoSaver | null,
  path: string,
  module: AnyToolModule,
  next: unknown,
): void {
  saver?.update(serialize(next, module.schema))
  setFiles((prev) =>
    computeIssues(
      prev.map((f) =>
        f.path === path && f.result.status === 'editable'
          ? { ...f, result: { ...f.result, data: next } }
          : f,
      ),
    ),
  )
}
```

- [ ] **Step 3: 編集中データを履歴に置き換える**

`const [editingData, setEditingData] = useState<unknown>(null)` の行を次に置き換える:

```tsx
  // 編集中データは履歴の present が正（Undo/Redo で入れ替わる。
  // ファイル単位・メモリ内。それ以前への復帰は Git の担当。rev 5章）
  const [history, setHistory] = useState<HistoryState<unknown> | null>(null)
  const historyRef = useRef<HistoryState<unknown> | null>(null)
  historyRef.current = history
```

`const toggleTheme = ...` の直前に次を追加する:

```tsx
  const editingData = history === null ? null : history.present
```

`closeCurrentFile` 内の `setEditingData(null)` を `setHistory(null)` に置き換える。

`selectFile` 内の `setEditingData(result.data)` を次に置き換える:

```tsx
      setHistory(createHistory(result.data))
```

- [ ] **Step 4: Undo/Redo の実行とショートカットを足す**

`const selected = files.find(...)` と `const selectedModule = ...` の直後に次を追加する:

```tsx
  const runHistory = (kind: 'undo' | 'redo') => {
    const h = historyRef.current
    if (h === null || selectedPath === null || selectedModule === undefined) return
    const next = kind === 'undo' ? undoHistory(h) : redoHistory(h)
    // 戻れない／進めないときは同一参照が返る
    if (next === h) return
    setHistory(next)
    applyEdit(setFiles, saverRef.current, selectedPath, selectedModule, next.present)
  }

  // グローバル層（rev 10章）: Undo/Redo は全ツール共通で額縁が取る。
  // 制御入力ではブラウザ標準の Undo が React の再レンダリングと食い違うため、
  // テキスト編集中もアプリの履歴に一本化する（境界規則への明示的な例外）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const cmd = resolveCommand(toKeyEventLike(e), GLOBAL_KEY_CONTEXT)
      if (cmd !== 'undo' && cmd !== 'redo') return
      e.preventDefault()
      runHistory(cmd)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedPath, selectedModule])
```

- [ ] **Step 5: エディタの onChange を履歴経由にする**

`<selectedModule.Editor ...>` の `onChange` を次に置き換える:

```tsx
                onChange={(next: unknown, mergeKey?: string | null) => {
                  setHistory((h) => (h === null ? h : record(h, next, mergeKey ?? null, Date.now())))
                  applyEdit(setFiles, saverRef.current, selected.path, selectedModule, next)
                }}
```

- [ ] **Step 6: ヘッダに元に戻す／やり直すボタンを足す**

ヘッダの「フォルダを開く」ボタンの直後に追加する（キーを知らなくても操作でき、履歴の有無が見える）:

```tsx
        <Button disabled={history === null || !canUndo(history)} onClick={() => runHistory('undo')}>
          元に戻す
        </Button>
        <Button disabled={history === null || !canRedo(history)} onClick={() => runHistory('redo')}>
          やり直す
        </Button>
```

- [ ] **Step 7: 型チェック・lint・全テスト**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

- [ ] **Step 8: アプリで確認する**

Run: `npm run tauri dev`

| 操作 | 期待 |
| --- | --- |
| 名称を数文字入力 → Ctrl+Z | 1文字ずつではなく、入力を始める前まで戻る |
| Enter で行追加 → Ctrl+Z | 追加した行が消える |
| Alt+↓ で並び替え → Ctrl+Z | 並びが戻る |
| Ctrl+Shift+Z | やり直せる |
| Undo 後にそのまま入力 | 入力が保存され、もう一度 Ctrl+Z で入力前に戻る |
| Undo 直後の `git diff sample-project` | 戻った状態がファイルに書かれている（自動保存が追随している） |
| 別のファイルを選ぶ → Ctrl+Z | 前のファイルの編集は戻らない（履歴はファイル単位） |
| セル編集中の Ctrl+Z | アプリの Undo が動く（入力欄の標準 Undo ではない） |

確認後、編集を破棄する: `git restore sample-project`

- [ ] **Step 9: コミット**

```bash
git add src/App.tsx
git commit -m "M3: Undo/Redo を額縁に配線（ファイル単位・メモリ内）

グローバル層なので window で受ける。制御入力では標準 Undo が
React の再レンダリングと食い違うため、編集中もアプリの履歴に一本化した。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: DOM テスト基盤と振る舞いテスト

UI の形が固まったので、ここで初めて DOM テストを入れる。狙いは「壊れても画面は一見正常な回帰」——IME 誤爆・制御入力の巻き戻り・フォーカス移動——を機械的に押さえること。テストは role とアクセシブルな名前で要素を引き、レイアウトやクラス名に依存させない（UI の微調整でテストを書き直さないため）。

**Files:**
- Modify: `package.json`（devDependencies）
- Create: `src/components/CellInput.dom.test.tsx`
- Create: `src/modules/glossary/GlossaryEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `CellInput`（Task 10）、`GlossaryEditor`（Task 11〜14）
- Produces: なし

- [ ] **Step 1: テスト用の依存を入れる**

```bash
npm install -D jsdom @testing-library/react @testing-library/user-event
```

グローバルの `test.environment` は `node` のまま変えない（純ロジックのテストを重くしない）。DOM が要るファイルだけ先頭の docblock で切り替える。

- [ ] **Step 2: CellInput の失敗するテストを書く**

`src/components/CellInput.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CellInput } from './CellInput'

// globals: false なので自動クリーンアップは効かない。明示的に呼ぶ
afterEach(cleanup)

describe('CellInput', () => {
  it('変換中は親へ値を上げず、確定時に1回だけ上げる（IME の巻き戻り防止）', () => {
    const onValueChange = vi.fn()
    render(<CellInput value="" onValueChange={onValueChange} aria-label="名称" />)
    const el = screen.getByLabelText('名称') as HTMLInputElement

    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'じゅちゅう' } })
    expect(onValueChange).not.toHaveBeenCalled()
    // 変換中の表示は入力そのもの（親の値で巻き戻らない）
    expect(el.value).toBe('じゅちゅう')

    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('受注')
  })

  it('変換していない入力はそのまま親へ上がる', () => {
    const onValueChange = vi.fn()
    render(<CellInput value="" onValueChange={onValueChange} aria-label="名称" />)
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'API' } })
    expect(onValueChange).toHaveBeenCalledWith('API')
  })

  it('sanitize が null を返す入力はデータに載せない（空の名称）', () => {
    const onValueChange = vi.fn()
    render(
      <CellInput
        value="受注"
        onValueChange={onValueChange}
        sanitize={(raw) => (raw.trim() === '' ? null : raw)}
        aria-label="名称"
      />,
    )
    const el = screen.getByLabelText('名称') as HTMLInputElement
    fireEvent.change(el, { target: { value: '' } })
    expect(onValueChange).not.toHaveBeenCalled()
    // 表示は空のまま編集を続けられる
    expect(el.value).toBe('')
    // セルを抜けたら確定値に戻る
    fireEvent.blur(el)
    expect(el.value).toBe('受注')
  })

  it('親から来た値の変更が表示に反映される（Undo の表示反映の経路）', () => {
    const { rerender } = render(<CellInput value="受注" onValueChange={() => {}} aria-label="名称" />)
    const el = screen.getByLabelText('名称') as HTMLInputElement
    fireEvent.change(el, { target: { value: '受注書' } })
    rerender(<CellInput value="受注書" onValueChange={() => {}} aria-label="名称" />)
    expect(el.value).toBe('受注書')
    // Undo で親が戻したら表示も戻る
    rerender(<CellInput value="受注" onValueChange={() => {}} aria-label="名称" />)
    expect(el.value).toBe('受注')
  })
})
```

- [ ] **Step 3: テストが通ることを確認する**

Run: `npm test -- src/components/CellInput.dom.test.tsx`
Expected: PASS（4件。Task 10 の実装が正しければ最初から通る。落ちたら `CellInput` を直す）

- [ ] **Step 4: エディタの振る舞いテストを書く**

`src/modules/glossary/GlossaryEditor.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import { GlossaryEditor } from './GlossaryEditor'

afterEach(cleanup)

function term(over: Partial<Term> & { id: string; name: string }): Term {
  return { kind: 'other', definition: '定義あり', aliases: [], notes: '', ...over }
}

function glossary(terms: Term[]): GlossarySchemaVersion1 {
  return { schemaVersion: 1, type: 'glossary', title: 'テスト用語集', terms }
}

/** 額縁の代わり。onChange を受けて data を差し替える最小の親 */
function Harness(props: {
  initial: GlossarySchemaVersion1
  onChange: (next: GlossarySchemaVersion1, mergeKey?: string | null) => void
}) {
  const [data, setData] = useState(props.initial)
  return (
    <GlossaryEditor
      data={data}
      issues={[]}
      onChange={(next, mergeKey) => {
        setData(next)
        props.onChange(next, mergeKey)
      }}
    />
  )
}

function renderEditor(initial: GlossarySchemaVersion1) {
  const onChange = vi.fn()
  render(<Harness initial={initial} onChange={onChange} />)
  const latest = () => onChange.mock.calls.at(-1)?.[0] as GlossarySchemaVersion1 | undefined
  return { onChange, latest }
}

const twoTerms = glossary([
  term({ id: 'term_aaaaaaaaaa', name: '受注' }),
  term({ id: 'term_bbbbbbbbbb', name: '発注' }),
])

describe('GlossaryEditor: IME', () => {
  it('変換確定の Enter では行が増えない（日本語入力アプリ最大の地雷）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('名称（1行目）')
    fireEvent.compositionStart(cell)
    fireEvent.keyDown(cell, { key: 'Enter', isComposing: true })
    expect(screen.getAllByLabelText(/^名称/)).toHaveLength(2)
  })
})

describe('GlossaryEditor: 行の操作言語', () => {
  it('Enter で直後に行が増え、新しい行の名称セルにフォーカスが移る', () => {
    const { latest } = renderEditor(twoTerms)
    fireEvent.keyDown(screen.getByLabelText('名称（1行目）'), { key: 'Enter' })
    const names = screen.getAllByLabelText(/^名称/) as HTMLInputElement[]
    expect(names).toHaveLength(3)
    expect(names[1].value).toBe('新しい用語')
    expect(document.activeElement).toBe(names[1])
    // 新規行は kind=undecided / definition="" で warning が見える状態
    expect(latest()?.terms[1].kind).toBe('undecided')
    expect(latest()?.terms[1].id).toMatch(/^term_[A-Za-z0-9]{10}$/)
  })

  it('空の名称セルで Backspace すると行が消える', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('名称（2行目）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(screen.getAllByLabelText(/^名称/)).toHaveLength(1)
  })

  it('空の定義セルで Backspace しても行は消えない（未定義は常態なので事故になる）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('定義（2行目）')
    fireEvent.change(cell, { target: { value: '' } })
    fireEvent.keyDown(cell, { key: 'Backspace' })
    expect(screen.getAllByLabelText(/^名称/)).toHaveLength(2)
  })

  it('Tab で右のセルへ移る', () => {
    renderEditor(twoTerms)
    fireEvent.keyDown(screen.getByLabelText('名称（1行目）'), { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('種別（1行目）'))
  })

  it('セル先頭での↑で上の行へ、途中では移らない', () => {
    renderEditor(twoTerms)
    const second = screen.getByLabelText('名称（2行目）') as HTMLInputElement
    second.setSelectionRange(0, 0)
    fireEvent.keyDown(second, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(screen.getByLabelText('名称（1行目）'))

    const first = screen.getByLabelText('名称（1行目）') as HTMLInputElement
    first.setSelectionRange(1, 1)
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(first)
  })

  it('Alt+↑ で行が入れ替わる', () => {
    const { latest } = renderEditor(twoTerms)
    fireEvent.keyDown(screen.getByLabelText('名称（2行目）'), { key: 'ArrowUp', altKey: true })
    expect(latest()?.terms.map((t) => t.name)).toEqual(['発注', '受注'])
  })

  it('検索中は Alt+↑↓ で並び替えできない（導出表示中の境界規則）', () => {
    const { onChange } = renderEditor(twoTerms)
    fireEvent.change(screen.getByLabelText('用語を検索'), { target: { value: '注' } })
    onChange.mockClear()
    fireEvent.keyDown(screen.getByLabelText('名称（2行目）'), { key: 'ArrowUp', altKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('GlossaryEditor: 表示', () => {
  it('種別セルは日本語ラベルで表示する', () => {
    renderEditor(glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', kind: 'undecided' })]))
    const select = screen.getByLabelText('種別（1行目）') as HTMLSelectElement
    expect(select.selectedOptions[0].textContent).toBe('未分類')
  })

  it('検索は別名も横断する', () => {
    renderEditor(
      glossary([
        term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['オーダー'] }),
        term({ id: 'term_bbbbbbbbbb', name: '担当者' }),
      ]),
    )
    fireEvent.change(screen.getByLabelText('用語を検索'), { target: { value: 'オーダー' } })
    const names = screen.getAllByLabelText(/^名称/) as HTMLInputElement[]
    expect(names.map((el) => el.value)).toEqual(['受注'])
  })
})

describe('GlossaryEditor: 別名パネル', () => {
  it('セルにフォーカスするとパネルが開き、Enter で別名が増える', () => {
    const { latest } = renderEditor(glossary([term({ id: 'term_aaaaaaaaaa', name: '受注' })]))
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    const first = screen.getByLabelText('別名1')
    expect(document.activeElement).toBe(first)

    fireEvent.change(first, { target: { value: 'オーダー' } })
    fireEvent.keyDown(first, { key: 'Enter' })
    fireEvent.change(screen.getByLabelText('別名2'), { target: { value: '受注書' } })
    expect(latest()?.terms[0].aliases).toEqual(['オーダー', '受注書'])
  })

  it('空欄 Backspace で別名を1件だけ消せる', () => {
    const { latest } = renderEditor(
      glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['オーダー', '受注書'] })]),
    )
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    const second = screen.getByLabelText('別名2')
    fireEvent.change(second, { target: { value: '' } })
    fireEvent.keyDown(second, { key: 'Backspace' })
    expect(latest()?.terms[0].aliases).toEqual(['オーダー'])
  })

  it('改行を含む貼り付けは複数の別名に分割される', () => {
    const { latest } = renderEditor(glossary([term({ id: 'term_aaaaaaaaaa', name: '受注' })]))
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    fireEvent.paste(screen.getByLabelText('別名1'), {
      clipboardData: { getData: () => 'オーダー\n受注書\n注文' },
    })
    expect(latest()?.terms[0].aliases).toEqual(['オーダー', '受注書', '注文'])
  })
})
```

- [ ] **Step 5: テストを走らせて落ちた箇所を直す**

Run: `npm test -- src/modules/glossary/GlossaryEditor.dom.test.tsx`
Expected: PASS（12件）

落ちた場合は**テストではなく実装を疑うこと**。ここで見つかる不具合は「手動では気づけない配線の間違い」であり、それがこのタスクの目的。よくある原因:

- `fireEvent.keyDown` の `isComposing` が届いていない → `toKeyEventLike` が `nativeEvent.isComposing` を読んでいるか確認する
- フォーカスが移らない → `data-cell` 属性の値と `focusCell` のセレクタが一致しているか、`pendingFocus` の effect が走っているか確認する
- 別名パネルが即座に閉じる → `keepOpen` の解除タイミング（`pendingFocus` の effect 内）を確認する

- [ ] **Step 6: 全テスト・型チェック・lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

- [ ] **Step 7: コミット**

```bash
git add package.json package-lock.json src/components/CellInput.dom.test.tsx src/modules/glossary/GlossaryEditor.dom.test.tsx
git commit -m "M3: DOM テスト基盤（jsdom + Testing Library）と振る舞いテストを追加

IME 誤爆・制御入力の巻き戻り・フォーカス移動という「壊れても画面は
一見正常」な回帰だけを押さえる。role とアクセシブル名で引き、
レイアウトには依存させない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 17: 手動 E2E と申し送りの記録

実機（Windows ＋ 実際の IME）でしか確認できない部分を通しで確認し、M4 以降への申し送りを実装スコープ定義書に追記する。

**Files:**
- Modify: `docs/impl-scope-glossary.md`（9節を追記）

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 全テスト・型チェック・lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて PASS

- [ ] **Step 2: アプリを起動する**

まず dev サーバーの出所を確認する（別チェックアウトのサーバーが5173を掴んでいると古いコードが表示される）:

```powershell
Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | ForEach-Object { Get-Process -Id $_.OwningProcess | Select-Object Id, Path }
```

Run: `npm run tauri dev`

- [ ] **Step 3: 日本語入力での操作を確認する（最重要）**

Windows の IME（MS-IME か Google 日本語入力）を ON にして `sample-project` を開き、次をすべて確認する。**半角英数だけで確認して済ませないこと**——変換確定 Enter の誤爆は日本語入力でしか再現しない。

| 操作 | 期待 |
| --- | --- |
| 名称セルで「じゅちゅう」→ 変換 → Enter で確定 | 変換が確定するだけ。行は増えない |
| 確定後もう一度 Enter | 行が増える |
| 変換中に文字が巻き戻る・重複する | 起きない（未確定文字列が消えたり二重になったりしない） |
| 変換中に Esc | 変換のキャンセル（セルの編集は続く） |
| 定義セルに長い日本語を入力 | 途中で入力が飛ばない・カーソルが先頭に戻らない |
| 別名パネルで日本語を入力して Enter | 変換確定では別名欄が増えず、確定後の Enter で増える |

- [ ] **Step 4: 操作言語と Undo を通しで確認する**

| 操作 | 期待 |
| --- | --- |
| Enter → 名称を打つ → Tab で種別 → ↑↓ で選択 → Tab で定義 | 会議の速度で止まらずに1件登録できる |
| Alt+↑↓ で並び替え | 行が動く。`git diff` に並び順の変更が出る |
| 検索して絞り込み → Alt+↑↓ | 動かない。注記が出ている |
| Ctrl+Z を連打 | 入力・行追加・並び替えが意味のある単位で戻る |
| Ctrl+Shift+Z | やり直せる |
| ヘッダの「元に戻す」「やり直す」ボタン | 履歴が無いときは無効表示になっている |
| ファイルを切り替えて Ctrl+Z | 前のファイルの編集は戻らない |
| 別名パネルを開いたまま Ctrl+Z | データは戻る（パネルの表示が追随しない場合は Step 6 に記録する） |

- [ ] **Step 5: 正規形と既存機能の回帰を確認する**

| 確認 | 期待 |
| --- | --- |
| 1フィールドだけ編集 → `git diff sample-project` | 該当行だけの diff（正規形が壊れていない） |
| 行を追加 → 保存 → `git diff` | 新しい term がキー順・インデント2・LF で入っている |
| `sample-project-broken` を開く | M2 と同じ赤バッジ・赤セル・warning セルが出る。ID 重複時、name 重複の赤が該当行だけに出る（全行に波及しない） |
| 未知 type / 未知 schemaVersion / スキーマ違反のファイル | M2 と同じ扱い（クラッシュしない） |
| 編集して500ms 以内にウィンドウを閉じる | 最後の編集が保存されている（M2 の close 時 flush が壊れていない） |
| ダークモード切替 | 別名パネル・チップ・検索欄が読める（色値は仮置きのままでよい） |

- [ ] **Step 6: 編集内容を破棄する**

```bash
git restore sample-project sample-project-broken
```

- [ ] **Step 7: 申し送りを実装スコープ定義書に追記する**

`docs/impl-scope-glossary.md` の末尾に「## 9. M3 完了に伴う申し送り（2026-08-02 追記）」を追加する。**E2E とレビューで実際に出たことだけを書く**（推測で埋めない）。次の観点を拾うこと:

- **M4 で扱うもの**: ファイル新規作成・削除・用語集0個からの自動生成に、M3 で入った操作言語をどう繋ぐか（削除確認モーダルを出すなら `KeyContext.modalOpen` を true にする配線点が App にある）。単一性違反の解消手段（M2 申し送りの積み残し）
- **M5 で扱うもの**: 外部変更の取り込みが `applyEdit` の3本目の経路になること。取り込み時に **Undo 履歴を破棄する**（実装スコープ定義書 4節 M5）ので、`createHistory` で作り直す場所が要る。別名パネルを開いたまま外部変更が来たときの扱い
- **M6 で扱うもの**: 出力ロジック（規約5）がモジュール規約の最後のスロット。種別の日本語ラベルは `kind-labels.ts` にあるので出力でも使い回す（見出しの表記を UI と揃える）
- **M7 で扱うもの**: 別名チップ・検索欄・パネルの面と罫線の濃さ（現在は既存トークンの流用で仮置き）
- **いつでもよいが、忘れると実害化する残件**: E2E で見つかった小さな不整合（例: 別名パネルを開いたままの Undo が表示に追随しない、Esc の戻り先、フォーカスが飛ぶケース）
- **実装で確定した事項（計画の前提に昇格）**: `resolveCommand` の文脈（`KeyContext`）に何を渡すかの規約、行キーが `${id}#${出現順}` であること、新規行の名称が `新しい用語` であること、DOM テストの方針（形が固まってからまとめて書く／role とアクセシブル名で引く）

- [ ] **Step 8: コミット**

```bash
git add docs/impl-scope-glossary.md
git commit -m "M3: 完了に伴う申し送りを実装スコープ定義書に追記

M4/M5/M6/M7 の計画入力、残件、計画の前提に昇格した確定事項を記録。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## セルフレビュー記録

- **仕様カバレッジ**（実装スコープ定義書 4節 M3）:
  - キーボード操作を共通フック/モジュールに一元化 → Task 3・4（`src/core/keyboard/`）。用語集エディタ（Task 12）と別名パネル（Task 13）が同じ `resolveCommand` を使うことで一元化を実証
  - 修飾キーのプラットフォーム抽象 → Task 3
  - 階層・リスト系ファミリー標準（Enter／空欄 Backspace／Alt+↑↓／矢印／Tab＝セル間移動）→ Task 4（判定）・Task 12（写像）
  - IME 対応 → Task 4（`resolveCommand` の第1規則）・Task 10（制御入力の巻き戻り防止）・Task 16（回帰テスト）・Task 17（実機の日本語入力）
  - 境界規則（モーダル・テキスト編集中）→ Task 4。モーダルは M3 に無いため `modalOpen` の配線点だけ用意（App の `GLOBAL_KEY_CONTEXT` とエディタの `onCellKeyDown`）
  - 検索（name / aliases / definition 横断）＋種別フィルタ、導出表示中の Alt+↑↓ 無効化 → Task 8・14
  - Undo/Redo（Ctrl+Z / Ctrl+Shift+Z、ファイル単位・メモリ内）→ Task 5・15
  - 7節 M3 申し送り: 別名セル → Task 13／kind の日本語ラベル → Task 2／非制御入力からの移行 → Task 10・11
  - 8節 M3 申し送り: 行キーが配列 index → Task 7・11／セル赤表示のキーが entityId のみ → Task 1・11／検索の照合も `normalizeForMatch` → Task 8
  - 8節「いつでもよいが忘れると実害化する残件」のうち `checkProjectConsistency` の上書き代入 → Task 1（`ConsistencyLocation` を触るついでに塞ぐ。他の3件は M5 以降の管轄なので M3 では触らない）
- **スコープ判断のメモ**:
  - 「保存できないと閉じられない（脱出口が無い）」と「編集1打鍵ごとの全ファイル再検証」は M2 申し送りの残件だが、どちらも M3 の成果物（操作性）と独立しており、前者はダイアログ＝M4 の管轄、後者は規模が増えてからの最適化なので M3 では扱わない
  - Undo 履歴に**別名パネルのローカル下書き**は含めない。パネルの空行は UI 上の状態であってデータではないため（データに載る時点で履歴に入る）
  - 新規行の既定名を `新しい用語` にしたのは、空文字がスキーマ違反（`minLength: 1`）で自動保存が即座にレベル1違反ファイルを作ってしまうため。設計判断4に理由を記載
- **型整合の確認**:
  - `ConsistencyLocation.entityIndex`（Task 1 定義 → Task 11 の `marks` が使用）
  - `EditorProps.onChange(next, mergeKey?)`（Task 5 定義 → Task 11 以降のエディタが送信、Task 15 の App が受信）
  - `Command` / `KeyContext` / `resolveCommand` / `toKeyEventLike`（Task 4 定義 → Task 12・13・15 が使用）
  - `FieldState`（Task 10 定義 → Task 12 の `textFieldContext`、Task 13 の `onAliasKeyDown` が使用）
  - `computeRowKeys` の戻り値形式 `${id}#${出現順}`（Task 7 定義 → Task 12 の `insertRowAfter` が `${term.id}#0` を組み立てる箇所と一致）
  - `stepField(field, direction) → { field, rowDelta }`（Task 9 定義 → Task 12 の `runCommand`、Task 13 の `onLeave` が使用）
  - `filterTermIndices` / `isDerivedView` / `GlossaryFilter` / `EMPTY_FILTER`（Task 8 定義 → Task 11・12・14 が使用）
  - `kindLabel`（Task 2 定義 → Task 11 の種別セル、Task 14 のフィルタチップが使用）
  - `newId('term')`（Task 6 定義 → Task 12 の `newTerm` が使用。スキーマの `^term_[A-Za-z0-9]{10}$` に一致）
  - `AliasCellProps`（Task 13 定義 → 同 Task のエディタ側配線が全 prop を渡していることを確認済み）
