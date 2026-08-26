import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `palette-fit.mjs` を実際に spawn して実行し、Node の型ストリップ経由の
 * `contrast.ts` / `palette-requirements.ts` の import が壊れていないことを
 * 確かめる（Important 4b）。
 *
 * **この import 経路を実行するテストはこれ1本しかない。** `npm test` /
 * `tsc -b` / `oxlint` はどれもスクリプトを spawn しない。`contrast.ts` に
 * `enum` を足す、あるいはスクリプトが import しているエクスポート名を
 * 変えるだけで、その3つは緑のままスクリプトだけが壊れる——壊れ方は
 * ユーザーが Skill を実行したときにしか表に出ない。このテストは import
 * パス・export 名・型ストリップ互換性・終了コードの契約をまとめて守る。
 */

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SCRIPT = path.join(REPO_ROOT, '.claude/skills/palette-retheme/scripts/palette-fit.mjs')
const PALETTE_CSS = path.join(REPO_ROOT, 'src/styles/palette.css')

/**
 * 実物の `palette.css` と同じ19トークン×2モード。
 * `overrides` で1つだけ書き換えて、狙った節だけを破る
 */
function draft(overrides: { light?: Record<string, string>; dark?: Record<string, string> } = {}): string {
  const light: Record<string, string> = {
    canvas: 'oklch(0.95 0 0)',
    surface: 'oklch(0.985 0 0)',
    'surface-muted': 'oklch(0.91 0 0)',
    ink: 'oklch(0.18 0 0)',
    'ink-muted': 'oklch(0.42 0 0)',
    'ink-faint': 'oklch(0.58 0 0)',
    rule: 'oklch(0.58 0 0)',
    'rule-muted': 'oklch(0.89 0 0)',
    grid: 'oklch(0.89 0 0)',
    missing: 'oklch(0.49 0.10 85)',
    invalid: 'oklch(0.38 0.15 30)',
    pending: 'oklch(0.48 0.135 250)',
    'missing-face': 'oklch(0.95 0.06 85)',
    'invalid-face': 'oklch(0.93 0.035 30)',
    'pending-face': 'oklch(0.94 0.03 250)',
    'judge-yes': 'oklch(0.87 0.08 165)',
    'judge-yes-fg': 'oklch(0.18 0 0)',
    'judge-no': 'oklch(0.35 0 0)',
    'judge-no-fg': 'oklch(0.985 0 0)',
    ...overrides.light,
  }
  const dark: Record<string, string> = {
    canvas: 'oklch(0.17 0 0)',
    surface: 'oklch(0.24 0 0)',
    'surface-muted': 'oklch(0.13 0 0)',
    ink: 'oklch(0.88 0 0)',
    'ink-muted': 'oklch(0.70 0 0)',
    'ink-faint': 'oklch(0.55 0 0)',
    rule: 'oklch(0.56 0 0)',
    'rule-muted': 'oklch(0.40 0 0)',
    grid: 'oklch(0.20 0 0)',
    missing: 'oklch(0.82 0.13 85)',
    invalid: 'oklch(0.68 0.15 30)',
    pending: 'oklch(0.75 0.12 250)',
    'missing-face': 'oklch(0.30 0.05 85)',
    'invalid-face': 'oklch(0.28 0.05 30)',
    'pending-face': 'oklch(0.30 0.05 250)',
    'judge-yes': 'oklch(0.80 0.08 165)',
    'judge-yes-fg': 'oklch(0.17 0 0)',
    'judge-no': 'oklch(0.36 0 0)',
    'judge-no-fg': 'oklch(0.95 0 0)',
    ...overrides.dark,
  }
  const block = (tokens: Record<string, string>): string =>
    Object.entries(tokens)
      .map(([name, value]) => `    --${name}: ${value};`)
      .join('\n')
  return `:root {\n${block(light)}\n}\n.dark {\n${block(dark)}\n}\n`
}

function runOnFixture(css: string): number | null {
  const dir = mkdtempSync(path.join(tmpdir(), 'palette-fit-smoke-'))
  const fixture = path.join(dir, 'draft.css')
  try {
    writeFileSync(fixture, css, 'utf8')
    return run(fixture)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function run(inPath: string): number | null {
  try {
    execFileSync('node', [SCRIPT, '--in', inPath], { encoding: 'utf8' })
    return 0
  } catch (err) {
    return (err as { status: number | null }).status
  }
}

describe('palette-fit.mjs（型ストリップ経由の import が生きているかの疎通確認）', () => {
  it('実物の palette.css は終了コード 0 を返す', () => {
    expect(run(PALETTE_CSS)).toBe(0)
  }, 20000)

  /**
   * **節ごとに `failCount` が積まれることを見る。** 下の「要件を1つ破った」は
   * コントラストの節しか通らないので、他の節の `failCount += 1` を書き忘れても
   * （あるいは消しても）緑のままになる——出力に `✗` が出ているのに終了コードが
   * 0 という壊れ方は、Skill の手順6（「0 になるまで回す」）を静かに骨抜きにする
   */
  it('無彩色だけを破った下書きは終了コード 1 を返す', () => {
    // ライトの canvas に彩度を持たせる（「地は無彩色」を破る）
    expect(runOnFixture(draft({ light: { canvas: 'oklch(0.95 0.05 90)' } }))).toBe(1)
  }, 20000)

  it('色域だけを破った下書きは終了コード 1 を返す', () => {
    // ライトの missing の C を sRGB の外へ。コントラストも ΔE も通るが、
    // 書いた C（0.20）と実際に出る C は一致しない
    expect(runOnFixture(draft({ light: { missing: 'oklch(0.49 0.20 85)' } }))).toBe(1)
  }, 20000)

  it('面どうしだけを破った下書きは終了コード 1 を返す', () => {
    // ライトの judge-no を judge-yes に寄せて 3:1 を割る。面の文字（judge-no-fg）
    // まで巻き添えにしないよう、そちらは暗い側へ振り直す
    expect(
      runOnFixture(
        draft({ light: { 'judge-no': 'oklch(0.60 0 0)', 'judge-no-fg': 'oklch(0.10 0 0)' } }),
      ),
    ).toBe(1)
  }, 20000)

  it('意味色の識別だけを破った下書きは終了コード 1 を返す', () => {
    // ライトの pending を missing と同じ色相・明度へ寄せる。
    // コントラストは満たすが ΔE が落ちる
    expect(runOnFixture(draft({ light: { pending: 'oklch(0.49 0.10 85)' } }))).toBe(1)
  }, 20000)

  it('要件を1つ破った下書きは終了コード 1 を返す', () => {
    // light の ink を canvas とほぼ同じ明度へ書き換え、
    // コントラスト要件（4.5:1）だけを破る
    expect(runOnFixture(draft({ light: { ink: 'oklch(0.9 0 0)' } }))).toBe(1)
  }, 20000)
})
