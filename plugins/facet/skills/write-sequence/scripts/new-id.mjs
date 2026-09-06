#!/usr/bin/env node
// ID採番。プロジェクトのID規約（overview-rev.md 5章）に従い
// <entityPrefix>_<英数字62文字アルファベットの nanoid 10文字> を出力する。
//
// 使い方:
//   node scripts/new-id.mjs                  → step_XXXXXXXXXX を1件
//   node scripts/new-id.mjs 12               → 12件（1行1件）
//   node scripts/new-id.mjs 3 --prefix actor → actor_XXXXXXXXXX を3件
//
// シーケンスは prefix が2種類ある（actor / step）。既定を step にしているのは
// ステップのほうが件数が多いから。取り違えても sequence-write.mjs の
// pattern 検証（^actor_[A-Za-z0-9]{10}$ 等）が捕まえる。
//
// 連番IDは禁止（アプリとAIが並行して要素を追加するため、連番は必ず衝突する）。
// 乱数は crypto.randomInt（偏りのない一様分布）を使う。

import { randomInt } from "node:crypto";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LENGTH = 10;

const argv = process.argv.slice(2);
let count = 1;
let prefix = "step";

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

if (prefix !== "actor" && prefix !== "step") {
  console.error(
    `--prefix は actor か step のどちらかです: 受け取った値 = ${JSON.stringify(prefix)}`
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
