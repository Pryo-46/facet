#!/usr/bin/env node
// デシジョンテーブルファイルの検証＋行の整列＋正規形での書き出し。
//
// このスクリプトが担うのは5つ:
//   1. スキーマ検証（ajv の standalone コンパイル済み関数 ./generated/validate.mjs を
//      使う。同梱するスキーマ本体はキー順の導出のために読み、検証には使わない）
//   2. 行を直積の並びへ揃える。経路は2つある
//      - --in/--out: 下書きの行を値ラベルの組み合わせで直積の位置へ引き当て、
//        欠けた組み合わせを空の結果で補う（alignRowsByLabel）
//      - --in/--base/--out: 定義（条件・値・結果・選択肢）を差し替え、既存の行から
//        座標で結果を引き継いで組み直す（rebaseRows）
//   3. 正規化（キー順をスキーマの properties 記載順から導出し、LF・2スペース・
//      非ASCIIそのまま・末尾改行あり・BOMなしで書き出す）
//   4. 整合性検証（アプリの consistency.ts の7ルール）を報告する。アプリ側の
//      レベル2と同じ性質なので、警告だけでは書き込みを止めない
//   5. 要対応の集計を、アプリの帯と同じ関数で出す
//
// **書き出しを止めるのは、人が決めた結果を黙って失う場合と、アプリが扱えない
// 大きさの場合だけである。** 直積に当てはまらない行・食い違う同じ組み合わせ・
// --allow-loss の無い結果の喪失・行数の上限超過がそれに当たる。
//
// 使い方:
//   node scripts/decision-table-write.mjs --in draft.json --out <project>/送料の決定.json
//   node scripts/decision-table-write.mjs --in draft.json --base <project>/送料の決定.json --out <project>/送料の決定.json
//   node scripts/decision-table-write.mjs --check <project>/送料の決定.json
//
// 終了コード: 0=成功（警告はあり得る） / 1=スキーマ検証失敗・JSON 破損・書き出せない下書き / 2=使い方の誤り

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(fileURLToPath(import.meta.url), "../..");

// ---------- アプリのロジック（生成物。手で複製しない） ----------
//
// rows.mjs          = 直積・行の引き当て・組み直し（src/modules/decision-table/rows.ts から生成）
// missing.mjs       = 欠落の判定と集計（src/modules/decision-table/missing.ts から生成）
// missing-tally.mjs = 集計行の文言（src/core/missing-tally.ts から生成）
// canonical.mjs     = 正規形シリアライザ（src/core/canonical.ts から生成）
// validate.mjs      = スキーマ検証（schemas/decision-table.schema.json から生成）
// いずれも facet の npm run gen:skills が作る

let R, M, T, C, validate;
try {
  const [r, m, t, c, v] = await Promise.all([
    import("./generated/rows.mjs"),
    import("./generated/missing.mjs"),
    import("./generated/missing-tally.mjs"),
    import("./generated/canonical.mjs"),
    import("./generated/validate.mjs"),
  ]);
  [R, M, T, C, validate] = [r, m, t, c, v.default];
} catch (e) {
  die(
    2,
    `Skill の生成物が見つかりません。facet のプラグインを入れ直してください\n  ${e.message}`
  );
}

// ---------- 引数 ----------

const argv = process.argv.slice(2);
const opt = { in: null, out: null, base: null, check: null, allowLoss: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--in") opt.in = argv[++i];
  else if (a === "--out") opt.out = argv[++i];
  else if (a === "--base") opt.base = argv[++i];
  else if (a === "--check") opt.check = argv[++i];
  else if (a === "--allow-loss") opt.allowLoss = true;
  else die(2, `不明な引数: ${a}`);
}
if (opt.check && (opt.in || opt.out || opt.base || opt.allowLoss)) {
  die(2, "--check は --in/--out/--base/--allow-loss と併用できません。");
}
if (!opt.check && (!opt.in || !opt.out)) {
  die(2, "--in <下書き.json> --out <デシジョンテーブル.json> か --check <file> を指定してください。");
}
if (opt.allowLoss && !opt.base) die(2, "--allow-loss は --base と組みます。");

const sourcePath = path.resolve(opt.check ?? opt.in);
const targetPath = opt.check ? null : path.resolve(opt.out);
const basePath = opt.base ? path.resolve(opt.base) : null;

