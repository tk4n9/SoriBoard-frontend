<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import { CURRENT, ALL, sortSemesters, semesterLabel, knownPeriod } from '$lib/statPeriod.js';

	export let period = CURRENT; // 'current' | 'all' | 학기 id

	const dispatch = createEventDispatcher();
	let semesters = [];

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
		dispatch('change', period);
	}
</script>

<select on:change={onChange} value={period} aria-label="기간">
	<option value={CURRENT}>이번 학기</option>
	{#each semesters as semester}
		<option value={String(semester.id)}>{semesterLabel(semester)}</option>
	{/each}
	<option value={ALL}>전체 기간</option>
</select>

<style>
	select {
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
		padding: 6px 10px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		background: var(--secondary-secondary-50, #fffdfc);
		color: var(--gray-gray-950, #1a1a1a);
	}
</style>
