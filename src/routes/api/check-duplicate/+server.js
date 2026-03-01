import { json } from '@sveltejs/kit';
import { backendServer } from '$lib/globals';

export async function GET({ url }) {
	const params = url.searchParams.toString();
	const response = await fetch(`${backendServer}/time_manage/check-duplicate/?${params}`);
	const data = await response.json();
	return json(data);
}
