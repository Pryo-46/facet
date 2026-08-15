//! PTY（擬似端末）のホスト。
//!
//! **判断を一切置かない**（rev 7章の例外3つ目。`move_to_trash` と同じ性格）。
//! 実行ファイル名・引数・作業ディレクトリは TypeScript 側が決めて渡す。
//! このファイルに `claude` という文字列は現れない。

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use base64::Engine as _;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;

/// 1回の読み取りで運ぶ最大バイト数。TUI の1フレームが収まる程度でよい
const READ_BUF: usize = 8192;

#[derive(Clone, Serialize)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum PtyEvent {
    /// **base64 で運ぶ。** ここで String::from_utf8 すると、読み取りの区切りが
    /// マルチバイトの途中に落ちたときに日本語が化ける。デコードは xterm に任せる
    Data { base64: String },
    Exit { code: Option<i32> },
}

/**
 * 書き手。**`sessions` とは別の錠前に入れる**——書き込みは相手（端末の中の
 * プログラム）が読むまで返らないことがあり、その間 `sessions` を握っていると
 * `pty_kill` が錠前待ちになって「詰まった端末を殺せない」になる。
 *
 * **これで消えるのは「同じ錠前を取り合う」という設計上の欠陥であって、
 * 「必ず殺せる」という保証ではない**——Tauri の同期コマンドは main thread で
 * 走るので（`tauri-macros` の `command/wrapper.rs` の `ExecutionContext::Blocking`）、
 * 書き込みが本当に返らなければ後続の IPC ごと止まる。根治は「セッションごとの
 * 書き込みスレッド＋エラーを Channel で返す」で、`docs/open-issues.md` に残す
 */
type SharedWriter = Arc<Mutex<Box<dyn Write + Send>>>;

fn make_writer(writer: Box<dyn Write + Send>) -> SharedWriter {
    Arc::new(Mutex::new(writer))
}

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: SharedWriter,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
pub struct PtyState {
    next_id: Mutex<u32>,
    sessions: Mutex<HashMap<u32, PtySession>>,
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }
}

#[tauri::command]
pub fn pty_spawn(
    state: tauri::State<'_, PtyState>,
    program: String,
    args: Vec<String>,
    cwd: String,
    cols: u16,
    rows: u16,
    channel: Channel<PtyEvent>,
) -> Result<u32, String> {
    let pair = native_pty_system()
        .openpty(size(cols, rows))
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(program);
    for a in args {
        cmd.arg(a);
    }
    cmd.cwd(cwd);

    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // **spawn 後に slave を落とす。** 残すと最後の書き手が消えず、
    // 子が終了しても reader が EOF にならない
    drop(pair.slave);

    let killer = child.clone_killer();
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let id = {
        let mut n = state.next_id.lock().map_err(|e| e.to_string())?;
        *n += 1;
        *n
    };

    let out = channel.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; READ_BUF];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let base64 = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    if out.send(PtyEvent::Data { base64 }).is_err() {
                        break;
                    }
                }
            }
        }
    });

    let done = channel.clone();
    std::thread::spawn(move || {
        let code = child.wait().ok().map(|s| s.exit_code() as i32);
        let _ = done.send(PtyEvent::Exit { code });
    });

    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, PtySession { master: pair.master, writer: make_writer(writer), killer });
    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: tauri::State<'_, PtyState>, id: u32, data: String) -> Result<(), String> {
    state.write(id, &data)
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<'_, PtyState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions.get(&id).ok_or("その端末はもうありません")?;
    session.master.resize(size(cols, rows)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: tauri::State<'_, PtyState>, id: u32) -> Result<(), String> {
    state.kill(id)
}

