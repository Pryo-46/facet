# デシジョンテーブル m1 操作感の手入れ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 実機で見つかった12点を直し、定義部をロジックツリーと同じ打ち方にし、表本体では矢印が値を書き換えないようにする。

**Architecture:** 定義部の家族を `'list'` から `'tree'` へ移す。条件と値は親子なので、`Tab`＝値を足す・`←→`＝名前と値の往復が、コアの写像のまま手に入る。表本体では `CellSelect` に口を2つ足し、矢印を移動へ戻して `Enter` と `Space` を開く操作に寄せる。

**Tech Stack:** TypeScript / React / Vitest / oxlint

**Spec:** [`docs/superpowers/specs/2026-09-10-decision-table-design.md`](../specs/2026-09-10-decision-table-design.md)。m1 の本体は [`2026-09-11-decision-table-m1.md`](2026-09-11-decision-table-m1.md) が入れてある

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

- `Command` の語彙を増やさない。使うのは既にある写像だけ
- キーの判定を `src/core/keyboard/` の外に書かない。ツール側が書くのは `KeyContext` の組み立てと `runCommand` の写像だけ
- **空は空のまま置く。** 人が決めていない値を既定として入れない
- 色値を直書きしない。役割トークン（`bg-surface` / `bg-surface-muted` / `border-l-rule-muted` 等）を使う
- 文字の段は `text-sm` / `text-base` / `text-xl` の3段だけ。`leading-*` は `none` と `normal` だけ。角丸は `rounded-sm` / `rounded-md` / `rounded-full` だけ
- `src/components/CellSelect.tsx` は用語集とエラーカタログも使う。**足すのは任意の口だけで、既定の振る舞いを変えない**

### 検証

- 検証コマンドは `npm test && npx tsc -b && npm run lint`
- 着手時点の全体は緑である（176 ファイル・2403 テスト、`tsc -b` と `oxlint` は終了コード0）
- コアの共有部品を触るタスクは `npx vitest run src/components src/core/list-editor src/modules/glossary src/modules/error-catalog` の緑を条件にする
- **vitest は型を検査しない。** 落ちる／落ちないは実行時の値で決まる
- `src/modules/*/skill-write.smoke.test.ts` の5本は全体実行でまれに落ちる。単体で再実行して通れば既知のものである

## 直すもの（実機で挙がった12点）

| # | 挙がったこと | どのタスク |
| --- | --- | --- |
| 1 | 新しい条件に `はい` / `いいえ` を既定で入れない | Task 1 |
| 2 | 定義部のキー操作をロジックツリーの打ち方に寄せる | Task 1 |
| 3 | `Tab` で値と選択肢を足し、足した欄へ移る | Task 1 |
| 4 | 空欄 `Backspace` で値を消したら、一つ手前の欄へ移る | Task 1 |
| 5 | 値と選択肢の ✕ を `Tab` の順から外す | Task 1 |
| 6 | 結果セルの矢印で値が書き換わらないようにする | Task 2 |
| 7 | 結果セルの初期値が勝手に埋まって見える（6と同じ原因） | Task 2 |
| 8 | `Enter` と `Space` でドロップダウンを開く | Task 2 |
| 9 | 条件列と結果列で面を分ける | Task 3 |
| 10 | 条件列にも薄い罫線を引く | Task 3 |
| 11 | フォーカスのある行に面を敷き、No と条件セルのクリックでその行へ移る | Task 3 |
| 12 | `起こりえない` を表の右端のボタンでも入り切りできるようにする | Task 4 |
| — | 値を選んでいる間、行の面が消える（Task 3 の副作用として見つかったもの） | Task 5 |

## File Structure

| ファイル | 役割 | 扱い |
| --- | --- | --- |
| `src/modules/decision-table/commands.ts` | 新しい条件の既定値 | 変更（1行） |
| `src/modules/decision-table/DecisionTableEditor.tsx` | 定義部と表本体の配線 | 変更 |
| `src/modules/decision-table/DefinitionList.tsx` | 定義部の一覧 | 変更 |
| `src/modules/decision-table/GridBody.tsx` | 表本体 | 変更 |
| `src/components/CellSelect.tsx` | セルのドロップダウン。用語集とエラーカタログも使う | 変更（任意の口を2つ） |
| `docs/decision-table/decision-table-design-notes.md` | このツールの設計の正 | 変更 |
| `docs/open-issues.md` | 残件 | 変更（2行消す） |
| `src/components/CellSelect.dom.test.tsx` | 共有部品のテスト | 変更 |

---

## Task 1: 定義部をロジックツリーの打ち方にする

条件と値は親子である。家族を `'tree'` にすると、`Tab`＝値を足す・`←→`＝名前と値の往復が、コアの写像のまま手に入る。

