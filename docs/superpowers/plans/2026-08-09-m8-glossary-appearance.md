# M8 実装計画: 用語集エディタの見た目と操作性

> **エージェント向け:** 必須サブスキル: `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` を使い、タスク単位で実装すること。手順はチェックボックス（`- [ ]`）で追跡する。

**目標:** 用語集エディタの見た目と操作性を仕上げ、M8 でいったん用語集の開発を終えられる状態にする（既知の残件13件の決着を含む）。

**方針:** 設計スペック [`2026-08-09-m8-glossary-appearance-design.md`](2026-08-09-m8-glossary-appearance-design.md) の決定1〜17をそのまま実装する。テーブルは `table-fixed` ＋ `<colgroup>` へ骨格を変え、列幅はコアの factory で作ったモジュールスコープの store に置く。折り返しは `CellInput` の `multiline` で行い、警告色の濃さはアルファ合成のコントラスト検算が駆動する。

**技術スタック:** React 19 / TypeScript / Tailwind CSS v4 / Vitest ＋ jsdom ＋ @testing-library/react / Tauri v2（Rust）

## Global Constraints

**これらは全タスクの要件に暗黙に含まれる。**

- **色値の直書き禁止。** 役割名（`text-ink` / `bg-warning` / `border-rule` / `border-grid` …）だけを使う。色値を持ってよいのは `src/styles/palette.css` のみ。`src/styles/conventions.test.ts` が `.tsx?` を走査して機械検査し、`src/styles/palette.test.ts` が `src/index.css` を検査する
- **Tailwind 標準パレット（`bg-red-500` 等）も禁止。** 配色の差し替えに追従しないため
- **フォントサイズは `text-xs` / `text-sm` / `text-base` / `text-lg` の4段のみ。** `text-xl` 以上と任意値 `text-[...]` は `conventions.test.ts` が弾く
- **`src/components/ui/` は shadcn の生成物。手で編集しない**（rev 7章）。variant は呼び出し側で渡す
- **検証コマンドは `npm test` / `npx tsc -b` / `npm run lint` の3本を、対象を絞らずに毎回全部回す。**「このタスクに関係するテストだけ回す」は依存の見落としをそのまま隠す（`docs/lessons-for-planning.md`）
- **テストの期待値に件数を書かない。**「このファイルの `it` がすべて緑」で判定する
- **`sample-project/` は動作確認の遊び場。コミットしない**（`CLAUDE.md`）
- **計画の指示が矛盾していたら、辻褄を合わせずに「計画の矛盾」として報告すること。** ドキュメントやコメントを削って通すのは誤り。既存コードに前例が無いか先に探す（M7 Task 5 の失敗）
- **報告には、実行した検証コマンドとその出力を貼ること。** 「やった」と書くだけの報告は受け付けない（M7 fix round 2 で確立した形）

---

## ファイル構成

**新規作成**

| ファイル | 責務 |
| --- | --- |
| `src/core/column-resize.ts` | 列幅の純関数・store の factory・ポインタ配線のフック。全ツール共用（rev 10章の実装規約） |
| `src/core/column-resize.test.ts` | 上記の単体テスト |
| `src/modules/glossary/columns.ts` | 用語テーブルの列定義（並び・既定幅・幅配列との添字対応） |
| `src/modules/glossary/columns.test.ts` | 上記の単体テスト |
| `src/modules/glossary/column-widths.ts` | 用語集の列幅 store のインスタンスと寸法定数 |
| `docs/history/m8-glossary-editor-appearance.md` | M8 の申し送り |

**変更**

| ファイル | 変更の要点 |
| --- | --- |
| `src/styles/contrast.ts` | アルファ合成（`composite`）と sRGB 伝達関数の公開 |
| `src/styles/palette.test.ts` | 重ね合わせのコントラスト検証、実装との紐づき検査、方眼紙ユーティリティの検査 |
| `src/components/CellInput.tsx` | `multiline`（textarea・5行上限） |
| `src/components/FileList.tsx` | 行の高さ・区切り・選択状態・`aria-describedby` |
| `src/modules/glossary/GlossaryEditor.tsx` | 骨格・額縁・色・折り返し・列幅ハンドル |
| `src/modules/glossary/markdown.ts` | 見出しのエスケープとコメントの訂正 |
| `src/App.tsx` | 方眼紙の地・面の塗り分け・ボタンの variant |
| `src/index.css` | 方眼紙ユーティリティとマス目のサイズ |
| `src/core/app-controller.ts` | `exportMarkdown` の読み直し・`dropModal` の対象・コメントの復元 |
| `src/core/external-change.ts` | 選択外ファイルの通知メッセージの出し分け |
| `src/core/file-naming.ts` | Windows の予約デバイス名と末尾のドット・空白 |
| `src-tauri/src/lib.rs` | `move_to_trash` の非同期化 |
| `tsconfig.test.json` | 説明を JSONC コメントへ |
| `docs/overview-rev.md` / `docs/open-issues.md` / `docs/README.md` | 反映と棚卸し |

---

## Task 1: アルファ合成をコントラスト計算に足す

**Files:**
- Modify: `src/styles/contrast.ts`
- Test: `src/styles/contrast.test.ts`

**Interfaces:**
- Consumes: 既存の `LinearRgb`（`readonly [number, number, number]`）
- Produces: `encodeSrgb(v: number): number` / `decodeSrgb(v: number): number` / `composite(fg: LinearRgb, bg: LinearRgb, alpha: number): LinearRgb`。Task 2 が `composite` を使う

- [ ] **Step 1: 失敗するテストを書く**

`src/styles/contrast.test.ts` の末尾に追記する（既存の `describe` は消さない）。ファイル先頭の `import` に `composite`, `decodeSrgb`, `encodeSrgb` と、型 `LinearRgb` を足すこと。

```ts
describe('アルファ合成', () => {
  const BLACK: LinearRgb = [0, 0, 0]
  const WHITE: LinearRgb = [1, 1, 1]

  it('alpha 1 は前景そのもの、alpha 0 は背景そのもの', () => {
    expect(composite(BLACK, WHITE, 1)).toEqual(BLACK)
    expect(composite(BLACK, WHITE, 0)).toEqual(WHITE)
  })

  it('合成はガンマ補正済み sRGB 上で行う（線形空間で混ぜない）', () => {
    // ガンマ空間で 0.5 に混ざった結果を線形へ戻すと 0.2140。
    // 線形空間で混ぜていたら 0.5 になる——この差がこのテストの主張である。
    // **toHex を経由しない**：黒と白の中点は 127.5 と丸めの境界に乗るため、
    // 期待値が処理系の丸めに依存する（閾値ちょうどの値を置かない）
    const [r, g, b] = composite(BLACK, WHITE, 0.5)
    expect(r).toBeCloseTo(0.214, 4)
    expect(g).toBeCloseTo(0.214, 4)
    expect(b).toBeCloseTo(0.214, 4)
  })

  it('sRGB の伝達関数が往復する', () => {
    for (const v of [0, 0.001, 0.05, 0.25, 0.5, 0.9, 1]) {
      expect(decodeSrgb(encodeSrgb(v))).toBeCloseTo(v, 10)
    }
  })

  it('現行のプレースホルダの重ね（text-warning/70 を warning/10 の面へ）が 2.8:1 付近になる', () => {
    // docs/open-issues.md が実測として記録した値。合成モデルが
    // 正しいことの裏付けであり、壊れたら計算のどこかが狂っている
    const surface = oklchToLinear({ L: 0.961, C: 0.007, H: 88.6 })
    const warning = oklchToLinear({ L: 0.518, C: 0.132, H: 34.6 })
    const face = composite(warning, surface, 0.1)
    expect(contrastRatio(composite(warning, face, 0.7), face)).toBeCloseTo(2.8, 1)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/styles/contrast.test.ts
```

期待: `composite is not a function` 系のエラー、または import 解決の失敗で FAIL。

- [ ] **Step 3: 最小の実装を書く**

`src/styles/contrast.ts` の `toHex` の**直前**に足す。

```ts
/**
 * 線形 sRGB → ガンマ補正済み sRGB（0..1）。CSS Color 4 の伝達関数。
 * `toHex` が内側に持っていた式をここへ出した（合成でも同じ式が要るため）
 */
export function encodeSrgb(v: number): number {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
}

/** ガンマ補正済み sRGB（0..1）→ 線形 sRGB。`encodeSrgb` の逆 */
export function decodeSrgb(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/**
 * 半透明の前景を背景に重ねた「見える色」を返す（M8 決定11）。
 *
 * **合成はガンマ補正済み sRGB の上で行う。** ブラウザが画面へ塗るときの
 * 空間がそこだからで、線形空間で混ぜると実際より明るい色が出る。
 *
 * Tailwind v4 の `bg-warning/25` は
 * `color-mix(in oklab, var(--color-warning) 25%, transparent)` を生成する。
 * `transparent` との混合は premultiplied で行われるため、結果は
 * 「元の色にアルファ 25% が付いたもの」と厳密に等価であり、そのあと
 * ブラウザがこの関数と同じ合成を行う。だから alpha をそのまま渡してよい
 */
export function composite(fg: LinearRgb, bg: LinearRgb, alpha: number): LinearRgb {
  const mix = (i: 0 | 1 | 2): number =>
    decodeSrgb(clamp01(encodeSrgb(fg[i]) * alpha + encodeSrgb(bg[i]) * (1 - alpha)))
  return [mix(0), mix(1), mix(2)]
}
```

続けて `toHex` を書き換え、式の重複を消す。

```ts
/** テストの出力に人が読める色を出すため。判定には使わない */
export function toHex(rgb: LinearRgb): string {
  const channel = (v: number): string =>
    Math.round(clamp01(encodeSrgb(v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`
}
```

- [ ] **Step 4: テストが通ることを確認する**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。**`palette.test.ts` も含めて既存が全部通ること**（`toHex` を書き換えているので、ここで既存の色の出力が変わっていないことが確認される）。

- [ ] **Step 5: コミット**

```bash
git add src/styles/contrast.ts src/styles/contrast.test.ts
git commit -m "半透明の重ね合わせをコントラスト計算に足す"
```

---

## Task 2: 用語集の警告色を確定する

**Files:**
- Modify: `src/styles/palette.test.ts`
- Modify: `src/modules/glossary/GlossaryEditor.tsx`

**Interfaces:**
- Consumes: Task 1 の `composite`
- Produces: `errorCell = 'bg-warning/20'` / `warnCell = 'bg-warning/10'` が確定し、`palette.test.ts` がそれを実装と紐づけて検査する

設計スペックの決定11・12・13、および残件2（定義セル・種別セルが `mark()` を参照していない）を片付ける。

- [ ] **Step 1: 失敗するテストを書く**

`src/styles/palette.test.ts` の `BACKGROUNDS` の定義の下に追記する。import に `composite` を足すこと。

```ts
/**
 * 半透明の重ね合わせ（M8 決定11）。**値は GlossaryEditor.tsx の
 * errorCell / warnCell と一致していなければならない**（下の紐づき検査が見る）
 */
