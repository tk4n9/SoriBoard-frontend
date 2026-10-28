import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTitle, periodTitle } from '../../src/lib/statTitle.js';

test('pageTitle joins the parts, the specific one first', () => {
	assert.equal(pageTitle('2025-2학기', '학기 결산'), '2025-2학기 · 학기 결산');
	assert.equal(pageTitle('Johann Sebastian Bach', '작곡가'), 'Johann Sebastian Bach · 작곡가');
	assert.equal(pageTitle('통계'), '통계');
});

test('pageTitle skips missing, empty and blank parts', () => {
	assert.equal(pageTitle(undefined, '작곡가'), '작곡가');
	assert.equal(pageTitle(null, '작곡가'), '작곡가');
	assert.equal(pageTitle('', '학기 결산'), '학기 결산');
	assert.equal(pageTitle('   ', '작곡가'), '작곡가');
	assert.equal(pageTitle(), '');
});

test('pageTitle trims each part', () => {
	assert.equal(pageTitle('  Bach ', ' 작곡가'), 'Bach · 작곡가');
});

// /api/semester 는 순서 없이 준다.
const SEMESTERS = [
	{ id: 3, year: 2025, semester_num: 1 },
	{ id: 1, year: 2025, semester_num: 2 }
];

test('periodTitle leaves the default 이번 학기 out', () => {
	assert.equal(periodTitle({ period: 'current' }, SEMESTERS), '');
	assert.equal(periodTitle({ period: 'current', start: '2026-09-01' }, SEMESTERS), '');
});

test('periodTitle names a 학기 from the 학기 list', () => {
	assert.equal(periodTitle({ period: '1' }, SEMESTERS), '2025-2학기');
	assert.equal(periodTitle({ period: '3' }, SEMESTERS), '2025-1학기');
});

test('periodTitle leaves a 학기 out until the list has it', () => {
	assert.equal(periodTitle({ period: '9' }, SEMESTERS), '');
	assert.equal(periodTitle({ period: '1' }, []), '');
	assert.equal(periodTitle({ period: '1' }, null), '');
	assert.equal(periodTitle({ period: '1' }, undefined), '');
});

test('periodTitle names 전체 기간 and a 직접 지정 range', () => {
	assert.equal(periodTitle({ period: 'all' }, SEMESTERS), '전체 기간');
	assert.equal(
		periodTitle({ period: 'custom', start: '2025-09-01', end: '2025-10-31' }, null),
		'2025-09-01 ~ 2025-10-31'
	);
	assert.equal(
		periodTitle({ period: 'custom', start: '2025-09-01', end: '' }, null),
		'2025-09-01 ~'
	);
	assert.equal(
		periodTitle({ period: 'custom', start: '', end: '2025-10-31' }, null),
		'~ 2025-10-31'
	);
});

test('the pages put the view before the page name', () => {
	const period = periodTitle({ period: '1' }, SEMESTERS);
	assert.equal(pageTitle('가상이', period, '통계'), '가상이 · 2025-2학기 · 통계');
	assert.equal(pageTitle('', periodTitle({ period: 'current' }, SEMESTERS), '통계'), '통계');
	assert.equal(
		pageTitle('가상 작곡가 D', '', periodTitle({ period: 'all' }, null), '선곡 기록'),
		'가상 작곡가 D · 전체 기간 · 선곡 기록'
	);
});
