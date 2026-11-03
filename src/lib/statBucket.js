// 기간별 선곡 추이의 집계 단위. 다양성 섹션의 선곡 수(diversity)와 같은 계열을 그리지 않는다:
// stats/timeline 과 diversity 는 같은 선곡을 같은 주·월 라벨로 센다.
// 범위가 한 학기를 넘으면 학기별, 한 학기 이하면 주별/월별 토글이 보이지 않는 쪽(주별 ↔ 월별).

import { ALL, CURRENT, CUSTOM, isIsoDate } from './statPeriod.js';

// 날짜(YYYY-MM-DD)가 속한 학기 'YYYY-N'. 백엔드의 학기 버킷과 같은 규칙:
// 3~8월 = 그해 1학기, 9~12월 = 그해 2학기, 1~2월 = 전해 2학기.
/** @param {string} date */
export function semesterOf(date) {
	const year = Number(date.slice(0, 4));
	const month = Number(date.slice(5, 7));
	if (month >= 3 && month <= 8) return `${year}-1`;
	return month >= 9 ? `${year}-2` : `${year - 1}-2`;
}

// 범위가 두 학기 이상에 걸치는가. 시작일이 비면 처음부터라 걸친다고 보고, 종료일이 비면 오늘까지로 본다.
/**
 * @param {{ start?: string, end?: string }} range
 * @param {string} today YYYY-MM-DD
 */
export function spansSemesters({ start, end }, today) {
	if (!start) return true;
	return semesterOf(start) !== semesterOf(end || today);
}

// 기간별 선곡 추이에 보낼 bucket: 'semester' | 'week' | 'month'.
// period 는 statPeriod.js 의 기간('current' | 'all' | 'custom' | 학기 id), start·end 는 보낼 범위.
/**
 * @param {{ period: string, start?: string, end?: string }} view
 * @param {string} diversityBucket 주별/월별 토글('week' | 'month')
 * @param {string} today YYYY-MM-DD
 */
export function chooseTimelineBucket({ period, start, end }, diversityBucket, today) {
	const several =
		period === ALL ||
		((period === CURRENT || period === CUSTOM) && spansSemesters({ start, end }, today));
	if (several) return 'semester';
	return diversityBucket === 'week' ? 'month' : 'week';
}

// 다양성 섹션의 주별/월별 토글은 URL의 bucket 에 둔다(링크로 같은 보기를 연다).
// 기본값 월별은 URL에 남기지 않고, week 가 아닌 값은 월별로 읽는다.
/** @param {URLSearchParams} params */
export function readDiversityBucket(params) {
	return params.get('bucket') === 'week' ? 'week' : 'month';
}

/**
 * @param {URLSearchParams} params
 * @param {string} bucket 'week' | 'month'
 */
export function writeDiversityBucket(params, bucket) {
	if (bucket === 'week') params.set('bucket', 'week');
	else params.delete('bucket');
}

const BUCKET_NAMES = { week: '주별', month: '월별', semester: '학기별' };

/** @param {string} bucket */
export function timelineBucketName(bucket) {
	return BUCKET_NAMES[/** @type {keyof typeof BUCKET_NAMES} */ (bucket)] ?? '기간별';
}

const WEEK = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const SEMESTER = /^(\d{4})-([12])$/;

// UTC 날짜 → 'YYYY-MM-DD'.
/** @param {Date} date */
const isoDate = (date) => date.toISOString().slice(0, 10);

// 버킷 라벨이 덮는 날짜(YYYY-MM-DD, 양 끝 포함). 백엔드와 같은 규칙: 주 = 그 월요일부터 7일,
// 월 = 그달, 학기 = 3/1~8/31 또는 9/1~다음 해 2월 말일. 라벨이 그 단위의 형식이 아니면 null.
/**
 * @param {string} bucket 'week' | 'month' | 'semester'
 * @param {string} label stats/timeline·diversity 의 라벨('2026-08-31', '2026-09', '2026-2')
 * @returns {{ start: string, end: string } | null}
 */
export function bucketRange(bucket, label) {
	if (bucket === 'week') {
		const m = WEEK.exec(label);
		if (!m) return null;
		const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
		if (isoDate(start) !== label) return null;
		const end = new Date(start);
		end.setUTCDate(end.getUTCDate() + 6);
		return { start: label, end: isoDate(end) };
	}
	if (bucket === 'month') {
		const m = MONTH.exec(label);
		if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
		// 다음 달 0일 = 이달 말일.
		const end = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0));
		return { start: `${label}-01`, end: isoDate(end) };
	}
	if (bucket === 'semester') {
		const m = SEMESTER.exec(label);
		if (!m) return null;
		const year = Number(m[1]);
		if (m[2] === '1') return { start: `${year}-03-01`, end: `${year}-08-31` };
		return { start: `${year}-09-01`, end: isoDate(new Date(Date.UTC(year + 1, 2, 0))) };
	}
	return null;
}

// 학기 버킷 라벨('2025-2') → 학기 목록(/api/semester)에서 같은 연도·학기의 id(문자열).
// 라벨이 학기 형식이 아니거나 목록에 없으면(목록을 못 받았으면) null.
/**
 * @param {string} label
 * @param {{ id: number, year: number, semester_num: number }[] | null | undefined} semesters
 */
