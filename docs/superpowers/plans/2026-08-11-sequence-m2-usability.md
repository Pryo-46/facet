# sequence M2: 使い勝手改善 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 会議で使った sequence M1 エディタの使い勝手を9点改善する（入力動線・操作の穴・ガター表示・整合性指摘）。

**Architecture:** データ形式（スキーマ）は一切変えない。変更は `src/modules/sequence/` のコマンド・整合性検証・レイアウト・エディタ描画と、部品2つ（`StepShapeCell` / `ActorRefCell`）のキー委譲に閉じる。コアへの変更は無し。

**Tech Stack:** React + TypeScript + Tailwind（役割トークン）。テストは Vitest（純関数）+ Testing Library（DOM)。

## 採番についての注意

design-notes 論点12 は「M2 = ゾーン」を予定していたが、実際の会議使用から出た使い勝手改善を先に入れる。**本マイルストーンが sequence M2（usability）であり、ゾーンは後続へずれる。** design-notes は記録なので書き換えない（完了時に open-issues / history で補足する）。

## 設計の確定事項（ブレインストーミングで決定済み。蒸し返さない）

1. **新ステップの初期フォーカスは常に from**（`Enter` 追加・「ステップを追加」ボタン・0件からの生成すべて）。Tab 順の先頭＝レール左端に揃える
2. **ステップ 0 件のときだけ、末尾アクターの `Tab` で最初のステップを生やして from へ**。1件以上あるときの `Tab` は従来どおり。アクター行の `Enter`=追加・`Tab`=欄移動というファミリー標準は**変えない**（議論の結果、現状維持で決着）
3. **reply 行のガター文言を平易化**: 「─ 応答が返らないケースは、呼び出した側の「結果不明だったら？」に書く」
4. **立っていない問いへの答えは、行内にグレーの個別スロットで表示**（元の問いラベルに打ち消し線・答えテキスト・✕ ボタン）。削除は `ConfirmDialog` で確認を挟む。種別を戻せば答えは復活する（データは従来どおり消さない）。**切替直後の驚かせる主表示はこのグレー表示に移し、行内の赤枠（`stepHas(index,'failures')` の `border-warning`）は廃止**。バナー（整合性検証）は残る
5. **形セルはクリックでも切り替え**（`↑↓` と同じ巡回を1歩進める）
6. **`Alt+↑↓` の並び替えは骨格セル（from / to / 種別 / ラベル）のどこからでも効き、答えスロットでは効かない**。並び替え後のフォーカスは押したセルと同じ欄に残る
7. **reply 行の整合性指摘（unposed-answer）は 4 のグレースロット機構で行内に出る**（専用表示は作らない）。**self の to-mismatch（`field: 'to'`）は to セルが無いため行の帯（row）に落とす**
8. **from == to の呼出（call / reply）にレベル2指摘**「内部処理（self）にすべき」を足す。行の帯で見せる
9. **ガターの行境界は「行ブラケット」**: 各行のガター領域を左の縦線で括り、先頭に `#N 文言` の行見出しを置く。フォーカス中の行はブラケット線を強調する

**見送り（触らない）**: Tab の2ゾーン化／アクター行の Tab=追加・Enter=移動／`replyTo`／ok の面の濃さ検算。

## Global Constraints

- **スキーマ（`schemas/sequence.schema.json`）と正規形は変更しない**。データに新キーを作らない
- **`core/canvas` 等への共通化・抽象化を行わない**（M1 と同じ禁止。`viewport.ts` / `useViewport.ts` / `measure.ts` / `seq-font.ts` の複製に差分を作らない。直すときは logic-tree と両方——今回は触る予定なし）
- **`src/core/` への変更は無し**。キーの意味解決は `resolveCommand` のまま（`keymap.ts` に触らない）。エディタ側は「意味の写像」だけを変える
- **色は既存トークンのみ**（`bg-surface` / `border-rule` / `text-ink` / `text-ink-muted` / 検算済みの `bg-warning/10`・`bg-warning/20`・`border-warning`）。**新しい半透明濃度を作らない**（`palette.test.ts` の検査対象を増やさない）。`opacity-*` ユーティリティも使わない
- **計画のコードは検証済みの正ではない**（lessons-for-planning 大原則）。**指示が矛盾していたら辻褄を合わせずに「計画の矛盾」として報告すること**。報告には検証コマンドの実出力を貼ること
- 各タスクの検証は対象を絞らず `npm test` 全体 ＋ `npx tsc -b` ＋ `npm run lint`
- コミットは日本語の Conventional Commits（先例: `fix(sequence): ...` / `feat(sequence): ...`）

## ファイル構成（今回触るもの）

| ファイル | 変更 |
| --- | --- |
| `src/modules/sequence/questions.ts` | `presentAnswers` / `unposedAnswers` を追加（判定の一元化） |
| `src/modules/sequence/commands.ts` | `removeAnswer` を追加 |
| `src/modules/sequence/consistency.ts` | `present` 列挙を `presentAnswers` へ置換、`self-call` ルール追加 |
| `src/modules/sequence/layout.ts` | ガター行見出しの高さ `GUTTER_HEADING_HEIGHT` を行高と `slotTops` に織り込む |
| `src/modules/sequence/StepShapeCell.tsx` | 修飾キー付き矢印を親へ委譲、`onClick` で巡回 |
| `src/modules/sequence/ActorRefCell.tsx` | 修飾キー付き矢印を親へ委譲 |
| `src/modules/sequence/GhostSlot.tsx` | **新規**。立っていない答えのグレースロット |
| `src/modules/sequence/SequenceEditor.tsx` | フォーカス写像・0件Tab・ガター見出し／ブラケット・ghost 描画・削除ダイアログ・reply 文言 |
| 各 `.test.ts` / `.dom.test.tsx` | 上に対応するテスト |

タスクの依存: Task 1 → Task 9（`unposedAnswers` / `removeAnswer` を使う）。Task 3 → Task 8・9（`slotTops` の起点が変わる）。Task 5 → Task 6（`apply` の第2引数を使う）。それ以外は独立。

---

### Task 1: 「立っていない答え」の判定と削除コマンド（純関数）

**Files:**
- Modify: `src/modules/sequence/questions.ts`
- Modify: `src/modules/sequence/consistency.ts`（present 列挙の置き換えのみ）
- Modify: `src/modules/sequence/commands.ts`
- Test: `src/modules/sequence/questions.test.ts`、`src/modules/sequence/commands.test.ts`

**Interfaces:**
- Produces: `presentAnswers(step: Pick<SequenceStep, 'failures'>): AnswerPath[]` — 答えが「在る」パスの列挙（順序は failed → unknown → ifExecuted）
- Produces: `unposedAnswers(step: SequenceStep): AnswerPath[]` — 在るのに問いが立っていないパス
- Produces: `removeAnswer(d: SequenceSchemaVersion1, index: number, path: AnswerPath): SequenceSchemaVersion1` — スロットを未定義へ戻す（キーごと消す）
- 「在る」の判定は consistency.ts の現行と同一: `failed` は `failures.failed !== undefined`、`unknown` は `failures.unknown.decision !== undefined`（text だけの部分メモは数えない）、`ifExecuted` は `failures.unknown.ifExecuted !== undefined`

- [ ] **Step 1: questions.test.ts に失敗するテストを書く**

