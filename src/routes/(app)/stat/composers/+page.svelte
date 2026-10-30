<script>
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { composerHref } from '$lib/composerStats.js';
	import {
		ERAS,
		UNKNOWN_ERA,
		readCatalogQuery,
		catalogHref,
		composersSearch,
		unknownFirst,
		unknownCount,
		eraCell,
		draftOf,
		birthYearError,
		composerPatch,
		patchErrorText,
		replaceComposer
	} from '$lib/composerCatalog.js';
	import { readSpellingKind, catalogViewHref, DEFAULT_KIND } from '$lib/catalogSpelling.js';
	import SpellingVariants from '$lib/components/stat/SpellingVariants.svelte';

	// 작곡가 정리: 모든 작곡가의 시대·출생 연도·선곡 수. 시대 미상을 앞에 두고, 한 줄씩 고친다.
	// 검색어는 URL에 두고, 페이지가 시작될 때 한 번만 읽는다.
	let q = readCatalogQuery($page.url.searchParams); // 적용된 검색어
	let query = q; // 검색란의 값
	const thisYear = new Date().getFullYear();

	// 보기: null = 작곡가 목록, 아니면 표기 정리와 그 종류. 검색어처럼 URL에 둔다.
	let spellingKind = readSpellingKind($page.url.searchParams);

	/** @param {string | null} kind */
	function showView(kind) {
		spellingKind = kind;
		goto(catalogViewHref(q, kind), { replaceState: true, keepFocus: true, noScroll: true });
	}

	/** @type {import('$lib/composerCatalog.js').CatalogComposer[]} */
	let composers = [];
	let loaded = false;
	let loading = false;
	let error = '';
	// 가장 최근 검색의 응답만 반영한다.
	let requestId = 0;

	async function load() {
		const id = ++requestId;
		loading = true;
		error = '';
		editingId = null;
		try {
			const res = await fetch(`/api/composers${composersSearch(q)}`);
			if (!res.ok) throw new Error(`composers ${res.status}`);
			const result = await res.json();
			if (id !== requestId) return;
			composers = unknownFirst(result);
			loaded = true;
		} catch (e) {
			if (id !== requestId) return;
			console.error('작곡가 목록 로딩 실패', e);
			error = '불러오지 못했습니다';
		} finally {
			if (id === requestId) loading = false;
		}
	}
	onMount(load);

	// '다시 시도'는 누르면 '불러오는 중...'이나 이전 표로 바뀌어 사라지므로, 먼저 목록 카드로 포커스를
	// 옮긴다. 또 실패했는데 포커스가 아직 카드에 있으면 새 '다시 시도'로 되돌린다.
	/** @type {HTMLElement} */
	let listCard;
	async function retryList(e) {
		const hadFocus = document.activeElement === e.currentTarget;
		if (hadFocus) listCard?.focus();
		await load();
		if (!hadFocus || !error) return;
		await tick();
		if (document.activeElement === listCard)
			listCard.querySelector('.placeholder.error button')?.focus();
	}

	function onSearch() {
		q = query.trim();
		query = q;
		goto(catalogHref(q), { replaceState: true, keepFocus: true, noScroll: true });
		load();
	}

	// 한 번에 한 줄만 고친다. 저장하면 백엔드의 답(다시 정한 시대)으로 그 줄을 바꾸고, 자리는 그대로 둔다.
	/** @type {number | null} */
	let editingId = null;
	let draft = { birthYear: '', era: '' };
	let saving = false;
	let saveError = '';
	let status = ''; // 저장 결과(화면 낭독기에 알린다)
	/** @type {Record<number, HTMLButtonElement>} */
	const editButtons = {};
	/** @type {HTMLInputElement} */
	let yearInput;
	/** @type {HTMLButtonElement} */
	let saveButton;

	async function startEdit(composer) {
		editingId = composer.id;
		draft = draftOf(composer);
		saveError = '';
		status = '';
		await tick();
		yearInput?.focus();
	}

	// 수정 칸이 사라지므로 포커스를 그 줄의 '수정' 단추로 돌린다.
	async function stopEdit() {
		const id = editingId;
		editingId = null;
		saveError = '';
		await tick();
		if (id !== null) editButtons[id]?.focus();
	}

	$: yearError = editingId === null ? '' : birthYearError(draft.birthYear, thisYear);

	// 저장하는 동안에는 다른 줄을 열 수 없고(수정 단추가 꺼진다) Escape 도 듣지 않는다.
	// 그래서 답은 늘 저장한 그 줄에 닿는다. 검색으로 그 줄이 닫혔다면 결과를 상태 줄에 알린다.
	async function save(composer) {
		if (yearError || saving) return;
		const body = composerPatch(composer, draft);
		if (!body) return stopEdit();
		saving = true;
		saveError = '';
		let result = null;
		let failure = '';
		try {
			const res = await fetch(`/api/composers/${composer.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			result = await res.json().catch(() => null);
			if (!res.ok) failure = res.status === 400 ? patchErrorText(result) : '저장하지 못했습니다.';
			else if (!result) failure = '저장하지 못했습니다.';
		} catch (e) {
			console.error('작곡가 저장 실패', e);
			failure = '저장하지 못했습니다.';
		} finally {
			saving = false;
		}
		const open = editingId === composer.id;
		if (!failure) {
			composers = replaceComposer(composers, result);
			status = `‘${result.name}’ 저장됨 · 시대 ${result.era}`;
			if (open) await stopEdit();
		} else if (!open) {
			status = `‘${composer.name}’ 저장하지 못했습니다.`;
		} else {
			saveError = failure;
			// 누른 저장 단추가 잠시 꺼지며 포커스를 잃었다면 그 단추로 되돌린다.
			await tick();
			if (!document.activeElement || document.activeElement === document.body) saveButton?.focus();
		}
	}

	function onEditKeydown(e, composer) {
		if (e.key === 'Enter') {
			e.preventDefault();
			save(composer);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (!saving) stopEdit();
		}
	}

	$: unknown = unknownCount(composers);
</script>

<svelte:head>
	<title>작곡가 정리</title>
</svelte:head>

<div class="catalog-page">
	<header class="page-header">
		<div class="title-group">
			<h1>작곡가 정리</h1>
			<a class="page-link" href="/stat">통계</a>
		</div>
		<div class="view-toggle" role="group" aria-label="보기">
			<button
				class:active={!spellingKind}
				aria-pressed={!spellingKind}
				on:click={() => spellingKind && showView(null)}>작곡가 목록</button
			>
			<button
				class:active={Boolean(spellingKind)}
				aria-pressed={Boolean(spellingKind)}
				on:click={() => spellingKind || showView(DEFAULT_KIND)}>표기 정리</button
			>
		</div>
	</header>
	{#if spellingKind}
		<SpellingVariants kind={spellingKind} on:change={(e) => showView(e.detail)} />
	{:else}
		<p class="hint">
			시대는 출생 연도로 정해집니다. 시대를 고르면 출생 연도보다 앞섭니다(‘출생 연도로’는 보정
			없음).
		</p>

		<div class="toolbar">
			<form class="search" role="search" on:submit|preventDefault={onSearch}>
				<input
					type="search"
					bind:value={query}
					placeholder="작곡가 이름"
					aria-label="작곡가 검색"
				/>
				<button type="submit">검색</button>
			</form>
			<p class="result-count" aria-live="polite">
				{#if loaded}
					작곡가 {composers.length.toLocaleString()}명 · 시대 미상 {unknown.toLocaleString()}명{#if q}&nbsp;·
						'{q}' 검색{/if}
				{/if}
			</p>
		</div>
		<p class="status" aria-live="polite">{status}</p>

		<section class="card" aria-label="작곡가 목록" tabindex="-1" bind:this={listCard}>
			{#if loading && !loaded}
				<div class="placeholder">불러오는 중...</div>
			{:else if error}
				<div class="placeholder error">
					{error}
					<button class="tool-btn" on:click={retryList} aria-label="작곡가 목록 다시 시도"
						>다시 시도</button
					>
				</div>
			{:else if loaded && composers.length === 0}
				<div class="placeholder">{q ? `'${q}'에 맞는 작곡가가 없습니다` : '작곡가가 없습니다'}</div>
			{:else if loaded}
				<table aria-label="작곡가 목록" class:stale={loading}>
					<thead>
						<tr>
							<th scope="col">작곡가</th>
							<th scope="col" class="era">시대</th>
							<th scope="col" class="year">출생 연도</th>
							<th scope="col" class="num">선곡 수</th>
							<th scope="col" class="actions"><span class="sr-only">수정</span></th>
						</tr>
					</thead>
					<tbody>
						{#each composers as composer (composer.id)}
							{@const cell = eraCell(composer)}
							<tr class:editing={editingId === composer.id}>
								<th scope="row">
									<a href={composerHref(composer.id)} title="이 작곡가 페이지 열기"
										>{composer.name}</a
									>
								</th>
								{#if editingId === composer.id}
									<td>
										<select
											bind:value={draft.era}
											aria-label={`${composer.name} 시대`}
											on:keydown={(e) => onEditKeydown(e, composer)}
										>
											<option value="">출생 연도로</option>
											{#each ERAS as era}
												<option value={era}>{era}</option>
											{/each}
										</select>
									</td>
									<td>
										<input
											bind:this={yearInput}
											bind:value={draft.birthYear}
											inputmode="numeric"
											maxlength="4"
											placeholder="없음"
											aria-label={`${composer.name} 출생 연도`}
											aria-invalid={Boolean(yearError)}
											aria-describedby={yearError ? 'year-error' : undefined}
											on:keydown={(e) => onEditKeydown(e, composer)}
										/>
										{#if yearError}
											<div id="year-error" class="field-error">{yearError}</div>
										{/if}
									</td>
									<td class="num">{composer.num_time_music.toLocaleString()}</td>
									<td class="actions">
										<div class="buttons">
											<button
												class="tool-btn"
												bind:this={saveButton}
												on:click={() => save(composer)}
												disabled={saving || Boolean(yearError)}
											>
												{saving ? '저장 중…' : '저장'}
											</button>
											<button class="tool-btn" on:click={stopEdit} disabled={saving}>취소</button>
										</div>
										{#if saveError}
											<div class="field-error" role="alert">{saveError}</div>
										{/if}
									</td>
								{:else}
									<td class:unknown={cell.era === UNKNOWN_ERA}>
										{cell.era}
										{#if cell.note}<span class="era-note">{cell.note}</span>{/if}
									</td>
									<td class:unknown={composer.birth_year == null}>{composer.birth_year ?? '—'}</td>
									<td class="num">{composer.num_time_music.toLocaleString()}</td>
									<td class="actions">
										<button
											class="tool-btn"
											bind:this={editButtons[composer.id]}
											on:click={() => startEdit(composer)}
											disabled={saving}
											aria-label={`${composer.name} 수정`}
										>
											수정
										</button>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</section>
	{/if}
</div>

<style>
	/* 통계·선곡 기록과 같은 여백·머리말·컨트롤·카드 */
	.catalog-page {
		padding: 24px 32px;
		width: 100%;
		box-sizing: border-box;
	}
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}
	.title-group {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	h1 {
		font-family: var(--xlarge-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--xlarge-font-size, 32px);
		font-weight: var(--xlarge-font-weight, 500);
		color: var(--gray-gray-950, #1a1a1a);
		margin: 0;
	}
	.page-link {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		text-underline-offset: 3px;
	}
	/* 통계의 전체/개인(ScopeToggle)과 같은 모양 */
	.view-toggle {
		display: inline-flex;
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 6px;
		overflow: hidden;
	}
	.view-toggle button {
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
		padding: 6px 18px;
		border: none;
		background: var(--secondary-secondary-50, #fffdfc);
		color: var(--primary-primary-800, #6a5134);
		cursor: pointer;
	}
	.view-toggle button.active {
		background: var(--action-bg);
		color: var(--action-fg);
	}
	.hint,
	.result-count,
	.status {
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
	}
	.search {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 0;
	}
	.result-count {
		min-height: 1.5em;
		margin: 0;
	}
	.status {
		min-height: 1.5em;
		margin: 8px 0;
		color: var(--primary-primary-800, #6a5134);
	}
	input,
	select {
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
		padding: 6px 10px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		background: var(--secondary-secondary-50, #fffdfc);
		color: var(--gray-gray-950, #1a1a1a);
	}
	input[type='search'] {
		width: 300px;
	}
	tbody input,
	tbody select {
		font-size: var(--small-medium-font-size, 13px);
		padding: 3px 6px;
	}
	tbody input {
		width: 6em;
	}
	input[aria-invalid='true'] {
		border-color: var(--secondary-secondary-800, #95560d);
	}
	.search button,
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
	.search button:hover,
	.tool-btn:hover {
		background: var(--secondary-secondary-200, #fdf1e4);
	}
	.tool-btn:disabled {
		cursor: default;
		opacity: 0.6;
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
	.placeholder.error,
	.field-error {
		color: var(--secondary-secondary-800, #95560d);
	}
	/* 선곡 기록 표(PlayTable)와 같은 글꼴·선·머리줄 */
	/* 수정 칸이 열려도 열 너비가 그대로이도록 고정 */
	table {
		width: 100%;
		table-layout: fixed;
		border-collapse: collapse;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-950, #1a1a1a);
	}
	table.stale {
		opacity: 0.6;
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
		position: sticky;
		top: 0;
		background: var(--secondary-secondary-100, #fef9f3);
		color: var(--gray-gray-600, #7c7c7c);
		font-weight: 500;
	}
	tbody tr:last-child > * {
		border-bottom: none;
	}
	tr.editing > * {
		background: var(--secondary-secondary-100, #fef9f3);
	}
	tbody th a {
		color: inherit;
		text-decoration-color: var(--gray-gray-500, #656667);
		text-underline-offset: 3px;
	}
	tbody th a:hover {
		text-decoration-thickness: 2px;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	td.unknown {
		color: var(--gray-gray-500, #9f9f9f);
	}
	.era-note {
		margin-left: 6px;
		font-size: 12px;
		color: var(--gray-gray-600, #7c7c7c);
	}
	th.era {
		width: 22%;
	}
	th.year {
		width: 28%;
	}
	th.num {
		width: 10%;
	}
	th.actions {
		width: 130px;
	}
	.actions {
		text-align: right;
		white-space: nowrap;
	}
	.buttons {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
	}
	.field-error {
		margin-top: 4px;
		font-size: 12px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
