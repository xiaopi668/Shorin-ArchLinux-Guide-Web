const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const SRC = process.env.SITE_SRC || __dirname;
const OUT = process.env.SITE_OUT || path.join(__dirname, 'dist');
const REPO = 'SHORiN-KiWATA/Shorin-ArchLinux-Guide';
const BLOB_STR = `https://github.com/${REPO}/blob/main/`;
const BLOB_RE = new RegExp(BLOB_STR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

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
  return m ? m[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').trim() : '';
}

// rewrite a url found in markdown at mdSrcDir (absolute, in SRC tree)
function rewriteUrl(url, mdSrcDir) {
  let u = url;
  if (BLOB_RE.test(u)) u = u.replace(BLOB_RE, '');
  try { u = decodeURIComponent(u); } catch (e) {}
  const [file, anchor] = u.split('#');
  if (!file) return url;
  let target = path.resolve(mdSrcDir, file);
  if (!fs.existsSync(target)) {
    const norm = path.normalize(file).replace(/^(\.\.\/)+/, '');
    target = path.resolve(SRC, norm);
  }
  if (fs.existsSync(target)) {
    let rel = path.relative(SRC, target).split(path.sep).join('/');
    if (file.endsWith('.md')) rel = rel.replace(/\.md$/, '.html');
    return anchor ? `/${rel}#${anchor}` : `/${rel}`;
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
  // 上游原文修正（AM4/AM5 平台混淆、错别字等）
  text = text
    .replace(/AM4（7000系）/g, 'AM5（7000系）')
    .replace(/的的写法/g, '的写法')
    .replace(/配置配置文件/g, '配置文件')
    .replace(/把日志等级为 5/g, '把日志等级设为 5')
    .replace(/exp从\/boot/g, 'ESP 从 /boot')
    .replace(/<details close>/g, '<details>');
  return text;
}

// 更新日志美化：纯文本行 -> ## 日期 + 列表条目
function beautifyChangelog(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l || l === 'gitee' || l === '更新日志：') continue;
    const dm = l.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
    if (dm) {
      out.push(`## ${dm[1]}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`);
      const rest = l.slice(dm[0].length).trim();
      if (rest) out.push(`- ${rest.replace(/^[-*\s]+/, '')}`);
    }
    else out.push(`- ${l.replace(/^[-*\s]+/, '')}`);
  }
  return out.join('\n');
}

// ---------- build site ----------
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const dir of ['pictures', 'wallpapers', 'wiki']) {
  fs.cpSync(path.join(SRC, dir), path.join(OUT, dir), { recursive: true });
}
fs.copyFileSync(path.join(SRC, 'pictures/shorinarch.png'), path.join(OUT, 'shorinarch.png'));
fs.copyFileSync(path.join(SRC, 'LICENSE'), path.join(OUT, 'LICENSE'));
fs.writeFileSync(path.join(OUT, '_redirects'),
  '/wiki/wiki/wiki/* /wiki/:splat 301\n' +
  '/wiki/wiki/* /wiki/:splat 301\n');

// ---------- nav ----------
// 发行版图标：Simple Icons 官方品牌 SVG，构建时随站点输出
const LOGO_DIR = 'pictures/logos';
function groupIcon(name) {
  const file = path.join(SRC, LOGO_DIR, name);
  if (!fs.existsSync(file)) return '';
  return `<img class="grp-icon" src="/${LOGO_DIR}/${name}" alt="" loading="lazy">`;
}

// 流程图步骤图标（Lucide 风格线框，stroke=currentColor）
const STEP_ICONS = {
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  layout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
  gpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  gamepad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>'
};

