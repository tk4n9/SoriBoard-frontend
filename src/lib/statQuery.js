// 통계 페이지의 보기 상태(범위, 지기, 견습 포함)와 URL 쿼리스트링 사이의 변환.
// `/stat?scope=individual&user_id=12` 처럼 링크로 같은 보기를 열 수 있게 한다.
// 기본값(전체 범위)은 URL에 남기지 않고, 형식이 틀린 값은 기본값으로 읽는다.
// user_id·include_mentees 는 개인 범위에서만 보기를 바꾸므로 그때만 읽고 쓴다.

const KEYS = ['scope', 'user_id', 'include_mentees'];
const ID = /^[1-9]\d*$/;

/** @param {URLSearchParams} params */
export function readStatQuery(params) {
	if (params.get('scope') !== 'individual') {
		return { scope: 'all', userId: null, includeMentees: false };
	}
	const raw = params.get('user_id');
	const userId = raw && ID.test(raw) && Number.isSafeInteger(Number(raw)) ? raw : null;
	return { scope: 'individual', userId, includeMentees: params.get('include_mentees') === 'true' };
}

// url 의 다른 파라미터와 해시는 그대로 두고 세 키만 state 에 맞춘 경로(pathname?search#hash).
/**
 * @param {URL} url
 * @param {{ scope: string, userId: string | number | null, includeMentees: boolean }} state
 */
export function statQueryHref(url, { scope, userId, includeMentees }) {
	const params = new URLSearchParams(url.search);
	for (const key of KEYS) params.delete(key);
	if (scope === 'individual') {
		params.set('scope', 'individual');
		if (userId) params.set('user_id', String(userId));
		if (includeMentees) params.set('include_mentees', 'true');
	}
	const search = params.toString();
	return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
}
