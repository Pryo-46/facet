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

/**
 * 起動中（`pty_spawn` の invoke が in-flight）の spawn。**`killAllPtys` が
 * 取りこぼさないために要る**——`live` への登録は解決後なので、この間に
 * 全殺しが走ると素通りしてしまう
 */
const inflight = new Set<Promise<number>>()

/**
 * 全殺しの世代。`killAllPtys` のたびに1つ進む。in-flight だった spawn は
 * 解決時に自分が始まった世代と比べ、違っていれば `live` へ入れない
 *（`live` は既に空にされているので、入れると次の全殺しまで生き残る）。
 *
 * **真偽値のフラグにしないこと。** 全殺しはアプリ終了だけでなくフォルダ
 * 切替でも走るので、立てっぱなしにすると次のフォルダの端末が台帳に
 * 載らなくなる
 */
let generation = 0

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export const tauriPtyIo: PtyIo = {
  async spawn(spec: PtySpawnSpec): Promise<number> {
    const startedAt = generation
    const channel = new Channel<PtyEvent>()
    // pty_spawn 呼び出し前は id が無いので、後で束縛する（下の invoke の結果を待つ）
    let id: number | undefined
    // **exit が invoke の解決より先に届くことがある。** 子がほぼ即座に落ちる場合
    // （認証切れ・引数違いなど）、Rust 側は spawn 直後に reader/wait スレッドを
    // 起動して Ok(id) を返す前に Exit を送りうる。id が無い間に来た exit は
    // このフラグに記録し、invoke が解決した後で後始末するかどうかを分岐する
    let exited = false
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
      } else {
        exited = true
      }
      spec.onExit(message.data.code)
    }
    const request = invoke<number>('pty_spawn', {
      program: spec.program,
      args: spec.args,
      cwd: spec.cwd,
      cols: spec.cols,
      rows: spec.rows,
      channel,
    })
    inflight.add(request)
    try {
      id = await request
    } finally {
      inflight.delete(request)
    }
    // exit が先着していたら、その場で Rust 側の台帳を片付ける
    if (exited) void invoke('pty_kill', { id }).catch(() => undefined)
    // 待っている間に全殺しが走っていたら `live` へ入れない。**kill は
    // ここから飛ばさない**——`killAllPtys` がこの spawn の解決を待って
    // 殺すので、二重に飛ばす必要がない
    else if (generation === startedAt) live.add(id)
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

/**
 * 生きている PTY を全部殺す（アプリを閉じる経路とフォルダ切替から呼ぶ）。
 *
 * **「これ以降 spawn されない」ことは保証しない。** 待ち合わせるのは
 * `[...inflight]` を取った時点のスナップショットだけで、**それより後に
 * 始まった spawn はこの呼び出しの待ち合わせには入らない**（`live` へは
 * 載る——進めた後の世代を読んで始まるので `generation === startedAt` が
 * 成り立つ。殺されないのはこの呼び出しに限った話で、後続の kill が無い
 * 経路——アプリ終了——でだけ孤児になる）。
 *
 * 現在この不変条件は呼び出し側が守っている——アプリ終了経路では
 * `requestClose()` の解決と `killAllPtys()` の間に何も走らず、フォルダ
 * 切替ではモーダルが入力を止めている。**呼び出し元を増やすときは、
 * 呼んでいる間に新しい spawn が始まりうるかを確かめること**
 */
export async function killAllPtys(): Promise<void> {
  generation += 1
  const ids = [...live]
  live.clear()
  // **起動中の spawn も待って殺す。** ここで待たないと、解決した PTY を
  // 殺す invoke がアプリの終了に間に合わず孤児になる
  const starting = [...inflight].map((request) =>
    request.then((id) => invoke('pty_kill', { id })).catch(() => undefined),
  )
  await Promise.all([
    ...ids.map((id) => invoke('pty_kill', { id }).catch(() => undefined)),
    ...starting,
  ])
}
