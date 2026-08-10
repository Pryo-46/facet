# sequence M1: キーボードで打ち切れるシーケンスエディタ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 空の状態から会議1回分の直列シナリオ（参加者3〜6・ステップ15〜30）をキーボードだけで打ち切れ、全ステップに「失敗したら？」の問いが立ち、未回答が warning として見えるシーケンスエディタ。

**Architecture:** 既存の額縁（レジストリ・自動保存・二段検証・Undo）に `sequence` モジュールを1本足す。ノードは絶対配置 DOM・エッジは SVG・ビューポートは d3-zoom の3レイヤ（rev 10章）。問いのセットは `(kind, awaitsReply)` からモジュール内の純関数が導出する。測定層→レイアウト層→描画層の1パス構成は logic-tree と同型。

**Tech Stack:** TypeScript + React + Tailwind/shadcn + d3-zoom + Ajv（既存依存のみ。**新規依存の追加は無い**）

**範囲の正:** [`docs/sequence/sequence-m1-scope.md`](../../sequence/sequence-m1-scope.md)。設計の根拠は [`docs/sequence/sequence-design-notes.md`](../../sequence/sequence-design-notes.md)（以下「design-notes」）。

## Global Constraints

- **実装者への指示: 計画の指示が矛盾していたら辻褄を合わせずに「計画の矛盾」として報告する**（`docs/lessons-for-planning.md` 大原則）。**報告には検証コマンドとその出力を貼る**（M7 の教訓。「やっていない作業をやったと報告する」経路を塞ぐ）
- 検証は常に全体を回す: `npm test` ／ `npx tsc -b` ／ `npm run lint`（対象を絞らない）
- 色値の直書き禁止（`src/styles/conventions.test.ts` が機械検査）。半透明の面は**検算済みの組合せだけ**使う: エラー＝`bg-warning/20`、未定義＝`bg-warning/10`（文字はどちらも `text-ink-muted`。M8 確定）。`ok` 系の面は使わない（コントラスト未検算のため。rev 9章の「ok 未使用」は本 M1 でも解消しない）
- テキストは UTF-8（BOMなし）・LF。JSON の正規形はアプリの `serialize` が保証する（コード側で意識することは無い）
- `Ctrl+C` / `Ctrl+V` に意味を割り当てない（複製は後回し。design-notes 論点12）
- **禁止事項**（scope の写し）: `core/canvas` 等への共通化・抽象化を行わない（複製は許可し、記録する）／座標・幅・表示状態を JSON に入れない／キャンバスライブラリを導入しない／問いの類型をユーザーが増やせる機構を作らない
- コミットは Conventional Commits 風の日本語（例: `feat(sequence): ...`）。各コミット末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## ファイル構成（このマイルストーンで触る全ファイル）

**Create:**

```
schemas/sequence.schema.json                    スキーマ（正）
src/modules/sequence/schema.test.ts             レベル1検証のテスト
src/modules/sequence/questions.ts               問いの導出（純関数）
src/modules/sequence/questions.test.ts
src/modules/sequence/consistency.ts             整合性検証（レベル2）
src/modules/sequence/consistency.test.ts
src/modules/sequence/commands.ts                編集コマンド（純関数）
src/modules/sequence/commands.test.ts
src/modules/sequence/measure.ts                 測定層（純関数）
src/modules/sequence/measure.test.ts
src/modules/sequence/seq-font.ts                フォント読み取り（logic-tree の node-font.ts の複製）
src/modules/sequence/layout.ts                  レイアウト層（純関数）
src/modules/sequence/layout.test.ts
src/modules/sequence/viewport.ts                logic-tree からの複製
src/modules/sequence/viewport.test.ts           logic-tree からの複製
src/modules/sequence/useViewport.ts             logic-tree からの複製
src/modules/sequence/useViewport.dom.test.tsx   logic-tree からの複製
src/modules/sequence/ActorRefCell.tsx           from/to の参加者参照セル
src/modules/sequence/ActorRefCell.dom.test.tsx
src/modules/sequence/StepShapeCell.tsx          kind×awaitsReply のトグルセル
src/modules/sequence/StepShapeCell.dom.test.tsx
src/modules/sequence/GutterSlot.tsx             問いスロット1つ
src/modules/sequence/SequenceEdges.tsx          矢印（SVG）
src/modules/sequence/migrate.ts                 マイグレータ（恒等）
src/modules/sequence/module.ts                  モジュール宣言
src/modules/sequence/module.test.ts
src/modules/sequence/SequenceEditor.tsx         エディタ本体
src/modules/sequence/SequenceEditor.dom.test.tsx
docs/history/sequence-m1-keyboard-editor.md     申し送り（Task 14）
```

**Modify:**

```
src/core/keyboard/keymap.ts                     horizontal / toggle-item-state / ←→ の arrowsOwnedByField（Task 5）
src/core/keyboard/keymap.test.ts
src/modules/index.ts                            register 1行（Task 11）
docs/open-issues.md                             Task 14
docs/overview-rev.md                            Task 14
```

`src/types/sequence.ts` は `npm run gen:types` の生成物（`.gitignore` 済み。コミットしない）。

---

### Task 1: スキーマと型生成

**Files:**
- Create: `schemas/sequence.schema.json`
- Test: `src/modules/sequence/schema.test.ts`

**Interfaces:**
- Produces: 生成型 `SequenceSchemaVersion1` / `SequenceActor` / `SequenceStep`（`@/types/sequence`）。以降の全タスクが使う
- Produces: スキーマの検証挙動（レベル1）。Task 3 の整合性検証（レベル2）と対で二段検証を成す

- [ ] **Step 1: worktree の環境を整える**

```bash
npm install
npm run gen:types   # この時点では sequence は無い。既存3本の型が出れば環境は正常
npm test            # 既存テストが全緑であることを確認してから始める
```

Expected: 既存テストすべて PASS。落ちる場合は環境問題であり、直してから進む（本計画の変更のせいにしない）。

- [ ] **Step 2: スキーマ検証の失敗するテストを書く**

`src/modules/sequence/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { validateAgainstSchema } from '@/core/schema-validation'
import sequenceSchema from '../../../schemas/sequence.schema.json'
import type { JsonSchema } from '@/core/canonical'

const schema = sequenceSchema as JsonSchema

/** 全フィールドが埋まった正常データ。各テストはここから1点だけ崩す */
function valid() {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: '注文確定',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面', domain: '自社' },
      { id: 'actor_Aaaaaaaaa2', name: 'API' },
    ],
    steps: [
      {
        id: 'step_Aaaaaaaaa1',
        kind: 'call',
        from: 'actor_Aaaaaaaaa1',
        to: 'actor_Aaaaaaaaa2',
        label: '注文を確定',
        awaitsReply: true,
        failures: {
          failed: { decision: 'handled', text: '入力エラーを表示' },
          unknown: {
            decision: 'handled',
            text: 'リトライする',
            ifExecuted: { decision: 'notApplicable' },
          },
        },
      },
      { id: 'step_Aaaaaaaaa2', kind: 'reply', from: 'actor_Aaaaaaaaa2', to: 'actor_Aaaaaaaaa1', label: '注文番号' },
      { id: 'step_Aaaaaaaaa3', kind: 'self', from: 'actor_Aaaaaaaaa2', label: '在庫を引当' },
    ],
  }
}

describe('sequence スキーマ（レベル1）', () => {
  it('正常データを受け入れる', () => {
    expect(validateAgainstSchema(schema, valid()).ok).toBe(true)
  })

  it('domain / to / awaitsReply / failures の省略を受け入れる', () => {
    const d = valid()
    // self は to を持たない。reply は awaitsReply を持たない。failures 未回答は欠落
    expect(validateAgainstSchema(schema, d).ok).toBe(true)
  })

  it('ID のプレフィクス違いを拒否する', () => {
    const d = valid()
    d.steps[0].id = 'node_Aaaaaaaaa1'
    expect(validateAgainstSchema(schema, d).ok).toBe(false)
  })

  it('ID が11文字だと拒否する（長すぎる方向）', () => {
    const d = valid()
    d.actors[0].id = 'actor_Aaaaaaaaa12'
    expect(validateAgainstSchema(schema, d).ok).toBe(false)
  })

  it('ID が9文字だと拒否する（短すぎる方向）', () => {
    const d = valid()
    d.actors[0].id = 'actor_Aaaaaaaa1'
    expect(validateAgainstSchema(schema, d).ok).toBe(false)
  })

  it('kind の未知値を拒否する', () => {
    const d = valid()
    ;(d.steps[0] as { kind: string }).kind = 'async'
    expect(validateAgainstSchema(schema, d).ok).toBe(false)
  })

  it('call なのに awaitsReply が無いと拒否する', () => {
    const d = valid()
    delete (d.steps[0] as Record<string, unknown>).awaitsReply
    expect(validateAgainstSchema(schema, d).ok).toBe(false)
  })

  it('reply に awaitsReply があると拒否する', () => {
    const d = valid()
    ;(d.steps[1] as Record<string, unknown>).awaitsReply = true
    expect(validateAgainstSchema(schema, d).ok).toBe(false)
  })

  it('self に awaitsReply があると拒否する', () => {
    const d = valid()
    ;(d.steps[2] as Record<string, unknown>).awaitsReply = false
    expect(validateAgainstSchema(schema, d).ok).toBe(false)
  })

  it('self に to があってもレベル1では受け入れる（レベル2の担当）', () => {
    const d = valid()
    ;(d.steps[2] as Record<string, unknown>).to = 'actor_Aaaaaaaaa1'
    expect(validateAgainstSchema(schema, d).ok).toBe(true)
  })

  it('call に to が無くてもレベル1では受け入れる（レベル2の担当）', () => {
    const d = valid()
    delete (d.steps[0] as Record<string, unknown>).to
    expect(validateAgainstSchema(schema, d).ok).toBe(true)
  })

  it('handled なのに text が無いと拒否する', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).failed = { decision: 'handled' }
    expect(validateAgainstSchema(schema, d).ok).toBe(false)
  })

  it('notApplicable は text 無しでよい', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).failed = { decision: 'notApplicable' }
    expect(validateAgainstSchema(schema, d).ok).toBe(true)
  })

  it('unknown は decision 無しで ifExecuted だけ持てる（部分回答）', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).unknown = {
      ifExecuted: { decision: 'handled', text: '取引IDで冪等' },
    }
    expect(validateAgainstSchema(schema, d).ok).toBe(true)
  })

  it('failures の未知キーを拒否する（類型はスキーマ固定）', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).timeout = { decision: 'handled', text: 'x' }
    expect(validateAgainstSchema(schema, d).ok).toBe(false)
  })

  it('reply の failures はレベル1では受け入れる（立っていない問いはレベル2の担当）', () => {
    const d = valid()
    ;(d.steps[1] as Record<string, unknown>).failures = {
      failed: { decision: 'handled', text: 'x' },
    }
    expect(validateAgainstSchema(schema, d).ok).toBe(true)
  })

  it('トップレベルの未知キーを拒否する', () => {
    const d = valid() as Record<string, unknown>
    d.zones = []
    expect(validateAgainstSchema(schema, d).ok).toBe(false)
  })
})
```

注意: `validateAgainstSchema` のシグネチャは `src/core/schema-validation.ts` の実物を見て合わせること（戻り値のプロパティ名が `ok` でない場合はテスト側を実物に合わせ、**その旨を報告に書く**）。

- [ ] **Step 3: テストが落ちることを確認する**

Run: `npx vitest run src/modules/sequence/schema.test.ts`
Expected: FAIL（`schemas/sequence.schema.json` が存在しない）

- [ ] **Step 4: スキーマを書く**

`schemas/sequence.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "sequence.schema.json",
  "title": "シーケンス (sequence) schemaVersion 1",
  "description": "仕様整理ツール詰め合わせのシーケンスファイル。1ファイル＝1本の直列シナリオ（分岐は別ファイルかロジックツリーの担当）。図が持つのは正常系だけで、異常系は各ステップの failures（『失敗したら？』の問いへの答え）が持つ。問いの類型はスキーマ固定であり、どの問いが立つかは kind × awaitsReply から導出される——ユーザーや AI が類型を増やしてはならない。原因（エラー応答・接続不能・タイムアウト等）はキーに列挙せず、答えの text に書き分けること。キーの正規順序は本スキーマの properties 記載順とする。",
  "type": "object",
  "properties": {
    "schemaVersion": {
      "description": "スキーマの版。sequence の初版は 1。",
      "const": 1
    },
    "type": {
      "description": "ツール種別。シーケンスは sequence 固定。",
      "const": "sequence"
    },
    "title": {
      "description": "表示名。プロジェクトのファイル一覧に使う。",
      "type": "string"
    },
    "actors": {
      "description": "参加者の配列。配列順が図の横の並び（左→右）の正である。座標は持たない。",
      "type": "array",
      "items": { "$ref": "#/$defs/sequenceActor" }
    },
    "steps": {
      "description": "ステップの配列。配列順が時系列（上→下）の正である。行番号・座標は持たない。",
      "type": "array",
      "items": { "$ref": "#/$defs/sequenceStep" }
    }
  },
  "required": ["schemaVersion", "type", "title", "actors", "steps"],
  "additionalProperties": false,
  "$defs": {
    "sequenceActor": {
      "description": "参加者（ライフライン）1本。",
      "type": "object",
      "properties": {
        "id": {
          "description": "不変ID。プレフィクス actor_ ＋ nanoid（英数字62文字）10文字固定。連番禁止。",
          "type": "string",
          "pattern": "^actor_[A-Za-z0-9]{10}$"
        },
        "name": {
          "description": "参加者名。空文字＝「未記入」（追加直後の状態がそのまま自動保存に載りうるため空を許す）。",
          "type": "string"
        },
        "domain": {
          "description": "責任ドメイン（例: 自社／決済会社）。省略可。隣接する参加者間で双方が指定済みかつ異なる位置に責任境界の縦線を描く（描画は導出。境界そのものはデータに持たない）。",
          "type": "string"
        }
      },
      "required": ["id", "name"],
      "additionalProperties": false
    },
    "sequenceStep": {
      "description": "ステップ（矢印）1本。kind は矢印の形の分類で、問いのセットは kind × awaitsReply から導出される: self→failed のみ／call+awaitsReply:true→failed と unknown（内に ifExecuted）／call+awaitsReply:false→unknown のみ／reply→問い無し（応答の失敗は対の呼出側の unknown が扱う）。",
      "type": "object",
      "properties": {
        "id": {
          "description": "不変ID。プレフィクス step_ ＋ nanoid（英数字62文字）10文字固定。連番禁止。",
          "type": "string",
          "pattern": "^step_[A-Za-z0-9]{10}$"
        },
        "kind": {
          "description": "call＝呼出（実線）／reply＝応答（破線）／self＝内部処理（ライフライン上のボックス）。",
          "enum": ["call", "reply", "self"]
        },
        "from": {
          "description": "送り手の参加者ID。実在しない参照は整合性検証（レベル2）が赤表示する。",
          "type": "string",
          "pattern": "^actor_[A-Za-z0-9]{10}$"
        },
        "to": {
          "description": "受け手の参加者ID。self は持たない。call / reply で欠けている状態は整合性検証（レベル2）が指摘する（スキーマでは拒否しない——編集途中の自動保存がレベル1違反ファイルを作らないため）。",
          "type": "string",
          "pattern": "^actor_[A-Za-z0-9]{10}$"
        },
        "label": {
          "description": "ステップの文言。空文字＝「未記入」。ユーザーが明示的に入れた改行（\\n）は文言の一部として永続化する。表示上の自動折り返しはデータに持たない。",
          "type": "string"
        },
        "awaitsReply": {
          "description": "応答を待つ呼出か。kind: call のとき必須（既定値を持たず明示させる——問いのセットを決める属性のため）。reply / self では持たない。false＝投げっぱなし（開き矢頭で描く）。",
          "type": "boolean"
        },
        "failures": {
          "description": "『失敗したら？』の答え。キーの欠落＝未定義（warning 表示）。正規化で欠落キーを補完しない。",
          "$ref": "#/$defs/failures"
        }
      },
      "required": ["id", "kind", "from", "label"],
      "additionalProperties": false,
      "allOf": [
        {
          "if": { "properties": { "kind": { "const": "call" } }, "required": ["kind"] },
          "then": { "required": ["awaitsReply"] }
        },
        {
          "if": { "properties": { "kind": { "enum": ["reply", "self"] } }, "required": ["kind"] },
          "then": { "not": { "required": ["awaitsReply"] } }
        }
      ]
    },
    "failures": {
      "description": "問いスロットの器。キーはスキーマ固定の2つだけ（原因の列挙はしない——閉じたものは型に、開いたものは文に）。",
      "type": "object",
      "properties": {
        "failed": {
          "description": "『失敗が確定したら？』への答え。エラー応答・接続不能・送信不能など、失敗が確定的に観測されるケースすべてをこの1問が受ける。",
          "$ref": "#/$defs/answerSlot"
        },
        "unknown": { "$ref": "#/$defs/unknownSlot" }
      },
      "additionalProperties": false
    },
    "answerSlot": {
      "description": "答え1つ。handled＝挙動を決めた（text 必須）／notApplicable＝考慮不要と決めた（text は任意の理由メモ）。",
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "decision": { "const": "handled" },
            "text": { "description": "失敗時に何が起きるか。", "type": "string", "minLength": 1 }
          },
          "required": ["decision", "text"],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": {
            "decision": { "const": "notApplicable" },
            "text": { "description": "考慮不要と決めた理由（任意）。", "type": "string" }
          },
          "required": ["decision"],
          "additionalProperties": false
        }
      ]
    },
    "unknownSlot": {
      "description": "『結果が不明だったら？』への答え。下位の ifExecuted（『実行済みだったら？』＝冪等性の問い）を内包する。decision 無しで ifExecuted だけ持つ部分回答を許す。",
      "type": "object",
      "properties": {
        "decision": { "enum": ["handled", "notApplicable"] },
        "text": { "type": "string" },
        "ifExecuted": { "$ref": "#/$defs/answerSlot" }
      },
      "additionalProperties": false,
      "allOf": [
        {
          "if": { "properties": { "decision": { "const": "handled" } }, "required": ["decision"] },
          "then": { "required": ["text"] }
        }
      ]
    }
  }
}
```

