<script>
	import { page } from '$app/stores';
	import { afterNavigate, goto } from '$app/navigation';
	import ChartCard from '$lib/components/stat/ChartCard.svelte';
	import DataTable from '$lib/components/stat/DataTable.svelte';
	import PeriodSelect from '$lib/components/stat/PeriodSelect.svelte';
	import MemberSelect from '$lib/components/stat/MemberSelect.svelte';
	import { horizontalBarOption, countBarOption, eraPieOption } from '$lib/chartOptions.js';
	import { placeholderText, shareTable } from '$lib/statTable.js';
	import { WORKS_LIMIT, barItemIndex } from '$lib/statDrill.js';
	import { pageTitle } from '$lib/statTitle.js';
	import { memberFileText, downloadName } from '$lib/statFileName.js';
	import { todayStamp } from '$lib/csv.js';
	import { downloadCsvTable, tableCsv } from '$lib/csvTable.js';
	import {
		ALL,
		CURRENT,
		CUSTOM,
		periodRangeText,
		currentSemesterRange,
		semesterLabel
	} from '$lib/statPeriod.js';
	import { semesterRangeOf, timelineBucketName, timelineView } from '$lib/statBucket.js';
	import {
		previousSemester,
		kpiChangeText,
		rankChangeTable,
		mixTable
	} from '$lib/semesterReport.js';
	import { catalogHref } from '$lib/composerCatalog.js';
	import {
		readComposerId,
		readComposerPeriod,
		writeComposerPeriod,
		readComposerMember,
		writeComposerMember,
		composerPeriodParams,
		composerMemberParams,
		composerPeriodName,
		composerStatHref,
		composerWorkHref,
		composerHistoryHref,
		composerRankLinks,
		composerSemesterLinks,
		composerFacts,
		composerTimelineBucket,
		composerWorksTable,
		composerWorksCsv
	} from '$lib/composerStats.js';

	// 작곡가 한 명의 기록, 고른 기간·지기만(기본값은 전체 기간·전체 지기). 카드는 따로 불러오고,
	// 실패하면 그 카드에만 오류를 띄운다.
	$: composerId = readComposerId($page.params.id);

	// 기간과 지기는 URL에도 둔다(composerStats.js). 처음 열 때와 다른 작곡가로 옮겨 갈 때 URL에서 읽는다.
	let { period, start: customStart, end: customEnd } = readComposerPeriod($page.url.searchParams);
	let { userId, includeMentees } = readComposerMember($page.url.searchParams);
	$: filter = { period, start: customStart, end: customEnd, userId, includeMentees };
	// 이번 학기 = 가장 최근 학기의 시작일부터 오늘까지(통계와 같다).
	const current = currentSemesterRange();

	const getJson = async (endpoint, id, extra = {}) => {
		const params = new URLSearchParams({
			composer_id: id,
			...composerPeriodParams({ period, start: customStart, end: customEnd }, current),
			...composerMemberParams({ userId, includeMentees }),
			...extra
		});
		const res = await fetch(`/api/stats/${endpoint}?${params}`);
		if (!res.ok) throw new Error(`${endpoint} ${res.status}`);
		return res.json();
	};
	// 선곡 카드의 bucket: 여러 학기면 학기별, 한 학기면 월별. loadCards 가 정하고 '다시 시도'도 그대로 쓴다.
	// (filter 는 $: 라 기간을 바꾼 직후에는 아직 이전 값이다. getJson 처럼 기간 변수를 바로 쓴다.)
	const nextTimelineBucket = () =>
		composerTimelineBucket({ period, start: customStart, end: customEnd }, current);
	let timelineBucket = nextTimelineBucket();
	// 독주자·지휘자·오케스트라 목록의 길이. 앞 학기의 목록도 같은 길이로 부른다(지난 학기 칸의 '10위 밖').
	const LIMITS = { soloists: 10, conductors: 10, orchestras: 10 };
	const cardRequests = {
		summary: (id) => getJson('summary', id),
		timeline: (id) => getJson('timeline', id, { bucket: timelineBucket }),
		works: (id) => getJson('works', id, { limit: String(WORKS_LIMIT) }),
		soloists: (id) => getJson('soloists', id, { limit: String(LIMITS.soloists) }),
		conductors: (id) => getJson('conductors', id, { limit: String(LIMITS.conductors) }),
		orchestras: (id) => getJson('orchestras', id, { limit: String(LIMITS.orchestras) }),
		genres: (id) => getJson('genres', id)
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
	$: ({ summary, timeline, works, soloists, conductors, orchestras, genres } = data);

	// 백엔드가 적용했다고 돌려준 기간(filters). 기간이 바뀔 때 비운다.
	let appliedFilters = null;

	// 다른 작곡가나 기간으로 옮겨 가면 이전의 늦은 응답은 버린다.
	let generation = 0;
	let cardGeneration = 0;

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

	function loadCard(key, id, gen) {
		cardRequests[key](id)
			.then((result) => {
				if (gen !== cardGeneration) return;
				data[key] = result;
				appliedFilters = result.filters;
			})
			.catch((e) => {
				if (gen !== cardGeneration) return;
				console.error(`작곡가 통계 로딩 실패 (${key})`, e);
				errors[key] = '불러오지 못했습니다';
			})
			.finally(() => {
				if (gen === cardGeneration) loading[key] = false;
			});
	}

	// 카드만 다시 부른다(기간이나 지기가 바뀌면 작곡가 정보는 그대로다).
	function loadCards() {
		const id = readComposerId($page.params.id);
		const gen = ++cardGeneration;
		data = {};
		errors = {};
		appliedFilters = null;
		timelineBucket = nextTimelineBucket();
		loading = Object.fromEntries(CARD_KEYS.map((key) => [key, Boolean(id)]));
		loadPreviousSummary();
		if (!id) return;
		for (const key of CARD_KEYS) loadCard(key, id, gen);
	}

	// '다시 시도': 그 카드만 지금 기간으로 다시 부른다. cardGeneration 은 그대로 두어 다른 카드의 요청을
	// 살리고, 그 사이 기간이나 작곡가를 바꾸면 이 요청의 늦은 응답도 버린다.
	// 단추는 사라지므로, 단추에 있던 포커스는 먼저 target(많이 튼 곡은 그 section, 글줄은 h1)으로 옮긴다.
	let heading;
	function retry(key, e, target) {
		if (e && document.activeElement === e.currentTarget) target?.focus();
		loading[key] = true;
		errors[key] = '';
		loadCard(key, composerId, cardGeneration);
	}
	function retryComposer(e) {
		if (document.activeElement === e.currentTarget) heading?.focus();
		composerError = '';
		loadComposer(composerId, generation);
	}

	function loadAll() {
		const id = readComposerId($page.params.id);
		const gen = ++generation;
		composer = null;
		notFound = !id;
		composerError = '';
		if (id) loadComposer(id, gen);
		loadCards();
	}
	// 처음 열 때와, 같은 페이지에서 다른 작곡가로 옮겨 갈 때: 기간·지기도 URL에서 다시 읽는다.
	// 기간이나 지기를 바꿔 이 페이지가 URL을 고친 goto 는 건너뛴다(onPeriodChange·onMemberChange 가 이미 불러왔다).
	afterNavigate((navigation) => {
		if (navigation.type === 'goto' && navigation.from?.params?.id === navigation.to?.params?.id) {
			return;
		}
		({ period, start: customStart, end: customEnd } = readComposerPeriod($page.url.searchParams));
		({ userId, includeMentees } = readComposerMember($page.url.searchParams));
		loadAll();
	});

	// 기간이 바뀌면 URL을 바꾼다. 히스토리를 쌓지 않고, 포커스·스크롤도 그대로 둔다.
	function onPeriodChange() {
		const url = new URL($page.url);
		writeComposerPeriod(url.searchParams, { period, start: customStart, end: customEnd });
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
		loadCards();
	}
	// 지기도 같다(링크의 지기가 목록에 없어 전체 지기로 되돌릴 때도 MemberSelect 가 change 를 보낸다).
	function onMemberChange(e) {
		({ userId, includeMentees } = e.detail);
		const url = new URL($page.url);
		writeComposerMember(url.searchParams, { userId, includeMentees });
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
		loadCards();
	}
	let userName = ''; // 고른 지기의 이름(MemberSelect)

	// PeriodSelect 가 불러온 학기 목록(최신순): 학기별 선곡의 학기를 그 학기(semester_id)로 연다.
	// 못 받으면 날짜로 연다.
	let semesters = [];

	// 기간이 목록의 학기면 총 선곡·타임·곡 칸 아래에 바로 앞 학기와 견준 줄을 둔다(통계와 같다).
	// 앞 학기의 요약은 같은 작곡가·지기·견습 포함으로 카드와 함께 부르고, 실패하면 줄이 없다.
	// 많이 튼 독주자·지휘자·오케스트라 표에는 앞 학기 같은 길이의 목록에서의 순위를 붙인다(통계와 같다).
	// 많이 튼 곡 표에는 앞 학기에 튼 횟수를 붙인다(같은 WORKS_LIMIT 의 목록).
	// 장르별 분포 표에는 앞 학기의 비율과 변화를 붙인다(통계와 같다).
	// 실패하면 그 표는 지금과 같다. 앞 학기의 요청이 하나라도 실패하면 KPI 칸 아래에 그 학기를 밝히고,
	// 실패한 요청만 다시 부르게 한다(통계와 같다).
	let previousSummary = null;
	/** @type {Record<string, any>} 앞 학기의 독주자·지휘자·오케스트라 목록(LIMITS 의 키) */
	let previousRanks = {};
	let previousWorks = null; // 앞 학기의 곡 목록
	let previousGenres = null; // 앞 학기의 장르별 분포
	let previousAsked = null; // 마지막으로 부른 앞 학기 id(없으면 null)
	let previousTarget = null; // 마지막으로 부른 앞 학기
	let previousComposerId = null; // 그때의 작곡가(다시 시도도 같은 작곡가로 부른다)
	let previousGeneration = 0; // 이전 보기의 늦은 응답은 버린다.
	/** @type {string[]} 실패한 앞 학기 요청(엔드포인트). KPI 칸 아래에 다시 시도와 함께 알린다. */
	let previousFailed = [];
	const previousOf = (p, list) => {
		const chosen = list.find((s) => String(s.id) === p);
		return chosen ? previousSemester(chosen, list) : null;
	};
	const previousRequests = {
		summary: { apply: (result) => (previousSummary = result) },
		works: {
			apply: (result) => (previousWorks = result),
			extra: { limit: String(WORKS_LIMIT) }
		},
		genres: { apply: (result) => (previousGenres = result) },
		...Object.fromEntries(
			Object.entries(LIMITS).map(([key, limit]) => [
				key,
				{
					apply: (result) => (previousRanks = { ...previousRanks, [key]: result }),
					extra: { limit: String(limit) }
				}
			])
		)
	};
	async function askPrevious(endpoint) {
		const gen = previousGeneration;
		const { apply, extra = {} } = previousRequests[endpoint];
		try {
			// getJson 은 extra 를 마지막에 넣으므로 기간의 semester_id 만 바뀌고 지기는 그대로다.
			const result = await getJson(endpoint, previousComposerId, {
				...extra,
				semester_id: String(previousTarget.id)
			});
			if (gen === previousGeneration) apply(result);
		} catch (e) {
			if (gen === previousGeneration) {
				console.error(`작곡가 통계 로딩 실패 (지난 학기 ${endpoint})`, e);
				previousFailed = [...previousFailed, endpoint];
			}
		}
	}
	async function loadPreviousSummary() {
		const id = readComposerId($page.params.id);
		++previousGeneration;
		const previous = previousOf(period, semesters);
		previousAsked = previous?.id ?? null;
		previousTarget = previous;
		previousComposerId = id;
		previousFailed = [];
		previousSummary = null;
		previousRanks = {};
		previousWorks = null;
		previousGenres = null;
		if (!previous || !id) return;
		await Promise.allSettled(Object.keys(previousRequests).map(askPrevious));
	}
	// 지난 학기 수치의 '다시 시도': 실패한 요청만 같은 previousGeneration 으로 다시 부른다. 새로 올리면 아직
	// 오지 않은 첫 요청의 응답까지 버려진다. 단추는 사라지므로 포커스는 h1 으로 옮긴다(retryComposer 와 같다).
	function retryPrevious(e) {
		if (document.activeElement === e.currentTarget) heading?.focus();
		const failed = previousFailed;
		previousFailed = [];
		return Promise.allSettled(failed.map(askPrevious));
	}
	// 링크로 연 학기는 학기 목록이 온 뒤에야 앞 학기를 안다. 기간·지기·작곡가가 바뀔 때는 loadCards 가
	// 이미 불렀으므로, 앞 학기가 마지막으로 부른 것과 다를 때만 부른다.
	$: previousId = previousOf(period, semesters)?.id ?? null;
	$: if (previousId !== previousAsked) loadPreviousSummary();
	// 칸마다 { diff: '+3', before: '지난 학기 9' }. 앞 학기가 없거나 아직 없으면 null.
	$: changes = Object.fromEntries(
		['total_plays', 'sessions', 'works'].map((key) => {
			const text = kpiChangeText(summary?.[key], previousSummary?.[key]);
			const [diff, before] = text.split(' · ');
			return [key, text ? { diff, before } : null];
		})
	);

	$: title = composer ? composer.name : composerError ? `작곡가 #${composerId}` : '작곡가';
	// 머리말 기간: 백엔드가 돌려준 범위. 아직 없으면 보낼 범위로 짐작한다(학기는 학기 목록의 연도·학기로).
	$: semesterRange = semesterRangeOf(period, semesters);
	$: periodText = appliedFilters
		? periodRangeText(appliedFilters)
		: period === CURRENT
			? periodRangeText(current)
			: period === ALL
				? '전체 기간'
				: period === CUSTOM
					? periodRangeText({ start: customStart, end: customEnd })
					: periodRangeText(semesterRange);
	// 직접 지정을 고르면 입력란에 지금 보이는 기간을 채운다(전체 기간이면 이번 학기).
	$: shownRange =
		appliedFilters && (appliedFilters.start || appliedFilters.end)
			? { start: appliedFilters.start ?? '', end: appliedFilters.end ?? '' }
			: semesterRange ?? current;
	// 기간의 이름('2025-2학기', '이번 학기'). 학기 목록이 아직 없으면 머리말의 기간.
	$: periodName = composerPeriodName(filter, semesters) || periodText;
	// 고른 지기의 이름(목록을 못 받았으면 '지기 #id'), 견습 포함이면 '+견습'. 전체 지기면 ''.
	$: memberText = memberFileText({ userId, name: userName, includeMentees });
	// 탭 제목과 내려받는 파일 이름에 작곡가와, 기본값이 아닌 기간·지기를 넣는다(이름을 못 받았으면 '작곡가 #id').
	$: tabTitle = pageTitle(composer?.name, period === ALL ? '' : periodName, memberText, '작곡가');
	$: fileTag = [
		composer ? composer.name : `작곡가 #${composerId}`,
		period === ALL ? '' : periodText,
		memberText
	];
	$: subtitleFor = (envelope) =>
		envelope
			? [periodName, memberText, `총 ${envelope.total_plays.toLocaleString()}곡`]
					.filter(Boolean)
					.join(' · ')
			: '';
	// 제목과 표의 머리글은 응답이 적용한 bucket 을 따른다(늦은 응답이 다른 이름으로 보이지 않게).
	$: shownBucket = timeline?.filters?.bucket ?? timelineBucket;
	$: timelineTitle = `${timelineBucketName(shownBucket)} 선곡`;
	$: timelineData = timeline && timelineView(timeline);
	$: timelineOpt =
		timelineData && countBarOption(timelineData, timelineTitle, subtitleFor(timeline));
	$: soloistOpt =
		soloists && horizontalBarOption(soloists, '많이 튼 독주자', subtitleFor(soloists));
	$: conductorOpt =
		conductors && horizontalBarOption(conductors, '많이 튼 지휘자', subtitleFor(conductors));
	$: orchestraOpt =
		orchestras && horizontalBarOption(orchestras, '많이 튼 오케스트라', subtitleFor(orchestras));
	$: genreOpt = genres && eraPieOption(genres, '장르별 분포', subtitleFor(genres));
	// 표로 보기와 CSV 저장은 같은 표다(순위·이름·횟수, 학기를 고르면 지난 학기).
	$: soloistTable =
		soloists && rankChangeTable(soloists, previousRanks.soloists, '연주자', LIMITS.soloists);
	$: conductorTable =
		conductors &&
		rankChangeTable(conductors, previousRanks.conductors, '지휘자', LIMITS.conductors);
	$: orchestraTable =
		orchestras &&
		rankChangeTable(orchestras, previousRanks.orchestras, '오케스트라', LIMITS.orchestras);
	// 장르는 장르·횟수·비율(학기를 고르면 지난 학기·변화까지, 통계와 같다).
	$: genreTable =
		genres &&
		(previousGenres ? mixTable(genres, previousGenres, '장르') : shareTable(genres, '장르'));
	$: worksTable =
		works && works.items.length > 0 && composerWorksTable(works, composer, previousWorks);
	// 많이 튼 곡의 CSV 저장: 차트 카드(ChartCard)처럼, 표가 보일 때만 그 곡들을 받는다.
	$: canExportWorks = Boolean(worksTable) && !loading.works && !errors.works;
	function exportWorksCsv() {
		if (!canExportWorks) return;
		const csv = composerWorksCsv(works, composer, previousWorks);
		downloadCsvTable(
			downloadName(['통계', '많이 튼 곡', fileTag, todayStamp()], 'csv'),
			csv.headers,
			csv.rows
		);
	}
	// 링크는 모두 같은 기간·지기를 연다. 곡 이름은 그 곡의 선곡 기록으로 간다.
	$: worksLinks = works ? works.items.map((item) => composerWorkHref(item.id, filter)) : [];
	// 독주자·지휘자·오케스트라는 이 작곡가의 곡을 그 사람(악단)과 튼 선곡 기록으로 간다(표의 이름, 차트의 막대).
	$: soloistLinks = composerRankLinks(composerId, 'soloists', soloists, filter);
	$: conductorLinks = composerRankLinks(composerId, 'conductors', conductors, filter);
	$: orchestraLinks = composerRankLinks(composerId, 'orchestras', orchestras, filter);
	// 학기·달마다 그 학기·달에 이 작곡가의 곡을 튼 선곡 기록으로 간다(기간 밖의 날짜는 뺀다).
	$: semesterLinks = composerSemesterLinks(composerId, timeline, semesters, filter);
	// 막대의 dataIndex 는 뒤집힌 순서다(horizontalBarOption). 학기별·월별 선곡은 뒤집지 않는다.
	function openBar(links, e, reversed = true) {
		const i = e.detail.dataIndex;
		const href = links[reversed ? barItemIndex(i, links.length) : i];
		if (href) goto(href);
	}
	// 처음·마지막 날짜는 기간·지기와 상관없이 그 곡의 전체 기록 기준이다(stats/works).
	$: worksSubtitle = works
		? subtitleFor(works) +
			(works.items.length >= WORKS_LIMIT ? ` · 상위 ${WORKS_LIMIT}곡` : '') +
			(period === ALL && !userId ? '' : ' · 처음·마지막은 전체 기록 기준')
		: '';
	$: count = (v) => (v == null ? '—' : v.toLocaleString());
	// 머리글의 선곡 기록 링크와 총 선곡 숫자는 같은 목록(이 작곡가, 같은 기간·지기)을 연다.
	$: historyLink = composerHistoryHref(composerId, [], filter);
</script>

<svelte:head>
	<title>{tabTitle}</title>
</svelte:head>

<div class="composer-page">
	<header class="page-header">
		<div class="title-group">
			<h1 tabindex="-1" bind:this={heading}>{title}</h1>
			{#if composer}
				<span class="facts">{composerFacts(composer)}</span>
			{/if}
			{#if composerId && !notFound}
				<span class="facts">{periodText}</span>
			{/if}
			<a class="page-link" href={composerStatHref(filter)}>통계</a>
			{#if composerId && !notFound}
				<a class="page-link" href={historyLink}>선곡 기록</a>
			{/if}
			<!-- 이름으로 검색한 작곡가 정리: 시대·출생 연도를 고치는 곳 -->
			{#if composer}
				<a
					class="page-link"
					href={catalogHref(composer.name)}
					title="작곡가 정리에서 이 작곡가의 시대·출생 연도 고치기">작곡가 정리</a
				>
			{/if}
		</div>
		{#if composerId && !notFound}
			<div class="controls">
				<PeriodSelect
					bind:period
					bind:start={customStart}
					bind:end={customEnd}
					bind:semesters
					{shownRange}
					on:change={onPeriodChange}
				/>
				<MemberSelect
					bind:userId
					bind:includeMentees
					bind:userName
					emptyLabel="전체 지기"
					on:change={onMemberChange}
				/>
			</div>
		{/if}
	</header>

	{#if !composerId || notFound}
		<div class="empty-hint">작곡가를 찾을 수 없습니다.</div>
	{:else}
		{#if composerError}
			<p class="kpi-error">
				{composerError}
				<button class="tool-btn" on:click={retryComposer} aria-label="작곡가 정보 다시 시도">
					다시 시도
				</button>
			</p>
		{/if}
		<div class="kpi-row">
			<div class="kpi">
				<!-- 총 선곡 숫자는 그 선곡의 선곡 기록을 연다(0 이면 열 목록이 없어 글자 그대로) -->
				<div class="kpi-value">
					{#if summary?.total_plays > 0}
						<a
							class="kpi-link"
							href={historyLink}
							title="선곡 기록에서 보기"
							aria-label="총 선곡 {count(summary.total_plays)}곡 선곡 기록에서 보기"
							>{count(summary.total_plays)}</a
						>
					{:else}
						{count(summary?.total_plays)}
					{/if}
				</div>
				<div class="kpi-label">총 선곡</div>
				<!-- 학기를 고르면 앞 학기와 견준 줄. 좁은 칸에서는 · 뒤에서만 줄을 바꾼다 -->
				{#if changes.total_plays}
					<div class="kpi-change">
						<span>{changes.total_plays.diff} ·</span>
						<span>{changes.total_plays.before}</span>
					</div>
				{/if}
			</div>
			<div class="kpi">
				<div class="kpi-value">{count(summary?.sessions)}</div>
				<div class="kpi-label">타임</div>
				{#if changes.sessions}
					<div class="kpi-change">
						<span>{changes.sessions.diff} ·</span>
						<span>{changes.sessions.before}</span>
					</div>
				{/if}
			</div>
			<div class="kpi">
				<div class="kpi-value">{count(summary?.works)}</div>
				<div class="kpi-label">곡</div>
				{#if changes.works}
					<div class="kpi-change">
						<span>{changes.works.diff} ·</span>
						<span>{changes.works.before}</span>
					</div>
				{/if}
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
			<p class="kpi-error">
				요약을 불러오지 못했습니다.
				<button
					class="tool-btn"
					on:click={(e) => retry('summary', e, heading)}
					aria-label="요약 다시 시도"
				>
					다시 시도
				</button>
			</p>
		{/if}
		<!-- 요약의 '다시 시도'는 앞 학기를 다시 부르지 않으므로, 요약이 실패했어도 이 줄은 따로 둔다 -->
		{#if previousFailed.length}
			<p class="kpi-error">
				지난 학기({semesterLabel(previousTarget)})와 견준 수치를 불러오지 못했습니다.
				<button class="tool-btn" on:click={retryPrevious} aria-label="지난 학기 수치 다시 시도">
					다시 시도
				</button>
			</p>
		{/if}

		{#if summary && summary.total_plays === 0}
			<div class="empty-hint">
				{period === ALL
					? `아직 ${userId ? '이 지기가 ' : ''}이 작곡가의 곡을 튼 적이 없습니다.`
					: `이 기간에는 ${userId ? '이 지기가 ' : ''}이 작곡가의 곡을 튼 적이 없습니다.`}
			</div>
		{:else}
			<div class="chart-grid">
				<ChartCard
					title={timelineTitle}
					option={timelineOpt}
					data={timelineData}
					loading={loading.timeline}
					error={errors.timeline}
					retry={() => retry('timeline')}
					{fileTag}
					links={semesterLinks}
					on:itemclick={(e) => openBar(semesterLinks, e, false)}
					csvHeaders={[shownBucket === 'semester' ? '학기' : '월', '횟수']}
				/>
				<!-- 곡은 처음·마지막 날짜까지 보이도록 차트 없이 표로만 -->
				<section class="card works-card" tabindex="-1" aria-label="많이 튼 곡">
					<div class="toolbar">
						<button
							class="tool-btn"
							on:click={exportWorksCsv}
							disabled={!canExportWorks}
							title="데이터(CSV)로 저장"
							aria-label="많이 튼 곡 CSV 저장"
						>
							CSV 저장
						</button>
					</div>
					{#if loading.works || errors.works || !worksTable}
						<!-- 표가 없으면 제목도 없으므로, 차트 카드처럼 어느 카드인지 여기서 밝힌다. -->
						<div class="placeholder" class:error={!loading.works && errors.works}>
							{placeholderText('많이 튼 곡', { loading: loading.works, error: errors.works })}
							{#if !loading.works && errors.works}
								<button
									class="tool-btn"
									on:click={(e) => retry('works', e, e.currentTarget.closest('section'))}
									aria-label="많이 튼 곡 다시 시도"
								>
									다시 시도
								</button>
							{/if}
						</div>
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
					retry={() => retry('soloists')}
					{fileTag}
					table={soloistTable}
					csv={soloistTable && tableCsv(soloistTable)}
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
					retry={() => retry('conductors')}
					{fileTag}
					table={conductorTable}
					csv={conductorTable && tableCsv(conductorTable)}
					links={conductorLinks}
					on:itemclick={(e) => openBar(conductorLinks, e)}
					csvHeaders={['지휘자', '횟수']}
				/>
				<ChartCard
					title="많이 튼 오케스트라"
					option={orchestraOpt}
					data={orchestras}
					loading={loading.orchestras}
					error={errors.orchestras}
					retry={() => retry('orchestras')}
					{fileTag}
					table={orchestraTable}
					csv={orchestraTable && tableCsv(orchestraTable)}
					links={orchestraLinks}
					on:itemclick={(e) => openBar(orchestraLinks, e)}
					csvHeaders={['오케스트라', '횟수']}
				/>
				<!-- 장르는 링크가 없다(통계와 같다) -->
				<ChartCard
					title="장르별 분포"
					option={genreOpt}
					data={genres}
					loading={loading.genres}
					error={errors.genres}
					retry={() => retry('genres')}
					{fileTag}
					table={genreTable}
					csv={genreTable && tableCsv(genreTable)}
					csvHeaders={['장르', '횟수']}
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
	/* 이름이 길거나 직접 지정을 열어 한 줄에 다 들어가지 않으면 컨트롤을 다음 줄 오른쪽에 둔다. */
	.page-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 16px;
		margin-bottom: 20px;
	}
	/* 이름이 길면 낱말·링크를 쪼개지 않고 통째로 다음 줄로 넘긴다 */
	.title-group {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 12px;
		row-gap: 4px;
	}
	h1 {
		font-family: var(--xlarge-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--xlarge-font-size, 32px);
		font-weight: var(--xlarge-font-weight, 500);
		color: var(--gray-gray-950, #1a1a1a);
		margin: 0;
		word-break: keep-all;
	}
	.facts {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
		white-space: nowrap;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: center;
		gap: 12px 16px;
		margin-left: auto;
	}
	/* 지기 목록을 못 받으면 그 문구는 지기 칸의 오른쪽 끝에서 왼쪽으로 펼쳐진다(MemberSelect).
	   바로 옆 기간 칸의 문구와 겹치지 않도록, 그동안만 지기 칸을 문구만큼 넓힌다. */
	.controls :global(.member-select:has(select[aria-invalid='true'])) {
		min-width: 260px;
		justify-content: flex-end;
	}
	.page-link {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		text-underline-offset: 3px;
		white-space: nowrap;
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
	.kpi-link {
		color: inherit;
		text-decoration: none;
		text-underline-offset: 3px;
	}
	.kpi-link:hover,
	.kpi-link:focus-visible {
		text-decoration: underline;
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
	.kpi-change {
		margin-top: 2px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: 12px;
		color: var(--gray-gray-600, #7c7c7c);
	}
	.kpi-change span {
		white-space: nowrap;
	}
	.kpi-error {
		margin: -8px 0 16px;
		text-align: center;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--secondary-secondary-800, #95560d);
	}
	/* 카드(ChartCard)의 단추와 같은 모양 */
	.tool-btn {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		background: var(--secondary-secondary-100, #fef9f3);
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 4px;
		padding: 3px 8px;
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
	.kpi-error .tool-btn {
		margin-left: 8px;
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
	/* 많이 튼 곡의 CSV 저장은 ChartCard 의 저장 단추처럼 오른쪽 위에 */
	.works-card {
		position: relative;
	}
	.toolbar {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 2;
	}
	.placeholder {
		display: flex;
		flex-direction: column;
		gap: 10px;
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
