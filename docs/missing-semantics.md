# 欠落の規約

> **「正」の文書。** ここに書くのは規約であって説明ではない——「〜すること」「〜しない」と読める文で書き、実装が変わったらこの文書を直す。**位置づけは U3**（[`facet-UI設計ノート.md`](facet-UI設計ノート.md) の「U3.『未定義』判定の共通規約」）: 「何をもって『未定義』とするか」の共通規約を1枚にする。中身は課題ツリー（issue-tree-m1〜m3）が先に実装した形——`missing.ts` の判定関数・ヘッダの集計・行番号での指し方——を、他の4モジュールへ言語化して広げたものである（M22）。
>
> **判定源は [`src/core/reading-guide.md`](../src/core/reading-guide.md) と一対一。** 画面が黄（`missing`）で塗る箇所と、AI がこのフォルダを読むときに「ここは未決」と扱うべき箇所は、同じ集合でなければならない。この文書とその双子である reading-guide.md のどちらかを直すときは、必ずもう一方も見て揃えること。

## 決定1: モジュール別の欠落／欠落でない

| モジュール | 欠落（黄） | 欠落ではない（面を付けない） |
| --- | --- | --- |
| 用語集 | `definition === ''`（未定義）／`kind === 'undecided'`（未分類） | `aliases` が空、`notes` が空 |
| エラーカタログ | `resolutionLevel === 'undecided'`（未分類）／`occurrence`・`causeForSupport`・`causeForSpec` が空／対応欄（`userAction` 等）が空で、かつ `resolutionLevel` がその主体か `none`（未記入） | `notes` が空、主体でない対応欄が空（「書く必要がないので空」） |
| シーケンス | 問いが立っているのに `failures` にキーが無い（未回答）／参加者の `name` が空／ステップの `label` が空（未記入） | 問いが立っていないスロット、`notApplicable`（決めた） |
| ロジックツリー | `text === ''`（未記入） | — |
| 課題ツリー | 4つの問い（仮説なし・未決・保留・未判断）。`poseQuestions` が導出する | `rationale` が空、見送り配下（抑制） |

備考・別名・`rationale` を欠落にしない判断はこの文書でも変えない（[`docs/glossary/session-notes.md`](glossary/session-notes.md) の「`notes` は検知対象外」、reading-guide.md の「由来の欠落は仕様の穴ではない」）。

## 規約6条

### 1. 欠落とは「まだ決めていない」の意思表示である

欠落は、データの空欄そのものを指す。捏造した表示文字列や UI 側の解釈ではなく、**空である事実**が欠落である。判定源は [`src/core/reading-guide.md`](../src/core/reading-guide.md) の「未決」の定義と一対一で、上の決定1の表がその写しである。備考・別名・`rationale` は判定源が「未決」と扱わないので、欠落として塗ってはならない。

- 判定を持つファイル: `src/modules/glossary/missing.ts`／`src/modules/error-catalog/missing.ts`／`src/modules/logic-tree/missing.ts`／`src/modules/sequence/missing.ts`／`src/modules/issue-tree/derive.ts`（`poseQuestions`）
- 判定源（AI 向け）: `src/core/reading-guide.md` の「最重要: 未決を埋めない」節と「ツール別の読み方」節

### 2. 空は空のまま描く

画面に「未定義」「別名なし」のような、データに実在しない文字列を捏造してはならない。`placeholder` にも欠落を意味する語を使わない——面が欠落を運ぶので、`placeholder` は同じ情報の二重表現になる。**データに実在する値のラベルは捏造ではない**ので、`undecided` の「未分類」、`notApplicable` の「考慮不要」は使ってよい。空タイトルの `(無題)`（`src/core/load.ts` の `UNTITLED`）も引き続き使ってよいが、理由は別で——**タイトルは決定1の表に無く、この文書が規約する欠落軸そのものではない**（ファイル一覧・帯の見出しの表示上の便宜であって、`missing` の面を伴わない）。欠落軸のフィールド（決定1の表にある値）を空のまま実在しない文字列で埋めることは、このルールが引き続き禁じる。

