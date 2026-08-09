# M9・M10 設計スペック: リストエディタのコア化とエラーカタログ

作成日: 2026-08-09
位置づけ: **実装計画への入力。** 本書は「何をどこに置き、どう見せるか」の決定と理由を持つ。タスク分割と手順は各マイルストーンの実装計画が持つ（M9 は同日付の `2026-08-09-m9-core-list-editor.md`、M10 は着手時に M10 の worktree で書く）。

前提として読むもの:

- [`../../overview-rev.md`](../../overview-rev.md) — 5章（データモデル）・6章（モジュール規約）・8章（出力）・10章（操作言語）が本書の制約
- [`../../error-catalog/error-catalog-session-notes.md`](../../error-catalog/error-catalog-session-notes.md) — エラーカタログの仕様の出所。**本書は3箇所でこれを上書きする**（決定9・決定13・決定14）
- [`../../glossary/session-notes.md`](../../glossary/session-notes.md) — 引き上げ元の挙動がなぜそう決まったか
- [`../../open-issues.md`](../../open-issues.md)、[`../../lessons-for-planning.md`](../../lessons-for-planning.md)

---

## 1. 背景と目的

エラーカタログエディタを5つ目のモジュールとして追加する。着手前の調査で、「用語集の実装をほぼ使いまわせる」という見込みは**コアと額縁については正しく、エディタ本体については正しくない**ことが分かった。

### 使いまわせる（確認済み）

`src/core` と `src/components` に `glossary` のハードコードは1件も無い（残るのはコメントのみ）。app-controller・自動保存・履歴・外部変更検知・ファイル操作・キーマップ・単一性検証は無改修で使える。単一性はすでに `module.singleton` フラグとして一般化されており（`core/project-consistency.ts`）、エラーカタログはフラグを立てるだけでよい。

### 使いまわせない（本書が解く）

1. **列が9本、うち散文が7本。** 用語集が表として成立しているのは散文列が `definition` 1本だけで、それが残り幅を吸収する設計（`glossary/columns.ts`）だから。同じ形でエラーカタログを作ると1セル90pxの散文欄が7つ並ぶ
2. **出力2プロファイルに実装が追いついていない。** rev 6章はすでに「1つ以上の出力プロファイル」と書いているが、`ToolModule.toMarkdown` は単数の関数で、app-controller も App のボタン2つもプロファイルの概念を持たない
3. **共通の機械がモジュール内にある。** `cell-face.ts` / `columns.ts` / `stepField` と `GlossaryEditor.tsx` の行操作・フォーカス管理（約150行）は列構成に依存しない。2本目でコピーすると、3本目（ロジックツリー）で三重化する
4. **`npm run gen:types` が glossary 決め打ち。** 2本目のスキーマを足すと `pretest` / `prebuild` が型を吐かない

### マイルストーンを2本に割る

**M9 はエラーカタログのコードを1行も書かない。** コアを拡張し、用語集をその上に載せ替え、**既存テストが内容を変えずに緑であること**を完了条件とする。M10 でエラーカタログ本体を載せる。

割る理由は、エディタが壊れたときに「引き上げのバグか、新規コードのバグか」を切り分けられるようにするため。1本にまとめると変更が広く、回帰の原因を特定できない。

### 含まないもの

- **規約8（表記ゆれ検知の対象フィールドパス宣言）。** 検知エンジン自体がコアに無く、読み手のいない宣言は死んだコードになる。エンジンを作るときに、実際の利用者を見ながら宣言の形を決める
- **エラー登録 Skill（`.claude/skills/error-catalog-*`）。** rev 4章の通り Skill はアプリと並ぶ別成果物であり、用語集の Skill も M3 とは別に作られている
- **他ツールからの `error_` 参照**、**`occurrence` の導出**、**機能／領域による分類**。いずれも session-notes 3節でスコープ外と確定済み
- `GlossaryEditor.tsx` の JSX 分割。引き上げ後も約400行残るが、列の描画は列ごとに異なるので機械的には切り出せない。実害が出てから判断する