**Files:**
- Modify: `src/modules/decision-table/commands.ts`
- Modify: `src/modules/decision-table/DecisionTableEditor.tsx`
- Modify: `src/modules/decision-table/DefinitionList.tsx`
- Test: `src/modules/decision-table/commands.test.ts`
- Test: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `resolveCommand` の `'tree'` 家族の写像（`src/core/keyboard/keymap.ts`。`Tab`→`insert-child`、`←`→`focus-parent`、`→`→`focus-child`）
- Produces: `ConfirmFocus` が `field` と `rowRemoved` を持つ形に変わる

- [ ] **Step 1: 新しい条件の既定値を空にする**

`commands.ts` の `newCondition` を次にする。JSDoc も書き換える。

```ts
/**
 * 新しい条件。**値は2つとも空から始める。** 人が決めていない値を既定で入れると、
 * 決めた値と見分けが付かない。2つ置くのは、条件が1つの値しか持たないと
 * 直積が枝分かれしないためである
 */
export function newCondition(): Condition {
  return { id: newId('cond'), name: '', values: ['', ''] }
}
```

`commands.test.ts` の `新しい条件は名前が空で、はい／いいえ の2値から始まる` を次に書き換える。

```ts
  it('新しい条件は名前も値も空の2値から始まる', () => {
    const c = newCondition()
    expect(c.id).toMatch(/^cond_[A-Za-z0-9]{10}$/)
    expect(c.name).toBe('')
    expect(c.values).toEqual(['', ''])
  })
```

`DecisionTableEditor.tsx` の `PROBE_CONDITION` はラベルを読まない（値の本数だけを数える）。コメントを実物に合わせ、値を `['', '']` にする。

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/modules/decision-table/`
Expected: PASS。**この段階では既存テストが `['はい','いいえ']` を期待していないので緑のまま**——Step 1 でテストも同時に書き換えている

続けて、既定値が消えたことを確かめる。

Run: `grep -rn "'はい', 'いいえ'" src/modules/decision-table/commands.ts`
Expected: 出力なし

- [ ] **Step 3: 定義部の家族を `'tree'` にする**

`DecisionTableEditor.tsx` の定義部の `KeyContext` の `family` を `'list'` から `'tree'` に変える。コメントを次にする。

```ts
      // 条件と値は親子なので木の家族を使う。`Tab` が値を足し、`←→` が
      // 名前と値の間を行き来する（ロジックツリーと同じ打ち方）
      family: 'tree',
```

- [ ] **Step 4: `insert-child` と `focus-parent` / `focus-child` を写す**

`runCommand` の `switch` に3つの `case` を足す。`insert-item-after` の直後に置く。

```ts
      case 'insert-child': {
        // 木の `Tab`＝子を足す。条件の子は値なので、その行に値を1つ足して移る。
        // ラベルセルから打っても同じ——値に子は無いので、行に足す意味へ畳む
        if (!section.canAddLabel(at.index)) return true
        section.onAddLabel(at.index)
        return true
      }
      case 'focus-parent': {
        // ← は値から名前へ。名前セルには親が無いので既定に落とす
        if (labelIndex === null) return false
        return section.rows.focusCell(section.rows.rowKeys[at.index], 'name')
      }
      case 'focus-child': {
        // → は名前から1つ目の値へ。値には子が無いので既定に落とす
        if (labelIndex !== null) return false
        return section.rows.focusCell(
          section.rows.rowKeys[at.index],
          `${LABEL_FIELD}0`,
        )
      }
```

`Section` に2つ足す。

```ts
interface Section {
  key: ConfirmFocus['key']
  rows: ListRows
  canAddRow: boolean
  /** ラベルを1つ足せるか。条件は行数の上限に掛かる */
  canAddLabel: (index: number) => boolean
  /** ラベルを1つ足し、足した欄へフォーカスを予約する */
  onAddLabel: (index: number) => void
  onRemoveLabel: (index: number, labelIndex: number) => void
}
```

`conditionSection` に `canAddLabel: canAddValue` と `onAddLabel: addValueAt`、`outcomeSection` に `canAddLabel: () => true` と `onAddLabel: addChoiceAt` を渡す。

- [ ] **Step 5: 足した欄・消した後の欄へフォーカスを移す**

いまラベルの増減はフォーカスを動かさない。`ConfirmFocus` を、行き先の欄まで持つ形に変える。

```ts
/**
 * 削除や追加のあと、フォーカスを移す先。
 *
 * **行を消したときは位置が繰り上がる**ので、残った本数で丸める必要がある。
 * ラベルを消したときは行が残るので、丸めずにそのまま使う
 */
