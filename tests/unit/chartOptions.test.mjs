import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineOption, diversityLineOption } from '../../src/lib/chartOptions.js';

const labels = ['2025-1학기', '2025-2학기', '2026-1학기', '2026-2학기'];
const series = [
	{ name: '시대 다양성', values: [0.8, 0.7, 0.9, 0.6] },
	{ name: '장르 다양성', values: [0.5, 0.6, 0.6, 0.4] }
];

test('line charts keep their first and last x labels inside the canvas', () => {
	for (const option of [
		timelineOption({ labels, values: [3, 1, 4, 1] }, '학기별 선곡 추이', '전체'),
		diversityLineOption(labels, series, '월별 다양성 추이', '0=편중 · 1=고름')
	]) {
		assert.equal(option.xAxis.boundaryGap, false);
		assert.equal(option.xAxis.axisLabel.alignMinLabel, 'left');
		assert.equal(option.xAxis.axisLabel.alignMaxLabel, 'right');
	}
});

test('diversity legend sits below the subtitle, and the plot below the legend', () => {
	const option = diversityLineOption(labels, series, '월별 다양성 추이', '0=편중 · 1=고름');
	// 부제는 위에서 약 45~62px 를 차지한다(범례가 48 이면 그 위에 겹쳤다).
	assert.ok(option.legend.top >= 64, `legend.top ${option.legend.top}`);
	assert.ok(option.grid.top - option.legend.top >= 38, `grid.top ${option.grid.top}`);
});

test('without a subtitle the diversity legend stays right under the title', () => {
	const option = diversityLineOption(labels, series, '월별 다양성 추이', '');
	assert.equal(option.legend.top, 34);
	assert.equal(option.grid.top, 72);
});
