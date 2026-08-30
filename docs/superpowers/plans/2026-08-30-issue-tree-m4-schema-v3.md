# 課題ツリー スキーマ v3 issue-tree-m4 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 課題ツリーのデータ構造を schemaVersion 2 → 3 へ上げる——仮説の文言を3つ（`title` / `detail` / `value`）に割り、「聞きたいこと」（`asks`）と属性を持つ FB（`feedbacks`）を持たせ、課題に「解決」の旗（`resolved`）を足し、イベントに日付（`date`）を持たせる。あわせて `rationale` と `promoteNote`（「根拠へ移す」）を廃止し、登録 Skill・お手本・配布ドキュメントを追随させる。

**Architecture:** 変えるのはデータの形と語彙であって、**芯（ミュータブルなステータスを持たず、イベント列の最新から導出する。D2）は1文字も変えない。** スキーマ（`schemas/issue-tree.schema.json`）が正で、そこから `npm run gen:types` が型を作り、`derive.ts` が導出を持ち、`commands.ts` が編集を持つ。画面（`layout.ts` / `HypothesisRow.tsx` / `IssueBox.tsx` / `IssueTreeEditor.tsx`）は**型が通る最小限の追随だけ**を行い、新しい欄の見せ方は次のマイルストーン（m5）が決める。登録 Skill はアプリと独立にスキーマと導出のコピーを持つので、同じ波の中で追随させる。

**Tech Stack:** React 19 / Tailwind v4（役割トークン）/ Radix DropdownMenu / Vitest（jsdom）/ json-schema-to-typescript / ajv 2020 / Node 22.18+（Skill の型ストリップ）

**Spec:**
- 本マイルストーンの入力（v2→v3 の差分・設計の理由）: [`docs/issue-tree/スキーマv3-引き継ぎ.md`](../../issue-tree/スキーマv3-引き継ぎ.md)（**本計画の worktree に取り込んである。** 原本は `worktree-issue-tree-m5-hypothesis-ui` ブランチにあり、`git show worktree-issue-tree-m5-hypothesis-ui:docs/issue-tree/スキーマv3-引き継ぎ.md` と**バイト一致**する）
- 設計の正: [`docs/issue-tree/仮説検証モジュール-設計ノート.md`](../../issue-tree/仮説検証モジュール-設計ノート.md)（D1〜D11。本計画の Task 12 で D2・D7・D9 を改め、D12 を足す）
- 見え方の正: デザインキャンバス <https://claude.ai/code/artifact/3f305a67-bd90-43ee-82dd-58946b498569>（**m5 の入力。本計画では読まない**——m4 は見た目を作らない）
- データ形式の正: [`schemas/issue-tree.schema.json`](../../../schemas/issue-tree.schema.json)
- 直前のマイルストーン: [`docs/history/issue-tree-m3-overview-ui.md`](../../history/issue-tree-m3-overview-ui.md)

---

## 前後のマイルストーン

| | | 状態 |
| --- | --- | --- |
| **issue-tree-m3** 俯瞰 UI と語彙 | [`2026-08-23-issue-tree-m3-overview-ui.md`](2026-08-23-issue-tree-m3-overview-ui.md) | 完了・マージ済み（`main` に入っている） |
| **issue-tree-m4** スキーマ v3 | 本計画 | |
| **issue-tree-m5** 仮説まわりの画面 | `worktree-issue-tree-m5-hypothesis-ui` にある | **本計画のマージを前提にしている**（型が変わらないと画面が書けない） |

**着手前に基底を確かめること**（教訓: worktree の基底が古いまま2マイルストーンぶんスキャンをやり直した前例がある）:

```bash
git log --oneline -1
# 820c0e1 Merge pull request #26 from Pryo-46/worktree-m28-claude-pane-handoff
# ↑ origin/main の先頭と一致すること。ズレていたら rebase してから始める
```

---

## 2026-08-30 に確定した論点（引き継ぎ書「決めてから実装すること」の答え）

引き継ぎ書は4つの論点をユーザーに確認せよと指示していた。**確認済みで、答えは以下のとおり。蒸し返さない。**

| 論点 | 決定 | 効き方 |
| --- | --- | --- |
| **移行** | **マイグレーションは考慮しない。** v1 → v2 の前例どおり「`schemaVersion` を書き換えるだけ／変換は用意しない」。v2 のファイルは移行後の検証で落ちる＝**開けない** | `migrate.ts` は版番号だけを書き換える。`rationale` の移行先という問題は**発生しない**（引き継ぎ書の論点1は消えた） |
| **`sentiment` の語彙** | **4語** `like` / `concern` / `question` / `note`。分類したくない発言の逃げ先として `note` を保つ | `feedback.sentiment` の `enum` は4語。アプリが作る FB の既定は `note`（m4 は選ばせる画面を持たない） |
| **`date` の空文字** | **許さない。** `^\d{4}-\d{2}-\d{2}$` だけ | アプリも Skill も**追記時に必ず日付を入れる**。画面は「日付が無い」場合分けを持たなくてよい（m5 が楽になる） |
| **FB待ちの数え方** | **空の問い（`asks[].text` が空）は数えない。** 数える単位は**問い（ask）1件**であり、仮説1件ではない | `＋ 聞きたいこと` を押した瞬間に要対応が増えない。`asks: [{text:""}]` → FB待ち 0 ／ `asks: [{text:"効くか?"}]` → FB待ち 1 |

---

## この計画が置いた決定（引き継ぎ書に無く、本計画が決めたこと）

引き継ぎ書が指定していない細部のうち、**実装者が勝手に決めると食い違うもの**をここで確定させる。実装中に「そこは別の形のほうが素直では」と思ったら、**辻褄を合わせずに「計画の矛盾」として報告すること**（下の Global Constraints「報告の規律」）。

**A. 日付はアプリが入れる。採番は `newId` と同じ形の依存注入にする。**
`src/core/today.ts` に `todayString(now: Date = new Date()): string` を新設し、`commands.ts` の追記系関数が**末尾の省略可能な引数**として受け取る（`newId(prefix, randomBytes = cryptoRandomBytes)` と同じ形）。**`commands.ts` の中で直に `new Date()` を呼ばない**——純関数のままでないとテストが日付に依存する。粒度は日、**ローカル時刻**（会議が行われた日であって UTC の日付ではない）。

**B. 「FB待ち」は問い（ask）単位で数える。行き先は仮説単位で出す。**
`HypothesisQuestions.feedback` は `boolean` ではなく **`number`**（その仮説で FB を待っている問いの件数）。集計（`tallyQuestions`）はこれを足す。
一方 `listOpenTargets`（「次の要対応へ」の巡回列）は、**FB待ちが1件以上ある仮説につき1つ**の行き先を出す——m4 には問い（ask）1件ずつを指せる DOM のセルが無いので、問いごとに行き先を作ると**同じ場所へ何度も飛ぶ巡回**になり、押しても視点が動かず巡回が止まる。**結果として、チップの数（問いの数）が巡回列の長さ（仮説の数）を上回りうる。** これは既存コード（`open-targets.ts`）が「壊れたファイルでは数と列がずれることがある」と書いている非対称の2例目であり、**m5 が問いに固有のセルを与えたときに解消する**。この非対称を `open-targets.ts` のコメントに明記し、テストで固定する。

**C. `detail` / `value` / `asks` の編集コマンドは m4 では作らない。**
スキーマ・型・導出・Skill・お手本はこれらを完全に扱うが、`commands.ts` に `setHypothesisDetail` / `setHypothesisValue` / `addAsk` などは**足さない**。m4 はそれらを出す画面を持たない（引き継ぎ書「出さないと決めた欄を、暫定の見た目で置かないこと」）ので、置いても呼び手のいない死んだコードになり、m5 が実際に必要とする形と一致する保証も無い。**m5 が画面と一緒に決める。**
**例外は `title` と `feedbacks[].text`**——旧 `text` / `pendingNotes[i]` の置き換えであり、m4 の画面がそのまま呼ぶ。

**D. 課題の旗（`deferred` / `resolved`）は1つの関数で入り切りする。**
`toggleDeferral` を `toggleIssueEvent(data, index, kind, today?)` に一般化する。規則は3つ:
1. 最新イベントの `kind` が引数の `kind` と**同じ** → 最新1件を消す（＝切る。v2 のトグルと同じ）
2. 最新イベントが**別の `kind`** → **最新1件を消してから足す**（旗の差し替え。列に2件並べない）
3. イベントが**無い** → 1件足す
**「いま見送っているか／解決しているか」を決める場所を1つに保つ**という v2 の理由（`toggleDeferral` の JSDoc）はそのまま生きる。

**E. m4 の画面は「解決」を*読める*が、*付けられる動線は増やさない*。**
- 課題の箱の旗のバッジ・理由欄のアクセシブル名は**イベントの `kind` から引く**（`ISSUE_EVENT_LABELS`）。`resolved` のファイルを開いて「見送り」と描くのは**嘘**なので、これは追随ではなく正しさの問題である
- 右上のトグルは、旗が**無い**課題では今までどおり「見送り」を付ける。旗が**ある**課題では**その旗を外す**（規則1）
- 帯の別枠に「解決 N」のチップが並ぶ（引き継ぎ書が明記しており、Skill の報告と逐語一致させる先でもある）。**チップは既存の「見送り N」と同じ部品を種別で回すだけ**で、新しい見た目を設計しない
- **`resolved` を新規に付けるボタンは足さない**（m5 の担当）

**F. アクセシブル名は、旗の種別では動かしてよい。押されているかでは動かさない。**
v2 のコメントは「アクセシブル名を状態で動かさない（入っているかは `aria-pressed` が運ぶ）」と書いている。**その規律は保つ**——変えるのは「何を入り切りするボタンか」の部分だけで、これは状態ではなく**対象**である。名前は `課題{N}の{ISSUE_EVENT_LABELS[kind]}`（旗が無ければ `見送り`）、`aria-pressed` は「旗があるか」。

**G. スキーマの `properties` 記載順＝正規形のキー順。仮説は `id, issueId, title, detail, value, asks, feedbacks, events`。**
引き継ぎ書の差分表の行順をそのまま採る。**v2 では `events` が `pendingNotes` より前だったので、v3 は順序も変わる**——v2 のファイルは開けない（移行しない）ので、この並び替えが既存ファイルに無意味 diff を生むことはない。

---

## Global Constraints（全タスクの要件に暗黙に含まれる）

### データ

- **ステータスのフィールドを作らない。** 現在の判断は `events` の最新から導出（D2）。`additionalProperties: false` が塞いでいる
- **仮説の `events` は追記専用。** 既存要素の書き換え・並べ替え・削除はしない。**根拠（`note`）を編集できるのは最新の1件だけ**（`setEventNote` / `setIssueEventNote` が同じ規則を持つ）
- **課題の `events` は 0 件か 1 件。** `deferred` と `resolved` は**排他**（両方同時に立ってはならない）。差し替えは「消してから足す」（決定D）
- **`feedbacks` は追加・削除できる。`events` はできない。** この非対称のために配列が2本ある。**1本に混ぜない**
- **全キー常在。** 欠損ではなく空の値（`""` / `[]`）で「未記入」を表す。**ただし `date` は例外で、空文字を許さない**（決定: 論点3）
- **ビュー状態（どの仮説が展開されているか）を JSON に書かない**（D8。座標を保存しないのと同じ）
- ID は `issue_` / `hypothesis_` / `ask_` ＋英数字62文字アルファベット10文字。**採番はアプリでは `commands.ts` の `newId` だけ、Skill では `scripts/new-id.mjs` だけ**
- **移行は版番号の書き換えだけ。値を動かす変換を書かない**（決定: 論点1）

### 表示（m4 の追随の限界）

- **`detail` / `value` / `asks` / `feedbacks[].by` / `feedbacks[].sentiment` / `feedbacks[].date` / `events[].date` を画面に出さない。** データとして入っていればよい。**暫定の見た目を置かないこと**——m5 がそれを剥がす手間と、剥がし忘れの両方が生まれる
- 新しい欄が v2 と同じ見た目の並びで出ていれば足りる（`title` を旧 `text` の位置に、`feedbacks[].text` を旧 `pendingNotes` の位置に）
- **色値を書かない。** 役割トークンだけ（`src/styles/conventions.test.ts` が直書きを弾く）
- **文字サイズは `text-xs` / `text-sm` / `text-base` / `text-lg` の4段だけ**（同上）
- **`opacity-*` で薄くしない**（検算したコントラストを割る）
- **測定と描画は同じ数字を見る。** `measure.ts` の定数と Tailwind クラスは対で直す
- **`data-cell` の文字列は `cell-keys.ts` だけが作る。** 部品でもエディタでも組み立て直さない
- **キーの判定はコアの `resolveCommand` に委ねる。** ツール側で `e.key` を見ない（rev 10章）
- アクセシブル名の前半（`課題{N}` / `仮説{N}`）は**動かさない**——DOM テストが前方一致で引く

### Skill との同期

- `src/modules/issue-tree/derive.ts` は `.claude/skills/issue-tree-register/scripts/derive.ts` へ**バイト一致コピー**される。`derive.ts` を触ったタスクは**同じタスクの中で `cp` する**。**手で書き写さない**
- `schemas/issue-tree.schema.json` も同じ（`.claude/skills/issue-tree-register/schemas/issue-tree.schema.json`。`src/core/skill-schema-copy.test.ts` が見る）
- `derive.ts` は**値 import・相対 import・`enum`・コンストラクタのパラメータプロパティを持たない**（Node の型ストリップでコピー側から読むため。`skill-copy.test.ts` が見る）。**新しい定数を `derive.ts` に足すときも同じ**
- **集計結果の文言はアプリと Skill で逐語一致**（rev 4章）。`skill-write.smoke.test.ts` が実際に `--check` を spawn して突き合わせる

### 検証（このマイルストーンだけの例外がある）

**原則は「対象を絞らない」**（教訓）。しかし本計画は**キー名が変わるスキーマ改訂**なので、Task 1 でスキーマと生成型を差し替えた瞬間に `src/modules/issue-tree/` のほぼ全ファイルが `tsc` で赤くなり、**Task 9 が終わるまで `npm test` も `npx tsc -b` も全件緑にはならない。** そこで:

- **Task 1 〜 Task 9 の各タスクのゲート**は次の2つ:
  1. **そのタスクが触ったテストファイルが緑**: `npx vitest run <path>`（vitest は型検査をしないので、他所が型で赤くてもそのファイルは走る）
  2. **`npx tsc -b 2>&1 | tail -40` を実行し、出力を報告に貼る。** 数字を数えるのではなく、**「まだ赤いファイルの一覧」が波の進捗として見えている**ことが目的。**自分が触ったファイルが赤いまま次へ進まない**
- **Task 10 以降は原則どおり全件**: `npm test && npx tsc -b && npm run lint`
- **Task 13（最終確認）で必ず全件を1回**回し、`(cd src-tauri && cargo test)` も回す
- **報告にはコマンドと出力の末尾を貼る**（教訓: 指示を書くだけでは「やっていない作業をやったと報告する」経路が塞がらない。出力を貼らせることで初めて塞がる）

### 報告の規律

- **ブリーフ（本計画）が正。ただし例外として、既存実装と一致すべきもの——文言・計上規則・ディレクトリ規約・出力の形——は実物が正。** 食い違いを見つけたら、辻褄を合わせず**「計画の矛盾」として報告する**
- **テストの件数は書かない。** 期待値は「このファイルの `it` がすべて緑」
- **`git diff --numstat` は NUL バイト混入の証明にならない。** ドキュメントを大きく書き換えるタスク（Task 11・Task 12）では、バイト単位の走査を1行加える:
  ```bash
  git diff --cached -U0 | grep -aPc $'\x00' || echo "NUL なし"
  ```

### やらないこと（このマイルストーンの範囲外）

- **画面の作り直し**——`detail` / `value` / `asks` / FB の属性の見せ方は **m5**
- **`detail` / `value` / `asks` の編集コマンド**（決定C）
- **`resolved` を新規に付ける動線**（決定E）
- **`evals/` の新設**（`open-issues.md` の既存項目 `[issue-tree-m2]`。据え置く）
- **`load.ts` の「整数でない `schemaVersion`」の穴**（`open-issues.md` `[issue-tree-m3]`。1行で塞がるが、本計画の主題ではない）
- **仮説を別の課題へ付け替える手段**（`open-issues.md` `[issue-tree-m1]`。据え置く）
- **Markdown 出力**（設計ノートの OUT）
- **`README.md` のスクリーンショット撮影**（`open-issues.md` `[issue-tree-m1]`。撮るのは人間）

---

## ファイル構成

| ファイル | 扱い | 責務 |
| --- | --- | --- |
| `schemas/issue-tree.schema.json` | 書き換え | **正。** `schemaVersion: 3`／`$defs` に `ask` `feedback` を新設／`deferralEvent` → `issueEvent`（`resolved` を足す）／仮説のキーを入れ替え |
| `src/types/issue-tree.ts` | 再生成 | `npm run gen:types`（**手で編集しない**。`.gitignore` 済み） |
| `src/modules/issue-tree/migrate.ts` | 変更 | 2 → 3 は `schemaVersion` の書き換えだけ。**変換は用意しない** |
| `src/modules/issue-tree/migrate.test.ts` | 書き換え | 版番号だけが変わること／v2 のファイルは移行後の検証で落ちること |
| `src/modules/issue-tree/schema.test.ts` | 書き換え | v3 の受け入れ／拒否の契約 |
| `src/modules/issue-tree/module.ts` | 変更 | `schemaVersion: 3`／`idPrefixes` に `ask`／`createEmpty` |
| `src/modules/issue-tree/module.test.ts` | 変更 | 同上 |
| `src/core/today.ts` | **新規** | `todayString()`（ローカル日付 `YYYY-MM-DD`） |
| `src/core/today.test.ts` | **新規** | 桁揃え・ローカル時刻・注入 |
| `src/modules/issue-tree/derive.ts` | 変更 | 課題の旗2種／問い4種（「未判断」→「FB待ち」）／集計と別枠の文言 |
| `src/modules/issue-tree/derive.test.ts` | 変更 | 同上 |
| `src/modules/issue-tree/commands.ts` | 変更 | `title` / `feedbacks` / `toggleIssueEvent` / 日付の刻印。**`promoteNote` と `setRationale` を削除** |
| `src/modules/issue-tree/commands.test.ts` | 変更 | 同上 |
| `src/modules/issue-tree/consistency.ts` | 変更 | `h.text` → `h.title`（文言は変えない） |
| `src/modules/issue-tree/consistency.test.ts` | 変更 | フィクスチャを v3 へ |
| `src/modules/issue-tree/open-targets.ts` | 変更 | `judgement` → `feedback`。数と列の非対称を明記 |
| `src/modules/issue-tree/open-targets.test.ts` | 変更 | 同上 |
| `src/modules/issue-tree/cell-keys.ts` | 変更 | `rationale` を落とし、`deferral` → `issueEvent` |
| `src/modules/issue-tree/layout.ts` | 変更 | 「由来」節を落とす／`IssuePlacement.deferral` → `event`／`judgementBadge` → `feedbackBadge` |
| `src/modules/issue-tree/layout.test.ts` | 変更 | 同上 |
| `src/modules/issue-tree/HypothesisRow.tsx` | 変更 | 由来欄と「根拠へ」ボタンを削除。`text` → `title` |
| `src/modules/issue-tree/HypothesisRow.dom.test.tsx` | 変更 | 同上 |
| `src/modules/issue-tree/IssueBox.tsx` | 変更 | 旗のラベルを `kind` から引く（`eventKind` prop） |
| `src/modules/issue-tree/IssueTreeEditor.tsx` | 変更 | 新しいコマンドへの配線／「解決 N」のチップ／`promoteNote` の経路を削除 |
| `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx` | 変更 | 同上 |
| `src/modules/issue-tree/IssueTreeEdges.dom.test.tsx` | 変更 | フィクスチャを v3 へ（挙動は変わらない） |
| `src/core/load.test.ts` | 変更 | 偽モジュールの `schemaVersion` を 3 に合わせる |
| `.claude/skills/issue-tree-register/schemas/issue-tree.schema.json` | `cp` | バイト一致コピー |
| `.claude/skills/issue-tree-register/scripts/derive.ts` | `cp` | バイト一致コピー |
| `.claude/skills/issue-tree-register/scripts/issue-tree-write.mjs` | 変更 | 整合性の文言追随（`h.title`）／集計の内訳／別枠2種 |
| `.claude/skills/issue-tree-register/scripts/new-id.mjs` | 変更 | `--prefix ask` を許す |
| `.claude/skills/issue-tree-register/SKILL.md` | 書き換え | `schemaVersion 3`／新しいキー／ヒアリングに「聞きたいこと」「誰の発言か」 |
| `src/modules/issue-tree/skill-write.smoke.test.ts` | 変更 | フィクスチャを v3 へ／別枠2種の逐語一致 |
| `sample-project/課題ツリー.json` | 書き直し | お手本を v3 へ（`asks` / `feedbacks` / `resolved` の実例を含む） |
| `src/core/reading-guide.md` | 変更 | 配布物 `README-for-AI.md` の原本（ID 接頭辞・問い4種・キー） |
| `README.md` | 変更 | お手本の説明（要対応の内訳が変わる） |
| `docs/issue-tree/仮説検証モジュール-設計ノート.md` | 変更 | D2・D7・D9 を改め、D12（解決の旗）を足す |
| `docs/history/issue-tree-m4-schema-v3.md` | **新規** | 申し送り |
| `docs/open-issues.md` / `docs/overview-rev.md` / `docs/README.md` | 変更 | Task 12 |

---

### Task 1: スキーマ v3 と生成型

**Files:**
- Modify: `schemas/issue-tree.schema.json`（全面書き換え）
- Modify: `.claude/skills/issue-tree-register/schemas/issue-tree.schema.json`（`cp`）
- Test: `src/modules/issue-tree/schema.test.ts`（書き換え）

**Interfaces:**
- Consumes: なし（この波の最初のタスク）
- Produces: `npm run gen:types` が `src/types/issue-tree.ts` に次を生成する。**以後のタスクはこの名前で書く**:
  - `IssueTreeSchemaVersion3` — `{ schemaVersion: 3; type: "issueTree"; title: string; issues: IssueNode[]; hypotheses: Hypothesis[] }`
  - `IssueNode` — `{ id: string; parentId: string | null; text: string; events: IssueEvent[] }`
  - `IssueEvent` — `{ kind: "deferred" | "resolved"; note: string; date: string }`
  - `Hypothesis` — `{ id: string; issueId: string; title: string; detail: string; value: string; asks: Ask[]; feedbacks: Feedback[]; events: JudgementEvent[] }`
  - `Ask` — `{ id: string; text: string }`
  - `Feedback` — `{ askId: string | null; text: string; by: string; sentiment: "like" | "concern" | "question" | "note"; date: string }`
  - `JudgementEvent` — `{ kind: "supported" | "rejected" | "onHold" | "deferred"; note: string; date: string }`

