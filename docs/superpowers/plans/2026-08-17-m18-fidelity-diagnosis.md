# M18 画像出力の忠実度・画質・余白の診断

> **read-only の調査結果。コードは変更していない。** 実物のライブラリソース
> （`node_modules/html-to-image/src/`、v1.11.13）と本リポジトリの実装を突き合わせた記録。
> 行番号は `node_modules/html-to-image/src/*.ts`（`es/*.js` と実装は同一）を指す。

対象の欠陥は3つ。

1. **ノード・シーケンスの線が見た目通り描画されていない**（ユーザー報告 ＋ 実物の画像で症状確定）
2. **画質がちょっと悪い**
3. **ウインドウを大きくすると余白が巨大になる**（追加報告）

---

## 前提: `html-to-image` が何をしているか

`toBlob` → `toCanvas` → `toSvg` の順で、実際の処理は次の通り（`src/index.ts:15-94`）。

```
toSvg:   getImageSize → cloneNode → embedWebFonts → embedImages → applyStyle → nodeToDataURL
toCanvas: toSvg → createImage(data URL) → canvas.drawImage
toBlob:  toCanvas → canvas.toBlob('image/png', 1)
```

**決定的な性質が2つある。**

- **クローンは元の文書のスタイルシートを一切持たない。** `nodeToDataURL`（`src/util.ts:221-243`）はクローンを
  `<svg><foreignObject>` に入れて `XMLSerializer` で文字列化し、`data:image/svg+xml,...` として `<img>` に食わせる。
  この文書に入る `<style>` は `embedWebFonts` が入れる **@font-face だけ**（`src/embed-webfonts.ts:250-273`、
  `getWebFontRules` が `CSSRule.FONT_FACE_RULE` だけを残す `:185-189`）。
  したがって **クラス由来のスタイルは、クローン時にインライン化されたものしか残らない。**
- インライン化は `cloneCSSStyle`（`src/clone-node.ts:122-164`）が `getComputedStyle` の全プロパティを
  `targetStyle.setProperty` で写すことで行う（Chromium では `getComputedStyle().cssText` が空文字なので
  `:137` の else 分岐＝1プロパティずつ写す経路を通る）。

---

## 欠陥1: SVG の線が見た目通りにならない

### 症状（実物の画像）

- ロジックツリーのエッジ: 細い曲線ではなく **中央が太く両端が尖った黒い三日月状の塗り**
- シーケンスの矢印: **水平線が完全に不可視**、**矢頭（▶）だけが正しい位置に黒く**描かれる
- ライフラインの縦線（`border-l` の DOM 要素）・参加者の箱・文字は正常

### 根本原因（確定）

**`html-to-image` は `<svg>` の内側の要素に対して `cloneCSSStyle` を一度も呼ばない。**

```
src/clone-node.ts:75-76   const isSVGElement = (node) => node.tagName?.toUpperCase() === 'SVG'
src/clone-node.ts:69      return node.cloneNode(isSVGElement(node)) as T   // ← svg だけ deep clone
src/clone-node.ts:83-85   async function cloneChildren(...) {
                            if (isSVGElement(clonedNode)) { return clonedNode }   // ← ここで打ち切り
src/clone-node.ts:251-265 cloneNode = cloneSingleNode → cloneChildren → decorate → ensureSVGSymbols
```

`<svg>` に当たると `cloneSingleNode` が `cloneNode(true)`（deep clone）で丸ごと複製し、`cloneChildren` は即 return する。
その結果、**`<svg>` の子孫は `cloneNode` を通らないので `decorate`（＝`cloneCSSStyle`）が一切適用されない。**
子孫に残るのは属性だけ——`class="stroke-ink"` は残るが、それを解決する CSS はシリアライズ先の文書に存在しない。

さらに `<svg>` ルート自身には `cloneCSSStyle` が効くため、Chromium の computed style に含まれる
**継承プロパティ `fill`（初期値 `rgb(0,0,0)`）と `stroke`（初期値 `none`）がインラインで書き込まれ、子へ継承される。**
（仮にこの継承が起きなくても、宣言が無ければ各要素は初期値 `fill: black` / `stroke: none` に落ちるので結論は同じ。
 **どちらの経路でも結果は「塗りは黒、線は無し」で一致する** ——この診断はプロパティ列挙の細部に依存しない。）

