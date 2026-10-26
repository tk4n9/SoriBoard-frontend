// 카드별 최신 요청 표시. 요청 하나가 여러 카드를 덮을 수 있고(전체 로드),
// 카드 하나만 다시 불러올 수도 있다(주별/월별 → 다양성만).
// 각 카드는 자기를 덮는 가장 새 요청의 응답만 반영한다. 그래서 다양성만 다시 부른 요청이
// 진행 중인 전체 로드의 다른 카드를 버리지 않고, 그 전체 로드의 오래된 다양성 응답에 덮이지도 않는다.

export function createLatestRequests() {
	let lastId = 0;
	/** @type {Map<string, number>} */
	const latest = new Map();
	return {
		// keys 를 덮는 새 요청을 시작하고 그 id 를 돌려준다.
		/** @param {string[]} keys */
		begin(keys) {
			const id = ++lastId;
			for (const key of keys) latest.set(key, id);
			return id;
		},
		// id 가 아직 key 를 덮는 가장 새 요청인가.
		/**
		 * @param {string} key
		 * @param {number} id
		 */
		isLatest(key, id) {
			return latest.get(key) === id;
		}
	};
}
