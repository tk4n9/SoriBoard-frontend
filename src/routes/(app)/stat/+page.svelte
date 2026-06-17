<script>
	import { onMount } from 'svelte';
	import ChartCard from '$lib/components/stat/ChartCard.svelte';
	import ScopeToggle from '$lib/components/stat/ScopeToggle.svelte';
	import MemberSelect from '$lib/components/stat/MemberSelect.svelte';
	import {
		horizontalBarOption,
		timelineOption,
		eraPieOption,
		countBarOption,
		diversityLineOption
	} from '$lib/chartOptions.js';

	let scope = 'all';
	let userId = null;
	let includeMentees = false;

	// 기본 기간 = 가장 최근 학기. 3/1 이후 9/1 이전이면 올해 3/1, 그 외에는 가장 가까운 9/1.
	// (1~2월이면 작년 9/1 부터인 직전 2학기.)
	function recentSemesterStart(today = new Date()) {
		const y = today.getFullYear();
		const mar1 = new Date(y, 2, 1); // 3월
		const sep1 = new Date(y, 8, 1); // 9월
		if (today >= mar1 && today < sep1) return `${y}-03-01`;
		if (today >= sep1) return `${y}-09-01`;
		return `${y - 1}-09-01`;
	}
	function toISODate(d) {
		const p = (n) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
	}

	let startDate = recentSemesterStart();
	let endDate = toISODate(new Date());

	let loading = true;
	let summary = null;
	let composers = null;
	let works = null;
	let conductors = null;
	let orchestras = null;
	let timeline = null;
	let eras = null;
	let genres = null;
	let diversity = null;
	let timelineBucket = 'month';
	let diversityBucket = 'week'; // 'week' | 'month'

	// 현재 필터를 쿼리스트링으로.
	function buildQuery(extra = {}) {
		const params = new URLSearchParams();
		if (startDate) params.set('start', startDate);
		if (endDate) params.set('end', endDate);
		if (scope === 'individual' && userId) {
			params.set('user_id', userId);
			if (includeMentees) params.set('include_mentees', 'true');
		}
		for (const [k, v] of Object.entries(extra)) params.set(k, v);
		const s = params.toString();
		return s ? `?${s}` : '';
	}

	async function getJson(endpoint, extra) {
		const res = await fetch(`/api/stats/${endpoint}${buildQuery(extra)}`);
		if (!res.ok) throw new Error(`${endpoint} 실패`);
		return res.json();
	}

	async function loadAll() {
		// 개인 범위인데 지기 미선택이면 로드 보류.
		if (scope === 'individual' && !userId) return;
		loading = true;
		try {
			[summary, composers, works, conductors, orchestras, timeline, eras, genres, diversity] =
				await Promise.all([
					getJson('summary'),
					getJson('composers', { limit: 12 }),
					getJson('works', { limit: 12 }),
					getJson('conductors', { limit: 10 }),
					getJson('orchestras', { limit: 10 }),
					getJson('timeline', { bucket: timelineBucket }),
					getJson('eras'),
					getJson('genres'),
					getJson('diversity', { bucket: diversityBucket })
				]);
		} catch (e) {
			console.error('통계 로딩 실패', e);
		} finally {
			loading = false;
		}
	}

	onMount(loadAll);

	function onScopeChange(e) {
		scope = e.detail;
		loadAll();
	}
	function onMemberChange(e) {
		userId = e.detail.userId;
		includeMentees = e.detail.includeMentees;
		loadAll();
	}
	function setDiversityBucket(b) {
		if (diversityBucket === b) return;
		diversityBucket = b;
		loadAll();
	}

	// 부제: 현재 범위 + 전체 선곡 수.
	$: scopeLabel = scope === 'individual' ? '개인' : '전체';
	$: subtitleFor = (envelope) =>
		envelope ? `${scopeLabel} · 총 ${envelope.total_plays.toLocaleString()}곡` : '';

	$: composerOpt =
		composers && horizontalBarOption(composers, '많이 튼 작곡가', subtitleFor(composers));
	$: workOpt = works && horizontalBarOption(works, '많이 튼 곡', subtitleFor(works));
	$: conductorOpt =
		conductors && horizontalBarOption(conductors, '많이 튼 지휘자', subtitleFor(conductors));
	$: orchestraOpt =
		orchestras && horizontalBarOption(orchestras, '많이 튼 오케스트라', subtitleFor(orchestras));
	$: timelineOpt = timeline && timelineOption(timeline, '기간별 선곡 추이', scopeLabel);
	$: eraOpt = eras && eraPieOption(eras, '시대별 분포', subtitleFor(eras));
	$: eraNote =
		eras && eras.unknown_share > 0.2
			? `시대 미상 비율 ${Math.round(eras.unknown_share * 100)}% — 일부 작곡가 데이터 미반영`
			: '';
	$: genreOpt = genres && eraPieOption(genres, '장르별 분포', subtitleFor(genres));

	// 다양성: 버킷 라벨, 선곡 수 막대, 다양성(고른정도) 추이.
	$: bucketLabel = diversityBucket === 'week' ? '주별' : '월별';
	$: countData = diversity && {
		labels: diversity.timeline.labels,
		values: diversity.timeline.plays
	};
	$: countOpt = countData && countBarOption(countData, `${bucketLabel} 선곡 수`, scopeLabel);
	$: diversityOpt =
		diversity &&
		diversityLineOption(
			diversity.timeline.labels,
			[
				{ name: '시대 다양성', values: diversity.timeline.era_evenness },
				{ name: '장르 다양성', values: diversity.timeline.genre_evenness }
			],
			`${bucketLabel} 다양성 추이`,
			'0=편중 · 1=고름 (가능한 모든 구간을 고르게 틀수록 1)'
		);
	// 다양성 추이 CSV 용(시대 다양성 한 계열).
	$: diversityCsvData = diversity && {
		labels: diversity.timeline.labels,
		values: diversity.timeline.era_evenness
	};
	$: pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
