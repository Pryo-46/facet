# デシジョンテーブル m2 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 条件5つ・32行の表を現実的に埋められるようにする。列ごとの絞り込みで見る行を減らし、絞り込んだ行へまとめて書き込む。

**Architecture:** 絞り込みは列ごとに「出すラベルの集合」を持ち、列の中は OR、列どうしは AND で効く。まとめて入力は絞り込みの結果をそのまま適用先にするので、対象を指す操作を2つ持たない。表本体は `rows` の全体を受け取り、表示する行の位置の配列（`visible`）を別に受け取って描く。

**Tech Stack:** TypeScript / React / Vitest / oxlint / Radix DropdownMenu

**Spec:** [`docs/superpowers/specs/2026-09-10-decision-table-design.md`](../specs/2026-09-10-decision-table-design.md)。m2 のスコープは「マイルストーン分割」の表の3行目

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

- `Command` の語彙を増やさない。行移動は `focus-prev` / `focus-next`、列移動は `focus-prev-field` / `focus-next-field` に写す
- キーの判定を `src/core/keyboard/` の外に書かない。ツール側が書くのは `KeyContext` の組み立てと `runCommand` の写像だけ
- **表のセルに敷く面のクラスは、1セルにつき1つだけ返す。** 2つ載せると、どちらが出るかは生成 CSS の並び順で決まる。`GridBody.tsx` の `surfaceOf` がこれを守っており、`DecisionTableEditor.dom.test.tsx` の「1つのセルに面のクラスを2つ載せない」が番人である
- **面の段を増やさない。** 絞り込みが対象外の行を隠すので、適用対象を面で示す必要が無い。`palette.css` と `palette-requirements.ts` はこの計画では変えない
- 色値を直書きしない。役割トークン（`text-ink` / `bg-missing-face` 等）を使う
- 文字の段は `text-sm` / `text-base` / `text-xl` の3段だけ。`leading-*` は `none` と `normal` だけ。角丸は `rounded-sm` / `rounded-md` / `rounded-full` だけ
- 2ツールで同じ実装を持たない。絞り込みの報告は `src/core/list-editor/use-visible-ids.ts` の `useVisibleIdsReport` を使い、書き直さない

### 検証

- 検証コマンドは `npm test && npx tsc -b && npm run lint`
- 着手時点の `npx tsc -b` と `oxlint` は終了コード0。`npm test` は 177 ファイル・2504 テストで、**`src/modules/sequence/skill-write.smoke.test.ts` の「アプリの整合性 message がすべて stdout に逐語で現れる」が全体実行でまれに落ちる**（単体で走らせると緑）。これは `docs/open-issues.md` に載っている既知の残件であり、この計画が作るものではない。落ちたら単体で走らせ直して確かめる

---

## 設計の要点

### 絞り込みの形

列ごとに「出すラベルの集合」を持つ。**集合が空の列は絞り込まない**——全ラベルを選んだ状態と「まだ触っていない」状態を同じ形にすると、あとで値を1つ足したときに新しい値だけが隠れる。

鍵は条件・結果の `id` で持つ。位置で持つと並び替えで別の列の絞り込みを引き継ぐ。ID が重複しているファイルでは2列が同じ絞り込みを共有するが、その状態は `duplicate-id` が既に赤で出している。

結果列の絞り込みには空文字を「未記入」として並べる。空欄は欠落であり、絞り込みから外すと抜けを探せない。

`起こりえない` の行を出すかは、列ではなく表全体のチェックボックス1つで持つ。既定は出す。

### 行の鍵

行は ID を持たないので、絞り込みを額縁へ知らせる鍵は値の組み合わせから作る。

```ts
const rowKeyOf = (row: Row): string => JSON.stringify(row.values)
```

**添字を鍵にしない。** `EditorProps.onVisibleIds` の報告は `useEffect` を通るので1フレーム古くなりうる。条件の値を1つ消すと直積が縮み、`3` という添字は別の組み合わせを指す。値の組み合わせなら、消えた組み合わせの鍵はどの行にも一致せず落ちるだけで、**間違った行が絞り込みの対象として通ることは原理的にない**。

`JSON.stringify` を使うのは、`useVisibleIdsReport` が鍵を NUL 文字で連結するためである。ラベルに制御文字が入っていても、`JSON.stringify` はそれを6文字のエスケープに置き換えるので区切りと衝突しない。

同じ値ラベルが2件ある表と、行が直積からずれている表では鍵が重複する。どちらも `duplicate-value` / `row-set` が赤で出している状態である。

### まとめて入力と絞り込みの統合

spec 5節は入力バーで条件ごとに値か「どれでも」を選ぶ形を書いているが、**その選択は絞り込みと同じ操作である**。絞り込みを対象の指定に使い、バーは適用先と値だけを持つ。

- 適用先は1回に1つ。結果列のどれか1つか、`起こりえない` の入り切りを選ぶ。結果の選択肢には「空にする」も並べる
- 上書きは常に行い、確認ダイアログを挟まない。トーストで変更した行数を出し、Undo で1操作として戻せる
- `onChange(next, null)` を渡し、構造操作と同じ履歴の粒度にする
- バーは通常のフォームで、`family: 'grid'` を掛けない

---

## Task 1: 計画と spec の差し替えをコミットする

**Files:**
- Create: `docs/superpowers/plans/2026-09-12-decision-table-m2.md`（このファイル）
- Modify: `docs/superpowers/specs/2026-09-10-decision-table-design.md`

**Interfaces:**
- Consumes: なし
- Produces: なし（以降のタスクは spec の5節と「マイルストーン分割」を正として読む）

- [ ] **Step 1: spec の5節を、絞り込みと統合した形へ置き換える**

`docs/superpowers/specs/2026-09-10-decision-table-design.md` の `### 5. まとめて入力` の節を、次の内容へ**置換**する（追記ではない）。

```markdown
### 5. 絞り込みとまとめて入力

表の列ごとに絞り込みを持つ。条件列は値、結果列は選択肢と「未記入」を並べ、列の中は OR、列どうしは AND で効く。`起こりえない` の行を出すかは表全体のチェックボックス1つで持ち、既定は出す。

**絞り込みの結果が、そのまままとめて入力の適用先になる。** 対象を指す操作を2つ持つと、絞り込んだ表を見ながら別の条件へ書き込む事故が起きる。

- 適用先は1回に1つ。結果列のどれか1つか、`impossible` の入り切りを選ぶ。結果の選択肢には「空にする」も並べる
- 上書きは常に行い、確認ダイアログを挟まない。トーストで変更した行数を出し、Undo で1操作として戻せる
- 対象行数をボタンに出す。対象外の行は絞り込みが隠すので、面では示さない
- `onChange(next, null)` を渡し、構造操作と同じ履歴の粒度にする
- バーは通常のフォームで、`family: 'grid'` を掛けない

絞り込みは `EditorProps.onVisibleIds` で額縁へ知らせる。行は ID を持たないので、鍵は値の組み合わせから作る——添字を鍵にすると、条件の値を消して直積が縮んだとき、同じ添字が別の組み合わせを指す。
```

- [ ] **Step 2: spec の8節の冒頭に、実装の時期を書く**

`### 8. 畳み（...）` の節の**先頭に**次の1行を足す。節の中身（畳みの規則）は変えない。

```markdown
畳みは絞り込みより後に作る。絞り込みが「32行を現実的に埋める」を担い、畳みは「効いていない条件を機械で挙げる」を担う。
```

- [ ] **Step 3: spec の「マイルストーン分割」の表を書き換える**

`decision-table-m2` の行と `decision-table-m3` の行を、次の3行へ置き換える。

```markdown
| `decision-table-m2` | 絞り込み、まとめて入力 | 条件5つ・32行が現実的に埋まる |
| `decision-table-m3` | Markdown 出力、表形式コピー | 貼り先で表が割れない。絞り込んだ行だけが出る |
| `decision-table-m5` | 畳みビュー | 畳みが軸を減らせる |
```

そのうえで、`decision-table-m4` の行の直後に `decision-table-m5` の行が来るよう並べ直す（`m4` の「登録 Skill と evals」の行は動かさない）。

- [ ] **Step 4: spec の「分岐」の節の本数を実物に合わせる**

「5本のマイルストーンはすべてそこへ PR する」「`main` へ入れるのは5本が揃ってからとする」の2箇所の「5本」を「6本」にする。

- [ ] **Step 5: 変更を確かめる**

Run: `git diff --stat docs/`
Expected: `docs/superpowers/specs/2026-09-10-decision-table-design.md` が変更され、計画ファイルが新規である

- [ ] **Step 6: コミット**

```bash
git add docs/superpowers/plans/2026-09-12-decision-table-m2.md docs/superpowers/specs/2026-09-10-decision-table-design.md
git commit -m "$(cat <<'EOF'
docs(decision-table): m2 の実装計画を置き、絞り込みを spec に反映する

まとめて入力の対象指定を絞り込みと統合する。対象を指す操作が1つになり、
対象外の行は隠れるので、適用対象を示す面の段を増やさずに済む。

畳みは m5 へ回す。絞り込みが「32行を現実的に埋める」を担い、畳みは
「効いていない条件を機械で挙げる」を担う別の仕事である。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KS3r1L3bC9bcVSTRj8dUk
EOF
)"
```

---

## Task 2: 行の鍵を足す

**Files:**
- Modify: `src/modules/decision-table/rows.ts`
- Test: `src/modules/decision-table/rows.test.ts`

