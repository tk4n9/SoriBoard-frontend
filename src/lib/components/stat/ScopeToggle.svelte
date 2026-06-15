<script>
	import { createEventDispatcher } from 'svelte';

	export let scope = 'all'; // 'all' | 'individual'

	const dispatch = createEventDispatcher();

	function select(value) {
		if (scope !== value) {
			scope = value;
			dispatch('change', value);
		}
	}
</script>

<div class="toggle">
	<button class:active={scope === 'all'} on:click={() => select('all')}>전체</button>
	<button class:active={scope === 'individual'} on:click={() => select('individual')}>개인</button>
</div>

<style>
	.toggle {
		display: inline-flex;
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 6px;
		overflow: hidden;
	}
	.toggle button {
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
		padding: 6px 18px;
		border: none;
		background: var(--secondary-secondary-50, #fffdfc);
		color: var(--primary-primary-800, #6a5134);
		cursor: pointer;
	}
	.toggle button.active {
		background: var(--primary-primary-700, #b7946c);
		color: #fff;
	}
</style>