```ts
describe('presentAnswers / unposedAnswers', () => {
  const answered: SequenceStep = {
    id: 'step_Aaaaaaaaaa',
    kind: 'call',
    from: 'actor_Aaaaaaaaaa',
    to: 'actor_Bbbbbbbbbb',
    label: '与信依頼',
    awaitsReply: true,
    failures: {
      failed: { decision: 'handled', text: '画面にエラー' },
      unknown: {
        decision: 'handled',
        text: 'リトライ',
        ifExecuted: { decision: 'handled', text: '冪等性' },
      },
    },
  }

  it('3スロット回答済みの call は3つとも present', () => {
    expect(presentAnswers(answered)).toEqual(['failed', 'unknown', 'ifExecuted'])
  })

  it('text だけの unknown は present に数えない（decision があって初めて答え）', () => {
    const step = { ...answered, failures: { unknown: { text: 'メモ' } } }
    expect(presentAnswers(step)).toEqual([])
  })

  it('call-sync で3スロット回答済みなら unposed は無い', () => {
    expect(unposedAnswers(answered)).toEqual([])
  })

  it('投げっぱなしに切り替えると failed と ifExecuted が unposed になる', () => {
    const step = { ...answered, awaitsReply: false }
    expect(unposedAnswers(step)).toEqual(['failed', 'ifExecuted'])
  })

  it('reply に切り替えると3つとも unposed になる', () => {
    const { awaitsReply: _aw, ...rest } = answered
    const step: SequenceStep = { ...rest, kind: 'reply' }
    expect(unposedAnswers(step)).toEqual(['failed', 'unknown', 'ifExecuted'])
  })

  it('failures が無いステップは何も返さない', () => {
    const { failures: _f, ...bare } = answered
    expect(presentAnswers(bare)).toEqual([])
    expect(unposedAnswers(bare as SequenceStep)).toEqual([])
  })
})
```

※ `unknown` が unposed で `ifExecuted` が posed になる組合せは導出テーブル上存在しない（`ifExecuted` が立つのは call-sync だけで、そのとき `unknown` も立つ）。テストに書かない。

- [ ] **Step 2: 落ちることを確認** — `npm test -- questions` で `presentAnswers is not defined` 等の失敗を見る

- [ ] **Step 3: questions.ts に実装**

```ts
/**
 * 答えが「在る」パスの列挙（順序は QUESTION_ORDER と同じ failed → unknown → ifExecuted）。
 * text だけの unknown は数えない（decision があって初めて「答えた」）——
 * consistency.ts の unposed 判定と同一の規則で、判定の正はここ1箇所に置く
 */
export function presentAnswers(step: Pick<SequenceStep, 'failures'>): AnswerPath[] {
  const f = step.failures
  if (f === undefined) return []
  const present: AnswerPath[] = []
  if (f.failed !== undefined) present.push('failed')
  if (f.unknown?.decision !== undefined) present.push('unknown')
  if (f.unknown?.ifExecuted !== undefined) present.push('ifExecuted')
  return present
}

/** 在るのに問いが立っていない答え（種別切替の残骸）。ガターのグレースロットと整合性検証が使う */
export function unposedAnswers(step: SequenceStep): AnswerPath[] {
  const posed = poseQuestions(step)
  return presentAnswers(step).filter((path) => !posed[path])
}
```

`presentAnswers` の型注意: `SequenceStep['failures']` の `unknown.ifExecuted` の在処に合わせる（現物のフィールド名は `src/types/sequence.ts` を見て確認すること）。

- [ ] **Step 4: consistency.ts の present 列挙を置き換える**

`checkSequenceConsistency` 内の `const present: AnswerPath[] = []` から始まる 9 行（`if (step.failures.unknown.decision ...)` まで）を `const present = presentAnswers(step)` に置き換え、import を足す。`step.failures !== undefined` の外側ガードは残してよい（`presentAnswers` は無くても空を返すが、挙動を変えないのが安全）。**consistency.test.ts が全緑のままであること**（リファクタであり挙動は不変）。

- [ ] **Step 5: commands.test.ts に removeAnswer のテストを書く**

```ts
describe('removeAnswer', () => {
  it('failed を消すとキーごと消える（未定義に戻る）', () => {
    const d = data() // 既存テストのフィクスチャ生成に合わせる
    const withAnswer = setAnswerText(d, 0, 'failed', '再試行')
    const removed = removeAnswer(withAnswer, 0, 'failed')
    expect(removed.steps[0].failures?.failed).toBeUndefined()
  })

  it('ifExecuted だけ消しても unknown の答えは残る', () => {
    const d = setAnswerText(setAnswerText(data(), 0, 'unknown', 'リトライ'), 0, 'ifExecuted', '冪等性')
    const removed = removeAnswer(d, 0, 'ifExecuted')
    expect(removed.steps[0].failures?.unknown?.decision).toBe('handled')
    expect(removed.steps[0].failures?.unknown?.ifExecuted).toBeUndefined()
  })

  it('最後の答えを消すと failures キー自体が消える', () => {
    const d = setAnswerText(data(), 0, 'failed', '再試行')
    const removed = removeAnswer(d, 0, 'failed')
    expect('failures' in removed.steps[0]).toBe(false)
  })

  it('notApplicable の答えも消せる', () => {
    const d = toggleNotApplicable(data(), 0, 'failed')
    const removed = removeAnswer(d, 0, 'failed')
    expect(removed.steps[0].failures?.failed).toBeUndefined()
  })

  it('範囲外 index では同じ参照を返す', () => {
    const d = data()
    expect(removeAnswer(d, 99, 'failed')).toBe(d)
  })
})
```

- [ ] **Step 6: commands.ts に実装**

```ts
/**
 * 答えスロットを未定義へ戻す（decision も text もキーごと消す）。
 * setAnswerText(d, i, path, '') と結果は同じだが、「立っていない答えの削除」
 * という操作の意味を名前で残す（ghost スロットの ✕ が呼ぶ）
 */
export function removeAnswer(
  d: SequenceSchemaVersion1,
  index: number,
  path: AnswerPath,
): SequenceSchemaVersion1 {
  const step = d.steps[index]
  if (step === undefined) return d
  return replaceStep(d, index, writeSlot(step, path, undefined))
}
```

- [ ] **Step 7: 検証** — `npm test && npx tsc -b && npm run lint` すべて緑
- [ ] **Step 8: コミット** — `feat(sequence): 立っていない答えの判定と削除コマンドを足す`

---

### Task 2: 整合性検証 — from == to の指摘とテスト穴2つ

**Files:**
- Modify: `src/modules/sequence/consistency.ts`
- Test: `src/modules/sequence/consistency.test.ts`

**Interfaces:**
- Produces: ルール `'self-call'` — `kind !== 'self'` かつ `from === to`（両方が実在の参加者を指すとき）。`field: 'shape'`（エディタの写像で行の帯に落ちる）

- [ ] **Step 1: 失敗するテストを書く**（既存のフィクスチャ生成の形に合わせること）

