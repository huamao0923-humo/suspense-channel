// tools/stats-chart.mjs
// 統計長條圖渲染器（橫向 bar chart）。零 npm 依賴：純 ffmpeg drawbox + drawtext。
// 資料驅動：cases/<slug>/stats.json。長條依陣列順序逐一浮現（enable 計時），可重用於任何案件。
// 法律對齊（brand/legal-redlines.md）：底部標「統計示意圖」；數字須對齊 factcheck，footer 註明來源/不確定。
//
// 兩種用法（與 relations-chart.mjs 一致）：
//   1) 被 make-demo.mjs 匯入：renderStatsClip({...}) 產出一段 mp4 接管某旁白段畫面。
//   2) 獨立預覽：node tools/stats-chart.mjs --slug <slug> --preview
//      → 渲一張全圖 PNG 到 web/media/<slug>-stats-preview.png，供肉眼確認版面。
//
// stats.json 結構：
//   { "title": "...", "footer": "...", "unit": " 人", "showOnNarrIndex": [9],
//     "bars": [ { "label": "2 月", "value": 3 }, ... ] }
import { writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const W = 1920, H = 1080;
const BG = '0x0c1118';                   // 暗底（與 demo 噪色一致）
const BAR_COLOR = '0x3f5a73';            // 板岩藍（與關係圖被害人同色＝視覺一致）
const LABEL_X = 90;                      // 左側標籤左緣
const BAR_X = 360;                       // 長條起點
const MAX_BARW = 1200;                   // value 最大時的長條寬
const ROW_H = 70, ROW_GAP = 36, TOP_Y = 200; // 每列高度/間距/起始 y

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

// 由 stats 建出 ffmpeg 濾鏡鏈字串 + 須寫出的文字檔清單。
// opts.preview=true → 省略 enable（一次全顯，供出靜態圖確認版面）。
export function buildStatsFilters(stats, { durationSec, preview }) {
  const bars = (stats.bars || []).slice(0, 8); // 上限 8 列（版面）
  const unit = stats.unit || '';
  const maxVal = Math.max(1, ...bars.map(b => Number(b.value) || 0));

  // 浮現時間：依陣列順序平均散佈在前 80% 片長
  const span = Math.max(0.1, durationSec * 0.8);
  const step = span / Math.max(1, bars.length);
  const revealAt = (i) => 0.4 + i * step;
  const en = (i) => preview ? null : `gte(t,${revealAt(i).toFixed(2)})`;

  const files = {};
  const filters = [];

  // 標題（恆顯）
  files['statq/_title.txt'] = stats.title || '統計圖';
  filters.push(textFilter('statq/_title.txt', { x: '(w-tw)/2', y: 48, size: 54, color: '0x9fc7ee' }));

  bars.forEach((b, i) => {
    const val = Number(b.value) || 0;
    const y = TOP_Y + i * (ROW_H + ROW_GAP);
    const bw = Math.max(2, Math.round((val / maxVal) * MAX_BARW));
    const e = en(i);
    // 軌底（淡）＋長條（實）＋頂無；標籤在左，數值在條尾
    filters.push(boxFilter({ x: BAR_X, y, w: MAX_BARW, h: ROW_H, color: '0x141c26', t: 'fill', enable: e })); // 軌底
    filters.push(boxFilter({ x: BAR_X, y, w: bw, h: ROW_H, color: BAR_COLOR, t: 'fill', enable: e }));        // 長條
    const lf = `statq/l${i}.txt`; files[lf] = String(b.label || '');
    filters.push(textFilter(lf, { x: LABEL_X, y: y + ROW_H / 2 - 22, size: 40, color: '0xffffff', enable: e }));
    const vf = `statq/v${i}.txt`; files[vf] = String(val) + unit;
    filters.push(textFilter(vf, { x: `${BAR_X + bw + 24}`, y: y + ROW_H / 2 - 20, size: 38, color: '0xc9d4df', enable: e }));
  });

  // 底部法律註記（恆顯）
  files['statq/_foot.txt'] = stats.footer || '統計示意圖 · 依公開來源整理';
  filters.push(textFilter('statq/_foot.txt', { x: '(w-tw)/2', y: H - 54, size: 26, color: '0x66788c' }));

  filters.push('vignette');
  return { filterChain: filters.join(','), files };
}

// 寫出文字檔（相對 buildDir）
function writeFiles(buildDir, files) {
  mkdirSync(join(buildDir, 'statq'), { recursive: true });
  for (const [rel, content] of Object.entries(files)) writeFileSync(join(buildDir, rel), content, 'utf8');
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });

// 給 make-demo 用：把統計圖渲成一段 mp4（durationSec 秒，長條逐一浮現）。outPath 為最終 clip。
export function renderStatsClip({ outPath, durationSec, stats, buildDir, fps = 30 }) {
  const { filterChain, files } = buildStatsFilters(stats, { durationSec, preview: false });
  writeFiles(buildDir, files);
  sh('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:r=${fps}`,
    '-vf', filterChain, '-t', durationSec.toFixed(3), '-r', String(fps),
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outPath], { cwd: buildDir });
  return outPath;
}

// 獨立預覽：渲一張全圖 PNG（全部長條顯示），供肉眼確認版面
function main() {
  const argv = process.argv;
  const slug = (() => { const i = argv.indexOf('--slug'); return i >= 0 ? argv[i + 1] : 'peter-kurten'; })();
  const TOOLS = dirname(fileURLToPath(import.meta.url));
  const ROOT = dirname(TOOLS);
  const statPath = join(ROOT, 'cases', slug, 'stats.json');
  if (!existsSync(statPath)) { console.error(`找不到 ${statPath}`); process.exit(1); }
  const stats = JSON.parse(readFileSync(statPath, 'utf8'));
  const BUILD = join(TOOLS, 'build');
  mkdirSync(join(BUILD, 'fonts'), { recursive: true });
  const FONT = join(BUILD, 'fonts', 'msjh.ttc');
  if (!existsSync(FONT)) copyFileSync('C:/Windows/Fonts/msjh.ttc', FONT);
  const { filterChain, files } = buildStatsFilters(stats, { durationSec: 30, preview: true });
  writeFiles(BUILD, files);
  const out = join(ROOT, 'web', 'media', `${slug}-stats-preview.png`);
  mkdirSync(dirname(out), { recursive: true });
  sh('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}`, '-vf', filterChain, '-frames:v', '1', out], { cwd: BUILD });
  console.log(`✅ 預覽圖：${out}（${(stats.bars || []).length} 長條）`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
