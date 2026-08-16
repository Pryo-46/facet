# M18 設計スペック: シーケンス図・ロジックツリーの画像出力

作成日: 2026-08-16
位置づけ: **実装計画への入力。** 本書は「何をどこに置き、どう見せるか」の決定と理由を持つ。タスク分割と手順は同 worktree の実装計画が持つ。

前提として読むもの:

- [`../../overview-rev.md`](../../overview-rev.md) — **8章（出力・入力戦略）を本書が拡張する**。7章（技術スタック。「Rustは原則書かない」「プラグイン登録は例外ではない」）が制約
- [`../../project-setup.md`](../../project-setup.md) — capabilities の扱い
- [`../../open-issues.md`](../../open-issues.md) — 「小さな負債」の項（キャンバス土台の複製）、「挙動の穴」の項（`layout.totalHeight`/`totalWidth` の帳簿ずれ）が本書の設計に直接効く
- [`../../lessons-for-planning.md`](../../lessons-for-planning.md)

---

## 1. 背景と目的

シーケンス図・ロジックツリーは会議中に作った図をそのまま資料へ貼りたい場面があるが、現状の出力（Markdown・Mermaid記法）はテキストであり、**チャットやドキュメントに直接貼れる画像**にはならない。本マイルストーンは、両ツールに「画像コピー」「画像で保存」を追加する。

会話で確定した要件:

- **見たまま（WYSIWYG）に忠実な出力。** 画面のDOM（HTML＋SVGのハイブリッド描画）をそのままラスタライズする（`html-to-image` を新規採用。依存ゼロ・既知の脆弱性なし・現行CSPと相性良好であることを確認済み）
- **図全体を1枚に収める。** パン/ズームで画面外にある部分も含める（表示中の範囲だけの素朴なスクリーンショットにはしない）
- **シーケンス図のみ、「問い」（ガター列＝失敗時・不明時の設計判断）を含める/含めないを都度選択できる。** ロジックツリーには対応する概念が無い（`TreeNode` は `text` のみ）ので選択肢を持たない
- **出力先はクリップボードコピーとファイル保存（PNGのみ）の両方**
- ボタンは額縁側（`App.tsx` のヘッダー帯）に置く

### 含まないもの

- **SVG出力・JPEG等の他形式。** PNGのみ
- **表示中の範囲だけのキャプチャ。** 常に図全体
- **ロジックツリー側の「問い」相当の選択。** そのような概念がデータに無い
- **プロファイル選択状態の永続化。** Markdown出力のプロファイル選択が状態を持たないのと同じ扱い（都度選ぶ）

---

## 2. rev への位置づけ

`overview-rev.md` 8章を1箇所拡張する。**実装の完了コミットで rev へ反映し、申し送りに TODO として残さない**（M4 の教訓）。

### 決定1: 8章に「画像出力プロファイル」を出力プロファイルとは別の規約として書き足す

8章は現行の出力プロファイルを「**副作用を持たない純関数**（データ→Markdown文字列）」と定めている。画像化はDOM実測（レイアウト後の座標・フォントメトリクス）に依存し、純関数として書けない。既存の `OutputProfile` に無理に統合せず、並行する新しい規約 `ImageOutputProfile` として書き足す（詳細は決定3）。

Markdown出力の「0本以上のプロファイル」という思想は踏襲する——画像出力を持たないツール（将来追加されるツールを含む）は単に `imageOutputs: []` を返せばよい。

---

## 3. 依存関係とセキュリティ

### 決定2: `html-to-image` を新規依存として採用する

検討済みの結論（詳細は brainstorming の対話記録）:

- 既知の脆弱性なし（Snyk・Aikido いずれも報告なし）、依存ゼロ（推移的サプライチェーン面が無い）、週420万DLの実績
- 単独メンテナで更新頻度は低い（最終リリース2025-04-19）が、依存ゼロなのでリスクは限定的。既存の `npm audit` 運用（`5491dcb`）に乗せて継続監視する
- 内部で画像を `data:` URLへ変換して埋め込む方式のため `img-src` に `data:` が要る。`src-tauri/tauri.conf.json` の CSP は既に `img-src 'self' data:'` を許可済み。外部URL（フォント・画像）への `fetch` は `connect-src` が `'self' ipc: http://ipc.localhost` のみで塞がれているが、このアプリのUIは `@fontsource-variable/geist` でフォントをバンドル済み・外部画像も持たないため、実運用で外部fetchが発生する場面はない

---

## 4. コンポーネントとデータフロー

### 決定3: `ImageOutputProfile` と `imageOutputs` を `core/registry.ts` に新設する

