# 課題ツリー 仮説まわりの UI 刷新 issue-tree-m5 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仮説の詳細を「フォーカスした仮説1件だけが開く小さなパネル」から「課題ノードごと開く広いパネル」へ変え、m4 でデータに入った `detail` / `value` / `asks` を**画面に出す**。あわせてキーボードの操作言語を課題の追加・削除・移動だけに絞り、仮説の追加・削除・判断の変更をマウスの動線に移す。

**Architecture:** データの芯（追記専用の `events` から現在の判断を導出する。設計ノート D2）は変えない。**スキーマ v3・導出・`commands.ts` は m4 で完成している**ので、本計画が触るのは表示と操作だけ——(1) 展開の単位が「どの仮説」から「どの課題」になり、展開中のノードだけ幅が 320 → 780 に広がる、(2) パネルが `title` / `detail` / `value` / `asks` / `feedbacks` を節に分けて描く、(3) 仮説の行はキー処理を持たず、追加・削除・判断はボタンで行う。

**Tech Stack:** React 19 / Tailwind v4（役割トークン）/ Radix DropdownMenu / lucide-react / Vitest（jsdom）

**Spec:**
- 見え方の正: デザインキャンバス <https://claude.ai/code/artifact/3f305a67-bd90-43ee-82dd-58946b498569>（「俯瞰」「仮説の展開」「バッジ語彙」の3枚。**facet の実トークン・実寸法で描いてある**ので、寸法・文言・並びはここから逐語で取る）
- データ側の決定: [`../../issue-tree/スキーマv3-引き継ぎ.md`](../../issue-tree/スキーマv3-引き継ぎ.md)（m4 の入力だった文書。**なぜその形にしたかの理由が全部そこにある**）
- 設計の正: [`../../issue-tree/仮説検証モジュール-設計ノート.md`](../../issue-tree/仮説検証モジュール-設計ノート.md)（m4 が D2・D7・D9 を改め D12 を足した。本計画の Task 9 で D8 を改め D13 を足す）
- データ形式の正: [`../../../schemas/issue-tree.schema.json`](../../../schemas/issue-tree.schema.json)（v3。**完成済み**）

---

## この計画は m4 の完了後に書き直した（2026-08-30）

**当初の計画は「m4 は型が通る最小限の追随に留める」という前提で13タスクを並べていた。** 実際の m4（PR #29）はそれより広く、UI の一部まで実装した。**済んだ仕事を二重に実装しないよう、本計画はタスクを組み直してある。**

実物を読んで確かめた結果:

| 当初のタスク | 実際の状態 | 本計画での扱い |
| --- | --- | --- |
| スキーマ v3（`title` / `detail` / `value` / `asks` / `feedbacks` / `date` / `resolved`） | **完成**（`schemas/issue-tree.schema.json` の `required` に全部ある） | — |
| 導出（`QUESTION_LABELS.feedback` ＝ `FB待ち`、未判断の廃止、解決の抑制） | **完成**（`derive.ts:216`） | — |
| 解決の旗（`IssueBox` のトグル） | **完成**（m4 の Task 7 で `DEFER_TRIGGER_LABEL` ごと作り替え済み） | — |
| 帯のチップ（`FB待ち` / `解決`）と飛び先 | **完成**（`open-targets.ts` も対応済み） | Task 8 で**展開単位の変更に追随させるだけ** |
| 「根拠へ移す」の廃止 | **完成** | — |
| 設計ノート D2・D7・D9・D12 | **完成** | Task 9 で D8・D13 を足す |
| 展開の単位 | **未着手**（`IssueTreeEditor.tsx:345` の `expandedKey` は仮説の鍵のまま） | Task 2 |
| 展開幅 780 | **未着手**（`measure.ts` は m4 で1行も変わっていない） | Task 1・2 |
| キーボードの縮小 | **未着手**（`ISSUE_TREE_HINTS` に `$mod+Enter 仮説／判断を追加` が残る） | Task 3 |
| ソリューション仮説・価値仮説・聞きたいことの節 | **未着手**（`SECTION_LABELS` は `判断` / `以前の判断` / `FB` の3つ。`cell-keys.ts` に `detail` / `value` / `ask` が無い） | Task 4・5 |
| 判断バッジのクリック | **未着手**（`JUDGEMENT_TRIGGER_LABELS` が生きている） | Task 6 |
| 仮説の削除ボタン・ノード末尾の追加 | **未着手** | Task 7 |

**つまり m4 は「データを入れ、画面には出さない」を正確に守った。** `detail` / `value` / `asks` はファイルに書かれているのに**どこにも表示されていない**——本計画の中心はそこを埋めることである。

## 前後のマイルストーン

| | | 状態 |
| --- | --- | --- |
| **issue-tree-m3** 俯瞰 UI と語彙 | [`2026-08-23-issue-tree-m3-overview-ui.md`](2026-08-23-issue-tree-m3-overview-ui.md) | 完了・マージ済み |
| **issue-tree-m4** スキーマ v3 と Skill | PR #29 | **完了・`issue-tree/hypothesis-ui` にマージ済み** |
| **issue-tree-m5** 仮説まわりの UI 刷新 | 本計画 | |

**統合先は `main` ではなく `issue-tree/hypothesis-ui`。** `main`（PR #28 時点）は m4 を含まない。本計画の worktree は m4 より前の基底（`820c0e1`）に立っているので、**着手前に取り込むこと**:

```
git merge issue-tree/hypothesis-ui
```

取り込んだ後、次を確認して**出力を報告に貼る**:

```
grep -c '"schemaVersion": 3' schemas/issue-tree.schema.json      # 1（v3 が入っている）
grep -n "asks\|feedbacks" src/types/issue-tree.ts                # 両方あること
grep -n "expandedKey" src/modules/issue-tree/IssueTreeEditor.tsx # まだ仮説の鍵であること（Task 2 の起点）
grep -n "cell: '" src/modules/issue-tree/cell-keys.ts            # hypothesis / feedback / event の3つだけであること
```

**4つ目が3つより多かったら、誰かが先に着手している。** そのまま進めず報告すること。

