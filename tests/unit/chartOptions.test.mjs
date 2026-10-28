import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timelineOption, diversityLineOption, eraPieOption } from '../../src/lib/chartOptions.js';
import { shareTable, SHARE_PRECISION } from '../../src/lib/statTable.js';

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

test('pie slice labels fit between the subtitle and the legend of a 340px card', () => {
	const option = eraPieOption(
		{ labels: ['바로크', '고전', '낭만'], values: [3, 1, 6] },
		'시대별 분포',
		'전체 · 총 10곡'
	);
	const [series] = option.series;
	const pct = (s) => Number.parseFloat(s) / 100;
	// 카드 캔버스 340px: 부제는 ~60px 에서 끝나고 범례는 ~320px 에서 시작한다.
	// 맨 위·맨 아래 조각의 이름표는 인출선(ECharts 기본 15px) 끝에 두 줄(~26px)로 놓인다.
	const height = 340;
	const outer = (pct(series.radius[1]) * height) / 2;
	const cy = pct(series.center[1]) * height;
	const reach = outer + 15 + 13;
	assert.ok(cy - reach >= 60, `labels reach up to ${cy - reach}px`);
	assert.ok(cy + reach <= 320, `labels reach down to ${cy + reach}px`);
	assert.equal(option.legend.bottom, 0);
});

test('pie labels and tooltips print the share as the table does (one decimal)', () => {
	const data = { labels: ['바로크', '고전'], values: [3, 1] };
	const option = eraPieOption(data, '시대별 분포', '전체 · 총 4곡');
	const [series] = option.series;
	// ECharts 가 percentPrecision 자리로 나눈 비율(percent)을 넘긴다.
	assert.equal(series.percentPrecision, SHARE_PRECISION);
	const rows = shareTable(data, '시대').rows;
	assert.equal(series.label.formatter({ name: '바로크', percent: 75 }), `바로크\n${rows[0][2]}`);
	assert.equal(
		option.tooltip.formatter({ name: '고전', value: 1, percent: 25 }),
		`고전: 1곡 (${rows[1][2]})`
	);
	assert.equal(series.label.formatter({ name: '고전', percent: 18.8 }), '고전\n18.8%');
});

test('pie tooltips escape the name, as the string template did', () => {
	const option = eraPieOption({ labels: ['<b>&'], values: [1] }, '', '');
	assert.equal(
		option.tooltip.formatter({ name: '<b>&', value: 1, percent: 100 }),
		'&#60;b&#62;&#38;: 1곡 (100.0%)'
	);
});
