import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { tallyLine } from '@/core/missing-tally'
import { checkLogicTreeConsistency } from './consistency'
import { tallyMissing } from './missing'

/**
 * `logic-tree-write.mjs` を実際に spawn し、整合性警告の文言と要対応の
 * 集計行がアプリと一致していることを確かめる。
 *
 * consistency.ts はコアの `buildTree` / `findDuplicates` を値 import して
 * いるためバイト一致コピーにできず、スクリプト側は**文言だけ**手複製である
 *（木の組み立ては flat-tree-core.ts のコピーが持つ）。**文言のズレは実行結果の
 * 突き合わせでしか塞げない。** 加えて本テストは flat-tree-core.ts /
 * canonical.ts の型ストリップ import 経路を実際に読む唯一の実行テストを兼ねる
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCRIPT = path.join(REPO_ROOT, '.claude/skills/logic-tree-register/scripts/logic-tree-write.mjs')

/**
 * consistency.ts が message を出す4ブロックをすべて一度に炙り出す fixture。
 * スキーマ検証は通る形にしてある（ID は node_ ＋英数字10文字・全キー常在）
 */
const FIXTURE = {
  schemaVersion: 1,
  type: 'logicTree',
  title: '検証用',
  nodes: [
    // ルート1本目
    { id: 'node_AAAAAAAAAA', parentId: null, text: '応募が進まないのはどんなときか' },
    // 同一 ID → duplicate-id。空文字なので「（未記入・2番目）」で呼ばれる。ルート2本目
    { id: 'node_AAAAAAAAAA', parentId: null, text: '' },
    // 親が存在しない → missing-parent。ルートとして描かれるのでルート3本目
    { id: 'node_BBBBBBBBBB', parentId: 'node_ZZZZZZZZZZ', text: '親を消されたノード' },
    // 互いを親にする2件 → 根から到達できない＝ cyclic-parent
    { id: 'node_CCCCCCCCCC', parentId: 'node_DDDDDDDDDD', text: '循環その1' },
    { id: 'node_DDDDDDDDDD', parentId: 'node_CCCCCCCCCC', text: '循環その2' },
  ],
}

function run(args: string[]): { status: number; stdout: string } {
  try {
    return { status: 0, stdout: execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8' }) }
  } catch (err) {
    const e = err as { status: number | null; stdout?: string }
    return { status: e.status ?? -1, stdout: e.stdout ?? '' }
  }
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(tmpdir(), 'logic-tree-write-smoke-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function check(data: unknown): { status: number; stdout: string } {
  return withTempDir((dir) => {
    const file = path.join(dir, 'fixture.json')
    writeFileSync(file, JSON.stringify(data), 'utf8')
    return run(['--check', file])
  })
}

describe('logic-tree-write.mjs（実行 smoke ＋ 警告文言のアプリ一致）', () => {
  it('アプリの整合性 message がすべて stdout に逐語で現れる', () => {
    const issues = checkLogicTreeConsistency(FIXTURE as never)
    // fixture が退化していないことを先に固める（issues が空なら以降の
    // toContain が空回りで緑になる）
    expect(new Set(issues.map((i) => i.rule))).toEqual(
      new Set(['duplicate-id', 'cyclic-parent', 'missing-parent', 'multiple-root']),
    )
    expect(issues).toHaveLength(4)

    const { status, stdout } = check(FIXTURE)
    expect(status).toBe(0) // 警告は exit code を変えない（die は構文・スキーマ違反のみ）
    for (const issue of issues) expect(stdout).toContain(issue.message)
  }, 20000)

  it('要対応の集計行がアプリの tallyLine と逐語で一致する', () => {
    const { stdout } = check(FIXTURE)
    expect(stdout).toContain(tallyLine(tallyMissing(FIXTURE.nodes)))
  }, 20000)

  it('欠陥の無いファイルは警告なしの exit 0 で「要対応 0」', () => {
    const { status, stdout } = check({
      schemaVersion: 1,
      type: 'logicTree',
      title: '検証用',
      nodes: [
        { id: 'node_AAAAAAAAAA', parentId: null, text: '応募が進まないのはどんなときか' },
        { id: 'node_BBBBBBBBBB', parentId: 'node_AAAAAAAAAA', text: '応募そのものが成立しない' },
      ],
    })
    expect(status).toBe(0)
    expect(stdout).not.toContain('整合性の警告')
    expect(stdout).toContain(tallyLine({ total: 0, parts: [] }))
  }, 20000)

  it('--out は配列を DFS 行きがけ順に整えて正規形で書き出し、--check が冪等に通る', () => {
    // 兄弟の相対順（b → c）は変えずに、行きがけ順へ入れ替わること
    const scrambled = {
      schemaVersion: 1,
      type: 'logicTree',
      title: '並び順の検証',
      nodes: [
        { id: 'node_CCCCCCCCCC', parentId: 'node_BBBBBBBBBB', text: 'b の子' },
        { id: 'node_BBBBBBBBBB', parentId: 'node_AAAAAAAAAA', text: 'b' },
        { id: 'node_AAAAAAAAAA', parentId: null, text: '根' },
      ],
    }
    withTempDir((dir) => {
      const src = path.join(dir, 'draft.json')
      const dst = path.join(dir, 'out.json')
      writeFileSync(src, JSON.stringify(scrambled), 'utf8')

      expect(run(['--in', src, '--out', dst]).status).toBe(0)
      const written = readFileSync(dst, 'utf8')
      expect(JSON.parse(written).nodes.map((n: { id: string }) => n.id)).toEqual([
        'node_AAAAAAAAAA',
        'node_BBBBBBBBBB',
        'node_CCCCCCCCCC',
      ])
      expect(written.endsWith('}\n')).toBe(true)
      expect(written).not.toContain('\r')

      // 書き出したものを --check へ戻すと「正規形と一致」になる（冪等）
      const back = run(['--check', dst])
      expect(back.status).toBe(0)
      expect(back.stdout).toContain('正規形と一致しています')
    })
  }, 20000)

  it('スキーマ違反は exit 1', () => {
    const { status } = check({ schemaVersion: 1, type: 'logicTree', title: 'x', nodes: [{ id: 'bad', parentId: null, text: '' }] })
    expect(status).toBe(1)
  }, 20000)
})
