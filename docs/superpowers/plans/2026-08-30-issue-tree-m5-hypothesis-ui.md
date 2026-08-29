# 課題ツリー 仮説まわりの UI 刷新 issue-tree-m5 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 仮説の詳細を「フォーカスした仮説1件だけが開く小さなパネル」から「課題ノードごと開く広いパネル」へ変え、ソリューション仮説・価値仮説・検証結果・聞きたいこと・FB を見出し付きで書けるようにする。あわせてキーボードの操作言語を課題の追加・削除・移動だけに絞り、仮説の追加・削除・判断の変更をマウスの動線に移す。

**Architecture:** データの芯（追記専用の `events` から現在の判断を導出する。設計ノート D2）は変えない。変えるのは (1) **展開の単位**——ビュー状態が「どの仮説」から「どの課題」になり、展開中のノードだけ幅が 320 → 780 に広がる、(2) **パネルの中身**——`title` / `detail` / `value` / `asks` / `feedbacks` を節に分けて描く、(3) **操作の割り当て**——仮説の行はキー処理を持たず、追加・削除・判断はボタンで行う。データ側（schemaVersion 3・`commands.ts`・`derive.ts`・Skill）は **issue-tree-m4 で入っている前提**。

**Tech Stack:** React 19 / Tailwind v4（役割トークン）/ Radix DropdownMenu / lucide-react / Vitest（jsdom）

**Spec:**
- 見え方の正: デザインキャンバス <https://claude.ai/code/artifact/3f305a67-bd90-43ee-82dd-58946b498569>（「俯瞰」「仮説の展開」「バッジ語彙」の3枚。**facet の実トークン・実寸法で描いてある**ので、寸法・文言・並びはここから逐語で取る）
- データ側の決定: [`../../issue-tree/スキーマv3-引き継ぎ.md`](../../issue-tree/スキーマv3-引き継ぎ.md)（m4 の入力。**なぜその形にしたかの理由が全部そこにある**）
- 設計の正: [`../../issue-tree/仮説検証モジュール-設計ノート.md`](../../issue-tree/仮説検証モジュール-設計ノート.md)（D1〜D11。本計画の Task 10 で D2・D8・D9 を改める）
- データ形式の正: [`../../../schemas/issue-tree.schema.json`](../../../schemas/issue-tree.schema.json)（v3）

## 前後のマイルストーン

| | | 状態 |
| --- | --- | --- |
| **issue-tree-m3** 俯瞰 UI と語彙 | [`2026-08-23-issue-tree-m3-overview-ui.md`](2026-08-23-issue-tree-m3-overview-ui.md) | 完了・マージ済み |
| **issue-tree-m4** スキーマ v3 と Skill | 別セッションが計画を書く（入力は上記の引き継ぎ書） | **先にマージされていること** |
| **issue-tree-m5** 仮説まわりの UI 刷新 | 本計画 | |

**m4 が未マージのまま着手しないこと。** 本計画は `title` / `detail` / `value` / `asks` / `feedbacks` / `date` / `resolved` を**既にあるもの**として扱う。着手前に確認する:

```
git log --oneline -1 -- schemas/issue-tree.schema.json     # v3 のコミットがあること
grep -n '"schemaVersion"' -A3 schemas/issue-tree.schema.json | grep -c 3   # 3 が入っていること
grep -n "asks\|feedbacks" src/types/issue-tree.ts          # 生成された型に両方あること
```

**確認の出力を報告に貼ること。** 無い状態で着手すると、型が無い前提のコードを書いて全タスクが破綻する。

## この計画が置いた前提（デザイン検討 2026-08-30 の決定）

キャンバスを見ながら決めたことのうち、**画面側**のもの。データ側の決定は引き継ぎ書にある。

**1. 展開の単位は課題ノード。** 仮説の行にフォーカスした瞬間に開く（`onFocus={props.onExpand}`）のをやめ、課題タイトル左のトグルで開閉する。開くとその課題の**すべての**仮説がパネルで開く。閉じている間も仮説の1行（タイトル）は編集できる——**会議中に仮説を足すのは閉じたまま、詰めるときだけ開く。**

**2. 展開中のノードだけ幅 780。** 320 のままでは節見出しと本文が入らない（m3 のパネル内容幅は 260px しかなく、判断の根拠が実質2〜3語で折り返していた）。`src/core/canvas/tree-layout.ts` の `columnXs` は**深さごとの最大幅**（`maxWidth[depth]`）から列の x を決めているので、展開ノードの `Size.width` を 780 にすれば列全体が押し広がる。**同じ列の他のノードは 320 のまま左寄せで残り、次の列以降が右へずれる。** これが押し広げの実際の見え方で、意図した挙動である。

**3. キーボードは課題の追加・削除・移動だけ。** ロジックツリーと同じ4つ（`Enter` 兄弟／`Tab` 子／`←→` 親子移動／`Alt+↑↓` 並び替え）＋空欄 `Backspace` の削除。**仮説はゆっくり考えるものなので、マウスで間に合う**（ユーザー判断）。これにより `runRowCommand` と `onRowKeyDown` が丸ごと消える。

**4. 仮説の追加・削除はボタン。** 追加は帯の「仮説を追加」と、展開したノード末尾の「＋ 仮説を追加」の2箇所。削除は**各パネル右上のゴミ箱**。

**5. 判断は検証結果のバッジを押して変える。** m3 の「判断を追加／判断を変える」ボタンをやめ、バッジ自身がドロップダウンのトリガーになる（右に山形を添える）。状態を**見る**場所と**変える**場所を1つにする。

