import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	reportHref,
	pickSemester,
	previousSemester,
	mergeLabels,
	formatChange,
	kpiChangeText,
	evennessChangeText,
	mixTable,
	mixSubtitle,
	rankChangeTable,
	loadWithPrevious,
	firstsTable,
	reportRangeText
} from '../../src/lib/semesterReport.js';
import { rankTable } from '../../src/lib/statTable.js';

// sortSemesters 순서(최신 학기 먼저)
const sorted = [
	{ id: 2, year: 2026, semester_num: 2 },
	{ id: 4, year: 2026, semester_num: 1 },
	{ id: 1, year: 2025, semester_num: 2 }
];

test('reportHref links a 학기 id, anything else to the newest 학기', () => {
	assert.equal(reportHref('4'), '/stat/report?semester_id=4');
	assert.equal(reportHref(12), '/stat/report?semester_id=12');
	for (const other of ['current', 'all', 'custom', '', null, undefined, '0', '-1', '1e3']) {
		assert.equal(reportHref(other), '/stat/report', String(other));
	}
});

test('pickSemester finds the URL 학기 or falls back to the newest', () => {
	assert.equal(pickSemester('4', sorted), sorted[1]);
	assert.equal(pickSemester(null, sorted), sorted[0]);
	assert.equal(pickSemester('99', sorted), sorted[0]);
	assert.equal(pickSemester('abc', sorted), sorted[0]);
	assert.equal(pickSemester('4', []), null);
});

test('previousSemester is the next one in year/semester order', () => {
	assert.equal(previousSemester(sorted[0], sorted), sorted[1]);
	assert.equal(previousSemester(sorted[1], sorted), sorted[2]);
	assert.equal(previousSemester(sorted[2], sorted), null);
	assert.equal(previousSemester({ id: 99 }, sorted), null);
});

test('mergeLabels keeps the shared backend order', () => {
	assert.deepEqual(mergeLabels(['바로크', '낭만'], ['고전', '낭만', '미상']), [
		'바로크',
		'고전',
		'낭만',
		'미상'
	]);
	assert.deepEqual(mergeLabels(['고전', '낭만'], ['중세', '고전']), ['중세', '고전', '낭만']);
	assert.deepEqual(mergeLabels([], ['a', 'b']), ['a', 'b']);
	assert.deepEqual(mergeLabels(['a', 'b'], []), ['a', 'b']);
	// 순서가 엇갈려도 끝나고, 이름은 한 번씩만
	assert.deepEqual(mergeLabels(['a', 'b'], ['b', 'a']), ['a', 'b']);
});

test('formatChange shows a signed %p with one decimal', () => {
	assert.equal(formatChange(8), '+8.0%p');
	assert.equal(formatChange(-8.3), '-8.3%p');
	assert.equal(formatChange(24.6 - 16.6), '+8.0%p');
	assert.equal(formatChange(0), '0.0%p');
	assert.equal(formatChange(-0.04), '0.0%p');
	assert.equal(formatChange(0.05), '+0.1%p');
});

test('kpiChangeText compares a KPI with the previous 학기', () => {
	assert.equal(kpiChangeText(312, 280), '+32 · 지난 학기 280');
	assert.equal(kpiChangeText(41, 46), '-5 · 지난 학기 46');
	assert.equal(kpiChangeText(12, 12), '0 · 지난 학기 12');
	assert.equal(kpiChangeText(1234, 0), '+1,234 · 지난 학기 0');
	assert.equal(kpiChangeText(0, 1234), '-1,234 · 지난 학기 1,234');
	for (const [now, before] of [
		[312, null],
		[312, undefined],
		[null, 280],
		[undefined, 280],
		[null, null],
		[undefined, undefined]
	]) {
		assert.equal(kpiChangeText(now, before), '', `${now}, ${before}`);
	}
});

test('evennessChangeText compares the shown percentages with the previous 학기', () => {
	assert.equal(evennessChangeText(0.62, 0.58), '+4%p · 지난 학기 58%');
	// 각각 먼저 반올림한다: 48% − 52%
	assert.equal(evennessChangeText(0.484, 0.516), '-4%p · 지난 학기 52%');
	assert.equal(evennessChangeText(0.621, 0.618), '0%p · 지난 학기 62%');
	// 0 은 값이다(없음이 아니다)
	assert.equal(evennessChangeText(0, 0.5), '-50%p · 지난 학기 50%');
	assert.equal(evennessChangeText(1, 0), '+100%p · 지난 학기 0%');
	for (const [now, before] of [
		[0.62, null],
		[0.62, undefined],
		[null, 0.58],
		[undefined, 0.58],
		[null, null]
	]) {
		assert.equal(evennessChangeText(now, before), '', `${now}, ${before}`);
	}
});

