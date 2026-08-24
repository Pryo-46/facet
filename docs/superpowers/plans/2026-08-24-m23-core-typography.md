# M23 タイポグラフィスケール v2 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 段を5段（xs12/sm14/base16/lg18/2xl24）から3サイズ4段（sm14 / base16 / base+leading-normal / xl22）へ張り替え、フォント段に依存する寸法定数と検査・文書を追従させる。

**Architecture:** サイズは Tailwind の語彙と値の一致を保ったままクラスを張り替える（トークン値の再定義は `--text-xl: 22px` の1つだけ）。行間は「詰めた値を既定にし、読ませる欄だけ `leading-normal` を明示」。測定層（canvas-font / 各 measure）と描画層は同じ `*_FONT_CLASS` 定数・同じ定数群を見るので、定数と字面を対で動かす。

**Tech Stack:** Tailwind v4（`@theme` トークン）・React・vitest（DOM テストは jsdom + fireEvent）。

**Spec:** `docs/superpowers/plans/2026-08-24-m23-core-typography-design.md`（同ブランチ `a0b309e`。人間承認済み。実寸比較モックの裁定を含む）

## Global Constraints

- **着手前に worktree で `npm install` を済ませ、`npm test && npx tsc -b && npm run lint` が緑であることを確認してから Task 1 に入る**（CLAUDE.md。古い `node_modules` の「モジュールが見つからない」は原因を誤診させる）
- **計画の指示が実物と矛盾していたら、辻褄を合わせずに「計画の矛盾」として報告する。** ただし**既存実装と一致すべき値（クラス字面・定数値・文言）は実物が正**（`docs/lessons-for-planning.md`）
- **各タスクの検証は対象を絞らず全体を回す**: `npm test` / `npx tsc -b` / `npm run lint`。報告には実行したコマンドと出力（末尾の要約行）を貼る
- **クラス名は完全な字面で書く**（`text-${...}` の組み立て禁止。Tailwind の走査は静的——`src/components/badge-styles.ts:14-15` の既存コメントどおり）
- 新しい段の値: `text-sm` 14px/1.3 ／ `text-base` 16px/1.25 ／ `text-base leading-normal` 16px/1.5 ／ `text-xl` 22px/1.3・weight 500。`text-xs`・`text-lg`・`text-2xl` は廃止（Task 9 で機械検査が閉じる）
- `components/ui/` は `conventions.test.ts` の走査対象外のまま。改造するのは `button.tsx` だけ（決定5・8）。`dropdown-menu.tsx` は触らない
- `tauri.conf.json` は触らない（決定7: ズームは残す）
- テストの件数を報告・計画に書かない。期待は「このファイルの `it` がすべて緑」

**改修対象の全数は着手前スキャン（2026-08-24、基底 `68a96f1`）で確定済み**——`text-*` 実クラス 96 箇所（うち `components/ui/` 10）、`leading-*` 2 箇所（ともに `leading-none`）、`text-*` と固定高の同居 5 箇所、フォント測定の見本要素 6 本。各タスクの Files がその全数を分担する。タスクに載っていない `text-xs`/`text-sm` が残れば Task 9 の新検査が赤くする。

---

### Task 1: index.css の段と行間の土台

**Files:**
- Modify: `src/index.css:17-41`（`@theme inline` のタイポグラフィ節）・`:162-165`（`--grid-size` の由来コメント）
- Modify: `src/styles/conventions.test.ts:117`（段検査の正規表現から `xl|` を外すだけ。禁止の反転は Task 9）

**Interfaces:**
- Produces: ユーティリティ `text-xl` = 22px/1.3。`text-sm` の行間 1.3、`text-base` の行間 1.25。以後のタスクはこれを前提に張り替える

- [ ] **Step 1: conventions.test.ts の段検査を「text-xl を許す」形に緩める**

`src/styles/conventions.test.ts:117` の正規表現を次に差し替える（この時点では xs/lg/2xl は**まだ許可**。禁止の反転は全張り替え後の Task 9）:

```ts
    const offenders = offendingLines(/\btext-[3-9]xl\b|\btext-\[[^\]]*\]/)
```

it 名（:106）と失敗メッセージ（:120）、コメント（:107-116）はまだ触らない（Task 9 でまとめて書き換える。中間状態で嘘になる「5段」の字面は残るが、コミットメッセージに「暫定。Task 9 で反転」と書く）。

- [ ] **Step 2: `@theme inline` のタイポグラフィ節を書き換える**

`src/index.css:38-41` の4行を次に差し替え、冒頭コメント（`:18-34`）も新しい判断に合わせて書き直す:

```css
    /* タイポグラフィ（M23 決定1・2。設計スペック 2026-08-24-m23-core-typography-design.md）。
     *
     * 段は3サイズ4段: text-sm 14px（補助）／ text-base 16px（本文既定）／
     * text-base + leading-normal（複数行の自由記述とキャンバスの折り返し）／
     * text-xl 22px（文書タイトルとアプリ名。Tailwind 既定の 20px をここで再定義する。
     * 22px の出所は UI ノート D11 の確定スケール＝ D12 の 96→109 PPI 正規化）。
     *
     * **使ってよいのは sm / base / xl の3段だけ。**
     * text-xs（12px）は D11 の 14px 下限で廃止。text-lg は実使用 0 件のまま閉鎖。
     * text-2xl はアプリ名を 22px に統合して閉鎖（2px 差の段を体系に残さない）。
     * xs・lg・2xl・3xl 以上・任意値 text-[...] は conventions.test.ts が弾く。
     *
     * 行間は「詰めた値を既定にし、読ませる欄だけ leading-normal（1.5）を明示」（D11:
     * 密度は行高で稼ぎ、サイズでは稼がない）。セクション見出しの 130% は本文の
     * 125% に畳んである——16px では差が 0.8px しかなく、単行のラベルで視認できない */
    --font-heading: var(--font-sans);
    --font-sans: 'Geist Variable', 'Yu Gothic UI', 'Hiragino Sans', sans-serif;
    --font-mono: ui-monospace, 'Cascadia Mono', Consolas, monospace;
    --text-xl: 22px;
    --text-sm--line-height: 1.3;
    --text-base--line-height: 1.25;
    --text-xl--line-height: 1.3;
```

