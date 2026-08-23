# M21 役割トークン v2 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 面・文字・線を無彩色にし、彩度を欠落（黄）／無効（赤）／着信（青）／支持（緑）の4軸だけに限った役割トークン 15 個へ、契約・パレット・使用箇所・共通部品・Skill・文書を一斉に移す。

**Architecture:** トークン層（`palette-requirements.ts` → `palette.css` → `index.css` → `theme.ts`）を先に新体系で緑にし、次に `Badge` / `Chip` を共通部品として置き、モジュールごとに旧トークン（`warning` / `ok` / `surface-accent`）を振り分け表に従って付け替える。最後に `conventions.test.ts` の新検査を有効化して「旧名 0 件・チャネル違反 0 件・透過 0 件」を機械で固定する。

**Tech Stack:** Tailwind v4（`@theme inline`）、vitest（`src/styles/*.test.ts` の走査検査・`*.dom.test.tsx`）、`src/styles/contrast.ts`（OKLab・CVD シミュレーション）、Node 型ストリップ import（`palette-fit.mjs`）

**Spec:** `docs/superpowers/plans/2026-08-23-m21-design-tokens-v2-design.md`

## Global Constraints

- 色値を持ってよいのは `src/styles/palette.css` だけ。値は `oklch(L C H)`（L は 0..1 の小数、`%` とアルファ不可）
- 役割トークンは 15 個：`canvas` `surface` `surface-muted` `ink` `ink-muted` `ink-faint` `rule` `grid` `missing` `invalid` `pending` `judge-yes` `judge-yes-fg` `judge-no` `judge-no-fg`
- 無彩色トークン（`judge-no` 系まで）は C ≤ 0.01
- 欠落・無効・着信は線と文字だけ（`bg-missing` 等を作らない）。判断は面だけ（`text-judge-yes` 等を作らない。`-fg` は除く）
- 役割トークンへの透過（`text-ink-muted/70` 等）は禁止
- `<Button>` の variant は `outline` / `ghost` のみ（`components/ui/` の shadcn 生成物は手で整形しない——rev 7章。`destructive` variant は使用 0 件なので許可しない。削除は生の `<button>`＋`hover:text-invalid` で表す）
- フォントサイズの段は `text-xs` / `text-sm` / `text-base` / `text-lg` / `text-2xl` のまま（B で変える。A では触らない）
- コントラストの余裕 `MARGIN = 1.03` は据え置き
- 閾値ちょうどの値を置かない
- Tailwind のクラス名は完全な字面で書く（`` `text-${x}` `` を組み立てない）
- **Task 1〜8 の間、画面の一部が無色になる（旧名のクラスは CSS が生成されない）。** マージの単位はブランチ全体で、途中のコミットを単独で出荷しない
- 検証は毎タスク `npm test && npx tsc -b && npm run lint` 全体を回す（対象を絞らない）
- 実機確認（Task 11）は人間の作業。サブエージェントは Tauri の GUI を操作できない
- 計画の指示が矛盾していたら辻褄を合わせず「計画の矛盾」として報告する

---

## 着手前スキャンで確定した事実（計画が依拠する実物）

- `warning` / `ok` / `surface-accent` をクラス名として使っている箇所（テスト・`src/types/`・`consistency.ts`・`warnings.ts`・コメント行を除く）は **24 行**（`grep -rn "warning\|surface-accent\|text-ok\|bg-ok" src --include=*.tsx --include=*.ts` から取った。Task 9 の検査4がこの数を 0 に固定する）：
  - `App.tsx:934`（更新ボタンの強調面）／`:972`（バナー）／`:1055`（開けないファイル）
  - `components/FileList.tsx:81,84,98,190`、`IssueBanner.tsx:33`、`TerminalPane.tsx:52`、`TerminalTab.tsx:284`
  - `core/terminal/theme.ts:49`
  - `modules/error-catalog/ErrorCatalogEditor.tsx:43,44,401`、`modules/glossary/GlossaryEditor.tsx:50,51,287`
  - `modules/issue-tree/badge-styles.ts:34-37`、`HypothesisRow.tsx:198`、`IssueBox.tsx:98,102`
  - `modules/logic-tree/NodeBox.tsx:32`、`modules/sequence/ActorRefCell.tsx:48`、`GutterSlot.tsx:37`、`SequenceEditor.tsx:820,869`
- `bg-ink text-canvas`（黒塗りの選択状態）は 3 箇所：`GlossaryEditor.tsx:230`、`ErrorCatalogEditor.tsx:331,354`。**`App.tsx:934` は選択トグルではなく「更新あり」の強調**なので、Chip にせず `bg-surface-muted` に置き換えるだけ（スペック決定3の「4箇所」は 3＋1 の誤記。この計画が正）
- 役割トークンの透過は 3 箇所：`FileHeader.tsx:55`（`text-ink-muted/70`）、`IssueTreeEditor.tsx:926` / `LogicTreeEditor.tsx:310` / `SequenceEditor.tsx:799`（`bg-surface/80`。**4 箇所**——スペックの「×2」は数え落とし。3 つのキャンバスがそれぞれ持つ）
- `<Button>` は `App.tsx:859`（variant 無し＝primary）、`App.tsx:862,872` と `ExportMenu.tsx:66,73`（`outline`）。`destructive` variant の使用は 0 件
- `badgeClass` の呼び出しは 6 箇所：`HypothesisRow.tsx:172,208,266`、`IssueBox.tsx:176`、`IssueTreeEditor.tsx:917,1012`
- `BADGE_HEIGHT = 20`（`measure.ts:82`。**行**の高さ。バッジ自身は `h-[18px]`）、`BADGE_PADDING_X = 6`、`BADGE_BORDER = 1`（`measure.ts:78-79`。`layout.ts:155` が幅の算出に使う）
- 仮の色値は `src/styles/contrast.ts` の `contrastRatio` / `deltaEok` / `simulate` で検算済み（下の Task 1 Step 4 の値で、ライト・ダークとも全要件を満たす）。**検算で分かった設計上の帰結：黄（欠落）と赤（無効）を D型で 0.10 以上離すには色相だけでは足りず、明度差が要る。** 同じ L 0.50 では D型の色差が 0.013 しか出なかった。そのため `invalid` はライトで L 0.38（暗い赤）、`missing` は L 0.49 に置いてある。実機で「無効の赤が黒っぽい」と出たら、閾値を 0.08 に下げて `invalid` を L 0.42 前後まで上げる（スペック決定5「色差の逃げ道」）

---

### Task 1: トークン層——契約・パレット・`index.css`・端末テーマ

**Files:**
- Modify: `src/styles/palette-requirements.ts`
- Modify: `src/styles/palette.test.ts`
- Modify: `src/styles/palette.css`
- Modify: `src/index.css:39-50`（`@theme` の色）、`:95-146`（shadcn 導出）、`:149-157`（`@layer base`）
- Modify: `src/core/terminal/theme.ts:46-49`
- Modify: `src/core/terminal/theme.test.ts:12-21,87`
- Modify: `.claude/skills/palette-retheme/scripts/palette-fit.mjs`（import と検算部。SKILL.md の文章は Task 10）
- Test: `src/styles/palette.test.ts`、`src/styles/palette-fit.smoke.test.ts`、`src/core/terminal/theme.test.ts`

**Interfaces:**
- Produces: `palette-requirements.ts` の `TOKENS`（15個）、`BACKGROUNDS`（3面）、`REQUIREMENTS`、`FACE_REQUIREMENTS`、`FACE_PAIRS`、`DISTINCT_PAIRS`、`DISTINCT_MIN`、`ACHROMATIC`、`ACHROMATIC_MAX_C`。Tailwind ユーティリティ `bg-surface-muted` `text-missing` `border-invalid` `text-pending` `bg-judge-yes` `text-judge-yes-fg` `bg-judge-no` `text-judge-no-fg` 等
- 消えるもの: `OVERLAYS` `OVERLAY_FOREGROUNDS` `OVERLAY_MIN` `HEADING_FACE` `HEADING_FACE_FOREGROUNDS`、トークン `warning` `warning-fg` `ok` `ok-fg` `surface-accent`

- [ ] **Step 1: 契約を書き換える**

`src/styles/palette-requirements.ts` の `TOKENS` から `HEADING_FACE_FOREGROUNDS` までを次で置き換える（`stripCssComments` / `readTokenBlock` / `MODES` / `MARGIN` は据え置き）。

