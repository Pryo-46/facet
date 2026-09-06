// テストケースの機械判定。
// 使い方: node evals/grade.mjs <iteration-dir>
// 各 run ディレクトリに grading.json を書き出す。
//
// **骨格は兄弟3本（sequence / glossary-term / error-catalog）と揃えてある。**
// 実行ハーネスが作るのは `<iteration-dir>/eval-<id>/{with_skill,without_skill}/`
// で、プロジェクトは run ディレクトリそのものである。`grading.json` の形
//（`run_id` / `expectations[{text,passed,evidence}]` / `passed` / `total`）も
// レビュー生成側が読む契約なので、ここだけ独自形にしない。
// ツール固有なのは assertionsFor の中身だけ。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ITER = path.resolve(process.argv[2] ?? ".");
const SKILL = path.resolve(fileURLToPath(import.meta.url), "../..");
// 同梱コピーを指す（facet のチェックアウトの有無に依存しない。コピーは
// src/core/skill-schema-copy.test.ts が原本とのバイト一致を強制している）
const SCHEMA = path.resolve(SKILL, "schemas/logic-tree.schema.json");
const NODE_RE = /^node_[A-Za-z0-9]{10}$/;

/** プロジェクト内の JSON を走査し、type ごとに拾う */
function filesOfType(dir, type) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!e.name.toLowerCase().endsWith(".json")) continue;
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
        if (j?.type === type) out.push({ path: p, json: j });
      } catch { /* 壊れたJSONは数えない */ }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/** スキーマ検証・正規形・整合性の警告をスクリプトから取る */
function inspect(file) {
  try {
    const out = execFileSync(
      "node",
      [path.join(SKILL, "scripts/logic-tree-write.mjs"), "--check", file, "--schema", SCHEMA],
      { encoding: "utf8" }
    );
    return { schemaOk: true, canonicalOk: out.includes("正規形と一致"), warned: out.includes("整合性の警告"), out };
  } catch {
    return { schemaOk: false, canonicalOk: false, warned: true, out: "" };
  }
}

/**
 * nodes が DFS 行きがけ順に並んでいるか（--check の「正規形と一致」にも含まれるが、単独でも見る）。
 *
 * 祖先を積んだスタックを持ち、各ノードの親が**スタックの上から辿って見つかる**
 * ことを要求する。**「親が既出か」だけを見ると不十分**——[A, B(A), D(A), C(B)]
 * のような、親は既出だが行きがけ順ではない並びを通してしまう
 */
function isDfsOrdered(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  const stack = [];
  for (const n of nodes) {
    // 親が居ない・参照切れのノードは、ルートとして描かれる＝スタックを畳む
    if (n.parentId === null || !ids.has(n.parentId)) {
      stack.length = 0;
    } else {
      while (stack.length && stack[stack.length - 1] !== n.parentId) stack.pop();
      if (stack.length === 0) return false; // 親が祖先の連なりに無い＝行きがけ順ではない
    }
    stack.push(n.id);
  }
  return true;
}

function rootsOf(nodes) {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes.filter((n) => n.parentId === null || !ids.has(n.parentId));
}

/** eval id=4（既存ファイルへの書き足し）で、1バイトも動いてはいけない3ノード */
const KEPT_IDS = ["node_Aa1Bb2Cc3D", "node_Ee4Ff5Gg6H", "node_Ii7Jj8Kk9L"];