（`--text-xs--line-height` と `--text-lg--line-height` の行は**削除**する。xs/lg のクラスが消えるのは後続タスクだが、消えるまでの間 xs は Tailwind 既定の行間に戻るだけで、最終状態には影響しない。）

- [ ] **Step 3: `--grid-size` の由来コメントを書き換える**

`src/index.css:162-165` のコメントを次に（値は 24px のまま**動かさない**）:

```css
    /* 方眼紙のマス目。色ではないので palette.css には置かない
       （palette.css は色値だけを持つ）。複数行段の行高（16px × 1.5 ＝ 24px）と
       ちょうど一致し、方眼と文字行が揃って見える（M23 で 14×1.65≒23.1 の近似から
       ぴったりの一致になった） */
    --grid-size: 24px;
```

- [ ] **Step 4: 検証**

Run: `npm test` → 全部緑（この時点で赤くなるテストは無いはず——`--text-xs--line-height` を読むテストは 0 件、`--grid-size` の検査は `\d+px` と緩い。赤が出たら計画の矛盾として報告）。
Run: `npx vite build` して生成 CSS（`dist/assets/*.css`）を grep:
- `.text-xl` に `font-size: var(--text-xl` … 22px 由来が載ること（この時点で `text-xl` の使用は 0 件なので生成されない場合がある。**その場合は Task 4 の検証へ持ち越し、ここでは `--text-base--line-height` が `.text-base` に効いていることだけ確認する**）
- `.text-sm` の `line-height` が 1.3 系に変わっていること

Run: `npx tsc -b && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/styles/conventions.test.ts
git commit -m "feat(m23): 段の土台——text-xl を 22px に再定義し、行間を sm 1.3 / base 1.25 に詰める（段検査の xl 解禁は暫定形。禁止の反転は Task 9）"
```

---

### Task 2: canvas-font のフォールバックを新しい段に

**Files:**
- Modify: `src/core/canvas/canvas-font.ts:14-31`（フォールバック2定数）・`:44-48`（JSDoc）・`:56`（再フォールバック係数）
- Modify: `src/core/canvas/canvas-font.test.ts:6, :10, :13`（it 名とコメントの文言だけ）
- Modify: `src/core/canvas/wrap.test.ts:8-9, :96-98`（旧スケールの化石）

**Interfaces:**
- Produces: `FALLBACK_CANVAS_FONT` = 16px / lineHeight `16 * 1.5`（キャンバスの折り返しテキストは複数行段）、`FALLBACK_SMALL_FONT` = 14px / lineHeight `14 * 1.3`（補助段）。jsdom で走る全レイアウトテストの入力がこの2定数から来る

- [ ] **Step 1: 2定数と JSDoc を書き換える**

`src/core/canvas/canvas-font.ts`:

```ts
/**
 * 測れない環境（jsdom はレイアウトを持たない）用の既定値。
 * text-base + leading-normal（16px・行間 1.5。rev 9章 M23 決定1）
 * ——キャンバスの折り返しテキストは複数行段
 */
export const FALLBACK_CANVAS_FONT: CanvasFont = {
  font: 'normal 400 16px sans-serif',
  fontSize: 16,
  lineHeight: 16 * 1.5,
}

/**
 * 問いラベル列（text-sm）用の既定値。**FALLBACK_CANVAS_FONT を使い回さないこと**
 * ——text-sm は 14px・行間 1.3 で、複数行段（16px・1.5）とはサイズも行間も違う
 * （src/index.css の --text-sm--line-height）。
 * 揃えてしまうと、ラベル用の測定器が本文相当の高さを返し続け、
 * jsdom のテストでは両者の違いを検出できなくなる
 */
export const FALLBACK_SMALL_FONT: CanvasFont = {
  font: 'normal 400 14px sans-serif',
  fontSize: 14,
  lineHeight: 14 * 1.3,
}
```

`:44-48` の JSDoc「（14px）」→「（16px）」に。`:56` の `fontSize * 1.65` → `fontSize * 1.5`（行間が読めないときの再フォールバック。複数行段の値に合わせる）。

- [ ] **Step 2: テスト側の文言と化石を直す**

- `canvas-font.test.ts:6, :10` の it 名「（14px）」→「（16px）」、`:13` のコメント「text-xs」→「text-sm」
- `wrap.test.ts:8` `createEstimateMeasurer(14)` → `16`、`:9` `const SEQ_LH = 23.1` → `const SEQ_LH = 24`（16×1.5。コメントも直す）、`:96-98` `createEstimateMeasurer(14)` → `16`・`toBe(14)` → `toBe(16)`・`toBe(28)` → `toBe(32)`

- [ ] **Step 3: 検証**