**型名の出どころ**（`json-schema-to-typescript` の挙動。v2 で実際にこうなっている）: トップの名前はスキーマの `title` から、`$defs` の各型の名前は**キー名**から作られる。だから `title` を「課題ツリー (issueTree) schemaVersion 3」に変えると `IssueTreeSchemaVersion3` になり、`$defs` の `deferralEvent` を `issueEvent` に改名すると `IssueEvent` になる。**生成結果は Step 5 で実物を開いて確かめること**——この一覧と違っていたら計画の誤りとして報告する。

- [ ] **Step 1: 失敗するテストを書く（`schema.test.ts` を v3 の契約で書き直す）**

`src/modules/issue-tree/schema.test.ts` を丸ごと次で置き換える。

```ts
import { describe, expect, it } from 'vitest'
import type { JsonSchema } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import issueTreeSchema from '../../../schemas/issue-tree.schema.json'

const validate = createSchemaValidator(issueTreeSchema as JsonSchema)

const ISSUE_A = 'issue_aB3xY9kLm2'
const ISSUE_B = 'issue_Qw7zR1nP4t'
const HYP_A = 'hypothesis_Kd4hR6yU1c'
const ASK_A = 'ask_Zx8vN2bM6q'

const base = {
  schemaVersion: 3,
  type: 'issueTree',
  title: '適性検査サービス連携PoC',
  issues: [
    { id: ISSUE_A, parentId: null, text: '適性検査サービス連携（PoCテーマ）', events: [] },
    { id: ISSUE_B, parentId: ISSUE_A, text: '結果取得を画面遷移の中で待てるか', events: [] },
  ],
  hypotheses: [
    {
      id: HYP_A,
      issueId: ISSUE_B,
      title: 'webhook受信＋非同期表示に切り替える',
      detail: '受信を待たずに画面を返し、届いた時点で結果欄を差し替える',
      value: '応募者を待たせずに済み、離脱が減る',
      asks: [{ id: ASK_A, text: '待ち画面のまま離脱しないか' }],
      feedbacks: [
        { askId: ASK_A, text: '待ち表示があるなら離脱はしない', by: '採用担当', sentiment: 'like', date: '2026-08-30' },
      ],
      events: [{ kind: 'supported', note: 'スパイクで受信まで中央値4.2秒（n=50）', date: '2026-08-30' }],
    },
  ],
}

describe('issueTree のスキーマ検証（レベル1）', () => {
  it('最小の正しいファイルを受け入れる', () => {
    expect(validate(base).ok).toBe(true)
  })

  it('課題0件・仮説0件（新規作成直後）を受け入れる', () => {
    expect(validate({ ...base, issues: [], hypotheses: [] }).ok).toBe(true)
  })

  it('空の文言・空の詳細・空の価値・問い0件・FB0件を受け入れる', () => {
    // 追加した直後の状態がそのまま自動保存されうる。ここを弾くと
    // 打ち終わる前の保存が「自分で作った開けないファイル」になる
    const issues = [{ id: ISSUE_A, parentId: null, text: '', events: [] }]
    const hypotheses = [
      { id: HYP_A, issueId: ISSUE_A, title: '', detail: '', value: '', asks: [], feedbacks: [], events: [] },
    ]
    expect(validate({ ...base, issues, hypotheses }).ok).toBe(true)
  })

  it('問いの文言が空でも受け入れる（「＋ 聞きたいこと」を押した直後の状態）', () => {
    const h = { ...base.hypotheses[0], asks: [{ id: ASK_A, text: '' }], feedbacks: [] }
    expect(validate({ ...base, hypotheses: [h] }).ok).toBe(true)
  })

  it('どの問いにも紐づかない FB（askId: null）を受け入れる', () => {
    // 用意した問いの外から来る指摘こそ重い。紐づけを強制しない
    const h = {
      ...base.hypotheses[0],
      asks: [],
      feedbacks: [{ askId: null, text: '表示が遅い気がする', by: '', sentiment: 'concern', date: '2026-08-30' }],
    }
    expect(validate({ ...base, hypotheses: [h] }).ok).toBe(true)
  })

  it('sentiment の4語をすべて受け入れ、未知の語を拒否する', () => {
    for (const sentiment of ['like', 'concern', 'question', 'note']) {
      const h = {
        ...base.hypotheses[0],
        asks: [],
        feedbacks: [{ askId: null, text: 'x', by: '', sentiment, date: '2026-08-30' }],
      }
      expect(validate({ ...base, hypotheses: [h] }).ok, sentiment).toBe(true)
    }
    const bad = {
      ...base.hypotheses[0],
      asks: [],
      feedbacks: [{ askId: null, text: 'x', by: '', sentiment: 'praise', date: '2026-08-30' }],
    }
    expect(validate({ ...base, hypotheses: [bad] }).ok).toBe(false)
  })

  it('date は空文字を許さない（アプリと Skill が追記時に必ず入れる）', () => {
    const emptyEventDate = { ...base.hypotheses[0], events: [{ kind: 'supported', note: '', date: '' }] }
    expect(validate({ ...base, hypotheses: [emptyEventDate] }).ok).toBe(false)

    const emptyFeedbackDate = {
      ...base.hypotheses[0],
      asks: [],
      feedbacks: [{ askId: null, text: 'x', by: '', sentiment: 'note', date: '' }],
    }
    expect(validate({ ...base, hypotheses: [emptyFeedbackDate] }).ok).toBe(false)

    const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [{ kind: 'deferred', note: '', date: '' }] }]
    expect(validate({ ...base, issues, hypotheses: [] }).ok).toBe(false)
  })

  it('date の形が YYYY-MM-DD でないものを拒否する', () => {
    for (const date of ['2026-8-30', '26-08-30', '2026/08/30', '2026-08-30T12:00:00Z']) {
      const h = { ...base.hypotheses[0], events: [{ kind: 'supported', note: '', date }] }
      expect(validate({ ...base, hypotheses: [h] }).ok, date).toBe(false)
    }
  })

  it('イベントの note が空文字でも受け入れる（date は必須のまま）', () => {
    const h = { ...base.hypotheses[0], events: [{ kind: 'deferred', note: '', date: '2026-08-30' }] }
    expect(validate({ ...base, hypotheses: [h] }).ok).toBe(true)
  })

  it('課題ノードに見送り・解決のイベントを付けたものは受け入れる', () => {
    for (const kind of ['deferred', 'resolved']) {
      const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [{ kind, note: '理由', date: '2026-08-30' }] }]
      expect(validate({ ...base, issues, hypotheses: [] }).ok, kind).toBe(true)
    }
  })

  it('課題ノードに支持・棄却・保留のイベントを付けたものを拒否する', () => {
    // 課題は「支持・棄却を判定される主張」ではない。付けられるのは旗2種だけ
    for (const kind of ['supported', 'rejected', 'onHold']) {
      const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [{ kind, note: '', date: '2026-08-30' }] }]
      expect(validate({ ...base, issues, hypotheses: [] }).ok, kind).toBe(false)
    }
  })

  it('仮説の判断イベント種別4つをすべて受け入れ、resolved は拒否する', () => {
    for (const kind of ['supported', 'rejected', 'onHold', 'deferred']) {
      const h = { ...base.hypotheses[0], events: [{ kind, note: '', date: '2026-08-30' }] }
      expect(validate({ ...base, hypotheses: [h] }).ok, kind).toBe(true)
    }
    // 「解決」は課題の旗であって、仮説の判断ではない
    const resolved = { ...base.hypotheses[0], events: [{ kind: 'resolved', note: '', date: '2026-08-30' }] }
    expect(validate({ ...base, hypotheses: [resolved] }).ok).toBe(false)
  })

  /**
   * v2 のファイルは移行しないと決めた（2026-08-30 のユーザー判断）。migrate は
   * schemaVersion を 3 に書き換えるだけなので、v2 の形はここで落ちる＝開けない。
   * **これがその決定を固定する契約である。** 読み替えを足すと「もう無いキー」が
   * データの中に別の顔で生き残る
   */
  it('v2 の形（text / rationale / pendingNotes・date 無しのイベント）を拒否する', () => {
    const v2Hypothesis = {
      id: HYP_A,
      issueId: ISSUE_B,
      text: '仮説',
      rationale: '由来',
      events: [{ kind: 'supported', note: '' }],
      pendingNotes: ['SH の指摘'],
    }
    expect(validate({ ...base, hypotheses: [v2Hypothesis] }).ok).toBe(false)
    const v2Issue = { id: ISSUE_A, parentId: null, text: 'x', events: [{ kind: 'deferred', note: '' }] }
    expect(validate({ ...base, issues: [v2Issue], hypotheses: [] }).ok).toBe(false)
  })

  it('schemaVersion 2 はレベル1で弾く（移行は load.ts の仕事。スキーマは現行版しか受けない）', () => {
    expect(validate({ ...base, schemaVersion: 2 }).ok).toBe(false)
  })

  it('未知のイベント種別を拒否する（enum の拡張は schemaVersion の改訂）', () => {
    const h = { ...base.hypotheses[0], events: [{ kind: 'memo', note: 'x', date: '2026-08-30' }] }
    expect(validate({ ...base, hypotheses: [h] }).ok).toBe(false)
  })

  it('ID のプレフィクス・長さが違うものを拒否する', () => {
    const wrongPrefix = [{ id: 'node_aB3xY9kLm2', parentId: null, text: 'x', events: [] }]
    expect(validate({ ...base, issues: wrongPrefix, hypotheses: [] }).ok).toBe(false)
    const wrongLength = [{ id: 'issue_aB3xY9kLm', parentId: null, text: 'x', events: [] }]
    expect(validate({ ...base, issues: wrongLength, hypotheses: [] }).ok).toBe(false)
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], id: 'issue_aB3xY9kLm2' }] }).ok).toBe(false)
    const badAsk = { ...base.hypotheses[0], asks: [{ id: 'hypothesis_Zx8vN2bM6q', text: 'x' }], feedbacks: [] }
    expect(validate({ ...base, hypotheses: [badAsk] }).ok).toBe(false)
    const badAskRef = {
      ...base.hypotheses[0],
      asks: [],
      feedbacks: [{ askId: 'issue_Zx8vN2bM6q', text: 'x', by: '', sentiment: 'note', date: '2026-08-30' }],
    }
    expect(validate({ ...base, hypotheses: [badAskRef] }).ok).toBe(false)
  })

  it('未知のキーを拒否する（座標をデータに入れる経路を塞ぐ）', () => {
    const issues = [{ id: ISSUE_A, parentId: null, text: 'x', events: [], x: 10 }]
    expect(validate({ ...base, issues, hypotheses: [] }).ok).toBe(false)
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], status: 'supported' }] }).ok).toBe(false)
    // 廃止した rationale が「ついでに」戻ってこないこと
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], rationale: '由来' }] }).ok).toBe(false)
  })

  it('キーの欠損を拒否する（全キー常在）', () => {
    const noEvents = [{ id: ISSUE_A, parentId: null, text: 'x' }]
    expect(validate({ ...base, issues: noEvents, hypotheses: [] }).ok).toBe(false)
    for (const key of ['title', 'detail', 'value', 'asks', 'feedbacks', 'events'] as const) {
      // 計算キーの分割代入（`const { [key]: _d, ...rest }`）は、`key` がユニオン型の
      // とき TS が rest 型を解決できないことがある。**通らなければリテラルキーの
      // 列挙に落としてよい**（`it` の主張——6キーそれぞれの欠損を拒否する——は変えない）
      const without: Record<string, unknown> = { ...base.hypotheses[0] }
      delete without[key]
      expect(validate({ ...base, hypotheses: [without] }).ok, key).toBe(false)
    }
    const { by: _by, ...feedbackWithoutBy } = base.hypotheses[0].feedbacks[0]
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], feedbacks: [feedbackWithoutBy] }] }).ok).toBe(false)
    const { text: _t, ...askWithoutText } = base.hypotheses[0].asks[0]
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], asks: [askWithoutText] }] }).ok).toBe(false)
  })

  it('循環・多重ルート・参照切れのファイルはスキーマ検証を通る（レベル2の担当）', () => {
    // 「拒否は解釈不能な場合に限る」（rev 5章）。構造は読めるので開ける
    const cyclic = [
      { id: ISSUE_A, parentId: ISSUE_B, text: 'a', events: [] },
      { id: ISSUE_B, parentId: ISSUE_A, text: 'b', events: [] },
    ]
    expect(validate({ ...base, issues: cyclic, hypotheses: [] }).ok).toBe(true)
    expect(validate({ ...base, hypotheses: [{ ...base.hypotheses[0], issueId: 'issue_ZZZZZZZZZZ' }] }).ok).toBe(true)
    // 存在しない ask を指す FB も通る（レベル2でも今は見ない。open-issues に足す）
    const danglingAsk = {
      ...base.hypotheses[0],
      asks: [],
      feedbacks: [{ askId: ASK_A, text: 'x', by: '', sentiment: 'note', date: '2026-08-30' }],
    }
    expect(validate({ ...base, hypotheses: [danglingAsk] }).ok).toBe(true)
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/modules/issue-tree/schema.test.ts
```

期待: FAIL（スキーマはまだ v2 なので `schemaVersion: 3` が `const: 2` に落ち、ほぼ全件が赤くなる）。

- [ ] **Step 3: スキーマを v3 に書き換える**

`schemas/issue-tree.schema.json` を丸ごと次で置き換える。**`properties` の記載順が正規形のキー順である**（`src/core/canonical.ts` の `serialize` が実行時にここから導く）。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "issue-tree.schema.json",
  "title": "課題ツリー (issueTree) schemaVersion 3",
  "description": "仕様整理ツール詰め合わせの課題ツリーファイル。PoCで「試さないと分からないこと」を課題として分解し、仮説・聞きたいこと・FB・判断の履歴を持つ。1ファイル＝1本の木（単一ルート。根はPoCテーマ等、種類は制約しない）。仮説・課題のステータスはミュータブルな値として持たず、イベント列の最新から導出する（仮説の列は追記専用。課題の旗＝見送り／解決は入り切りするトグルで、戻すときに最新1件を消す）。問いの立ち方は導出で決まる：子を持たない課題に仮説が無い／仮説のイベントが0件／最新が onHold／文言のある問い（asks）に FB が0件、の4つが問いとして立つ。祖先課題の最新イベントが deferred または resolved のとき配下の問いは立たない（抑制は導出であり、子に値をコピーしない）。キーの正規順序は本スキーマの properties 記載順とする。",
  "type": "object",
  "properties": {
    "schemaVersion": {
      "description": "スキーマの版。issueTree は 3 が現行（2 → 3 は仮説の文言を title / detail / value に割り、聞きたいこと（asks）と属性つきFB（feedbacks）を持たせ、課題に解決（resolved）の旗と表示用の日付（date）を足した改訂。rationale と pendingNotes は廃止した。旧版はアプリが読み込み時に移行するが、移行は版番号を書き換えるだけで、旧い形のファイルは移行後の検証で弾かれる＝開けない。互換の変換は用意しない——読み替えを足すと、もう無いキーがデータの中に別の顔で生き残る）。アプリは検証前にこの値を読み、未知の新版は「一覧表示のみ・編集不可」として扱う。",
      "const": 3
    },
    "type": {
      "description": "ツール種別。課題ツリーは issueTree 固定。",
      "const": "issueTree"
    },
    "title": {
      "description": "表示名。プロジェクトのファイル一覧に使う。",
      "type": "string"
    },
    "issues": {
      "description": "課題ノードの配列。親子関係は parentId が持ち、配列順は兄弟順の正。アプリは編集のたびに配列を DFS 行きがけ順へ整える（ロジックツリーと同じ規約）。",
      "type": "array",
      "items": { "$ref": "#/$defs/issueNode" }
    },
    "hypotheses": {
      "description": "仮説の配列。issueId でぶら下がり先の課題を指す。どの課題（中間・葉を問わず）にも付けられるが、問いが立つのは葉の課題だけ（折衷案）。配列順は同じ課題にぶら下がる仮説どうしの表示順の正。",
      "type": "array",
      "items": { "$ref": "#/$defs/hypothesis" }
    }
  },
  "required": ["schemaVersion", "type", "title", "issues", "hypotheses"],
  "additionalProperties": false,
  "$defs": {
    "issueNode": {
      "description": "課題ノード1件。全キー常在（欠損でなく空の値で「未記入」を表現する。ただし date は空文字を許さない）。課題＝観測された事実や望む状態とのギャップであり、支持・棄却を判定される主張（＝仮説）ではない。そのため events に付けられるのは旗（見送り・解決）だけに限る（支持・棄却・保留は仮説にしか付かない）。",
      "type": "object",
      "properties": {
        "id": {
          "description": "不変ID。プレフィクス issue_ ＋ nanoid（英数字62文字カスタムアルファベット）10文字固定。連番禁止。",
          "type": "string",
          "pattern": "^issue_[A-Za-z0-9]{10}$"
        },
        "parentId": {
          "description": "親課題のID。ルートは null。単一ルート・循環なし・参照実在はスキーマでは表せないため、整合性検証（レベル2）で受け止める。",
          "type": ["string", "null"],
          "pattern": "^issue_[A-Za-z0-9]{10}$"
        },
        "text": {
          "description": "課題の文言。空文字＝「未記入」（追加直後の自動保存がレベル1違反ファイルを作らないため空を許す）。ユーザーが明示的に入れた改行（\\n）だけが文言の一部。表示上の折り返しはデータに持たない。",
          "type": "string"
        },
        "events": {
          "description": "課題ノードの旗の列。配列順＝時系列の正。付けられるのは deferred（見送り＝今回は追わない）と resolved（解決＝出てきたソリューションで解決できる。これ以上の検証は不要）で、2つは意味が逆なので同時に立ってはならない。1件でもあればこの課題の配下（子孫課題・ぶら下がる仮説）の問いは立たない——抑制は祖先を遡る導出で行い、子に値をコピーしない（親の旗を外したときに子が取り残される嘘データを作らないため）。旗は入り切りするトグルであり、アプリが書く列は 0 件か 1 件である：付けると1件足し、戻すと最新の1件を消す（解除を表す種別は無い）。旗を差し替えるとき（見送り → 解決）は前の1件を消してから足す——列に2件並べない。過去要素の書き換えはしない（理由を書けるのも最新1件だけ）。仮説の events と違って追記専用ではない点に注意——戻すと、一度掲げた事実とそのとき書いた理由は残らない。",
          "type": "array",
          "items": { "$ref": "#/$defs/issueEvent" }
        }
      },
      "required": ["id", "parentId", "text", "events"],
      "additionalProperties": false
    },
    "issueEvent": {
      "description": "課題ノードに立つ旗1件。判断イベントと同じ形（kind ＋ note ＋ date）で読める。",
      "type": "object",
      "properties": {
        "kind": {
          "description": "deferred＝見送り（今回は追わない。枝ごと落とす。次のPoC選定で拾い直すのか、本開発へ送ってPoC中は戻らないのかは kind では区別せず note に書く）／resolved＝解決（この課題は出てきたソリューションで解決できる＝これ以上の検証は不要）。**どちらも配下の問いを抑制するが、意味は逆である**——見送りは「追わない」、解決は「答えが出た」。導出ではなく人の表明であり、支持された仮説があることと課題が解決したことは別（支持＝主張が成り立つ、であって作ると決めたわけではない）。両方が同時に立つことは無い。",
          "enum": ["deferred", "resolved"]
        },
        "note": {
          "description": "理由。空文字を許す。",
          "type": "string"
        },
        "date": {
          "description": "表示用の日付（YYYY-MM-DD）。**手で打たせない。アプリと登録Skillが追記時に入れる**——手入力の欄にすると更新忘れで嘘をつく（ミュータブルなステータス欄を捨てたのと同じ理屈）。粒度は日で、厳密な時刻は Git 履歴が正。空文字は許さない。",
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
        }
      },
      "required": ["kind", "note", "date"],
      "additionalProperties": false
    },
    "hypothesis": {
      "description": "仮説1件。全キー常在（date を除き空の値を許す）。仮説＝支持・棄却を判定できる主張。現在ステータスは events の最新要素の kind から導出する（ミュータブルな状態フィールドを持たない）。events が空＝未決。deferred が最新でも、後から新イベントを追記すれば履歴を消さずに復活できる（永久確定をスキーマで強制しない）。",
      "type": "object",
      "properties": {
        "id": {
          "description": "不変ID。プレフィクス hypothesis_ ＋ nanoid（英数字62文字カスタムアルファベット）10文字固定。連番禁止。",
          "type": "string",
          "pattern": "^hypothesis_[A-Za-z0-9]{10}$"
        },
        "issueId": {
          "description": "ぶら下がり先の課題ID。参照実在は整合性検証（レベル2）が受け止める。",
          "type": "string",
          "pattern": "^issue_[A-Za-z0-9]{10}$"
        },
        "title": {
          "description": "ソリューション仮説のタイトル（何を作るか）。空文字＝「未記入」。検証イベントを付ける段階で「支持・棄却を判定できる文か」が自然に問われるため、入力時に課題との書き分けを強制しない。",
          "type": "string"
        },
        "detail": {
          "description": "ソリューション仮説の詳細（どう作るか）。空文字を許し、空でも warning にしない。",
          "type": "string"
        },
        "value": {
          "description": "価値仮説（なぜ効くと考えるか）。**title とは別の主張である**——「何を作るか」と「なぜ効くか」はレビューで問われるのも別々なので、1つの欄に畳まない。空文字を許し、空でも warning にしない。",
          "type": "string"
        },
        "asks": {
          "description": "聞きたいこと（レビューで何をもって支持・棄却を判定するか）の配列。0件可。仮説は「支持・棄却を判定できる主張」だと定義してあるので、判定の材料になる問いを先に書いておくと、それがそのまま反証条件になる。**文言のある問いに FB が1件も付いていなければ「FB待ち」が立つ**（文言が空の問いは数えない——追加した瞬間に要対応が増えるのを避ける）。",
          "type": "array",
          "items": { "$ref": "#/$defs/ask" }
        },
        "feedbacks": {
          "description": "レビューで出たFBの配列。**移動も昇格もせず、記録としてその場に残る**——判断の理由は人が自分の言葉で書くものであり、FBの文言をそのまま理由欄へ移す操作は分かりづらいわりに何も要約していない。**events と違って追加・削除できる**（打ち間違いが残るのは実務的でない）。この非対称のために配列が2本に分かれている——1本に混ぜると「追記専用」を配列単位で言えなくなる。**id を持たない**：削除と並びは添字で足りる（参照の必要が観察されるまで id を足さないのは、判断イベントが id を持たない理由と同じ）。",
          "type": "array",
          "items": { "$ref": "#/$defs/feedback" }
        },
        "events": {
          "description": "追記専用の判断イベント列。配列順＝時系列の正（追記のみ。過去要素の書き換え・削除はしない）。「今回も見送り・理由も同じ」なら何も追記しない（最新が引き続き有効）。見送り回数などの集計はこの列から導出でき、別フィールドを持たない。",
          "type": "array",
          "items": { "$ref": "#/$defs/judgementEvent" }
        }
      },
      "required": ["id", "issueId", "title", "detail", "value", "asks", "feedbacks", "events"],
      "additionalProperties": false
    },
    "ask": {
      "description": "聞きたいこと1件。**id を持つのは feedbacks から指されるためである**（Feedback が id を持たないのと対照的で、参照される側だけが id を要る）。",
      "type": "object",
      "properties": {
        "id": {
          "description": "不変ID。プレフィクス ask_ ＋ nanoid（英数字62文字カスタムアルファベット）10文字固定。連番禁止。",
          "type": "string",
          "pattern": "^ask_[A-Za-z0-9]{10}$"
        },
        "text": {
          "description": "問いの文言。空文字＝「未記入」。**空の問いには FB待ちが立たない**（導出。derive.ts）。",
          "type": "string"
        }
      },
      "required": ["id", "text"],
      "additionalProperties": false
    },
    "feedback": {
      "description": "FB1件。誰が・いつ・どういう調子で言ったかを持つ——判断の根拠を人が書くとき、SHの発言だったのか雑談だったのかが後から区別できる必要がある。",
      "type": "object",
      "properties": {
        "askId": {
          "description": "どの問いへの答えか（asks の id）。**null ＝どの問いにも紐づかない。** 用意した問いの外から来る指摘こそ重いので、紐づけを強制しない。存在しない ask を指していてもファイルは開ける（整合性検証も今は見ない）。",
          "type": ["string", "null"],
          "pattern": "^ask_[A-Za-z0-9]{10}$"
        },
        "text": {
          "description": "FBの文言。空文字＝「未記入」（追加直後の自動保存のため）。",
          "type": "string"
        },
        "by": {
          "description": "誰の発言か。空文字を許す（会話に出ていなければ埋めるために推測しない）。",
          "type": "string"
        },
        "sentiment": {
          "description": "調子。like＝賛成／concern＝懸念／question＝質問／note＝ただのメモ（分類しない）。**note があるのは、分類したくない発言に嘘の分類を付けないためである**——画面のアイコンは前の3種だけで、note は無印。",
          "enum": ["like", "concern", "question", "note"]
        },
        "date": {
          "description": "表示用の日付（YYYY-MM-DD）。issueEvent.date と同じ規約——アプリと登録Skillが追記時に入れ、手で打たせない。空文字は許さない。",
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
        }
      },
      "required": ["askId", "text", "by", "sentiment", "date"],
      "additionalProperties": false
    },
    "judgementEvent": {
      "description": "仮説への判断イベント1件。kind が判断そのものであり、note は補助（空を許し warning にしない）。enum の増減（拡張も削除も）は schemaVersion の改訂として扱う。",
      "type": "object",
      "properties": {
        "kind": {
          "description": "判断の種類。supported＝支持（この仮説は成り立つ）／rejected＝棄却（成り立たない）／onHold＝保留（見たが判断できなかった。理由を note に書く。次のレビューで拾い直す）／deferred＝見送り（今回は追わない。次のPoC選定で拾い直すのか、本開発へ送ってPoC中は戻らないのかは kind では区別せず note に書く）。語彙はこの4つで尽きる——「検証したか／実験なしで決めたか」は kind では区別せず、note に書く（区別を持っても俯瞰の読みは変わらず、選ぶ側の迷いだけが増えた）。未決は kind ではなく events が0件であることから導出するので、ここには現れない。resolved は課題の旗であって、仮説には付かない。",
          "enum": ["supported", "rejected", "onHold", "deferred"]
        },
        "note": {
          "description": "根拠・理由。検証結果の実測値、経験知による理由、見送りの背景など。**人が自分の言葉で書く**（FBの文言を機械的に移す経路は持たない）。空文字を許す。",
          "type": "string"
        },
        "date": {
          "description": "表示用の日付（YYYY-MM-DD）。issueEvent.date と同じ規約。配列順が時系列の正であることは変わらず、これは会議中に前後が画面で見えるための表示用の値である（厳密な時刻は Git 履歴が正）。空文字は許さない。",
          "type": "string",
          "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
        }
      },
      "required": ["kind", "note", "date"],
      "additionalProperties": false
    }
  }
}
```

- [ ] **Step 4: Skill 側のスキーマコピーを更新する（`cp` する。手で書き写さない）**

```
cp schemas/issue-tree.schema.json .claude/skills/issue-tree-register/schemas/issue-tree.schema.json
```

- [ ] **Step 5: 型を再生成し、生成された名前を実物で確かめる**

```
npm run gen:types
```

続けて `src/types/issue-tree.ts` を開き、**上の Interfaces に列挙した7つの型名と形が実際に出ていること**を目で確かめる（`.gitignore` 済みの生成物なのでコミットには入らない）。違っていたら**計画の誤りとして報告する**——以後のタスクはこの名前で書かれている。

- [ ] **Step 6: テストが通ることを確認する**

```
npx vitest run src/modules/issue-tree/schema.test.ts src/core/skill-schema-copy.test.ts
```

期待: どちらも PASS（`skill-schema-copy.test.ts` は Step 4 の `cp` を見ている）。

続けて波の進捗を記録する:

```
npx tsc -b 2>&1 | tail -40
```

期待: `src/modules/issue-tree/` の多数のファイルが赤い（`text` / `rationale` / `pendingNotes` が消えたため）。**この出力を報告に貼る。** ここで赤いことは想定どおりであり、Task 9 までに消す。

- [ ] **Step 7: コミット**

```
git add schemas/issue-tree.schema.json .claude/skills/issue-tree-register/schemas/issue-tree.schema.json src/modules/issue-tree/schema.test.ts
git commit -m "feat(issue-tree): スキーマを v3 へ（title/detail/value・asks・feedbacks・resolved・date）"
```

---

### Task 2: 移行とモジュール登録

**Files:**
- Modify: `src/modules/issue-tree/migrate.ts`
- Modify: `src/modules/issue-tree/module.ts`
- Modify: `src/core/load.test.ts:56`（偽モジュールの `schemaVersion` と `migrate`）
- Test: `src/modules/issue-tree/migrate.test.ts`（書き換え）、`src/modules/issue-tree/module.test.ts`

**Interfaces:**
- Consumes: Task 1 の `IssueTreeSchemaVersion3`
- Produces:
  - `migrateIssueTree(data: unknown, fromVersion: number): IssueTreeSchemaVersion3`
  - `issueTreeModule`（`schemaVersion: 3`、`idPrefixes: ['issue', 'hypothesis', 'ask']`）

- [ ] **Step 1: 失敗するテストを書く（`migrate.test.ts` を書き換える）**

`src/modules/issue-tree/migrate.test.ts` を丸ごと次で置き換える。

```ts
import { describe, expect, it } from 'vitest'
import type { JsonSchema } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import issueTreeSchema from '../../../schemas/issue-tree.schema.json'
import { migrateIssueTree } from './migrate'