**Interfaces:**
- Consumes: `Row`（`@/types/decision-table`）
- Produces: `rowKeyOf(row: Row): string`

- [ ] **Step 1: 落ちるテストを書く**

`src/modules/decision-table/rows.test.ts` の末尾に足す。冒頭の import に `rowKeyOf` を加える。

```ts
describe('rowKeyOf', () => {
  it('値の組み合わせが同じ行だけが同じ鍵になる', () => {
    const a: Row = { values: ['はい', 'いいえ'], impossible: false, results: ['X'] }
    const b: Row = { values: ['はい', 'いいえ'], impossible: true, results: [] }
    const c: Row = { values: ['いいえ', 'はい'], impossible: false, results: ['X'] }
    expect(rowKeyOf(a)).toBe(rowKeyOf(b))
    expect(rowKeyOf(a)).not.toBe(rowKeyOf(c))
  })

  it('区切りに使う NUL を鍵の中に出さない', () => {
    // useVisibleIdsReport は鍵を NUL 文字で連結する。生の NUL を含む鍵を返すと、
    // 1つの鍵が2つに割れて別の行を指す
    const NUL = String.fromCharCode(0)
    const row: Row = { values: [`あ${NUL}い`], impossible: false, results: [] }
    expect(rowKeyOf(row)).not.toContain(NUL)
  })

  it('ラベルの連結では区別できない組み合わせを分ける', () => {
    // 素朴な join では ['あ', 'いう'] と ['あい', 'う'] が同じ文字列になる
    const a: Row = { values: ['あ', 'いう'], impossible: false, results: [] }
    const b: Row = { values: ['あい', 'う'], impossible: false, results: [] }
    expect(rowKeyOf(a)).not.toBe(rowKeyOf(b))
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/modules/decision-table/rows.test.ts`
Expected: FAIL（`rowKeyOf` が `rows.ts` から export されていない）

- [ ] **Step 3: 実装する**

`src/modules/decision-table/rows.ts` の `productSize` の直前に足す。

```ts
/**
 * 行の鍵。**値の組み合わせから作り、添字を使わない**——絞り込みの報告は
 * `useEffect` を通るので1フレーム古くなりうる。条件の値を1つ消すと直積が縮み、
 * 同じ添字が別の組み合わせを指す。組み合わせを鍵にすれば、消えた組み合わせの
 * 鍵はどの行にも一致せず落ちるだけで済む。
 *
 * **`JSON.stringify` を使うのは区切りと衝突しないため。** 額縁への報告
 * （`useVisibleIdsReport`）は鍵を NUL 文字で連結するので、鍵そのものに
 * 生の制御文字が現れてはならない。素朴な連結では
 * `['あ', 'いう']` と `['あい', 'う']` も区別できない。
 *
 * **同じ値ラベルが2件ある表と、行が直積からずれている表では鍵が重複する。**
 * どちらも `duplicate-value` / `row-set` が赤で出している状態である
 */
export function rowKeyOf(row: Row): string {
  return JSON.stringify(row.values)
}
```

- [ ] **Step 4: 緑になることを確かめる**

Run: `npx vitest run src/modules/decision-table/rows.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/modules/decision-table/rows.ts src/modules/decision-table/rows.test.ts
git commit -m "$(cat <<'EOF'
feat(decision-table): 行の鍵を値の組み合わせから作る

行は ID を持たないので、絞り込みを額縁へ知らせる鍵をここで作る。
添字を鍵にすると、条件の値を消して直積が縮んだとき、同じ添字が別の
組み合わせを指す。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KS3r1L3bC9bcVSTRj8dUk
EOF
)"
```

---

## Task 3: 絞り込みの純関数

**Files:**
- Create: `src/modules/decision-table/filter.ts`
- Create: `src/modules/decision-table/filter.test.ts`
- Modify: `src/modules/decision-table/labels.ts`

**Interfaces:**
- Consumes: `Condition` / `Outcome` / `Row`（`@/types/decision-table`）
- Produces:
  - `UNFILLED_LABEL: string`（`labels.ts`）
  - `GridFilter`（`{ values: Readonly<Record<string, readonly string[]>>; showImpossible: boolean }`）
  - `EMPTY_FILTER: GridFilter`
  - `isFiltered(filter: GridFilter): boolean`
  - `filterRowIndices(conditions, outcomes, rows, filter): number[]`
  - `toggleFilterValue(filter: GridFilter, id: string, label: string, all: readonly string[]): GridFilter`
  - `clearFilterValue(filter: GridFilter, id: string): GridFilter`
  - `outcomeFilterLabels(outcome: Outcome): string[]`

- [ ] **Step 1: 語の定数を足す**

`src/modules/decision-table/labels.ts` の末尾に足す。

```ts
/**
 * 絞り込みの一覧で空文字を指す語。**結果列は空文字も絞り込みの対象に並べる**
 *——空欄は欠落であり、一覧から外すと抜けだけを取り出せなくなる
 */
export const UNFILLED_LABEL = '未記入'
```

- [ ] **Step 2: 落ちるテストを書く**

Create `src/modules/decision-table/filter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Condition, Outcome, Row } from '@/types/decision-table'
import {
  EMPTY_FILTER,
  clearFilterValue,
  filterRowIndices,
  isFiltered,
  outcomeFilterLabels,
  toggleFilterValue,
} from './filter'

const conditions: Condition[] = [
  { id: 'cond_a', name: '会員か', values: ['はい', 'いいえ'] },
  { id: 'cond_b', name: '5000円以上か', values: ['はい', 'いいえ'] },
]
const outcomes: Outcome[] = [{ id: 'out_a', name: '送料', choices: ['無料', '500円'] }]
const rows: Row[] = [
  { values: ['はい', 'はい'], impossible: false, results: ['無料'] },
  { values: ['はい', 'いいえ'], impossible: false, results: [''] },
  { values: ['いいえ', 'はい'], impossible: true, results: ['無料'] },
  { values: ['いいえ', 'いいえ'], impossible: false, results: ['500円'] },
]

describe('isFiltered', () => {
  it('触っていない絞り込みは掛かっていない', () => {
    expect(isFiltered(EMPTY_FILTER)).toBe(false)
  })

  it('起こりえないを隠すだけでも掛かっている', () => {
    expect(isFiltered({ ...EMPTY_FILTER, showImpossible: false })).toBe(true)
  })
})

describe('filterRowIndices', () => {
  it('絞り込みが無ければ全行を配列順で返す', () => {
    expect(filterRowIndices(conditions, outcomes, rows, EMPTY_FILTER)).toEqual([0, 1, 2, 3])
  })

  it('1つの列の中は OR で効く', () => {
    const filter = { values: { cond_a: ['はい'] }, showImpossible: true }
    expect(filterRowIndices(conditions, outcomes, rows, filter)).toEqual([0, 1])
  })

  it('列どうしは AND で効く', () => {
    const filter = { values: { cond_a: ['はい'], cond_b: ['いいえ'] }, showImpossible: true }
    expect(filterRowIndices(conditions, outcomes, rows, filter)).toEqual([1])
  })

  it('結果列は空文字を未記入として絞り込める', () => {
    const filter = { values: { out_a: [''] }, showImpossible: true }
    expect(filterRowIndices(conditions, outcomes, rows, filter)).toEqual([1])
  })

  it('起こりえないを隠すと、その行だけが落ちる', () => {
    const filter = { values: {}, showImpossible: false }
    expect(filterRowIndices(conditions, outcomes, rows, filter)).toEqual([0, 1, 3])
  })

  it('消えた列の絞り込みは残っていても効かない', () => {
    // 条件を消しても絞り込みの鍵は残る。残った鍵が行を隠すと、
    // 画面から消えた列のせいで行が出ない状態になり、原因を追えない
    const filter = { values: { cond_gone: ['はい'] }, showImpossible: true }
    expect(filterRowIndices(conditions, outcomes, rows, filter)).toEqual([0, 1, 2, 3])
  })
})

describe('toggleFilterValue', () => {
  it('触っていない列で1つ外すと、残りを選んだ形になる', () => {
    const next = toggleFilterValue(EMPTY_FILTER, 'cond_a', 'はい', ['はい', 'いいえ'])
    expect(next.values.cond_a).toEqual(['いいえ'])
  })

  it('全部選び直すと絞り込みが外れる', () => {
    const one = toggleFilterValue(EMPTY_FILTER, 'cond_a', 'はい', ['はい', 'いいえ'])
    const back = toggleFilterValue(one, 'cond_a', 'はい', ['はい', 'いいえ'])
    expect(back.values.cond_a).toBeUndefined()
    expect(isFiltered(back)).toBe(false)
  })

  it('最後の1つを外すと空集合になり、行が1本も出ない', () => {
    const one = toggleFilterValue(EMPTY_FILTER, 'cond_a', 'はい', ['はい', 'いいえ'])
    const none = toggleFilterValue(one, 'cond_a', 'いいえ', ['はい', 'いいえ'])
    expect(none.values.cond_a).toEqual([])
    expect(filterRowIndices(conditions, outcomes, rows, none)).toEqual([])
  })

  it('並びは渡した一覧の順に保つ', () => {
    // 一覧の順が入れ替わると、メニューのチェックの並びが押すたびに変わる
    const one = toggleFilterValue(EMPTY_FILTER, 'cond_a', 'はい', ['はい', 'いいえ'])
    const two = toggleFilterValue(one, 'cond_a', 'はい', ['はい', 'いいえ'])
    expect(two.values.cond_a).toBeUndefined()
    const three = toggleFilterValue(EMPTY_FILTER, 'cond_a', 'いいえ', ['はい', 'いいえ'])
    expect(three.values.cond_a).toEqual(['はい'])
  })
})

describe('clearFilterValue', () => {
  it('1つの列の絞り込みだけを外す', () => {
    const filter = { values: { cond_a: ['はい'], cond_b: ['はい'] }, showImpossible: true }
    const next = clearFilterValue(filter, 'cond_a')
    expect(next.values.cond_a).toBeUndefined()
    expect(next.values.cond_b).toEqual(['はい'])
  })
})

describe('outcomeFilterLabels', () => {
  it('未記入を先頭に置き、選択肢を配列順で続ける', () => {
    expect(outcomeFilterLabels(outcomes[0])).toEqual(['', '無料', '500円'])
  })
})
```