</script>

<div class="stat-page">
	<header class="page-header">
		<div class="title-group">
			<h1>통계</h1>
			<span class="period">{startDate} ~ {endDate} (이번 학기)</span>
		</div>
		<div class="controls">
			<ScopeToggle bind:scope on:change={onScopeChange} />
			{#if scope === 'individual'}
				<MemberSelect bind:userId bind:includeMentees on:change={onMemberChange} />
			{/if}
		</div>
	</header>

	{#if scope === 'individual' && !userId}
		<div class="empty-hint">지기를 선택하면 개인 통계를 볼 수 있습니다.</div>
	{:else}
		<!-- KPI 카드 -->
		<div class="kpi-row">
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.total_plays.toLocaleString() : '—'}</div>
				<div class="kpi-label">총 선곡</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.composers.toLocaleString() : '—'}</div>
				<div class="kpi-label">작곡가</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.works.toLocaleString() : '—'}</div>
				<div class="kpi-label">곡</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.conductors.toLocaleString() : '—'}</div>
				<div class="kpi-label">지휘자</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.orchestras.toLocaleString() : '—'}</div>
				<div class="kpi-label">오케스트라</div>
			</div>
			<div class="kpi span2">
				<div class="kpi-value small">
					{summary && summary.date_start ? `${summary.date_start} ~ ${summary.date_end}` : '—'}
				</div>
				<div class="kpi-label">기간</div>
			</div>
		</div>

		<!-- 차트 그리드 -->
		<div class="chart-grid">
			<ChartCard
				title="많이 튼 작곡가"
				option={composerOpt}
				data={composers}
				{loading}
				csvHeaders={['작곡가', '횟수']}
			/>
			<ChartCard
				title="많이 튼 곡"
				option={workOpt}
				data={works}
				{loading}
				csvHeaders={['곡', '횟수']}
			/>
			<ChartCard
				title="많이 튼 지휘자"
				option={conductorOpt}
				data={conductors}
				{loading}
				csvHeaders={['지휘자', '횟수']}
			/>
			<ChartCard
				title="많이 튼 오케스트라"
				option={orchestraOpt}
				data={orchestras}
				{loading}
				csvHeaders={['오케스트라', '횟수']}
			/>
			<ChartCard
				title="시대별 분포"
				option={eraOpt}
				data={eras}
				{loading}
				note={eraNote}
				csvHeaders={['시대', '횟수']}
			/>
			<ChartCard
				title="장르별 분포"
				option={genreOpt}
				data={genres}
				{loading}
				csvHeaders={['장르', '횟수']}
			/>
			<ChartCard
				title="기간별 선곡 추이"
				option={timelineOpt}
				data={timeline}
				{loading}
				csvHeaders={['기간', '횟수']}
			/>
		</div>

		<!-- 다양성 섹션 -->
		<div class="section-head">
			<h2>선곡 다양성</h2>
			<div class="bucket-toggle">
				<button
					class:active={diversityBucket === 'week'}
					on:click={() => setDiversityBucket('week')}
				>
					주별
				</button>
				<button
					class:active={diversityBucket === 'month'}
					on:click={() => setDiversityBucket('month')}
				>
					월별
				</button>
			</div>
		</div>

		<div class="kpi-row diversity-kpi">
			<div class="kpi">
				<div class="kpi-value">{diversity ? pct(diversity.summary.era.evenness) : '—'}</div>
				<div class="kpi-label">시대 다양성</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{diversity ? pct(diversity.summary.genre.evenness) : '—'}</div>
				<div class="kpi-label">장르 다양성</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{diversity ? diversity.summary.era.simpson.toFixed(2) : '—'}</div>
				<div class="kpi-label">시대 심슨지수</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">{diversity ? diversity.summary.genre.simpson.toFixed(2) : '—'}</div>
				<div class="kpi-label">장르 심슨지수</div>
			</div>
			<div class="kpi">
				<div class="kpi-value">
					{diversity ? diversity.summary.distinct_works.toLocaleString() : '—'}
				</div>
				<div class="kpi-label">고유 곡 수</div>
			</div>
		</div>

		<div class="chart-grid">
			<ChartCard
				title={`${bucketLabel} 선곡 수`}
				option={countOpt}
				data={countData}
				{loading}
				csvHeaders={['기간', '선곡수']}
			/>
			<ChartCard
				title={`${bucketLabel} 다양성 추이`}
				option={diversityOpt}
				data={diversityCsvData}
				{loading}
				csvHeaders={['기간', '시대다양성']}
			/>
		</div>
	{/if}
