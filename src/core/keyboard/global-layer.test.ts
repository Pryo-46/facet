// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isOutsideGlobalLayer } from './global-layer'

describe('isOutsideGlobalLayer', () => {
  it('端末ペインが無ければ常に false（誰も管轄外ではない）', () => {
    expect(isOutsideGlobalLayer(document.createElement('div'), null)).toBe(false)
  })

  it('端末ペインの中の要素は管轄外', () => {
    const pane = document.createElement('div')
    const inner = document.createElement('textarea')
    pane.appendChild(inner)
    expect(isOutsideGlobalLayer(inner, pane)).toBe(true)
  })

  it('端末ペインそのものも管轄外', () => {
    const pane = document.createElement('div')
    expect(isOutsideGlobalLayer(pane, pane)).toBe(true)
  })

  it('端末ペインの外の要素は管轄内', () => {
    const pane = document.createElement('div')
    expect(isOutsideGlobalLayer(document.createElement('input'), pane)).toBe(false)
  })

  it('Node でない target は管轄内として扱う', () => {
    const pane = document.createElement('div')
    expect(isOutsideGlobalLayer(null, pane)).toBe(false)
    expect(isOutsideGlobalLayer(window, pane)).toBe(false)
  })
})
