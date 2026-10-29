import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	requestGroups,
	genreDistribution,
	diversityTiles,
	DERIVED_CARDS,
	retryKeys
} from '../../src/lib/statCards.js';

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

test('the 선곡 다양성 tiles are drawn from the diversity answer', () => {
	assert.equal(DERIVED_CARDS.diversityTiles, 'diversity');
});

test('a full load asks for diversity once, for the tiles too', () => {
	assert.deepEqual(requestGroups(['summary', 'diversity', 'genres', 'diversityTiles']), [
		['summary', ['summary']],
		['diversity', ['diversity', 'genres', 'diversityTiles']]
	]);
});

test('a 주별/월별 reload covers neither the genre card nor the tiles', () => {
	assert.deepEqual(requestGroups(['diversity', 'timeline']), [
		['diversity', ['diversity']],
		['timeline', ['timeline']]
	]);
});

test('diversityTiles takes the summary, which does not depend on the bucket', () => {
	const summary = {
		distinct_works: 18,
		era: { labels: ['바로크'], values: [134], unknown_share: 0, entropy: 0, evenness: 0 },
		genre: { labels: ['교향곡', '기타'], values: [100, 34], entropy: 0.56, evenness: 0.31 }
	};
	const answer = (bucket) => ({
		filters: { bucket },
		total_plays: 134,
		summary,
		timeline: { bucket, labels: [], plays: [] }
	});
	assert.equal(diversityTiles(answer('week')), summary);
	assert.deepEqual(diversityTiles(answer('week')), diversityTiles(answer('month')));
});

test('retryKeys: a card with its own request retries only itself', () => {
	const errors = { eras: '불러오지 못했습니다', composers: '불러오지 못했습니다' };
	assert.deepEqual(retryKeys('eras', errors), ['eras']);
});

test('retryKeys: the genre card retries every failed card of the diversity request', () => {
	const errors = {
		diversity: '불러오지 못했습니다',
		genres: '불러오지 못했습니다',
		diversityTiles: '불러오지 못했습니다',
		eras: '불러오지 못했습니다'
	};
	const keys = retryKeys('genres', errors);
	assert.deepEqual(keys, ['diversity', 'genres', 'diversityTiles']);
	// one fetch for all three
	assert.deepEqual(requestGroups(keys), [['diversity', keys]]);
	assert.deepEqual(retryKeys('diversity', errors), keys);
	assert.deepEqual(retryKeys('diversityTiles', errors), keys);
});

test('retryKeys: when only the genre card failed, it retries the genre card alone', () => {
	assert.deepEqual(retryKeys('genres', { diversity: '', genres: '불러오지 못했습니다' }), [
		'genres'
	]);
});

test('retryKeys never includes a card without an error', () => {
	const errors = { diversity: '', genres: '불러오지 못했습니다', diversityTiles: '' };
	assert.deepEqual(retryKeys('diversity', errors), ['genres']);
	assert.deepEqual(retryKeys('eras', errors), []);
	assert.deepEqual(retryKeys('summary', {}), []);
});