```ts
it('from と to が同じ参加者を指す call に self-call が出る', () => {
  const d = base() // actors: [A, B] / steps: [call A→B] の既存形を流用
  d.steps[0].to = d.steps[0].from
  const issues = checkSequenceConsistency(d)
  const found = issues.filter((i) => i.rule === 'self-call')
  expect(found).toHaveLength(1)
  expect(found[0].message).toContain('内部処理')
  expect(found[0].locations[0].field).toBe('shape')
})

it('from が参照切れのときは self-call を出さない（missing-actor に任せる）', () => {
  const d = base()
  d.steps[0].from = 'actor_Zzzzzzzzzz'
  d.steps[0].to = 'actor_Zzzzzzzzzz'
  const issues = checkSequenceConsistency(d)
  expect(issues.some((i) => i.rule === 'self-call')).toBe(false)
})

it('self の from は to と比較されない（self-call は self に出ない）', () => {
  const d = base()
  d.steps[0] = { ...d.steps[0], kind: 'self' }
  delete d.steps[0].to
  delete d.steps[0].awaitsReply
  expect(checkSequenceConsistency(d).some((i) => i.rule === 'self-call')).toBe(false)
})
```

あわせて **open-issues 記載のテスト穴2つ**（この層に触るときの宿題）:

```ts
it('参加者の ID 重複も duplicate-id で指摘される（actor 側のループの変異検知）', () => {
  const d = base()
  d.actors = [
    { id: 'actor_Aaaaaaaaaa', name: '画面' },
    { id: 'actor_Aaaaaaaaaa', name: 'API' },
  ]
  const found = checkSequenceConsistency(d).filter((i) => i.rule === 'duplicate-id')
  expect(found).toHaveLength(1)
  expect(found[0].message).toContain('参加者')
  expect(found[0].locations).toHaveLength(2)
})

it('reply なのに to が無いと to-mismatch が出る（call だけに絞る変異の検知）', () => {
  const d = base()
  d.steps[0] = { ...d.steps[0], kind: 'reply' }
  delete d.steps[0].to
  delete d.steps[0].awaitsReply
  const found = checkSequenceConsistency(d).filter((i) => i.rule === 'to-mismatch')
  expect(found).toHaveLength(1)
  expect(found[0].message).toContain('応答')
})
```

- [ ] **Step 2: 落ちることを確認**（self-call の3本が落ち、穴埋め2本は**先に緑になるはず**——既存実装は正しいので。緑にならなければ実装の欠陥として報告）
- [ ] **Step 3: consistency.ts に self-call を実装**（`to-mismatch` の2判定の直後に置く）

```ts
    // from == to の呼出／応答は矢印が引けず、ラベルだけが宙に浮く。
    // self への変更を促す（ブレスト決定8）。参照切れのときは出さない
    //（まず missing-actor を直すべきで、重ねると三重指摘のノイズになる）
    if (step.kind !== 'self' && step.to !== undefined && step.to === step.from && actorIds.has(step.from)) {
      issues.push({
        rule: 'self-call',
        message: `${stepName(step, index)} の from と to が同じ参加者を指しています。自分への処理は形を「内部処理」（self）に変えて表します`,
        locations: [{ entityId: step.id, entityIndex: index, field: 'shape' }],
      })
    }
```

- [ ] **Step 4: 検証** — `npm test && npx tsc -b && npm run lint` すべて緑
- [ ] **Step 5: コミット** — `feat(sequence): from==to の呼出に self への変更を促す指摘を足す`

---

### Task 3: レイアウト — ガター行見出しの高さ

**Files:**
- Modify: `src/modules/sequence/layout.ts`
- Test: `src/modules/sequence/layout.test.ts`

**Interfaces:**
- Produces: `export const GUTTER_HEADING_HEIGHT = 18`（行見出し `#N 文言` の1行分。text-xs 12px + 余白 6）
- 変更: 全行で `slotTops` の起点が `top + GUTTER_HEADING_HEIGHT` になる。行高の計算式が `Math.max(MIN_ROW_HEIGHT, labelHeight + ARROW_GAP * 2, GUTTER_HEADING_HEIGHT + slotsHeight)` になる（**スロットが 0 の行も見出しは出る**が、`MIN_ROW_HEIGHT` 44 > 18 なので行高には効かない——エディタ側が見出しの下に一般文言を置く）

- [ ] **Step 1: 失敗するテストを書く**（等値でなく絶対値で。M1 の教訓）

```ts
it('slotTops は行見出しのぶん下がった位置から積まれる', () => {
  const result = layoutSequence({
    actorWidths: [80, 80],
    domains: [undefined, undefined],
    steps: [
      { fromIndex: 0, toIndex: 1, metrics: { labelWidth: 60, labelHeight: 20, slotHeights: [30, 30, 30] } },
    ],
  })
  const row = result.rows[0]
  expect(row.slotTops[0]).toBe(row.top + GUTTER_HEADING_HEIGHT)
  expect(row.slotTops[1]).toBe(row.top + GUTTER_HEADING_HEIGHT + 30 + SLOT_GAP)
  expect(row.slotTops[2]).toBe(row.top + GUTTER_HEADING_HEIGHT + (30 + SLOT_GAP) * 2)
})

it('行高は見出し込みのスロット群がラベルより高ければそちらで決まる', () => {
  const result = layoutSequence({
    actorWidths: [80, 80],
    domains: [undefined, undefined],
    steps: [
      { fromIndex: 0, toIndex: 1, metrics: { labelWidth: 60, labelHeight: 20, slotHeights: [30, 30, 30] } },
    ],
  })
  // 30*3 + SLOT_GAP*2 = 98、見出し 18 を足して 116（MIN_ROW_HEIGHT 44 とラベル 20+8*2=36 に勝つ）
  expect(result.rows[0].height).toBe(GUTTER_HEADING_HEIGHT + 98)
})

it('スロットが無い行の行高は MIN_ROW_HEIGHT のまま（見出し 18 は 44 に届かない）', () => {
  const result = layoutSequence({
    actorWidths: [80, 80],
    domains: [undefined, undefined],
    steps: [{ fromIndex: 0, toIndex: 1, metrics: { labelWidth: 60, labelHeight: 20, slotHeights: [] } }],
  })
  expect(result.rows[0].height).toBe(MIN_ROW_HEIGHT)
})
```

既存の layout.test.ts のうち **`slotTops` / 行高の絶対値を固定しているテストは、新しい式の値に更新する**（見出し 18 が乗る）。これは計画による仕様変更であり、既存テストの側を直すのが正。どのテストをどの値に変えたかを報告に列挙すること。

- [ ] **Step 2: 落ちることを確認**
- [ ] **Step 3: layout.ts に実装**

```ts
/** ガターの行見出し（#N 文言）の1行分。スロット群はこの下から積む */
export const GUTTER_HEADING_HEIGHT = 18
```

Y 軸ループの変更（現行 104〜120 行付近）:

```ts
    const height = Math.max(
      MIN_ROW_HEIGHT,
      m.labelHeight + ARROW_GAP * 2,
      GUTTER_HEADING_HEIGHT + slotsHeight,
    )
    const arrowY = top + m.labelHeight + ARROW_GAP
    const slotTops: number[] = []
    let slotTop = top + GUTTER_HEADING_HEIGHT
```

- [ ] **Step 4: 検証** — `npm test && npx tsc -b && npm run lint` すべて緑
- [ ] **Step 5: コミット** — `feat(sequence): ガター行見出しの高さをレイアウトに織り込む`

---

### Task 4: Alt+↑↓ — 骨格セル全部で並び替え・答えスロットで無効

