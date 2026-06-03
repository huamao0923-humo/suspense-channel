// tools/relations-chart.mjs
// 動態人物關係組織圖（org-chart）渲染器。零 npm 依賴：純 ffmpeg drawbox（直角連線）+ drawtext（卡片）。
// 資料驅動：cases/<slug>/relations.json。節點隨旁白逐一浮現（enable 計時），可重用於任何案件。
// 法律對齊（brand/legal-redlines.md）：完全不用真實人臉；每張卡掛 tag（已定罪加害者／涉嫌／被害人）；底部標「關係示意圖」。
//
// 兩種用法：
//   1) 被 make-demo.mjs 匯入：renderChartClip({...}) 產出一段 mp4 接管某旁白段畫面。
//   2) 獨立預覽：node tools/relations-chart.mjs --slug <slug> --preview
//      → 渲一張全圖 PNG 到 web/media/<slug>-relations-preview.png，供肉眼確認版面。
import { writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const W = 1920, H = 1080;
const CARD_W = 400, CARD_H = 144, H_GAP = 56, V_GAP = 104, TOP_Y = 190;
const BASE_X = 90;                       // col=0 卡片左緣
const UNIT = CARD_W + H_GAP;             // 一個 col 的水平間距
const BG = '0x0c1118';                   // 暗底（與 demo 噪色一致）
const EDGE_COLOR = '0x55657a';           // 連線顏色（沉穩灰藍）

// 角色 → 卡片色碼（一眼分辨身份；未定罪者用琥珀「涉嫌」）
const TAG_COLOR = [
  [/已定罪|定讞|認罪|加害|主謀|共犯/, '0x8b2f2f'], // 深紅：已定罪/認罪之加害者
  [/涉嫌|被指控|嫌疑/, '0xb8862b'],               // 琥珀：未定罪者
  [/被害|受害/, '0x3f5a73'],                       // 板岩藍：被害人
  [/證人|目擊/, '0x4a4a52'],                       // 灰：證人
];
const tagColor = (tag) => { for (const [re, c] of TAG_COLOR) if (re.test(tag || '')) return c; return '0x2a3340'; };

const colLeft = (col) => BASE_X + col * UNIT;
const layerTop = (layer) => TOP_Y + layer * (CARD_H + V_GAP);

// drawtext 以 textfile 帶 CJK（規避引號/轉義），路徑相對 buildDir
function textFilter(relTxt, { x, y, size, color, enable, box }) {
  let f = `drawtext=fontfile=fonts/msjh.ttc:textfile=${relTxt}:fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}`;
  if (box) f += `:box=1:boxcolor=0x0c1118cc:boxborderw=8`;
  if (enable) f += `:enable='${enable}'`;
  return f;
}
function boxFilter({ x, y, w, h, color, t, enable }) {
  let f = `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}:t=${t}`;
  if (enable) f += `:enable='${enable}'`;
  return f;
}

// 由 relations 建出 ffmpeg 濾鏡鏈字串 + 須寫出的文字檔清單。
// opts.preview=true → 全部省略 enable（一次全顯，供出靜態圖確認版面）。
export function buildChartFilters(relations, { qdir, durationSec, preview }) {
  const nodes = relations.nodes || [];
  const edges = relations.edges || [];

  // 版面：每個節點的 left/top/center（先算好，byId 再指向同一物件，避免 edge 取到未定值→NaN）
  const byId = {};
  nodes.forEach((n, i) => {
    const col = (typeof n.col === 'number') ? n.col : 0;
    n.i = i; n._x = colLeft(col); n._y = layerTop(n.layer || 0); n._cx = n._x + CARD_W / 2;
    byId[n.id] = n;
  });

  // 浮現時間：依陣列順序（我在 json 裡照旁白順序排）平均散佈在前 80% 片長
  const span = Math.max(0.1, durationSec * 0.8);
  const step = span / Math.max(1, nodes.length);
  const revealAt = (i) => 0.4 + i * step;
  const en = (i) => preview ? null : `gte(t,${revealAt(i).toFixed(2)})`;

  const files = {};        // relPath -> content
  const filters = [];

  // 標題（恆顯）
  files['relq/_title.txt'] = relations.title || '人物關係圖';
  filters.push(textFilter('relq/_title.txt', { x: '(w-tw)/2', y: 48, size: 54, color: '0x9fc7ee' }));

  // 連線（畫在卡片底下）：直角三段，與子節點同時浮現
  edges.forEach((e, k) => {
    const p = byId[e.from], c = byId[e.to];
    if (!p || !c) return;
    const pbx = p._cx, pby = p._y + CARD_H;     // 父：底部中央
    const ctx = c._cx, cty = c._y;              // 子：頂部中央
    const midY = Math.round((pby + cty) / 2);
    const en2 = en(c.i);
    filters.push(boxFilter({ x: Math.round(pbx) - 1, y: pby, w: 3, h: midY - pby, color: EDGE_COLOR, t: 'fill', enable: en2 }));            // 垂直下
    filters.push(boxFilter({ x: Math.round(Math.min(pbx, ctx)) - 1, y: midY - 1, w: Math.abs(ctx - pbx) + 3, h: 3, color: EDGE_COLOR, t: 'fill', enable: en2 })); // 水平
    filters.push(boxFilter({ x: Math.round(ctx) - 1, y: midY, w: 3, h: cty - midY, color: EDGE_COLOR, t: 'fill', enable: en2 }));            // 垂直接子
    if (e.label) {
      const lf = `relq/e${k}.txt`; files[lf] = e.label;
      filters.push(textFilter(lf, { x: `${Math.round((pbx + ctx) / 2)}-tw/2`, y: midY - 30, size: 24, color: '0x8ea3b8', box: true, enable: en2 }));
    }
  });

  // 卡片（底下文字在上）
  nodes.forEach((n, i) => {
    const col = tagColor(n.tag);
    const e = en(i);
    filters.push(boxFilter({ x: n._x, y: n._y, w: CARD_W, h: CARD_H, color: '0x0e141c', t: 'fill', enable: e }));   // 卡底
    filters.push(boxFilter({ x: n._x, y: n._y, w: CARD_W, h: 8, color: col, t: 'fill', enable: e }));               // 頂色條
    filters.push(boxFilter({ x: n._x, y: n._y, w: CARD_W, h: CARD_H, color: col, t: 3, enable: e }));               // 邊框
    const cx = n._cx;
    const nf = `relq/n${i}.txt`; files[nf] = n.name || '';
    filters.push(textFilter(nf, { x: `${cx}-tw/2`, y: n._y + 26, size: 40, color: '0xffffff', enable: e }));
    if (n.tag) { const tf = `relq/t${i}.txt`; files[tf] = n.tag; filters.push(textFilter(tf, { x: `${cx}-tw/2`, y: n._y + 78, size: 24, color: col, enable: e })); }
    if (n.trait) { const rf = `relq/r${i}.txt`; files[rf] = n.trait; filters.push(textFilter(rf, { x: `${cx}-tw/2`, y: n._y + 110, size: 22, color: '0x9aa7b5', enable: e })); }
  });

  // 底部法律註記（恆顯）
  files['relq/_foot.txt'] = relations.footer || '關係示意圖 · 未定罪者標示「涉嫌」';
  filters.push(textFilter('relq/_foot.txt', { x: '(w-tw)/2', y: H - 54, size: 26, color: '0x66788c' }));

  filters.push('vignette');
  return { filterChain: filters.join(','), files, qdir };
}

// 寫出文字檔（相對 buildDir）
function writeFiles(buildDir, files) {
  mkdirSync(join(buildDir, 'relq'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) writeFileSync(join(buildDir, rel), content, 'utf8');
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });

// 給 make-demo 用：把組織圖渲成一段 mp4（durationSec 秒，節點逐一浮現）。outPath 為最終 clip。
export function renderChartClip({ outPath, durationSec, relations, buildDir, fps = 30 }) {
  const { filterChain, files } = buildChartFilters(relations, { durationSec, preview: false });
  writeFiles(buildDir, files);
  sh('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:r=${fps}`,
    '-vf', filterChain, '-t', durationSec.toFixed(3), '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outPath], { cwd: buildDir });
  return outPath;
}

// 獨立預覽：渲一張全圖 PNG（全部節點顯示），供肉眼確認版面
function main() {
  const argv = process.argv;
  const slug = (() => { const i = argv.indexOf('--slug'); return i >= 0 ? argv[i + 1] : 'snowtown-murders'; })();
  const TOOLS = dirname(fileURLToPath(import.meta.url));
  const ROOT = dirname(TOOLS);
  const relPath = join(ROOT, 'cases', slug, 'relations.json');
  if (!existsSync(relPath)) { console.error(`找不到 ${relPath}`); process.exit(1); }
  const relations = JSON.parse(readFileSync(relPath, 'utf8'));
  const BUILD = join(TOOLS, 'build');
  mkdirSync(join(BUILD, 'fonts'), { recursive: true });
  const FONT = join(BUILD, 'fonts', 'msjh.ttc');
  if (!existsSync(FONT)) copyFileSync('C:/Windows/Fonts/msjh.ttc', FONT);
  const { filterChain, files } = buildChartFilters(relations, { durationSec: 30, preview: true });
  writeFiles(BUILD, files);
  const out = join(ROOT, 'web', 'media', `${slug}-relations-preview.png`);
  mkdirSync(dirname(out), { recursive: true });
  sh('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}`, '-vf', filterChain, '-frames:v', '1', out], { cwd: BUILD });
  console.log(`✅ 預覽圖：${out}（${(relations.nodes || []).length} 節點 / ${(relations.edges || []).length} 連線）`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