const validate = createSchemaValidator(issueTreeSchema as JsonSchema)

/** v2 の形（title/detail/value も asks も feedbacks も date も無い） */
const v2 = {
  schemaVersion: 2,
  type: 'issueTree',
  title: '旧版',
  issues: [{ id: 'issue_AAAAAAAAAA', parentId: null, text: '根', events: [] }],
  hypotheses: [
    {
      id: 'hypothesis_AAAAAAAAAA',
      issueId: 'issue_AAAAAAAAAA',
      text: '仮説',
      rationale: '由来',
      events: [{ kind: 'rejected', note: '一度棄却' }],
      pendingNotes: ['SH の指摘'],
    },
  ],
}

describe('migrateIssueTree', () => {
  it('2 → 3 は schemaVersion だけを書き換え、他のキーと配列順を保つ', () => {
    const out = migrateIssueTree(v2, 2)
    expect(out.schemaVersion).toBe(3)
    expect({ ...out, schemaVersion: 2 }).toEqual(v2)
  })

  it('1 → 3 も同じ（間の版を経由しない）', () => {
    const v1 = { ...v2, schemaVersion: 1 }
    expect(migrateIssueTree(v1, 1).schemaVersion).toBe(3)
  })

  it('現行版（3）を渡しても同じ内容が返る（冪等）', () => {
    const once = migrateIssueTree(v2, 2)
    expect(migrateIssueTree(once, 3)).toEqual(once)
  })

  it('入力を破壊しない', () => {
    const before = JSON.stringify(v2)
    migrateIssueTree(v2, 2)
    expect(JSON.stringify(v2)).toBe(before)
  })

  /**
   * **移行しないと決めた（2026-08-30 のユーザー判断）ことの実効を、ここで固定する。**
   * 版番号だけが上がった v2 のファイルはスキーマ検証で落ちる＝アプリは開けない。
   * この it が緑であるかぎり、「気を利かせて値を動かす変換」が後から入っても
   * ここが赤くなって気づける
   */
  it('移行しても v2 の形はスキーマ検証を通らない（＝開けない。互換の変換は用意しない）', () => {
    const out = migrateIssueTree(v2, 2)
    expect(validate(out).ok).toBe(false)
  })
})
```

- [ ] **Step 2: `module.test.ts` の期待値を v3 に合わせる**

`src/modules/issue-tree/module.test.ts:18` の1行を差し替える。

```ts
    expect([...issueTreeModule.idPrefixes]).toEqual(['issue', 'hypothesis', 'ask'])
```

同ファイルで `schemaVersion` を見ている行があればそれも 3 にする。**行番号ではなく実物を開いて確かめること**（`grep -n "schemaVersion\|idPrefixes" src/modules/issue-tree/module.test.ts`）。

- [ ] **Step 3: テストが落ちることを確認する**

```
npx vitest run src/modules/issue-tree/migrate.test.ts src/modules/issue-tree/module.test.ts
```

期待: FAIL（`migrate` はまだ 2 を書き、`idPrefixes` は2件）。

- [ ] **Step 4: `migrate.ts` を書き換える**

```ts
import type { IssueTreeSchemaVersion3 } from '@/types/issue-tree'

/**
 * 規約6: マイグレータ。**旧版 → 3 は `schemaVersion` の書き換えだけ**である。
 *
 * 3 は仮説の文言を3つに割り（`title` / `detail` / `value`）、聞きたいこと（`asks`）と
 * 属性つきFB（`feedbacks`）を足し、課題に解決の旗（`resolved`）と日付（`date`）を
 * 足した改訂で、`rationale` と `pendingNotes` を落とした。**だから 2 の正しい
 * ファイルが 3 でも正しいとは限らない**——版だけ上がって検証で落ちる＝開けない。
 *
 * **これは意図した結果で、変換は用意しない**（2026-08-30 のユーザー判断。
 * 1 → 2 のときと同じ扱いである）。ここでキーを読み替えると、廃止したキーが
 * データの中に別の顔で生き残る。`migrate.test.ts` の最後の it が、この決定を
 * 「移行後の検証が落ちること」として固定している。
 *
 * 移行後の検証は呼び出し側（`src/core/load.ts`）がやる。ここでは形を
 * 見ない（見ると、検証の規則が2箇所に生える）
 */
export function migrateIssueTree(data: unknown, fromVersion: number): IssueTreeSchemaVersion3 {
  if (fromVersion >= 3) return data as IssueTreeSchemaVersion3
  return { ...(data as Record<string, unknown>), schemaVersion: 3 } as IssueTreeSchemaVersion3
}
```

- [ ] **Step 5: `module.ts` を更新する**

3箇所を直す（型名・`schemaVersion` 2箇所・`idPrefixes`）。

```ts
import type { IssueTreeSchemaVersion3 } from '@/types/issue-tree'

export const issueTreeModule: ToolModule<IssueTreeSchemaVersion3> = {
  type: 'issueTree',
  displayName: '課題ツリー',
  icon: FlaskConical,
  schemaVersion: 3,
  schema: issueTreeSchema as JsonSchema,
  // プレフィクスはエンティティ単位（rev 5章）。ツール単位で1つに統一しない。
  // **ask は v3 で増えた3つ目**——聞きたいこと（asks）は feedbacks から
  // 指されるので id を持つ（判断イベントや FB は指されないので持たない）
  idPrefixes: ['issue', 'hypothesis', 'ask'],
  Editor: IssueTreeEditor,
  checkConsistency: checkIssueTreeConsistency,
  outputs: [],
  singleton: false,
  migrate: migrateIssueTree,
  createEmpty: (title) =>
    addRootIssue({ schemaVersion: 3, type: 'issueTree', title, issues: [], hypotheses: [] }).data,
}
```

- [ ] **Step 6: `src/core/load.test.ts` の偽モジュールを合わせる**

`makeMigratingRegistry()`（`src/core/load.test.ts:56` 付近）は**実物のスキーマを読む**ので、`schemaVersion` と `migrate` を 3 に揃えないと、そこの `it` が「移行後に検証が通る」を主張できなくなる。

```ts
    schemaVersion: 3,
    schema: issueTreeSchema,
    idPrefixes: ['issue', 'hypothesis', 'ask'],
    // 旧版 → 3 は schemaVersion の書き換えだけ（実物の migrateIssueTree と同じ形）
    migrate: (d, from) => (from < 3 ? { ...(d as Record<string, unknown>), schemaVersion: 3 } : d),
```

**そのファイルの旧版フィクスチャ（`schemaVersion: 1` 等の issueTree データ）も v3 の形に直す必要がある。** `migrate` は形を変えないので、**旧版として渡すデータ自体が v3 の形＋古い版番号**でなければ「移行後に editable になる」という主張が成立しない。実物を開き、`it` が何を主張しているかを読んでから直すこと。**主張が変わってしまうようなら、辻褄を合わせず報告する。**

- [ ] **Step 7: テストが通ることを確認する**

```
npx vitest run src/modules/issue-tree/migrate.test.ts src/modules/issue-tree/module.test.ts src/core/load.test.ts
```

期待: すべて PASS。

```
npx tsc -b 2>&1 | tail -40
```

期待: `migrate.ts` / `module.ts` / `load.test.ts` が赤の一覧から消えている（`derive.ts` 以下はまだ赤い）。**出力を報告に貼る。**

- [ ] **Step 8: コミット**

```
git add src/modules/issue-tree/migrate.ts src/modules/issue-tree/migrate.test.ts src/modules/issue-tree/module.ts src/modules/issue-tree/module.test.ts src/core/load.test.ts
git commit -m "feat(issue-tree): 移行を v3 へ（版番号の書き換えだけ。変換は用意しない）"
```

---

### Task 3: 日付の採番（`src/core/today.ts`）

**Files:**
- Create: `src/core/today.ts`
- Test: `src/core/today.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `todayString(now?: Date): string` — ローカル時刻の `YYYY-MM-DD`。**Task 5 の `commands.ts` が末尾の省略可能な引数の既定値として呼ぶ**

**なぜコアに置くか**: `commands.ts` はモジュール配下だが、「今日の日付を文字列にする」はツールに固有ではない（次のツールが日付を持ったとき2本目が生える）。`src/core/new-id.ts` が同じ位置づけで置かれており、**注入の形もそちらに揃える**（`newId(prefix, randomBytes = cryptoRandomBytes)`）。

- [ ] **Step 1: 失敗するテストを書く**

`src/core/today.test.ts` を新規作成する。

```ts
import { describe, expect, it } from 'vitest'
import { todayString } from './today'

describe('todayString', () => {
  it('ローカル時刻の年月日を YYYY-MM-DD で返す', () => {
    // ローカル時刻のコンストラクタで作る（UTC ではない）。
    // **UTC で作ると、実行環境の時差しだいで前日・翌日になり、
    // テストがマシンの設定で色を変える**
    expect(todayString(new Date(2026, 7, 30, 23, 59, 59))).toBe('2026-08-30')
  })

  it('月と日を2桁に揃える', () => {
    expect(todayString(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(todayString(new Date(2026, 11, 31))).toBe('2026-12-31')
  })

  it('日付が変わる境目でローカルの日を返す（UTC へ寄せない）', () => {
    // 00:00 ちょうどはその日である。UTC 変換を挟むと東側の時間帯で前日に落ちる
    expect(todayString(new Date(2026, 7, 30, 0, 0, 0))).toBe('2026-08-30')
  })

  it('引数を省略すると「いま」を返す（既定値の注入）', () => {
    const now = new Date()
    expect(todayString()).toBe(todayString(now))
  })
})
```

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/core/today.test.ts
```

期待: FAIL（`./today` が無い）。

- [ ] **Step 3: `src/core/today.ts` を作る**

```ts
/**
 * 表示用の日付（`YYYY-MM-DD`）。
 *
 * **課題ツリーの `date` は手で打たせない**——アプリと登録 Skill が追記時に入れる。
 * 手入力の欄にすると更新忘れで嘘をつく（ミュータブルなステータス欄を捨てたのと
 * 同じ理屈）。厳密な時刻は Git 履歴が正なので、粒度は日で足りる。
 *
 * **ローカル時刻で作る。** `toISOString()` は UTC へ寄せるので、東側の時間帯では
 * 夜に打った記録が翌日、西側では朝の記録が前日になる。会議が行われた日を
 * 書きたいのだから、書き手のローカルの日が正である。
 *
 * **引数で注入できるのは `src/core/new-id.ts` の `randomBytes` と同じ理由**
 *——呼ぶ側（`commands.ts`）を純関数のまま保ち、テストが「今日」に依存しないようにする
 */
export function todayString(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
```

- [ ] **Step 4: テストが通ることを確認する**

```
npx vitest run src/core/today.test.ts
```

期待: PASS。

- [ ] **Step 5: 番人が番をしていることを実証する（破壊テスト）**

`todayString` の `now.getMonth() + 1` を `now.getMonth()` に一時的に変えて `npx vitest run src/core/today.test.ts` が FAIL することを確認し、**戻して PASS することを確認する**。両方の出力を報告に貼る（M24 の前例。テストが実装を本当に押さえているかは、壊してみないと分からない）。

- [ ] **Step 6: コミット**

```
git add src/core/today.ts src/core/today.test.ts
git commit -m "feat(core): 表示用の日付を作る todayString（ローカル時刻・注入可能）"
```

---

### Task 4: 導出（`derive.ts`）——旗2種・問い4種・集計の文言

**Files:**
- Modify: `src/modules/issue-tree/derive.ts`
- Modify: `.claude/skills/issue-tree-register/scripts/derive.ts`（`cp`）
- Test: `src/modules/issue-tree/derive.test.ts`

**Interfaces:**
- Consumes: Task 1 の `IssueTreeSchemaVersion3` / `IssueNode` / `IssueEvent` / `Hypothesis` / `JudgementEvent`
- Produces（**以後のタスクはこの名前で書く**）:
  - `export type IssueEventKind = IssueEvent['kind']`（`'deferred' | 'resolved'`）
  - `export type IssueStatus = IssueEventKind | 'open'`
  - `export interface HypothesisQuestions { result: boolean; hold: boolean; feedback: number }`
  - `export interface IssueTreeTally { hypothesis: number; result: number; hold: number; feedback: number; total: number }`
  - `export const QUESTION_LABELS`（`hypothesis: '仮説なし'` / `result: '未決'` / `hold: '保留'` / `feedback: 'FB待ち'`）
  - `export const ISSUE_EVENT_LABELS: Record<IssueEventKind, string>`（`deferred: '見送り'` / `resolved: '解決'`）
  - `export const ISSUE_EVENT_NOTES: Record<IssueEventKind, string>`
  - `export function issueEventCount(issues, kind: IssueEventKind): number`
  - `export function issueEventLine(count: number, kind: IssueEventKind): string`
  - `export function awaitingAskCount(h: Pick<Hypothesis, 'asks' | 'feedbacks'>): number`
  - **消える**: `DeferralKind` / `ISSUE_DEFERRED_LABEL` / `DEFERRAL_NOTE` / `deferredIssueCount` / `deferralLine` / `HypothesisQuestions.judgement` / `QUESTION_LABELS.judgement`

**この Task が守る境界**: `latestKind` / `suppressedIssueIds` / `leafIssueIds` / `hypothesisStatus` / `badgeGroupOf` / `BADGE_LABELS` / `EVENT_KIND_LABELS` / `TALLY_TOTAL_LABEL` / `tallyLine` の**式は1つも変えない**。`suppressedIssueIds` は「最新イベントがあるか」しか見ておらず、旗が2種になっても**同じ問いのまま**である（`resolved` が抑制するのはこの性質の帰結であって、新しい分岐ではない）。

- [ ] **Step 1: 失敗するテストを書く（`derive.test.ts` を v3 に合わせる）**

既存の `derive.test.ts` に対して次を行う。**実物を開いて既存の `it` の主張を読んでから直すこと。**

1. 先頭のヘルパを v3 の形にする（`src/modules/issue-tree/derive.test.ts:38` 付近）:

```ts
function hypothesis(n: number, issueId: string, over: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: hid(n),
    issueId,
    title: `仮説${n}`,
    detail: '',
    value: '',
    asks: [],
    feedbacks: [],
    events: [],
    ...over,
  }
}
```

課題側のヘルパも `events` の要素に `date` が要る。**フィクスチャの日付は `'2026-08-30'` 固定**にする（`todayString()` を呼ぶと、テストが実行日で色を変える）。

2. 「`pendingNotes` が残っていれば『未判断』が立つ」の `it`（`:118`）を、**問い（ask）の件数で数える**形に置き換える:

```ts
const ASK_1 = 'ask_AAAAAAAAAA'
const ASK_2 = 'ask_BBBBBBBBBB'

it('文言のある問いに FB が1件も無ければ「FB待ち」が立ち、件数は問いの数で数える', () => {
  const h = hypothesis(1, id(2), {
    asks: [
      { id: ASK_1, text: '待ち画面で離脱しないか' },
      { id: ASK_2, text: 'レート制限に当たらないか' },
    ],
    feedbacks: [],
  })
  const posed = poseQuestions({ issues, hypotheses: [h] })
  // **2件。仮説単位の真偽ではない**——問い1件ずつが要対応である
  expect(posed.hypothesisQuestions[0].feedback).toBe(2)
})

it('FB が付いた問いは FB待ちから外れる（残りだけが数えられる）', () => {
  const h = hypothesis(1, id(2), {
    asks: [
      { id: ASK_1, text: '待ち画面で離脱しないか' },
      { id: ASK_2, text: 'レート制限に当たらないか' },
    ],
    feedbacks: [
      { askId: ASK_1, text: '離脱はしない', by: '採用担当', sentiment: 'like', date: '2026-08-30' },
    ],
  })
  const posed = poseQuestions({ issues, hypotheses: [h] })
  expect(posed.hypothesisQuestions[0].feedback).toBe(1)
})

it('文言が空の問いは数えない（「＋ 聞きたいこと」を押した瞬間に要対応が増えない）', () => {
  const h = hypothesis(1, id(2), { asks: [{ id: ASK_1, text: '' }], feedbacks: [] })
  const posed = poseQuestions({ issues, hypotheses: [h] })
  expect(posed.hypothesisQuestions[0].feedback).toBe(0)
})

