// @ts-check

import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://blog.fatalc.cn',
  integrations: [sitemap({
    filter: (page) => !/^\/resume(?:\/|$)/.test(new URL(page).pathname),
  })],

  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },

  vite: {
    plugins: [tailwindcss()],
    build: {
      // mermaid 的图表类型是懒加载 chunk，体积大但不会进首屏
      chunkSizeWarningLimit: 1600,
    },
  },
});
