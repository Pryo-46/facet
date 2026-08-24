# M24 ツリーのノード幅固定 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 課題ツリーとロジックツリーのノード幅を内容から導出するのをやめ、両ツリーとも一律 320px に固定して、右上のステータスバッジが縦一列に揃うようにする（UI ノート D3・rev.3 の「スキャン性」）。

**Architecture:** 幅の固定は新しい仕組みを足すのではなく、`wrapWithin` の `minWidth === maxWidth`——シーケンスの答えセル（`ANSWER_WRAP`）が既に使っている形——を両ツリーへ広げることで実現する。高さは `wrapWithin` に新設する任意の `maxLines`（既定は無制限）で3行に打ち切り、溢れは `overflow-hidden` のまま切る。定数 `ISSUE_MAX_WIDTH` / `ISSUE_TITLE_MIN_WIDTH` / `NODE_MIN_WIDTH` と、`layout.ts` の幅の分岐は削除される。

**Tech Stack:** TypeScript / React 19 / Tailwind v4 / Vitest（`vitest run`）／ jsdom（DOM テスト）／ oxlint

**Spec:** `docs/superpowers/plans/2026-08-25-m24-node-width-lock-design.md`

## Global Constraints

- **計画のコードは検証済みの正ではない。** 指示が矛盾していたら辻褄を合わせず「計画の矛盾」として報告すること（`docs/lessons-for-planning.md` の大原則）。**検証コマンドとその出力を報告に貼ること**——貼らない報告は受け付けない。
- **測定層と描画層は同一のフォントトークンを参照する**（rev 9章）。定数と Tailwind クラスは**必ず対で直す**。測定が実際より小さいと、ブラウザに与えられる幅が前提より狭くなり、測定より多い行数に折り返して文字が切れる。
- **`docs/history/` は不変。** 過去のマイルストーンの申し送りは、そこに書かれた定数名が消えても**書き換えない**。
- **`sample-project/` の JSON 4本は追跡対象。** 動作確認で編集したら `git checkout -- sample-project/` で戻す。
- 段は3サイズ4段（`text-sm` 14/1.3・`text-base` 16/1.25・`text-base`＋`leading-normal` 16/1.5・`text-xl` 22/1.3）。明示してよい `leading-*` は `leading-none` と `leading-normal` の2つだけ（`src/styles/conventions.test.ts` が弾く）。
- **各タスクの完了時に `npm test` が緑であること。** 赤を次のタスクへ持ち越さない。
- 本計画のスコープ外: テーブル（用語集・エラーカタログ）の行高と `CellInput` の `MAX_ROWS`、シーケンス、E（フォント同梱）、F（見送り集計）、ダークの吟味。

---

## File Structure

| ファイル | 役割 | 本計画での扱い |
| --- | --- | --- |
| `src/core/canvas/wrap.ts` | 折り返しの純関数（DOM 非依存）。3ツール共有 | `WrapOptions` に任意の `maxLines` を足す |
| `src/core/canvas/wrap.test.ts` | 上の契約テスト | 固定幅（`min === max`）と `maxLines` の群を足す |
| `src/modules/logic-tree/measure.ts` | ロジックツリーの寸法定数と `wrapText` | `NODE_MAX_WIDTH`→`NODE_WIDTH`、`NODE_MIN_WIDTH` 削除、`NODE_MAX_LINES` 新設 |
| `src/modules/logic-tree/measure.test.ts` | 上のテスト | 固定幅と3行打ち切りの検証へ書き換え |
| `src/modules/logic-tree/LogicTreeEditor.font.dom.test.tsx` | フォント読み込み後の測り直しの番人 | **観測点を `style.width` から `style.height` へ移す**（決定4） |
| `src/modules/issue-tree/measure.ts` | 課題ツリーの寸法定数 | `ISSUE_MAX_WIDTH`・`ISSUE_TITLE_MIN_WIDTH` 削除、`BOX_TEXT_MAX_LINES` 新設 |
| `src/modules/issue-tree/layout.ts` | 課題ツリーのレイアウト（純関数） | 幅の分岐を削除、`textHeight` に `maxLines` を通す |
| `src/modules/issue-tree/layout.test.ts` | 上のテスト | 幅の一様性とバッジの右端一致を足し、自然幅のテストを削除 |
| `src/components/CellInput.tsx` | 表・ノード共通の制御入力 | `onBlur` で `scrollTop` を 0 に戻す |
| `src/components/CellInput.dom.test.tsx` | 上のテスト | `scrollTop` リセットの検証を足す |
| `docs/open-issues.md` / `docs/overview-rev.md` / `docs/facet-UI設計ノート.md` | 文書 | 決定7 のとおり反映 |
| `docs/history/m24-core-node-width-lock.md` | 申し送り（新規） | 実装で確定した事項と実機確認チェックリスト |

---

### Task 1: 準備と着手前スキャン

**Files:**
- 変更なし（調査のみ）

**Interfaces:**
- Consumes: なし
- Produces: 後続タスクが前提にする実測値——`ISSUE_MAX_WIDTH` / `ISSUE_TITLE_MIN_WIDTH` / `NODE_MIN_WIDTH` / `NODE_MAX_WIDTH` の参照箇所の全数、ベースラインの緑

- [ ] **Step 1: 依存を入れる**

この worktree には `node_modules` が無い。

```bash
npm install
```

- [ ] **Step 2: ベースラインが緑であることを確認する**

```bash
npm test
npx tsc -b
npm run lint
```

Expected: 3つとも成功。**ここが赤ならタスクを進めず報告すること**（M24 の変更と無関係な既存の失敗を、後で自分の変更のせいだと誤診しないため）。出力を報告に貼る。

- [ ] **Step 3: 消える定数の参照箇所を全数で洗う**

```bash
grep -rn "ISSUE_MAX_WIDTH\|ISSUE_TITLE_MIN_WIDTH\|NODE_MIN_WIDTH\|NODE_MAX_WIDTH" src/
```

Expected: 次の8ファイルに出る。**この一覧と食い違ったら報告すること**（計画が把握していない参照がある）。

- `src/core/canvas/wrap.test.ts`（コメント中の言及のみ。値をリテラルで写してある旨の説明）
- `src/modules/issue-tree/layout.ts`（import 2行 ＋ :461, :472, :478, :482, :483, :487）
- `src/modules/issue-tree/layout.test.ts`（import ＋ :136, :150, :161, :166）
- `src/modules/issue-tree/measure.ts`（:17-18, :22, :35）
- `src/modules/logic-tree/measure.ts`（:8, :10, :32, :33）
- `src/modules/logic-tree/measure.test.ts`（import ＋ :14, :20, :31, :32, :41）

**`docs/` 側のヒットは触らない。** `docs/history/` は不変であり、`docs/superpowers/plans/` の過去の計画も記録である。

- [ ] **Step 4: 3行上限を当てる `textHeight` 呼び出しを特定する**

```bash
grep -n "textHeight(" src/modules/issue-tree/layout.ts
```

Expected: 定義1件（`:145` 付近）＋ 呼び出し複数。**上限を当てるのは「閉じた箱に出るもの」2つだけ**——タイトル（`:490`）と見送りの理由（`:492`）。**展開パネルの中（由来・根拠・FB・以前の判断）の呼び出しには当てない。** 呼び出し箇所の一覧を報告に貼り、どれがパネル側かを明示すること。

- [ ] **Step 5: コミットは無し**

調査だけなので何も変更していない。`git status --short` が空であることを確認して次へ。

---

### Task 2: フォント測り直しの番人を、幅から高さへ移す

**Files:**
- Modify: `src/modules/logic-tree/LogicTreeEditor.font.dom.test.tsx`（全面）

