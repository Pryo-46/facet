import { getVersion } from '@tauri-apps/api/app'

/**
 * いま動いているアプリの版番号（`1.0.1` のような文字列。`v` は付かない）。
 *
 * **取得元は `src-tauri/tauri.conf.json`** ——つまり実行中のバイナリそのものの版で、
 * 自動アップデートが新版と比べる版と同じ源になる。`package.json` を
 * ビルド時に埋め込む手もあるが、それだと3箇所（`package.json` /
 * `tauri.conf.json` / `Cargo.toml`）の一致という前提に寄りかかることになる
 * ——その一致を確かめるのは `scripts/make-latest-json.mjs` の仕事であって、
 * 画面の表示が前提にしてよいものではない。
 *
 * **例外はそのまま投げる。** 握り潰すかどうかは呼び出し側が決める
 * （`updater.ts` と同じ役割分担）
 */
export async function readAppVersion(): Promise<string> {
  return await getVersion()
}
