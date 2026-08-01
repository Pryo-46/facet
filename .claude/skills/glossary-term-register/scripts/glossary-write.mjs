#!/usr/bin/env node
// 用語集ファイルの検証＋正規形での書き出し。
//
// このスクリプトが担うのは3つ:
//   1. スキーマ検証（アプリと同一の glossary.schema.json を参照。コピーは持たない）
//   2. 正規化（キー順をスキーマの properties 記載順から実行時に導出し、LF・2スペース・
//      非ASCIIそのまま・末尾改行あり・BOMなしで書き出す）
//   3. 整合性検証（ID重複 / alias重複 / alias と他用語の name 衝突 / 用語集の単一性）を
//      警告として報告する。アプリ側のレベル2と同じ性質なので書き込みは止めない。
//
// 使い方:
//   node scripts/glossary-write.mjs --in draft.json --out <project>/glossary.json
//   node scripts/glossary-write.mjs --check <project>/glossary.json
//   （--schema <path> でスキーマを明示指定できる。省略時は自動探索）
//
// 終了コード: 0=成功（警告はあり得る） / 1=スキーマ検証失敗 / 2=使い方の誤り

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SKILL_DIR = path.resolve(fileURLToPath(import.meta.url), "../..");

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
if (!opt.check && (!opt.in || !opt.out)) die(2, "--in <draft.json> --out <glossary.json> か --check <file> を指定してください。");

const sourcePath = path.resolve(opt.check ?? opt.in);
const targetPath = opt.check ? null : path.resolve(opt.out);

// ---------- スキーマの解決（正は一つ。アプリと同じ実体を読む） ----------

function findSchema() {
  if (opt.schema) return path.resolve(opt.schema);
  if (process.env.FACET_GLOSSARY_SCHEMA) return path.resolve(process.env.FACET_GLOSSARY_SCHEMA);
  const starts = [path.dirname(targetPath ?? sourcePath), process.cwd(), SKILL_DIR];
  for (const start of starts) {
    let dir = path.resolve(start);
    for (;;) {
      for (const rel of ["glossary.schema.json", path.join("schemas", "glossary.schema.json")]) {
        const p = path.join(dir, rel);
        if (fs.existsSync(p)) return p;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  die(2, "glossary.schema.json が見つかりません。--schema <path> で指定してください。");
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

const normalized = reorder(data, schema, schema);
const text = JSON.stringify(normalized, null, 2) + "\n";

// ---------- 整合性検証（レベル2相当。警告にとどめる） ----------

const warnings = [];
const terms = normalized.terms ?? [];
const fold = (s) => String(s).normalize("NFKC").toLowerCase();

const seenId = new Map();
for (const t of terms) {
  if (seenId.has(t.id)) warnings.push(`ID重複: ${t.id}（${seenId.get(t.id)} と ${t.name}）`);
  else seenId.set(t.id, t.name);
}

const aliasOwner = new Map(); // 正規化alias -> [用語名...]
for (const t of terms) {
  const inTerm = new Set();
  for (const a of t.aliases ?? []) {
    const k = fold(a);
    if (inTerm.has(k)) warnings.push(`alias重複（同一用語内）: 「${a}」@ ${t.name}`);
    inTerm.add(k);
    aliasOwner.set(k, [...(aliasOwner.get(k) ?? []), t.name]);
  }
}
for (const [k, owners] of aliasOwner) {
  const uniq = [...new Set(owners)];
  if (uniq.length > 1) warnings.push(`alias重複（用語間）: 「${k}」が ${uniq.join(" / ")} に重複`);
}
for (const t of terms) {
  const owners = aliasOwner.get(fold(t.name)) ?? [];
  for (const o of new Set(owners)) {
    if (o !== t.name) warnings.push(`alias が他用語の name と衝突: 「${t.name}」は ${o} の別名に登録されています`);
  }
}

// 用語集はプロジェクトにつき1つ（コア横断検証）
if (targetPath) {
  const dir = path.dirname(targetPath);
  for (const f of safeReaddir(dir)) {
    if (!f.toLowerCase().endsWith(".json")) continue;
    const p = path.join(dir, f);
    if (path.resolve(p) === targetPath) continue;
    let other;
    try { other = JSON.parse(fs.readFileSync(p, "utf8")); } catch { continue; }
    if (other?.type === "glossary") {
      warnings.push(`用語集の単一性違反: 同じフォルダに別の用語集 ${f} があります。どちらを正とするかは人間の判断です`);
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
console.log(`  用語数: ${terms.length}`);

const undecided = terms.filter((t) => t.kind === "undecided").map((t) => t.name);
const undefined_ = terms.filter((t) => t.definition === "").map((t) => t.name);
if (undecided.length) console.log(`  未分類（kind=undecided）: ${undecided.length}件 — ${undecided.join("、")}`);
if (undefined_.length) console.log(`  未定義（definition=""）: ${undefined_.length}件 — ${undefined_.join("、")}`);

if (warnings.length) {
  console.log(`\n⚠ 整合性の警告（アプリでは赤表示。ファイルは開けます）`);
  for (const w of warnings) console.log(`  - ${w}`);
}

// ---------- 補助 ----------

function reorder(value, node, root) {
  const s = deref(node, root);
  if (Array.isArray(value)) {
    return s?.items ? value.map((v) => reorder(v, s.items, root)) : value;
  }
  if (value && typeof value === "object") {
    const props = s?.properties ?? {};
    const inSchema = Object.keys(props).filter((k) => k in value);
    const rest = Object.keys(value).filter((k) => !(k in props)); // additionalProperties:false なら空
    const out = {};
    for (const k of [...inSchema, ...rest]) out[k] = reorder(value[k], props[k] ?? {}, root);
    return out;
  }
  return value;
}

function deref(node, root) {
  let s = node;
  for (let i = 0; s && s.$ref && i < 20; i++) {
    if (!s.$ref.startsWith("#/")) return s;
    s = s.$ref
      .slice(2)
      .split("/")
      .map((seg) => decodeURIComponent(seg).replace(/~1/g, "/").replace(/~0/g, "~"))
      .reduce((acc, k) => (acc == null ? acc : acc[k]), root);
  }
  return s;
}

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