**Interfaces:**
- Consumes: `NODE_INSET_Y`（= 7。`src/modules/logic-tree/measure.ts`）
- Produces: なし（テストのみ）

**なぜ先にやるか。** このテストは「Web フォント読み込み後にノードが測り直されるか」を**ノード矩形の `style.width`（142px → 262px）**で見ている。Task 4 で幅が定数 320 になると測定器を差し替えても幅が動かず、この番人は何も検証しなくなる。**先に観測点を高さへ移しておけば、現行コードのまま緑になり、かつ Task 4 の変更を跨いで生き残る**——「幅の固定を入れたついでに 320 へ書き換えて緑にした」という直し方（M23 決定1 と同じ退化）を構造的に防げる。

**なぜ高さなら効くか。** 高さは行数を通じてフォントに依存し続ける。偽の測定器は1回目 `perChar = 10`、2回目 `perChar = 20` を返すので、**倍化がちょうど行の境界をまたぐ文字数**を選べば行数が1→2に増え、高さが動く。

**文字数の選び方（この導出をコメントに残すこと）:** 内容幅は `NODE_MAX_WIDTH(320) - NODE_INSET_X(11) × 2 = 298`。文字数 L が1行で収まる条件は `L × perChar ≦ 298`。したがって「10 では1行、20 では2行」になるのは `15 ≦ L ≦ 29`。**L = 20** を採る（範囲の中央付近で、両端から遠い）。

- [ ] **Step 1: テストを書き換える**

`src/modules/logic-tree/LogicTreeEditor.font.dom.test.tsx` を次の内容に置き換える。

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { LogicTreeEditor } from './LogicTreeEditor'
import { NODE_INSET_Y } from './measure'

/**
 * Web フォントの読み込み後に測り直すことの検証。
 *
 * **`LogicTreeEditor.dom.test.tsx` とファイルを分けてある。** `vi.mock` は
 * ファイル先頭に巻き上げられてそのファイル全体に効くので、同居させると
 * 描画のテスト10本が偽の測定器で走ることになり、意味が変わってしまう
 *（`vi.doMock` ＋ 動的 import で1本だけ差し替える手もあるが、
 *  ファイルを分ける方が「どのテストが何を見ているか」が読んで分かる）。
 *
 * **観測点はノード矩形の `style.height` である（M24 で幅から移した）。**
 * ノードの幅は M24 で固定（`NODE_WIDTH`）になったので、測定器を差し替えても
 * 動かない。**幅を観測点にしたままにすると、この番人は何も検証しなくなる**
 * ——高さは行数を通じてフォントに依存し続けるので、そちらへ移してある。
 * 「測定層と描画層が同一のフォントトークンを参照する」（rev 9章）が
 * 壊れたときに赤くなるのが、このテストの役目である
 */
const state = vi.hoisted(() => ({ calls: 0 }))

// createCanvasMeasurer だけを「呼ばれるたびに太く測る」偽物に差し替える。
// readCanvasFont / FALLBACK_CANVAS_FONT / sameFont は実物のまま——
// このテストが見たいのは「測定器が作り直されるか」だけである
vi.mock('@/core/canvas/canvas-font', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core/canvas/canvas-font')>()
  return {
    ...actual,
    createCanvasMeasurer: () => {
      state.calls += 1
      const perChar = state.calls === 1 ? 10 : 20
      return (text: string) => text.length * perChar
    },
  }
})

/**
 * 20文字。**この長さは「倍化がちょうど行の境界をまたぐ」ように選んである。**
 *
 * 内容幅は 320 − `NODE_INSET_X`(11) × 2 ＝ 298px。文字数 L が1行に収まるのは
 * `L × perChar ≦ 298` のときなので、`perChar` 10 で1行・20 で2行になる L は
 * **15 以上 29 以下**。その中央付近の 20 を採った。
 *
 * **短くしないこと。** 12文字（M24 より前の値）では 12×20＝240 ≦ 298 で
 * 2回目も1行のままになり、高さが動かず、この番人が黙って死ぬ
 */
const TEXT = 'あいうえおかきくけこさしすせそたちつてと'

const data: LogicTreeSchemaVersion1 = {
  schemaVersion: 1,
  type: 'logicTree',
  title: 'テスト',
  nodes: [{ id: 'node_AAAAAAAAAA', parentId: null, text: TEXT }],
}

let resolveFonts: () => void

beforeEach(() => {
  // jsdom は document.fonts を持たない。effect が通る形を差し込む
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      ready: new Promise<void>((resolve) => {
        resolveFonts = resolve
      }),
    },
  })
})

afterEach(() => {
  cleanup()
  // **document は環境の共有物。差し込んだものは必ず外す**
  Reflect.deleteProperty(document, 'fonts')
  state.calls = 0
})

describe('LogicTreeEditor（Web フォントの読み込み後の測り直し）', () => {
  it('document.fonts.ready の解決でノードの高さが測り直される（1行 → 2行）', async () => {
    render(<LogicTreeEditor data={data} onChange={() => {}} issues={[]} modalOpen={false} />)
    const box = screen.getByLabelText('ノード1').parentElement
    const inset = NODE_INSET_Y * 2

    // **1行ぶんの高さを実測から取る。** `lineHeight` の値をリテラルで
    // 書かないのは、段（rev 9章）が変わったときに黙って取り残されないため
    const oneLine = Number.parseFloat(box?.style.height ?? '') - inset
    expect(oneLine).toBeGreaterThan(0)

    // **getComputedStyle が返す値は読み込みの前後で変わらない**ので、
    // フォントの同一性で判定していると測り直しは起きない。
    // 世代カウンタが測定器の鍵に入っていて初めてここが動く
    resolveFonts()
    await waitFor(() => {
      // ちょうど1行ぶん増えた＝太く測り直して折り返しが1つ増えた
      expect(Number.parseFloat(box?.style.height ?? '')).toBe(inset + oneLine * 2)
    })
    expect(state.calls).toBe(2)
  })
})
```

- [ ] **Step 2: テストが現行コードのまま緑になることを確認する**

```bash
npx vitest run src/modules/logic-tree/LogicTreeEditor.font.dom.test.tsx
```

Expected: PASS。**ここで落ちたら報告すること。** 幅の固定はまだ入っていないので、このテストは現行コード（可変幅）でも成立するはずである——`perChar` 10 で 20文字は 200px ≦ 298 なので1行、20 で 400px なので2行（1行 14文字 ＋ 6文字）になる。

- [ ] **Step 3: 番人が本当に番をしているかを確かめる（一時的な破壊テスト）**

`src/modules/logic-tree/LogicTreeEditor.tsx` の `measurerKey` から世代を一時的に外す:

```
const measurerKey = `${font.font}|${font.lineHeight}`
```

```bash
npx vitest run src/modules/logic-tree/LogicTreeEditor.font.dom.test.tsx
```

Expected: **FAIL**（測り直しが起きず高さが動かない）。落ちることを確認したら `fontGeneration` を戻し、再度 PASS になることを確認する。**この確認をせずに次へ進まないこと**——観測点を移した結果「何も検証していないテスト」になっていないことの証明がこれである。出力（FAIL と PASS の両方）を報告に貼る。

- [ ] **Step 4: コミット**

```bash
git add src/modules/logic-tree/LogicTreeEditor.font.dom.test.tsx
git commit -m "test(m24): フォント測り直しの番人の観測点を幅から高さへ移す"
```

---

### Task 3: `wrapWithin` に `maxLines` を足す

**Files:**
- Modify: `src/core/canvas/wrap.ts:15-20`（`WrapOptions`）、`:42-74`（`wrapWithin`）
- Test: `src/core/canvas/wrap.test.ts`（末尾に describe を2つ追加）

**Interfaces:**
- Consumes: なし
- Produces: `WrapOptions.maxLines?: number`——**省略時は無制限**（既存の呼び出しは無変更で通る）。指定すると `WrappedBlock.lines` がその本数で切られ、`height` もその行数から計算される。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/canvas/wrap.test.ts` の末尾に追記する。

