import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'astro';
import { chromium } from 'playwright';

const root = new URL('../', import.meta.url);
const resumeFile = fileURLToPath(new URL('../src/pages/resume/index.md', import.meta.url));

// 姓名从简历 frontmatter 的 title 读取，避免在脚本里写死
const frontmatter = (await readFile(resumeFile, 'utf8')).match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
const name = (frontmatter.match(/^title:\s*(.+)$/m)?.[1] ?? 'resume').trim().replace(/^['"]|['"]$/g, '');
const escapeHtml = (value) => value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);

const output = resolve(fileURLToPath(root), process.argv[2] ?? `tmp/${name}-个人简历.pdf`);

await mkdir(dirname(output), { recursive: true });
const browser = await chromium.launch();
try {
  const server = await preview({
    root: fileURLToPath(root),
    server: { host: '127.0.0.1', port: 0, open: false },
    logLevel: 'error',
  });
  try {
    const page = await browser.newPage();
    await page.route('https://www.googletagmanager.com/**', (route) => route.abort());
    const response = await page.goto(`http://127.0.0.1:${server.port}/resume/`);
    if (!response.ok()) {
      throw new Error(`简历页面加载失败：HTTP ${response.status()}`);
    }
    const resume = await page.locator('article').evaluate((article) => article.outerHTML);
    await page.setContent(`<!doctype html>
<html lang="zh-CN">
  <head><meta charset="utf-8"><title>${escapeHtml(name)}</title></head>
  <body><main>${resume}</main></body>
</html>`);
    await page.emulateMedia({ media: 'print' });
    await page.addStyleTag({ path: fileURLToPath(new URL('./resume-print.css', import.meta.url)) });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: output,
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
      tagged: true,
      outline: true,
    });
    console.log(`PDF 已导出：${output}`);
  } finally {
    await server.stop();
  }
} finally {
  await browser.close();
}
