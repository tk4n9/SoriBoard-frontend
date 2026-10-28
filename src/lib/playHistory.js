// 선곡 기록(/stat/history): 필터와 URL 쿼리스트링, plays/ 요청 파라미터, 표의 문구 사이의 변환.
// 기간은 통계 페이지와 같은 키(statPeriod.js)를 쓰므로, 통계의 링크가 그대로 같은 기간을 연다.
// 그 밖에 q(검색어), user_id·include_mentees(지기, 없으면 전체), requested(true = 신청곡만,
// false = 신청곡 제외), 그리고 id 필터(통계 drill-down 의 composer_id, player_id, conductor_id,
// orchestra_id 와 곡 하나의 music_id, 함께 주면 모두 맞는 선곡)를 둔다. 기본값은 URL에 남기지 않고, 형식이 틀린 값은 기본값으로 읽는다.
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
import { bucketRange, clipRange, semesterIdOf, semesterRangeOf } from './statBucket.js';

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
 *   includeMentees: boolean, requested: '' | 'true' | 'false', targets?: HistoryTarget[] }} HistoryFilter
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

// URL의 id 필터들, TARGETS 순서로. 형식이 틀린 값은 건너뛴다.
/**
 * @param {URLSearchParams} params
 * @returns {HistoryTarget[]}
 */
function readTargets(params) {
	return Object.values(TARGETS).flatMap(({ param }) => {
		const id = readId(params.get(param));
		return id ? [{ param, id }] : [];
	});
}

/**
 * @param {URLSearchParams} params
 * @param {HistoryTarget[] | undefined} targets
 */
function writeTargets(params, targets = []) {
	for (const target of targets) if (targetCard(target)) params.set(target.param, target.id);
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
		targets: readTargets(params)
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
	writeTargets(params, filter.targets);
	const search = params.toString();
	return `${pathname}${search ? `?${search}` : ''}`;
}

// 대상 하나(id 필터 하나, 예: player_id)의 선곡 기록. period 는 statPeriod.js 의 기간(전체 기간 또는 학기 id).
/**
 * @param {string} param
 * @param {number | string} id
 * @param {string} [period]
 */
export function targetHistoryHref(param, id, period = ALL) {
	return historyHref({
		period: String(period),
		start: '',
		end: '',
		q: '',
		userId: null,
		includeMentees: false,
		requested: '',
		targets: [{ param, id: String(id) }]
	});
}

// 곡 하나(stats/works·stats/firsts 의 id)의 선곡 기록.
/**
 * @param {number | string} musicId
 * @param {string} [period]
 */
export function workHistoryHref(musicId, period = ALL) {
	return targetHistoryHref('music_id', musicId, period);
}

// 시계열 카드(선곡 추이, 선곡 수, 학기별 선곡)의 버킷마다 → 그 주·월·학기의 선곡 기록. filter 의
// 지기·id 필터는 그대로 두고, 기간은 버킷의 날짜를 응답이 적용한 기간(filters)으로 줄인 직접 지정이다.
// 그래서 선곡 기록의 '총 N곡'이 차트의 수와 같다. 라벨을 날짜로 읽을 수 없으면 null.
// 다만 줄지 않은 학기 버킷이 학기 목록(semesters)에 있으면 그 학기(semester_id)로 열어, 선곡 기록의
// 기간이 '2025-2학기'로 보인다. 백엔드의 학기 범위가 버킷의 날짜와 같으므로 수는 그대로다.
/**
 * @param {HistoryFilter} filter
 * @param {{ filters?: { bucket?: string, start?: string | null, end?: string | null },
 *   labels: string[] } | null | undefined} envelope 버킷 라벨과 filters(bucket 포함)를 담은 응답
 * @param {{ id: number, year: number, semester_num: number }[] | null} [semesters] /api/semester
 * @returns {(string | null)[]}
 */
