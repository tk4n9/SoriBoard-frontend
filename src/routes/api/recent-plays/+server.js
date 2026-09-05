import { json } from '@sveltejs/kit';
import { backendServer } from '$lib/globals';

export async function GET({ url, fetch }) {
	try {
		const params = url.searchParams.toString();
		const response = await fetch(`${backendServer}/time_manage/recent-plays/?${params}`);
		if (!response.ok) {
			return json({ message: 'Recent play lookup failed' }, { status: response.status });
		}
		return json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
	} catch {
		return json({ message: 'Recent play lookup unavailable' }, { status: 502 });
	}
}
