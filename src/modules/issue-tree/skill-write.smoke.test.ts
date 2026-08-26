import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkIssueTreeConsistency } from './consistency'
import { deferralLine, deferredIssueCount, ISSUE_DEFERRED_LABEL, poseQuestions, tallyLine, tallyQuestions } from './derive'

/**
 * `issue-tree-write.mjs --check` を実際に spawn し、整合性警告の文言が
 * アプリの checkIssueTreeConsistency と一致していることを確かめる。
 *
 * consistency.ts はコアの `buildTree` / `findDuplicates` を値 import して
 * いるためバイト一致コピーにできず、スクリプト側は手複製である。
 * **文言のズレは実行結果の突き合わせでしか塞げない。** 加えて本テストは
 * derive.ts / canonical.ts の型ストリップ import 経路を実際に読む唯一の
 * 実行テストを兼ねる。契約は「アプリの message がスクリプトの stdout に
 * 逐語で現れる」
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCRIPT = path.join(REPO_ROOT, '.claude/skills/issue-tree-register/scripts/issue-tree-write.mjs')

/**
 * consistency.ts が message を出す6ブロック（rule は5種類。duplicate-id は
 * 課題と仮説の2箇所で出る）をすべて一度に炙り出す fixture。
 * スキーマ検証は通る形にしてある（ID は issue_ / hypothesis_ ＋英数字10文字、
 * 課題・仮説とも全キー常在）
 */
const FIXTURE = {
  schemaVersion: 2,
  type: 'issueTree',
  title: '検証用',
  issues: [
    // ルート1本目
    { id: 'issue_AAAAAAAAAA', parentId: null, text: '決済PoCで確かめること', events: [] },
    // 同一 ID → duplicate-id（課題）。ルート2本目でもある
    { id: 'issue_AAAAAAAAAA', parentId: null, text: '', events: [] },
    // 親が存在しない → missing-parent。ルートとして描かれるのでルート3本目
    { id: 'issue_BBBBBBBBBB', parentId: 'issue_ZZZZZZZZZZ', text: '親を消された課題', events: [] },
    // 互いを親にする2件 → 根から到達できない＝ cyclic-parent
    { id: 'issue_CCCCCCCCCC', parentId: 'issue_DDDDDDDDDD', text: '循環その1', events: [] },
    { id: 'issue_DDDDDDDDDD', parentId: 'issue_CCCCCCCCCC', text: '循環その2', events: [] },
  ],
  hypotheses: [
    { id: 'hypothesis_AAAAAAAAAA', issueId: 'issue_AAAAAAAAAA', text: '既存SDKで足りる', rationale: '', events: [], pendingNotes: [] },
    // 同一 ID → duplicate-id（仮説）
    { id: 'hypothesis_AAAAAAAAAA', issueId: 'issue_AAAAAAAAAA', text: '', rationale: '', events: [], pendingNotes: ['SHから「遅い」と指摘'] },
    // ぶら下がり先が存在しない → missing-issue
    { id: 'hypothesis_BBBBBBBBBB', issueId: 'issue_YYYYYYYYYY', text: '宙に浮いた仮説', rationale: '', events: [], pendingNotes: [] },
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

function check(data: unknown): { status: number; stdout: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'issue-tree-write-smoke-'))
  try {
    const file = path.join(dir, 'fixture.json')
    writeFileSync(file, JSON.stringify(data), 'utf8')
    return run(file)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('issue-tree-write.mjs（実行 smoke ＋ 警告文言のアプリ一致）', () => {
  it('アプリの整合性 message がすべて stdout に逐語で現れる', () => {
    const issues = checkIssueTreeConsistency(FIXTURE as never)
    // fixture が退化していないことを先に固める（issues が空なら以降の
    // toContain が空回りで緑になる）
    expect(new Set(issues.map((i) => i.rule))).toEqual(
      new Set(['duplicate-id', 'cyclic-parent', 'missing-parent', 'multiple-root', 'missing-issue']),
    )
    // duplicate-id は課題と仮説で2件出る（rule 名は5種類でもブロックは6つ）
    expect(issues).toHaveLength(6)

    const { status, stdout } = check(FIXTURE)
    expect(status).toBe(0) // 警告は exit code を変えない（die は構文・スキーマ違反のみ）
    for (const issue of issues) expect(stdout).toContain(issue.message)
  }, 20000)

  it('要対応の集計行がアプリの tallyLine と逐語で一致する', () => {
    // derive.ts を「読める」だけでなく「同じ答えを出す」ところまで見る
    const { stdout } = check(FIXTURE)
    expect(stdout).toContain(tallyLine(tallyQuestions(poseQuestions(FIXTURE as never))))
  }, 20000)

  it('欠陥の無いファイルは警告なしの exit 0', () => {
    const { status, stdout } = check({
      schemaVersion: 2,
      type: 'issueTree',
      title: '検証用',
      issues: [{ id: 'issue_AAAAAAAAAA', parentId: null, text: '決済PoCで確かめること', events: [] }],
      hypotheses: [
        {
          id: 'hypothesis_AAAAAAAAAA',
          issueId: 'issue_AAAAAAAAAA',
          text: '既存SDKで足りる',
          rationale: '前回のPoCで同じ構成を通した',
          events: [{ kind: 'supported', note: '実測 120ms' }],
          pendingNotes: [],
        },
      ],
    })
    expect(status).toBe(0)
    expect(stdout).not.toContain('整合性の警告')
    expect(stdout).toContain(tallyLine({ hypothesis: 0, result: 0, hold: 0, judgement: 0, total: 0 }))
  }, 20000)

  it('見送りを掲げた課題があると「見送り N」の行が出て、無ければ出ない', () => {
    const deferred = {
      schemaVersion: 2,
      type: 'issueTree',
      title: '検証用',
      issues: [
        {
          id: 'issue_AAAAAAAAAA',
          parentId: null,
          text: '需要検証',
          events: [{ kind: 'deferred', note: '今回は追わない' }],
        },
        { id: 'issue_BBBBBBBBBB', parentId: 'issue_AAAAAAAAAA', text: '認知', events: [] },
      ],
      hypotheses: [],
    }
    const withDeferral = check(deferred)
    expect(withDeferral.status).toBe(0)
    // アプリの導出と逐語で同じ行（「集計行がアプリと一致する」の見送り版）
    expect(withDeferral.stdout).toContain(deferralLine(deferredIssueCount(deferred.issues as never)))

    const none = {
      ...deferred,
      issues: deferred.issues.map((i) => ({ ...i, events: [] })),
    }
    expect(check(none).stdout).not.toContain(ISSUE_DEFERRED_LABEL)
  }, 20000)
})
