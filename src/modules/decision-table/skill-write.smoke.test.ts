import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { classifyFile } from '@/core/load'
import { tallyLine } from '@/core/missing-tally'
import { appRegistry } from '@/modules'
import type { Condition, DecisionTableSchemaVersion1, Row } from '@/types/decision-table'
import { checkDecisionTableConsistency } from './consistency'
import { tallyMissing } from './missing'

/**
 * `decision-table-write.mjs` を実際に spawn し、整合性警告の文言と要対応の
 * 集計行がアプリと一致すること、書き出した JSON をアプリが開けることを確かめる。
 *
 * consistency.ts はコアの値 import を持つので同梱できず、スクリプト側は
 * **文言を手複製している。文言のズレは実行結果の突き合わせでしか塞げない。**
 * 行の整列と集計は生成物（rows.mjs / missing.mjs / missing-tally.mjs）が持つので、
 * 本テストはその import 経路を実際に読む実行テストも兼ねる。
 *
 * **exit 1 を見るテストは、stderr の理由も見る。** スクリプトの import が
 * 解決できないときも node は exit 1 で終わるので、終了コードだけでは
 * 理由違いの失敗で緑になる
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCRIPT = path.join(
  REPO_ROOT,
  'plugins/facet/skills/write-decision-table/scripts/decision-table-write.mjs',
)

type Table = DecisionTableSchemaVersion1

const cond = (id: string, name: string, values: string[]): Condition => ({ id, name, values })
const row = (values: string[], results: string[], impossible = false): Row => ({
  values,
  impossible,
  results,
})

/** 会員か × 5000円以上か、結果は送料1本。4行すべて記入済み */
function feeTable(): Table {
  return {
    schemaVersion: 1,
    type: 'decisionTable',
    title: '送料の決定',
    conditions: [
      cond('cond_AAAAAAAAAA', '会員か', ['はい', 'いいえ']),
      cond('cond_BBBBBBBBBB', '5000円以上か', ['はい', 'いいえ']),
    ],
    outcomes: [{ id: 'out_AAAAAAAAAA', name: '送料', choices: ['無料', '500円'] }],
    rows: [
      row(['はい', 'はい'], ['無料']),
      row(['はい', 'いいえ'], ['無料']),
      row(['いいえ', 'はい'], ['無料']),
      row(['いいえ', 'いいえ'], ['500円']),
    ],
  }
}

/**
 * consistency.ts の7ルールをすべて一度に炙り出す表。スキーマ検証は通る形にしてある
 */
const FIXTURE: Table = {
  schemaVersion: 1,
  type: 'decisionTable',
  title: '検証用',
  conditions: [
    // 値ラベルの重複 → duplicate-value
    cond('cond_AAAAAAAAAA', '会員か', ['はい', 'はい', 'いいえ']),
    // 同じ ID → duplicate-id、同じ名前 → duplicate-name
    cond('cond_AAAAAAAAAA', '会員か', ['はい', 'いいえ']),
  ],
  outcomes: [
    // 選択肢ラベルの重複 → duplicate-choice
    { id: 'out_AAAAAAAAAA', name: '送料', choices: ['無料', '無料'] },
  ],
  rows: [
    // 選択肢にない結果 → unknown-value
    row(['はい', 'はい'], ['有料']),
    // 条件の値にない値 → unknown-value
    row(['たぶん', 'はい'], ['']),
    // 列数の不一致 → row-length。行の集合も直積と一致しない → row-set
    row(['はい'], ['']),
  ],
}

function run(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    return { status: 0, stdout: execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' }), stderr: '' }
  } catch (err) {
    const e = err as { status: number | null; stdout?: string; stderr?: string }
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), 'decision-table-write-smoke-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function writeJson(dir: string, name: string, data: unknown): string {
  const file = path.join(dir, name)
  writeFileSync(file, JSON.stringify(data), 'utf8')
  return file
}

function check(data: unknown): { status: number; stdout: string; stderr: string } {
  return withTempDir((dir) => run(['--check', writeJson(dir, 'fixture.json', data)]))
}

/** 位置を含む報告の行だけ（見出しやパスは経路で違って当然） */
const positions = (stdout: string): string[] =>
  stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(
      (line) => line.includes('未記入の結果:') || line.includes('名前なし:') || line.startsWith('  - '),
    )

