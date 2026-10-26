// 기간별 선곡 추이의 집계 단위. 다양성 섹션의 선곡 수(diversity)와 같은 계열을 그리지 않는다:
// stats/timeline 과 diversity 는 같은 선곡을 같은 주·월 라벨로 센다.
// 범위가 한 학기를 넘으면 학기별, 한 학기 이하면 주별/월별 토글이 보이지 않는 쪽(주별 ↔ 월별).

import { ALL, CURRENT, CUSTOM } from './statPeriod.js';

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

const BUCKET_NAMES = { week: '주별', month: '월별', semester: '학기별' };

/** @param {string} bucket */
export function timelineBucketName(bucket) {
	return BUCKET_NAMES[/** @type {keyof typeof BUCKET_NAMES} */ (bucket)] ?? '기간별';
}

// timeline 응답 → 카드 데이터. 학기 버킷이면 라벨 '2025-1' 을 '2025-1학기' 로 보인다.
/** @param {{ filters?: { bucket?: string }, labels: string[] }} envelope */
export function timelineView(envelope) {
	if (envelope.filters?.bucket !== 'semester') return envelope;
	return { ...envelope, labels: envelope.labels.map((label) => `${label}학기`) };
}
