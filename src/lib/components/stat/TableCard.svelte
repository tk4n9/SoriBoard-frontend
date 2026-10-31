<script>
	import DataTable from './DataTable.svelte';
	import { placeholderText } from '$lib/statTable.js';
	import { todayStamp } from '$lib/csv.js';
	import { downloadCsvTable, tableCsv } from '$lib/csvTable.js';
	import { downloadName } from '$lib/statFileName.js';

	// 차트 없이 표만 있는 통계 카드(처음 튼 작곡가·곡). 모양·문구·단추는 ChartCard 와 같다.
	export let title = '';
	export let subtitle = ''; // 표의 부제이자 설명(DataTable)
	/** @type {import('$lib/statTable.js').Table | null} */
	export let table = null; // 행이 없으면 null(빈 카드)
	/** @type {(string | null)[]} */
	export let links = []; // 행마다 이름 칸의 링크(DataTable 의 links)
	export let loading = false;
	export let error = ''; // 불러오기 실패 문구
	/** @type {(() => void) | null} */
	export let retry = null; // 주면 실패한 카드에 '다시 시도' 단추가 보인다.
	/** @type {string | string[]} */
	export let fileTag = ''; // 내려받는 파일 이름에서 제목 뒤에 붙는 보기(statFileName.js)
	export let emptyText = ''; // 주면 부르지 않은 카드에 이 문구를 보인다(예: 기간의 시작이 없을 때).

	let card;

	// 누르면 단추가 사라지므로, 포커스가 본문으로 떨어지지 않도록 먼저 카드로 옮긴다.
	function onRetry() {
		card?.focus();
		retry?.();
	}

	$: canExport = Boolean(table) && !loading && !error && !emptyText;

	function exportCsv() {
		if (!canExport || !table) return;
		const { headers, rows } = tableCsv(table);
		downloadCsvTable(downloadName(['통계', title, fileTag, todayStamp()], 'csv'), headers, rows);
	}
</script>

<div class="card" bind:this={card} tabindex="-1" role="group" aria-label={title}>
	<div class="toolbar">
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

	<div class="table-area">
		{#if loading || error || emptyText || !table}
			<!-- 제목은 표가 보이므로, 표가 없으면 어느 카드인지 여기서 밝힌다(ChartCard 와 같다). -->
			<div class="placeholder" class:error={!loading && error}>
				{!loading && !error && emptyText ? emptyText : placeholderText(title, { loading, error })}
				{#if !loading && error && retry}
					<button class="tool-btn" on:click={onRetry} aria-label={`${title} 다시 시도`}>
						다시 시도
					</button>
				{/if}
			</div>
		{:else}
			<DataTable {table} {title} {subtitle} {links} />
		{/if}
	</div>
</div>

<style>
	/* ChartCard 의 카드·단추·자리 문구와 같은 모양 */
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
	.table-area {
		flex: 1;
		min-height: 340px;
	}
	.placeholder {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: center;
		justify-content: center;
		height: 340px;
		padding: 0 24px;
		text-align: center;
		color: var(--gray-gray-500, #9f9f9f);
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
	}
	.placeholder.error {
		color: var(--secondary-secondary-800, #95560d);
	}
</style>
