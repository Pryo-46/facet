/**
 * 平坦配列を木に戻す純粋部分（index ベース。`key` を持たない）。
 *
 * **このファイルは `npm run gen:skills` が `ts.transpileModule` で `.mjs` へ変換し**
 * `plugins/facet/skills/write-logic-tree/scripts/generated/flat-tree-core.mjs`
 * として同梱される。だから値 import・相対 import・enum を持たない——
 * `transpileModule` は import を解決しないので、値 import があると置いた
 * 先で解決できなくなる。この制約と「消去できない構文（enum・パラメータ
 * プロパティ）を持たない」ことは `scripts/gen-skills.test.mjs` が強制し、
 * 生成物とアプリ側の**出力の一致**も同じテストが見る。
 *
 * `key`（行の同一性）を被せるのは `flat-tree.ts` の役目である。Skill 側が
 * 要るのはルート位置・参照切れ・到達不能・DFS 行きがけ順だけで、`key` を
 * 作る `computeRowKeys` を値 import すると上の制約を満たせなくなる
 */
/**
 * 平坦な配列を木に戻す（純関数・DOM 非依存）。
 *
 * **全域であること**が要件。壊れたファイル（循環・多重ルート・参照切れ）は
 * 受け入れて開くのがこのアプリの方針（rev 5章）なので、この関数の後段に
 * ある測定・レイアウト・描画には「循環の無い木」しか渡さない。循環の検出に
 * 専用のアルゴリズムは要らない——**根から到達できなかったノードが、
 * そのまま循環している集合**である（循環内のノードは必ず循環内のノードを
 * 親に持つので、根からは辿り着けない）。
 */
export function buildFlatTree(nodes) {
    // 同じ id が2件あるときは先に現れた方を親とする（曖昧さは残るが挙動は決める）
    const firstIndexById = new Map();
    nodes.forEach((node, i) => {
        if (!firstIndexById.has(node.id))
            firstIndexById.set(node.id, i);
    });
    const parents = [];
    const children = nodes.map(() => []);
    const rootIndices = [];
    const missingParent = [];
    nodes.forEach((node, i) => {
        if (node.parentId === null) {
            parents[i] = null;
            rootIndices.push(i);
            return;
        }
        const p = firstIndexById.get(node.parentId);
        if (p === undefined) {
            // 参照切れ。消さずにルートとして描き、位置を記録して赤表示に回す
            parents[i] = null;
            rootIndices.push(i);
            missingParent.push(i);
            return;
        }
        parents[i] = p;
        children[p].push(i);
    });
    const depths = nodes.map(() => -1);
    const build = (index, depth) => {
        depths[index] = depth;
        return {
            index,
            // 循環は根から到達できないのでここには来ないが、
            // 万一に備えて訪問済みは辿らない（depths で判定できる）
            children: children[index]
                .filter((c) => depths[c] === -1)
                .map((c) => build(c, depth + 1)),
        };
    };
    const roots = rootIndices.map((i) => build(i, 0));
    const unreachable = [];
    depths.forEach((d, i) => {
        if (d === -1) {
            unreachable.push(i);
            // 到達不能＝循環の中にいる。parents を残すと「親を遡る」コードが
            // そこで無限ループする（この関数が全域である意味が消える）
            parents[i] = null;
        }
    });
    return { roots, depths, parents, children, unreachable, missingParent };
}
/**
 * 配列を DFS 行きがけ順に整える（兄弟の相対順は変えない）。
 *
 * 兄弟順の正本は配列順（rev 5章）なので、並べ替えても意味は変わらない。
 * この順を保つことで「挿入位置＝参照ノードの部分木の直後」という1つの規則が
 * 成立し、上から読めば木の形が追える JSON になる。
 *
 * 循環して根から到達できないノードは、末尾に元の順で残す。**消さないこと**
 *——ファイルにあるものが黙って減るのが一番たちが悪い
 */
export function orderFlatNodes(nodes) {
    const built = buildFlatTree(nodes);
    const out = [];
    const walk = (node) => {
        out.push(nodes[node.index]);
        for (const child of node.children)
            walk(child);
    };
    for (const root of built.roots)
        walk(root);
    for (const index of built.unreachable)
        out.push(nodes[index]);
    return out;
}
/**
 * 行きがけ順の配列で、index の部分木が終わる位置（＝次の兄弟がいる位置）。
 * 深さが自分以下になる最初の位置を探せばよい
 */
export function subtreeEnd(built, index) {
    const depth = built.depths[index];
    for (let j = index + 1; j < built.depths.length; j++) {
        if (built.depths[j] <= depth)
            return j;
    }
    return built.depths.length;
}
/** 兄弟（同じ親を持つノード）の配列位置を、並び順で返す */
export function siblingsOf(built, index) {
    const parent = built.parents[index];
    return parent === null ? built.roots.map((r) => r.index) : built.children[parent];
}