---

# 第 I 部: M9 — コアの拡張

## 2. リストエディタの共通機械

### 決定1: `src/core/list-editor/` に純関数3本とフック1本を置く

抽象の粒度は**純関数＋小さなフック1本**とする。`useListEditor` のような「列定義とフィルタを渡すと全部返す」フック1本への集約は採らない。引数が肥大し（`reorderEnabled` / `modalOpen` / `derivedView` / `deletableField` …）、実例2本目で決めるには早すぎる抽象になるため。このリポジトリの既存の作り（`list-ops` / `row-keys` / `column-resize` など小さな純機能の集まり）とも揃う。

| ファイル | 中身 | 出どころ |
| --- | --- | --- |
| `cell-face.ts` | `buildErrorMarks` / `hasError` / `cellFace` | `glossary/cell-face.ts` を**そのまま移動**。型引数を `GlossaryField` → `string` にするだけ。テストも移動 |
| `columns.ts` | `ColumnSpec<TField>`、`widthIndex(cols)`、`defaultWidths(cols)`、`nextWidthIndex(idx, i)` | `glossary/columns.ts` の定数を関数化 |
| `field-step.ts` | `stepField(order, field, direction)` | `glossary/fields.ts` から |
| `use-list-rows.ts` | 行操作とフォーカス予約のフック | `GlossaryEditor.tsx` の約150行 |

列データ（`COLUMNS`）とフィールド宣言（`FIELD_ORDER` / `FIELD_LABELS`）は**モジュールに残る**。コアへ行くのは、それらを受け取って動く機械だけ。

### 決定2: `useListRows` の口

```ts
useListRows<T>({
  items, onItemsChange,   // onItemsChange(next, mergeKey | null)
  makeItem,               // 新規行の雛形
  firstField,             // 挿入・削除後にフォーカスするフィールド名
  onEmptied,              // 0件になったときの通知
}) => {
  containerRef, addButtonRef, rowKeys,
  focusCell(rowKey, field, select?),
  insertAfter(index), deleteAt(index), moveBy(index, delta, field),
}
```

**「0件になったらフィルタを空へ戻す」をフックに入れない。** いまの `GlossaryEditor.tsx:157` の削除処理は、0件になったとき `setFilter(EMPTY_FILTER)` と `setFocusAddButton(true)` を行う。前者はエディタが持つ state であり、フックからは触れない。フィルタごとフックに預けると、フィルタを持たないツールが出た時点で引数が無意味に残る。**フックは「0件になった」とだけ知らせ、何をするかはエディタが決める。**

行鍵は `computeRowKeys`（`core/row-keys.ts`）を内部で使う。ID 重複ファイルを受け入れる以上、鍵は「ID＋出現順」でなければ行を一意に指せない——この不変条件はフックの内側に閉じ、各エディタが再実装しないようにする。

### 決定3: `core/duplicate.ts` を1本置く

```ts
findDuplicates<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, number[]>
```

**正規化規則はコアが決めず、呼び出し側が `keyOf` に入れる。** `duplicate-id` は正規化なしの完全一致（ID は機械的識別子）、`duplicate-name` と `duplicate-alias` は `normalizeForMatch` 経由——同じ関数から呼び分けられなければならない。コアが正規化を強制すると、ID 重複が NFKC 正規化の影響を受けるという意味不明な挙動になる。

用語集の `duplicate-id` / `duplicate-name` / `duplicate-alias` をこれで書き直す。**`ConsistencyIssue` のメッセージと `locations` は1バイトも変えない**（既存テストが固定している）。

> **session-notes 2-4 の記述との差異**: エラーカタログの session-notes は「name-to-name の重複検出は用語集側にも欠けているギャップ」と書いているが、**これは既に実装済み**である（`glossary/consistency.ts` の `duplicate-name`）。M9 がやるのは新規実装ではなく共通化。

## 3. モジュール規約5のプロファイル化

### 決定4: `ToolModule.toMarkdown` を `outputs` に置き換える

