# M8 設計スペック: 用語集エディタの見た目と操作性

作成日: 2026-08-09
位置づけ: **実装計画への入力。** 本書は「何をどう見せ、どう操作させるか」の決定と理由を持つ。タスク分割と手順は同日付の実装計画（`2026-08-09-m8-glossary-appearance.md`）が持つ。

前提として読むもの:

- [`../../overview-rev.md`](../../overview-rev.md) — 9章（デザインシステム）・10章（操作言語）が本書の制約
- [`../../history/m7-core-design-tokens.md`](../../history/m7-core-design-tokens.md) — M8 へ送られた9件の要望の出所
- [`../../open-issues.md`](../../open-issues.md) — 本書がつぶす13件の出所
- [`../../lessons-for-planning.md`](../../lessons-for-planning.md) — 計画立案の教訓
- [`2026-08-09-m7-design-tokens-design.md`](2026-08-09-m7-design-tokens-design.md) — 役割トークンの確定内容

---

## 1. 背景と目的

M7 は役割トークンの**値**を確定させたが、「どこに何を塗るか」はスコープ外だった。実機確認で出た UI 改善の要望9件はそこに落ち、M8 のマイルストーンとして切り出された。

**M8 でいったん用語集の開発を終える。** したがって本書は見た目と操作性に加えて、`open-issues.md` に記録済みの残件のうち、

- 用語集モジュールと M8 で触るファイルに閉じるもの（8件）
- 用語集を実運用に投入する上で障害になる小さなコアの穴（5件）

を決着させる。**残件の決着は「直す」だけではない。** 記録自体が「他ツールと同じ挙動でもある」と書いているものは、仕様として確定して `open-issues.md` から消すのが正しい決着である。

### 含むもの

M7 の要望9件、上記の残件13件、および要望から派生する rev への反映。

### 含まないもの

- **コアのテスト欠落5件**（`app-controller` の interleaving 3分岐、`currentDocument()` の未選択分岐、`FLUSH_MAX_ROUNDS`、`fileExists`、`ChoiceDialog` のオーバーレイクリック）。記録自身が「この層に触るときの宿題」と書いており、M8 は `app-controller` の判断ロジックを触らない
- **`ensureFileOfType` とインライン登録の競合**。インライン登録は `glossary/scope.md` の「今回作らないもの」であり、呼び出し側が無いと修正を検証できない
- **`resolveCommand` の macOS 非対称**。macOS で検証できないため、直しても「直したつもり」になる
- **P型・D型色覚での `warning` / `ok` の識別性**。M7 が世界観を優先して候補Bを採った意図的な判断（M7 申し送り「`ok` の色相選定」）。ドッグフーディング後に再検討する
- **`ok` がどのコンポーネントからも参照されていない**。成功トーストなど「確定・応答」を色で示す箇所を作った時点で使う
- **1打鍵ごとの全ファイル `checkConsistency`**。差分計算への変更は `project-consistency` の構造変更であり、記録自身が「数百レコード規模では問題ない」と書いている。M8 の実機確認で体感を見てから判断する
- **列幅の次回起動への永続化**、名称・別名の複数行化

---

## 2. テーブルの骨格

### 決定1: `table-fixed` ＋ `<colgroup>` にする

いまは `table-auto` に `<th className="w-40">` で幅を暗示しているだけなので、長文が入ると列が押し広げられる。折り返し（決定4）も列幅ドラッグ（決定7〜10）も**指定した幅が守られること**が前提なので、骨格を先に変える。

既定幅は 名称 176 / 種別 128 / **定義＝幅を持たない** / 別名 176 / 備考 256。備考を `w-44`（176）から 256 へ広げるのが要望7。

**定義列だけ幅を持たないのが要点である。** 他4列が px を持ち、定義が残りを埋めるので、テーブルは常に親幅にぴったり収まり横スクロールが出ない。「定義を広げたい」は他を狭めることで達成される。

