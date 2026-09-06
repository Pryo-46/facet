/** 最新イベントの kind。空なら null（＝未決） */
export function latestKind(events) {
    return events.length === 0 ? null : events[events.length - 1].kind;
}
export function hypothesisStatus(h) {
    return latestKind(h.events) ?? 'undecided';
}
export function issueStatus(node) {
    return latestKind(node.events) ?? 'open';
}
/**
 * 旗が効いている課題の ID 集合（D3）。自分自身の旗も含む。
 *
 * **課題に立つ旗は見送り（deferred）と解決（resolved）の2種だが、この導出は
 * 種別を見ない**——見ているのは「最新のイベントがあるか」（`latestKind(...) !== null`）
 * だけなので、どちらの旗でも同じように抑制される。旗を外して拾い直すときは、
 * **最新のイベントを消す**（`commands.ts` の `toggleIssueEvent`）——解除を表す種別を
 * 追記する機構は持たない。打ち消しのイベントを足す形にすると、「1件でもあれば
 * 抑制」がここで成立しなくなり、列の中身を数えることになる。**ここに kind を見る
 * 分岐を足さないこと**——足すと同じ理由で崩れる。
 *
 * **循環しているファイルでも止まらないこと**が要件。循環・参照切れは整合性検証
 * （レベル2）が受け止める＝ファイルは開ける（rev 5章）ので、ここには壊れた木が
 * 渡ってくる。祖先を辿る経路ごとに訪問済みを持ち、戻ってきたら打ち切る
 */
export function suppressedIssueIds(issues) {
    const byId = new Map();
    // 同じ id が2件あるときは先に現れた方を親とする（core/canvas/flat-tree.ts と同じ規則）
    for (const node of issues)
        if (!byId.has(node.id))
            byId.set(node.id, node);
    const out = new Set();
    for (const start of issues) {
        const seen = new Set();
        let node = start;
        while (node !== undefined && !seen.has(node.id)) {
            seen.add(node.id);
            if (latestKind(node.events) !== null) {
                out.add(start.id);
                break;
            }
            node = node.parentId === null ? undefined : byId.get(node.parentId);
        }
    }
    return out;
}
/**
 * 子を持たない課題の ID 集合（D1「問いが立つのは葉だけ」の判定）。
 *
 * **親が実在しない課題は、その親を非葉にしない。** 参照切れの課題は図の上で
 * ルートとして描かれる（整合性検証が別に赤くする）ので、存在しない id を
 * 親として数えると、どこにも無いノードのせいで問いが消える
 */
export function leafIssueIds(issues) {
    const existing = new Set();
    for (const node of issues)
        existing.add(node.id);
    const hasChild = new Set();
    for (const node of issues) {
        if (node.parentId !== null && existing.has(node.parentId))
            hasChild.add(node.parentId);
    }
    const out = new Set();
    for (const node of issues)
        if (!hasChild.has(node.id))
            out.add(node.id);
    return out;
}
/**
 * FB を待っている問いの件数。**この関数だけが「FB待ち」の条件を持つ。**
 *
 * 数えるのは「文言があり、かつ自分を指す FB が1件も無い問い」である。
 * **`askId` が `null` の FB は、どの問いの待ちも解かない**——紐づけを強制しない
 * と決めたことの裏返しで、「何か言われた」ことは「用意した問いに答えが出た」
 * ことではない。存在しない問いを指す FB も同じ（壊れたファイルでも止まらない）。
 *
 * 空文字の判定に `trim` を使わないのは、このスキーマが一貫して
 * 「空文字＝未記入」で書かれているためである（`text` / `note` / `by` も同じ）
 */
