# M26: フォント同梱（UI ノート E ＝ D6・D7・D8）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OS 依存のフォント導出（Geist＋Yu Gothic UI フォールバック）を IBM Plex 3書体（Sans 可変・Sans JP static 400/500/600・Mono 400/700）の同梱に置き換え、UI ノートの実施項目を全部閉じる。

**Architecture:** fontsource の woff2 だけを参照する生成 CSS（`src/styles/fonts.css`）を1枚持ち、`--font-sans` / `--font-mono` を差し替える。unicode-range 分割の遅延スライスが後から届いたときの測り直しは、`document.fonts` の `ready`＋`loadingdone` を世代として数える共有フックへ一本化する。

**Tech Stack:** `@fontsource-variable/ibm-plex-sans` / `@fontsource/ibm-plex-sans-jp` / `@fontsource/ibm-plex-mono`（いずれも 5.3.0、OFL-1.1）、Vite 8、Tailwind v4、xterm 6。

**Spec:** [`../../facet-UI設計ノート.md`](../../facet-UI設計ノート.md) の D6・D7・D8・§4・**§7 U1「2026-08-26 の決着」**（設計の正。再議論しない）・§8。関連: [`../../overview-rev.md`](../../overview-rev.md) 9章（書体・測定層の項）。

## Global Constraints

- **U1 は決着済み（8fc3f6d。人間の合意取得済み）。構成・書体の選定を蒸し返さない。** 正は UI ノート §7 U1 の「2026-08-26 の決着」の節。
- **字数サブセット化は禁止**（UI ノート §4.2）。unicode-range の分割は fontsource のまま使う。**分割数は 1 ウェイトあたり 123**（U1 決着と本計画の初版が書いた「124」は `files/` のファイル数で、CSS から参照されない一体型 `japanese-*-normal.woff2` を 1 本余計に数えていた——Task 1 の実装者が実物で検出した訂正）。
- **fontsource static 版の CSS は素の import 禁物**——woff2 と woff を両方参照する（着手前スキャンで実物確認済み）。woff2 だけ参照する CSS を自前で持つ。
- **CSP は変えない**（`font-src 'self'`。data: を足さない）。vite の 4KB 未満インライン化（data URI）は**フォントに対して止める**（下記スキャン(3)）。
- worktree: `worktree-m26-core-font-bundle`（`.claude/worktrees/m26-core-font-bundle`）。**基底 8fc3f6d は worktree 作成直後に `git log --oneline -1` で確認済み**（origin/issue-tree/main に到達済みなので push 不要も確認済み）。
- テストの期待値に件数を書かない。「このファイルの `it` がすべて緑」で書く。
- `sample-project/` は触らない。実機確認で触ったら完了処理の手順どおり戻す。
- 計画の指示が矛盾していたら辻褄を合わせず「計画の矛盾」として報告する。**ただし既存実装・実物のパッケージと一致すべき値は実物が正。**
- 文書・コメント・コミットメッセージは日本語。

---

## 着手前スキャンの結果（2026-08-26。以下のタスクはこの確定の上に立つ）

1. **現行の構成**: `src/index.css:4` が `@fontsource-variable/geist` を素 import、`--font-sans: 'Geist Variable', 'Yu Gothic UI', 'Hiragino Sans', sans-serif`（`:34`）、`--font-mono: ui-monospace, 'Cascadia Mono', Consolas, monospace`（`:35`）。**`font-mono` クラスの使用は src で 0 件**（トークン定義のみ。D10 の等幅割り当ては §8 の優先表に無く、M26 のスコープ外）。**端末（`src/components/TerminalTab.tsx:77`）は `fontFamily` 未指定**＝xterm 既定（courier 系）で、`--font-mono` を読んでいない。
2. **fontsource 5.3.0 の実物**（tarball を展開して確認）:
   - `@fontsource/ibm-plex-sans-jp` の `400.css` 等は `src: url(...woff2) format('woff2'), url(...woff) format('woff')` の**両参照**。分割は **1ウェイトあたり 123 ブロック**（`files/` には加えて CSS から参照されない一体型 `japanese-*-normal.woff2` が 1 本ある——ファイル数 124 と数え違えないこと）。woff2 は 400/500/600 合計 **6.8MB**。`files/` には 7 ウェイト分 868 本ずつ（woff2/woff）入っているが、**vite は CSS が参照したアセットしか emit しない**ので、参照を 3 ウェイトに絞れば同梱もそれだけになる。
   - `@fontsource-variable/ibm-plex-sans` の `index.css` は wght 軸 normal のみ・**woff2 のみ**（`format('woff2-variations')`）・6 分割で合計 **約 159KB**。**U1 決着の「約1.3MB」はパッケージ全体（italic・wdth 軸込み）の値**であり、実同梱はこの 159KB。決定は変わらない（軽くなる方向の訂正）——history に実測を記録する。
   - `@fontsource/ibm-plex-mono` の 400＋700（normal）woff2 合計 **約 97KB**。static なので woff 両参照（JP と同じ）。
   - ファミリ名は `'IBM Plex Sans Variable'` / `'IBM Plex Sans JP'` / `'IBM Plex Mono'`。3 パッケージとも `LICENSE`（OFL）を同梱。
3. **CSP の罠（この計画が新たに見つけた前提）**: JP の woff2 のうち **24 本が 4096 バイト未満**で、vite の既定 `build.assetsInlineLimit`（4096）が data URI として CSS へインライン化する。CSP は `font-src 'self'`（data: 無し）なので、**そのスライスだけ静かにブロックされ、珍しい漢字だけ豆腐化する**。`vite.config.ts` で `.woff2` のインライン化を止める（Task 1）。検証は生成 CSS／dist を読むまで完了としない（lessons「CSS のカスケード…生成 CSS を見るまで」）。
4. **測り直しの現状**: 3 エディタ（`LogicTreeEditor.tsx:82-108` / `SequenceEditor.tsx:275-305` / `IssueTreeEditor.tsx:348-382`）が**同形のブロック**（`fontGeneration` state ＋ `document.fonts.ready` で `readFont()`＋世代インクリメント）を各自持つ。`fonts.ready` は**初回の読み込みでしか解決しない**ので、遅延スライスの到着（前提2）は拾えない。番人は `LogicTreeEditor.font.dom.test.tsx`（観測点は `style.height`。M24 の教訓どおり黙らせない）。
5. **テーブルセル（`src/components/CellInput.tsx`）にも同種の穴**: `measure()` は値の変化と幅の変化（ResizeObserver）でしか走らないので、遅延スライスの到着で折り返しが変わっても行数が古いまま残る（次の入力まで）。
6. **`font-bold` の使用は `src/App.tsx:1055` の 1 箇所のみ**（ファイルが開けない見出し）。`TITLE_FONT_CLASS` の `font-semibold`（600）は JP static 600 で実体化する。カラム名は既に `font-medium`＋`tracking-wide`＋`ink-muted`＋`bg-surface-muted`（rev 9章）——**E で Medium が実効化するだけで、クラスは変わらない**。
7. **既存の機械検査はフォントを見ていない**: `conventions.test.ts`（段・行間・角丸・色）も `palette.test.ts` も `--font-*` に触れない。新構成で赤くなる既存テストは無い見込み（通しで確認はする）。
8. **'Geist' の残存**（打ち切りの無い grep 済み）: 消すのは `src/index.css`・`package.json`・`THIRD-PARTY-NOTICES.md:12`・`README.md:238`・3 エディタのコメント（`LogicTreeEditor.tsx:94` / `IssueTreeEditor.tsx:368` / `SequenceEditor.tsx:291`）。**残してよいのは記録物**——`docs/history/`・`docs/superpowers/plans/`（不変）・`docs/issue-tree/俯瞰モック/*.html`（当時のモック）・UI ノート §7 U1（決着の記録）。**`docs/glossary/scope.md:119-120` は正文書で、「日本語 Web フォントは同梱しない」が M26 で反転する**——訂正注記が要る（Task 7）。
9. **前提4の周辺**: xterm 6 の既定レンダラは DOM。`fontFamily` を後から代入すればセル寸法は測り直される。ただし `fonts.ready` は「使われたフォント」しか待たないので、**端末がまだ 1 文字も Plex Mono で描いていない時点では ready がスライスの到着を保証しない**——`document.fonts.load('13px "IBM Plex Mono"', ...)` で明示的に読み込んでから `fontFamily` を入れる（Task 2）。

