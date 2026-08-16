# M18 画像出力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** シーケンス図・ロジックツリーの図を「画像コピー」「画像で保存」できるようにする。シーケンス図のみ、ガター（問い）を含める/含めないを都度選べる。

**Architecture:** `html-to-image` でDOM（HTML＋SVGのハイブリッド描画）をそのままPNG化する。既存の「コアはTauri/Reactを知らない」構造を踏襲し、DOM実測に依存するキャプチャ処理は `core/image-export.ts`（DOM要素は受け取るがReact/Tauriには依存しない）に置き、Tauri副作用（クリップボード書き込み・ファイル保存）は `fs/` 層、オーケストレーション（成功/失敗の表示・ダイアログ呼び出しの順序）は `App.tsx` に直接書く（`core/app-controller.ts` は拡張しない——DOM要素を引数に取らせると「Reactを知らない」原則を破るため）。

**Tech Stack:** React 19 / TypeScript / Tauri v2 / `html-to-image`（新規依存）/ `@tauri-apps/plugin-clipboard-manager` / `@tauri-apps/plugin-fs` / `@tauri-apps/api/image`

**Spec:** [`2026-08-16-m18-image-export-design.md`](2026-08-16-m18-image-export-design.md)

## Global Constraints

- PNGのみ（他形式は作らない）
- 図全体（パン/ズーム範囲外も含む）を1枚に収める。表示中の範囲だけのキャプチャは作らない
- シーケンス図の「問い」を含める/含めないは都度選択（永続化しない）。ロジックツリーには選択肢を持たせない
- `core/app-controller.ts` の `AppIo`/`AppHost`/`AppController` シグネチャは変更しない（画像出力のオーケストレーションは `App.tsx` に直接書く）
- `core/image-export.ts` は `@tauri-apps/*` を import しない（コアはTauriを知らない）
- キャプチャ中に画面が一瞬「全体表示」にリセットされてから戻るちらつきは許容する（React state は変更せず、描画済みDOMのインラインスタイル/属性を一時書き換えする方式）
- transform の単位行列文字列は `sequence/viewport.ts`/`logic-tree/viewport.ts` の複製へ依存させず、`core/image-export.ts` にリテラルで持つ

---

### Task 1: 依存関係とTauri設定を追加する

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: なし
- Produces: `html-to-image` パッケージ（Task 3 が `toBlob` を import）、`clipboard-manager:allow-write-image` と `fs:allow-write-file` の実行時権限（Task 4・Task 10 が使う）、Cargo feature `image-png`（Task 4 の `Image.fromBytes` が使う）

- [ ] **Step 1: `html-to-image` を依存に追加する**

```bash
npm install html-to-image
```

Run: `npm view html-to-image version` で入ったバージョンを確認し、`package.json` の `dependencies` に `"html-to-image": "^<入ったバージョン>"` の行があることを確認する（`npm install` が自動で追記する）。

- [ ] **Step 2: `src-tauri/Cargo.toml` に `image-png` feature を足す**

`tauri = { version = "2.11.3", features = [] }` を次のように変更する：

```toml
tauri = { version = "2.11.3", features = ["image-png"] }
```

理由をコメントで残す（既存の `tauri-plugin-clipboard-manager` の依存コメントの直後に追記）：

```toml
# クリップボードへの画像書き込み（M18）。@tauri-apps/api/image の
# Image.fromBytes（png/ico のデコード）が要求する feature
```

- [ ] **Step 3: `src-tauri/capabilities/default.json` に権限を2つ追加する**

`"permissions"` 配列の末尾（`"clipboard-manager:allow-write-text"` の直後）に追加：

```json
    "clipboard-manager:allow-write-image",
    "fs:allow-write-file"
```

冒頭の `"description"` 文字列（1つの長い説明文）の末尾に、既存の文体（「〜のため（M番号）。」の連続）に合わせて一文を足す：

```
clipboard-manager:allow-write-image と fs:allow-write-file は画像コピー・画像保存のため（M18。fs:allow-write-file は writeTextFile ではなく writeFile を使うバイナリ書き込み用の別権限）。
```

- [ ] **Step 4: ビルドが通ることを確認する**

Run: `npx tsc -b`
Expected: エラー無し（この時点ではまだ `html-to-image` を import するコードが無いので、依存追加だけで壊れないことの確認）

Run: `cd src-tauri && cargo check`
Expected: `image-png` feature が解決されビルドが通る。Cargo.lock が更新される

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/capabilities/default.json
git commit -m "build(m18): html-to-image を追加し、画像出力用のTauri権限を設定する"
```

---

### Task 2: `ImageOutputProfile` を `core/registry.ts` に追加する

**Files:**
- Modify: `src/core/registry.ts`
- Modify: `src/core/registry.test.ts`
- Modify: `src/modules/glossary/module.ts`
- Modify: `src/modules/error-catalog/module.ts`
- Modify: `src/modules/logic-tree/module.ts`
- Modify: `src/modules/sequence/module.ts`

**Interfaces:**
- Consumes: なし
- Produces: `ImageOutputProfile`（`id: string`, `label: string`, `fileSuffix: string`, `excludeRoles?: readonly string[]`）、`ToolModule.imageOutputs: readonly ImageOutputProfile[]`

- [ ] **Step 1: 失敗するテストを書く（`fakeModule` に `imageOutputs` が無いと型エラーになることを先に確認する用途ではなく、既存挙動が壊れないことを確認する回帰テストを足す）**

`src/core/registry.test.ts` の `fakeModule` 関数に `imageOutputs: []` を追加する（この時点ではまだ `ToolModule` 型に `imageOutputs` が無いので、型チェックは通るが意味の無い追加になる——Step 2 で型を追加してから効いてくる）。

```ts
function fakeModule(type: string, prefixes: string[]): AnyToolModule {
  return {
    type,
    displayName: type,
    icon: () => null,
    schemaVersion: 1,
    schema: {},
    idPrefixes: prefixes,
    Editor: () => null,
    checkConsistency: () => [],
    outputs: [{ id: 'default', label: 'Markdown', fileSuffix: '', toMarkdown: () => '' }],
    imageOutputs: [],
    singleton: false,
    migrate: (d) => d,
    createEmpty: () => ({}),
  }
}
```

- [ ] **Step 2: `npx tsc -b` を実行し、`imageOutputs` が `ToolModule` に無いことによる型エラーが出ないことを確認する**

Run: `npx tsc -b`
Expected: 現時点では `imageOutputs` は `ToolModule` に存在しないプロパティなので、`fakeModule` の戻り値の型チェックでエラーにはならない（余剰プロパティは関数の戻り値型チェックでは object literal 以外だと許容される場合があるが、`fakeModule` は `AnyToolModule` を返す関数で `return { ... }` はオブジェクトリテラルなので、**この時点では逆に「型に無いプロパティ」として TS2353 エラーになる**）。

Expected: `error TS2353: Object literal may only specify known properties, and 'imageOutputs' does not exist in type 'ToolModule<any>'` が出る。これが「まだ実装していないことを示す失敗」（このタスクは型定義の追加なので、テストランナーではなく `tsc` が赤/緑を示す）。

- [ ] **Step 3: `core/registry.ts` に `ImageOutputProfile` と `imageOutputs` を追加する**

`OutputProfile` インターフェース定義の直後（`src/core/registry.ts:56` の閉じ `}` の後）に追加：

```ts
/**
 * 画像出力プロファイル（rev 8章 M18で追加）。`OutputProfile` と違い
 * **副作用を持たない純関数にはできない**——DOM実測（レイアウト後の座標・
 * フォントメトリクス）に依存するため、データから画像を導出する関数を
 * ここには持たない。実処理は `core/image-export.ts` が DOM 要素を受け取って行う
 */
