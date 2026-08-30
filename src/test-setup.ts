/**
 * Vitest の setupFiles。jsdom 環境のための前処理だけを置く。
 *
 * jsdom は canvas を実装しておらず、getContext は元から null を返す
 * （canvas-font.ts の createCanvasMeasurer はそれを見て概算器に落ちる）。
 * ただし jsdom は呼ばれるたび VirtualConsole へ "Not implemented" を1行吐く。
 * エディタ3種のテストで 493 行——`npm test` の出力の 94% を占めていた。
 * **返り値は null のまま**にして通知だけ止める。測定のフォールバック経路は
 * 変わらない。
 *
 * environment が 'node' のテストでは HTMLCanvasElement が無いので触らない。
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext
}