```ts
export interface OutputProfile<TData> {
  /** 安定識別子。UI の選択状態・テストが参照する */
  id: string
  /** ドロップダウンの表示名 */
  label: string
  /** 書き出しの既定ファイル名に足す接尾辞。単一プロファイルなら '' */
  fileSuffix: string
  /** 副作用を持たない純関数（rev 6章 規約5） */
  toMarkdown: (data: TData) => string
}

// ToolModule から toMarkdown を削除し、
outputs: readonly OutputProfile<TData>[]   // 1本以上
```

用語集は `[{ id: 'default', label: 'Markdown', fileSuffix: '', toMarkdown: glossaryToMarkdown }]`。

**`fileSuffix` を `label` から導出しない。** 表示名は画面の都合でいつでも変えたくなるが、書き出したファイル名は Git に成果物として残る側なので、別の軸として持つ。用語集は `''` なので**書き出し名は現状と1バイトも変わらない**。

### 決定5: app-controller はプロファイルの実体を受け取る

`copyMarkdown(profile)` / `exportMarkdown(profile)` とし、ID ではなくプロファイルそのものを渡す。ID 解決の失敗経路（`outputs.find(...)` が `undefined` を返す分岐）を作らないため。呼び出し元の App は `module.outputs` から選んで渡すので、実体を持っている。

`exportMarkdown` の既定ファイル名は `doc.path.replace(/\.json$/i, '') + profile.fileSuffix + '.md'`。

**既存の「保存ダイアログ中に対象が変わった」ガードに1条件足す。**

```ts
if (fresh === null || fresh.path !== doc.path || !fresh.module.outputs.includes(profile)) { 中断 }
```

ネイティブの保存ダイアログが開いている数秒〜数分の間に外部変更の取り込みが走ると、選択が別のファイル＝別のモジュールへ移りうる。そのとき手元のプロファイルは別モジュールのものであり、そのまま `profile.toMarkdown(fresh.data)` を呼ぶと**型の違うデータを別ツールの出力関数に食わせる**ことになる。既存のガードは `path` しか見ていないので、この1条件が要る。

### 決定6: 額縁のドロップダウンは2本以上のときだけ出す

`module.outputs.length === 1` のときは現在のボタン（「Markdown をコピー」「Markdown を書き出す」）をそのまま出す。**用語集の画面は M9 で1ピクセルも変わらない。**

2本以上のときだけ `components/ui/dropdown-menu.tsx`（shadcn／Radix）を追加してメニュー化する。`radix-ui` は既存依存なので**新規パッケージは増えない**（rev 7章「shadcn の適用範囲は額縁に限定」に合致する使い方）。キーボード操作は Radix の実装に委ねる。

## 4. 型生成

### 決定7: `gen:types` を走査型スクリプトにする

`package.json` の1行コマンドを `scripts/gen-types.mjs` に置き換える。`schemas/*.schema.json` を走査し、`src/types/<basename>.ts` を吐く。バナーコメントは共通（「手で編集しないこと」）。

**M9 の時点でエラーカタログのスキーマはまだ無い。** 走査型にしておけば、M10 はスキーマを1本置くだけで型が出る。決め打ちのまま M10 で足すと、`pretest` / `prebuild` / `predev` の3箇所を同時に直すことになり、片方だけ直すと「テストは通るがビルドで落ちる」になる。

## 5. M9 の完了条件

- **既存テストが「期待値を変えずに」緑。** 変えてよいのは次の2つだけで、**アサーションの期待値は1つも変えない**
  - 移動したファイルの import パス
  - 規約5の変更に伴う口の変更——フェイクモジュールの `toMarkdown: () => ''` → `outputs: [...]`（`app-controller.test.ts` / `file-ops.test.ts` / `load.test.ts` / `project-consistency.test.ts` / `registry.test.ts` の5本）と、`copyMarkdown()` / `exportMarkdown()` の呼び出しへの引数追加（`app-controller.test.ts` のみ）
