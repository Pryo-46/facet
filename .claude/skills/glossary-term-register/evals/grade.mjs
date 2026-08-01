// テストケースの機械判定。
// 使い方: node evals/grade.mjs <iteration-dir>
// 各 run ディレクトリに grading.json を書き出す。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ITER = path.resolve(process.argv[2] ?? ".");
const SKILL = path.resolve("C:/Dev/Projects/facet/.claude/skills/glossary-term-register");
const SCHEMA = "C:/Dev/Projects/facet/glossary.schema.json";
const ID_RE = /^term_[A-Za-z0-9]{10}$/;

function glossaryFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
      if (!e.name.toLowerCase().endsWith(".json")) continue;
      try {
        const j = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
        if (j?.type === "glossary") out.push({ path: p, json: j });
      } catch { /* 壊れたJSONは用語集として数えない */ }
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

function canonical(file) {
  try {
    const out = execFileSync("node", [path.join(SKILL, "scripts/glossary-write.mjs"), "--check", file, "--schema", SCHEMA], { encoding: "utf8" });
    return { schemaOk: true, canonicalOk: out.includes("正規形と一致") };
  } catch {
    return { schemaOk: false, canonicalOk: false };
  }
}

const byName = (terms, n) => terms.find((t) => t.name === n);

function assertionsFor(evalId, dir) {
  const files = glossaryFiles(dir);
  const A = [];
  const push = (text, passed, evidence) => A.push({ text, passed: !!passed, evidence: String(evidence) });

  push("用語集ファイル（type=glossary）がちょうど1つ存在する", files.length === 1,
    files.length === 0 ? "用語集ファイルなし" : files.map((f) => path.basename(f.path)).join(", "));
  if (files.length === 0) return A;

  const { path: gp, json: g } = files[0];
  const terms = Array.isArray(g.terms) ? g.terms : [];
  const c = canonical(gp);
  push("スキーマ検証（glossary.schema.json）を通る", c.schemaOk, c.schemaOk ? "ajv OK" : "ajv NG（アプリは開けない）");
  push("正規形と完全一致（キー順・2スペース・LF・BOMなし・末尾改行・非ASCII非エスケープ）", c.canonicalOk, c.canonicalOk ? "一致" : "差分あり");

  const badIds = terms.filter((t) => !ID_RE.test(t.id ?? "")).map((t) => `${t.name}:${t.id}`);
  push("全IDが term_ + 英数字10文字（連番・独自形式なし）", badIds.length === 0, badIds.length ? badIds.join(", ") : `${terms.length}件すべて適合`);

  if (evalId === 0) {
    const want = ["申請者", "承認待ち", "差し戻し", "受注データ"];
    const missing = want.filter((n) => !byName(terms, n));
    push("会議で出た4語すべてが登録されている", missing.length === 0, missing.length ? `欠落: ${missing.join(", ")}` : "4語すべてあり");
    for (const n of ["差し戻し", "受注データ"]) {
      const t = byName(terms, n);
      push(`「${n}」の kind が undecided（AIが種別を決め打ちしていない）`, t?.kind === "undecided", `kind=${t?.kind}`);
      push(`「${n}」の definition が空（AIが定義を捏造していない）`, t?.definition === "", `definition=${JSON.stringify(t?.definition ?? null)}`);
    }
    for (const n of ["申請者", "承認待ち"]) {
      const t = byName(terms, n);
      push(`「${n}」にユーザーが述べた定義が入っている`, (t?.definition ?? "").length > 0, `definition=${JSON.stringify(t?.definition ?? null)}`);
    }
  }

  if (evalId === 1) {
    const orig = [
      { id: "term_Qw8mLp2ZaV", name: "申請者" },
      { id: "term_Hj4nRt9BcX", name: "承認待ち" },
    ];
    const head = terms.slice(0, 2);
    const kept = head.length === 2 && head.every((t, i) => t.id === orig[i].id && t.name === orig[i].name);
    push("既存2件のIDと配列順が保持されている", kept, head.map((t) => `${t.name}:${t.id}`).join(" / ") || "なし");
    const t = byName(terms, "代理承認");
    push("「代理承認」が末尾に追加されている", terms.length === 3 && terms[2]?.name === "代理承認", `terms=${terms.map((x) => x.name).join(", ")}`);
    push("aliases に「代理決裁」が入っている", (t?.aliases ?? []).includes("代理決裁"), JSON.stringify(t?.aliases ?? null));
    push("新規IDが既存IDと重複しない", t && !orig.some((o) => o.id === t.id), `id=${t?.id}`);
    push("タイトルが書き換えられていない", g.title === "経費申請システム 用語集", `title=${g.title}`);
  }

  if (evalId === 2) {
    const undecidedTopics = ["仮引当", "本引当", "欠品", "ロット管理"];
    const fabricated = undecidedTopics
      .map((n) => byName(terms, n))
      .filter((t) => t && (t.definition ?? "") !== "");
    push("メモで未決だった語（仮引当・本引当・欠品・ロット管理）に定義を捏造していない",
      fabricated.length === 0,
      fabricated.length ? fabricated.map((t) => `${t.name}: ${t.definition}`).join(" / ") : "捏造なし");
    const hikiate = byName(terms, "引当");
    push("メモに説明のある「引当」が登録されている", !!hikiate, hikiate ? `definition=${hikiate.definition}` : "未登録");
    // メモに説明が書いてある語は「転記」の対象。空にすると人間が書いた情報が消える。
    for (const n of ["引当", "受注票", "出荷済"]) {
      const t = byName(terms, n);
      push(`「${n}」の定義がメモから転記されている（書いてあることを空にしていない）`,
        t ? (t.definition ?? "") !== "" : false,
        t ? `definition=${JSON.stringify(t.definition)}` : "未登録");
    }
    push("「引当」の aliases に「取り置き」が入っている（メモ中の別の言い方を拾えている）",
      (hikiate?.aliases ?? []).includes("取り置き"), JSON.stringify(hikiate?.aliases ?? null));
    // aliases は「実際に使われている言い方」だけを入れる方針。メモに出てこない別名は AI の思いつき。
    const memoPath = path.join(dir, "project", "kickoff-memo.md");
    if (fs.existsSync(memoPath)) {
      const memo = fs.readFileSync(memoPath, "utf8");
      const ungrounded = terms.flatMap((t) => (t.aliases ?? []).filter((a) => !memo.includes(a)).map((a) => `${t.name}:${a}`));
      push("aliases がすべてメモ本文に出現する（AIが思いついた同義語を混ぜていない）",
        ungrounded.length === 0, ungrounded.length ? ungrounded.join(", ") : "根拠なしの別名なし");
    }

    const undecidedCount = terms.filter((t) => t.kind === "undecided" || t.definition === "").length;
    push("未記入（undecided もしくは definition 空）の用語が1件以上残っている（全部埋めきっていない）",
      undecidedCount > 0, `${undecidedCount}件`);
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
