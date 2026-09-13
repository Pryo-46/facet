import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * evals の判定器 `grade.mjs` を、合成した出力で検査する。
 *
 * evals の実走は Claude を起動するので `npm test` に載せられない。判定器が
 * 壊れていると実走しても何も測れないので、判定器だけをここで守る。
 * 見る性質は2つで、Skill どおりの出力が全項目で合格すること、
 * 狙った壊れ方をした出力が狙った項目で落ちることである
 */
const SKILL_DIR = fileURLToPath(
  new URL('../../../plugins/facet/skills/write-decision-table/', import.meta.url),
)
const GRADE = path.join(SKILL_DIR, 'evals/grade.mjs')
const WRITE = path.join(SKILL_DIR, 'scripts/decision-table-write.mjs')
const FIXTURE = path.join(SKILL_DIR, 'evals/fixtures/existing-project/送料の決定.json')

interface Expectation {
  text: string
  passed: boolean
  evidence: string
}
interface Grading {
  run_id: string
  expectations: Expectation[]
  passed: number
  total: number
}

const yesNo = ['はい', 'いいえ']
const row = (values: string[], results: string[], impossible = false) => ({ values, impossible, results })
const table = (
  title: string,
  conditions: unknown[],
  outcomes: unknown[],
  rows: ReturnType<typeof row>[],
) => ({
  schemaVersion: 1,
  type: 'decisionTable',
  title,
  conditions,
  outcomes,
  rows,
})

const FEE_CONDITIONS = [
  { id: 'cond_Mem1Ber2Aa', name: '会員か', values: yesNo },
  { id: 'cond_Amo1Unt2Bb', name: '5000円以上か', values: yesNo },
]
const FEE_OUTCOME = { id: 'out_Fee1Out2Cc', name: '送料', choices: ['無料', '500円'] }

let iter: string
let scratch: string