```ts
describe('wrapWithin（固定幅——minWidth === maxWidth）', () => {
  const measure = createEstimateMeasurer(10)
  const LH = 20
  /** 幅を導出しない箱。シーケンスの答えセル（ANSWER_WRAP）と同じ形 */
  const FIXED: WrapOptions = { maxWidth: 320, minWidth: 320, insetX: 11, insetY: 7 }

  it('空文字でも幅は固定値のまま', () => {
    expect(wrapWithin('', measure, LH, FIXED).width).toBe(320)
  })

  it('短い文言でも幅は固定値のまま（自然幅へ縮まない）', () => {
    expect(wrapWithin('あい', measure, LH, FIXED).width).toBe(320)
  })

  it('折り返すほど長くても幅は固定値のまま', () => {
    expect(wrapWithin('あ'.repeat(80), measure, LH, FIXED).width).toBe(320)
  })
})

describe('wrapWithin（maxLines——3行で打ち切る）', () => {
  const measure = createEstimateMeasurer(10)
  const LH = 20
  const BASE: WrapOptions = { maxWidth: 320, minWidth: 320, insetX: 11, insetY: 7 }
  const CAPPED: WrapOptions = { ...BASE, maxLines: 3 }
  // 内容幅 298px ÷ 全角10px ＝ 1行 29 文字
  const PER_LINE = 29

  it('省略すれば無制限のまま（既存の呼び出しの振る舞いを変えない）', () => {
    const r = wrapWithin('あ'.repeat(PER_LINE * 5), measure, LH, BASE)
    expect(r.lines.length).toBe(5)
    expect(r.height).toBe(LH * 5 + 14)
  })

  it('上限を超えた行は落とし、高さも上限で止まる', () => {
    const r = wrapWithin('あ'.repeat(PER_LINE * 5), measure, LH, CAPPED)
    expect(r.lines.length).toBe(3)
    expect(r.height).toBe(LH * 3 + 14)
  })

  it('上限に満たない文言はそのまま（打ち切りが常時効いてしまわない）', () => {
    const r = wrapWithin('あ'.repeat(PER_LINE + 1), measure, LH, CAPPED)
    expect(r.lines.length).toBe(2)
    expect(r.height).toBe(LH * 2 + 14)
  })

  it('明示改行にも効く（折り返しだけでなく段落も数える）', () => {
    const r = wrapWithin('あ\nい\nう\nえ\nお', measure, LH, CAPPED)
    expect(r.lines).toEqual(['あ', 'い', 'う'])
    expect(r.height).toBe(LH * 3 + 14)
  })

  it('落とした行は幅の算出にも入らない', () => {
    // 1行目は短く、4行目だけが長い。可変幅なら4行目が幅を決めるところ
    const opts: WrapOptions = { maxWidth: 320, minWidth: 0, insetX: 11, insetY: 7, maxLines: 3 }
    const r = wrapWithin('あ\nい\nう\n' + 'か'.repeat(20), measure, LH, opts)
    expect(r.lines).toEqual(['あ', 'い', 'う'])
    expect(r.width).toBe(10 + 22)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run src/core/canvas/wrap.test.ts
```

Expected: FAIL。`maxLines` を渡している群が落ちる（`WrapOptions` に `maxLines` が無いので TypeScript の型エラー、または実行時に上限が効かず行数が5のまま）。**固定幅の群（`minWidth === maxWidth`）は現行の実装でも通るはず**——`Math.min(max, Math.max(min, ...))` が両端で挟まれるため。この群だけ PASS になるのは正しい。

- [ ] **Step 3: `WrapOptions` に `maxLines` を足す**

`src/core/canvas/wrap.ts` の `WrapOptions` を差し替える。

```ts
export interface WrapOptions {
  maxWidth: number
  minWidth: number
  insetX: number
  insetY: number
  /**
   * 折り返しの上限行数。**省略＝無制限。**
   *
   * 超えた行は落とし、高さも上限行数で止まる。**落とした行は幅の算出にも
   * 入らない**——見えない行が箱の幅を決めるのは筋が通らないため。
   *
   * 使うのは「閉じた箱に出る文章」だけ（UI ノート D3。M24）。詳細を読む
   * 場所——課題ツリーの展開パネル、シーケンスの答えセル——には当てない
   */
  maxLines?: number
}
```

- [ ] **Step 4: `wrapWithin` に打ち切りを入れる**

`src/core/canvas/wrap.ts` の `wrapWithin` で、`lines` を組み終えた直後（`const contentWidth = ...` の直前）に次を挿入する。

```ts
  // **幅を出す前に落とす。** 見えない行が箱の幅を決めるのは筋が通らない
  if (opts.maxLines !== undefined && lines.length > opts.maxLines) {
    lines.length = opts.maxLines
  }
```

`height` の計算（`Math.ceil(lines.length * lineHeight) + opts.insetY * 2`）は `lines` を読んでいるので、そのままで上限が効く。

あわせて `wrapWithin` の JSDoc の末尾に1段落を足す:

```
 * **`maxLines` を渡すと、超えた行は落ちる。** 落ちた文字はブラウザ側にも
 * 描かれない（`overflow-hidden` の箱に収まらないため）が、`textarea` の
 * 値としては生きており、キャレット移動で編集できる。省略記号は出さない
 *（`text-overflow: ellipsis` も `line-clamp` も textarea には効かない。M24）
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run src/core/canvas/wrap.test.ts
npx tsc -b
```

Expected: 両方 PASS。

- [ ] **Step 6: 既存の呼び出しが無変更で通ることを確認する**

```bash
npm test
```

Expected: 全件 PASS。**シーケンスとロジックツリーは `maxLines` を渡していないので、振る舞いは1つも変わらないはず。** ここで何か落ちたら「省略時は無制限」が守れていない。

- [ ] **Step 7: コミット**

```bash
git add src/core/canvas/wrap.ts src/core/canvas/wrap.test.ts
git commit -m "feat(m24): wrapWithin に任意の maxLines を足す（既定は無制限）"
```

---

### Task 4: ロジックツリーを固定幅＋3行にする

**Files:**
- Modify: `src/modules/logic-tree/measure.ts:7-10`（定数）、`:29-37`（`wrapText`）
- Modify: `src/core/canvas/wrap.test.ts:42-45`（コメントのみ。消えた定数を名指ししている）
- Test: `src/modules/logic-tree/measure.test.ts`

**Interfaces:**
- Consumes: `WrapOptions.maxLines`（Task 3）
- Produces: `NODE_WIDTH = 320`（`NODE_MAX_WIDTH` からの改名）、`NODE_MAX_LINES = 3`。**`NODE_MIN_WIDTH` は削除される。**

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/logic-tree/measure.test.ts` を次の内容に置き換える。

```ts
import { describe, expect, it } from 'vitest'
import {
  createEstimateMeasurer,
  NODE_INSET_X,
  NODE_INSET_Y,
  NODE_MAX_LINES,
  NODE_WIDTH,
  wrapText,
} from './measure'

/** 半角=5px / 全角=10px の測定器。境界の計算を暗算できる値にする */
const measure = createEstimateMeasurer(10)
const LH = 20
const CONTENT_MAX = NODE_WIDTH - NODE_INSET_X * 2