観測された症状はこの帰結と完全に一致する:

| 実装 | 画面 | 書き出し |
| --- | --- | --- |
| `TreeEdges.tsx:62` `<path className="fill-none stroke-rule" strokeWidth={1}>` | 細い淡グレーの曲線 | `fill: black` が効き、開曲線と弦の間が塗られて**三日月**。`stroke` は none |
| `SequenceEdges.tsx:72` `<line className="stroke-ink" strokeWidth="1.5">` | ink の水平線 | `stroke: none` → **不可視**（`strokeWidth` は属性なので生きているが塗る色が無い） |
| `SequenceEdges.tsx:42` `<path d="M0,0 L8,4 L0,8 z" className="fill-ink">`（marker） | ink の塗り矢頭 | `fill` 初期値の**黒**で描かれる → 見える（色だけ僅かにずれる） |
| `SequenceEdges.tsx:52` `<path className="fill-none stroke-ink" strokeWidth="1.3">`（開き矢頭） | 開いた「く」の字 | `fill: black` で**塗り潰された三角**になるはず（open 矢頭が solid に見える） |

**「`stroke-*` は失われると消え、`fill-*` は失われると黒になる」という非対称が、症状の非対称を説明している。**
ライフラインの縦線・箱・文字が正常なのは、それらが HTML 要素で `cloneCSSStyle` を正しく通っているから。

### 併せて確認したこと（原因ではない）

- **`oklch()` は原因ではない。** computed style は `oklch(0.205 0 89.9)` の形のまま `setProperty` に渡り、
  シリアライズ後にレンダリングするのも同じ Chromium（WebView2）なので解決できる。実物の画像で
  参加者の箱やライフラインが正しい色で出ていることが、oklch が生き残っている証拠でもある。
- **`marker` の id 参照は切れていない。** `<defs>` は `<svg>` の deep clone に含まれ、`url(#seq-arrow-solid)` は
  同一文書内で解決される。実物の画像で矢頭が正しい位置に出ていることが実証になっている。
  （副次的に、`stroke: none` でも marker は描かれることも実物で確定した。）
- **入れ子 `<svg>` の `overflow: visible` も、少なくとも今回の図では効いている**（矢頭が正しい位置に出ている）。
  ただし「**svg 自身の箱（＝ウインドウ寸法）より外**に出る内容が描かれるか」は、図がウインドウより
  大きい状態で書き出さないと確かめられない。下の「静的読解では分からないこと」に回した。

### 確認のいちばん安い方法

実物の画像で既に確定しているので追加検証は必須ではないが、機序まで確かめるなら
`npm run tauri dev` の WebView の DevTools コンソールで:

```js
// 1. 実 DOM ではクラスが効いている
getComputedStyle(document.querySelector('[data-layer="edges"] line')).stroke   // → oklch(...) が返る
// 2. ライブラリと同じ deep clone を作るとインラインスタイルは付かない
document.querySelector('[data-layer="edges"]').cloneNode(true)
  .querySelector('line').getAttribute('style')                                 // → null
// 3. ルート svg には fill/stroke が写ることの確認
getComputedStyle(document.documentElement).stroke                              // → "none"
getComputedStyle(document.documentElement).fill                                // → "rgb(0, 0, 0)"
```

**jsdom では原理的に検証できない。** canvas も SVG ラスタライズも無く、`getComputedStyle` は
クラスを解決しない。「クローンに style 属性が付かないこと」までは jsdom でも書けるが、
それは `html-to-image` の内部実装のテストになる。実効性のあるテストは次項の修正案の側にある。

### 修正案

#### 案A（推奨）: SVG のペイントをプレゼンテーション属性へ移す

`SequenceEdges.tsx` / `TreeEdges.tsx` の4要素に、**クラスはそのまま残して**属性を足す。

