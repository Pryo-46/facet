import { displayTitle, type ProjectFile } from './project-file'
import type { AnyToolModule } from './registry'

/**
 * type が読めないファイルを入れるグループのキー。
 *
 * **衝突しないことは保証していない。** `type` はスキーマ上ただの文字列なので、
 * `"type": "__unknown__"` と書かれたファイルは「種類不明」に混ざる。
 * 実際にそう書かれる見込みは無いので防御機構は置かない——見た目を
 * 前置き記号で飾って「衝突しない」と称するより、起きうることを書いておく方が
 * 次に読む人を誤らせない
 */
export const UNKNOWN_TYPE_KEY = '__unknown__'

/** 一覧の1グループ（種類の見出し＋その中のファイル） */
export interface FileGroup {
  /** React の key と、テストが参照する安定識別子。登録済みなら type 文字列 */
  key: string
  /** 見出しの表示名 */
  heading: string
  files: ProjectFile[]
}

/**
 * ファイル一覧を種類でまとめて並べる（コアの純関数。`FileList` は結果を描くだけ）。
 *
 * 順序は **① レジストリの登録順 → ② 登録に無い type（type 文字列の昇順）
 * → ③ type が読めないもの**。①が登録順なのは、新規作成ボタンが既に同じ順に
 * 並んでいるため（`src/components/FileList.tsx` の `modules` prop）。
 * ファイルが1つも無い種類は見出しごと出さない
 */
export function groupFiles(
  files: readonly ProjectFile[],
  modules: readonly AnyToolModule[],
): FileGroup[] {
  const buckets = new Map<string, ProjectFile[]>()
  for (const file of files) {
    const key = file.result.type ?? UNKNOWN_TYPE_KEY
    const bucket = buckets.get(key)
    if (bucket) bucket.push(file)
    else buckets.set(key, [file])
  }

  const groups: FileGroup[] = []
  const registered = new Set(modules.map((m) => m.type))

  for (const module of modules) {
    const bucket = buckets.get(module.type)
    if (bucket) groups.push({ key: module.type, heading: module.displayName, files: sorted(bucket) })
  }

  // 未対応の type は type 文字列そのものを見出しにする。「ツールがまだ無い」と
  // 「ファイルが壊れている」を一覧の上で区別するため
  const unregistered = [...buckets.keys()]
    .filter((key) => key !== UNKNOWN_TYPE_KEY && !registered.has(key))
    .sort()
  for (const type of unregistered) {
    groups.push({ key: type, heading: `${type}（未対応）`, files: sorted(buckets.get(type)!) })
  }

  const unknown = buckets.get(UNKNOWN_TYPE_KEY)
  if (unknown) groups.push({ key: UNKNOWN_TYPE_KEY, heading: '種類不明', files: sorted(unknown) })

  return groups
}

/**
 * title の `localeCompare('ja')` 順。**五十音順ではない**——漢字は ICU の
 * 照合順（部首・画数）で並ぶので、読みの順にはならない
 *（例: 受注 → 返品 → 問合せ。読みなら 受注 → 問合せ → 返品）。
 * 読みはデータに無いので求めようがなく、**決定的であれば一覧としては足りる**。
 *
 * **同値のときはファイル名で決める**——これが無いと、
 * 同じ名前のファイルが2つあるだけで順が揺れる（`Array.sort` の安定性は
 * 入力順に依存し、入力順は `readDir` まかせなので当てにできない）
 */
function sorted(files: ProjectFile[]): ProjectFile[] {
  return [...files].sort((a, b) => {
    const byTitle = displayTitle(a).localeCompare(displayTitle(b), 'ja')
    return byTitle !== 0 ? byTitle : a.name.localeCompare(b.name, 'ja')
  })
}
