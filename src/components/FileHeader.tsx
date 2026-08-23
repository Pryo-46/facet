export interface FileHeaderProps {
  /** 現在の title（空文字もそのまま渡す） */
  title: string
  /** 副表示。ファイル名は識別子ではないので小さく出す（rev 5章） */
  fileName: string
  /**
   * false なら読み取り専用。**rejected / listOnly のファイルに書き込む入口を
   * 作らないため**——データを書けないファイルに編集 UI を出すと、
   * 保存されない入力を受け付けることになる
   */
  editable: boolean
  onTitleChange: (next: string) => void
}

/**
 * 選択中ファイルの名前の帯（額縁。rev 6章）。
 * 表示だけを担い、状態も I/O も持たない（配線は App）。
 *
 * **4ツール共通でここに置く。** キャンバス系（ロジックツリー・シーケンス）は
 * エディタ側に title の置き場所が無く、モジュールごとに実装すると
 * 4箇所に散る。用語集・エラーカタログのエディタが持っていた見出しは
 * ここへ一本化した
 */
export function FileHeader(props: FileHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-rule bg-surface px-6 py-2">
      <input
        type="text"
        aria-label="ファイルの名前"
        value={props.title}
        readOnly={!props.editable}
        placeholder="(無題)"
        className={`min-w-0 flex-1 border-b bg-transparent text-base font-bold outline-none ${
          props.editable
            ? 'border-transparent text-ink focus:border-ink'
            : 'border-transparent text-ink-muted'
        }`}
        onChange={(e) => {
          if (props.editable) props.onTitleChange(e.target.value)
        }}
      />
      {/* **種類名は出さない。** 一覧の見出しが既に種類を示しているので、
          帯にも出すと同じことを2箇所で言うことになる（人間の裁定。M13 実機確認）

          **`shrink-0` を付けないこと。** 付けると span が常に内容ぶんの幅を取り、
          `truncate` が永久に発火しないまま、長いファイル名が主役の入力欄を
          押し潰す。ファイル名は副表示なので、狭いときに縮んで `…` になる方を採る
          （`truncate` の overflow:hidden が flex の自動最小幅を 0 にするので、
          `min-w-0` は要らない）

          ファイル名は副表示なので `ink-muted`。**透過は掛けない**——
          トークンのコントラスト保証の外に出る（M21 で全面禁止） */}
      <span className="truncate text-xs text-ink-muted">{props.fileName}</span>
    </div>
  )
}
