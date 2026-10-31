<script>
	import { createEventDispatcher, tick } from 'svelte';
	import {
		SPELLING_KINDS,
		duplicatesSearch,
		rowLinks,
		groupHeading,
		spellingSummary
	} from '$lib/catalogSpelling.js';

	// 작곡가 정리의 '표기 정리': 표기만 다른 이름의 묶음(catalog/duplicates/)과 각 표기의 선곡 수.
	// 읽기 전용이다. 종류가 바뀌면 다시 불러오고, 가장 최근 요청의 응답만 반영한다.
	export let kind = 'composer';

	const dispatch = createEventDispatcher();

	/** @type {import('$lib/catalogSpelling.js').SpellingGroup[]} */
	let groups = [];
	let loadedKind = '';
	let loading = false;
	let error = '';
	let requestId = 0;

	/** @param {string} target */
	async function load(target) {
		const id = ++requestId;
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/catalog/duplicates${duplicatesSearch(target)}`);
			if (!res.ok) throw new Error(`catalog/duplicates ${res.status}`);
			const result = await res.json();
			if (id !== requestId) return;
			groups = result.groups ?? [];
			loadedKind = target;
		} catch (e) {
			if (id !== requestId) return;
			console.error('표기 정리 로딩 실패', e);
			error = '불러오지 못했습니다';
		} finally {
			if (id === requestId) loading = false;
		}
	}

	$: load(kind);

	// '다시 시도'는 누르면 '불러오는 중...'이나 표로 바뀌어 사라지므로, 먼저 카드로 포커스를 옮긴다.
	// 또 실패했는데 포커스가 아직 카드에 있으면 새 '다시 시도'로 되돌린다.
	/** @type {HTMLElement} */
	let card;
	async function retryList(e) {
		const hadFocus = document.activeElement === e.currentTarget;
		if (hadFocus) card?.focus();
		await load(kind);
		if (!hadFocus || !error) return;
		await tick();
		if (document.activeElement === card) card.querySelector('.placeholder.error button')?.focus();
	}

	function onKindChange() {
		dispatch('change', kind);
	}

	// 표는 불러온 종류의 열로 그린다(새 종류를 불러오는 동안에는 흐리게).
	$: spec = SPELLING_KINDS.find((s) => s.kind === loadedKind);
	$: extra = loadedKind === 'player' ? '악기' : loadedKind === 'music' ? '작곡가' : '';
	$: columns = extra ? 4 : 3;
</script>

<p class="hint">
	띄어쓰기·점·대소문자·줄표만 다른 이름을 묶었습니다(곡은 같은 작곡가의 같은 작품 번호). 같은
	대상인지는 직접 확인하세요. 여기서는 합치지 않습니다.
</p>

<div class="toolbar">
	<label class="kind">
		종류
		<select bind:value={kind} on:change={onKindChange}>
			{#each SPELLING_KINDS as option}
				<option value={option.kind}>{option.label}</option>
			{/each}
		</select>
	</label>
	<p class="result-count" aria-live="polite">
		{#if spec && !loading && !error}{spec.label} · {spellingSummary(groups)}{/if}
	</p>
</div>

<section class="card" aria-label="표기 정리" tabindex="-1" bind:this={card}>
	{#if error}
		<div class="placeholder error">
			{error}
			<button class="tool-btn" on:click={retryList} aria-label="표기 정리 다시 시도"
				>다시 시도</button
			>
		</div>
	{:else if !spec}
		<div class="placeholder">불러오는 중...</div>
	{:else if groups.length === 0}
		<div class="placeholder" class:stale={loading}>{spec.empty}</div>
	{:else}
		<table aria-label={`표기 정리: ${spec.label}`} class:stale={loading}>
			<thead>
				<tr>
					<th scope="col">{loadedKind === 'music' ? '곡' : '표기'}</th>
					{#if extra}<th scope="col" class="extra">{extra}</th>{/if}
					<th scope="col" class="num">선곡 수</th>
					<th scope="col" class="id">id</th>
				</tr>
			</thead>
			{#each groups as group}
				{@const heading = groupHeading(group)}
				<tbody>
					<tr class="group">
						<th scope="rowgroup" colspan={columns}>
							<span class="spelling">{heading.title}</span>
							<span class="meta">{heading.meta}</span>
						</th>
					</tr>
					{#each group.rows as row (row.id)}
						{@const links = rowLinks(loadedKind, row)}
						<tr>
							<th scope="row">
								{#if links.name}
									<a class="spelling" href={links.name}>{row.name}</a>
								{:else}
									<span class="spelling">{row.name}</span>
								{/if}
							</th>
							{#if loadedKind === 'player'}
								<td>{row.instrument || '—'}</td>
							{:else if loadedKind === 'music'}
								<td>
									{#if links.composer}
										<a class="spelling" href={links.composer}>{row.composer_name}</a>
									{:else}
										<span class="spelling">{row.composer_name ?? '—'}</span>
									{/if}
								</td>
							{/if}
							<td class="num">
								{#if links.count}
									<a
										class="count"
										href={links.count}
										title="선곡 기록에서 보기"
										aria-label={`${row.name} 선곡 ${row.count.toLocaleString()}곡 선곡 기록에서 보기`}
										>{row.count.toLocaleString()}</a
									>
								{:else}
									{row.count.toLocaleString()}
								{/if}
							</td>
							<td class="id">#{row.id}</td>
						</tr>
					{/each}
				</tbody>
			{/each}
		</table>
	{/if}
</section>

<style>
	/* 작곡가 목록과 같은 안내·컨트롤·카드·표 */
	.hint,
	.result-count {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	.hint {
		margin: 0 0 16px;
	}
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 16px;
		margin-bottom: 12px;
	}
	.result-count {
		min-height: 1.5em;
		margin: 0;
	}
	.kind {
		display: flex;
		align-items: center;
		gap: 10px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	select {
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
		padding: 6px 10px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		background: var(--secondary-secondary-50, #fffdfc);
		color: var(--gray-gray-950, #1a1a1a);
	}
	.tool-btn {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		background: var(--secondary-secondary-100, #fef9f3);
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 4px;
		padding: 4px 12px;
		cursor: pointer;
	}
	.tool-btn:hover {
		background: var(--secondary-secondary-200, #fdf1e4);
	}
	.card {
		background: var(--secondary-secondary-50, #fffdfc);
		border: 1px solid var(--gray-gray-300, #d4d4d4);
		border-radius: 8px;
		box-shadow: 4px 4px 5px 0px rgba(0, 0, 0, 0.08);
		padding: 12px;
	}
	.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		height: 160px;
		color: var(--gray-gray-500, #9f9f9f);
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
	}
	.placeholder.error {
		color: var(--secondary-secondary-800, #95560d);
	}
	.stale {
		opacity: 0.6;
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
		padding: 6px 10px;
		text-align: left;
		vertical-align: middle;
		border-bottom: 1px solid var(--gray-gray-300, #d4d4d4);
	}
	tbody th {
		font-weight: 400;
	}
	thead th {
		background: var(--secondary-secondary-100, #fef9f3);
		color: var(--gray-gray-600, #7c7c7c);
		font-weight: 500;
	}
	/* 묶음의 머리줄: 가장 많이 튼 표기와 표기 수·선곡 수 */
	tr.group th {
		padding-top: 14px;
		font-weight: 500;
		border-bottom-color: var(--primary-primary-600, #c8ad8f);
	}
	tbody tr:not(.group) th {
		padding-left: 24px;
	}
	tbody:last-child tr:last-child > * {
		border-bottom: none;
	}
	/* 표기의 차이(겹친 띄어쓰기 등)가 그대로 보이도록 */
	.spelling {
		white-space: pre-wrap;
	}
	.meta {
		margin-left: 8px;
		font-weight: 400;
		color: var(--gray-gray-600, #7c7c7c);
	}
	tbody a {
		color: inherit;
		text-decoration-color: var(--gray-gray-500, #656667);
		text-underline-offset: 3px;
	}
	tbody a:hover {
		text-decoration-thickness: 2px;
	}
	/* 선곡 수 링크: 통계의 숫자 링크처럼 밑줄은 가리키거나 키보드로 고를 때만 */
	tbody a.count {
		text-decoration: none;
	}
	tbody a.count:hover,
	tbody a.count:focus-visible {
		text-decoration: underline;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	th.num {
		width: 10%;
	}
	th.extra {
		width: 28%;
	}
	.id {
		width: 64px;
		text-align: right;
		color: var(--gray-gray-500, #9f9f9f);
		font-variant-numeric: tabular-nums;
	}
</style>
