# M22 設計スペック: 欠落の規約——空は空のまま、数えて、行番号で指す

> 2026-08-24。[`docs/facet-UI設計ノート.md`](../../facet-UI設計ノート.md)（以下「UI ノート」）の **C: 未定義表現の本体**（D1・D4・D5・D14・U3）を実装するための設計。A〜F の分割は M21 の設計スペック [`2026-08-23-m21-design-tokens-v2-design.md`](2026-08-23-m21-design-tokens-v2-design.md) 末尾のとおりで、**B（タイポグラフィ）・D（幅固定）・E（フォント）・F（見送り集計の2段構え等）は扱わない。**
> 前提: A（色の規約）は M21 で完了し、実機確認で「欠落・無効・着信は淡い面＋線」「表のセルは面だけ」が確定している（[`../../history/m21-core-design-tokens-v2.md`](../../history/m21-core-design-tokens-v2.md) の追記節、rev 9章）。**本スペックは新しいトークンを1つも足さない。** C は M21 の語彙（18トークン・規約6条）で描く。

## 目的

UI ノート D1 の診断——**用語集では「空＝黄」なのにツリーでは「空＝無害」に見え、しかも「未定義」「別名なし」という文字列はデータに無い値を UI が捏造している**——を、判定・集計・表示の3層を揃えることで解く。

- **どのデータが欠落か**をモジュールごとに1ファイルで定め、その定義を AI 向けの読み方（`src/core/reading-guide.md`）と一対一にする（U3）
- **空は空のまま描く。** 捏造文字列と `placeholder` の欠落語を消し、面と線だけで示す（D1）
- **全モジュールのヘッダで欠落を集計する。** 課題ツリーの帯（`⚠ 要対応 N` ＋ジャンプできるチップ）を共通部品に昇格させる（§5「他モジュールにない到達点」を全体へ）
- **位置は行番号で、重複は件数で指す**（D4・D5）。用語集にも No 列を置く
- 以上を `docs/missing-semantics.md` に規約として1枚で書く（U3。課題ツリーの実装の言語化）

## 決定1: 欠落の判定源は `reading-guide.md` と一対一（U3）

**画面で黄（`missing`）になる箇所 ＝ AI に「ここは未決」と読ませる箇所。** `src/core/reading-guide.md` の「ツール別の読み方」が既にモジュール別の定義を持っているので、U3 はそれを正とし、UI 側の判定関数はその写しになる。

| モジュール | 欠落（黄） | 欠落ではない（面を付けない） |
| --- | --- | --- |
| 用語集 | `definition === ''`（未定義）／`kind === 'undecided'`（未分類） | `aliases` が空、`notes` が空 |
| エラーカタログ | `resolutionLevel === 'undecided'`（未分類）／`occurrence`・`causeForSupport`・`causeForSpec` が空／対応欄（`userAction` 等）が空で、かつ `resolutionLevel` がその主体か `none`（未記入） | `notes` が空、主体でない対応欄が空（「書く必要がないので空」） |
| シーケンス | 問いが立っているのに `failures` にキーが無い（未回答）／**参加者の `name` が空／ステップの `label` が空**（未記入） | 問いが立っていないスロット、`notApplicable`（決めた） |
| ロジックツリー | `text === ''`（未記入） | — |
| 課題ツリー | 4つの問い（仮説なし・未決・保留・未判断）。現状の `poseQuestions` のまま | `rationale` が空、見送り配下（抑制） |

**reading-guide に2項を足す**——シーケンスの「参加者の `name` が空・ステップの `label` が空は未記入（未決）」。現状は Markdown 出力がこの2つを `（未定義）` と書くのに reading-guide が触れておらず、出力と読み方がずれている。画面・出力・読み方の三者を同じ定義に揃える。

**備考・別名・`rationale` を欠落にしない判断は変えない**（`docs/glossary/session-notes.md` の「`notes` は検知対象外」、reading-guide の「由来の欠落は仕様の穴ではない」）。

## 決定2: 空は空のまま描く（D1）