it('どの問いにも紐づかない FB（askId: null）は、どの問いの FB待ちも解かない', () => {
  // **紐づけを強制しないことの裏返し。** 「何か言われた」ことは
  // 「用意した問いに答えが出た」ことではない
  const h = hypothesis(1, id(2), {
    asks: [{ id: ASK_1, text: '待ち画面で離脱しないか' }],
    feedbacks: [
      { askId: null, text: '表示が遅い気がする', by: '', sentiment: 'concern', date: '2026-08-30' },
    ],
  })
  const posed = poseQuestions({ issues, hypotheses: [h] })
  expect(posed.hypothesisQuestions[0].feedback).toBe(1)
})

it('存在しない問いを指す FB は、どの問いの FB待ちも解かない（壊れたファイル）', () => {
  const h = hypothesis(1, id(2), {
    asks: [{ id: ASK_1, text: '待ち画面で離脱しないか' }],
    feedbacks: [
      { askId: ASK_2, text: 'x', by: '', sentiment: 'note', date: '2026-08-30' },
    ],
  })
  const posed = poseQuestions({ issues, hypotheses: [h] })
  expect(posed.hypothesisQuestions[0].feedback).toBe(1)
})
```

3. 抑制の `it`（`:130` 付近の「抑制されていれば問いが立たない」）を、**FB待ちも 0 に落ちる**ことまで見る形にする。あわせて**解決の旗でも抑制されること**を足す:

```ts
it('祖先が見送りなら配下の問いは立たない（FB待ちも 0 に落ちる）', () => {
  const h = hypothesis(1, id(2), { asks: [{ id: ASK_1, text: '効くか' }], feedbacks: [] })
  const deferredIssues = issues.map((n, i) =>
    i === 0 ? { ...n, events: [{ kind: 'deferred' as const, note: '', date: '2026-08-30' }] } : n,
  )
  const posed = poseQuestions({ issues: deferredIssues, hypotheses: [h] })
  expect(posed.hypothesisQuestions[0]).toEqual({ result: false, hold: false, feedback: 0 })
  expect(posed.issueNeedsHypothesis.every((needs) => !needs)).toBe(true)
})

it('祖先が解決でも同じように抑制される（意味は逆だが、実効は同じ「配下を止める」）', () => {
  const h = hypothesis(1, id(2), { asks: [{ id: ASK_1, text: '効くか' }], feedbacks: [] })
  const resolvedIssues = issues.map((n, i) =>
    i === 0 ? { ...n, events: [{ kind: 'resolved' as const, note: '', date: '2026-08-30' }] } : n,
  )
  const posed = poseQuestions({ issues: resolvedIssues, hypotheses: [h] })
  expect(posed.hypothesisQuestions[0]).toEqual({ result: false, hold: false, feedback: 0 })
  expect(posed.issueNeedsHypothesis.every((needs) => !needs)).toBe(true)
})
```

4. 集計の `it`（`:145` 付近）を、`judgement` → `feedback` に置き換え、**FB待ちが問いの数で足し合わされる**ことを見る形にする。**「隣の実装と同じ答えになる入力」を避けるため、1つの仮説に問いを2件持たせ、仮説の数（1）と問いの数（2）を食い違わせること。**

5. 別枠の `it`（`deferredIssueCount` / `deferralLine`）を `issueEventCount` / `issueEventLine` に置き換え、**見送りと解決を別々に数える**ことを見る:

```ts
it('別枠は見送りと解決を別々に数える（配下の抑制は数えない）', () => {
  const flagged = [
    { ...issues[0] },
    { ...issues[1], events: [{ kind: 'deferred' as const, note: '', date: '2026-08-30' }] },
    { ...issues[2], events: [{ kind: 'resolved' as const, note: '', date: '2026-08-30' }] },
  ]
  expect(issueEventCount(flagged, 'deferred')).toBe(1)
  expect(issueEventCount(flagged, 'resolved')).toBe(1)
  expect(issueEventLine(1, 'deferred')).toBe('見送り 1')
  expect(issueEventLine(1, 'resolved')).toBe('解決 1')
})
```

6. `toMissingTally` の `it` を `feedback` の kind と `pending` の variant で見る形にする。

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/modules/issue-tree/derive.test.ts
```

期待: FAIL。

- [ ] **Step 3: `derive.ts` を書き換える**

**変える箇所は7つだけ。それ以外の関数・コメントは1文字も触らない。**

**(1) import と種別の別名**（ファイル冒頭）:

```ts
import type { MissingTally } from '@/core/missing-tally'
import type {
  Hypothesis,
  IssueEvent,
  IssueNode,
  IssueTreeSchemaVersion3,
  JudgementEvent,
} from '@/types/issue-tree'
```

```ts
/** 課題に立つ旗の種別。**見送りと解決は意味が逆だが、どちらも配下を抑制する** */
export type IssueEventKind = IssueEvent['kind']
export type JudgementKind = JudgementEvent['kind']

/** 仮説の現在ステータス。events が空＝未決 */
export type HypothesisStatus = JudgementKind | 'undecided'
/** 課題の現在ステータス。events が空＝旗が立っていない */
export type IssueStatus = IssueEventKind | 'open'
```

`IssueTreeSchemaVersion2` を参照している箇所（`poseQuestions` の引数の型）も `IssueTreeSchemaVersion3` に直す。

**(2) `HypothesisQuestions`**:

```ts
/** 仮説1件に立つ問い */
export interface HypothesisQuestions {
  /** 「未決」＝ events が0件 */
  result: boolean
  /** 「保留」＝最新が onHold（見たが判断できなかった。次のレビューで拾い直す） */
  hold: boolean
  /**
   * 「FB待ち」＝ **FB が1件も付いていない、文言のある問いの件数**。
   *
   * **真偽ではなく件数なのは、要対応の単位が問い（ask）1件だからである。**
   * ほかの2つが仮説単位の真偽なのに、ここだけ数なのは不揃いに見えるが、
   * 揃えて真偽にすると「3つ聞きたいことがあって1つしか答えが返っていない」
   * 仮説が、1つも返っていない仮説と同じ「1」に潰れる。
   *
   * **文言が空の問いは数えない**——「＋ 聞きたいこと」を押した瞬間に要対応が
   * 増えると、書き始める前から急かされることになる（2026-08-30 の決定）
   */
  feedback: number
}
```

**(3) FB待ちの導出**（`poseQuestions` の直前に置く）:

```ts
/**
 * FB を待っている問いの件数。**この関数だけが「FB待ち」の条件を持つ。**
 *
 * 数えるのは「文言があり、かつ自分を指す FB が1件も無い問い」である。
 * **`askId` が `null` の FB は、どの問いの待ちも解かない**——紐づけを強制しない
 * と決めたことの裏返しで、「何か言われた」ことは「用意した問いに答えが出た」
 * ことではない。存在しない問いを指す FB も同じ（壊れたファイルでも止まらない）。
 *
 * 空文字の判定に `trim` を使わないのは、このスキーマが一貫して
 * 「空文字＝未記入」で書かれているためである（`text` / `note` / `by` も同じ）
 */
export function awaitingAskCount(h: Pick<Hypothesis, 'asks' | 'feedbacks'>): number {
  const answered = new Set<string>()
  for (const f of h.feedbacks) if (f.askId !== null) answered.add(f.askId)
  let count = 0
  for (const ask of h.asks) if (ask.text !== '' && !answered.has(ask.id)) count += 1
  return count
}
```

**(4) `poseQuestions` の仮説側の1ブロック**（`data` の型も `IssueTreeSchemaVersion3` に）:

```ts
  const hypothesisQuestions = data.hypotheses.map((h) => {
    // ぶら下がり先が実在しない仮説は抑制されない（どの課題の配下でもない）。
    // 参照切れそのものは整合性検証（レベル2）が赤くする
    const off = suppressed.has(h.issueId)
    return {
      result: !off && h.events.length === 0,
      hold: !off && latestKind(h.events) === 'onHold',
      feedback: off ? 0 : awaitingAskCount(h),
    }
  })
```

**(5) 集計**:

```ts
export interface IssueTreeTally {
  hypothesis: number
  result: number
  hold: number
  feedback: number
  total: number
}

/** 立っている問いだけを数える（抑制された配下は勘定に入らない） */
export function tallyQuestions(posed: PosedQuestions): IssueTreeTally {
  let hypothesis = 0
  let result = 0
  let hold = 0
  let feedback = 0
  for (const needs of posed.issueNeedsHypothesis) if (needs) hypothesis += 1
  for (const q of posed.hypothesisQuestions) {
    if (q.result) result += 1
    if (q.hold) hold += 1
    // **足すのは件数である。** ほかの3つと違って真偽ではない（問い1件が要対応1件）
    feedback += q.feedback
  }
  return { hypothesis, result, hold, feedback, total: hypothesis + result + hold + feedback }
}
```

**(6) 文言**（`QUESTION_LABELS` の4語目と `toMissingTally`）:

```ts
/** 問いの文言。**アプリの画面と Skill の報告が同じ言葉を出すため、ここ1箇所に置く** */
export const QUESTION_LABELS = {
  hypothesis: '仮説なし',
  result: '未決',
  hold: '保留',
  feedback: 'FB待ち',
} as const
```

`tallyLine` は**式を変えない**。内訳の4行目だけ差し替える:

```ts
      [QUESTION_LABELS.feedback, t.feedback],
```

`toMissingTally` も同様に4つ目の要素だけ差し替える（variant は `pending` のまま——着信の青は「受信箱に何か来ている」ではなく「返事を待っている」に読み替わるが、**色の意味は変えていない**）:

```ts
      { kind: 'feedback', label: QUESTION_LABELS.feedback, count: t.feedback, variant: 'pending' as const },
```

**(7) 課題の旗のラベルと別枠**（`ISSUE_DEFERRED_LABEL` / `deferredIssueCount` / `deferralLine` / `DEFERRAL_NOTE` を置き換える）:

```ts
/**
 * 課題の旗のラベル。**値は `BADGE_LABELS.deferred` と同じ語を含むが、別に持つ**
 *——課題と仮説を独立に変えられるようにするため（v2 の `ISSUE_DEFERRED_LABEL` と
 * 同じ理由）。`Record<IssueEventKind, string>` にしてあるので、旗の種別が増えたら
 * `tsc` がここで落ちる（手書きの配列にすると黙って古びる）
 */
export const ISSUE_EVENT_LABELS: Record<IssueEventKind, string> = {
  deferred: '見送り',
  resolved: '解決',
}

/**
 * 旗を掲げた課題の数（UI ノート D17 の別枠）。
 *
 * 数えるのは**自分自身がその旗を掲げている課題**だけ——配下の抑制
 * （`suppressedIssueIds`）は数えない。別枠は「誰が何を落としたか／何を閉じたか」の
 * 台帳なので、入れ子の旗もそれぞれ1と数える。
 *
 * **見送りと解決は別々に数える。** 実効（配下を抑制する）は同じでも意味は逆で、
 * 「追わないもの」と「答えが出たもの」が1つの数に混ざると台帳として読めない。
 *
 * **配下に眠る凍結中の問いの数は導出しない**——出す画面が無い（人間の裁定。
 * 別枠は件数だけ）。必要が出たら poseQuestions を抑制なしで回す形で足せる
 */
export function issueEventCount(
  issues: readonly Pick<IssueNode, 'events'>[],
  kind: IssueEventKind,
): number {
  let count = 0
  for (const node of issues) if (latestKind(node.events) === kind) count += 1
  return count
}

/** 別枠の1行。アプリのチップと Skill の報告が逐語で同じ文字列を出す。0件のときは呼び出し側が行ごと出さない（チップも描かない） */
export function issueEventLine(count: number, kind: IssueEventKind): string {
  return `${ISSUE_EVENT_LABELS[kind]} ${count}`
}

/** 別枠の注意書き。チップの title と Skill の報告の補足が同じ文を出す */
export const ISSUE_EVENT_NOTES: Record<IssueEventKind, string> = {
  deferred: `見送り配下の問いは${TALLY_TOTAL_LABEL}に数えません`,
  resolved: `解決配下の問いは${TALLY_TOTAL_LABEL}に数えません`,
}
```

**`issueEventCount` の判定が `latestKind(node.events) !== null` から `=== kind` に変わっている点に注意。** v2 は「課題のイベントは見送りしか無い」ので件数と同値だったが、v3 では旗が2種あるので、種別を見ないと両方が両方の数に入る。

- [ ] **Step 4: Skill 側のコピーを更新する（`cp` する。手で書き写さない）**

```
cp src/modules/issue-tree/derive.ts .claude/skills/issue-tree-register/scripts/derive.ts
```

- [ ] **Step 5: テストが通ることを確認する**

```
npx vitest run src/modules/issue-tree/derive.test.ts src/modules/issue-tree/skill-copy.test.ts
```

期待: どちらも PASS。`skill-copy.test.ts` は Step 4 の `cp` と、**`derive.ts` が値 import・`enum` を持たないこと**を見ている（新しい定数を足しても `const` の型注釈だけなので型ストリップを通る）。

```
npx tsc -b 2>&1 | tail -40
```

**出力を報告に貼る。**

- [ ] **Step 6: コミット**

```
git add src/modules/issue-tree/derive.ts src/modules/issue-tree/derive.test.ts .claude/skills/issue-tree-register/scripts/derive.ts
git commit -m "feat(issue-tree): 導出を v3 へ（解決の旗・FB待ち・別枠2種）"
```

---

### Task 5: 編集コマンド（`commands.ts`）——`title` / `feedbacks` / 旗のトグル / 日付の刻印

**Files:**
- Modify: `src/modules/issue-tree/commands.ts`
- Test: `src/modules/issue-tree/commands.test.ts`

**Interfaces:**
- Consumes: Task 1 の型、Task 3 の `todayString`
- Produces（**以後のタスクはこの名前で書く**）:
  - `export type FocusTarget = { cell: 'issue'; index: number } | { cell: 'issueEvent'; index: number } | { cell: 'hypothesis'; index: number } | { cell: 'feedback'; index: number; feedbackIndex: number } | { cell: 'event'; index: number; eventIndex: number }`
  - `setHypothesisTitle(data, index, title): IssueTreeSchemaVersion3`
  - `addFeedback(data, index, today?): EditResult`
  - `addFeedbackAfter(data, index, feedbackIndex, today?): EditResult`
  - `setFeedbackText(data, index, feedbackIndex, text): IssueTreeSchemaVersion3`
  - `removeFeedback(data, index, feedbackIndex): EditResult`
  - `moveFeedback(data, index, feedbackIndex, delta): EditResult`
  - `appendJudgement(data, index, kind, today?): EditResult`
  - `toggleIssueEvent(data, index, kind: IssueEventKind, today?): EditResult`
  - `setIssueEventNote(data, index, note): IssueTreeSchemaVersion3`
  - **消える**: `promoteNote` / `setRationale` / `setHypothesisText` / `addPendingNote` / `addPendingNoteAfter` / `setPendingNote` / `removePendingNote` / `movePendingNote` / `toggleDeferral` / `setDeferralNote`

**名前を変える理由を1つだけ書いておく**（実装者が「改名は余計では」と思ったとき用）: `pendingNotes` という名前は「まだ判断に紐づいていないメモ」を意味しており、**その概念ごと廃止された**（FB は移動も昇格もせず、記録としてその場に残る）。`note` のまま残すと、スキーマが `feedbacks` と呼ぶものをコードだけが別名で呼び続け、**次に読む人がどちらが正か判断できない**。`deferral` → `issueEvent` も同じで、`resolved` を `deferral` という名前の下に置くのは嘘である。

**やらないこと（決定C）**: `setHypothesisDetail` / `setHypothesisValue` / `addAsk` / `setAskText` / `removeAsk` / `setFeedbackBy` / `setFeedbackSentiment` / `setFeedbackAsk` は**作らない**。m4 はそれらを出す画面を持たない。**m5 が画面と一緒に決める。**

- [ ] **Step 1: 失敗するテストを書く（`commands.test.ts` を v3 に合わせる）**

既存の `commands.test.ts` に対して次を行う。**実物を開いて既存の `it` の主張を読んでから直すこと。**

1. フィクスチャの仮説を v3 の形にする（`:39`〜`:41`・`:73`・`:97`）。`{ id, issueId, title, detail: '', value: '', asks: [], feedbacks: [], events: [] }`。
2. `pendingNotes` を見ている `it`（`:186` / `:201`〜`:248`）を `feedbacks` に読み替える。**FB は文字列ではなくオブジェクトになったので、`toEqual(['A','B','',...])` の形は使えない。** 文言だけを見る形に直す:

```ts
const textsOf = (h: Hypothesis): string[] => h.feedbacks.map((f) => f.text)
```

```ts
it('直後に FB を1件足す（末尾ではなく押した位置の次）', () => {
  let d = base()
  d = { ...d, hypotheses: d.hypotheses.map((h, i) => (i === 0 ? { ...h, feedbacks: [fb('A'), fb('B'), fb('C')] } : h)) }
  const next = addFeedbackAfter(d, 0, 1, '2026-08-30')
  expect(textsOf(next.data.hypotheses[0])).toEqual(['A', 'B', '', 'C'])
  expect(next.focus).toEqual({ cell: 'feedback', index: 0, feedbackIndex: 2 })
})
```

`fb` はテスト内のヘルパ:

```ts
const fb = (text: string): Feedback => ({
  askId: null,
  text,
  by: '',
  sentiment: 'note',
  date: '2026-08-30',
})
```

3. **`promoteNote` の2つの `it`（`:416` / `:429`）を削除する。** 関数ごと無くなるので、読み替えるものが無い。**削除したことを報告に書くこと**（テストが黙って減るのは、消したのか落としたのか後から分からない）。
4. 新しい `it` を足す:

```ts
it('アプリが作る FB は「どの問いにも紐づかない・誰の発言か空・ただのメモ」で、日付だけが入る', () => {
  // **sentiment の既定が note なのは、m4 が調子を選ばせる画面を持たないからである。**
  // 嘘の分類（question 等）を既定にすると、選ばれていない分類が記録として残る
  const next = addFeedback(base(), 0, '2026-08-30')
  expect(next.data.hypotheses[0].feedbacks).toEqual([
    { askId: null, text: '', by: '', sentiment: 'note', date: '2026-08-30' },
  ])
  expect(next.focus).toEqual({ cell: 'feedback', index: 0, feedbackIndex: 0 })
})

it('先頭の FB を消したら仮説の文言へ戻る（由来の欄が無くなったので行き先が変わった）', () => {
  let d = base()
  d = { ...d, hypotheses: d.hypotheses.map((h, i) => (i === 0 ? { ...h, feedbacks: [fb('A')] } : h)) }
  const next = removeFeedback(d, 0, 0)
  expect(next.data.hypotheses[0].feedbacks).toEqual([])
  expect(next.focus).toEqual({ cell: 'hypothesis', index: 0 })
})

it('判断イベントには日付が入る（追記専用は変わらない）', () => {
  const next = appendJudgement(base(), 0, 'supported', '2026-08-30')
  expect(next.data.hypotheses[0].events).toEqual([
    { kind: 'supported', note: '', date: '2026-08-30' },
  ])
  expect(next.focus).toEqual({ cell: 'event', index: 0, eventIndex: 0 })
})

it('旗が無い課題に旗を1件足し、理由の欄へ移す', () => {
  const next = toggleIssueEvent(base(), 0, 'deferred', '2026-08-30')
  expect(next.data.issues[0].events).toEqual([{ kind: 'deferred', note: '', date: '2026-08-30' }])
  expect(next.focus).toEqual({ cell: 'issueEvent', index: 0 })
})

it('同じ旗をもう一度押すと最新1件が消え、課題の文言へ戻る', () => {
  const on = toggleIssueEvent(base(), 0, 'deferred', '2026-08-30')
  const off = toggleIssueEvent(on.data, 0, 'deferred', '2026-08-31')
  expect(off.data.issues[0].events).toEqual([])
  expect(off.focus).toEqual({ cell: 'issue', index: 0 })
})

it('別の旗を押すと差し替わる（列に2件並べない。見送りと解決は排他）', () => {
  const deferred = toggleIssueEvent(base(), 0, 'deferred', '2026-08-30')
  const resolved = toggleIssueEvent(deferred.data, 0, 'resolved', '2026-08-31')
  // **1件のまま。** 消してから足す
  expect(resolved.data.issues[0].events).toEqual([
    { kind: 'resolved', note: '', date: '2026-08-31' },
  ])
  expect(resolved.focus).toEqual({ cell: 'issueEvent', index: 0 })
})

it('手書きの2件以上でも、消すのは最新1件だけ（過去の理由を1押しで飛ばさない）', () => {
  let d = base()
  d = {
    ...d,
    issues: d.issues.map((n, i) =>
      i === 0
        ? {
            ...n,
            events: [
              { kind: 'deferred' as const, note: '一度目', date: '2026-08-01' },
              { kind: 'deferred' as const, note: '二度目', date: '2026-08-30' },
            ],
          }
        : n,
    ),
  }
  const off = toggleIssueEvent(d, 0, 'deferred', '2026-08-31')
  expect(off.data.issues[0].events).toEqual([
    { kind: 'deferred', note: '一度目', date: '2026-08-01' },
  ])
})

it('旗の理由を書けるのは最新1件だけ。旗が無ければ同じ参照を返す', () => {
  const on = toggleIssueEvent(base(), 0, 'resolved', '2026-08-30')
  const written = setIssueEventNote(on.data, 0, '通知の集約で解ける')
  expect(written.issues[0].events[0].note).toBe('通知の集約で解ける')
  // 旗が無い課題では何も起きない（`apply` が同じ参照を見て履歴を積まない）
  const d = base()
  expect(setIssueEventNote(d, 0, 'x')).toBe(d)
})

it('新しい仮説は全キー常在で作られる（asks と feedbacks は空配列）', () => {
  const next = addHypothesis(base(), 0)
  const created = next.data.hypotheses[next.focus?.cell === 'hypothesis' ? next.focus.index : -1]
  expect(created.title).toBe('')
  expect(created.detail).toBe('')
  expect(created.value).toBe('')
  expect(created.asks).toEqual([])
  expect(created.feedbacks).toEqual([])
  expect(created.events).toEqual([])
})
```

