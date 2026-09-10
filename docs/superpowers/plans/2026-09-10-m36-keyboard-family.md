# M36 キーボードの家族旗 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `KeyContext` の `hierarchical` / `horizontal` を排他な `family` に畳み、表系ファミリー `'grid'` を足す。

**Architecture:** 真偽値2つでは、両方が立った文脈を型が許してしまう。ユニオン1つに畳むと排他が型で保証され、`resolveCommand` の分岐が家族名の比較になる。`'grid'` は消費者を持たないまま単体テストで固め、デシジョンテーブルのモジュールがコアを触らずに済む形にする。

**Tech Stack:** TypeScript / React / Vitest / oxlint

**Spec:** [`docs/superpowers/specs/2026-09-10-decision-table-design.md`](../specs/2026-09-10-decision-table-design.md) の「3. キーボードファミリー」

## Global Constraints

- 文書とコメントは現在形で書く。マイルストーン番号・日付・レビュー指摘・依頼者の指示・変更前の状態・「〜で確定した」の記録を書かない
- 罠は「当初 X していたため Y を取り逃がした」ではなく「X を条件にすると Y を取り逃がす」の形で書く
- テストの名前は守っている性質を名前にする。番号を使わない
- 1項目は2文まで。太字は1段落に1箇所まで。全角括弧の入れ子を作らない
- キーボード処理は `src/core/keyboard/` に一元化する。ツールごとのハンドラ自前実装を禁止する
- `Command` の語彙を増やさない。行移動は `focus-prev` / `focus-next`、列移動は `focus-prev-field` / `focus-next-field` に写す
- `Shift+Enter` と `Alt+Enter` は `null` を返す。ブラウザ既定のセル内改行が生きることは不変条件である
- 検証コマンドは `npm test && npx tsc -b && npm run lint`。worktree に `node_modules` が無ければ先に `npm install` を実行する
- `src/modules/sequence/skill-write.smoke.test.ts` は全体実行でまれに落ちる。単体で再実行して通れば既知の不安定さであり、この計画の変更とは無関係である

## File Structure

| ファイル | 役割 | 本計画での扱い |
| --- | --- | --- |
| `src/core/keyboard/keymap.ts` | `KeyFamily` / `KeyContext` / `resolveCommand`。キーの判定はここ以外に書かない | 変更 |
| `src/core/keyboard/keymap.test.ts` | `resolveCommand` の写像を家族ごとに固定する | 変更 |
| `src/App.tsx` | 額縁のグローバル層の文脈 | 変更（1箇所） |
| `src/modules/glossary/GlossaryEditor.tsx` | 用語集の行の文脈 | 変更（1箇所） |
| `src/modules/glossary/AliasCell.tsx` | 別名パネルの文脈 | 変更（1箇所） |
| `src/modules/error-catalog/ErrorCatalogEditor.tsx` | エラーカタログの行の文脈 | 変更（1箇所） |
| `src/modules/logic-tree/LogicTreeEditor.tsx` | ロジックツリーのノードの文脈 | 変更（1箇所） |
| `src/modules/issue-tree/IssueTreeEditor.tsx` | 課題ツリーのノードの文脈 | 変更（1箇所） |
| `src/modules/sequence/SequenceEditor.tsx` | アクター・ラベル・参照・形・答えの5つの文脈 | 変更（5箇所） |

`KeyContext` を組み立てるのは本体7ファイル11箇所と、テストのヘルパ1箇所である。必須フィールドを差し替えるので `tsc -b` が全箇所を赤くし、取りこぼしが起きない。

---

## Task 1: 家族旗を `family` に畳む

挙動を1つも変えない。既存テストが緑のまま通ることが完了条件である。