## この計画が置いた前提（デザイン検討 2026-08-30 の決定）

キャンバスを見ながら決めたことのうち、**まだ実装されていない**もの。

**1. 展開の単位は課題ノード。** 仮説の行にフォーカスした瞬間に開く（`HypothesisRow.tsx` の `onFocus={props.onExpand}`）のをやめ、課題タイトル左のトグルで開閉する。開くとその課題の**すべての**仮説がパネルで開く。閉じている間も仮説の1行（`title`）は編集できる——**会議中に仮説を足すのは閉じたまま、詰めるときだけ開く。**

**2. 展開中のノードだけ幅 780。** 320 のままでは節見出しと本文が入らない（いまのパネル内容幅は 260px で、判断の根拠が実質2〜3語で折り返している）。`src/core/canvas/tree-layout.ts` の `columnXs` は**深さごとの最大幅**（`maxWidth[depth]`）から列の x を決めているので、展開ノードの `Size.width` を 780 にすれば列全体が押し広がる。**同じ列の他のノードは 320 のまま左寄せで残り、次の列以降が右へずれる。** これが押し広げの実際の見え方で、意図した挙動である。

**3. キーボードは課題の追加・削除・移動だけ。** ロジックツリーと同じ4つ（`Enter` 兄弟／`Tab` 子／`←→` 親子移動／`Alt+↑↓` 並び替え）＋空欄 `Backspace` の削除。**仮説はゆっくり考えるものなので、マウスで間に合う**（ユーザー判断）。`runRowCommand` と `onRowKeyDown` が丸ごと消える。

**4. 仮説の追加・削除はボタン。** 追加は帯の「仮説を追加」（**既にある**）と、展開したノード末尾の「＋ 仮説を追加」（**新設**）。削除は**各パネル右上のゴミ箱**（新設）。

**5. 判断は検証結果のバッジを押して変える。** いまの「判断を追加／判断を変える」という文言ボタン（`JUDGEMENT_TRIGGER_LABELS`）をやめ、バッジ自身がドロップダウンのトリガーになる（右に山形を添える）。状態を**見る**場所と**変える**場所を1つにする。

**6. 「聞きたいこと」と FB は入れ子で描く。** 問いごとにブロックを作り、その中に答えとしての FB を並べる。どの問いにも紐づかない FB（`askId` が `null`）は最後のブロックにまとめる。**問いに FB が0件なら `FB待ち` を出す**——導出（`derive.ts`）と帯のチップは m4 で入っているので、**本計画が足すのはパネルの中の表示だけ**である。

**7. 棄却は面を敷かず、文字を一段落とす。** 灰色の面を敷く案も出たが、**抑制（祖先が見送った枝）と見分けがつかなくなる**のと、棄却の理由は本開発から遡って読む対象（設計ノートの価値2）なので読めなくしない。閉じた行の文言を `text-ink-muted` にするだけ。

**8. 並び替えの手段は用意しない。** 仮説の並び替えはキーからは消え、マウスにも作らない。要望が出てから決める（ユーザー判断）。追加順のままになる。

**既存実装と一致すべきものは実物が正。** 本計画が引用した寸法・クラス名・行番号は引用元のパスを併記した。**食い違いを見つけたら辻褄を合わせずに「計画の矛盾」として報告する**こと。報告には**実行した検証コマンドとその出力を貼る**。

---

## Global Constraints（全タスクの要件に暗黙に含まれる）

### データ（m4 が入れたもの。本計画では構造を変えない）

- **ビュー状態（どの課題が展開されているか）を JSON に書かない**（設計ノート D8。座標を保存しないのと同じ）
- `events` は追記専用。`feedbacks` は追加・削除できる。**この非対称を画面が壊さない**——判断イベントに削除の動線を作らない
- 日付はアプリが追記時に入れる。**日付の入力欄を作らない**
- ID の採番は `commands.ts` の `newId` だけ
- **`commands.ts` / `derive.ts` / スキーマに手を入れない。** 足りない関数が見つかったら**計画の矛盾として報告する**（m4 が完成させた領域であり、ここで書き足すと Skill 側のコピーと乖離する）

### 表示

- **色値を書かない。** 役割トークンだけ（`src/styles/conventions.test.ts` が直書きを弾く）
- **文字サイズは `text-xs` / `text-sm` / `text-base` / `text-lg` の4段だけ**（同上）。任意値 `text-[...]` は使えない
- **半透明は登録した濃さだけ**（`src/styles/palette-requirements.ts` の `OVERLAYS`）。`opacity-*` で薄くしない
- **測定と描画は同じ数字を見る。** `measure.ts` の定数と Tailwind クラスは**対で直す**。描画が測定より高いと下の要素にはみ出す
- **`data-cell` の文字列は `cell-keys.ts` だけが作る**
- **ドロップダウンは同時に1つ**（`openCell` の鍵1つ）
- アクセシブル名の前半（`課題{N}` / `仮説{N}`）は**動かさない**——DOM テストが前方一致で引く
- **アイコンは lucide-react の SVG。絵文字を使わない**（M25 決定8）

### 操作

- **キーの判定はコアの `resolveCommand` に委ねる。** ツール側で `e.key` を見ない（rev 10章）。**ただし本計画で仮説側は `resolveCommand` を通らなくなる**——通す欄と通さない欄が同じファイルに並ぶので、通さない欄には理由をコメントで書く
- **キーでしか到達できない意味を残さない**（rev 10章）。仮説の追加・削除は**キーから消える側**なので、ボタンが必ず要る

### 検証

- 各タスクの最後に **`npm test && npx tsc -b && npm run lint`** を全件で回す（対象を絞らない）。報告にはコマンドと出力の末尾を貼る
- スタイルの解決に関わる変更は **`npx vite build` で生成 CSS を読む**手順を含む（M8 の教訓）
- **順序や条件を固定するテストを書いたら、対応する実装を1行壊して落ちることを確認する**（M6 の教訓）

### やらないこと（このマイルストーンの範囲外）

