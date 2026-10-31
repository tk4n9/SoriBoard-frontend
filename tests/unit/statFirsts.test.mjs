import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasPeriodStart, firstsSubtitle } from '../../src/lib/statFirsts.js';

test('a view has a period start for a 학기, and for 이번 학기 or 직접 지정 with a start', () => {
	assert.equal(hasPeriodStart({ period: 'current', start: '2026-09-01' }), true);
	assert.equal(hasPeriodStart({ period: 'current', start: '' }), false);
	assert.equal(hasPeriodStart({ period: '7' }), true);
	assert.equal(hasPeriodStart({ period: '7', start: '' }), true);
	assert.equal(hasPeriodStart({ period: 'custom', start: '2026-10-01' }), true);
	assert.equal(hasPeriodStart({ period: 'custom', start: '' }), false);
	assert.equal(hasPeriodStart({ period: 'custom' }), false);
	assert.equal(hasPeriodStart({ period: 'all' }), false);
	assert.equal(hasPeriodStart({ period: 'all', start: '2026-09-01' }), false);
});

test('the subtitle names the view and how many were played for the first time', () => {
	const items = (n) => ({ items: Array.from({ length: n }, (_, i) => ({ id: i })) });
	assert.equal(
		firstsSubtitle('2025-2학기 · 전체', items(18), '곡', '곡'),
		'2025-2학기 · 전체 · 클럽에서 처음 튼 곡 18곡'
	);
	assert.equal(
		firstsSubtitle('2025-2학기 · 가상이', items(3), '곡', '곡'),
		'2025-2학기 · 가상이 · 클럽에서 처음 튼 곡 3곡'
	);
	assert.equal(
		firstsSubtitle('이번 학기 · 전체', items(0), '작곡가', '명'),
		'이번 학기 · 전체 · 클럽에서 처음 튼 작곡가 0명'
	);
	assert.equal(
		firstsSubtitle('이번 학기 · 전체', items(1), '작곡가', '명'),
		'이번 학기 · 전체 · 클럽에서 처음 튼 작곡가 1명'
	);
	assert.equal(
		firstsSubtitle('전체', items(1234), '곡', '곡'),
		'전체 · 클럽에서 처음 튼 곡 1,234곡'
	);
});

test('while loading the subtitle has no count and no stray separator', () => {
	assert.equal(
		firstsSubtitle('이번 학기 · 전체', null, '곡', '곡'),
		'이번 학기 · 전체 · 클럽에서 처음 튼 곡'
	);
	assert.equal(firstsSubtitle('', undefined, '작곡가', '명'), '클럽에서 처음 튼 작곡가');
});
