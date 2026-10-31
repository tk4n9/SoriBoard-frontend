<script>
	import { onMount, createEventDispatcher } from 'svelte';
	import { knownUser } from '$lib/statQuery.js';

	export let userId = null;
	export let includeMentees = false;
	// 지기를 고르지 않은 때의 항목 이름(선곡 기록에서는 '전체 지기').
	export let emptyLabel = '지기 선택';
	// 고른 지기의 이름(읽기 전용, 내려받는 파일 이름용). 목록을 못 받았거나 고르지 않았으면 ''.
	export let userName = '';

	const dispatch = createEventDispatcher();
	const errorId = 'member-list-error';
	let users = [];
	// 목록을 못 받으면 알림창 대신 select 아래에 짧게 적는다.
	let listError = '';
	// 견습 포함이 세는 것: 고른 지기의 견습들이 튼 곡이 아니라, 그 지기가 견습으로 들어간 타임이다.
	const menteeTitle = '이 지기가 견습으로 들어간 타임도 셉니다';

	// 지기 목록을 부른다(처음, 그리고 '다시 시도'). 받았는지를 돌려준다.
	async function loadList() {
		try {
			const res = await fetch('/api/user/');
			if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
			users = await res.json();
		} catch (e) {
			console.error('지기 목록을 불러오지 못했습니다.', e);
			listError = '지기 목록을 불러오지 못했습니다.';
			return false;
		}
		// 링크의 지기가 목록에 없으면 지기를 고르지 않은 것으로 되돌린다(목록을 못 받으면 그대로 둔다).
		const known = knownUser(userId, users);
		if (known !== userId) {
			userId = known;
			if (!userId) includeMentees = false;
			dispatch('change', { userId, includeMentees });
		}
		return true;
	}

	onMount(loadList);

	// 지기 목록의 '다시 시도': PeriodSelect 의 학기 목록과 같다(aria-disabled, 받으면 select 로 포커스).
	let retrying = false;
	async function retryList(e) {
		if (retrying) return;
		const button = e.currentTarget;
		retrying = true;
		listError = '';
		const loaded = await loadList();
		retrying = false;
		// select 에 bind:this 를 걸면 목록이 와도 링크의 값을 다시 고르지 않으므로(Svelte 4) 단추에서 찾는다.
		if (loaded && document.activeElement === button)
			button.closest('.member-select')?.querySelector('select')?.focus();
	}

	$: userName = users.find((user) => String(user.id) === String(userId))?.name ?? '';

	function onUserChange(e) {
		userId = e.target.value || null;
		// 지기를 지우면 견습 포함도 지운다(다시 고르면 새 페이지처럼 꺼진 채로 시작한다).
		if (!userId) includeMentees = false;
		dispatch('change', { userId, includeMentees });
	}
	function onMenteeChange(e) {
		includeMentees = e.target.checked;
		dispatch('change', { userId, includeMentees });
	}
</script>

<div class="member-select">
	<select
		on:change={onUserChange}
		value={userId ?? ''}
		aria-label="지기"
		aria-invalid={listError ? 'true' : undefined}
		aria-describedby={listError ? errorId : undefined}
	>
		<option value="">{emptyLabel}</option>
		{#each users as user}
			<option value={String(user.id)}>{user.name} {user.major} {user.year_id}</option>
		{/each}
	</select>
	<label class="mentee" class:off={!userId} title={menteeTitle}>
		<input
			type="checkbox"
			checked={includeMentees && Boolean(userId)}
			disabled={!userId}
			title={menteeTitle}
			on:change={onMenteeChange}
		/>
		견습 포함
	</label>
	<div class="list-note">
		<p id={errorId} class="list-error" aria-live="polite">{listError}</p>
		{#if listError || retrying}
			<button
				class="tool-btn"
				on:click={retryList}
				aria-label="지기 목록 다시 시도"
				aria-disabled={retrying ? 'true' : undefined}
			>
				다시 시도
			</button>
		{/if}
	</div>
</div>

<style>
	.member-select {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 10px;
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
	select[aria-invalid='true'] {
		border-color: var(--danger-fg);
	}
	.mentee input[type='checkbox'] {
		appearance: none;
		width: 16px;
		height: 16px;
		margin: 0;
		border: 2px solid var(--control-border);
		border-radius: 3px;
		background: var(--primary-primary-100);
		cursor: pointer;
	}
	.mentee input[type='checkbox']:checked {
		/* same Cloud Dancer tick on Micron as the app's other checkboxes */
		background: var(--checked-bg) url('../../images/check.svg') center / 14px no-repeat;
	}
	.mentee {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-700, #545454);
		display: inline-flex;
		align-items: center;
		gap: 4px;
		cursor: pointer;
	}
	/* 견습 포함은 지기를 고른 때만 뜻이 있으므로, 그 전에는 '다시 시도'의 비활성 모양으로 꺼 둔다. */
	.mentee.off {
		color: var(--gray-gray-500);
		cursor: default;
	}
	.mentee input[type='checkbox']:disabled {
		border-color: var(--gray-gray-400);
		background: var(--secondary-secondary-50);
		cursor: default;
	}
	/* PeriodSelect 의 범위 문구처럼 머리말 아래 여백에 띄워, 머리말 높이가 바뀌지 않게 한다. */
	.list-note {
		position: absolute;
		top: 100%;
		left: 0;
		margin: 2px 0 0;
		white-space: nowrap;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--danger-fg);
		display: flex;
		align-items: center;
		gap: 6px;
	}
	/* 줄의 마지막 컨트롤이면(통계의 개인 보기) 오른쪽 끝에 맞춰 왼쪽으로 펼쳐, 화면 밖으로 넘치지 않게 한다. */
	.member-select:last-child .list-note {
		left: auto;
		right: 0;
	}
	.list-error {
		margin: 0;
	}
	/* PeriodSelect 의 '다시 시도'와 같은 모양. */
	.tool-btn {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		background: var(--secondary-secondary-100, #fef9f3);
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 4px;
		padding: 0 6px;
		cursor: pointer;
	}
	.tool-btn:hover:not([aria-disabled='true']) {
		background: var(--secondary-secondary-200, #fdf1e4);
	}
	.tool-btn[aria-disabled='true'] {
		color: var(--gray-gray-500);
		border-color: var(--gray-gray-400);
		background: var(--secondary-secondary-50);
		cursor: default;
	}
</style>