Run: `npm test`。**`src/modules/sequence/questions.test.ts` が赤くなることを期待する**——`FALLBACK_SMALL_FONT` が 12→14px になり、`└ 実行済みだったら？` の見積もり幅（概算器で約 147px）が `QUESTION_LABEL_WIDTH(164) - GUTTER_INDENT(16) = 148px` に対し余裕 1px しか無いため（着手前スキャンの予測）。**赤くなったらこのタスクでは直さず、赤のまま Step 4 でコミットしない**——`QUESTION_LABEL_WIDTH` を広げる Task 6 と同居させると回帰の切り分けができないので、**Task 6 の Step 1 を先に前借りする**: `src/modules/sequence/layout.ts:28` の `QUESTION_LABEL_WIDTH = 164` を `180` に上げ、`:20-27` のコメントを「`text-sm`（14px）で `└ 実行済みだったら？` が概算 147px ＋ 字下げ 16px。閾値ちょうど（163）を避けて 180」に書き換えて、このタスクに含める。緑を確認してから次へ（赤くならなかった場合は 164 のまま触らず、その旨を報告に書く——Task 6 で改めて広げる）。

Run: `npx tsc -b && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/core/canvas/canvas-font.ts src/core/canvas/canvas-font.test.ts src/core/canvas/wrap.test.ts src/modules/sequence/layout.ts
git commit -m "feat(m23): canvas のフォールバックを新段へ——本文 16/1.5・ラベル 14/1.3、問いラベル列の幅を追従"
```

---

### Task 3: バッジ——text-sm 化と 20px 箱

**Files:**
- Modify: `src/components/badge-styles.ts:17-29`（`BADGE_BOX_HEIGHT`・`base`・コメント）
- Test: `src/components/Badge.dom.test.tsx`（変更不要のはず——`:38` が定数とクラスの対を検査する門番）

**Interfaces:**
- Consumes: なし
- Produces: `BADGE_BOX_HEIGHT = 20`。`badgeClass()` の戻り値に `h-[20px] text-sm leading-none`。課題ツリーの `src/modules/issue-tree/measure.ts:83` の `BADGE_HEIGHT = BADGE_BOX_HEIGHT + 2` は**導出式なので自動で 22 になる**（触らない）

- [ ] **Step 1: 定数だけ先に変えて、門番が赤くなることを見る**

`src/components/badge-styles.ts:23` を `export const BADGE_BOX_HEIGHT = 20` に。
Run: `npm test -- src/components/Badge.dom.test.tsx`
Expected: FAIL——`:38` の `expect(badgeClass('open')).toContain(\`h-[${BADGE_BOX_HEIGHT}px]\`)` が `h-[18px]` と食い違う（**この赤が「定数とクラスを対で直す」ことの担保**。赤くならなければ計画の矛盾として報告）。

- [ ] **Step 2: クラス文字列を追従させる**

`:28-29` を:

```ts
const base =
  'inline-flex h-[20px] items-center rounded border px-1.5 text-sm leading-none font-medium whitespace-nowrap'
```

`:17-18` のコメント「文字は `text-xs`（段は B で変わる。ここでは触らない）」→「文字は `text-sm`（M23 決定1。14px の補助段）。箱 20px は 14px の行＋枠 2px を `items-center` で挟んだ値」。`:22` の JSDoc は BADGE_BOX_HEIGHT の説明のままでよい。

- [ ] **Step 3: 検証**

Run: `npm test`
Expected: 全緑。とくに `HypothesisRow.dom.test.tsx` / `IssueTreeEditor.dom.test.tsx` のバッジ照合はすべて `badgeClass()` 経由なので自動追従（着手前スキャンで確認済み）。`issue-tree/layout.test.ts` も `BADGE_HEIGHT` を相対でしか使わないので緑のはず。
Run: `npx tsc -b && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/components/badge-styles.ts
git commit -m "feat(m23): バッジを text-sm・20px 箱に——BADGE_BOX_HEIGHT 18→20、課題ツリーの行高は導出式で自動追従"
```

---

### Task 4: 額縁と共通部品——タイトル 22px 統合・KeyHints の二重減衰解消・Button の1段上げ

**Files:**
- Modify: `src/App.tsx:857, :945, :972, :1036, :1039, :1044, :1058, :1063, :1069`
- Modify: `src/components/FileHeader.tsx:33, :53`
- Modify: `src/components/FileList.tsx:70, :80, :114, :135, :149, :172, :190`
- Modify: `src/components/Chip.tsx:14`
- Modify: `src/components/KeyHints.tsx:13, :16`
- Modify: `src/components/MissingTally.tsx:23`
- Modify: `src/components/IssueBanner.tsx:33, :43`
- Modify: `src/components/Toast.tsx:63, :73, :83`
- Modify: `src/components/TerminalPane.tsx:51, :84` ／ `src/components/TerminalTab.tsx:284`
- Modify: `src/components/ui/button.tsx:8, :25, :29`（base の `text-sm`→`text-base`、size `default` の `h-8`→`h-9`、size `icon` の `size-8`→`size-9`）

**Interfaces:**
- Consumes: Task 1 の `text-xl`（22px/1.3）
- Produces: 額縁・一覧・トースト・ヒント帯が新段。shadcn `Button` の既定が 36px 箱・16px ラベル

- [ ] **Step 1: 張り替え（機械的な対応表）**

| 対象 | 変更 |
| --- | --- |
| `App.tsx:857` | `text-2xl font-bold` → `text-xl font-medium`（アプリ名。決定1: 22px/500） |
| `FileHeader.tsx:33` | `text-base font-bold` → `text-xl font-medium`（ファイル名タイトル） |
| 上記2つ以外の `text-sm` 全部（App 7・FileList 3・Toast 1・IssueBanner 1・TerminalPane 1・TerminalTab 1・MissingTally 1） | → `text-base` |
| `text-xs` 全部（App:945・FileHeader:53・FileList:80,:135,:149・Chip:14・IssueBanner:43・Toast:73,:83・TerminalPane:51） | → `text-sm` |
| `FileList.tsx:190`（種類見出し h2） | `text-xs font-medium tracking-wide` → `text-base font-medium tracking-wide`（決定3: セクション見出しは 16px。面 `bg-surface-muted`・グレーは既存のまま） |
| `KeyHints.tsx:13` | `text-xs text-ink-muted` → `text-sm text-ink`（決定4: 小ささを残して薄さを外す）。`:16` のキー表記 span の `text-ink` は親と同値になるので**削除**し、span 自体は残す（強弱を後で戻せる継ぎ目として） |
| `App.tsx:1039, :1063`（複数行の説明文）・`IssueBanner.tsx:33`（複数行の ul）・`Toast.tsx:63`（複数行になりうる本文） | `text-base` に **`leading-normal` を足す**（決定2: 読ませる欄の側に明示が付く） |