**Files:**
- Modify: `src/modules/sequence/StepShapeCell.tsx`
- Modify: `src/modules/sequence/ActorRefCell.tsx`
- Modify: `src/modules/sequence/SequenceEditor.tsx`（`handleKey` の `reorderEnabled` を可変にする）
- Test: `src/modules/sequence/StepShapeCell.dom.test.tsx`、`src/modules/sequence/ActorRefCell.dom.test.tsx`、`src/modules/sequence/SequenceEditor.dom.test.tsx`

**現状の実態（読解済み）:** `resolveCommand` は `Alt+↑↓` を `arrowsOwnedByField` より先に判定するので、コアは既に全セルで `move-item-up/down` を返す。並び替えを止めているのは**部品側が修飾キーを見ずに ↑↓ を食っている**ことで、逆に答えスロット（何も食わない）では素通りして並び替わる。つまりコアは触らず、(a) 部品2つが修飾キー付き矢印を親へ委譲する、(b) 答えスロットは `reorderEnabled: false` を渡す、の2点で全部が揃う。

**Interfaces:**
- 変更: `SequenceEditor` の `handleKey` の context 型が `Omit<KeyContext, 'platform' | 'modalOpen'>` になり、各 `onXxxKeyDown` が `reorderEnabled` を明示する（actor / label / ref / shape → `true`、answer → `false`）

- [ ] **Step 1: 部品のテストを書く**（StepShapeCell.dom.test.tsx）

```ts
it('Alt+↓ は形を変えず、onFieldKeyDown へ委譲する', () => {
  const onChange = vi.fn()
  const onFieldKeyDown = vi.fn()
  render(
    <StepShapeCell
      value="call-sync"
      aria-label="ステップ1の形"
      data-cell="k:shape"
      onChange={onChange}
      onFieldKeyDown={onFieldKeyDown}
    />,
  )
  fireEvent.keyDown(screen.getByLabelText('ステップ1の形'), { key: 'ArrowDown', altKey: true })
  expect(onChange).not.toHaveBeenCalled()
  expect(onFieldKeyDown).toHaveBeenCalledOnce()
})
```

ActorRefCell.dom.test.tsx にも同型を1本（`Alt+↓` で `onSelect` が呼ばれず `onFieldKeyDown` に届く。参加者3人のフィクスチャで——2人だと「切替が起きない」と「委譲された」の区別が実装によっては付かない）。

- [ ] **Step 2: エディタ統合のテストを書く**（SequenceEditor.dom.test.tsx。既存の「Alt+↓ で並び替え（3行の真ん中から）」の隣に、**ステップ3行**のフィクスチャで）

```ts
it('from セルからの Alt+↓ でステップが並び替わる', () => {
  renderThreeSteps() // 既存の3行フィクスチャ生成に合わせる
  fireEvent.keyDown(screen.getByLabelText('ステップ2の送り手'), { key: 'ArrowDown', altKey: true })
  // onChange に渡った steps の順序が 1,3,2 になっている（既存テストの検証形に合わせる）
})

it('形セルからの Alt+↓ でステップが並び替わる', () => {
  renderThreeSteps()
  fireEvent.keyDown(screen.getByLabelText('ステップ2の形'), { key: 'ArrowDown', altKey: true })
  // 同上
})

it('答えスロットからの Alt+↓ ではステップが並び替わらない', () => {
  renderThreeSteps()
  fireEvent.keyDown(screen.getByLabelText(/^ステップ2の答え/), { key: 'ArrowDown', altKey: true })
  // onChange が呼ばれない
})
```

- [ ] **Step 3: 落ちることを確認**
- [ ] **Step 4: 実装**

StepShapeCell の onKeyDown 先頭を修飾キー無しに限定:

```ts
      onKeyDown={(e) => {
        // 修飾キー付きの矢印は操作言語のもの（Alt+↑↓＝並び替え）。素の ↑↓ だけが循環
        if (
          (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
          !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
        ) {
          e.preventDefault()
          cycle(e.key === 'ArrowUp' ? -1 : 1)
          return
        }
        props.onFieldKeyDown?.(e)
      }}
```

ActorRefCell の該当行も同形（`!composing &&` は残す）:

```ts
        if (
          !composing &&
          (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
          !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
        ) {
```

SequenceEditor: `handleKey` の型から `'reorderEnabled'` を外し、固定値 `reorderEnabled: true` の行を消す。5つの `onXxxKeyDown` すべての context に `reorderEnabled` を足す——`onActorKeyDown` / `onLabelKeyDown` / `onRefKeyDown` / `onShapeKeyDown` は `reorderEnabled: true`（コメント「M1 には導出表示が無いので常に有効」を actor のところへ移す）、`onAnswerKeyDown` は `reorderEnabled: false`（コメント「答えを見比べている最中に図の時系列を動かさない。ガターは図と別の列」）。

- [ ] **Step 5: 検証** — `npm test && npx tsc -b && npm run lint` すべて緑。素の ↑↓ の既存テスト（形の循環・参加者の切替）が緑のままであることを特に見る
- [ ] **Step 6: コミット** — `fix(sequence): Alt+↑↓ の並び替えを骨格セル全体に広げ答えスロットで無効にする`

---

### Task 5: フォーカス写像 — 新ステップは from・並び替えは同じ欄に残る

**Files:**
- Modify: `src/modules/sequence/SequenceEditor.tsx`
- Test: `src/modules/sequence/SequenceEditor.dom.test.tsx`

**Interfaces:**
- 変更: `CellTarget` の ref が `{ kind: 'ref'; index: number; field: 'from' | 'to' }` になる
- 変更: `apply(result: SeqEditResult, focusField?: string)` — `focusField` は `data-cell` の接尾辞（`'from' | 'to' | 'shape' | 'label' | 'name'`）。省略時は従来どおり actor→`name` / step→`label`
- `commands.ts` は変更しない（`SeqFocus` はそのまま）

- [ ] **Step 1: 失敗するテストを書く**

```ts
it('Enter でステップを追加すると新ステップの from にフォーカスが移る', () => {
  // 既存の「Enter でステップ追加」テストのフィクスチャを流用
  fireEvent.keyDown(screen.getByLabelText('ステップ1の文言'), { key: 'Enter' })
  // 再レンダー後（onChange を受けて data を差し替える既存のテストホスト形式で）
  expect(document.activeElement?.getAttribute('aria-label')).toBe('ステップ2の送り手')
})

it('from セルからの Alt+↓ の後、フォーカスは動かした行の from に残る', () => {
  renderThreeSteps()
  fireEvent.keyDown(screen.getByLabelText('ステップ2の送り手'), { key: 'ArrowDown', altKey: true })
  expect(document.activeElement?.getAttribute('aria-label')).toBe('ステップ3の送り手')
})

it('形セルからの Alt+↓ の後、フォーカスは動かした行の形に残る', () => {
  renderThreeSteps()
  fireEvent.keyDown(screen.getByLabelText('ステップ2の形'), { key: 'ArrowDown', altKey: true })
  expect(document.activeElement?.getAttribute('aria-label')).toBe('ステップ3の形')
})
```

※ 既存の DOM テストホストが `onChange` 後の再レンダーをどう回しているか（制御コンポーネントを包むテスト用ホストの有無）は実物に合わせること。`pendingFocus` は再レンダー後の effect で発火するため、`act` の外では観測できない。

- [ ] **Step 2: 落ちることを確認**
- [ ] **Step 3: 実装**

(a) `CellTarget` の ref を `{ kind: 'ref'; index: number; field: 'from' | 'to' }` に変え、`onRefKeyDown(e, index, field, state)` にして JSX の2箇所（from / to の `onFieldKeyDown`）から渡す。

