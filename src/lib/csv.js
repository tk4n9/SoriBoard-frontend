// labels/values 봉투를 CSV 문자열로 만들고 다운로드한다.
// Excel 에서 한글이 깨지지 않도록 UTF-8 BOM 을 앞에 붙인다.

function escapeCell(value) {
	const s = String(value ?? '');
	if (/[",\n]/.test(s)) {
		return '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

export function toCsv(labels, values, headers = ['항목', '횟수']) {
	const rows = [headers.map(escapeCell).join(',')];
	for (let i = 0; i < labels.length; i++) {
		rows.push([escapeCell(labels[i]), escapeCell(values[i])].join(','));
	}
	return rows.join('\n');
}

export function downloadCsv(filename, labels, values, headers) {
	const csv = '﻿' + toCsv(labels, values, headers);
	const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// PNG dataURL 다운로드 (ECharts getDataURL 결과 등).
export function downloadDataUrl(filename, dataUrl) {
	const a = document.createElement('a');
	a.href = dataUrl;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
}

// 파일명용 오늘 날짜 (YYYYMMDD).
export function todayStamp() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
