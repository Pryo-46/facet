import { Channel, invoke } from '@tauri-apps/api/core'
import type { PtyIo, PtySpawnSpec } from '@/core/terminal/pty-io'

/**
 * PTY の Tauri 実装（コアは Tauri を知らないので、額縁がこれを注入する）。
 *
 * **自前コマンドは ACL の対象外なので capabilities への追記は要らない**
 *（`moveFileToTrash` と同じ。`docs/project-setup.md`）
 */

type PtyEvent = { event: 'data'; data: { base64: string } } | { event: 'exit'; data: { code: number | null } }

/**
 * 生きている PTY の ID。**アプリを閉じるときに全部殺すために要る**——
 * Windows では ConPTY の子はホストプロセスの終了で自動的には死なず、
 * `claude` が孤児として残る
 */
const live = new Set<number>()

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export const tauriPtyIo: PtyIo = {
  async spawn(spec: PtySpawnSpec): Promise<number> {
    const channel = new Channel<PtyEvent>()
    // pty_spawn 呼び出し前は id が無いので、後で束縛する（下の invoke の結果を待つ）
    let id: number | undefined
    channel.onmessage = (message) => {
      if (message.event === 'data') {
        spec.onData(decodeBase64(message.data.base64))
        return
      }
      // **自然終了でも台帳を片付ける。** Rust 側は流すだけで `sessions` から
      // 除去しない（判断を置かない設計）ので、ここで消さないと `kill` が
      // 呼ばれない限りハンドルが残り続ける。`pty_kill` は既に死んだ id に
      // 対して呼んでも無害（`sessions.remove` が None を返すだけ）
      if (id !== undefined) {
        live.delete(id)
        void invoke('pty_kill', { id }).catch(() => undefined)
      }
      spec.onExit(message.data.code)
    }
    id = await invoke<number>('pty_spawn', {
      program: spec.program,
      args: spec.args,
      cwd: spec.cwd,
      cols: spec.cols,
      rows: spec.rows,
      channel,
    })
    live.add(id)
    return id
  },
  async write(id, data) {
    await invoke('pty_write', { id, data })
  },
  async resize(id, cols, rows) {
    await invoke('pty_resize', { id, cols, rows })
  },
  async kill(id) {
    live.delete(id)
    await invoke('pty_kill', { id })
  },
}

/** 生きている PTY を全部殺す（アプリを閉じる経路から呼ぶ） */
export async function killAllPtys(): Promise<void> {
  const ids = [...live]
  live.clear()
  await Promise.all(ids.map((id) => invoke('pty_kill', { id }).catch(() => undefined)))
}
