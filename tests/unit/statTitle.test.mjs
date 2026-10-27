import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageTitle } from '../../src/lib/statTitle.js';

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
