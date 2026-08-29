import { useId } from 'react'
import { AtSign, Folder, Plus, Trash2 } from 'lucide-react'
import { Badge } from './Badge'
import { buttonBase } from '@/components/button-styles'
import type { FileGroup } from '@/core/file-grouping'
import { canCreateFileOfType } from '@/core/file-ops'
import { UNTITLED } from '@/core/load'
import { displayTitle, type ProjectFile } from '@/core/project-file'
import type { AnyToolModule } from '@/core/registry'

export interface FileListProps {
  /** 種類ごとにまとめて並べ替え済みの一覧（`groupFiles` の結果。順序はコアが決める） */
  groups: FileGroup[]
  selectedPath: string | null
  /** 新規作成の選択肢。レジストリの登録順（rev 6章。ツールは増える前提） */
  modules: AnyToolModule[]
  /**
   * 走査済み全ファイルの type（読めなかったファイルは null）。
   * singleton モジュールの新規作成ボタンを、既に1つあるかどうかで
   * disabled にするために canCreateFileOfType へそのまま渡す
   */
  existingTypes: readonly (string | null)[]
  /** プロジェクトフォルダを開いているか。未選択なら操作を一切出さない */
  projectOpen: boolean
  /** 開いているプロジェクトフォルダ。一覧の直上に出す（額縁の帯から移設） */
  projectDir: string | null
  onSelect: (file: ProjectFile) => void
  onCreate: (module: AnyToolModule) => void
  onDelete: (file: ProjectFile) => void
  /**
   * そのファイルを Claude Code ペインへ渡す（M28）。**選択は動かさない**——
   * 編集中のファイルを開いたまま別のファイルを渡せることが、この動線の要点
   */
  onHandoff: (file: ProjectFile) => void
}

/**
 * U+200E LEFT-TO-RIGHT MARK。パス表示の先頭に1文字だけ置く（使う理由は使用箇所に書いた）。
 * **エスケープのまま書くこと**——生の文字は幅を持たず、差分でもエディタでも見えない
 */
const LTR_MARK = '\u200e'

/**
 * ファイル1行。**`useId` を使うために切り出している**——
 * `aria-describedby` は id で結ぶ必要があり、map の中では id を作れない
 */
function FileRow(props: {
  file: ProjectFile
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  onHandoff: () => void
}) {
  const { file } = props
  const label = displayTitle(file)
  // **同じ文字列を2度言わない。** displayTitle がファイル名に落ちたとき
  //（title が読めないファイル）、素朴に併記すると
  //「壊れた.json（壊れた.json）」になる。
  // 見えている行も同じ条件で畳む——アクセシブル名だけ畳んで主表示と副表示に
  // 同じファイル名を2行並べると、目で見る側にだけ重複が残る
  const showFileName = label !== file.name
  const fullName = showFileName ? `${label}（${file.name}）` : label
  const descId = useId()
  return (
    // items-stretch で削除ボタンが行の高さいっぱいになる（要望8）。
    // 行の区切りは rule-muted（弱い境界。要望9。M27 で grid から分離）
    <li className="flex items-stretch border-b border-rule-muted">
      <button
        type="button"
        // **title だけにしないこと。** title は空にも重複にもなりうるので、
        // 一意なファイル名を併記して accessible name の一意性を保つ。
        // 逆にファイル名だけにすると、見えているラベル（主表示＝title）が
        // accessible name に含まれない（WCAG 2.5.3 Label in Name）
        aria-label={`${fullName} を開く`}
        aria-describedby={descId}
        className={`min-w-0 flex-1 border-l-2 px-4 py-2 text-left text-base ${
          props.selected ? 'border-ink bg-canvas' : 'border-transparent hover:bg-canvas'
        }`}
        onClick={props.onSelect}
      >
        {/* `(無題)` は人間がつけた名前ではないので弱く出す（設計スペック）。
            実在の title と見分けがつかないと「名前をつけ忘れた」が伝わらない */}
        <span className={`block truncate ${label === UNTITLED ? 'text-ink-muted' : 'text-ink'}`}>
          {label}
        </span>
        <span id={descId} className="block truncate text-sm text-ink-muted">
          {showFileName && file.name}
          {file.result.status === 'rejected' && <span className="ml-1 text-invalid">開けない</span>}
          {file.result.status === 'listOnly' && <span className="ml-1">編集不可</span>}
          {file.issues.length > 0 && (
            <Badge variant="invalid" className="ml-1">{file.issues.length}</Badge>
          )}
        </span>
      </button>
      {/* Claude Code へ渡す（M28）。**選択状態は動かさない**——編集中のファイルを
          開いたまま、別のファイルを渡せるのがこのボタンの存在理由。
          開けない・編集不可のファイルにも出す——渡す先は Claude であって
          facet ではないので、facet が開けないことは渡せない理由にならない
          （削除ボタンと同じ判断） */}
      <button
        type="button"
        aria-label={`${fullName} を Claude Code に渡す`}
        title={`${fullName} を Claude Code に渡す`}
        className={`${buttonBase} shrink-0 px-3 text-ink-muted hover:bg-canvas hover:text-ink`}
        onClick={props.onHandoff}
      >
        <AtSign aria-hidden className="size-4" />
      </button>
      {/* 開けない・編集不可のファイルにも削除を出す——単一性違反の解消には
          「壊れている方の用語集を消す」が必要で、そこを塞ぐと外部エディタを
          強いることになる（rev 5章「拒否は最小限に」のファイル操作への適用）。
          削除は常時 `ink-muted`、ホバーでだけ無効軸の赤を借りる
          （rev 9章 規約5。赤を借りる唯一の例外） */}
      <button
        type="button"
        aria-label={`${fullName} を削除`}
        title={`${fullName} を削除`}
        className={`${buttonBase} shrink-0 px-3 text-ink-muted hover:bg-canvas hover:text-invalid`}
        onClick={props.onDelete}
      >
        <Trash2 aria-hidden className="size-4" />
      </button>
    </li>
  )
}

