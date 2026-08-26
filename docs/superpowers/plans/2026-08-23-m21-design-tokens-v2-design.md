# M21 設計スペック: 役割トークン v2——色を持つのは「意味」だけ

> 2026-08-23。[`docs/facet-UI設計ノート.md`](../../facet-UI設計ノート.md)（以下「UI ノート」）の **A: 色の規約**（D2・D9・D15・D16・D19・U2）を実装するための設計。
> UI ノートの分割（A〜F）はこのスペックの末尾「スコープ外」に写してある。
> rev 9章のトークンの節はこのスペックの決定で**書き換える**（M7 の設計スペック `2026-08-09-m7-design-tokens-design.md` の決定1・2・4 はこれで置き換わる。決定3（差し替え機構）・5・6 は生きている）。

## 目的

UI ノート §1.3 の診断——**彩度の予算が装飾に分散し、未定義の赤が目に飛び込んでこない**——を、トークン体系の作り直しで解く。

- 面・文字・線は**無彩色**にする。クリーム地・緑のカラム名帯・黒塗りトグル・ノード文字の青を消す
- 彩度を持つのは**意味を運ぶ4軸だけ**：欠落（黄）／無効（赤）／着信（青）／支持（緑）。**5色目は作らない**
- 欠落と無効を**色相で**分ける（rev 5章「未定義と無効の型区別」の視覚表現）。これにより赤が欠落軸と判断軸で奪い合う問題（UI ノート D14）が消える
- 「開いているものは**線**、決着したものは**面**」を全モジュール共通の規約にする（課題ツリー issue-tree-m3 の既存語彙を全体へ）
- バッジ・チップを共通部品にし、クラス文字列の写しを消す

**値は仮**。無彩色の階調と4色の具体値は要件（コントラスト・色差・無彩色）をテストが検算したうえで置き、実機（27型 WQHD・ライト）で見てから詰める。

## 決定1: 役割トークンの体系（12 → 15）

| 系統 | トークン | 彩度 | 役割 |
| --- | --- | --- | --- |
| 面 | `canvas` | 無 | 地（方眼を敷く面） |
| | `surface` | 無 | 作業する面（テーブル・カード・モーダル） |
| | `surface-muted` | 無 | **一段沈んだ面**。選択中タブ・ファイル一覧の種類見出し・端末のアクティブタブと選択面・**見送りの箱**。`surface-accent` の後継（緑を捨て、役割を「見出し」から「沈んだ面」に改める） |
| 文字 | `ink` / `ink-muted` / `ink-faint` | 無 | 既定の前景（4.5:1）／抑えた文字（4.5:1）／非アクティブ（3:1。本文に使わない）——現行どおり |
| 線 | `rule` / `grid` | 無 | セル境界・入力枠（3:1）／方眼紙（装飾）——現行どおり |
| **欠落軸** | `missing` | **黄** | 未定義・未分類・空セル・未回答・未決・仮説なし・保留。**線と文字だけ**、面にしない。線種で段を分ける——**破線＝まだ見ていない**（未定義・未決・仮説なし）／**実線＝見たが決められない**（保留） |
| **無効軸** | `invalid` | **赤** | 重複・参照切れ・整合性違反・スキーマ違反・読めないファイル。**線と文字だけ**（実線）。表記ゆれの「指摘」は**波線下線**（弱形） |
| **着信軸** | `pending` | **青** | 外から届いた入力に返答していない状態。いまは課題ツリーの「未判断」（`pendingNotes` が空でない）だけ。**線と文字だけ** |
| 判断軸 | `judge-yes` ＋ `judge-yes-fg` | **緑** | 支持の**面**と、その上の文字 |
| | `judge-no` ＋ `judge-no-fg` | 無 | 棄却の**面**（チャコール）と、その上の文字 |
| | （見送り） | 無 | 専用トークンなし。`surface-muted` の面 ＋ `rule` の枠 ＋ `ink-muted` の文字 |

