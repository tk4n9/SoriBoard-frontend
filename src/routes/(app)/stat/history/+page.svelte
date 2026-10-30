<script>
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import PeriodSelect from '$lib/components/stat/PeriodSelect.svelte';
	import MemberSelect from '$lib/components/stat/MemberSelect.svelte';
	import PlayTable from '$lib/components/stat/PlayTable.svelte';
	import { currentSemesterRange } from '$lib/statPeriod.js';
	import { downloadCsvTable } from '$lib/csvTable.js';
	import { todayStamp } from '$lib/csv.js';
	import { downloadName, memberFileText } from '$lib/statFileName.js';
	import { pageTitle, periodTitle } from '$lib/statTitle.js';
	import {
		EXPORT_PAGE_SIZE,
		PLAY_CSV_HEADERS,
		readHistoryQuery,
		historyHref,
		statHref,
		playsParams,
		appendPage,
		fetchAllPlays,
		playCsvRow,
		targetLookup,
		targetName,
		targetText,
		historyFileTags,
		semesterRangeParams,
		historyPeriod
	} from '$lib/playHistory.js';

	// 검색어·기간·지기·신청곡과 통계 drill-down 의 id 필터는 URL에 둔다(링크로 같은 목록을 연다).
	// 페이지가 시작될 때 한 번만 읽는다.
	const initial = readHistoryQuery($page.url.searchParams);
	let period = initial.period; // 'current' | 'all' | 'custom' | 학기 id
	let customStart = initial.start;
	let customEnd = initial.end;
	let q = initial.q; // 적용된 검색어
	let query = q; // 검색란의 값. 검색을 누르면 q 로 옮긴다.
	let userId = initial.userId;
	let includeMentees = initial.includeMentees;
	let requested = initial.requested; // '' | 'true' | 'false'
	let targets = initial.targets; // 작곡가·연주자·지휘자·오케스트라·곡의 id 필터, 없으면 []
	// 필터마다(param) 보일 문구. 이름을 찾으면 바꾼다.
	let targetLabels = Object.fromEntries(targets.map((t) => [t.param, targetText(t, null)]));
	/** @type {Record<string, string | null>} */
	let targetNames = {}; // 필터마다 찾은 이름(CSV 파일 이름에 쓴다)
	let searchInput;
	const current = currentSemesterRange();

	const filter = () => ({
		period,
		start: customStart,
		end: customEnd,
		q,
		userId,
		includeMentees,
		requested,
		targets
	});

	/** @type {import('$lib/playHistory.js').Play[]} */
	let rows = [];
	let count = null; // 조건에 맞는 선곡 수(plays/ 의 count)
	let offset = 0; // 지금까지 받은 행 수(다음 쪽의 offset)
	let loading = false;
	let error = '';
	// 가장 최근 요청의 응답만 반영한다. 필터를 바꾸면 진행 중인 '더 보기'의 응답도 버린다.
	// 응답을 반영했으면(성공이든 실패든) true 를 돌려준다.
	let requestId = 0;

	async function load(more = false) {
		const id = ++requestId;
		if (!more) {
			rows = [];
			count = null;
			offset = 0;
		}
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/plays?${playsParams(filter(), current, offset)}`);
			if (!res.ok) throw new Error(`plays ${res.status}`);
			const result = await res.json();
			if (id !== requestId) return false;
			rows = appendPage(rows, result.results);
			offset += result.results.length;
			count = result.count;
		} catch (e) {
			if (id !== requestId) return false;
			console.error('선곡 기록 로딩 실패', e);
			error = '불러오지 못했습니다';
		} finally {
			if (id === requestId) loading = false;
		}
		return true;
	}

	// '더 보기'는 불러오는 동안 비활성이 되고, 다 받으면 사라지거나 '다시 시도'로 바뀌어 포커스를 잃는다.
	// 그래서 새로 온 첫 행의 타임 링크로(실패하면 '다시 시도'로) 포커스를 옮긴다. 그 사이 다른 곳을
	// 골랐거나 필터를 바꿨으면 그대로 둔다.
	let listCard;
	let moreBar;
	async function loadMore() {
		const first = rows.length;
		if (!(await load(true))) return;
		await tick();
		const active = document.activeElement;
		if (active && active !== document.body && !moreBar?.contains(active)) return;
		const row = error ? null : listCard?.querySelectorAll('tbody tr')[first];
		(row?.querySelector('a') ?? moreBar?.querySelector('button'))?.focus();
	}

	// 목록의 '다시 시도'도 누르면 '불러오는 중...'으로 바뀌어 사라지므로, 먼저 목록 카드로 포커스를 옮긴다.
	// 또 실패했는데 포커스가 아직 카드에 있으면 새 '다시 시도'로 되돌린다.
	async function retryList(e) {
		const hadFocus = document.activeElement === e.currentTarget;
		if (hadFocus) listCard?.focus();
		if (!(await load())) return;
		if (!hadFocus || !error) return;
		await tick();
		if (document.activeElement === listCard)
			listCard.querySelector('.placeholder.error button')?.focus();
	}

	// 필터가 바뀌면 URL을 바꾸고(히스토리를 쌓지 않고, 포커스·스크롤도 그대로) 처음부터 다시 부른다.
	function apply() {
		goto(historyHref(filter()), { replaceState: true, keepFocus: true, noScroll: true });
		exportError = '';
		load();
	}

	// id 필터의 이름은 URL에 없으므로 그 대상의 순위에서 id 로 찾는다(실패하면 '작곡가 #id').
	/** @param {import('$lib/playHistory.js').HistoryTarget} wanted */
	async function loadTargetName(wanted) {
		const lookup = targetLookup(wanted);
		if (!lookup) return;
		try {
			const res = await fetch(`/api/stats/${lookup.endpoint}?${lookup.params}`);
			if (!res.ok) throw new Error(`${lookup.endpoint} ${res.status}`);
			const name = targetName(await res.json(), wanted);
			if (targets.includes(wanted)) {
				targetLabels = { ...targetLabels, [wanted.param]: targetText(wanted, name) };
				targetNames = { ...targetNames, [wanted.param]: name };
			}
		} catch (e) {
			console.error('선곡 기록 대상 이름 로딩 실패', e);
		}
	}

	// 학기를 고르면 머리말에 보일 그 학기의 날짜 범위(백엔드가 적용한 filters). 가장 최근 요청만 반영한다.
	let semesterFilters = null;
	let rangeRequestId = 0;
	async function loadSemesterRange() {
		const id = ++rangeRequestId;
		const params = semesterRangeParams(period);
		if (!params) return;
		try {
			const res = await fetch(`/api/stats/summary?${params}`);
			if (!res.ok) throw new Error(`summary ${res.status}`);
			const result = await res.json();
			if (id === rangeRequestId) semesterFilters = result.filters;
		} catch (e) {
			console.error('선곡 기록 학기 범위 로딩 실패', e);
		}
	}

	onMount(() => {
		load();
		targets.forEach(loadTargetName);
		loadSemesterRange();
	});

	function onSearch() {
		q = query.trim();
		query = q;
		apply();
	}
	const onPeriodChange = (e) => {
		period = e.detail;
		apply();
		loadSemesterRange();
	};
	function onMemberChange(e) {
		userId = e.detail.userId;
		includeMentees = e.detail.includeMentees;
		apply();
	}
	function onRequestedChange(e) {
		requested = e.target.value;
		apply();
	}
	// CSV 저장: 누른 때의 조건에 맞는 선곡을 모두(불러온 행만이 아니라) 받아 한 파일로 내려받는다.
	let exporting = false;
	let exported = 0; // 받은 선곡 수
	let exportTotal = 0;
	let exportError = '';
	let userName = ''; // 고른 지기의 이름(MemberSelect)
	let exportButton;

	async function exportCsv() {
		const wanted = filter();
		// 저장하는 동안 단추가 비활성이 되어 포커스를 잃으므로, 단추에 있었으면 끝난 뒤 돌려준다.
		const hadFocus = document.activeElement === exportButton;
		// 파일 이름에 누른 때의 기간·지기와 그 밖의 조건(id 필터, 신청곡, 검색어)을 넣는다(statFileName.js).
		const filename = downloadName(
			[
				'선곡기록',
				periodText,
				memberFileText({ userId, name: userName, includeMentees }),
				historyFileTags(wanted, targetNames),
				todayStamp()
			],
			'csv'
		);
		exporting = true;
		exported = 0;
		exportTotal = count ?? 0;
		exportError = '';
		try {
			const plays = await fetchAllPlays(
				async (from) => {
					const res = await fetch(
						`/api/plays?${playsParams(wanted, current, from, EXPORT_PAGE_SIZE)}`
					);
					if (!res.ok) throw new Error(`plays ${res.status}`);
					return res.json();
				},
				(done, total) => {
					exported = done;
					exportTotal = total;
				}
			);
			downloadCsvTable(filename, PLAY_CSV_HEADERS, plays.map(playCsvRow));
		} catch (e) {
			console.error('선곡 기록 CSV 저장 실패', e);
			exportError = 'CSV를 만들지 못했습니다.';
		} finally {
			exporting = false;
		}
		// 그 사이 다른 곳을 골랐으면 그대로 둔다.
		await tick();
		const active = document.activeElement;
		if (hadFocus && (!active || active === document.body)) exportButton?.focus();
	}

	// 해제하면 단추가 사라지므로 포커스를 검색란으로 옮긴다.
	/** @param {import('$lib/playHistory.js').HistoryTarget} target */
	async function clearTarget(target) {
		targets = targets.filter((t) => t !== target);
		apply();
		await tick();
		searchInput.focus();
	}

	// 머리말의 기간과, 직접 지정을 고르면 입력란에 채울 범위(지금 보이는 기간, 전체 기간이면 이번 학기).
	// 학기의 범위를 받기 전에는 학기 목록(PeriodSelect)으로 짐작한다.
	let semesters = [];
	$: ({ text: periodText, shown: shownRange } = historyPeriod(
		{ period, start: customStart, end: customEnd },
		current,
		semesterFilters,
		semesters
	));
	$: statLink = statHref({
		period,
		start: customStart,
		end: customEnd,
		q,
		userId,
		includeMentees,
		requested
	});
	$: hasMore = count !== null && offset < count;
	// 탭 제목: id 필터(이름을 찾기 전에는 '작곡가 #12'), 지기, 기간(이번 학기는 빼고).
	// 검색어와 신청곡은 넣지 않는다: '가상 작곡가 D · 전체 기간 · 선곡 기록'.
	$: tabTitle = pageTitle(
		...targets.map((t) => targetNames[t.param] || targetText(t, null)),
		memberFileText({ userId, name: userName, includeMentees }),
		periodTitle({ period, start: customStart, end: customEnd }, semesters),
		'선곡 기록'
	);
</script>

<svelte:head>
	<title>{tabTitle}</title>
</svelte:head>

<div class="history-page">
	<header class="page-header">
		<div class="title-group">
			<h1>선곡 기록</h1>
			<span class="period">{periodText}</span>
			<a class="stat-link" href={statLink}>통계</a>
		</div>
	</header>

	<div class="toolbar">
		<form class="search" role="search" on:submit|preventDefault={onSearch}>
			<input
				type="search"
				bind:value={query}
				bind:this={searchInput}
				placeholder="작곡가, 곡, 연주자, 지휘자, 오케스트라"
				aria-label="선곡 검색"
			/>
			<button type="submit">검색</button>
		</form>
		<div class="filters">
			{#each targets as target (target.param)}
				<span class="target">
					{targetLabels[target.param]}
					<button
						class="tool-btn"
						on:click={() => clearTarget(target)}
						aria-label={`${targetLabels[target.param]} 필터 해제`}
					>
						해제
					</button>
				</span>
			{/each}
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
			<select value={requested} on:change={onRequestedChange} aria-label="신청곡">
				<option value="">신청곡 포함</option>
				<option value="true">신청곡만</option>
				<option value="false">신청곡 제외</option>
			</select>
		</div>
	</div>

	<div class="result-bar">
		<p class="result-count" aria-live="polite">
			{#if count !== null}
				총 {count.toLocaleString()}곡{#if q}&nbsp;· '{q}' 검색{/if}
			{/if}
		</p>
		<div class="export">
			<span class="more-error" aria-live="polite">{exportError}</span>
			<button
				class="tool-btn"
				bind:this={exportButton}
				on:click={exportCsv}
				disabled={!count || exporting}
				title="조건에 맞는 선곡을 모두 CSV로 저장"
			>
				{exporting
					? `CSV 준비 중… ${exported.toLocaleString()} / ${exportTotal.toLocaleString()}`
					: 'CSV 저장'}
			</button>
		</div>
	</div>

	<section class="card" aria-label="선곡 목록" tabindex="-1" bind:this={listCard}>
		{#if rows.length > 0}
			<PlayTable {rows} />
		{:else if loading}
			<div class="placeholder">불러오는 중...</div>
		{:else if error}
			<div class="placeholder error">
				{error}
				<button class="tool-btn" on:click={retryList} aria-label="선곡 목록 다시 시도"
					>다시 시도</button
				>
			</div>
		{:else if count === 0}
			<div class="placeholder">조건에 맞는 선곡이 없습니다</div>
		{/if}
	</section>

	{#if rows.length > 0}
		<div class="more" bind:this={moreBar}>
			{#if error}
				<span class="more-error">더 불러오지 못했습니다.</span>
				<button class="tool-btn" on:click={loadMore}>다시 시도</button>
			{:else if hasMore}
				<button class="tool-btn" on:click={loadMore} disabled={loading}>
					{loading ? '불러오는 중...' : '더 보기'}
				</button>
				<span class="more-count">{rows.length.toLocaleString()} / {count.toLocaleString()}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* 통계 페이지와 같은 여백·머리말·컨트롤 */
	.history-page {
		padding: 24px 32px;
		width: 100%;
		box-sizing: border-box;
	}
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
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
	.period,
	.result-count,
	.more-count {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	.stat-link {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		text-underline-offset: 3px;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 16px;
	}
	.search,
	.filters {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
	}
	.filters {
		flex-wrap: wrap;
		gap: 10px 16px;
	}
	input,
	select {
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
		padding: 6px 10px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		background: var(--secondary-secondary-50, #fffdfc);
		color: var(--gray-gray-950, #1a1a1a);
	}
	input[type='search'] {
		width: 300px;
	}
	.search button,
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
	.search button:hover,
	.tool-btn:hover {
		background: var(--secondary-secondary-200, #fdf1e4);
	}
	/* 통계 drill-down 에서 온 id 필터: 입력란과 같은 테두리 */
	.target {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 4px 6px 4px 10px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		background: var(--secondary-secondary-50, #fffdfc);
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-950, #1a1a1a);
	}
	.tool-btn:disabled {
		cursor: default;
		opacity: 0.6;
	}
	.result-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 20px 0 8px;
	}
	.result-count {
		min-height: 1.5em;
		margin: 0;
	}
	.export {
		display: flex;
		align-items: center;
		gap: 12px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		font-variant-numeric: tabular-nums;
	}
	/* ChartCard 와 같은 카드 */
	.card {
		background: var(--secondary-secondary-50, #fffdfc);
		border: 1px solid var(--gray-gray-300, #d4d4d4);
		border-radius: 8px;
		box-shadow: 4px 4px 5px 0px rgba(0, 0, 0, 0.08);
		padding: 12px;
	}
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		height: 160px;
		color: var(--gray-gray-500, #9f9f9f);
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
	}
	.placeholder.error,
	.more-error {
		color: var(--secondary-secondary-800, #95560d);
	}
	.more {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		margin-top: 16px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
	}
</style>
