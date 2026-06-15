<script>
	import * as echarts from 'echarts';
	import { onMount, onDestroy } from 'svelte';

	export let option = null;

	let el;
	let chart;
	let resizeObserver;

	onMount(() => {
		chart = echarts.init(el, null, { renderer: 'canvas' });
		if (option) chart.setOption(option);
		resizeObserver = new ResizeObserver(() => chart && chart.resize());
		resizeObserver.observe(el);
	});

	onDestroy(() => {
		if (resizeObserver) resizeObserver.disconnect();
		if (chart) chart.dispose();
	});

	// option 이 바뀌면 다시 그린다. notMerge 로 잔상 제거.
	$: if (chart && option) {
		chart.setOption(option, { notMerge: true });
	}

	// 부모에서 bind:this 로 호출하는 메서드들.
	export function getPng() {
		if (!chart) return null;
		return chart.getDataURL({ type: 'png', pixelRatio: 3, backgroundColor: '#ffffff' });
	}
	export function resize() {
		if (chart) chart.resize();
	}
</script>

<div class="echart" bind:this={el}></div>

<style>
	.echart {
		width: 100%;
		height: 100%;
		min-height: 320px;
	}
</style>