出力（Markdown / Mermaid）は画面と別の制約を持つ。出力先（NotePM 等）には面が無く文字でしか欠落を残せないため、未回答は出力に `（未定義）` と書く（`src/modules/sequence/output-labels.ts` の `UNDEFINED_VALUE`）。**ただし `notApplicable`（考慮不要）は画面・出力のどちらも同じ語 `考慮不要` を書く**——`NOT_APPLICABLE_LABEL` は `'考慮不要'` で（かつて `'─ 考慮不要'` だったが M22 で記号を外した）、`GutterSlot.tsx` の画面表示にも `markdown.ts` の出力にも同じ定数を使う。`（未解決）`（`UNRESOLVED_ACTOR_LABEL`。参照先の参加者が無い）は無効軸の表示であって欠落ではなく、捏造でもない。

- 捏造文字列を消した箇所: `src/modules/glossary/AliasCell.tsx`（別名なし→消去）／`src/modules/glossary/GlossaryEditor.tsx`（定義列の `placeholder="未定義"`→消去）／`src/modules/error-catalog/ErrorCatalogEditor.tsx`（対応欄の `placeholder="未定義"`→消去）／`src/modules/sequence/GutterSlot.tsx`（未回答の `placeholder="未定義"`→消去）／`src/modules/sequence/ActorRefCell.tsx`（本文の `（未定義）`→消去。ボタン自体を破線＋淡い面にする）
- 語の一元管理: `src/modules/sequence/output-labels.ts`（`UNDEFINED_VALUE` / `NOT_APPLICABLE_LABEL` / `UNRESOLVED_ACTOR_LABEL`）

### 3. 見せ方は rev 9章の欠落軸に従う

表のセルは淡い面（`missing-face`）だけ、キャンバスのノード・スロット・参加者参照・ラベルセルは破線＋淡い面、バッジは線種で段を分ける（破線＝まだ見ていない／実線＝保留）。無効（`invalid`。赤）が欠落より優先する——両方が立つ入力では無効の枠・面が勝ち、欠落の面は出ない。

- 表のセル: `src/modules/glossary/GlossaryEditor.tsx`／`src/modules/error-catalog/ErrorCatalogEditor.tsx`（`CELL_FACE_CLASS` / `cellFace`。`src/core/list-editor/cell-face.ts`）
- キャンバスのノード: `src/modules/logic-tree/NodeBox.tsx`（`border-dashed border-missing bg-missing-face`。`invalid` が勝つ）
- シーケンスのスロット・参照・ラベル: `src/modules/sequence/GutterSlot.tsx`／`src/modules/sequence/ActorRefCell.tsx`／`src/modules/sequence/SequenceEditor.tsx`（参加者ヘッダ・ステップのラベルセル）
- バッジの線種: `src/components/badge-styles.ts`（`badgeClass`）／`src/modules/issue-tree/badge-variant.ts`

### 4. 必ずヘッダで集計する

各モジュールは `MissingTally` 部品で「⚠ 要対応 N ＋内訳チップ（押すと次へ）」を帯に出す。**判定関数と集計関数は同じ `missing.ts`（課題ツリーは `derive.ts`）にあり**、画面に面が付く箇所と数える箇所が同じ関数から出る。抑制された配下（課題ツリーの見送り）は数えない。着信（未判断）は欠落軸ではないが、同じ帯・同じ部品で数え、行にもバッジを2つ目として出す。

