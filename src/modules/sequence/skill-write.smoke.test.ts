import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { tallyLine } from '@/core/missing-tally'
import { checkSequenceConsistency } from './consistency'
import { tallySequenceMissing } from './missing'

/**
 * `sequence-write.mjs --check` を実際に spawn し、整合性警告の文言が
 * アプリの checkSequenceConsistency と一致していることを確かめる。
 *
 * sequence の consistency 4ルール（duplicate-id / missing-actor /
 * to-mismatch / self-call）はスクリプト側に手複製されており、文言のズレは
 * 実行結果の突き合わせでしか塞げない。加えて本テストは questions.ts /
 * canonical.ts の型ストリップ import 経路を実際に読む唯一の実行テストを
 * 兼ねる。契約は「アプリの message がスクリプトの stdout に逐語で現れる」
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCRIPT = path.join(REPO_ROOT, '.claude/skills/sequence-register/scripts/sequence-write.mjs')

/**
 * duplicate-id / missing-actor / to-mismatch / self-call の4ルールを
 * すべて一度に炙り出す fixture（スキーマ検証を通る形。ID は
 * actor_ / step_ ＋英数字10文字、kind: call は awaitsReply 必須）
 */
const FIXTURE = {
  schemaVersion: 1,
  type: 'sequence',
  title: '検証用',
  actors: [
    { id: 'actor_AAAAAAAAAA', name: '注文サービス' },
    { id: 'actor_AAAAAAAAAA', name: '在庫サービス' },
    { id: 'actor_AAAAAAAAAA', name: '決済サービス' }, // 同一 ID 3件
    { id: 'actor_BBBBBBBBBB', name: '配送サービス' },
  ],
  steps: [
    // from が存在しないアクター → missing-actor
    { id: 'step_AAAAAAAAAA', kind: 'call', from: 'actor_ZZZZZZZZZZ', to: 'actor_BBBBBBBBBB', label: '在庫を引き当てる', awaitsReply: true },
    // self なのに to → to-mismatch（UI からは作れない外部編集ケース）
    { id: 'step_BBBBBBBBBB', kind: 'self', from: 'actor_BBBBBBBBBB', to: 'actor_BBBBBBBBBB', label: '在庫を再計算する' },
    // call なのに to 無し → to-mismatch
    { id: 'step_CCCCCCCCCC', kind: 'call', from: 'actor_BBBBBBBBBB', label: '出荷を指示する', awaitsReply: true },
    // from == to → self-call
    { id: 'step_DDDDDDDDDD', kind: 'call', from: 'actor_BBBBBBBBBB', to: 'actor_BBBBBBBBBB', label: '伝票を起こす', awaitsReply: true },
  ],
}

/**
 * 欠落の4種（未回答・未記入・回答済・考慮不要）がすべて 0 でない fixture。
 * 整合性の警告は出ない形にしてある（集計の行だけを見たいので）
 */
const TALLY_FIXTURE = {
  schemaVersion: 1,
  type: 'sequence',
  title: '検証用',
  actors: [
    { id: 'actor_AAAAAAAAAA', name: '注文サービス' },
    { id: 'actor_BBBBBBBBBB', name: '' }, // 未記入1
  ],
  steps: [
    {
      id: 'step_AAAAAAAAAA',
      kind: 'call',
      from: 'actor_AAAAAAAAAA',
      to: 'actor_BBBBBBBBBB',
      label: '在庫を引き当てる',
      awaitsReply: true,
      // failed＝回答済1 ／ unknown＝考慮不要1 ／ ifExecuted＝未回答1
      failures: {
        failed: { decision: 'handled', text: '在庫エラーを表示する' },
        unknown: { decision: 'notApplicable' },
      },
    },
    // label が空＝未記入2、self の failed が未回答2
    { id: 'step_BBBBBBBBBB', kind: 'self', from: 'actor_BBBBBBBBBB', label: '' },
  ],
}

function run(file: string): { status: number; stdout: string } {
  try {
    return { status: 0, stdout: execFileSync('node', [SCRIPT, '--check', file], { encoding: 'utf8' }) }
  } catch (err) {
    const e = err as { status: number | null; stdout?: string }
    return { status: e.status ?? -1, stdout: e.stdout ?? '' }
  }
}