describe('wrapText', () => {
  it('空文字は1行・固定幅になる', () => {
    const r = wrapText('', measure, LH)
    expect(r.lines).toEqual([''])
    expect(r.width).toBe(NODE_WIDTH)
    expect(r.height).toBe(LH + NODE_INSET_Y * 2)
  })

  /**
   * **M24 で反転した観点。** 以前は「幅は文言から算出し、最小幅を下回らない」
   * だった。ノード幅を内容から導出すると長文ノードだけ幅が3倍になり、
   * 木の骨格が読めなくなる（UI ノート D3）ので、幅は導出しない
   */
  it('短い文言でも幅は固定（自然幅へ縮まない）', () => {
    expect(wrapText('あいうえお', measure, LH).width).toBe(NODE_WIDTH)
  })

  it('最大幅に収まる文言は折り返さない', () => {
    const r = wrapText('あいうえお', measure, LH)
    expect(r.lines).toEqual(['あいうえお'])
    expect(r.height).toBe(LH + NODE_INSET_Y * 2)
  })

  it('内容幅を超えたら折り返し、幅は固定のまま', () => {
    const perLine = Math.floor(CONTENT_MAX / 10)
    const r = wrapText('あ'.repeat(perLine + 3), measure, LH)
    expect(r.lines.length).toBe(2)
    expect(r.lines[0].length).toBe(perLine)
    expect(r.lines[1].length).toBe(3)
    expect(r.width).toBe(NODE_WIDTH)
    expect(r.height).toBe(LH * 2 + NODE_INSET_Y * 2)
  })

  it('折り返した各行は、内容の幅の上限に収まる', () => {
    const r = wrapText('あ'.repeat(80), measure, LH)
    for (const line of r.lines) expect(measure(line)).toBeLessThanOrEqual(CONTENT_MAX)
  })

  /** M24: 骨格を読ませるため、高さも有界にする（UI ノート D3） */
  it('NODE_MAX_LINES で行と高さが打ち切られる', () => {
    const perLine = Math.floor(CONTENT_MAX / 10)
    const r = wrapText('あ'.repeat(perLine * (NODE_MAX_LINES + 2)), measure, LH)
    expect(r.lines.length).toBe(NODE_MAX_LINES)
    expect(r.height).toBe(LH * NODE_MAX_LINES + NODE_INSET_Y * 2)
  })

  it('明示改行で行を分ける', () => {
    const r = wrapText('承認\n却下\n差し戻し', measure, LH)
    expect(r.lines).toEqual(['承認', '却下', '差し戻し'])
    expect(r.height).toBe(LH * 3 + NODE_INSET_Y * 2)
  })

  it('単語の途中でも折り返す（日本語向けの break-all と同じ規則）', () => {
    const perLine = Math.floor(CONTENT_MAX / 5)
    expect(wrapText('a'.repeat(perLine + 2), measure, LH).lines.length).toBe(2)
  })

  it('1文字が内容幅を超えても、その1文字で1行を作る（無限ループにしない）', () => {
    const huge = createEstimateMeasurer(1000)
    expect(wrapText('あい', huge, LH).lines).toEqual(['あ', 'い'])
  })
})
```

**注意:** 元ファイルの最後のテスト（`huge` の測定器を使うもの）は行番号 :63 付近にある。上の置き換えで内容は保たれている。**元ファイルに上記以外のテストが残っていたら消さずに残し、その旨を報告すること。**

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run src/modules/logic-tree/measure.test.ts
```

Expected: FAIL（`NODE_WIDTH` / `NODE_MAX_LINES` が存在しない）。

- [ ] **Step 3: `measure.ts` の定数を差し替える**

`src/modules/logic-tree/measure.ts` の `:7-10`（`NODE_MAX_WIDTH` と `NODE_MIN_WIDTH`）を次に置き換える。

```ts
/**
 * ノード矩形の幅。**固定。導出しない**（UI ノート D3。M24）。
 *
 * 内容から導出していたころは長文ノードだけ幅が3倍になり、木の骨格が
 * 読めなかった。課題ツリーの箱（`src/modules/issue-tree/measure.ts` の
 * `BOX_WIDTH`）と同じ 320 で、**あちらも固定である**。シーケンスの
 * `LABEL_MAX_WIDTH` も同じ 320 だが、あちらは**上限**であって固定ではない
 * ——値が同じだけで意味が違うので、3つを共有定数に束ねていない
 */
export const NODE_WIDTH = 320
/**
 * 折り返しの上限行数。超えた行は落ち、`overflow-hidden` の箱に収まらない
 * ——**省略記号は出さない**（`text-overflow: ellipsis` も `line-clamp` も
 * textarea には効かない。M24 の設計スペック 決定3）。編集中はキャレット
 * 移動でブラウザが内部スクロールするので、全文には届く。
 *
 * 課題ツリーの `BOX_TEXT_MAX_LINES` と同じ 3。**別々に持っているのは、
 * 2つの木が互いの寸法に縛られないため**（`NODE_WIDTH` と `BOX_WIDTH` と同じ扱い）
 */
export const NODE_MAX_LINES = 3
```

- [ ] **Step 4: `wrapText` を固定幅＋上限行数にする**

同ファイルの `wrapText`（`:29-37`）を次に置き換える。

```ts
/** ノード矩形の寸法。折り返しの規則そのものは core/canvas/wrap.ts が持つ */
export function wrapText(text: string, measure: MeasureWidth, lineHeight: number): WrappedText {
  return wrapWithin(text, measure, lineHeight, {
    // **`maxWidth === minWidth` が「幅を導出しない」の表現である**
    //（シーケンスの答えセル `ANSWER_WRAP` と同じ形）
    maxWidth: NODE_WIDTH,
    minWidth: NODE_WIDTH,
    insetX: NODE_INSET_X,
    insetY: NODE_INSET_Y,
    maxLines: NODE_MAX_LINES,
  })
}
```

あわせて `:15-21` の `NODE_INSET_X` / `NODE_INSET_Y` の JSDoc（「ここが実際より小さいと…文字が切れる」）は**そのまま残す**。固定幅になっても、内容幅の前提がずれれば同じ欠陥が起きる。

- [ ] **Step 5: 消えた定数を名指ししているコメントを直す**

`src/core/canvas/wrap.test.ts:42-45` のコメントは `NODE_MAX_WIDTH` と `NODE_MIN_WIDTH` を名指ししている。**この群のテスト本体は変えない**（`minWidth < maxWidth` の一般契約はシーケンスが使い続ける）が、コメントだけ次に差し替える。

```ts
// 移設元: src/modules/logic-tree/measure.ts の wrapText テストのうち、
// 上の sequence 由来のテストにない観点を補う。**当時の** NODE_MAX_WIDTH（320）／
// NODE_INSET_X（11）／NODE_MIN_WIDTH（96）／NODE_INSET_Y（7）の値をそのまま
// リテラルに写している。
//
// **M24 で logic-tree 側は固定幅になった**（NODE_MAX_WIDTH は NODE_WIDTH へ
// 改名、NODE_MIN_WIDTH は削除）。この群が見ているのは `minWidth < maxWidth`
// ——**シーケンスがまだ使っている一般契約**——なので、ここは移設当時の値の
// まま残してある。固定幅（minWidth === maxWidth）の契約は下の別の群が見る
```

- [ ] **Step 6: テストが通ることを確認する**

```bash
npx vitest run src/modules/logic-tree/measure.test.ts
npx tsc -b
```

Expected: 両方 PASS。`tsc` が `NODE_MAX_WIDTH` / `NODE_MIN_WIDTH` の未解決参照を報告したら、Task 1 Step 3 の一覧に無い参照が残っている——**報告してから直すこと。**

