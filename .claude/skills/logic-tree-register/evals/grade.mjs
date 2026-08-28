// テストケースの機械判定。
// 使い方: node evals/grade.mjs <iteration-dir>
// 各 run ディレクトリに grading.json を書き出す。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ITER = path.resolve(process.argv[2] ?? ".");
const SKILL = path.resolve(fileURLToPath(import.meta.url), "../..");
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

function grade(runDir) {
  const project = path.join(runDir, "project");
  const trees = filesOfType(project, "logicTree");
  const issueTrees = filesOfType(project, "issueTree");
  const checks = [];
  const add = (name, ok, note = "") => checks.push({ name, ok, note });

  const evalId = Number(path.basename(runDir).split("-")[0]);

  if (evalId === 3) {
    // 課題ツリーへ譲るべきケース。logicTree を作っていないことが合格
    add("logicTree を作っていない", trees.length === 0, `logicTree=${trees.length}`);
    return checks;
  }

  add("logicTree が1つある", trees.length === 1, `logicTree=${trees.length}`);
  add("issueTree を作っていない", issueTrees.length === 0, `issueTree=${issueTrees.length}`);
  if (trees.length !== 1) return checks;

  const { path: file, json } = trees[0];
  const nodes = json.nodes ?? [];
  const info = inspect(file);

  add("スキーマ検証を通る", info.schemaOk);
  add("正規形と一致する", info.canonicalOk);
  add("整合性の警告が無い", !info.warned);
  add("ルートが1つ", rootsOf(nodes).length === 1, `roots=${rootsOf(nodes).length}`);
  add("すべての id が node_ ＋英数字10文字", nodes.every((n) => NODE_RE.test(n.id)));
  add("nodes が DFS 行きがけ順", isDfsOrdered(nodes));

  if (evalId === 1) {
    add("ノードが4つ（根＋会話に出た原因3つ）で、余計な枝が無い", nodes.length === 4, `nodes=${nodes.length}`);
    const texts = nodes.map((n) => n.text ?? "").join(" / ");
    const hasSubmit = nodes.some((n) => /送信/.test(n.text ?? ""));
    const hasAttachment = nodes.some((n) => /添付/.test(n.text ?? ""));
    const hasDuplicate = nodes.some((n) => /重複/.test(n.text ?? ""));
    add("「送信」に触れる枝がある", hasSubmit, texts);
    add("「添付」に触れる枝がある", hasAttachment, texts);
    add("「重複」に触れる枝がある", hasDuplicate, texts);
  }

  if (evalId === 4) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    add("title が変わっていない", json.title === "応募が書類選考に進まないケース", json.title);
    add(
      "既存3ノードの text が変わっていない",
      byId.get("node_Aa1Bb2Cc3D")?.text === "応募が書類選考に進まないのはどんなときか" &&
        byId.get("node_Ee4Ff5Gg6H")?.text === "応募そのものが成立しない" &&
        byId.get("node_Ii7Jj8Kk9L")?.text === "応募フォームの送信に失敗した"
    );
    add(
      "既存3ノードの parentId が変わっていない（付け替えられていない）",
      byId.get("node_Aa1Bb2Cc3D")?.parentId === null &&
        byId.get("node_Ee4Ff5Gg6H")?.parentId === "node_Aa1Bb2Cc3D" &&
        byId.get("node_Ii7Jj8Kk9L")?.parentId === "node_Ee4Ff5Gg6H",
      `A.parentId=${byId.get("node_Aa1Bb2Cc3D")?.parentId} / B.parentId=${byId.get("node_Ee4Ff5Gg6H")?.parentId} / C.parentId=${byId.get("node_Ii7Jj8Kk9L")?.parentId}`
    );
    add("ノードが1つ増えている", nodes.length === 4, `nodes=${nodes.length}`);
    const added = nodes.filter((n) => !["node_Aa1Bb2Cc3D", "node_Ee4Ff5Gg6H", "node_Ii7Jj8Kk9L"].includes(n.id));
    add("足したノードの親が node_Ee4Ff5Gg6H", added.length === 1 && added[0].parentId === "node_Ee4Ff5Gg6H");
  }

  return checks;
}

for (const name of fs.readdirSync(ITER)) {
  const runDir = path.join(ITER, name);
  if (!fs.statSync(runDir).isDirectory()) continue;
  const checks = grade(runDir);
  const passed = checks.every((c) => c.ok);
  fs.writeFileSync(
    path.join(runDir, "grading.json"),
    JSON.stringify({ run: name, passed, checks }, null, 2) + "\n",
    "utf8"
  );
  console.log(`${passed ? "PASS" : "FAIL"} ${name}  (${checks.filter((c) => c.ok).length}/${checks.length})`);
}
