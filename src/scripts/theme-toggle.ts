const root = document.documentElement;
const trigger = document.getElementById('theme-toggle');
const panel = document.getElementById('theme-panel');

if (trigger && panel) {
	const options = [...panel.querySelectorAll<HTMLButtonElement>('[data-theme-option]')];
	const media = matchMedia('(prefers-color-scheme: dark)');
	const labelOf = (mode: string) =>
		options.find((option) => option.dataset.themeOption === mode)?.textContent?.trim() ?? mode;

	const setOpen = (open: boolean) => {
		panel.hidden = !open;
		trigger.setAttribute('aria-expanded', String(open));
	};

	const apply = (mode: string, persist = true) => {
		if (persist) {
			if (mode === 'auto') localStorage.removeItem('theme');
			else localStorage.setItem('theme', mode);
		}

		const dark = mode === 'dark' || (mode === 'auto' && media.matches);
		if (root.classList.contains('dark') !== dark) {
			// 切换期间统一过渡，避免背景和文字不同步
			root.classList.add('theme-anim');
			void root.offsetWidth;
			root.classList.toggle('dark', dark);
			window.setTimeout(() => root.classList.remove('theme-anim'), 350);
		}

		root.dataset.themeMode = mode;
		trigger.setAttribute('aria-label', `主题：${labelOf(mode)}`);
		for (const option of options) {
			option.setAttribute('aria-checked', String(option.dataset.themeOption === mode));
		}
	};

	trigger.addEventListener('click', () => setOpen(panel.hidden));

	for (const option of options) {
		option.addEventListener('click', () => {
			apply(option.dataset.themeOption ?? 'auto');
			setOpen(false);
			trigger.focus();
		});
	}

	document.addEventListener('click', (event) => {
		const target = event.target;
		const inside = target instanceof Node && (panel.contains(target) || trigger.contains(target));
		if (!panel.hidden && !inside) setOpen(false);
	});

	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && !panel.hidden) {
			setOpen(false);
			trigger.focus();
		}
	});

	media.addEventListener('change', (event) => {
		if (root.dataset.themeMode === 'auto') root.classList.toggle('dark', event.matches);
	});

	apply(root.dataset.themeMode ?? 'auto', false);
}