- [ ] **Step 2: `ui/button.tsx` の1段上げ**

- `:8` base の `text-sm` → `text-base`
- `:25` size `default` の `h-8` → `h-9`
- `:29` size `icon` の `size-8` → `size-9`（App.tsx の Undo/Redo が帯の中で `default` と高さを揃えるため）
- ほかの size（`xs`/`sm`/`lg`/`icon-xs`/`icon-sm`/`icon-lg`）は**使用 0 件なので触らない**（`lg` が新既定と同じ h-9 になるが、生成物の未使用部分を整えるのは改定の仕事ではない）

- [ ] **Step 3: 検証**

Run: `npm test`（FileList.dom.test.tsx 等の className 照合は色・truncate だけなので緑のはず）
Run: `npx vite build` → 生成 CSS に `.text-xl` が **22px**（`--text-xl` 由来）で載ることを grep で確認（Task 1 Step 4 の持ち越し分）。`.leading-normal` が載ることも確認（`outline-dashed` の教訓——使っていないユーティリティは生成されない。rev 9章）
Run: `npx tsc -b && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/components
git commit -m "feat(m23): 額縁と共通部品を新段へ——タイトルとアプリ名を text-xl 22px に統合、KeyHints は薄さを外す、Button は 36px 箱・16px ラベル"
```

---

### Task 5: 用語集・エラーカタログ——本文 16px と複数行 150%

**Files:**
- Modify: `src/modules/glossary/GlossaryEditor.tsx:229, :251, :258, :277, :299, :476, :486`
- Modify: `src/modules/glossary/AliasCell.tsx:280`
- Modify: `src/modules/error-catalog/ErrorCatalogEditor.tsx:342, :347, :358, :382, :387, :399, :416, :471, :479`

**Interfaces:**
- Consumes: Task 1 の行間既定
- Produces: テーブル本文 16px/1.25、複数行の列だけ 1.5、カラム名 16px/500（決定3）

- [ ] **Step 1: 張り替え**

| 対象 | 変更 |
| --- | --- |
| `<table>` の `text-sm`（Glossary:277・ErrorCatalog:399） | → `text-base` |
| th（Glossary:299・ErrorCatalog:416） | `text-xs font-medium tracking-wide` → `text-base font-medium tracking-wide`（決定3。`bg-surface-muted`・`text-ink-muted` は既存のまま。モックで人間が 16px を裁定済み） |
| 検索 input（:229／:342）・空状態文・追加ボタン（:476,:486／:471,:479） | `text-sm` → `text-base` |
| 件数・注意書き・「表示」「絞り込み」ラベル（:251,:258／:347,:358,:382,:387）・AliasCell:280 の操作ヒント | `text-xs` → `text-sm`（補助段のまま） |

- [ ] **Step 2: 複数行の列に `leading-normal` を明示する**

対象は**自由記述の複数行が入る列のセルだけ**（D11 の「複数行テキスト（定義列・備考列）」）:
- 用語集: **定義**・**備考** の2列
- エラーカタログ: 自由記述の複数行列（列定義は `src/modules/error-catalog/` の columns 相当を実物で確認し、**「textarea で複数行が入る列」を機械的に選ぶ**——備考・対応方法など。単行の名称・ID・分類には付けない）

実装は各エディタの列描画で、該当列の `CellInput`（または td 内の要素）の className に `leading-normal` を足す。`cellInput` 共通定数（`GlossaryEditor.tsx:43-44` / `ErrorCatalogEditor.tsx:41-42`）там**足さない**——単行の列まで 1.5 になり、密度の既定（1.25）が死ぬ。列ごとの付与がどうしても既存構造に乗らない場合は「計画の矛盾」として報告（構造を歪めてまで列単位にする判断は実装者がしない）。

`CellInput` の行数算出（`src/components/CellInput.tsx:119-136`）は `getComputedStyle` の lineHeight を読むので追従する（着手前スキャンで確認済み。触らない）。

- [ ] **Step 3: 検証**

Run: `npm test`（GlossaryEditor.dom.test.tsx の className 照合は色だけ。緑のはず）
Run: `npx tsc -b && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/modules/glossary src/modules/error-catalog
git commit -m "feat(m23): 表エディタを新段へ——本文 16/1.25、定義・備考の複数行だけ 1.5、カラム名は 16px/500 のセクション見出し"
```

---

### Task 6: シーケンス——測定と描画を対で動かす

**Files:**
- Modify: `src/modules/sequence/SequenceEditor.tsx:102, :109, :833, :842, :922, :940, :983, :1015, :1071, :1094, :1105, :1123, :1188`
- Modify: `src/modules/sequence/GutterSlot.tsx:53, :60, :67-69`
- Modify: `src/modules/sequence/measure.ts:43-52`（`ANSWER_NOT_APPLICABLE_PREFIX_PAD_X` と JSDoc）
- Modify: `src/modules/sequence/layout.ts:19`（`GUTTER_HEADING_HEIGHT`）・`:20-28`（Task 2 で 180 に前借り済みならコメント整合のみ確認）
- Modify: `src/modules/sequence/ActorRefCell.tsx:69-73` ／ `src/modules/sequence/StepShapeCell.tsx:45` ／ `src/modules/sequence/GhostSlot.tsx:28, :34, :41`
- Test: `src/modules/sequence/ActorRefCell.dom.test.tsx:55`（`min-h-6` のリテラル）・`src/modules/sequence/SequenceEditor.dom.test.tsx:368`（コメントの `pl-16`）・`src/modules/sequence/layout.test.ts:170, :174`（コメント・it 名の「18」）