- **スキーマ・`commands.ts`・`derive.ts`**——m4 で完成済み
- **仮説の並び替え**（前提8）
- **仮説を別の課題へ付け替える**（`open-issues.md` の既存項目。据え置き）
- **課題の旗のキーボード経路**——`Ctrl+Enter` は仮説追加から解放されるが、旗は2つ（見送り・解決）あってキーは1つなので割り当てない
- **判断の誤操作の防止**（同じ種別を続けて付ける・最新以外を消せない）
- **Markdown 出力**（設計ノートの OUT）
- **`README.md` のスクリーンショット**——撮るのは人間（Task 12）

---

## ファイル構成

| ファイル | 責務 | 本計画での扱い |
| --- | --- | --- |
| `src/modules/issue-tree/measure.ts` | 寸法定数（DOM 非依存） | 展開幅・節・FB行の定数を足す（**m4 では1行も変わっていない**） |
| `src/modules/issue-tree/layout.ts` | 矩形の算出 | **展開の単位が課題になる**ので大きく書き換わる |
| `src/modules/issue-tree/IssueBox.tsx` | 課題の箱 | 開閉トグルを足す（**解決の旗は m4 で入っている**） |
| `src/modules/issue-tree/HypothesisRow.tsx` | 仮説の行 | **閉じた1行だけを負う**ように縮む |
| `src/modules/issue-tree/HypothesisPanel.tsx` | **新規**。展開した仮説1件のパネル | 節（ソリューション仮説／価値仮説／検証結果／FB）を描く |
| `src/modules/issue-tree/AskBlock.tsx` | **新規**。問い1件とその FB | パネルから使う |
| `src/modules/issue-tree/IssueTreeEditor.tsx` | エディタ本体 | 展開状態・キー処理・追加削除の動線 |
| `src/modules/issue-tree/cell-keys.ts` | `data-cell` の文字列 | `detail` / `value` / `ask` を足す |
| `src/modules/issue-tree/open-targets.ts` | 要対応の飛び先 | **展開単位の変更に追随させるだけ**（FB待ちの列は m4 で入っている） |
| `src/core/canvas/tree-layout.ts` | 木の配置 | **触らない**（幅可変は既に効く。前提2） |

**部品を3つに割るのは、`HypothesisRow.tsx` にパネルの中身が増えると読めなくなるため。** 閉じた行（1行・バッジ）と展開パネル（節が4つ）は責務が違い、同時に描かれることがない。

---

### Task 1: 寸法——展開幅と節の定数

**Files:**
- Modify: `src/modules/issue-tree/measure.ts`

**Interfaces:**
- Produces: `EXPANDED_BOX_WIDTH` / `SECTION_LABEL_FONT_CLASS` / `EXPANDED_TITLE_FONT_CLASS` / `HYPO_TITLE_FONT_CLASS` / `ASK_*` / `FB_*` / `MINI_ACTION_HEIGHT`。Task 2 以降のレイアウトとコンポーネントが読む

- [ ] **Step 1: キャンバスから寸法を写す**

デザインキャンバスの「仮説の展開」アートボードから、次を `measure.ts` へ足す。**既存の定数（`BOX_WIDTH` = 320 など）は消さない**——閉じたノードは 320 のままである。

| 定数 | 値 | 由来 |
| --- | --- | --- |
| `EXPANDED_BOX_WIDTH` | 780 | 展開中の課題ノードの幅 |
| `SECTION_LABEL_FONT_CLASS` | `'text-base leading-normal font-semibold'` | 節見出し（16px / 24px / 600） |
| `EXPANDED_TITLE_FONT_CLASS` | `'text-lg leading-normal font-semibold'` | 展開時の課題タイトル（18px / 27px / 600） |
| `HYPO_TITLE_FONT_CLASS` | `'text-sm leading-normal font-medium'` | ソリューション仮説のタイトル（14px / 21px / 500） |
| `ASK_PADDING_X` / `ASK_PADDING_Y` | 8 / 6 | 問いブロックの余白 |
| `ASK_GAP` | 4 | 問いブロックの中の縦の空き |
| `ASK_BLOCK_GAP` | 4 | 問いブロックどうしの空き |
| `FB_ICON_SIZE` | 16 | FB 行のアイコン |
| `FB_COL_GAP` | 8 | FB 行の列の空き |
| `FB_DELETE_WIDTH` | 20 | 削除ボタンの列幅 |
| `MINI_ACTION_HEIGHT` | 20 | 問いブロックの中の「＋FB」 |
| `CHEVRON_SIZE` / `CHEVRON_GAP` | 14 / 6 | 課題タイトル左の開閉トグル（Task 2） |

**フォント階級が2つ増える。** いまは `BODY_FONT_CLASS`（14/1.5）と `SMALL_FONT_CLASS`（14/1.25）の2本で測っている（`IssueTreeEditor.tsx` の測定用の見本）。節見出し（16px）と展開時のタイトル（18px）が増えるので、**見本を増やす**（Task 2 で実際に増やす。ここでは定数だけ）。

- [ ] **Step 2: 対のクラスを併記する**

`measure.ts` の既存の註（「定数と Tailwind クラスは必ず対で直すこと」）に従い、足した定数それぞれに**どのクラスで描くか**をコメントで書く。`ACTION_HEIGHT` / `ACTION_HEIGHT_CLASS` が既にその形になっているので、同じ形にする。

- [ ] **Step 3: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 全件 PASS（定数を足しただけ）

- [ ] **Step 4: Commit**

```bash
git add src/modules/issue-tree/measure.ts
git commit -m "feat(issue-tree): 展開パネルの寸法定数を足す"
```

---

### Task 2: 展開を課題ノード単位にし、開閉トグルを置く

**Files:**
- Modify: `src/modules/issue-tree/layout.ts`
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`
- Modify: `src/modules/issue-tree/IssueBox.tsx`
- Modify: `src/modules/issue-tree/HypothesisRow.tsx`（`onFocus` の削除）
- Test: `src/modules/issue-tree/layout.test.ts` / `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `EXPANDED_BOX_WIDTH` / `CHEVRON_SIZE` / `CHEVRON_GAP`
- Produces: `layoutIssueTree(data, posed, fonts, expandedIssueIndex: number)` — **第4引数の意味が仮説の添字から課題の添字へ変わる**。`IssueBox` の props に `expanded: boolean` / `onToggleExpand: () => void` が増える

