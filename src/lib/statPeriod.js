// 통계 페이지의 기간(이번 학기, 지난 학기, 전체 기간, 직접 지정)과 URL 쿼리스트링 사이의 변환.
// 기간은 'current'(이번 학기, 기본값), 'all'(전체 기간), 'custom'(직접 지정) 또는 학기 id 문자열이다.
// URL 에는 학기면 semester_id=<id>, 전체 기간이면 period=all, 직접 지정이면 start·end(YYYY-MM-DD,
// 한쪽은 비어도 된다)를 두고, 기본값은 남기지 않는다.
// 형식이 틀린 값은 기본값으로 읽는다. 여럿 있으면 학기, 직접 지정, 전체 기간 순으로 따른다.

export const CURRENT = 'current';
export const ALL = 'all';
export const CUSTOM = 'custom';
const ID = /^[1-9]\d*$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** @param {URLSearchParams} params */
export function readStatPeriod(params) {
	const raw = params.get('semester_id');
	if (raw && ID.test(raw) && Number.isSafeInteger(Number(raw))) return raw;
	if (!rangeError(readStatRange(params))) return CUSTOM;
	return params.get('period') === ALL ? ALL : CURRENT;
}

// 직접 지정 범위. 형식이 틀리거나 달력에 없는 날짜는 빈 값으로 읽는다.
/** @param {URLSearchParams} params */
export function readStatRange(params) {
	const date = (/** @type {string} */ key) => {
		const raw = params.get(key) ?? '';
		return isIsoDate(raw) ? raw : '';
	};
	return { start: date('start'), end: date('end') };
}

// params 의 기간 키만 period 에 맞춘다(다른 키는 그대로). range 는 직접 지정일 때만 쓴다.
/**
 * @param {URLSearchParams} params
 * @param {string} period
 * @param {{ start?: string, end?: string }} [range]
 */
export function writeStatPeriod(params, period, range = {}) {
	for (const key of ['semester_id', 'period', 'start', 'end']) params.delete(key);
	if (period === ALL) params.set('period', ALL);
	else if (period === CUSTOM) {
		if (range.start) params.set('start', range.start);
		if (range.end) params.set('end', range.end);
	} else if (period !== CURRENT) params.set('semester_id', String(period));
}

// 이번 학기 = 가장 최근 학기의 시작일부터 오늘까지(YYYY-MM-DD). 3/1 이후 9/1 이전이면 올해 3/1,
// 그 외에는 가장 가까운 9/1 부터다(1~2월이면 작년 9/1 부터인 직전 2학기).
export function currentSemesterRange(today = new Date()) {
	const y = today.getFullYear();
	const mar1 = new Date(y, 2, 1); // 3월
	const sep1 = new Date(y, 8, 1); // 9월
	let start = `${y - 1}-09-01`;
	if (today >= mar1 && today < sep1) start = `${y}-03-01`;
	else if (today >= sep1) start = `${y}-09-01`;
	const p = (/** @type {number} */ n) => String(n).padStart(2, '0');
	const end = `${y}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
	return { start, end };
}

// 'YYYY-MM-DD' 형식이고 달력에 있는 날짜인가(2025-02-30 은 아니다).
/** @param {string} value */
export function isIsoDate(value) {
	const m = DATE.exec(value);
	if (!m) return false;
	const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	const date = new Date(Date.UTC(y, mo - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

// 직접 지정 범위를 보낼 수 없는 까닭(입력란 옆에 보인다). 보낼 수 있으면 ''.
// 한쪽이 비면 그쪽은 열린 범위다. 시작일이 종료일보다 늦으면 백엔드는 빈 결과를 주므로 막는다.
/** @param {{ start: string, end: string }} range */
export function rangeError({ start, end }) {
	if (!start && !end) return '시작일이나 종료일을 넣어 주세요.';
	if ((start && !isIsoDate(start)) || (end && !isIsoDate(end))) {
		return '날짜를 YYYY-MM-DD 형식으로 넣어 주세요.';
	}
	if (start && end && start > end) return '시작일이 종료일보다 늦습니다.';
	return '';
}

// API(/api/semester)는 순서 없이 주므로 연도, 학기 순으로 최신 학기가 먼저 오게 정렬한다.
/** @param {{ year: number, semester_num: number }[]} semesters */
export function sortSemesters(semesters) {
	return [...semesters].sort((a, b) => b.year - a.year || b.semester_num - a.semester_num);
}

/** @param {{ year: number, semester_num: number }} semester */
export function semesterLabel(semester) {
	return `${semester.year}-${semester.semester_num}학기`;
}

// 학기 목록에 없는 학기 id 는 이번 학기로 읽는다(백엔드는 모르는 학기를 전체 기간으로 센다).
/**
 * @param {string} period
 * @param {{ id: number }[]} semesters
 */
export function knownPeriod(period, semesters) {
	if (period === CURRENT || period === ALL || period === CUSTOM) return period;
	return semesters.some((s) => String(s.id) === period) ? period : CURRENT;
}

// 백엔드가 응답의 filters 에 돌려준 적용 기간 → 머리말 문구. 날짜가 없으면 전체 기간.
/** @param {{ start?: string, end?: string } | null | undefined} filters */
export function periodRangeText(filters) {
	if (!filters) return '';
	if (!filters.start && !filters.end) return '전체 기간';
	return `${filters.start ?? ''} ~ ${filters.end ?? ''}`.trim();
}
