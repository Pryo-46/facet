# M21 申し送り: 役割トークン v2

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

M21 は「**面・文字・線を無彩色にし、彩度を欠落（黄）／無効（赤）／着信（青）／支持（緑）の4軸だけに限った役割トークン 15 個へ、契約・パレット・使用箇所・共通部品・Skill・文書を一斉に移す**」マイルストーン。

実装計画は [`../superpowers/plans/2026-08-23-m21-design-tokens-v2.md`](../superpowers/plans/2026-08-23-m21-design-tokens-v2.md)（`63efde3` でこのブランチの最初のコミットとして置いた。同じコミットで設計スペックの数え落とし——透過・Chip 化する箇所・`badgeClass` 呼び出しの数——も訂正している）、設計の正は [`../superpowers/plans/2026-08-23-m21-design-tokens-v2-design.md`](../superpowers/plans/2026-08-23-m21-design-tokens-v2-design.md)。

コミット範囲: `63efde3`（計画）〜本コミット。実装は `214d842`〜`d217f18`（Task 1〜9、計12コミット）。fix round が入ったのは Task 2（1巡。lint 警告0を保つための部品分割）・Task 5（1巡。テストカバレッジの空白を埋め直し）・Task 9（1巡。rev 9章のレビュー指摘5件）。**Task 10（本コミット）は申し送りの記述だけ**で、**Task 11（実機確認）は人間の作業として未了のまま残す**（[`../open-issues.md`](../open-issues.md) の「次に手を付ける候補」6件目。issue-tree-m3 と同じ扱い）。

---

## 何を作ったか

- **役割トークンを 12 個 → 15 個へ。** 面（`canvas` / `surface` / `surface-muted`）・文字（`ink` / `ink-muted` / `ink-faint`）・線（`rule` / `grid`）の無彩色8個はほぼ現状維持、`surface-accent`（緑がかった見出し面）は廃止して `surface-muted`（一段沈んだ面）に統合した。彩度を持つのは**意味を運ぶ4軸だけ**——欠落軸 `missing`（黄）・無効軸 `invalid`（赤）・着信軸 `pending`（青）・判断軸 `judge-yes`/`judge-yes-fg`（支持・緑の面）/`judge-no`/`judge-no-fg`（棄却・無彩色の面）。旧 `warning`/`warning-fg`/`ok`/`ok-fg` は消えた。
- **規約6条**（`docs/overview-rev.md` 9章に反映済み）: (1) 色を持つのは意味だけ。(2) 開いているものは線、決着したものは面（黄・赤・青の面、緑の線は作らない）。(3) 判断軸で彩度を持つのは支持のみ。(4) 5色目は作らない。(5) 削除だけはホバー時に `invalid` を借りる。(6) 無彩色とは C ≤ 0.01。
- **共通部品 `Badge` と `Chip` を新設。** 状態のバッジ（課題ツリーの5語＋用語集の削除バッジ等）とフィルタの選択トグル（用語集2種・エラーカタログ2種）を、クラス文字列の写しではなく部品に一本化した。
- **セルの状態を面から輪郭へ。** 用語集・エラーカタログの `errorCell`/`warnCell`（面塗り）を `CELL_FACE_CLASS`（`outline` による無効＝実線・欠落＝破線）に置き換え、シーケンスは**行全体を染める帯を廃止**し `#N`（通し番号セル）に無効の輪郭を出す形にした。
- **役割トークンへの透過（`/NN`）を全面禁止。** `conventions.test.ts` が機械検査する。
- **数字を等幅に。** `@layer base` の `body` へ `font-variant-numeric: tabular-nums` を一括適用し、No 列は右揃えにした（撒き忘れの方が害が大きいため個別箇所には当てない）。

---

## 実装で確定した事項

### 黄と赤は明度で分ける

D型色覚では黄と赤は色相だけでは分かれない。`missing` と `invalid` を同じ L 0.50 に置くと D型の OKLab 色差（ΔE）は **0.013** しか出ず、`DISTINCT_PAIRS` の下限 0.10 を満たせない。`invalid` を L 0.38（暗い赤）まで一段暗く落とすと ΔE は **0.108** になり要件を満たす。この検算は計画の着手前スキャンの時点で `src/styles/contrast.ts` を使って行われ、Task 1 でそのまま `palette.css` の値になった。

### `destructive` variant は使わない——削除は生のボタン。理由はレビューで訂正された

