import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsvTable } from '../../src/lib/csvTable.js';
import { toCsv } from '../../src/lib/csv.js';

test('a header row, then one line per row', () => {
	assert.equal(
		toCsvTable(
			['날짜', '타임', '곡'],
			[
				['2026-10-23', 1, '현악 사중주 3번'],
				['2026-10-22', 3, '교향곡 1번']
			]
		),
		'날짜,타임,곡\n2026-10-23,1,현악 사중주 3번\n2026-10-22,3,교향곡 1번'
	);
});

test('cells with a comma, a quote or a line break are quoted as in toCsv', () => {
	const cells = ['피아노: 가, 첼로: 나', '가상 세부 제목 "황혼"', '두\n줄', '보통'];
	assert.equal(
		toCsvTable(['a', 'b', 'c', 'd'], [cells]),
		'a,b,c,d\n"피아노: 가, 첼로: 나","가상 세부 제목 ""황혼""","두\n줄",보통'
	);
	// 두 열이면 toCsv 와 같은 글이 된다.
	assert.equal(
		toCsvTable(
			['항목', '횟수'],
			[
				['가, 나', 3],
				['다', 1]
			]
		),
		toCsv(['가, 나', '다'], [3, 1])
	);
});

test('missing values are empty cells, and no rows is the header alone', () => {
	assert.equal(toCsvTable(['a', 'b', 'c'], [[null, undefined, 0]]), 'a,b,c\n,,0');
	assert.equal(toCsvTable(['a', 'b'], []), 'a,b');
});
