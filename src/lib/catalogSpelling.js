// 작곡가 정리(/stat/composers)의 '표기 정리': catalog/duplicates/ 가 묶은, 표기만 다른 이름들.
// 보기와 종류는 URL에 둔다: ?view=spelling(&kind=player|conductor|orchestra|music).
// 작곡가 목록(view 없음)과 종류 composer 는 기본값이라 URL에 남기지 않고, 틀린 값은 기본값으로 읽는다.
// 읽기 전용이다: 합치지 않는다.
import { catalogHref } from './composerCatalog.js';
import { composerHref } from './composerStats.js';
import { historyHref } from './playHistory.js';
import { ALL } from './statPeriod.js';

export const SPELLING_VIEW = 'spelling';
export const DEFAULT_KIND = 'composer';

// catalog/duplicates/ 의 kind. param 은 선곡 기록이 그 대상을 거르는 id 필터(작곡가는 작곡가 페이지로
// 잇는다).
export const SPELLING_KINDS = [
	{ kind: 'composer', label: '작곡가', empty: '표기가 갈린 작곡가가 없습니다', param: null },
	{ kind: 'player', label: '연주자', empty: '표기가 갈린 연주자가 없습니다', param: 'player_id' },
	{
		kind: 'conductor',
		label: '지휘자',
		empty: '표기가 갈린 지휘자가 없습니다',
		param: 'conductor_id'
	},
	{
		kind: 'orchestra',
		label: '오케스트라',
		empty: '표기가 갈린 오케스트라가 없습니다',
		param: 'orchestra_id'
	},
	{ kind: 'music', label: '곡', empty: '작품 번호가 같은 곡이 없습니다', param: 'music_id' }
];

/**
 * @typedef {{ id: number, name: string, count: number, instrument?: string,
 *   composer_id?: number | null, composer_name?: string | null }} SpellingRow
 * @typedef {{ key: string, count: number, rows: SpellingRow[] }} SpellingGroup
 */

/** @param {string} kind */
const kindSpec = (kind) => SPELLING_KINDS.find((spec) => spec.kind === kind);

// URL의 보기: null = 작곡가 목록, 아니면 표기 정리의 종류.
/**
 * @param {URLSearchParams} params
 * @returns {string | null}
 */
export function readSpellingKind(params) {
	if (params.get('view') !== SPELLING_VIEW) return null;
	const kind = params.get('kind');
	return kind && kindSpec(kind) ? kind : DEFAULT_KIND;
}

// 검색어와 보기를 담은 이 페이지의 경로. 표기 정리로 가도 목록의 검색어는 남긴다.
/**
 * @param {string} q
 * @param {string | null} kind
 */
export function catalogViewHref(q, kind) {
	const href = catalogHref(q);
	if (!kind) return href;
	const params = new URLSearchParams(href.split('?')[1] ?? '');
	params.set('view', SPELLING_VIEW);
	if (kind !== DEFAULT_KIND && kindSpec(kind)) params.set('kind', kind);
	return `/stat/composers?${params}`;
}

// catalog/duplicates/ 의 쿼리스트링.
/** @param {string} kind */
export const duplicatesSearch = (kind) => `?${new URLSearchParams({ kind })}`;

// 한 행의 링크(이름으로 찾지 않고 id로): 이름 칸(그 표기의 선곡 기록), 그리고 곡의 작곡가 칸.
// 없으면 null.
/**
 * @param {string} kind
 * @param {SpellingRow} row
 * @returns {{ name: string | null, composer: string | null }}
 */
export function rowLinks(kind, row) {
	if (kind === 'composer') return { name: composerHref(row.id), composer: null };
	const composer = kind === 'music' && row.composer_id ? composerHref(row.composer_id) : null;
	const param = kindSpec(kind)?.param;
	if (!param) return { name: null, composer };
	const name = historyHref({
		period: ALL,
		start: '',
		end: '',
		q: '',
		userId: null,
		includeMentees: false,
		requested: '',
		target: { param, id: String(row.id) }
	});
	return { name, composer };
}

// 묶음의 머리: 가장 많이 튼 표기와 '표기 N개 · 선곡 M회'.
// (백엔드의 key 는 비교용으로 다듬은 꼴이라 보이지 않는다.)
/** @param {SpellingGroup} group */
export function groupHeading(group) {
	return {
		title: group.rows[0]?.name ?? group.key,
		meta: `표기 ${group.rows.length.toLocaleString()}개 · 선곡 ${group.count.toLocaleString()}회`
	};
}

// 결과 줄: '2묶음 · 표기 5개'.
/** @param {SpellingGroup[]} groups */
export function spellingSummary(groups) {
	const rows = groups.reduce((sum, group) => sum + group.rows.length, 0);
	return `${groups.length.toLocaleString()}묶음 · 표기 ${rows.toLocaleString()}개`;
}