5. **既存の `deleteHypothesis` / `moveHypothesis` / `normalizeOrder` / 課題の構造編集の `it` は、フィクスチャの形を直す以外は触らない。**

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/modules/issue-tree/commands.test.ts
```

期待: FAIL。

- [ ] **Step 3: `commands.ts` を書き換える**

**(1) import**:

```ts
import { buildTree, orderFlatNodes, siblingsOf, subtreeEnd, type BuiltTree } from '@/core/canvas/flat-tree'
import { insertAt, moveItem, removeAt } from '@/core/list-ops'
import { newId } from '@/core/new-id'
import { todayString } from '@/core/today'
import type {
  Feedback,
  Hypothesis,
  IssueEvent,
  IssueNode,
  IssueTreeSchemaVersion3,
  JudgementEvent,
} from '@/types/issue-tree'
import type { IssueEventKind } from './derive'
```

**`IssueTreeSchemaVersion2` は全部 `IssueTreeSchemaVersion3` に置き換える**（このファイルに30箇所以上ある。`sed` ではなくエディタの置換で一括してよいが、置換後に `npx tsc -b 2>&1 | grep commands.ts` が空になることを確かめる）。

**(2) `FocusTarget`**:

```ts
/**
 * 操作後に編集させたい欄。**`index` はそれぞれの配列（issues / hypotheses）の位置。**
 * 課題と仮説で配列が分かれているので、ロジックツリーのような `focusIndex: number`
 * ひとつでは行き先を表せない。
 *
 * **v3 で2つ変わった**: 由来（`rationale`）が廃止されて席が消え、課題の理由の欄が
 * 見送り専用でなくなった（`deferral` → `issueEvent`。解決の理由もここに書く）
 */
export type FocusTarget =
  | { cell: 'issue'; index: number }
  | { cell: 'issueEvent'; index: number }
  | { cell: 'hypothesis'; index: number }
  | { cell: 'feedback'; index: number; feedbackIndex: number }
  | { cell: 'event'; index: number; eventIndex: number }
```

**(3) 仮説の生成と文言**:

```ts
function newHypothesis(issueId: string): Hypothesis {
  return {
    id: newId('hypothesis'),
    issueId,
    title: '',
    detail: '',
    value: '',
    asks: [],
    feedbacks: [],
    events: [],
  }
}
```

```ts
/**
 * ソリューション仮説のタイトルを置き換える。**並べ替えない**——打鍵のたびに
 * 配列が動くと、入力中の仮説の配列位置がずれてフォーカスを見失う。
 *
 * **`detail` / `value` の setter はここに無い**（m4 は出す画面を持たない。m5 が足す）
 */
export function setHypothesisTitle(
  data: IssueTreeSchemaVersion3,
  index: number,
  title: string,
): IssueTreeSchemaVersion3 {
  const h = data.hypotheses[index]
  return h === undefined ? data : replaceHypothesis(data, index, { ...h, title })
}
```

**（v2 の `setHypothesisText` / `setRationale` に戻り値型注釈が無かったのは `open-issues.md` の項目である。新しい関数には最初から付ける。）**

**(4) FB の5関数**（v2 の `pendingNotes` 5関数の置き換え。**引数の順番と戻り値の形は v2 と同じ**にしてある）:

```ts
/** アプリが作る FB。**調子は `note`（ただのメモ）が既定**——m4 は選ばせる画面を持たず、嘘の分類を残さないため */
function newFeedback(today: string): Feedback {
  return { askId: null, text: '', by: '', sentiment: 'note', date: today }
}

/** FB を1件足す（「＋ FB」ボタン） */
export function addFeedback(
  data: IssueTreeSchemaVersion3,
  index: number,
  today: string = todayString(),
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined) return { data, focus: null }
  const feedbacks = [...h.feedbacks, newFeedback(today)]
  return {
    data: replaceHypothesis(data, index, { ...h, feedbacks }),
    focus: { cell: 'feedback', index, feedbackIndex: feedbacks.length - 1 },
  }
}

/**
 * 直後に FB を1件足す（FB セルの Enter）。**押した位置の次に入る**
 *——末尾に足すと、3件の1件目で Enter を押したときに生まれるのは4件目で、
 * フォーカスが展開パネルの一番下へ飛ぶ（`addHypothesisAfter` と同じ規律）
 */
export function addFeedbackAfter(
  data: IssueTreeSchemaVersion3,
  index: number,
  feedbackIndex: number,
  today: string = todayString(),
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.feedbacks[feedbackIndex] === undefined) return { data, focus: null }
  const at = feedbackIndex + 1
  return {
    data: replaceHypothesis(data, index, {
      ...h,
      feedbacks: insertAt(h.feedbacks, at, newFeedback(today)),
    }),
    focus: { cell: 'feedback', index, feedbackIndex: at },
  }
}

/**
 * FB の文言を書き換える。**日付は書き換えない**——`date` は「いつ言われたか」で
 * あって「いつ打ち直したか」ではない（打鍵のたびに更新すると、誤字を直しただけで
 * 発言日が今日になる）
 */
export function setFeedbackText(
  data: IssueTreeSchemaVersion3,
  index: number,
  feedbackIndex: number,
  text: string,
): IssueTreeSchemaVersion3 {
  const h = data.hypotheses[index]
  if (h === undefined || h.feedbacks[feedbackIndex] === undefined) return data
  return replaceHypothesis(data, index, {
    ...h,
    feedbacks: h.feedbacks.map((f, i) => (i === feedbackIndex ? { ...f, text } : f)),
  })
}

/**
 * FB を1件消す（空欄 Backspace／削除）。**`events` と違って消せるのはここだけ**
 *——打ち間違いが残るのは実務的でない一方、判断の履歴は「そのとき何を根拠に
 * 決めたか」の記録なので追記専用を守る。
 *
 * **先頭を消したときの行き先は仮説の文言。** v2 は由来の欄へ返していたが、
 * その欄は廃止された（`rationale`）。展開パネルの中で必ず存在する欄は
 * 仮説の文言だけなので、そこへ返す
 */
export function removeFeedback(
  data: IssueTreeSchemaVersion3,
  index: number,
  feedbackIndex: number,
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.feedbacks[feedbackIndex] === undefined) return { data, focus: null }
  const feedbacks = removeAt(h.feedbacks, feedbackIndex)
  const at = feedbackIndex > 0 ? feedbackIndex - 1 : null
  return {
    data: replaceHypothesis(data, index, { ...h, feedbacks }),
    focus:
      at === null ? { cell: 'hypothesis', index } : { cell: 'feedback', index, feedbackIndex: at },
  }
}

/**
 * FB を1件動かす（Alt+↑↓）。**同じ仮説の中でしか動かない**
 *——FB は仮説に属する配列そのもので、またぐという意味が無い。
 *
 * 端を越える移動は「動かなかった編集」として同じ参照を返す
 *（`moveHypothesis` と同じ約束。呼び出し側はこれで履歴の空振りを落とす）
 */
export function moveFeedback(
  data: IssueTreeSchemaVersion3,
  index: number,
  feedbackIndex: number,
  delta: -1 | 1,
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined || h.feedbacks[feedbackIndex] === undefined) return { data, focus: null }
  const to = feedbackIndex + delta
  if (h.feedbacks[to] === undefined) return { data, focus: null }
  return {
    data: replaceHypothesis(data, index, {
      ...h,
      feedbacks: moveItem(h.feedbacks, feedbackIndex, to),
    }),
    // 動いた先を追いかける（並び替えの後もフォーカスは同じ FB に残る）
    focus: { cell: 'feedback', index, feedbackIndex: to },
  }
}
```

**(5) 判断の追記**（`note` は空のまま・`date` が増えただけ。**`pendingNotes` を流し込まない**という v2 の但し書きは、そもそも流し込む先が無くなったので書き換える）:

```ts
/**
 * 判断イベントを追記する（D2）。**追記専用**——過去の要素は書き換えない。
 * **仮説側は例外を持たない**（例外は課題の旗だけ。`toggleIssueEvent`）。
 *
 * `note` は空で作り、直後に最新イベントの note セルへフォーカスを移す。
 * **FB は1件も動かない**（v3 で「根拠へ移す」を廃止した。判断の理由は
 * 複数の FB を踏まえて人が自分の言葉で書くものであり、FB の文言をそのまま
 * 移す操作は分かりづらいわりに何も要約していない）
 */
export function appendJudgement(
  data: IssueTreeSchemaVersion3,
  index: number,
  kind: JudgementEvent['kind'],
  today: string = todayString(),
): EditResult {
  const h = data.hypotheses[index]
  if (h === undefined) return { data, focus: null }
  const events = [...h.events, { kind, note: '', date: today }]
  return {
    data: replaceHypothesis(data, index, { ...h, events }),
    focus: { cell: 'event', index, eventIndex: events.length - 1 },
  }
}
```

**(6) 課題の旗のトグル**（v2 の `toggleDeferral` の JSDoc を土台に、差し替えの規則を足す）:

```ts
/**
 * 課題ノードの旗を**入り切りする**（D3）。**配下へ値をコピーしない**
 *——抑制は derive.ts が祖先を遡って導出する。
 *
 * **ここだけが D2 の追記専用の例外である。** 旗は「選ぶ」操作ではなく
 * 「入っているか／入っていないか」の操作なので、「切る」の意味を決める必要が
 * あり、**最新の旗を消す**を採った。追記による取り消しイベントは作らない：
 * `events` が「旗が1件」ではなく「掲げて戻した履歴」になった瞬間、抑制の導出
 * （最新があるか）と俯瞰のバッジが列の中身に依存し始める。**代償は、一度掲げて
 * 戻した事実とそのとき書いた理由が消えることである**——受け入れた上での選択で、
 * 取り消しは Undo（1操作1コミット）が戻す。**仮説側（`appendJudgement`）は
 * 追記専用のまま。**
 *
 * **v3 で旗が2種になった（見送り／解決）。規則は3つ:**
 *
 * 1. 最新が同じ `kind` → 最新1件を消す（＝切る）
 * 2. 最新が**別の** `kind` → **最新1件を消してから足す**（差し替え）。
 *    見送りと解決は意味が逆で**同時に立ってはならない**ので、列に2件並べない
 * 3. イベントが無い → 1件足す
 *
 * **入り切りを1つの関数にしてあるのは、「いまどの旗が立っているか」を決める場所を
 * 1つに保つためである。** 種別ごとに export を分けると、呼ぶ側が
 * 「別の旗が立っていたらどうするか」を自分で決めることになり、規則2が
 * 呼び出し箇所の数だけ生える。
 *
 * **消すのは最新の1件だけ。** アプリが作る `events` は高々1件だが、手書きの
 * ファイルは2件以上を持ちうる——そこで全部消すと、書いた人が見ていない過去の
 * 理由まで1押しで飛ぶ
 */
export function toggleIssueEvent(
  data: IssueTreeSchemaVersion3,
  index: number,
  kind: IssueEventKind,
  today: string = todayString(),
): EditResult {
  const node = data.issues[index]
  if (node === undefined) return { data, focus: null }
  const latest = node.events[node.events.length - 1]
  const off = latest !== undefined && latest.kind === kind
  const kept = latest === undefined ? node.events : node.events.slice(0, -1)
  const events: IssueEvent[] = off ? kept : [...kept, { kind, note: '', date: today }]
  return {
    data: { ...data, issues: data.issues.map((n, i) => (i === index ? { ...n, events } : n)) },
    // **付けたら理由を打たせる**（`appendJudgement` が根拠へ飛ばすのと同じ形）。
    // 課題の文言へ戻さないのは、旗は理由が本体で、バッジだけ残ると
    // 「なぜ落としたか／なぜ閉じたか」が図から消えるため。
    //
    // **外したときは、残った理由の欄の有無によらず課題の文言へ返す。**
    // 手書きの2件以上では剥がしても理由の欄は残るが、そちらへ返さない——
    // **残っている理由はいま剥がしたものではなく1つ前のもの**であり、
    // カーソルを置けば書き換えを誘う（`setIssueEventNote` は最新を書き換えるので
    // 実際に書き換わり、過去の理由が消える）。
    //
    // null（＝どこへも移さない）にするとフォーカスはトグルのボタンに残るが、
    // ボタンの上では木の操作言語（Enter／Tab／←→）が1つも効かない
    focus: off ? { cell: 'issue', index } : { cell: 'issueEvent', index },
  }
}

/**
 * 旗の理由を書く。**書けるのは最新の旗だけ**（`setEventNote` と同じ規則）。
 *
 * 課題の `events` は `toggleIssueEvent` が最新1件を消せる列になったが、
 * **書き換えの側は最新に限ったままである**——過去の旗の理由が後から
 * 書き換わると「そのとき何を根拠に落としたか／閉じたか」が消える。旗が1件も無い
 * 課題では**同じ参照を返す**——`apply` がそれを見て何もしない契約
 */
export function setIssueEventNote(
  data: IssueTreeSchemaVersion3,
  index: number,
  note: string,
): IssueTreeSchemaVersion3 {
  const node = data.issues[index]
  if (node === undefined || node.events.length === 0) return data
  const last = node.events.length - 1
  return {
    ...data,
    issues: data.issues.map((n, i) =>
      i === index ? { ...n, events: n.events.map((e, j) => (j === last ? { ...e, note } : e)) } : n,
    ),
  }
}
```

**(7) 削除**: `promoteNote` を関数ごと消す。`setRationale` / `setHypothesisText` / `addPendingNote` / `addPendingNoteAfter` / `setPendingNote` / `removePendingNote` / `movePendingNote` / `toggleDeferral` / `setDeferralNote` は上の置き換えで消える。**`deleteHypothesis` の JSDoc「イベントもメモも一緒に消える」は「イベントも FB も一緒に消える」に直す。**

- [ ] **Step 4: テストが通ることを確認する**

```
npx vitest run src/modules/issue-tree/commands.test.ts src/core/today.test.ts
```

期待: どちらも PASS。

- [ ] **Step 5: 「隣の実装と取り違えられないか」を1つずつ自問する**

追加した `it` について、**期待値が隣の実装でも同じ値になるか**を確かめる（教訓: 退化ケースを選ばない）。特に:

- 旗の差し替えの `it` は、**「消してから足す」を「足すだけ」に変えたら赤くなるか。** ならなければ入力が退化している（`events` の件数を見ているか確かめる）
- `addFeedbackAfter` の `it` は、**「末尾に足す」に変えたら赤くなるか。** 3件の**真ん中**で押す入力になっているか
- `removeFeedback` の行き先の `it` は、**`{cell:'hypothesis'}` を `null` に変えたら赤くなるか**

**1つでも「変えても緑」があれば、入力を1段複雑にしてから次へ進む。確かめた結果を報告に書く。**

- [ ] **Step 6: コミット**

```
git add src/modules/issue-tree/commands.ts src/modules/issue-tree/commands.test.ts
git commit -m "feat(issue-tree): 編集コマンドを v3 へ（feedbacks・旗のトグル・日付。promoteNote を廃止）"
```

---

### Task 6: セル鍵・整合性検証・巡回列

**Files:**
- Modify: `src/modules/issue-tree/cell-keys.ts`
- Modify: `src/modules/issue-tree/consistency.ts`
- Modify: `src/modules/issue-tree/open-targets.ts`
- Test: `src/modules/issue-tree/consistency.test.ts`、`src/modules/issue-tree/open-targets.test.ts`

**Interfaces:**
- Consumes: Task 4 の `QUESTION_LABELS` / `HypothesisQuestions`、Task 5 の `FocusTarget`
- Produces:
  - `export type HypothesisCell = { cell: 'hypothesis' } | { cell: 'feedback'; feedbackIndex: number } | { cell: 'event'; eventIndex: number }`
  - `export function issueEventCellKey(issueKey: string): string`（`issue-event:${issueKey}`）
  - `export type OpenKind = 'hypothesis' | 'result' | 'hold' | 'feedback'`
  - `checkIssueTreeConsistency` / `listOpenTargets` / `nextOpenTarget` / `listDeferredTargets` → **`listFlaggedTargets(data, kind)` に一般化**、`nextDeferredTarget` → `nextFlaggedTarget`

- [ ] **Step 1: `cell-keys.ts` を直す**

3箇所（型・鍵を作る関数・`cellKey` の分岐）。

```ts
/** 仮説の行（展開パネルを含む）の中の欄。`commands.ts` の `FocusTarget` と同じ名前で並べる */
export type HypothesisCell =
  | { cell: 'hypothesis' }
  | { cell: 'feedback'; feedbackIndex: number }
  | { cell: 'event'; eventIndex: number }
```

```ts
/**
 * 課題ノードの旗（見送り／解決）の理由の欄。**課題の文言とは別の鍵**——同じ箱の中に
 * 2つの入力欄があるので、1つの鍵で引くと予約したのに別の欄が掴まれる。
 *
 * **鍵に旗の種別を混ぜない。** 種別は同じ1つの欄の中身であって、別の席ではない
 *——混ぜると、見送りから解決へ差し替えた瞬間に予約した鍵が当たらなくなる
 */
export function issueEventCellKey(issueKey: string): string {
  return `issue-event:${issueKey}`
}
```

`hypothesisCellKey` の `switch` から `rationale` を落とし、`note` を `feedback` にする:

```ts
    case 'feedback':
      return `feedback:${hypothesisKey}:${cell.feedbackIndex}`
```

`cellKey` の `switch` も同じ形に直す（`deferral` → `issueEvent`、`rationale` を削除、`note` → `feedback`）。**接頭辞の文字列はこのファイル以外に書かない。**

- [ ] **Step 2: `consistency.ts` を直す（文言は変えない）**

変えるのは `label(h.text, i)` → `label(h.title, i)` の**2箇所だけ**（`missing-issue` のブロック）。**`message` の文字列は1文字も変えないこと**——`skill-write.smoke.test.ts` が Skill 側の複製と逐語で突き合わせており、変えるなら Task 10 で両方を同時に直すことになる。**変える必要は無い。**

`checkIssueTreeConsistency` の引数型も `IssueTreeSchemaVersion3` へ。

`consistency.test.ts` のフィクスチャを v3 の形に直す（`:20` / `:33` / `:55` / `:85`）。**`it` の主張は変えない。**

- [ ] **Step 3: `open-targets.ts` を直す**

`OpenKind` の4語目を差し替え、巡回列の分岐を `q.feedback > 0` にする。**この Task の主題は、下のコメントを書くことである。**

```ts
/** 問いの4種。`QUESTION_LABELS` の鍵と同じ（文言はあちらから引く） */
export type OpenKind = 'hypothesis' | 'result' | 'hold' | 'feedback'
```

```ts
      if (q.result) out.push({ kind: 'result', focus })
      if (q.hold) out.push({ kind: 'hold', focus })
      // **FB待ちは問い（ask）1件ずつが要対応だが、行き先は仮説につき1つしか出さない。**
      // m4 には問いを1件ずつ指せる DOM のセルが無いので、問いごとに行き先を作ると
      // 同じ場所へ何度も飛ぶ列になり、押しても視点が動かず巡回がそこで止まる
      //（「ぶら下がり先が図に無い仮説を列に入れない」のと同じ理由）。
      //
      // **結果として、チップの数（問いの数）が列の長さ（仮説の数）を上回りうる。**
      // 集計と列が同じ根（`posed`）から出ているという性質は保たれているが、
      // 「未決 2」なら2回で一巡する、が FB待ちについては成り立たない。
      // **m5 が問いに固有のセルを与えたときに、ここを問いごとの行き先に戻す**
      if (q.feedback > 0) out.push({ kind: 'feedback', focus })
```

`listDeferredTargets` / `nextDeferredTarget` を種別で回せる形に一般化する（帯に「解決 N」のチップが並ぶため。決定E）:

```ts
/**
 * 「次の旗へ」の巡回列（帯のグレーのチップの行き先。M25 D17）。
 *
 * **その旗を掲げた課題**だけが行き先で、配下（抑制）は入らない。条件は
 * `issueEventCount`（derive.ts）と同じ `latestKind` から引く——チップの
 * 数と列の長さが同じ条件から出るので、「見送り 2」と言いながら1件にしか
 * 飛べない、が起きない（`listOpenTargets` と `tallyQuestions` の関係と同じ）。
 *
 * **種別を引数に取る。** 見送りと解決で2本の関数に分けると、`issueEventCount` が
 * 種別を引数に取っているのと形が食い違い、片方だけ直される余地が生まれる
 */
export function listFlaggedTargets(
  data: Pick<IssueTreeSchemaVersion3, 'issues'>,
  kind: IssueEventKind,
): FocusTarget[] {
  const out: FocusTarget[] = []
  data.issues.forEach((node, index) => {
    if (latestKind(node.events) === kind) out.push({ cell: 'issue', index })
  })
  return out
}

/** `nextOpenTarget` と同じ剰余の巡回。kind の絞り込みが無いだけ */
export function nextFlaggedTarget(
  targets: readonly FocusTarget[],
  current: FocusTarget | null,
): FocusTarget | null {
  if (targets.length === 0) return null
  const at = current === null ? -1 : targets.findIndex((t) => sameFocus(t, current))
  return targets[(at + 1) % targets.length]
}
```

- [ ] **Step 4: `open-targets.test.ts` を直し、非対称を固定する**

フィクスチャを v3 に直したうえで、次を足す。

```ts
it('FB待ちの行き先は仮説につき1つ（問いが2件でも列は1つ）', () => {
  // **チップの数と列の長さが食い違うことを、意図として固定する。**
  // m5 が問いに固有のセルを与えたら、この it は「問いごとに1つ」へ書き換わる
  const h = hypothesis(1, id(1), {
    asks: [
      { id: 'ask_AAAAAAAAAA', text: '離脱しないか' },
      { id: 'ask_BBBBBBBBBB', text: '制限に当たらないか' },
    ],
    feedbacks: [],
  })
  const data = { issues, hypotheses: [h] }
  const posed = poseQuestions(data)
  expect(tallyQuestions(posed).feedback).toBe(2)
  expect(listOpenTargets(data, posed).filter((t) => t.kind === 'feedback')).toHaveLength(1)
})

it('旗の巡回列は種別ごとに分かれる（見送りと解決が混ざらない）', () => {
  const flagged = [
    { ...issues[0] },
    { ...issues[1], events: [{ kind: 'deferred' as const, note: '', date: '2026-08-30' }] },
    { ...issues[2], events: [{ kind: 'resolved' as const, note: '', date: '2026-08-30' }] },
  ]
  expect(listFlaggedTargets({ issues: flagged }, 'deferred')).toEqual([{ cell: 'issue', index: 1 }])
  expect(listFlaggedTargets({ issues: flagged }, 'resolved')).toEqual([{ cell: 'issue', index: 2 }])
})
```

- [ ] **Step 5: テストが通ることを確認する**

```
npx vitest run src/modules/issue-tree/consistency.test.ts src/modules/issue-tree/open-targets.test.ts
```

期待: どちらも PASS。

```
npx tsc -b 2>&1 | tail -40
```

**出力を報告に貼る。**

- [ ] **Step 6: コミット**

```
git add src/modules/issue-tree/cell-keys.ts src/modules/issue-tree/consistency.ts src/modules/issue-tree/consistency.test.ts src/modules/issue-tree/open-targets.ts src/modules/issue-tree/open-targets.test.ts
git commit -m "feat(issue-tree): セル鍵・整合性・巡回列を v3 へ（FB待ちの非対称を明記）"
```

---

### Task 7: レイアウト（`layout.ts`）——「由来」の節を落とす

**Files:**
- Modify: `src/modules/issue-tree/layout.ts`
- Test: `src/modules/issue-tree/layout.test.ts`

**Interfaces:**
- Consumes: Task 4 の `ISSUE_EVENT_LABELS` / `QUESTION_LABELS` / `PosedQuestions`
- Produces:
  - `IssuePlacement.event: { badge: Rect; reason: Rect } | null`（v2 の `deferral` の改名）
  - `HypothesisPanel` から `rationale` が消える
  - `HypothesisPlacement.feedbackBadge`（v2 の `judgementBadge` の改名）
  - `SECTION_LABELS = { judgement: '判断', previous: '以前の判断', notes: 'FB' }`（`rationale` が消える）

**寸法の定数（`measure.ts`）は1つも変えない。** 節が1つ減るだけで、パネルの余白・行間・幅の規約は同じである。

- [ ] **Step 1: 失敗するテストを書く（`layout.test.ts`）**

フィクスチャを v3 に直したうえで（`:38`〜`:40`・`:92`・`:217`〜`:218`・`:343`）、**節の順序を見ている `it`（`:242`〜`:245`）を書き換える**:

```ts
  // 節は上から 判断 → 以前の判断 → FB の順（由来は v3 で廃止された）
  expect(p.previousLabel).not.toBeNull()
  expect(p.notes.label.y).toBeGreaterThan(p.previous[0].note.y)