- 用語集の画面と Markdown 出力バイト列が不変。`glossary/consistency.test.ts` と `GlossaryEditor.dom.test.tsx` は**1バイトも変えない**（引き上げが振る舞いを保っていることの証拠になる）
- 新規テスト: `use-list-rows`（挿入・削除・並び替え後のフォーカス移動、0件時の `onEmptied`）、`duplicate`、汎用化した `columns`、プロファイルの選択と `exportMarkdown` のモジュール不一致ガード
- `npm test && npx tsc -b && npm run lint` が緑

---

# 第 II 部: M10 — エラーカタログエディタ

## 6. データ形式

### 決定8: `schemas/error-catalog.schema.json`

エンベロープは `schemaVersion: 1` / `type: "errorCatalog"` / `title` / `errors[]`。ID は `^error_[A-Za-z0-9]{10}$`。全キー常在で、欠損ではなく空の値で「未記入」を表す（用語集から継承）。

| フィールド | 型 | 空 | 意図 |
| --- | --- | --- | --- |
| `id` | `string` | — | `error_` ＋ 10文字 |
| `name` | `string` (`minLength: 1`) | 不可 | エラー名。引くためのキー。表記ゆれ検知の照合対象 |
| `occurrence` | `string` | 可 | 発生タイミング。当面は手入力 |
| `resolutionLevel` | enum 5値 | — | 誰が解決するか |
| `causeForSupport` | `string` | 可 | 業務レベルの原因。サポート向け出力に載る |
| `causeForSpec` | `string` | 可 | 仕様レベルの原因。開発向け出力のみ |
| `userAction` | `string` | 可 | ユーザーが取るべき対応 |
| `supportAction` | `string` | 可 | サポート担当が取るべき対応 |
| `engineerAction` | `string` | 可 | エンジニアの介入内容 |
| `notes` | `string` | 可 | 備考。表記ゆれ検知の対象外 |

`resolutionLevel` の enum は `user` / `support` / `engineer` / `none` / `undecided`。`none`（検討した上で誰にも解決できない）と `undecided`（まだ決めていない）を型で分けるのは、用語集の `other` / `undecided` と同一構造である。

### 決定9: エントリのキーは `title` ではなく `name`

> **session-notes 2-2 を上書きする。**

session-notes はエラー名のフィールドを `title` と書いているが、**エンベロープにも `title` がある**。`data.title` と `entry.title` がコード上で1文字も違わず並ぶため、`markdown.ts` の見出し生成のように両方を扱う場所で取り違えても型が通る（どちらも `string`）。

用語集が `term.name` としているのに揃えて `name` にする。コアの `duplicate-name` および表記ゆれ検知の「正」側とも語彙が揃う。スキーマは一度出すと `schemaVersion` の改訂なしには変えられないため、実装前に決着させる。

### 決定10: `sortOrder` を持たず、表示 No は導出する

配列順が正。並べ替えは Alt+↑↓ で行い、それがそのまま正規の並びになる。派生表示（検索・フィルタ）中はリオーダーを無効化する（用語集で確定済みの挙動をそのまま流用）。

**表示 No はデータ配列の `index + 1` であり、絞り込み中も動かない。** 会議中に口頭で指すための目印なので、フィルタで番号が変わると用を成さない。用語集が `aria-label` に使っている `visiblePos + 1`（表示上の行番号）とは別物であり、混同しないこと。

## 7. プロファイル

### 決定11: 画面の列と出力の列を、1本の宣言から導く

`src/modules/error-catalog/profiles.ts` にプロファイルを置く。プロファイルが持つのは**フィールドの並び1本だけ**。

```
support.fields = [name, occurrence, resolutionLevel,
                  causeForSupport, userAction, supportAction, engineerAction]

dev.fields     = [name, occurrence, resolutionLevel,
                  causeForSupport, causeForSpec,
                  userAction, supportAction, engineerAction, notes]
```

ここから2つを導出する。

- **画面の列** = `No` ＋ `fields` そのまま（サポート向け8列／開発向け10列）
- **Markdown の列** = `No` ＋ `fields` から `resolutionLevel` を除いたもの（同7列／9列）