| 場所 | 現状 | 後 |
| --- | --- | --- |
| `src/modules/glossary/AliasCell.tsx:223` | 別名が0件なら `別名なし` の `<span>` | 消す。空のまま（別名は欠落ではないので面も付けない） |
| `src/modules/glossary/GlossaryEditor.tsx:379` | 定義列 `placeholder="未定義"` | 消す。面（`CELL_FACE_CLASS.warn`）は既に付いている |
| `src/modules/error-catalog/ErrorCatalogEditor.tsx:298` | `notes` 以外 `placeholder="未定義"` | 消す |
| `src/modules/sequence/GutterSlot.tsx:69` | 未回答 `placeholder="未定義"` | 消す。破線＋淡い面は既に付いている |
| `src/modules/sequence/SequenceEditor.tsx:394-412` | 行高の予約に `'未定義'` の折り返しを測る | 定数の最小高（1行ぶん）に置き換える。文字列に依存させない |
| `src/modules/sequence/ActorRefCell.tsx:72-82` | 解決した参加者の `name === ''` なら本文に `（未定義）` | 本文は空。**ボタン自体を `border-dashed border-missing bg-missing-face`** にする（参照先が欠落） |
| `src/modules/sequence/SequenceEditor.tsx:846` 参加者ヘッダ | `invalid` のときだけ面 | `name === ''` なら破線＋`missing-face`。`invalid` が勝つ |
| ステップのラベルセル | 面なし | `label === ''` なら `missing-face` |

**`placeholder` にも欠落の語を使わない。** 面が欠落を運ぶので placeholder は同じ情報の二重表現であり、課題ツリーは既にこれを選んでいる（`IssueBox.tsx:122`「`QUESTION_LABELS.hypothesis` をプレースホルダにしない」）。**データに実在する値のラベルは捏造ではない**——`undecided` の「未分類」、`notApplicable` の「考慮不要」、空タイトルの `(無題)` は据え置く。

**出力（Markdown / Mermaid）の `（未定義）` は触らない。** 出力先（NotePM）に面が無いので文字列でしか欠落を残せず、`docs/glossary/session-notes.md:110` と `app-controller.ts:762` の契約（未定義は `（未定義）` として出力に残す）は生きている。D1 は画面の話である。

**`（未解決）`（`UNRESOLVED_ACTOR_LABEL`。参照先の参加者が無い）は無効軸であって欠落ではなく、捏造でもない**（存在しない ID を指している事実の表示）。触らない。

## 決定3: 判定・集計・表示の3層（共通の契約）

課題ツリーの `poseQuestions` → `tallyQuestions` → 帯のチップ、の形を一般化する。

### (a) 判定はモジュールが持つ——`src/modules/<tool>/missing.ts`

純関数2つ。描画が面を付ける根拠と、集計の根拠が同じ関数から出る。

- `isMissing*(entity, field)`——セル／ノード／スロット単位の真偽
- `tallyMissing(data)`——集計。戻り値はコアの `MissingTally`（(b)）

| モジュール | ファイル | 内訳（`parts`）のラベル |
| --- | --- | --- |
| 用語集 | `missing.ts`（新規。いま `GlossaryEditor.tsx:329,371` に散っている条件を移す） | `未定義`（definition）／`未分類`（kind） |
| エラーカタログ | `warnings.ts` → `missing.ts` に改名。`isWarnCell` → `isMissingCell`、`tallyMissing` を足す | `未分類`（resolutionLevel）／`未記入`（空欄） |
| ロジックツリー | `missing.ts`（新規） | `未記入` |
| シーケンス | `missing.ts`（新規。`questions.ts` の `poseQuestions` / `presentAnswers` を使う） | `未回答`（スロット）／`未記入`（参加者名・ステップラベル） |
| 課題ツリー | `derive.ts` のまま。`IssueTreeTally → MissingTally` の変換を足す | `仮説なし`／`未決`／`保留`／`未判断`（現状の `QUESTION_LABELS`） |

### (b) 集計の型と文字列はコアが持つ——`src/core/missing-tally.ts`