```ts
export const TOKENS = [
  'canvas',
  'surface',
  'surface-muted',
  'ink',
  'ink-muted',
  'ink-faint',
  'rule',
  'grid',
  'missing',
  'invalid',
  'pending',
  'judge-yes',
  'judge-yes-fg',
  'judge-no',
  'judge-no-fg',
] as const

export type Token = (typeof TOKENS)[number]

/**
 * 背景に対して満たすべきコントラスト。
 *
 * **`grid` がここに無いのは意図的。** 方眼紙の線は純粋な装飾であり、
 * WCAG 1.4.11（情報を伝える非テキスト UI 要素は 3:1）の対象外。
 * むしろ薄いことに意味がある（M7 設計スペック 決定2）
 */
export const REQUIREMENTS = [
  { token: 'ink', min: 4.5, use: '本文・見出し' },
  { token: 'ink-muted', min: 4.5, use: '抑えた文字' },
  // **非アクティブな内容の文字と枠。** WCAG 1.4.3 は非アクティブ UI 部品を
  // 本文の 4.5:1 から免除しているが、読めなくてよいわけではない——
  // 「いま作業する面ではない」と読めて、かつ消えて見えない段として 3:1 を課す。
  // **アクティブな本文に使わない**（使うと本文の保証を割る）
  { token: 'ink-faint', min: 3.0, use: '非アクティブの文字・枠（抑制された配下）' },
  { token: 'rule', min: 3.0, use: 'セル境界・入力枠' },
  // 意味色3軸は線と文字にしか使わないが、**文字**に使う以上 4.5:1 が要る
  { token: 'missing', min: 4.5, use: '欠落（未定義・未決・仮説なし・保留）の線と文字' },
  { token: 'invalid', min: 4.5, use: '無効（重複・参照切れ・整合性違反）の線と文字' },
  { token: 'pending', min: 4.5, use: '着信（返答していない入力）の線と文字' },
] as const

/**
 * **背景は canvas / surface / surface-muted の3面を見る。**
 * テーブルもカードもモーダルも surface の上に乗るので canvas だけでは足りない
 * （ダークの rule を canvas だけ見て決めたとき surface 上で 2.997:1 と 3:1 を割った）。
 * surface-muted（一段沈んだ面）も、選択中タブ・種類見出し・見送りの箱として
 * 文字とバッジと罫線が載る汎用の面なので、同じ集合に入れる。
 * M8 の `surface-accent` を集合に入れなかった判断（淡い緑を選べなくなる）は、
 * 面が無彩色になった今は効かない——無彩色の面なら 3:1 / 4.5:1 は明度だけで作れる
 */
export const BACKGROUNDS = ['canvas', 'surface', 'surface-muted'] as const

/**
 * 判断の面に載せる文字色の要件。judge-yes-fg / judge-no-fg は自分の面にしか
 * 載らない専用の文字色で、`BACKGROUNDS` に対して測る意味が無い
 */
export const FACE_REQUIREMENTS = [
  { token: 'judge-yes-fg', face: 'judge-yes', min: 4.5, use: '支持の面の文字' },
  { token: 'judge-no-fg', face: 'judge-no', min: 4.5, use: '棄却の面の文字' },
] as const

/**
 * 面どうしの明度差。支持と棄却は正反対の結論なので、白黒印刷でも
 * 判別できる 3:1 を課す（UI ノート D15「支持を明るく、棄却を暗く」）
 */
export const FACE_PAIRS = [{ a: 'judge-yes', b: 'judge-no', min: 3.0 }] as const

/**
 * 意味色どうしの識別。**標準・P型・D型のすべてで** OKLab の色差が
 * `DISTINCT_MIN` 以上であること。M7 は warning/ok の色差を印字するだけで
 * 失敗させなかった（M7 決定4）が、意味色が4つに増えた今は
 * 「色は当てにならない」と学習された瞬間に警告機能が死ぬので、門番にする。
 *
 * **満たせないときは 0.08 まで下げてよい。** 下げたらこの定数の隣に
 * 実測値と理由を書く。閾値を黙って消さない（設計スペック 決定5）
 */
export const DISTINCT_PAIRS = [
  { a: 'missing', b: 'invalid' },
  { a: 'missing', b: 'pending' },
  { a: 'missing', b: 'judge-yes' },
  { a: 'invalid', b: 'pending' },
  { a: 'invalid', b: 'judge-yes' },
  { a: 'pending', b: 'judge-yes' },
] as const
export const DISTINCT_MIN = 0.1

/**
 * 無彩色でなければならないトークン。「色を持つのは意味だけ」（rev 9章）を
 * 機械検査にする。微かな暖色（M7 の canvas は C 0.012）も装飾なので弾く
 */
export const ACHROMATIC = [
  'canvas',
  'surface',
  'surface-muted',
  'ink',
  'ink-muted',
  'ink-faint',
  'rule',
  'grid',
  'judge-no',
  'judge-no-fg',
] as const
export const ACHROMATIC_MAX_C = 0.01

/**
 * 閾値ちょうどを置かない（M7 の教訓）。**この余裕は `palette-fit.mjs` の
 * 提案（`fitLightness` に渡す条件）とも共有する。** 値を変えるならここ
 * 1箇所を直せば両方に効く——書き写すと片方だけ直したときに食い違う。
 */
export const MARGIN = 1.03
```

（`MARGIN` は既存の位置のまま残してよい。重複定義しないこと。）

- [ ] **Step 2: `palette.test.ts` を新しい表で書き直す**

import を次にする（`composite` は不要になる）。

```ts
import {
  contrastRatio,
  deltaEok,
  linearToOklch,
  oklchToLinear,
  parseOklch,
  simulate,
  toHex,
  type LinearRgb,
  type Vision,
} from './contrast'
import {
  ACHROMATIC,
  ACHROMATIC_MAX_C,
  BACKGROUNDS,
  DISTINCT_MIN,
  DISTINCT_PAIRS,
  FACE_PAIRS,
  FACE_REQUIREMENTS,
  MODES,
  readTokenBlock,
  REQUIREMENTS,
  stripCssComments,
  TOKENS,
} from './palette-requirements'
```

`for (const mode of MODES) { describe(`${mode.label}のコントラスト`, …) }` の中の **OVERLAYS のループを消し**、`FACE_REQUIREMENTS` のループの後に次を足す。

```ts
    for (const pair of FACE_PAIRS) {
      it(`${pair.a} と ${pair.b} の面どうしが ${pair.min}:1 以上（白黒でも判別できる）`, () => {
        const ratio = contrastRatio(palette[pair.a], palette[pair.b])
        expect(ratio, `${toHex(palette[pair.a])} / ${toHex(palette[pair.b])} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(pair.min)
      })
    }
```

`describe('見出しの面（surface-accent）', …)` と `describe('warning と ok の識別（記録のみ。失敗させない）', …)` を**丸ごと消し**、代わりに次の2つを置く。

```ts
describe('意味色の識別（標準・P型・D型）', () => {
  for (const mode of MODES) {
    const palette = toPalette(mode.pattern, mode.label)
    for (const pair of DISTINCT_PAIRS) {
      for (const vision of VISIONS) {
        it(`${mode.label}の ${pair.a} と ${pair.b} が ${vision} で ΔE ${DISTINCT_MIN} 以上`, () => {
          const d = deltaEok(simulate(palette[pair.a], vision), simulate(palette[pair.b], vision))
          // NaN は toBeGreaterThanOrEqual で落ちる（比較が false になる）ので別建ての検査は要らない
          expect(d, `ΔE = ${d.toFixed(3)}`).toBeGreaterThanOrEqual(DISTINCT_MIN)
        })
      }
    }
  }
})