**消えるトークン**：`surface-accent`（→ `surface-muted`）、`warning` / `warning-fg`（→ `missing` / `invalid` に振り分け。面は廃止）、`ok` / `ok-fg`（→ `judge-yes` / `judge-yes-fg`。「応答・確定」の用途は結局どこにも生まれず、使用箇所は課題ツリーの支持バッジ1つだった）。

### 規約（rev 9章に書く文）

1. **色を持つのは意味だけ。** 欠落・無効・着信・支持の4軸に限る。分類（用語の種別・解決レベル）・ボタン・見出し・選択状態は彩度を持たない（UI ノート D2・D16・D19）
2. **開いているものは線、決着したものは面。** 欠落・無効・着信は線と文字で、判断は面で表す。黄・赤・青の面、緑の線は作らない（D14 の「別チャネルに載せる」を、色相を分けた後も維持する——チャネルが同じなら線種・明度で段を作れるため）
3. **判断軸で彩度を持つのは支持のみ。** 棄却はチャコール、見送りは沈んだ面。明度差で分け、白黒でも判別できること（D15）
4. **5色目は作らない。** 新しい意味が出たら、既存の4軸のどれかに入るか、色以外のチャネル（線種・形・位置）で表す。半年後に虹色へ戻らないための線（D16）
5. **削除だけは赤を借りる**——ただし**ホバー時のみ**。常時は `ink-muted`。「取り返しのつかない操作」は無効軸の隣の意味として `invalid` を借りる唯一の例外で、これ以外に借用を作らない（D19）
6. **無彩色とは C ≤ 0.01 のこと。** 面・文字・線・`judge-no` 系の色はこの範囲に収める。微かな暖色（現行の C 0.012）も装飾である

### 黄について

白地の上で文字として 4.5:1 を満たす黄は存在しない。L≈0.5 まで落とすと**黄土色（マスタード）**になる。これを受け入れ、「蛍光ペンの黄」ではなく「付箋の黄」と割り切る。

**第2候補**（実機で黄土色が「茶色」に見えた場合）：線を 3:1（L≈0.6）まで明るくし、バッジの文字は `ink` にして**枠だけ黄**にする。この場合 `missing` の要件は 4.5 から 3.0 に下がり、`text-missing` を禁止する検査を足す。この切り替えは値と要件表の変更で済み、使用箇所には及ばない（バッジは部品が持つため）。

## 決定2: 仮の値

無彩色は C = 0（ライト・ダークとも）。以下はライトの目安で、**最終値はテストの検算に従う**。

| トークン | L | C | H | 備考 |
| --- | --- | --- | --- | --- |
| `surface` | 0.985 | 0 | — | ほぼ白 |
| `canvas` | 0.95 | 0 | — | 地。「地は方眼、作業する面は無地」は維持（rev 9章） |
| `surface-muted` | 0.91 | 0 | — | `ink` `ink-muted` 4.5、`ink-faint` `rule` 3.0 が載る |
| `grid` | 0.89 | 0 | — | `canvas` 上 1.17:1 の目安（M8 の実機裁定）を保つ |
| `rule` | 0.58 | 0 | — | 3面すべてで 3:1（`surface-muted` 上が最も厳しい） |
| `ink-faint` | 0.58 | 0 | — | 同上 |
| `ink-muted` | 0.42 | 0 | — | 3面すべてで 4.5:1 |
| `ink` | 0.18 | 0 | — | |
| `judge-no` | 0.35 | 0 | — | `judge-no-fg` = `surface` 相当 |
| `judge-yes` | 0.87 | 0.08 | 165 | 青緑寄り（P型・D型で赤・黄土と離すため）。`judge-yes-fg` = `ink` 相当 |
| `missing` | 0.49 | 0.12 | 85 | 黄土。3面で 4.5:1 |
| `invalid` | 0.38 | 0.15 | 30 | 現行 `warning` の色相を踏襲。**`missing` より一段暗い**（下の検算） |
| `pending` | 0.48 | 0.14 | 250 | 青 |

