import { describe, expect, it } from 'vitest'
import { createAppController, type AppController, type AppHost, type AppIo, type BannerKind, type SaverSpec } from './app-controller'
import type { AutoSaver } from './autosave'
import { serialize, type JsonSchema } from './canonical'
import type { ModalRequest } from './modal-queue'
import type { ProjectFile } from './project-file'
import { createRegistry, type AnyToolModule, type ModuleRegistry } from './registry'
import { scanFolder } from './scan'
import type { ToastItem } from './toasts'

// ---- テスト用のモジュール（用語集の代わり。スキーマは最小限） ----

const noteSchema: JsonSchema = {
  type: 'object',
  properties: {
    schemaVersion: { const: 1 },
    type: { const: 'note' },
    title: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['schemaVersion', 'type', 'title', 'body'],
  additionalProperties: false,
}

function noteModule(over: Partial<AnyToolModule> = {}): AnyToolModule {
  return {
    type: 'note',
    displayName: 'ノート',
    schemaVersion: 1,
    schema: noteSchema,
    idPrefixes: ['note'],
    Editor: () => null,
    checkConsistency: () => [],
    toMarkdown: (d: { title: string; body: string }) => `## ${d.title}\n\n${d.body}\n`,
    singleton: true,
    migrate: (d) => d,
    createEmpty: (title) => ({ schemaVersion: 1, type: 'note', title, body: '' }),
    ...over,
  }
}

function note(title: string, body = ''): string {
  return serialize({ schemaVersion: 1, type: 'note', title, body }, noteSchema)
}

const DIR = 'C:\\proj'
const p = (name: string) => `${DIR}\\${name}`

// ---- 偽ディスク ----

function createDisk(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial))
  return {
    files,
    list: async (dir: string) => [...files.keys()].filter((path) => path.startsWith(`${dir}\\`)),
    read: async (path: string) => {
      const text = files.get(path)
      if (text === undefined) throw new Error(`ENOENT: ${path}`)
      return text
    },
    write: async (path: string, text: string) => {
      files.set(path, text)
    },
    exists: async (path: string) => files.has(path),
    trash: async (path: string) => {
      files.delete(path)
    },
  }
}

// ---- 偽 AutoSaver（順序を記録する。実物の意味論だけ真似る） ----

interface FakeSaver extends AutoSaver {
  spec: SaverSpec
  latest: string | null
  /** flush の戻り値をテストから制御する */
  flushOk: boolean
  /** hasUnsaved の戻り値をテストから制御する */
  unsaved: boolean
  disposed: boolean
}

function createSaverFactory(log: string[]) {
  const savers: FakeSaver[] = []
  const factory = (spec: SaverSpec): AutoSaver => {
    log.push('createSaver')
    // 実物（src/core/autosave.ts）の hasUnsaved() は `latest !== lastSaved` で、
    // write が成功すると lastSaved が latest に追いつき false へ戻る。この偽物は
    // 「あるファイルへの1回目の update() で unsaved が true になったきり戻らない」
    // という欠陥を持っていた（Task 6 の申し送りで判明）。lastSaved を持たせ、
    // spec.write が成功するたびに追随させることで実物の意味論に合わせる——
    // 呼び出し側（テスト）が `spec.write(...)` を直接呼んで「自動保存が書いた」を
    // 再現する経路（自己書き込み除外のテスト）と、コントローラが saver.update() を
    // 呼ぶ経路の両方で同じ判定になる
    let lastSaved = spec.baseline
    const saver: FakeSaver = {
      spec: {
        ...spec,
        write: async (text) => {
          await spec.write(text)
          lastSaved = text
          saver.unsaved = saver.latest !== lastSaved
        },
      },
      latest: spec.baseline,
      flushOk: true,
      unsaved: false,
      disposed: false,
      update(text) {
        log.push('update')
        saver.latest = text
        saver.unsaved = text !== lastSaved
      },
      async flush() {
        log.push('flush')
        return saver.flushOk
      },
      async settle() {
        log.push('settle')
      },
      hasUnsaved() {
        return saver.unsaved
      },
      dispose() {
        log.push('dispose')
        saver.disposed = true
      },
    }
    savers.push(saver)
    return saver
  }
  return { factory, savers, current: () => savers[savers.length - 1] }
}

// ---- ハーネス ----

