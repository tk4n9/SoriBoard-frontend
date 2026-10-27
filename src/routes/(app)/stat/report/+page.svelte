<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import EChart from '$lib/components/stat/EChart.svelte';
	import ReportTable from '$lib/components/stat/ReportTable.svelte';
	import { eraPieOption } from '$lib/chartOptions.js';
	import { rankTable, formatCount } from '$lib/statTable.js';
	import { sortSemesters, semesterLabel, periodRangeText } from '$lib/statPeriod.js';
	import { composerHref } from '$lib/composerStats.js';
	import { workHistoryHref, targetHistoryHref } from '$lib/playHistory.js';
	import { DRILL_CARDS } from '$lib/statDrill.js';
	import { pageTitle } from '$lib/statTitle.js';
	import {
		reportHref,
		pickSemester,
		previousSemester,
		mixTable,
		firstsTable
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
	// 시대·장르는 지난 학기와 견준다(지난 학기가 없으면 previous 는 null).
	const withPrevious = async (endpoint) => {
		const [now, before] = await Promise.all([
			getJson(endpoint, semester.id),
			previous ? getJson(endpoint, previous.id) : null
		]);
		return { current: now, previous: before };
	};
	const cardRequests = {
		summary: () => getJson('summary', semester.id),
		composers: () => getJson('composers', semester.id, { limit: '10' }),
		soloists: () => getJson('soloists', semester.id, { limit: '10' }),
		works: () => getJson('works', semester.id, { limit: '10' }),
		eras: () => withPrevious('eras'),
		genres: () => withPrevious('genres'),
		firstComposers: () => getJson('firsts', semester.id, { kind: 'composer' }),
		firstWorks: () => getJson('firsts', semester.id, { kind: 'work' })
	};
	const CARD_KEYS = Object.keys(cardRequests);

	/** @type {Record<string, any>} */
	let data = {};
	/** @type {Record<string, boolean>} */
	let loading = Object.fromEntries(CARD_KEYS.map((key) => [key, true]));
	/** @type {Record<string, string>} */
	let errors = {};
	$: ({ summary, composers, soloists, works, eras, genres, firstComposers, firstWorks } = data);

	// 다른 학기로 바꾸면 이전 학기의 늦은 응답은 버린다.
	let generation = 0;

	function loadAll() {
		const gen = ++generation;
		data = {};
		errors = {};
		loading = Object.fromEntries(CARD_KEYS.map((key) => [key, true]));
		for (const key of CARD_KEYS) {
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
	}

	function choose(next) {
		semester = next;
		previous = previousSemester(next, semesters);
		loadAll();
	}

	onMount(async () => {
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
	});

	function onSelect(e) {
		const next = semesters.find((s) => String(s.id) === e.currentTarget.value);
		if (!next || next === semester) return;
		goto(reportHref(next.id), { replaceState: true, keepFocus: true, noScroll: true });
		choose(next);
	}

	$: label = semester ? semesterLabel(semester) : '';
	$: previousLabel = previous ? semesterLabel(previous) : '';
	$: rangeText = summary ? periodRangeText(summary.filters) : '';
	const total = (envelope) => (envelope ? `총 ${envelope.total_plays.toLocaleString()}곡` : '');
	const count = (v) => (v == null ? '—' : formatCount(v));
	$: empty = summary && summary.total_plays === 0;

	// 순위 표(상위 10). 작곡가 이름은 작곡가 페이지로, 독주자·곡 이름은 이 학기에 그 독주자·곡을 튼
	// 선곡 기록으로 간다.
	const linksOf = (envelope) =>
		envelope ? envelope.items.map((item) => composerHref(item.id)) : [];
	const workLinksOf = (envelope, semesterId) =>
		envelope && semesterId
			? envelope.items.map((item) => workHistoryHref(item.id, semesterId))
			: [];
	const soloistLinksOf = (envelope, semesterId) =>
		envelope && semesterId
			? envelope.items.map((item) =>
					targetHistoryHref(DRILL_CARDS.soloists.param, item.id, semesterId)
				)
			: [];
	$: semesterId = semester ? String(semester.id) : '';
	$: topCards = [
		{
			key: 'composers',
			title: '많이 튼 작곡가',
			table: composers?.labels.length ? rankTable(composers, '작곡가') : null,
			links: linksOf(composers)
		},
		{
			key: 'soloists',
			title: '많이 튼 독주자',
			table: soloists?.labels.length ? rankTable(soloists, '연주자') : null,
			links: soloistLinksOf(soloists, semesterId)
		},
		{
			key: 'works',
			title: '많이 튼 곡',
			table: works?.labels.length ? rankTable(works, '곡') : null,
			links: workLinksOf(works, semesterId),
			wide: true
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
		subtitle: pair
			? `${now} ${total(pair.current)}` +
				(pair.previous ? ` · 지난 학기(${before}) ${total(pair.previous)}` : ' · 지난 학기 없음')
			: ''
	});
	$: mixCards = [
		mixCard('eras', '시대별 분포', eras, '시대', label, previousLabel),
		mixCard('genres', '장르별 분포', genres, '장르', label, previousLabel)
	];

	// 처음 튼 작곡가·곡: 클럽 전체에서 처음 튼 날이 이 학기인 것.
	const firstsCard = (key, title, firsts, nameHeader, unit, semesterId) => ({
		key,
		title,
		table: firsts?.items.length ? firstsTable(firsts, nameHeader) : null,
		links: nameHeader === '작곡가' ? linksOf(firsts) : workLinksOf(firsts, semesterId),
		subtitle:
			`클럽에서 이 학기에 처음 튼 ${nameHeader}` +
			(firsts ? ` · ${firsts.items.length.toLocaleString()}${unit}` : '')
	});
	$: firstsCards = [
		firstsCard('firstComposers', '처음 튼 작곡가', firstComposers, '작곡가', '명'),
		firstsCard('firstWorks', '처음 튼 곡', firstWorks, '곡', '곡', semesterId)
	];

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
			{:else}
				<a class="page-link" href="/stat">통계</a>
			{/if}
			<select
				aria-label="학기"
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

	{#if semestersError}
		<div class="empty-hint error">{semestersError}</div>
	{:else if semestersLoaded && !semester}
		<div class="empty-hint">학기가 없습니다.</div>
	{:else if semester}
		<div class="kpi-row">
			{#each KPIS as [key, name]}
				<div class="kpi">
					<div class="kpi-value">{count(summary?.[key])}</div>
					<div class="kpi-label">{name}</div>
				</div>
			{/each}
		</div>
		{#if errors.summary}
			<p class="kpi-error">요약을 불러오지 못했습니다.</p>
		{/if}

		{#if empty}
			<div class="empty-hint">이 학기에는 선곡이 없습니다.</div>
		{:else}
			<div class="grid">
				{#each topCards as card}
					<section class="card" class:wide={card.wide} aria-labelledby={`report-${card.key}`}>
						<h2 id={`report-${card.key}`}>{card.title}</h2>
						<p class="subtitle">상위 10 · {total(data[card.key])}</p>
						{#if loading[card.key]}
							<div class="placeholder">불러오는 중...</div>
						{:else if errors[card.key]}
							<div class="placeholder error">{card.title} — {errors[card.key]}</div>
						{:else if !card.table}
							<div class="placeholder">데이터가 없습니다</div>
						{:else}
							<ReportTable
								table={card.table}
								links={card.links}
								labelledby={`report-${card.key}`}
							/>
						{/if}
					</section>
				{/each}

				{#each mixCards as card}
					<section class="card wide" aria-labelledby={`report-${card.key}`}>
						<h2 id={`report-${card.key}`}>{card.title}</h2>
						<p class="subtitle">{card.subtitle}</p>
						{#if loading[card.key]}
							<div class="placeholder">불러오는 중...</div>
						{:else if errors[card.key]}
							<div class="placeholder error">{card.title} — {errors[card.key]}</div>
						{:else if !card.table}
							<div class="placeholder">데이터가 없습니다</div>
						{:else}
							<div class="mix">
								<!-- 같은 수치가 옆의 표에 있다 -->
								<div class="pie" aria-hidden="true">
									<EChart option={pieOption(card.pair.current)} />
								</div>
								<div class="mix-table">
									<ReportTable table={card.table} labelledby={`report-${card.key}`} />
								</div>
							</div>
						{/if}
					</section>
				{/each}

				{#each firstsCards as card}
					<section class="card wide breakable" aria-labelledby={`report-${card.key}`}>
						<h2 id={`report-${card.key}`}>{card.title}</h2>
						<p class="subtitle">{card.subtitle}</p>
						{#if loading[card.key]}
							<div class="placeholder">불러오는 중...</div>
						{:else if errors[card.key]}
							<div class="placeholder error">{card.title} — {errors[card.key]}</div>
						{:else if !card.table}
							<div class="placeholder">없습니다</div>
						{:else}
							<ReportTable
								table={card.table}
								links={card.links}
								labelledby={`report-${card.key}`}
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
	.kpi-label {
		margin-top: 4px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
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
	}
	.card.wide {
		grid-column: span 2;
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
		.controls {
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