**Interfaces:**
- Consumes: Task 2 の `FALLBACK_*`
- Produces: `SEQ_FONT_CLASS = 'text-base leading-normal'`・`LABEL_FONT_CLASS = 'text-sm'`・`ANSWER_NOT_APPLICABLE_PREFIX_PAD_X = 72`・`GUTTER_HEADING_HEIGHT = 19`

- [ ] **Step 1: 見本要素の定数と描画側の字面を同時に張り替える**

**見本要素と描画セルは同じ段でなければならない**（rev 9章「測定層と描画層が同一のフォントトークンを参照」）。定数側:

```ts
const SEQ_FONT_CLASS = 'text-base leading-normal'   // :102。図の本文＝複数行段
const LABEL_FONT_CLASS = 'text-sm'                   // :109。問いラベル列＝補助段
```

描画側の字面（定数を経由していないインライン）を同じ段に:

| 対象 | 変更 |
| --- | --- |
| `:922`（参加者ヘッダ）・`:1071`（ステップラベル textarea） | `text-sm` → `text-base leading-normal` |
| `GutterSlot.tsx:67-69`（答えセル） | `text-sm` → `text-base leading-normal`、`pl-16` → `pl-18` |
| `GutterSlot.tsx:60`（「考慮不要」接頭 span） | `text-sm` → `text-base leading-normal`（答え本文と同じ行組みで1行目に揃える） |
| `GutterSlot.tsx:53`（問いラベル列） | `text-xs` → `text-sm` |
| `:940`（ガター集計帯）・`:833, :842, :1188`（ボタン） | `text-sm` → `text-base` |
| `:983`（`#N`）・`:1015`（`→`）・`:1105`（ガター行見出し）・`:1123`（「問いは立たない」） | `text-xs` → `text-sm` |
| `GhostSlot.tsx:28, :41` | `text-xs` → `text-sm` |
| `GhostSlot.tsx:34`（読み取り専用の残骸・複数行） | `text-sm` → `text-base leading-normal` |
| `StepShapeCell.tsx:45`・`ActorRefCell.tsx:73` | `text-sm` → `text-base`（単行 truncate。leading-normal は付けない） |

- [ ] **Step 2: 寸法定数を対で動かす**

- `measure.ts:52`: `ANSWER_NOT_APPLICABLE_PREFIX_PAD_X = 72`。JSDoc（`:43-51`）を「`pl-18` = 4.5rem = 72px。M23 で本文 16px 化に伴い `pl-16` から広げた（接頭「考慮不要」4字×16px＝64px が `left-2`(8px) から始まるため 8+64=72）。実効幅が狭くなるのは差分の 64px（72−8）。**GutterSlot.tsx の `pl-18` と対応する。片方だけ変えないこと**」に書き換える
- `layout.ts:19`: `GUTTER_HEADING_HEIGHT = 19`（text-sm 1行＝14×1.3＝18.2 の切り上げ。コメントに式を書く）
- `SequenceEditor.tsx:1094` の裸の `18`: `GUTTER_HEADING_HEIGHT` に置き換える（意味は「小さい字のもう1行ぶん」——定数と同じもの。コメントを1行添える）
- `layout.ts:28` の `QUESTION_LABEL_WIDTH`: Task 2 で 180 へ前借り済みならそのまま。未変更で残っていたらここで 180 に（コメントも Task 2 Step 3 の文面で）
- `ActorRefCell.tsx:73`: `min-h-6` → `min-h-6.5`（26px ＝ 行 16×1.25=20 ＋ `py-0.5` 4 ＋ 枠 2。**空名トリガーと文字入りの実高が同値になり、open-issues の「2px 残差」が解消する**）。`:69-72` の「外さないこと」の註に新しい値の根拠（26px の内訳）を書き足す
- `SequenceEditor.tsx:988, :1016` の `railTop + 4`（text-xs のベースライン合わせだった裸の 4）: **触らない**。`#N`・`→` が text-sm になってもレールの中の縦位置は実機で見ないと決められない——実機確認の項目（スペック 検証 9 の周辺）で見て、ずれていたらそのとき直す。この判断をコメントには書かず、報告にだけ書く

- [ ] **Step 3: テストの字面を追従させる**

- `ActorRefCell.dom.test.tsx:55`: `toContain('min-h-6')` → `toContain('min-h-6.5')`（**先にテストだけ変えて赤を見る**——`min-h-6.5` はまだ実装に無い、の順でもよいが、Step 1 で同時に変えた場合は「実装を一時的に `min-h-6` に戻して赤を確認」する）
- `SequenceEditor.dom.test.tsx:368` のコメント `pl-16` → `pl-18`
- `layout.test.ts:170` のコメント「見出し 18 を足して 116」→ 19 で計算し直した値に、`:174` の it 名「（見出し 18 は 44 に届かない）」→「（見出し 19 は 44 に届かない）」（19 < 44 なのでアサーション自体は緑のまま）

- [ ] **Step 4: 検証**

Run: `npm test`
Expected: 全緑。とくに——
- `SequenceEditor.dom.test.tsx:367-387`（wrap 回帰）: 不等式なので 72 でも緑（着手前スキャンで確認済み）
- `questions.test.ts`: `QUESTION_LABEL_WIDTH = 180` で全問1行
- `layout.test.ts`: `GUTTER_HEADING_HEIGHT` を import しているので 19 に自動追従