(b) `apply` に第2引数:

```ts
  /** 編集結果を額縁へ渡し、次に編集させたいセルへフォーカスを予約する。
      focusField は data-cell の接尾辞。省略時は actor→name / step→label */
  const apply = (result: SeqEditResult, focusField?: string): void => {
    if (result.data === data) return
    onChange(result.data, null)
    const focus = result.focus
    if (focus === null) {
      setPendingFocus(null)
      return
    }
    const keys = computeRowKeys(focus.kind === 'actor' ? result.data.actors : result.data.steps)
    const key = keys[focus.index]
    const fallback = focus.kind === 'actor' ? 'name' : 'label'
    setPendingFocus(key === undefined ? null : `${key}:${focusField ?? fallback}`)
  }
```

(c) `runCommand` の写像:

```ts
    /** 並び替えの後もフォーカスを同じ欄に残すための接尾辞 */
    const fieldOf = (t: CellTarget): string | undefined => {
      if (t.kind === 'ref') return t.field
      if (t.kind === 'shape') return 'shape'
      return undefined // actor→name / label→label は apply の既定に任せる
    }
    switch (cmd) {
      case 'insert-item-after':
        // 新ステップの初期フォーカスは from（Tab 順の先頭＝レール左端。ブレスト決定1）
        apply(
          target.kind === 'actor' ? addActorAfter(data, index) : addStepAfter(data, index),
          target.kind === 'actor' ? undefined : 'from',
        )
        return true
      ...
      case 'move-item-up':
        apply(target.kind === 'actor' ? moveActor(data, index, -1) : moveStep(data, index, -1), fieldOf(target))
        return true
      case 'move-item-down':
        apply(target.kind === 'actor' ? moveActor(data, index, 1) : moveStep(data, index, 1), fieldOf(target))
        return true
```

(d) 「ステップを追加」ボタンも `apply(addStepLast(data), 'from')` に変える。

`delete-item` は変えない（削除後の行き先は従来どおり隣の行の label / name）。

- [ ] **Step 4: 検証** — `npm test && npx tsc -b && npm run lint` すべて緑。**既存テストに「追加後のフォーカスが label」を固定するものがあれば、新仕様（from）側へ更新し、更新したテスト名を報告に列挙する**（grep 済みの範囲では見つかっていないが、`getByLabelText` 経由の間接依存がありうる）
- [ ] **Step 5: コミット** — `feat(sequence): 新ステップの初期フォーカスを from にし並び替えでフォーカスの欄を保つ`

---

### Task 6: ステップ 0 件のとき末尾アクターの Tab でステップを生やす

**Files:**
- Modify: `src/modules/sequence/SequenceEditor.tsx`
- Test: `src/modules/sequence/SequenceEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `apply(result, 'from')`（Task 5）、既存の `addStepLast`（actors[0] → actors[1] ?? actors[0] の call を末尾に足す）
- `runCommand` が `'focus-next-field'` を条件付きで消費する。**`keymap.ts` は触らない**——「Tab＝次の欄へ」という意味の解決はコアのまま、「次の欄が無いなら作る」はツール側の写像の範囲（rev 10章の一元化と矛盾しない）

- [ ] **Step 1: 失敗するテストを書く**

```ts
it('ステップ 0 件のとき、末尾アクターの Tab で最初のステップが生えて from にフォーカスする', () => {
  // アクター2人・ステップ 0 件のフィクスチャ
  fireEvent.keyDown(screen.getByLabelText('参加者2の名前'), { key: 'Tab' })
  // onChange に steps 1 件のデータが渡り、フォーカスが「ステップ1の送り手」へ
})

it('ステップ 0 件でも、末尾でないアクターの Tab では生えない', () => {
  fireEvent.keyDown(screen.getByLabelText('参加者1の名前'), { key: 'Tab' })
  // onChange が呼ばれない
})

it('ステップが 1 件でもあれば、末尾アクターの Tab では生えない（既定動作のまま）', () => {
  // アクター2人・ステップ1件のフィクスチャ
  fireEvent.keyDown(screen.getByLabelText('参加者2の名前'), { key: 'Tab' })
  // onChange が呼ばれない
})

it('Shift+Tab では生えない', () => {
  fireEvent.keyDown(screen.getByLabelText('参加者2の名前'), { key: 'Tab', shiftKey: true })
  // onChange が呼ばれない
})
```

- [ ] **Step 2: 落ちることを確認**
- [ ] **Step 3: runCommand に実装**（`toggle-item-state` の case の後に）

```ts
      case 'focus-next-field':
        // ステップ 0 件のとき、末尾アクターの Tab には「次の欄」が無く額縁の外へ
        // 抜けてしまう。移動先を生やして from へ置く（ブレスト決定2）。
        // 1件以上あるときは従来どおり DOM 順の Tab に任せる（消費しない）
        if (target.kind === 'actor' && index === data.actors.length - 1 && data.steps.length === 0) {
          apply(addStepLast(data), 'from')
          return true
        }
        return false
```

- [ ] **Step 4: 検証** — `npm test && npx tsc -b && npm run lint` すべて緑
- [ ] **Step 5: コミット** — `feat(sequence): ステップ0件時は末尾アクターの Tab で最初のステップを生やす`

---

### Task 7: 形セルのクリック切り替え

**Files:**
- Modify: `src/modules/sequence/StepShapeCell.tsx`
- Test: `src/modules/sequence/StepShapeCell.dom.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

```ts
it('クリックで形が1歩進む（↓ と同じ巡回）', () => {
  const onChange = vi.fn()
  render(
    <StepShapeCell value="call-sync" aria-label="ステップ1の形" data-cell="k:shape" onChange={onChange} />,
  )
  fireEvent.click(screen.getByLabelText('ステップ1の形'))
  expect(onChange).toHaveBeenCalledWith('call-async')
})

it('末尾の形のクリックは先頭に戻る', () => {
  const onChange = vi.fn()
  render(
    <StepShapeCell value="self" aria-label="ステップ1の形" data-cell="k:shape" onChange={onChange} />,
  )
  fireEvent.click(screen.getByLabelText('ステップ1の形'))
  expect(onChange).toHaveBeenCalledWith('call-sync')
})
```

- [ ] **Step 2: 落ちることを確認**
- [ ] **Step 3: 実装** — `<button>` に `onClick={() => cycle(1)}` を1本足す（rev 10章「キーでしか到達できない意味を残さない」への対応。キーと同じ `cycle` を通る2つ目の入口）
- [ ] **Step 4: 検証** — `npm test && npx tsc -b && npm run lint` すべて緑
- [ ] **Step 5: コミット** — `fix(sequence): 形セルをクリックでも切り替えられるようにする`

---

### Task 8: ガター行ブラケット・行見出し・reply 文言・フォーカス強調

**Files:**
- Modify: `src/modules/sequence/SequenceEditor.tsx`
- Test: `src/modules/sequence/SequenceEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `GUTTER_HEADING_HEIGHT`（Task 3）
- 見た目の仕様（ブレスト決定9・視覚モック確定）:
  - 各ステップ行のガター領域の左に**縦のブラケット線**（`border-l-2`。通常 `border-rule`、フォーカス行は `border-ink-muted`）
  - 線の位置は `layout.gutterX - 8`、縦は `row.top` から「行のガター内容の実高」まで
  - 行見出し `#N 文言`（文言が空なら `#N`）を `row.top` に、`text-xs text-ink-muted` で。`aria-hidden`（各セルの aria-label が既に「ステップN の…」と名乗っている）
  - reply 行の一般文言を平易化: `─ 応答が返らないケースは、呼び出した側の「結果不明だったら？」に書く`。位置は見出しの下（`row.top + GUTTER_HEADING_HEIGHT`）