</div>

<style>
	.stat-page {
		padding: 24px 32px;
		width: 100%;
		box-sizing: border-box;
	}
	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
	}
	.title-group {
		display: flex;
		align-items: baseline;
		gap: 12px;
	}
	h1 {
		font-family: var(--xlarge-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--xlarge-font-size, 32px);
		font-weight: var(--xlarge-font-weight, 500);
		color: var(--gray-gray-950, #1a1a1a);
		margin: 0;
	}
	.period {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.empty-hint {
		text-align: center;
		padding: 80px 0;
		color: var(--gray-gray-500, #9f9f9f);
		font-family: var(--medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--medium-font-size, 16px);
	}
	.kpi-row {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 12px;
		margin-bottom: 20px;
	}
	.kpi {
		background: var(--secondary-secondary-100, #fef9f3);
		border: 1px solid var(--gray-gray-300, #d4d4d4);
		border-radius: 8px;
		padding: 14px 10px;
		text-align: center;
	}
	.kpi.span2 {
		grid-column: span 2;
	}
	.kpi-value {
		font-family: var(--large-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--large-font-size, 24px);
		font-weight: 700;
		color: var(--primary-primary-800, #6a5134);
	}
	.kpi-value.small {
		font-size: var(--medium-font-size, 16px);
	}
	.kpi-label {
		margin-top: 4px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	.chart-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
	}
	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: 28px 0 12px;
	}
	.section-head h2 {
		font-family: var(--large-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--large-font-size, 24px);
		font-weight: 600;
		color: var(--gray-gray-950, #1a1a1a);
		margin: 0;
	}
	.bucket-toggle {
		display: flex;
		gap: 4px;
	}
	.bucket-toggle button {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		background: var(--secondary-secondary-100, #fef9f3);
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 4px;
		padding: 4px 12px;
		cursor: pointer;
	}
	.bucket-toggle button.active {
		background: var(--primary-primary-600, #c8ad8f);
		color: #fff;
	}
	.diversity-kpi {
		grid-template-columns: repeat(5, 1fr);
	}
</style>