- [ ] **Step 5: 型を生成し、テストが通ることを確認する**

```bash
npm run gen:types
npx vitest run src/modules/sequence/schema.test.ts
```

Expected: PASS。あわせて `src/types/sequence.ts` を開き、`SequenceSchemaVersion1` / `SequenceActor` / `SequenceStep` という名前で型が出ていることを確認する（`json-schema-to-typescript` は `title` と `$defs` 名から命名する）。名前が違う場合は**この計画の以降のタスクで使う型名を実物に合わせ、計画の矛盾として報告する**。`answerSlot` の `oneOf` が判別可能なユニオン型になっていることも見る。`if/then` は型に反映されない（Ajv だけが検証する）——これは既知の制限であり問題ではない。

- [ ] **Step 6: 全体を回してコミット**

```bash
npm test && npx tsc -b && npm run lint
git add schemas/sequence.schema.json src/modules/sequence/schema.test.ts
git commit -m "feat(sequence): スキーマと型生成を足す"
```

---

### Task 2: 問いの導出（純関数）

**Files:**
- Create: `src/modules/sequence/questions.ts`
- Test: `src/modules/sequence/questions.test.ts`

**Interfaces:**
- Consumes: `SequenceStep`（Task 1 の生成型）
- Produces: `poseQuestions(step) → PosedQuestions`／`questionLabels(step) → QuestionLabels`／型 `AnswerPath = 'failed' | 'unknown' | 'ifExecuted'`。Task 3（整合性検証）・Task 4（コマンド）・Task 10 以降（描画）が使う

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/sequence/questions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { poseQuestions, questionLabels } from './questions'

const call = (awaitsReply: boolean) =>
  ({ kind: 'call', awaitsReply }) as const

describe('poseQuestions', () => {
  it('応答を待つ呼出は3問すべて立つ', () => {
    expect(poseQuestions(call(true))).toEqual({ failed: true, unknown: true, ifExecuted: true })
  })
  it('投げっぱなしの呼出は unknown だけ立つ', () => {
    expect(poseQuestions(call(false))).toEqual({ failed: false, unknown: true, ifExecuted: false })
  })
  it('内部処理は failed だけ立つ', () => {
    expect(poseQuestions({ kind: 'self' })).toEqual({ failed: true, unknown: false, ifExecuted: false })
  })
  it('応答には問いが立たない', () => {
    expect(poseQuestions({ kind: 'reply' })).toEqual({ failed: false, unknown: false, ifExecuted: false })
  })
  it('awaitsReply 欠落（型上は起きないが外部データで起きうる）は true 扱い＝安全側', () => {
    expect(poseQuestions({ kind: 'call' })).toEqual({ failed: true, unknown: true, ifExecuted: true })
  })
})

describe('questionLabels', () => {
  it('文言はステップ種別で変わる（キーは同じ）', () => {
    expect(questionLabels(call(true)).unknown).toBe('結果不明だったら？')
    expect(questionLabels(call(false)).unknown).toBe('届かなかったかもしれない。それでよいか？')
    expect(questionLabels({ kind: 'self' }).failed).toBe('処理失敗したら？')
    expect(questionLabels(call(true)).failed).toBe('失敗が確定したら？')
    expect(questionLabels(call(true)).ifExecuted).toBe('実行済みだったら？')
  })
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/sequence/questions.test.ts`
Expected: FAIL（モジュールが無い）

- [ ] **Step 3: 実装する**

`src/modules/sequence/questions.ts`:

```ts
import type { SequenceStep } from '@/types/sequence'

/**
 * 問いの導出（design-notes 論点3。このツールの心臓部）。
 *
 * 問いは「原因」ではなく「呼び手の知識状態」に立てる。知識状態は
 * 成功（＝図が担当）／失敗確定（failed）／結果不明（unknown、内に
 * ifExecuted）の3つで閉じており、原因（エラー応答・接続不能・
 * タイムアウト等）は答えの text に書き分ける。
 *
 * **この導出をユーザー・ツール設定・ステップ側の宣言で変えられるように
 * してはならない**——類型が可変になった瞬間、「問いのセットが完成して
 * いるか」をツールが判定できなくなり、網羅の担保が消える。
 */
export type AnswerPath = 'failed' | 'unknown' | 'ifExecuted'

export interface PosedQuestions {
  failed: boolean
  unknown: boolean
  ifExecuted: boolean
}

type StepShape = Pick<SequenceStep, 'kind' | 'awaitsReply'>

export function poseQuestions(step: StepShape): PosedQuestions {
  switch (step.kind) {
    case 'self':
      // 実行者自身に「結果不明」は無い（自分の失敗は直接観測できる）
      return { failed: true, unknown: false, ifExecuted: false }
    case 'reply':
      // 応答の失敗は対の呼出側の unknown / failed が既に問うている。
      // ここにも立てると同じ考慮を2箇所に書かせる（二重計上）
      return { failed: false, unknown: false, ifExecuted: false }
    case 'call':
      // awaitsReply はスキーマ上 call で必須だが、外部データでは欠けうる。
      // 欠けていたら true 扱い＝問いを多く立てる安全側に倒す
      if (step.awaitsReply === false) {
        // 投げっぱなし: 応答を観測しないので知識状態は常に「不明」一色。
        // 未実行こそがリスクなので ifExecuted（実行済みだったら）は立たない
        return { failed: false, unknown: true, ifExecuted: false }
      }
      return { failed: true, unknown: true, ifExecuted: true }
  }
}

export interface QuestionLabels {
  failed: string
  unknown: string
  ifExecuted: string
}

/** ガターに出す問いの文言。キーは共通・文言だけ種別で変える */
export function questionLabels(step: StepShape): QuestionLabels {
  if (step.kind === 'self') {
    return { failed: '処理失敗したら？', unknown: '', ifExecuted: '' }
  }
  if (step.kind === 'call' && step.awaitsReply === false) {
    return { failed: '', unknown: '届かなかったかもしれない。それでよいか？', ifExecuted: '' }
  }
  return {
    failed: '失敗が確定したら？',
    unknown: '結果不明だったら？',
    ifExecuted: '実行済みだったら？',
  }
}
```

- [ ] **Step 4: テストが通ることを確認してコミット**

```bash
npx vitest run src/modules/sequence/questions.test.ts && npx tsc -b
git add src/modules/sequence/questions.ts src/modules/sequence/questions.test.ts
git commit -m "feat(sequence): 問いの導出を実装する"
```

---

### Task 3: 整合性検証（レベル2）

**Files:**
- Create: `src/modules/sequence/consistency.ts`
- Test: `src/modules/sequence/consistency.test.ts`

**Interfaces:**
- Consumes: `poseQuestions`（Task 2）、`ConsistencyIssue`（`@/core/consistency`）
- Produces: `checkSequenceConsistency(data: SequenceSchemaVersion1): ConsistencyIssue[]`。ルール識別子は `'duplicate-id' | 'missing-actor' | 'unposed-answer' | 'to-mismatch'`。**location の entityId のプレフィクス（actor_/step_）でどの配列かを見分ける**規約（エディタ側 Task 11 が従う）

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/sequence/consistency.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { checkSequenceConsistency } from './consistency'

function base(): SequenceSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: 't',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面' },
      { id: 'actor_Aaaaaaaaa2', name: 'API' },
      { id: 'actor_Aaaaaaaaa3', name: '決済' },
    ],
    steps: [
      { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: 'a', awaitsReply: true },
      { id: 'step_Aaaaaaaaa2', kind: 'reply', from: 'actor_Aaaaaaaaa2', to: 'actor_Aaaaaaaaa1', label: 'b' },
      { id: 'step_Aaaaaaaaa3', kind: 'self', from: 'actor_Aaaaaaaaa2', label: 'c' },
    ],
  }
}

describe('checkSequenceConsistency', () => {
  it('正常データは指摘なし（failures の欠落は未定義であって検証エラーではない）', () => {
    expect(checkSequenceConsistency(base())).toEqual([])
  })

  it('ID重複: actor と step で別々に検出し、重複した全行を指す', () => {
    const d = base()
    d.steps[2] = { ...d.steps[2], id: 'step_Aaaaaaaaa1' }
    const issues = checkSequenceConsistency(d)
    const dup = issues.filter((i) => i.rule === 'duplicate-id')
    expect(dup).toHaveLength(1)
    expect(dup[0].locations.map((l) => l.entityIndex)).toEqual([0, 2])
  })

  it('missing-actor: from の参照切れは from フィールドを指す', () => {
    const d = base()
    d.steps[0] = { ...d.steps[0], from: 'actor_Zzzzzzzzz9' }
    const issues = checkSequenceConsistency(d)
    const miss = issues.filter((i) => i.rule === 'missing-actor')
    expect(miss).toHaveLength(1)
    expect(miss[0].locations[0]).toEqual({ entityId: 'step_Aaaaaaaaa1', entityIndex: 0, field: 'from' })
  })

  it('missing-actor: to の参照切れも同様（1ステップに2件出うる）', () => {
    const d = base()
    d.steps[0] = { ...d.steps[0], from: 'actor_Zzzzzzzzz8', to: 'actor_Zzzzzzzzz9' }
    const miss = checkSequenceConsistency(d).filter((i) => i.rule === 'missing-actor')
    expect(miss.flatMap((i) => i.locations.map((l) => l.field)).sort()).toEqual(['from', 'to'])
  })

  it('unposed-answer: reply に failed の答えがあると、reply が理由だと分かる文言で指摘する', () => {
    const d = base()
    d.steps[1] = { ...d.steps[1], failures: { failed: { decision: 'handled', text: 'x' } } }
    const issues = checkSequenceConsistency(d).filter((i) => i.rule === 'unposed-answer')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('応答')
    expect(issues[0].locations[0]).toEqual({ entityId: 'step_Aaaaaaaaa2', entityIndex: 1, field: 'failures' })
  })

  it('unposed-answer: 投げっぱなしの呼出に failed があると awaitsReply が理由だと分かる文言で指摘する', () => {
    const d = base()
    d.steps[0] = {
      ...d.steps[0],
      awaitsReply: false,
      failures: { failed: { decision: 'handled', text: 'x' } },
    }
    const issues = checkSequenceConsistency(d).filter((i) => i.rule === 'unposed-answer')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('awaitsReply')
  })

  it('unposed-answer: 投げっぱなしの unknown.ifExecuted も立っていない問い', () => {
    const d = base()
    d.steps[0] = {
      ...d.steps[0],
      awaitsReply: false,
      failures: { unknown: { decision: 'handled', text: 'x', ifExecuted: { decision: 'notApplicable' } } },
    }
    const issues = checkSequenceConsistency(d).filter((i) => i.rule === 'unposed-answer')
    expect(issues).toHaveLength(1)
  })

  it('to-mismatch: self に to がある', () => {
    const d = base()
    d.steps[2] = { ...d.steps[2], to: 'actor_Aaaaaaaaa1' } as (typeof d.steps)[number]
    const issues = checkSequenceConsistency(d).filter((i) => i.rule === 'to-mismatch')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('内部処理')
  })

  it('to-mismatch: call に to が無い', () => {
    const d = base()
    const { to: _to, ...rest } = d.steps[0]
    d.steps[0] = rest as (typeof d.steps)[number]
    const issues = checkSequenceConsistency(d).filter((i) => i.rule === 'to-mismatch')
    expect(issues).toHaveLength(1)
  })

  it('missing-actor と to-mismatch は独立に出る（self の to が参照切れでも to-mismatch が優先ではない）', () => {
    const d = base()
    d.steps[2] = { ...d.steps[2], to: 'actor_Zzzzzzzzz9' } as (typeof d.steps)[number]
    const rules = checkSequenceConsistency(d).map((i) => i.rule).sort()
    expect(rules).toEqual(['missing-actor', 'to-mismatch'])
  })
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/sequence/consistency.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/modules/sequence/consistency.ts`:

```ts
import type { ConsistencyIssue, ConsistencyLocation } from '@/core/consistency'
import type { SequenceSchemaVersion1, SequenceStep } from '@/types/sequence'
import { poseQuestions, type AnswerPath } from './questions'

const KIND_LABEL: Record<SequenceStep['kind'], string> = {
  call: '呼出',
  reply: '応答',
  self: '内部処理',
}

const PATH_LABEL: Record<AnswerPath, string> = {
  failed: '失敗確定',
  unknown: '結果不明',
  ifExecuted: '実行済みだったら',
}

/** ステップを人が特定できる呼び名（#位置 ＋ 文言があれば文言） */
function stepName(step: SequenceStep, index: number): string {
  return step.label === '' ? `#${index + 1}` : `#${index + 1}（${step.label}）`
}

function dupLocations(items: readonly { id: string }[], field: string): Map<string, ConsistencyLocation[]> {
  const byId = new Map<string, ConsistencyLocation[]>()
  items.forEach((item, index) => {
    const list = byId.get(item.id) ?? []
    list.push({ entityId: item.id, entityIndex: index, field })
    byId.set(item.id, list)
  })
  return byId
}

/**
 * 整合性検証（レベル2＝受け入れて赤表示。design-notes 論点10）。
 * エラー文言は「どの属性のせいか」まで言う——「ID が重複しています」だけでは
 * 直し方が読めない、という logic-tree M1 の教訓（ID 重複と木の形の項）の適用。
 *
 * location の entityId はプレフィクス（actor_ / step_）でどの配列の話かを
 * 見分ける——ConsistencyLocation は配列を1つしか想定していないため、
 * 2配列を持つ本モジュールはこの規約でエディタと通じ合う
 */
export function checkSequenceConsistency(data: SequenceSchemaVersion1): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []

  // ID 重複（actor / step それぞれ。1つの id につき1指摘・全行を指す）
  for (const [label, items] of [
    ['参加者', data.actors],
    ['ステップ', data.steps],
  ] as const) {
    for (const [id, locations] of dupLocations(items, 'id')) {
      if (locations.length > 1) {
        issues.push({
          rule: 'duplicate-id',
          message: `${label}の ID が重複しています: ${id}`,
          locations,
        })
      }
    }
  }

  const actorIds = new Set(data.actors.map((a) => a.id))

  data.steps.forEach((step, index) => {
    // 参照切れ（from / to）
    for (const field of ['from', 'to'] as const) {
      const ref = step[field]
      if (ref !== undefined && !actorIds.has(ref)) {
        issues.push({
          rule: 'missing-actor',
          message: `${stepName(step, index)} の ${field} が指す参加者が存在しません: ${ref}`,
          locations: [{ entityId: step.id, entityIndex: index, field }],
        })
      }
    }

    // to の有無と kind の食い違い
    if (step.kind === 'self' && step.to !== undefined) {
      issues.push({
        rule: 'to-mismatch',
        message: `${stepName(step, index)} は内部処理（self）なのに to を持っています。内部処理は from だけで表します`,
        locations: [{ entityId: step.id, entityIndex: index, field: 'to' }],
      })
    }
    if (step.kind !== 'self' && step.to === undefined) {
      issues.push({
        rule: 'to-mismatch',
        message: `${stepName(step, index)} は${KIND_LABEL[step.kind]}なのに to（受け手）がありません`,
        locations: [{ entityId: step.id, entityIndex: index, field: 'to' }],
      })
    }

    // 立っていない問いへの答え
    if (step.failures !== undefined) {
      const posed = poseQuestions(step)
      const present: AnswerPath[] = []
      if (step.failures.failed !== undefined) present.push('failed')
      if (step.failures.unknown !== undefined) {
        // unknown 自体の decision または text があれば「unknown への答え」とみなす。
        // ifExecuted だけの部分回答では unknown 自体は未回答（未定義のまま）
        if (step.failures.unknown.decision !== undefined) present.push('unknown')
        if (step.failures.unknown.ifExecuted !== undefined) present.push('ifExecuted')
      }
      for (const path of present) {
        if (posed[path]) continue
        const reason =
          step.kind === 'reply'
            ? '応答には問いが立ちません（応答の失敗は対の呼出側の「結果不明」が扱います）'
            : step.kind === 'self'
              ? '内部処理に立つ問いは「失敗確定」だけです'
              : `awaitsReply: false（投げっぱなし）の呼出に立つ問いは「結果不明」だけです`
        issues.push({
          rule: 'unposed-answer',
          message: `${stepName(step, index)} に「${PATH_LABEL[path]}」の答えがありますが、${reason}`,
          locations: [{ entityId: step.id, entityIndex: index, field: 'failures' }],
        })
      }
    }
  })

  return issues
}
```

- [ ] **Step 4: テストが通ることを確認してコミット**

```bash
npx vitest run src/modules/sequence/consistency.test.ts && npx tsc -b
git add src/modules/sequence/consistency.ts src/modules/sequence/consistency.test.ts
git commit -m "feat(sequence): 整合性検証（レベル2）を実装する"
```

---

### Task 4: 編集コマンド（純関数）

**Files:**
- Create: `src/modules/sequence/commands.ts`
- Test: `src/modules/sequence/commands.test.ts`

**Interfaces:**
- Consumes: `newId`（`@/core/new-id`）、`insertAt` / `removeAt` / `moveItem`（`@/core/list-ops`）
- Produces: 下記の全関数と `SeqEditResult`。Task 10・11 のエディタ・セルが呼ぶ**唯一の編集経路**（キーボードもボタンも同じ関数を呼ぶ。rev 10章の鉄則）

```ts
export interface SeqFocus { kind: 'actor' | 'step'; index: number }
export interface SeqEditResult { data: SequenceSchemaVersion1; focus: SeqFocus | null }