```ts
export interface MissingTallyPart {
  kind: string            // モジュール固有の鍵。ジャンプの引数になる
  label: string           // 画面と Skill の報告が出す語
  count: number
  variant: 'open' | 'hold' | 'pending'   // Badge の variant。破線／実線／青
}
export interface MissingTally { total: number; parts: MissingTallyPart[] }  // count 0 の part は入れない
export const TALLY_TOTAL_LABEL = '要対応'
export function tallyLine(t: MissingTally): string
// 「⚠ 要対応 N（A x ／ B y）」。total 0 なら「要対応 0」。課題ツリーの現行と逐語一致
```

**課題ツリーの `derive.ts` は動かさない（`tallyLine` / `TALLY_TOTAL_LABEL` をそのまま持ち続ける）。** 理由は同梱 Skill の制約——`.claude/skills/issue-tree-register/scripts/derive.ts` は `src/modules/issue-tree/derive.ts` の**バイト一致コピー**で、Node が型ストリップで直接読むため**値 import を1つも持てない**（`src/modules/issue-tree/skill-copy.test.ts` が両方を門番している）。`derive.ts` からコアの `missing-tally.ts` を値 import した瞬間に Skill が落ちる。

したがって文字列の組み立ては**2本になる**——コアの `tallyLine(MissingTally)`（アプリの帯と、課題ツリー以外の Skill の報告の正）と、`derive.ts` の `tallyLine(IssueTreeTally)`（課題ツリー Skill の正）。**この複製は機械検査で固定する**: `derive.ts` に `toMissingTally(t: IssueTreeTally): MissingTally` を置き（`import type` だけなので Skill の制約に触れない）、`derive.test.ts` に「任意の `IssueTreeTally` について `coreTallyLine(toMissingTally(t)) === tallyLine(t)`」を足す。`TALLY_TOTAL_LABEL` も両方に `'要対応'` を置き、同じテストが一致を見る。**アプリの帯は `toMissingTally` 経由でコアの形を使う**（Skill の報告は現行どおり `derive.ts` の方）。`skill-write.smoke.test.ts:90-94` の逐語一致は変わらず門番になる。

`lessons-for-planning.md` の「『ここは複製するしかない』と結論したら、機械検査で固定できる形にできないかを1回問う」に従った形である。

**線種の割り当て**: M22 で新たに面を付ける欠落はすべて「まだ見ていない」なので `open`（破線）。`hold`（実線）は課題ツリーの保留、`pending`（青）は未判断だけ。4軸の規約（rev 9章）は変えない。

### (c) 表示は共通部品——`src/components/MissingTally.tsx`

```ts
interface MissingTallyProps {
  tally: MissingTally
  onJump?: (kind: string) => void   // あればチップは <button>、無ければ <span>
  className?: string
}
```

`⚠ 要対応 N`（0 なら `要対応 0`、`⚠` なし）の合計と、`badgeClass(part.variant)` の内訳チップを並べる。チップの文言は `${label} ${count}`、`aria-label` は `次の${label}へ`（課題ツリーの現行と同じ）。**部品はモジュールの語彙を知らない**（`Badge` と同じ契約）。`Badge.tsx` / `badge-styles.ts` と同じく、部品ファイルは部品だけを export する（oxlint `react(only-export-components)` を 0 に保つ）。

**置き場は各モジュールのエディタの帯／ツールバー**（`FileHeader` には置かない）。ジャンプは編集状態を持つエディタの中で閉じるので配線が要らない。位置は「帯の中」で揃える:

| モジュール | 置き場 | ジャンプ |
| --- | --- | --- |
| 用語集 | ツールバー（`GlossaryEditor.tsx:203-239`）の `N / M 件` の隣 | 次の欠落セルへフォーカス（`kind` ごと。末尾で先頭へ戻る） |
| エラーカタログ | ツールバー（`ErrorCatalogEditor.tsx:307-345`。いまは件数すら無い） | 同上 |
| ロジックツリー | 帯（`LogicTreeEditor.tsx:290-312`。「ノードを追加」と `KeyHints` の間） | 次の未記入ノードを選択 |
| シーケンス | 帯（いまの `SequenceEditor.tsx:880-885` の文字列の位置） | 次の未回答スロット／未記入セルへフォーカス |
| 課題ツリー | 帯（`IssueTreeEditor.tsx:872-929`。現行の合計＋チップを部品に置き換え） | 現行の `goToNextOpen` |