export function awaitingAskCount(h) {
    const answered = new Set();
    for (const f of h.feedbacks)
        if (f.askId !== null)
            answered.add(f.askId);
    let count = 0;
    for (const ask of h.asks)
        if (ask.text !== '' && !answered.has(ask.id))
            count += 1;
    return count;
}
/**
 * 問いの導出。**戻り値は入力の配列と同じ添字で並ぶ。** 呼び出し側（レイアウト
 * と描画）は課題・仮説を添字で引くので、ID を鍵にした Map で返すと、ID 重複
 * ファイル（受け入れて赤表示する）では2件が1エントリに潰れ、**片方が引けなく
 * なる**。配列で返すのはその席を人数分そのまま残すためである。
 *
 * **保たれるのは席の数と並びだけで、答えの区別ではない。** 抑制・葉・仮説の
 * 有無はいずれも ID を鍵にした集合から引くので、**同じ ID を持つ2件には必ず
 * 同じ答えが出る。** ID 重複ファイルがここで正しく扱われるわけではない——
 * 正しい状態はユーザーが ID を直すことで、赤表示（整合性検証の
 * `duplicate-id`）がそれを促す
 */
export function poseQuestions(data) {
    const suppressed = suppressedIssueIds(data.issues);
    const leaves = leafIssueIds(data.issues);
    const hasHypothesis = new Set();
    for (const h of data.hypotheses)
        hasHypothesis.add(h.issueId);
    const issueNeedsHypothesis = data.issues.map((node) => !suppressed.has(node.id) && leaves.has(node.id) && !hasHypothesis.has(node.id));
    const hypothesisQuestions = data.hypotheses.map((h) => {
        // ぶら下がり先が実在しない仮説は抑制されない（どの課題の配下でもない）。
        // 参照切れそのものは整合性検証（レベル2）が赤くする
        const off = suppressed.has(h.issueId);
        return {
            result: !off && h.events.length === 0,
            hold: !off && latestKind(h.events) === 'onHold',
            feedback: off ? 0 : awaitingAskCount(h),
        };
    });
    return { issueNeedsHypothesis, hypothesisQuestions };
}
/** 立っている問いだけを数える（抑制された配下は勘定に入らない） */
export function tallyQuestions(posed) {
    let hypothesis = 0;
    let result = 0;
    let hold = 0;
    let feedback = 0;
    for (const needs of posed.issueNeedsHypothesis)
        if (needs)
            hypothesis += 1;
    for (const q of posed.hypothesisQuestions) {
        if (q.result)
            result += 1;
        if (q.hold)
            hold += 1;
        // **足すのは件数である。** ほかの3つと違って真偽ではない（問い1件が要対応1件）
        feedback += q.feedback;
    }
    return { hypothesis, result, hold, feedback, total: hypothesis + result + hold + feedback };
}
/** 問いの文言。**アプリの画面と Skill の報告が同じ言葉を出すため、ここ1箇所に置く** */
export const QUESTION_LABELS = {
    hypothesis: '仮説なし',
    result: '未決',
    hold: '保留',
    feedback: 'FB待ち',
};
/**
 * 判断の種別の表示ラベル（展開したパネルのバッジ・その根拠のアクセシブル名・
 * 判断を選ぶドロップダウンの項目に出る文言）。
 *
 * **いまは `BADGE_LABELS` と同じ語しか並んでいない**——判断の種別を5語に畳んだ
 * ため、俯瞰のバッジと展開のバッジが同じ言葉を出す。それでも `BADGE_LABELS` と
 * 別に置くのは、鍵が違う（こちらは `JudgementKind`、あちらは `BadgeGroup`）
 * からであり、俯瞰と詳細をまた別の言葉に分けたくなったとき、片方だけ動かせる
 * ようにしておくため（`ISSUE_EVENT_LABELS` を別に置いているのと同じ理由）
 */
