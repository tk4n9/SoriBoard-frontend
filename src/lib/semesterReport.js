// 학기 결산(/stat/report?semester_id=<id>): 학기 고르기, 지난 학기, 상위 10·시대·장르 비교 표,
// 처음 튼 작곡가·곡 표, 링크. 결산은 클럽 전체의 기록이다(지기별 순위는 없다).
import {
	formatCount,
	sharePercents,
	formatShare,
	SHARE_PRECISION,
	rankTable,
	competitionRanks
} from './statTable.js';
import { periodRangeText } from './statPeriod.js';
import { bucketRange } from './statBucket.js';

const ID = /^[1-9]\d*$/;

// 결산 링크. 학기 id 가 아니면(통계의 이번 학기·전체 기간·직접 지정) 가장 최근 학기의 결산.
/** @param {string | number | null | undefined} id */
export function reportHref(id) {
	return ID.test(String(id ?? '')) ? `/stat/report?semester_id=${id}` : '/stat/report';
}

// URL 의 semester_id 에 맞는 학기. 없거나 목록에 없으면 가장 최근 학기(목록은 sortSemesters 순).
/**
 * @template {{ id: number }} S
 * @param {string | null} raw
 * @param {S[]} sorted
 * @returns {S | null}
 */
export function pickSemester(raw, sorted) {
	return sorted.find((s) => String(s.id) === raw) ?? sorted[0] ?? null;
}

// 바로 앞 학기(연도·학기 순으로 다음 칸). 없으면 null.
/**
 * @template {{ id: number }} S
 * @param {S} semester
 * @param {S[]} sorted
 * @returns {S | null}
 */
export function previousSemester(semester, sorted) {
	const i = sorted.findIndex((s) => s.id === semester.id);
	return i >= 0 ? sorted[i + 1] ?? null : null;
}

// 머리말의 날짜 범위: 요약(stats/summary)이 돌려준 적용 기간. 그 전(또는 요약을 받지 못하면)에는
// 학기의 연도·학기로 짐작한 날짜를 보인다(백엔드의 semester_id 와 같은 규칙, statBucket.js).
/**
 * @param {{ filters?: { start?: string, end?: string } } | null | undefined} summary
 * @param {{ year: number, semester_num: number } | null} semester
 */
export function reportRangeText(summary, semester) {
	if (summary?.filters) return periodRangeText(summary.filters);
	if (!semester) return '';
	return periodRangeText(bucketRange('semester', `${semester.year}-${semester.semester_num}`));
}

// 시대·장르처럼 지난 학기와 견주는 카드의 응답 한 쌍. 두 요청은 함께 보낸다.
// 이 학기가 실패하면 카드가 실패하고, 지난 학기만 실패하면 이 학기만으로 그린다(previousError).
// loadBefore 가 없으면(지난 학기 없음) previous 는 null 이다.
/**
 * @template T
 * @param {() => Promise<T>} loadNow
 * @param {(() => Promise<T>) | null} loadBefore
 * @returns {Promise<{ current: T, previous: T | null, previousError: unknown }>}
 */
export async function loadWithPrevious(loadNow, loadBefore) {
	const [now, before] = await Promise.allSettled([
		loadNow(),
		loadBefore ? loadBefore() : Promise.resolve(null)
	]);
	if (now.status === 'rejected') throw now.reason;
	return before.status === 'fulfilled'
		? { current: now.value, previous: before.value, previousError: null }
		: { current: now.value, previous: null, previousError: before.reason ?? 'failed' };
}

/** @param {{ total_plays: number } | null | undefined} envelope */
const totalText = (envelope) => (envelope ? `총 ${envelope.total_plays.toLocaleString()}곡` : '');

// 시대·장르 카드의 부제: 이 학기와 지난 학기의 선곡 수. 지난 학기를 못 받았으면 그렇다고 쓴다.
/**
 * @param {{ current: { total_plays: number }, previous: { total_plays: number } | null, previousError?: unknown } | null | undefined} pair
 * @param {string} now 이 학기 이름
 * @param {string} before 지난 학기 이름(없으면 '')
 */
export function mixSubtitle(pair, now, before) {
	if (!pair) return '';
	const head = `${now} ${totalText(pair.current)}`;
	if (pair.previous) return `${head} · 지난 학기(${before}) ${totalText(pair.previous)}`;
	if (pair.previousError) return `${head} · 지난 학기(${before})를 불러오지 못했습니다`;
	return `${head} · 지난 학기 없음`;
}

// 두 분포의 이름을 합친다. 둘 다 백엔드의 같은 순서(시대·장르 순)를 따르고 0인 칸만 빠지므로,
// 그 순서를 지키며 섞는다.
/**
 * @param {string[]} a
 * @param {string[]} b
 */
export function mergeLabels(a, b) {
	const out = [];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			out.push(a[i++]);
			j++;
		} else if (i < a.length && !b.includes(a[i])) out.push(a[i++]);
		else if (j < b.length && (i >= a.length || !a.includes(b[j]))) out.push(b[j++]);
		else out.push(a[i++]); // 순서가 엇갈린 경우: a 쪽을 먼저(중복은 아래에서 뺀다)
	}
	return [...new Set(out)];
}

