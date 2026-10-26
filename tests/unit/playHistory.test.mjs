import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	PAGE_SIZE,
	readHistoryQuery,
	historyHref,
	statHref,
	playsParams,
	appendPage,
	sessionText,
	workText,
	performersText,
	jigiText
} from '../../src/lib/playHistory.js';

const read = (search) => readHistoryQuery(new URLSearchParams(search));
const DEFAULT = {
	period: 'current',
	start: '',
	end: '',
	q: '',
	userId: null,
	includeMentees: false,
	requested: ''
};
const CURRENT_RANGE = { start: '2026-09-01', end: '2026-10-27' };
const params = (filter, offset) =>
	Object.fromEntries(playsParams({ ...DEFAULT, ...filter }, CURRENT_RANGE, offset));

test('no parameters read as the defaults, and the defaults write nothing', () => {
	assert.deepEqual(read(''), DEFAULT);
	assert.equal(historyHref(DEFAULT), '/stat/history');
});

test('a linked filter is read back', () => {
	assert.deepEqual(
		read(
			'semester_id=3&q=%EB%B8%8C%EB%9E%8C%EC%8A%A4&user_id=12&include_mentees=true&requested=false'
		),
		{
			...DEFAULT,
			period: '3',
			q: '브람스',
			userId: '12',
			includeMentees: true,
			requested: 'false'
		}
	);
	assert.deepEqual(read('start=2025-03-01&end=2025-06-30'), {
		...DEFAULT,
		period: 'custom',
		start: '2025-03-01',
		end: '2025-06-30'
	});
	assert.equal(read('period=all').period, 'all');
});

test('invalid values are ignored', () => {
	assert.deepEqual(read('user_id=0&requested=yes&semester_id=x&start=2025-02-30'), DEFAULT);
	assert.equal(read('user_id=12abc').userId, null);
	assert.equal(read('user_id=99999999999999999999').userId, null);
	assert.equal(read('q=%20%20').q, '');
	// 견습 포함은 지기가 있을 때만
	assert.equal(read('include_mentees=true').includeMentees, false);
	assert.equal(read('user_id=3&include_mentees=1').includeMentees, false);
});

test('what is written reads back the same', () => {
	const filters = [
		{ ...DEFAULT, period: '4', q: '첼로 소나타', requested: 'true' },
		{ ...DEFAULT, period: 'all', userId: '2', includeMentees: true },
		{ ...DEFAULT, period: 'custom', start: '2025-03-01', end: '' },
		{ ...DEFAULT, q: 'a&b=c #1' }
	];
	for (const filter of filters) {
		const href = historyHref(filter);
		assert.ok(href.startsWith('/stat/history?'), href);
		assert.deepEqual(read(new URL(href, 'http://x').search), filter);
	}
});

test('the written URL trims the search and drops mentees without a 지기', () => {
	assert.equal(
		historyHref({ ...DEFAULT, q: '  브람스 ', includeMentees: true }),
		'/stat/history?q=%EB%B8%8C%EB%9E%8C%EC%8A%A4'
	);
});

test('the 통계 link keeps the period and the 지기, not the search', () => {
	assert.equal(statHref(DEFAULT), '/stat');
	assert.equal(
		statHref({
			...DEFAULT,
			period: '3',
			q: 'x',
			requested: 'true',
			userId: '7',
			includeMentees: true
		}),
		'/stat?semester_id=3&scope=individual&user_id=7&include_mentees=true'
	);
	assert.equal(statHref({ ...DEFAULT, period: 'all' }), '/stat?period=all');
});

test('plays/ gets the period as dates or a 학기', () => {
	assert.deepEqual(params({}), { ...CURRENT_RANGE, limit: String(PAGE_SIZE) });
	assert.deepEqual(params({ period: 'all' }), { limit: '50' });
	assert.deepEqual(params({ period: '3' }), { semester_id: '3', limit: '50' });
	assert.deepEqual(params({ period: 'custom', start: '', end: '2025-06-30' }), {
		end: '2025-06-30',
		limit: '50'
	});
});

test('plays/ gets the search, the 지기 and 신청곡, and the offset after the first page', () => {
	assert.deepEqual(
		params(
			{ period: 'all', q: ' 첼로 ', userId: '2', includeMentees: true, requested: 'false' },
			100
		),
		{
			q: '첼로',
			user_id: '2',
			include_mentees: 'true',
			requested: 'false',
			limit: '50',
			offset: '100'
		}
	);
	assert.deepEqual(params({ period: 'all', includeMentees: true }, 0), { limit: '50' });
});

test('a next page that repeats rows (new plays shifted it) adds each play once', () => {
	const rows = [{ id: 9 }, { id: 8 }, { id: 7 }];
	assert.deepEqual(appendPage(rows, [{ id: 7 }, { id: 6 }, { id: 5 }]), [
		{ id: 9 },
		{ id: 8 },
		{ id: 7 },
		{ id: 6 },
		{ id: 5 }
	]);
	assert.deepEqual(appendPage([], [{ id: 1 }]), [{ id: 1 }]);
	assert.equal(rows.length, 3); // 받은 배열은 그대로
});

test('row texts', () => {
	const play = {
		id: 3,
		time_id: 2,
		date: '2024-03-06',
		time: 2,
		is_requested: true,
		music_title: '첼로 소나타 제1번',
		composer_name: '브람스',
		player_names: ['피아노: 가상 피아니스트', '첼로: 가상 첼리스트'],
		orchestra_name: '가상 오케스트라',
		conductor_name: '가상 지휘자',
		jigi_names: ['가상일', '가상이'],
		mentee_names: ['가상사']
	};
	assert.equal(sessionText(play), '2024-03-06 2타임');
	assert.equal(workText(play), '브람스 - 첼로 소나타 제1번');
	assert.equal(
		performersText(play),
		'피아노: 가상 피아니스트 · 첼로: 가상 첼리스트 · 가상 오케스트라 · 지휘: 가상 지휘자'
	);
	assert.equal(jigiText(play), '가상일, 가상이, 가상사(견습)');
});

test('a play without music or performers still reads', () => {
	const bare = { id: 1, time_id: 1, date: '2026-10-23', time: 3, is_requested: false };
	assert.equal(workText(bare), '곡 정보 없음');
	assert.equal(performersText(bare), '');
	assert.equal(jigiText(bare), '');
	assert.equal(workText({ ...bare, music_title: '무제' }), '무제');
	assert.equal(performersText({ ...bare, player_names: [] }), '');
});
