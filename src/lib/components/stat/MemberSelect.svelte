<script>
	import { onMount, createEventDispatcher } from 'svelte';

	export let userId = null;
	export let includeMentees = false;

	const dispatch = createEventDispatcher();
	let users = [];

	onMount(async () => {
		try {
			const res = await fetch('/api/user/');
			if (res.ok) users = await res.json();
		} catch (e) {
			console.error('지기 목록을 불러오지 못했습니다.', e);
		}
	});

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
	<select on:change={onUserChange} value={userId ?? ''}>
		<option value="">지기 선택</option>
		{#each users as user}
			<option value={user.id}>{user.name} {user.major} {user.year_id}</option>
		{/each}
	</select>
	<label class="mentee">
		<input type="checkbox" checked={includeMentees} on:change={onMenteeChange} />
		견습 포함
	</label>
</div>

<style>
	.member-select {
		display: inline-flex;
		align-items: center;
		gap: 10px;
	}
	select {
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
		padding: 6px 10px;
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 6px;
		background: var(--secondary-secondary-50, #fffdfc);
		color: var(--gray-gray-950, #1a1a1a);
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
</style>