**Files:**
- Modify: `src/core/keyboard/keymap.ts:52-141`
- Modify: `src/App.tsx:163-168`
- Modify: `src/modules/glossary/GlossaryEditor.tsx:221-222`
- Modify: `src/modules/glossary/AliasCell.tsx:140-141`
- Modify: `src/modules/error-catalog/ErrorCatalogEditor.tsx:259-260`
- Modify: `src/modules/logic-tree/LogicTreeEditor.tsx:268-269`
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx:805-806`
- Modify: `src/modules/sequence/SequenceEditor.tsx:712-714,727-728,746-747,764-765,785-786`
- Test: `src/core/keyboard/keymap.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `export type KeyFamily = 'list' | 'tree' | 'horizontal' | 'grid'` と `KeyContext.family: KeyFamily`。`hierarchical` と `horizontal` は消える

- [ ] **Step 1: テスト側を `family` に書き換える**

`src/core/keyboard/keymap.test.ts` を機械的に置換する。置換は4種類で、**この順で行う**——先に項目2をファイル全体へ一括で当てると `describe` と `it` の名前文字列にも一致し、`describe('階層構造（family: 'tree'）'` という構文エラーができる。

1. `describe` と `it` の名前。フィールド名が消えるので、名前も家族名に合わせる。

| 現在 | 置換後 |
| --- | --- |
| `階層構造（hierarchical: true）` | `木の家族（family は tree）` |
| `階層でない構造（hierarchical: false）は挙動が変わらない` | `リストの家族（family は list）は挙動が変わらない` |
| `horizontal（横リスト＝アクターヘッダ）` | `横リストの家族（family は horizontal。アクターヘッダ）` |
| `horizontal では Alt+↑↓ は並び替えにならない（縦の意味が無い）` | `横リストでは Alt+↑↓ は並び替えにならない（縦の意味が無い）` |
| `horizontal では素の（Alt 無し）↑↓ も関与しない（↑↓の horizontal ガードの変異耐性: キャレット端でも focus-prev/next にならない）` | `横リストでは素の（Alt 無し）↑↓ も関与しない（↑↓ の家族ガードの変異耐性: キャレット端でも focus-prev/next にならない）` |
| `hierarchical でも欄が矢印を使うなら ←→ は欄のもの（キャレット端でも構造移動に化けない＝ガードの変異耐性）` | `木でも欄が矢印を使うなら ←→ は欄のもの（キャレット端でも構造移動に化けない＝ガードの変異耐性）` |
| `horizontal でも同様（キャレット端でも focus-prev/next に化けない＝ガードの変異耐性）` | `横リストでも同様（キャレット端でも focus-prev/next に化けない＝ガードの変異耐性）` |

区切りコメント（360行目付近）も直す。
`// ---- horizontal / toggle-item-state / ←→ の arrowsOwnedByField ----` を
`// ---- 横リスト / toggle-item-state / ←→ の arrowsOwnedByField ----` にする。

2. `ctx()` ヘルパの既定値（20〜21行目）

```ts
    reorderEnabled: true,
    hierarchical: false,
    horizontal: false,
    ...over,
```

を次にする。

```ts
    reorderEnabled: true,
    family: 'list',
    ...over,
```

3. `ctx({...})` の呼び出しの上書き。**名前の改名を終えたあとで**、次の3つを置換する。

| 現在 | 置換後 |
| --- | --- |
| `hierarchical: true` | `family: 'tree'` |
| `hierarchical: false` | `family: 'list'` |
| `horizontal: true` | `family: 'horizontal'` |

