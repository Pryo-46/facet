# M31 文書の整理 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 正典4本（`CLAUDE.md`・`overview-rev.md`・`open-issues.md`・`lessons-for-planning.md`）を現在形に書き直して合計 100KB 以下にし、`docs/history/` を廃止し、再び太らない規則を `CLAUDE.md` に置く。

**Architecture:** 文書だけの変更。書き直しは「いま従う規範だけを残し、経緯を落とす」の一方向で、落とし漏れは旧版からの機械抽出との突き合わせで検出する。コードはコメント約28箇所の参照先を置換するだけで、挙動は変えない。

**Tech Stack:** Markdown、bash（`grep` / `wc` / `git show`）、python（抽出スクリプト）。新しい依存は入れない。

**Spec:** `docs/superpowers/specs/2026-09-05-m31-docs-cleanup-design.md`

## Global Constraints

- **文書は現在形で書く。** 経緯・マイルストーン番号（`M21` / `issue-tree-m3` 等）・日付・「消した／足した」の記録を書かない。**本計画で書き直す文書には、マイルストーン番号を1つも残さない**（例外: 採番規約の説明そのもの）
- **1項目は2文まで。太字は1段落に1箇所まで。全角括弧の入れ子を作らない**
- **既存文書の文体に合わせない。** 上の規則に合わせる。既存文書に見える「規約」（増減の検算・由来タグ）は規約ではない
- **`overview-rev.md` のファイル名と章番号（1〜11）を動かさない。** `rev N章` の参照が 249 箇所ある
- **削除は `git rm` で行う。** 復元は git に任せる
- **`docs/superpowers/` は触らない。** 検証の grep でも除外する
- **作業ファイルは `../scratch/` に置く**（worktree の親 `.claude/worktrees/` は gitignore 済み）。リポジトリには入れない
- **検証コマンドの出力を報告に貼る。** 「確認した」だけの報告は不可
- **ドキュメントの日本語表記**: 全角括弧を使う。二倍ダッシュ（`——`）は本計画で書き直す文書では使わず、文を切る

---

### Task 1: `CLAUDE.md` を書き換える

**Files:**
- Modify: `CLAUDE.md`（全文置換）

**Interfaces:**
- Produces: 以降の全タスクが従う「文書の書き方」の規則。Task 2〜7 の実装者はこの規則を Global Constraints と併せて守る

- [ ] **Step 1: 現行の `CLAUDE.md` を読む**

Run: `cat CLAUDE.md`
Expected: 「実装計画は worktree を作ってから書く」「マージ後の後片付け（この順で行う）」「ドキュメント」「マイルストーン完了時に触る3箇所」の4節がある。前2節の内容を Step 2 でそのまま使う。

- [ ] **Step 2: 全文を次の内容に置き換える**

「実装計画は worktree を作ってから書く」「マージ後の後片付け」の2節は現行の本文をそのまま残す（下では `（現行のまま）` と書いた箇所）。「ドキュメント」以降を次で置き換える。

```markdown
# facet — 作業のしかた

## 実装計画は worktree を作ってから書く

（現行のまま）

## マージ後の後片付け（この順で行う）

（現行のまま）

## ドキュメント

**入口は [`docs/README.md`](docs/README.md)。** 読者は Claude だけで、人間は読まない。文書は3種類に分かれる。

| 種類 | 文書 | 扱い |
| --- | --- | --- |
| 正（規範） | `docs/overview-rev.md`／`docs/missing-semantics.md`／`docs/<tool>/`／`docs/project-setup.md` | いま従う設計判断。変わったら該当する文を置き換える |
| 現在の状態 | `docs/open-issues.md` | Claude が着手できる残件の一覧。解消したら消す |
| 記録 | git のコミットと PR | 経緯はここにだけある。文書には書かない |

**実装計画を書く前に読むもの**: `docs/lessons-for-planning.md`、`docs/open-issues.md`、対象ツールの `docs/<tool>/` の scope。

`rev N章` は `docs/overview-rev.md` の N 章を指す通称。**ファイル名と章番号は動かさない。**

## 文書の書き方

- **現在形で書く。** 経緯・マイルストーン番号・日付・「消した／足した」の記録は書かない。経緯は git のコミットと PR にある
- 1項目は2文まで。太字は1段落に1箇所まで。全角括弧の入れ子を作らない
- 既存文書の文体に合わせるのではなく、この規則に合わせる
- 文書の運用に関する規約（何をどこに書くか・件数を数えるか）は `CLAUDE.md` にあるものだけ。他の文書の書きぶりから運用規約を推定して計画に転記しない

## マイルストーン完了時に触る2箇所

1. **`docs/open-issues.md`** — 解消した項目を消し、見つけた項目を足す。上書きであり、変更の記録は残さない
2. **`docs/overview-rev.md`** — 設計判断が変わったときだけ、該当する章の文を書き換える。追記ではなく置換

`docs/history/` は作らない。申し送りに相当する内容は PR の本文に書く。

## 人間への依頼

- 人間の作業（実機確認・署名鍵・配布・スクリーンショット撮影・仕様の裁定）は文書に書かない。**実装完了時の最終メッセージと PR 本文で依頼する。** 実機確認のチェックリストは PR 本文に置く
- `docs/open-issues.md` に載せるのは Claude が着手できる項目だけ

## 計画とレビュー

- 計画の Global Constraints に「文書の書き方」を継承させる
- レビューは文書の差分に対して「削れる文があるか」「現在形か」を見る。「書いてあるか」だけで合否を決めない
- `docs/lessons-for-planning.md` への追記は規則1行だけ。エピソードは PR の本文に書く

## 採番

コア・用語集・エラーカタログは `MN`、ロジックツリー・シーケンス・課題ツリーは `<tool>-mN`。ブランチ名と計画ファイル名に使う。
```

