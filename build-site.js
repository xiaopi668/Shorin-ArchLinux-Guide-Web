const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const SRC = process.env.SITE_SRC || __dirname;
const OUT = process.env.SITE_OUT || path.join(__dirname, 'dist');
const REPO = 'SHORiN-KiWATA/Shorin-ArchLinux-Guide';
const BLOB_RE = new RegExp(`https://github\\.com/${REPO}/blob/main/`, 'g');

marked.setOptions({ gfm: true, breaks: false });

// GitHub 风格 heading slugger (per-page 计数器)
let slugCounts = {};
function slugger(text) {
  let s = text.toLowerCase()
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d))
    .replace(/&(amp|lt|gt|quot);/g, (m, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"' })[n])
    .replace(/<[^>]*>/g, '')
    .replace(/[\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F\uFF00-\uFFEF\\'!"#$%&()*+,./:;<=>?@[\]^`{|}~]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!s) s = 'section';
  const n = slugCounts[s] || 0;
  slugCounts[s] = n + 1;
  return n ? `${s}-${n}` : s;
}
const renderer = new marked.Renderer();
renderer.heading = function ({ tokens, depth }) {
  const text = this.parser.parseInline(tokens);
  return `<h${depth} id="${slugger(text)}">${text}</h${depth}>`;
};
marked.use({ renderer });

function walk(dir, list = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, list);
    else list.push(p);
  }
  return list;
}

function firstTitle(md) {
  const m = md.match(/^# (.+)$/m) || md.match(/^## (.+)$/m);
  return m ? m[1].replace(/[*`]/g, '').trim() : '';
}

// rewrite a url found in markdown at mdSrcDir (absolute, in SRC tree)
function rewriteUrl(url, mdSrcDir) {
  let u = url;
  if (BLOB_RE.test(u)) u = u.replace(BLOB_RE, '');
  try { u = decodeURIComponent(u); } catch (e) {}
  const [file, anchor] = u.split('#');
  if (!file) return url;
  const target = path.resolve(mdSrcDir, file);
  if (fs.existsSync(target)) {
    let rel = path.relative(mdSrcDir, target).split(path.sep).join('/');
    if (file.endsWith('.md')) rel = rel.replace(/\.md$/, '.html');
    return anchor ? `${rel}#${anchor}` : rel;
  }
  return url;
}

function rewriteMarkdown(text, mdSrcDir) {
  text = text.replace(/!?\[[^\]]*\]\(([^)\s]+)(\s+[^)]*)?\)/g, (whole, url) => {
    const nu = rewriteUrl(url, mdSrcDir);
    return nu === url ? whole : whole.replace(url, nu);
  });
  text = text.replace(/(href|src)="([^"]+)"/g, (whole, attr, url) => {
    const nu = rewriteUrl(url, mdSrcDir);
    return nu === url ? whole : `${attr}="${nu}"`;
  });
  text = text.replace(/<a href="https:\/\/star-history\.com\/[^"]*"[^>]*>[\s\S]*?<\/a>/,
    `[![GitHub Stars](https://img.shields.io/github/stars/${REPO})](https://github.com/${REPO}) [![GitHub Forks](https://img.shields.io/github/forks/${REPO})](https://github.com/${REPO}) [查看 Star 历史 ↗](https://star-history.com/#${REPO}&Date)`);
  return text;
}

// ---------- build site ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const dir of ['pictures', 'wallpapers', 'wiki']) {
  fs.cpSync(path.join(SRC, dir), path.join(OUT, dir), { recursive: true });
}
fs.copyFileSync(path.join(SRC, 'pictures/shorinarch.png'), path.join(OUT, 'shorinarch.png'));
fs.copyFileSync(path.join(SRC, 'LICENSE'), path.join(OUT, 'LICENSE'));

// ---------- nav ----------
const orderArch = ['安装ArchLinux.md', '手动安装省流版.md', '安装桌面环境前的准备.md',
  '显卡驱动和硬件编解码.md', '快照和系统维护.md', '安装桌面环境或窗口管理器.md',
  '一键配置桌面环境.md', '安装GNOME.md', '安装KDE.md', '安装Niri.md', '安装Labwc.md',
  '中文输入法.md', '软件安装相关.md', '代理.md', '我的GNOME自定义设置.md', '我的KDE自定义设置.md',
  '终端美化.md', 'grub美化.md', '显卡切换.md', '虚拟机.md', 'KVM虚拟机.md', '玩游戏.md',
  '性能优化.md', '小技巧.md', 'issues.md', '附录.md', '交流群.md', 'Arch部署Astrbot.md', '常见争议澄清.md'];
