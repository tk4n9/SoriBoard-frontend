// 통계의 '처음 튼 작곡가·곡'(stats/firsts): 클럽 전체에서 처음 튼 날이 보기의 기간에 드는 작곡가·곡.

import { CURRENT, ALL, CUSTOM } from './statPeriod.js';

// 기간의 시작이 있는가. stats/firsts 는 시작(start)이 있을 때만 '그 뒤에 처음 튼 것'으로 거르고,
// 없으면 지금까지 튼 모든 작곡가·곡을 준다. 그래서 시작이 없는 보기(전체 기간, 시작을 비운 직접 지정)는
// 묻지 않는다. 이번 학기는 통계가 시작 날짜를 보낼 때만(buildQuery), 학기는 언제나 시작이 있다.
/** @param {{ period: string, start?: string }} view */
export function hasPeriodStart({ period, start = '' }) {
	if (period === CURRENT || period === CUSTOM) return Boolean(start);
	return period !== ALL;
}

// 카드 부제(표의 설명): '2025-2학기 · 전체 · 클럽에서 처음 튼 곡 18곡'. 불러오는 동안(firsts 가 없으면)
// 개수를 붙이지 않는다.
/**
 * @param {string} viewLabel
 * @param {{ items: unknown[] } | null | undefined} firsts
 * @param {string} noun
 * @param {string} unit
 */
export function firstsSubtitle(viewLabel, firsts, noun, unit) {
	const count = firsts ? ` ${firsts.items.length.toLocaleString()}${unit}` : '';
	const text = `클럽에서 처음 튼 ${noun}${count}`;
	return viewLabel.trim() ? `${viewLabel.trim()} · ${text}` : text;
}