4. `grep -n "hierarchical\|horizontal:" src/core/keyboard/keymap.test.ts` が空になることを確認する。

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/core/keyboard/keymap.test.ts`
Expected: FAIL 8件（43件は緑）。**型エラーでは落ちない**——vitest は `vite:oxc` で型を落とすので、`KeyContext` に無いキーを渡しても実行できる。落ちるのは、`resolveCommand` が読む `ctx.hierarchical` と `ctx.horizontal` が `undefined`（偽）になり、木と横リストの写像が総崩れになるためである。

失敗する8件は次のとおり。

```
× Tab で子を追加する（rev 10章 階層・リスト系の標準）
× Shift+Tab には意味を与えない（キャンバスから抜ける経路として残す）
× ← はキャレットが先頭にあるとき親へ移る
× → はキャレットが末尾にあるとき子へ移る
× Alt+← は move-item-up（前へ）、Alt+→ は move-item-down（次へ）
× 素の ←→ はキャレット端でだけ focus-prev / focus-next
× 横リストでは Alt+↑↓ は並び替えにならない（縦の意味が無い）
× 横リストでは素の（Alt 無し）↑↓ も関与しない（↑↓ の家族ガードの変異耐性: キャレット端でも focus-prev/next にならない）
```

- [ ] **Step 3: `KeyContext` を書き換える**

`src/core/keyboard/keymap.ts` の `hierarchical` と `horizontal` の2フィールド（JSDoc を含む52〜66行目付近）を、次の1フィールドに置き換える。`KeyFamily` は `KeyContext` の直前に置く。

```ts
/**
 * 構造ファミリー（rev 10章の構造依存層）。**排他なので1つだけ選ぶ**——真偽値を
 * 並べると、両方が立った文脈を型が許してしまう。
 *
 * - `'list'`: 縦に並ぶフラットなリスト。`Tab` は欄の移動で、`←→` は欄のもの
 * - `'tree'`: 子を持てる構造。`Tab` は子追加で、`←→` が親子間の移動になる
 * - `'horizontal'`: 横に並ぶリスト。`Alt+←→` が並び替えで、`↑↓` は関与しない
 */
export type KeyFamily = 'list' | 'tree' | 'horizontal'
```

**`'grid'` はここで足さない。** 挙動を実装しないまま値と説明だけを置くと、JSDoc が実在しない写像を述べる。Task 2 が値と分岐を同じコミットで足す。

`KeyContext` 側は次の1行にする。

```ts
  /** 構造ファミリー。`Tab`・`←→`・`Enter` の意味がこれで決まる */
  family: KeyFamily
```

- [ ] **Step 4: `resolveCommand` の分岐を家族名の比較にする**

同ファイルの `switch (e.key)` の中を、次の3つの規則で機械的に置換する。**条件式の形を変えないこと**——`||` の並びや評価順を触ると、挙動が変わっていないという主張が崩れる。

| 現在 | 置換後 |
| --- | --- |
| `ctx.hierarchical` | `ctx.family === 'tree'` |
| `!ctx.hierarchical` | `ctx.family !== 'tree'` |
| `ctx.horizontal` | `ctx.family === 'horizontal'` |

置換後の該当行は次の6箇所になる。

`Tab` の分岐（1箇所）

```ts
      if (ctx.family === 'tree') return e.shiftKey ? null : 'insert-child'
```

`ArrowUp` と `ArrowDown` の先頭（2箇所）

```ts
      if (ctx.family === 'horizontal') return null