export function bucketHistoryLinks(filter, envelope, semesters = []) {
	if (!envelope) return [];
	const bucket = envelope.filters?.bucket ?? '';
	return envelope.labels.map((label) => {
		const full = bucketRange(bucket, label);
		const range = clipRange(full, envelope.filters);
		if (!range) return null;
		const whole = bucket === 'semester' && range.start === full?.start && range.end === full?.end;
		const semesterId = whole ? semesterIdOf(label, semesters) : null;
		return historyHref(
			semesterId
				? { ...filter, period: semesterId, start: '', end: '' }
				: { ...filter, period: CUSTOM, ...range }
		);
	});
}

// drill-down 패널의 곡 하나 → 선곡 기록의 id 필터: 그 패널의 대상과 그 곡. 곡의 작곡가는
// 하나뿐이므로 작곡가 패널에서는 곡만 둔다(작곡가 페이지의 곡 링크와 같다).
/**
 * @param {{ param: string, id: number | string }} drill
 * @param {number | string} musicId
 * @returns {HistoryTarget[]}
 */
export function drillWorkTargets(drill, musicId) {
	const work = { param: 'music_id', id: String(musicId) };
	return drill.param === 'composer_id'
		? [work]
		: [{ param: drill.param, id: String(drill.id) }, work];
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
	writeTargets(params, filter.targets);
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

// CSV 파일 이름에 넣을 기간·지기 밖의 조건: id 필터마다 그 이름(모르면 '작곡가 #12'), 신청곡,
// 검색어('검색 베토벤'). 긴 이름과 검색어는 앞의 FILE_TEXT_LENGTH 자에 '…' 를 붙인다.
const FILE_TEXT_LENGTH = 40;
/** @type {Record<string, string>} */
const REQUESTED_FILE_TEXT = { true: '신청곡만', false: '신청곡 제외' };
/** @param {string} text */
function clipFileText(text) {
	const chars = Array.from(text);
	return chars.length > FILE_TEXT_LENGTH ? `${chars.slice(0, FILE_TEXT_LENGTH).join('')}…` : text;
}
/**
 * @param {HistoryFilter} filter
 * @param {Record<string, string | null>} [names] 필터(param)마다 찾은 이름
 * @returns {string[]}
 */
export function historyFileTags(filter, names = {}) {
	return [
		...(filter.targets ?? []).map((target) =>
			clipFileText(names[target.param] || targetText(target, null))
		),
		REQUESTED_FILE_TEXT[filter.requested] ?? '',
		filter.q ? `검색 ${clipFileText(filter.q)}` : ''
	];
}

// 학기의 날짜 범위는 백엔드만 알고 plays/ 는 돌려주지 않으므로, 그 학기로 거른 stats/summary 의
// filters 에서 읽는다. 그 요청의 쿼리. 학기가 아니면 null.
/** @param {string} period */
export function semesterRangeParams(period) {
	if (period === CURRENT || period === ALL || period === CUSTOM) return null;
	return new URLSearchParams({ semester_id: period });
}

// 머리말의 기간 문구(text)와 직접 지정을 고를 때 입력란에 채울 범위(shown). 학기는 받은
// filters 가 그 학기의 것이면 그 날짜를, 그 전(또는 받지 못하면)에는 학기 목록의 연도·학기로
// 짐작한 날짜를 보인다. 둘 다 없으면 문구가 비고 범위는 이번 학기다.
/**
 * @param {Pick<HistoryFilter, 'period' | 'start' | 'end'>} filter
 * @param {{ start: string, end: string }} current
 * @param {{ semester_id?: string, start?: string, end?: string } | null | undefined} semesterFilters
 * @param {{ id: number, year: number, semester_num: number }[] | null} [semesters]
 */
export function historyPeriod(filter, current, semesterFilters, semesters = null) {
	const { period } = filter;
	if (period === CURRENT) return { text: periodRangeText(current), shown: current };
	if (period === ALL) return { text: '전체 기간', shown: current };
	if (period === CUSTOM) {
		const custom = { start: filter.start, end: filter.end };
		return { text: periodRangeText(custom), shown: custom };
	}
	const f = semesterFilters;
	if (!f || f.semester_id !== period || !(f.start || f.end)) {
		const guess = semesterRangeOf(period, semesters);
		return guess ? { text: periodRangeText(guess), shown: guess } : { text: '', shown: current };
	}
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
