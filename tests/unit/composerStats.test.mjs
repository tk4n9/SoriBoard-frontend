import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	readComposerId,
	readComposerPeriod,
	writeComposerPeriod,
	readComposerMember,
	writeComposerMember,
	composerHref,
	composerPeriodParams,
	composerMemberParams,
	composerPeriodName,
	composerStatHref,
	composerWorkHref,
	composerHistoryHref,
	composerRankLinks,
	composerSemesterLinks,
	composerFacts,
	semesterSeries,
	composerWorkName,
	composerWorksTable
} from '../../src/lib/composerStats.js';
import { readHistoryQuery, workHistoryHref } from '../../src/lib/playHistory.js';

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

test('composerSemesterLinks opens a 학기 in the 학기 list by semester_id', () => {
	const timeline = { filters: { bucket: 'semester' }, labels: ['2024-1', '2025-2'] };
	const semesters = [{ id: 1, year: 2025, semester_num: 2 }];
	const links = composerSemesterLinks('4', timeline, semesters);
	assert.deepEqual(links, [
		'/stat/history?start=2024-03-01&end=2024-08-31&composer_id=4',
		'/stat/history?semester_id=1&composer_id=4'
	]);
	const read = readHistoryQuery(new URL(links[1], 'http://x').searchParams);
	assert.equal(read.period, '1');
	assert.deepEqual(read.targets, [{ param: 'composer_id', id: '4' }]);
});

const query = (search) => new URLSearchParams(search);
const SEMESTER = { period: '7', start: '', end: '' };
const RANGE = { period: 'custom', start: '2025-10-01', end: '2025-11-30' };

test('the period defaults to 전체 기간; period=current is 이번 학기', () => {
	const all = { period: 'all', start: '', end: '' };
	assert.deepEqual(readComposerPeriod(query('')), all);
	assert.deepEqual(readComposerPeriod(query('period=all')), all);
	assert.deepEqual(readComposerPeriod(query('period=current')), {
		period: 'current',
		start: '',
		end: ''
	});
	assert.deepEqual(readComposerPeriod(query('semester_id=7')), SEMESTER);
	assert.deepEqual(readComposerPeriod(query('start=2025-10-01&end=2025-11-30')), RANGE);
	assert.deepEqual(readComposerPeriod(query('start=2025-10-01')), {
		period: 'custom',
		start: '2025-10-01',
		end: ''
	});
	// 학기가 직접 지정보다, 직접 지정이 period 보다 먼저다(통계와 같다).
	assert.deepEqual(readComposerPeriod(query('semester_id=7&start=2025-10-01')), SEMESTER);
	assert.deepEqual(readComposerPeriod(query('period=current&end=2025-11-30')), {
		period: 'custom',
		start: '',
		end: '2025-11-30'
	});
	for (const bad of [
		'semester_id=0',
		'semester_id=abc',
		'start=2025-02-30',
		'end=2025-1-1',
		'period=now',
		'period=custom'
	]) {
		assert.deepEqual(readComposerPeriod(query(bad)), all, bad);
	}
});

test('writing the period round-trips, and 전체 기간 writes nothing', () => {
	for (const filter of [
		{ period: 'current', start: '', end: '' },
		SEMESTER,
		RANGE,
		{ period: 'custom', start: '', end: '2025-11-30' }
	]) {
		const params = query('');
		writeComposerPeriod(params, filter);
		assert.deepEqual(readComposerPeriod(params), filter, params.toString());
	}
	const params = query('semester_id=3&period=current&start=2025-01-01&x=1');
	writeComposerPeriod(params, { period: 'all' });
	assert.equal(params.toString(), 'x=1');
	writeComposerPeriod(params, SEMESTER);
	assert.equal(params.toString(), 'x=1&semester_id=7');
	writeComposerPeriod(params);
	assert.equal(params.toString(), 'x=1');
});

test('composerHref keeps the bare path for 전체 기간 and adds any other period', () => {
	assert.equal(composerHref(5), '/stat/composer/5');
	assert.equal(composerHref(5, { period: 'all', start: '', end: '' }), '/stat/composer/5');
	assert.equal(composerHref(5, { period: '7' }), '/stat/composer/5?semester_id=7');
	assert.equal(composerHref(5, { period: 'current' }), '/stat/composer/5?period=current');
	assert.equal(composerHref(5, RANGE), '/stat/composer/5?start=2025-10-01&end=2025-11-30');
	// 통계의 기간 상태 그대로: 직접 지정이 아니면 남은 날짜는 쓰지 않는다.
	assert.equal(
		composerHref(5, { period: '7', start: '2025-10-01', end: '' }),
		'/stat/composer/5?semester_id=7'
	);
});