**6. 「聞きたいこと」と FB は入れ子で描く。** 問いごとにブロックを作り、その中に答えとしての FB を並べる。どの問いにも紐づかない FB は最後のブロックにまとめる。**問いに FB が0件なら `FB待ち`（欠落軸の破線バッジ）を出し、要対応に数える。**

**7. 棄却は面を敷かず、文字を一段落とす。** デザイン検討では棄却された仮説の行に灰色の面を敷く案が出たが、**抑制（祖先が見送った枝）と見分けがつかなくなる**のと、棄却の理由は本開発から遡って読む対象（設計ノートの価値2）なので読めなくしない。`.row.rejected` の文言を `text-ink-muted` にするだけ。

**8. 未判断（着信軸）は画面から消える。** 「まだ拾っていない FB」を数える仕掛けは m4 で廃止された。**帯のチップ・バッジ語彙・行の印をすべて落とす**（残すと存在しない導出を指す）。

**9. 並び替えの手段は用意しない。** 仮説の並び替えはキーからは消え、マウスにも作らない。要望が出てから決める（ユーザー判断）。追加順のままになる。

**既存実装と一致すべきものは実物が正。** 本計画が引用した寸法・クラス名・文言は引用元のパスを併記した。食い違いを見つけたら**辻褄を合わせずに「計画の矛盾」として報告する**こと。報告には**実行した検証コマンドとその出力を貼る**。

---

## Global Constraints（全タスクの要件に暗黙に含まれる）

### データ（m4 が入れたもの。本計画では構造を変えない）

- **ビュー状態（どの課題が展開されているか）を JSON に書かない**（設計ノート D8。座標を保存しないのと同じ）
- `events` は追記専用。`feedbacks` は追加・削除できる。**この非対称を画面が壊さない**——判断イベントに削除の動線を作らない
- 日付はアプリが追記時に入れる。**日付の入力欄を作らない**
- ID の採番は `commands.ts` の `newId` だけ

### 表示

- **色値を書かない。** 役割トークンだけ（`src/styles/conventions.test.ts` が直書きを弾く）
- **文字サイズは `text-xs` / `text-sm` / `text-base` / `text-lg` の4段だけ**（同上）。任意値 `text-[...]` は使えない
- **半透明は登録した濃さだけ**（`src/styles/palette-requirements.ts` の `OVERLAYS`）。`opacity-*` で薄くしない
- **測定と描画は同じ数字を見る。** `measure.ts` の定数と Tailwind クラスは**対で直す**。描画が測定より高いと下の要素にはみ出す
- **`data-cell` の文字列は `cell-keys.ts` だけが作る**
- **ドロップダウンは同時に1つ**（`openCell` の鍵1つ）
- アクセシブル名の前半（`課題{N}` / `仮説{N}`）は**動かさない**——DOM テストが前方一致で引く
- **アイコンは lucide-react の SVG。絵文字を使わない**（M25 決定8。OS のカラー絵文字は役割トークンの管理の外に出る）

### 操作

- **キーの判定はコアの `resolveCommand` に委ねる。** ツール側で `e.key` を見ない（rev 10章）。**ただし本計画で仮説側は `resolveCommand` を通らなくなる**——通す欄と通さない欄が同じファイルに並ぶので、通さない欄には理由をコメントで書く
- **キーでしか到達できない意味を残さない**（rev 10章）。仮説の追加・削除は**キーから消える側**なので、ボタンが必ず要る

### 検証

- 各タスクの最後に **`npm test && npx tsc -b && npm run lint`** を全件で回す（対象を絞らない）。報告にはコマンドと出力の末尾を貼る
- スタイルの解決に関わる変更は **`npx vite build` で生成 CSS を読む**手順を含む（M8 の教訓。`npm test` / `tsc` / `lint` は CSS のカスケードを見ない）
- **順序や条件を固定するテストを書いたら、対応する実装を1行壊して落ちることを確認する**（M6 の教訓）

### やらないこと（このマイルストーンの範囲外）

- **スキーマ・`commands.ts` のデータ操作・`derive.ts` の導出**——m4 の担当。本計画で足りない関数が見つかったら**計画の矛盾として報告する**（勝手に足すと m4 と二重に実装される）
- **仮説の並び替え**（前提9）
- **仮説を別の課題へ付け替える**（`open-issues.md` の既存項目。据え置き）
- **課題の旗（見送り・解決）のキーボード経路**——`Ctrl+Enter` は仮説追加から解放されるが、旗は2つあってキーは1つなので割り当てない。`open-issues.md` の項目は据え置く
- **判断の誤操作の防止**（同じ種別を続けて付ける・最新以外を消せない）
- **Markdown 出力**（設計ノートの OUT）
- **`README.md` のスクリーンショット**——撮るのは人間（Task 13）

---

## ファイル構成

| ファイル | 責務 | 本計画での扱い |
| --- | --- | --- |
| `src/modules/issue-tree/measure.ts` | 寸法定数（DOM 非依存） | 展開幅・節・FB行の定数を足す |
| `src/modules/issue-tree/layout.ts` | 矩形の算出 | **展開の単位が課題になる**ので大きく書き換わる |
| `src/modules/issue-tree/IssueBox.tsx` | 課題の箱 | 開閉トグル・解決の旗を足す |
| `src/modules/issue-tree/HypothesisRow.tsx` | 仮説の行（閉じた1行） | **閉じた行だけを負う**ように縮む |
| `src/modules/issue-tree/HypothesisPanel.tsx` | **新規**。展開した仮説1件のパネル | 節（ソリューション仮説／価値仮説／検証結果／FB）を描く |
| `src/modules/issue-tree/AskBlock.tsx` | **新規**。問い1件とその FB | パネルから使う |
| `src/modules/issue-tree/IssueTreeEditor.tsx` | エディタ本体 | 展開状態・キー処理・帯 |
| `src/modules/issue-tree/cell-keys.ts` | `data-cell` の文字列 | セルの種類が入れ替わる |
| `src/modules/issue-tree/open-targets.ts` | 要対応の飛び先 | `FB待ち` を足す |
| `src/core/canvas/tree-layout.ts` | 木の配置 | **触らない**（幅可変は既に効く。前提2） |

