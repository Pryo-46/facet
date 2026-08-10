# 開いている残件

> **生きた文書。編集して増減させる。** 解消したものは**消す**（消したこと自体は、そのマイルストーンの [`history/`](history/) に残る）。
>
> ここに載るのは「**いつでもよいが、忘れると実害化するもの**」。いま着手すべきものはマイルストーンの計画に入れる。マイルストーン完了時にこのファイルを更新するのは義務（[`../CLAUDE.md`](../CLAUDE.md) 参照）。
>
> 最終更新: エラー登録 Skill 完了時点（2026-08-10）

各項目の末尾の `[MN]` は**最初に記録されたマイルストーン**。長く開いているものほど「踏まないから残っている」のか「踏むけど後回しにしている」のかを見分ける手がかりになる。

## テストが無い箇所

- **interleaving を要する3分岐にテストが無い**（`src/core/app-controller.ts`）: `rescan` の `switchingFolder > 0` ガード（フォルダ切替中に届いた旧フォルダのイベントが新しい一覧を上書きする）、`rescan` の `token !== scanSeq || projectDir !== dir` ガード（遅れて着地した古い走査結果が新しい一覧を上書きする）、`handleSelectedGone` の `selectSeq++`（進行中の `selectFile` が着地して消えたファイルを選び直す）。**コントローラは I/O を注入しているので `io.scan` に手動 Promise を挟めば書ける。** この層に触るときの宿題 `[M6]`
- **`currentDocument()` の「未選択」分岐を明示的に踏むテストが無い**（`src/core/app-controller.ts`）。「編集中データなし」分岐と観測が重なる `[M6]`
- **`FLUSH_MAX_ROUNDS` の打ち切りパスに直接テストが無い**（`src/core/autosave.ts`）。戻り値は安全側の false なので後回し可 `[M5]`
- **`fileExists` に専用の単体テストが無い**（`src/fs/project-fs.ts`）。`exists` への1行委譲で、意味のある挙動は `file-ops.test.ts` が押さえている `[M5]`
- **`ChoiceDialog` のオーバーレイクリックのテストが無い**。`onOpenChange` を渡さないことで構造的に担保され、同じ機構を Esc のテストが固定している `[M5]`

## 将来の機能を作った瞬間に踏むもの

- **`ensureFileOfType` は将来のインライン登録から呼ぶと二択と競合する**（`src/core/app-controller.ts`）: 内部で `rescan()` を回すので、`ask` が出た直後に `selectFile` で選択を移してしまい、回答が「選択が変わったため書き戻しませんでした」に倒れる。今日は「用語集を作る」ボタンが空状態（未選択時）にしか出ないので到達不能だが、**インライン登録を実装した時点で踏む**（[`history/m4-core-file-operations.md`](history/m4-core-file-operations.md) の `ensureFileOfType` に関する項と併せて読むこと） `[M6]`
- **モジュール規約8（表記ゆれ検知の対象フィールドパス宣言）が `ToolModule` に無い**（`src/core/registry.ts`）: rev 6章は8点セットと書いているが、コードは7点＋`createEmpty`。**検知エンジン自体もコアに無い**ため、宣言だけ足しても読み手のいない死んだコードになる。エンジンを作る時点で両方を足す `[M9]`
- **`scripts/gen-types.mjs` は `schemas/*.schema.json` が減っても対応する `src/types/*.ts` を消さない**: スキーマを走査して書き出すだけで、消えたスキーマの古い型ファイルは掃除しない。M9 で `.gitignore` を `src/types/glossary.ts` から `src/types/*.ts` に広げたため、取り残された型ファイルは `git status` に現れず `tsc` の対象にだけ残る。**2本目以降のツールでスキーマを作り直す／消す時点で踏む** `[M9]`（M10 はスキーマを1本足しただけで、作り直し・削除は発生していないため未解消のまま）

## 挙動の穴（実害は小さいが残っている）

- **`resolveCommand` の細かい非対称**（`src/core/keyboard/keymap.ts`）: macOS の `Ctrl+Backspace`（主修飾キーは Cmd なので素の Backspace として通る）と `Alt+Shift+↑↓`（`altKey` を先に見るため並び替えになる） `[M3]`

## 性能

- **編集1打鍵ごとに全ファイルの `checkConsistency` を再実行している**: 数百レコード規模では問題ないが、規模が増えたら選択中ファイルだけの差分計算に変える `[M2]`
- **textarea の高さ計算が初回マウントで行数ぶんの強制リフローを起こす**（`src/components/CellInput.tsx`）: `multiline` のセル（定義・備考）は `useLayoutEffect` で `rows=1` に戻してから `scrollHeight` を読むため、セルあたり2回のレイアウト計算が初回に走る。5行上限が1回あたりのコストの頭を押さえているが、数百行では体感しうる。上の `checkConsistency` の再実行と同じ規模の話 `[M8]`
- **`CellInput` の行数上限を8にした影響**（`src/components/CellInput.tsx`）: 初回マウントの強制リフローのコストは行数に比例する（上の項目と同じ機構）。M10 の実機確認で体感が出なければ据え置き、出たら差分計算へ `[M10]`

