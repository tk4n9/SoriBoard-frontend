// 사부-제자 계보: builds the family trees from /api/user and lays them out in one chart,
// one row per 입부 학기.

// 학번 "19" → 2019, "98" → 1998 (a 학번 past this year's is from the 1900s)
function admissionYear(user) {
	const digits = String(user.year_id ?? '').trim();
	if (!/^\d{1,2}$/.test(digits)) return null;
	const yy = Number(digits);
	return yy > new Date().getFullYear() % 100 ? 1900 + yy : 2000 + yy;
}

function joinKey(user) {
	// Earlier 입부 first. Without a 입부 년도 the 학번 stands in for it; without both, last.
	const admitted = admissionYear(user) ?? Infinity;
	const year = Number.isFinite(user.join_year) ? user.join_year : admitted;
	const semester = Number.isFinite(user.join_semester) ? user.join_semester : Infinity;
	return [year, semester, admitted];
}

export function compareMembers(a, b) {
	const ka = joinKey(a);
	const kb = joinKey(b);
	for (let i = 0; i < ka.length; i++) {
		if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
	}
	return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko') || a.id - b.id;
}

const byMember = (a, b) => compareMembers(a.user, b.user);

// users: the /api/user list ({id, name, sabu_id, ...}).
// Returns
//   families: trees with at least one 사부-제자 link, oldest root first,
//   loners: members with neither 사부 nor 제자,
//   byId: Map id -> node ({user, parent, children, root, depth}),
//   cut: members whose 사부 link was ignored (it pointed to themselves, to a member
//        missing from the list, or closed a loop), so that every member is drawn once.
export function buildLineage(users) {
	const byId = new Map();
	for (const user of users) {
		byId.set(user.id, { user, parent: null, children: [], root: null, depth: 0 });
	}
	const cut = [];
	for (const node of byId.values()) {
		const sabuId = node.user.sabu_id;
		if (sabuId === null || sabuId === undefined || sabuId === '') continue;
		const sabu = byId.get(Number(sabuId));
		if (!sabu || sabu === node) {
			cut.push({ node, reason: sabu ? 'self' : 'missing' });
			continue;
		}
		node.parent = sabu;
	}
	// A loop (A's 사부 is B, B's 사부 is A) has no top: cut it at its earliest member
	const state = new Map(); // node -> 1 visiting, 2 done
	for (const start of byId.values()) {
		const path = [];
		let node = start;
		while (node && !state.has(node)) {
			state.set(node, 1);
			path.push(node);
			node = node.parent;
		}
		if (node && state.get(node) === 1) {
			const loop = path.slice(path.indexOf(node));
			const top = loop.slice().sort((a, b) => compareMembers(a.user, b.user))[0];
			top.parent = null;
			cut.push({ node: top, reason: 'loop', loop: loop.map((n) => n.user) });
		}
		for (const visited of path) state.set(visited, 2);
	}
	for (const node of byId.values()) {
		if (node.parent) node.parent.children.push(node);
	}
	const roots = [];
	for (const node of byId.values()) {
		node.children.sort(byMember);
		if (!node.parent) roots.push(node);
	}
	roots.sort(byMember);

	const families = [];
	const loners = [];
	for (const root of roots) {
		if (root.children.length === 0) {
			root.root = root;
			loners.push(root);
			continue;
		}
		let size = 0;
		let generations = 0;
		let firstYear = Infinity;
		let lastYear = -Infinity;
		const stack = [root];
		root.depth = 0;
		while (stack.length) {
			const node = stack.pop();
			node.root = root;
			size += 1;
			generations = Math.max(generations, node.depth + 1);
			if (Number.isFinite(node.user.join_year)) {
				firstYear = Math.min(firstYear, node.user.join_year);
				lastYear = Math.max(lastYear, node.user.join_year);
			}
			for (const child of node.children) {
				child.depth = node.depth + 1;
				stack.push(child);
			}
		}
		families.push({
			root,
			size,
			generations,
			firstYear: Number.isFinite(firstYear) ? firstYear : null,
			lastYear: Number.isFinite(lastYear) ? lastYear : null
		});
	}
	return { families, loners, byId, cut };
}

// One row per 입부 학기, the newest at the top; members without a 입부 년도 share the bottom row.
// A year without a 학기 sits just below that year's other rows.
export function semesterOf(user) {
	if (!Number.isFinite(user.join_year)) return { key: '?', year: null, semester: null };
	const semester = Number.isFinite(user.join_semester) ? user.join_semester : null;
	return { key: `${user.join_year}-${semester ?? ''}`, year: user.join_year, semester };
}