interface Harness {
  controller: AppController
  log: string[]
  disk: ReturnType<typeof createDisk>
  savers: ReturnType<typeof createSaverFactory>
  files: () => ProjectFile[]
  selectedPath: () => string | null
  document: () => unknown | null
  banners: () => Record<BannerKind, string | null>
  toasts: () => Omit<ToastItem, 'id'>[]
  modals: () => ModalRequest[]
  registry: ModuleRegistry
  /** テストから「今の編集内容」を差し替える（App の履歴の代わり） */
  setDocument: (data: unknown | null) => void
  io: AppIo
}

function createHarness(
  initial: Record<string, string> = {},
  over: Partial<AppIo> = {},
): Harness {
  const log: string[] = []
  const disk = createDisk(initial)
  const savers = createSaverFactory(log)
  const registry = createRegistry()
  registry.register(noteModule())

  let files: ProjectFile[] = []
  let selectedPath: string | null = null
  let document: unknown | null = null
  const banners: Record<BannerKind, string | null> = { io: null, save: null, scan: null, watch: null }
  const toasts: Omit<ToastItem, 'id'>[] = []
  let modals: ModalRequest[] = []

  const io: AppIo = {
    scan: (dir) => scanFolder(dir, { list: disk.list, read: disk.read }, registry),
    read: disk.read,
    write: async (path, text) => {
      log.push(`write:${path}`)
      await disk.write(path, text)
    },
    exists: async (path) => {
      log.push(`exists:${path}`)
      return disk.exists(path)
    },
    trash: async (path) => {
      log.push(`trash:${path}`)
      await disk.trash(path)
    },
    join: async (dir, name) => `${dir}\\${name}`,
    copyText: async () => { log.push('copyText') },
    askSavePath: async () => null,
    forceClose: async () => { log.push('forceClose') },
    createSaver: savers.factory,
    ...over,
  }

  const host: AppHost = {
    setFiles: (next) => { files = next; log.push('setFiles') },
    setProjectDir: () => {},
    setSelectedPath: (path) => { selectedPath = path; log.push(`setSelectedPath:${path ?? 'null'}`) },
    setDocument: (data) => { document = data; log.push('setDocument') },
    setBanner: (kind, message) => { banners[kind] = message },
    showToast: (toast) => { toasts.push(toast); log.push('toast') },
    dismissToast: (key) => { log.push(`dismissToast:${key}`) },
    showModal: (request) => { modals = [...modals, request]; log.push('showModal') },
    dropModal: (key) => { modals = modals.filter((m) => m.key !== key); log.push(`dropModal:${key}`) },
    clearModals: () => { modals = []; log.push('clearModals') },
    getEditingData: () => document,
  }

  return {
    controller: createAppController(io, host, registry),
    log,
    disk,
    savers,
    files: () => files,
    selectedPath: () => selectedPath,
    document: () => document,
    banners: () => banners,
    toasts: () => toasts,
    modals: () => modals,
    registry,
    setDocument: (data) => { document = data },
    io,
  }
}

// ---- テスト ----

