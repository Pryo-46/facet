import { describe, expect, it } from 'vitest'
import {
  buildLatestJson,
  cargoPackageVersion,
  packageVersion,
  resolveVersion,
  tauriConfVersion,
} from './make-latest-json.mjs'

// **`[workspace.package]` を [package] より前に置いてある。** これが無いと
// [package] の version が最初の version 行になってしまい、セクションを
// 切り出さない素朴な実装でも偶然 1.2.3 に一致して、このフィクスチャが
// 「[package] の版を取る」ことを何も証明しなくなる。
// **[dependencies] の裸の version は [package] より後ろなので、前後の
// 両側に釣り餌を置いたことになる。**
// workspace 継承（version.workspace = true）は Cargo の実在の機能で、
// 非現実的なフィクスチャではない
const CARGO = `[workspace.package]
version = "0.0.0"

[package]
name = "facet"
version = "1.2.3"
edition = "2021"

[dependencies]
tauri = { version = "9.9.9", features = [] }
version = "8.8.8"
`

describe('版番号の取り出し', () => {
  it('package.json から取る', () => {
    expect(packageVersion('{"name":"facet","version":"1.2.3"}')).toBe('1.2.3')
  })

  it('tauri.conf.json から取る', () => {
    expect(tauriConfVersion('{"productName":"facet","version":"1.2.3"}')).toBe('1.2.3')
  })

  it('**Cargo.toml は [package] の版を取る**（依存の version 行に釣られない）', () => {
    expect(cargoPackageVersion(CARGO)).toBe('1.2.3')
  })

  it('[package] が無ければ落とす', () => {
    expect(() => cargoPackageVersion('[dependencies]\nversion = "8.8.8"\n')).toThrow(/\[package\]/)
  })
})

describe('3箇所の整合', () => {
  it('揃っていればその版を返す', () => {
    expect(
      resolveVersion({
        packageJson: '{"version":"1.2.3"}',
        tauriConf: '{"version":"1.2.3"}',
        cargoToml: CARGO,
      }),
    ).toBe('1.2.3')
  })

  it('**揃っていなければ落とす。メッセージに3つの実際の値が出る**', () => {
    let thrown = null
    try {
      resolveVersion({
        packageJson: '{"version":"1.2.4"}',
        tauriConf: '{"version":"1.2.3"}',
        cargoToml: CARGO,
      })
    } catch (err) {
      thrown = err
    }
    expect(thrown).not.toBeNull()
    expect(thrown.message).toContain('1.2.4')
    expect(thrown.message).toContain('1.2.3')
    expect(thrown.message).toContain('package.json')
    expect(thrown.message).toContain('tauri.conf.json')
    expect(thrown.message).toContain('Cargo.toml')
  })
})

describe('latest.json の組み立て', () => {
  it('windows-x86_64 だけを載せ、URL にタグと版を埋める', () => {
    expect(
      buildLatestJson({ version: '1.2.3', signature: 'SIG', pubDate: '2026-08-19T00:00:00.000Z' }),
    ).toEqual({
      version: '1.2.3',
      notes: 'https://github.com/Pryo-46/facet/releases/tag/v1.2.3',
      pub_date: '2026-08-19T00:00:00.000Z',
      platforms: {
        'windows-x86_64': {
          signature: 'SIG',
          url: 'https://github.com/Pryo-46/facet/releases/download/v1.2.3/facet_1.2.3_x64-setup.exe',
        },
      },
    })
  })

  it('**darwin のキーを作らない**（mac は対象外）', () => {
    const json = buildLatestJson({
      version: '1.2.3',
      signature: 'SIG',
      pubDate: '2026-08-19T00:00:00.000Z',
    })
    expect(Object.keys(json.platforms)).toEqual(['windows-x86_64'])
  })
})