- [ ] **Step 7: Task 2 の番人が生きていることを確認する**

```bash
npx vitest run src/modules/logic-tree/
```

Expected: 全件 PASS。**とくに `LogicTreeEditor.font.dom.test.tsx` が緑であること**——幅が 320 に固定された後もこの番人が成立することが、Task 2 を先にやった理由である。

- [ ] **Step 8: コミット**

```bash
git add src/modules/logic-tree/measure.ts src/modules/logic-tree/measure.test.ts src/core/canvas/wrap.test.ts
git commit -m "feat(m24): ロジックツリーのノード幅を固定し、3行で打ち切る"
```

---

### Task 5: 課題ツリーを固定幅＋3行にする

**Files:**
- Modify: `src/modules/issue-tree/measure.ts:17-35`（定数の削除と追加）、`:57-65`（`BOX_WIDTH` の JSDoc）
- Modify: `src/modules/issue-tree/layout.ts:26-27`（import）、`:144-152`（`textHeight`）、`:454-493`（幅の分岐）
- Test: `src/modules/issue-tree/layout.test.ts`

**Interfaces:**
- Consumes: `WrapOptions.maxLines`（Task 3）
- Produces: `BOX_TEXT_MAX_LINES = 3`。**`ISSUE_MAX_WIDTH` と `ISSUE_TITLE_MIN_WIDTH` は削除される。** `IssuePlacement` の形は変わらない。

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/issue-tree/layout.test.ts` の import 行（`:6`）を差し替える。

```ts
import { BADGE_GAP, BOX_TEXT_MAX_LINES, BOX_WIDTH, ISSUE_INSET_X } from './measure'
```

次に、`:132-137` の **「仮説を持たない課題の箱はタイトルの自然幅（ロジックツリーと同じ）」を削除**し、`:144-168` の2本（「空のタイトルでもバッジのぶん箱が広がり…」「固定幅（BOX_WIDTH）の箱でも、枠を引いたタイトルは下限を割らない」）を、次の4本に置き換える。

```ts
  /**
   * **M24 で反転した観点。** 以前は「仮説を持たない課題の箱はタイトルの
   * 自然幅」だった。箱幅が内容で決まると、同じ列の中でバッジの右端が
   * 散り、「どれが未決か」を知るのに全ノードを読む必要が出る
   *（UI ノート D3 rev.3 ＝ スキャン性）
   */
  it('箱の幅は、仮説の有無・見送りの有無によらず BOX_WIDTH で一定', () => {
    // (a) 葉で仮説なし（「仮説なし」バッジが立つ＝一番広い枠）
    const warn = run(make({ issues: [{ ...root, text: '短い' }] })).issues[0]!
    expect(warn.rect.width).toBe(BOX_WIDTH)

    // (b) 仮説を持つ
    const withRows = run(make({ issues: [root], hypotheses: [h(1)] })).issues[0]!
    expect(withRows.rect.width).toBe(BOX_WIDTH)

    // (c) 見送り済み
    const deferred = run(
      make({ issues: [{ ...root, events: [{ kind: 'deferred', note: '今回は追わない' }] }] }),
    ).issues[0]!
    expect(deferred.rect.width).toBe(BOX_WIDTH)

    // (d) バッジもトグルも立たない（子を持つ中間の課題）
    const middle = run(make({ issues: [root, child] })).issues[0]!
    expect(middle.rect.width).toBe(BOX_WIDTH)
  })

  /**
   * **D3 rev.3 の主張そのものの門番。** 右上の枠に出るものは3つ（見送りバッジ・
   * 「仮説なし」バッジ・見送りトグル）だが、**レイアウトが矩形を組むのは
   * 見送りバッジだけ**で、残る2つは `IssueBox` が CSS の `right: ISSUE_PADDING_X`
   * で右寄せする。どちらも右端は「箱の右端 − `ISSUE_INSET_X`」に落ちるので、
   * **箱幅が揃っていれば3種類とも同じ x に並ぶ**——上のテストと対で見ること
   */
  it('同じ深さの箱では、見送りバッジの右端が揃う', () => {
    const a: IssueNode = { id: I(1), parentId: I(0), text: '短い', events: [{ kind: 'deferred', note: 'r' }] }
    const b: IssueNode = {
      id: I(2),
      parentId: I(0),
      text: 'とても長いほうの課題の文言でありこちらは折り返す',
      events: [{ kind: 'deferred', note: 'r' }],
    }
    const out = run(make({ issues: [root, a, b] }))
    const da = out.issues[1]!.deferral!
    const db = out.issues[2]!.deferral!
    expect(da.badge.x + da.badge.width).toBe(db.badge.x + db.badge.width)
    // 箱の右端 − ISSUE_INSET_X に一致する
    const rect = out.issues[1]!.rect
    expect(da.badge.x + da.badge.width).toBe(rect.x + rect.width - ISSUE_INSET_X)
  })

  /**
   * 固定幅になっても、**一番広い枠を引いたタイトルが痩せすぎない**ことは
   * 依然として要る（M24 より前は `ISSUE_TITLE_MIN_WIDTH` が持っていた不変条件）。
   * **下限をリテラルで書かない**——段が変われば「8字ぶん」の px は動くので、
   * テストの測定器から導く
   */
  it('一番広い枠（仮説なしバッジ）を引いても、タイトルは日本語8字ぶんを残す', () => {
    const data = make({ issues: [{ ...root, text: '' }] })
    expect(poseQuestions(data).issueNeedsHypothesis[0]).toBe(true)
    const box = run(data).issues[0]!
    expect(box.title.width).toBeGreaterThanOrEqual(fonts.title.measure('あ'.repeat(8)))
    // タイトルは箱からはみ出さない
    expect(box.title.x + box.title.width).toBeLessThanOrEqual(box.rect.x + box.rect.width)
  })

  /** M24: 骨格を読ませるため、閉じた箱に出る文章の高さを有界にする */
  it('タイトルと見送りの理由は BOX_TEXT_MAX_LINES で打ち切られる', () => {
    const long = '課'.repeat(200)
    const out = run(
      make({ issues: [{ ...root, text: long, events: [{ kind: 'deferred', note: long }] }] }),
    ).issues[0]!
    expect(out.title.height).toBe(fonts.title.lineHeight * BOX_TEXT_MAX_LINES)
    expect(out.deferral!.reason.height).toBe(fonts.small.lineHeight * BOX_TEXT_MAX_LINES)
  })
```

**注意:** `IssueNode` 型は既に `:3` で import 済み。`child` と `poseQuestions` も既存の import で足りる。

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run src/modules/issue-tree/layout.test.ts
```

Expected: FAIL（`BOX_TEXT_MAX_LINES` が存在しない）。

- [ ] **Step 3: `measure.ts` の定数を差し替える**

`src/modules/issue-tree/measure.ts` の `:17-35`（`ISSUE_MAX_WIDTH` と `ISSUE_TITLE_MIN_WIDTH` の宣言と JSDoc すべて）を、次の1つに置き換える。

```ts
/**
 * 折り返しの上限行数。**閉じた箱に出る文章だけに当てる**——課題のタイトルと
 * 見送りの理由の2つで、**展開パネルの中（由来・根拠・FB・以前の判断）には
 * 当てない**（そこが「詳細を読む場所」であり、UI ノート D3 の
 * 「詳細は別パネルで表示」が指しているのはこのパネルである）。
 *
 * 超えた行は落ち、`overflow-hidden` の箱に収まらない。**省略記号は出さない**
 *（`text-overflow: ellipsis` も `line-clamp` も textarea には効かない）。
 * 編集中はキャレット移動でブラウザが内部スクロールするので全文には届き、
 * 抜けたときは `CellInput` が `scrollTop` を 0 に戻す。
 *
 * ロジックツリーの `NODE_MAX_LINES` と同じ 3。**別々に持っているのは、
 * 2つの木が互いの寸法に縛られないため**
 */
export const BOX_TEXT_MAX_LINES = 3
```

