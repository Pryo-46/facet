import { buildNewFile, type NewFile } from './new-file'
import type { AnyToolModule } from './registry'

/** ファイル入出力の注入口。コアは Tauri を知らない（実体は src/fs/project-fs.ts） */
export interface FileIo {
  join: (dir: string, name: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
}

export interface CreatedFile extends NewFile {
  /** 書き込んだ絶対パス */
  path: string
}

/**
 * 新規ファイルを作る（額縁の新規作成。rev 6章）。
 * 失敗は投げる——呼び出し側が「一覧に足す」前に止まる必要があるため
 *（書けていないファイルを一覧に出すと、選んだ瞬間に読み込み失敗になる）
 */
export async function createFile(
  opts: FileIo & {
    dir: string
    module: AnyToolModule
    /** フォルダ直下の既存ファイル名。衝突回避にだけ使う */
    existingNames: readonly string[]
  },
): Promise<CreatedFile> {
  const file = buildNewFile(opts.module, opts.existingNames)
  const path = await opts.join(opts.dir, file.name)
  await opts.write(path, file.text)
  return { ...file, path }
}

/**
 * ファイルを OS のゴミ箱へ移す。
 *
 * 開いているファイルなら、自動保存を **flush せずに** dispose する。
 * flush すると、消したはずのファイルを書き戻して復活させる。順序も逆にしない
 * ——先にゴミ箱へ移すと、その直後にデバウンスタイマーが発火して同じことが起きる。
 *
 * この結果、ゴミ箱への移動が失敗した場合はデバウンス窓（500ms）内の編集が失われる。
 * 「このファイルを消す」という明示的な操作の副作用としては許容する
 */
export async function trashFile(opts: {
  path: string
  /** 対象が現在開いているファイルのときだけ渡す */
  saver: { dispose(): void } | null
  trash: (path: string) => Promise<void>
}): Promise<void> {
  opts.saver?.dispose()
  await opts.trash(opts.path)
}

/** ensureFileOfType が見る、走査済み一覧の最小形 */
export interface ScannedFile {
  path: string
  name: string
  /** classifyFile が読み取った type（読めなかったファイルは null） */
  type: string | null
}

/**
 * singleton モジュール（用語集）のファイルを1つ確保する。
 *
 * 用語集0個は正常な状態（新規プロジェクト）で、初めて用語登録が発生した時点で
 * アプリが自動生成する（rev 5章）。将来のインライン登録コンポーネントも
 * この関数を呼ぶ——生成の条件と正規形をそちらで書き直さないため。
 *
 * 探索は必ず type で行い、ファイル名では探さない（rev 5章。人間が
 * リネームしても壊れないこと）。2つ以上あるのは単一性違反で、
 * その検出と表示は checkProjectConsistency の担当なのでここでは作らない
 */
export async function ensureFileOfType(
  opts: FileIo & {
    dir: string
    module: AnyToolModule
    files: readonly ScannedFile[]
  },
): Promise<{ path: string; created: CreatedFile | null }> {
  const existing = opts.files.find((f) => f.type === opts.module.type)
  if (existing) return { path: existing.path, created: null }
  const created = await createFile({
    dir: opts.dir,
    module: opts.module,
    existingNames: opts.files.map((f) => f.name),
    join: opts.join,
    write: opts.write,
  })
  return { path: created.path, created }
}