- 集計の型と組み立て文字列（コア）: `src/core/missing-tally.ts`（`MissingTally` / `MissingTallyPart` / `TALLY_TOTAL_LABEL` / `tallyLine`）
- 表示部品（コア）: `src/components/MissingTally.tsx`
- 各モジュールの判定・集計: `src/modules/glossary/missing.ts`／`src/modules/error-catalog/missing.ts`／`src/modules/logic-tree/missing.ts`／`src/modules/sequence/missing.ts`
- 課題ツリーだけ別経路: `src/modules/issue-tree/derive.ts` は `tallyLine` を自前で持つ（同梱 Skill のバイト一致コピー制約で `missing-tally.ts` を値 import できないため）。`toMissingTally(t)` でコアの形へ変換し、アプリの帯はこちらを使う。コアの `tallyLine(toMissingTally(t))` と `derive.ts` の `tallyLine(t)` が逐語一致することは `src/modules/issue-tree/derive.test.ts` が機械検査する
- 未判断バッジ（行）: `src/modules/issue-tree/HypothesisRow.tsx`（判断バッジの隣に `pending` variant で2つ目を出す）

**シーケンスの帯は補足を持つ。** 回答済・考慮不要は欠落ではないが総量の把握に要るので、`MissingTally` の右に `ink-muted` の文字で `回答済 N ／ 考慮不要 N` を添える（チップではない。押せない）。`.claude/skills/sequence-register/scripts/sequence-write.mjs` と `SKILL.md` の報告文もこの形（`⚠ 要対応 N（未回答 x ／ 未記入 y）` と `回答済 N ／ 考慮不要 N`）に揃え、`src/modules/sequence/skill-write.smoke.test.ts` がアプリの `tallyLine` との逐語一致を固定する。

**集計は表示中のプロファイル・絞り込みに関わらず全件、ジャンプは表示中の行だけを巡る**（用語集・エラーカタログ）。フィルタで隠れている行やプロファイルで非表示の列には飛ばない——これは既知の制約であり、`docs/open-issues.md` に残してある。

### 5. 決着は文字が運ぶ（シーケンスの答え）

シーケンスの答えスロットは判断軸ではない（支持／棄却ではない）ので、判断軸の濃い面（`judge-yes` / `judge-no`）を借りない。回答済＝答えの本文がそのまま決着を示し、考慮不要＝固定語 `考慮不要`（アイコンや面ではなく文字）が決着を示す。判断軸の濃い面は支持／棄却に専有させる。

- `src/modules/sequence/GutterSlot.tsx`（`notApplicable` は無地＋`ink-muted`＋`考慮不要` の接頭。面は付けない）
- `src/modules/sequence/output-labels.ts`（`NOT_APPLICABLE_LABEL`）

### 6. 位置は行番号で指し、重複は件数で

`#N`（＝配列位置＋1＝ No 列の値）で行を指す。重複は件数＋行番号の列挙で示す。番号が画面に無いモジュール（ロジックツリー・課題ツリーのようなキャンバス系）は、これまでどおり名前や「（未記入・N番目）」の形で指す——D4 は「行番号が存在するモジュールでは必ず行番号で」であって、キャンバスに番号を持ち込む規約ではない。

- 行番号の生成: `src/core/row-ref.ts`（`rowRef(index)` = `'#' + (index + 1)`）
- 用語集の No 列: `src/modules/glossary/columns.ts`（導出列。編集対象ではない）／`src/modules/glossary/GlossaryEditor.tsx`（No セルへ `rowAnchor` を移す）。エラーカタログは M10 から同じ形の No 列を持つ（`src/modules/error-catalog/columns.ts:22` の `ErrorColumn = 'no' | ErrorField`）
- 重複・行指摘のメッセージ: `src/modules/glossary/consistency.ts`／`src/modules/error-catalog/consistency.ts`（`名称「X」が${N}件重複しています（#2 ／ #5 ／ #7）` の形。コード上は間に空白を入れない）
- シーケンスの行呼称: `src/modules/sequence/consistency.ts` の `stepName()`（`rowRef` を経由。文面は変えていない）
- キャンバス系（名前で指す。触っていない）: `src/modules/logic-tree/consistency.ts`／`src/modules/issue-tree/consistency.ts`（`（未記入・N番目）`）