interface ConfirmFocus {
  key: 'condition' | 'outcome'
  index: number
  /** 行が残っているときに移る欄。`'name'` か `` `label:N` `` */
  field: string
  /** 行ごと消したか。真なら `index` を残りの本数で丸める */
  rowRemoved: boolean
}
```

`reserveConfirmFocus` を次の形にする。

```ts
  /**
   * 削除・追加のあとの行き先を予約する。
   *
   * **`focusCell` では代われない。** 構造を変えた直後は移動先がまだ描かれていない
   */
  const reserveFocusAt = (focus: ConfirmFocus, next: DecisionTableSchemaVersion1): void => {
    const rows = focus.key === 'condition' ? conditionRows : outcomeRows
    const items = focus.key === 'condition' ? next.conditions : next.outcomes
    if (items.length === 0) {
      rows.reserveFocus('add-button')
      return
    }
    const at = focus.rowRemoved ? Math.min(focus.index, items.length - 1) : focus.index
    rows.reserveFocus({ rowKey: computeRowKeys(items)[at], field: focus.field })
  }
```

ラベルの増減を行き先つきにする。

```ts
  /** ラベルを1つ足し、足した欄へ移る。足す位置は行の末尾 */
  const addValueAt = (index: number): void =>
    void applyDefinition(addValue(data, index), null, false, {
      key: 'condition',
      index,
      field: `${LABEL_FIELD}${data.conditions[index].values.length}`,
      rowRemoved: false,
    })
  const addChoiceAt = (index: number): void =>
    void applyDefinition(addChoice(data, index), null, false, {
      key: 'outcome',
      index,
      field: `${LABEL_FIELD}${data.outcomes[index].choices.length}`,
      rowRemoved: false,
    })

  /** ラベルを1つ消し、一つ手前の欄へ移る。先頭を消したら名前セルへ戻る */
  const removeValueAt = (index: number, labelIndex: number) =>
    applyDefinition(removeValue(data, index, labelIndex), null, true, {
      key: 'condition',
      index,
      field: labelIndex === 0 ? 'name' : `${LABEL_FIELD}${labelIndex - 1}`,
      rowRemoved: false,
    })
  const removeChoiceAt = (index: number, labelIndex: number) =>
    applyDefinition(removeChoice(data, index, labelIndex), null, true, {
      key: 'outcome',
      index,
      field: labelIndex === 0 ? 'name' : `${LABEL_FIELD}${labelIndex - 1}`,
      rowRemoved: false,
    })
```

行の削除は `field: 'name'` と `rowRemoved: true` を渡す。`removeRowAt` の中で組み立てる。

`applyDefinition` が、**その場で適用したときも**行き先を予約するようにする。

```ts
    onChange(applied.data, mergeKey)
    // 行ごと消したときはフックが予約済みなので、ここではラベルの行き先だけを積む。
    // 二重に積むと、フックの予約を上書きして移動先が入れ替わる
    if (focus !== null && !focus.rowRemoved) reserveFocusAt(focus, applied.data)
    return true
```

`onConfirm` 側は `rowRemoved` に関わらず予約する（保留した時点でフックは早期に返っている）。

- [ ] **Step 6: ✕ を `Tab` の順から外す**

`DefinitionList.tsx` のラベルの ✕ ボタンに `tabIndex={-1}` を足し、理由をコメントに書く。

```tsx
                            <button
                              type="button"
                              // キーボードからは空欄 `Backspace` で消せるので、`Tab` の
                              // 順に入れない。入れると値を打つたびに ✕ を1回踏む
                              tabIndex={-1}
                              aria-label={`${itemLabel}を消す（${no}行目の${labelIndex + 1}つ目）`}
```

行の ✕（条件・結果そのものを消す）は `Tab` の順に残す。**行の削除にキーボードの入口が無い欄がある**ためで、名前セルが空でないと `Backspace` では消せない。

- [ ] **Step 7: DOM テストを足す**

`DecisionTableEditor.dom.test.tsx` に足す。**コードは計画に書かない**——既存のテストの書き方（role とアクセシブル名で引く）に合わせること。見る性質は次のとおり。

1. 条件名セルで `Tab` を押すと、その条件の値が1つ増える
2. 条件名セルで `Tab` を押すと、増えた値の欄へフォーカスが移る
3. 値の欄で `Tab` を押しても、その行に値が増える（値に子は無いので行へ畳む）
4. 行数の上限に達していると、`Tab` を押しても値が増えない
5. 値の欄で空欄 `Backspace` を押すと、一つ手前の値の欄へフォーカスが移る
6. 1つ目の値の欄で空欄 `Backspace` を押すと、名前セルへフォーカスが移る
7. 値の欄で `←`（キャレット先頭）を押すと、その行の名前セルへ移る
8. 名前セルで `→`（キャレット末尾）を押すと、1つ目の値の欄へ移る
9. 選択肢の欄でも1〜3と同じことが起きる（結果の一覧でも同じ写像である）
10. 値の ✕ ボタンが `Tab` の順に入っていない（`tabIndex` が `-1`）
11. 条件名セルで `Enter` を押すと、条件が1本増える（木にしても兄弟の追加は変わらない）

- [ ] **Step 8: 全体が緑になることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 9: 番人が実在することを壊して確かめる**

次の3つの変異を1つずつ入れ、赤くなるテストを確認してから戻す。

| 変異 | 赤くなるテスト |
| --- | --- |
| 定義部の `family` を `'tree'` から `'list'` に戻す | `Tab` で値が増えることを見る性質1・2・3 |
| `insert-child` の `if (!section.canAddLabel(at.index)) return true` を消す | 上限に達していても値が増える性質4 |
| `removeValueAt` の `field` を常に `'name'` にする | 一つ手前の欄へ移る性質5 |

戻したあと `git status --short` が Step 1〜7 の変更だけを示すこと。

- [ ] **Step 10: コミット**

```bash
git add src/modules/decision-table src/components
git commit -m "$(cat <<'EOF'
feat(decision-table): 定義部を木の家族にし、既定の値を空にする

