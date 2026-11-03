<script>
	import { onMount, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import ChartCard from '$lib/components/stat/ChartCard.svelte';
	import ScopeToggle from '$lib/components/stat/ScopeToggle.svelte';
	import MemberSelect from '$lib/components/stat/MemberSelect.svelte';
	import PeriodSelect from '$lib/components/stat/PeriodSelect.svelte';
	import DrillPanel from '$lib/components/stat/DrillPanel.svelte';
	import TableCard from '$lib/components/stat/TableCard.svelte';
	import {
		horizontalBarOption,
		timelineOption,
		eraPieOption,
		countBarOption,
		diversityLineOption
	} from '$lib/chartOptions.js';
	import {
		readStatQuery,
		statQueryHref,
		readTableView,
		writeTableView,
		tableViewHref
	} from '$lib/statQuery.js';
	import { createLatestRequests } from '$lib/latestRequest.js';
	import {
		requestGroups,
		retryKeys,
		previousRetryRequests,
		genreDistribution,
		diversityTiles,
		loadStatusText,
		withPreviousFailure
	} from '$lib/statCards.js';
	import {
		chooseTimelineBucket,
		timelineBucketName,
		timelineView,
		readDiversityBucket,
		writeDiversityBucket,
		semesterRangeOf,
		semesterOf,
		semesterBefore,
		bucketRange,
		sameSpanBefore
	} from '$lib/statBucket.js';
	import {
		shareTable,
		seriesTable,
		formatEvenness,
		groupEvenness,
		unknownEraNote,
		topOf,
		rankCapNote
	} from '$lib/statTable.js';
	import { tableCsv } from '$lib/csvTable.js';
	import {
		barItemIndex,
		drillTarget,
		drillParams,
		readDrillQuery,
		writeDrillQuery,
		drillItemIndex,
		WORKS_LIMIT
	} from '$lib/statDrill.js';
	import {
		CURRENT,
		ALL,
		CUSTOM,
		readStatPeriod,
		readStatRange,
		writeStatPeriod,
		periodRangeText,
		currentSemesterRange,
		semesterLabel
	} from '$lib/statPeriod.js';
	import { historyHref, drillWorkTargets, bucketHistoryLinks } from '$lib/playHistory.js';
	import { composerHref } from '$lib/composerStats.js';
	import {
		reportHref,
		previousSemester,
		kpiChangeText,
		evennessChangeText,
		mixTable,
		rankChangeTable,
		rankNotes,
		firstIdSet,
		firstsTable,
		ongoingText,
		upcomingText
	} from '$lib/semesterReport.js';
	import { hasPeriodStart, firstsSubtitle, firstsEmptyText } from '$lib/statFirsts.js';
	import { memberFileText } from '$lib/statFileName.js';
	import { pageTitle, periodTitle } from '$lib/statTitle.js';

	// 범위·지기·견습 포함·기간·주별/월별·열린 drill-down 패널은 URL에도 둔다(링크로 같은 보기를 연다). 페이지가 시작될 때 한 번만 읽는다.
	const initial = readStatQuery($page.url.searchParams);
	let scope = initial.scope;
	let userId = initial.userId;
	let includeMentees = initial.includeMentees;
	// 모든 차트 표로 보기(view=table): 누르면 모든 차트 카드가 표를 보인다. 카드의 '표로 보기'는 그 카드만 바꾼다.
	let allTables = readTableView($page.url.searchParams);
	let period = readStatPeriod($page.url.searchParams); // 'current' | 'all' | 'custom' | 학기 id
	// 직접 지정 범위(YYYY-MM-DD, 빈 값 = 그쪽이 열림).
	let { start: customStart, end: customEnd } =
		period === CUSTOM ? readStatRange($page.url.searchParams) : { start: '', end: '' };
	// PeriodSelect 가 불러온 학기 목록: 학기 버킷의 링크를 그 학기(semester_id)로 연다.
	let semesters = [];

	// 보기가 바뀌면 URL을 바꾼다. 히스토리를 쌓지 않고, 포커스·스크롤도 그대로 둔다.
	function syncUrl() {
		const url = new URL($page.url);
		writeStatPeriod(url.searchParams, period, { start: customStart, end: customEnd });
		writeDiversityBucket(url.searchParams, diversityBucket);
		writeDrillQuery(url.searchParams, drill ?? linkedDrill);
		writeTableView(url.searchParams, allTables);
		goto(statQueryHref(url, { scope, userId, includeMentees }), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	// 기본 기간 = 가장 최근 학기의 시작일부터 오늘까지(선곡 기록과 같은 규칙, statPeriod.js).
	let { start: startDate, end: endDate } = currentSemesterRange();

	let diversityBucket = readDiversityBucket($page.url.searchParams); // 'week' | 'month'
	// 기간별 선곡 추이의 단위: 한 학기를 넘으면 학기별, 아니면 토글이 보이지 않는 쪽(statBucket.js).
	const nextTimelineBucket = () =>
		chooseTimelineBucket(
			period === CUSTOM
				? { period, start: customStart, end: customEnd }
				: { period, start: startDate, end: endDate },
			diversityBucket,
			endDate
		);
	let timelineBucket = nextTimelineBucket();
	// 백엔드가 적용했다고 돌려준 기간(filters). 기간이 바뀔 때만 비운다.
	let appliedFilters = null;

	// 현재 필터를 쿼리스트링으로. periodParams 를 주면 보기의 기간 대신 그것을 보낸다(앞 학기 요청).
	function buildQuery(extra = {}, periodParams = null) {
		const params = new URLSearchParams();
		if (periodParams) {
			for (const [k, v] of Object.entries(periodParams)) params.set(k, v);
		} else if (period === CURRENT) {
			if (startDate) params.set('start', startDate);
			if (endDate) params.set('end', endDate);
		} else if (period === CUSTOM) {
			if (customStart) params.set('start', customStart);
			if (customEnd) params.set('end', customEnd);
		} else if (period !== ALL) {
			params.set('semester_id', period);
		}
		if (scope === 'individual' && userId) {
			params.set('user_id', userId);
			if (includeMentees) params.set('include_mentees', 'true');
		}
		for (const [k, v] of Object.entries(extra)) params.set(k, v);
		const s = params.toString();
		return s ? `?${s}` : '';
	}

	async function getJson(endpoint, extra, periodParams = null) {
		const res = await fetch(`/api/stats/${endpoint}${buildQuery(extra, periodParams)}`);
		if (!res.ok) throw new Error(`${endpoint} 실패`);
		return res.json();
	}

	// 순위 카드의 차트 길이. 이번 기간은 표로 보기·CSV에 모두 싣도록 백엔드의 상한(WORKS_LIMIT, 100)까지
	// 부르고, 앞 학기도 그만큼 불러 표의 지난 학기 칸에 상위 100 안의 순위를 그대로 적는다('23위').
	const LIMITS = { composers: 12, soloists: 12, conductors: 10, orchestras: 10, works: 10 };
	// 카드는 따로 불러오고, 실패하면 그 카드에만 오류를 띄운다. 요청 하나가 여러 카드를 그릴 수 있다:
	// 장르별 분포와 선곡 다양성의 칸은 따로 부르지 않고 다양성 응답으로 그린다(statCards.js).
	const cardRequests = {
		summary: () => getJson('summary'),
		composers: () => getJson('composers', { limit: WORKS_LIMIT }),
		soloists: () => getJson('soloists', { limit: WORKS_LIMIT }),
		conductors: () => getJson('conductors', { limit: WORKS_LIMIT }),
		orchestras: () => getJson('orchestras', { limit: WORKS_LIMIT }),
		timeline: () => getJson('timeline', { bucket: timelineBucket }),
		eras: () => getJson('eras'),
		diversity: () => getJson('diversity', { bucket: diversityBucket }),
		works: () => getJson('works', { limit: WORKS_LIMIT }),
		// 시작이 없는 기간이면 firsts 는 지금까지 튼 모든 것을 주므로 부르지 않는다(null, statFirsts.js).
		firstComposers: () => (hasFirsts() ? getJson('firsts', { kind: 'composer' }) : null),
		firstWorks: () => (hasFirsts() ? getJson('firsts', { kind: 'work' }) : null)
	};
	const hasFirsts = () =>
		hasPeriodStart({ period, start: period === CUSTOM ? customStart : startDate });
	// 다른 카드의 응답에서 꺼내 그리는 카드.
	const pickCard = { genres: genreDistribution, diversityTiles };
	const CARD_KEYS = [...Object.keys(cardRequests), ...Object.keys(pickCard)];

	/** @type {Record<string, any>} */
	let data = {};
	/** @type {Record<string, boolean>} */
	let loading = Object.fromEntries(CARD_KEYS.map((key) => [key, true]));
	/** @type {Record<string, string>} */
	let errors = {};
	$: ({
		summary,
		composers,
		soloists,
		conductors,
		orchestras,
		timeline,
		eras,
		genres,
		diversity,
		works
	} = data);
	// 선곡 다양성의 칸: 다양성 응답의 summary. 주별/월별만 바꾸면 다시 부르지 않고 그대로 둔다.
	$: tiles = data.diversityTiles;

	// 카드마다 자기를 덮는 가장 최근 요청의 응답만 반영한다. 늦게 도착한 이전 요청의 응답은 버린다.
	const requests = createLatestRequests();

	async function load(keys) {
		// 개인 범위인데 지기 미선택이면 로드 보류.
		if (scope === 'individual' && !userId) return;
		if (keys.includes('summary')) loadPreviousSummary();
		const id = requests.begin(keys);
		for (const key of keys) {
			// 불러오는 동안(그리고 실패한 뒤) 이전 필터의 수치가 새 필터의 이름으로 남아 보이지 않도록 비운다.
			data[key] = null;
			loading[key] = true;
			errors[key] = '';
		}
		await Promise.allSettled(
			requestGroups(keys).map(async ([request, cards]) => {
				// 주별/월별로 다양성만 다시 부르면 장르 카드는 덮이지 않으므로, 진행 중인 전체 로드의
				// 다양성 응답이 장르 카드를 채운다(summary 는 버킷과 무관하다).
				const latest = () => cards.filter((key) => requests.isLatest(key, id));
				try {
					const result = await cardRequests[request]();
					// 부르지 않은 카드(null)는 비운 채로 둔다.
					if (result == null) return;
					for (const key of latest()) {
						data[key] = pickCard[key] ? pickCard[key](result) : result;
						// 모든 통계 응답이 적용된 기간(filters)을 돌려준다.
						appliedFilters = result.filters;
						openLinkedDrill(key);
					}
				} catch (e) {
					const failed = latest();
					if (failed.length) console.error(`통계 로딩 실패 (${request})`, e);
					for (const key of failed) errors[key] = '불러오지 못했습니다';
				} finally {
					for (const key of latest()) loading[key] = false;
				}
			})
		);
	}
	// '다시 시도': 그 카드의 요청이 그리는 카드 가운데 실패한 것만 한 번에 다시 부른다(statCards.js).
	// loadAll 과 달리 drill-down 패널과 기간별 선곡 추이의 단위는 그대로 둔다.
	// 그 카드의 앞 학기 요청도 실패했으면 retryPrevious 처럼 같은 토큰으로 함께 다시 부른다
	// (요약을 다시 부르면 load 가 앞 학기를 모두 다시 부른다).
	function retry(key) {
		const keys = retryKeys(key, errors);
		if (!keys.includes('summary')) {
			const again = previousRetryRequests(keys, previousFailed);
			previousFailed = previousFailed.filter((name) => !again.includes(name));
			again.forEach(askPrevious);
		}
		return load(keys);
	}
	// KPI 줄의 '다시 시도'는 누르면 줄째 사라지므로, 포커스를 다시 불러오는 칸들로 옮긴다.
	function retryRow(key, row) {
		row?.focus();
		retry(key);
	}
	let summaryRow;
	let tilesRow;
	const loadAll = () => {
		timelineBucket = nextTimelineBucket();
		loadDrill();
		return load(CARD_KEYS);
	};

	// 기간이 목록의 학기면 KPI 칸 아래에 바로 앞 학기와 견준 줄을 둔다(학기 결산과 같다).
	// 앞 학기의 요약은 같은 범위·지기·견습 포함으로 요약과 함께 부르고, 실패하면 줄만 없다.
	// 앞 학기의 요청이 하나라도 실패하면 KPI 칸 아래에 그 학기를 밝히고, 실패한 요청만 다시 부르게 한다.
	// 시대·장르의 표도 앞 학기의 비율과 견준다(학기 결산의 mixTable). 실패하면 그 표만 지금과 같다.
	// 선곡 다양성의 칸도 앞 학기의 다양성 응답과 견준다(summary 는 버킷과 무관하므로 월별로 부른다).
	// 많이 튼 표에는 앞 학기 상위 100(WORKS_LIMIT)에서의 순위를 붙인다(학기 결산의 rankChangeTable).
	// 처음 튼 작곡가·곡의 부제에는 앞 학기에 처음 튼 수를 붙인다(같은 firsts 를 kind 별로 부른다).
	let previousSummary = null;
	let previousEras = null;
	let previousGenres = null;
	let previousTiles = null;
	let previousFirstComposers = null;
	let previousFirstWorks = null;
	/** @type {Record<string, any>} 순위 카드별 앞 학기의 목록(LIMITS 의 키) */
	let previousRanks = {};
	let previousAsked = null; // 마지막으로 부른 앞 학기 id(없으면 null)
	let previousTarget = null; // 마지막으로 부른 앞 학기
	let previousToken = 0; // 이전 보기의 늦은 응답은 버린다.
	/** @type {string[]} 실패한 앞 학기 요청(엔드포인트). KPI 칸 아래에 다시 시도와 함께 알린다. */
	let previousFailed = [];
	// 이번 학기는 id 가 아닌 날짜 범위라, 그 시작일의 학기보다 앞선 가장 최근 학기와 견준다(statBucket.js).
	const previousOf = (p, list) => {
		if (p === CURRENT) return semesterBefore(semesterOf(startDate), list);
		const chosen = list.find((s) => String(s.id) === p);
		return chosen ? previousSemester(chosen, list) : null;
	};
	// 진행 중인 학기(이번 학기, 또는 오늘이 든 학기)는 앞 학기도 첫날부터 같은 날수만큼만 센다
	// (statBucket.js). 지난 학기를 고르면 null: 앞 학기 전체(semester_id)와 견준다.
	let previousSpan = null; // 마지막으로 부른 앞 학기의 같은 기간({ start, end }, 없으면 null)
	const previousSpanOf = (p, list) => {
		const previous = previousOf(p, list);
		if (!previous) return null;
		const range = bucketRange('semester', `${previous.year}-${previous.semester_num}`);
		if (p === CURRENT) return sameSpanBefore(range, startDate, endDate);
		const own = semesterRangeOf(p, list);
		return ongoingText(own, endDate) ? sameSpanBefore(range, own.start, endDate) : null;
	};
	// 앞 학기 요청의 기간: 같은 기간이 있으면 그 날짜, 없으면 앞 학기 전체.
	const previousParams = (span, previous) =>
		span ? { start: span.start, end: span.end } : { semester_id: String(previous.id) };
	// 앞 학기의 장르도 지금 학기의 카드처럼 다양성 응답에서 꺼낸다(요청 하나, stats/genres 와 같은 수). 월별 버킷이면 쓰지 않는 timeline 이 작다.
	const previousRequests = {
		summary: { apply: (result) => (previousSummary = result) },
		eras: { apply: (result) => (previousEras = result) },
		diversity: {
			extra: { bucket: 'month' },
			apply: (result) => {
				previousTiles = diversityTiles(result);
				previousGenres = genreDistribution(result);
			}
		},
		firstComposers: {
			endpoint: 'firsts',
			extra: { kind: 'composer' },
			apply: (result) => (previousFirstComposers = result)
		},
		firstWorks: {
			endpoint: 'firsts',
			extra: { kind: 'work' },
			apply: (result) => (previousFirstWorks = result)
		},
		...Object.fromEntries(
			Object.keys(LIMITS).map((key) => [
				key,
				{
					apply: (result) => (previousRanks = { ...previousRanks, [key]: result }),
					extra: { limit: WORKS_LIMIT }
				}
			])
		)
	};
	async function askPrevious(endpoint) {
		const id = previousToken;
		// 기록이 endpoint 를 밝히면 그것을 부른다(키가 같은 엔드포인트를 둘이 나눠 쓸 때).
		const { apply, extra = {}, endpoint: path = endpoint } = previousRequests[endpoint];
		try {
			// 보기의 기간 대신 앞 학기의 기간(같은 기간 또는 semester_id)만 보내고, 지기는 그대로다.
			const result = await getJson(path, extra, previousParams(previousSpan, previousTarget));
			if (requests.isLatest('previousSummary', id)) apply(result);
		} catch (e) {
			if (requests.isLatest('previousSummary', id)) {
				console.error(`통계 로딩 실패 (지난 학기 ${endpoint})`, e);
				previousFailed = [...previousFailed, endpoint];
			}
		}
	}
	async function loadPreviousSummary() {
		previousToken = requests.begin(['previousSummary']);
		const previous = previousOf(period, semesters);
		previousAsked = previous?.id ?? null;
		previousTarget = previous;
		previousSpan = previousSpanOf(period, semesters);
		previousFailed = [];
		previousSummary = null;
		previousEras = null;
		previousGenres = null;
		previousTiles = null;
		previousFirstComposers = null;
		previousFirstWorks = null;
		previousRanks = {};
		if (!previous || (scope === 'individual' && !userId)) return;
		await Promise.allSettled(Object.keys(previousRequests).map(askPrevious));
	}
	// 지난 학기 수치의 '다시 시도': 실패한 요청만 같은 토큰으로 다시 부른다. 새 토큰(begin)을 쓰면 아직
	// 오지 않은 첫 요청의 응답까지 버려진다. 줄은 누르자마자 사라지므로 포커스를 KPI 칸으로 옮긴다.
	function retryPrevious() {
		summaryRow?.focus();
		const failed = previousFailed;
		previousFailed = [];
		return Promise.allSettled(failed.map(askPrevious));
	}
	// 링크로 연 학기는 학기 목록이 온 뒤에야 앞 학기를 안다. 기간·범위가 바뀔 때는 load 가 이미
	// 불렀으므로, 앞 학기가 마지막으로 부른 것과 다를 때만 부른다.
	$: previousId = previousOf(period, semesters)?.id ?? null;
	$: if (previousId !== previousAsked) loadPreviousSummary();
	// 칸마다 { diff: '+32', before: '지난 학기 280' }. 앞 학기가 없거나 아직 없으면 null.
	$: changes = Object.fromEntries(
		['total_plays', 'sessions', 'requested', 'composers', 'works', 'conductors', 'orchestras'].map(
			(key) => {
				const text = kpiChangeText(summary?.[key], previousSummary?.[key]);
				const [diff, before] = text.split(' · ');
				return [key, text ? { diff, before } : null];
			}
		)
	);
	// 선곡 다양성의 칸도 같은 모양. 다양성은 보이는 정수 %끼리의 차이(%p)다.
	$: tileChanges = Object.fromEntries(
		Object.entries({
			era: evennessChangeText(groupEvenness(tiles?.era), groupEvenness(previousTiles?.era)),
			genre: evennessChangeText(groupEvenness(tiles?.genre), groupEvenness(previousTiles?.genre))
		}).map(([key, text]) => {
			const [diff, before] = text.split(' · ');
			return [key, text ? { diff, before } : null];
		})
	);

	// drill-down: 순위 카드의 막대나 표의 행 → 그 대상의 곡(같은 기간·범위, statDrill.js).
	// 기간·범위가 바뀌면 같은 대상(id)으로 다시 불러온다.
	/** @type {import('$lib/statDrill.js').DrillTarget | null} */
	let drill = null;
	let drillWorks = null;
	let drillLoading = false;
	let drillError = '';
	/** @type {HTMLElement | null} */
	let drillOpener = null; // 패널을 연 표의 단추. 닫으면 포커스를 돌려준다.
	// URL로 연 패널(drill·drill_id): 그 카드가 처음 불러와지면 id 로 항목을 찾아 연다.
	// 그 기간·범위의 항목에 없으면 이름을 알 수 없으므로 열지 않고 URL에서도 지운다.
	let linkedDrill = readDrillQuery($page.url.searchParams);
	// 기간이 앞 학기가 있는 학기면 같은 대상·범위의 앞 학기 곡도 불러 패널의 표에 지난 학기 칸을 붙인다.
	// 실패하면 패널의 표 아래에 알리고, 그 '다시 시도'는 앞 학기만 다시 부른다.
	let previousDrillWorks = null;
	let previousDrillFailed = false;
	let previousDrillFor = null; // 마지막으로 부른 앞 학기 id(없으면 null)

	async function loadPreviousDrill() {
		const id = requests.begin(['previousDrill']);
		const previous = previousOf(period, semesters);
		previousDrillFor = previous?.id ?? null;
		previousDrillWorks = null;
		previousDrillFailed = false;
		if (!drill || !previous || (scope === 'individual' && !userId)) return;
		try {
			// 요약과 같은 앞 학기의 기간(같은 기간 또는 semester_id)만 보내고, 지기는 그대로다.
			const result = await getJson(
				'works',
				drillParams(drill),
				previousParams(previousSpanOf(period, semesters), previous)
			);
			if (requests.isLatest('previousDrill', id)) previousDrillWorks = result;
		} catch (e) {
			if (requests.isLatest('previousDrill', id)) {
				console.error('통계 로딩 실패 (지난 학기 drill works)', e);
				previousDrillFailed = true;
			}
		}
	}
	// 링크로 연 학기는 학기 목록이 온 뒤에야 앞 학기를 안다(요약의 previousId 와 같다).
	$: if (drill && previousId !== previousDrillFor) loadPreviousDrill();

	async function loadDrill() {
		if (!drill || (scope === 'individual' && !userId)) return;
		loadPreviousDrill();
		const id = requests.begin(['drill']);
		drillWorks = null;
		drillLoading = true;
		drillError = '';
		try {
			const result = await getJson('works', drillParams(drill));
			if (requests.isLatest('drill', id)) drillWorks = result;
		} catch (e) {
			if (requests.isLatest('drill', id)) {
				console.error('통계 로딩 실패 (works)', e);
				drillError = '불러오지 못했습니다';
			}
		} finally {
			if (requests.isLatest('drill', id)) drillLoading = false;
		}
	}
	function openDrill(card, index) {
		const target = drillTarget(card, data[card], index);
		if (!target) return;
		const active = document.activeElement;
		drillOpener = active instanceof HTMLElement && active.closest('.card') ? active : null;
		linkedDrill = null; // 링크의 패널이 아직 열리지 않았으면, 지금 고른 것이 이긴다.
		drill = target;
		syncUrl();
		loadDrill();
	}
	function openLinkedDrill(card) {
		if (linkedDrill?.card !== card) return;
		const index = drillItemIndex(data[card], linkedDrill.id);
		linkedDrill = null;
		if (index >= 0) openDrill(card, index);
		else syncUrl();
	}
	// 막대는 1위가 맨 위에 오도록 뒤집혀 그려진다. 차트는 응답의 앞 LIMITS[card]개만 그린다.
	const openBar = (card, e) =>
		openDrill(
			card,
			barItemIndex(e.detail.dataIndex, Math.min(data[card]?.labels?.length ?? 0, LIMITS[card]))
		);
	async function closeDrill() {
		requests.begin(['drill', 'previousDrill']); // 진행 중인 응답은 버린다.
		drill = null;
		drillWorks = null;
		previousDrillWorks = null;
		previousDrillFailed = false;
		syncUrl();
		await tick();
		if (drillOpener?.isConnected) drillOpener.focus();
		drillOpener = null;
	}

	onMount(loadAll);

	function onScopeChange(e) {
		scope = e.detail;
		syncUrl();
		loadAll();
	}
	function onMemberChange(e) {
		userId = e.detail.userId;
		includeMentees = e.detail.includeMentees;
		syncUrl();
		loadAll();
	}
	function onPeriodChange(e) {
		period = e.detail;
		appliedFilters = null;
		syncUrl();
		loadAll();
	}
	function setDiversityBucket(b) {
		if (diversityBucket === b) return;
		diversityBucket = b;
		syncUrl();
		// 한 학기 이하면 기간별 선곡 추이도 반대 단위로 바뀌므로 함께 다시 부른다.
		const next = nextTimelineBucket();
		if (next === timelineBucket) load(['diversity']);
		else {
			timelineBucket = next;
			load(['diversity', 'timeline']);
		}
	}

	// 머리말 기간: 백엔드가 돌려준 범위. 아직 없으면 보낼 범위로 짐작한다(학기는 학기 목록의 연도·학기로).
	$: semesterRange = semesterRangeOf(period, semesters);
	// 고른 학기가 아직 진행 중이면 '진행 중 · 2026-11-01까지', 시작 전이면 '시작 전 · 2027-03-01부터'
	// (학기 결산과 같다). endDate 는 처음 연 날이다.
	$: ongoing = ongoingText(semesterRange, endDate);
	$: upcoming = upcomingText(semesterRange, endDate);
	$: periodText = appliedFilters
		? periodRangeText(appliedFilters)
		: period === CURRENT
			? `${startDate} ~ ${endDate}`
			: period === ALL
				? '전체 기간'
				: period === CUSTOM
					? periodRangeText({ start: customStart, end: customEnd })
					: periodRangeText(semesterRange);
	// 직접 지정을 고르면 입력란에 지금 보이는 기간을 채운다(전체 기간이면 이번 학기).
	$: shownRange =
		appliedFilters && (appliedFilters.start || appliedFilters.end)
			? { start: appliedFilters.start ?? '', end: appliedFilters.end ?? '' }
			: semesterRange ?? { start: startDate, end: endDate };
	// 내려받는 파일 이름에 넣을 보기: 머리말의 기간과, 개인이면 지기(statFileName.js).
	let userName = '';
	$: memberText =
		scope === 'individual' ? memberFileText({ userId, name: userName, includeMentees }) : '';
	$: fileTag = [periodText, memberText];
	// 탭 제목에도 보기를 넣는다(기본값인 이번 학기·전체는 빼고): '가상이 · 2025-2학기 · 통계'.
	$: tabTitle = pageTitle(
		memberText,
		periodTitle({ period, start: customStart, end: customEnd }, semesters),
		'통계'
	);
	// 차트 부제: 기간(기간 선택의 이름, 학기 목록 전에는 머리말의 날짜) · 지기(개인) 또는 전체 · 전체 선곡 수.
	// PNG로 저장한 차트, 표로 보기, 화면 낭독기의 차트 이름이 모두 이 보기를 말한다.
	$: periodName =
		(period === CURRENT
			? '이번 학기'
			: periodTitle({ period, start: customStart, end: customEnd }, semesters)) || periodText;
	$: viewLabel = pageTitle(periodName, scope === 'individual' ? memberText : '전체');
	$: subtitleFor = (envelope) =>
		envelope ? `${viewLabel} · 총 ${envelope.total_plays.toLocaleString()}곡` : '';

	// 순위 차트는 상위 LIMITS 개만 그린다(표로 보기·CSV는 응답 전체).
	$: composerOpt =
		composers &&
		horizontalBarOption(
			topOf(composers, LIMITS.composers),
			'많이 튼 작곡가',
			subtitleFor(composers),
			rankNotes(composerTable)?.slice(0, LIMITS.composers)
		);
	$: soloistOpt =
		soloists &&
		horizontalBarOption(
			topOf(soloists, LIMITS.soloists),
			'많이 튼 독주자',
			subtitleFor(soloists),
			rankNotes(soloistTable)?.slice(0, LIMITS.soloists)
		);
	$: conductorOpt =
		conductors &&
		horizontalBarOption(
			topOf(conductors, LIMITS.conductors),
			'많이 튼 지휘자',
			subtitleFor(conductors),
			rankNotes(conductorTable)?.slice(0, LIMITS.conductors)
		);
	$: orchestraOpt =
		orchestras &&
		horizontalBarOption(
			topOf(orchestras, LIMITS.orchestras),
			'많이 튼 오케스트라',
			subtitleFor(orchestras),
			rankNotes(orchestraTable)?.slice(0, LIMITS.orchestras)
		);
	// 같은 작곡가의 곡이 같은 이름으로 잘리지 않게 이름 칸을 220px로 넓힌다.
	$: worksOpt =
		works &&
		horizontalBarOption(
			topOf(works, LIMITS.works),
			'많이 튼 곡',
			subtitleFor(works),
			rankNotes(worksTable)?.slice(0, LIMITS.works),
			220
		);
	$: timelineTitle = `${timelineBucketName(timelineBucket)} 선곡 추이`;
	// 화면 낭독기에 알리는 로드 상태(statCards.js)가 읽는 카드 이름, 페이지 순서. 선곡 다양성은 그 절의 제목이다.
	$: cardNames = [
		['summary', '요약'],
		['composers', '많이 튼 작곡가'],
		['soloists', '많이 튼 독주자'],
		['conductors', '많이 튼 지휘자'],
		['orchestras', '많이 튼 오케스트라'],
		['eras', '시대별 분포'],
		['genres', '장르별 분포'],
		['timeline', timelineTitle],
		['works', '많이 튼 곡'],
		['diversityTiles', '선곡 다양성'],
		['diversity', '선곡 다양성'],
		['firstComposers', '처음 튼 작곡가'],
		['firstWorks', '처음 튼 곡']
	];
	// 개인 범위인데 지기 미선택이면 카드를 부르지 않으므로(load) 알릴 것도 없다.
	// 지난 학기 수치가 실패했다는 말은 KPI 칸 아래 줄과 같은 조건으로 붙인다.
	$: loadStatus = withPreviousFailure(
		scope === 'individual' && !userId ? '' : loadStatusText(loading, errors, cardNames),
		previousFailed.length && !errors.summary ? semesterLabel(previousTarget) : ''
	);
	$: timelineData = timeline && timelineView(timeline, endDate);
	$: timelineOpt = timelineData && timelineOption(timelineData, timelineTitle, viewLabel);
	$: eraOpt = eras && eraPieOption(eras, '시대별 분포', subtitleFor(eras));
	$: eraNote = unknownEraNote(eras);
	$: genreOpt = genres && eraPieOption(genres, '장르별 분포', subtitleFor(genres));
	// 표로 보기와 CSV 저장은 같은 표다(앞 학기가 있으면 지난 학기·변화 열까지, 학기 결산과 같다).
	$: eraTable =
		eras && (previousEras ? mixTable(eras, previousEras, '시대') : shareTable(eras, '시대'));
	$: genreTable =
		genres &&
		(previousGenres ? mixTable(genres, previousGenres, '장르') : shareTable(genres, '장르'));
	// 많이 튼 표도 같다: 순위·이름·횟수(앞 학기가 있으면 지난 학기 열까지).
	// 작곡가·곡은 처음 튼 목록이 오면 이 기간에 처음 튼 행을 '첫 선곡'으로 적는다.
	$: composerTable =
		composers &&
		rankChangeTable(
			composers,
			previousRanks.composers,
			'작곡가',
			WORKS_LIMIT,
			firstIdSet(firstComposers)
		);
	$: soloistTable =
		soloists && rankChangeTable(soloists, previousRanks.soloists, '연주자', WORKS_LIMIT);
	$: conductorTable =
		conductors && rankChangeTable(conductors, previousRanks.conductors, '지휘자', WORKS_LIMIT);
	$: orchestraTable =
		orchestras && rankChangeTable(orchestras, previousRanks.orchestras, '오케스트라', WORKS_LIMIT);
	$: worksTable =
		works && rankChangeTable(works, previousRanks.works, '곡', WORKS_LIMIT, firstIdSet(firstWorks));

	// 다양성: 버킷 라벨, 선곡 수 막대, 다양성(고른정도) 추이.
	$: bucketLabel = diversityBucket === 'week' ? '주별' : '월별';
	// 선곡 추이처럼 오늘이 든 주·월에 ' (진행 중)'(statBucket.js); 막대·점의 링크는 원래 라벨로 만든다.
	$: diversityLabels =
		diversity &&
		timelineView({ filters: diversity.filters, labels: diversity.timeline.labels }, endDate).labels;
	$: countData = diversity && {
		labels: diversityLabels,
		values: diversity.timeline.plays
	};
	$: countOpt = countData && countBarOption(countData, `${bucketLabel} 선곡 수`, viewLabel);
	$: diversityOpt =
		diversity &&
		diversityLineOption(
			diversityLabels,
			[
				{ name: '시대 다양성', values: diversity.timeline.era_evenness },
				{ name: '장르 다양성', values: diversity.timeline.genre_evenness }
			],
			`${bucketLabel} 다양성 추이`,
			'0%=편중 · 100%=고름 (가능한 모든 시대·장르를 고르게 틀수록 100%)'
		);
	// 다양성 추이: 차트의 data(PNG·CSV 저장의 빈 데이터 판단용).
	$: diversityCsvData = diversity && {
		labels: diversityLabels,
		values: diversity.timeline.era_evenness
	};
	// 표로 보기: 다양성 추이는 두 계열을 모두 싣는다(그 밖의 시계열 카드는 data 로 만든다).
	// CSV 는 이 표를 화면 그대로(41%) 저장한다.
	$: diversityTable =
		diversity &&
		seriesTable(diversityLabels, '기간', [
			{ name: '시대 다양성', values: diversity.timeline.era_evenness, format: formatEvenness },
			{ name: '장르 다양성', values: diversity.timeline.genre_evenness, format: formatEvenness }
		]);
	$: pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
	// 머리말의 '선곡 기록' 링크: 같은 기간과(개인 범위면) 같은 지기의 선곡 목록.
	$: historyFilter = {
		period,
		start: customStart,
		end: customEnd,
		q: '',
		userId: scope === 'individual' ? userId : null,
		includeMentees,
		requested: ''
	};
	$: historyLink = historyHref(historyFilter);
	// 신청곡 칸의 숫자: 같은 목록에서 신청곡만.
	$: requestedLink = historyHref({ ...historyFilter, requested: 'true' });
	// drill-down 패널의 'N곡 모두 보기': stats/works 에 보낸 것과 같은 기간·지기·id 필터.
	$: drillHistoryLink =
		drill &&
		historyHref({ ...historyFilter, targets: [{ param: drill.param, id: String(drill.id) }] });
	// 패널의 곡 하나: 같은 기간·지기에서 그 대상이 그 곡을 튼 선곡.
	$: drillWorkLink = (item) =>
		drill && item.id != null
			? historyHref({ ...historyFilter, targets: drillWorkTargets(drill, item.id) })
			: null;
	// 많이 튼 곡의 곡 하나: 같은 기간·지기에서 그 곡을 튼 선곡(표의 이름, 차트의 막대·이름).
	$: worksLinks = works
		? works.items.map((item) =>
				historyHref({ ...historyFilter, targets: [{ param: 'music_id', id: String(item.id) }] })
			)
		: [];
	// 막대는 1위가 맨 위에 오도록 뒤집혀 그려진다. 차트는 앞 LIMITS.works 곡만, 링크는 표의 모든 행.
	function openWork(e) {
		const length = Math.min(worksLinks.length, LIMITS.works);
		const href = worksLinks[barItemIndex(e.detail.dataIndex, length)];
		if (href) goto(href);
	}
	// 처음 튼 작곡가·곡: 이름은 같은 기간·지기의 작곡가 페이지와, 그 곡의 선곡 기록을 연다.
	$: firstsAsked = hasPeriodStart({ period, start: period === CUSTOM ? customStart : startDate });
	$: firstComposers = data.firstComposers;
	$: firstWorks = data.firstWorks;
	$: firstComposerLinks = firstComposers
		? firstComposers.items.map((item) =>
				tableViewHref(
					composerHref(item.id, {
						period,
						start: customStart,
						end: customEnd,
						userId: scope === 'individual' ? userId : null,
						includeMentees
					}),
					allTables
				)
			)
		: [];
	$: firstWorkLinks = firstWorks
		? firstWorks.items.map((item) =>
				historyHref({ ...historyFilter, targets: [{ param: 'music_id', id: String(item.id) }] })
			)
		: [];
	// 시계열 카드의 주·월·학기마다: 같은 지기의 그 기간 선곡 기록(표의 기간, 차트의 막대·점).
	$: timelineLinks = bucketHistoryLinks(historyFilter, timeline, semesters);
	$: diversityLinks = bucketHistoryLinks(
		historyFilter,
		diversity && { filters: diversity.filters, labels: diversity.timeline.labels }
	);
	function openBucket(links, e) {
		const href = links[e.detail.dataIndex];
		if (href) goto(href);
	}
</script>

<svelte:head>
	<title>{tabTitle}</title>
</svelte:head>

<div class="stat-page">
	<!-- 화면 낭독기에만: 카드를 다 불러왔는지, 어느 카드가 실패했는지(불러오는 동안은 비어 있다) -->
	<p class="sr-only" role="status">{loadStatus}</p>
	<header class="page-header">
		<div class="title-group">
			<h1>통계</h1>
			<span class="period">{periodText}</span>
			{#if ongoing}<span class="period">{ongoing}</span>{/if}
			{#if upcoming}<span class="period">{upcoming}</span>{/if}
			<a class="history-link" href={historyLink}>선곡 기록</a>
			<a class="history-link" href="/stat/composers">작곡가 정리</a>
			<!-- 기간이 학기면 그 학기의, 아니면 가장 최근 학기의 결산 -->
			<a class="history-link" href={reportHref(period)}>학기 결산</a>
		</div>
		<div class="controls">
			<PeriodSelect
				bind:period
				bind:start={customStart}
				bind:end={customEnd}
				bind:semesters
				{shownRange}
				on:change={onPeriodChange}
			/>
			<ScopeToggle bind:scope on:change={onScopeChange} />
			{#if scope === 'individual'}
				<MemberSelect bind:userId bind:includeMentees bind:userName on:change={onMemberChange} />
			{/if}
		</div>
	</header>

	{#if scope === 'individual' && !userId}
		<div class="empty-hint">지기를 선택하면 개인 통계를 볼 수 있습니다.</div>
	{:else}
		<!-- KPI 카드 -->
		<div class="kpi-row" bind:this={summaryRow} tabindex="-1">
			<!-- 선곡을 세는 두 칸의 숫자는 그 선곡의 선곡 기록을 연다(0 이면 열 목록이 없어 글자 그대로) -->
			<div class="kpi">
				<div class="kpi-value">
					{#if summary?.total_plays > 0}
						<a
							class="kpi-link"
							href={historyLink}
							title="선곡 기록에서 보기"
							aria-label="총 선곡 {summary.total_plays.toLocaleString()} 곡 선곡 기록에서 보기"
							>{summary.total_plays.toLocaleString()}</a
						>
					{:else}
						{summary ? summary.total_plays.toLocaleString() : '—'}
					{/if}
				</div>
				<div class="kpi-label">총 선곡</div>
				<!-- 학기를 고르면 앞 학기와 견준 줄. 좁은 칸에서는 · 뒤에서만 줄을 바꾼다 -->
				{#if changes.total_plays}
					<div class="kpi-change">
						<span>{changes.total_plays.diff} ·</span>
						<span>{changes.total_plays.before}</span>
					</div>
				{/if}
			</div>
			<!-- sessions·requested 가 없는 예전 백엔드에서는 '—' -->
			<div class="kpi">
				<div class="kpi-value">
					{summary && summary.sessions != null ? summary.sessions.toLocaleString() : '—'}
				</div>
				<div class="kpi-label">타임</div>
				{#if changes.sessions}
					<div class="kpi-change">
						<span>{changes.sessions.diff} ·</span>
						<span>{changes.sessions.before}</span>
					</div>
				{/if}
			</div>
			<div class="kpi">
				<div class="kpi-value">
					{#if summary?.requested > 0}
						<a
							class="kpi-link"
							href={requestedLink}
							title="선곡 기록에서 보기"
							aria-label="신청곡 {summary.requested.toLocaleString()} 곡 선곡 기록에서 보기"
							>{summary.requested.toLocaleString()}</a
						>
					{:else}
						{summary && summary.requested != null ? summary.requested.toLocaleString() : '—'}
					{/if}
				</div>
				<div class="kpi-label">신청곡</div>
				{#if changes.requested}
					<div class="kpi-change">
						<span>{changes.requested.diff} ·</span>
						<span>{changes.requested.before}</span>
					</div>
				{/if}
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.composers.toLocaleString() : '—'}</div>
				<div class="kpi-label">작곡가</div>
				{#if changes.composers}
					<div class="kpi-change">
						<span>{changes.composers.diff} ·</span>
						<span>{changes.composers.before}</span>
					</div>
				{/if}
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.works.toLocaleString() : '—'}</div>
				<div class="kpi-label">곡</div>
				{#if changes.works}
					<div class="kpi-change">
						<span>{changes.works.diff} ·</span>
						<span>{changes.works.before}</span>
					</div>
				{/if}
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.conductors.toLocaleString() : '—'}</div>
				<div class="kpi-label">지휘자</div>
				{#if changes.conductors}
					<div class="kpi-change">
						<span>{changes.conductors.diff} ·</span>
						<span>{changes.conductors.before}</span>
					</div>
				{/if}
			</div>
			<div class="kpi">
				<div class="kpi-value">{summary ? summary.orchestras.toLocaleString() : '—'}</div>
				<div class="kpi-label">오케스트라</div>
				{#if changes.orchestras}
					<div class="kpi-change">
						<span>{changes.orchestras.diff} ·</span>
						<span>{changes.orchestras.before}</span>
					</div>
				{/if}
			</div>
			<div class="kpi span2">
				<div class="kpi-value small">
					<!-- 좁은 칸에서는 '~' 뒤에서만 줄을 바꾼다 -->
					{#if summary && summary.date_start}
						<span class="date">{summary.date_start}</span> ~
						<span class="date">{summary.date_end}</span>
					{:else}
						—
					{/if}
				</div>
				<div class="kpi-label">기간</div>
			</div>
		</div>
		{#if errors.summary}
			<p class="kpi-error">
				요약을 불러오지 못했습니다.
				<button
					class="tool-btn"
					on:click={() => retryRow('summary', summaryRow)}
					aria-label="요약 다시 시도"
				>
					다시 시도
				</button>
			</p>
		{/if}
		<!-- 요약이 실패했으면 그 '다시 시도'가 앞 학기도 다시 부르므로 줄은 하나만 둔다 -->
		{#if previousFailed.length && !errors.summary}
			<p class="kpi-error">
				지난 학기({semesterLabel(previousTarget)})와 견준 수치를 불러오지 못했습니다.
				<button class="tool-btn" on:click={retryPrevious} aria-label="지난 학기 수치 다시 시도">
					다시 시도
				</button>
			</p>
		{/if}
		<!-- 진행 중인 학기는 앞 학기도 같은 시점까지만 세므로(previousSpan) 그 날짜를 적는다. 날짜를 못 셌으면
		     앞 학기 전체와 견주므로 그렇다고 적는다(학기 결산과 같은 말).
		     이번 학기는 늘 오늘까지라 진행 중이다(머리말의 '진행 중' 칸은 학기를 고를 때만 보인다). -->
		{#if (ongoing || period === CURRENT) && previousTarget}
			<p class="kpi-note">
				{#if previousSpan}
					진행 중인 학기입니다. 지난 학기({semesterLabel(previousTarget)})는 같은 시점까지({periodRangeText(
						previousSpan
					)}) 셌습니다.
				{:else}
					진행 중인 학기입니다. 지난 학기({semesterLabel(previousTarget)}) 수치는 학기 전체입니다.
				{/if}
			</p>
		{/if}

		<!-- 키보드·화면 낭독기로 모든 차트를 한 번에 표로 읽는다(카드마다 '표로 보기'를 누르지 않고) -->
		<div class="view-row">
			<button
				class="tool-btn"
				class:active={allTables}
				aria-pressed={allTables}
				on:click={() => {
					allTables = !allTables;
					syncUrl();
				}}
				title="모든 차트의 수치를 표로 보기"
			>
				모든 차트 표로 보기
			</button>
		</div>

		<!-- 차트 그리드 -->
		<div class="chart-grid">
			<ChartCard
				showTable={allTables}
				title="많이 튼 작곡가"
				note={rankCapNote(composers, WORKS_LIMIT)}
				option={composerOpt}
				data={composers}
				loading={loading.composers}
				error={errors.composers}
				retry={() => retry('composers')}
				{fileTag}
				rowLabel="곡 보기"
				on:itemclick={(e) => openBar('composers', e)}
				on:rowselect={(e) => openDrill('composers', e.detail)}
				table={composerTable}
				csv={composerTable && tableCsv(composerTable)}
				csvHeaders={['작곡가', '횟수']}
			/>
			<ChartCard
				showTable={allTables}
				title="많이 튼 독주자"
				note={rankCapNote(soloists, WORKS_LIMIT)}
				option={soloistOpt}
				data={soloists}
				loading={loading.soloists}
				error={errors.soloists}
				retry={() => retry('soloists')}
				{fileTag}
				rowLabel="곡 보기"
				on:itemclick={(e) => openBar('soloists', e)}
				on:rowselect={(e) => openDrill('soloists', e.detail)}
				table={soloistTable}
				csv={soloistTable && tableCsv(soloistTable)}
				csvHeaders={['연주자', '횟수']}
			/>
			<ChartCard
				showTable={allTables}
				title="많이 튼 지휘자"
				note={rankCapNote(conductors, WORKS_LIMIT)}
				option={conductorOpt}
				data={conductors}
				loading={loading.conductors}
				error={errors.conductors}
				retry={() => retry('conductors')}
				{fileTag}
				rowLabel="곡 보기"
				on:itemclick={(e) => openBar('conductors', e)}
				on:rowselect={(e) => openDrill('conductors', e.detail)}
				table={conductorTable}
				csv={conductorTable && tableCsv(conductorTable)}
				csvHeaders={['지휘자', '횟수']}
			/>
			<ChartCard
				showTable={allTables}
				title="많이 튼 오케스트라"
				note={rankCapNote(orchestras, WORKS_LIMIT)}
				option={orchestraOpt}
				data={orchestras}
				loading={loading.orchestras}
				error={errors.orchestras}
				retry={() => retry('orchestras')}
				{fileTag}
				rowLabel="곡 보기"
				on:itemclick={(e) => openBar('orchestras', e)}
				on:rowselect={(e) => openDrill('orchestras', e.detail)}
				table={orchestraTable}
				csv={orchestraTable && tableCsv(orchestraTable)}
				csvHeaders={['오케스트라', '횟수']}
			/>
			<ChartCard
				showTable={allTables}
				title="시대별 분포"
				option={eraOpt}
				data={eras}
				loading={loading.eras}
				error={errors.eras}
				retry={() => retry('eras')}
				{fileTag}
				note={eraNote}
				noteLink={{ href: '/stat/composers', text: '작곡가 정리' }}
				table={eraTable}
				csv={eraTable && tableCsv(eraTable)}
				csvHeaders={['시대', '횟수']}
			/>
			<ChartCard
				showTable={allTables}
				title="장르별 분포"
				option={genreOpt}
				data={genres}
				loading={loading.genres}
				error={errors.genres}
				retry={() => retry('genres')}
				{fileTag}
				table={genreTable}
				csv={genreTable && tableCsv(genreTable)}
				csvHeaders={['장르', '횟수']}
			/>
			<ChartCard
				showTable={allTables}
				title={timelineTitle}
				option={timelineOpt}
				data={timelineData}
				loading={loading.timeline}
				error={errors.timeline}
				retry={() => retry('timeline')}
				{fileTag}
				links={timelineLinks}
				on:itemclick={(e) => openBucket(timelineLinks, e)}
				csvHeaders={['기간', '횟수']}
			/>
			<ChartCard
				showTable={allTables}
				title="많이 튼 곡"
				note={rankCapNote(works, WORKS_LIMIT)}
				option={worksOpt}
				data={works}
				loading={loading.works}
				error={errors.works}
				retry={() => retry('works')}
				{fileTag}
				links={worksLinks}
				on:itemclick={openWork}
				table={worksTable}
				csv={worksTable && tableCsv(worksTable)}
				csvHeaders={['곡', '횟수']}
			/>
		</div>
		{#if drill}
			{#key drill}
				<DrillPanel
					target={drill}
					works={drillWorks}
					previous={previousDrillWorks}
					loading={drillLoading}
					error={drillError}
					retry={loadDrill}
					previousError={previousDrillFailed ? semesterLabel(previousOf(period, semesters)) : ''}
					retryPrevious={loadPreviousDrill}
					scopeLabel={viewLabel}
					{fileTag}
					historyLink={drillHistoryLink}
					workLink={drillWorkLink}
					composerLink={drill.card === 'composers'
						? tableViewHref(
								composerHref(drill.id, {
									period,
									start: customStart,
									end: customEnd,
									userId: scope === 'individual' ? userId : null,
									includeMentees
								}),
								allTables
							)
						: ''}
					on:close={closeDrill}
				/>
			{/key}
		{:else}
			<p class="drill-hint">
				작곡가·독주자·지휘자·오케스트라의 막대나 이름을 누르면 그 곡들을 봅니다.
			</p>
		{/if}

		<!-- 다양성 섹션 -->
		<div class="section-head">
			<h2>선곡 다양성</h2>
			<div class="bucket-toggle" role="group" aria-label="다양성 집계 단위">
				<button
					class:active={diversityBucket === 'week'}
					aria-pressed={diversityBucket === 'week'}
					on:click={() => setDiversityBucket('week')}
				>
					주별
				</button>
				<button
					class:active={diversityBucket === 'month'}
					aria-pressed={diversityBucket === 'month'}
					on:click={() => setDiversityBucket('month')}
				>
					월별
				</button>
			</div>
		</div>

		<!-- 고유 곡 수는 위의 곡 칸과 같아(같은 선곡의 서로 다른 곡 수) 두지 않는다(학기 결산과 같다) -->
		<div class="kpi-row diversity-kpi" bind:this={tilesRow} tabindex="-1">
			<div class="kpi">
				<div class="kpi-value">{tiles ? pct(groupEvenness(tiles.era)) : '—'}</div>
				<div class="kpi-label">시대 다양성</div>
				{#if tileChanges.era}
					<div class="kpi-change">
						<span>{tileChanges.era.diff} ·</span>
						<span>{tileChanges.era.before}</span>
					</div>
				{/if}
			</div>
			<div class="kpi">
				<div class="kpi-value">{tiles ? pct(groupEvenness(tiles.genre)) : '—'}</div>
				<div class="kpi-label">장르 다양성</div>
				{#if tileChanges.genre}
					<div class="kpi-change">
						<span>{tileChanges.genre.diff} ·</span>
						<span>{tileChanges.genre.before}</span>
					</div>
				{/if}
			</div>
		</div>
		<!-- 칸의 '—'는 잴 것이 없을 때도 쓰므로, 불러오지 못했으면 따로 알린다 -->
		{#if errors.diversityTiles}
			<p class="kpi-error">
				선곡 다양성을 불러오지 못했습니다.
				<button
					class="tool-btn"
					on:click={() => retryRow('diversityTiles', tilesRow)}
					aria-label="선곡 다양성 다시 시도"
				>
					다시 시도
				</button>
			</p>
		{/if}
		<!-- 칸의 %가 무엇인지(학기 결산의 선곡 다양성 카드와 같은 말) -->
		<p class="kpi-note">0%=편중 · 100%=고름 (가능한 모든 시대·장르를 고르게 틀수록 100%)</p>

		<div class="chart-grid">
			<ChartCard
				showTable={allTables}
				title={`${bucketLabel} 선곡 수`}
				option={countOpt}
				data={countData}
				loading={loading.diversity}
				error={errors.diversity}
				retry={() => retry('diversity')}
				{fileTag}
				links={diversityLinks}
				on:itemclick={(e) => openBucket(diversityLinks, e)}
				csvHeaders={['기간', '선곡수']}
			/>
			<ChartCard
				showTable={allTables}
				title={`${bucketLabel} 다양성 추이`}
				option={diversityOpt}
				data={diversityCsvData}
				table={diversityTable}
				loading={loading.diversity}
				error={errors.diversity}
				retry={() => retry('diversity')}
				{fileTag}
				links={diversityLinks}
				on:itemclick={(e) => openBucket(diversityLinks, e)}
				csv={diversityTable && tableCsv(diversityTable)}
			/>
		</div>

		<!-- 처음 튼 작곡가·곡: 클럽 전체에서 처음 튼 날이 이 기간에 드는 것(stats/firsts) -->
		<div class="section-head">
			<h2>처음 튼 작곡가·곡</h2>
		</div>
		<div class="chart-grid">
			<!-- 기간의 시작이 없으면(전체 기간, 시작을 비운 직접 지정) 모든 것이 '처음'이므로 묻지 않는다 -->
			<TableCard
				title="처음 튼 작곡가"
				subtitle={firstsSubtitle(viewLabel, firstComposers, '작곡가', '명', previousFirstComposers)}
				table={firstComposers?.items.length ? firstsTable(firstComposers, '작곡가') : null}
				links={firstComposerLinks}
				loading={loading.firstComposers}
				error={errors.firstComposers}
				retry={() => retry('firstComposers')}
				{fileTag}
				emptyText={!firstsAsked
					? '기간의 시작을 정하면 그 뒤에 처음 튼 작곡가를 봅니다'
					: firstComposers?.items.length === 0
						? firstsEmptyText('처음 튼 작곡가', '명', previousFirstComposers)
						: ''}
			/>
			<TableCard
				title="처음 튼 곡"
				subtitle={firstsSubtitle(viewLabel, firstWorks, '곡', '곡', previousFirstWorks)}
				table={firstWorks?.items.length ? firstsTable(firstWorks, '곡') : null}
				links={firstWorkLinks}
				loading={loading.firstWorks}
				error={errors.firstWorks}
				retry={() => retry('firstWorks')}
				{fileTag}
				emptyText={!firstsAsked
					? '기간의 시작을 정하면 그 뒤에 처음 튼 곡을 봅니다'
					: firstWorks?.items.length === 0
						? firstsEmptyText('처음 튼 곡', '곡', previousFirstWorks)
						: ''}
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
	/* 화면 낭독기만 읽는 줄(작곡가 정리와 같다) */
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	/* 직접 지정을 열어 한 줄에 다 들어가지 않으면 컨트롤을 다음 줄 오른쪽에 둔다. */
	.page-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 16px;
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
	.history-link {
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		text-underline-offset: 3px;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		align-items: center;
		gap: 12px 16px;
		margin-left: auto;
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
		grid-template-columns: repeat(9, 1fr);
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
	/* 머리말의 '선곡 기록' 링크처럼 밑줄은 가리키거나 키보드로 고를 때만 */
	.kpi-link {
		color: inherit;
		text-decoration: none;
		text-underline-offset: 3px;
	}
	.kpi-link:hover,
	.kpi-link:focus-visible {
		text-decoration: underline;
	}
	.kpi-value .date {
		white-space: nowrap;
	}
	.kpi-label {
		margin-top: 4px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	.kpi-change {
		margin-top: 2px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: 12px;
		color: var(--gray-gray-600, #7c7c7c);
	}
	.kpi-change span {
		white-space: nowrap;
	}
	.kpi-error,
	.kpi-note {
		margin: -8px 0 16px;
		text-align: center;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--secondary-secondary-800, #95560d);
	}
	.kpi-note {
		color: var(--gray-gray-600, #7c7c7c);
	}
	/* 카드(ChartCard)의 단추와 같은 모양 */
	.tool-btn {
		margin-left: 8px;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--primary-primary-800, #6a5134);
		background: var(--secondary-secondary-100, #fef9f3);
		border: 1px solid var(--primary-primary-600, #c8ad8f);
		border-radius: 4px;
		padding: 3px 8px;
		cursor: pointer;
	}
	.tool-btn:hover {
		background: var(--secondary-secondary-200, #fdf1e4);
	}
	/* 카드의 '표로 보기'가 눌린 모양과 같다 */
	.tool-btn.active {
		background: var(--action-bg);
		color: var(--action-fg);
	}
	.view-row {
		display: flex;
		justify-content: flex-end;
		margin: -8px 0 8px;
	}
	.drill-hint {
		margin: 8px 0 0;
		text-align: center;
		font-family: var(--small-medium-font-family, 'Noto Sans KR', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		color: var(--gray-gray-600, #7c7c7c);
	}
	.chart-grid {
		display: grid;
		/* 캔버스 폭이 칸의 최소 폭이 되지 않게: 창을 줄이면 카드도 줄어든다 */
		grid-template-columns: repeat(2, minmax(0, 1fr));
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
		background: var(--action-bg);
		color: var(--action-fg);
	}
	.diversity-kpi {
		grid-template-columns: repeat(2, 1fr);
	}

	@page {
		size: A4;
		margin: 12mm;
	}
	@media print {
		/* 학기 결산과 같다: 사이드바·레이아웃의 규칙은 컴포넌트 범위라 !important 로 이겨 A4 폭에 제 크기로 싣는다 */
		:global(.side-bar) {
			display: none !important;
		}
		:global(html),
		:global(body),
		:global(.screen),
		:global(.app) {
			min-width: 0 !important;
		}
		/* 오른쪽 1px: 카드의 오른쪽 테두리가 종이 끝에 잘리지 않게 */
		.stat-page {
			padding: 0 1px 0 0;
		}
		/* 종이에는 고르는 것·누르는 것을 싣지 않는다: 기간·범위·지기 고르기, 머리말 링크, 모든 차트 표로 보기,
		   주별/월별, 막대를 누르라는 안내, 카드·패널의 단추(표로 보기, PNG·CSV 저장, 닫기, 다시 시도)와 패널의 링크.
		   표의 이름 단추(.row-btn)는 이름이므로 남는다 */
		.controls,
		.view-row,
		.bucket-toggle,
		.drill-hint,
		.stat-page :global(.tool-btn),
		.stat-page :global(.history-link) {
			display: none !important;
		}
		/* 학기 결산과 같은 작은 칸: A4 폭의 아홉 칸에서 '오케스트라'가 글자 사이에서 줄을 바꾸지 않게 */
		.kpi-row {
			gap: 6px;
		}
		.kpi {
			padding: 10px 4px;
		}
		.kpi-value {
			font-size: 20px;
		}
		.kpi-label {
			font-size: 12px;
			word-break: keep-all;
		}
		/* 카드는 한 줄에 하나, 쪽 사이에서 자르지 않는다(표가 든 카드는 길면 다음 쪽으로 이어진다) */
		.chart-grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.stat-page :global(.card),
		.stat-page :global(.drill-panel) {
			box-shadow: none !important;
		}
		.stat-page :global(.card) {
			break-inside: avoid;
		}
		.stat-page :global(.card:has(.table-view)) {
			break-inside: auto;
		}
		/* 표로 보기는 340px 상자 안에서 스크롤하지 않고 모든 행을 싣는다. 쪽을 넘는 표가 카드 밖으로 넘치지 않도록
		   카드와 표 상자는 flex 를 풀고, 머리줄은 붙이지 않는다(새 쪽마다 브라우저가 머리줄을 다시 싣는다) */
		.stat-page :global(.card:has(.table-view)),
		.stat-page :global(.table-view) {
			display: block !important;
			height: auto !important;
		}
		.stat-page :global(.chart-area:has(.table-view)),
		.stat-page :global(.table-area:has(.table-view)) {
			min-height: 0 !important;
		}
		.stat-page :global(.table-scroll) {
			overflow: visible !important;
		}
		.stat-page :global(.table-scroll thead th) {
			position: static !important;
		}
		/* 펼친 곡 목록의 제목은 위의 단추 줄만큼 비워 두지만, 종이에는 단추가 없으므로 비우지 않는다 */
		.stat-page :global(.drill-panel .table-title),
		.stat-page :global(.drill-panel .panel-title) {
			padding: 0 !important;
		}
		/* 인쇄는 차트를 다시 그리지 않으므로, 넓은 창에서 그린 캔버스가 카드보다 넓으면 비율을 지켜 줄인다 */
		.stat-page :global(.echart > div),
		.stat-page :global(.echart canvas) {
			max-width: 100% !important;
		}
		.stat-page :global(.echart canvas) {
			height: auto !important;
		}
	}
</style>
