import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	PAGE_SIZE,
	EXPORT_PAGE_SIZE,
	PLAY_CSV_HEADERS,
	readHistoryQuery,
	historyHref,
	statHref,
	playsParams,
	appendPage,
	targetLookup,
	targetName,
	targetText,
	sessionText,
	workText,
	workParts,
	performersText,
	jigiText,
	fetchAllPlays,
	playCsvRow
} from '../../src/lib/playHistory.js';

const read = (search) => readHistoryQuery(new URLSearchParams(search));
const DEFAULT = {
	period: 'current',
	start: '',
	end: '',
	q: '',
	userId: null,
	includeMentees: false,
	requested: '',
	target: null
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

test('an id filter from the drill-down is read, written and sent to plays/', () => {
	const composer = { param: 'composer_id', id: '4' };
	assert.deepEqual(read('composer_id=4').target, composer);
	assert.deepEqual(read('player_id=12').target, { param: 'player_id', id: '12' });
	assert.deepEqual(read('conductor_id=3').target, { param: 'conductor_id', id: '3' });
	assert.deepEqual(read('orchestra_id=5').target, { param: 'orchestra_id', id: '5' });
	// 곡 하나(표기 정리의 곡 행에서).
	const work = { param: 'music_id', id: '20' };
	assert.deepEqual(read('music_id=20').target, work);
	assert.equal(
		historyHref({ ...DEFAULT, period: 'all', target: work }),
		'/stat/history?period=all&music_id=20'
	);
	assert.deepEqual(params({ period: 'all', target: work }), { music_id: '20', limit: '50' });
	// 통계 패널의 링크 그대로: 기간, 지기, id 필터(limit 은 없다).
	const linked = {
		...DEFAULT,
		period: '3',
		userId: '2',
		includeMentees: true,
		target: { param: 'conductor_id', id: '9' }
	};
	const href = historyHref(linked);
	assert.equal(href, '/stat/history?semester_id=3&user_id=2&include_mentees=true&conductor_id=9');
	assert.deepEqual(read(new URL(href, 'http://x').search), linked);
	assert.deepEqual(params({ period: 'all', target: composer }), { composer_id: '4', limit: '50' });
	assert.deepEqual(params({ period: 'all', q: 'x', target: composer }, 50), {
		q: 'x',
		composer_id: '4',
		limit: '50',
		offset: '50'
	});
	// 통계로 돌아가는 링크에는 남기지 않는다.
	assert.equal(statHref({ ...DEFAULT, target: composer }), '/stat');
});

test('invalid or unknown id filters are ignored, and only one is kept', () => {
	for (const search of [
		'composer_id=0',
		'player_id=x',
		'orchestra_id=-1',
		'music_id=0',
		'time_id=3'
	])
		assert.equal(read(search).target, null, search);
	assert.deepEqual(read('orchestra_id=5&composer_id=4').target, {
		param: 'composer_id',
		id: '4'
	});
	assert.deepEqual(read('composer_id=abc&player_id=7').target, { param: 'player_id', id: '7' });
	assert.deepEqual(read('music_id=3&conductor_id=8').target, { param: 'conductor_id', id: '8' });
	assert.equal(historyHref({ ...DEFAULT, target: { param: 'time_id', id: '3' } }), '/stat/history');
	assert.equal(historyHref({ ...DEFAULT, target: null }), '/stat/history');
});

test('the target name is looked up by id in its own ranking', () => {
	assert.equal(targetLookup(null), null);
	assert.equal(targetLookup({ param: 'time_id', id: '1' }), null);
	const lookup = targetLookup({ param: 'player_id', id: '12' });
	assert.equal(lookup.endpoint, 'soloists');
	assert.equal(lookup.params.toString(), 'player_id=12&limit=100');
	assert.equal(targetLookup({ param: 'composer_id', id: '4' }).endpoint, 'composers');
	assert.equal(targetLookup({ param: 'conductor_id', id: '4' }).endpoint, 'conductors');
	assert.equal(targetLookup({ param: 'orchestra_id', id: '4' }).endpoint, 'orchestras');
	const workLookup = targetLookup({ param: 'music_id', id: '20' });
	assert.equal(workLookup.endpoint, 'works');
	assert.equal(workLookup.params.toString(), 'music_id=20&limit=100');

	const target = { param: 'player_id', id: '12' };
	// 같은 이름의 다른 사람이 앞에 있어도 id 로 찾는다.
	const envelope = {
		items: [
			{ id: 3, name: '가상 첼리스트 (첼로)', count: 9 },
			{ id: null, name: '(미상)', count: 9 },
			{ id: 12, name: '가상 첼리스트 (첼로)', count: 9 }
		]
	};
	assert.equal(targetName(envelope, target), '가상 첼리스트 (첼로)');
	assert.equal(targetName({ items: [{ id: 3, name: '다른 사람', count: 1 }] }, target), null);
	assert.equal(targetName(null, target), null);
	assert.equal(targetText(target, '가상 첼리스트 (첼로)'), '연주자: 가상 첼리스트 (첼로)');
	assert.equal(targetText({ param: 'composer_id', id: '4' }, null), '작곡가 #4');
	const work = { param: 'music_id', id: '20' };
	const works = { items: [{ id: 20, name: '가상 작곡가 - 가상 서곡 Op. 12', count: 5 }] };
	assert.equal(targetText(work, targetName(works, work)), '곡: 가상 작곡가 - 가상 서곡 Op. 12');
	assert.equal(targetText(work, null), '곡 #20');
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

test('a play splits into a composer, linked by id, and a title', () => {
	const play = {
		id: 3,
		time_id: 2,
		date: '2024-03-06',
		time: 2,
		is_requested: false,
		composer_id: 7,
		composer_name: '브람스',
		music_title: '첼로 소나타 제1번'
	};
	const joined = (parts) => [parts.composer, parts.title].filter(Boolean).join(' - ');
	assert.deepEqual(workParts(play), {
		composer: '브람스',
		composerId: 7,
		title: '첼로 소나타 제1번'
	});
	assert.equal(joined(workParts(play)), workText(play));

	// No id, or not a usable one: the name stays plain text.
	for (const composer_id of [undefined, null, 0, -1, 1.5, '7', Number.MAX_SAFE_INTEGER + 1]) {
		assert.equal(workParts({ ...play, composer_id }).composerId, null, String(composer_id));
	}
	// An id without a name has nothing to link.
	assert.deepEqual(workParts({ ...play, composer_name: '' }), {
		composer: '',
		composerId: null,
		title: '첼로 소나타 제1번'
	});
	assert.deepEqual(workParts({ ...play, music_title: undefined }), {
		composer: '브람스',
		composerId: 7,
		title: ''
	});
	assert.equal(joined(workParts({ ...play, music_title: undefined })), '브람스');
	const bare = { id: 1, time_id: 1, date: '2026-10-23', time: 3, is_requested: false };
	assert.deepEqual(workParts(bare), { composer: '', composerId: null, title: '' });
});

test('the CSV export asks for the largest page plays/ allows', () => {
	assert.equal(EXPORT_PAGE_SIZE, 100);
	const exported = Object.fromEntries(
		playsParams({ ...DEFAULT, q: '현악' }, CURRENT_RANGE, 200, EXPORT_PAGE_SIZE)
	);
	assert.deepEqual(exported, {
		start: '2026-09-01',
		end: '2026-10-27',
		q: '현악',
		limit: '100',
		offset: '200'
	});
	assert.equal(params({}).limit, String(PAGE_SIZE));
});

// 가짜 plays/: offset 부터 limit 개. shiftAt 번째 요청 앞에 새 선곡 하나가 맨 앞에 들어온다.
function fakePlays(total, { limit = 3, shiftAt = -1, emptyAt = -1 } = {}) {
	let plays = Array.from({ length: total }, (_, i) => ({ id: total - i }));
	const calls = [];
	const fetchPage = async (offset) => {
		calls.push(offset);
		if (calls.length - 1 === shiftAt) plays = [{ id: total + 1 }, ...plays];
		if (calls.length - 1 === emptyAt) return { count: plays.length, results: [] };
		return { count: plays.length, results: plays.slice(offset, offset + limit) };
	};
	return { fetchPage, calls };
}

test('the CSV export pages through every play once', async () => {
	const { fetchPage, calls } = fakePlays(7);
	const progress = [];
	const rows = await fetchAllPlays(fetchPage, (done, count) => progress.push([done, count]));
	assert.deepEqual(
		rows.map((r) => r.id),
		[7, 6, 5, 4, 3, 2, 1]
	);
	assert.deepEqual(calls, [0, 3, 6]);
	assert.deepEqual(progress, [
		[3, 7],
		[6, 7],
		[7, 7]
	]);
});

test('the CSV export keeps a play once when a new play shifts the pages', async () => {
	const { fetchPage, calls } = fakePlays(7, { shiftAt: 1 });
	const rows = await fetchAllPlays(fetchPage);
	// 두 번째 쪽은 3번 선곡부터가 아니라 다시 5번(밀린 자리)부터 온다.
	assert.deepEqual(
		rows.map((r) => r.id),
		[7, 6, 5, 4, 3, 2, 1]
	);
	assert.deepEqual(calls, [0, 3, 6]);
});

test('the CSV export stops at an empty page or with no plays', async () => {
	const early = fakePlays(7, { emptyAt: 1 });
	assert.deepEqual(
		(await fetchAllPlays(early.fetchPage)).map((r) => r.id),
		[7, 6, 5]
	);
	assert.deepEqual(early.calls, [0, 3]);
	const none = fakePlays(0);
	assert.deepEqual(await fetchAllPlays(none.fetchPage), []);
	assert.deepEqual(none.calls, [0]);
});

test('the CSV export fails as a whole when a page fails', async () => {
	let n = 0;
	const fetchPage = async (offset) => {
		if (++n === 2) throw new Error('plays 502');
		return { count: 6, results: [{ id: 6 - offset }, { id: 5 - offset }, { id: 4 - offset }] };
	};
	await assert.rejects(fetchAllPlays(fetchPage), /plays 502/);
});

test('a play is one CSV row, one column per header', () => {
	const play = {
		id: 3,
		time_id: 2,
		date: '2024-03-06',
		time: 2,
		is_requested: true,
		music_title: '첼로 소나타 제1번',
		music_semi_title: '2악장',
		composer_name: '브람스',
		player_names: ['피아노: 가상 피아니스트', '첼로: 가상 첼리스트'],
		orchestra_name: '가상 오케스트라',
		conductor_name: '가상 지휘자',
		jigi_names: ['가상일', '가상이'],
		mentee_names: ['가상사']
	};
	assert.deepEqual(PLAY_CSV_HEADERS, [
		'날짜',
		'타임',
		'작곡가',
		'곡',
		'세부 제목',
		'연주자',
		'오케스트라',
		'지휘자',
		'지기',
		'견습 지기',
		'신청곡'
	]);
	assert.deepEqual(playCsvRow(play), [
		'2024-03-06',
		2,
		'브람스',
		'첼로 소나타 제1번',
		'2악장',
		'피아노: 가상 피아니스트, 첼로: 가상 첼리스트',
		'가상 오케스트라',
		'가상 지휘자',
		'가상일, 가상이',
		'가상사',
		'O'
	]);
	const bare = { id: 1, time_id: 1, date: '2026-10-23', time: 3, is_requested: false };
	const row = playCsvRow(bare);
	assert.equal(row.length, PLAY_CSV_HEADERS.length);
	assert.deepEqual(
		row.map((cell) => cell ?? ''),
		['2026-10-23', 3, '', '', '', '', '', '', '', '', '']
	);
});