- [ ] **Step 1: レイアウトの契約を変えるテストを書く**

```ts
it('展開した課題ノードだけ幅が広がり、閉じたノードは320のまま', () => {
  const layout = layoutIssueTree(data, posed, fonts, 0)   // 0番の課題を展開
  expect(layout.issues[0].rect.width).toBe(EXPANDED_BOX_WIDTH)
  expect(layout.issues[1].rect.width).toBe(BOX_WIDTH)
})

it('展開した課題の仮説はすべてパネルを持つ', () => {
  // 課題1件・仮説3件。3件とも expanded が null でないこと
})
```

**既存の「展開した仮説の高さ」を見るテストはこの時点で落ちる**（引数の意味が変わるため）。落ちることを確認してから直す。

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/issue-tree/layout.test.ts`
Expected: FAIL

- [ ] **Step 3: `layout.ts` を書き換える**

- 第4引数を `expandedIssueIndex` にする
- 展開中の課題は `BOX_CONTENT_WIDTH` の代わりに `EXPANDED_BOX_WIDTH - ISSUE_INSET_X * 2` を使って中身を測る
- **その課題にぶら下がる全仮説**が `expanded` を持つ
- `tree-layout.ts` へ渡す `Size.width` を、展開中の課題だけ 780 にする
- 課題タイトルの矩形を `CHEVRON_SIZE + CHEVRON_GAP` ぶん右へ寄せる

**`columnXs` は深さごとの最大幅で列を決めるので、押し広げは自動で効く**（前提2）。`tree-layout.ts` は触らない。

- [ ] **Step 4: 開閉トグルを描く**

`IssueBox.tsx` の課題タイトルの左に `ChevronRight`（閉）/ `ChevronDown`（開）を置く。

- `aria-expanded` を持つ `<button>`。**アクセシブル名は `課題{N}の詳細`**（前半を動かさない規約）
- **仮説を持たない課題では場所を空けたまま隠す**（`invisible`。`display: none` にするとタイトルの左端が列の中で揃わない）
- **見送り・解決のトグルと同じ箱の中に2つ目・3つ目のボタンが並ぶ**ことになる。`IssueBox.tsx` は m4 で旗のトグルを受け取る形になっているので、**その並べ方に合わせる**（実物を読んでから書くこと）

- [ ] **Step 5: `IssueTreeEditor.tsx` の状態を変える**

- `expandedKey`（仮説の鍵）→ `expandedIssueKey`（課題の鍵）
- **`HypothesisRow` の `onFocus={props.onExpand}` を消す**（前提1）。これで `open-issues.md` の「畳まれた仮説の行に入ると1回の `Tab` でフォーカスが2回動く」が解消する
- 測定用の見本を2本から4本に増やす（Task 1 で足したフォント階級）

- [ ] **Step 6: DOM テストを足す**

```ts
it('課題のトグルを押すと展開し、もう一度押すと閉じる', async () => {
  // aria-expanded で見る（クラス名やレイアウトに依存しない）
})

it('仮説の行にフォーカスしても展開しない', async () => {
  // Tab で行に入り、パネルの節見出しが現れないこと
})
```

- [ ] **Step 7: 全件検証と、壊して落ちることの確認**

Run: `npm test && npx tsc -b && npm run lint`
そのあと `EXPANDED_BOX_WIDTH` を使う箇所を `BOX_WIDTH` に差し替えて Step 1 のテストが FAIL することを見る。**確認したら戻す。** 報告に両方の出力を貼る。

- [ ] **Step 8: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "feat(issue-tree): 展開の単位を課題ノードにし、開閉トグルを置く"
```

---

### Task 3: 操作言語を課題だけに絞る

**Files:**
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`（`runRowCommand` / `onRowKeyDown` / `ISSUE_TREE_HINTS`）
- Modify: `src/modules/issue-tree/HypothesisRow.tsx`
- Test: `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`

**Interfaces:**
- Produces: 仮説側のコンポーネントは `onFieldKeyDown` を**受け取らなくなる**。Task 4・5 の新しい部品もキー処理を持たない

- [ ] **Step 1: 消える操作を DOM テストで固定する**

```ts
it('仮説の文言で Enter を打っても仮説は増えない（キーは課題だけが取る）', async () => {
  // onChange が呼ばれないこと。加えて改行が入らないことも見る（下の Step 3）
})

it('仮説の文言が空でも Backspace で仮説は消えない', async () => {})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`
Expected: FAIL

- [ ] **Step 3: `runRowCommand` と `onRowKeyDown` を消す**

- `runRowCommand`（仮説側のコマンド写像。丸ごと）
- `onRowKeyDown`（仮説側の `KeyContext` の組み立て）
- **`commands.ts` の関数自体は消さない**——ボタンから呼ぶ

**閉じた行の文言に改行が入らないようにする。** `resolveCommand` を通さなくなると `Enter` は `textarea` の既定（改行）になる。閉じた行は1行で測っているので、改行が入ると測定と描画がずれる。**`Enter` を消費して何もしない**小さなハンドラを残し、理由をコメントに書く:

```tsx
// 仮説の欄は操作言語を通らない（キーは課題だけが取る。m5 の決定）。
// ただし Enter だけは消費する——閉じた行は1行で測っており、改行が入ると
// 測定と描画がずれて下の行に被る。rev 10章「ツール側で e.key を見ない」の
// 明示的な例外で、コマンドへの写像は行わない
const swallowEnter = (e: React.KeyboardEvent): void => {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault()
}
```

**IME 変換中の `Enter` を潰さないよう `isComposing` を見ること**（見落とすと日本語が確定できなくなる）。

- [ ] **Step 4: キーヒントを4つにする**

`ISSUE_TREE_HINTS` から `$mod+Enter` の行を落とし、`src/modules/logic-tree/LogicTreeEditor.tsx` の `TREE_HINTS` と同じ4つにする。**文言は「子課題を追加」のまま**。

- [ ] **Step 5: 課題セルの `toggle-item-state` を無効にする**

`runIssueCommand` の `case 'toggle-item-state'` は `addHypothesis` を呼んでいる。**仮説の追加はボタンに移る**ので、この case を消して `return false` に落とす。**空いた `Ctrl+Enter` に別の意味を割り当てない**（「やらないこと」参照）。

- [ ] **Step 6: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`
**m3・m4 が書いた仮説側のキー操作の DOM テストは削除する**（守る対象が無くなったため）。削除したテスト名を報告に列挙すること。

