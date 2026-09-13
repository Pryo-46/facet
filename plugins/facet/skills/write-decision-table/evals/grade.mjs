// テストケースの機械判定。
// 使い方: node evals/grade.mjs <iteration-dir>
// 各 run ディレクトリに grading.json を書き出す。
//
// **骨格は兄弟の grade.mjs と揃えてある。** 実行ハーネスが作るのは
// `<iteration-dir>/eval-<id>/{with_skill,without_skill}/` で、プロジェクトは
// run ディレクトリそのものである。`grading.json` の形
//（`run_id` / `expectations[{text,passed,evidence}]` / `passed` / `total`）も
// レビュー生成側が読む契約なので、ここだけ独自形にしない。
// ツール固有なのは assertionsFor の中身だけ。
//
// 判定器そのものは src/modules/decision-table/skill-grade.test.ts が、
// 合成した出力で検査している。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ITER = path.resolve(process.argv[2] ?? ".");
const SKILL = path.resolve(fileURLToPath(import.meta.url), "../..");
const COND_RE = /^cond_[A-Za-z0-9]{10}$/;
const OUT_RE = /^out_[A-Za-z0-9]{10}$/;

/** プロジェクト内の JSON を走査し、type ごとに拾う */
function filesOfType(dir, type) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!e.name.toLowerCase().endsWith(".json")) continue;
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8").replace(/^﻿/, ""));
        if (j?.type === type) out.push({ path: p, json: j });
      } catch { /* 壊れたJSONは数えない */ }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/**
 * スキーマ検証・正規形・整合性の警告をスクリプトから取る。
 * **書き出しスクリプトが受け付ける引数だけを渡す。** 知らない引数は exit 2 になり、
 * すべてのファイルが「スキーマ検証失敗」と判定される
 */
function inspect(file) {
  try {
    const out = execFileSync(
      "node",
      [path.join(SKILL, "scripts/decision-table-write.mjs"), "--check", file],
      { encoding: "utf8" }
    );
    return { schemaOk: true, canonicalOk: out.includes("正規形と一致"), warned: out.includes("整合性の警告"), out };
  } catch {
    return { schemaOk: false, canonicalOk: false, warned: true, out: "" };
  }
}

/** 条件の中から、名前が pattern に当たる最初の条件の位置（無ければ -1） */
const conditionIndex = (table, pattern) => table.conditions.findIndex((c) => pattern.test(c.name ?? ""));

const basename = (f) => path.basename(f.path);

/** eval id=3 の fixture の結果。鍵は「会員か|5000円以上か」の値 */
const FIXTURE_RESULTS = new Map([
  ["はい|はい", "無料"],
  ["はい|いいえ", "無料"],
  ["いいえ|はい", "無料"],
  ["いいえ|いいえ", ""],
]);

