#!/usr/bin/env node
// エラーカタログファイルの検証＋正規形での書き出し。
//
// このスクリプトが担うのは3つ:
//   1. スキーマ検証（アプリと同一の error-catalog.schema.json を参照。コピーは持たない）
//   2. 正規化（キー順をスキーマの properties 記載順から実行時に導出し、LF・2スペース・
//      非ASCIIそのまま・末尾改行あり・BOMなしで書き出す）
//   3. 整合性検証（ID重複 / エラー名の重複 / 対応文の未記入 / エラーカタログの単一性）を
//      警告として報告する。アプリ側のレベル2と同じ性質なので書き込みは止めない。
//
// 使い方:
//   node scripts/error-catalog-write.mjs --in draft.json --out <project>/エラーカタログ.json
//   node scripts/error-catalog-write.mjs --check <project>/エラーカタログ.json
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
// canonical.ts = 正規形シリアライザ（src/core/canonical.ts）
// バイト一致コピーで、ズレは src/core/skill-canonical-copy.test.ts が検知する

let C;
try {
  C = await import("./canonical.ts");
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
if (!opt.check && (!opt.in || !opt.out)) die(2, "--in <draft.json> --out <エラーカタログ.json> か --check <file> を指定してください。");

const sourcePath = path.resolve(opt.check ?? opt.in);
const targetPath = opt.check ? null : path.resolve(opt.out);

// ---------- スキーマの解決（正は一つ。アプリと同じ実体を読む） ----------

function findSchema() {
  if (opt.schema) return path.resolve(opt.schema);
  if (process.env.FACET_ERROR_CATALOG_SCHEMA) return path.resolve(process.env.FACET_ERROR_CATALOG_SCHEMA);
  const starts = [path.dirname(targetPath ?? sourcePath), process.cwd(), SKILL_DIR];
  for (const start of starts) {
    let dir = path.resolve(start);
    for (;;) {
      for (const rel of ["error-catalog.schema.json", path.join("schemas", "error-catalog.schema.json")]) {
        const p = path.join(dir, rel);
        if (fs.existsSync(p)) return p;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  die(2, "error-catalog.schema.json が見つかりません。--schema <path> で指定してください。");
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

const text = C.serialize(data, schema);
const normalized = JSON.parse(text);

// ---------- 整合性検証（レベル2相当。警告にとどめる） ----------

const warnings = [];
const errors = normalized.errors ?? [];
// アプリの normalizeForMatch（src/core/normalize.ts）と同じ規則。
// **trim を落とさないこと**——末尾に空白を足すだけで重複判定をすり抜けられる。
// 用語集版のスクリプトの fold は trim を含んでいないが、そちらに合わせない
const fold = (s) => String(s).normalize("NFKC").trim().toLowerCase();

// ID重複（IDは機械的識別子なので正規化しない完全一致）。
// 文言・計上規則ともアプリ（src/modules/error-catalog/consistency.ts）と
// 同一であること——グループごとに1件・件数付き。出現ごとに数えない
const byId = new Map();
errors.forEach((e, i) => {
  if (!byId.has(e.id)) byId.set(e.id, []);
  byId.get(e.id).push(i);
});
for (const [id, indices] of byId) {
  if (indices.length > 1) warnings.push(`ID が重複しています（${indices.length}件）: ${id}`);
}

// エラー名の重複（同名2件は「この名前で引ける」という前提の矛盾。アプリで赤表示になる）
const byName = new Map();
errors.forEach((e, i) => {
  const k = fold(e.name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(i);
});
for (const indices of byName.values()) {
  if (indices.length > 1) {
    warnings.push(`エラー名が重複しています: ${indices.map((i) => `「${errors[i].name}」`).join(' と ')}`);
  }
}

// 宣言したレベルと対応文の矛盾（例: user なのに userAction が空）
const REQUIRED_ACTION = { user: "userAction", support: "supportAction", engineer: "engineerAction" };
const ACTION_LABEL = { userAction: "ユーザーの対応", supportAction: "サポートの対応", engineerAction: "エンジニアの対応" };
const LEVEL_LABEL = { user: "ユーザー対応", support: "サポート対応", engineer: "エンジニア対応", none: "解決不可", undecided: "未分類" };
for (const e of errors) {
  const field = REQUIRED_ACTION[e.resolutionLevel];
  if (field && e[field] === "") {
    warnings.push(`対応文の未記入: 「${e.name}」は${LEVEL_LABEL[e.resolutionLevel]}としていますが、${ACTION_LABEL[field]}が空です`);
  }
}

// エラーカタログはプロジェクトにつき1つ（コア横断検証）
if (targetPath) {
  const dir = path.dirname(targetPath);
  for (const f of safeReaddir(dir)) {
    if (!f.toLowerCase().endsWith(".json")) continue;
    const p = path.join(dir, f);
    if (path.resolve(p) === targetPath) continue;
    let other;
    try { other = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
    if (other?.type === "errorCatalog") {
      warnings.push(`エラーカタログの単一性違反: 同じフォルダに別のエラーカタログ ${f} があります。どちらを正とするかは人間の判断です`);
    }
  }
  // 改行コードの担保（プロジェクト雛形の責務だが、雛形が無い場合に備えて気づけるようにする）
  if (fs.existsSync(path.join(dir, ".git")) && !hasJsonEolRule(dir)) {
    warnings.push(`.gitattributes に「*.json text eol=lf」がありません（autocrlf 環境で全行diffになります）`);
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
console.log(`  エラー数: ${errors.length}`);

const undecided = errors.filter((e) => e.resolutionLevel === "undecided").map((e) => e.name);
if (undecided.length) console.log(`  未分類（resolutionLevel=undecided）: ${undecided.length}件 — ${undecided.join("、")}`);

// 空欄の集計は、アプリが黄色く塗るセルと同じ条件で数える。
// 対応3種は「そのレベルが関与するとき（または none）」だけが未記入として意味を持つ——
// 全部を数えると、ほとんどのエラーは1レベルしか関与しないので一覧がノイズで埋まる
const DECLARED_BY = { userAction: "user", supportAction: "support", engineerAction: "engineer" };
const isWarn = (e, field) => {
  if (field === "occurrence" || field === "causeForSupport" || field === "causeForSpec") return e[field] === "";
  if (field in DECLARED_BY) {
    return e[field] === "" && (e.resolutionLevel === DECLARED_BY[field] || e.resolutionLevel === "none");
  }
  return false;
};
const FIELD_LABEL = {
  occurrence: "発生タイミング",
  causeForSupport: "原因（業務）",
  causeForSpec: "原因（仕様）",
  userAction: "ユーザーの対応",
  supportAction: "サポートの対応",
  engineerAction: "エンジニアの対応",
};
for (const [field, label] of Object.entries(FIELD_LABEL)) {
  const names = errors.filter((e) => isWarn(e, field)).map((e) => e.name);
  if (names.length) console.log(`  ${label}が空: ${names.length}件 — ${names.join("、")}`);
}

if (warnings.length) {
  console.log(`\n⚠ 整合性の警告（アプリでは赤表示。ファイルは開けます）`);
  for (const w of warnings) console.log(`  - ${w}`);
}

// ---------- 補助 ----------

function readJson(p, label) {
  let raw;
  try { raw = fs.readFileSync(p, "utf8"); } catch { die(2, `${label}が読めません: ${p}`); }
  try { return JSON.parse(raw.replace(/^﻿/, "")); } catch (e) { die(1, `${label}が JSON として壊れています: ${p}\n  ${e.message}`); }
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function hasJsonEolRule(dir) {
  const p = path.join(dir, ".gitattributes");
  if (!fs.existsSync(p)) return false;
  return /^\s*\*(\.json)?\s+.*eol=lf/m.test(fs.readFileSync(p, "utf8"));
}

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}
