import { Fragment } from 'react'
import { Folder, MoreHorizontal, Plus, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createEstimateMeasurer } from '@/core/canvas/wrap'
import { duplicatedNames, sortProjects, type RegisteredProject } from '@/core/projects'

/**
 * ヘッダ左端の、登録済みプロジェクトを選んで切り替えるドロップダウン。
 *
 * **並び順と重複判定はここで作らない。** `sortProjects` / `duplicatedNames`
 * （`src/core/projects.ts`）をそのまま呼ぶ——同じ判定を2箇所に持つと、
 * 一方だけ直して食い違う
 */
export interface ProjectMenuProps {
  projects: readonly RegisteredProject[]
  /** いま開いているプロジェクトのパス。未選択なら null */
  activePath: string | null
  /** 存在しないと分かっているパス。中身は親が持つ */
  missing: ReadonlySet<string>
  /** メニューが開いた瞬間に1回だけ呼ぶ。親が dirsExist を叩いて missing を作る */
  onCheckMissing: () => void
  onSwitch: (project: RegisteredProject) => void
  onAdd: () => void
  onToggleFavorite: (project: RegisteredProject) => void
  onRename: (project: RegisteredProject) => void
  onRemove: (project: RegisteredProject) => void
  /** 見つからない登録のパスを選び直す */
  onRelocate: (project: RegisteredProject) => void
}

/**
 * トリガーの中で名前に残る幅。ヘッダの枠（`w-64`）から、枠の `pl-6` と `pr-6`・
 * ボタンの `px-2.5`・アイコンと `gap-1.5` を引いた値。
 *
 * 枠やボタンの余白を変えるとここもずれる。名前が1段小さくなる境目が動くだけで
 * 見た目は壊れないので、目分量の安全側に取ってある
 */
const TRIGGER_TEXT_WIDTH = 160

/**
 * トリガーの文字サイズの候補。大きい順に試し、最初に収まったものを使う。
 *
 * **下は `text-sm`（14px）で止まる。** 体系の下限がそこで、`text-xs` は
 * `src/styles/conventions.test.ts` が弾く
 */
const TRIGGER_SIZES = [
  { px: 16, className: 'text-base' },
  { px: 14, className: 'text-sm' },
] as const

/**
 * 名前を省略せずに出せる最大の文字サイズ。どの段でも収まらなければ下限の段に
 * 落とし、あふれた分は `truncate` が受ける。
 *
 * **幅は `createEstimateMeasurer` の概算で決める。** キャンバスのレイアウトでは
 * 概算を使わないが、ここはどの段を選ぶかが決まればよく、外した分は省略記号が
 * 引き取る
 */
export function triggerTextClass(name: string, available = TRIGGER_TEXT_WIDTH): string {
  const fit = TRIGGER_SIZES.find((size) => createEstimateMeasurer(size.px)(name) <= available)
  return (fit ?? TRIGGER_SIZES[TRIGGER_SIZES.length - 1]).className
}

const ADD_LABEL = 'プロジェクトを追加'
const MISSING_HINT = '見つからない — 押して選び直す'
/** 登録はあるが、まだどれも開いていないときのトリガーの文言 */
const SWITCH_LABEL = 'プロジェクトを切り替え'

function favoriteLabel(project: RegisteredProject): string {
  return project.favorite
    ? `${project.name} のお気に入りを外す`
    : `${project.name} をお気に入りにする`
}

/**
 * 行を包む `<div>` の中に3つの Radix 項目（本体・お気に入り・省略記号の
 * サブメニュー）を並べる。3つとも Radix の項目にすることで矢印キーが届く。
 *
 * **`DropdownMenuContent` の直下でなくても `role="menuitem"` として引ける。**
 * Radix の Collection は DOM 順で項目を拾うため、間に `<div>` を挟んでも
 * 項目の登録は途切れない
 */
