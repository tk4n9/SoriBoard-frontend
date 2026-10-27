import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readStatQuery, statQueryHref, knownUser } from '../../src/lib/statQuery.js';

const read = (search) => readStatQuery(new URLSearchParams(search));
const href = (url, state) => statQueryHref(new URL(url, 'http://localhost'), state);
const ALL = { scope: 'all', userId: null, includeMentees: false };

test('no parameters read as the default 전체 view', () => {
	assert.deepEqual(read(''), ALL);
});

test('a linked 개인 view is read back', () => {
	assert.deepEqual(read('scope=individual&user_id=12'), {
		scope: 'individual',
		userId: '12',
		includeMentees: false
	});
	assert.deepEqual(read('scope=individual&user_id=12&include_mentees=true'), {
		scope: 'individual',
		userId: '12',
		includeMentees: true
	});
	assert.deepEqual(read('scope=individual'), {
		scope: 'individual',
		userId: null,
		includeMentees: false
	});
});

test('an invalid scope falls back to 전체 and drops the 지기 keys', () => {
	for (const search of [
		'scope=foo&user_id=12',
		'scope=all&user_id=12',
		'scope=Individual&user_id=12',
		'user_id=12&include_mentees=true'
	]) {
		assert.deepEqual(read(search), ALL, search);
	}
});

test('an invalid user_id is ignored', () => {
	for (const raw of ['abc', '0', '-3', '012', '1.5', '1e3', ' 12', '', '99999999999999999999']) {
		const got = read(`scope=individual&user_id=${encodeURIComponent(raw)}`);
		assert.equal(got.scope, 'individual', raw);
		assert.equal(got.userId, null, raw);
	}
});

test('include_mentees counts only as "true"', () => {
	for (const raw of ['1', 'yes', 'TRUE', 'false', '']) {
		assert.equal(read(`scope=individual&user_id=3&include_mentees=${raw}`).includeMentees, false);
	}
});

test('the default view leaves the URL bare', () => {
	assert.equal(href('/stat', ALL), '/stat');
	assert.equal(href('/stat?scope=individual&user_id=3&include_mentees=true', ALL), '/stat');
	// a 지기 kept while 전체 is shown stays out of the URL
	assert.equal(href('/stat', { scope: 'all', userId: '3', includeMentees: true }), '/stat');
});

test('a 개인 view writes only the keys it uses', () => {
	const ind = (userId, includeMentees) => ({ scope: 'individual', userId, includeMentees });
	assert.equal(href('/stat', ind(null, false)), '/stat?scope=individual');
	assert.equal(href('/stat', ind('12', false)), '/stat?scope=individual&user_id=12');
	assert.equal(href('/stat', ind(12, false)), '/stat?scope=individual&user_id=12');
	assert.equal(
		href('/stat', ind('12', true)),
		'/stat?scope=individual&user_id=12&include_mentees=true'
	);
	assert.equal(
		href('/stat?scope=individual&user_id=12&include_mentees=true', ind('12', false)),
		'/stat?scope=individual&user_id=12'
	);
});

test('other parameters and the hash are kept', () => {
	assert.equal(
		href('/stat?semester_id=4&user_id=9#top', {
			scope: 'individual',
			userId: '2',
			includeMentees: false
		}),
		'/stat?semester_id=4&scope=individual&user_id=2#top'
	);
	assert.equal(href('/stat?semester_id=4&scope=individual', ALL), '/stat?semester_id=4');
});

test('what is written reads back the same', () => {
	for (const state of [
		ALL,
		{ scope: 'individual', userId: null, includeMentees: false },
		{ scope: 'individual', userId: null, includeMentees: true },
		{ scope: 'individual', userId: '7', includeMentees: false },
		{ scope: 'individual', userId: '7', includeMentees: true }
	]) {
		const written = new URL(href('/stat', state), 'http://localhost');
		assert.deepEqual(readStatQuery(written.searchParams), state);
	}
});

test('a 지기 id that is in the 지기 list is kept', () => {
	const users = [{ id: 1 }, { id: 12 }];
	assert.equal(knownUser('12', users), '12');
	assert.equal(knownUser(12, users), 12);
});

test('a 지기 id that is not in the 지기 list falls back to no 지기', () => {
	assert.equal(knownUser('9999', [{ id: 1 }, { id: 12 }]), null);
	assert.equal(knownUser('12', []), null);
});

test('no 지기, or no 지기 list, is left as it is', () => {
	assert.equal(knownUser(null, [{ id: 1 }]), null);
	assert.equal(knownUser('12', null), '12');
	assert.equal(knownUser('12', { message: 'Error' }), '12');
});
