import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	competitionRanks,
	sharePercents,
	rankTable,
	shareTable,
	formatShare,
	seriesTable,
	formatCount,
	formatEvenness,
	groupEvenness,
	chartLabel,
	placeholderText
} from '../../src/lib/statTable.js';

test('equal counts share a rank and the next rank skips', () => {
	assert.deepEqual(competitionRanks([28, 24, 24, 21, 21, 21, 18]), [1, 2, 2, 4, 4, 4, 7]);
	assert.deepEqual(competitionRanks([5, 5]), [1, 1]);
	assert.deepEqual(competitionRanks([]), []);
});

test('shares add up to 100 and round as the pie does (largest remainder)', () => {
	// 1/3 each: plain rounding gives 33.33 × 3 = 99.99; the pie gives one slice 33.34.
	const thirds = sharePercents([1, 1, 1]);
	assert.deepEqual(thirds, [33.34, 33.33, 33.33]);
	assert.equal(Math.round(thirds.reduce((a, b) => a + b) * 100), 10000);
	assert.deepEqual(sharePercents([21, 20, 18, 23, 34]), [18.1, 17.24, 15.52, 19.83, 29.31]);
	assert.deepEqual(sharePercents([0, 4]), [0, 100]);
	assert.deepEqual(sharePercents([0, 0]), [0, 0]);
});

test('a ranking table has 순위, the name as row header, and 횟수', () => {
	const table = rankTable(
		{ labels: ['가상 A', '가상 B', '가상 C'], values: [1200, 14, 14] },
		'연주자'
	);
	assert.deepEqual(
		table.columns.map((c) => c.name),
		['순위', '연주자', '횟수']
	);
	assert.equal(table.rowHeader, 1);
	assert.deepEqual(table.rows, [
		['1', '가상 A', '1,200'],
		['2', '가상 B', '14'],
		['2', '가상 C', '14']
	]);
	assert.deepEqual(
		table.columns.map((c) => Boolean(c.numeric)),
		[true, false, true]
	);
});

test('a share table gives the count and the pie percentage', () => {
	const table = shareTable({ labels: ['바로크', '미상'], values: [3, 1] }, '시대');
	assert.deepEqual(
		table.columns.map((c) => c.name),
		['시대', '횟수', '비율']
	);
	assert.equal(table.rowHeader, 0);
	assert.deepEqual(table.rows, [
		['바로크', '3', '75.0%'],
		['미상', '1', '25.0%']
	]);
});

test('share tables give one fixed decimal, so equal counts read the same', () => {
	// 이번 학기 장르: two decimals read 39.85% · 30.08% · 30.07%.
	const table = shareTable({ labels: ['교향곡', '협주곡', '기타'], values: [53, 40, 40] }, '장르');
	assert.deepEqual(
		table.rows.map((row) => row[2]),
		['39.8%', '30.1%', '30.1%']
	);
	assert.equal(formatShare(16), '16.0%');
	assert.equal(formatShare(22.6), '22.6%');
});

test('a series table has one column per series, each with its own format', () => {
	const table = seriesTable(['2026-09', '2026-10'], '기간', [
		{ name: '시대 다양성', values: [0.8432, null], format: formatEvenness },
		{ name: '장르 다양성', values: [0.6, 0.61], format: formatEvenness }
	]);
	assert.deepEqual(
		table.columns.map((c) => c.name),
		['기간', '시대 다양성', '장르 다양성']
	);
	assert.deepEqual(table.rows, [
		['2026-09', '0.84', '0.60'],
		['2026-10', '—', '0.61']
	]);
});

test('a diversity group with counted plays keeps its evenness, even 0', () => {
	assert.equal(
		groupEvenness({ labels: ['고전', '근현대'], values: [1, 2], evenness: 0.3955 }),
		0.3955
	);
	// one genre only: fully concentrated, a real 0
	assert.equal(groupEvenness({ labels: ['교향곡'], values: [1], evenness: 0 }), 0);
});

test('a diversity group with nothing counted has no evenness', () => {
	// no plays in the range
	assert.equal(groupEvenness({ labels: [], values: [], evenness: 0 }), null);
	// every play 시대 미상: summary.era is empty, the backend still says 0
	assert.equal(groupEvenness({ labels: [], values: [], unknown_share: 1, evenness: 0 }), null);
	assert.equal(groupEvenness({ labels: ['고전'], values: [0], evenness: 0 }), null);
	assert.equal(groupEvenness(null), null);
	assert.equal(groupEvenness(undefined), null);
});

test('a series without a format counts', () => {
	const table = seriesTable(['2025-1학기'], '기간', [{ name: '횟수', values: [1908] }]);
	assert.deepEqual(table.rows, [['2025-1학기', '1,908']]);
	assert.equal(formatCount(null), '—');
	assert.equal(formatCount(0), '0');
});

test('a chart is named by its title and subtitle and points to the table', () => {
	assert.equal(
		chartLabel('많이 튼 작곡가', '전체 · 총 120곡'),
		"많이 튼 작곡가 차트 — 전체 · 총 120곡. 수치는 '표로 보기'에서 볼 수 있습니다."
	);
	assert.equal(
		chartLabel(' 월별 선곡 수 ', '  '),
		"월별 선곡 수 차트. 수치는 '표로 보기'에서 볼 수 있습니다."
	);
	assert.equal(chartLabel('', ''), "차트. 수치는 '표로 보기'에서 볼 수 있습니다.");
});

test('a card without a chart names itself, except while it loads', () => {
	assert.equal(placeholderText('많이 튼 지휘자', { loading: true }), '불러오는 중...');
	assert.equal(
		placeholderText('많이 튼 지휘자', { loading: true, error: '불러오지 못했습니다' }),
		'불러오는 중...'
	);
	assert.equal(
		placeholderText('많이 튼 지휘자', { error: '불러오지 못했습니다' }),
		'많이 튼 지휘자 — 불러오지 못했습니다'
	);
	assert.equal(placeholderText('많이 튼 지휘자'), '많이 튼 지휘자 — 데이터가 없습니다');
	assert.equal(
		placeholderText(' 월별 선곡 수 ', { error: '' }),
		'월별 선곡 수 — 데이터가 없습니다'
	);
	assert.equal(placeholderText(''), '데이터가 없습니다');
});