// スキーマは同梱物を読む。**検証は生成物に焼き付いており、ここで読むのは
// 正規形のキー順を properties の記載順から導出するため**（canonical.mjs）。
// 差し替えを許すと「検証は同梱・キー順は外部」のちぐはぐが起きるので探索しない
const schemaPath = path.join(SKILL_DIR, "schemas", "decision-table.schema.json");
const schema = readJson(schemaPath, "スキーマ");

// ---------- 入力とスキーマ検証（不合格＝レベル1。アプリは開けない） ----------

const data = readJson(sourcePath, "入力ファイル");
requireValid(data, "");

const base = basePath ? readJson(basePath, "既存ファイル") : null;
if (base) {
  requireValid(base, "既存ファイルの");
  // 定義の変更と結果の記入を1回に混ぜさせない。混ぜると、組み直しが引き継いだ
  // 結果と下書きが書いた結果のどちらを採るかを決められない
  if (JSON.stringify(data.rows) !== JSON.stringify(base.rows)) {
    die(
      2,
      "--base を渡すときは、下書きの rows を既存ファイルの rows のまま置いてください。\n" +
        "定義（条件・値・結果・選択肢）の変更と結果の記入は、別々の書き出しに分けます。"
    );
  }
}

// ---------- 大きさ ----------
//
// アプリの表本体はこの規模に歯止めを持たず、開いた瞬間に全行を描く

const total = R.productSize(data.conditions);
const tooLarge = total > R.MAX_ROWS;
if (tooLarge && targetPath) {
  die(1, `✗ 直積が行数の上限（${R.MAX_ROWS}行）を超えます（${total}行）。条件か値を減らしてください`);
}

// ---------- 行を直積の並びへ揃える ----------

let rows = data.rows;
let rebuilt = null;
let notReordered = false;

if (base) {
  rebuilt = R.rebaseRows(base, data);
  if (rebuilt.lostCells > 0 && !opt.allowLoss) {
    die(
      1,
      `✗ 記入済みの結果が${rebuilt.lostCells}件失われます（うち、まとまった行で食い違って空欄に落ちるもの ${rebuilt.clearedCells}件）。\n` +
        "ユーザーに件数を伝えて了承を得たら、--allow-loss を付けて再実行してください。"
    );
  }
  rows = rebuilt.rows;
} else {
  const aligned = R.alignRowsByLabel(data.conditions, data.outcomes.length, data.rows);
  const blocked = aligned.stray.length > 0 || aligned.conflicts.length > 0;
  if (blocked && targetPath) {
    if (aligned.stray.length > 0) {
      console.error(
        `✗ 直積に当てはまらない行があります（${aligned.stray.length}件。下書きの ${aligned.stray.map(rowRef).join("、")}）。\n` +
          "  values には conditions[i].values のラベルをそのまま書き、values と results は条件・結果と同じ本数にします。"
      );
    }
    if (aligned.conflicts.length > 0) {
      console.error(
        `✗ 同じ組み合わせの行が食い違っています（下書きの ${aligned.conflicts
          .map((group) => group.map(rowRef).join(" と "))
          .join("、")}）。1行にまとめてください。`
      );
    }
    process.exit(1);
  }
  // --check で揃えられないときは入力の並びのまま比べる。ずれは row-set の警告が出す
  if (!blocked) rows = aligned.rows;
  notReordered = aligned.ambiguous;
}

const ordered = { ...data, rows };
const text = C.serialize(ordered, schema);

// ---------- 以降の報告は「アプリが開くことになるファイル」の並びで行う ----------
//
// 整合性の message と未記入の報告は #N で行を指す。--check が指すのは入力ファイル
// そのもの、--out が指すのはこれから書き出すファイルなので、並びを経路で選ぶ。
// 下書きの並びで報告すると、書き出したファイルを --check したときと食い違う

const reported = targetPath ? ordered : data;
const { conditions, outcomes } = reported;
const reportedRows = reported.rows;

// ---------- 整合性検証（レベル2相当。警告にとどめる） ----------
//
// アプリの src/modules/decision-table/consistency.ts の7ルールを同じ順で見る。
// あちらは core の findDuplicates / normalizeForMatch / rowRef / buildErrorMarks を
// 値 import しているので同梱できず、**判定と文言をここで手複製している。文言は
// アプリが正**——ズレると同じ問題が2つの言葉で説明され、ユーザーが別問題だと思う。
// ズレたら src/modules/decision-table/skill-write.smoke.test.ts が赤くなる

