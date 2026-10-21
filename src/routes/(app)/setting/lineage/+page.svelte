<script>
	import { afterUpdate, onDestroy, onMount, tick } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import {
		buildLineage,
		layoutChart,
		lineageOf,
		descendantCount,
		semesterOf,
		sabuChoices
	} from '$lib/lineage.js';

	const NODE = { nodeWidth: 120, nodeHeight: 64, gapX: 14, gapY: 32, padding: 16 };
	const ROW_HEIGHT = NODE.nodeHeight + NODE.gapY;
	const LABEL_WIDTH = 76;
	const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25];
	const PANEL_ROOM = 344; // the panel's width and margin: room to scroll a card out from under it

	let status = 'loading'; // loading | ready | failed
	let lineage = { families: [], loners: [], byId: new Map(), cut: [] };
	let chart = { width: 0, height: 0, rows: [], boxes: [], links: [], detached: [] };
	let memberCount = 0;
	let order = new Map(); // id -> place on the page, for the search results
	let selected = null;
	let query = '';
	let zoom = 1;
	let panel;
	let chartBox;
	let searchBox;

	// 수정 in the panel: the member's fields as 지기 관리's 확인 sends them (PUT, every field)
	let editing = false;
	let saving = false;
	let form = null; // strings as the boxes hold them, is_ob a boolean
	let initial = ''; // form when 수정 opened, to tell whether anything changed
	let choices = []; // who can be the 사부, fixed while 수정 is open
	let oddSemester = ''; // a 입부 학기 other than 1 and 2, kept as a choice so it is not lost
	let sabuNote = '';
	let formError = null; // { field, message }
	let panelNote = ''; // 저장했습니다 after a save
	let editButton;
	let opening = -1; // the selection (count) whose 수정 waits for the list to reload
	let recordedFields = ''; // the member as saved when 수정 opened, to notice a change elsewhere
	let selection = 0; // counts selection changes, so a reload that returns late can tell
	let pendingUrl = null; // a link followed during a save, gone to once the save went through
	let destroyed = false;
	let chartBoxWidth = 0;

	onDestroy(() => (destroyed = true));

	let users = [];

	function show(list) {
		users = list;
		lineage = buildLineage(list);
		chart = layoutChart(lineage, NODE);
		memberCount = list.length;
		order = new Map(chart.boxes.map((box, index) => [box.node.user.id, index]));
		selected = (selected && lineage.byId.get(selected.user.id)) ?? null;
	}

	// quiet: after a save the chart stays on screen while the list reloads, and a failure keeps it
	async function load({ quiet = false } = {}) {
		if (!quiet) status = 'loading';
		try {
			const response = await fetch('/api/user');
			if (!response.ok) {
				throw new Error(`Failed to fetch users: ${response.status}`);
			}
			show(await response.json());
			status = 'ready';
			return true;
		} catch (error) {
			console.error('Failed to fetch users', error);
			if (!quiet) status = 'failed';
			return false;
		}
	}

	onMount(load);

	$: highlighted = selected ? lineageOf(selected) : null;
	$: below = selected ? descendantCount(selected) : 0;
	$: longest = lineage.families.reduce((most, family) => Math.max(most, family.generations), 0);
	$: cutOf = new Map(lineage.cut.map((c) => [c.node, c]));
	$: detached = new Set(chart.detached);
	// 제자 drawn without the line to their 사부: their 입부 is not after the 사부's, or they have no
	// 입부 년도 (those are in the 입부 미상 row)
	$: early = chart.detached.filter((node) => semesterOf(node.user).year !== null);
	$: unknownRow = chart.rows.find((row) => row.year === null);
	$: needle = query.trim();
	$: matches = needle
		? [...lineage.byId.values()]
				.filter((node) => String(node.user.name ?? '').includes(needle))
				.sort((a, b) => order.get(a.user.id) - order.get(b.user.id))
		: [];
	// The selected member's place among the matches, -1 when it is not one (after a save, say)
	$: matchAt = matches.indexOf(selected);

	function joinLabel(user, short = false) {
		if (!Number.isFinite(user.join_year)) return '';
		const semester = Number.isFinite(user.join_semester) ? user.join_semester : null;
		if (short) {
			return `${String(user.join_year).slice(-2)}${semester ? `-${semester}` : ''} 입부`;
		}
		return `${user.join_year}년${semester ? ` ${semester}학기` : ''} 입부`;
	}

	// 21-1; 21-? without a 학기; 미상 without a 년도
	function shortJoin(user) {
		if (!Number.isFinite(user.join_year)) return '미상';
		const semester = Number.isFinite(user.join_semester) ? user.join_semester : '?';
		return `${String(user.join_year).slice(-2)}-${semester}`;
	}

	function rowLabel(row) {
		if (row.year === null) return ['입부', '미상'];
		return [String(row.year), row.semester === null ? '학기 미상' : `${row.semester}학기`];
	}

	function describe(node) {
		const user = node.user;
		const parts = [
			user.name,
			user.is_ob ? 'OB' : '현역',
			[user.major, user.year_id ? `${user.year_id}학번` : ''].filter(Boolean).join(' '),
			joinLabel(user),
			node.parent ? `사부 ${node.parent.user.name}` : '',
			node.children.length ? `제자 ${node.children.length}명` : ''
		];
		return parts.filter(Boolean).join(', ');
	}

	async function select(node, { focus = false } = {}) {
		if (node !== selected) {
			if (!leaveEdit()) return;
			panelNote = '';
			selection += 1;
		}
		selected = node;
		await tick();
		const card = document.getElementById(`jigi-${node.user.id}`);
		if (!card) return;
		if (focus) card.focus({ preventScroll: true });
		card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
	}

	function toggle(node) {
		if (selected === node) {
			closeDetail();
		} else {
			select(node);
		}
	}

	// On a card: ↓ 사부, ↑ first 제자 (사부 sit below their 제자), ← → the 사부's other 제자. An arrow
	// with Alt, ⌘ or Ctrl (Back, Forward) or one with no member that way keeps its browser action.
	function moveFrom(event, node) {
		// Option+Tab is Safari's Tab for buttons
		if (event.key === 'Tab') {
			if (!event.metaKey && !event.ctrlKey) tabAround(event, node);
			return;
		}
		if (event.altKey || event.metaKey || event.ctrlKey) return;
		let next = null;
		const siblings = node.parent ? node.parent.children : [];
		const at = siblings.indexOf(node);
		if (event.key === 'ArrowDown') next = node.parent;
		else if (event.key === 'ArrowUp') next = node.children[0];
		else if (event.key === 'ArrowLeft' && at > 0) next = siblings[at - 1];
		else if (event.key === 'ArrowRight' && at >= 0) next = siblings[at + 1];
		else return;
		if (!next) return;
		event.preventDefault();
		select(next, { focus: true });
	}

	// For Tab the panel sits right after the selected card, although it comes after every card on
	// the page. Its controls are out of the page's Tab order, and Tab moves through them here: in
	// from the selected card, on to the next card, and back the same way with Shift+Tab. After the
	// last card the panel is where the page has it, and its controls keep their place.
	const cardOf = (node) => node && document.getElementById(`jigi-${node.user.id}`);
	const nodeAfter = (node) => chart.boxes[order.get(node.user.id) + 1]?.node ?? null;

	function panelControls() {
		const all = panel ? [...panel.querySelectorAll('button, input, select')] : [];
		return all.filter((control) => !control.disabled);
	}

	afterUpdate(() => {
		const place = selected && nodeAfter(selected) ? -1 : 0;
		for (const control of panel?.querySelectorAll('button, input, select') ?? []) {
			control.tabIndex = place;
		}
	});

	function tabAround(event, node) {
		if (!selected) return;
		const controls = panelControls();
		let to = null;
		if (!event.shiftKey && node === selected) to = controls[0];
		else if (event.shiftKey && node === nodeAfter(selected)) to = controls[controls.length - 1];
		if (!to) return;
		event.preventDefault();
		to.focus();
	}

	// The panel itself (focused by a click on its text) counts as the place before its first control
	function panelKey(event) {
		if (event.key !== 'Tab' || event.metaKey || event.ctrlKey) return;
		const controls = panelControls();
		const at = event.target === panel ? -1 : controls.indexOf(event.target);
		if (at < 0 && event.target !== panel) return;
		let to;
		if (event.shiftKey) to = at > 0 ? controls[at - 1] : cardOf(selected);
		else if (at < 0) to = controls[0];
		else to = at < controls.length - 1 ? controls[at + 1] : cardOf(nodeAfter(selected));
		if (!to) return; // after the last card: on out of the page
		event.preventDefault();
		to.focus();
	}

	async function search() {
		await tick(); // matches follows the new query only after the update
		// Typing does not ask, at every letter, to drop a changed 수정: Enter moves to the match
		if (matches.length && !changed()) select(matches[0]);
	}

	function searchKey(event) {
		// Hangul input: the Enter that ends the last syllable's composition is not a search step
		if (event.isComposing || event.keyCode === 229) return;
		if (event.key === 'Enter' && matches.length) {
			event.preventDefault();
			// From the selected match; when the selection is not a match, the first (or the last)
			const n = matches.length;
			const next =
				matchAt < 0 ? (event.shiftKey ? n - 1 : 0) : (matchAt + (event.shiftKey ? -1 : 1) + n) % n;
			if (matches[next] !== selected && !leaveEdit()) return;
			select(matches[next]);
		} else if (event.key === 'Escape') {
			// The first Escape clears the box, the next one closes the panel (windowKey skips inputs)
			if (query) query = '';
			else if (selected) closeDetail();
		}
	}

	// Focus inside the panel goes back to the member's card, not to the top of the page
	function closeDetail() {
		if (!leaveEdit()) return;
		if (panel?.contains(document.activeElement)) {
			cardOf(selected)?.focus({ preventScroll: true });
		}
		selected = null;
		panelNote = '';
		selection += 1;
	}

	function windowKey(event) {
		if (event.key === 'Escape' && selected && event.target?.tagName !== 'INPUT') {
			closeDetail();
		}
	}

	// Room on the right of the canvas to scroll a card out from under the panel. Kept, panel or
	// not, whenever the room would make the chart scroll, so closing the panel does not jump.
	$: room =
		selected || LABEL_WIDTH + chart.width * zoom + PANEL_ROOM > chartBoxWidth ? PANEL_ROOM : 0;

	// The panel is fixed at the bottom right, and the form makes it taller: scroll the chart so
	// the card being edited is not under it
	function keepClear() {
		const card = cardOf(selected);
		if (!card || !panel || !chartBox) return;
		const c = card.getBoundingClientRect();
		const p = panel.getBoundingClientRect();
		if (c.right > p.left && c.left < p.right && c.bottom > p.top && c.top < p.bottom) {
			chartBox.scrollBy({ left: c.right - p.left + 16, behavior: 'smooth' });
		}
	}

	// A function, not a $: value: SvelteKit's goto runs beforeNavigate before Svelte has flushed
	const changed = () => editing && JSON.stringify(form) !== initial;

	// Another member, closing the panel or leaving the page drops a 수정 in progress: ask first
	// when something was changed. Not while the save is on its way.
	function leaveEdit() {
		if (!editing) return true;
		if (saving) return false;
		if (changed() && !confirm('수정한 내용을 저장하지 않고 닫을까요?')) return false;
		editing = false;
		return true;
	}

	beforeNavigate((navigation) => {
		if (saving) {
			// Not before the save has ended: the page shows how it went, then follows the link.
			// Leaving the site or reloading: the browser asks, as confirm cannot run then.
			navigation.cancel();
			if (navigation.to && !['leave', 'popstate'].includes(navigation.type)) {
				pendingUrl = navigation.to.url;
			}
			return;
		}
		if (!changed()) return;
		if (navigation.type === 'leave') navigation.cancel();
		else if (!confirm('수정한 내용을 저장하지 않고 나갈까요?')) navigation.cancel();
	});

	const hasValue = (value) => value !== null && value !== undefined && value !== '';
	// Reactive, so the fields' aria-describedby follows formError
	$: errorFor = (field) => (formError?.field === field ? 'edit-error' : undefined);

	// The member's fields as the boxes hold them, 사부 as recorded
	function fieldsOf(user) {
		const semester = user.join_semester;
		return {
			name: user.name ?? '',
			is_ob: Boolean(user.is_ob),
			major: user.major ?? '',
			year_id: user.year_id ?? '',
			join_year: Number.isFinite(user.join_year) ? String(user.join_year) : '',
			join_semester: Number.isFinite(semester) ? String(semester) : '',
			sabu_id: hasValue(user.sabu_id) ? String(user.sabu_id) : ''
		};
	}

	const isChoice = (id) => choices.some((node) => String(node.user.id) === id);

	// After a reload: the member may have been deleted elsewhere (지기 관리 in another tab)
	function stillListed(id) {
		if (selected?.user.id === id) return true;
		editing = false;
		stopSave();
		alert('이 지기가 목록에 없습니다. 다른 곳에서 삭제된 것 같습니다.');
		searchBox?.focus();
		return false;
	}

	async function startEdit() {
		const id = selected.user.id;
		if (editing || opening === selection) return;
		const at = selection;
		opening = at;
		// The list on screen can be old: the boxes and the 사부 choices start from the current one
		await load({ quiet: true });
		if (opening === at) opening = -1;
		// Another member chosen, the panel closed or the page left meanwhile: nothing to open
		if (destroyed || selection !== at || !stillListed(id)) return;
		const user = selected.user;
		choices = sabuChoices(lineage, selected);
		recordedFields = JSON.stringify(fieldsOf(user));
		const fields = fieldsOf(user);
		const keep = fields.sabu_id !== '' && isChoice(fields.sabu_id);
		// A 사부 record the chart could not draw (self, missing, loop) is not a choice: saving clears it
		sabuNote =
			fields.sabu_id && !keep
				? `사부 기록 오류(${cutOf.has(selected) ? cutReason(cutOf.get(selected)) : '고를 수 없는 지기'}): 다른 사부를 고르지 않으면 ‘사부 없음’으로 저장됩니다.`
				: '';
		const semester = user.join_semester;
		oddSemester =
			Number.isFinite(semester) && semester !== 1 && semester !== 2 ? String(semester) : '';
		form = { ...fields, sabu_id: keep ? fields.sabu_id : '' };
		initial = JSON.stringify(form);
		formError = null;
		panelNote = '';
		editing = true;
		await tick();
		document.getElementById('edit-name')?.focus();
		keepClear();
	}

	// 취소 drops the changes; Escape asks first when something was changed
	async function cancelEdit({ ask = false } = {}) {
		if (saving) return;
		if (ask && changed() && !confirm('수정한 내용을 버릴까요?')) return;
		editing = false;
		await tick();
		editButton?.focus();
	}

	function formKey(event) {
		// Hangul input: the Enter that ends the last syllable's composition does not save, and an
		// Escape then belongs to the input method
		if (event.isComposing || event.keyCode === 229) {
			if (event.key === 'Enter') event.preventDefault();
			return;
		}
		if (event.key === 'Escape') {
			event.stopPropagation(); // windowKey would close the panel
			cancelEdit({ ask: true });
		}
	}

	// Characters as the backend counts them (Python's len): an emoji is one, not two
	const length = (text) => [...text].length;

	// The backend's limits (max_length 20, 40 and 2; 이름, 전공 and 학번 required), with the field to
	// fix, so a refusal does not come back as a bare 400
	function checkForm() {
		const name = form.name.trim();
		const major = form.major.trim();
		const yearId = form.year_id.trim();
		const joinYear = form.join_year.trim();
		if (!name) return { field: 'name', message: '이름을 입력해 주세요.' };
		if (length(name) > 20) return { field: 'name', message: '이름은 20자까지 쓸 수 있습니다.' };
		if (!major) return { field: 'major', message: '전공을 입력해 주세요.' };
		if (length(major) > 40) return { field: 'major', message: '전공은 40자까지 쓸 수 있습니다.' };
		if (!yearId) return { field: 'year_id', message: '학번을 입력해 주세요.' };
		if (length(yearId) > 2) {
			return { field: 'year_id', message: '학번은 두 자리로 입력해 주세요 (예: 21).' };
		}
		if (joinYear && !/^\d{4}$/.test(joinYear)) {
			return {
				field: 'join_year',
				message: '입부 년도는 네 자리 숫자로 입력해 주세요 (예: 2021).'
			};
		}
		return null;
	}

	// A save that did not go through: the page stays, with the reason shown
	function stopSave() {
		saving = false;
		pendingUrl = null;
	}

	async function refuse(error) {
		stopSave();
		formError = error;
		await tick();
		document.getElementById(error.field ? `edit-${error.field}` : 'edit-save')?.focus();
	}

	// With the list just reloaded: the 사부 picked from the older list may be gone, or now close a
	// loop (the backend does not check)
	function sabuStillFree() {
		choices = sabuChoices(lineage, selected);
		if (form.sabu_id === '' || isChoice(form.sabu_id)) return true;
		form.sabu_id = '';
		refuse({
			field: 'sabu',
			message:
				'고른 사부는 이제 고를 수 없습니다: 목록에서 빠졌거나, 그사이 바뀐 계보에서 순환이 됩니다. 사부를 다시 골라 주세요.'
		});
		return false;
	}

	const LABELS = {
		name: '이름',
		is_ob: 'OB',
		major: '전공',
		year_id: '학번',
		join_year: '입부 년도',
		join_semester: '입부 학기',
		sabu_id: '사부'
	};

	// The member changed elsewhere since 수정 opened (recordedFields): the fields not edited here
	// take the new values, and the record moves on with them. Returns the fields changed on both
	// sides, still to ask about, and whether a 사부 set elsewhere could not be taken.
	function rebase() {
		const base = JSON.parse(recordedFields);
		const now = fieldsOf(selected.user);
		const start = JSON.parse(initial);
		const clash = [];
		let sabuLost = false;
		for (const key of Object.keys(now)) {
			if (now[key] === base[key]) continue;
			if (form[key] === start[key]) {
				if (key === 'sabu_id' && now[key] !== '' && !isChoice(now[key])) {
					sabuLost = true;
					form[key] = '';
				} else {
					form[key] = now[key];
					if (key === 'sabu_id') sabuNote = '';
				}
				start[key] = form[key];
				base[key] = now[key];
			} else if (form[key] === now[key]) {
				base[key] = now[key];
			} else {
				clash.push(LABELS[key]);
			}
		}
		const semester = Number(form.join_semester);
		if (form.join_semester && semester !== 1 && semester !== 2) oddSemester = form.join_semester;
		initial = JSON.stringify(start);
		recordedFields = JSON.stringify(base);
		return { clash, sabuLost };
	}

	async function save(event) {
		event.preventDefault();
		if (saving) return;
		// The checkbox and the selects are disabled during the save: focus waits on 저장
		if (document.activeElement?.matches('.edit select, .edit input[type="checkbox"]')) {
			document.getElementById('edit-save')?.focus();
		}
		// From here the boxes are read-only, so nothing typed during the save is lost
		saving = true;
		formError = null;
		await tick(); // the same error twice is announced twice
		const problem = checkForm();
		if (problem) {
			refuse(problem);
			return;
		}
		const id = selected.user.id;
		await load({ quiet: true });
		if (destroyed || !stillListed(id)) return;
		choices = sabuChoices(lineage, selected);
		const { clash, sabuLost } = rebase();
		if (sabuLost) {
			refuse({
				field: 'sabu',
				message:
					'다른 곳에서 사부가 고를 수 없는 지기(자기 자신이나 아래 계보)로 바뀌었습니다. 사부를 다시 골라 주세요. 그대로 저장하면 ‘사부 없음’이 됩니다.'
			});
			return;
		}
		if (!sabuStillFree()) return;
		// A field edited here and elsewhere since 수정 opened: the PUT would write over the other
		if (
			clash.length &&
			!confirm(
				`수정하는 동안 다른 곳에서도 바뀐 항목: ${clash.join(', ')}. 여기서 입력한 값으로 저장할까요?`
			)
		) {
			stopSave();
			await tick();
			document.getElementById('edit-save')?.focus();
			return;
		}
		recordedFields = JSON.stringify(fieldsOf(selected.user));
		const body = {
			name: form.name.trim(),
			major: form.major.trim(),
			year_id: form.year_id.trim(),
			is_ob: form.is_ob,
			sabu_id: form.sabu_id === '' ? null : Number(form.sabu_id),
			join_year: form.join_year.trim() === '' ? null : Number(form.join_year),
			join_semester: form.join_semester === '' ? null : Number(form.join_semester)
		};
		let saved = null;
		try {
			const response = await fetch(`/api/user/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (response.ok) saved = await response.json();
		} catch (error) {
			console.error('Failed to save the 지기', error);
		}
		if (!saved) {
			// The list again, for a member or 사부 deleted in the meantime
			await load({ quiet: true });
			if (destroyed || !stillListed(id) || !sabuStillFree()) return;
			refuse({ field: null, message: '저장하지 못했습니다. 입력을 확인하고 다시 시도해 주세요.' });
			return;
		}
		// The chart moves the card when its 입부 or 사부 changed. If the list does not reload, the
		// saved member replaces theirs in the list on screen.
		if (!(await load({ quiet: true }))) {
			show(users.map((user) => (user.id === id ? saved : user)));
		}
		editing = false;
		saving = false;
		panelNote = '저장했습니다.';
		if (pendingUrl) {
			const url = pendingUrl;
			pendingUrl = null;
			goto(url);
			return;
		}
		if (!selected) {
			searchBox?.focus();
			return;
		}
		await select(selected);
		editButton?.focus({ preventScroll: true });
	}

	function zoomBy(step) {
		const at = ZOOMS.indexOf(zoom);
		zoom = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, at + step))];
	}

	function cutReason(c) {
		if (c.reason === 'self') return '자기 자신이 사부';
		if (c.reason === 'missing') return '목록에 없는 지기가 사부';
		// From the member named, each followed by their 사부
		const at = c.loop.indexOf(c.node.user);
		const names = [...c.loop.slice(at), ...c.loop.slice(0, at)].map((user) => user.name);
		return `사부 관계가 순환: ${[...names, names[0]].join(' → ')}`;
	}
</script>

<svelte:window on:keydown={windowKey} />

<svelte:head>
	<title>지기 계보</title>
	<meta name="description" content="SoriBoard" />
</svelte:head>

<div class="lineage-screen">
	<div class="header">
		<div class="settinginfo">지기 계보</div>
	</div>

	{#if status === 'loading'}
		<p class="message">불러오는 중…</p>
	{:else if status === 'failed'}
		<div class="message">
			<p>지기 목록을 불러오지 못했습니다.</p>
			<button type="button" class="action" on:click={load}>다시 시도</button>
		</div>
	{:else if memberCount === 0}
		<p class="message">등록된 지기가 없습니다.</p>
	{:else}
		<div class="toolbar">
			<p class="summary">
				지기 {memberCount}명 · 계보 {lineage.families.length}개{longest
					? ` · 가장 긴 계보 ${longest}대`
					: ''}
			</p>
			<div class="search">
				<input
					type="search"
					placeholder="이름으로 찾기"
					aria-label="이름으로 찾기"
					bind:value={query}
					bind:this={searchBox}
					on:input={search}
					on:keydown={searchKey}
				/>
				<span class="count" aria-live="polite">
					{#if needle}
						{matches.length ? `${matchAt < 0 ? '–' : matchAt + 1}/${matches.length}` : '없음'}
					{/if}
				</span>
			</div>
			<div class="zoom" role="group" aria-label="확대/축소">
				<button
					type="button"
					class="action small"
					on:click={() => zoomBy(-1)}
					disabled={zoom === ZOOMS[0]}
					aria-label="축소">−</button
				>
				<span class="zoom-value">{Math.round(zoom * 100)}%</span>
				<button
					type="button"
					class="action small"
					on:click={() => zoomBy(1)}
					disabled={zoom === ZOOMS[ZOOMS.length - 1]}
					aria-label="확대">+</button
				>
			</div>
			<div class="legend" aria-hidden="true">
				<span class="swatch active"></span>현역
				<span class="swatch ob"></span>OB
				<span class="legend-note">한 줄이 한 입부 학기 · 위로 갈수록 최근, 사부 위에 제자</span>
			</div>
			<a class="edit-link" href="/setting/jigi">지기 추가·삭제는 지기 관리에서</a>
		</div>

		{#if lineage.cut.length}
			<p class="notice">
				사부 기록이 잘못되어 사부 없이 표시한 지기:
				{lineage.cut.map((c) => `${c.node.user.name}(${cutReason(c)})`).join(', ')}
			</p>
		{/if}
		{#if early.length}
			<p class="notice">
				입부 학기가 사부와 같거나 더 일러 사부와 선으로 잇지 못한 지기:
				{early
					.map(
						(node) =>
							`${node.user.name}(${shortJoin(node.user)}, 사부 ${node.parent.user.name} ${shortJoin(node.parent.user)})`
					)
					.join(', ')}
			</p>
		{/if}
		{#if lineage.families.length === 0}
			<p class="note">
				아직 사부가 설정된 지기가 없습니다. 지기를 눌러 ‘수정’에서 사부를 고르면 사부와 제자가
				선으로 이어집니다.
			</p>
		{/if}
		{#if unknownRow}
			<p class="note">
				입부 년도가 없는 지기 {unknownRow.count}명은 맨 아래 ‘입부 미상’ 줄에 있습니다. 지기를 눌러
				‘수정’에서 입부 년도와 학기를 넣으면 제 학기 줄로 옮겨집니다.
			</p>
		{/if}

		<div class="chart" bind:this={chartBox} bind:clientWidth={chartBoxWidth}>
			<div
				class="canvas"
				style="width: {LABEL_WIDTH + chart.width * zoom + room}px; height: {chart.height * zoom}px"
			>
				<div class="labels" style="width: {LABEL_WIDTH}px" aria-hidden="true">
					{#each chart.rows as row (row.key)}
						{@const [main, sub] = rowLabel(row)}
						<div
							class="label"
							class:alt={row.year !== null && row.year % 2 === 0}
							class:unknown={row.year === null}
							style="top: {row.top * zoom}px; height: {ROW_HEIGHT * zoom}px"
						>
							<span class="label-main">{main}</span>
							<span class="label-sub">{sub} · {row.count}명</span>
						</div>
					{/each}
				</div>
				<div class="plot" style="width: {chart.width * zoom}px; height: {chart.height * zoom}px">
					<div
						class="tree"
						style="width: {chart.width}px; height: {chart.height}px; transform: scale({zoom})"
					>
						{#each chart.rows as row (row.key)}
							<div
								class="band"
								class:alt={row.year !== null && row.year % 2 === 0}
								class:unknown={row.year === null}
								style="top: {row.top}px; height: {ROW_HEIGHT}px"
							></div>
						{/each}
						<svg
							width={chart.width}
							height={chart.height}
							viewBox="0 0 {chart.width} {chart.height}"
							aria-hidden="true"
						>
							{#each chart.links as link}
								<path
									d={link.d}
									class:on={highlighted?.has(link.to.user.id) && highlighted.has(link.from.user.id)}
									class:dim={highlighted && !highlighted.has(link.to.user.id)}
								/>
							{/each}
						</svg>
						{#each chart.boxes as box (box.node.user.id)}
							{@const user = box.node.user}
							<button
								type="button"
								id="jigi-{user.id}"
								class="card"
								class:ob={user.is_ob}
								class:selected={selected === box.node}
								class:dim={highlighted && !highlighted.has(user.id)}
								class:match={needle && matches.includes(box.node)}
								style="left: {box.x}px; top: {box.y}px; width: {NODE.nodeWidth}px; height: {NODE.nodeHeight}px"
								aria-pressed={selected === box.node}
								aria-label={describe(box.node)}
								title={describe(box.node)}
								on:click={() => toggle(box.node)}
								on:keydown={(event) => moveFrom(event, box.node)}
							>
								<span class="name"
									><span class="name-text">{user.name}</span>{#if user.is_ob}<span class="tag"
											>OB</span
										>{/if}</span
								>
								<span class="line">{user.major ?? ''}</span>
								{#if detached.has(box.node)}
									<span class="line detached">사부 {box.node.parent.user.name}</span>
								{:else}
									<span class="line">{user.year_id ? `${user.year_id}학번` : ''}</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

{#if selected}
	{@const user = selected.user}
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<aside
		class="detail"
		aria-label="{user.name} 정보"
		tabindex="-1"
		bind:this={panel}
		on:keydown={panelKey}
	>
		<div class="detail-head">
			<div class="detail-name">
				{user.name}{#if user.is_ob}<span class="tag">OB</span>{/if}
			</div>
			<div class="head-actions">
				{#if !editing}
					<button
						type="button"
						class="action"
						bind:this={editButton}
						aria-busy={opening === selection}
						on:click={startEdit}>수정</button
					>
				{/if}
				<button type="button" class="close" on:click={closeDetail} aria-label="닫기">×</button>
			</div>
		</div>
		{#if editing}
			<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
			<form class="edit" on:submit={save} on:keydown={formKey} novalidate>
				<label for="edit-name">이름</label>
				<input
					id="edit-name"
					bind:value={form.name}
					maxlength="20"
					autocomplete="off"
					aria-invalid={formError?.field === 'name'}
					aria-describedby={errorFor('name')}
					readonly={saving}
				/>
				<span class="field-label">구분</span>
				<label class="check"
					><input type="checkbox" bind:checked={form.is_ob} disabled={saving} /> OB</label
				>
				<label for="edit-major">전공</label>
				<input
					id="edit-major"
					bind:value={form.major}
					maxlength="40"
					autocomplete="off"
					aria-invalid={formError?.field === 'major'}
					aria-describedby={errorFor('major')}
					readonly={saving}
				/>
				<label for="edit-year_id">학번</label>
				<input
					id="edit-year_id"
					class="short"
					bind:value={form.year_id}
					maxlength="2"
					inputmode="numeric"
					autocomplete="off"
					placeholder="21"
					aria-invalid={formError?.field === 'year_id'}
					aria-describedby={errorFor('year_id')}
					readonly={saving}
				/>
				<label for="edit-join_year">입부</label>
				<div class="join">
					<input
						id="edit-join_year"
						bind:value={form.join_year}
						maxlength="4"
						inputmode="numeric"
						autocomplete="off"
						placeholder="년도"
						aria-label="입부 년도"
						aria-invalid={formError?.field === 'join_year'}
						aria-describedby={errorFor('join_year')}
						readonly={saving}
					/>
					<select bind:value={form.join_semester} aria-label="입부 학기" disabled={saving}>
						<option value="">학기 미상</option>
						<option value="1">1학기</option>
						<option value="2">2학기</option>
						{#if oddSemester}
							<option value={oddSemester}>{oddSemester}학기</option>
						{/if}
					</select>
				</div>
				<label for="edit-sabu">사부</label>
				<select
					id="edit-sabu"
					bind:value={form.sabu_id}
					disabled={saving}
					aria-invalid={formError?.field === 'sabu'}
					aria-describedby="edit-sabu-note{formError?.field === 'sabu' ? ' edit-error' : ''}"
				>
					<option value="">사부 없음</option>
					{#each choices as node (node.user.id)}
						<option value={String(node.user.id)}
							>{node.user.name} {node.user.major ?? ''} {node.user.year_id ?? ''}</option
						>
					{/each}
				</select>
				<p class="field-note" id="edit-sabu-note">
					{sabuNote || '자기 자신과 자기 아래 계보(제자, 제자의 제자…)는 사부로 고를 수 없습니다.'}
				</p>
				{#if formError}
					<p class="form-error" id="edit-error" role="alert">{formError.message}</p>
				{/if}
				<div class="form-actions">
					<button type="button" class="action quiet" on:click={() => cancelEdit()}>취소</button>
					<button type="submit" class="action" id="edit-save">{saving ? '저장 중…' : '저장'}</button
					>
				</div>
			</form>
		{:else}
			<div class="detail-meta">
				{[user.major, user.year_id ? `${user.year_id}학번` : '', joinLabel(user)]
					.filter(Boolean)
					.join(' · ')}
			</div>
			<dl>
				<dt>사부</dt>
				<dd>
					{#if selected.parent}
						<button
							type="button"
							class="chip"
							on:click={() => select(selected.parent, { focus: true })}
							>{selected.parent.user.name}
							<span class="chip-count">{selected.parent.user.year_id ?? ''}</span></button
						>
					{:else if cutOf.has(selected)}
						<span class="none">기록 오류 ({cutReason(cutOf.get(selected))})</span>
					{:else}
						<span class="none">기록 없음</span>
					{/if}
				</dd>
				<dt>제자</dt>
				<dd>
					{#each selected.children as child (child.user.id)}
						<button type="button" class="chip" on:click={() => select(child, { focus: true })}
							>{child.user.name}
							<span class="chip-count">{child.user.year_id ?? ''}</span></button
						>
					{:else}
						<span class="none">없음</span>
					{/each}
				</dd>
				{#if selected.root !== selected || selected.children.length}
					<dt>계보</dt>
					<dd>
						{selected.root.user.name} 계보 {selected.depth + 1}대째{below
							? ` · 아래로 ${below}명`
							: ''}
					</dd>
				{/if}
			</dl>
		{/if}
		<p class="panel-note" role="status">{panelNote}</p>
	</aside>
{/if}

<style>
	.lineage-screen,
	.lineage-screen *,
	.detail,
	.detail * {
		box-sizing: border-box;
	}
	.lineage-screen {
		width: 100%;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-start;
		padding-bottom: 24px;
	}
	.header {
		padding: 16px;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-evenly;
		flex-direction: row;
		background-color: var(--secondary-secondary-100);
		border-style: solid;
		border-color: var(--gray-gray-400, #bcbcbc);
		border-width: 1px;
		box-shadow: 4px 4px 5px 0px rgba(0, 0, 0, 0.25);
	}
	.settinginfo {
		color: var(--gray-gray-950, #1a1a1a);
		text-align: center;
		font-family: var(--medium-font-family, 'NotoSansKr-Medium', sans-serif);
		font-size: var(--medium-font-size, 16px);
		font-weight: var(--medium-font-weight, 500);
	}
	.message {
		margin-top: 80px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		color: var(--gray-gray-700);
		font-family: var(--medium-font-family);
		text-align: center;
	}
	.toolbar {
		width: 100%;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 24px;
		padding: 24px 40px 8px;
		font-family: var(--medium-font-family);
		color: var(--gray-gray-950);
	}
	.summary {
		font-size: 15px;
		font-weight: 700;
		margin-right: auto;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.search input {
		width: 200px;
		padding: 6px 10px;
		border: 1px solid var(--control-border);
		border-radius: 6px;
		background-color: var(--secondary-secondary-50);
		color: var(--gray-gray-950);
		font-family: var(--medium-font-family);
		font-size: 14px;
	}
	.count {
		min-width: 40px;
		font-size: 13px;
		color: var(--gray-gray-700);
	}
	.zoom {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.zoom-value {
		min-width: 44px;
		text-align: center;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
	}
	.swatch {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		border: 1px solid var(--gray-gray-400);
		margin-left: 6px;
	}
	.swatch.active {
		background-color: var(--secondary-secondary-200);
	}
	.swatch.ob {
		background-color: var(--secondary-secondary-50);
	}
	.edit-link {
		font-size: 13px;
		color: var(--gray-gray-700);
	}
	.action {
		background-color: var(--action-bg);
		color: var(--action-fg);
		border: none;
		border-radius: 3px;
		padding: 6px 16px;
		font-family: var(--medium-font-family);
		font-size: 14px;
		cursor: pointer;
		filter: drop-shadow(2px 2px 0 var(--button-shadow));
	}
	.action:hover:not(:disabled) {
		background-color: var(--action-hover-bg);
		color: var(--action-hover-fg);
	}
	.action:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.action.small {
		width: 28px;
		height: 28px;
		padding: 0;
		font-size: 16px;
		line-height: 28px;
	}
	.notice,
	.note {
		width: calc(100% - 80px);
		margin: 8px 40px 0;
		padding: 10px 14px;
		border-radius: 6px;
		background-color: var(--danger-bg);
		color: var(--danger-fg);
		font-family: var(--medium-font-family);
		font-size: 13px;
	}
	.note {
		background-color: var(--secondary-secondary-100);
		color: var(--gray-gray-950);
	}
	.legend-note {
		margin-left: 10px;
		color: var(--gray-gray-700);
	}
	/* The chart scrolls both ways inside the window; the 학기 column stays at its left edge */
	.chart {
		width: calc(100% - 80px);
		max-height: calc(100vh - 150px);
		margin: 16px 40px 0;
		overflow: auto;
		border: 1px solid var(--gray-gray-400);
		border-radius: 6px;
		background-color: var(--secondary-secondary-50);
	}
	.canvas {
		position: relative;
		display: flex;
	}
	.labels {
		position: sticky;
		left: 0;
		z-index: 2;
		flex: none;
		height: 100%;
		border-right: 1px solid var(--gray-gray-400);
		background-color: var(--secondary-secondary-50);
	}
	.label {
		position: absolute;
		left: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: var(--medium-font-family);
		color: var(--gray-gray-950);
		line-height: 1.25;
	}
	.label-main {
		font-size: 14px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.label-sub {
		font-size: 11px;
		color: var(--gray-gray-700);
	}
	.plot {
		position: relative;
		flex: none;
	}
	.band {
		position: absolute;
		left: 0;
		width: 100%;
	}
	.label.alt,
	.band.alt {
		background-color: var(--secondary-secondary-100);
	}
	.label.unknown,
	.band.unknown {
		border-top: 1px dashed var(--gray-gray-500);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border: 1px solid var(--gray-gray-400);
		border-radius: 999px;
		background-color: var(--secondary-secondary-50);
		color: var(--gray-gray-950);
		font-family: var(--medium-font-family);
		font-size: 13px;
		cursor: pointer;
	}
	.chip:hover {
		border-color: var(--control-border);
	}
	.chip-count {
		color: var(--gray-gray-700);
		font-size: 12px;
	}
	.canvas {
		position: relative;
	}
	.tree {
		position: absolute;
		left: 0;
		top: 0;
		transform-origin: 0 0;
	}
	svg {
		position: absolute;
		left: 0;
		top: 0;
		overflow: visible;
	}
	path {
		fill: none;
		stroke: var(--gray-gray-500);
		stroke-width: 1.5;
		transition: opacity 0.15s;
	}
	path.on {
		stroke: var(--gray-gray-950);
		stroke-width: 2.5;
	}
	path.dim {
		opacity: 0.25;
	}
	.card {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 2px;
		padding: 4px 10px;
		border: 1px solid var(--gray-gray-400);
		border-radius: 6px;
		background-color: var(--secondary-secondary-200);
		color: var(--gray-gray-950);
		font-family: var(--medium-font-family);
		text-align: left;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.card.ob {
		background-color: var(--secondary-secondary-50);
	}
	.card:hover {
		border-color: var(--control-border);
	}
	.card.selected {
		border-color: var(--gray-gray-950);
		box-shadow:
			0 0 0 1px var(--gray-gray-950),
			3px 3px 0 1px var(--button-shadow);
	}
	.card.match {
		outline: 2px solid var(--danger-fg);
		outline-offset: 2px;
	}
	.card:focus-visible,
	.chip:focus-visible {
		outline: 2px solid var(--gray-gray-950);
		outline-offset: 2px;
	}
	.card.dim {
		opacity: 0.3;
	}
	.name {
		max-width: 100%;
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 15px;
		font-weight: 700;
		line-height: 1.2;
	}
	.name-text {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.line {
		max-width: 100%;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: 12px;
		line-height: 1.3;
		color: var(--gray-gray-700);
	}
	.line.detached {
		color: var(--gray-gray-950);
	}
	.tag {
		flex-shrink: 0;
		padding: 0 4px;
		border-radius: 3px;
		background-color: var(--neutral-bg);
		color: var(--neutral-fg);
		font-size: 10px;
		font-weight: 500;
		line-height: 1.5;
	}
	.detail {
		position: fixed;
		right: 24px;
		bottom: 24px;
		z-index: 10;
		width: 320px;
		max-height: calc(100vh - 48px);
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px 18px;
		border: 1px solid var(--gray-gray-400);
		border-radius: 6px;
		background-color: var(--secondary-secondary-50);
		box-shadow: 4px 4px 5px 0px rgba(0, 0, 0, 0.25);
		font-family: var(--medium-font-family);
		color: var(--gray-gray-950);
		word-break: keep-all; /* Korean wraps between words */
		overflow-wrap: anywhere;
	}
	.detail:focus {
		outline: none; /* focused only by a click on its text, for Tab to go on from there */
	}
	.detail-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
	}
	.detail-name {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 20px;
		font-weight: 700;
	}
	.detail-meta {
		margin-top: -10px; /* 2px below the name, inside the panel's 12px gap */
		font-size: 13px;
		color: var(--gray-gray-700);
	}
	.close {
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 3px;
		background-color: var(--neutral-bg);
		color: var(--neutral-fg);
		font-size: 18px;
		line-height: 28px;
		cursor: pointer;
	}
	dl {
		display: grid;
		grid-template-columns: 40px 1fr;
		gap: 8px 10px;
		align-items: baseline;
		font-size: 14px;
	}
	dt {
		color: var(--gray-gray-700);
		font-size: 13px;
	}
	dd {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.none {
		color: var(--gray-gray-700);
	}
	.head-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}
	.edit {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr);
		gap: 8px 10px;
		align-items: center;
		font-size: 14px;
	}
	.edit > label,
	.field-label {
		color: var(--gray-gray-700);
		font-size: 13px;
	}
	.edit input:not([type='checkbox']),
	.edit select {
		width: 100%;
		min-width: 0;
		padding: 5px 8px;
		border-radius: 6px;
		background-color: var(--secondary-secondary-50);
		font-family: var(--medium-font-family);
		font-size: 14px;
	}
	.edit input.short {
		width: 64px;
	}
	/* a box-shadow, so the focus outline still shows on the field to fix */
	.edit [aria-invalid='true'] {
		border-color: var(--danger-fg);
		box-shadow: inset 0 0 0 1px var(--danger-fg);
	}
	.edit > .check {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--gray-gray-950);
		font-size: 14px;
		cursor: pointer;
	}
	.check input {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: var(--checked-bg);
	}
	.join {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr);
		gap: 6px;
	}
	.field-note,
	.form-error,
	.form-actions {
		grid-column: 1 / -1;
	}
	.field-note,
	.form-error,
	.panel-note {
		margin: 0;
	}
	.field-note {
		margin-top: -2px;
		color: var(--gray-gray-700);
		font-size: 12px;
		line-height: 1.4;
	}
	.form-error {
		padding: 6px 8px;
		border-radius: 3px;
		background-color: var(--danger-bg);
		color: var(--danger-fg);
		font-size: 13px;
	}
	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 4px;
	}
	.action[aria-busy='true'] {
		opacity: 0.6;
		cursor: progress;
	}
	.action.quiet {
		background-color: var(--neutral-bg);
		color: var(--neutral-fg);
	}
	/* Empty, it stays in the accessibility tree, so 저장했습니다 is announced when it appears */
	.panel-note:empty {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.panel-note {
		font-size: 13px;
		color: var(--gray-gray-700);
	}
</style>
