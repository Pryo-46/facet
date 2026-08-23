# M22 実装計画: 欠落の規約——空は空のまま、数えて、行番号で指す

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 欠落（未決）の判定・集計・表示を5モジュールで統一し、捏造文字列を消し、重複警告を件数＋行番号にし、規約を `docs/missing-semantics.md` に固定する。

**Architecture:** 判定は各モジュールの `missing.ts`（純関数）、集計の型と文字列はコア `src/core/missing-tally.ts`、表示は共通部品 `src/components/MissingTally.tsx`。課題ツリーの既存実装（`poseQuestions` → `tallyQuestions` → 帯のチップ）を参照実装として一般化する。

**Tech Stack:** React + TypeScript + Tailwind v4（役割トークン）、vitest（`npm test`）、oxlint。

**Spec:** [`2026-08-24-m22-missing-semantics-design.md`](2026-08-24-m22-missing-semantics-design.md)（同ディレクトリ）。**計画と矛盾したら辻褄を合わせず「計画の矛盾」として報告すること**（`docs/lessons-for-planning.md` 大原則）。

## Global Constraints

- **計画のコードは検証済みの正ではない**。レビューを通す前提の下書きとして扱い、実物と食い違ったら報告する
- 各タスクの最後に **`npm test && npx tsc -b && npm run lint` を全体で回す**（対象を絞らない）。Rust（`src-tauri`）は今回触らない
- oxlint **警告0** を保つ。コンポーネントのファイルは**部品だけを export** する（型・定数は隣のファイルへ。`Badge.tsx`/`badge-styles.ts` の分け方）
- Tailwind のクラス名は**完全な字面**で書く（`text-${色}` のような組み立ては生成 CSS に載らない）
- 色値の直書き禁止・役割トークンへの透過（`/NN`）禁止（`conventions.test.ts` が弾く）
- **`src/modules/issue-tree/derive.ts`・`src/core/canonical.ts`・`src/modules/sequence/questions.ts` に値 import を足さない**——同梱 Skill のバイト一致コピーが Node の型ストリップで直接読むため（`skill-copy.test.ts` が門番）。`import type` は可。**これらを変更したら Skill 側のコピーへ `cp` で同期する**（バイト一致テストが赤くなるので忘れない）
- 新しいトークン・新しい `text-*` 段・新しい色は**作らない**（rev 9章 規約4）
- テストの期待件数を書かない。期待値は「そのファイルの `it` がすべて緑」
- コミットは日本語の既存様式（`feat(glossary): …——理由`）に合わせる

---

### Task 1: コア `missing-tally.ts`（集計の型と文字列）

**Files:**
- Create: `src/core/missing-tally.ts`
- Test: `src/core/missing-tally.test.ts`

**Interfaces:**
- Produces: `MissingTallyPart { kind: string; label: string; count: number; variant: 'open' | 'hold' | 'pending' }`／`MissingTally { total: number; parts: MissingTallyPart[] }`／`TALLY_TOTAL_LABEL = '要対応'`／`tallyLine(t: MissingTally): string`。以後の全タスクが使う

- [ ] **Step 1: 失敗するテストを書く**

`src/core/missing-tally.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TALLY_TOTAL_LABEL, tallyLine, type MissingTally } from './missing-tally'

describe('tallyLine', () => {
  it('合計と内訳を課題ツリーの帯と同じ形で出す', () => {
    const t: MissingTally = {
      total: 3,
      parts: [
        { kind: 'a', label: '仮説なし', count: 1, variant: 'open' },
        { kind: 'b', label: '未決', count: 2, variant: 'open' },
      ],
    }
    expect(tallyLine(t)).toBe('⚠ 要対応 3（仮説なし 1 ／ 未決 2）')
  })

  it('0 件なら ⚠ も内訳も出さない', () => {
    expect(tallyLine({ total: 0, parts: [] })).toBe('要対応 0')
  })

  it('count 0 の part は出さない（parts に混ざっていても）', () => {
    const t: MissingTally = {
      total: 1,
      parts: [
        { kind: 'a', label: '未定義', count: 1, variant: 'open' },
        { kind: 'b', label: '未分類', count: 0, variant: 'open' },
      ],
    }
    expect(tallyLine(t)).toBe('⚠ 要対応 1（未定義 1）')
  })

  it('TALLY_TOTAL_LABEL は 要対応', () => {
    expect(TALLY_TOTAL_LABEL).toBe('要対応')
  })
})
```

期待する文字列は `src/modules/issue-tree/derive.test.ts:149` の現行（`'⚠ 要対応 3（仮説なし 1 ／ 未決 2）'`）と**逐語一致**であること（区切りは全角スラッシュ前後に半角スペース、括弧は全角）。

- [ ] **Step 2: 落ちることを確認** — `npx vitest run src/core/missing-tally.test.ts` → モジュールが無くて FAIL
- [ ] **Step 3: 実装**

`src/core/missing-tally.ts`:

```ts
/**
 * 欠落（未決）の集計の共通形（M22。docs/missing-semantics.md）。
 *
 * 判定と集計は各モジュールの missing.ts（課題ツリーは derive.ts）が持ち、
 * 戻り値だけをこの形に揃える。表示は components/MissingTally.tsx。
 *
 * **課題ツリーの derive.ts は同じ文字列を自前で組み立てる**（同梱 Skill の
 * バイト一致コピーが値 import を持てないため）。両者の一致は
 * derive.test.ts が機械検査する——どちらかを変えるときは必ず両方
 */
export interface MissingTallyPart {
  /** モジュール固有の鍵。MissingTally 部品の onJump に渡る */
  kind: string
  /** 画面と Skill の報告が出す語 */
  label: string
  count: number
  /** バッジの見た目。open＝破線（まだ見ていない）／hold＝実線（保留）／pending＝青（着信） */
  variant: 'open' | 'hold' | 'pending'
}

export interface MissingTally {
  total: number
  /** count 0 の part は入れないのが行儀だが、tallyLine は入っていても出さない */
  parts: MissingTallyPart[]
}

export const TALLY_TOTAL_LABEL = '要対応'

/** 集計の1行。課題ツリーの帯・Skill の報告と逐語で同じ形（derive.ts の tallyLine と一致） */
export function tallyLine(t: MissingTally): string {
  if (t.total === 0) return `${TALLY_TOTAL_LABEL} 0`
  const parts = t.parts.filter((p) => p.count > 0).map((p) => `${p.label} ${p.count}`)
  return `⚠ ${TALLY_TOTAL_LABEL} ${t.total}（${parts.join(' ／ ')}）`
}
```

- [ ] **Step 4: 緑を確認** — `npx vitest run src/core/missing-tally.test.ts` → PASS
- [ ] **Step 5: 全体検証してコミット** — `npm test && npx tsc -b && npm run lint` → `git add -A && git commit -m "feat(core): 欠落集計の共通形 missing-tally を置く——課題ツリーの tallyLine と同じ文字列"`

---

### Task 2: コア `row-ref.ts` と、シーケンス `stepName` の共有

**Files:**
- Create: `src/core/row-ref.ts`
- Test: `src/core/row-ref.test.ts`
- Modify: `src/modules/sequence/consistency.ts:18-20`（`stepName`）

**Interfaces:**
- Produces: `rowRef(index: number): string`（`'#' + (index + 1)`。No 列の値と一致）。Task 8・9 のメッセージが使う
- Consumes: なし

- [ ] **Step 1: 失敗するテストを書く**

`src/core/row-ref.test.ts`:

```ts
import { expect, it } from 'vitest'
import { rowRef } from './row-ref'

it('配列位置を 1 始まりの #N にする（No 列の値と一致）', () => {
  expect(rowRef(0)).toBe('#1')
  expect(rowRef(9)).toBe('#10')
})
```

- [ ] **Step 2: 落ちることを確認** — `npx vitest run src/core/row-ref.test.ts` → FAIL
- [ ] **Step 3: 実装**

```ts
/** 行の呼び名（UI ノート D4）。配列位置＋1 ＝ No 列の値。メッセージが行を指すときはこれを使う */
export function rowRef(index: number): string {
  return `#${index + 1}`
}
```

- [ ] **Step 4: シーケンスの `stepName` を `rowRef` 経由にする**

`src/modules/sequence/consistency.ts` の `stepName` を書き換える（**メッセージの文字列は変わらない**——`#3（ラベル）` のまま）:

```ts
import { rowRef } from '@/core/row-ref'
// …
function stepName(step: SequenceStep, index: number): string {
  return step.label === '' ? rowRef(index) : `${rowRef(index)}（${step.label}）`
}
```

`src/modules/sequence/consistency.test.ts` が緑のままであること（文字列不変の確認になる）。**`questions.ts` には触らない**（Skill コピーの制約）。

- [ ] **Step 5: 全体検証してコミット** — `npm test && npx tsc -b && npm run lint` → `git commit -m "feat(core): 行の呼び名 rowRef を1箇所に——#N は配列位置+1（No 列と一致）"`

---

### Task 3: 共通部品 `MissingTally`

**Files:**
- Create: `src/components/MissingTally.tsx`
- Test: `src/components/MissingTally.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `MissingTally` 型・`TALLY_TOTAL_LABEL`、既存の `badgeClass`（`src/components/badge-styles.ts`）
- Produces: `<MissingTally tally={MissingTally} onJump?={(kind: string) => void} className?={string} />`。Task 4・7・9・10・13 が使う

- [ ] **Step 1: 失敗するテストを書く**

`src/components/MissingTally.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MissingTally as Tally } from '@/core/missing-tally'
import { MissingTally } from './MissingTally'

afterEach(cleanup)

const TALLY: Tally = {
  total: 3,
  parts: [
    { kind: 'definition', label: '未定義', count: 2, variant: 'open' },
    { kind: 'kind', label: '未分類', count: 1, variant: 'open' },
  ],
}

