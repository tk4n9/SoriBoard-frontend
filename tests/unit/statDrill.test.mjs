import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	DRILL_CARDS,
	WORKS_LIMIT,
	barItemIndex,
	drillTarget,
	drillParams,
	workLabel,
	previousWorkCount,
	drillWorksTable,
	readDrillQuery,
	writeDrillQuery,
	drillItemIndex
} from '../../src/lib/statDrill.js';
import { tableCsv } from '../../src/lib/csvTable.js';

const composers = {
	labels: ['가', '나', '다'],
	values: [9, 5, 2],
	items: [
		{ id: 7, name: '가', count: 9 },
		{ id: 3, name: '나', count: 5 },
		{ id: 11, name: '다', count: 2 }
	]
};

test('the four ranking cards drill down by their own id parameter', () => {
	assert.deepEqual(
		Object.fromEntries(Object.entries(DRILL_CARDS).map(([card, spec]) => [card, spec.param])),
		{
			composers: 'composer_id',
			soloists: 'player_id',
			conductors: 'conductor_id',
			orchestras: 'orchestra_id'
		}
	);
});

test('the top bar (last drawn) maps back to the first item', () => {
	assert.equal(barItemIndex(2, 3), 0);
	assert.equal(barItemIndex(0, 3), 2);
	assert.equal(barItemIndex(1, 3), 1);
	assert.equal(barItemIndex(0, 1), 0);
});

test('an index outside the bars maps to nothing', () => {
	for (const dataIndex of [-1, 3, 1.5, undefined, null, '1', NaN]) {
		assert.equal(barItemIndex(dataIndex, 3), -1, String(dataIndex));
	}
	assert.equal(barItemIndex(0, 0), -1);
});

test('a target carries the item id and name, never just the label', () => {
	assert.deepEqual(drillTarget('composers', composers, barItemIndex(2, 3)), {
		card: 'composers',
		param: 'composer_id',
		noun: '작곡가',
		id: 7,
		name: '가'
	});
});

test('two items with the same name keep their own ids', () => {
	const conductors = {
		items: [
			{ id: 5, name: '같은 이름', count: 4 },
			{ id: 6, name: '같은 이름', count: 4 }
		]
	};
	assert.equal(drillTarget('conductors', conductors, 0)?.id, 5);
	assert.equal(drillTarget('conductors', conductors, 1)?.id, 6);
});

test('no target for other cards, missing items or a missing id', () => {
	assert.equal(drillTarget('eras', composers, 0), null);
	assert.equal(drillTarget('composers', null, 0), null);
	assert.equal(drillTarget('composers', { items: [] }, 0), null);
	assert.equal(drillTarget('composers', composers, -1), null);
	assert.equal(drillTarget('composers', composers, 3), null);
	assert.equal(drillTarget('orchestras', { items: [{ id: null, name: '?', count: 1 }] }, 0), null);
});

test('the works request sends the id filter and the largest page', () => {
	const target = drillTarget('soloists', { items: [{ id: 42, name: '연주자 (피아노)' }] }, 0);
	assert.ok(target);
	assert.deepEqual(drillParams(target), { player_id: '42', limit: String(WORKS_LIMIT) });
	assert.equal(WORKS_LIMIT, 100);
});

test("a composer's panel drops the repeated composer name from its works", () => {
	const target = drillTarget('composers', composers, 0);
	assert.ok(target);
	assert.equal(workLabel({ name: '가 - 교향곡 1번', composer_id: 7 }, target), '교향곡 1번');
	// Another composer with a name that starts the same way keeps its label.
	assert.equal(workLabel({ name: '가 - 교향곡 1번', composer_id: 8 }, target), '가 - 교향곡 1번');
	assert.equal(workLabel({ name: '교향곡 1번', composer_id: 7 }, target), '교향곡 1번');
});

test('other panels keep the composer in each work', () => {
	const target = drillTarget('conductors', { items: [{ id: 7, name: '가' }] }, 0);
	assert.ok(target);
	assert.equal(workLabel({ name: '가 - 교향곡 1번', composer_id: 7 }, target), '가 - 교향곡 1번');
});

test('previousWorkCount: the count by id, 0 when absent, unknown when the list was cut', () => {
	const previous = {
		items: [
			{ id: 7, count: 4 },
			{ id: 8, count: 1 }
		]
	};
	assert.equal(previousWorkCount(previous, 7), 4);
	assert.equal(previousWorkCount(previous, 9), 0);
	assert.equal(previousWorkCount({ total_plays: 0, items: [] }, 7), 0);
	const cut = { items: Array.from({ length: WORKS_LIMIT }, (_, i) => ({ id: 100 + i, count: 1 })) };
	assert.equal(previousWorkCount(cut, 100), 1);
	assert.equal(previousWorkCount(cut, 7), null);
});

