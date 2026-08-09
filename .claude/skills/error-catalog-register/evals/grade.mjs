// テストケースの機械判定。
// 使い方: node evals/grade.mjs <iteration-dir>
// 各 run ディレクトリに grading.json を書き出す。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ITER = path.resolve(process.argv[2] ?? ".");
const SKILL = path.resolve("C:/Dev/Projects/facet/.claude/skills/error-catalog-register");
const SCHEMA = "C:/Dev/Projects/facet/schemas/error-catalog.schema.json";
const ID_RE = /^error_[A-Za-z0-9]{10}$/;

function catalogFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!e.name.toLowerCase().endsWith(".json")) continue;
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
        if (j?.type === "errorCatalog") out.push({ path: p, json: j });
      } catch { /* 壊れたJSONはエラーカタログとして数えない */ }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

function canonical(file) {
  try {
    const out = execFileSync("node", [path.join(SKILL, "scripts/error-catalog-write.mjs"), "--check", file, "--schema", SCHEMA], { encoding: "utf8" });
    return { schemaOk: true, canonicalOk: out.includes("正規形と一致") };
  } catch {
    return { schemaOk: false, canonicalOk: false };
  }
}

const byName = (errors, n) => errors.find((e) => e.name === n);

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(SKILL, "evals/fixtures/existing-project", name), "utf8"));
}

