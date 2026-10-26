// 작곡가 정리(/stat/composers): 검색어와 URL, 목록 순서, 시대 칸의 문구, 수정 칸의 값과
// PATCH composers/<id>/ 의 본문 사이의 변환.
// 시대는 백엔드가 era_override(아래 ERAS 중 하나일 때) 또는 출생 연도로 정한다(composers/ 의 era).

// 백엔드 era_for 의 라벨 순서(stats.py ERA_ORDER). era_override 로 고를 수 있는 값이다.
export const ERAS = ['중세', '바로크', '고전', '낭만', '근현대', '미상'];
export const UNKNOWN_ERA = '미상';
// PATCH 가 받는 가장 이른 출생 연도(가장 늦은 해는 올해).
export const MIN_BIRTH_YEAR = 1000;

/**
 * @typedef {{ id: number, name: string, num_time_music: number, birth_year: number | null,
 *   era_override: string | null, era: string }} CatalogComposer
 * @typedef {{ birthYear: string, era: string }} ComposerDraft
 */

// URL의 검색어. 없으면 ''.
/** @param {URLSearchParams} params */
export const readCatalogQuery = (params) => (params.get('q') ?? '').trim();

// 검색어를 담은 이 페이지의 경로. 빈 검색어는 URL에 남기지 않는다.
/** @param {string} q */
export function catalogHref(q) {
	const term = q.trim();
	return term ? `/stat/composers?${new URLSearchParams({ q: term })}` : '/stat/composers';
}

// composers/ 의 쿼리스트링('?q=…' 또는 '').
/** @param {string} q */
export function composersSearch(q) {
	const term = q.trim();
	return term ? `?${new URLSearchParams({ q: term })}` : '';
}

// 시대 미상을 앞에, 나머지는 받은 순서(많이 튼 순) 그대로.
/** @param {CatalogComposer[]} composers */
export function unknownFirst(composers) {
	const unknown = composers.filter((c) => c.era === UNKNOWN_ERA);
	return [...unknown, ...composers.filter((c) => c.era !== UNKNOWN_ERA)];
}

/** @param {CatalogComposer[]} composers */
export const unknownCount = (composers) => composers.filter((c) => c.era === UNKNOWN_ERA).length;

// era_override 가 시대를 정하는가(ERAS 밖의 자유 입력은 백엔드가 무시한다).
/** @param {{ era_override?: string | null }} composer */
export const hasOverride = (composer) => ERAS.includes(composer.era_override ?? '');

// 시대 칸: 시대와, 보정값이 정했으면 '보정', 무시되는 보정값이 있으면 그 사실.
/** @param {CatalogComposer} composer */
export function eraCell(composer) {
	const stored = composer.era_override;
	let note = '';
	if (hasOverride(composer)) note = '보정';
	else if (stored) note = `저장된 ‘${stored}’ 무시됨`;
	return { era: composer.era || UNKNOWN_ERA, note };
}

// 수정 칸의 처음 값. 시대 '' = 출생 연도로 정함(보정 없음).
/**
 * @param {CatalogComposer} composer
 * @returns {ComposerDraft}
 */
export function draftOf(composer) {
	return {
		birthYear: composer.birth_year == null ? '' : String(composer.birth_year),
		era: hasOverride(composer) ? /** @type {string} */ (composer.era_override) : ''
	};
}

// 출생 연도 입력의 오류 문구. 비우면(연도 없음) 괜찮다.
/**
 * @param {string} raw
 * @param {number} thisYear
 */
export function birthYearError(raw, thisYear) {
	const value = raw.trim();
	if (!value) return '';
	const year = Number(value);
	if (/^\d+$/.test(value) && year >= MIN_BIRTH_YEAR && year <= thisYear) return '';
	return `출생 연도는 ${MIN_BIRTH_YEAR}부터 ${thisYear}까지의 숫자로 적어 주세요.`;
}

// PATCH 본문: 바뀐 칸만, 빈 값은 null(보정 없음, 연도 없음). 바뀐 것이 없으면 null.
/**
 * @param {CatalogComposer} composer
 * @param {ComposerDraft} draft
 */
export function composerPatch(composer, draft) {
	const before = draftOf(composer);
	/** @type {{ birth_year?: number | null, era_override?: string | null }} */
	const body = {};
	const birthYear = draft.birthYear.trim();
	if (birthYear !== before.birthYear) body.birth_year = birthYear ? Number(birthYear) : null;
	if (draft.era !== before.era) body.era_override = draft.era || null;
	return Object.keys(body).length > 0 ? body : null;
}

const FIELD_NAMES = { birth_year: '출생 연도', era_override: '시대' };

// 백엔드의 400 본문({ birth_year: ['…'] } 등) → 한 줄 문구.
/** @param {unknown} body */
export function patchErrorText(body) {
	if (body && typeof body === 'object') {
		const fields = Object.keys(FIELD_NAMES).filter((key) => key in body);
		if (fields.length > 0) {
			return `${fields.map((key) => FIELD_NAMES[key]).join('·')} 값을 저장하지 못했습니다.`;
		}
	}
	return '저장하지 못했습니다.';
}

// 저장한 뒤 목록의 그 작곡가를 백엔드의 답으로 바꾼다(자리는 그대로).
/**
 * @param {CatalogComposer[]} composers
 * @param {CatalogComposer} saved
 */
export const replaceComposer = (composers, saved) =>
	composers.map((c) => (c.id === saved.id ? { ...c, ...saved } : c));