test('drillWorksTable: 순위, 곡, 횟수, 처음, 마지막, with the composer dropped from its own panel', () => {
	const target = drillTarget('composers', { items: [{ id: 7, name: '가' }] }, 0);
	assert.ok(target);
	const works = {
		items: [
			{
				id: 1,
				name: '가 - 교향곡 1번',
				count: 1234,
				composer_id: 7,
				first_played: '2019-03-04',
				last_played: '2026-10-30'
			},
			{
				id: 2,
				name: '가 - 소품',
				count: 3,
				composer_id: 7,
				first_played: '2025-09-01',
				last_played: '2026-05-12'
			},
			{
				id: 3,
				name: '나 - 소품',
				count: 3,
				composer_id: 8,
				first_played: '2026-01-02',
				last_played: '2026-01-02'
			}
		]
	};
	assert.deepEqual(drillWorksTable(works, target), {
		columns: [
			{ name: '순위', numeric: true },
			{ name: '곡' },
			{ name: '횟수', numeric: true },
			{ name: '처음', numeric: true },
			{ name: '마지막', numeric: true }
		],
		rowHeader: 1,
		rows: [
			['1', '교향곡 1번', '1,234', '2019-03-04', '2026-10-30'],
			['2', '소품', '3', '2025-09-01', '2026-05-12'],
			['2', '나 - 소품', '3', '2026-01-02', '2026-01-02']
		]
	});
	const conductor = drillTarget('conductors', { items: [{ id: 7, name: '가' }] }, 0);
	assert.ok(conductor);
	assert.deepEqual(
		drillWorksTable(works, conductor).rows.map((row) => row[1]),
		['가 - 교향곡 1번', '가 - 소품', '나 - 소품']
	);
	assert.deepEqual(drillWorksTable({ items: [] }, target).rows, []);
});

test('drillWorksTable: a missing date shows as —, and the CSV keeps the dates as text', () => {
	const target = drillTarget('conductors', { items: [{ id: 5, name: '지휘자' }] }, 0);
	assert.ok(target);
	const works = {
		items: [
			{
				id: 1,
				name: 'A - 교향곡',
				count: 1200,
				composer_id: 1,
				first_played: '2020-03-02',
				last_played: '2026-10-29'
			},
			{ id: 2, name: 'B - 소품', count: 2, composer_id: 2, first_played: null, last_played: null },
			{ id: 3, name: 'C - 서곡', count: 1, composer_id: 3 }
		]
	};
	const table = drillWorksTable(works, target);
	assert.deepEqual(
		table.rows.map((row) => row.slice(3)),
		[
			['2020-03-02', '2026-10-29'],
			['—', '—'],
			['—', '—']
		]
	);
	assert.deepEqual(tableCsv(table), {
		headers: ['순위', '곡', '횟수', '처음', '마지막'],
		rows: [
			['1', 'A - 교향곡', '1200', '2020-03-02', '2026-10-29'],
			['2', 'B - 소품', '2', '—', '—'],
			['3', 'C - 서곡', '1', '—', '—']
		]
	});
	const previous = { items: [{ id: 1, count: 1500 }] };
	assert.deepEqual(tableCsv(drillWorksTable(works, target, previous)), {
		headers: ['순위', '곡', '횟수', '처음', '마지막', '지난 학기'],
		rows: [
			['1', 'A - 교향곡', '1200', '2020-03-02', '2026-10-29', '1500'],
			['2', 'B - 소품', '2', '—', '—', '0'],
			['3', 'C - 서곡', '1', '—', '—', '0']
		]
	});
});

