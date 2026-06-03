// tools/real-picker.mjs
// 通用「真實素材挑選＋下載」CLI：把 Wikimedia Commons 的分類/搜尋候選列出來，
//   --auto 自動下載授權安全者（PD/CC0/聯邦/CC-BY/SA；排除 NC/ND），或互動挑編號下載。
//   下載進 assets/<slug>/real-library/{images,video,docs}/ 並回填 MANIFEST.csv（clearance=🟡待人工確認）。
// 對齊 brand/legal-redlines.md：只收免費/開源；clearance 一律 🟡，發布前仍須人工確認授權。
// 第三層受版權新聞/庭審/紀錄片不由本工具下載（見 real-footage-sources.md 第三層，人工合理使用另案處理）。
//
// 用法：
//   node tools/real-picker.mjs --slug <slug> --category "Joseph James DeAngelo"      # 互動挑選
//   node tools/real-picker.mjs --slug <slug> --query "prison exterior" --limit 8     # 搜尋＋互動
//   node tools/real-picker.mjs --slug <slug> --auto                                  # 讀 seed.json 自動灌庫
//   node tools/real-picker.mjs --slug <slug> --category "..." --pick 1,3,5           # 非互動指定
import { commonsCategory, searchCommonsCandidates, downloadTo, appendManifest, fileSlug, extOf, categoryOf, isFreeLicense, SENSITIVE_RE } from './fetch-real.mjs';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

// ── 參數解析 ──────────────────────────────────────────────
const argv = process.argv.slice(2);
const getArg = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] || '') : null; };
const hasFlag = (name) => argv.includes(name);
const SLUG = getArg('--slug');
if (!SLUG) { console.error('需要 --slug <slug>'); process.exit(1); }
const CATEGORY = getArg('--category');
const QUERY = getArg('--query');
const LIMIT = +(getArg('--limit') || 12);
const AUTO = hasFlag('--auto');
const PICK = getArg('--pick'); // "1,3,5"

