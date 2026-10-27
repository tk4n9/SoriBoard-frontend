// 모달이 아닌 패널(통계 drill-down 등)을 Escape 로 닫는다: 포커스가 패널 안에 있을 때만.
// 한글 조합 중의 Escape (조합 취소) 와 다른 곳이 이미 처리한 Escape 는 건너뛴다(dialogFocus.js 와 같다).

/** @param {KeyboardEvent} event */
export function isCloseEscape(event) {
	return (
		event.key === 'Escape' && !event.defaultPrevented && !event.isComposing && event.keyCode !== 229
	);
}

// use:closeOnEscape={close}
/**
 * @param {HTMLElement} node
 * @param {() => void} close
 */
export function closeOnEscape(node, close) {
	/** @param {KeyboardEvent} event */
	const onKeydown = (event) => {
		if (!isCloseEscape(event)) return;
		event.preventDefault();
		close();
	};
	node.addEventListener('keydown', onKeydown);
	return {
		/** @param {() => void} newClose */
		update(newClose) {
			close = newClose;
		},
		destroy() {
			node.removeEventListener('keydown', onKeydown);
		}
	};
}
