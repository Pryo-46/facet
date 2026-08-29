import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUNDLED_SKILLS,
  isRemovableSkillEntry,
  shouldDescendSkillDir,
  shouldSyncSkillFile,
  syncBundledSkills,
  type SkillSyncIo,
} from './skill-sync'

/**
 * `existing` はプロジェクト側に既にあるディレクトリのパス、`entries` は
 * その直下にある要素の名前（既定は「前回の同期が置いた形」）
 */
function fakeIo(existing: string[] = [], entries: string[] = ['SKILL.md', 'scripts']) {
  const removed: string[] = []
  const written: Array<{ path: string; text: string }> = []
  const dirs: string[] = []
  const io: SkillSyncIo = {
    readBundled: async (skill) => [
      { path: 'SKILL.md', text: `# ${skill}` },
      { path: 'scripts/write.mjs', text: 'export {}' },
    ],
    exists: async (path) => existing.includes(path),
    listEntries: async () => entries,
    removeEntry: async (path) => {
      removed.push(path)
    },
    mkdir: async (path) => {
      dirs.push(path)
    },
    writeText: async (path, text) => {
      written.push({ path, text })
    },
    join: async (...parts) => parts.join('/'),
  }
  return { io, removed, written, dirs }
}

// console.warn の差し替えを次のテストへ持ち越さない（assertion で落ちても戻す）
afterEach(() => {
  vi.restoreAllMocks()
})