条件と値は親子なので、Tab が値を足し ←→ が名前と値を行き来する。
人が決めていない値を既定で入れると、決めた値と見分けが付かない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## Task 2: 表本体で矢印を移動に戻す

`CellSelect` は閉じたまま素の `↑↓` を値の切り替えに使う。表では `↓` で行を移ろうとした打鍵が値を書き換えるので、カーソルを動かしただけでセルが埋まる。

**Files:**
- Modify: `src/components/CellSelect.tsx`
- Modify: `src/components/CellSelect.dom.test.tsx`
- Modify: `src/modules/decision-table/GridBody.tsx`
- Test: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`

**Interfaces:**
- Produces: `CellSelectProps` の任意 prop 2つ
  - `changeOnArrows?: boolean`（既定 `true`）
  - `openOnEnter?: boolean`（既定 `false`）

- [ ] **Step 1: `CellSelect` に口を2つ足す**

既定は現在の振る舞いのままにする。**用語集とエラーカタログの呼び出しは1文字も変えない。**

```ts
  /**
   * 閉じたまま素の `↑↓` で値を切り替えるか（既定 `true`）。
   *
   * **表では偽にする。** 真のままだと、行を移ろうとした `↓` が値を書き換え、
   * カーソルを動かしただけでセルが埋まる
   */
  changeOnArrows?: boolean
  /**
   * `Enter` でメニューを開くか（既定 `false`）。
   *
   * 偽のときは `Enter` をセルの操作言語へ渡す（ネイティブの select は
   * Windows では `Enter` で開かない）。表では真にして、値の変更を
   * 明示的に開いたときだけに限る
   */
  openOnEnter?: boolean
```

`onTriggerKeyDown` を次の形にする。

```ts
  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>): void => {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey) {
      // 矢印を欄が使わない設定では、そのままセルの操作言語へ渡す。
      // ここで preventDefault すると、表の行移動が消える
      if (props.changeOnArrows === false) {
        props.onKeyDown?.(e)
        return
      }
      e.preventDefault()
      const at = props.options.indexOf(props.value)
      const next = props.options[at + (e.key === 'ArrowDown' ? 1 : -1)]
      if (next !== undefined) props.onPick(next)
      return
    }
    …（以下、既存の Enter の扱いを openOnEnter で分ける）
  }
```

`Enter` の扱いは次のとおり。`openOnEnter` が真なら `preventDefault` せずに Radix の既定（開く）へ渡し、偽なら現在どおり `preventDefault` してセルの操作言語へ渡す。**主修飾キーを伴う `Enter` は常にセルの操作言語へ渡す**——`toggle-item-state` の写像を奪わないため。

- [ ] **Step 2: `CellSelect` のテストを足す**

`CellSelect.dom.test.tsx` に足す。見る性質は次のとおり。

1. 既定では、閉じたまま素の `↓` が値を1つ進める（既存の振る舞いが変わっていない）
2. `changeOnArrows={false}` のとき、素の `↓` は値を変えず `onKeyDown` へ渡る
3. 既定では、`Enter` は開かず `onKeyDown` へ渡る
4. `openOnEnter` のとき、`Enter` でメニューが開く
5. `openOnEnter` でも、主修飾キー＋`Enter` は `onKeyDown` へ渡る

- [ ] **Step 3: 表本体で新しい口を使う**

`GridBody.tsx` の `CellSelect` に `changeOnArrows={false}` と `openOnEnter` を渡す。

- [ ] **Step 4: 表本体の DOM テストを足す**

`DecisionTableEditor.dom.test.tsx` に足す。見る性質は次のとおり。

1. 結果セルで `↓` を押すと、下の行の同じ列へフォーカスが移り、**値は変わらない**
2. 結果セルで `↑` を押すと、上の行の同じ列へフォーカスが移り、値は変わらない
3. 結果セルで `Enter` を押すとメニューが開き、行は移らない
4. 結果セルで主修飾キー＋`Enter` を押すと `起こりえない` が入る（`toggle-item-state` が奪われていない）

- [ ] **Step 5: 既存の2モジュールが緑であることを確認する**

Run: `npx vitest run src/components src/core/list-editor src/modules/glossary src/modules/error-catalog`
Expected: PASS。**この緑がコアを触る条件である**

- [ ] **Step 6: 全体が緑になることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 7: 番人が実在することを壊して確かめる**

| 変異 | 赤くなるテスト |
| --- | --- |
| `GridBody` から `changeOnArrows={false}` を外す | 結果セルで `↓` を押すと下の行へ移り値は変わらない |
| `GridBody` から `openOnEnter` を外す | 結果セルで `Enter` を押すとメニューが開く |
| `onTriggerKeyDown` の主修飾キーの除外を消す | 主修飾キー＋`Enter` で `起こりえない` が入る |

- [ ] **Step 8: コミット**

```bash
git add src/components src/modules/decision-table
git commit -m "$(cat <<'EOF'
fix(decision-table): 表の矢印を移動に戻し、開く操作を Enter と Space に寄せる

