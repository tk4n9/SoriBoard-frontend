// 선곡 기록(/stat/history): 필터와 URL 쿼리스트링, plays/ 요청 파라미터, 표의 문구 사이의 변환.
// 기간은 통계 페이지와 같은 키(statPeriod.js)를 쓰므로, 통계의 링크가 그대로 같은 기간을 연다.
// 그 밖에 q(검색어), user_id·include_mentees(지기, 없으면 전체), requested(true = 신청곡만,
// false = 신청곡 제외), 그리고 id 필터 하나(통계 drill-down 의 composer_id, player_id,
// conductor_id, orchestra_id 또는 곡 하나의 music_id)를 둔다. 기본값은 URL에 남기지 않고, 형식이 틀린 값은 기본값으로 읽는다.
import {
	CURRENT,
	ALL,
	CUSTOM,
	readStatPeriod,
	readStatRange,
	writeStatPeriod,
	periodRangeText
} from './statPeriod.js';
import { DRILL_CARDS } from './statDrill.js';

// 한 번에 불러오는 선곡 수(plays/ 의 기본값).
export const PAGE_SIZE = 50;
// CSV 저장이 한 번에 받는 선곡 수(plays/ 의 limit 최댓값).
export const EXPORT_PAGE_SIZE = 100;
const ID = /^[1-9]\d*$/;
// 대상의 이름을 찾을 때 받는 순위의 길이(백엔드 limit 의 최댓값).
const LOOKUP_LIMIT = 100;

/** @typedef {{ param: string, id: string }} HistoryTarget */
/**
 * @typedef {{ period: string, start: string, end: string, q: string, userId: string | null,
 *   includeMentees: boolean, requested: '' | 'true' | 'false', target?: HistoryTarget | null }} HistoryFilter
 */

/** @param {string | null} raw */
const readId = (raw) => (raw && ID.test(raw) && Number.isSafeInteger(Number(raw)) ? raw : null);

// id 필터가 걸러 내는 대상: drill-down 의 카드들과 곡(stats/works 의 music_id).
/** @type {Record<string, { param: string, noun: string }>} */
const TARGETS = { ...DRILL_CARDS, works: { param: 'music_id', noun: '곡' } };

// id 필터 → 그 카드(stats/<card>)와 대상을 부르는 말.
/** @param {HistoryTarget | null | undefined} target */
const targetCard = (target) =>
	target ? Object.entries(TARGETS).find(([, spec]) => spec.param === target.param) : undefined;

// URL의 id 필터. 여럿이면 TARGETS 순서로 처음 맞는 하나만 쓴다.
/**
 * @param {URLSearchParams} params
 * @returns {HistoryTarget | null}
 */
function readTarget(params) {
	for (const { param } of Object.values(TARGETS)) {
		const id = readId(params.get(param));
		if (id) return { param, id };
	}
	return null;
}

/**
 * @param {URLSearchParams} params
 * @param {HistoryTarget | null | undefined} target
 */
function writeTarget(params, target) {
	if (targetCard(target)) params.set(target.param, target.id);
}

/**
 * @param {URLSearchParams} params
 * @returns {HistoryFilter}
 */
export function readHistoryQuery(params) {
	const period = readStatPeriod(params);
	const { start, end } = period === CUSTOM ? readStatRange(params) : { start: '', end: '' };
	const userId = readId(params.get('user_id'));
	const requested = params.get('requested');
	return {
		period,
		start,
		end,
		q: (params.get('q') ?? '').trim(),
		userId,
		// 견습 포함은 지기를 고른 때만 뜻이 있다.
		includeMentees: userId !== null && params.get('include_mentees') === 'true',
		requested: requested === 'true' || requested === 'false' ? requested : '',
		target: readTarget(params)
	};
}

// 필터 → 선곡 기록의 경로(pathname?search).
/** @param {HistoryFilter} filter */
export function historyHref(filter, pathname = '/stat/history') {
	const params = new URLSearchParams();
	writeStatPeriod(params, filter.period, filter);
	if (filter.q.trim()) params.set('q', filter.q.trim());
	if (filter.userId) {
		params.set('user_id', String(filter.userId));
		if (filter.includeMentees) params.set('include_mentees', 'true');
	}
	if (filter.requested) params.set('requested', filter.requested);
	writeTarget(params, filter.target);
	const search = params.toString();
	return `${pathname}${search ? `?${search}` : ''}`;
}

