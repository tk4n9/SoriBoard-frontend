import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	CURRENT,
	ALL,
	readStatPeriod,
	writeStatPeriod,
	sortSemesters,
	semesterLabel,
	knownPeriod,
	periodRangeText
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
