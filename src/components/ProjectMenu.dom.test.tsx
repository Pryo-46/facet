// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RegisteredProject } from '@/core/projects'
import { ProjectMenu, triggerTextClass, type ProjectMenuProps } from './ProjectMenu'

afterEach(cleanup)

const juchu: RegisteredProject = {
  path: 'C:\\work\\juchu',
  name: '受注管理',
  favorite: false,
  lastOpenedAt: '2026-01-01T00:00:00.000Z',
}
const zaiko: RegisteredProject = {
  path: 'C:\\work\\zaiko',
  name: '在庫照会',
  favorite: true,
  lastOpenedAt: '2026-02-01T00:00:00.000Z',
}

function makeProps(over: Partial<ProjectMenuProps> = {}): ProjectMenuProps {
  return {
    projects: [juchu, zaiko],
    activePath: null,
    missing: new Set(),
    onCheckMissing: vi.fn(),
    onSwitch: vi.fn(),
    onAdd: vi.fn(),
    onToggleFavorite: vi.fn(),
    onRename: vi.fn(),
    onRemove: vi.fn(),
    onRelocate: vi.fn(),
    ...over,
  }
}

/** メニューを開く。ExportMenu.dom.test.tsx と同じ形（Radix の作法） */
async function openMenu(triggerName: string) {
  fireEvent.pointerDown(screen.getByRole('button', { name: triggerName }), {
    button: 0,
    ctrlKey: false,
  })
  await screen.findByRole('menu')
}

describe('ProjectMenu: 行を包む div の中に置いた項目と入れ子のサブメニューが引ける', () => {
  it('行を包む div の中の DropdownMenuItem が menuitem として引ける', async () => {
    render(<ProjectMenu {...makeProps()} />)
    await openMenu('プロジェクトを切り替え')
    expect(await screen.findByRole('menuitem', { name: '受注管理' })).toBeTruthy()
  })

  it('行の中の DropdownMenuSubTrigger を押すと DropdownMenuSubContent の項目が引ける', async () => {
    render(<ProjectMenu {...makeProps()} />)
    await openMenu('プロジェクトを切り替え')
    const subTrigger = await screen.findByRole('menuitem', { name: '受注管理 の操作' })
    fireEvent.click(subTrigger)
    expect(await screen.findByRole('menuitem', { name: 'プロジェクト名を変更' })).toBeTruthy()
  })
})

