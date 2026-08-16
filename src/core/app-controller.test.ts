import { describe, expect, it, vi } from 'vitest'
import { createAppController, type AppController, type AppHost, type AppIo, type BannerKind, type SaverSpec } from './app-controller'
import type { AutoSaver } from './autosave'
import { serialize, type JsonSchema } from './canonical'
import type { ConsistencyIssue } from './consistency'
import { pushModal, type ModalRequest } from './modal-queue'
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
    icon: () => null,
    schemaVersion: 1,
    schema: noteSchema,
    idPrefixes: ['note'],
    Editor: () => null,
    checkConsistency: () => [],
    outputs: [
      {
        id: 'default',
        label: 'Markdown',
        fileSuffix: '',
        toMarkdown: (d: { title: string; body: string }) => `## ${d.title}\n\n${d.body}\n`,
      },
    ],
    imageOutputs: [],
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
  moduleOver: Partial<AnyToolModule> = {},
): Harness {
  const log: string[] = []
  const disk = createDisk(initial)
  const savers = createSaverFactory(log)
  const registry = createRegistry()
  registry.register(noteModule(moduleOver))

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
    // 本物の host（App.tsx）は pushModal を経由し、同じ key の要求を積み上げず
    // 置き換える。この偽物が単純な append のままだと、guardIssues の
    // 「key で置き換える」契約（sequence M3）を確かめるテストが、実装の正しさとは
    // 無関係に「積み上がる」で落ちてしまう
    showModal: (request) => { modals = pushModal(modals, request); log.push('showModal') },
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
    const result = await h.controller.openFolder(DIR)
    expect(result).toBe(true)
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
    const result = await h.controller.openFolder(DIR)
    expect(result).toBe(false)
    expect(h.files()).toBe(before)
    expect(h.banners().io).toContain('読み込めないファイルがあるため開けませんでした')
  })

  // 指摘2であわせて足したテスト群: openFolder の戻り値（boolean）契約。
  // switchFolder（App.tsx）は `opened` が true のときだけ端末を殺す
  // （設計 決定12）ので、false を返すべき箇所で誤って true を返すと、
  // フォルダを切り替えられなかったのに実行中の Claude Code だけを失う
  // 事故になる。false になる4分岐（closeCurrentFile の flush 失敗／
  // トークンすり替わり2箇所／scan.unreadable／catch）を1つずつ確かめる

  it('closeCurrentFile の flush が失敗したら false を返す（フォルダを切り替えない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().flushOk = false
    const result = await h.controller.openFolder('C:\\proj2')
    expect(result).toBe(false)
  })

  it('スキャン中に別の openFolder が割り込んだら、先行の呼び出しは false を返す（トークンすり替わり・scan 成功後）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    const realScan = h.io.scan
    // オブジェクトの1プロパティに持たせる（`let` の素の変数だと、クロージャの
    // 中でしか代入していないケースで TS の制御フロー解析が `never` へ
    // narrow してしまい `?.()` が呼べなくなるため）
    const release: { current: (() => void) | null } = { current: null }
    let callCount = 0
    h.io.scan = (dir) => {
      callCount++
      if (callCount === 1) {
        return new Promise((resolve) => {
          release.current = () => resolve(realScan(dir))
        })
      }
      return realScan(dir)
    }
    const first = h.controller.openFolder(DIR)
    // 2本目が先に完了して selectSeq を進める
    await h.controller.openFolder(DIR)
    expect(release.current).not.toBeNull()
    release.current?.()
    expect(await first).toBe(false)
  })

  it('スキャンが失敗している間に別の openFolder が割り込んだら、先行の呼び出しは false を返す（トークンすり替わり・catch 内）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    const realScan = h.io.scan
    const rejectRef: { current: (() => void) | null } = { current: null }
    let callCount = 0
    h.io.scan = (dir) => {
      callCount++
      if (callCount === 1) {
        return new Promise((_resolve, reject) => {
          rejectRef.current = () => reject(new Error('boom'))
        })
      }
      return realScan(dir)
    }
    const first = h.controller.openFolder(DIR)
    await h.controller.openFolder(DIR)
    expect(rejectRef.current).not.toBeNull()
    rejectRef.current?.()
    expect(await first).toBe(false)
  })

  it('スキャンが例外を投げたら banner を出して false を返す（catch）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    h.io.scan = async () => {
      throw new Error('boom')
    }
    const result = await h.controller.openFolder(DIR)
    expect(result).toBe(false)
    expect(h.banners().io).toContain('フォルダの読み込みに失敗しました')
  })

  it('前のフォルダのモーダル要求を掃除する', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    expect(h.log).toContain('clearModals')
  })

  it('前のフォルダの二択回答待ちを持ち越さない（さもないと以後ずっと閉じられなくなる）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    expect(h.modals().some((m) => m.kind === 'choice')).toBe(true)
    // 回答する前に別フォルダを開く
    await h.controller.openFolder('C:\\proj2')
    await expect(h.controller.requestClose()).resolves.toBe(true)
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

  it('result.title を新しい title で引き直す（一覧の表示が古いまま残らない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const module = h.registry.get('note')!
    h.controller.applyEdit(p('a.json'), module, {
      schemaVersion: 1,
      type: 'note',
      title: '受注フロー',
      body: '',
    })
    const entry = h.files().find((f) => f.path === p('a.json'))!
    expect(entry.result.status === 'editable' && entry.result.title).toBe('受注フロー')
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

  it('回答待ちの二択があるファイルを削除しても、閉じられなくならない（I-1 回帰）', async () => {
    const h = await openAndSelect()
    // ①未保存編集がある状態にする
    h.savers.current().unsaved = true
    // ②削除確認ダイアログを出す（キュー＝[delete:a.json]）
    h.controller.requestDelete(h.files()[0])
    const deleteRequest = h.modals()[0]
    if (deleteRequest.kind !== 'confirm') throw new Error('confirm ではない')
    // ③その間に外部が同じファイルを書き換える → ask へ倒れ、pendingAsk が立つ
    //   （二択は削除確認より後ろに積まれるので画面には出ない）
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    expect(h.modals().some((m) => m.kind === 'choice')).toBe(true)
    // ④削除を確定する → deleteFile が external:a.json の二択ダイアログを drop する
    await deleteRequest.onConfirm()
    expect(h.log).toContain(`dropModal:external:${p('a.json')}`)
    // ⑤ダイアログごと取り下げたので、回答待ちの信号（pendingAsk）も一緒に落ちていること。
    //   さもないと requestClose は「もう存在しないダイアログ」を待って永久に false を返す
    await expect(h.controller.requestClose()).resolves.toBe(true)
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
    // 自動保存が書いたことにする（writeAndRecord 相当を saver 経由で再現）
    await h.savers.current().spec.write(note('A', 'x'))
    const from = h.log.length
    await h.controller.externalChange()
    expect(h.log.slice(from)).not.toContain('toast')
    // 自己書き込み除外が壊れると、検知時点で saver.hasUnsaved() が true になっており
    // planExternalChange は必ず ask（二択）に倒れる——このときトーストは1件も出ない。
    // つまり上の toast 検査だけでは「壊れた状態」と区別できない。二択・履歴の作り直し・
    // saver の停止のいずれも起きていないことまで見て、初めて「本当に何も起きなかった」
    // と言える
    expect(h.log.slice(from)).not.toContain('showModal')
    expect(h.log.slice(from)).not.toContain('setDocument')
    expect(h.log.slice(from)).not.toContain('dispose')
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

  it('「自分の編集で上書き」は、外部変更で壊れた表示（rejected）を editable へ戻す', async () => {
    // 前マイルストーンのレビューで見つかった行き止まり：ディスクは自分の内容に
    // 直っているのに「このファイルは開けません」の表示が残り、しかも台帳が一致する
    // ので再走査でも直らない。overwriteWithMine の repaired 再分類がこれを塞ぐ
    const h = await opened()
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.setDocument({ schemaVersion: 1, type: 'note', title: 'A', body: '自分の編集' })
    // 外部変更でスキーマ違反にする（body が無い）
    h.disk.files.set(p('a.json'), JSON.stringify({ schemaVersion: 1, type: 'note', title: 'A' }))
    await h.controller.externalChange()
    // 検知直後は一覧の表示が rejected に落ちている
    expect(h.files().find((f) => f.path === p('a.json'))?.result.status).not.toBe('editable')
    const request = h.modals().at(-1)
    if (request?.kind !== 'choice') throw new Error('choice ではない')
    await request.onPrimary()
    // 自分の編集で上書きした後は editable へ戻っていること（行き止まりにしない）
    const entry = h.files().find((f) => f.path === p('a.json'))
    expect(entry?.result.status).toBe('editable')
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
    // 消えたファイル宛ての削除確認も取り下げる。残すと、確定したときに
    // trashFile が「もう無いファイル」を消しに行って失敗する（deleteFile 側と同じ失敗モード）
    expect(h.log).toContain(`dropModal:delete:${p('a.json')}`)
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

describe('requestClose（ウィンドウ close のゲート）', () => {
  it('開いているファイルが無ければ閉じてよい', async () => {
    const h = createHarness()
    await expect(h.controller.requestClose()).resolves.toBe(true)
  })

  it('保留編集を書き切れたら閉じてよい', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await expect(h.controller.requestClose()).resolves.toBe(true)
  })

  it('flush に失敗したら閉じず、脱出口を出す', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().flushOk = false
    await expect(h.controller.requestClose()).resolves.toBe(false)
    const request = h.modals().at(-1)
    expect(request?.kind).toBe('confirm')
    expect(request?.key).toBe('close')
  })

  it('脱出口は destroy を呼び、saver の参照も捨てる', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().flushOk = false
    await h.controller.requestClose()
    const request = h.modals().at(-1)
    if (request?.kind !== 'confirm') throw new Error('confirm ではない')
    await request.onConfirm()
    expect(h.log).toContain('forceClose')
    // 参照を捨てているので、次の close は「開いているファイルが無い」で通る
    await expect(h.controller.requestClose()).resolves.toBe(true)
  })

  it('脱出口の失敗は無音にしない', async () => {
    const h = createHarness({ [p('a.json')]: note('A') }, { forceClose: () => Promise.reject(new Error('busy')) })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().flushOk = false
    await h.controller.requestClose()
    const request = h.modals().at(-1)
    if (request?.kind !== 'confirm') throw new Error('confirm ではない')
    await request.onConfirm()
    expect(h.banners().io).toContain('ウィンドウを閉じられませんでした')
  })

  it('二択の回答待ちの間は閉じない（守るはずの編集を黙って捨てない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.savers.current().unsaved = true
    h.disk.files.set(p('a.json'), note('A', '外部が書いた'))
    await h.controller.externalChange()
    await expect(h.controller.requestClose()).resolves.toBe(false)
    expect(h.toasts().at(-1)?.message).toContain('選ぶまで閉じられません')
  })
})

/** 額縁が module.outputs から選んで渡す想定。テストでは先頭を使う */
function firstOutput(h: { registry: ModuleRegistry }) {
  return h.registry.get('note')!.outputs[0]
}

describe('Markdown 出力', () => {
  it('コピーはモジュールの toMarkdown を編集中データに適用する', async () => {
    const copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const h = createHarness({ [p('a.json')]: note('A', '本文') }, { copyText })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    h.setDocument({ schemaVersion: 1, type: 'note', title: 'A', body: '編集後' })
    await h.controller.copyMarkdown(firstOutput(h))
    expect(copyText).toHaveBeenCalledWith('## A\n\n編集後\n')
    expect(h.toasts().at(-1)?.message).toContain('クリップボードにコピーしました')
  })

  it('コピーの失敗はバナーに出す', async () => {
    const h = createHarness(
      { [p('a.json')]: note('A') },
      { copyText: () => Promise.reject(new Error('denied')) },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    expect(h.banners().io).toContain('クリップボードにコピーできませんでした')
  })

  it('書き出しは .json を .md に替えた既定パスを提示し、選ばれた先へ書く', async () => {
    const askSavePath = vi.fn<(defaultPath: string) => Promise<string | null>>()
      .mockResolvedValue('C:\\out\\a.md')
    const h = createHarness({ [p('a.json')]: note('A', '本文') }, { askSavePath })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.exportMarkdown(firstOutput(h))
    expect(askSavePath).toHaveBeenCalledWith(`${DIR}\\a.md`)
    expect(h.disk.files.get('C:\\out\\a.md')).toBe('## A\n\n本文\n')
  })

  it('キャンセルは失敗ではない（何も書かず、バナーも出さない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') }, { askSavePath: async () => null })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const from = h.log.length
    await h.controller.exportMarkdown(firstOutput(h))
    expect(h.log.slice(from).some((l) => l.startsWith('write:'))).toBe(false)
    expect(h.banners().io).toBeNull()
  })

  it('開けないファイルを選んでいるときは何もしない', async () => {
    const copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const h = createHarness({ [p('broken.json')]: '{ not json' }, { copyText })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('broken.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    expect(copyText).not.toHaveBeenCalled()
  })

  it('選択中モジュールのものでないプロファイルでは書き出さない', async () => {
    const askSavePath = vi.fn<(defaultPath: string) => Promise<string | null>>()
      .mockResolvedValue('C:\\out\\a.md')
    const h = createHarness({ [p('a.json')]: note('A') }, { askSavePath })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    // 別ツールのプロファイル。型の違うデータを食わせると事故になる
    await h.controller.exportMarkdown({
      id: 'alien',
      label: 'よそ者',
      fileSuffix: '',
      toMarkdown: () => 'よそ者の出力',
    })
    expect(h.disk.files.has('C:\\out\\a.md')).toBe(false)
    expect(h.toasts().at(-1)?.message).toMatch(/書き出しませんでした/)
  })

  it('fileSuffix を既定ファイル名に足す', async () => {
    // 保存先を選ばずキャンセルするので、確かめるのは提示された既定名だけ
    const askSavePath = vi.fn<(defaultPath: string) => Promise<string | null>>()
      .mockResolvedValue(null)
    const h = createHarness({ [p('a.json')]: note('A') }, { askSavePath })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.exportMarkdown({
      id: 'support',
      label: 'サポート向け',
      fileSuffix: '-サポート向け',
      toMarkdown: () => '',
    })
    expect(askSavePath).toHaveBeenCalledWith(`${DIR}\\a-サポート向け.md`)
  })
})