const OVERLAYS = [
  { label: 'エラーセル', alpha: 0.2, className: 'bg-warning/20' },
  { label: '未定義・未分類セル', alpha: 0.1, className: 'bg-warning/10' },
] as const

/**
 * これらの面の上に置く文字。**warning は置かない**（M8 決定12）——
 * 測ると warning/10 の面の上で 4.59:1 しか出ず、同系色が重なって読みにくい
 */
const OVERLAY_FOREGROUNDS = [
  { token: 'ink', use: '本文' },
  { token: 'ink-muted', use: 'プレースホルダ「未定義」' },
] as const

/** 閾値ちょうどを置かない（M7 の教訓）。本文 4.5:1 に3%の余裕 */
const OVERLAY_MIN = 4.5 * 1.03
```

次に、既存の `for (const mode of MODES) { describe(...) }` ブロックの中、`warning-fg` / `ok-fg` のループの**直後**に足す。

```ts
    for (const bg of BACKGROUNDS) {
      for (const overlay of OVERLAYS) {
        for (const fg of OVERLAY_FOREGROUNDS) {
          it(`${fg.token}（${fg.use}）が ${overlay.className} を ${bg} に重ねた面の上で ${OVERLAY_MIN.toFixed(2)}:1 以上`, () => {
            const face = composite(palette.warning, palette[bg], overlay.alpha)
            const ratio = contrastRatio(palette[fg.token], face)
            expect(
              ratio,
              `${toHex(palette[fg.token])} / ${toHex(face)} = ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(OVERLAY_MIN)
          })
        }
      }
    }
```

さらにファイル末尾へ、実装との紐づき検査を足す。

```ts
/**
 * TSX のコメントを落とす。**行番号を保つ必要は無いので単純に消す。**
 *
 * 既存の `stripComments`（このファイルの先頭）は CSS 用で `/* *​/` しか
 * 落とさない。TSX には `//` があるうえ、下の検査が読む GlossaryEditor.tsx は
 * コメントの中で `/25`（不採用にした濃さ）に言及している。コメントを
 * 落とさずに走査すると、説明文が違反として検出される——M7 の Task 5 が
 * 踏んだ「計画自身が機械検査と衝突する」形そのものである
 */
const stripTsComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const glossaryEditorSource = stripTsComments(
  readFileSync(new URL('../modules/glossary/GlossaryEditor.tsx', import.meta.url), 'utf8'),
)

describe('重ね合わせの値が実装と一致している', () => {
  // 上の検算は OVERLAYS の alpha を見ているだけなので、実装が別の濃さを
  // 使っていても緑になる。**検算と実装を繋ぐのはこの検査である**
  for (const overlay of OVERLAYS) {
    it(`GlossaryEditor が ${overlay.className}（${overlay.label}）を使っている`, () => {
      expect(glossaryEditorSource).toContain(overlay.className)
    })
  }

  it('検算していない濃さを使っていない', () => {
    const used = [...glossaryEditorSource.matchAll(/bg-warning\/(\d+)/g)].map((m) => Number(m[1]))
    const known = OVERLAYS.map((o) => Math.round(o.alpha * 100))
    expect([...new Set(used)].filter((u) => !known.includes(u))).toEqual([])
  })

  it('プレースホルダに warning 系の文字色を使っていない（M8 決定12）', () => {
    expect(glossaryEditorSource).not.toMatch(/placeholder:text-warning/)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/styles/palette.test.ts
```

期待: 「`GlossaryEditor` が `bg-warning/20` を使っている」が FAIL（実装はまだ `/25`）。「検算していない濃さを使っていない」も `[25]` を返して FAIL。「プレースホルダに warning 系の文字色を使っていない」も FAIL。**コントラストの検算16件はこの時点で緑になる**（`OVERLAYS` の値そのものは正しいため）。

- [ ] **Step 3: GlossaryEditor の色を実装する**

`src/modules/glossary/GlossaryEditor.tsx` の `errorCell` / `warnCell` の定義を差し替える（`:26-31`）。

```ts
// レベル2エラー（受け入れて赤表示）と warning（undecided / 未定義）は
// どちらも同系色の面で示し、濃さで強度を区別する。
// 波線下線は表記ゆれの「指摘（suggestion）」用に予約されているため使わない
// （glossary-session-notes 論点5）。
//
// **濃さは M8 で確定した**（設計スペック 決定13）。合成後のコントラストは
// src/styles/palette.test.ts が機械検査しており、値を変えるとそちらが落ちる。
// /25 はダークの surface 上で ink-muted が 4.58:1 に落ちるため使えない
const errorCell = 'bg-warning/20'
const warnCell = 'bg-warning/10'

/** 列の境界の縦罫。先頭列には引かない（M8 決定2） */
const colBorder = 'border-l border-grid'
```

次に `mark` の定義（`:244`）を、エラーと warning を合成できる形へ置き換える。

```ts
  const hasError = (index: number, field: string): boolean =>
    marks.get(index)?.has(field) ?? false

  /**
   * セルの面を決める。**エラーは warning より強いので優先する。**
   * 定義セル・種別セルも `hasError` を見る——見ていないと、これらを指す
   * 検証ルールが増えた時点で「issue 一覧には出るのにセルが赤くならない」に
   * なる（M8 でつぶした残件2）。いまは該当ルールが無いので到達しない。
   *
   * **行全体が赤いときはセルを塗らない。** 同じ半透明を二重に重ねると
   * 検証済みの濃さ（warning/20）より濃くなり、コントラストが
   * palette.test.ts の検証範囲の外へ出る。ID 重複と名称重複が同時に
   * 起きた行で実際に発生する組み合わせである
   */
  const cellFace = (index: number, field: GlossaryField, warn = false): string => {
    if (hasError(index, 'id')) return ''
    return hasError(index, field) ? errorCell : warn ? warnCell : ''
  }
```

各セルの `className` を差し替える。

```tsx
              <tr key={rowKey} className={`border-b border-grid align-middle${hasError(index, 'id') ? ` ${errorCell}` : ''}`}>
                <td className={cellFace(index, 'name')}>
```

```tsx
                <td className={`relative ${colBorder} ${cellFace(index, 'kind', term.kind === 'undecided')}`}>
```

```tsx
                <td className={`${colBorder} ${cellFace(index, 'definition', term.definition === '')}`}>
```

```tsx
                <td className={`${colBorder} ${cellFace(index, 'aliases')}`}>
```

```tsx
                <td className={`${colBorder} ${cellFace(index, 'notes')}`}>
```

定義セルの `CellInput` の `className` からプレースホルダの warning 色を外す（`:369`）。

```tsx
                    className={`${cellInput} placeholder:text-ink-muted`}
```

- [ ] **Step 4: 未分類の種別セレクトに面の色を透かす**

ネイティブ `<select>` はブラウザ既定の背景を持ち `bg-transparent` を無視するため、`<td>` に付けた `warnCell` が見えない。`appearance-none` で透かし、消える矢印を SVG で描く。

`<select>` の `className` を差し替える。

```tsx
                    className={`${cellInput} appearance-none pr-6`}
```

`</select>` の直後（`<td>` の中）に矢印を足す。

```tsx
                  {/* appearance-none で消えた矢印を描き直す。**背景画像の
                      data URI は使わない**——色値を書くことになり
                      conventions.test.ts が弾く（M8 決定14） */}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 12 12"
                    className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 fill-none stroke-current stroke-2 text-ink-muted"
                  >
                    <path d="M3 4.5 L6 7.5 L9 4.5" />
                  </svg>
```

- [ ] **Step 5: テストが通ることを確認する**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。特に `palette.test.ts` の紐づき検査3件と、`GlossaryEditor.dom.test.tsx` の既存の `it` が全部通ること。

- [ ] **Step 6: コミット**

```bash
git add src/styles/palette.test.ts src/modules/glossary/GlossaryEditor.tsx
git commit -m "用語集の警告色を実測で確定し、定義セル・種別セルをエラー表示に繋ぐ"
```

---

## Task 3: テーブルの骨格と額縁

**Files:**
- Create: `src/modules/glossary/columns.ts`
- Create: `src/modules/glossary/columns.test.ts`
- Modify: `src/modules/glossary/GlossaryEditor.tsx`

**Interfaces:**
- Consumes: `FIELD_ORDER` / `FIELD_LABELS` / `GlossaryField`（`./fields`）
- Produces: `COLUMNS: readonly ColumnSpec[]` / `WIDTH_INDEX: readonly (number | null)[]` / `DEFAULT_WIDTHS: readonly number[]`。Task 6 が `DEFAULT_WIDTHS` と `WIDTH_INDEX` を使う

設計スペックの決定1・2・3、要望1・2・3・5・7。

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/glossary/columns.test.ts` を新規作成する。

```ts
import { describe, expect, it } from 'vitest'
import { COLUMNS, DEFAULT_WIDTHS, WIDTH_INDEX } from './columns'
import { FIELD_ORDER } from './fields'

describe('用語テーブルの列', () => {
  it('列の並びが FIELD_ORDER と一致する', () => {
    // 表の列と Tab のセル移動順が食い違うと、操作言語が破綻する
    expect(COLUMNS.map((c) => c.field)).toEqual([...FIELD_ORDER])
  })

  it('幅を持たない列は定義列だけ（残りを埋める列）', () => {
    expect(COLUMNS.filter((c) => c.defaultWidth === null).map((c) => c.field)).toEqual([
      'definition',
    ])
  })

  it('WIDTH_INDEX が COLUMNS の添字を幅配列の添字へ写す', () => {
    // 幅配列は固定幅の4列だけを持つので、COLUMNS の添字とは一致しない。
    // ここを取り違えると、掴んだ列と動く列がずれる
    expect(WIDTH_INDEX).toEqual([0, 1, null, 2, 3])
  })

  it('既定幅が並び順で並ぶ', () => {
    expect(DEFAULT_WIDTHS).toEqual([176, 128, 176, 256])
  })

  it('幅を持つ列の数と DEFAULT_WIDTHS の長さが一致する', () => {
    expect(DEFAULT_WIDTHS).toHaveLength(COLUMNS.filter((c) => c.defaultWidth !== null).length)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/modules/glossary/columns.test.ts
```

期待: `Failed to resolve import "./columns"` で FAIL。

- [ ] **Step 3: `columns.ts` を書く**

```ts
import type { GlossaryField } from './fields'

/**
 * 用語テーブルの列（M8 決定1）。
 *
 * **`defaultWidth` が null の列は幅を持たず、残りを埋める。** 定義列だけが
 * これに当たる。他4列が px を持ち定義が残りを取るので、テーブルは常に親幅に
 * 収まり横スクロールが出ない。「定義を広げたい」は他の列を狭めることで達成される。
 * 窓を狭めたときも定義列が縮んで吸収する
 */
export interface ColumnSpec {
  field: GlossaryField
  defaultWidth: number | null
}

export const COLUMNS: readonly ColumnSpec[] = [
  { field: 'name', defaultWidth: 176 },
  { field: 'kind', defaultWidth: 128 },
  { field: 'definition', defaultWidth: null },
  { field: 'aliases', defaultWidth: 176 },
  // 備考は自由記述で長くなりやすいので、名称・別名より広く取る（M7 の要望7）
  { field: 'notes', defaultWidth: 256 },
]

/**
 * COLUMNS の添字 → 幅配列の添字。幅を持たない列は null。
 *
 * **幅配列は固定幅を持つ列だけを並び順で持つ**ので、COLUMNS の添字とは
 * 一致しない。対応をここ1箇所に閉じ、コンポーネント側で添字を計算しない
 */
export const WIDTH_INDEX: readonly (number | null)[] = (() => {
  let n = 0
  return COLUMNS.map((c) => (c.defaultWidth === null ? null : n++))
})()

/** 固定幅を持つ列の既定幅（並び順）。列幅 store の初期値になる */
export const DEFAULT_WIDTHS: readonly number[] = COLUMNS.flatMap((c) =>
  c.defaultWidth === null ? [] : [c.defaultWidth],
)
```

- [ ] **Step 4: テストが通ることを確認する**

```
npx vitest run src/modules/glossary/columns.test.ts
```

期待: PASS。

- [ ] **Step 5: テーブルを `table-fixed` ＋ `<colgroup>` へ組み替える**

`src/modules/glossary/GlossaryEditor.tsx` の `<table>` 以下を置き換える。import に `import { COLUMNS, DEFAULT_WIDTHS, WIDTH_INDEX } from './columns'` を足すこと。

```tsx
      {/* テーブルは surface の面に載せ、外枠だけ rule で締める。内側の罫は
          grid（装飾）に落とす——M7 が rule と grid を2トークンに分けた理由が
          そのまま効く階層である（M8 決定2）。
          overflow-hidden は border-collapse のまま角丸を切るために要る */}
      <div className="overflow-hidden rounded-md border border-rule bg-surface">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            {COLUMNS.map((col, i) => {
              const w = WIDTH_INDEX[i]
              return (
                <col
                  key={col.field}
                  style={w === null ? undefined : { width: DEFAULT_WIDTHS[w] }}
                />
              )
            })}
          </colgroup>
          <thead>
            <tr className="border-b border-rule bg-canvas text-left text-ink">
              {COLUMNS.map((col, i) => (
                <th
                  key={col.field}
                  className={`px-2 py-1 font-bold${i === 0 ? '' : ` ${colBorder}`}`}
                >
                  {FIELD_LABELS[col.field]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
```

`</tbody>` の後を閉じる。

```tsx
          </tbody>
        </table>
      </div>
```

**`<colgroup>` の幅は `DEFAULT_WIDTHS` を直接読む。** Task 6 でここを store の値へ差し替える——このタスクでスタブを置いて次で消すのではなく、既定値が store の初期値としてそのまま生き続ける形になっている。

- [ ] **Step 6: 検証する**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。`GlossaryEditor.dom.test.tsx` は role とアクセシブル名で要素を引いており DOM 構造に依存していないので、骨格の入れ替えでは落ちない。**落ちたら、そのテストが構造に依存している証拠なので、計画の矛盾として報告すること。**

- [ ] **Step 7: コミット**

```bash
git add src/modules/glossary/columns.ts src/modules/glossary/columns.test.ts src/modules/glossary/GlossaryEditor.tsx
git commit -m "用語テーブルを table-fixed + colgroup へ組み替え、額縁と罫線の階層を入れる"
```

---

## Task 4: CellInput の複数行対応

**Files:**
- Modify: `src/components/CellInput.tsx`
- Modify: `src/modules/glossary/GlossaryEditor.tsx`
- Modify: `src/modules/glossary/markdown.ts`
- Test: `src/components/CellInput.dom.test.tsx`, `src/modules/glossary/GlossaryEditor.dom.test.tsx`

**Interfaces:**
- Produces: `CellInputProps.multiline?: boolean`。`onFieldKeyDown` の引数の型が `React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>` へ広がる

設計スペックの決定4・5・6、要望6。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/CellInput.dom.test.tsx` の末尾に追記する。

```ts
describe('CellInput: 複数行', () => {
  it('multiline なら textarea として描かれる', () => {
    render(<CellInput multiline value="" onValueChange={() => {}} aria-label="定義" />)
    expect(screen.getByLabelText('定義').tagName).toBe('TEXTAREA')
  })

  it('multiline でない既定は input のまま', () => {
    render(<CellInput value="" onValueChange={() => {}} aria-label="名称" />)
    expect(screen.getByLabelText('名称').tagName).toBe('INPUT')
  })

  it('textarea でも変換中は親へ値を上げない（IME の巻き戻り防止）', () => {
    const onValueChange = vi.fn()
    render(<CellInput multiline value="" onValueChange={onValueChange} aria-label="定義" />)
    const el = screen.getByLabelText('定義') as HTMLTextAreaElement

    fireEvent.compositionStart(el)
    fireEvent.change(el, { target: { value: 'じゅちゅう' } })
    expect(onValueChange).not.toHaveBeenCalled()

    fireEvent.compositionEnd(el, { target: { value: '受注' } })
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith('受注')
  })

  it('改行を含む値をそのまま扱える（外部が書いた複数行の定義）', () => {
    const onValueChange = vi.fn()
    render(<CellInput multiline value="" onValueChange={onValueChange} aria-label="定義" />)
    fireEvent.change(screen.getByLabelText('定義'), { target: { value: '1行目\n2行目' } })
    expect(onValueChange).toHaveBeenCalledWith('1行目\n2行目')
  })
})
```

`src/modules/glossary/GlossaryEditor.dom.test.tsx` の `describe('GlossaryEditor: 行の操作言語')` の中に追記する。

```ts
  it('定義セルの Enter は行追加として消費される（改行にしない）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('定義（1行目）')
    // fireEvent は preventDefault されると false を返す
    expect(fireEvent.keyDown(cell, { key: 'Enter' })).toBe(false)
    expect(screen.getAllByLabelText(/^名称/)).toHaveLength(3)
  })

  it('定義セルの Shift+Enter は既定動作に委ねる（セル内改行。M8 決定6）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('定義（1行目）')
    // 止めない＝ブラウザが改行を入れる。行は増えない
    expect(fireEvent.keyDown(cell, { key: 'Enter', shiftKey: true })).toBe(true)
    expect(screen.getAllByLabelText(/^名称/)).toHaveLength(2)
  })

  it('定義セルの Alt+Enter も既定動作に委ねる（Excel のセル内改行の手癖）', () => {
    renderEditor(twoTerms)
    const cell = screen.getByLabelText('定義（1行目）')
    expect(fireEvent.keyDown(cell, { key: 'Enter', altKey: true })).toBe(true)
    expect(screen.getAllByLabelText(/^名称/)).toHaveLength(2)
  })
```

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/components/CellInput.dom.test.tsx src/modules/glossary/GlossaryEditor.dom.test.tsx
```

期待: 「multiline なら textarea として描かれる」が `INPUT` を返して FAIL。

- [ ] **Step 3: `CellInput` を実装する**

`src/components/CellInput.tsx` を全面的に書き換える。

```tsx
import { useLayoutEffect, useRef, useState } from 'react'

/** キー処理に必要な入力欄の状態。操作言語の KeyContext に詰め替えて使う */
export interface FieldState {
  empty: boolean
  caretAtStart: boolean
  caretAtEnd: boolean
}

/** 折り返しの上限。これを超えたらセル内スクロールに切り替わる（M8 決定5） */
const MAX_ROWS = 5

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
  onFieldKeyDown?: (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    state: FieldState,
  ) => void
  /**
   * 折り返す（textarea にする）。定義・備考のように自由記述が入る欄だけ true。
   *
   * **名称・別名は false のままにすること。** input はブラウザ既定で改行を
   * 含むペーストから改行を落とすので、「名称に改行が入って Markdown の
   * 見出しと表が壊れる」経路が構造的に塞がる（M8 決定4）
   */
  multiline?: boolean
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
 * - キーの意味は決めない。onFieldKeyDown に状態を添えて渡すだけ。
 *   **Enter を止めるのも呼び出し側の仕事**である——素の Enter は
 *   操作言語が行追加として消費し（preventDefault される）、
 *   Shift+Enter / Alt+Enter は誰も消費しないのでブラウザが改行を入れる
 */
export function CellInput(props: CellInputProps) {
  const { value, onValueChange, sanitize, onFieldKeyDown, multiline, placeholder, className } =
    props
  // 未反映の生入力。null＝表示は親の value をそのまま使う
  const [draft, setDraft] = useState<string | null>(null)
  // 直近に見た親の value。変わったらドラフトを捨てる
  const [seenValue, setSeenValue] = useState(value)
  const composing = useRef(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const [rows, setRows] = useState(1)

  if (value !== seenValue) {
    setSeenValue(value)
    setDraft(null)
  }

  const commit = (raw: string) => {
    const next = sanitize ? sanitize(raw) : raw
    if (next !== null) onValueChange(next)
  }

  /**
   * 内容に合わせて行数を決める。**ピクセルの max-height を書かない**ので、
   * フォントサイズや行間（M7 が確定した 1.65）を変えても自動で追従する。
   *
   * **jsdom はレイアウトを持たない**（scrollHeight が常に 0、lineHeight は
   * 空文字）。そこで抜けないと rows={NaN} を React へ渡すことになるため、
   * 測れないときは何もしない。5行上限が効いているかの確認は実機で行う
   */
  useLayoutEffect(() => {
    const el = areaRef.current
    if (el === null) return
    const style = getComputedStyle(el)
    const lineHeight = Number.parseFloat(style.lineHeight)
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) return
    const paddingTop = Number.parseFloat(style.paddingTop)
    const paddingBottom = Number.parseFloat(style.paddingBottom)
    const padding =
      (Number.isFinite(paddingTop) ? paddingTop : 0) +
      (Number.isFinite(paddingBottom) ? paddingBottom : 0)
    // 測るために一度1行へ戻す。React は次のレンダで rows を書き戻す
    el.rows = 1
    const needed = Math.max(1, Math.round((el.scrollHeight - padding) / lineHeight))
    const next = Math.min(needed, MAX_ROWS)
    el.rows = next
    setRows((prev) => (prev === next ? prev : next))
  }, [draft, value, multiline])

  const shared = {
    className,
    placeholder,
    'aria-label': props['aria-label'],
    'data-cell': props['data-cell'],
    value: draft ?? value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = e.target.value
      setDraft(raw)
      if (composing.current) return
      commit(raw)
    },
    onCompositionStart: () => {
      composing.current = true
    },
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composing.current = false
      const raw = e.currentTarget.value
      setDraft(raw)
      commit(raw)
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const el = e.currentTarget
      onFieldKeyDown?.(e, {
        empty: el.value === '',
        // 折り返しの途中では caretAtStart / caretAtEnd が false になるので、
        // ↑↓ は操作言語に取られずブラウザの行内移動が生きる（M8 決定4）
        caretAtStart: el.selectionStart === 0 && el.selectionEnd === 0,
        caretAtEnd:
          el.selectionStart === el.value.length && el.selectionEnd === el.value.length,
      })
    },
    // 反映されなかった入力（空の名称など）を残さない。抜けたら確定値に戻す
    onBlur: () => setDraft(null),
  }

  if (multiline) {
    return <textarea {...shared} ref={areaRef} rows={rows} />
  }
  return <input {...shared} />
}
```

- [ ] **Step 4: 定義・備考を multiline にし、`focusCell` を textarea に通す**

`src/modules/glossary/GlossaryEditor.tsx` の `focusCell`（`:69`）を直す。

```ts
  if (select && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) el.select()
```

`cellInput` に `resize-none` を足す（textarea の掴み代を出さない）。

```ts
const cellInput =
  'w-full resize-none bg-transparent px-2 py-1 text-ink outline-none focus:bg-surface rounded-sm'
```

定義セルと備考セルの `CellInput` に `multiline` を足す。

```tsx
                  <CellInput
                    multiline
                    className={`${cellInput} placeholder:text-ink-muted`}
                    aria-label={`${FIELD_LABELS.definition}（${row}行目）`}
```

```tsx
                  <CellInput
                    multiline
                    className={cellInput}
                    aria-label={`${FIELD_LABELS.notes}（${row}行目）`}
```

- [ ] **Step 5: `markdown.ts` のコメントを事実に直し、種別の見出しをエスケープに通す（残件1）**

`src/modules/glossary/markdown.ts` の `cell` の JSDoc（`:24-29`）を差し替える。

```ts
/**
 * 表のセルに収める。`|` は列区切りと衝突するのでエスケープし、改行は `<br>` にする。
 * 定義・備考は複数行を入力できる（M8 決定6。Shift+Enter / Alt+Enter）ほか、
 * 外部（Skill・エディタ）も複数行を書きうる——そのまま出すと表が途中で割れて、
 * 貼った先で1件まるごと読めなくなる。
 * バックスラッシュを先に処理する理由：順序を逆にすると、`|` エスケープで入れた `\` まで二重エスケープされる
 */
```

あわせて種別グループの見出し（`:80`）を `heading()` に通す。**`title` は通しているのに種別だけ素通しだった。**

```ts
    // kindLabel は未知の値に生値を返す（kind-labels.ts）。enum を拡張した版の
    // ファイルを古いアプリで開くと、改行入りの kind がそのまま見出しへ出て
    // 「h1 は使わない」（NotePM の階層と衝突する）が崩れる経路になる
    blocks.push(`### ${heading(kindLabel(kind))}`)
```

先に `src/modules/glossary/markdown.test.ts` へ落ちるテストを足すこと。

```ts
  it('未知の種別に改行が入っていても見出しを割らない', () => {
    // enum 外の kind はスキーマ検証で弾かれるので通常は到達しない。
    // glossaryToMarkdown を直接呼ぶことで、enum 拡張時の経路だけを再現する
    const data = {
      schemaVersion: 1,
      type: 'glossary',
      title: 'T',
      terms: [
        { id: 'term_xxxxxxxxxx', name: 'N', kind: '未知\n# 見出し', definition: '', aliases: [], notes: '' },
      ],
    } as unknown as GlossarySchemaVersion1
    const md = glossaryToMarkdown(data)
    expect(md).toContain('### 未知 # 見出し')
    // 改行が残ると `# 見出し` が h1 として混入する
    expect(md).not.toMatch(/^# /m)
  })
```

- [ ] **Step 6: 検証する**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。**特に `CellInput.dom.test.tsx` の既存4件**（IME の巻き戻り、sanitize、Undo の表示反映）が通っていること——これらは input のまま残る名称セルの経路を守っている。

- [ ] **Step 7: コミット**

```bash
git add src/components/CellInput.tsx src/components/CellInput.dom.test.tsx src/modules/glossary/GlossaryEditor.tsx src/modules/glossary/GlossaryEditor.dom.test.tsx src/modules/glossary/markdown.ts src/modules/glossary/markdown.test.ts
git commit -m "定義・備考を折り返せるようにし、種別の見出しをエスケープに通す"
```

---

## Task 5: 列幅のコアモジュール

**Files:**
- Create: `src/core/column-resize.ts`
- Create: `src/core/column-resize.test.ts`

**Interfaces:**
- Produces:
  - `resizeColumns(spec: ColumnResizeSpec): number[]`
  - `createColumnWidthStore(defaults: readonly number[]): ColumnWidthStore`（`{ defaults, getSnapshot, subscribe, set, reset }`）
  - `useColumnResize(options: ColumnResizeOptions): { widths: readonly number[]; getHandleProps: (index: number) => HandleProps }`
  - Task 6 がこの3つすべてを使う

設計スペックの決定7・8。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/column-resize.test.ts` を新規作成する。

```ts
import { describe, expect, it, vi } from 'vitest'
import { createColumnWidthStore, resizeColumns } from './column-resize'

const base = { widths: [100, 100, 100], minWidth: 88, available: 1000, flexMinWidth: 200 }

describe('resizeColumns', () => {
  it('指定した列だけを delta ぶん動かす', () => {
    expect(resizeColumns({ ...base, index: 1, delta: 50 })).toEqual([100, 150, 100])
  })

  it('最小幅より狭くしない', () => {
    expect(resizeColumns({ ...base, index: 0, delta: -500 })).toEqual([88, 100, 100])
  })

  it('残りを埋める列に flexMinWidth を残す（それ以上は広げない）', () => {
    // 他の列が 200、残りを埋める列に 200 を残すので上限は 1000-200-200=600
    expect(resizeColumns({ ...base, index: 0, delta: 5000 })).toEqual([600, 100, 100])
  })

  it('available が 0 以下なら上限を掛けない', () => {
    // jsdom には clientWidth が無い（常に 0）。ここで上限を掛けると
    // キーボード操作のテストが「広げられない」に落ちて意味を失う
    expect(resizeColumns({ ...base, index: 0, delta: 5000, available: 0 })).toEqual([
      5100, 100, 100,
    ])
  })

  it('上限が最小幅を下回っても最小幅は割らない', () => {
    expect(resizeColumns({ ...base, index: 0, delta: 10, available: 250 })).toEqual([88, 100, 100])
  })

  it('範囲外の index は素通しする', () => {
    expect(resizeColumns({ ...base, index: 9, delta: 50 })).toEqual([100, 100, 100])
  })

  it('引数の配列を書き換えない', () => {
    const widths = [100, 100, 100]
    resizeColumns({ ...base, widths, index: 0, delta: 50 })
    expect(widths).toEqual([100, 100, 100])
  })
})

describe('createColumnWidthStore', () => {
  it('getSnapshot は変化していなければ同一参照を返す', () => {
    // useSyncExternalStore は毎回新しい配列を返すと無限ループする
    const store = createColumnWidthStore([10, 20])
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })

  it('set で値が変わり、参照も変わる', () => {
    const store = createColumnWidthStore([10, 20])
    const before = store.getSnapshot()
    store.set([30, 40])
    expect(store.getSnapshot()).toEqual([30, 40])
    expect(store.getSnapshot()).not.toBe(before)
  })

  it('reset で既定へ戻る', () => {
    const store = createColumnWidthStore([10, 20])
    store.set([30, 40])
    store.reset()
    expect(store.getSnapshot()).toEqual([10, 20])
  })

  it('defaults は set で汚れない', () => {
    const store = createColumnWidthStore([10, 20])
    store.set([30, 40])
    expect(store.defaults).toEqual([10, 20])
  })

  it('購読者へ通知し、解除すると届かなくなる', () => {
    const store = createColumnWidthStore([10, 20])
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.set([30, 40])
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    store.set([50, 60])
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/core/column-resize.test.ts
```

期待: `Failed to resolve import "./column-resize"` で FAIL。

- [ ] **Step 3: 純関数と store を実装する**

`src/core/column-resize.ts` を新規作成する。

```ts
import { useCallback, useRef, useSyncExternalStore } from 'react'

/**
 * 表の列幅（rev 10章の実装規約「キーボード・マウス処理は共通フック／
 * モジュールに一元化し、全ツールがそれを使う」のマウス側）。
 *
 * **表を持つツールはこのモジュールを使う。** いまは用語集だけだが、
 * 状態遷移の遷移表が2本目になる。ツールごとに書き直さないこと
 */

/** 幅の変更要求。純関数なので単体でテストできる */
export interface ColumnResizeSpec {
  /** 固定幅を持つ列だけを並び順で持つ配列 */
  widths: readonly number[]
  index: number
  delta: number
  minWidth: number
  /**
   * テーブルが使える内寸(px)。**0 以下＝不明**として上限を掛けない。
   * jsdom にはレイアウトが無く clientWidth が 0 になるため、ここで
   * 上限を掛けるとキーボード操作のテストが「広げられない」に落ちる
   */
  available: number
  /** 幅を持たない列（残りを埋める列）に残す最小幅 */
  flexMinWidth: number
}

/**
 * 1列の幅を変えた結果を返す。**引数の配列は書き換えない。**
 * 仕事は「残りを埋める列が潰れる操作を止めること」に尽きる
 */
export function resizeColumns(spec: ColumnResizeSpec): number[] {
  const { widths, index, delta, minWidth, available, flexMinWidth } = spec
  const next = [...widths]
  const current = next[index]
  if (current === undefined) return next
  const others = next.reduce((sum, w, i) => (i === index ? sum : sum + w), 0)
  const upper =
    available > 0
      ? Math.max(minWidth, available - flexMinWidth - others)
      : Number.POSITIVE_INFINITY
  next[index] = Math.min(Math.max(current + delta, minWidth), upper)
  return next
}

export interface ColumnWidthStore {
  /** 既定幅。1列だけ戻すときの参照元 */
  readonly defaults: readonly number[]
  getSnapshot: () => readonly number[]
  subscribe: (listener: () => void) => () => void
  set: (widths: readonly number[]) => void
  reset: () => void
}

/**
 * 列幅を **アプリを閉じるまで** 保持する外部ストアを作る（M8 決定7）。
 *
 * 各ツールがモジュールスコープで1個持つ。エディタが `key={path}` で
 * 作り直されても値が残り、額縁（App）は列構成を一切知らずに済む。
 * 永続化はしない——「アプリを閉じるまで」がモジュールの生存期間と
 * ちょうど一致するので、保存先やキー命名の設計判断が要らない。
 *
 * **モジュールスコープの可変状態はテスト間で漏れる。**
 * テストの beforeEach で `reset()` を呼ぶこと
 */
export function createColumnWidthStore(defaults: readonly number[]): ColumnWidthStore {
  const initial: readonly number[] = [...defaults]
  // **同一参照を返し続けること。** useSyncExternalStore は getSnapshot が
  // 毎回新しい配列を返すと無限ループする
  let current: readonly number[] = initial
  const listeners = new Set<() => void>()
  const emit = (): void => {
    for (const listener of listeners) listener()
  }
  return {
    defaults: initial,
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    set: (widths) => {
      current = [...widths]
      emit()
    },
    reset: () => {
      current = initial
      emit()
    },
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

```
npx vitest run src/core/column-resize.test.ts
```

期待: PASS。

- [ ] **Step 5: フックを足す**

`src/core/column-resize.ts` の末尾に追記する。**フックには単体テストを書かない**——ポインタイベントの配線は jsdom で検証できず（`setPointerCapture` が未実装）、キーボード側は Task 6 の DOM テストが実際の画面越しに確かめる。

```ts
export interface ColumnResizeOptions {
  store: ColumnWidthStore
  minWidth: number
  flexMinWidth: number
  /** キーボード（←→）1回あたりの変化量(px) */
  step: number
  /** 利用可能幅を測る要素。ドラッグ開始時に1度だけ clientWidth を読む */
  containerRef: React.RefObject<HTMLElement | null>
}

/** ハンドル要素に展開する props。ツール側は配線を書かない */
export interface HandleProps {
  role: 'separator'
  'aria-orientation': 'vertical'
  tabIndex: 0
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
  onDoubleClick: () => void
}

/**
 * 列幅ドラッグの配線（M8 決定8・9・10）。
 *
 * ポインタは `setPointerCapture` で掴んだ要素に固定する——window へ
 * リスナーを張り替えなくて済み、カーソルがテーブルの外へ出ても追従し、
 * `pointercancel` で後始末が入る。
 *
 * **利用可能幅はドラッグ開始時に1度だけ読む。** ドラッグ中に窓は変わらない
 */
export function useColumnResize(options: ColumnResizeOptions): {
  widths: readonly number[]
  getHandleProps: (index: number) => HandleProps
} {
  const { store, minWidth, flexMinWidth, step, containerRef } = options
  const widths = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const drag = useRef<{
    index: number
    startX: number
    startWidths: readonly number[]
    available: number
  } | null>(null)

  const apply = useCallback(
    (index: number, delta: number, from: readonly number[], available: number): void => {
      store.set(
        resizeColumns({ widths: from, index, delta, minWidth, available, flexMinWidth }),
      )
    },
    [store, minWidth, flexMinWidth],
  )

  /** その列だけ既定へ戻す（ダブルクリック・Home）。全列は戻さない */
  const resetColumn = useCallback(
    (index: number): void => {
      const next = [...store.getSnapshot()]
      const fallback = store.defaults[index]
      if (fallback === undefined) return
      next[index] = fallback
      store.set(next)
    },
    [store],
  )

  const getHandleProps = useCallback(
    (index: number): HandleProps => ({
      role: 'separator',
      'aria-orientation': 'vertical',
      tabIndex: 0,
      onPointerDown: (e) => {
        // 既定動作（テキスト選択）を止めないとドラッグ中に選択が走る
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = {
          index,
          startX: e.clientX,
          startWidths: store.getSnapshot(),
          available: containerRef.current?.clientWidth ?? 0,
        }
      },
      onPointerMove: (e) => {
        const d = drag.current
        if (d === null || d.index !== index) return
        // **開始時の幅からの差分で計算する。** 直前の幅に足し込むと
        // クランプに当たった後にカーソルを戻したとき追従しなくなる
        apply(index, e.clientX - d.startX, d.startWidths, d.available)
      },
      onPointerUp: () => {
        drag.current = null
      },
      onPointerCancel: () => {
        drag.current = null
      },
      onKeyDown: (e) => {
        if (e.key === 'Home') {
          e.preventDefault()
          resetColumn(index)
          return
        }
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        apply(
          index,
          e.key === 'ArrowLeft' ? -step : step,
          store.getSnapshot(),
          containerRef.current?.clientWidth ?? 0,
        )
      },
      onDoubleClick: () => resetColumn(index),
    }),
    [store, apply, resetColumn, step, containerRef],
  )

  return { widths, getHandleProps }
}
```

- [ ] **Step 6: 検証する**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。

- [ ] **Step 7: コミット**

```bash
git add src/core/column-resize.ts src/core/column-resize.test.ts
git commit -m "列幅のコアモジュール（純関数・store の factory・ポインタ配線）を足す"
```

---

## Task 6: 用語集に列幅ドラッグを配線する

**Files:**
- Create: `src/modules/glossary/column-widths.ts`
- Modify: `src/modules/glossary/GlossaryEditor.tsx`
- Test: `src/modules/glossary/GlossaryEditor.dom.test.tsx`

**Interfaces:**
- Consumes: Task 5 の `createColumnWidthStore` / `useColumnResize`、Task 3 の `COLUMNS` / `WIDTH_INDEX` / `DEFAULT_WIDTHS`
- Produces: `glossaryColumnWidths: ColumnWidthStore` / `MIN_COLUMN_WIDTH` / `DEFINITION_MIN_WIDTH` / `RESIZE_STEP`

要望4。

- [ ] **Step 1: `column-widths.ts` を書く**

```ts
import { createColumnWidthStore } from '@/core/column-resize'
import { DEFAULT_WIDTHS } from './columns'

/**
 * 用語テーブルの列幅（M8 決定7）。
 *
 * **アプリを閉じるまで保持し、ファイル切替をまたぐ。** GlossaryEditor は
 * App 側で `key={selected.path}` を付けて作り直されるので、エディタ内の
 * state に置くと切り替えのたびに幅が戻る。
 *
 * **type ごとに1つ持つ（ファイルごとではない）。** 同じ列構成なら幅も
 * 揃っている方が自然で、ファイル単位にすると「どのファイルで広げたか」を
 * 覚えていられない。用語集は singleton なので今は差が出ない。
 *
 * **モジュールスコープの可変状態はテスト間で漏れる。**
 * DOM テストの beforeEach で `glossaryColumnWidths.reset()` を呼ぶこと
 */
export const glossaryColumnWidths = createColumnWidthStore(DEFAULT_WIDTHS)

/** 列の最小幅(px)。日本語の見出しが2文字で折り返さない程度 */
export const MIN_COLUMN_WIDTH = 88

/** 定義列（幅を持たない列）に残す最小幅(px) */
export const DEFINITION_MIN_WIDTH = 200

/** キーボード（←→）1回あたりの変化量(px) */
export const RESIZE_STEP = 16
```

- [ ] **Step 2: 失敗するテストを書く**

`src/modules/glossary/GlossaryEditor.dom.test.tsx` の末尾に追記する。import に `beforeEach` を足し、`glossaryColumnWidths` / `RESIZE_STEP` / `DEFAULT_WIDTHS` を import すること。

```ts
describe('GlossaryEditor: 列幅', () => {
  // モジュールスコープの store はテスト間で漏れる
  beforeEach(() => glossaryColumnWidths.reset())

  it('→ で広げ、← で狭められる', () => {
    renderEditor(twoTerms)
    const handle = screen.getByRole('separator', { name: '名称の列幅を変更' })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(glossaryColumnWidths.getSnapshot()[0]).toBe(DEFAULT_WIDTHS[0] + RESIZE_STEP)
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(glossaryColumnWidths.getSnapshot()[0]).toBe(DEFAULT_WIDTHS[0])
  })

  it('Home でその列だけ既定へ戻る', () => {
    renderEditor(twoTerms)
    const name = screen.getByRole('separator', { name: '名称の列幅を変更' })
    const notes = screen.getByRole('separator', { name: '備考の列幅を変更' })
    fireEvent.keyDown(name, { key: 'ArrowRight' })
    fireEvent.keyDown(notes, { key: 'ArrowRight' })
    fireEvent.keyDown(name, { key: 'Home' })
    expect(glossaryColumnWidths.getSnapshot()[0]).toBe(DEFAULT_WIDTHS[0])
    // 他の列は戻さない
    expect(glossaryColumnWidths.getSnapshot()[3]).toBe(DEFAULT_WIDTHS[3] + RESIZE_STEP)
  })

  it('幅を持たない定義列にはハンドルが無い', () => {
    renderEditor(twoTerms)
    expect(screen.queryByRole('separator', { name: '定義の列幅を変更' })).toBeNull()
  })

  it('エディタを作り直しても幅が残る（ファイル切替をまたぐ）', () => {
    renderEditor(twoTerms)
    fireEvent.keyDown(screen.getByRole('separator', { name: '名称の列幅を変更' }), {
      key: 'ArrowRight',
    })
    const widened = glossaryColumnWidths.getSnapshot()[0]
    // App は key={selected.path} でエディタを作り直す。それを再現する
    cleanup()
    renderEditor(twoTerms)
    expect(glossaryColumnWidths.getSnapshot()[0]).toBe(widened)
  })
})
```

- [ ] **Step 3: テストが落ちることを確認する**

```
npx vitest run src/modules/glossary/GlossaryEditor.dom.test.tsx
```

期待: `Unable to find an accessible element with the role "separator"` で FAIL。

- [ ] **Step 4: ハンドルを実装する**

`src/modules/glossary/GlossaryEditor.tsx` に import を足す。

```ts
import { useColumnResize } from '@/core/column-resize'
import {
  DEFINITION_MIN_WIDTH,
  glossaryColumnWidths,
  MIN_COLUMN_WIDTH,
  RESIZE_STEP,
} from './column-widths'
```

コンポーネントの中、`const rowKeys = ...` の前に足す。

```ts
  // 幅を測る対象はテーブルを包む div（M8 決定9）
  const tableRef = useRef<HTMLDivElement>(null)
  const { widths, getHandleProps } = useColumnResize({
    store: glossaryColumnWidths,
    minWidth: MIN_COLUMN_WIDTH,
    flexMinWidth: DEFINITION_MIN_WIDTH,
    step: RESIZE_STEP,
    containerRef: tableRef,
  })
```

包む div に ref を付け、`<colgroup>` の幅の出所を `DEFAULT_WIDTHS` から `widths` へ差し替える。

```tsx
      <div ref={tableRef} className="overflow-hidden rounded-md border border-rule bg-surface">
```

```tsx
                <col
                  key={col.field}
                  style={w === null ? undefined : { width: widths[w] }}
                />
```

`<th>` にハンドルを足す。

```tsx
              {COLUMNS.map((col, i) => {
                const w = WIDTH_INDEX[i]
                return (
                  <th
                    key={col.field}
                    className={`relative px-2 py-1 font-bold${i === 0 ? '' : ` ${colBorder}`}`}
                  >
                    {FIELD_LABELS[col.field]}
                    {/* 幅を持たない定義列にはハンドルを出さない（残りを埋める列なので、
                        他の列を狭めることで広がる）。掴み代が見えるように
                        列の境界へ grid の縦罫を引いてある（M8 決定2） */}
                    {w !== null && (
                      <span
                        {...getHandleProps(w)}
                        aria-label={`${FIELD_LABELS[col.field]}の列幅を変更`}
                        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-rule"
                      />
                    )}
                  </th>
                )
              })}
```

`DEFAULT_WIDTHS` を使わなくなるので、`./columns` からの import を `COLUMNS` と `WIDTH_INDEX` だけに減らす。

- [ ] **Step 5: テストが通ることを確認する**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。

- [ ] **Step 6: コミット**

```bash
git add src/modules/glossary/column-widths.ts src/modules/glossary/GlossaryEditor.tsx src/modules/glossary/GlossaryEditor.dom.test.tsx
git commit -m "用語テーブルの列幅をドラッグとキーボードで変えられるようにする"
```

---

## Task 7: 方眼紙の地と全体の塗り分け

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.tsx`
- Test: `src/styles/palette.test.ts`

設計スペックの決定15・16。

- [ ] **Step 1: 失敗するテストを書く**

`src/styles/palette.test.ts` の `describe('index.css')` の中に追記する。

```ts
  it('方眼紙のユーティリティが grid トークンから色を取る（M8 決定15）', () => {
    expect(indexCss).toMatch(/@utility\s+bg-grid-paper/)
    // 色は必ず役割トークン経由。直書きは同じ describe の別の it が弾く
    expect(indexCss).toMatch(/bg-grid-paper[\s\S]*var\(--grid\)/)
  })

  it('マス目のサイズを持つ', () => {
    expect(indexCss).toMatch(/--grid-size:\s*\d+px/)
  })
```

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/styles/palette.test.ts
```

期待: 追記した2件が FAIL。

- [ ] **Step 3: 方眼紙のユーティリティを書く**

`src/index.css` の `:root { --background: ...` のブロックの中、`--radius: 0.625rem;` の直後に足す。

```css
    /* 方眼紙のマス目。色ではないので palette.css には置かない
       （palette.css は色値だけを持つ）。text-sm の行高（14px × 1.65 ＝ 23.1px）
       とほぼ一致させ、方眼と文字行が揃って見えるようにしている */
    --grid-size: 24px;
```

ファイル末尾（`@layer base { ... }` の後）に足す。

```css
/* =========================================================================
 * 方眼紙の地（rev 9章の確定要素。M8 決定15 で実装）。
 *
 * 「地は方眼、作業する面は無地」という関係を作り、canvas と surface を
 * 明度差ではなく模様の有無で見分けられるようにする——ライトでは
 * 両者の L 差が 0.04（1.13:1）しかなく、罫線でしか分かれて見えなかった。
 *
 * ★ 色値を書かない。★ var(--grid) から取る。
 *   palette.test.ts が index.css の色値直書きを弾く
 * ========================================================================= */
@utility bg-grid-paper {
    background-image:
        repeating-linear-gradient(to right, var(--grid) 0 1px, transparent 1px var(--grid-size)),
        repeating-linear-gradient(to bottom, var(--grid) 0 1px, transparent 1px var(--grid-size));
}
```

- [ ] **Step 4: `App.tsx` を塗り分ける**

`<main>`（`:287`）に方眼紙を敷く。

```tsx
    <main className="flex min-h-screen flex-col bg-canvas bg-grid-paper text-ink">
```

`<header>`（`:288`）を無地の面にする。方眼の上に文字が乗ると読みにくい。

```tsx
      <header className="flex items-center gap-4 border-b border-rule bg-surface px-6 py-3">
```

`<aside>`（`:322`）も無地の面にする。

```tsx
        <aside className="w-64 shrink-0 border-r border-rule bg-surface">
```

ヘッダのボタンのうち「フォルダを開く」以外の4つに `variant="outline"` を渡す（`:291-302`）。ダークでは `--primary` が `--ink`（`oklch(0.85)`）なので、既定 variant のままだとほぼ白い面が5つ並ぶ。主要導線1つだけ塗りにする（M8 決定16）。

```tsx
        <Button onClick={() => void openFolder()}>フォルダを開く</Button>
        <Button
          variant="outline"
          disabled={history === null || !canUndo(history)}
          onClick={() => runHistory('undo')}
        >
          元に戻す
        </Button>
        <Button
          variant="outline"
          disabled={history === null || !canRedo(history)}
          onClick={() => runHistory('redo')}
        >
          やり直す
        </Button>
        <Button variant="outline" disabled={!canExport} onClick={() => void controller.copyMarkdown()}>
          Markdown をコピー
        </Button>
        <Button variant="outline" disabled={!canExport} onClick={() => void controller.exportMarkdown()}>
          Markdown を書き出す
        </Button>
```

- [ ] **Step 5: 検証する**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。**`palette.test.ts` の「色値を直接持たない」が通り続けること**——`repeating-linear-gradient` と `var(--grid)` は色値ではないので引っかからない。

- [ ] **Step 6: コミット**

```bash
git add src/index.css src/App.tsx src/styles/palette.test.ts
git commit -m "方眼紙の地を敷き、面と地を塗り分ける"
```

---

## Task 8: 左メニューの行

**Files:**
- Modify: `src/components/FileList.tsx`
- Test: `src/components/FileList.dom.test.tsx`

設計スペックの決定17（要望8・9）と残件4（アクセシブル名）。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/FileList.dom.test.tsx` の末尾に追記する。既存の `file()` / `setup()` ヘルパをそのまま使う。

```ts
describe('行の説明（aria-describedby）', () => {
  // アクセシブル名は「<名前> を開く」で固定なので、title・「開けない」
  // 「編集不可」・issue 件数バッジはスクリーンリーダーに読まれない（M8 残件4）。
  // description 側で補う
  const description = (name: string): string => {
    const button = screen.getByRole('button', { name: `${name} を開く` })
    const id = button.getAttribute('aria-describedby')
    expect(id).not.toBeNull()
    return document.getElementById(id as string)?.textContent ?? ''
  }

  it('タイトルが読まれる', () => {
    setup([file('用語集.json')])
    expect(description('用語集.json')).toContain('用語集')
  })

  it('issue の件数が読まれる', () => {
    setup([
      file('用語集.json', {
        issues: [{ rule: 'singleton-violation', message: '用語集が2件あります', locations: [] }],
      }),
    ])
    expect(description('用語集.json')).toContain('1')
  })

  it('開けないファイルは「開けない」が読まれる', () => {
    setup([
      file('壊れた.json', {
        result: {
          status: 'rejected',
          type: null,
          title: null,
          reason: 'JSON として解釈できません',
          errors: [],
        },
      }),
    ])
    expect(description('壊れた.json')).toContain('開けない')
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/components/FileList.dom.test.tsx
```

期待: `aria-describedby` が null で FAIL。

- [ ] **Step 3: 行を小さなコンポーネントへ切り出して実装する**

`src/components/FileList.tsx` の import に `useId` を足し、`<ul>` の中身を差し替える。

```tsx
/**
 * ファイル1行。**`useId` を使うために切り出している**——
 * `aria-describedby` は id で結ぶ必要があり、map の中では id を作れない
 */
function FileRow(props: {
  file: ProjectFile
  selected: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const { file } = props
  const descId = useId()
  return (
    // items-stretch で削除ボタンが行の高さいっぱいになる（要望8）。
    // 行の区切りは grid（薄い装飾の罫。要望9）
    <li className="flex items-stretch border-b border-grid">
      <button
        type="button"
        aria-label={`${file.name} を開く`}
        aria-describedby={descId}
        className={`min-w-0 flex-1 border-l-2 px-4 py-2 text-left text-sm ${
          props.selected ? 'border-ink bg-canvas' : 'border-transparent hover:bg-canvas'
        }`}
        onClick={props.onSelect}
      >
        <span className="block truncate text-ink">{file.name}</span>
        <span id={descId} className="block text-xs text-ink-muted">
          {file.result.status === 'editable' && file.result.title}
          {file.result.status === 'rejected' && <span className="text-warning">開けない</span>}
          {file.result.status === 'listOnly' && '編集不可'}
          {file.issues.length > 0 && (
            <span className="ml-1 rounded-sm bg-warning px-1 text-xs text-warning-fg">
              {file.issues.length}
            </span>
          )}
        </span>
      </button>
      {/* 開けない・編集不可のファイルにも削除を出す——単一性違反の解消には
          「壊れている方の用語集を消す」が必要で、そこを塞ぐと外部エディタを
          強いることになる（rev 5章「拒否は最小限に」のファイル操作への適用） */}
      <button
        type="button"
        aria-label={`${file.name} を削除`}
        className="flex shrink-0 items-center px-2 text-xs text-ink-muted hover:bg-canvas hover:text-warning"
        onClick={props.onDelete}
      >
        削除
      </button>
    </li>
  )
}
```

`<ul>` の中身をこれに置き換える。

```tsx
        <ul>
          {props.files.map((file) => (
            <FileRow
              key={file.path}
              file={file}
              selected={file.path === props.selectedPath}
              onSelect={() => props.onSelect(file)}
              onDelete={() => props.onDelete(file)}
            />
          ))}
        </ul>
```

サイドバーが `bg-surface` になった（Task 7）ので、hover と選択は `bg-canvas`（地の色でへこんで見える）に変える。選択行だけ左端に `border-ink` の帯が付く。新規作成ボタンの `hover:bg-surface`（`:46`）も同じ理由で `hover:bg-canvas` にする。

- [ ] **Step 4: 検証する**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。

- [ ] **Step 5: コミット**

```bash
git add src/components/FileList.tsx src/components/FileList.dom.test.tsx
git commit -m "左メニューの行の高さ・区切り・選択状態を整え、行の説明を読ませる"
```

---

## Task 9: 外部変更まわりのコアの穴3件

**Files:**
- Modify: `src/core/external-change.ts`
- Modify: `src/core/app-controller.ts`
- Test: `src/core/external-change.test.ts`, `src/core/app-controller.test.ts`

残件10（`exportMarkdown` のスナップショット）・11（`dropModal` に `delete:`）・12（選択外ファイルのメッセージ）。

- [ ] **Step 1: 失敗するテストを書く（純関数から）**

`src/core/external-change.test.ts` の末尾に追記する。既存の `entry` / `listed` / `scan` / `ledger` ヘルパと定数 `A` / `A2` をそのまま使う。壊れた版だけ新しく定義する。

```ts
/** 同じパスが外部の変更でスキーマ違反に落ちた状態 */
const ABroken = entry('用語集.json', '{ 壊れた')

describe('選択中でないファイルの通知', () => {
  it('外部の変更で開けなくなったら「読み込みました」と言わない', () => {
    // 赤バッジは出るが、メッセージが成功時と同じでは何が起きたか伝わらない
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([ABroken]),
      knownText: ledger({ [A.path]: A.text }),
      selectedPath: null,
      hasUnsavedEdits: false,
    })
    expect(plan.notices.map((n) => n.message)).toEqual([
      '外部の変更でこのファイルを開けなくなりました: 用語集.json',
    ])
  })

  it('開ける内容のままなら従来どおりのメッセージ', () => {
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([A2]),
      knownText: ledger({ [A.path]: A.text }),
      selectedPath: null,
      hasUnsavedEdits: false,
    })
    expect(plan.notices.map((n) => n.message)).toEqual(['外部の変更を読み込みました: 用語集.json'])
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/core/external-change.test.ts
```

期待: 1件目が「外部の変更を読み込みました」を返して FAIL。

- [ ] **Step 3: メッセージを出し分ける**

`src/core/external-change.ts` の `notices`（`:89-92`）を差し替える。

```ts
  const notices = [
    ...changed
      .filter((e) => e.path !== args.selectedPath)
      .map((e) => ({
        key: `external:${e.path}`,
        // **「読み込みました」で済ませない。** 外部の変更でスキーマ違反に
        // 落ちたファイルは一覧に残るが開けなくなる。赤バッジは出るものの、
        // メッセージが成功時と同じでは何が起きたか伝わらない
        message:
          e.result.status === 'rejected'
            ? `外部の変更でこのファイルを開けなくなりました: ${e.name}`
            : `外部の変更を読み込みました: ${e.name}`,
      })),
```

以降（`added` / `removed`）はそのまま。

- [ ] **Step 4: `dropModal` の対象に削除確認を足す**

`src/core/app-controller.ts` の `deleteFile` の中（`:359` の直後）に足す。

```ts
      host.dropModal(`external:${file.path}`)
      // 削除確認そのものも取り下げる。**同じファイルの確認が積まれている**
      // 状態（連打・外部削除との競合）で残すと、確定したときに trashFile が
      // 失敗して「ファイルを削除できませんでした」が出る
      host.dropModal(`delete:${file.path}`)
```

`handleSelectedGone` の中（`:535` の直後）にも同じ理由で足す。

```ts
    host.dropModal(`external:${path}`)
    // 外部で消えた後に古い削除確認を確定すると、trashFile が失敗する
    host.dropModal(`delete:${path}`)
```

- [ ] **Step 5: `exportMarkdown` に読み直しを入れる**

`src/core/app-controller.ts` の `exportMarkdown`（`:745`）の `if (target === null) return` の直後に足し、`io.write` の引数を差し替える。

```ts
      if (target === null) return
      // **ダイアログを出す前のスナップショットで書かない。** ネイティブ
      // ダイアログが開いている数秒〜数分の間に外部変更の取り込みが走ると、
      // doc.data は取り込み前の内容を指す。ここで引き直す
      const fresh = currentDocument()
      if (fresh === null || fresh.path !== doc.path) {
        host.showToast({
          key: 'export',
          message: 'Markdown を書き出しませんでした（保存先を選んでいる間に対象が変わりました）',
        })
        return
      }
```

```ts
      await io.write(target, fresh.module.toMarkdown(fresh.data))
```

- [ ] **Step 6: コントローラ側のテストを書く**

`src/core/app-controller.test.ts` の末尾に追記する。既存の `createHarness` / `note` / `p` / `DIR` をそのまま使う。**`askSavePath` に手動 Promise を挟むことで「ダイアログが開いている間」を再現する。**

```ts
/** askSavePath を手で解決できるようにする（ダイアログが開いている間を再現する） */
function pendingSavePath() {
  let release: (path: string | null) => void = () => {}
  const askSavePath = vi
    .fn<(defaultPath: string) => Promise<string | null>>()
    .mockImplementation(() => new Promise((resolve) => { release = resolve }))
  return { askSavePath, release: (path: string | null) => release(path) }
}

describe('exportMarkdown: 保存ダイアログを開いている間の変化', () => {
  it('その間に内容が変わったら、最新の内容を書く', async () => {
    const { askSavePath, release } = pendingSavePath()
    const h = createHarness({ [p('a.json')]: note('A', '古い本文') }, { askSavePath })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const done = h.controller.exportMarkdown()
    // ダイアログが開いている数秒〜数分の間に外部変更の取り込みが走った状況
    h.setDocument({ schemaVersion: 1, type: 'note', title: 'A', body: '新しい本文' })
    release('C:\\out\\a.md')
    await done
    expect(h.disk.files.get('C:\\out\\a.md')).toBe('## A\n\n新しい本文\n')
  })

  it('その間に選択が変わったら書き出さない', async () => {
    const { askSavePath, release } = pendingSavePath()
    const h = createHarness(
      { [p('a.json')]: note('A'), [p('b.json')]: note('B') },
      { askSavePath },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const done = h.controller.exportMarkdown()
    await h.controller.selectFile(p('b.json'))
    release('C:\\out\\a.md')
    await done
    // b の内容を a.md として書くのは明らかな事故
    expect(h.disk.files.has('C:\\out\\a.md')).toBe(false)
    expect(h.toasts().at(-1)?.message).toMatch(/書き出しませんでした/)
  })
})

describe('削除確認の取り下げ', () => {
  it('削除が確定したら同じファイルの削除確認を取り下げる', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    h.controller.requestDelete(h.files()[0])
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm 以外が積まれた')
    await request.onConfirm()
    // 残すと、外部で消えた後に確定したとき trashFile が失敗する
    expect(h.log).toContain(`dropModal:delete:${p('a.json')}`)
  })
})
```

- [ ] **Step 7: 検証する**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。

- [ ] **Step 8: コミット**

```bash
git add src/core/external-change.ts src/core/external-change.test.ts src/core/app-controller.ts src/core/app-controller.test.ts
git commit -m "外部変更まわりの穴3件を塞ぐ（書き出しのスナップショット・削除確認の取り下げ・通知の出し分け）"
```

---

## Task 10: ファイル名の予約語と削除の非同期化

**Files:**
- Modify: `src/core/file-naming.ts`
- Modify: `src-tauri/src/lib.rs`
- Test: `src/core/file-naming.test.ts`

残件13・9。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/file-naming.test.ts` の末尾に追記する。

```ts
describe('Windows で作れない名前', () => {
  it('予約デバイス名は先頭に _ を足して避ける', () => {
    // CON.json / NUL.json は拡張子を付けても予約のまま。作成に失敗する
    for (const name of ['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT9']) {
      expect(fileNameCandidate(name, 1)).toBe(`_${name}.json`)
    }
  })

  it('予約語を含むだけの名前は避けない', () => {
    expect(fileNameCandidate('CONTENT', 1)).toBe('CONTENT.json')
    expect(fileNameCandidate('用語集CON', 1)).toBe('用語集CON.json')
  })

  it('末尾のドットと空白を落とす（Windows が黙って落とすため）', () => {
    expect(fileNameCandidate('用語集...', 1)).toBe('用語集.json')
    expect(fileNameCandidate('用語集 ', 1)).toBe('用語集.json')
    expect(fileNameCandidate('用語集. .', 1)).toBe('用語集.json')
  })

  it('落とした結果が空になったら _ にする', () => {
    expect(fileNameCandidate('...', 1)).toBe('_.json')
  })

  it('連番は避けた後の名前に付く', () => {
    expect(fileNameCandidate('CON', 2)).toBe('_CON-2.json')
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/core/file-naming.test.ts
```

期待: `CON.json` が返って FAIL。

- [ ] **Step 3: `file-naming.ts` を直す**

`ILLEGAL` の下に足し、`fileNameCandidate` を差し替える。

```ts
/**
 * Windows の予約デバイス名。**拡張子を付けても予約のまま**なので
 * `CON.json` は作成に失敗する。大文字小文字は区別されない
 */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** Windows は末尾のドットと空白を黙って落とす（意図しない名前のファイルができる） */
const TRAILING = /[. ]+$/

/** n 番目の候補名（1件目は連番なし）。連番の付け方をここ1箇所に閉じる */
export function fileNameCandidate(baseName: string, n: number): string {
  let base = baseName.replace(ILLEGAL, '_').replace(TRAILING, '')
  if (base === '') base = '_'
  if (RESERVED.test(base)) base = `_${base}`
  return n === 1 ? `${base}.json` : `${base}-${n}.json`
}
```

- [ ] **Step 4: `move_to_trash` を非同期にする**

`src-tauri/src/lib.rs` の `move_to_trash` を差し替える。

```rust
/// **ワーカースレッドで実行する。** Tauri v2 は `async` でないコマンドを
/// メインスレッド上で実行するため、同期のままだと削除中にウィンドウが固まる。
/// `trash::delete` は Windows ではシェルのファイル操作 API を通り、ゴミ箱の
/// 管理情報の更新・ネットワークパス・Defender のスキャンで実時間がかかりうる。
/// `trash` クレートは呼び出しごとに自前で COM を初期化するのでワーカースレッドで問題ない
#[tauri::command]
async fn move_to_trash(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || trash::delete(&path).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}
```

- [ ] **Step 5: 検証する**

```
npm test
npx tsc -b
npm run lint
cargo check --manifest-path src-tauri/Cargo.toml
```

期待: すべて緑。**`cargo check` は worktree では依存を最初からビルドするので数分かかる。** TypeScript 側は Rust の変更に影響されないが（`invoke` の呼び出し方は変わらない）、Rust のコンパイルエラーはここでしか出ないので飛ばさないこと。

- [ ] **Step 6: コミット**

```bash
git add src/core/file-naming.ts src/core/file-naming.test.ts src-tauri/src/lib.rs
git commit -m "Windows の予約デバイス名を避け、ゴミ箱への移動でウィンドウを固まらせない"
```

---

## Task 11: 小さな負債5件

**Files:**
- Modify: `src/components/CellInput.tsx`
- Modify: `src/components/ConfirmDialog.dom.test.tsx`
- Modify: `src/core/app-controller.ts`
- Modify: `src/core/file-ops.ts`
- Modify: `tsconfig.test.json`
- Modify: `package.json`（`@testing-library/user-event` の削除）

残件3・5・6・7・8。**このタスクにはテストの追加が無い**——挙動を変えないコメント・クエリ・設定の整理だからである。

- [ ] **Step 1: キャレット挙動を仕様として確定させる（残件3）**

`src/components/CellInput.tsx` の `onKeyDown` の中、`caretAtStart` の直前のコメントに追記する。

```ts
        // 折り返しの途中では caretAtStart / caretAtEnd が false になるので、
        // ↑↓ は操作言語に取られずブラウザの行内移動が生きる（M8 決定4）。
        //
        // **選択範囲があるときは両方 false になる（＝行間移動に1打鍵余分に要る）。
        // これは仕様である**——Excel をはじめ表形式の入力欄は同じ挙動で、
        // 「選択したまま矢印でセルを移る」を許すと選択の解除と移動の
        // どちらを意図したのか判別できない（M8 で残件から落とした）
```

- [ ] **Step 2: `ConfirmDialog` のテストのクエリを直す（残件6）**

`src/components/ConfirmDialog.dom.test.tsx:32` を差し替える。`AlertDialogTitle` は h2 なので role で引ける。

```ts
    expect(screen.getByRole('heading', { name: 'ファイルを削除しますか？' })).not.toBeNull()
```

`:33` の説明文は見出しではないので `getByText` のままでよい。

- [ ] **Step 3: コメントの由来と JSDoc の重複を直す（残件7）**

`src/core/app-controller.ts` の `closeCurrentFile` の中、バナーをクリアしている行のコメントに由来への参照を戻す。

```ts
    // 「このファイルが書けていない」というバナーは、そのファイルを離れたら消す
    // （クリア条件の由来は docs/history/m2-core-validation-layer.md の
    //  「saveError のクリア条件」。過去に取りこぼした障害の手がかりなので消さない）
```

`deleteFile` の JSDoc と `src/core/file-ops.ts` の `trashFile` の JSDoc が「切り離しは trash の前に」の説明を重複して持っている。**説明の本体は `trashFile` 側に置き**（そこが実際に順序を実装している）、`deleteFile` 側は参照だけにする。

```ts
  /**
   * ファイルを OS のゴミ箱へ移す（rev 6章。完全削除はしない）。
   *
   * 切り離しを trash の前に行う理由は `trashFile`（src/core/file-ops.ts）の
   * JSDoc に書いてある。**説明を二重に持たないこと**——片方だけ更新されると
   * 食い違う。
   * `closeCurrentFile` を通さないのはここ固有の要点である——あれは保留編集を
   * 書き切る経路で、消したファイルを書き戻して復活させる
   */
```

- [ ] **Step 4: `tsconfig.test.json` の説明を JSONC コメントにする（残件8）**

`extends` 元の `tsconfig.app.json` が `/* */` を使っているので揃える。

```jsonc
{
  "extends": "./tsconfig.app.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.test.tsbuildinfo",
    "types": ["vite/client", "node"],
    "noEmit": true,
    "composite": true
  },
  /* app 側の exclude（テストファイル）を継承すると include が全部落ちるので打ち消す */
  "exclude": [],
  "include": ["src/**/*.test.ts", "src/**/*.test.tsx", "src"]
}
```

- [ ] **Step 5: `@testing-library/user-event` を外す（残件5）**

M8 で書いたテストはすべて `fireEvent` で足りており、キャレット・選択範囲の忠実度を要するテストは書いていない（残件3を仕様として確定させたため、書く動機自体が消えた）。使わない依存は外す。

まず使われていないことを確かめる。

```
git grep -n "user-event" -- src
```

期待: 出力が空。**1件でも出たら外さず、計画の矛盾として報告すること。**

```
npm uninstall @testing-library/user-event
```

- [ ] **Step 6: 検証する**

```
npm test
npx tsc -b
npm run lint
```

期待: すべて緑。

- [ ] **Step 7: コミット**

```bash
git add src/components/CellInput.tsx src/components/ConfirmDialog.dom.test.tsx src/core/app-controller.ts src/core/file-ops.ts tsconfig.test.json package.json package-lock.json
git commit -m "小さな負債を片付ける（キャレット仕様の確定・テストのクエリ・コメントの重複・未使用依存）"
```

---

## Task 12: ドキュメントの更新

**Files:**
- Modify: `docs/overview-rev.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/README.md`
- Create: `docs/history/m8-glossary-editor-appearance.md`

**このタスクは実機確認（Task 13）の後に行うこと。** 行の密度の判断と実機で見つかった事実が申し送りに入る。

- [ ] **Step 1: rev 9章を更新する**

- `grid` の説明を「方眼紙の線」から「**方眼紙の線と、行の区切りのような薄い装飾罫**」へ広げる（`rule` との境界は「情報を伝えるか否か」のまま）
- 「確定要素」の「方眼紙背景は採用」を、**実装済み**として書き換える（`bg-grid-paper` ユーティリティ、マス目 24px、`canvas` と `surface` を明度差ではなく模様の有無で分ける設計）
- 「表記ゆれの『指摘（suggestion）』は warning 系統の弱い表現で表す。具体はトークン確定時に詰める」を決着させる：**エラーは `warning/20` の面、未定義・未分類は `warning/10` の面**で表し、波線下線は suggestion 用に予約したまま残す
- 半透明の重ね合わせが `palette.test.ts` の検証対象に入ったことを書く（`bg-warning/25` 等が対象外という但し書きを消す）

- [ ] **Step 2: rev 10章を更新する**

「適用例」の段落（用語集の Tab＝セル間移動）に並べて、ツール固有キーを明記する。

> 用語集の定義・備考は複数行を入力できるため、**Shift+Enter / Alt+Enter をセル内改行に充てる**（Enter は行追加のまま）。ファミリー標準および グローバル層のキーと衝突しない拡張である。

- [ ] **Step 3: rev 11章を更新する**

テーブルの行間の密度を実機確認（Task 13 の項目5）で決めた結果を反映し、残る検証項目から外す。P型・D型の識別性と投影時の読みやすさは残す。

- [ ] **Step 4: `open-issues.md` を棚卸しする**

**消す（19件）**:

- 「将来の機能を作った瞬間に踏むもの」から: `markdown.ts` の見出しエスケープ、`mark(index, field)` の未参照
- 「挙動の穴」から: `exportMarkdown` のスナップショット、`dropModal` の `delete:`、選択外ファイルの通知、`move_to_trash` の同期実行、`CellInput` のキャレット（**仕様として確定したので消す**）
- 「アクセシビリティ」から: `FileList` の行ボタンのアクセシブル名（節ごと空になる）
- 「デザイン」から: 方眼紙背景、`canvas` と `surface` の差、ダークの `primary` ボタン面、未分類の種別セレクト、セルの不透明度、`palette.test.ts` の半透明未検証
- 「小さな負債」から: `user-event` の未使用、`ConfirmDialog` のクエリ、`closeCurrentFile` のコメントと JSDoc 重複、`tsconfig.test.json`
- 「将来の機能を作った瞬間に踏むもの」から: `file-naming.ts` の予約デバイス名

**足す（1件）**:

> - **textarea の高さ計算が初回マウントで行数ぶんの強制リフローを起こす**（`src/components/CellInput.tsx`）: `multiline` のセル（定義・備考）は `useLayoutEffect` で `scrollHeight` を読むため、行数 × 2 回のレイアウト計算が初回に走る。5行上限が1回あたりのコストの頭を押さえているが、数百行では体感しうる。`checkConsistency` の再実行（性能の項）と同じ規模の話 `[M8]`

**残る10件**（消さないこと。理由も添える）: コアのテスト欠落5件、`ensureFileOfType` とインライン登録、`resolveCommand` の macOS 非対称、`checkConsistency` の再実行、P型・D型の識別性、`ok` の未参照。

冒頭の「最終更新」を M8 完了時点に直す。

- [ ] **Step 5: 申し送りを書く**

`docs/history/m8-glossary-editor-appearance.md` を新規作成する。**追記専用の記録**なので、以後変えない前提で書く。少なくとも次を含めること。

- M7 の要望9件と残件13件をどう決着させたか（消した19件の内訳）
- **プレースホルダの色が `text-warning` にできなかった経緯**（設計スペックの決定12を計画着手前の実測で覆した。`warning/10` の面の上で 4.59:1、素の `surface` 上でも 5.28:1 しかない）
- **合成モデルが `open-issues.md` の実測値 2.80:1 を再現したこと**（モデルの妥当性の裏付け）
- `/25` がダークの `surface` 上で ink-muted 4.58:1 に落ちるため使えず、`/20` に確定したこと
- **jsdom で検証できなかった2つ**（5行上限・ポインタドラッグ）と、キーボード操作を足したことで幅の反映だけは検証できるようになった経緯
- 実機確認（Task 13）で確定した事実——特に行の密度
- 実装中に見つかった計画の誤り

- [ ] **Step 6: `docs/README.md` のマイルストーン表を更新する**

M8 の行から「（未着手）」を外し、申し送りへリンクする。

```markdown
| [M8](history/m8-glossary-editor-appearance.md) | 用語集エディタの見た目と操作性 | 用語集 |
```

- [ ] **Step 7: 検証する**

```
npm test
npx tsc -b
npm run lint
git status --short
```

期待: すべて緑。`sample-project/` に差分が無いこと（あれば `git checkout -- sample-project/ && git clean -fd sample-project/`）。

- [ ] **Step 8: コミット**

```bash
git add docs/
git commit -m "M8 の確定内容をドキュメントへ反映する"
```

---

## Task 13: 実機確認（人間の作業）

**サブエージェントは GUI を操作できない。この作業は人間が行う。** Task 11 まで終わった時点で実施し、結果を Task 12 の申し送りに書く。

```
npm run tauri dev
```

- [ ] **1. 方眼紙の濃度** — ライト・ダーク両モードで見る。会議で投影したときにうるさくないか。マス目 24px が細かすぎ／粗すぎないか
- [ ] **2. 面と地の分かれ方** — ライトで `canvas` と `surface` が模様の有無で見分けられているか（L 差 1.13:1 のままでも問題ないか）
- [ ] **3. 列幅ドラッグ** — ハンドルを掴めるか、カーソルが `col-resize` に変わるか、ダブルクリックでその列だけ戻るか、定義列が 200px より狭くならないか
- [ ] **4. 折り返しと5行上限** — 長い定義を入れて5行で止まりセル内スクロールになるか（**jsdom で検証できない項目**）。窓を狭めたとき定義列が縮んで吸収するか
- [ ] **5. セル内改行** — 定義セルで Shift+Enter と Alt+Enter で改行が入り、素の Enter では行が増えること。**IME で変換確定した直後の Enter が行追加に誤爆しないこと**
- [ ] **6. 行の密度** — `py-1` のままでよいか。**ここで決めて rev 11章を更新する**（rev が残している検証項目）
- [ ] **7. 警告色** — 未分類の種別セレクトが warn 色を纏っているか。プレースホルダ「未定義」が読めるか。エラーセルと警告セルの強度差が見て分かるか
- [ ] **8. ダークのヘッダ** — 「フォルダを開く」だけが塗りで、他4つが outline になっていて白く浮いていないか
- [ ] **9. 削除** — ファイルを削除する間ウィンドウが固まらないこと（Task 10）
- [ ] **10. 後片付け** — `git checkout -- sample-project/ && git clean -fd sample-project/` を実行し、`git status --short` が空になること

---

## 完了条件

- `npm test` / `npx tsc -b` / `npm run lint` / `cargo check --manifest-path src-tauri/Cargo.toml` がすべて緑
- Task 13 の実機確認10項目がすべて確認済み
- `docs/open-issues.md` が19件減り1件増えている（残り10件）
- `docs/history/m8-glossary-editor-appearance.md` が存在する
- `git status --short` が空（`sample-project/` の痕跡が無い）
