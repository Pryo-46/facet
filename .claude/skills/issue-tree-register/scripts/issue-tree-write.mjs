#!/usr/bin/env node
// 課題ツリーファイルの検証＋正規形での書き出し。
//
// このスクリプトが担うのは3つ:
//   1. スキーマ検証（アプリと同一の issue-tree.schema.json を参照。同梱するコピーは
//      バイト一致がテストで強制されているので「古い版で通る」が起きない）
//   2. 正規化（キー順をスキーマの properties 記載順から実行時に導出し、LF・2スペース・
//      非ASCIIそのまま・末尾改行あり・BOMなしで書き出す）
//   3. 整合性検証（ID重複 / 循環 / 親の参照切れ / 多重ルート / 仮説の参照切れ）と
//      要対応の集計を報告する。アプリ側のレベル2と同じ性質なので書き込みは止めない。
//
// **配列順の正規化は行わない。** アプリの normalizeOrder（DFS 行きがけ順へ整える）は
// 値 import を持つのでバイト一致コピーにできず、手で複製すれば追従漏れがテストに
// 映らない。だからここでは触らない——触らないほうが「触っていない要素を1バイトも
// 変えない」も同時に守れる。
//
// **ただし「アプリが後で整えてくれる」ではない。** normalizeOrder が走るのは
// アプリの編集コマンド（commands.ts）からだけで、読み込み経路には無い（migrate は
// 恒等変換）。**開くだけでは並びは整わない。** 乱れた順で書いた JSON はディスク上に
// そのまま残り、利用者が後で1箇所編集して自動保存が走った瞬間に配列全体が
// 並び替わって大きな無意味 diff が出る。SKILL.md は下書きを DFS 行きがけ順で
// 書くよう勧めている——正規化しないぶん、書く側が揃えておくのが安い
//
// **問いの導出は手で複製しない。** ./derive.ts は src/modules/issue-tree/derive.ts の
// バイト一致コピーで、ズレは src/modules/issue-tree/skill-copy.test.ts が検知する。
//
// 使い方:
//   node scripts/issue-tree-write.mjs --in draft.json --out <project>/決済PoC.json
//   node scripts/issue-tree-write.mjs --check <project>/決済PoC.json
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
// derive.ts    = 問いの導出と抑制（src/modules/issue-tree/derive.ts）
// canonical.ts = 正規形シリアライザ（src/core/canonical.ts）
// どちらもバイト一致コピーで、ズレは src/modules/issue-tree/skill-copy.test.ts が検知する