test('mixTable compares each share with the previous 학기', () => {
	const table = mixTable(
		{ labels: ['바로크', '낭만'], values: [1, 3] },
		{ labels: ['고전', '낭만'], values: [1, 1] },
		'시대'
	);
	assert.deepEqual(
		table.columns.map((c) => c.name),
		['시대', '횟수', '비율', '지난 학기', '변화']
	);
	assert.equal(table.rowHeader, 0);
	assert.deepEqual(table.rows, [
		['바로크', '1', '25.0%', '0.0%', '+25.0%p'],
		['고전', '0', '0.0%', '50.0%', '-50.0%p'],
		['낭만', '3', '75.0%', '50.0%', '+25.0%p']
	]);
});

test('mixTable shares add up to 100 and the change uses the shown shares', () => {
	const table = mixTable(
		{ labels: ['a', 'b', 'c'], values: [1, 1, 1] },
		{ labels: ['a', 'b', 'c'], values: [2, 1, 0] },
		'장르'
	);
	const shares = table.rows.map((row) => Number.parseFloat(row[2]));
	assert.equal(Math.round(shares.reduce((x, y) => x + y, 0) * 10) / 10, 100);
	for (const row of table.rows) {
		const diff = Number.parseFloat(row[2]) - Number.parseFloat(row[3]);
		assert.equal(row[4], formatChange(diff));
	}
});

test('mixTable without a previous 학기 drops the comparison', () => {
	const table = mixTable({ labels: ['교향곡'], values: [1234] }, null, '장르');
	assert.deepEqual(
		table.columns.map((c) => c.name),
		['장르', '횟수', '비율']
	);
	assert.deepEqual(table.rows, [['교향곡', '1,234', '100.0%']]);
});

test('mixTable with an empty previous 학기 shows dashes', () => {
	const table = mixTable({ labels: ['고전'], values: [2] }, { labels: [], values: [] }, '시대');
	assert.deepEqual(table.rows, [['고전', '2', '100.0%', '—', '—']]);
});

// 백엔드의 순위 봉투(_top_by): labels·values 와 같은 순서의 items { id, name, count }.
const ranking = (rows, total = rows.reduce((acc, [, , count]) => acc + count, 0)) => ({
	total_plays: total,
	labels: rows.map(([, name]) => name),
	values: rows.map(([, , count]) => count),
	items: rows.map(([id, name, count]) => ({ id, name, count }))
});

test('rankChangeTable without a previous 학기 is the plain rank table', () => {
	const now = ranking([
		[7, '브람스', 42],
		[3, '바흐', 1234]
	]);
	assert.deepEqual(rankChangeTable(now, null, '작곡가'), rankTable(now, '작곡가'));
	assert.deepEqual(
		rankChangeTable(now, null, '작곡가').columns.map((c) => c.name),
		['순위', '작곡가', '횟수']
	);
});

test('rankChangeTable shows each row’s rank in the previous 학기, ties as 순위 counts them', () => {
	const now = ranking([
		[1, '브람스', 42],
		[2, '바흐', 30],
		[3, '모차르트', 30],
		[4, '하이든', 12],
		[5, '슈만', 9]
	]);
	const before = ranking([
		[4, '하이든', 9],
		[2, '바흐', 7],
		[3, '모차르트', 7],
		[1, '브람스', 5],
		[9, '말러', 4]
	]);
	const table = rankChangeTable(now, before, '작곡가');
	assert.deepEqual(
		table.columns.map((c) => [c.name, Boolean(c.numeric)]),
		[
			['순위', true],
			['작곡가', false],
			['횟수', true],
			['지난 학기', true]
		]
	);
	assert.equal(table.rowHeader, 1);
	assert.deepEqual(table.rows, [
		['1', '브람스', '42', '4위'],
		['2', '바흐', '30', '2위'],
		['2', '모차르트', '30', '2위'],
		['4', '하이든', '12', '1위'],
		['5', '슈만', '9', '10위 밖']
	]);
});

test('rankChangeTable matches rows by id, not by name', () => {
	const now = ranking([
		[11, '김지휘', 8],
		[12, '김지휘', 6]
	]);
	const before = ranking([
		[30, '이지휘', 9],
		[12, '김지휘', 5],
		[13, '박지휘', 3],
		[11, '김지휘', 2]
	]);
	assert.deepEqual(
		rankChangeTable(now, before, '지휘자').rows.map((row) => row[3]),
		['4위', '2위']
	);
	// 이름만 같은(id 가 다른) 대상은 지난 학기 상위 10 에 없는 것이다.
	const renamed = ranking([[99, '김지휘', 4]]);
	assert.deepEqual(
		rankChangeTable(renamed, before, '지휘자').rows.map((row) => row[3]),
		['10위 밖']
	);
});

test('rankChangeTable with an empty previous 학기 shows dashes', () => {
	const now = ranking([
		[1, '브람스', 2],
		[2, '바흐', 1]
	]);
	const table = rankChangeTable(now, ranking([], 0), '작곡가');
	assert.equal(table.columns.length, 4);
	assert.deepEqual(table.rows, [
		['1', '브람스', '2', '—'],
		['2', '바흐', '1', '—']
	]);
});