addFirstActor(data): SeqEditResult          // 空状態の「クリックして開始」
addActorAfter(data, index): SeqEditResult   // 参加者ヘッダの Enter
removeActor(data, index): SeqEditResult     // 参加者ヘッダの空欄 Backspace
moveActor(data, index, delta: -1 | 1): SeqEditResult
setActorName(data, index, name): SequenceSchemaVersion1
setActorDomain(data, index, domain): SequenceSchemaVersion1  // '' で domain キーを消す
addStepAfter(data, index): SeqEditResult    // ステップ行の Enter
addStepLast(data): SeqEditResult            // ツールバー「ステップを追加」
removeStep(data, index): SeqEditResult
moveStep(data, index, delta: -1 | 1): SeqEditResult
setStepLabel(data, index, label): SequenceSchemaVersion1
setStepActor(data, index, field: 'from' | 'to', actorId): SequenceSchemaVersion1
createActorAndAssign(data, stepIndex, field: 'from' | 'to', name): SequenceSchemaVersion1
setStepShape(data, index, shape: StepShapeValue): SequenceSchemaVersion1
setAnswerText(data, index, path: AnswerPath, text): SequenceSchemaVersion1
toggleNotApplicable(data, index, path: AnswerPath): SequenceSchemaVersion1
export type StepShapeValue = 'call-sync' | 'call-async' | 'reply' | 'self'
stepShapeOf(step): StepShapeValue
```

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/sequence/commands.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import {
  addActorAfter,
  addFirstActor,
  addStepAfter,
  addStepLast,
  createActorAndAssign,
  moveActor,
  moveStep,
  removeActor,
  removeStep,
  setActorDomain,
  setAnswerText,
  setStepShape,
  stepShapeOf,
  toggleNotApplicable,
} from './commands'

function data(): SequenceSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: 't',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面' },
      { id: 'actor_Aaaaaaaaa2', name: 'API' },
      { id: 'actor_Aaaaaaaaa3', name: '決済' },
    ],
    steps: [
      { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: 'a', awaitsReply: true },
      { id: 'step_Aaaaaaaaa2', kind: 'call', from: 'actor_Aaaaaaaaa2', to: 'actor_Aaaaaaaaa3', label: 'b', awaitsReply: true },
      { id: 'step_Aaaaaaaaa3', kind: 'self', from: 'actor_Aaaaaaaaa3', label: 'c' },
    ],
  }
}

describe('actor 操作', () => {
  it('addFirstActor は空の参加者を1人足してフォーカスする', () => {
    const r = addFirstActor({ ...data(), actors: [], steps: [] })
    expect(r.data.actors).toHaveLength(1)
    expect(r.data.actors[0].name).toBe('')
    expect(r.data.actors[0].id).toMatch(/^actor_[A-Za-z0-9]{10}$/)
    expect(r.focus).toEqual({ kind: 'actor', index: 0 })
  })

  it('addActorAfter は直後に挿入する（末尾追加と区別できる位置で見る）', () => {
    const r = addActorAfter(data(), 0)
    expect(r.data.actors.map((a) => a.name)).toEqual(['画面', '', 'API', '決済'])
    expect(r.focus).toEqual({ kind: 'actor', index: 1 })
  })

  it('removeActor は参加者だけ消し、参照しているステップは残す（missing-actor は検証の仕事）', () => {
    const r = removeActor(data(), 1)
    expect(r.data.actors.map((a) => a.name)).toEqual(['画面', '決済'])
    expect(r.data.steps).toHaveLength(3)
    expect(r.data.steps[0].to).toBe('actor_Aaaaaaaaa2')
    expect(r.focus).toEqual({ kind: 'actor', index: 0 })
  })

  it('moveActor は隣と入れ替える（3人の真ん中を右へ＝末尾との入れ替えではない）', () => {
    const r = moveActor(data(), 1, 1)
    expect(r.data.actors.map((a) => a.name)).toEqual(['画面', '決済', 'API'])
    expect(r.focus).toEqual({ kind: 'actor', index: 2 })
  })

  it('端の moveActor は何もしない', () => {
    const r = moveActor(data(), 0, -1)
    expect(r.data.actors.map((a) => a.name)).toEqual(['画面', 'API', '決済'])
  })

  it('setActorDomain は空文字で domain キー自体を消す', () => {
    const withDomain = setActorDomain(data(), 0, '自社')
    expect(withDomain.actors[0].domain).toBe('自社')
    const cleared = setActorDomain(withDomain, 0, '')
    expect('domain' in cleared.actors[0]).toBe(false)
  })
})

describe('step 操作', () => {
  it('addStepAfter の既定値: from は前の to、to は前の from（会話の往復）、kind は call・応答待ち', () => {
    const r = addStepAfter(data(), 0)
    expect(r.data.steps).toHaveLength(4)
    const added = r.data.steps[1]
    expect(added.from).toBe('actor_Aaaaaaaaa2')
    expect(added.to).toBe('actor_Aaaaaaaaa1')
    expect(added.kind).toBe('call')
    expect(added.awaitsReply).toBe(true)
    expect(added.label).toBe('')
    expect(r.focus).toEqual({ kind: 'step', index: 1 })
  })

  it('addStepAfter: self（to 無し）の後は from を引き継ぐ', () => {
    const r = addStepAfter(data(), 2)
    const added = r.data.steps[3]
    expect(added.from).toBe('actor_Aaaaaaaaa3')
    expect(added.to).toBe('actor_Aaaaaaaaa3')
  })

  it('addStepLast: ステップ0件では先頭の2参加者を from/to にする', () => {
    const r = addStepLast({ ...data(), steps: [] })
    expect(r.data.steps).toHaveLength(1)
    expect(r.data.steps[0].from).toBe('actor_Aaaaaaaaa1')
    expect(r.data.steps[0].to).toBe('actor_Aaaaaaaaa2')
  })

  it('removeStep のフォーカスは前の行（先頭を消したら次の行、無ければ null）', () => {
    expect(removeStep(data(), 1).focus).toEqual({ kind: 'step', index: 0 })
    expect(removeStep(data(), 0).focus).toEqual({ kind: 'step', index: 0 })
    const one = { ...data(), steps: data().steps.slice(0, 1) }
    expect(removeStep(one, 0).focus).toBeNull()
  })

  it('moveStep は3行の真ん中を下へ動かすと末尾になる（削除→挿入のずれが無い）', () => {
    const r = moveStep(data(), 1, 1)
    expect(r.data.steps.map((s) => s.label)).toEqual(['a', 'c', 'b'])
    expect(r.focus).toEqual({ kind: 'step', index: 2 })
  })

  it('createActorAndAssign は参加者を末尾に足して参照を差し替える（1操作）', () => {
    const next = createActorAndAssign(data(), 0, 'to', 'メール基盤')
    expect(next.actors).toHaveLength(4)
    expect(next.actors[3].name).toBe('メール基盤')
    expect(next.steps[0].to).toBe(next.actors[3].id)
  })
})

describe('setStepShape', () => {
  it('self にすると to と awaitsReply が消える', () => {
    const next = setStepShape(data(), 0, 'self')
    expect(next.steps[0].kind).toBe('self')
    expect('to' in next.steps[0]).toBe(false)
    expect('awaitsReply' in next.steps[0]).toBe(false)
  })

  it('reply にすると awaitsReply が消えて to は残る', () => {
    const next = setStepShape(data(), 0, 'reply')
    expect(next.steps[0].kind).toBe('reply')
    expect(next.steps[0].to).toBe('actor_Aaaaaaaaa2')
    expect('awaitsReply' in next.steps[0]).toBe(false)
  })

  it('call-async は awaitsReply: false', () => {
    const next = setStepShape(data(), 0, 'call-async')
    expect(next.steps[0].kind).toBe('call')
    expect(next.steps[0].awaitsReply).toBe(false)
  })

  it('形を変えても failures は消さない（立たなくなった答えは赤表示で残る。黙って消さない）', () => {
    const withAnswer = setAnswerText(data(), 0, 'failed', 'エラー表示')
    const next = setStepShape(withAnswer, 0, 'reply')
    expect(next.steps[0].failures?.failed).toEqual({ decision: 'handled', text: 'エラー表示' })
  })

  it('stepShapeOf は4値を往復する', () => {
    expect(stepShapeOf(data().steps[0])).toBe('call-sync')
    expect(stepShapeOf(setStepShape(data(), 0, 'call-async').steps[0])).toBe('call-async')
    expect(stepShapeOf(setStepShape(data(), 0, 'reply').steps[0])).toBe('reply')
    expect(stepShapeOf(setStepShape(data(), 0, 'self').steps[0])).toBe('self')
  })
})

describe('答えスロット', () => {
  it('setAnswerText は handled として書く', () => {
    const next = setAnswerText(data(), 0, 'failed', 'エラー表示')
    expect(next.steps[0].failures).toEqual({ failed: { decision: 'handled', text: 'エラー表示' } })
  })

  it('setAnswerText の空文字はキーごと消す（未定義へ戻る）。failures が空になったら failures ごと消す', () => {
    const withAnswer = setAnswerText(data(), 0, 'failed', 'x')
    const cleared = setAnswerText(withAnswer, 0, 'failed', '')
    expect('failures' in cleared.steps[0]).toBe(false)
  })

  it('ifExecuted は unknown の中に入る。unknown 未回答でも部分回答として持てる', () => {
    const next = setAnswerText(data(), 0, 'ifExecuted', '取引IDで冪等')
    expect(next.steps[0].failures?.unknown).toEqual({
      ifExecuted: { decision: 'handled', text: '取引IDで冪等' },
    })
  })

  it('ifExecuted を消しても unknown 本体の答えは残る', () => {
    let d = setAnswerText(data(), 0, 'unknown', 'リトライ')
    d = setAnswerText(d, 0, 'ifExecuted', '冪等')
    d = setAnswerText(d, 0, 'ifExecuted', '')
    expect(d.steps[0].failures?.unknown).toEqual({ decision: 'handled', text: 'リトライ' })
  })

  it('toggleNotApplicable: 未定義 → notApplicable → 未定義', () => {
    const on = toggleNotApplicable(data(), 0, 'failed')
    expect(on.steps[0].failures?.failed).toEqual({ decision: 'notApplicable' })
    const off = toggleNotApplicable(on, 0, 'failed')
    expect('failures' in off.steps[0]).toBe(false)
  })

  it('toggleNotApplicable: handled（text あり）→ notApplicable（text 温存）→ handled に戻る', () => {
    const handled = setAnswerText(data(), 0, 'failed', 'エラー表示')
    const na = toggleNotApplicable(handled, 0, 'failed')
    expect(na.steps[0].failures?.failed).toEqual({ decision: 'notApplicable', text: 'エラー表示' })
    const back = toggleNotApplicable(na, 0, 'failed')
    expect(back.steps[0].failures?.failed).toEqual({ decision: 'handled', text: 'エラー表示' })
  })

  it('コマンドは元データを破壊しない（非破壊性を構造操作でも確認）', () => {
    const d = data()
    const before = JSON.stringify(d)
    addStepAfter(d, 0)
    removeActor(d, 0)
    setAnswerText(d, 0, 'failed', 'x')
    setStepShape(d, 0, 'self')
    expect(JSON.stringify(d)).toBe(before)
  })
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/sequence/commands.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/modules/sequence/commands.ts`:

```ts
import { insertAt, moveItem, removeAt } from '@/core/list-ops'
import { newId } from '@/core/new-id'
import type { SequenceActor, SequenceSchemaVersion1, SequenceStep } from '@/types/sequence'
import type { AnswerPath } from './questions'

export interface SeqFocus {
  kind: 'actor' | 'step'
  index: number
}

export interface SeqEditResult {
  data: SequenceSchemaVersion1
  focus: SeqFocus | null
}

function withActors(d: SequenceSchemaVersion1, actors: SequenceActor[]): SequenceSchemaVersion1 {
  return { ...d, actors }
}

function withSteps(d: SequenceSchemaVersion1, steps: SequenceStep[]): SequenceSchemaVersion1 {
  return { ...d, steps }
}

function replaceStep(
  d: SequenceSchemaVersion1,
  index: number,
  step: SequenceStep,
): SequenceSchemaVersion1 {
  const steps = [...d.steps]
  steps[index] = step
  return withSteps(d, steps)
}

// ---- 参加者 ----

export function addFirstActor(d: SequenceSchemaVersion1): SeqEditResult {
  const actors = [...d.actors, { id: newId('actor'), name: '' }]
  return { data: withActors(d, actors), focus: { kind: 'actor', index: actors.length - 1 } }
}

export function addActorAfter(d: SequenceSchemaVersion1, index: number): SeqEditResult {
  if (d.actors[index] === undefined) return { data: d, focus: null }
  const actors = insertAt(d.actors, index + 1, { id: newId('actor'), name: '' })
  return { data: withActors(d, actors), focus: { kind: 'actor', index: index + 1 } }
}

/**
 * 参加者だけ消す。参照しているステップは触らない——参照切れは整合性検証が
 * 赤表示する（「問題は防ぐものではなく赤く見せるもの」。rev 5章の用語削除と同じ）
 */
export function removeActor(d: SequenceSchemaVersion1, index: number): SeqEditResult {
  if (d.actors[index] === undefined) return { data: d, focus: null }
  const actors = removeAt(d.actors, index)
  const at = Math.min(index, actors.length - 1)
  return {
    data: withActors(d, actors),
    focus: at < 0 ? null : { kind: 'actor', index: at },
  }
}

export function moveActor(d: SequenceSchemaVersion1, index: number, delta: -1 | 1): SeqEditResult {
  const to = index + delta
  const moved = moveItem(d.actors, index, to)
  const changed = moved.some((a, i) => a !== d.actors[i])
  return changed
    ? { data: withActors(d, moved), focus: { kind: 'actor', index: to } }
    : { data: d, focus: null }
}

export function setActorName(
  d: SequenceSchemaVersion1,
  index: number,
  name: string,
): SequenceSchemaVersion1 {
  const actors = [...d.actors]
  actors[index] = { ...actors[index], name }
  return withActors(d, actors)
}

/** domain は任意キー。空文字はキーごと消す（欠落＝未指定が正規の表現） */
export function setActorDomain(
  d: SequenceSchemaVersion1,
  index: number,
  domain: string,
): SequenceSchemaVersion1 {
  const actors = [...d.actors]
  const { domain: _old, ...rest } = actors[index]
  actors[index] = domain === '' ? rest : { ...rest, domain }
  return withActors(d, actors)
}

// ---- ステップ ----

function newStep(from: string, to: string | undefined): SequenceStep {
  const step: SequenceStep = {
    id: newId('step'),
    kind: 'call',
    from,
    label: '',
    awaitsReply: true,
  }
  return to === undefined ? step : { ...step, to }
}

/**
 * Enter＝直後にステップ追加。既定値は「会話の往復」——from は前の to、
 * to は前の from。self（to 無し）の後は from を両方に使う。
 * kind: call ／ awaitsReply: true は最頻値（design-notes 論点9）
 */
export function addStepAfter(d: SequenceSchemaVersion1, index: number): SeqEditResult {
  const prev = d.steps[index]
  if (prev === undefined) return { data: d, focus: null }
  const from = prev.to ?? prev.from
  const to = prev.from
  const steps = insertAt(d.steps, index + 1, newStep(from, to))
  return { data: withSteps(d, steps), focus: { kind: 'step', index: index + 1 } }
}

/** ツールバーの「ステップを追加」。最初の1本の入口でもある */
export function addStepLast(d: SequenceSchemaVersion1): SeqEditResult {
  if (d.steps.length > 0) return addStepAfter(d, d.steps.length - 1)
  const first = d.actors[0]
  if (first === undefined) return { data: d, focus: null }
  const second = d.actors[1] ?? first
  const steps = [...d.steps, newStep(first.id, second.id)]
  return { data: withSteps(d, steps), focus: { kind: 'step', index: 0 } }
}

export function removeStep(d: SequenceSchemaVersion1, index: number): SeqEditResult {
  if (d.steps[index] === undefined) return { data: d, focus: null }
  const steps = removeAt(d.steps, index)
  // 行き先は削除前の位置で決める: 前の行 → （先頭なら）次の行 → 無し
  const at = Math.min(Math.max(index - 1, 0), steps.length - 1)
  return {
    data: withSteps(d, steps),
    focus: steps.length === 0 ? null : { kind: 'step', index: at },
  }
}

export function moveStep(d: SequenceSchemaVersion1, index: number, delta: -1 | 1): SeqEditResult {
  const to = index + delta
  const moved = moveItem(d.steps, index, to)
  const changed = moved.some((s, i) => s !== d.steps[i])
  return changed
    ? { data: withSteps(d, moved), focus: { kind: 'step', index: to } }
    : { data: d, focus: null }
}

export function setStepLabel(
  d: SequenceSchemaVersion1,
  index: number,
  label: string,
): SequenceSchemaVersion1 {
  return replaceStep(d, index, { ...d.steps[index], label })
}

export function setStepActor(
  d: SequenceSchemaVersion1,
  index: number,
  field: 'from' | 'to',
  actorId: string,
): SequenceSchemaVersion1 {
  return replaceStep(d, index, { ...d.steps[index], [field]: actorId })
}

/**
 * 未登録の名前が確定されたら、参加者を末尾に足して参照を差し替える（1操作＝
 * 1履歴）。同一ファイル内で完結するインライン登録であり、rev 6章の
 * クロスファイルのインライン登録（用語集）とは別物
 */
export function createActorAndAssign(
  d: SequenceSchemaVersion1,
  stepIndex: number,
  field: 'from' | 'to',
  name: string,
): SequenceSchemaVersion1 {
  const actor: SequenceActor = { id: newId('actor'), name }
  const withActor = withActors(d, [...d.actors, actor])
  return setStepActor(withActor, stepIndex, field, actor.id)
}

// ---- kind × awaitsReply（画面は1トグル、データは2フィールド） ----

export type StepShapeValue = 'call-sync' | 'call-async' | 'reply' | 'self'

export const STEP_SHAPE_ORDER: readonly StepShapeValue[] = [
  'call-sync',
  'call-async',
  'reply',
  'self',
]

export const STEP_SHAPE_LABEL: Record<StepShapeValue, string> = {
  'call-sync': '呼出',
  'call-async': '呼出（応答なし）',
  reply: '応答',
  self: '内部処理',
}

export function stepShapeOf(step: SequenceStep): StepShapeValue {
  if (step.kind === 'reply') return 'reply'
  if (step.kind === 'self') return 'self'
  return step.awaitsReply === false ? 'call-async' : 'call-sync'
}

/**
 * 形を変える。**failures は消さない**——立たなくなった問いへの答えは
 * unposed-answer の赤表示で残る（ファイルにあるものが黙って減るのが
 * 一番たちが悪い。logic-tree の orderNodes と同じ原則）
 */
export function setStepShape(
  d: SequenceSchemaVersion1,
  index: number,
  shape: StepShapeValue,
): SequenceSchemaVersion1 {
  const { awaitsReply: _aw, to, ...rest } = d.steps[index]
  switch (shape) {
    case 'call-sync':
      return replaceStep(d, index, { ...rest, ...(to === undefined ? {} : { to }), kind: 'call', awaitsReply: true })
    case 'call-async':
      return replaceStep(d, index, { ...rest, ...(to === undefined ? {} : { to }), kind: 'call', awaitsReply: false })
    case 'reply':
      return replaceStep(d, index, { ...rest, ...(to === undefined ? {} : { to }), kind: 'reply' })
    case 'self':
      return replaceStep(d, index, { ...rest, kind: 'self' })
  }
}

// ---- 答えスロット ----

type Failures = NonNullable<SequenceStep['failures']>

/** failures / unknown の空オブジェクトを残さない後片付け */
function cleanupFailures(step: SequenceStep, failures: Failures): SequenceStep {
  const unknown = failures.unknown
  const cleanedUnknown =
    unknown !== undefined && unknown.decision === undefined && unknown.ifExecuted === undefined
      ? undefined
      : unknown
  const next: Failures = {}
  if (failures.failed !== undefined) next.failed = failures.failed
  if (cleanedUnknown !== undefined) next.unknown = cleanedUnknown
  const { failures: _old, ...rest } = step
  return Object.keys(next).length === 0 ? rest : { ...rest, failures: next }
}

function readSlot(
  step: SequenceStep,
  path: AnswerPath,
): { decision?: 'handled' | 'notApplicable'; text?: string } {
  if (path === 'failed') return step.failures?.failed ?? {}
  if (path === 'unknown') {
    const u = step.failures?.unknown
    return u === undefined ? {} : { decision: u.decision, text: u.text }
  }
  return step.failures?.unknown?.ifExecuted ?? {}
}

function writeSlot(
  step: SequenceStep,
  path: AnswerPath,
  slot: { decision?: 'handled' | 'notApplicable'; text?: string } | undefined,
): SequenceStep {
  const failures: Failures = { ...(step.failures ?? {}) }
  if (path === 'failed') {
    if (slot === undefined || slot.decision === undefined) delete failures.failed
    else failures.failed = { decision: slot.decision, text: slot.text ?? '' } as Failures['failed']
  } else if (path === 'unknown') {
    const prev = failures.unknown ?? {}
    const next = { ...prev }
    if (slot === undefined || slot.decision === undefined) {
      delete next.decision
      delete next.text
    } else {
      next.decision = slot.decision
      if (slot.text === undefined) delete next.text
      else next.text = slot.text
    }
    failures.unknown = next
  } else {
    const prev = failures.unknown ?? {}
    const next = { ...prev }
    if (slot === undefined || slot.decision === undefined) delete next.ifExecuted
    else next.ifExecuted = { decision: slot.decision, text: slot.text ?? '' } as NonNullable<
      Failures['unknown']
    >['ifExecuted']
    failures.unknown = next
  }
  return cleanupFailures(step, failures)
}

/**
 * 答えの入力。空でない text ＝ handled（notApplicable の上から打てば handled に
 * 戻る）。空文字＝スロットを未定義へ戻す。**handled で text 空の状態を
 * 作らない**——それはスキーマ（レベル1）違反であり、自動保存が壊れた
 * ファイルを書くことになる
 */
export function setAnswerText(
  d: SequenceSchemaVersion1,
  index: number,
  path: AnswerPath,
  text: string,
): SequenceSchemaVersion1 {
  const step = d.steps[index]
  if (step === undefined) return d
  const slot = text === '' ? undefined : { decision: 'handled' as const, text }
  return replaceStep(d, index, writeSlot(step, path, slot))
}

/**
 * Ctrl+Enter のトグル（design-notes 論点9）。
 * 未定義 → notApplicable ／ notApplicable → text があれば handled・無ければ未定義
 * ／ handled → notApplicable（text は理由メモとして温存）
 */
export function toggleNotApplicable(
  d: SequenceSchemaVersion1,
  index: number,
  path: AnswerPath,
): SequenceSchemaVersion1 {
  const step = d.steps[index]
  if (step === undefined) return d
  const current = readSlot(step, path)
  let next: { decision?: 'handled' | 'notApplicable'; text?: string } | undefined
  if (current.decision === 'notApplicable') {
    next =
      current.text !== undefined && current.text !== ''
        ? { decision: 'handled', text: current.text }
        : undefined
  } else {
    next = { decision: 'notApplicable', ...(current.text ? { text: current.text } : {}) }
  }
  return replaceStep(d, index, writeSlot(step, path, next))
}
```

注意: 生成型の `failures` の形（`oneOf` 由来のユニオン）と上のキャストが合わない場合は、キャストを生成型の実物に合わせて調整し、**調整内容を報告に書く**。

- [ ] **Step 4: テストが通ることを確認してコミット**

```bash
npx vitest run src/modules/sequence/commands.test.ts && npx tsc -b
git add src/modules/sequence/commands.ts src/modules/sequence/commands.test.ts
git commit -m "feat(sequence): 編集コマンドを実装する"
```

---

### Task 5: コアの keymap 改修（horizontal / toggle-item-state / ←→ の arrowsOwnedByField）

**Files:**
- Modify: `src/core/keyboard/keymap.ts`
- Test: `src/core/keyboard/keymap.test.ts`（既存ファイルに追記）

**Interfaces:**
- Produces: `Command` に `'toggle-item-state'` を追加／`KeyContext` に `horizontal: boolean` を追加。**既存の全呼び出し箇所（`KeyContext` を組んでいる場所）に `horizontal: false` を足す必要がある。** 対象は grep で列挙すること:

```bash
grep -rln "hierarchical:" src/ --include="*.tsx" --include="*.ts" | grep -v test | grep -v keymap.ts
```

計画時点の把握では `src/modules/glossary/GlossaryEditor.tsx`・`src/modules/glossary/AliasCell.tsx`・`src/modules/error-catalog/ErrorCatalogEditor.tsx`・`src/modules/logic-tree/LogicTreeEditor.tsx` の4箇所（logic-tree M1 の教訓: **計画の件数を信用せず、上の grep の出力を正とする**）。

この改修は3点で、いずれも「既存の一元化された機構に意味を足す」もの（logic-tree M1 が `hierarchical` を足したのと同じ性質）:

1. **`horizontal: true`**（参加者ヘッダ用）: `Alt+←→`＝並び替え、`←→`＝キャレット端で隣の要素へ移動。`↑↓` と `Alt+↑↓` は関与しない（null）
2. **`toggle-item-state`**: 主修飾キー＋Enter。答えスロットの「考慮不要」トグルに使う。割り当てが無かったキーなので既存ツールに影響しない（受け取らないツールは無視して既定動作＝何も起きない）
3. **`←→` が `arrowsOwnedByField` を見るようにする**: open-issues 記載の既知の穴（「将来の機能を作った瞬間に踏むもの」）。select 系フィールド（from/to/形トグル）を持つ本ツールが1本目の該当

- [ ] **Step 1: 失敗するテストを既存の keymap.test.ts に追記する**

```ts
// ---- sequence M1 で足した分: horizontal / toggle-item-state / ←→ の arrowsOwnedByField ----

import { resolveCommand } from './keymap'
// （既存テストの ctx ヘルパがあればそれを使う。無ければ以下の形で全フィールドを明示）

function ctx(over: Partial<KeyContext> = {}): KeyContext {
  return {
    platform: 'other',
    modalOpen: false,
    editing: true,
    fieldEmpty: false,
    deletableField: true,
    caretAtStart: true,
    caretAtEnd: true,
    arrowsOwnedByField: false,
    reorderEnabled: true,
    hierarchical: false,
    horizontal: false,
    ...over,
  }
}

const key = (k: string, over: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key: k,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
  ...over,
})

describe('horizontal（横リスト＝参加者ヘッダ）', () => {
  it('Alt+← は move-item-up（前へ）、Alt+→ は move-item-down（次へ）', () => {
    expect(resolveCommand(key('ArrowLeft', { altKey: true }), ctx({ horizontal: true }))).toBe('move-item-up')
    expect(resolveCommand(key('ArrowRight', { altKey: true }), ctx({ horizontal: true }))).toBe('move-item-down')
  })
  it('素の ←→ はキャレット端でだけ focus-prev / focus-next', () => {
    expect(resolveCommand(key('ArrowLeft'), ctx({ horizontal: true }))).toBe('focus-prev')
    expect(resolveCommand(key('ArrowLeft'), ctx({ horizontal: true, caretAtStart: false }))).toBeNull()
    expect(resolveCommand(key('ArrowRight'), ctx({ horizontal: true }))).toBe('focus-next')
    expect(resolveCommand(key('ArrowRight'), ctx({ horizontal: true, caretAtEnd: false }))).toBeNull()
  })
  it('horizontal では Alt+↑↓ は並び替えにならない（縦の意味が無い）', () => {
    expect(resolveCommand(key('ArrowUp', { altKey: true }), ctx({ horizontal: true }))).toBeNull()
    expect(resolveCommand(key('ArrowDown', { altKey: true }), ctx({ horizontal: true }))).toBeNull()
  })
  it('reorderEnabled: false なら Alt+←→ も無効', () => {
    expect(
      resolveCommand(key('ArrowLeft', { altKey: true }), ctx({ horizontal: true, reorderEnabled: false })),
    ).toBeNull()
  })
})

describe('toggle-item-state（主修飾キー＋Enter）', () => {
  it('Ctrl+Enter で toggle-item-state', () => {
    expect(resolveCommand(key('Enter', { ctrlKey: true }), ctx())).toBe('toggle-item-state')
  })
  it('mac では Cmd+Enter', () => {
    expect(resolveCommand(key('Enter', { metaKey: true }), ctx({ platform: 'mac' }))).toBe('toggle-item-state')
  })
  it('Shift や Alt が付いたら関与しない', () => {
    expect(resolveCommand(key('Enter', { ctrlKey: true, shiftKey: true }), ctx())).toBeNull()
    expect(resolveCommand(key('Enter', { ctrlKey: true, altKey: true }), ctx())).toBeNull()
  })
})

describe('←→ と arrowsOwnedByField（open-issues の穴の解消）', () => {
  it('hierarchical でも欄が矢印を使うなら ←→ は欄のもの', () => {
    expect(
      resolveCommand(key('ArrowLeft'), ctx({ hierarchical: true, arrowsOwnedByField: true })),
    ).toBeNull()
    expect(
      resolveCommand(key('ArrowRight'), ctx({ hierarchical: true, arrowsOwnedByField: true })),
    ).toBeNull()
  })
  it('horizontal でも同様', () => {
    expect(
      resolveCommand(key('ArrowLeft'), ctx({ horizontal: true, arrowsOwnedByField: true })),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/core/keyboard/keymap.test.ts`
Expected: 追記分が FAIL（`horizontal` が型に無い時点で tsc レベルで落ちる）

- [ ] **Step 3: keymap.ts を改修する**

変更点は4箇所:

(1) `Command` に追加:

```ts
export type Command =
  | 'undo'
  // ...既存のまま...
  | 'focus-prev-field'
  /** 欄の状態トグル（主修飾キー＋Enter）。sequence の答えスロットの「考慮不要」が使う。意味を持たないツールは無視してよい */
  | 'toggle-item-state'
```

(2) `KeyContext` に追加:

```ts
  /**
   * 横に並ぶリストか（シーケンスの参加者ヘッダ）。true のとき Alt+←→ が
   * 並び替え、←→ がキャレット端で隣への移動になり、↑↓ は関与しない。
   * hierarchical と同時に true にしないこと
   */
  horizontal: boolean
```

(3) 主修飾キーの分岐に Enter を足す（`return null` の直前）:

```ts
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) return 'toggle-item-state'
```

(4) 矢印の分岐を差し替える:

```ts
    case 'ArrowUp':
      if (ctx.horizontal) return null
      if (e.altKey) return ctx.reorderEnabled ? 'move-item-up' : null
      if (e.shiftKey || ctx.arrowsOwnedByField) return null
      return !ctx.editing || ctx.caretAtStart ? 'focus-prev' : null
    case 'ArrowDown':
      if (ctx.horizontal) return null
      if (e.altKey) return ctx.reorderEnabled ? 'move-item-down' : null
      if (e.shiftKey || ctx.arrowsOwnedByField) return null
      return !ctx.editing || ctx.caretAtEnd ? 'focus-next' : null
    case 'ArrowLeft':
      if (ctx.horizontal) {
        if (e.altKey) return ctx.reorderEnabled && !e.shiftKey ? 'move-item-up' : null
        if (e.shiftKey || ctx.arrowsOwnedByField) return null
        return !ctx.editing || ctx.caretAtStart ? 'focus-prev' : null
      }
      if (!ctx.hierarchical || e.altKey || e.shiftKey) return null
      // 欄が矢印を使うなら欄のもの。端でだけ構造の移動に切り替える（↑↓ と同じ規則）
      if (ctx.arrowsOwnedByField) return null
      return !ctx.editing || ctx.caretAtStart ? 'focus-parent' : null
    case 'ArrowRight':
      if (ctx.horizontal) {
        if (e.altKey) return ctx.reorderEnabled && !e.shiftKey ? 'move-item-down' : null
        if (e.shiftKey || ctx.arrowsOwnedByField) return null
        return !ctx.editing || ctx.caretAtEnd ? 'focus-next' : null
      }
      if (!ctx.hierarchical || e.altKey || e.shiftKey) return null
      if (ctx.arrowsOwnedByField) return null
      return !ctx.editing || ctx.caretAtEnd ? 'focus-child' : null
```

