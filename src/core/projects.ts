/**
 * 開いたプロジェクトフォルダの登録。
 *
 * **ファイルもストアも知らない。** 往復は `src/fs/settings-fs.ts` が持つ
 * （コアは Tauri を知らないという分担）。
 *
 * **`AppSettings` に入れない。** 同じ `settings.json` に載るが、設定画面で
 * 選ぶ値ではなく開いたフォルダの記録である
 */

export interface RegisteredProject {
  /** 同一性の鍵。末尾の区切りを落とした形で持つ */
  path: string
  /** 表示名。既定は開いたフォルダの名前で、利用者が変えられる */
  name: string
  favorite: boolean
  /** ISO8601 */
  lastOpenedAt: string
}

const EPOCH = '1970-01-01T00:00:00.000Z'

/**
 * 末尾の区切りを落とす。**同一性の鍵を作る唯一の口。**
 *
 * フォルダ選択ダイアログが返すパスと手で直した設定ファイルの値で末尾が
 * 揃わないため、比較の前に必ずここを通す。
 *
 * **ルートは区切りを落とさない。** 落とすと `allow_project_dir` が空パスや
 * ドライブの既定ディレクトリを受け取る経路ができる。
 *
 * `/` は `path.length > 1` のガードで守られる。`C:\` はこのガードの外に出る
 * ため、ドライブルートは正規表現で別に判定する
 */
const WINDOWS_DRIVE_ROOT = /^[A-Za-z]:[\\/]$/

export function canonicalPath(path: string): string {
  if (WINDOWS_DRIVE_ROOT.test(path)) return path
  return path.length > 1 && (path.endsWith('/') || path.endsWith('\\'))
    ? path.slice(0, -1)
    : path
}

/**
 * パスの末尾の名前。`/` と `\` の両方を区切りとして見る——Windows のパスだけで
 * 確かめると、POSIX の区切りを取り逃がす
 */
export function folderName(path: string): string {
  const trimmed = canonicalPath(path)
  const at = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  return at === -1 ? trimmed : trimmed.slice(at + 1)
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

/**
 * 読み込んだ JSON を登録の一覧に均す。**壊れていても投げない**——設定が
 * 読めないことは起動を止める理由にならない。
 *
 * **`path` が空文字列の要素は必ず落とす。** 素通しすると
 * `allowProjectDir("")` に届き、tauri-2.11.5 の scope 実装は空パスに
 * `MAIN_SEPARATOR + "**"` を足すため、unix では fs の実行時 scope が
 * ファイルシステム全体へ広がる
 */
export function normalizeProjects(raw: unknown): RegisteredProject[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const projects: RegisteredProject[] = []
  for (const item of raw) {
    const source = asRecord(item)
    // 空パスを弾く判定はここと次行の2箇所にある。canonicalPath は非空の入力を
    // 空文字列にしないため、片方を「冗長だから」と外しても他方が同じ入力を拾う
    if (typeof source.path !== 'string' || source.path === '') continue
    const path = canonicalPath(source.path)
    if (path === '' || seen.has(path)) continue
    seen.add(path)
    projects.push({
      path,
      name: typeof source.name === 'string' && source.name !== '' ? source.name : folderName(path),
      favorite: source.favorite === true,
      lastOpenedAt: typeof source.lastOpenedAt === 'string' ? source.lastOpenedAt : EPOCH,
    })
  }
  return projects
}

/**
 * お気に入りを先に置き、どちらの群も最終オープンの降順にする。
 *
 * **ロケール依存の比較を使わない。** ISO8601 は辞書順と時刻順が一致するので、
 * 文字列の大小だけで並べる
 */
export function sortProjects(projects: readonly RegisteredProject[]): RegisteredProject[] {
  return [...projects].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    if (a.lastOpenedAt === b.lastOpenedAt) return 0
    return a.lastOpenedAt > b.lastOpenedAt ? -1 : 1
  })
}

/**
 * 開いたことを記録する。登録済みなら最終オープンだけを更新し、未登録なら
 * フォルダ名を表示名として足す。
 *
 * **並べ替えはしない**——並び順は `sortProjects` が描画の直前に決める
 */
export function touchProject(
  projects: readonly RegisteredProject[],
  path: string,
  now: string,
): RegisteredProject[] {
  const key = canonicalPath(path)
  if (projects.some((p) => p.path === key)) {
    return projects.map((p) => (p.path === key ? { ...p, lastOpenedAt: now } : p))
  }
  return [...projects, { path: key, name: folderName(key), favorite: false, lastOpenedAt: now }]
}

/**
 * 2件以上が持っている表示名。同じ名前を許す代わりに、重なった行にだけ
 * パスを添えて見分けられるようにする
 */
export function duplicatedNames(projects: readonly RegisteredProject[]): ReadonlySet<string> {
  const count = new Map<string, number>()
  for (const p of projects) count.set(p.name, (count.get(p.name) ?? 0) + 1)
  return new Set([...count].filter(([, n]) => n > 1).map(([name]) => name))
}