```

そのうえで次を足す。

```ts
it('展開パネルに「由来」の節が無い（rationale の廃止）', () => {
  // 型からも消えているので、これは「消し忘れた矩形が残っていない」ことの番人ではなく、
  // **節が3つ（判断・以前の判断・FB）に減ったぶんパネルが縮む**ことの番人である
  const withRationaleGone = layoutIssueTree(data, posed, fonts, 0)
  const panel = withRationaleGone.hypotheses[0]?.expanded
  expect(panel).not.toBeNull()
  expect(Object.keys(SECTION_LABELS)).toEqual(['judgement', 'previous', 'notes'])
})

/**
 * 旗を1件立てた木のレイアウトを返す。**`posed` は必ず同じ `data` から取り直す**
 *——`layoutIssueTree` は「`posed` は同じ `data` に対する `poseQuestions(data)` の
 * 結果である」を前提に添字で引き当てており（`open-issues.md` にこの不変条件が
 * doc に書かれていないとして載っている）、別の木の答えを渡すとバッジが立ったり
 * 立たなかったりする。**テストの中でその不変条件を破らないこと**
 */
function layoutWithFlag(kind: 'deferred' | 'resolved') {
  const issues = data.issues.map((n, i) =>
    i === 1 ? { ...n, events: [{ kind, note: '通知の集約で解ける', date: '2026-08-30' }] } : n,
  )
  const next = { ...data, issues }
  return layoutIssueTree(next, poseQuestions(next), fonts, -1)
}

it('解決の旗を掲げた課題は、見送りと同じ形で右上のバッジと理由の行を持つ', () => {
  const placement = layoutWithFlag('resolved').issues[1]
  expect(placement?.event).not.toBeNull()
  expect(placement?.event?.reason.height).toBeGreaterThan(0)
})

it('旗のバッジの幅は種別ごとに変わる（文言決め打ちに戻したら赤くなる）', () => {
  // **等値でも「片方が狭い」でもなく「違う」を見る。** 概算測定器の
  // 文字幅の仮定に寄りかからずに、`ISSUE_EVENT_LABELS[kind]` から測って
  // いることだけを押さえる
  const deferred = layoutWithFlag('deferred').issues[1]?.event?.badge.width
  const resolved = layoutWithFlag('resolved').issues[1]?.event?.badge.width
  expect(deferred).toBeDefined()
  expect(resolved).toBeDefined()
  expect(resolved).not.toBe(deferred)
})
```

**「見送り」（3文字）と「解決」（2文字）で幅が変わる**ことに依存している。`layout.test.ts` の測定器は文字数に比例する概算器なので成立するはずだが、**成立しなければ計画の誤りとして報告すること**。

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/modules/issue-tree/layout.test.ts
```

期待: FAIL。

- [ ] **Step 3: `layout.ts` を直す**

**(1) 型**:

```ts
export interface IssuePlacement {
  /** 箱の外枠（世界座標）。エッジはここから引く */
  rect: Rect
  /** タイトルの入力欄（箱の中。バッジがあればその幅だけ右が空く） */
  title: Rect
  /**
   * 最新の旗（見送り／解決）。バッジはタイトル行の右端、理由はその下の1行
   *（最新だけ編集できる）。**種別はここに持たない**——描く側は
   * `node.events` の最新から引く（データを2箇所に写さない）
   */
  event: { badge: Rect; reason: Rect } | null
}
```

`HypothesisPanel` から `rationale: { label: Rect; cell: Rect }` の行を消す。
`HypothesisPlacement` の `judgementBadge` を `feedbackBadge` に改名し、JSDoc を「FB待ちが立っていれば」に直す。

**(2) `SECTION_LABELS`** から `rationale: '由来'` を消す。

**(3) 仮説行の計画**（`plans` の中）:
- `textHeight(h.text, ...)` → `textHeight(h.title, ...)`
- `q.judgement`（真偽）→ `q.feedback > 0`、`judgeW` / `judgementBadgeLeftOf` を `feedbackW` / `feedbackBadgeLeftOf` に改名し、ラベルは `QUESTION_LABELS.feedback`
- `const rationaleH = ...` と `const rationaleSectionH = ...` の2行を**削除**
- `const noteHs = h.pendingNotes.map(...)` → `const noteHs = h.feedbacks.map((f) => textHeight(f.text, fonts.body, PANEL_CONTENT_WIDTH))`
- `sectionHs` から `rationaleSectionH` を外す: `const sectionHs = [judgementH, previousH, notesSectionH].filter((s) => s > 0)`
- `build` の中から `cursor += PANEL_GAP; const rationaleLabel = ...; const rationaleCell = ...; cursor += rationaleH` の4行を**削除**し、`expanded` の返り値から `rationale: ...` の行を消す

**(4) 課題の箱**（`boxes` の中）:

```ts
    const latestFlag = node.events[node.events.length - 1]
    const flagged = latestFlag !== undefined
    // 「仮説なし」と旗は**排他**（旗を掲げた課題は抑制されるので問いが立たない）。
    // 同じ場所に置いてよい
    const warn = posed.issueNeedsHypothesis[i]
    const badgeW = flagged
      ? badgeWidth(ISSUE_EVENT_LABELS[latestFlag.kind], fonts.small)
      : warn
        ? badgeWidth(QUESTION_LABELS.hypothesis, fonts.small)
        : 0
    const slotW = flagged
      ? badgeW
      : Math.max(badgeW, badgeWidth(DEFER_TRIGGER_LABEL, fonts.small))
```

`reasonHeight` の判定も `flagged ? textHeight(latestFlag.note, ...) : null` にする。
`BoxPlan` の `reasonHeight` はそのまま。`walkPlace` の `deferral` を組む節を `event` に改名する（**キー名だけ。座標の式は1文字も変えない**）。

**`DEFER_TRIGGER_LABEL`（`export const DEFER_TRIGGER_LABEL = '見送り'`）は削除し、`ISSUE_EVENT_LABELS.deferred` に寄せる。** この定数の存在理由は「**幅を測る文字列と描く文字列を1つにする**」ことであり、Task 9 でトグルのボタンが `ISSUE_EVENT_LABELS[...]` を描くようになると、**同じ値の定数が2つ並んで片方だけ動かせる状態**が生まれる。上の `slotW` の式も `badgeWidth(ISSUE_EVENT_LABELS.deferred, fonts.small)` にする。**m4 が新規に付けられる旗は見送りだけ**なので、まだ旗の無い箱のホバー用トリガーの文言はこれでよい（決定E）。`layout.ts` の `export` を1つ減らすので、`IssueTreeEditor.tsx` の import からも落とすこと（Task 9 で拾う）。

- [ ] **Step 4: テストが通ることを確認する**

```
npx vitest run src/modules/issue-tree/layout.test.ts
```

期待: PASS。

```
npx tsc -b 2>&1 | tail -40
```

**出力を報告に貼る**（残るのは `HypothesisRow.tsx` / `IssueBox.tsx` / `IssueTreeEditor.tsx` とその DOM テスト、Skill の smoke テストのはず）。

- [ ] **Step 5: コミット**

```
git add src/modules/issue-tree/layout.ts src/modules/issue-tree/layout.test.ts
git commit -m "feat(issue-tree): レイアウトを v3 へ（由来の節を落とし、旗を種別で測る）"
```

---

### Task 8: 部品（`HypothesisRow.tsx` / `IssueBox.tsx`）——由来欄と「根拠へ」を消す

**Files:**
- Modify: `src/modules/issue-tree/HypothesisRow.tsx`
- Modify: `src/modules/issue-tree/IssueBox.tsx`
- Test: `src/modules/issue-tree/HypothesisRow.dom.test.tsx`

**Interfaces:**
- Consumes: Task 6 の `HypothesisCell` / `hypothesisCellKey`、Task 7 の `HypothesisPlacement` / `IssuePlacement` / `SECTION_LABELS`
- Produces:
  - `HypothesisRowProps`: `text` → `title`、`notes: readonly string[]`（`feedbacks[].text`）はそのまま、**`rationale` / `onRationaleChange` / `onPromoteNote` が消える**、`onTextChange` → `onTitleChange`、`onNoteChange` → `onFeedbackTextChange`
  - `IssueBoxProps`: `deferralNote` → `eventNote`、`deferralCellKey` → `eventCellKey`、`deferralToggle` → `eventToggle`、**`eventKind: IssueEventKind | null` を新設**

**この Task がやらないこと**: `detail` / `value` / `asks` / FB の属性（`by` / `sentiment` / `date`）を**1つも描かない**。**プレースホルダも置かない**（引き継ぎ書「暫定の見た目で置かないこと」）。

- [ ] **Step 1: 失敗するテストを書く（`HypothesisRow.dom.test.tsx`）**

フィクスチャを v3 に直したうえで（`:48`〜`:69`。`rationale` を消し `title` / `detail` / `value` / `asks` / `feedbacks` にする）:

1. `:130` の `SECTION_LABELS.rationale` を見ている行を**削除**する
2. `:147` の `it`（「文言が textarea になり、判断・以前の判断・由来・FB の節が出る」）を**由来抜き**に直し、名前も直す
3. `:214`〜`:221` の「FB の『根拠へ』はイベントが1件以上あるときだけ出る」という `it` を**丸ごと削除**する（ボタンが無くなる。**削除したことを報告に書く**）
4. 次を足す:

```ts
it('展開しても「由来」の欄は無い（v3 で廃止）', () => {
  render(row(expandedProps))
  expect(screen.queryByRole('textbox', { name: /の由来$/ })).toBeNull()
})

/**
 * **「まだ出していない」ことを番人で押さえる。** 暫定の見た目を置くと、
 * m5 がそれを剥がす手間と、剥がし忘れの両方が生まれる。
 *
 * **目印の文字列を使う。** 「出していない」を空の値で見ると、
 * 何もしなくても緑になる（退化ケース）——フィクスチャに実在する
 * 文字列を入れ、それが画面に無いことを見る
 */
const DETAIL_SENTINEL = '受信を待たずに画面を返す（DETAIL）'
const VALUE_SENTINEL = '応募者を待たせない（VALUE）'
const ASK_SENTINEL = '待ち画面で離脱しないか（ASK）'

it('detail / value / asks は画面に出さない（m5 が設計する）', () => {
  // フィクスチャ側で hypotheses[0] に
  //   detail: DETAIL_SENTINEL, value: VALUE_SENTINEL,
  //   asks: [{ id: 'ask_AAAAAAAAAA', text: ASK_SENTINEL }]
  // を入れておく（この3つは props に渡らないので、部品には届かない）
  render(row(expandedProps))
  expect(screen.queryByText(DETAIL_SENTINEL)).toBeNull()
  expect(screen.queryByText(VALUE_SENTINEL)).toBeNull()
  expect(screen.queryByText(ASK_SENTINEL)).toBeNull()
})
```

**この3つが `HypothesisRowProps` に存在しないこと自体が、実は一番強い番人である**（型が通らないので渡しようがない）。上の `it` は「props を増やして描き始めたら赤くなる」ための番人で、**型の番人が外された後に効く**。両方置くこと。

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/modules/issue-tree/HypothesisRow.dom.test.tsx
```

期待: FAIL。

- [ ] **Step 3: `HypothesisRow.tsx` を直す**

**(1) props**（`text` → `title` ほか。`rationale` / `onRationaleChange` / `onPromoteNote` を削除）:

```ts
export interface HypothesisRowProps {
  hypothesisKey: string
  label: string
  placement: HypothesisPlacement
  origin: { x: number; y: number }
  /** ソリューション仮説のタイトル。**`detail` と `value` は m4 では描かない**（m5 が設計する） */
  title: string
  /** FB の文言だけ（`feedbacks[].text`）。**`by` / `sentiment` / `date` は m4 では描かない** */
  notes: readonly string[]
  events: readonly JudgementEvent[]
  invalid: boolean
  suppressed: boolean
  expanded: boolean
  onExpand: () => void
  onTitleChange: (next: string) => void
  onFeedbackTextChange: (feedbackIndex: number, next: string) => void
  /** **最新イベントの根拠だけが編集できる**（`setEventNote` が同じ規則を持つ） */
  onEventNoteChange: (eventIndex: number, next: string) => void
  onAddFeedback: () => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState, cell: HypothesisCell) => void
  judgementMenu: React.ReactNode
}
```

**(2) 本文**:
- `props.text` を読んでいる3箇所（畳んだ行の `truncate` の中身とその空判定、展開時の `CellInput` の `value`）を `props.title` にする
- 「未判断」バッジの節（`placement.judgementBadge`）を `placement.feedbackBadge` に改名し、文言を `QUESTION_LABELS.feedback` にする（**畳んだ行と展開頭部の2箇所**）
- **「由来」の節（`panel.rationale` を読む `<div>` 2つ）を丸ごと削除する**
- FB のセルの `data-cell` を `cellOf({ cell: 'feedback', feedbackIndex: i })` に、`aria-label` は `${label} のFB${i + 1}` のまま、`onValueChange` を `props.onFeedbackTextChange` にする
- **`events.length > 0 && (<button ...>根拠へ</button>)` のブロックを丸ごと削除する。** あわせて `group/note` のラッパも不要になる（reveal 機構ごと消える）ので、`<div key={...} className="group/note absolute" ...>` から `group/note` を落とす
- 未使用になる import（`buttonBase`）を消す（`lint` が拾う）

**「根拠へ」を消すと `open-issues.md` の2項目が消せるようになる**（reveal 機構のテストが無い／`Shift+Tab` で届かない穴）。Task 12 で消すこと。

**(3) FB のキー**: `key={`note:${i}`}` を `key={`feedback:${i}`}` にする（**`data-cell` とは別物の React の key。ここは表示に影響しないが、名前を揃える**）。

- [ ] **Step 4: `IssueBox.tsx` を直す**

props を改名し、**旗の種別を受け取る**:

```ts
  /** 最新の旗の種別（旗が無ければ null）。**ラベルとアクセシブル名はここから引く** */
  eventKind: IssueEventKind | null
  /** 最新の旗の理由（旗が無ければ null）。理由は最新だけ編集できる */
  eventNote: string | null
  eventCellKey: string
  onEventNoteChange: (next: string) => void
  /**
   * 旗のトグル（入り＝旗が立っている／切り＝立っていない）。**必須にしてある**
   *——省略できると、旗を付ける動線がマウスから消えていても型は通り、
   * 画面は一見正常なまま「押す場所が無い」になる。
   * 旗が立っている箱では、このトグル自身が旗のバッジを兼ねる（面はエディタが渡す）
   */
  eventToggle: React.ReactNode
```

本文では:
- `placement.deferral` を読む3箇所を `placement.event` にする
- 理由の `aria-label` を `` `${label} の${eventKind === null ? '' : ISSUE_EVENT_LABELS[eventKind]}の理由` `` にする。**`eventKind === null` のとき理由の欄は描かれない**（`placement.event !== null` と対）ので、実際には常にラベルが入る。**それでも `null` を通す式にしておくこと**——型で `null` を除けないところに `!` を置くと、後から前提が変わったときに実行時に落ちる
- **`face` の分岐（優先順位 整合性エラー ＞ 抑制 ＞ 旗 ＞ 通常）は1文字も変えない。** 解決の箱も見送りの箱と同じ `surface-muted` で描く——**面が運ぶのは「凍結の範囲」であって旗の種別ではない**（M25 の判断。種別はバッジの文言が運ぶ）。**ここに `resolved` 用の新しい面を足さないこと**（色を足さないのは D8 の規律であり、見え方の設計は m5 の担当）

- [ ] **Step 5: テストが通ることを確認する**

```
npx vitest run src/modules/issue-tree/HypothesisRow.dom.test.tsx
```

期待: PASS。

- [ ] **Step 6: コミット**

```
git add src/modules/issue-tree/HypothesisRow.tsx src/modules/issue-tree/HypothesisRow.dom.test.tsx src/modules/issue-tree/IssueBox.tsx
git commit -m "feat(issue-tree): 部品を v3 へ（由来欄と「根拠へ」を削除、旗を種別で描く）"
```

---

### Task 9: エディタ（`IssueTreeEditor.tsx`）——配線と「解決 N」のチップ

**Files:**
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`
- Test: `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`、`src/modules/issue-tree/IssueTreeEdges.dom.test.tsx`

**Interfaces:**
- Consumes: Task 5 のコマンド、Task 6 の鍵と巡回列、Task 7 の配置、Task 8 の部品
- Produces: 型が通る画面。**このタスクの完了時に `npx tsc -b` が全件緑になる**

- [ ] **Step 1: 失敗するテストを書く（`IssueTreeEditor.dom.test.tsx`）**

フィクスチャを v3 に直したうえで:

1. `:170`〜`:202` の「メモを最新イベントの根拠へ移す」`it` を**丸ごと削除**する（**削除したことを報告に書く**）
2. `:947`〜`:955` の「由来の Enter は FB を生やす」`it` を**削除**する（由来の欄が無い。FB を生やす経路は「＋ FB」ボタンと FB セルの Enter が持つ）
3. `:957`〜`:968` の「由来を空にして Backspace しても仮説は消えない」`it` を**削除**する
4. `:1017` の `getAllByRole('textbox', { name: /の由来$/ })` を見ている行を**削除**する
5. `:902`〜`:934` の FB の追加・並び替えの `it` を、`feedbacks` の**文言の配列**を見る形に直す（Task 5 の `textsOf` と同じ）
6. `:277` の見送りトグルの `it` は、アクセシブル名が `課題1の見送り` のままであることを確かめる（旗が無い→見送り）
7. 次を足す:

```ts
it('解決の旗が立った課題は「解決」と描かれ、押すと外れる（見送りとは別の旗）', () => {
  const { onChange } = renderEditor({
    initial: {
      ...base,
      issues: base.issues.map((n, i) =>
        i === 0 ? { ...n, events: [{ kind: 'resolved' as const, note: '通知の集約で解ける', date: '2026-08-30' }] } : n,
      ),
    },
  })
  const toggle = screen.getByRole('button', { name: '課題1の解決' })
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(toggle).toHaveTextContent('解決')
  fireEvent.click(toggle)
  expect(onChange.mock.calls[0][0].issues[0].events).toEqual([])
})

it('帯には見送りと解決が別々のチップとして並ぶ（0件のほうは描かれない）', () => {
  renderEditor({
    initial: {
      ...base,
      issues: base.issues.map((n, i) =>
        i === 0 ? { ...n, events: [{ kind: 'resolved' as const, note: '', date: '2026-08-30' }] } : n,
      ),
    },
  })
  expect(screen.getByRole('button', { name: '次の解決へ' })).toHaveTextContent('解決 1')
  expect(screen.queryByRole('button', { name: '次の見送りへ' })).toBeNull()
})

it('要対応の内訳に「FB待ち」が出る（問いの数で数える）', () => {
  renderEditor({
    initial: {
      ...base,
      hypotheses: [
        {
          ...base.hypotheses[0],
          asks: [
            { id: 'ask_AAAAAAAAAA', text: '離脱しないか' },
            { id: 'ask_BBBBBBBBBB', text: '制限に当たらないか' },
          ],
          feedbacks: [],
          events: [{ kind: 'supported' as const, note: '', date: '2026-08-30' }],
        },
      ],
    },
  })
  expect(screen.getByRole('button', { name: '次のFB待ちへ' })).toHaveTextContent('FB待ち 2')
})
```

**チップのアクセシブル名の形（`次の◯◯へ`）は既存の実装から逐語で取ること**（`MissingTally` が組む。**言い換えない**）。実物を開いて確かめ、違っていたら**計画の誤りとして報告する**。

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/modules/issue-tree/IssueTreeEditor.dom.test.tsx
```

期待: FAIL。

- [ ] **Step 3: `IssueTreeEditor.tsx` を直す**

**(1) import**: `promoteNote` / `setRationale` / `setHypothesisText` / `addPendingNote` / `addPendingNoteAfter` / `setPendingNote` / `removePendingNote` / `movePendingNote` / `toggleDeferral` / `setDeferralNote` を、Task 5 の新しい名前に差し替える。`derive` からは `ISSUE_EVENT_LABELS` / `ISSUE_EVENT_NOTES` / `issueEventCount` / `issueEventLine` / `type IssueEventKind` を取る。`open-targets` からは `listFlaggedTargets` / `nextFlaggedTarget`。

**(2) `rects`**（`:452` 付近）: `rationale` の行を消し、`h.pendingNotes.forEach(...)` を `h.feedbacks.forEach((_f, feedbackIndex) => rects.set(hypothesisCellKey(key, { cell: 'feedback', feedbackIndex }), placement.rect))` にする。`issueDeferralCellKey` を `issueEventCellKey` に。

**(3) `goTo`**（`:508` 付近）: `if (focus.cell !== 'issue' && focus.cell !== 'deferral')` を `'issueEvent'` に直す。

**(4) `runRowCommand`**:
- `insert-item-after`: `rationale` の分岐を**削除**し、`note` の分岐を `feedback` にして `addFeedbackAfter(data, index, cell.feedbackIndex)` を呼ぶ。**「＋ FB」ボタンだけが末尾に足す**ので、コメントの「末尾に足すのはこちらだけ」は「末尾に足すのは帯のボタンだけ」に直す
- `delete-item`: `note` → `feedback`、`removeFeedback(data, index, cell.feedbackIndex)`
- `move-item-up` / `move-item-down`: 同上、`moveFeedback`
- `toggle-item-state`: **`note` の分岐（`promoteNote`）を丸ごと削除する。** 残るのは `hypothesis` の分岐（判断のドロップダウンを開く）だけで、FB セルでは `false` を返す（＝キーを消費しない）
- `deletableField` の式（`onRowKeyDown` の中）を `cell.cell === 'hypothesis' || cell.cell === 'feedback'` にする

**(5) 別枠のチップ**（`deferredCount` の節）を**種別で回す**形にする:

```ts
  /** 別枠のチップ。**見送りと解決を同じ形で並べる**——実効は同じ「配下を止める」で、
      意味だけが逆（追わない／答えが出た）なので、見た目の系統は分けない */
  const FLAG_KINDS: readonly IssueEventKind[] = ['deferred', 'resolved']

  const goToNextFlagged = (kind: IssueEventKind): void => {
    const next = nextFlaggedTarget(listFlaggedTargets(data, kind), lastFocus)
    if (next !== null) goTo(next)
  }
