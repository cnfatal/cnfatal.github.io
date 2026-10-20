import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	// Load Markdown files in the `src/content/blog/` directory.
	loader: glob({
		base: './src/content/blog',
		pattern: '**/*.md',
		// 文件名前的数字前缀只用于排序（如 1-install.md），不进 URL
		generateId: ({ entry }) => entry.replace(/\.md$/, '').replace(/(^|\/)\d+[-_]/, '$1'),
	}),
	// Type-check frontmatter using a schema
	schema: z.object({
		// 标题和摘要默认取正文：首个 H1 标题、第一段文字
		title: z.string().optional(),
		description: z.string().optional(),
		// Transform string to Date object
		published: z.coerce.date(),
		updated: z.coerce.date().optional(),
		tags: z.array(z.string()).default([]),
		// 首页「精选」区块
		featured: z.boolean().default(false),
	}),
});

export const collections = { blog };
