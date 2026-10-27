import { test } from 'node:test';
import assert from 'node:assert/strict';
import { downloadName, memberFileText } from '../../src/lib/statFileName.js';

test('downloadName joins the parts with _ and adds the extension', () => {
	assert.equal(
		downloadName(['통계', '많이 튼 작곡가', '전체 기간', '20261028'], 'csv'),
		'통계_많이 튼 작곡가_전체 기간_20261028.csv'
	);
});

test('without a tag the name is the one 통계 used before', () => {
	const title = '많이 튼 작곡가';
	const stamp = '20261028';
	assert.equal(downloadName(['통계', title, '', stamp], 'png'), `통계_${title}_${stamp}.png`);
	assert.equal(downloadName(['통계', title, [], stamp], 'csv'), `통계_${title}_${stamp}.csv`);
	assert.equal(downloadName(['선곡기록', '', '', stamp], 'csv'), `선곡기록_${stamp}.csv`);
});

test('array parts are spread and their empty parts skipped', () => {
	assert.equal(
		downloadName(['통계', '시대별 분포', ['전체 기간', ''], '20261028'], 'csv'),
		'통계_시대별 분포_전체 기간_20261028.csv'
	);
	assert.equal(
		downloadName(['통계', '시대별 분포', ['전체 기간', '가상이+견습'], '20261028'], 'csv'),
		'통계_시대별 분포_전체 기간_가상이+견습_20261028.csv'
	);
	assert.equal(downloadName(['a', null, undefined, 'b'], 'csv'), 'a_b.csv');
});

test('a date range loses the spaces around ~', () => {
	assert.equal(
		downloadName(['통계', '많이 튼 독주자', '2025-03-01 ~ 2025-08-31', '20261028'], 'csv'),
		'통계_많이 튼 독주자_2025-03-01~2025-08-31_20261028.csv'
	);
	// 한쪽이 열린 직접 지정(periodRangeText 는 '2025-03-01 ~' 를 돌려준다)
	assert.equal(downloadName(['x', '2025-03-01 ~'], 'csv'), 'x_2025-03-01~.csv');
});

test('characters that a file name cannot hold become -, and spaces are tidied', () => {
	assert.equal(
		downloadName(['통계', 'a/b\\c:d*e?f"g<h>i|j'], 'csv'),
		'통계_a-b-c-d-e-f-g-h-i-j.csv'
	);
	assert.equal(
		downloadName(['통계', 'Bach\tJ.S.\n', '  두  칸  '], 'png'),
		'통계_Bach J.S._두 칸.png'
	);
	assert.equal(downloadName(['통계', '\u0000\u001f\u007f'], 'csv'), '통계_---.csv');
	assert.equal(downloadName(['통계', '   '], 'csv'), '통계.csv');
});

test('memberFileText names the chosen 지기, with +견습 when mentees are included', () => {
	assert.equal(memberFileText({ userId: '2', name: '가상이', includeMentees: false }), '가상이');
	assert.equal(
		memberFileText({ userId: '2', name: '가상이', includeMentees: true }),
		'가상이+견습'
	);
});

test('memberFileText falls back to the id when the 지기 list did not load', () => {
	assert.equal(memberFileText({ userId: '2', name: '', includeMentees: false }), '지기 #2');
	assert.equal(memberFileText({ userId: '2', name: null, includeMentees: true }), '지기 #2+견습');
});

test('memberFileText is empty when no 지기 is chosen', () => {
	assert.equal(memberFileText({ userId: null, name: '', includeMentees: true }), '');
	assert.equal(memberFileText({ userId: '', name: '가상이', includeMentees: false }), '');
});