export interface ImageOutputProfile {
  /** 安定識別子。UI の選択状態・テストが参照する */
  id: string
  /** ドロップダウンに出す表示名 */
  label: string
  /** 書き出しの既定ファイル名に足す接尾辞（単一プロファイルなら ''） */
  fileSuffix: string
  /** キャプチャから除外する data-export-role の値（省略時は全部含める） */
  excludeRoles?: readonly string[]
}
```

`ToolModule` インターフェースの `outputs` フィールド（`src/core/registry.ts:90` 付近）の直後に追加：

```ts
  /**
   * 画像出力プロファイル（rev 8章 M18）。**0本は「画像出力を持たないツール」
   * の状態として正しい**——`outputs` と同じ思想（額縁は0本のとき画像出力
   * ボタンを押せなくする）
   */
  imageOutputs: readonly ImageOutputProfile[]
```

- [ ] **Step 4: 4モジュールに `imageOutputs: []` を足す**

`src/modules/glossary/module.ts`・`src/modules/error-catalog/module.ts`・`src/modules/logic-tree/module.ts`・`src/modules/sequence/module.ts` それぞれの `outputs: [...]` フィールドの直後に `imageOutputs: [],` を追加する（この時点では全モジュール0本。logic-tree/sequence は Task 9 で正式な値に更新する）。

- [ ] **Step 5: 型チェックとテストを確認する**

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm test -- registry.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/registry.ts src/core/registry.test.ts src/modules/glossary/module.ts src/modules/error-catalog/module.ts src/modules/logic-tree/module.ts src/modules/sequence/module.ts
git commit -m "feat(m18): ImageOutputProfile と ToolModule.imageOutputs を追加する"
```

---

### Task 3: `core/image-export.ts` を実装する

**Files:**
- Create: `src/core/image-export.ts`
- Test: `src/core/image-export.test.ts`

**Interfaces:**
- Consumes: `html-to-image` の `toBlob`（Task 1 で追加済み）
- Produces: `CaptureLayers`（`root: HTMLElement`, `cssLayers: readonly HTMLElement[]`, `svgLayers: readonly SVGElement[]`）、`CaptureOptions`（`excludeRoles?: readonly string[]`）、`captureImagePng(layers: CaptureLayers, options?: CaptureOptions): Promise<Uint8Array>` — Task 7・8 がエディタ側で `CaptureLayers` を組み立てて渡し、Task 10 が `App.tsx` から `captureImagePng` を呼ぶ

- [ ] **Step 1: 失敗するテストを書く（transform の一時書き換えと復元）**

`src/core/image-export.test.ts` を新規作成：

```ts
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
    expect(capturedFilter?.(gutterEl)).toBe(false)
    expect(capturedFilter?.(plainEl)).toBe(true)
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `npm test -- image-export.test.ts`
Expected: FAIL（`./image-export` が存在しない）

- [ ] **Step 3: `src/core/image-export.ts` を実装する**

```ts
import { toBlob } from 'html-to-image'

/**
 * 画像キャプチャ対象のレイヤ構成（M18）。シーケンス図・ロジックツリーは
 * どちらも背景・エッジ（SVG）・ノードの3レイヤに同じ transform を掛けている
 *（`data-layer="background"|"edges"|"nodes"`）。CSS の transform を持つ層と
 * SVG の `<g transform="...">` 属性を持つ層は書き換え方が違うため分けて渡す
 */
export interface CaptureLayers {
  /** html-to-image に渡すルート要素（各エディタの containerRef） */
  root: HTMLElement
  /** style.transform を持つ DOM 要素（background・nodes レイヤ） */
  cssLayers: readonly HTMLElement[]
  /** SVG 内の `<g transform="...">` 要素（edges レイヤ） */
  svgLayers: readonly SVGElement[]
}

export interface CaptureOptions {
  /** キャプチャから除外する data-export-role の値 */
  excludeRoles?: readonly string[]
}

// cssTransform/svgTransform（sequence/logic-tree の viewport.ts に複製されている）
// には依存しない。コアが2本の複製へ依存を増やさないための選択（design spec 決定6）
const IDENTITY_CSS_TRANSFORM = 'translate(0px, 0px) scale(1)'
const IDENTITY_SVG_TRANSFORM = 'translate(0,0) scale(1)'

/**
 * 図全体を PNG バイト列としてキャプチャする。
 *
 * **transform は実DOMを直接書き換える。** html-to-image の `style` オプションは
 * キャプチャ対象のルート要素にしか効かず、子孫レイヤの transform は書き換えられない
 *（design spec 決定6）。書き換えは `toBlob` の呼び出しを挟んで必ず元に戻す
 *（`finally`）——キャプチャ中は画面が一瞬「全体表示」に見えるちらつきを許容する
 *（React state は変更しないので d3-zoom の内部状態とはズレない）。
 *
 * **サイズは `root.scrollWidth`/`scrollHeight` で実測する。** `layout.totalWidth`/
 * `totalHeight` の帳簿値は実際の描画より小さいことが分かっている
 *（open-issues の帳簿ずれ）。`overflow: hidden` な要素でも `scrollWidth`/
 * `scrollHeight` は中身の実サイズを返すので、transform をリセットした状態で
 * 読めば図全体のサイズが取れる。`chrome`（編集用UI）を除外指定していても、
 * `filter` は画像に描かないだけでキャンバスサイズには反映されない——
 * その分の余白が残ることがあるが、要素が切れるよりましなので許容する
 */
export async function captureImagePng(
  layers: CaptureLayers,
  options: CaptureOptions = {},
): Promise<Uint8Array> {
  const excludeRoles = new Set(options.excludeRoles ?? [])
  const cssOriginal = layers.cssLayers.map((el) => el.style.transform)
  const svgOriginal = layers.svgLayers.map((el) => el.getAttribute('transform'))

  for (const el of layers.cssLayers) el.style.transform = IDENTITY_CSS_TRANSFORM
  for (const el of layers.svgLayers) el.setAttribute('transform', IDENTITY_SVG_TRANSFORM)

  try {
    const width = layers.root.scrollWidth
    const height = layers.root.scrollHeight
    const blob = await toBlob(layers.root, {
      width,
      height,
      style: { overflow: 'visible' },
      filter: (node) => {
        const role = node.getAttribute('data-export-role')
        return role === null || !excludeRoles.has(role)
      },
    })
    if (blob === null) throw new Error('画像の生成に失敗しました')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    layers.cssLayers.forEach((el, i) => {
      el.style.transform = cssOriginal[i]
    })
    layers.svgLayers.forEach((el, i) => {
      const original = svgOriginal[i]
      if (original === null) el.removeAttribute('transform')
      else el.setAttribute('transform', original)
    })
  }
}
```

- [ ] **Step 4: テストを実行し、パスすることを確認する**

Run: `npm test -- image-export.test.ts`
Expected: PASS（5件）

- [ ] **Step 5: 型チェック**

Run: `npx tsc -b`
Expected: エラー無し

- [ ] **Step 6: Commit**

```bash
git add src/core/image-export.ts src/core/image-export.test.ts
git commit -m "feat(m18): core/image-export.ts でtransform一時書き換え+PNGキャプチャを実装する"
```

---

### Task 4: `fs/clipboard.ts` に画像コピーを追加する

**Files:**
- Modify: `src/fs/clipboard.ts`
- Modify: `src/fs/clipboard.test.ts`

**Interfaces:**
- Consumes: `@tauri-apps/plugin-clipboard-manager` の `writeImage`、`@tauri-apps/api/image` の `Image.fromBytes`
- Produces: `copyImageToClipboard(pngBytes: Uint8Array): Promise<void>` — Task 10 の `App.tsx` が呼ぶ

- [ ] **Step 1: 失敗するテストを書く**

`src/fs/clipboard.test.ts` に追記：

```ts
const writeImage = vi.fn<(image: unknown) => Promise<void>>()
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText, writeImage }))

