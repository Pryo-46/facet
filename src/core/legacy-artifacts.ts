/**
 * 旧版がプロジェクトフォルダへ置いたもの（コア・純関数）。
 *
 * **見る名前は facet が付けたものに限る。** ソースコードのリポジトリを
 * プロジェクトフォルダに指定することがあり、そこには利用者自身の
 * `.claude/` がある。`.claude/` や `.claude/skills/` の存在そのものを
 * 条件にすると、facet が何も置いていないフォルダでも知らせが出る
 */

/**
 * 旧版が置いた Skill のディレクトリ名。
 *
 * **いまの Skill 名（`write-term` など）は入れない。** 新しい名前は
 * プラグインの中にしか無く、`.claude/skills/` にあるならそれは利用者が
 * 自分で置いたものである
 */
export const LEGACY_SKILL_DIRS: readonly string[] = [
  'glossary-term-register',
  'error-catalog-register',
  'sequence-register',
  'issue-tree-register',
  'logic-tree-register',
]

/** 旧版が置いた読み方ガイドのファイル名 */
export const LEGACY_GUIDE_FILENAME = 'README-for-AI.md'

/**
 * 旧版のガイドを見分ける目印。
 *
 * **ファイル名だけでは判定しない。** 同じ名前のファイルを利用者が自分で
 * 書いていることがあり、それを消すよう促すと利用者の文章を失わせる。
 * この一文は旧版のガイドが必ず先頭付近に持つ
 */
export const LEGACY_GUIDE_MARK = 'このファイルは仕様整理ツール facet が自動で管理する'

export interface LegacyArtifacts {
  /** 見つかった旧版の Skill のディレクトリ名 */
  skills: readonly string[]
  /** 旧版のガイドがあるか */
  guide: boolean
}

/**
 * 見つかったものを1つの知らせにする。無ければ `null`。
 *
 * **アプリは消さない。** 消す主体を利用者に置くのは、facet が置いたと
 * 判定した根拠が名前だけで、間違えたときに失うものが利用者のファイルだから
 */
export function describeLegacyArtifacts(found: LegacyArtifacts): string | null {
  const paths = [
    ...found.skills.map((name) => `.claude/skills/${name}`),
    ...(found.guide ? [LEGACY_GUIDE_FILENAME] : []),
  ]
  if (paths.length === 0) return null
  return `古い版の facet が置いたものが残っています。プラグインの Skill と二重になるので消してください: ${paths.join('、')}`
}