- [ ] **Step 7: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "refactor(issue-tree): 操作言語を課題の追加・削除・移動だけに絞る"
```

---

### Task 4: 展開パネル——ソリューション仮説・価値仮説・検証結果

**Files:**
- Create: `src/modules/issue-tree/HypothesisPanel.tsx`
- Modify: `src/modules/issue-tree/HypothesisRow.tsx`（閉じた1行だけを負うよう縮める）
- Modify: `src/modules/issue-tree/cell-keys.ts`
- Modify: `src/modules/issue-tree/layout.ts`（節が増える）
- Test: `src/modules/issue-tree/HypothesisPanel.dom.test.tsx`（新規）

**Interfaces:**
- Consumes: m4 の `setHypothesisTitle` / `setHypothesisDetail` / `setHypothesisValue` / `setEventNote`（**実物の名前を確認してから使う。違えば計画の矛盾として報告**）
- Produces: `HypothesisPanel` — props は `hypothesisKey` / `label` / `placement` / `origin` / `hypothesis` / `invalid` / `suppressed` / 各 `onXChange` / `judgementMenu: ReactNode` / `onDelete: () => void`

- [ ] **Step 1: セルの種類を足す**

`cell-keys.ts` の `HypothesisCell` に `detail` / `value` を足す（`ask` は Task 5）。**`hypothesis` の鍵（`hyp:`）は名前を変えない**——既存の DOM テストとフォーカス予約が引いている。

```ts
export type HypothesisCell =
  | { cell: 'hypothesis' }                      // ソリューション仮説のタイトル（閉じた行と同じ鍵）
  | { cell: 'detail' }                          // ソリューション仮説の詳細
  | { cell: 'value' }                           // 価値仮説
  | { cell: 'feedback'; feedbackIndex: number } // 既存
  | { cell: 'event'; eventIndex: number }       // 既存
```

**`cellKey()` の `switch` は `FocusTarget` と1対1**なので、m4 の `commands.ts` が返す `FocusTarget` に `detail` / `value` があるかを確認する。**無ければ、そのセルへフォーカスを予約する経路が存在しない**——編集はできるが、要対応から飛べない。それでよいか（`detail` / `value` は問いを立てないので飛び先にならない）を確認したうえで進める。

- [ ] **Step 2: パネルの DOM テストを書く**

```ts
it('節が「ソリューション仮説」「価値仮説」「検証結果」「FB」の順に並ぶ', () => {
  // 見出しをテキストで引き、DOM 順を見る
})

it('検証結果の日付は判断があるときだけ出る', () => {
  // events が0件のパネルに「更新」の文字が無いこと
})

it('詳細と価値仮説が空でも問いは立たない', () => {
  // 空欄に警告のバッジが付かないこと（設計ノート D7 の規律）
})
```

- [ ] **Step 3: 落ちることを確認**

Run: `npx vitest run src/modules/issue-tree/HypothesisPanel.dom.test.tsx`
Expected: FAIL（ファイルが無い）

- [ ] **Step 4: `HypothesisPanel.tsx` を書く**

キャンバスの「仮説の展開」アートボードの通りに描く。節は上から:

1. **ソリューション仮説** — 見出し（右端にゴミ箱。Task 7 で置く）／`title`（`HYPO_TITLE_FONT_CLASS`）／`detail`（複数行可）
2. **価値仮説** — 見出し／`value`（複数行可）
3. **検証結果** — 見出し＋判断バッジ（Task 6 で押せるようにする）＋日付／理由（判断が無ければプレースホルダ）
4. **FB** — Task 5

**いまの `SECTION_LABELS`（`judgement` / `previous` / `notes`）に `solution` / `value` を足す。** `layout.ts` にあるので、そこへ足して打ち直さない。

**詳細・価値仮説・理由は複数行を許す**（閉じた行と違い、高さは測定で決まる）。`CellInput` の `multiline` ＋ `autoSize={false}` に測定した高さを与える既存の形をそのまま使う。

**「以前の判断」節は m4 のまま残す**（判断が2件以上あるときだけ出る）。キャンバスには描かれていないが、**追記専用の列を読む唯一の場所**なので消さない。

- [ ] **Step 5: `HypothesisRow.tsx` を閉じた行だけにする**

展開時の分岐（`if (!open)` の後ろ全部）を `HypothesisPanel.tsx` へ移し、`HypothesisRow` は**閉じた1行**（点・タイトル・バッジ）だけを描く。`onExpand` は消える（展開は課題のトグルが持つ）。

**棄却された仮説の文言を `text-ink-muted` にする**（前提7。面は敷かない）。

- [ ] **Step 6: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`

- [ ] **Step 7: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "feat(issue-tree): 展開パネルを部品に分け、ソリューション仮説と価値仮説を描く"
```

---

### Task 5: 聞きたいことと FB を入れ子で描く

**Files:**
- Create: `src/modules/issue-tree/AskBlock.tsx`
- Modify: `src/modules/issue-tree/HypothesisPanel.tsx`
- Modify: `src/modules/issue-tree/cell-keys.ts`（`ask` を足す）
- Modify: `src/modules/issue-tree/layout.ts`
- Test: `src/modules/issue-tree/AskBlock.dom.test.tsx`（新規）

**Interfaces:**
- Consumes: m4 の `addAsk` / `setAskText` / `removeAsk` / `addFeedback(data, index, askId)` / `setFeedbackText` / `removeFeedback`（**実物の名前を確認してから使う**）
- Produces: `AskBlock` — props は `ask: Ask | null`（`null` ＝「どの問いにも紐づかない FB」のブロック）／ `feedbacks` / `onAddFeedback` / 各 `onXChange` / `onRemoveFeedback`

- [ ] **Step 1: DOM テストを書く**

```ts
it('FB が0件の問いには FB待ち が立つ', () => {
  // バッジのテキストで引く。導出は derive.ts（m4）が持っているので、
  // ここで数え直さずに poseQuestions の結果を使うこと
})

