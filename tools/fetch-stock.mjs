// tools/fetch-stock.mjs
// 第 2 層素材：從每個鏡頭的配圖提示詞萃取關鍵字，去免費影片庫找可商用空景 B-roll。
// 有環境變數 PEXELS_KEY 時：自動查 Pexels Videos 並下載到 assets/stock-footage/，寫清單。
// 無 key 時：產出每鏡頭的「建議關鍵字 + 推薦影片庫」清單，供手動抓取。
// 用法：node tools/fetch-stock.mjs [caseSlug]   （預設 snowtown-murders）
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TOOLS);
const slug = process.argv[2] || 'snowtown-murders';
const PEXELS_KEY = process.env.PEXELS_KEY || '';

const ipPath = join(ROOT, 'cases', slug, 'production', 'image-prompts.md');
if (!existsSync(ipPath)) { console.error('找不到 image-prompts.md：' + ipPath); process.exit(1); }
const ip = readFileSync(ipPath, 'utf8');

// 解析每個鏡頭 → {id, heading, prompt}
const shots = [];
for (const blk of ip.split(/^##\s+/m).slice(1)) {
  const nl = blk.indexOf('\n'); const head = blk.slice(0, nl).trim();
  const id = (head.match(/^[\w]+/) || [''])[0];
  let body = blk.slice(nl + 1).replace(/```/g, ''); const dash = body.indexOf('\n---'); if (dash >= 0) body = body.slice(0, dash);
  shots.push({ id, heading: head, prompt: body.replace(/\s+/g, ' ').trim() });
}

// 從提示詞萃取 stock 搜尋關鍵字：去掉共通基底樣板，取場景關鍵名詞
const BASE = /cinematic documentary still|dark moody lighting|cold desaturated palette|film grain|shallow depth of field|realistic|investigative tone|16:9|--ar 16:9|--quality \d|photorealistic|high contrast|no people|no text|anonymous|silhouettes?/gi;
function keywords(prompt) {
  let s = prompt.replace(BASE, ' ').replace(/[.,|—-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const words = s.split(' ').filter(w => /^[a-zA-Z]{3,}$/.test(w));
  // 取前 4 個有意義字當查詢
  return words.slice(0, 4).join(' ') || 'dark abandoned scene';
}

async function pexelsSearch(query) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=1`;
  const r = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
  if (!r.ok) throw new Error('Pexels HTTP ' + r.status);
  const j = await r.json();
  const v = j.videos?.[0]; if (!v) return null;
  const file = (v.video_files || []).filter(f => f.width <= 1920).sort((a, b) => b.width - a.width)[0] || v.video_files?.[0];
  return file ? { page: v.url, download: file.link, w: file.width, h: file.height } : null;
}

const outDir = join(ROOT, 'assets', slug);
mkdirSync(outDir, { recursive: true });
const rows = [];
const dlDir = join(ROOT, 'assets', 'stock-footage');

if (PEXELS_KEY) {
  mkdirSync(dlDir, { recursive: true });
  console.log(`有 PEXELS_KEY，自動搜尋 ${shots.length} 個鏡頭...`);
  for (const sh of shots) {
    const q = keywords(sh.prompt);
    try {
      const hit = await pexelsSearch(q);
      if (hit) {
        const out = join(dlDir, `${slug}_${sh.id}.mp4`);
        if (!(existsSync(out) && statSync(out).size > 50000)) {
          const r = await fetch(hit.download); const buf = Buffer.from(await r.arrayBuffer()); writeFileSync(out, buf);
        }
        rows.push(`| ${sh.id} | \`${q}\` | Pexels | [來源](${hit.page}) | ${hit.w}x${hit.h} | assets/stock-footage/${slug}_${sh.id}.mp4 |`);
        console.log(`  ${sh.id} ✓ ${q}`);
      } else { rows.push(`| ${sh.id} | \`${q}\` | Pexels | 無結果 | - | - |`); console.log(`  ${sh.id} ✗ 無結果 (${q})`); }
    } catch (e) { rows.push(`| ${sh.id} | \`${q}\` | Pexels | 錯誤：${e.message} | - | - |`); console.log(`  ${sh.id} ! ${e.message}`); }
  }
} else {
  console.log('未設定 PEXELS_KEY → 改產出關鍵字清單（手動抓取）。');
  console.log('要自動下載：先取得免費 Pexels API key，再執行  $env:PEXELS_KEY="你的key"; node tools/fetch-stock.mjs');
  for (const sh of shots) rows.push(`| ${sh.id} | \`${keywords(sh.prompt)}\` | 手動 | Pexels / Pixabay / Archive.org / Wikimedia | - | 待抓 |`);
}

const md = `# Stock B-roll 調用清單 — ${slug}

> 由 tools/fetch-stock.mjs 產生。第 2 層素材（影片庫空景），對齊 assets/footage-sourcing.md。
> ${PEXELS_KEY ? '已用 Pexels API 自動搜尋/下載。' : '未設 PEXELS_KEY，以下為建議關鍵字，請至推薦影片庫手動抓取（只用可商用授權）。'}

| 鏡頭 | 建議關鍵字 | 來源 | 連結/狀態 | 解析度 | 檔案 |
|---|---|---|---|---|---|
${rows.join('\n')}

## 推薦免費影片庫
- Pexels Videos / Pixabay Videos（免費可商用，需免費 API key）
- Archive.org、Wikimedia Commons（公共領域/CC，免 key）
- Coverr、Mixkit、Videvo（免費授權，多需手動下載）
`;
writeFileSync(join(outDir, 'stock-footage.md'), md, 'utf8');
console.log(`\n✅ 已寫 assets/${slug}/stock-footage.md（${shots.length} 個鏡頭）`);
