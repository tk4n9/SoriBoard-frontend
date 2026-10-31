<script>
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import EChart from '$lib/components/stat/EChart.svelte';
	import ReportTable from '$lib/components/stat/ReportTable.svelte';
	import { eraPieOption } from '$lib/chartOptions.js';
	import { formatCount, groupEvenness } from '$lib/statTable.js';
	import { sortSemesters, semesterLabel } from '$lib/statPeriod.js';
	import { composerHref } from '$lib/composerStats.js';
	import { historyHref, workHistoryHref, targetHistoryHref } from '$lib/playHistory.js';
	import { DRILL_CARDS } from '$lib/statDrill.js';
	import { pageTitle } from '$lib/statTitle.js';
	import { downloadCsvTable, tableCsv } from '$lib/csvTable.js';
	import { downloadName } from '$lib/statFileName.js';
	import { todayStamp } from '$lib/csv.js';
	import {
		reportHref,
		pickSemester,
		previousSemester,
		mixTable,
		mixSubtitle,
		rankChangeTable,
		firstIdSet,
		loadWithPrevious,
		firstsTable,
		reportRangeText,
		kpiChangeText,
		evennessChangeText
	} from '$lib/semesterReport.js';

	// 한 학기의 결산(클럽 전체). 학기는 URL(semester_id)에 두고, 없으면 가장 최근 학기다.
	// 카드는 따로 불러오고, 실패하면 그 카드에만 오류를 띄운다.
	const initialId = $page.url.searchParams.get('semester_id');

	/** @type {{ id: number, year: number, semester_num: number }[]} */
	let semesters = [];
	let semestersLoaded = false;
	let semestersError = '';
	/** @type {{ id: number, year: number, semester_num: number } | null} */
	let semester = null;
	/** @type {{ id: number, year: number, semester_num: number } | null} */
	let previous = null;

	const getJson = async (endpoint, id, extra = {}) => {
		const params = new URLSearchParams({ semester_id: String(id), ...extra });
		const res = await fetch(`/api/stats/${endpoint}?${params}`);
		if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
		return res.json();
	};
	// 요약·상위 10·시대·장르·처음 튼 작곡가·곡은 지난 학기와 견준다(지난 학기가 없으면 previous 는 null).
	// 지난 학기만 실패하면 이 학기만으로 그리고, KPI 칸 아래 줄(previousFailed)이 그렇다고 알린다.
	// 그 줄의 '다시 시도'(retryPrevious)는 실패한 카드의 지난 학기 쪽만 다시 부른다.
	const withPrevious = async (endpoint, extra = {}) => {
		const before = previous;
		const pair = await loadWithPrevious(
			() => getJson(endpoint, semester.id, extra),
			before && (() => getJson(endpoint, before.id, extra))
		);
		if (pair.previousError) {
			console.error(`학기 결산 지난 학기 로딩 실패 (${endpoint})`, pair.previousError);
		}
		return pair;
	};
	// 지난 학기와 견주는 카드의 요청: [엔드포인트, 덧붙일 인자].
	/** @type {Record<string, [string, Record<string, string>?]>} */
	const compared = {
		summary: ['summary'],
		composers: ['composers', { limit: '10' }],
		soloists: ['soloists', { limit: '10' }],
		works: ['works', { limit: '10' }],
		conductors: ['conductors', { limit: '10' }],
		orchestras: ['orchestras', { limit: '10' }],
		eras: ['eras'],
		genres: ['genres'],
		// 선곡 다양성은 summary 만 쓴다. 월별 버킷이면 쓰지 않는 timeline 이 작다.
		diversity: ['diversity', { bucket: 'month' }],
		firstComposers: ['firsts', { kind: 'composer' }],
		firstWorks: ['firsts', { kind: 'work' }]
	};
	const cardRequests = Object.fromEntries(
		Object.keys(compared).map((key) => [key, () => withPrevious(...compared[key])])
	);
	const CARD_KEYS = Object.keys(cardRequests);

	/** @type {Record<string, any>} */
	let data = {};
	/** @type {Record<string, boolean>} */
	let loading = Object.fromEntries(CARD_KEYS.map((key) => [key, true]));
	/** @type {Record<string, string>} */
	let errors = {};
	$: ({ eras, genres } = data);
	// 처음 튼 작곡가·곡: 이 학기의 목록과, 부제에 개수만 쓰는 지난 학기의 목록.
	$: firstComposers = data.firstComposers?.current;
	$: firstWorks = data.firstWorks?.current;
	$: previousFirstComposers = data.firstComposers?.previous;
	$: previousFirstWorks = data.firstWorks?.previous;
	// 상위 10 은 이 학기의 목록을 그리고, 지난 학기의 목록과 견준 칸을 붙인다(rankChangeTable).
	// 작곡가·곡은 처음 튼 목록이 오면 이 학기에 처음 튼 행을 '첫 선곡'으로 적는다.
	$: composers = data.composers?.current;
	$: soloists = data.soloists?.current;
	$: works = data.works?.current;
	$: conductors = data.conductors?.current;
	$: orchestras = data.orchestras?.current;
	// KPI 칸은 이 학기의 요약, 그 아래 줄은 지난 학기의 요약과 견준다(없거나 실패하면 줄을 뺀다).
	$: summary = data.summary?.current;
	$: previousSummary = data.summary?.previous;
	// 선곡 다양성의 칸: 이 학기와 지난 학기의 다양성 응답의 summary(통계의 칸과 같은 값).
	$: diversity = data.diversity?.current?.summary;
	$: previousDiversity = data.diversity?.previous?.summary;

	// 다른 학기로 바꾸면 이전 학기의 늦은 응답은 버린다.
	let generation = 0;

	function loadCard(key, gen) {
		cardRequests[key]()
			.then((result) => {
				if (gen === generation) data[key] = result;
			})
			.catch((e) => {
				if (gen !== generation) return;
				console.error(`학기 결산 로딩 실패 (${key})`, e);
				errors[key] = '불러오지 못했습니다';
			})
			.finally(() => {
				if (gen === generation) loading[key] = false;
			});
	}

	function loadAll() {
		const gen = ++generation;
		data = {};
		errors = {};
		loading = Object.fromEntries(CARD_KEYS.map((key) => [key, true]));
		for (const key of CARD_KEYS) loadCard(key, gen);
	}

	// '다시 시도': 그 카드만 다시 부른다. generation 은 그대로 두어 다른 카드의 요청을 살리고,
	// 그 사이 학기를 바꾸면(loadAll) 이 요청의 늦은 응답도 버린다.
	// 단추는 사라지므로, 단추에 있던 포커스는 먼저 target(카드의 section, 요약은 KPI 줄)으로 옮긴다.
	let kpiRow;
	function retry(key, e, target) {
		if (document.activeElement === e.currentTarget) target?.focus();
		loading[key] = true;
		errors[key] = '';
		loadCard(key, generation);
	}

	// 지난 학기 쪽만 실패한 카드(학기를 바꾸면 data 와 함께 비워진다). 다시 부르는 동안은 줄에서 뺀다.
	$: previousFailed = Object.keys(compared).filter(
		(key) => data[key]?.previousError && !data[key].retryingPrevious
	);
	// 지난 학기 수치의 '다시 시도': 실패한 카드의 지난 학기만 다시 부르고, 이 학기의 표는 그대로 둔다.
	// 그 사이 학기를 바꾸거나 카드의 '다시 시도'가 새 짝(current)을 받았으면 늦은 응답은 버린다.
	// 부르는 동안 previousError 는 두어, 분포 카드의 부제가 '지난 학기 없음'으로 바뀌지 않게 한다.
	function retryPrevious() {
		kpiRow?.focus();
		for (const key of previousFailed) {
			const gen = generation;
			const before = previous;
			const { current } = data[key];
			const [endpoint, extra] = compared[key];
			const still = () => gen === generation && data[key]?.current === current;
			data[key] = { ...data[key], retryingPrevious: true };
			getJson(endpoint, before.id, extra)
				.then((result) => {
					if (still()) data[key] = { current, previous: result, previousError: null };
				})
				.catch((e) => {
					if (!still()) return;
					console.error(`학기 결산 지난 학기 로딩 실패 (${endpoint})`, e);
					data[key] = { current, previous: null, previousError: e };
				});
		}
	}

	function choose(next) {
		semester = next;
		previous = previousSemester(next, semesters);
		loadAll();
	}

	async function loadSemesters() {
		try {
			const res = await fetch('/api/semester');
			if (!res.ok) throw new Error(`semester ${res.status}`);
			semesters = sortSemesters(await res.json());
		} catch (e) {
			console.error('학기 목록을 불러오지 못했습니다.', e);
			semestersError = '학기 목록을 불러오지 못했습니다.';
		}
		semestersLoaded = true;
		const picked = pickSemester(initialId, semesters);
		if (!picked) return;
		// 링크의 학기가 목록에 없으면 가장 최근 학기를 보이고, URL 에서 그 id 를 뺀다.
		if (initialId != null && String(picked.id) !== initialId) {
			goto(reportHref(null), { replaceState: true, keepFocus: true, noScroll: true });
		}
		choose(picked);
	}

	onMount(loadSemesters);

	// 학기 목록의 '다시 시도': 다시 부르는 동안 포커스는 안내 문구(semestersHint)에 두고,
	// 학기를 고르면 학기 select 로 옮긴다(불러오기 전에는 select 가 꺼져 있어 포커스를 받지 못한다).
	let semestersHint;
	let semesterSelect;
	let semestersRetrying = false;
	async function retrySemesters(e) {
		const hadFocus = document.activeElement === e.currentTarget;
		if (hadFocus) semestersHint?.focus();
		semestersError = '';
		semestersLoaded = false;
		semestersRetrying = true;
		await loadSemesters();
		semestersRetrying = false;
		if (!hadFocus || !semester) return;
		await tick();
		semesterSelect?.focus();
	}

	function onSelect(e) {
		const next = semesters.find((s) => String(s.id) === e.currentTarget.value);
		if (!next || next === semester) return;
		goto(reportHref(next.id), { replaceState: true, keepFocus: true, noScroll: true });
		choose(next);
	}

	$: label = semester ? semesterLabel(semester) : '';
	$: previousLabel = previous ? semesterLabel(previous) : '';
	// 요약을 받기 전(또는 받지 못하면)에는 학기 목록의 연도·학기로 짐작한 날짜(semesterReport.js).
	$: rangeText = reportRangeText(summary, semester);
	const total = (envelope) => (envelope ? `총 ${envelope.total_plays.toLocaleString()}곡` : '');
	const count = (v) => (v == null ? '—' : formatCount(v));
	$: empty = summary && summary.total_plays === 0;

	// 순위 표(상위 10). 작곡가 이름은 이 학기를 고른 작곡가 페이지로, 독주자·지휘자·오케스트라·곡
	// 이름은 이 학기에 그 대상·곡을 튼 선곡 기록으로 간다.
	const linksOf = (envelope, semesterId) =>
		envelope && semesterId
			? envelope.items.map((item) =>
					composerHref(item.id, { period: semesterId, start: '', end: '' })
				)
			: [];
	const workLinksOf = (envelope, semesterId) =>
		envelope && semesterId
			? envelope.items.map((item) => workHistoryHref(item.id, semesterId))
			: [];
	// card: 'soloists' | 'conductors' | 'orchestras' (선곡 기록의 id 필터는 DRILL_CARDS 의 것).
	const performerLinksOf = (card, envelope, semesterId) =>
		envelope && semesterId
			? envelope.items.map((item) =>
					targetHistoryHref(DRILL_CARDS[card].param, item.id, semesterId)
				)
			: [];
	$: semesterId = semester ? String(semester.id) : '';
	// 머리말의 '선곡 기록' 링크와 총 선곡 칸의 숫자: 이 학기의 선곡 목록(통계와 같은 링크).
	// 신청곡 칸의 숫자는 같은 목록에서 신청곡만. 학기가 없으면(목록을 불러오는 중·실패) 링크도 없다.
	$: historyFilter = semester && {
		period: String(semester.id),
		start: '',
		end: '',
		q: '',
		userId: null,
		includeMentees: false,
		requested: ''
	};
	$: kpiLinks = historyFilter
		? {
				total_plays: historyHref(historyFilter),
				requested: historyHref({ ...historyFilter, requested: 'true' })
			}
		: {};
	$: topCards = [
		{
			key: 'composers',
			title: '많이 튼 작곡가',
			table: composers?.labels.length
				? rankChangeTable(
						composers,
						data.composers.previous,
						'작곡가',
						10,
						firstIdSet(firstComposers)
					)
				: null,
			links: linksOf(composers, semesterId)
		},
		{
			key: 'soloists',
			title: '많이 튼 독주자',
			table: soloists?.labels.length
				? rankChangeTable(soloists, data.soloists.previous, '연주자')
				: null,
			links: performerLinksOf('soloists', soloists, semesterId)
		},
		{
			key: 'works',
			title: '많이 튼 곡',
			table: works?.labels.length
				? rankChangeTable(works, data.works.previous, '곡', 10, firstIdSet(firstWorks))
				: null,
			links: workLinksOf(works, semesterId),
			wide: true
		},
		{
			key: 'conductors',
			title: '많이 튼 지휘자',
			table: conductors?.labels.length
				? rankChangeTable(conductors, data.conductors.previous, '지휘자')
				: null,
			links: performerLinksOf('conductors', conductors, semesterId)
		},
		{
			key: 'orchestras',
			title: '많이 튼 오케스트라',
			table: orchestras?.labels.length
				? rankChangeTable(orchestras, data.orchestras.previous, '오케스트라')
				: null,
			links: performerLinksOf('orchestras', orchestras, semesterId)
		}
	];

	// 시대·장르: 작은 도넛(크기 고정, 인쇄에서도 같은 크기)과 지난 학기와 견준 표.
	// 수치는 옆의 표에 있으므로 도넛은 이름표 없이 범례만 둔다.
	const pieOption = (envelope) => {
		const option = eraPieOption(envelope, '', '');
		const [series] = option.series;
		return {
			...option,
			animation: false,
			series: [
				{
					...series,
					center: ['50%', '40%'],
					radius: ['36%', '62%'],
					label: { show: false },
					labelLine: { show: false }
				}
			]
		};
	};
	// 학기 이름은 인자로 받는다: $: 는 함수 안에서 읽는 변수를 따라가지 않는다.
	const mixCard = (key, title, pair, nameHeader, now, before) => ({
		key,
		title,
		pair,
		table: pair?.current.labels.length ? mixTable(pair.current, pair.previous, nameHeader) : null,
		subtitle: mixSubtitle(pair, now, before)
	});
	$: mixCards = [
		mixCard('eras', '시대별 분포', eras, '시대', label, previousLabel),
		mixCard('genres', '장르별 분포', genres, '장르', label, previousLabel)
	];

	// 선곡 다양성: 통계의 시대·장르 다양성 칸과 같은 정수 %와 지난 학기와 견준 줄(%p).
	const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
	const diversityTile = (name, now, before) => ({
		name,
		value: pct(groupEvenness(now)),
		change: evennessChangeText(groupEvenness(now), groupEvenness(before))
	});
	$: diversityTiles = [
		diversityTile('시대 다양성', diversity?.era, previousDiversity?.era),
		diversityTile('장르 다양성', diversity?.genre, previousDiversity?.genre)
	];

	// 처음 튼 작곡가·곡: 클럽 전체에서 처음 튼 날이 이 학기인 것. 부제는 그 개수와, 지난 학기의
	// 같은 목록(before)을 받았으면 그 개수(통계의 부제처럼 '… 18곡 · 지난 학기 12곡').
	const firstsCard = (key, title, firsts, before, nameHeader, unit, semesterId) => ({
		key,
		title,
		table: firsts?.items.length ? firstsTable(firsts, nameHeader) : null,
		links: nameHeader === '작곡가' ? linksOf(firsts, semesterId) : workLinksOf(firsts, semesterId),
		subtitle:
			`클럽에서 이 학기에 처음 튼 ${nameHeader}` +
			(firsts ? ` · ${firsts.items.length.toLocaleString()}${unit}` : '') +
			(firsts && before ? ` · 지난 학기 ${before.items.length.toLocaleString()}${unit}` : '')
	});
	$: firstsCards = [
		firstsCard(
			'firstComposers',
			'처음 튼 작곡가',
			firstComposers,
			previousFirstComposers,
			'작곡가',
			'명',
			semesterId
		),
		firstsCard('firstWorks', '처음 튼 곡', firstWorks, previousFirstWorks, '곡', '곡', semesterId)
	];

	// 'CSV 저장': 카드의 표를 보이는 그대로(횟수만 쉼표 없이) 내려받는다. 파일 이름은 통계처럼
	// 학기결산_2025-2학기_많이 튼 작곡가_20261030.csv.
	function saveCsv(card) {
		if (!card.table) return;
		const { headers, rows } = tableCsv(card.table);
		downloadCsvTable(
			downloadName(['학기결산', label, card.title, todayStamp()], 'csv'),
			headers,
			rows
		);
	}

	const KPIS = [
		['total_plays', '총 선곡'],
		['sessions', '타임'],
		['requested', '신청곡'],
		['composers', '작곡가'],
		['works', '곡'],
		['conductors', '지휘자'],
		['orchestras', '오케스트라']
	];
