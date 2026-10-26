// 통계 페이지의 기간(이번 학기, 지난 학기, 전체 기간)과 URL 쿼리스트링 사이의 변환.
// 기간은 'current'(이번 학기, 기본값), 'all'(전체 기간) 또는 학기 id 문자열이다.
// URL 에는 학기면 semester_id=<id>, 전체 기간이면 period=all 을 두고, 기본값은 남기지 않는다.
// 형식이 틀린 값은 기본값으로 읽는다. 둘 다 있으면 학기를 따른다.

export const CURRENT = 'current';
export const ALL = 'all';
const ID = /^[1-9]\d*$/;

/** @param {URLSearchParams} params */
export function readStatPeriod(params) {
	const raw = params.get('semester_id');
	if (raw && ID.test(raw) && Number.isSafeInteger(Number(raw))) return raw;
	return params.get('period') === ALL ? ALL : CURRENT;
}

// params 의 기간 키만 period 에 맞춘다(다른 키는 그대로).
/**
 * @param {URLSearchParams} params
 * @param {string} period
 */
export function writeStatPeriod(params, period) {
	params.delete('semester_id');
	params.delete('period');
	if (period === ALL) params.set('period', ALL);
	else if (period !== CURRENT) params.set('semester_id', String(period));
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
	if (period === CURRENT || period === ALL) return period;
	return semesters.some((s) => String(s.id) === period) ? period : CURRENT;
}

// 백엔드가 응답의 filters 에 돌려준 적용 기간 → 머리말 문구. 날짜가 없으면 전체 기간.
/** @param {{ start?: string, end?: string } | null | undefined} filters */
export function periodRangeText(filters) {
	if (!filters) return '';
	if (!filters.start && !filters.end) return '전체 기간';
	return `${filters.start ?? ''} ~ ${filters.end ?? ''}`.trim();
}
