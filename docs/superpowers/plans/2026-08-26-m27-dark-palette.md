# M27: ダークパレットの吟味 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** M21 が「要件を満たす値を置いただけ」としてきたダークパレット（`src/styles/palette.css` の `.dark`）を吟味し、根拠付きの値に置き直して文書へ反映する。

**Architecture:** 契約（`palette-requirements.ts`）・テスト（`palette.test.ts`）・コードの構造は一切変えない。変えるのは `.dark` ブロックの色値2つとコメント、および文書4本（UI設計ノート・overview-rev 9章・open-issues・history）。値は計画時点で全数検算済み——**算出済みの値をそのまま使うこと**（M8 の流儀）。

**Tech Stack:** oklch / WCAG コントラスト / OKLab 色差（道具はすべて `src/styles/contrast.ts` に既存）

**Spec:** 本計画のセクション「確定値と根拠」が仕様の正。独立した設計スペック文書は作らない（bounded な値の置き直しであり、チャットで設計承認済み。UI設計ノートへ書く D20 節が恒久の記録になる）。

## Global Constraints

- 色値を持ってよいのは `src/styles/palette.css` だけ。値は `oklch(L C H)`（L は 0..1 の小数、アルファ不可）
- 書いた C が sRGB の色域に収まっていること（`GAMUT_MAX_C_DRIFT` 0.005。`palette.test.ts` の「色域」が検査）
- 閾値ちょうどを置かない（`MARGIN` 1.03。テストは min で見るが、置く値は min × 1.03 を満たすこと）
- ライトの値・契約・`MODES`・`REQUIREMENTS` 等の表は一切動かさない
- 反転による自動生成はしない（rev 9章）——ダークは独立に置く
- 計画の指示が実物と矛盾していたら、辻褄を合わせず「計画の矛盾」として報告する。**ただし既存実装・既存文書と一致すべき文言は実物が正**
- 各タスクの報告には検証コマンドの実行結果（末尾の要約行）を貼ること

---

## 前提: 計画時点の実測（2026-08-26、着手前スキャン）

`contrast.ts` の道具で現行ダーク値の全数実測を行った結果:

- **契約 33 検査のうち MARGIN 込みで割れるのは1つだけ**: `invalid` on `invalid-face` **4.522:1**（要件 4.5 は満たすが 4.5×1.03=4.635 に届かない）。open-issues が「吟味するときに最初に見る値」と名指ししていたもの
- **新発見: `missing`/`judge-yes` の P型 ΔE が 0.101**——`DISTINCT_MIN` 0.10 まで余裕 0.001 で、「閾値ちょうどを置かない」に反する脆さ。open-issues に未記載だった
- `judge-yes` は暗い地で **canvas 比 10.7:1** と明るく浮く（ライトでは 1.24:1 で地とほぼ同輝度）。ただし探索の結果、**L を下げる解は存在しない**——ダークでは意味色4軸が全部「明るい色」側に集まるため、`judge-yes` の L は `missing`（0.82）と `pending`（0.75）に挟まれて 0.80 付近しか居場所がない。全制約（fg 4.635 / judge-no ペア 3.09 / 3色覚 ΔE ≥ 0.105 / 色域）を満たす格子点は **L 0.80 C 0.08 の1点だけ**だった
- 無彩色は健全: `ink` on `surface` 12.48:1（GitHub Dark ≈14:1 と VSCode Dark+ ≈11.5:1 の間。M7 設計スペックの比較先例）、`grid` on `canvas` 1.195:1（ライト 1.202:1 と同水準）、`rule` は3面とも 3.09 以上

## 確定値と根拠

| トークン | 現行 | 確定値 | 根拠 |
|---|---|---|---|
| `--invalid-face` | `oklch(0.30 0.05 30)` | **`oklch(0.28 0.05 30)`** | `invalid` on face 4.522 → **4.833**（MARGIN 込みで通る）。`invalid` 側は動かさない——動かすと `missing` との D型分離（ΔL 0.14）が縮む。面を一段暗くする形は**ライトの面の構図の翻訳でもある**（ライトは canvas L 0.95 に対し missing-face ±0 / invalid-face −0.02 / pending-face −0.01 と invalid-face だけ一段遠い。ダークは canvas 0.17 に対し +0.13 / **+0.11** / +0.13 になる） |
| `--judge-yes` | `oklch(0.80 0.10 165)` | **`oklch(0.80 0.08 165)`** | P型の `missing` との ΔE 0.101 → **0.107**（ライトの最薄 0.105——`missing`/`invalid` D型——と同水準）。彩度が下がるぶん浮きも僅かに和らぐ（canvas 比 10.68 → 10.59:1）。L は上記のとおり動かせない |
| 他 16 個 | — | **据え置き** | 全 33 検査を MARGIN 込みで満たすことを実測した。無彩色の根拠は上の「前提」のとおり |

