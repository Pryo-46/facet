import { describe, expect, it, vi } from 'vitest'
import { createFile, ensureFileOfType, trashFile } from './file-ops'
import { glossaryModule } from '@/modules/glossary/module'

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

describe('trashFile', () => {
  it('自動保存を破棄してからゴミ箱へ移す（flush は絶対に呼ばない）', async () => {
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
    // flush すると、消したファイルを自動保存が書き戻して復活させる
    expect(saver.flush).not.toHaveBeenCalled()
    // dispose が先。後だと、ゴミ箱へ移した直後にデバウンスタイマーが発火しうる
    expect(order).toEqual(['dispose', 'trash'])
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
