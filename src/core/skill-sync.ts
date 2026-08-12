/**
 * 同梱 Skill をプロジェクトフォルダへ置き直す（コア・I/O 注入）。
 *
 * **これが無いと機能の目的が達成できない。** Skill は facet リポジトリの
 * `.claude/skills/` にあり、ユーザーが開くプロジェクトフォルダには入っていない。
 * 作業ディレクトリをプロジェクトフォルダにして claude を起動しても、
 * プロジェクトレベルの Skill が見つからず用語登録 Skill が使えない（設計 決定10）
 */

/**
 * アプリに同梱する Skill。**`src-tauri/tauri.conf.json` の
 * `bundle.resources` と一致していなければならない。**
 * Skill を増やすときは両方を直すこと
 */
export const BUNDLED_SKILLS: readonly string[] = [
  'glossary-term-register',
  'error-catalog-register',
]

/**
 * 同梱 Skill のファイル（Skill 名からの相対パス、`/` 区切り）を
 * プロジェクトフォルダへ同期してよいかを判定する（純関数）。
 *
 * **除外リスト方式。** Skill 自身が動作のために足すもの（`references/` や
 * `assets/` など、開発時点で名前を知らないもの）は既定で同梱されるべきで、
 * 落とすべきは開発・評価用の足場だけだから。除外するのは:
 * - `evals/` 配下（Skill の評価ハーネス。会議で使う人には無意味なノイズ）
 * - Skill 直下の `package.json`（evals の依存宣言）
 * - Skill 直下の `.gitignore`（開発用）
 */
export function shouldSyncSkillFile(path: string): boolean {
  if (path === 'evals' || path.startsWith('evals/')) return false
  if (path === 'package.json') return false
  if (path === '.gitignore') return false
  return true
}

export interface SkillSyncIo {
  /** 同梱 Skill の中身。path は Skill 名からの相対パス（`/` 区切り） */
  readBundled(skill: string): Promise<ReadonlyArray<{ path: string; text: string }>>
  exists(path: string): Promise<boolean>
  removeDir(path: string): Promise<void>
  mkdir(path: string): Promise<void>
  writeText(path: string, text: string): Promise<void>
  join(...parts: string[]): Promise<string>
}

/**
 * 同梱 Skill を置き直す。**消すのは同梱名のディレクトリだけ**——
 * `.claude/skills/` を丸ごと消すとユーザーが自分で置いた Skill も消える。
 * facet が壊してよいのは facet が書いたものに限る
 *
 * **Skill ごとに独立して処理する**（1本の読み出しが失敗しても他の Skill は
 * 置く）。逐次 for ループで await すると1本目の失敗でループ全体が止まり、
 * 後続の Skill が一切置かれなくなるため、Promise.allSettled で独立させている
 */
export async function syncBundledSkills(
  projectDir: string,
  io: SkillSyncIo,
  skills: readonly string[] = BUNDLED_SKILLS,
): Promise<void> {
  const results = await Promise.allSettled(
    skills.map(async (skill) => {
      const root = await io.join(projectDir, '.claude', 'skills', skill)
      if (await io.exists(root)) await io.removeDir(root)
      const files = (await io.readBundled(skill)).filter((file) => shouldSyncSkillFile(file.path))
      for (const file of files) {
        const parts = file.path.split('/')
        const name = parts.pop()
        if (name === undefined) continue
        const dir = parts.length > 0 ? await io.join(root, ...parts) : root
        await io.mkdir(dir)
        await io.writeText(await io.join(dir, name), file.text)
      }
    }),
  )
  const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed) throw failed.reason as Error
}