確定値での再検算の結果: **契約 33 検査すべて MARGIN 込みで緑、DISTINCT 6ペア×3色覚すべて ≥ 0.10（最薄は `missing`/`judge-yes` P型 0.107）、色域・無彩色の違反 0 件。**

**机上で決められないもの（実機確認へ送る。人間の作業）:**
- 暗い面で黄土色の破線が「付箋」に見えるか
- `judge-yes`（canvas 比 10.6:1）が暗い地で浮きすぎないか——**浮くなら L を下げることになるが、それは `pending`/`invalid` との識別（ΔE 0.105 目安）との綱引きになる**。そのときは fg の反転（明るい面＋暗字 → 暗い面＋明るい字）まで含めた構図の再設計が要る
- `invalid`（L 0.68）と `missing`（L 0.82）が実機で分かれて見えるか
- 淡い面3つが地から浮いて見えるか（ダークは分離 1.29〜1.41:1 が最初から付いている。ライトの 1.006:1 より有利）

---

### Task 1: `palette.css` の `.dark` の値とコメント

**Files:**
- Modify: `src/styles/palette.css`（`.dark` ブロックとヘッダコメント）
- Test: 既存の `src/styles/palette.test.ts`（変更しない）

**Interfaces:**
- Consumes: なし（色値のみの変更）
- Produces: 後続タスクの文書が引用する確定値（上の表）

- [ ] **Step 1: worktree の依存を入れ、現状が緑であることを確かめる**

Run: `npm install && npm test`
Expected: 全テスト緑（`palette.test.ts` 含む）。赤があればこの計画の外の問題なので**着手前に報告する**

- [ ] **Step 2: `.dark` ブロックを書き換える**

`src/styles/palette.css` の `.dark { ... }` 全体を次に置き換える（値の変更は `--invalid-face` と `--judge-yes` の2行だけ。他はコメントの追加・更新）:

```css
.dark {
    /* ダーク。独立に置いた値（反転による自動生成はしない。rev 9章）。
     * M21 は「要件を満たす値を置いただけ」だったが、M27 で吟味した——
     * 契約の33検査すべてを MARGIN（1.03）込みで満たすことを実測し、
     * 動かしたのは invalid-face と judge-yes の2つだけ。根拠は各行と
     * UI設計ノート D20。実機確認の観点は docs/history/m27-core-dark-palette.md */
    --canvas: oklch(0.17 0 0);
    --surface: oklch(0.205 0 0);
    --surface-muted: oklch(0.27 0 0);
    --ink: oklch(0.88 0 0);                 /* surface 上 12.5:1。GitHub Dark（≈14:1）と VSCode Dark+（≈11.5:1）の間 */
    --ink-muted: oklch(0.70 0 0);
    --ink-faint: oklch(0.55 0 0);
    --rule: oklch(0.56 0 0);                /* surface 上 3.85:1。canvas だけ見て決めると surface 上で 3:1 を割る（M21） */
    --grid: oklch(0.25 0 0);                /* canvas 上 1.195:1。ライト（1.202:1）と同水準の薄さ */

    --missing: oklch(0.82 0.13 85);         /* 明るい黄土。3面とも 8.5:1 以上 */
    --invalid: oklch(0.68 0.15 30);         /* missing と D型で分ける ΔL 0.14（ΔE 0.145）。ライトの「invalid を一段暗く」と同じ役目 */
    --pending: oklch(0.75 0.12 250);

    /* 淡い面のダーク側。H は同じ軸の線色と揃える（ライトと同じ規約）。
       invalid-face だけ一段暗い L 0.28——3軸で最も暗い線色 invalid が
       上で 4.5×MARGIN を満たすため。ライトの構図（invalid-face だけ
       canvas から一段遠い）の翻訳でもある */
    --missing-face: oklch(0.30 0.05 85);
    --invalid-face: oklch(0.28 0.05 30);    /* invalid が上で 4.83:1。M21 の L 0.30 は 4.52:1 と MARGIN 割れだった */
    --pending-face: oklch(0.30 0.05 250);

    --judge-yes: oklch(0.80 0.08 165);      /* C は 0.10 から下げた——P型で missing との ΔE が 0.101 と閾値ちょうどだった（0.08 で 0.107）。
                                               L 0.80 は動かせない：ダークは4軸が全部明るい側に集まり、missing 0.82 と
                                               pending 0.75 に挟まれて他に居場所が無い（下げると識別が割れる） */
    --judge-yes-fg: oklch(0.17 0 0);
    --judge-no: oklch(0.36 0 0);
    --judge-no-fg: oklch(0.95 0 0);
}
```