test('drillWorksTable with the previous 학기 adds 지난 학기, matched by id', () => {
	const target = drillTarget('soloists', { items: [{ id: 4, name: '연주자' }] }, 0);
	assert.ok(target);
	// 이름이 같은 두 곡(id 2, 3): 지난 학기 칸은 id 로 맞춘다.
	const works = {
		items: [
			{
				id: 2,
				name: 'C - 가',
				count: 5,
				composer_id: 1,
				first_played: '2024-03-05',
				last_played: '2026-10-01'
			},
			{
				id: 3,
				name: 'C - 가',
				count: 4,
				composer_id: 1,
				first_played: '2025-04-01',
				last_played: '2026-09-30'
			},
			{
				id: 9,
				name: 'D - 나',
				count: 1,
				composer_id: 2,
				first_played: '2026-09-15',
				last_played: '2026-09-15'
			}
		]
	};
	const previous = {
		items: [
			{ id: 3, count: 1234 },
			{ id: 2, count: 1 }
		]
	};
	const table = drillWorksTable(works, target, previous);
	assert.deepEqual(table.columns.at(-1), { name: '지난 학기', numeric: true });
	assert.deepEqual(
		table.columns.map((column) => column.name),
		['순위', '곡', '횟수', '처음', '마지막', '지난 학기']
	);
	assert.deepEqual(table.rows, [
		['1', 'C - 가', '5', '2024-03-05', '2026-10-01', '1'],
		['2', 'C - 가', '4', '2025-04-01', '2026-09-30', '1,234'],
		['3', 'D - 나', '1', '2026-09-15', '2026-09-15', '0']
	]);
	// 앞 학기 목록이 WORKS_LIMIT 에서 잘렸으면 그 안에 없는 곡은 알 수 없다.
	const cut = { items: Array.from({ length: WORKS_LIMIT }, (_, i) => ({ id: 100 + i, count: 1 })) };
	assert.deepEqual(
		drillWorksTable(works, target, cut).rows.map((row) => row[5]),
		['—', '—', '—']
	);
	assert.deepEqual(drillWorksTable(works, target, null), drillWorksTable(works, target));
});

const read = (search) => readDrillQuery(new URLSearchParams(search));
const written = (search, target) => {
	const params = new URLSearchParams(search);
	writeDrillQuery(params, target);
	return params.toString();
};

test('an open panel is kept as its card and id', () => {
	assert.deepEqual(read('drill=composers&drill_id=7'), { card: 'composers', id: 7 });
	assert.deepEqual(read('scope=all&drill=orchestras&drill_id=12&bucket=week'), {
		card: 'orchestras',
		id: 12
	});
	for (const card of Object.keys(DRILL_CARDS)) {
		assert.deepEqual(read(`drill=${card}&drill_id=3`), { card, id: 3 }, card);
	}
});

test('no panel without both keys or with an invalid value', () => {
	for (const search of [
		'',
		'drill=composers',
		'drill_id=7',
		'drill=eras&drill_id=7',
		'drill=toString&drill_id=7',
		'drill=Composers&drill_id=7',
		'drill=composers&drill_id=0',
		'drill=composers&drill_id=-7',
		'drill=composers&drill_id=07',
		'drill=composers&drill_id=7.5',
		'drill=composers&drill_id=abc',
		'drill=composers&drill_id=99999999999999999999'
	]) {
		assert.equal(read(search), null, search);
	}
});

test('writing a panel sets both keys and keeps the other parameters', () => {
	assert.equal(
		written('scope=individual&user_id=2', { card: 'conductors', id: 5 }),
		'scope=individual&user_id=2&drill=conductors&drill_id=5'
	);
	// A target from drillTarget (with param, noun and name) writes only the card and id.
	const target = drillTarget('composers', composers, 0);
	assert.equal(written('bucket=week', target), 'bucket=week&drill=composers&drill_id=7');
	assert.deepEqual(read(written('', target)), { card: 'composers', id: 7 });
});

test('a closed panel removes both keys', () => {
	assert.equal(written('drill=composers&drill_id=7&bucket=week', null), 'bucket=week');
	assert.equal(written('semester_id=3', null), 'semester_id=3');
	assert.equal(
		written('drill=composers&drill_id=7', { card: 'soloists', id: 4 }),
		'drill=soloists&drill_id=4'
	);
});

test('a linked id is found among the card items by id, not by name', () => {
	assert.equal(drillItemIndex(composers, 7), 0);
	assert.equal(drillItemIndex(composers, 11), 2);
	const conductors = {
		items: [
			{ id: 5, name: '같은 이름', count: 4 },
			{ id: 6, name: '같은 이름', count: 4 }
		]
	};
	assert.equal(drillItemIndex(conductors, 6), 1);
	assert.deepEqual(drillTarget('conductors', conductors, drillItemIndex(conductors, 6)), {
		card: 'conductors',
		param: 'conductor_id',
		noun: '지휘자',
		id: 6,
		name: '같은 이름'
	});
});

test('a linked id that is not among the items is not found', () => {
	assert.equal(drillItemIndex(composers, 8), -1);
	assert.equal(drillItemIndex({ items: [] }, 7), -1);
	assert.equal(drillItemIndex({ items: [{ id: null, name: '?' }] }, 7), -1);
	assert.equal(drillItemIndex(null, 7), -1);
	assert.equal(drillItemIndex({}, 7), -1);
	assert.equal(drillTarget('composers', composers, drillItemIndex(composers, 8)), null);
});