- [ ] **Step 1: 失敗するテストを書く**

```ts
it('ガターに行見出し #N 文言 が出る', () => {
  // ステップ2行（文言「与信依頼」「与信結果」）のフィクスチャ
  expect(screen.getByText('#1 与信依頼')).toBeDefined()
  expect(screen.getByText('#2 与信結果')).toBeDefined()
})

it('文言が空のステップの行見出しは #N だけ', () => {
  // レールの通し番号も「#1」を出すので、単数 getByText は複数ヒットで throw する。
  // レール1つ＋ガター見出し1つ＝ちょうど2つであることを固定する
  expect(screen.getAllByText('#1')).toHaveLength(2)
})

it('reply 行の一般文言が平易な形で出る', () => {
  // kind: reply のステップを含むフィクスチャ
  expect(
    screen.getByText('─ 応答が返らないケースは、呼び出した側の「結果不明だったら？」に書く'),
  ).toBeDefined()
})
```

既存の 166 行 `expect(screen.getByText('─ 応答の失敗は呼出側の「結果不明」が扱う'))` は**新文言に更新する**（計画による文言変更。ブレスト決定3）。

ブラケット線とフォーカス強調は見た目（クラス）の話なので DOM テストで固定しない（lessons「DOM テストはレイアウトやクラス名に依存させない」）。実機確認（Task 10)の項目に入れる。

- [ ] **Step 2: 落ちることを確認**
- [ ] **Step 3: 実装**

(a) フォーカス行の追跡を state で持つ:

```ts
  // ガターのブラケット強調用。どの行のセルにフォーカスがあるか（ガター外は null）
  const [focusedRow, setFocusedRow] = useState<number | null>(null)
```

各ステップ行の外側 `<div key={key}>` を `onFocusCapture={() => setFocusedRow(index)}` にし、コンテナ（`containerRef` の div）に `onBlurCapture={(e) => { if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setFocusedRow(null) }}` を付ける（フォーカスがエディタ外へ出たときだけ消す。行内・行間の移動は次の focusCapture が上書きする）。

(b) ステップ行の JSX（ガター部分の直前）に見出しとブラケットを足す:

```tsx
              {/* ガターの行ブラケット＋行見出し（ブレスト決定9）。答えスロットが
                  どのステップの行かを、図の番号と縦線で括って見せる */}
              {(() => {
                const slotsBottom =
                  view.answers.length === 0
                    ? row.top + GUTTER_HEADING_HEIGHT + 18
                    : row.slotTops[row.slotTops.length - 1] +
                      view.answers[view.answers.length - 1].height
                return (
                  <>
                    <div
                      aria-hidden="true"
                      className={`absolute border-l-2 ${focusedRow === index ? 'border-ink-muted' : 'border-rule'}`}
                      style={{ left: layout.gutterX - 8, top: row.top, height: slotsBottom - row.top }}
                    />
                    <div
                      aria-hidden="true"
                      className="absolute truncate text-xs text-ink-muted"
                      style={{ left: layout.gutterX, top: row.top, width: layout.gutterWidth }}
                    >
                      {step.label === '' ? `#${index + 1}` : `#${index + 1} ${step.label}`}
                    </div>
                  </>
                )
              })()}
```

※ `slotsBottom` の式は Task 9 で ghost スロットを含む形（`row.slotTops` は ghost も含めた配列になる）へ自然に引き継がれる。Task 9 実施後は `view.answers` でなく「描画したスロット全部」の末尾で計算し直すこと。
※ 見出しは `aria-hidden` のため `getByText` で引ける（`aria-hidden` はアクセシビリティツリーから外すだけで DOM には居る）。

(c) reply 行の一般文言の座標を `top: row.top + GUTTER_HEADING_HEIGHT` に変え、文言を差し替える。

(d) `answers.length > 0` のスロット描画は `y={row.slotTops[slotIndex]}` のままで動く（Task 3 が起点をずらし済み）。

- [ ] **Step 4: 検証** — `npm test && npx tsc -b && npm run lint` すべて緑。`border-ink-muted` が生成 CSS に出ることを `npx vite build` 後の CSS で grep 確認（`--color-ink-muted` トークンからの自動生成を期待しているが、**カスケード関連は生成物を見るまで検証したことにならない**——lessons）。出ていなければ強調は `border-ink` 等の実在するクラスで代替し、計画の矛盾として報告
- [ ] **Step 5: コミット** — `feat(sequence): ガターに行ブラケットと行見出しを足し reply 文言を平易にする`

---

### Task 9: 立っていない答えのグレースロットと確認付き削除

**Files:**
- Create: `src/modules/sequence/GhostSlot.tsx`
- Modify: `src/modules/sequence/SequenceEditor.tsx`
- Test: `src/modules/sequence/SequenceEditor.dom.test.tsx`（統合で固定する。GhostSlot 単体テストは作らない——描画と削除の意味はエディタ統合でしか完結しない）

**Interfaces:**
- Consumes: `unposedAnswers` / `removeAnswer`（Task 1）、`ConfirmDialog`（`src/components/ConfirmDialog.tsx`。開いている間は `modalOpen` を立てる規約）
- Produces: `GhostSlot` props:

```ts
export interface GhostSlotProps {
  /** 元の問いの汎用文言（下の GHOST_QUESTION_LABEL） */
  question: string
  /** 答えの表示テキスト。notApplicable で text 無しは '─ 考慮不要' を渡す */
  text: string
  'aria-label': string
  x: number
  y: number
  labelWidth: number
  answerWidth: number
  height: number
  onDelete: () => void
}
```

- 表示仕様（視覚モック確定・ブレスト決定4）: 問いラベルは `line-through` 付き `text-xs text-ink-muted`。答えは**読み取り専用**の `text-sm text-ink-muted` に `border border-dashed border-rule bg-surface`（既存トークンのみ。半透明・opacity 不使用）。右に ✕ ボタン（`aria-label` = 「この答えを削除」を含む一意な文言）
- 問いの汎用文言（切替後は元の種別が分からないため、call-sync の文言を汎用として使う）。**`SequenceEditor.tsx` のモジュール定数として置く**（`GhostSlot` は文字列を受け取るだけで意味を知らない）:

```ts
const GHOST_QUESTION_LABEL: Record<AnswerPath, string> = {
  failed: '失敗が確定したら？',
  unknown: '結果不明だったら？',
  ifExecuted: '実行済みだったら？',
}
```

- [ ] **Step 1: 失敗するテストを書く**（SequenceEditor.dom.test.tsx）

```ts
describe('立っていない答えのグレースロット', () => {
  // call-sync で failed に「再試行する」を回答済み → 投げっぱなしに切替、のフィクスチャ
  // （awaitsReply: false / failures: { failed: { decision: 'handled', text: '再試行する' } }）

  it('立っていない答えがグレースロットとして描画される', () => {
    expect(screen.getByText('再試行する')).toBeDefined()
    expect(screen.getByText('失敗が確定したら？')).toBeDefined() // 打ち消し線付きの問いラベル
  })

  it('✕ を押すと確認ダイアログが出て、削除で failures から消える', () => {
    fireEvent.click(screen.getByLabelText(/この答えを削除/))
    fireEvent.click(screen.getByText('削除する'))
    // onChange に渡った steps[0] の failures が消えている（キーごと）
  })

  it('確認ダイアログでキャンセルすると何も変わらない', () => {
    fireEvent.click(screen.getByLabelText(/この答えを削除/))
    fireEvent.click(screen.getByText('キャンセル'))
    // onChange が呼ばれず、グレースロットが残る
  })

  it('notApplicable の立っていない答えは「─ 考慮不要」で見える', () => {
    // failures: { failed: { decision: 'notApplicable' } } を投げっぱなしに切替たフィクスチャ
    expect(screen.getByText('─ 考慮不要')).toBeDefined()
  })

  it('reply 行でも立っていない答えがグレースロットで出る（行内表示＝ブレスト決定7）', () => {
    // kind: reply / failures: { failed: {...} } のフィクスチャ
    expect(screen.getByText(/^─ 応答が返らない/)).toBeDefined() // 一般文言と共存
    expect(screen.getByLabelText(/この答えを削除/)).toBeDefined()
  })

  it('種別を元に戻すと答えは通常スロットに復活する', () => {
    // 投げっぱなし→（形セルで）call-sync に戻す → 「再試行する」が編集可能なスロットに居る
    // 既存の setStepShape が failures を消さないことの画面側の固定
  })
})
```

あわせて **self の to-mismatch が行の帯になる**テスト:

```ts
it('self なのに to があるステップは行の帯（row）扱いになる', () => {
  // kind: 'self' で to が残っているフィクスチャ + issues に to-mismatch を渡す
  // stepHas(index, 'row') 系の観測: 行の帯 div が出る（背景レイヤの bg-warning/20）
  // 既存の row レベル指摘のテストがどう観測しているかの形に合わせる
})
```

- [ ] **Step 2: 落ちることを確認**
- [ ] **Step 3: GhostSlot.tsx を実装**

```tsx
/**
 * 立っていない問いへの答え（種別切替の残骸）のグレースロット（ブレスト決定4）。
 * 編集はさせない——立っていない問いに答えを「書き足す」のは矛盾の拡大で、
 * できるのは消すか、種別を戻して復活させるかの二択。削除の確認は
 * 呼び出し側（エディタ）が ConfirmDialog で行い、ここは onDelete を叩くだけ
 */