**検算で分かった帰結（計画の着手前スキャン）**：黄と赤は D型色覚では色相で分かれない。`missing` と `invalid` を同じ L 0.50 に置くと D型の OKLab 色差が 0.013 しか出ず、`DISTINCT_PAIRS` を満たせない。**明度で分ける**——`invalid` を L 0.38（暗い赤）まで落とすと 0.108 になる。上の表はその結果で、ライト・ダークとも全要件を `src/styles/contrast.ts` で検算済み（値は実装計画 Task 1 Step 4）。実機で「無効の赤が黒っぽい」と出たら、「色差の逃げ道」（決定5）で 0.08 に下げ、`invalid` を L 0.42 前後へ戻す。

ダークは**設計対象外**（UI ノート §9）だが、`palette.test.ts` が両モードを見るので要件を満たす値を置く。ライトの反転ではなく独立に置く原則（rev 9章）は守るが、値の吟味はしない。

## 決定3: 使用箇所の付け替え

### 振り分けの規則

| データ上の状態 | トークン | 形 |
| --- | --- | --- |
| 未定義・未分類・空セル・未回答・未決・仮説なし | `missing` | 破線の枠 |
| 保留 | `missing` | 実線の枠 |
| 重複・参照切れ・整合性違反・読めないファイル・スキーマ違反 | `invalid` | 実線の枠／文字 |
| 表記ゆれの「指摘」 | `invalid` | 波線下線 |
| 未判断 | `pending` | 実線の枠／文字 |

`src/types/*.ts`・`consistency.ts`・`warnings.ts` に出る `warning` は**データの重大度名**であって色トークンではない。触らない。計画では現行の `warning` / `ok` / `surface-accent` のクラス名参照（コメント・テスト・データ名を除くと 24 行。計画の着手前スキャンが一覧を持つ）を1つずつこの表で振り分けること。

### 付け替え表

| 箇所 | 現在 | 後 |
| --- | --- | --- |
| 選択中タブ（`App.tsx`）・種類見出し（`FileList.tsx`）・端末のアクティブタブ（`TerminalPane.tsx`）・xterm の選択面（`core/terminal/theme.ts`） | `surface-accent` | `surface-muted` |
| 見送りの箱（`issue-tree/IssueBox.tsx`） | `bg-surface-accent border-ink-muted` | `bg-surface-muted border-rule`（`surface-muted` 上の `rule` 3:1 を要件に入れるので使える） |
| カラム名（`GlossaryEditor.tsx`・`ErrorCatalogEditor.tsx`） | `bg-surface-accent font-bold` | **面なし**。`text-ink-muted font-medium tracking-wide` ＋ `border-b border-rule`。和文のウェイト段は E（フォント同梱）まで効かないので、A では字間とグレーで分ける |
| フィルタチップの選択状態（用語集1・エラーカタログ2の計3箇所。`App.tsx` の更新ボタンの強調面は選択トグルではないので `bg-surface-muted` に置き換えるだけ） | `bg-ink text-canvas` の三項演算子 | `Chip` 部品（決定4）。選択＝`bg-surface-muted border-ink`、非選択＝`border-rule` |
| `<Button>` の塗り（`App.tsx`「フォルダを開く」） | primary | `outline`。**facet に primary は置かない** |
| `Button` の `destructive` variant（`ui/button.tsx`） | 使用 0 件 | **触らない**（shadcn 生成物は手で整形しない——rev 7章）。許可リストにも入れない。削除は生の `<button>`＋常時 `text-ink-muted`・`hover:text-invalid` の形（`FileList.tsx`）を規約にする |
| 削除のホバー（`FileList.tsx`） | `hover:text-warning` | `hover:text-invalid` |
| バッジ（`issue-tree/badge-styles.ts` の6呼び出し——うち1つがヘッダの集計チップ `CHIP_KINDS`） | `ok` / `ink` / `warning` | `Badge` 部品（決定4） |
| 用語集・エラーカタログのセル（`core/list-editor/cell-face.ts`） | `bg-warning/20`（エラー）／`bg-warning/10`（未定義） | `invalid` 実線／`missing` 破線。**`outline` で引く**（`ring` は線種を持たず、`border` はテーブルの罫線と衝突する）。`outline-offset` は負にして枠の内側に収める。プレースホルダ文字列「未定義」「別名なし」の除去は C |
| シーケンス（`SequenceEditor.tsx`・`GutterSlot.tsx`・`ActorRefCell.tsx`） | 行の帯 ＋ セルの面 | **行の帯は廃止し、セルだけ**（UI ノート D5。面を消す作業と同じ箇所なので A で済ませる）。未回答＝`missing` 破線、参照切れ＝`invalid`。`stepHas(index,'row')` の排他判定は帯と一緒に消える（open-issues「面が二重になりうる」が解消） |
| ロジックツリー `NodeBox.tsx`・`IssueBanner.tsx`・`TerminalTab.tsx` | `warning` | 上の規則で振り分け（計画で実物を読んで確定） |
| shadcn の導出（`index.css`） | `accent`/`secondary`/`muted` = `canvas`、`destructive` = `warning`、`chart-4/5` = `warning`/`ok` | `accent`/`secondary`/`muted` = `surface-muted`、`destructive` = `invalid`、`chart-4` = `missing`、`chart-5` = `judge-yes`。`primary` = `ink`、`ring` = `ink` は据え置き |
| 数字（D9） | — | `@layer base` の `body` に `font-variant-numeric: tabular-nums` を一括適用。テーブルの No 列は右揃え |
| 役割トークンの透過（`FileHeader.tsx` の `text-ink-muted/70`、`KeyHints` 帯の `bg-surface/80` ×3（シーケンス・ロジックツリー・課題ツリーの各キャンバス）） | 透過 | 不透明に戻す（`text-ink-muted`、`bg-surface`）。`OVERLAYS` が消えた後は正当な透過が残らないので、決定5で全面禁止にする |