### 決定2: 外枠は `rule`、内側は `grid`

テーブルを `overflow-hidden` ＋ `rounded-md` ＋ `border-rule` ＋ `bg-surface` の div で包む（要望1）。`border-collapse` のままでも、包む側の `overflow-hidden` が角を切る。

| 場所 | いま | M8 |
| --- | --- | --- |
| 外枠 | 無し | `border-rule` |
| ヘッダ行 | 指定なし・`font-normal`・`text-ink-muted` | `bg-canvas` ＋ `font-bold text-ink`（要望2・3） |
| ヘッダ下端 | `border-b border-rule` | `border-rule` のまま |
| 行の下線 | `border-rule` | `border-grid` |
| 列の境界 | 無し | `border-grid` の縦罫 |

外枠が `rule`（情報を伝える非テキスト要素。3:1 が要る）、内側が `grid`（装飾）という階層になり、M7 が2トークンに分けた理由がそのまま効く。**縦罫は列幅ハンドルの位置を示す役割も兼ねる**——掴む場所が見えないと、ドラッグできること自体に気づけない。

### 決定3: 縦位置を `align-middle` にする

`GlossaryEditor.tsx:313` の `align-top` を `align-middle` へ（要望5）。定義が複数行に伸びたとき、名称・種別セルが縦中央に来て収まる。**要望5と6は連動する**（M7 申し送りの指摘どおり）。

---

## 3. 折り返しと改行

### 決定4: `CellInput` に `multiline` を足す。適用は定義と備考の2列だけ

`CellInput` は `<input>` なので折り返せない。`multiline?: boolean` を足し、true のとき `<textarea>` を描く。

**名称・別名は1行のまま**にする。全列を textarea にすると高さ計算（決定5）が行数ぶん増えるうえ、名称に改行が入ると Markdown の表と見出しの両方が壊れる。`<input>` はブラウザ既定で改行を含むペーストから改行を除去するので、この非対称は構造的に守られる。

付随して必要な修正:

- `focusCell`（`:69`）の `el instanceof HTMLInputElement` に textarea を通す（`select()` は両方が持つ）
- `onFieldKeyDown` の型を `HTMLInputElement | HTMLTextAreaElement` へ広げる
- `caretAtStart` / `caretAtEnd` は**変更不要**。`selectionStart === 0` は全体の先頭を指すので、折り返しの途中では `resolveCommand` が `null` を返し、ブラウザ既定の行内キャレット移動が生きる

### 決定5: 高さは `rows` で計算し、5行で止める

value が変わったら `useLayoutEffect` で `rows=1` に戻し、`scrollHeight` を `line-height` で割って行数を出し、`Math.min(n, 5)` を `rows` に入れる。5行超は `overflow-y-auto` でセル内スクロール。

ピクセルの `max-height` を書かずに済み、フォントサイズや行間（M7 が確定した `1.65`）を変えても自動追従する。

**CSS の `field-sizing: content` は採らない。** WebKit が未対応で、macOS では1行に潰れる。rev 7章は配布形態を Windows のデスクトップアプリと定めているが、Tauri なので macOS で動く可能性は残っており（`glossary/scope.md` の M3 の記述と同じ理由）、環境で見た目が割れる選択はしない。

### 決定6: 改行は Shift+Enter / Alt+Enter で打てる

**Enter＝行追加、Shift+Enter・Alt+Enter＝セル内改行。**

`keymap.ts:79` は `Enter` について `e.altKey || e.shiftKey ? null : 'insert-item-after'` を返す。`null` は「アプリは関与しない、既定動作を止めない」の意味なので、**textarea にした時点で修飾キー付き Enter は何もしなくても改行になる。** ブロックする方が余計なコードを書く側である。

安全性は端まで通っている:

- `markdown.ts:34` が改行を `<br>` に畳むので、貼った先で表が割れない
- JSON では `"\n"` にエスケープされ、Skill 側の `glossary-write.mjs` も `JSON.stringify` なので**正規形のバイト一致は崩れない**
- IME 変換確定の Enter は `resolveCommand` 冒頭の `isComposing` で弾かれる

rev 10章の拡張規則（「グローバル層および自ファミリーの標準キーと衝突する再定義は禁止」）にも触れない。Shift+Enter は現状どのコマンドにも割り当てられていない。Enter が確定、Shift+Enter が改行という関係は Notion・Slack と同じ流儀であり、Alt+Enter は Excel のセル内改行の手癖に当たる。

これに伴い `markdown.ts:25` のコメント「**UI の入力欄は1行だが**、外部（Skill・エディタ）が複数行の定義を書きうる」が事実でなくなるので直す。

---

## 4. 列幅（要望4。9件で唯一の機能追加）

### 決定7: 状態は core の factory で作った module-scope store に置く

要件は「アプリを閉じるまで、ファイル切替をまたいで保持」。`App.tsx:381` が `<selectedModule.Editor key={selected.path} />` とファイルパスで key を付けているため、エディタ内の state ではファイル切替で消える。

**App に持ち上げて `EditorProps` で渡すのは採らない。** 額縁（コア）が用語集の列構成を知ることになり、汎用化すると `Record<string, unknown>` のような型のない口が生える。rev 6章のモジュール境界を溶かす。

採るのは、**core に store の factory を置き、各ツールがモジュールスコープで1個インスタンスを持つ**形:

```
src/core/column-resize.ts        createColumnWidthStore(defaultWidths)
src/modules/glossary/column-widths.ts
    export const columnWidths = createColumnWidthStore([176, 128, 176, 256])
```

**この配列は固定幅を持つ4列だけを、列の並び順で持つ**（名称・種別・別名・備考）。幅を持たない定義列は 3 番目に描かれるが配列には現れないので、配列の添字と `FIELD_ORDER` の添字は一致しない。対応表を `column-widths.ts` に1つ置き、エディタ側で添字を計算しない。

読み出しは `useSyncExternalStore`。エディタが remount されても値が残り、App は何も知らず、「アプリを閉じるまで」という寿命がモジュールの生存期間とちょうど一致するので、永続化先やキー命名の設計判断を持ち込まずに済む。

**factory にする理由は2本目のツールである。** 用語集の中に store を直接書くと、状態遷移エディタが同じものを書き直すことになり、rev 10章が禁じる「ツールごとの自前実装」を自分で作る。factory 側で **`getSnapshot` が同一参照を返すこと**（毎回新しい配列を返すと `useSyncExternalStore` が無限ループする）も担保されるので、2本目の実装者がここを踏まない。

増える側について確定させておく3点:

- **列幅を要するのは表系ツールだけ。** rev 10章はロジックツリーとシーケンスをキャンバスと定めているので、増えるのは状態遷移の遷移表1本
- **rev 6章のモジュール規約6点セットに列幅は加えない。** 列幅はエディタコンポーネントの内部実装であって、コアがモジュールから引く契約ではない。規約を7点に増やすとキャンバス系ツールが空の実装を持たされる
- **幅は「type ごとに1つ」で持つ。**「ファイルごと」ではない。同じ列構成なら幅も揃っている方が自然で、ファイル単位にすると「どのファイルで広げたか」を覚えていられない

欠点はグローバル可変状態がテスト間で漏れること。**`reset()` を factory が返し、テストの `beforeEach` で呼ぶ。** ツールが増えて複数呼ぶのが面倒になったら core 側に一括リセットを足す、という順序にする（いま作ると「モジュールを import しないと登録されない」順序依存を先に抱え込む）。

### 決定8: マウス処理は core に一元化し、純関数とフックを分ける

rev 10章の実装規約は「キーボード・マウス処理は共通フック／モジュールに一元化し、全ツールがそれを使う。ツールごとのハンドラ自前実装を禁止」と定める。`src/core/keyboard/` はあるがマウス側は未整備なので、ここで作る。