export function GhostSlot(props: GhostSlotProps) {
  return (
    <div
      className="pointer-events-auto absolute flex items-start gap-1"
      style={{ left: props.x, top: props.y, height: props.height }}
    >
      <div
        className="shrink-0 py-1 text-xs text-ink-muted line-through"
        style={{ width: props.labelWidth }}
      >
        {props.question}
      </div>
      <div
        className="whitespace-pre-wrap break-all rounded-sm border border-dashed border-rule bg-surface px-2 py-1 text-sm text-ink-muted"
        style={{ width: props.answerWidth, minHeight: props.height }}
      >
        {props.text}
      </div>
      <button
        type="button"
        className="shrink-0 rounded-sm border border-rule bg-surface px-1.5 py-0.5 text-xs text-ink-muted hover:bg-canvas focus:ring-2 focus:ring-inset focus:ring-ring"
        aria-label={props['aria-label']}
        onClick={props.onDelete}
      >
        ✕
      </button>
    </div>
  )
}
```

- [ ] **Step 4: エディタに配線**

(a) `stepViews` に ghost を足す（`answers` の後）:

```ts
    const ghosts = unposedAnswers(step).map((path) => {
      const slot = readAnswer(step, path)
      const text =
        slot.decision === 'notApplicable' && (slot.text === undefined || slot.text === '')
          ? '─ 考慮不要'
          : slot.text ?? ''
      const block = wrap('answer', text === '' ? '未定義' : text, ANSWER_WRAP)
      return { path, text, height: block.height }
    })
    ...
    return { shape, label, answers, ghosts, fromIndex, toIndex }
```

(b) `layoutInput` の `slotHeights` を `[...view.answers.map(a => a.height), ...view.ghosts.map(g => g.height)]` にする（layout はそのまま両方の `slotTops` を出す。**layout.ts は触らない**）。

(c) 描画: 通常スロットの後に

```tsx
              {view.ghosts.map((ghost, ghostIndex) => (
                <GhostSlot
                  key={`${key}:ghost:${ghost.path}`}
                  question={GHOST_QUESTION_LABEL[ghost.path]}
                  text={ghost.text}
                  aria-label={`ステップ${index + 1}の立っていない答え「${GHOST_QUESTION_LABEL[ghost.path]}」: この答えを削除`}
                  x={layout.gutterX}
                  y={row.slotTops[view.answers.length + ghostIndex]}
                  labelWidth={QUESTION_LABEL_WIDTH}
                  answerWidth={ANSWER_BOX_WIDTH}
                  height={ghost.height}
                  onDelete={() => setConfirmTarget({ index, path: ghost.path })}
                />
              ))}
```

`view.answers.length === 0` の一般文言分岐は「`answers` も `ghosts` も無いとき」だけ一般文言、`ghosts` があるときは一般文言＋ghost の両方を出す（reply の説明と残骸の可視化は両立する。一般文言の y は Task 8 の位置のまま、ghost の `slotTops` は layout が出す）。**注意: 一般文言と ghost が重ならないよう、ghosts がある行では一般文言を省略してもよい**——どちらにするかは画面を見て決めてよいが、テストのフィクスチャと合わせること（上のテスト例は共存を仮定している。省略にしたらテストも直し、報告に書く）。

(d) 削除確認:

```ts
  const [confirmTarget, setConfirmTarget] = useState<{ index: number; path: AnswerPath } | null>(null)
  // エディタ内ダイアログが開いている間も操作言語を止める（rev 10章 境界規則）
  const anyModalOpen = modalOpen || confirmTarget !== null
```

`useViewport(containerRef, !anyModalOpen)` と `handleKey` の `modalOpen: anyModalOpen` に差し替え、JSX 末尾に:

```tsx
      <ConfirmDialog
        open={confirmTarget !== null}
        title="答えを削除しますか？"
        description={
          confirmTarget === null
            ? ''
            : `「${GHOST_QUESTION_LABEL[confirmTarget.path]}」への答えを削除します。削除後は Undo で戻せます。削除せず種別を元に戻せば、答えはそのまま復活します。`
        }
        confirmLabel="削除する"
        onConfirm={() => {
          if (confirmTarget !== null) onChange(removeAnswer(data, confirmTarget.index, confirmTarget.path), null)
          setConfirmTarget(null)
        }}
        onCancel={() => setConfirmTarget(null)}
      />
```

(e) **`stepHas(index, 'failures')` の赤枠（`border-warning` の囲い）を削除する**（ブレスト決定4——unposed の主表示は ghost スロットに移った。`field: 'failures'` を指すのは unposed-answer だけであることは consistency.ts で確認済み）。

(f) **self の to-mismatch を row に落とす**: `invalidStepFields` の構築ループで

```ts
      const rawField =
        location.field === 'from' || location.field === 'to' || location.field === 'failures'
          ? location.field
          : 'row'
      // self は to セルを描画しないので、to への指摘は行の帯で見せる（ブレスト決定7）
      const field =
        rawField === 'to' && data.steps[location.entityIndex]?.kind === 'self' ? 'row' : rawField