## 決定4: 共通部品

A が触るのはバッジとチップなので、作るのもこの2つだけ。ボタンは shadcn の `Button` を使い続け、新部品は作らない。

| 部品 | 置き場 | 中身 |
| --- | --- | --- |
| `Badge` | `src/components/Badge.tsx` | 意味を `variant` で受ける：`open`（`missing` 破線）／`hold`（`missing` 実線）／`invalid`／`pending`／`yes`（`judge-yes` 面）／`no`（`judge-no` 面）／`deferred`（`surface-muted` 面・`rule` 枠・`ink-muted` 文字）／`faint`（`ink-faint` 枠・文字。抑制された配下）。**形（高さ・角丸・余白・`tabular-nums`・`whitespace-nowrap`）は部品が持ち、呼び側は意味だけ渡す** |
| `Chip` | `src/components/Chip.tsx` | 選択トグル。`selected` を受けて面と枠を出す。`buttonBase` の上に載る。3箇所の三項演算子を置き換える |
| `Button` | 既存 `ui/button.tsx` | variant を **`outline`（Secondary）／`ghost`（Tertiary）** に限る。`default`・`secondary`・`destructive`・`link` は `conventions.test.ts` で弾く（定義は shadcn の生成物なので消さない） |

- **`Badge` の高さは部品側の定数**（`BADGE_HEIGHT` 相当）として持ち、課題ツリーの `layout` はそこから読む。18 を2箇所に書かない
- **クラス名は完全な字面で書く**（`badge-styles.ts` の既存コメントを引き継ぐ）。Tailwind の走査は静的なので `` `text-${色}` `` は生成 CSS に載らない
- `badge-styles.ts` は `Badge` に吸収して消す。`BadgeGroup` → `variant` の対応は課題ツリー側（`derive.ts` の隣）に残す——部品は課題ツリーの語彙を知らない
- 用語集の別名バッジ（`GlossaryEditor.tsx`）が同じ形に寄せられるかは計画で確認し、寄せられるなら置き換える。寄せられない理由があれば計画に書く

## 決定5: 検証機構

### `src/styles/palette-requirements.ts`（契約）