```
resizeColumns({ widths, index, delta, minWidth, available, flexMinWidth }) → number[]
```

純関数側の仕事は「固定列の合計が `available − flexMinWidth` を超えないようにクランプする」——定義列が潰れる操作を止めること。期待値が完全に決定的で、`lessons-for-planning.md` が「テストを書く価値が特に高い」とする類に当たる。

フック側（`useColumnResize`）は `getHandleProps(index)` を返し、用語集は配線を書かない。ポインタ処理は `pointerdown` で `setPointerCapture` を取る形にする——window にリスナーを張り替えなくて済み、ドラッグ中にカーソルがテーブル外へ出ても追従し、`pointercancel` で後始末が入る。

### 決定9: ハンドルの仕様

- 固定幅を持つのは**名称・種別・別名・備考の4列**。ハンドルも4本
- 掴み代は `<th>` を `relative` にした右端に幅6pxの絶対配置。`cursor-col-resize`、hover で `bg-rule`
- 各列の最小 88px、定義列の最小 200px
- 利用可能幅は `pointerdown` の時点で親の `clientWidth` を1度読めば足りる（ドラッグ中に窓は変わらない）。窓を狭めて固定列合計が親を超えた場合は、包む div の `overflow-x-auto` が横スクロールで受ける
- **ダブルクリックで既定幅に戻す**

### 決定10: キーボードからも動かせるようにする

**これは要望4に含まれない追加である。** ハンドルは `role="separator"` `aria-orientation="vertical"` `aria-label="名称の列幅を変更"` を持ち、`tabIndex={0}` で Tab 順に入れ、←→ で16px刻み、Home で既定に戻す。

10行程度のコストで、既存コードが `aria-label` を丁寧に付けている水準に揃う。**副次的に、幅の反映を jsdom で検証できる唯一の経路になる**（8節「書けないテストと、その理由」）。

Tab 順にハンドル4つが増えるが、テーブルに外から入るときに通過するだけである。セル内の Tab は用語集がセル間移動として `preventDefault` するので、編集中にヘッダへ戻ることはない。

---

## 5. 色の確定

### 決定11: 半透明の重ね合わせを機械検証の対象に入れる

`open-issues.md` は「`palette.test.ts` は不透明トークンのみを検証しており、半透明の重ね合わせは対象外。実測すると『（未定義）』プレースホルダが約 2.8:1 で本文基準 4.5:1 を下回る」と記録している。**濃さを決める前にここを塞ぐ。**

`src/styles/contrast.ts` にアルファ合成を足す。CSS の単純合成は sRGB 空間で `fg × a + bg × (1 − a)`。`palette.test.ts` に用語集が実際に使う重ね合わせを並べる。テーブルの面が `surface` になる（決定2）ので、背景は `surface` 側で見る:

- `text-ink` on（`bg-warning/25` over `surface`）— エラーセルの名称・別名
- `text-warning` on（`bg-warning/25` over `surface`）
- `text-ink` on（`bg-warning/10` over `surface`）— 未定義・未分類セルの本文
- プレースホルダ「未定義」

### 決定12: プレースホルダの `/70` を外す

`GlossaryEditor.tsx:369` の `placeholder:text-warning/70` の70%に設計上の意味はなく、薄めているだけである。外して `text-warning` の不透明にする。

### 決定13: `errorCell` / `warnCell` の濃さはテストが駆動して決める

**具体値は実装時に決める。** 判断基準:

- `error > warn` の強度差を保つ
- 両方で `ink` と `warning` の両方が 4.5:1 を確保する
- M7 の教訓（「閾値ちょうどの値を置かない」）に従い、要件より3%以上の余裕を取る
- **濃さで両立できない場合は、error 側を面ではなくセル左端の縦帯に切り替える。** 波線下線は表記ゆれの「指摘（suggestion）」用に予約されている（session-notes 論点5、rev 9章）が、縦帯は予約されていない