const orderRoot = ['Home.md', '安装任意Linux系统的前期准备工作.md', '活用AI.md', '干净删除Linux.md'];

function buildGroup(srcDir, order, label, icon, outDir) {
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.md'));
  files.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  const items = files.map(name => {
    const md = fs.readFileSync(path.join(srcDir, name), 'utf8');
    const title = firstTitle(md) || name.replace('.md', '');
    const rel = path.relative(OUT, path.join(outDir, name.replace('.md', '.html'))).split(path.sep).join('/');
    return { name, title, rel, md, srcDir };
  });
  return { label, icon, items };
}

const groups = [];
groups.push(buildGroup(path.join(SRC, 'wiki'), orderRoot, '通用', '🧭', path.join(OUT, 'wiki')));
groups.push(buildGroup(path.join(SRC, 'wiki/archlinux'), orderArch, 'Arch Linux', '🐉', path.join(OUT, 'wiki/archlinux')));
groups.push(buildGroup(path.join(SRC, 'wiki/linuxmint'), [], 'Linux Mint', '🌿', path.join(OUT, 'wiki/linuxmint')));
groups.push(buildGroup(path.join(SRC, 'wiki/cachyos'), [], 'CachyOS', '🚀', path.join(OUT, 'wiki/cachyos')));

const flat = [];
groups.forEach(g => g.items.forEach(it => flat.push(it)));
const updateLogRel = '更新日志.html';
flat.push({ title: '更新日志', rel: updateLogRel });

// ---------- template ----------
const css = fs.readFileSync(path.join(__dirname, 'site.css'), 'utf8');
const LOGO_B64 = fs.readFileSync(path.join(SRC, 'pictures/shorinarch.png')).toString('base64');
const LOGO_DATA = `data:image/png;base64,${LOGO_B64}`;

function sidebar(current, prefix) {
  let h = '<div class="sb-search"><input id="sbSearch" type="text" placeholder="🔍 搜索章节..."></div>';
  h += '<h3 class="sb-tip">目录导航</h3><div class="sb-list" id="sbList">';
  h += `<a href="${prefix}index.html" class="${current === 'index.html' ? 'cur' : ''}">🏠 首页 / 项目简介</a>`;
  for (const g of groups) {
    h += `<div class="group">${g.icon} ${g.label}</div>`;
    for (const it of g.items) {
      h += `<a href="${prefix}${it.rel}" title="${it.title}" class="${current === it.rel ? 'cur' : ''}">${it.title}</a>`;
    }
  }
  h += '<div class="group">其他</div>';
  h += `<a href="${prefix}${updateLogRel}" class="${current === updateLogRel ? 'cur' : ''}">更新日志</a>`;
  h += `<a href="https://github.com/SHORiN-KiWATA/Shorin-ArchLinux-Guide" target="_blank">GitHub 仓库 ↗</a></div>`;
  return h;
}

