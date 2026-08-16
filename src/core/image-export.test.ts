// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

const toBlob = vi.fn<(node: HTMLElement, options: unknown) => Promise<Blob | null>>()
vi.mock('html-to-image', () => ({ toBlob }))

const { captureImagePng } = await import('./image-export')

function makeLayers() {
  const root = document.createElement('div')
  const bg = document.createElement('div')
  bg.style.transform = 'translate(40px, 40px) scale(1.5)'
  const nodes = document.createElement('div')
  nodes.style.transform = 'translate(40px, 40px) scale(1.5)'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  g.setAttribute('transform', 'translate(40,40) scale(1.5)')
  svg.appendChild(g)
  root.append(bg, nodes, svg)
  document.body.appendChild(root)
  return { root, cssLayers: [bg, nodes], svgLayers: [g] }
}

describe('captureImagePng', () => {
  it('キャプチャ中だけ transform を単位行列にし、完了後に元へ戻す', async () => {
    const layers = makeLayers()
    let sawDuringCapture: { css: string[]; svg: (string | null)[] } | null = null
    toBlob.mockImplementation(async () => {
      sawDuringCapture = {
        css: layers.cssLayers.map((el) => el.style.transform),
        svg: layers.svgLayers.map((el) => el.getAttribute('transform')),
      }
      return new Blob([new Uint8Array([1, 2, 3])])
    })

    await captureImagePng(layers)

    expect(sawDuringCapture).toEqual({
      css: ['translate(0px, 0px) scale(1)', 'translate(0px, 0px) scale(1)'],
      svg: ['translate(0,0) scale(1)'],
    })
    expect(layers.cssLayers.map((el) => el.style.transform)).toEqual([
      'translate(40px, 40px) scale(1.5)',
      'translate(40px, 40px) scale(1.5)',
    ])
    expect(layers.svgLayers.map((el) => el.getAttribute('transform'))).toEqual([
      'translate(40,40) scale(1.5)',
    ])
  })

  it('toBlob が例外を投げても transform を元に戻す', async () => {
    const layers = makeLayers()
    toBlob.mockRejectedValue(new Error('canvas failed'))

    await expect(captureImagePng(layers)).rejects.toThrow('canvas failed')

    expect(layers.cssLayers[0].style.transform).toBe('translate(40px, 40px) scale(1.5)')
    expect(layers.svgLayers[0].getAttribute('transform')).toBe('translate(40,40) scale(1.5)')
  })

  it('PNGバイト列を返す', async () => {
    const layers = makeLayers()
    toBlob.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])]))

    const bytes = await captureImagePng(layers)

    expect(Array.from(bytes)).toEqual([1, 2, 3])
  })

  it('toBlob が null を返したら例外を投げる', async () => {
    const layers = makeLayers()
    toBlob.mockResolvedValue(null)

    await expect(captureImagePng(layers)).rejects.toThrow('画像の生成に失敗しました')
  })

  it('excludeRoles に含まれる data-export-role を持つ要素を filter で除外する', async () => {
    const layers = makeLayers()
    let capturedFilter: ((node: Element) => boolean) | null = null
    toBlob.mockImplementation(async (_node, options) => {
      capturedFilter = (options as { filter: (node: Element) => boolean }).filter
      return new Blob([new Uint8Array([1])])
    })

    await captureImagePng(layers, { excludeRoles: ['gutter'] })

    const gutterEl = document.createElement('div')
    gutterEl.setAttribute('data-export-role', 'gutter')
    const plainEl = document.createElement('div')
    const textNode = document.createTextNode('x')
    expect(capturedFilter!(gutterEl)).toBe(false)
    expect(capturedFilter!(plainEl)).toBe(true)
    // html-to-image は DOM ツリーを歩く際に Text ノードにも filter を呼ぶ。
    // getAttribute を持たないので、除外対象として扱わず true を返す必要がある
    expect(capturedFilter!(textNode as unknown as Element)).toBe(true)
  })

  it('transform 属性が元々無かった svgLayer は、復元後も属性なしのままにする', async () => {
    const layers = makeLayers()
    layers.svgLayers[0].removeAttribute('transform')
    toBlob.mockResolvedValue(new Blob([new Uint8Array([1])]))

    await captureImagePng(layers)

    expect(layers.svgLayers[0].hasAttribute('transform')).toBe(false)
  })

  it('scrollWidth/scrollHeight は transform を単位行列にリセットした後に測って toBlob に渡す', async () => {
    const layers = makeLayers()
    Object.defineProperty(layers.root, 'scrollWidth', {
      configurable: true,
      get: () => (layers.cssLayers[0].style.transform === 'translate(0px, 0px) scale(1)' ? 900 : 100),
    })
    Object.defineProperty(layers.root, 'scrollHeight', {
      configurable: true,
      get: () => (layers.cssLayers[0].style.transform === 'translate(0px, 0px) scale(1)' ? 600 : 100),
    })
    let capturedOptions: { width: number; height: number } | null = null
    toBlob.mockImplementation(async (_node, options) => {
      capturedOptions = options as { width: number; height: number }
      return new Blob([new Uint8Array([1])])
    })

    await captureImagePng(layers)

    expect(capturedOptions).toEqual(expect.objectContaining({ width: 900, height: 600 }))
  })
})