- [ ] **Step 3: ヘッダコメントの「吟味していない」を更新する**

同ファイル冒頭のコメントにある次の2行:

```
 * 結果は src/styles/palette.test.ts が検証する（palette-requirements.ts が契約）。
 * ライトとダークは独立に置く。反転による自動生成はしない（rev 9章）。
 * ダークは M21 では設計対象外——要件を満たす値を置いただけで、吟味していない。
```

の最後の1行を次に置き換える:

```
 * ダークは M27 で吟味した（動かしたのは2値。経緯は UI設計ノート D20）。
```

- [ ] **Step 4: テストが緑のままであることを確かめる**

Run: `npm test`
Expected: 全緑。とくに `palette.test.ts` の「ダークのコントラスト」「意味色の識別」「色域」

- [ ] **Step 5: MARGIN 込みの全数検算を実行する**

次を `C:\Users\master\AppData\Local\Temp\claude\` 配下など一時ディレクトリに `verify-m27.mjs` として置き、**worktree のルートから**実行する（リポジトリにはコミットしない）:

```js
// M27 の検収: 契約 × MARGIN(1.03) の全数検査。palette.test.ts より厳しい。
import { readFileSync } from 'node:fs'
const { contrastRatio, deltaEok, linearToOklch, oklchToLinear, parseOklch, simulate } =
  await import(`file://${process.cwd().replaceAll('\\', '/')}/src/styles/contrast.ts`)
const {
  ACHROMATIC, ACHROMATIC_MAX_C, BACKGROUNDS, DISTINCT_MIN, DISTINCT_PAIRS, FACE_PAIRS,
  FACE_REQUIREMENTS, GAMUT_MAX_C_DRIFT, readTokenBlock, REQUIREMENTS, stripCssComments,
  TOKENS, MARGIN,
} = await import(`file://${process.cwd().replaceAll('\\', '/')}/src/styles/palette-requirements.ts`)
const css = stripCssComments(readFileSync('src/styles/palette.css', 'utf8'))
const block = readTokenBlock(css, '\\.dark', 'ダーク')
const raw = {}, pal = {}
for (const t of TOKENS) { raw[t] = parseOklch(block[t]); pal[t] = oklchToLinear(raw[t]) }
let bad = 0
const check = (label, val, min) => {
  if (val < min * MARGIN) { bad++; console.log(`×× ${label}: ${val.toFixed(3)} < ${(min * MARGIN).toFixed(3)}`) }
}
for (const bg of BACKGROUNDS) for (const r of REQUIREMENTS)
  check(`${r.token} on ${bg}`, contrastRatio(pal[r.token], pal[bg]), r.min)
for (const r of FACE_REQUIREMENTS)
  check(`${r.token} on ${r.face}`, contrastRatio(pal[r.token], pal[r.face]), r.min)