```
SequenceEdges.tsx:31  <svg className="... text-ink">              ← currentColor の出所を明示（既定でも ink だが明示する）
SequenceEdges.tsx:42  <path ... className="fill-ink" fill="currentColor">
SequenceEdges.tsx:52  <path ... className="fill-none stroke-ink" fill="none" stroke="currentColor">
SequenceEdges.tsx:72  <line ... className="stroke-ink" stroke="currentColor">
TreeEdges.tsx:57      <svg className="... text-rule">             ← エッジ色は rule
TreeEdges.tsx:62      <path ... className="fill-none stroke-rule" fill="none" stroke="currentColor">
```

- **画面の見た目は保証されて変わらない。** プレゼンテーション属性は作者スタイルシートより
  優先度が低く、実 DOM ではこれまで通りクラスが勝つ。属性が効くのは
  「クラスを解決する CSS が存在しない」クローンの中だけ。
- **`currentColor` が使えるのは `color` が `cloneCSSStyle` でルート `<svg>` にインライン化され、
  子へ継承されるから。** 色値をコンポーネントに直書きしないので、
  `src/styles/conventions.test.ts` / `palette.test.ts` の「色値は palette.css だけ」規約に抵触しない。
- **テストの牙**: `SequenceEdges` / `TreeEdges` の DOM テストで
  `expect(line).toHaveAttribute('stroke', 'currentColor')` を書けば、jsdom でも回帰を止められる。
  「クラスだけに戻す」リファクタで必ず落ちる。
- コスト: 2ファイル・6行 ＋ テスト2〜4件。

**リスク**: 低い。唯一の注意は `text-rule` / `text-ink` を `<svg>` に足すことで、
その svg 内の他の `currentColor` 利用（現在は無い）が将来巻き込まれること。
また、**この案は「今ある4要素」しか守らない**——次に SVG を足す人が同じ罠を踏む。

#### 案B（補完・任意）: `captureImagePng` で SVG 子孫の computed paint をインライン化する

`toBlob` の直前に、実 DOM の `root.querySelectorAll('svg *')` を歩いて
`fill` / `stroke` / `stroke-width` / `stroke-dasharray` / `stroke-linecap` / `stroke-linejoin` /
`fill-opacity` / `stroke-opacity` / `opacity` を `el.style` へ書き、`finally` で戻す。
インライン style 属性は deep clone で複製されるので、クローンに残る。

- 利点: **将来の SVG（lucide のアイコン含む）にも効く一般解。** 案A の「次の人が踏む」を塞ぐ。
- 欠点: 既に transform でやっている実 DOM の書き換えをもう1段増やす。要素数ぶんの
  `getComputedStyle`（強制レイアウト）でキャプチャが遅くなる。復元漏れのリスクが増える
  （transform と同じ `finally` パターンで書けるが、対象が可変個になる）。
- `html-to-image` に `onclone` 相当のフックは**無い**（`Options` は `src/types.ts` の通り）。
  クローンに手を入れる正規の口は無く、実 DOM を触るしかない。
  なお `options.fontEmbedCSS` は `<style>` としてクローン先頭に注入される（`src/embed-webfonts.ts:255-272`）ので、
  ここに任意の CSS を差し込む裏口が存在する——ただし色値を JS 側で組み立てることになり、
  「色値は palette.css だけ」の規約と正面から衝突するので**採らない方がよい**。

**まず案A、必要なら後から案B** を勧める。

---

## 欠陥2: 画質がちょっと悪い

### 根本原因（確定・2要因）

**(a) `pixelRatio` が未指定なので `window.devicePixelRatio` になる。**

```
src/index.ts:38     const ratio = options.pixelRatio || getPixelRatio()
src/util.ts:109-130 getPixelRatio() { ... return ratio || window.devicePixelRatio || 1 }
src/index.ts:42-43  canvas.width = canvasWidth * ratio; canvas.height = canvasHeight * ratio
```

