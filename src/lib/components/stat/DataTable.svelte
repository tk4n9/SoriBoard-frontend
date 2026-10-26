<script context="module">
	let nextId = 0;
</script>

<script>
	// 차트 카드의 '표로 보기': 차트와 같은 제목·부제와 수치를 표로 보인다(statTable.js 의 표).
	/** @type {import('$lib/statTable.js').Table} */
	export let table;
	export let title = '';
	export let subtitle = '';

	const titleId = `stat-table-${++nextId}`;
</script>

<div class="table-view">
	<div class="table-title" id={titleId}>{title}</div>
	{#if subtitle}
		<div class="table-subtitle">{subtitle}</div>
	{/if}
	<!-- 카드 높이 안에서 스크롤하므로, 키보드로도 스크롤할 수 있게 영역에 포커스를 준다. -->
	<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
	<div class="table-scroll" role="region" aria-labelledby={titleId} tabindex="0">
		<table aria-labelledby={titleId}>
			<thead>
				<tr>
					{#each table.columns as column}
						<th scope="col" class:numeric={column.numeric}>{column.name}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each table.rows as row}
					<tr>
						{#each row as cell, i}
							{#if i === table.rowHeader}
								<th scope="row" class:numeric={table.columns[i].numeric}>{cell}</th>
							{:else}
								<td class:numeric={table.columns[i].numeric}>{cell}</td>
							{/if}
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.table-view {
		display: flex;
		flex-direction: column;
		height: 340px;
	}
	/* 차트 제목·부제(chartOptions.js 의 titleBlock)와 같은 글꼴·색 */
	.table-title {
		margin-top: 2px;
		text-align: center;
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: 18px;
		font-weight: 700;
		color: var(--gray-gray-950, #1a1a1a);
	}
	.table-subtitle {
		margin-top: 4px;
		text-align: center;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: 12px;
		color: var(--gray-gray-600, #7c7c7c);
	}
	.table-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		margin-top: 12px;
		border: 1px solid var(--gray-gray-300, #d4d4d4);
		border-radius: 4px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-950, #1a1a1a);
	}
	th,
	td {
		padding: 5px 10px;
		text-align: left;
		border-bottom: 1px solid var(--gray-gray-300, #d4d4d4);
	}
	tbody th {
		font-weight: 400;
	}
	thead th {
		position: sticky;
		top: 0;
		background: var(--secondary-secondary-100, #fef9f3);
		color: var(--gray-gray-600, #7c7c7c);
		font-weight: 500;
	}
	tbody tr:last-child > * {
		border-bottom: none;
	}
	/* 수치 칸은 내용만큼, 남는 폭은 이름 칸에 */
	.numeric {
		width: 1%;
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
