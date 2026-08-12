import { join, resolveResource } from '@tauri-apps/api/path'
import { exists, mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs'
import type { SkillSyncIo } from '@/core/skill-sync'

/**
 * 同梱 Skill の読み出しとプロジェクトフォルダへの書き込み（Tauri 境界）。
 *
 * **`readBundled` はディレクトリ配下を無条件・再帰的に集めるだけ**——
 * `evals/`（評価ハーネス）や `package.json` / `.gitignore`（開発用）も含めて
 * すべて返す。「何を実際にプロジェクトフォルダへ置くか」の判定
 * （`SKILL.md` や `scripts/*.mjs`, `references/` などは同期し、
 * `evals/` 配下や開発用ファイルは同期しない）は、テストで固定できるよう
 * `src/core/skill-sync.ts` の `shouldSyncSkillFile`（純関数）が担う。
 * ここでファイルを絞り込まない。
 *
 * **Skill のファイルはすべてテキスト**（`SKILL.md`、`scripts/*.mjs`、
 * `evals/fixtures/**` の `.json` / `.md` など）。バイナリを同梱するように
 * なったらこの前提が崩れるので、そのときは readTextFile / writeTextFile を
 * readFile / writeFile に替えること
 */

/** `dir` 配下のファイルを再帰的に集める（`base` からの相対パスで返す） */
async function collect(dir: string, base: string): Promise<Array<{ path: string; text: string }>> {
  const found: Array<{ path: string; text: string }> = []
  for (const entry of await readDir(dir)) {
    const full = await join(dir, entry.name)
    if (entry.isDirectory) {
      found.push(...(await collect(full, base)))
    } else if (entry.isFile) {
      found.push({
        path: full.slice(base.length + 1).split('\\').join('/'),
        text: await readTextFile(full),
      })
    }
  }
  return found
}

export const tauriSkillSyncIo: SkillSyncIo = {
  async readBundled(skill) {
    // bundle.resources で `.claude/skills/` を同梱しているので、
    // 実行時のパスは `skills/<名前>` に潰れる
    const root = await resolveResource(`skills/${skill}`)
    return collect(root, root)
  },
  exists: (path) => exists(path),
  removeDir: (path) => remove(path, { recursive: true }),
  mkdir: (path) => mkdir(path, { recursive: true }),
  writeText: (path, text) => writeTextFile(path, text),
  join: (...parts) => join(...parts),
}