閉じたセルが素の ↑↓ を値の切り替えに使うと、行を移ろうとした打鍵が
セルを埋める。値の変更は、明示的に開いたときだけに限る。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## Task 3: 表本体の列と行を見分けられるようにする

**Files:**
- Modify: `src/modules/decision-table/GridBody.tsx`
- Modify: `src/modules/decision-table/DecisionTableEditor.tsx`
- Test: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`

**Interfaces:**
- Produces: `GridBodyProps` に `focusedRow: number | null` と `onFocusRow: (index: number) => void`

- [ ] **Step 1: 面の決め方を1箇所にまとめる**

セルの面は4つの段で決まる。**上から順に強い。**

| 段 | 面 | いつ |
| --- | --- | --- |
| 無効 | `bg-invalid-face` | 整合性検証の指摘が当たっている |
| 欠落 | `bg-missing-face` | 空の結果セル（`impossible: false` の行） |
| フォーカスのある行 | `bg-surface-muted` | その行に表本体のフォーカスがある |
| 条件列 | `bg-surface-muted` | 条件の値を出す読み取り専用のセル |
| それ以外 | 面を付けない | — |

`GridBody.tsx` に次の関数を置く。`cellFace` が `'none'` を返したときだけ地の面へ落ちる。

```ts
  /**
   * セルの面。**無効と欠落が地の面より強い。** 弱いほうを先に当てると、
   * 赤や黄が行の面に塗り潰される
   */
  const surfaceOf = (index: number, field: string, warn: boolean, rowAnchor = false): string => {
    const face = cellFace(marks, index, field, warn, rowAnchor)
    if (face !== 'none') return CELL_FACE_CLASS[face]
    return index === focusedRow || field === CONDITION_FIELD ? 'bg-surface-muted' : ''
  }
```

条件列は編集対象ではないので `field` を持たない。地の面を引くためだけの定数を1つ置く。

```ts
/** 条件列の地を引くための鍵。条件列は編集対象ではないので、指摘の `field` にはならない */
const CONDITION_FIELD = 'condition-column'
```

- [ ] **Step 2: 条件列に罫線を引く**

条件列の各 `<td>` と `<th>` に `border-l border-l-rule-muted` を足す。結果列は既に `border-l-rule` を持っているので触らない。**2種類の濃さが列の種類を分ける**——条件どうしの境界は弱く、条件と結果の境界は強い。

- [ ] **Step 3: フォーカスのある行を追う**

`DecisionTableEditor.tsx` に state を1つ足す。

```ts
  /**
   * 表本体でフォーカスのあるセルの行。**会議で「この行の場合は」と指すための面**を
   * この行に敷く。表からフォーカスが外れたら null に戻す
   */
  const [focusedRow, setFocusedRow] = useState<number | null>(null)
