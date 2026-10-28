<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { afterNavigate, goto } from '$app/navigation';
	import ChartCard from '$lib/components/stat/ChartCard.svelte';
	import DataTable from '$lib/components/stat/DataTable.svelte';
	import { horizontalBarOption, countBarOption } from '$lib/chartOptions.js';
	import { rankTable } from '$lib/statTable.js';
	import { WORKS_LIMIT, barItemIndex } from '$lib/statDrill.js';
	import { pageTitle } from '$lib/statTitle.js';
	import { workHistoryHref } from '$lib/playHistory.js';
	import {
		readComposerId,
		composerHistoryHref,
		composerRankLinks,
		composerSemesterLinks,
		composerFacts,
		semesterSeries,
		composerWorksTable
	} from '$lib/composerStats.js';

	// 작곡가 한 명의 전체 기록(기간 없음). 카드는 따로 불러오고, 실패하면 그 카드에만 오류를 띄운다.
	$: composerId = readComposerId($page.params.id);

	const getJson = async (endpoint, id, extra = {}) => {
		const params = new URLSearchParams({ composer_id: id, ...extra });
		const res = await fetch(`/api/stats/${endpoint}?${params}`);
		if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
		return res.json();
	};
	const cardRequests = {
		summary: (id) => getJson('summary', id),
		timeline: (id) => getJson('timeline', id, { bucket: 'semester' }),
		works: (id) => getJson('works', id, { limit: String(WORKS_LIMIT) }),
		soloists: (id) => getJson('soloists', id, { limit: '10' }),
		conductors: (id) => getJson('conductors', id, { limit: '10' })
	};
	const CARD_KEYS = Object.keys(cardRequests);

	let composer = null; // composers/<id>/: 이름, 출생 연도, 시대
	let notFound = false;
	let composerError = '';
	/** @type {Record<string, any>} */
	let data = {};
	/** @type {Record<string, boolean>} */
	let loading = Object.fromEntries(CARD_KEYS.map((key) => [key, true]));
	/** @type {Record<string, string>} */
	let errors = {};
	$: ({ summary, timeline, works, soloists, conductors } = data);

	// 다른 작곡가로 옮겨 가면 이전 작곡가의 늦은 응답은 버린다.
	let generation = 0;

	async function loadComposer(id, gen) {
		try {
			const res = await fetch(`/api/composers/${id}`);
			if (gen !== generation) return;
			if (res.status === 404) {
				notFound = true;
				return;
			}
			if (!res.ok) throw new Error(`composers ${res.status}`);
			const result = await res.json();
			if (gen === generation) composer = result;
		} catch (e) {
			if (gen !== generation) return;
			console.error('작곡가 로딩 실패', e);
			composerError = '작곡가 정보를 불러오지 못했습니다.';
		}
	}

	function loadAll() {
		const id = readComposerId($page.params.id);
		const gen = ++generation;
		composer = null;
		notFound = !id;
		composerError = '';
		data = {};
		errors = {};
		loading = Object.fromEntries(CARD_KEYS.map((key) => [key, Boolean(id)]));
		if (!id) return;
		loadComposer(id, gen);
		for (const key of CARD_KEYS) {
			cardRequests[key](id)
				.then((result) => {
					if (gen === generation) data[key] = result;
				})
				.catch((e) => {
					if (gen !== generation) return;
					console.error(`작곡가 통계 로딩 실패 (${key})`, e);
					errors[key] = '불러오지 못했습니다';
				})
				.finally(() => {
					if (gen === generation) loading[key] = false;
				});
		}
	}
	// 처음 열 때와, 같은 페이지에서 다른 작곡가로 옮겨 갈 때.
	afterNavigate(loadAll);

	// 학기별 선곡의 학기를 그 학기(semester_id)로 열기 위한 학기 목록. 못 받으면 날짜로 연다.
	let semesters = [];
	onMount(async () => {
		try {
			const res = await fetch('/api/semester');
			if (!res.ok) throw new Error(`semester ${res.status}`);
			semesters = await res.json();
		} catch (e) {
			console.error('학기 목록 로딩 실패', e);
		}
	});

	$: title = composer ? composer.name : composerError ? `작곡가 #${composerId}` : '작곡가';
	// 내려받는 파일 이름에 작곡가를 넣는다(이름을 못 받았으면 '작곡가 #id').
	$: fileTag = composer ? composer.name : `작곡가 #${composerId}`;
	$: subtitleFor = (envelope) =>
		envelope ? `전체 기간 · 총 ${envelope.total_plays.toLocaleString()}곡` : '';
	$: timelineData = semesterSeries(timeline);
	$: timelineOpt =
		timelineData && countBarOption(timelineData, '학기별 선곡', subtitleFor(timeline));
	$: soloistOpt =
		soloists && horizontalBarOption(soloists, '많이 튼 독주자', subtitleFor(soloists));
	$: conductorOpt =
		conductors && horizontalBarOption(conductors, '많이 튼 지휘자', subtitleFor(conductors));
	$: worksTable = works && works.items.length > 0 && composerWorksTable(works, composer);
	// 곡 이름은 그 곡의 선곡 기록(전체 기간)으로 간다.
	$: worksLinks = works ? works.items.map((item) => workHistoryHref(item.id)) : [];
	// 독주자·지휘자는 이 작곡가의 곡을 그 사람과 튼 선곡 기록으로 간다(표의 이름, 차트의 막대).
	$: soloistLinks = composerRankLinks(composerId, 'soloists', soloists);
	$: conductorLinks = composerRankLinks(composerId, 'conductors', conductors);
	// 학기는 그 학기에 이 작곡가의 곡을 튼 선곡 기록으로 간다.
	$: semesterLinks = composerSemesterLinks(composerId, timeline, semesters);
	// 막대의 dataIndex 는 뒤집힌 순서다(horizontalBarOption). 학기별 선곡은 뒤집지 않는다.
	function openBar(links, e, reversed = true) {
		const i = e.detail.dataIndex;
		const href = links[reversed ? barItemIndex(i, links.length) : i];
		if (href) goto(href);
	}
	$: worksSubtitle = works
		? subtitleFor(works) + (works.items.length >= WORKS_LIMIT ? ` · 상위 ${WORKS_LIMIT}곡` : '')
		: '';
	$: count = (v) => (v == null ? '—' : v.toLocaleString());