describe('ensureFileOfType', () => {
  it('走査後に外部が書いたファイルを再走査で拾い、2つ目を作らない', async () => {
    const h = createHarness()
    await h.controller.openFolder(DIR)
    // 空フォルダを開いた後に Skill が用語集を書いた状況（M4 の申し送りのデータ喪失経路）
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

/** askSavePath を手で解決できるようにする（ダイアログが開いている間を再現する） */
function pendingSavePath() {
  let release: (path: string | null) => void = () => {}
  const askSavePath = vi
    .fn<(defaultPath: string) => Promise<string | null>>()
    .mockImplementation(() => new Promise((resolve) => { release = resolve }))
  return { askSavePath, release: (path: string | null) => release(path) }
}

describe('exportMarkdown: 保存ダイアログを開いている間の変化', () => {
  it('その間に内容が変わったら、最新の内容を書く', async () => {
    const { askSavePath, release } = pendingSavePath()
    const h = createHarness({ [p('a.json')]: note('A', '古い本文') }, { askSavePath })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const done = h.controller.exportMarkdown(firstOutput(h))
    // ダイアログが開いている数秒〜数分の間に外部変更の取り込みが走った状況
    h.setDocument({ schemaVersion: 1, type: 'note', title: 'A', body: '新しい本文' })
    release('C:\\out\\a.md')
    await done
    expect(h.disk.files.get('C:\\out\\a.md')).toBe('## A\n\n新しい本文\n')
  })

  it('その間に選択が変わったら書き出さない', async () => {
    const { askSavePath, release } = pendingSavePath()
    // note モジュールは singleton なので、この描写のとおり2つ開くと単一性違反が
    // 出力ガード（sequence M3）を引いてしまう。ここでの主題は選択変更のレースで
    // あって単一性ではないので、singleton を切って無関係な確認を避ける
    const h = createHarness(
      { [p('a.json')]: note('A'), [p('b.json')]: note('B') },
      { askSavePath },
      { singleton: false },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    const done = h.controller.exportMarkdown(firstOutput(h))
    await h.controller.selectFile(p('b.json'))
    release('C:\\out\\a.md')
    await done
    // b の内容を a.md として書くのは明らかな事故
    expect(h.disk.files.has('C:\\out\\a.md')).toBe(false)
    expect(h.toasts().at(-1)?.message).toMatch(/書き出しませんでした/)
  })
})

describe('削除確認の取り下げ', () => {
  it('削除が確定したら同じファイルの削除確認を取り下げる', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    h.controller.requestDelete(h.files()[0])
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm 以外が積まれた')
    await request.onConfirm()
    // 残すと、外部で消えた後に確定したとき trashFile が失敗する
    expect(h.log).toContain(`dropModal:delete:${p('a.json')}`)
  })
})

describe('出力: 整合性エラーがあるファイル', () => {
  const badIssue: ConsistencyIssue = {
    rule: 'duplicate-id',
    message: 'ノートの ID が重複しています: note_X',
    locations: [],
  }

  it('コピーは確認を挟み、承認するまでクリップボードへ書かない', async () => {
    const copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const h = createHarness(
      { [p('a.json')]: note('A', '本文') },
      { copyText },
      { checkConsistency: () => [badIssue] },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    expect(copyText).not.toHaveBeenCalled()
    expect(h.modals()).toHaveLength(1)

    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm を期待した')
    await request.onConfirm()
    expect(copyText).toHaveBeenCalledWith('## A\n\n本文\n')
  })

  it('確認の本文に指摘の件数と各メッセージが載る', async () => {
    const h = createHarness(
      { [p('a.json')]: note('A', '本文') },
      {},
      { checkConsistency: () => [badIssue] },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm を期待した')
    expect(request.description).toContain('1 件')
    expect(request.description).toContain('ノートの ID が重複しています: note_X')
  })

  it('describeIssueEffect を持つプロファイルは、その1文が本文の末尾に載る', async () => {
    const h = createHarness(
      { [p('a.json')]: note('A', '本文') },
      {},
      {
        checkConsistency: () => [badIssue],
        outputs: [
          {
            id: 'default',
            label: 'Markdown',
            fileSuffix: '',
            toMarkdown: () => '## A\n',
            describeIssueEffect: () => '図には「（未解決）」が立ちます。',
          },
        ],
      },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm を期待した')
    expect(request.description.endsWith('図には「（未解決）」が立ちます。')).toBe(true)
  })

  it('指摘が多いときは先頭5件だけ並べ、残りの件数を言う（黙って隠さない）', async () => {
    const many = Array.from({ length: 8 }, (_v, i): ConsistencyIssue => ({
      rule: 'duplicate-id',
      message: `指摘${i + 1}`,
      locations: [],
    }))
    const h = createHarness({ [p('a.json')]: note('A', '本文') }, {}, { checkConsistency: () => many })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm を期待した')
    expect(request.description).toContain('指摘5')
    expect(request.description).not.toContain('指摘6')
    expect(request.description).toContain('ほか 3 件')
  })

  it('書き出しも同じ確認を挟む', async () => {
    const askSavePath = vi.fn<() => Promise<string | null>>().mockResolvedValue(p('a.md'))
    const h = createHarness(
      { [p('a.json')]: note('A', '本文') },
      { askSavePath },
      { checkConsistency: () => [badIssue] },
    )
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.exportMarkdown(firstOutput(h))
    expect(askSavePath).not.toHaveBeenCalled()
    const request = h.modals()[0]
    if (request.kind !== 'confirm') throw new Error('confirm を期待した')
    await request.onConfirm()
    expect(askSavePath).toHaveBeenCalled()
  })

  it('同じ操作を繰り返しても確認は積み上がらない（key で置き換える）', async () => {
    const h = createHarness({ [p('a.json')]: note('A', '本文') }, {}, { checkConsistency: () => [badIssue] })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    await h.controller.copyMarkdown(firstOutput(h))
    expect(h.modals()).toHaveLength(1)
  })
})

describe('出力: 整合性エラーが無いファイル', () => {
  it('確認を挟まずそのままコピーする（未定義があっても確認しない）', async () => {
    const copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    // note モジュールの checkConsistency は既定で [] を返す。
    // **未定義（空フィールド）は整合性エラーではない**——出力に（未定義）として
    // 残すのが規約であり、正常な「まだ決めていない」状態である
    const h = createHarness({ [p('a.json')]: note('A', '') }, { copyText })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    await h.controller.copyMarkdown(firstOutput(h))
    expect(h.modals()).toHaveLength(0)
    expect(copyText).toHaveBeenCalled()
  })
})

describe('出力: ファイル未選択', () => {
  it('未選択では何もしない（コピーも保存ダイアログもモーダルも起きない）', async () => {
    const copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const askSavePath = vi.fn<(defaultPath: string) => Promise<string | null>>().mockResolvedValue(null)
    const h = createHarness({ [p('a.json')]: note('A', '本文') }, { copyText, askSavePath })
    await h.controller.openFolder(DIR)
    // 「編集中データなし」分岐と観測を分ける（open-issues が記録していた重なり）——
    // 編集中データはあるのに選択が無い状況を作る。これで出力が止まる理由は
    // 選択が無いことの側に限定される。
    // なお currentDocument の `selectedPath === null` の early return 自体は、
    // その直後の `files.find` が selectedPath: null で必ず外れるため、行を消しても
    // 観測差が出ない（black-box では変異を検知できない）。このテストが固定するのは
    // 「未選択で出力操作を呼んでも無害」という挙動であって、特定の行ではない
    h.setDocument({ schemaVersion: 1, type: 'note', title: 'A', body: '編集中' })
    await h.controller.copyMarkdown(firstOutput(h))
    await h.controller.exportMarkdown(firstOutput(h))
    expect(copyText).not.toHaveBeenCalled()
    expect(askSavePath).not.toHaveBeenCalled()
    expect(h.modals()).toHaveLength(0)
    expect(h.banners().io).toBeNull()
  })
})

describe('interleaving（走査・選択の直列化ガード）', () => {
  const DIR2 = 'C:\\proj2'
  const p2 = (name: string) => `${DIR2}\\${name}`

  /**
   * io.scan の呼び出しを1回だけ手動 Promise で止める差し込み。
   * capture: true は「呼ばれた時点のディスク」を即座に読んでおく（古い
   * スナップショットとして後から着地させるため）。false は release 時に読む
   */
  function deferNextScan(h: Harness, capture: boolean) {
    const realScan = h.io.scan
    const release: { current: (() => void) | null } = { current: null }
    const calls = { count: 0 }
    h.io.scan = (dir) => {
      calls.count++
      if (calls.count === 1) {
        // capture 時は呼ばれた瞬間に読む——release 時に読み直すと最新と同じ
        // 内容になり、「古い結果を捨てた」ことと区別できなくなる
        //（教訓「区別したい2つの実装が同じ答えを返す入力を選ばない」）
        const snapshot = capture ? realScan(dir) : null
        return new Promise((resolve) => {
          release.current = () => resolve(snapshot ?? realScan(dir))
        })
      }
      return realScan(dir)
    }
    return { release, calls }
  }

  it('フォルダ切替中に届いた監視イベントでは再走査しない（旧フォルダの通知や一覧上書きを出さない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A'), [p2('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    const { release, calls } = deferNextScan(h, false)
    // 新フォルダの走査が止まったまま＝切替中
    const opening = h.controller.openFolder(DIR2)
    // その間に旧フォルダで外部変更が起きて監視イベントが届く
    h.disk.files.set(p('c.json'), note('C'))
    const from = h.log.length
    await h.controller.externalChange()
    // 再走査ごと捨てる: io.scan は呼ばれず、一覧も通知も動かない。
    // ここを通すと、旧フォルダの「ファイルが増えました」が切替の最中に出たり、
    // 旧フォルダの内容が新しい一覧を上書きしたりする
    expect(calls.count).toBe(1)
    expect(h.log.slice(from)).not.toContain('setFiles')
    expect(h.log.slice(from)).not.toContain('toast')
    release.current?.()
    await expect(opening).resolves.toBe(true)
    expect(h.files().map((f) => f.name)).toEqual(['b.json'])
  })

  it('遅れて着地した古い走査結果は捨てる（後続の再走査が作った新しい一覧を上書きしない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    const { release } = deferNextScan(h, true)
    // 古い走査（c.json をまだ知らないスナップショット）が止まっている
    const first = h.controller.externalChange()
    h.disk.files.set(p('c.json'), note('C'))
    // 新しい走査が先に着地して c.json を一覧へ足す
    await h.controller.externalChange()
    expect(h.files().map((f) => f.name)).toContain('c.json')
    const from = h.log.length
    release.current?.()
    await first
    // 古い結果が着地しても、c.json を「外部で削除された」ことにしない
    expect(h.files().map((f) => f.name)).toContain('c.json')
    expect(h.log.slice(from)).not.toContain('setFiles')
    expect(h.toasts().every((t) => !t.message.includes('削除されました'))).toBe(true)
  })

  // 書けない側の記録: ガードの `projectDir !== dir` 節だけを単独で赤くする入力は
  // 存在しない——openFolder も後続の rescan も必ず scanSeq を進めるので、dir が
  // 変わるときは常に token 節が先に捕まえる。dir 節は防御的な二重化であり、
  // black-box では変異を検知できない（教訓「書かない判断をしたら、なぜ書けないかを記録する」）
  it('旧フォルダの遅い走査結果が、切替後の新フォルダの一覧を上書きしない', async () => {
    const h = createHarness({ [p('a.json')]: note('A'), [p2('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    const { release } = deferNextScan(h, true)
    // 旧フォルダ A の走査が止まっている間に、B への切替が先に完了する
    const first = h.controller.externalChange()
    await h.controller.openFolder(DIR2)
    expect(h.files().map((f) => f.name)).toEqual(['b.json'])
    release.current?.()
    await first
    // A の走査結果（a.json）が B の一覧に混ざらない
    expect(h.files().map((f) => f.name)).toEqual(['b.json'])
    expect(h.toasts().every((t) => !t.message.includes('ファイルが増えました'))).toBe(true)
  })

  it('開いていたファイルが外部で消えたら、進行中の selectFile を捨てる（選び直さず、読み込みエラーも出さない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    // 2度目の selectFile を closeCurrentFile の flush で止める。selectFile が
    // selectedPath を持ったまま await しているのはこの窓だけ（read 待ちの間は
    // closeCurrentFile が先に選択を null にしている）ので、「進行中の selectFile が
    // ある状態で gone が着地する」interleaving はここでしか作れない
    const saver = h.savers.current()
    const releaseFlush: { current: (() => void) | null } = { current: null }
    saver.flush = () =>
      new Promise((resolve) => {
        releaseFlush.current = () => resolve(true)
      })
    const second = h.controller.selectFile(p('a.json'))
    // flush を待っている間に、外部で a.json が消えて検知が着地する
    h.disk.files.delete(p('a.json'))
    await h.controller.externalChange()
    expect(h.toasts().at(-1)?.message).toContain('外部で削除されました')
    expect(h.selectedPath()).toBeNull()
    releaseFlush.current?.()
    // ここが reject したら、closeCurrentFile が gone の後始末（saver = null）と
    // 衝突している（本タスクの修正対象）
    await second
    // selectSeq++ の仕事: 着地した selectFile は何もしない——消えたファイルを
    // 読みに行った失敗を「ファイルの読み込みに失敗しました」としてユーザーに出さない
    expect(h.selectedPath()).toBeNull()
    expect(h.document()).toBeNull()
    expect(h.banners().io).toBeNull()
  })
})
