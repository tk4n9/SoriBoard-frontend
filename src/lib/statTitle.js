// 통계 페이지의 브라우저 탭 제목(<title>). 화면 낭독기는 페이지를 옮길 때 이 제목을 읽고,
// 학기 결산을 PDF로 인쇄하면 파일 이름이 된다. 구체적인 것(작곡가 이름, 학기)을 앞에 둔다.

import { CURRENT, ALL, CUSTOM, semesterLabel, periodRangeText } from './statPeriod.js';

// 빈 값이나 공백뿐인 값은 건너뛰고 ' · ' 로 잇는다. pageTitle('2025-2학기', '학기 결산')
/** @param {...(string | null | undefined)} parts */
export function pageTitle(...parts) {
	return parts
		.map((part) => (part ?? '').trim())
		.filter(Boolean)
		.join(' · ');
}

// 탭 제목에 넣을 기간(기간 선택의 이름). 기본값인 이번 학기는 넣지 않는다(''). 학기는 학기 목록의
// 이름('2025-2학기')이고, 목록에 아직 없거나 목록을 못 받았으면 ''. 직접 지정은 그 범위.
/**
 * @param {{ period: string, start?: string, end?: string }} filter
 * @param {{ id: number, year: number, semester_num: number }[] | null | undefined} semesters
 */
export function periodTitle({ period, start = '', end = '' }, semesters) {
	if (period === CURRENT) return '';
	if (period === ALL) return '전체 기간';
	if (period === CUSTOM) return periodRangeText({ start, end });
	const found = Array.isArray(semesters) && semesters.find((s) => String(s.id) === period);
	return found ? semesterLabel(found) : '';
}
