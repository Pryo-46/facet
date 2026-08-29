/**
 * 端末のコピー／貼り付けの口（コア・型だけ）。**コアは Tauri を知らない**——
 * 額縁が `src/fs/clipboard.ts` の実装を注入する（`PtyIo` と同じ流儀）。
 *
 * この型が要るのは、`src/components/` から `@/fs/` を import しないため。
 * I/O は props で受け取る
 */
export interface ClipboardIo {
  /** クリップボードのテキスト。**載っていなければ空文字**（投げない） */
  readText(): Promise<string>
  writeText(text: string): Promise<void>
}
