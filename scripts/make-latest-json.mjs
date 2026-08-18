/**
 * リリースに添付する latest.json を作る（M19）。
 *
 * updater は「全成果物に署名」と「latest.json を毎回添付」が必須になる。
 * 手で書くと版番号と署名がずれ、**「更新したのに更新されない」という
 * 最も分かりにくい壊れ方**をするので、ここで機械にやらせる。
 *
 * **判断は置かない。** 版が3箇所で揃っていなければ落とすだけで、
 * どれかに揃えにいくことはしない。
 *
 * 使い方（ビルド後に実行する。詳しくは docs/release.md）:
 *   node scripts/make-latest-json.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const REPO = 'https://github.com/Pryo-46/facet'

export function packageVersion(text) {
  return JSON.parse(text).version
}

export function tauriConfVersion(text) {
  return JSON.parse(text).version
}

/**
 * Cargo.toml の `[package]` セクションの version を取る。
 *
 * **セクションを切ってから探すこと。** 素の `/^version\s*=/m` は
 * `[dependencies]` に裸の version 行があると先にそちらを拾いうる
 */
export function cargoPackageVersion(text) {
  const start = text.search(/^\[package\]\s*$/m)
  if (start < 0) throw new Error('Cargo.toml に [package] セクションが無い')
  const rest = text.slice(start + '[package]'.length)
  const end = rest.search(/^\[/m)
  const section = end < 0 ? rest : rest.slice(0, end)
  const match = section.match(/^version\s*=\s*"([^"]+)"/m)
  if (match === null) throw new Error('Cargo.toml の [package] に version が無い')
  return match[1]
}

/**
 * 3箇所の版が一致することを確かめ、その版を返す。
 * 揃っていなければ、3つの実際の値を並べて落とす
 */
export function resolveVersion({ packageJson, tauriConf, cargoToml }) {
  const versions = {
    'package.json': packageVersion(packageJson),
    'src-tauri/tauri.conf.json': tauriConfVersion(tauriConf),
    'src-tauri/Cargo.toml': cargoPackageVersion(cargoToml),
  }
  const unique = [...new Set(Object.values(versions))]
  if (unique.length !== 1) {
    const lines = Object.entries(versions).map(([file, v]) => `  ${file}: ${v}`)
    throw new Error(`版番号が揃っていない:\n${lines.join('\n')}`)
  }
  return unique[0]
}

export function buildLatestJson({ version, signature, pubDate }) {
  return {
    version,
    notes: `${REPO}/releases/tag/v${version}`,
    pub_date: pubDate,
    platforms: {
      // **mac は載せない**（M19 のスコープ。載せると未署名の .app が配られる）
      'windows-x86_64': {
        signature,
        url: `${REPO}/releases/download/v${version}/facet_${version}_x64-setup.exe`,
      },
    },
  }
}

function main() {
  const version = resolveVersion({
    packageJson: readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    tauriConf: readFileSync(path.join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'),
    cargoToml: readFileSync(path.join(ROOT, 'src-tauri/Cargo.toml'), 'utf8'),
  })
  const sigPath = path.join(
    ROOT,
    'src-tauri/target/release/bundle/nsis',
    `facet_${version}_x64-setup.exe.sig`,
  )
  const signature = readFileSync(sigPath, 'utf8').trim()
  const out = path.join(ROOT, 'latest.json')
  writeFileSync(out, `${JSON.stringify(buildLatestJson({ version, signature, pubDate: new Date().toISOString() }), null, 2)}\n`)
  console.log(`latest.json を書き出した（v${version}）: ${out}`)
}

// 直接実行されたときだけ走らせる（テストからは import されるだけ）
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