for (const p of FACE_PAIRS) check(`${p.a} vs ${p.b}`, contrastRatio(pal[p.a], pal[p.b]), p.min)
for (const p of DISTINCT_PAIRS) for (const v of ['normal', 'protan', 'deutan']) {
  const d = deltaEok(simulate(pal[p.a], v), simulate(pal[p.b], v))
  if (d < DISTINCT_MIN) { bad++; console.log(`×× ${p.a}/${p.b} ${v}: ${d.toFixed(3)}`) }
}
for (const t of TOKENS) {
  if (Math.abs(linearToOklch(pal[t]).C - raw[t].C) >= GAMUT_MAX_C_DRIFT) { bad++; console.log(`×× ${t} 色域外`) }
}
for (const t of ACHROMATIC) {
  if (linearToOklch(pal[t]).C > ACHROMATIC_MAX_C) { bad++; console.log(`×× ${t} 無彩色でない`) }
}
console.log(`違反 ${bad} 件`)
```

Run: `node <置いた場所>/verify-m27.mjs`
Expected: `違反 0 件`（この行を報告に貼る）

- [ ] **Step 6: 型検査と lint**

Run: `npx tsc -b && npm run lint`
Expected: どちらもエラー・警告 0

- [ ] **Step 7: コミット**

```bash
git add src/styles/palette.css
git commit -m "fix(m27): ダークパレットを吟味——invalid-face L0.28（MARGIN 割れの解消）と judge-yes C0.08（P型 ΔE の閾値ちょうどを解消）。他 16 個は実測のうえ据え置き"
```

---

### Task 2: UI設計ノートに D20 節を追記し、§9 から外す

**Files:**
- Modify: `docs/facet-UI設計ノート.md`（D19 節の直後＝「## 3. タイポグラフィの一次情報調査」の手前に D20 を挿入。§9 の1行を書き換え）

**Interfaces:**
- Consumes: Task 1 の確定値（本計画「確定値と根拠」の表と同じ内容。**数値は本計画から逐語で写す**）
- Produces: D20 という参照名（Task 3・4 の文書が引用する）

- [ ] **Step 1: D19 節の直後に次の節を挿入する**

挿入位置は `### D19. ボタン階層を3段階に固定する` 節の末尾（「無理に1つ黒く塗ると、そこが主役だと嘘をつくことになる。」の後の `---` の手前）:

```markdown
### D20. ダークパレットの吟味 ← M27 で §9 スコープ外から昇格

M21 まで、ダーク（`palette.css` の `.dark`）は「要件（`palette.test.ts`）を
通る値を置いただけ」だった。M27 で全数を実測して吟味した。
**新しい設計原則は増えていない**——ライトで確定した原則（D14〜D16、
「淡い面＋線＋文字」、MARGIN 1.03、D型は明度で分ける）を暗い地に
翻訳しただけである。ただし翻訳で明度の向きが反転するため、
単純写像にならなかった箇所が2つある。

**動かした値は2つだけ:**

| トークン | 変更 | 根拠 |
|---|---|---|
| `invalid-face` | L 0.30 → 0.28 | `invalid` が上で 4.52:1 と MARGIN 割れだった（→ 4.83:1）。`invalid` 側を明るくする解は `missing` との D型分離を削るので採らない。ライトの面の構図（invalid-face だけ地から一段遠い）の翻訳でもある |
| `judge-yes` | C 0.10 → 0.08 | P型で `missing` との ΔE が 0.101 と `DISTINCT_MIN` 0.10 ちょうどだった（→ 0.107。ライトの最薄 0.105 と同水準） |

**知見: ダークでは意味色4軸が全部「明るい色」側に集まる。**
ライトは黄土 L 0.49・赤 0.38・青 0.48 と暗い側に散らせたが、暗い地では
全軸を明るくするしかなく、`judge-yes` の L は `missing`（0.82）と
`pending`（0.75）に挟まれて **0.80 付近しか居場所が無い**（全制約を
満たす格子点は L 0.80 C 0.08 の1点だけだった）。`judge-yes` は暗い地で
canvas 比 10.6:1 と明るく浮くが、**これを暗くして沈める調整は識別との
綱引きになる**——実機で「浮きすぎ」と出たら、fg の反転（明るい面＋
暗字 → 暗い面＋明るい字）まで含めた構図の再設計が要る。

**据え置き 16 個の根拠**（吟味した結果の据え置きであり、未吟味ではない）:
`ink` on `surface` 12.5:1 は GitHub Dark（≈14:1）と VSCode Dark+（≈11.5:1）の
間（M7 設計スペックの比較先例と同じ物差し）。`grid` は canvas 上 1.195:1 で
ライト（1.202:1）と同水準。淡い面はダークでは地との分離（1.29〜1.41:1）が
最初から付いており、ライト（`missing-face` は canvas と 1.006:1、区別は
色相だけ）より条件が良い。

実機確認（暗い面での黄土の破線・`judge-yes` の浮き・赤と黄の分かれ・
淡い面の浮き）は人間の作業として残る。結果は
`docs/history/m27-core-dark-palette.md` に記録する。
```