describe('ProjectMenu: 並び順', () => {
  it('お気に入りの行がその他の行より前に出る', async () => {
    render(<ProjectMenu {...makeProps()} />)
    await openMenu('プロジェクトを切り替え')
    const favoriteRow = await screen.findByRole('menuitem', { name: '在庫照会' })
    const otherRow = await screen.findByRole('menuitem', { name: '受注管理' })
    // favoriteRow が otherRow より前（DOCUMENT_POSITION_FOLLOWING = otherRow は favoriteRow の後）
    expect(
      favoriteRow.compareDocumentPosition(otherRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})

describe('ProjectMenu: お気に入り操作', () => {
  it('お気に入りのボタンを押すと onToggleFavorite が呼ばれ、押した後も一覧の項目が引ける', async () => {
    const onToggleFavorite = vi.fn()
    render(<ProjectMenu {...makeProps({ onToggleFavorite })} />)
    await openMenu('プロジェクトを切り替え')
    const star = await screen.findByRole('menuitem', { name: '受注管理 をお気に入りにする' })
    fireEvent.click(star)
    expect(onToggleFavorite).toHaveBeenCalledWith(juchu)
    // preventDefault によりメニューは閉じていない
    expect(await screen.findByRole('menuitem', { name: '受注管理' })).toBeTruthy()
  })
})

describe('ProjectMenu: 行を押す', () => {
  it('行を押すと onSwitch がその登録で呼ばれる', async () => {
    const onSwitch = vi.fn()
    render(<ProjectMenu {...makeProps({ onSwitch })} />)
    await openMenu('プロジェクトを切り替え')
    fireEvent.click(await screen.findByRole('menuitem', { name: '受注管理' }))
    expect(onSwitch).toHaveBeenCalledWith(juchu)
  })

  it('missing に入っているパスの行は見つからないヒントを持ち、押すと onRelocate が呼ばれる', async () => {
    const onSwitch = vi.fn()
    const onRelocate = vi.fn()
    render(
      <ProjectMenu
        {...makeProps({ missing: new Set([juchu.path]), onSwitch, onRelocate })}
      />,
    )
    await openMenu('プロジェクトを切り替え')
    const hint = screen.getByText('見つからない — 押して選び直す')
    // 行そのもの（本体の menuitem）を押す。お気に入り・省略記号のボタンも
    // 同じ「受注管理」を含む名前を持つため、ヒントの祖先から辿って一意に選ぶ
    const row = hint.closest('[role="menuitem"]')
    if (row === null) throw new Error('行の menuitem が見つからない')
    fireEvent.click(row)
    expect(onRelocate).toHaveBeenCalledWith(juchu)
    expect(onSwitch).not.toHaveBeenCalled()
  })
})

describe('ProjectMenu: 一覧から外す', () => {
  it('activePath と同じ行の省略記号メニューに一覧から外すが出ない', async () => {
    render(<ProjectMenu {...makeProps({ activePath: juchu.path })} />)
    // アクティブなときはトリガーの表示がその名前になる
    await openMenu('受注管理')
    fireEvent.click(await screen.findByRole('menuitem', { name: '受注管理 の操作' }))
    expect(await screen.findByRole('menuitem', { name: 'プロジェクト名を変更' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: '一覧から外す' })).toBeNull()
  })

  it('activePath と異なる行の省略記号メニューには一覧から外すが出る', async () => {
    render(<ProjectMenu {...makeProps({ activePath: zaiko.path })} />)
    await openMenu('在庫照会')
    fireEvent.click(await screen.findByRole('menuitem', { name: '受注管理 の操作' }))
    expect(await screen.findByRole('menuitem', { name: '一覧から外す' })).toBeTruthy()
  })
})

describe('ProjectMenu: 表示名の重複', () => {
  it('表示名が重なっている行にだけパスが出る。重なっていない行には出ない', async () => {
    const dup: RegisteredProject = {
      path: 'C:\\work\\juchu2',
      name: '受注管理',
      favorite: false,
      lastOpenedAt: '2026-01-02T00:00:00.000Z',
    }
    render(<ProjectMenu {...makeProps({ projects: [juchu, dup, zaiko] })} />)
    await openMenu('プロジェクトを切り替え')
    // 重なっている行にはパスが2件とも出る
    expect(screen.getByText(juchu.path)).toBeTruthy()
    expect(screen.getByText(dup.path)).toBeTruthy()
    // 重なっていない行（在庫照会）にはパスが出ない
    expect(screen.queryByText(zaiko.path)).toBeNull()
  })
})

describe('ProjectMenu: 登録が空のとき', () => {
  it('トリガーのアクセシブル名が「プロジェクトを追加」で、押すと onAdd が呼ばれる', () => {
    const onAdd = vi.fn()
    render(<ProjectMenu {...makeProps({ projects: [], onAdd })} />)
    const trigger = screen.getByRole('button', { name: 'プロジェクトを追加' })
    fireEvent.click(trigger)
    expect(onAdd).toHaveBeenCalled()
    // ドロップダウンではない（メニューを開こうとしても出てこない）
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger.getAttribute('aria-haspopup')).toBeNull()
  })

  // 素のボタンとドロップダウンの区別は `aria-haspopup` に出る。テストが
  // その属性で経路を分けるので、1件でも登録があればトリガー側に立つことを縛る
  it('登録が1件あればトリガーがドロップダウンを名乗る', () => {
    render(<ProjectMenu {...makeProps({ projects: [juchu] })} />)
    const trigger = screen.getByRole('button', { name: 'プロジェクトを切り替え' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
  })
})

describe('triggerTextClass', () => {
  it('枠に収まる名前は最大の文字サイズで出す', () => {
    // 全角7文字ぶん＝112px。184px の枠に 16px のまま収まる
    expect(triggerTextClass('sample-project')).toBe('text-base')
  })

  it('収まらなくなったぶんだけ文字サイズを落とす', () => {
    // 全角12文字は 16px なら 192px で溢れ、14px なら 168px で収まる
    expect(triggerTextClass('あいうえおかきくけこさし')).toBe('text-sm')
  })

  it('下限の段でも収まらない名前は下限の段のまま出す', () => {
    // 体系の下限は 14px。ここから先は省略記号が引き取る
    expect(triggerTextClass('あ'.repeat(40))).toBe('text-sm')
  })

  it('半角は全角の半分の幅として数える', () => {
    // 同じ文字数でも、半角なら最大の段のまま収まる
    expect(triggerTextClass('a'.repeat(22))).toBe('text-base')
    expect(triggerTextClass('あ'.repeat(22))).toBe('text-sm')
  })
})
