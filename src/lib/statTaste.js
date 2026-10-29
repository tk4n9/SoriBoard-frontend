// 통계 개인 범위의 '취향' 카드: 이 지기가 클럽보다 눈에 띄게 많이 튼 작곡가.
// 같은 기간의 stats/composers 응답 두 개(지기의 것과 클럽 전체의 것)를 견준다.
// 배율 = (지기의 선곡 / 지기의 전체 선곡) ÷ (클럽의 선곡 / 클럽의 전체 선곡).
import { formatCount, formatShare, competitionRanks } from './statTable.js';

// 두 응답 모두 이만큼(백엔드의 최대) 불러온다.
export const TASTE_FETCH_LIMIT = 100;
// 지기가 적어도 이만큼 틀어야 하고(우연한 한두 곡은 빼고), 배율이 이 이상이어야 한다.
export const TASTE_MIN_PLAYS = 3;
export const TASTE_MIN_RATIO = 1.5;
// 카드에 보이는 작곡가 수(지휘자·오케스트라 카드와 같다).
export const TASTE_LIMIT = 10;

/** @typedef {{ id: number, name: string, count: number }} Item */
/** @typedef {{ filters?: any, total_plays: number, items: Item[] }} Envelope */
/**
 * @typedef {{ id: number, name: string, count: number, clubCount: number,
 *   share: number, clubShare: number, ratio: number }} TasteItem
 */
/**
 * @typedef {{ filters?: any, total_plays: number, labels: string[], values: number[],
 *   items: TasteItem[], skipped: number }} TasteView
 */

// 배율은 소수 한 자리로(막대와 그 이름표, 표의 '배율').
/** @param {number} ratio */
const roundRatio = (ratio) => Math.round(ratio * 10) / 10;
/** @param {number} ratio */
export const formatRatio = (ratio) => `${roundRatio(ratio).toFixed(1)}배`;

// 지기의 응답과 클럽의 응답 → 취향 카드의 봉투. 배율이 높은 순, 같으면 지기가 많이 튼 순, 이름 순.
// 클럽의 목록(상위 TASTE_FETCH_LIMIT 명)에 없는 작곡가는 견줄 수 없으므로 빼고 skipped 로 센다.
/**
 * @param {Envelope} mine
 * @param {Envelope} club
 * @param {{ minPlays?: number, minRatio?: number, limit?: number }} [options]
 * @returns {TasteView}
 */
export function tasteComposers(
	mine,
	club,
	{ minPlays = TASTE_MIN_PLAYS, minRatio = TASTE_MIN_RATIO, limit = TASTE_LIMIT } = {}
) {
	const total = mine.total_plays;
	const clubTotal = club.total_plays;
	const clubCounts = new Map(club.items.map((item) => [item.id, item.count]));
	/** @type {TasteItem[]} */
	const found = [];
	let skipped = 0;
	if (total > 0 && clubTotal > 0) {
		for (const { id, name, count } of mine.items) {
			if (count < minPlays) continue;
			const clubCount = clubCounts.get(id);
			if (!clubCount) {
				skipped++;
				continue;
			}
			const share = count / total;
			const clubShare = clubCount / clubTotal;
			// 정수끼리 곱한 뒤 한 번만 나눈다: 비중끼리 나누면 딱 1.5배가 1.4999…가 되기도 한다.
			const ratio = (count * clubTotal) / (total * clubCount);
			if (ratio >= minRatio) found.push({ id, name, count, clubCount, share, clubShare, ratio });
		}
	}
	found.sort(
		(a, b) =>
			b.ratio - a.ratio ||
			b.count - a.count ||
			(a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
			a.id - b.id
	);
	const items = found.slice(0, limit);
	return {
		filters: mine.filters,
		total_plays: total,
		labels: items.map((item) => item.name),
		values: items.map((item) => roundRatio(item.ratio)),
		items,
		skipped
	};
}

// '표로 보기': 순위(보이는 배율이 같으면 같은 순위), 작곡가, 지기의 횟수와 비중, 클럽의 비중, 배율.
/**
 * @param {TasteView} view
 * @returns {import('./statTable.js').Table}
 */
export function tasteTable({ items, values }) {
	const ranks = competitionRanks(values);
	return {
		columns: [
			{ name: '순위', numeric: true },
			{ name: '작곡가' },
			{ name: '횟수', numeric: true },
			{ name: '지기 비중', numeric: true },
			{ name: '클럽 비중', numeric: true },
			{ name: '배율', numeric: true }
		],
		rowHeader: 1,
		rows: items.map((item, i) => [
			String(ranks[i]),
			item.name,
			formatCount(item.count),
			formatShare(item.share * 100),
			formatShare(item.clubShare * 100),
			formatRatio(item.ratio)
		])
	};
}

// CSV: 표와 같은 열(순위 빼고), 수치는 그대로(비중은 %, 소수 한 자리).
/**
 * @param {TasteView} view
 * @returns {{ headers: string[], rows: unknown[][] }}
 */
export function tasteCsv({ items }) {
	const percent = (/** @type {number} */ v) => Math.round(v * 1000) / 10;
	return {
		headers: ['작곡가', '횟수', '지기비중(%)', '클럽비중(%)', '배율'],
		rows: items.map((item) => [
			item.name,
			item.count,
			percent(item.share),
			percent(item.clubShare),
			roundRatio(item.ratio)
		])
	};
}

// 카드 아래 안내: 견주지 못한 작곡가 수와, 선곡은 있는데 해당하는 작곡가가 없을 때 그 까닭.
/**
 * @param {TasteView | null | undefined} view
 * @returns {string}
 */
export function tasteNote(view) {
	if (!view || !(view.total_plays > 0)) return '';
	const parts = [];
	if (view.items.length === 0) {
		parts.push(
			`${TASTE_MIN_PLAYS}번 이상 튼 작곡가 가운데 클럽보다 ${TASTE_MIN_RATIO}배 이상 자주 튼 작곡가가 없습니다`
		);
	}
	if (view.skipped > 0) {
		parts.push(
			`클럽 상위 ${TASTE_FETCH_LIMIT}명에 없는 작곡가 ${view.skipped}명은 견주지 않았습니다`
		);
	}
	return parts.join(' · ');
}
