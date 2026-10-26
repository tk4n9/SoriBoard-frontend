<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import DataTable from './DataTable.svelte';
	import { rankTable } from '$lib/statTable.js';
	import { WORKS_LIMIT, workLabel } from '$lib/statDrill.js';

	// 순위 카드의 막대·행에서 연 패널: 그 대상의 곡(stats/works, 같은 기간·범위).
	/** @type {import('$lib/statDrill.js').DrillTarget} */
	export let target;
	export let works = null; // stats/works 응답
	export let loading = false;
	export let error = '';
	export let scopeLabel = '';

	const dispatch = createEventDispatcher();
	let panel;

	// 열리면(대상마다 새로 만든다) 패널로 포커스를 옮긴다. 그리드 아래라 화면 밖일 수 있으므로
	// 패널이 보일 만큼만 부드럽게 스크롤한다.
	onMount(() => {
		panel.focus({ preventScroll: true });
		panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});

	$: title = `${target.name}의 곡`;
	$: items = works ? works.items : [];
	$: subtitle = works
		? `${target.noun} · ${scopeLabel} · 총 ${works.total_plays.toLocaleString()}곡` +
			(items.length >= WORKS_LIMIT ? ` · 상위 ${WORKS_LIMIT}곡` : '')
		: `${target.noun} · ${scopeLabel}`;
	$: table =
		items.length > 0 &&
		rankTable(
			{ labels: items.map((item) => workLabel(item, target)), values: items.map((i) => i.count) },
			'곡'
		);
</script>

<section class="drill-panel" aria-label={title} tabindex="-1" bind:this={panel}>
	<button class="tool-btn close" on:click={() => dispatch('close')} aria-label={`${title} 닫기`}>
		닫기
	</button>
	{#if !loading && !error && table}
		<DataTable {table} {title} {subtitle} />
	{:else}
		<div class="panel-title">{title}</div>
		<div class="panel-subtitle">{subtitle}</div>
		{#if loading}
			<div class="placeholder">불러오는 중...</div>
		{:else if error}
			<div class="placeholder error">{error}</div>
		{:else}
			<div class="placeholder">이 기간에는 선곡이 없습니다</div>
		{/if}
	{/if}
</section>

<style>
	/* ChartCard 의 카드·버튼과 같은 모양 */
	.drill-panel {
		margin-top: 16px;
		background: var(--secondary-secondary-50, #fffdfc);
		border: 1px solid var(--gray-gray-300, #d4d4d4);
		border-radius: 8px;
		box-shadow: 4px 4px 5px 0px rgba(0, 0, 0, 0.08);
		padding: 12px;
		position: relative;
	}
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
	.tool-btn:hover {
		background: var(--secondary-secondary-200, #fdf1e4);
	}
	.close {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 2;
	}
	/* DataTable 의 제목·부제와 같은 글꼴·색 */
	.panel-title {
		margin-top: 2px;
		text-align: center;
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: 18px;
		font-weight: 700;
		color: var(--gray-gray-950, #1a1a1a);
	}
	.panel-subtitle {
		margin-top: 4px;
		text-align: center;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: 12px;
		color: var(--gray-gray-600, #7c7c7c);
	}
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 160px;
		color: var(--gray-gray-500, #9f9f9f);
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
	}
	.placeholder.error {
		color: var(--secondary-secondary-800, #95560d);
	}
</style>