```

`ArrowLeft` と `ArrowRight` の横リスト分岐の入口（2箇所）

```ts
      if (ctx.family === 'horizontal') {
```

`ArrowLeft` と `ArrowRight` の木の分岐の入口（2箇所）

```ts
      if (ctx.family !== 'tree' || e.altKey || e.shiftKey) return null
```

- [ ] **Step 5: 本体側11箇所を書き換える**

`hierarchical` と `horizontal` の2行を `family` の1行にする。既存のコメントは残す。

`src/App.tsx`（163〜168行目）

```ts
    // 額縁のグローバル層はどのツールでも Undo/Redo だけを扱う。構造依存層の
    // 意味が及ばない層なので、最も素直な 'list' でよい
    family: 'list',
```

`src/modules/glossary/GlossaryEditor.tsx` と `src/modules/glossary/AliasCell.tsx` と `src/modules/error-catalog/ErrorCatalogEditor.tsx` の各1箇所

```ts
      family: 'list',
```

`src/modules/logic-tree/LogicTreeEditor.tsx` と `src/modules/issue-tree/IssueTreeEditor.tsx` の各1箇所

```ts
      family: 'tree',
```

`src/modules/sequence/SequenceEditor.tsx` の `onActorKeyDown`（712〜714行目）

```ts
      // ヘッダは横並びのリスト。Alt+←→ が並び替えになる（design-notes 論点9）
      family: 'horizontal',
```

`src/modules/sequence/SequenceEditor.tsx` の残り4箇所（`onLabelKeyDown` と `onRefKeyDown` と `onShapeKeyDown` と `onAnswerKeyDown`）

```ts
      family: 'list',
```

- [ ] **Step 6: 全体が緑になることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS（テストは全ファイル緑、`tsc -b` と `oxlint` は終了コード0）

続けて、旧フィールド名が1つも残っていないことを確かめる。**`horizontal` を裸で探さないこと**——`family: 'horizontal'` に一致して、検査が永久に赤いままになる。

Run: `grep -rn "hierarchical\|horizontal:" src/ --include=*.ts --include=*.tsx`
Expected: 出力なし（着手前の同じコマンドは65行を出す）

- [ ] **Step 7: 番人が実在することを壊して確かめる**

`keymap.ts` の `if (ctx.family === 'tree') return e.shiftKey ? null : 'insert-child'` を
`if (false) return e.shiftKey ? null : 'insert-child'` に一時的に変える。

Run: `npx vitest run src/core/keyboard/keymap.test.ts`
Expected: FAIL 2件。`Tab で子を追加する（rev 10章 階層・リスト系の標準）` と `Shift+Tab には意味を与えない（キャンバスから抜ける経路として残す）` が、いずれも `木の家族（family は tree）` の下で落ちる

元に戻し、`git status --short` が Step 1〜5 の変更だけを示すこと（変異が残っていないこと）を確認する。

- [ ] **Step 8: コミット**

変更した9ファイルをステージしてコミットする。メッセージは次の形にする。

```
refactor(m36): キーボードの家族旗を family に畳む

hierarchical と horizontal の2つの真偽値では、両方が立った文脈を型が
許してしまう。排他なユニオン1つにすると、家族の取り違えを tsc が捕まえる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SSyAnv19UVzGrJFu3HcUeB
```

---

## Task 2: 表の家族 `'grid'` を足す

`'grid'` を使う画面はまだ無い。写像を単体テストで固めておくと、デシジョンテーブルのモジュールはコアを触らずに済む。

**Files:**
- Modify: `src/core/keyboard/keymap.ts`（`KeyFamily` のユニオンと、`Enter` と `ArrowLeft` と `ArrowRight` の3分岐）
- Test: `src/core/keyboard/keymap.test.ts`（`describe` を1つ追加）

**Interfaces:**
- Consumes: Task 1 の `KeyFamily`（`'list' | 'tree' | 'horizontal'`）と `KeyContext.family`
- Produces: `KeyFamily` に `'grid'` を足したユニオンと、その写像。`Enter` → `'focus-next'`、`←` → `'focus-prev-field'`、`→` → `'focus-next-field'`。`Tab` と `↑↓` と `Backspace` は `'list'` と同じ

- [ ] **Step 1: 失敗するテストを書く**

`src/core/keyboard/keymap.test.ts` の末尾に足す。

```ts
describe('表の家族（family は grid）', () => {
  it('Enter は行を足さず下の行へ送る', () => {
    expect(resolveCommand(key({ key: 'Enter' }), ctx({ family: 'grid' }))).toBe('focus-next')
  })

  it('Shift+Enter と Alt+Enter は関与しない（セル内改行を残す）', () => {
    expect(resolveCommand(key({ key: 'Enter', shiftKey: true }), ctx({ family: 'grid' }))).toBeNull()
    expect(resolveCommand(key({ key: 'Enter', altKey: true }), ctx({ family: 'grid' }))).toBeNull()
  })

  it('←→ はキャレット端で隣の列へ移る', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft' }),
        ctx({ family: 'grid', editing: true, caretAtStart: true }),
      ),
    ).toBe('focus-prev-field')
    expect(
      resolveCommand(
        key({ key: 'ArrowRight' }),
        ctx({ family: 'grid', editing: true, caretAtEnd: true }),
      ),
    ).toBe('focus-next-field')
  })

  it('←→ はキャレットが中間なら欄のもの', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft' }),
        ctx({ family: 'grid', editing: true, caretAtStart: false }),
      ),
    ).toBeNull()
    expect(
      resolveCommand(
        key({ key: 'ArrowRight' }),
        ctx({ family: 'grid', editing: true, caretAtEnd: false }),
      ),
    ).toBeNull()
  })

  it('欄が矢印を使うなら ←→ は欄のもの（キャレット端でも列移動に化けない）', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowLeft' }),
        ctx({ family: 'grid', arrowsOwnedByField: true, editing: true, caretAtStart: true }),
      ),
    ).toBeNull()
    expect(
      resolveCommand(
        key({ key: 'ArrowRight' }),
        ctx({ family: 'grid', arrowsOwnedByField: true, editing: true, caretAtEnd: true }),
      ),
    ).toBeNull()
  })

  it('Alt+←→ は並び替えにならない（横リストの意味を借りない）', () => {
    expect(
      resolveCommand(key({ key: 'ArrowLeft', altKey: true }), ctx({ family: 'grid' })),
    ).toBeNull()
    expect(
      resolveCommand(key({ key: 'ArrowRight', altKey: true }), ctx({ family: 'grid' })),
    ).toBeNull()
  })

  it('Tab はリストと同じく欄の移動', () => {
    expect(resolveCommand(key({ key: 'Tab' }), ctx({ family: 'grid' }))).toBe('focus-next-field')
    expect(resolveCommand(key({ key: 'Tab', shiftKey: true }), ctx({ family: 'grid' }))).toBe(
      'focus-prev-field',
    )
  })

  it('↑↓ はリストと同じく行の移動', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowUp' }),
        ctx({ family: 'grid', editing: true, caretAtStart: true }),
      ),
    ).toBe('focus-prev')
    expect(
      resolveCommand(
        key({ key: 'ArrowDown' }),
        ctx({ family: 'grid', editing: true, caretAtEnd: true }),
      ),
    ).toBe('focus-next')
  })

  it('reorderEnabled が偽なら Alt+↑↓ は並び替えにならない', () => {
    expect(
      resolveCommand(
        key({ key: 'ArrowUp', altKey: true }),
        ctx({ family: 'grid', reorderEnabled: false }),
      ),
    ).toBeNull()
    expect(
      resolveCommand(
        key({ key: 'ArrowDown', altKey: true }),
        ctx({ family: 'grid', reorderEnabled: false }),
      ),
    ).toBeNull()
  })

  it('deletableField が偽なら空欄 Backspace で行が消えない', () => {
    expect(
      resolveCommand(
        key({ key: 'Backspace' }),
        ctx({ family: 'grid', fieldEmpty: true, deletableField: false }),
      ),
    ).toBeNull()
  })

  it('主修飾キー＋Enter は toggle-item-state', () => {
    expect(resolveCommand(key({ key: 'Enter', ctrlKey: true }), ctx({ family: 'grid' }))).toBe(
      'toggle-item-state',
    )
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

Run: `npx vitest run src/core/keyboard/keymap.test.ts`
Expected: FAIL 2件。`Enter は行を足さず下の行へ送る` が `'insert-item-after'` を返し、`←→ はキャレット端で隣の列へ移る` が `null` を返す。残りの10件は `'grid'` がどの家族名にも一致せず `'list'` と同じ経路を通るので、この時点で既に緑になる

`'grid'` はまだ `KeyFamily` に無いが、vitest は型を検査しないのでテストは実行できる。`tsc -b` はここでは走らせない。

- [ ] **Step 3: `KeyFamily` に `'grid'` を足す**

`src/core/keyboard/keymap.ts` の `KeyFamily` を次にする。JSDoc の箇条書きにも1行足す。

```ts
 * - `'grid'`: 行を足せない表。`Enter` は下の行へ、`←→` は隣の列へ送る
 */
export type KeyFamily = 'list' | 'tree' | 'horizontal' | 'grid'
```

- [ ] **Step 4: `Enter` の分岐を書く**

`src/core/keyboard/keymap.ts` の `case 'Enter':` の1行を次に置き換える。

```ts
    case 'Enter':
      if (e.altKey || e.shiftKey) return null
      // 表の行は条件の直積から導出するので足せない。Excel と同じく下の行へ送る
      return ctx.family === 'grid' ? 'focus-next' : 'insert-item-after'
```

- [ ] **Step 5: `←→` の分岐を書く**

`case 'ArrowLeft':` の `if (ctx.family === 'horizontal') { … }` ブロックの直後に足す。

```ts
      if (ctx.family === 'grid') {
        if (e.altKey || e.shiftKey || ctx.arrowsOwnedByField) return null
        return !ctx.editing || ctx.caretAtStart ? 'focus-prev-field' : null
      }
```

`case 'ArrowRight':` の同じ位置に足す。

```ts
      if (ctx.family === 'grid') {
        if (e.altKey || e.shiftKey || ctx.arrowsOwnedByField) return null
        return !ctx.editing || ctx.caretAtEnd ? 'focus-next-field' : null
      }
```

`Tab` と `↑↓` と `Backspace` は触らない。`'grid'` はどの家族名にも一致せず、`'list'` と同じ経路を通る。

- [ ] **Step 6: JSDoc が実装と一致することを確認する**

Step 3 で書いた `'grid'` の行（`Enter` は下の行へ、`←→` は隣の列へ送る）を読み、Step 4 と Step 5 の実装と食い違っていないことを確かめる。

- [ ] **Step 7: 全体が緑になることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 8: 番人が実在することを壊して確かめる**

次の3つの変異を1つずつ入れ、赤くなるテストを確認してから戻す。

| 変異 | 赤くなるテスト |
| --- | --- |
| `case 'Enter'` の `ctx.family === 'grid'` を `ctx.family === 'tree'` にする | `Enter は行を足さず下の行へ送る` |
| `ArrowLeft` の `grid` ブロックから `ctx.arrowsOwnedByField` を外す | `欄が矢印を使うなら ←→ は欄のもの` |
| `ArrowRight` の `grid` ブロックの `!ctx.editing \|\| ctx.caretAtEnd` を `true` にする | `←→ はキャレットが中間なら欄のもの` |

戻したあと `git status --short` が Step 1〜5 の変更だけを示すこと。

- [ ] **Step 9: コミット**

`keymap.ts` と `keymap.test.ts` をステージしてコミットする。メッセージは次の形にする。

```
feat(m36): 表の家族 grid を足す

表の行は条件の直積から導出するので足せない。Enter を下の行へ送り、
←→ を隣の列へ送ることで、Excel の流儀と衝突しない写像にする。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01SSyAnv19UVzGrJFu3HcUeB
```

---

## 人間への依頼

実機確認はサブエージェントには行えない。マージ前に次を確かめてほしい。

- 用語集とエラーカタログで `Enter` が行を足し、`Tab` が欄を移ること
- ロジックツリーと課題ツリーで `Tab` が子を足し、`←→` が親子間を移ること
- シーケンスのアクターヘッダで `Alt+←→` が並び替えになり、`↑↓` が効かないこと
- どのツールでも `Ctrl+Z` と `Ctrl+Shift+Z` が効くこと

`'grid'` を使う画面はこの段階に無いので、実機で確かめるものは無い。