`getPixelRatio` の前半（`src/util.ts:112-128`）は `process.env.devicePixelRatio` を見るが、
本アプリの `vite.config.ts` に `define` は無く、ブラウザに `process` は存在しない。
`try { FINAL_PROCESS = process }` が ReferenceError を投げて catch され、
**戻り値は常に `window.devicePixelRatio`。**

Windows の表示スケールが 100% なら `devicePixelRatio === 1` なので、
**PNG は CSS ピクセルと 1:1**。図を 100% で見ればほぼ画面通りだが、
資料に貼って拡大した瞬間に文字も線もぼける。125% スケールなら 1.25 という
中途半端な倍率になり、これはこれで補間でにじむ。

`captureImagePng`（`src/core/image-export.ts:64-76`）は `width` / `height` / `style` / `filter` しか渡していない。

**(b) すべての要素のフォントサイズが端数に落とされる。**

```
src/clone-node.ts:139-143
  if (name === 'font-size' && value.endsWith('px')) {
    const reducedFont = Math.floor(parseFloat(...)) - 0.1
    value = `${reducedFont}px`
  }
```

14px → **13.9px**、12px → 11.9px。ライブラリが「文字がはみ出さないように」入れている
既定の細工で、無効化するオプションは無い（`includeStyleProperties` を渡しても
`font-size` がリストにある限り通る）。端数のフォントサイズはグリフのラスタライズが甘くなり、
かつ**画面より僅かに小さい文字**になる。低倍率（(a)）と重なると体感差が大きい。

### 確認のいちばん安い方法

**既に手元にある PNG のピクセル寸法を見るだけで確定する。**
書き出した PNG の幅（px）を、書き出し時のキャンバス領域の CSS 幅（≒ウインドウ幅から
サイドバー等を引いた値。欠陥3 により、PNG 幅はほぼこれに一致するはず）と比べる。

- PNG 幅 ≒ CSS 幅 → `devicePixelRatio === 1`（要因 (a) 確定）
- PNG 幅 ≒ CSS 幅 × 2 → DPR は 2 で、体感の悪さは (b) と別要因

DevTools コンソールで `devicePixelRatio` を1行打てば直接読める。

### 修正案

`src/core/image-export.ts:64` の `toBlob` に **`pixelRatio` を明示**する。

```ts
const blob = await toBlob(layers.root, {
  width, height,
  pixelRatio: Math.max(2, window.devicePixelRatio || 1),
  style: { overflow: 'visible' },
  filter: ...,
})
```

- `pixelRatio: 2` で線形寸法2倍・**画素数4倍**。`drawImage` の描画先が
  `canvas.width = width * ratio`（`src/index.ts:42-43,56`）なので、
  SVG（ベクタ）は拡大先の解像度で再ラスタライズされ、**本当に情報量が増える**
  （拡大補間ではない）。
- 要因 (b) は**このオプションでは直らない**。ライブラリを差し替えるか fork しない限り消せない。
  ただし倍率が上がれば端数フォントの粗さは相対的に目立たなくなる。回避は不可能ではなく、
  「フォントサイズを整数 px に揃える」（14px は既に整数なので、効くのは
  `text-xs`=12px 等も含めて全部整数であることの確認）——**現状すべて整数なので、
  実害は「13.9px にされること」そのもの**であり、こちらは受け入れるしかない。

**リスク**:

- **メモリと時間。** 3000×2000 の図なら ratio 2 で 6000×4000 = 2400万画素、
  RGBA で約 96MB のキャンバス ＋ PNG エンコード。`toBlob` の所要時間が体感で伸びる。
  **進捗表示が無い**（`open-issues.md` の `[M18]` 既知項目）ので、遅くなるほど
  「反応が無い」に見える度合いが増す。**欠陥3 を先に直して寸法を詰めれば、この risk は大きく下がる。**
