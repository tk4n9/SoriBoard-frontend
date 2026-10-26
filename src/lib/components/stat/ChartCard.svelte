<script>
	import EChart from './EChart.svelte';
	import { downloadCsv, downloadDataUrl, todayStamp } from '$lib/csv.js';

	export let title = '';
	export let option = null; // ECharts option (제목/부제 포함)
	export let data = null; // { labels, values } — CSV 내보내기용
	export let csvHeaders = ['항목', '횟수'];
	export let loading = false;
	export let note = ''; // 데이터 경고 등
	export let error = ''; // 불러오기 실패 문구

	let chartRef;

	$: hasData = data && data.labels && data.labels.length > 0;
	// 불러오는 동안 data 는 아직 이전 필터의 것이고 차트는 내려가 있으므로 저장을 막는다.
	$: canExport = hasData && !loading;

	function exportPng() {
		const url = chartRef && chartRef.getPng();
		if (url) downloadDataUrl(`통계_${title}_${todayStamp()}.png`, url);
	}

	function exportCsv() {
		if (hasData) downloadCsv(`통계_${title}_${todayStamp()}.csv`, data.labels, data.values, csvHeaders);
	}
</script>

<div class="card">
	<div class="toolbar">
		<button
			class="tool-btn"
			on:click={exportPng}
			disabled={!canExport}
			title="이미지(PNG)로 저장"
			aria-label={`${title} PNG 저장`}
		>
			PNG 저장
		</button>
		<button
			class="tool-btn"
			on:click={exportCsv}
			disabled={!canExport}
			title="데이터(CSV)로 저장"
			aria-label={`${title} CSV 저장`}
		>
			CSV 저장
		</button>
	</div>

	<div class="chart-area">
		{#if loading}
			<div class="placeholder">불러오는 중...</div>
		{:else if error}
			<!-- 제목은 차트가 그리므로, 실패하면 어느 카드인지 여기서 밝힌다. -->
			<div class="placeholder error">{title} — {error}</div>
		{:else if !hasData}
			<div class="placeholder">데이터가 없습니다</div>
		{:else}
			<EChart bind:this={chartRef} {option} />
		{/if}
	</div>

	{#if note}
		<div class="note">{note}</div>
	{/if}
</div>

<style>
	.card {
		background: var(--secondary-secondary-50, #fffdfc);
		border: 1px solid var(--gray-gray-300, #d4d4d4);
		border-radius: 8px;
		box-shadow: 4px 4px 5px 0px rgba(0, 0, 0, 0.08);
		padding: 12px;
		display: flex;
		flex-direction: column;
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
		/* exact swatches instead of a 40% opacity blend */
		color: var(--gray-gray-500);
		border-color: var(--gray-gray-400);
		background: var(--secondary-secondary-50);
		cursor: default;
	}
	.chart-area {
		flex: 1;
		min-height: 340px;
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
	.note {
		margin-top: 4px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--secondary-secondary-800, #95560d);
		text-align: center;
	}
</style>