```

`GridBody` に `focusedRow` と `onFocusRow` を渡す。`GridBody` 側は、結果セル（`CellSelect` のトリガーと `起こりえない` のボタン）の `onFocus` で `onFocusRow(index)` を、表を包む `<div>` の `onBlur` で行の外へ出たときに `null` を渡す。

**`onBlur` は行の中の移動でも飛ぶ。** `e.currentTarget.contains(e.relatedTarget)` を見て、表の外へ出たときだけ `null` にする。

- [ ] **Step 4: No と条件セルのクリックで行へ移る**

No セルと条件セルの `<td>` に `onClick` を足し、その行の1つ目のフォーカスできるセルへ移す。**編集はできない**ままにする。

移動先は `GridBody` が知っている。結果が1本以上あれば `result:0`、無ければ `起こりえない` のボタン（Task 4 で足す）。Task 4 の前は結果が0本のとき移動先が無いので、そのときは何もしない。

- [ ] **Step 5: 画面のヒントを実物に合わせる**

`DecisionTableEditor.tsx` の `KeyHints` の宣言2本が、どちらも実物とずれている。**rev 10章は写像を足したツールに画面のヒントも求める**ので、ここで揃える。

定義部は木の家族になり、`Tab` と `←→` に意味が付いた。

```ts
const DEFINITION_HINTS: KeyHint[] = [
  { keys: 'Enter', label: '下に追加' },
  { keys: 'Tab', label: '値を追加' },
  { keys: '←→', label: '名前と値を行き来' },
  { keys: '$alt+↑↓', label: '並び替え' },
  { keys: '空欄で Backspace', label: '削除' },
]
```

表本体は `Enter` が選択肢を開くようになった。

```ts
const GRID_HINTS: KeyHint[] = [
  { keys: 'Enter / Space', label: '選択肢を開く' },
  { keys: '↑↓←→', label: 'セルの移動' },
  { keys: 'Tab', label: '次の列へ' },
  { keys: '$mod+Enter', label: IMPOSSIBLE_LABEL },
]
```

**`keys` は一覧の中で重ならないこと。** `KeyHints` は `key={hint.keys}` で描くので、同じ文字列が2件あると React の key が衝突する。

- [ ] **Step 6: DOM テストを足す**

見る性質は次のとおり。

1. 表本体のヒントに `Enter` を「下の行へ」と説明する文字が出ない
2. 結果セルにフォーカスすると、その行のセルに面が付く
2. 別の行のセルへ移ると、面も移る
3. 表の外へフォーカスが出ると、面が消える
4. 条件セルをクリックすると、その行の結果セルへフォーカスが移る
5. No セルをクリックしても同じことが起きる
6. 条件セルをクリックしても、条件セルは入力欄にならない
7. 空の結果セルでは、欠落の面が行の面より強い（行にフォーカスがあっても黄のまま）

- [ ] **Step 7: 全体が緑になることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 8: 番人が実在することを壊して確かめる**

| 変異 | 赤くなるテスト |
| --- | --- |
| `surfaceOf` の `if (face !== 'none') return …` を消し、地の面を先に返す | 欠落の面が行の面より強い |
| `onBlur` の `contains` の判定を消して常に `null` にする | 別の行のセルへ移ると面も移る |
| No セルの `onClick` を消す | No セルをクリックすると結果セルへ移る |
| `GRID_HINTS` の `Enter / Space` を `Enter` に戻し、説明を `下の行へ` にする | 表本体のヒントに `Enter` を「下の行へ」と説明する文字が出ない |

- [ ] **Step 9: コミット**

```bash
git add src/modules/decision-table
git commit -m "$(cat <<'EOF'
feat(decision-table): 表の列と行を面と罫線で見分けられるようにする

条件名が長い表では、罫線が無いと列の境界が読めない。フォーカスのある行に
面を敷くと、画面共有で「この行の場合は」と指せる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## Task 4: 起こりえないを表の右端のボタンにする

主修飾キー＋`Enter` だけが入口だと、マウスで操作する人に手段が無い。

**Files:**
- Modify: `src/modules/decision-table/GridBody.tsx`
- Test: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`
- Modify: `docs/open-issues.md`

- [ ] **Step 1: 列を1本足す**

結果列の右に列を1本足す。幅は 40px（定義部の削除列と同じ）。見出しは空にし、列の意味は行のボタンのアクセシブル名が運ぶ。

各行に `Ban`（`lucide-react`）のアイコンボタンを置く。

```tsx
                <td className={`${headColBorder} px-1 py-1 text-center ${rowSurface}`}>
                  <button
                    type="button"
                    aria-pressed={row.impossible}
                    aria-label={`${rowRef(index)} を${IMPOSSIBLE_LABEL}にする`}
                    title={IMPOSSIBLE_LABEL}
                    className={`${buttonBase} size-6 ${row.impossible ? 'text-ink' : 'text-ink-faint hover:text-ink'}`}
                    onClick={() => onToggleImpossible(index)}
                  >
                    <Ban aria-hidden className="size-4" />
                  </button>
                </td>
