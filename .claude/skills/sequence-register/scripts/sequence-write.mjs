#!/usr/bin/env node
// シーケンスファイルの検証＋正規形での書き出し。
//
// このスクリプトが担うのは3つ:
//   1. スキーマ検証（アプリと同一の sequence.schema.json を参照。コピーは持たない）
//   2. 正規化（キー順をスキーマの properties 記載順から実行時に導出し、LF・2スペース・
//      非ASCIIそのまま・末尾改行あり・BOMなしで書き出す）
//   3. 整合性検証（参照切れ / ID重複 / to の過不足 / from==to / 立っていない問いへの答え）と
//      未定義の集計を報告する。アプリ側のレベル2と同じ性質なので書き込みは止めない。
//
// **問いの導出は手で複製しない。** ./questions.ts は src/modules/sequence/questions.ts の
// バイト一致コピーで、ズレは src/modules/sequence/skill-copy.test.ts が検知する。
//
// 使い方:
//   node scripts/sequence-write.mjs --in draft.json --out <project>/注文確定.json
//   node scripts/sequence-write.mjs --check <project>/注文確定.json
//   （--schema <path> でスキーマを明示指定できる。省略時は自動探索）
//
// 終了コード: 0=成功（警告はあり得る） / 1=スキーマ検証失敗 / 2=使い方の誤り

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const SKILL_DIR = path.resolve(fileURLToPath(import.meta.url), "../..");

// ---------- アプリのコピー（手で複製しない） ----------
//
// questions.ts = 問いの導出と答えの読み方（src/modules/sequence/questions.ts）
// canonical.ts = 正規形シリアライザ（src/core/canonical.ts）
// どちらもバイト一致コピーで、ズレは src/modules/sequence/skill-copy.test.ts が検知する

let Q, C;
try {
  [Q, C] = await Promise.all([import("./questions.ts"), import("./canonical.ts")]);
} catch (e) {
  die(
    2,
    `同梱の .ts を読み込めません。Node の型ストリップが要ります（22.18+ / 23.6+ / 24+。現在 ${process.version}）\n  ${e.message}`
  );
}

// ---------- 引数 ----------

const argv = process.argv.slice(2);
const opt = { in: null, out: null, check: null, schema: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--in") opt.in = argv[++i];
  else if (a === "--out") opt.out = argv[++i];
  else if (a === "--check") opt.check = argv[++i];
  else if (a === "--schema") opt.schema = argv[++i];
  else die(2, `不明な引数: ${a}`);
}
if (opt.check && (opt.in || opt.out)) die(2, "--check は --in/--out と併用できません。");
if (!opt.check && (!opt.in || !opt.out)) die(2, "--in <draft.json> --out <シーケンス.json> か --check <file> を指定してください。");

const sourcePath = path.resolve(opt.check ?? opt.in);
const targetPath = opt.check ? null : path.resolve(opt.out);

// ---------- スキーマの解決（正は一つ。アプリと同じ実体を読む） ----------