続けて `:57-65` の `BOX_WIDTH` の JSDoc を次に差し替える（**値 320 は変えない**）。

```ts
/**
 * 課題の箱の幅（**固定。導出しない**）。**M24 で全種類の箱に広がった。**
 *
 * 箱の中には課題の文言と仮説の行という**性質の違う文章が縦に積まれる**ので、
 * 一番長い行に幅を合わせると、短い課題と長い課題で箱幅がばらつき、木が
 * 階段状に見える。シーケンスがガター幅を導出しないと決めた（design-notes
 * 論点7）のと同じ判断。
 *
 * **M24 より前、仮説も見送りも持たない箱だけはタイトルの自然幅だった。**
 * その結果、同じ列の中で右上のバッジの右端が散り、「どれが未決か」を知るには
 * 全ノードを個別に読む必要があった（UI ノート D3 rev.3 ＝ スキャン性）。
 * いまは例外なくこの幅で、**バッジは列ごとに縦一列に揃う。**
 *
 * 値はロジックツリーのノード（`NODE_WIDTH`）と同じ 320 で、**あちらも固定**。
 * シーケンスの `LABEL_MAX_WIDTH` も 320 だが、あちらは**上限**であって固定では
 * ない——値が同じだけで意味が違うので、3つを共有定数に束ねていない
 */
export const BOX_WIDTH = 320
```

- [ ] **Step 4: `layout.ts` の import を直す**

`src/modules/issue-tree/layout.ts` の `:26-27` の2行（`ISSUE_MAX_WIDTH,` と `ISSUE_TITLE_MIN_WIDTH,`）を削除し、代わりに（アルファベット順の位置に）次を足す。

```ts
  BOX_TEXT_MAX_LINES,
```

- [ ] **Step 5: `textHeight` に `maxLines` を通す**

同ファイルの `textHeight`（`:144-152`）を次に置き換える。

```ts
/**
 * 折り返した文章の高さ（余白は箱が1度だけ持つので、ここでは 0）。
 *
 * `maxLines` を渡すと高さがそこで止まる。**渡すのは閉じた箱に出る文章だけ**
 *——タイトルと見送りの理由。展開パネルの中は詳細を読む場所なので渡さない（M24）
 */
function textHeight(
  text: string,
  font: IssueTreeFont,
  width: number,
  maxLines?: number,
): number {
  return wrapWithin(text, font.measure, font.lineHeight, {
    maxWidth: width,
    minWidth: 0,
    insetX: 0,
    insetY: 0,
    maxLines,
  }).height
}
```

- [ ] **Step 6: 幅の分岐を消す**

同ファイルの `:454-493`（`// 仮説の行も見送りの理由も無い箱は…` のコメントから `reasonHeight` の宣言まで）を、次に置き換える。

```ts
    // **箱の幅は導出しない**（`measure.ts` の `BOX_WIDTH` の解説）。
    // M24 より前は「仮説も見送りも無い箱だけタイトルの自然幅」という分岐が
    // あり、そこで `minWidth <= maxWidth`（逆転するとタイトルが黙って下限を
    // 割る）に依存していた。**幅が固定になったので、その依存ごと消えている**
    // ——枠は常に固定幅の中から取られ、枠が文章を食って下限を割る経路が無い。
    //
    // 残っている不変条件は「一番広い枠を引いてもタイトルが痩せすぎない」だけで、
    // これは `layout.test.ts` が測定器から導いた下限で見ている。**`BOX_WIDTH` を
    // 縮めるか、バッジの語を伸ばすと、そのテストが赤くなる**
    const width = BOX_WIDTH
    const titleWidth = BOX_CONTENT_WIDTH - reserve

    const titleHeight = textHeight(node.text, fonts.title, titleWidth, BOX_TEXT_MAX_LINES)
    const reasonHeight = deferred
      ? textHeight(
          node.events[node.events.length - 1].note,
          fonts.small,
          BOX_CONTENT_WIDTH - ROW_INDENT,
          BOX_TEXT_MAX_LINES,
        )
      : null
```

**`wrapWithin` の import は残す**（`textHeight` が使っている）。**`ISSUE_INSET_X` の import も残す**（座標の組み立てで使っている）。

- [ ] **Step 7: テストが通ることを確認する**

```bash
npx vitest run src/modules/issue-tree/
npx tsc -b
```

Expected: 両方 PASS。`tsc` が未解決参照を報告したら Task 1 Step 3 の一覧に無い参照がある——**報告してから直すこと。**

- [ ] **Step 8: 展開パネルに上限が漏れていないことを確かめる**

```bash
grep -n "textHeight(" src/modules/issue-tree/layout.ts
```

Expected: 定義1件＋呼び出しのうち、**`BOX_TEXT_MAX_LINES` を渡しているのはタイトルと見送りの理由の2件だけ**。パネル側の呼び出しに渡っていたら退行なので直すこと。出力を報告に貼る。

- [ ] **Step 9: コミット**

```bash
git add src/modules/issue-tree/measure.ts src/modules/issue-tree/layout.ts src/modules/issue-tree/layout.test.ts
git commit -m "feat(m24): 課題の箱を全種類 BOX_WIDTH に固定し、3行で打ち切る"
```

---

### Task 6: 箱を抜けたら表示を先頭行へ戻す

**Files:**
- Modify: `src/components/CellInput.tsx:227-230`（`onBlur`）
- Test: `src/components/CellInput.dom.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: なし（`CellInput` の外から見た型は変わらない）

**なぜ要るか。** 3行で打ち切られた箱を編集すると、キャレット追従でブラウザが `textarea` を内部スクロールする。抜けたときに戻さないと、**その箱だけ途中の行から表示されたまま**残り、木を俯瞰したときに文言の頭が読めない。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/CellInput.dom.test.tsx` の末尾に追記する。

```tsx
  /**
   * **jsdom はレイアウトを持たないので `scrollTop` は常に 0 を返す。**
   * そこで、書き込みを観測できるプロパティを要素に差し込んで見る
   *（`LogicTreeEditor.font.dom.test.tsx` が `document.fonts` を差し込むのと
   *  同じ作法。差し込んだものは describe の外へ漏らさない）
   */
  it('フォーカスを外したら表示が先頭行に戻る（scrollTop を 0 にする）', () => {
    render(<CellInput multiline autoSize={false} aria-label="ノード" value="あ" onValueChange={() => {}} />)
    const area = screen.getByLabelText('ノード') as HTMLTextAreaElement
    let scrolled = 40
    Object.defineProperty(area, 'scrollTop', {
      configurable: true,
      get: () => scrolled,
      set: (v: number) => {
        scrolled = v
      },
    })

    expect(scrolled).toBe(40)
    fireEvent.blur(area)
    expect(scrolled).toBe(0)
  })
```

**注意:** `fireEvent` と `screen` が既に import されているか確認し、無ければ `@testing-library/react` の import に足すこと。

- [ ] **Step 2: テストが失敗することを確認する**

```bash
npx vitest run src/components/CellInput.dom.test.tsx
```

Expected: FAIL（`expected 40 to be 0`）。

- [ ] **Step 3: `onBlur` にリセットを足す**

`src/components/CellInput.tsx` の `onBlur`（`:227-230`）を次に置き換える。

