// 작곡가 페이지(/stat/composer/<id>): 경로의 id, 기간·지기와 URL, 머리말 문구, 학기 라벨, 곡 표, 링크.
// 기간은 통계와 같은 키(statPeriod.js)로 URL에 두지만, 기본값이 전체 기간이다: 전체 기간은
// 아무것도 남기지 않고, 이번 학기는 period=current 로 남긴다. 지기는 선곡 기록과 같은 키
// (user_id, include_mentees)로 두고, 기본값(전체 지기)은 남기지 않는다. 링크는 모두 그 기간·지기를 연다.
import { CURRENT, ALL, CUSTOM, readStatPeriod, readStatRange } from './statPeriod.js';
import { historyHref, bucketHistoryLinks, statHref } from './playHistory.js';
import { DRILL_CARDS } from './statDrill.js';
import { competitionRanks, formatCount } from './statTable.js';
import { periodTitle } from './statTitle.js';

const ID = /^[1-9]\d*$/;
const UNKNOWN_ERA = '미상';

// 경로의 id. 양의 정수가 아니면 null(요청하지 않고 '찾을 수 없음'을 보인다).
/** @param {string | null | undefined} raw */
export function readComposerId(raw) {
	return raw && ID.test(raw) && Number.isSafeInteger(Number(raw)) ? raw : null;
}

/**
 * @typedef {{ period: string, start?: string, end?: string, userId?: string | null,
 *   includeMentees?: boolean }} ComposerPeriod
 */
/** @type {ComposerPeriod} */
const WHOLE = { period: ALL, start: '', end: '' };
const PERIOD_KEYS = ['semester_id', 'period', 'start', 'end'];
const MEMBER_KEYS = ['user_id', 'include_mentees'];

// URL의 기간. 학기, 직접 지정, period=current(이번 학기) 순으로 따르고, 없거나 형식이 틀리면 전체 기간.
/**
 * @param {URLSearchParams} params
 * @returns {{ period: string, start: string, end: string }}
 */
export function readComposerPeriod(params) {
	const period = readStatPeriod(params);
	if (period === CUSTOM) return { period, ...readStatRange(params) };
	// readStatPeriod 는 기간 키가 없으면 이번 학기로 읽는다. 여기서는 period=current 만 이번 학기다.
	const read = period === CURRENT && params.get('period') !== CURRENT ? ALL : period;
	return { period: read, start: '', end: '' };
}

// params 의 기간 키만 filter 에 맞춘다(다른 키는 그대로). 전체 기간은 아무것도 남기지 않는다.
/**
 * @param {URLSearchParams} params
 * @param {ComposerPeriod} [filter]
 */
export function writeComposerPeriod(params, { period, start = '', end = '' } = WHOLE) {
	for (const key of PERIOD_KEYS) params.delete(key);
	if (period === CURRENT) params.set('period', CURRENT);
	else if (period === CUSTOM) {
		if (start) params.set('start', start);
		if (end) params.set('end', end);
	} else if (period !== ALL) params.set('semester_id', String(period));
}

// URL의 지기. 없거나 형식이 틀리면 전체 지기(null). 견습 포함은 지기를 고른 때만 뜻이 있다(선곡 기록과 같다).
/**
 * @param {URLSearchParams} params
 * @returns {{ userId: string | null, includeMentees: boolean }}
 */
export function readComposerMember(params) {
	const userId = readComposerId(params.get('user_id'));
	return { userId, includeMentees: userId !== null && params.get('include_mentees') === 'true' };
}

// params 의 지기 키만 filter 에 맞춘다(다른 키는 그대로). 전체 지기는 아무것도 남기지 않는다.
/**
 * @param {URLSearchParams} params
 * @param {{ userId?: string | null, includeMentees?: boolean }} [filter]
 */
export function writeComposerMember(params, { userId = null, includeMentees = false } = {}) {
	for (const key of MEMBER_KEYS) params.delete(key);
	if (!userId) return;
	params.set('user_id', String(userId));
	if (includeMentees) params.set('include_mentees', 'true');
}

/**
 * @param {number | string} id
 * @param {ComposerPeriod} [filter] 없으면 전체 기간·전체 지기
 */
export function composerHref(id, filter = WHOLE) {
	const params = new URLSearchParams();
	writeComposerPeriod(params, filter);
	writeComposerMember(params, filter);
	const search = params.toString();
	return `/stat/composer/${id}${search ? `?${search}` : ''}`;
}

// stats/ 요청의 기간 파라미터. 이번 학기는 그 날짜 범위(current)로 보낸다(통계와 같다).
/**
 * @param {ComposerPeriod} filter
 * @param {{ start: string, end: string }} current
 * @returns {Record<string, string>}
 */
export function composerPeriodParams({ period, start = '', end = '' }, current) {
	const range = period === CURRENT ? current : period === CUSTOM ? { start, end } : null;
	if (!range) return period === ALL ? {} : { semester_id: String(period) };
	/** @type {Record<string, string>} */
	const params = {};
	if (range.start) params.start = range.start;
	if (range.end) params.end = range.end;
	return params;
}

