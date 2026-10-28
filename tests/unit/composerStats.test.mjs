import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	readComposerId,
	composerHref,
	composerHistoryHref,
	composerRankLinks,
	composerSemesterLinks,
	composerFacts,
	semesterSeries,
	composerWorkName,
	composerWorksTable
} from '../../src/lib/composerStats.js';
import { readHistoryQuery } from '../../src/lib/playHistory.js';

test('the route id must be a positive integer', () => {
	assert.equal(readComposerId('12'), '12');
	for (const raw of ['', '0', '-3', '1.5', '012', 'abc', '9007199254740993', null, undefined]) {
		assert.equal(readComposerId(raw), null, String(raw));
	}
});

test('links: the composer page and its plays over all time', () => {
	assert.equal(composerHref(7), '/stat/composer/7');
	const href = composerHistoryHref(7);
	assert.equal(href, '/stat/history?period=all&composer_id=7');
	const query = readHistoryQuery(new URL(href, 'http://x').searchParams);
	assert.equal(query.period, 'all');
	assert.deepEqual(query.targets, [{ param: 'composer_id', id: '7' }]);
});

test('links: a 독주자 or 지휘자 with this composer, by id', () => {
	const href = composerHistoryHref(7, [{ param: 'player_id', id: '3' }]);
	assert.equal(href, '/stat/history?period=all&composer_id=7&player_id=3');
	const query = readHistoryQuery(new URL(href, 'http://x').searchParams);
	assert.deepEqual(query.targets, [
		{ param: 'composer_id', id: '7' },
		{ param: 'player_id', id: '3' }
	]);

	// Same name, different ids: each row keeps its own id; a row without an id gets no link.
	const conductors = {
		items: [
			{ id: 5, name: '동명', count: 4 },
			{ id: 6, name: '동명', count: 2 },
			{ id: null, name: '미상', count: 1 }
		]
	};
	assert.deepEqual(composerRankLinks('7', 'conductors', conductors), [
		'/stat/history?period=all&composer_id=7&conductor_id=5',
		'/stat/history?period=all&composer_id=7&conductor_id=6',
		null
	]);
	assert.deepEqual(composerRankLinks(7, 'soloists', { items: [{ id: 2, name: 'a' }] }), [
		'/stat/history?period=all&composer_id=7&player_id=2'
	]);
});

test('links: nothing before the card loads, none for a card without an id filter', () => {
	assert.deepEqual(composerRankLinks(7, 'soloists', null), []);
	assert.deepEqual(composerRankLinks(7, 'soloists', undefined), []);
	assert.deepEqual(composerRankLinks(7, 'soloists', { items: [] }), []);
	assert.deepEqual(composerRankLinks(7, 'timeline', { items: [{ id: 1, name: 'a' }] }), [null]);
});

test('facts name the era and the birth year, or say they are unknown', () => {
	assert.equal(composerFacts({ era: '낭만', birth_year: 1810 }), '낭만 · 1810년생');
	assert.equal(composerFacts({ era: '미상', birth_year: null }), '시대 미상 · 출생 연도 미상');
	// 시대는 보정값으로 정해질 수 있다: 출생 연도 없이도 시대가 있다.
	assert.equal(composerFacts({ era: '낭만', birth_year: null }), '낭만 · 출생 연도 미상');
	assert.equal(composerFacts({ birth_year: 1685 }), '시대 미상 · 1685년생');
	assert.equal(composerFacts(null), '');
});

test('semester buckets read as 학기', () => {
	assert.deepEqual(semesterSeries({ labels: ['2025-1', '2025-2'], values: [3, 4] }), {
		labels: ['2025-1학기', '2025-2학기'],
		values: [3, 4]
	});
	assert.equal(semesterSeries(null), null);
});

test("a work drops the composer's own name, matched by id", () => {
	const composer = { id: 3, name: '가상 C' };
	assert.equal(
		composerWorkName({ name: '가상 C - 교향곡 1번', composer_id: 3 }, composer),
		'교향곡 1번'
	);
	// 같은 이름의 다른 작곡가, 또는 접두어가 없는 이름은 그대로 둔다.
	assert.equal(
		composerWorkName({ name: '가상 C - 교향곡 1번', composer_id: 9 }, composer),
		'가상 C - 교향곡 1번'
	);
	assert.equal(composerWorkName({ name: '교향곡 1번', composer_id: 3 }, composer), '교향곡 1번');
});

test('the works table ranks ties together and shows each work’s first and last play', () => {
	const works = {
		items: [
			{ name: 'C - 가', count: 1200, composer_id: 1 },
			{
				name: 'C - 나',
				count: 9,
				composer_id: 1,
				first_played: '2025-03-04',
				last_played: '2026-10-01'
			},
			{
				name: 'C - 다',
				count: 9,
				composer_id: 1,
				first_played: '2025-03-05',
				last_played: '2026-09-30'
			}
		]
	};
	const table = composerWorksTable(works, { id: 1, name: 'C' });
	assert.deepEqual(
		table.columns.map((c) => c.name),
		['순위', '곡', '횟수', '처음', '마지막']
	);
	assert.equal(table.rowHeader, 1);
	assert.deepEqual(table.rows, [
		['1', '가', '1,200', '—', '—'],
		['2', '나', '9', '2025-03-04', '2026-10-01'],
		['2', '다', '9', '2025-03-05', '2026-09-30']
	]);
	// 작곡가를 아직 모르면 이름을 그대로 쓴다.
	assert.equal(composerWorksTable(works, null).rows[0][1], 'C - 가');
});

test('composerSemesterLinks opens each 학기 of 학기별 선곡 with this composer', () => {
	const timeline = { filters: { bucket: 'semester' }, labels: ['2025-1', '2025-2'] };
	assert.deepEqual(composerSemesterLinks('4', timeline), [
		'/stat/history?start=2025-03-01&end=2025-08-31&composer_id=4',
		'/stat/history?start=2025-09-01&end=2026-02-28&composer_id=4'
	]);
	assert.deepEqual(composerSemesterLinks(null, timeline), []);
	assert.deepEqual(composerSemesterLinks('4', null), []);
});
