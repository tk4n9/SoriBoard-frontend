<script>
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import PeriodSelect from '$lib/components/stat/PeriodSelect.svelte';
	import MemberSelect from '$lib/components/stat/MemberSelect.svelte';
	import PlayTable from '$lib/components/stat/PlayTable.svelte';
	import { CURRENT, ALL, CUSTOM, currentSemesterRange, periodRangeText } from '$lib/statPeriod.js';
	import {
		readHistoryQuery,
		historyHref,
		statHref,
		playsParams,
		appendPage
	} from '$lib/playHistory.js';

	// 검색어·기간·지기·신청곡은 URL에 둔다(링크로 같은 목록을 연다). 페이지가 시작될 때 한 번만 읽는다.
	const initial = readHistoryQuery($page.url.searchParams);
	let period = initial.period; // 'current' | 'all' | 'custom' | 학기 id
	let customStart = initial.start;
	let customEnd = initial.end;
	let q = initial.q; // 적용된 검색어
	let query = q; // 검색란의 값. 검색을 누르면 q 로 옮긴다.
	let userId = initial.userId;
	let includeMentees = initial.includeMentees;
	let requested = initial.requested; // '' | 'true' | 'false'
	const current = currentSemesterRange();

	const filter = () => ({
		period,
		start: customStart,
		end: customEnd,
		q,
		userId,
		includeMentees,
		requested
	});

	/** @type {import('$lib/playHistory.js').Play[]} */
	let rows = [];
	let count = null; // 조건에 맞는 선곡 수(plays/ 의 count)
	let offset = 0; // 지금까지 받은 행 수(다음 쪽의 offset)
	let loading = false;
	let error = '';
	// 가장 최근 요청의 응답만 반영한다. 필터를 바꾸면 진행 중인 '더 보기'의 응답도 버린다.
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
			if (id !== requestId) return;
			rows = appendPage(rows, result.results);
			offset += result.results.length;
			count = result.count;
		} catch (e) {
			if (id !== requestId) return;
			console.error('선곡 기록 로딩 실패', e);
			error = '불러오지 못했습니다';
		} finally {
			if (id === requestId) loading = false;
		}
	}

	// 필터가 바뀌면 URL을 바꾸고(히스토리를 쌓지 않고, 포커스·스크롤도 그대로) 처음부터 다시 부른다.
	function apply() {
		goto(historyHref(filter()), { replaceState: true, keepFocus: true, noScroll: true });
		load();
	}

	onMount(() => load());

	function onSearch() {
		q = query.trim();
		query = q;
		apply();
	}
	const onPeriodChange = (e) => {
		period = e.detail;
		apply();
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

	$: periodText =
		period === CURRENT
			? periodRangeText(current)
			: period === ALL
				? '전체 기간'
				: period === CUSTOM
					? periodRangeText({ start: customStart, end: customEnd })
					: '';
	// 직접 지정을 고르면 입력란에 채울 범위(학기의 날짜는 모르므로 이번 학기).
	$: shownRange = period === CUSTOM ? { start: customStart, end: customEnd } : current;
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
</script>

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
				placeholder="작곡가, 곡, 연주자, 지휘자, 오케스트라"
				aria-label="선곡 검색"
			/>
			<button type="submit">검색</button>
		</form>
		<div class="filters">
			<PeriodSelect
				bind:period
				bind:start={customStart}
				bind:end={customEnd}
				{shownRange}
				on:change={onPeriodChange}
			/>
			<MemberSelect
				bind:userId
				bind:includeMentees
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

	<p class="result-count" aria-live="polite">
		{#if count !== null}
			총 {count.toLocaleString()}곡{#if q}&nbsp;· '{q}' 검색{/if}
		{/if}
	</p>

	<section class="card" aria-label="선곡 목록">
		{#if rows.length > 0}
			<PlayTable {rows} />
		{:else if loading}
			<div class="placeholder">불러오는 중...</div>
		{:else if error}
			<div class="placeholder error">
				{error}
				<button class="tool-btn" on:click={() => load()}>다시 시도</button>
			</div>
		{:else if count === 0}
			<div class="placeholder">조건에 맞는 선곡이 없습니다</div>
		{/if}
	</section>

	{#if rows.length > 0}
		<div class="more">
			{#if error}
				<span class="more-error">더 불러오지 못했습니다.</span>
				<button class="tool-btn" on:click={() => load(true)}>다시 시도</button>
			{:else if hasMore}
				<button class="tool-btn" on:click={() => load(true)} disabled={loading}>
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
	.tool-btn:disabled {
		cursor: default;
		opacity: 0.6;
	}
	.result-count {
		min-height: 1.5em;
		margin: 20px 0 8px;
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
