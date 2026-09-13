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
        {/* ホバーで出す操作。opacity-0 group-hover:opacity-100 だけで隠すと、
            キーボードで到達したとき（ホバーが起きない）見えなくなる。
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
      <Button variant="outline" onClick={props.onAdd}>
        <Plus aria-hidden className="size-4" />
        {ADD_LABEL}
      </Button>
    )
  }

  // **並び順は sortProjects の戻り値をそのまま使う。** ここで favorite の
  // 有無ごとに作り直すと、区切りの位置と実際の並び順が別の情報源から来て
  // 食い違いうる——区切りは「並び済みの配列のどこで favorite が尽きるか」を
  // 数えるだけにする
  const sorted = sortProjects(props.projects)
  const duplicated = duplicatedNames(props.projects)
  const active = props.projects.find((p) => p.path === props.activePath) ?? null
  const favoriteCount = sorted.filter((p) => p.favorite).length
  // お気に入りとその他を分ける区切りは、両方の群が空でないときだけ置く
  const showSeparator = favoriteCount > 0 && favoriteCount < sorted.length

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
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Folder aria-hidden className="size-4" />
          <span className="max-w-40 truncate">{active?.name ?? SWITCH_LABEL}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
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