test('the request sends 이번 학기 as its dates, like 통계', () => {
	const current = { start: '2026-09-01', end: '2026-10-29' };
	assert.deepEqual(composerPeriodParams({ period: 'all' }, current), {});
	assert.deepEqual(composerPeriodParams({ period: 'current' }, current), current);
	assert.deepEqual(composerPeriodParams(SEMESTER, current), { semester_id: '7' });
	assert.deepEqual(composerPeriodParams(RANGE, current), {
		start: '2025-10-01',
		end: '2025-11-30'
	});
	assert.deepEqual(
		composerPeriodParams({ period: 'custom', start: '', end: '2025-11-30' }, current),
		{ end: '2025-11-30' }
	);
});

test('the period name for subtitles and the tab title', () => {
	const semesters = [{ id: 7, year: 2025, semester_num: 2 }];
	assert.equal(composerPeriodName({ period: 'all' }, semesters), '전체 기간');
	assert.equal(composerPeriodName({ period: 'current' }, semesters), '이번 학기');
	assert.equal(composerPeriodName(SEMESTER, semesters), '2025-2학기');
	assert.equal(composerPeriodName(SEMESTER, []), '');
	assert.equal(composerPeriodName(RANGE, null), '2025-10-01 ~ 2025-11-30');
});

test('links carry a 학기 or 직접 지정 period, and keep today’s URLs without one', () => {
	assert.equal(composerHistoryHref(7, [], SEMESTER), '/stat/history?semester_id=7&composer_id=7');
	assert.equal(
		composerHistoryHref(7, [], RANGE),
		'/stat/history?start=2025-10-01&end=2025-11-30&composer_id=7'
	);
	// 이번 학기는 선곡 기록의 기본값이라 남기지 않는다.
	assert.equal(composerHistoryHref(7, [], { period: 'current' }), '/stat/history?composer_id=7');
	assert.equal(composerHistoryHref(7, []), '/stat/history?period=all&composer_id=7');

	const soloists = { items: [{ id: 2, name: 'a' }] };
	assert.deepEqual(composerRankLinks(7, 'soloists', soloists, RANGE), [
		'/stat/history?start=2025-10-01&end=2025-11-30&composer_id=7&player_id=2'
	]);
	assert.deepEqual(composerRankLinks(7, 'soloists', soloists, SEMESTER), [
		'/stat/history?semester_id=7&composer_id=7&player_id=2'
	]);

	assert.equal(composerWorkHref(11), workHistoryHref(11));
	assert.equal(composerWorkHref(11, SEMESTER), '/stat/history?semester_id=7&music_id=11');
	assert.equal(
		composerWorkHref(11, RANGE),
		'/stat/history?start=2025-10-01&end=2025-11-30&music_id=11'
	);

	assert.equal(composerStatHref(), '/stat?period=all');
	assert.equal(composerStatHref({ period: 'current' }), '/stat');
	assert.equal(composerStatHref(SEMESTER), '/stat?semester_id=7');
	assert.equal(composerStatHref(RANGE), '/stat?start=2025-10-01&end=2025-11-30');
});

test('학기별 선곡 links clip to the period the answer applied', () => {
	// 직접 지정 2025-10-01 ~ 2025-11-30: 학기 버킷 하나, 그 범위로 줄인 날짜로 연다.
	const timeline = {
		filters: { bucket: 'semester', start: '2025-10-01', end: '2025-11-30' },
		labels: ['2025-2']
	};
	const semesters = [{ id: 1, year: 2025, semester_num: 2 }];
	assert.deepEqual(composerSemesterLinks('4', timeline, semesters, RANGE), [
		'/stat/history?start=2025-10-01&end=2025-11-30&composer_id=4'
	]);
	// 학기 하나: 줄지 않은 버킷은 그 학기(semester_id)로 연다.
	const whole = {
		filters: { bucket: 'semester', start: '2025-09-01', end: '2026-02-28' },
		labels: ['2025-2']
	};
	assert.deepEqual(composerSemesterLinks('4', whole, semesters, { period: '1' }), [
		'/stat/history?semester_id=1&composer_id=4'
	]);
});

const NONE = { userId: null, includeMentees: false };
const MEMBER = { period: '7', userId: '12', includeMentees: false };
const MENTEES = { period: '7', userId: '12', includeMentees: true };

test('the 지기 reads from user_id and include_mentees, and defaults to 전체 지기', () => {
	assert.deepEqual(readComposerMember(query('user_id=12&include_mentees=true')), {
		userId: '12',
		includeMentees: true
	});
	assert.deepEqual(readComposerMember(query('semester_id=7&user_id=12')), {
		userId: '12',
		includeMentees: false
	});
	assert.deepEqual(readComposerMember(query('user_id=12&include_mentees=1')), {
		userId: '12',
		includeMentees: false
	});
	// 견습 포함은 지기를 고른 때만 뜻이 있다.
	for (const bad of [
		'',
		'include_mentees=true',
		'user_id=0&include_mentees=true',
		'user_id=abc',
		'user_id=1.5',
		'user_id=-3',
		'user_id='
	]) {
		assert.deepEqual(readComposerMember(query(bad)), NONE, bad);
	}
});

