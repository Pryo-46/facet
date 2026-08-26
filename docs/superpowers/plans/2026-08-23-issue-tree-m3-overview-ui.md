# 課題ツリー 俯瞰 UI と語彙 issue-tree-m3 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 課題ツリーのキャンバスを「箱は課題だけ・仮説は箱の中の1行・判断は行末のバッジ1つ」に畳み、仮説の語彙を5語（支持／棄却／保留／未決／見送り）に揃え、詳細（由来・根拠・FB）はフォーカスした仮説だけ展開する形にする。あわせて「保留」をイベント種別として足し（schemaVersion 2）、抑制された配下を薄く見せる明度の段（`ink-faint`）をパレットに足す。

**Architecture:** データの芯（ミュータブルなステータスを持たず、追記専用の `events` の最新から導出する。D2）は**一切変えない**。変えるのは (1) 表現——`layout.ts` が課題ノードと仮説を1つの箱に畳み、展開はビュー状態（保存しない。D8）で決まる、(2) 語彙——`derive.ts` の表示文言と問いの種類、(3) スキーマの enum 1語（`onHold`）とそれに伴う初の `schemaVersion` 改訂＋`load.ts` の移行フック、(4) パレットのトークン1つ。`pendingNotes`（FB）と `events`（判断）は**別の配列のまま**にする（2026-08-23 の批評セッションでの決定。統一案は却下）。

**Tech Stack:** React 19 / Tailwind v4（役割トークン）/ Radix DropdownMenu / Vitest（jsdom）/ json-schema-to-typescript / Node 22.18+（Skill の型ストリップ）

**Spec:**
- 設計の正: [`docs/issue-tree/仮説検証モジュール-設計ノート.md`](../../issue-tree/仮説検証モジュール-設計ノート.md)（D1〜D9。本計画の Task 9 で D10〜D11 を足し、D8 を改める）
- 見え方の正: [`docs/issue-tree/俯瞰モック/`](../../issue-tree/俯瞰モック/) の3枚（`俯瞰.html` / `展開.html` / `バッジ語彙.html`。**ブラウザで直接開ける静止画**。facet の実トークン・実寸法で描いてあるので、寸法はここから逐語で取る）
- データ形式の正: [`schemas/issue-tree.schema.json`](../../../schemas/issue-tree.schema.json)
- 批評の記録: 本計画の「この計画が置いた前提」節（批評セッションは追跡外なので、決定とその理由をここに写してある）

## 前後のマイルストーン

| | | 状態 |
| --- | --- | --- |
| **issue-tree-m1** エディタ | [`2026-08-22-issue-tree-m1-editor.md`](2026-08-22-issue-tree-m1-editor.md) | 完了・マージ済み |
| **issue-tree-m2** 登録 Skill とお手本 | [`2026-08-22-issue-tree-m2-register-skill.md`](2026-08-22-issue-tree-m2-register-skill.md) | **先にマージされていること**（計画時点では `worktree-issue-tree-m2` に5コミットあり未マージ） |
| **issue-tree-m3** 俯瞰 UI と語彙 | 本計画 | |

**issue-tree-m2 が未マージのまま着手しないこと。** 本計画は `.claude/skills/issue-tree-register/`（`scripts/derive.ts` のバイト一致コピー・`schemas/issue-tree.schema.json` のコピー・`SKILL.md` の文言）と `sample-project/課題ツリー.json` を**更新する**タスクを含む。それらは m2 が作る。着手前に `git log --oneline -1 -- .claude/skills/issue-tree-register/SKILL.md` が空でないことを確かめる。

## この計画が置いた前提（批評セッション 2026-08-23 の決定）

**1. キャンバスは残す。俯瞰できることが価値。** 壊れていたのは骨組み（M20 のキャンバス基盤・エッジ）ではなく載せ物——仮説カードに文言・由来・メモ・イベント全件を積んだため、俯瞰したいもの（課題の木と、どの仮説が生き残ったか）と読みたいもの（根拠の文章）が同じ面で場所を取り合っていた。ロジックツリーが読めるのはノードが1行だからで、課題ツリーを同じ密度に戻す。

**2. 物の種類を形の種類に対応させる。** キャンバスに載る文字物は5種類（課題・仮説・判断・見送り・FB／由来／根拠）あるのに、形は「箱」と「裸の文字」の2つしか無かった。新しい文法:

| 物 | 形 |
| --- | --- |
| 課題 | **箱**（これだけが箱。エッジが出入りする） |
| 仮説 | 箱の中の**1行**（左に点、右端にバッジ。枠無し） |
| 判断（仮説の現在） | 行末の**バッジ1つ**（最新イベントから導出） |
| 見送り（課題の現在） | 課題タイトル右の**バッジ**＋理由の行 |
| 由来・根拠・FB・過去の判断 | **展開時だけ**の本文（箱の中の内側パネル） |

**3. 仮説の5語。** 俯瞰のバッジは5語で、正確な種別（6＋1種）は展開で出す:

| 語 | 正体（`kind`） | 性質 | 見た目 |
| --- | --- | --- | --- |
| 支持 | `supported` / `supportedWithoutTest` | 閉じた | `ok` の塗り＋`ok-fg` の字 |
| 棄却 | `rejected` / `rejectedWithoutTest` | 閉じた | `ink` の塗り＋`surface` の字（反転。新しい色値なし） |
| 保留 | **`onHold`（本計画で新設）**＝見たが判断できなかった。理由付き | 開いている | `warning` の**実線**の枠だけ |
| 未決 | イベント無し（導出） | 開いている | `warning` の**破線**の枠だけ |
| 見送り | `deferred` / `deferredToMainDev` | このエピックの外 | `ink-muted` の枠だけ |

課題側は「仮説なし」（葉に仮説が無い）を未決と同じ破線バッジで出す。「保留」と「未決」は同じ色相で、実線か破線か（見たか／まだか）で分ける。

**4. 判断は1つ、FB は複数——表現として。データは分けたまま。** 「判断の履歴」という見出しは使わない。展開では「判断」（最新1件。根拠が編集できる）／「以前の判断」（2件目以降。薄く・読み取り専用）／「由来」／「FB」（`pendingNotes`。編集できる）の順に出す。FB を `events` と1本に統一する案は**採らない**（ユーザー決定。D9 の「メモを選別して根拠へ移す」もそのまま）。

**5. 色を足さない。明度の段を1つ足す。** 意味を持つ色相は2つのまま（`warning`＝注意が要る／開いている、`ok`＝確定）。棄却を赤にしない——設計ノートもモックも「棄却は失敗ではなく入力」と書いており、叫ぶべきは未決だけ。抑制された配下は `opacity` ではなく新トークン `ink-faint`（両面で 3:1 を実測。WCAG 1.4.3 が非アクティブ要素を免除する範疇）で薄くする。「面を地の色に落とす」は箱が消えたように見えるのでやめる。

**6. 設計ノートの文を画面に出さない。** `SUPPRESSED_NOTE`（「祖先の見送りにより問いは立たない（導出。子に値は持たない）」）は実装者の語彙で、薄くすれば文は要らない。消す。

**7. 俯瞰からの動線。** 帯の集計をチップにし、押すと次の要対応（仮説なし／未決／保留／未判断）へ視点が飛ぶ。モック（アウトライン）には作れない、キャンバスを選んだ側だけの武器。

**8. 誤操作の穴は直さない（本計画の範囲外）。** 「同じ判断を続けて付けてしまう」「最新以外を消せない」は批評で挙がったが、FB の枠組み（判断を変えない FB は何件あってもよい）で意味が変わるので、実機で再観察してから決める。`open-issues.md` に載せる（Task 9）。

**9. `schemaVersion` を 2 にする。** スキーマ自身が「enum の拡張は schemaVersion の改訂として扱う」と書いている。これは**このリポジトリで初めての版上げ**で、`src/core/load.ts` の「既知の旧版が生まれたら module.migrate による移行をここに挟む」というコメントの場所に、初めて実装が入る（rev 5章「古いファイルは読み込み時にメモリ上で自動移行して開く」）。

**10. 確認が要る語。** 合計の見出し「要対応」と、問いの名詞形「仮説なし／未決／保留／未判断」は計画者の仮置き。Task 2 の着手前にユーザーが読み、違えば `QUESTION_LABELS` と `TALLY_TOTAL_LABEL` の値だけ変える（他に打ち直す場所は無い——それが `derive.ts` に1箇所置く理由）。

**既存実装と一致すべきものは実物が正。** 寸法・クラス名・文言をこの計画が引用している箇所は、引用元のパスを併記した。食い違いを見つけたら**辻褄を合わせずに「計画の矛盾」として報告する**こと。報告には**実行した検証コマンドとその出力を貼る**。

---

## Global Constraints（全タスクの要件に暗黙に含まれる）

### データ

- **ステータスのフィールドを作らない。** 現在の判断は `events` の最新から導出（D2）。`additionalProperties: false` が塞いでいる
- **`events` は追記専用。** 既存要素の書き換え・並べ替え・削除はしない。**根拠（`note`）を編集できるのは最新の1件だけ**（`setEventNote` / `setDeferralNote` が同じ規則を持つ）
- **`pendingNotes` と `events` は別の配列。** 統一しない（前提4）
- **ビュー状態（どの仮説が展開されているか）を JSON に書かない**（D8。座標を保存しないのと同じ）
- ID は `issue_` / `hypothesis_` ＋英数字62文字アルファベット10文字。採番は `commands.ts` の `newId` のみ

### 表示

- **色値を書かない。** 役割トークン（`text-ink` / `bg-ok` / `border-warning` …）だけ。`src/styles/conventions.test.ts` が直書きを弾く
- **文字サイズは `text-xs` / `text-sm` / `text-base` / `text-lg` の4段だけ**（`conventions.test.ts`）。任意値 `text-[...]` は使えない
- **半透明は登録した濃さ（`bg-warning/20` / `bg-warning/10`）だけ**（`src/styles/palette-requirements.ts` の `OVERLAYS`。`palette.test.ts` が `src/modules/` 配下の `.tsx` を走査する）。**`opacity-*` で薄くしない**——トークンの 4.5:1 の保証の外に出る
- **測定と描画は同じ数字を見る。** `measure.ts` の定数と Tailwind クラス（`px-2.5` = 10px など）は対で直す。描画が測定より高くなると下の行がはみ出す（`HypothesisCard.tsx` の `badgeRowClass` の注釈と同じ規律）
- **`data-cell` の文字列は `cell-keys.ts` だけが作る。** 部品でもエディタでも組み立て直さない
- **キーの判定はコアの `resolveCommand` に委ねる。** ツール側で `e.key` を見ない（rev 10章）
- **ドロップダウンは同時に1つ**（`openCell` の鍵1つ。sequence M3 Task 11b の形）。キャンバスのズーム・パンは止めない
- アクセシブル名の前半（`課題{N}` / `仮説{N}`）は**動かさない**——DOM テストが前方一致で引く

### Skill との同期

- `src/modules/issue-tree/derive.ts` は `.claude/skills/issue-tree-register/scripts/derive.ts` へ**バイト一致コピー**される。`derive.ts` を触ったタスクは同じタスクの中で `cp` し、`src/modules/issue-tree/skill-copy.test.ts` を緑にする。**手で書き写さない**
- `schemas/issue-tree.schema.json` も同じ（`.claude/skills/issue-tree-register/schemas/issue-tree.schema.json`。`src/core/skill-schema-copy.test.ts` が見る）
- `derive.ts` は**値 import・相対 import・enum を持たない**（型ストリップで Node から読むため。`skill-copy.test.ts` が見る）

### 検証

- 各タスクの最後に **`npm test && npx tsc -b && npm run lint`** を全件で回す（対象を絞らない）。報告にはコマンドと出力の末尾を貼る
- スタイルの解決に関わる変更（Task 3・Task 4）は **`npx vite build` で生成 CSS を読む**手順を含む（M8 の教訓。`npm test` / `tsc` / `lint` は CSS のカスケードを見ない）

### やらないこと（このマイルストーンの範囲外）

- **フォーカスモード（選択サブツリー以外を薄くする。D8）** —— `ink-faint` という手段は本計画で生えるが、選択状態の設計は別。`open-issues.md` の既存項目（`[issue-tree-m1]`）は据え置く
- **Markdown 出力**（設計ノートの OUT）
- **仮説を別の課題へ付け替える**（`open-issues.md` `[issue-tree-m1]`）
- **判断の誤操作の防止**（前提8）
- **課題ノードの見送りのキーボード経路**（`open-issues.md` `[issue-tree-m1]`）——トリガーは箱の中へ移すが、キー割り当ては足さない
- **`README.md` のスクリーンショット**——撮るのは人間（Task 10）。撮れたらコメントの外へ出す