let D, C;
try {
  [D, C] = await Promise.all([import("./derive.ts"), import("./canonical.ts")]);
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
if (!opt.check && (!opt.in || !opt.out)) die(2, "--in <下書き.json> --out <課題ツリー.json> か --check <file> を指定してください。");

const sourcePath = path.resolve(opt.check ?? opt.in);
const targetPath = opt.check ? null : path.resolve(opt.out);

// ---------- スキーマの解決（正は一つ。アプリと同じ実体を読む） ----------

function findSchema() {
  if (opt.schema) return path.resolve(opt.schema);
  if (process.env.FACET_ISSUE_TREE_SCHEMA) return path.resolve(process.env.FACET_ISSUE_TREE_SCHEMA);
  const starts = [path.dirname(targetPath ?? sourcePath), process.cwd(), SKILL_DIR];
  for (const start of starts) {
    let dir = path.resolve(start);
    for (;;) {
      for (const rel of ["issue-tree.schema.json", path.join("schemas", "issue-tree.schema.json")]) {
        const p = path.join(dir, rel);
        if (fs.existsSync(p)) return p;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  die(2, "issue-tree.schema.json が見つかりません。--schema <path> で指定してください。");
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
// シーケンスの normalizeSlots に当たる前処理は要らない——課題ツリーには oneOf の
// スロットが無く、キー順はすべてスキーマの properties から導出できる

const text = C.serialize(data, schema);
const normalized = JSON.parse(text);

// ---------- 整合性検証（レベル2相当。警告にとどめる） ----------
//
// アプリの src/modules/issue-tree/consistency.ts が message を出す6ブロックを
// そのまま見る（rule 名は5種類だが、duplicate-id は課題と仮説の2箇所で出る）。
// あちらは core の buildTree / findDuplicates を値 import しているので
// バイト一致コピーにできず、ここは手で複製している。**文言はアプリが正**——
// ズレると同じ問題が2つの言葉で説明され、ユーザーが別問題だと思う。
// ズレたら src/modules/issue-tree/skill-write.smoke.test.ts が赤くなる

const warnings = [];
const issues = normalized.issues ?? [];
const hypotheses = normalized.hypotheses ?? [];

/** 文言で指す。空のものは配列位置で呼ぶ（「（未記入）」だけだと区別できない） */
const label = (text_, index) =>
  text_.trim() === "" ? `（未記入・${index + 1}番目）` : `「${text_}」`;

/** 鍵ごとの配列位置のうち、2件以上のものだけ（core/duplicate.ts の findDuplicates） */
function findDuplicates(items, keyOf) {
  const groups = new Map();
  items.forEach((item, index) => {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [index]);
    else group.push(index);
  });
  const out = new Map();
  for (const [key, indices] of groups) if (indices.length > 1) out.set(key, indices);
  return out;
}

/**
 * 平坦配列を木に戻す（core/canvas/flat-tree.ts の buildTree のうち、
 * ここで要る3つ——ルート位置・参照切れ・根から到達できない集合——だけ）。
 *
 * **循環の検出に専用のアルゴリズムは要らない**——根から到達できなかった
 * ノードが、そのまま循環している集合である
 */
function buildTree(nodes) {
  // 同じ id が2件あるときは先に現れた方を親とする（アプリと同じ規則）
  const firstIndexById = new Map();
  nodes.forEach((node, i) => {
    if (!firstIndexById.has(node.id)) firstIndexById.set(node.id, i);
  });

  const children = nodes.map(() => []);
  const roots = [];
  const missingParent = [];

  nodes.forEach((node, i) => {
    if (node.parentId === null) {
      roots.push(i);
      return;
    }
    const p = firstIndexById.get(node.parentId);
    if (p === undefined) {
      // 参照切れ。消さずにルートとして描き、位置を記録して赤表示に回す
      roots.push(i);
      missingParent.push(i);
      return;
    }
    children[p].push(i);
  });

  const depths = nodes.map(() => -1);
  const walk = (index, depth) => {
    depths[index] = depth;
    for (const c of children[index]) if (depths[c] === -1) walk(c, depth + 1);
  };
  for (const i of roots) walk(i, 0);

  const unreachable = [];
  depths.forEach((d, i) => {
    if (d === -1) unreachable.push(i);
  });

  return { roots, unreachable, missingParent };
}

const built = buildTree(issues);

// ID重複（IDは機械的識別子なので正規化しない完全一致。1つのidにつき1件）
for (const [id, indices] of findDuplicates(issues, (n) => n.id)) {
  warnings.push(`課題の ID が重複しています（${indices.length}件）: ${id}`);
}
for (const [id, indices] of findDuplicates(hypotheses, (h) => h.id)) {
  warnings.push(`仮説の ID が重複しています（${indices.length}件）: ${id}`);
}

// 循環（＝根から到達できない課題）。図に描かれないので、ここで見せないと
// 「ファイルにあるのに画面に無い」課題が黙って生まれる
if (built.unreachable.length > 0) {
  warnings.push(
    `親子関係が循環している課題があります（${built.unreachable.length}件。図には表示されません）: ${built.unreachable
      .map((i) => label(issues[i].text, i))
      .join("、")}`
  );
}

// 参照切れ。ルートとして描かれるため、下の multiple-root も同時に立つ
if (built.missingParent.length > 0) {
  warnings.push(
    `親が見つからない課題があります（${built.missingParent.length}件）: ${built.missingParent
      .map((i) => label(issues[i].text, i))
      .join("、")}`
  );
}

// ルートの単一性。0件は正常な状態（新規作成直後）
if (built.roots.length > 1) {
  warnings.push(
    `ルートが${built.roots.length}件あります（1本の木にしてください）: ${built.roots
      .map((i) => label(issues[i].text, i))
      .join("、")}`
  );
}

// 仮説の参照切れ（「参照する側」のモジュールが持つ検証）
const existing = new Set(issues.map((n) => n.id));
const dangling = hypotheses.map((h, i) => ({ h, i })).filter(({ h }) => !existing.has(h.issueId));
if (dangling.length > 0) {
  warnings.push(
    `ぶら下がり先の課題が見つからない仮説があります（${dangling.length}件）: ${dangling
      .map(({ h, i }) => label(h.text, i))
      .join("、")}`
  );
}

if (targetPath) {
  const dir = path.dirname(targetPath);
  // 改行コードの担保（プロジェクト雛形の責務だが、雛形が無い場合に備えて気づけるようにする）
  if (fs.existsSync(path.join(dir, ".git")) && !hasJsonEolRule(dir)) {
    warnings.push(`.gitattributes に「*.json text eol=lf」がありません（autocrlf 環境で全行diffになります）`);
  }
}

// ---------- 要対応の集計（アプリの帯と同一規則） ----------
//
// 数え直さない。poseQuestions / tallyQuestions / tallyLine は derive.ts が正で、
// 抑制（祖先の見送り）の扱いもそこに入っている

const posed = D.poseQuestions(normalized);
const tally = D.tallyQuestions(posed);
const deferredCount = D.deferredIssueCount(normalized.issues);
const openAt = [];
posed.issueNeedsHypothesis.forEach((needs, i) => {
  if (needs) openAt.push(`課題${label(issues[i].text, i)}「${D.QUESTION_LABELS.hypothesis}」`);
});
posed.hypothesisQuestions.forEach((q, i) => {
  if (q.result) openAt.push(`仮説${label(hypotheses[i].text, i)}「${D.QUESTION_LABELS.result}」`);
  if (q.hold) openAt.push(`仮説${label(hypotheses[i].text, i)}「${D.QUESTION_LABELS.hold}」`);
  if (q.judgement) openAt.push(`仮説${label(hypotheses[i].text, i)}「${D.QUESTION_LABELS.judgement}」`);
});

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
console.log(`  課題: ${issues.length}件 ／ 仮説: ${hypotheses.length}件`);
console.log(`  ${D.tallyLine(tally)}`);
if (deferredCount > 0) console.log(`  ${D.deferralLine(deferredCount)}（${D.DEFERRAL_NOTE}）`);
if (openAt.length) console.log(`  ${D.TALLY_TOTAL_LABEL}の内訳: ${openAt.join("、")}`);

if (warnings.length) {
  console.log(`\n⚠ 整合性の警告（アプリでは赤表示。ファイルは開けます）`);
  for (const w of warnings) console.log(`  - ${w}`);
}

// ---------- 補助 ----------

function readJson(p, label_) {
  let raw;
  try { raw = fs.readFileSync(p, "utf8"); } catch { die(2, `${label_}が読めません: ${p}`); }
  try { return JSON.parse(C.stripBom(raw)); } catch (e) { die(1, `${label_}が JSON として壊れています: ${p}\n  ${e.message}`); }
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
