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
    const saver: FakeSaver = {
      spec,
      latest: null,
      flushOk: true,
      unsaved: false,
      disposed: false,
      update(text) {
        log.push('update')
        saver.latest = text
        saver.unsaved = true
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