describe('decision-table-write.mjs（実行 smoke ＋ 警告文言のアプリ一致）', () => {
  it('アプリの整合性 message がすべて stdout に逐語で現れる', () => {
    const issues = checkDecisionTableConsistency(FIXTURE)
    // fixture が退化していないことを先に固める（issues が空なら以降の
    // toContain が空回りで緑になる）
    expect(new Set(issues.map((i) => i.rule))).toEqual(
      new Set([
        'duplicate-id',
        'duplicate-name',
        'duplicate-value',
        'duplicate-choice',
        'row-length',
        'unknown-value',
        'row-set',
      ]),
    )

    const { status, stdout } = check(FIXTURE)
    expect(status).toBe(0) // 警告は exit code を変えない
    for (const issue of issues) expect(stdout).toContain(issue.message)
  }, 20000)

  it('要対応の集計行がアプリの tallyLine と逐語で一致する', () => {
    const data = feeTable()
    data.conditions[1] = cond('cond_BBBBBBBBBB', '', ['はい', 'いいえ']) // 名前なし
    data.outcomes[0].choices = ['無料', '500円', ''] // 名前なし
    data.rows[1] = row(['はい', 'いいえ'], ['']) // 未記入
    data.rows[2] = row(['いいえ', 'はい'], [''], true) // 起こりえない行の空欄は数えない
    const tally = tallyMissing(data)
    // fixture が退化していないこと（未記入と名前なしの両方が 0 でない）を先に固める
    expect(tally.parts.map((p) => [p.label, p.count])).toEqual([
      ['未記入', 1],
      ['名前なし', 2],
    ])

    const { status, stdout } = check(data)
    expect(status).toBe(0)
    expect(stdout).toContain(tallyLine(tally))
  }, 20000)

  it('欠陥の無いファイルは警告なしの exit 0 で「要対応 0」', () => {
    const { status, stdout } = check(feeTable())
    expect(status).toBe(0)
    expect(stdout).not.toContain('整合性の警告')
    expect(stdout).toContain(tallyLine({ total: 0, parts: [] }))
  }, 20000)

  it('--out は乱れた並びと欠けた組み合わせを直積の並びで書き出し、--check が冪等に通る', () => {
    const table = feeTable()
    const draft = { ...table, rows: [table.rows[3], table.rows[0]] }
    withTempDir((dir) => {
      const dst = path.join(dir, 'out.json')
      expect(run(['--in', writeJson(dir, 'draft.json', draft), '--out', dst]).status).toBe(0)

      const written = readFileSync(dst, 'utf8')
      expect((JSON.parse(written) as Table).rows).toEqual([
        row(['はい', 'はい'], ['無料']),
        row(['はい', 'いいえ'], ['']),
        row(['いいえ', 'はい'], ['']),
        row(['いいえ', 'いいえ'], ['500円']),
      ])
      expect(written.endsWith('}\n')).toBe(true)
      expect(written).not.toContain('\r')

      const back = run(['--check', dst])
      expect(back.status).toBe(0)
      expect(back.stdout).toContain('正規形と一致しています')
    })
  }, 20000)

  /**
   * **契約: 出力を `--check` に戻したら、同じ位置を同じ言葉で言うこと。**
   * `--out` の報告は、下書きの並びではなく書き出した行の並びで行う
   */
  it('--out の報告位置が、書き出したファイルを --check したときの位置と一致する', () => {
    const table = feeTable()
    // 下書きの1行目にある空欄は、書き出した後は #4 になる
    const draft = {
      ...table,
      rows: [row(['いいえ', 'いいえ'], ['']), table.rows[0], table.rows[1], table.rows[2]],
    }
    withTempDir((dir) => {
      const dst = path.join(dir, 'out.json')
      const out = run(['--in', writeJson(dir, 'draft.json', draft), '--out', dst])
      expect(out.status).toBe(0)
      const back = run(['--check', dst])
      expect(back.status).toBe(0)

      expect(out.stdout).toContain('未記入の結果: #4「送料」')
      expect(out.stdout).not.toContain('#1「送料」')
      expect(positions(out.stdout)).toEqual(positions(back.stdout))
    })
  }, 20000)

  it('--out で書き出したファイルを、アプリが整合性の指摘なしに開ける', () => {
    const table = feeTable()
    withTempDir((dir) => {
      const dst = path.join(dir, 'out.json')
      const draft = { ...table, rows: [table.rows[2], table.rows[0]] }
      expect(run(['--in', writeJson(dir, 'draft.json', draft), '--out', dst]).status).toBe(0)

      const result = classifyFile(readFileSync(dst, 'utf8'), appRegistry)
      expect(result.status).toBe('editable')
      if (result.status !== 'editable') return
      expect(result.type).toBe('decisionTable')
      expect(checkDecisionTableConsistency(result.data as Table)).toEqual([])
    })
  }, 20000)

  it('直積に当てはまらない行を持つ下書きは exit 1 で、ファイルを作らない', () => {
    const draft = { ...feeTable(), rows: [row(['はい', 'たぶん'], ['無料'])] }
    withTempDir((dir) => {
      const dst = path.join(dir, 'out.json')
      const result = run(['--in', writeJson(dir, 'draft.json', draft), '--out', dst])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('直積に当てはまらない行があります（1件。下書きの #1）')
      expect(existsSync(dst)).toBe(false)
    })
  }, 20000)

  it('同じ組み合わせで結果が食い違う下書きは exit 1', () => {
    const table = feeTable()
    const draft = { ...table, rows: [...table.rows, row(['はい', 'はい'], ['500円'])] }
    withTempDir((dir) => {
      const dst = path.join(dir, 'out.json')
      const result = run(['--in', writeJson(dir, 'draft.json', draft), '--out', dst])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('同じ組み合わせの行が食い違っています（下書きの #1 と #5）')
      expect(existsSync(dst)).toBe(false)
    })
  }, 20000)

  it('--base で条件を1本足すと、既存の結果が複製される', () => {
    const base = feeTable()
    const draft = {
      ...base,
      conditions: [...base.conditions, cond('cond_CCCCCCCCCC', 'キャンペーン中か', ['はい', 'いいえ'])],
    }
    withTempDir((dir) => {
      const dst = writeJson(dir, 'table.json', base)
      const result = run(['--in', writeJson(dir, 'draft.json', draft), '--base', dst, '--out', dst])
      expect(result.status).toBe(0)
      const rows = (JSON.parse(readFileSync(dst, 'utf8')) as Table).rows
      expect(rows).toHaveLength(8)
      expect(rows[6]).toEqual(row(['いいえ', 'いいえ', 'はい'], ['500円']))
      expect(rows[7]).toEqual(row(['いいえ', 'いいえ', 'いいえ'], ['500円']))
    })
  }, 20000)

  it('--base で記入済みの結果が失われるなら、--allow-loss が無い限り書き出さない', () => {
    const base = feeTable()
    const draft = {
      ...base,
      conditions: [cond('cond_AAAAAAAAAA', '会員か', ['はい']), base.conditions[1]],
    }
    withTempDir((dir) => {
      const dst = writeJson(dir, 'table.json', base)
      const before = readFileSync(dst, 'utf8')
      const src = writeJson(dir, 'draft.json', draft)

      const refused = run(['--in', src, '--base', dst, '--out', dst])
      expect(refused.status).toBe(1)
      expect(refused.stderr).toContain('記入済みの結果が2件失われます')
      expect(readFileSync(dst, 'utf8')).toBe(before)

      expect(run(['--in', src, '--base', dst, '--out', dst, '--allow-loss']).status).toBe(0)
      expect((JSON.parse(readFileSync(dst, 'utf8')) as Table).rows).toHaveLength(2)
    })
  }, 20000)

  it('--base に既存と違う rows の下書きを渡すと exit 2', () => {
    const base = feeTable()
    const draft = { ...base, rows: [row(['はい', 'はい'], ['500円']), ...base.rows.slice(1)] }
    withTempDir((dir) => {
      const dst = writeJson(dir, 'table.json', base)
      const result = run(['--in', writeJson(dir, 'draft.json', draft), '--base', dst, '--out', dst])
      expect(result.status).toBe(2)
      expect(result.stderr).toContain('--base を渡すときは、下書きの rows を既存ファイルの rows のまま')
    })
  }, 20000)

  it('直積が行数の上限を超える下書きは exit 1', () => {
    const conditions = Array.from({ length: 11 }, (_, i) =>
      cond(`cond_${String.fromCharCode(65 + i).repeat(10)}`, `条件${i + 1}`, ['はい', 'いいえ']),
    )
    const draft = { ...feeTable(), conditions, rows: [] }
    withTempDir((dir) => {
      const dst = path.join(dir, 'out.json')
      const result = run(['--in', writeJson(dir, 'draft.json', draft), '--out', dst])
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('直積が行数の上限（1024行）を超えます（2048行）')
      expect(existsSync(dst)).toBe(false)
    })
  }, 20000)

  it('スキーマ違反は exit 1', () => {
    const result = check({ ...feeTable(), conditions: [cond('bad', '会員か', ['はい'])] })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('スキーマ検証に失敗しました')
  }, 20000)
})
