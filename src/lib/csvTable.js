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