// stats/ 요청의 지기 파라미터(통계의 개인 보기와 같다). 전체 지기면 {}.
/**
 * @param {{ userId?: string | null, includeMentees?: boolean }} filter
 * @returns {Record<string, string>}
 */
export function composerMemberParams({ userId = null, includeMentees = false }) {
	if (!userId) return {};
	return includeMentees
		? { user_id: String(userId), include_mentees: 'true' }
		: { user_id: String(userId) };
}

// 카드 부제와 탭 제목에 넣을 기간의 이름. 학기가 목록에 아직 없으면 ''.
/**
 * @param {ComposerPeriod} filter
 * @param {{ id: number, year: number, semester_num: number }[] | null | undefined} semesters
 */
export function composerPeriodName(filter, semesters) {
	return filter.period === CURRENT ? '이번 학기' : periodTitle(filter, semesters);
}

// 같은 기간의 통계(전체 기간이면 period=all). 지기를 고르면 그 지기의 개인 보기.
/** @param {ComposerPeriod} [filter] */
export const composerStatHref = (filter = WHOLE) =>
	statHref(composerHistoryFilter(null, [], filter));

// 이 작곡가의 선곡 기록(filter 의 기간·지기, 없으면 전체 기간·전체 지기). extra 를 주면 그 대상(예: 연주자)과 함께 튼 것만.
/**
 * @param {number | string} id
 * @param {import('./playHistory.js').HistoryTarget[]} [extra]
 * @param {ComposerPeriod} [filter]
 */
export function composerHistoryHref(id, extra = [], filter = WHOLE) {
	return historyHref(composerHistoryFilter(id, extra, filter));
}

// 곡 하나의 선곡 기록(같은 기간·지기). 곡의 작곡가는 하나뿐이므로 곡만 거른다.
/**
 * @param {number | string} musicId
 * @param {ComposerPeriod} [filter]
 */
export function composerWorkHref(musicId, filter = WHOLE) {
	return historyHref({
		...composerHistoryFilter(null, [], filter),
		targets: [{ param: 'music_id', id: String(musicId) }]
	});
}

/**
 * @param {number | string | null} id 없으면 작곡가로 거르지 않는다
 * @param {import('./playHistory.js').HistoryTarget[]} [extra]
 * @param {ComposerPeriod} [filter]
 * @returns {import('./playHistory.js').HistoryFilter}
 */
function composerHistoryFilter(
	id,
	extra = [],
	{ period, start = '', end = '', userId = null, includeMentees = false } = WHOLE
) {
	const custom = period === CUSTOM;
	return {
		period,
		start: custom ? start : '',
		end: custom ? end : '',
		q: '',
		userId: userId || null,
		includeMentees: Boolean(userId) && includeMentees,
		requested: '',
		targets: [...(id == null ? [] : [{ param: 'composer_id', id: String(id) }]), ...extra]
	};
}

// 학기별 선곡의 학기마다 → 그 학기에 이 작곡가의 곡을 튼 선곡 기록(stats/timeline 의 학기 버킷).
// 학기 목록에 있는 학기는 semester_id 로, 없으면 그 날짜로 연다. 기간이 학기의 일부만 덮으면
// 응답의 filters 로 줄인 날짜로 연다(bucketHistoryLinks).
/**
 * @param {number | string | null} id
 * @param {{ filters?: { bucket?: string }, labels: string[] } | null | undefined} timeline
 * @param {{ id: number, year: number, semester_num: number }[] | null} [semesters] /api/semester
 * @param {ComposerPeriod} [filter]
 */
export function composerSemesterLinks(id, timeline, semesters = [], filter = WHOLE) {
	return id ? bucketHistoryLinks(composerHistoryFilter(id, [], filter), timeline, semesters) : [];
}

// 순위 카드(독주자·지휘자)의 항목마다 → 이 작곡가의 곡을 그 대상과 튼 선곡 기록. 이름이 아니라
// id 로 거른다(이름은 겹칠 수 있다). id 가 없는 항목이나 drill-down 카드가 아니면 null.
/**
 * @param {number | string} composerId
 * @param {string} card
 * @param {{ items?: { id: number | null }[] } | null | undefined} envelope
 * @param {ComposerPeriod} [filter]
 * @returns {(string | null)[]}
 */
export function composerRankLinks(composerId, card, envelope, filter = WHOLE) {
	const spec = DRILL_CARDS[card];
	return (envelope?.items ?? []).map((item) =>
		spec && item.id != null
			? composerHistoryHref(composerId, [{ param: spec.param, id: String(item.id) }], filter)
			: null
	);
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

// 곡 표: 순위, 곡, 횟수, 처음 튼 날, 마지막으로 튼 날(날짜는 기간과 상관없이 그 곡의 전체 선곡 기준).
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