// 곡 하나(stats/works·stats/firsts 의 id)의 선곡 기록. period 는 statPeriod.js 의 기간(전체 기간 또는 학기 id).
/**
 * @param {number | string} musicId
 * @param {string} [period]
 */
export function workHistoryHref(musicId, period = ALL) {
	return historyHref({
		period: String(period),
		start: '',
		end: '',
		q: '',
		userId: null,
		includeMentees: false,
		requested: '',
		target: { param: 'music_id', id: String(musicId) }
	});
}

// 필터 → 같은 기간·지기의 통계 보기 경로(검색어, 신청곡과 id 필터는 통계에 없다).
/** @param {HistoryFilter} filter */
export function statHref(filter) {
	const params = new URLSearchParams();
	writeStatPeriod(params, filter.period, filter);
	if (filter.userId) {
		params.set('scope', 'individual');
		params.set('user_id', String(filter.userId));
		if (filter.includeMentees) params.set('include_mentees', 'true');
	}
	const search = params.toString();
	return `/stat${search ? `?${search}` : ''}`;
}

// plays/ 에 보낼 쿼리. 이번 학기는 그 날짜 범위(current)로 보낸다. offset 부터 limit 개.
/**
 * @param {HistoryFilter} filter
 * @param {{ start: string, end: string }} current
 * @param {number} [offset]
 * @param {number} [limit]
 */
export function playsParams(filter, current, offset = 0, limit = PAGE_SIZE) {
	const params = new URLSearchParams();
	const range = filter.period === CURRENT ? current : filter.period === CUSTOM ? filter : null;
	if (range) {
		if (range.start) params.set('start', range.start);
		if (range.end) params.set('end', range.end);
	} else if (filter.period !== ALL) params.set('semester_id', filter.period);
	if (filter.q.trim()) params.set('q', filter.q.trim());
	if (filter.userId) {
		params.set('user_id', String(filter.userId));
		if (filter.includeMentees) params.set('include_mentees', 'true');
	}
	if (filter.requested) params.set('requested', filter.requested);
	writeTarget(params, filter.target);
	params.set('limit', String(limit));
	if (offset > 0) params.set('offset', String(offset));
	return params;
}

// id 필터의 이름을 찾는 요청: 그 대상으로 거른 전체 기간의 순위(stats/<card>). 이름은 URL에
// 두지 않는다(이름은 겹칠 수 있고, 링크가 틀린 이름을 보이면 안 된다). 필터가 없으면 null.
/** @param {HistoryTarget | null | undefined} target */
export function targetLookup(target) {
	const entry = targetCard(target);
	if (!entry || !target) return null;
	const params = new URLSearchParams({ [target.param]: target.id, limit: String(LOOKUP_LIMIT) });
	return { endpoint: entry[0], params };
}

// 그 순위에서 대상의 이름. 없으면 null.
/**
 * @param {{ items?: { id: number | null, name: string }[] } | null | undefined} envelope
 * @param {HistoryTarget} target
 */
export function targetName(envelope, target) {
	const item = envelope?.items?.find((i) => i.id != null && String(i.id) === target.id);
	return item ? item.name : null;
}

// 필터 표시: '작곡가: 이름', 이름을 모르면 '작곡가 #12'.
/**
 * @param {HistoryTarget} target
 * @param {string | null} name
 */
export function targetText(target, name) {
	const noun = targetCard(target)?.[1].noun ?? '';
	return name ? `${noun}: ${name}` : `${noun} #${target.id}`;
}

// 학기의 날짜 범위는 백엔드만 알고 plays/ 는 돌려주지 않으므로, 그 학기로 거른 stats/summary 의
// filters 에서 읽는다. 그 요청의 쿼리. 학기가 아니면 null.
/** @param {string} period */
export function semesterRangeParams(period) {
	if (period === CURRENT || period === ALL || period === CUSTOM) return null;
	return new URLSearchParams({ semester_id: period });
}

// 머리말의 기간 문구(text)와 직접 지정을 고를 때 입력란에 채울 범위(shown). 학기는 받은
// filters 가 그 학기의 것일 때만 날짜를 보이고, 그 전에는 문구가 비고 범위는 이번 학기다.
/**
 * @param {Pick<HistoryFilter, 'period' | 'start' | 'end'>} filter
 * @param {{ start: string, end: string }} current
 * @param {{ semester_id?: string, start?: string, end?: string } | null | undefined} semesterFilters
 */
