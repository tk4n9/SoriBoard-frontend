<script>
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import MusicInfo from '$lib/components/musicinfo.svelte';
	import Input from '$lib/components/input.svelte';
	import BreakButton from '$lib/components/breakButton.svelte';
	import instalogo from '$lib/images/insta.svg';
	import plusicon from '$lib/images/plus.svg';
	import minusicon from '$lib/images/minus.svg';
	import checkicon from '$lib/images/check.svg';
	import Tv from '$lib/components/tv.svelte';

	$: id = $page.params.id;

	let timeDate = '';
	let timeUser = '';
	let timeMusic = [];
	let time;
	let mento_ids = [];
	let mentee_ids = [];
	let mento;
	let mentee;
	let arrival_time;
	let mentee_arrival_time;
	let date;

	let prevId = null;
	let nextId = null;

	// Comment fields
	let time_comment_music = '';
	let time_comment_gigi = '';
	let time_comment_etc = '';

	let composer = '';
	let title = '';
	let detail = '';
	let conductor = '';
	let orchestra = '';
	let source = 'ROON';
	let cd_id = '';
	let is_requested = false;
	let players = writable(['']);
	let duplicateWarning = null;

	function addPlayer() {
		players.update((currentPlayers) => [...currentPlayers, '']);
	}

	function deletePlayer(index) {
		players.update((currentPlayers) => {
			return currentPlayers.filter((_, i) => i !== index);
		});
	}

	// Dynamic rows for selecting 지기/견습 (like players UI)
	function addMentoRow() {
		mento_ids = [...mento_ids, ''];
	}
	function removeMentoRow(index) {
		mento_ids = mento_ids.filter((_, i) => i !== index);
	}

	function addMenteeRow() {
		mentee_ids = [...mentee_ids, ''];
	}
	function removeMenteeRow(index) {
		mentee_ids = mentee_ids.filter((_, i) => i !== index);
	}

	function toggleCheck() {
		is_requested = !is_requested;
	}

	async function deleteMusic(music_id) {
		const isConfirmed = confirm('삭제하시겠습니까?');
		if (isConfirmed) {
			const response = await fetch(`/api/music/${music_id}`, {
				method: 'DELETE'
			});
			loadTimeInfo(id);
		}
	}

	async function fetchData(id) {
		const response = await fetch(`/api/time/${id}`);
		if (!response.ok) {
			console.log('Error');
		}
		return await response.json();
	}

	const users = writable([]);
	async function fetchUsers() {
		try {
			const response = await fetch('/api/user');
			const data = await response.json();
			users.set(data);
		} catch (error) {
			console.error('failed to fetch users');
		}
	}

	function formatDateToKorean(dateString) {
		const date = new Date(dateString + 'T00:00:00');
		const options = { month: 'long', day: 'numeric', weekday: 'long' };
		let formattedDate = date.toLocaleDateString('ko-KR', options);
		formattedDate = formattedDate
			.replace('월요일', '(월요일)')
			.replace('화요일', '(화요일)')
			.replace('수요일', '(수요일)')
			.replace('목요일', '(목요일)')
			.replace('금요일', '(금요일)')
			.replace('토요일', '(토요일)')
			.replace('일요일', '(일요일)');
		return formattedDate;
	}

	async function loadTimeInfo(id) {
		try {
			const data = await fetchData(id);
			date = new Date(data.date);
			const year = date.getFullYear();
			const month = date.getMonth() + 1;
			const day = date.getDate();
			time = data.time;
			const mento_name = Array.isArray(data.jigi_info)
				? data.jigi_info.join(', ')
				: data.jigi_info || '';
			const mentee_name =
				Array.isArray(data.mentee_info) && data.mentee_info.length
					? ` / ${data.mentee_info.join(', ')}`
					: '';
			timeMusic = data.time_music;
			timeDate = `${year}년 ${month}월 ${day}일 ${time}타임`;
			timeUser = `${mento_name}${mentee_name}`;
			mento_ids = (data.users || []).map(String);
			mentee_ids = (data.mentees || []).map(String);
			arrival_time = data.arrival_time;
			mentee_arrival_time = data.mentee_arrival_time ? data.mentee_arrival_time : '';

			// Load comment fields
			time_comment_music = data.time_comment_music || '';
			time_comment_gigi = data.time_comment_gigi || '';
			time_comment_etc = data.time_comment_etc || '';

			date = date.toISOString().split('T')[0];
		} catch (error) {
			console.log('Error');
		}
	}

	function timeChange(time) {
		switch (time) {
			case 1:
				time = '9:30~11:00';
				break;
			case 2:
				time = '11:10~12:40';
				break;
			case 3:
				time = '12:50~14:20';
				break;
			case 4:
				time = '14:30~16:00';
				break;
			case 5:
				time = '16:10~17:40';
				break;
			default:
				time = '';
				break;
		}
		return time;
	}

	async function fetchRangeIds(startDate, endDate) {
		const pad = (n) => String(n).padStart(2, '0');
		const sy = startDate.getFullYear();
		const sm = pad(startDate.getMonth() + 1);
		const sd = pad(startDate.getDate());
		const ey = endDate.getFullYear();
		const em = pad(endDate.getMonth() + 1);
		const ed = pad(endDate.getDate());

		const response = await fetch(`/api/time/${sy}/${sm}/${sd}/${ey}/${em}/${ed}`);
		if (!response.ok) return [];
		const rangeData = await response.json();

		const allTimeIds = [];
		for (let dayIdx = 0; dayIdx < rangeData.length; dayIdx++) {
			const daySlots = rangeData[dayIdx];
			if (!daySlots) continue;
			for (let slotIdx = 0; slotIdx < daySlots.length; slotIdx++) {
				if (daySlots[slotIdx] != null) {
					allTimeIds.push(daySlots[slotIdx]);
				}
			}
		}
		return allTimeIds;
	}

	async function loadAdjacentTimeIds(currentId) {
		prevId = null;
		nextId = null;

		if (!date) return;

		const currentDate = new Date(date + 'T00:00:00');
		const numId = Number(currentId);
		const ranges = [14, 90, 365 * 10];

		try {
			for (const days of ranges) {
				const startDate = new Date(currentDate);
				startDate.setDate(startDate.getDate() - days);
				const endDate = new Date(currentDate);
				endDate.setDate(endDate.getDate() + days);

				const allTimeIds = await fetchRangeIds(startDate, endDate);
				const currentIndex = allTimeIds.indexOf(numId);
				if (currentIndex === -1) continue;

				if (currentIndex > 0) {
					prevId = allTimeIds[currentIndex - 1];
				}
				if (currentIndex < allTimeIds.length - 1) {
					nextId = allTimeIds[currentIndex + 1];
				}

				if (prevId !== null && nextId !== null) break;
			}
		} catch (error) {
			console.error('Failed to load adjacent times', error);
		}
	}

	async function reloadAll(currentId) {
		visible = false;
		editing = false;
		display = false;
		await loadTimeInfo(currentId);
		await loadAdjacentTimeIds(currentId);
	}

	onMount(() => {
		fetchUsers();
		loadTimeInfo(id);
	});

	$: if (id) {
		reloadAll(id);
	}

	async function submitMusic() {
		const formData = {
			time: id,
			order: timeMusic.length > 0 ? timeMusic[timeMusic.length - 1].order + 1 : 1,
			is_requested: is_requested,
			source: source,
			cd_id: cd_id,
			title: title,
			semi_title: detail,
			composer_name: composer,
			conductor_name: conductor,
			orchestra_name: orchestra,
			player_names: $players
		};

		const response = await fetch('/api/music', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(formData)
		});
		if (response.ok) {
			composer = '';
			title = '';
			detail = '';
			conductor = '';
			orchestra = '';
			source = 'ROON';
			cd_id = '';
			is_requested = false;
			players.set(['']);
			duplicateWarning = null;
			loadTimeInfo(id);
		} else {
			console.error('Failed to create');
		}
	}

	async function handleSubmit(event) {
		event.preventDefault();
		const isValid = $players.every((player) => player !== '' && !player.includes(':'));
		if (isValid) {
			alert("'{악기/역할} : {연주자 이름}' 형식으로 적어주세요");
			return;
		}

		const params = new URLSearchParams({ composer_name: composer, title, days: 7 });
		const checkRes = await fetch(`/api/check-duplicate?${params}`);
		const checkData = await checkRes.json();

		if (checkData.duplicates.length > 0) {
			duplicateWarning = checkData.duplicates;
			return;
		}

		await submitMusic();
	}

	async function handleEdit(event) {
		event.preventDefault();
		const formData = {
			date: date,
			time: time,
			users: mento_ids.filter((v) => v && v !== '').map((v) => Number(v)),
			mentees: mentee_ids.filter((v) => v && v !== '').map((v) => Number(v)),
			arrival_time: arrival_time,
			mentee_arrival_time: mentee_arrival_time
		};

		const response = await fetch(`/api/time/${id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(formData)
		});
		if (response.ok) {
			const data = await response.json();
			location.reload();
		} else {
			console.error('Failed to edit TimeInfo');
		}
	}

	async function handleCommentSubmit(event) {
		event.preventDefault();
		const formData = {
			date: date,
			time: time,
			users: mento_ids.filter((v) => v && v !== '').map((v) => Number(v)),
			mentees: mentee_ids.filter((v) => v && v !== '').map((v) => Number(v)),
			arrival_time: arrival_time,
			mentee_arrival_time: mentee_arrival_time,
			time_comment_music: time_comment_music,
			time_comment_gigi: time_comment_gigi,
			time_comment_etc: time_comment_etc
		};

		const response = await fetch(`/api/time/${id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(formData)
		});
		if (response.ok) {
			const data = await response.json();
			alert('코멘트가 저장되었습니다.');
			// Don't reload - keep the form with current values for further editing
		} else {
			console.error('Failed to save comments');
			alert('코멘트 저장에 실패했습니다.');
		}
	}

	let visible = false;
	let editing = false;
	let display = false;

	function toggle() {
		visible = !visible;
		editing = false;
		display = false;
	}

	function edit_toggle() {
		editing = !editing;
		visible = false;
		display = false;
	}

	function display_toggle() {
		display = !display;
		editing = false;
		visible = false;
	}

	function clickOutside(node) {
		const handleClick = (event) => {
			if (!node.contains(event.target)) {
				node.dispatchEvent(new CustomEvent('outclick'));
			}
		};

		document.addEventListener('click', handleClick, true);

		return {
			destroy() {
				document.removeEventListener('click', handleClick, true);
			}
		};
	}
	function findItemIndexById(id) {
		return timeMusic.findIndex((item) => item.id === id);
	}

	async function deleteTime() {
		const isConfirmed = confirm('삭제하시겠습니까?');
		if (isConfirmed) {
			const response = await fetch(`/api/time/${id}`, {
				method: 'DELETE'
			});
			goto('/time_manage');
		}
	}

	async function swapOrders(id1, id2) {
		try {
			const response = await fetch(`/api/music/${id1}/${id2}/`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				}
			});
			if (!response.ok) {
				throw new Error('Network response was not ok');
			}
			const data = await response.json();
		} catch (error) {
			console.error('Error swapping orders:', error);
		}
	}

	async function goDown(event) {
		const { musicid } = event.detail;
		const index = findItemIndexById(musicid);
		if (index === -1 || index === timeMusic.length - 1) return;
		const currentItem = timeMusic[index];
		const nextItem = timeMusic[index + 1];
		await swapOrders(currentItem.id, nextItem.id);
		loadTimeInfo(id);
	}
	async function goUp(event) {
		const { musicid } = event.detail;
		const index = findItemIndexById(musicid);
		if (index <= 0) return;
		const currentItem = timeMusic[index];
		const prevItem = timeMusic[index - 1];
		await swapOrders(currentItem.id, prevItem.id);
		loadTimeInfo(id);
	}