function assertionsFor(evalId, dir) {
  const trees = filesOfType(dir, "logicTree");
  const issueTrees = filesOfType(dir, "issueTree");
  const A = [];
  const push = (text, passed, evidence) => A.push({ text, passed: !!passed, evidence: String(evidence) });

  if (evalId === 3) {
    // 課題ツリーへ譲るべきケース。logicTree を作っていないことが合格
    push("logicTree を作っていない（課題ツリーへ譲っている）",
      trees.length === 0,
      trees.length ? trees.map((t) => path.basename(t.path)).join(", ") : "logicTree なし");
    return A;
  }

  push("type=logicTree の JSON がちょうど1つ作られている",
    trees.length === 1, trees.length ? trees.map((t) => path.basename(t.path)).join(", ") : "ファイルなし");
  push("issueTree を作っていない",
    issueTrees.length === 0, issueTrees.length ? issueTrees.map((t) => path.basename(t.path)).join(", ") : "issueTree なし");

  const f = trees[0];
  if (!f) {
    push("スキーマ検証を通り正規形と一致する", false, "ファイルなし");
    return A;
  }

  const nodes = f.json.nodes ?? [];
  const ins = inspect(f.path);
  push("スキーマ検証を通る", ins.schemaOk, ins.schemaOk ? "OK" : "検証失敗");
  push("正規形と一致する（キー順・LF・末尾改行）", ins.canonicalOk, ins.canonicalOk ? "OK" : "差あり");
  push("整合性の警告が無い", !ins.warned, ins.warned ? ins.out.trim() || "警告あり" : "警告なし");
  push("ルートが1つ", rootsOf(nodes).length === 1, `roots=${rootsOf(nodes).length}`);
  push("すべての id が node_ ＋英数字10文字",
    nodes.length > 0 && nodes.every((n) => NODE_RE.test(n.id)), nodes.map((n) => n.id).join(", ") || "なし");
  push("nodes が DFS 行きがけ順", isDfsOrdered(nodes), nodes.map((n) => n.id).join(", ") || "なし");

  if (evalId === 1) {
    // このケースの存在理由は「AI が幻覚した枝を足していないこと」を測ること
    const texts = nodes.map((n) => n.text ?? "").join(" / ");
    push("ノードが4つ（根＋会話に出た原因3つ）で、余計な枝が無い", nodes.length === 4, `nodes=${nodes.length}: ${texts}`);
    push("「送信」に触れる枝がある", nodes.some((n) => /送信/.test(n.text ?? "")), texts);
    push("「添付」に触れる枝がある", nodes.some((n) => /添付/.test(n.text ?? "")), texts);
    push("「重複」に触れる枝がある", nodes.some((n) => /重複/.test(n.text ?? "")), texts);
  }

  if (evalId === 4) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    push("title が変わっていない", f.json.title === "応募が書類選考に進まないケース", String(f.json.title));
    push("既存3ノードの text が変わっていない",
      byId.get("node_Aa1Bb2Cc3D")?.text === "応募が書類選考に進まないのはどんなときか" &&
        byId.get("node_Ee4Ff5Gg6H")?.text === "応募そのものが成立しない" &&
        byId.get("node_Ii7Jj8Kk9L")?.text === "応募フォームの送信に失敗した",
      KEPT_IDS.map((id) => `${id}:${byId.get(id)?.text ?? "なし"}`).join(" / "));
    // **木の形が変わるので、このケースが一番防ぎたい壊れ方である**
    push("既存3ノードの parentId が変わっていない（付け替えられていない）",
      byId.get("node_Aa1Bb2Cc3D")?.parentId === null &&
        byId.get("node_Ee4Ff5Gg6H")?.parentId === "node_Aa1Bb2Cc3D" &&
        byId.get("node_Ii7Jj8Kk9L")?.parentId === "node_Ee4Ff5Gg6H",
      KEPT_IDS.map((id) => `${id}.parentId=${byId.get(id)?.parentId}`).join(" / "));
    push("ノードが1つ増えている（3 → 4）", nodes.length === 4, `nodes=${nodes.length}`);
    const added = nodes.filter((n) => !KEPT_IDS.includes(n.id));
    push("足したノードの親が node_Ee4Ff5Gg6H",
      added.length === 1 && added[0].parentId === "node_Ee4Ff5Gg6H",
      added.map((n) => `${n.id}(parentId=${n.parentId})`).join(", ") || "追加なし");
  }

  return A;
}

const results = [];
for (const evalDir of fs.readdirSync(ITER).filter((d) => d.startsWith("eval-"))) {
  const evalId = Number(evalDir.split("-")[1]);
  for (const variant of ["with_skill", "without_skill"]) {
    const runDir = path.join(ITER, evalDir, variant);
    if (!fs.existsSync(runDir)) continue;
    const expectations = assertionsFor(evalId, runDir);
    const passed = expectations.filter((e) => e.passed).length;
    const grading = { run_id: `${evalDir}-${variant}`, expectations, passed, total: expectations.length };
    fs.writeFileSync(path.join(runDir, "grading.json"), JSON.stringify(grading, null, 2) + "\n", "utf8");
    results.push(grading);
  }
}

for (const r of results.sort((a, b) => a.run_id.localeCompare(b.run_id))) {
  console.log(`${r.run_id}: ${r.passed}/${r.total}`);
  for (const e of r.expectations.filter((x) => !x.passed)) console.log(`   ✗ ${e.text} — ${e.evidence}`);
}
