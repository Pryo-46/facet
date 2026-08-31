/**
 * 同梱 Skill をプロジェクトフォルダへ置き直す（コア・I/O 注入）。
 *
 * **これが無いと機能の目的が達成できない。** Skill は facet リポジトリの
 * `.claude/skills/` にあり、ユーザーが開くプロジェクトフォルダには入っていない。
 * 作業ディレクトリをプロジェクトフォルダにして claude を起動しても、
 * プロジェクトレベルの Skill が見つからず用語登録 Skill が使えない（設計 決定10）
 */

/**
 * アプリに同梱する Skill（ユーザーのデータを作るもの）。
 *
 * `src-tauri/tauri.conf.json` の `bundle.resources` は
 * `"../.claude/skills": "skills"`（`src-tauri/` からの相対パス）と
 * ディレクトリごと同梱しているので、
 * **Skill を増やしてもそちらの追従は要らない。ここに1行足すだけでよい。**
 *
 * ここに載せない Skill（`palette-retheme` など facet 自身のソースを触るもの）は
 * ユーザーのプロジェクトフォルダには置かれない
 */
export const BUNDLED_SKILLS: readonly string[] = [
  'glossary-term-register',
  'error-catalog-register',
  'sequence-register',
  'issue-tree-register',
  'logic-tree-register',
]

/**
 * `npm install` を要求していた旧版が作った依存の置き場（Skill 直下の1件）。
 *
 * **同期の除外と削除の保護で、同じ1つの名前を見る。** 二重の意味を持つ:
 * - 同梱物としては**置かない**（`shouldSyncSkillFile`）
 * - プロジェクト側にあるものは**消さない**（`isRemovableSkillEntry`）
 *
 * m30 で書き出しスクリプトが生成物を使うようになり、Skill はもう
 * `npm install` を指示しない。それでも消さないのは人間の裁定——旧版で
 * 作られた `node_modules` が利用者の手元に残っていても、アプリが黙って
 * 数百 MB を消してよい理由にはならない、という判断による保護である
 */
const SKILL_DEPS_DIR = 'node_modules'

/**
 * `npm install` を要求していた旧版が作ったロックファイル（Skill 直下の1件）。
 *
 * `SKILL_DEPS_DIR` と同じ理由の保護——同期では置き直さないものを削除だけ
 * すると、旧版で作られた `node_modules` がロックを失ったまま残る。
 * `package-lock.json` 自体は `shouldSyncSkillFile` の対象ではない
 *（除外リストに乗らない＝同梱物にあれば同期される）。ここで保護するのは
 * 「利用者の手元に残った旧版の残骸」で、facet が同梱する版ではない
 */
const SKILL_LOCK_FILE = 'package-lock.json'

/**
 * 同梱リソースを読むとき、このディレクトリへ降りてよいか（skill-resources.ts の
 * collect が使う）。`node_modules` は「書かない」（shouldSyncSkillFile）だけでなく
 * 「読まない」——ビルドマシンで Skill に npm install 済みだと数百ファイルを
 * IPC で読んで捨てることになり、依存にテキストでないファイルが1つあるだけで
 * readBundled ごと throw して Skill が黙って現れなくなる
 */
export function shouldDescendSkillDir(name: string): boolean {
  return name !== SKILL_DEPS_DIR
}

/**
 * 同梱 Skill のファイル（Skill 名からの相対パス、`/` 区切り）を
 * プロジェクトフォルダへ同期してよいかを判定する（純関数）。
 *
 * **除外リスト方式。** Skill 自身が動作のために足すもの（`references/` や
 * `assets/` など、開発時点で名前を知らないもの）は既定で同梱されるべきで、
 * 落とすべきは開発・評価用の足場だけだから。除外するのは:
 * - `evals/` 配下（Skill の評価ハーネス。会議で使う人には無意味なノイズ）
 * - `node_modules/` 配下（`npm install` で足された依存。数が多く、
 *   Tauri の書き込み許可スコープ外のファイルを含むこともあって同期が壊れる）
 *
 * **`.gitignore` は同期する（sequence M4 の最終レビューで一度除外し、この
 * タスクで戻した）。** SKILL.md が指示する `npm install` は置いた先に
 * 未追跡の `node_modules` を数千ファイル作るので、`.gitignore`
 * （`node_modules/` を含む）を一緒に置かないと利用者の `git status` が汚れる。
 * **mac では `allow_skill_dir` が Skill ごとの `.gitignore` を `allow_file`
 * で literal に許可して初めて書ける**（`src-tauri/src/lib.rs`）。実行時
 * scope の照合は `require_literal_leading_dot: true`（unix の既定）で
 * `<dir>/.claude/**` のような `**` パターンはドット始まりの要素に一致しない
 * ——`.DS_Store` が消せないのと同じ1つの機構——ので、`allow_file` を
 * 個別に呼ばなければ `<root>/.gitignore` への書き込みは `forbidden path`
 * で落ちる（sequence M4 の実測）。この許可が外れると、下の書き込みループに
 * try/catch が無いぶん「消したあとに書けない」＝Skill が半分しか置かれない
 * 状態に戻り、毎回フォルダを開くたびに失敗トーストが出る
 */