- [ ] **Step 4: 既存の全呼び出し箇所に `horizontal: false` を足す**

Step 1 の grep が出した各ファイルの `KeyContext` 組み立てに `horizontal: false,` を1行足す。`hierarchical` の隣に置く。

- [ ] **Step 5: 全テストを回してコミット**

```bash
npm test && npx tsc -b && npm run lint
```

Expected: 全緑。既存テストがどれか落ちたら、それは呼び出し箇所の直し漏れか既存テストの `ctx` ヘルパの更新漏れ——**追加した3変更のどれが原因かを特定してから直す**。

```bash
git add src/core/keyboard/keymap.ts src/core/keyboard/keymap.test.ts src/modules/glossary/GlossaryEditor.tsx src/modules/glossary/AliasCell.tsx src/modules/error-catalog/ErrorCatalogEditor.tsx src/modules/logic-tree/LogicTreeEditor.tsx
git commit -m "feat(keyboard): horizontal と toggle-item-state を足し、←→ が arrowsOwnedByField を見るようにする"
```

（コミット対象は grep の実出力に合わせること）

---

### Task 6: 測定層

**Files:**
- Create: `src/modules/sequence/measure.ts`、`src/modules/sequence/seq-font.ts`
- Test: `src/modules/sequence/measure.test.ts`

**Interfaces:**
- Produces: `wrapWithin(text, measure, lineHeight, opts) → WrappedBlock`／定数 `LABEL_MAX_WIDTH` `LABEL_MIN_WIDTH` `ANSWER_CONTENT_WIDTH` `ACTOR_MIN_WIDTH` ほか／`seq-font.ts` は logic-tree の `node-font.ts` と同じ公開名（`readNodeFont` → `readSeqFont` 等にリネーム）
- Consumes: なし（DOM 非依存の純関数）

- [ ] **Step 1: seq-font.ts を複製する**

```bash
cp src/modules/logic-tree/node-font.ts src/modules/sequence/seq-font.ts
```

複製後、`seq-font.ts` の先頭コメントに1行足す:

```ts
// logic-tree/node-font.ts の複製（sequence M1）。core/canvas への共通化は
// 2本目完成後に別マイルストーンで判断する（scope の禁止事項）。差分を
// 作らないこと——直すときは両方を直し、open-issues の複製の項に従う
```

エクスポート名は `NodeFont`→`SeqFont`、`FALLBACK_NODE_FONT`→`FALLBACK_SEQ_FONT`、`readNodeFont`→`readSeqFont`、`createNodeMeasurer`→`createSeqMeasurer`、`sameFont` はそのまま。中身のロジックは**1文字も変えない**。

- [ ] **Step 2: measure の失敗するテストを書く**

`src/modules/sequence/measure.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createEstimateMeasurer, wrapWithin, LABEL_MAX_WIDTH, LABEL_INSET_X } from './measure'

const measure = createEstimateMeasurer(14)
const LH = 23.1

describe('wrapWithin', () => {
  it('収まる文言は1行', () => {
    const w = wrapWithin('注文', measure, LH, { maxWidth: LABEL_MAX_WIDTH, minWidth: 64, insetX: LABEL_INSET_X, insetY: 4 })
    expect(w.lines).toEqual(['注文'])
  })

  it('最大幅を超えると折り返す（測定と同じ規則で行が確定する）', () => {
    const long = 'あ'.repeat(40)
    const w = wrapWithin(long, measure, LH, { maxWidth: LABEL_MAX_WIDTH, minWidth: 64, insetX: LABEL_INSET_X, insetY: 4 })
    expect(w.lines.length).toBeGreaterThan(1)
    expect(w.lines.join('')).toBe(long)
    expect(w.width).toBeLessThanOrEqual(LABEL_MAX_WIDTH)
  })

  it('明示改行は折り返しと別に効く', () => {
    const w = wrapWithin('a\nb', measure, LH, { maxWidth: LABEL_MAX_WIDTH, minWidth: 64, insetX: LABEL_INSET_X, insetY: 4 })
    expect(w.lines).toEqual(['a', 'b'])
  })

  it('最小幅を下回らない', () => {
    const w = wrapWithin('', measure, LH, { maxWidth: LABEL_MAX_WIDTH, minWidth: 64, insetX: LABEL_INSET_X, insetY: 4 })
    expect(w.width).toBe(64)
  })

  it('高さ＝行数×行高＋上下の余白', () => {
    const w = wrapWithin('a\nb\nc', measure, LH, { maxWidth: LABEL_MAX_WIDTH, minWidth: 64, insetX: LABEL_INSET_X, insetY: 4 })
    expect(w.height).toBe(Math.ceil(3 * LH) + 8)
  })
})
```

- [ ] **Step 3: 落ちることを確認**

Run: `npx vitest run src/modules/sequence/measure.test.ts`
Expected: FAIL

- [ ] **Step 4: measure.ts を実装する**

`src/modules/sequence/measure.ts`（logic-tree の `wrapText` を、用途別の幅を引数で受ける形に一般化した複製。アルゴリズム＝コードポイント単位のグリーディは同一）:

```ts
/**
 * 測定層（DOM 非依存・純関数）。logic-tree/measure.ts と同じ1パス方針:
 * 「入力 → サイズ計算 → レイアウト → 一度だけ描画」。
 * 折り返しはコードポイント単位のグリーディで、CSS の break-all と同じ規則。
 * （複製の記録: 共通化は2本目完成後に別マイルストーンで判断）
 */

/** ステップ文言の最大幅。logic-tree のノードと同じ値（tech-notes 論点4の根拠を引き継ぐ） */
export const LABEL_MAX_WIDTH = 320
export const LABEL_MIN_WIDTH = 64
export const LABEL_PADDING_X = 6
export const LABEL_PADDING_Y = 2
export const LABEL_BORDER = 0
export const LABEL_INSET_X = LABEL_PADDING_X + LABEL_BORDER
export const LABEL_INSET_Y = LABEL_PADDING_Y + LABEL_BORDER
/** 上の定数に対応する Tailwind クラス。片方だけ変えないこと */
export const LABEL_BOX_CLASS = 'px-1.5 py-0.5'

/** self ボックス。枠線があるぶん inset が違う */
export const SELF_PADDING_X = 10
export const SELF_PADDING_Y = 6
export const SELF_BORDER = 1
export const SELF_INSET_X = SELF_PADDING_X + SELF_BORDER
export const SELF_INSET_Y = SELF_PADDING_Y + SELF_BORDER
export const SELF_MIN_WIDTH = 96
export const SELF_BOX_CLASS = 'border px-2.5 py-1.5'

/** 参加者ヘッダ */
export const ACTOR_MIN_WIDTH = 96
export const ACTOR_MAX_WIDTH = 240
export const ACTOR_PADDING_X = 12
export const ACTOR_BORDER = 1
export const ACTOR_INSET_X = ACTOR_PADDING_X + ACTOR_BORDER
export const ACTOR_BOX_CLASS = 'border px-3 py-1'

/** ガターの答えセル。内容幅は固定（design-notes 論点7: ガター幅は導出しない） */
export const ANSWER_CONTENT_WIDTH = 240
export const ANSWER_PADDING_X = 8
export const ANSWER_PADDING_Y = 4
export const ANSWER_BORDER = 1
export const ANSWER_INSET_X = ANSWER_PADDING_X + ANSWER_BORDER
export const ANSWER_INSET_Y = ANSWER_PADDING_Y + ANSWER_BORDER
export const ANSWER_BOX_CLASS = 'border px-2 py-1'

export type MeasureWidth = (text: string) => number

export interface WrapOptions {
  maxWidth: number
  minWidth: number
  insetX: number
  insetY: number
}

export interface WrappedBlock {
  lines: string[]
  width: number
  height: number
}

export function wrapWithin(
  text: string,
  measure: MeasureWidth,
  lineHeight: number,
  opts: WrapOptions,
): WrappedBlock {
  const maxContent = opts.maxWidth - opts.insetX * 2
  const lines: string[] = []
  for (const segment of text.split('\n')) {
    let line = ''
    for (const ch of segment) {
      if (line === '') {
        line = ch
        continue
      }
      if (measure(line + ch) > maxContent) {
        lines.push(line)
        line = ch
      } else {
        line += ch
      }
    }
    lines.push(line)
  }
  const contentWidth = lines.reduce((w, line) => Math.max(w, measure(line)), 0)
  const width = Math.min(
    opts.maxWidth,
    Math.max(opts.minWidth, Math.ceil(contentWidth) + opts.insetX * 2),
  )
  const height = Math.ceil(lines.length * lineHeight) + opts.insetY * 2
  return { lines, width, height }
}

/** jsdom 用の概算器（logic-tree/measure.ts と同じ。本番では使わない） */
export function createEstimateMeasurer(fontSize: number): MeasureWidth {
  return (text) => {
    let width = 0
    for (const ch of text) {
      width += ((ch.codePointAt(0) ?? 0) < 0x80 ? 0.5 : 1) * fontSize
    }
    return width
  }
}
```

- [ ] **Step 5: テストが通ることを確認してコミット**

```bash
npx vitest run src/modules/sequence/measure.test.ts && npx tsc -b
git add src/modules/sequence/measure.ts src/modules/sequence/seq-font.ts src/modules/sequence/measure.test.ts
git commit -m "feat(sequence): 測定層を実装する"
```

---

### Task 7: レイアウト層

**Files:**
- Create: `src/modules/sequence/layout.ts`
- Test: `src/modules/sequence/layout.test.ts`

**Interfaces:**
- Consumes: なし（純関数。測定結果は数値で受け取る）
- Produces:

```ts
export interface StepMetrics { labelWidth: number; labelHeight: number; slotHeights: number[] }
export interface SeqLayoutInput {
  actorWidths: number[]                    // 参加者ヘッダの幅（actors 配列順）
  domains: (string | undefined)[]          // 参加者の domain（境界線の導出用）
  steps: { fromIndex: number; toIndex: number | null; metrics: StepMetrics }[]
                                           // fromIndex/toIndex は actors 配列の添字。参照切れは null
}
export interface SeqRow { top: number; height: number; arrowY: number; slotTops: number[] }
export interface SeqLayoutResult {
  actorX: number[]        // ライフライン中心 x
  headerTop: number       // ヘッダ上端（=0）
  headerHeight: number
  rows: SeqRow[]
  boundaries: number[]    // 境界線の x
  gutterX: number         // ガター左端 x
  gutterWidth: number
  totalWidth: number
  totalHeight: number
}
export function layoutSequence(input: SeqLayoutInput): SeqLayoutResult
export const MIN_COL_GAP = 160
export const HEADER_HEIGHT = 36
export const FIRST_ROW_GAP = 16
export const MIN_ROW_HEIGHT = 44
export const ARROW_GAP = 8       // ラベル下端から矢印までの距離
export const SLOT_GAP = 4        // ガターのスロット間
export const ROW_GAP = 8
export const GUTTER_GAP = 48     // 最後のライフラインからガターまで
export const QUESTION_LABEL_WIDTH = 104  // ガターの問いラベル列の幅
export const DIAGRAM_MARGIN = 8
```

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/sequence/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ARROW_GAP,
  GUTTER_GAP,
  HEADER_HEIGHT,
  layoutSequence,
  MIN_COL_GAP,
  MIN_ROW_HEIGHT,
  QUESTION_LABEL_WIDTH,
  SLOT_GAP,
  type SeqLayoutInput,
} from './layout'
import { ANSWER_CONTENT_WIDTH, ANSWER_INSET_X } from './measure'

const metrics = (labelWidth = 80, labelHeight = 24, slotHeights: number[] = []) => ({
  labelWidth,
  labelHeight,
  slotHeights,
})

function input(over: Partial<SeqLayoutInput> = {}): SeqLayoutInput {
  return {
    actorWidths: [96, 96, 96],
    domains: [undefined, undefined, undefined],
    steps: [
      { fromIndex: 0, toIndex: 1, metrics: metrics() },
      { fromIndex: 1, toIndex: 2, metrics: metrics(80, 24, [28, 28, 28]) },
      { fromIndex: 2, toIndex: null, metrics: metrics() },
    ],
    ...over,
  }
}