const warnings = [];

/** 空は未記入であって矛盾ではない。重複の判定から外す */
const named = (label) => label !== "";

// ID 重複（ID は機械的識別子なので正規化しない完全一致）
for (const [id, indices] of findDuplicates(conditions, (x) => x.id)) {
  warnings.push(`ID が重複しています（${indices.length}件。${indices.map(rowRef).join(" ／ ")}）: ${id}`);
}
for (const [id, indices] of findDuplicates(outcomes, (x) => x.id)) {
  warnings.push(`ID が重複しています（${indices.length}件。${indices.map(rowRef).join(" ／ ")}）: ${id}`);
}

// 名前の重複（NFKC 正規化と英字の大小同一視。空文字は対象外）
{
  const targets = conditions.filter((x) => named(x.name));
  for (const indices of findDuplicates(targets, (x) => normalizeForMatch(x.name)).values()) {
    const at = indices.map((i) => conditions.indexOf(targets[i]));
    warnings.push(
      `条件名「${targets[indices[0]].name}」が${indices.length}件重複しています（${at.map(rowRef).join(" ／ ")}）`
    );
  }
}
{
  const targets = outcomes.filter((x) => named(x.name));
  for (const indices of findDuplicates(targets, (x) => normalizeForMatch(x.name)).values()) {
    const at = indices.map((i) => outcomes.indexOf(targets[i]));
    warnings.push(
      `結果名「${targets[indices[0]].name}」が${indices.length}件重複しています（${at.map(rowRef).join(" ／ ")}）`
    );
  }
}

// 値ラベル・選択肢ラベルの重複（1つの条件・結果の中だけを見る）
conditions.forEach((c, index) => {
  const labels = c.values.filter(named);
  for (const group of findDuplicates(labels, (v) => normalizeForMatch(v)).values()) {
    warnings.push(`${rowRef(index)}「${c.name}」の値「${labels[group[0]]}」が${group.length}件重複しています`);
  }
});
outcomes.forEach((o, index) => {
  const labels = o.choices.filter(named);
  for (const group of findDuplicates(labels, (v) => normalizeForMatch(v)).values()) {
    warnings.push(`${rowRef(index)}「${o.name}」の選択肢「${labels[group[0]]}」が${group.length}件重複しています`);
  }
});

// 長さの不一致と未知の値
reportedRows.forEach((row, index) => {
  if (row.values.length !== conditions.length || row.results.length !== outcomes.length) {
    warnings.push(
      `${rowRef(index)} の列数が条件・結果の本数と違います（値 ${row.values.length}／${conditions.length}、結果 ${row.results.length}／${outcomes.length}）`
    );
  }
  row.values.forEach((value, i) => {
    const condition = conditions[i];
    if (condition === undefined || value === "" || condition.values.includes(value)) return;
    warnings.push(`${rowRef(index)} の「${condition.name}」に、条件の値にない「${value}」が入っています`);
  });
  row.results.forEach((value, j) => {
    const outcome = outcomes[j];
    if (outcome === undefined || value === "" || outcome.choices.includes(value)) return;
    warnings.push(`${rowRef(index)} の「${outcome.name}」に、選択肢にない「${value}」が入っています`);
  });
});

// 直積との不一致。欠け・余り・順序違いをまとめて1件で出す
{
  const size = R.productSize(conditions);
  const matches =
    reportedRows.length === size &&
    reportedRows.every((row, position) => {
      const indices = R.valueIndicesAt(conditions, position);
      return conditions.every((c, i) => row.values[i] === c.values[indices[i]]);
    });
  if (!matches) {
    warnings.push(
      `行の集合が条件の直積と一致しません（${reportedRows.length}行／${size}行）。条件か値を編集すると整い直します`
    );
  }
}

// ---------- 書き出し先の警告（整合性の警告とは別の見出しに出す） ----------

const fileWarnings = [];
if (tooLarge) {
  fileWarnings.push(`直積が行数の上限（${R.MAX_ROWS}行）を超えています（${total}行）。アプリは開いた瞬間に全行を描きます`);
}
if (targetPath) {
  const dir = path.dirname(targetPath);
  // 改行コードの担保（プロジェクト雛形の責務だが、雛形が無い場合に備えて気づけるようにする）
  if (fs.existsSync(path.join(dir, ".git")) && !hasJsonEolRule(dir)) {
    fileWarnings.push(`.gitattributes に「*.json text eol=lf」がありません（autocrlf 環境で全行diffになります）`);
  }
}

