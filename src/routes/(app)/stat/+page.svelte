<script>
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import ChartCard from '$lib/components/stat/ChartCard.svelte';
	import ScopeToggle from '$lib/components/stat/ScopeToggle.svelte';
	import MemberSelect from '$lib/components/stat/MemberSelect.svelte';
	import PeriodSelect from '$lib/components/stat/PeriodSelect.svelte';
	import DrillPanel from '$lib/components/stat/DrillPanel.svelte';
	import {
		horizontalBarOption,
		timelineOption,
		eraPieOption,
		countBarOption,
		diversityLineOption
	} from '$lib/chartOptions.js';
	import { readStatQuery, statQueryHref } from '$lib/statQuery.js';
	import { createLatestRequests } from '$lib/latestRequest.js';
	import { requestGroups, genreDistribution } from '$lib/statCards.js';
	import {
		chooseTimelineBucket,
		timelineBucketName,
		timelineView,
		readDiversityBucket,
		writeDiversityBucket
	} from '$lib/statBucket.js';
	import {
		rankTable,
		shareTable,
		seriesTable,
		formatEvenness,
		groupEvenness
	} from '$lib/statTable.js';
	import { seriesCsv } from '$lib/csvTable.js';
	import {
		barItemIndex,
		drillTarget,
		drillParams,
		readDrillQuery,
		writeDrillQuery,
		drillItemIndex
	} from '$lib/statDrill.js';
	import {
		CURRENT,
		ALL,
		CUSTOM,
		readStatPeriod,
		readStatRange,
		writeStatPeriod,
		periodRangeText,
		currentSemesterRange
	} from '$lib/statPeriod.js';
	import { historyHref, drillWorkTargets } from '$lib/playHistory.js';
	import { composerHref } from '$lib/composerStats.js';
	import { reportHref } from '$lib/semesterReport.js';
	import { memberFileText } from '$lib/statFileName.js';

	// 범위·지기·견습 포함·기간·주별/월별·열린 drill-down 패널은 URL에도 둔다(링크로 같은 보기를 연다). 페이지가 시작될 때 한 번만 읽는다.
	const initial = readStatQuery($page.url.searchParams);
	let scope = initial.scope;
	let userId = initial.userId;
	let includeMentees = initial.includeMentees;
	let period = readStatPeriod($page.url.searchParams); // 'current' | 'all' | 'custom' | 학기 id
	// 직접 지정 범위(YYYY-MM-DD, 빈 값 = 그쪽이 열림).
	let { start: customStart, end: customEnd } =
		period === CUSTOM ? readStatRange($page.url.searchParams) : { start: '', end: '' };

	// 보기가 바뀌면 URL을 바꾼다. 히스토리를 쌓지 않고, 포커스·스크롤도 그대로 둔다.
	function syncUrl() {
		const url = new URL($page.url);
		writeStatPeriod(url.searchParams, period, { start: customStart, end: customEnd });
		writeDiversityBucket(url.searchParams, diversityBucket);
		writeDrillQuery(url.searchParams, drill ?? linkedDrill);
		goto(statQueryHref(url, { scope, userId, includeMentees }), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	// 기본 기간 = 가장 최근 학기의 시작일부터 오늘까지(선곡 기록과 같은 규칙, statPeriod.js).
	let { start: startDate, end: endDate } = currentSemesterRange();

	let diversityBucket = readDiversityBucket($page.url.searchParams); // 'week' | 'month'
	// 기간별 선곡 추이의 단위: 한 학기를 넘으면 학기별, 아니면 토글이 보이지 않는 쪽(statBucket.js).
	const nextTimelineBucket = () =>
		chooseTimelineBucket(
			period === CUSTOM
				? { period, start: customStart, end: customEnd }
				: { period, start: startDate, end: endDate },
			diversityBucket,
			endDate
		);
	let timelineBucket = nextTimelineBucket();
	// 백엔드가 적용했다고 돌려준 기간(filters). 기간이 바뀔 때만 비운다.
	let appliedFilters = null;

	// 현재 필터를 쿼리스트링으로.
	function buildQuery(extra = {}) {
		const params = new URLSearchParams();
		if (period === CURRENT) {
			if (startDate) params.set('start', startDate);
			if (endDate) params.set('end', endDate);
		} else if (period === CUSTOM) {
			if (customStart) params.set('start', customStart);
			if (customEnd) params.set('end', customEnd);
		} else if (period !== ALL) {
			params.set('semester_id', period);
		}
		if (scope === 'individual' && userId) {
			params.set('user_id', userId);
			if (includeMentees) params.set('include_mentees', 'true');
		}
		for (const [k, v] of Object.entries(extra)) params.set(k, v);
		const s = params.toString();
		return s ? `?${s}` : '';
	}

	async function getJson(endpoint, extra) {
		const res = await fetch(`/api/stats/${endpoint}${buildQuery(extra)}`);
		if (!res.ok) throw new Error(`${endpoint} 실패`);
		return res.json();
	}

	// 카드는 따로 불러오고, 실패하면 그 카드에만 오류를 띄운다. 요청 하나가 여러 카드를 그릴 수 있다:
	// 장르별 분포는 따로 부르지 않고 다양성 응답으로 그린다(statCards.js).
	const cardRequests = {
		summary: () => getJson('summary'),
		composers: () => getJson('composers', { limit: 12 }),
		soloists: () => getJson('soloists', { limit: 12 }),
		conductors: () => getJson('conductors', { limit: 10 }),
		orchestras: () => getJson('orchestras', { limit: 10 }),
		timeline: () => getJson('timeline', { bucket: timelineBucket }),
		eras: () => getJson('eras'),
		diversity: () => getJson('diversity', { bucket: diversityBucket })
	};
	// 다른 카드의 응답에서 꺼내 그리는 카드.
	const pickCard = { genres: genreDistribution };
	const CARD_KEYS = [...Object.keys(cardRequests), ...Object.keys(pickCard)];

	/** @type {Record<string, any>} */
	let data = {};
	/** @type {Record<string, boolean>} */
	let loading = Object.fromEntries(CARD_KEYS.map((key) => [key, true]));
	/** @type {Record<string, string>} */
	let errors = {};
	$: ({ summary, composers, soloists, conductors, orchestras, timeline, eras, genres, diversity } =
		data);

	// 카드마다 자기를 덮는 가장 최근 요청의 응답만 반영한다. 늦게 도착한 이전 요청의 응답은 버린다.
	const requests = createLatestRequests();

	async function load(keys) {
		// 개인 범위인데 지기 미선택이면 로드 보류.
		if (scope === 'individual' && !userId) return;
		const id = requests.begin(keys);
		for (const key of keys) {
			// 불러오는 동안(그리고 실패한 뒤) 이전 필터의 수치가 새 필터의 이름으로 남아 보이지 않도록 비운다.
			data[key] = null;
			loading[key] = true;
			errors[key] = '';
		}
		await Promise.allSettled(
			requestGroups(keys).map(async ([request, cards]) => {
				// 주별/월별로 다양성만 다시 부르면 장르 카드는 덮이지 않으므로, 진행 중인 전체 로드의
				// 다양성 응답이 장르 카드를 채운다(summary 는 버킷과 무관하다).
				const latest = () => cards.filter((key) => requests.isLatest(key, id));
				try {
					const result = await cardRequests[request]();
					for (const key of latest()) {
						data[key] = pickCard[key] ? pickCard[key](result) : result;
						// 모든 통계 응답이 적용된 기간(filters)을 돌려준다.
						appliedFilters = result.filters;
						openLinkedDrill(key);
					}
				} catch (e) {
					const failed = latest();
					if (failed.length) console.error(`통계 로딩 실패 (${request})`, e);
					for (const key of failed) errors[key] = '불러오지 못했습니다';
				} finally {
					for (const key of latest()) loading[key] = false;
				}
			})
		);
	}
	const loadAll = () => {
		timelineBucket = nextTimelineBucket();
		loadDrill();
		return load(CARD_KEYS);
	};

	// drill-down: 순위 카드의 막대나 표의 행 → 그 대상의 곡(같은 기간·범위, statDrill.js).
	// 기간·범위가 바뀌면 같은 대상(id)으로 다시 불러온다.
	/** @type {import('$lib/statDrill.js').DrillTarget | null} */
	let drill = null;
	let drillWorks = null;
	let drillLoading = false;
	let drillError = '';
	/** @type {HTMLElement | null} */
	let drillOpener = null; // 패널을 연 표의 단추. 닫으면 포커스를 돌려준다.
	// URL로 연 패널(drill·drill_id): 그 카드가 처음 불러와지면 id 로 항목을 찾아 연다.
	// 그 기간·범위의 항목에 없으면 이름을 알 수 없으므로 열지 않고 URL에서도 지운다.
	let linkedDrill = readDrillQuery($page.url.searchParams);

	async function loadDrill() {
		if (!drill || (scope === 'individual' && !userId)) return;
		const id = requests.begin(['drill']);
		drillWorks = null;
		drillLoading = true;
		drillError = '';
		try {
			const result = await getJson('works', drillParams(drill));
			if (requests.isLatest('drill', id)) drillWorks = result;
		} catch (e) {
			if (requests.isLatest('drill', id)) {
				console.error('통계 로딩 실패 (works)', e);
				drillError = '불러오지 못했습니다';
			}
		} finally {
			if (requests.isLatest('drill', id)) drillLoading = false;
		}
	}
	function openDrill(card, index) {
		const target = drillTarget(card, data[card], index);
		if (!target) return;
		const active = document.activeElement;
		drillOpener = active instanceof HTMLElement && active.closest('.card') ? active : null;
		linkedDrill = null; // 링크의 패널이 아직 열리지 않았으면, 지금 고른 것이 이긴다.
		drill = target;
		syncUrl();
		loadDrill();
	}
	function openLinkedDrill(card) {
		if (linkedDrill?.card !== card) return;
		const index = drillItemIndex(data[card], linkedDrill.id);
		linkedDrill = null;
		if (index >= 0) openDrill(card, index);
		else syncUrl();
	}
	// 막대는 1위가 맨 위에 오도록 뒤집혀 그려진다.
	const openBar = (card, e) =>
		openDrill(card, barItemIndex(e.detail.dataIndex, data[card]?.labels?.length ?? 0));
	async function closeDrill() {
		requests.begin(['drill']); // 진행 중인 응답은 버린다.
		drill = null;
		drillWorks = null;
		syncUrl();
		await tick();
		if (drillOpener?.isConnected) drillOpener.focus();
		drillOpener = null;
	}

	onMount(loadAll);

	function onScopeChange(e) {
		scope = e.detail;
		syncUrl();
		loadAll();
	}
	function onMemberChange(e) {
		userId = e.detail.userId;
		includeMentees = e.detail.includeMentees;
		syncUrl();
		loadAll();
	}
	function onPeriodChange(e) {
		period = e.detail;
		appliedFilters = null;
		syncUrl();
		loadAll();
	}
	function setDiversityBucket(b) {
		if (diversityBucket === b) return;
		diversityBucket = b;
		syncUrl();
		// 한 학기 이하면 기간별 선곡 추이도 반대 단위로 바뀌므로 함께 다시 부른다.
		const next = nextTimelineBucket();
		if (next === timelineBucket) load(['diversity']);
		else {
			timelineBucket = next;
			load(['diversity', 'timeline']);
		}
	}

	// 부제: 현재 범위 + 전체 선곡 수.
	$: scopeLabel = scope === 'individual' ? '개인' : '전체';
	// 머리말 기간: 백엔드가 돌려준 범위. 아직 없으면 보낼 범위로 짐작한다.
	$: periodText = appliedFilters
		? periodRangeText(appliedFilters)
		: period === CURRENT
			? `${startDate} ~ ${endDate}`
			: period === ALL
				? '전체 기간'
				: period === CUSTOM
					? periodRangeText({ start: customStart, end: customEnd })
					: '';
	// 직접 지정을 고르면 입력란에 지금 보이는 기간을 채운다(전체 기간이면 이번 학기).
	$: shownRange =
		appliedFilters && (appliedFilters.start || appliedFilters.end)
			? { start: appliedFilters.start ?? '', end: appliedFilters.end ?? '' }
			: { start: startDate, end: endDate };
	// 내려받는 파일 이름에 넣을 보기: 머리말의 기간과, 개인이면 지기(statFileName.js).
	let userName = '';
	$: fileTag = [
		periodText,
		scope === 'individual' ? memberFileText({ userId, name: userName, includeMentees }) : ''
	];
	$: subtitleFor = (envelope) =>
		envelope ? `${scopeLabel} · 총 ${envelope.total_plays.toLocaleString()}곡` : '';

	$: composerOpt =
		composers && horizontalBarOption(composers, '많이 튼 작곡가', subtitleFor(composers));
	$: soloistOpt =
		soloists && horizontalBarOption(soloists, '많이 튼 독주자', subtitleFor(soloists));
	$: conductorOpt =
		conductors && horizontalBarOption(conductors, '많이 튼 지휘자', subtitleFor(conductors));
	$: orchestraOpt =
		orchestras && horizontalBarOption(orchestras, '많이 튼 오케스트라', subtitleFor(orchestras));
	$: timelineTitle = `${timelineBucketName(timelineBucket)} 선곡 추이`;
	$: timelineData = timeline && timelineView(timeline);
	$: timelineOpt = timelineData && timelineOption(timelineData, timelineTitle, scopeLabel);
	$: eraOpt = eras && eraPieOption(eras, '시대별 분포', subtitleFor(eras));
	$: eraNote =
		eras && eras.unknown_share > 0.2
			? `시대 미상 비율 ${Math.round(eras.unknown_share * 100)}% — 일부 작곡가 데이터 미반영`
			: '';
	$: genreOpt = genres && eraPieOption(genres, '장르별 분포', subtitleFor(genres));

	// 다양성: 버킷 라벨, 선곡 수 막대, 다양성(고른정도) 추이.
	$: bucketLabel = diversityBucket === 'week' ? '주별' : '월별';
	$: countData = diversity && {
		labels: diversity.timeline.labels,
		values: diversity.timeline.plays
	};
	$: countOpt = countData && countBarOption(countData, `${bucketLabel} 선곡 수`, scopeLabel);
	$: diversityOpt =
		diversity &&
		diversityLineOption(
			diversity.timeline.labels,
			[
				{ name: '시대 다양성', values: diversity.timeline.era_evenness },
				{ name: '장르 다양성', values: diversity.timeline.genre_evenness }
			],
			`${bucketLabel} 다양성 추이`,
			'0=편중 · 1=고름 (가능한 모든 구간을 고르게 틀수록 1)'
		);
	// 다양성 추이: 차트의 data(PNG·CSV 저장의 빈 데이터 판단용)와, 두 계열을 모두 싣는 CSV.
	$: diversityCsvData = diversity && {
		labels: diversity.timeline.labels,
		values: diversity.timeline.era_evenness
	};
	$: diversityCsv =
		diversity &&
		seriesCsv(diversity.timeline.labels, '기간', [
			{ name: '시대다양성', values: diversity.timeline.era_evenness },
			{ name: '장르다양성', values: diversity.timeline.genre_evenness }
		]);
	// 표로 보기: 다양성 추이는 두 계열을 모두 싣는다(그 밖의 시계열 카드는 data 로 만든다).
	$: diversityTable =
		diversity &&
		seriesTable(diversity.timeline.labels, '기간', [
			{ name: '시대 다양성', values: diversity.timeline.era_evenness, format: formatEvenness },
			{ name: '장르 다양성', values: diversity.timeline.genre_evenness, format: formatEvenness }
		]);
	$: pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
	// 머리말의 '선곡 기록' 링크: 같은 기간과(개인 범위면) 같은 지기의 선곡 목록.
	$: historyFilter = {
		period,
		start: customStart,
		end: customEnd,
		q: '',
		userId: scope === 'individual' ? userId : null,
		includeMentees,
		requested: ''
	};
	$: historyLink = historyHref(historyFilter);
	// drill-down 패널의 'N곡 모두 보기': stats/works 에 보낸 것과 같은 기간·지기·id 필터.
	$: drillHistoryLink =
		drill &&
		historyHref({ ...historyFilter, targets: [{ param: drill.param, id: String(drill.id) }] });
	// 패널의 곡 하나: 같은 기간·지기에서 그 대상이 그 곡을 튼 선곡.
	$: drillWorkLink = (item) =>
		drill && item.id != null
			? historyHref({ ...historyFilter, targets: drillWorkTargets(drill, item.id) })
			: null;
</script>

<svelte:head>
	<title>통계</title>
</svelte:head>

<div class="stat-page">
	<header class="page-header">
		<div class="title-group">
			<h1>통계</h1>
			<span class="period">{periodText}</span>
			<a class="history-link" href={historyLink}>선곡 기록</a>
			<a class="history-link" href="/stat/composers">작곡가 정리</a>
			<!-- 기간이 학기면 그 학기의, 아니면 가장 최근 학기의 결산 -->
			<a class="history-link" href={reportHref(period)}>학기 결산</a>
		</div>
		<div class="controls">
			<PeriodSelect
				bind:period
				bind:start={customStart}
				bind:end={customEnd}
				{shownRange}
				on:change={onPeriodChange}
			/>
			<ScopeToggle bind:scope on:change={onScopeChange} />
			{#if scope === 'individual'}
				<MemberSelect bind:userId bind:includeMentees bind:userName on:change={onMemberChange} />
			{/if}
		</div>
	</header>

	{#if scope === 'individual' && !userId}
		<div class="empty-hint">지기를 선택하면 개인 통계를 볼 수 있습니다.</div>
	{:else}
		<!-- KPI 카드 -->
		<div class="kpi-row">
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.total_plays.toLocaleString() : '—'}</div>
				<div class="kpi-label">총 선곡</div>
			</div>
			<!-- sessions·requested 가 없는 예전 백엔드에서는 '—' -->
			<div class="kpi">
				<div class="kpi-value">
					{summary && summary.sessions != null ? summary.sessions.toLocaleString() : '—'}
				</div>
				<div class="kpi-label">타임</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">
					{summary && summary.requested != null ? summary.requested.toLocaleString() : '—'}
				</div>
				<div class="kpi-label">신청곡</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.composers.toLocaleString() : '—'}</div>
				<div class="kpi-label">작곡가</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.works.toLocaleString() : '—'}</div>
				<div class="kpi-label">곡</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.conductors.toLocaleString() : '—'}</div>
				<div class="kpi-label">지휘자</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.orchestras.toLocaleString() : '—'}</div>
				<div class="kpi-label">오케스트라</div>
			</div>
			<div class="kpi span2">
				<div class="kpi-value small">
					<!-- 좁은 칸에서는 '~' 뒤에서만 줄을 바꾼다 -->
					{#if summary && summary.date_start}
						<span class="date">{summary.date_start}</span> ~
						<span class="date">{summary.date_end}</span>
					{:else}
						—
					{/if}
				</div>
				<div class="kpi-label">기간</div>
			</div>
		</div>
		{#if errors.summary}
			<p class="kpi-error">요약을 불러오지 못했습니다.</p>
		{/if}

		<!-- 차트 그리드 -->
		<div class="chart-grid">
			<ChartCard
				title="많이 튼 작곡가"
				option={composerOpt}
				data={composers}
				loading={loading.composers}
				error={errors.composers}
				{fileTag}
				rowLabel="곡 보기"
				on:itemclick={(e) => openBar('composers', e)}
				on:rowselect={(e) => openDrill('composers', e.detail)}
				table={composers && rankTable(composers, '작곡가')}
				csvHeaders={['작곡가', '횟수']}
			/>
			<ChartCard
				title="많이 튼 독주자"
				option={soloistOpt}
				data={soloists}
				loading={loading.soloists}
				error={errors.soloists}
				{fileTag}
				rowLabel="곡 보기"
				on:itemclick={(e) => openBar('soloists', e)}
				on:rowselect={(e) => openDrill('soloists', e.detail)}
				table={soloists && rankTable(soloists, '연주자')}
				csvHeaders={['연주자', '횟수']}
			/>
			<ChartCard
				title="많이 튼 지휘자"
				option={conductorOpt}
				data={conductors}
				loading={loading.conductors}
				error={errors.conductors}
				{fileTag}
				rowLabel="곡 보기"
				on:itemclick={(e) => openBar('conductors', e)}
				on:rowselect={(e) => openDrill('conductors', e.detail)}
				table={conductors && rankTable(conductors, '지휘자')}
				csvHeaders={['지휘자', '횟수']}
			/>
			<ChartCard
				title="많이 튼 오케스트라"
				option={orchestraOpt}
				data={orchestras}
				loading={loading.orchestras}
				error={errors.orchestras}
				{fileTag}
				rowLabel="곡 보기"
				on:itemclick={(e) => openBar('orchestras', e)}
				on:rowselect={(e) => openDrill('orchestras', e.detail)}
				table={orchestras && rankTable(orchestras, '오케스트라')}
				csvHeaders={['오케스트라', '횟수']}
			/>
			<ChartCard
				title="시대별 분포"
				option={eraOpt}
				data={eras}
				loading={loading.eras}
				error={errors.eras}
				{fileTag}
				note={eraNote}
				noteLink={{ href: '/stat/composers', text: '작곡가 정리' }}
				table={eras && shareTable(eras, '시대')}
				csvHeaders={['시대', '횟수']}
			/>
			<ChartCard
				title="장르별 분포"
				option={genreOpt}
				data={genres}
				loading={loading.genres}
				error={errors.genres}
				{fileTag}
				table={genres && shareTable(genres, '장르')}
				csvHeaders={['장르', '횟수']}
			/>
			<ChartCard
				title={timelineTitle}
				option={timelineOpt}
				data={timelineData}
				loading={loading.timeline}
				error={errors.timeline}
				{fileTag}
				csvHeaders={['기간', '횟수']}
			/>
		</div>
		{#if drill}
			{#key drill}
				<DrillPanel
					target={drill}
					works={drillWorks}
					loading={drillLoading}
					error={drillError}
					{scopeLabel}
					historyLink={drillHistoryLink}
					workLink={drillWorkLink}
					composerLink={drill.card === 'composers' ? composerHref(drill.id) : ''}
					on:close={closeDrill}
				/>
			{/key}
		{:else}
			<p class="drill-hint">
				작곡가·독주자·지휘자·오케스트라의 막대나 이름을 누르면 그 곡들을 봅니다.
			</p>
		{/if}

		<!-- 다양성 섹션 -->
		<div class="section-head">
			<h2>선곡 다양성</h2>
			<div class="bucket-toggle" role="group" aria-label="다양성 집계 단위">
				<button
					class:active={diversityBucket === 'week'}
					aria-pressed={diversityBucket === 'week'}
					on:click={() => setDiversityBucket('week')}
				>
					주별
				</button>
				<button
					class:active={diversityBucket === 'month'}
					aria-pressed={diversityBucket === 'month'}
					on:click={() => setDiversityBucket('month')}
				>
					월별
				</button>
			</div>
		</div>

		<div class="kpi-row diversity-kpi">
			<div class="kpi">
				<div class="kpi-value">{diversity ? pct(groupEvenness(diversity.summary.era)) : '—'}</div>
				<div class="kpi-label">시대 다양성</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{diversity ? pct(groupEvenness(diversity.summary.genre)) : '—'}</div>
				<div class="kpi-label">장르 다양성</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">
					{diversity ? diversity.summary.distinct_works.toLocaleString() : '—'}
				</div>
				<div class="kpi-label">고유 곡 수</div>
			</div>
		</div>

		<div class="chart-grid">
			<ChartCard
				title={`${bucketLabel} 선곡 수`}
				option={countOpt}
				data={countData}
				loading={loading.diversity}
				error={errors.diversity}
				{fileTag}
				csvHeaders={['기간', '선곡수']}
			/>
			<ChartCard
				title={`${bucketLabel} 다양성 추이`}
				option={diversityOpt}
				data={diversityCsvData}
				table={diversityTable}
				loading={loading.diversity}
				error={errors.diversity}
				{fileTag}
				csv={diversityCsv}
			/>
		</div>
	{/if}
</div>

<style>
	.stat-page {
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
	.period {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	.history-link {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		text-underline-offset: 3px;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 16px;
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
		grid-template-columns: repeat(9, 1fr);
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
	.kpi.span2 {
		grid-column: span 2;
	}
	.kpi-value {
		font-family: var(--large-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--large-font-size, 24px);
		font-weight: 700;
		color: var(--primary-primary-800, #6a5134);
	}
	.kpi-value.small {
		font-size: var(--medium-font-size, 16px);
	}
	.kpi-value .date {
		white-space: nowrap;
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
	.drill-hint {
		margin: 8px 0 0;
		text-align: center;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	.chart-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}
	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 28px 0 12px;
	}
	.section-head h2 {
		font-family: var(--large-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--large-font-size, 24px);
		font-weight: 600;
		color: var(--gray-gray-950, #1a1a1a);
		margin: 0;
	}
	.bucket-toggle {
		display: flex;
		gap: 4px;
	}
	.bucket-toggle button {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		background: var(--secondary-secondary-100, #fef9f3);
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 4px;
		padding: 4px 12px;
		cursor: pointer;
	}
	.bucket-toggle button.active {
		background: var(--action-bg);
		color: var(--action-fg);
	}
	.diversity-kpi {
		grid-template-columns: repeat(3, 1fr);
	}
</style>
