// M32 の機械検査。worktree の直下で `node scripts/m32-check.mjs [candidates|code] [paths...]` と呼ぶ。
//   candidates: 経緯の語を含む行を列挙する（HARD は最終的に 0 行、soft は目視で判断）
//   code:       origin/main との差分のうち、コメントとテスト名以外に変更が無いことを確かめる
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const SELF = 'scripts/m32-check.mjs'
const SCOPE = ['src', 'src-tauri/src', 'scripts', '.claude/skills']
const EXT = /\.(ts|tsx|rs|mjs)$/
const [mode = 'candidates', ...paths] = process.argv.slice(2)
const targets = paths.length ? paths : SCOPE

const vcs = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const tracked = vcs('ls-files', '--', ...targets)
  .split('\n')
  .filter((f) => f !== SELF && EXT.test(f) && !/\/generated\//.test(f))

// 採番はコメントとテスト名から消す。識別子（step_Ef7zM3pS6t・COM1）は境界で除く
const HARD = [
  /(^|[^A-Za-z0-9_])(M[0-9]+|(issue-tree|logic-tree|sequence)-m[0-9]+)(?![A-Za-z0-9_])/,
  /レビュー(指摘|で|の|:|：|\)|）)|依頼者|申し送り|フォローアップ|残件から|踏んだ罠|で確定|で決定|実機修正/,
]
// 現在形の文にも出うる語。列挙だけして、残すかは読んで決める
const SOFT = /当初|以前|かつて|元々|もともと|変更前|実機確認|→ ?[0-9]+|に伸ばし|から分離|へ引き上げ|へ下が|へ移し|に移した|一本化した/

if (mode === 'candidates') {
  let hard = 0
  let soft = 0
  for (const f of tracked) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (HARD.some((re) => re.test(line))) {
        hard++
        console.log(`HARD ${f}:${i + 1}: ${line.trim()}`)
      } else if (SOFT.test(line)) {
        soft++
        console.log(`soft ${f}:${i + 1}: ${line.trim()}`)
      }
    })
  }
  console.log(`\nhard=${hard} soft=${soft}`)
  process.exit(hard === 0 ? 0 : 1)
}

if (mode === 'code') {
  // src/styles/conventions.test.ts の stripComments と同じ規則。JSX の `{/* */}` の殻も落とす
  const strip = (s) =>
    s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\{\s*\}/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
  const TEST_TITLE = /^(describe|it|test)(\.(each|skip|only|todo))?\(/
  const changed = vcs('diff', '--name-only', 'origin/main', '--', ...targets)
    .split('\n')
    .filter((f) => f && f !== SELF && EXT.test(f))
  let bad = 0
  for (const f of changed) {
    let before
    try {
      before = strip(vcs('show', `origin/main:${f}`))
    } catch {
      console.log(`NEW  ${f}: origin/main に無い（新規ファイルは本計画の対象外）`)
      bad++
      continue
    }
    const after = strip(readFileSync(f, 'utf8'))
    if (before.length !== after.length) {
      console.log(`BAD  ${f}: コメント以外の行数が ${before.length} → ${after.length}`)
      const n = Math.min(before.length, after.length)
      for (let i = 0; i < n; i++) {
        if (before[i] !== after[i]) {
          console.log(`     最初の差: ${before[i]}\n            → ${after[i]}`)
          break
        }
      }
      bad++
      continue
    }
    for (let i = 0; i < before.length; i++) {
      if (before[i] === after[i]) continue
      if (TEST_TITLE.test(before[i]) && TEST_TITLE.test(after[i])) continue
      console.log(`BAD  ${f}: コード行が変わっている\n     ${before[i]}\n   → ${after[i]}`)
      bad++
    }
  }
  console.log(`\nchanged=${changed.length} bad=${bad}`)
  process.exit(bad === 0 ? 0 : 1)
}
