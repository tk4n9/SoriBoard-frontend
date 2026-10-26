import { json } from '@sveltejs/kit';
import { backendServer } from '$lib/globals';

// 작곡가 한 명(/time_manage/composers/<id>/: 이름, 출생 연도, 시대)을 읽는 프록시.
// 백엔드의 상태(없는 작곡가면 404)를 그대로 돌려준다.
export async function GET({ params, fetch }) {
	// 숫자 id 만 백엔드 경로에 넣는다.
	if (!/^\d+$/.test(params.id)) return json({ message: 'Composer not found' }, { status: 404 });
	try {
		const response = await fetch(`${backendServer}/time_manage/composers/${params.id}/`);
		if (!response.ok) {
			return json({ message: 'Composer lookup failed' }, { status: response.status });
		}
		return json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return json({ message: 'Composer lookup unavailable' }, { status: 502 });
	}
}

// 작곡가의 출생 연도·시대 보정(PATCH composers/<id>/). 백엔드의 상태와 본문(400 이면 칸별
// 오류)을 그대로 돌려준다.
export async function PATCH({ params, request, fetch }) {
	if (!/^\d+$/.test(params.id)) return json({ message: 'Composer not found' }, { status: 404 });
	try {
		const response = await fetch(`${backendServer}/time_manage/composers/${params.id}/`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: await request.text()
		});
		const body = await response.json().catch(() => ({ message: 'Composer update failed' }));
		return json(body, { status: response.status });
	} catch {
		return json({ message: 'Composer update unavailable' }, { status: 502 });
	}
}
