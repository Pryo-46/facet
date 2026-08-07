import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnyToolModule } from './registry'
import { createAutoSaver } from './autosave'
import { canCreateFileOfType, createFile, ensureFileOfType, trashFile } from './file-ops'
import { glossaryModule } from '@/modules/glossary/module'

/** singleton でないモジュールの最小形（registry.test.ts の fakeModule 相当） */
function nonSingletonModule(type: string): AnyToolModule {
  return {
    type,
    displayName: type,
    schemaVersion: 1,
    schema: {},
    idPrefixes: [],
    Editor: () => null,
    checkConsistency: () => [],
    singleton: false,
    migrate: (d) => d,
    createEmpty: () => ({}),
  }
}

const join = async (dir: string, name: string) => `${dir}\\${name}`

describe('createFile', () => {
  it('正規形のテキストを衝突しないパスへ書く', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const created = await createFile({
      dir: 'C:\\proj',
      module: glossaryModule,
      existingNames: ['用語集.json'],
      join,
      write,
    })
    expect(created.path).toBe('C:\\proj\\用語集-2.json')
    expect(created.name).toBe('用語集-2.json')
    expect(write).toHaveBeenCalledWith('C:\\proj\\用語集-2.json', created.text)
    expect(created.text.endsWith('\n')).toBe(true)
  })

  it('書き込みが失敗したら例外を投げる（呼び出し側が一覧に足さないため）', async () => {
    const write = vi.fn().mockRejectedValue(new Error('書けません'))
    await expect(
      createFile({ dir: 'C:\\proj', module: glossaryModule, existingNames: [], join, write }),
    ).rejects.toThrow('書けません')
  })
})

/** 解決タイミングを外から握る write を作る（in-flight 状態を作るため） */
function deferredWrite() {
  let settle!: (err?: unknown) => void
  let settled = false
  const calls: string[] = []
  const write = vi.fn(
    (text: string) =>
      new Promise<void>((resolve, reject) => {
        calls.push(text)
        settle = (err) => {
          settled = true
          if (err === undefined) resolve()
          else reject(err)
        }
      }),
  )
  return {
    write,
    calls,
    settle: (err?: unknown) => settle(err),
    get settled() {
      return settled
    },
  }
}

describe('trashFile', () => {
  // 失敗時に偽タイマーを残さない（後続ファイルのテストを巻き込むため）
  afterEach(() => {
    vi.useRealTimers()
  })

  it('自動保存を破棄してからゴミ箱へ移す（dispose が先なので flush は何も書かない）', async () => {
    const order: string[] = []
    const saver = {
      flush: vi.fn(async () => {
        order.push('flush')
        return true
      }),
      dispose: vi.fn(() => order.push('dispose')),
    }
    const trash = vi.fn(async () => {
      order.push('trash')
    })
    await trashFile({ path: 'C:\\proj\\用語集.json', saver, trash })
    // dispose が先。pending を消してから flush するので「書き戻して復活」は起きない。
    // flush は進行中の write の完了を待つためだけに呼ぶ（書くためではない）。
    // 2度目の dispose は、失敗した write が catch で復元した pending を捨てるため
    // ゴミ箱へ移すのは常に最後。先に移すと直後のデバウンス発火で同じことが起きる
    expect(order).toEqual(['dispose', 'flush', 'dispose', 'trash'])
  })

  it('進行中の write が着地するまでゴミ箱へ移さない（実物の AutoSaver と合成）', async () => {
    vi.useFakeTimers()
    const io = deferredWrite()
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write: io.write })
    saver.update('B')
    // デバウンスを発火させて write('B') を飛ばす（確認ダイアログを開いて押す間に
    // 500ms は必ず過ぎるので、削除確定時はほぼ常にこの状態になる）
    await vi.advanceTimersByTimeAsync(500)
    expect(io.calls).toEqual(['B'])
    expect(io.settled).toBe(false)

    let inFlightAtTrash: boolean | null = null
    const trash = vi.fn(async () => {
      inFlightAtTrash = !io.settled
    })
    const trashing = trashFile({ path: 'C:\\proj\\用語集.json', saver, trash })
    // write が着地していないうちは trash へ進まない（進むと、後から着地した
    // write が消したはずのファイルを作り直す＝孤児ファイルになる）
    await vi.advanceTimersByTimeAsync(0)
    expect(trash).not.toHaveBeenCalled()

    io.settle()
    await trashing
    expect(trash).toHaveBeenCalledTimes(1)
    expect(inFlightAtTrash).toBe(false)
    // dispose 済みなので、待っている間に追加の書き込みは起きない
    expect(io.calls).toEqual(['B'])
  })

  it('進行中の write が失敗しても、復元された pending を書き残さない', async () => {
    vi.useFakeTimers()
    const io = deferredWrite()
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write: io.write })
    saver.update('B')
    await vi.advanceTimersByTimeAsync(500)
    expect(io.calls).toEqual(['B'])

    const trash = vi.fn(async () => {})
    const trashing = trashFile({ path: 'C:\\proj\\用語集.json', saver, trash })
    io.settle(new Error('disk full'))
    await trashing
    expect(trash).toHaveBeenCalledTimes(1)
    // autosave の catch は失敗内容を pending に復元する。trashFile 側の2度目の
    // dispose がそれを捨てるので、後続の flush が消したファイルを書き戻さない
    await expect(saver.flush()).resolves.toBe(true)
    expect(io.calls).toEqual(['B'])
  })

  it('開いていないファイルなら saver は null でよい', async () => {
    const trash = vi.fn().mockResolvedValue(undefined)
    await trashFile({ path: 'C:\\proj\\メモ.json', saver: null, trash })
    expect(trash).toHaveBeenCalledWith('C:\\proj\\メモ.json')
  })

  it('ゴミ箱への移動が失敗したら例外を投げる', async () => {
    const trash = vi.fn().mockRejectedValue(new Error('ロックされています'))
    await expect(trashFile({ path: 'C:\\proj\\a.json', saver: null, trash })).rejects.toThrow(
      'ロックされています',
    )
  })
})

