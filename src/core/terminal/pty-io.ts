/**
 * 端末の I/O の口（コア・型だけ）。**コアは Tauri を知らない**——
 * 額縁が `src/fs/pty.ts` の実装を注入する（`AppIo` と同じ流儀）
 */
export interface PtySpawnSpec {
  program: string
  args: string[]
  cwd: string
  cols: number
  rows: number
  onData: (bytes: Uint8Array) => void
  /** 子が終了した。code が null なら終了コードを取れなかった */
  onExit: (code: number | null) => void
}

export interface PtyIo {
  spawn(spec: PtySpawnSpec): Promise<number>
  write(id: number, data: string): Promise<void>
  resize(id: number, cols: number, rows: number): Promise<void>
  kill(id: number): Promise<void>
}

/** 端末で起動するもの。**ここが「Rust に判断を置かない」の実体** */
export const CLAUDE_PROGRAM = 'claude'
export const CLAUDE_ARGS: readonly string[] = []