const fromBytes = vi.fn<(bytes: Uint8Array) => Promise<{ __brand: 'Image' }>>()
vi.mock('@tauri-apps/api/image', () => ({ Image: { fromBytes } }))

const { copyImageToClipboard } = await import('./clipboard')

describe('copyImageToClipboard', () => {
  beforeEach(() => {
    writeImage.mockReset()
    fromBytes.mockReset()
  })

  it('PNGバイト列を Image.fromBytes でデコードしてから writeImage へ渡す', async () => {
    const decoded = { __brand: 'Image' as const }
    fromBytes.mockResolvedValue(decoded)
    writeImage.mockResolvedValue(undefined)

    const bytes = new Uint8Array([137, 80, 78, 71])
    await copyImageToClipboard(bytes)

    expect(fromBytes).toHaveBeenCalledWith(bytes)
    expect(writeImage).toHaveBeenCalledWith(decoded)
  })

  it('失敗はそのまま投げる（呼び出し側がバナーを出す）', async () => {
    fromBytes.mockRejectedValue(new Error('decode failed'))
    await expect(copyImageToClipboard(new Uint8Array([1]))).rejects.toThrow('decode failed')
  })
})
```

冒頭の `vi.mock('@tauri-apps/plugin-clipboard-manager', ...)` は既存の1つと重複するため、既存の1行（`vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText }))`）を書き換えて `writeImage` を同じモックオブジェクトに含める形にする（ファイル内で同じモジュールを2回 `vi.mock` しない）。

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `npm test -- clipboard.test.ts`
Expected: FAIL（`copyImageToClipboard` が存在しない）

- [ ] **Step 3: `src/fs/clipboard.ts` に実装を追加する**

```ts
import { writeImage, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { Image } from '@tauri-apps/api/image'
```

（既存の `import { writeText } from '@tauri-apps/plugin-clipboard-manager'` を上記に置き換える）

ファイル末尾に追加：

```ts
/**
 * PNGバイト列をクリップボードへ画像として書く（M18）。
 *
 * **`writeImage` に生のPNGバイト列をそのまま渡さない。** プラグインの
 * `writeImage` は生RGBAの `number[]`（例: `[255,0,0,255, ...]`）を渡す使い方が
 * 例示されており、エンコード済みPNGをそのまま渡した場合の解釈は未定義。
 * `@tauri-apps/api/image` の `Image.fromBytes` は「png/icoのバイト列を
 * フォーマット推測してデコードする」ことがドキュメントに明記されているので、
 * 必ずこちらを経由する（`src-tauri/Cargo.toml` の `image-png` feature が要る。Task 1）
 */
export async function copyImageToClipboard(pngBytes: Uint8Array): Promise<void> {
  const image = await Image.fromBytes(pngBytes)
  await writeImage(image)
}
```

- [ ] **Step 4: テストを実行し、パスすることを確認する**

Run: `npm test -- clipboard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/fs/clipboard.ts src/fs/clipboard.test.ts
git commit -m "feat(m18): クリップボードへの画像コピーを追加する"
```

---

### Task 5: `fs/project-fs.ts` に画像保存を追加する

**Files:**
- Modify: `src/fs/project-fs.ts`
- Test: `src/fs/project-fs.test.ts`

**Interfaces:**
- Consumes: `@tauri-apps/plugin-dialog` の `save`、`@tauri-apps/plugin-fs` の `writeFile`
- Produces: `askSaveImagePath(defaultPath: string): Promise<string | null>`、`writeProjectImageFile(path: string, bytes: Uint8Array): Promise<void>` — Task 10 の `App.tsx` が呼ぶ

- [ ] **Step 1: 既存テストファイルの構造を確認する**

`src/fs/project-fs.test.ts` を読み、既存の `askSaveMarkdownPath`/`writeProjectFile` のテストがどのモック（`@tauri-apps/plugin-dialog`・`@tauri-apps/plugin-fs`）を使っているかを確認してから、同じモックに `writeFile` を追加する形でテストを足す（既存のモック変数名・`vi.mock` 呼び出し箇所を流用し、二重に `vi.mock` しない）。

- [ ] **Step 2: 失敗するテストを書く**

`src/fs/project-fs.test.ts` に追記（`writeTextFile` 等をモックしている既存の `vi.mock('@tauri-apps/plugin-fs', ...)` に `writeFile` を足し、`save` をモックしている既存の `vi.mock('@tauri-apps/plugin-dialog', ...)` はそのまま流用）：

```ts
describe('askSaveImagePath', () => {
  it('PNGフィルタで保存ダイアログを呼ぶ', async () => {
    save.mockResolvedValue('/project/diagram.png')
    const result = await askSaveImagePath('/project/diagram.png')
    expect(result).toBe('/project/diagram.png')
    expect(save).toHaveBeenCalledWith({
      defaultPath: '/project/diagram.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
    })
  })

  it('キャンセルは null', async () => {
    save.mockResolvedValue(null)
    expect(await askSaveImagePath('/project/diagram.png')).toBeNull()
  })
})

describe('writeProjectImageFile', () => {
  it('writeFile へバイト列をそのまま渡す', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    await writeProjectImageFile('/project/diagram.png', bytes)
    expect(writeFile).toHaveBeenCalledWith('/project/diagram.png', bytes)
  })
})
```

- [ ] **Step 3: テストを実行し、失敗することを確認する**

Run: `npm test -- project-fs.test.ts`
Expected: FAIL（`askSaveImagePath`/`writeProjectImageFile` が存在しない）

- [ ] **Step 4: `src/fs/project-fs.ts` に実装を追加する**

```ts
import { exists, readDir, readTextFile, watch, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
```

（既存の import 行に `writeFile` を追加）

ファイル末尾に追加：

```ts
/**
 * 画像の書き出し先を尋ねる。null＝キャンセル（失敗ではない）。
 * `askSaveMarkdownPath` と同じ理由でフィルタだけ変える（M18）
 */
export async function askSaveImagePath(defaultPath: string): Promise<string | null> {
  const selected = await save({
    defaultPath,
    filters: [{ name: 'PNG', extensions: ['png'] }],
  })
  return typeof selected === 'string' ? selected : null
}

/**
 * PNGバイト列をファイルへ書く（M18）。`writeProjectFile` はテキスト専用
 *（`writeTextFile`）なので、バイナリは別関数にする
 */
export async function writeProjectImageFile(path: string, bytes: Uint8Array): Promise<void> {
  await writeFile(path, bytes)
}
```

- [ ] **Step 5: テストを実行し、パスすることを確認する**

Run: `npm test -- project-fs.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/fs/project-fs.ts src/fs/project-fs.test.ts
git commit -m "feat(m18): PNGファイルの保存ダイアログとバイナリ書き込みを追加する"
```

---

### Task 6: `ExportMenu` をジェネリック化する

**Files:**
- Modify: `src/components/ExportMenu.tsx`
- Modify: `src/components/ExportMenu.dom.test.tsx`
- Modify: `src/App.tsx`（呼び出し側の1箇所のみ。Markdown用の呼び出しにラベルを渡す）

**Interfaces:**
- Consumes: なし
- Produces: `ExportMenu<P extends { id: string; label: string }>` の props に `copyLabel: string`・`exportLabel: string` を追加（`outputs: readonly P[]`, `disabled: boolean`, `onCopy: (profile: P) => void`, `onExport: (profile: P) => void` は既存のまま） — Task 10 が `ImageOutputProfile` で呼ぶ

- [ ] **Step 1: 既存テストを新しいpropsに合わせて更新する（この時点で意図的に赤くする）**

`src/components/ExportMenu.dom.test.tsx` の4箇所の `render(<ExportMenu ...>)` すべてに `copyLabel="Markdown をコピー"` `exportLabel="Markdown を書き出す"` を追加する：

```tsx
render(
  <ExportMenu
    outputs={one}
    disabled={false}
    copyLabel="Markdown をコピー"
    exportLabel="Markdown を書き出す"
    onCopy={onCopy}
    onExport={onExport}
  />,
)
```

（他3箇所の `render(<ExportMenu ...>)` も同様に2props追加。ハードコードされた文言 `'Markdown をコピー'`/`'Markdown を書き出す'` を使ったアサーション自体は変えない）

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `npm test -- ExportMenu.dom.test.tsx`
Expected: FAIL（`copyLabel`/`exportLabel` は現状の `ExportMenuProps` に無いプロパティ。`tsc` は通っても、実行結果としては現行実装が `COPY_LABEL` 定数（'Markdown をコピー'）を使い続けるので**テスト自体はまだ緑のまま**——このステップは型を先に壊すのが目的ではなく、Step 4 で実装を差し替えた後に同じテストが通ることを保証する回帰網である。次のStepで先に型を壊す）

Run: `npx tsc -b`
Expected: FAIL（`ExportMenuProps` に無い `copyLabel`/`exportLabel` を渡しているため `error TS2322`）

- [ ] **Step 3: `src/components/ExportMenu.tsx` をジェネリック化する**

全文を次で置き換える：

```tsx
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * 出力の実行口（rev 8章。コピーと書き出しの両方）。M18 でジェネリック化し、
 * Markdown（`OutputProfile`）と画像（`ImageOutputProfile`）の両方に使い回す
 *（両者とも `id`/`label` は持つが `fileSuffix` 以降の形が違うため、
 * このコンポーネントが実際に読むのは `id`/`label` だけに絞ってある）。
 *
 * **プロファイルが1本のときはドロップダウンを出さない。** 選択肢が1つしかない
 * メニューは操作を1手増やすだけで何も選ばせない
 */
export interface ExportMenuProps<P extends { id: string; label: string }> {
  outputs: readonly P[]
  /** 出力できる状態にないとき（ファイル未選択・編集中データなし） */
  disabled: boolean
  copyLabel: string
  exportLabel: string
  onCopy: (profile: P) => void
  onExport: (profile: P) => void
}

function ProfileMenu<P extends { id: string; label: string }>(props: {
  label: string
  outputs: readonly P[]
  disabled: boolean
  onPick: (profile: P) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={props.disabled}>
          {props.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {props.outputs.map((profile) => (
          <DropdownMenuItem key={profile.id} onSelect={() => props.onPick(profile)}>
            {profile.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ExportMenu<P extends { id: string; label: string }>({
  outputs,
  disabled,
  copyLabel,
  exportLabel,
  onCopy,
  onExport,
}: ExportMenuProps<P>) {
  if (outputs.length > 1) {
    return (
      <>
        <ProfileMenu label={copyLabel} outputs={outputs} disabled={disabled} onPick={onCopy} />
        <ProfileMenu label={exportLabel} outputs={outputs} disabled={disabled} onPick={onExport} />
      </>
    )
  }
  // プロファイルが無い＝出力できるファイルを選んでいない。ボタンは出したまま
  // 押せなくする（M8 までと同じ見た目を保ち、額縁のボタンが消えたり出たりしない）
  const only = outputs[0]
  return (
    <>
      <Button
        variant="outline"
        disabled={disabled || only === undefined}
        onClick={() => only !== undefined && onCopy(only)}
      >
        {copyLabel}
      </Button>
      <Button
        variant="outline"
        disabled={disabled || only === undefined}
        onClick={() => only !== undefined && onExport(only)}
      >
        {exportLabel}
      </Button>
    </>
  )
}
```

- [ ] **Step 4: `App.tsx` の既存呼び出しに `copyLabel`/`exportLabel` を足す**

`src/App.tsx` の `<ExportMenu outputs={selectedModule?.outputs ?? []} ... />`（655行目付近）を次に変更：

```tsx
<ExportMenu
  outputs={selectedModule?.outputs ?? []}
  disabled={!canExport}
  copyLabel="Markdown をコピー"
  exportLabel="Markdown を書き出す"
  onCopy={(profile) => void controller.copyMarkdown(profile)}
  onExport={(profile) => void controller.exportMarkdown(profile)}
/>
```

- [ ] **Step 5: 型チェックとテストを確認する**

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm test -- ExportMenu.dom.test.tsx`
Expected: PASS（4件）

Run: `npm test`
Expected: 全件PASS（`App.dom.test.tsx` がこの箇所を経由していれば併せて確認する）

- [ ] **Step 6: Commit**

```bash
git add src/components/ExportMenu.tsx src/components/ExportMenu.dom.test.tsx src/App.tsx
git commit -m "refactor(m18): ExportMenuをジェネリック化し画像出力にも使えるようにする"
```

---

### Task 7: `SequenceEditor.tsx` に `data-export-role` と `captureRef` を実装する

**Files:**
- Modify: `src/modules/sequence/SequenceEditor.tsx`
- Modify: `src/modules/sequence/GutterSlot.tsx`
- Modify: `src/modules/sequence/GhostSlot.tsx`
- Modify: `src/core/registry.ts`（`EditorProps` に `captureRef` を追加）
- Test: `src/modules/sequence/SequenceEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `CaptureLayers` 型（Task 3。import のみ、キャプチャ実行はしない）
- Produces: `EditorProps<TData>.captureRef?: React.Ref<CaptureLayers>`（`core/registry.ts`）。`SequenceEditor` がこの ref に `CaptureLayers` を `useImperativeHandle` で公開する。ガター要素に `data-export-role="gutter"`、編集用UI要素に `data-export-role="chrome"` を付与する — Task 10 が `App.tsx` からこの ref 経由で `captureImagePng` を呼ぶ

- [ ] **Step 1: `core/registry.ts` の `EditorProps` に `captureRef` を追加する**

`EditorProps` インターフェース（`src/core/registry.ts:5-21`）の末尾に追加：

```ts
  /**
   * 画像出力対象のDOM層を公開する口（M18。任意——画像出力を持たないツールは
   * 実装しなくてよい）。額縁はこの ref 経由で `core/image-export.ts` の
   * `captureImagePng` を呼ぶ
   */
  captureRef?: React.Ref<import('./image-export').CaptureLayers>
```

`src/core/registry.ts` の先頭に `import type { ComponentType } from 'react'` があるので、`React.Ref` を使うために `import type { ComponentType, Ref } from 'react'` に変更し、上の型注釈は `captureRef?: Ref<import('./image-export').CaptureLayers>` と書く。

- [ ] **Step 2: `GutterSlot.tsx`・`GhostSlot.tsx` のルート要素に `data-export-role="gutter"` を足す**

`src/modules/sequence/GutterSlot.tsx` のルート `<div className="pointer-events-auto absolute flex items-stretch gap-1" ...>`（42-46行目）に `data-export-role="gutter"` を追加：

```tsx
    <div
      className="pointer-events-auto absolute flex items-stretch gap-1"
      data-export-role="gutter"
      style={{ left: props.x + indentPad, top: props.y, height: props.height }}
    >
```

`src/modules/sequence/GhostSlot.tsx` のルート `<div className="pointer-events-auto absolute flex items-start gap-1" ...>`（22-26行目）に同様に追加：

```tsx
    <div
      className="pointer-events-auto absolute flex items-start gap-1"
      data-export-role="gutter"
      style={{ left: props.x, top: props.y, height: props.height }}
    >
```

- [ ] **Step 3: `SequenceEditor.tsx` にガター関連要素とchrome要素のロール付与、`captureRef` の実装を足す**

インポートに追加（ファイル冒頭）：

```ts
import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { CaptureLayers } from '@/core/image-export'
```

（既存の `import { useEffect, useLayoutEffect, useRef, useState } from 'react'` に `useImperativeHandle` を足す形で統合する）

関数シグネチャに `captureRef` を追加。既存の `SequenceEditor` の props 分割代入（ファイル冒頭、`export function SequenceEditor({ data, onChange, issues, modalOpen }: EditorProps<...>)` の形）に `captureRef` を足す：

```ts
export function SequenceEditor({
  data,
  onChange,
  issues,
  modalOpen,
  captureRef,
}: EditorProps<SequenceSchemaVersion1>) {
```

3レイヤの ref を追加する。`containerRef`（既存、215行目）の直後に：

```ts
  const backgroundLayerRef = useRef<HTMLDivElement>(null)
  const edgesGroupRef = useRef<SVGGElement>(null)
  const nodesLayerRef = useRef<HTMLDivElement>(null)
```

`useImperativeHandle` を、他の `useEffect` 群と並ぶ位置（`useLayoutEffect(readFont, [])` 相当の箇所の近く、コンポーネント本体の上部）に追加：

```ts
  useImperativeHandle(
    captureRef,
    (): CaptureLayers | null => {
      const root = containerRef.current
      const background = backgroundLayerRef.current
      const nodes = nodesLayerRef.current
      const edgesGroup = edgesGroupRef.current
      if (root === null || background === null || nodes === null || edgesGroup === null) return null
      return { root, cssLayers: [background, nodes], svgLayers: [edgesGroup] }
    },
    [],
  )
```

背景レイヤの `div`（`data-layer="background"`、805-810行目付近）に ref を付与：

```tsx
      <div
        ref={backgroundLayerRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="background"
      >
```

ノードレイヤの `div`（`data-layer` を持たない透明な面、858行目付近の `pointer-events-none absolute inset-0 origin-top-left` の2つ目）に `data-layer="nodes"` と ref を追加：

```tsx
      <div
        ref={nodesLayerRef}
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="nodes"
      >
```

`SequenceEdges` コンポーネント（`src/modules/sequence/SequenceEdges.tsx`）に `groupRef` を渡せるよう props を拡張する。`SequenceEdgesProps` に追加：

```ts
export interface SequenceEdgesProps {
  steps: EdgeStep[]
  layout: SeqLayoutResult
  transform: Transform
  groupRef?: React.Ref<SVGGElement>
}
```

`SequenceEdges` 内の `<g transform={svgTransform(props.transform)}>`（53行目）に `ref={props.groupRef}` を追加：

```tsx
      <g ref={props.groupRef} transform={svgTransform(props.transform)}>
```

`SequenceEditor.tsx` の `<SequenceEdges steps={edgeSteps} layout={layout} transform={transform} />`（850行目）に `groupRef` を渡す：

```tsx
      <SequenceEdges steps={edgeSteps} layout={layout} transform={transform} groupRef={edgesGroupRef} />
```

編集用UI要素に `data-export-role="chrome"` を付与する。「見出し・操作・ヒントの帯」（769行目、`<div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-stretch">`）に追加：

```tsx
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-stretch"
        data-export-role="chrome"
      >
```

「末尾にステップを追加」ボタンのラッパー `div`（1125-1131行目）に追加：

```tsx
        <div
          className="pointer-events-auto absolute"
          data-export-role="chrome"
          style={{
            left: DIAGRAM_MARGIN,
            top: layout.totalHeight + ROW_GAP,
          }}
        >
```

ガター集計行（900-905行目）に `data-export-role="gutter"` を付与：

```tsx
        <div
          className="absolute whitespace-nowrap text-sm text-ink-muted"
          data-export-role="gutter"
          style={{ left: layout.gutterX, top: layout.headerTop, height: layout.headerHeight }}
        >
```

各ステップ行のガター見出し（縦線＋`#N`文言、1044-1059行目のフラグメント）を `data-export-role="gutter"` を持つ1つの `div` でラップする：

```tsx
              {(() => {
                const lastIndex = view.answers.length + view.ghosts.length - 1
                const lastHeight =
                  view.ghosts.length > 0
                    ? view.ghosts[view.ghosts.length - 1].height
                    : view.answers.length > 0
                      ? view.answers[view.answers.length - 1].height
                      : 0
                const slotsBottom =
                  lastIndex < 0
                    ? row.top + GUTTER_HEADING_HEIGHT + 18
                    : row.slotTops[lastIndex] + lastHeight
                return (
                  <div data-export-role="gutter">
                    <div
                      aria-hidden="true"
                      className={`absolute border-l-2 ${focusedRow === index ? 'border-ink-muted' : 'border-rule'}`}
                      style={{ left: layout.gutterX - 8, top: row.top, height: slotsBottom - row.top }}
                    />
                    <div
                      aria-hidden="true"
                      className="absolute truncate text-xs text-ink-muted"
                      style={{ left: layout.gutterX, top: row.top, width: layout.gutterWidth }}
                    >
                      {step.label === '' ? `#${index + 1}` : `#${index + 1} ${step.label}`}
                    </div>
                  </div>
                )
              })()}
```

一般文言（1068-1076行目、`view.answers.length === 0 && view.ghosts.length === 0` の分岐）に `data-export-role="gutter"` を付与：

```tsx
                <div
                  className="absolute text-xs text-ink-muted"
                  data-export-role="gutter"
                  style={{ left: layout.gutterX, top: row.top + GUTTER_HEADING_HEIGHT, width: layout.gutterWidth }}
                >
```

- [ ] **Step 4: 失敗するDOMテストを書く**

`src/modules/sequence/SequenceEditor.dom.test.tsx` の末尾（既存の `describe` 群の外、ファイル末尾）に追記。既存テストが `render(<SequenceEditor data={...} onChange={...} issues={[]} modalOpen={false} />)` のようにレンダーしているパターンを踏襲する（実際の呼び出し方は既存テストを読んで合わせる）：

```tsx
describe('画像出力の目印（M18）', () => {
  it('ガター要素に data-export-role="gutter" が付く', () => {
    const data = addFirstActor({ schemaVersion: 1, type: 'sequence', title: 't', actors: [], steps: [] }).data
    const { data: withStep } = addStepLast(data)
    render(<SequenceEditor data={withStep} onChange={vi.fn()} issues={[]} modalOpen={false} />)
    const gutterMarks = document.querySelectorAll('[data-export-role="gutter"]')
    expect(gutterMarks.length).toBeGreaterThan(0)
  })

  it('編集用UI要素に data-export-role="chrome" が付く', () => {
    const data = addFirstActor({ schemaVersion: 1, type: 'sequence', title: 't', actors: [], steps: [] }).data
    render(<SequenceEditor data={data} onChange={vi.fn()} issues={[]} modalOpen={false} />)
    const chromeMarks = document.querySelectorAll('[data-export-role="chrome"]')
    expect(chromeMarks.length).toBeGreaterThan(0)
  })

  it('captureRef が3レイヤを公開する', () => {
    const ref = createRef<CaptureLayers>()
    const data = addFirstActor({ schemaVersion: 1, type: 'sequence', title: 't', actors: [], steps: [] }).data
    render(<SequenceEditor data={data} onChange={vi.fn()} issues={[]} modalOpen={false} captureRef={ref} />)
    expect(ref.current?.root).toBeInstanceOf(HTMLElement)
    expect(ref.current?.cssLayers.length).toBe(2)
    expect(ref.current?.svgLayers.length).toBe(1)
  })
})
```

必要な import（ファイル冒頭に無ければ追加）: `createRef` を `react` から、`CaptureLayers` を `@/core/image-export` から、`addFirstActor`/`addStepLast` を `./commands` から（既存の import 群を確認し、無いものだけ足す）。

- [ ] **Step 5: テストを実行し、失敗することを確認する**

Run: `npm test -- SequenceEditor.dom.test.tsx`
Expected: FAIL（`data-export-role` 属性が無い／`captureRef` が実装されていない）

- [ ] **Step 6: Step 3 の実装を反映した状態で再実行する**

Run: `npm test -- SequenceEditor.dom.test.tsx`
Expected: PASS

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm test`
Expected: 全件PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/registry.ts src/modules/sequence/SequenceEditor.tsx src/modules/sequence/SequenceEdges.tsx src/modules/sequence/GutterSlot.tsx src/modules/sequence/GhostSlot.tsx src/modules/sequence/SequenceEditor.dom.test.tsx
git commit -m "feat(m18): SequenceEditorにdata-export-roleとcaptureRefを実装する"
```

---

### Task 8: `LogicTreeEditor.tsx` に `data-export-role` と `captureRef` を実装する

**Files:**
- Modify: `src/modules/logic-tree/LogicTreeEditor.tsx`
- Modify: `src/modules/logic-tree/TreeEdges.tsx`
- Test: `src/modules/logic-tree/LogicTreeEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `CaptureLayers` 型（Task 3）、`EditorProps.captureRef`（Task 7 で `core/registry.ts` に追加済み）
- Produces: `LogicTreeEditor` が `captureRef` に `CaptureLayers` を公開する。編集用UI要素（0件時の「ノードを追加」ボタン・帯）に `data-export-role="chrome"`。ロジックツリーには `gutter` 相当は無い

Task 7 と同型の変更をロジックツリー側にも入れる（open-issues「キャンバス土台の複製」——差分を増やさないよう両方を同じ形にする）。

- [ ] **Step 1: `TreeEdges.tsx` に `groupRef` を追加する**

`TreeEdgesProps` に追加：

```ts
export interface TreeEdgesProps {
  roots: readonly NodeTree[]
  positions: ReadonlyMap<string, Point>
  sizes: ReadonlyMap<string, Size>
  transform: Transform
  groupRef?: React.Ref<SVGGElement>
}
```

`<g transform={svgTransform(transform)}>`（58行目）に `ref={groupRef}` を追加（分割代入の引数に `groupRef` を足す）：

```tsx
export function TreeEdges({ roots, positions, sizes, transform, groupRef }: TreeEdgesProps) {
  // ...(既存のまま)
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      data-layer="edges"
    >
      <g ref={groupRef} transform={svgTransform(transform)}>
```

- [ ] **Step 2: `LogicTreeEditor.tsx` に3レイヤの ref・`captureRef`・chrome ロールを追加する**

インポートに追加：

```ts
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { CaptureLayers } from '@/core/image-export'
```

（既存の `import { useEffect, useLayoutEffect, useRef, useState } from 'react'` に `useImperativeHandle` を足す）

`LogicTreeEditor` の props 分割代入に `captureRef` を追加：

```ts
export function LogicTreeEditor({
  data,
  onChange,
  issues,
  modalOpen,
  captureRef,
}: EditorProps<LogicTreeSchemaVersion1>) {
```

`containerRef`（63行目）の直後にレイヤ ref を追加：

```ts
  const backgroundLayerRef = useRef<HTMLDivElement>(null)
  const edgesGroupRef = useRef<SVGGElement>(null)
  const nodesLayerRef = useRef<HTMLDivElement>(null)
```

`useImperativeHandle` をコンポーネント本体の上部（他の `useEffect` 群と並ぶ位置）に追加：

```ts
  useImperativeHandle(
    captureRef,
    (): CaptureLayers | null => {
      const root = containerRef.current
      const background = backgroundLayerRef.current
      const nodes = nodesLayerRef.current
      const edgesGroup = edgesGroupRef.current
      if (root === null || background === null || nodes === null || edgesGroup === null) return null
      return { root, cssLayers: [background, nodes], svgLayers: [edgesGroup] }
    },
    [],
  )
```

背景レイヤの `div`（314-320行目、`data-layer="background"`）に ref を追加：

```tsx
      <div
        ref={backgroundLayerRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="background"
      />
```

`<TreeEdges roots={built.roots} positions={positions} sizes={sizes} transform={transform} />`（322行目）に `groupRef` を渡す：

```tsx
      <TreeEdges
        roots={built.roots}
        positions={positions}
        sizes={sizes}
        transform={transform}
        groupRef={edgesGroupRef}
      />
```

ノードレイヤの `div`（329-333行目、`data-layer="nodes"`）に ref を追加：

```tsx
      <div
        ref={nodesLayerRef}
        className="pointer-events-none absolute inset-0 origin-top-left"
        style={{ transform: cssTransform(transform) }}
        data-layer="nodes"
      >
```

見出し・ヒントの帯（290行目、`<div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-stretch">`）に `data-export-role="chrome"` を追加：

```tsx
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-stretch"
        data-export-role="chrome"
      >
```

- [ ] **Step 3: 失敗するDOMテストを書く**

`src/modules/logic-tree/LogicTreeEditor.dom.test.tsx` の末尾に追記（既存テストのレンダーパターンに合わせる）：

```tsx
describe('画像出力の目印（M18）', () => {
  it('編集用UI要素に data-export-role="chrome" が付く', () => {
    const data = addRoot({ schemaVersion: 1, type: 'logicTree', title: 't', nodes: [] }).data
    render(<LogicTreeEditor data={data} onChange={vi.fn()} issues={[]} modalOpen={false} />)
    expect(document.querySelectorAll('[data-export-role="chrome"]').length).toBeGreaterThan(0)
  })

  it('captureRef が3レイヤを公開する', () => {
    const ref = createRef<CaptureLayers>()
    const data = addRoot({ schemaVersion: 1, type: 'logicTree', title: 't', nodes: [] }).data
    render(<LogicTreeEditor data={data} onChange={vi.fn()} issues={[]} modalOpen={false} captureRef={ref} />)
    expect(ref.current?.root).toBeInstanceOf(HTMLElement)
    expect(ref.current?.cssLayers.length).toBe(2)
    expect(ref.current?.svgLayers.length).toBe(1)
  })
})
```

必要な import を確認して足す（`createRef` from `react`、`CaptureLayers` from `@/core/image-export`、`addRoot` from `./commands`）。

- [ ] **Step 4: テストを実行し、失敗してから実装で通ることを確認する**

Run: `npm test -- LogicTreeEditor.dom.test.tsx`
Expected: Step 3 直後は FAIL、Step 2 の実装が揃っていれば PASS（Step 2/3 は実質同時に反映されるため、通しで1回失敗→実装→成功を確認する）

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm test`
Expected: 全件PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/logic-tree/LogicTreeEditor.tsx src/modules/logic-tree/TreeEdges.tsx src/modules/logic-tree/LogicTreeEditor.dom.test.tsx
git commit -m "feat(m18): LogicTreeEditorにdata-export-roleとcaptureRefを実装する"
```

---

### Task 9: `sequenceModule`/`logicTreeModule` に `imageOutputs` を設定する

**Files:**
- Modify: `src/modules/sequence/module.ts`
- Modify: `src/modules/sequence/module.test.ts`
- Modify: `src/modules/logic-tree/module.ts`
- Modify: `src/modules/logic-tree/module.test.ts`

**Interfaces:**
- Consumes: `ImageOutputProfile`（Task 2）
- Produces: `sequenceModule.imageOutputs`（2本: `with-gutter`/`without-gutter`）、`logicTreeModule.imageOutputs`（1本: `default`） — Task 10 が `App.tsx` から `selectedModule.imageOutputs` を読む

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/sequence/module.test.ts` に追記（既存テストの構造に合わせる。無ければ新規に `describe` ブロックを足す）：

```ts
describe('sequenceModule.imageOutputs', () => {
  it('「問いを含む」「問いを含めない」の2本を持つ', () => {
    expect(sequenceModule.imageOutputs.map((p) => p.id)).toEqual(['with-gutter', 'without-gutter'])
    expect(sequenceModule.imageOutputs[1].excludeRoles).toEqual(['gutter'])
    expect(sequenceModule.imageOutputs[0].excludeRoles).toBeUndefined()
  })
})
```

`src/modules/logic-tree/module.test.ts` に追記：

```ts
describe('logicTreeModule.imageOutputs', () => {
  it('1本だけを持つ（問いに相当する概念が無いため）', () => {
    expect(logicTreeModule.imageOutputs.map((p) => p.id)).toEqual(['default'])
    expect(logicTreeModule.imageOutputs[0].excludeRoles).toBeUndefined()
  })
})
```

- [ ] **Step 2: テストを実行し、失敗することを確認する**

Run: `npm test -- module.test.ts`
Expected: FAIL（Task 2 で両モジュールとも `imageOutputs: []` にしてあるため）

- [ ] **Step 3: `sequenceModule`/`logicTreeModule` の `imageOutputs` を更新する**

`src/modules/sequence/module.ts` の `imageOutputs: [],`（Task 2 で追加した行）を置き換える：

```ts
  imageOutputs: [
    { id: 'with-gutter', label: '問いを含む', fileSuffix: '' },
    { id: 'without-gutter', label: '問いを含めない', fileSuffix: '-simple', excludeRoles: ['gutter'] },
  ],
```

`src/modules/logic-tree/module.ts` の `imageOutputs: [],` を置き換える：

```ts
  imageOutputs: [{ id: 'default', label: '画像', fileSuffix: '' }],
```

- [ ] **Step 4: テストを実行し、パスすることを確認する**

Run: `npm test -- module.test.ts`
Expected: PASS

Run: `npx tsc -b`
Expected: エラー無し

- [ ] **Step 5: Commit**

```bash
git add src/modules/sequence/module.ts src/modules/sequence/module.test.ts src/modules/logic-tree/module.ts src/modules/logic-tree/module.test.ts
git commit -m "feat(m18): sequence/logic-treeモジュールにimageOutputsを設定する"
```

---

### Task 10: `App.tsx` に画像コピー/保存を配線する

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `captureImagePng`（Task 3）、`copyImageToClipboard`（Task 4）、`askSaveImagePath`/`writeProjectImageFile`（Task 5）、`ExportMenu<P>`（Task 6）、`EditorProps.captureRef`（Task 7・8）、`selectedModule.imageOutputs`（Task 9）
- Produces: 画面上の「画像をコピー」「画像で保存」ボタン（額縁のヘッダー帯）

- [ ] **Step 1: import を追加する**

`src/App.tsx` の import 群に追加：

```ts
import { captureImagePng, type CaptureLayers } from '@/core/image-export'
import { copyImageToClipboard, copyToClipboard } from '@/fs/clipboard'
import {
  askSaveImagePath,
  askSaveMarkdownPath,
  fileExists,
  joinPath,
  listJsonFiles,
  moveFileToTrash,
  pickProjectFolder,
  readProjectFile,
  watchFolder,
  writeProjectFile,
  writeProjectImageFile,
} from '@/fs/project-fs'
import type { ImageOutputProfile } from '@/core/registry'
```

（`copyToClipboard`/`askSaveMarkdownPath`/`writeProjectFile` 等の既存 import 行を上記の形に統合し、二重 import にしない）

- [ ] **Step 2: `captureRef` の state と、選択ファイルが変わるたびにリセットする仕組みを足す**

`selected`/`selectedModule` の定義（476-480行目）の近くに追加：

```ts
  const captureLayersRef = useRef<CaptureLayers | null>(null)
```

`<selectedModule.Editor ... />`（812-823行目）に `captureRef` を渡す：

```tsx
              {selected?.result.status === 'editable' && selectedModule && editingData !== null && (
                <selectedModule.Editor
                  key={selected.path}
                  data={editingData}
                  issues={selected.issues}
                  modalOpen={modalOpen}
                  captureRef={captureLayersRef}
                  onChange={(next: unknown, mergeKey?: string | null) => {
                    setHistory((h) => (h === null ? h : record(h, next, mergeKey ?? null, Date.now())))
                    controller.applyEdit(selected.path, selectedModule, next)
                  }}
                />
              )}
```

`useImperativeHandle` は `captureLayersRef` を毎レンダー同じ ref オブジェクトとして受け取るため、`key={selected.path}` によるアンマウント/再マウント時は自動的に新しい `CaptureLayers`（または `null`）で上書きされる。追加の state 管理は不要。

- [ ] **Step 3: `doCopyImage`/`doExportImage` を実装する**

`copyMarkdown`/`exportMarkdown` の呼び出しに近い位置（`runHistory` の定義の後、509行目付近）に追加：

```ts
  /**
   * 画像コピー/保存のオーケストレーション（M18）。`core/app-controller.ts` を
   * 拡張しないのは、DOM要素（captureLayersRef）を引数に取らせると
   * 「コアはReact/Tauriを知らない」という設計原則を破るため（design spec 決定6b）。
   * 保持する規律は copyMarkdown/exportMarkdown と同じ「順序」——
   * バナー表示・成功トースト・失敗時のバナーの形はそちらに揃える
   */
  const doCopyImage = async (profile: ImageOutputProfile): Promise<void> => {
    const layers = captureLayersRef.current
    if (layers === null) return
    try {
      const bytes = await captureImagePng(layers, { excludeRoles: profile.excludeRoles })
      await copyImageToClipboard(bytes)
      setBanner('io', null)
      showToast({ key: 'export', message: '画像をクリップボードにコピーしました' })
    } catch (err) {
      setBanner(
        'io',
        `画像をコピーできませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  const doExportImage = async (profile: ImageOutputProfile): Promise<void> => {
    const layers = captureLayersRef.current
    if (layers === null || selectedPath === null) return
    try {
      // **キャプチャを保存ダイアログの前に確定させる**（design spec 決定9）。
      // ダイアログが開いている間にウィンドウリサイズ等が起きても、
      // 押した瞬間の見たままを保証する
      const bytes = await captureImagePng(layers, { excludeRoles: profile.excludeRoles })
      const base = selectedPath.replace(/\.json$/i, '')
      const target = await askSaveImagePath(`${base}${profile.fileSuffix}.png`)
      if (target === null) return
      await writeProjectImageFile(target, bytes)
      setBanner('io', null)
      showToast({ key: 'export', message: `画像を書き出しました: ${target}` })
    } catch (err) {
      setBanner(
        'io',
        `画像を書き出せませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
```

- [ ] **Step 4: `ImageExportMenu`（`ExportMenu` の画像用インスタンス）をヘッダー帯に配線する**

`<ExportMenu .../>`（Markdown用、Task 6 で更新済み）の直後に追加：

```tsx
<ExportMenu
  outputs={selectedModule?.imageOutputs ?? []}
  disabled={!canExport}
  copyLabel="画像をコピー"
  exportLabel="画像で保存"
  onCopy={(profile) => void doCopyImage(profile)}
  onExport={(profile) => void doExportImage(profile)}
/>
```

（`ExportMenu` は Task 6 でジェネリック化済みなので、`outputs` に `ImageOutputProfile[]` を渡せば型推論でそのまま使える）

- [ ] **Step 5: 型チェックと既存テストを確認する**

Run: `npx tsc -b`
Expected: エラー無し

Run: `npm test -- App.dom.test.tsx`
Expected: PASS（既存の `ExportMenu` 呼び出しが増えたことで `getByRole('button', { name: 'Markdown をコピー' })` 等の既存クエリが曖昧にならないか確認する。ボタンラベルが重複しないことを確認する——「画像をコピー」「画像で保存」は「Markdown をコピー」「Markdown を書き出す」と文字列が異なるため衝突しない想定）

Run: `npm test`
Expected: 全件PASS

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(m18): 画像コピー/保存のオーケストレーションをApp.tsxに実装し配線する"
```

---

### Task 11: 実機確認

**Files:** なし（人間の作業）

**Interfaces:** なし

このタスクはサブエージェントが実行できない（GUI操作が要る。lessons-for-planning「サブエージェントはGUIを操作できない」）。人間が `npm run tauri dev` でアプリを起動し、以下を確認する：

- [ ] **Step 1: シーケンス図で「画像をコピー」を実行し、外部アプリ（画像編集ソフト・チャットの入力欄等）に貼り付けて図が正しく表示されることを確認する**
- [ ] **Step 2: シーケンス図で「問いを含む」「問いを含めない」それぞれの画像コピーを実行し、ガター列の有無が見た目に反映されることを確認する**
- [ ] **Step 3: シーケンス図をパン/ズームで画面外に図がはみ出した状態にしてから画像コピーを実行し、画面外の部分も画像に収まっていることを確認する**
- [ ] **Step 4: シーケンス図で「画像で保存」を実行し、保存したPNGファイルを画像ビューアで開いて正しく表示されることを確認する**
- [ ] **Step 5: ロジックツリーで同様に画像コピー・画像で保存を確認する（ロジックツリーはプロファイル1本なのでドロップダウンが出ずボタン直押しになることも確認する）**
- [ ] **Step 6: キャプチャ中に画面が一瞬「全体表示」にリセットされてから戻るちらつきの体感を確認し、許容範囲かを判断する（design spec 決定6で許容と決めた挙動の実物確認）**
- [ ] **Step 7: 保存ダイアログでキャンセルしたとき、エラーバナーが出ずに何も起きないことを確認する**
- [ ] **Step 8: `clipboard-manager:allow-write-image`/`fs:allow-write-file` の権限が欠けていないこと（画像コピー・保存のいずれかが「許可がありません」的なエラーで落ちないこと）を確認する**
- [ ] **Step 9: 確認が取れたら、このチェックリストの結果を `docs/history/m18-core-image-export.md`（Task 12）に転記する。未実施のまま完了扱いにしない（lessons-for-planning「実機確認とドキュメント反映を同じタスクに束ねない」）**

---

### Task 12: ドキュメントを反映する

**Files:**
- Create: `docs/history/m18-core-image-export.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`
- Modify: `docs/project-setup.md`
- Modify: `docs/README.md`

**Interfaces:** なし

- [ ] **Step 1: `docs/history/m18-core-image-export.md` を新規作成する**

design spec（`2026-08-16-m18-image-export-design.md`）の決定事項と、Task 11 の実機確認結果を要約した申し送りを書く（CLAUDE.mdの「マイルストーン完了時に触る3箇所」の1つ目。書式は既存の `docs/history/m17-core-terminal-fixes.md` 等に揃える）。

- [ ] **Step 2: `docs/open-issues.md` を更新する**

- 突き合わせる: `layout.totalHeight`/`totalWidth` の帳簿ずれ2件（M14・sequence-m2）——解消はしていない（実測で回避しただけ）ことを明記する一文を既存項目に追記する
- 突き合わせる: 「キャンバスの土台が logic-tree と sequence で丸ごと複製されている」（sequence-m1）——`captureRef`/`CaptureLayers` の実装が両モジュールにほぼ同一の形で増えたことを追記する

- [ ] **Step 3: `docs/overview-rev.md` の8章に画像出力プロファイルを追記する**

design spec 決定1の内容（`ImageOutputProfile` は `OutputProfile` と並行する規約で、DOM実測に依存するため純関数にできない）を8章の「出力ロジックはツールモジュールの提供物」の段落の近くに追記する。

- [ ] **Step 4: `docs/project-setup.md` の capabilities 節に追記する**

`clipboard-manager:allow-write-image`・`fs:allow-write-file`・Cargo `image-png` feature を、既存の capabilities 一覧の書式に合わせて追記する。

- [ ] **Step 5: `docs/README.md` のマイルストーン履歴表に M18 の行を追加する**

既存の表（36-64行目）に倣い、`| [M18](history/m18-core-image-export.md) | 画像出力 | コア・シーケンス・ロジックツリー |` の形の行を追加する。

- [ ] **Step 6: 最終確認**

Run: `npm test && npx tsc -b && npm run lint`
Expected: 全件緑

Run: `cd src-tauri && cargo test`
Expected: 全件緑（変更していないので既存のまま通ることの確認）

- [ ] **Step 7: Commit**

```bash
git add docs/history/m18-core-image-export.md docs/open-issues.md docs/overview-rev.md docs/project-setup.md docs/README.md
git commit -m "docs(m18): 画像出力マイルストーンの申し送りとrevへの反映を行う"
```
