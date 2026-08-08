import { serialize } from './canonical'
import type { AnyToolModule } from './registry'

export interface NewFile {
  /** 拡張子込みのファイル名（プロジェクトフォルダ直下） */
  name: string
  /** 書き込むテキスト。必ず正規形（スコープ定義書3節） */
  text: string
  /** text と同じ内容のデータ。一覧へ即反映するために返す */
  data: unknown
}

/**
 * 新規ファイルの中身を組み立てる（コア・純関数。ファイルには触らない）。
 * 名前は**解決済みのものを受け取る**——空いている名前の判定はディスクへの
 * 問い合わせを含む非同期処理（file-ops の createFile）に移した。
 * 正規形での書き出しは新規作成にも例外なく適用する——非正規形で作ると、
 * 作った直後の最初の1文字の編集で全行 diff が出る
 */
export function buildNewFile(module: AnyToolModule, name: string): NewFile {
  const title = name.replace(/\.json$/i, '')
  const data = module.createEmpty(title)
  return { name, text: serialize(data, module.schema), data }
}
