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
    toMarkdown: () => '',
    singleton: false,
    migrate: (d) => d,
    createEmpty: () => ({}),
  }
}

const join = async (dir: string, name: string) => `${dir}\\${name}`
/** ディスク上に存在するパスの集合から exists を作る */
const existsIn = (paths: readonly string[]) => async (path: string) => paths.includes(path)

describe('createFile', () => {
  it('正規形のテキストを衝突しないパスへ書く', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const created = await createFile({
      dir: 'C:\\proj',
      module: glossaryModule,
      existingNames: ['用語集.json'],
      join,
      write,
      exists: existsIn([]),
    })
    expect(created.path).toBe('C:\\proj\\用語集-2.json')
    expect(created.name).toBe('用語集-2.json')
    expect(write).toHaveBeenCalledWith('C:\\proj\\用語集-2.json', created.text)
    expect(created.text.endsWith('\n')).toBe(true)
  })

  it('走査後に外部で増えたファイルを上書きしない（M4 の申し送りのデータ喪失）', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    // 一覧は空（走査時点のスナップショット）だが、ディスクには Skill が書いた
    // 用語集がある。existingNames だけで決めると、これを切り詰めて書き潰す
    const created = await createFile({
      dir: 'C:\\proj',
      module: glossaryModule,
      existingNames: [],
      join,
      write,
      exists: existsIn(['C:\\proj\\用語集.json']),
    })
    expect(created.path).toBe('C:\\proj\\用語集-2.json')
    expect(write).not.toHaveBeenCalledWith('C:\\proj\\用語集.json', expect.anything())
  })

  it('書き込みが失敗したら例外を投げる（呼び出し側が一覧に足さないため）', async () => {
    const write = vi.fn().mockRejectedValue(new Error('書けません'))
    await expect(
      createFile({
        dir: 'C:\\proj',
        module: glossaryModule,
        existingNames: [],
        join,
        write,
        exists: existsIn([]),
      }),
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

  it('自動保存を破棄してからゴミ箱へ移す（dispose が先なので settle は何も書かない）', async () => {
    const order: string[] = []
    const saver = {
      settle: vi.fn(async () => {
        order.push('settle')
      }),
      dispose: vi.fn(() => order.push('dispose')),
    }
    const trash = vi.fn(async () => {
      order.push('trash')
    })
    await trashFile({ path: 'C:\\proj\\用語集.json', saver, trash })
    // dispose が先。pending を消してから待つので「書き戻して復活」は起きない。
    // settle は進行中の write の完了を待つためだけに呼ぶ（書くためではない）。
    // 2度目の dispose は、失敗した write が catch で復元した pending を捨てるため。
    // ゴミ箱へ移すのは常に最後（先に移すと直後のデバウンス発火で同じことが起きる）
    expect(order).toEqual(['dispose', 'settle', 'dispose', 'trash'])
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
    // dispose がそれを捨てるので、後続の settle が消したファイルを書き戻さない
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
    const result = await ensureFileOfType({
      dir: 'C:\\proj',
      module: glossaryModule,
      files,
      join,
      write,
      exists: existsIn([]),
    })
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
      exists: existsIn([]),
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

  it('singleton モジュールは同じ type が既にあれば作れない——rejected/listOnly な用語集も1件として数える', () => {
    // canCreateFileOfType 自体は type の文字列しか見ない（status を受け取らない）ので、
    // rejected/listOnly の用語集も editable の用語集も、ここでは同じ 'glossary' という
    // 入力に潰れる——それが「単一性は status を問わない物理条件」（M2 で確定）の意味であり、
    // 別の入力・別の分岐が無い以上、この1テストで両方を主張する（別テストに分けると
    // 「rejected/listOnly も数える」というテスト名だけが違う実質同一テストになり、
    // 壊れていないのに壊れているように見せかける）。
    // 「files → existingTypes の derivation が rejected を落とさないか」という
    // 本当に壊れうる境界は、この関数の外側（App.tsx の existingTypes 算出）にあるので、
    // そこは src/components/FileList.dom.test.tsx の統合テストで別途固定する
    expect(canCreateFileOfType(glossaryModule, ['glossary'])).toBe(false)
  })

  it('type を読めなかったファイル（null）は無視する', () => {
    expect(canCreateFileOfType(glossaryModule, [null, null])).toBe(true)
  })
})
