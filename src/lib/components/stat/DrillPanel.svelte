<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import DataTable from './DataTable.svelte';
	import { rankTable } from '$lib/statTable.js';
	import { WORKS_LIMIT, workLabel } from '$lib/statDrill.js';
	import { closeOnEscape } from '$lib/escapeKey.js';
	import { downloadCsvTable, tableCsv } from '$lib/csvTable.js';
	import { todayStamp } from '$lib/csv.js';
	import { downloadName } from '$lib/statFileName.js';

	// 순위 카드의 막대·행에서 연 패널: 그 대상의 곡(stats/works, 같은 기간·범위).
	/** @type {import('$lib/statDrill.js').DrillTarget} */
	export let target;
	export let works = null; // stats/works 응답
	export let loading = false;
	export let error = '';
	export let scopeLabel = '';
	export let historyLink = ''; // 같은 기간·범위·대상의 선곡 기록
	export let composerLink = ''; // 작곡가면 그 작곡가 페이지
	// 주면 곡 이름이 그 곡의 선곡 기록으로 가는 링크가 된다(stats/works 의 항목 → 주소 또는 null).
	/** @type {((item: { id: number | null }) => string | null) | null} */
	export let workLink = null;
	/** @type {(() => void) | null} */
	export let retry = null; // 주면 불러오지 못한 패널에 '다시 시도' 단추가 보인다.
	/** @type {string | string[]} */
	export let fileTag = ''; // 내려받는 파일 이름에서 제목 뒤에 붙는 보기(기간, 지기 등, statFileName.js)

	const dispatch = createEventDispatcher();
	let panel;

	// 열리면(대상마다 새로 만든다) 패널로 포커스를 옮긴다. 그리드 아래라 화면 밖일 수 있으므로
	// 패널이 보일 만큼만 부드럽게 스크롤한다.
	onMount(() => {
		panel.focus({ preventScroll: true });
		panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});

	// 누르면 단추가 사라지므로, 포커스가 본문으로 떨어지지 않도록 먼저 패널로 옮긴다.
	function onRetry() {
		panel.focus();
		retry();
	}

	// 보이는 표 그대로(순위·곡·횟수) 저장한다. 파일 이름은 카드의 CSV 저장과 같은 꼴.
	function saveCsv() {
		if (!table) return;
		const { headers, rows } = tableCsv(table);
		downloadCsvTable(downloadName(['통계', title, fileTag, todayStamp()], 'csv'), headers, rows);
	}

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
	$: links = workLink ? items.map(workLink) : [];
</script>

<!-- 포커스가 패널 안에 있으면 Escape 도 닫기와 같다. -->
<section
	class="drill-panel"
	aria-label={title}
	tabindex="-1"
	bind:this={panel}
	use:closeOnEscape={() => dispatch('close')}
>
	<div class="actions">
		{#if composerLink}
			<a class="history-link" href={composerLink}>작곡가 페이지</a>
		{/if}
		{#if historyLink && works && works.total_plays > 0}
			<a class="history-link" href={historyLink}>
				{works.total_plays.toLocaleString()}곡 모두 보기
			</a>
		{/if}
		{#if !loading && !error && table}
			<button
				class="tool-btn"
				on:click={saveCsv}
				title="데이터(CSV)로 저장"
				aria-label={`${title} CSV 저장`}
			>
				CSV 저장
			</button>
		{/if}
		<button
			class="tool-btn"
			on:click={() => dispatch('close')}
			aria-label={`${title} 닫기`}
			aria-keyshortcuts="Escape"
		>
			닫기
		</button>
	</div>
	{#if !loading && !error && table}
		<DataTable {table} {title} {subtitle} {links} />
	{:else}
		<div class="panel-title">{title}</div>
		<div class="panel-subtitle">{subtitle}</div>
		{#if loading}
			<div class="placeholder">불러오는 중...</div>
		{:else if error}
			<div class="placeholder error">
				{error}
				{#if retry}
					<button class="tool-btn" on:click={onRetry} aria-label={`${title} 다시 시도`}>
						다시 시도
					</button>
				{/if}
			</div>
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
	.actions {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	/* 통계 머리말의 '선곡 기록' 링크와 같은 모양 */
	.history-link {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		text-underline-offset: 3px;
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
		gap: 10px;
		color: var(--secondary-secondary-800, #95560d);
	}
</style>