</script>

<svelte:head>
	<title>{pageTitle(label, '학기 결산')}</title>
</svelte:head>

<div class="report-page">
	<header class="page-header">
		<div class="title-group">
			<h1>학기 결산</h1>
			{#if semester}
				<span class="semester">{label}</span>
				<span class="range">{rangeText}</span>
			{/if}
		</div>
		<div class="controls">
			{#if semester}
				<a class="page-link" href={`/stat?semester_id=${semester.id}`}>통계</a>
				<a class="page-link" href={kpiLinks.total_plays}>선곡 기록</a>
			{:else}
				<a class="page-link" href="/stat">통계</a>
			{/if}
			<select
				aria-label="학기"
				bind:this={semesterSelect}
				value={semester ? String(semester.id) : ''}
				on:change={onSelect}
				disabled={!semester}
			>
				{#each semesters as s}
					<option value={String(s.id)}>{semesterLabel(s)}</option>
				{/each}
			</select>
			<button class="print-btn" on:click={() => window.print()} disabled={!semester}> 인쇄 </button>
		</div>
	</header>

	{#if semestersError || semestersRetrying}
		<div class="empty-hint" class:error={semestersError} tabindex="-1" bind:this={semestersHint}>
			{#if semestersError}
				{semestersError}
				<button class="tool-btn" on:click={retrySemesters} aria-label="학기 목록 다시 시도">
					다시 시도
				</button>
			{:else}
				불러오는 중...
			{/if}
		</div>
	{:else if semestersLoaded && !semester}
		<div class="empty-hint">학기가 없습니다.</div>
	{:else if semester}
		<div class="kpi-row" tabindex="-1" bind:this={kpiRow}>
			<!-- 총 선곡·신청곡의 숫자는 그 선곡의 선곡 기록을 연다(0 이나 '—' 이면 글자 그대로) -->
			{#each KPIS as [key, name]}
				{@const change = kpiChangeText(summary?.[key], previousSummary?.[key])}
				<div class="kpi">
					<div class="kpi-value">
						{#if kpiLinks[key] && summary?.[key] > 0}
							<a
								class="kpi-link"
								href={kpiLinks[key]}
								title="선곡 기록에서 보기"
								aria-label="{name} {count(summary[key])}곡 선곡 기록에서 보기"
								>{count(summary[key])}</a
							>
						{:else}
							{count(summary?.[key])}
						{/if}
					</div>
					<div class="kpi-label">{name}</div>
					{#if change}
						{@const [diff, before] = change.split(' · ')}
						<!-- 좁은 칸(인쇄)에서는 · 뒤에서만 줄을 바꾼다 -->
						<div class="kpi-change">
							<span>{diff} ·</span>
							<span>{before}</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>
		{#if errors.summary}
			<p class="kpi-error">
				요약을 불러오지 못했습니다.
				<button
					class="tool-btn"
					on:click={(e) => retry('summary', e, kpiRow)}
					aria-label="요약 다시 시도"
				>
					다시 시도
				</button>
			</p>
		{/if}
		<!-- 인쇄에서도 문장은 남고(비교가 빠졌다는 것), 단추만 숨는다 -->
		{#if previousFailed.length && previousLabel}
			<p class="kpi-error">
				지난 학기({previousLabel})와 견준 수치를 불러오지 못했습니다.
				<button class="tool-btn" on:click={retryPrevious} aria-label="지난 학기 수치 다시 시도">
					다시 시도
				</button>
			</p>
		{/if}

		{#if empty}
			<div class="empty-hint">이 학기에는 선곡이 없습니다.</div>
		{:else}
			<div class="grid">
				{#each topCards as card}
					<section
						class="card"
						class:wide={card.wide}
						tabindex="-1"
						aria-labelledby={`report-${card.key}`}
					>
						<button
							class="tool-btn csv-btn"
							on:click={() => saveCsv(card)}
							disabled={!!(loading[card.key] || errors[card.key] || !card.table)}
							title="표를 CSV로 저장"
							aria-label={`${card.title} CSV 저장`}
						>
							CSV 저장
						</button>
						<h2 id={`report-${card.key}`}>{card.title}</h2>
						<p class="subtitle" id={`report-${card.key}-sub`}>
							{['상위 10', total(data[card.key]?.current)].filter(Boolean).join(' · ')}
						</p>
						{#if loading[card.key]}
							<div class="placeholder">불러오는 중...</div>
						{:else if errors[card.key]}
							<div class="placeholder error">
								{card.title} — {errors[card.key]}
								<button
									class="tool-btn"
									on:click={(e) => retry(card.key, e, e.currentTarget.closest('section'))}
									aria-label={`${card.title} 다시 시도`}
								>
									다시 시도
								</button>
							</div>
						{:else if !card.table}
							<div class="placeholder">데이터가 없습니다</div>
						{:else}
							<ReportTable
								table={card.table}
								links={card.links}
								labelledby={`report-${card.key}`}
								describedby={`report-${card.key}-sub`}
							/>
						{/if}
					</section>
				{/each}

				{#each mixCards as card}
					<section class="card wide" tabindex="-1" aria-labelledby={`report-${card.key}`}>
						<button
							class="tool-btn csv-btn"
							on:click={() => saveCsv(card)}
							disabled={!!(loading[card.key] || errors[card.key] || !card.table)}
							title="표를 CSV로 저장"
							aria-label={`${card.title} CSV 저장`}
						>
							CSV 저장
						</button>
						<h2 id={`report-${card.key}`}>{card.title}</h2>
						<p class="subtitle" id={`report-${card.key}-sub`}>{card.subtitle}</p>
						{#if loading[card.key]}
							<div class="placeholder">불러오는 중...</div>
						{:else if errors[card.key]}
							<div class="placeholder error">
								{card.title} — {errors[card.key]}
								<button
									class="tool-btn"
									on:click={(e) => retry(card.key, e, e.currentTarget.closest('section'))}
									aria-label={`${card.title} 다시 시도`}
								>
									다시 시도
								</button>
							</div>
						{:else if !card.table}
							<div class="placeholder">데이터가 없습니다</div>
						{:else}
							<div class="mix">
								<!-- 같은 수치가 옆의 표에 있다 -->
								<div class="pie" aria-hidden="true">
									<EChart option={pieOption(card.pair.current)} />
								</div>
								<div class="mix-table">
									<ReportTable
										table={card.table}
										labelledby={`report-${card.key}`}
										describedby={`report-${card.key}-sub`}
									/>
								</div>
							</div>
						{/if}
					</section>
				{/each}

				<!-- 위의 두 분포를 한 숫자로: 통계의 선곡 다양성 칸(고유 곡 수는 위의 곡 칸과 같아 뺀다) -->
				<section class="card wide" tabindex="-1" aria-labelledby="report-diversity">
					<h2 id="report-diversity">선곡 다양성</h2>
					<p class="subtitle">0%=편중 · 100%=고름 (가능한 모든 시대·장르를 고르게 틀수록 100%)</p>
					{#if loading.diversity}
						<div class="placeholder">불러오는 중...</div>
					{:else if errors.diversity}
						<div class="placeholder error">
							선곡 다양성 — {errors.diversity}
							<button
								class="tool-btn"
								on:click={(e) => retry('diversity', e, e.currentTarget.closest('section'))}
								aria-label="선곡 다양성 다시 시도"
							>
								다시 시도
							</button>
						</div>
					{:else}
						<div class="kpi-row diversity-row">
							{#each diversityTiles as tile}
								<div class="kpi">
									<div class="kpi-value">{tile.value}</div>
									<div class="kpi-label">{tile.name}</div>
									{#if tile.change}
										{@const [diff, before] = tile.change.split(' · ')}
										<div class="kpi-change">
											<span>{diff} ·</span>
											<span>{before}</span>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</section>

				{#each firstsCards as card}
					<section class="card wide breakable" tabindex="-1" aria-labelledby={`report-${card.key}`}>
						<button
							class="tool-btn csv-btn"
							on:click={() => saveCsv(card)}
							disabled={!!(loading[card.key] || errors[card.key] || !card.table)}
							title="표를 CSV로 저장"
							aria-label={`${card.title} CSV 저장`}
						>
							CSV 저장
						</button>
						<h2 id={`report-${card.key}`}>{card.title}</h2>
						<p class="subtitle" id={`report-${card.key}-sub`}>{card.subtitle}</p>
						{#if loading[card.key]}
							<div class="placeholder">불러오는 중...</div>
						{:else if errors[card.key]}
							<div class="placeholder error">
								{card.title} — {errors[card.key]}
								<button
									class="tool-btn"
									on:click={(e) => retry(card.key, e, e.currentTarget.closest('section'))}
									aria-label={`${card.title} 다시 시도`}
								>
									다시 시도
								</button>
							</div>
						{:else if !card.table}
							<div class="placeholder">없습니다</div>
						{:else}
							<ReportTable
								table={card.table}
								links={card.links}
								labelledby={`report-${card.key}`}
								describedby={`report-${card.key}-sub`}
							/>
						{/if}
					</section>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	/* 통계 페이지와 같은 여백·머리말·KPI·카드 */
	.report-page {
		padding: 24px 32px;
		width: 100%;
		box-sizing: border-box;
	}
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
	}
	.title-group {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	h1 {
		font-family: var(--xlarge-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--xlarge-font-size, 32px);
		font-weight: var(--xlarge-font-weight, 500);
		color: var(--gray-gray-950, #1a1a1a);
		margin: 0;
	}
	.semester {
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
		font-weight: 700;
		color: var(--primary-primary-800, #6a5134);
	}
	.range {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.page-link {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		text-underline-offset: 3px;
	}
	/* 통계의 기간 select(PeriodSelect)·전체/개인 단추(ScopeToggle)와 같은 모양 */
	select {
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
		padding: 6px 10px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		background: var(--secondary-secondary-50, #fffdfc);
		color: var(--gray-gray-950, #1a1a1a);
	}
	.print-btn {
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
		padding: 6px 18px;
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 6px;
		background: var(--secondary-secondary-50, #fffdfc);
		color: var(--primary-primary-800, #6a5134);
		cursor: pointer;
	}
	.print-btn:disabled {
		color: var(--gray-gray-500);
		border-color: var(--gray-gray-400);
		cursor: default;
	}
	.empty-hint {
		text-align: center;
		padding: 80px 0;
		color: var(--gray-gray-500, #9f9f9f);
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
	}
	.empty-hint.error,
	.placeholder.error,
	.kpi-error {
		color: var(--secondary-secondary-800, #95560d);
	}
	/* 다른 통계 페이지(SpellingVariants.svelte)의 단추와 같은 모양 */
	.tool-btn {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		background: var(--secondary-secondary-100, #fef9f3);
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 4px;
		padding: 4px 12px;
		cursor: pointer;
	}
	.tool-btn:hover:not(:disabled) {
		background: var(--secondary-secondary-200, #fdf1e4);
	}
	.tool-btn:disabled {
		color: var(--gray-gray-500);
		border-color: var(--gray-gray-400);
		background: var(--secondary-secondary-50);
		cursor: default;
	}
	.empty-hint .tool-btn,
	.kpi-error .tool-btn {
		margin-left: 8px;
	}
	.kpi-row {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 12px;
		margin-bottom: 20px;
	}
	.kpi {
		background: var(--secondary-secondary-100, #fef9f3);
		border: 1px solid var(--gray-gray-300, #d4d4d4);
		border-radius: 8px;
		padding: 14px 10px;
		text-align: center;
	}
	.kpi-value {
		font-family: var(--large-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--large-font-size, 24px);
		font-weight: 700;
		color: var(--primary-primary-800, #6a5134);
	}
	/* 통계의 KPI 칸처럼 밑줄은 가리키거나 키보드로 고를 때만 */
	.kpi-link {
		color: inherit;
		text-decoration: none;
		text-underline-offset: 3px;
	}
	.kpi-link:hover,
	.kpi-link:focus-visible {
		text-decoration: underline;
	}
	.kpi-label {
		margin-top: 4px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	.kpi-change {
		margin-top: 2px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: 12px;
		color: var(--gray-gray-600, #7c7c7c);
	}
	.kpi-change span {
		white-space: nowrap;
	}
	.diversity-row {
		grid-template-columns: repeat(2, 1fr);
		margin-bottom: 0;
	}
	.kpi-error {
		margin: -8px 0 16px;
		text-align: center;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}
	/* ChartCard 와 같은 카드 */
	.card {
		background: var(--secondary-secondary-50, #fffdfc);
		border: 1px solid var(--gray-gray-300, #d4d4d4);
		border-radius: 8px;
		box-shadow: 4px 4px 5px 0px rgba(0, 0, 0, 0.08);
		padding: 12px;
		min-width: 0;
		position: relative;
	}
	.card.wide {
		grid-column: span 2;
	}
	/* ChartCard 의 저장 단추와 같은 자리·크기(카드 오른쪽 위) */
	.csv-btn {
		position: absolute;
		top: 12px;
		right: 12px;
		padding: 3px 8px;
	}
	/* 차트 제목·부제(chartOptions.js 의 titleBlock)와 같은 글꼴·색 */
	h2 {
		margin: 2px 0 0;
		text-align: center;
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: 18px;
		font-weight: 700;
		color: var(--gray-gray-950, #1a1a1a);
	}
	.subtitle {
		margin: 4px 0 12px;
		text-align: center;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: 12px;
		color: var(--gray-gray-600, #7c7c7c);
	}
	.placeholder {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: center;
		justify-content: center;
		height: 120px;
		color: var(--gray-gray-500, #9f9f9f);
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
	}
	.mix {
		display: flex;
		align-items: flex-start;
		gap: 16px;
	}
	/* 화면과 인쇄에서 같은 크기: 인쇄할 때 캔버스를 다시 그릴 필요가 없다 */
	.pie {
		flex: none;
		width: 240px;
		height: 240px;
	}
	.pie :global(.echart) {
		min-height: 0;
	}
	.mix-table {
		flex: 1;
		min-width: 0;
	}

	@page {
		size: A4;
		margin: 12mm;
	}
	@media print {
		/* 사이드바·레이아웃의 규칙은 컴포넌트 범위(.side-bar.svelte-…)라 !important 로 이긴다 */
		:global(.side-bar) {
			display: none !important;
		}
		:global(html),
		:global(body),
		:global(.screen),
		:global(.app) {
			min-width: 0 !important;
		}
		.report-page {
			padding: 0;
		}
		.controls,
		.tool-btn {
			display: none;
		}
		.card {
			box-shadow: none;
			break-inside: avoid;
		}
		.card.breakable {
			break-inside: auto;
		}
		.kpi-row {
			gap: 6px;
		}
		.kpi {
			padding: 10px 4px;
		}
		.kpi-value {
			font-size: 20px;
		}
	}
</style>