const ROOT = join('assets', SLUG, 'real-library');
const DIRS = { image: join(ROOT, 'images'), video: join(ROOT, 'video'), doc: join(ROOT, 'docs') };
const MANIFEST = join(ROOT, 'MANIFEST.csv');
for (const d of Object.values(DIRS)) mkdirSync(d, { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const DATE = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;

// ── 蒐集候選來源（categories / queries）──────────────────────
// 優先用 --category/--query；皆無則讀 seed.json
let categories = [], queries = [], avoidTerms = [];
if (CATEGORY) categories = [CATEGORY];
if (QUERY) queries = [QUERY];
// 排除詞（時代錯置的現代地標/建築工地/近年街景…）：--avoid "a,b,c" 覆寫，否則讀 seed.avoidTerms。
{ const a = getArg('--avoid'); if (a) avoidTerms = a.split(',').map((s) => s.trim()).filter(Boolean); }
if (!CATEGORY && !QUERY) {
  const seedPath = join(ROOT, 'seed.json');
  if (existsSync(seedPath)) {
    try { const seed = JSON.parse(readFileSync(seedPath, 'utf8')); categories = seed.categories || []; queries = seed.queries || []; if (!avoidTerms.length) avoidTerms = seed.avoidTerms || []; }
    catch { console.error(`seed.json 解析失敗：${seedPath}`); process.exit(1); }
    console.log(`讀取 seed.json：${categories.length} 分類、${queries.length} 搜尋詞、${avoidTerms.length} 排除詞`);
  } else { console.error('未指定 --category/--query 且無 seed.json，無事可做'); process.exit(1); }
}

// 候選型別（依 mime）；audio/svg 直接排除
function typeOf(mime) {
  if (mime.startsWith('image/') && !/svg/.test(mime)) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.includes('pdf')) return 'doc';
  return null;
}

// 列舉所有候選並去重（依 url）
const seen = new Set();
const candidates = [];
for (const cat of categories) {
  const members = await commonsCategory(cat, { limit: 500 });
  for (const m of members) { if (m.url && !seen.has(m.url)) { seen.add(m.url); candidates.push({ ...m, origin: `Category:${cat}` }); } }
}
for (const q of queries) {
  const hits = await searchCommonsCandidates(q, { limit: LIMIT });
  for (const m of hits) { if (m.url && !seen.has(m.url)) { seen.add(m.url); candidates.push({ ...m, origin: `搜尋:${q}` }); } }
}
let usable = candidates.map((c) => ({ ...c, _type: typeOf(c.mime) })).filter((c) => c._type);
// 時代正確性過濾：標題命中 avoidTerms（現代地標/工地/近年街景）一律剔除——寧缺勿濫，缺口由 render 端退 AI 示意補。
if (avoidTerms.length) {
  const avoidRe = new RegExp(avoidTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');
  const before = usable.length;
  usable = usable.filter((c) => !avoidRe.test(c.title || ''));
  if (before - usable.length) console.log(`avoidTerms 排除 ${before - usable.length} 個時代錯置/工地候選`);
}
if (!usable.length) { console.log('無可用候選（可能分類不存在、皆為 audio/svg、或全被 avoidTerms 排除）'); process.exit(0); }

// ── 列出候選 ──────────────────────────────────────────────
const sizeKB = (b) => b ? `${Math.round(b / 1024)}KB` : '?';
console.log(`\n找到 ${usable.length} 個候選：`);
usable.forEach((c, i) => {
  const free = isFreeLicense(c.license) ? '✅免費' : '⚠️非免費';
  console.log(`  [${i + 1}] ${c.title}  | ${c._type} | ${c.license} ${free} | ${sizeKB(c.size)} | ${c.origin}`);
});

// ── 決定要下載哪些 ──────────────────────────────────────────
let chosen = [];
if (AUTO) {
  // 自動模式：只取授權安全者，並設上限（每來源前 N 個＋全域上限），避免灌爆 real-library 與觸發 Commons 限流
  const PER_ORIGIN = +(getArg('--per-origin') || 4);
  const MAX_AUTO = +(getArg('--max') || 40);
  // 相關性過濾：查詢來源的候選，標題須含查詢的有意義詞（避免寬鬆查詢拉到離題雜訊）；分類來源信任
  const relevant = (c) => {
    const m = /^搜尋:(.+)$/.exec(c.origin || '');
    if (!m) return true;
    const qw = m[1].toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
    const tt = (c.title || '').toLowerCase();
    return !qw.length || qw.some((w) => tt.includes(w));
  };
  const free = usable.filter((c) => isFreeLicense(c.license) && relevant(c));
  const perCount = {};
  for (const c of free) { const o = c.origin || ''; perCount[o] = (perCount[o] || 0) + 1; if (perCount[o] <= PER_ORIGIN) chosen.push(c); }
  chosen = chosen.slice(0, MAX_AUTO);
  console.log(`\n--auto：候選 ${usable.length}，授權安全 ${free.length}，依上限（每來源≤${PER_ORIGIN}、全域≤${MAX_AUTO}）選取 ${chosen.length} 個下載。`);
} else if (PICK) {
  const idx = PICK.split(',').map((s) => +s.trim() - 1).filter((n) => n >= 0 && n < usable.length);
  chosen = idx.map((n) => usable[n]);
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = (await rl.question('\n挑哪幾個？(逗號分隔編號 / all / q 離開)：')).trim();
  rl.close();
  if (ans === 'q' || !ans) { console.log('未選取，結束。'); process.exit(0); }
  if (ans === 'all') chosen = usable.slice();
  else { const idx = ans.split(',').map((s) => +s.trim() - 1).filter((n) => n >= 0 && n < usable.length); chosen = idx.map((n) => usable[n]); }
}
if (!chosen.length) { console.log('未選取任何素材，結束。'); process.exit(0); }

// ── 下載＋回填 MANIFEST（間隔節流 + 失敗重試一次，避免 Commons 限流）────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, fail = 0; const rows = [];
for (const c of chosen) {
  const type = c._type;
  const fname = `${DATE}_real-${fileSlug(c.title)}.${extOf(c.title, c.mime)}`;
  const out = join(DIRS[type], fname);
  const opt = { minBytes: type === 'video' ? 80000 : 8000, timeoutMs: type === 'video' ? 180000 : 60000 };
  let got = existsSync(out) || await downloadTo(c.url, out, opt);
  if (!got) { await sleep(800); got = await downloadTo(c.url, out, opt); } // 重試一次
  await sleep(300); // 節流：對 Commons 友善
  if (!got) { fail++; console.log(`  FAIL: ${c.title}`); continue; }
  ok++; console.log(`  ✓ ${fname}`);
  const isPD = /cc0|public domain|pdmark|no restrictions|no known/i.test(c.license);
  const sensitive = SENSITIVE_RE.test(c.title);
  rows.push({
    filename: fname, type, category: categoryOf(c.title, type), description: c.title,
    source: 'Wikimedia Commons', source_url: c.descriptionurl || c.url,
    license_type: c.license, attribution: isPD ? 'N' : (c.creator && c.creator !== 'unknown' ? c.creator : 'see file page'),
    commercial_ok: 'Y', deidentify: sensitive ? 'Y' : 'N', clearance: '🟡待人工確認',
    notes: sensitive ? '敏感:含受害者/倖存者脈絡,使用須去識別' : '',
  });
}
const added = rows.length ? appendManifest(MANIFEST, rows) : 0;
console.log(`\nDONE. 下載成功=${ok} 失敗=${fail}；MANIFEST 新增 ${added} 列（clearance=🟡，發布前須人工確認授權）。`);