function assertionsFor(evalId, dir) {
  const tables = filesOfType(dir, "decisionTable");
  const trees = filesOfType(dir, "logicTree");
  const A = [];
  const push = (text, passed, evidence) => A.push({ text, passed: !!passed, evidence: String(evidence) });

  if (evalId === 2) {
    // ロジックツリーへ譲るべきケース。decisionTable を作っていないことが合格
    push("decisionTable を作っていない（ロジックツリーへ譲っている）",
      tables.length === 0, tables.length ? tables.map(basename).join(", ") : "decisionTable なし");
    return A;
  }

  push("type=decisionTable の JSON がちょうど1つ作られている",
    tables.length === 1, tables.length ? tables.map(basename).join(", ") : "ファイルなし");

  const f = tables[0];
  if (!f) {
    push("スキーマ検証を通り正規形と一致する", false, "ファイルなし");
    return A;
  }

  const t = f.json;
  const conditions = t.conditions ?? [];
  const outcomes = t.outcomes ?? [];
  const rows = t.rows ?? [];
  const ins = inspect(f.path);
  push("スキーマ検証を通る", ins.schemaOk, ins.schemaOk ? "OK" : "検証失敗");
  push("正規形と一致する（キー順・LF・末尾改行・行の並び）", ins.canonicalOk, ins.canonicalOk ? "OK" : "差あり");
  // 行が直積とずれていれば row-set の警告になるので、行の並びもここで見える
  push("整合性の警告が無い", !ins.warned, ins.warned ? ins.out.trim() || "警告あり" : "警告なし");
  push("すべての条件の id が cond_ ＋英数字10文字、結果の id が out_ ＋英数字10文字",
    conditions.length > 0 && conditions.every((c) => COND_RE.test(c.id)) && outcomes.every((o) => OUT_RE.test(o.id)),
    [...conditions, ...outcomes].map((x) => x.id).join(", ") || "なし");

  const rowText = rows.map((r) => `${r.values.join("×")}=${r.impossible ? "起こりえない" : r.results.join("/") || "（空）"}`).join(" ／ ");

  if (evalId === 0) {
    push("条件2本・値2つずつ・結果1本・行4行",
      conditions.length === 2 && conditions.every((c) => c.values.length === 2) && outcomes.length === 1 && rows.length === 4,
      `conditions=${conditions.length} outcomes=${outcomes.length} rows=${rows.length}`);
    // このケースの存在理由は「決まっていない結果を推測で埋めていないこと」を測ること
    push("結果が空の行がちょうど1行", rows.filter((r) => r.results.every((v) => v === "")).length === 1, rowText);
    push("埋まっている結果はすべて「無料」",
      rows.flatMap((r) => r.results).filter((v) => v !== "").every((v) => v === "無料"), rowText);
    push("impossible を立てていない", rows.every((r) => !r.impossible), rowText);
    push("logicTree を作っていない", trees.length === 0, trees.map(basename).join(", ") || "logicTree なし");
  }

  if (evalId === 1) {
    push("logicTree を作っていない", trees.length === 0, trees.map(basename).join(", ") || "logicTree なし");
    push("条件2本（3値と2値）で行6行",
      conditions.length === 2 &&
        conditions.map((c) => c.values.length).sort().join(",") === "2,3" &&
        rows.length === 6,
      `values=${conditions.map((c) => c.values.length).join(",")} rows=${rows.length}`);
    push("決まっていない倍率を埋めていない", rows.every((r) => r.results.every((v) => v === "")), rowText);
  }

  if (evalId === 3) {
    const byId = new Map(conditions.map((c, i) => [c.id, { c, i }]));
    const member = byId.get("cond_Aa1Bb2Cc3D");
    const amount = byId.get("cond_Ee4Ff5Gg6H");
    push("既存のファイルを更新している（2つ目を作らない）",
      tables.length === 1 && basename(f) === "送料の決定.json", tables.map(basename).join(", "));
    push("title が変わっていない", t.title === "送料の決定", String(t.title));
    push("既存2条件と結果の名前・値・選択肢が変わっていない",
      member?.c.name === "会員か" && member.c.values.join("|") === "はい|いいえ" &&
        amount?.c.name === "5000円以上か" && amount.c.values.join("|") === "はい|いいえ" &&
        outcomes.length === 1 && outcomes[0].id === "out_Ii7Jj8Kk9L" && outcomes[0].choices.join("|") === "無料|500円",
      JSON.stringify({ conditions, outcomes }));
    const added = conditions.filter((c) => c.id !== "cond_Aa1Bb2Cc3D" && c.id !== "cond_Ee4Ff5Gg6H");
    push("条件が1本だけ増え、新しい id で採番されている",
      conditions.length === 3 && added.length === 1 && COND_RE.test(added[0].id), added.map((c) => c.id).join(", ") || "追加なし");
    // **引き継ぎの失敗は結果の消失として現れるので、このケースが一番防ぎたい壊れ方である**
    push("行が8行で、どの行の結果も元の同じ組み合わせの行と一致する",
      rows.length === 8 && member && amount &&
        rows.every((r) => r.results[0] === FIXTURE_RESULTS.get(`${r.values[member.i]}|${r.values[amount.i]}`)),
      rowText);
  }

  if (evalId === 4) {
    const impossible = rows.filter((r) => r.impossible);
    push("起こりえない行がちょうど1行", impossible.length === 1, rowText);
    push("起こりえない行の結果は空で、残りの行はすべて埋まっている",
      impossible.length === 1 && impossible[0].results.every((v) => v === "") &&
        rows.filter((r) => !r.impossible).every((r) => r.results.every((v) => v !== "")),
      rowText);
    // 起こりえないのは会員×5000円未満。500円の行（非会員×5000円未満）と金額の値が同じで、
    // 会員の値だけが違う行でなければならない
    const memberAt = conditionIndex(t, /会員/);
    const amountAt = conditionIndex(t, /5000|金額|円/);
    const paid = rows.find((r) => !r.impossible && r.results.includes("500円"));
    push("起こりえない行が「会員で5000円未満」を指している",
      impossible.length === 1 && paid && memberAt >= 0 && amountAt >= 0 && memberAt !== amountAt &&
        impossible[0].values[amountAt] === paid.values[amountAt] &&
        impossible[0].values[memberAt] !== paid.values[memberAt],
      `会員の条件=#${memberAt + 1} 金額の条件=#${amountAt + 1}: ${rowText}`);
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
