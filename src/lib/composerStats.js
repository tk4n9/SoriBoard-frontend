// 작곡가 페이지(/stat/composer/<id>): 경로의 id, 머리말 문구, 학기 라벨, 곡 표, 링크.
// 이 페이지는 기간 없이 클럽의 전체 기록을 본다.
import { ALL } from './statPeriod.js';
import { historyHref } from './playHistory.js';
import { competitionRanks, formatCount } from './statTable.js';

const ID = /^[1-9]\d*$/;
const UNKNOWN_ERA = '미상';

// 경로의 id. 양의 정수가 아니면 null(요청하지 않고 '찾을 수 없음'을 보인다).
/** @param {string | null | undefined} raw */
export function readComposerId(raw) {
	return raw && ID.test(raw) && Number.isSafeInteger(Number(raw)) ? raw : null;
}

/** @param {number | string} id */
export const composerHref = (id) => `/stat/composer/${id}`;

// 이 작곡가의 선곡 기록(전체 기간).
/** @param {number | string} id */
export function composerHistoryHref(id) {
	return historyHref({
		period: ALL,
		start: '',
		end: '',
		q: '',
		userId: null,
		includeMentees: false,
		requested: '',
		targets: [{ param: 'composer_id', id: String(id) }]
	});
}

// 머리말의 '시대 · 출생 연도'. composers/<id>/ 의 era 는 출생 연도와 보정값으로 정한 시대다.
/** @param {{ era?: string | null, birth_year?: number | null } | null | undefined} composer */
export function composerFacts(composer) {
	if (!composer) return '';
	const era = composer.era && composer.era !== UNKNOWN_ERA ? composer.era : '시대 미상';
	const born = composer.birth_year != null ? `${composer.birth_year}년생` : '출생 연도 미상';
	return `${era} · ${born}`;
}

// stats/timeline 의 학기 버킷 라벨('2025-1') → '2025-1학기'.
/** @param {{ labels: string[], values: number[] } | null | undefined} timeline */
export function semesterSeries(timeline) {
	if (!timeline) return null;
	return { labels: timeline.labels.map((label) => `${label}학기`), values: timeline.values };
}

// stats/works 는 곡을 '작곡가 - 곡' 으로 주므로, 이 작곡가의 곡이면 곡 이름만 남긴다.
/**
 * @param {{ name: string, composer_id?: number | null }} item
 * @param {{ id: number, name: string }} composer
 */
export function composerWorkName(item, composer) {
	const prefix = `${composer.name} - `;
	if (item.composer_id === composer.id && item.name.startsWith(prefix)) {
		return item.name.slice(prefix.length);
	}
	return item.name;
}

// 곡 표: 순위, 곡, 횟수, 처음 튼 날, 마지막으로 튼 날(날짜는 그 곡의 전체 선곡 기준).
/**
 * @param {{ items: { name: string, count: number, composer_id?: number | null,
 *   first_played?: string | null, last_played?: string | null }[] }} works
 * @param {{ id: number, name: string } | null} composer
 * @returns {import('./statTable.js').Table}
 */
export function composerWorksTable(works, composer) {
	const ranks = competitionRanks(works.items.map((item) => item.count));
	return {
		columns: [
			{ name: '순위', numeric: true },
			{ name: '곡' },
			{ name: '횟수', numeric: true },
			{ name: '처음', numeric: true },
			{ name: '마지막', numeric: true }
		],
		rowHeader: 1,
		rows: works.items.map((item, i) => [
			String(ranks[i]),
			composer ? composerWorkName(item, composer) : item.name,
			formatCount(item.count),
			item.first_played ?? '—',
			item.last_played ?? '—'
		])
	};
}
