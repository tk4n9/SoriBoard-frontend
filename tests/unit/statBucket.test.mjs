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
	semesterRangeOf,
	semesterBefore,
	sameSpanBefore
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

test('the bucket that holds today reads (진행 중); ended ones and past ranges stay', () => {
	const today = '2026-11-01';
	const semester = {
		filters: { bucket: 'semester' },
		labels: ['2025-2', '2026-1', '2026-2'],
		values: [6, 52, 21]
	};
	assert.deepEqual(timelineView(semester, today).labels, [
		'2025-2학기',
		'2026-1학기',
		'2026-2학기 (진행 중)'
	]);
	assert.deepEqual(semester.labels, ['2025-2', '2026-1', '2026-2']);
	// 2026-2학기 runs to 2027-02-28: a day in February is still in it.
	assert.equal(timelineView(semester, '2027-02-28').labels.at(-1), '2026-2학기 (진행 중)');
	assert.equal(timelineView(semester, '2027-03-01').labels.at(-1), '2026-2학기');

	const month = {
		filters: { bucket: 'month', start: '2026-09-01', end: today },
		labels: ['2026-09', '2026-10', '2026-11'],
		values: [10, 9, 2]
	};
	assert.deepEqual(timelineView(month, today).labels, ['2026-09', '2026-10', '2026-11 (진행 중)']);
	assert.deepEqual(month.labels, ['2026-09', '2026-10', '2026-11']);
	const week = {
		filters: { bucket: 'week', start: '2026-09-01', end: '2027-02-28' },
		labels: ['2026-10-19', '2026-10-26'],
		values: [2, 5]
	};
	assert.deepEqual(timelineView(week, today).labels, ['2026-10-19', '2026-10-26 (진행 중)']);
	// the Monday of a week is in it too
	assert.deepEqual(timelineView(week, '2026-10-26').labels, ['2026-10-19', '2026-10-26 (진행 중)']);

	// a 직접 지정 range that ended before today cuts its last bucket short, but nothing is running
	const past = {
		filters: { bucket: 'week', start: '2026-09-01', end: '2026-10-29' },
		labels: ['2026-10-19', '2026-10-26'],
		values: [2, 3]
	};
	assert.equal(timelineView(past, today), past);
	const pastSemester = { ...semester, filters: { bucket: 'semester', end: '2026-10-15' } };
	assert.deepEqual(timelineView(pastSemester, today).labels, [
		'2025-2학기',
		'2026-1학기',
		'2026-2학기'
	]);

	// every bucket has ended, or no today given: as before
	assert.equal(timelineView(month, '2026-12-01'), month);
	assert.equal(timelineView(month), month);
	assert.equal(timelineView(week, '2026-10-18'), week);
	assert.deepEqual(timelineView(semester).labels, ['2025-2학기', '2026-1학기', '2026-2학기']);
});