```

```tsx
          {FLAG_KINDS.map((kind) => {
            const count = issueEventCount(data.issues, kind)
            if (count === 0) return null
            return (
              <button
                key={kind}
                type="button"
                className={`shrink-0 transition-colors ${badgeClass('deferred')}`}
                aria-label={`次の${ISSUE_EVENT_LABELS[kind]}へ`}
                title={ISSUE_EVENT_NOTES[kind]}
                onClick={() => goToNextFlagged(kind)}
              >
                <StickyNoteOff aria-hidden="true" className="mr-1 size-3.5 shrink-0" />
                {issueEventLine(count, kind)}
              </button>
            )
          })}
```

**アイコンは両方 `StickyNoteOff` のまま。** 「解決」に別のアイコンを当てるのは見え方の設計であり **m5 の担当**（ここで思いつきの記号を置くと、m5 が剥がすことになる）。

**(6) 箱への配線**:

```tsx
          const latestFlag = node.events[node.events.length - 1]
          const flagKind = latestFlag === undefined ? null : latestFlag.kind
```

`IssueBox` へ `eventKind={flagKind}` / `eventNote={latestFlag?.note ?? null}` / `eventCellKey={issueEventCellKey(key)}` / `onEventNoteChange={(next) => onChange(setIssueEventNote(data, index, next), `${key}:event`)}` を渡す。

トグルのボタン:

```tsx
                  <button
                    type="button"
                    // **アクセシブル名は「何を入り切りするボタンか」で決める。**
                    // 押されているかは `aria-pressed` が運ぶ（名前と二重に述べない）。
                    // 旗が立っていない箱では、押すと付くのは見送りなので「見送り」
                    aria-label={`課題${index + 1}の${ISSUE_EVENT_LABELS[flagKind ?? 'deferred']}`}
                    aria-pressed={flagKind !== null}
                    className={`${TRIGGER_BASE} ${
                      flagKind === null
                        ? `${DEFER_TRIGGER_FACE} invisible group-hover/issue:visible group-focus-within/issue:visible`
                        : badgeClass(badgeVariantOf('deferred', suppressed))
                    }`}
                    // **立っている旗を押すと、その旗が外れる**（差し替えではない）。
                    // 解決を新規に付ける動線は m4 では足さない（m5 の担当）
                    onClick={() => apply(toggleIssueEvent(data, index, flagKind ?? 'deferred'))}
                  >
                    {ISSUE_EVENT_LABELS[flagKind ?? 'deferred']}
                  </button>
```

**`DEFER_TRIGGER_LABEL` は Task 7 で削除済み**なので、import から落とす。描くのも測るのも `ISSUE_EVENT_LABELS.deferred` の1つで、**幅を測る文字列と描く文字列が同じ定数から出ている**（`layout.ts` の `slotW` と、このボタンの中身）。

**(7) 行への配線**: `text={h.text}` → `title={h.title}`、`rationale` / `onRationaleChange` / `onPromoteNote` を削除、`notes={h.feedbacks.map((f) => f.text)}`、`onTitleChange`／`onFeedbackTextChange`／`onAddFeedback` を新しいコマンドへ繋ぐ。

**mergeKey の文字列**（`` `${rowKey}:text` `` 等）は**打鍵をまとめる鍵**なので、欄が変わったら鍵も変える: `` `${rowKey}:title` `` / `` `${rowKey}:feedback:${feedbackIndex}` `` / `` `${key}:event` ``。**同じ鍵を別の欄で使い回さないこと**——連続する編集が1コミットに畳まれるので、別の欄の打鍵が混ざると Undo が両方を戻す。

- [ ] **Step 4: `IssueTreeEdges.dom.test.tsx` のフィクスチャを v3 に直す**

`:49`〜`:50` の仮説と、課題の `events` に `date` を足すだけ。**`it` の主張（抑制の伝播）は変えない。**

- [ ] **Step 5: テストが通ることを確認する。ここで全件緑になる**

```
npm test
npx tsc -b
npm run lint
```

期待: **3つとも緑。** ここが波の終わりである。**3つの出力の末尾を報告に貼る。**

緑にならない場合、**残っている赤が「このタスクの積み残し」なのか「前のタスクの取りこぼし」なのかを切り分けて報告する**（辻褄を合わせて黙って直さない）。

- [ ] **Step 6: コミット**

```
git add src/modules/issue-tree/IssueTreeEditor.tsx src/modules/issue-tree/IssueTreeEditor.dom.test.tsx src/modules/issue-tree/IssueTreeEdges.dom.test.tsx
git commit -m "feat(issue-tree): エディタを v3 へ（FB・旗のトグル・解決のチップ。根拠へ移す経路を削除）"
```

---

### Task 10: 登録 Skill（スクリプト）

**Files:**
- Modify: `.claude/skills/issue-tree-register/scripts/issue-tree-write.mjs`
- Modify: `.claude/skills/issue-tree-register/scripts/new-id.mjs`
- Test: `src/modules/issue-tree/skill-write.smoke.test.ts`

**Interfaces:**
- Consumes: Task 4 の `derive.ts` のコピー（`D.QUESTION_LABELS` / `D.tallyLine` / `D.issueEventCount` / `D.issueEventLine` / `D.ISSUE_EVENT_NOTES` / `D.ISSUE_EVENT_LABELS`）
- Produces: `--check` / `--in --out` が v3 のファイルを扱い、**アプリと逐語一致する集計・別枠・整合性の文言**を出す

**ここは「実物が正」の代表箇所である**（Global Constraints「報告の規律」）。`issue-tree-write.mjs` の整合性の文言は `src/modules/issue-tree/consistency.ts` の**手複製**なので、**片方だけ直すとズレる**。Task 6 で `consistency.ts` の `message` を1文字も変えていないなら、**ここも文言は変えなくてよい**——変えるのは `h.text` → `h.title` の参照だけである。

- [ ] **Step 1: 失敗するテストを書く（`skill-write.smoke.test.ts`）**

フィクスチャ（`FIXTURE` と3つのインラインのデータ）を v3 の形に直す。あわせて:

1. import を `deferralLine, deferredIssueCount, ISSUE_DEFERRED_LABEL` から `issueEventCount, issueEventLine, ISSUE_EVENT_LABELS` に差し替える
2. 「見送りを掲げた課題があると『見送り N』の行が出て、無ければ出ない」の `it` を、**見送りと解決の両方**を見る形に広げる:

```ts
it('旗を掲げた課題があると「見送り N」「解決 N」の行が出て、無ければ出ない', () => {
  const flagged = {
    schemaVersion: 3,
    type: 'issueTree',
    title: '検証用',
    issues: [
      {
        id: 'issue_AAAAAAAAAA',
        parentId: null,
        text: '需要検証',
        events: [{ kind: 'deferred', note: '今回は追わない', date: '2026-08-30' }],
      },
      {
        id: 'issue_BBBBBBBBBB',
        parentId: 'issue_AAAAAAAAAA',
        text: '認知',
        events: [{ kind: 'resolved', note: '既存の導線で足りる', date: '2026-08-30' }],
      },
    ],
    hypotheses: [],
  }
  const out = check(flagged)
  expect(out.status).toBe(0)
  // アプリの導出と逐語で同じ行（「集計行がアプリと一致する」の別枠版）
  expect(out.stdout).toContain(issueEventLine(issueEventCount(flagged.issues as never, 'deferred'), 'deferred'))
  expect(out.stdout).toContain(issueEventLine(issueEventCount(flagged.issues as never, 'resolved'), 'resolved'))

  const none = { ...flagged, issues: flagged.issues.map((i) => ({ ...i, events: [] })) }
  const noneOut = check(none)
  expect(noneOut.stdout).not.toContain(ISSUE_EVENT_LABELS.deferred)
  expect(noneOut.stdout).not.toContain(ISSUE_EVENT_LABELS.resolved)
}, 20000)
```

3. 「要対応の集計行がアプリの tallyLine と逐語で一致する」の `it` はそのまま（**フィクスチャに FB待ちが立つ問いを1件入れて、`tallyLine` の内訳に「FB待ち」が現れる状態にする**——現れないと、この `it` は FB待ちについて何も検証していない）

- [ ] **Step 2: テストが落ちることを確認する**

```
npx vitest run src/modules/issue-tree/skill-write.smoke.test.ts
```

期待: FAIL（スクリプトがまだ v2 の名前を読む）。

- [ ] **Step 3: `issue-tree-write.mjs` を直す**

**正規形のキー順を書く作業は無い。** 引き継ぎ書は「正規形の書き出し順を新しいキーに合わせる」と書いているが、**実物のスクリプトはキー順を持っていない**——`C.serialize(data, schema)` が**実行時にスキーマの `properties` 記載順から導く**（スクリプト冒頭のコメントにそう書いてある）。したがって Task 1 でスキーマを書いた時点で正規形の順は決まっており、**ここで触るものは無い**。**手書きの順序表を作らないこと。**

変えるのは**4箇所だけ**:

1. 冒頭のコメントの「整合性検証（ID重複 / 循環 / 親の参照切れ / 多重ルート / 仮説の参照切れ）」はそのまま。**`schemaVersion` を書いている箇所があれば 3 に直す**（`grep -n "schemaVersion\|pendingNotes\|rationale" .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs` で確かめる）
2. 仮説の参照切れの警告で `label(h.text, i)` → `label(h.title, i)`
3. 要対応の内訳（`openAt`）で `hypotheses[i].text` → `hypotheses[i].title`、`D.QUESTION_LABELS.judgement` → `D.QUESTION_LABELS.feedback`
4. 別枠の出力を種別で回す:

```js
const deferredCount = D.issueEventCount(normalized.issues, "deferred");
const resolvedCount = D.issueEventCount(normalized.issues, "resolved");
```

```js
if (deferredCount > 0) console.log(`  ${D.issueEventLine(deferredCount, "deferred")}（${D.ISSUE_EVENT_NOTES.deferred}）`);
if (resolvedCount > 0) console.log(`  ${D.issueEventLine(resolvedCount, "resolved")}（${D.ISSUE_EVENT_NOTES.resolved}）`);
```

**`buildTree` / `findDuplicates` / `label` の複製は1文字も変えない**（`consistency.ts` が変わっていないため）。

- [ ] **Step 4: `new-id.mjs` に `ask` を足す**

```js
// 課題ツリーは prefix が3種類ある（issue / hypothesis / ask）。既定を issue にして
// いるのは課題のほうが件数が多いから。取り違えても issue-tree-write.mjs の
// pattern 検証（^issue_[A-Za-z0-9]{10}$ 等）が捕まえる。
```

```js
if (prefix !== "issue" && prefix !== "hypothesis" && prefix !== "ask") {
  console.error(
    `--prefix は issue / hypothesis / ask のいずれかです: 受け取った値 = ${JSON.stringify(prefix)}`
  );
  process.exit(2);
}
```

使い方のコメントにも1行足す:

```js
//   node scripts/new-id.mjs 2 --prefix ask        → ask_XXXXXXXXXX を2件
```

- [ ] **Step 5: 手でも1回通す（手順書どおりに動くかは、実行しないと分からない）**

```
node .claude/skills/issue-tree-register/scripts/new-id.mjs 2 --prefix ask
node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --check sample-project/課題ツリー.json
```

**`--check` はこの時点ではまだ v2 のお手本を見るので落ちる**（Task 11 で書き直す）。**落ちること自体を確認し、出力を報告に貼る**——スキーマ検証が v3 で効いていることの証拠になる。

- [ ] **Step 6: テストが通ることを確認する**

```
npm test && npx tsc -b && npm run lint
```

期待: **3つとも緑**（Task 9 以降は全件で回す）。

- [ ] **Step 7: コミット**

```
git add .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs .claude/skills/issue-tree-register/scripts/new-id.mjs src/modules/issue-tree/skill-write.smoke.test.ts
git commit -m "feat(issue-tree): 登録 Skill のスクリプトを v3 へ（ask の採番・別枠2種）"
```

---

### Task 11: 登録 Skill（`SKILL.md`）とお手本と配布ドキュメント

**Files:**
- Modify: `.claude/skills/issue-tree-register/SKILL.md`
- Modify: `sample-project/課題ツリー.json`
- Modify: `src/core/reading-guide.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 10 のスクリプト
- Produces: v3 で書ける手順書と、v3 のお手本

- [ ] **Step 1: お手本を v3 に書き直す**

`sample-project/課題ツリー.json` を書き直す。**構成は既存を保つ**（同じ課題・同じ仮説・同じ判断。`id` も変えない）うえで:

- すべての `events` に `date` を足す。**日付は「そのとき決まった順」に見える値を入れる**（例: 棄却 → 支持 の順に `2026-08-20` → `2026-08-22`）。**すべて同じ日にしないこと**——前後が読めることがこの欄を足した理由なので、お手本でそれが見えないと何を示しているか分からない
- `text` → `title`、`rationale` → **`value`**（既存の由来の文が「なぜ有望か」を書いているものはそのまま `value` へ。書いていないものは `''`）、`detail` は**1件だけ**書いて残りは `''`（お手本は「全部埋めろ」ではなく「埋められる」を示す）
- `pendingNotes` の1件（採用担当レビューの FB）を `feedbacks` の1件にし、**`by: '採用担当'` / `sentiment: 'concern'` / `date` を入れる**
- **`asks` を1件以上入れて、FB待ちが1件立つ状態を作る**（お手本が新機能を1つも見せないのは意味が無い）
- **`resolved` の旗を1件立てる**（`issue_GVSuierbYh`「結果表示画面に何を出すか」あたりが候補。**その配下に問いが残っていないことを確かめてから**選ぶこと——旗の実効は「配下の問いを抑制する」なので、抑制するものが無い課題に立てても何も示さない）

書き終えたら**必ずスクリプトを通す**（手で整形しない）:

```
node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --in sample-project/課題ツリー.json --out sample-project/課題ツリー.json
```

**出力の集計行と別枠の行を報告に貼る。** それが Step 3 の `README.md` に書く内容の**逐語の出どころ**になる（言い換えない）。

- [ ] **Step 2: `SKILL.md` を書き直す**

変える箇所は次のとおり。**`sequence-register` など他の Skill の文体・見出しの立て方に揃える**（既存の `SKILL.md` の構成をそのまま保ち、中身だけ差し替えるのが安全）。

1. **frontmatter の `description`**: 「schemaVersion 2」→「schemaVersion 3」。**起動条件の列挙は変えない**（誤起動の調整は `evals` が無い状態では測れない。範囲外）
2. 「このSkillが紐づく対象」の節: `schemaVersion 3`。**「アプリが schemaVersion 1 のファイルを開くと 2 へ移行して保存する」の一文を、v3 の事実に直す**——「旧版のファイルは版番号だけが上がり、v3 の形でなければ検証で落ちて開けない（互換の変換は用意しない）」
3. 「3. 仮説（hypotheses）を組む」を書き直す。キーは `{ id, issueId, title, detail, value, asks, feedbacks, events }`:
   - **`title`＝ソリューション仮説（何を作るか）／`value`＝価値仮説（なぜ効くか）は別の主張である。** 会話に片方しか無ければもう片方は空のままにする。**埋めるために推測しない**
   - **`detail`** は作り方の詳細。空でよい
   - **`asks`（聞きたいこと）**: 「レビューで何を聞けば支持・棄却が判定できるか」。**会話に問いが出ていれば書き、出ていなければ空配列**。`id` は `node scripts/new-id.mjs 2 --prefix ask` で採番する
   - **`feedbacks`**: `{ askId, text, by, sentiment, date }`。**`by`（誰の発言か）は会話から取る。分からなければ空文字。推測しない**。`sentiment` は `like` / `concern` / `question` / `note` の4語で、**迷ったら `note`**（嘘の分類を残さない）。`askId` は**用意した問いに答えているときだけ**その `id` を入れ、それ以外は `null`
   - **`date` は必ず入れる**（`YYYY-MM-DD`）。**会話の日付が分かればそれ、分からなければ今日**
4. **「`pendingNotes` は判断待ちの下書きである」の節を丸ごと書き直す。** 新しい規律:
   - **FB は移動も昇格もしない。記録としてその場に残る**
   - **判断の理由（`events[].note`）は人が自分の言葉で書く。** AI が FB の文言をそのまま `note` へ写さない
   - 「AIがこれを勝手に判断イベントへ昇格させない」の表（人間の決定 vs AI の推測）は**そのまま残す**——線引きの規律は変わっていない
5. 「4. ID採番」に `ask` を足す
6. 「5. 書き込み」の構造の JSON 例を v3 に差し替える（**Step 1 で書き出したお手本の一部を逐語で使う**。手で書くと形が食い違う）
7. 「6. 報告」の箇条書き:
   - 「**`pendingNotes` に入れたフィードバック**」→「**`feedbacks` に入れたフィードバック（判断へは昇格させていないこと）**」
   - 「**`rationale` を空にしたもの**」→「**`value` / `detail` を空にしたもの（会話に無かったこと）**」
   - 集計行の内訳を `仮説なし N ／ 未決 N ／ 保留 N ／ FB待ち N` に直す
   - 別枠の行を「見送り N」と「解決 N」の2つにする（**字面の正は `scripts/derive.ts` の `issueEventLine` / `ISSUE_EVENT_NOTES`** と書く）
8. 「7. フェーズB」の問いの表を4種に直す（`未判断` → `FB待ち`、条件は「文言のある問いに FB が0件」）。**「祖先の課題が見送られている配下には問いが立たない」を「祖先の課題に旗（見送り／解決）が立っている配下には問いが立たない」に直す**
9. 「やらないこと」:
   - 「**`pendingNotes` を勝手に空にしない**」→「**`feedbacks` を勝手に消さない**」
   - 「**`rationale` を埋めるために由来を作らない**」→「**`value` / `detail` / `asks` を埋めるために推測しない**」
   - **「解決の旗はユーザーが解決したと言ったときだけ立てる」を足す**（見送りと同じ規律。AI が判断しない——これは決定の記録である）
   - **「FB の文言を判断の根拠へ写さない」を足す**

**課題の `events` の節**（「2. 課題（issues）を組む」の中）も直す: 旗は `deferred` と `resolved` の2種で、**同時に立ってはならない**こと、**列は 0 件か 1 件**（差し替えは消してから足す）、**`date` は必須**であること。

- [ ] **Step 3: `README.md` と `src/core/reading-guide.md` を直す**

`README.md`:
- 145行目付近のお手本の説明を、**Step 1 のスクリプト出力から逐語で**書き直す（要対応の内訳と別枠の行）
- 91〜93行目のスクリーンショットの撮り方のコメントから「由来」を落とす（展開に出るのは判断・以前の判断・FB）
- 28行目の表の1行は「ステータスを持たず、追記だけで現在が決まる」のままでよい（**確かめてから触らないこと**）

`src/core/reading-guide.md`（配布物 `README-for-AI.md` の原本）:
- 15行目の ID プレフィクスの列挙に `ask_`＝課題ツリーの「聞きたいこと」を足す
- 53〜64行目の「課題ツリー」の節を v3 に直す。**直す点は5つ**:
  1. 立つ問いの4つ目を「`pendingNotes` が空でなければ『未判断』」→「**文言のある問い（`asks`）に FB が1件も無ければ『FB待ち』**」
  2. 「課題ノードの `events`（見送り `deferred` だけ）」→「**旗は `deferred`（見送り）と `resolved`（解決）の2種。意味は逆だがどちらも配下の問いを止める。同時には立たない**」
  3. 「`pendingNotes` は『まだ判断に紐づいていない下書き』」の項を「**`feedbacks` は記録であって下書きではない。判断の理由は人が書く。FB の文言を `events[].note` へ写さない**」に直す
  4. 「`rationale`（仮説の発想の由来）が空なのは未決ではない」→「**`detail` / `value` / `asks` が空なのは未決ではない。埋めるよう促さない**」
  5. **「イベントと FB は `date`（`YYYY-MM-DD`）を持つ。手で書き換えない——アプリと登録 Skill が追記時に入れる」を足す**

**`reading-guide.test.ts` は本文を固定していない**（先頭500文字の注意書きとファイル名だけ）ので、本文の書き換えでテストは赤くならない。**だからこそ、書き換え漏れに気づく仕組みが無い**——上の5点を1つずつ「それを述べている文はどれか」を指させる形で確認すること（通読して違和感が無いことは確認ではない）。

- [ ] **Step 4: 全件で確認する**

```
npm test && npx tsc -b && npm run lint
```

期待: 3つとも緑。**出力の末尾を報告に貼る。**

あわせて、大きく書き換えた4ファイルに NUL バイトが混入していないことを確かめる:

```
git diff --stat
git diff | grep -aPc "\x00"
```

期待: `grep` が 0 件（`grep` は一致0でステータス1を返すので、**出力が `0` であること**を見る。`git diff --numstat` がハイフンを返さないことは証拠にならない——M29 で2回踏んだ）。

- [ ] **Step 5: コミット**

```
git add .claude/skills/issue-tree-register/SKILL.md sample-project/課題ツリー.json src/core/reading-guide.md README.md
git commit -m "docs(issue-tree): 登録 Skill・お手本・配布ガイドを v3 へ"
```

---

### Task 12: 設計ノートの改訂（D2・D7・D9 を改め、D12 を足す）

**Files:**
- Modify: `docs/issue-tree/仮説検証モジュール-設計ノート.md`

**Interfaces:**
- Consumes: Task 1〜11 で確定した事実
- Produces: 設計の「正」が実装に追いついた状態

**設計ノートは「正（規範）」の文書である**（`CLAUDE.md`）。**過去の判断を消さず、反転したことが読める形で書く**——D5・D6 が「~~区別する~~ → 区別しない（issue-tree-m3 で反転）」という形になっているので、それに倣う。

- [ ] **Step 1: D2（追記専用の範囲）に節を足す**

見出しを `### D2. 仮説はミュータブルな状態を持たない。単一の追記専用イベント列だけを持つ（**課題側の旗だけは issue-tree-m3 で追記専用をやめ、issue-tree-m4 で2種になった**）` に直し、末尾に足す:

- **課題の `events` に立つのは旗2種（`deferred` / `resolved`）になった。** 追記専用でないこと・列が 0 件か 1 件であること・トグルであることは変わらない。**差し替え（見送り → 解決）は、前の1件を消してから足す**——2件並べると「いまどちらか」が列の中身に依存し始め、D2 の芯（最新1件で決まる）が崩れる
- **イベントは `date` を持つようになった。** 「日時はデータに持たない（配列順が時系列の正、厳密な日時は Git 履歴が正）」という当初の註を**表示用の日付に限って改める**——**FB と判断の前後は会議中に画面で見える必要がある**（Git 履歴を開きに行けない）。**手で打たせない。アプリと Skill が追記時に入れる**——手入力の欄にすると更新忘れで嘘をつく（ミュータブルなステータス欄を捨てた D2 と同じ理屈）。**厳密な時刻は引き続き Git 履歴が正**であり、粒度は日に留める