```ts
export interface ImageOutputProfile {
  id: string
  label: string
  fileSuffix: string
  /** キャプチャから除外する data-export-role の値（省略時は全部含める） */
  excludeRoles?: readonly string[]
}
```

`ToolModule` に `imageOutputs: readonly ImageOutputProfile[]` を追加する。ロジックツリーは1本（`excludeRoles` なし）、シーケンス図は2本（「問いを含む」`excludeRoles` なし／「問いを含めない」`excludeRoles: ['gutter']`）。0本のツールは画像ボタンを押せなくする——`outputs` と同じ思想（8章「0本以上」）。

### 決定4: エディタが `CaptureLayers` を `useImperativeHandle` で公開する

3レイヤ（決定6の技術検証で判明した、transformを個別に持つ背景・SVGエッジ・ノード群）をそれぞれ参照できる形で公開する必要があるため、単一の `captureRoot` だけでなくレイヤ配列を持つ：

```ts
export interface CaptureLayers {
  root: HTMLElement                    // html-to-image に渡すルート（containerRef）
  cssLayers: readonly HTMLElement[]    // style.transform を持つDOM層（background・nodes）
  svgLayers: readonly SVGElement[]     // SVG内の <g transform="..."> 属性を持つ層（edges）
}
```

`EditorProps` に `captureRef?: Ref<CaptureLayers>` を追加し、`SequenceEditor`/`LogicTreeEditor` が実装する。ガター関連要素（問いラベル・答えセル・集計行）には `data-export-role="gutter"` を付与する。

### 決定5: サイズは `layout.totalWidth`/`totalHeight` をそのまま信用しない

`open-issues.md` は2件の帳簿ずれを記録している——`layout.totalHeight` は「末尾にステップを追加」ボタン分だけ実際の描画より小さく、`layout.totalWidth` は `GhostSlot` の削除ボタン（約26px）を勘定に入れていない。この帳簿値をそのまま `html-to-image` の `width`/`height` に渡すと、**右端・下端のUI要素が画像で切れる**。

対応: キャプチャ時は編集用のUI要素（追加ボタン・ghost の削除ボタン等）に `data-export-role="chrome"` を付与し、**実測**（transform を単位行列にリセットした状態での `root.scrollWidth`/`scrollHeight`）からサイズを求める。`overflow: hidden` な要素でも `scrollWidth`/`scrollHeight` は中身の実サイズを返すため、帳簿値に依存せず求まる。**`chrome` を除外指定していてもキャンバスサイズには反映されない**（`filter` は画像に描かないだけで、`scrollWidth`/`scrollHeight` の実測値自体は `chrome` 要素を含んだままなので、その分の余白が画像の右・下に残ることがある）——要素が切れるより余白が残る方がましという判断で、この簡略化を採る。

### 決定6: 実処理は `core/image-export.ts` に置く（コアはTauriを知らない）

既存の「コアはTauriを知らない／額縁が `AppIo` として注入する」構造（`app-controller.ts`）に倣う。`core/image-export.ts` は `captureImagePng(layers: CaptureLayers, options?: { excludeRoles?: readonly string[] }): Promise<Uint8Array>` を1本公開し、次を行う:

1. `layers.cssLayers`/`layers.svgLayers` の transform を一時的に単位変換（scale=1, translate=0）へ戻す
2. `layers.root.scrollWidth`/`scrollHeight` を実測し（決定5）、`html-to-image` の `toBlob` を `width`/`height`・`filter`（`excludeRoles` に含まれる `data-export-role` を持つ要素を除外）オプション付きで呼び、返る `Blob` を `Uint8Array` に変換する
3. `finally` で transform を元に戻す

**transform のリセットは実DOMを直接書き換える方式を採る（案A。html-to-imageの`style`オプションを検証した結果の決定）。** `html-to-image` の `style` オプションはキャプチャ対象の**ルート要素にしか適用されない**——ドキュメントの記述は「an object whose properties to be copied to **node's** style」であり、node は単数（キャプチャ対象そのもの）を指す。シーケンス図・ロジックツリーの transform は3レイヤ（背景・SVGエッジ・ノード群）それぞれに個別に掛かっており、`style` オプション1本では書き換えられない。

