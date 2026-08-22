import { useState } from "react";

// ============================================================
// 仮説検証モジュール 利用イメージモック
// 題材：外部の適性検査サービスとのATS連携PoC
// 場面1〜5を進めると、ツリーが育ち、イベントが追記され、
// warning が生まれては消えていく様子を追体験できる。
// ルールは折衷案（D1）で固定。
// ============================================================

// --- 場面定義 ---
const SCENES = [
  {
    n: 1,
    title: "PRD読解（一人）",
    desc:
      "PdMから降ってきたPRDドラフトを読みながら、「聞けば分かること」（PRD側の質問リスト）と「試さないと分からないこと」を仕分ける。後者だけが課題ツリーに入る。",
    happened: [
      "根はPoCテーマ。課題は「聞いても分からない」ものだけを葉にする",
      "この時点で葉すべてに「仮説は？」が光るが、これは正常なスタート地点",
    ],
    aside:
      "PRD側の質問リストへ行った例：「候補者への結果通知は誰の責務？」「受検案内メールの文面はどちらが持つ？」——聞けば決まることは facet の外。",
  },
  {
    n: 2,
    title: "PdMヒアリング",
    desc:
      "質問リストをぶつける。大半はその場で決まりPRDが埋まるが、「それはこっちも分からない、PoCで確かめてほしい」が必ず出る。その場で葉を生やす。",
    happened: [
      "「再受検の扱い」がPdMも未定と判明 → 枝ごと新規追加（NEW）",
      "ヒアリング後のツリーは「PRDに書けなかったことの地図」になる",
    ],
  },
  {
    n: 3,
    title: "キックオフ（3人）",
    desc:
      "PRDと一緒に不完全なツリーを映す。白紙から出ない指摘が、目の前の構造の欠落としてなら出てくる。",
    happened: [
      "エンジニア指摘で「レート制限」「結果表示」の葉が生える（NEW）",
      "「同期取得で間に合う」は経験知で決着 → 検証せず棄却（実験ゼロで課題が減る、一番おいしい貢献）",
      "「取り込みタイミング」の仮説はPdM確認で自明に成立 → warning が消える",
      "残った葉に仮説を出し合う",
    ],
  },
  {
    n: 4,
    title: "PoC選定会議",
    desc:
      "全部は検証できないので選ぶ。選ばれなかったものには理由付きのイベントを追記する。値の書き換えではなく追記なので、履歴が残る。",
    happened: [
      "「再受検の扱い」を枝ごと今回見送り → 配下の問いは導出で消える（子に値はコピーしない）",
      "「結果表示」の仮説は本開発送り → PoC終了時の引き渡しリストの材料になる",
    ],
  },
  {
    n: 5,
    title: "スプリントレビュー",
    desc:
      "検証結果を追記型イベントで記録する。棄却は失敗ではなく、新しい課題を浮上させる入力になる。",
    happened: [
      "webhook仮説が支持 → この課題は決着",
      "夜間バッチ仮説が棄却 → 棄却の学び（制限は分単位窓）から新しい葉が浮上（NEW）→ サイクルは第一ステップへ戻る",
    ],
  },
];

// --- イベント種別の表示定義 ---
const EVENT_KINDS = {
  supported: { label: "支持", cls: "bg-emerald-600 text-white", bar: "border-emerald-400 bg-emerald-50" },
  rejected: { label: "棄却", cls: "bg-rose-600 text-white", bar: "border-rose-400 bg-rose-50" },
  rejectedNoTest: { label: "検証せず棄却", cls: "bg-stone-700 text-white", bar: "border-stone-400 bg-stone-100" },
  trivial: { label: "自明に成立", cls: "bg-sky-600 text-white", bar: "border-sky-400 bg-sky-50" },
  deferNow: { label: "今回見送り", cls: "bg-stone-500 text-white", bar: "border-stone-400 bg-stone-100" },
  deferMain: { label: "本開発送り", cls: "bg-indigo-600 text-white", bar: "border-indigo-400 bg-indigo-50" },
};