function runDir(evalId: number, variant: 'with_skill' | 'without_skill'): string {
  const dir = path.join(iter, `eval-${evalId}`, variant)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 下書きを書き出しスクリプトに通して、Skill と同じ経路で置く */
function writeThroughScript(dir: string, name: string, draft: unknown, base?: string): void {
  const src = path.join(scratch, `${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(src, JSON.stringify(draft), 'utf8')
  const out = path.join(dir, name)
  const args = base ? ['--in', src, '--base', base, '--out', out] : ['--in', src, '--out', out]
  execFileSync('node', [WRITE, ...args], { encoding: 'utf8' })
}

function writeRaw(dir: string, name: string, data: unknown): void {
  writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function grading(evalId: number, variant: 'with_skill' | 'without_skill'): Grading {
  return JSON.parse(
    readFileSync(path.join(iter, `eval-${evalId}`, variant, 'grading.json'), 'utf8'),
  ) as Grading
}

function failed(g: Grading): string[] {
  return g.expectations.filter((e) => !e.passed).map((e) => e.text)
}

beforeAll(() => {
  iter = mkdtempSync(path.join(tmpdir(), 'decision-table-grade-'))
  scratch = mkdtempSync(path.join(tmpdir(), 'decision-table-grade-draft-'))

  // eval 0: 会員でなく5000円未満だけが未決
  const newTable = table('送料の決定', FEE_CONDITIONS, [FEE_OUTCOME], [
    row(['はい', 'はい'], ['無料']),
    row(['はい', 'いいえ'], ['無料']),
    row(['いいえ', 'はい'], ['無料']),
  ])
  writeThroughScript(runDir(0, 'with_skill'), '送料の決定.json', newTable)
  // 未決の結果を推測で埋めた
  writeThroughScript(runDir(0, 'without_skill'), '送料の決定.json', {
    ...newTable,
    rows: [...newTable.rows, row(['いいえ', 'いいえ'], ['500円'])],
  })

  // eval 1: 会員ランク3値 × 1万円以上か2値。倍率は未決
  writeThroughScript(
    runDir(1, 'with_skill'),
    'ポイント倍率.json',
    table(
      'ポイント倍率',
      [
        { id: 'cond_Ran1Kxx2Dd', name: '会員ランク', values: ['ゴールド', 'シルバー', '一般'] },
        { id: 'cond_Ten1Kxx2Ee', name: '1万円以上か', values: yesNo },
      ],
      [{ id: 'out_Poi1Nts2Ff', name: 'ポイント倍率', choices: [] }],
      [],
    ),
  )
  // ロジックツリーを作ってしまった
  writeRaw(runDir(1, 'without_skill'), 'ポイント倍率.json', {
    schemaVersion: 1,
    type: 'logicTree',
    title: 'ポイント倍率',
    nodes: [{ id: 'node_Aaaaaaaaaa', parentId: null, text: 'ポイント倍率はどう決まるか' }],
  })

  // eval 2: 何も作らないのが合格。without_skill はデシジョンテーブルを作ってしまった
  runDir(2, 'with_skill')
  writeThroughScript(runDir(2, 'without_skill'), '送料の決定.json', newTable)

  // eval 3: fixture に条件を足す
  const campaign = { id: 'cond_Cam1Pai2Gn', name: 'キャンペーン中か', values: yesNo }
  for (const variant of ['with_skill', 'without_skill'] as const) {
    const dir = runDir(3, variant)
    const target = path.join(dir, '送料の決定.json')
    copyFileSync(FIXTURE, target)
    const base = JSON.parse(readFileSync(target, 'utf8')) as { conditions: unknown[] }
    writeThroughScript(dir, '送料の決定.json', { ...base, conditions: [...base.conditions, campaign] }, target)
  }
  // 既存の条件の id を振り直してしまった
  {
    const target = path.join(iter, 'eval-3', 'without_skill', '送料の決定.json')
    writeFileSync(
      target,
      readFileSync(target, 'utf8').replaceAll('cond_Aa1Bb2Cc3D', 'cond_Zz1Yy2Xx3W'),
      'utf8',
    )
  }

  // eval 4: 会員で5000円未満だけが起こりえない
  const impossibleTable = table('送料の決定', FEE_CONDITIONS, [FEE_OUTCOME], [
    row(['はい', 'はい'], ['無料']),
    row(['はい', 'いいえ'], [''], true),
    row(['いいえ', 'はい'], ['無料']),
    row(['いいえ', 'いいえ'], ['500円']),
  ])
  writeThroughScript(runDir(4, 'with_skill'), '送料の決定.json', impossibleTable)
  // 条件の意味から推し量って、すべての行に起こりえないを立ててしまった
  writeThroughScript(runDir(4, 'without_skill'), '送料の決定.json', {
    ...impossibleTable,
    rows: impossibleTable.rows.map((r) => ({ ...r, impossible: true, results: [''] })),
  })

  execFileSync('node', [GRADE, iter], { encoding: 'utf8' })
}, 60000)

afterAll(() => {
  rmSync(iter, { recursive: true, force: true })
  rmSync(scratch, { recursive: true, force: true })
})

describe('evals の判定器（grade.mjs）', () => {
  it.each([0, 1, 2, 3, 4])('Skill どおりの出力は eval-%i の全項目で合格する', (evalId) => {
    const g = grading(evalId, 'with_skill')
    expect(failed(g)).toEqual([])
    expect(g.total).toBeGreaterThan(0)
  })

  it.each([
    [0, '結果が空の行がちょうど1行'],
    [1, 'type=decisionTable の JSON がちょうど1つ作られている'],
    [2, 'decisionTable を作っていない（ロジックツリーへ譲っている）'],
    [3, '既存2条件と結果の名前・値・選択肢が変わっていない'],
    [4, '起こりえない行がちょうど1行'],
  ])('狙った壊れ方をした eval-%i の出力は「%s」で落ちる', (evalId, text) => {
    expect(failed(grading(evalId, 'without_skill'))).toContain(text)
  })
})