// 비율의 변화(%p, 소수 한 자리). 보이는 두 비율의 차이다.
/** @param {number} v */
export function formatChange(v) {
	const rounded = Math.round(v * 10) / 10;
	if (rounded === 0) return '0.0%p';
	return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(1)}%p`;
}

// KPI 칸 아래의 지난 학기 비교: '+32 · 지난 학기 280'. 어느 한쪽이 없으면(지난 학기 없음,
// 불러오는 중, 실패) ''.
/**
 * @param {number | null | undefined} now
 * @param {number | null | undefined} before
 */
export function kpiChangeText(now, before) {
	if (now == null || before == null) return '';
	const diff = now - before;
	const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
	return `${sign}${formatCount(Math.abs(diff))} · 지난 학기 ${formatCount(before)}`;
}

// 다양성 칸(고른정도 0–1) 아래의 지난 학기 비교: '+4%p · 지난 학기 58%'. 칸처럼 먼저 각각을
// 정수 %로 반올림하고 뺀다(보이는 두 값의 차이). 어느 한쪽이 없으면('—') ''.
/**
 * @param {number | null | undefined} now
 * @param {number | null | undefined} before
 */
export function evennessChangeText(now, before) {
	if (now == null || before == null) return '';
	const [n, b] = [now, before].map((v) => Math.round(v * 100));
	const sign = n > b ? '+' : n < b ? '-' : '';
	return `${sign}${Math.abs(n - b)}%p · 지난 학기 ${b}%`;
}

// 이름 → 비율(%, 소수 한 자리, 합계 100). 선곡이 없으면 null.
/** @param {{ labels: string[], values: number[] }} data */
function shareByLabel({ labels, values }) {
	if (values.reduce((acc, v) => acc + v, 0) === 0) return null;
	const shares = sharePercents(values, SHARE_PRECISION);
	return new Map(labels.map((label, i) => [label, shares[i]]));
}

// 시대·장르 분포 표: 이름, 횟수, 비율, 그리고 지난 학기가 있으면 지난 학기 비율과 변화.
// 지난 학기에 선곡이 없으면 그 두 칸은 '—'. 한쪽에만 있는 이름은 다른 쪽에서 0곡이다.
/**
 * @param {{ labels: string[], values: number[] }} current
 * @param {{ labels: string[], values: number[] } | null} previous 지난 학기가 없으면 null
 * @param {string} nameHeader
 * @returns {import('./statTable.js').Table}
 */
export function mixTable(current, previous, nameHeader) {
	const labels = previous ? mergeLabels(current.labels, previous.labels) : current.labels;
	const counts = new Map(current.labels.map((label, i) => [label, current.values[i]]));
	const now = shareByLabel(current);
	const before = previous && shareByLabel(previous);
	const columns = [
		{ name: nameHeader },
		{ name: '횟수', numeric: true },
		{ name: '비율', numeric: true }
	];
	if (previous) columns.push({ name: '지난 학기', numeric: true }, { name: '변화', numeric: true });
	return {
		columns,
		rowHeader: 0,
		rows: labels.map((label) => {
			const share = now ? now.get(label) ?? 0 : 0;
			const row = [label, formatCount(counts.get(label) ?? 0), formatShare(share)];
			if (previous) {
				const was = before ? before.get(label) ?? 0 : null;
				row.push(
					was == null ? '—' : formatShare(was),
					was == null ? '—' : formatChange(share - was)
				);
			}
			return row;
		})
	};
}

// 상위 10 표(순위, 이름, 횟수)에 지난 학기 칸: 그 행의 지난 학기 상위 10 에서의 순위(순위 칸처럼
// 같은 횟수는 같은 순위). 거기 없으면 '10위 밖', 지난 학기에 선곡이 없으면 '—'. 이름이 아니라 id 로
// 맞춘다(이름이 같은 다른 대상). 지난 학기가 없거나 받지 못하면(null) 칸을 두지 않는다.
/**
 * @param {{ labels: string[], values: number[], items: { id: number }[] }} current
 * @param {{ total_plays: number, values: number[], items: { id: number }[] } | null} previous
 * @param {string} nameHeader
 * @returns {import('./statTable.js').Table}
 */
export function rankChangeTable(current, previous, nameHeader) {
	const table = rankTable(current, nameHeader);
	if (!previous) return table;
	const empty = previous.total_plays === 0 || !previous.items.length;
	const ranks = competitionRanks(previous.values);
	const before = new Map(previous.items.map((item, i) => [item.id, ranks[i]]));
	return {
		...table,
		columns: [...table.columns, { name: '지난 학기', numeric: true }],
		rows: table.rows.map((row, i) => {
			const rank = before.get(current.items[i]?.id);
			return [...row, empty ? '—' : rank ? `${rank}위` : '10위 밖'];
		})
	};
}

// 처음 튼 작곡가·곡(stats/firsts): 이름, 처음 튼 날, 이 학기 횟수(백엔드 순서 = 처음 튼 날 순).
// 날짜는 작곡가 페이지의 곡 표처럼 수치 칸(내용만큼, 오른쪽 정렬)이다.
/**
 * @param {{ items: { name: string, count: number, first_played: string }[] }} firsts
 * @param {string} nameHeader
 * @returns {import('./statTable.js').Table}
 */
export function firstsTable(firsts, nameHeader) {
	return {
		columns: [
			{ name: nameHeader },
			{ name: '처음 튼 날', numeric: true },
			{ name: '횟수', numeric: true }
		],
		rowHeader: 0,
		rows: firsts.items.map((item) => [item.name, item.first_played, formatCount(item.count)])
	};
}