function newerFirst(a, b) {
	if (a.year === null || b.year === null) return (a.year === null) - (b.year === null);
	if (a.year !== b.year) return b.year - a.year;
	if (a.semester === b.semester) return 0;
	return (b.semester ?? -Infinity) - (a.semester ?? -Infinity);
}

// Widen the outline at one row-or-gap level to take in [left, right]
function extend(outline, level, left, right) {
	const at = outline.get(level);
	if (!at) outline.set(level, [left, right]);
	else {
		at[0] = Math.min(at[0], left);
		at[1] = Math.max(at[1], right);
	}
}

// The whole 지기 list in one chart, bottom-up: every member in their 입부 학기's row and every
// 사부 below their 제자, so the newest members are on top. Each 사부 is centred under their
// 제자, packed against each other as closely as their outlines allow; the outlines include the
// lines, so no line crosses a card or another line. The subtrees then go wherever they fit,
// a row of space apart.
// A 제자 whose row is not above their 사부's (입부 the same 학기 or earlier, or not recorded) cannot
// hang from them; they start a subtree of their own and are listed in `detached`.
// Returns { width, height, rows: [{key, year, semester, top, count}], boxes: [{node, x, y, row}],
// links: [{from, to, d}], detached } in px; the boxes come row by row, left to right.
export function layoutChart(lineage, { nodeWidth, nodeHeight, gapX, gapY, padding = 0 }) {
	const nodes = [...lineage.byId.values()];
	const rowHeight = nodeHeight + gapY;
	const half = nodeWidth / 2;

	const rows = [];
	const rowOfKey = new Map();
	for (const node of nodes) {
		const semester = semesterOf(node.user);
		if (!rowOfKey.has(semester.key)) {
			const row = { ...semester, top: 0, count: 0 };
			rowOfKey.set(semester.key, row);
			rows.push(row);
		}
		rowOfKey.get(semester.key).count += 1;
	}
	rows.sort(newerFirst);
	rows.forEach((row, index) => {
		row.index = index;
		row.top = index * rowHeight;
	});
	const rowOf = new Map(nodes.map((node) => [node, rowOfKey.get(semesterOf(node.user).key)]));
	// Levels: 2 × row index for a row of cards, one less for the gap above it (where the lines meet)
	const level = (node) => 2 * rowOf.get(node).index;

	const hangs = (node) => node.parent && level(node.parent) > level(node);
	const kids = new Map(nodes.map((node) => [node, node.children.filter(hangs)]));
	const detached = nodes.filter((node) => node.parent && !hangs(node)).sort(byMember);

	// Subtree tops: each lineage's root, then any detached 제자 in it
	const tops = [];
	const stack = nodes
		.filter((node) => !node.parent)
		.sort(byMember)
		.reverse();
	while (stack.length) {
		const node = stack.pop();
		if (!hangs(node)) tops.push(node);
		for (let k = node.children.length - 1; k >= 0; k--) stack.push(node.children[k]);
	}

	// Pass 1 (제자 first): each subtree's outline, [leftmost, rightmost] per level relative to its
	// top's centre, and each 제자's offset from their 사부
	const outline = new Map();
	const offset = new Map();
	const post = [];
	for (const top of tops) {
		const walk = [top];
		while (walk.length) {
			const node = walk.pop();
			post.push(node);
			walk.push(...kids.get(node));
		}
	}
	for (let i = post.length - 1; i >= 0; i--) {
		const node = post[i];
		const own = level(node);
		const shape = new Map([[own, [-half, half]]]);
		const children = kids.get(node);
		if (children.length) {
			const merged = new Map();
			const at = [];
			children.forEach((child, k) => {
				const sub = outline.get(child);
				outline.delete(child);
				// The 제자's line runs down to the 사부's gap, where it meets the others
				for (let l = level(child) + 1; l < own; l++) extend(sub, l, 0, 0);
				let x = 0;
				if (k > 0) {
					x = -Infinity; // every line reaches the gap, so some level is always shared
					for (const [l, [left]] of sub) {
						const there = merged.get(l);
						if (there) x = Math.max(x, there[1] + gapX - left);
					}
				}
				at.push(x);
				for (const [l, [left, right]] of sub) extend(merged, l, left + x, right + x);
			});
			const centre = (at[0] + at[at.length - 1]) / 2;
			children.forEach((child, k) => offset.set(child, at[k] - centre));
			for (const [l, [left, right]] of merged) extend(shape, l, left - centre, right - centre);
		}
		outline.set(node, shape);
	}

	// Pass 2: subtrees from the largest down, each at the leftmost place where it fits among
	// the ones placed before; a different subtree also stays clear of the rows just above and
	// below it. The largest go first so the small ones (most often single members) fill the gaps.
	const size = new Map();
	for (let i = post.length - 1; i >= 0; i--) {
		const node = post[i];
		size.set(
			node,
			kids.get(node).reduce((sum, child) => sum + size.get(child), 1)
		);
	}
	const newest = (top) => Math.min(...outline.get(top).keys());
	tops.sort((a, b) => size.get(b) - size.get(a) || newest(a) - newest(b));
	const separation = 2 * gapX;
	const taken = new Map(); // level -> [[left, right], ...]
	const around = (l) => [l - 2, l - 1, l, l + 1, l + 2].flatMap((near) => taken.get(near) ?? []);
	const centre = new Map();
	for (const top of tops) {
		const shape = [...outline.get(top)];
		const least = Math.max(...shape.map(([, [left]]) => -left)); // no card left of the chart
		const candidates = [least];
		for (const [l, [left]] of shape) {
			for (const [, right] of around(l)) candidates.push(right + separation - left);
		}
		const fits = (x) =>
			shape.every(([l, [left, right]]) =>
				around(l).every(
					([from, to]) => x + left >= to + separation || x + right <= from - separation
				)
			);
		const x = candidates
			.filter((candidate) => candidate >= least)
			.sort((a, b) => a - b)
			.find(fits);
		for (const [l, [left, right]] of shape) {
			if (!taken.has(l)) taken.set(l, []);
			taken.get(l).push([left + x, right + x]);
		}
		centre.set(top, x);
		const walk = [top];
		while (walk.length) {
			const node = walk.pop();
			for (const child of kids.get(node)) {
				centre.set(child, centre.get(node) + offset.get(child));
				walk.push(child);
			}
		}
	}

	let width = 0;
	const position = new Map();
	const boxes = nodes.map((node) => {
		const row = rowOf.get(node);
		const box = {
			node,
			row,
			x: padding + Math.round(centre.get(node) - half),
			y: row.top + gapY / 2
		};
		width = Math.max(width, box.x + nodeWidth + padding);
		position.set(node, box);
		return box;
	});
	boxes.sort((a, b) => a.row.index - b.row.index || a.x - b.x);
	const links = [];
	for (const box of boxes) {
		for (const child of kids.get(box.node)) {
			const to = position.get(child);
			const fromX = box.x + half;
			links.push({
				from: box.node,
				to: child,
				d: `M${fromX},${box.y}V${box.y - gapY / 2}H${to.x + half}V${to.y + nodeHeight}`
			});
		}
	}
	return { width, height: rows.length * rowHeight, rows, boxes, links, detached };
}

