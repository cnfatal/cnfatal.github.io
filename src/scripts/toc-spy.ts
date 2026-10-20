const links = [...document.querySelectorAll<HTMLAnchorElement>('a[data-toc]')];
const headings = links
	.map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
	.filter((heading): heading is HTMLElement => Boolean(heading));

if (headings.length > 0) {
	const setActive = (id: string) => {
		for (const link of links) {
			const active = decodeURIComponent(link.hash.slice(1)) === id;
			link.classList.toggle('is-active', active);
			// 只滚动侧边目录自身，别把页面拽走（文章内的折叠目录在文档流里）
			if (active && link.closest('aside')) link.scrollIntoView({ block: 'nearest' });
		}
	};

	const update = () => {
		// 视口上方最近的那个标题就是当前章节
		let current = headings[0].id;
		for (const heading of headings) {
			if (heading.getBoundingClientRect().top <= 120) current = heading.id;
		}
		setActive(current);
	};

	window.addEventListener('scroll', update, { passive: true });
	update();
}