export function historyPeriod(filter, current, semesterFilters) {
	const { period } = filter;
	if (period === CURRENT) return { text: periodRangeText(current), shown: current };
	if (period === ALL) return { text: '전체 기간', shown: current };
	if (period === CUSTOM) {
		const custom = { start: filter.start, end: filter.end };
		return { text: periodRangeText(custom), shown: custom };
	}
	const f = semesterFilters;
	if (!f || f.semester_id !== period || !(f.start || f.end)) return { text: '', shown: current };
	return { text: periodRangeText(f), shown: { start: f.start ?? '', end: f.end ?? '' } };
}

// 이미 받은 행 뒤에 다음 쪽을 붙인다. 그 사이에 새 선곡이 들어와 쪽이 밀리면 같은 선곡이 다시
// 오므로 id 로 한 번만 남긴다.
/**
 * @template {{ id: number }} T
 * @param {T[]} rows
 * @param {T[]} page
 */
export function appendPage(rows, page) {
	const seen = new Set(rows.map((row) => row.id));
	return [...rows, ...page.filter((row) => !seen.has(row.id))];
}

// 조건에 맞는 선곡을 모두 받는다(CSV 저장). fetchPage(offset) 은 plays/ 의 한 쪽
// ({ count, results })을 돌려준다. count 만큼 받았거나 빈 쪽이 오면 멈춘다. 쪽이 밀려 같은 선곡이
// 다시 오면 한 번만 남긴다(appendPage). onProgress(받은 수, count)로 진행을 알린다.
/**
 * @template {{ id: number }} T
 * @param {(offset: number) => Promise<{ count: number, results: T[] }>} fetchPage
 * @param {(done: number, count: number) => void} [onProgress]
 * @returns {Promise<T[]>}
 */
export async function fetchAllPlays(fetchPage, onProgress = () => {}) {
	/** @type {T[]} */
	let rows = [];
	let offset = 0;
	for (;;) {
		const page = await fetchPage(offset);
		rows = appendPage(rows, page.results);
		offset += page.results.length;
		onProgress(rows.length, page.count);
		if (page.results.length === 0 || offset >= page.count) return rows;
	}
}

/** @typedef {{ id: number, time_id: number, date: string, time: number, is_requested: boolean,
 *   composer_id?: number | null, composer_name?: string, music_title?: string,
 *   music_semi_title?: string,
 *   conductor_name?: string, orchestra_name?: string, player_names?: string[],
 *   jigi_names?: string[], mentee_names?: string[] }} Play */

/** @param {Play} play */
export const sessionText = (play) => `${play.date} ${play.time}타임`;

// '작곡가 - 곡'. 곡이 지워진 선곡은 composer_name·music_title 이 없다.
/** @param {Play} play */
export function workText(play) {
	const parts = [play.composer_name, play.music_title].filter(Boolean);
	return parts.length ? parts.join(' - ') : '곡 정보 없음';
}

// workText 의 두 부분. 작곡가 id 가 있으면 표가 작곡가 이름을 그 작곡가 페이지로 잇는다.
/** @param {Play} play */
export function workParts(play) {
	const composer = play.composer_name || '';
	const id = play.composer_id;
	const composerId =
		composer && typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
	return { composer, composerId, title: play.music_title || '' };
}

// 연주자('악기: 이름'), 오케스트라, '지휘: 이름'. 없으면 ''.
/** @param {Play} play */
export function performersText(play) {
	return [
		...(play.player_names ?? []),
		play.orchestra_name,
		play.conductor_name && `지휘: ${play.conductor_name}`
	]
		.filter(Boolean)
		.join(' · ');
}

// 그 타임의 지기와 견습 지기.
/** @param {Play} play */
export function jigiText(play) {
	return [
		...(play.jigi_names ?? []),
		...(play.mentee_names ?? []).map((name) => `${name}(견습)`)
	].join(', ');
}

// 선곡 기록 CSV 의 열과 한 선곡의 행. 여러 연주자·지기는 한 칸에 ', ' 로 잇는다.
export const PLAY_CSV_HEADERS = [
	'날짜',
	'타임',
	'작곡가',
	'곡',
	'세부 제목',
	'연주자',
	'오케스트라',
	'지휘자',
	'지기',
	'견습 지기',
	'신청곡'
];

/** @param {Play} play */
export const playCsvRow = (play) => [
	play.date,
	play.time,
	play.composer_name,
	play.music_title,
	play.music_semi_title,
	(play.player_names ?? []).join(', '),
	play.orchestra_name,
	play.conductor_name,
	(play.jigi_names ?? []).join(', '),
	(play.mentee_names ?? []).join(', '),
	play.is_requested ? 'O' : ''
];