```

**`aria-label` は状態で書き分けない。** `aria-pressed` が入り切りを運ぶので、名前まで変えると読み上げが二重になる。

**このボタンは `Tab` の順に残す。** 行の ✕ と同じで、キーボードからの入口（主修飾キー＋`Enter`）は結果セルにしか無く、結果が0本の表ではこのボタンだけが入口になる。

- [ ] **Step 2: 結果が0本でも行が出ることを確かめる**

結果が0本のとき、行は No 列・条件列・このボタンだけになる。**`起こりえない` の状態はこのボタンだけが運ぶ**ので、結果セルが無くても入り切りできる。

Task 3 Step 4 の「No と条件セルのクリックで行へ移る」は、結果が0本のときこのボタンへ移す。

- [ ] **Step 3: DOM テストを足す**

見る性質は次のとおり。

1. 各行に `起こりえない` のボタンが1つ出る
2. 押すと `impossible` が真になり、`aria-pressed` が真になる
3. もう一度押すと偽に戻る
4. 結果が0本の表でもボタンが出て、押すと `impossible` が入る
5. 主修飾キー＋`Enter` の入口も引き続き効く（既存の性質が壊れていない）

- [ ] **Step 4: 残件から2行消す**

`docs/open-issues.md` の「挙動の穴」から次の2行を消す。どちらもこの計画が塞いでいる。

- `**`impossible` の入り切りにマウスの入口が無い**（`src/modules/decision-table/GridBody.tsx`）。…`
- `**デシジョンテーブルの定義部の欄の移動がブラウザの `Tab` 順に依存する**（`src/modules/decision-table/DecisionTableEditor.tsx`）。…`

2本目を消せるのは、Task 1 が `←→` と `Tab` を写像に載せたためである。

- [ ] **Step 5: 全体が緑になることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 6: 番人が実在することを壊して確かめる**

| 変異 | 赤くなるテスト |
| --- | --- |
| ボタンの `onClick` を空にする | 押すと `impossible` が真になる |
| `aria-pressed` を常に `false` にする | `aria-pressed` が状態を運ぶ |

- [ ] **Step 7: コミット**

```bash
git add src/modules/decision-table docs/open-issues.md
git commit -m "$(cat <<'EOF'
feat(decision-table): 起こりえないを表の右端のボタンでも入り切りする

キーだけが入口だと、マウスで操作する人に手段が無い。結果が0本の表では
このボタンが唯一の入口になる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## Task 5: ドロップダウンを開いている間も行の面を保つ

Radix はメニューを `document.body` 直下のポータルへ描く。結果セルを開くとフォーカスがそのポータルへ移り、表を包む `onBlur` の `contains` 判定から外れて行の面が消える。**会議で行を指しながら値を選ぶ動作が、まさにその瞬間に崩れる。**

**Files:**
- Modify: `src/components/CellSelect.tsx`
- Modify: `src/components/CellSelect.dom.test.tsx`
- Modify: `src/modules/decision-table/GridBody.tsx`
- Test: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`

**Interfaces:**
- Produces: `CellSelectProps` の任意 prop `onOpenChange?: (open: boolean) => void`

- [ ] **Step 1: `CellSelect` に開閉を知らせる口を足す**

既定は無しで、**用語集とエラーカタログの呼び出しは1文字も変えない**（`itemLabelOf` / `changeOnArrows` / `openOnEnter` と同じ流儀）。

```ts
  /**
   * メニューの開閉が変わったときに呼ぶ。
   *
   * **開いている間は、呼び出し側のフォーカス追跡が外れる。** Radix はメニューを
   * `document.body` 直下のポータルへ描くので、表の `onBlur` はセルが外れたと見る。
   * 開いていることを知らせないと、値を選んでいる間だけ行の面が消える
   */
  onOpenChange?: (open: boolean) => void
```

部品が持つ `open` の state を更新するところすべてで呼ぶこと。`DropdownMenu` の `onOpenChange` に通せば1箇所で済む。

- [ ] **Step 2: 開いている間は行の面を保つ**

`GridBody` が「メニューを開いているセルの行」を持ち、`onBlur` の判定より優先する。

```ts
  /**
   * メニューを開いているセルの行。**`onBlur` より優先する。**
   * ポータルへ移ったフォーカスは表の外に見えるので、これが無いと
   * 値を選んでいる間だけ面が消える
   */
  const [menuRow, setMenuRow] = useState<number | null>(null)