- **16384px の上限クランプ。** `checkCanvasDimensions`（`src/util.ts:132-159`）は
  `skipAutoScale` が偽のとき（既定）にキャンバスを 16384 以下へ縮める。
  `canvas.width` を代入し直してから `drawImage(img, 0, 0, canvas.width, canvas.height)`（`:56`）
  なので、**切れるのではなく縮小される**（アスペクト比もほぼ保たれる）。
  つまり最悪でも「指定した倍率が出ない」だけで、破綻はしない。
  ただし ratio 3 まで上げると 5462px 超の図でクランプに当たり、
  **非整数倍のリサンプルでかえってぼける**。だから 3 以上は勧めない。
- クリップボード経路は `Image.fromBytes` で PNG をデコードする（M18 申し送り 6）ので、
  巨大画像ではここも遅くなる。

---

## 欠陥3: ウインドウを大きくすると余白が巨大になる

### 根本原因（確定）

見立ては正しい。`src/core/image-export.ts:62-63`

```ts
const width = layers.root.scrollWidth
const height = layers.root.scrollHeight
```

`root` は `SequenceEditor.tsx:762` / `LogicTreeEditor.tsx:300` の
`relative h-full w-full overflow-hidden` なビューポート div。
**`scrollWidth` / `scrollHeight` は定義上「パディングボックスの寸法」と
「スクロール可能オーバーフロー領域」の大きい方**なので、
**戻り値はコンテナ自身の寸法（＝ウインドウの大きさ）を下限に持つ。**
図がウインドウより小さければ測定値はウインドウ寸法に張り付き、
ウインドウを広げるほど右と下の余白がそのまま増える。報告と完全に一致する。

**同じ理由で `chrome` / `gutter` の除外もサイズに反映されない。**
`filter`（`clone-node.ts:256-258`）はクローンから落とすだけで、
既に測り終えた `width` / `height` には影響しない。M18 の申し送りが
「without-gutter では右に約470px 残る」と記録した既知の限界は、
**この一般形（あらゆる書き出しがビューポート寸法になる）の特殊例にすぎない。**

なお `bg-grid-paper`（方眼）は `root` に当たっており、`applyStyle`（`src/apply-style.ts:13-19`）が
クローンのルートを `width`/`height` px に広げるため、**方眼はこの巨大な余白まで敷き詰められる**。
余白が「白飛び」ではなく方眼で埋まるので、余計に目立つ。

### 確認のいちばん安い方法

ウインドウを大きくして同じ図を2回書き出し、PNG のピクセル寸法を比べる。
図を1つも変えていないのに寸法が変われば確定。（実物の画像が既にこれを示している。）

### 修正案

修正は `src/core/image-export.ts` の寸法測定1箇所に閉じる。**推奨は次の合わせ技。**

```
1. excludeRoles に該当する要素を一時的に display:none にする
2. root の width/height を一時的に 0px にして「コンテナ寸法の下限」を外す
3. width = root.scrollWidth, height = root.scrollHeight を読む
4. svgLayers の getBBox() を union して、SVG 内容の右下端を取り込む
5. 矢頭・線幅ぶんの安全余白（8〜16px）を足す
6. 1・2 を finally で戻してから toBlob を呼ぶ
```

各段の根拠と取りこぼしリスク:

- **(1) `display:none`**: `open-issues.md` が候補 (b) として挙げていた案。
  **このコードベースでは安全だと確認できた**——除外対象はすべて絶対配置で、
  兄弟の位置に影響しない: `SequenceEditor.tsx:797`(chrome, `absolute`)、
  `:1165`(chrome, `absolute`)、`:938`(gutter, `absolute`)、`:1083`(gutter, 中身が `absolute`)、
  `:1108`(gutter, `absolute`)、`GutterSlot.tsx:43`(`absolute`)、`GhostSlot.tsx:25`(`absolute`)、
  `GhostSlot.tsx:41`(chrome, flex 行の**最後**の要素なので隠しても行が縮むだけ)、
  `LogicTreeEditor.tsx:318`(chrome, `absolute`)。
  **これで gutter の470px も同時に消える。**