function ProjectRow(props: {
  project: RegisteredProject
  isActive: boolean
  isMissing: boolean
  showPath: boolean
  onPick: () => void
  onToggleFavorite: () => void
  onRename: () => void
  onRemove: () => void
}) {
  const { project } = props
  return (
    <DropdownMenuSub>
      <div className="group flex items-center">
        <DropdownMenuItem className="min-w-0 flex-1" onSelect={props.onPick}>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{project.name}</span>
            {props.showPath && (
              <span className="block truncate text-sm text-ink-muted">{project.path}</span>
            )}
            {props.isMissing && (
              <span className="block truncate text-sm text-invalid">{MISSING_HINT}</span>
            )}
          </span>
        </DropdownMenuItem>
        {/* opacity-0 group-hover:opacity-100 だけで隠すと、キーボードで到達したとき見えない。
            focus-visible:opacity-100 を併せて、矢印キーで来た人にも見せる */}
        <DropdownMenuItem
          aria-label={favoriteLabel(project)}
          className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          // **onSelect で preventDefault を呼ばないとメニューが閉じる。**
          // お気に入りは続けて別の行を触れることが要点なので、ここだけ既定を止める
          onSelect={(event) => {
            event.preventDefault()
            props.onToggleFavorite()
          }}
        >
          <Star aria-hidden className={`size-4 ${project.favorite ? 'fill-current' : ''}`} />
        </DropdownMenuItem>
        <DropdownMenuSubTrigger
          aria-label={`${project.name} の操作`}
          className="shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </DropdownMenuSubTrigger>
      </div>
      <DropdownMenuSubContent>
        <DropdownMenuItem onSelect={props.onRename}>プロジェクト名を変更</DropdownMenuItem>
        {/* いま開いているプロジェクトは一覧から外せない */}
        {!props.isActive && (
          <DropdownMenuItem variant="destructive" onSelect={props.onRemove}>
            一覧から外す
          </DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export function ProjectMenu(props: ProjectMenuProps) {
  // 1件も登録が無いときはメニューを出さない。開いても選択肢が無いメニューには
  // 存在理由が無い（ExportMenu の「押せないときは通常のボタン」と同じ判断）
  if (props.projects.length === 0) {
    return (
      <Button variant="outline" className="w-full justify-start" onClick={props.onAdd}>
        <Plus aria-hidden className="size-4" />
        {ADD_LABEL}
      </Button>
    )
  }

  // **並び順は sortProjects の戻り値をそのまま使う。** favorite の有無ごとに
  // 作り直すと、区切りの位置と並び順が別の情報源から来て食い違いうる
  const sorted = sortProjects(props.projects)
  const duplicated = duplicatedNames(props.projects)
  const active = props.projects.find((p) => p.path === props.activePath) ?? null
  const favoriteCount = sorted.filter((p) => p.favorite).length
  // お気に入りとその他を分ける区切りは、両方の群が空でないときだけ置く
  const showSeparator = favoriteCount > 0 && favoriteCount < sorted.length
  const label = active?.name ?? SWITCH_LABEL

  const pick = (project: RegisteredProject) => {
    if (props.missing.has(project.path)) {
      props.onRelocate(project)
    } else {
      props.onSwitch(project)
    }
  }

  const row = (project: RegisteredProject) => (
    <ProjectRow
      key={project.path}
      project={project}
      isActive={project.path === props.activePath}
      isMissing={props.missing.has(project.path)}
      showPath={duplicated.has(project.name)}
      onPick={() => pick(project)}
      onToggleFavorite={() => props.onToggleFavorite(project)}
      onRename={() => props.onRename(project)}
      onRemove={() => props.onRemove(project)}
    />
  )

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        // **onCheckMissing は onOpenChange が true のときだけ呼ぶ。** 描画のたびに
        // 呼ぶと、一覧を開いていない間もコマンドが飛ぶ
        if (open) props.onCheckMissing()
      }}
    >
      {/* **幅は枠いっぱいで固定する。** 中身なりに伸び縮みさせると、切り替える
          たびにヘッダの左端が動く */}
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-full justify-start">
          <Folder aria-hidden className="size-4" />
          <span className={`min-w-0 flex-1 truncate text-left ${triggerTextClass(label)}`}>
            {label}
          </span>
        </Button>
      </DropdownMenuTrigger>
      {/* 中身なりに縮むと、名前もサブメニューも見切れる。下限を置いて長い名前で
          だけ伸ばす */}
      <DropdownMenuContent align="start" className="min-w-72 max-w-96">
        {sorted.map((project, i) => (
          <Fragment key={project.path}>
            {showSeparator && i === favoriteCount && <DropdownMenuSeparator />}
            {row(project)}
          </Fragment>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={props.onAdd}>{ADD_LABEL}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