export function semesterIdOf(label, semesters) {
	const m = SEMESTER.exec(label);
	if (!m || !Array.isArray(semesters)) return null;
	const found = semesters.find((s) => s.year === Number(m[1]) && s.semester_num === Number(m[2]));
	return found ? String(found.id) : null;
}

// 학기 라벨('2026-2')보다 앞선 학기 중 가장 최근 것(학기 목록의 항목). 목록의 순서에 기대지 않는다.
// 이번 학기가 목록에 있으면 목록의 그다음 학기와 같고, 아직 없어도(9월 초) 앞 학기를 찾는다.
// 라벨이 학기 형식이 아니거나 목록이 없거나(못 받았으면) 앞선 학기가 없으면 null.
/**
 * @template {{ id: number, year: number, semester_num: number }} S
 * @param {string} label
 * @param {S[] | null | undefined} semesters
 * @returns {S | null}
 */
export function semesterBefore(label, semesters) {
	const m = SEMESTER.exec(label);
	if (!m || !Array.isArray(semesters)) return null;
	/** @param {{ year: number, semester_num: number }} s */
	const order = (s) => s.year * 10 + s.semester_num;
	const limit = Number(m[1]) * 10 + Number(m[2]);
	/** @type {S | null} */
	let found = null;
	for (const s of semesters) {
		if (order(s) < limit && (!found || order(s) > order(found))) found = s;
	}
	return found;
}

// 학기 id(기간 값) → 학기 목록에서 찾은 그 학기의 날짜 범위(백엔드의 semester_id 와 같은 규칙).
// 목록에 없거나(목록을 못 받았으면) 학기가 아닌 기간이면 null.
/**
 * @param {string} id
 * @param {{ id: number, year: number, semester_num: number }[] | null | undefined} semesters
 */
export function semesterRangeOf(id, semesters) {
	if (!Array.isArray(semesters)) return null;
	const found = semesters.find((s) => String(s.id) === id);
	return found ? bucketRange('semester', `${found.year}-${found.semester_num}`) : null;
}

// 진행 중인 학기(start 부터 today 까지)와 견줄 앞 학기의 같은 기간: 앞 학기 첫날부터 같은 날수만큼
// (앞 학기 끝을 넘지 않는다). 예: 2026-09-01 ~ 2026-11-03(63일) → 2026-03-01 ~ 2026-05-03.
// previous 가 없거나 날짜가 비었거나 틀렸거나 today 가 start 전이면 null.
/**
 * @param {{ start: string, end: string } | null | undefined} previous 앞 학기의 범위(bucketRange)
 * @param {string} start 진행 중인 학기의 첫날(YYYY-MM-DD)
 * @param {string} today YYYY-MM-DD
 * @returns {{ start: string, end: string } | null}
 */
export function sameSpanBefore(previous, start, today) {
	if (!previous || ![previous.start, previous.end, start, today].every(isIsoDate)) return null;
	if (today < start) return null;
	/** @param {string} date */
	const utc = (date) =>
		Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
	const end = isoDate(new Date(utc(previous.start) + (utc(today) - utc(start))));
	return { start: previous.start, end: end < previous.end ? end : previous.end };
}

// 범위를 응답이 적용한 기간(filters.start·end, 없으면 그쪽이 열림) 안으로 줄인다.
// 예: 이번 학기가 9/1 부터면 주 '2026-08-31' 은 9/1~9/6. 겹치지 않으면 null.
/**
 * @param {{ start: string, end: string } | null} range
 * @param {{ start?: string | null, end?: string | null } | null | undefined} filters
 */
export function clipRange(range, filters) {
	if (!range) return null;
	const start = filters?.start && filters.start > range.start ? filters.start : range.start;
	const end = filters?.end && filters.end < range.end ? filters.end : range.end;
	return start <= end ? { start, end } : null;
}

// timeline 응답 → 카드 데이터. 학기 버킷이면 라벨 '2025-1' 을 '2025-1학기' 로 보인다.
// today 를 주면 오늘이 든 버킷(아직 진행 중이라 일부만 센 것)에 ' (진행 중)' 을 붙인다:
// '2026-2학기 (진행 중)'. 응답의 기간이 오늘 전에 끝났으면(지난 직접 지정) 진행 중인 버킷은 없다.
/**
 * @param {{ filters?: { bucket?: string, end?: string | null }, labels: string[] }} envelope
 * @param {string} [today] YYYY-MM-DD
 */
export function timelineView(envelope, today = '') {
	const bucket = envelope.filters?.bucket ?? '';
	const end = envelope.filters?.end;
	const live = Boolean(today) && !(end && end < today);
	/** @param {string} label */
	const running = (label) => {
		const range = live ? bucketRange(bucket, label) : null;
		return Boolean(range && range.start <= today && today <= range.end);
	};
	if (bucket !== 'semester' && !envelope.labels.some(running)) return envelope;
	/** @param {string} label */
	const name = (label) => (bucket === 'semester' ? `${label}학기` : label);
	return {
		...envelope,
		labels: envelope.labels.map((label) =>
			running(label) ? `${name(label)} (진행 중)` : name(label)
		)
	};
}