ジャンプの「次」は現在のフォーカス位置から配列順で次（課題ツリーの `nextOpenTarget` の `(at+1)%n` と同じ）。**フィルタで隠れている行には飛ばない**（用語集・エラーカタログ。表示中の行の中で巡る）。

**シーケンスの帯は補足を残す。** 回答済・考慮不要は欠落ではないが総量の把握に要るので、`MissingTally` の右に `ink-muted` の文字で `回答済 N ／ 考慮不要 N` を出す（チップではない。押せない）。**`.claude/skills/sequence-register/scripts/sequence-write.mjs:239` と `SKILL.md:171` の報告文も同じ形に揃える**（`⚠ 要対応 N（未回答 x ／ 未記入 y）` と `回答済 N ／ 考慮不要 N`）——Skill は `src/` を import できない（プロジェクトフォルダへコピーされる）ので文字列は手書きだが、**スモークテストで app 側の `tallyLine` と逐語一致を固定する**（課題ツリーの `skill-write.smoke.test.ts` と同じ形）。

## 決定4: 行番号で指し、重複は件数で（D4・D5）

### 用語集に No 列を足す

エラーカタログの `columns.ts` の `'no'`（導出列。データ配列の index + 1。幅 56、右揃え、`text-ink-muted`、編集対象ではない）の写し。**行全体の指摘の錨（`rowAnchor`）を名称セルから No セルへ移す**（エラーカタログと同じ）。Markdown 出力には No 列を足さない（用語集の出力仕様は `docs/glossary/scope.md` で確定済み。触らない）。

### `src/core/row-ref.ts`

```ts
export function rowRef(index: number): string   // '#' + (index + 1)。No 列の値と一致
```

シーケンスの `stepName()`（`consistency.ts:18-20`。既に `#3（ラベル）` の形）もこれを使う。

### メッセージの形

| ルール | 後 |
| --- | --- |
| 用語集 `duplicate-name` | `名称「X」が N 件重複しています（#2 ／ #5 ／ #7）` |
| 用語集 `duplicate-id` | `ID が重複しています（N件。#2 ／ #5）: term_…` |
| 用語集 `duplicate-alias` | `別名「Y」が N 件重複しています（#2 ／ #5）` |
| 用語集 `alias-name-collision` | `#3「X」の別名「Y」が #7「Z」の名称と衝突しています` |
| エラーカタログ `duplicate-name` / `duplicate-id` | 用語集と同じ形 |
| エラーカタログ `missing-action` | `#3「X」はユーザー対応としていますが、ユーザーの対応が空です` |
| シーケンス | 現行の `#N（ラベル）` を `rowRef` 経由に（文面は変えない） |

**ロジックツリー・課題ツリーのメッセージ（`（未記入・N番目）`）は触らない。** D4 は「行番号が存在するモジュールでは必ず行番号で」であり、キャンバスに番号は出ていない。

**D5（問題のあるセルだけを染める）は M21 で済んでいる**（行の帯を廃して `rowAnchor` に1つ）。本スペックでは No セルが錨になることで「行全体の指摘は No セルが赤」に揃う。

**バナーから該当行へのジャンプは含めない**（`IssueBanner` は App 側にあり、モジュールへの配線が要る）。`open-issues.md` に残す。

## 決定5: 課題ツリーの行に「未判断」バッジを出す

`pendingNotes` が空でない仮説行に、判断バッジ（支持／棄却／保留／未決／見送り）の隣へ **`pending` variant の「未判断」バッジを2つ目として**出す。集計と行が一対一になる（ヘッダの「未判断 N」を押して飛んだ先に、青いものが見える）。

**`src/modules/issue-tree/layout.ts` のバッジ列の幅を「判断バッジ＋未判断バッジ」の2語ぶんで測る。** 幅は測定層が決めるので、ここを触らないと2つ目が重なる（`layout.test.ts:89-106` が「仮説なし」の幅から最小幅を導いているのと同じ経路）。M21 の `BADGE_BOX_HEIGHT` / `BADGE_PADDING_X` / `BADGE_BORDER` を使う。

抑制（見送り配下）のときは現行どおり `faint`（`badgeVariantOf` が既に `suppressed` を受ける）。