両モジュールとも3レイヤに `data-layer="background"|"edges"|"nodes"` が既に付いている（`SequenceEditor.tsx`/`LogicTreeEditor.tsx`/`SequenceEdges.tsx`/`TreeEdges.tsx` に実在。ノード層は元々属性を持たなかったが、ドキュメント上の対応付けのため揃えて付与する）。`core/image-export.ts` 自身は `querySelectorAll` で探さず、**エディタ側が `useImperativeHandle`（決定4の `CaptureLayers`）で自分の3レイヤの参照を直接渡す**——`background`/`nodes` はDOM要素の `style.transform`（React が `style={{ transform: cssTransform(transform) }}` として設定している）、`edges` はSVG内の `<g>` の `transform` **属性**（React が `transform={svgTransform(transform)}` という attribute として渡しており、`style.transform` では書き換わらないため `setAttribute('transform', ...)` を使う）。単位行列は `cssTransform`/`svgTransform` に `{ x: 0, y: 0, k: 1 }` を渡した文字列に相当するリテラル。元の文字列を保存しておき、`toBlob` の Promise が解決した後（`finally`）に書き戻す。**画面上で「キャプチャ中は一瞬、図が全体表示にリセットされてから元の位置へ戻る」ちらつきが生じることを許容する**（この方式を選んだ理由）。React state（`transform`）は一切変更しない——d3-zoom の内部状態とズレさせないため、書き換えるのは描画済みDOM要素のインラインスタイル／属性のみに限定する。

`cssTransform`/`svgTransform` はモジュールごとに複製されている（`sequence/viewport.ts`/`logic-tree/viewport.ts`。open-issues「キャンバス土台の複製」）ため、`core/image-export.ts` はこれらの関数に依存せず、**単位変換の文字列リテラル**（`'translate(0px, 0px) scale(1)'`／`'translate(0,0) scale(1)'`）を直接持つ。コアが2本の複製へ依存を増やさないための選択。

Tauri依存の副作用（クリップボード書き込み・ファイル保存）は既存の `fs/` 層に置く——`fs/clipboard.ts` に `writeImage` を使う `copyImageToClipboard(bytes: Uint8Array)` を追加し、保存は `fs/project-fs.ts` に `askSaveImagePath`（`plugin-dialog` の `save`、フィルタ `png`）と `writeProjectImageFile`（`plugin-fs` の `writeFile`。バイナリなので既存の `writeTextFile` 経由の `writeProjectFile` とは別関数）を追加する。

### 決定6b: オーケストレーションは `core/app-controller.ts` を拡張せず `App.tsx` に置く

`app-controller.ts` は「React も Tauri も知らない」ことが設計原則（ファイル冒頭のコメント）であり、`AppIo`/`AppHost` はいずれも文字列・プリミティブ値だけを受け渡す形で徹底されている。画像キャプチャは `HTMLElement`（`CaptureLayers.root` 等）への参照が要るため、これを `copyMarkdown`/`exportMarkdown` と同じ形で `AppController` のメソッドにすると、コントローラの引数にDOM要素が混入し原則を破る。

したがって、画像コピー/保存のオーケストレーション（キャプチャ実行→クリップボード書き込みまたは保存ダイアログ→バナー/トースト表示）は `App.tsx` に直接書く関数（`doCopyImage`/`doExportImage`）とし、`AppController`/`AppIo`/`AppHost` は変更しない。**保持する規律は「順序」であって「置き場所」ではない**——決定9（キャプチャを保存ダイアログの前に確定させる）・決定10（`guardIssues` を適用しない）の順序は `App.tsx` 内の関数がそのまま体現する。`core/image-export.ts` はDOM要素を引数に取る（Reactには依存しない）ロジック層として、`captureImagePng(layers: CaptureLayers, options: { excludeRoles?: readonly string[] }): Promise<Uint8Array>` を1本公開し、`App.tsx` はこれを呼ぶだけにする。

### 決定7: `capabilities/default.json` を2つ追加し、Cargo.toml に1機能を足す

- `clipboard-manager:allow-write-image`（現状 `allow-write-text` のみ）
- `fs:allow-write-file`（現状 `fs:allow-write-text-file` のみでバイナリ書き込み権限が無い）

`html-to-image` の `toBlob` はPNGの**エンコード済みバイト列**を返す（`@tauri-apps/plugin-clipboard-manager` の `writeImage` の実装例は生RGBAの `number[]` を渡す形——`[255,0,0,255, ...]` ——であり、これはPNGバイト列とは別物）。エンコード済みPNGを渡すには `@tauri-apps/api/image` の `Image.fromBytes(pngBytes)` でデコードしてから `writeImage(image)` に渡す必要がある。`Image.fromBytes` はTauri側で「`ico`/`png` のみサポートし、対応する Cargo feature（`image-png`）の有効化が要る」——現状 `src-tauri/Cargo.toml` の `tauri` 依存は `features = []` で `image-png` を持たない。`features = ["image-png"]` を追加する（7章の「プラグイン登録・feature有効化は原則の例外ではない」と同種——判断を持たず、ネイティブ機能を有効にするだけ）。

