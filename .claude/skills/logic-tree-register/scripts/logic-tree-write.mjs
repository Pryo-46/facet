#!/usr/bin/env node
// ロジックツリーファイルの検証＋正規形での書き出し。
//
// このスクリプトが担うのは4つ:
//   1. スキーマ検証（ajv の standalone コンパイル済み関数 ./generated/validate.mjs を
//      使う。生成物であり、schemas/logic-tree.schema.json から実行時ではなくビルド時に
//      作られる。同梱するのはキー順の導出のためのスキーマ本体で、こちらは検証には使わない）
//   2. 配列順の正規化（DFS 行きがけ順。兄弟の相対順は変えない）
//   3. 正規化（キー順をスキーマの properties 記載順から実行時に導出し、LF・2スペース・
//      非ASCIIそのまま・末尾改行あり・BOMなしで書き出す）
//   4. 整合性検証（ID重複 / 循環 / 親の参照切れ / 多重ルート）と未記入の集計を報告する。
//      アプリ側のレベル2と同じ性質なので書き込みは止めない。
//
// **配列順の正規化を、既存2本と違ってここで行う。** sequence / issue-tree の
// 書き出しスクリプトは順序を触らない——あちらの normalizeOrder は値 import を
// 持つのでバイト一致コピーにできず、手複製の追従漏れがテストに映らないためである。
// ロジックツリーは ./generated/flat-tree-core.mjs（生成物）が orderFlatNodes を持つので、
// その制約が無い。アプリの normalizeOrder は編集コマンドからしか呼ばれず
// 「開くだけでは並びは整わない」ので、書く側で整えておくほうが安い。
//
// **木の組み立ては手で複製しない。** ./generated/flat-tree-core.mjs は
// src/core/canvas/flat-tree-core.ts から生成される生成物である。
//
// 使い方:
//   node scripts/logic-tree-write.mjs --in draft.json --out <project>/応募が進まないケース.json
//   node scripts/logic-tree-write.mjs --check <project>/応募が進まないケース.json
//
// 終了コード: 0=成功（警告はあり得る） / 1=スキーマ検証失敗 / 2=使い方の誤り

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(fileURLToPath(import.meta.url), "../..");

// ---------- アプリのロジック（生成物。手で複製しない） ----------
//
// flat-tree-core.mjs = 木の組み立てと DFS 行きがけ順（src/core/canvas/flat-tree-core.ts から生成）
// canonical.mjs      = 正規形シリアライザ（src/core/canonical.ts から生成）
// validate.mjs       = スキーマ検証（schemas/logic-tree.schema.json から生成）
// いずれも npm run gen:skills が作り、アプリが .claude/skills/ へ置き直す