`resolutionLevel` が出力で列から消えるのは、**グルーピング軸が出力では h3 見出しになる**ため。リストを2本持つのではなく、この1つの導出規則で説明する。列セットの定義が2箇所にあると、片方だけ直したときに黙ってずれる。

`OutputProfile`（コアの契約）には `fields` を持たせない。列セットは画面の関心でもあるため、コアの出力契約に混ぜず、モジュール内の `profiles.ts` に閉じる。`module.ts` はここから `outputs` を組み立てる。

| id | label | fileSuffix |
| --- | --- | --- |
| `support` | サポート向け | `-サポート向け` |
| `dev` | 開発向け | `-開発向け` |

### 決定12: プロファイルの選択 UI はエディタのツールバー、出力はドロップダウン

表示の切り替えは検索欄・`resolutionLevel` フィルタと同じツールバーに置く。出力は額縁のドロップダウン（決定6）でその都度選ぶ。

画面をサポート向けにしたまま開発向けを出力できる代わりに、**「見えているものと違うものが出る」が起こり得る**。この非対称は承知の上で選んでいる。

## 8. 検証

### 決定13: レベル2（赤）は3本だけ

| ルール | 内容 |
| --- | --- |
| `duplicate-id` | `findDuplicates`（正規化なし完全一致） |
| `duplicate-name` | `findDuplicates` ＋ `normalizeForMatch` |
| `resolution-action-missing` | `user` / `support` / `engineer` を宣言しているのに、対応する Action が空 |

> **session-notes 2-4 の「`none` かつ全対応文が空：warning」を独立ルールにしない。**

各対応文の空文字はそもそも warning なので、`none` で3つとも空なら3セルとも黄色になる。意図はすでに表現されており、ルールを足すと同じ状態を二重に指摘することになる。

**warning は `ConsistencyIssue` ではなくセルの面である。** 用語集と同じ（`term.definition === ''` / `term.kind === 'undecided'` をエディタが直接見て `bg-warning/10` を塗る）。この区別を崩すと、issue 一覧が warning で埋まって赤の指摘が読めなくなる。

### 決定14: warning は `resolutionLevel` の宣言に連動させる

> **session-notes 2-4 の「各対応文・原因の空文字：warning」を狭める。**

| セル | warning になる条件 |
| --- | --- |
| `occurrence` | 空なら常に |
| `causeForSupport` / `causeForSpec` | 空なら常に |
| `userAction` / `supportAction` / `engineerAction` | 空、かつ `resolutionLevel` がそのレベルを宣言しているか `none` のとき |
| `resolutionLevel` | 値が `undecided` のとき |
| `notes` | ならない（検知対象外の自由メモ） |

ノート通りに「全 Action の空文字を常に warning」にすると、ほとんどのエラーは1レベルしか関与しないため、`user` レベルのエラー1件で `supportAction` と `engineerAction` が黄色くなる。**表の半分が常時黄色になり、警告としての信号が死ぬ。**

`none` のときだけ全 Action を warning にするのは、session-notes 2-3 の「復旧不可でも案内文は存在する」（作り直してください／この状態で進めて問題ありません）を守るため。誰も解決できないエラーこそ、サポートサイトで最も需要が高い。

原因2種と `occurrence` は `resolutionLevel` の宣言と無関係なので、空なら常に warning のままとする。

## 9. 出力

### 決定15: 用語集の Markdown 出力をそのままなぞる

