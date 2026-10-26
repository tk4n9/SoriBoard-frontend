<script>
	import EChart from './EChart.svelte';
	import DataTable from './DataTable.svelte';
	import { seriesTable } from '$lib/statTable.js';
	import { downloadCsv, downloadDataUrl, todayStamp } from '$lib/csv.js';

	export let title = '';
	export let option = null; // ECharts option (제목/부제 포함)
	export let data = null; // { labels, values } — CSV 내보내기용
	export let csvHeaders = ['항목', '횟수'];
	export let loading = false;
	export let note = ''; // 데이터 경고 등
	export let noteLink = null; // { href, text }: 경고 뒤에 붙는 링크(예: 작곡가 정리)
	export let error = ''; // 불러오기 실패 문구
	export let table = null; // '표로 보기'의 표(statTable.js). 없으면 data 와 csvHeaders 로 만든다.
	export let rowLabel = ''; // 주면 표의 이름 칸이 단추가 된다(예: '곡 보기', DataTable 의 rowselect).

	let chartRef;
	// 표로 보기: 캔버스는 키보드·화면 낭독기로 읽을 수 없으므로 같은 수치를 표로 보인다.
	// 다시 불러와도 그대로 두고, 차트는 숨긴 채 남겨 PNG 저장이 계속 된다.
	let showTable = false;

	$: hasData = data && data.labels && data.labels.length > 0;
	// 불러오는 동안 data 는 아직 이전 필터의 것이고 차트는 내려가 있으므로 저장을 막는다.
	$: canExport = hasData && !loading;
	$: shownTable =
		table ??
		(hasData
			? seriesTable(data.labels, csvHeaders[0], [{ name: csvHeaders[1], values: data.values }])
			: null);

	function exportPng() {
		const url = chartRef && chartRef.getPng();
		if (url) downloadDataUrl(`통계_${title}_${todayStamp()}.png`, url);
	}

	function exportCsv() {
		if (hasData) downloadCsv(`통계_${title}_${todayStamp()}.csv`, data.labels, data.values, csvHeaders);
	}
</script>

<div class="card">
	<button
		class="tool-btn view-toggle"
		class:active={showTable}
		aria-pressed={showTable}
		on:click={() => (showTable = !showTable)}
		title="차트의 수치를 표로 보기"
		aria-label={`${title} 표로 보기`}
	>
		표로 보기
	</button>
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
			<div class="chart-view" class:hidden={showTable && shownTable}>
				<EChart bind:this={chartRef} {option} on:itemclick />
			</div>
			{#if showTable && shownTable}
				<DataTable
					table={shownTable}
					{title}
					subtitle={option?.title?.subtext ?? ''}
					{rowLabel}
					on:rowselect
				/>
			{/if}
		{/if}
	</div>

	{#if note}
		<div class="note">
			{note}{#if noteLink}&nbsp;· <a href={noteLink.href}>{noteLink.text}</a>{/if}
		</div>
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
	/* 가운데 차트 제목과 겹치지 않도록 오른쪽 저장 버튼들과 떨어진 왼쪽 위에 둔다. */
	.view-toggle {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 2;
	}
	.view-toggle.active {
		background: var(--action-bg);
		color: var(--action-fg);
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
	/* 차트 크기 계산(height: 100%)이 그대로 이어지도록 상자를 만들지 않는다. */
	.chart-view {
		display: contents;
	}
	.chart-view.hidden {
		display: none;
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
	.note a {
		color: inherit;
		text-underline-offset: 3px;
	}
</style>
