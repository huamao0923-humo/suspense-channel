// tools/build-episode.mjs
// 把 cases/<slug>/script-natural.md（含 [HOST] 解說員段）解析成結構化分段資料：
//   1) 寫 cases/<slug>/episode.json      —— 給 make-demo.mjs 渲染用
//   2) 掃所有 episode.json + pipeline/status.md，重建 web/episodes.js
//      （window.EPISODES + window.CASES，全域變數而非 fetch，維持 file:// 直接開啟）
// 用法：node tools/build-episode.mjs --slug snowtown-murders
// 零 npm 依賴。
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TOOLS);
const CHANNEL = 'Pilot 調查列車';

// 每段「畫面類型」標籤：中文 → 內部 key（make-demo 依此選素材來源）
const VISUAL_MAP = { '調用影片': 'video', '真實圖片': 'real-photo', '生成圖片': 'illust', '生成圖表': 'chart', '地圖': 'map', '地圖串場': 'map', '解說員辦公桌': 'host' };
function parseVisual(raw) {
  if (!raw) return null;
  const keys = raw.split(/[＋+、,／/|｜]/).map(s => s.trim()).map(s => VISUAL_MAP[s]).filter(Boolean);
  return keys.length ? [...new Set(keys)] : null;
}

// ---- 解析單一案件 script-natural.md → 分段 ----
function parseScript(slug) {
  const scriptPath = join(ROOT, 'cases', slug, 'script-natural.md');
  if (!existsSync(scriptPath)) return null;
  const lines = readFileSync(scriptPath, 'utf8').split(/\r?\n/);

  // 標題與法律狀態（從稿頭抓，抓不到就退回 slug）
  let title = slug, legalStatus = '';
  for (const l of lines) {
    const t = l.match(/^#\s+旁白腳本\s*[—–-]\s*(.+?)(（自然稿）)?\s*$/);
    if (t && title === slug) title = t[1].trim();
    const g = l.match(/法律狀態.*?[：:]\s*(.+?)\s*$/);
    if (g && !legalStatus) legalStatus = g[1].trim();
  }

  // 收每段配圖提示詞（編號＝旁白段序，對齊 image-prompts.md 的 ## 00a / 01b…）
  const promptsByNarr = {};
  const ipPath = join(ROOT, 'cases', slug, 'production', 'image-prompts.md');
  if (existsSync(ipPath)) {
    for (const blk of readFileSync(ipPath, 'utf8').split(/^##\s+/m).slice(1)) {
      const nl = blk.indexOf('\n'); const head = blk.slice(0, nl).trim();
      const m = head.match(/^(\d+)/); if (!m) continue;
      let body = blk.slice(nl + 1).replace(/```/g, '');
      const dash = body.indexOf('\n---'); if (dash >= 0) body = body.slice(0, dash);
      const prompt = body.replace(/\s+/g, ' ').trim();
      if (prompt && promptsByNarr[+m[1]] === undefined) promptsByNarr[+m[1]] = prompt; // 取該段第一條當代表
    }
  }

  // 逐段切：## [00] 標題 / ## [HOST-01] 標題 / ## [INTRO] / ## [ENDING]
  const sections = [];
  let cur = null;
  const flush = () => { if (cur) { sections.push(cur); cur = null; } };
  for (const raw of lines) {
    const h = raw.match(/^##\s+\[(HOST-[^\]]+|INTRO|ENDING|時間卡[^\]]*|TIME-[^\]]+|\d+)\]\s*(.*)$/);
    if (h) {
      flush();
      cur = { tag: h[1], rawTitle: h[2].trim(), body: [] };
      continue;
    }
    if (/^##\s/.test(raw)) continue;          // 略過非 [標籤] 的 H2（## ACT 1、## 地圖串場 等分幕標題），避免滲入上一段旁白
    if (!cur) continue;                       // 稿頭/分隔線之前
    if (/^>/.test(raw)) {                      // 引言註記：擷取畫面標籤／懸念問句／謝幕，其餘略過
      const vm = raw.match(/〔畫面[：:]\s*(.+?)〕/);
      if (vm) cur.visualRaw = vm[1].trim();
      const qm = raw.match(/〔懸念問句〕\s*(.+)$/);
      if (qm) cur.question = qm[1].trim();
      const cm = raw.match(/〔謝幕〕\s*(.+)$/);
      if (cm) cur.credits = cm[1].trim();
      continue;
    }
    if (/^---/.test(raw)) continue;           // 分段線
    if (!raw.trim()) continue;
    cur.body.push(raw);
  }
  flush();

  // 組裝 segments；旁白段給 narrIndex 供 shot-vocab / image-prompts 對位
  const segments = [];
  let intro = null, ending = null;
  let narrIndex = 0;
  for (const sec of sections) {
    // 黑屏打字機開場：逐字浮現的日期地點卡（不進 segments，渲染時插在解說員開場後）
    if (sec.tag === 'INTRO') {
      const dateLines = sec.body.map(l => l.replace(/\[[^\]]*\]/g, '').trim()).filter(Boolean);
      if (dateLines.length) intro = { dateLines };
      continue;
    }
    // 片尾：懸念問句 → 真實素材 → 謝幕字卡（不進 segments，渲染時收尾）
    if (sec.tag === 'ENDING') {
      ending = { question: sec.question || '', realFootage: true, credits: sec.credits || '' };
      continue;
    }
    // 牛皮紙時間卡：中途年代/時間跨度轉場（牛皮紙＋打字機逐字敲出，~3–4s，無旁白）。
    // 位置照它在腳本中出現的順序（通常緊接某個 [HOST] 列車長轉場之後）。
    if (sec.tag.startsWith('時間卡') || sec.tag.startsWith('TIME')) {
      const dateLines = sec.body.map(l => l.replace(/\[[^\]]*\]/g, '').trim()).filter(Boolean);
      if (dateLines.length) segments.push({ id: sec.tag, kind: 'timecard', dateLines });
      continue;
    }
    const isHost = sec.tag.startsWith('HOST');
    // 去掉 [停頓][加重][放慢] 等演播提示，保留英文名字間的空白
    const narration = sec.body.map(l => l.replace(/\[[^\]]*\]/g, '')).join('').replace(/\s+/g, ' ').trim();
    if (!narration) continue;
    if (isHost) {
      segments.push({
        id: sec.tag,
        kind: 'host',
        heading: 'Pilot · 列車長出鏡',
        hostFunction: sec.rawTitle,
        narration,
        visual: ['host'],
        imagePrompt: '解說員 Pilot 全螢幕定格出鏡（brand/assets/host-reference.png）',
      });
    } else {
      segments.push({
        id: sec.tag,
        kind: 'narration',
        heading: sec.rawTitle,
        narration,
        narrIndex,
        visual: parseVisual(sec.visualRaw),
        imagePrompt: promptsByNarr[narrIndex] || null,
      });
      narrIndex++;
    }
  }

  const ep = { channel: CHANNEL, title, slug, legalStatus, segments };
  if (intro) ep.intro = intro;
  if (ending) ep.ending = ending;
  return ep;
}

// ---- 從 pipeline/status.md 抓各案進度 ----
function parseStatus() {
  const p = join(ROOT, 'pipeline', 'status.md');
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!/^\|/.test(line)) continue;
    const c = line.split('|').map(s => s.trim());
    const slug = c[1];
    if (!slug || slug === '案件 (slug)' || /^-+$/.test(slug)) continue;
    out.push({ slug, title: c[2] || slug, status: c[3] || '', note: c[5] || '' });
  }
  return out;
}

// ---- main ----
const argSlug = (() => { const i = process.argv.indexOf('--slug'); return i >= 0 ? process.argv[i + 1] : null; })();
const slug = argSlug || 'snowtown-murders';

const ep = parseScript(slug);
if (!ep) { console.error(`找不到 cases/${slug}/script-natural.md，無法產生 episode.json`); process.exit(1); }
const hostCount = ep.segments.filter(s => s.kind === 'host').length;
const narrCount = ep.segments.filter(s => s.kind === 'narration').length;
writeFileSync(join(ROOT, 'cases', slug, 'episode.json'), JSON.stringify(ep, null, 2), 'utf8');
console.log(`✅ cases/${slug}/episode.json：旁白 ${narrCount} 段、解說員 ${hostCount} 段`);

// 重建 web/episodes.js（彙整所有已有 episode.json 的案件）
const EPISODES = {};
const casesDir = join(ROOT, 'cases');
if (existsSync(casesDir)) {
  for (const name of readdirSync(casesDir)) {
    const ejson = join(casesDir, name, 'episode.json');
    if (existsSync(ejson) && statSync(ejson).isFile()) {
      try { EPISODES[name] = JSON.parse(readFileSync(ejson, 'utf8')); } catch { }
    }
  }
}
const CASES = parseStatus().map(c => ({ ...c, hasEpisode: !!EPISODES[c.slug] }));
// 補上有 episode 但 status.md 沒列到的案件
for (const s of Object.keys(EPISODES)) {
  if (!CASES.find(c => c.slug === s)) CASES.push({ slug: s, title: EPISODES[s].title, status: '', note: '', hasEpisode: true });
}

const webDir = join(ROOT, 'web');
mkdirSync(webDir, { recursive: true });
writeFileSync(join(webDir, 'episodes.js'),
  '/* 由 tools/build-episode.mjs 自動產生，請勿手改。來源：cases/<slug>/episode.json + pipeline/status.md */\n' +
  'window.EPISODES = ' + JSON.stringify(EPISODES, null, 2) + ';\n' +
  'window.CASES = ' + JSON.stringify(CASES, null, 2) + ';\n', 'utf8');
console.log(`✅ web/episodes.js：${Object.keys(EPISODES).length} 個案件可播放、${CASES.length} 列進度`);
