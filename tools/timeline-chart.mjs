// tools/timeline-chart.mjs
// 橫向時間軸渲染器（事件上下交錯，虛線連到時間軸圓點）。零 npm 依賴：純 ffmpeg drawbox + drawtext。
// 資料驅動：cases/<slug>/timeline.json。事件依陣列順序由左至右逐一浮現（enable 計時），可重用於任何案件。
// 參考版式：水平時間軸＋里程碑框上下交錯＋虛線接圓點＋日期標籤（對標常見 timeline 圖）。
// 法律對齊（brand/legal-redlines.md）：底部標「時間軸示意圖」；日期/事件須對齊 factcheck，footer 註明來源/不確定。
//
// 兩種用法（與 relations-chart.mjs 一致）：
//   1) 被 make-demo.mjs 匯入：renderTimelineClip({...}) 產出一段 mp4 接管某旁白段畫面。
//   2) 獨立預覽：node tools/timeline-chart.mjs --slug <slug> --preview → web/media/<slug>-timeline-preview.png
//
// timeline.json 結構：
//   { "title": "...", "footer": "...", "highlightIndex": -1,
//     "events": [ { "date": "2/3", "label": "庫恩遇襲・生還" }, ... ] }
import { writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const W = 1920, H = 1080;
const BG = '0x0c1118';                   // 暗底（與 demo 噪色一致）
const AXIS_Y = 540;                      // 時間軸垂直位置（畫面中央）
const X0 = 205, X1 = 1715;               // 第一/最後事件圓點 x（留邊距避免框貼邊）
const AXIS_COLOR = '0x55657a';           // 時間軸與連線色（沉穩灰藍）
const BOX_COLOR = '0x3f5a73';            // 里程碑框頂色條/邊框（板岩藍，與被害人卡同色）
const DOT_COLOR = '0xb8862b';            // 圓點（琥珀）
const HL_DOT = '0x3a7d44';               // 高亮圓點（綠）
const HL_TEXT = '0xd9534f';              // 高亮文字（紅）
const BW = 230, BH = 96, GAP = 70;       // 里程碑框寬/高、框與軸的間距

function textFilter(relTxt, { x, y, size, color, enable, box }) {
  let f = `drawtext=fontfile=fonts/msjh.ttc:textfile=${relTxt}:fontcolor=${color}:fontsize=${size}:x=${x}:y=${y}`;
  if (box) f += `:box=1:boxcolor=0x0c1118cc:boxborderw=8`;
  if (enable) f += `:enable='${enable}'`;
  return f;
}
function boxFilter({ x, y, w, h, color, t, enable }) {
  let f = `drawbox=x=${Math.round(x)}:y=${Math.round(y)}:w=${Math.round(w)}:h=${Math.round(h)}:color=${color}:t=${t}`;
  if (enable) f += `:enable='${enable}'`;
  return f;
}

// 由 timeline 建出 ffmpeg 濾鏡鏈字串 + 須寫出的文字檔清單。
// opts.preview=true → 省略 enable（一次全顯，供出靜態圖確認版面）。
export function buildTimelineFilters(timeline, { durationSec, preview }) {
  const events = (timeline.events || []).slice(0, 9); // 上限 9 事件（版面）
  const n = events.length;
  const hl = (typeof timeline.highlightIndex === 'number') ? timeline.highlightIndex : -1;
  const dotX = (i) => n <= 1 ? (X0 + X1) / 2 : Math.round(X0 + i * (X1 - X0) / (n - 1));

  // 浮現時間：由左至右平均散佈在前 80% 片長
  const span = Math.max(0.1, durationSec * 0.8);
  const step = span / Math.max(1, n);
  const en = (i) => preview ? null : `gte(t,${(0.4 + i * step).toFixed(2)})`;

  const files = {};
  const filters = [];

  // 標題（恆顯）
  files['tlq/_title.txt'] = timeline.title || '時間軸';
  filters.push(textFilter('tlq/_title.txt', { x: '(w-tw)/2', y: 44, size: 52, color: '0x9fc7ee' }));

  // 時間軸主線（恆顯）
  filters.push(boxFilter({ x: X0 - 60, y: AXIS_Y - 2, w: (X1 - X0) + 120, h: 4, color: AXIS_COLOR, t: 'fill' }));

  events.forEach((ev, i) => {
    const isHL = i === hl;
    const x = dotX(i);
    const above = i % 2 === 0;            // 偶數在軸上方、奇數在下方（交錯）
    const e = en(i);
    const boxX = x - BW / 2;
    const boxY = above ? AXIS_Y - GAP - BH : AXIS_Y + GAP;
    // 虛線連接（圓點 ↔ 框）：每 16px 一段、段長 9px、寬 2
    const cy0 = above ? boxY + BH : AXIS_Y;
    const cy1 = above ? AXIS_Y : boxY;
    for (let yy = cy0; yy < cy1; yy += 16) filters.push(boxFilter({ x: x - 1, y: yy, w: 2, h: Math.min(9, cy1 - yy), color: AXIS_COLOR, t: 'fill', enable: e }));
    // 里程碑框（卡底＋頂色條＋邊框）
    filters.push(boxFilter({ x: boxX, y: boxY, w: BW, h: BH, color: '0x0e141c', t: 'fill', enable: e }));
    filters.push(boxFilter({ x: boxX, y: boxY, w: BW, h: 7, color: isHL ? HL_DOT : BOX_COLOR, t: 'fill', enable: e }));
    filters.push(boxFilter({ x: boxX, y: boxY, w: BW, h: BH, color: isHL ? HL_DOT : BOX_COLOR, t: 3, enable: e }));
    const lf = `tlq/l${i}.txt`; files[lf] = String(ev.label || '');
    filters.push(textFilter(lf, { x: `${x}-tw/2`, y: boxY + BH / 2 - 18, size: 30, color: isHL ? HL_TEXT : '0xffffff', enable: e }));
    // 日期標籤：放在軸的「框的對側」——框在上→日期在軸下方；框在下→日期在軸上方
    const df = `tlq/d${i}.txt`; files[df] = String(ev.date || '');
    const dy = above ? AXIS_Y + 16 : AXIS_Y - 16 - 30;
    filters.push(textFilter(df, { x: `${x}-tw/2`, y: dy, size: 30, color: isHL ? HL_TEXT : '0xc9d4df', enable: e }));
    // 圓點（畫在最上層）
    const pf = `tlq/p${i}.txt`; files[pf] = '●';
    filters.push(textFilter(pf, { x: `${x}-tw/2`, y: AXIS_Y - 22, size: 40, color: isHL ? HL_DOT : DOT_COLOR, enable: e }));
  });

  // 底部法律註記（恆顯）
  files['tlq/_foot.txt'] = timeline.footer || '時間軸示意圖 · 依公開來源整理';
  filters.push(textFilter('tlq/_foot.txt', { x: '(w-tw)/2', y: H - 50, size: 26, color: '0x66788c' }));

  filters.push('vignette');
  return { filterChain: filters.join(','), files };
}

function writeFiles(buildDir, files) {
  mkdirSync(join(buildDir, 'tlq'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) writeFileSync(join(buildDir, rel), content, 'utf8');
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });

// 給 make-demo 用：把時間軸渲成一段 mp4（durationSec 秒，事件由左至右逐一浮現）。
export function renderTimelineClip({ outPath, durationSec, timeline, buildDir, fps = 30 }) {
  const { filterChain, files } = buildTimelineFilters(timeline, { durationSec, preview: false });
  writeFiles(buildDir, files);
  sh('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:r=${fps}`,
    '-vf', filterChain, '-t', durationSec.toFixed(3), '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outPath], { cwd: buildDir });
  return outPath;
}

// 獨立預覽：渲一張全圖 PNG（全部事件顯示），供肉眼確認版面
function main() {
  const argv = process.argv;
  const slug = (() => { const i = argv.indexOf('--slug'); return i >= 0 ? argv[i + 1] : 'peter-kurten'; })();
  const TOOLS = dirname(fileURLToPath(import.meta.url));
  const ROOT = dirname(TOOLS);
  const tlPath = join(ROOT, 'cases', slug, 'timeline.json');
  if (!existsSync(tlPath)) { console.error(`找不到 ${tlPath}`); process.exit(1); }
  const timeline = JSON.parse(readFileSync(tlPath, 'utf8'));
  const BUILD = join(TOOLS, 'build');
  mkdirSync(join(BUILD, 'fonts'), { recursive: true });
  const FONT = join(BUILD, 'fonts', 'msjh.ttc');
  if (!existsSync(FONT)) copyFileSync('C:/Windows/Fonts/msjh.ttc', FONT);
  const { filterChain, files } = buildTimelineFilters(timeline, { durationSec: 30, preview: true });
  writeFiles(BUILD, files);
  const out = join(ROOT, 'web', 'media', `${slug}-timeline-preview.png`);
  mkdirSync(dirname(out), { recursive: true });
  sh('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}`, '-vf', filterChain, '-frames:v', '1', out], { cwd: BUILD });
  console.log(`✅ 預覽圖：${out}（${(timeline.events || []).length} 事件）`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