計画時点の理由は「`components/ui/` の shadcn 生成物は手で整形しない（rev 7章）」だった（許可リストに `destructive` を入れない、`Button` の variant は `outline`/`ghost` のみに限る）。

Task 9 のレビューでこの理由が**事実誤りである**ことが判明した——rev 7章はむしろ「コンポーネントはソースコピー方式なので改造は自由」と書いており、当初の一文はその7章と正面から矛盾していた。実物（`src/components/ui/button.tsx`）を確認したうえで理由を差し替えた。**正しい理由は「`destructive` variant が使うのは透過の面（`bg-destructive/10` / `hover:bg-destructive/20` / `focus-visible:ring-destructive/20` 等）であり、規約2（開いているものは線＝無効を面にしない）と M21 の透過全面禁止の両方に触れるから」**である。結論（`destructive` は使わない、削除は `FileList.tsx` の生の `<button>` に常時 `text-ink-muted`・ホバーで `text-invalid`）は変わっていない。

### 透過は4箇所——設計スペックの数え落としを計画が正した

計画の着手前スキャンで確定した実数は **4箇所**：`FileHeader.tsx:55`（`text-ink-muted/70`）、`IssueTreeEditor.tsx`・`LogicTreeEditor.tsx`・`SequenceEditor.tsx` の `KeyHints` 帯（各 `bg-surface/80`）。設計スペックの本文（「実装の順序」節）は「透過3箇所の除去」と要約しており数え落としがあった——計画（`63efde3` のコミットメッセージにも明記）はこちらを正として4箇所すべてを Task 5・6 で不透明（`text-ink-muted` / `bg-surface`）に戻した。

### `App.tsx` の更新ボタンは Chip ではなく強調面

用語集・エラーカタログの選択トグル3箇所（`bg-ink text-canvas` の黒塗り）は `Chip` 部品に置き換えたが、`App.tsx:934` の「更新あり」の強調ボタンは**選択トグルではない**ため対象外とし、`bg-surface-muted`（一段沈んだ面）への置き換えだけで済ませた。設計スペックの決定3が挙げた「4箇所」は、この1件を Chip 化3箇所に混ぜた誤記だった。

### 共通部品は2ファイル構成——`Badge.tsx`（部品だけ）＋ `badge-styles.ts`（クラスの組み立て）

Task 2 の実装で `Badge.tsx` 1ファイルに `BadgeVariant` 型・定数（`BADGE_BOX_HEIGHT` 等）・`badgeClass`・`Badge` 部品をすべて置いたところ、oxlint の `react(only-export-components)` 警告が出た（このリポジトリは警告0を保っている）。既存の流儀（`KeyHints.tsx` と `hint-text.ts` の分け方）に揃え、**型・定数・`badgeClass` を `src/components/badge-styles.ts` へ切り出し、`Badge.tsx` は `Badge` 部品だけを export する**形に直した。課題ツリーの語彙（`BadgeGroup` / `OpenKind`）→ 部品の `variant` の対応は `src/modules/issue-tree/badge-variant.ts` が持つ——**部品は課題ツリーの語彙を知らない**。

### `OpenKind` は `derive.ts` ではなく `open-targets.ts` にあった——計画の記述ミス

`badge-variant.ts` の Interfaces 節は `OpenKind` の出所を `./derive` としていたが、実体は `./open-targets` にしかない。Task 3 の実装者が実物に合わせて機械的に訂正した（計画の矛盾として作業を止めるほどの対立ではないと判断）。

### `conventions.test.ts` 検査3の正規表現に `-fg` を弾く欠陥があった

計画のコードは `/\b(?:[a-z-]+:)?(text|border|outline|ring|stroke|fill|decoration)-judge-(yes|no)\b/` で判断軸のチャネル違反を弾く想定だったが、`\b`（語境界）は `yes` と `-fg` の間でも成立するため、正当な `text-judge-yes-fg` / `text-judge-no-fg`（面の上の文字色）まで誤検出した。Task 7 の実装者が負の先読み `(?!-fg)` を足して直した：`/\b(?:[a-z-]+:)?(text|border|outline|ring|stroke|fill|decoration)-judge-(yes|no)\b(?!-fg)/`。

### シーケンスの「self の to-mismatch」の DOM テストは、帯の廃止で一度消え、`#N` の `outline-invalid` を見る形で復元した

