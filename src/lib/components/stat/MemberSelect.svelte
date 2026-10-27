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

	onMount(async () => {
		try {
			const res = await fetch('/api/user/');
			if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
			users = await res.json();
		} catch (e) {
			console.error('지기 목록을 불러오지 못했습니다.', e);
			listError = '지기 목록을 불러오지 못했습니다.';
			return;
		}
		// 링크의 지기가 목록에 없으면 지기를 고르지 않은 것으로 되돌린다(목록을 못 받으면 그대로 둔다).
		const known = knownUser(userId, users);
		if (known !== userId) {
			userId = known;
			dispatch('change', { userId, includeMentees });
		}
	});

	$: userName = users.find((user) => String(user.id) === String(userId))?.name ?? '';

	function onUserChange(e) {
		userId = e.target.value || null;
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
	<label class="mentee">
		<input type="checkbox" checked={includeMentees} on:change={onMenteeChange} />
		견습 포함
	</label>
	<p id={errorId} class="list-error" aria-live="polite">{listError}</p>
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
	/* PeriodSelect 의 범위 문구처럼 머리말 아래 여백에 띄워, 머리말 높이가 바뀌지 않게 한다. */
	.list-error {
		position: absolute;
		top: 100%;
		left: 0;
		margin: 2px 0 0;
		white-space: nowrap;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--danger-fg);
	}
</style>
