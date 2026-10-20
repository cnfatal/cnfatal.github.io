const triggers = [...document.querySelectorAll<HTMLElement>('[data-to-top]')];
const floating = document.getElementById('to-top');
const footer = document.querySelector('footer');

const scrollToTop = () => {
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
};

for (const trigger of triggers) trigger.addEventListener('click', scrollToTop);

if (floating) {
	let footerVisible = false;

	const update = () => {
		// 滚过一屏、且页脚还没进入视口时才显示
		floating.classList.toggle('is-visible', window.scrollY > 600 && !footerVisible);
	};

	if (footer) {
		new IntersectionObserver(([entry]) => {
			footerVisible = entry.isIntersecting;
			update();
		}).observe(footer);
	}

	window.addEventListener('scroll', update, { passive: true });
	update();
}
