// テストケースの機械判定。
// 使い方: node evals/grade.mjs <iteration-dir>
// 各 run ディレクトリに grading.json を書き出す。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ITER = path.resolve(process.argv[2] ?? ".");
const SKILL = path.resolve(fileURLToPath(import.meta.url), "../..");
const SCHEMA = path.resolve(SKILL, "../../../schemas/sequence.schema.json");
const ACTOR_RE = /^actor_[A-Za-z0-9]{10}$/;
const STEP_RE = /^step_[A-Za-z0-9]{10}$/;

function sequenceFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!e.name.toLowerCase().endsWith(".json")) continue;
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
        if (j?.type === "sequence") out.push({ path: p, json: j });
      } catch { /* 壊れたJSONはシーケンスとして数えない */ }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

/** スキーマ検証・正規形・整合性の警告をスクリプトから取る */
function inspect(file) {
  try {
    const out = execFileSync("node", [path.join(SKILL, "scripts/sequence-write.mjs"), "--check", file, "--schema", SCHEMA], { encoding: "utf8" });
    return { schemaOk: true, canonicalOk: out.includes("正規形と一致"), warned: out.includes("整合性の警告"), out };
  } catch {
    return { schemaOk: false, canonicalOk: false, warned: true, out: "" };
  }
}

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(SKILL, "evals/fixtures/existing-project", name), "utf8"));
}

const stepById = (steps, id) => steps.find((s) => s.id === id);

function assertionsFor(evalId, dir) {
  const files = sequenceFiles(dir);
  const A = [];
  const push = (text, passed, evidence) => A.push({ text, passed: !!passed, evidence: String(evidence) });

  push("type=sequence の JSON がちょうど1つ作られている",
    files.length === 1, files.length ? files.map((f) => path.basename(f.path)).join(", ") : "ファイルなし");

  const f = files[0];
  if (!f) {
    push("スキーマ検証を通り正規形と一致する", false, "ファイルなし");
    return A;
  }

  const ins = inspect(f.path);
  push("スキーマ検証を通る", ins.schemaOk, ins.schemaOk ? "OK" : "検証失敗");
  push("正規形と一致する（キー順・LF・末尾改行）", ins.canonicalOk, ins.canonicalOk ? "OK" : "差あり");

  const actors = f.json.actors ?? [];
  const steps = f.json.steps ?? [];
  push("すべての actor id が actor_ + 英数字10文字",
    actors.length > 0 && actors.every((a) => ACTOR_RE.test(a.id)), actors.map((a) => a.id).join(", ") || "なし");
  push("すべての step id が step_ + 英数字10文字",
    steps.length > 0 && steps.every((s) => STEP_RE.test(s.id)), steps.map((s) => s.id).join(", ") || "なし");

  if (evalId === 0) {
    push("アクターが3人（画面・受注API・決済サービス相当）",
      actors.length === 3, actors.map((a) => a.name).join("、"));
    push("ステップが3件（言及されていない reply を補っていない）",
      steps.length === 3, `${steps.length}件: ${steps.map((s) => `${s.kind}:${s.label}`).join(" / ")}`);
    push("kind: reply のステップが無い",
      steps.every((s) => s.kind !== "reply"), steps.map((s) => s.kind).join(", "));
    const credit = steps.find((s) => s.kind === "call" && /与信/.test(s.label ?? ""));
    push("与信のステップに failures.failed が handled で入っている",
      credit?.failures?.failed?.decision === "handled", JSON.stringify(credit?.failures ?? null));
    const others = steps.filter((s) => s !== credit);
    push("他のステップの failures が欠落したまま（推測で埋めていない）",
      others.every((s) => s.failures === undefined), others.map((s) => `${s.label}:${s.failures ? "あり" : "なし"}`).join(", "));
    push("内部処理（self）のステップが to を持たない",
      steps.filter((s) => s.kind === "self").every((s) => s.to === undefined),
      steps.filter((s) => s.kind === "self").map((s) => s.to ?? "to無し").join(", ") || "self無し");
  }

  if (evalId === 1) {
    push("取り寄せ・入荷・通知のステップが混ざっていない（主線1本）",
      !steps.some((s) => /取り寄せ|仕入|入荷|通知/.test(s.label ?? "")),
      steps.map((s) => s.label).join(" / "));
    push("ステップ数が主線の規模に収まっている（8件以下）",
      steps.length <= 8, `${steps.length}件`);
  }

  if (evalId === 2) {
    const before = readFixture("注文確定.json");
    push("title が変わっていない", f.json.title === before.title, `${before.title} → ${f.json.title}`);
    push("actors が1バイトも変わっていない",
      JSON.stringify(f.json.actors) === JSON.stringify(before.actors), JSON.stringify(f.json.actors));
    push("steps の id と並び順が変わっていない",
      JSON.stringify(steps.map((s) => s.id)) === JSON.stringify(before.steps.map((s) => s.id)),
      steps.map((s) => s.id).join(", "));

    const credit = stepById(steps, "step_Cd5yL1nQ4r");
    push("与信の unknown が handled で text が入っている",
      credit?.failures?.unknown?.decision === "handled" && (credit?.failures?.unknown?.text ?? "") !== "",
      JSON.stringify(credit?.failures?.unknown ?? null));
    push("与信の ifExecuted が handled で text が入っている",
      credit?.failures?.unknown?.ifExecuted?.decision === "handled" && (credit?.failures?.unknown?.ifExecuted?.text ?? "") !== "",
      JSON.stringify(credit?.failures?.unknown?.ifExecuted ?? null));
    push("与信の既存の failed が変わっていない",
      JSON.stringify(credit?.failures?.failed) === JSON.stringify(before.steps[1].failures.failed),
      JSON.stringify(credit?.failures?.failed ?? null));

    const stock = stepById(steps, "step_Ef7zM3pS6t");
    push("在庫引き当ての failed が notApplicable になっている",
      stock?.failures?.failed?.decision === "notApplicable", JSON.stringify(stock?.failures ?? null));

    const first = stepById(steps, "step_Ab3xK9mP2q");
    push("触っていないステップ（注文を確定する）が1バイトも変わっていない",
      JSON.stringify(first) === JSON.stringify(before.steps[0]), JSON.stringify(first));
  }

  if (evalId === 3) {
    const fire = steps.find((s) => s.kind === "call" && s.awaitsReply === false);
    push("投げっぱなしのステップが awaitsReply: false になっている",
      fire !== undefined, steps.map((s) => `${s.kind}:${s.awaitsReply}`).join(", "));
    push("そのステップに failed キーが無い（立たない問いに答えていない）",
      fire !== undefined && fire.failures?.failed === undefined, JSON.stringify(fire?.failures ?? null));
    push("答えが unknown 側に入っている",
      fire?.failures?.unknown?.decision !== undefined, JSON.stringify(fire?.failures?.unknown ?? null));
    push("整合性の警告が出ない", !ins.warned, ins.warned ? ins.out : "警告なし");
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