行全体を染める帯を廃止した Task 5 で、帯の存在そのものを DOM から引いていたテストが2本あった。1本（M8「面を2枚重ねない」）は前提ごと消滅したので削除で確定したが、もう1本（`self` なのに `to` があるステップが「行全体でしか特定できない指摘」として画面に出ることを確かめるテスト）はカバレッジの空白として一度「計画の矛盾」で報告された。fix round で、`#N`（通し番号セル）が `outline-invalid` を持つことを見る形に書き換えて復元し、実装を一時的に壊して赤くなることも確認した（コミット `b87bab2`）。

### 生成 CSS で `outline-dashed` / `outline-1` / `@property --tw-outline-style` の初期値 `solid` を確認した

Tailwind v4 は `outline-style` を直接ユーティリティごとに固定するのではなく、`@property --tw-outline-style`（初期値 `solid`）を介して `outline-1`（`outline-style: var(--tw-outline-style)`）に反映する構造になっている。Task 4 は `outline-dashed`・`outline-invalid`・`outline-missing` が生成 CSS に載ることまでは確認したが、「`outline-1` 単独で実線になる根拠」（`@property` の初期値）は未確認のまま Task 6 へ持ち越された。Task 6 で `npx vite build` の生成物を実際に grep し、

```
.outline-1{outline-style:var(--tw-outline-style);outline-width:1px}
@property --tw-outline-style{syntax:"*";inherits:false;initial-value:solid}
```

の両方が出ていることを確認した。**なお Task 4 の報告にあった「lightningcss が `--color-missing` を `--missing` へ inline した」という説明は誤り**——正しくは `@theme inline` によるエイリアス展開であり、Task 6 のレビューでこの点が指摘された（history には転記しない）。

---

## 実機確認（Task 11）について

**未実施である。** サブエージェントは Tauri の GUI を操作できないため、計画の Task 11 は人間の作業として残っている。[`../open-issues.md`](../open-issues.md) の「次に手を付ける候補」に6件目として載せてある。確認が済んだらその項を消すこと。

以下は計画 Task 11 のチェックリスト（設計スペック「検証」の9項目に、`invalid` の赤の見え方と No 列の右揃えを足した11項目）と、Task 3 のレビューで追加した2項（`invalid` 経路のフォーカスリングとの重なり／同色面上の見送りバッジの分節）を、**空のまま**写したものである。**通ったかどうかの記録ではない。**

```bash
npm install        # 省略しない
npm run tauri dev
```

- [ ] 1. 黄・赤・青・緑が周辺視野で別物に見える（課題ツリーの帯に4種のチップを並べる）
- [ ] 2. 黄土色が「欠落」として読める（茶色に見えるなら設計スペック 決定1 の第2候補へ）
- [ ] 3. 無効の赤（L 0.38）が黒っぽく見えないか（見えるなら `DISTINCT_MIN` 0.08 ＋ L 0.42 へ）
- [ ] 4. 支持と棄却が、形でも明度でも分かれる
- [ ] 5. 緑帯を外したカラム名が見出しに見える（用語集・エラーカタログ）
- [ ] 6. チップの選択が黒塗りなしで分かる（用語集の種別フィルタ）
- [ ] 7. 用語集の未定義セルの破線・エラーセル（名称重複）の実線。ID 重複のファイルで先頭セルに赤が出る
- [ ] 8. シーケンスで行の帯が消え、`#N` と該当セルだけが示される
- [ ] 9. 端末の選択面（`surface-muted`）が見える
- [ ] 10. 見送りの箱が「沈んで」見える
- [ ] 11. No 列の数字が右揃えで桁が揃う
- [ ] 12. `invalid` の経路——`HypothesisRow` の展開パネルで、無効を示す輪郭（`outline-invalid`）とセルのフォーカスリングが重なったとき、両方が見分けられること
- [ ] 13. 同色面上の見送りバッジの分節——見送りの箱（`surface-muted` の面）に乗った見送りバッジ（同じく `surface-muted` の面）の境目が、面が同じでも読み取れること

確認後は次で後片付けする（`CLAUDE.md`「マージ後の後片付け」1）:

```bash
git checkout -- sample-project/ && git clean -fdx sample-project/
git status --short          # 空になること
```

---

## 次へ

**UI ノート B〜F**（[`../open-issues.md`](../open-issues.md) の「デザイン」節に `[M21]` タグで1項ずつ足してある）。B（16px 基準）に入ると、`Badge` の `text-xs` と `h-[18px]` と `BADGE_BOX_HEIGHT` を同時に動かすことになる——3つが同じファイル（`src/components/badge-styles.ts`。上記のとおり `Badge.tsx` ではなく分離後のこちら）に揃えてあるのはそのためである。
