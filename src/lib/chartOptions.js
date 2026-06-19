// ECharts option 빌더 모음. 각 함수는 백엔드 봉투({labels, values, items, ...})와
// 제목/부제를 받아 option 객체를 돌려준다. PNG 내보내기가 독립적으로 보이도록
// 제목/부제를 option.title 에 그대로 박아 넣는다.
//
// 캔버스는 CSS 변수를 못 읽으므로 색상은 app.css 토큰값과 동일한 hex 로 둔다.

const ACCENT = '#b7946c'; // --primary-primary-700
const TEXT = '#1a1a1a'; // --gray-gray-950
const SUBTEXT = '#7c7c7c'; // --gray-gray-600
const FONT = "'Noto Sans KR', sans-serif";

// 시대/다계열 차트용 카테고리 팔레트 (토큰 700 계열 중심)
const CATEGORICAL = [
	'#b7946c', // primary
	'#3670ce', // blue
	'#219754', // green
	'#ee9c3f', // secondary
	'#ec4b4b', // red
	'#253041', // navy
	'#cfdf53', // yellow
	'#ffbe99' // peach
];

function titleBlock(title, subtitle) {
	return {
		text: title || '',
		subtext: subtitle || '',
		left: 'center',
		textStyle: { fontFamily: FONT, color: TEXT, fontSize: 18, fontWeight: 700 },
		subtextStyle: { fontFamily: FONT, color: SUBTEXT, fontSize: 12 }
	};
}

const BASE_TEXT_STYLE = { fontFamily: FONT, color: TEXT };

// 가로 막대 (top-N): composers / works / conductors / orchestras 공용.
export function horizontalBarOption({ labels, values }, title, subtitle) {
	// ECharts category 축은 아래에서 위로 그려지므로 역순으로 넣어 1위가 맨 위로.
	const cats = [...labels].reverse();
	const vals = [...values].reverse();
	return {
		title: titleBlock(title, subtitle),
		textStyle: BASE_TEXT_STYLE,
		grid: { left: 8, right: 48, top: subtitle ? 70 : 56, bottom: 16, containLabel: true },
		tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, textStyle: { fontFamily: FONT } },
		xAxis: { type: 'value', axisLabel: { fontFamily: FONT } },
		yAxis: {
			type: 'category',
			data: cats,
			axisLabel: { fontFamily: FONT, color: TEXT, fontSize: 12, width: 160, overflow: 'truncate' }
		},
		series: [
			{
				type: 'bar',
				data: vals,
				itemStyle: { color: ACCENT, borderRadius: [0, 4, 4, 0] },
				label: { show: true, position: 'right', fontFamily: FONT, color: SUBTEXT }
			}
		]
	};
}

// 추이 라인 (timeline)
export function timelineOption({ labels, values }, title, subtitle) {
	return {
		title: titleBlock(title, subtitle),
		textStyle: BASE_TEXT_STYLE,
		grid: { left: 8, right: 24, top: subtitle ? 70 : 56, bottom: 24, containLabel: true },
		tooltip: { trigger: 'axis', textStyle: { fontFamily: FONT } },
		xAxis: {
			type: 'category',
			data: labels,
			boundaryGap: false,
			axisLabel: { fontFamily: FONT, color: TEXT }
		},
		yAxis: { type: 'value', axisLabel: { fontFamily: FONT } },
		series: [
			{
				type: 'line',
				data: values,
				smooth: true,
				symbol: 'circle',
				symbolSize: 6,
				lineStyle: { color: ACCENT, width: 3 },
				itemStyle: { color: ACCENT },
				areaStyle: {
					color: {
						type: 'linear',
						x: 0,
						y: 0,
						x2: 0,
						y2: 1,
						colorStops: [
							{ offset: 0, color: 'rgba(183,148,108,0.35)' },
							{ offset: 1, color: 'rgba(183,148,108,0.02)' }
						]
					}
				}
			}
		]
	};
}

// 세로 막대 (주/월별 선곡 수 등 시계열 카운트)
export function countBarOption({ labels, values }, title, subtitle) {
	return {
		title: titleBlock(title, subtitle),
		textStyle: BASE_TEXT_STYLE,
		grid: { left: 8, right: 16, top: subtitle ? 70 : 56, bottom: 24, containLabel: true },
		tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, textStyle: { fontFamily: FONT } },
		xAxis: {
			type: 'category',
			data: labels,
			axisLabel: { fontFamily: FONT, color: TEXT, hideOverlap: true }
		},
		yAxis: { type: 'value', minInterval: 1, axisLabel: { fontFamily: FONT } },
		series: [
			{
				type: 'bar',
				data: values,
				itemStyle: { color: ACCENT, borderRadius: [4, 4, 0, 0] }
			}
		]
	};
}

// 다양성 추이 라인 (0~1 고른정도 여러 계열)
export function diversityLineOption(labels, series, title, subtitle) {
	return {
		title: titleBlock(title, subtitle),
		textStyle: BASE_TEXT_STYLE,
		color: CATEGORICAL,
		grid: { left: 8, right: 16, top: subtitle ? 86 : 72, bottom: 24, containLabel: true },
		tooltip: { trigger: 'axis', textStyle: { fontFamily: FONT } },
		legend: { top: subtitle ? 48 : 34, textStyle: { fontFamily: FONT, color: TEXT } },
		xAxis: {
			type: 'category',
			data: labels,
			boundaryGap: false,
			axisLabel: { fontFamily: FONT, color: TEXT, hideOverlap: true }
		},
		yAxis: {
			type: 'value',
			min: 0,
			max: 1,
			axisLabel: { fontFamily: FONT, formatter: (v) => v.toFixed(1) }
		},
		series: series.map((s) => ({
			name: s.name,
			type: 'line',
			data: s.values,
			smooth: true,
			symbol: 'circle',
			symbolSize: 6,
			connectNulls: true,
			lineStyle: { width: 3 }
		}))
	};
}

// 시대 분포 도넛 (eras) — 장르 분포도 같은 형태라 공용으로 쓴다.
export function eraPieOption({ labels, values }, title, subtitle) {
	const data = labels.map((name, i) => ({ name, value: values[i] }));
	return {
		title: titleBlock(title, subtitle),
		textStyle: BASE_TEXT_STYLE,
		color: CATEGORICAL,
		tooltip: { trigger: 'item', formatter: '{b}: {c}곡 ({d}%)', textStyle: { fontFamily: FONT } },
		legend: { bottom: 0, textStyle: { fontFamily: FONT, color: TEXT } },
		series: [
			{
				type: 'pie',
				radius: ['42%', '68%'],
				center: ['50%', '54%'],
				avoidLabelOverlap: true,
				itemStyle: { borderColor: '#fff', borderWidth: 2 },
				label: { fontFamily: FONT, color: TEXT, formatter: '{b}\n{d}%' },
				data
			}
		]
	};
}