// ---------- 要対応の集計（アプリの帯と同じ関数） ----------

const tallyLine = T.tallyLine(M.tallyMissing(reported));

const blankResults = [];
reportedRows.forEach((row, i) => {
  outcomes.forEach((o, j) => {
    if (!M.isMissingResult(row, j)) return;
    blankResults.push(o.name === "" ? `${rowRef(i)} の結果${rowRef(j)}` : `${rowRef(i)}「${o.name}」`);
  });
});

const nameless = [];
conditions.forEach((c, i) => {
  if (M.isMissingLabel(c.name)) nameless.push(`条件${rowRef(i)}`);
  c.values.forEach((v, k) => {
    if (M.isMissingLabel(v)) nameless.push(`条件${rowRef(i)} の値${rowRef(k)}`);
  });
});
outcomes.forEach((o, j) => {
  if (M.isMissingLabel(o.name)) nameless.push(`結果${rowRef(j)}`);
  o.choices.forEach((choice, k) => {
    if (M.isMissingLabel(choice)) nameless.push(`結果${rowRef(j)} の選択肢${rowRef(k)}`);
  });
});

// ---------- 書き出しと報告 ----------

if (targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, text, "utf8"); // LF・BOMなし・末尾改行あり
  console.log(`✓ 正規形で書き出しました: ${targetPath}`);
} else {
  const raw = fs.readFileSync(sourcePath, "utf8");
  console.log(`✓ スキーマ検証OK: ${sourcePath}`);
  console.log(raw === text ? "✓ 正規形と一致しています" : "△ 正規形と差があります（--in/--out で書き直せます）");
}
if (notReordered) {
  console.log("△ 同じ値ラベルを2件持つ条件があるため、行を並べ替えていません");
}
const impossibleCount = reportedRows.filter((row) => row.impossible).length;
console.log(
  `  条件: ${conditions.length}本 ／ 結果: ${outcomes.length}本 ／ 行: ${reportedRows.length}行（起こりえない ${impossibleCount}行）`
);
if (rebuilt) {
  console.log(`  組み直しで失われた結果: ${rebuilt.lostCells}件（うち、食い違って空欄に落ちたもの ${rebuilt.clearedCells}件）`);
}
console.log(`  ${tallyLine}`);
if (blankResults.length) console.log(`  未記入の結果: ${blankResults.join("、")}`);
if (nameless.length) console.log(`  名前なし: ${nameless.join("、")}`);

if (warnings.length) {
  console.log(`\n⚠ 整合性の警告（アプリでは赤表示。ファイルは開けます）`);
  for (const w of warnings) console.log(`  - ${w}`);
}
if (fileWarnings.length) {
  console.log(`\n⚠ 書き出し先の警告`);
  for (const w of fileWarnings) console.log(`  * ${w}`);
}

// ---------- 補助 ----------

/** 行・条件・結果の呼び名（core/row-ref.ts の rowRef）。配列位置＋1 */
function rowRef(index) {
  return `#${index + 1}`;
}

/** 照合用の正規化（core/normalize.ts の normalizeForMatch）。NFKC ＋ 前後空白の除去 ＋ 英字の大小同一視 */
function normalizeForMatch(s) {
  return s.normalize("NFKC").trim().toLowerCase();
}

/** 鍵ごとの配列位置のうち、2件以上のものだけ（core/duplicate.ts の findDuplicates）。鍵は初出順 */
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

function requireValid(value, subject) {
  if (validate(value)) return;
  console.error(`✗ ${subject}スキーマ検証に失敗しました（アプリはこのファイルを開けません）`);
  for (const e of validate.errors) {
    const at = e.instancePath || "(ルート)";
    const extra = e.params?.allowedValues ? `（許可値: ${e.params.allowedValues.join(", ")}）` : "";
    console.error(`  - ${at}: ${e.message}${extra}`);
  }
  console.error(`\n直してから再実行してください。IDは必ず scripts/new-id.mjs で採番します。`);
  process.exit(1);
}

function readJson(p, label) {
  let raw;
  try { raw = fs.readFileSync(p, "utf8"); } catch { die(2, `${label}が読めません: ${p}`); }
  try { return JSON.parse(C.stripBom(raw)); } catch (e) { die(1, `${label}が JSON として壊れています: ${p}\n  ${e.message}`); }
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
