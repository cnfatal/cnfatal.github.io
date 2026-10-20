const COPY_ICON =
	'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V5a2 2 0 0 1 2-2h10"></path></svg>';
const CHECK_ICON =
	'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';
const WRAP_ICON =
	'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M3 12h13a3 3 0 1 1 0 6h-3"></path><path d="m16 15-3 3 3 3"></path></svg>';

export const createButton = (label: string, icon: string) => {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'code-btn';
	button.setAttribute('aria-label', label);
	button.innerHTML = icon;
	return button;
};

export const createCopyButton = (pre: HTMLPreElement) => {
	const button = createButton('复制代码', COPY_ICON);
	button.addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(pre.innerText);
			button.classList.add('is-done');
			button.innerHTML = CHECK_ICON;
			window.setTimeout(() => {
				button.classList.remove('is-done');
				button.innerHTML = COPY_ICON;
			}, 1500);
		} catch {
			// 剪贴板不可用时保持原样
		}
	});
	return button;
};

export const createWrapButton = (pre: HTMLPreElement) => {
	const button = createButton('切换自动折行', WRAP_ICON);
	button.setAttribute('aria-pressed', 'false');
	button.addEventListener('click', () => {
		const on = pre.classList.toggle('code-wrap');
		button.setAttribute('aria-pressed', String(on));
	});
	return button;
};

for (const pre of document.querySelectorAll<HTMLPreElement>('.prose pre.astro-code')) {
	// mermaid 由自己的脚本接管
	if (pre.dataset.language === 'mermaid') continue;
	if (pre.parentElement?.classList.contains('code-block')) continue;

	const wrapper = document.createElement('div');
	wrapper.className = 'code-block';
	pre.replaceWith(wrapper);
	wrapper.append(pre);

	const bar = document.createElement('div');
	bar.className = 'code-toolbar';
	bar.append(createCopyButton(pre), createWrapButton(pre));
	wrapper.append(bar);
}