---

### Task 1: フォント資産の導入と生成 CSS（woff2 のみ）

**Files:**
- Modify: `package.json`（依存 3 つ追加）
- Create: `scripts/gen-fonts-css.mjs`
- Create: `src/styles/fonts.css`（生成物だがコミットする）
- Create: `src/styles/fonts.test.ts`
- Modify: `vite.config.ts`（`build.assetsInlineLimit`）

**Interfaces:**
- Produces: `src/styles/fonts.css` — `@font-face` 定義（`'IBM Plex Sans Variable'` wght 100–700 / `'IBM Plex Sans JP'` 400・500・600 / `'IBM Plex Mono'` 400・700。すべて woff2 のみ・`font-display: swap`・unicode-range 付き）。Task 2 が `index.css` から import する。

- [ ] **Step 1: 依存を追加する**

```
npm install @fontsource-variable/ibm-plex-sans @fontsource/ibm-plex-sans-jp @fontsource/ibm-plex-mono
```

- [ ] **Step 2: 入った実物を確認する**（lessons「ライブラリの既定値は node_modules の実物で確かめる」）

`node_modules/@fontsource/ibm-plex-sans-jp/400.css` の先頭ブロックが woff2＋woff の両参照であること、`node_modules/@fontsource-variable/ibm-plex-sans/index.css` が woff2 のみであることを開いて確認。スキャン(2) と食い違ったら（版が進んで形が変わっていたら）**計画の矛盾として報告**する。

- [ ] **Step 3: 失敗するテストを書く**

`src/styles/fonts.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 同梱フォントの生成 CSS（M26。UI ノート D6〜D8・§7 U1）の検査。
 *
 * fontsource の static 版 CSS は woff2 と woff を両方参照するので素の
 * import はできない（woff まで dist に入る）。woff2 だけ参照する CSS を
 * scripts/gen-fonts-css.mjs が生成し、その形をここで固定する。
 * fontsource を更新してファイル名や分割数が変わると、ここが赤くなる
 */
const CSS_PATH = fileURLToPath(new URL('./fonts.css', import.meta.url))
const css = readFileSync(CSS_PATH, 'utf8')
const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? []

const facesOf = (family: string, weight: string): string[] =>
  faces.filter(
    (f) => f.includes(`'${family}'`) && new RegExp(`font-weight:\\s*${weight};`).test(f),
  )

describe('同梱フォントの生成 CSS（M26）', () => {
  it('woff2 以外のフォント参照が無い', () => {
    // .woff2) は .woff) に一致しない（2 が続くので閉じ括弧が来ない）
    expect(css).not.toMatch(/\.woff\)/)
    expect(css).not.toMatch(/format\('woff'\)/)
  })

  it('3書体と必要ウェイトが揃っている', () => {
    expect(facesOf('IBM Plex Sans Variable', '100 700').length).toBeGreaterThan(0)
    // JP は unicode-range 123 分割（§4.2: 字数サブセット禁止。全字収録のまま分割だけ使う。
    // files/ にはこの他に CSS から参照されない一体型 japanese-*.woff2 が 1 本あるが、
    // 参照しないので同梱もされない——分割数をファイル数 124 と数え違えないこと）
    for (const w of ['400', '500', '600']) {
      expect(facesOf('IBM Plex Sans JP', w).length, `JP ${w}`).toBe(123)
    }
    for (const w of ['400', '700']) {
      expect(facesOf('IBM Plex Mono', w).length, `Mono ${w}`).toBeGreaterThan(0)
    }
  })

  it('参照している woff2 がすべて node_modules に実在する', () => {
    const urls = [...css.matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => m[1]!)
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) {
      expect(existsSync(path.resolve(path.dirname(CSS_PATH), u)), u).toBe(true)
    }
  })
})
```

- [ ] **Step 4: テストが落ちることを確認する**

Run: `npx vitest run src/styles/fonts.test.ts`
Expected: FAIL（`fonts.css` が存在しない）

- [ ] **Step 5: 生成スクリプトを書き、実行する**

`scripts/gen-fonts-css.mjs`:

```js
/**
 * fontsource の CSS から woff2 参照だけを残した src/styles/fonts.css を生成する（M26）。
 *
 * static 版（Sans JP / Mono）の CSS は woff2 と woff を両参照しており、
 * 素の import では woff（不要な旧形式。JP だけで数MB）まで dist に入る。
 * ここで woff の参照を落とし、url をこのリポジトリからの相対パスに書き換える。
 *
 * 再生成: node scripts/gen-fonts-css.mjs
 * （fontsource の版を上げたときに実行する。形は src/styles/fonts.test.ts が固定する）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SOURCES = [
  // 可変版の index.css は wght 軸の normal のみ（italic は別ファイル）で、woff2 のみ参照
  { pkg: '@fontsource-variable/ibm-plex-sans', css: ['index.css'] },
  // JP に variable 版は npm に存在しない（U1 決着）。static の 3 ウェイトだけ参照する
  { pkg: '@fontsource/ibm-plex-sans-jp', css: ['400.css', '500.css', '600.css'] },
  // 700 は端末の ANSI 太字用（U1 決着）
  { pkg: '@fontsource/ibm-plex-mono', css: ['400.css', '700.css'] },
]

const root = path.resolve(import.meta.dirname, '..')
const out = [
  '/* 生成物。手で編集しない。scripts/gen-fonts-css.mjs が fontsource の CSS から',
  ' * woff2 の参照だけを残して作る（woff は落とす）。再生成は同スクリプトを実行 */',
]
for (const { pkg, css } of SOURCES) {
  for (const file of css) {
    const text = readFileSync(path.join(root, 'node_modules', pkg, file), 'utf8')
    const rewritten = text
      // src リストから woff（非 woff2）の参照を落とす。.woff2) には一致しない
      .replace(/,\s*url\([^)]+\.woff\)\s*format\('woff'\)/g, '')
      // url をこのファイル（src/styles/）からの相対パスへ
      .replace(/url\(\.\/files\//g, `url(../../node_modules/${pkg}/files/`)
    out.push(`/* ---- ${pkg}/${file} ---- */`)
    out.push(rewritten)
  }
}
writeFileSync(path.join(root, 'src', 'styles', 'fonts.css'), out.join('\n'))
console.log('src/styles/fonts.css を生成した')
```

Run: `node scripts/gen-fonts-css.mjs`

- [ ] **Step 6: テストが通ることを確認する**

Run: `npx vitest run src/styles/fonts.test.ts`
Expected: PASS（3 本すべて）

- [ ] **Step 7: vite のフォントの data URI 化を止める**（スキャン(3) の CSP の罠）

`vite.config.ts` の `defineConfig` に追加:

```ts
  build: {
    // フォントを data URI にインライン化しない。JP の woff2 には 4KB 未満の
    // スライスが 24 本あり、既定の assetsInlineLimit(4096) だと CSS 内の
    // data: URI になる——CSP の font-src は 'self' だけ（data: 無し）なので、
    // そのスライスだけ静かにブロックされ、珍しい漢字が豆腐になる。
    // CSP を緩める側ではなくインライン化を止める側で塞ぐ
    assetsInlineLimit: (filePath) => (filePath.endsWith('.woff2') ? false : undefined),
  },
```

- [ ] **Step 8: 全テスト・型・lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑（この時点では fonts.css はどこからも import されていない）

- [ ] **Step 9: Commit**

```
git add package.json package-lock.json scripts/gen-fonts-css.mjs src/styles/fonts.css src/styles/fonts.test.ts vite.config.ts
git commit -m "feat(m26): IBM Plex 3書体の woff2 を同梱する土台——fontsource から woff2 のみ参照の生成 CSS を作り、4KB 未満スライスの data URI 化（CSP が弾く）を止める"
```

---

### Task 2: 配線——`--font-sans` / `--font-mono` の差し替えと端末

**Files:**
- Modify: `src/index.css`（import 追加・トークン差し替え。**Geist の import はまだ消さない**——Task 6 で外す。実験で問題が出たときの巻き戻しを 1 コミットに閉じるため）
- Modify: `src/components/TerminalTab.tsx`

**Interfaces:**
- Consumes: Task 1 の `src/styles/fonts.css`
- Produces: `--font-sans: 'IBM Plex Sans Variable', 'IBM Plex Sans JP', 'Yu Gothic UI', 'Hiragino Sans', sans-serif` / `--font-mono: 'IBM Plex Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace`

- [ ] **Step 1: index.css を書き換える**

`@import "@fontsource-variable/geist";` の**次の行**に `@import "./styles/fonts.css";` を足し、トークンを:

```css
    --font-sans: 'IBM Plex Sans Variable', 'IBM Plex Sans JP', 'Yu Gothic UI', 'Hiragino Sans', sans-serif;
    --font-mono: 'IBM Plex Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace;
```

に差し替える。**フォールバック（Yu Gothic UI 以降）は残す**——Plex JP の遅延スライスが届くまでの表示と、収録外グリフの受け皿。`'IBM Plex Mono'` は**先頭**に置く（`ui-monospace` が先だと OS フォントが勝って Plex Mono に到達しない）。

- [ ] **Step 2: 端末に Plex Mono を配線する**

`src/components/TerminalTab.tsx` の起動 effect（`new Terminal({...})` の後、`term.open(host)` より後でよい）に追加:

```ts
    // 端末のフォントは Plex Mono（U1 決着。700 は ANSI 太字用に同梱済み）。
    // **読み込みが済んでから fontFamily を入れる**——xterm はセル寸法を
    // fontFamily を代入した時点のフォントで測るので、届く前に入れると
    // フォールバック書体の寸法で固まる。fonts.ready は「使われたフォント」
    // しか待たず、この時点で Plex Mono はまだ 1 文字も描かれていないので、
    // fonts.load で明示的に読み込む（通常・太字の両方）。
    // 読めない環境（jsdom）では何もしない＝xterm 既定のまま（theme.ts の
    // 「半端に流し込まない」と同じ判断）
    if ('fonts' in document) {
      void Promise.all([
        document.fonts.load("13px 'IBM Plex Mono'", 'Wg1|'),
        document.fonts.load("bold 13px 'IBM Plex Mono'", 'Wg1|'),
      ])
        .then(() => {
          if (disposed) return
          const mono = getComputedStyle(document.documentElement)
            .getPropertyValue('--font-mono')
            .trim()
          // トークンが読めなければ入れない（既定のまま）——theme.ts と同じ扱い
          if (mono === '') return
          term.options.fontFamily = mono
          fit.fit()
        })
        .catch(() => {
          // 読み込み失敗は既定フォントのまま動かす（端末が使えないより良い）
        })
    }
```

配置は `let disposed = false` の宣言より後。`--font-mono` が実行時の `:root` に現れるか（Tailwind v4 の `@theme inline` の出力）は **Task 3 Step 3 の生成 CSS 確認で検証する**——現れなければ、`@theme inline` の外（`:root {}`）に `--font-mono` を重ねて宣言する形をこのタスクに戻して直す（その場合もトークンの出所は index.css の 1 箇所のまま）。

- [ ] **Step 3: 既存テストが緑のままであることを確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。とくに `conventions.test.ts` / `palette.test.ts` / `TerminalTab` 系・エディタ系の DOM テスト（jsdom は `document.fonts` を持たないので Step 2 のブロックはそのまま素通りする）。

- [ ] **Step 4: Commit**

```
git add src/index.css src/components/TerminalTab.tsx
git commit -m "feat(m26): --font-sans / --font-mono を IBM Plex へ差し替え、端末に Plex Mono を配線する（読み込み完了後に fontFamily を入れて寸法を測り直す）"
```

---

### Task 3: 前提実験（エージェント。Chromium ＋ vite build の実測）

U1 決着が「未検証のまま M26 へ送る」と名指しした前提のうち、**①（可変ウェイトの描き分け）の Chromium 側の再確認・②（遅延スライスと測定整合）・③（woff 非同梱）**をここで潰す。①④の WebView2 実機での最終確証は Task 4（人間）。**②が false（遅延スライスが届いても測定に影響しない）なら Task 5 は不要になる——その場合は進めずに報告すること。**

**Files:**
- Create: `font-probe.html`（プロジェクトルート。**コミットする**——使い捨てではなく、フォント差し替え時に再利用する実験ページ。vite の build 入力は `index.html` だけなので配布物には入らない）

- [ ] **Step 1: 実験ページを書く**

`font-probe.html`（プロジェクトルート）:

```html
<!doctype html>
<html lang="ja">
<!-- フォント同梱の実験ページ（M26）。npm run dev で http://localhost:5173/font-probe.html を開く。
     vite build の入力は index.html だけなので、このページは配布物に入らない -->
<head>
  <meta charset="utf-8" />
  <title>font probe</title>
  <style>
    /* fonts.css は下の module script が import する——vite dev はスクリプト経由の
       import なら url() の解決まで面倒を見る（style タグの @import は素通し） */
    body { font-family: 'IBM Plex Sans Variable', 'IBM Plex Sans JP', sans-serif; font-size: 16px; }
    .w400 { font-weight: 400 } .w450 { font-weight: 450 }
    .w500 { font-weight: 500 } .w600 { font-weight: 600 }
    .mono { font-family: 'IBM Plex Mono', monospace }
  </style>
</head>
<body>
  <p class="w400">400 未定義を物理的に見える化 glossary.json 0123456789</p>
  <p class="w450">450 未定義を物理的に見える化 glossary.json 0123456789</p>
  <p class="w500">500 未定義を物理的に見える化 glossary.json 0123456789</p>
  <p class="w600">600 未定義を物理的に見える化 glossary.json 0123456789</p>
  <p class="mono">mono: gl_x7K2mPq9Rt / #1 → #8 / 9 / 9 件</p>
  <p id="rare-target">（ここに珍しい字を後から入れる）</p>
  <pre id="log"></pre>
  <script type="module">
    import '/src/styles/fonts.css'
    const log = (s) => { document.getElementById('log').textContent += s + '\n' }
    const ctx = document.createElement('canvas').getContext('2d')
    const width = (font, text) => { ctx.font = font; return ctx.measureText(text).width }
    const SAMPLE = '未定義を物理的に見える化 glossary'
    // 珍しい字。JP の分割スライス（CJK 拡張）に入っており、初期表示では読み込まれない
    const RARE = '\u{2000B}\u{20089}'
    await document.fonts.ready
    log('fonts.ready 解決')
    // 前提①: 400/450/500/600 の字幅が単調に増える＝可変ウェイトが描き分いている
    for (const w of [400, 450, 500, 600]) {
      log(`wght ${w}: latin=${width(`${w} 16px 'IBM Plex Sans Variable'`, 'glossary')}  jp=${width(`${w} 16px 'IBM Plex Sans JP'`, SAMPLE)}`)
    }
    // 前提②: 遅延スライスの到着で measureText が変わるか
    document.fonts.addEventListener('loadingdone', (e) => {
      log(`loadingdone: ${e.fontfaces.length} face(s)`)
      log(`RARE after : ${width(`400 16px 'IBM Plex Sans JP'`, RARE)}`)
    })
    log(`RARE before: ${width(`400 16px 'IBM Plex Sans JP'`, RARE)}`)
    document.getElementById('rare-target').textContent = RARE
  </script>
</body>
</html>
```

- [ ] **Step 2: Chromium で実測する**

`npm run dev` を立て、Chrome で `http://localhost:5173/font-probe.html` を開き（claude-in-chrome が使えるならそれで。使えなければ人間に URL を渡して `log` の中身をもらう）、次を確認して記録する:

1. **前提①**: **latin（可変）の幅が 400 < 450 < 500 < 600 で厳密に増える**（450 と 400 が同値なら可変の中間ウェイトが効いていない——**報告して止める**）。**JP は static 400/500/600 なので 450 は 500 に丸まってよい**——400 / 500 / 600 の 3 点が互いに異なればよい（U1 決着「リスクはラテン可変側のみ」）。目視でも 4 行の太さが段になって見えること
2. **前提②**: `RARE before` と `RARE after` の幅が**異なる**こと・`loadingdone` が発火すること・ネットワークに JP スライスの woff2 取得が**ページ表示後に**現れること。→ **「遅延スライスは測定を狂わせる。`loadingdone` での再測定が要る」を確定**させ、Task 5 へ
3. `getComputedStyle(document.documentElement).getPropertyValue('--font-mono')` が空でないこと（Task 2 Step 2 の前提。**アプリ側 `http://localhost:5173/` のコンソールで**確認する——probe ページは Tailwind を通らない）

- [ ] **Step 3: ビルド産物を検査する（前提③の前半）**

```
npx vite build
```

の後（`npm run build` でなくてよい——tsc は Task 2 Step 3 で済んでいる）:

1. `dist/assets/` に `.woff` が **0 本**、`.woff2` が **375 本以上**（JP 123×3＝369＋Sans 6＋Mono）あること: `ls dist/assets/*.woff` が空・`(ls dist/assets/*.woff2).Count`
2. dist の CSS に `data:font` / `data:application/octet-stream` で始まる url が**無い**こと（インライン化が止まっている）
3. dist の CSS に `--font-mono` が現れること（Step 2-3 の裏取り。**現れなければ Task 2 Step 2 の注記どおり `:root` 宣言を足して直し、このタスクからやり直す**）
4. `dist/assets` の woff2 合計サイズを記録する（実測 ≒ 7.0MB の見込み。U1 記載の 8.2MB との差は history に書く）

- [ ] **Step 4: Tauri の配布サイズ（前提③の後半。バックグラウンド可）**

`npm run tauri build` を回し、NSIS インストーラのサイズ増（M25 時点の成果物との比較が取れれば併記）と、`dist` 由来のフォントが実行形へ入っていることを記録する。**失敗しても M26 は止めない**（リリース経路は M19 で確立済み。ここで見たいのはサイズの実測だけ）。

- [ ] **Step 5: Commit（実験ページと結果）**

実験結果の数値は Task 8 の history に書くためメモとして残す。

```
git add font-probe.html
git commit -m "test(m26): フォント実験ページ——可変ウェイトの描き分け・遅延スライスの測定影響・--font-mono の実行時到達を実測する"
```

---

### Task 4: 人間の 10 分チェック（WebView2 実機。前提①④の最終確証）

**人間の作業。サブエージェントは GUI を操作できない。** `npm run tauri dev` で一度起動してもらい、次の 4 点だけ見る（フルの実機確認は Task 9。これは「設計やり直し級が無いか」の早期関門）:

- [ ] 1. **可変ウェイトの描き分け（前提①）**: 課題ツリーの課題タイトル（600）・カラム名やボタンのラベル（500）・本文セル（400）の太さが**3 段に見える**（Yu Gothic 時代の「400 と 500 が同じ」に戻っていない）
- [ ] 2. **和文が Plex JP になっている**: 用語集の和文の字面が以前より大きく・Segoe/游ゴシックと明らかに違う形（「令」「辻」あたりが分かりやすい）
- [ ] 3. **端末が Plex Mono（前提④）**: 端末ペインを開き、プロンプトの英数字が Plex Mono の字形（`0` にスラッシュ無し・`l` に曲がり）で出る。`ls` 程度を打って崩れない。**拾っていなければ**: `--font-mono` の扱いを人間と決める（xterm 既定に戻す／family 直書きへ落とす）——Task 2 Step 2 のコードの `fontFamily` 経路を報告に添えること
- [ ] 4. **珍しい漢字を打つ（前提②の実機側）**: 適当なセルに「𠀋」や「𩸽」等を入力し、少し待って豆腐にならないこと（このタスク時点では Task 5 が未実装なので、**ノードの高さが一瞬ずれてもよい**——見るのは「字が出るか」だけ）

**1 が NG なら以降を止めて報告**（U1 の構成そのものに関わる）。3 が NG でも先へは進める（端末だけの問題として切り分けられる）。

---

### Task 5: 遅延スライス到着での測り直し（前提②の実装）

**Files:**
- Create: `src/core/canvas/use-font-generation.ts`
- Create: `src/core/canvas/use-font-generation.dom.test.tsx`
- Modify: `src/modules/logic-tree/LogicTreeEditor.tsx:82-108`（同形ブロックをフックに置き換え）
- Modify: `src/modules/sequence/SequenceEditor.tsx:275-305`（同上）
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx:348-382`（同上）
- Modify: `src/modules/logic-tree/LogicTreeEditor.font.dom.test.tsx`（fake の拡張＋loadingdone のケース追加）
- Modify: `src/components/CellInput.tsx`（loadingdone で `measure()`）

**Interfaces:**
- Produces: `useFontGeneration(): number` — マウント時 0。`document.fonts.ready` の解決と `loadingdone`（読み込まれた face が 1 つ以上のもの）のたびに +1。ready 直後は両方が発火して 2 になり得る（再測定が 2 回走るだけで無害）。
- Consumes: 各エディタの `measurerKey` は既存のまま `fontGeneration` を鍵に混ぜ続ける。

- [ ] **Step 1: フックの失敗するテストを書く**

`src/core/canvas/use-font-generation.dom.test.tsx`（`@vitest-environment jsdom`）。`LogicTreeEditor.font.dom.test.tsx` と同じ作法で `document.fonts` を差し込むが、**`addEventListener` / `removeEventListener` を持つ fake** にする:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useFontGeneration } from './use-font-generation'

type Listener = (e: unknown) => void

let resolveReady: () => void
let listeners: Map<string, Set<Listener>>

beforeEach(() => {
  listeners = new Map()
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: {
      ready: new Promise<void>((resolve) => {
        resolveReady = resolve
      }),
      addEventListener: (type: string, fn: Listener) => {
        if (!listeners.has(type)) listeners.set(type, new Set())
        listeners.get(type)!.add(fn)
      },
      removeEventListener: (type: string, fn: Listener) => {
        listeners.get(type)?.delete(fn)
      },
    },
  })
})

afterEach(() => {
  Reflect.deleteProperty(document, 'fonts')
})

const fire = (type: string, event: unknown): void => {
  for (const fn of listeners.get(type) ?? []) fn(event)
}

describe('useFontGeneration', () => {
  it('ready の解決と loadingdone の到着で世代が進む', async () => {
    const { result } = renderHook(() => useFontGeneration())
    expect(result.current).toBe(0)
    await act(async () => {
      resolveReady()
      await Promise.resolve()
    })
    expect(result.current).toBe(1)
    act(() => fire('loadingdone', { fontfaces: [{}] }))
    expect(result.current).toBe(2)
  })

  it('何も読み込まれなかった loadingdone では進まない', async () => {
    const { result } = renderHook(() => useFontGeneration())
    act(() => fire('loadingdone', { fontfaces: [] }))
    expect(result.current).toBe(0)
  })

  it('アンマウントで購読が外れ、以後のイベントで setState しない', () => {
    const { unmount } = renderHook(() => useFontGeneration())
    expect(listeners.get('loadingdone')?.size).toBe(1)
    unmount()
    expect(listeners.get('loadingdone')?.size).toBe(0)
  })
})
```

Run: `npx vitest run src/core/canvas/use-font-generation.dom.test.tsx`
Expected: FAIL（モジュールが無い）

- [ ] **Step 2: フックを実装する**

`src/core/canvas/use-font-generation.ts`:

```ts
import { useEffect, useState } from 'react'

/**
 * Web フォントの読み込みを「世代」として数えるフック（M26）。
 *
 * getComputedStyle は宣言されたファミリ列を返すだけで、どのフェイスに
 * 解決されたかは映らない——だからフォントの同一性では測り直しを起こせず、
 * 読み込みの完了を世代として数え、測定器の鍵に混ぜる（rev 9章）。
 *
 * 2 つの契機で進む:
 * - 初回の読み込み完了（document.fonts.ready）
 * - **その後の遅延スライスの到着（loadingdone）**。同梱フォントは
 *   unicode-range で分割されており、珍しい字が初めて入力されたとき
 *   該当スライスだけが後から届く。ready は初回しか解決しないので、
 *   これを拾わないと後から届いた字の幅・高さが古いまま残る
 *
 * ready の直後は loadingdone も発火して 2 回進み得るが、再測定が
 * 2 回走るだけで結果は同じ（冪等）なので、重複は取り除かない
 */
export function useFontGeneration(): number {
  const [generation, setGeneration] = useState(0)
  useEffect(() => {
    if (typeof document === 'undefined' || !('fonts' in document)) return
    let alive = true
    const bump = (): void => {
      if (alive) setGeneration((n) => n + 1)
    }
    void document.fonts.ready.then(bump)
    const onLoadingDone = (e: Event): void => {
      // 1 つも読み込まれなかった loadingdone（全件エラー等）では測り直さない
      const faces = (e as { fontfaces?: readonly unknown[] }).fontfaces
      if (faces === undefined || faces.length > 0) bump()
    }
    document.fonts.addEventListener('loadingdone', onLoadingDone)
    return () => {
      alive = false
      document.fonts.removeEventListener('loadingdone', onLoadingDone)
    }
  }, [])
  return generation
}
```

Run: `npx vitest run src/core/canvas/use-font-generation.dom.test.tsx`
Expected: PASS

- [ ] **Step 3: 番人（LogicTreeEditor.font.dom.test.tsx）を先に拡張する**（lessons: 観測点の移設・拡張は、実装を変える前に**現行コードのまま赤くなる形**で書く）

1. `beforeEach` の fake に Step 1 と同じ `addEventListener` / `removeEventListener` を足し、モジュールレベルに `fire(type, event)` ヘルパを置く（**既存の `ready` プロミスと `resolveFonts` は残す**。現行実装は `addEventListener` を呼ばないだけなので、この fake 拡張だけでは既存テストは緑のまま——ここで一度 `npx vitest run` して確認する）
2. モックの `perChar` を `state.calls === 1 ? 10 : state.calls === 2 ? 20 : 30` にする（既存ケースの期待値は変わらない）
3. 新しいケースを足す:

```tsx
  it('遅延スライスの到着（loadingdone）でも測り直される（2行 → 3行）', async () => {
    render(<LogicTreeEditor data={data} onChange={() => {}} issues={[]} modalOpen={false} />)
    const box = screen.getByLabelText('ノード1').parentElement
    const inset = NODE_INSET_Y * 2
    const oneLine = Number.parseFloat(box?.style.height ?? '') - inset
    resolveFonts()
    await waitFor(() => {
      expect(Number.parseFloat(box?.style.height ?? '')).toBe(inset + oneLine * 2)
    })
    // 珍しい字のスライスが後から届いた、に相当するイベント
    fire('loadingdone', { fontfaces: [{}] })
    await waitFor(() => {
      // perChar 30 → 1 行 9 文字 → 20 文字は 3 行
      expect(Number.parseFloat(box?.style.height ?? '')).toBe(inset + oneLine * 3)
    })
    expect(state.calls).toBe(3)
  })
```

Run: `npx vitest run src/modules/logic-tree/LogicTreeEditor.font.dom.test.tsx`
Expected: 既存ケースは PASS、新ケースは FAIL（現行実装は loadingdone を購読していない）

- [ ] **Step 4: 3 エディタをフックへ置き換える**

3 ファイルとも同じ変形（スキャン(4) の行範囲）:

1. `import { useFontGeneration } from '@/core/canvas/use-font-generation'` を足す
2. `const [fontGeneration, setFontGeneration] = useState(0)` と `document.fonts.ready` の `useEffect` ブロック（コメント含む）を削り、代わりに:

```ts
  // 読み込みの世代。進んだら実効フォントも読み直す。
  // **最初の1フレームはフォールバック書体のメトリクスで測っている**し、
  // 同梱フォントは unicode-range 分割なので、珍しい字のスライスは
  // 初入力のとき後から届く（M26）——どちらも世代が進んだ時点で測り直す
  const fontGeneration = useFontGeneration()
  useEffect(() => {
    readFont()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readFont は毎レンダー再生成される安定した処理。世代が進んだときだけ走らせる
  }, [fontGeneration])
```

（`readFont` の定義と `useLayoutEffect(readFont, [])`、`measurerKey` は**変えない**。旧コメントの「Geist は日本語グリフを持たず…」の 2 行は上の新コメントで置き換わる。`useState` が他で未使用にならないか import を確認する。）

Run: `npx vitest run src/modules`
Expected: `LogicTreeEditor.font.dom.test.tsx` の新ケース含めすべて PASS

- [ ] **Step 5: CellInput にも同じ契機を足す**

`src/components/CellInput.tsx` の ResizeObserver の effect の**隣**に:

```ts
  /**
   * 遅延スライスの到着（M26）。同梱フォントは unicode-range 分割なので、
   * 珍しい字を打った直後はフォールバック書体で折り返しが決まり、
   * スライスが届いた瞬間に必要行数が変わり得る。値も幅も変わらないので
   * 上の 2 つの effect はどちらも拾えない——loadingdone だけが契機になる。
   * jsdom は document.fonts を持たないので張らずに抜ける（ResizeObserver と同じ扱い）
   */
  useLayoutEffect(() => {
    if (!autoSize || !multiline) return
    if (typeof document === 'undefined' || !('fonts' in document)) return
    const onLoadingDone = (): void => measure()
    document.fonts.addEventListener('loadingdone', onLoadingDone)
    return () => document.fonts.removeEventListener('loadingdone', onLoadingDone)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure は毎レンダー再生成される安定した処理。購読は multiline / autoSize の変化だけで張り替える
  }, [multiline, autoSize])
```

**行数の変化そのものは jsdom で観測できない**（`scrollHeight` が常に 0 で `measure()` が早期 return する）ので、テストは購読と解除の配線だけを固定する——`CellInput` の既存 DOM テストファイルに、Step 1 と同じ fake を使い「multiline でマウントすると loadingdone に購読し、アンマウントで外れる」の 1 ケースを足す。**なぜ深く検証できないか（どの観測点を当たったか）はテストのコメントに書く**（lessons「この環境ではテストできない、を確かめずに書かない」の但し書き運用）。

- [ ] **Step 6: 全テスト・型・lint**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

- [ ] **Step 7: Commit**

```
git add src/core/canvas/use-font-generation.ts src/core/canvas/use-font-generation.dom.test.tsx src/modules/logic-tree/LogicTreeEditor.tsx src/modules/sequence/SequenceEditor.tsx src/modules/issue-tree/IssueTreeEditor.tsx src/modules/logic-tree/LogicTreeEditor.font.dom.test.tsx src/components/CellInput.tsx src/components/CellInput.dom.test.tsx
git commit -m "feat(m26): 遅延フォントスライスの到着で測り直す——ready＋loadingdone を世代として数える useFontGeneration に3エディタを一本化し、CellInput の行数も追従させる"
```

（`CellInput` のテストファイル名は実物に合わせること。）

---

### Task 6: Geist の除去と `font-bold` → 600

**Files:**
- Modify: `package.json` / `package-lock.json`（`npm uninstall @fontsource-variable/geist`）
- Modify: `src/index.css`（`@import "@fontsource-variable/geist";` を削除）
- Modify: `src/App.tsx:1055`（`font-bold` → `font-semibold`）
- Modify: `THIRD-PARTY-NOTICES.md` / `README.md:238`

- [ ] **Step 1: uninstall と import 削除**

```
npm uninstall @fontsource-variable/geist
```

`src/index.css` から Geist の `@import` 行を消す。

- [ ] **Step 2: `font-bold` を 600 へ落とす**

`src/App.tsx:1055` の `font-bold` を `font-semibold` に。U1 決着どおり——1 箇所のために 700（約 2.3MB）を積まない。Plex に 800/900 は無いが使用箇所も無い。

- [ ] **Step 3: ライセンス表記**

`THIRD-PARTY-NOTICES.md` のフォントの表を差し替え:

```markdown
| 名称 | ライセンス | 備考 |
| --- | --- | --- |
| IBM Plex Sans Variable（`@fontsource-variable/ibm-plex-sans`） | **OFL-1.1** | アプリへの埋め込みは許諾されている。**フォントファイル単体の販売は禁止**。改変して再配布する場合は予約名（Reserved Font Name）を使えない。ライセンス全文は各パッケージ同梱の `LICENSE` |
| IBM Plex Sans JP（`@fontsource/ibm-plex-sans-jp`） | **OFL-1.1** | 同上。static 400/500/600 のみ同梱 |
| IBM Plex Mono（`@fontsource/ibm-plex-mono`） | **OFL-1.1** | 同上。static 400/700 のみ同梱（700 は端末の ANSI 太字用） |
```

`README.md:238` の「特に同梱フォント **Geist は OFL-1.1** で…」を IBM Plex 3 書体に書き換える（文意は同じ）。**「@fonts 同梱で足りるか」への答え**: リポジトリ配布は fontsource パッケージ同梱の `LICENSE`＋この表で OFL の表示義務を満たす（Geist と同形）。**アプリの配布物（インストーラ）に表記ファイルが入っていないのは Geist 時代からの既存の穴**なので、M26 では直さず open-issues に 1 項起こす（Task 7）。

- [ ] **Step 4: 残存の確認（打ち切りの無い grep）**

```
grep -rn --exclude-dir=node_modules --exclude-dir=.git Geist . | grep -v -E "docs/(history|superpowers/plans|issue-tree/俯瞰モック)/"
```

残ってよいのは: `docs/facet-UI設計ノート.md`（U1 決着の記録）と `docs/glossary/scope.md`（Task 7 で訂正注記を付ける正文書）だけ。**「無い」の主張は `-c` か打ち切り無しの出力で確かめる**（lessons）。

- [ ] **Step 5: 全テスト・型・lint・Commit**

Run: `npm test && npx tsc -b && npm run lint`（`fonts.test.ts` は Geist に触れないので緑のまま）

```
git add package.json package-lock.json src/index.css src/App.tsx THIRD-PARTY-NOTICES.md README.md
git commit -m "feat(m26): Geist を外す（M7 の決定の反転）。唯一の font-bold は 600 へ——1箇所のために 700 を積まない"
```

---

### Task 7: D8 の決着と文書反映

コードの変更は**無い**（D8 で動かすクラスは `App.tsx` の 1 箇所だけで、Task 6 で済んでいる）。決着の中身:

> **rev 9章の予約「E が入ったらカラム名は階層をウェイトに移せる」は、「移さない」と決めて閉じる。** カラム名は `font-medium`＋`tracking-wide`＋`text-ink-muted`＋`bg-surface-muted` のまま——E で **Medium(500) が実際に描き分かるようになった**ので、D8 の 3 層（ヘッダ Med / 本文 Reg / 補助 Reg＋グレー）は**追加変更なしで実体化した**。字間・グレー・面を外して「ウェイトだけ」に痩せさせる案は、M21 実機確認の「面なしでは見出しの行がデータ行に溶ける」という観察と衝突するので採らない。**4 チャネルが過剰に見えるかは Task 9 の実機確認で人間が見る**（過剰と出たら計画外修正として扱う）。行間は動かさない（M23 で確定済み）。

- [ ] **Step 1: `docs/facet-UI設計ノート.md`**
  - D6 に「M26 での実施」の追記小節: fontsource 3 パッケージ・生成 CSS（woff2 のみ。`scripts/gen-fonts-css.mjs`）・**4KB 未満スライスの data URI 化を止めた理由（CSP `font-src 'self'`）**・実測サイズ（Task 3 Step 3 の数値。U1 記載の約 8.2MB はパッケージ全体込みの見積もりで、同梱実測は約 7.0MB——**決定の訂正ではなく記録の精密化**）・OFL 表記の形
  - D7 に「M26 での実施」: 混植は同一設計の 3 書体になった。実機の見え方は実機確認の結果を待って追記（Task 9 の後）
  - D8 に「M26 での決着」: 上の決着文＋`font-bold` → 600
  - §7 U2 に決着の小節: **M21 が実質決着させていた**——グレー階調は `palette.css` の無彩 5 段（`canvas` / `surface` / `surface-muted` / `ink` 系 3 つ…実物の段の数え方は `palette.css` を見て書く）、支持の緑・欠落の赤の具体値と検証は `palette.css`＋`palette-requirements.ts`、破線の太さ・パターンは実装（`badge-styles.ts` 等）が持つ。U4 を M25 で閉じたのと同じ「実装からの言語化」の形
  - §7 U3 に決着の小節: **M22 の [`missing-semantics.md`](../../missing-semantics.md) が求められていた規約そのもの**（課題ツリーを参照実装に、の方針どおり作られた）。同上の形
  - §8 実施状況を更新: 優先 8 ＝ M26 で消化。**残るは優先 6 の高さ（省略）だけ**——Task 8 の結果（打ち切りなら「全項消化」、再挑戦なら「M27 予定」）を反映
- [ ] **Step 2: `docs/overview-rev.md` 9章**
  - 「フォントの書体は M7 で確定し…」の項を全面改訂: `--font-sans` / `--font-mono` の新値、**Geist を外した（M7 の決定の反転。M26）**、同梱の作法（fontsource・生成 CSS・woff2 のみ・data URI 化の停止と CSP）、**素の fontsource static import をしないこと**、`gen-fonts-css.mjs` での再生成、フォールバック列を残す理由
  - 「ウェイトは段の既定が 400…ウェイトの階層そのものは E 待ち」の予約を解消: D8 の 3 層が実体化したこと・カラム名のクラスは変えないと決めたこと・`App.tsx` の見出しが 600 になったこと
  - 「測定層と描画層が同一のフォントトークンを参照」の項に追記: `document.fonts.ready` だけでなく **`loadingdone`（遅延スライスの到着）でも測り直す**（`src/core/canvas/use-font-generation.ts` に一本化。M26）。`CellInput` の行数も同じ契機で追従
  - 端末の項（M17 の 4 系統の記述の近く）: 端末のフォントは `--font-mono`（Plex Mono）を **`fonts.load` の完了後に**流し込む。トークンが読めなければ xterm 既定のまま（色と同じ「半端に流し込まない」）
- [ ] **Step 3: `docs/open-issues.md`**
  - 「デザイン」の **E の項（`[M21]`）を消す**
  - 「次に手を付ける候補」へ **M26 の実機確認が未実施**を足す（見た目が成果物のマイルストーン。history にチェックリストを空のまま写す——M21〜M25 と同じ扱い）
  - 「小さな負債」へ 1 項: **配布物（インストーラ）にサードパーティのライセンス表記が同梱されていない**（`THIRD-PARTY-NOTICES.md` はリポジトリにしか無い。OFL のフォントを Geist 時代から同梱しており、M26 で書体が替わっても形は同じ。直すなら bundle の resources に notices を足す 1 行）`[M26]`
  - D3 の高さの項は Task 8 の結果で書き換える
  - 冒頭の「最終更新」段落を M26 の増減で更新
- [ ] **Step 4: その他の文書**
  - `docs/glossary/scope.md` M7 節（:119-120）へ訂正注記: 「日本語 Web フォントは同梱しない」は **M26 で反転した**（U1 決着）。当時の論拠のうち「字数サブセットは破綻する」は生きている——M26 も字数サブセットはせず、**全字収録のまま unicode-range 分割**で同梱した、と 1 段で書く
  - `docs/README.md`: 地図の UI ノートの行を更新（E は M26 で実装。残るは D の高さ、または全部閉じた——Task 8 の結果で）。マイルストーン表に M26 の行を足す
- [ ] **Step 5: `docs/history/m26-core-font-bundle.md` を新規作成**

M25 の申し送りと同じ骨格で: 何を作ったか／実装で確定した事項（**前提①〜④の実験結果の数値**・実測サイズと U1 記載値の差・CSP×インライン化の罠・`--font-mono` の実行時到達の検証結果）／直さずに残したもの（D10 の等幅割り当ては優先表に無くスコープ外のまま・配布物のライセンス表記・和文等幅は OS フォールバックのまま）／実機確認チェックリスト（**空のまま**。Task 9 の項目を写す）。

- [ ] **Step 6: Commit**

```
git add docs/
git commit -m "docs(m26): UI ノートの実施項目を閉じる——rev 9章の書体の項を反転、U2・U3 を文書上決着、E の残件を消し込み、m26 申し送りを新規"
```

---

### Task 8: D3 の高さ（省略）の決着を人間に諮る

**人間の判断。** UI ノートの実施項目を「全部閉じた」と言えるかはここで決まる。AskUserQuestion で次の二択を諮る（決定済み事項の再議論ではない——M24 が撤回して以来、開いたままの問い）:

- **A: 打ち切り（高さは内容が決めるままを確定）** — 「ノードの高さに上限は無い」を確定設計として UI ノート D3 と open-issues に書き、**UI ノートの実施項目は全部閉じる**
- **B: 再挑戦（M27 に分ける）** — 実装は M27。逃げ道は open-issues の D の項が持っている（フォーカス中だけ `overflow-y: auto`＋`scrollbar-width: none`。M24 が検討し損ねた形）。open-issues の項を「M27 予定」に書き換え、UI ノートは「E まで消化。残るは D3 の高さ（M27）」とする

- [ ] **Step 1: AskUserQuestion で諮る**（推奨は付けない——M24 で人間が実機を見て撤回した経緯があり、費用と便益の両方を人間だけが知っている）
- [ ] **Step 2: 結果を UI ノート D3・§8・open-issues・docs/README.md の地図に反映して Commit**

```
git add docs/
git commit -m "docs(m26): D3 の高さ（省略）の決着——人間の裁定を反映"
```

---

### Task 9: 実機確認（人間）

**人間の作業。このタスクと実装は束ねない**——チェックリストは history に空のまま写してあり、消し込みの管理は open-issues の候補の項が持つ（Task 7 で設定済み）。フォントは**全画面に効く**ので、モジュール別ではなく画面を一巡する形で見る:

```
npm install        # 省略しない
npm run tauri dev
```

- [ ] 1. **5 モジュールすべて**で和文・英数字が Plex になっている（Segoe UI / Yu Gothic の字面が残っている画面が無い）
- [ ] 2. **ウェイトの 3 段**（本文 400 / カラム名・ボタン 500 / 課題タイトル 600）が描き分かって見える（前提①の本確認）
- [ ] 3. **カラム名の 4 チャネル**（Med＋字間＋グレー＋面）が過剰に見えないか（D8 の決着の検証。過剰なら計画外修正として人間の言葉を記録）
- [ ] 4. **D7 の和欧混植**: キーボードヒント行（`Enter: ステップ追加` 等）と用語集の混在セル（`glossary.json` を含む備考など）で、ラテンだけ浮く・和文だけ沈む が消えている
- [ ] 5. **ファイルが開けない見出し**（App.tsx。壊れた JSON を開く）が 600 で出て、太字が汚く合成されていない（疑似ボールドの消滅）
- [ ] 6. **端末**: Plex Mono の字形で出る・ANSI 太字（`ls` の色付き出力等）が 700 の実フェイスで出る・列が揃う（前提④の本確認）
- [ ] 7. **珍しい漢字**（𠀋・𩸽 など）をロジックツリーのノードに入力: 豆腐にならず、**スライス到着後にノードの枠が文字とずれていない**（前提②＝Task 5 の本確認）
- [ ] 8. 同じ珍しい漢字を**用語集の定義セル**に入力: 行の高さが崩れない（CellInput の追従）
- [ ] 9. **ダーク**でも一巡（フォントは色と独立だが、ウェイトの見え方は地の明暗で変わる——暗い地で 400 が痩せて見えないか）
- [ ] 10. Ctrl+ホイールで**ズーム**したときの字形（可変フォントの光学サイズは無いが、極端な崩れが無いことだけ見る）
- [ ] 11. **起動直後の一瞬**（フォールバック→Plex への swap）が実用上目障りでないか（`font-display: swap` の代償の確認）

確認で出た変更要求は計画外修正として扱う（**症状と人間の言葉を分けて記録する**——lessons）。全項済んだら、実機で編集した `sample-project/` を戻し（CLAUDE.md の手順 1）、結果を history へ追記・open-issues の候補の項を消す。

---

## 検証（マージ前の通し）

- `npm test && npx tsc -b && npm run lint` がすべて緑（Rust は触っていないが、マージ後の手順どおり `(cd src-tauri && cargo test)` も回す）
- `npx vite build` で: dist に `.woff` が 0 本・CSS に `data:font` が無い・`--font-mono` が現れる（Task 3 Step 3 の再実行）
- 打ち切りの無い `grep Geist`（Task 6 Step 4 の再実行）
- `conventions.test.ts` / `palette.test.ts` が**新構成でも**緑（フォントは走査対象外という確認を含む）

## 自己レビュー済みの注意点（実装者へ）

- **`fonts.css` は生成物だがコミットする。** 直に編集せず、直したければ `gen-fonts-css.mjs` を直して再生成する。`fonts.test.ts` の「参照先が実在する」検査が、fontsource の版上げでファイル名が変わったときの番人になる。
- **`LogicTreeEditor.font.dom.test.tsx` の既存ケースを「緑にするために」書き換えない。** Step 3 の手順は、fake の拡張だけでは既存が緑のままであることを確かめてから新ケースを足す順番になっている。
- **Task 2 の端末コードは `disposed` フラグの宣言より後に置く**（StrictMode で捨てられた側が生きている端末を触らないため——既存の write ハンドラと同じ守り）。
- 実験（Task 3）の結果が計画の前提と食い違ったら、**辻褄を合わせずに報告する**。とくに前提②が「影響しない」だった場合、Task 5 は丸ごと不要になる。
