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

  it('要件を1つ破った下書きは終了コード 1 を返す', () => {
    // 実物の palette.css を土台に、light の ink を canvas とほぼ同じ
    // 明度へ書き換え、コントラスト要件（4.5:1）だけを破る
    const dir = mkdtempSync(path.join(tmpdir(), 'palette-fit-smoke-'))
    const fixture = path.join(dir, 'broken.css')
    const broken = `
:root {
    --canvas: oklch(0.95 0 0);
    --surface: oklch(0.985 0 0);
    --surface-muted: oklch(0.91 0 0);
    --ink: oklch(0.9 0 0);
    --ink-muted: oklch(0.42 0 0);
    --ink-faint: oklch(0.58 0 0);
    --rule: oklch(0.58 0 0);
    --grid: oklch(0.89 0 0);
    --missing: oklch(0.49 0.12 85);
    --invalid: oklch(0.38 0.15 30);
    --pending: oklch(0.48 0.14 250);
    --judge-yes: oklch(0.87 0.08 165);
    --judge-yes-fg: oklch(0.18 0 0);
    --judge-no: oklch(0.35 0 0);
    --judge-no-fg: oklch(0.985 0 0);
}
.dark {
    --canvas: oklch(0.17 0 0);
    --surface: oklch(0.205 0 0);
    --surface-muted: oklch(0.27 0 0);
    --ink: oklch(0.88 0 0);
    --ink-muted: oklch(0.70 0 0);
    --ink-faint: oklch(0.55 0 0);
    --rule: oklch(0.56 0 0);
    --grid: oklch(0.25 0 0);
    --missing: oklch(0.82 0.13 85);
    --invalid: oklch(0.68 0.15 30);
    --pending: oklch(0.75 0.12 250);
    --judge-yes: oklch(0.80 0.10 165);
    --judge-yes-fg: oklch(0.17 0 0);
    --judge-no: oklch(0.36 0 0);
    --judge-no-fg: oklch(0.95 0 0);
}
`
    try {
      writeFileSync(fixture, broken, 'utf8')
      expect(run(fixture)).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20000)
})