```ts
    // 反映されなかった入力（空の名称など）を残さない。抜けたら確定値に戻す
    onBlur: () => {
      composedAt.current = null
      setDraft(null)
      // **表示も先頭行に戻す。** 上限行数で打ち切られた箱（課題ツリーの
      // タイトル・ロジックツリーのノード。M24）を編集すると、キャレット追従で
      // ブラウザが内部スクロールする。戻さないとその箱だけ途中の行から
      // 表示されたまま残り、木を俯瞰したときに文言の頭が読めない。
      // **`autoSize` の欄（表のセル）は内容が常に収まるので影響しない**
      if (areaRef.current !== null) areaRef.current.scrollTop = 0
    },
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
npx vitest run src/components/CellInput.dom.test.tsx
npx tsc -b
```

Expected: 両方 PASS。

- [ ] **Step 5: コミット**

```bash
git add src/components/CellInput.tsx src/components/CellInput.dom.test.tsx
git commit -m "fix(m24): 箱を抜けたら textarea の表示を先頭行へ戻す"
```

---

### Task 7: 文書へ反映する

**Files:**
- Create: `docs/history/m24-core-node-width-lock.md`
- Modify: `docs/open-issues.md`（`:117` の `[M21]` の項、`[M23]` のドロップダウンの項、「次に手を付ける候補」、冒頭の「最終更新」）
- Modify: `docs/overview-rev.md`（9章の「測定層と描画層が同一のフォントトークンを参照」の項）
- Modify: `docs/facet-UI設計ノート.md`（§8 の優先6、D3）

**Interfaces:**
- Consumes: Task 2〜6 で実際に起きたこと
- Produces: なし

- [ ] **Step 1: `open-issues.md` の `[M21]` の項を書き換える**

`:117` の項を次に置き換える。**消さないこと**——D3 の半分は「変えない」と決めて決着させたので、その判断自体が台帳に要る（消すと次の計画者が「まだやっていないだけ」と読む）。

```markdown
- **UI ノートの D（レイアウト固定）は半分が閉じ、半分は「変えない」と決着した**（同 D3）。**ノード幅の固定は M24 で実施した**——課題ツリー・ロジックツリーとも全ノードが 320px 固定になり、右上のバッジは列ごとに縦一列に揃う（`ISSUE_MAX_WIDTH` / `ISSUE_TITLE_MIN_WIDTH` / `NODE_MIN_WIDTH` は消えた）。閉じた箱に出る文章は3行で打ち切られる。**残る半分——テーブル（用語集・エラーカタログ）の行高固定＋2行省略は、M24 で「変えない」と決めた**（人間の裁定）。`CellInput` の `MAX_ROWS = 8` に付いた「行の高さが揃わなくなるが、読めないよりよい」（M10 決定17）を反転させることになり、かつ「省略した全文をどこで読むか」の答えを新設する必要があるため。**これは先送りではなく判断である**——蒸し返すなら、まずその2点に答えを持ってくること `[M24]`
```

- [ ] **Step 2: `[M23]` のドロップダウンの項を消す**

「デザイン」節から、**ドロップダウンのメニュー項目が 14px のまま据え置き**（`[M23]`。決定8）の項を削除する。M23 の実機確認の項目10 が問題なしで判断が確定したため（根拠は `docs/history/m23-core-typography.md` の「実機確認の結果」の節）。

- [ ] **Step 3: 「次に手を付ける候補」へ M24 の実機確認を足す**

末尾に1件足す。

```markdown
- **M24（ツリーのノード幅固定）の実機確認が未実施**——見た目そのものが成果物のマイルストーンなので、確認しないと成否が分からない種類である（issue-tree-m3・M21・M22・M23 と同じ扱い）。[`history/m24-core-node-width-lock.md`](history/m24-core-node-width-lock.md) に設計スペック「検証」の11項目を空のチェックリストのまま写してある。**とくに項目7 を先に見ること**——「4行以上の文言を課題タイトルに打ち、キャレットを動かして4行目以降が読めるか」。`overflow: hidden` の `textarea` でブラウザがキャレットに追従して内部スクロールする、という**未検証の前提**の上に「省略記号を出さず打ち切るだけ」の判断が乗っており、**ここが false なら4行目以降が編集で到達不能になるので、設計判断のやり直しになる**（そのときの逃げ道は、非フォーカス時のフェード（`mask-image`）か、スクロールの許可）。済んだらこの項を消すこと `[M24]`
```

- [ ] **Step 4: 冒頭の「最終更新」を更新する**

`:7` の「最終更新: M23 …」を M24 の記述に差し替える。**消した項・足した項・書き換えた項の数を明記する**（この台帳の様式）。本タスクでは **消したのは1件**（`[M23]` のドロップダウン）、**書き換えたのは1件**（`[M21]` の D の項 → `[M24]`）、**足したのは1件**（次に手を付ける候補の M24 実機確認）。M23 の記述はその後ろに残す。

- [ ] **Step 5: `overview-rev.md` 9章に帰結を足す**

「**キャンバス系ツールでは、測定層と描画層が同一のフォントトークンを参照しなければならない**」の項の末尾に、次を足す。

```markdown
**M24 で、課題ツリー・ロジックツリーのノード幅は固定になった**（`BOX_WIDTH` / `NODE_WIDTH` ＝ どちらも 320。UI ノート D3）。**フォントに追従するのは高さ（行数）だけである。** 幅を内容から導出していたころは、長文ノードだけ幅が3倍になって木の骨格が読めず、右上のバッジの右端が列の中で散って「どれが未決か」を全ノード読まないと拾えなかった。**シーケンスだけは扱いが違う**——`LABEL_MAX_WIDTH`（320）・`ACTOR_MAX_WIDTH`（240）は**上限**のままで、答えセルとガターだけが「幅を導出しない」（`ANSWER_WRAP` は `maxWidth === minWidth`）。**値が同じ 320 でも意味が違うので、3つを共有定数に束ねていない。** この帰結として、**フォントの測り直しを幅で観測するテストは成立しなくなった**——`LogicTreeEditor.font.dom.test.tsx` の観測点は M24 で `style.height` へ移してある（幅で観測したままにすると、番人が黙って何も検証しなくなる）。閉じた箱に出る文章（課題のタイトル・見送りの理由・ロジックのノード）は3行で打ち切られ、**省略記号は出さない**——`text-overflow: ellipsis` も `line-clamp` も `textarea` には効かないため。溢れは `overflow-hidden` で切り、編集中はキャレット移動で全文に届く（`overflow-y: auto` は採らない。Chromium/Windows のスクロールバーが幅を食い、測定の前提より狭い内容幅になって**測定より多く折り返して文字が切れる**）。
```

- [ ] **Step 6: UI ノートを更新する**

`docs/facet-UI設計ノート.md` に2箇所足す。**D3 の本文（rev.3 の再定義を含む）は書き換えない**——決定事項の記録なので、実施の結果は追記の形で置く。

1. **D3 の末尾（`#### rev.3 での再定義` の節の後ろ）に追記の小節**を足す:

```markdown
#### M24 での実施結果（追記）

**ノード幅の固定は実施した。** 課題ツリー・ロジックツリーとも全ノードが 320px 固定になり、右上のバッジは列ごとに縦一列に揃う。閉じた箱に出る文章（課題のタイトル・見送りの理由・ロジックのノード）は3行で打ち切る。**省略記号は出さない**——`text-overflow: ellipsis` も `line-clamp` も `textarea` には効かず、出すには「非フォーカス時だけ `<span>` に差し替える」（`HypothesisRow` の畳まれた行と同じ作法）が要るため。溢れは `overflow-hidden` で切り、編集中はキャレット移動で全文に届く。

**テーブルの行高固定＋2行省略は「変えない」と決着した。** 理由は2つ——(1) `CellInput` の `MAX_ROWS = 8` に付いた明示的な過去判断「行の高さが揃わなくなるが、読めないよりよい」（M10 決定17）を反転させることになる、(2) テーブルには展開パネルに相当する場所が無く、「省略した全文をどこで読むか」の答えを新設する必要がある。**これは先送りではなく判断である。**

**シーケンスは D3 の対象ではない。** ステップラベルは矢印の上に載る文字で「箱が縦に並んでバッジが散る」構造を持たず、答えセルとガターは既に「幅を導出しない」と決着済み（design-notes 論点7）。
```