let T, C, validate;
try {
  const [t, c, v] = await Promise.all([
    import("./generated/flat-tree-core.mjs"),
    import("./generated/canonical.mjs"),
    import("./generated/validate.mjs"),
  ]);
  [T, C, validate] = [t, c, v.default];
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
if (!opt.check && (!opt.in || !opt.out)) die(2, "--in <下書き.json> --out <ロジックツリー.json> か --check <file> を指定してください。");

const sourcePath = path.resolve(opt.check ?? opt.in);
const targetPath = opt.check ? null : path.resolve(opt.out);

// スキーマは同梱物を読む。**検証は生成物に焼き付いており、ここで読むのは
// 正規形のキー順を properties の記載順から導出するため**（canonical.mjs）。
// 差し替えを許すと「検証は同梱・キー順は外部」のちぐはぐが起きるので探索しない
const schemaPath = path.join(SKILL_DIR, "schemas", "logic-tree.schema.json");
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

// ---------- 配列順の正規化（DFS 行きがけ順） ----------
//
// 兄弟順の正本は配列順（rev 5章）なので、行きがけ順へ整えても意味は変わらない。
// 到達不能なノードは orderFlatNodes が末尾へ元の順で残す（消さない）

const ordered = { ...data, nodes: T.orderFlatNodes(data.nodes) };

// ---------- 正規化 ----------
//
// serialize がキー順（スキーマの properties 記載順）・2スペース・末尾改行を担う

const text = C.serialize(ordered, schema);

// ---------- 以降の報告は「アプリが開くことになるファイル」の並びで行う ----------
//
// 整合性の message は「（未記入・N番目）」のように**配列位置でノードを指す**。
// アプリ（checkLogicTreeConsistency）が見るのは読み込んだファイルそのままの
// 並びなので、**そのファイルの並びで報告しないと、アプリが同じファイルを
// 開いたときの指し方と食い違う。**
//
// **どのファイルを指すかは経路で変わる。** `--check` が指すのは入力ファイル
// そのものなので入力の並び、`--out` が指すのは**これから書き出すファイル**な
// ので並べ替えた後の並びである。`--out` で入力の並びのまま報告すると、
// 下書きの位置を答えることになる——SKILL.md「7. 既存ファイルへの書き足し」は
// 既存 JSON 全体を `--in` へ渡させるので、下書きはたいてい DFS 順ではない。
// `orderFlatNodes` の結果を見るのは `--out` のときだけ、が正しい線引きである

const nodes = targetPath ? ordered.nodes : (data.nodes ?? []);

// ---------- 整合性検証（レベル2相当。警告にとどめる） ----------
//
// アプリの src/modules/logic-tree/consistency.ts が message を出す4ブロックを
// そのまま見る。あちらは core の buildTree / findDuplicates を値 import して
// いるのでファイルごとのコピーにはできず、**文言だけ**ここで複製している
//（木の組み立ては flat-tree-core.ts のコピーが持つ）。**文言はアプリが正**——
// ズレると同じ問題が2つの言葉で説明され、ユーザーが別問題だと思う。
// ズレたら src/modules/logic-tree/skill-write.smoke.test.ts が赤くなる

const warnings = [];

/** 文言でノードを指す。空のノードは配列位置で呼ぶ（「（未記入）」だけだと区別できない） */
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

const built = T.buildFlatTree(nodes);

// ID 重複（ID は機械的識別子なので正規化しない完全一致）
for (const [id, indices] of findDuplicates(nodes, (n) => n.id)) {
  warnings.push(`ID が重複しています（${indices.length}件）: ${id}`);
}

// 循環（＝根から到達できないノード）。図に描かれないので、ここで見せないと
// 「ファイルにあるのに画面に無い」ノードが黙って生まれる
if (built.unreachable.length > 0) {
  warnings.push(
    `親子関係が循環しているノードがあります（${built.unreachable.length}件。図には表示されません）: ${built.unreachable
      .map((i) => label(nodes[i].text, i))
      .join("、")}`
  );
}

// 参照切れ。ルートとして描かれるため、下の multiple-root も同時に立つ
if (built.missingParent.length > 0) {
  warnings.push(
    `親が見つからないノードがあります（${built.missingParent.length}件）: ${built.missingParent
      .map((i) => label(nodes[i].text, i))
      .join("、")}`
  );
}

// ルートの単一性。0件は正常な状態（新規作成直後）
if (built.roots.length > 1) {
  warnings.push(
    `ルートが${built.roots.length}件あります（1本の木にしてください）: ${built.roots
      .map((r) => label(nodes[r.index].text, r.index))
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
// ロジックツリーの欠落は「text が空のノード」1種類だけである
//（src/modules/logic-tree/missing.ts）。文言は src/core/missing-tally.ts の
// tallyLine が正で、ズレたら skill-write.smoke.test.ts が赤くなる

const blank = nodes.filter((n) => n.text === "").length;
const tallyLine = blank === 0 ? "要対応 0" : `⚠ 要対応 ${blank}（未記入 ${blank}）`;
const blankAt = nodes
  .map((n, i) => (n.text === "" ? `${i + 1}番目` : null))
  .filter((v) => v !== null);

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
console.log(`  ノード: ${nodes.length}件 ／ 深さ: ${maxDepth(built)}`);
console.log(`  ${tallyLine}`);
if (blankAt.length) console.log(`  未記入のノード: ${blankAt.join("、")}`);

if (warnings.length) {
  console.log(`\n⚠ 整合性の警告（アプリでは赤表示。ファイルは開けます）`);
  for (const w of warnings) console.log(`  - ${w}`);
}

// ---------- 補助 ----------

/** 根を 1 とした最大の深さ（0件なら 0）。報告用の数字であって検証には使わない */
function maxDepth(built_) {
  let max = 0;
  for (const d of built_.depths) if (d >= 0 && d + 1 > max) max = d + 1;
  return max;
}

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