impl PtyState {
    /// `id` の書き手だけを取り出す。**`sessions` の錠前はこの関数を抜けた
    /// 時点で外れる**
    fn writer(&self, id: u32) -> Result<SharedWriter, String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions.get(&id).ok_or("その端末はもうありません")?;
        Ok(Arc::clone(&session.writer))
    }

    fn write(&self, id: u32, data: &str) -> Result<(), String> {
        let writer = self.writer(id)?;
        let mut writer = writer.lock().map_err(|e| e.to_string())?;
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())
    }

    fn kill(&self, id: u32) -> Result<(), String> {
        // **`remove` の結果を先に束縛する。** そうすることで `sessions` の
        // 錠前はこの文の終わりで外れ、`killer.kill()` は錠前の外で走る
        let removed = self.sessions.lock().map_err(|e| e.to_string())?.remove(&id);
        if let Some(mut session) = removed {
            let _ = session.killer.kill();
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc;
    use std::time::Duration;

    /// 相手が読むまで返らない書き手。`write` に入ったことを `entered` で
    /// 知らせ、`gate` に何か届くまで戻らない——「詰まった端末」の再現
    struct BlockingWriter {
        entered: mpsc::Sender<()>,
        gate: mpsc::Receiver<()>,
    }
    impl Write for BlockingWriter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            let _ = self.entered.send(());
            let _ = self.gate.recv();
            Ok(buf.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    /// 殺されたことだけを記録する killer。子プロセスは起動しない
    #[derive(Debug)]
    struct FakeKiller(std::sync::Arc<AtomicBool>);
    impl ChildKiller for FakeKiller {
        fn kill(&mut self) -> std::io::Result<()> {
            self.0.store(true, Ordering::SeqCst);
            Ok(())
        }
        fn clone_killer(&self) -> Box<dyn ChildKiller + Send + Sync> {
            Box::new(FakeKiller(std::sync::Arc::clone(&self.0)))
        }
    }

    /// 詰まった端末を殺せること。**`pty_write` が `sessions` を握ったまま
    /// ブロッキング書き込みをしていると、`pty_kill` が錠前待ちで返らない**
    #[test]
    fn kill_is_not_blocked_by_a_stuck_write() {
        // master は実物を1つ作る（子プロセスは起動しない）。openpty は
        // mac / Windows のどちらでも通る
        let pair = native_pty_system()
            .openpty(size(80, 24))
            .expect("openpty に失敗した");
        drop(pair.slave);

        let (entered_tx, entered_rx) = mpsc::channel();
        let (gate_tx, gate_rx) = mpsc::channel();
        let killed = std::sync::Arc::new(AtomicBool::new(false));

        let state = PtyState::default();
        state.sessions.lock().unwrap().insert(
            1,
            PtySession {
                master: pair.master,
                writer: make_writer(Box::new(BlockingWriter {
                    entered: entered_tx,
                    gate: gate_rx,
                })),
                killer: Box::new(FakeKiller(std::sync::Arc::clone(&killed))),
            },
        );

        let state = &state;
        std::thread::scope(|scope| {
            scope.spawn(move || {
                let _ = state.write(1, "a");
            });
            // 書き込みが始まって、まだ返っていない状態を作る
            entered_rx
                .recv_timeout(Duration::from_secs(5))
                .expect("書き込みが始まらなかった");

            let (done_tx, done_rx) = mpsc::channel();
            scope.spawn(move || {
                let _ = state.kill(1);
                let _ = done_tx.send(());
            });
            let killed_in_time = done_rx.recv_timeout(Duration::from_secs(2)).is_ok();

            // **assert より先に書き込みを解放する。** ここで先に panic すると、
            // 錠前を握ったままの実装では thread::scope が2本のスレッドの join を
            // 待って永久に止まる（どちらも錠前待ちのまま畳めない）——テストが
            // 「2秒で落ちる」ではなく「固まる」になり、退行したときに何が
            // 起きているのか読めなくなる。解放してから判定すれば、古い実装でも
            // 2本とも畳めて panic が伝播する
            let _ = gate_tx.send(());

            assert!(
                killed_in_time,
                "書き込みが詰まっている間に kill が返らなかった（sessions の錠前を握ったままになっている）",
            );
            assert!(killed.load(Ordering::SeqCst), "killer.kill() が呼ばれていない");
        });
    }
}
