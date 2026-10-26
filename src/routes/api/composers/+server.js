import { json } from '@sveltejs/kit';
import { backendServer } from '$lib/globals';

// 작곡가 목록(/time_manage/composers/: 시대, 출생 연도, 선곡 수)으로 쿼리스트링(?q=)을 그대로
// 전달하는 프록시. 백엔드의 상태를 그대로 돌려준다.
export async function GET({ url, fetch }) {
	try {
		const response = await fetch(`${backendServer}/time_manage/composers/${url.search}`);
		if (!response.ok) {
			return json({ message: 'Composer list lookup failed' }, { status: response.status });
		}
		return json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return json({ message: 'Composer list unavailable' }, { status: 502 });
	}
}