- [ ] **Step 2: D7 を反転させる**

見出しを `### D7. ~~仮説に rationale（発想の由来、自由記述）を持たせる~~ → **廃止し、文言を3つに割った（issue-tree-m4 で反転）**` に直し、本文の後に足す:

- **由来という欄は無くなった。** 代わりに仮説の文言が3つに割れた——`title`（ソリューション仮説：何を作るか）／`detail`（その詳細）／`value`（価値仮説：なぜ効くと考えるか）
- **反転の理由**: 欄が1つしか無く、空欄に何を書けばよいかが画面から分からなかった。「何を作るか」と「なぜ効くか」は**別の主張**で、レビューで問われるのも別々である。由来（この仮説がどこから来たか）は価値仮説の中で書ける
- **どれも空を許し、warning にしない**という D7 の規律は3つとも引き継ぐ

- [ ] **Step 3: D9 を書き直す**

見出しを `### D9. ~~FBメモは「判断イベントの下書き」として pendingNotes に持つ~~ → **FB は属性を持つ記録であり、移動も昇格もしない（issue-tree-m4 で反転）**` に直す。旧本文は残し、後に足す:

- **「根拠へ移す」（`promoteNote`）を廃止した。** 実際は複数の FB を踏まえて自分の言葉で理由を書くのに、FB の文言をそのまま理由欄へ移す操作は**分かりづらいわりに何も要約していない**。FB は移動も昇格もせず、記録としてその場に残る
- **これに伴い「まだ判断に紐づいていないメモ」という概念が消え、`pendingNotes` という名前も消えた**（`feedbacks`）
- **FB は属性を持つ**（`askId` / `by` / `sentiment` / `date`）。誰が言ったか・いつか・賛成か懸念か質問かが消えていると、判断の根拠を書くときに**SH の発言だったのか雑談だったのかが後から区別できない**
- **FB は削除できる。判断は追記専用のまま。** 打ち間違いが残るのは実務的でない一方、判断の履歴は「そのとき何を根拠に決めたか」の記録である。**この非対称のために配列を2本に分けている**——1本に混ぜると「追記専用」を配列単位で言えなくなる
- **「聞きたいこと」（`asks`）を持つようになった。** 仮説は「支持・棄却を判定できる主張」だと定義してある（D1）のに、**何をもって判定するかを書く場所が無かった**。レビュー前に問いを書いておくと、それがそのまま反証条件になる。問いは複数立つので配列で、**FB はどれかの問いにぶら下がるか、どこにも属さない**（`askId: null`）——**用意した問いの外から来る指摘こそ重いので、紐づけを強制しない**
- **「未判断」の問いは落とし、「FB待ち」を新設した。** v2 の「未判断」は「まだ拾っていない FB がある」を意味していたが、拾う操作（根拠へ移す）が無くなったので**解消手段が消えた**。代わりの定義（最新の判断より後に届いた FB がある）は**検討したうえで入れないと決めた**——日付を持つので、要望が出たら後から導出だけで足せる

- [ ] **Step 4: D12 を新設する**

```
### D12. 課題に「解決」の旗を立てる（人が押す旗であって、導出ではない）
```

書く内容:

- **`resolved` は人の表明**である。「この課題は出てきたソリューションで解決できる＝これ以上の検証は不要」を意味する
- **導出ではない。** 支持された仮説があることと、課題が解決したことは**別**である——支持＝主張が成り立つ、であって**作ると決めたわけではない**
- **見送りと同じく配下の問いを抑制する。** これが旗の実効で、押した瞬間に要対応の数が減る。**設計ノートの価値1（PoC 終了判定の根拠が構造で見える）はここで回収される**
- **意味は見送りと逆（追わない／答えが出た）なので、両方同時に立ってはならない**
- **D2 の「ミュータブルな状態を持たない」とは矛盾しない**——`resolved` は導出値の複製ではなく、**人が下した判断そのもの**である（見送りと同じ位置づけ）
- **面は見送りと同じ `surface-muted`。色を足さない**（D8 の規律）。運ぶのは「凍結の範囲」であって旗の種別ではなく、種別はバッジの文言（「見送り」／「解決」）が運ぶ
- **集計の別枠は「見送り N」と「解決 N」が並ぶ。** 実効は同じでも意味が逆なので、1つの数に混ぜると台帳として読めない

- [ ] **Step 5: スコープ節（IN / OUT）を見直す**

`## スコープ` の IN / OUT に、v3 で状況が変わったものがあれば直す。**変わっていなければ触らない**（「矛盾していない」を「書いてある」と読み替えないのと同じで、**触る必要が無いことを確かめた**と報告に書く）。

- [ ] **Step 6: 確認——決定を1つずつ挙げて、それを述べている文を指す**

**通読して違和感が無いことは確認ではない**（issue-tree-m3 の教訓。同じ作業で3ラウンド掛かった）。次の8つについて、**設計ノートの中でそれを述べている文を1つずつ引用して報告に貼る**:

1. `rationale` を廃止し、文言を3つに割ったこと（と、その理由）
2. `asks` を持つこと（と、判定基準が書けなかったという理由）
3. FB が属性を持つこと
4. **`promoteNote` を廃止したこと**（と、その理由）
5. FB は消せるが判断は消せないこと（と、配列が2本ある理由）
6. `date` を持つこと（と、手で打たせない理由）
7. `resolved` が人の表明であって導出ではないこと
8. 「未判断」を落とし「FB待ち」を新設したこと（と、代替案を入れないと決めたこと）

**1つでも「それを述べている文」が見つからなければ、書き足してから次へ進む。**

- [ ] **Step 7: コミット**

```
git add docs/issue-tree/仮説検証モジュール-設計ノート.md
git commit -m "docs(issue-tree): 設計ノートを v3 へ（D2・D7・D9 を改め、D12 を足す）"
```

---

### Task 13: 最終ブランチレビュー

**Files:** なし（レビューと、指摘への修正）

- [ ] **Step 1: 全件で緑を確認する（対象を絞らない）**

```
npm test
npx tsc -b
npm run lint
```

Rust 側も回す（`npm test` には含まれない）:

```
cd src-tauri && cargo test
```

**4つの出力の末尾を報告に貼る。**

- [ ] **Step 2: ブランチ全体のレビューを依頼する**

`superpowers:requesting-code-review` を使い、**ブランチ全体の差分**（`main` からの全コミット）をレビューさせる。**特に見てほしい点を渡す**:

- **継ぎ目**: Task 5（コマンド）と Task 9（エディタ）の間——`FocusTarget` の `cell` の名前、`mergeKey` の文字列、`removeFeedback` の行き先
- **`derive.ts` のコピー**が最新か（`skill-copy.test.ts` は見ているが、**`cp` を忘れて手で書き写していないか**を目でも見る）
- **文言の逐語一致**: アプリの `tallyLine` / `issueEventLine` / `ISSUE_EVENT_NOTES` と、Skill の出力・`SKILL.md`・`reading-guide.md`
- **「出さないと決めた欄」が本当に出ていないか**（`detail` / `value` / `asks` / `by` / `sentiment` / `date`）
- **消したはずのものが残っていないか**: `promoteNote` / `rationale` / `pendingNotes` / `deferralLine` / `DEFERRAL_NOTE` / `ISSUE_DEFERRED_LABEL` / `DEFER_TRIGGER_LABEL`

```
grep -rn "promoteNote\|rationale\|pendingNotes\|deferralLine\|DEFERRAL_NOTE\|ISSUE_DEFERRED_LABEL\|DEFER_TRIGGER_LABEL\|judgementBadge" src/ .claude/skills/issue-tree-register/ schemas/ sample-project/
```

期待: **0件**（`docs/` は履歴として言及するので対象外）。**出力を報告に貼る。**

- [ ] **Step 3: 指摘に対応する**

`superpowers:receiving-code-review` に従う。**技術的に納得できない指摘は、確かめてから議論する**（形だけ同意して直さない）。

- [ ] **Step 4: 修正後にもう一度全件**

```
npm test && npx tsc -b && npm run lint
```

- [ ] **Step 5: コミット**

```
git add -A
git commit -m "chore(issue-tree): 最終レビューの指摘に対応"
```

---

### Task 14: ドキュメントへの反映（実機確認とは束ねない）

**Files:**
- Create: `docs/history/issue-tree-m4-schema-v3.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`
- Modify: `docs/lessons-for-planning.md`（教訓があれば）
- Modify: `docs/README.md`（履歴表）

**この Task と Task 15（実機確認）を束ねないこと**（教訓: 束ねるとドキュメントだけが完了してコミットが積まれ、実機確認は未実施のまま埋没する）。

- [ ] **Step 1: 申し送りを書く（`docs/history/issue-tree-m4-schema-v3.md`）**

**そのとき何が起きたか**を書く。以後変えない。含めるもの:

- 実装で確定した事項（本計画の「この計画が置いた決定」A〜G のうち、実装で形が変わったものは**実際に採った形**を書く）
- **見つかった欠陥**（実装中・レビューで出たもの）
- **移行を用意しないと決めたこと**と、その決定者（ユーザー、2026-08-30）
- **`open-issues.md` から消した項目と足した項目**（何を消し、何を足したか）
- **実機確認は未実施であること**と、**確認項目のチェックリストを空のまま**写す（下の Task 15 の一覧）

- [ ] **Step 2: `docs/open-issues.md` を編集する**

**消す**（引き継ぎ書が指定。実物を確かめてから消すこと）:

- 「**課題ツリーの UI の reveal 機構と `onCloseAutoFocus` の抑止にテストが無い**」のうち、**「根拠へ」ボタンの reveal 機構に関する部分**——ボタンごと無くなった。**`onCloseAutoFocus` の抑止に関する部分は残る**（判断のドロップダウンは健在）ので、**項目を丸ごと消さず、reveal に関する記述だけを削る**
- その入れ子の「**同じ reveal 機構に、`Shift+Tab` では届かないという実際の穴がある**」——**丸ごと消す**
- 「**`setHypothesisText` / `setRationale` に戻り値型注釈が無い**」——**丸ごと消す**（`setRationale` は消え、`setHypothesisTitle` には最初から注釈がある）

**据え置く**（引き継ぎ書が明記）: 仮説を別の課題へ付け替える手段が無い／判断の誤操作／ID 重複ファイルで同じ行が両方の箱に描かれる。

**足す**（`[issue-tree-m4]` タグで）:

- **存在しない `ask` を指す FB を、整合性検証が見ていない**（`src/modules/issue-tree/consistency.ts`）: `askId` が実在しない問いを指していてもレベル1・レベル2のどちらも通る。`feedbacks` は id を持たず添字で扱う設計なので参照は片方向だけだが、**参照切れの FB は「答えたはずの問いがいつまでも FB待ちのまま」という形で静かに要対応を残す**。仮説の `issueId` の参照切れ（`missing-issue`）と同じ形で足せる
- **FB待ちのチップの数と、巡回列の長さが一致しない**（`src/modules/issue-tree/open-targets.ts`）: 数える単位は問い（ask）だが、行き先は仮説につき1つしか出せない（**m4 には問いを1件ずつ指せる DOM のセルが無い**）。「未決 2」なら2回で一巡するのに、FB待ちではそれが成り立たない。**m5 が問いに固有のセルを与えたときに解消する**
- **`resolved` を新規に付ける動線が画面に無い**（`src/modules/issue-tree/IssueTreeEditor.tsx`）: スキーマ・コマンド・導出・Skill は完全に扱うが、**アプリから解決の旗を立てる方法が無い**（読めるが書けない）。**m5 の担当として意図的に残した**もので、m5 のマージまでの間だけの状態である
- **`detail` / `value` / `asks` の編集コマンドが無い**（`src/modules/issue-tree/commands.ts`）: 同上。**m5 が画面と一緒に決める**
- **`date` が「いつ言われたか」を保証しない**（`src/core/today.ts` / `commands.ts`）: アプリが入れるのは**追記した日**であり、会議の日が別なら食い違う。Skill 側は会話から日付を取れるが、アプリには手で直す欄が無い（**意図的**——手入力の欄は更新忘れで嘘をつく）。**過去の日付を記録したい要望が出たら、そのとき形を決める**

- [ ] **Step 3: `docs/overview-rev.md` へ反映する**

**反映は完了コミットで済ませ、TODO として申し送りに残さない**（M4 の教訓）。触る可能性がある章:

- **4章**（登録 Skill の規約。集計結果の逐語一致）——「FB待ち」と別枠2種が増えたことを、**規約の記述が既にカバーしているなら触らない**
- **5章**（ID 規約）——**`ask_` が3つ目のプレフィクスとして増えた**。プレフィクスの一覧があるなら足す
- **9章**（配色・バッジ）——**新しいトークンも色も足していない**ので、触る必要は無いはず

**「触る必要が無い」と判断したら、その判断を報告に書く**（章を開いて確かめたうえで）。

- [ ] **Step 4: `docs/lessons-for-planning.md` に教訓があれば足す**

**計画そのものに含まれていた誤り**が出たら、**次の計画に適用できる形に一般化して**足す。無ければ足さない（無理に足さない）。

- [ ] **Step 5: `docs/README.md` の履歴表に行を足す**

- [ ] **Step 6: NUL バイトの走査**

```
git diff --cached | grep -aPc "\x00"
```

期待: `0`。

- [ ] **Step 7: コミット**

```
git add docs/
git commit -m "docs: issue-tree-m4 の申し送りと残件・rev の反映"
```

---

### Task 15: 実機確認（人間の作業。エージェントは実行できない）

**サブエージェントは Tauri の GUI を操作できない。** この Task は人間が行い、**結果が出るまで申し送りには「未実施」と明記し、チェックリストを空のまま残す**（`open-issues.md` にも1項目として載せる。`history/` にだけ書くと幽霊になる）。

```
npm run tauri dev
```

- [ ] 1. `sample-project/` を開き、**課題ツリーが v3 のお手本で開ける**（一覧表示のみ・編集不可になっていない）
- [ ] 2. 帯の要対応の内訳に **「FB待ち N」** が出る。チップを押すと、その仮説へ視点が飛ぶ
- [ ] 3. 帯の別枠に **「見送り N」と「解決 N」の2つ**が並ぶ。それぞれ押すと、その旗を掲げた課題へ飛ぶ
- [ ] 4. **解決の旗を掲げた課題の箱に「解決」と描かれ**、理由の行が読める。配下の箱が薄くなっている
- [ ] 5. 旗の無い課題にホバーすると「見送り」のトグルが出て、押すと旗が立ち、**理由の欄にフォーカスが移る**
- [ ] 6. **解決の旗を押すと外れる**（差し替えではなく、外れること）
- [ ] 7. 仮説を展開すると、**判断・以前の判断・FB の3節だけ**が出る（**「由来」の欄が無い**）
- [ ] 8. **「根拠へ」ボタンがどこにも無い**。FB の欄で `Ctrl+Enter`（主修飾キー＋Enter）を押しても何も起きない
- [ ] 9. FB の欄で `Enter` を押すと**押した位置の次**に1件増える。`Alt+↑↓` で並び替わる。空欄で `Backspace` すると消える
- [ ] 10. **先頭の FB を消すと、フォーカスが仮説の文言へ戻る**（宙に浮かない）
- [ ] 11. 判断を追加すると、**その日の日付が入る**（ファイルを開いて `date` を確かめる）
- [ ] 12. **`detail` / `value` / `asks` / FB の `by` / `sentiment` / `date` が画面のどこにも出ていない**（m5 が設計する）
- [ ] 13. **登録 Skill を「課題ツリー」と言わずに呼んで起動するか**（`evals` が無いので、これが唯一の手立て。`open-issues.md` の既存項目）
- [ ] 14. Skill の置き先で `npm install` した後、`--check` と `--in/--out` が通る（**手順書を実行した後の状態も成果物の状態である**）
- [ ] 15. **開発機と違う OS でも1回**（`fs` scope の glob 判定は `require_literal_leading_dot` の既定が unix と Windows で反転する）

**確認で見つかったことは `docs/history/issue-tree-m4-schema-v3.md` に追記し、直すかどうかは別途判断する**（このマイルストーンの中で直すとは限らない）。

---

## 自己レビュー（計画時点）

### 1. 引き継ぎ書の網羅

引き継ぎ書の「v2 → v3 の差分」と「Skill の更新」の各行に、対応するタスクがあることを確かめた。

| 引き継ぎ書の項目 | 担当タスク |
| --- | --- |
| `hypothesis.text` → `title` | 1（スキーマ）・5（コマンド）・8（部品）・9（配線） |
| `detail` / `value` の新設 | 1。**編集コマンドと画面は m5**（決定C。範囲外として明記） |
| `rationale` の廃止 | 1・5・7（節を落とす）・8・12（D7 の反転） |
| `asks` の新設 | 1・4（FB待ちの導出）・10/11（Skill）。**編集コマンドと画面は m5** |
| `pendingNotes` → `feedbacks` | 1・5・7・8・9 |
| `promoteNote` の廃止 | 5（関数）・8（ボタン）・9（キー経路）・12（D9）・14（open-issues の2項目） |
| イベントの `date` | 1・3（`todayString`）・5（刻印）・12（D2 の註を改める） |
| 課題の `resolved` | 1・4（抑制と別枠）・5（トグル）・7（バッジ幅）・8（ラベル）・9（チップ）・12（D12） |
| 「未判断」の廃止・「FB待ち」の新設 | 4・6（巡回列）・7（行バッジ）・9（帯） |
| 抑制の条件に `resolved` を加える | 4（**式は変えずに済むことを確かめてある**——`latestKind !== null` は旗の種別を見ていない） |
| 集計の別枠に「解決 N」 | 4（`issueEventCount` / `issueEventLine`）・9（チップ）・10（Skill の出力） |
| 移行（v2 → v3） | 2。**「考慮しない」がユーザー決定**なので、変換ではなく**「移行後に検証で落ちること」をテストで固定する**形に変えてある |
| Skill: スキーマのコピー | 1（`cp`） |
| Skill: `derive.ts` のバイト一致コピー | 4（`cp`） |
| Skill: `ask_` の採番 | 10（`new-id.mjs`） |
| Skill: 正規形の書き出し順 | **作業無し**（実行時にスキーマから導出。Task 10 に明記した） |
| Skill: `SKILL.md` | 11 |
| Skill: `evals/` | **範囲外**（`open-issues.md` の既存項目として据え置く。Global Constraints に明記） |
| お手本 `sample-project/課題ツリー.json` | 11 |
| 消える open-issues の2項目 | 14 |

### 2. 計画を書いた時点で潰した矛盾（3件）

**教訓「計画が実物の挙動を2箇所で述べていたら、着手前に突き合わせる」に従って自分で洗った結果。**

1. **`DEFER_TRIGGER_LABEL` の扱いが Task 7 と Task 9 で逆だった**（片方は「残す」、片方は「消して寄せる」）。→ **Task 7 で削除する**に統一した
2. **Task 8 のテストが存在しない props（`expandedProps.detailTextForAssertion`）を参照していた。** → フィクスチャに置く目印の文字列（`DETAIL_SENTINEL` 等）を実名で書く形に直した
3. **引き継ぎ書の「正規形の書き出し順を新しいキーに合わせる」は、実物には該当する作業が無い**（`serialize` がスキーマから実行時に導く）。→ Task 10 に「作業は無い。手書きの順序表を作らないこと」と明記した

### 3. 型と名前の一貫性

以下は**複数のタスクをまたいで参照される名前**である。**Task N で定義し、Task M で使う**という関係が全部繋がっていることを確かめた。

| 名前 | 定義 | 使う先 |
| --- | --- | --- |
| `IssueTreeSchemaVersion3` | Task 1（生成） | 2・4・5・6・7 |
| `IssueEventKind` | Task 4（`derive.ts`） | 5（`toggleIssueEvent`）・6（`listFlaggedTargets`）・8（`IssueBoxProps.eventKind`）・9 |
| `HypothesisQuestions.feedback: number` | Task 4 | 6（`q.feedback > 0`）・7（行バッジ）・4（`tallyQuestions`） |
| `ISSUE_EVENT_LABELS` / `ISSUE_EVENT_NOTES` / `issueEventCount` / `issueEventLine` | Task 4 | 7（幅）・8（ラベル）・9（チップ）・10（Skill の出力） |
| `todayString` | Task 3 | 5（既定引数） |
| `FocusTarget`（`issueEvent` / `feedback`） | Task 5 | 6（`cellKey`・巡回列）・9 |
| `HypothesisCell`（`feedback`） | Task 6 | 8（`onFieldKeyDown`）・9（`runRowCommand`） |
| `IssuePlacement.event` / `HypothesisPlacement.feedbackBadge` / `SECTION_LABELS` | Task 7 | 8 |
| `HypothesisRowProps` / `IssueBoxProps` | Task 8 | 9 |
| `listFlaggedTargets` / `nextFlaggedTarget` | Task 6 | 9 |

**`derive.ts` が値 import を持たない制約**（Skill のバイト一致コピーが Node の型ストリップで読まれる）は、本計画が `derive.ts` に足すものすべて（`ISSUE_EVENT_LABELS` / `ISSUE_EVENT_NOTES` / `issueEventCount` / `issueEventLine` / `awaitingAskCount`）が満たしている——**型注釈と `const` だけで、`enum` もクラスも値 import も無い**。`skill-copy.test.ts` がこれを見る。

### 4. 残っている不確かさ（実装者が最初に踏む可能性のある順）

- **`json-schema-to-typescript` の生成名**（Task 1 Step 5 で実物を確かめる手順を入れてある）。`$defs` のキー名から型名が作られるという前提が外れると、以後のタスクの型名が全部ずれる
- **`layout.test.ts` の概算測定器で「解決」が「見送り」より狭い**という前提（Task 7 Step 1 に、外れたときの代替の見方を書いてある）
- **`MissingTally` のチップのアクセシブル名の形**（`次の◯◯へ`）。Task 9 Step 1 に「実物から逐語で取る」と書いてある——**計画が言い換えていたら、実物が正**
- **`src/core/load.test.ts` の旧版フィクスチャ**が、v3 の形＋古い版番号になっているか（Task 2 Step 6）。`migrate` が形を変えない以上、そうでないと `it` の主張が成立しない

---

## 実行の選択

**Plan complete and saved to `docs/superpowers/plans/2026-08-30-issue-tree-m4-schema-v3.md`.**

1. **Subagent-Driven（推奨）** — タスクごとに新しいサブエージェントを立て、間でレビューする
2. **Inline Execution** — このセッションで `superpowers:executing-plans` に従い、チェックポイントごとにまとめて進める