- **(2) root を 0px に**: これをやらないと (1) だけでは下限が外れない。
  子レイヤは `absolute inset-0` なので 0 幅になるが、
  **その中のノード群は `left`/`top`/`width` を px で持つ絶対配置なので位置も寸法も動かない**。
  `left-0 right-0` で伸びていた chrome の帯は (1) で消えているので、
  「幅0のフレックスから `shrink-0` の子（KeyHints）がはみ出して余計な幅を作る」事故も起きない
  （**(1) と (2) はセットで行う必要がある**）。
- **(4) `getBBox()`**: 素朴な `getBoundingClientRect` の合併が危険だという指摘は正しい。
  エッジ層の `<svg>` は `h-full w-full` なので自身の矩形はコンテナ寸法しか返さず、
  内側の `<g>` の内容は箱の外に出る。**`getBBox()` は要素の内容の外接矩形を
  ユーザー座標で返す**ので、これがまさに必要な値を返す。
  `captureImagePng` は既に `svgLayers`（＝各エッジ層の `<g>`）を受け取っており、
  **単位行列に戻した後に呼べば、値はそのまま root 原点からの CSS px になる**
  （`<svg>` は `inset-0` で `viewBox` を持たない）。
  取りこぼし: **`getBBox()` は線幅と marker を含まない**（幾何形状だけ）。だから (5) の余白が要る。
  jsdom には `getBBox` が無いので `typeof g.getBBox === 'function'` で守ること
  （`CellInput` の「測れないときは何もしない」と同じ考え方）。
- **(5) 安全余白**: 矢頭 `markerWidth=8`・線幅 1.5 を考えると **右下に 16px** 程度で足りる。
  `DIAGRAM_MARGIN` を流用してもよいが、`core` が sequence の定数に依存するのは避けたい
  （設計スペック決定6 の趣旨）ので、`image-export.ts` にローカル定数として持つのがよい。

**採らない案とその理由**:

- **非除外要素の `getBoundingClientRect` を全部 union する**: エッジ層が箱の寸法しか返さない問題
  （＝矢印が切れる）に加え、`box-shadow`（フォーカスリング）・`::before`・
  静的 div の 0 矩形など取りこぼしの経路が多い。**切れるのは余白より悪い**という判断に反する。
- **`layout.totalWidth`/`totalHeight` の帳簿値を使う**: `open-issues.md` の
  `[M14]` / `[sequence-m2]` の通り実描画より小さいと分かっている。切れる。

**リスク**:

- **切れるリスクが最大の懸念。** (4)(5) で塞いだつもりでも、
  「HTML の箱にも SVG の幾何にも現れない描画」（`box-shadow`、`outline`、`filter: drop-shadow`）は
  拾えない。現状のキャンバス2ツールにはフォーカスリング（`focus:ring-2` の box-shadow）しか無く、
  キャプチャ時にフォーカスがあるのは「画像をコピー」ボタン（chrome）なので実害は考えにくいが、
  **`ring` を図の要素の常時表示に使う変更が入ると静かに欠ける。**
- **一時的な `display:none` の復元漏れ。** transform と同じく `finally` で戻す必要があり、
  しかも transform の復元は「割り込んだ書き込みを保護する」ために条件付きになっている
  （`image-export.ts:79-97`）。同じ配慮を display にも入れるか、
  **`toBlob` の await より前に測って復元まで同期で終わらせる**（推奨——測定は同期処理なので割り込みが入らない）。
- **強制レイアウトが2回増える**（display 変更 → scrollWidth 読み → 復元）。
  大きな図でも数ミリ秒のオーダーで、`toBlob` 本体に比べれば無視できる。
- **キャプチャ中のちらつきが一段派手になる**（一瞬レイヤが 0 幅になる）。
  設計スペック決定6 が「全体表示にリセットされるちらつき」を既に許容しているので、
  程度問題ではあるが、実機で見て判断すること。

---

## 横断: 1つの変更で複数直るか / 着手順

**3つの欠陥は独立の原因を持ち、1つの変更で2つ以上直るものは無い。**
ただし**依存関係と相乗効果はある。**

- 欠陥3 の修正は、**M18 申し送りの「without-gutter で右に470px 残る」既知の限界も同時に閉じる**
  （`open-issues.md` の `[M18]` 該当項目）。1つの変更で2つの課題票が消える。