Run: `npx tsc -b && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/modules/sequence
git commit -m "feat(m23): シーケンスを新段へ——図の本文は 16/1.5、ラベル列は 14/1.3、考慮不要の取り置きを 72px に、min-h を実高と同値に"
```

---

### Task 7: ロジックツリー・課題ツリー——ノードと行の段

**Files:**
- Modify: `src/modules/logic-tree/LogicTreeEditor.tsx:47, :322` ／ `src/modules/logic-tree/NodeBox.tsx:49`
- Modify: `src/modules/issue-tree/measure.ts:32-35, :55`（`ISSUE_TITLE_MIN_WIDTH`・`TITLE_FONT_CLASS`）
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx:96, :98, :184, :859, :867`
- Modify: `src/modules/issue-tree/IssueBox.tsx:176` ／ `src/modules/issue-tree/HypothesisRow.tsx:83, :86, :173, :219, :266, :312, :330, :347, :359`
- Test: `src/modules/issue-tree/layout.test.ts:16-18` ／ `src/modules/issue-tree/HypothesisRow.dom.test.tsx:26-28` ／ `src/modules/issue-tree/IssueTreeEdges.dom.test.tsx:19-21`（フィクスチャの旧スケール）・`src/modules/issue-tree/IssueTreeEditor.dom.test.tsx:252`（コメント）

**Interfaces:**
- Consumes: Task 2・3
- Produces: `NODE_FONT_CLASS`／`BODY_FONT_CLASS` = `'text-base leading-normal'`、`TITLE_FONT_CLASS = 'text-base leading-normal font-semibold'`、`SMALL_FONT_CLASS = 'text-sm'`、`ISSUE_TITLE_MIN_WIDTH = 128`

- [ ] **Step 1: 定数と描画の字面を同時に張り替える**

| 対象 | 変更 |
| --- | --- |
| `LogicTreeEditor.tsx:47` `NODE_FONT_CLASS` | `'text-sm'` → `'text-base leading-normal'` |
| `NodeBox.tsx:49` | `text-sm` → `text-base leading-normal` |
| `IssueTreeEditor.tsx:96` `BODY_FONT_CLASS` | `'text-sm'` → `'text-base leading-normal'` |
| `IssueTreeEditor.tsx:98` `SMALL_FONT_CLASS` | `'text-xs'` → `'text-sm'` |
| `issue-tree/measure.ts:55` `TITLE_FONT_CLASS` | `'text-sm font-semibold'` → `'text-base leading-normal font-semibold'`（見本 `IssueTreeEditor.tsx:825-831` と描画 `IssueBox.tsx:120` が共有しているので1箇所で両方動く） |
| `HypothesisRow.tsx:86` `staticTextClass`・`:173`（畳まれた行）・`:219, :266, :312, :330`（inputClass の呼び出し） | `text-sm` → `text-base leading-normal` |
| `HypothesisRow.tsx:83` `sectionLabelClass`・`:347`（「根拠へ」）・`:359`（「＋ FB」）・`IssueTreeEditor.tsx:184` `TRIGGER_FACE`・`IssueBox.tsx:176`（見送りの理由） | `text-xs` → `text-sm`（`leading-none` は `:83` のまま） |
| `LogicTreeEditor.tsx:322`・`IssueTreeEditor.tsx:859, :867`（ボタン） | `text-sm` → `text-base` |

- [ ] **Step 2: 幅の下限を追従させる**

`issue-tree/measure.ts:35`: `ISSUE_TITLE_MIN_WIDTH = 128`（`:32` のコメント「text-sm（14px）で日本語 8 字ぶん」→「text-base（16px）で日本語 8 字ぶん」）。
`issue-tree/layout.ts:465-472` の `minWidth <= maxWidth` の余裕を**再計算してコメントを直す**: バッジ幅は `fonts.small.measure` の実測（14px 化で伸びる）、`reserve` の現実値を概算し、`ISSUE_MAX_WIDTH(320) - reserve` が新しい `minWidth`（128 + inset）を割らないことを確かめる。割るならこの検算ごと「計画の矛盾」として報告（語を短くする判断は人間の裁量）。

- [ ] **Step 3: テストのフィクスチャを新スケールに**

3ファイル（`layout.test.ts:16-18` / `HypothesisRow.dom.test.tsx:26-28` / `IssueTreeEdges.dom.test.tsx:19-21`）の fonts フィクスチャを:

```ts
  title: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  body: { measure: createEstimateMeasurer(16), lineHeight: 24 },
  small: { measure: createEstimateMeasurer(14), lineHeight: 18 },
```

（アサーションは `fonts.*` 参照と相対比較なので追従する。赤が出たら退化ケースを踏んだ証拠なので報告。）
`IssueTreeEditor.dom.test.tsx:252` のコメント「`text-xs`→`text-sm`」の例示は「`text-sm`→`text-base`」に。

- [ ] **Step 4: 検証**

Run: `npm test` → 全緑
Run: `npx tsc -b && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/modules/logic-tree src/modules/issue-tree
git commit -m "feat(m23): キャンバス2本を新段へ——ノード・行の本文は 16/1.5、小さい字は 14/1.3、課題タイトルの下限幅を 128 に"
```

---

### Task 8: 残骸ゼロの確認と `#N`・グリフの座標の目視根拠

- [ ] **Step 1: 旧段の残骸を全数 grep する**

```bash
grep -rnE '\btext-(xs|lg|2xl)\b' src/ --include='*.ts' --include='*.tsx' | grep -v components/ui/ | grep -v '\.test\.'
```