- h1 不使用。h2 ＝ エンベロープ `title`、h3 ＝ `resolutionLevel` のラベル
- グループ順は **enum の定義順をスキーマから実行時に導出**（ハードコードすると enum 改訂で静かにずれる）。空のグループは見出しごと省略、グループ内はデータ配列順
- 空フィールドは `（未定義）`、`undecided` は「未分類」グループとして出す。**サポート向け出力でも省略しない**
- セルのエスケープは `\` → `|` → 改行 `<br>` の順（順序が逆だと自分が入れた `\` を二重エスケープする）。見出しの改行は空白へ潰す

`resolutionLevel` のラベル（`user` → 「ユーザー」等）は `resolution-labels.ts` に置く。用語集の `kind-labels.ts` と同じ形で、未知の値には生値を返す。

## 10. エディタ

### 決定16: 引き上げ済みの機械に乗せ、差分は3点だけにする

`useListRows` / `cellFace` / `stepField` / `columns` に乗る。用語集エディタとの構造上の差は次の3点のみ。

1. **プロファイルトグル**をツールバーに置く（検索欄・`resolutionLevel` フィルタと並べる）
2. **列幅 store をプロファイルごとに2本持つ。** 列数が変わるため1本では持てない（`createColumnWidthStore` を2回呼ぶ）
3. **幅を持たない列**（残り幅を吸収する列）を `causeForSupport` にする。用語集の `definition` に相当する位置

その他は用語集と揃える。検索対象は `notes` を除く全散文フィールド（用語集が `notes` を外したのと同じ判断）、新規行の既定名は「新しいエラー」、空欄 Backspace で行を消せるのは**エラー名セルのみ**（他のセルは空が常態なので、そこで消えると事故になる）。

### 決定17: `CellInput` の行数上限を5から8に上げる

サポート向け8列を 1440px の窓（サイドバー 256px を引いて実効 1150px 前後）で見ると、No・エラー名・タイミング・レベルに約 480px、残り 670px を原因＋対応3種の4列で分けるので1列 170px 前後になる。日本語で1行11文字、5行で55文字が上限となり、対応文の多くが内部スクロールに落ちる。

上限を8行にすると 88 文字まで表示できる。行の高さが揃わなくなるが、読めないよりよい。**これは全モジュール共通の `CellInput` への変更なので、用語集の定義・備考セルも8行まで伸びる。** M8 の「5行上限が初回マウントの強制リフローのコストの頭を押さえている」という判断（`open-issues.md` の性能の項）に影響するため、M10 の実機確認で体感を見ること。

### 決定18: 額縁は無改修

`FileList` の新規作成メニューは `appRegistry.list()` 由来なので、登録すれば「エラーカタログ」が自動で出る。単一性違反の検出も `module.singleton` を見るだけなので自動で効く。

`App.tsx` の空状態にある「用語集を作る」ボタンは**用語集専用のまま残す**。エラーカタログ版を足さない理由は、`open-issues.md` に記録済みの `ensureFileOfType` とインライン登録の競合（`rescan()` が二択と競合する）に、呼び出し口を増やすと近づくため。新規作成はサイドバーのメニューから行う。

## 11. M10 の完了条件

- スキーマ検証・整合性検証・Markdown 出力・エディタ操作の単体テストと DOM テスト
- 用語集の既存テストが緑のまま（レジストリ登録1行以外は触らない）
- `npm test && npx tsc -b && npm run lint` が緑
- 実機確認: 新規作成 → 10行程度の入力 → プロファイル切り替え → 2種の書き出し → 単一性違反の表示 → 外部変更の取り込み

---

## 12. rev への反映（M9 完了時）

- 6章 規約5: `outputs`（`OutputProfile` の配列）として実装が確定したことを追記
- 6章: 引き上げた共通機械（`core/list-editor/`）の存在と、「モジュールが持つのは列データとフィールド宣言、コアが持つのはそれを動かす機械」という分界を追記

## 13. `open-issues.md` への追記

- **規約8（表記ゆれ検知の対象フィールドパス宣言）が `ToolModule` に無い。** 検知エンジン自体もコアに無い。エンジンを作る時点で両方を足す `[M9]`
- **エラー登録 Skill が無い。** 用語集には `glossary-term-register` があるが、エラーカタログには対応物が無い `[M10]`
- **`CellInput` の行数上限を8にした影響。** 初回マウントの強制リフローのコストが行数に比例する（`open-issues.md` 性能の項）。実機で体感が出たら差分計算へ `[M10]`
