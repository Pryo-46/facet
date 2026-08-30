/**
 * 表示用の日付（`YYYY-MM-DD`）。
 *
 * **課題ツリーの `date` は手で打たせない**——アプリと登録 Skill が追記時に入れる。
 * 手入力の欄にすると更新忘れで嘘をつく（ミュータブルなステータス欄を捨てたのと
 * 同じ理屈）。厳密な時刻は Git 履歴が正なので、粒度は日で足りる。
 *
 * **ローカル時刻で作る。** `toISOString()` は UTC へ寄せるので、東側の時間帯では
 * 夜に打った記録が翌日、西側では朝の記録が前日になる。会議が行われた日を
 * 書きたいのだから、書き手のローカルの日が正である。
 *
 * **引数で注入できるのは `src/core/new-id.ts` の `randomBytes` と同じ理由**
 *——呼ぶ側（`commands.ts`）を純関数のまま保ち、テストが「今日」に依存しないようにする
 */
export function todayString(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
