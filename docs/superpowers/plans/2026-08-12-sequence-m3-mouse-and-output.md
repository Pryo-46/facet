# sequence M3 実装計画: マウス操作（ドロップダウン）＋ 出力

> **エージェント作業者へ:** 必須サブスキル: `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` を使い、タスク単位で実装すること。手順はチェックボックス（`- [ ]`）で追跡する。

**Goal:** 打ち終えたシーケンスを Markdown（Mermaid 図＋失敗考慮の表）として NotePM に出せるようにし、from / to / 種別をマウスのドロップダウンで選べるようにする。

**Architecture:** 出力は純関数2本（`mermaid.ts` / `markdown.ts`）で組み立て、`module.ts` の `outputs` に1プロファイルとして登録する。整合性エラーがあるファイルの出力には額縁（コア）が確認ダイアログを挟み、「そのまま出力すると何が起きるか」の文面は `OutputProfile.describeIssueEffect` でモジュールから受け取る。マウスは既存の Radix `DropdownMenu`（`src/components/ui/dropdown-menu.tsx`）に2つのセルを載せ替え、ポップアップが開いている間はキャンバスのズーム・パンを止める。

**Tech Stack:** TypeScript / React 19 / Vitest（jsdom）/ Radix UI（`radix-ui` パッケージ）/ Tailwind v4 / d3-zoom

**設計の正:** [`../specs/2026-08-11-sequence-m3-mouse-and-output-design.md`](../specs/2026-08-11-sequence-m3-mouse-and-output-design.md)

---

## Global Constraints

すべてのタスクの要件に、以下が暗黙に含まれる。

- **`core/canvas` 等への共通化・抽象化を行わないこと。** `viewport.ts` / `useViewport.ts` / `measure.ts` / `seq-font.ts` は logic-tree からの意図的な複製である。**差分を作らないこと**——Task 3 の `filter` 修正は logic-tree と sequence の**両方に同じ形で**入れる
- **Mermaid の正規化関数は `src/modules/sequence/` に置く。** コアへ引き上げない（logic-tree の出力を作るときに判断する）
- **座標・幅・表示状態をデータ（JSON）に入れないこと**
- **キャンバスライブラリ（React Flow / tldraw / elkjs / dagre）を導入しないこと**
- **問いの類型をユーザーが増やせる機構を作らないこと**
- **新しい依存を追加しないこと。** Radix は `radix-ui` として既に入っており、`src/components/ui/dropdown-menu.tsx` が既存（`ExportMenu` が使用中）
- **`layoutSequence`（`layout.ts`）は無改変。** M1・M2 と同じ契約を保つ
- **`docs/lessons-for-planning.md` の規則に従うこと。** 特に「退化ケースをテストデータに選ばない」「順序を固定するテストを書いたら実装を1行壊して落ちることを確認する」「計画の指示が矛盾していたら辻褄を合わせず『計画の矛盾』として報告する」
- **計画の指示が矛盾していたら、辻褄を合わせずに報告すること。** 報告には**実行した検証コマンドとその出力を貼る**
- 各タスクの最後に `npm test && npx tsc -b && npm run lint` が緑であることを確認してからコミットする

### 用語（出力に現れる語。Task 1 で1箇所に定義する）

| 語 | 意味 |
| --- | --- |
| `（未定義）` | 問いは立っているが答えていない／文言が空 |
| `─ 考慮不要` | `notApplicable`（人が「考えなくてよい」と決めた） |
| `（未解決）` | 参照が引けない（`from` / `to` が `actors` に無い、`call` / `reply` に `to` が無い） |
| 空セル | 問いが立っていない（`reply` の全列、投げっぱなしの `failed` / `ifExecuted`、`self` の `unknown` / `ifExecuted`） |

---

## ファイル構成

**新規作成:**

| ファイル | 責務 |
| --- | --- |
| `src/modules/sequence/output-labels.ts` | 出力に現れる語の定数（上の表）＋ 表の列見出し。`mermaid.ts` と `markdown.ts` が共有する。**この1本があるので循環 import が起きない** |
| `src/modules/sequence/mermaid.ts` | Mermaid ラベルのエスケープと `sequenceDiagram` の組み立て（純関数） |
| `src/modules/sequence/mermaid.test.ts` | 同上のユニットテスト |
| `src/modules/sequence/markdown.ts` | 出力全体（`## 見出し` → Mermaid ブロック → 表）の組み立てと `describeSequenceIssueEffect`（純関数） |
| `src/modules/sequence/markdown.test.ts` | 同上のユニットテスト |

**変更:**

| ファイル | 変更内容 |
| --- | --- |
| `src/core/registry.ts` | `OutputProfile` に任意スロット `describeIssueEffect` を足す |
| `src/core/app-controller.ts` | `currentDocument()` が `issues` も返す。`copyMarkdown` / `exportMarkdown` に確認ダイアログを挟む |
| `src/core/app-controller.test.ts` | `createHarness` にモジュール差し替えの口を足す＋確認ダイアログのテスト |
| `src/components/ConfirmDialog.tsx` | `description` の改行を出す（`whitespace-pre-line`） |
| `src/modules/sequence/module.ts` | `outputs` に1プロファイルを登録 |
| `src/modules/sequence/module.test.ts` | `outputs` が1本であることの検証へ更新 |
| `src/modules/sequence/commands.ts` | `readSlot` を `export` する／`createActorAndAssign` を削除 |
| `src/modules/sequence/useViewport.ts` | `filter` が `enabled` を見る |
| `src/modules/logic-tree/useViewport.ts` | 同上（複製規約） |
| `src/modules/sequence/useViewport.dom.test.tsx` | `enabled: false` のときの検証を追加 |
| `src/modules/logic-tree/useViewport.dom.test.tsx` | 同上 |
| `src/modules/sequence/StepShapeCell.tsx` | `DropdownMenu` 化 |
| `src/modules/sequence/StepShapeCell.dom.test.tsx` | クリック巡回のテストをメニューのテストへ差し替え |
| `src/modules/sequence/ActorRefCell.tsx` | 選択専用ドロップダウンへ作り替え |
| `src/modules/sequence/ActorRefCell.dom.test.tsx` | 照合・ドラフト確定・インライン作成のテストを削除 |
| `src/modules/sequence/SequenceEditor.tsx` | `menuOpen` の配線／「参加者を追加」ボタン／`onCreate` の除去 |
| `src/modules/sequence/SequenceEditor.dom.test.tsx` | インライン作成のテストを削除、ボタンとメニューのテストを追加 |

---

## タスク一覧

| # | 内容 | 依存 |
| --- | --- | --- |
| 1 | 出力の語彙（`output-labels.ts`）と Mermaid ラベルのエスケープ | — |
| 2 | Mermaid `sequenceDiagram` の組み立て | 1 |
| 3 | 出力全体（見出し＋図＋表）の組み立て | 1, 2 |
| 4 | `module.ts` への登録と `describeIssueEffect` | 3 |
| 5 | 額縁の確認ダイアログ（コア。4ツール共通） | 4 |
| 6 | ポップアップ中のズーム停止（`useViewport` の `filter`。2モジュール） | — |
| 7 | 種別セルの `DropdownMenu` 化 | 6 |
| 8 | from / to を選択専用ドロップダウンへ | 6, 7 |
| 9 | 「参加者を追加」ボタン | 8 |
| 10 | 機械検査の確認と全体検証 | 1–9 |
| 11 | 実機確認（**人間の作業**） | 10 |
| 12 | 申し送り・`open-issues.md`・rev への反映 | 11 |

---

### Task 1: 出力の語彙と Mermaid ラベルのエスケープ

**Files:**
- Create: `src/modules/sequence/output-labels.ts`
- Create: `src/modules/sequence/mermaid.ts`
- Create: `src/modules/sequence/mermaid.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `output-labels.ts`: `UNDEFINED_VALUE: '（未定義）'` / `NOT_APPLICABLE_LABEL: '─ 考慮不要'` / `UNRESOLVED_ACTOR_LABEL: '（未解決）'` / `TABLE_HEADERS: readonly string[]`
  - `mermaid.ts`: `escapeMermaidLabel(text: string): string`

- [ ] **Step 1: 語彙のファイルを作る**

`src/modules/sequence/output-labels.ts`:

```ts
/**
 * 出力（Markdown 表 ＋ Mermaid）に現れる語。**1箇所に置く。**
 * 表と図で同じ状態を別の語で書くと、読み手は2つの語彙を覚えることになる。
 *
 * `mermaid.ts` と `markdown.ts` の両方が読む。定数だけを持つ独立したファイルに
 * するのは、どちらか一方に置くと import が循環するため（markdown.ts は
 * sequenceToMermaid を呼ぶ）
 */

/** 問いは立っているが答えていない／文言が空。既存2ツールの出力と同じ語 */
export const UNDEFINED_VALUE = '（未定義）'

/** notApplicable（人が「考えなくてよい」と決めた）。画面の GutterSlot の「─」接頭と対応する */
export const NOT_APPLICABLE_LABEL = '─ 考慮不要'

/**
 * 参照が引けない（from / to が actors に無い、call / reply に to が無い）。
 * **行を落とす代わりにこの語へ寄せる**——図から消すと、貼った先の仕様書では
 * 不完全なのに完全に見える（「仕様書に貼った瞬間に見えなくなる」の再生産）
 */
export const UNRESOLVED_ACTOR_LABEL = '（未解決）'

/**
 * 表の列見出し（design-notes 論点11 の列構成）。
 *
 * **`実行済みなら` は consistency.ts の PATH_LABEL の `実行済みだったら` と
 * 意図的に違う。** 前者は表の列名（短くする）、後者は指摘文の中の呼び名。
 * 揃えないこと——揃えると列見出しが冗長になるか、指摘文が不自然になる
 */
export const TABLE_HEADERS: readonly string[] = [
  'No',
  'from → to',
  'ラベル',
  '失敗確定',
  '結果不明',
  '実行済みなら',
]
```

- [ ] **Step 2: 失敗するテストを書く**

`src/modules/sequence/mermaid.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { escapeMermaidLabel } from './mermaid'

describe('escapeMermaidLabel', () => {
  it('明示改行は <br> にする（Mermaid のラベルは改行を含められない）', () => {
    expect(escapeMermaidLabel('与信を\n依頼する')).toBe('与信を<br>依頼する')
    expect(escapeMermaidLabel('a\r\nb\rc')).toBe('a<br>b<br>c')
  })

  it('# はエンティティ記法の開始文字なので #35; にする', () => {
    expect(escapeMermaidLabel('#1 の与信')).toBe('#35;1 の与信')
  })

  it('; は文の区切りに読まれうるので #59; にする', () => {
    expect(escapeMermaidLabel('確定;送信')).toBe('確定#59;送信')
  })

  it('# と ; が混ざっても二重エスケープしない（1パスで置換する）', () => {
    // **順に replace すると壊れる**: # → #35; の後に ; → #59; を掛けると
    // #35; が #35#59; になる。逆順でも #59; が #3559; になる。
    // 1回の走査で1文字ずつ置き換えることでのみ正しくなる
    expect(escapeMermaidLabel('#;')).toBe('#35;#59;')
    expect(escapeMermaidLabel('a#b;c')).toBe('a#35;b#59;c')
  })

  it('普通の日本語・英数字・コロンはそのまま（コロンは本文として通る）', () => {
    expect(escapeMermaidLabel('与信依頼: OK')).toBe('与信依頼: OK')
  })

  it('空文字は空文字のまま返す（置き換えは呼び出し側の仕事）', () => {
    expect(escapeMermaidLabel('')).toBe('')
  })
})
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run src/modules/sequence/mermaid.test.ts`
Expected: FAIL（`escapeMermaidLabel` が存在しない旨のエラー）

- [ ] **Step 4: 実装する**

`src/modules/sequence/mermaid.ts`:

```ts
/**
 * Mermaid `sequenceDiagram` の組み立て（design-notes 論点8・11）。
 *
 * **置き場はモジュール内。** 論点11 は「先に出力を実装した側が正規化関数を
 * 1本立て、後発がそれに乗る」としているが、コアの `markdown-table.ts` 自身が
 * 用語集で生まれて M10 の2本目で引き上げられた経緯があり、このリポジトリは
 * 「1本目では抽象を作らない」で通っている。logic-tree の出力を作るときに
 * `core/mermaid.ts` へ引き上げる（open-issues に記録）
 */

/**
 * Mermaid のラベルに収める。
 *
 * - 改行は含められないので `<br>` にする（Mermaid はラベル内の `<br>` を解釈する）
 * - `#` はエンティティ記法（`#35;`）の開始文字、`;` は文の区切りに読まれうる
 *
 * **1回の走査で置き換える。** `replace` を順に掛けると、後の置換が前の置換で
 * 入れた文字を食う（`escapeCell` がバックスラッシュを先に処理しているのと
 * 同じ問題だが、こちらは順序では解けない——どちらを先にしても壊れる）
 */