test('rankChangeTable names the list’s length for a row missing from the previous 학기', () => {
	const now = ranking([
		[1, '브람스', 42],
		[2, '바흐', 30]
	]);
	const before = ranking([[2, '바흐', 7]]);
	assert.deepEqual(
		rankChangeTable(now, before, '작곡가', 12).rows.map((row) => row[3]),
		['12위 밖', '1위']
	);
	assert.deepEqual(
		rankChangeTable(now, before, '작곡가').rows.map((row) => row[3]),
		['10위 밖', '1위']
	);
	// 지난 학기에 선곡이 없으면 길이와 상관없이 '—'.
	assert.deepEqual(
		rankChangeTable(now, ranking([], 0), '작곡가', 12).rows.map((row) => row[3]),
		['—', '—']
	);
});

test('firstsTable lists name, first play and count in backend order', () => {
	const table = firstsTable(
		{
			items: [
				{ id: 21, name: 'H - 협주곡', count: 3, first_played: '2026-09-07' },
				{ id: 22, name: 'A - 모음곡', count: 1200, first_played: '2026-09-14' }
			]
		},
		'곡'
	);
	assert.deepEqual(
		table.columns.map((c) => [c.name, Boolean(c.numeric)]),
		[
			['곡', false],
			['처음 튼 날', true],
			['횟수', true]
		]
	);
	assert.equal(table.rowHeader, 0);
	assert.deepEqual(table.rows, [
		['H - 협주곡', '2026-09-07', '3'],
		['A - 모음곡', '2026-09-14', '1,200']
	]);
});

test('loadWithPrevious keeps this 학기 when only the previous one fails', async () => {
	const now = { total_plays: 551 };
	const before = { total_plays: 610 };
	const boom = new Error('eras 500');
	assert.deepEqual(
		await loadWithPrevious(
			async () => now,
			async () => before
		),
		{ current: now, previous: before, previousError: null }
	);
	assert.deepEqual(await loadWithPrevious(async () => now, null), {
		current: now,
		previous: null,
		previousError: null
	});
	assert.deepEqual(
		await loadWithPrevious(
			async () => now,
			async () => {
				throw boom;
			}
		),
		{ current: now, previous: null, previousError: boom }
	);
	await assert.rejects(
		loadWithPrevious(
			async () => {
				throw boom;
			},
			async () => before
		),
		boom
	);
});

test('loadWithPrevious sends both requests at once', async () => {
	const started = [];
	let release;
	const gate = new Promise((resolve) => (release = resolve));
	const pending = loadWithPrevious(
		async () => {
			started.push('now');
			await gate;
			return 1;
		},
		async () => {
			started.push('before');
			return 2;
		}
	);
	assert.deepEqual(started, ['now', 'before']);
	release();
	assert.deepEqual(await pending, { current: 1, previous: 2, previousError: null });
});

test('mixSubtitle names both 학기, a missing one, or a failed one', () => {
	const current = { total_plays: 1903 };
	assert.equal(mixSubtitle(null, '2025-2학기', '2025-1학기'), '2025-2학기');
	assert.equal(mixSubtitle(null, '', ''), '');
	assert.equal(
		mixSubtitle({ current, previous: { total_plays: 610 } }, '2025-2학기', '2025-1학기'),
		'2025-2학기 총 1,903곡 · 지난 학기(2025-1학기) 총 610곡'
	);
	assert.equal(
		mixSubtitle({ current, previous: null, previousError: null }, '2024-1학기', ''),
		'2024-1학기 총 1,903곡 · 지난 학기 없음'
	);
	assert.equal(
		mixSubtitle(
			{ current, previous: null, previousError: new Error('x') },
			'2025-2학기',
			'2025-1학기'
		),
		'2025-2학기 총 1,903곡 · 지난 학기(2025-1학기)를 불러오지 못했습니다'
	);
});

test('reportRangeText shows the echoed range, else the 학기 dates from the list', () => {
	const spring = { id: 4, year: 2026, semester_num: 1 };
	const autumn = { id: 1, year: 2025, semester_num: 2 };
	const echoed = { filters: { semester_id: '4', start: '2026-03-01', end: '2026-08-31' } };
	assert.equal(reportRangeText(echoed, spring), '2026-03-01 ~ 2026-08-31');
	// The echo wins over the guess.
	const odd = { filters: { start: '2026-03-02', end: '2026-08-30' } };
	assert.equal(reportRangeText(odd, spring), '2026-03-02 ~ 2026-08-30');
	// Before the summary answers, or when it failed: the 학기's own dates.
	assert.equal(reportRangeText(null, spring), '2026-03-01 ~ 2026-08-31');
	assert.equal(reportRangeText(undefined, autumn), '2025-09-01 ~ 2026-02-28');
	assert.equal(
		reportRangeText(null, { id: 9, year: 2027, semester_num: 2 }),
		'2027-09-01 ~ 2028-02-29'
	);
	// No 학기 yet, or one the rule does not know: no dates.
	assert.equal(reportRangeText(null, null), '');
	assert.equal(reportRangeText(null, { id: 7, year: 2026, semester_num: 3 }), '');
});