2. **§8 の実施優先順位の表の直後**（`**着手条件:**` の前）に、実施状況の行を足す。**表そのものには列を足さない**——この表は順位を示すもので、完了を記す様式を持っていない（優先1〜5 にも印は無い）。

```markdown
**実施状況（2026-08-25 時点）:** 優先 1〜6・9 は消化済み（1・3・4 ＝ M21・M22、2・9 ＝ M22、5 ＝ M23、**6 ＝ M24**）。優先6 のうちテーブルの行高は M24 で「変えない」と決着した（D3 の追記節）。残るのは優先7（U4 待ち）・優先8（U1 待ち）・優先10。
```

**この行の 1〜5・9 の帰属は計画が把握している範囲であり、検証していない。** 書く前に `docs/history/` の各申し送りで実際の帰属を確かめ、食い違ったら**正しい方を書いた上で報告すること**（計画の誤りとして扱う）。

- [ ] **Step 7: 申し送りを新規作成する**

`docs/history/m24-core-node-width-lock.md` を作る。**直近の `docs/history/m23-core-typography.md` の節構成に倣う**（「何を作ったか」「実装で確定した事項」「直さずに残したもの」「実機確認について」「次へ」）。必ず含めること:

- **実装で確定した事項**——計画と実装がずれた点を、**ずれた事実として**書く。ずれが1つも無かったなら「計画との差分が無かったところ」としてそう書く（M23 の同名の節に倣う）
- **`LogicTreeEditor.font.dom.test.tsx` の観測点を幅から高さへ移した経緯**（決定4）。Task 2 Step 3 の破壊テストで「番人が本当に番をしている」ことを確かめた結果も書く
- **消えた定数3つ**（`ISSUE_MAX_WIDTH` / `ISSUE_TITLE_MIN_WIDTH` / `NODE_MIN_WIDTH`）と、`ISSUE_TITLE_MIN_WIDTH` が守っていた不変条件がテストへ移った経緯
- **実機確認のチェックリスト11項目を、設計スペックの「検証」から空のまま写す**（M21・M22・M23 と同じ扱い。消し込みの管理は `open-issues.md` が持つ）

- [ ] **Step 8: リンクが生きていることを確認する**

```bash
grep -rn "m24-core-node-width-lock" docs/
```

Expected: `open-issues.md` から `history/m24-core-node-width-lock.md` への参照が解決している。ファイル名の綴り違いが無いこと。

- [ ] **Step 9: コミット**

```bash
git add docs/
git commit -m "docs(m24): 台帳・rev 9章・UI ノートへ反映し、申し送りを置く"
```

---

### Task 8: 通しの検証

**Files:**
- 変更なし（確認のみ。指摘が出たら該当タスクのファイルを直す）

**Interfaces:**
- Consumes: Task 2〜7 のすべて
- Produces: なし

- [ ] **Step 1: 全部を回す**

```bash
npm test
npx tsc -b
npm run lint
```

Expected: 3つとも成功。**出力を報告に貼ること。**

- [ ] **Step 2: Rust 側も回す**

```bash
cd src-tauri && cargo test
```

Expected: 成功。M24 は Rust に触っていないので、ここが赤いなら M24 と無関係な既存の失敗である（Task 1 Step 2 のベースラインと突き合わせて報告する）。

- [ ] **Step 3: 消えた定数の残骸が無いことを確認する**

```bash
grep -rn "ISSUE_MAX_WIDTH\|ISSUE_TITLE_MIN_WIDTH\|NODE_MIN_WIDTH\|NODE_MAX_WIDTH" src/
```

Expected: **`src/` に残ってよいのは `src/core/canvas/wrap.test.ts:42-45` のコメント1箇所だけ**——ただし、そこが名指ししている定数は M24 で消えた／改名されたので、**Task 4 の中で次の文面に直しておくこと**（直し忘れると、存在しない定数を指すコメントが残る）。

```ts
// 移設元: src/modules/logic-tree/measure.ts の wrapText テストのうち、
// 上の sequence 由来のテストにない観点を補う。**当時の** NODE_MAX_WIDTH（320）／
// NODE_INSET_X（11）／NODE_MIN_WIDTH（96）／NODE_INSET_Y（7）の値をそのまま
// リテラルに写している。
//
// **M24 で logic-tree 側は固定幅になった**（NODE_MAX_WIDTH は NODE_WIDTH へ
// 改名、NODE_MIN_WIDTH は削除）。この群が見ているのは `minWidth < maxWidth`
// ——**シーケンスがまだ使っている一般契約**——なので、ここは移設当時の値の
// まま残してある。固定幅（minWidth === maxWidth）の契約は下の別の群が見る
```

`docs/` 側のヒットは対象外（`history/` は不変、過去の計画は記録）。

- [ ] **Step 4: 実機で動かす**

```bash
npm run tauri dev
```

`sample-project/` を開き、課題ツリーとロジックツリーを表示して、設計スペックの「検証」11項目を確認する。**とくに項目7**（4行以上の文言を課題タイトルに打ち、キャレットを動かして4行目以降が読めるか）——**ここが false なら設計判断のやり直しになるので、必ず先に見ること。** 結果を報告に書く。

- [ ] **Step 5: 実機確認の痕跡を捨てる**

```bash
git checkout -- sample-project/
git clean -fdx sample-project/
git status --short
```

Expected: `git status --short` が空。

- [ ] **Step 6: ブランチ全体のレビューを受ける**

REQUIRED SUB-SKILL: `superpowers:requesting-code-review` でブランチ全体のレビューを受け、指摘を潰す。**指摘の反映は `superpowers:receiving-code-review` に従う**（technically questionable な指摘は検証してから受け入れる）。

- [ ] **Step 7: 完了**

REQUIRED SUB-SKILL: `superpowers:finishing-a-development-branch` で統合方法を決める。

---

## 補遺: この計画が前提にしている実測値

**Task 1 で食い違いが見つかったら、辻褄を合わせずに報告すること。**

| 値 | 由来 |
| --- | --- |
| `BOX_WIDTH` = `NODE_WIDTH` = 320 | 既存。M24 で変えない |
| `ISSUE_INSET_X` = `NODE_INSET_X` = 11 | `padding 10` ＋ `border 1` |
| `ISSUE_INSET_Y` = `NODE_INSET_Y` = 7 | `padding 6` ＋ `border 1` |
| 箱の内容幅 = 298 | 320 − 11 × 2 |
| 「仮説なし」バッジ = 70 | `text-sm` 14px で4字 ≒ 56 ＋ `BADGE_PADDING_X` 6×2 ＋ `BADGE_BORDER` 1×2 |
| 「見送り」トグル = 56 | 3字 ≒ 42 ＋ 同じ式の ＋14 |
| `reserve` = `BADGE_GAP`(8) ＋ 枠幅 | 78（仮説なし）／ 64（それ以外） |
| `titleWidth` = 220〜234 | 298 − `reserve` |
| フォント番人の文字数 = 20 | `15 ≦ L ≦ 29`（`L × perChar ≦ 298` が 10 で真・20 で偽）の中央付近 |
