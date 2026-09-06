#!/usr/bin/env node
// ID採番。プロジェクトのID規約（overview-rev.md 5章）に従い
// <entityPrefix>_<英数字62文字アルファベットの nanoid 10文字> を出力する。
//
// 使い方:
//   node scripts/new-id.mjs                  → node_XXXXXXXXXX を1件
//   node scripts/new-id.mjs 15               → 15件（1行1件）
//
// ロジックツリーの ID は1種類（node）しか無い。--prefix を受けるのは
// 既存4本の登録 Skill とインタフェースを揃えるためで、node 以外は exit 2。
//
// 連番IDは禁止（アプリとAIが並行してノードを追加するため、連番は必ず衝突する）。
// 乱数は crypto.randomInt（偏りのない一様分布）を使う。

import { randomInt } from "node:crypto";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LENGTH = 10;

const argv = process.argv.slice(2);
let count = 1;
let prefix = "node";

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--prefix") {
    prefix = argv[++i];
  } else if (/^\d+$/.test(a)) {
    count = Number(a);
  } else {
    console.error(`不明な引数: ${a}`);
    process.exit(2);
  }
}

if (prefix !== "node") {
  console.error(
    `--prefix は node だけです（ロジックツリーのIDは1種類）: 受け取った値 = ${JSON.stringify(prefix)}`
  );
  process.exit(2);
}
if (count < 1 || count > 1000) {
  console.error(`件数は 1〜1000 の範囲で指定してください: ${count}`);
  process.exit(2);
}

const ids = [];
for (let n = 0; n < count; n++) {
  let body = "";
  for (let i = 0; i < LENGTH; i++) body += ALPHABET[randomInt(ALPHABET.length)];
  ids.push(`${prefix}_${body}`);
}
process.stdout.write(ids.join("\n") + "\n");
