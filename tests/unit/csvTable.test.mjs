import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsvTable, seriesCsv } from '../../src/lib/csvTable.js';
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

test('seriesCsv puts each series in its own column, in order', () => {
	const csv = seriesCsv(['2026-03', '2026-04'], '기간', [
		{ name: '시대다양성', values: [0.8266, 0.7717] },
		{ name: '장르다양성', values: [0.5, 0.6123] }
	]);
	assert.deepEqual(csv.headers, ['기간', '시대다양성', '장르다양성']);
	assert.equal(
		toCsvTable(csv.headers, csv.rows),
		'기간,시대다양성,장르다양성\n2026-03,0.8266,0.5\n2026-04,0.7717,0.6123'
	);
});

test('seriesCsv keeps a missing value as an empty cell and no labels as the header alone', () => {
	const csv = seriesCsv(['2026-W10', '2026-W11'], '기간', [
		{ name: 'a', values: [null, 0] },
		{ name: 'b', values: [1] }
	]);
	assert.equal(toCsvTable(csv.headers, csv.rows), '기간,a,b\n2026-W10,,1\n2026-W11,0,');
	const empty = seriesCsv([], '기간', [{ name: 'a', values: [] }]);
	assert.equal(toCsvTable(empty.headers, empty.rows), '기간,a');
});

test('seriesCsv with one series writes what toCsv writes', () => {
	const labels = ['2026-03', '2026-04'];
	const values = [3, 1];
	const csv = seriesCsv(labels, '기간', [{ name: '선곡수', values }]);
	assert.equal(toCsvTable(csv.headers, csv.rows), toCsv(labels, values, ['기간', '선곡수']));
});
