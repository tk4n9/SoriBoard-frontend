import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestGroups, genreDistribution, DERIVED_CARDS } from '../../src/lib/statCards.js';

test('the genre card is drawn from the diversity answer', () => {
	assert.equal(DERIVED_CARDS.genres, 'diversity');
});

test('a full load asks for diversity once, for both its cards', () => {
	assert.deepEqual(requestGroups(['summary', 'eras', 'diversity', 'genres']), [
		['summary', ['summary']],
		['eras', ['eras']],
		['diversity', ['diversity', 'genres']]
	]);
});

test('a derived card listed first still groups under its request', () => {
	assert.deepEqual(requestGroups(['genres', 'summary', 'diversity']), [
		['diversity', ['genres', 'diversity']],
		['summary', ['summary']]
	]);
});

test('a diversity-only reload does not cover the genre card', () => {
	assert.deepEqual(requestGroups(['diversity']), [['diversity', ['diversity']]]);
});

test('the genre card alone still asks for diversity', () => {
	assert.deepEqual(requestGroups(['genres']), [['diversity', ['genres']]]);
});

test('cards with no derived entry ask for themselves', () => {
	assert.deepEqual(requestGroups(['a', 'b'], {}), [
		['a', ['a']],
		['b', ['b']]
	]);
});

test('genreDistribution takes summary.genre and the answer total and filters', () => {
	const diversity = {
		filters: { start: '2026-09-01', end: '2026-10-26', bucket: 'week' },
		total_plays: 134,
		summary: {
			distinct_works: 18,
			era: { labels: ['바로크'], values: [134], unknown_share: 0, entropy: 0, evenness: 0 },
			genre: { labels: ['교향곡', '기타'], values: [100, 34], entropy: 0.56, evenness: 0.31 }
		},
		timeline: { bucket: 'week', labels: [], plays: [] }
	};
	assert.deepEqual(genreDistribution(diversity), {
		filters: { start: '2026-09-01', end: '2026-10-26', bucket: 'week' },
		total_plays: 134,
		labels: ['교향곡', '기타'],
		values: [100, 34]
	});
});

test('genreDistribution of an empty answer has no labels', () => {
	const empty = genreDistribution({
		filters: {},
		total_plays: 0,
		summary: { genre: { labels: [], values: [] } }
	});
	assert.deepEqual(empty.labels, []);
	assert.equal(empty.total_plays, 0);
});