describe('layoutSequence', () => {
  it('純粋関数: 同じ入力から同じ出力（2回呼んで一致）', () => {
    expect(layoutSequence(input())).toEqual(layoutSequence(input()))
  })

  it('列間隔は最小値を下回らない', () => {
    const r = layoutSequence(input())
    expect(r.actorX[1] - r.actorX[0]).toBeGreaterThanOrEqual(MIN_COL_GAP)
    expect(r.actorX[2] - r.actorX[1]).toBeGreaterThanOrEqual(MIN_COL_GAP)
  })

  it('長いラベルが跨ぐ区間は広がる（3列のうち中央の区間だけ）', () => {
    const wide = input()
    wide.steps[1] = { fromIndex: 1, toIndex: 2, metrics: metrics(300, 24) }
    const r = layoutSequence(wide)
    const base = layoutSequence(input())
    expect(r.actorX[2] - r.actorX[1]).toBeGreaterThan(base.actorX[2] - base.actorX[1])
    expect(r.actorX[1] - r.actorX[0]).toBe(base.actorX[1] - base.actorX[0])
  })

  it('複数区間を跨ぐ矢印は各区間に分配される（両区間が均等に広がる）', () => {
    const span = input()
    span.steps[0] = { fromIndex: 0, toIndex: 2, metrics: metrics(500, 24) }
    const r = layoutSequence(span)
    const gap01 = r.actorX[1] - r.actorX[0]
    const gap12 = r.actorX[2] - r.actorX[1]
    expect(gap01).toBeGreaterThan(MIN_COL_GAP)
    expect(gap01).toBe(gap12)
  })

  it('行の高さ: ガターのスロット群がラベルより高い行は、スロット群に合わせて伸びる', () => {
    const r = layoutSequence(input())
    const slots = 28 * 3 + SLOT_GAP * 2
    expect(r.rows[1].height).toBeGreaterThanOrEqual(slots)
    expect(r.rows[0].height).toBe(Math.max(MIN_ROW_HEIGHT, 24 + ARROW_GAP * 2))
  })

  it('行は上から順に積まれ、重ならない', () => {
    const r = layoutSequence(input())
    expect(r.rows[0].top).toBeGreaterThanOrEqual(HEADER_HEIGHT)
    expect(r.rows[1].top).toBeGreaterThanOrEqual(r.rows[0].top + r.rows[0].height)
    expect(r.rows[2].top).toBeGreaterThanOrEqual(r.rows[1].top + r.rows[1].height)
  })

  it('slotTops はスロットの数だけ、行の中で上から積まれる', () => {
    const r = layoutSequence(input())
    expect(r.rows[1].slotTops).toHaveLength(3)
    expect(r.rows[1].slotTops[0]).toBe(r.rows[1].top)
    expect(r.rows[1].slotTops[1]).toBe(r.rows[1].top + 28 + SLOT_GAP)
  })

  it('境界線: 双方が指定済みかつ異なる隣接間だけに出る', () => {
    const r = layoutSequence(input({ domains: ['自社', '自社', '決済会社'] }))
    expect(r.boundaries).toHaveLength(1)
    expect(r.boundaries[0]).toBeGreaterThan(r.actorX[1])
    expect(r.boundaries[0]).toBeLessThan(r.actorX[2])
    // 片方未指定は境界にしない
    expect(layoutSequence(input({ domains: [undefined, '自社', '自社'] })).boundaries).toHaveLength(0)
  })

  it('ガターは最後のライフラインの右', () => {
    const r = layoutSequence(input())
    expect(r.gutterX).toBeGreaterThanOrEqual(r.actorX[2] + 96 / 2 + GUTTER_GAP)
    expect(r.gutterWidth).toBe(QUESTION_LABEL_WIDTH + ANSWER_CONTENT_WIDTH + ANSWER_INSET_X * 2)
  })

  it('参加者0人・ステップ0件でも壊れない', () => {
    const r = layoutSequence({ actorWidths: [], domains: [], steps: [] })
    expect(r.rows).toEqual([])
    expect(r.actorX).toEqual([])
  })
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/sequence/layout.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/modules/sequence/layout.ts`:

```ts
/**
 * レイアウト層（完全な純粋関数。design-notes 論点8）。
 * X＝actors 配列順（列間隔は区間を跨ぐ矢印ラベルの最大要求から導出）、
 * Y＝steps 配列順（行高＝max(ラベル, ガターのスロット群)）。
 * ここに「前回どこにあったか」を持ち込まないこと——同じデータから
 * 同じ図が出ることが「図は導出」のコードレベルの担保である
 */
import { ANSWER_CONTENT_WIDTH, ANSWER_INSET_X } from './measure'

export const MIN_COL_GAP = 160
export const HEADER_HEIGHT = 36
export const FIRST_ROW_GAP = 16
export const MIN_ROW_HEIGHT = 44
export const ARROW_GAP = 8
export const SLOT_GAP = 4
export const ROW_GAP = 8
export const GUTTER_GAP = 48
export const QUESTION_LABEL_WIDTH = 104
export const DIAGRAM_MARGIN = 8
/** ラベルが矢印より広いときに列間へ足す左右の逃げ */
const LABEL_SIDE_PAD = 24

export interface StepMetrics {
  labelWidth: number
  labelHeight: number
  slotHeights: number[]
}

export interface SeqLayoutInput {
  actorWidths: number[]
  domains: (string | undefined)[]
  steps: { fromIndex: number; toIndex: number | null; metrics: StepMetrics }[]
}

export interface SeqRow {
  top: number
  height: number
  arrowY: number
  slotTops: number[]
}

export interface SeqLayoutResult {
  actorX: number[]
  headerTop: number
  headerHeight: number
  rows: SeqRow[]
  boundaries: number[]
  gutterX: number
  gutterWidth: number
  totalWidth: number
  totalHeight: number
}

export function layoutSequence(input: SeqLayoutInput): SeqLayoutResult {
  const n = input.actorWidths.length

  // ---- X 軸: 隣接区間ごとの必要幅を集め、跨ぐ矢印は区間数で均等割り ----
  const gaps = new Array<number>(Math.max(0, n - 1)).fill(MIN_COL_GAP)
  for (const step of input.steps) {
    if (step.toIndex === null || step.toIndex === step.fromIndex) continue
    const lo = Math.min(step.fromIndex, step.toIndex)
    const hi = Math.max(step.fromIndex, step.toIndex)
    if (lo < 0 || hi >= n) continue
    const need = (step.metrics.labelWidth + LABEL_SIDE_PAD) / (hi - lo)
    for (let g = lo; g < hi; g++) gaps[g] = Math.max(gaps[g], need)
  }
  // ヘッダ同士がぶつからない下限も足す
  for (let g = 0; g < gaps.length; g++) {
    const need = input.actorWidths[g] / 2 + input.actorWidths[g + 1] / 2 + 16
    gaps[g] = Math.max(gaps[g], need)
  }
  const actorX: number[] = []
  let x = DIAGRAM_MARGIN + (input.actorWidths[0] ?? 0) / 2
  for (let i = 0; i < n; i++) {
    actorX.push(x)
    x += gaps[i] ?? 0
  }

  // ---- 境界線: 双方が指定済みかつ異なる隣接間の中点 ----
  const boundaries: number[] = []
  for (let i = 0; i + 1 < n; i++) {
    const a = input.domains[i]
    const b = input.domains[i + 1]
    if (a !== undefined && b !== undefined && a !== b) {
      boundaries.push((actorX[i] + actorX[i + 1]) / 2)
    }
  }

  // ---- Y 軸: 行を上から積む ----
  const rows: SeqRow[] = []
  let top = HEADER_HEIGHT + FIRST_ROW_GAP
  for (const step of input.steps) {
    const m = step.metrics
    const slotsHeight =
      m.slotHeights.length === 0
        ? 0
        : m.slotHeights.reduce((a, b) => a + b, 0) + SLOT_GAP * (m.slotHeights.length - 1)
    const height = Math.max(MIN_ROW_HEIGHT, m.labelHeight + ARROW_GAP * 2, slotsHeight)
    const arrowY = top + m.labelHeight + ARROW_GAP
    const slotTops: number[] = []
    let slotTop = top
    for (const h of m.slotHeights) {
      slotTops.push(slotTop)
      slotTop += h + SLOT_GAP
    }
    rows.push({ top, height, arrowY, slotTops })
    top += height + ROW_GAP
  }

  // ---- ガター ----
  const lastRight = n === 0 ? DIAGRAM_MARGIN : actorX[n - 1] + input.actorWidths[n - 1] / 2
  const gutterX = lastRight + GUTTER_GAP
  const gutterWidth = QUESTION_LABEL_WIDTH + ANSWER_CONTENT_WIDTH + ANSWER_INSET_X * 2

  return {
    actorX,
    headerTop: 0,
    headerHeight: HEADER_HEIGHT,
    rows,
    boundaries,
    gutterX,
    gutterWidth,
    totalWidth: gutterX + gutterWidth + DIAGRAM_MARGIN,
    totalHeight: top,
  }
}
```

- [ ] **Step 4: テストが通ることを確認する。1行壊して落ちることも確認する**

```bash
npx vitest run src/modules/sequence/layout.test.ts
```

Expected: PASS。その後、`need` の割り算（`/ (hi - lo)`）を消して「複数区間を跨ぐ矢印」のテストが落ちること、`Math.max(gaps[g], need)` を `need` にして「最小値」のテストが落ちることを確認し、戻す（順序を固定するテストの検証。lessons-for-planning）。

- [ ] **Step 5: コミット**

```bash
git add src/modules/sequence/layout.ts src/modules/sequence/layout.test.ts
git commit -m "feat(sequence): レイアウト層を実装する"
```

---

### Task 8: ビューポートの複製

**Files:**
- Create: `src/modules/sequence/viewport.ts`、`viewport.test.ts`、`useViewport.ts`、`useViewport.dom.test.tsx`（いずれも logic-tree からの複製）

**Interfaces:**
- Produces: `useViewport(ref, enabled) → { transform, spaceHeld, ensureVisible }`、`cssTransform` / `svgTransform` / `panIntoView`（logic-tree と同一シグネチャ）

- [ ] **Step 1: 4ファイルを複製する**

```bash
cp src/modules/logic-tree/viewport.ts src/modules/sequence/viewport.ts
cp src/modules/logic-tree/viewport.test.ts src/modules/sequence/viewport.test.ts
cp src/modules/logic-tree/useViewport.ts src/modules/sequence/useViewport.ts
cp src/modules/logic-tree/useViewport.dom.test.tsx src/modules/sequence/useViewport.dom.test.tsx
```

各ファイルの先頭に複製の記録コメントを1行足す（Task 6 の seq-font.ts と同じ文言）。import が相対パス（`./viewport`）で閉じていることを確認し、logic-tree 側を参照する import が残っていたら `./` に直す。**ロジックは1文字も変えない。**

- [ ] **Step 2: 複製したテストがそのまま通ることを確認してコミット**

```bash
npx vitest run src/modules/sequence/viewport.test.ts src/modules/sequence/useViewport.dom.test.tsx
git add src/modules/sequence/viewport.ts src/modules/sequence/viewport.test.ts src/modules/sequence/useViewport.ts src/modules/sequence/useViewport.dom.test.tsx
git commit -m "feat(sequence): ビューポートを logic-tree から複製する"
```

通らない場合は複製時の import 直しの漏れ。**テスト本体を書き換えて通すことは禁止**（書き換えが要る＝複製が正しくできていない）。

---

### Task 9: セル部品（ActorRefCell / StepShapeCell）

**Files:**
- Create: `src/modules/sequence/ActorRefCell.tsx`、`src/modules/sequence/StepShapeCell.tsx`
- Test: `src/modules/sequence/ActorRefCell.dom.test.tsx`、`src/modules/sequence/StepShapeCell.dom.test.tsx`

**Interfaces:**
- Consumes: `normalizeForMatch`（`@/core/normalize`）、`STEP_SHAPE_ORDER` / `STEP_SHAPE_LABEL` / `StepShapeValue`（Task 4）
- Produces:

```ts
// ActorRefCell: from/to の参加者参照セル
interface ActorRefCellProps {
  value: string | undefined                 // actorId
  actors: readonly { id: string; name: string }[]
  invalid: boolean
  'aria-label': string
  'data-cell': string
  onSelect: (actorId: string) => void       // ↑↓ での即時切替・既存名の確定
  onCreate: (name: string) => void          // 未登録名の確定（createActorAndAssign を呼ぶのは親）
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState) => void
}
// StepShapeCell: kind × awaitsReply のトグルセル
interface StepShapeCellProps {
  value: StepShapeValue
  'aria-label': string
  'data-cell': string
  onChange: (next: StepShapeValue) => void
  onFieldKeyDown?: (e: React.KeyboardEvent) => void
}
```

- [ ] **Step 1: ActorRefCell の失敗するテストを書く**

`src/modules/sequence/ActorRefCell.dom.test.tsx`:

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
  const onCreate = vi.fn()
  render(
    <ActorRefCell
      value="actor_Aaaaaaaaa2"
      actors={actors}
      invalid={false}
      aria-label="送り手"
      data-cell="s1:from"
      onSelect={onSelect}
      onCreate={onCreate}
      {...over}
    />,
  )
  return { onSelect, onCreate, input: screen.getByLabelText('送り手') as HTMLInputElement }
}

describe('ActorRefCell', () => {
  it('参照先の名前を表示する', () => {
    expect(setup().input.value).toBe('API')
  })

  it('参照切れは空表示で invalid を親から受けた見た目になる', () => {
    const { input } = setup({ value: undefined, invalid: true })
    expect(input.value).toBe('')
  })

  it('↑↓ で actors 配列順に即時切替する（3人の真ん中から両方向）', () => {
    const { onSelect, input } = setup()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa3')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa1')
  })

  it('端では回り込む（末尾で↓→先頭）', () => {
    const { onSelect, input } = setup({ value: 'actor_Aaaaaaaaa3' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa1')
  })

  it('既存名を打って blur すると onSelect（NFKC・大文字小文字を同一視して照合）', () => {
    const { onSelect, onCreate, input } = setup()
    fireEvent.change(input, { target: { value: 'api' } })
    fireEvent.blur(input)
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa2')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('前方一致が1人に絞れるなら確定できる（「決」→ 決済）', () => {
    const { onSelect, input } = setup()
    fireEvent.change(input, { target: { value: '決' } })
    fireEvent.blur(input)
    expect(onSelect).toHaveBeenLastCalledWith('actor_Aaaaaaaaa3')
  })

  it('未登録名を打って blur すると onCreate', () => {
    const { onSelect, onCreate, input } = setup()
    fireEvent.change(input, { target: { value: 'メール基盤' } })
    fireEvent.blur(input)
    expect(onCreate).toHaveBeenCalledWith('メール基盤')
    expect(onSelect).not.toHaveBeenCalledWith(expect.stringMatching(/^actor_Zzz/))
  })

  it('空にして blur すると元の参照に戻る（onSelect も onCreate も呼ばない）', () => {
    const { onSelect, onCreate, input } = setup()
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
    expect(input.value).toBe('API')
  })

  it('IME 変換中の ↑↓ は候補切替しない', () => {
    const { onSelect, input } = setup()
    fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true })
    expect(onSelect).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/sequence/ActorRefCell.dom.test.tsx`
Expected: FAIL

- [ ] **Step 3: ActorRefCell を実装する**

`src/modules/sequence/ActorRefCell.tsx`:

```tsx
import { useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { normalizeForMatch } from '@/core/normalize'

export interface ActorRefCellProps {
  value: string | undefined
  actors: readonly { id: string; name: string }[]
  invalid: boolean
  'aria-label': string
  'data-cell': string
  onSelect: (actorId: string) => void
  onCreate: (name: string) => void
  onFieldKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>, state: FieldState) => void
}

/**
 * from / to の参加者参照セル（design-notes 論点9）。
 *
 * - 表示は参照先の名前（参照切れは空表示＋赤）
 * - ↑↓＝actors 配列順の即時切替（arrowsOwnedByField: true として扱われる前提。
 *   ドロップダウンは出さない——会議の速度でリストを目で追わせない）
 * - 文字を打つとドラフトになり、blur / Tab / Enter で確定:
 *   正規化一致（normalizeForMatch。照合規則はアプリで1つ）→ その参加者
 *   ／前方一致が1人 → その参加者／未登録名 → onCreate（インライン追加）
 *   ／空 → 変更なし（元の表示に戻す）
 * - IME 変換中は候補切替しない（rev 10章）
 *
 * CellInput を使わないのは、value が「テキスト」ではなく「参照」であり、
 * ドラフト確定の規則（照合・新規作成）が CellInput の commit と別物のため。
 * IME 対応（変換中は確定しない）はこの部品が自前で持つ
 */
export function ActorRefCell(props: ActorRefCellProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const resolved = props.actors.find((a) => a.id === props.value)?.name ?? ''

  const commit = (): void => {
    if (draft === null) return
    setDraft(null)
    if (draft === '') return
    const needle = normalizeForMatch(draft)
    const exact = props.actors.find((a) => normalizeForMatch(a.name) === needle)
    if (exact !== undefined) {
      props.onSelect(exact.id)
      return
    }
    const prefix = props.actors.filter((a) => normalizeForMatch(a.name).startsWith(needle))
    if (prefix.length === 1) {
      props.onSelect(prefix[0].id)
      return
    }
    props.onCreate(draft)
  }

  const cycle = (delta: -1 | 1): void => {
    if (props.actors.length === 0) return
    const at = props.actors.findIndex((a) => a.id === props.value)
    const next = (at + delta + props.actors.length) % props.actors.length
    setDraft(null)
    props.onSelect(props.actors[next].id)
  }

  const face = props.invalid
    ? 'border-warning bg-warning/20'
    : 'border-rule bg-surface'

  return (
    <input
      className={`w-full rounded-sm border px-1.5 py-0.5 text-sm text-ink outline-none focus:ring-2 focus:ring-inset focus:ring-ring ${face}`}
      aria-label={props['aria-label']}
      data-cell={props['data-cell']}
      value={draft ?? resolved}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        const composing =
          (e.nativeEvent as { isComposing?: boolean }).isComposing ?? e.isComposing ?? false
        if (!composing && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          cycle(e.key === 'ArrowUp' ? -1 : 1)
          return
        }
        if (!composing && (e.key === 'Enter' || e.key === 'Tab')) commit()
        const el = e.currentTarget
        props.onFieldKeyDown?.(e, {
          empty: el.value === '',
          caretAtStart: el.selectionStart === 0 && el.selectionEnd === 0,
          caretAtEnd:
            el.selectionStart === el.value.length && el.selectionEnd === el.value.length,
        })
      }}
      onBlur={commit}
    />
  )
}
```

- [ ] **Step 4: ActorRefCell のテストが通ることを確認**

Run: `npx vitest run src/modules/sequence/ActorRefCell.dom.test.tsx`
Expected: PASS

- [ ] **Step 5: StepShapeCell の失敗するテストを書く**

`src/modules/sequence/StepShapeCell.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StepShapeCell } from './StepShapeCell'

afterEach(cleanup)

describe('StepShapeCell', () => {
  it('現在の形をラベルで表示する', () => {
    render(
      <StepShapeCell value="call-sync" aria-label="形" data-cell="s1:shape" onChange={() => {}} />,
    )
    expect(screen.getByLabelText('形')).toHaveTextContent('呼出')
  })

  it('↓ で次、↑ で前の形（4値の循環。call-sync から両方向）', () => {
    const onChange = vi.fn()
    render(
      <StepShapeCell value="call-sync" aria-label="形" data-cell="s1:shape" onChange={onChange} />,
    )
    const el = screen.getByLabelText('形')
    fireEvent.keyDown(el, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('call-async')
    fireEvent.keyDown(el, { key: 'ArrowUp' })
    expect(onChange).toHaveBeenLastCalledWith('self')
  })

  it('self から ↓ で先頭へ回り込む', () => {
    const onChange = vi.fn()
    render(<StepShapeCell value="self" aria-label="形" data-cell="s1:shape" onChange={onChange} />)
    fireEvent.keyDown(screen.getByLabelText('形'), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('call-sync')
  })
})
```

- [ ] **Step 6: 落ちることを確認して StepShapeCell を実装する**

Run: `npx vitest run src/modules/sequence/StepShapeCell.dom.test.tsx` → FAIL を確認。

`src/modules/sequence/StepShapeCell.tsx`:

```tsx
import { STEP_SHAPE_LABEL, STEP_SHAPE_ORDER, type StepShapeValue } from './commands'

export interface StepShapeCellProps {
  value: StepShapeValue
  'aria-label': string
  'data-cell': string
  onChange: (next: StepShapeValue) => void
  onFieldKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * kind × awaitsReply の1トグルセル。データは2フィールドだが、画面は
 * 「呼出／呼出（応答なし）／応答／内部処理」の4値1セル（design-notes 未確定
 * リストの決着——Tab の停止が1つ減る）。↑↓で循環。select 要素にしないのは
 * ネイティブのドロップダウン UI がキャンバスの transform の外に出るため
 */
export function StepShapeCell(props: StepShapeCellProps) {
  const cycle = (delta: -1 | 1): void => {
    const at = STEP_SHAPE_ORDER.indexOf(props.value)
    const next = (at + delta + STEP_SHAPE_ORDER.length) % STEP_SHAPE_ORDER.length
    props.onChange(STEP_SHAPE_ORDER[next])
  }
  return (
    <button
      type="button"
      className="w-full rounded-sm border border-rule bg-surface px-1.5 py-0.5 text-left text-sm text-ink-muted outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
      aria-label={props['aria-label']}
      data-cell={props['data-cell']}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          cycle(e.key === 'ArrowUp' ? -1 : 1)
          return
        }
        props.onFieldKeyDown?.(e)
      }}
    >
      {STEP_SHAPE_LABEL[props.value]}
    </button>
  )
}
```

- [ ] **Step 7: 全部通ることを確認してコミット**

```bash
npx vitest run src/modules/sequence/ && npx tsc -b && npm run lint
git add src/modules/sequence/ActorRefCell.tsx src/modules/sequence/ActorRefCell.dom.test.tsx src/modules/sequence/StepShapeCell.tsx src/modules/sequence/StepShapeCell.dom.test.tsx
git commit -m "feat(sequence): from/to 参照セルと形トグルセルを実装する"
```

---

### Task 10: 描画部品（GutterSlot / SequenceEdges / migrate / module）

**Files:**
- Create: `src/modules/sequence/GutterSlot.tsx`、`src/modules/sequence/SequenceEdges.tsx`、`src/modules/sequence/migrate.ts`、`src/modules/sequence/module.ts`
- Test: `src/modules/sequence/module.test.ts`

**Interfaces:**
- Consumes: `CellInput`（`@/components/CellInput`）、`questionLabels`（Task 2）、layout の型（Task 7）、`svgTransform`（Task 8）
- Produces: `GutterSlot`（答えスロット1つの DOM）、`SequenceEdges`（SVG レイヤ）、`sequenceModule`（規約8点＋createEmpty）。Task 11 のエディタが組み立てる

- [ ] **Step 1: GutterSlot を実装する**

`src/modules/sequence/GutterSlot.tsx`（見た目は M8 確定の組合せのみ: 未定義＝`bg-warning/10`＋`text-ink-muted`。handled / notApplicable は色面を持たない——`ok` 系の面はコントラスト未検算のため使わない。Global Constraints 参照）:

```tsx
import { CellInput, type FieldState } from '@/components/CellInput'
import { ANSWER_BOX_CLASS } from './measure'

export type SlotState = 'unanswered' | 'handled' | 'notApplicable'

export interface GutterSlotProps {
  /** 問いの文言（questionLabels の値）。ラベル列に出す */
  question: string
  /** ifExecuted はインデントして下位問いであることを見せる */
  indent: boolean
  state: SlotState
  text: string
  'aria-label': string
  'data-cell': string
  x: number
  y: number
  labelWidth: number
  answerWidth: number
  height: number
  onTextChange: (next: string) => void
  onFieldKeyDown?: (e: React.KeyboardEvent, state: FieldState) => void
}

/**
 * 問いスロット1つ（design-notes 論点7）。
 * 未定義＝warning/10 の面（M8 の「未定義」の規約そのまま）。
 * handled＝無地・通常文字。notApplicable＝無地・ink-muted＋「─ 考慮不要」の接頭。
 * 3状態の切替は Ctrl+Enter（toggle-item-state）で、キーの解釈は
 * エディタ側の resolveCommand が行う——ここはキーの意味を決めない
 */
export function GutterSlot(props: GutterSlotProps) {
  const face =
    props.state === 'unanswered'
      ? 'border-warning/40 bg-warning/10 text-ink-muted'
      : props.state === 'notApplicable'
        ? 'border-rule bg-surface text-ink-muted'
        : 'border-rule bg-surface text-ink'
  const indentPad = props.indent ? 16 : 0
  return (
    <div
      className="pointer-events-auto absolute flex items-stretch gap-1"
      style={{ left: props.x + indentPad, top: props.y, height: props.height }}
    >
      <div
        className="shrink-0 py-1 text-xs text-ink-muted"
        style={{ width: props.labelWidth - indentPad }}
      >
        {props.indent ? `└ ${props.question}` : props.question}
      </div>
      <div className="relative" style={{ width: props.answerWidth }}>
        {props.state === 'notApplicable' && (
          <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1 text-sm">
            ─
          </span>
        )}
        <CellInput
          multiline
          autoSize={false}
          className={`h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-all rounded-sm ${ANSWER_BOX_CLASS} ${face} ${
            props.state === 'notApplicable' ? 'pl-6' : ''
          } text-sm outline-none focus:ring-2 focus:ring-inset focus:ring-ring`}
          aria-label={props['aria-label']}
          data-cell={props['data-cell']}
          value={props.text}
          placeholder={props.state === 'unanswered' ? '未定義' : undefined}
          onValueChange={props.onTextChange}
          onFieldKeyDown={props.onFieldKeyDown}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: SequenceEdges を実装する**

`src/modules/sequence/SequenceEdges.tsx`:

```tsx
import type { SeqLayoutResult } from './layout'
import { svgTransform, type Transform } from './viewport'

export interface EdgeStep {
  key: string
  shape: 'call-sync' | 'call-async' | 'reply' | 'self'
  fromIndex: number | null
  toIndex: number | null
}

export interface SequenceEdgesProps {
  steps: EdgeStep[]
  layout: SeqLayoutResult
  transform: Transform
}

/**
 * エッジレイヤ（SVG）。矢印の形は導出（design-notes 論点8）:
 * call-sync＝実線・塗り矢頭／call-async＝実線・開き矢頭／reply＝破線・開き矢頭。
 * self はノードレイヤの DOM ボックスが担うのでここでは描かない。
 * 参照切れ（fromIndex / toIndex が null）と from==to の呼出は線を描かない
 * ——赤表示はガターと行の側にあり、無い線をでっち上げない
 */
export function SequenceEdges(props: SequenceEdgesProps) {
  return (
    <svg
      aria-hidden="true"
      data-layer="edges"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      <defs>
        <marker
          id="seq-arrow-solid"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 z" className="fill-ink" />
        </marker>
        <marker
          id="seq-arrow-open"
          markerWidth="9"
          markerHeight="9"
          refX="7"
          refY="4.5"
          orient="auto"
        >
          <path d="M0,0 L8,4.5 L0,9" className="fill-none stroke-ink" strokeWidth="1.3" />
        </marker>
      </defs>
      <g transform={svgTransform(props.transform)}>
        {props.steps.map((step, i) => {
          if (step.shape === 'self') return null
          if (step.fromIndex === null || step.toIndex === null) return null
          if (step.fromIndex === step.toIndex) return null
          const row = props.layout.rows[i]
          const x1 = props.layout.actorX[step.fromIndex]
          const x2 = props.layout.actorX[step.toIndex]
          // 矢頭ぶんだけ手前で止める
          const dir = x2 > x1 ? -4 : 4
          return (
            <line
              key={step.key}
              x1={x1}
              y1={row.arrowY}
              x2={x2 + dir}
              y2={row.arrowY}
              className="stroke-ink"
              strokeWidth="1.5"
              strokeDasharray={step.shape === 'reply' ? '5 3' : undefined}
              markerEnd={
                step.shape === 'call-sync' ? 'url(#seq-arrow-solid)' : 'url(#seq-arrow-open)'
              }
            />
          )
        })}
      </g>
    </svg>
  )
}
```

- [ ] **Step 3: migrate と module を書く**

`src/modules/sequence/migrate.ts`:

```ts
import type { SequenceSchemaVersion1 } from '@/types/sequence'

/** 初版につき恒等。schemaVersion 2 が生まれたらここに変換を足す（rev 5章） */
export function migrateSequence(data: unknown, _fromVersion: number): SequenceSchemaVersion1 {
  return data as SequenceSchemaVersion1
}
```

`src/modules/sequence/module.ts`:

```ts
import type { JsonSchema } from '@/core/canonical'
import type { ToolModule } from '@/core/registry'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import sequenceSchema from '../../../schemas/sequence.schema.json'
import { checkSequenceConsistency } from './consistency'
import { migrateSequence } from './migrate'
import { SequenceEditor } from './SequenceEditor'

export const sequenceModule: ToolModule<SequenceSchemaVersion1> = {
  type: 'sequence',
  displayName: 'シーケンス',
  schemaVersion: 1,
  schema: sequenceSchema as JsonSchema,
  // zone は M2 で足す
  idPrefixes: ['actor', 'step'],
  Editor: SequenceEditor,
  checkConsistency: checkSequenceConsistency,
  // 規約5: 出力は0本で開始（rev 6章）。Markdown / Mermaid は会議で使うと確定してから
  outputs: [],
  // プロジェクトにシーケンスは何本あってもよい（機能ごとに分けるのが普通の使い方）
  singleton: false,
  migrate: migrateSequence,
  // 参加者0人で作る。最初の1人は空状態の「クリックして開始」で生まれる
  createEmpty: (title) => ({ schemaVersion: 1, type: 'sequence', title, actors: [], steps: [] }),
}
```

- [ ] **Step 4: module.test.ts を書く**

`src/modules/sequence/module.test.ts`（logic-tree の `module.test.ts` を開いて同じ観点で書く。最低限）:

```ts
import { describe, expect, it } from 'vitest'
import { validateAgainstSchema } from '@/core/schema-validation'
import type { JsonSchema } from '@/core/canonical'
import { sequenceModule } from './module'

describe('sequenceModule', () => {
  it('createEmpty はスキーマ検証を通る（雛形が壊れていたら新規作成が全滅する）', () => {
    const empty = sequenceModule.createEmpty('新しいシーケンス')
    expect(validateAgainstSchema(sequenceModule.schema as JsonSchema, empty).ok).toBe(true)
    expect(sequenceModule.checkConsistency(empty)).toEqual([])
  })

  it('outputs は0本（額縁は出力ボタンを押せなくする）', () => {
    expect(sequenceModule.outputs).toEqual([])
  })

  it('migrate は現行版に対して恒等', () => {
    const empty = sequenceModule.createEmpty('t')
    expect(sequenceModule.migrate(empty, 1)).toEqual(empty)
  })
})
```

このテストは `SequenceEditor` がまだ無いので import で落ちる。**Step 5 で仮の最小エディタを置いてから module.test を通す**のではなく、Task 11 で本物を作るまで module.ts / module.test.ts をコミットに含めず手元に置く——のは「次のタスクが即消すスタブ」の分割ミス（lessons-for-planning）。よって**このタスクでは GutterSlot / SequenceEdges / migrate のみコミットし、module.ts と module.test.ts はファイルとして書くが Task 11 の冒頭でエディタと同時にコミットする**。

- [ ] **Step 5: 部品のみ検証してコミット**

```bash
npx tsc -b --noEmit 2>&1 | head -20   # module.ts が SequenceEditor 不在で落ちることを確認（想定内）
git add src/modules/sequence/GutterSlot.tsx src/modules/sequence/SequenceEdges.tsx src/modules/sequence/migrate.ts
git commit -m "feat(sequence): ガタースロットとエッジ描画を実装する"
```

注意: `tsc` が module.ts のせいで落ちる間は `npm test` の pretest（gen:types）は影響を受けないが、**この状態を Task 11 の完了まで放置しない**こと（Task 11 は連続して着手する）。

---

### Task 11: エディタ本体と登録

**Files:**
- Create: `src/modules/sequence/SequenceEditor.tsx`
- Modify: `src/modules/index.ts`
- Test: `src/modules/sequence/SequenceEditor.dom.test.tsx`（＋ Task 10 の `module.test.ts` をここでコミット）

**Interfaces:**
- Consumes: これまでの全タスクの成果物（commands / questions / layout / measure / seq-font / viewport / セル部品 / GutterSlot / SequenceEdges / module）
- Produces: `SequenceEditor: ComponentType<EditorProps<SequenceSchemaVersion1>>`。額縁への登録（`appRegistry.register(sequenceModule)`）

- [ ] **Step 1: DOM テストを書く（完了条件を固定する）**

`src/modules/sequence/SequenceEditor.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { SequenceEditor } from './SequenceEditor'

afterEach(cleanup)

function doc(): SequenceSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: 't',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面', domain: '自社' },
      { id: 'actor_Aaaaaaaaa2', name: 'API', domain: '自社' },
      { id: 'actor_Aaaaaaaaa3', name: '決済', domain: '決済会社' },
    ],
    steps: [
      { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: '注文を確定', awaitsReply: true },
      { id: 'step_Aaaaaaaaa2', kind: 'reply', from: 'actor_Aaaaaaaaa2', to: 'actor_Aaaaaaaaa1', label: '注文番号' },
      { id: 'step_Aaaaaaaaa3', kind: 'self', from: 'actor_Aaaaaaaaa2', label: '在庫を引当' },
    ],
  }
}