/**
 * ファイル一覧の額縁（rev 6章）。新規作成・削除・赤バッジを持つ。
 * 表示だけを担い、状態も I/O も持たない（配線は App）
 */
export function FileList(props: FileListProps) {
  if (!props.projectOpen) {
    return (
      <p className="p-4 text-base text-ink-muted">
        プロジェクトフォルダを開くと JSON ファイルの一覧が出ます。
      </p>
    )
  }
  return (
    <div className="flex h-full flex-col">
      {/* 作成ボタンは縦積みで幅をそろえる。**flex-wrap で横に流さない**——
          ツール名の長さで折り返し位置が変わり、行ごとに端が揃わなくなる。
          帯自体は `shrink-0`（一覧が長くなっても流れない。スクロールを持つのは
          下の一覧だけ） */}
      <div className="flex shrink-0 flex-col gap-1 border-b border-rule p-2">
        {props.modules.map((module) => {
          const creatable = canCreateFileOfType(module, props.existingTypes)
          const Icon = module.icon
          return (
            <button
              key={module.type}
              type="button"
              disabled={!creatable}
              title={creatable ? undefined : `${module.displayName}はプロジェクトに1つまでです`}
              className={`${buttonBase} w-full justify-start gap-2 border border-rule px-2 py-1 text-sm text-ink hover:bg-canvas disabled:hover:bg-transparent`}
              onClick={() => props.onCreate(module)}
            >
              <Plus aria-hidden className="size-3.5 shrink-0" />
              <Icon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{module.displayName}を新規作成</span>
            </button>
          )
        })}
      </div>
      {/* パスは一覧の直上。長さが青天井なので truncate で受け、全文は title。
          帯なので `shrink-0`（スクロールを持つのは下の一覧だけ） */}
      {props.projectDir !== null && (
        <div
          className="flex shrink-0 items-center gap-1.5 border-b border-rule px-2 py-1.5 text-sm text-ink-muted"
          title={props.projectDir}
        >
          <Folder aria-hidden className="size-3.5 shrink-0" />
          {/* 末尾（フォルダ名）の方が手がかりになるので、頭を省く。省略記号を
              左端に出すのは `dir="rtl"` の仕事（行の終端＝左になる）。
              **中身の先頭には LTR_MARK が要る。** `/Users/me/proj` の先頭 `/` は
              中立文字で、両隣が「行頭（RTL 基準）」と「U（LTR）」で食い違うため
              双方向アルゴリズムの規則 N2 で埋め込み方向（RTL）に倒れ、
              並べ替えの結果 `Users/me/proj/` と描かれる。`C:\proj` は先頭が
              強い LTR なのでこの症状が出ない——Windows のパスだけで確かめないこと。
              強い LTR を1文字前置すると先頭 `/` の両隣が LTR で揃い（規則 N1）、
              全体が1つの LTR 実行に収まる。文字自体は幅ゼロで読み上げも素通りする */}
          <span className="min-w-0 flex-1 truncate text-left" dir="rtl">
            {LTR_MARK}
            {props.projectDir}
          </span>
        </div>
      )}
      {/* スクロールするのはここだけ（上の帯は固定）。**この責務を親の aside へ
          戻さないこと**——aside 側で overflow を持つと帯ごと流れる */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {props.groups.length === 0 ? (
          <p className="p-4 text-base text-ink-muted">
            このフォルダに JSON ファイルがありません。上のボタンで作成できます。
          </p>
        ) : (
          props.groups.map((group, i) => (
            <div key={group.key}>
              {/* 見出しは装飾ではなく文書構造なので heading。面は M8 の
                  「見出しの面」トークンを使う（rev 9章）。
                  **h2 にすること。** 額縁の h1（`facet`）の直下で、間に入る
                  見出しは無い（エディタの h2 は M13 で帯へ一本化した）ので、
                  h3 にするとレベルが飛ぶ。

                  **罫線は上に置く（下ではない）。** 見出しとその下の行は同じ
                  グループなので、間に線を引くと属するもの同士を分断する。
                  区切るべきは「前のグループの最後の行」と「次の見出し」の間。
                  先頭だけ線を外すのは、真上の新規作成ボタンの帯が既に
                  `border-b border-rule` を持っており、二重線になるため */}
              <h2
                className={`bg-surface-muted px-4 py-1 text-base font-medium tracking-wide text-ink-muted ${
                  i === 0 ? '' : 'border-t border-rule'
                }`}
              >
                {group.heading}
              </h2>
              <ul>
                {group.files.map((file) => (
                  <FileRow
                    key={file.path}
                    file={file}
                    selected={file.path === props.selectedPath}
                    onSelect={() => props.onSelect(file)}
                    onDelete={() => props.onDelete(file)}
                    onHandoff={() => props.onHandoff(file)}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
