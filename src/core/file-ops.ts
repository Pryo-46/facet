import { resolveAvailableFileName } from './file-naming'
import { buildNewFile, type NewFile } from './new-file'
import type { AnyToolModule } from './registry'

/** ファイル入出力の注入口。コアは Tauri を知らない（実体は src/fs/project-fs.ts） */
export interface FileIo {
  join: (dir: string, name: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  /**
   * そのパスにファイルがあるか。**名前解決をディスクに問い合わせるために要る**——
   * 走査時のスナップショットだけで決めると、走査後に外部で増えたファイルを
   * 黙って上書きする（M4 の申し送りのデータ喪失）
   */
  exists: (path: string) => Promise<boolean>
}

export interface CreatedFile extends NewFile {
  /** 書き込んだ絶対パス */
  path: string
}

/**
 * 新規ファイルを作る（額縁の新規作成。rev 6章）。
 * 失敗は投げる——呼び出し側が「一覧に足す」前に止まる必要があるため
 *（書けていないファイルを一覧に出すと、選んだ瞬間に読み込み失敗になる）。
 *
 * 名前は**走査スナップショットとディスクの両方**に問い合わせて決める。
 * スナップショット（existingNames）だけでは走査後に外部で増えたファイルを
 * 上書きし、ディスクだけでは「一覧にあるが読めなかったファイル」を見落とす
 */
export async function createFile(
  opts: FileIo & {
    dir: string
    module: AnyToolModule
    /** フォルダ直下の既存ファイル名（走査時点）。衝突回避にだけ使う */
    existingNames: readonly string[]
  },
): Promise<CreatedFile> {
  // Windows のファイル名は大文字小文字を区別しないので、比較も区別しない
  const taken = new Set(opts.existingNames.map((n) => n.toLowerCase()))
  const name = await resolveAvailableFileName(opts.module.displayName, async (candidate) => {
    if (taken.has(candidate.toLowerCase())) return true
    return opts.exists(await opts.join(opts.dir, candidate))
  })
  const file = buildNewFile(opts.module, name)
  const path = await opts.join(opts.dir, name)
  await opts.write(path, file.text)
  return { ...file, path }
}

/**
 * ファイルを OS のゴミ箱へ移す。
 *
 * 開いているファイルなら、自動保存を止めてからゴミ箱へ移す。手順は
 * `dispose()` → `await settle()` → `dispose()` → `await trash()` で、3つの
 * 事故をこの順序でしか塞げない。
 *
 * 1. **書き戻しによる復活を防ぐ**: 先に `dispose()` して `pending` を空にする。
 *    以降このファイルへ書くものは存在しない。
 * 2. **着地済みの write を待つ**: `dispose()` はタイマーと `pending` しか消さず、
 *    既に飛んだ write（autosave 内部の `chain`）には触れない。デバウンスは 500ms で、
 *    確認ダイアログを開いて押す人間の所要時間はそれより長いので、削除確定時は
 *    **ほぼ常に write が in-flight**。待たずに `trash()` すると、ゴミ箱移動の後に
 *    write が着地してファイルを作り直す——UI の一覧からは消えているので、
 *    次のフォルダ走査まで見えない孤児になる。`settle()` がその待ちで、
 *    **書かずに待つ**のが要点。M4 までは「pending を空にした flush()」で
 *    同じことをしていたが、M5 で flush() が「静止するまで繰り返す」意味論に
 *    なったため、失敗して復元された pending を書き直してしまう。
 *    **ここを flush() に戻さないこと。**
 * 3. **失敗した write の復元を捨てる**: in-flight の write が失敗すると autosave の
 *    catch が内容を `pending` へ戻す（再試行のための仕組み）。消すファイルには
 *    不要なので `dispose()` をもう一度呼んで捨てる。呼び出し側（`app-controller.ts`
 *    の `deleteFile`）は直後に saver の参照を捨てるので実害が出る経路は現状無いが、
 *    「削除後の saver は書くものを持たない」を saver 側の状態として成立させておく。
 *
 * 順序も逆にできない——先にゴミ箱へ移すと、その直後にデバウンスタイマーが
 * 発火して同じことが起きる。
 *
 * この結果、ゴミ箱への移動が失敗した場合はデバウンス窓（500ms）内の編集が失われる。
 * 「このファイルを消す」という明示的な操作の副作用としては許容する
 */
export async function trashFile(opts: {
  path: string
  /** 対象が現在開いているファイルのときだけ渡す（実体は AutoSaver） */
  saver: { dispose(): void; settle(): Promise<void> } | null
  trash: (path: string) => Promise<void>
}): Promise<void> {
  const saver = opts.saver
  if (saver !== null) {
    saver.dispose()
    // 進行中の write の完了待ち（書かずに待つ）
    await saver.settle()
    // 失敗した write が復元した pending を捨てる
    saver.dispose()
  }
  await opts.trash(opts.path)
}

/**
 * そのモジュールのファイルを新規作成できるか。
 *
 * singleton モジュール（用語集）は既に1つあれば作れない——作れてしまうと、
 * アプリ自身が単一性違反（rev 5章）を製造する導線を持つことになる。
 * 「問題は消せなくして見せる」は外から来た違反（Skill が2つ書いた・git マージで
 * 増えた）を受け入れる原則であって、自分で違反を作る入口を出す理由にはならない。
 * 検出と赤表示、削除による解消はそのまま残る。
 *
 * 判定は type で行い、開けないファイル（rejected / listOnly）も数える——
 * 単一性は「type: glossary のファイルが2つ以上」という物理条件であり、
 * 壊れた用語集も「どちらを正とするか」の判断対象に含まれる（M2 で確定）
 */
export function canCreateFileOfType(
  module: AnyToolModule,
  existingTypes: readonly (string | null)[],
): boolean {
  if (!module.singleton) return true
  return !existingTypes.includes(module.type)
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
 * その検出と表示は checkProjectConsistency の担当なのでここでは作らない。
 *
 * **呼び出し側は「再走査した直後の一覧」を渡すこと**（M5 の handleExternalChange）。
 * 古いスナップショットを渡すと、外部で増えた用語集を見落として2つ目を作る
 *（データ喪失にはならない——名前解決はディスクを見るので上書きはしない——が、
 *   単一性違反を1件増やす）
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
    exists: opts.exists,
  })
  return { path: created.path, created }
}