// The selected member, their 사부 line up to the root, and everyone below them
export function lineageOf(node) {
	const ids = new Set();
	for (let n = node; n; n = n.parent) ids.add(n.user.id);
	const stack = [...node.children];
	while (stack.length) {
		const n = stack.pop();
		ids.add(n.user.id);
		stack.push(...n.children);
	}
	return ids;
}

export function descendantCount(node) {
	let count = 0;
	const stack = [...node.children];
	while (stack.length) {
		const n = stack.pop();
		count += 1;
		stack.push(...n.children);
	}
	return count;
}

// The members `node` can take as 사부, in name order: not the member, and not anyone whose 사부
// line as recorded leads back to them, as the new link would close a loop. The current 사부
// stays a choice while their line is drawn, even when an older loop runs through them.
export function sabuChoices(lineage, node) {
	const { byId } = lineage;
	const recorded = (n) => {
		const id = n.user.sabu_id;
		if (id === null || id === undefined || id === '') return null;
		return byId.get(Number(id)) ?? null;
	};
	const blocked = new Set([node]);
	const clear = new Set();
	for (const start of byId.values()) {
		const path = new Set();
		let n = start;
		while (n && !blocked.has(n) && !clear.has(n) && !path.has(n)) {
			path.add(n);
			n = recorded(n);
		}
		const into = n && blocked.has(n) ? blocked : clear;
		for (const visited of path) into.add(visited);
	}
	return [...byId.values()]
		.filter((n) => !blocked.has(n) || n === node.parent)
		.sort(
			(a, b) =>
				String(a.user.name ?? '').localeCompare(String(b.user.name ?? ''), 'ko') ||
				compareMembers(a.user, b.user)
		);
}