function findSchema() {
  if (opt.schema) return path.resolve(opt.schema);
  if (process.env.FACET_SEQUENCE_SCHEMA) return path.resolve(process.env.FACET_SEQUENCE_SCHEMA);
  const starts = [path.dirname(targetPath ?? sourcePath), process.cwd(), SKILL_DIR];
  for (const start of starts) {
    let dir = path.resolve(start);
    for (;;) {
      for (const rel of ["sequence.schema.json", path.join("schemas", "sequence.schema.json")]) {
        const p = path.join(dir, rel);
        if (fs.existsSync(p)) return p;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  die(2, "sequence.schema.json が見つかりません。--schema <path> で指定してください。");
}

const schemaPath = findSchema();
const schema = readJson(schemaPath, "スキーマ");

// ---------- 入力 ----------

const data = readJson(sourcePath, "入力ファイル");

// ---------- スキーマ検証（不合格＝レベル1。アプリは開けない） ----------

let AjvCtor;
try {
  const m = require("ajv/dist/2020.js");
  AjvCtor = m.default ?? m;
} catch {
  die(2, `ajv が見つかりません。次を実行してください:\n  cd "${SKILL_DIR}" && npm install`);
}
const ajv = new AjvCtor({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

if (!validate(data)) {
  console.error(`✗ スキーマ検証に失敗しました（アプリはこのファイルを開けません）`);
  console.error(`  スキーマ: ${schemaPath}`);
  for (const e of validate.errors) {
    const at = e.instancePath || "(ルート)";
    const extra = e.params?.allowedValues ? `（許可値: ${e.params.allowedValues.join(", ")}）` : "";
    console.error(`  - ${at}: ${e.message}${extra}`);
  }
  console.error(`\n直してから再実行してください。IDは必ず scripts/new-id.mjs で採番します。`);
  process.exit(1);
}

// ---------- 正規化 ----------
//
// serialize がキー順（スキーマの properties 記載順）・2スペース・末尾改行を担う。
// normalizeSlots はその前に走らせる——答えスロットは oneOf でキー順を導出できず、
// serialize は入力の順をそのまま通すため（下の関数コメントを見よ）

const text = C.serialize(normalizeSlots(data), schema);
const normalized = JSON.parse(text);

// ---------- 整合性検証（レベル2相当。警告にとどめる） ----------
//
// アプリの src/modules/sequence/consistency.ts と同じ5ルールを見る。
// 「立っていない問いへの答え」だけは questions.ts の import で済み、
// 残る4ルール（参照切れ・ID重複・to の過不足・from==to）は構造検査なので
// ここに書く。文言はアプリと揃えてある——ズレると同じ問題が2つの言葉で
// 説明され、ユーザーが別問題だと思う

const warnings = [];
const actors = normalized.actors ?? [];
const steps = normalized.steps ?? [];

const KIND_LABEL = { call: "呼出", reply: "応答", self: "内部処理" };
const PATH_LABEL = { failed: "失敗確定", unknown: "結果不明", ifExecuted: "実行済みだったら" };

/** ステップを人が特定できる呼び名（アプリの stepName と同じ形） */
const stepName = (step, index) =>
  step.label === "" ? `#${index + 1}` : `#${index + 1}（${step.label}）`;

// ID重複（IDは機械的識別子なので正規化しない完全一致。1つのidにつき1件——
// アプリの dupLocations と同じ構造で actors / steps を回す）
for (const [label, items] of [
  ["参加者", actors],
  ["ステップ", steps],
]) {
  const counts = new Map();
  for (const item of items) counts.set(item.id, (counts.get(item.id) ?? 0) + 1);
  for (const [id, count] of counts) {
    if (count > 1) warnings.push(`${label}の ID が重複しています: ${id}`);
  }
}

const actorIds = new Set(actors.map((a) => a.id));

steps.forEach((step, index) => {
  // 参照切れ
  for (const field of ["from", "to"]) {
    const ref = step[field];
    if (ref !== undefined && !actorIds.has(ref)) {
      warnings.push(`${stepName(step, index)} の ${field} が指す参加者が存在しません: ${ref}`);
    }
  }

  // to の過不足
  if (step.kind === "self" && step.to !== undefined) {
    warnings.push(
      `${stepName(step, index)} は内部処理（self）なのに to を持っています。内部処理は from だけで表します`
    );
  }
  if (step.kind !== "self" && step.to === undefined) {
    warnings.push(`${stepName(step, index)} は${KIND_LABEL[step.kind]}なのに to（受け手）がありません`);
  }

  // from == to（矢印が引けない。self への変更を促す）。参照切れのときは出さない
  if (step.kind !== "self" && step.to !== undefined && step.to === step.from && actorIds.has(step.from)) {
    warnings.push(
      `${stepName(step, index)} の from と to が同じ参加者を指しています。自分への処理は形を「内部処理」（self）に変えて表します`
    );
  }

  // 立っていない問いへの答え。どの属性のせいで立たないかまで言う
  for (const p of Q.unposedAnswers(step)) {
    const reason =
      step.kind === "reply"
        ? "応答には問いが立ちません（応答の失敗は対の呼出側の「結果不明」が扱います）"
        : step.kind === "self"
          ? "内部処理に立つ問いは「失敗確定」だけです"
          : "awaitsReply: false（投げっぱなし）の呼出に立つ問いは「結果不明」だけです";
    warnings.push(`${stepName(step, index)} に「${PATH_LABEL[p]}」の答えがありますが、${reason}`);
  }
});

// ---------- 未定義の集計（アプリのガターと同一規則） ----------
//
// 数えるのは**立っている問いだけ**。立っていない問いへの答えは上の
// unposed-answer が別に指摘するので、ここには混ぜない（SequenceEditor.tsx の
// tally と同じ扱い）

const tally = { unanswered: 0, handled: 0, notApplicable: 0 };
const unansweredAt = [];
for (const [index, step] of steps.entries()) {
  const posed = Q.poseQuestions(step);
  for (const p of ["failed", "unknown", "ifExecuted"]) {
    if (!posed[p]) continue;
    const decision = Q.readSlot(step, p).decision;
    if (decision === "handled") tally.handled += 1;
    else if (decision === "notApplicable") tally.notApplicable += 1;
    else {
      tally.unanswered += 1;
      unansweredAt.push(`${stepName(step, index)}「${PATH_LABEL[p]}」`);
    }
  }
}

// ---------- 書き出し ----------

if (targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, text, "utf8"); // LF・BOMなし・末尾改行あり
  console.log(`✓ 正規形で書き出しました: ${targetPath}`);
} else {
  const raw = fs.readFileSync(sourcePath, "utf8");
  console.log(`✓ スキーマ検証OK: ${sourcePath}`);
  console.log(raw === text ? "✓ 正規形と一致しています" : "△ 正規形と差があります（--in/--out で書き直せます）");
}
console.log(`  スキーマ: ${schemaPath}`);
console.log(`  参加者: ${actors.length}人 ／ ステップ: ${steps.length}件`);
console.log(`  ⚠ 未定義 ${tally.unanswered} ／ ✓ 回答済 ${tally.handled} ／ ─ 考慮不要 ${tally.notApplicable}`);
if (unansweredAt.length) console.log(`  未定義の内訳: ${unansweredAt.join("、")}`);

if (warnings.length) {
  console.log(`\n⚠ 整合性の警告（アプリでは赤表示。ファイルは開けます）`);
  for (const w of warnings) console.log(`  - ${w}`);
}

// ---------- 補助 ----------

/**
 * 答えスロットのキー順を decision → text に固定する。
 *
 * **なぜ serialize だけでは足りないか。** answerSlot はスキーマ上 oneOf なので
 * canonical.ts の deref が properties を持たないノードを返し、decision / text は
 * 「スキーマに無いキー」として**入力の順のまま**出力される。一方アプリは
 * commands.ts の buildAnswerSlot が必ず { decision, text } の順で組む。
 * ここを揃えないと、同じ内容のファイルがバイト列で食い違い、
 * アプリが1回保存しただけで意味の無い diff が出る
 */
function normalizeSlots(root) {
  const slot = (v) => {
    if (!v || typeof v !== "object") return v;
    const out = {};
    if ("decision" in v) out.decision = v.decision;
    if ("text" in v) out.text = v.text;
    return out;
  };
  for (const step of root.steps ?? []) {
    const f = step.failures;
    if (!f || typeof f !== "object") continue;
    if (f.failed !== undefined) f.failed = slot(f.failed);
    if (f.unknown !== undefined) {
      const ife = f.unknown.ifExecuted;
      f.unknown = { ...slot(f.unknown), ...(ife === undefined ? {} : { ifExecuted: slot(ife) }) };
    }
  }
  return root;
}

function readJson(p, label) {
  let raw;
  try { raw = fs.readFileSync(p, "utf8"); } catch { die(2, `${label}が読めません: ${p}`); }
  try { return JSON.parse(C.stripBom(raw)); } catch (e) { die(1, `${label}が JSON として壊れています: ${p}\n  ${e.message}`); }
}

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}