// --- サンプルデータ ---
// since: その要素が現れる場面番号。events[].scene: 追記された場面番号。
const TREE = {
  id: "iss_root",
  label: "適性検査サービス連携（PoCテーマ）",
  since: 1,
  children: [
    {
      id: "iss_api",
      label: "適性検査APIの応答特性が要件を満たすか不明",
      since: 1,
      children: [
        {
          id: "iss_lat",
          label: "結果取得を画面遷移の中で待てるか",
          since: 1,
          hypotheses: [
            {
              id: "hyp_sync",
              text: "同期取得で間に合う",
              since: 3,
              events: [
                { scene: 3, kind: "rejectedNoTest", note: "類似連携の実測が3〜8秒。同期待ちは体験として成立しない" },
              ],
            },
            {
              id: "hyp_wh",
              text: "webhook受信＋非同期表示に切り替えれば体験が成立する",
              since: 3,
              events: [
                { scene: 5, kind: "supported", note: "スパイクで受信まで中央値4.2秒。非同期表示で成立（n=50）" },
              ],
            },
          ],
          children: [],
        },
        {
          id: "iss_rate",
          label: "レート制限下で一括受検案内を捌けるか",
          since: 3,
          hypotheses: [
            {
              id: "hyp_batch",
              text: "送信を夜間バッチに寄せれば制限内に収まる",
              since: 3,
              events: [
                { scene: 5, kind: "rejected", note: "制限は日次でなく分単位窓と判明。夜間に寄せても超過する" },
              ],
            },
          ],
          children: [],
        },
        {
          id: "iss_queue",
          label: "送信キューの平準化方式（棄却の学びから浮上）",
          since: 5,
          hypotheses: [],
          children: [],
        },
      ],
    },
    {
      id: "iss_sync",
      label: "受検結果の取り込みタイミングを決められない",
      since: 1,
      hypotheses: [
        {
          id: "hyp_evt",
          text: "取り込みは結果確定イベント起点だけでよい（途中経過は不要）",
          since: 2,
          events: [
            { scene: 3, kind: "trivial", note: "PdM確認済み。途中経過を使う業務要件は存在しない" },
          ],
        },
      ],
      children: [],
    },
    {
      id: "iss_retake",
      label: "再受検の扱い（PdMも未定 → PoC行き）",
      since: 2,
      nodeEvents: [
        { scene: 4, kind: "deferNow", note: "初回受検フローの成立が先。次回のPoC選定で再検討" },
      ],
      children: [
        { id: "iss_rt_id", label: "受検IDの再発行が要るか", since: 2, hypotheses: [], children: [] },
        { id: "iss_rt_sc", label: "スコアはどちらを正とするか", since: 2, hypotheses: [], children: [] },
      ],
    },
    {
      id: "iss_ui",
      label: "結果表示画面に何を出すか",
      since: 3,
      hypotheses: [
        {
          id: "hyp_ui",
          text: "スコアはサマリのみで足りる（設問別は不要）",
          since: 3,
          events: [
            { scene: 4, kind: "deferMain", note: "画面の詳細は本開発の設計で扱う。PoCはAPI疎通に集中" },
          ],
        },
      ],
      children: [],
    },
  ],
};

// --- 場面でフィルタしたビューの計算 ---
const visible = (item, scene) => item.since <= scene;
const eventsAt = (events, scene) => (events ?? []).filter((e) => e.scene <= scene);

function nodeDeferred(node, scene) {
  const evs = eventsAt(node.nodeEvents, scene);
  return evs.length > 0 && evs[evs.length - 1].kind === "deferNow";
}

// 未決カウント（折衷案：問いは葉のみ。祖先見送りは導出で抑制）
function countWarnings(node, scene, suppressed = false) {
  if (!visible(node, scene)) return 0;
  const sup = suppressed || nodeDeferred(node, scene);
  const kids = node.children.filter((c) => visible(c, scene));
  const isLeaf = kids.length === 0;
  const hyps = (node.hypotheses ?? []).filter((h) => visible(h, scene));
  let n = 0;
  if (!sup) {
    if (isLeaf && hyps.length === 0) n++;
    for (const h of hyps) if (eventsAt(h.events, scene).length === 0) n++;
  }
  return kids.reduce((a, c) => a + countWarnings(c, scene, sup), n);
}

// --- イベント表示 ---
function EventRow({ ev, scene }) {
  const k = EVENT_KINDS[ev.kind];
  const isNew = ev.scene === scene;
  return (
    <div className={"mt-1.5 flex items-start gap-2 rounded-sm border-l-2 px-2 py-1.5 " + k.bar}>
      <span className={"whitespace-nowrap rounded-sm px-1.5 py-0.5 text-xs font-semibold " + k.cls}>
        {k.label}
      </span>
      <span className="text-xs leading-snug text-stone-700">{ev.note}</span>
      {isNew && (
        <span className="ml-auto whitespace-nowrap rounded-sm bg-stone-900 px-1 py-0.5 text-[10px] font-bold text-white">
          この場面で追記
        </span>
      )}
    </div>
  );
}