describe('openFolder', () => {
  it('走査結果を一覧にして台帳へ記録する', async () => {
    const h = createHarness({ [p('a.json')]: note('A'), [p('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    expect(h.files().map((f) => f.name)).toEqual(['a.json', 'b.json'])
    expect(h.files().every((f) => f.result.status === 'editable')).toBe(true)
    expect(h.banners().io).toBeNull()
  })

  it('読めないファイルが1つでもあれば一覧を入れ替えない（新旧が混ざった状態を作らない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    const before = h.files()
    h.disk.read = async (path: string) => {
      if (path === p('a.json')) throw new Error('locked')
      return h.disk.files.get(path)!
    }
    await h.controller.openFolder(DIR)
    expect(h.files()).toBe(before)
    expect(h.banners().io).toContain('読み込めないファイルがあるため開けませんでした')
  })

  it('前のフォルダのモーダル要求を掃除する', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    expect(h.log).toContain('clearModals')
  })
})

describe('selectFile', () => {
  it('走査時のキャッシュではなくディスクから読み直す（M1 で確定した原則）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    // 走査後に外部が書き換えた内容を、選択時に拾えること
    h.disk.files.set(p('a.json'), note('A2'))
    await h.controller.selectFile(p('a.json'))
    expect(h.document()).toMatchObject({ title: 'A2' })
  })

  it('editable なら saver を張り、履歴用のデータを渡す', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    expect(h.savers.current().spec.baseline).toBe(note('A'))
    expect(h.selectedPath()).toBe(p('a.json'))
  })

  it('開けないファイルは選択だけして saver を張らない', async () => {
    const h = createHarness({ [p('broken.json')]: '{ not json' })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('broken.json'))
    expect(h.selectedPath()).toBe(p('broken.json'))
    expect(h.savers.savers.length).toBe(0)
  })

  it('切り替え時に前のファイルを flush し、失敗したら切り替えない', async () => {
    const h = createHarness({ [p('a.json')]: note('A'), [p('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().flushOk = false
    await h.controller.selectFile(p('b.json'))
    expect(h.selectedPath()).toBe(p('a.json'))
    expect(h.savers.current().disposed).toBe(false)
  })
})

describe('applyEdit', () => {
  it('自動保存へ正規形を渡し、整合性検証をやり直す', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const module = h.registry.get('note')!
    h.controller.applyEdit(p('a.json'), module, { schemaVersion: 1, type: 'note', title: 'A', body: 'x' })
    expect(h.savers.current().latest).toBe(note('A', 'x'))
    const entry = h.files().find((f) => f.path === p('a.json'))!
    expect(entry.result.status === 'editable' && entry.result.data).toMatchObject({ body: 'x' })
  })
})

describe('dispose', () => {
  it('flush せずに saver を止める（flush 失敗で復元された pending を捨てないため）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const before = h.log.length
    h.controller.dispose()
    expect(h.log.slice(before)).toEqual(['dispose'])
  })
})

describe('createNewFile', () => {
  it('衝突しない名前をディスクに問い合わせて決め、作ったファイルを開く', async () => {
    const h = createHarness({ [p('ノート.json')]: note('既存') })
    await h.controller.openFolder(DIR)
    const module = h.registry.get('note')!
    await h.controller.createNewFile(module)
    expect(h.log.some((l) => l.startsWith('exists:'))).toBe(true)
    expect(h.disk.files.has(p('ノート-2.json'))).toBe(true)
    expect(h.selectedPath()).toBe(p('ノート-2.json'))
  })

  it('新規ファイルは正規形で書く（作った直後の1文字編集で全行 diff にしない）', async () => {
    const h = createHarness()
    await h.controller.openFolder(DIR)
    await h.controller.createNewFile(h.registry.get('note')!)
    const text = h.disk.files.get(p('ノート.json'))!
    expect(text).toBe(serialize(JSON.parse(text), noteSchema))
  })

  it('書き込みに失敗したら一覧へ足さずバナーを出す', async () => {
    const h = createHarness({}, { write: () => Promise.reject(new Error('read-only')) })
    await h.controller.openFolder(DIR)
    await h.controller.createNewFile(h.registry.get('note')!)
    expect(h.files()).toEqual([])
    expect(h.banners().io).toContain('ファイルを作成できませんでした')
  })

  it('同じパスが二重に一覧へ入らない（ダブルクリック・遅い IPC）', async () => {
    const h = createHarness()
    await h.controller.openFolder(DIR)
    const module = h.registry.get('note')!
    await Promise.all([h.controller.createNewFile(module), h.controller.createNewFile(module)])
    const paths = h.files().map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('フォルダを開いていないときは無音で終わらない', async () => {
    const h = createHarness()
    await h.controller.createNewFile(h.registry.get('note')!)
    expect(h.banners().io).not.toBeNull()
  })
})

describe('requestDelete / 削除の順序', () => {
  async function openAndSelect() {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    return h
  }

  it('確認ダイアログを挟む（ゴミ箱への移動はアプリの履歴では戻せない）', async () => {
    const h = await openAndSelect()
    h.controller.requestDelete(h.files()[0])
    expect(h.modals().length).toBe(1)
    expect(h.disk.files.has(p('a.json'))).toBe(true)
  })

  it('入力を切る → 進行中の write を待つ → ゴミ箱へ移す、の順で進む', async () => {
    const h = await openAndSelect()
    h.controller.requestDelete(h.files()[0])
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm ではない')
    const from = h.log.length
    await request.onConfirm()
    const order = h.log.slice(from).filter((l) =>
      l.startsWith('setSelectedPath') || l === 'dispose' || l === 'settle' || l.startsWith('trash:'),
    )
    expect(order).toEqual([
      'setSelectedPath:null', // ①入力を切る（エディタを畳んでから待つ）
      'dispose',              // ②書かせない
      'settle',               // ③既に飛んだ write の着地を待つ（flush ではない）
      'dispose',              // ④失敗した write が復元した pending を捨てる
      `trash:${p('a.json')}`, // ⑤ゴミ箱へ
    ])
  })

  it('削除経路では flush しない（消したファイルを書き戻して復活させない）', async () => {
    const h = await openAndSelect()
    h.controller.requestDelete(h.files()[0])
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm ではない')
    const from = h.log.length
    await request.onConfirm()
    expect(h.log.slice(from)).not.toContain('flush')
  })

  it('選択していないファイルの削除では saver に触らない', async () => {
    const h = createHarness({ [p('a.json')]: note('A'), [p('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const target = h.files().find((f) => f.path === p('b.json'))!
    h.controller.requestDelete(target)
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm ではない')
    const from = h.log.length
    await request.onConfirm()
    expect(h.log.slice(from)).not.toContain('dispose')
    expect(h.selectedPath()).toBe(p('a.json'))
  })

  it('削除後は台帳と一覧から落ち、検証をやり直す', async () => {
    const h = await openAndSelect()
    h.controller.requestDelete(h.files()[0])
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm ではない')
    await request.onConfirm()
    expect(h.files()).toEqual([])
    expect(h.log).toContain(`dropModal:external:${p('a.json')}`)
  })

  it('ゴミ箱への移動に失敗したらバナーを出す', async () => {
    const h = createHarness({ [p('a.json')]: note('A') }, { trash: () => Promise.reject(new Error('locked')) })
    await h.controller.openFolder(DIR)
    h.controller.requestDelete(h.files()[0])
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm ではない')
    await request.onConfirm()
    expect(h.banners().io).toContain('ファイルを削除できませんでした')
  })
})

describe('externalChange（外部変更の検知）', () => {
  async function opened(body = '') {
    const h = createHarness({ [p('a.json')]: note('A', body), [p('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    return h
  }

  it('自分の書き込みは外部変更にならない（台帳との内容比較）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    const module = h.registry.get('note')!
    // 自動保存が書いたことにする（writeAndRecord 相当を saver 経由で再現）
    await h.savers.current().spec.write(note('A', 'x'))
    const from = h.log.length
    await h.controller.externalChange()
    expect(h.log.slice(from)).not.toContain('toast')
    expect(module).toBeDefined()
  })

  it('未保存編集が無ければ再読込し、Undo 履歴を破棄する', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    expect(h.document()).toMatchObject({ body: '外部が書いた' })
    // setDocument＝履歴の作り直し。取り込みごとに必ず1回通ること
    expect(h.log.filter((l) => l === 'setDocument').length).toBeGreaterThan(0)
    expect(h.toasts().at(-1)?.message).toContain('外部の変更を読み込みました')
  })

  it('取り込みは applyEdit を通らない（ディスクの内容を書き戻さない）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    const from = h.log.length
    await h.controller.externalChange()
    // 取り込みの過程でディスクへ書いていないこと
    expect(h.log.slice(from).some((l) => l.startsWith('write:'))).toBe(false)
  })

  it('検知したら、一覧を差し替える前に自動保存を止める', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    const from = h.log.length
    await h.controller.externalChange()
    const order = h.log.slice(from).filter((l) => l === 'dispose' || l === 'setFiles')
    expect(order[0]).toBe('dispose')
  })

  it('「取り込み前に戻す」は生バイトをそのまま書き戻す（正規化差分を出さない）', async () => {
    // 非正規形（インデント4）のまま開いていたファイルを外部が書き換える
    const raw = JSON.stringify({ schemaVersion: 1, type: 'note', title: 'A', body: '' }, null, 4) + '\n'
    const h = createHarness({ [p('a.json')]: raw })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    const action = h.toasts().at(-1)?.action
    expect(action).toBeDefined()
    await action!.run()
    expect(h.disk.files.get(p('a.json'))).toBe(raw)
  })

  it('未保存編集があれば二択ダイアログを出す（自動では取り込まない）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    expect(h.modals().at(-1)?.kind).toBe('choice')
  })

  it('二択を出す前に、同じファイルの古い通知を取り下げる', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    expect(h.log).toContain(`dismissToast:external:${p('a.json')}`)
  })

  it('回答待ちの間は、2度目の外部変更も二択に倒れる（saver を dispose しても信号が消えない）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.disk.files.set(p('a.json'), note('A', '1回目'))
    await h.controller.externalChange()
    h.disk.files.set(p('a.json'), note('A', '2回目'))
    await h.controller.externalChange()
    expect(h.modals().filter((m) => m.kind === 'choice').length).toBeGreaterThan(0)
    // 自動で取り込んで履歴を置き換えていないこと
    expect(h.document()).not.toMatchObject({ body: '2回目' })
  })

  it('「自分の編集で上書き」は検知したディスク内容を baseline に張り直す', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.setDocument({ schemaVersion: 1, type: 'note', title: 'A', body: '自分の編集' })
    const diskText = note('A', '外部が書いた')
    h.disk.files.set(p('a.json'), diskText)
    await h.controller.externalChange()
    const request = h.modals().at(-1)
    if (request?.kind !== 'choice') throw new Error('choice ではない')
    await request.onPrimary()
    expect(h.savers.current().spec.baseline).toBe(diskText)
    expect(h.savers.current().latest).toBe(note('A', '自分の編集'))
  })

  it('「自分の編集で上書き」で選択が変わっていたら無音で終わらない', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.setDocument({ schemaVersion: 1, type: 'note', title: 'A', body: '自分の編集' })
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    const request = h.modals().at(-1)
    if (request?.kind !== 'choice') throw new Error('choice ではない')
    await h.controller.selectFile(p('b.json'))
    await request.onPrimary()
    expect(h.banners().io).not.toBeNull()
  })

  it('外部で消えた選択中ファイルは flush せずに後始末する（書き戻して復活させない）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.disk.files.delete(p('a.json'))
    const from = h.log.length
    await h.controller.externalChange()
    expect(h.log.slice(from)).toContain('dispose')
    expect(h.log.slice(from)).not.toContain('flush')
    expect(h.selectedPath()).toBeNull()
    expect(h.log).toContain(`dropModal:external:${p('a.json')}`)
    expect(h.disk.files.has(p('a.json'))).toBe(false)
  })

  it('読めなかったファイルを「消えた」と混ぜない（一時的なロックで閉じない）', async () => {
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    const read = h.disk.read
    h.disk.read = async (path: string) => {
      if (path === p('a.json')) throw new Error('locked')
      return read(path)
    }
    await h.controller.externalChange()
    expect(h.selectedPath()).toBe(p('a.json'))
  })

  it('増えたファイルは通知して一覧へ足す', async () => {
    const h = await opened()
    h.disk.files.set(p('c.json'), note('C'))
    await h.controller.externalChange()
    expect(h.files().map((f) => f.name)).toContain('c.json')
    expect(h.toasts().at(-1)?.message).toContain('ファイルが増えました')
  })

  it('再走査が成功したら scan バナーを消す（成功しても残らない）', async () => {
    const h = await opened()
    const list = h.disk.list
    h.disk.list = async () => { throw new Error('gone') }
    await h.controller.externalChange()
    expect(h.banners().scan).not.toBeNull()
    h.disk.list = list
    await h.controller.externalChange()
    expect(h.banners().scan).toBeNull()
  })
})

describe('ensureFileOfType', () => {
  it('走査後に外部が書いたファイルを再走査で拾い、2つ目を作らない', async () => {
    const h = createHarness()
    await h.controller.openFolder(DIR)
    // 空フォルダを開いた後に Skill が用語集を書いた状況（申し送り10節のデータ喪失経路）
    h.disk.files.set(p('外部が書いた.json'), note('外部'))
    await h.controller.ensureFileOfType(h.registry.get('note')!)
    expect(h.disk.files.size).toBe(1)
    expect(h.selectedPath()).toBe(p('外部が書いた.json'))
  })

  it('無ければ作って開く', async () => {
    const h = createHarness()
    await h.controller.openFolder(DIR)
    await h.controller.ensureFileOfType(h.registry.get('note')!)
    expect(h.disk.files.has(p('ノート.json'))).toBe(true)
    expect(h.selectedPath()).toBe(p('ノート.json'))
  })

  it('フォルダを開いていないときは無音で終わらない', async () => {
    const h = createHarness()
    await h.controller.ensureFileOfType(h.registry.get('note')!)
    expect(h.banners().io).not.toBeNull()
  })

  it('再走査に失敗したら作らない（古いスナップショットで判断しない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    h.disk.list = async () => { throw new Error('gone') }
    await h.controller.ensureFileOfType(h.registry.get('note')!)
    expect(h.disk.files.size).toBe(1)
    expect(h.banners().scan).toContain('フォルダの再走査に失敗しました')
  })
})
