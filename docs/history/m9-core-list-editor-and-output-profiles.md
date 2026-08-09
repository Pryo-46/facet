# M9 申し送り: リストエディタのコア化と出力プロファイル

> **追記専用。** そのとき何が起きたかの記録であり、以後変えない。**いま開いている残件は [`../open-issues.md`](../open-issues.md) を見ること**——本書に書かれた残件は当時の状態を指す。

M9 は計画9タスク（実装8本、本ドキュメント）を完了した。目的は2つ：（1）用語集エディタに実装済みの「列を持つリストエディタ」の機械（重複検出・セルの面判定・列幅添字・Tabのセル移動・行操作とフォーカス予約）を `src/core/` へ引き上げ、M10 で作る2本目の実例（エラーカタログ）が土台を再実装せずに済む形にする、（2）モジュール規約5（出力）を単一の `toMarkdown` から複数プロファイル対応の `outputs` へ拡張する。設計判断の全体は `docs/superpowers/plans/2026-08-09-m9-m10-error-catalog-design.md` 第 I 部（決定1〜7）にあり、本書はそこから**実装・レビューで新たに確定した事実だけ**を拾う。

## 引き上げた5つと、用語集側に残したもの

Task 1〜5 は同じ形の手順（コアへ実装→委譲に載せ替え→用語集の既存テストが1バイトも変わらず通ることを確認）を5回繰り返した。**「コアは汎用、モジュールは薄い委譲」**が徹底されたことは、`git diff --stat origin/main` で `consistency.test.ts` / `columns.test.ts` / `fields.test.ts` / `GlossaryEditor.dom.test.tsx` の4本が最後まで無変更のままだったことで裏付けられている（Task 9 Step 1 で再確認済み）。

| コアへ引き上げたもの | 置き場所 | 用語集側に残したもの |
| --- | --- | --- |
| 重複検出 | `src/core/duplicate.ts`（`groupByKey` / `findDuplicates`） | `keyOf` に正規化規則（`normalizeForMatch` の有無）を渡す呼び出しだけ。ID重複はNFKC正規化の影響を受けず、名称・別名は受ける、という違いはコアではなく呼び出し側の`keyOf`に閉じる |
| セルの面の判定 | `src/core/list-editor/cell-face.ts`（`cellFace` の第3引数は `GlossaryField` → `string` に一般化） | なし（`GlossaryEditor.tsx` の import 元を変えるだけ） |
| 列の添字写像 | `src/core/list-editor/columns.ts`（`widthIndex` / `defaultWidths` / 2引数の `nextWidthIndex`） | **列データ（`COLUMNS`）**と、`WIDTH_INDEX` / `DEFAULT_WIDTHS` をコア関数から導出する2行。`nextWidthIndex(i)` は**1引数のまま**維持し、内部で `WIDTH_INDEX` を束ねてコア版の2引数版に委譲する薄いラッパーとして残した |
| Tabのセル移動 | `src/core/list-editor/field-step.ts`（`FieldStep<TField>` / 3引数の `stepField`） | **フィールド宣言（`FIELD_ORDER` / `GlossaryField` / `FIELD_LABELS`）**。`stepField(field, direction)` は**2引数のまま**維持し、`FIELD_ORDER` を束ねてコア版の3引数版に委譲する |
| 行操作とフォーカス予約 | `src/core/list-editor/use-list-rows.ts`（`useListRows` フック。`cellId` / `focusIn` を含む） | `useListRows<Term>({ items, onItemsChange, makeItem, firstField: 'name', onEmptied })` の1呼び出し。`containerRef` / `pendingFocus` state / `addButtonRef` / `focusAddButton` state と2本の `useEffect`、モジュール直下の `focusCell` 関数はすべてフックの内側に吸収され、`GlossaryEditor.tsx` からは消えた |

**1引数に束ねた `nextWidthIndex` と `stepField` が、このアプローチの要点である。** コア版は汎用性のために「テーブル（`WIDTH_INDEX`）」や「順序（`FIELD_ORDER`）」を引数で受け取るが、用語集は自分のテーブル・順序が1つに決まっているので、呼び出し側の引数を1つ減らすだけの薄いラッパーを残す。これにより `GlossaryEditor.tsx` の呼び出し箇所（`nextWidthIndex(i)` / `stepField(field, direction)`）は**1文字も変える必要がなかった**。

抽象の粒度は設計スペック決定1が指定した通り「純関数3本＋フック1本」に収め、「列定義を渡すと全部返す」1本の万能フックには集約しなかった。実例が用語集の1本だけの段階でその抽象を作ると、M10（エラーカタログ）が実際に必要とする形と一致する保証がなく、後から間違った抽象を剥がす方が高くつく。

