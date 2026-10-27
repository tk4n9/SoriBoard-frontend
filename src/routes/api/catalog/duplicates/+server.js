import { json } from '@sveltejs/kit';
import { backendServer } from '$lib/globals';

// 작곡가 정리의 '표기 정리'(/time_manage/catalog/duplicates/: 표기만 다른 이름의 묶음)로
// 쿼리스트링(?kind=)을 그대로 전달하는 프록시. 백엔드의 상태를 그대로 돌려준다.
export async function GET({ url, fetch }) {
	try {
		const response = await fetch(`${backendServer}/time_manage/catalog/duplicates/${url.search}`);
		if (!response.ok) {
			return json({ message: 'Catalog duplicates lookup failed' }, { status: response.status });
		}
		return json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return json({ message: 'Catalog duplicates unavailable' }, { status: 502 });
	}
}