## アクセシビリティ

- **列幅ハンドル（`role="separator"`）が `aria-valuenow` / `aria-valuemin` / `aria-valuemax` を持たない**（`src/core/column-resize.ts` の `HandleProps`）: ハンドルは `tabIndex={0}` で Tab 順に入り ←→ で動く（＝WAI-ARIA の window splitter）が、**現在の幅がスクリーンリーダーに伝わらない**ので、操作しても何が起きたか分からない。値は store が持っているので、`getHandleProps` が返す props に3つ足すだけで塞がる `[M8]`

## デザイン

- **`warning` と `ok` が P型・D型色覚で識別できない**（`src/styles/palette.css`）: 採用した Basalt 由来の配色は、OKLab の色差が標準色覚で 0.151 / P型 0.050 / D型 0.041（ライト）。0.10 を下回ると「同じ色の濃淡」に見え始める。**色を差し替えるときに、青緑側（`oklch(0.470 0.075 168)` 付近）へ振る案を再検討すること。** `palette.test.ts` がこの数字を毎回出力するが、意図的に失敗させていない（M7 の設計スペック 決定4） `[M7]`
- **`ok` がどのコンポーネントからも参照されていない**（`src/styles/palette.css`）: rev 9章の3系統として定義とテストはあるが、facet の画面に「確定・応答」を色で示す箇所がまだ無い（トーストは種別を持たない）。**成功トーストなどを作った時点で使う。** M8 で新設した `surface-accent`（見出しの面）は**別のトークン**であって、これを解消しない——カラム名は「確定・応答」ではないので、`ok` を流用すると意味論が壊れる `[M7]`

## 小さな負債

- **用語テーブルの `<th>` に `sticky` と `relative` が同時に付いている**（`src/modules/glossary/GlossaryEditor.tsx`）: どちらも `position` なので、カラム名が固定されているのは Tailwind が `sticky` を `relative` より後に出力しているからにすぎない。`sticky` 自体が絶対配置の包含ブロックになる（列幅ハンドルはそれに乗っている）ので `relative` は不要。**出力順が変わると固定が静かに外れ、原因は読み手に自明でない** `[M8]`
- **エディタのキー処理が用語集とエラーカタログで二重化している**（`GlossaryEditor.tsx` / `ErrorCatalogEditor.tsx`）: `runCommand` の switch・`onCellKeyDown`・`textFieldContext`・セルの面のクラス定数（計 約80行）がほぼ同一。M10 は意図的に複製した——いま抽象を決めても、3本目（ロジックツリーは列を持たない図系）が必要とする形と一致する保証がないため（M9 決定1が万能フックを退けたのと同じ理由）。**3本目が列を持つツール（状態遷移の遷移表など）だったら、その時点で引き上げる。** 判断材料は「2本の差が3点（プロファイルトグル・列幅ストア2本・吸収列）に収まっているか」 `[M10]`
- **エラー登録 Skill の同梱スクリプトが、警告判定・ラベル文言・整合性検証をアプリと複製している**（`.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs` の `isWarn` / `LEVEL_LABEL` / `ACTION_LABEL` / 整合性検証の3ルール）: それぞれ `src/modules/error-catalog/warnings.ts` の `isWarnCell`・`resolution-labels.ts` の `RESOLUTION_LABELS`・`fields.ts` の `FIELD_LABELS`・`consistency.ts` の `checkErrorCatalogConsistency` と、条件・文言が1対1で一致するよう手で複製している。Skill とアプリの接点はファイル（正規形）だけという設計上の決定の帰結で、構造的に避けられない。**`schemas/error-catalog.schema.json` の `resolutionLevel` enum を改訂するときは、この2箇所を両方追従させること。** 追従漏れがあっても双方は独立に動くため、テストでは検知されない `[Skill]`
- **2本の Skill の `evals/grade.mjs` で自己位置解決の形が揃っていない**: 用語集版（`.claude/skills/glossary-term-register/evals/grade.mjs`）は `SKILL` / `SCHEMA` を主チェックアウトの絶対パス（`C:/Dev/Projects/facet/...`）で持っており、worktree では動かない。エラー登録版は最終レビューで `import.meta.url` からの自己位置解決に直したため、**2本で形が揃っていない。** 3本目の Skill を作るときか、用語集版に触る機会に揃える `[Skill]`
