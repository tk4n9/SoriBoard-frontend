import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLatestRequests } from '../../src/lib/latestRequest.js';

const CARDS = ['summary', 'composers', 'diversity'];

test('a request is the latest for every key it covers', () => {
	const requests = createLatestRequests();
	const id = requests.begin(CARDS);
	for (const key of CARDS) assert.equal(requests.isLatest(key, id), true);
});

test('a key no request covered has no latest request', () => {
	const requests = createLatestRequests();
	const id = requests.begin(['summary']);
	assert.equal(requests.isLatest('diversity', id), false);
});

test('a newer full load replaces an older one on every key', () => {
	const requests = createLatestRequests();
	const first = requests.begin(CARDS);
	const second = requests.begin(CARDS);
	for (const key of CARDS) {
		assert.equal(requests.isLatest(key, first), false);
		assert.equal(requests.isLatest(key, second), true);
	}
});

test('a diversity-only reload keeps the full load current for the other cards', () => {
	const requests = createLatestRequests();
	const full = requests.begin(CARDS);
	const reload = requests.begin(['diversity']);
	assert.equal(requests.isLatest('summary', full), true);
	assert.equal(requests.isLatest('composers', full), true);
	// The full load's older diversity answer must not overwrite the reload.
	assert.equal(requests.isLatest('diversity', full), false);
	assert.equal(requests.isLatest('diversity', reload), true);
});

test('a full load after a diversity-only reload makes the reload stale', () => {
	const requests = createLatestRequests();
	requests.begin(CARDS);
	const reload = requests.begin(['diversity']);
	const full = requests.begin(CARDS);
	assert.equal(requests.isLatest('diversity', reload), false);
	assert.equal(requests.isLatest('diversity', full), true);
});

test('ids grow across calls and separate guards do not share state', () => {
	const a = createLatestRequests();
	const b = createLatestRequests();
	const a1 = a.begin(['x']);
	const a2 = a.begin(['y']);
	assert.ok(a2 > a1);
	assert.equal(a.isLatest('x', a1), true);
	const b1 = b.begin(['x']);
	assert.equal(b.isLatest('x', b1), true);
	assert.equal(a.isLatest('x', a1), true);
});