---

## ファイル構成

| ファイル | 扱い | 責務 |
| --- | --- | --- |
| `schemas/issue-tree.schema.json` | 変更 | `schemaVersion: 2`、`judgementEvent.kind` に `onHold` |
| `src/types/issue-tree.ts` | 再生成 | `npm run gen:types`（手で編集しない） |
| `src/modules/issue-tree/migrate.ts` | 変更 | 1 → 2 の変換（`schemaVersion` の書き換えだけ） |
| `src/modules/issue-tree/migrate.test.ts` | 新規 | 恒等性・冪等性 |
| `src/core/load.ts` | 変更 | **初の移行フック**——既知の旧版は `module.migrate` で移してから検証する |
| `src/core/load.test.ts` | 変更 | 旧版 → editable、新版 → listOnly |
| `src/modules/issue-tree/derive.ts` | 変更 | 問い4種・5語のラベル・バッジ群・集計の文言。`SUPPRESSED_NOTE` 削除 |
| `src/modules/issue-tree/derive.test.ts` | 変更 | |
| `src/styles/palette.css` / `palette-requirements.ts` / `src/index.css` | 変更 | `ink-faint` |
| `.claude/skills/palette-retheme/SKILL.md` | 変更 | 11 → 12 トークン |
| `src/modules/issue-tree/measure.ts` | 変更 | 箱・行・パネルの寸法 |
| `src/modules/issue-tree/layout.ts` | 書き換え | 課題の箱＝タイトル＋見送り＋仮説行（＋展開パネル） |
| `src/modules/issue-tree/layout.test.ts` | 書き換え | |
| `src/modules/issue-tree/badge-styles.ts` | 新規 | バッジ群 → クラス名（部品ファイルはコンポーネントしか export しない制約があるため別モジュール） |
| `src/modules/issue-tree/commands.ts` | 変更 | `setDeferralNote`（最新の見送りの理由） |
| `src/modules/issue-tree/commands.test.ts` | 変更 | |
| `src/modules/issue-tree/IssueBox.tsx` | 書き換え | 課題の箱（タイトル・見送りバッジ・理由・子要素として仮説行） |
| `src/modules/issue-tree/HypothesisRow.tsx` | 新規（`HypothesisCard.tsx` を削除） | 仮説1行＋展開パネル |
| `src/modules/issue-tree/HypothesisRow.dom.test.tsx` | 新規（`HypothesisCard.dom.test.tsx` を削除） | |
| `src/modules/issue-tree/IssueTreeEditor.tsx` | 変更 | 展開状態・3本目の測定器・帯のチップ・トリガーの置き場所 |
| `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx` | 変更 | |
| `src/modules/issue-tree/open-targets.ts` | 新規 | 要対応の並び（DFS 順）と「次」の計算 |
| `src/modules/issue-tree/open-targets.test.ts` | 新規 | |
| `.claude/skills/issue-tree-register/scripts/derive.ts` / `schemas/issue-tree.schema.json` | `cp` | バイト一致コピーの更新 |
| `.claude/skills/issue-tree-register/SKILL.md` | 変更 | 語彙・問い4種・`schemaVersion: 2`・`onHold` |
| `src/core/reading-guide.md` | 変更 | 同上（配布物 `README-for-AI.md` の原本） |
| `sample-project/課題ツリー.json` | 書き直し | `schemaVersion: 2`・保留の例を1件 |
| `docs/issue-tree/仮説検証モジュール-設計ノート.md` | 変更 | D8 改・D10・D11 |
| `docs/history/issue-tree-m3-overview-ui.md` | 新規 | 申し送り |
| `docs/open-issues.md` / `docs/overview-rev.md` / `docs/lessons-for-planning.md` / `docs/README.md` / `README.md` | 変更 | Task 9 |

---

### Task 1: スキーマ v2——`onHold` と初の移行

**Files:**
- Modify: `schemas/issue-tree.schema.json`
- Regenerate: `src/types/issue-tree.ts`（`npm run gen:types`）
- Modify: `src/modules/issue-tree/migrate.ts`
- Create: `src/modules/issue-tree/migrate.test.ts`
- Modify: `src/modules/issue-tree/module.ts`（`schemaVersion: 2`・`createEmpty` の `schemaVersion: 2`）
- Modify: `src/core/load.ts:100-108`
- Modify: `src/core/load.test.ts`
- Modify: `src/modules/issue-tree/schema.test.ts`
- Modify（型名の置換）: `IssueTreeSchemaVersion1` を参照する全ファイル——`git grep -l IssueTreeSchemaVersion1 -- src` の出力（計画時点で14本。**件数ではなく grep の出力が正**）
- Copy: `.claude/skills/issue-tree-register/schemas/issue-tree.schema.json`

**Interfaces:**
- Produces: `JudgementEvent['kind']` に `'onHold'`。型名 `IssueTreeSchemaVersion2`（`title` から生成される）。`migrateIssueTree(data, fromVersion): IssueTreeSchemaVersion2`
- Produces: `load.ts` の `classifyFile` が「既知 type × 旧 schemaVersion」を `module.migrate` で移してから検証する

- [ ] **Step 1: スキーマを書き換える**

`schemas/issue-tree.schema.json` で:

1. `"title": "課題ツリー (issueTree) schemaVersion 1"` → `"課題ツリー (issueTree) schemaVersion 2"`（この `title` から型名 `IssueTreeSchemaVersion2` が生成される。`scripts/gen-types.mjs` は `json-schema-to-typescript` の既定の命名）
2. `properties.schemaVersion`: `"const": 1` → `"const": 2`。`description` を「スキーマの版。issueTree は 2 が現行（1 → 2 は `judgementEvent.kind` に `onHold` を足した改訂。旧版はアプリが読み込み時に移行する）。アプリは検証前にこの値を読み、未知の新版は「一覧表示のみ・編集不可」として扱う。」に
3. `$defs.judgementEvent.properties.kind.enum` に `"onHold"` を **`rejectedWithoutTest` の次、`deferred` の前**に足す。`description` の列挙に「onHold＝保留（見たが判断できなかった。理由を note に書く。次のレビューで拾い直す）」を足す
4. `$defs.deferralEvent` は**触らない**（課題側に保留は無い）
5. `properties.hypotheses` / `$defs.hypothesis` の `description` で「events が空＝未決（「検証結果は？」warning）」と書いている箇所を「events が空＝未決」に直す（問いの文言は Task 2 で変わる。description に問いの文言を残すと二重になる）。トップレベルの `description` の「問いの立ち方は導出で決まる：…」の文も同様に、文言を引かずに「子を持たない課題に仮説が無い／仮説のイベントが0件／最新が onHold／pendingNotes が残っている、の4つが問いとして立つ」に直す

- [ ] **Step 2: 型を再生成し、型名を置換する**

```bash
npm run gen:types
git grep -l IssueTreeSchemaVersion1 -- src | xargs sed -i 's/IssueTreeSchemaVersion1/IssueTreeSchemaVersion2/g'
git grep -n IssueTreeSchemaVersion1      # 出力が空であること（.claude/skills の derive.ts は Task 2 で cp する）
```

- [ ] **Step 3: 落ちるテストを書く（スキーマ）**

`src/modules/issue-tree/schema.test.ts` の `base` を `schemaVersion: 2` にしたうえで足す:

```ts
it('仮説の判断に onHold（保留）を受け入れる', () => {
  const h = { ...base.hypotheses[0], events: [{ kind: 'onHold', note: '「楽」の定義が決まらず判断できない' }] }
  expect(validate({ ...base, hypotheses: [h] }).ok).toBe(true)
})

it('課題の見送りに onHold は付けられない（保留は仮説だけ）', () => {
  const node = { ...base.issues[1], events: [{ kind: 'onHold', note: '' }] }
  expect(validate({ ...base, issues: [base.issues[0], node] }).ok).toBe(false)
})

it('schemaVersion 1 はレベル1で弾く（移行は load.ts の仕事。スキーマは現行版しか受けない）', () => {
  expect(validate({ ...base, schemaVersion: 1 }).ok).toBe(false)
})
```

- [ ] **Step 4: 落ちるテストを書く（マイグレータ）**

`src/modules/issue-tree/migrate.test.ts`（新規）:

```ts
import { describe, expect, it } from 'vitest'
import { migrateIssueTree } from './migrate'

const v1 = {
  schemaVersion: 1,
  type: 'issueTree',
  title: '旧版',
  issues: [{ id: 'issue_AAAAAAAAAA', parentId: null, text: '根', events: [] }],
  hypotheses: [
    {
      id: 'hypothesis_AAAAAAAAAA',
      issueId: 'issue_AAAAAAAAAA',
      text: '仮説',
      rationale: '',
      events: [{ kind: 'rejected', note: '一度棄却' }],
      pendingNotes: ['SH の指摘'],
    },
  ],
}

describe('migrateIssueTree', () => {
  it('1 → 2 は schemaVersion だけを書き換え、他のキーと配列順を保つ', () => {
    const out = migrateIssueTree(v1, 1)
    expect(out.schemaVersion).toBe(2)
    expect({ ...out, schemaVersion: 1 }).toEqual(v1)
  })

  it('現行版（2）を渡しても同じ内容が返る（冪等）', () => {
    const once = migrateIssueTree(v1, 1)
    expect(migrateIssueTree(once, 2)).toEqual(once)
  })

  it('入力を破壊しない', () => {
    const before = JSON.stringify(v1)
    migrateIssueTree(v1, 1)
    expect(JSON.stringify(v1)).toBe(before)
  })
})
```

- [ ] **Step 5: 落ちるテストを書く（読み込み時の移行）**

`src/core/load.test.ts` に足す。既存の fixture の作り方（`registry` の組み立て方・`classifyFile` の呼び方）は同ファイルの `'スキーマ検証を通るファイルは editable（title と data つき）'` から逐語で写すこと。

```ts
it('既知 type × 旧 schemaVersion は module.migrate で移してから検証し、editable になる（rev 5章）', () => {
  // 課題ツリーの v1（onHold を含まない）。移行後の data は schemaVersion 2
  const text = JSON.stringify({ schemaVersion: 1, type: 'issueTree', title: '旧版', issues: [], hypotheses: [] })
  const out = classifyFile(text, registry)
  expect(out.status).toBe('editable')
  if (out.status === 'editable') expect((out.data as { schemaVersion: number }).schemaVersion).toBe(2)
})

it('移行後にスキーマ検証へ落ちるファイルは rejected（移行が検証を飛ばさない）', () => {
  // v1 の形をしているが必須キーが欠けている
  const text = JSON.stringify({ schemaVersion: 1, type: 'issueTree', title: '壊れた旧版', issues: [] })
  expect(classifyFile(text, registry).status).toBe('rejected')
})
```

既存の `'未知の新しい schemaVersion は listOnly（レベル1拒否にしない）'` は**そのまま残す**（新版は引き続き listOnly）。その fixture が `schemaVersion: 2` を「未知の新版」として使っているなら `99` に変える（課題ツリー以外の module を使っていれば変更不要。実物を見て決める）。

- [ ] **Step 6: テストが落ちることを確認する**

Run: `npx vitest run src/modules/issue-tree/schema.test.ts src/modules/issue-tree/migrate.test.ts src/core/load.test.ts`
Expected: 新しい `it` が FAIL（`onHold` は enum 違反／`migrateIssueTree` が `schemaVersion` を変えない／旧版が listOnly）

- [ ] **Step 7: 実装する**

`src/modules/issue-tree/migrate.ts`:

```ts
import type { IssueTreeSchemaVersion2 } from '@/types/issue-tree'

/**
 * 規約6: マイグレータ。**1 → 2 は `schemaVersion` の書き換えだけ**——
 * 2 は `judgementEvent.kind` に `onHold`（保留）を足した改訂で、
 * 1 の正しいファイルはそのまま 2 の正しいファイルである。
 *
 * 移行後の検証は呼び出し側（`src/core/load.ts`）がやる。ここでは形を
 * 見ない（見ると、検証の規則が2箇所に生える）
 */
export function migrateIssueTree(data: unknown, fromVersion: number): IssueTreeSchemaVersion2 {
  if (fromVersion >= 2) return data as IssueTreeSchemaVersion2
  return { ...(data as Record<string, unknown>), schemaVersion: 2 } as IssueTreeSchemaVersion2
}
```

