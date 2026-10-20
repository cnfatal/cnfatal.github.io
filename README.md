# blog.fatalc.cn

个人技术博客，基于 [Astro](https://astro.build) 静态生成，样式使用 Tailwind CSS。

## 技术栈

- Astro 7（静态输出）+ Content Collections
- Tailwind CSS 4（`@tailwindcss/vite`）
- `@astrojs/sitemap`

## 本地开发

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # 产物输出到 dist/
npm run preview
```

需要 Node.js >= 22.12。

## 导出简历 PDF

首次使用安装 Chromium：

```sh
npx playwright install chromium
```

导出命令会构建站点，通过临时本地预览服务读取 `/resume/` 的简历内容，在独立文档中使用专用打印样式生成 A4 PDF，完成后自动关闭浏览器和服务。PDF 不加载网站全局 CSS；页边距、配色及分页由打印样式统一控制：

```sh
npm run resume:pdf
npm run resume:pdf -- tmp/resume.pdf # 指定输出路径，相对项目根目录
```

默认输出为 `tmp/张李昆-个人简历.pdf`，打印样式由 `scripts/resume-print.css` 管理。`tmp/` 已忽略，PDF 不进入站点构建或版本控制。运行环境需要可用的中文字体。

## 目录结构

```text
public/                 静态文件，原样复制到站点根目录（CNAME、robots.txt、favicon）
src/components/         通用组件（Header、Footer、PostList 等）
src/content/blog/       文章，一篇一个 .md；图片放在同级 images/ 子目录
  ├── istio/            系列文章放独立目录，目录名即系列 slug
  └── calico/
src/layouts/            页面骨架与文章布局
src/pages/              路由
```

## 写文章

在 `src/content/blog/` 下新建 Markdown 文件，正文第一行用 `# 标题`：

```md
---
published: '2024-05-01'
updated: '2024-06-01' # 可选
tags: ['kubernetes']
featured: false        # 可选：首页精选
---

# 标题

这里是第一段，会被当作摘要显示在列表和 meta 里。
```

- **标题**直接就是正文第一个 `#`，页面不再额外渲染标题，天然不会重复；**摘要**取第一段
- 需要精确控制时，可以在 frontmatter 里写 `title:` / `description:` 覆盖，两者都是可选的
### 文件命名

文件名就是 URL，按下面的规则取：

- 全小写 kebab-case，只含 `a-z0-9-`
- 2–4 个词，不超过 28 字符
- 用名词短语描述主题，避免 `setup`、`practice`、`usage`、`demo` 这类空词
- 要能看出文章具体讲什么，不要只写产品名：`kube-proxy-modes-analysis` 好过 `kube-proxy`，`apisix-startup-analysis` 好过 `apisix`
- 结尾带主题词，常用：`setup`（部署搭建）、`debug`（排障）、`analysis`（原理/源码分析）、`practice`（实践）、`guide`（入门教程）
- 不写日期；系列用数字前缀排序（如 `istio/1-install.md`），前缀不进 URL

例如 `kube-proxy-modes-analysis.md`、`ubuntu-gateway-setup.md`、`calico/2-troubleshooting.md`。

### 系列

把文章放进 `src/content/blog/<系列>/` 即视为同一系列，目录名就是系列名。URL 会带上目录名（`blog/istio/1-install.md` → `/blog/istio/install/`），文章页会自动显示「Istio 系列 · 第 1/2 篇」和上一篇/下一篇。

系列内的顺序由**文件名排序**决定，所以用数字前缀控制（`1-install.md`、`2-bugfix.md`、`10-xxx.md`）；前缀只参与排序，不会出现在 URL 里。没有单独的系列首页。

图片和 Markdown 放在一起，放在文章同级的 `images/` 目录，正文用相对路径引用：

```md
![netfilter](./images/netfilter.png)
```

这样在编辑器里直接预览 Markdown 也能看到图，构建时 Astro 会自动优化并输出到 `/_astro/`。

`public/` 只放不需要处理的静态文件（`CNAME`、`robots.txt`、favicon）。

## 部署

推送到 `main` 后由 `.github/workflows/deploy.yml` 通过 `withastro/action` 构建并发布到 GitHub Pages，自定义域配置在 `public/CNAME`。