describe('ensureFileOfType', () => {
  const files = [
    { path: 'C:\\proj\\メモ.json', name: 'メモ.json', type: null },
    { path: 'C:\\proj\\語彙.json', name: '語彙.json', type: 'glossary' },
  ]

  it('既にあれば作らずそのパスを返す（ファイル名では探さない）', async () => {
    const write = vi.fn()
    const result = await ensureFileOfType({ dir: 'C:\\proj', module: glossaryModule, files, join, write })
    expect(result).toEqual({ path: 'C:\\proj\\語彙.json', created: null })
    expect(write).not.toHaveBeenCalled()
  })

  it('無ければ作る（用語集0個は正常な状態。初回登録時に自動生成する）', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const result = await ensureFileOfType({
      dir: 'C:\\proj',
      module: glossaryModule,
      files: [files[0]],
      join,
      write,
    })
    expect(result.path).toBe('C:\\proj\\用語集.json')
    expect(result.created?.name).toBe('用語集.json')
    expect(write).toHaveBeenCalledTimes(1)
  })
})

describe('canCreateFileOfType', () => {
  it('singleton でないモジュールは既存件数によらず常に作れる', () => {
    const module = nonSingletonModule('memo')
    expect(canCreateFileOfType(module, [])).toBe(true)
    expect(canCreateFileOfType(module, ['memo', 'memo'])).toBe(true)
  })

  it('singleton モジュールは同じ type が無ければ作れる', () => {
    expect(canCreateFileOfType(glossaryModule, [])).toBe(true)
    expect(canCreateFileOfType(glossaryModule, ['memo', null])).toBe(true)
  })

  it('singleton モジュールは同じ type が既にあれば作れない', () => {
    expect(canCreateFileOfType(glossaryModule, ['glossary'])).toBe(false)
  })

  it('開けない（rejected/listOnly）用語集も1件として数える——単一性は「type: glossary が2件以上」という物理条件で、壊れた用語集も対象に含まれる（M2 で確定）', () => {
    // classifyFile は rejected/listOnly でも type を読めれば type を返す（load.ts）。
    // 例: スキーマ検証に失敗した（rejected）用語集が1つだけある状態
    const existingTypes: (string | null)[] = ['glossary']
    expect(canCreateFileOfType(glossaryModule, existingTypes)).toBe(false)
  })

  it('type を読めなかったファイル（null）は無視する', () => {
    expect(canCreateFileOfType(glossaryModule, [null, null])).toBe(true)
  })
})
