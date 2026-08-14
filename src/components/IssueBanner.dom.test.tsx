// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ConsistencyIssue } from '@/core/consistency'
import { IssueBanner, ISSUE_PREVIEW_COUNT } from './IssueBanner'

afterEach(cleanup)

const issues = (n: number): ConsistencyIssue[] =>
  Array.from({ length: n }, (_, i) => ({
    rule: `rule-${i}`,
    message: `指摘${i + 1}`,
    locations: [],
  }))

describe('IssueBanner', () => {
  it('0件なら何も描かない（面だけが残らない）', () => {
    const { container } = render(<IssueBanner issues={[]} />)
    expect(container.firstChild).toBe(null)
  })

  it(`${ISSUE_PREVIEW_COUNT}件までは全部出し、開閉のボタンを出さない`, () => {
    render(<IssueBanner issues={issues(ISSUE_PREVIEW_COUNT)} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(ISSUE_PREVIEW_COUNT)
    expect(screen.queryByRole('button')).toBe(null)
  })

  it('超えたぶんは畳み、残りの件数を言う', () => {
    render(<IssueBanner issues={issues(7)} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(ISSUE_PREVIEW_COUNT)
    // 「畳まれている」ことに気づけるよう件数を出す
    expect(screen.getByRole('button', { name: '他 4 件を表示' })).toBeTruthy()
    expect(screen.queryByText('指摘7')).toBe(null)
  })

  it('展開すると全件出て、折りたたみへ戻せる', () => {
    render(<IssueBanner issues={issues(7)} />)
    fireEvent.click(screen.getByRole('button', { name: '他 4 件を表示' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByText('指摘7')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '折りたたむ' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(ISSUE_PREVIEW_COUNT)
  })

  it('置き場所は呼び出し側が決める（className を通す）', () => {
    const { container } = render(<IssueBanner issues={issues(1)} className="shrink-0" />)
    expect((container.firstChild as HTMLElement).className).toContain('shrink-0')
  })
})
