// 통계 카드와 요청의 관계. 대부분의 카드는 자기 요청을 하나씩 갖지만,
// 다른 카드의 응답으로 그리는 카드도 있다(그 카드를 위해 따로 부르지 않는다).

// 카드 → 그 카드를 그리는 응답을 주는 요청.
// 장르별 분포는 다양성 응답의 summary.genre 로 그린다(stats/genres 와 같은 분류).
// 선곡 다양성의 칸(시대·장르 다양성, 고유 곡 수)도 다양성 응답의 summary 로 그린다.
export const DERIVED_CARDS = { genres: 'diversity', diversityTiles: 'diversity' };

// 한 번의 로드가 덮는 카드들을 요청별로 묶는다: [[요청, [카드…]], …] (처음 나온 순서).
/**
 * @param {string[]} keys
 * @param {Record<string, string>} [derived]
 * @returns {[string, string[]][]}
 */
export function requestGroups(keys, derived = DERIVED_CARDS) {
	/** @type {Map<string, string[]>} */
	const groups = new Map();
	for (const key of keys) {
		const request = derived[key] ?? key;
		const cards = groups.get(request);
		if (cards) cards.push(key);
		else groups.set(request, [key]);
	}
	return [...groups];
}

// '다시 시도'로 다시 불러올 카드: card 를 그리는 요청이 그리는 카드 가운데 실패한 것(한 번의 요청으로).
// 다양성 요청이 실패했으면 장르별 분포의 단추가 선곡 수·다양성 추이 카드와 선곡 다양성의 칸도 함께 불러온다.
// 불러온 카드는 건드리지 않는다.
/**
 * @param {string} card
 * @param {Record<string, string>} errors
 * @param {Record<string, string>} [derived]
 * @returns {string[]}
 */
export function retryKeys(card, errors, derived = DERIVED_CARDS) {
	const request = derived[card] ?? card;
	const cards = [request, ...Object.keys(derived).filter((key) => derived[key] === request)];
	return cards.filter((key) => errors[key]);
}

// 다양성 응답 → 장르별 분포 카드의 봉투({ filters, total_plays, labels, values }).
// summary 는 주별/월별 버킷과 무관하다. summary.genre 에는 총계가 없어 응답의 total_plays 를 쓴다.
/** @param {any} diversity */
export function genreDistribution(diversity) {
	const { labels, values } = diversity.summary.genre;
	return { filters: diversity.filters, total_plays: diversity.total_plays, labels, values };
}

// 다양성 응답 → 선곡 다양성의 칸(시대·장르 다양성, 고유 곡 수)이 읽는 summary.
// summary 는 버킷과 무관하므로 주별/월별만 바꾸면 칸은 그대로 둔다(다시 부르는 카드가 아니다).
/** @param {any} diversity */
export const diversityTiles = (diversity) => diversity.summary;
