import type { CollectionEntry } from 'astro:content';

type Post = CollectionEntry<'blog'>;

/**
 * 按发布时间倒序排列；同一天发布的文章按标题排序，保证每次构建顺序一致。
 * `getCollection()` 返回的顺序不保证稳定，所以列表页都要显式排序。
 */
export function byDateDesc(a: Post, b: Post) {
	return (
		b.data.published.valueOf() - a.data.published.valueOf() || titleOf(a).localeCompare(titleOf(b), 'zh')
	);
}

/**
 * 系列由目录决定：`src/content/blog/istio/install.md` 属于 istio 系列，
 * 平铺在 `src/content/blog/` 下的文章不属于任何系列。
 */
export function seriesSlugOf(id: string): string | undefined {
	const [first, ...rest] = id.split('/');
	return rest.length > 0 ? first : undefined;
}

/** 目录名转展示标题：istio -> Istio */
export function seriesTitle(slug: string): string {
	return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** 标题优先取 frontmatter，否则取正文第一个 H1，再退化为文件名 */
export function titleOf(post: Post): string {
	if (post.data.title) return post.data.title;

	const heading = post.body?.match(/^#\s+(.+)$/m);
	if (heading) return heading[1].trim();

	const name = post.id.split('/').pop() ?? post.id;
	return name.replace(/^\d+[-_]/, '');
}

/**
 * 摘要优先取 frontmatter，否则取正文第一段。
 * 会跳过标题、代码块、引用、图片、表格和列表。
 */
export function descriptionOf(post: Post): string {
	if (post.data.description) return post.data.description;

	const blocks = (post.body ?? '')
		.replace(/```[\s\S]*?```/g, '\n\n')
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter((block) => block && !/^(#{1,6}\s|>|!\[|\||<)/.test(block))
		.map((block) => block.replace(/^([-*+]|\d+\.)\s+/gm, ''));

	const picked: string[] = [];
	for (const block of blocks) {
		picked.push(block);
		if (picked.join(' ').length >= MIN_LENGTH) break;
	}

	return summarize(picked.join(' ')) || titleOf(post);
}

const MIN_LENGTH = 40;
const MAX_LENGTH = 120;

function summarize(text: string): string {
	const clean = text
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/`([^`]*)`/g, '$1')
		.replace(/[*_~]{1,2}([^*_~]+)[*_~]{1,2}/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();

	if (clean.length <= MAX_LENGTH) return clean;

	const cut = clean.slice(0, MAX_LENGTH);
	for (const sep of ['。', '！', '？', '；']) {
		const index = cut.lastIndexOf(sep);
		if (index > MAX_LENGTH * 0.6) return cut.slice(0, index + 1);
	}
	return `${cut.trimEnd()}…`;
}

/** 文章页展示系列位置与上下篇导航所需的数据 */
export interface SeriesNav {
	slug: string;
	title: string;
	index: number;
	total: number;
	prev?: { id: string; title: string };
	next?: { id: string; title: string };
}