```

（`'failures'` は (e) で使い手が消えるが、写像自体は残してよい——`stepHas` が false を返すだけ）

(g) Task 8 の脚注どおり、ブラケット線の `slotsBottom` を ghost 込みの末尾で計算し直す:

```ts
                const lastIndex = view.answers.length + view.ghosts.length - 1
                const lastHeight =
                  view.ghosts.length > 0
                    ? view.ghosts[view.ghosts.length - 1].height
                    : view.answers.length > 0
                      ? view.answers[view.answers.length - 1].height
                      : 0
                const slotsBottom =
                  lastIndex < 0
                    ? row.top + GUTTER_HEADING_HEIGHT + 18
                    : row.slotTops[lastIndex] + lastHeight
```

- [ ] **Step 5: 検証** — `npm test && npx tsc -b && npm run lint` すべて緑。`palette.test.ts` / `conventions.test.ts` が新ファイル `GhostSlot.tsx` を走査対象に含むこと（走査は `src/modules/` 配下ディレクトリ単位のはず——**含まれない形なら計画の矛盾として報告**）
- [ ] **Step 6: コミット** — `feat(sequence): 立っていない答えをグレースロットで見せ確認付きで消せるようにする`

---

### Task 10: 実機確認（人間の作業。サブエージェントは GUI を操作できない）

**このタスクの結果が出るまで、Task 11 の申し送りには「実機確認: 未実施」と明記し、チェックリストを空のまま残す**（lessons: 実機確認とドキュメント反映を同じタスクに束ねない）。

`npm run tauri dev` で起動し、シーケンスファイルを開いて確認する。`sample-project/` を使い、**終わったら `git checkout -- sample-project/ && git clean -fd sample-project/` で痕跡を捨てる**（CLAUDE.md）。

- [ ] 空の状態 →「クリックして開始」→ 参加者2〜3人 → **末尾アクターで Tab** → 最初のステップが生えて from にフォーカスが居る
- [ ] `Enter` でステップを追加すると**フォーカスが from に居る**。from → Tab → to → 種別 → ラベル → 答え、と流れる。日本語変換確定の Enter で誤爆しない（M1 の最重要項目の回帰）
- [ ] from / to / 種別 / ラベルの**どのセルからでも `Alt+↑↓`** でステップが並び替わり、フォーカスが同じ欄に残って連打できる
- [ ] 答えスロットで `Alt+↑↓` を押しても図が動かない
- [ ] 形セルを**マウスでクリック**すると形が巡回する
- [ ] 呼出（3問回答済み）を投げっぱなしへ切り替える → 答えがグレースロット（打ち消し線の問い＋破線枠）で残り、**赤バナーは出るが行内に赤枠は出ない**
- [ ] ✕ → 確認ダイアログ → 削除。`Ctrl+Z` で戻る。ダイアログ表示中はキャンバスのズーム・パン・キーが止まっている
- [ ] 種別を元に戻すと答えが通常スロットに復活する
- [ ] reply 行: 新しい一般文言が読める。reply に答えの残骸がある行はグレースロットが出る
- [ ] from == to の呼出を作る → バナーに「内部処理（self）に変えて」の指摘＋行の帯
- [ ] ガターの行見出し（#N 文言）とブラケット線で、答えスロットの所属行が読める。フォーカス行の線が濃くなる
- [ ] ズームアウトしても行見出し・ブラケットが図の邪魔をしない（「考慮漏れヒートマップ」が保たれているか）
- [ ] ライト・ダーク両モードで一巡（グレースロットの破線・打ち消し線が両モードで読める）
- [ ] 結果を記録した（崩れた項目は具体的に）

---

### Task 11: ドキュメント反映（実機確認の結果が出てから）

**Files:**
- Create: `docs/history/sequence-m2-usability.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`（10章）
- Modify: `docs/lessons-for-planning.md`（教訓が出た場合のみ）

- [ ] **Step 1: history を書く** — 実装で確定した事項・計画の誤りとして報告されたもの・テストが守っていなかった箇所・実機確認の結果（Task 10 のチェックリストを転記）。**採番の補足**（design-notes 論点12 の「M2=ゾーン」より先に usability の M2 が入り、ゾーンは後続へずれた）を明記
- [ ] **Step 2: open-issues.md を更新**
  - **消す**: 「`StepShapeCell` で形を変えられるのは `↑↓` だけ」「答えスロットで `Alt+↑↓` を押すとステップが並び替わる」「`reply` の行に `unposed-answer` の赤が出ない」「種別を切り替えると…直接消す手段が無い」「`from === to` の call は…」「ガターの行境界・対象範囲が見えにくい」「アクター行の `Tab`=追加・`Enter`=移動という案」（議論の結果、現状維持で決着——経緯は history へ）
  - **テスト穴の項を更新**: `consistency.test.ts` の2穴（actor ID 重複・reply の to 欠落）は Task 2 で解消。`schema.test.ts` の3穴は残る（今回スキーマに触っていない）——項目を分割して書き直す
  - **残す**: Tab の2ゾーン化（見送り）・空欄 Backspace の観察・`replyTo`・ドロップダウン化（M3）・ok の面の濃さ
  - **新規があれば足す**（実機確認で出た観察）
- [ ] **Step 3: rev 10章に反映** — 構造依存層の適用例として1行:「ステップ 0 件のときだけ、末尾アクターの `Tab` が『最初のステップを生やして from へ』になる（sequence M2。意味の解決はコアのまま、写像だけツール側）」。アクター行の割り当てを**変えなかった**ことも適用例の側に足す価値があれば1行（Tab=追加案はファミリー標準と衝突するため退けた）
- [ ] **Step 4: 検証** — `npm test && npx tsc -b && npm run lint && npx vite build` すべて緑（Tailwind の候補スキャナが計画書の Markdown を拾う既知の挙動に注意——生成 CSS に無害な残骸が出るのは M1 で記録済みの正常系）
- [ ] **Step 5: コミット** — `docs(sequence-m2): 申し送りと残件・rev を更新する`

---

## Self-Review 済みの注意点（実装者へ）

- **Task 8 と Task 9 は同じ描画領域を触る**。Task 8 の `slotsBottom` は Task 9 で式が変わる（ghost 込み）。Task 8 の時点のコードをそのまま残さないこと
- **`readAnswer` は `SequenceEditor.tsx` 内のローカル関数**（`commands.ts` の `readSlot` と重複、open-issues 記載の既知の負債）。Task 9 はこれをそのまま使う——今回は統合しない（統合は「3本目」が出たときの判断。負債を増やしはしない）
- **`ConfirmDialog` は Esc・オーバーレイクリックで `onCancel` に落ちる**（ChoiceDialog と違いキャンセル可能な設計）。削除の確認にはこの挙動が適切
- **`data-cell` の接尾辞 `'from' | 'to' | 'shape' | 'label' | 'name'` は既存の JSX が既に使っている値**。Task 5 の `focusField` はこれと一致させること（`rects` の鍵も同じ接尾辞）
- 性能: `unposedAnswers` は毎レンダー全ステップで走るが、既存の `checkConsistency` 毎打鍵全実行（open-issues 記載）と同規模であり、新たな性能課題は作らない