test('writing the 지기 round-trips, keeps other keys, and 전체 지기 writes nothing', () => {
	for (const member of [
		NONE,
		{ userId: '12', includeMentees: false },
		{ userId: '12', includeMentees: true }
	]) {
		const params = query('');
		writeComposerMember(params, member);
		assert.deepEqual(readComposerMember(params), member, params.toString());
	}
	const params = query('semester_id=7&user_id=3&include_mentees=true');
	writeComposerMember(params, { userId: '12', includeMentees: false });
	assert.equal(params.toString(), 'semester_id=7&user_id=12');
	writeComposerMember(params, NONE);
	assert.equal(params.toString(), 'semester_id=7');
	// 견습 포함만으로는 아무것도 남기지 않는다.
	writeComposerMember(params, { userId: null, includeMentees: true });
	assert.equal(params.toString(), 'semester_id=7');
	writeComposerMember(params);
	assert.equal(params.toString(), 'semester_id=7');
});

test('composerHref adds the 지기 after the period', () => {
	assert.equal(
		composerHref(5, { period: '7', userId: '12', includeMentees: true }),
		'/stat/composer/5?semester_id=7&user_id=12&include_mentees=true'
	);
	assert.equal(composerHref(5, MEMBER), '/stat/composer/5?semester_id=7&user_id=12');
	assert.equal(composerHref(5, { period: 'all', userId: '12' }), '/stat/composer/5?user_id=12');
	// 전체 지기면 오늘의 URL 그대로(통계의 전체 보기가 넘기는 값).
	assert.equal(
		composerHref(5, { period: '7', userId: null, includeMentees: true }),
		'/stat/composer/5?semester_id=7'
	);
	const read = new URL(
		composerHref(5, { ...RANGE, userId: '12', includeMentees: true }),
		'http://x'
	).searchParams;
	assert.deepEqual(readComposerPeriod(read), RANGE);
	assert.deepEqual(readComposerMember(read), { userId: '12', includeMentees: true });
});

test('the request sends user_id, and include_mentees only with a 지기', () => {
	assert.deepEqual(composerMemberParams(NONE), {});
	assert.deepEqual(composerMemberParams({}), {});
	assert.deepEqual(composerMemberParams({ userId: null, includeMentees: true }), {});
	assert.deepEqual(composerMemberParams(MEMBER), { user_id: '12' });
	assert.deepEqual(composerMemberParams(MENTEES), { user_id: '12', include_mentees: 'true' });
});

test('links keep the 지기: 통계 opens its 개인 view, 선곡 기록 opens with that 지기', () => {
	assert.equal(composerStatHref(MEMBER), '/stat?semester_id=7&scope=individual&user_id=12');
	assert.equal(
		composerStatHref(MENTEES),
		'/stat?semester_id=7&scope=individual&user_id=12&include_mentees=true'
	);
	assert.equal(
		composerStatHref({ period: 'all', userId: '12' }),
		'/stat?period=all&scope=individual&user_id=12'
	);

	assert.equal(
		composerHistoryHref(7, [], MENTEES),
		'/stat/history?semester_id=7&user_id=12&include_mentees=true&composer_id=7'
	);
	const read = readHistoryQuery(
		new URL(composerHistoryHref(7, [], MENTEES), 'http://x').searchParams
	);
	assert.equal(read.userId, '12');
	assert.equal(read.includeMentees, true);
	assert.deepEqual(read.targets, [{ param: 'composer_id', id: '7' }]);

	assert.equal(composerWorkHref(11, MEMBER), '/stat/history?semester_id=7&user_id=12&music_id=11');
	assert.deepEqual(composerRankLinks(7, 'soloists', { items: [{ id: 2, name: 'a' }] }, MENTEES), [
		'/stat/history?semester_id=7&user_id=12&include_mentees=true&composer_id=7&player_id=2'
	]);
	assert.deepEqual(composerRankLinks(7, 'conductors', { items: [{ id: 5, name: 'b' }] }, MEMBER), [
		'/stat/history?semester_id=7&user_id=12&composer_id=7&conductor_id=5'
	]);

	const timeline = {
		filters: { bucket: 'semester', user_id: 12 },
		labels: ['2024-1', '2025-2']
	};
	const semesters = [{ id: 1, year: 2025, semester_num: 2 }];
	assert.deepEqual(composerSemesterLinks('4', timeline, semesters, { ...MENTEES, period: 'all' }), [
		'/stat/history?start=2024-03-01&end=2024-08-31&user_id=12&include_mentees=true&composer_id=4',
		'/stat/history?semester_id=1&user_id=12&include_mentees=true&composer_id=4'
	]);
});

test('견습 포함 without a 지기 does not reach any link', () => {
	const stray = { period: '7', userId: null, includeMentees: true };
	assert.equal(composerStatHref(stray), '/stat?semester_id=7');
	assert.equal(composerHistoryHref(7, [], stray), '/stat/history?semester_id=7&composer_id=7');
	assert.equal(composerWorkHref(11, stray), '/stat/history?semester_id=7&music_id=11');
});