</script>

<svelte:head>
	<title>{pageTitle(composer?.name, '작곡가')}</title>
</svelte:head>

<div class="composer-page">
	<header class="page-header">
		<div class="title-group">
			<h1>{title}</h1>
			{#if composer}
				<span class="facts">{composerFacts(composer)}</span>
			{/if}
			<a class="page-link" href="/stat">통계</a>
			{#if composerId && !notFound}
				<a class="page-link" href={composerHistoryHref(composerId)}>선곡 기록</a>
			{/if}
		</div>
	</header>

	{#if !composerId || notFound}
		<div class="empty-hint">작곡가를 찾을 수 없습니다.</div>
	{:else}
		{#if composerError}
			<p class="kpi-error">{composerError}</p>
		{/if}
		<div class="kpi-row">
			<div class="kpi">
				<div class="kpi-value">{count(summary?.total_plays)}</div>
				<div class="kpi-label">총 선곡</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{count(summary?.sessions)}</div>
				<div class="kpi-label">타임</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{count(summary?.works)}</div>
				<div class="kpi-label">곡</div>
			</div>
			<div class="kpi">
				<div class="kpi-value small">{summary?.date_start ?? '—'}</div>
				<div class="kpi-label">처음 튼 날</div>
			</div>
			<div class="kpi">
				<div class="kpi-value small">{summary?.date_end ?? '—'}</div>
				<div class="kpi-label">마지막으로 튼 날</div>
			</div>
		</div>
		{#if errors.summary}
			<p class="kpi-error">요약을 불러오지 못했습니다.</p>
		{/if}

		{#if summary && summary.total_plays === 0}
			<div class="empty-hint">아직 이 작곡가의 곡을 튼 적이 없습니다.</div>
		{:else}
			<div class="chart-grid">
				<ChartCard
					title="학기별 선곡"
					option={timelineOpt}
					data={timelineData}
					loading={loading.timeline}
					error={errors.timeline}
					{fileTag}
					links={semesterLinks}
					on:itemclick={(e) => openBar(semesterLinks, e, false)}
					csvHeaders={['학기', '횟수']}
				/>
				<!-- 곡은 처음·마지막 날짜까지 보이도록 차트 없이 표로만 -->
				<section class="card" aria-label="많이 튼 곡">
					{#if loading.works}
						<div class="placeholder">불러오는 중...</div>
					{:else if errors.works}
						<div class="placeholder error">많이 튼 곡 — {errors.works}</div>
					{:else if !worksTable}
						<div class="placeholder">데이터가 없습니다</div>
					{:else}
						<DataTable
							table={worksTable}
							title="많이 튼 곡"
							subtitle={worksSubtitle}
							links={worksLinks}
						/>
					{/if}
				</section>
				<ChartCard
					title="많이 튼 독주자"
					option={soloistOpt}
					data={soloists}
					loading={loading.soloists}
					error={errors.soloists}
					{fileTag}
					table={soloists && rankTable(soloists, '연주자')}
					links={soloistLinks}
					on:itemclick={(e) => openBar(soloistLinks, e)}
					csvHeaders={['연주자', '횟수']}
				/>
				<ChartCard
					title="많이 튼 지휘자"
					option={conductorOpt}
					data={conductors}
					loading={loading.conductors}
					error={errors.conductors}
					{fileTag}
					table={conductors && rankTable(conductors, '지휘자')}
					links={conductorLinks}
					on:itemclick={(e) => openBar(conductorLinks, e)}
					csvHeaders={['지휘자', '횟수']}
				/>
			</div>
		{/if}
	{/if}
</div>

<style>
	/* 통계 페이지와 같은 여백·머리말·KPI·카드 */
	.composer-page {
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
	.facts {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	.page-link {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		text-underline-offset: 3px;
	}
	.empty-hint {
		text-align: center;
		padding: 80px 0;
		color: var(--gray-gray-500, #9f9f9f);
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
	}
	.kpi-row {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
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
	/* 날짜는 작은 글씨로, 타일 높이가 숫자 타일과 같도록 줄 높이를 맞춘다 */
	.kpi-value.small {
		font-size: var(--medium-font-size, 16px);
		line-height: var(--large-font-size, 24px);
		padding: 4px 0;
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
		color: var(--secondary-secondary-800, #95560d);
	}
	.chart-grid {
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
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 340px;
		color: var(--gray-gray-500, #9f9f9f);
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
	}
	.placeholder.error {
		color: var(--secondary-secondary-800, #95560d);
	}
</style>
