// 통계 페이지의 브라우저 탭 제목(<title>). 화면 낭독기는 페이지를 옮길 때 이 제목을 읽고,
// 학기 결산을 PDF로 인쇄하면 파일 이름이 된다. 구체적인 것(작곡가 이름, 학기)을 앞에 둔다.

// 빈 값이나 공백뿐인 값은 건너뛰고 ' · ' 로 잇는다. pageTitle('2025-2학기', '학기 결산')
/** @param {...(string | null | undefined)} parts */
export function pageTitle(...parts) {
	return parts
		.map((part) => (part ?? '').trim())
		.filter(Boolean)
		.join(' · ');
}