**部品を3つに割るのは、`HypothesisRow.tsx` が m3 の時点で368行あり、パネルの中身が増えると読めなくなるため。** 閉じた行（1行・バッジ）と展開パネル（節が4つ）は責務が違い、同時に描かれることがない。

---

### Task 1: 寸法——展開幅と節の定数

**Files:**
- Modify: `src/modules/issue-tree/measure.ts`
- Test: `src/modules/issue-tree/layout.test.ts`（既存。定数を読む側が落ちないことを確認）

**Interfaces:**
- Produces: `EXPANDED_BOX_WIDTH` / `SECTION_LABEL_*` / `ASK_*` / `FB_*` の定数群。Task 2 以降のレイアウトとコンポーネントが読む

- [ ] **Step 1: キャンバスから寸法を写す**

デザインキャンバスの「仮説の展開」アートボードから、次の値を `measure.ts` へ足す。**既存の定数（`BOX_WIDTH` = 320 など）は消さない**——閉じたノードは 320 のままである。

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

**フォント階級が3つになる。** m3 は `BODY_FONT_CLASS`（14/1.5）と `SMALL_FONT_CLASS`（14/1.25）の2本で測っていた（`IssueTreeEditor.tsx` の測定用の見本）。節見出し（16px）とタイトル（18px）が増えるので、**見本を増やす**（Task 2 で実際に増やす。ここでは定数だけ）。

- [ ] **Step 2: 対のクラスがあることを確かめる**

`measure.ts` の既存の註（「定数と Tailwind クラスは必ず対で直すこと」）に従い、足した定数それぞれに**どのクラスで描くか**をコメントで書く。`ACTION_HEIGHT` / `ACTION_HEIGHT_CLASS` が既にその形になっているので、同じ形にする。

- [ ] **Step 3: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 全件 PASS（定数を足しただけなので既存は緑のまま）

- [ ] **Step 4: Commit**

```bash
git add src/modules/issue-tree/measure.ts
git commit -m "feat(issue-tree): 展開パネルの寸法定数を足す"
```

---

### Task 2: 展開を課題ノード単位にする

**Files:**
- Modify: `src/modules/issue-tree/layout.ts`
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`
- Test: `src/modules/issue-tree/layout.test.ts`

**Interfaces:**
- Consumes: Task 1 の `EXPANDED_BOX_WIDTH`
- Produces: `layoutIssueTree(data, posed, fonts, expandedIssueIndex: number)` — 第4引数の意味が**仮説の添字から課題の添字へ変わる**。`IssueTreeLayout` の各 `issues[i]` は `width` を持つ（320 か 780）

- [ ] **Step 1: レイアウトの契約を変えるテストを先に書く**

`layout.test.ts` に次を足す。**既存の「展開した仮説の高さ」を見るテストは、この時点で落ちる**（引数の意味が変わるため）——落ちることを確認してから直す。

```ts
it('展開した課題ノードだけ幅が広がり、閉じたノードは320のまま', () => {
  const data = /* 課題2件・それぞれ仮説1件 */
  const posed = poseQuestions(data)
  const layout = layoutIssueTree(data, posed, fonts, 0)   // 0番の課題を展開
  expect(layout.issues[0].rect.width).toBe(EXPANDED_BOX_WIDTH)
  expect(layout.issues[1].rect.width).toBe(BOX_WIDTH)
})

