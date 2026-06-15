import { json } from '@sveltejs/kit';
import { backendServer } from '$lib/globals';

// 통계 백엔드(/time_manage/stats/eras/)로 쿼리스트링을 그대로 전달하는 프록시.
export async function GET({ url }) {
	const response = await fetch(`${backendServer}/time_manage/stats/eras/${url.search}`);
	if (response.ok) {
		return json(await response.json());
	}
	return json({ message: 'Error' }, { status: 400 });
}
