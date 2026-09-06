import { invoke } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { exists, readTextFile } from '@tauri-apps/plugin-fs'
import {
  LEGACY_GUIDE_FILENAME,
  LEGACY_GUIDE_MARK,
  LEGACY_SKILL_DIRS,
  type LegacyArtifacts,
} from '@/core/legacy-artifacts'

/**
 * 旧版が置いたものを探す（Tauri 境界）。**読むだけで、消さない。**
 *
 * 失敗は「無い」に倒す。フォルダを開いた直後の余計なエラーで、
 * 本来の作業（ファイルを開く）を邪魔しない
 */
export async function findLegacyArtifacts(projectDir: string): Promise<LegacyArtifacts> {
  // **`.claude/` を読む前に呼ぶ。** これが無いと mac では最初の `exists` が
  // forbidden path で落ちる（理由は `src-tauri/src/lib.rs` の `allow_dot_claude`）
  try {
    await invoke('allow_dot_claude', { dir: projectDir })
  } catch {
    // 許可が取れなくても続ける。取れていれば読めるし、取れていなければ
    // 下の `exists` が失敗して「無い」に倒れる
  }
  const skills: string[] = []
  for (const name of LEGACY_SKILL_DIRS) {
    try {
      if (await exists(await join(projectDir, '.claude', 'skills', name))) skills.push(name)
    } catch {
      // 読めないディレクトリは「無い」とみなす
    }
  }
  let guide = false
  try {
    const path = await join(projectDir, LEGACY_GUIDE_FILENAME)
    guide = (await exists(path)) && (await readTextFile(path)).includes(LEGACY_GUIDE_MARK)
  } catch {
    // 同上
  }
  return { skills, guide }
}
