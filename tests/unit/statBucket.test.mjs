import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	semesterOf,
	spansSemesters,
	chooseTimelineBucket,
	timelineBucketName,
	timelineView,
	readDiversityBucket,
	writeDiversityBucket,
	bucketRange,
	clipRange,
	semesterIdOf,
	semesterRangeOf
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

const readBucket = (search) => readDiversityBucket(new URLSearchParams(search));

test('the 주별/월별 toggle reads week from the URL, anything else as 월별', () => {
	assert.equal(readBucket(''), 'month');
	assert.equal(readBucket('bucket=week'), 'week');
	assert.equal(readBucket('bucket=month'), 'month');
	for (const bad of ['bucket=day', 'bucket=semester', 'bucket=WEEK', 'bucket=']) {
		assert.equal(readBucket(bad), 'month', bad);
	}
});

test('writing the toggle leaves 월별 out of the URL and keeps the other keys', () => {
	const params = new URLSearchParams('period=all&scope=individual&user_id=2');
	writeDiversityBucket(params, 'week');
	assert.equal(params.toString(), 'period=all&scope=individual&user_id=2&bucket=week');
	assert.equal(readDiversityBucket(params), 'week');
	writeDiversityBucket(params, 'month');
	assert.equal(params.toString(), 'period=all&scope=individual&user_id=2');
	assert.equal(readDiversityBucket(params), 'month');
	const stale = new URLSearchParams('bucket=day');
	writeDiversityBucket(stale, 'month');
	assert.equal(stale.toString(), '');
});

test('bucketRange gives the dates a week label covers, across a month and a year end', () => {
	assert.deepEqual(bucketRange('week', '2026-08-31'), { start: '2026-08-31', end: '2026-09-06' });
	assert.deepEqual(bucketRange('week', '2025-12-29'), { start: '2025-12-29', end: '2026-01-04' });
	assert.deepEqual(bucketRange('week', '2024-02-26'), { start: '2024-02-26', end: '2024-03-03' });
});

test('bucketRange gives a whole month, with the right last day', () => {
	assert.deepEqual(bucketRange('month', '2026-09'), { start: '2026-09-01', end: '2026-09-30' });
	assert.deepEqual(bucketRange('month', '2026-12'), { start: '2026-12-01', end: '2026-12-31' });
	assert.deepEqual(bucketRange('month', '2024-02'), { start: '2024-02-01', end: '2024-02-29' });
	assert.deepEqual(bucketRange('month', '2025-02'), { start: '2025-02-01', end: '2025-02-28' });
});

test('bucketRange follows the backend 학기: 3/1–8/31 and 9/1 to the end of next February', () => {
	assert.deepEqual(bucketRange('semester', '2026-1'), { start: '2026-03-01', end: '2026-08-31' });
	assert.deepEqual(bucketRange('semester', '2025-2'), { start: '2025-09-01', end: '2026-02-28' });
	assert.deepEqual(bucketRange('semester', '2027-2'), { start: '2027-09-01', end: '2028-02-29' });
});

test('bucketRange answers null for a label it cannot read as that bucket', () => {
	assert.equal(bucketRange('week', '2026-09'), null);
	assert.equal(bucketRange('week', '2026-02-30'), null);
	assert.equal(bucketRange('month', '2026-13'), null);
	assert.equal(bucketRange('month', '2026-00'), null);
	assert.equal(bucketRange('month', '2026-1학기'), null);
	assert.equal(bucketRange('semester', '2026-3'), null);
	assert.equal(bucketRange('semester', '2026-1학기'), null);
	assert.equal(bucketRange('day', '2026-09-01'), null);
	assert.equal(bucketRange('', '2026-09'), null);
});

test('clipRange keeps a bucket inside the period the answer applied', () => {
	const week = { start: '2026-08-31', end: '2026-09-06' };
	assert.deepEqual(clipRange(week, { start: '2026-09-01', end: '2026-10-28' }), {
		start: '2026-09-01',
		end: '2026-09-06'
	});
	assert.deepEqual(clipRange({ start: '2026-10-26', end: '2026-11-01' }, { end: '2026-10-28' }), {
		start: '2026-10-26',
		end: '2026-10-28'
	});
	// 전체 기간(filters 에 날짜 없음)이면 그대로.
	assert.deepEqual(clipRange(week, { scope: 'all' }), week);
	assert.deepEqual(clipRange(week, null), week);
	assert.equal(clipRange(week, { start: '2026-09-07' }), null);
	assert.equal(clipRange(null, { start: '2026-09-01' }), null);
});

test('semesterIdOf finds a 학기 bucket in the 학기 list by year and number', () => {
	const semesters = [
		{ id: 1, year: 2025, semester_num: 2 },
		{ id: 3, year: 2025, semester_num: 1 },
		{ id: 2, year: 2026, semester_num: 2 }
	];
	assert.equal(semesterIdOf('2025-1', semesters), '3');
	assert.equal(semesterIdOf('2025-2', semesters), '1');
	assert.equal(semesterIdOf('2024-1', semesters), null);
	// 학기 라벨이 아니면(주·월) 찾지 않는다.
	assert.equal(semesterIdOf('2025-09', semesters), null);
	assert.equal(semesterIdOf('2025-1학기', semesters), null);
	assert.equal(semesterIdOf('2025-1', []), null);
	assert.equal(semesterIdOf('2025-1', null), null);
});

test('semesterRangeOf gives the dates of a 학기 in the list, by id', () => {
	const semesters = [
		{ id: 1, year: 2025, semester_num: 2 },
		{ id: 3, year: 2025, semester_num: 1 },
		{ id: 6, year: 2027, semester_num: 2 }
	];
	assert.deepEqual(semesterRangeOf('3', semesters), { start: '2025-03-01', end: '2025-08-31' });
	assert.deepEqual(semesterRangeOf('1', semesters), { start: '2025-09-01', end: '2026-02-28' });
	// 2학기는 다음 해 2월 말일까지(윤년이면 29일).
	assert.deepEqual(semesterRangeOf('6', semesters), { start: '2027-09-01', end: '2028-02-29' });
});

test('semesterRangeOf answers null without the 학기 or for a period that is not one', () => {
	const semesters = [
		{ id: 1, year: 2025, semester_num: 2 },
		{ id: 7, year: 2025, semester_num: 3 }
	];
	assert.equal(semesterRangeOf('2', semesters), null);
	assert.equal(semesterRangeOf('1', []), null);
	assert.equal(semesterRangeOf('1', null), null);
	for (const period of ['current', 'all', 'custom']) {
		assert.equal(semesterRangeOf(period, semesters), null);
	}
	// 1·2학기가 아니면 짐작하지 않는다.
	assert.equal(semesterRangeOf('7', semesters), null);
});