describe('sequence-write.mjs（実行 smoke ＋ 警告文言のアプリ一致）', () => {
  it('アプリの整合性 message がすべて stdout に逐語で現れる', () => {
    const issues = checkSequenceConsistency(FIXTURE as never)
    // fixture が退化していないことを先に固める（issues が空なら以降の
    // toContain が空回りで緑になる）
    expect(new Set(issues.map((i) => i.rule))).toEqual(
      new Set(['duplicate-id', 'missing-actor', 'to-mismatch', 'self-call']),
    )
    const dir = mkdtempSync(path.join(tmpdir(), 'seq-write-smoke-'))
    try {
      const file = path.join(dir, 'fixture.json')
      writeFileSync(file, JSON.stringify(FIXTURE), 'utf8')
      const { status, stdout } = run(file)
      expect(status).toBe(0) // 警告は exit code を変えない（die は構文・スキーマ違反のみ）
      for (const issue of issues) expect(stdout).toContain(issue.message)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)

  it('欠落の集計がアプリの帯と逐語で一致する（未回答・未記入・回答済・考慮不要）', () => {
    // スクリプトは src/ を import できない（利用者のプロジェクトへコピーされる）ので、
    // 集計の文言は mjs 側の手書きである。アプリの tallyLine／帯の補足と
    // **逐語で同じ文字列が出ること**を、実プロセスの stdout で固定するのがこのテスト
    const tallied = tallySequenceMissing(TALLY_FIXTURE as never)
    // fixture が退化していないことを先に固める（4種すべてが 0 でないこと）
    expect(tallied.missing.parts.map((p) => [p.kind, p.count])).toEqual([
      ['unanswered', 2],
      ['blank', 2],
    ])
    expect([tallied.handled, tallied.notApplicable]).toEqual([1, 1])
    const dir = mkdtempSync(path.join(tmpdir(), 'seq-write-smoke-'))
    try {
      const file = path.join(dir, 'tally.json')
      writeFileSync(file, JSON.stringify(TALLY_FIXTURE), 'utf8')
      const { status, stdout } = run(file)
      expect(status).toBe(0)
      expect(stdout).toContain(tallyLine(tallied.missing))
      expect(stdout).toContain(`回答済 ${tallied.handled} ／ 考慮不要 ${tallied.notApplicable}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)

  it('欠落が無いファイルは「要対応 0」（⚠ を付けない）', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'seq-write-smoke-'))
    try {
      const file = path.join(dir, 'none.json')
      const data = {
        schemaVersion: 1,
        type: 'sequence',
        title: '検証用',
        actors: [{ id: 'actor_AAAAAAAAAA', name: '在庫サービス' }],
        steps: [
          {
            id: 'step_AAAAAAAAAA',
            kind: 'self',
            from: 'actor_AAAAAAAAAA',
            label: '在庫を確認する',
            failures: { failed: { decision: 'handled', text: '再試行する' } },
          },
        ],
      }
      writeFileSync(file, JSON.stringify(data), 'utf8')
      const { status, stdout } = run(file)
      expect(status).toBe(0)
      expect(tallySequenceMissing(data as never).missing.total).toBe(0)
      expect(stdout).toContain(tallyLine(tallySequenceMissing(data as never).missing))
      expect(stdout).not.toContain('⚠ 要対応')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)

  it('欠陥の無いファイルは警告なしの exit 0', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'seq-write-smoke-'))
    try {
      const file = path.join(dir, 'clean.json')
      writeFileSync(
        file,
        JSON.stringify({
          schemaVersion: 1,
          type: 'sequence',
          title: '検証用',
          actors: [{ id: 'actor_AAAAAAAAAA', name: '在庫サービス' }],
          steps: [{ id: 'step_AAAAAAAAAA', kind: 'self', from: 'actor_AAAAAAAAAA', label: '在庫を確認する' }],
        }),
        'utf8',
      )
      const { status, stdout } = run(file)
      expect(status).toBe(0)
      expect(stdout).not.toContain('整合性の警告')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)
})