| 項目 | 後 |
| --- | --- |
| `TOKENS` | 15個 |
| `BACKGROUNDS` | `canvas` / `surface` / **`surface-muted`** |
| `REQUIREMENTS` | `ink` `ink-muted` `missing` `invalid` `pending` 4.5、`ink-faint` `rule` 3.0（すべて `BACKGROUNDS` の3面に対して） |
| `FACE_REQUIREMENTS` | `judge-yes-fg`／`judge-yes`、`judge-no-fg`／`judge-no`（4.5） |
| **新規 `FACE_PAIRS`** | `judge-yes` ⇔ `judge-no` の面どうし 3:1（白黒でも判別） |
| **新規 `DISTINCT_PAIRS`** | `missing` `invalid` `pending` `judge-yes` の全6組で、標準・P型・D型の OKLab 色差 ≥ 0.10。**失敗条件**（M7 決定4 では印字のみだった） |
| **新規 `ACHROMATIC`** | `canvas` `surface` `surface-muted` `ink` `ink-muted` `ink-faint` `rule` `grid` `judge-no` `judge-no-fg` の C ≤ 0.01 |
| 削除 | `OVERLAYS` `OVERLAY_FOREGROUNDS` `OVERLAY_MIN` `HEADING_FACE` `HEADING_FACE_FOREGROUNDS` |
| 据え置き | `MARGIN`（1.03）、`MODES`、`readTokenBlock` 等の読み手 |

`palette.test.ts` は表を読んで回る構造なので、新しい3種の表を回す検査を足すだけ。P型・D型のシミュレーションは `contrast.ts` に既にある。

**色差の逃げ道**：4色・3色覚の全組で 0.10 を満たせない場合（黄土⇔緑の D型が怪しい）、**0.08 まで下げてよい**。下げたときは閾値の隣に実測値と理由をコメントで残す。閾値を黙って消さない。

### `src/styles/conventions.test.ts`（使い方の検査）

足すもの:

1. `<Button` は `variant` が `outline` / `ghost` のどちらか必須
2. 軸のチャネル違反——`bg-(missing|invalid|pending)` と `(text|border|outline|ring|stroke)-judge-(yes|no)\b` を弾く（`-fg` は除く）
3. **役割トークンの透過を全面禁止**——`(text|bg|border|…)-<token>/\d+` を弾く
4. 旧トークン名（`warning` `warning-fg` `ok` `ok-fg` `surface-accent`）がクラス名として0件

既存の「色値の直書き禁止」「`text-xl` 以上と `text-[...]` の禁止」は据え置き。

### `palette-retheme` Skill

Morphos 固有の記述（`theme.json` の拾い方・`destructive` の生成ミス・Lava Paper 等の色名）を外し、新トークンで書き直す。

- 外部テーマから機械的に拾うのは **7つ**：`background`→`canvas`、`card`→`surface`、`muted`→`surface-muted`、`foreground`→`ink`、`muted-foreground`→`ink-muted`、`border`→`rule`、`destructive`→`invalid`
- 人が選ぶのは **8つ**：`missing` `pending` `judge-yes` `judge-yes-fg` `judge-no` `judge-no-fg` `grid` `ink-faint`
- **地は無彩色**：テーマの地色からは L だけ拾い、C は捨てる（`ACHROMATIC` が弾くため）。これを手順に明記する
- `scripts/palette-fit.mjs` は要件表を import しているので表の変更に追従する。新しい3種（`FACE_PAIRS` `DISTINCT_PAIRS` `ACHROMATIC`）を報告に足す

## 決定6: 文書

