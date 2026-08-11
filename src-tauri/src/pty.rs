//! PTY（擬似端末）のホスト。
//!
//! **判断を一切置かない**（rev 7章の例外3つ目。`move_to_trash` と同じ性格）。
//! 実行ファイル名・引数・作業ディレクトリは TypeScript 側が決めて渡す。
//! このファイルに `claude` という文字列は現れない。

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

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

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
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
        .insert(id, PtySession { master: pair.master, writer, killer });
    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: tauri::State<'_, PtyState>, id: u32, data: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions.get_mut(&id).ok_or("その端末はもうありません")?;
    session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    session.writer.flush().map_err(|e| e.to_string())
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
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.killer.kill();
    }
    Ok(())
}