- [ ] **Step 2: §9 の1行を書き換える**

```markdown
- ダークモードの配色設計（右上にトグルは存在するが、本議論では未検討）
```

を次に置き換える:

```markdown
- ~~ダークモードの配色設計~~ ← M27 で D20 に昇格し決着（実機確認のみ残る）
```

- [ ] **Step 3: コミット**

```bash
git add docs/facet-UI設計ノート.md
git commit -m "docs(m27): UIノートに D20（ダークパレットの吟味）を追記し、§9 スコープ外から外す"
```

---

### Task 3: rev 9章と open-issues の更新

**Files:**
- Modify: `docs/overview-rev.md`（9章の淡い面の1文）
- Modify: `docs/open-issues.md`（`[M21]` のダーク残件1項を `[M27]` の実機確認待ちに置き換え）

**Interfaces:**
- Consumes: Task 1 の確定値、Task 2 の D20 という参照名

- [ ] **Step 1: rev 9章の淡い面の記述を実値に合わせる**

`docs/overview-rev.md` の次の文（「〜9章」の意味色の節。`*-face` の説明）:

```
  - **淡い面 `*-face` は線色と同じ色相の、白（ダークは黒）へ寄せた面**（ライト L 0.93〜0.95、ダーク 0.30）。
```

の `（ライト L 0.93〜0.95、ダーク 0.30）` を `（ライト L 0.93〜0.95、ダーク 0.28〜0.30。ダークの値は M27 で吟味した——UI ノート D20）` に置き換える（文の他の部分は触らない）。

- [ ] **Step 2: open-issues のダーク残件を置き換える**

`docs/open-issues.md` の「デザイン」節にある次で始まる項（1項まるごと）:

```
- **ダークの値は要件を満たすだけで、吟味していない**（`src/styles/palette.css` の `.dark` ブロック）:
```

を削除し、同じ位置に次を置く:

```markdown
- **ダークの吟味値（M27）は実機確認待ち**（`src/styles/palette.css` の `.dark` ブロック）: 机上の吟味は M27 で済んだ（動かしたのは `invalid-face` L 0.28 と `judge-yes` C 0.08 の2値。UI ノート D20）が、「暗い面で黄土色の破線が付箋に見えるか」「`judge-yes` が暗い地で浮きすぎないか（canvas 比 10.6:1）」「`invalid`（L 0.68）と `missing`（L 0.82）が実機で分かれて見えるか」「淡い面3つが地から浮いて見えるか」は人間が画面を見るまで分からない。チェックリストは [`history/m27-core-dark-palette.md`](history/m27-core-dark-palette.md)。**浮きすぎと出た場合の調整は識別との綱引きになる**（D20 の知見——`judge-yes` の L は動かせないので、fg 反転まで含めた構図の再設計になる） `[M27]`
```

**このファイルの他の項は消さない**——とくに直後の「`invalid` がライトで暗い赤（L 0.38）なのは〜」の項はライトの話であり、M27 の対象外。

- [ ] **Step 3: コミット**

```bash
git add docs/overview-rev.md docs/open-issues.md
git commit -m "docs(m27): rev 9章の淡い面の実値を更新し、open-issues のダーク残件を実機確認待ちへ置き換える"
```

---

### Task 4: 申し送り `history/m27-core-dark-palette.md` の新規作成

**Files:**
- Create: `docs/history/m27-core-dark-palette.md`

**Interfaces:**
- Consumes: Task 1〜3 の内容
- Produces: 実機確認チェックリスト（人間が使う。結果はこのファイルに**追記**される）

- [ ] **Step 1: 次の内容でファイルを作る**

