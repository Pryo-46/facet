/**
 * 変換確定の Enter を「操作」と取り違えないための判定（rev 10章の IME 規則の補強）。
 *
 * ## なぜ isComposing だけでは足りないのか
 *
 * 仕様では、変換を確定した Enter の keydown は `isComposing === true` で来る。
 * ところが **WebKit は composition 系のイベントを keydown より先に投げる**ため、
 * 確定した瞬間には既に変換が終わったことになっており、その Enter は
 * `isComposing === false` で届く（WebKit bug 165004。2016年の報告から
 * 2026年に main で直るまで開いていた）。
 *
 * これは macOS の WKWebView と Linux の WebKitGTK ——つまり Windows 以外の
 * facet 全部——に効く。Windows（WebView2＝Chromium）だけが仕様どおりなので、
 * **Windows で開発している限り決して踏まない**種類の欠陥である。
 *
 * ## 実測（2026-08-15。実物の CellInput / WKWebView）
 *
 *   50 compositionend                         Δ 409.0
 *   51 keydown  Enter  keyCode=229  isComposing=false  Δ -12.0  ← 確定。行追加に化けていた
 *   52 keyup    Enter  keyCode=13   isComposing=false  Δ  72.0
 *   53 keydown  Enter  keyCode=13   isComposing=false  Δ1561.0  ← 本物。ここは行が増える
 *
 * この1組から2つのことが分かる。**どちらも推測では出てこなかった**:
 *
 * - **`keyCode` が 229。** IME が食った打鍵の予約値で、同じ物理キーでも
 *   離した keyup は本来の 13 に戻る。`isImeProcessingKey` の判別材料
 * - **`compositionend` より keydown の時刻が 12ms 古い。** 届いた順と時刻の順が
 *   逆になる（WebKit は keydown にネイティブイベント本来の時刻を、
 *   compositionend にはディスパッチ時刻を刻む）
 *
 * ## 二段構えにしている理由
 *
 * 主たる判別は `keyCode === 229`。それでも「確定の尾」を時間で見る窓を残すのは、
 * 229 を出さない WebKit の版・環境があったときに素通りさせないため。
 *
 * **窓は単独の判断材料ではない。** 呼び出し側（CellInput）はキーを離した時点で
 * 記録を捨てるので、Chromium の順序——keydown（isComposing: true）→
 * compositionend →キーを離す——では窓に入る打鍵がそもそも来ない。
 * 2つの条件が互いの穴を塞いでいる:
 *
 * - 窓だけだと、Chromium が確定した直後（100ms 以内）の2打目の Enter を握り潰す
 * - keyup だけだと、候補をマウスで選び確定した（キーを離す機会が無い）あとの
 *   最初の Enter を握り潰す
 */
export const COMPOSITION_TAIL_MS = 100

/**
 * 「IME がこの打鍵を処理中」を表す予約値。実在のキーには割り当てられない。
 *
 * WKWebView の実測（2026-08-15）で、**変換を確定した Enter は
 * `isComposing: false` で来るのに `keyCode` は 229 だった**:
 *
 *   compositionend
 *   keydown  Enter  keyCode=229  isComposing=false   ← 行追加に化けていたのはこれ
 *   keyup    Enter  keyCode=13   isComposing=false
 *
 * 同じ物理キーでも、IME が食った keydown だけが 229 になり、離した keyup は
 * 本来の 13 に戻っている。**`isComposing` より信用できる判別材料**である。
 * `keyCode` は非推奨だが、この用途の代替は仕様に存在しない
 */
const IME_PROCESSING_KEYCODE = 229

/** その打鍵を IME が食っているか。keyCode を持たない環境では false */
export function isImeProcessingKey(keyCode: number | undefined): boolean {
  return keyCode === IME_PROCESSING_KEYCODE
}

/**
 * `keyTimeStamp` の打鍵が、直前の変換確定に付随するものか。
 *
 * @param compositionEndedAt 直近の compositionend の時刻。null＝確定を待っていない
 */
export function isCompositionTail(
  keyTimeStamp: number,
  compositionEndedAt: number | null,
): boolean {
  if (compositionEndedAt === null) return false
  // **絶対値で見る。** WKWebView の実測では、compositionend の「後」に届いた
  // 確定の keydown の timeStamp が **20ms 古かった**——WebKit は keydown に
  // ネイティブイベント本来の時刻を、compositionend にはディスパッチ時刻を刻む。
  // `elapsed >= 0` を条件にするとこの尾を取り逃がす。
  // **「後に届いたのだから時刻も後」と決めつけないこと**
  return Math.abs(keyTimeStamp - compositionEndedAt) <= COMPOSITION_TAIL_MS
}