Expected: **コメント内の言及以外 0 件**（コメントは Task 10 の文書更新と一緒に直すものだけ残ってよいが、クラス指定としての残骸は 0）。残っていたらそのタスクの漏れとして張り替える。

- [ ] **Step 2: 生成 CSS の確認**

Run: `npx vite build` → 生成 CSS を grep:
- `.text-xl` … 22px（`--text-xl` 由来）が載っている
- `.leading-normal` が載っている
- `.text-sm` の line-height が 1.3 系、`.text-base` が 1.25 系

- [ ] **Step 3: Commit（残骸修正があった場合のみ）**

```bash
git add -A src/
git commit -m "fix(m23): 張り替えの漏れを掃除"
```

---

### Task 9: 機械検査の反転——段3つ・leading 許可リスト

**Files:**
- Modify: `src/styles/conventions.test.ts:12-15`（EXCLUDED の理由コメント）・`:105-123`（段検査の反転）・新しい describe を追加（leading 許可リスト）

**Interfaces:**
- Consumes: Task 4〜8 で旧段の使用が 0 件になっていること
- Produces: `text-xs`/`text-lg`/`text-2xl` と `leading-none`/`leading-normal` 以外の `leading-*` が機械的に赤くなる状態

- [ ] **Step 1: 段検査を反転させ、赤くならないことを見る前に「わざと違反」で赤を見る**

`:105-123` を次に書き換える:

```ts
describe('フォントサイズの段階（M7 決定6 → M23 決定1 で3サイズ4段に再定義）', () => {
  it('text-sm / text-base / text-xl 以外を使っていない', () => {
    // 「許可外」を直接探す。text-ink のような色のユーティリティと区別する
    // 必要があるので、許可リストとの照合ではなく許可外の段と任意値を弾く。
    //
    // **xs は D11 の 14px 下限で廃止、lg は実使用 0 件のまま閉鎖、2xl は
    // アプリ名を text-xl（22px 再定義）へ統合して閉鎖した（M23）。**
    // 2px 差の段（22 と 24）を体系に残さないため、xl と 2xl は同時に開けない。
    //
    // 任意値側は末尾に \b を付けない——`]` の直後は語構成文字ではないため
    // \b が成立せず、`text-[13px]` のような検出が一度も発火しなかった
    const offenders = offendingLines(/\btext-(xs|lg|[2-9]xl)\b|\btext-\[[^\]]*\]/)
    expect(
      offenders,
      `使ってよいのは text-sm / text-base / text-xl の3段（複数行は text-base + leading-normal）:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