あわせて `GlossaryEditor.tsx:26-31` のコメント「濃さの値は仮置きで、確定は M7」を直す（M7 では決まらなかった）。

### 決定14: 「未分類」の種別セレクトに warning を纏わせる

`<td>` には `bg-warning/10` が付くのに `<select>` が素のままなのは、ネイティブ select がブラウザ既定の背景を持ち `bg-transparent` を無視するため。`appearance-none` を当てて透かす。

矢印は消えるので自前で描くが、**背景画像の data URI は使わない**——色値を書くことになり `conventions.test.ts` が弾く。SVG 要素を右端に絶対配置し、`text-ink-muted` で色を取る。

---

## 6. 全体の地

### 決定15: 方眼紙背景を敷き、canvas と surface の差を模様で付ける

方眼紙背景は rev 9章の確定要素でありながら未実装で、「ライトで `canvas` と `surface` の L 差が 0.04（1.13:1）しかない」という残件と原因が同じなので、まとめて解く。**トークンの値は一切動かさない**（M7 の確定を尊重する）。

`src/index.css` に `var(--grid)` の `repeating-linear-gradient` 2本でユーティリティを定義する。マス目は 24px——`text-sm` の行高（14px × 1.65 ＝ 23.1px）とほぼ一致するので、方眼と文字行が揃って見える。

マス目のサイズは `index.css` 側に置く。`palette.css` の冒頭が「半径・余白・フォント・行間を書かないこと」と明記しているため。**`conventions.test.ts` は `.tsx?` だけを走査し CSS を対象外としているので、この定義は検査に触れない**（M7 の Task 5 が踏んだ「計画自身が機械検査と衝突する」形になっていないことを確認済み）。

| 領域 | いま | M8 |
| --- | --- | --- |
| `main` 全面 | `bg-canvas` | `bg-canvas` ＋ 方眼紙 |
| `header` | 透過 | `bg-surface`（方眼の上に文字が乗ると読みにくい） |
| `aside`（ファイル一覧） | 透過 | `bg-surface` |
| `section`（編集領域）の地 | 透過 | 方眼紙が見える |
| 用語テーブル | 透過 | `bg-surface` の面（決定2） |

「地は方眼、作業する面は無地」という関係になり、L 差に頼らずに canvas と surface が見分けられる。グリッドは装飾なのでコントラスト要件の対象外（rev 9章の定義どおり）。

### 決定16: ヘッダの塗りボタンを1つにする

`App.tsx:290-302` のヘッダのボタン5つが全部 shadcn の既定 variant（`--primary` ＝ `--ink`）で、ダークでは `ink` が `oklch(0.85)` なのでほぼ白い面が5つ並ぶ。

**「フォルダを開く」だけ既定のまま残し、残り4つを `variant="outline"` にする。** 白い面が1つなら主要導線への視線誘導として正しく機能する。

`src/components/ui/button.tsx` は shadcn の生成物なので触らない（rev 7章「手で整形しない」、`conventions.test.ts` の除外対象）。App.tsx で variant を渡すだけ。

### 決定17: 左メニュー（要望8・9）

- **削除ボタンの高さ**（要望8）: `FileList.tsx:61` の `flex items-start` が原因。`items-stretch` にし、削除ボタンの `py-2` を外して `flex items-center` にする
- **境界線**（要望9）: `<li>` に `border-b border-grid`
- **選択状態**: サイドバーが `bg-surface` になるので、選択行の `bg-surface`（`:66`）が見えなくなる。選択行は `bg-canvas`（地の色でへこんで見える）＋ 左端に `border-l-2 border-ink`、hover は `bg-canvas` のみ（帯なし）にする

`grid` を「方眼紙の線」から「方眼紙の線と薄い区切り罫」へ意味を広げるので、rev 9章の記述を広げる（9節）。

