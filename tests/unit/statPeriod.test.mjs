import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	CURRENT,
	ALL,
	CUSTOM,
	readStatPeriod,
	readStatRange,
	writeStatPeriod,
	sortSemesters,
	semesterLabel,
	knownPeriod,
	periodRangeText,
	isIsoDate,
	rangeError,
	currentSemesterRange
} from '../../src/lib/statPeriod.js';

const read = (search) => readStatPeriod(new URLSearchParams(search));
const write = (search, period) => {
	const params = new URLSearchParams(search);
	writeStatPeriod(params, period);
	return params.toString();
};

test('no parameters read as 이번 학기', () => {
	assert.equal(read(''), CURRENT);
	assert.equal(read('scope=individual&user_id=3'), CURRENT);
});

test('a linked 학기 and 전체 기간 are read back', () => {
	assert.equal(read('semester_id=4'), '4');
	assert.equal(read('semester_id=12&scope=individual'), '12');
	assert.equal(read('period=all'), ALL);
});

test('a 학기 wins over period=all', () => {
	assert.equal(read('period=all&semester_id=2'), '2');
	assert.equal(read('semester_id=2&period=all'), '2');
});

test('invalid values are ignored', () => {
	for (const raw of ['abc', '0', '-3', '012', '1.5', '1e3', ' 4', '', '99999999999999999999']) {
		assert.equal(read(`semester_id=${encodeURIComponent(raw)}`), CURRENT, raw);
		assert.equal(read(`semester_id=${encodeURIComponent(raw)}&period=all`), ALL, raw);
	}
	for (const raw of ['ALL', 'current', 'semester', '1', '']) {
		assert.equal(read(`period=${raw}`), CURRENT, raw);
	}
});

test('이번 학기 leaves the period keys out', () => {
	assert.equal(write('', CURRENT), '');
	assert.equal(write('semester_id=4', CURRENT), '');
	assert.equal(write('period=all&semester_id=4', CURRENT), '');
});

test('a 학기 and 전체 기간 write one key each, and other keys are kept', () => {
	assert.equal(write('', '4'), 'semester_id=4');
	assert.equal(write('period=all', '4'), 'semester_id=4');
	assert.equal(write('semester_id=4', ALL), 'period=all');
	assert.equal(
		write('scope=individual&user_id=2&semester_id=4', '7'),
		'scope=individual&user_id=2&semester_id=7'
	);
	assert.equal(write('scope=individual&period=all', CURRENT), 'scope=individual');
});

test('what is written reads back the same', () => {
	for (const period of [CURRENT, ALL, '1', '42']) {
		const params = new URLSearchParams('scope=individual');
		writeStatPeriod(params, period);
		assert.equal(readStatPeriod(params), period);
	}
});

test('semesters are sorted newest first, whatever the API order', () => {
	const list = [
		{ id: 1, year: 2025, semester_num: 2 },
		{ id: 2, year: 2026, semester_num: 2 },
		{ id: 3, year: 2025, semester_num: 1 },
		{ id: 4, year: 2026, semester_num: 1 },
		{ id: 5, year: 2024, semester_num: 2 }
	];
	const before = list.map((s) => s.id);
	assert.deepEqual(
		sortSemesters(list).map((s) => s.id),
		[2, 4, 1, 3, 5]
	);
	assert.deepEqual(
		list.map((s) => s.id),
		before,
		'the input is not reordered'
	);
	assert.deepEqual(sortSemesters([]), []);
});

test('a 학기 is labelled year-number학기', () => {
	assert.equal(semesterLabel({ year: 2025, semester_num: 2 }), '2025-2학기');
	assert.equal(semesterLabel({ year: 2026, semester_num: 1 }), '2026-1학기');
});

test('a 학기 that is not in the list falls back to 이번 학기', () => {
	const list = [{ id: 1 }, { id: 4 }];
	assert.equal(knownPeriod('4', list), '4');
	assert.equal(knownPeriod('9', list), CURRENT);
	assert.equal(knownPeriod('9', []), CURRENT);
	assert.equal(knownPeriod(CURRENT, []), CURRENT);
	assert.equal(knownPeriod(ALL, []), ALL);
	assert.equal(knownPeriod(CUSTOM, []), CUSTOM);
});

test('a linked 학기 is kept when the 학기 list could not be loaded', () => {
	assert.equal(knownPeriod('9', null), '9');
	assert.equal(knownPeriod('9', undefined), '9');
	assert.equal(knownPeriod('9', { message: 'Error' }), '9');
	assert.equal(knownPeriod(CURRENT, null), CURRENT);
	assert.equal(knownPeriod(ALL, null), ALL);
	assert.equal(knownPeriod(CUSTOM, null), CUSTOM);
});

test('the header shows the range the backend applied', () => {
	assert.equal(periodRangeText(null), '');
	assert.equal(periodRangeText(undefined), '');
	assert.equal(
		periodRangeText({ semester_id: '1', start: '2025-09-01', end: '2026-02-28' }),
		'2025-09-01 ~ 2026-02-28'
	);
	assert.equal(periodRangeText({}), '전체 기간');
	assert.equal(periodRangeText({ user_id: '2', include_mentees: true }), '전체 기간');
	assert.equal(periodRangeText({ start: '2025-03-01' }), '2025-03-01 ~');
	assert.equal(periodRangeText({ end: '2025-08-31' }), '~ 2025-08-31');
});

test('the header shows a 직접 지정 range with an open end', () => {
	assert.equal(periodRangeText({ start: '2025-03-01', end: '' }), '2025-03-01 ~');
	assert.equal(periodRangeText({ start: '', end: '2025-08-31' }), '~ 2025-08-31');
});

