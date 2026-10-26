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
	let semesters = [];
	// 입력란의 값. '적용'을 누르고 범위가 맞을 때만 start·end 로 옮긴다.
	let draftStart = start;
	let draftEnd = end;

	onMount(async () => {
		try {
			const res = await fetch('/api/semester');
			if (!res.ok) throw new Error(`Failed to fetch semesters: ${res.status}`);
			semesters = sortSemesters(await res.json());
		} catch (e) {
			console.error('학기 목록을 불러오지 못했습니다.', e);
		}
		// 링크의 학기가 목록에 없으면 이번 학기로 되돌린다.
		const known = knownPeriod(period, semesters);
		if (known !== period) {
			period = known;
			dispatch('change', period);
		}
	});

	function onChange(e) {
		period = e.target.value;
		if (period === CUSTOM) {
			draftStart = start = shownRange.start;
			draftEnd = end = shownRange.end;
		}
		dispatch('change', period);
	}

	$: error = rangeError({ start: draftStart, end: draftEnd });

	function apply() {
		if (error || (draftStart === start && draftEnd === end)) return;
		start = draftStart;
		end = draftEnd;
		dispatch('change', period);
	}
</script>

<div class="period-select">
	<select on:change={onChange} value={period} aria-label="기간">
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
</div>

<style>
	.period-select {
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
	.range-error {
		position: absolute;
		top: 100%;
		left: 0;
		margin: 2px 0 0;
		white-space: nowrap;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--danger-fg);
	}
</style>