export const EVENT_KIND_LABELS = {
    supported: '支持',
    rejected: '棄却',
    onHold: '保留',
    deferred: '見送り',
};
export const TALLY_TOTAL_LABEL = '要対応';
/** 集計の1行。エディタの帯と Skill の報告が逐語で同じ文字列を出す。0 の内訳は出さない */
export function tallyLine(t) {
    const parts = [
        [QUESTION_LABELS.hypothesis, t.hypothesis],
        [QUESTION_LABELS.result, t.result],
        [QUESTION_LABELS.hold, t.hold],
        [QUESTION_LABELS.feedback, t.feedback],
    ]
        .filter(([, n]) => n > 0)
        .map(([label, n]) => `${label} ${n}`);
    if (t.total === 0)
        return `${TALLY_TOTAL_LABEL} 0`;
    return `⚠ ${TALLY_TOTAL_LABEL} ${t.total}（${parts.join(' ／ ')}）`;
}
/**
 * 帯（MissingTally 部品）へ渡す共通形。kind は OpenKind と同じ語で、
 * チップの onJump がそのまま goToNextOpen に渡せる。
 * variant の対応——未決・仮説なしは破線（open）、保留は実線（hold）、FB待ちは着信の青
 *（pending）——欠落ではなく、返事を待っている
 */
export function toMissingTally(t) {
    return {
        total: t.total,
        parts: [
            { kind: 'hypothesis', label: QUESTION_LABELS.hypothesis, count: t.hypothesis, variant: 'open' },
            { kind: 'result', label: QUESTION_LABELS.result, count: t.result, variant: 'open' },
            { kind: 'hold', label: QUESTION_LABELS.hold, count: t.hold, variant: 'hold' },
            { kind: 'feedback', label: QUESTION_LABELS.feedback, count: t.feedback, variant: 'pending' },
        ].filter((p) => p.count > 0),
    };
}
export function badgeGroupOf(status) {
    switch (status) {
        case 'supported':
            return 'yes';
        case 'rejected':
            return 'no';
        case 'onHold':
            return 'hold';
        case 'deferred':
            return 'deferred';
        case 'undecided':
            return 'open';
    }
}
export const BADGE_LABELS = {
    yes: '支持',
    no: '棄却',
    hold: '保留',
    open: '未決',
    deferred: '見送り',
};
/**
 * 課題の旗のラベル。**値は `BADGE_LABELS.deferred` と同じ語を含むが、別に持つ**
 *——課題と仮説を独立に変えられるようにするため（v2 の `ISSUE_DEFERRED_LABEL` と
 * 同じ理由）。`Record<IssueEventKind, string>` にしてあるので、旗の種別が増えたら
 * `tsc` がここで落ちる（手書きの配列にすると黙って古びる）
 */
export const ISSUE_EVENT_LABELS = {
    deferred: '見送り',
    resolved: '解決',
};
/**
 * 旗を掲げた課題の数（rev 9章 D17 の別枠）。
 *
 * 数えるのは**自分自身がその旗を掲げている課題**だけ——配下の抑制
 * （`suppressedIssueIds`）は数えない。別枠は「誰が何を落としたか／何を閉じたか」の
 * 台帳なので、入れ子の旗もそれぞれ1と数える。
 *
 * **見送りと解決は別々に数える。** 実効（配下を抑制する）は同じでも意味は逆で、
 * 「追わないもの」と「答えが出たもの」が1つの数に混ざると台帳として読めない。
 *
 * **配下に眠る凍結中の問いの数は導出しない**——出す画面が無い（別枠は件数だけ）。
 * 必要が出たら poseQuestions を抑制なしで回す形で足せる
 */
export function issueEventCount(issues, kind) {
    let count = 0;
    for (const node of issues)
        if (latestKind(node.events) === kind)
            count += 1;
    return count;
}
/** 別枠の1行。アプリのチップと Skill の報告が逐語で同じ文字列を出す。0件のときは呼び出し側が行ごと出さない（チップも描かない） */
export function issueEventLine(count, kind) {
    return `${ISSUE_EVENT_LABELS[kind]} ${count}`;
}
/** 別枠の注意書き。チップの title と Skill の報告の補足が同じ文を出す */
export const ISSUE_EVENT_NOTES = {
    deferred: `見送り配下の問いは${TALLY_TOTAL_LABEL}に数えません`,
    resolved: `解決配下の問いは${TALLY_TOTAL_LABEL}に数えません`,
};
