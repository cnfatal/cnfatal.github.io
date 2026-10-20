import { createButton, createCopyButton, createWrapButton } from './code-toolbar';

const blocks = document.querySelectorAll<HTMLPreElement>('pre[data-language="mermaid"]');

if (blocks.length > 0) {
	const CODE_ICON =
		'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 6-6 6 6 6M16 6l6 6-6 6"></path></svg>';
	const CHART_ICON =
		'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect><path d="M10 6h4a4 4 0 0 1 4 4v4"></path></svg>';

	try {
		const { default: mermaid } = await import('mermaid');

		mermaid.initialize({
			startOnLoad: false,
			theme: document.documentElement.classList.contains('dark') ? 'dark' : 'neutral',
		});

		for (const pre of blocks) {
			const source = pre.textContent ?? '';

			const wrapper = document.createElement('div');
			wrapper.className = 'mermaid-block';

			const chart = document.createElement('div');
			chart.className = 'mermaid';
			chart.textContent = source;

			const bar = document.createElement('div');
			bar.className = 'code-toolbar';

			const toggle = createButton('显示源码', CODE_ICON);
			toggle.setAttribute('aria-pressed', 'false');

			bar.append(toggle, createCopyButton(pre), createWrapButton(pre));

			pre.hidden = true;
			(pre.closest('.code-block') ?? pre).replaceWith(wrapper);
			wrapper.append(chart, pre, bar);

			toggle.addEventListener('click', () => {
				const showSource = pre.hidden;
				pre.hidden = !showSource;
				chart.hidden = showSource;
				toggle.innerHTML = showSource ? CHART_ICON : CODE_ICON;
				toggle.setAttribute('aria-pressed', String(showSource));
				toggle.setAttribute('aria-label', showSource ? '显示图表' : '显示源码');
			});
		}

		await mermaid.run({ querySelector: '.mermaid' });
	} catch (error) {
		console.warn('[mermaid] 渲染失败', error);
		for (const pre of blocks) pre.hidden = false;
	}
}
