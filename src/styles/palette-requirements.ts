/**
 * `palette.css` が満たすべき**契約**。
 *
 * ★ ここは配色ではない。★ 色値は1つも持たない。「どのトークンが要るか」
 *   「どの面の上で何:1 を満たすべきか」「面どうしの明度差」「意味色の色差」
 *   「どのトークンが無彩色か」だけを持つ。
 *   **配色を差し替えてもこのファイルは変わらない。**
 *
 * 読み手は2つある——`palette.test.ts`（検査する）と
 * `.claude/skills/palette-retheme/scripts/palette-fit.mjs`（差し替え時に測る）。
 * **同じ表を2箇所に書かないためにここへ出した。** 書き写すと、片方だけ
 * 直したときに検算と検査が食い違ったまま両方が緑を返す。
 *
 * **このファイルは上記の `.mjs` から Node の型ストリップで直接 import される**
 * （設計スペック 決定H）。だから消去可能な構文だけで書くこと——`enum` や
 * コンストラクタのパラメータプロパティを入れると型ストリップが落ちる。
 *
 * **下の表（`TOKENS` / `REQUIREMENTS` / `FACE_REQUIREMENTS` / `FACE_PAIRS` /
 * `DISTINCT_PAIRS` / `ACHROMATIC`）を変えたら、次の5箇所を対で直すこと。**
 * `measure.ts` の「定数と Tailwind クラスは必ず対で直す」と同じ約束である
 *（issue-tree-m5 で `judge-yes-face` と `ink-faint` を足したとき、2ラウンド
 * 続けてこれを踏んだ）:
 *
 * 1. `.claude/skills/palette-retheme/SKILL.md` の手順5の表——**面ごとに載る色**と
 *    **ダークの拘束条件**。配色を差し替える人は**ここを読んで L を選ぶ**ので、
 *    拘束条件が古いと「1つの要件だけ見て通る値」を選んで別の要件を割る
 * 2. 同 SKILL.md の「面の文字」の節の**出力行数**（`palette-fit.mjs` が何本印字するか）
 * 3. `src/styles/palette.css` の註の**実測値**。**`palette-fit.mjs` の印字と桁まで
 *    揃える**——道具の出力と註が食い違うと、次に照合する人が「どちらかが古い」と疑う
 * 4. `docs/overview-rev.md` 9章——役割トークンの**数**と、淡い面の L の幅
 * 5. `docs/open-issues.md` の役割トークンの**数**
 *
 * **どれにも機械的な検査は掛からない。** `skill-copy.test.ts` のバイト一致検査は
 * SKILL.md の散文に及ばず、`palette.test.ts` は表を回して `it` を生やすだけで
 * **数を数えない**（1行足せば件数が増えて緑のまま通る）。**だから人が対で直すしかない**
 * ——「テストが緑だから揃っている」とは読まないこと（`MARGIN` の註と同じ構図）。
 */

