import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkGlossaryConsistency } from './consistency'

/**
 * `glossary-write.mjs --check` を実際に spawn し、整合性警告の文言が
 * アプリの checkGlossaryConsistency と一致していることを確かめる。
 *
 * **なぜ出力の突き合わせなのか。** スクリプトの警告判定は consistency.ts の
 * 手複製で、consistency.ts 自体は値 import ＋ `@/` エイリアスを持つため
 * sequence-register 式のバイト一致コピーにできない。手複製が黙ってズレる
 * 経路（実際に fold の trim 欠落・alias 計上規則でズレた）を、実行結果の
 * 突き合わせで塞ぐ。契約は「アプリの message がスクリプトの stdout に
 * 逐語で現れる」——スクリプトが接頭辞や独自警告を足すのは妨げない
 */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const SCRIPT = path.join(
  REPO_ROOT,
  '.claude/skills/glossary-term-register/scripts/glossary-write.mjs',
)

const term = (over: Record<string, unknown>) => ({
  id: 'term_AAAAAAAAAA',
  name: '受注',
  kind: 'event',
  definition: '注文を受け付けること',
  aliases: [],
  notes: '',
  ...over,
})

/**
 * - 同一 ID 3件: 計上規則の差（グループごと vs 出現ごと）を炙り出す
 * - 「返品」と「返品 」: fold の trim 欠落を炙り出す（trim が無いと重複にならない）
 * - alias「オーダー」×3（同一用語内2＋他用語1）: アプリは1グループ1件（3件）と数える。
 *   スクリプト現行の「同一用語内」「用語間」2本立てとの差を炙り出す
 * - alias「出荷」が用語「出荷」の name と衝突
 */
const FIXTURE = {
  schemaVersion: 1,
  type: 'glossary',
  title: '検証用',
  terms: [
    term({ id: 'term_DUP0000001', name: '受注' }),
    term({ id: 'term_DUP0000001', name: '出荷' }),
    term({ id: 'term_DUP0000001', name: '請求' }),
    term({ id: 'term_BBBBBBBBBB', name: '返品' }),
    term({ id: 'term_CCCCCCCCCC', name: '返品 ' }),
    term({ id: 'term_DDDDDDDDDD', name: '注文', aliases: ['オーダー', 'オーダー'] }),
    term({ id: 'term_EEEEEEEEEE', name: '発注', aliases: ['オーダー', '出荷'] }),
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

describe('glossary-write.mjs（実行 smoke ＋ 警告文言のアプリ一致）', () => {
  it('アプリの整合性 message がすべて stdout に逐語で現れる', () => {
    const issues = checkGlossaryConsistency(FIXTURE as never)
    // fixture が退化していないことを先に固める（issues が空なら以降の
    // toContain が空回りで緑になる）
    expect(new Set(issues.map((i) => i.rule))).toEqual(
      new Set(['duplicate-id', 'duplicate-name', 'duplicate-alias', 'alias-name-collision']),
    )
    const dir = mkdtempSync(path.join(tmpdir(), 'gl-write-smoke-'))
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
    const dir = mkdtempSync(path.join(tmpdir(), 'gl-write-smoke-'))
    try {
      const file = path.join(dir, 'clean.json')
      writeFileSync(
        file,
        JSON.stringify({ schemaVersion: 1, type: 'glossary', title: '検証用', terms: [term({})] }),
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