export function escapeMermaidLabel(text: string): string {
  return text
    .replace(/[#;]/g, (ch) => (ch === '#' ? '#35;' : '#59;'))
    .replace(/\r\n|\r|\n/g, '<br>')
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run src/modules/sequence/mermaid.test.ts`
Expected: PASS（このファイルの `it` がすべて緑）

- [ ] **Step 6: 実装を壊して落ちることを確認する**

`escapeMermaidLabel` の1パス置換を、順次 replace に書き換える:

```ts
return text.replace(/#/g, '#35;').replace(/;/g, '#59;').replace(/\r\n|\r|\n/g, '<br>')
```

Run: `npx vitest run src/modules/sequence/mermaid.test.ts`
Expected: FAIL（「# と ; が混ざっても二重エスケープしない」が落ちる）。**確認したら元に戻す**

- [ ] **Step 7: 型検査と lint**

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

- [ ] **Step 8: コミット**

```bash
git add src/modules/sequence/output-labels.ts src/modules/sequence/mermaid.ts src/modules/sequence/mermaid.test.ts
git commit -m "feat(sequence): 出力の語彙と Mermaid ラベルのエスケープを足す"
```

---

### Task 2: Mermaid `sequenceDiagram` の組み立て

**Files:**
- Modify: `src/modules/sequence/mermaid.ts`
- Modify: `src/modules/sequence/mermaid.test.ts`

**Interfaces:**
- Consumes: `escapeMermaidLabel`（Task 1）／`UNDEFINED_VALUE`・`UNRESOLVED_ACTOR_LABEL`（Task 1）／`stepShapeOf`（既存 `./commands`）
- Produces: `sequenceToMermaid(data: SequenceSchemaVersion1): string` — 末尾に改行を付けない（呼び出し側がフェンスで囲む）

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/sequence/mermaid.test.ts` の末尾に追記（先頭の import に `sequenceToMermaid` と型を足す）:

```ts
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { escapeMermaidLabel, sequenceToMermaid } from './mermaid'

/**
 * 退化ケースを避けたフィクスチャ（lessons-for-planning）。
 * 参加者3人・4種類のステップ（呼出／投げっぱなし／応答／内部処理）を混ぜる——
 * 参加者2人や1種類だと「配列順で採番」と「出現順で採番」が同じ値になり、
 * 矢印の対応表も1本しか検査できない
 */
function doc(over: Partial<SequenceSchemaVersion1> = {}): SequenceSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: '注文確定（在庫あり）',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面', domain: '自社' },
      { id: 'actor_Aaaaaaaaa2', name: 'API', domain: '自社' },
      { id: 'actor_Aaaaaaaaa3', name: '決済', domain: '決済会社' },
    ],
    steps: [
      { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: '注文確定', awaitsReply: true },
      { id: 'step_Aaaaaaaaa2', kind: 'call', from: 'actor_Aaaaaaaaa2', to: 'actor_Aaaaaaaaa3', label: '出荷指示', awaitsReply: false },
      { id: 'step_Aaaaaaaaa3', kind: 'reply', from: 'actor_Aaaaaaaaa3', to: 'actor_Aaaaaaaaa2', label: '与信OK' },
      { id: 'step_Aaaaaaaaa4', kind: 'self', from: 'actor_Aaaaaaaaa2', label: '在庫引当' },
    ],
    ...over,
  }
}

describe('sequenceToMermaid', () => {
  it('participant を配列順に宣言し、4種類の矢印を導出する', () => {
    expect(sequenceToMermaid(doc())).toBe(
      [
        'sequenceDiagram',
        '    participant a1 as 画面',
        '    participant a2 as API',
        '    participant a3 as 決済',
        '    a1->>a2: 注文確定',
        '    a2-)a3: 出荷指示',
        '    a3-->>a2: 与信OK',
        '    a2->>a2: 在庫引当',
      ].join('\n'),
    )
  })

  it('domain は出力しない（M3 の確定事項。box 構文も参加者名への併記もしない）', () => {
    const out = sequenceToMermaid(doc())
    expect(out).not.toContain('box')
    expect(out).not.toContain('決済会社')
    expect(out).not.toContain('自社')
  })

  it('参照切れの to は（未解決）参加者へ向け、行は落とさない', () => {
    const out = sequenceToMermaid(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Zzzzzzzzz9', label: '与信依頼', awaitsReply: true },
        ],
      }),
    )
    expect(out).toContain('participant unresolved as （未解決）')
    expect(out).toContain('a1->>unresolved: 与信依頼')
  })

  it('call なのに to が無い行も（未解決）へ向ける（a1->>: は構文エラーになる）', () => {
    const out = sequenceToMermaid(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', label: '宛先未定', awaitsReply: true },
        ],
      }),
    )
    expect(out).toContain('a1->>unresolved: 宛先未定')
  })

  it('（未解決）の participant は、使われたときだけ宣言する', () => {
    expect(sequenceToMermaid(doc())).not.toContain('unresolved')
  })

  it('（未解決）の participant は最後に宣言する（既存の列順を動かさない）', () => {
    const out = sequenceToMermaid(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Zzzzzzzzz9', to: 'actor_Aaaaaaaaa3', label: '謎', awaitsReply: true },
        ],
      }),
    )
    const lines = out.split('\n')
    expect(lines.indexOf('    participant unresolved as （未解決）')).toBeGreaterThan(
      lines.indexOf('    participant a3 as 決済'),
    )
  })

  it('文言が空のステップは（未定義）と書く（空の本文は Mermaid で壊れうる）', () => {
    const out = sequenceToMermaid(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: '', awaitsReply: true },
        ],
      }),
    )
    expect(out).toContain('a1->>a2: （未定義）')
  })

  it('名前が空の参加者も（未定義）と書く（participant a1 as  は壊れる）', () => {
    const out = sequenceToMermaid(
      doc({ actors: [{ id: 'actor_Aaaaaaaaa1', name: '' }], steps: [] }),
    )
    expect(out).toContain('participant a1 as （未定義）')
  })

  it('ラベルはエスケープを通す', () => {
    const out = sequenceToMermaid(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: '#1 を\n送る', awaitsReply: true },
        ],
      }),
    )
    expect(out).toContain('a1->>a2: #35;1 を<br>送る')
  })

  it('ID が重複している参加者は先頭の1つだけが採番を持つ（logic-tree の ID 重複と同じ扱い）', () => {
    const out = sequenceToMermaid(
      doc({
        actors: [
          { id: 'actor_Aaaaaaaaa1', name: '画面' },
          { id: 'actor_Aaaaaaaaa1', name: '画面（重複）' },
        ],
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'self', from: 'actor_Aaaaaaaaa1', label: '処理' },
        ],
      }),
    )
    expect(out).toContain('a1->>a1: 処理')
  })

  it('参加者もステップも無いときは sequenceDiagram の1行だけ', () => {
    expect(sequenceToMermaid(doc({ actors: [], steps: [] }))).toBe('sequenceDiagram')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/modules/sequence/mermaid.test.ts`
Expected: FAIL（`sequenceToMermaid` が存在しない）

- [ ] **Step 3: 実装する**

`src/modules/sequence/mermaid.ts` に追記（import を足す）:

```ts
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { stepShapeOf, type StepShapeValue } from './commands'
import { UNDEFINED_VALUE, UNRESOLVED_ACTOR_LABEL } from './output-labels'

/**
 * 矢印の形は kind × awaitsReply から導出する（design-notes 論点8）。
 * UML 慣習に一致: 実線・塗り矢頭／実線・開き矢頭／破線・開き矢頭
 */
const ARROW: Record<StepShapeValue, string> = {
  'call-sync': '->>',
  'call-async': '-)',
  reply: '-->>',
  self: '->>',
}

/** 解決できない参照の逃げ場。Mermaid の識別子なので英数字にする */
const UNRESOLVED_ID = 'unresolved'

/** 空の名前・文言は（未定義）にする。`participant a1 as ` や `a1->>a2: ` は Mermaid で壊れる */
function orUndefined(text: string): string {
  return text === '' ? UNDEFINED_VALUE : text
}

/**
 * 正常系のみの `sequenceDiagram`（design-notes 論点11）。失敗考慮は出さない。
 * 末尾に改行を付けない——呼び出し側（markdown.ts）がフェンスで囲む。
 *
 * **``` でフェンスが割れることはない。** ラベルは escapeMermaidLabel で
 * 改行が `<br>` になるので、生成される行は必ず4スペースのインデントで始まる。
 * ``` が行頭に来ないので、フェンスの終端と誤読されない
 */
export function sequenceToMermaid(data: SequenceSchemaVersion1): string {
  // ID 重複を受け入れるファイルなので、先頭の1つだけが採番を持つ（後続は
  // 参照から引けず（未解決）へ落ちる）。logic-tree の「ID が重複している
  // ファイルでは先頭の1つにだけ付く」と同じ扱い
  const idOf = new Map<string, string>()
  data.actors.forEach((actor, i) => {
    if (!idOf.has(actor.id)) idOf.set(actor.id, `a${i + 1}`)
  })

  let usedUnresolved = false
  const resolve = (ref: string | undefined): string => {
    const id = ref === undefined ? undefined : idOf.get(ref)
    if (id === undefined) {
      usedUnresolved = true
      return UNRESOLVED_ID
    }
    return id
  }

  // **メッセージ行を先に組む。** （未解決）を宣言するかどうかが、
  // 全ステップを見終わるまで決まらないため
  const messages = data.steps.map((step) => {
    const shape = stepShapeOf(step)
    const from = resolve(step.from)
    // self は宛先を持たない（to があっても無視する。to-mismatch は赤表示が扱う）
    const to = shape === 'self' ? from : resolve(step.to)
    return `    ${from}${ARROW[shape]}${to}: ${escapeMermaidLabel(orUndefined(step.label))}`
  })

  const participants = data.actors
    // ID 重複の2つ目以降は採番を持たない（先頭が `a{i+1}` を握っている）ので宣言しない
    .filter((actor, i) => idOf.get(actor.id) === `a${i + 1}`)
    .map(
      (actor) =>
        `    participant ${idOf.get(actor.id)} as ${escapeMermaidLabel(orUndefined(actor.name))}`,
    )
  if (usedUnresolved) {
    // 末尾に置く——既存の参加者の列順を動かさない
    participants.push(`    participant ${UNRESOLVED_ID} as ${UNRESOLVED_ACTOR_LABEL}`)
  }

  return ['sequenceDiagram', ...participants, ...messages].join('\n')
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/sequence/mermaid.test.ts`
Expected: PASS（このファイルの `it` がすべて緑）

- [ ] **Step 5: 実装を壊して落ちることを確認する（2箇所）**

(a) `ARROW` の `'call-async'` を `'->>'` にする → 「4種類の矢印を導出する」が落ちること
(b) `usedUnresolved` の条件を外して常に `unresolved` を宣言する → 「使われたときだけ宣言する」が落ちること

Run: 各変更後に `npx vitest run src/modules/sequence/mermaid.test.ts`
Expected: それぞれ FAIL。**確認したら元に戻す**

- [ ] **Step 6: 型検査と lint**

Run: `npx tsc -b && npm run lint`
Expected: エラーなし

- [ ] **Step 7: コミット**

```bash
git add src/modules/sequence/mermaid.ts src/modules/sequence/mermaid.test.ts
git commit -m "feat(sequence): Mermaid sequenceDiagram を組み立てる"
```

---

### Task 3: 出力全体（見出し＋図＋表）の組み立て

**Files:**
- Create: `src/modules/sequence/markdown.ts`
- Create: `src/modules/sequence/markdown.test.ts`
- Modify: `src/modules/sequence/commands.ts`（`readSlot` を `export` する）

**Interfaces:**
- Consumes: `sequenceToMermaid`（Task 2）／`UNDEFINED_VALUE`・`NOT_APPLICABLE_LABEL`・`UNRESOLVED_ACTOR_LABEL`・`TABLE_HEADERS`（Task 1）／`escapeCell`・`dividerRow`・`headingText`・`row`（既存 `@/core/markdown-table`）／`poseQuestions`（既存 `./questions`）／`readSlot`（既存 `./commands`、本タスクで export）
- Produces: `sequenceToMarkdown(data: SequenceSchemaVersion1): string`（末尾に改行1つ）／`describeSequenceIssueEffect(issues: readonly ConsistencyIssue[]): string`

- [ ] **Step 1: `readSlot` を export する**

`src/modules/sequence/commands.ts` の `readSlot`（262行目付近）に `export` を付け、JSDoc を足す:

```ts
/**
 * スロットの生の値（decision / text）を読む。
 *
 * **同じ読み方が3箇所にある**（ここ・`SequenceEditor.tsx` の `readAnswer`・
 * `consistency.ts` の `presentAnswers`）。M2 の申し送りに既知の負債として
 * 記録されている。**4本目を作らないため**に export した——出力（`markdown.ts`）は
 * これを使うこと
 */
export function readSlot(
  step: SequenceStep,
  path: AnswerPath,
): { decision?: 'handled' | 'notApplicable'; text?: string } {
```

- [ ] **Step 2: 失敗するテストを書く**

`src/modules/sequence/markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ConsistencyIssue } from '@/core/consistency'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { describeSequenceIssueEffect, sequenceToMarkdown } from './markdown'

/**
 * 退化ケースを避けたフィクスチャ（lessons-for-planning）。
 * 参加者3人・4種類のステップ・4つの答えの状態（handled / notApplicable（理由あり）/
 * notApplicable（理由なし）/ 未回答）を混ぜる——1種類だと「立っていない＝空」と
 * 「未回答＝（未定義）」を取り違えた実装でも同じ表になる
 */
function doc(over: Partial<SequenceSchemaVersion1> = {}): SequenceSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: '注文確定（在庫あり）',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面', domain: '自社' },
      { id: 'actor_Aaaaaaaaa2', name: 'API', domain: '自社' },
      { id: 'actor_Aaaaaaaaa3', name: '決済', domain: '決済会社' },
    ],
    steps: [
      {
        id: 'step_Aaaaaaaaa1',
        kind: 'call',
        from: 'actor_Aaaaaaaaa1',
        to: 'actor_Aaaaaaaaa2',
        label: '注文確定',
        awaitsReply: true,
        failures: {
          failed: { decision: 'handled', text: '画面にエラー表示して中断' },
          // unknown / ifExecuted は未回答（キー欠落）
        },
      },
      {
        id: 'step_Aaaaaaaaa2',
        kind: 'call',
        from: 'actor_Aaaaaaaaa2',
        to: 'actor_Aaaaaaaaa3',
        label: '出荷指示',
        awaitsReply: false,
        failures: { unknown: { decision: 'handled', text: '再送する' } },
      },
      { id: 'step_Aaaaaaaaa3', kind: 'reply', from: 'actor_Aaaaaaaaa3', to: 'actor_Aaaaaaaaa2', label: '与信OK' },
      {
        id: 'step_Aaaaaaaaa4',
        kind: 'self',
        from: 'actor_Aaaaaaaaa2',
        label: '在庫引当',
        failures: { failed: { decision: 'notApplicable', text: '在庫は事前確保済み' } },
      },
    ],
    ...over,
  }
}

/** 表の本文行だけを取り出す（見出し行と区切り行を除く） */
function bodyRows(markdown: string): string[] {
  return markdown.split('\n').filter((line) => /^\| \d+ \|/.test(line))
}

describe('sequenceToMarkdown: 全体の形', () => {
  it('h2 の見出し → Mermaid ブロック → 表、の順で1本にまとめる', () => {
    const out = sequenceToMarkdown(doc())
    const h2 = out.indexOf('## 注文確定（在庫あり）')
    const fence = out.indexOf('```mermaid')
    const header = out.indexOf('| No | from → to |')
    expect(h2).toBe(0)
    expect(fence).toBeGreaterThan(h2)
    expect(header).toBeGreaterThan(fence)
  })

  it('h1 は使わない（NotePM のページタイトルと階層が衝突する）', () => {
    expect(sequenceToMarkdown(doc())).not.toMatch(/^# /m)
  })

  it('Mermaid ブロックは閉じる', () => {
    expect(sequenceToMarkdown(doc()).match(/```/g)).toHaveLength(2)
  })

  it('末尾は改行1つで終わる（既存2ツールの出力と揃える）', () => {
    const out = sequenceToMarkdown(doc())
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })

  it('見出しの改行は潰す（外部が書いた title で h1 が混入しない）', () => {
    expect(sequenceToMarkdown(doc({ title: 'a\n# b' }))).toContain('## a # b')
  })
})

describe('sequenceToMarkdown: 表のセル', () => {
  it('No はデータ配列の位置（画面のガター行見出し #N と一致する）', () => {
    const rows = bodyRows(sequenceToMarkdown(doc()))
    expect(rows.map((r) => r.split(' | ')[0])).toEqual(['| 1', '| 2', '| 3', '| 4'])
  })

  it('handled は本文、notApplicable（理由あり）は ─ 考慮不要（理由）', () => {
    const rows = bodyRows(sequenceToMarkdown(doc()))
    expect(rows[0]).toContain('画面にエラー表示して中断')
    expect(rows[3]).toContain('─ 考慮不要（在庫は事前確保済み）')
  })

  it('notApplicable（理由なし）は ─ 考慮不要 だけ', () => {
    const out = sequenceToMarkdown(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'self', from: 'actor_Aaaaaaaaa2', label: '在庫引当', failures: { failed: { decision: 'notApplicable' } } },
        ],
      }),
    )
    expect(bodyRows(out)[0]).toContain('─ 考慮不要 |')
    expect(bodyRows(out)[0]).not.toContain('考慮不要（')
  })

  it('立っているのに未回答は（未定義）', () => {
    // ステップ1（応答待ちの呼出）は3問立ち、failed だけ答えている
    expect(bodyRows(sequenceToMarkdown(doc()))[0]).toContain('（未定義）')
  })

  it('立っていない問いは空セル（reply の3列すべて）', () => {
    // **ここが（未定義）と取り違えられやすい。** reply には問いが立たないので、
    // 「まだ決めていない」ではなく「問われていない」
    const rows = bodyRows(sequenceToMarkdown(doc()))
    expect(rows[2]).toBe('| 3 | 決済 → API | 与信OK |  |  |  |')
  })

  it('投げっぱなしは 結果不明 だけが埋まり、失敗確定と実行済みならは空', () => {
    const rows = bodyRows(sequenceToMarkdown(doc()))
    expect(rows[1]).toBe('| 2 | API → 決済 | 出荷指示 |  | 再送する |  |')
  })

  it('self は from → to 列を「名前（内部処理）」にし、結果不明と実行済みならは空', () => {
    const rows = bodyRows(sequenceToMarkdown(doc()))
    expect(rows[3]).toBe('| 4 | API（内部処理） | 在庫引当 | ─ 考慮不要（在庫は事前確保済み） |  |  |')
  })

  it('文言が空のステップは（未定義）', () => {
    const out = sequenceToMarkdown(
      doc({ steps: [{ id: 'step_Aaaaaaaaa1', kind: 'self', from: 'actor_Aaaaaaaaa2', label: '' }] }),
    )
    expect(bodyRows(out)[0]).toContain('| （未定義） |')
  })

  it('セルの | と改行はエスケープする（表が割れない）', () => {
    const out = sequenceToMarkdown(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'self', from: 'actor_Aaaaaaaaa2', label: 'a|b', failures: { failed: { decision: 'handled', text: '1行目\n2行目' } } },
        ],
      }),
    )
    expect(bodyRows(out)[0]).toContain('a\\|b')
    expect(bodyRows(out)[0]).toContain('1行目<br>2行目')
  })
})

describe('sequenceToMarkdown: 壊れたデータ', () => {
  it('参照切れは表でも（未解決）', () => {
    const out = sequenceToMarkdown(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Zzzzzzzzz9', label: '与信依頼', awaitsReply: true },
        ],
      }),
    )
    expect(bodyRows(out)[0]).toContain('画面 → （未解決）')
  })

  it('to が無い call も表で（未解決）', () => {
    const out = sequenceToMarkdown(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', label: '宛先未定', awaitsReply: true },
        ],
      }),
    )
    expect(bodyRows(out)[0]).toContain('画面 → （未解決）')
  })

  it('行は1本も落とさない（4本のステップなら本文4行）', () => {
    const out = sequenceToMarkdown(
      doc({
        steps: doc().steps.map((s) => ({ ...s, from: 'actor_Zzzzzzzzz9' })),
      }),
    )
    expect(bodyRows(out)).toHaveLength(4)
  })

  it('ステップが0本でも見出し・図・表の見出し行は出る', () => {
    const out = sequenceToMarkdown(doc({ steps: [] }))
    expect(out).toContain('## 注文確定（在庫あり）')
    expect(out).toContain('```mermaid')
    expect(out).toContain('| No | from → to |')
    expect(bodyRows(out)).toHaveLength(0)
  })
})

describe('describeSequenceIssueEffect', () => {
  const issue = (rule: string): ConsistencyIssue => ({ rule, message: 'm', locations: [] })

  it('参照切れがあるときは（未解決）が図に立つことを言う', () => {
    const text = describeSequenceIssueEffect([issue('missing-actor')])
    expect(text).toContain('（未解決）')
    expect(text).toContain('表には全行がそのまま出ます')
  })

  it('to-mismatch でも同じ説明になる（どちらも（未解決）へ寄る）', () => {
    expect(describeSequenceIssueEffect([issue('to-mismatch')])).toContain('（未解決）')
  })

  it('参照に関わらない指摘だけのときは（未解決）に触れない', () => {
    // ID 重複や unposed-answer は図の宛先を壊さない。無関係な説明を出すと
    // 「（未解決）を探したのに無い」という空振りを読み手にさせる
    const text = describeSequenceIssueEffect([issue('duplicate-id'), issue('unposed-answer')])
    expect(text).not.toContain('（未解決）')
    expect(text).toContain('そのまま')
  })
})
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run src/modules/sequence/markdown.test.ts`
Expected: FAIL（`./markdown` が存在しない）

- [ ] **Step 4: 実装する**

`src/modules/sequence/markdown.ts`:

```ts
import type { ConsistencyIssue } from '@/core/consistency'
import { dividerRow, escapeCell, headingText, row } from '@/core/markdown-table'
import type { SequenceSchemaVersion1, SequenceStep } from '@/types/sequence'
import { readSlot } from './commands'
import { sequenceToMermaid } from './mermaid'
import {
  NOT_APPLICABLE_LABEL,
  TABLE_HEADERS,
  UNDEFINED_VALUE,
  UNRESOLVED_ACTOR_LABEL,
} from './output-labels'
import { poseQuestions, type AnswerPath } from './questions'

/**
 * シーケンスの Markdown 出力（モジュール規約5。design-notes 論点11）。
 *
 * **プロファイルは1本で、図と表を縦に並べる。** rev 6章のプロファイルは
 * 「読み手による出し分け」の軸であり、形式（図／表）の軸を混ぜると、
 * 後から読み手の軸が要るときに掛け算になる。1本にまとめることで、
 * `No` で図と表を突き合わせられる利点もある。
 *
 * - **h1 は使わない**（NotePM のページタイトルと階層が衝突する）。`title` が h2
 * - **`domain`（責任境界）は出さない**（M3 の確定事項。存置自体を見直す議題が
 *   open-issues に立っている）
 * - 空フィールドは `（未定義）`。**仕様書に貼った瞬間に未定義が見えなくなるのは
 *   文章仕様書の悪癖の再生産である**（rev 5章。用語集・エラーカタログと同じ規約）
 */

/** 表の列（No を除く）の並び。TABLE_HEADERS の 3番目以降と1対1で対応する */
const ANSWER_COLUMNS: readonly AnswerPath[] = ['failed', 'unknown', 'ifExecuted']

/** 参加者の表示名。引けなければ（未解決）、名前が空なら（未定義） */
function actorLabel(data: SequenceSchemaVersion1, ref: string | undefined): string {
  const actor = ref === undefined ? undefined : data.actors.find((a) => a.id === ref)
  if (actor === undefined) return UNRESOLVED_ACTOR_LABEL
  return actor.name === '' ? UNDEFINED_VALUE : escapeCell(actor.name)
}

/** from → to 列。self は宛先を持たないので「名前（内部処理）」と書く */
function routeCell(data: SequenceSchemaVersion1, step: SequenceStep): string {
  if (step.kind === 'self') return `${actorLabel(data, step.from)}（内部処理）`
  return `${actorLabel(data, step.from)} → ${actorLabel(data, step.to)}`
}

/**
 * 答えの1セル。**4状態を書き分ける**:
 * 問いが立っていない＝空セル／未回答＝（未定義）／notApplicable＝─ 考慮不要／
 * handled＝本文。
 *
 * 空セルにするのは、人が判断したセルには必ず何かが入るからで、空白が自動的に
 * 「ここは問われていない」の意になる。`─` だけにすると `─ 考慮不要` と接頭が
 * 同じになり、**人が決めた**と**ツールが問わない**の境が潰れる
 */
function answerCell(step: SequenceStep, path: AnswerPath): string {
  if (!poseQuestions(step)[path]) return ''
  const slot = readSlot(step, path)
  if (slot.decision === undefined) return UNDEFINED_VALUE
  if (slot.decision === 'notApplicable') {
    return slot.text === undefined || slot.text === ''
      ? NOT_APPLICABLE_LABEL
      : `${NOT_APPLICABLE_LABEL}（${escapeCell(slot.text)}）`
  }
  return slot.text === undefined || slot.text === '' ? UNDEFINED_VALUE : escapeCell(slot.text)
}

export function sequenceToMarkdown(data: SequenceSchemaVersion1): string {
  const rows = data.steps.map((step, index) =>
    row([
      // **No はデータ配列の位置（index + 1）。** 画面のガターの行見出し `#N` と
      // 一致させる——会議で「3番の結果不明が空だ」と口頭で指すための目印
      `${index + 1}`,
      routeCell(data, step),
      step.label === '' ? UNDEFINED_VALUE : escapeCell(step.label),
      ...ANSWER_COLUMNS.map((path) => answerCell(step, path)),
    ]),
  )
  const table = [row(TABLE_HEADERS), dividerRow(TABLE_HEADERS.length), ...rows].join('\n')
  const diagram = ['```mermaid', sequenceToMermaid(data), '```'].join('\n')
  return `## ${headingText(data.title)}\n\n${diagram}\n\n${table}\n`
}

/**
 * 整合性エラーがあるまま出力したとき、出力に何が起きるかの1文
 *（`OutputProfile.describeIssueEffect`）。額縁の確認ダイアログが出す。
 *
 * **参照に関わる指摘があるときだけ（未解決）に触れる。** ID 重複や
 * unposed-answer は図の宛先を壊さないので、触れると読み手に空振りをさせる
 */
export function describeSequenceIssueEffect(issues: readonly ConsistencyIssue[]): string {
  const breaksRoute = issues.some((i) => i.rule === 'missing-actor' || i.rule === 'to-mismatch')
  if (!breaksRoute) {
    return 'このまま出力すると、指摘のある箇所もそのまま図と表に出ます。'
  }
  return 'このまま出力すると、図には「（未解決）」という参加者が立ち、宛先を引けない矢印はそこへ向きます。表には全行がそのまま出ます。'
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run src/modules/sequence/markdown.test.ts`
Expected: PASS（このファイルの `it` がすべて緑）

- [ ] **Step 6: 実装を壊して落ちることを確認する（2箇所）**

(a) `answerCell` の1行目 `if (!poseQuestions(step)[path]) return ''` を `return UNDEFINED_VALUE` に変える → 「立っていない問いは空セル」「投げっぱなしは 結果不明 だけが埋まり…」「self は from → to 列を…」の3本が落ちること
(b) `routeCell` の `if (step.kind === 'self')` の分岐を消して、self でも `from → to` を出すようにする → 「self は from → to 列を…」が落ちること

Run: 各変更後に `npx vitest run src/modules/sequence/markdown.test.ts`
Expected: それぞれ FAIL。**確認したら元に戻す**

**`No` の変異は入れない。** 「データ配列の位置」と「表の中での連番」は全行を出す限り常に同じ値になるので、どんなテストでも区別できない（lessons-for-planning の「区別したい2つの実装が同じ答えを返す入力を選ばない」の裏返しで、そもそも区別できない実装対）。**区別できるのは「行を落とす実装」が入ったときだけ**なので、それは「行は1本も落とさない」のテストが押さえている

- [ ] **Step 7: 既存テストが落ちていないことを確認する**

`commands.ts` に `export` を足したので、全体を回す。

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

- [ ] **Step 8: コミット**

```bash
git add src/modules/sequence/markdown.ts src/modules/sequence/markdown.test.ts src/modules/sequence/commands.ts
git commit -m "feat(sequence): 図と表を1本にまとめた Markdown 出力を組み立てる"
```

---

### Task 4: `module.ts` への登録と `describeIssueEffect`

**Files:**
- Modify: `src/core/registry.ts`
- Modify: `src/modules/sequence/module.ts`
- Modify: `src/modules/sequence/module.test.ts`

**Interfaces:**
- Consumes: `sequenceToMarkdown`・`describeSequenceIssueEffect`（Task 3）
- Produces: `OutputProfile.describeIssueEffect?: (issues: readonly ConsistencyIssue[]) => string`（Task 5 が読む）／`sequenceModule.outputs` が1本

**額縁への登録は `module.ts` の `outputs` に1本足すだけで済むはず**（M6・M9・M10 で実証済み。額縁は `ExportMenu` がプロファイル1本のときドロップダウンを出さず2つのボタンをそのまま出す）。**`App.tsx` や `ExportMenu.tsx` に手を入れる必要が出たら、計画の誤りとして報告すること**（検証コマンドとその出力を添える）。

- [ ] **Step 1: `OutputProfile` に任意スロットを足す**

`src/core/registry.ts` の `OutputProfile` に追記（`ConsistencyIssue` は3行目で既に import 済み）:

```ts
  /**
   * 整合性エラー（レベル2の赤）があるまま出力しようとしたとき、
   * **出力に何が起きるか**を述べる1文。額縁の確認ダイアログが本文の末尾に足す。
   *
   * 何が起きるかはツールごとに違う（用語集の ID 重複と、シーケンスの参照切れでは
   * 出力に起きることが別）ので、額縁が文面を持てない。**任意スロットであり、
   * 持たないツールは汎用文だけになる**——モジュール規約の点数は増えない
   *（M9 が規約5 を複数プロファイルへ拡張したのと同じ層の拡張）
   */
  describeIssueEffect?: (issues: readonly ConsistencyIssue[]) => string
```

- [ ] **Step 2: 失敗するテストを書く**

`src/modules/sequence/module.test.ts` の `outputs` に関する既存の検証を探し、以下に差し替える（既存の「`outputs` は0本」を主張しているアサーションは**削除する**）:

```ts
  it('出力プロファイルは1本（図と表を1つの Markdown にまとめる）', () => {
    expect(sequenceModule.outputs).toHaveLength(1)
    expect(sequenceModule.outputs[0].id).toBe('default')
    expect(sequenceModule.outputs[0].fileSuffix).toBe('')
  })

  it('出力は h2 の見出し・Mermaid ブロック・表を含む', () => {
    const md = sequenceModule.outputs[0].toMarkdown({
      schemaVersion: 1,
      type: 'sequence',
      title: 'サンプル',
      actors: [
        { id: 'actor_Aaaaaaaaa1', name: '画面' },
        { id: 'actor_Aaaaaaaaa2', name: 'API' },
      ],
      steps: [
        { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: '注文', awaitsReply: true },
      ],
    })
    expect(md).toContain('## サンプル')
    expect(md).toContain('```mermaid')
    expect(md).toContain('| No | from → to |')
  })

  it('describeIssueEffect を持つ（額縁の確認ダイアログが使う）', () => {
    expect(sequenceModule.outputs[0].describeIssueEffect).toBeTypeOf('function')
  })
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run src/modules/sequence/module.test.ts`
Expected: FAIL（`outputs` が0本）

- [ ] **Step 4: 実装する**

`src/modules/sequence/module.ts` の `outputs` を差し替え、import を足す:

```ts
import { describeSequenceIssueEffect, sequenceToMarkdown } from './markdown'
```

```ts
  // 規約5: 図（Mermaid）と失敗考慮の表を1本の Markdown にまとめる（sequence M3）。
  // fileSuffix は ''（プロファイル1本なので用語集と同形。書き出し名は
  // <ファイル名>.md になる）
  outputs: [
    {
      id: 'default',
      label: 'Markdown',
      fileSuffix: '',
      toMarkdown: sequenceToMarkdown,
      describeIssueEffect: describeSequenceIssueEffect,
    },
  ],
```

`// zone は M2 で足す` というコメントが `idPrefixes` の上にあるので、**`// zone は M4 で足す` に直す**（ゾーンは M4 へ送ることが確定した）。

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run src/modules/sequence/module.test.ts`
Expected: PASS

- [ ] **Step 6: 全体を回す**

`outputs` が0本から1本になったことで、額縁のボタンが押せる状態に変わる。

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。**落ちたテストがあれば、それは「outputs が0本である」ことに依存していた検査**なので、内容を読んでから直すこと（機械的に期待値を書き換えない）

- [ ] **Step 7: コミット**

```bash
git add src/core/registry.ts src/modules/sequence/module.ts src/modules/sequence/module.test.ts
git commit -m "feat(sequence): 出力プロファイルを登録し describeIssueEffect の口を足す"
```

---

### Task 5: 額縁の確認ダイアログ（コア。4ツール共通）

**Files:**
- Modify: `src/core/app-controller.ts`
- Modify: `src/core/app-controller.test.ts`
- Modify: `src/components/ConfirmDialog.tsx`

**Interfaces:**
- Consumes: `OutputProfile.describeIssueEffect`（Task 4）／既存の `host.showModal` と `ModalRequest`（`kind: 'confirm'`）
- Produces: なし（`copyMarkdown` / `exportMarkdown` の外部シグネチャは不変）

**この変更は4ツール全部の出力経路に効く。** 「赤が出ているファイルをそのまま仕様書として配る」は用語集の ID 重複でも同じ問題であり、意図した範囲である。**未定義には出さない**——未定義は出力に `（未定義）` として残すのが既存の規約であり、正常な「まだ決めていない」状態だから。

- [ ] **Step 1: `ConfirmDialog` の改行を出せるようにする**

`src/components/ConfirmDialog.tsx` の `AlertDialogDescription` に `whitespace-pre-line` を足す:

```tsx
          <AlertDialogDescription className="whitespace-pre-line">
            {props.description}
          </AlertDialogDescription>
```

理由のコメントを JSDoc の末尾に1行足す:

```
 * `description` は改行を含みうる（出力前の確認が指摘を箇条書きで並べる）。
 * `<p>` は既定で改行を潰すので `whitespace-pre-line` を当てている
```

- [ ] **Step 2: 失敗するテストを書く**

`src/core/app-controller.test.ts` の `createHarness` に**モジュール差し替えの口**を足す（第3引数）。既存の呼び出しは引数2つのままなので影響しない:

```ts
function createHarness(
  initial: Record<string, string> = {},
  over: Partial<AppIo> = {},
  moduleOver: Partial<AnyToolModule> = {},
): Harness {
  ...
  registry.register(noteModule(moduleOver))
```

そのうえで、ファイル末尾に追記:

```ts
describe('出力: 整合性エラーがあるファイル', () => {
  const badIssue: ConsistencyIssue = {
    rule: 'duplicate-id',
    message: 'ノートの ID が重複しています: note_X',
    locations: [],
  }

  it('コピーは確認を挟み、承認するまでクリップボードへ書かない', async () => {
    const copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const h = createHarness(
      { [p('a.json')]: note('A', '本文') },
      { copyText },
      { checkConsistency: () => [badIssue] },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    expect(copyText).not.toHaveBeenCalled()
    expect(h.modals()).toHaveLength(1)

    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm を期待した')
    await request.onConfirm()
    expect(copyText).toHaveBeenCalledWith('## A\n\n本文\n')
  })

  it('確認の本文に指摘の件数と各メッセージが載る', async () => {
    const h = createHarness(
      { [p('a.json')]: note('A', '本文') },
      {},
      { checkConsistency: () => [badIssue] },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm を期待した')
    expect(request.description).toContain('1 件')
    expect(request.description).toContain('ノートの ID が重複しています: note_X')
  })

  it('describeIssueEffect を持つプロファイルは、その1文が本文の末尾に載る', async () => {
    const h = createHarness(
      { [p('a.json')]: note('A', '本文') },
      {},
      {
        checkConsistency: () => [badIssue],
        outputs: [
          {
            id: 'default',
            label: 'Markdown',
            fileSuffix: '',
            toMarkdown: () => '## A\n',
            describeIssueEffect: () => '図には「（未解決）」が立ちます。',
          },
        ],
      },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm を期待した')
    expect(request.description.endsWith('図には「（未解決）」が立ちます。')).toBe(true)
  })

  it('指摘が多いときは先頭5件だけ並べ、残りの件数を言う（黙って隠さない）', async () => {
    const many = Array.from({ length: 8 }, (_v, i): ConsistencyIssue => ({
      rule: 'duplicate-id',
      message: `指摘${i + 1}`,
      locations: [],
    }))
    const h = createHarness({ [p('a.json')]: note('A', '本文') }, {}, { checkConsistency: () => many })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm を期待した')
    expect(request.description).toContain('指摘5')
    expect(request.description).not.toContain('指摘6')
    expect(request.description).toContain('ほか 3 件')
  })

  it('書き出しも同じ確認を挟む', async () => {
    const askSavePath = vi.fn<() => Promise<string | null>>().mockResolvedValue(p('a.md'))
    const h = createHarness(
      { [p('a.json')]: note('A', '本文') },
      { askSavePath },
      { checkConsistency: () => [badIssue] },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.exportMarkdown(firstOutput(h))
    expect(askSavePath).not.toHaveBeenCalled()
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm を期待した')
    await request.onConfirm()
    expect(askSavePath).toHaveBeenCalled()
  })

  it('同じ操作を繰り返しても確認は積み上がらない（key で置き換える）', async () => {
    const h = createHarness({ [p('a.json')]: note('A', '本文') }, {}, { checkConsistency: () => [badIssue] })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    await h.controller.copyMarkdown(firstOutput(h))
    expect(h.modals()).toHaveLength(1)
  })
})

describe('出力: 整合性エラーが無いファイル', () => {
  it('確認を挟まずそのままコピーする（未定義があっても確認しない）', async () => {
    const copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    // note モジュールの checkConsistency は既定で [] を返す。
    // **未定義（空フィールド）は整合性エラーではない**——出力に（未定義）として
    // 残すのが規約であり、正常な「まだ決めていない」状態である
    const h = createHarness({ [p('a.json')]: note('A', '') }, { copyText })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    expect(h.modals()).toHaveLength(0)
    expect(copyText).toHaveBeenCalled()
  })
})
```

**注意:** `ConsistencyIssue` 型と `AnyToolModule` 型の import が必要なら足すこと。`DIR` / `p()` / `note()` / `firstOutput()` は既存のヘルパで、ファイル内の既存テストと同じ使い方をすること（見当たらない名前があれば**計画の矛盾として報告する**）。

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run src/core/app-controller.test.ts`
Expected: FAIL（確認が出ず、いきなり `copyText` が呼ばれる）

- [ ] **Step 4: 実装する**

`src/core/app-controller.ts` の `currentDocument()` に `issues` を足す:

```ts
    return { path: selectedPath, module, data, issues: entry.issues }
```

（戻り値の型注釈が明示されているなら `issues: ConsistencyIssue[]` を足す。`files` の各要素は `applyEdit` → `applyFiles` → `computeIssues` を通っているので、**編集中の内容に対する最新の指摘**が入っている。）

同ファイルに確認の組み立てを足す:

```ts
/** 確認ダイアログに並べる指摘の上限。**残りは件数で言う**——黙って隠さない */
const ISSUE_PREVIEW_LIMIT = 5

/**
 * 整合性エラー（レベル2の赤）があるまま出力しようとしたときの確認の本文。
 *
 * **未定義には出さない。** 未定義は出力に `（未定義）` として残すのが規約で、
 * 正常な「まだ決めていない」状態である。確認を挟むのは赤だけ
 */
function exportConfirmDescription(
  issues: readonly ConsistencyIssue[],
  profile: OutputProfile<unknown>,
): string {
  const shown = issues.slice(0, ISSUE_PREVIEW_LIMIT).map((i) => `・${i.message}`)
  const rest = issues.length - shown.length
  if (rest > 0) shown.push(`・ほか ${rest} 件`)
  const effect =
    profile.describeIssueEffect?.(issues) ??
    'このまま出力すると、指摘のある箇所もそのまま出力に含まれます。'
  return [`このファイルには整合性エラーが ${issues.length} 件あります。`, shown.join('\n'), effect].join(
    '\n\n',
  )
}
```

`copyMarkdown` / `exportMarkdown` を「確認の門」と「実処理」に割る:

```ts
  /**
   * 赤が出ているファイルの出力に確認を挟む（sequence M3。**4ツール共通**）。
   * 通してよければ run() を呼ぶ。key を固定して、押し直しで積み上がらないようにする
   */
  const guardIssues = (run: () => Promise<void>, profile: OutputProfile<unknown>): boolean => {
    const doc = currentDocument()
    if (doc === null || doc.issues.length === 0) return true
    host.showModal({
      kind: 'confirm',
      key: 'export',
      title: '整合性エラーのあるファイルを出力します',
      description: exportConfirmDescription(doc.issues, profile),
      confirmLabel: '出力する',
      onConfirm: run,
    })
    return false
  }

  const copyMarkdown = async (profile: OutputProfile<unknown>): Promise<void> => {
    if (!guardIssues(() => doCopyMarkdown(profile), profile)) return
    await doCopyMarkdown(profile)
  }

  const exportMarkdown = async (profile: OutputProfile<unknown>): Promise<void> => {
    if (!guardIssues(() => doExportMarkdown(profile), profile)) return
    await doExportMarkdown(profile)
  }
```

既存の `copyMarkdown` / `exportMarkdown` の本体は `doCopyMarkdown` / `doExportMarkdown` にリネームするだけで**中身は変えない**。`doCopyMarkdown` は先頭で `currentDocument()` を引き直すので、確認を押している間に編集が進んでも最新のデータが出る（`doExportMarkdown` が保存ダイアログの前後で同じことをしているのと同じ理由）。

**`guardIssues` と `doCopyMarkdown` / `doExportMarkdown` の宣言順に注意する。** `const` の関数式は巻き上がらないので、`copyMarkdown` より前に `doCopyMarkdown` を定義すること。

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run src/core/app-controller.test.ts`
Expected: PASS（このファイルの `it` がすべて緑）

- [ ] **Step 6: 実装を壊して落ちることを確認する**

`guardIssues` の `doc.issues.length === 0` を `true` に変える（＝常に通す）。

Run: `npx vitest run src/core/app-controller.test.ts`
Expected: FAIL（「コピーは確認を挟み…」が落ちる）。**確認したら元に戻す**

- [ ] **Step 7: 全体を回す**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑。**既存3ツール（用語集・エラーカタログ・logic-tree）の出力テストが落ちていないこと**を特に確認する

- [ ] **Step 8: コミット**

```bash
git add src/core/app-controller.ts src/core/app-controller.test.ts src/components/ConfirmDialog.tsx
git commit -m "feat(core): 赤が出ているファイルの出力に確認を挟む"
```

---

### Task 6: ポップアップ中のズーム停止（`useViewport` の `filter`）

**Files:**
- Modify: `src/modules/sequence/useViewport.ts`
- Modify: `src/modules/sequence/useViewport.dom.test.tsx`
- Modify: `src/modules/logic-tree/useViewport.ts`
- Modify: `src/modules/logic-tree/useViewport.dom.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: `useViewport(ref, enabled)` が `enabled: false` の間、ホイールもドラッグも受け付けない（Task 7・8 が依存する）

**2ファイルに同じ形で入れる。** `open-issues.md` の複製の項が「差分を作らない。直すときは両方を直す」と命じている。これは複製の解消ではなく、複製規約の遵守である。

- [ ] **Step 1: 失敗するテストを書く（sequence 側）**

このファイルの既存ハーネスは `Harness({ rect?, enabled? })` ／ 読み出しは `canvas()` と `read()` ／ ドラッグは**「Ctrl+ホイールとドラッグ」の `describe` の中で定義された `drag(el, init)`**（`sendMouse` が `event.view` を差し込む形。jsdom の都合）。**`drag` はその `describe` のスコープにしか無いので、ドラッグを使うテストは同じ `describe` の中に置くこと。**

ホイールの2本は、ファイル末尾に新しい `describe` を足して書く:

```tsx
describe('useViewport（enabled: モーダル・ポップアップ中の停止）', () => {
  it('enabled が false の間は Ctrl+ホイールでズームしない', () => {
    // rev 10章の境界規則。**キー監視だけでなく d3-zoom の filter も止める**——
    // 止めないと、Radix のポップアップが開いたままズームして位置がずれる
    //（Radix は scroll と resize は追うが transform の変化は追わない）
    render(<Harness enabled={false} />)
    fireEvent.wheel(canvas(), { deltaY: -100, ctrlKey: true })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })

  it('enabled を true に戻すとズームできる（最初の値で凍らせない）', () => {
    // **filter はマウント時に1回しか張らない。** enabled を素の値で閉じ込めると
    // 最初の値で凍り、モーダルを閉じてもキャンバスが死んだままになる
    const { rerender } = render(<Harness enabled={false} />)
    rerender(<Harness enabled />)
    fireEvent.wheel(canvas(), { deltaY: -100, ctrlKey: true })
    expect(read().k).toBeCloseTo(ONE_NOTCH, 5)
  })
})
```

ドラッグの1本は、**`drag` が定義されている既存の `describe` の中**（「中ボタンのドラッグでパンする」の隣）に足す:

```tsx
  it('enabled が false の間は中ボタンドラッグでもパンしない', () => {
    render(<Harness enabled={false} />)
    drag(canvas(), { button: 1 })
    expect(read()).toEqual(INITIAL_TRANSFORM)
  })
```

2本目が要るのは、`filter` をマウント時に1回しか張らないため——`enabled` を素の値で読むと**最初の値で凍る**。ref 経由で読んでいることをここで固定する。

**上記のハーネス名・ヘルパ名が実ファイルと違っていたら、実ファイルに合わせたうえで計画の矛盾として報告すること**（検証コマンドとその出力を添える）。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/modules/sequence/useViewport.dom.test.tsx`
Expected: FAIL（`enabled: false` でもズームする）

- [ ] **Step 3: 実装する（sequence 側）**

`src/modules/sequence/useViewport.ts`:

```ts
  const spaceHeldRef = useRef(false)
  // **d3 のハンドラはマウント時に1回しか張らない**ので、filter が読む enabled も
  // ref に写す。素の値を閉じ込めると最初の値で凍り、モーダルを閉じても
  // 止まったままになる（spaceHeldRef と同じ理由）
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
```

`filter` の先頭に1行:

```ts
      .filter((event: Event) => {
        // モーダル・ポップアップが開いている間はキャンバスの操作言語を止める
        //（rev 10章の境界規則）。**キー監視だけでは足りない**——ホイールと
        // ドラッグは d3 が直接取るので、ここで弾かないと裏で視点が動く
        if (!enabledRef.current) return false
        if (event.type === 'wheel') {
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/sequence/useViewport.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: logic-tree 側に同じ形で入れる**

`src/modules/logic-tree/useViewport.ts` に **Step 3 と同一のコード**（`enabledRef` の宣言と `filter` 先頭の1行、コメント込み）を入れ、`src/modules/logic-tree/useViewport.dom.test.tsx` に **Step 1 と同じ3本**のテストを（そのファイルのハーネスの作法に合わせて）足す。`useViewport.dom.test.tsx` も複製なので、ハーネスは同じ形のはずである。

Run: `npx vitest run src/modules/logic-tree/useViewport.dom.test.tsx`
Expected: PASS

- [ ] **Step 6: 2ファイルの差分がコメント以外で一致することを確認する**

```bash
git diff --no-index src/modules/logic-tree/useViewport.ts src/modules/sequence/useViewport.ts
git diff --no-index src/modules/logic-tree/useViewport.dom.test.tsx src/modules/sequence/useViewport.dom.test.tsx
```

Expected: 差分は sequence 側の先頭にある複製注記コメント（3行）のみ。**それ以外の差があれば、この変更で複製に差分を作ってしまったということなので直す**（`open-issues.md`「差分を作らない。直すときは両方を直す」）

- [ ] **Step 7: 全体を回す**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

- [ ] **Step 8: コミット**

```bash
git add src/modules/sequence/useViewport.ts src/modules/sequence/useViewport.dom.test.tsx src/modules/logic-tree/useViewport.ts src/modules/logic-tree/useViewport.dom.test.tsx
git commit -m "fix(canvas): モーダル中に d3-zoom がホイールとドラッグを取るのを止める"
```

---

### Task 7: 種別セルの `DropdownMenu` 化

**Files:**
- Modify: `src/modules/sequence/StepShapeCell.tsx`
- Modify: `src/modules/sequence/StepShapeCell.dom.test.tsx`
- Modify: `src/modules/sequence/SequenceEditor.tsx`

**Interfaces:**
- Consumes: `useViewport` の `enabled`（Task 6）／既存の `DropdownMenu` 系（`@/components/ui/dropdown-menu`）／`STEP_SHAPE_ORDER`・`STEP_SHAPE_LABEL`（既存 `./commands`）
- Produces: `StepShapeCellProps` に `onOpenChange?: (open: boolean) => void` が加わる（Task 8 が同じ形を使う）

**M2 の決定を1つ上書きする。** M2 で入れた「形セルのクリック切替」は、クリックが「開く」になるので消える。4値に対して最大3クリックが1クリックになる上位互換だが、1マイルストーン前の決定の反転なので Task 12 の申し送りに明記する。**`↑↓` の巡回はキーボード側にそのまま残す。**

**同じ打鍵を2つの経路が取り合う。** Radix の `DropdownMenuTrigger` は `Enter` / `Space` / `↓` でメニューを開く。これは本セルの契約（`↑↓`＝4値の巡回、`Enter`＝ステップ追加）と正面から衝突する。**トリガーはポインタでだけ開く**——`onKeyDown` で当該キーに `preventDefault()` を呼び、Radix の内部ハンドラ（`composeEventHandlers` が `defaultPrevented` を見て降りる）を止める。この抑止を外すと、`Enter` がステップ追加ではなくメニュー開きになる。

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/sequence/StepShapeCell.dom.test.tsx` の既存2本——`クリックで形が1歩進む（↓ と同じ巡回）` と `末尾の形のクリックは先頭に戻る`——を**削除**し、以下を追記する:

```tsx
  it('クリックでメニューが開き、選んだ形になる', async () => {
    const onChange = vi.fn()
    render(
      <StepShapeCell value="call-sync" aria-label="ステップ1の形" data-cell="k:shape" onChange={onChange} />,
    )
    // Radix のトリガーは pointerdown で開く（ExportMenu の DOM テストと同じ作法）
    fireEvent.pointerDown(screen.getByLabelText('ステップ1の形'), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: '内部処理' }))
    expect(onChange).toHaveBeenCalledWith('self')
  })

  it('メニューには4値すべてが出る', async () => {
    render(
      <StepShapeCell value="call-sync" aria-label="ステップ1の形" data-cell="k:shape" onChange={() => {}} />,
    )
    fireEvent.pointerDown(screen.getByLabelText('ステップ1の形'), { button: 0, ctrlKey: false })
    await screen.findByRole('menuitem', { name: '呼出' })
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      '呼出',
      '呼出（応答なし）',
      '応答',
      '内部処理',
    ])
  })

  it('開閉を onOpenChange で伝える（キャンバスのズームを止めるため）', async () => {
    const onOpenChange = vi.fn()
    render(
      <StepShapeCell
        value="call-sync"
        aria-label="ステップ1の形"
        data-cell="k:shape"
        onChange={() => {}}
        onOpenChange={onOpenChange}
      />,
    )
    fireEvent.pointerDown(screen.getByLabelText('ステップ1の形'), { button: 0, ctrlKey: false })
    await screen.findByRole('menuitem', { name: '呼出' })
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('↓ は巡回のままで、メニューを開かない（キーボード動線を変えない）', () => {
    const onChange = vi.fn()
    render(
      <StepShapeCell value="call-sync" aria-label="ステップ1の形" data-cell="k:shape" onChange={onChange} />,
    )
    fireEvent.keyDown(screen.getByLabelText('ステップ1の形'), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith('call-async')
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('Enter はメニューを開かず onFieldKeyDown へ委譲する（ステップ追加の経路を塞がない）', () => {
    const onFieldKeyDown = vi.fn()
    render(
      <StepShapeCell
        value="call-sync"
        aria-label="ステップ1の形"
        data-cell="k:shape"
        onChange={() => {}}
        onFieldKeyDown={onFieldKeyDown}
      />,
    )
    fireEvent.keyDown(screen.getByLabelText('ステップ1の形'), { key: 'Enter' })
    expect(onFieldKeyDown).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menuitem')).toBeNull()
  })
```

既存の `現在の形をラベルで表示する` / `↓ で次、↑ で前の形` / `self から ↓ で先頭へ回り込む` / `Alt+↓ は形を変えず、onFieldKeyDown へ委譲する` の4本は**そのまま残す**（キーボード動線を変えていないことの証拠）。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/modules/sequence/StepShapeCell.dom.test.tsx`
Expected: FAIL（メニューが出ない）

- [ ] **Step 3: 実装する**

`src/modules/sequence/StepShapeCell.tsx` を差し替える:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { STEP_SHAPE_LABEL, STEP_SHAPE_ORDER, type StepShapeValue } from './commands'

export interface StepShapeCellProps {
  value: StepShapeValue
  'aria-label': string
  'data-cell': string
  onChange: (next: StepShapeValue) => void
  /** メニューの開閉。開いている間キャンバスのズーム・パンを止めるために親が使う */
  onOpenChange?: (open: boolean) => void
  onFieldKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * kind × awaitsReply の1セル。データは2フィールドだが、画面は
 * 「呼出／呼出（応答なし）／応答／内部処理」の4値1セル。
 *
 * **マウスはメニュー、キーボードは ↑↓ の巡回**（sequence M3）。M2 で入れた
 * クリック巡回は、クリックが「開く」になるので消えた——4値に対して最大3クリックが
 * 1クリックになる上位互換である。
 *
 * ネイティブの `select` にしないのは、ブラウザ既定のドロップダウンが
 * キャンバスの transform を無視して出るため。Radix は portal ＋ anchor の
 * `getBoundingClientRect` で画面座標に出すので、transform 下でも位置が合い、
 * ズームで拡大縮小もしない（等倍で読める側に倒れる）
 */
export function StepShapeCell(props: StepShapeCellProps) {
  const cycle = (delta: -1 | 1): void => {
    const at = STEP_SHAPE_ORDER.indexOf(props.value)
    const next = (at + delta + STEP_SHAPE_ORDER.length) % STEP_SHAPE_ORDER.length
    props.onChange(STEP_SHAPE_ORDER[next])
  }
  return (
    <DropdownMenu onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger
        type="button"
        className="w-full rounded-sm border border-rule bg-surface px-1.5 py-0.5 text-left text-sm text-ink-muted outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
        aria-label={props['aria-label']}
        data-cell={props['data-cell']}
        onKeyDown={(e) => {
          // 修飾キー付きの矢印は操作言語のもの（Alt+↑↓＝並び替え）。素の ↑↓ だけが循環
          if (
            (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
            !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
          ) {
            // **preventDefault が Radix の「↓ で開く」を止めている。**
            // Radix の Trigger は composeEventHandlers(props.onKeyDown, 内部) の形で
            // 組んでおり、ここで defaultPrevented を立てると内部ハンドラが降りる。
            // 外すと ↓ が巡回ではなくメニュー開きになる
            e.preventDefault()
            cycle(e.key === 'ArrowUp' ? -1 : 1)
            return
          }
          // Enter / Space も Radix はメニューを開くキーとして取る。**トリガーは
          // ポインタでだけ開く**——Enter はステップ追加（操作言語）であり、
          // 開かれるとキーボードの動線が M2 までと変わってしまう
          if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
          props.onFieldKeyDown?.(e)
        }}
      >
        {STEP_SHAPE_LABEL[props.value]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {STEP_SHAPE_ORDER.map((shape) => (
          <DropdownMenuItem key={shape} onSelect={() => props.onChange(shape)}>
            {STEP_SHAPE_LABEL[shape]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4: メニューの開閉をキャンバスへつなぐ**

`src/modules/sequence/SequenceEditor.tsx`:

(a) 状態を1つ足す（`confirmTarget` の宣言の近く）:

```tsx
  // セルのドロップダウンが開いている間はキャンバスを止める。**Radix は
  // transform の変化を追わない**ので、開いたままズームすると位置がずれる
  const [menuOpen, setMenuOpen] = useState(false)
```

(b) `anyModalOpen` に混ぜる（210行目付近）:

```tsx
  // 額縁由来の modalOpen と OR を取る——どれか一つが開いていれば止まる
  const anyModalOpen = modalOpen || confirmTarget !== null || menuOpen
```

(c) `StepShapeCell` に渡す（894行目付近）:

```tsx
                  onOpenChange={setMenuOpen}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run src/modules/sequence/StepShapeCell.dom.test.tsx src/modules/sequence/SequenceEditor.dom.test.tsx`
Expected: PASS（両ファイルの `it` がすべて緑）

`SequenceEditor.dom.test.tsx` の `形セルからの Alt+↓ でもステップが並び替わる` と `形セルからの Alt+↓ の後、フォーカスは動かした行の形に残る` が**変更なしで緑**であることが、キーボード動線を壊していないことの証拠になる。落ちたら実装を直すこと（テストを直さない）。

- [ ] **Step 6: 実装を壊して落ちることを確認する**

`onKeyDown` の `if (e.key === 'Enter' || e.key === ' ') e.preventDefault()` を消す。

Run: `npx vitest run src/modules/sequence/StepShapeCell.dom.test.tsx`
Expected: FAIL（「Enter はメニューを開かず…」が落ちる）。**確認したら元に戻す**

- [ ] **Step 7: 全体を回す**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

- [ ] **Step 8: コミット**

```bash
git add src/modules/sequence/StepShapeCell.tsx src/modules/sequence/StepShapeCell.dom.test.tsx src/modules/sequence/SequenceEditor.tsx
git commit -m "feat(sequence): 種別セルをドロップダウンにする"
```

---

### Task 8: from / to を選択専用ドロップダウンへ

**Files:**
- Modify: `src/modules/sequence/ActorRefCell.tsx`
- Modify: `src/modules/sequence/ActorRefCell.dom.test.tsx`
- Modify: `src/modules/sequence/SequenceEditor.tsx`
- Modify: `src/modules/sequence/SequenceEditor.dom.test.tsx`
- Modify: `src/modules/sequence/commands.ts`（`createActorAndAssign` を削除）
- Modify: `src/modules/sequence/commands.test.ts`（同関数のテストを削除）

**Interfaces:**
- Consumes: Task 7 と同じ `DropdownMenu` の作法／`onOpenChange` の形／`UNRESOLVED_ACTOR_LABEL`（Task 1）
- Produces: `ActorRefCellProps` から `onCreate` が消え、`onFieldKeyDown` の第2引数（`FieldState`）も消える

**M1 の確定事項2件の反転である**（design-notes 論点9 と `sequence-m1-scope.md` の「頭文字のインクリメンタル一致＋未登録名の確定でその場で `actors` に追加」）。根拠は実使用の観察——補完の出番が少なく、参加者をその場で作る必要も感じられなかった。M1 の実機確認チェックリスト自体が「『決』＋Enter で参加者『決』ができる挙動」を危険として見に行っており、観察と整合する。

副次的に、`normalizeForMatch` への依存と、`Enter` の二重経路（lessons-for-planning に教訓として記録されている、`commit()` と `insert-item-after` の取り合い）が構造ごと消える。**教訓の記録そのものは書き換えないこと。**

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/sequence/ActorRefCell.dom.test.tsx` を**丸ごと差し替える**:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActorRefCell } from './ActorRefCell'

afterEach(cleanup)

const actors = [
  { id: 'actor_Aaaaaaaaa1', name: '画面' },
  { id: 'actor_Aaaaaaaaa2', name: 'API' },
  { id: 'actor_Aaaaaaaaa3', name: '決済' },
]

function setup(over: Partial<Parameters<typeof ActorRefCell>[0]> = {}) {
  const onSelect = vi.fn()
  const onFieldKeyDown = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <ActorRefCell
      value="actor_Aaaaaaaaa2"
      actors={actors}
      invalid={false}
      aria-label="送り手"
      data-cell="s1:from"
      onSelect={onSelect}
      onOpenChange={onOpenChange}
      onFieldKeyDown={onFieldKeyDown}
      {...over}
    />,
  )
  return { onSelect, onFieldKeyDown, onOpenChange, cell: screen.getByLabelText('送り手') }
}

describe('ActorRefCell: 表示', () => {
  it('参照先の名前を表示する', () => {
    expect(setup().cell.textContent).toBe('API')
  })

  it('参照切れは（未解決）と表示する（空のボタンは押す場所が見えない）', () => {
    expect(setup({ value: undefined, invalid: true }).cell.textContent).toBe('（未解決）')
  })

  it('名前が空の参加者を指しているときも（未解決）にはしない（参照は引けている）', () => {
    const { cell } = setup({
      value: 'actor_Aaaaaaaaa9',
      actors: [{ id: 'actor_Aaaaaaaaa9', name: '' }],
    })
    expect(cell.textContent).not.toBe('（未解決）')
  })
})

describe('ActorRefCell: キーボード（M2 までと同じ）', () => {
  it('↑↓ で actors 配列順に即時切替する（3人の真ん中から両方向）', () => {
    const { onSelect, cell } = setup()
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa3')
    fireEvent.keyDown(cell, { key: 'ArrowUp' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa1')
  })

  it('端では回り込む（末尾で↓→先頭）', () => {
    const { onSelect, cell } = setup({ value: 'actor_Aaaaaaaaa3' })
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa1')
  })

  it('↓ はメニューを開かない', () => {
    const { cell } = setup()
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('Alt+↓ は候補を切り替えず、onFieldKeyDown へ委譲する', () => {
    // 参加者3人のフィクスチャで検査する——2人だと「切替が起きない」と
    // 「委譲された」の区別が実装によっては付かない
    const { onSelect, onFieldKeyDown, cell } = setup()
    fireEvent.keyDown(cell, { key: 'ArrowDown', altKey: true })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onFieldKeyDown).toHaveBeenCalledOnce()
  })

  it('Enter はメニューを開かず onFieldKeyDown へ委譲する（ステップ追加の経路）', () => {
    const { onFieldKeyDown, cell } = setup()
    fireEvent.keyDown(cell, { key: 'Enter' })
    expect(onFieldKeyDown).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('参加者が0人のときの ↑↓ は何も起こさない', () => {
    const { onSelect, cell } = setup({ actors: [], value: undefined })
    fireEvent.keyDown(cell, { key: 'ArrowDown' })
    expect(onSelect).not.toHaveBeenCalled()
  })
})

describe('ActorRefCell: マウス', () => {
  it('クリックで参加者の一覧が開き、選ぶと onSelect', async () => {
    const { onSelect, cell } = setup()
    fireEvent.pointerDown(cell, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: '決済' }))
    expect(onSelect).toHaveBeenCalledWith('actor_Aaaaaaaaa3')
  })

  it('一覧は actors の配列順（横の並びと同じ順で選べる）', async () => {
    const { cell } = setup()
    fireEvent.pointerDown(cell, { button: 0, ctrlKey: false })
    await screen.findByRole('menuitem', { name: '画面' })
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      '画面',
      'API',
      '決済',
    ])
  })

  it('開閉を onOpenChange で伝える', async () => {
    const { cell, onOpenChange } = setup()
    fireEvent.pointerDown(cell, { button: 0, ctrlKey: false })
    await screen.findByRole('menuitem', { name: '画面' })
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/modules/sequence/ActorRefCell.dom.test.tsx`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/modules/sequence/ActorRefCell.tsx` を差し替える:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UNRESOLVED_ACTOR_LABEL } from './output-labels'

export interface ActorRefCellProps {
  value: string | undefined
  actors: readonly { id: string; name: string }[]
  invalid: boolean
  'aria-label': string
  'data-cell': string
  onSelect: (actorId: string) => void
  /** メニューの開閉。開いている間キャンバスのズーム・パンを止めるために親が使う */
  onOpenChange?: (open: boolean) => void
  onFieldKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * from / to の参加者参照セル（sequence M3 で選択専用にした）。
 *
 * **マウスはメニュー、キーボードは ↑↓ の即時切替。** M1 の「頭文字の
 * インクリメンタル一致＋未登録名の確定でその場で `actors` に追加」は、
 * 実使用の観察（補完の出番が少なく、その場で参加者を作る必要も無かった）を
 * 受けて外した。M1 の実機確認チェックリスト自体が「『決』＋Enter で参加者
 *『決』ができる挙動」を危険として見に行っていたのと整合する。
 *
 * 参加者の追加は、ヘッダの `Enter` とツールバーの「参加者を追加」の2本になった。
 *
 * 参照切れを空表示にしない——ボタンなので、空だと押す場所が見えなくなる。
 * 出力と同じ「（未解決）」の語を使う
 */
export function ActorRefCell(props: ActorRefCellProps) {
  const resolved = props.actors.find((a) => a.id === props.value)
  const cycle = (delta: -1 | 1): void => {
    if (props.actors.length === 0) return
    const at = props.actors.findIndex((a) => a.id === props.value)
    const next = (at + delta + props.actors.length) % props.actors.length
    props.onSelect(props.actors[next].id)
  }
  const face = props.invalid ? 'border-warning bg-warning/20' : 'border-rule bg-surface'
  return (
    <DropdownMenu onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger
        type="button"
        className={`w-full truncate rounded-sm border px-1.5 py-0.5 text-left text-sm text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring ${face}`}
        aria-label={props['aria-label']}
        data-cell={props['data-cell']}
        onKeyDown={(e) => {
          if (
            (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
            !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
          ) {
            // preventDefault が Radix の「↓ で開く」を止めている（StepShapeCell と同じ理由）
            e.preventDefault()
            cycle(e.key === 'ArrowUp' ? -1 : 1)
            return
          }
          // Enter / Space でもメニューを開かない。**トリガーはポインタでだけ開く**
          if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
          props.onFieldKeyDown?.(e)
        }}
      >
        {resolved === undefined ? UNRESOLVED_ACTOR_LABEL : resolved.name}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.actors.map((actor) => (
          <DropdownMenuItem key={actor.id} onSelect={() => props.onSelect(actor.id)}>
            {actor.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 4: エディタ側を合わせる**

`src/modules/sequence/SequenceEditor.tsx`:

(a) `onRefKeyDown` の `FieldState` 引数を落とし、`onShapeKeyDown` と同じ形にする:

```tsx
  const onRefKeyDown = (e: React.KeyboardEvent, index: number, field: 'from' | 'to'): void => {
    handleKey(e, { kind: 'ref', index, field }, {
      // 選択専用のボタンであって文字を編集する欄ではない（sequence M3）
      editing: false,
      fieldEmpty: false,
      // **参照セルの Backspace で行を消さない。** M2 までと同じ判断
      deletableField: false,
      caretAtStart: false,
      caretAtEnd: false,
      // ↑↓ は候補の切替に使う（ActorRefCell が自前で処理する）。
      // Alt+↑↓ は resolveCommand が arrowsOwnedByField より先に判定するため、
      // これが true でも並び替えは通る（部品側が修飾キー付き矢印を委譲する）
      arrowsOwnedByField: true,
      reorderEnabled: true,
      hierarchical: false,
      horizontal: false,
    })
  }
```

(b) 2箇所の `<ActorRefCell>` から `onCreate` を消し、`onOpenChange={setMenuOpen}` を足し、`onFieldKeyDown` を新シグネチャに合わせる:

```tsx
                  onSelect={(actorId) => onChange(setStepActor(data, index, 'from', actorId), null)}
                  onOpenChange={setMenuOpen}
                  onFieldKeyDown={(e) => onRefKeyDown(e, index, 'from')}
```

（`to` 側も同じ形。`'from'` を `'to'` に置き換える）

(c) import から `createActorAndAssign` を消す。

- [ ] **Step 5: `createActorAndAssign` を削除する**

`src/modules/sequence/commands.ts` から `createActorAndAssign`（177行目付近）とその JSDoc を削除する。`src/modules/sequence/commands.test.ts` から同関数の `describe` / `it` を削除する。

**`setStepActor` は残す**（`onSelect` が使う）。

- [ ] **Step 6: エディタの DOM テストを直す**

`src/modules/sequence/SequenceEditor.dom.test.tsx` の `未登録名を打っての Enter は参加者を足すだけ（ステップは増えない）`（328行目付近）を**削除**する。インライン作成の経路が無くなったため。

`送り手セルからの Alt+↓ でもステップが並び替わる` と `from セルからの Alt+↓ の後、フォーカスは動かした行の from に残る` は**変更せずに緑であること**を確認する（キーボード動線を壊していないことの証拠）。落ちたら実装を直す。

`DOM 順（＝Tab 順）はレールの視覚順: from → to → 種別 → ラベル → 答え` も**変更せずに緑であること**。`data-cell` は保っているので通るはず。

- [ ] **Step 7: テストが通ることを確認する**

Run: `npx vitest run src/modules/sequence/`
Expected: PASS（sequence 配下の `it` がすべて緑）

- [ ] **Step 8: 実装を壊して落ちることを確認する**

`ActorRefCell` の `cycle` で `props.actors.length === 0` の早期 return を消す。

Run: `npx vitest run src/modules/sequence/ActorRefCell.dom.test.tsx`
Expected: FAIL（「参加者が0人のときの ↑↓ は何も起こさない」が落ちる）。**確認したら元に戻す**

- [ ] **Step 9: 全体を回す**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

- [ ] **Step 10: コミット**

```bash
git add src/modules/sequence/ActorRefCell.tsx src/modules/sequence/ActorRefCell.dom.test.tsx src/modules/sequence/SequenceEditor.tsx src/modules/sequence/SequenceEditor.dom.test.tsx src/modules/sequence/commands.ts src/modules/sequence/commands.test.ts
git commit -m "feat(sequence): from/to を選択専用のドロップダウンにする"
```

---

### Task 9: 「参加者を追加」ボタン

**Files:**
- Modify: `src/modules/sequence/SequenceEditor.tsx`
- Modify: `src/modules/sequence/SequenceEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `addActorAfter`（既存 `./commands`。既に import 済み）
- Produces: なし

Task 8 でインライン作成を外したので、**マウスだけの人が2人目以降の参加者を作る手段がゼロになっている**。参加者を作る経路は「空状態の『クリックして開始』（最初の1人）」と「ヘッダで `Enter`（キーボードのみ）」の2本しかない。M3 はマウスの回なので、ここが空いたまま出てはならない。

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/sequence/SequenceEditor.dom.test.tsx` の「空状態」または参加者まわりの `describe` に追記:

```tsx
  it('参加者がいるとき「参加者を追加」ボタンが出て、末尾に1人増える', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: '参加者を追加' }))
    expect(last(onChange).actors).toHaveLength(4)
    expect(last(onChange).actors[3].name).toBe('')
  })

  it('「参加者を追加」ボタンは既存の参加者を1人も動かさない', () => {
    // **末尾に足す**（途中に差し込まない）。配列順＝横の並びの正本なので、
    // 差し込むと既存のステップの見え方が動く
    const before = doc().actors
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: '参加者を追加' }))
    expect(last(onChange).actors.slice(0, 3).map((a) => a.id)).toEqual(before.map((a) => a.id))
  })

  it('「参加者を追加」ボタンで新しい参加者の名前欄にフォーカスが移る', () => {
    // ボタン経路のフォーカスを固定する（M2 の最終レビューが「ステップを追加」
    // ボタンで同じ穴を見つけている——キー経路だけ固定してボタン経路を放置しない）
    render(<Harness initial={doc()} />)
    fireEvent.click(screen.getByRole('button', { name: '参加者を追加' }))
    expect(document.activeElement?.getAttribute('aria-label')).toBe('参加者4の名前')
  })

  it('参加者が0人のときは「参加者を追加」ボタンを出さない（「クリックして開始」が入口）', () => {
    setup({ ...doc(), actors: [], steps: [] })
    expect(screen.queryByRole('button', { name: '参加者を追加' })).toBeNull()
  })
```

**`aria-label` の文言は実装に合わせること。** 参加者名セルの `aria-label` が `参加者Nの名前` でなければ、実装側の実際の文言に直す（`SequenceEditor.tsx` のヘッダ描画箇所を読んで確認する）。**違っていたら計画の矛盾として報告する。**

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run src/modules/sequence/SequenceEditor.dom.test.tsx`
Expected: FAIL（ボタンが無い）

- [ ] **Step 3: 実装する**

`src/modules/sequence/SequenceEditor.tsx` の「ステップを追加」ボタン（677行目付近）の直後に足す:

```tsx
        {data.actors.length > 0 && (
          <button
            type="button"
            className={`${buttonBase} pointer-events-auto m-2 border border-rule bg-surface px-3 py-1 text-sm text-ink hover:bg-canvas`}
            onClick={() => apply(addActorAfter(data, data.actors.length - 1))}
          >
            参加者を追加
          </button>
        )}
```

**マウスだけの人の唯一の参加者追加手段である**（sequence M3 で from/to のインライン作成を外したため）というコメントを1行添える。

2つのボタンが縦に積まれると帯が高くなるので、**既存の「ステップを追加」ボタンと同じ行に並べる**。両ボタンを `<div className="pointer-events-none m-2 flex gap-2">` で包み、各ボタンの `m-2` を外して `pointer-events-auto` は残す形にすること。包んだ後も「ステップを追加」ボタンの既存テスト（`参加者がいてステップ0件なら「ステップを追加」ボタンが出る` / `「ステップを追加」ボタンで新ステップの from にフォーカスが移る`）が**変更なしで緑**であることを確認する。

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run src/modules/sequence/SequenceEditor.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: 実装を壊して落ちることを確認する**

`apply(addActorAfter(data, data.actors.length - 1))` を `apply(addActorAfter(data, 0))` に変える。

Run: `npx vitest run src/modules/sequence/SequenceEditor.dom.test.tsx`
Expected: FAIL（「既存の参加者を1人も動かさない」が落ちる）。**確認したら元に戻す**

- [ ] **Step 6: 全体を回す**

Run: `npm test && npx tsc -b && npm run lint`
Expected: すべて緑

- [ ] **Step 7: コミット**

```bash
git add src/modules/sequence/SequenceEditor.tsx src/modules/sequence/SequenceEditor.dom.test.tsx
git commit -m "feat(sequence): 参加者を追加するボタンを足す"
```

---

### Task 10: 機械検査の確認と全体検証

**Files:**
- Modify: なし（確認のみ。必要なら検査側を直す）

**Interfaces:**
- Consumes: Task 1–9 の成果物すべて
- Produces: なし

**新しいツール・新しい種類のコンポーネントを足す計画には、既存の機械検査がそれを走査対象に含むかを確かめる手順を1つ入れる**（lessons-for-planning。同じ穴が2回続いている）。

- [ ] **Step 1: `palette.test.ts` の走査母集合を確認する**

`src/styles/palette.test.ts` の `MODULES_DIR` から `readdirSync` で歩く部分（294行目付近）を読み、**`src/modules/` 配下の `.tsx` を再帰的に全部拾っている**ことを確認する。本タスク時点で新設した `.tsx` は無い（`output-labels.ts` / `mermaid.ts` / `markdown.ts` はいずれも `.ts`）が、`ActorRefCell.tsx` と `StepShapeCell.tsx` の**クラス名が変わっている**ので、検査対象として実際に読まれていることを確かめる。

確認コマンド:

```bash
npx vitest run src/styles/palette.test.ts
```

Expected: PASS。落ちたら**検査が正しく、実装のクラス名が規約から外れている**——`bg-warning/20` などの半透明の濃さを勝手に変えていないか確認すること（`ActorRefCell` の `face` は M2 までと同じ値を保っている）

- [ ] **Step 2: `conventions.test.ts` の走査母集合を確認する**

`palette.test.ts` のコメントが参照している `conventions.test.ts` の `sourceFiles()` を読み、新設した3本の `.ts` が対象に入ることを確認する。

```bash
npx vitest run src/**/conventions.test.ts
```

（パスが違う場合は `git ls-files | grep conventions` で探すこと）
Expected: PASS

- [ ] **Step 3: 新しい `aria-label` が既存の前方一致クエリと衝突しないか確認する**

Task 9 で「参加者を追加」というアクセシブル名が増えた。**その名前で始まる既存クエリを grep する**（lessons-for-planning）:

```bash
git grep -n "参加者" -- "src/**/*.test.tsx" "src/**/*.tsx"
```

Expected: `getByLabelText(/^参加者/)` のような前方一致で新ボタンを巻き込んでいる箇所が無いこと。あれば**既存テストの正規表現を絞る**（新しい文言が確定事項なので、直すのはテストの側）

- [ ] **Step 4: 生成 CSS を確認する**

Task 7・8 で Radix のポップアップ（`DropdownMenuContent`）がキャンバス内から出るようになった。`z-50` と portal の組み合わせで、額縁の帯（`z-10`）やトーストの下に潜っていないかは**生成 CSS とビルドを見るまで検証したことにならない**（lessons-for-planning）。

```bash
npx vite build
```

Expected: 成功すること。生成された CSS に `z-50` が出ていることを確認する（実際の重なりは Task 11 の実機確認で見る）

- [ ] **Step 5: 全体検証**

```bash
npm test
npx tsc -b
npm run lint
npx vite build
```

Expected: 4つとも緑

- [ ] **Step 6: 実機確認の痕跡が無いことを確認する**

```bash
git status --short
```

Expected: 空。`sample-project/` に編集が残っていたら `git checkout -- sample-project/ && git clean -fd sample-project/`（CLAUDE.md）

- [ ] **Step 7: コミット（検査側を直した場合のみ）**

直すものが無ければコミットしない。直した場合:

```bash
git add <直したファイル>
git commit -m "test: 機械検査が sequence M3 の新しい部品を走査することを確かめる"
```

---

### Task 11: 実機確認（**人間の作業**）

**Files:** なし

**サブエージェントは GUI を操作できない**（lessons-for-planning）。このタスクは人間が `npm run tauri dev` で実施する。**Task 12 の申し送りには、このタスクが終わるまで「未実施」と明記し、チェックリストを空のまま残すこと。**

- [ ] **Step 1: アプリを起動して `sample-project` を開く**

```bash
npm run tauri dev
```

- [ ] **Step 2: チェックリストを順に確認する**

**先頭の2項目が崩れたら設計に戻る。** Radix の portal が transform 下の anchor をどう扱うかは、この環境では実物でしか確かめられない（M1 の「ライブラリの既定値は実物で確かめる」の教訓）。

- [ ] **ズーム 0.4x の状態で、from / to / 種別のドロップダウンが正しい位置に等倍で出る**
- [ ] **ズーム 2.5x の状態でも同じ**（崩れていたら `Popover` ＋ listbox への差し戻しを検討する。**この場で直さず、観察を記録して報告する**）
- [ ] ドロップダウンを開いている間、`Ctrl+ホイール` でキャンバスが動かない。閉じると動く
- [ ] ドロップダウンがガター・額縁の帯・トーストの下に潜らない
- [ ] logic-tree でも、モーダル（ファイル削除の確認）を開いている間 `Ctrl+ホイール` でキャンバスが動かない
- [ ] from / to をクリックして参加者を選べる。3人以上いても一覧で選べる
- [ ] 種別をクリックして4値から選べる（1クリックで目的の値に届く）
- [ ] **`↑↓` の即時切替が M2 までと同じに動く**（from / to / 種別のすべて）
- [ ] **`Enter` でステップが増える。`Alt+↑↓` で並び替わる。日本語変換確定の `Enter` で誤爆しない**（M1 の最重要項目の回帰）
- [ ] 「参加者を追加」ボタンで参加者が末尾に増え、名前欄にフォーカスが来る
- [ ] マウスだけで、参加者3人・ステップ3本のシーケンスを一通り作れる
- [ ] 「Markdown をコピー」を押して NotePM（または Mermaid が描ける場所）に貼る → **図が描画され、表が読める**
- [ ] 表の `No` が画面のガターの行見出し `#N` と一致している
- [ ] 立っていない問いのセルが空で、未回答が `（未定義）`、`notApplicable` が `─ 考慮不要` になっている
- [ ] `from` を参照切れにする（外部エディタで JSON を編集）→ 出力を押すと**確認ダイアログが出て、そのまま出力したら何が起きるかが読める**
- [ ] 続行すると図に「（未解決）」のライフラインが立ち、**行は1本も落ちていない**
- [ ] 用語集で出力を押しても確認は出ない（赤が無いファイル）。用語集を ID 重複にすると確認が出る
- [ ] 「Markdown を書き出す」でも同じ確認が出る
- [ ] ライト・ダーク両モードで一巡する（ドロップダウンの面と文字が両モードで読める）
- [ ] 結果を記録した（気づきの粒度は「問題なし」でよいが、崩れた項目は具体的に）

- [ ] **Step 3: 実機確認の痕跡を捨てる**

```bash
git checkout -- sample-project/
git clean -fd sample-project/
git status --short
```

Expected: 空

---

### Task 12: 申し送り・`open-issues.md`・rev への反映

**Files:**
- Create: `docs/history/sequence-m3-mouse-and-output.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`
- Modify: `docs/lessons-for-planning.md`（教訓があれば）

**Interfaces:**
- Consumes: Task 11 の実機確認の結果
- Produces: なし

**実機確認とドキュメント反映を同じタスクに束ねない**（lessons-for-planning）ため独立させてある。**Task 11 が未実施のまま本タスクを完了させないこと。**

- [ ] **Step 1: 申し送りを書く**

`docs/history/sequence-m3-mouse-and-output.md` を新規作成する。既存の `docs/history/sequence-m2-usability.md` の構成に合わせ、以下を必ず含める:

- 冒頭に「追記専用。いま開いている残件は `open-issues.md` を見ること」の注記
- コミット範囲
- **実装で確定した事項**。少なくとも:
  - **M1 の確定事項2件を反転した**（from/to のインクリメンタル補完・インライン参加者作成）。根拠は実使用の観察。副次的に `normalizeForMatch` への依存と `Enter` の二重経路が構造ごと消えたこと（**lessons-for-planning の教訓の記録そのものは書き換えていない**こと）
  - **M2 の確定事項1件を上書きした**（形セルのクリック巡回 → クリックで開く）
  - **参照切れの表示を空から `（未解決）` に変えた**（ボタン化の帰結。空のボタンは押す場所が見えない）
  - **`（未解決）` 参加者と確認ダイアログは守る相手が違う**（前者は貼られた先の読み手、後者は押した操作者）
  - **`readSlot` を export して4本目の複製を作らなかった**（3本の重複は残っている）
  - **`describeIssueEffect` を `ToolModule` ではなく `OutputProfile` に足した**（規約の点数を増やさない）
  - **`useViewport` の `filter` 修正を logic-tree と sequence の両方に入れた**（複製規約の遵守であって、複製の解消ではない）
- **計画の誤りとして報告されたもの**（実装者からの報告をそのまま記録する）
- **テストが実装を守っていなかった箇所**
- **実機確認**: Task 11 のチェックリストを転記し、結果を書く
- **rev への反映事項**

- [ ] **Step 2: `open-issues.md` を更新する**

**消す:**

- 「**モーダルが開いている間もキャンバスのホイール／ドラッグが生きている**」（Task 6 で解消）
- 「**actor / kind セルをドロップダウン化する案**」（Task 7・8 で解消）

**足す:**

- 「**Mermaid の正規化関数がモジュール内にある**（`src/modules/sequence/mermaid.ts`）: design-notes 論点11 は『先に出力を実装した側が正規化関数を1本立て、後発がそれに乗る』としている。logic-tree の出力を作るときに `core/mermaid.ts` へ引き上げること。`markdown-table.ts` が用語集→コアと辿った道と同じ `[sequence-m3]`」
- 「**`domain`（責任境界）が問いの導出に一切関与していない**（`schemas/sequence.schema.json` / `src/modules/sequence/layout.ts`）: design-notes 論点3 の当初構想では境界跨ぎが問いの導出に効くはずだったが、『`ifExecuted` は境界に関係なく常に立つ』と決めたため、論点4 が『**境界は問いの導出に一切関与しない**』と明記している。現在 `domain` は rev 2章の一行を裏切らないためだけに残る属性で、M3 の出力にも出していない。**UML のシーケンス図に『境界』という標準概念は無い**（スイムレーンはアクティビティ図）。存置するか廃止するかを決めること `[sequence-m3]`」
- 「**ゾーンは sequence M4**（`schemas/sequence.schema.json` / `src/modules/sequence/`）: design-notes 論点12 の M3+ 候補のうち、M3 はマウス操作と出力を採った。ゾーンは `schemaVersion` 改訂＋マイグレータを伴う唯一の候補で、`questions.ts` / `consistency.ts` / `layout.ts` / ガター集計と縦に全層を貫く。データ形式（step ID のペアか所属宣言か）も未確定。design-notes が付けた条件『**同じ答えを何度も書いた実感を得てから**』を満たしたかを先に確かめること `[sequence-m3]`」
- 「**参加者を削除する手段が無い**（`src/modules/sequence/SequenceEditor.tsx`）: `removeActor` は実装されているが、ヘッダの空欄 `Backspace` 以外の入口が無い。M3 で『参加者を追加』ボタンを足したので、追加と削除の非対称が見えるようになった `[sequence-m3]`」（**Task 11 の実機確認でこれが不便として観察された場合のみ足す**。観察されなければ足さない）

**残す**（触らない）: 「`replyTo` が無い」「`GhostSlot` の ✕ が `layout.totalWidth` の外へはみ出す」「`Tab` の2ゾーン化」「空欄 `Backspace` の誤爆の不安」「`ok` の面の濃さ検算」「`warning` の面が二重になりうる」「キャンバスの土台が複製されている」

**最終更新の行を「sequence M3 完了時点」に直す。**

- [ ] **Step 3: `docs/overview-rev.md` に反映する**

- **2章**: シーケンスエディタの一行に出力を足す（Markdown 表＋Mermaid、1プロファイル）
- **6章 モジュール規約5**: `OutputProfile` に `describeIssueEffect`（任意）が加わったことと、**額縁が整合性エラーのあるファイルの出力に確認を挟む**ことを追記する。**規約の点数は7点のまま**であることも書く
- **10章 境界規則**: 「モーダル中はエディタの操作言語を停止する」に、**セルのドロップダウンも同じ扱いであること**と、**d3-zoom の `filter` も止めること**（キー監視だけでは足りない）を追記する

**反映は本コミットで済ませ、TODO として申し送りに残さないこと**（M4 の教訓）。

- [ ] **Step 4: 教訓があれば `docs/lessons-for-planning.md` に追記する**

追記の候補（実際に起きたものだけ書く。起きていないことを書かない）:

- Radix のような**開閉するポップアップを持つ部品をキャンバスに載せるときは、ポップアップが開いている間の親（キャンバス）の操作を止める必要があるかを1回問う**——ポップアップは anchor の画面座標で位置を決めるので、親が transform で動くとずれる

- [ ] **Step 5: ドキュメントの相互リンクを確認する**

```bash
git grep -n "sequence-m3" -- docs/
```

Expected: `open-issues.md` と `history/sequence-m3-mouse-and-output.md` が相互に辿れること

- [ ] **Step 6: 全体検証**

```bash
npm test && npx tsc -b && npm run lint
git status --short
```

Expected: 緑。`sample-project/` の変更が残っていないこと

- [ ] **Step 7: コミット**

```bash
git add docs/
git commit -m "docs(sequence-m3): 申し送りと残件・rev を更新する"
```

---

## 完了条件（Task 11 の実機確認で判定する）

1. 会議1回分のシーケンスから Markdown をコピーし、NotePM に貼って**図が描画され、表が読める**
2. **参照切れのあるファイルで出力すると確認ダイアログが出る**。続行すると図に「（未解決）」の参加者が立ち、行は1本も落ちていない
3. **マウスだけで from / to / 種別を選べ、参加者とステップを追加できる**
4. **`SequenceEditor.dom.test.tsx` の `Tab` 移動順・`Enter` でのステップ追加・IME 誤爆防止のテストが、1行も変更されずに緑**
5. **ドロップダウンを開いている間、`Ctrl+ホイール` でキャンバスが動かない**（logic-tree でも同じく動かない）
6. Mermaid 生成・表生成・正規化関数のユニットテストが通る