- [ ] **Step 3: 落ちることを確かめる**

Run: `npx vitest run src/modules/decision-table/filter.test.ts`
Expected: FAIL（`./filter` を解決できない）

- [ ] **Step 4: 実装する**

Create `src/modules/decision-table/filter.ts`:

```ts
import type { Condition, Outcome, Row } from '@/types/decision-table'

/**
 * 表本体の絞り込み。**列ごとに「出すラベルの集合」を持つ。**
 *
 * **鍵に入っていない列は絞り込まない。** 全ラベルを選んだ状態と
 * 「まだ触っていない」状態を同じ形にすると、あとで値を1つ足したときに
 * 新しい値だけが隠れる。
 *
 * **鍵は条件・結果の `id` である。** 位置で持つと、並び替えたときに
 * 別の列の絞り込みを引き継ぐ。ID が重複しているファイルでは2列が同じ
 * 絞り込みを共有するが、その状態は `duplicate-id` が赤で出している
 */
export interface GridFilter {
  /** ID → 出すラベル。空の配列は「1つも出さない」であり、鍵が無いのとは違う */
  values: Readonly<Record<string, readonly string[]>>
  /** 起こりえない行を出すか */
  showImpossible: boolean
}

/** 触っていない絞り込み。**起こりえないは出す**——隠すのは人が選んだときだけ */
export const EMPTY_FILTER: GridFilter = { values: {}, showImpossible: true }

/**
 * 絞り込みが掛かっているか。額縁への報告と「N / M 行」の表示に使う。
 *
 * **起こりえないを隠すだけでも掛かっている。** 行が減る以上、額縁から見れば
 * 絞り込みである
 */
export function isFiltered(filter: GridFilter): boolean {
  return !filter.showImpossible || Object.keys(filter.values).length > 0
}

/** 結果列の絞り込みに並べるラベル。**先頭は空文字で、画面では未記入と書く** */
export function outcomeFilterLabels(outcome: Outcome): string[] {
  return ['', ...outcome.choices]
}

/**
 * 表示する行の「元配列での index」を配列順のまま返す。
 *
 * **列の中は OR、列どうしは AND。** 1つの列で複数のラベルを選ぶのは
 * 「どれかに当たる行」を見る操作で、列をまたぐ選択は絞り込みを重ねる操作である。
 *
 * **知らない鍵は読み飛ばす。** 条件を消しても絞り込みの鍵は残るので、
 * 読み飛ばさないと、画面から消えた列のせいで行が出ない状態になる
 */
export function filterRowIndices(
  conditions: readonly Condition[],
  outcomes: readonly Outcome[],
  rows: readonly Row[],
  filter: GridFilter,
): number[] {
  const columns: { at: number; from: 'values' | 'results'; picked: ReadonlySet<string> }[] = []
  conditions.forEach((c, i) => {
    const picked = filter.values[c.id]
    if (picked !== undefined) columns.push({ at: i, from: 'values', picked: new Set(picked) })
  })
  outcomes.forEach((o, j) => {
    const picked = filter.values[o.id]
    if (picked !== undefined) columns.push({ at: j, from: 'results', picked: new Set(picked) })
  })
  const out: number[] = []
  rows.forEach((row, index) => {
    if (row.impossible && !filter.showImpossible) return
    for (const column of columns) {
      const label = (column.from === 'values' ? row.values : row.results)[column.at] ?? ''
      if (!column.picked.has(label)) return
    }
    out.push(index)
  })
  return out
}

/**
 * 1つのラベルの入り切り。**`all` を渡すのは、触っていない列が「全部出す」だから**
 *——そこから1つ外すには、残りを選んだ形へ展開する必要がある。
 *
 * **選び直して全部揃ったら鍵ごと消す。** 残すと `isFiltered` が真のままになり、
 * 絞り込んでいないのに額縁へ絞り込みを報告する
 */
export function toggleFilterValue(
  filter: GridFilter,
  id: string,
  label: string,
  all: readonly string[],
): GridFilter {
  const current = filter.values[id] ?? all
  const has = current.includes(label)
  // 並びは `all` の順に保つ。押すたびに一覧の順が変わると、メニューのチェックが動いて見える
  const next = all.filter((v) => (v === label ? !has : current.includes(v)))
  const values = { ...filter.values }
  if (next.length === all.length) delete values[id]
  else values[id] = next
  return { ...filter, values }
}

/** 1つの列の絞り込みを外す。他の列は触らない */
export function clearFilterValue(filter: GridFilter, id: string): GridFilter {
  const values = { ...filter.values }
  delete values[id]
  return { ...filter, values }
}
```

- [ ] **Step 5: 緑になることを確かめる**

Run: `npx vitest run src/modules/decision-table/filter.test.ts`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add src/modules/decision-table/filter.ts src/modules/decision-table/filter.test.ts src/modules/decision-table/labels.ts
git commit -m "$(cat <<'EOF'
feat(decision-table): 表本体の絞り込みの純関数を足す

列ごとに出すラベルの集合を持ち、列の中は OR、列どうしは AND で効く。
鍵は条件・結果の id で、位置では持たない——並び替えで別の列の
絞り込みを引き継がないため。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KS3r1L3bC9bcVSTRj8dUk
EOF
)"
```

---

## Task 4: まとめて入力の純関数

**Files:**
- Create: `src/modules/decision-table/bulk.ts`
- Create: `src/modules/decision-table/bulk.test.ts`

**Interfaces:**
- Consumes: `DecisionTableSchemaVersion1`（`@/types/decision-table`）
- Produces:
  - `BulkTarget`（`{ kind: 'result'; outcomeIndex: number; value: string } | { kind: 'impossible'; on: boolean }`）
  - `applyBulk(data, targets: readonly number[], target: BulkTarget): { data: DecisionTableSchemaVersion1; changed: number }`

- [ ] **Step 1: 落ちるテストを書く**

Create `src/modules/decision-table/bulk.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { applyBulk } from './bulk'

const base: DecisionTableSchemaVersion1 = {
  schemaVersion: 1,
  type: 'decisionTable',
  title: '送料',
  conditions: [{ id: 'cond_a', name: '会員か', values: ['はい', 'いいえ'] }],
  outcomes: [
    { id: 'out_a', name: '送料', choices: ['無料', '500円'] },
    { id: 'out_b', name: '通知', choices: ['出す'] },
  ],
  rows: [
    { values: ['はい'], impossible: false, results: ['無料', ''] },
    { values: ['いいえ'], impossible: false, results: ['', ''] },
  ],
}

