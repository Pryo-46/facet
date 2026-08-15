import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkErrorCatalogConsistency } from './consistency'

/**
 * `error-catalog-write.mjs --check` を実際に spawn し、整合性警告の文言が
 * アプリの checkErrorCatalogConsistency と一致していることを確かめる。
 *
 * **なぜ出力の突き合わせなのか。** スクリプトの警告判定は consistency.ts の
 * 手複製で、consistency.ts 自体は値 import ＋ `@/` エイリアスを持つため
 * sequence-register 式のバイト一致コピーにできない。手複製が黙ってズレる
 * 経路（実際に duplicate-id / duplicate-name でズレた）を、実行結果の
 * 突き合わせで塞ぐ。契約は「アプリの message がスクリプトの stdout に
 * 逐語で現れる」——スクリプトが接頭辞や独自警告を足すのは妨げない
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCRIPT = path.join(
  REPO_ROOT,
  '.claude/skills/error-catalog-register/scripts/error-catalog-write.mjs',
)

const entry = (over: Record<string, unknown>) => ({
  id: 'error_AAAAAAAAAA',
  name: '在庫不足',
  occurrence: '注文確定時',
  resolutionLevel: 'user',
  causeForSupport: '在庫が足りない',
  causeForSpec: '引当数量が実在庫を超過',
  userAction: '数量を減らして再注文する',
  supportAction: '',
  engineerAction: '',
  notes: '',
  ...over,
})

/**
 * 計上規則の差（グループごと1件 vs 出現ごと1件）は同一 ID が **3件**ないと
 * 炙り出せない——2件では両方式とも1件になり区別が付かない
 * （「退化ケースをテストデータに選ばない」）
 */
const FIXTURE = {
  schemaVersion: 1,
  type: 'errorCatalog',
  title: '検証用',
  errors: [
    entry({ id: 'error_DUP0000001', name: '在庫不足' }),
    entry({ id: 'error_DUP0000001', name: '在庫僅少' }),
    entry({ id: 'error_DUP0000001', name: '在庫切れ' }),
    // 末尾空白は normalizeForMatch（NFKC → trim → lowercase）が吸収して重複になる
    entry({ id: 'error_BBBBBBBBBB', name: '支払エラー' }),
    entry({ id: 'error_CCCCCCCCCC', name: '支払エラー ' }),
    // user 宣言なのに userAction が空 → resolution-action-missing
    entry({ id: 'error_DDDDDDDDDD', name: '通信断', userAction: '' }),
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

describe('error-catalog-write.mjs（実行 smoke ＋ 警告文言のアプリ一致）', () => {
  it('アプリの整合性 message がすべて stdout に逐語で現れる', () => {
    const issues = checkErrorCatalogConsistency(FIXTURE as never)
    // fixture が退化していないことを先に固める（issues が空なら以降の
    // toContain が空回りで緑になる）
    expect(new Set(issues.map((i) => i.rule))).toEqual(
      new Set(['duplicate-id', 'duplicate-name', 'resolution-action-missing']),
    )
    const dir = mkdtempSync(path.join(tmpdir(), 'ec-write-smoke-'))
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
    const dir = mkdtempSync(path.join(tmpdir(), 'ec-write-smoke-'))
    try {
      const file = path.join(dir, 'clean.json')
      writeFileSync(
        file,
        JSON.stringify({ schemaVersion: 1, type: 'errorCatalog', title: '検証用', errors: [entry({})] }),
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
