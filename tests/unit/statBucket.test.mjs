import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	semesterOf,
	spansSemesters,
	chooseTimelineBucket,
	timelineBucketName,
	timelineView
} from '../../src/lib/statBucket.js';

const TODAY = '2026-10-26';

test('semesterOf follows the backend: 3–8월 = 1학기, 9–2월 = 2학기', () => {
	assert.equal(semesterOf('2026-03-01'), '2026-1');
	assert.equal(semesterOf('2026-08-31'), '2026-1');
	assert.equal(semesterOf('2026-09-01'), '2026-2');
	assert.equal(semesterOf('2026-12-31'), '2026-2');
});

test('January and February belong to the previous year’s 2학기', () => {
	assert.equal(semesterOf('2027-01-15'), '2026-2');
	assert.equal(semesterOf('2028-02-29'), '2027-2');
	assert.equal(semesterOf('2026-02-28'), '2025-2');
});

test('a range inside one 학기 does not span', () => {
	assert.equal(spansSemesters({ start: '2026-09-01', end: '2027-02-28' }, TODAY), false);
	assert.equal(spansSemesters({ start: '2026-03-01', end: '2026-03-01' }, TODAY), false);
});

test('a range across a 학기 boundary spans, however short', () => {
	assert.equal(spansSemesters({ start: '2026-08-31', end: '2026-09-01' }, TODAY), true);
	assert.equal(spansSemesters({ start: '2026-02-28', end: '2026-03-01' }, TODAY), true);
	assert.equal(spansSemesters({ start: '2025-03-01', end: '2026-10-01' }, TODAY), true);
});

test('an open start spans; an open end runs to today', () => {
	assert.equal(spansSemesters({ start: '', end: '2026-10-01' }, TODAY), true);
	assert.equal(spansSemesters({ end: '2026-10-01' }, TODAY), true);
	assert.equal(spansSemesters({ start: '2026-09-10', end: '' }, TODAY), false);
	assert.equal(spansSemesters({ start: '2026-08-10' }, TODAY), true);
});

test('전체 기간 takes 학기 buckets, whatever the toggle shows', () => {
	assert.equal(chooseTimelineBucket({ period: 'all' }, 'month', TODAY), 'semester');
	assert.equal(chooseTimelineBucket({ period: 'all' }, 'week', TODAY), 'semester');
});

test('one 학기 takes the bucket the toggle does not show', () => {
	assert.equal(chooseTimelineBucket({ period: '3' }, 'month', TODAY), 'week');
	assert.equal(chooseTimelineBucket({ period: '3' }, 'week', TODAY), 'month');
	const current = { period: 'current', start: '2026-09-01', end: TODAY };
	assert.equal(chooseTimelineBucket(current, 'month', TODAY), 'week');
	assert.equal(chooseTimelineBucket(current, 'week', TODAY), 'month');
});

test('직접 지정 depends on its range', () => {
	const short = { period: 'custom', start: '2026-09-01', end: '2026-10-20' };
	assert.equal(chooseTimelineBucket(short, 'month', TODAY), 'week');
	assert.equal(chooseTimelineBucket(short, 'week', TODAY), 'month');
	const long = { period: 'custom', start: '2025-03-01', end: '2026-10-01' };
	assert.equal(chooseTimelineBucket(long, 'month', TODAY), 'semester');
	assert.equal(chooseTimelineBucket(long, 'week', TODAY), 'semester');
	const openStart = { period: 'custom', start: '', end: '2026-01-01' };
	assert.equal(chooseTimelineBucket(openStart, 'month', TODAY), 'semester');
});

test('each bucket has a Korean name for the card title', () => {
	assert.equal(timelineBucketName('week'), '주별');
	assert.equal(timelineBucketName('month'), '월별');
	assert.equal(timelineBucketName('semester'), '학기별');
	assert.equal(timelineBucketName('year'), '기간별');
});

test('학기 labels read as 학기; week and month labels stay', () => {
	const semester = {
		filters: { bucket: 'semester' },
		labels: ['2025-1', '2025-2'],
		values: [3, 4]
	};
	assert.deepEqual(timelineView(semester), {
		filters: { bucket: 'semester' },
		labels: ['2025-1학기', '2025-2학기'],
		values: [3, 4]
	});
	assert.deepEqual(semester.labels, ['2025-1', '2025-2']);
	const month = { filters: { bucket: 'month' }, labels: ['2026-09'], values: [5] };
	assert.equal(timelineView(month), month);
});