```

面を引くときは `menuRow ?? focusedRow` を使う。`CellSelect` の `onOpenChange` で、開いたら `setMenuRow(index)`、閉じたら `setMenuRow(null)` にする。

**閉じたあとにフォーカスがトリガーへ戻ることに依存しない。** Radix は戻すが、戻らない経路（外側のクリックで閉じる）でも `focusedRow` が正しければ面は残り、外れていれば消える——どちらも正しい。

- [ ] **Step 3: 条件と結果の境界を強い罫線にする**

いま本体の行では、条件どうしの境界も条件と結果の境界も同じ弱さの線（`border-l-rule-muted`）になっている。**結果列の先頭の `<td>` だけ `border-l-rule` にする。** 見出しは既にそうなっているので、本体を見出しに揃える形になる。

- [ ] **Step 4: クリックできることを見た目で示す**

No セルと条件セルに `cursor-pointer` を足す。**編集はできないがクリックで行が動く**ので、手がかりが無いと気づけない。

- [ ] **Step 5: テストを足す**

`CellSelect.dom.test.tsx` に1本。性質は「メニューを開くと `onOpenChange` が `true` で呼ばれ、閉じると `false` で呼ばれる」。

`DecisionTableEditor.dom.test.tsx` に2本。見る性質は次のとおり。

1. 結果セルのメニューを開いている間も、その行に面が付いたままである
2. メニューを閉じると、面は `focusedRow` の行に戻る

- [ ] **Step 6: 既存2モジュールが緑であることを確認する**

Run: `npx vitest run src/components src/core/list-editor src/modules/glossary src/modules/error-catalog`
Expected: PASS。**この緑がコアの共有部品を触る条件である**

- [ ] **Step 7: 全体が緑になることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 8: 番人が実在することを壊して確かめる**

| 変異 | 赤くなるテスト |
| --- | --- |
| `GridBody` の面を `menuRow ?? focusedRow` から `focusedRow` に戻す | メニューを開いている間も行に面が付いたまま |
| `CellSelect` の `onOpenChange` の呼び出しを消す | メニューを開くと `onOpenChange` が呼ばれる |
| 結果列の先頭の `<td>` を `border-l-rule-muted` に戻す | 条件と結果の境界が強い罫線である |

- [ ] **Step 9: コミット**

```bash
git add src/components src/modules/decision-table
git commit -m "$(cat <<'EOF'
fix(decision-table): 値を選んでいる間も行の面を保つ

メニューは body 直下のポータルに描かれるので、表の onBlur はセルが
外れたと見る。開いていることを知らせないと、選んでいる間だけ面が消える。
EOF
)"
```

---

## Task 6: 文書を実装に合わせる

**Files:**
- Modify: `docs/decision-table/decision-table-design-notes.md`

- [ ] **Step 1: 「行の導出」の既定値を直す**

新しい条件が空の2値から始まることを述べる文が無ければ足す。既にあるなら実物に合わせる。

- [ ] **Step 2: 「キーボード」の節を書き直す**

いまの節は `family: 'list'` と、表本体の `↑↓` が行の種類で意味を変えることを述べている。どちらも実物と違う。次の内容にする。

- 定義部は `family: 'tree'`。条件と値は親子なので、`Tab` が値を足し、`←→` がキャレット端で名前と値を行き来する
- 表本体は `family: 'grid'`。矢印は全部セルの移動で、値を書き換えない
- 結果セルのメニューは `Enter` と `Space` で開く。値の変更は開いたときだけに限る
- `impossible` の入り切りは主修飾キー＋`Enter`（`toggle-item-state`）と、表の右端のボタン

**「`↑↓` は行の種類で意味が変わる」の1文は消す。** 矢印が値を書き換えなくなったので、この違いは無くなる。

- [ ] **Step 3: 「表の見せ方」の節を足す**

節を1つ足し、面と罫線の決まりを述べる。

- セルの面は、無効・欠落・フォーカスのある行・条件列の順に強い
- 条件どうしの境界は弱い罫線、条件と結果の境界は強い罫線
- フォーカスのある行に面を敷く。画面共有で行を指すための表示であり、データには持たない

- [ ] **Step 4: 実装と食い違っていないことを確認する**

決定を1つずつ挙げ、それを述べている文を指す。**「矛盾していない」を「書いてある」と読み替えないこと。**

| 確かめる決定 | 指すべき文 |
| --- | --- |
| 定義部は木の家族である | 設計ノートの「キーボード」 |
| 表の矢印は値を書き換えない | 設計ノートの「キーボード」 |
| 新しい条件の値は空から始まる | 設計ノートの「行の導出」 |
| フォーカスのある行の面はデータに持たない | 設計ノートの「表の見せ方」 |

- [ ] **Step 5: 全体が緑であることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add docs/decision-table
git commit -m "$(cat <<'EOF'
docs(decision-table): キーボードと表の見せ方を実物に合わせる

定義部は木の家族で、表の矢印は値を書き換えない。面と罫線の強さの順も
1箇所に書く。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014BYZya9WMQZ3XAyoY9VJpg
EOF
)"
```

---

## この計画が触らないもの

- **`src/core/keyboard/keymap.ts`。** 使うのは既にある `'tree'` と `'grid'` の写像だけで、`Command` の語彙は増やさない
- **複数行の選択。** フォーカスのある行だけを面で示す。範囲の選択は `Shift+↑↓` のコマンドが要り、rev 10章が禁じる語彙の追加になる
- **まとめて入力・畳み・Markdown 出力・登録 Skill。** それぞれ m2・m3・m4 が担当する

## 人間への依頼

実機確認はサブエージェントには行えない。PR の本文にチェックリストを足し、マージ前に確かめてもらう。