const ARCH_TREE = [
  { label: '① 安装系统', icon: 'download', entry: '安装ArchLinux.md', items: ['手动安装省流版.md', '安装桌面环境前的准备.md'] },
  { label: '② 选择桌面环境', icon: 'layout', entry: '安装桌面环境或窗口管理器.md', items: ['一键配置桌面环境.md', '安装GNOME.md', '安装KDE.md', '安装Niri.md', '安装Labwc.md', '安装Wayfire.md'] },
  { label: '③ 配置显卡', icon: 'gpu', entry: '显卡驱动和硬件编解码.md', items: ['显卡切换.md', '热切换显卡直通.md'] },
  { label: '④ 基础配置', icon: 'settings', entry: '中文输入法.md', items: ['代理.md', '软件安装相关.md', '快照和系统维护.md'] },
  { label: '⑤ 桌面美化', icon: 'palette', entry: '我的GNOME自定义设置.md', items: ['我的KDE自定义设置.md', 'ShorinNiri功能介绍.md', '终端美化.md', 'grub美化.md'] },
  { label: '⑥ 性能优化', icon: 'zap', entry: '性能优化.md', items: ['小技巧.md'] },
  { label: '⑦ 虚拟化与游戏', icon: 'gamepad', entry: '虚拟机.md', items: ['KVM虚拟机.md', '玩游戏.md'] },
  { label: '⑧ 其他', icon: 'more', entry: '附录.md', items: ['常见争议澄清.md', 'issues.md', 'Arch部署Astrbot.md', '交流群.md'] }
];

const orderArch = ARCH_TREE.map(n => [n.entry].concat(n.items)).flat();
const orderRoot = ['Home.md', '安装任意Linux系统的前期准备工作.md', '活用AI.md', '干净删除Linux.md'];

function buildGroup(srcDir, order, label, icon, outDir, titleFromName, exclude, tree) {
  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.md') && !(exclude || []).includes(f));
  files.sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });
  const items = files.map(name => {
    const md = fs.readFileSync(path.join(srcDir, name), 'utf8');
    const title = titleFromName ? name.replace('.md', '') : (firstTitle(md) || name.replace('.md', ''));
    const rel = path.relative(OUT, path.join(outDir, name.replace('.md', '.html'))).split(path.sep).join('/');
    return { name, title, rel, md, srcDir };
  });
  return { label, icon, items, tree };
}

const groups = [];
groups.push(buildGroup(path.join(SRC, 'wiki'), orderRoot, '通用', groupIcon('generic.svg'), path.join(OUT, 'wiki')));
groups.push(buildGroup(path.join(SRC, 'wiki/archlinux'), orderArch, 'Arch Linux', groupIcon('archlinux.svg'), path.join(OUT, 'wiki/archlinux'), true, [], ARCH_TREE));
groups.push(buildGroup(path.join(SRC, 'wiki/linuxmint'), [], 'Linux Mint', groupIcon('linuxmint.svg'), path.join(OUT, 'wiki/linuxmint')));
groups.push(buildGroup(path.join(SRC, 'wiki/cachyos'), [], 'CachyOS', groupIcon('cachyos.svg'), path.join(OUT, 'wiki/cachyos')));

const flat = [];
groups.forEach(g => g.items.forEach(it => flat.push(it)));
const updateLogRel = '更新日志.html';
flat.push({ title: '更新日志', rel: updateLogRel });

// ---------- template ----------
const css = fs.readFileSync(path.join(__dirname, 'site.css'), 'utf8');
const LOGO_B64 = fs.readFileSync(path.join(SRC, 'pictures/shorinarch.png')).toString('base64');
const LOGO_DATA = `data:image/png;base64,${LOGO_B64}`;

function sidebar(current) {
  let h = '<div class="sb-search"><input id="sbSearch" type="text" placeholder="🔍 搜索章节..."></div>';
  h += '<h3 class="sb-tip">目录导航</h3><div class="sb-list" id="sbList">';
  h += `<a href="/index.html" class="${current === 'index.html' ? 'cur' : ''}">🏠 首页 / 项目简介</a>`;
  for (const g of groups) {
    h += `<div class="group">${g.icon} ${g.label}</div>`;
    if (g.tree) {
      for (const node of g.tree) {
        h += `<div class="group step">${node.label}</div>`;
        for (const name of [node.entry].concat(node.items)) {
          const it = g.items.find(x => x.name === name);
          if (it) h += `<a class="sb-child${current === it.rel ? ' cur' : ''}" href="/${it.rel}" title="${it.title}">${it.title}</a>`;
        }
      }
    } else {
      for (const it of g.items) {
        h += `<a href="/${it.rel}" title="${it.title}" class="${current === it.rel ? 'cur' : ''}">${it.title}</a>`;
      }
    }
  }
  h += '<div class="group">其他</div>';
  h += `<a href="/${updateLogRel}" class="${current === updateLogRel ? 'cur' : ''}">更新日志</a>`;
  h += `<a href="https://github.com/SHORiN-KiWATA/Shorin-ArchLinux-Guide" target="_blank">GitHub 仓库 ↗</a></div>`;
  return h;
}