`src/core/load.ts:100-108` を次の形に（**既存の listOnly の分岐は「新版」だけに絞る**）:

```ts
  const version = record.schemaVersion
  if (typeof version !== 'number' || version > module.schemaVersion) {
    return {
      status: 'listOnly',
      type,
      title,
      reason: `このバージョンでは編集できない schemaVersion です: ${String(version)}`,
    }
  }
  // 既知の旧版はメモリ上で現行版へ移してから検証する（rev 5章）。
  // **移行は検証を飛ばさない**——移した結果がスキーマに合わなければ rejected
  const candidate: Record<string, unknown> =
    version < module.schemaVersion
      ? (module.migrate(record, version) as Record<string, unknown>)
      : record
```

以降の `validate(record)` と `data: record` を `candidate` に差し替える。`titleOf(record)` も `candidate` に。

`src/modules/issue-tree/module.ts`: `schemaVersion: 2` と `createEmpty` の `schemaVersion: 2`。

- [ ] **Step 8: Skill のスキーマコピーを更新する**

```bash
cp schemas/issue-tree.schema.json .claude/skills/issue-tree-register/schemas/issue-tree.schema.json
```

- [ ] **Step 9: 全件で緑を確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。`src/core/skill-schema-copy.test.ts` と `src/modules/issue-tree/skill-copy.test.ts` を含む（後者の `derive.ts` の一致は Step 2 の sed がコピー側を触っていないので**ここでは赤になる**——Task 2 の cp で緑になる。**本タスクの報告にその赤を明記する**。Task 2 と同じ PR に入るので、赤いコミットを避けるなら Task 2 の Step 8 まで進めてから両タスクを1コミットにしてもよい。どちらにしたかを報告する）

- [ ] **Step 10: コミット**

```bash
git add schemas/issue-tree.schema.json src/types/issue-tree.ts src/modules/issue-tree/ src/core/load.ts src/core/load.test.ts .claude/skills/issue-tree-register/schemas/issue-tree.schema.json
git commit -m "feat(issue-tree): schemaVersion 2——判断に onHold（保留）を足し、読み込み時の移行を初めて配線する"
```

---

### Task 2: 語彙——問い4種・5語のバッジ・集計の文言

**Files:**
- Modify: `src/modules/issue-tree/derive.ts`
- Modify: `src/modules/issue-tree/derive.test.ts`
- Copy: `.claude/skills/issue-tree-register/scripts/derive.ts`
- Modify: `.claude/skills/issue-tree-register/SKILL.md`（問い・語彙・`schemaVersion: 2`・`onHold` の記述）
- Modify: `src/core/reading-guide.md`（`README-for-AI.md` の原本。課題ツリーの節）

**Interfaces:**
- Produces（`derive.ts`）:
  - `HypothesisQuestions` に `hold: boolean`（最新が `onHold`。抑制されていれば false）
  - `IssueTreeTally` に `hold: number`
  - `QUESTION_LABELS = { hypothesis: '仮説なし', result: '未決', hold: '保留', judgement: '未判断' }`
  - `TALLY_TOTAL_LABEL = '要対応'`
  - `tallyLine(t)`: 例 `⚠ 要対応 4（仮説なし 2 ／ 未決 1 ／ 保留 1）`。**0 の内訳は出さない。** 合計 0 なら `要対応 0`（⚠ 無し）
  - `type BadgeGroup = 'yes' | 'no' | 'hold' | 'open' | 'deferred'`
  - `badgeGroupOf(status: HypothesisStatus): BadgeGroup`
  - `BADGE_LABELS: Record<BadgeGroup, string> = { yes: '支持', no: '棄却', hold: '保留', open: '未決', deferred: '見送り' }`
  - `ISSUE_DEFERRED_LABEL = '見送り'`（課題側のバッジ。`BADGE_LABELS.deferred` と同じ値だが、課題と仮説で独立に変えられるよう別名にする）
  - `EVENT_KIND_LABELS` に `onHold: '保留'`（展開の「以前の判断」とドロップダウンに出す正確な種別）
  - `SUPPRESSED_NOTE` は**この時点では残す**（`IssueTreeEditor.tsx` と `layout.ts` がまだ使う。Task 4 で両方から消すときに一緒に消す）
- Consumes: Task 1 の `'onHold'`

- [ ] **Step 1: 落ちるテストを書く**

`src/modules/issue-tree/derive.test.ts` に足す（既存の `issues()` / `hypothesis()` ヘルパを使う）:

```ts
describe('保留（onHold）の問い', () => {
  it('最新が onHold の仮説に「保留」の問いが立ち、未決とは別に数える', () => {
    const hs = [
      hypothesis(1, id(2), { events: [{ kind: 'onHold', note: '判断材料が足りない' }] }),
      hypothesis(2, id(3)), // 未決
      // 保留 → 支持 に覆った仮説。最新が決める
      hypothesis(3, id(4), { events: [{ kind: 'onHold', note: '' }, { kind: 'supported', note: '' }] }),
    ]
    const posed = poseQuestions({ issues: issues(), hypotheses: hs })
    expect(posed.hypothesisQuestions.map((q) => q.hold)).toEqual([true, false, false])
    expect(posed.hypothesisQuestions.map((q) => q.result)).toEqual([false, true, false])
    expect(tallyQuestions(posed)).toMatchObject({ hold: 1, result: 1 })
  })

  it('祖先の見送りで抑制された配下では保留も立たない', () => {
    const deferred = issues().map((n) => (n.id === id(1) ? { ...n, events: [{ kind: 'deferred' as const, note: '' }] } : n))
    const hs = [hypothesis(1, id(2), { events: [{ kind: 'onHold', note: '' }] })]
    expect(poseQuestions({ issues: deferred, hypotheses: hs }).hypothesisQuestions[0].hold).toBe(false)
  })
})

describe('バッジ群（5語）', () => {
  it('7種の kind と未決を5語に畳む', () => {
    expect(badgeGroupOf('supported')).toBe('yes')
    expect(badgeGroupOf('supportedWithoutTest')).toBe('yes')
    expect(badgeGroupOf('rejected')).toBe('no')
    expect(badgeGroupOf('rejectedWithoutTest')).toBe('no')
    expect(badgeGroupOf('onHold')).toBe('hold')
    expect(badgeGroupOf('deferred')).toBe('deferred')
    expect(badgeGroupOf('deferredToMainDev')).toBe('deferred')
    expect(badgeGroupOf('undecided')).toBe('open')
  })

  it('5語の文言はここ1箇所から引ける', () => {
    expect(Object.values(BADGE_LABELS)).toEqual(['支持', '棄却', '保留', '未決', '見送り'])
  })
})

describe('tallyLine', () => {
  it('0 の内訳は出さない', () => {
    expect(tallyLine({ hypothesis: 2, result: 1, hold: 1, judgement: 0, total: 4 })).toBe(
      '⚠ 要対応 4（仮説なし 2 ／ 未決 1 ／ 保留 1）',
    )
  })
  it('合計 0 は内訳も ⚠ も付けない', () => {
    expect(tallyLine({ hypothesis: 0, result: 0, hold: 0, judgement: 0, total: 0 })).toBe('要対応 0')
  })
})
```

既存の `tallyLine` / `QUESTION_LABELS` を使うテスト（`derive.test.ts` 内、および `IssueTreeEditor.dom.test.tsx`・`HypothesisCard.dom.test.tsx`・`skill-write.smoke.test.ts`）は**文言を `derive.ts` から import して比較している**ので、値を変えても緑のまま通るものが多い。**逐語の文字列を書いているテストが無いか `git grep -n "仮説は？\|検証結果は？\|判断は？\|未決 " -- src` で確かめ、あれば import に置き換える。**

- [ ] **Step 2: 落ちることを確認する**

Run: `npx vitest run src/modules/issue-tree/derive.test.ts`
Expected: FAIL（`hold` が無い／`badgeGroupOf` が無い／文言が旧形式）

- [ ] **Step 3: 実装する**

`src/modules/issue-tree/derive.ts` の変更点（**値 import を足さないこと**）:

```ts
export interface HypothesisQuestions {
  /** 「未決」＝ events が0件 */
  result: boolean
  /** 「保留」＝最新が onHold（見たが判断できなかった。次のレビューで拾い直す） */
  hold: boolean
  /** 「未判断」＝ pendingNotes が空でない（レビューの締め忘れ） */
  judgement: boolean
}
// poseQuestions の hypothesisQuestions:
//   result: !off && h.events.length === 0,
//   hold: !off && latestKind(h.events) === 'onHold',
//   judgement: !off && h.pendingNotes.length > 0,

export interface IssueTreeTally { hypothesis: number; result: number; hold: number; judgement: number; total: number }
// tallyQuestions は hold も数え、total に足す

export const QUESTION_LABELS = {
  hypothesis: '仮説なし',
  result: '未決',
  hold: '保留',
  judgement: '未判断',
} as const
export const TALLY_TOTAL_LABEL = '要対応'

export function tallyLine(t: IssueTreeTally): string {
  const parts = (
    [
      [QUESTION_LABELS.hypothesis, t.hypothesis],
      [QUESTION_LABELS.result, t.result],
      [QUESTION_LABELS.hold, t.hold],
      [QUESTION_LABELS.judgement, t.judgement],
    ] as const
  )
    .filter(([, n]) => n > 0)
    .map(([label, n]) => `${label} ${n}`)
  if (t.total === 0) return `${TALLY_TOTAL_LABEL} 0`
  return `⚠ ${TALLY_TOTAL_LABEL} ${t.total}（${parts.join(' ／ ')}）`
}

/** 俯瞰のバッジは5語。正確な種別（EVENT_KIND_LABELS）は展開で出す */
export type BadgeGroup = 'yes' | 'no' | 'hold' | 'open' | 'deferred'
export function badgeGroupOf(status: HypothesisStatus): BadgeGroup {
  switch (status) {
    case 'supported':
    case 'supportedWithoutTest':
      return 'yes'
    case 'rejected':
    case 'rejectedWithoutTest':
      return 'no'
    case 'onHold':
      return 'hold'
    case 'deferred':
    case 'deferredToMainDev':
      return 'deferred'
    case 'undecided':
      return 'open'
  }
}
export const BADGE_LABELS: Record<BadgeGroup, string> = {
  yes: '支持',
  no: '棄却',
  hold: '保留',
  open: '未決',
  deferred: '見送り',
}
/** 課題側（見送りの2種）のバッジ。仮説の5語と独立に変えられるよう別名 */
export const ISSUE_DEFERRED_LABEL = '見送り'
```

`EVENT_KIND_LABELS` に `onHold: '保留'` を足す（`Record<JudgementKind, string>` なので、足さないと tsc が落ちる——それが `onHold` の追従漏れを検知する仕組み）。ファイル冒頭のコメント「色では区別しない（D8）」は「俯瞰のバッジは `badgeGroupOf` の5群で、面は塗らず枠と塗りの形で分ける（D8 改。Task 9 の設計ノート参照）」に直す。

- [ ] **Step 4: 緑を確認し、Skill へコピーする**

```bash
npx vitest run src/modules/issue-tree/derive.test.ts
cp src/modules/issue-tree/derive.ts .claude/skills/issue-tree-register/scripts/derive.ts
npx vitest run src/modules/issue-tree/skill-copy.test.ts src/modules/issue-tree/skill-write.smoke.test.ts
```

Expected: 緑。smoke テストは `tallyLine` の出力をアプリ側 import と突き合わせるので、文言が変わっても緑（**逐語で書いていれば赤になる——そのときは import に直す**）。

- [ ] **Step 5: Skill の手順書と読み方ガイドを直す**

`.claude/skills/issue-tree-register/SKILL.md` で、次を実物の行を grep して直す（計画時点の行番号: 23・196・216〜218・258。**行番号は動く。`grep -n "仮説は？\|検証結果は？\|判断は？\|schemaVersion\|問いの類型" SKILL.md` で引き直す**）:

- 問いの表（3行）を4行に: `課題 ／ 仮説なし ／ 子を持たない課題に仮説が1件も無い`・`仮説 ／ 未決 ／ events が0件`・`仮説 ／ 保留 ／ 最新が onHold`・`仮説 ／ 未判断 ／ pendingNotes が空でない`
- 集計の例 `⚠ 未決 N（仮説は？ N ／ 検証結果は？ N ／ 判断は？ N）` → `⚠ 要対応 N（仮説なし N ／ 未決 N ／ 保留 N ／ 未判断 N）`（0 の内訳は出ない、を添える）
- 「問いの類型を増やさない。3つ…」→「4つ（仮説なし／未決／保留／未判断）」
- `kind` の列挙に `onHold`（保留＝見たが判断できなかった。**理由を `note` に必ず書く**。空の保留は次のレビューに何も渡さない）
- `schemaVersion: 1` の例示を `2` に。「アプリが 1 のファイルを開くと 2 へ移行して保存する。Skill は 2 で書く」を1行

`src/core/reading-guide.md` の「課題ツリー（type: issueTree）」の節: `kind` の列挙に `onHold`＝保留、問いの3つを4つに（上の表と同じ語）。`src/core/reading-guide.test.ts` は原本と配布物の一致を見るだけなので、原本を直せば追従する。

- [ ] **Step 6: 全件で緑を確認する**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑（Task 1 で赤だった `skill-copy.test.ts` もここで緑）

- [ ] **Step 7: コミット**

```bash
git add src/modules/issue-tree/derive.ts src/modules/issue-tree/derive.test.ts .claude/skills/issue-tree-register/scripts/derive.ts .claude/skills/issue-tree-register/SKILL.md src/core/reading-guide.md
git commit -m "feat(issue-tree): 問いを4種・仮説の語彙を5語にし、集計の文言を名詞形にする"
```

---

### Task 3: パレット——`ink-faint`（非アクティブの明度の段）

**Files:**
- Modify: `src/styles/palette.css`（`:root` と `.dark` に `--ink-faint`）
- Modify: `src/styles/palette-requirements.ts`（`TOKENS` と `REQUIREMENTS`）
- Modify: `src/index.css`（`@theme inline` に `--color-ink-faint: var(--ink-faint);`）
- Modify: `.claude/skills/palette-retheme/SKILL.md`（「11トークン」→「12トークン」、対応物が無い「5つ」→「6つ」に `ink-faint` を足す。`grep -n "11\|5つ\|残る5" SKILL.md` で箇所を引く）
- Test: `src/styles/palette.test.ts`（走査式なので**追加不要**。`REQUIREMENTS` に足した瞬間から検証対象になる）

**Interfaces:**
- Produces: Tailwind クラス `text-ink-faint` / `border-ink-faint`（Task 4 が使う）

- [ ] **Step 1: 要件に足す（先に検査を赤くする）**

`src/styles/palette-requirements.ts`:

```ts
export const TOKENS = [
  'canvas', 'surface', 'surface-accent', 'ink', 'ink-muted', 'ink-faint', 'rule', 'grid', 'warning', 'ok', 'warning-fg', 'ok-fg',
] as const

export const REQUIREMENTS = [
  { token: 'ink', min: 4.5, use: '本文・見出し' },
  { token: 'ink-muted', min: 4.5, use: '抑えた文字' },
  // **非アクティブな内容の文字と枠。** WCAG 1.4.3 は非アクティブ UI 部品を
  // 本文の 4.5:1 から免除しているが、読めなくてよいわけではない——
  // 「いま作業する面ではない」と読めて、かつ消えて見えない段として 3:1 を課す。
  // **アクティブな本文に使わない**（使うと本文の保証を割る）
  { token: 'ink-faint', min: 3.0, use: '非アクティブの文字・枠（抑制された配下）' },
  { token: 'rule', min: 3.0, use: 'セル境界・入力枠' },
  { token: 'warning', min: 4.5, use: '未定義・削除' },
  { token: 'ok', min: 4.5, use: '確定・応答' },
] as const
```

Run: `npx vitest run src/styles/palette.test.ts`
Expected: FAIL（`ink-faint` が palette.css に無い）

- [ ] **Step 2: 色値を置く**

`src/styles/palette.css` の `:root`（`--ink-muted` の次）:

```css
    --ink-faint: oklch(0.58 0.007 170);     /* ink-muted と同じ色相。両面で 3:1 に MARGIN の余裕 */
```

`.dark`:

```css
    --ink-faint: oklch(0.55 0.007 170);     /* ダークは明るいほど強い。ink-muted（0.698）より暗く保つ */
```

**数字は起点であって確定値ではない。** `npx vitest run src/styles/palette.test.ts` を回し、`ink-faint` の行が両モード×両面（canvas / surface）で緑になるまで **L だけ**を 0.01 刻みで動かす（色相・彩度は動かさない。`palette-retheme` Skill の規則と同じ）。閾値ちょうど（`MARGIN` 1.03 を掛けた 3.09 に対して 3.10 など）に置かない——**3.2 以上**を目安にする。ライトでは `ink-muted`（L 0.381）より明るく、ダークでは `ink-muted`（L 0.698）より暗いこと（段の向きが逆転すると「薄い」にならない）。最終値と実測比を報告に貼る。

ファイル冒頭のコメントの「役割（rev 9章）」の表に `ink-faint  非アクティブの文字・枠（3:1）` を足す。

- [ ] **Step 3: Tailwind へ繋ぐ**

`src/index.css` の `@theme inline` で `--color-ink-muted` の次に `--color-ink-faint: var(--ink-faint);`。

- [ ] **Step 4: retheme Skill の数を直す**

`.claude/skills/palette-retheme/SKILL.md`: 「11トークン×2モード」→「12トークン×2モード」、「対応物がない5つ（ok / surface-accent / grid / warning-fg / ok-fg）」→「6つ（… / ink-faint）」、下書き JSON の「同じ11キー」→「同じ12キー」。**`palette-fit.mjs` は `TOKENS` と `REQUIREMENTS` を import して回しているので、スクリプト側の変更は不要**——`node .claude/skills/palette-retheme/scripts/palette-fit.mjs --help` 相当の起動（SKILL.md に書かれた引数の形で `src/styles/palette.css` を読ませる）が `ink-faint` の行を出力することを確かめ、報告に貼る。

- [ ] **Step 5: 生成 CSS で確かめる**

```bash
npm test && npx tsc -b && npm run lint
npx vite build && grep -o "\-\-color-ink-faint[^;]*" dist/assets/*.css | head -3
```

Expected: 緑、かつ grep が `--color-ink-faint: var(--ink-faint)` を出す（ユーティリティ `text-ink-faint` は Task 4 で初めて使われるので、この時点ではクラスは生成されない——それでよい）。

- [ ] **Step 6: コミット**

```bash
git add src/styles/palette.css src/styles/palette-requirements.ts src/index.css .claude/skills/palette-retheme/SKILL.md
git commit -m "feat(palette): 非アクティブの明度の段 ink-faint を足す（両面 3:1 を実測）"
```

---

### Task 4: 描画層の置き換え——課題の箱・仮説行・展開パネル

**このタスクが大きいのは意図的である。** `layout.ts` が返す矩形の形（`IssuePlacement` / `HypothesisPlacement`）が変わり、それを読む部品（`IssueBox` / `HypothesisCard`）とエディタは旧形では型が通らない。層ごとにタスクを切ると、**間のコミットで `tsc` が落ちる**。1タスク・1コミットにし、中のステップで層ごとにテストを回す。

**Files:**
- Modify: `src/modules/issue-tree/measure.ts`
- Rewrite: `src/modules/issue-tree/layout.ts`
- Rewrite: `src/modules/issue-tree/layout.test.ts`
- Create: `src/modules/issue-tree/badge-styles.ts`
- Modify: `src/modules/issue-tree/commands.ts`（`setDeferralNote`）／ `commands.test.ts`
- Rewrite: `src/modules/issue-tree/IssueBox.tsx`
- Create: `src/modules/issue-tree/HypothesisRow.tsx`（`HypothesisCard.tsx` を `git rm`）
- Create: `src/modules/issue-tree/HypothesisRow.dom.test.tsx`（`HypothesisCard.dom.test.tsx` を `git rm`）
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx` ／ `IssueTreeEditor.dom.test.tsx`
- Modify: `src/modules/issue-tree/IssueTreeEdges.tsx`（コメントのみ。線の引き元は「箱の矩形」で変わらない）
- Modify: `src/modules/issue-tree/derive.ts`（`SUPPRESSED_NOTE` を消す）＋ `cp` で Skill へ
- Modify: `src/modules/issue-tree/cell-keys.ts`（`deferral` セルを足す）

**Interfaces:**
- Consumes: Task 2 の `badgeGroupOf` / `BADGE_LABELS` / `ISSUE_DEFERRED_LABEL` / `QUESTION_LABELS` / `EVENT_KIND_LABELS`、Task 3 の `text-ink-faint` / `border-ink-faint`
- Produces（`layout.ts`）:

```ts
export interface IssueTreeFonts {
  /** 課題のタイトル（text-sm font-semibold）。太字は幅が変わるので独立に測る */
  title: { measure: MeasureWidth; lineHeight: number }
  /** 仮説の文言・根拠・由来・FB（text-sm） */
  body: { measure: MeasureWidth; lineHeight: number }
  /** 節の見出し・見送りの理由（text-xs） */
  small: { measure: MeasureWidth; lineHeight: number }
}

export interface IssuePlacement {
  /** 箱の外枠（世界座標）。エッジはここから引く */
  rect: Rect
  /** タイトルの入力欄（箱の中。見送りバッジがあればその幅だけ右が空く） */
  title: Rect
  /** 最新の見送り。バッジはタイトル行の右端、理由はその下の1行（text-xs。最新だけ編集できる） */
  deferral: { badge: Rect; reason: Rect } | null
}

export interface HypothesisPlacement {
  /** 行（畳まれていれば1行。展開していれば文言＋パネルの全体） */
  rect: Rect
  /** 文言。畳まれていれば body.lineHeight ちょうどの1行（CSS で省略）。展開していれば折り返した高さ */
  text: Rect
  /** 状態のバッジ（行末。高さ BADGE_HEIGHT） */
  badge: Rect
  /** 展開パネル。畳まれていれば null */
  expanded: null | {
    panel: Rect
    /** 「判断」節。最新イベントのバッジ＋根拠（編集可）＋種別を選ぶトリガー。イベント0件でもトリガーのために節は出る */
    judgement: { label: Rect; badge: Rect; note: Rect; trigger: Rect }
    /** 「以前の判断」。events[0 .. length-2] の順。読み取り専用 */
    previous: { badge: Rect; note: Rect }[]
    rationale: { label: Rect; cell: Rect }
    /** FB（pendingNotes）。cells は同じ添字。add は「＋ FB」のボタン行 */
    notes: { label: Rect; cells: Rect[]; add: Rect }
  }
}

export interface IssueTreeLayout {
  issues: (IssuePlacement | null)[]
  hypotheses: (HypothesisPlacement | null)[]
  width: number
  height: number
}

export function layoutIssueTree(
  data: IssueTreeSchemaVersion2,
  posed: PosedQuestions,
  fonts: IssueTreeFonts,
  /** 展開している仮説の添字。無ければ -1。**ビュー状態であり data には無い** */
  expandedIndex: number,
): IssueTreeLayout
```

- Produces（`measure.ts`）: 下の Step 1
- Produces（`badge-styles.ts`）: `badgeClass(group: BadgeGroup, suppressed: boolean): string`
- Produces（`commands.ts`）: `setDeferralNote(data, issueIndex, note): IssueTreeSchemaVersion2`（最新の見送りだけ。無ければ同じ参照）
- Produces（`cell-keys.ts`）: `issueDeferralCellKey(issueKey): string`（`deferral:${issueKey}`）。`FocusTarget` に `{ cell: 'deferral'; index }` を足す

- [ ] **Step 1: 寸法（`measure.ts`）**

既存の定数のうち `ISSUE_*`・`BADGE_HEIGHT`・`ROW_GAP` は残し、`CARD_*` を**消して**次に置き換える。値は `docs/issue-tree/俯瞰モック/俯瞰.html` と `展開.html` の CSS から取った（`.issue` の `padding: 6px 10px`・`gap: 5px`、`.row` の `padding-left: 12px`、`.panel` の `padding: 10px 12px`・`gap: 12px`・`margin-left: 12px`）:

```ts
/** 仮説の行を持つ箱、見送りの理由を持つ箱の幅（固定。ロジックツリーと同じ 320） */
export const BOX_WIDTH = 320
/** 箱の中の文章が使える幅 */
export const BOX_CONTENT_WIDTH = BOX_WIDTH - ISSUE_INSET_X * 2
/** タイトルと最初の行、行どうしの空き（モックの .issue gap / .rows gap） */
export const TITLE_GAP = 5
export const ROW_GAP = 3
/** 仮説行の字下げ（左の点の幅）。モックの .row padding-left */
export const ROW_INDENT = 12
/** バッジの横の余白（px-1.5 = 6px）と、文言との空き（gap-2 = 8px） */
export const BADGE_PADDING_X = 6
export const BADGE_GAP = 8
/** 展開パネル。モックの .panel（margin-left 12 / padding 10px 12px / border 1 / gap 12） */
export const PANEL_INDENT = 12
export const PANEL_PADDING_X = 12
export const PANEL_PADDING_Y = 10
export const PANEL_BORDER = 1
export const PANEL_INSET_X = PANEL_PADDING_X + PANEL_BORDER
export const PANEL_INSET_Y = PANEL_PADDING_Y + PANEL_BORDER
export const PANEL_GAP = 12
/** 節の見出しと本文の空き（モックの .sec gap） */
export const SECTION_GAP = 4
/** トリガー・「＋ FB」ボタンの行の高さ（h-6 = 24px） */
export const ACTION_HEIGHT = 24
/** パネルの中の文章が使える幅 */
export const PANEL_CONTENT_WIDTH = BOX_CONTENT_WIDTH - ROW_INDENT - PANEL_INDENT - PANEL_INSET_X * 2

