<script>
	import { onMount, onDestroy } from 'svelte';
	import Input from './input.svelte';

	export let composer = '';
	export let title = '';

	let mounted = false;
	let composing = false;
	let timer;
	let controller;
	let requestId = 0;
	let previousComposer = '';
	let composers = [];
	let works = [];
	let error = '';

	onMount(() => {
		mounted = true;
	});
	onDestroy(() => {
		clearTimeout(timer);
		controller?.abort();
		requestId += 1;
	});

	function scheduleLookup(composerName, musicTitle, isComposing) {
		clearTimeout(timer);
		controller?.abort();
		const currentRequest = ++requestId;
		// Keep composer information in place while the user edits only the title.
		if (composerName.trim() !== previousComposer) {
			composers = [];
			previousComposer = composerName.trim();
		}
		works = [];
		error = '';
		if (isComposing || !composerName.trim()) return;

		timer = setTimeout(async () => {
			controller = new AbortController();
			const params = new URLSearchParams({
				composer_name: composerName.trim(),
				title: musicTitle.trim()
			});
			try {
				const response = await fetch(`/api/recent-plays?${params}`, {
					signal: controller.signal
				});
				if (!response.ok) throw new Error('Recent play lookup failed');
				const data = await response.json();
				if (currentRequest !== requestId) return;
				composers = data.composers;
				works = data.works;
			} catch (cause) {
				if (currentRequest === requestId && cause.name !== 'AbortError') {
					error = '최근 선곡 정보를 불러오지 못했습니다.';
				}
			}
		}, 300);
	}

	$: if (mounted) scheduleLookup(composer, title, composing);
</script>

<div
	class="music-history-inputs"
	on:compositionstart={() => (composing = true)}
	on:compositionend={() => (composing = false)}
>
	<Input label="작곡가" bind:value={composer} />
	<div aria-live="polite" aria-atomic="true">
		{#if composers.length}
			<div class="history">
				<p class="caption">작곡가 최근 선곡 · 오늘 포함</p>
				<ul>
					{#each composers as item}
						<li>
							<strong>{item.name}</strong>
							<p>
								최근 1일간 {item.count_1d}회, 7일간 {item.count_7d}회, 30일간 {item.count_30d}회
								선곡됨.
							</p>
							{#if item.name.toLowerCase() === composer.trim().toLowerCase()}
								<p>가장 최근 {item.recent_titles.length}개 선곡: {item.recent_titles.join(', ')}</p>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>

	<Input label="제목" bind:value={title} />
	<div aria-live="polite" aria-atomic="true">
		{#if works.length}
			<div class="history">
				<p class="caption">곡 최근 선곡 · 오늘 포함</p>
				<ul>
					{#each works as item}
						<li>
							<strong>{item.composer_name} · {item.title}</strong>
							<p>최근 30일간 {item.count_30d}회 선곡됨.</p>
							<p>
								가장 최근 선곡: {item.days_since_last_played === 0
									? '오늘'
									: `${item.days_since_last_played}일 전`} ({item.last_played})
							</p>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
		{#if error}<p class="error">{error}</p>{/if}
	</div>
</div>

<style>
	.music-history-inputs {
		width: 320px;
		max-width: 100%;
		font-family: var(--small-medium-font-family, 'NotoSansKr-Regular', sans-serif);
		font-size: 13px;
		line-height: 1.6;
		color: var(--gray-gray-950, #1a1a1a);
	}
	.history {
		margin-top: 8px;
		padding: 10px 12px;
		border: 1px solid var(--primary-primary-700, #b7946c);
		border-radius: 6px;
		background: var(--secondary-secondary-100, #fef9f3);
		max-height: 240px;
		overflow-y: auto;
		overflow-wrap: anywhere;
	}
	p {
		margin: 0;
	}
	.caption,
	.error {
		color: var(--primary-primary-800, #6a5134);
	}
	.caption {
		margin-bottom: 6px;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li + li {
		margin-top: 8px;
		padding-top: 8px;
		border-top: 1px solid var(--gray-gray-300, #d4d4d4);
	}
	.error {
		margin-top: 8px;
	}
</style>
