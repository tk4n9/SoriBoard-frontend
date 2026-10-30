<script>
	import { sessionText, workText, workParts, performersText, jigiText } from '$lib/playHistory.js';
	import { composerHref } from '$lib/composerStats.js';

	// 선곡 기록의 결과 표. 날짜·타임은 그 타임 화면으로, 작곡가는 그 작곡가 페이지로 가는 링크다.
	/** @type {import('$lib/playHistory.js').Play[]} */
	export let rows = [];
	export let label = '선곡 기록';
	// 작곡가 링크가 열 기간({ period, start, end }, composerHref 와 같다). 없으면 전체 기간.
	/** @type {import('$lib/composerStats.js').ComposerPeriod | undefined} */
	export let composerPeriod = undefined;
</script>

<table aria-label={label}>
	<thead>
		<tr>
			<th scope="col">날짜·타임</th>
			<th scope="col">곡</th>
			<th scope="col">연주</th>
			<th scope="col">지기</th>
			<th scope="col" class="narrow">신청곡</th>
		</tr>
	</thead>
	<tbody>
		{#each rows as play (play.id)}
			{@const work = workParts(play)}
			<tr>
				<th scope="row" class="session">
					<a href={`/time_manage/${play.time_id}`} title="이 타임 열기">{sessionText(play)}</a>
				</th>
				<td>
					{#if work.composer || work.title}
						<div>
							{#if work.composerId}<a
									class="composer"
									href={composerHref(work.composerId, composerPeriod)}
									title="이 작곡가 페이지 열기">{work.composer}</a
								>{:else}{work.composer}{/if}{#if work.composer && work.title}{' - '}{/if}{work.title}
						</div>
					{:else}
						<div class="missing">{workText(play)}</div>
					{/if}
					{#if play.music_semi_title}
						<div class="semi">{play.music_semi_title}</div>
					{/if}
				</td>
				<td>{performersText(play)}</td>
				<td>{jigiText(play)}</td>
				<td class="narrow">{play.is_requested ? '신청곡' : ''}</td>
			</tr>
		{/each}
	</tbody>
</table>

<style>
	/* DataTable(표로 보기)과 같은 글꼴·선·머리줄 */
	table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-950, #1a1a1a);
	}
	th,
	td {
		padding: 6px 10px;
		text-align: left;
		vertical-align: top;
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
	.session {
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.session a,
	.composer {
		color: inherit;
		text-decoration-color: var(--gray-gray-500, #656667);
		text-underline-offset: 3px;
	}
	.session a:hover,
	.composer:hover {
		text-decoration-thickness: 2px;
	}
	.semi {
		margin-top: 2px;
		font-size: 12px;
		color: var(--gray-gray-600, #7c7c7c);
	}
	.missing {
		color: var(--gray-gray-500, #9f9f9f);
	}
	.narrow {
		width: 1%;
		white-space: nowrap;
	}
	td.narrow {
		color: var(--primary-primary-800, #6a5134);
	}
</style>
