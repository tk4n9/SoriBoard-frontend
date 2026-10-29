<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import {
		CURRENT,
		ALL,
		CUSTOM,
		sortSemesters,
		semesterLabel,
		knownPeriod,
		rangeError
	} from '$lib/statPeriod.js';

	export let period = CURRENT; // 'current' | 'all' | 'custom' | 학기 id
	// 직접 지정의 적용된 범위(YYYY-MM-DD, 빈 값 = 그쪽이 열림).
	export let start = '';
	export let end = '';
	// 직접 지정을 고를 때 입력란에 채울 범위: 지금 보이는 기간.
	export let shownRange = { start: '', end: '' };

	const dispatch = createEventDispatcher();
	const errorId = 'period-range-error';
	const listErrorId = 'period-list-error';
	// 불러온 학기 목록(최신순). 페이지가 bind 해 시계열 카드의 학기 링크에 쓴다.
	export let semesters = [];
	let listError = '';
	// 입력란의 값. '적용'을 누르고 범위가 맞을 때만 start·end 로 옮긴다.
	let draftStart = start;
	let draftEnd = end;

	// 학기 목록을 부른다(처음, 그리고 '다시 시도'). 받았는지를 돌려준다.
	async function loadList() {
		let loaded = false;
		try {
			const res = await fetch('/api/semester');
			if (!res.ok) throw new Error(`Failed to fetch semesters: ${res.status}`);
			semesters = sortSemesters(await res.json());
			loaded = true;
		} catch (e) {
			console.error('학기 목록을 불러오지 못했습니다.', e);
			listError = '학기 목록을 불러오지 못했습니다.';
		}
		// 링크의 학기가 목록에 없으면 이번 학기로 되돌린다(목록을 못 받으면 그대로 둔다).
		const known = knownPeriod(period, loaded ? semesters : null);
		if (known !== period) {
			period = known;
			dispatch('change', period);
		}
		return loaded;
	}

	onMount(loadList);

	// 학기 목록의 '다시 시도': 부르는 동안 단추는 자리에 두고(aria-disabled) 누름만 무시한다.
	// disabled 로 끄면 포커스가 본문으로 떨어진다. 문구는 비워 두어, 또 실패하면 다시 읽히게 한다.
	// 받으면 단추가 사라지므로, 포커스가 단추에 있었으면 select 로 옮긴다.
	let retrying = false;
	async function retryList(e) {
		if (retrying) return;
		const button = e.currentTarget;
		retrying = true;
		listError = '';
		const loaded = await loadList();
		retrying = false;
		// select 에 bind:this 를 걸면 목록이 와도 링크의 값을 다시 고르지 않으므로(Svelte 4) 단추에서 찾는다.
		if (loaded && document.activeElement === button)
			button.closest('.period-select')?.querySelector('select')?.focus();
	}

	function onChange(e) {
		period = e.target.value;
		if (period === CUSTOM) {
			draftStart = start = shownRange.start;
			draftEnd = end = shownRange.end;
		}
		dispatch('change', period);
	}

	$: error = rangeError({ start: draftStart, end: draftEnd });
	// 직접 지정에서는 학기 목록을 쓰지 않고 그 아래 자리는 범위 문구가 쓰므로 숨긴다.
	$: listNote = period === CUSTOM ? '' : listError;

	function apply() {
		if (error || (draftStart === start && draftEnd === end)) return;
		start = draftStart;
		end = draftEnd;
		dispatch('change', period);
	}
</script>

<div class="period-select">
	<select
		on:change={onChange}
		value={period}
		aria-label="기간"
		aria-invalid={listNote ? 'true' : undefined}
		aria-describedby={listNote ? listErrorId : undefined}
	>
		<option value={CURRENT}>이번 학기</option>
		{#each semesters as semester}
			<option value={String(semester.id)}>{semesterLabel(semester)}</option>
		{/each}
		<option value={ALL}>전체 기간</option>
		<option value={CUSTOM}>직접 지정</option>
	</select>
	{#if period === CUSTOM}
		<form class="range" on:submit|preventDefault={apply}>
			<input
				type="date"
				bind:value={draftStart}
				aria-label="시작일"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? errorId : undefined}
			/>
			<span aria-hidden="true">~</span>
			<input
				type="date"
				bind:value={draftEnd}
				aria-label="종료일"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? errorId : undefined}
			/>
			<button type="submit">적용</button>
			<p id={errorId} class="range-error" aria-live="polite">{error}</p>
		</form>
	{/if}
	<div class="list-note">
		<p id={listErrorId} class="list-error" aria-live="polite">{listNote}</p>
		{#if period !== CUSTOM && (listError || retrying)}
			<button
				class="tool-btn"
				on:click={retryList}
				aria-label="학기 목록 다시 시도"
				aria-disabled={retrying ? 'true' : undefined}
			>
				다시 시도
			</button>
		{/if}
	</div>
</div>

<style>
	.period-select {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	select,
	input {
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
		padding: 6px 10px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		background: var(--secondary-secondary-50, #fffdfc);
		color: var(--gray-gray-950, #1a1a1a);
	}
	input {
		padding: 5px 8px;
	}
	select[aria-invalid='true'],
	input[aria-invalid='true'] {
		border-color: var(--danger-fg);
	}
	.range {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin: 0;
		color: var(--gray-gray-600, #7c7c7c);
	}
	.range button {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		background: var(--secondary-secondary-100, #fef9f3);
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 4px;
		padding: 4px 12px;
		cursor: pointer;
	}
	/* 머리말 아래 여백에 띄워, 문구가 생겨도 머리말 높이가 바뀌지 않게 한다. */
	.range-error,
	.list-note {
		position: absolute;
		top: 100%;
		left: 0;
		margin: 2px 0 0;
		white-space: nowrap;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--danger-fg);
	}
	/* select 의 오른쪽 끝에 맞춰 왼쪽으로 펼친다: 바로 오른쪽 지기 select 의 문구와 겹치지 않게. */
	.list-note {
		left: auto;
		right: 0;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.list-error {
		margin: 0;
	}
	/* 다른 통계 화면의 tool-btn 과 같은 모양. 머리말 아래 여백에 들어가도록 위아래 여백은 뺐다. */
	.tool-btn {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		background: var(--secondary-secondary-100, #fef9f3);
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 4px;
		padding: 0 6px;
		cursor: pointer;
	}
	.tool-btn:hover:not([aria-disabled='true']) {
		background: var(--secondary-secondary-200, #fdf1e4);
	}
	.tool-btn[aria-disabled='true'] {
		color: var(--gray-gray-500);
		border-color: var(--gray-gray-400);
		background: var(--secondary-secondary-50);
		cursor: default;
	}
</style>