export const ISSUE_BOX_CLASS = 'border px-2.5 py-1.5'
export const PANEL_BOX_CLASS = 'border px-3 py-2.5'   // 12px / 10px
```

**`ROW_GAP` を 4 → 3 に変える。** 同名の定数が `src/modules/sequence/layout.ts`（値 8）にもあるが、モジュールごとに独立した値で共有していない（計画時点で `grep -rn "ROW_GAP" src/` で確認済み。ロジックツリーは持たない）。触るのは課題ツリーの `measure.ts` だけ。

- [ ] **Step 2: バッジのクラス（`badge-styles.ts`）**

```ts
import type { BadgeGroup } from './derive'

/** バッジの共通の形。高さは BADGE_HEIGHT（20px）の行に収まる 18px */
const base = 'inline-flex h-[18px] items-center rounded px-1.5 text-xs leading-none font-medium whitespace-nowrap'
```

`h-[18px]` は任意値だが、`conventions.test.ts` が弾く任意値は `text-[...]` だけである（計画時点で `src/styles/conventions.test.ts:117` の正規表現 `/\btext-(xl|[3-9]xl)\b|\btext-\[[^\]]*\]/` を確認）。**実装時にこの行がまだその形であることを見てから使う**——変わっていれば `h-4.5`（Tailwind v4 は 0.5 刻みを持つ＝18px）に置き換える。

```ts
const faces: Record<BadgeGroup, string> = {
  yes: 'bg-ok text-ok-fg',
  no: 'bg-ink text-surface',
  hold: 'border border-warning text-warning',
  open: 'border border-dashed border-warning text-warning',
  deferred: 'border border-ink-muted text-ink-muted',
}
/** 抑制された配下は群を問わず薄い枠だけ（「いま作業する面ではない」） */
const faint = 'border border-ink-faint text-ink-faint'

