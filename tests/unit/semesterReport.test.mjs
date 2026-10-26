import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	reportHref,
	pickSemester,
	previousSemester,
	mergeLabels,
	formatChange,
	mixTable,
	firstsTable
} from '../../src/lib/semesterReport.js';

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