function page(rel, title, bodyHtml, current, prev, next) {
  const isHome = rel === 'index.html';
  const depth = rel.split('/').length - 1;
  const prefix = depth ? '../'.repeat(depth) : '';
  // 面包屑：站点名 > 分组 > 子组 > 当前页（如 Arch Linux Guide > Arch Linux > 安装系统 > 安装桌面环境前的准备）
  let groupLabel = '';
  let stepLabel = '';
  for (const g of groups) {
    if (!g.items.some(it => it.rel === current)) continue;
    groupLabel = g.label || '';
    if (g.tree) {
      for (const node of g.tree) {
        const names = [node.entry].concat(node.items);
        if (names.some(n => g.items.find(x => x.name === n)?.rel === current)) {
          stepLabel = node.label.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '');
          break;
        }
      }
    }
    break;
  }
  const crumbs = `Arch Linux Guide${groupLabel ? ` > ${groupLabel}` : ''}${stepLabel ? ` > ${stepLabel}` : ''} > ${title}`;
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
    <div class="scroll-hint">向下滚动探索<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6l6 6 6-6"/></svg></div>
  </header>` : `
  <header class="hero mini">
    <a class="brand" href="/index.html"><img src="${LOGO_DATA}" alt="logo"> SHORiNのARCH</a>
    <div class="crumbs">${crumbs}</div>
  </header>`;
  const pn = (prev || next) ? `<nav class="pn">
    ${prev ? `<a class="prev" href="/${prev.rel}">← ${prev.title}</a>` : '<span></span>'}
    ${next ? `<a class="next" href="/${next.rel}">${next.title} →</a>` : ''}
  </nav>` : '';
  // 正文首个 h1 与 page-title 重复时去掉（保留行为准则等特殊 h1）
  if (!isHome) {
    bodyHtml = bodyHtml.replace(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>\s*/, (m, inner) => {
      const t = inner.replace(/<[^>]*>/g, '').trim();
      return t === title ? '' : m;
    });
  }
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="${isHome ? '【2026 最适合新手的 Arch Linux 教程】系统安装 · 双系统 · N卡驱动 · 桌面环境 · 中文输入法 · 玩游戏 · 虚拟机 · 显卡直通' : title + ' - SHORiNのARCH'}">
<title>${title} - SHORiNのARCH</title>
<link rel="icon" href="${LOGO_DATA}">
<script>
(function () {
  var t = null;
  try { t = localStorage.getItem('theme'); } catch (e) {}
  var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  var dark = t === 'dark' || (!t && mq && mq.matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
</script>
<style>${css}</style>
</head>
<body>
<div class="read-progress" aria-hidden="true"><i></i></div>
<div class="top-actions">
  <button class="theme-btn" id="themeBtn" type="button" aria-label="切换主题" title="主题：跟随系统">
    <svg class="ic ic-auto" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
    <svg class="ic ic-dark" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    <svg class="ic ic-light" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
  </button>
  <a class="github-corner" href="https://github.com/SHORiN-KiWATA/Shorin-ArchLinux-Guide" target="_blank">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
    GitHub
  </a>
</div>
<button id="menuBtn" class="menu-btn" type="button" aria-label="打开导航">☰</button>
<button class="to-top" id="toTop" type="button" aria-label="回到顶部" title="回到顶部">
  <svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/></svg>
</button>
${hero}
<div class="layout">
  <nav class="sidebar">${sidebar(current)}</nav>
  <main>
    ${isHome ? '' : `<h1 class="page-title">${title}</h1>`}
    <article class="markdown-body">${bodyHtml}</article>
    ${pn}
    <footer class="page-foot">SHORiNのARCH · Shorin-ArchLinux-Guide — 以 <a href="/LICENSE">CC-BY-SA-4.0</a> 许可发布 · <a href="https://github.com/SHORiN-KiWATA/Shorin-ArchLinux-Guide" target="_blank">GitHub 仓库 ↗</a></footer>
  </main>
</div>
<script>
const progressBar = document.querySelector('.read-progress i');
const toTop = document.getElementById('toTop');
const themeBtn = document.getElementById('themeBtn');
const mqTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
function themeLabel(mode) {
  return mode === 'dark' ? '深色' : mode === 'light' ? '浅色' : '跟随系统';
}
function applyTheme(mode) {
  const html = document.documentElement;
  html.classList.add('theme-anim');
  clearTimeout(applyTheme._t);
  applyTheme._t = setTimeout(() => html.classList.remove('theme-anim'), 400);
  const dark = mode === 'dark' || (!mode && mqTheme && mqTheme.matches);
  html.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (themeBtn) {
    themeBtn.setAttribute('data-mode', mode || 'auto');
    themeBtn.title = '主题：' + themeLabel(mode || 'auto') + '（点击切换）';
  }
}
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    let mode = null;
    try { mode = localStorage.getItem('theme'); } catch (e) {}
    const next = mode === 'dark' ? 'light' : mode === 'light' ? null : 'dark';
    try { next ? localStorage.setItem('theme', next) : localStorage.removeItem('theme'); } catch (e) {}
    applyTheme(next);
  });
  applyTheme((function () { try { return localStorage.getItem('theme'); } catch (e) { return null; } })());
}
if (mqTheme && mqTheme.addEventListener) {
  mqTheme.addEventListener('change', () => {
    let mode = null;
    try { mode = localStorage.getItem('theme'); } catch (e) {}
    if (!mode) applyTheme(null);
  });
}
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    if (progressBar) progressBar.style.width = (p * 100) + '%';
    if (toTop) toTop.classList.toggle('show', window.scrollY > 500);
    ticking = false;
  });
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();
if (toTop) toTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.getElementById('sbSearch').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#sbList > a').forEach(a => {
    a.style.display = !q || (a.textContent + ' ' + (a.title || '')).toLowerCase().includes(q) ? '' : 'none';
  });
  document.querySelectorAll('#sbList > .group.step').forEach(step => {
    let visible = false;
    let el = step.nextElementSibling;
    while (el && !el.classList.contains('group')) {
      if (el.tagName === 'A' && el.style.display !== 'none') { visible = true; break; }
      el = el.nextElementSibling;
    }
    step.style.display = visible ? '' : 'none';
  });
  document.querySelectorAll('#sbList > .group:not(.step)').forEach(group => {
    let visible = false;
    let el = group.nextElementSibling;
    while (el && !(el.classList.contains('group') && !el.classList.contains('step'))) {
      if (el.tagName === 'A' && el.style.display !== 'none') { visible = true; break; }
      el = el.nextElementSibling;
    }
    group.style.display = visible ? '' : 'none';
  });
});
const menuBtn = document.getElementById('menuBtn');
function closeMenu() {
  document.body.classList.remove('menu-open');
  if (menuBtn) menuBtn.textContent = '☰';
}
if (menuBtn) {
  menuBtn.addEventListener('click', () => {
    const open = document.body.classList.toggle('menu-open');
    menuBtn.textContent = open ? '✕' : '☰';
  });
  document.querySelectorAll('.sidebar a').forEach(a => a.addEventListener('click', closeMenu));
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('menu-open')) closeMenu();
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
const qqCopy = document.getElementById('qqCopy');
if (qqCopy) qqCopy.addEventListener('click', async () => {
  const text = document.getElementById('qqNum').textContent;
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  qqCopy.classList.add('copied');
  qqCopy.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3.5 8.5l3 3 6-6.5"/></svg>';
  setTimeout(() => {
    qqCopy.classList.remove('copied');
    qqCopy.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3 9.5V3.5a.5.5 0 0 1 .5-.5h6"/></svg>';
  }, 2000);
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
  .replace(/<br\s*\/?>\s*<br\s*\/?>/g, '')
  .replace(/<div align="center">(?:\s*<br\s*\/?>)*\s*<\/div>/gi, '')
  .replace(/<p[^>]*>\s*<\/p>/gi, '')
  .replace(/<p[^>]*>\s*<\/p>/gi, '')
  .replace(/\[!\[SHORiNのARCH Logo\]\([^)]*\)\]\([^)]*\)\n?/, '');
const readmeBody = marked.parse(rewriteMarkdown(readmeText, SRC));

// 首页目录表格 -> 流程图：识别"章节|小节"表格，转成竖向步骤流
// Arch 表按流程分组（ARCH_TREE）渲染并在选择型步骤标注"几选一"
function archTableToFlow() {
  const arch = groups.find(g => g.label === 'Arch Linux');
  const steps = ARCH_TREE.map(node => {
    const entry = arch.items.find(x => x.name === node.entry);
    const items = node.items.map(n => arch.items.find(x => x.name === n)).filter(Boolean);
    const entryHtml = entry ? `<a href="/${entry.rel}" title="${entry.title}">${entry.title}</a>` : '';
    const itemsHtml = items.length ? `<div class="flow-items">${items.map(it => `<a href="/${it.rel}" title="${it.title}">${it.title}</a>`).join('')}</div>` : '';
    const choice = /选择桌面环境|配置显卡|安装系统/.test(node.label) && items.length > 1
      ? `<span class="flow-choice">${items.length}选1</span>` : '';
    const icon = node.icon && STEP_ICONS[node.icon]
      ? `<span class="flow-icon" aria-hidden="true">${STEP_ICONS[node.icon]}</span>` : '';
    return `<div class="flow-step"><div class="flow-head">${icon}<span class="flow-label">${node.label}</span>${choice}</div>${entryHtml}${itemsHtml}</div>`;
  }).join('<div class="flow-arrow" aria-hidden="true"></div>');
  return `<div class="flow flow-arch">${steps}</div>`;
}
function tableToFlow(html) {
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (whole, inner) => {
    if (!/章节/.test(inner)) return whole;
    const rowCount = (inner.match(/<tr>/g) || []).length;
    if (inner.includes('wiki/archlinux') && rowCount >= 5) return archTableToFlow();
    const rows = [...inner.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
    if (rows.length < 2) return whole;
    const steps = rows.slice(1).map(r => {
      const tds = [...r.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m => m[1]);
      if (tds.length < 2) return null;
      const title = tds[0].replace(/^\s+|\s+$/g, '');
      const items = tds[1].split(/<br\s*\/?>/)
        .map(s => s.replace(/^\s*[-*\s]+\s*/, '').trim())
        .filter(Boolean);
      if (!title || title === '—') return null;
      const itemHtml = items.length ? `<div class="flow-items">${items.join('')}</div>` : '';
      return `<div class="flow-step">${title}${itemHtml}</div>`;
    }).filter(Boolean);
    if (!steps.length) return whole;
    return `<div class="flow">${steps.join('<div class="flow-arrow" aria-hidden="true"></div>')}</div>`;
  });
}
let readmeBodyHtml = tableToFlow(readmeBody);
const contactCard = `<div class="contact-card">
  <h2>💬 交流群</h2>
  <p>遇到问题需要帮助？欢迎加入作者的 Arch QQ 交流群：</p>
  <div class="qq-group">QQ 群号：<b id="qqNum">130515298</b><button class="copy-btn" id="qqCopy" type="button" title="复制"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M3 9.5V3.5a.5.5 0 0 1 .5-.5h6"/></svg></button></div>
  <p>提问前建议先阅读 <a href="https://github.com/ryanhanwu/How-To-Ask-Questions-The-Smart-Way" target="_blank">提问的智慧</a>，学会清晰描述问题。</p>
