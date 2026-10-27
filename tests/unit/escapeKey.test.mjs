import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCloseEscape, closeOnEscape } from '../../src/lib/escapeKey.js';

// KeyboardEvent 의 필요한 부분만: key, keyCode, isComposing, defaultPrevented, preventDefault().
function keydown(key, extra = {}) {
	return {
		key,
		keyCode: key === 'Escape' ? 27 : 0,
		isComposing: false,
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		...extra
	};
}

// addEventListener / removeEventListener 만 있는 노드.
function fakeNode() {
	const listeners = new Set();
	return {
		addEventListener: (type, fn) => type === 'keydown' && listeners.add(fn),
		removeEventListener: (type, fn) => type === 'keydown' && listeners.delete(fn),
		dispatch: (event) => listeners.forEach((fn) => fn(event)),
		count: () => listeners.size
	};
}

test('only an unhandled Escape outside Hangul composition closes', () => {
	assert.equal(isCloseEscape(keydown('Escape')), true);
	assert.equal(isCloseEscape(keydown('Enter')), false);
	assert.equal(isCloseEscape(keydown('Tab')), false);
	assert.equal(isCloseEscape(keydown('Escape', { isComposing: true })), false);
	assert.equal(isCloseEscape(keydown('Escape', { keyCode: 229 })), false);
	assert.equal(isCloseEscape(keydown('Escape', { defaultPrevented: true })), false);
});

test('the action closes on Escape and marks the key handled', () => {
	const node = fakeNode();
	let closed = 0;
	closeOnEscape(node, () => closed++);
	const other = keydown('ArrowDown');
	node.dispatch(other);
	assert.equal(closed, 0);
	assert.equal(other.defaultPrevented, false);
	const escape = keydown('Escape');
	node.dispatch(escape);
	assert.equal(closed, 1);
	assert.equal(escape.defaultPrevented, true);
	node.dispatch(keydown('Escape', { isComposing: true }));
	assert.equal(closed, 1);
});

test('the action calls the newest close and stops listening when destroyed', () => {
	const node = fakeNode();
	const calls = [];
	const action = closeOnEscape(node, () => calls.push('first'));
	action.update(() => calls.push('second'));
	node.dispatch(keydown('Escape'));
	assert.deepEqual(calls, ['second']);
	action.destroy();
	assert.equal(node.count(), 0);
	node.dispatch(keydown('Escape'));
	assert.deepEqual(calls, ['second']);
});