</script>

<svelte:head>
	<title>타임 관리</title>
	<meta name="description" content="SoriBoard" />
</svelte:head>

<div class="manage-screen">
	<div class="header">
		<div class="buttons">
			<button class="time_edit button" on:click={edit_toggle}> 타임 정보 수정 </button>
			<button class="time_edit button" on:click={display_toggle}> 판서 화면 수정 </button>
		</div>
		<div class="timeinfo-nav">
			<button
				class="nav-button"
				on:click={() => goto(`/time_manage/${prevId}`)}
				disabled={!prevId}
				aria-label="이전 타임"
			>
				&#9664;
			</button>
			<div class="timeinfo">{timeDate}<br />{timeUser}</div>
			<button
				class="nav-button"
				on:click={() => goto(`/time_manage/${nextId}`)}
				disabled={!nextId}
				aria-label="다음 타임"
			>
				&#9654;
			</button>
		</div>
		<div class="buttons">
			<button class="insta button" on:click={toggle}>
				<img src={instalogo} alt="insta" />
				업로드
			</button>
			{#if time}
				<BreakButton {time} />
			{/if}
		</div>
	</div>
	<div class="content">
		<div class="playlist hide-scrollbar">
			{#each timeMusic as music}
				<MusicInfo
					on:goDown={goDown}
					on:goUp={goUp}
					id={music.id}
					is_requested={music.is_requested}
					source={music.source}
					cd_id={music.cd_id}
					composer={music.composer_name}
					title={music.music_title}
					semiTitle={music.music_semi_title ? music.music_semi_title : ''}
					orchestra={music.orchestra_name ? music.orchestra_name : ''}
					conductor={music.conductor_name ? '지휘: ' + music.conductor_name : ''}
					players={music.player_names ? music.player_names : []}
					{deleteMusic}
				></MusicInfo>
			{/each}
		</div>
		<div class="form-section">
			<form on:submit={handleSubmit} method="POST" class="inputfield">
				<div class="stack">
					<div class="box">
						<div class="label">신청곡</div>
						<button
							type="button"
							class="checkbox"
							on:click={toggleCheck}
							class:checked={is_requested}
						>
							{#if is_requested}
								<img src={checkicon} alt="check" class="check" />
							{/if}
						</button>
					</div>
					<Input label="음원 종류" width="100px" bind:value={source}></Input>
					<Input label="음반 번호" width="100px" bind:value={cd_id}></Input>
				</div>
				<Input label="작곡가" bind:value={composer}></Input>
				<Input label="제목" bind:value={title}></Input>
				<Input label="곡 세부 정보(악장 등)" bind:value={detail}></Input>
				<Input label="오케스트라/실내악단" bind:value={orchestra}></Input>
				<Input label="지휘자" bind:value={conductor}></Input>
				{#each $players as player, i}
					<div class="player_stack">
						<Input
							label={'연주자 ' + (i + 1)}
							bind:value={$players[i]}
							width={i != 0 ? '265px' : '300px'}
						></Input>
						{#if i > 0}
							<button type="button" class="minus" on:click={() => deletePlayer(i)}>
								<img src={minusicon} alt="minus" />
							</button>
						{/if}
					</div>
				{/each}
				<button type="button" class="plus" on:click={addPlayer}>
					<img src={plusicon} alt="plus" />
				</button>
				<input id="submit1" type="submit" value="곡 추가하기" class="submit" />
			{#if duplicateWarning}
				<div class="duplicate-warning">
					<div class="warning-title">⚠ 최근 7일 내 재생된 곡입니다</div>
					{#each duplicateWarning as d}
						<div class="warning-item">
							{d.date} · {d.time}타임 — {d.composer_name} · {d.music_title}
						</div>
					{/each}
					<div class="warning-buttons">
						<button type="button" class="warn-cancel" on:click={() => (duplicateWarning = null)}
							>취소</button
						>
						<button type="button" class="warn-confirm" on:click={submitMusic}>그래도 추가</button>
					</div>
				</div>
			{/if}
			</form>

			<div class="comments-section">
				<h3 class="comments-title">타임 코멘트</h3>
				<form on:submit={handleCommentSubmit} method="POST" class="comment-form">
					<div class="comment-fields">
						<label class="comment-label"
							>음반 관련 코멘트
							<textarea
								bind:value={time_comment_music}
								placeholder="음악 관련 코멘트를 입력하세요..."
								rows="4"
								class="comment-textarea"
							></textarea>
						</label>
						<label class="comment-label"
							>기기 관련 코멘트
							<textarea
								bind:value={time_comment_gigi}
								placeholder="기기 관련 코멘트를 입력하세요..."
								rows="4"
								class="comment-textarea"
							></textarea>
						</label>
						<label class="comment-label"
							>기타 코멘트
							<textarea
								bind:value={time_comment_etc}
								placeholder="기타 코멘트를 입력하세요..."
								rows="4"
								class="comment-textarea"
							></textarea>
						</label>
					</div>
					<input type="submit" value="코멘트 저장" class="submit comment-submit" />
				</form>
			</div>
		</div>
	</div>
</div>

{#if visible}
	<div class="modal">
		<div
			class="modal-content"
			use:clickOutside
			on:outclick={toggle}
			in:fly={{ y: '-20vh', duration: 400 }}
		>
			<span
				role="button"
				tabindex="0"
				class="xbutton"
				title="close"
				on:click={toggle}
				on:keydown={toggle}>&times;</span
			>
			<div class="title">인스타 업로드 형식</div>
			<div class="insta_content">
				<h3>[ {formatDateToKorean(date)} / {timeChange(time)} ]</h3>
				{#each timeMusic as music}
					<br />
					<b>{music.composer_name}</b>
					<br />
					{music.music_title}
					{music.music_semi_title ? music.music_semi_title : ''}
					<br />
					{#if music.orchestra_name}
						{music.orchestra_name}
						<br />
					{/if}
					{#if music.conductor_name}
						{music.conductor_name ? '지휘: ' + music.conductor_name : ''}
						<br />
					{/if}
					{#each music.player_names as player}
						{player}<br />
					{/each}
				{/each}
			</div>
		</div>
	</div>
{/if}
{#if editing}
	<div class="modal edit_modal">
		<div
			class="modal-content"
			use:clickOutside
			on:outclick={edit_toggle}
			in:fly={{ y: '-20vh', duration: 400 }}
		>
			<span
				role="button"
				tabindex="0"
				class="xbutton"
				title="close"
				on:click={edit_toggle}
				on:keydown={edit_toggle}>&times;</span
			>
			<div class="title">타임 정보 수정</div>
			<br />
			<form on:submit={handleEdit} method="PUT" class="form">
				<div class="stack">
					<label
						><input
							name="date"
							type="date"
							required
							bind:value={date}
							style="width:120px"
							readonly
						/></label
					>
					<label
						><input
							name="number"
							type="number"
							min="1"
							max="5"
							bind:value={time}
							required
							style="width:40px"
							readonly
						/> 타임</label
					>
				</div>
				<br />
				<div class="stack">
					<div class="col">
						<label for="mento-row-0">지기 이름</label>
						{#each mento_ids as val, i}
							<div class="player_stack">
								<select
									id={`mento-row-${i}`}
									bind:value={mento_ids[i]}
									aria-label={`지기 ${i + 1}`}
								>
									<option value="" disabled>선택</option>
									{#each $users as user}
										<option value={String(user.id)}>{user.name} {user.major} {user.year_id}</option>
									{/each}
								</select>
								{#if i > 0}
									<button type="button" class="minus" on:click={() => removeMentoRow(i)}>
										<img src={minusicon} alt="minus" />
									</button>
								{/if}
							</div>
						{/each}
						<button type="button" class="plus" on:click={addMentoRow}>
							<img src={plusicon} alt="plus" />
						</button>
					</div>
					<label
						>출근 시간 <input
							name="time"
							type="time"
							required
							bind:value={arrival_time}
							style="width:8em"
						/></label
					>
				</div>
				<div class="stack">
					<div class="col">
						<label for="mentee-row-0">견습 이름</label>
						{#each mentee_ids as val, i}
							<div class="player_stack">
								<select
									id={`mentee-row-${i}`}
									bind:value={mentee_ids[i]}
									aria-label={`견습 ${i + 1}`}
								>
									<option value="" disabled>선택</option>
									{#each $users as user}
										<option value={String(user.id)}>{user.name} {user.major} {user.year_id}</option>
									{/each}
								</select>
								{#if i > 0}
									<button type="button" class="minus" on:click={() => removeMenteeRow(i)}>
										<img src={minusicon} alt="minus" />
									</button>
								{/if}
							</div>
						{/each}
						<button type="button" class="plus" on:click={addMenteeRow}>
							<img src={plusicon} alt="plus" />
						</button>
					</div>
					<label
						style="visibility: {mentee_ids.filter((v) => v && v !== '').length
							? 'visible'
							: 'hidden'};"
						>출근 시간 <input
							name="time"
							type="time"
							bind:value={mentee_arrival_time}
							style="width:8em"
						/></label
					>
				</div>
				<br />
				<label>
					<input id="submit2" type="submit" value="타임 수정하기" class="submit" />
				</label>
			</form>
			<button class="delete" on:click={deleteTime}>삭제</button>
		</div>
	</div>
{/if}
{#if display}
	<div class="modal edit_modal">
		<div
			class="modal-content2"
			use:clickOutside
			on:outclick={display_toggle}
			in:fly={{ y: '-20vh', duration: 400 }}
		>
			<span
				role="button"
				tabindex="0"
				class="xbutton"
				title="close"
				on:click={display_toggle}
				on:keydown={display_toggle}>&times;</span
			>
			<div class="title">판서 화면 수정</div>
			<br />
			<Tv></Tv>
		</div>
	</div>
{/if}

<style>
	input {
		background-color: var(--secondary-secondary-200);
		color: var(--gray-gray-950);
		font-family: var(--medium-font-family, 'NotoSansKr-Medium', sans-serif);
		font-size: var(--medium-font-size, 16px);
		font-weight: var(--medium-font-weight, 500);
	}
	label {
		font-family: var(--large-font-family, 'NotoSansKr-Medium', sans-serif);
		font-size: var(--large-font-size, 16px);
		font-weight: var(--large-font-weight, 500);
	}
	.stack {
		display: flex;
		flex-direction: row;
		gap: 20px;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		position: relative;
	}
	.form {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
	}
	.box {
		margin-top: 14px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
	.label {
		color: var(--primary-primary-700, #b7946c);
		text-align: center;
		font-family: var(--small-medium-font-family, 'NotoSansKr-Regular', sans-serif);
		font-size: var(--small-medium-font-size, 10px);
		font-weight: var(--small-medium-font-weight, 400);
		position: relative;
	}
	.checkbox {
		padding: 0;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		border: 2px solid var(--primary-primary-700);
		cursor: pointer;
		background-color: var(--primary-primary-100);
	}
	.checked {
		background-color: var(--primary-primary-700);
	}
	.delete {
		text-align: center;
		color: var(--gray-gray-50);
		font-family: var(--small-medium-font-family,);
		font-size: var(--small-medium-font-size, 13px);
		font-weight: var(--small-medium-font-weight, 500);
		position: relative;
		border-radius: 3px;
		padding: 4px 7px 4px 7px;
		display: flex;
		flex-direction: row;
		gap: 4px;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 60px;
		height: 40px;
		position: absolute;
		box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.25);
		cursor: pointer;
		border: none;
		background: var(--red-red-700);
		margin-left: 10px;
	}
	.check {
		width: 22px;
		height: 22px;
	}
	.manage-screen {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 0px;
		align-items: center;
		justify-content: flex-start;
		position: relative;
		overflow: hidden;
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
		box-shadow: 0px 4px 5px 0px rgba(0, 0, 0, 0.25);
	}
	.timeinfo-nav {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 12px;
	}
	.nav-button {
		background: var(--secondary-secondary-200);
		border: 1px solid var(--gray-gray-400);
		border-radius: 4px;
		color: var(--gray-gray-950);
		font-size: 18px;
		width: 36px;
		height: 36px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0px 2px 3px 0px rgba(0, 0, 0, 0.15);
	}
	.nav-button:hover:not(:disabled) {
		background: var(--primary-primary-700);
		color: var(--gray-gray-50);
	}
	.nav-button:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.timeinfo {
		color: var(--gray-gray-950, #1a1a1a);
		text-align: center;
		font-family: var(--medium-font-family, 'NotoSansKr-Medium', sans-serif);
		font-size: var(--medium-font-size, 16px);
		font-weight: var(--medium-font-weight, 500);
		position: relative;
	}
	.buttons {
		gap: 40px;
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.button {
		color: var(--gray-gray-50, #fcfcfc);
		text-align: center;
		font-family: var(--small-medium-font-family,);
		font-size: var(--small-medium-font-size, 13px);
		font-weight: var(--small-medium-font-weight, 500);
		position: relative;
		border-radius: 3px;
		padding: 4px 7px 4px 7px;
		display: flex;
		flex-direction: row;
		gap: 4px;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 100px;
		height: 45px;
		position: relative;
		box-shadow: 0px 4px 4px 0px rgba(0, 0, 0, 0.25);
		cursor: pointer;
		border: none;
	}
	.insta {
		background: var(--red-red-500, #f49a9a);
	}
	.time_edit {
		background: var(--gray-gray-500);
	}
	.title {
		color: var(--gray-gray-900, #202020);
		text-align: center;
		font-family: 'SeoulHangang-L', sans-serif;
		font-size: 32px;
		font-weight: 400;
		position: relative;
	}
	.content {
		display: flex;
		flex-direction: row;
		gap: 30px;
		width: 100%;
		align-items: flex-start;
		justify-content: space-around;
		position: relative;
		overflow: visible;
		padding: 40px;
	}
	@media only screen and (max-width: 1400px) {
		.content {
			display: flex;
			flex-direction: column;
			gap: 30px;
			width: 100%;
			align-items: center;
			justify-content: space-around;
			position: relative;
			overflow: visible;
			padding: 40px;
		}
	}
	.form-section {
		display: flex;
		flex-direction: column;
		gap: 30px;
		align-items: center;
		justify-content: flex-start;
		max-width: 500px;
		width: 100%;
	}
	.playlist {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: center;
		justify-content: center;
	}
	.inputfield {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: center;
		justify-content: center;
		position: relative;
		overflow: hidden;
		width: 100%;
		max-width: 500px;
		box-sizing: border-box;
	}
	.player_stack {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: 3px;
	}
	.plus {
		width: 32px;
		height: 32px;
		position: relative;
		overflow: hidden;
		cursor: pointer;
		margin-top: 8px;
		margin-bottom: 8px;
		border: none;
		background-color: var(--secondary-secondary-50);
	}
	.plus img {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}
	.minus {
		margin-top: 20px;
		width: 32px;
		height: 32px;
		position: relative;
		overflow: hidden;
		cursor: pointer;
		border: none;
		background-color: var(--secondary-secondary-50);
	}
	.minus img {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
	}
	.submit {
		background-color: var(--secondary-secondary-50);
		color: var(--gray-gray-950, #1a1a1a);
		text-align: center;
		font-family: var(--medium-font-family,);
		font-size: var(--medium-font-size, 13px);
		font-weight: var(--medium-font-weight, 500);
		border: 1px solid var(--primary-primary-700);
		border-radius: 6px;
		border-width: 2px;
		padding: 6px 20px 6px 20px;
		cursor: pointer;
	}
	.xbutton {
		position: absolute;
		right: 0;
		top: 0;
		display: inline-block;
		text-decoration: none;
		text-align: center;
		cursor: pointer;
		padding: 8px 16px;
		font-weight: bold;
		font-size: 1.4em;
		border-radius: 10%;
	}
	.xbutton:hover {
		color: #fff !important;
		background-color: #f44336 !important;
	}
	.modal {
		z-index: 3;
		display: block;
		padding-top: 10vh;
		position: absolute;
		left: 0;
		top: 0;
		width: 100%;
		height: 100%;
		margin-left: 58px;
	}
	.edit_modal {
		backdrop-filter: blur(15px);
	}
	.modal-content {
		margin: auto;
		background-color: var(--primary-primary-100);
		position: relative;
		padding-top: 30px;
		padding-bottom: 50px;
		outline: 0;
		width: 44vw;
		border-radius: 2%;
		border-color: var(--gray-gray-400);
		border-style: solid;
	}
	.modal-content2 {
		margin: auto;
		background-color: var(--primary-primary-100);
		position: relative;
		padding-top: 30px;
		padding-bottom: 50px;
		outline: 0;
		width: 60vw;
		border-radius: 2%;
		border-color: var(--gray-gray-400);
		border-style: solid;
	}
	.insta_content {
		text-align: center;
	}
	.comment-fields {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
	}
	.comments-section {
		border-radius: 6px;
		padding: 15px;
		margin: 15px 0;
		width: 100%;
		max-width: 500px; /* Match the form width */
		box-sizing: border-box; /* Include padding and border in width calculation */
	}
	.comment-label {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-family: var(--small-medium-font-family, 'NotoSansKr-Medium', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		font-weight: var(--small-medium-font-weight, 500);
		color: var(--gray-gray-950, #1a1a1a);
	}
	.comment-textarea {
		background-color: var(--secondary-secondary-200);
		color: var(--gray-gray-950);
		font-family: var(--small-medium-font-family, 'NotoSansKr-Medium', sans-serif);
		font-size: var(--small-medium-font-size, 13px);
		font-weight: var(--small-medium-font-weight, 400);
		border: 1px solid var(--gray-gray-400);
		border-radius: 4px;
		padding: 8px;
		resize: vertical;
		min-height: 60px;
		width: 100%;
		box-sizing: border-box;
	}
	.comment-textarea:focus {
		outline: none;
		border-color: var(--primary-primary-700);
		box-shadow: 0 0 0 2px rgba(183, 148, 108, 0.2);
	}
	.comment-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 100%;
	}
	.comment-submit {
		margin-top: 8px;
		background-color: var(--primary-primary-700);
		color: var(--gray-gray-50);
		font-size: var(--small-medium-font-size, 13px);
		padding: 6px 20px 6px 20px;
		border: 1px solid var(--primary-primary-700);
		border-radius: 6px;
		border-width: 2px;
		cursor: pointer;
		font-family: var(--medium-font-family);
		font-weight: var(--medium-font-weight, 500);
		text-align: center;
		width: fit-content;
		align-self: center;
		min-width: 0;
	}
	.comment-submit:hover {
		background-color: var(--primary-primary-800);
	}
	.comments-title {
		color: var(--primary-primary-700);
		font-family: var(--medium-font-family, 'NotoSansKr-Medium', sans-serif);
		font-size: var(--medium-font-size, 16px);
		font-weight: 600;
		margin-bottom: 12px;
		text-align: center;
		border-bottom: 2px solid var(--primary-primary-700);
		padding-bottom: 6px;
	}
	.hide-scrollbar {
		-ms-overflow-style: none; /* Internet Explorer 10+ */
		scrollbar-width: none; /* Firefox */
	}

	.hide-scrollbar::-webkit-scrollbar {
		display: none; /* Safari and Chrome */
	}
	.duplicate-warning {
		width: 100%;
		max-width: 460px;
		border: 2px solid var(--primary-primary-700);
		border-radius: 6px;
		padding: 12px 16px;
		background-color: var(--secondary-secondary-100);
		display: flex;
		flex-direction: column;
		gap: 8px;
		box-sizing: border-box;
	}
	.warning-title {
		font-family: var(--medium-font-family);
		font-size: 14px;
		font-weight: 600;
		color: var(--primary-primary-700);
	}
	.warning-item {
		font-family: var(--small-medium-font-family);
		font-size: 13px;
		color: var(--gray-gray-950);
	}
	.warning-buttons {
		display: flex;
		gap: 12px;
		justify-content: center;
		margin-top: 4px;
	}
	.warn-cancel {
		background-color: var(--secondary-secondary-200);
		color: var(--gray-gray-950);
		border: 1px solid var(--gray-gray-400);
		border-radius: 4px;
		padding: 4px 16px;
		cursor: pointer;
		font-size: 13px;
		font-family: var(--small-medium-font-family);
	}
	.warn-confirm {
		background-color: var(--primary-primary-700);
		color: var(--gray-gray-50);
		border: none;
		border-radius: 4px;
		padding: 4px 16px;
		cursor: pointer;
		font-size: 13px;
		font-family: var(--small-medium-font-family);
	}
</style>