---

## 5. UI

### 決定8: `ExportMenu` をジェネリック化し、画像出力にも使い回す

`ExportMenu`（`components/ExportMenu.tsx`）は「プロファイルが1本ならボタン直押し、2本以上ならドロップダウン」という分岐を持つが、内部で使っているのは `profile.id` と `profile.label` だけ（`fileSuffix`/`toMarkdown` は参照していない）。`ImageOutputProfile` も `id`/`label` を持つため、新規コンポーネントを作らず `ExportMenu` を `<P extends { id: string; label: string }>` にジェネリック化し、ラベル文言を `copyLabel`/`exportLabel` プロパティとして外出しする（現状 `COPY_LABEL`/`EXPORT_LABEL` 定数はMarkdown固定文言のハードコード）。

`App.tsx` はMarkdown用（`copyLabel="Markdown をコピー"` `exportLabel="Markdown を書き出す"`）と画像用（`copyLabel="画像をコピー"` `exportLabel="画像で保存"`）の2つを並べて呼ぶ。ロジックツリーは `imageOutputs` が1本なので直押し、シーケンス図は2本なのでドロップダウン——「問いを含む」「問いを含めない」を選んでから実行する（エラーカタログのMarkdown出力プロファイル選択と同じ体験）。

---

## 6. エラー処理

既存の `copyMarkdown`/`exportMarkdown`（`app-controller.ts`）と同じパターンに乗せるが、2点変える。

### 決定9: キャプチャは保存ダイアログを開く前に確定させる

Markdown出力は「ダイアログの間に外部変更が入るかもしれないので、ダイアログの**後**に `fresh` なdataを引き直す」設計だが、画像はDOM実測に依存するため逆にする。ダイアログを開いている間にウィンドウリサイズやテーマ変更が起きても、**押した瞬間の見たまま**を保証するため、PNGバイト列は保存パスを聞く**前**に生成する。

### 決定10: 整合性エラーの確認ダイアログ（`guardIssues`）は画像出力に適用しない

Markdown出力は赤（未定義・参照切れ）が出力から構造的に消えるため確認を挟むが、画像は「見たまま」がそもそもの要件であり、警告表示もそのまま写り込んで問題ない。

失敗時（キャプチャ失敗・クリップボード書き込み失敗・保存書き込み失敗）は `host.setBanner('io', ...)`。保存ダイアログのキャンセルは黙って戻る。成功時は `host.showToast(...)`。

---

## 7. テスト

| 対象 | 何を固定するか |
| --- | --- |
| `core/image-export.ts` の純粋ロジック | `excludeRoles` によるDOM除外判定、transform一時変更→復元。実際のラスタライズ（canvas生成）はjsdomで動かないため、「DOM要素→PNGバイト列」の実処理は注入可能な関数として切り出し、テストではモックする（`measure.ts` が「canvasを取れない環境では概算器に落ちる」のと同じ要領） |
| `SequenceEditor.dom.test.tsx`/`LogicTreeEditor.dom.test.tsx` | ガター要素へ `data-export-role="gutter"` が付いていること。編集用UI要素（追加ボタン等）へ `data-export-role="chrome"` が付いていること |
| `app-controller.test.ts` | `copyImage`/`exportImage` のフロー（成功・キャンセル・失敗）を既存のMarkdown系テストと同じ形で追加 |
| 実機確認 | クリップボード貼り付け・保存したPNGを開く。ラスタライズ結果の見た目は自動テストで検証できない |

---

## 8. 完了時に触るもの

`CLAUDE.md` の「マイルストーン完了時に触る3箇所」に加え、本書に固有のもの:

1. **`docs/history/m18-core-image-export.md` を新規作成**
2. **`docs/open-issues.md`**
   - 突き合わせる: `layout.totalHeight`/`totalWidth` の帳簿ずれ2件（M14・sequence-m2）——本マイルストーンは実測で回避するだけで根治しない。決定5の対応が「実測に切り替えた」だけで元の帳簿ずれ自体は残ることを明記する
   - 突き合わせる: 「キャンバスの土台が logic-tree と sequence で丸ごと複製されている」（sequence-m1）——`CaptureLayers` の実装が両モジュールにほぼ同一の形で増える。差分を増やさないよう both を直す
3. **`docs/overview-rev.md`** — 8章に「画像出力プロファイル」を追記（決定1）
4. **`docs/project-setup.md`** — capabilities 節に `clipboard-manager:allow-write-image`／`fs:allow-write-file` を追記（決定7）