it('どの問いにも紐づかない FB は最後のブロックに出る', () => {
  // askId が null の FB が、問いのブロックではなく末尾のブロックに入ること
})

it('FB の削除ボタンを押すとその1件だけが消える', async () => {
  // 3件のうち2件目を消し、残る2件の本文を見る
  // （件数だけを見ない——常に末尾を消す実装でも件数は合う）
})

it('FB の sentiment ごとにアイコンが変わる', () => {
  // aria-hidden な SVG なので、data 属性かラッパの aria-label で引ける形にしておく
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/issue-tree/AskBlock.dom.test.tsx`
Expected: FAIL

- [ ] **Step 3: `AskBlock.tsx` を書く**

- 問いの見出し行: `HelpCircle`（16px）／問いの文（編集可）／右端に `＋FB` の小ボタン（`MINI_ACTION_HEIGHT`）
- **FB が0件なら見出しの後ろに `FB待ち`**（`badgeClass('open')`。破線・欠落軸）
- FB 行: アイコン（`sentiment` で分岐: `like` → `ThumbsUp` / `concern` → `AlertTriangle` / `question` → `HelpCircle` / `note` → `MessageSquare`）／本文（編集可）／`{by} · {date}`（`text-ink-muted`）／削除の `X`
- **アイコンに色を付けない**（すべて `text-ink-muted`）。形だけで区別する——`sentiment` は判断ではないので、意味軸の色（欠落・無効・着信・判断）を使うと語彙が濁る
- `ask` が `null` のブロックは見出しのアイコンを持たず、文言は「どの問いにも紐づかない FB」の固定文（**編集できない**）

**`sentiment` の値は実物の enum を確認して分岐を網羅する。** `Record<Sentiment, LucideIcon>` の形にすれば、種別が増えたとき `tsc` がここで落ちる（m3 の `EVENT_KIND_LABELS` と同じ手）。

- [ ] **Step 4: `HypothesisPanel` から使う**

FB 節の中に、`asks` の順でブロックを並べ、最後に「紐づかない FB」のブロック（**紐づかない FB が1件以上あるときだけ**）。その下に `＋ 聞きたいことを追加` と `＋ FBを追加` の2つのボタン。

- [ ] **Step 5: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "feat(issue-tree): 聞きたいことと FB を入れ子で描く"
```

---

### Task 6: 検証結果のバッジを押して判断を変える

**Files:**
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`（`KindMenu` のトリガー）
- Modify: `src/modules/issue-tree/HypothesisPanel.tsx`
- Modify: `src/modules/issue-tree/layout.ts`（`JUDGEMENT_TRIGGER_LABELS` の削除と測り直し）
- Test: `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`

**Interfaces:**
- Consumes: m4 の `appendJudgement(data, index, kind)`（日付はこの関数が入れる）
- Produces: `KindMenu` の props から `triggerText` / `triggerClassName` が消え、`badge: ReactNode` を受ける形になる

- [ ] **Step 1: DOM テストを書く**

```ts
it('検証結果のバッジを押すと判断の候補が出る', async () => {
  // アクセシブル名「仮説1に判断を追加」で引き、押して4語が出ること
})

it('候補を選ぶと判断が追記され、理由の欄へフォーカスが移る', async () => {
  // onCloseAutoFocus の抑止が効いていること
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`
Expected: FAIL

- [ ] **Step 3: トリガーをバッジにする**

いまの `KindMenu` は「判断を追加」「判断を変える」という**文言のボタン**をトリガーにしている（`layout.ts:117` の `JUDGEMENT_TRIGGER_LABELS`）。これをやめ、**状態のバッジ自身**をトリガーにする。

- バッジの右に `ChevronDown`（12px）を添えて、押せることを示す
- **`JUDGEMENT_TRIGGER_LABELS` を消す。** `layout.ts` がこの文言でトリガーの幅を測っているので、**測る対象をバッジ幅＋山形に変える**（`badgeWidth` を使う）。**定数を消すだけで測り直しを忘れると、根拠の欄の幅が余る**
- アクセシブル名は `仮説{N}に判断を追加` のまま（前半を動かさない規約）

**`onCloseAutoFocus` の抑止（`picked` ref）はそのまま残す。** 追記の直後に理由の欄へフォーカスを予約しているので、Radix にトリガーへ戻されると打てなくなる。

- [ ] **Step 4: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "feat(issue-tree): 検証結果のバッジを判断のトリガーにする"
```

---

### Task 7: 仮説の追加・削除のマウス動線

**Files:**
- Modify: `src/modules/issue-tree/HypothesisPanel.tsx`（ゴミ箱）
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`（ノード末尾の「＋ 仮説を追加」）
- Modify: `src/modules/issue-tree/layout.ts`（ボタンの高さを勘定に入れる）
- Test: `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`

**Interfaces:**
- Consumes: m4 の `addHypothesis(data, issueIndex)` / `deleteHypothesis(data, index)`

- [ ] **Step 1: DOM テストを書く**

```ts
it('パネルのゴミ箱を押すとその仮説だけが消える', async () => {
  // 3件のうち2件目を消し、残る2件のタイトルを見る（件数だけを見ない）
})

it('仮説を消したあとフォーカスが宙に浮かない', async () => {
  // 消した後の activeElement が body でないこと。
  // deleteHypothesis は行き先に null を返すので、
  // 持ち主の課題へ返す（ownerIssueFocus）実装がそのまま要る
})

it('展開したノード末尾のボタンでその課題に仮説が増える', async () => {
  // 帯のボタン（最後に触った課題に足す）とは別経路であることを、
  // 「別の課題を最後に触った状態」で押して確かめる
})
```

- [ ] **Step 2: 落ちることを確認 → 実装 → 通ることを確認**

**ゴミ箱**: パネルの「ソリューション仮説」の見出し行の**右端**（`margin-left: auto`）に `Trash2`（16px、`text-ink-faint`）。アクセシブル名は `仮説{N}を削除`。**確認ダイアログを出さない**（Undo が額縁のグローバル層にあり、他の削除も確認を出していない）。

**「＋ 仮説を追加」**: 展開した課題ノードの**末尾**（最後のパネルの下）。左端はパネルと揃える（`PANEL_INDENT` と同じ 12px）。**`layout.ts` がこのボタンの高さ（`ACTION_HEIGHT`）を勘定に入れる**——入れ忘れると箱の下端からはみ出す。

- [ ] **Step 3: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "feat(issue-tree): 仮説の追加・削除をマウスの動線に置く"
```

---

### Task 8: 要対応の飛び先を展開単位に合わせる

**Files:**
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`（`goTo`）
- Modify: `src/modules/issue-tree/open-targets.ts`（`ask` の行き先。**列そのものは m4 で入っている**）
- Test: `src/modules/issue-tree/open-targets.test.ts`

**Interfaces:**
- Consumes: m4 の `listOpenTargets` / `nextOpenTarget`

- [ ] **Step 1: 実物を読んで、何が足りないかを確かめる**

**`open-targets.ts` は m4 で `FB待ち` に対応済み**（`derive.ts` の `QUESTION_LABELS.feedback`）。本タスクで要るのは、**行き先が閉じた課題の中にあるときに開いてから飛ぶ**ことだけである可能性が高い。

まず `git show HEAD:src/modules/issue-tree/open-targets.ts` を読み、`FB待ち` の行き先が `{ cell: 'ask', ... }` を返しているかを確認する。**返していれば `open-targets.ts` は触らない**（Task 5 で `cell-keys` に `ask` を足してあるので繋がる）。確認結果を報告に書くこと。

- [ ] **Step 2: 「開いてから飛ぶ」をテストで固定する**

```ts
it('閉じている課題の中の問いへ飛ぶと、その課題が開く', async () => {
  // 帯の FB待ち チップを押し、パネルの節見出しが現れ、
  // かつ問いの欄に activeElement があること
})
```

- [ ] **Step 3: `goTo` に展開を挟む**

行き先の課題を `setExpandedIssueKey` してからフォーカスを予約する（展開しないと `data-cell` が DOM に無く、予約が当たらない）。**これは m3 の `expandRow` → `pendingFocus` と同じ形**で、単位が課題に変わっただけである。

- [ ] **Step 4: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "fix(issue-tree): 閉じた課題の中の問いへ飛ぶときに開いてから当てる"
```

---

### Task 9: 設計ノートの改訂（D8 の改訂と D13）

**Files:**
- Modify: `docs/issue-tree/仮説検証モジュール-設計ノート.md`

**m4 が D2・D7・D9 を改め D12 を足している。** 本タスクで足すのは**展開と操作**の2件だけ。**既にある記述を書き直さないこと**（不変の記録ではないが、m4 が確定させた判断を上書きする理由が無い）。

- [ ] **Step 1: D8 を改める**

いまの D8 は「議論の焦点はデータに保存しない（色は意味の数だけ）」で、展開がビュー状態であることを含んでいる。**展開の単位が課題になったこと**と、**フォーカスによる自動展開をやめたこと**を書き足す。理由（会議中に仮説を足すのは閉じたまま、詰めるときだけ開く）まで書く。

- [ ] **Step 2: D13 を足す**

**キーボードは課題の追加・削除・移動だけ。仮説はマウス。** rev 10章の「キーでしか到達できない意味を残さない」の**裏返しとして、マウスでしか到達できない意味は許す**という判断であることを明記する。理由は「仮説はゆっくり考えるもので、打鍵数より迷いの少なさが効く」。

**`swallowEnter`（Task 3）が rev 10章の明示的な例外であることも、ここに書く**——実装のコメントだけに置くと、次にキー処理を触る人が規約違反として消す。

- [ ] **Step 3: 判断ごとに、それを述べている文があることを確かめる**

**「本文と矛盾しないこと」を確認して終わりにしない**（issue-tree-m3 の教訓）。上の2件それぞれについて、**それを述べている文を本文から引用して報告に貼る。**

- [ ] **Step 4: Commit**

```bash
git add docs/issue-tree/仮説検証モジュール-設計ノート.md
git commit -m "docs(issue-tree): 設計ノートに展開の単位と操作の割り当てを書く"
```

---

### Task 10: 最終ブランチレビュー

- [ ] **Step 1: ブランチ全体をレビューする**

`superpowers:requesting-code-review` に従い、**このブランチの全コミット**を対象にレビューを依頼する。観点として次を明示的に渡す:

- **測定と描画の食い違い**（`measure.ts` の定数と Tailwind クラスが対で直っているか。特に Task 6 で `JUDGEMENT_TRIGGER_LABELS` を消したときの測り直し）
- **タスクの継ぎ目**（Task 2 の展開単位と Task 8 の `goTo`、Task 4 の `cell-keys` と Task 5 の `ask`）
- **消したはずのものが残っていないか**（`runRowCommand` の残骸、`JUDGEMENT_TRIGGER_LABELS`、`onFocus={props.onExpand}`）
- **`e.key` を直接見ている箇所**（Task 3 の `swallowEnter` だけであること）
- **m4 の領域に手が入っていないか**（`commands.ts` / `derive.ts` / スキーマ / `.claude/skills/` の差分が空であること）

- [ ] **Step 2: Critical / Important を潰す**

`superpowers:receiving-code-review` に従う。**指摘に同意できないときは、根拠を示して反論してよい**（追認しない）。

---

### Task 11: ドキュメントへの反映（実機確認とは束ねない）

**Files:**
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`
- Create: `docs/history/issue-tree-m5-hypothesis-ui.md`

- [ ] **Step 1: `open-issues.md` を更新する**

**消す**（実物で確認してから消す）:
- 「畳まれた仮説の行に入ると、1回の `Tab` / `Shift+Tab` でフォーカスが2回動く」——`onFocus={props.onExpand}` が消えた（Task 2）

**足す**（少なくとも次を検討する）:
- 展開中のノードが**列全体を押し広げる**ため、深い木では横スクロールが増えること（前提2で受け入れた挙動）
- 仮説の並び替えの手段が無いこと（前提8）
- 「どの問いにも紐づかない FB」ブロックの固定文が編集できないこと（意図。だが文言が画面にしか無い）

**m4 が足した項目を消さないこと。** 消してよいのは本計画が実際に解消したものだけである。

- [ ] **Step 2: `overview-rev.md` へ反映する**

rev 10章（操作言語）に**「ツールによっては操作言語を通らない欄がある」**という例外が生まれた。**反映漏れは設計と実装の食い違いとして伝播する**（M4 の教訓）ので、申し送りに TODO として残さず、ここで書く。

- [ ] **Step 3: 申し送りを書く**

`docs/history/issue-tree-m5-hypothesis-ui.md` に、実装で確定した事項・見つかった欠陥・**実機確認のチェックリストを空のまま**写す（Task 12 は人間の作業なので未実施）。

**「m4 との境界がどこにあったか」を書き残すこと**——本計画は m4 の完了後に組み直されており、次に同じ形（データ側と画面側を別マイルストーンに割る）をやる人の入力になる。

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs(issue-tree): m5 の申し送りと残件を反映する"
```

---

### Task 12: 実機確認（人間の作業。エージェントは実行できない）

**サブエージェントは Tauri の GUI を操作できない。** 以下は人間がアプリを起動して行う。

- [ ] `npm run tauri dev` で起動し、`sample-project/課題ツリー.json` を開く
- [ ] 課題のトグルで展開・折りたたみができ、**展開中だけ幅が広がる**
- [ ] 展開したとき、**同じ列の他のノードが 320 のまま残り、次の列が右へずれる**（前提2の見え方が受け入れられるか。**ここで「やはり辛い」となったら、サイドパネル案へ戻す判断が要る**）
- [ ] 閉じたまま `Enter` / `Tab` で課題を足せる。**仮説の行では `Enter` が改行を入れない**
- [ ] 仮説のタイトル・詳細・価値仮説・理由が打てる（**IME 変換中の `Enter` で確定できる**）
- [ ] 検証結果のバッジを押して判断を変えられ、直後に理由が打てる
- [ ] 聞きたいことを足すと `FB待ち` が立ち、FB を足すと消える
- [ ] FB を消せる。**消しても他の FB がずれない**
- [ ] 帯の `FB待ち` チップを押すと、**閉じている課題が開いてその問いへ飛ぶ**
- [ ] ダーク配色（`.dark`）で、節見出しと `FB待ち` の破線が読める
- [ ] 実機確認で編集した `sample-project/` を元に戻す（`git checkout -- sample-project/ && git clean -fdx sample-project/`）

---

## 自己レビュー（計画時点）

**1. Spec の網羅。** キャンバスの3枚のうち、**まだ実装されていない**要素とタスクの対応:

| キャンバスの要素 | タスク | 備考 |
| --- | --- | --- |
| 課題の開閉トグル | Task 2 | |
| 展開時の幅 780 と押し広げ | Task 1・2 | |
| ソリューション仮説（タイトル／詳細） | Task 4 | データは m4 で入っている |
| 価値仮説 | Task 4 | 同上 |
| 検証結果のバッジ＋日付＋理由 | Task 4・6 | 日付の表示は m4 で入っている可能性——**Task 4 の着手時に確認** |
| 聞きたいこと・FB の入れ子・FB待ちの表示 | Task 5 | 導出と帯は m4 で入っている |
| FB のアイコン・名前・日付・削除 | Task 5 | |
| 仮説のゴミ箱・「＋ 仮説を追加」 | Task 7 | |
| 棄却された仮説の文字を一段落とす | Task 4 の Step 5 | 面は敷かない（前提7） |
| キーヒント4つ | Task 3 | |
| 解決の旗・帯のチップ | **実装済み（m4）** | 触らない |

**2. プレースホルダの走査。** 「TBD」「後で」「適切に」の類は無い。**Task 4・5 は完成コードを載せていない**——キャンバスが逐語の見本として存在し、そこから寸法と並びを取れるためである（教訓「計画のコードは検証済みの正ではない」に照らして、二重の見本を作らない判断）。**実装者はキャンバスを開いて作ること。**

**3. m4 の領域との境界。** 本計画が名指しした関数（`setHypothesisTitle` / `setHypothesisDetail` / `setHypothesisValue` / `addAsk` / `setAskText` / `removeAsk` / `addFeedback` / `setFeedbackText` / `removeFeedback` / `appendJudgement`）は**すべて m4 が作った前提**で、本計画は作らない。**着手時に存在と名前を確認し、違えば計画の矛盾として報告すること**（勝手に合わせると Skill 側のコピーと乖離する）。

**4. 依存の一本道。** Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 の順。**Task 3（キーの削除）を後ろに回さない**——先に消しておかないと、Task 4・5 が消える予定のキー処理に配線してしまう。Task 8 は Task 5（`ask` のセル）が無いと繋がらないので最後に置いた。

**5. この計画が確かめていないこと。** 展開中のノードが列を押し広げる見え方（前提2）は、**キャンバスの静止画では確かめられない**——木全体がどう動くかは実機でしか分からない。Task 12 にその観察を置き、受け入れられなければサイドパネル案へ戻る余地を残してある。**紙の上で決着させない判断**（`lessons-for-planning.md` の「費用が入力の瞬間にしか現れない区別は実機で一巡してから決める」の系）。

**6. この改訂で削ったもの。** 当初の計画にあった「解決の旗」「帯のチップ」「設計ノート D2・D7・D9・D12」の各タスクは、**m4 が実装済みだったので削除した**。削ったこと自体は上の「この計画は m4 の完了後に書き直した」節に記録してある——**次に読む人が「なぜこの計画にはそれが無いのか」を探さずに済むように。**