describe('MissingTally', () => {
  it('合計と内訳を出す', () => {
    render(<MissingTally tally={TALLY} />)
    expect(screen.getByText('⚠ 要対応 3')).toBeDefined()
    expect(screen.getByText('未定義 2')).toBeDefined()
    expect(screen.getByText('未分類 1')).toBeDefined()
  })

  it('0 件なら ⚠ 無しの合計だけ', () => {
    render(<MissingTally tally={{ total: 0, parts: [] }} />)
    expect(screen.getByText('要対応 0')).toBeDefined()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('onJump があれば内訳は押せるチップで、kind を渡す', async () => {
    const onJump = vi.fn()
    render(<MissingTally tally={TALLY} onJump={onJump} />)
    await userEvent.click(screen.getByRole('button', { name: '次の未定義へ' }))
    expect(onJump).toHaveBeenCalledWith('definition')
  })

  it('onJump が無ければ button を作らない', () => {
    render(<MissingTally tally={TALLY} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('count 0 の part はチップを描かない', () => {
    const t: Tally = { total: 1, parts: [...TALLY.parts.map((p) => ({ ...p })), { kind: 'x', label: '保留', count: 0, variant: 'hold' as const }] }
    render(<MissingTally tally={t} onJump={() => {}} />)
    expect(screen.queryByRole('button', { name: '次の保留へ' })).toBeNull()
  })
})
```

- [ ] **Step 2: 落ちることを確認** — `npx vitest run src/components/MissingTally.dom.test.tsx` → FAIL
- [ ] **Step 3: 実装**

`src/components/MissingTally.tsx`（**部品だけを export**。型はコアから取るので隣ファイルは不要）:

```tsx
import type { MissingTally as Tally } from '@/core/missing-tally'
import { TALLY_TOTAL_LABEL } from '@/core/missing-tally'
import { badgeClass } from './badge-styles'

/**
 * 欠落の集計の帯（M22。docs/missing-semantics.md 規約4）。
 * 課題ツリーの「⚠ 要対応 N ＋内訳チップ」を部品化したもの。
 * 部品はモジュールの語彙を知らない——語（label）と鍵（kind）は tally が運ぶ。
 *
 * キャンバスの帯（pointer-events-none）に置かれる前提で、チップだけ
 * pointer-events-auto に戻す（IssueTreeEditor の CHIP_BASE と同じ理由）。
 * 0 件の内訳はチップを描かない——押しても行き先が無いボタンを置かない
 */
export function MissingTally(props: {
  tally: Tally
  /** あれば内訳が押せるチップになる。引数は part.kind */
  onJump?: (kind: string) => void
  className?: string
}) {
  const { tally, onJump } = props
  return (
    <div
      className={`pointer-events-none flex items-center gap-2 whitespace-nowrap text-sm text-ink-muted${
        props.className === undefined ? '' : ` ${props.className}`
      }`}
    >
      <span>
        {tally.total === 0 ? `${TALLY_TOTAL_LABEL} 0` : `⚠ ${TALLY_TOTAL_LABEL} ${tally.total}`}
      </span>
      {tally.parts.map((p) =>
        p.count === 0 ? null : onJump === undefined ? (
          <span key={p.kind} className={badgeClass(p.variant)}>{`${p.label} ${p.count}`}</span>
        ) : (
          <button
            key={p.kind}
            type="button"
            className={`pointer-events-auto transition-colors ${badgeClass(p.variant)}`}
            aria-label={`次の${p.label}へ`}
            onClick={() => onJump(p.kind)}
          >
            {`${p.label} ${p.count}`}
          </button>
        ),
      )}
    </div>
  )
}
```

- [ ] **Step 4: 緑を確認** — `npx vitest run src/components/MissingTally.dom.test.tsx` → PASS
- [ ] **Step 5: 全体検証してコミット** — `git commit -m "feat(components): 欠落集計の帯 MissingTally——課題ツリーの合計＋チップを部品化"`

---

### Task 4: 課題ツリーの帯を部品に置き換える（見え方・Skill 出力は不変）

**Files:**
- Modify: `src/modules/issue-tree/derive.ts`（`toMissingTally` を追加。**値 import 禁止**）
- Modify: `src/modules/issue-tree/IssueTreeEditor.tsx:903-925`（帯の合計＋チップを `MissingTally` に）
- Modify: `.claude/skills/issue-tree-register/scripts/derive.ts`（`cp` でバイト一致同期）
- Test: `src/modules/issue-tree/derive.test.ts`（一致テストを追加）

**Interfaces:**
- Consumes: Task 1 の `tallyLine`・`MissingTally` 型、Task 3 の部品
- Produces: `toMissingTally(t: IssueTreeTally): MissingTally`（`derive.ts`）

- [ ] **Step 1: 一致テストを書く（失敗する）**

`src/modules/issue-tree/derive.test.ts` に追加:

```ts
import { tallyLine as coreTallyLine } from '@/core/missing-tally'
// 既存 import に toMissingTally を足す

describe('toMissingTally', () => {
  // derive.ts の tallyLine は Skill のバイト一致コピーが読むため、コアの
  // tallyLine を import できない（skill-copy.test.ts）。文字列の組み立てが
  // 2本あることを、この一致テストで固定する（lessons: 複製は機械検査で固定）
  it.each([
    { hypothesis: 0, result: 0, hold: 0, judgement: 0, total: 0 },
    { hypothesis: 1, result: 2, hold: 0, judgement: 0, total: 3 },
    { hypothesis: 2, result: 1, hold: 1, judgement: 3, total: 7 },
  ])('コアの tallyLine と逐語一致する（%j）', (t) => {
    expect(coreTallyLine(toMissingTally(t))).toBe(tallyLine(t))
  })

  it('variant は open / open / hold / pending の対応（帯のチップと同じ）', () => {
    const parts = toMissingTally({ hypothesis: 1, result: 1, hold: 1, judgement: 1, total: 4 }).parts
    expect(parts.map((p) => [p.kind, p.variant])).toEqual([
      ['hypothesis', 'open'],
      ['result', 'open'],
      ['hold', 'hold'],
      ['judgement', 'pending'],
    ])
  })
})
```

- [ ] **Step 2: 落ちることを確認** — `npx vitest run src/modules/issue-tree/derive.test.ts` → FAIL（`toMissingTally` 未定義）
- [ ] **Step 3: `derive.ts` に `toMissingTally` を実装**

`tallyLine` の直後に追加（**`import type { MissingTally } from '@/core/missing-tally'` は型 import なので可**。値 import を足していないことを `skill-copy.test.ts` が検査する）:

```ts
import type { MissingTally } from '@/core/missing-tally'   // ファイル先頭の type import 群へ

/**
 * 帯（MissingTally 部品）へ渡す共通形。kind は OpenKind と同じ語で、
 * チップの onJump がそのまま goToNextOpen に渡せる。
 * variant の対応は帯の chipVariantOf（badge-variant.ts）と同じ——
 * 未決・仮説なしは破線（open）、保留は実線（hold）、未判断は着信の青（pending）
 */
export function toMissingTally(t: IssueTreeTally): MissingTally {
  return {
    total: t.total,
    parts: [
      { kind: 'hypothesis', label: QUESTION_LABELS.hypothesis, count: t.hypothesis, variant: 'open' as const },
      { kind: 'result', label: QUESTION_LABELS.result, count: t.result, variant: 'open' as const },
      { kind: 'hold', label: QUESTION_LABELS.hold, count: t.hold, variant: 'hold' as const },
      { kind: 'judgement', label: QUESTION_LABELS.judgement, count: t.judgement, variant: 'pending' as const },
    ].filter((p) => p.count > 0),
  }
}
```

- [ ] **Step 4: Skill のコピーを同期して緑を確認**

```bash
cp src/modules/issue-tree/derive.ts .claude/skills/issue-tree-register/scripts/derive.ts
npx vitest run src/modules/issue-tree
```

`derive.test.ts`（新規含む）・`skill-copy.test.ts`・`skill-write.smoke.test.ts` がすべて PASS。

- [ ] **Step 5: 帯を `MissingTally` に置き換える**

`IssueTreeEditor.tsx` の帯（`:903-925` の `<div className="pointer-events-none flex items-center gap-2 whitespace-nowrap text-sm text-ink-muted">…</div>` 一式）を:

```tsx
<MissingTally tally={toMissingTally(tally)} onJump={(kind) => goToNextOpen(kind as OpenKind)} />
```

に置き換える。`CHIP_KINDS`（`:137`）と `CHIP_BASE`（`:205`）は使われなくなったら消す。`chipVariantOf` は `badge-variant.ts` に残す（キャンバス側で使われていなければ、`toMissingTally` が対応を吸収したことをコメントで書いて消してよい——**消す場合は `badge-variant.ts` のテストも確認**）。`as OpenKind` のキャストは、`toMissingTally` の kind が `OpenKind` の4語と同じであることに依る——その旨を1行コメントで書く。

- [ ] **Step 6: 既存 DOM テストが門番として緑のままを確認**

`npx vitest run src/modules/issue-tree/IssueTreeEditor.dom.test.tsx` → PASS（`:605` 合計＋内訳チップ、`:643` 線種と色、`:664-676` チップでジャンプ。**文言・role が不変なら通る。落ちたら置き換えの方を疑う**）

- [ ] **Step 7: 全体検証してコミット** — `git commit -m "refactor(issue-tree): 帯の集計を MissingTally 部品へ——見え方と Skill 出力は不変"`

---

### Task 5: 課題ツリーの行に「未判断」バッジ

**Files:**
- Modify: `src/modules/issue-tree/layout.ts`（`HypothesisPlacement` に `judgementBadge: Rect | null`、行の計画で幅を確保）
- Modify: `src/modules/issue-tree/HypothesisRow.tsx`（2つ目のバッジを描く）
- Test: `src/modules/issue-tree/layout.test.ts`・`src/modules/issue-tree/IssueTreeEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `posed.hypothesisQuestions[hi].judgement`（`layoutIssueTree` は既に `posed` を受けている）、`QUESTION_LABELS.judgement`、`Badge`（variant `pending`）
- Produces: `HypothesisPlacement.judgementBadge: Rect | null`

- [ ] **Step 1: レイアウトのテストを書く（失敗する）**

`layout.test.ts` に追加。既存のフィクスチャの流儀（`fonts` の偽測定器）に合わせ、`pendingNotes` を持つ仮説と持たない仮説で:

```ts
it('未判断の仮説行は、判断バッジの左に未判断バッジの幅を確保する', () => {
  // pendingNotes が空でない仮説 → judgementBadge が Rect で返り、
  // text.width が judgementBadge.width + BADGE_GAP ぶん狭い
  // pendingNotes が空 → judgementBadge は null で、text.width は従来どおり
})
```

（具体の組み立ては既存の `layout.test.ts:89-106`「バッジの幅の確保」のフィクスチャを写す。**2つの実装が同じ答えを返す入力を選ばない**——未判断あり／なしの両方を同じテストで見る）

- [ ] **Step 2: 落ちることを確認** — `npx vitest run src/modules/issue-tree/layout.test.ts` → FAIL
- [ ] **Step 3: `layout.ts` を実装**

行の計画（`plans` の map。閉じた行と展開行の**頭部は同じ組み立て**を通る——実物を読んで確認し、違ったら計画の矛盾として報告）で:

```ts
const q = posed.hypothesisQuestions[hi]
const judgeW = q !== undefined && q.judgement ? badgeWidth(QUESTION_LABELS.judgement, fonts.small) : 0
const badgesW = badgeW === 0 ? badgeW0 : badgeW0 + BADGE_GAP + judgeW   // badgeW0 = 既存の判断バッジ幅
const textW = BOX_CONTENT_WIDTH - ROW_INDENT - BADGE_GAP - badgesW
// build で:
//   badge:          x + BOX_CONTENT_WIDTH - badgeW0（従来どおり右端）
//   judgementBadge: judgeW === 0 ? null : { x: x + BOX_CONTENT_WIDTH - badgeW0 - BADGE_GAP - judgeW, y: 判断バッジと同じ, width: judgeW, height: BADGE_HEIGHT }
```

`HypothesisPlacement` に `/** 未判断（pendingNotes あり）のバッジ。立っていなければ null */ judgementBadge: Rect | null` を足す。**抑制された仮説は `derive.ts` が `judgement` を立てないので、ここで `suppressed` を見る必要は無い。**

- [ ] **Step 4: `HypothesisRow.tsx` で描く**

既存のバッジ描画（`inRow(placement.badge)` の `<span>`）の隣に:

```tsx
{placement.judgementBadge !== null && (
  <span className="absolute flex items-center justify-end" style={inRow(placement.judgementBadge)}>
    <Badge variant="pending">{QUESTION_LABELS.judgement}</Badge>
  </span>
)}
```

展開頭部（`inBox(placement.badge)` 側）にも同じ形で足す（頭部の組み立てが共有ならレイアウトは1箇所で済んでいるはず）。

- [ ] **Step 5: DOM テストを書いて赤→緑**

`IssueTreeEditor.dom.test.tsx` に「`pendingNotes` を持つ仮説の行に『未判断』バッジが出る／持たない行には出ない」を追加。**一時的に実装の `judgementBadge !== null` を `false &&` に壊して赤くなることを確認してから戻す。**

- [ ] **Step 6: 全体検証してコミット** — `git commit -m "feat(issue-tree): 未判断の行バッジ——ヘッダの集計と行の表示を一対一に"`

---

### Task 6: 用語集 `missing.ts` と捏造文字列の除去

**Files:**
- Create: `src/modules/glossary/missing.ts`
- Test: `src/modules/glossary/missing.test.ts`
- Modify: `src/modules/glossary/GlossaryEditor.tsx:329,371`（判定を `missing.ts` へ）・`:379`（`placeholder="未定義"` を消す）
- Modify: `src/modules/glossary/AliasCell.tsx:223`（「別名なし」を消す）

**Interfaces:**
- Consumes: Task 1 の `MissingTally` 型
- Produces: `isMissingCell(term: Term, field: GlossaryField): boolean`／`tallyMissing(terms: readonly Term[]): MissingTally`（parts の kind は `'definition'`＝未定義・`'kind'`＝未分類）。Task 7 が使う

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/glossary/missing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Term } from '@/types/glossary'
import { isMissingCell, tallyMissing } from './missing'

function term(patch: Partial<Term>): Term {
  return { id: 'term_0000000000', name: '受注', kind: 'actor', definition: '説明', aliases: [], notes: '', ...patch }
}

describe('isMissingCell', () => {
  it('定義が空は欠落、埋まっていれば欠落でない', () => {
    expect(isMissingCell(term({ definition: '' }), 'definition')).toBe(true)
    expect(isMissingCell(term({}), 'definition')).toBe(false)
  })
  it('kind の undecided は欠落、other は確定なので欠落でない', () => {
    expect(isMissingCell(term({ kind: 'undecided' }), 'kind')).toBe(true)
    expect(isMissingCell(term({ kind: 'other' }), 'kind')).toBe(false)
  })
  it('別名と備考の空は欠落でない（reading-guide: 検知対象外）', () => {
    expect(isMissingCell(term({ aliases: [] }), 'aliases')).toBe(false)
    expect(isMissingCell(term({ notes: '' }), 'notes')).toBe(false)
  })
})

describe('tallyMissing', () => {
  it('未定義と未分類を別の part で数える', () => {
    const t = tallyMissing([term({ definition: '' }), term({ kind: 'undecided', definition: '' }), term({})])
    expect(t.total).toBe(3)
    expect(t.parts).toEqual([
      { kind: 'definition', label: '未定義', count: 2, variant: 'open' },
      { kind: 'kind', label: '未分類', count: 1, variant: 'open' },
    ])
  })
  it('0 件の part は入れない', () => {
    expect(tallyMissing([term({})]).parts).toEqual([])
  })
})
```

- [ ] **Step 2: 落ちることを確認** — `npx vitest run src/modules/glossary/missing.test.ts` → FAIL
- [ ] **Step 3: 実装**

`src/modules/glossary/missing.ts`:

```ts
import type { MissingTally } from '@/core/missing-tally'
import type { Term } from '@/types/glossary'
import type { GlossaryField } from './fields'

/**
 * 用語集の欠落判定（M22。docs/missing-semantics.md 決定1）。
 * 判定源は src/core/reading-guide.md の「未決」と一対一——
 * definition の空＝未定義、kind の undecided＝未分類。
 * 別名・備考の空は欠落ではない（session-notes: 検知対象外）。
 * セルの面（GlossaryEditor の cellClass の warn）と帯の集計が同じ関数を読む
 */
export function isMissingCell(term: Term, field: GlossaryField): boolean {
  if (field === 'definition') return term.definition === ''
  if (field === 'kind') return term.kind === 'undecided'
  return false
}

export function tallyMissing(terms: readonly Term[]): MissingTally {
  let definition = 0
  let kind = 0
  for (const t of terms) {
    if (isMissingCell(t, 'definition')) definition += 1
    if (isMissingCell(t, 'kind')) kind += 1
  }
  const parts = [
    { kind: 'definition', label: '未定義', count: definition, variant: 'open' as const },
    { kind: 'kind', label: '未分類', count: kind, variant: 'open' as const },
  ].filter((p) => p.count > 0)
  return { total: definition + kind, parts }
}
```

- [ ] **Step 4: エディタの判定を差し替え、捏造文字列を消す**

- `GlossaryEditor.tsx:329` の `term.kind === 'undecided'` → `isMissingCell(term, 'kind')`、`:371` の `term.definition === ''` → `isMissingCell(term, 'definition')`
- `:379` の `placeholder="未定義"` と、その上の「空欄は『未定義』と明示する…」コメントを消す（クラスの `placeholder:text-ink-muted` も placeholder が無くなるので消す）。**代わりのコメント**: 「空は空のまま。欠落は cellClass の面（missing-face）が示す（D1。placeholder に欠落の語を使わない——IssueBox と同じ判断）」
- `AliasCell.tsx:223` の `{aliases.length === 0 ? <span className="text-ink-muted">別名なし</span> : …}` → 三項演算子を外し `aliases.map(…)` だけにする（0件なら何も描かない。ボタン自体は `px-2 py-1` で高さを保つ——**行の高さが潰れないか実装時に確認し、潰れるなら `min-h` で1行ぶんを確保**）

- [ ] **Step 5: 既存テストの確認** — `npx vitest run src/modules/glossary` → 「別名なし」を見るテストは無い（調査済み）。`GlossaryEditor.dom.test.tsx` が placeholder に依存していないことを確認。落ちたら期待値の側を D1 に合わせて直す
- [ ] **Step 6: 全体検証してコミット** — `git commit -m "feat(glossary): 欠落判定を missing.ts へ——「未定義」「別名なし」の捏造文字列を消す（D1）"`

---

### Task 7: 用語集の No 列と帯の集計

**Files:**
- Modify: `src/modules/glossary/columns.ts`（`'no'` 列を先頭に）
- Modify: `src/modules/glossary/GlossaryEditor.tsx`（No セル・rowAnchor 移動・ツールバーに `MissingTally`・ジャンプ）
- Modify: `src/modules/glossary/column-widths.ts`（幅配列の初期値。実物を見て要否を判断）
- Test: `src/modules/glossary/GlossaryEditor.dom.test.tsx`

**Interfaces:**
- Consumes: Task 3 の `MissingTally` 部品、Task 6 の `isMissingCell`/`tallyMissing`、既存 `cellFace(marks, index, 'no', false, true)`（エラーカタログ `ErrorCatalogEditor.tsx:416-422` と同じ形）
- Produces: `GlossaryColumn = 'no' | GlossaryField`（`columns.ts`）

- [ ] **Step 1: DOM テストを書く（失敗する）**

`GlossaryEditor.dom.test.tsx` に追加:

```ts
it('No 列がデータ配列の位置を出し、行全体の指摘は No セルに出る', () => {
  // 2行のデータで描画し、テーブルの1列目のヘッダが「No」、
  // 1行目の先頭セルの textContent が「1」であること。
  // issues に field:'id'（行全体）の指摘を渡し、No セルが bg-invalid-face を
  // 持ち、名称セルは持たないこと（rowAnchor の移動）
})
```

（クラス名を見る検査はこの1点だけに絞る——`cell-face.ts` の既存テストが判定を持ち、ここは「どのセルに出るか」だけを固定する）

- [ ] **Step 2: 落ちることを確認** — FAIL
- [ ] **Step 3: `columns.ts` に No 列を足す**

エラーカタログ `columns.ts` の形を写す:

```ts
export type GlossaryColumn = 'no' | GlossaryField
export const NO_COLUMN_LABEL = 'No'
export const COLUMNS: readonly ColumnSpec<GlossaryColumn>[] = [
  { field: 'no', defaultWidth: 56 },   // 導出列（データ配列の index + 1）。編集対象ではない
  { field: 'name', defaultWidth: 176 },
  // …既存4列はそのまま
]
```

**`glossaryColumnWidths`（`column-widths.ts`）の初期値と保存済み幅の整合を確認する**——幅配列の要素数が1つ増える。store が「保存値の長さが初期値と違えば初期値に戻す」形でなければ、その形にする（エラーカタログがプロファイル切替で同じ問題をどう解いているかを読んで写す）。確認した根拠（実物の該当行）を報告に書く。

- [ ] **Step 4: エディタに No セルを足し、rowAnchor を移す**

- `<colgroup>`・`<thead>` は `COLUMNS` を回しているので、`'no'` の見出しは `FIELD_LABELS[col.field]` が引けない——エラーカタログと同じく `col.field === 'no' ? NO_COLUMN_LABEL : FIELD_LABELS[col.field]` の形にし、No 列にはリサイズハンドルを出さない（`ErrorCatalogEditor.tsx:390` の形を写す）
- `<tbody>` の行頭に追加（エラーカタログ `:416-422` の写し）:

```tsx
<td className={`px-2 py-1 text-right text-ink-muted ${CELL_FACE_CLASS[cellFace(marks, index, 'no', false, true)]}`}>
  {index + 1}
</td>
```

- `cellClass`（`:200`）の rowAnchor 引数 `field === COLUMNS[0].field` を削り、常に `false` にする（行全体の指摘は No セルへ移った）。既存の各セルには `colBorder` の付け方を含めて列が1本増えるので、**1列目だった名称セルに `colBorder` を足す**
- 表示中の行番号 `const row = visiblePos + 1` を aria-label に使っている既存構造は**変えない**（aria の行番号は表示位置、No はデータ位置。役割が違うことをコメントで書く）

- [ ] **Step 5: ツールバーに `MissingTally` とジャンプを足す**

`{visible.length} / {data.terms.length} 件` の `<span>` の直後に:

```tsx
<MissingTally tally={tallyMissing(data.terms)} onJump={jumpToMissing} />
```

ジャンプはチップの `kind`（`'definition' | 'kind'`）ごとに**表示中の行の中で**巡る:

```tsx
const jumpAt = useRef<Record<string, number>>({})
const jumpToMissing = (kind: string): void => {
  const field: GlossaryField = kind === 'kind' ? 'kind' : 'definition'
  const targets = visible.filter((i) => isMissingCell(data.terms[i], field))
  if (targets.length === 0) return
  const next = ((jumpAt.current[kind] ?? -1) + 1) % targets.length
  jumpAt.current[kind] = next
  rows.focusCell(rowKeys[targets[next]], field)
}
```

（集計は**全行**、ジャンプは**表示中**——ずれうることをコメントで書く。課題ツリーの `nextOpenTarget` はフォーカス位置起点だが、テーブル側はフォーカス追跡を持たないので巡回 ref で始める。物足りなければ open-issues 行き）

- [ ] **Step 6: 赤→緑を確認し、既存テストを直す** — `npx vitest run src/modules/glossary src/App.dom.test.tsx`。列が増えたことで落ちる既存テストが無いか全体で確認
- [ ] **Step 7: 全体検証してコミット** — `git commit -m "feat(glossary): No 列と欠落集計の帯——行全体の指摘の錨を No セルへ（D4/D5）"`

---

### Task 8: 用語集・重複メッセージを件数＋行番号に（D4）

**Files:**
- Modify: `src/modules/glossary/consistency.ts:25,35,61,77`
- Test: `src/modules/glossary/consistency.test.ts`（メッセージの検証を追加）・`src/App.dom.test.tsx:636`（`DUP_MESSAGE`）

**Interfaces:**
- Consumes: Task 2 の `rowRef`
- Produces: 新しいメッセージ文字列（下表）。Task 14 の規約文書が例として引く

- [ ] **Step 1: メッセージのテストを書く（失敗する）**

`consistency.test.ts` は現状 rule id しか見ていない。**新しい文言を固定するテスト**を追加:

```ts
it('重複は件数と行番号で指す（D4）', () => {
  // name 重複2件（位置 0, 2）:
  //   '名称「受注」が2件重複しています（#1 ／ #3）'
  // ID 重複2件（位置 0, 1）:
  //   'ID が重複しています（2件。#1 ／ #2）: term_XXXXXXXXXX'
  // alias 重複（位置 0, 1）:
  //   '別名「じゅちゅう」が2件重複しています（#1 ／ #2）'
  // alias-name 衝突（位置 0 の別名 × 位置 2 の名称）:
  //   '#1「受注」の別名「発注」が #3「発注」の名称と衝突しています'
})
```

（`名称「X」` の X は**グループ先頭の行の表記**——正規化で同一視された行は表記が違いうる。その旨をテスト名かコメントに書く）

- [ ] **Step 2: 落ちることを確認** — FAIL
- [ ] **Step 3: `consistency.ts` を書き換える**

```ts
import { rowRef } from '@/core/row-ref'
// duplicate-id:
message: `ID が重複しています（${indices.length}件。${indices.map(rowRef).join(' ／ ')}）: ${id}`,
// duplicate-name:
message: `名称「${terms[indices[0]].name}」が${indices.length}件重複しています（${indices.map(rowRef).join(' ／ ')}）`,
// duplicate-alias（行は locations と同じ dedup 済み集合で数える。件数は出現数 group.length のまま）:
message: `別名「${owned[group[0]].alias}」が${group.length}件重複しています（${locations.map((l) => rowRef(l.entityIndex)).join(' ／ ')}）`,
// alias-name-collision:
message: `${rowRef(index)}「${term.name}」の別名「${alias}」が${rowRef(other)}「${terms[other].name}」の名称と衝突しています`,
```

（`duplicate-alias` は locations を組み立てた**後**に message を作る順序に直す）

- [ ] **Step 4: `App.dom.test.tsx:636` の `DUP_MESSAGE` を新文言に更新** — フィクスチャの行位置を実物で確認して `'名称「受注」が2件重複しています（#1 ／ #2）'` の形に
- [ ] **Step 5: 赤→緑** — `npx vitest run src/modules/glossary src/App.dom.test.tsx` → PASS
- [ ] **Step 6: 全体検証してコミット** — `git commit -m "feat(glossary): 重複警告を件数＋行番号に——「…と…と…」をやめる（D4）"`

---

### Task 9: エラーカタログ——`missing.ts` 改名・placeholder 除去・帯・D4

**Files:**
- Rename: `src/modules/error-catalog/warnings.ts` → `src/modules/error-catalog/missing.ts`（`isWarnCell` → `isMissingCell`、`tallyMissing` 追加）
- Rename: `src/modules/error-catalog/warnings.test.ts` → `missing.test.ts`（あれば。無ければ新規）
- Modify: `src/modules/error-catalog/ErrorCatalogEditor.tsx`（import・`:298` placeholder・ツールバーに `MissingTally`・ジャンプ）
- Modify: `src/modules/error-catalog/consistency.ts:50,65`（D4 メッセージ）
- Test: `src/modules/error-catalog/consistency.test.ts`・`missing.test.ts`

**Interfaces:**
- Consumes: Task 1〜3・Task 2 の `rowRef`
- Produces: `isMissingCell(entry, field)`／`tallyMissing(errors): MissingTally`（parts: `{ kind: 'undecided', label: '未分類' }`・`{ kind: 'blank', label: '未記入' }`）

- [ ] **Step 1: `tallyMissing` のテストを書く（失敗する）**

`missing.test.ts`（改名後）に追加。**「主体でない対応欄の空は数えない」を、数える入力とは別の入力で見る**:

```ts
it('未分類と未記入を別の part で数える', () => {
  // resolutionLevel: 'undecided'・全文空 → undecided 1 ＋ blank（occurrence/causeForSupport/causeForSpec の3）
  // resolutionLevel: 'user' で userAction 空 → blank に数える
  // resolutionLevel: 'engineer' で userAction 空・engineerAction 埋め → userAction は数えない
})
it('未記入はセル単位で数える（1行に複数ありうる）', () => { /* … */ })
```

- [ ] **Step 2: 落ちることを確認** — FAIL
- [ ] **Step 3: 改名と実装**

```bash
git mv src/modules/error-catalog/warnings.ts src/modules/error-catalog/missing.ts
```

`isWarnCell` を `isMissingCell` に改名（**中身の判定は変えない**）。ヘッダコメントに「M22 で warnings.ts から改名。判定源は reading-guide と一対一（docs/missing-semantics.md）」を追記。`tallyMissing` を追加:

```ts
import type { MissingTally } from '@/core/missing-tally'
import type { ErrorField } from './fields'

const TALLIED_FIELDS: readonly ErrorField[] = [
  'occurrence', 'causeForSupport', 'causeForSpec', 'userAction', 'supportAction', 'engineerAction',
]

export function tallyMissing(errors: readonly ErrorEntry[]): MissingTally {
  let undecided = 0
  let blank = 0
  for (const entry of errors) {
    if (isMissingCell(entry, 'resolutionLevel')) undecided += 1
    for (const field of TALLIED_FIELDS) if (isMissingCell(entry, field)) blank += 1
  }
  const parts = [
    { kind: 'undecided', label: '未分類', count: undecided, variant: 'open' as const },
    { kind: 'blank', label: '未記入', count: blank, variant: 'open' as const },
  ].filter((p) => p.count > 0)
  return { total: undecided + blank, parts }
}
```

参照元（`ErrorCatalogEditor.tsx` の import、`warnings` を名指しするテスト・コメント）を `grep -rn "warnings\|isWarnCell" src/` で全部拾って直す。

- [ ] **Step 4: placeholder を消し、帯とジャンプを足す**

- `:298` の `placeholder={field === 'notes' ? undefined : '未定義'}` とコメントを消す（`placeholder:text-ink-muted` も）。代わりのコメントは Task 6 Step 4 と同文
- ツールバー（検索欄と「表示」の間か、絞り込み群の後ろ——実物の flex 構造を見て `MissingTally` を1つ置く）: `<MissingTally tally={tallyMissing(data.errors)} onJump={jumpToMissing} />`
- ジャンプは Task 7 Step 5 と同じ巡回 ref 形。`'undecided'` → `resolutionLevel` セルへ、`'blank'` → その行の**最初の**未記入セルへ（`TALLIED_FIELDS` 順で `isMissingCell` が真の field）。表示中の行（`visible`）の中で巡る

- [ ] **Step 5: D4 メッセージ**

`consistency.ts`:

```ts
import { rowRef } from '@/core/row-ref'
// duplicate-id: 用語集 Task 8 と同じ形
// duplicate-name:
message: `エラー名「${errors[indices[0]].name}」が${indices.length}件重複しています（${indices.map(rowRef).join(' ／ ')}）`,
// resolution-action-missing:
message: `${rowRef(index)}「${entry.name}」は${resolutionLabel(entry.resolutionLevel)}としていますが、${FIELD_LABELS[field]}が空です`,
```

`consistency.test.ts` に新文言の検証を追加（Task 8 Step 1 と同じ形）。

- [ ] **Step 6: 赤→緑 → 全体検証してコミット** — `git commit -m "feat(error-catalog): warnings を missing に改名し、集計の帯と行番号のメッセージ（D4）"`

---

### Task 10: ロジックツリー——空ノードの欠落表現と帯

**Files:**
- Create: `src/modules/logic-tree/missing.ts`
- Modify: `src/modules/logic-tree/NodeBox.tsx`（`missing` prop と破線＋淡い面）
- Modify: `src/modules/logic-tree/LogicTreeEditor.tsx`（`missing` の受け渡し・帯に `MissingTally`・ジャンプ）
- Test: `src/modules/logic-tree/missing.test.ts`・`src/modules/logic-tree/LogicTreeEditor.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1・3
- Produces: `isMissingNode(node: { text: string }): boolean`／`tallyMissing(nodes): MissingTally`（part: `{ kind: 'text', label: '未記入' }`）

- [ ] **Step 1: テストを書く（失敗する）**

`missing.test.ts`: 空テキスト＝欠落・非空＝欠落でない・`tallyMissing` の件数と part。
`LogicTreeEditor.dom.test.tsx` に追加:

```ts
it('空ノードは破線＋淡い面（missing-face）、invalid が立てば赤が勝つ', () => {
  // text:'' のノード → bg-missing-face と border-dashed を含む
  // text:'' かつ issues の対象 → bg-invalid-face を含み bg-missing-face を含まない
  // text あり・指摘なし → どちらの面も無い
})
```

（既存の「指摘の対象になったノードに `bg-invalid-face`」テストの隣に置く。**このテストが open-issues の「invalid の見せ方に DOM テストが無い」の一部を埋める**）

- [ ] **Step 2: 落ちることを確認** — FAIL
- [ ] **Step 3: 実装**

`missing.ts`:

```ts
import type { MissingTally } from '@/core/missing-tally'

/** ロジックツリーの欠落＝ text が空のノード（reading-guide:「未記入」） */
export function isMissingNode(node: { text: string }): boolean {
  return node.text === ''
}

export function tallyMissing(nodes: readonly { text: string }[]): MissingTally {
  const count = nodes.filter(isMissingNode).length
  return {
    total: count,
    parts: count === 0 ? [] : [{ kind: 'text', label: '未記入', count, variant: 'open' }],
  }
}
```

`NodeBox.tsx`: props に `/** 欠落（text が空）。invalid が勝つ */ missing: boolean` を追加し:

```ts
const face = props.invalid
  ? 'border-invalid bg-invalid-face'
  : props.missing
    ? 'border-dashed border-missing bg-missing-face'
    : 'border-rule bg-surface'
```

`LogicTreeEditor.tsx` の `<NodeBox …>` に `missing={isMissingNode(node)}` を渡す。

- [ ] **Step 4: 帯に `MissingTally` とジャンプ**

帯の `m-2 flex` の中、「ノードを追加」と `KeyHints` の間に:

```tsx
<MissingTally tally={tallyMissing(data.nodes)} onJump={jumpToMissing} />
```

ジャンプは巡回 ref（Task 7 Step 5 の形）で `isMissingNode` の次のノードへ `setPendingFocus(nodeKeys[i])`。

- [ ] **Step 5: 赤→緑 → 全体検証してコミット** — `git commit -m "feat(logic-tree): 空ノードに欠落の破線＋淡い面と帯の集計——「空＝無害」に見える穴を塞ぐ（D1）"`

---

### Task 11: シーケンス——「考慮不要」を語で示す

**Files:**
- Modify: `src/modules/sequence/output-labels.ts:14`（`NOT_APPLICABLE_LABEL = '考慮不要'`）
- Modify: `src/modules/sequence/GutterSlot.tsx`（`─` の span → 語。`pl-6` の調整）
- Modify: `src/modules/sequence/SequenceEditor.tsx`（ghosts の `'─ 考慮不要'` 直書き → `NOT_APPLICABLE_LABEL`）
- Modify: `src/modules/sequence/GhostSlot.tsx`（doc コメントの `'─ 考慮不要'`）
- Test: `src/modules/sequence/markdown.test.ts`・`mermaid.test.ts`・`GutterSlot` 系 DOM テスト

**Interfaces:**
- Consumes: なし
- Produces: `NOT_APPLICABLE_LABEL = '考慮不要'`（画面・Markdown・Skill 報告が同語）

- [ ] **Step 1: 出力テストの期待値を先に書き換える（赤くする）**

`markdown.test.ts` の `─ 考慮不要` を `考慮不要`（text ありは `考慮不要（理由）`）に更新して実行 → FAIL（実装が旧文字列を出す）。`mermaid.test.ts` に `─ 考慮不要` があれば同様（無ければ触らない——調査時点では未確認。**grep して確かめ、結果を報告に書く**: `grep -rn "─" src/modules/sequence/`）

- [ ] **Step 2: `output-labels.ts` を変える**

```ts
/** notApplicable（人が「考えなくてよい」と決めた）。画面の GutterSlot も同じ語を出す（M22。─ の記号は初見に意図が伝わらないためやめた） */
export const NOT_APPLICABLE_LABEL = '考慮不要'
```

`markdown.ts:44-52` のコメント（「`─` だけにすると…接頭が同じになり」）は前提が変わるので、「空セル＝問われていない／`考慮不要`＝人が決めた、の境は語そのものが分ける」に書き直す。

- [ ] **Step 3: `GutterSlot.tsx` の記号を語に**

```tsx
{props.state === 'notApplicable' && (
  <span aria-hidden="true" className="pointer-events-none absolute left-2 top-1 text-sm">
    考慮不要
  </span>
)}
```

`pl-6`（記号1文字ぶん）を語4文字ぶんに広げる（`pl-6` → 実測で決める。`text-sm` 4文字＋余白で概ね `pl-16`。**任意値 `pl-[…]` を使う場合、conventions.test.ts が弾くのは `text-[...]` だけであることは確認済み**）。ヘッダコメント（`:31`「─ 考慮不要」の接頭）も直す。**測定層との整合**: 答えの折り返し幅（`ANSWER_WRAP`）が接頭ぶんを引いているかを `SequenceEditor.tsx:365-372` 付近と `layout.ts` で確認する——旧実装（`─`＋`pl-6`）でも同じ構造だったので、引いていなければ従来同等でよいが、**語が長くなったぶん1行の実効幅が狭くなり折り返し位置がずれる**なら `ANSWER_WRAP` 側の調整も含めて報告する

- [ ] **Step 4: `SequenceEditor.tsx` の ghosts の直書きを差し替え**

`text = … ? '─ 考慮不要' : …` → `NOT_APPLICABLE_LABEL` を import して使う。`GhostSlot.tsx` の doc コメントも同語に。

- [ ] **Step 5: 赤→緑** — `npx vitest run src/modules/sequence` → PASS
- [ ] **Step 6: 全体検証してコミット** — `git commit -m "feat(sequence): 考慮不要を語で示す——─ の記号は初見に意図が伝わらない（画面と出力を同語に）"`

---

### Task 12: シーケンス——欠落の面と捏造文字列の除去

**Files:**
- Create: `src/modules/sequence/missing.ts`
- Modify: `src/modules/sequence/ActorRefCell.tsx`（`missing` 面・`（未定義）` 本文の除去）
- Modify: `src/modules/sequence/SequenceEditor.tsx`（参加者ヘッダ・ラベルセルの欠落面、GutterSlot の placeholder 除去、高さ予約）
- Modify: `src/modules/sequence/GutterSlot.tsx:69`（placeholder 除去）
- Test: `src/modules/sequence/missing.test.ts`・`ActorRefCell.dom.test.tsx`・`SequenceEditor.dom.test.tsx`

**Interfaces:**
- Consumes: Task 1 の `MissingTally` 型、既存 `poseQuestions`/`readSlot`（`questions.ts`。**変更禁止**）
- Produces: `tallySequenceMissing(data): { missing: MissingTally; handled: number; notApplicable: number }`（parts: `{ kind: 'unanswered', label: '未回答' }`・`{ kind: 'blank', label: '未記入' }`）。Task 13 が使う

- [ ] **Step 1: `missing.ts` のテストを書く（失敗する）**

`missing.test.ts`:

```ts
it('未回答（立っている問いに decision が無い）と未記入（参加者名・ステップラベルの空）を分けて数える', () => {
  // call/awaitsReply:true で failures 空 → 未回答 3
  // handled/notApplicable は数えず handled/notApplicable カウンタへ
  // actors: [{name:''}] → 未記入 1、steps: [{label:''}] → 未記入 +1
})
it('問いが立っていないスロットは数えない（reply は問い無し）', () => { /* … */ })
```

- [ ] **Step 2: 落ちることを確認** — FAIL
- [ ] **Step 3: 実装**

`src/modules/sequence/missing.ts`:

```ts
import type { MissingTally } from '@/core/missing-tally'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { poseQuestions, readSlot, type AnswerPath } from './questions'

const PATHS: readonly AnswerPath[] = ['failed', 'unknown', 'ifExecuted']

/**
 * シーケンスの欠落（M22。docs/missing-semantics.md 決定1）。
 * 未回答＝立っている問いに decision が無い（reading-guide:「未回答」）。
 * 未記入＝参加者の name／ステップの label が空（出力が（未定義）と書く2箇所。
 * reading-guide には M22 で追記した）。
 * handled / notApplicable は欠落ではないが総量の把握に要るので添えて返す
 */
export function tallySequenceMissing(data: SequenceSchemaVersion1): {
  missing: MissingTally
  handled: number
  notApplicable: number
} {
  let unanswered = 0
  let handled = 0
  let notApplicable = 0
  for (const step of data.steps) {
    const posed = poseQuestions(step)
    for (const path of PATHS) {
      if (!posed[path]) continue
      const decision = readSlot(step, path).decision
      if (decision === 'handled') handled += 1
      else if (decision === 'notApplicable') notApplicable += 1
      else unanswered += 1
    }
  }
  const blank =
    data.actors.filter((a) => a.name === '').length +
    data.steps.filter((s) => s.label === '').length
  const parts = [
    { kind: 'unanswered', label: '未回答', count: unanswered, variant: 'open' as const },
    { kind: 'blank', label: '未記入', count: blank, variant: 'open' as const },
  ].filter((p) => p.count > 0)
  return { missing: { total: unanswered + blank, parts }, handled, notApplicable }
}
```

（`readSlot` の引数シグネチャは実物（`questions.ts:105`）を見て合わせる。Skill の `sequence-write.mjs:204-225` が同じ数え方をしている——**そちらは Task 13 で揃える**）

- [ ] **Step 4: 面を付け、捏造文字列を消す**

- `ActorRefCell.tsx`: props に `missing: boolean` はプロップで受けず**自前で判定**できる（`resolved !== undefined && resolved.name === ''`）。face を3段に:

```ts
const missing = resolved !== undefined && resolved.name === ''
const face = props.invalid
  ? 'border-invalid bg-invalid-face'
  : missing
    ? 'border-dashed border-missing bg-missing-face'
    : 'border-rule bg-surface'
```

トリガー本文の `resolved.name === '' ? UNDEFINED_VALUE : resolved.name` → `resolved.name`（空なら空。面が「そこに何かある」を示す）。メニュー項目の `actor.name === '' ? UNDEFINED_VALUE : actor.name` は、**空の行が押せなく見える問題**があるので、語ではなく面で示す:

```tsx
<DropdownMenuItem key={actor.id} onSelect={…}>
  {actor.name === '' ? (
    <span aria-label="名前が空の参加者" className="inline-block h-4 w-16 rounded-sm border border-dashed border-missing bg-missing-face" />
  ) : (
    actor.name
  )}
</DropdownMenuItem>
```

`（未解決）`（`UNRESOLVED_ACTOR_LABEL`）は**触らない**（無効軸の表示であり捏造ではない——スペック決定2）。doc コメント（`:37-39`「出力と同じ『（未定義）』を使う」）を新方針に書き直す
- 参加者ヘッダ（`SequenceEditor.tsx:846-849`）:

```ts
const face = invalidActors.has(index)
  ? 'border-invalid bg-invalid-face'
  : actor.name === ''
    ? 'border-dashed border-missing bg-missing-face'
    : 'border-rule bg-surface'
```

- ラベルセル（`:895` 付近の `const labelFace = 'bg-surface'`）: `step.label === ''` なら欠落面。self（`SELF_BOX_CLASS` は `border-rule` を並置）と通常（`LABEL_BOX_CLASS`）で**枠クラスの持ち方が違う**——「面と枠のクラスは片方だけ出す」の既存コメント（`:846`）に従い、欠落時は `border border-dashed border-missing bg-missing-face` を出して通常時のクラスと排他にする。実物の `LABEL_BOX_CLASS`／`SELF_BOX_CLASS`（`measure.ts` か `layout.ts`）を読んで枠の有無を確かめてから組むこと
- `GutterSlot.tsx:69` の `placeholder={props.state === 'unanswered' ? '未定義' : undefined}` を消す
- 高さの予約（`SequenceEditor.tsx:394-395` と ghosts 側 `:412`）: `wrap('answer', text === '' ? '未定義' : text, ANSWER_WRAP)` → `wrap('answer', text === '' ? 'あ' : text, ANSWER_WRAP)`。コメント: 「空スロットは全角1文字で1行ぶんの高さを測る（placeholder の語に依存させない）」

- [ ] **Step 5: DOM テストを直し、新規を足す**

- `ActorRefCell.dom.test.tsx:43-48,136-142`（`（未定義）` の本文を見る）→ 「本文は空で、トリガーが `bg-missing-face` と `border-dashed` を持つ」「メニュー項目に `名前が空の参加者` の aria-label」へ書き換え
- `SequenceEditor.dom.test.tsx` に「名前が空の参加者ヘッダに `bg-missing-face`」「ラベル空のステップのラベルセルに `bg-missing-face`」を追加。**一時的に実装を壊して赤を確認してから戻す**

- [ ] **Step 6: 全体検証してコミット** — `git commit -m "feat(sequence): 参照ボタン・参加者・ラベルの欠落を破線＋淡い面で——（未定義）の本文と placeholder を消す（D1）"`

---

### Task 13: シーケンス——帯の集計と Skill の報告

**Files:**
- Modify: `src/modules/sequence/SequenceEditor.tsx:880-885`（文字列 → `MissingTally`＋補足）・`:511-514`（tally の置き換え）
- Modify: `.claude/skills/sequence-register/scripts/sequence-write.mjs:204-241`（報告文）
- Modify: `.claude/skills/sequence-register/SKILL.md:171` 付近（報告形式の記述）
- Test: `src/modules/sequence/SequenceEditor.dom.test.tsx:381`・`src/modules/sequence/skill-write.smoke.test.ts`

**Interfaces:**
- Consumes: Task 3 の部品、Task 12 の `tallySequenceMissing`、既存 `focusCell`／`slotCells`／`focusActorAt`／`focusStepLabelAt`（`SequenceEditor.tsx:536-563`）
- Produces: 帯の新文言（`⚠ 要対応 N` ＋チップ＋ `回答済 N ／ 考慮不要 N`）。Skill の報告も同形

- [ ] **Step 1: DOM テストの期待値を先に書き換える（赤くする）**

`SequenceEditor.dom.test.tsx:381-383` の `screen.getByText(/未定義 4/)` を新形へ:

```ts
expect(screen.getByText(/要対応 4/)).toBeDefined()          // 未回答4のフィクスチャなら
expect(screen.getByRole('button', { name: '次の未回答へ' })).toBeDefined()
expect(screen.getByText(/回答済 2 ／ 考慮不要 1/)).toBeDefined()  // フィクスチャの実数に合わせる
```

実行 → FAIL。

- [ ] **Step 2: エディタの帯を置き換える**

`:511-514` の手集計を `const seq = tallySequenceMissing(data)` に置き換え（`stepViews` からの集計をやめる——**数え方が同じであることは missing.test.ts が持つ**。`stepViews` 側の `answer.state` は描画用に残る）。`:880-885` の div を:

```tsx
<div
  className="absolute flex items-center gap-2 whitespace-nowrap text-sm text-ink-muted"
  style={{ left: layout.gutterX, top: layout.headerTop, height: layout.headerHeight }}
>
  <MissingTally tally={seq.missing} onJump={jumpToMissing} />
  <span>{`回答済 ${seq.handled} ／ 考慮不要 ${seq.notApplicable}`}</span>
</div>
```

（`whitespace-nowrap` を外さない——既存コメントの理由そのまま。レイヤは pointer-events-none なのでチップの pointer-events-auto は部品が持つ）

ジャンプ:

```ts
const jumpToMissing = (kind: string): void => {
  if (kind === 'unanswered') {
    // slotCells（ガターの data-cell 鍵の一覧）から、decision の無いスロットを巡回
  } else {
    // 名前が空の参加者（focusActorAt）→ ラベルが空のステップ（focusStepLabelAt）の順で巡回
  }
}
```

巡回は Task 7 Step 5 の ref 形。`slotCells` がどの構造か（`:562` 付近）を読み、未回答だけに絞る述語を組む。

- [ ] **Step 3: Skill の報告文を揃える**

`sequence-write.mjs` の集計部（`:204-225`）に `blank`（参加者名・ステップラベルの空）を足し、出力（`:239-240`）を:

```js
const parts = [];
if (tally.unanswered > 0) parts.push(`未回答 ${tally.unanswered}`);
if (blank > 0) parts.push(`未記入 ${blank}`);
const total = tally.unanswered + blank;
console.log(`  ${total === 0 ? "要対応 0" : `⚠ 要対応 ${total}（${parts.join(" ／ ")}）`}`);
console.log(`  回答済 ${tally.handled} ／ 考慮不要 ${tally.notApplicable}`);
if (unansweredAt.length) console.log(`  未回答の内訳: ${unansweredAt.join("、")}`);
```

`SKILL.md:171` 付近の報告例も同形に書き換える。**Skill は `src/` を import できないので文字列は手書き**——次 Step のスモークテストが app 側との一致を固定する。

- [ ] **Step 4: スモークテストで逐語一致を固定**

`skill-write.smoke.test.ts` の既存の形（実プロセスで mjs を動かし stdout を見る）に、**app 側の組み立てと同じ文字列が出る**検証を足す:

```ts
import { tallyLine } from '@/core/missing-tally'
import { tallySequenceMissing } from './missing'
// FIXTURE から: expect(stdout).toContain(tallyLine(tallySequenceMissing(FIXTURE).missing))
// と、`回答済 N ／ 考慮不要 N` の行
```

**一時的に mjs 側の文言を1字変えて赤くなることを確認してから戻す。**

- [ ] **Step 5: 赤→緑 → 全体検証してコミット** — `git commit -m "feat(sequence): 帯の集計を MissingTally に——未回答・未記入を数え、Skill の報告と逐語で揃える"`

---

### Task 14: 規約文書と既存文書の更新

**Files:**
- Create: `docs/missing-semantics.md`
- Modify: `src/core/reading-guide.md`（シーケンスに2項）
- Modify: `docs/overview-rev.md` 9章（参照1文）
- Modify: `docs/README.md`（地図に1行）
- Modify: `docs/open-issues.md`

**Interfaces:** なし（文書のみ）

- [ ] **Step 1: `docs/missing-semantics.md` を書く**

設計スペック決定7の6条をそのまま本文にする（スペックの要約ではなく**規約として読める文**に起こす。各条に「どの実装がそれを守っているか」のファイル名を添える——例: 条4 に `src/core/missing-tally.ts`／`src/components/MissingTally.tsx`／各 `missing.ts`）。冒頭に位置づけ（「正」の文書。U3。課題ツリーの実装の言語化。判定源は `src/core/reading-guide.md` と一対一）と、決定1の表（モジュール別の欠落／欠落でない）を載せる。

- [ ] **Step 2: `reading-guide.md` のシーケンス節に追記**

「ツール別の読み方」のシーケンスに:

```
- 参加者の `name` が空文字、ステップの `label` が空文字は「未記入」（未決）。出力はどちらも（未定義）と書く
```

（`reading-guide.md` は Skill 同期の配布物か（`src/core/skill-sync.ts` を確認）——配布物なら同期の仕組みに従い、単なる読み込み元なら直接編集。確認結果を報告に書く）

- [ ] **Step 3: rev 9章に参照を1文**

欠落軸の項の末尾に: 「**どのデータが欠落か・ヘッダでの集計・行番号での指し方は [`docs/missing-semantics.md`](missing-semantics.md) が規約として持つ**（M22。判定源は `src/core/reading-guide.md` と一対一）。」

- [ ] **Step 4: `docs/README.md` の地図に `missing-semantics.md` の行を足す**（「正」の段。1行）
- [ ] **Step 5: `open-issues.md` を更新**

- 消す: `:113`「UI ノートの C が未着手」／`:108`「『回答済み』と『考慮不要』の区別が文言頼み」（決定6で閉じた）
- 書き換え: `:38`「invalid の DOM テストが無い」——ロジックツリーのノードと参加者ヘッダは Task 10・12 で埋まったので、残り（`HypothesisRow.tsx`/`IssueBox.tsx`）だけに絞る
- 足す: 「バナー（IssueBanner）から該当行へのジャンプが無い——メッセージは #N で指すが、押しても飛ばない。モジュールへの配線が要る `[M22]`」／「テーブルの欠落ジャンプは巡回 ref で、フォーカス位置を起点にしない（課題ツリーは起点にする）。物足りなければフォーカス追跡を足す `[M22]`」／「ドロップダウンの『名前が空の参加者』は面だけの空チップで示す——実機で押しにくければ再考 `[M22]`」

- [ ] **Step 6: 全体検証してコミット** — `git commit -m "docs(m22): 欠落の規約 missing-semantics.md——課題ツリーの実装の言語化（U3）"`

---

### Task 15: 申し送り（history）と実機確認の準備

**Files:**
- Create: `docs/history/m22-core-missing-semantics.md`

**Interfaces:** なし

- [ ] **Step 1: 申し送りを書く**

既存（`m21-core-design-tokens-v2.md`）の形式で: 冒頭に位置づけ・1文の要約・計画と設計スペックへのリンク・コミット範囲。「何を作ったか」「実装で確定した事項」（各タスクの報告から**計画と実装が食い違った点**を必ず拾う）。**実機確認は未実施と明記**し、チェックリストを**空のまま**載せる:

```
- [ ] 1. 用語集: 空の定義セルに語が無く、淡い黄の面だけが見える。別名0件の行が崩れない
- [ ] 2. 用語集: No 列が右揃えで並び、行全体の指摘（ID 重複）が No セルに赤で出る
- [ ] 3. ロジックツリー: 空ノードが破線＋淡い黄で拾える。無効の赤が勝つ
- [ ] 4. 全5モジュールの帯に「要対応 N」と内訳チップが出て、押すと次の該当へ飛ぶ
- [ ] 5. 重複メッセージが「名称「X」が N 件重複しています（#2 ／ #5）」の形で読める
- [ ] 6. シーケンス: 考慮不要スロットが「考慮不要」の語で読める。未回答スロットに語が無い
- [ ] 7. シーケンス: 名前が空の参加者ヘッダ・参照ボタンが破線＋淡い黄。メニューの空項目が押せる
- [ ] 8. 課題ツリー: pendingNotes を持つ行に青の「未判断」バッジが判断バッジと重ならず出る
- [ ] 9. ガターの未回答の面（canvas 上の missing-face）が地から分離して見える（M21 からの持ち越し確認）
```

末尾に後片付け手順（`CLAUDE.md`「マージ後の後片付け」1）を写す。**実機確認とドキュメント反映を同じタスクに束ねない**（教訓）——本タスクは記述のみで、確認は人間の別作業。

- [ ] **Step 2: 全体検証してコミット** — `npm test && npx tsc -b && npm run lint` → `git commit -m "docs(m22): 申し送り——実機確認は未実施のまま残す"`

---

## 完了条件

- 全タスクのコミットが `worktree-m22-missing-semantics` に積まれている
- `npm test && npx tsc -b && npm run lint` が緑（Rust は対象外）
- `grep -rn "別名なし" src/` が 0 件、`grep -rn 'placeholder="未定義"' src/` が 0 件、`grep -rn "placeholder={.*未定義" src/` が 0 件
- `（未定義）` が残るのは**出力系**（`output-labels.ts`・`markdown.ts`・`mermaid.ts`・各テスト）と `app-controller.ts` の契約コメントだけ（`grep -rn "（未定義）" src/ | grep -v test` で確認）
- 実機確認（人間）は未実施のまま history に明記されている
