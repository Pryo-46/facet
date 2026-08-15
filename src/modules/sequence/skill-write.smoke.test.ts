import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkSequenceConsistency } from './consistency'

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
    // from が存在しない参加者 → missing-actor
    { id: 'step_AAAAAAAAAA', kind: 'call', from: 'actor_ZZZZZZZZZZ', to: 'actor_BBBBBBBBBB', label: '在庫を引き当てる', awaitsReply: true },
    // self なのに to → to-mismatch（UI からは作れない外部編集ケース）
    { id: 'step_BBBBBBBBBB', kind: 'self', from: 'actor_BBBBBBBBBB', to: 'actor_BBBBBBBBBB', label: '在庫を再計算する' },
    // call なのに to 無し → to-mismatch
    { id: 'step_CCCCCCCCCC', kind: 'call', from: 'actor_BBBBBBBBBB', label: '出荷を指示する', awaitsReply: true },
    // from == to → self-call
    { id: 'step_DDDDDDDDDD', kind: 'call', from: 'actor_BBBBBBBBBB', to: 'actor_BBBBBBBBBB', label: '伝票を起こす', awaitsReply: true },
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