describe('無彩色（色を持つのは意味だけ）', () => {
  for (const mode of MODES) {
    const palette = toPalette(mode.pattern, mode.label)
    for (const token of ACHROMATIC) {
      it(`${mode.label}の ${token} の C が ${ACHROMATIC_MAX_C} 以下`, () => {
        const c = linearToOklch(palette[token]).C
        expect(c, `C = ${c.toFixed(4)}`).toBeLessThanOrEqual(ACHROMATIC_MAX_C)
      })
    }
  }
})
```

`describe('index.css', …)` の最初の it を `destructive が invalid に紐づいている` に変え、`/--destructive:\s*var\(--invalid\)\s*;/` を期待する。

ファイル末尾の `stripTsComments` 以降（`glossaryEditorSource` / `componentSourceFiles` / `describe('重ね合わせの値が実装と一致している', …)`）は**丸ごと消す**——半透明の面が無くなるので検算対象が無い。`readdirSync` / `path` / `fileURLToPath` の import も不要になるので消す（lint が未使用 import を弾く）。

- [ ] **Step 3: テストが「トークンが無い」で落ちることを確認する**

Run: `npx vitest run src/styles/palette.test.ts`
Expected: FAIL。`ライトに全トークンがあり…` が `--surface-muted が無い` 等で落ちる

- [ ] **Step 4: `palette.css` を書き換える**

ヘッダコメントの「役割（rev 9章）」一覧と「由来は Morphos…」の段落を次で置き換え、`:root` / `.dark` を次の値にする。**コメント内に `oklch(` を書かないこと**（`conventions.test.ts` は CSS を見ないが、`palette.test.ts` の `readTokenBlock` はコメントを落としてから読むので実害は無い。それでも値は1箇所に）。

```css
/* =========================================================================
 * facet のパレット（M21 で全面改訂。設計スペック
 * docs/superpowers/plans/2026-08-23-m21-design-tokens-v2-design.md）
 *
 * ★ このファイルは色値だけを持つ。★ 半径・余白・フォント・行間を書かない。
 * ★ 色値を持ってよいのはこのファイルだけ。★ コンポーネントは役割名を使う。
 *   src/styles/conventions.test.ts が直書きを機械的に弾く。
 *
 * 値は `oklch(L C H)` の形で書く。L は 0..1 の小数（% 不可）、アルファ不可。
 *
 * 役割（rev 9章。15個）:
 *   面（無彩色）   canvas / surface / surface-muted（一段沈んだ面）
 *   文字（無彩色） ink / ink-muted / ink-faint（3:1。本文に使わない）
 *   線（無彩色）   rule（3:1）/ grid（方眼。装飾）
 *   欠落軸（黄）   missing   線と文字だけ。面にしない
 *   無効軸（赤）   invalid   線と文字だけ
 *   着信軸（青）   pending   線と文字だけ
 *   判断軸         judge-yes / judge-yes-fg（緑の面）、judge-no / judge-no-fg（無彩色の面）
 *
 * 色を持つのは意味だけ。無彩色は C 0 で置く（palette.test.ts が C <= 0.01 を課す）。
 * 黄は白地で 4.5:1 を満たすと黄土色になる。これは承知のうえ（付箋の黄）。
 * 黄と赤は D型色覚では色相で分かれないので**明度で**分ける——invalid を
 * missing より一段暗く置いてある（検算: 同じ L 0.50 では D型の ΔE が 0.013）。
 *
 * 結果は src/styles/palette.test.ts が検証する（palette-requirements.ts が契約）。
 * ライトとダークは独立に置く。反転による自動生成はしない（rev 9章）。
 * ダークは M21 では設計対象外——要件を満たす値を置いただけで、吟味していない。
 * ========================================================================= */

:root {
    /* ライト。無彩色は C 0 */
    --canvas: oklch(0.95 0 0);
    --surface: oklch(0.985 0 0);
    --surface-muted: oklch(0.91 0 0);
    --ink: oklch(0.18 0 0);
    --ink-muted: oklch(0.42 0 0);
    --ink-faint: oklch(0.58 0 0);           /* 3面で 3:1 に MARGIN の余裕 */
    --rule: oklch(0.58 0 0);                /* surface-muted 上でも 3:1 */
    --grid: oklch(0.89 0 0);                /* canvas 上 1.20:1（M8 の目安 1.17 と同程度） */

    --missing: oklch(0.49 0.12 85);         /* 黄土。surface-muted 上で 4.5:1 */
    --invalid: oklch(0.38 0.15 30);         /* 暗い赤。missing と D型で分けるための明度 */
    --pending: oklch(0.48 0.14 250);        /* 青 */

    --judge-yes: oklch(0.87 0.08 165);      /* 明るい青緑。赤・黄土と P/D 型で離す */
    --judge-yes-fg: oklch(0.18 0 0);
    --judge-no: oklch(0.35 0 0);            /* チャコール。judge-yes と 7.9:1 */
    --judge-no-fg: oklch(0.985 0 0);
}

.dark {
    /* ダーク。独立に置いた値。M21 では吟味していない */
    --canvas: oklch(0.17 0 0);
    --surface: oklch(0.205 0 0);
    --surface-muted: oklch(0.27 0 0);
    --ink: oklch(0.88 0 0);
    --ink-muted: oklch(0.70 0 0);
    --ink-faint: oklch(0.55 0 0);
    --rule: oklch(0.56 0 0);
    --grid: oklch(0.25 0 0);

    --missing: oklch(0.82 0.13 85);
    --invalid: oklch(0.68 0.15 30);
    --pending: oklch(0.75 0.12 250);

    --judge-yes: oklch(0.80 0.10 165);
    --judge-yes-fg: oklch(0.17 0 0);
    --judge-no: oklch(0.36 0 0);
    --judge-no-fg: oklch(0.95 0 0);
}
```

- [ ] **Step 5: `index.css` を新トークンへ**

`@theme inline` の `--color-*` 12 行を次の 15 行にする。

```css
    --color-canvas: var(--canvas);
    --color-surface: var(--surface);
    --color-surface-muted: var(--surface-muted);
    --color-ink: var(--ink);
    --color-ink-muted: var(--ink-muted);
    --color-ink-faint: var(--ink-faint);
    --color-rule: var(--rule);
    --color-grid: var(--grid);
    --color-missing: var(--missing);
    --color-invalid: var(--invalid);
    --color-pending: var(--pending);
    --color-judge-yes: var(--judge-yes);
    --color-judge-yes-fg: var(--judge-yes-fg);
    --color-judge-no: var(--judge-no);
    --color-judge-no-fg: var(--judge-no-fg);
```

shadcn 導出（`:root { … }`）を次のように変える（変える行だけ示す。他は据え置き）。

```css
    /* ボタン・選択状態。primary は ink に紐づけるが、facet は塗りボタン
       （default variant）を使わない（M21。conventions.test.ts が弾く）。
       shadcn の他の部品（メニューの選択行等）が accent / muted を参照するので、
       「一段沈んだ面」をそこへ流す */
    --primary: var(--ink);
    --primary-foreground: var(--surface);
    --secondary: var(--surface-muted);
    --secondary-foreground: var(--ink);
    --muted: var(--surface-muted);
    --muted-foreground: var(--ink-muted);
    --accent: var(--surface-muted);
    --accent-foreground: var(--ink);

    /* 破壊的アクション。無効軸の赤を借りる唯一の例外（rev 9章 規約5）。
       palette.test.ts が紐づきを検査する */
    --destructive: var(--invalid);

    --chart-1: var(--ink);
    --chart-2: var(--ink-muted);
    --chart-3: var(--rule);
    --chart-4: var(--missing);
    --chart-5: var(--judge-yes);

    --sidebar-accent: var(--surface-muted);
```

`@layer base` の `body` に数字の等幅を足す（UI ノート D9。「数値表示箇所に」ではなく一括——facet に比例数字でなければならない箇所は無く、撒き忘れの方が害が大きい）。

```css
  body {
    @apply bg-background text-foreground;
    /* 数字を等幅にする（UI ノート D9）。No 列・件数・#番号が縦に揃う。
       一括で当てる——比例数字でなければならない箇所は facet に無い */
    font-variant-numeric: tabular-nums;
    }
```

- [ ] **Step 6: 端末テーマを `surface-muted` へ**

`src/core/terminal/theme.ts:46-49` を次にする。

```ts
  // 選択の面は「一段沈んだ面」。ink / ink-muted が載ることを
  // palette.test.ts が BACKGROUNDS の一員として検証している
  const selectionBackground = hex('--surface-muted')
```

`src/core/terminal/theme.test.ts` の `LIGHT` / `DARK` の `'--surface-accent'` キーを `'--surface-muted'` に変え、値は `'oklch(0.91 0 0)'` / `'oklch(0.27 0 0)'` にする。87 行目付近のコメント「`--surface-accent` **単独**の欠落」と、その it が欠落させるキー名も `--surface-muted` に変える。

- [ ] **Step 7: `palette-fit.mjs` を新しい表に追従させる**

import から `HEADING_FACE` `HEADING_FACE_FOREGROUNDS` `OVERLAY_FOREGROUNDS` `OVERLAY_MIN` `OVERLAYS` と `composite` を消し、`ACHROMATIC` `ACHROMATIC_MAX_C` `DISTINCT_MIN` `DISTINCT_PAIRS` `FACE_PAIRS` と `linearToOklch` を足す。

コントラスト部（`for (const req of REQUIREMENTS)`）の中の `overlayEntry` と `headingEntry` のブロック（`const overlayEntry = …` から `headingEntry` の `if` の閉じまで）を消す——`conditions` は `BACKGROUNDS` だけで足りる。

「重ね合わせ」と「見出しの面」のセクション（`lines.push('  重ね合わせ')` から `lines.push('')` まで、`lines.push(`  見出しの面…`)` から `lines.push('')` まで）を消し、代わりに「面の文字」のセクションの後に次を置く。

```js
  // -- 面どうし --------------------------------------------------------------
  lines.push('  面どうし')
  for (const pair of FACE_PAIRS) {
    const ratio = contrastRatio(linear[mode.key][pair.a], linear[mode.key][pair.b])
    const ok = ratio >= pair.min
    if (!ok) failCount += 1
    lines.push(
      `    ${ok ? '✓' : '✗'} ${pad(pair.a, 12)}/ ${pad(pair.b, 9)}${fmtRatio(ratio).padStart(8)}  (>= ${pair.min.toFixed(2)})`,
    )
  }
  lines.push('')

  // -- 無彩色 ----------------------------------------------------------------
  lines.push(`  無彩色（C <= ${ACHROMATIC_MAX_C}）`)
  for (const token of ACHROMATIC) {
    const c = linearToOklch(linear[mode.key][token]).C
    const ok = c <= ACHROMATIC_MAX_C
    if (!ok) failCount += 1
    lines.push(`    ${ok ? '✓' : '✗'} ${pad(token, 12)}C = ${c.toFixed(4)}`)
  }
  lines.push('')
```

末尾の「ΔE（合否は付けない）」セクションを次に置き換える（**合否を付ける**）。

```js
// -- 意味色の識別（標準・P型・D型で ΔE >= DISTINCT_MIN） ------------------------
lines.push(`意味色の識別（ΔE >= ${DISTINCT_MIN}、標準 / P型 / D型）`)
for (const mode of MODE_KEYS) {
  for (const pair of DISTINCT_PAIRS) {
    const values = VISIONS.map((vision) =>
      deltaEok(simulate(linear[mode.key][pair.a], vision), simulate(linear[mode.key][pair.b], vision)),
    )
    const ok = values.every((v) => v >= DISTINCT_MIN)
    if (!ok) failCount += 1
    const measured = VISIONS.map((vision, i) => `${vision}=${values[i].toFixed(3)}`)
    lines.push(`  ${ok ? '✓' : '✗'} ${pad(mode.label, 6)}${pad(`${pair.a} / ${pair.b}`, 22)}${measured.join('  ')}`)
  }
}
lines.push('')
```

`src/styles/palette-fit.smoke.test.ts` の「要件を1つ破った下書き」は、**旧 12 トークンの完全なパレット**を文字列で持っている（`:root` と `.dark` の両方）。これを Step 4 の 15 トークンの値で書き直し、壊す箇所は同じく**ライトの `--ink` を `oklch(0.9 0 0)`** にする（コントラスト要件だけを破る）。`.dark` 側は Step 4 の値をそのまま写す。

- [ ] **Step 8: 全テスト・型・lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: `palette.test.ts` / `palette-fit.smoke.test.ts` / `theme.test.ts` が緑。**`conventions.test.ts` も緑のまま**（旧名の検査はまだ無い）。`tsc` は通る（クラス名は型に現れない）。画面は無色の箇所が出るが、この時点では許容（Global Constraints）

- [ ] **Step 9: Commit**

```bash
git add src/styles/palette-requirements.ts src/styles/palette.test.ts src/styles/palette.css src/index.css src/core/terminal/theme.ts src/core/terminal/theme.test.ts .claude/skills/palette-retheme/scripts/palette-fit.mjs
git commit -m "feat(core): 役割トークン v2——無彩色の面・文字・線と、意味色4軸（黄・赤・青・緑）の契約とパレット"
```

---

### Task 2: `Badge` 共通部品

**Files:**
- Create: `src/components/Badge.tsx`
- Create: `src/components/Badge.dom.test.tsx`

**Interfaces:**
- Produces:
  - `export type BadgeVariant = 'open' | 'hold' | 'invalid' | 'pending' | 'yes' | 'no' | 'deferred' | 'faint'`
  - `export function badgeClass(variant: BadgeVariant): string`——`<button>` に敷くとき用
  - `export function Badge(props: { variant: BadgeVariant; children: ReactNode; className?: string }): JSX.Element`——`<span>` を描く
  - `export const BADGE_BOX_HEIGHT = 18`、`BADGE_PADDING_X = 6`、`BADGE_BORDER = 1`——課題ツリーの `measure.ts` がここから読む（Task 3）

- [ ] **Step 1: テストを書く**

`src/components/Badge.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Badge, badgeClass, BADGE_BOX_HEIGHT } from './Badge'

afterEach(cleanup)

