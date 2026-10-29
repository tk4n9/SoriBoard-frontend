import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	tasteComposers,
	tasteTable,
	tasteCsv,
	tasteNote,
	formatRatio,
	TASTE_MIN_PLAYS,
	TASTE_MIN_RATIO,
	TASTE_FETCH_LIMIT
} from '../../src/lib/statTaste.js';

/** @param {number} total @param {[number, string, number][]} rows */
const envelope = (total, rows, filters = {}) => ({
	filters,
	total_plays: total,
	items: rows.map(([id, name, count]) => ({ id, name, count }))
});

// 클럽 1000곡: 가 100(10%), 나 200(20%), 다 50(5%), 라 400(40%).
const club = envelope(1000, [
	[4, '가상 라', 400],
	[2, '가상 나', 200],
	[1, '가상 가', 100],
	[3, '가상 다', 50]
]);

test('the ratio is the 지기 share over the club share', () => {
	// 가: 30/100 = 30% ÷ 10% = 3배. 다: 10/100 = 10% ÷ 5% = 2배.
	const mine = envelope(100, [
		[1, '가상 가', 30],
		[3, '가상 다', 10],
		[4, '가상 라', 40]
	]);
	const view = tasteComposers(mine, club);
	assert.deepEqual(view.labels, ['가상 가', '가상 다']);
	assert.deepEqual(view.values, [3, 2]);
	assert.equal(view.items[0].share, 0.3);
	assert.equal(view.items[0].clubShare, 0.1);
	assert.equal(view.items[0].clubCount, 100);
	assert.equal(view.total_plays, 100);
});

test('the ratio uses each side total, not the sum of its listed composers', () => {
	// 지기의 전체 선곡 200(작곡가 없는 곡 포함): 가 30/200 = 15% ÷ 10% = 1.5배.
	const view = tasteComposers(envelope(200, [[1, '가상 가', 30]]), club);
	assert.deepEqual(view.values, [1.5]);
});

test('the filters and total come from the 지기 answer', () => {
	const filters = { scope: 'individual', user_id: 7 };
	const view = tasteComposers(envelope(100, [[1, '가상 가', 30]], filters), club);
	assert.equal(view.filters, filters);
});

test('a composer needs at least 3 plays by the 지기', () => {
	assert.equal(TASTE_MIN_PLAYS, 3);
	// 다: 2/10 = 20% ÷ 5% = 4배이지만 두 번뿐. 가: 3/10 = 30% ÷ 10% = 3배.
	const mine = envelope(10, [
		[1, '가상 가', 3],
		[3, '가상 다', 2]
	]);
	assert.deepEqual(tasteComposers(mine, club).labels, ['가상 가']);
});

test('a composer needs a ratio of at least 1.5', () => {
	assert.equal(TASTE_MIN_RATIO, 1.5);
	// 나: 29/100 ÷ 20% = 1.45배(빠짐), 가: 15/100 ÷ 10% = 1.5배(듦), 라: 40% ÷ 40% = 1배.
	const mine = envelope(100, [
		[4, '가상 라', 40],
		[2, '가상 나', 29],
		[1, '가상 가', 15]
	]);
	assert.deepEqual(tasteComposers(mine, club).labels, ['가상 가']);
});

test('highest ratio first, then more plays, then name', () => {
	const clubAll = envelope(1000, [
		[1, '가상 가', 100],
		[2, '가상 나', 50],
		[3, '가상 다', 100],
		[4, '가상 라', 100],
		[5, '가상 마', 200]
	]);
	const mine = envelope(100, [
		[5, '가상 마', 40], // 2배, 40곡
		[1, '가상 가', 20], // 2배, 20곡
		[4, '가상 라', 20], // 2배, 20곡(이름이 가 뒤)
		[3, '가상 다', 30], // 3배
		[2, '가상 나', 10] // 2배, 10곡
	]);
	assert.deepEqual(tasteComposers(mine, clubAll).labels, [
		'가상 다',
		'가상 마',
		'가상 가',
		'가상 라',
		'가상 나'
	]);
});

