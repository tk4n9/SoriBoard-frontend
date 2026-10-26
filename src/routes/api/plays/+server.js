import { json } from '@sveltejs/kit';
import { backendServer } from '$lib/globals';

// 선곡 기록 백엔드(/time_manage/plays/)로 쿼리스트링을 그대로 전달하는 프록시.
// 쪽은 offset 으로 이 프록시를 거쳐 넘긴다(응답의 next 는 백엔드의 절대 주소다).
export async function GET({ url, fetch }) {
	try {
		const response = await fetch(`${backendServer}/time_manage/plays/${url.search}`);
		if (!response.ok) {
			return json({ message: 'Play history lookup failed' }, { status: response.status });
		}
		return json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return json({ message: 'Play history unavailable' }, { status: 502 });
	}
}
