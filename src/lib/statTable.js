// 통계 카드의 '표로 보기'용 표. 차트(캔버스)는 키보드·화면 낭독기로 읽을 수 없으므로
// 같은 수치를 표로도 보여 준다. 표 = { columns: [{ name, numeric }], rowHeader, rows: [[셀…]] }.
// rowHeader 는 행의 이름 칸(<th scope="row">)의 위치, 셀은 화면에 그대로 쓰는 문자열이다.

/** @typedef {{ name: string, numeric?: boolean }} Column */
/** @typedef {{ columns: Column[], rowHeader: number, rows: string[][] }} Table */

const DASH = '—';

/** @param {number | null | undefined} v */
export const formatCount = (v) => (v == null ? DASH : v.toLocaleString('ko-KR'));

// 다양성(고른정도) 0~1 은 차트 축과 같은 척도로 소수 둘째 자리까지.
/** @param {number | null | undefined} v */
export const formatEvenness = (v) => (v == null ? DASH : v.toFixed(2));

// 비율(시대·장르 도넛과 그 표, 학기 결산)은 소수 한 자리로, 0 도 붙여 쓴다(16.0%).
export const SHARE_PRECISION = 1;
/** @param {number} v */
export const formatShare = (v) => `${v.toFixed(SHARE_PRECISION)}%`;

// 다양성 응답의 summary.era·summary.genre → 그 고른정도. 센 선곡이 없으면(선곡이 없거나 모두
// 시대 미상) 백엔드는 0(= 편중)을 돌려주지만, 잴 것이 없으므로 null(화면에서 '—')로 바꾼다.
/** @param {{ values: number[], evenness: number } | null | undefined} group */
export const groupEvenness = (group) =>
	group && group.values.some((v) => v > 0) ? group.evenness : null;

// 같은 횟수는 같은 순위, 다음 순위는 그만큼 건너뛴다(1, 2, 2, 4). values 는 많은 순이다.
/** @param {number[]} values */
export function competitionRanks(values) {
	/** @type {number[]} */
	const ranks = [];
	values.forEach((v, i) => ranks.push(i > 0 && v === values[i - 1] ? ranks[i - 1] : i + 1));
	return ranks;
}

// 도넛이 그리는 비율(%)과 같게: ECharts 의 최대 잔여 방식(소수 precision 자리, 합계 100).
/**
 * @param {number[]} values
 * @param {number} [precision]
 */
export function sharePercents(values, precision = 2) {
	const sum = values.reduce((acc, v) => acc + (v || 0), 0);
	if (sum === 0) return values.map(() => 0);
	const digits = 10 ** precision;
	const quotas = values.map((v) => ((v || 0) / sum) * digits * 100);
	const seats = quotas.map(Math.floor);
	const remainders = quotas.map((q, i) => q - seats[i]);
	let total = seats.reduce((acc, s) => acc + s, 0);
	while (total < digits * 100) {
		let best = 0;
		for (let i = 1; i < remainders.length; i++) if (remainders[i] > remainders[best]) best = i;
		seats[best]++;
		remainders[best] = 0;
		total++;
	}
	return seats.map((s) => s / digits);
}

// 순위 막대(작곡가·독주자·지휘자·오케스트라): 순위, 이름, 횟수.
/**
 * @param {{ labels: string[], values: number[] }} data
 * @param {string} nameHeader
 * @returns {Table}
 */
export function rankTable({ labels, values }, nameHeader) {
	const ranks = competitionRanks(values);
	return {
		columns: [
			{ name: '순위', numeric: true },
			{ name: nameHeader },
			{ name: '횟수', numeric: true }
		],
		rowHeader: 1,
		rows: labels.map((label, i) => [String(ranks[i]), label, formatCount(values[i])])
	};
}

// 도넛(시대·장르): 이름, 횟수, 비율.
/**
 * @param {{ labels: string[], values: number[] }} data
 * @param {string} nameHeader
 * @returns {Table}
 */
export function shareTable({ labels, values }, nameHeader) {
	const shares = sharePercents(values, SHARE_PRECISION);
	return {
		columns: [
			{ name: nameHeader },
			{ name: '횟수', numeric: true },
			{ name: '비율', numeric: true }
		],
		rowHeader: 0,
		rows: labels.map((label, i) => [label, formatCount(values[i]), formatShare(shares[i])])
	};
}

// 시계열(선곡 추이·선곡 수·다양성 추이): 기간과 계열마다 한 칸.
/**
 * @param {string[]} labels
 * @param {string} labelHeader
 * @param {{ name: string, values: (number | null)[], format?: (v: any) => string }[]} series
 * @returns {Table}
 */
export function seriesTable(labels, labelHeader, series) {
	return {
		columns: [{ name: labelHeader }, ...series.map((s) => ({ name: s.name, numeric: true }))],
		rowHeader: 0,
		rows: labels.map((label, i) => [
			label,
			...series.map((s) => (s.format ?? formatCount)(s.values[i]))
		])
	};
}

// 차트(캔버스)의 접근 가능한 이름: 제목·부제는 캔버스에만 그려지므로 화면 낭독기에 따로 알리고,
// 수치는 '표로 보기'에 있다고 안내한다.
/**
 * @param {string} title
 * @param {string} [subtitle]
 */
export function chartLabel(title, subtitle = '') {
	const name = `${title.trim()} 차트`.trim();
	const sub = subtitle.trim();
	return `${sub ? `${name} — ${sub}` : name}. 수치는 '표로 보기'에서 볼 수 있습니다.`;
}

// 차트를 그리지 못할 때 카드에 보일 문구. 차트 제목은 캔버스에만 그려지므로, 남아 있는 문구(실패,
// 빈 데이터)에는 어느 카드인지 제목을 붙인다. 불러오는 중은 잠깐이라 그대로 둔다.
/**
 * @param {string} title
 * @param {{ loading?: boolean, error?: string }} [state]
 */
export function placeholderText(title, { loading = false, error = '' } = {}) {
	if (loading) return '불러오는 중...';
	const message = error || '데이터가 없습니다';
	const name = title.trim();
	return name ? `${name} — ${message}` : message;
}