function assertionsFor(evalId, dir) {
  const files = catalogFiles(dir);
  const A = [];
  const push = (text, passed, evidence) => A.push({ text, passed: !!passed, evidence: String(evidence) });

  if (evalId === 3) {
    push("エラーカタログファイル（type=errorCatalog）が2つ以上作られていない",
      files.length <= 1, files.length ? files.map((f) => path.basename(f.path)).join(", ") : "ファイルなし");

    const f = files[0];
    if (!f) {
      push("書き出す場合はスキーマ検証を通り正規形と一致する", true, "ファイルなし（書き出していない＝該当なしで pass）");
      push("実装都合のメッセージ（必須項目未入力・数値検証・内部エラー）をそのまま登録していない", true, "ファイルなし（該当なしで pass）");
      push("causeForSupport と causeForSpec の両方が埋まっているエラーが無い（原因を推測で埋めていない）", true, "ファイルなし（該当なしで pass）");
      return A;
    }

    const c = canonical(f.path);
    push("書き出す場合はスキーマ検証を通り正規形と一致する", c.schemaOk && c.canonicalOk,
      `schemaOk=${c.schemaOk} canonicalOk=${c.canonicalOk}`);

    const errors = Array.isArray(f.json.errors) ? f.json.errors : [];
    const banned = ["必須項目が未入力です", "数値を入力してください", "内部エラー"];
    const badNames = errors.filter((e) => banned.some((b) => (e.name ?? "").includes(b))).map((e) => e.name);
    push("実装都合のメッセージ（必須項目未入力・数値検証・内部エラー）をそのまま登録していない",
      badNames.length === 0, badNames.length ? badNames.join(", ") : "該当なし");

    const guessed = errors.filter((e) => (e.causeForSupport ?? "") !== "" && (e.causeForSpec ?? "") !== "").map((e) => e.name);
    push("causeForSupport と causeForSpec の両方が埋まっているエラーが無い（原因を推測で埋めていない）",
      guessed.length === 0, guessed.length ? guessed.join(", ") : "該当なし");
    return A;
  }

  push("エラーカタログファイル（type=errorCatalog）がちょうど1つ存在する", files.length === 1,
    files.length === 0 ? "エラーカタログファイルなし" : files.map((f) => path.basename(f.path)).join(", "));
  if (files.length === 0) return A;

  const { path: cp, json: cat } = files[0];
  const errors = Array.isArray(cat.errors) ? cat.errors : [];
  const c = canonical(cp);
  push("スキーマ検証（error-catalog.schema.json）を通る", c.schemaOk, c.schemaOk ? "ajv OK" : "ajv NG（アプリは開けない）");
  push("正規形と完全一致（キー順・2スペース・LF・BOMなし・末尾改行・非ASCII非エスケープ）", c.canonicalOk, c.canonicalOk ? "一致" : "差分あり");

  const badIds = errors.filter((e) => !ID_RE.test(e.id ?? "")).map((e) => `${e.name}:${e.id}`);
  push("全IDが error_ + 英数字10文字（連番・独自形式なし）", badIds.length === 0, badIds.length ? badIds.join(", ") : `${errors.length}件すべて適合`);

  if (evalId === 0) {
    const torihiki = byName(errors, "取引先が見つからない");
    const zaiko = byName(errors, "在庫引当に失敗する");
    push("errors が2件で、「取引先が見つからない」「在庫引当に失敗する」の両方が登録されている",
      errors.length === 2 && !!torihiki && !!zaiko, `errors=${errors.map((e) => e.name).join(", ")}`);

    push("「取引先が見つからない」は resolutionLevel=user かつ userAction が埋まっている",
      torihiki?.resolutionLevel === "user" && (torihiki?.userAction ?? "") !== "",
      `resolutionLevel=${torihiki?.resolutionLevel} userAction=${JSON.stringify(torihiki?.userAction ?? null)}`);

    const emptyFields = ["occurrence", "causeForSupport", "causeForSpec", "userAction", "supportAction", "engineerAction"];
    const filled = emptyFields.filter((f) => (zaiko?.[f] ?? "") !== "");
    push("「在庫引当に失敗する」は resolutionLevel=undecided かつ occurrence・原因2種・対応3種がすべて空（AIが推測で埋めていない）",
      zaiko?.resolutionLevel === "undecided" && filled.length === 0,
      `resolutionLevel=${zaiko?.resolutionLevel} 埋まっているフィールド=${filled.length ? filled.join(", ") : "なし"}`);
  }

  if (evalId === 1) {
    const fixture = readFixture("エラーカタログ.json");
    push("errors が3件", errors.length === 3, `errors=${errors.length}件`);

    const head = errors.slice(0, 2);
    const headMatches = head.length === 2 && head.every((e, i) => JSON.stringify(e) === JSON.stringify(fixture.errors[i]));
    push("先頭2件（id・配列順・全フィールド）がフィクスチャと完全一致（既存を書き換えていない）",
      headMatches, headMatches ? "一致" : `差分あり: ${JSON.stringify(head)}`);

    const third = errors[2];
    push("3件目が「受注を削除できない」で resolutionLevel=support かつ supportAction が埋まっている",
      third?.name === "受注を削除できない" && third?.resolutionLevel === "support" && (third?.supportAction ?? "") !== "",
      `name=${third?.name} resolutionLevel=${third?.resolutionLevel} supportAction=${JSON.stringify(third?.supportAction ?? null)}`);

    push("3件目の userAction と engineerAction が空（関与しないレベルを埋めていない）",
      (third?.userAction ?? "") === "" && (third?.engineerAction ?? "") === "",
      `userAction=${JSON.stringify(third?.userAction ?? null)} engineerAction=${JSON.stringify(third?.engineerAction ?? null)}`);
  }

  if (evalId === 2) {
    const fixture = readFixture("エラーカタログ.json");
    push("errors が2件のまま（新規追加していない）", errors.length === 2, `errors=${errors.length}件`);

    const ids = errors.map((e) => e.id);
    const idsOk = ids.length === 2 && ids[0] === fixture.errors[0].id && ids[1] === fixture.errors[1].id;
    push("id の並びが error_Qw8ZxLm2Kt / error_Hj4NbVc9Ry のまま", idsOk, `ids=${ids.join(", ")}`);

    const torihiki = byName(errors, "取引先が見つからない");
    const torihikiMatches = !!torihiki && JSON.stringify(torihiki) === JSON.stringify(fixture.errors[0]);
    push("触っていないエラー（取引先が見つからない）の JSON がフィクスチャと完全一致",
      torihikiMatches, torihikiMatches ? "一致" : `差分あり: ${JSON.stringify(torihiki)}`);

    const zaiko = byName(errors, "在庫引当に失敗する");
    push("「在庫引当に失敗する」の resolutionLevel=engineer かつ engineerAction・occurrence が埋まっている",
      zaiko?.resolutionLevel === "engineer" && (zaiko?.engineerAction ?? "") !== "" && (zaiko?.occurrence ?? "") !== "",
      `resolutionLevel=${zaiko?.resolutionLevel} engineerAction=${JSON.stringify(zaiko?.engineerAction ?? null)} occurrence=${JSON.stringify(zaiko?.occurrence ?? null)}`);

    push("「在庫引当に失敗する」の id がフィクスチャと同じ（id が変わっていない）",
      zaiko?.id === fixture.errors[1].id, `id=${zaiko?.id}`);
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
