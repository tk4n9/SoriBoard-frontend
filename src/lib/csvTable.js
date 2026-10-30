// 여러 열의 표를 CSV 로 만들고 다운로드한다(csv.js 의 toCsv 는 항목·횟수 두 열).
// 칸의 따옴표 처리와 내려받기(UTF-8 BOM)는 csv.js 와 같다.
import { escapeCell, saveCsv } from './csv.js';

// headers: 머리줄의 열 이름, rows: 행마다 같은 순서의 칸 값.
/**
 * @param {string[]} headers
 * @param {unknown[][]} rows
 */
export function toCsvTable(headers, rows) {
	return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
}

/**
 * @param {string} filename
 * @param {string[]} headers
 * @param {unknown[][]} rows
 */
export function downloadCsvTable(filename, headers, rows) {
	saveCsv(filename, toCsvTable(headers, rows));
}

// 시계열 여러 계열(다양성 추이 등)을 CSV 의 열로: 기간, 계열마다 한 열. 값은 차트가 그리는 그대로다.
/**
 * @param {string[]} labels
 * @param {string} labelHeader
 * @param {{ name: string, values: (number | null)[] }[]} series
 * @returns {{ headers: string[], rows: unknown[][] }}
 */
export function seriesCsv(labels, labelHeader, series) {
	return {
		headers: [labelHeader, ...series.map((s) => s.name)],
		rows: labels.map((label, i) => [label, ...series.map((s) => s.values[i])])
	};
}

// 화면의 표(statTable.js 의 표)를 CSV 의 열로: 머리줄은 열 이름, 칸은 화면에 쓴 그대로다.
// 다만 수치 열의 천 단위 쉼표(1,234)는 빼서 스프레드시트가 수로 읽게 한다. 순위·날짜·비율(23.4%)·
// 변화(+1.2%p)·'—' 는 그대로 둔다.
const GROUPED = /^\d{1,3}(,\d{3})+$/;

/**
 * @param {import('./statTable.js').Table} table
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function tableCsv(table) {
	return {
		headers: table.columns.map((column) => column.name),
		rows: table.rows.map((row) =>
			row.map((cell, i) =>
				table.columns[i]?.numeric && GROUPED.test(cell) ? cell.replace(/,/g, '') : cell
			)
		)
	};
}