function setup(data = doc(), issues: never[] | Parameters<typeof SequenceEditor>[0]['issues'] = []) {
  const onChange = vi.fn()
  render(<SequenceEditor data={data} onChange={onChange} issues={issues} modalOpen={false} />)
  return { onChange }
}

/** onChange の最後の呼び出しのデータを取り出す */
function last(onChange: ReturnType<typeof vi.fn>): SequenceSchemaVersion1 {
  return onChange.mock.calls[onChange.mock.calls.length - 1][0] as SequenceSchemaVersion1
}

describe('空状態', () => {
  it('「クリックして開始」で最初の参加者ができる', () => {
    const { onChange } = setup({ ...doc(), actors: [], steps: [] })
    fireEvent.click(screen.getByRole('button', { name: 'クリックして開始' }))
    expect(last(onChange).actors).toHaveLength(1)
  })

  it('参加者がいてステップ0件なら「ステップを追加」ボタンが出る', () => {
    const { onChange } = setup({ ...doc(), steps: [] })
    fireEvent.click(screen.getByRole('button', { name: 'ステップを追加' }))
    expect(last(onChange).steps).toHaveLength(1)
  })
})

describe('参加者ヘッダ', () => {
  it('Enter で直後に参加者が増える', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('参加者1の名前'), { key: 'Enter' })
    expect(last(onChange).actors).toHaveLength(4)
    expect(last(onChange).actors[1].name).toBe('')
  })

  it('IME 変換確定の Enter では増えない（最重要）', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('参加者1の名前'), { key: 'Enter', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Alt+→ で並び替え（3人の真ん中から）', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('参加者2の名前'), { key: 'ArrowRight', altKey: true })
    expect(last(onChange).actors.map((a) => a.name)).toEqual(['画面', '決済', 'API'])
  })

  it('空欄 Backspace で消える', () => {
    const d = doc()
    d.actors[1] = { ...d.actors[1], name: '' }
    const { onChange } = setup(d)
    fireEvent.keyDown(screen.getByLabelText('参加者2の名前'), { key: 'Backspace' })
    expect(last(onChange).actors).toHaveLength(2)
  })
})

describe('ステップ行', () => {
  it('ラベルで Enter → 直後にステップが増える（from/to は往復の既定値）', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('ステップ1の文言'), { key: 'Enter' })
    const steps = last(onChange).steps
    expect(steps).toHaveLength(4)
    expect(steps[1].from).toBe('actor_Aaaaaaaaa2')
    expect(steps[1].to).toBe('actor_Aaaaaaaaa1')
  })

  it('IME 変換確定の Enter ではステップが増えない（最重要）', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('ステップ1の文言'), { key: 'Enter', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Alt+↓ で並び替え（3行の真ん中から）', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('ステップ2の文言'), { key: 'ArrowDown', altKey: true })
    expect(last(onChange).steps.map((s) => s.label)).toEqual(['注文を確定', '在庫を引当', '注文番号'])
  })

  it('空欄 Backspace でステップが消える', () => {
    const d = doc()
    d.steps[1] = { ...d.steps[1], label: '' }
    const { onChange } = setup(d)
    fireEvent.keyDown(screen.getByLabelText('ステップ2の文言'), { key: 'Backspace' })
    expect(last(onChange).steps).toHaveLength(2)
  })

  it('Ctrl+Z は消費しない（額縁のグローバル層に届く）', () => {
    const { onChange } = setup()
    const result = fireEvent.keyDown(screen.getByLabelText('ステップ1の文言'), {
      key: 'z',
      ctrlKey: true,
    })
    expect(result).toBe(true) // preventDefault されていない
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('問いスロット（ガター）', () => {
  it('応答待ちの呼出には3スロット、reply には0、self には1つ立つ', () => {
    setup()
    expect(screen.getByLabelText('ステップ1の答え: 失敗が確定したら？')).toBeInTheDocument()
    expect(screen.getByLabelText('ステップ1の答え: 結果不明だったら？')).toBeInTheDocument()
    expect(screen.getByLabelText('ステップ1の答え: 実行済みだったら？')).toBeInTheDocument()
    expect(screen.queryByLabelText(/ステップ2の答え/)).toBeNull()
    expect(screen.getByLabelText('ステップ3の答え: 処理失敗したら？')).toBeInTheDocument()
  })

  it('reply の行には「問いは呼出側」の説明が出る（空白にしない）', () => {
    setup()
    expect(screen.getByText('─ 応答の失敗は呼出側の「結果不明」が扱う')).toBeInTheDocument()
  })

  it('答えを打つと handled で書かれる', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText('ステップ1の答え: 失敗が確定したら？'), {
      target: { value: 'エラー表示' },
    })
    expect(last(onChange).steps[0].failures?.failed).toEqual({
      decision: 'handled',
      text: 'エラー表示',
    })
  })

  it('Ctrl+Enter で考慮不要トグル', () => {
    const { onChange } = setup()
    fireEvent.keyDown(screen.getByLabelText('ステップ1の答え: 失敗が確定したら？'), {
      key: 'Enter',
      ctrlKey: true,
    })
    expect(last(onChange).steps[0].failures?.failed).toEqual({ decision: 'notApplicable' })
  })

  it('未回答の集計が出る（doc() は failed/unknown/ifExecuted ＋ self の failed の計4問が未回答）', () => {
    setup()
    expect(screen.getByText(/未定義 4/)).toBeInTheDocument()
  })
})

