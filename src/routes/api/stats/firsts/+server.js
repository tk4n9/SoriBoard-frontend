import { json } from '@sveltejs/kit';
import { backendServer } from '$lib/globals';

// 학기 결산의 '처음 튼 작곡가·곡'(/time_manage/stats/firsts/)으로 쿼리스트링을 그대로 전달하는 프록시.
export async function GET({ url, fetch }) {
	try {
		const response = await fetch(`${backendServer}/time_manage/stats/firsts/${url.search}`);
		if (!response.ok) {
			return json({ message: 'First plays lookup failed' }, { status: response.status });
		}
		return json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return json({ message: 'First plays unavailable' }, { status: 502 });
	}
}