## `onEmptied` を外に出した判断

設計スペック決定2は「0件になったらフィルタを空へ戻す」をフックに入れないと定めていた。実装（Task 5）はこれを`useListRows`の`onEmptied`コールバック引数として外出しし、`GlossaryEditor.tsx`側で`() => setFilter(EMPTY_FILTER)`を渡す形にした。

理由：0件になったときの挙動（フィルタのリセット）は**エディタが持つ関心**であって、リストエディタという汎用機械の関心ではない。フィルタという概念自体をフックに預けると、**フィルタを持たないツール（エラーカタログなど）が出た時点でこの引数が意味を持たず死ぬ**。フックは「0件になった」という事実だけを通知し、それを受けて何をするかは呼び出し側が決める形にした。

## 規約5のプロファイル化と `exportMarkdown` のモジュール不一致ガード

Task 6・7 で `ToolModule.toMarkdown`（単一の変換関数）を `outputs: readonly OutputProfile<TData>[]` に置き換えた。`OutputProfile` は `id` / `label` / `fileSuffix` / `toMarkdown` の4フィールドを持つ。用語集は `[{ id: 'default', label: 'Markdown', fileSuffix: '', toMarkdown: glossaryToMarkdown }]` という単一プロファイルで、`fileSuffix: ''` により**書き出しの既定ファイル名は1バイトも変わっていない**（`<用語集のファイル名>.md` のまま）。額縁側は `outputs.length > 1` のときだけドロップダウンを出す形にし（Task 7）、用語集は1本のままなので **M8までと同じボタン2つ**が変わらず表示される。

`app-controller.ts` の `copyMarkdown` / `exportMarkdown` はプロファイルの**実体**を受け取る形にした（IDではない）。理由はID解決の失敗経路（`outputs.find(...)` が `undefined` を返す分岐）を作らないため——呼び出し元のAppは`module.outputs`から選んで渡すので、実体を最初から持っている。

このとき`exportMarkdown`に**モジュール不一致ガードを1条件足した**：`fresh.module.outputs.includes(profile)`。既存のガードは`fresh.path !== doc.path`（保存ダイアログが開いている間に選択中ファイルが変わっていないか）しか見ていなかった。ネイティブの保存ダイアログが開いている数秒〜数分の間に外部変更の取り込みが走ると、選択が別のファイル＝別のモジュールへ移りうる。そのとき手元に残っている`profile`は元のモジュールのものであり、ガードなしだと**型の違うデータを別ツールの出力関数に食わせる経路**が実在した（`profile.toMarkdown(fresh.data)`を別モジュールの`data`で呼ぶ）。レビューはこの3条件目を一時的に削除して新規テストが赤くなることを確認した上でclean判定としており、ガードの効力は実証済みである。

## `.gitignore` がファイル名決め打ちだった

Task 8着手前、`.gitignore`は`src/types/glossary.ts`という**ファイル名決め打ち**の1行だった。型生成スクリプト（`scripts/gen-types.mjs`。旧`json2ts`直接呼び出し）も同様に`glossary.schema.json`という単一スキーマ決め打ちだった。M9でスクリプトを`schemas/*.schema.json`の走査型に書き換え、`.gitignore`も`src/types/*.ts`というパターンに直した（新スクリプトの出力は`diff`で旧出力とバイト単位一致を確認済み）。

**この決め打ちを直さずにM10へ進んでいたら、エラーカタログのスキーマが増えた時点で生成された`src/types/error-catalog.ts`が`.gitignore`に拾われず、生成物がそのまま追跡対象に紛れ込むところだった。** 生成物がGit管理下に入ると、次に別の環境で`npm run gen:types`を走らせるたびに無意味な差分が発生し続ける。M9でこの決め打ちを見つけて直したのは、次のスキーマが実際に増える直前というタイミングだったという点で申し送りに値する。

## Task 5で見つかったReactの落とし穴

`use-list-rows.dom.test.tsx`のテストハーネスをブリーフの記載通り`<input defaultValue={item.name} />`（非制御）で書いたところ、「ID重複行を移動後の配列から鍵を引き直して正しい行を追う」という1件だけが失敗した（表示が更新されない）。