describe('赤表示', () => {
  it('missing-actor の issue が from セルに赤を付ける', () => {
    const d = doc()
    d.steps[0] = { ...d.steps[0], from: 'actor_Zzzzzzzzz9' }
    setup(d, [
      {
        rule: 'missing-actor',
        message: 'x',
        locations: [{ entityId: 'step_Aaaaaaaaa1', entityIndex: 0, field: 'from' }],
      },
    ])
    const cell = screen.getByLabelText('ステップ1の送り手') as HTMLInputElement
    expect(cell.className).toContain('bg-warning/20')
  })
})
```

- [ ] **Step 2: 落ちることを確認**

Run: `npx vitest run src/modules/sequence/SequenceEditor.dom.test.tsx`
Expected: FAIL（SequenceEditor が無い）

- [ ] **Step 3: SequenceEditor を実装する**

`src/modules/sequence/SequenceEditor.tsx`。構造は `LogicTreeEditor.tsx` を手本にする（フォント probe・measurer キャッシュ・pendingFocus・useViewport の使い方は同じ形。**コメントの複製記録も同様**）。要点:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { FieldState } from '@/components/CellInput'
import { CellInput } from '@/components/CellInput'
import { buttonBase } from '@/components/button-styles'
import {
  resolveCommand,
  toKeyEventLike,
  type Command,
  type KeyContext,
} from '@/core/keyboard/keymap'
import { currentPlatform } from '@/core/keyboard/platform'
import type { EditorProps } from '@/core/registry'
import { computeRowKeys } from '@/core/row-keys'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { ActorRefCell } from './ActorRefCell'
import {
  addActorAfter,
  addFirstActor,
  addStepAfter,
  addStepLast,
  createActorAndAssign,
  moveActor,
  moveStep,
  removeActor,
  removeStep,
  setActorName,
  setAnswerText,
  setStepActor,
  setStepLabel,
  setStepShape,
  stepShapeOf,
  toggleNotApplicable,
  type SeqEditResult,
} from './commands'
import { GutterSlot, type SlotState } from './GutterSlot'
import {
  ARROW_GAP,
  layoutSequence,
  QUESTION_LABEL_WIDTH,
  type SeqLayoutInput,
} from './layout'
import {
  ACTOR_BOX_CLASS,
  ACTOR_INSET_X,
  ACTOR_MAX_WIDTH,
  ACTOR_MIN_WIDTH,
  ANSWER_CONTENT_WIDTH,
  ANSWER_INSET_X,
  ANSWER_INSET_Y,
  createEstimateMeasurer,
  LABEL_BOX_CLASS,
  LABEL_INSET_X,
  LABEL_INSET_Y,
  LABEL_MAX_WIDTH,
  LABEL_MIN_WIDTH,
  SELF_BOX_CLASS,
  SELF_INSET_X,
  SELF_INSET_Y,
  SELF_MIN_WIDTH,
  wrapWithin,
  type MeasureWidth,
} from './measure'
import { poseQuestions, questionLabels, type AnswerPath } from './questions'
import { createSeqMeasurer, FALLBACK_SEQ_FONT, readSeqFont, sameFont, type SeqFont } from './seq-font'
import { SequenceEdges, type EdgeStep } from './SequenceEdges'
import { useViewport } from './useViewport'
import { cssTransform } from './viewport'
```

実装の指示（コード構造。LogicTreeEditor と同じ箇所は同じ形で書く）:

1. **フォント probe と measurer**: LogicTreeEditor の `probeRef` / `fontGeneration` / `measurerRef` をそのまま写す（`NodeFont`→`SeqFont` 等の名前だけ変える）。jsdom では `readSeqFont` がフォールバックに落ち、`createSeqMeasurer` が canvas 不在で使えないため、**measurer の生成は `createSeqMeasurer` が null を返したら `createEstimateMeasurer(font.size)` に落とす**（`seq-font.ts` の実装が canvas 取得に失敗したときの挙動を確認し、logic-tree がテストで通っている経路と同じにする）
2. **測定**: 各ステップの `label` を `wrapWithin(…, { maxWidth: LABEL_MAX_WIDTH, minWidth: LABEL_MIN_WIDTH, insetX: LABEL_INSET_X, insetY: LABEL_INSET_Y })`（self は SELF_ 系定数）で、各答えスロットの text（未回答は placeholder の '未定義' 相当で1行）を `wrapWithin(…, { maxWidth: ANSWER_CONTENT_WIDTH + ANSWER_INSET_X * 2, minWidth: ANSWER_CONTENT_WIDTH + ANSWER_INSET_X * 2, insetX: ANSWER_INSET_X, insetY: ANSWER_INSET_Y })` で測る。参加者名は ACTOR_ 系定数
3. **レイアウト入力の組み立て**: `poseQuestions` の順序は `failed → unknown → ifExecuted`（立つものだけ）。`slotHeights` はこの順で並べる。`fromIndex` / `toIndex` は `actors.findIndex`（見つからなければ null）
4. **レイヤ構成**（LogicTreeEditor と同じ3枚＋ガター。全部に `cssTransform(transform)`）:
   - 背景レイヤ: `layout.boundaries` の x に `absolute` の縦線 `<div className="absolute border-l border-dashed border-rule" style={{ left: x, top: 0, height: layout.totalHeight }} />`。`data-layer="background"`
   - エッジレイヤ: `<SequenceEdges steps={edgeSteps} layout={layout} transform={transform} />`
   - ノードレイヤ: 参加者ヘッダ（`CellInput`、`data-cell` は `${actorKey}:name`）／ステップのラベル（call/reply は矢印の上・中点に配置した `CellInput`、self はライフライン上のボックス）／from・to の `ActorRefCell`（**矢印の起点側の脇**、`x = actorX[fromIndex] + 8, y = row.arrowY + 4` に小さく置く。参照切れで位置が出せないときは行の左端 `DIAGRAM_MARGIN`）／`StepShapeCell`（to セルの隣）／ガターの `GutterSlot` 群と reply の説明行
   - ガターの集計: `layout.gutterX` 位置のヘッダ高さ内に `⚠ 未定義 {n} ／ ✓ 回答済 {m} ／ ─ 考慮不要 {k}` を表示（数えるのは**立っている問い**のみ）
5. **キー処理**: セルごとに `KeyContext` を組んで `resolveCommand` → `runCommand`。
   - 参加者名セル: `{ hierarchical: false, horizontal: true, arrowsOwnedByField: false, deletableField: true, reorderEnabled: true, … }`。コマンド写像: `insert-item-after`→`addActorAfter`、`delete-item`→`removeActor`、`move-item-up`→`moveActor(-1)`、`move-item-down`→`moveActor(+1)`、`focus-prev/next`→隣の参加者セルへ
   - ステップのラベルセル: `{ hierarchical: false, horizontal: false, deletableField: true, … }`。`insert-item-after`→`addStepAfter`、`delete-item`→`removeStep`、`move-item-up/down`→`moveStep`、`focus-prev/next`→上下の行のラベルへ
   - from/to セル: 同上だが `arrowsOwnedByField: true`・`deletableField: false`（空欄 Backspace で行を消さない——参照セルの空は「入力中」）
   - 形セル（button）: `arrowsOwnedByField: true`。`insert-item-after`→`addStepAfter`
   - 答えスロット: `deletableField: false`・`arrowsOwnedByField: false`。`insert-item-after`→`addStepAfter`（答えを打っていて Enter したら次のステップへ進む＝会議の流れ）、`toggle-item-state`→`toggleNotApplicable`
   - **`undo` / `redo` は消費しない**（`runCommand` が false を返し、額縁に届く）
6. **フォーカス予約**: `SeqFocus` を `data-cell` キー（actor は `${key}:name`、step は `${key}:label`）に写して `pendingFocus`。`ensureVisible` は行の矩形（`x: DIAGRAM_MARGIN, y: row.top, width: layout.totalWidth, height: row.height`）で呼ぶ
7. **空状態**: actors 0 → 中央に「クリックして開始」（`addFirstActor`）。actors ≥1 → 左上（issues バナーの下）に常設の「ステップを追加」ボタン（`addStepLast`。`buttonBase` を敷く）
8. **issues バナー**: LogicTreeEditor と同じ形（`absolute top-0` の一覧）
9. **赤表示**: `issues[].locations` を `entityId` のプレフィクスで actor / step に振り分け、`field` ごとの Set を作って各セルの `invalid` に渡す（`from`/`to`→ActorRefCell、`failures`→スロット枠、`id`／null→行全体の面 `bg-warning/20`）
10. **onChange の mergeKey**: テキスト入力（名前・ラベル・答え）は `${cellKey}` を渡して連続入力を1履歴に。構造操作（追加・削除・並び替え・形変更・参照差し替え）は `null`

- [ ] **Step 4: 登録する**

`src/modules/index.ts` に2行:

```ts
import { sequenceModule } from './sequence/module'
// …既存の register 群の後に
appRegistry.register(sequenceModule)
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
npx vitest run src/modules/sequence/ && npx tsc -b && npm run lint
```

Expected: 全 PASS。DOM テストで落ちる箇所は実装の欠陥として直す（テストを弱めない）。

- [ ] **Step 6: コミット**

```bash
git add src/modules/sequence/SequenceEditor.tsx src/modules/sequence/SequenceEditor.dom.test.tsx src/modules/sequence/module.ts src/modules/sequence/module.test.ts src/modules/index.ts
git commit -m "feat(sequence): エディタ本体を実装して額縁に登録する"
```

---

### Task 12: 機械検査の走査確認と全体グリーン

**Files:**
- Modify: （検査が要求すれば）`src/styles/palette.test.ts`

- [ ] **Step 1: 既存の機械検査が新モジュールを走査対象に含むか確かめる**

```bash
npx vitest run src/styles/
grep -n "modules" src/styles/palette.test.ts src/styles/conventions.test.ts
```

確認事項（lessons-for-planning「走査の母集合」）:
- `palette.test.ts` の走査が `src/modules/` 配下の `.tsx` 全部を見ていること（logic-tree M1 で広げた形）。sequence の `.tsx` が対象に入っていることを、**走査対象のファイル一覧を出力するなどして実際に確かめる**
- 本計画が使う半透明は `bg-warning/10`（未定義）と `bg-warning/20`（エラー・invalid セル）のみで、どちらも検算済み。**検算していない濃さが検出されたら、使った側を直す**（検査を騙さない・使わない定数を置かない）
- `conventions.test.ts`（色値直書き検査）が sequence のファイルで違反を出さないこと

- [ ] **Step 2: 全体を回す**

```bash
npm test && npx tsc -b && npm run lint && npx vite build
```

Expected: すべて成功。`npx vite build` は生成 CSS の確認を含む（`bg-grid-paper`・`GutterSlot` の面クラスがカスケードに関わるため。lessons-for-planning「検証手順」）。

- [ ] **Step 3: コミット（検査側の修正が発生した場合のみ）**

```bash
git add -A && git commit -m "test(sequence): 機械検査の走査対象を確認する"
```

---

### Task 13: 実機確認（人間の作業。サブエージェントは実施不可）

**このタスクは人間が `npm run tauri dev` で行う。** 結果が出るまで Task 14 の申し送りには「実機確認: 未実施」と明記する（lessons-for-planning「実機確認とドキュメント反映を同じタスクに束ねない」）。

チェックリスト（完了条件は scope §5）:

- [ ] 空の状態から「クリックして開始」→ 参加者3人（画面/API/決済。domain も入れる）→ ステップ15本以上をキーボードだけで打ち切れる
- [ ] **日本語で打って、変換確定の Enter で参加者もステップも増えない**（最重要。崩れたら M1 未完）
- [ ] Tab がラベル → from → to → 形 → 答えスロットの順に移動する
- [ ] from/to セル: ↑↓ で切替、頭文字＋Tab で確定、未登録名で参加者が生える
- [ ] 応答待ち呼出に3スロット・投げっぱなしに1・reply に0・self に1が立ち、reply の行に説明が出る
- [ ] 未回答スロットが warning の面で見え、集計の数字が合う
- [ ] Ctrl+Enter で「─ 考慮不要」になり、もう一度で戻る
- [ ] domain の違う隣接参加者の間に境界線が出る
- [ ] 矢印: 実線塗り矢頭（呼出）／実線開き矢頭（投げっぱなし）／破線（応答）
- [ ] アプリを閉じて開き直すと同じ図が同じ形で出る
- [ ] Ctrl+Z / Ctrl+Shift+Z が1操作ずつ戻る・進む（形トグル・考慮不要トグルも1操作）
- [ ] Ctrl+ホイールでズーム、Space+ドラッグ／中ボタンでパン。新ステップ追加で追従する
- [ ] ライト・ダーク両モードで一巡する

- [ ] 結果を記録した（気づきの粒度は「問題なし」でよいが、崩れた項目は具体的に）

---

### Task 14: ドキュメント反映

**Files:**
- Create: `docs/history/sequence-m1-keyboard-editor.md`
- Modify: `docs/open-issues.md`、`docs/overview-rev.md`、（教訓があれば）`docs/lessons-for-planning.md`

- [ ] **Step 1: 申し送りを書く**

`docs/history/sequence-m1-keyboard-editor.md`。体裁は `docs/history/logic-tree-m1-keyboard-editor.md` に合わせ、内容は**実装・レビューで新たに確定した事実だけ**を書く（設計の根拠は design-notes にあり、繰り返さない）。必須の節: 実装で確定した事項／コアに入れた変更（Task 5 の keymap 3点）／計画の誤りとして報告されたもの／テストが実装を守っていなかった箇所／実機確認（Task 13 の結果。未実施ならその旨）。

- [ ] **Step 2: open-issues.md を更新する**

- **消す**: 「`←→` が `arrowsOwnedByField` を見ない」（Task 5 で解消）
- **足す**（最低限。実装中に増えた分も）:
  - sequence の viewport / seq-font / measure が logic-tree の複製であること（計4〜6ファイル。`core/canvas` への一般化は2実例が揃った今、判断できる状態になった）`[sequence-m1]`
  - reply と呼出の対応（`replyTo`）が無く、reply 行の説明が一般文言であること `[sequence-m1]`
  - ガターの handled / notApplicable に `ok` 系の色を使っていない（コントラスト検算が済んだら再検討）`[sequence-m1]`

- [ ] **Step 3: rev へ反映する**

design-notes「rev 反映候補」の3点を `docs/overview-rev.md` に反映（2章のシーケンスの一行／6章のレイアウト関数規約の判断材料／10章の `horizontal`・`toggle-item-state`・`hierarchical: false` のキャンバス実例）。**TODO として申し送りに残さず、このコミットで済ませる**（lessons-for-planning）。

- [ ] **Step 4: コミット**

```bash
git add docs/
git commit -m "docs(sequence): M1 の申し送りと rev 反映"
```

---

## Self-Review（計画作成時に実施済み）

- **Spec coverage**: scope §1（スキーマ・二段検証）→ Task 1/3、§2（問い導出）→ Task 2、§3（キーボード）→ Task 4/5/9/11、§4（表示）→ Task 6/7/8/10/11、§5（完了条件）→ Task 11 の DOM テストと Task 13。OUT OF SCOPE の混入なし（ゾーン・マウス・出力・errorRefs・replyTo は不在）
- **型整合**: `SeqEditResult`（Task 4 定義 → Task 11 消費）、`StepShapeValue`（Task 4 → 9/10/11）、`AnswerPath`（Task 2 → 3/4/10/11）、`WrappedBlock`／定数（Task 6 → 7/11）、`SeqLayoutResult`（Task 7 → 10/11）を突き合わせ済み
- **既知の不確実点（実装者は矛盾として報告せよ）**: ①`validateAgainstSchema` の戻り値の形（Task 1）②生成型の `failures` ユニオンの正確な形（Task 4 のキャスト）③`createSeqMeasurer` の canvas 不在時の挙動（Task 11 Step 3-1）④`palette.test.ts` の走査形式（Task 12）