it('展開した課題の仮説はすべてパネルを持つ', () => {
  const data = /* 課題1件・仮説3件 */
  const layout = layoutIssueTree(data, poseQuestions(data), fonts, 0)
  expect(layout.hypotheses.filter((h) => h !== null && h.expanded !== null)).toHaveLength(3)
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/issue-tree/layout.test.ts`
Expected: FAIL（第4引数がまだ仮説の添字）

- [ ] **Step 3: `layout.ts` を書き換える**

- 第4引数を `expandedIssueIndex` にする
- 展開中の課題は `BOX_CONTENT_WIDTH` の代わりに `EXPANDED_BOX_WIDTH - ISSUE_INSET_X * 2` を使って中身を測る
- **その課題にぶら下がる全仮説**が `expanded` を持つ（m3 は1件だけだった）
- `tree-layout.ts` へ渡す `Size.width` を、展開中の課題だけ 780 にする

**`columnXs` は深さごとの最大幅で列を決めるので、押し広げは自動で効く**（前提2）。`tree-layout.ts` は触らない。

- [ ] **Step 4: `IssueTreeEditor.tsx` の状態を変える**

- `expandedKey`（仮説の鍵）→ `expandedIssueKey`（課題の鍵）
- **`HypothesisRow` の `onFocus={props.onExpand}` を消す**（前提1）。これで `open-issues.md` の「畳まれた仮説の行に入ると1回の `Tab` でフォーカスが2回動く」が解消する
- 展開のトグルは課題タイトル左のボタン（Task 4 で描く）。ここでは `setExpandedIssueKey` を渡すところまで

- [ ] **Step 5: テストが通ることを確認**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 全件 PASS

- [ ] **Step 6: 実装を1行壊して、Step 1 のテストが落ちることを確認**

`EXPANDED_BOX_WIDTH` を使う箇所を `BOX_WIDTH` に差し替えて `npx vitest run src/modules/issue-tree/layout.test.ts` が FAIL することを見る。**確認したら戻す。** 報告に両方の出力を貼る。

- [ ] **Step 7: Commit**

```bash
git add src/modules/issue-tree/layout.ts src/modules/issue-tree/IssueTreeEditor.tsx src/modules/issue-tree/layout.test.ts
git commit -m "feat(issue-tree): 展開の単位を課題ノードにし、展開中だけ幅を広げる"
```

---

### Task 3: 操作言語を課題だけに絞る

**Files:**
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`（`runRowCommand` / `onRowKeyDown` の削除、`ISSUE_TREE_HINTS`）
- Modify: `src/modules/issue-tree/HypothesisRow.tsx`（`onFieldKeyDown` の受け口）
- Test: `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`

**Interfaces:**
- Produces: 仮説側のコンポーネントは `onFieldKeyDown` を**受け取らなくなる**。Task 5・6 の新しい部品もキー処理を持たない

- [ ] **Step 1: 消える操作を DOM テストで固定する**

**「消えたこと」を守るテストを書く。** 仮説の文言セルで `Enter` を打っても仮説が増えないこと、空欄 `Backspace` で仮説が消えないことを見る。

```ts
it('仮説の文言で Enter を打っても仮説は増えない（キーは課題だけが取る）', async () => {
  // 仮説1件のデータで開き、仮説の文言セルへフォーカスして Enter
  // onChange が呼ばれないこと（＝データが変わらないこと）を見る
})
```

**`onChange` が呼ばれないことだけを見ない。** 改行が入らないことも確認する（下の Step 3 の理由）。

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`
Expected: FAIL（いまは `Enter` が仮説を足す）

- [ ] **Step 3: `runRowCommand` と `onRowKeyDown` を消す**

`IssueTreeEditor.tsx` から次を削除する:
- `runRowCommand`（仮説側のコマンド写像。丸ごと）
- `onRowKeyDown`（仮説側の `KeyContext` の組み立て）
- それらが呼んでいた `addHypothesisAfter` / `deleteHypothesis` / `moveHypothesis` / `addPendingNote` 系の import（**`commands.ts` の関数自体は消さない**——ボタンから呼ぶ）

**閉じた行の文言に改行が入らないようにする。** `resolveCommand` を通さなくなると `Enter` は `textarea` の既定（改行）になる。閉じた行は1行で測っているので、改行が入ると測定と描画がずれる。**`Enter` を消費して何もしない**小さなハンドラを残し、なぜ残すかをコメントに書く:

```tsx
// 仮説の欄は操作言語を通らない（キーは課題だけが取る。m5 の決定）。
// ただし Enter だけは消費する——閉じた行は1行で測っており、改行が入ると
// 測定と描画がずれて下の行に被る
const swallowEnter = (e: React.KeyboardEvent): void => {
  if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.preventDefault()
}
```

**これは `e.key` を見る数少ない例外なので、rev 10章の規約との関係をコメントに書くこと。**（IME 変換中の `Enter` を潰さないよう `isComposing` を見る。`toKeyEventLike` を通してもよいが、コマンドに写像しないので直接見るほうが短い）

- [ ] **Step 4: キーヒントを4つにする**

`ISSUE_TREE_HINTS` から `$mod+Enter` の行を落とし、ロジックツリー（`src/modules/logic-tree/LogicTreeEditor.tsx` の `TREE_HINTS`）と同じ4つにする。**文言は「子課題を追加」のまま**（ロジックツリーは「子を追加」で、こちらは課題ツリーなので語が違ってよい）。

- [ ] **Step 5: 課題セルの `toggle-item-state` を無効にする**

`runIssueCommand` の `case 'toggle-item-state'` は `addHypothesis` を呼んでいる。**仮説の追加はボタンに移る**ので、この case を消して `return false` に落とす（コマンドを消費しない）。

**空いた `Ctrl+Enter` に別の意味を割り当てないこと**（「やらないこと」参照）。

- [ ] **Step 6: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 全件 PASS。**m3 が書いた仮説側のキー操作の DOM テストは削除する**（守る対象が無くなったため）。削除したテスト名を報告に列挙すること

- [ ] **Step 7: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "refactor(issue-tree): 操作言語を課題の追加・削除・移動だけに絞る"
```

---

### Task 4: 課題の箱——開閉トグルと解決の旗

**Files:**
- Modify: `src/modules/issue-tree/IssueBox.tsx`
- Modify: `src/modules/issue-tree/layout.ts`（トグルのぶんタイトルの左が詰まる）
- Test: `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`

**Interfaces:**
- Consumes: m4 の `toggleResolved(data, index): EditResult`（**無ければ計画の矛盾として報告**）
- Produces: `IssueBox` の props に `expanded: boolean` / `onToggleExpand: () => void` / `resolvedToggle: ReactNode` が増える

- [ ] **Step 1: DOM テストを書く**

```ts
it('課題のトグルを押すと展開し、もう一度押すと閉じる', async () => {
  // aria-expanded で見る（クラス名やレイアウトに依存しない）
})

it('解決の旗を立てると配下の問いが要対応から外れる', async () => {
  // 帯の「要対応 N」の数字が減ることを見る。
  // **見送りの同じテストと同じ形にする**（derive の抑制は m4 が入れている）
})

it('見送りと解決は同時に立たない', async () => {
  // 見送り済みの課題で解決を押すと、見送りのバッジが消えて解決になる
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`
Expected: FAIL

- [ ] **Step 3: 開閉トグルを描く**

課題タイトルの左に `ChevronRight`（閉）/ `ChevronDown`（開）を置く（lucide-react、14px）。

- `aria-expanded` を持つ `<button>`。**アクセシブル名は `課題{N}の詳細`**（前半の `課題{N}` を動かさない規約）
- **仮説を持たない課題では場所を空けたまま隠す**（`invisible`。`display: none` にするとタイトルの左端が列の中で揃わない）
- `layout.ts` のタイトル矩形は、トグルの幅（14）＋空き（6）ぶん右へ寄る。**定数を `measure.ts` に置き、測定と描画で同じ値を読む**

- [ ] **Step 4: 解決の旗を描く**

m3 の見送りトグル（`IssueBox.tsx` の `deferralToggle`）と**同じ形**でもう1つ置く。

- 見送り済みなら見送りバッジ、解決済みなら解決バッジ、どちらでもなければホバー／フォーカス中だけ2つの小さなボタンが出る
- **面は `judge-yes-face`**（m4 で `palette.css` に足されている想定。**無ければ計画の矛盾として報告**——トークンを画面側で足さない）
- 優先順位は **整合性エラー ＞ 抑制 ＞ 見送り ＞ 解決 ＞ 通常**。`IssueBox.tsx` の既存の `face` の三項演算子に1段足す

- [ ] **Step 5: 全件検証と生成 CSS の確認**

Run: `npm test && npx tsc -b && npm run lint`
Run: `npx vite build` — 生成された CSS に `bg-judge-yes-face` が載っていることを確認（クラス名を動的に組み立てていないこと。Tailwind の走査は静的）

- [ ] **Step 6: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "feat(issue-tree): 課題ノードに開閉トグルと解決の旗を足す"
```

---

### Task 5: 展開パネル——ソリューション仮説・価値仮説・検証結果

**Files:**
- Create: `src/modules/issue-tree/HypothesisPanel.tsx`
- Modify: `src/modules/issue-tree/HypothesisRow.tsx`（閉じた1行だけを負うよう縮める）
- Modify: `src/modules/issue-tree/cell-keys.ts`
- Test: `src/modules/issue-tree/HypothesisPanel.dom.test.tsx`（新規）

**Interfaces:**
- Consumes: m4 の `setHypothesisTitle` / `setHypothesisDetail` / `setHypothesisValue` / `setEventNote`
- Produces: `HypothesisPanel` — props は `hypothesisKey` / `label` / `placement` / `origin` / `hypothesis` / `invalid` / `suppressed` / 各 `onXChange` / `judgementMenu: ReactNode` / `onDelete: () => void`

- [ ] **Step 1: セルの種類を入れ替える**

`cell-keys.ts` の `HypothesisCell` を次にする。**`hypothesis` の鍵（`hyp:`）は名前を変えない**——既存の DOM テストとフォーカス予約が引いている。

```ts
export type HypothesisCell =
  | { cell: 'hypothesis' }                    // ソリューション仮説のタイトル（閉じた行と同じ鍵）
  | { cell: 'detail' }                        // ソリューション仮説の詳細
  | { cell: 'value' }                         // 価値仮説
  | { cell: 'event'; eventIndex: number }     // 判断の理由
  | { cell: 'ask'; askIndex: number }         // 聞きたいこと（Task 6 で使う）
  | { cell: 'feedback'; feedbackIndex: number } // FB の本文（Task 6 で使う）
```

`rationale` と `note` は消える。**`cellKey()` の `switch` は `FocusTarget` と1対1**なので、m4 が変えた `FocusTarget` と突き合わせて過不足を確認する（食い違ったら計画の矛盾として報告）。

- [ ] **Step 2: パネルの DOM テストを書く**

```ts
it('節が「ソリューション仮説」「価値仮説」「検証結果」の順に並ぶ', () => {
  // 見出しを role/テキストで引き、DOM 順を見る
})

it('検証結果の日付は判断があるときだけ出る', () => {
  // events が0件のパネルに「更新」の文字が無いこと
})
```

- [ ] **Step 3: `HypothesisPanel.tsx` を書く**

キャンバスの「仮説の展開」アートボードの通りに描く。節は上から:

1. **ソリューション仮説** — 見出し（右端にゴミ箱。Task 8）／タイトル（`HYPO_TITLE_FONT_CLASS`）／詳細（複数行可）
2. **価値仮説** — 見出し／本文（複数行可）
3. **検証結果** — 見出し＋判断バッジ（Task 7 で押せるようにする）＋日付／理由（判断が無ければプレースホルダ）
4. **FB** — Task 6

**詳細・価値仮説・理由は複数行を許す**（閉じた行と違い、高さは測定で決まる）。`CellInput` の `multiline` を使い、`autoSize={false}` で測定した高さを与える m3 と同じ形にする。

- [ ] **Step 4: `HypothesisRow.tsx` を閉じた行だけにする**

展開時の分岐（`if (!open)` の後ろ全部）を `HypothesisPanel.tsx` へ移し、`HypothesisRow` は**閉じた1行**（点・タイトル・バッジ）だけを描く。`onExpand` は消える（展開は課題のトグルが持つ）。

- [ ] **Step 5: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "feat(issue-tree): 展開パネルを部品に分け、仮説の3節を描く"
```

---

### Task 6: 聞きたいことと FB

**Files:**
- Create: `src/modules/issue-tree/AskBlock.tsx`
- Modify: `src/modules/issue-tree/HypothesisPanel.tsx`
- Test: `src/modules/issue-tree/AskBlock.dom.test.tsx`（新規）

**Interfaces:**
- Consumes: m4 の `addAsk` / `setAskText` / `removeAsk` / `addFeedback(data, index, askId)` / `setFeedbackText` / `removeFeedback`
- Produces: `AskBlock` — props は `ask: Ask | null`（`null` ＝「どの問いにも紐づかない FB」のブロック）／ `feedbacks` / `onAddFeedback` / 各 `onXChange`

- [ ] **Step 1: DOM テストを書く**

```ts
it('FB が0件の問いには FB待ち が立つ', () => { /* バッジのテキストで引く */ })

it('どの問いにも紐づかない FB は最後のブロックに出る', () => {
  // askId が null の FB が、問いのブロックではなく末尾のブロックに入ること
})

it('FB の削除ボタンを押すとその1件だけが消える', async () => {
  // 3件のうち2件目を消し、残る2件の本文を見る（件数だけを見ない——
  // 「どれが消えたか」を見ないと、常に末尾を消す実装でも緑になる）
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/issue-tree/AskBlock.dom.test.tsx`
Expected: FAIL

- [ ] **Step 3: `AskBlock.tsx` を書く**

- 問いの見出し行: `HelpCircle`（16px）／問いの文（編集可）／右端に `＋FB` の小ボタン
- **FB が0件なら見出しの後ろに `FB待ち`**（`badgeClass('open')`。破線・欠落軸）
- FB 行: アイコン（`sentiment` で分岐: `like` → `ThumbsUp` / `concern` → `AlertTriangle` / `question` → `HelpCircle` / `note` → `MessageSquare`）／本文（編集可）／`{by} · {date}`（`text-ink-muted`）／削除の `X`
- **アイコンに色を付けない**（すべて `text-ink-muted`）。形だけで区別する——`sentiment` は判断ではないので、意味軸の色（欠落・無効・着信・判断）を使うと語彙が濁る
- `ask` が `null` のブロックは見出しのアイコンを持たず、文言は「どの問いにも紐づかない FB」の固定文（**編集できない**）

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

### Task 7: 検証結果のバッジを押して判断を変える

**Files:**
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`（`KindMenu` のトリガー）
- Modify: `src/modules/issue-tree/HypothesisPanel.tsx`
- Test: `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`

**Interfaces:**
- Consumes: m4 の `appendJudgement(data, index, kind)`（日付はこの関数が入れる）
- Produces: `KindMenu` の props から `triggerText` / `triggerClassName` が消え、`badge: ReactNode` を受ける形になる

- [ ] **Step 1: DOM テストを書く**

```ts
it('検証結果のバッジを押すと判断の候補が出る', async () => {
  // アクセシブル名「仮説1に判断を追加」で引き、押して「支持」「棄却」「保留」「見送り」が出ること
})

it('候補を選ぶと判断が追記され、理由の欄へフォーカスが移る', async () => {
  // m3 の onCloseAutoFocus の抑止がそのまま効いていること
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`
Expected: FAIL

- [ ] **Step 3: `KindMenu` のトリガーをバッジにする**

m3 の `KindMenu` は「判断を追加」「判断を変える」という**文言のボタン**をトリガーにしていた。これをやめ、**状態のバッジ自身**をトリガーにする。

- バッジの右に `ChevronDown`（12px）を添えて、押せることを示す
- `JUDGEMENT_TRIGGER_LABELS`（`layout.ts` の `empty` / `latest`）は**使われなくなるので消す**。**`layout.ts` がこの文言でトリガーの幅を測っている**ので、測る対象をバッジ幅＋山形に変える（`badgeWidth` を使う）
- アクセシブル名は `仮説{N}に判断を追加` のまま（前半を動かさない規約。m3 が付けた名前をそのまま使う）

**`onCloseAutoFocus` の抑止（m3 の `picked` ref）はそのまま残す。** 追記の直後に理由の欄へフォーカスを予約しているので、Radix にトリガーへ戻されると打てなくなる。

- [ ] **Step 4: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "feat(issue-tree): 検証結果のバッジを判断のトリガーにする"
```

---

### Task 8: 仮説の追加・削除のマウス動線

**Files:**
- Modify: `src/modules/issue-tree/HypothesisPanel.tsx`（ゴミ箱）
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`（ノード末尾の「＋ 仮説を追加」）
- Test: `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`

**Interfaces:**
- Consumes: m4 の `addHypothesis(data, issueIndex)` / `deleteHypothesis(data, index)`

- [ ] **Step 1: DOM テストを書く**

```ts
it('パネルのゴミ箱を押すとその仮説だけが消える', async () => {
  // 3件のうち2件目を消し、残る2件のタイトルを見る（件数だけを見ない
  // ——常に末尾を消す実装でも件数は合う）
})

it('仮説を消したあとフォーカスが宙に浮かない', async () => {
  // 消した後の activeElement が body でないこと。
  // m3 の deleteHypothesis は行き先に null を返すので、
  // 持ち主の課題へ返す（ownerIssueFocus）実装がそのまま要る
})

it('展開したノード末尾のボタンでその課題に仮説が増える', async () => {
  // 帯のボタン（最後に触った課題に足す）とは別経路であることを、
  // 「別の課題を最後に触った状態」で押して確かめる
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`
Expected: FAIL

- [ ] **Step 3: ゴミ箱を置く**

パネルの「ソリューション仮説」の見出し行の**右端**（`margin-left: auto`）に `Trash2`（16px、`text-ink-faint`）。アクセシブル名は `仮説{N}を削除`。

**確認ダイアログを出さない。** Undo（`Ctrl+Z`）が額縁のグローバル層にあり、他の削除（課題の空欄 `Backspace`）も確認を出していない。

- [ ] **Step 4: 「＋ 仮説を追加」を置く**

展開した課題ノードの**末尾**（最後のパネルの下）に置く。左端はパネルと揃える（`PANEL_INDENT` と同じ 12px）。**`layout.ts` がこのボタンの高さ（`ACTION_HEIGHT`）を勘定に入れる**——入れ忘れると箱の下端からはみ出す。

- [ ] **Step 5: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "feat(issue-tree): 仮説の追加・削除をマウスの動線に置く"
```

---

### Task 9: 帯——FB待ちのチップと解決の別枠

**Files:**
- Modify: `src/modules/issue-tree/open-targets.ts`
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`
- Test: `src/modules/issue-tree/open-targets.test.ts`

**Interfaces:**
- Consumes: m4 の `derive.ts`（`QUESTION_LABELS` に FB待ちが増え、未判断が消えている）
- Produces: `OpenKind` に `'fbWait'` が加わり、`'judgement'` が消える

- [ ] **Step 1: 飛び先のテストを書く**

```ts
it('FB待ちのチップから、FBが0件の問いへ飛ぶ', () => {
  const targets = listOpenTargets(data, posed)
  const next = nextOpenTarget(targets, 'fbWait', null)
  expect(next?.focus).toEqual({ cell: 'ask', index: 0, askIndex: 1 })
})

it('数える根と飛ぶ先の根が同じ', () => {
  // m3 が置いた規律。FB待ちの件数と、飛べる先の件数が一致すること
})
```

- [ ] **Step 2: 落ちることを確認 → 実装 → 通ることを確認**

`listOpenTargets` に FB待ちの列を足す。**閉じている課題の中の問いが行き先になる**ので、`goTo` は**課題を展開してからフォーカスを予約する**（展開しないと `data-cell` が DOM に無く、予約が当たらない）。

**この順序は m3 の `expandRow` → `pendingFocus` と同じ形**だが、単位が課題に変わっている。`IssueTreeEditor.tsx` の `goTo` に、行き先の課題を `setExpandedIssueKey` してから予約する経路を通す。

- [ ] **Step 3: 帯のチップを直す**

- 内訳の並びは 仮説なし / 未決 / FB待ち / 保留（`derive.ts` の `toMissingTally` が返す順。**打ち直さずそちらから引く**）
- **未判断のチップを消す**（m4 で導出が消えている）
- 別枠に **`解決 N`** を足す（`見送り N` の隣。`deferralLine` と同じ形の `resolvedLine` を m4 の `derive.ts` から引く）

- [ ] **Step 4: 全件検証**

Run: `npm test && npx tsc -b && npm run lint`

- [ ] **Step 5: Commit**

```bash
git add src/modules/issue-tree/
git commit -m "feat(issue-tree): 帯に FB待ち と 解決 を出し、未判断を落とす"
```

---

### Task 10: 設計ノートの改訂

**Files:**
- Modify: `docs/issue-tree/仮説検証モジュール-設計ノート.md`

- [ ] **Step 1: 決定を判断ごとに書く**

**「本文と矛盾しないこと」を確認して終わりにしない**（issue-tree-m3 の教訓）。**判断ごとに、それを述べている文が本文にあることを確かめる。**

改める節:

| 節 | 変更 |
| --- | --- |
| **D2**（ミュータブルな状態を持たない） | `resolved` は**人の表明**であって導出の複製ではない、と書き足す。旗が2つ（見送り・解決）になり排他であることも |
| **D8**（展開はビュー状態） | 展開の単位が**課題**になったこと。フォーカスによる自動展開をやめたこと |
| **D9**（メモを選別して根拠へ移す） | **廃止。** 理由は手で書く。FB は移動せずその場に残る。**廃止した理由を消さずに残す**（「なぜ一度そう決めて、なぜやめたか」が次の設計者の入力になる） |
| **新 D12** | 展開中のノードだけ幅を広げる。列全体が押し広がることと、それを受け入れた理由 |
| **新 D13** | キーボードは課題の追加・削除・移動だけ。仮説はマウス。**「キーでしか到達できない意味を残さない」の裏返しとして、マウスでしか到達できない意味は許す**という判断であることを明記する |

- [ ] **Step 2: Commit**

```bash
git add docs/issue-tree/仮説検証モジュール-設計ノート.md
git commit -m "docs(issue-tree): 設計ノートに m5 の判断を反映する"
```

---

### Task 11: 最終ブランチレビュー

- [ ] **Step 1: ブランチ全体をレビューする**

`superpowers:requesting-code-review` に従い、**このブランチの全コミット**を対象にレビューを依頼する。観点として次を明示的に渡す:

- **測定と描画の食い違い**（`measure.ts` の定数と Tailwind クラスが対で直っているか）
- **タスクの継ぎ目**（Task 2 の展開単位と Task 9 の `goTo` の予約、Task 5 の `cell-keys` と Task 6 の新しいセル）
- **消したはずの操作が残っていないか**（`runRowCommand` の残骸、未判断の文字列、`rationale` の参照）
- **`e.key` を直接見ている箇所**（Task 3 の `swallowEnter` だけであること）

- [ ] **Step 2: Critical / Important を潰す**

`superpowers:receiving-code-review` に従う。**指摘に同意できないときは、根拠を示して反論してよい**（追認しない）。

---

### Task 12: ドキュメントへの反映（実機確認とは束ねない）

**Files:**
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`（該当があれば）
- Create: `docs/history/issue-tree-m5-hypothesis-ui.md`

- [ ] **Step 1: `open-issues.md` を更新する**

**消す**（このマイルストーンで解消したもの。実物で確認してから消す）:
- 「畳まれた仮説の行に入ると、1回の `Tab` / `Shift+Tab` でフォーカスが2回動く」——`onFocus={props.onExpand}` が消えた
- 「課題ツリーの UI の reveal 機構と `onCloseAutoFocus` の抑止にテストが無い」のうち **reveal 機構の部分**——「根拠へ」ボタンは m4 で消えている（`onCloseAutoFocus` の抑止は Task 7 で残るので、そちらは**残す**か、Task 7 で書いたテストで消えるかを確認して判断する）

**足す**（新たに開いたもの。少なくとも次を検討する）:
- 展開中のノードが**列全体を押し広げる**ため、深い木では横スクロールが増えること（前提2で受け入れた挙動）
- 仮説の並び替えの手段が無いこと（前提9）
- 「どの問いにも紐づかない FB」ブロックの固定文が編集できないこと（意図。だが文言が画面にしか無い）

- [ ] **Step 2: `overview-rev.md` へ反映する**

rev 10章（操作言語）に**「ツールによっては操作言語を通らない欄がある」**という例外が生まれた。**反映漏れは設計と実装の食い違いとして伝播する**（M4 の教訓）ので、申し送りに TODO として残さず、ここで書く。

- [ ] **Step 3: 申し送りを書く**

`docs/history/issue-tree-m5-hypothesis-ui.md` に、実装で確定した事項・見つかった欠陥・**実機確認のチェックリストを空のまま**写す（Task 13 は人間の作業なので、この時点では未実施）。

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs(issue-tree): m5 の申し送りと残件を反映する"
```

---

### Task 13: 実機確認（人間の作業。エージェントは実行できない）

**サブエージェントは Tauri の GUI を操作できない。** 以下は人間がアプリを起動して行う。

- [ ] `npm run tauri dev` で起動し、`sample-project/課題ツリー.json` を開く
- [ ] 課題のトグルで展開・折りたたみができ、**展開中だけ幅が広がる**
- [ ] 展開したとき、**同じ列の他のノードが 320 のまま残り、次の列が右へずれる**（前提2の見え方が受け入れられるか。ここで「やはり辛い」となったら、サイドパネル案へ戻す判断が要る）
- [ ] 閉じたまま `Enter` / `Tab` で課題を足せる。**仮説の行では `Enter` が改行を入れない**
- [ ] 仮説のタイトル・詳細・価値仮説・理由が打てる（**IME 変換中の `Enter` で確定できる**）
- [ ] 検証結果のバッジを押して判断を変えられ、直後に理由が打てる
- [ ] 聞きたいことを足すと FB待ち が立ち、FB を足すと消える
- [ ] FB を消せる。**消しても他の FB がずれない**
- [ ] 解決の旗を立てると配下が薄くなり、要対応の数が減る。見送りと入れ替えられる
- [ ] 帯の FB待ち チップを押すと、**閉じている課題が開いてその問いへ飛ぶ**
- [ ] ダーク配色（`.dark`）で、`judge-yes-face` の面と FB待ち の破線が読める
- [ ] 実機確認で編集した `sample-project/` を元に戻す（`git checkout -- sample-project/ && git clean -fdx sample-project/`）

---

## 自己レビュー（計画時点）

**1. Spec の網羅。** キャンバスの3枚に描かれているもののうち、どのタスクが実装するか:

| キャンバスの要素 | タスク |
| --- | --- |
| 課題の開閉トグル | Task 4 |
| 解決の旗と淡い緑の面 | Task 4 |
| 展開時の幅 780 と押し広げ | Task 2 |
| ソリューション仮説（タイトル／詳細） | Task 5 |
| 価値仮説 | Task 5 |
| 検証結果のバッジ＋日付＋理由 | Task 5・Task 7 |
| 聞きたいこと・FB・FB待ち | Task 6 |
| FB のアイコン・名前・日付・削除 | Task 6 |
| 仮説のゴミ箱・「＋ 仮説を追加」 | Task 8 |
| 帯の FB待ち / 解決 のチップ | Task 9 |
| 棄却された仮説の文字を一段落とす | **Task 5 に含める**（閉じた行の描画。`HypothesisRow.tsx` で `text-ink-muted`。面は敷かない——前提7） |
| キーヒント4つ | Task 3 |

**2. プレースホルダの走査。** 「TBD」「後で」「適切に」の類は無い。ただし **Task 5・Task 6 は完成コードを載せていない**——キャンバスが逐語の見本として存在し、そこから寸法と並びを取れるためである（教訓「計画のコードは検証済みの正ではない」に照らして、二重の見本を作らない判断）。**実装者はキャンバスを開いて作ること。**

**3. 型の整合。** 本計画が名指しした m4 の関数（`toggleResolved` / `setHypothesisTitle` / `setHypothesisDetail` / `setHypothesisValue` / `addAsk` / `setAskText` / `removeAsk` / `addFeedback` / `setFeedbackText` / `removeFeedback` / `resolvedLine`）は**すべて m4 が作る前提**で、本計画は作らない。**着手時に存在を確認し、名前が違えば計画の矛盾として報告すること**（勝手に合わせると m4 と二重の実装になる）。

**4. 依存の一本道。** Task 1 → 2 → 3 →（4・5）→ 6 → 7 → 8 → 9 の順。Task 4 と 5 は独立に着手できるが、どちらも Task 2 の `layout.ts` の書き換えに乗る。**Task 3（キーの削除）を後ろに回さない**——先に消しておかないと、Task 5・6 が消える予定のキー処理に配線してしまう。

**5. この計画が確かめていないこと。** 展開中のノードが列を押し広げる見え方（前提2）は、**キャンバスの静止画では確かめられない**——木全体がどう動くかは実機でしか分からない。Task 13 にその観察を置き、受け入れられなければサイドパネル案へ戻る余地を残してある。**紙の上で決着させない判断**（`lessons-for-planning.md` の「費用が入力の瞬間にしか現れない区別は実機で一巡してから決める」の系）。