## 決定6: シーケンスの「考慮不要」は語で示す

ガターの `notApplicable` スロットは、先頭の `─`（`GutterSlot.tsx:55-59`）を**「考慮不要」の語**に置き換える。`─` は rev 3章の遷移表の記法（「─ 何も起きない」）から来ているが、画面で記号だけだと初見の人に意図が伝わらない。面は付けない——答えスロットは判断軸ではない（支持／棄却ではない）ので `judge-yes` は借りず（規約1・3・4）、**決着は文字が運ぶ**: 回答済＝答えの本文、考慮不要＝固定語。

**`NOT_APPLICABLE_LABEL`（`output-labels.ts:14`）を `'─ 考慮不要'` → `'考慮不要'` に変え、画面・Markdown・`GhostSlot` の表示・Skill の報告を揃える。** `markdown.ts:44-52` の「`─` だけにすると問われていないセル（空）と境が潰れる」という理由は、語にすることでむしろ強く満たされる。

これで `open-issues.md` の「『回答済み』と『考慮不要』の区別が面の色ではなく文言に頼っている」（`[sequence-m1]`）は**「決めた」として消す**。

## 決定7: 文書

### `docs/missing-semantics.md`（新規。「欠落の規約」）

課題ツリーの実装の言語化。6条:

1. **欠落とは「まだ決めていない」の意思表示**で、データの空欄そのもの。判定源は `reading-guide.md` の「未決」と一対一。備考・別名・`rationale` は欠落ではない（決定1の表を載せる）
2. **空は空のまま描く。** 画面に「未定義」「別名なし」のような値を捏造しない。`placeholder` にも欠落の語を使わない。データに実在する値のラベル（「未分類」「考慮不要」「(無題)」）は可。出力（Markdown / Mermaid）だけは `（未定義）` を書く——出力先に面が無いため
3. **見せ方は rev 9章の欠落軸。** 表のセルは淡い面だけ、キャンバスのノード・スロット・参加者・参照ボタンは破線＋淡い面、バッジは線種で段を分ける（破線＝まだ見ていない／実線＝保留）。無効（赤）が勝つ
4. **必ずヘッダで集計する。** `MissingTally` 部品で「要対応 N ＋内訳チップ（押すと次へ）」。判定関数と集計関数は同じ `missing.ts` にあり、画面に面が付く箇所と数える箇所が一致する。抑制された配下（見送り）は数えない（2段構えは F）。着信（未判断）は欠落軸ではないが同じ帯で数え、行にもバッジを出す
5. **決着は文字が運ぶ**（シーケンスの答え）: 回答済＝本文、考慮不要＝固定語。判断軸の濃い面は支持／棄却に専有させる
6. **位置は行番号で指す**（`#N` ＝配列位置＋1 ＝ No 列）。重複は件数＋行番号。番号が画面に無いモジュール（キャンバス系）は名前で指す

### 既存文書

- `docs/README.md` の地図に `missing-semantics.md` の行を足す
- `docs/overview-rev.md` 9章の欠落軸の項に「どのデータが欠落か・集計・行番号の規約は `docs/missing-semantics.md`」の参照を1文足す。3章の「網羅性の担保はツールの仕事」の例示はそのまま
- `src/core/reading-guide.md` に決定1の2項を足す
- `docs/sequence/sequence-design-notes.md:172` の集計文字列の記述は記録として触らない（history に書く）
- `.claude/skills/sequence-register/SKILL.md:171` の報告形式を決定3の形に

## 実装の順序（計画で詳細化する）

1. コア: `missing-tally.ts`（型・`TALLY_TOTAL_LABEL`・`tallyLine`）／`row-ref.ts`／`MissingTally.tsx`／`derive.ts` の `toMissingTally` と一致テスト——**課題ツリーの帯を部品に置き換えて見え方・Skill 出力が不変**であることを先に固定する
2. 用語集: No 列・`missing.ts`・捏造文字列の除去・帯・D4 メッセージ
3. エラーカタログ: `missing.ts` 改名・placeholder 除去・帯・D4 メッセージ
4. ロジックツリー: `missing.ts`・`NodeBox` の欠落面・帯
5. シーケンス: `missing.ts`・参加者／ラベルの欠落面・placeholder 除去・考慮不要の語・帯・Skill の報告
6. 課題ツリー: 未判断バッジ・`layout.ts` の幅
7. 文書: `missing-semantics.md`・reading-guide・rev 9章・README・open-issues・history
8. 実機確認（人間。別タスク。申し送りにはチェックリストを空のまま写す）

