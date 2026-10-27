// 통계에서 내려받는 파일(PNG·CSV)의 이름. 카드 제목 뒤에 보기(기간, 지기, 작곡가)를 넣어
// 다른 보기에서 받은 파일과 섞이지 않게 한다.

// 줄바꿈·탭은 빈칸 하나로, 파일 이름에 쓸 수 없는 글자(Windows 기준)와 남은 제어 문자는 '-' 로,
// '~' 양옆의 빈칸은 뺀다.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

/** @param {unknown} part */
function clean(part) {
	return String(part ?? '')
		.replace(/\s+/g, ' ')
		.replace(UNSAFE, '-')
		.replace(/\s*~\s*/g, '~')
		.trim();
}

// 조각을 '_' 로 잇는다. 빈 조각은 건너뛰고, 배열인 조각은 펼친다: downloadName(['통계', '많이 튼 작곡가', '', '20261028'], 'csv')
// → '통계_많이 튼 작곡가_20261028.csv'.
/**
 * @param {(unknown | unknown[])[]} parts
 * @param {string} ext
 */
export function downloadName(parts, ext) {
	return `${parts.flat().map(clean).filter(Boolean).join('_')}.${ext}`;
}

// 개인 보기의 지기 조각: 이름(목록을 못 받았으면 '지기 #id'), 견습 포함이면 '+견습'.
// 지기를 고르지 않았으면 ''.
/**
 * @param {{ userId: string | null, name?: string | null, includeMentees?: boolean }} member
 */
export function memberFileText({ userId, name, includeMentees }) {
	if (!userId) return '';
	const who = name || `지기 #${userId}`;
	return includeMentees ? `${who}+견습` : who;
}