- [ ] **Step 3: サイズと残存語を確かめる**

Run: `wc -c CLAUDE.md; grep -c 'history/' CLAUDE.md`
Expected: 8192 以下。`history/` の出現は「`docs/history/` は作らない」の1行だけなので `1`。

- [ ] **Step 4: コミット**

```bash
git add CLAUDE.md
git commit -m "docs(m31): CLAUDE.md を文書の書き方と完了時の2箇所へ書き換える"
```

---

### Task 2: `docs/open-issues.md` を平たい一覧に書き直す

**Files:**
- Modify: `docs/open-issues.md`（全文置換）

**Interfaces:**
- Consumes: Task 1 の規則
- Produces: Task 8 が PR 本文に載せる「人間への依頼」の一覧（本タスクの Step 3 で作る作業ファイル `../scratch/human-tasks.md`。リポジトリには入れない）

- [ ] **Step 1: 現行の項目を機械抽出して一覧にする**

Run:

```bash
mkdir -p ../scratch
python - <<'EOF' > ../scratch/open-issues-items.md
import io,re
s=io.open('docs/open-issues.md',encoding='utf-8').read().split('\n')
sec=''
for l in s:
    if l.startswith('## '): sec=l[3:]; print('\n## '+sec)
    m=re.match(r'^(\d+\.|-) \*\*(.+?)\*\*(.*)$', l)
    if m:
        paths=re.findall(r'`((?:src|src-tauri|schemas|scripts|\.claude/skills)/[^`]+)`', l)
        print('- [ ] '+m.group(2)+'  |  '+' '.join(sorted(set(paths))[:3]))
EOF
wc -l ../scratch/open-issues-items.md
```

Expected: 節8つと、`- [ ]` で始まる項目が 100 件前後。各行に見出しと、本文が指すパス（最大3つ）が並ぶ。

- [ ] **Step 2: 各項目を実物のコードで判定する**

`../scratch/open-issues-items.md` の各行について、行が指すパスを開いて次の3つに仕分けし、行末に `→ 残す` / `→ 解消済み` / `→ 人間` を書く。

- **残す**: 指摘の対象がいまもコードにあり、Claude が着手できる（テストを書く・穴を塞ぐ・負債を返す）
- **解消済み**: 指摘の対象が既に無い、または塞がっている（例: 「テストが無い」と書かれた関数に `it` が既にある）。項目の文言を信じず、ファイルを開いて確かめる
- **人間**: 実機確認・署名鍵・配布・スクリーンショット撮影・仕様の裁定（「覆すかどうかは仕様判断」と書かれたもの）

「次に手を付ける候補」の10項目は、1番（端末からキーボードで本体へ戻れない。仕様判断）と 2・3 番（自動更新の実リリース確認・未署名配布）と 4〜10 番（実機確認）がすべて **人間** になる。

Run: `grep -c '→ 残す' ../scratch/open-issues-items.md; grep -c '→ 解消済み' ../scratch/open-issues-items.md; grep -c '→ 人間' ../scratch/open-issues-items.md; grep -c '^- \[ \]' ../scratch/open-issues-items.md`
Expected: 3つの合計が4つ目（全項目数）と一致する。判定していない行が無い。

- [ ] **Step 3: 人間の項目を別ファイルに写す**

`→ 人間` の行を `../scratch/human-tasks.md` に写し、各行に「何を確かめるか」を1文で書く。実機確認の項目は、元の項目本文が参照している計画ファイル（`docs/superpowers/plans/` の該当マイルストーン）のパスを添える。このファイルは Task 8 で PR 本文に貼る。

Run: `wc -l ../scratch/human-tasks.md`
Expected: Step 2 の `→ 人間` の件数と同じ行数。

- [ ] **Step 4: 新しい `docs/open-issues.md` を書く**

`→ 残す` の項目だけを、次の形で書く。

```markdown
# 残件

Claude が着手できる項目の一覧。解消したら消す。人間の作業（実機確認・署名鍵・配布・仕様の裁定）は載せない。

## 次に手を付ける候補

（`→ 残す` のうち、放置すると実害が出るものを優先順に。無ければ節ごと省く）

## テストが無い箇所

- **見出し**（`src/path/to/file.ts`）: 何が無いか。なぜ後回しでよいか。

## 挙動の穴

- **見出し**（`src/path/to/file.ts`）: 何が起きるか。なぜ残っているか。

## 性能

## アクセシビリティ

## デザイン

## 小さな負債
```

規則:

- 1項目は「何が・どこで・なぜ残っているか」の2文まで。経緯（どのレビューが見つけた、どのマイルストーンで後回しにした）は書かない
- `[M5]` のような由来タグと、`history/` へのリンクを書かない
- 冒頭に「最終更新」の段落を置かない
- `docs/issue-tree/仮説検証モジュール-設計ノート.md`（71KB）の圧縮を「小さな負債」に1項目として足す（スペック §4）

- [ ] **Step 5: 検証**

Run:

```bash
wc -c docs/open-issues.md
grep -c '最終更新\|\[M[0-9]\|\[issue-tree-m\|\[sequence-m\|\[logic-tree-m\|history/' docs/open-issues.md
grep -c '^- \*\*' docs/open-issues.md
awk 'length($0) > 400 {print NR": "length($0)}' docs/open-issues.md
```

Expected: 20480 以下。2行目は `0`。3行目は Step 2 の `→ 残す` の件数（「次に手を付ける候補」を番号付きで書いた場合はその分を足す）。4行目は無出力（400字を超える行が無い）。

- [ ] **Step 6: コミット**

```bash
git add docs/open-issues.md
git commit -m "docs(m31): open-issues を Claude が着手できる項目だけの平たい一覧にする"
```

---

### Task 3: `docs/lessons-for-planning.md` を規則だけにする

**Files:**
- Modify: `docs/lessons-for-planning.md`（全文置換）

**Interfaces:**
- Consumes: Task 1 の規則

- [ ] **Step 1: 太字の規則文を機械抽出する**

Run:

```bash
python - <<'EOF' > ../scratch/lessons-rules.md
import io,re
for l in io.open('docs/lessons-for-planning.md',encoding='utf-8').read().split('\n'):
    if l.startswith('#'): print('\n'+l); continue
    m=re.match(r'^- \*\*(.+?)\*\*', l)
    if m: print('- '+m.group(1).strip())
EOF
grep -c '^- ' ../scratch/lessons-rules.md
```

Expected: 節見出し8つと、規則が 80 件前後。

- [ ] **Step 2: 抽出結果を読んで整える**

`../scratch/lessons-rules.md` を `docs/lessons-for-planning.md` の新しい本文として使い、次を手で直す。

- 規則文がそれだけで何を防ぐか読めないものは、半角括弧で1句だけ補う（例: `- 計画にコード断片を貼るときは、同じファイルの既存の条件付き処理と衝突しないか1回見る (不変条件を破る)`）
- 太字の中にマイルストーン番号（`M24` / `issue-tree-m3` 等）が入っていたら落とす
- 同じ趣旨の規則が2行あれば1行にまとめる
- 冒頭は `# 計画立案の教訓` と、`実装計画を書く前に読む。1規則1行。追記も1行で、エピソードは PR の本文に書く。` の1文だけ

節構成（大原則・設計判断の扱い・デバッグの進め方・テストの設計・状態と時間の扱い・タスク分割・検証手順・ドキュメントの更新）は保つ。「ドキュメントの更新」の節は Task 1 の規則と食い違う行（`history/` の訂正の仕方・申し送りの凍らせ方）を消し、`docs/overview-rev.md への反映は完了コミットで済ませる` と `「矛盾していない」を「書いてある」と読み替えない` の2行だけにする。

- [ ] **Step 3: 検証**

Run:

```bash
wc -c docs/lessons-for-planning.md
grep -c '\*\*' docs/lessons-for-planning.md
grep -cE '\bM[0-9]+\b|-m[0-9]+\b' docs/lessons-for-planning.md
awk 'length($0) > 200 {print NR": "length($0)}' docs/lessons-for-planning.md
```

Expected: 10240 以下。太字は `0`。マイルストーン番号は `0`。200字を超える行は無出力。

- [ ] **Step 4: コミット**

```bash
git add docs/lessons-for-planning.md
git commit -m "docs(m31): lessons を規則1行ずつにし、エピソードを落とす"
```

---

### Task 4: `docs/overview-rev.md` の 1〜8章・10〜11章を現在形に書き直す

**Files:**
- Modify: `docs/overview-rev.md`（9章以外）

**Interfaces:**
- Consumes: Task 1 の規則
- Produces: Task 6 が突き合わせる新版。章番号と章見出し（`## N. ...`）は旧版と同じ

- [ ] **Step 1: 旧版を退避する**

Run: `git show HEAD:docs/overview-rev.md > ../scratch/rev-old.md; grep -n '^## ' ../scratch/rev-old.md`
Expected: `## 1.` 〜 `## 11.` の11行。

- [ ] **Step 2: 章ごとに書き直す**

各章について、次の規則で本文を書き直す。9章は Task 5 で扱うので触らない。

**残すもの**

- いま従う規範（「〜する」「〜しない」「〜を正とする」）
- その規範を選んだ理由
- 選ばなかった案とその理由（例: 5章「DB を採用しない理由」）
- 参照先のパス（`src/...`、`schemas/...`）。実在を `ls` で確かめる。実在しないパス（`src/core/skill-canonical-copy.test.ts`、`scripts/generated/validate.mjs` など生成物で追跡外のもの）は、生成物なら「生成物で追跡しない」と書き、消えたものなら参照ごと落とす

**落とすもの**

- マイルストーン番号と日付（`（M7 で確定）`、`M21 で体系を作り直した`、`2026-08-01 確定`）
- 「当初は…だったが改めた」「M30 までは…、いまは…」「反転した」「追記」の形の経緯。**現在の形だけを書く**
- `history/`・`docs/superpowers/`・UI ノートへのリンク
- 実機確認の結果や実測値の記録（規範に組み込まれていない数値）
- 同じ規範の言い換えの繰り返し

**書き方**

- 太字は1段落に1箇所まで。全角括弧の入れ子を作らない
- 1段落は 400 字以内。超えるなら箇条に分ける
- 章見出し（`## N. 見出し`）は旧版と同じ文言にする

2章「ツール一覧」は、ツールごとに「何をするか」1〜2文と、実装済みかどうかだけにする。4章の Skill 群の節は「アプリのロジックを Skill と共有する標準」を、いまの形（原本から `.mjs` を生成して同梱する）だけで書く。

- [ ] **Step 3: 検証**

Run:

```bash
wc -c docs/overview-rev.md
grep -n '^## ' docs/overview-rev.md
grep -cE '\bM[0-9]+\b|issue-tree-m[0-9]|sequence-m[0-9]|logic-tree-m[0-9]|history/|superpowers/|UI ノート|当初は|反転' docs/overview-rev.md
awk 'length($0) > 400 {print NR": "length($0)}' docs/overview-rev.md
grep -o '`\(src\|src-tauri\|schemas\|scripts\|\.claude/skills\)/[A-Za-z0-9_./-]*`' docs/overview-rev.md | tr -d '`' | sort -u | while read p; do [ -e "$p" ] || echo "MISSING: $p"; done
```

Expected: 9章が旧版のままなので合計はまだ 60KB を超えてよいが、**9章を除いた部分が 45KB 以下**（`sed -n '1,/^## 9\./p' docs/overview-rev.md | wc -c` と `sed -n '/^## 10\./,$p' docs/overview-rev.md | wc -c` の合計で見る）。章見出し11行が旧版と同じ。3つ目の grep は9章に残る分だけ（9章の範囲外で 0 であることを `sed` で範囲を切って確かめる）。400字超の行は9章以外に無い。MISSING は生成物（`scripts/generated/` 配下）以外に無い。

- [ ] **Step 4: コミット**

```bash
git add docs/overview-rev.md
git commit -m "docs(m31): rev の 1〜8章・10〜11章を現在形に書き直す"
```

---

### Task 5: `docs/overview-rev.md` の 9章をデザインの入口として書き直す

**Files:**
- Modify: `docs/overview-rev.md`（9章のみ）
- Read: `docs/facet-UI設計ノート.md`（§1 診断と D1〜D20 の見出し。Task 7 で削除する）

**Interfaces:**
- Consumes: Task 4 の新版
- Produces: `### D1.` 〜 `### D20.` の見出し。Task 7 がコードコメントの「UI ノート DN」を「rev 9章 DN」へ置換するので、番号と名前が固定される

- [ ] **Step 1: UI ノートの診断と決定の見出しを読む**

Run: `sed -n '18,80p' docs/facet-UI設計ノート.md | grep -n '^###'; grep -n '^### D[0-9]' docs/facet-UI設計ノート.md`
Expected: 診断 1.1〜1.4 と、D1〜D20 の見出し20行。

- [ ] **Step 2: 9章を次の構成で書き直す**

```markdown
## 9. デザインシステム

### 診断の原則

- 差をつける場所と揃える場所を逆にしない。（1.1 の要点を1文）
- 強調の重みは使用頻度に反比例させる。（1.2 の要点を1文）
- 彩度の予算は意味色にだけ使う。（1.3 の要点を1文）
- 密度は行高で稼ぎ、文字サイズでは稼がない。（1.4 の要点を1文）

### 役割トークンとパレットの分離

（旧9章「決定：役割トークンとパレットの分離」を Task 4 と同じ規則で現在形に。トークン20個の一覧と規約6条はここ）

### 決定

#### D1. 未定義の視覚表現を全モジュールで単一化する
（規範を1〜3文。実装の所在をパスで1つ）

#### D2. 1つの色に1つの意味だけを割り当てる
…
#### D20. ダークパレット
```

規則:

- D1〜D20 の番号と名前は UI ノートの見出しから取る。名前の末尾の `← rev.3 で新規追加` などの経緯は落とす
- 各 D は「いま従う規範」を1〜3文と、実装の所在（`src/styles/palette.css`、`src/index.css`、`src/core/list-editor/cell-face.ts` 等）を1つ。UI ノートに書かれた「実施結果」「決着」「反転」の節は、**決着後の形だけ**を規範に書く
- 旧9章「確定要素」の箇条（方眼紙・端末はダーク固定・ボタン行間・フォント同梱・段と行間・角丸・測定層と描画層・フォーカスリング・KeyHints・帯の伸縮）は、対応する D があればその D の下に、無ければ「決定」の後に `### その他の規約` として現在形で置く
- 実測値（同梱量 385本・4.41MB 等）は落とす。規範に組み込まれた数値（14px 下限・3サイズ・角丸2段・27型 WQHD 基準）は残す

- [ ] **Step 3: 検証**

Run:

```bash
sed -n '/^## 9\./,/^## 10\./p' docs/overview-rev.md | wc -c
grep -c '^#### D[0-9]*\.' docs/overview-rev.md
grep -o '^#### D[0-9]*\.' docs/overview-rev.md | sort -t D -k2 -n | tr '\n' ' '
wc -c docs/overview-rev.md
grep -cE '\bM[0-9]+\b|issue-tree-m[0-9]|sequence-m[0-9]|logic-tree-m[0-9]|history/|superpowers/|UI ノート|当初は|反転' docs/overview-rev.md
awk 'length($0) > 400 {print NR": "length($0)}' docs/overview-rev.md
```

Expected: 9章は 16384 以下。`#### D` の見出しは `20`、D1〜D20 が揃う。ファイル全体は 61440 以下。経緯語は `0`。400字超の行は無出力。

- [ ] **Step 4: コミット**

```bash
git add docs/overview-rev.md
git commit -m "docs(m31): rev 9章をデザインの入口として D1〜D20 で書き直す"
```

---

### Task 6: rev の決定文を旧版と突き合わせる

**Files:**
- Read: `../scratch/rev-old.md`（Task 4 Step 1 で退避）、`docs/overview-rev.md`
- Create: `../scratch/rev-check.md`（PR 本文に貼る。リポジトリには入れない）

**Interfaces:**
- Consumes: Task 4・5 の新版
- Produces: 判定表。Task 8 が PR 本文に貼る

- [ ] **Step 1: 旧版から決定文を機械抽出する**

Run:

```bash
python - <<'EOF' > ../scratch/rev-check.md
import io,re
s=io.open('../scratch/rev-old.md',encoding='utf-8').read()
chap='?'
print('| 章 | 旧版の文 | 判定 | 理由 |\n| --- | --- | --- | --- |')
for l in s.split('\n'):
    m=re.match(r'^## (\d+)\.', l)
    if m: chap=m.group(1)
    for sent in re.split(r'(?<=[。])', l):
        if re.search(r'決定|確定|規約|しない|禁止|正とする|必須', sent) and len(sent)>10:
            t=re.sub(r'\*\*|`','',sent).strip()[:120]
            print(f'| {chap} | {t} |  |  |')
EOF
grep -c '^| [0-9]' ../scratch/rev-check.md
```

Expected: 200〜400 行の表。

- [ ] **Step 2: 1行ずつ判定する**

各行の「判定」列に次のいずれかを書く。「落とした」には理由を書く。

- `あり`: 新版に同じ規範を述べる文がある（言い回しは違ってよい）
- `落とした（経緯）`: 決定の経緯・反転の記録であり、いまの規範は別の行で残っている
- `落とした（消滅）`: 対象の実装や機構が既に無い（例: バイト一致コピーの検査）
- `復元`: 新版に無いが規範として生きている。**この場合は新版へ足す**

Run: `grep -c '^| [0-9].*|  |  |$' ../scratch/rev-check.md; grep -c '| 復元 |' ../scratch/rev-check.md`
Expected: 未判定の行は `0`。`復元` があれば Step 3 で新版に足してから再度 `0` にする（足した後は判定を `あり` に書き換える）。

- [ ] **Step 3: 復元分を新版へ足し、検証してコミット**

Run: Task 5 Step 3 の検証コマンドを再度回す。
Expected: すべて Task 5 Step 3 の期待値どおり。

```bash
git add docs/overview-rev.md
git commit -m "docs(m31): 突き合わせで落ちていた規範を rev へ戻す"
```

`復元` が0件ならコミットは不要。その旨を報告に書く。

---

### Task 7: 削除・`docs/README.md`・参照の掃除

**Files:**
- Delete: `docs/history/`（43本）、`docs/archive/`（2本）、`docs/facet-UI設計ノート.md`、`docs/issue-tree/スキーマv3-引き継ぎ.md`
- Modify: `docs/README.md`（全文置換）
- Modify: `README.md:237`、`docs/project-setup.md:5`、`docs/release.md:89,104`、`docs/glossary/scope.md:15,122`、`docs/glossary/session-notes.md:4`、`docs/logic-tree/logic-tree-canvas-tech-notes.md:195,234`、`docs/logic-tree/logic-tree-m1-scope.md:26`、`docs/sequence/sequence-design-notes.md:3,205,240-242`、`docs/missing-semantics.md:50`、`.claude/skills/palette-retheme/SKILL.md:136`
- Modify: `src/core/app-controller.ts:250-251`、`src/core/canvas/wrap.ts:42-45`、`src/fs/settings-fs.ts:24`
- Modify: 「UI ノート D」を含む `src/` 配下の約25ファイル（Step 4 の grep で列挙する）

- [ ] **Step 1: 削除する**

```bash
git rm -r -q docs/history docs/archive "docs/facet-UI設計ノート.md" "docs/issue-tree/スキーマv3-引き継ぎ.md"
git status --short | grep -c '^D '
```

Expected: `47`。

- [ ] **Step 2: `docs/README.md` を書き直す**

```markdown
# ドキュメントの地図

facet は「人間は構造化された UI で入力し、ツールが網羅性の担保・描画・構造化テキスト出力を担う」会議用ツール群。用語集・エラーカタログ・ロジックツリー・シーケンス・課題ツリーの5ツールがある。

## どれを読むか

| 知りたいこと | 読むもの |
| --- | --- |
| なぜこの設計なのか | [`overview-rev.md`](overview-rev.md)。全体方針の正。他の文書は `rev N章` の形で参照する |
| デザインの規約 | [`overview-rev.md`](overview-rev.md) 9章。診断の原則と決定 D1〜D20 |
| 欠落の規約 | [`missing-semantics.md`](missing-semantics.md)。判定源は `src/core/reading-guide.md` と一対一 |
| 用語集の範囲と仕様の理由 | [`glossary/scope.md`](glossary/scope.md)、[`glossary/session-notes.md`](glossary/session-notes.md) |
| ロジックツリーの範囲とキャンバスの技術 | [`logic-tree/logic-tree-m1-scope.md`](logic-tree/logic-tree-m1-scope.md)、[`logic-tree/logic-tree-canvas-tech-notes.md`](logic-tree/logic-tree-canvas-tech-notes.md) |
| シーケンスの範囲と仕様の理由 | [`sequence/sequence-m1-scope.md`](sequence/sequence-m1-scope.md)、[`sequence/sequence-design-notes.md`](sequence/sequence-design-notes.md) |
| エラーカタログの仕様の理由 | [`error-catalog/error-catalog-session-notes.md`](error-catalog/error-catalog-session-notes.md) |
| 課題ツリーの設計 | [`issue-tree/仮説検証モジュール-設計ノート.md`](issue-tree/仮説検証モジュール-設計ノート.md)。モックは `issue-tree/俯瞰モック/` |
| 環境・ビルド・Tauri の前提 | [`project-setup.md`](project-setup.md) |
| リリースの出し方 | [`release.md`](release.md) |
| いま何が残っているか | [`open-issues.md`](open-issues.md)。Claude が着手できる項目だけ |
| 計画を書く前に知るべき規則 | [`lessons-for-planning.md`](lessons-for-planning.md) |
| 実装計画・設計スペック | [`superpowers/plans/`](superpowers/plans/)、[`superpowers/specs/`](superpowers/specs/) |

## 文書の3種類

| 種類 | 文書 | 扱い |
| --- | --- | --- |
| 正（規範） | `overview-rev.md`、`missing-semantics.md`、各ツールのフォルダ、`project-setup.md` | いま従う設計判断。変わったら該当する文を置き換える |
| 現在の状態 | `open-issues.md` | 解消したら消す |
| 記録 | git のコミットと PR | 経緯はここにだけある。文書には書かない |

書き方の規則は [`../CLAUDE.md`](../CLAUDE.md) にある。

## ツールが増えたとき

`docs/<tool>/` を1フォルダ切る。中身のファイル名と本数はツールに合わせてよい。残件は `open-issues.md` にツール横断で1本。

## リポジトリ内の他の「正」

- `schemas/*.schema.json`: 各ツールのデータ形式の正。型（`src/types/*.ts`）はここから生成する
- `.claude/skills/`: AI 側の実装。ユーザーのデータを作る登録 Skill 5本（アプリと正規形が一致していなければならない）と、アプリ自身を触る `palette-retheme`
- `src/core/reading-guide.md`: 利用者のフォルダへ配る読み方ガイド
```

Run: `wc -c docs/README.md`
Expected: 3072 以下。

- [ ] **Step 3: 残す docs と `README.md`・SKILL.md の参照を直す**

各行を次の方針で直す。行番号は着手前のものなので、`grep -n` で引き直す。

| ファイル | 直し方 |
| --- | --- |
| `README.md:237` | 行を削除する |
| `docs/project-setup.md:5` | 「M0 の手順書そのものは archive にある」の文を削除する |
| `docs/release.md:89,104` | `docs/history/m19-...` への参照を外し、「秘密鍵を2台に置かない」という判断だけを文に残す |
| `docs/glossary/scope.md:15` | `history/` を読めと言う文を削除し、「次の計画を書く前に `../open-issues.md` を読む」だけにする |
| `docs/glossary/scope.md:122` | 「訂正（M26）」の段落を、いまの形（IBM Plex 3書体を同梱する）だけの1文にする |
| `docs/glossary/session-notes.md:4` | `archive/handoff-...` の参照を外す |
| `docs/logic-tree/logic-tree-canvas-tech-notes.md:195,234` | 「M1 時点の決定。M14 で廃止」の段落は現在の形だけに。「M1 の実機確認の結果」は「320px 固定を継続する」の1文に |
| `docs/logic-tree/logic-tree-m1-scope.md:26` | 「（logic-tree M1 の実装で確定）」を外し、現在の形だけにする |
| `docs/sequence/sequence-design-notes.md:3,205,240-242` | 3行目の前提から `history` 参照を外す。205行目の「反転した理由」は理由だけ残す。240〜242行目の表の「経緯は history/...」を消す |
| `docs/missing-semantics.md:50` | `（M25。UI ノート D17・D18。issue-tree-m4 で旗が2種になった）` を `（rev 9章 D17・D18）` にする |
| `.claude/skills/palette-retheme/SKILL.md:136` | `（UI ノート「付箋の黄」）` を `（rev 9章 D2）` にする |

- [ ] **Step 4: コードコメントを直す**

`docs/history/` を指す3箇所は、参照先が述べていた根拠をコメントに書き込んで参照を外す。

`src/core/app-controller.ts:250-251`:

```ts
    // 「このファイルが書けていない」というバナーは、そのファイルを離れたら消す
    // （バナーはファイルに紐づく。別のファイルに移った後も残ると、どのファイルの
    //  障害か分からなくなる。過去に取りこぼした障害の手がかりなので消さない）
```

`src/core/canvas/wrap.ts:42-45`:

```ts
 * **行数に上限は無い。** `textarea` を上限行数で打ち切ると、溢れた行へ
 * キャレットが届かず編集できなくなる。打ち切るなら「全文をどこで読ませるか」を
 * 先に用意する必要がある
```

`src/fs/settings-fs.ts:24`:

```ts
 * 広げてしまう。
```

「UI ノート D」の参照は機械置換する。

```bash
grep -rl 'UI ノート' src .claude/skills docs --include='*.ts' --include='*.tsx' --include='*.css' --include='*.md' --exclude-dir=node_modules --exclude-dir=superpowers | xargs sed -i 's/UI ノート D/rev 9章 D/g; s/UI ノート §[0-9.]*/rev 9章/g; s/UI ノート/rev 9章/g'
grep -rn 'UI ノート\|UI設計ノート' src .claude/skills docs --exclude-dir=node_modules --exclude-dir=superpowers
```

Expected: 2つ目の grep は無出力。置換後の `rev 9章 D19` のような参照が、Task 5 の見出しに実在する番号だけであることを次で確かめる。

```bash
grep -rhoE 'rev 9章 D[0-9]+' src .claude/skills docs --exclude-dir=node_modules --exclude-dir=superpowers | sort -u
```

Expected: 出力の番号がすべて 1〜20 の範囲。

- [ ] **Step 5: 検証**

```bash
grep -rn 'docs/history\|history/m\|history/issue\|history/sequence\|history/logic\|facet-UI設計ノート\|UI ノート\|docs/archive\|archive/\|スキーマv3-引き継ぎ' . --exclude-dir=node_modules --exclude-dir=target --exclude-dir=superpowers --exclude-dir=.git --exclude-dir=worktrees --exclude-dir=dist
npm test && npx tsc -b && npm run lint
```

Expected: grep は無出力（`CLAUDE.md` の「`docs/history/` は作らない」が出るなら、それだけは許容）。テスト・型・lint はすべて緑。

テストが docs を読んでいないことも確かめる（計画時点ではコメントでの言及だけで、`readFileSync` 等で読む箇所は無い）。

```bash
grep -rn 'readFileSync\|readFile(' src scripts --include='*.test.*' | grep -c 'docs/'
```

Expected: `0`。

- [ ] **Step 6: コミット**

```bash
git add -A README.md docs .claude/skills/palette-retheme/SKILL.md src
git commit -m "docs(m31): history・archive・UI ノートを消し、参照を rev 9章へ付け替える"
```

---

### Task 8: 最終検証と PR

**Files:**
- Read: `../scratch/human-tasks.md`（Task 2）、`../scratch/rev-check.md`（Task 6）

- [ ] **Step 1: サイズ目標を確かめる**

```bash
for f in CLAUDE.md docs/README.md docs/overview-rev.md docs/open-issues.md docs/lessons-for-planning.md; do printf "%7d %s\n" "$(wc -c < "$f")" "$f"; done
cat CLAUDE.md docs/overview-rev.md docs/open-issues.md docs/lessons-for-planning.md | wc -c
```

Expected: 順に 8192 / 3072 / 61440 / 20480 / 10240 以下。合計 102400 以下。

- [ ] **Step 2: リンク切れを確かめる**

```bash
for f in docs/README.md CLAUDE.md docs/open-issues.md docs/overview-rev.md; do grep -oE '\]\(([^)#]+)' "$f" | sed 's/](//' | grep -v '^http' | while read p; do d=$(dirname "$f"); [ -e "$d/$p" ] || [ -e "$p" ] || echo "$f -> $p"; done; done
```

Expected: 無出力。

- [ ] **Step 3: 削除対象への参照が無いことを最終確認する**

Task 7 Step 5 の grep を再度回す。
Expected: 無出力（`CLAUDE.md` の1行を除く）。

- [ ] **Step 4: PR を作る**

PR 本文には次を載せる。

1. 変更の要約（サイズの前後表）
2. **人間への依頼**: `../scratch/human-tasks.md` の全項目。実機確認は対象の計画ファイルへのリンクつき
3. **rev の突き合わせ表**: `../scratch/rev-check.md` の全行
4. `docs/superpowers/plans/` に残る `history/` 参照は計画の記録なので直していないこと

```bash
git push -u origin worktree-m31-docs-cleanup
gh pr create --title "M31: 文書を現在形へ戻し、history を廃止する" --body-file ../scratch/pr-body.md
```

Expected: PR の URL が出る。