export function badgeClass(group: BadgeGroup, suppressed: boolean): string {
  return `${base} ${suppressed ? faint : faces[group]}`
}
```

`bg-ink text-surface` は新しい色の組ではない（`ink` が `surface` の上で 4.5:1 を満たすことを `palette.test.ts` が見ており、比は対称）。

- [ ] **Step 3: 見送りの理由の setter（`commands.ts`）——落ちるテストから**

`commands.test.ts`:

```ts
describe('setDeferralNote', () => {
  it('最新の見送りの理由だけを書き換える', () => {
    const data = make({ issues: [{ id: I(0), parentId: null, text: '根', events: [{ kind: 'deferred', note: '古い理由' }, { kind: 'deferredToMainDev', note: '' }] }] })
    const out = setDeferralNote(data, 0, '通知は本開発で')
    expect(out.issues[0].events).toEqual([{ kind: 'deferred', note: '古い理由' }, { kind: 'deferredToMainDev', note: '通知は本開発で' }])
  })
  it('見送りが無い課題では同じ参照を返す（apply が落とす契約）', () => {
    const data = make({ issues: [{ id: I(0), parentId: null, text: '根', events: [] }] })
    expect(setDeferralNote(data, 0, 'x')).toBe(data)
  })
})
```

実装（`setEventNote` と同じ形。最新以外は触らない）:

```ts
export function setDeferralNote(data: IssueTreeSchemaVersion2, index: number, note: string): IssueTreeSchemaVersion2 {
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

`FocusTarget` に `| { cell: 'deferral'; index: number }` を足し、`cell-keys.ts` の `cellKey` に `case 'deferral': return issueDeferralCellKey(issueKeys[target.index])` を足す。`appendDeferral` の戻りの `focus` を `{ cell: 'deferral', index }` に変える（見送りを選んだら理由を打たせる。`appendJudgement` が根拠へ飛ばすのと同じ形）。`commands.test.ts` の `appendDeferral` のテストがあれば期待値を直す。

- [ ] **Step 4: レイアウト（`layout.ts`）——落ちるテストから**

`layout.test.ts` を書き直す。`fonts` に `title` を足す（`createEstimateMeasurer(14)` / `lineHeight: 23`。太字の概算は細字と同じでよい——テストが見るのは**寸法の関係**であって実寸ではない）。`run(data, expandedIndex = -1)`。

```ts
it('仮説を持つ課題の箱は BOX_WIDTH で、仮説は箱の中の行として1行ずつ積まれる', () => {
  // 仮説3件。2件だと「末尾」と「先頭」の取り違えが検知できない
  const data = make({ issues: [root], hypotheses: [h(1), h(2), h(3)] })
  const out = run(data)
  const box = out.issues[0]!.rect
  expect(box.width).toBe(BOX_WIDTH)
  const rows = out.hypotheses.map((p) => p!.rect)
  // 箱の中に収まる
  for (const r of rows) {
    expect(r.x).toBeGreaterThanOrEqual(box.x)
    expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width)
    expect(r.y + r.height).toBeLessThanOrEqual(box.y + box.height)
  }
  // 1行ずつ（畳まれた行の高さは本文の行送り）。並びは配列順
  expect(rows.map((r) => r.height)).toEqual([fonts.body.lineHeight, fonts.body.lineHeight, fonts.body.lineHeight])
  expect(rows[1].y).toBeGreaterThan(rows[0].y)
  expect(rows[2].y).toBeGreaterThan(rows[1].y)
  // タイトルの下に来る
  expect(rows[0].y).toBeGreaterThanOrEqual(out.issues[0]!.title.y + out.issues[0]!.title.height)
})

it('仮説を持たない課題の箱はタイトルの自然幅（ロジックツリーと同じ）', () => {
  const out = run(make({ issues: [{ ...root, text: '短い' }] }))
  expect(out.issues[0]!.rect.width).toBeLessThan(BOX_WIDTH)
  expect(out.issues[0]!.rect.width).toBeGreaterThanOrEqual(ISSUE_MIN_WIDTH)
})

it('展開した仮説だけパネルを持ち、箱はその分だけ高くなる', () => {
  const data = make({ issues: [root], hypotheses: [h(1), h(2, { rationale: '由来', pendingNotes: ['FB1', 'FB2'], events: [{ kind: 'supported', note: '根拠' }, { kind: 'rejected', note: '覆った' }] }), h(3)] })
  const folded = run(data)
  const open = run(data, 1)
  expect(folded.hypotheses[1]!.expanded).toBeNull()
  const p = open.hypotheses[1]!.expanded!
  expect(p.previous).toHaveLength(1)          // events 2件 → 以前の判断は1件
  expect(p.notes.cells).toHaveLength(2)
  expect(open.issues[0]!.rect.height).toBeGreaterThan(folded.issues[0]!.rect.height)
  // 展開していない隣の行は動かない（上の行）／下の行は押し下げられる
  expect(open.hypotheses[0]!.rect.y).toBe(folded.hypotheses[0]!.rect.y)
  expect(open.hypotheses[2]!.rect.y).toBeGreaterThan(folded.hypotheses[2]!.rect.y)
  // パネルの矩形は行の矩形の中
  expect(p.panel.y + p.panel.height).toBeLessThanOrEqual(open.hypotheses[1]!.rect.y + open.hypotheses[1]!.rect.height)
})

it('展開した仮説の文言は折り返した高さになる（畳むと1行）', () => {
  const long = 'あ'.repeat(60)
  const data = make({ issues: [root], hypotheses: [h(1, { text: long })] })
  expect(run(data).hypotheses[0]!.text.height).toBe(fonts.body.lineHeight)
  expect(run(data, 0).hypotheses[0]!.text.height).toBeGreaterThan(fonts.body.lineHeight)
})

it('見送った課題はタイトル行の右端にバッジ、その下に理由の行を持つ', () => {
  const data = make({ issues: [{ ...root, events: [{ kind: 'deferredToMainDev', note: '通知は本開発で扱う' }] }] })
  const p = run(data).issues[0]!
  expect(p.deferral).not.toBeNull()
  expect(p.deferral!.badge.x).toBeGreaterThan(p.title.x + p.title.width)
  expect(p.deferral!.reason.y).toBeGreaterThanOrEqual(p.title.y + p.title.height)
  expect(p.rect.width).toBe(BOX_WIDTH)
})

it('子の列は親の箱の右端より右に置かれる（箱の幅がブロックの幅に効く）', () => {
  const data = make({ issues: [root, child], hypotheses: [h(1), h(2)] })   // h は root に
  const out = run(data)
  expect(out.issues[1]!.rect.x).toBeGreaterThanOrEqual(out.issues[0]!.rect.x + out.issues[0]!.rect.width)
})

it('同じ入力からは同じ出力が出る', () => { /* 既存のまま */ })
```

既存の「循環して根から到達できない課題は null」「ぶら下がり先が図に無い仮説は null」のテストは**そのまま残す**（`placement === null` の契約は変えない）。

実装の骨子（**完全なコードではない。下書きとして読む**）:

```ts
export function layoutIssueTree(data, posed, fonts, expandedIndex): IssueTreeLayout {
  const suppressed = suppressedIssueIds(data.issues)
  const rowsOf = new Map<string, number[]>()   // issueId → 仮説の添字（配列順）
  // --- 1. 仮説行の計画（高さと build） ---
  const plans = data.hypotheses.map((h, hi) => {
    const open = hi === expandedIndex
    const group = badgeGroupOf(hypothesisStatus(h))
    const badgeW = fonts.small.measure(BADGE_LABELS[group]) + BADGE_PADDING_X * 2
    const textW = BOX_CONTENT_WIDTH - ROW_INDENT - BADGE_GAP - badgeW
    const textH = open ? rowHeight(h.text, fonts.body, textW) : fonts.body.lineHeight
    let height = textH
    let panel: PanelPlan | null = null
    if (open) {
      // 判断: 見出し(small.lineHeight) + SECTION_GAP + max(BADGE_HEIGHT, ACTION_HEIGHT, 根拠の高さ)
      // 以前の判断: 各 max(BADGE_HEIGHT, 根拠の高さ)（PANEL_CONTENT_WIDTH - badgeW - BADGE_GAP で折り返す）
      // 由来: 見出し + SECTION_GAP + rowHeight(rationale, body, PANEL_CONTENT_WIDTH)
      // FB: 見出し + SECTION_GAP + Σ(rowHeight(note, body, PANEL_CONTENT_WIDTH) + ROW_GAP) + ACTION_HEIGHT
      // 節の間は PANEL_GAP、外側は PANEL_INSET_Y * 2
      height += ROW_GAP + panelHeight
    }
    return { height, build: (x, y) => ({ rect, text, badge, expanded }) }
  })
  // --- 2. 課題の箱 ---
  //   タイトル幅: 仮説も見送りも無ければ wrapWithin(maxWidth ISSUE_MAX_WIDTH, minWidth ISSUE_MIN_WIDTH)（今のまま）
  //            あれば BOX_CONTENT_WIDTH（見送りがあればさらに - BADGE_GAP - 見送りバッジ幅）で折り返す
  //   箱の高さ: ISSUE_INSET_Y*2 + タイトル高 (+ ROW_GAP + 理由の高さ: small) (+ TITLE_GAP + Σ行高 + (n-1)*ROW_GAP)
  //   箱の幅:   仮説か見送りがあれば BOX_WIDTH、無ければタイトルの自然幅
  // --- 3. コアの layoutTree へ（ブロック＝箱。仮説は箱の中なので別途足さない） ---
  // --- 4. 世界座標へ（walkPlace）。仮説行は箱の中の cursor で置く ---
}
```

**削るもの**: `deferrals: Rect[]`（複数）→ `deferral`（最新1件）。`suppressedNote` → 無し。`CARD_*` への参照。`SUPPRESSED_NOTE` の import。

**`derive.ts` から `SUPPRESSED_NOTE` を消し、`cp` で Skill へ**（`skill-copy.test.ts` が見る）。`IssueTreeEditor.dom.test.tsx` の import も消す（Step 7 で直す）。

Run: `npx vitest run src/modules/issue-tree/layout.test.ts`
Expected: 緑（この時点で `tsc` は部品側で落ちる。次へ進む）

- [ ] **Step 5: 課題の箱（`IssueBox.tsx`）**

役割が変わる——**箱であり、仮説行を子要素として受け取る容器**になる。

```tsx
export interface IssueBoxProps {
  nodeKey: string
  label: string                 // `課題{N}`（前半。動かさない）
  text: string
  placement: IssuePlacement
  invalid: boolean
  suppressed: boolean
  /** 「仮説なし」が立っているか */
  warn: boolean
  /** 最新の見送り（無ければ null）。理由は最新だけ編集できる */
  deferral: { kind: DeferralKind; note: string } | null
  deferralCellKey: string
  onTextChange: (next: string) => void
  onDeferralNoteChange: (next: string) => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState) => void
  /** 見送りのドロップダウン（必須。IssueBox がトリガーの置き場所を決める） */
  deferralMenu: React.ReactNode
  /** 仮説行（HypothesisRow の列）。箱の中に絶対配置で置かれる */
  children?: React.ReactNode
}
```

描画の規則:

- 外枠: `pointer-events-auto absolute rounded-sm ${ISSUE_BOX_CLASS} group/issue` に面——`invalid` → `border-warning bg-warning/20 text-ink`、`suppressed` → **`border-ink-faint bg-surface text-ink-faint`**（地の色に落とさない。前提5）、それ以外 → `border-rule bg-surface text-ink`。**`warnCell`（`bg-warning/10`）は使わない**——未決は面で見せない（前提3）。`const errorCell = 'bg-warning/20'` の宣言は残す（`palette.test.ts` の紐づき検査は「宣言があるファイルは検算した値」を見るだけなので、`warnCell` を宣言しなくてよい。**`warnCell` を別の値で宣言しないこと**）
- タイトル: `CellInput`（`multiline` / `autoSize={false}`）を `placement.title` に絶対配置。クラスに **`text-sm font-semibold`**（Task 4 の測定器 `fonts.title` と対。エディタの見本 `<span>` も同じクラスを持つ）。`placeholder` は **`'課題'`**（`QUESTION_LABELS.hypothesis` をプレースホルダにしない——空の箱のタイトルが「仮説なし」に見える）。アクセシブル名は今のまま `課題{N}（未記入） 仮説なし` の形（後半に `QUESTION_LABELS.hypothesis`）
- 「仮説なし」のバッジ: `warn` のときタイトル行の右端に `badgeClass('open', suppressed)` で `QUESTION_LABELS.hypothesis`。**`placement.deferral` と排他**（見送った課題は抑制されるので `warn` が立たない——`poseQuestions` がそう導出する。両方 true は来ない）。位置は `deferral.badge` と同じ計算をレイアウトが `title` の右の余白として空けているので、`placement.rect` の右上（`top: ISSUE_INSET_Y`, `right: ISSUE_INSET_X`）に置く
- 見送りバッジ: `deferral !== null` のとき同じ位置に `badgeClass('deferred', suppressed)` で `ISSUE_DEFERRED_LABEL`。**このバッジが `deferralMenu` のトリガーを兼ねる**——`deferralMenu` は `KindMenu` で、エディタが `triggerText` に `ISSUE_DEFERRED_LABEL` を渡す。箱はそれを `placement.deferral.badge` の位置に置く
- 見送りが無いとき: `deferralMenu`（`triggerText` は `'見送り'`、`triggerClassName` は `invisible group-hover/issue:visible group-focus-within/issue:visible`）を同じ右上に置く。**箱の外（`left-full`）には出さない**
- 理由の行: `placement.deferral.reason` に `CellInput`（`text-xs`、`data-cell={deferralCellKey}`、`aria-label={`${label} の見送りの理由`}`、`placeholder="理由"`）。`onFieldKeyDown` は**渡さない**（理由の欄では Enter で何も生やさない。`cancel` だけ効けばよいので、エディタ側の `onIssueKeyDown` を通さない）
- `children` をそのまま描く（仮説行は自分の世界座標を持つので、箱の `left/top` を引いた座標に置く必要がある——**`HypothesisRow` には箱の原点を渡す**。下の Step 6）

- [ ] **Step 6: 仮説行（`HypothesisRow.tsx`）**

```tsx
export interface HypothesisRowProps {
  hypothesisKey: string
  label: string                       // `仮説{N}`
  placement: HypothesisPlacement
  /** 親の箱の左上（世界座標）。行は箱の中に絶対配置されるので差し引く */
  origin: { x: number; y: number }
  text: string
  rationale: string
  notes: readonly string[]
  events: readonly JudgementEvent[]
  questions: HypothesisQuestions
  invalid: boolean
  suppressed: boolean
  /** 展開しているか（`placement.expanded !== null` と一致する。エディタが両方を同じ状態から作る） */
  expanded: boolean
  onExpand: () => void
  onTextChange / onRationaleChange / onNoteChange / onEventNoteChange / onPromoteNote / onAddNote
  onFieldKeyDown?: (e, state, cell: HypothesisCell) => void
  judgementMenu: React.ReactNode      // KindMenu。展開パネルの「判断」節のトリガー位置に置く
}
```

描画の規則:

- **畳まれているとき**: 行は `<button type="button">`（`aria-label={`${label}を開く`}`、`data-cell={hypothesisCellKey(key, { cell: 'hypothesis' })}`、`onFocus={onExpand}`、`onClick={onExpand}`）。中に左の点（`::before` 相当の 4px の円。`bg-ink-muted`／抑制時 `bg-ink-faint`）、文言（`truncate text-sm`。**改行は空白に置き換えて1行にする**——`text.replace(/\n/g, ' ')`）、右端にバッジ（`badgeClass(group, suppressed)` で `BADGE_LABELS[group]`）。空の文言はプレースホルダ **`'仮説'`** を `text-ink-muted` で
  - `onFocus` で展開するのは、**Tab で行に着いた瞬間に textarea へ移る**ため（下のエディタの `onExpand` が `pendingFocus` を同じ `data-cell` に予約する）。行の `<button>` と展開後の `<textarea>` は**同じ `data-cell`** を名乗る——だから予約が当たる。**2つが同時に DOM にあってはならない**（畳まれた行は `expanded` のとき描かない）
- **展開しているとき**: 文言は `CellInput`（`multiline`・`autoSize={false}`・`text-sm font-medium`・`aria-label={label}`・同じ `data-cell`）。バッジは同じ位置。その下に**パネル**（`placement.expanded.panel` に `rounded ${PANEL_BOX_CLASS} border-rule bg-canvas`）:
  - 「判断」節: 見出し `text-xs font-medium text-ink-muted`（文言 `'判断'`）。行: バッジ（最新イベントがあれば `badgeGroupOf(kind)`、無ければ `open`）＋根拠の `CellInput`（`text-sm`、`aria-label={`${label} の${EVENT_KIND_LABELS[kind]}の根拠`}`、`data-cell` は `{ cell: 'event', eventIndex: last }`。**イベント0件なら根拠の欄は描かず、代わりに `text-ink-muted` で「判断はまだ無い」**）＋ `judgementMenu`（トリガー文言はエディタが決める: 0件なら `'判断を追加'`、あれば `'判断を変える'`）
  - 「以前の判断」節: `events.length > 1` のときだけ。各行にバッジ（**正確な種別 `EVENT_KIND_LABELS[kind]`** を `badgeClass(badgeGroupOf(kind), true)`——薄い枠——で）＋根拠（静的テキスト `text-sm text-ink-muted`）。**`CellInput` にしない**（追記専用。`HypothesisCard` が守っていた約束）
  - 「由来」節: `CellInput`（`text-sm`、`placeholder="由来（任意）"`、`aria-label={`${label} の由来`}`）
  - 「FB」節: `pendingNotes` を `CellInput` で1件ずつ（`aria-label={`${label} のFB${i + 1}`}`、`data-cell` は `{ cell: 'note', noteIndex }`）。各行の右端に「根拠へ」ボタン（今の `HypothesisCard` と同じ reveal 機構——`invisible group-hover/note:visible group-focus-within/note:visible`。**イベントが1件以上あるときだけ**）。末尾に `<button>`「＋ FB」（`onAddNote`。`aria-label={`${label} にFBを足す`}`）
  - 見出しの文言（判断／以前の判断／由来／FB）は行の部品の中に `const SECTION_LABELS = { judgement: '判断', previous: '以前の判断', rationale: '由来', notes: 'FB' } as const` として置く。**`derive.ts` には置かない**（Skill の報告には出ない見出しなので、コピーされる側に載せる理由が無い）
- 面: 行自身は面を持たない（箱の面に乗る）。`invalid` のときだけ文言の欄に `bg-warning/20`（`const errorCell = 'bg-warning/20'` を宣言して使う。`palette.test.ts` の紐づき検査に合わせる）

**`HypothesisCard.tsx` / `HypothesisCard.dom.test.tsx` は `git rm`。** DOM テストは `HypothesisRow.dom.test.tsx` に移し、次を見る（既存の `HypothesisCard.dom.test.tsx` の fixture——課題2件・仮説3件・イベント2件——を流用する）:

```ts
it('畳まれた行はボタンで、文言とバッジ（5語）を出す', ...)          // getByRole('button', { name: '仮説1を開く' }) に '同期取得で間に合う' と '棄却'
it('展開すると文言が textarea になり、判断・以前の判断・由来・FB の節が出る', ...)
it('根拠を編集できるのは最新のイベントだけ（以前の判断は textbox を持たない）', ...)  // getAllByRole('textbox', { name: /の根拠$/ }) が1つ
it('以前の判断は正確な種別で出る（自明に成立 → 「自明に成立」。俯瞰の5語ではない）', ...)
it('イベントが無い仮説の判断の節は「未決」のバッジと「判断を追加」のトリガーを持つ', ...)
it('抑制された行のバッジは群を問わず薄い枠になる', ...)                 // className に ink-faint
it('FB の行の「根拠へ」はイベントが1件以上あるときだけ出る', ...)         // 既存テストの移植
```

クラス名を見るテストは **`badgeClass` の戻り値と照合する**（`expect(el.className).toBe(badgeClass('no', false))`）——文字列を打ち直さない。

- [ ] **Step 7: エディタ（`IssueTreeEditor.tsx`）**

変更点を列挙する。**状態の共有表**（M5 の教訓）:

| 状態 | 読む | 変える |
| --- | --- | --- |
| `expandedKey: string \| null`（展開している仮説の行鍵） | `layoutIssueTree` の `expandedIndex`（`hypothesisKeys.indexOf`）、各 `HypothesisRow` の `expanded` | `HypothesisRow.onExpand`、`apply()`（行き先が仮説のセルなら、その仮説を展開する）、帯のチップ（Task 5） |
| `pendingFocus` | 既存の effect | 既存＋`onExpand`（同じ `data-cell` を予約する） |
| `openCell`（ドロップダウン） | `menuPropsFor` | 既存のまま |
| `lastIssueKey` | 帯の「仮説を追加」 | 既存のまま |

1. 測定器を3本にする: `titleProbeRef`（`text-sm font-semibold`）を足し、`fonts = { title, body, small }`。`measurerKey` に `titleFont` を混ぜる。見本の `<span>` を1本足す（クラスは `IssueBox` のタイトルと同じ定数 `TITLE_FONT_CLASS = 'text-sm font-semibold'` から）
2. `layoutIssueTree(data, posed, fonts, expandedIndex)`。`expandedIndex = expandedKey === null ? -1 : hypothesisKeys.indexOf(expandedKey)`
3. `apply()`: `result.focus` が `hypothesis` / `rationale` / `note` / `event` のセルなら `setExpandedKey(computeRowKeys(result.data.hypotheses)[focus.index])`。**先に展開してから `pendingFocus` を予約する**（同じ更新の中でよい——描画後に effect が `querySelector` するので、展開後の DOM を見る）
4. `onExpand(key, cell)`: `setExpandedKey(key); setPendingFocus(cell)`。`HypothesisRow` には `onExpand={() => onExpand(key, hypothesisCellKey(key, { cell: 'hypothesis' }))}`
5. `rects`（追従用）: 仮説の各セルは `placement.rect`（行全体）を見せる。展開パネルのセルも同じ
6. `KindMenu` に `triggerClassName?: string` を足す（`IssueBox` の hover reveal 用）。`DEFERRAL_KINDS` / `JUDGEMENT_KINDS` に `onHold` を足す（`JUDGEMENT_KINDS` の `rejectedWithoutTest` の次）
7. 見送り行・`SUPPRESSED_NOTE` の描画を**消す**（`IssueBox` が理由の行を持つ）。`onDeferralNoteChange={(next) => onChange(setDeferralNote(data, index, next), `${key}:deferral`)}`
8. `HypothesisRow` を `IssueBox` の `children` として、`cardsOf` 相当（`issueId` で引く）で親の箱の中に描く。`origin` は `placement.rect`
9. `runCardCommand` の `insert-item-after` で `cell.cell === 'hypothesis'` のとき `addHypothesisAfter` は今のまま。**畳まれた行（button）でのキーはコアに流さない**（button は `onFieldKeyDown` を持たない。`Enter`/`Space` は button の既定動作＝クリック＝展開）
10. `ISSUE_TREE_HINTS` の `'$mod+Enter'` のラベルを `'仮説／判断を追加'` のまま残す
11. 帯の集計は Task 5 でチップにする。このタスクでは `tallyLine(...)` のまま

`IssueTreeEditor.dom.test.tsx` の直し方:

- `hypothesisCell(n)` は展開後にしか textbox が無い。ヘルパを `openHypothesis(n)`（`fireEvent.click(screen.getByRole('button', { name: `仮説${n}を開く` }))` のあと `screen.getByRole('textbox', { name: `仮説${n}` })`）に変え、呼び出し箇所（`grep -n "hypothesisCell(" IssueTreeEditor.dom.test.tsx`）を直す
- `SUPPRESSED_NOTE` を使うテストは「抑制された配下の箱とバッジが `ink-faint` を持つ」に書き換える
- 「見送りイベントの行を種別ラベルと理由で描く」は「見送った課題はバッジ `見送り` と理由の欄（`課題{N} の見送りの理由`）を持ち、理由を打つと最新の見送りの `note` が変わる」に
- 足す: **継ぎ目のテスト**——「畳まれた行にフォーカスが入ると、同じ仮説の textarea が `document.activeElement` になる」（`fireEvent.focus(button)` → `act` → `expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '仮説1' }))`）、「課題セルで `Ctrl+Enter` すると新しい仮説が展開された状態で textarea にフォーカスが入る」、「展開できる仮説は同時に1つ（別の行を開くと前の行はボタンに戻る）」
- 足す: 「課題のプレースホルダは『課題』で、『仮説なし』はバッジに出る」

- [ ] **Step 8: 全件で緑を確認し、生成 CSS を見る**

```bash
npm test && npx tsc -b && npm run lint
npx vite build && grep -o "text-ink-faint\|border-ink-faint\|bg-ink\b\|text-surface" dist/assets/*.css | sort | uniq -c
```

Expected: 緑。grep が4つともクラスとして生成されていることを示す（**`bg-ink` / `text-surface` が生成されていなければ、バッジの反転が効いていない**——Tailwind がクラス名を拾っていない。テンプレートリテラルの中で名前を組み立てていないか確かめる）。

`palette.test.ts` の「検算していない濃さを使っていない」と「errorCell と warnCell」も緑であること（`IssueBox.tsx` / `HypothesisRow.tsx` が `errorCell` しか宣言しない形で通ることを確認。**通らなければ検査側の想定を報告する**——検査を騙す定数を置かない）。

- [ ] **Step 9: コミット**

```bash
git add src/modules/issue-tree/ .claude/skills/issue-tree-register/scripts/derive.ts
git commit -m "feat(issue-tree): 課題の箱に仮説行を畳み、判断を行末のバッジ1つにする——詳細は展開した仮説だけ"
```

---

### Task 5: 帯のチップ——「次の要対応へ」

**Files:**
- Create: `src/modules/issue-tree/open-targets.ts`
- Create: `src/modules/issue-tree/open-targets.test.ts`
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx`（帯）
- Modify: `src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`

**Interfaces:**

```ts
export type OpenKind = 'hypothesis' | 'result' | 'hold' | 'judgement'
export interface OpenTarget { kind: OpenKind; focus: FocusTarget }
/** 要対応の並び。課題の DFS（配列順）で、課題自身の「仮説なし」→ その課題にぶら下がる仮説の問い、の順 */
export function listOpenTargets(data, posed): OpenTarget[]
/** `kind` で絞った列の中で `current` の次（末尾なら先頭）。列が空なら null */
export function nextOpenTarget(targets: OpenTarget[], kind: OpenKind, current: FocusTarget | null): OpenTarget | null
```

- [ ] **Step 1: 落ちるテストを書く**

```ts
it('課題の DFS 順に、課題の「仮説なし」→ その仮説の問い、の順で並ぶ', () => {
  // 根(0) → 子(1){仮説なし} / 子(2){仮説A: 未決, 仮説B: 保留, 仮説C: 未判断}。
  // 仮説の配列順は B, A, C にして「配列順」と「課題ごと」の取り違えを検知する
  ...
  expect(listOpenTargets(data, posed).map((t) => [t.kind, t.focus])).toEqual([
    ['hypothesis', { cell: 'issue', index: 1 }],
    ['hold', { cell: 'hypothesis', index: 0 }],      // B
    ['result', { cell: 'hypothesis', index: 1 }],    // A
    ['judgement', { cell: 'hypothesis', index: 2 }], // C
  ])
})
it('次は current の後ろ。末尾なら先頭に戻る。current が列に無ければ先頭', ...)   // 3件で真ん中を current に
it('抑制された配下は列に入らない（posed が立てていない）', ...)
```

- [ ] **Step 2: 実装する**

`listOpenTargets` は `posed.issueNeedsHypothesis` / `posed.hypothesisQuestions` だけを見る（**問いの導出を二度書かない**）。課題ごとの仮説は `issueId` で引く。`nextOpenTarget` は `kind` で filter した列で `current` と `focus` が等しい要素（`cell` と `index` の一致）の次。

- [ ] **Step 3: 帯をチップにする**

`IssueTreeEditor.tsx` の帯: `tallyLine` の文字列の代わりに、`TALLY_TOTAL_LABEL` と合計（`⚠` 付き）のあと、内訳ごとに `<button>`（`buttonBase` ＋ `badgeClass('open', false)` の見た目——**未決の破線バッジと同じ語彙**。`hold` のチップは `badgeClass('hold', false)`）。文言は `${QUESTION_LABELS[kind]} ${n}`。**0 のチップは描かない**（`tallyLine` と同じ規則）。`aria-label={`次の${QUESTION_LABELS[kind]}へ`}`。押すと `nextOpenTarget(targets, kind, lastFocus)` の `focus` を `apply` と同じ経路で予約する（展開＋`pendingFocus`＋`ensureVisible`。`apply` から「データを変えない版」を切り出して `goTo(focus: FocusTarget)` にする）。`lastFocus` は `lastIssueKey` を一般化した `lastCell: FocusTarget | null`（`IssueBox` / `HypothesisRow` の `onFocusCapture` で更新。**`lastIssueKey` はこれから導出する**——2つ持つと片方だけ古くなる）。

`tallyLine` は**消さない**（Skill の報告が使う。帯はチップで同じ数を出すだけ）。帯の合計と内訳の数が `tallyQuestions` から来ることを DOM テストで見る（`tallyLine` の文字列は帯に出なくなるので、既存のテストで帯の文字列を照合しているものは「合計の文言」と「チップの文言」に分ける）。

- [ ] **Step 4: DOM テスト**

```ts
it('帯のチップを押すと、その種類の次の要対応へフォーカスが移る（末尾なら先頭へ）', ...)
it('0 件の種類のチップは出ない', ...)
```

- [ ] **Step 5: 全件で緑、コミット**

```bash
npm test && npx tsc -b && npm run lint
git add src/modules/issue-tree/
git commit -m "feat(issue-tree): 帯の集計をチップにし、押すと次の要対応へ視点が飛ぶ"
```

---

### Task 6: お手本を v2 に書き直し、保留の例を1件足す

**Files:**
- Rewrite（Skill の書き出しスクリプト経由）: `sample-project/課題ツリー.json`

`sample-project/` は README から参照するお手本であり、**お手本の変更は意図して決めたときだけ**（CLAUDE.md）。これは意図した変更——v2 の現行形で置く／新しい語「保留」の実例を1件入れる。

- [ ] **Step 1: 手で `schemaVersion` を 2 にし、保留を1件足す**

`sample-project/課題ツリー.json` で `"schemaVersion": 1` → `2`。仮説のうち `events: []` のもの（計画時点では「受検案内の再送導線」——`grep -n '"events": \[\]' sample-project/課題ツリー.json` で**仮説側**の空を引く。課題側の空は対象外）を1件選び、`"events": [{ "kind": "onHold", "note": "応募者からの再送依頼の頻度が分からず、PoC では判断を持ち越す" }]` にする。**`pendingNotes` は触らない**（「判断は？」→「未判断」の実例として残っている）。

- [ ] **Step 2: Skill のスクリプトで正規形に通す**

```bash
cd .claude/skills/issue-tree-register && npm install && cd -
node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --in sample-project/課題ツリー.json --out sample-project/課題ツリー.json
node .claude/skills/issue-tree-register/scripts/issue-tree-write.mjs --check sample-project/課題ツリー.json
```

Expected: 検証 OK・正規形と一致・集計に `保留 1` が出る（**出力を報告に貼る**）。`npm install` が作る `node_modules` は Skill の `.gitignore` が外す——`git status --short` に出ないことを確かめる。

- [ ] **Step 3: アプリで開けることをテストで見る**

`src/modules/issue-tree/module.test.ts` に、お手本を `classifyFile` に通して `editable` になること・`tallyQuestions(poseQuestions(data)).hold` が 1 であることを見るテストを1本足す（既存のテストがお手本を読んでいればそれに倣う。読み方は `src/core/load.test.ts` の fixture と同じ）。

- [ ] **Step 4: 全件で緑、コミット**

```bash
npm test && npx tsc -b && npm run lint
git add sample-project/課題ツリー.json src/modules/issue-tree/module.test.ts
git commit -m "docs(sample): 課題ツリーのお手本を schemaVersion 2 にし、保留の例を1件入れる"
```

---

### Task 7: 設計ノートの改訂——D8 改・D10・D11

**Files:**
- Modify: `docs/issue-tree/仮説検証モジュール-設計ノート.md`

- [ ] **Step 1: D8 を改める**

見出しを「D8. 議論の焦点はデータに保存しない（色は意味の数だけ）」にし、本文の「色は使わない（赤＝未定義の意味論を汚染しない）」を次に置き換える:

> 色相は足さない。意味を持つ色相は2つ——`warning`（注意が要る＝開いている）と `ok`（確定）——のまま、**判断の群は塗りと枠の形で分ける**: 支持＝`ok` の塗り／棄却＝`ink` の塗り（反転。棄却は失敗ではなく入力なので叫ばない）／保留＝`warning` の実線の枠／未決＝`warning` の破線の枠／見送り＝`ink-muted` の枠。未決を面で塗らない（新しい木は全部が未決なので、面で塗ると警告が情報を失う）。抑制された配下は `opacity` ではなく明度の段 `ink-faint`（3:1 を実測）で薄くする。（issue-tree-m3 で確定。それまでは「色を使わない」で、6種を文字ラベルだけで区別していた）

- [ ] **Step 2: D10 と D11 を足す**（D9 の次）

> ### D10. 俯瞰の表現——箱は課題だけ、仮説は行、判断は1つ、FB は複数
>
> キャンバスに載る物の種類（課題・仮説・判断・見送り・由来／根拠／FB）を形の種類に対応させる: 課題＝箱（エッジが出入りする唯一の物）／仮説＝箱の中の1行（左に点、右端に判断のバッジ1つ）／見送り＝課題タイトル右のバッジ＋理由の行／由来・根拠・FB・以前の判断＝**展開した仮説だけ**の内側パネル。展開は純粋なビュー状態で、同時に1つ（JSON に書かない）。**「判断の履歴」という見出しは使わない**——判断は最新1つとして見せ、2件目以降は「以前の判断」。データは `events`（判断）と `pendingNotes`（FB）の2配列のまま（統一しない。issue-tree-m3 の批評で決定）。
>
> ### D11. 「保留」は理由付きの判断イベント（`onHold`）
>
> 見たが判断できなかった、は誰かがそう決めた事実であり、イベント無し（未決）とは区別する。保留は仮説にだけ付く（課題の見送りとは別）。理由を `note` に書く——空の保留は次のレビューに何も渡さない。集計では未決と別に数える（問いは4種: 仮説なし／未決／保留／未判断）。enum の拡張なので schemaVersion を 2 に上げた（初の版上げ。読み込み時の移行は `src/core/load.ts`）。

- [ ] **Step 3: 未解決の論点4を解決済みにする**

「4. モックで未表現の要素。…」に取り消し線を引き、「→ issue-tree-m3 で解決（見送りの UI＝タイトル右のバッジ／抑制＝`ink-faint` で薄く／`pendingNotes`＝展開パネルの FB 節／フォーカスモードは未着手のまま）」を添える。「参考」の節に `俯瞰モック/`（3枚の静止画。issue-tree-m3 の見え方の正）を足す。

- [ ] **Step 4: コミット**

```bash
git add "docs/issue-tree/仮説検証モジュール-設計ノート.md"
git commit -m "docs(issue-tree): 設計ノートに D10（俯瞰の表現）・D11（保留）を足し、D8 の色の判断を改める"
```

---

### Task 8: 最終ブランチレビュー

- [ ] **Step 1:** `superpowers:requesting-code-review` で `main..HEAD` の全差分をレビューする。観点: (1) `derive.ts` と Skill のコピーが一致しているか、(2) 測定（`layout.ts`）と描画（`IssueBox` / `HypothesisRow`）の数字が対になっているか——特に `PANEL_BOX_CLASS` の `px-3 py-2.5` と `PANEL_PADDING_*`、バッジの高さ 18 と `BADGE_HEIGHT` 20、(3) 畳んだ行のボタンと展開後の textarea が同じ `data-cell` を名乗り、同時に DOM に存在しないこと、(4) `load.ts` の移行が検証を飛ばしていないこと
- [ ] **Step 2:** 指摘を直し、`npm test && npx tsc -b && npm run lint` を貼ってコミット

---

### Task 9: ドキュメントへの反映（実機確認とは束ねない）

**Files:**
- Create: `docs/history/issue-tree-m3-overview-ui.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`
- Modify: `docs/lessons-for-planning.md`（教訓があれば）
- Modify: `docs/README.md`（マイルストーン表に issue-tree-m3 の行、文書の地図に `俯瞰モック/`）
- Modify: `README.md`（課題ツリーの節）

- [ ] **Step 1: 申し送り**

`docs/history/issue-tree-m3-overview-ui.md`。冒頭の「追記専用」の注意書きは `issue-tree-m2-register-skill.md` から逐語で写す。書くこと: 何を作ったか（前提1〜9の要約と、実装で変わった点）／実装で確定した判断（継ぎ目——畳んだ行の `onFocus` → `pendingFocus` の機構、`ink-faint` の最終値と実測比、`load.ts` の移行フックが初めて動いた事実）／見つかった欠陥／**実機確認（Task 10）が未実施であること**を明記し、チェックリストを空のまま置く。

- [ ] **Step 2: `open-issues.md`**

消す（解消）: 「課題ツリーの UI の見た目が『かなり微妙』…症状は未取得」`[issue-tree-m1]`／「仮説カードの幅が固定で、長い仮説は縦に伸びる」`[issue-tree-m1]`／「見送りの理由（課題側イベントの `note`）をアプリから打てない」`[issue-tree-m1]`／「`leading-5` がこのリポジトリ唯一の `leading-*`」`[issue-tree-m1]`（`HypothesisCard` ごと消えるなら。`grep -rn "leading-5" src/` で確かめてから）。

足す（`[issue-tree-m3]`）:
- 「判断の誤操作（同じ種別を続けて付ける・最新以外を消せない）は直していない」（前提8。FB の枠組みで意味が変わったので実機で再観察してから）
- 「`ink-faint` はアクティブな本文に使ってはならないが、それを機械検査していない」（`conventions.test.ts` で `text-ink-faint` の使用箇所を抑制の文脈に限る検査は、2箇所目が出た時点で）
- 「`schemaVersion` の移行は `load.ts` の読み込み時だけで、**保存時に旧版ファイルが現行版で書き戻されること**を見るテストが無い」（rev 5章「ファイルへの反映は最初の編集保存」——保存経路のテストは `autosave.test.ts` の管轄。実機確認の項目に入れてある）
- 「帯のチップの『次へ』は `lastCell` を起点にするが、ドロップダウンのトリガーにフォーカスがあるときは `lastCell` が更新されない」（起点が1つ前のセルになる。実害は小さい）
- 「畳まれた仮説の行は `Shift+Tab` で戻ると `onFocus` で展開し textarea へ移る——逆向きでも展開するのは意図どおりだが、**1回の `Shift+Tab` で2回フォーカスが動く**ことをスクリーンリーダがどう読むかは未確認」

「次に手を付ける候補」に「issue-tree-m3 の実機確認が未実施」を足す（人間が一巡したら消す。M17・M20・issue-tree-m1 と同じ扱い）。冒頭の「最終更新」を issue-tree-m3 に。

- [ ] **Step 3: `overview-rev.md`**

- 9章「役割トークンは…11個」→「12個」。無彩色系の列挙に `ink-faint`（非アクティブの文字・枠。3:1。**アクティブな本文に使わない**）を足す。M8 の `warning/10` の項の末尾に「**課題ツリーは未決を面で塗らない**（issue-tree-m3。新しい木は全部が未決なので面では情報にならない——バッジの破線で見せる）」
- 5章「古いファイル…読み込み時にメモリ上で自動移行して開く」の項に「**issue-tree の 1 → 2 が初の実例**（issue-tree-m3）。`src/core/load.ts` が `module.migrate` を呼び、移行後にスキーマ検証する」
- 6章（モジュール規約）の課題ツリーの行（2章の一覧 `6. 課題ツリーエディタ`）に「俯瞰の表現は設計ノート D10」を添える
- 4章（Skill）: 問いが4種になったことを `issue-tree-register` の記述に反映（「問いの類型」に触れている箇所があれば）

- [ ] **Step 4: `README.md` と `docs/README.md`**

`README.md` の課題ツリーの節: 「問いは3つ立つ——…『仮説は？』…『検証結果は？』…『判断は？』」を「問いは4つ——葉の課題に仮説が無ければ『仮説なし』、仮説に判断が無ければ『未決』、見たが決められなければ『保留』、FB が判断に紐づかないまま残っていれば『未判断』」に。スクリーンショットのコメントの「撮り方」を新しい画面に合わせて直す（「仮説を1つ展開した状態で、支持・棄却・保留・未決のバッジが全部写るように。見送った枝が薄く・破線で写るように」）。**画像の行はコメントの中のまま**（Task 10 で撮る）。

`docs/README.md`: マイルストーン表に `| [issue-tree-m3](history/issue-tree-m3-overview-ui.md) | 課題ツリーの俯瞰 UI と語彙（箱は課題だけ・仮説は行・判断は1つ） | 課題ツリー・コア（初の schemaVersion 移行）・デザイン |`。文書の地図の `docs/issue-tree/` の行に `俯瞰モック/`。

- [ ] **Step 5: `lessons-for-planning.md`**

実装で計画の誤りが出ていれば、その一般形を足す。出ていなければ足さない（空の教訓を作らない）。

- [ ] **Step 6: コミット**

```bash
git add docs/ README.md
git commit -m "docs(issue-tree): 申し送り・残件・rev を issue-tree-m3 に合わせる"
```

---

### Task 10: 実機確認（人間の作業。エージェントは実行できない）

`npm run tauri dev` で `sample-project/` を開き、`課題ツリー.json` で:

- [ ] 1. 箱は課題だけで、仮説が箱の中の行として見えること。線がカードの裏を通っていないこと
- [ ] 2. バッジが5語（支持＝緑の塗り／棄却＝黒の塗り／保留＝実線／未決＝破線／見送り＝薄い枠）で、**文字を読まずに**生き残った仮説が拾えること
- [ ] 3. 行をクリックすると展開し、文言が編集でき、「判断／以前の判断／由来／FB」の順で出ること。別の行を開くと前の行が畳まれること
- [ ] 4. 課題セルで `Ctrl+Enter` → 新しい仮説が展開されて文言にフォーカスが来ること。`Tab` で畳まれた行に着いたとき、そのまま文言の欄に入ること（`Shift+Tab` でも）
- [ ] 5. 「判断を追加 ▾」→ `保留` を選ぶ→根拠の欄にフォーカスが来ること。もう一度開いて `支持` にすると、`保留` が「以前の判断」へ降りること
- [ ] 6. 見送り: 箱にマウスを乗せると右上に「見送り」が出る→選ぶと理由の欄にフォーカス→配下の箱・バッジ・線が薄く／破線になること。**薄い箱が消えて見えないこと**（`ink-faint` の実値の最終判断）
- [ ] 7. 帯のチップ「未決 N」を押すと次の未決へ視点が寄ること。末尾で押すと先頭へ戻ること
- [ ] 8. 長い仮説が畳まれた行で「…」になり、展開すると全文が折り返して見えること。**箱の下端から文字が切れていないこと**（測定と描画の対）
- [ ] 9. 旧版ファイル: `schemaVersion: 1` の課題ツリーを手で置いて開き、**編集できる**こと。1文字打って保存したあと、ファイルの `schemaVersion` が 2 になっていること（rev 5章「最初の編集保存で反映」）。**`git diff` で `schemaVersion` 以外の差分が出ていないこと**
- [ ] 10. ダークモードで 2・6 を見直す
- [ ] 11. **開発機と違う OS（mac）で 1〜8 を一巡する**
- [ ] 12. スクリーンショットを `docs/images/issue-tree-editor.png` に撮り、`README.md` の画像の行をコメントの外へ出す（Task 9 Step 4 のコメントが撮り方を持っている）

確認が終わったら `open-issues.md` の「issue-tree-m3 の実機確認が未実施」を消し、所見（症状＝どこがどう見えたか、と人間の言葉＝何が嫌か、を分けて）を `open-issues.md` へ。**申し送り（`history/`）は書き換えない。**

---

## 自己レビュー（計画時点）

- **前提の網羅**: 1 → Task 4／2 → Task 4／3 → Task 2・4／4 → Task 4（展開パネルの節の順）／5 → Task 3・4／6 → Task 4（`SUPPRESSED_NOTE` 削除）／7 → Task 5／8 → Task 9（残件）／9 → Task 1／10 → Task 2 の前にユーザー確認
- **型の一貫性**: `IssueTreeSchemaVersion2`（Task 1 以降すべて）／`HypothesisQuestions.hold`・`IssueTreeTally.hold`（Task 2 → 4・5）／`badgeGroupOf` / `BADGE_LABELS`（Task 2 → 4・5）／`FocusTarget` の `deferral`（Task 4 の `cell-keys.ts` と `commands.ts` の両方）／`layoutIssueTree` の第4引数（Task 4 のレイアウトとエディタ）
- **継ぎ目**: 畳まれた行の `onFocus` → `setExpandedKey` ＋ `setPendingFocus`（同じ `data-cell`）→ 描画後の effect が textarea を掴む。**ボタンと textarea が同時に存在しない**ことが成立条件（Task 4 Step 6 に明記。Task 8 の観点3）
- **機械検査との衝突**: `h-[18px]`（Task 4 Step 2 で確かめる）／`bg-warning/10` を使わなくなる（紐づき検査は「宣言があれば値を見る」なので通る——Task 4 Step 8 で確認）／`ROW_GAP` の値変更（ロジックツリーに同名が無いことを確認）
- **計画に含めなかったもの**: フォーカスモード、判断の誤操作防止、付け替え、キーボード経路——「やらないこと」に列挙済み