</div>`;
pages.push({ rel: 'index.html', title: 'SHORiNのARCH · Arch Linux Guide', body: readmeBodyHtml + contactCard });
slugCounts = {};
// 更新日志：上游已删除 更新日志.md，用本地 CHANGELOG.md 兜底（每日 sync 不会被上游删掉）
const clSrc = fs.existsSync(path.join(SRC, '更新日志.md'))
  ? path.join(SRC, '更新日志.md')
  : path.join(SRC, 'CHANGELOG.md');
const clBody = marked.parse(rewriteMarkdown(beautifyChangelog(fs.readFileSync(clSrc, 'utf8')), SRC));
pages.push({ rel: updateLogRel, title: '更新日志', body: clBody });

for (let i = 0; i < pages.length; i++) {
  const cur = pages[i];
  const prev = i > 0 && cur.rel !== 'index.html' ? [...pages.slice(0, i)].reverse().find(p => p.rel !== 'index.html') || null : null;
  const next = cur.rel === 'index.html' ? flat.find(f => f.rel === 'wiki/Home.html')
    : (cur.rel === updateLogRel ? null : pages.slice(i + 1).find(p => p.rel !== 'index.html') || null);
  fs.writeFileSync(path.join(OUT, cur.rel), page(cur.rel, cur.title, cur.body, cur.rel, prev, next));
}

console.log('done, pages:', pages.length);
