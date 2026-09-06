import { describe, expect, it } from 'vitest'
import {
  READING_GUIDE_FILENAME,
  READING_GUIDE_TEXT,
  syncReadingGuide,
  type ReadingGuideIo,
} from './reading-guide'

/** 書き込みを記録する偽 I/O。disk はガイドのパスに「今あるファイルの中身」（無ければ null） */
function fakeIo(disk: string | null) {
  const writes: Array<{ path: string; text: string }> = []
  const io: ReadingGuideIo = {
    readText: async () => disk,
    writeText: async (path, text) => {
      writes.push({ path, text })
    },
    join: async (...parts) => parts.join('/'),
  }
  return { io, writes }
}

describe('syncReadingGuide', () => {
  it('ファイルが無ければ原本を書く', async () => {
    const { io, writes } = fakeIo(null)
    await syncReadingGuide('/proj', io)
    expect(writes).toEqual([{ path: `/proj/${READING_GUIDE_FILENAME}`, text: READING_GUIDE_TEXT }])
  })

  it('中身が原本と一致していれば書かない（mtime を変えない）', async () => {
    const { io, writes } = fakeIo(READING_GUIDE_TEXT)
    await syncReadingGuide('/proj', io)
    expect(writes).toEqual([])
  })

  it('中身が原本と違えば（ユーザー編集・旧版）原本で上書きする', async () => {
    // 空文字ではなく「原本＋改変」にする——空文字は「無い」と紛れ、
    // missing 分岐と区別できない退化ケースになる（lessons: 隣の実装と同じ答えになる入力を選ばない）
    const { io, writes } = fakeIo(READING_GUIDE_TEXT + '\nユーザーの追記')
    await syncReadingGuide('/proj', io)
    expect(writes).toEqual([{ path: `/proj/${READING_GUIDE_FILENAME}`, text: READING_GUIDE_TEXT }])
  })
})

describe('READING_GUIDE_TEXT', () => {
  it('先頭に自動管理の注意書きがある（スペック設計2）', () => {
    // ガイド全文はテストで固定しない（本文は実機での試行で剪定され続ける）。
    // 固定するのは「上書きされる」という契約の告知だけ
    expect(READING_GUIDE_TEXT.slice(0, 500)).toContain('facet が自動で管理する')
  })

  it('ファイル名は README-for-AI.md（スペック設計1）', () => {
    expect(READING_GUIDE_FILENAME).toBe('README-for-AI.md')
  })
})