describe('Badge', () => {
  it('文言をそのまま描く', () => {
    render(<Badge variant="open">未決</Badge>)
    expect(screen.getByText('未決')).not.toBeNull()
  })

  it('開いている語（open / hold / invalid / pending）は面を持たず、決着した語（yes / no）は面を持つ', () => {
    // 「開いているものは線、決着したものは面」（rev 9章 規約2）を部品の口で固定する
    for (const v of ['open', 'hold', 'invalid', 'pending'] as const) {
      expect(badgeClass(v), v).not.toMatch(/\bbg-/)
    }
    expect(badgeClass('yes')).toMatch(/\bbg-judge-yes\b/)
    expect(badgeClass('no')).toMatch(/\bbg-judge-no\b/)
  })

  it('未決だけが破線', () => {
    expect(badgeClass('open')).toMatch(/\bborder-dashed\b/)
    for (const v of ['hold', 'invalid', 'pending', 'yes', 'no', 'deferred', 'faint'] as const) {
      expect(badgeClass(v), v).not.toMatch(/\bborder-dashed\b/)
    }
  })

  it('高さの定数がクラスと一致している（layout が読む値）', () => {
    expect(badgeClass('open')).toContain(`h-[${BADGE_BOX_HEIGHT}px]`)
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/components/Badge.dom.test.tsx`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

`src/components/Badge.tsx`:

```tsx
import type { ReactNode } from 'react'

/**
 * 状態のバッジ（rev 9章 M21）。**意味だけを受け、形は部品が持つ。**
 *
 * 語彙は「開いているものは線、決着したものは面」：
 *   open     欠落・まだ見ていない（未定義・未決・仮説なし）  missing の破線
 *   hold     欠落・見たが決められない（保留）                missing の実線
 *   invalid  無効（重複・参照切れ・整合性違反）              invalid の実線
 *   pending  着信（返答していない入力＝未判断）              pending の実線
 *   yes      支持                                            judge-yes の面
 *   no       棄却                                            judge-no の面
 *   deferred 見送り                                          surface-muted の面・rule の枠
 *   faint    抑制された配下（いま作業する面ではない）        ink-faint の枠と文字
 *
 * **クラス名は完全な字面で書くこと。** Tailwind の走査は静的なので、
 * `text-${色}` のように組み立てると生成 CSS に載らず画面だけが無色になる。
 *
 * `h-[18px]` は任意値だが、conventions.test.ts が弾く任意値は `text-[...]` だけ。
 * 文字は `text-xs`（段は B で変わる。ここでは触らない）
 */
export type BadgeVariant = 'open' | 'hold' | 'invalid' | 'pending' | 'yes' | 'no' | 'deferred' | 'faint'

/** バッジ自身の高さ（px）。課題ツリーの measure.ts が行の高さをここから導く */
export const BADGE_BOX_HEIGHT = 18
/** 横の余白（px-1.5 = 6px）と枠線（1px）。幅の算出（layout.ts）が使う */
export const BADGE_PADDING_X = 6
export const BADGE_BORDER = 1

const base =
  'inline-flex h-[18px] items-center rounded border px-1.5 text-xs leading-none font-medium whitespace-nowrap'

// yes / no は面なので枠を透明にする（border を base に持たせ、全語で高さと幅の計算を揃えるため）
const faces: Record<BadgeVariant, string> = {
  open: 'border-dashed border-missing text-missing',
  hold: 'border-missing text-missing',
  invalid: 'border-invalid text-invalid',
  pending: 'border-pending text-pending',
  yes: 'border-transparent bg-judge-yes text-judge-yes-fg',
  no: 'border-transparent bg-judge-no text-judge-no-fg',
  deferred: 'border-rule bg-surface-muted text-ink-muted',
  faint: 'border-ink-faint text-ink-faint',
}

export function badgeClass(variant: BadgeVariant): string {
  return `${base} ${faces[variant]}`
}

export function Badge(props: { variant: BadgeVariant; children: ReactNode; className?: string }) {
  return (
    <span className={`${badgeClass(props.variant)}${props.className === undefined ? '' : ` ${props.className}`}`}>
      {props.children}
    </span>
  )
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npx vitest run src/components/Badge.dom.test.tsx && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/Badge.tsx src/components/Badge.dom.test.tsx
git commit -m "feat(core): Badge 共通部品——意味を variant で受け、形は部品が持つ"
```

---

### Task 3: 課題ツリーを `Badge` と新トークンへ移す

**Files:**
- Delete: `src/modules/issue-tree/badge-styles.ts`
- Create: `src/modules/issue-tree/badge-variant.ts`
- Modify: `src/modules/issue-tree/measure.ts:77-82`
- Modify: `src/modules/issue-tree/HypothesisRow.tsx:5,172,186-198,208,266`
- Modify: `src/modules/issue-tree/IssueBox.tsx:3,97-103,176`
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx:35,136,917,1012`
- Test: `src/modules/issue-tree/*.test.ts(x)` 全部（既存。クラス名に依存していないはず——依存していたら「計画の矛盾」として報告）

**Interfaces:**
- Consumes: Task 2 の `Badge` / `badgeClass` / `BADGE_BOX_HEIGHT` / `BADGE_PADDING_X` / `BADGE_BORDER`、`derive.ts` の `BadgeGroup`（`'yes' | 'no' | 'hold' | 'open' | 'deferred'`）と `OpenKind`（`'hypothesis' | 'result' | 'hold' | 'judgement'`）
- Produces: `badgeVariantOf(group: BadgeGroup, suppressed: boolean): BadgeVariant`、`chipVariantOf(kind: OpenKind): BadgeVariant`

- [ ] **Step 1: 課題ツリーの語彙 → 部品の variant の対応を置く**

`src/modules/issue-tree/badge-variant.ts`:

```ts
import type { BadgeVariant } from '@/components/Badge'
import type { BadgeGroup, OpenKind } from './derive'

/**
 * 課題ツリーの語彙（`BadgeGroup` / `OpenKind`）を共通部品の variant へ写す。
 * **部品は課題ツリーの語彙を知らない**——この対応だけがモジュール側に残る。
 *
 * 抑制された配下は群を問わず `faint`（「いま作業する面ではない」）。
 * `opacity-*` で薄くしない——検算したコントラストを割る
 */
export function badgeVariantOf(group: BadgeGroup, suppressed: boolean): BadgeVariant {
  if (suppressed) return 'faint'
  return group
}

/**
 * 帯の集計チップ。仮説なし・未決は「まだ見ていない」（破線）、保留は
 * 「見たが決められない」（実線）、**未判断は着信**（レビューの FB に
 * 返答していない＝欠落ではなく受信箱。rev 9章 M21）
 */
export function chipVariantOf(kind: OpenKind): BadgeVariant {
  switch (kind) {
    case 'hold':
      return 'hold'
    case 'judgement':
      return 'pending'
    case 'hypothesis':
    case 'result':
      return 'open'
  }
}
```

`BadgeGroup` の5語（`yes` `no` `hold` `open` `deferred`）はすべて `BadgeVariant` に含まれるので、`return group` は型が通る。通らなければ `derive.ts` の `BadgeGroup` が変わっている——「計画の矛盾」として報告。

- [ ] **Step 2: `measure.ts` の定数を部品から読む**

`src/modules/issue-tree/measure.ts:77-82` を次にする。

```ts
import { BADGE_BORDER, BADGE_BOX_HEIGHT, BADGE_PADDING_X } from '@/components/Badge'

/** バッジの横の余白と枠線は部品（Badge.tsx）が持つ。文言との空き（gap-2 = 8px）だけここ */
export { BADGE_BORDER, BADGE_PADDING_X }
export const BADGE_GAP = 8
/** バッジが座る行の高さ。バッジ自身（`BADGE_BOX_HEIGHT`）の上下に 1px ずつ */
export const BADGE_HEIGHT = BADGE_BOX_HEIGHT + 2
```

（import はファイル先頭へ。`BADGE_HEIGHT` が 20 のままであることを `layout` のテストが暗黙に前提にしているので、値は変えない。）

- [ ] **Step 3: 呼び出し側を置き換える**

`HypothesisRow.tsx`:
- `import { badgeClass } from './badge-styles'` → `import { Badge } from '@/components/Badge'` と `import { badgeVariantOf } from './badge-variant'`
- 172 行・208 行：`<span className={badgeClass(group, props.suppressed)}>{BADGE_LABELS[group]}</span>` → `<Badge variant={badgeVariantOf(group, props.suppressed)}>{BADGE_LABELS[group]}</Badge>`
- 266 行：`<span className={badgeClass(badgeGroupOf(event.kind), true)}>` → `<Badge variant="faint">`（第2引数が `true` 固定なので群は見ていない。`badgeGroupOf` の import が他で未使用になれば消す）
- 186-198 行：`<div className="absolute" style={inBox(placement.text)}>` を `<div className={`absolute${props.invalid ? ' outline-1 -outline-offset-1 outline-invalid' : ''}`} style={inBox(placement.text)}>` にし、`CellInput` の `className` から `${props.invalid ? 'bg-warning/20' : ''}` を外す。直前のコメント「整合性検証の赤は検算した `bg-warning/20`…」は「整合性検証の無効は外側の箱に `invalid` の輪郭（面は塗らない。rev 9章 規約2）」に書き換える。**`outline` を textarea 自身に当てないのは `inputClass` が `outline-none` を持つため**（どちらが勝つかは生成 CSS の順序で決まる——M8 が cascade layers で踏んだ形）

`IssueBox.tsx`:
- import を `Badge` ＋ `badgeVariantOf` に
- 97-103 行：
  ```ts
  const face = props.invalid
    ? 'border-invalid bg-surface text-ink'
    : props.suppressed
      ? 'border-ink-faint bg-surface text-ink-faint'
      : placement.deferral !== null
        ? 'border-rule bg-surface-muted text-ink'
        : 'border-rule bg-surface text-ink'
  ```
  直前の長いコメント（`surface-accent` / `HEADING_FACE` / `border-ink-muted` の経緯）は「見送りの箱は一段沈んだ面（`surface-muted`）。`rule` はこの面の上でも 3:1 を満たす（`palette-requirements.ts` の `BACKGROUNDS` に入っている）。無効は枠だけ赤くし面は塗らない（rev 9章 規約2）」に置き換える
- 176 行：`<span className={badgeClass('open', props.suppressed)}>` → `<Badge variant={badgeVariantOf('open', props.suppressed)}>`

`IssueTreeEditor.tsx`:
- import を `badgeClass` from `'@/components/Badge'` ＋ `chipVariantOf`, `badgeVariantOf` from `'./badge-variant'` に
- 917 行：`${CHIP_BASE} ${badgeClass(kind === 'hold' ? 'hold' : 'open', false)}` → `${CHIP_BASE} ${badgeClass(chipVariantOf(kind))}`。直前のコメント「未決の破線（`open`）と保留の実線（`hold`）で」に「未判断は着信の青（`pending`）」を足す
- 1012 行：`badgeClass('deferred', suppressed)` → `badgeClass(badgeVariantOf('deferred', suppressed))`
- 197 行のコメント「角丸は面（`badgeClass`）に決めさせて」はそのまま（部品の `badgeClass` を指すことになる）

`badge-styles.ts` を削除する。

- [ ] **Step 4: 全テスト・型・lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS。`grep -rn "badge-styles" src` が 0 件

- [ ] **Step 5: Commit**

```bash
git add -A src/modules/issue-tree src/components/Badge.tsx
git commit -m "refactor(issue-tree): バッジを共通部品 Badge へ——未判断は着信の青、見送りは一段沈んだ面"
```

---

### Task 4: `Chip` 共通部品と、用語集・エラーカタログの付け替え

**Files:**
- Create: `src/components/Chip.tsx`
- Create: `src/components/Chip.dom.test.tsx`
- Modify: `src/core/list-editor/cell-face.ts`
- Modify: `src/core/list-editor/cell-face.test.ts:60-64`
- Modify: `src/modules/glossary/GlossaryEditor.tsx:42-51,204-209,222-240,284-289,321-322`
- Modify: `src/modules/error-catalog/ErrorCatalogEditor.tsx:36-44,222-227,323-362,398-403,431-437`

**Interfaces:**
- Produces:
  - `Chip(props: { selected: boolean; onClick: () => void; children: ReactNode })`——`aria-pressed` を持つ `<button type="button">`
  - `cell-face.ts`: `CELL_FACE_CLASS: Record<CellFace, string>`、`cellFace(marks, index, field, warn = false, rowAnchor = false)`

- [ ] **Step 1: `Chip` のテスト**

`src/components/Chip.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Chip } from './Chip'

afterEach(cleanup)

describe('Chip', () => {
  it('選択状態を aria-pressed で表す', () => {
    render(<Chip selected onClick={() => {}}>アクター</Chip>)
    expect(screen.getByRole('button', { name: 'アクター', pressed: true })).not.toBeNull()
  })

  it('押すと onClick が呼ばれる', () => {
    const onClick = vi.fn()
    render(<Chip selected={false} onClick={onClick}>アクター</Chip>)
    fireEvent.click(screen.getByRole('button', { name: 'アクター', pressed: false }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
```

（`@testing-library/user-event` と jest-dom は入っていない。既存の dom テストは先頭の `// @vitest-environment jsdom` プラグマ、`fireEvent`、`cleanup`、`.not.toBeNull()` を使う——`src/components/ConfirmDialog.dom.test.tsx` と同じ形。`vite.config.ts` の既定は `environment: 'node'` なので、**プラグマを落とすと `document is not defined` で落ちる**。）

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/components/Chip.dom.test.tsx`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: `Chip` を実装する**

`src/components/Chip.tsx`:

```tsx
import type { ReactNode } from 'react'
import { buttonBase } from './button-styles'

/**
 * 選択トグル（フィルタのチップ）。**選択は黒塗りではなく、一段沈んだ面と
 * 濃い枠で示す**（rev 9章 M21「押すものと状態を同じ見た目にしない」）。
 * 用語集の種別フィルタ・エラーカタログの表示プロファイルと解決レベルが使う
 */
export function Chip(props: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={props.selected}
      className={`${buttonBase} border px-2 py-1 text-xs ${
        props.selected
          ? 'border-ink bg-surface-muted text-ink'
          : 'border-rule bg-canvas text-ink hover:bg-surface'
      }`}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}
```

Run: `npx vitest run src/components/Chip.dom.test.tsx` → PASS

- [ ] **Step 4: `cell-face.ts` を輪郭の語彙にする**

`CellFace` の下に追加し、`cellFace` を差し替える。

```ts
/**
 * セルの面のクラス名（M21）。**面は塗らず輪郭だけ**——無効は `invalid` の実線、
 * 欠落は `missing` の破線（rev 9章 規約2）。
 *
 * `outline` で引くのは、`ring` が線種（破線）を持たず、`border` がテーブルの
 * 罫線（`border-b border-grid`）と衝突するため。`-outline-offset-1` で
 * 枠をセルの内側に収める。**当てる要素は `<td>`**——中の入力欄は
 * `outline-none` を持っており、同じ要素に両方を書くとどちらが勝つかが
 * 生成 CSS の順序で決まる（M8 が cascade layers で踏んだ形）
 */
export const CELL_FACE_CLASS: Record<CellFace, string> = {
  error: 'outline-1 -outline-offset-1 outline-invalid',
  warn: 'outline-1 outline-dashed -outline-offset-1 outline-missing',
  none: '',
}

/**
 * セルの面を決める。**エラーは warn より強いので優先する。**
 * 定義セル・種別セルも見る——見ていないと、これらを指す検証ルールが
 * 増えた時点で「issue 一覧には出るのにセルが赤くならない」になる
 * （M8 でつぶした残件2）。いまは該当ルールが無いので到達しない。
 *
 * **行全体の指摘（field 'id'。ID 重複など欄を特定できない指摘）は、行の
 * 先頭セル（`rowAnchor`）に出す。** 行を染めると「この行は全部ダメ」に見え、
 * 問題箇所が特定できない（UI ノート D5）。M8 の「行がエラーならセルは none」
 * は半透明の二重塗りを避けるための規則で、輪郭は重ならないので要らない
 */
export function cellFace(
  marks: ErrorMarks,
  index: number,
  field: string,
  warn = false,
  rowAnchor = false,
): CellFace {
  if (hasError(marks, index, field)) return 'error'
  if (rowAnchor && hasError(marks, index, 'id')) return 'error'
  return warn ? 'warn' : 'none'
}
```

`cell-face.test.ts:60-64` の it を次に差し替える。

```ts
  it('行全体がエラー（id）でも、フィールド個別のエラーはそのまま error（輪郭は重ならない）', () => {
    const marks = buildErrorMarks([issue([loc('a', 0, 'id'), loc('a', 0, 'name')])])
    expect(cellFace(marks, 0, 'name', false)).toBe('error')
  })

  it('行全体がエラー（id）のとき、rowAnchor のセルだけが error になる', () => {
    const marks = buildErrorMarks([issue([loc('a', 0, 'id')])])
    expect(cellFace(marks, 0, 'name', false, true)).toBe('error')
    expect(cellFace(marks, 0, 'definition', false)).toBe('none')
  })
```

（`issue` / `loc` はこのテストファイル既存のヘルパ。名前が違えば実物に合わせる。）

- [ ] **Step 5: 用語集エディタ**

`GlossaryEditor.tsx`:
- 42-51 行：コメントと `errorCell` / `warnCell` の宣言を消し、`import { buildErrorMarks, cellFace, CELL_FACE_CLASS, hasError } from '@/core/list-editor/cell-face'` にする（`hasError` が残りの箇所で未使用になれば外す）。36-39 行相当の「フォーカスは面の塗り替えではなくリングで示す…」のコメントは残す（今も正しい）
- 204-209 行：
  ```ts
  /** セルの輪郭のクラス名。判定そのものは cell-face.ts の cellFace（純関数）が持つ。
      行全体の指摘は先頭列（名称）の輪郭で示す（UI ノート D5） */
  const cellClass = (index: number, field: GlossaryField, warn = false): string =>
    CELL_FACE_CLASS[cellFace(marks, index, field, warn, field === COLUMNS[0].field)]
  ```
- 321 行：`<tr key={rowKey} className="border-b border-grid align-middle">`（`errorCell` の付与を消す）
- 222-240 行：フィルタの `<button …>` を `<Chip selected={active} onClick={() => setFilter(…)}>{kindLabel(kind)}</Chip>` にする（`onClick` の中身は既存のまま）。`import { Chip } from '@/components/Chip'`。`buttonBase` の import が未使用になれば外す
- 284-289 行：`<th className={`sticky top-0 z-10 relative border-b border-rule bg-surface-accent px-2 py-1 font-bold${…}`}>` → `bg-surface-accent … font-bold` を `px-2 py-1 text-xs font-medium tracking-wide text-ink-muted` に（`sticky top-0 z-10 relative border-b border-rule` と `colBorder` の付与は据え置き）。**`<thead><tr className="text-left text-ink">` の `text-ink` は外す**（`th` 側の `text-ink-muted` が効くように）。`th` に `bg-surface` を足す——sticky な見出しの下を行がスクロールするので、面が無いと透ける

- [ ] **Step 6: エラーカタログエディタ**

`ErrorCatalogEditor.tsx`:
- 36-44 行：同じく `errorCell` / `warnCell` を消し、`CELL_FACE_CLASS` を import。コメントの「エラー・未記入セルは bg-warning/20・/10 の面を…」を「エラー・未記入セルは輪郭（`CELL_FACE_CLASS`）で示す。フォーカスで背景を塗り替えても消えないが、リングで示す方針は変えない」に
- 222-227 行：`cellClass` を `CELL_FACE_CLASS[cellFace(marks, index, field, warn)]` に（No 列は `profile.fields` に含まれないので `rowAnchor` はここでは常に false）
- 431-437 行：`<tr>` から `errorCell` の付与を消す。No のセルを
  ```tsx
  <td className={`px-2 py-1 text-right text-ink-muted ${CELL_FACE_CLASS[cellFace(marks, index, 'no', false, true)]}`}>{index + 1}</td>
  ```
  にする（**右揃え**：UI ノート D9。`'no'` は `ErrorField` ではないが `cellFace` の `field` は `string` なので通る。`hasError(marks, index, 'no')` は常に false で、`rowAnchor` だけが効く）
- 323-362 行：プロファイルと解決レベルの2つの `<button …>` を `<Chip selected={active} onClick={…}>` に
- 398-403 行：`<th>` を用語集と同じ `sticky top-0 z-10 border-b border-rule bg-surface px-2 py-1 text-xs font-medium tracking-wide text-ink-muted` に。No 列の `th` にも `text-right` を足す（列の見出しと数字を揃える）。`<thead><tr>` に `text-ink` があれば外す

- [ ] **Step 7: 全テスト・型・lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS。`grep -rn "errorCell\|warnCell" src` が 0 件

- [ ] **Step 8: 生成 CSS で `outline-dashed` が出ていることを確認する**

CSS のカスケードに依存する変更は生成 CSS を見るまで検証したことにならない（lessons-for-planning）。

Run: `npx vite build 2>&1 | tail -3 && grep -o "outline-dashed[^}]*}" dist/assets/*.css | head -2 && grep -o "\.outline-missing[^}]*}" dist/assets/*.css | head -1`
Expected: `.outline-dashed{--tw-outline-style:dashed;outline-style:dashed}` と `.outline-missing{outline-color:var(--color-missing)}` の形が出る（`dist/` は `.gitignore` 済み）。`outline-dashed` が v4 の組み込みユーティリティであることは着手前に `node_modules/tailwindcss/dist/lib.mjs` で確認済み（`["--tw-outline-style","dashed"],["outline-style","dashed"]`）。それでも出なければ「計画の矛盾」として報告する

- [ ] **Step 9: Commit**

```bash
git add src/components/Chip.tsx src/components/Chip.dom.test.tsx src/core/list-editor/cell-face.ts src/core/list-editor/cell-face.test.ts src/modules/glossary/GlossaryEditor.tsx src/modules/error-catalog/ErrorCatalogEditor.tsx
git commit -m "feat(glossary,error-catalog): セルの面を輪郭へ（無効＝赤の実線・欠落＝黄の破線）、緑帯を外し、選択チップを共通部品に"
```

---

### Task 5: シーケンス——行の帯を廃止し、セルだけを示す

**Files:**
- Modify: `src/modules/sequence/SequenceEditor.tsx:799,811-829,912-919,934-939,866-870`
- Modify: `src/modules/sequence/GutterSlot.tsx:27-40`
- Modify: `src/modules/sequence/ActorRefCell.tsx:48`
- Test: `src/modules/sequence/*.test.tsx`（既存）

- [ ] **Step 1: 行の帯を消し、`#N` のセルに出す**

`SequenceEditor.tsx`:
- 811-829 行：コメントと `data.steps.map((_step, index) => stepHas(index, 'row') ? (<div … className="absolute bg-warning/20" …/>) : null)` を**丸ごと消す**
- 912-919 行：`labelFace` の分岐とコメントを消し、`const labelFace = 'bg-surface'` にする（コメント：「通常時は不透明の bg-surface を敷く——枠線の無いラベルセルが入力可能に見えないという実機フィードバックへの対応」だけ残す）
- 934-939 行：通し番号の `div` を
  ```tsx
              {/* レールの通し番号。aria-hidden にするのは、各セルの aria-label が
                  すでに「ステップN の…」と名乗っており、二重に読ませないため。
                  **行全体の指摘（id 重複・self の to など欄を特定できない指摘）は
                  ここに出す**——行を帯で染めると問題箇所が特定できない（UI ノート D5） */}
              <div
                aria-hidden="true"
                className={`absolute select-none rounded-sm text-right text-xs ${
                  stepHas(index, 'row')
                    ? 'text-invalid outline-1 -outline-offset-1 outline-invalid'
                    : 'text-ink-muted'
                }`}
                style={{ left: RAIL_NUM_X, top: railTop + 4, width: RAIL_NUM_WIDTH }}
              >
  ```
- 866-870 行：参加者ヘッダの `face` を `invalidActors.has(index) ? 'border-invalid bg-surface' : 'border-rule bg-surface'` に（コメントの「面と枠のクラスは片方だけ出す」は残す）
- 799 行：`KeyHints` の `bg-surface/80` → `bg-surface`（透過禁止。Task 6 のロジックツリー・課題ツリーと同じ）
- 485 行のコメント「'row'＝行全体」はそのまま（意味は変わらない）

- [ ] **Step 2: ガターと参照セル**

`GutterSlot.tsx:27-40`：コメントを「未定義＝`missing` の破線の枠（面は塗らない。rev 9章 規約2）。handled＝無地・通常文字。notApplicable＝無地・ink-muted＋『─ 考慮不要』の接頭」にし、

```ts
  const face =
    props.state === 'unanswered'
      ? 'border-dashed border-missing bg-surface text-ink-muted'
      : props.state === 'notApplicable'
        ? 'border-rule bg-surface text-ink-muted'
        : 'border-rule bg-surface text-ink'
```

`ActorRefCell.tsx:48`：`const face = props.invalid ? 'border-invalid bg-surface' : 'border-rule bg-surface'`

- [ ] **Step 3: 全テスト・型・lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS。`grep -n "warning" src/modules/sequence/*.tsx` がコメント行以外 0 件。既存テストで「行の帯」を DOM から引いているものがあれば落ちる——その場合は期待を「`#N` の要素が `outline-invalid` を持つ」ではなく（クラス名に依存させない）、帯の有無を見ていた it ごと消して「計画の矛盾」として報告する

- [ ] **Step 4: Commit**

```bash
git add src/modules/sequence
git commit -m "feat(sequence): 行の帯を廃止し #N のセルに無効を出す——未回答は黄の破線、参照切れは赤の実線"
```

---

### Task 6: ロジックツリー・コア部品・`Button`

**Files:**
- Modify: `src/modules/logic-tree/NodeBox.tsx:28-32`
- Modify: `src/modules/logic-tree/LogicTreeEditor.tsx:310`
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx:926`
- Modify: `src/App.tsx:859,925-935,972,1055`
- Modify: `src/components/FileList.tsx:81,84,92-98,190`
- Modify: `src/components/FileHeader.tsx:48-55`
- Modify: `src/components/IssueBanner.tsx:33`
- Modify: `src/components/TerminalTab.tsx:284`
- Modify: `src/components/TerminalPane.tsx:52`

- [ ] **Step 1: 振り分け表のとおり置き換える**

| 箇所 | 後 |
| --- | --- |
| `NodeBox.tsx:32` | `const face = props.invalid ? 'border-invalid bg-surface' : 'border-rule bg-surface'`。直前のコメント「赤表示の濃さは M8 で確定した…」を「無効は枠だけ `invalid`。面は塗らない（rev 9章 規約2）」に |
| `LogicTreeEditor.tsx:310`、`IssueTreeEditor.tsx:926` | `bg-surface/80` → `bg-surface` |
| `App.tsx:859` | `<Button variant="outline" onClick={() => void openFolder()}>フォルダを開く</Button>`——起動時に1回押すだけの操作を最強調にしない（UI ノート §1.2・D19） |
| `App.tsx:925-935` | `bg-surface-accent` → `bg-surface-muted`。直前のコメントの「bg-surface-accent（新しい役割トークンは足さない）」を「bg-surface-muted（一段沈んだ面）」に |
| `App.tsx:972` | `text-warning` → `text-invalid`（額縁のバナーは「開けない・壊れている」の指摘） |
| `App.tsx:1055` | `text-warning` → `text-invalid` |
| `FileList.tsx:81` | `text-warning` → `text-invalid` |
| `FileList.tsx:84` | `<span className="ml-1 rounded-sm bg-warning px-1 text-xs text-warning-fg">{file.issues.length}</span>` → `<Badge variant="invalid" className="ml-1">{file.issues.length}</Badge>`（`import { Badge } from './Badge'`） |
| `FileList.tsx:92-98` | コメント「赤は warning（facet のパレットに destructive 役割は無い）」→「削除は常時 `ink-muted`、ホバーでだけ無効軸の赤を借りる（rev 9章 規約5。赤を借りる唯一の例外）」。`hover:text-warning` → `hover:text-invalid` |
| `FileList.tsx:190` | `bg-surface-accent px-4 py-1 text-xs font-bold text-ink-muted` → `bg-surface-muted px-4 py-1 text-xs font-medium tracking-wide text-ink-muted` |
| `FileHeader.tsx:48-55` | コメント（`/70` の説明4行）を「ファイル名は副表示なので `ink-muted`。**透過は掛けない**——トークンのコントラスト保証の外に出る（M21 で全面禁止）」に。`text-ink-muted/70` → `text-ink-muted` |
| `IssueBanner.tsx:33` | `text-warning` → `text-invalid` |
| `TerminalTab.tsx:284` | `text-warning` → `text-invalid` |
| `TerminalPane.tsx:52` | `bg-surface-accent text-ink` → `bg-surface-muted text-ink` |

- [ ] **Step 2: 全テスト・型・lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS

- [ ] **Step 3: 旧名が 0 件であることを確認する**

Run: `grep -rnE "\b(bg|text|border|ring|outline|stroke|fill|hover:bg|hover:text)-(warning|warning-fg|ok|ok-fg|surface-accent)\b" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
Expected: 0 行。残っていれば振り分け表で処理する（`src/types/` と `consistency.ts` の `warning` はデータの重大度名で、このパターンには当たらない）

- [ ] **Step 4: Commit**

```bash
git add src/modules/logic-tree src/modules/issue-tree/IssueTreeEditor.tsx src/App.tsx src/components
git commit -m "refactor(core,logic-tree): 旧トークンを振り分ける——無効は赤、強調と選択は一段沈んだ面、透過は外す、primary を使わない"
```

---

### Task 7: 使い方の機械検査（`conventions.test.ts`）

**Files:**
- Modify: `src/styles/conventions.test.ts`（末尾に describe を1つ足す）

- [ ] **Step 1: 検査を足す**

ファイル末尾に追加する。`offendingLines` は既存のものを使う。`<Button` の検査だけは複数行に跨るので専用に走査する。

```ts
describe('役割トークンの使い方（rev 9章 M21）', () => {
  it('旧トークン名（warning / ok / surface-accent）をクラス名として使っていない', () => {
    const offenders = offendingLines(
      /\b(?:[a-z-]+:)?(bg|text|border|ring|outline|stroke|fill|decoration|placeholder|divide)-(warning|warning-fg|ok|ok-fg|surface-accent)\b/,
    )
    expect(offenders, `M21 で消えたトークン。missing / invalid / pending / judge-* / surface-muted に振り分けること:\n${offenders.join('\n')}`).toEqual([])
  })

  it('欠落・無効・着信を面にしない（線と文字だけ）', () => {
    const offenders = offendingLines(/\b(?:[a-z-]+:)?bg-(missing|invalid|pending)\b/)
    expect(offenders, `開いているものは線、決着したものは面（規約2）:\n${offenders.join('\n')}`).toEqual([])
  })

  it('判断の面を線や文字にしない（-fg を除く）', () => {
    const offenders = offendingLines(/\b(?:[a-z-]+:)?(text|border|outline|ring|stroke|fill|decoration)-judge-(yes|no)\b/)
    expect(offenders, `judge-yes / judge-no は面。文字は judge-*-fg を使う:\n${offenders.join('\n')}`).toEqual([])
  })

  it('役割トークンに透過を掛けていない', () => {
    // トークンのコントラストは palette.test.ts が値で保証する。透過を掛けた
    // 使用箇所はその保証の外に出る。半透明の面（M8 の bg-warning/20）が
    // 消えた今、正当な透過は残っていない
    const offenders = offendingLines(
      /\b(?:[a-z-]+:)?(bg|text|border|ring|outline|stroke|fill|decoration|placeholder|divide)-(canvas|surface|surface-muted|ink|ink-muted|ink-faint|rule|grid|missing|invalid|pending|judge-yes|judge-yes-fg|judge-no|judge-no-fg)\/\d+/,
    )
    expect(offenders, `透過は使わない。一段薄くしたければ ink-muted / ink-faint の段を使う:\n${offenders.join('\n')}`).toEqual([])
  })

  it('<Button> は variant が outline / ghost のどちらか（塗りの primary は使わない）', () => {
    // JSX の開始タグは複数行に跨るので、行単位の offendingLines ではなくタグ単位で見る。
    // `<Button\b` は `<ButtonGroup` に当たらない（\b が b と G の間で成立しない）
    const out: string[] = []
    for (const file of sourceFiles()) {
      const stripped = stripComments(readFileSync(file, 'utf8'))
      for (const m of stripped.matchAll(/<Button\b[^>]*>/g)) {
        if (!/\bvariant="(outline|ghost)"/.test(m[0])) {
          const line = stripped.slice(0, m.index).split('\n').length
          out.push(`src/${relative(file)}:${line}  ${m[0].replace(/\s+/g, ' ').slice(0, 80)}`)
        }
      }
    }
    expect(out, `facet は塗りボタンを置かない（UI ノート D19）。variant="outline" か "ghost" を書く:\n${out.join('\n')}`).toEqual([])
  })
})
```

- [ ] **Step 2: 「守っているか」を1つ壊して確かめる**

`src/components/FileList.tsx` の `hover:text-invalid` を一時的に `hover:text-warning` に戻して `npx vitest run src/styles/conventions.test.ts` を走らせ、「旧トークン名」の it が落ちることを確認してから戻す。同様に `App.tsx:859` の `variant="outline"` を一時的に外して `<Button>` の it が落ちることを確認してから戻す（順序を固定するテストを書いたら1行壊して落ちることを確かめる——lessons-for-planning）。

- [ ] **Step 3: 全テスト・型・lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: PASS（Task 1〜6 を終えていれば offenders は 0）

- [ ] **Step 4: Commit**

```bash
git add src/styles/conventions.test.ts
git commit -m "test(core): 役割トークンの使い方を機械検査に——旧名・チャネル違反・透過・塗りボタンを弾く"
```

---

### Task 8: `palette-retheme` Skill の書き直し

**Files:**
- Modify: `.claude/skills/palette-retheme/SKILL.md`

`palette-fit.mjs` は Task 1 で追従済み。ここは手順書だけ。

- [ ] **Step 1: 節3「役割へ対応づける」の表を差し替える**

見出しを「3. 役割へ対応づける（拾うのは7色だけ）」にし、表を次にする。

```markdown
| 外部テーマ | facet の役割 | 備考 |
| --- | --- | --- |
| `background` | `canvas` | 地（方眼紙を敷く面）。**L だけ拾い、C は 0 にする**（下の「地は無彩色」） |
| `card` / `popover` | `surface` | 両者が違う値なら `card` を採る。同じく L だけ |
| `muted` | `surface-muted` | 一段沈んだ面（選択中・種類見出し・見送りの箱）。同じく L だけ |
| `foreground` | `ink` | 同じく L だけ |
| `muted-foreground` | `ink-muted` | 同じく L だけ |
| `border` / `input` | `rule` | 両者が違う値なら `border` を採る。同じく L だけ |
| `destructive` | `invalid` | **色相を確認する。手順4を見る** |

**地は無彩色。** facet は「色を持つのは意味だけ」（rev 9章 規約1・6）で、面・文字・線は
C ≤ 0.01 でなければならない（`palette.test.ts` の `ACHROMATIC` が弾く）。テーマの地が
暖色でも寒色でも、**明度だけを拾って C は 0 に置く**。テーマの「雰囲気」を facet に
持ち込めるのは意味色の4つ（`missing` / `invalid` / `pending` / `judge-yes`）だけである。
```

- [ ] **Step 2: 節5「対応物がない」の表を差し替える**

見出しを「5. 対応物がない8つを決める」にし、表を次にする。

```markdown
| 役割 | 扱い | 導出の規則（候補の作り方） |
| --- | --- | --- |
| `missing` | **必ず聞く** | 黄系（H 70〜95）。白地で 4.5:1 を満たすと黄土色になる——これは仕様（UI ノート「付箋の黄」）。テーマに warning / caution 系があれば候補に |
| `pending` | **必ず聞く** | 青系（H 230〜260）。テーマに info 系があれば候補に |
| `judge-yes` | **必ず聞く** | 明るい緑の面（L 0.80 以上、C 0.06〜0.10）。テーマに success / positive 系があれば、その色相から起こす。**青緑寄り（H 150〜170）にすると P型・D型で赤・黄土から離れる** |
| `judge-yes-fg` | 既定値を示して確認 | `judge-yes` の面に 4.5:1 で載る暗い無彩色（`ink` 相当） |
| `judge-no` | 既定値を示して確認 | チャコール（L 0.33〜0.38、C 0）。`judge-yes` と 3:1 以上離す（`FACE_PAIRS`） |
| `judge-no-fg` | 既定値を示して確認 | `judge-no` の面に 4.5:1 で載る明るい無彩色（`surface` 相当） |
| `grid` | 既定値を示して確認 | `canvas` に寄せた薄い無彩色。**ライトは `canvas` 上 1.2:1 を目安にする** |
| `ink-faint` | 既定値を示して確認 | `ink-muted` からさらに一段動かす——ライトはより明るく、ダークはより暗く。3面（`canvas` / `surface` / `surface-muted`）で 3:1 |

**黄と赤は D型色覚では色相で分かれない。** `missing` と `invalid` は**明度で**分ける
（`invalid` を一段暗く）。`palette-fit.mjs` の「意味色の識別」が標準・P型・D型の全部で
ΔE ≥ 0.10 を要求する。満たせなければ `palette-requirements.ts` の `DISTINCT_MIN` を
0.08 まで下げてよいが、理由と実測値をその隣に書く。
```

- [ ] **Step 3: 残りの Morphos 固有の記述を外す**

- 節2の表の「名前付きパレット（Morphos の `theme.json`…）」の行は「名前付きパレット（色のリスト、『Lava Paper `#e7e5dc`』のような名前付きの色）」に
- 節4「`destructive` を疑う」の Morphos の生成ミスの記述は、「例：過去に使った Morphos の `theme.css` は `destructive` が Primary で上書きされる生成ミスがあった」と**例として1文だけ**残す
- 節7の表の「ヘッダの『由来は Morphos の morphous-basalt』の段落」を「ヘッダの由来の段落」に
- 節10の役割一覧の表を 15 個に書き直す（`palette.css` のヘッダと同じ文言）：

```markdown
| 役割 | 意味（rev 9章） |
| --- | --- |
| `canvas` / `surface` / `surface-muted` | 地／作業する面／一段沈んだ面（無彩色） |
| `ink` / `ink-muted` / `ink-faint` | 文字（無彩色。faint は 3:1、本文に使わない） |
| `rule` / `grid` | 罫線（3:1）／方眼（装飾） |
| `missing` | 欠落（未定義・未決・仮説なし・保留）。黄。線と文字だけ |
| `invalid` | 無効（重複・参照切れ・整合性違反）。赤。線と文字だけ。削除のホバーにだけ借りる |
| `pending` | 着信（返答していない入力＝未判断）。青。線と文字だけ |
| `judge-yes` / `judge-yes-fg` | 支持の面（緑）とその文字 |
| `judge-no` / `judge-no-fg` | 棄却の面（無彩色）とその文字 |
```

- 節6「検算する」の「出力の読み方」に、新しい3セクション（面どうし／無彩色／意味色の識別）が出ることを1行ずつ足す
- 「やらないこと」に「地に彩度を持ち込まない（テーマの地色の C を拾わない）」を足す

- [ ] **Step 4: 手順書と実物の食い違いを確かめる**

Run: `node .claude/skills/palette-retheme/scripts/palette-fit.mjs src/styles/palette.css`
Expected: 終了コード 0。出力に「面どうし」「無彩色」「意味色の識別」のセクションがあり、SKILL.md 節6の説明と一致する

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/palette-retheme/SKILL.md
git commit -m "docs(skill): palette-retheme を役割トークン v2 に合わせる——拾うのは7色、人が選ぶのは8色、地は無彩色"
```

---

### Task 9: 「正」の文書と台帳

**Files:**
- Modify: `docs/overview-rev.md:301-322`（9章）
- Modify: `docs/issue-tree/仮説検証モジュール-設計ノート.md:120-124`（D8）
- Modify: `docs/open-issues.md`
- Modify: `docs/README.md:8-24`（地図）、マイルストーン表
- Modify: `docs/lessons-for-planning.md`

- [ ] **Step 1: rev 9章「役割トークンとパレットの分離」を書き直す**

301 行の箇条書き（「M7 で色値を確定した」）の冒頭を「**M7 で色値を確定し、M21 で体系を作り直した。**」にし、Morphos の記述は「M7 は Morphos の `morphous-basalt` を下敷きにしたが、M21 で面・文字・線を無彩色に作り直した（設計スペック `docs/superpowers/plans/2026-08-23-m21-design-tokens-v2-design.md`）」に縮める。`palette.css` 1ファイル・`palette.test.ts`・`contrast.ts`・`palette-retheme` Skill の記述は残すが、「外部テーマの31変数のうち facet が使うのは6つ」を「7つ（残る8つは候補から人が選ぶ）」に、「半透明の重ね合わせも検証対象」の文は「**M21 で半透明の面は廃止した**（`OVERLAYS` は無い。役割トークンへの透過は `conventions.test.ts` が弾く）」に置き換える。

304-307 行の「役割トークンは3系統のアクセント＋無彩色系＋見出しの面で12個」の箇条書きを**丸ごと**次に置き換える。

```markdown
- **役割トークンは 15 個（M21）。色を持つのは「意味」だけで、面・文字・線は無彩色（C ≤ 0.01）**：
  - 面（無彩色）：`canvas`（地。方眼を敷く）／`surface`（作業する面）／`surface-muted`（**一段沈んだ面**。選択中タブ・ファイル一覧の種類見出し・端末のアクティブタブと選択面・見送りの箱。M8 の `surface-accent` の後継で、緑を捨て役割を「見出し」から「沈んだ面」に改めた——**テーブルのカラム名は面を持たない**。`text-ink-muted` ＋ `tracking-wide` のラベルにする）
  - 文字（無彩色）：`ink`／`ink-muted`／`ink-faint`（非アクティブ。3:1。**本文に使わない**。`opacity-*` の代わりに使う）
  - 線（無彩色）：`rule`（セル境界・入力枠。3:1）／`grid`（方眼と薄い装飾罫。要件の対象外）。境界は「情報を伝えるか否か」で引く
  - **欠落軸** `missing`（黄）：未定義・未分類・空セル・未回答・未決・仮説なし・保留。**線と文字だけ**。線種で段を分ける——破線＝まだ見ていない／実線＝見たが決められない（課題ツリーの語彙を全体へ）。白地で 4.5:1 を満たす黄は黄土色になる。これは仕様（付箋の黄）
  - **無効軸** `invalid`（赤）：重複・参照切れ・整合性違反・スキーマ違反・読めないファイル。**線と文字だけ**（実線）。表記ゆれの「指摘（suggestion）」は波線下線（弱形。実装はまだ無い）。**黄と赤は D型色覚で色相では分かれないので明度で分ける**——`invalid` は `missing` より一段暗い
  - **着信軸** `pending`（青）：外から届いた入力に返答していない状態。いまは課題ツリーの「未判断」（`pendingNotes` が空でない）だけ。**線と文字だけ**
  - **判断軸**：`judge-yes`＋`judge-yes-fg`（支持の**面**。明るい青緑）／`judge-no`＋`judge-no-fg`（棄却の**面**。チャコール）。見送りは専用トークンを持たず `surface-muted` の面＋`rule` の枠＋`ink-muted` の文字
  - **規約6条**：(1) 色を持つのは意味だけ——分類・ボタン・見出し・選択状態は彩度を持たない。(2) 開いているものは線、決着したものは面——黄・赤・青の面、緑の線は作らない（`conventions.test.ts` が弾く）。(3) 判断軸で彩度を持つのは支持のみ。棄却・見送りは明度差（白黒でも判別。`FACE_PAIRS` が 3:1 を課す）。(4) **5色目は作らない**。新しい意味は4軸のどれかに入れるか、色以外のチャネル（線種・形・位置）で表す。(5) 削除だけはホバー時に `invalid` を借りる。常時は `ink-muted`。これ以外に借用を作らない。(6) 無彩色とは C ≤ 0.01（`ACHROMATIC` が弾く）
  - 意味色4つは標準・P型・D型のすべてで OKLab 色差 ≥ 0.10（`DISTINCT_PAIRS`。M7 は印字だけだったが M21 で門番にした。満たせなければ 0.08 まで下げてよいが、理由を `palette-requirements.ts` に書く）
  - **課題ツリーは未決を面で塗らない**（issue-tree-m3 → M21 で全モジュールの規約2に昇格）。「未定義を面で可視化する」はやめ、欠落は輪郭で示す
```

「確定要素」の節：
- 「端末（xterm）の中も役割トークンに合わせる」の `surface-accent` を `surface-muted` に、「役割トークン（12個）」を「15個」に、「12個の役割トークンのうち6個は…残る6つ」を「15個のうち7個は…残る8つ」に
- 「塗りつぶしたボタン（shadcn の既定 variant ＝ `primary`）は1画面に1つだけにする」の段落を「**塗りつぶしたボタン（`default` variant）は使わない（M21。UI ノート D19）。** エディタの主操作はセルに文字を打つことでボタンではないので、ツールバーは全部 `outline`（Secondary）、アイコンだけの補助操作は `ghost`（Tertiary）。`conventions.test.ts` が `variant` 無しの `<Button>` を弾く。M8 の『1画面に1つ』はこれで置き換わる」に
- 「フォーカスは面の塗り替えではなくリングで示す」の括弧内「警告・エラーの面（`bg-warning/20` 等）を塗り替えるとその表示ごと消える」を「無効・欠落の輪郭（`outline-invalid` 等）は面と独立なので、フォーカスで消えない」に
- 「`KeyHints`」の段落の末尾に「帯の面は不透明の `bg-surface`（M21 で透過を外した）」を足す
- **「共通コンポーネント…M8 で最初の1枚として `buttonBase`」の段落の末尾に足す**：「**M21 で `Badge`（`src/components/Badge.tsx`。意味を variant で受け、形は部品が持つ）と `Chip`（`src/components/Chip.tsx`。選択トグル。選択は黒塗りではなく `surface-muted` の面と `ink` の枠）を置いた。** 状態のバッジを新しく描くときは `Badge` を通す。課題ツリーの語彙と部品の variant の対応は `src/modules/issue-tree/badge-variant.ts` が持ち、部品は語彙を知らない」
- 「**数字は等幅**（UI ノート D9。`index.css` の `body { font-variant-numeric: tabular-nums }`。テーブルの No 列は右揃え）」を確定要素に1項足す

- [ ] **Step 2: 課題ツリー設計ノート D8 を直す**

120 行の見出し直下の段落の「意味を持つ色相は2つ——`warning`…`ok`——のまま、判断の群は塗りと枠の形で分ける: 支持＝`ok` の塗り／棄却＝`ink` の塗り…／保留＝`warning` の実線の枠／未決＝`warning` の破線の枠／見送り＝`ink-muted` の枠」を次に置き換える：

「意味を持つ色相は rev 9章 M21 の4軸（欠落の黄・無効の赤・着信の青・支持の緑）のまま、**判断の群は塗りと枠の形で分ける**: 支持＝`judge-yes` の塗り／棄却＝`judge-no` の塗り（チャコール。棄却は失敗ではなく入力なので叫ばない）／保留＝`missing` の実線の枠／未決＝`missing` の破線の枠／未判断＝`pending` の実線（着信。欠落ではなく受信箱）／見送り＝`surface-muted` の面と `rule` の枠」

その次の段落「**issue-tree-m3 の後続で、見送りを掲げた課題自身の箱に `bg-surface-accent` の塗りを足した。**…」の末尾に足す：「**M21 で `surface-accent` は `surface-muted`（一段沈んだ面）に改まり、見送りの箱はその本来の役割で塗られる。** 流用ではなくなったので、『見出しの面を流用した』という上の経緯は歴史として読むこと」

- [ ] **Step 3: `open-issues.md`**

**消す**（「デザイン」節）：
- 「`warning` と `ok` が P型・D型色覚で識別できない」——`DISTINCT_PAIRS` が門番になった
- 「役割トークンに透過を掛けた箇所は…`text-ink-muted/70`」と、その入れ子「面の透過には既に登録簿があり…」——透過を全面禁止にした
- 「`ok` がどのコンポーネントからも参照されていない」と、その入れ子「sequence M1 が最初の使いどころだったが」——`ok` 自体が無くなった。**入れ子の「回答済と考慮不要の区別が文言に頼っている」は消さずに、別項として独立させる**（`[sequence-m1]`。判断軸の面 `judge-yes` を使うかは C で決める）
- 「行全体の指摘と `from`/`to` の指摘が同時に出ると `warning` の面が二重になりうる」——帯を廃止した
- 「`bg-surface/80` がコードベースに前例のない不透明度指定」——外した

**足す**（`[M21]` タグ）：
- 「次に手を付ける候補」：**M21 の実機確認が未実施**（`history/m21-core-design-tokens-v2.md` のチェックリスト）。見た目が成果物なので確認しないと成否が分からない
- 「デザイン」：UI ノートの残り B〜F（タイポグラフィ 16px 基準／未定義の本体（捏造文字列・ロジックツリーの空ノード・件数集計）／レイアウト固定／フォント同梱／見送り集計の2段構え・select 置換・角丸統一）を1項ずつ。各項は UI ノートの D 番号を指す
- 「デザイン」：**ダークの値は要件を満たすだけで吟味していない**
- 「デザイン」：**`invalid` がライトで暗い赤（L 0.38）なのは D型で `missing` と分けるため**。実機で「黒っぽい」と出たら `DISTINCT_MIN` を 0.08 に下げて L 0.42 前後へ
- 「小さな負債」：用語集の別名バッジ（`AliasCell.tsx:231` の `border-grid` の `<span>`）は `Badge` に寄せていない——状態ではなくデータの値のタグなので意味の variant が無い。`Badge` に `neutral` を足すかは、同じ形が2件目に出たとき
- 「小さな負債」：表記ゆれの「指摘」の波線下線は規約に書いたが実装が無い（suggestion の検出自体がまだ無い）

冒頭の「最終更新」を M21 に書き換え、消した・足した件数を書く（既存の書式に倣う）。

- [ ] **Step 4: `README.md`**

地図の表の「なぜこの設計なのか」の直後に行を足す：

```markdown
| UI の見た目がなぜそう決まったか（色は意味だけ・欠落は線・判断は面） | [`facet-UI設計ノート.md`](facet-UI設計ノート.md) — **UI の設計ノート**（診断と決定 D1〜D19。A（色の規約）は M21 で実装。残り B〜F は `open-issues.md`） |
```

マイルストーン表の M20 の次に `| [M21](history/m21-core-design-tokens-v2.md) | 役割トークン v2——色を持つのは意味だけ | コア・デザイン |` を足す。

- [ ] **Step 5: `lessons-for-planning.md`**

「設計判断の扱い」に1項足す：

「**色相を増やす判断を書いたら、P型・D型で分かれるかを計画時点で検算する。色相で分かれないなら明度で分ける。** M21 は黄（欠落）と赤（無効）を別の軸にしたが、同じ明度では D型の色差が 0.013 しか出なかった（`contrast.ts` の `simulate` で検算）。色相だけで4色を置けると思い込むと、実装してから『赤を暗くする』しか手が無くなる。検算は `node` で `contrast.ts` を型ストリップ import すれば1分で済む」

- [ ] **Step 6: 文書の食い違いを確かめる**

Run: `grep -rn "surface-accent\|warning/10\|warning/20\|HEADING_FACE\|1画面に1つ" docs/overview-rev.md "docs/issue-tree/仮説検証モジュール-設計ノート.md" docs/README.md`
Expected: 「歴史として」の注記以外に残っていない。残っていれば直す（`history/` と `superpowers/plans/` の過去の文書は**触らない**——追記専用）

- [ ] **Step 7: Commit**

```bash
git add docs/overview-rev.md "docs/issue-tree/仮説検証モジュール-設計ノート.md" docs/open-issues.md docs/README.md docs/lessons-for-planning.md
git commit -m "docs(core): rev 9章を役割トークン v2 に書き直す——15個の体系と規約6条、残件と教訓"
```

---

### Task 10: 申し送り（history）

**Files:**
- Create: `docs/history/m21-core-design-tokens-v2.md`

実機確認と同じタスクに束ねない（lessons-for-planning「タスク分割」）。ここは**書くだけ**。

- [ ] **Step 1: 書く**

`docs/history/issue-tree-m3-overview-ui.md` の冒頭の形（追記専用の注意書き／マイルストーンの一文／計画へのリンク／コミット範囲）に倣い、次を含める：

- 何を作り替えたか（トークン 12 → 15、4軸、規約6条、`Badge` / `Chip`、帯の廃止、透過禁止、`tabular-nums`）
- **実装で確定した事項**：黄と赤は明度で分ける（検算値：同 L で D型 ΔE 0.013 → `invalid` L 0.38 で 0.108）／`destructive` variant は使わず削除は生のボタン（スペックからの変更。理由：shadcn 生成物を手で整形しない）／透過は4箇所（スペックの3は数え落とし）／`App.tsx` の更新ボタンは Chip ではなく強調面
- **実機確認（Task 11）について**：サブエージェントは Tauri の GUI を操作できない。設計スペック「検証」の9項目をチェックボックス（`- [ ]`）のまま写す
- **次へ**：UI ノート B〜F（`open-issues.md` を見よ）。B（16px 基準）に入ると `Badge` の `text-xs` と `h-[18px]` と `BADGE_BOX_HEIGHT` を同時に動かすことになる——3つが1ファイル（`Badge.tsx`）に揃えてあるのはそのため

- [ ] **Step 2: Commit**

```bash
git add docs/history/m21-core-design-tokens-v2.md
git commit -m "docs(core): M21 申し送り——役割トークン v2"
```

---

### Task 11: 実機確認（人間）

**Files:** なし（結果は `docs/history/m21-core-design-tokens-v2.md` のチェックリストに人間が記入する）

サブエージェントはここを実行できない。`npm run tauri dev` で `sample-project/` を開き、27型 WQHD・ライトで次を見る：

- [ ] 黄・赤・青・緑が周辺視野で別物に見える（課題ツリーの帯に4種のチップを並べる）
- [ ] 黄土色が「欠落」として読める（茶色に見えるなら設計スペック 決定1 の第2候補へ）
- [ ] 無効の赤（L 0.38）が黒っぽく見えないか（見えるなら `DISTINCT_MIN` 0.08 ＋ L 0.42 へ）
- [ ] 支持と棄却が、形でも明度でも分かれる
- [ ] 緑帯を外したカラム名が見出しに見える（用語集・エラーカタログ）
- [ ] チップの選択が黒塗りなしで分かる（用語集の種別フィルタ）
- [ ] 用語集の未定義セルの破線・エラーセル（名称重複）の実線。ID 重複のファイルで先頭セルに赤が出る
- [ ] シーケンスで行の帯が消え、`#N` と該当セルだけが示される
- [ ] 端末の選択面（`surface-muted`）が見える
- [ ] 見送りの箱が「沈んで」見える
- [ ] No 列の数字が右揃えで桁が揃う

確認後は `git checkout -- sample-project/ && git clean -fdx sample-project/`（CLAUDE.md「マージ後の後片付け」1）。

---

## 自己レビュー（計画を書いた後に実施済み）

**スペック網羅**：決定1（体系）→ Task 1。決定2（値）→ Task 1 Step 4。決定3（付け替え表）→ Task 3〜6（表の各行が Task に対応。`App.tsx` の更新ボタンは Chip ではなく面——着手前スキャンの項）。決定4（部品）→ Task 2・4、`Button` 制限 → Task 7。決定5（検証機構）→ Task 1（契約・`palette-fit`）、Task 7（conventions）。決定6（文書）→ Task 9・10。順序・検証 → 各 Task。スコープ外 → Task 9 Step 3 の残件。

**スペックからの変更（この計画が正）**：(1) `destructive` variant は許可しない（shadcn 生成物を手で整形しない）。(2) Chip は3箇所。(3) 透過は4箇所。(4) `Badge` に `border` を base で持たせ、yes/no は `border-transparent`（チャネル検査と幅の算出を両立するため）。

**型の整合**：`BadgeVariant` の8語は Task 2・3・6 で同じ。`cellFace` の第5引数 `rowAnchor` は Task 4 の cell-face と両エディタで同じ。`BADGE_BOX_HEIGHT` / `BADGE_PADDING_X` / `BADGE_BORDER` は Task 2 で定義し Task 3 の `measure.ts` が読む。`chipVariantOf` / `badgeVariantOf` は Task 3 内で閉じる。