- 欠陥3 を先に直すと、**欠陥2 の修正（`pixelRatio: 2`）のリスクが大きく下がる**。
  余白ぶんの画素を4倍にして払う無駄が消え、16384 クランプに当たる閾値からも遠のく。
  **順序に意味がある。**

### 価値 ÷ リスクの順位

| 順 | 修正 | 価値 | リスク | 変更量 |
| --- | --- | --- | --- | --- |
| **1** | **欠陥1・案A**（SVG にプレゼンテーション属性） | 最大。**線が出ない／黒い三日月になる**のは資料として使えない水準の破綻 | ほぼ無し。画面の見た目は優先度の規則により不変。jsdom でテストできる | 2ファイル6行＋テスト |
| 2 | 欠陥3（寸法測定の作り直し） | 大。「Miro みたい」な巨大余白の解消 ＋ gutter 470px も解決 | 中。**切れる可能性**があり、実機確認が必須 | 1ファイル・測定部の書き直し |
| 3 | 欠陥2（`pixelRatio: 2`） | 中。1行 | 小〜中。時間・メモリ。**欠陥3 の後なら小** | 1行 |

**最初にやるのは欠陥1・案A。** 変更が最も小さく、リスクが実質ゼロで、
壊れ方がいちばん重い（線が消える・黒い塊になる）から。
しかも**この1件だけは自動テストで回帰を止められる**——欠陥2・3 の正しさは
最終的に実機の目でしか確かめられない。

---

## 静的読解では分からなかったこと（人間が画面で見る必要がある）

1. **図がウインドウより大きいときに切れないか。** 入れ子 `<svg>` の `overflow: visible` が
   `foreignObject` 経由のラスタライズでも「自分の箱の外」を描くかは、
   今回の実物画像（図がウインドウに収まっている）では判定できない。
   **ウインドウより明確に大きい図で1回書き出して、右端・下端の矢印まで写っているか**を見ること。
   これは欠陥3 の修正後にはさらに重要になる（余白が消えるぶん、切れが即座に露出する）。
2. **`devicePixelRatio` の実値。** 表示スケール 100% なら 1、125% なら 1.25。
   DevTools で1行、または PNG のピクセル寸法とウインドウ幅の比較で分かる。
   欠陥2 の体感がどこまで (a) で説明できるかがこれで決まる。
3. **`pixelRatio: 2` にしたときの所要時間。** 実際に使う最大サイズの図で計り、
   進捗表示（`open-issues.md` の `[M18]` 既知項目）を足すかを決めること。
4. **文字の書体が画面と一致しているか。** `@fontsource-variable/geist` は
   `embedWebFonts` が woff2 を data URI で埋め込む経路に乗る（`src/embed-webfonts.ts:228-248`）が、
   Tauri のオリジンからの fetch が成功しているかは静的には確かめられない。
   失敗していれば欧文だけフォールバック書体になる。**画面と PNG を並べて欧文の字形を比べる**のが早い。
   和文（Yu Gothic UI）はシステムフォントなので影響を受けない。
5. **フォントサイズが 13.9px にされることの体感。** 上記 (b)。文字がごく僅かに小さく、
   箱の中での位置が微妙にずれる。**許容するか、ライブラリを離れるかの判断は実物を見てから。**

## ついでに見つかった潜在欠陥（今回の3件とは別。今は発症していない）

- **`cloneInputValue` が `textarea` の値を `innerHTML` に代入している**（`src/clone-node.ts:166-169`）。
  ステップ文言や答えに `<` を含む文字列（例: `<未定義>` のような書き方）が入ると、
  クローン側で HTML タグとして解釈され、**その位置から先の文字が画像から消える**。
  仕様整理という用途上、`<...>` を書く人はいる。案A/欠陥3 とは独立の、次に踏みうる罠。
- **`filter` の型が嘘をついている件**（`src/types.ts:37` が `HTMLElement` と宣言）は
  M18 の fix round で既に対処済み（`image-export.ts:72-75`）。再発防止として記録に留める。