describe('applyBulk', () => {
  it('選んだ結果列だけを書き換える', () => {
    const out = applyBulk(base, [0, 1], { kind: 'result', outcomeIndex: 0, value: '500円' })
    expect(out.data.rows.map((r) => r.results)).toEqual([
      ['500円', ''],
      ['500円', ''],
    ])
  })

  it('対象に入っていない行は触らない', () => {
    const out = applyBulk(base, [1], { kind: 'result', outcomeIndex: 0, value: '500円' })
    expect(out.data.rows[0].results[0]).toBe('無料')
  })

  it('空文字を書き込むと結果が空に戻る', () => {
    const out = applyBulk(base, [0], { kind: 'result', outcomeIndex: 0, value: '' })
    expect(out.data.rows[0].results[0]).toBe('')
  })

  it('変更した行だけを数える', () => {
    // ボタンに出す対象行数とは分母が違う。対象2行のうち、値が変わるのは1行だけ
    const out = applyBulk(base, [0, 1], { kind: 'result', outcomeIndex: 0, value: '無料' })
    expect(out.changed).toBe(1)
  })

  it('起こりえないを入れても結果の値を消さない', () => {
    // 戻せば元の値が見える（シーケンスの考慮不要と同じ扱い）
    const out = applyBulk(base, [0], { kind: 'impossible', on: true })
    expect(out.data.rows[0].impossible).toBe(true)
    expect(out.data.rows[0].results[0]).toBe('無料')
  })

  it('すでにその状態の行は変更に数えない', () => {
    const out = applyBulk(base, [0, 1], { kind: 'impossible', on: false })
    expect(out.changed).toBe(0)
  })

  it('1行も変わらないときは元のデータをそのまま返す', () => {
    // 参照が変わると Undo 履歴に空の1手が積まれる
    const out = applyBulk(base, [], { kind: 'result', outcomeIndex: 0, value: '無料' })
    expect(out.data).toBe(base)
  })

  it('結果の本数より大きい添字を渡しても行を壊さない', () => {
    // 結果を消した直後の描画が古い添字で押されうる
    const out = applyBulk(base, [0], { kind: 'result', outcomeIndex: 9, value: '無料' })
    expect(out.data).toBe(base)
    expect(out.changed).toBe(0)
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/modules/decision-table/bulk.test.ts`
Expected: FAIL（`./bulk` を解決できない）

- [ ] **Step 3: 実装する**

Create `src/modules/decision-table/bulk.ts`:

```ts
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'

/**
 * まとめて入力の適用先。**1回に1つ。** 結果と起こりえないを同時に書くと、
 * 1手の Undo で何が戻るのかを人が予測できない
 */
export type BulkTarget =
  | { kind: 'result'; outcomeIndex: number; value: string }
  | { kind: 'impossible'; on: boolean }

export interface BulkResult {
  data: DecisionTableSchemaVersion1
  /**
   * 実際に値が変わった行の数。**ボタンに出す対象行数とは分母が違う**
   *——対象は絞り込みが出している行、これはそのうち値が動いた行である
   */
  changed: number
}

/**
 * 絞り込んだ行へまとめて書き込む。**上書きは常に行い、確認を挟まない**
 *——Undo で1手として戻せるので、確認は打鍵を増やすだけになる。
 *
 * **起こりえない行にも結果を書く。** 起こりえないは結果の値を消さない状態なので、
 * 書いた値は解除したときに見える。
 *
 * **1行も変わらないときは元のデータをそのまま返す。** 新しい参照を返すと、
 * 何も起きていない1手が Undo 履歴に積まれる
 */
export function applyBulk(
  data: DecisionTableSchemaVersion1,
  targets: readonly number[],
  target: BulkTarget,
): BulkResult {
  // 結果を消した直後の描画は古い添字を持ちうる。行の配列の形を壊さないよう先に止める
  if (target.kind === 'result' && data.outcomes[target.outcomeIndex] === undefined) {
    return { data, changed: 0 }
  }
  const picked = new Set(targets)
  let changed = 0
  const rows = data.rows.map((row, index) => {
    if (!picked.has(index)) return row
    if (target.kind === 'impossible') {
      if (row.impossible === target.on) return row
      changed += 1
      return { ...row, impossible: target.on }
    }
    if ((row.results[target.outcomeIndex] ?? '') === target.value) return row
    changed += 1
    return {
      ...row,
      results: row.results.map((v, j) => (j === target.outcomeIndex ? target.value : v)),
    }
  })
  return changed === 0 ? { data, changed: 0 } : { data: { ...data, rows }, changed }
}
```

- [ ] **Step 4: 緑になることを確かめる**

Run: `npx vitest run src/modules/decision-table/bulk.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/modules/decision-table/bulk.ts src/modules/decision-table/bulk.test.ts
git commit -m "$(cat <<'EOF'
feat(decision-table): まとめて入力の適用を足す

絞り込んだ行へ1つの適用先だけを書き込む。戻り値の changed は実際に値が
変わった行の数で、ボタンに出す対象行数とは分母が違う。

1行も変わらないときは元のデータをそのまま返す——新しい参照を返すと、
何も起きていない1手が Undo 履歴に積まれる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KS3r1L3bC9bcVSTRj8dUk
EOF
)"
```

---

## Task 5: 額縁からエディタへトーストの口を通す

**Files:**
- Modify: `src/core/registry.ts`（`EditorProps`）
- Modify: `src/App.tsx`
- Test: `src/App.dom.test.tsx`

**Interfaces:**
- Consumes: `showToast`（`App.tsx` の既存の `useCallback`）、`pushToast`（`@/core/toasts`）
- Produces: `EditorProps.onToast?: (message: string) => void`

- [ ] **Step 1: `EditorProps` に任意スロットを足す**

`src/core/registry.ts` の `EditorProps` の `onVisibleIds` の**直後**に足す。

```ts
  /**
   * 起きた出来事を人に知らせる（トースト）。**持たないエディタは呼ばなくてよい**
   *（`onVisibleIds` と同じ層の任意スロットで、モジュール規約の点数は増えない）。
   *
   * **いま続いている状態はここへ流さない。** バナーが状態を出す場所で、
   * トーストは出来事を流す場所である（`src/core/toasts.ts`）。
   *
   * **鍵は額縁が付ける。** トーストは時間では消えないので、鍵が無いと
   * 同じ操作をくり返した分だけ積み上がる
   */
  onToast?: (message: string) => void
```

**このタスクはテストを足さない。** `onToast` を押す動線（まとめて入力のボタン）は Task 8 で出来るので、ここでテストを足すと3コミットのあいだ赤が残る。額縁の配線を縛るテストは Task 8 で足す。

- [ ] **Step 2: `App.tsx` を配線する**

`src/App.tsx` の `onVisibleIds` の `useCallback` の直後に足す。

```ts
  /**
   * エディタからの通知。**鍵を額縁が付ける**——トーストは時間で消えないので、
   * 鍵が無いと同じ操作をくり返した分だけ積み上がる。エディタの通知は
   * 「直前の1件」だけ残れば足りる
   */
  const onEditorToast = useCallback(
    (message: string) => showToast({ message, key: 'editor' }),
    [showToast],
  )
```

`<selectedModule.Editor` の `onVisibleIds={onVisibleIds}` の次の行に足す。

```tsx
                  onToast={onEditorToast}
```

- [ ] **Step 3: 配線が1箇所であることを確かめる**

Run: `grep -rn "onToast" src/ --include=*.tsx --include=*.ts`
Expected: `src/core/registry.ts` の宣言と `src/App.tsx` の配線だけが出る

Run: `npx tsc -b && npm run lint`
Expected: どちらも終了コード0

Run: `npm test`
Expected: 着手時と同じ（新しいテストを足していないので件数は変わらない）

- [ ] **Step 4: コミット**

git add src/core/registry.ts src/App.tsx
git add src/core/registry.ts src/App.tsx src/App.dom.test.tsx
git commit -m "$(cat <<'EOF'
feat(core): エディタから通知を流す任意スロットを足す

onVisibleIds と同じ層の任意拡張で、持たないモジュールは1文字も変わらない。
鍵は額縁が付ける——トーストは時間で消えないので、鍵が無いと同じ操作を
くり返した分だけ積み上がる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KS3r1L3bC9bcVSTRj8dUk
EOF
)"
```
---

## Task 6: 列見出しの絞り込みメニュー

**Files:**
- Create: `src/modules/decision-table/FilterMenu.tsx`
- Test: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`（Task 7 で足す）

**Interfaces:**
- Consumes: `UNFILLED_LABEL`（`./labels`）、`DropdownMenu` 一式（`@/components/ui/dropdown-menu`）、`buttonBase`（`@/components/button-styles`）
- Produces: `FilterMenu(props: FilterMenuProps)`、`FilterMenuProps`

- [ ] **Step 1: 実装する**

Create `src/modules/decision-table/FilterMenu.tsx`:

```tsx
import { Funnel, FunnelX } from 'lucide-react'
import { buttonBase } from '@/components/button-styles'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UNFILLED_LABEL } from './labels'

export interface FilterMenuProps {
  /** 列の名前。ボタンのアクセシブル名に使う */
  name: string
  /** 出しうるラベルの全体。結果列は先頭に空文字を入れて渡す */
  all: readonly string[]
  /** いま出しているラベル。**undefined は絞り込みなし**（＝全部出す） */
  picked: readonly string[] | undefined
  onToggle: (label: string) => void
  onClear: () => void
}

/** 空文字は画面では未記入と書く。データに無い語をセルへ書かないので、ここだけの読み替えである */
const show = (label: string): string => (label === '' ? UNFILLED_LABEL : label)

/**
 * 列見出しの絞り込み。**チェックを押してもメニューを閉じない**——複数の値を
 * 続けて入り切りする操作なので、1つ押すたびに閉じると開き直しが要る。
 *
 * **絞り込み中かどうかをアイコンで出す。** 列が多い表では、どの列で絞ったかを
 * 見出しから読めないと、行が出ない理由を追えない
 */
export function FilterMenu({ name, all, picked, onToggle, onClear }: FilterMenuProps) {
  const filtered = picked !== undefined
  const Icon = filtered ? FunnelX : Funnel
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${name} の絞り込み`}
          className={`${buttonBase} size-5 ${filtered ? 'text-ink' : 'text-ink-faint hover:text-ink'}`}
        >
          <Icon aria-hidden className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {all.map((label, at) => (
          // key に生のラベルを使わない。同じラベルが2件あるファイルは
          // duplicate-value / duplicate-choice が赤で出す正規の状態で、key が衝突する
          <DropdownMenuCheckboxItem
            key={`${at}`}
            checked={picked === undefined || picked.includes(label)}
            // 押しても閉じない。Radix の既定は選ぶと閉じる
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(label)}
          >
            {show(label)}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!filtered} onSelect={() => onClear()}>
          この列の絞り込みを外す
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: 型と lint が通ることを確かめる**

Run: `npx tsc -b && npm run lint`
Expected: どちらも終了コード0

なお `DropdownMenuSeparator` は `src/components/ui/dropdown-menu.tsx` が export している。

- [ ] **Step 3: コミット**

```bash
git add src/modules/decision-table/FilterMenu.tsx
git commit -m "$(cat <<'EOF'
feat(decision-table): 列見出しの絞り込みメニューを足す

チェックを押してもメニューを閉じない——複数の値を続けて入り切りする
操作なので、1つ押すたびに閉じると開き直しが要る。

絞り込み中かどうかをアイコンで出す。列が多い表では、どの列で絞ったかを
見出しから読めないと行が出ない理由を追えない。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KS3r1L3bC9bcVSTRj8dUk
EOF
)"
```

---

## Task 7: 表本体を表示中の行だけ描く

**Files:**
- Modify: `src/modules/decision-table/GridBody.tsx`
- Modify: `src/modules/decision-table/DecisionTableEditor.tsx`
- Test: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `GridFilter` / `EMPTY_FILTER` / `filterRowIndices` / `toggleFilterValue` / `clearFilterValue` / `outcomeFilterLabels`（`./filter`）、`FilterMenu`（`./FilterMenu`）
- Produces: `GridBodyProps` に `visible` / `filter` / `onFilterChange` が加わり、`onCellKeyDown` の位置引数が `{ index; visiblePos; field }` になる

- [ ] **Step 1: 落ちるテストを書く**

`src/modules/decision-table/DecisionTableEditor.dom.test.tsx` に足す。**ファイル末尾の `describe` の後ろに新しい `describe` を置く。**

```tsx
/** 条件2本・結果1本。絞り込みの組み合わせを見るための土台 */
const filterable = table({
  conditions: [
    condition({ id: 'cond_a', name: '会員か' }),
    condition({ id: 'cond_b', name: '5000円以上か' }),
  ],
  outcomes: [outcome({ id: 'out_a', name: '送料', choices: ['無料', '500円'] })],
  rows: [
    { values: ['はい', 'はい'], impossible: false, results: ['無料'] },
    { values: ['はい', 'いいえ'], impossible: false, results: [''] },
    { values: ['いいえ', 'はい'], impossible: true, results: ['無料'] },
    { values: ['いいえ', 'いいえ'], impossible: false, results: ['500円'] },
  ],
})

/** 表本体の行（見出しを除く）の No セルの文字を並べる */
function gridRowNumbers(): string[] {
  const body = screen.getByRole('table').querySelectorAll('tbody tr')
  return [...body].map((tr) => tr.querySelector('td')?.textContent ?? '')
}

describe('絞り込み', () => {
  it('列の値を外すと、その値の行が表から消える', () => {
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    expect(gridRowNumbers()).toEqual(['1', '2'])
  })

  it('列をまたいだ絞り込みは重なって効く', () => {
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.keyDown(screen.getByLabelText('5000円以上か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    expect(gridRowNumbers()).toEqual(['1'])
  })

  it('絞り込んでも No は振り直さない', () => {
    // No は行の呼び名（#N）であり、絞り込みで変わると会話の中で行を指せない
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'はい' }))
    expect(gridRowNumbers()).toEqual(['3', '4'])
  })

  it('起こりえない行の表示を切ると、その行だけが消える', () => {
    renderEditor(filterable)
    fireEvent.click(screen.getByLabelText('起こりえない行を表示'))
    expect(gridRowNumbers()).toEqual(['1', '2', '4'])
  })

  it('隠れている行を飛ばして上下に移る', () => {
    // 添字で隣を引くと、隠れた行の data-cell が見つからず移動が止まる
    renderEditor(filterable)
    fireEvent.click(screen.getByLabelText('起こりえない行を表示'))
    const cell = screen.getByLabelText('送料（2行目）')
    cell.focus()
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByLabelText('送料（4行目）'))
  })

  it('表示中と全体の行数を出す', () => {
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    expect(screen.getByText('2 / 4 行')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/modules/decision-table/DecisionTableEditor.dom.test.tsx`
Expected: FAIL（`会員か の絞り込み` という名前の要素が無い）

- [ ] **Step 3: `GridBody` の props に表示中の行と絞り込みを足す**

`src/modules/decision-table/GridBody.tsx` の `GridBodyProps` を次のように変える。`rows` は**全体のまま残す**——`marks` と `rowRef` が元配列の位置で引くためである。

```ts
export interface GridBodyProps {
  conditions: readonly Condition[]
  outcomes: readonly Outcome[]
  /** 行の全体。**絞り込んだ配列を渡さない**——marks と No が元配列の位置で引く */
  rows: readonly Row[]
  /** 描く行の「元配列での index」を配列順のまま並べたもの */
  visible: readonly number[]
  filter: GridFilter
  onFilterChange: (next: GridFilter) => void
  marks: ErrorMarks
  /** 行の鍵。行は ID を持たないので、呼び出し側が位置から作る */
  gridRowKey: (index: number) => string
  /** 表本体でいまフォーカスのある行。無ければ null */
  focusedRow: number | null
  /** 行のフォーカスが変わったときに呼ぶ。表の外へ出たときは null を渡す */
  onFocusRow: (index: number | null) => void
  onPickResult: (rowIndex: number, outIndex: number, value: string) => void
  onToggleImpossible: (rowIndex: number) => void
  /**
   * セルのキー入力。**`index`（元配列の位置）と `visiblePos`（表の中の位置）の
   * 両方を渡す**——書き込みは `index` で、上下の移動は `visiblePos` で引く
   */
  onCellKeyDown: (
    e: React.KeyboardEvent,
    at: { index: number; visiblePos: number; field: string },
  ) => void
}
```

import に足す。

```ts
import {
  clearFilterValue,
  outcomeFilterLabels,
  toggleFilterValue,
  type GridFilter,
} from './filter'
import { FilterMenu } from './FilterMenu'
```

- [ ] **Step 4: 見出しに絞り込みを置く**

`<thead>` の中の条件列・結果列の `<th>` を次に置き換える。No 列と右端のボタン列の `<th>` は変えない。

```tsx
            {conditions.map((c, i) => (
              <th key={`cond-${i}`} className={`${headCell} ${condColBorder}`}>
                <span className="flex items-center justify-between gap-1">
                  {c.name}
                  <FilterMenu
                    name={c.name}
                    all={c.values}
                    picked={filter.values[c.id]}
                    onToggle={(label) =>
                      onFilterChange(toggleFilterValue(filter, c.id, label, c.values))
                    }
                    onClear={() => onFilterChange(clearFilterValue(filter, c.id))}
                  />
                </span>
              </th>
            ))}
            {outcomes.map((o, j) => (
              <th key={`out-${j}`} className={`${headCell} ${headColBorder}`}>
                <span className="flex items-center justify-between gap-1">
                  {o.name}
                  <FilterMenu
                    name={o.name}
                    all={outcomeFilterLabels(o)}
                    picked={filter.values[o.id]}
                    onToggle={(label) =>
                      onFilterChange(
                        toggleFilterValue(filter, o.id, label, outcomeFilterLabels(o)),
                      )
                    }
                    onClear={() => onFilterChange(clearFilterValue(filter, o.id))}
                  />
                </span>
              </th>
            ))}
```

- [ ] **Step 5: 本体を表示中の行だけ回す**

`<tbody>` の `{rows.map((row, index) => {` を次に変える。

```tsx
          {visible.map((index, visiblePos) => {
            const row = rows[index]
```

そのうえで、行の中の2箇所を直す。

1. `focusFirstResultCell(index, rowKey)` の呼び出しを `focusFirstResultCell(visiblePos, rowKey)` に変える（2箇所。No セルと条件セルの `onClick`）
2. 結果セルの `onKeyDown={(e) => onCellKeyDown(e, { index, field })}` を
   `onKeyDown={(e) => onCellKeyDown(e, { index, visiblePos, field })}` に変える

`focusFirstResultCell` の引数の意味が変わるので、関数と JSDoc を次に置き換える。

```tsx
  /**
   * No・条件セルをクリックしたときの移動先。**結果が0本の表では、起こりえないの
   * トグルボタンへ移す**——結果セルが無い表では、このボタンだけがフォーカスできる
   * セルとして残る。トグルボタンは `data-cell` を持たないので、行の `<tr>` を
   * 位置で数えて中の `aria-pressed` 属性で引く。
   *
   * **数えるのは表の中の位置（`visiblePos`）である。** 絞り込みで行が隠れると、
   * 元配列の位置は `<tr>` の並びと一致しない
   */
  const focusFirstResultCell = (visiblePos: number, rowKey: string): void => {
    if (outcomes.length === 0) {
      containerRef.current
        ?.querySelectorAll<HTMLElement>('tbody tr')[visiblePos]
        ?.querySelector<HTMLElement>('button[aria-pressed]')
        ?.focus()
      return
    }
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-cell="${cellId(rowKey, 'result:0')}"]`)
      ?.focus()
  }
```

- [ ] **Step 6: エディタに絞り込みの状態を持たせる**

`src/modules/decision-table/DecisionTableEditor.tsx` の import に足す。

```ts
import { EMPTY_FILTER, filterRowIndices, type GridFilter } from './filter'
```

`const [focusedRow, setFocusedRow] = useState<number | null>(null)` の直後に足す。

```tsx
  /**
   * 表本体の絞り込み。**データには持たない**——見ている範囲は人ごと・その場ごとに
   * 変わるもので、ファイルに残すと他の人の表示まで動かす
   */
  const [filter, setFilter] = useState<GridFilter>(EMPTY_FILTER)

  /** 表に出す行の「元配列での index」 */
  const visible = filterRowIndices(data.conditions, data.outcomes, data.rows, filter)
```

- [ ] **Step 7: 上下の移動を表示中の行で引く**

`focusGridCell` の直後に足す。

```tsx
  /**
   * 表の中の位置で数えたセルへ移る。**上下の移動はこちらを使う**——
   * 元配列の添字で隣を引くと、絞り込みで隠れた行の `data-cell` が見つからず
   * 移動がそこで止まる
   */
  const focusVisible = (visiblePos: number, field: string): boolean => {
    const index = visible[visiblePos]
    return index === undefined ? false : focusGridCell(index, field)
  }
```

`runGridCommand` を次に置き換える。

```tsx
  /** コマンドを表本体の構造へ写像する。戻り値 true＝消費した（既定動作を止める） */
  const runGridCommand = (
    cmd: Command,
    at: { index: number; visiblePos: number; field: string },
  ): boolean => {
    switch (cmd) {
      case 'focus-prev':
        return focusVisible(at.visiblePos - 1, at.field)
      case 'focus-next':
        return focusVisible(at.visiblePos + 1, at.field)
      case 'focus-prev-field': {
        const step = stepField(resultFieldOrder, at.field, -1)
        return focusVisible(at.visiblePos + step.rowDelta, step.field)
      }
      case 'focus-next-field': {
        const step = stepField(resultFieldOrder, at.field, 1)
        return focusVisible(at.visiblePos + step.rowDelta, step.field)
      }
      case 'toggle-item-state':
        onChange(toggleImpossible(data, at.index), null)
        return true
      case 'cancel':
        ;(document.activeElement as HTMLElement | null)?.blur()
        return true
      default:
        // move-item-up/down・insert-item-after・delete-item は表本体に意味を
        // 持たない（行は導出物）。undo/redo は額縁のグローバル層が取る
        return false
    }
  }
```

`onGridCellKeyDown` の引数の型を合わせる。

```tsx
  const onGridCellKeyDown = (
    e: React.KeyboardEvent,
    at: { index: number; visiblePos: number; field: string },
  ): void => {
```

- [ ] **Step 8: 起こりえないの表示切替と件数を置く**

`<KeyHints hints={GRID_HINTS} />` を包んでいる `<div className="mb-2">` を次に置き換える。

```tsx
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <KeyHints hints={GRID_HINTS} />
              <label className="flex items-center gap-2 text-base text-ink">
                <input
                  type="checkbox"
                  aria-label="起こりえない行を表示"
                  checked={filter.showImpossible}
                  onChange={() =>
                    setFilter((f) => ({ ...f, showImpossible: !f.showImpossible }))
                  }
                />
                {`${IMPOSSIBLE_LABEL}行を表示`}
              </label>
              {/* 絞り込んでいない間も出す。数が出たり消えたりすると、
                  絞り込みが効いているかを数の有無で読む癖が付く */}
              <span className="text-base text-ink-muted">
                {`${visible.length} / ${data.rows.length} 行`}
              </span>
            </div>
```

- [ ] **Step 9: `GridBody` へ渡す**

`<GridBody` の `rows={data.rows}` の直後に足す。

```tsx
                visible={visible}
                filter={filter}
                onFilterChange={setFilter}
```

- [ ] **Step 10: 緑になることを確かめる**

Run: `npx vitest run src/modules/decision-table/DecisionTableEditor.dom.test.tsx`
Expected: PASS

Run: `npx tsc -b && npm run lint`
Expected: どちらも終了コード0

- [ ] **Step 11: コミット**

```bash
git add src/modules/decision-table/GridBody.tsx src/modules/decision-table/DecisionTableEditor.tsx src/modules/decision-table/DecisionTableEditor.dom.test.tsx
git commit -m "$(cat <<'EOF'
feat(decision-table): 表本体を絞り込んだ行だけ描く

行の全体は GridBody へ渡したまま、描く行の位置の配列を別に渡す。marks と
No は元配列の位置で引くので、絞り込んでも No を振り直さない。

上下の移動は表の中の位置で引く。元配列の添字で隣を引くと、隠れた行の
data-cell が見つからず移動がそこで止まる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KS3r1L3bC9bcVSTRj8dUk
EOF
)"
```

---

## Task 8: まとめて入力のバー

**Files:**
- Create: `src/modules/decision-table/BulkFillBar.tsx`
- Modify: `src/modules/decision-table/DecisionTableEditor.tsx`
- Test: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`
- Test: `src/App.dom.test.tsx`（Task 5 で通した `onToast` の配線を、ここで初めて押せる）

**Interfaces:**
- Consumes: `BulkTarget` / `applyBulk`（`./bulk`）、`CLEAR_RESULT_LABEL` / `IMPOSSIBLE_LABEL`（`./labels`）、`EditorProps.onToast`（Task 5）
- Produces: `BulkFillBar(props: BulkFillBarProps)`

- [ ] **Step 1: 落ちるテストを書く**

`DecisionTableEditor.dom.test.tsx` の `describe('絞り込み', ...)` の後ろに足す。

```tsx
describe('まとめて入力', () => {
  it('表示中の行だけに書き込む', () => {
    const { latest } = renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    fireEvent.keyDown(screen.getByLabelText('書き込む値'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: '500円' }))
    fireEvent.click(screen.getByRole('button', { name: '表示中の 2 行に適用' }))
    expect(latest()?.rows.map((r) => r.results[0])).toEqual(['500円', '500円', '無料', '500円'])
  })

  it('対象の行数をボタンに出す', () => {
    renderEditor(filterable)
    expect(screen.getByRole('button', { name: '表示中の 4 行に適用' })).toBeTruthy()
  })

  it('1手で戻せるよう、まとめ鍵を渡さない', () => {
    // 構造操作と同じ履歴の粒度にする。まとめ鍵を渡すと直前の打鍵と1手にまとまる
    const { onChange } = renderEditor(filterable)
    fireEvent.click(screen.getByRole('button', { name: '表示中の 4 行に適用' }))
    expect(onChange.mock.calls.at(-1)?.[1]).toBeNull()
  })

  it('変更した行数を通知する', () => {
    // ボタンの対象行数とは分母が違う。4行のうち、送料が既に無料でない行は2行
    // （#2 が空欄、#4 が 500円。#1 と #3 は既に無料なので数えない）
    const onToast = vi.fn()
    render(<Harness initial={filterable} onChange={vi.fn()} onToast={onToast} />)
    fireEvent.click(screen.getByRole('button', { name: '表示中の 4 行に適用' }))
    expect(onToast).toHaveBeenCalledWith('送料を「無料」にしました（2 行）')
  })

  it('起こりえないの入り切りも適用先に並ぶ', () => {
    const { latest } = renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('適用先'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemradio', { name: IMPOSSIBLE_LABEL }))
    fireEvent.click(screen.getByRole('button', { name: '表示中の 4 行に適用' }))
    expect(latest()?.rows.map((r) => r.impossible)).toEqual([true, true, true, true])
  })
})
```

`Harness` に `onToast` を通せるよう、ファイル先頭の `Harness` と `renderEditor` を次に置き換える。

```tsx
/** 額縁の代わり。onChange を受けて data を差し替える最小の親 */
function Harness(props: {
  initial: DecisionTableSchemaVersion1
  onChange: (next: DecisionTableSchemaVersion1, mergeKey?: string | null) => void
  modalOpen?: boolean
  onToast?: (message: string) => void
}) {
  const [data, setData] = useState(props.initial)
  return (
    <DecisionTableEditor
      data={data}
      issues={[]}
      modalOpen={props.modalOpen ?? false}
      onToast={props.onToast}
      onChange={(next, mergeKey) => {
        setData(next)
        props.onChange(next, mergeKey)
      }}
    />
  )
}
```

さらに `src/App.dom.test.tsx` の末尾に新しい `describe` を足す。**これが Task 5 で通した配線を縛る唯一のテストである。** フィクスチャの置き方は同じファイルの `describe('指摘バナーと額縁の配線', ...)` に合わせる——`disk.set(パス, JSON)` でファイルを置き、`フォルダを開く` を押してから一覧のボタンを押す。

```tsx
describe('エディタからの通知', () => {
  const TABLE_PATH = '/proj/送料.json'

  it('まとめて入力の結果がトーストに出る', async () => {
    disk.set(
      TABLE_PATH,
      JSON.stringify({
        schemaVersion: 1,
        type: 'decisionTable',
        title: '送料',
        conditions: [{ id: 'cond_Aaaaaaaaa1', name: '会員か', values: ['はい', 'いいえ'] }],
        outcomes: [{ id: 'out_Aaaaaaaaa1', name: '送料', choices: ['無料', '500円'] }],
        rows: [
          { values: ['はい'], impossible: false, results: [''] },
          { values: ['いいえ'], impossible: false, results: [''] },
        ],
      }),
    )
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    fireEvent.click(await screen.findByRole('button', { name: '送料（送料.json） を開く' }))
    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: '表示中の 2 行に適用' }))
    expect(await screen.findByText('送料を「無料」にしました（2 行）')).toBeTruthy()
  })
})
```

**一覧のボタンの名前（`送料（送料.json） を開く`）を実物で確かめること。** `src/components/FileList.tsx` が組み立てており、`title` とファイル名の並べ方が違えば `findByRole` が引けない。既存の `重複あり（用語集.json） を開く` と同じ形を写している。

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/modules/decision-table/DecisionTableEditor.dom.test.tsx src/App.dom.test.tsx`
Expected: どちらも FAIL（`適用先` と `表示中の 2 行に適用` という名前の要素が無い）

- [ ] **Step 3: バーを実装する**

Create `src/modules/decision-table/BulkFillBar.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Outcome } from '@/types/decision-table'
import type { BulkTarget } from './bulk'
import { CLEAR_RESULT_LABEL, IMPOSSIBLE_LABEL } from './labels'

export interface BulkFillBarProps {
  outcomes: readonly Outcome[]
  /** 表に出ている行数。ボタンの文言に出す */
  targetCount: number
  onApply: (target: BulkTarget) => void
}

/** 適用先の鍵。結果は位置、起こりえないは専用の値で指す */
const IMPOSSIBLE_KEY = 'impossible'

/** 起こりえないを適用先に選んだときの値の選択肢 */
const IMPOSSIBLE_VALUES = ['on', 'off'] as const

/**
 * 適用先を選んだときの値の既定。**結果列は1つ目の選択肢にする**——
 * 空にするを既定にすると、選択肢を選ばずに押した人が値を消すことになる。
 * 選択肢を持たない結果列では空にするしか無いので、そのまま空を返す
 */
function defaultValue(outcome: Outcome | undefined): string {
  if (outcome === undefined) return IMPOSSIBLE_VALUES[0]
  return outcome.choices[0] ?? ''
}

/**
 * まとめて入力。**対象は絞り込みが決める**ので、このバーは適用先と値だけを持つ。
 * 対象を指す操作を2つ持つと、絞り込んだ表を見ながら別の条件へ書き込む事故が起きる。
 *
 * **通常のフォームであり、表の操作言語（`family: 'grid'`）を掛けない。**
 * 掛けると、値を選ぶだけの `↑↓` が表の行移動として消費される
 */
export function BulkFillBar({ outcomes, targetCount, onApply }: BulkFillBarProps) {
  const [where, setWhere] = useState<string>(() =>
    outcomes.length > 0 ? '0' : IMPOSSIBLE_KEY,
  )
  const outcomeIndex = where === IMPOSSIBLE_KEY ? null : Number(where)
  const outcome = outcomeIndex === null ? undefined : outcomes[outcomeIndex]
  /** 値の選択肢。結果列は空にするを先頭に置く */
  const options = outcome === undefined ? [...IMPOSSIBLE_VALUES] : ['', ...outcome.choices]
  const [value, setValue] = useState<string>(() => defaultValue(outcomes[0]))

  /** 適用先を変えたら値も既定へ戻す。前の列の値がそのまま残ると、押した瞬間に別の語が入る */
  const changeWhere = (next: string): void => {
    setWhere(next)
    setValue(defaultValue(next === IMPOSSIBLE_KEY ? undefined : outcomes[Number(next)]))
  }

  const valueLabel = (v: string): string => {
    if (outcome === undefined) return v === 'on' ? 'する' : 'しない'
    return v === '' ? CLEAR_RESULT_LABEL : v
  }

  const apply = (): void => {
    if (outcome === undefined || outcomeIndex === null) {
      onApply({ kind: IMPOSSIBLE_KEY, on: value === 'on' })
      return
    }
    onApply({ kind: 'result', outcomeIndex, value })
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="適用先">
            {outcome === undefined ? IMPOSSIBLE_LABEL : outcome.name}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={where} onValueChange={changeWhere}>
            {outcomes.map((o, j) => (
              // 値に位置を使う。ID 重複は赤表示する正規の状態なので、id では一意に指せない
              <DropdownMenuRadioItem key={`out-${j}`} value={`${j}`}>
                {o.name}
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuRadioItem value={IMPOSSIBLE_KEY}>{IMPOSSIBLE_LABEL}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="書き込む値">
            {valueLabel(value)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={value} onValueChange={setValue}>
            {options.map((v, at) => (
              // key に生のラベルを使わない。同じラベルの選択肢が2件あるファイルは
              // duplicate-choice が赤で出す正規の状態で、key が衝突する
              <DropdownMenuRadioItem key={`${at}`} value={v}>
                {valueLabel(v)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* 対象が0行でも押せる状態を保つ。押せなくすると、なぜ押せないのかが
          行数の表示からしか読めない */}
      <Button variant="outline" onClick={apply}>
        {`表示中の ${targetCount} 行に適用`}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: エディタに配線する**

`src/modules/decision-table/DecisionTableEditor.tsx` の import に足す。

```ts
import { applyBulk, type BulkTarget } from './bulk'
import { BulkFillBar } from './BulkFillBar'
```

`EditorProps` の分解に `onToast` を足す。

```tsx
export function DecisionTableEditor({
  data,
  onChange,
  issues,
  modalOpen,
  onToast,
}: EditorProps<DecisionTableSchemaVersion1>) {
```

`visible` の定義の直後に足す。

```tsx
  /**
   * まとめて入力。**変更した行数を知らせる**——上書きは確認を挟まないので、
   * 何行が動いたかを後から読める場所が要る。
   *
   * **文言の数はボタンの対象行数と分母が違う。** ボタンは絞り込みが出している
   * 行を数え、こちらはそのうち値が変わった行を数える
   */
  const applyBulkFill = (target: BulkTarget): void => {
    const out = applyBulk(data, visible, target)
    if (out.changed === 0) {
      onToast?.('値の変わる行はありません')
      return
    }
    onChange(out.data, null)
    const what =
      target.kind === 'impossible'
        ? `${IMPOSSIBLE_LABEL}を${target.on ? '付け' : '外し'}ました`
        : `${data.outcomes[target.outcomeIndex].name}を「${
            target.value === '' ? CLEAR_RESULT_LABEL : target.value
          }」にしました`
    onToast?.(`${what}（${out.changed} 行）`)
  }
```

`labels` の import に `CLEAR_RESULT_LABEL` を足す。

```ts
import { CLEAR_RESULT_LABEL, IMPOSSIBLE_LABEL } from './labels'
```

Step 7 の Step 8 で作った `<div className="mb-2 flex flex-wrap items-center gap-3">` の**直後**にバーを置く。

```tsx
            <BulkFillBar
              outcomes={data.outcomes}
              targetCount={visible.length}
              onApply={applyBulkFill}
            />
```

- [ ] **Step 5: 緑になることを確かめる**

Run: `npx vitest run src/modules/decision-table/DecisionTableEditor.dom.test.tsx src/App.dom.test.tsx`
Expected: PASS

Run: `npx tsc -b && npm run lint`
Expected: どちらも終了コード0

**テストの文言（`送料を「無料」にしました（2 行）`）が実装と逐語で一致すること。** 食い違ったら**実装の側でなくテストの側を実物に合わせる**のではなく、どちらが正しい文言かを決めてから両方を揃える。

- [ ] **Step 6: コミット**

```bash
git add src/modules/decision-table/BulkFillBar.tsx src/modules/decision-table/DecisionTableEditor.tsx src/modules/decision-table/DecisionTableEditor.dom.test.tsx src/App.dom.test.tsx
git commit -m "$(cat <<'EOF'
feat(decision-table): 絞り込んだ行へまとめて書き込む

対象は絞り込みが決めるので、バーは適用先と値だけを持つ。対象を指す操作を
2つ持つと、絞り込んだ表を見ながら別の条件へ書き込む事故が起きる。

通知の行数はボタンの対象行数と分母が違う。ボタンは出ている行を数え、
通知はそのうち値が変わった行を数える。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KS3r1L3bC9bcVSTRj8dUk
EOF
)"
```

---

## Task 9: 欠落ジャンプが絞り込みを外して飛ぶ

**Files:**
- Modify: `src/modules/decision-table/DecisionTableEditor.tsx`
- Test: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `EMPTY_FILTER`（`./filter`）、`tallyMissing`（`./missing`）
- Produces: なし（`jumpToMissing` の中身が変わる）

- [ ] **Step 1: 落ちるテストを書く**

`describe('まとめて入力', ...)` の後ろに足す。

```tsx
describe('欠落へのジャンプ', () => {
  it('隠れているセルへ飛ぶときは絞り込みを外す', () => {
    // 帯は全行を数えるので、飛び先が隠れていると数とジャンプ先が食い違う
    renderEditor(filterable)
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'はい' }))
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(gridRowNumbers()).toEqual(['3', '4'])
    fireEvent.click(screen.getByLabelText('次の未記入へ'))
    expect(gridRowNumbers()).toEqual(['1', '2', '3', '4'])
    expect(document.activeElement).toBe(screen.getByLabelText('送料（2行目）'))
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/modules/decision-table/DecisionTableEditor.dom.test.tsx -t '隠れているセルへ飛ぶ'`
Expected: FAIL（絞り込みが外れず、`送料（2行目）` が描かれていない）

帯のチップのアクセシブル名は `src/components/MissingTally.tsx` の `次の${p.label}へ` で、欠落の種類 `未記入` と合わせて `次の未記入へ` になる。

- [ ] **Step 3: 実装する**

`useState` の import に `useEffect` を足す。

```ts
import { useEffect, useRef, useState } from 'react'
```

`focusVisible` の直後に足す。

```tsx
  /**
   * 絞り込みを外してから移る先。**`focusGridCell` では代われない**——
   * 絞り込みを外した直後は、移動先のセルがまだ描かれていない
   */
  const [pendingJump, setPendingJump] = useState<{ index: number; field: string } | null>(null)

  useEffect(() => {
    if (pendingJump === null) return
    focusGridCell(pendingJump.index, pendingJump.field)
    setPendingJump(null)
  })

  /**
   * 欠落のセルへ移る。**隠れていたら絞り込みを外す**——帯は全行を数えるので、
   * 表示中の行だけを巡ると、数とジャンプ先が食い違う
   */
  const jumpToGridCell = (index: number, field: string): void => {
    if (visible.includes(index)) {
      focusGridCell(index, field)
      return
    }
    setFilter(EMPTY_FILTER)
    setPendingJump({ index, field })
  }
```

`jumpToMissing` の中の `focusGridCell(target.index, target.field)` を `jumpToGridCell(target.index, target.field)` に変える。

- [ ] **Step 4: 緑になることを確かめる**

Run: `npx vitest run src/modules/decision-table/DecisionTableEditor.dom.test.tsx`
Expected: PASS

**`useEffect` に依存配列を付けていないことを確かめる。** `pendingJump` だけを依存にすると、絞り込みを外した描画より先に走って移動先を見つけられない。

- [ ] **Step 5: コミット**

```bash
git add src/modules/decision-table/DecisionTableEditor.tsx src/modules/decision-table/DecisionTableEditor.dom.test.tsx
git commit -m "$(cat <<'EOF'
fix(decision-table): 隠れている欠落へ飛ぶときは絞り込みを外す

帯は全行を数えるので、表示中の行だけを巡ると数とジャンプ先が食い違う。
絞り込みを外した直後は移動先がまだ描かれていないので、移る先を予約して
描画の後で移る。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KS3r1L3bC9bcVSTRj8dUk
EOF
)"
```

---

## Task 10: 絞り込みを額縁へ知らせる

**Files:**
- Modify: `src/modules/decision-table/DecisionTableEditor.tsx`
- Test: `src/modules/decision-table/DecisionTableEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `useVisibleIdsReport`（`@/core/list-editor/use-visible-ids`）、`rowKeyOf`（`./rows`）、`isFiltered`（`./filter`）
- Produces: なし

- [ ] **Step 1: 落ちるテストを書く**

`describe('欠落へのジャンプ', ...)` の後ろに足す。

```tsx
describe('絞り込みの報告', () => {
  it('絞り込んでいない間は全件として知らせる', () => {
    const onVisibleIds = vi.fn()
    render(
      <DecisionTableEditor
        data={filterable}
        issues={[]}
        modalOpen={false}
        onChange={vi.fn()}
        onVisibleIds={onVisibleIds}
      />,
    )
    expect(onVisibleIds).toHaveBeenLastCalledWith(null, 4)
  })

  it('絞り込むと、出ている行の鍵だけを知らせる', () => {
    const onVisibleIds = vi.fn()
    render(
      <DecisionTableEditor
        data={filterable}
        issues={[]}
        modalOpen={false}
        onChange={vi.fn()}
        onVisibleIds={onVisibleIds}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('会員か の絞り込み'), { key: ' ' })
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'いいえ' }))
    const [ids, total] = onVisibleIds.mock.calls.at(-1)!
    expect(total).toBe(4)
    expect(ids).toEqual(new Set([JSON.stringify(['はい', 'はい']), JSON.stringify(['はい', 'いいえ'])]))
  })
})
```

- [ ] **Step 2: 落ちることを確かめる**

Run: `npx vitest run src/modules/decision-table/DecisionTableEditor.dom.test.tsx -t '絞り込みの報告'`
Expected: FAIL（`onVisibleIds` が呼ばれない）

- [ ] **Step 3: 実装する**

import に足す。

```ts
import { useVisibleIdsReport } from '@/core/list-editor/use-visible-ids'
import { MAX_ROWS, productSize, rowKeyOf } from './rows'
```

`./filter` の import に `isFiltered` を足す。

```ts
import { EMPTY_FILTER, filterRowIndices, isFiltered, type GridFilter } from './filter'
```

`EditorProps` の分解に `onVisibleIds` を足す。

```tsx
export function DecisionTableEditor({
  data,
  onChange,
  issues,
  modalOpen,
  onToast,
  onVisibleIds,
}: EditorProps<DecisionTableSchemaVersion1>) {
```

`visible` の定義の直後に足す。

```tsx
  /**
   * 絞り込みを額縁へ知らせる。**鍵は値の組み合わせで、添字ではない**——
   * この報告は `useEffect` を通るので1フレーム古くなりうる。条件の値を1つ消すと
   * 直積が縮み、同じ添字が別の組み合わせを指す
   */
  useVisibleIdsReport(
    isFiltered(filter) ? visible.map((i) => rowKeyOf(data.rows[i])) : null,
    data.rows.length,
    onVisibleIds,
  )
```

- [ ] **Step 4: 緑になることを確かめる**

Run: `npx vitest run src/modules/decision-table/DecisionTableEditor.dom.test.tsx`
Expected: PASS

Run: `npm test && npx tsc -b && npm run lint`
Expected: `tsc -b` と `oxlint` が終了コード0。`npm test` は着手時の 2504 件から増えており、落ちるのは（落ちるとしても）`src/modules/sequence/skill-write.smoke.test.ts` の既知のフレークだけ

- [ ] **Step 5: コミット**

```bash
git add src/modules/decision-table/DecisionTableEditor.tsx src/modules/decision-table/DecisionTableEditor.dom.test.tsx
git commit -m "$(cat <<'EOF'
feat(decision-table): 絞り込みを額縁へ知らせる

鍵は値の組み合わせで、添字では持たない。報告は useEffect を通るので1フレーム
古くなりうるが、組み合わせの鍵なら、消えた組み合わせはどの行にも一致せず
落ちるだけで済む。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KS3r1L3bC9bcVSTRj8dUk
EOF
)"
```

---

## Task 11: 文書を更新する

**Files:**
- Modify: `docs/decision-table/decision-table-design-notes.md`
- Modify: `docs/open-issues.md`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 設計ノートに絞り込みの節を足す**

`docs/decision-table/decision-table-design-notes.md` の `## 表の見せ方` の**直後**に節を足す。

```markdown
## 絞り込みとまとめて入力

表の列ごとに絞り込みを持つ。条件列は値、結果列は選択肢と「未記入」を並べ、列の中は OR、列どうしは AND で効く。`起こりえない` の行を出すかは表全体のチェックボックス1つが持ち、既定は出す。

絞り込みの状態はデータに持たない。見ている範囲は人ごと・その場ごとに変わるもので、ファイルに残すと他の人の表示まで動かす。

鍵は条件・結果の `id` である。位置で持つと、並び替えたときに別の列の絞り込みを引き継ぐ。

**絞り込みの結果が、そのまままとめて入力の適用先になる。** 対象を指す操作を2つ持つと、絞り込んだ表を見ながら別の条件へ書き込む事故が起きる。

まとめて入力は上書きを常に行い、確認を挟まない。Undo で1手として戻せるので、確認は打鍵を増やすだけになる。通知に出す行数は、ボタンの対象行数と分母が違う——ボタンは出ている行を数え、通知はそのうち値が変わった行を数える。

絞り込んでも No は振り直さない。No は行の呼び名（`#N`）であり、絞り込みで変わると会話の中で行を指せない。

欠落の帯から飛ぶときは、飛び先が隠れていれば絞り込みを外す。帯は全行を数えるので、表示中の行だけを巡ると数とジャンプ先が食い違う。

額縁への報告の鍵は、値の組み合わせから作る。報告は1フレーム古くなりうるので、添字を鍵にすると、直積が縮んだとき同じ添字が別の組み合わせを指す。
```

- [ ] **Step 2: 残件を更新する**

`docs/open-issues.md` の「挙動の穴」の節に1行足す。

```markdown
- **絞り込みの状態がファイルを切り替えると消える**（`src/modules/decision-table/DecisionTableEditor.tsx`）。データに持たない判断の裏返しで、同じファイルへ戻ると全行表示に戻る。
```

同じ節の `- **エラーカタログの集計は全行対象だがジャンプは表示中の行だけに飛ぶ**` の行に、直し方の出所を足す。

```markdown
- **エラーカタログの集計は全行対象だがジャンプは表示中の行だけに飛ぶ**（`src/modules/error-catalog/ErrorCatalogEditor.tsx`）。デシジョンテーブルは飛び先が隠れていれば絞り込みを外す形で揃えている。
```

- [ ] **Step 3: 文書の規則に合っていることを確かめる**

足した各項目について、次を目で確かめる。

- 現在形で書いてある。マイルストーン番号・日付・「〜にした」の記録が無い
- 1項目が2文まで。太字が1段落に1箇所まで
- 全角括弧の入れ子（`（…（…）…）`）が無い

Run: `git diff docs/`
Expected: 上の3点を満たす差分だけが出る

- [ ] **Step 4: コミット**

```bash
git add docs/decision-table/decision-table-design-notes.md docs/open-issues.md
git commit -m "$(cat <<'EOF'
docs(decision-table): 絞り込みとまとめて入力の設計判断を書く

残件を1件足す。絞り込みをデータに持たない判断の裏返しで、ファイルを
切り替えると全行表示に戻る。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018KS3r1L3bC9bcVSTRj8dUk
EOF
)"
```

---

## 完了の条件

- [ ] `npm test && npx tsc -b && npm run lint` が緑（`sequence/skill-write.smoke.test.ts` の既知のフレークを除く）
- [ ] `cd src-tauri && cargo test` が緑（この計画は Rust を触らないので、着手時と同じであること）
- [ ] `git log --oneline origin/decision-table..HEAD` が11本前後で、1コミット1目的である

## 人間への依頼（PR 本文に置く実機確認のチェックリスト）

- 条件5つ・値2つ（32行）の表を作り、絞り込みで8行まで落として、まとめて入力で結果を埋められること
- 列見出しの漏斗アイコンで、どの列が絞り込み中かが読めること
- `起こりえない行を表示` を外すと、その行が表から消え、戻すと出ること
- 欠落の帯のチップを押したとき、絞り込みが外れて隠れていたセルへ飛ぶこと
- まとめて入力の通知が積み上がらず、直前の1件だけ残ること
- ライトとダークの両方で、絞り込み中のアイコンと絞り込んでいないアイコンが見分けられること