---

## 7. つぶす残件13件

### 用語集モジュールと M8 で触るファイル（8件）

| # | 残件 | 決着 |
| --- | --- | --- |
| 1 | `### ${kindLabel(kind)}` がエスケープを通らない（`markdown.ts`） | `heading()` を通す。`kindLabel` は未知の値に生値を返す（`kind-labels.ts:20`）ので、enum 拡張時に改行入りの見出しが出る経路。スキーマ検証を経ない直接呼び出しでテストできる |
| 2 | 定義セル・種別セルが `mark(index, field)` を参照していない（`GlossaryEditor.tsx`） | `mark()` を参照させる。既存の `warnCell` 判定と合成する必要があり、**error が warn に優先する** |
| 3 | `CellInput` の `caretAtStart`/`caretAtEnd` が collapsed なキャレットのみ true | **仕様として確定し `open-issues.md` から消す。** 記録自身が「Excel 等と同じ挙動でもある」と書いている。根拠をコードのコメントに残す |
| 4 | `FileList` の行ボタンのアクセシブル名が「`<名前>` を開く」で固定 | `aria-describedby` で `title`・「開けない」「編集不可」・issue 件数バッジを読ませる |
| 5 | `@testing-library/user-event` が未使用 | M8 は `CellInput` のキャレット・選択範囲を要するテストを書くので、**使うか外すかを実装時に決着させる**（テストを書いてみて必要かが決まる） |
| 6 | `ConfirmDialog.dom.test.tsx` が見出しを `getByText` で引いている | `getByRole('heading')` にする |
| 7 | `closeCurrentFile` のコメントから由来（`history/m2-*.md` の「`saveError` のクリア条件」）への参照が落ちた／`deleteFile` と `trashFile` の JSDoc 重複 | 参照を復元し、重複した説明は片方に寄せる |
| 8 | `tsconfig.test.json` が説明を `"//"` キーで書いている | `extends` 元の `tsconfig.app.json` に揃えて JSONC コメントにする |

### 小さなコアの穴（5件）

| # | 残件 | 決着 |
| --- | --- | --- |
| 9 | `move_to_trash` が同期コマンドなので削除中にウィンドウが固まる（`src-tauri/src/lib.rs`） | `async fn` にする。`trash` クレートは呼び出しごとに自前で COM を初期化するのでワーカースレッドで問題ない（記録済み） |
| 10 | `exportMarkdown` が保存ダイアログ中のデータ変化を拾わない（`app-controller.ts`） | ダイアログから戻った後に編集中データを読み直す。**あわせて選択が変わっていないことを確認する**（`ask` 分岐と同じ形のガード） |
| 11 | `dropModal` の対象に `delete:<path>` が入っていない（`app-controller.ts`） | 対象に足す。外部でファイルが消えた後に古い削除確認を確定すると `trashFile` が失敗する |
| 12 | 選択中でないファイルが外部変更でスキーマ違反になっても「外部の変更を読み込みました」と出る | メッセージを出し分ける |
| 13 | `file-naming.ts` の `ILLEGAL` が Windows 予約デバイス名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）と末尾のドット・空白を弾かない | 弾く。現状 `module.displayName` しか渡らず実害は無いが、修正もテストも小さく、先回りできる |

---

## 8. テストと検証

### 書くテスト

| 対象 | 内容 |
| --- | --- |
| `resizeColumns`（純関数） | 最小幅でのクランプ、定義列の最小幅を割る操作の停止、既定へのリセット |
| `createColumnWidthStore` | `getSnapshot` が同一参照を返すこと、`set` / `reset` / 購読通知 |
| `contrast.ts` のアルファ合成 | 既知の値で検算（黒を50%で白に重ねると中間灰） |
| `palette.test.ts` | 決定11の重ね合わせ4種。**ここが決定13の濃さの確定を駆動する** |
| `CellInput.dom.test.tsx` | Shift+Enter で改行が入り、Enter では入らずに行が追加されること。IME 変換中の Enter が multiline 側でも誤爆しないこと |
| `GlossaryEditor.dom.test.tsx` | 列幅ハンドルを ←→ で操作すると幅が変わること |
| `markdown.test.ts` | 改行を含む未知の `kind` が見出しを割らないこと（残件1） |
| `file-naming.test.ts` | 予約デバイス名と末尾のドット・空白（残件13） |

