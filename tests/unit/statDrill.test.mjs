import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	DRILL_CARDS,
	WORKS_LIMIT,
	barItemIndex,
	drillTarget,
	drillParams,
	workLabel,
	readDrillQuery,
	writeDrillQuery,
	drillItemIndex
} from '../../src/lib/statDrill.js';

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