test('a linked start/end reads as 직접 지정', () => {
	assert.equal(read('start=2025-03-10&end=2025-05-31'), CUSTOM);
	assert.equal(read('start=2025-03-10'), CUSTOM);
	assert.equal(read('end=2025-05-31&scope=individual&user_id=2'), CUSTOM);
	assert.deepEqual(readStatRange(new URLSearchParams('start=2025-03-10&end=2025-05-31')), {
		start: '2025-03-10',
		end: '2025-05-31'
	});
	assert.deepEqual(readStatRange(new URLSearchParams('end=2025-05-31')), {
		start: '',
		end: '2025-05-31'
	});
	assert.deepEqual(readStatRange(new URLSearchParams('')), { start: '', end: '' });
});

test('a 학기 wins over dates, and dates win over period=all', () => {
	assert.equal(read('semester_id=1&start=2025-03-01'), '1');
	assert.equal(read('period=all&end=2025-06-30'), CUSTOM);
	assert.equal(read('period=all&start=nope'), ALL);
});

test('bad or backwards linked dates are ignored', () => {
	for (const raw of [
		'2025-02-30',
		'2025-13-01',
		'20250301',
		'2025-3-1',
		'2025-03-01T00:00',
		'x',
		''
	]) {
		assert.equal(read(`start=${encodeURIComponent(raw)}`), CURRENT, raw);
		assert.equal(readStatRange(new URLSearchParams(`start=${encodeURIComponent(raw)}`)).start, '');
	}
	assert.equal(read('start=2025-06-01&end=2025-03-01'), CURRENT);
	assert.equal(read('start=2025-06-01&end=2025-03-01&period=all'), ALL);
	// One good date is kept even if the other is malformed.
	assert.equal(read('start=2025-06-01&end=garbage'), CUSTOM);
});

test('직접 지정 writes only the dates it has', () => {
	const writeRange = (search, range) => {
		const params = new URLSearchParams(search);
		writeStatPeriod(params, CUSTOM, range);
		return params.toString();
	};
	assert.equal(
		writeRange('semester_id=4', { start: '2025-03-01', end: '2025-06-30' }),
		'start=2025-03-01&end=2025-06-30'
	);
	assert.equal(writeRange('period=all', { start: '2025-03-01', end: '' }), 'start=2025-03-01');
	assert.equal(
		writeRange('scope=individual&user_id=2', { start: '', end: '2025-06-30' }),
		'scope=individual&user_id=2&end=2025-06-30'
	);
	// Other periods drop the dates.
	assert.equal(write('start=2025-03-01&end=2025-06-30', CURRENT), '');
	assert.equal(write('start=2025-03-01', ALL), 'period=all');
	assert.equal(write('end=2025-06-30', '4'), 'semester_id=4');
});

test('a written range reads back the same', () => {
	for (const range of [
		{ start: '2025-03-01', end: '2025-06-30' },
		{ start: '2024-02-29', end: '' },
		{ start: '', end: '2025-12-31' },
		{ start: '2025-05-05', end: '2025-05-05' }
	]) {
		const params = new URLSearchParams('scope=individual');
		writeStatPeriod(params, CUSTOM, range);
		assert.equal(readStatPeriod(params), CUSTOM);
		assert.deepEqual(readStatRange(params), range);
	}
});

test('only real calendar dates count', () => {
	assert.ok(isIsoDate('2024-02-29'));
	assert.ok(isIsoDate('2025-12-31'));
	assert.ok(!isIsoDate('2025-02-29'));
	assert.ok(!isIsoDate('2025-04-31'));
	assert.ok(!isIsoDate('2025-00-10'));
	assert.ok(!isIsoDate('2025-01-00'));
	assert.ok(!isIsoDate(' 2025-01-01'));
	assert.ok(!isIsoDate(''));
});

test('the box refuses an empty or backwards range', () => {
	assert.equal(rangeError({ start: '2025-03-01', end: '2025-06-30' }), '');
	assert.equal(rangeError({ start: '2025-03-01', end: '2025-03-01' }), '');
	assert.equal(rangeError({ start: '2025-03-01', end: '' }), '');
	assert.equal(rangeError({ start: '', end: '2025-06-30' }), '');
	assert.equal(
		rangeError({ start: '2025-07-01', end: '2025-06-30' }),
		'시작일이 종료일보다 늦습니다.'
	);
	assert.equal(rangeError({ start: '', end: '' }), '시작일이나 종료일을 넣어 주세요.');
	assert.equal(
		rangeError({ start: '2025/03/01', end: '' }),
		'날짜를 YYYY-MM-DD 형식으로 넣어 주세요.'
	);
	assert.equal(
		rangeError({ start: '2025-03-01', end: '2025-02-30' }),
		'날짜를 YYYY-MM-DD 형식으로 넣어 주세요.'
	);
});

test('이번 학기 runs from the latest 3/1 or 9/1 to today', () => {
	const range = (y, m, d) => currentSemesterRange(new Date(y, m - 1, d, 13, 5));
	assert.deepEqual(range(2026, 3, 1), { start: '2026-03-01', end: '2026-03-01' });
	assert.deepEqual(range(2026, 8, 31), { start: '2026-03-01', end: '2026-08-31' });
	assert.deepEqual(range(2026, 9, 1), { start: '2026-09-01', end: '2026-09-01' });
	assert.deepEqual(range(2026, 12, 31), { start: '2026-09-01', end: '2026-12-31' });
	// 1~2월은 작년 9/1 부터인 2학기
	assert.deepEqual(range(2027, 1, 5), { start: '2026-09-01', end: '2027-01-05' });
	assert.deepEqual(range(2027, 2, 28), { start: '2026-09-01', end: '2027-02-28' });
});
