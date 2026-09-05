#!/usr/bin/env node
// エラーカタログファイルの検証＋正規形での書き出し。
//
// このスクリプトが担うのは3つ:
//   1. スキーマ検証（ajv の standalone コンパイル済み関数 ./generated/validate.mjs を
//      使う。生成物であり、schemas/error-catalog.schema.json（同梱のコピー）から
//      実行時ではなくビルド時に作られる。同梱するスキーマ本体はキー順の導出に使う）
//   2. 正規化（キー順をスキーマの properties 記載順から実行時に導出し、LF・2スペース・
//      非ASCIIそのまま・末尾改行あり・BOMなしで書き出す）
//   3. 整合性検証（ID重複 / エラー名の重複 / 対応文の未記入 / エラーカタログの単一性）を
//      警告として報告する。アプリ側のレベル2と同じ性質なので書き込みは止めない。
//
// 使い方:
//   node scripts/error-catalog-write.mjs --in draft.json --out <project>/エラーカタログ.json
//   node scripts/error-catalog-write.mjs --check <project>/エラーカタログ.json
//
// 終了コード: 0=成功（警告はあり得る） / 1=スキーマ検証失敗 / 2=使い方の誤り

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(fileURLToPath(import.meta.url), "../..");

// ---------- アプリのロジック（生成物。手で複製しない） ----------
//
// canonical.mjs = 正規形シリアライザ（src/core/canonical.ts から生成）
// validate.mjs  = スキーマ検証（schemas/error-catalog.schema.json から生成）
// いずれも npm run gen:skills が作り、アプリが .claude/skills/ へ置き直す

let C, validate;
try {
  const [c, v] = await Promise.all([
    import("./generated/canonical.mjs"),
    import("./generated/validate.mjs"),
  ]);
  [C, validate] = [c, v.default];
} catch (e) {
  die(
    2,
    `Skill の生成物が見つかりません。facet でプロジェクトフォルダを開き直してください（アプリが .claude/skills/ を置き直します）\n  ${e.message}`
  );
}

// ---------- 引数 ----------

const argv = process.argv.slice(2);
const opt = { in: null, out: null, check: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--in") opt.in = argv[++i];
  else if (a === "--out") opt.out = argv[++i];
  else if (a === "--check") opt.check = argv[++i];
  else die(2, `不明な引数: ${a}`);
}
if (opt.check && (opt.in || opt.out)) die(2, "--check は --in/--out と併用できません。");
if (!opt.check && (!opt.in || !opt.out)) die(2, "--in <draft.json> --out <エラーカタログ.json> か --check <file> を指定してください。");

const sourcePath = path.resolve(opt.check ?? opt.in);
const targetPath = opt.check ? null : path.resolve(opt.out);

// スキーマは同梱物を読む。**検証は生成物に焼き付いており、ここで読むのは
// 正規形のキー順を properties の記載順から導出するため**（canonical.mjs）。
// 差し替えを許すと「検証は同梱・キー順は外部」のちぐはぐが起きるので探索しない
const schemaPath = path.join(SKILL_DIR, "schemas", "error-catalog.schema.json");
const schema = readJson(schemaPath, "スキーマ");

// ---------- 入力 ----------

const data = readJson(sourcePath, "入力ファイル");

// ---------- スキーマ検証（不合格＝レベル1。アプリは開けない） ----------

if (!validate(data)) {
  console.error(`✗ スキーマ検証に失敗しました（アプリはこのファイルを開けません）`);
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
const fold = (s) => String(s).normalize("NFKC").trim().toLowerCase();
// アプリの rowRef（src/core/row-ref.ts）と同じ規則。行を指すメッセージは
// 配列位置＋1（No 列の値）で呼ぶ
const rowRef = (i) => `#${i + 1}`;

// ID重複（IDは機械的識別子なので正規化しない完全一致）。
// 文言・計上規則ともアプリ（src/modules/error-catalog/consistency.ts）と
// 同一であること——グループごとに1件・件数＋行番号付き。出現ごとに数えない
const byId = new Map();
errors.forEach((e, i) => {
  if (!byId.has(e.id)) byId.set(e.id, []);
  byId.get(e.id).push(i);
});
for (const [id, indices] of byId) {
  if (indices.length > 1) {
    warnings.push(
      `ID が重複しています（${indices.length}件。${indices.map(rowRef).join(" ／ ")}）: ${id}`,
    );
  }
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
    warnings.push(
      `エラー名「${errors[indices[0]].name}」が${indices.length}件重複しています（${indices.map(rowRef).join(" ／ ")}）`,
    );
  }
}

// 宣言したレベルと対応文の矛盾（例: user なのに userAction が空）
const REQUIRED_ACTION = { user: "userAction", support: "supportAction", engineer: "engineerAction" };
const ACTION_LABEL = { userAction: "ユーザーの対応", supportAction: "サポートの対応", engineerAction: "エンジニアの対応" };
const LEVEL_LABEL = { user: "ユーザー対応", support: "サポート対応", engineer: "エンジニア対応", none: "解決不可", undecided: "未分類" };
errors.forEach((e, i) => {
  const field = REQUIRED_ACTION[e.resolutionLevel];
  if (field && e[field] === "") {
    warnings.push(`${rowRef(i)}「${e.name}」は${LEVEL_LABEL[e.resolutionLevel]}としていますが、${ACTION_LABEL[field]}が空です`);
  }
});

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
      warnings.push(`エラーカタログの単一性違反: 同じフォルダに別のエラーカタログ ${f} があります。どちらを正とするかはここでは決めません`);
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
