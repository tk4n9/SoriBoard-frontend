// 통계 drill-down: 순위 카드(작곡가·독주자·지휘자·오케스트라)의 막대나 표의 행에서 그 뒤의 곡으로.
// 막대·행의 위치를 응답의 items[i] 로 되돌리고, 이름이 아니라 id 로 거른다(이름은 겹칠 수 있다).

/** @typedef {{ card: string, param: string, noun: string, id: number, name: string }} DrillTarget */

// 카드 → stats/works 에 보낼 id 파라미터와 대상을 부르는 말.
/** @type {Record<string, { param: string, noun: string }>} */
export const DRILL_CARDS = {
	composers: { param: 'composer_id', noun: '작곡가' },
	soloists: { param: 'player_id', noun: '연주자' },
	conductors: { param: 'conductor_id', noun: '지휘자' },
	orchestras: { param: 'orchestra_id', noun: '오케스트라' }
};

// 패널에 싣는 곡 수의 상한(백엔드 limit 의 최댓값).
export const WORKS_LIMIT = 100;

// horizontalBarOption 은 1위가 맨 위에 오도록 순서를 뒤집어 그린다.
// 막대(또는 축 이름)의 dataIndex → items 의 위치. 범위 밖이면 -1.
/**
 * @param {unknown} dataIndex
 * @param {number} length
 */
export function barItemIndex(dataIndex, length) {
	if (!Number.isInteger(dataIndex)) return -1;
	const i = /** @type {number} */ (dataIndex);
	return i >= 0 && i < length ? length - 1 - i : -1;
}

// 카드와 그 응답, items 의 위치 → 대상. 카드가 drill-down 을 하지 않거나 항목·id 가 없으면 null.
/**
 * @param {string} card
 * @param {{ items?: { id: number | null, name: string }[] } | null | undefined} envelope
 * @param {number} index
 * @returns {DrillTarget | null}
 */
export function drillTarget(card, envelope, index) {
	const spec = DRILL_CARDS[card];
	const item = spec && index >= 0 ? envelope?.items?.[index] : undefined;
	if (!spec || !item || item.id == null) return null;
	return { card, param: spec.param, noun: spec.noun, id: item.id, name: item.name };
}

// stats/works 에 더할 파라미터. 기간과 범위(지기)는 페이지가 붙인다.
/** @param {DrillTarget} target */
export function drillParams(target) {
	return { [target.param]: String(target.id), limit: String(WORKS_LIMIT) };
}

// 패널의 곡 이름. stats/works 는 '작곡가 - 곡' 으로 주므로, 그 작곡가의 패널에서는 곡 이름만 남긴다.
/**
 * @param {{ name: string, composer_id?: number | null }} item
 * @param {DrillTarget} target
 */
export function workLabel(item, target) {
	const prefix = `${target.name} - `;
	if (target.card === 'composers' && item.composer_id === target.id && item.name.startsWith(prefix))
		return item.name.slice(prefix.length);
	return item.name;
}
