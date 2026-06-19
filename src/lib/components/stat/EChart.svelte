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
	// 발표/인쇄용 PNG. 화면 카드 크기가 작아 그대로 내보내면 해상도가 낮으므로,
	// 화면과 무관하게 일정한 큰 크기(1200×750)의 오프스크린 차트를 따로 그려
	// 고해상도(pixelRatio 2 → 2400×1500)로 내보낸다.
	export function getPng() {
		if (!chart || !option) return null;
		const EXPORT_W = 1200;
		const EXPORT_H = 750;
		const holder = document.createElement('div');
		holder.style.cssText = `position:absolute;left:-9999px;top:0;width:${EXPORT_W}px;height:${EXPORT_H}px;`;
		document.body.appendChild(holder);
		const exportChart = echarts.init(holder, null, {
			renderer: 'canvas',
			width: EXPORT_W,
			height: EXPORT_H
		});
		try {
			exportChart.setOption(option);
			return exportChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
		} finally {
			exportChart.dispose();
			document.body.removeChild(holder);
		}
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