| 文書 | 何をする |
| --- | --- |
| `docs/overview-rev.md` 9章 | トークンの節を15個の体系と規約6条で書き直す。「確定要素」の `surface-accent`・「塗りボタンは1画面に1つ」・`warning/10` `/20`・`ok` の記述を置き換える。**章番号・ファイル名は動かさない**（`rev 9章` は多数から参照されている） |
| `docs/issue-tree/仮説検証モジュール-設計ノート.md` D8 | 見送り箱の塗りを「`surface-accent` の流用」から「`surface-muted` 本来の役割」に直す（課題ツリーの「正」） |
| `docs/open-issues.md` | **消す**：`ok` 未使用／`warning` と `ok` の P型・D型色差／`text-ink-muted/70` の透過／`bg-surface/80` の前例／行の帯と `from`/`to` の面の二重。**足す**：実機確認（人間）、UI ノート B〜F の残り（いまは台帳に無い） |
| `docs/history/m21-core-design-tokens-v2.md` | 新規（コア系統の通し番号）。実機確認のチェックリストを空のまま写す |
| `docs/README.md` | 地図に `facet-UI設計ノート.md` を載せる（いま未掲載）。マイルストーン表に M21 を足す |
| `docs/facet-UI設計ノート.md` | **触らない**。D のどれが済んだかは history と open-issues が持つ |
| `src/styles/palette.css` ヘッダ | 由来（Morphos）の段落と役割一覧を書き換え |
| `src/core/reading-guide.md`・`README-for-AI` | 色の語彙に触れていれば直す（計画で grep して確認） |

## 実装の順序

1. **契約を先に書き換える**——`palette-requirements.ts`・`palette.test.ts` に3種の検査を足し、`palette.css` に仮の値を置いて**トークン層だけで緑にする**
2. `index.css` の `@theme` と shadcn 導出、`core/terminal/theme.ts` を新トークンへ
3. `Badge` / `Chip` を dom テスト付きで置き、`Button` の variant 制限を `conventions.test.ts` に足す
4. 使用箇所の振り分け——モジュール単位（用語集 → エラーカタログ → シーケンス → ロジックツリー → 課題ツリー → コア部品）。**旧トークン名が0件になったら** conventions の検査4を有効化
5. 透過3箇所の除去、`tabular-nums`、No 列の右揃え
6. Skill・文書・history

## 検証

- 機械：`npm test && npx tsc -b && npm run lint`。Rust 側は触らない。**新しく落ちるべきもの**：`<Button>` の variant 無し／軸のチャネル違反／透過／色差不足／無彩色の逸脱／旧トークン名
- 実機（人間・27型 WQHD・ライト）。history に空のチェックリストとして写す:
  - [ ] 黄・赤・青・緑が周辺視野で別物に見える
  - [ ] 黄土色が「欠落」として読める（茶色に見えるなら決定1の第2候補へ）
  - [ ] 支持と棄却が、形でも明度でも分かれる
  - [ ] 緑帯を外したカラム名が見出しに見える
  - [ ] チップの選択が黒塗りなしで分かる
  - [ ] 用語集の未定義セルの破線・エラーセルの実線
  - [ ] シーケンスで行の帯が消え、セルだけが示される
  - [ ] 端末の選択面（`surface-muted`）が見える
  - [ ] 見送りの箱が「沈んで」見える

## スコープ外（A では扱わない）

UI ノートの分割:

| | 内容 | 対応 |
| --- | --- | --- |
| **A（本スペック）** | 色の規約 | D2, D9, D15, D16, D19, U2 |
| B | タイポグラフィ——16px 基準・行高・`--font-base` | D11, D12, D13 |
| C | 未定義表現の本体——「未定義」「別名なし」の捏造文字列の除去、ロジックツリーの空ノード警告、件数集計、U3 の規約文書 | D1, D14, D4 |
| D | レイアウト固定——行高固定＋省略、ノード幅固定 | D3 |
| E | フォント同梱（U1） | D6〜D8 |
| F | 見送り集計の2段構え、select 置換、角丸統一 | D17, §1.1 |

加えて A で触らないもの：ダークの値の吟味（置くだけ）／課題ツリーの行に「未判断」バッジを新設すること（いまはヘッダの集計チップだけ。行にも出すかは C）／U4（破線エッジの意味）は実装が既に答えを持つ（`IssueTreeEdges.tsx`：見送り箱の配下へ入る親子エッジ。D18 の「祖先からの導出」も `faint` の伝播として実装済み）ので、問いとしては閉じている。
