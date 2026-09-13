export const TALLY_TOTAL_LABEL = '要対応';
/** 集計の1行。課題ツリーの帯・Skill の報告と逐語で同じ形（derive.ts の tallyLine と一致） */
export function tallyLine(t) {
    if (t.total === 0)
        return `${TALLY_TOTAL_LABEL} 0`;
    const parts = t.parts.filter((p) => p.count > 0).map((p) => `${p.label} ${p.count}`);
    return `⚠ ${TALLY_TOTAL_LABEL} ${t.total}（${parts.join(' ／ ')}）`;
}
