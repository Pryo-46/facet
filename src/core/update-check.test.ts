import { describe, expect, it } from 'vitest'
import {
  buttonLabel,
  canCheck,
  failed,
  foundNone,
  foundUpdate,
  initialUpdateState,
  isEmphasized,
  progress,
  startCheck,
  startInstall,
} from '@/core/update-check'

describe('チェックの開始', () => {
  it('idle から checking へ入る', () => {
    expect(startCheck(initialUpdateState)).toEqual({ kind: 'checking' })
  })

  it('error からやり直せる', () => {
    expect(startCheck({ kind: 'error', message: '繋がらない' })).toEqual({ kind: 'checking' })
  })

  it('**checking 中の要求は無視する**（同じ state をそのまま返す）', () => {
    // 手動ボタンの連打と起動時チェックが重なりうる。参照ごと同じものを返して
    // React の再描画も起こさない
    const state = startCheck(initialUpdateState)
    expect(startCheck(state)).toBe(state)
  })

  it('**installing 中の要求は無視する**', () => {
    const state = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    expect(startCheck(state)).toBe(state)
  })
})

describe('チェックの結果', () => {
  it('checking から available へ入る', () => {
    expect(foundUpdate(startCheck(initialUpdateState), '1.2.3')).toEqual({
      kind: 'available',
      version: '1.2.3',
    })
  })

  it('checking から none へ入る', () => {
    expect(foundNone(startCheck(initialUpdateState))).toEqual({ kind: 'none' })
  })

  it('**checking でないときの結果は捨てる**', () => {
    // 「常に available にする」実装と区別するための検査。遅れて届いた
    // チェック結果が installing を巻き戻さないことを守る
    const installing = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    expect(foundUpdate(installing, '9.9.9')).toBe(installing)
    expect(foundNone(installing)).toBe(installing)
  })
})

describe('インストール', () => {
  it('available からだけ installing へ入る', () => {
    const available = foundUpdate(startCheck(initialUpdateState), '1.2.3')
    expect(startInstall(available)).toEqual({
      kind: 'installing',
      version: '1.2.3',
      downloaded: 0,
      total: null,
    })
    expect(startInstall(initialUpdateState)).toBe(initialUpdateState)
    expect(startInstall({ kind: 'none' })).toEqual({ kind: 'none' })
  })

  it('**進捗は積み上がる**', () => {
    // チャンクの大きさを変えてあるのは、「合計する」実装と「最後のチャンクを
    // そのまま入れる」実装を区別するため。同じ値を2回足すと両者が一致する
    let state = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    state = progress(state, 0, 8000)
    state = progress(state, 1000, 8000)
    state = progress(state, 2500, 8000)
    expect(state).toEqual({
      kind: 'installing',
      version: '1.2.3',
      downloaded: 3500,
      total: 8000,
    })
  })

  it('総量が分からないままでも進捗を積める', () => {
    let state = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    state = progress(state, 1000, null)
    state = progress(state, 2500, null)
    expect(state).toEqual({
      kind: 'installing',
      version: '1.2.3',
      downloaded: 3500,
      total: null,
    })
  })

  it('**一度分かった総量は null で上書きしない**', () => {
    let state = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    state = progress(state, 0, 8000)
    state = progress(state, 1000, null)
    expect(state).toEqual({
      kind: 'installing',
      version: '1.2.3',
      downloaded: 1000,
      total: 8000,
    })
  })

  it('installing でないときの進捗は捨てる', () => {
    expect(progress(initialUpdateState, 1000, 8000)).toBe(initialUpdateState)
  })
})

describe('失敗', () => {
  it('checking からも installing からも error へ抜ける', () => {
    expect(failed(startCheck(initialUpdateState), '繋がらない')).toEqual({
      kind: 'error',
      message: '繋がらない',
    })
    const installing = startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))
    expect(failed(installing, '書き込めない')).toEqual({
      kind: 'error',
      message: '書き込めない',
    })
  })

  it('動いていないときの失敗は捨てる', () => {
    expect(failed(initialUpdateState, '繋がらない')).toBe(initialUpdateState)
  })
})

describe('ボタンの見え方', () => {
  it('動いている間は押せない', () => {
    expect(canCheck(initialUpdateState)).toBe(true)
    expect(canCheck({ kind: 'none' })).toBe(true)
    expect(canCheck({ kind: 'error', message: 'x' })).toBe(true)
    expect(canCheck(foundUpdate(startCheck(initialUpdateState), '1.2.3'))).toBe(true)
    expect(canCheck(startCheck(initialUpdateState))).toBe(false)
    expect(
      canCheck(startInstall(foundUpdate(startCheck(initialUpdateState), '1.2.3'))),
    ).toBe(false)
  })

  it('新版があるときだけ版番号を名乗り、強調する', () => {
    const available = foundUpdate(startCheck(initialUpdateState), '1.2.3')
    expect(buttonLabel(available)).toBe('v1.2.3 に更新')
    expect(isEmphasized(available)).toBe(true)

    expect(buttonLabel(initialUpdateState)).toBe('更新を確認')
    expect(buttonLabel({ kind: 'none' })).toBe('更新を確認')
    expect(buttonLabel({ kind: 'error', message: 'x' })).toBe('更新を確認')
    expect(buttonLabel(startCheck(initialUpdateState))).toBe('更新を確認')
    expect(buttonLabel(startInstall(available))).toBe('更新中')

    expect(isEmphasized(initialUpdateState)).toBe(false)
    expect(isEmphasized(startInstall(available))).toBe(false)
  })
})