// --- 仮説カード ---
function Hyp({ hyp, scene, suppressed }) {
  const evs = eventsAt(hyp.events, scene);
  const warn = !suppressed && evs.length === 0;
  const isNew = hyp.since === scene;
  return (
    <div
      className={
        "mt-1.5 rounded-md border px-3 py-2 text-sm " +
        (suppressed ? "border-stone-200 bg-white opacity-45" : "border-stone-200 bg-white")
      }
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 select-none font-mono text-[10px] text-stone-400">{hyp.id}</span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="leading-snug text-stone-800">{hyp.text}</p>
            {isNew && (
              <span className="rounded-sm bg-stone-900 px-1 py-0.5 text-[10px] font-bold text-white">NEW</span>
            )}
            {warn && (
              <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                ⚠ 検証結果は？
              </span>
            )}
          </div>
          {evs.map((e, i) => (
            <EventRow key={i} ev={e} scene={scene} />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- 課題ノード ---
function Node({ node, scene, depth = 0, suppressed = false }) {
  if (!visible(node, scene)) return null;
  const selfDeferred = nodeDeferred(node, scene);
  const sup = suppressed || selfDeferred;
  const kids = node.children.filter((c) => visible(c, scene));
  const isLeaf = kids.length === 0;
  const hyps = (node.hypotheses ?? []).filter((h) => visible(h, scene));
  const warn = !sup && isLeaf && hyps.length === 0;
  const isNew = node.since === scene;
  const nodeEvs = eventsAt(node.nodeEvents, scene);

  return (
    <div className={depth > 0 ? "ml-6 border-l border-stone-300 pl-4" : ""}>
      <div className="pt-3">
        <div
          className={
            "inline-flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 " +
            (warn
              ? "border-amber-400 bg-amber-50"
              : sup && depth > 0
                ? "border-stone-200 bg-stone-50 opacity-45"
                : "border-stone-300 bg-stone-50")
          }
        >
          <span className="select-none font-mono text-[10px] text-stone-400">{node.id}</span>
          <span className="text-sm font-medium text-stone-900">{node.label}</span>
          {isNew && (
            <span className="rounded-sm bg-stone-900 px-1 py-0.5 text-[10px] font-bold text-white">NEW</span>
          )}
          {warn && (
            <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
              ⚠ 仮説は？
            </span>
          )}
        </div>

        {/* 課題ノード自身への見送り等のイベント */}
        {nodeEvs.map((e, i) => (
          <div key={i} className="max-w-xl">
            <EventRow ev={e} scene={scene} />
          </div>
        ))}
        {suppressed && !selfDeferred && (isLeaf || hyps.length > 0) && (
          <p className="mt-1 text-[11px] text-stone-400">
            祖先の見送りにより問いは立たない（導出。子に値は持たない）
          </p>
        )}

        <div className="max-w-xl">
          {hyps.map((h) => (
            <Hyp key={h.id} hyp={h} scene={scene} suppressed={sup} />
          ))}
        </div>
      </div>

      {kids.map((c) => (
        <Node key={c.id} node={c} scene={scene} depth={depth + 1} suppressed={sup} />
      ))}
    </div>
  );
}

export default function App() {
  const [scene, setScene] = useState(1);
  const sc = SCENES[scene - 1];
  const warnings = countWarnings(TREE, scene);

  return (
    <div className="min-h-screen bg-stone-100 px-6 py-8 font-sans text-stone-900">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
            facet / 利用イメージモック
          </p>
          <h1 className="mt-1 text-xl font-bold">適性検査サービス連携PoC — PRDからレビューまで</h1>
        </header>

        {/* 場面ステッパー */}
        <div className="mb-2 flex flex-wrap gap-2">
          {SCENES.map((s) => (
            <button
              key={s.n}
              onClick={() => setScene(s.n)}
              className={
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors " +
                (scene === s.n
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-300 bg-white text-stone-600 hover:border-stone-500")
              }
            >
              {s.n}. {s.title}
            </button>
          ))}
        </div>
        <p className="mb-3 text-sm leading-relaxed text-stone-600">{sc.desc}</p>

        {/* 未決サマリ */}
        <div className="mb-4 flex items-center gap-3 rounded-md border border-stone-300 bg-white px-4 py-2.5 text-sm">
          <span className="font-medium">この時点の未決：</span>
          <span className="rounded-sm bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
            ⚠ ×{warnings}
          </span>
          <span className="text-xs text-stone-500">
            （埋めるまで消えないが、間違いではない）
          </span>
        </div>

        {/* ツリー */}
        <main className="rounded-lg border border-stone-300 bg-white px-5 pb-5 pt-2">
          <Node node={TREE} scene={scene} />
        </main>

        {/* この場面で起きたこと */}
        <section className="mt-4 rounded-md border border-stone-300 bg-stone-50 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            この場面で起きたこと
          </h2>
          <ul className="mt-2 space-y-1.5">
            {sc.happened.map((h, i) => (
              <li key={i} className="flex gap-2 text-sm leading-snug text-stone-700">
                <span className="text-stone-400">—</span>
                {h}
              </li>
            ))}
          </ul>
          {sc.aside && (
            <p className="mt-3 border-t border-stone-200 pt-2 text-xs leading-relaxed text-stone-500">
              {sc.aside}
            </p>
          )}
        </section>

        <footer className="mt-4 text-xs leading-relaxed text-stone-500">
          <p>
            仮説のステータスは最新イベントから導出（値を持たない）。イベントは追記専用。
            課題ノードへの「今回見送り」は最上位に一度だけ付き、配下の問いの抑制は祖先から導出される。
          </p>
        </footer>
      </div>
    </div>
  );
}