describe('syncBundledSkills', () => {
  it('同梱 Skill を .claude/skills/<名前>/ へ置く', async () => {
    const { io, written } = fakeIo()
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(written.map((w) => w.path)).toEqual([
      '/proj/.claude/skills/glossary-term-register/SKILL.md',
      '/proj/.claude/skills/glossary-term-register/scripts/write.mjs',
    ])
    expect(written[0]?.text).toBe('# glossary-term-register')
  })

  it('既にある中身は消してから置き直す（Skill の更新を取り残さない）', async () => {
    // 前回の同期が置いた `old.mjs` は今回の同梱物に無い。消えないと
    // 消えたはずのファイルがプロジェクトに残り続ける
    const { io, removed } = fakeIo(
      ['/proj/.claude/skills/glossary-term-register'],
      ['SKILL.md', 'scripts', 'old.mjs'],
    )
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(removed).toEqual([
      '/proj/.claude/skills/glossary-term-register/SKILL.md',
      '/proj/.claude/skills/glossary-term-register/scripts',
      '/proj/.claude/skills/glossary-term-register/old.mjs',
    ])
  })

  it('無いディレクトリは消そうとしない', async () => {
    const { io, removed } = fakeIo()
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(removed).toEqual([])
  })

  it('**利用者が `npm install` した node_modules と package-lock.json は消さない**', async () => {
    // SKILL.md は「初回のみ Skill ディレクトリで npm install」と指示している。
    // node_modules を消すと同期のたびにその1回が巻き戻り、スクリプトが
    // 「ajv が見つかりません」で落ちる状態に戻る。package-lock.json を消すと
    // node_modules は残ったままロックだけ失われ、次の npm install がロックを
    // 見ずに解決し直す（どちらも同期では置き直さないので消したら復元されない）
    const { io, removed } = fakeIo(
      ['/proj/.claude/skills/glossary-term-register'],
      ['SKILL.md', 'node_modules', 'package-lock.json'],
    )
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(removed).not.toContain('/proj/.claude/skills/glossary-term-register/node_modules')
    expect(removed).not.toContain('/proj/.claude/skills/glossary-term-register/package-lock.json')
    // それ以外はこれまでどおり消える
    expect(removed).toEqual(['/proj/.claude/skills/glossary-term-register/SKILL.md'])
  })

  it('**消せない要素が1つあっても Skill は置き直される**', async () => {
    // mac の実行時 scope は `require_literal_leading_dot: true` なので
    // `<dir>/.claude/**` はドット始まりの直下要素に一致しない。Finder の
    // `.DS_Store` が1つあるだけで remove が forbidden path になる。
    // ここで諦めると「消えかけたまま書き戻されない」——「読む前に消す」と
    // 同じ形の恒久的な破損が一段あとに移るだけになる
    const { io, removed, written } = fakeIo(
      ['/proj/.claude/skills/glossary-term-register'],
      ['.DS_Store', 'SKILL.md'],
    )
    const withForbidden: SkillSyncIo = {
      ...io,
      removeEntry: async (path) => {
        if (path.endsWith('/.DS_Store')) throw new Error('forbidden path')
        await io.removeEntry(path)
      },
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await syncBundledSkills('/proj', withForbidden, ['glossary-term-register'])
    // 消せた方は消え（ループが止まっていない）、
    expect(removed).toEqual(['/proj/.claude/skills/glossary-term-register/SKILL.md'])
    // 何より Skill が置き直されている
    expect(written.map((w) => w.path)).toEqual([
      '/proj/.claude/skills/glossary-term-register/SKILL.md',
      '/proj/.claude/skills/glossary-term-register/scripts/write.mjs',
    ])
    // **握りつぶすが黙らない。** 現場で追えるよう、どの要素がなぜ消せなかったかを残す
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('glossary-term-register/.DS_Store')
    expect(String(warn.mock.calls[0]?.[0])).toContain('forbidden path')
  })

  it('**ユーザーが置いた Skill には触らない**', async () => {
    // .claude/skills/ を丸ごと消すと、ユーザーの Skill が巻き添えになる。
    // facet が壊してよいのは facet が書いたものだけ
    const { io, removed } = fakeIo([
      '/proj/.claude/skills/glossary-term-register',
      '/proj/.claude/skills/my-own-skill',
    ])
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    // 列挙も削除も同梱名のディレクトリの内側で閉じている
    expect(removed.every((p) => p.startsWith('/proj/.claude/skills/glossary-term-register/'))).toBe(
      true,
    )
    expect(removed).not.toContain('/proj/.claude/skills/my-own-skill')
    expect(removed).not.toContain('/proj/.claude/skills')
    expect(removed).not.toContain('/proj/.claude/skills/glossary-term-register')
  })

  it('**readBundled が失敗したら何も消さない**（読む前に消さない）', async () => {
    // 先に消してから読み出しに失敗すると、プロジェクト側の Skill が
    // 消えたまま復旧しない（次の同期も同じ理由で失敗する）
    const { io, removed, written } = fakeIo(['/proj/.claude/skills/glossary-term-register'])
    const failing: SkillSyncIo = {
      ...io,
      readBundled: async () => {
        throw new Error('同梱物が読めません')
      },
    }
    await expect(syncBundledSkills('/proj', failing, ['glossary-term-register'])).rejects.toThrow(
      '同梱物が読めません',
    )
    expect(removed).toEqual([])
    expect(written).toEqual([])
  })

  it('読み出しに失敗した Skill だけが手つかずで残る（他の Skill は置き直す）', async () => {
    const { io, removed, written } = fakeIo(['/proj/.claude/skills/a', '/proj/.claude/skills/b'])
    const failing: SkillSyncIo = {
      ...io,
      readBundled: async (skill) => {
        if (skill === 'a') throw new Error('同梱物が読めません')
        return [{ path: 'SKILL.md', text: skill }]
      },
    }
    await expect(syncBundledSkills('/proj', failing, ['a', 'b'])).rejects.toThrow(
      '同梱物が読めません',
    )
    expect(removed.some((p) => p.startsWith('/proj/.claude/skills/a/'))).toBe(false)
    expect(removed.some((p) => p.startsWith('/proj/.claude/skills/b/'))).toBe(true)
    expect(written.map((w) => w.path)).toEqual(['/proj/.claude/skills/b/SKILL.md'])
  })

  it('入れ子のファイルの親ディレクトリを作る', async () => {
    const { io, dirs } = fakeIo()
    await syncBundledSkills('/proj', io, ['glossary-term-register'])
    expect(dirs).toContain('/proj/.claude/skills/glossary-term-register/scripts')
  })

  it('1本が失敗しても残りを置く', async () => {
    const { io, written } = fakeIo()
    const failing: SkillSyncIo = {
      ...io,
      readBundled: async (skill) => {
        if (skill === 'a') throw new Error('読めません')
        return [{ path: 'SKILL.md', text: skill }]
      },
    }
    await expect(syncBundledSkills('/proj', failing, ['a', 'b'])).rejects.toThrow('読めません')
    expect(written.map((w) => w.text)).toEqual(['b'])
  })

  it('評価用のファイルはプロジェクトフォルダへ同期しない', async () => {
    const { io, written } = fakeIo()
    const withDevFiles: SkillSyncIo = {
      ...io,
      readBundled: async (skill) => [
        { path: 'SKILL.md', text: `# ${skill}` },
        { path: 'scripts/write.mjs', text: 'export {}' },
        { path: 'evals/evals.json', text: '{}' },
        { path: 'evals/fixtures/existing-project/用語集.json', text: '{}' },
      ],
    }
    await syncBundledSkills('/proj', withDevFiles, ['glossary-term-register'])
    expect(written.map((w) => w.path)).toEqual([
      '/proj/.claude/skills/glossary-term-register/SKILL.md',
      '/proj/.claude/skills/glossary-term-register/scripts/write.mjs',
    ])
  })

  it('**.gitignore は同期する**（`allow_skill_dir` が literal 許可する前提。npm install の残骸で利用者の git status を汚さないため）', async () => {
    const { io, written } = fakeIo()
    const withGitignore: SkillSyncIo = {
      ...io,
      readBundled: async () => [
        { path: 'SKILL.md', text: '#' },
        { path: '.gitignore', text: 'node_modules/\n' },
      ],
    }
    await syncBundledSkills('/proj', withGitignore, ['glossary-term-register'])
    expect(written.map((w) => w.path)).toContain(
      '/proj/.claude/skills/glossary-term-register/.gitignore',
    )
  })

  it('**package.json は置く**（置いた先で `npm install` が効くために要る）', async () => {
    const { io, written } = fakeIo()
    const withManifest: SkillSyncIo = {
      ...io,
      readBundled: async () => [
        { path: 'SKILL.md', text: '#' },
        { path: 'package.json', text: '{"dependencies":{"ajv":"^8.17.1"}}' },
        { path: 'package-lock.json', text: '{}' },
      ],
    }
    await syncBundledSkills('/proj', withManifest, ['glossary-term-register'])
    expect(written.map((w) => w.path)).toContain(
      '/proj/.claude/skills/glossary-term-register/package.json',
    )
    expect(written.map((w) => w.path)).toContain(
      '/proj/.claude/skills/glossary-term-register/package-lock.json',
    )
  })
})

describe('shouldSyncSkillFile', () => {
  it('evals/ 配下は同期しない', () => {
    expect(shouldSyncSkillFile('evals/evals.json')).toBe(false)
    expect(shouldSyncSkillFile('evals/fixtures/existing-project/用語集.json')).toBe(false)
    expect(shouldSyncSkillFile('evals/grade.mjs')).toBe(false)
  })

  it('.gitignore は同期する（allow_skill_dir が literal 許可する前提。npm install の残骸で利用者の git status を汚さないため）', () => {
    expect(shouldSyncSkillFile('.gitignore')).toBe(true)
  })

  it('**package.json は同期する**（`ajv` を宣言する実行時マニフェスト）', () => {
    // 書き出しスクリプトは `require("ajv/dist/2020.js")` を通る。SKILL.md は
    // 利用者に「Skill ディレクトリで npm install」と指示するので、置いた先に
    // マニフェストが無いと `npm install` が何もインストールせず、
    // 「ajv が見つかりません」から抜けられない（レビュー指摘）
    expect(shouldSyncSkillFile('package.json')).toBe(true)
    expect(shouldSyncSkillFile('package-lock.json')).toBe(true)
  })

  it('node_modules/ 配下は同期しない（Skill が npm install したもの）', () => {
    expect(shouldSyncSkillFile('node_modules')).toBe(false)
    expect(shouldSyncSkillFile('node_modules/ajv/package.json')).toBe(false)
    // 実機で `allow-write-text-file` の許可スコープ外として書き込みに失敗した実例
    expect(shouldSyncSkillFile('node_modules/json-schema-traverse/.eslintrc.yml')).toBe(false)
  })

  it('名前が node_modules を含むだけの別ディレクトリは同期する（文字列の前方一致ではなくパス区切りで判定する）', () => {
    expect(shouldSyncSkillFile('node_modules_backup/README.md')).toBe(true)
  })

  it('SKILL.md と scripts/*.mjs は同期する', () => {
    expect(shouldSyncSkillFile('SKILL.md')).toBe(true)
    expect(shouldSyncSkillFile('scripts/glossary-write.mjs')).toBe(true)
  })

  it('references/ のような未知のディレクトリは同期する（除外リスト方式である固定）', () => {
    expect(shouldSyncSkillFile('references/style.md')).toBe(true)
    expect(shouldSyncSkillFile('assets/logo.png')).toBe(true)
  })
})

describe('isRemovableSkillEntry', () => {
  it('node_modules は消さない（同期でも置き直さないので、消したら復元されない）', () => {
    expect(isRemovableSkillEntry('node_modules')).toBe(false)
  })

  it('package-lock.json は消さない（ユーザーの npm install の成果物。消すとロック無しで解決し直される）', () => {
    expect(isRemovableSkillEntry('package-lock.json')).toBe(false)
  })

  it('それ以外は消す（更新でファイルが減ったときに古いものを取り残さない）', () => {
    expect(isRemovableSkillEntry('SKILL.md')).toBe(true)
    // facet が置くもの（package.json も置く）は、facet が消してよい
    expect(isRemovableSkillEntry('package.json')).toBe(true)
    expect(isRemovableSkillEntry('scripts')).toBe(true)
    expect(isRemovableSkillEntry('references')).toBe(true)
    // evals は同期しないので、プロジェクト側に残っているなら以前の版の facet が
    // 置いた古いものである。消してよい
    expect(isRemovableSkillEntry('evals')).toBe(true)
    // .gitignore は facet が置くもの（同期する）なので、facet が消してよい。
    // mac の削除も `allow_skill_dir` の literal 許可（`src-tauri/src/lib.rs`）で
    // 通る——消せなくても置き直しは続く（syncBundledSkills 側で握る）
    expect(isRemovableSkillEntry('.gitignore')).toBe(true)
  })

  it('名前が node_modules を含むだけの別ディレクトリは消す', () => {
    expect(isRemovableSkillEntry('node_modules_backup')).toBe(true)
  })
})

describe('shouldDescendSkillDir', () => {
  it('node_modules へは降りない（読む前に除外する。読んでから捨てるのではない）', () => {
    expect(shouldDescendSkillDir('node_modules')).toBe(false)
  })
  it('それ以外のディレクトリへは降りる', () => {
    expect(shouldDescendSkillDir('scripts')).toBe(true)
    expect(shouldDescendSkillDir('schemas')).toBe(true)
  })
})

describe('BUNDLED_SKILLS', () => {
  it('ユーザーのデータを作る Skill が5本とも載っている', () => {
    // アプリが置き直さない Skill は、プロジェクトフォルダで claude を起動した
    // ユーザーには存在しない。ここから漏れると Skill が黙って使えなくなる
    expect([...BUNDLED_SKILLS]).toEqual([
      'glossary-term-register',
      'error-catalog-register',
      'sequence-register',
      'issue-tree-register',
      'logic-tree-register',
    ])
  })

  it('アプリ自身のソースを触る Skill は載せない（palette-retheme）', () => {
    // 配色差し替えは facet リポジトリで動かすもので、ユーザーのプロジェクトには不要
    expect(BUNDLED_SKILLS).not.toContain('palette-retheme')
  })
})