test('선곡 다양성 marks its running week or month from an envelope of filters and labels only', () => {
	const today = '2026-11-01';
	const filters = { bucket: 'week', start: '2026-09-01', end: today };
	const week = { filters, labels: ['2026-10-19', '2026-10-26'] };
	assert.deepEqual(timelineView(week, today).labels, ['2026-10-19', '2026-10-26 (진행 중)']);
	const month = { filters: { ...filters, bucket: 'month' }, labels: ['2026-10', '2026-11'] };
	assert.deepEqual(timelineView(month, today).labels, ['2026-10', '2026-11 (진행 중)']);
	// a range that ended before today: unchanged
	const past = { filters: { ...filters, end: '2026-10-15' }, labels: ['2026-10-19', '2026-10-26'] };
	assert.deepEqual(timelineView(past, today).labels, ['2026-10-19', '2026-10-26']);
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

// /api/semester's list, newest first (as PeriodSelect sorts it).
const LISTED = [
	{ id: 7, year: 2026, semester_num: 2 },
	{ id: 6, year: 2026, semester_num: 1 },
	{ id: 5, year: 2025, semester_num: 2 },
	{ id: 4, year: 2025, semester_num: 1 }
];

test('semesterBefore: the running 학기 listed gives the list’s next 학기', () => {
	assert.equal(semesterBefore('2026-2', LISTED), LISTED[1]);
	assert.equal(semesterBefore('2026-1', LISTED), LISTED[2]);
});

test('semesterBefore: a 학기 not yet listed gives the newest listed one older than it', () => {
	assert.equal(semesterBefore('2027-1', LISTED), LISTED[0]);
	assert.equal(semesterBefore('2026-2', LISTED.slice(1)), LISTED[1]);
});

test('semesterBefore: a gap in the list skips to the newest older 학기', () => {
	const gap = [LISTED[0], LISTED[3]];
	assert.equal(semesterBefore('2026-2', gap), LISTED[3]);
});

test('semesterBefore does not rely on the list order', () => {
	const unsorted = [LISTED[3], LISTED[1], LISTED[0], LISTED[2]];
	assert.equal(semesterBefore('2026-2', unsorted), LISTED[1]);
	assert.equal(semesterBefore('2026-1', unsorted), LISTED[2]);
});

test('semesterBefore with a January date’s label compares with that 2학기’s 1학기', () => {
	assert.equal(semesterOf('2027-01-15'), '2026-2');
	assert.equal(semesterBefore(semesterOf('2027-01-15'), LISTED), LISTED[1]);
});

test('semesterBefore: no older 학기, no list or a bad label gives null', () => {
	assert.equal(semesterBefore('2025-1', LISTED), null);
	assert.equal(semesterBefore('2025-2', [LISTED[0], LISTED[2]]), null);
	assert.equal(semesterBefore('2026-2', []), null);
	assert.equal(semesterBefore('2026-2', null), null);
	assert.equal(semesterBefore('2026-2', undefined), null);
	assert.equal(semesterBefore('2026-3', LISTED), null);
	assert.equal(semesterBefore('2026-09-01', LISTED), null);
	assert.equal(semesterBefore('', LISTED), null);
});

test('sameSpanBefore: a running 2학기 compares with 1학기 up to the same number of days', () => {
	// 2026-09-01 → 2026-11-03 is 63 days; 2026-03-01 + 63 days = 2026-05-03.
	assert.deepEqual(sameSpanBefore(bucketRange('semester', '2026-1'), '2026-09-01', '2026-11-03'), {
		start: '2026-03-01',
		end: '2026-05-03'
	});
	// 2026-03-01 → 2026-04-10 is 40 days; 2025-09-01 + 40 days = 2025-10-11.
	assert.deepEqual(sameSpanBefore(bucketRange('semester', '2025-2'), '2026-03-01', '2026-04-10'), {
		start: '2025-09-01',
		end: '2025-10-11'
	});
});

test('sameSpanBefore: on the first day, only the previous 학기’s first day', () => {
	assert.deepEqual(sameSpanBefore(bucketRange('semester', '2026-1'), '2026-09-01', '2026-09-01'), {
		start: '2026-03-01',
		end: '2026-03-01'
	});
});

test('sameSpanBefore: a running 학기 longer than the previous one stops at its end', () => {
	assert.deepEqual(sameSpanBefore(bucketRange('semester', '2027-2'), '2028-03-01', '2028-08-31'), {
		start: '2027-09-01',
		end: '2028-02-29'
	});
	assert.deepEqual(sameSpanBefore(bucketRange('semester', '2026-2'), '2027-03-01', '2027-08-31'), {
		start: '2026-09-01',
		end: '2027-02-28'
	});
});

test('sameSpanBefore: a span across a year end', () => {
	// 2026-09-01 → 2027-01-15 is 136 days; 2026-03-01 + 136 days = 2026-07-15.
	assert.deepEqual(sameSpanBefore(bucketRange('semester', '2026-1'), '2026-09-01', '2027-01-15'), {
		start: '2026-03-01',
		end: '2026-07-15'
	});
});

test('sameSpanBefore: null without a previous 학기, before the start, or for a malformed date', () => {
	const previous = bucketRange('semester', '2026-1');
	assert.equal(sameSpanBefore(null, '2026-09-01', '2026-11-03'), null);
	assert.equal(sameSpanBefore(previous, '2026-09-01', '2026-08-31'), null);
	assert.equal(sameSpanBefore(previous, '', '2026-11-03'), null);
	assert.equal(sameSpanBefore(previous, '2026-09-01', ''), null);
	assert.equal(sameSpanBefore(previous, '2026-13-01', '2026-11-03'), null);
	assert.equal(sameSpanBefore(previous, '2026-9-1', '2026-11-03'), null);
	assert.equal(sameSpanBefore({ start: '2026-03-01', end: '' }, '2026-09-01', '2026-11-03'), null);
});