```

検証の順序: まず適当なソース1箇所に `text-xs` を仮置きして `npm test -- src/styles/conventions.test.ts` が**赤くなる**ことを見てから、仮置きを戻す（「守っていないテスト」を作らないための1手。lessons-for-planning「順序を固定するテストを書いたら壊して確認」と同じ運用）。

- [ ] **Step 2: leading の許可リスト検査を新設する**

段検査の describe の直後に:

```ts
describe('行間の明示（M23 決定2）', () => {
  it('leading-* は leading-none（バッジ）と leading-normal（複数行の欄）だけ', () => {
    // 行間の既定は @theme が持つ（sm 1.3 / base 1.25）。明示してよいのは
    // 「読ませる欄」の leading-normal（1.5）と、バッジの leading-none だけ。
    // leading-5 のような数値指定は「行の高さをクラスで固定する書き方」で、
    // 段の再定義から静かに取り残される（open-issues で管理していた形）。
    // 任意値 leading-[...] も同じ理由で弾く
    const offenders = offendingLines(/\bleading-(?!none\b|normal\b)[\w[\].%-]+/)
    expect(
      offenders,
      `leading-* の明示は none / normal だけ（既定は @theme の行間トークン）:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
```

こちらも同じ順序で、`leading-5` を1箇所仮置きして赤を確認してから戻す。**この計画自身のコード・コメントがこの検査に掛からないことは着手前に確認済み**（実クラスは `leading-none` 2件と `leading-normal`（本計画で足すもの）だけ。コメントは `stripComments` で除去される）。

- [ ] **Step 3: EXCLUDED の理由コメントを直す**

`:12-15` の「shadcn の生成物。rev 7章『手で整形しない』」は**事実誤り**（rev 7章はソースコピー方式で改造自由と書いている。M21 申し送りで確定済み）。次に差し替える:

```ts
  // shadcn の生成物。改造は自由（rev 7章のソースコピー方式）だが、
  // 段・行間の規約は自作コードの側に課す——生成物の字面まで検査に合わせて
  // 書き換え続ける保守を負わないため（M23。button.tsx の text-base / h-9 は
  // 決定5 による意図した改造）
```

- [ ] **Step 4: 検証**

Run: `npm test` → 全緑（`components/ui/` の `text-xs`・`text-[0.8rem]` は EXCLUDED で守られている）
Run: `npx tsc -b && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/styles/conventions.test.ts
git commit -m "test(m23): 段検査を3段に反転し、leading の許可リスト検査を新設——台帳の「行の高さをクラスで固定する書き方」を閉じる"
```

---

### Task 10: 文書への反映（実機確認とは束ねない）

**Files:**
- Modify: `docs/overview-rev.md` 9章（M7 決定6 の節・方眼の 23.1px の記述・D13 関連）
- Modify: `docs/facet-UI設計ノート.md` D13（rev.4 訂正の追記）
- Modify: `docs/open-issues.md`
- Modify: `docs/lessons-for-planning.md`（worktree 基底の教訓）

- [ ] **Step 1: rev 9章の書き換え**

「フォントは M7 で確定した」の項（`docs/overview-rev.md:323` 付近）を M23 の確定内容に書き換える。含めるもの:
- 3サイズ4段の表（sm 14/1.3 補助・バッジ・ヒント／base 16/1.25 本文既定／base+leading-normal 16/1.5 複数行の自由記述とキャンバスの折り返し／xl 22/1.3/500 文書タイトルとアプリ名）と、その出所（D11・D12 の 109 PPI 正規化）
- **xs 廃止（14px 下限）・lg 閉鎖（実使用 0 件だった）・2xl 閉鎖（22 と 24 の 2px 差の段を残さない）**。`--text-xl: 22px` は index.css の `@theme` で再定義
- セクション見出し＝ base + font-medium + tracking-wide + ink-muted + surface-muted（130% は 125% に畳んだ。0.8px の差は単行ラベルで視認できない）
- KeyHints は「小さいまま、薄さを外した」（D11 の二重減衰の解消。14px・ink）
- 行間の明示は `leading-none`（バッジ）と `leading-normal`（複数行）だけ——conventions.test.ts が弾く
- 方眼 24px の項（`:320` 付近）の「text-sm の行高（14px × 1.65 ＝ 23.1px）とほぼ一致」→「複数行段の行高（16px × 1.5 ＝ 24px）とちょうど一致」
- D13 の修正（決定7）: 既定 100%・正規化は基準値側。**手動ズーム（Ctrl+±、`zoomHotkeysEnabled`）は逃げ道として残す**（2026-08-16 の人間の判断を M23 で追認。ズーム中の 1px 罫線の滲みは代償として受ける）

- [ ] **Step 2: UI ノート D13 に rev.4 訂正を追記**

D13 の節の末尾に「rev.4（M23）での訂正」として、決定7 の内容（100% 固定 → 既定 100%＋手動ズームの逃げ道は残す。理由と経緯）を追記する。既存の rev.2/rev.3 の訂正と同じ形式。

- [ ] **Step 3: open-issues.md の増減**

- **消す**: 「UI ノートの B（タイポグラフィ）が未着手」（デザイン節 `[M21]`）
- **消す**: 「行の高さをクラスで固定する書き方が2箇所ある」（Task 9 の許可リスト検査で書き方が決まり、`leading-5` は M22 で既に `leading-none` に置換済み。予告——2件目が出たら書き方を決める——が発火して決着した経緯を消し込みの理由として書く）
- **書き換え**: ActorRefCell の「文字入りとの 2px 残差」の項 → `min-h-6.5`（26px）で実高と同値になった旨で消すか、実機確認待ちなら残して更新（実機確認前なら**消さない**）
- **足す**: 「次に手を付ける候補」へ M23 の実機確認が未実施であること（見た目が成果物のマイルストーン。issue-tree-m3・M21・M22 と同じ扱い）
- **足す**（デザイン節・軽微）: ドロップダウンのメニュー項目が 14px のまま据え置きであること（決定8。実機確認の項目 10 で判断）

- [ ] **Step 4: lessons-for-planning.md への追記**

「検証手順」節に1項追加（このマイルストーンで実際に踏んだ形）:

> - **worktree を作ったら、最初のコミットを積む前に基底 SHA を確認する。** `EnterWorktree` の既定は `origin/main` から分岐するが、`origin/main` がローカルの作業ブランチ（例: `issue-tree/main`）より古いままのことがある。M23 では基底が2マイルストーンぶん古く、着手前スキャン2本を古い木に対して実行してやり直した。`git log --oneline -1` と brief の指定 SHA を突き合わせる1行を、計画の Global Constraints ではなく **worktree 作成直後**に置く

- [ ] **Step 5: 検証と Commit**

rev の記述はすべて**実装後のコード実物**（index.css・conventions.test.ts・badge-styles.ts）と突き合わせてから書く（lessons: 訂正後の文言そのものを一次資料に照らす）。

```bash
git add docs/
git commit -m "docs(m23): rev 9章を3サイズ4段に書き換え、D13 に rev.4 訂正、open-issues の増減、worktree 基底の教訓"
```

---

### Task 11: 申し送り（history）と最終検証

**Files:**
- Create: `docs/history/m23-core-typography.md`

- [ ] **Step 1: 最終検証（全部通す）**

```bash
npm test && npx tsc -b && npm run lint
(cd src-tauri && cargo test)
```

- [ ] **Step 2: 申し送りを書く**

`docs/history/m23-core-typography.md` を M21/M22 と同じ構成で新規作成:
- 冒頭に「追記専用」の定型と、マイルストーンの一文（段の張り替えの要約）
- 計画・スペックへのリンク（スペックには実寸比較モックの Artifact URL が記録済み）
- 「実装で確定した事項」——実装中に出た計画との差分（実装者の報告から転記。**無ければ無いと書く**）
- **「実機確認について——未実施である」**の節に、スペック「検証」の 11 項目のチェックリストを**空のまま**写す（通ったかどうかの記録ではない旨の定型を含む）。`npm install` と `npm run tauri dev`、確認後の `sample-project` 後片付けコマンドも定型どおり
- 実機確認とこのタスクを**束ねない**（lessons）——チェックリストは空のまま、open-issues の候補（Task 10 で追加済み）が消し込みの管理を持つ

- [ ] **Step 3: Commit**

```bash
git add docs/history/m23-core-typography.md
git commit -m "docs(m23): 申し送り——実機確認は未実施のまま残す"
```

---

## 実機確認（人間の作業。エージェントは実行しない）

スペック「検証」の 11 項目（`2026-08-24-m23-core-typography-design.md` 末尾）。Task 11 の申し送りに空のチェックリストとして写し、open-issues の候補が消し込みを管理する。確認で出た変更要求は計画外修正として扱う（症状と人間の言葉を分けて記録する——lessons「タスク分割」節）。