各タスクの継ぎ目——**(1) は `derive.ts` に値 import を足さないこと（`skill-copy.test.ts` と Skill のスモークテストが門番）**、**(2) の No 列は `rowAnchor` の移動とセット**（列だけ足して錨を移さないと「行全体の指摘」が名称セルに残る）、**(6) の幅は測定層とセット**（バッジだけ足すと重なる）。

## 検証

- **門番になるテスト（赤くなる既存）**: `src/App.dom.test.tsx:636`（`DUP_MESSAGE` の逐語）／`src/modules/sequence/ActorRefCell.dom.test.tsx:43-48,136-142`（`（未定義）`）／`src/modules/sequence/SequenceEditor.dom.test.tsx:381`（`未定義 4`）／`markdown.test.ts` と `mermaid.test.ts` の `─ 考慮不要`（`derive.test.ts` の `tallyLine` は**変わらない**——`derive.ts` を動かさないため）。**シーケンスの `questions.ts` も Skill のバイト一致コピー（`src/modules/sequence/skill-copy.test.ts`）なので、`missing.ts` は `questions.ts` を import する側であって、`questions.ts` に値 import を足さない**
- **新規**: 各 `missing.ts` の単体（reading-guide の表の行ごとに1本。**区別したい2つの判定が同じ答えを返す入力を選ばない**——たとえば「主体でない対応欄が空」は欠落でない、を別の入力で見る）／`MissingTally.dom.test`（合計・チップ・`onJump` の有無で button/span）／`NodeBox` の欠落面と `invalid` の優先／用語集 No 列と `rowAnchor`／未判断バッジと幅／`tallyLine` と Skill 出力の逐語一致（課題ツリーは現行、シーケンスは新規）
- **機械検査**: `conventions.test.ts`・`palette.test.ts` は新しいクラス字面（`border-dashed border-missing bg-missing-face` を `ActorRefCell` / `NodeBox` / 参加者ヘッダに）を走査する。**`palette.test.ts` の束縛検査の母集合が部品を取りこぼさないか**を計画の着手前スキャンで確かめる（logic-tree M1 の教訓）
- **生成 CSS**: `border-dashed` は既に `GutterSlot` / `badge-styles` が使っているので載っている。新しいユーティリティは足さない
- **テストの件数は書かない。** 期待値は「各ファイルの `it` がすべて緑」
- **実機確認（人間）**: 用語集の空セルに語が無く面だけ／ロジックツリーの空ノードが破線＋黄／5モジュールの帯に `要対応` と内訳／チップで次へ飛ぶ／重複メッセージが `#N`／考慮不要が語で読める／未判断バッジが判断バッジと重ならない

## スコープ外（C では扱わない）

| | 内容 | 扱い |
| --- | --- | --- |
| B | タイポグラフィ | `open-issues.md` のまま |
| D | 行高固定＋省略、ノード幅固定 | 同上。未判断バッジで行のバッジが2語になるのは D3 の「揃わない」問題に触れるが、幅は測定層が引き受ける |
| E | フォント同梱 | 同上 |
| F | 見送り配下の未決の2段集計（D17）・`<select>` 置換・角丸 | 同上。`MissingTally` は `parts` の配列なので2段目を足す余地はある |
| — | バナーから該当行へのジャンプ | `open-issues.md` に足す |
| — | `invalid` の DOM テスト欠如（`[M21]`） | `NodeBox` と参加者ヘッダのテストを書くついでに「`invalid` が欠落に勝つ」を見るので一部は埋まる。`HypothesisRow` / `IssueBox` の赤枠は残る |
| — | 出力（Markdown / Mermaid）の `（未定義）` | 触らない（決定2） |
| — | ダークの値の吟味 | 触らない |