```markdown
# M27 申し送り: ダークパレットの吟味

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること。**

M27 は「**M21 が『要件を満たす値を置いただけ』としてきたダーク（`palette.css` の `.dark`）を全数実測して吟味し、根拠付きの値に置き直して UI ノート・rev・open-issues へ反映する**」マイルストーン。コード・契約・テストの構造は触っていない——変えたのは色値2つとコメント、文書4本である。

実装計画は [`../superpowers/plans/2026-08-26-m27-dark-palette.md`](../superpowers/plans/2026-08-26-m27-dark-palette.md)（このブランチの最初のコミット）。設計の恒久の記録は UI ノート **D20**。

## 確定した事項

- **動かした値は2つだけ**: `--invalid-face` L 0.30 → **0.28**（`invalid` on face 4.52 → 4.83。唯一の MARGIN 割れの解消）、`--judge-yes` C 0.10 → **0.08**（P型の `missing` との ΔE 0.101 → 0.107。閾値ちょうどの解消）。他 16 個は**吟味のうえ据え置き**（根拠は D20）
- **P型 ΔE 0.101 は計画の着手前スキャンでの新発見**——open-issues には `invalid` on `invalid-face` の 4.52 しか載っていなかった。閾値ちょうどの脆さは MARGIN（コントラスト側）だけでなく `DISTINCT_MIN`（色差側）にもあった
- **ダークでは意味色4軸が全部「明るい色」側に集まる**（D20 の知見）。`judge-yes` の L は 0.80 付近しか居場所が無く、「浮きすぎ」の将来調整は識別との綱引きになる
- 検算は `contrast.ts` の既存の道具だけで行い、新しいコードは足していない。契約（`palette-requirements.ts`）に MARGIN をテストとして課すことも見送った——テストは配色の差し替え（palette-retheme）にも使われ、外部テーマに 1.03 の余裕まで課すと選べる値が消える

## 実機確認について

**未実施である。** サブエージェントは Tauri の GUI を操作できないため、人間の作業として残る（[`../open-issues.md`](../open-issues.md) に `[M27]` として記載）。

```bash
npm install        # 省略しない
npm run tauri dev  # 右上のトグルでダークへ切り替える
```

- [ ] 1. 暗い面で黄土色の破線が「付箋」として読める（茶色や汚れに見えないか）
- [ ] 2. `judge-yes`（支持の面。canvas 比 10.6:1）が暗い地で浮きすぎない——課題ツリーに支持チップを置いて周辺視野で見る
- [ ] 3. `invalid`（L 0.68 の赤）と `missing`（L 0.82 の黄土）が並んだとき分かれて見える
- [ ] 4. 淡い面3つ（バッジ・セル・ガターのスロット）が地から浮いて見える（ダークは分離 1.29〜1.41:1 が付いているので、ライトで要った「色相だけで拾う」努力は不要のはず）
- [ ] 5. 端末（xterm）の面と文字がダークで読める（`theme.ts` は palette.css を読むだけなので値の追従は自動。見た目の確認のみ）
- [ ] 6. ライトに戻して崩れが無い（ライトの値は 1 ビットも動かしていないので、崩れていたらこのマイルストーンの外の問題）

確認後の後片付け（`CLAUDE.md`「マージ後の後片付け」1）:

```bash
git checkout -- sample-project/ && git clean -fdx sample-project/
git status --short          # 空になること
```

## 次へ

- 実機確認で「`judge-yes` が浮きすぎ」と出たら、それは M27 の微調整ではなく**構図の再設計**（fg 反転を含む）として別マイルストーンを立てること（D20 の綱引きの記述を先に読む）
- M26（IBM Plex 同梱）と並行して進んだ。`palette.css` と UI ノート D20 / §9 は M26 と重ならない想定だが、**後からマージする側が UI ノートの同一節に触れていないかを確認すること**
```

- [ ] **Step 2: 誤字と参照先の確認**

書いた内容のうち、ファイルパス参照（`../superpowers/plans/2026-08-26-m27-dark-palette.md`・`../open-issues.md`・`history/m27-core-dark-palette.md`）がすべて実在することを確認する:

Run: `ls docs/superpowers/plans/2026-08-26-m27-dark-palette.md docs/open-issues.md docs/history/m27-core-dark-palette.md`
Expected: 3本とも表示される

- [ ] **Step 3: 最終検証とコミット**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑・警告 0

```bash
git add docs/history/m27-core-dark-palette.md
git commit -m "docs(m27): 申し送りを書く——確定事項と実機確認チェックリスト（未実施）"
```

---

## 実機確認（人間の作業。タスクには含めない）

Task 4 のチェックリストを人間が実機で一巡する。**このマイルストーンのマージは実機確認を待たない**（M21 Task 11 と同じ扱い——open-issues に `[M27]` として残っており、確認後にそこを消す）。結果が出たら `history/m27-core-dark-palette.md` に**追記**し、値の調整が要るなら別途判断する。