function page(rel, title, bodyHtml, current, prev, next) {
  const isHome = rel === 'index.html';
  const depth = rel.split('/').length - 1;
  const prefix = depth ? '../'.repeat(depth) : '';
  const hero = isHome ? `
  <header class="hero">
    <img class="logo" src="${LOGO_DATA}" alt="SHORiNのARCH Logo">
    <h1>SHORiNのARCH · Arch Linux Guide</h1>
    <div class="subtitle">【2026 最适合新手的 Arch Linux 教程】系统安装 · 双系统 · N卡驱动 · 桌面环境 · 中文输入法 · 玩游戏 · 虚拟机 · 显卡直通</div>
    <div class="badges">
      <a class="badge blue" href="https://space.bilibili.com/9202840" target="_blank">Bilibili · 关注我</a>
      <span class="badge">Platform <b>Arch Linux</b></span>
      <span class="badge">License <b>CC-BY-SA-4.0</b></span>
      <span class="badge"><b>2.3k</b> Stars</span>
      <span class="badge"><b>143</b> Forks</span>
    </div>
  </header>` : `
  <header class="hero mini">
    <a class="brand" href="${prefix}index.html"><img src="${LOGO_DATA}" alt="logo"> SHORiNのARCH</a>
    <div class="crumbs">${title}</div>
  </header>`;
  const pn = (prev || next) ? `<nav class="pn">
    ${prev ? `<a class="prev" href="${prefix}${prev.rel}">← ${prev.title}</a>` : '<span></span>'}
    ${next ? `<a class="next" href="${prefix}${next.rel}">${next.title} →</a>` : ''}
  </nav>` : '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - SHORiNのARCH</title>
<style>${css}</style>
</head>
<body>
<a class="github-corner" href="https://github.com/SHORiN-KiWATA/Shorin-ArchLinux-Guide" target="_blank">
  <svg viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
  GitHub
</a>
${hero}
<div class="layout">
  <nav class="sidebar">${sidebar(current, prefix)}</nav>
  <main>
    ${isHome ? '' : `<h1 class="page-title">${title}</h1>`}
    <article class="markdown-body">${bodyHtml}</article>
    ${pn}
    <footer class="page-foot">SHORiNのARCH · Shorin-ArchLinux-Guide — 以 <a href="${prefix}LICENSE">CC-BY-SA-4.0</a> 许可发布 · <a href="https://github.com/SHORiN-KiWATA/Shorin-ArchLinux-Guide" target="_blank">GitHub 仓库 ↗</a></footer>
  </main>
</div>
<script>
document.getElementById('sbSearch').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#sbList > a').forEach(a => {
    a.style.display = !q || (a.textContent + ' ' + (a.title || '')).toLowerCase().includes(q) ? '' : 'none';
  });
});
document.querySelectorAll('.markdown-body pre').forEach(pre => {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.type = 'button';
  btn.title = '复制';
  const icon = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3 9.5V3.5a.5.5 0 0 1 .5-.5h6"/></svg>';
  const iconOk = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3.5 8.5l3 3 6-6.5"/></svg>';
  btn.innerHTML = icon;
  btn.addEventListener('click', async () => {
    const text = (pre.querySelector('code') || pre).innerText;
    try { await navigator.clipboard.writeText(text); }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    btn.innerHTML = iconOk;
    btn.classList.add('copied');
    btn.title = '已复制';
    setTimeout(() => { btn.innerHTML = icon; btn.classList.remove('copied'); btn.title = '复制'; }, 2000);
  });
  pre.appendChild(btn);
});
</script>
</body>
</html>`;
}

// ---------- render ----------
const pages = [];
for (const g of groups) {
  for (const it of g.items) {
    const outFile = path.join(OUT, it.rel);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    slugCounts = {};
    const md = rewriteMarkdown(it.md, it.srcDir);
    pages.push({ rel: it.rel, title: it.title, body: marked.parse(md) });
  }
}
slugCounts = {};
// 首页：移除 README 顶部重复的 logo 图（页头 hero 已有）、3 个 shields 徽章（hero 已展示），并清理遗留的空行/空段落
let readmeText = fs.readFileSync(path.join(SRC, 'README.md'), 'utf8')
  .replace(/^.*shorinarch\.png.*$/m, '')
  .replace(/^.*img\.shields\.io\/badge\/Bilibili.*$/m, '')
  .replace(/^.*img\.shields\.io\/badge\/Platform.*$/m, '')
  .replace(/^.*img\.shields\.io\/github\/license.*$/m, '')
  .replace(/<div align="center">\s*<\/div>/gi, '')
  .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '')
  .replace(/<p[^>]*>\s*<\/p>/gi, '')
  .replace(/<p[^>]*>\s*<\/p>/gi, '')
  .replace(/\[!\[SHORiNのARCH Logo\]\([^)]*\)\]\([^)]*\)\n?/, '');
const readmeBody = marked.parse(rewriteMarkdown(readmeText, SRC));
pages.push({ rel: 'index.html', title: 'SHORiNのARCH · Arch Linux Guide', body: readmeBody });
slugCounts = {};
const clBody = marked.parse(rewriteMarkdown(fs.readFileSync(path.join(SRC, '更新日志.md'), 'utf8'), SRC));
pages.push({ rel: updateLogRel, title: '更新日志', body: clBody });

for (let i = 0; i < pages.length; i++) {
  const cur = pages[i];
  const prev = i > 0 && cur.rel !== 'index.html' ? pages[i - 1] : null;
  const next = cur.rel === 'index.html' ? flat.find(f => f.rel === 'wiki/Home.html')
    : (cur.rel === updateLogRel ? null : pages[i + 1] || null);
  fs.writeFileSync(path.join(OUT, cur.rel), page(cur.rel, cur.title, cur.body, cur.rel, prev, next));
}

console.log('done, pages:', pages.length);