/** コメントを落としてから読む（`}` を含むコメントがブロック抽出を壊さないように） */
export const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** `:root { ... }` / `.dark { ... }` から `--name: value` を拾う */
export function readTokenBlock(
  css: string,
  selectorPattern: string,
  label: string,
): Record<string, string> {
  const m = new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`).exec(css)
  if (m === null) throw new Error(`${label} のブロックが palette.css に見つからない`)
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const d = /^\s*--([a-z-]+)\s*:\s*([^;]+);/.exec(line)
    if (d !== null) out[d[1]] = d[2].trim()
  }
  return out
}

export const TOKENS = [
  'canvas',
  'surface',
  'surface-muted',
  'ink',
  'ink-muted',
  'ink-faint',
  'rule',
  'rule-muted',
  'grid',
  'missing',
  'invalid',
  'pending',
  'missing-face',
  'invalid-face',
  'pending-face',
  'judge-yes',
  'judge-yes-fg',
  'judge-yes-face',
  'judge-no',
  'judge-no-fg',
] as const

export type Token = (typeof TOKENS)[number]

export const MODES = [
  { label: 'ライト', pattern: ':root' },
  { label: 'ダーク', pattern: '\\.dark' },
] as const

/**
 * 背景に対して満たすべきコントラスト。
 *
 * **`grid` がここに無いのは意図的。** 方眼紙の線は純粋な装飾であり、
 * WCAG 1.4.11（情報を伝える非テキスト UI 要素は 3:1）の対象外。
 * むしろ薄いことに意味がある（M7 設計スペック 決定2）。
 * **`rule-muted`（表の罫線・弱い境界。M27 で `grid` から分離）も同じ扱い**——
 * 行の区切りは行間の余白と互い違いの内容が既に運んでおり、線は補助。
 * 3:1 を課すと `rule` と同じ濃さになり、「見せる境界」と区別が付かなくなる
 */
export const REQUIREMENTS = [
  { token: 'ink', min: 4.5, use: '本文・見出し' },
  { token: 'ink-muted', min: 4.5, use: '抑えた文字' },
  // **非アクティブな内容の文字と枠。** WCAG 1.4.3 は非アクティブ UI 部品を
  // 本文の 4.5:1 から免除しているが、読めなくてよいわけではない——
  // 「いま作業する面ではない」と読めて、かつ消えて見えない段として 3:1 を課す。
  // **アクティブな本文に使わない**（使うと本文の保証を割る）
  { token: 'ink-faint', min: 3.0, use: '非アクティブの文字・枠（抑制された配下）' },
  { token: 'rule', min: 3.0, use: 'セル境界・入力枠' },
  // 意味色3軸は線と文字に使う（面は淡い面 `*-face` の側が持つ）。
  // **文字**に使う以上 4.5:1 が要る。淡い面の上での 4.5:1 は
  // `FACE_REQUIREMENTS` が別に課す——ここは地の3面に対する要件である
  { token: 'missing', min: 4.5, use: '欠落（未定義・未決・仮説なし・保留）の線と文字' },
  { token: 'invalid', min: 4.5, use: '無効（重複・参照切れ・整合性違反）の線と文字' },
  { token: 'pending', min: 4.5, use: '着信（返答していない入力）の線と文字' },
] as const

/**
 * **背景は canvas / surface / surface-muted の3面を見る。**
 * テーブルもカードもモーダルも surface の上に乗るので canvas だけでは足りない
 * （ダークの rule を canvas だけ見て決めたとき surface 上で 2.997:1 と 3:1 を割った）。
 * surface-muted（一段沈んだ面）も、選択中タブ・種類見出し・見送りの箱として
 * 文字とバッジと罫線が載る汎用の面なので、同じ集合に入れる。
 * M8 の `surface-accent` を集合に入れなかった判断（淡い緑を選べなくなる）は、
 * 面が無彩色になった今は効かない——無彩色の面なら 3:1 / 4.5:1 は明度だけで作れる
 */
export const BACKGROUNDS = ['canvas', 'surface', 'surface-muted'] as const

/**
 * 面に載せる色の要件。judge-yes-fg / judge-no-fg は自分の面にしか
 * 載らない専用の文字色で、`BACKGROUNDS` に対して測る意味が無い。
 *
 * **淡い面（`*-face`。M21 の実機確認で追加）も同じ表で見る。** 淡い面は
 * `BACKGROUNDS` には入れない——地ではなく「ここが欠けている／無効だ」と
 * 示すための局所的な面であり、全トークンをその上で測る対象ではない。
 * 代わりに、その面の上に**実際に載る3色**（`ink` の本文・`ink-muted` の
 * 抑えた文字・枠に使う色）だけをここで課す。枠に使う色は面によって違う
 *——欠落・無効・着信は同じ軸の線色、判断（`judge-yes-face`）は `rule` である
 *（下の註を見よ）。
 *
 * **淡い面と `BACKGROUNDS` の分離は測っていない**——淡さ（L 0.93〜0.96）と
 * 1.2:1 以上の分離は両立しないため。ライトの `missing-face` は `canvas` と
 * 同じ L 0.95 で、区別は色相だけである（実測 1.006:1）。実機で見て
 * 足りなければ L を 0.93 まで下げる。**面が地から浮くことを機械で
 * 保証していない**ことを承知のうえで置いた値であり、忘れられた要件ではない
 */
export const FACE_REQUIREMENTS = [
  { token: 'judge-yes-fg', face: 'judge-yes', min: 4.5, use: '支持の面の文字' },
  { token: 'judge-no-fg', face: 'judge-no', min: 4.5, use: '棄却の面の文字' },
  { token: 'ink', face: 'missing-face', min: 4.5, use: '欠落の淡い面の本文' },
  { token: 'ink-muted', face: 'missing-face', min: 4.5, use: '欠落の淡い面の抑えた文字' },
  { token: 'missing', face: 'missing-face', min: 4.5, use: '欠落の淡い面の線と文字' },
  { token: 'ink', face: 'invalid-face', min: 4.5, use: '無効の淡い面の本文' },
  { token: 'ink-muted', face: 'invalid-face', min: 4.5, use: '無効の淡い面の抑えた文字' },
  { token: 'invalid', face: 'invalid-face', min: 4.5, use: '無効の淡い面の線と文字' },
  { token: 'ink', face: 'pending-face', min: 4.5, use: '着信の淡い面の本文' },
  { token: 'ink-muted', face: 'pending-face', min: 4.5, use: '着信の淡い面の抑えた文字' },
  { token: 'pending', face: 'pending-face', min: 4.5, use: '着信の淡い面の線と文字' },
  // **判断の淡い面（`judge-yes-face`）だけ3行目が `rule` である。**
  // 他の3面は自軸の線色（`missing` / `invalid` / `pending`）を枠に使うが、
  // 判断軸には線色のトークンが無い——解決した課題の箱は他の面と揃えて
  // `border-rule` で描く（`IssueBox.tsx`）ので、**その面に実際に載る色**は
  // ink・ink-muted・rule の3つになる。線ではなく枠なので閾値は 3:1
  //（WCAG 1.4.11。`REQUIREMENTS` の `rule` と同じ根拠）
  { token: 'ink', face: 'judge-yes-face', min: 4.5, use: '解決の淡い面の本文' },
  { token: 'ink-muted', face: 'judge-yes-face', min: 4.5, use: '解決の淡い面の抑えた文字（旗の理由）' },
  { token: 'rule', face: 'judge-yes-face', min: 3.0, use: '解決の淡い面に載る箱の枠' },
  // **`ink-faint` を課すのは `judge-yes-face` だけ**——淡い面のうち、これだけが
  // 「箱の地」だからである（他の3面はバッジ・セルという小さな面で、抑制された
  // 内容がその上に乗ることが無い）。解決を掲げた課題の箱の中の仮説行は、
  // **自分の旗で**抑制されて `ink-faint` になり（`derive.ts` の
  // `suppressedIssueIds` は自己包含）、その点と文言の地がこの面になる
  { token: 'ink-faint', face: 'judge-yes-face', min: 3.0, use: '解決の淡い面に載る、抑制された仮説行の点と文言' },
] as const

/**
 * **`judge-yes-face` の上に「面を持つバッジ」が載ることは、ここでは測れない。**
 *
 * この面だけは**箱の地**である（他の3面はバッジ・セルという小さな面）。
 * 地の上には子が乗るので、`BACKGROUNDS` の3面なら全トークンが測られるが、
 * **淡い面は `BACKGROUNDS` に入っていない**（上の註のとおり、それは正しい）
 *——結果として、この面の上に載る子を守る門番は上の4行だけである
 *（`judge-yes-face` の行が他の淡い面より1つ多いのは、これがそのためである）。
 *
 * **いま実際に載るものは上の4行で尽きている。** 解決を掲げた箱の中身は
 * タイトル（`ink`）・理由とシェブロン（`ink-muted`）・箱の枠（`rule`）・
 * 抑制された仮説行（`ink-faint`）と、**旗のバッジ自身**（`judge-yes` の濃い面）
 * である。**仮説の行のバッジも `faint`**（枠と文字が `ink-faint` で面を持たない）
 * ——旗を掲げた課題の行は自分の旗で抑制されるため（`derive.ts` の
 * `suppressedIssueIds` は自己包含）。**面を持たないので地はこの面のままであり、
 * だから `ink-faint` を課している。**
 * **「仮説なし」バッジ（`missing-face` の面）はここには出ない**——
 * `IssueBox.tsx` が `props.warn && placement.event === null` で描いており、
 * 旗が立った箱では排他だからである。開いた箱のパネルは `bg-canvas` に乗る。
 *
 * **`ink-faint` は上の4行目で門番にした。** 一度は「`BACKGROUNDS` 3面に対して
 * 既に 3:1 を課されているから」と見送りかけたが、**この面は地であって
 * `BACKGROUNDS` ではない**——3面に対する保証はここには効かない。
 *
 * **この行が機械で落とすのはダークの L 0.275 以上である**（実測: 0.275 で
 * 2.996:1）。現行のダークが 0.26 なのは `MARGIN` の規律を人が当てた結果で、
 * **0.27 に戻しても検査は緑のまま通る**——理由と実例は `MARGIN` の註を見よ。
 *
 * **測れていないものが1つ残る。旗のバッジ（`judge-yes` の濃い面）とこの面の分離。**
 * 面どうしなので原理的にこの表では測れず、`FACE_PAIRS` も「白黒で判別する」
 * 判断軸の2面のためのものである。実測はライト **1.26:1**・ダーク 8.44:1——
 * **ライトでは緑のバッジが緑の箱にほぼ溶ける。** バッジの中の文字は
 * `judge-yes-fg` が `judge-yes` に対して 4.5:1 を課されているので読めるが、
 * **チップの輪郭は見えない**（`border-transparent` なので枠も無い）。
 * **そのバッジは旗を外すトグルでもある**ので、見つけられないと操作できない。
 * **この見え方は機械では拾えない**——実機で埋もれるなら、バッジ側に枠を与えるか、
 * 面の L を下げるか、面の色相をずらすことになる（どれを採るかは実機を見てから）。
 */

/**
 * 面どうしの明度差。支持と棄却は正反対の結論なので、白黒印刷でも
 * 判別できる 3:1 を課す（UI ノート D15「支持を明るく、棄却を暗く」）
 */
export const FACE_PAIRS = [{ a: 'judge-yes', b: 'judge-no', min: 3.0 }] as const

/**
 * 意味色どうしの識別。**標準・P型・D型のすべてで** OKLab の色差が
 * `DISTINCT_MIN` 以上であること。M7 は warning/ok の色差を印字するだけで
 * 失敗させなかった（M7 決定4）が、意味色が4つに増えた今は
 * 「色は当てにならない」と学習された瞬間に警告機能が死ぬので、門番にする。
 *
 * **満たせないときは 0.08 まで下げてよい。** 下げたらこの定数の隣に
 * 実測値と理由を書く。閾値を黙って消さない（設計スペック 決定5）
 *
 * **淡い面（`missing-face` / `invalid-face` / `pending-face` / `judge-yes-face`）は
 * ここに入れない。**
 * 欠落・無効・着信の識別を運ぶのは線の色と線種（破線／実線）であり、その6組は
 * 上の表で既に3色覚ぶん検査している。**判断の緑が欠落の黄・着信の青と紛れないか**も
 * 同じ表の `missing`/`judge-yes`・`pending`/`judge-yes`・`invalid`/`judge-yes` の3組が
 * 見ており、`judge-yes-face` を足しても識別の担い手はそちら（濃い方）のままである。
 * 淡い面は「目に留まる」ための強調で、
 * 識別の担い手ではない——L 0.93〜0.95 まで白へ寄せた面どうしの色差は
 * 原理的に小さく、実測でも ΔE 0.05 前後（ライトの missing-face / invalid-face が
 * 標準 0.053・D型 0.045）しか出ない。ここへ足せば閾値 0.10 は即座に割れ、
 * **通すために面を濃くすれば「淡い面」であること自体が壊れる**（濃い面は
 * 判断軸に専有させる、が規約2）。面の色差に意味を負わせないのが正しい
 */
export const DISTINCT_PAIRS = [
  { a: 'missing', b: 'invalid' },
  { a: 'missing', b: 'pending' },
  { a: 'missing', b: 'judge-yes' },
  { a: 'invalid', b: 'pending' },
  { a: 'invalid', b: 'judge-yes' },
  { a: 'pending', b: 'judge-yes' },
] as const
export const DISTINCT_MIN = 0.1

/**
 * 無彩色でなければならないトークン。「色を持つのは意味だけ」（rev 9章）を
 * 機械検査にする。微かな暖色（M7 の canvas は C 0.012）も装飾なので弾く
 */
export const ACHROMATIC = [
  'canvas',
  'surface',
  'surface-muted',
  'ink',
  'ink-muted',
  'ink-faint',
  'rule',
  'rule-muted',
  'grid',
  'judge-no',
  'judge-no-fg',
] as const
export const ACHROMATIC_MAX_C = 0.01

/**
 * **書いた C と、実際に出る C のずれの上限。**
 *
 * `oklch(L C H)` は sRGB より広いので、C を上げすぎた値はブラウザ（と
 * `oklchToLinear`）が sRGB へクランプする。クランプされてもコントラストも
 * ΔE も通るため、「C 0.12 の黄土」と書いたまま 0.102 の色が出ている状態を
 * 誰も見つけられない——M21 のライトの `missing` が実際にそうだった。
 * 往復（oklch → 線形 sRGB → oklch）で C が戻るかどうかで見る
 */
export const GAMUT_MAX_C_DRIFT = 0.005

/**
 * 閾値ちょうどを置かない（M7 の教訓）。**この余裕は `palette-fit.mjs` の
 * 提案（`fitLightness` に渡す条件）とも共有する。** 値を変えるならここ
 * 1箇所を直せば両方に効く——書き写すと片方だけ直したときに食い違う。
 *
 * ★★ **`MARGIN` は合否の閾値ではない。** ★★
 *
 * **どこにも「`ratio >= min * MARGIN` なら合格」という判定は無い。**
 * 合否を決めているのは素の閾値だけである:
 *
 * - `palette.test.ts` … `toBeGreaterThanOrEqual(req.min)`（`pair.min` /
 *   `DISTINCT_MIN` も同様）。**`MARGIN` を import すらしていない**
 * - `palette-fit.mjs` … `const ok = ratio >= req.min`（面の文字も面どうしも同じ）。
 *   `MARGIN` が現れるのは `fitLightness` へ渡す `conditions` の中だけで、
 *   それは**「直すならどこまで動かせばよいか」の提案**を作るための目標値である
 *
 * したがって——**「テストが緑」は「`MARGIN` の余裕がある」を意味しない。**
 * 素の閾値を 0.1% 上回るだけの値も緑で通る。**余裕の側を守るのは人だけ**であり、
 * `MARGIN` は機械の門ではなく**値を選ぶときに人が当てる規律**である。
 *
 * **実例（issue-tree-m5）。** `judge-yes-face` のダークを 0.27 から 0.26 へ
 * 下げたのは、この面に載る `ink-faint` が 0.27 では **3.045:1** で、素の 3:1 は
 * 満たすが `MARGIN` 込みの 3.09 に届かなかったからである。**機械はどちらの値でも
 * 緑だった**——0.27 に戻す変異を当てても検査は1本も落ちない（落ち始めるのは
 * 2.996:1 になる L 0.275 から）。0.26 にしたのは人の判断であって、機械の強制ではない。
 *
 * **この2段を混同すると、緑を根拠に余裕の無い値が積み上がる。** 逆に、
 * 「`MARGIN` を割っている」は**テストの失敗ではない**ので、赤くならないことを
 * もって余裕があると読まないこと。
 */
export const MARGIN = 1.03