test('the list is cut to the limit after sorting', () => {
	const mine = envelope(100, [
		[3, '가상 다', 10], // 2배
		[1, '가상 가', 30] // 3배
	]);
	assert.deepEqual(tasteComposers(mine, club, { limit: 1 }).labels, ['가상 가']);
});

test('composers missing from the club list are skipped and counted', () => {
	const mine = envelope(100, [
		[1, '가상 가', 30],
		[9, '가상 없음', 20],
		[8, '가상 적음', 2] // 3번 미만이라 셀 것도 없다
	]);
	const view = tasteComposers(mine, club);
	assert.deepEqual(view.labels, ['가상 가']);
	assert.equal(view.skipped, 1);
	assert.equal(
		tasteNote(view),
		`클럽 상위 ${TASTE_FETCH_LIMIT}명에 없는 작곡가 1명은 견주지 않았습니다`
	);
});

test('no plays by the 지기 gives an empty card with no note', () => {
	const view = tasteComposers(envelope(0, []), club);
	assert.deepEqual(view.labels, []);
	assert.deepEqual(view.values, []);
	assert.equal(view.skipped, 0);
	assert.equal(tasteNote(view), '');
});

test('a club total of zero gives an empty card', () => {
	const view = tasteComposers(envelope(10, [[1, '가상 가', 5]]), envelope(0, []));
	assert.deepEqual(view.items, []);
});

test('plays that match no one explain the empty card', () => {
	// 모두 클럽과 같은 비중(1배).
	const mine = envelope(10, [[4, '가상 라', 4]]);
	const view = tasteComposers(mine, club);
	assert.deepEqual(view.labels, []);
	assert.equal(
		tasteNote(view),
		'3번 이상 튼 작곡가 가운데 클럽보다 1.5배 이상 자주 튼 작곡가가 없습니다'
	);
});

test('an empty card with skipped composers says both', () => {
	const view = tasteComposers(envelope(10, [[9, '가상 없음', 5]]), club);
	assert.equal(
		tasteNote(view),
		`3번 이상 튼 작곡가 가운데 클럽보다 1.5배 이상 자주 튼 작곡가가 없습니다 · 클럽 상위 ${TASTE_FETCH_LIMIT}명에 없는 작곡가 1명은 견주지 않았습니다`
	);
});

test('no note before the card has loaded', () => {
	assert.equal(tasteNote(null), '');
	assert.equal(tasteNote(undefined), '');
});

test('the table shows the shares and the ratio', () => {
	const mine = envelope(1500, [
		[1, '가상 가', 450], // 30% ÷ 10% = 3배
		[3, '가상 다', 150], // 10% ÷ 5% = 2배
		[2, '가상 나', 600] // 40% ÷ 20% = 2배
	]);
	const table = tasteTable(tasteComposers(mine, club));
	assert.deepEqual(
		table.columns.map((c) => c.name),
		['순위', '작곡가', '횟수', '지기 비중', '클럽 비중', '배율']
	);
	assert.equal(table.rowHeader, 1);
	assert.deepEqual(table.rows, [
		['1', '가상 가', '450', '30.0%', '10.0%', '3.0배'],
		['2', '가상 나', '600', '40.0%', '20.0%', '2.0배'],
		['2', '가상 다', '150', '10.0%', '5.0%', '2.0배']
	]);
});

test('the CSV has the same columns as numbers', () => {
	const mine = envelope(300, [[1, '가상 가', 100]]); // 33.3% ÷ 10% = 3.3배
	assert.deepEqual(tasteCsv(tasteComposers(mine, club)), {
		headers: ['작곡가', '횟수', '지기비중(%)', '클럽비중(%)', '배율'],
		rows: [['가상 가', 100, 33.3, 10, 3.3]]
	});
});

test('the ratio is shown with one decimal', () => {
	assert.equal(formatRatio(2), '2.0배');
	assert.equal(formatRatio(2.345), '2.3배');
	assert.equal(formatRatio(2.35), '2.4배');
});