既存の DOM テストは `className` や DOM 構造を一切引いていない（`lessons-for-planning.md` の「role とアクセシブル名で引き、レイアウトやクラス名に依存させない」が守られている）。**見た目の変更で既存テストは壊れない。** `<input>` → `<textarea>` も `getByLabelText` / `getByRole('textbox')` がどちらも拾う。

### 書けないテストと、その理由

`lessons-for-planning.md` は「書かない判断をしたら、なぜ書けないかを記録する」「症状を取り違えたテストは、無いテストより危険」と定めている。

- **5行上限（決定5）は jsdom で検証できない。** 高さの計算が `scrollHeight` と `getComputedStyle` の `line-height` に依存し、jsdom はレイアウトを持たないので `scrollHeight` が常に 0 になる。実機確認に回す
- **ドラッグそのもの（決定8）も jsdom で検証できない**（`setPointerCapture` が未実装）。ただし幅が反映される経路は決定10のキーボード操作テストが通るので、担保されないのは「ポインタイベントの配線」だけである

### 実機確認（人間の作業。サブエージェントは GUI を操作できない）

1. ライト・ダーク両モードで方眼紙の濃度がうるさくないか。会議での投影を想定して見る
2. 列幅ハンドルを掴めるか、カーソルが変わるか、ダブルクリックで戻るか
3. 5行を超える定義でセル内スクロールになるか（jsdom で測れない分）
4. Shift+Enter / Alt+Enter でセル内改行が入り、Enter では行が増えること。**IME で変換確定した直後の Enter が誤爆しないこと**
5. **行の密度**（`py-1` のままでよいか）。rev 11章が残している検証項目なので、ここで決めて rev を更新する
6. 未分類セレクトが warn 色を纏っているか。ダークのヘッダのボタンが白く浮いていないか
7. 削除中にウィンドウが固まらないこと（残件9）

---

## 9. rev への反映（M8 の完了コミットで済ませ、TODO として申し送りに残さない）

- **9章**: `grid` の意味を「方眼紙の線」から「方眼紙の線と薄い区切り罫」へ広げる／方眼紙背景を実装済みとして記述する／エラー・警告セルの濃さの確定と、「表記ゆれの『指摘（suggestion）』は warning 系統の弱い表現で表す。具体はトークン確定時に詰める」の決着を書く／半透明の重ね合わせを機械検証の対象に入れたこと（`open-issues.md` の当該項の削除とセット）
- **10章**: 「適用例」の段落（用語集の Tab＝セル間移動）に並べて、Shift+Enter・Alt+Enter＝セル内改行をツール固有キーとして明記する
- **11章**: テーブルの行間の密度を実機確認で決めたら、残る検証項目から外す

## 10. `open-issues.md` の更新

- **消す**: 本書7節の13件、決定11〜17が解消する デザインの残件6件（方眼紙背景、canvas/surface、ダークの primary、未分類セレクト、セルの不透明度、半透明の未検証）
- **足す**: textarea の高さ計算による初回マウント時の強制リフロー（定義＋備考 × 行数。5行上限が計算量の頭を押さえるが、数百行では体感しうる）

---

## 11. 実装時に決めること（本書では決めない）

- `errorCell` / `warnCell` の具体的な濃さ（決定13の基準に従い、`palette.test.ts` が通る値）
- 行の密度（`py-1` のままか。実機確認5で決める）
- `@testing-library/user-event` を使うか外すか（残件5）