原因はReactの既知の挙動：`defaultValue`（非制御input）は初回マウント時に`node.value`を直接セットするため"dirty value flag"が立ち、以後`defaultValue` propを変えても表示値は追従しない。ID重複行を入れ替えても`computeRowKeys`が返す鍵の並び（`dup#0`, `dup#1`）自体は変わらないため、Reactは同じkeyのDOMノードを再利用する（＝マウントし直さない）。この非制御inputの落とし穴を、まさにID重複というテストケースが踏んだ形になる。

フック側のロジック（`moveBy`とstate更新）は正しく動いていることをデバッグ出力で確認した上で、**ハーネス側の入力を制御コンポーネント（`value` + `onChange`）に直した**。本物の`CellInput`は制御コンポーネントなので、この問題はそもそも起きない——テストハーネスを制御にすることが、本番の実装形に近づける正しい対処だった。詳細は `.superpowers/sdd/2026-08-09-m9-core-list-editor/task-5-report.md` の「途中で見つけた問題」を参照。

## レビューで確認された事実: 引き上げは保護を増やしている

Task 5の最終レビューは、新設した`use-list-rows.dom.test.tsx`の10件が変異テストで効力を実証されていることを確認した。具体的には、「移動前の鍵を使う」変異と「削除位置のクランプを外す」変異の2つを`use-list-rows.ts`に注入したところ、**既存の`GlossaryEditor.dom.test.tsx`37件はどちらの変異も素通りした**（赤くならなかった）一方、新設した10件のうち該当ケースが赤くなった。

つまりコアへの引き上げは、単なるコード移動ではなく、**既存テストが見ていなかった不変条件（移動後の鍵の引き直し、削除位置のクランプ）に新しい保護を追加した**ということである。

## 実装中に見つかった想定外（繰り越したMinor）

各タスクのレビューが最終判定をcleanとした上で、繰り越したMinorが `progress.md` に記録されている。いずれも実害が小さいと判断され `open-issues.md` には足していない：

- Task 3: `glossary/columns.ts`が`ColumnSpec`を再エクスポートしなくなった（現在の利用者はゼロ。コアから直に取ればよい）
- Task 5: `use-list-rows.ts`のモジュール冒頭JSDocが`useListRows`にぶら下がっていない（ホバーで説明が出ない）
- Task 5: `ListRows.focusCell`の`select`引数が死んでいる（内部effectは`focusIn`を直に叩く。本番呼び出しは2引数）
- Task 5: `use-list-rows.ts`が`React.RefObject`をUMDグローバル型として参照（named importに揃えたい）
- Task 8: `scripts/gen-types.mjs`はスキーマが消えても古い`src/types/*.ts`を掃除しない（M10でリネーム・削除が起きると死んだ型が`tsc`の対象に残る）

これらは「エンジンやスキーマが増えた時点で踏む」性質の負債ではなく、触ったときに直せば足りる小さな内容と判断し、`open-issues.md`には足していない。`open-issues.md`に足したのは規約8（表記ゆれ検知の対象フィールドパス宣言が`ToolModule`に無い）1件のみ——ブリーフ原案は2件としていたが、実装が確定させた事実（コード例が1件分しかない）に合わせて1件に修正した。もう1件（規約8の宣言を実際に使う検知エンジン自体がコアに無い件）は、Task 9着手時点でも規約8の宣言自体が存在しないため「まだ起きていない」と判断し、`open-issues.md`の1件の記述に「エンジンを作る時点で両方を足す」という形で含めた。

## rev への反映事項

**本節の分は反映済み**（このコミットで`docs/overview-rev.md`を編集した）：

- **6章**：規約5が`outputs`（`OutputProfile`の配列）として実装確定したこと（`fileSuffix`を`label`から独立させた理由）。列を持つツールの共通機械はコア（`src/core/list-editor/`と`src/core/duplicate.ts`）に置き、モジュールは列データとフィールド宣言だけを持つという分界

## M10への申し送り

設計は`docs/superpowers/plans/2026-08-09-m9-m10-error-catalog-design.md`の**第II部**（決定8〜18、エラーカタログエディタ）にある。M10の実装計画は、`../CLAUDE.md`の手順通り**M10のworktreeを作ってからその中で書く**（主チェックアウトに計画ファイルを作らない）。

M9で引き上げた5つの機械（`duplicate` / `cell-face` / `columns` / `field-step` / `use-list-rows`）と、規約5の`outputs`は、M10が実例2本目としてそのまま利用する前提で作られている。特に`useListRows`と`nextWidthIndex` / `stepField`の「コア側は多引数の汎用版、モジュール側は自分のデータを束ねた薄いラッパー」という形は、エラーカタログモジュールが実装するときにもそのまま踏襲できる型として残した。