export function shouldSyncSkillFile(path: string): boolean {
  if (path === 'evals' || path.startsWith('evals/')) return false
  if (path === SKILL_DEPS_DIR || path.startsWith(`${SKILL_DEPS_DIR}/`)) return false
  return true
}

/**
 * 置き直しの前に消してよい要素か（Skill ディレクトリ直下の名前で判定する。純関数）。
 *
 * **消す目的は「Skill の更新でファイルが減ったときに古いファイルを取り残さない」
 * こと**であって、ディレクトリを空にすることではない。facet が書いたものは
 * 消してよいが、`node_modules` と `package-lock.json` は消さない
 * ——`npm install` の指示はもう無いが、旧版が利用者の手元に作った残骸を
 * アプリが黙って数百 MB 消してよい理由にはならない、という人間の裁定である
 */
export function isRemovableSkillEntry(name: string): boolean {
  return name !== SKILL_DEPS_DIR && name !== SKILL_LOCK_FILE
}

export interface SkillSyncIo {
  /** 同梱 Skill の中身。path は Skill 名からの相対パス（`/` 区切り） */
  readBundled(skill: string): Promise<ReadonlyArray<{ path: string; text: string }>>
  exists(path: string): Promise<boolean>
  /** `path` 直下の要素の名前（ファイル・ディレクトリの区別なく、名前だけ） */
  listEntries(path: string): Promise<readonly string[]>
  /** ファイルでもディレクトリでも消せること（ディレクトリは再帰） */
  removeEntry(path: string): Promise<void>
  mkdir(path: string): Promise<void>
  writeText(path: string, text: string): Promise<void>
  join(...parts: string[]): Promise<string>
}

/**
 * 同梱 Skill を置き直す。**消すのは同梱名のディレクトリの中身だけ**——
 * `.claude/skills/` を丸ごと消すとユーザーが自分で置いた Skill も消えるし、
 * 同梱名のディレクトリを丸ごと消すとその中の `node_modules`（利用者が
 * `npm install` で作ったもの）まで消える。facet が壊してよいのは
 * facet が書いたものに限る（`isRemovableSkillEntry`）
 *
 * **Skill ごとに独立して処理する**（1本の読み出しが失敗しても他の Skill は
 * 置く）。逐次 for ループで await すると1本目の失敗でループ全体が止まり、
 * 後続の Skill が一切置かれなくなるため、Promise.allSettled で独立させている
 *
 * **読んでから消す**（M11 から繰り越していた「読む前に消す」欠陥。sequence-m4 で解消）。
 * 先に消してから `readBundled` が
 * 失敗すると、プロジェクト側の Skill が消えたまま復旧しない。同梱物を
 * すべてメモリに読み終えてから消しに行けば、「読めなかったから消さない」が
 * 成り立つ——消したあとに残る失敗要因は書き込みそのものだけになる
 */
export async function syncBundledSkills(
  projectDir: string,
  io: SkillSyncIo,
  skills: readonly string[] = BUNDLED_SKILLS,
): Promise<void> {
  const results = await Promise.allSettled(
    skills.map(async (skill) => {
      const root = await io.join(projectDir, '.claude', 'skills', skill)
      // 消すより先に読む（読めなかったら消さない）。ここで失敗したら以降へ進まないので、
      // プロジェクト側の Skill は前回のまま残る
      const files = (await io.readBundled(skill)).filter((file) => shouldSyncSkillFile(file.path))
      if (await io.exists(root)) {
        // **丸ごと消さない。** 直下を列挙して facet の持ち物だけを消す
        //（`node_modules` を巻き込むと利用者の `npm install` が毎回消える）
        for (const name of await io.listEntries(root)) {
          if (!isRemovableSkillEntry(name)) continue
          try {
            await io.removeEntry(await io.join(root, name))
          } catch (err: unknown) {
            // **握りつぶすが、黙らない（レビュー指摘）。** これは「恒久的な
            // 破損」を「古いファイルが1つ残る」へ落とす取引なので、起きた
            // ことは追えるようにしておく。トーストには上げない——mac の
            // `.DS_Store` は消せなくて当たり前で、利用者に見せる異常ではない
            console.warn(
              `Skill の古い要素を消せませんでした（残したまま置き直します）: ${skill}/${name}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            )
            // **1件消せなくても置き直しは続ける（レビュー指摘）。** 削除は
            // 掃除であって目的ではない。ここで投げると「消えかけたまま
            // 書き戻されない」——「読む前に消す」と同じ形の恒久的な破損が、
            // 一段あとに移っただけになる。
            //
            // mac では実際に起きる: `allow_skill_dir` が入れる実行時 scope は
            // `Scope::default()` 由来で `require_literal_leading_dot: true`
            // なので、`<dir>/.claude/**` はドット始まりの**直下の要素**に
            // 一致しない。Finder が置く `.DS_Store` が1つあるだけで、その
            // remove が forbidden path になる（`.gitignore` は `allow_skill_dir`
            // が literal で許可しているので対象外。`scripts/` の中のドット
            // ファイルは、親ごと再帰削除されるので個別の判定を通らず影響が無い）。
            //
            // 消し残しはファイルが1つ余分に残るだけで、次の書き込みが
            // 同じ名前を上書きする。Skill を失うより明確に軽い
          }
        }
      }
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
