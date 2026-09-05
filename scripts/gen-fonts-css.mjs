/**
 * fontsource の CSS から woff2 参照だけを残した src/styles/fonts.css を生成する。
 *
 * static 版（Sans JP / Mono）の CSS は woff2 と woff を両参照しており、
 * 素の import では woff（不要な旧形式。JP だけで数MB）まで dist に入る。
 * ここで woff の参照を落とし、url をこのリポジトリからの相対パスに書き換える。
 *
 * 再生成: node scripts/gen-fonts-css.mjs
 * （fontsource の版を上げたときに実行する。形は src/styles/fonts.test.ts が固定する）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SOURCES = [
  // 可変版の index.css は wght 軸の normal のみ（italic は別ファイル）で、woff2 のみ参照
  { pkg: '@fontsource-variable/ibm-plex-sans', css: ['index.css'] },
  // JP に variable 版は npm に存在しない（U1 決着）。static の 3 ウェイトだけ参照する
  { pkg: '@fontsource/ibm-plex-sans-jp', css: ['400.css', '500.css', '600.css'] },
  // 700 は端末の ANSI 太字用（U1 決着）
  { pkg: '@fontsource/ibm-plex-mono', css: ['400.css', '700.css'] },
]

const root = path.resolve(import.meta.dirname, '..')
const out = [
  '/* 生成物。手で編集しない。scripts/gen-fonts-css.mjs が fontsource の CSS から',
  ' * woff2 の参照だけを残して作る（woff は落とす）。再生成は同スクリプトを実行 */',
]
for (const { pkg, css } of SOURCES) {
  for (const file of css) {
    const text = readFileSync(path.join(root, 'node_modules', pkg, file), 'utf8')
    const rewritten = text
      // src リストから woff（非 woff2）の参照を落とす。.woff2) には一致しない
      .replace(/,\s*url\([^)]+\.woff\)\s*format\('woff'\)/g, '')
      // url をこのファイル（src/styles/）からの相対パスへ
      .replace(/url\(\.\/files\//g, `url(../../node_modules/${pkg}/files/`)
    out.push(`/* ---- ${pkg}/${file} ---- */`)
    out.push(rewritten)
  }
}
writeFileSync(path.join(root, 'src', 'styles', 'fonts.css'), out.join('\n'))
console.log('src/styles/fonts.css を生成した')
