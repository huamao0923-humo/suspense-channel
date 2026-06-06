// tools/serve.mjs
// Pilot 調查員 製作工作台（本機伺服器，零 npm 依賴）。
// 把「選題庫 (radar-shortlist.md) → 集數庫 (cases/ + status.md) → 渲染」串成可操作工作流。
// 啟動：node tools/serve.mjs   然後開 http://localhost:8787
//
// 能點擊執行的（本機確定性步驟）：勾選案件、build-episode、make-demo 渲染、預覽各階段文件。
// Claude 驅動的步驟（deep-research / story-arc / script-studio / production-package）會顯示「在 Claude Code 執行」指令，
// 並依檔案存在自動偵測完成度——伺服器不代跑 Claude workflow（成本與隔離考量）。
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, createReadStream, openSync, mkdirSync, unlinkSync, copyFileSync, renameSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { appendManifest, categoryOf, fileSlug, SENSITIVE_RE, searchCommonsCandidates, downloadTo } from './fetch-real.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TOOLS);
const WEB = join(ROOT, 'web');
const CASES = join(ROOT, 'cases');
const PORT = Number(process.env.PORT) || 8787;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// 渲染鎖：同時只跑一個 make-demo
const render = { running: false, slug: null, log: join(ROOT, 'tools', 'build', 'render.log') };
// Claude CLI 執行鎖：同時只跑一個 claude 任務（控制成本與隔離）。工具權限由 .claude/settings.json 白名單控管，不用 bypassPermissions。
const claudeRun = { running: false, slug: null, step: null, log: join(ROOT, 'tools', 'build', 'claude.log') };

const slugify = (title) => {
  const m = title.match(/[（(]([A-Za-z0-9 .'’-]+)[）)]/);
  const base = (m ? m[1] : title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'case';
};

// ---- 選題庫：解析 radar-shortlist.md 表格 ----
function parseTopics() {
  const p = join(ROOT, 'pipeline', 'radar-shortlist.md');
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!/^\|\s*\[[ x]\]/.test(line)) continue;               // 只取有勾選框的資料列
    const c = line.split('|').map(s => s.trim());
    // c = ['', '[ ]', rank, title, country, year, legal, score, hook, '']
    const selected = /\[x\]/i.test(c[1]);
    const rank = Number(c[2]);
    if (!rank) continue;
    out.push({ rank, selected, title: c[3], country: c[4], year: c[5], legal: c[6], score: c[7], hook: c[8], slug: slugify(c[3] || '') });
  }
  return out;
}

// ---- 集數庫：掃 cases/ 算各階段完成度 ----
function statusMap() {
  const p = join(ROOT, 'pipeline', 'status.md');
  const m = {};
  if (existsSync(p)) for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!/^\|/.test(line)) continue;
    const c = line.split('|').map(s => s.trim());
    if (!c[1] || c[1] === '案件 (slug)' || /^-+$/.test(c[1])) continue;
    m[c[1]] = { status: c[3] || '', note: c[5] || '' };
  }
  return m;
}
function has(slug, ...rel) { return existsSync(join(CASES, slug, ...rel)); }
function parseCases() {
  if (!existsSync(CASES)) return [];
  const sm = statusMap();
  const out = [];
  for (const slug of readdirSync(CASES)) {
    if (!statSync(join(CASES, slug)).isDirectory()) continue;
    const stages = {
      intake: has(slug, 'intake.md'),
      research: has(slug, 'dossier.md') && has(slug, 'factcheck.md'),
      arc: has(slug, 'story-arc.md'),
      script: has(slug, 'script-natural.md'),
      legal: has(slug, 'legal-review.md'),
      production: has(slug, 'production', 'shotlist.md'),
      episode: has(slug, 'episode.json'),
      rendered: existsSync(join(WEB, 'media', `${slug}-demo.mp4`)),
    };
    let title = slug, narr = 0, host = 0, chars = 0, subs = 0, ep = null;
    if (stages.episode) { try { const e = JSON.parse(readFileSync(join(CASES, slug, 'episode.json'), 'utf8')); title = e.title || slug; ep = e.ep != null ? e.ep : null; const sg = e.segments || []; narr = sg.filter(s => s.kind !== 'host').length; host = sg.filter(s => s.kind === 'host').length; for (const s of sg) { const t = s.narration || ''; chars += t.length; subs += t.split(/[。！？!?；;…\n]/).filter(x => x.trim()).length; } } catch { } }
    if (title === slug && stages.intake) { try { const m = readFileSync(join(CASES, slug, 'intake.md'), 'utf8').match(/^#\s*投稿素材\s*—\s*(.+)$/m); if (m) title = m[1].trim(); } catch { } }
    const docs = ['intake.md', 'dossier.md', 'factcheck.md', 'real-footage-sources.md', 'story-arc.md', 'script-natural.md', 'script-tts.md', 'legal-review.md', 'production/shotlist.md', 'production/image-prompts.md', 'production/seo-package.md', 'production/sources.md'].filter(d => has(slug, ...d.split('/')));
    const docMeta = {};
    for (const d of docs) { try { const fp = join(CASES, slug, ...d.split('/')); const stt = statSync(fp); docMeta[d] = { bytes: stt.size, mtime: stt.mtimeMs, lines: readFileSync(fp, 'utf8').split('\n').length }; } catch { } }
    // 真實素材庫（assets/<slug>/real-library）：已下載的真實素材數，供前端顯示「研究時備齊素材」進度
    let realLib = { images: 0, video: 0, docs: 0 };
    try { const RL = join(ROOT, 'assets', slug, 'real-library'); for (const sub of ['images', 'video', 'docs']) { const d = join(RL, sub); if (existsSync(d)) realLib[sub] = readdirSync(d).filter(f => !f.startsWith('.')).length; } } catch { }
    const realLibTotal = realLib.images + realLib.video + realLib.docs;
    let video = null;
    if (stages.rendered) { try { const vs = statSync(join(WEB, 'media', `${slug}-demo.mp4`)); video = { bytes: vs.size, mtime: vs.mtimeMs }; } catch { } }
    // 最後更新日期＝所有產出檔（含成片）最新 mtime，供前端管理用
    let updated = 0;
    for (const d of docs) { if (docMeta[d] && docMeta[d].mtime > updated) updated = docMeta[d].mtime; }
    if (video && video.mtime > updated) updated = video.mtime;
    out.push({ slug, title, ep, stages, narr, host, chars, subs, docs, docMeta, video, updated, realLib, realLibTotal, status: sm[slug]?.status || '', note: sm[slug]?.note || '' });
  }
  return out;
}

// ---- helpers ----
const send = (res, code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
const sendJson = (res, code, obj) => send(res, code, JSON.stringify(obj));
function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); }); }

// 串流任意檔（支援 Range，給影片可拖動）——slot-media 用；serveStatic 維持原樣不動。
function streamFile(req, res, full) {
  const type = MIME[extname(full).toLowerCase()] || 'application/octet-stream';
  const size = statSync(full).size;
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m[1] ? parseInt(m[1]) : 0, end = m[2] ? parseInt(m[2]) : size - 1;
    if (start > end || start >= size) return send(res, 416, '', 'text/plain');
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return createReadStream(full, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  createReadStream(full).pipe(res);
}

// 估時（與 make-demo segment-manifest 同式：中文約 5.5 字/秒 + 段間停頓）
const estSecSrv = (txt) => { const c = String(txt || '').replace(/\s+/g, '').length; return Math.round((c / 5.5 + 0.8) * 10) / 10; };
const relRoot = (p) => { if (!p) return null; const r = String(p).replace(/\\/g, '/'); const base = ROOT.replace(/\\/g, '/').replace(/\/+$/, '') + '/'; return r.startsWith(base) ? r.slice(base.length) : r; };
// 該槽在 build/img/<slug> 的最佳自動檔（mp4 > jpg > ai.jpg > 其他）
function bestSlotFile(imgDir, n, k) {
  for (const ext of ['mp4', 'jpg', 'ai.jpg', 'png', 'webp', 'webm', 'gif']) { const f = join(imgDir, `s${n}_${k}.${ext}`); if (existsSync(f)) return f; }
  return null;
}
// 該槽手動覆寫檔（production/manual/sN_k.*）——最高優先
function manualSlotFile(slug, n, k) {
  const mdir = join(CASES, slug, 'production', 'manual');
  for (const ext of ['png', 'webp', 'mp4', 'webm', 'jpg', 'jpeg', 'mov', 'gif']) { const f = join(mdir, `s${n}_${k}.${ext}`); if (existsSync(f)) return f; }
  return null;
}
// .real 標記＝該手動覆寫是真實素材（重抓/挑片寫入），非 GPT 生圖手貼
const manualRealMarker = (slug, n, k) => existsSync(join(CASES, slug, 'production', 'manual', `s${n}_${k}.real`));
const slotMediaUrl = (slug, full) => full ? `/api/slot-media/${slug}?path=` + encodeURIComponent(relRoot(full)) : null;
// 逐段素材：episode.json 骨架 ＋ 上次 render 的 segment-manifest（補來源/授權/query）＋ 硬碟實際槽檔（render 前後皆可看）
function readSegments(slug) {
  const ep = join(CASES, slug, 'episode.json');
  if (!existsSync(ep)) return null;
  let data; try { data = JSON.parse(readFileSync(ep, 'utf8')); } catch { return null; }
  const imgDir = join(TOOLS, 'build', 'img', slug);
  let man = null; const mp = join(CASES, slug, 'production', 'segment-manifest.json');
  if (existsSync(mp)) { try { man = JSON.parse(readFileSync(mp, 'utf8')); } catch { } }
  // 用 narrIndex / id 穩定對位（make-demo 會注入 INTRO/ENDING 合成段→manifest idx 與 episode.json 陣列索引不一致，不可用 idx 對）
  const manByNarr = {}, manById = {};
  if (man && Array.isArray(man.segments)) for (const sg of man.segments) { if (typeof sg.narrIndex === 'number') manByNarr[sg.narrIndex] = sg; if (sg.id) manById[sg.id] = sg; }
  let audioOv = {}; try { audioOv = JSON.parse(readFileSync(join(CASES, slug, 'production', 'audio-overrides.json'), 'utf8')) || {}; } catch { }
  const previewDir = join(TOOLS, 'build', 'preview', slug);
  const isVid = (f) => !!f && /\.(mp4|webm|mov|gif)$/i.test(f);
  const segments = (data.segments || []).map((seg, idx) => {
    const n = seg.narrIndex, hasN = typeof n === 'number';
    const mseg = (hasN ? manByNarr[n] : null) || (seg.id ? manById[seg.id] : null) || null;
    const slots = [];
    if (hasN) {
      let kmax = (mseg && Array.isArray(mseg.slots)) ? mseg.slots.length : 0;
      for (let k = 0; k < 12; k++) if (bestSlotFile(imgDir, n, k) || manualSlotFile(slug, n, k)) kmax = Math.max(kmax, k + 1);
      if (kmax === 0) kmax = 1;
      for (let k = 0; k < kmax; k++) {
        const mslot = (mseg && mseg.slots) ? mseg.slots.find(x => x.k === k) : null;
        const manF = manualSlotFile(slug, n, k), autoF = bestSlotFile(imgDir, n, k);
        const manifestF = (mslot && mslot.file && existsSync(join(ROOT, mslot.file))) ? join(ROOT, mslot.file) : null;
        const file = manF || autoF || manifestF;
        const video = manF ? isVid(manF) : autoF ? isVid(autoF) : (mslot ? mslot.type === 'video' : (seg.visual || []).includes('video'));
        const manReal = manF && manualRealMarker(slug, n, k);
        slots.push({
          k,
          type: manF ? (video ? 'video' : 'image') : (mslot?.type || (autoF ? (video ? 'video' : 'image') : ((seg.visual || []).includes('video') ? 'video' : 'image'))),
          tier: manF ? (manReal ? (mslot?.tier && mslot.tier !== 'manual' ? mslot.tier : 'real') : 'manual') : (mslot?.tier || 'unknown'),
          provider: mslot?.provider || (manReal ? '重抓/挑片' : manF ? '手動上傳' : ''),
          title: mslot?.title || (file ? file.split(/[\\/]/).pop() : ''),
          creator: mslot?.creator || '', license: mslot?.license || '', source: mslot?.source || '',
          query: mslot?.query || '', prompt: mslot?.prompt || seg.imagePrompt || '',
          isManual: !!manF, video, media: slotMediaUrl(slug, file),
          dur: (mslot && typeof mslot.dur === 'number') ? mslot.dur : null,
          isFill: k > 0,   // k0＝主素材（依本段提示詞/真實詞）；k1+＝自動填充 B-roll
        });
      }
    } else {
      slots.push({ k: 0, type: (seg.visual && seg.visual[0]) || seg.kind, tier: 'composed', provider: '', title: '', creator: '', license: '', source: '', query: '', prompt: '', isManual: false, video: false, media: null });
    }
    const previewFile = hasN ? join(previewDir, `seg${n}.mp4`) : null;
    return {
      idx, id: seg.id, kind: seg.kind, narrIndex: hasN ? n : null, heading: seg.heading || '', narration: seg.narration || '', visual: seg.visual || [], dateLines: seg.dateLines || null,
      durationEst: (mseg && typeof mseg.durationEst === 'number') ? mseg.durationEst : estSecSrv(seg.narration), slots,
      originalAudio: hasN ? audioOv[String(n)] === 'original' : false,
      preview: (previewFile && existsSync(previewFile)) ? slotMediaUrl(slug, previewFile) : null,
    };
  });
  return { slug, title: data.title || slug, hasManifest: !!man, renderedAt: man?.renderedAt || null, segments };
}

// 清 manifest 該槽（刪除/歸檔後，讓 UI 不再顯示舊素材）
function clearManifestSlot(slug, n, k) {
  const mp = join(CASES, slug, 'production', 'segment-manifest.json');
  if (!existsSync(mp)) return;
  try {
    const man = JSON.parse(readFileSync(mp, 'utf8'));
    const sg = (man.segments || []).find(x => x.narrIndex === n);
    if (sg && Array.isArray(sg.slots)) { const sl = sg.slots.find(x => x.k === k); if (sl) { sl.file = null; sl.title = ''; sl.provider = ''; sl.source = ''; sl.tier = 'unknown'; } }
    writeFileSync(mp, JSON.stringify(man, null, 2), 'utf8');
  } catch { }
}
// 設定 manifest 該槽欄位（挑片 commit 後更新來源/授權）
function setManifestSlot(slug, n, k, fields) {
  const mp = join(CASES, slug, 'production', 'segment-manifest.json');
  if (!existsSync(mp)) return;
  try {
    const man = JSON.parse(readFileSync(mp, 'utf8'));
    const sg = (man.segments || []).find(x => x.narrIndex === n);
    if (!sg) return;
    sg.slots = sg.slots || [];
    let sl = sg.slots.find(x => x.k === k);
    if (!sl) { sl = { k }; sg.slots.push(sl); sg.slots.sort((a, b) => a.k - b.k); }
    Object.assign(sl, fields);
    writeFileSync(mp, JSON.stringify(man, null, 2), 'utf8');
  } catch { }
}
const intOk = (v) => Number.isInteger(v) && v >= 0 && v < 1000;
const ymd = () => { const d = new Date(), p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; };
// 啟動單槽/單段 make-demo（吃渲染鎖，仿 /api/render）。回 {code, body}。
function startMakeDemo(args, slug) {
  if (render.running) return { code: 409, body: { ok: false, error: '已有渲染/重抓進行中：' + render.slug } };
  render.running = true; render.slug = slug;
  const logFd = openSync(render.log, 'a');
  const child = spawn(process.execPath, [join(TOOLS, 'make-demo.mjs'), '--slug', slug, ...args], { cwd: ROOT, stdio: ['ignore', logFd, logFd] });
  child.on('exit', () => { render.running = false; render.slug = null; });
  child.on('error', () => { render.running = false; render.slug = null; });
  return { code: 200, body: { ok: true, started: slug, args } };
}
// 該槽目前實際檔（manual 覆寫優先，否則 build/img 自動快取）
const currentSlotFile = (slug, n, k) => manualSlotFile(slug, n, k) || bestSlotFile(join(TOOLS, 'build', 'img', slug), n, k);

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = normalize(join(WEB, rel));
  if (!full.startsWith(WEB) || !existsSync(full) || statSync(full).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
  const type = MIME[extname(full).toLowerCase()] || 'application/octet-stream';
  const size = statSync(full).size;
  const range = req.headers.range;
  if (range) {                                  // 支援 Range（影片可拖動）
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m[1] ? parseInt(m[1]) : 0, end = m[2] ? parseInt(m[2]) : size - 1;
    if (start > end || start >= size) return send(res, 416, '', 'text/plain');
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return createReadStream(full, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' });
  createReadStream(full).pipe(res);
}

const server = createServer(async (req, res) => {
  const url = req.url || '/';
  try {
    if (url.startsWith('/api/')) {
      const path = url.split('?')[0];

      if (path === '/api/state' && req.method === 'GET') {
        return sendJson(res, 200, { topics: parseTopics(), cases: parseCases(), render: { running: render.running, slug: render.slug }, claude: { running: claudeRun.running, slug: claudeRun.slug, step: claudeRun.step } });
      }

      if (path === '/api/doc' && req.method === 'GET') {
        const q = new URL(url, 'http://x').searchParams;
        const slug = (q.get('slug') || '').replace(/[^a-z0-9-]/g, '');
        const name = (q.get('name') || '').replace(/[^a-zA-Z0-9._/-]/g, '');
        const full = normalize(join(CASES, slug, name));
        if (!full.startsWith(join(CASES, slug)) || !existsSync(full)) return send(res, 404, '找不到文件', 'text/plain; charset=utf-8');
        return send(res, 200, readFileSync(full, 'utf8'), 'text/plain; charset=utf-8');
      }

      // 逐段素材檢視台：回傳每段每槽素材（episode.json ＋ segment-manifest ＋ 硬碟槽檔合併）
      if (path.startsWith('/api/segments/') && req.method === 'GET') {
        const slug = path.replace('/api/segments/', '').replace(/\/$/, '');
        if (!/^[a-z0-9-]+$/.test(slug)) return sendJson(res, 400, { error: 'bad slug' });
        const r = readSegments(slug);
        if (!r) return sendJson(res, 404, { error: 'no episode（請先 build-episode）' });
        return sendJson(res, 200, r);
      }

      // 逐段素材檢視台：串流單槽素材（build/img、production/manual、real-library、preview 白名單內）
      if (path.startsWith('/api/slot-media/') && req.method === 'GET') {
        const slug = path.replace('/api/slot-media/', '').replace(/\/$/, '').split('?')[0];
        if (!/^[a-z0-9-]+$/.test(slug)) return send(res, 400, 'bad slug', 'text/plain');
        const rel = (new URL(url, 'http://x').searchParams.get('path') || '').replace(/\\/g, '/');
        const full = normalize(join(ROOT, rel));
        const allowed = [join(TOOLS, 'build', 'img', slug), join(CASES, slug, 'production', 'manual'), join(ROOT, 'assets', slug, 'real-library'), join(TOOLS, 'build', 'clips'), join(TOOLS, 'build', 'preview', slug)];
        if (!allowed.some(a => full.startsWith(a)) || !existsSync(full) || statSync(full).isDirectory()) return send(res, 404, 'not found', 'text/plain');
        return streamFile(req, res, full);
      }

      // 單槽重抓：改提示詞/換來源抓素材（spawn make-demo --only-slot，吃渲染鎖；UI 輪詢 /api/render-status）
      if (path === '/api/slot/refetch' && req.method === 'POST') {
        const { slug, seg, slot, mode, query, prompt } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '')) return sendJson(res, 400, { ok: false, error: 'slug 不合法' });
        if (!intOk(seg) || !intOk(slot)) return sendJson(res, 400, { ok: false, error: 'seg/slot 不合法' });
        const args = ['--only-slot', `${seg}:${slot}`];
        if (mode && ['video', 'real-photo', 'illust'].includes(mode)) args.push('--set-mode', mode);
        if (query && String(query).trim()) args.push('--set-query', String(query).trim().slice(0, 200));
        if (prompt && String(prompt).trim()) args.push('--set-prompt', String(prompt).trim().slice(0, 400));
        const r = startMakeDemo(args, slug); return sendJson(res, r.code, r.body);
      }

      // 單槽 AI 重生（spawn make-demo --regen-slot）
      if (path === '/api/slot/regen' && req.method === 'POST') {
        const { slug, seg, slot, prompt } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '')) return sendJson(res, 400, { ok: false, error: 'slug 不合法' });
        if (!intOk(seg) || !intOk(slot)) return sendJson(res, 400, { ok: false, error: 'seg/slot 不合法' });
        const args = ['--regen-slot', `${seg}:${slot}`];
        if (prompt && String(prompt).trim()) args.push('--set-prompt', String(prompt).trim().slice(0, 400));
        const r = startMakeDemo(args, slug); return sendJson(res, r.code, r.body);
      }

      // 刪除單槽：清 build/img 自動快取＋manual 覆寫＋manifest 該槽 file（退回空，待重抓/重渲）
      if (path === '/api/slot/delete' && req.method === 'POST') {
        const { slug, seg, slot } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '') || !intOk(seg) || !intOk(slot)) return sendJson(res, 400, { ok: false, error: '參數不合法' });
        if (render.running) return sendJson(res, 409, { ok: false, error: '渲染進行中，請稍後' });
        const dirs = [join(TOOLS, 'build', 'img', slug), join(CASES, slug, 'production', 'manual')];
        let removed = 0;
        for (const dir of dirs) for (const ext of ['mp4', 'jpg', 'ai.jpg', 'png', 'webp', 'webm', 'mov', 'gif', 'jpeg']) {
          const f = join(dir, `s${seg}_${slot}.${ext}`); if (existsSync(f)) { try { unlinkSync(f); removed++; } catch { } }
        }
        clearManifestSlot(slug, seg, slot);
        return sendJson(res, 200, { ok: true, removed });
      }

      // 歸檔單槽：移到 production/_archive/（保留可復原），清 manifest 該槽
      if (path === '/api/slot/archive' && req.method === 'POST') {
        const { slug, seg, slot } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '') || !intOk(seg) || !intOk(slot)) return sendJson(res, 400, { ok: false, error: '參數不合法' });
        if (render.running) return sendJson(res, 409, { ok: false, error: '渲染進行中，請稍後' });
        const arc = join(CASES, slug, 'production', '_archive'); mkdirSync(arc, { recursive: true });
        const ts = ymd() + '-' + Date.now();
        const dirs = [join(TOOLS, 'build', 'img', slug), join(CASES, slug, 'production', 'manual')];
        let moved = 0;
        for (const dir of dirs) for (const ext of ['mp4', 'jpg', 'ai.jpg', 'png', 'webp', 'webm', 'mov', 'gif', 'jpeg']) {
          const f = join(dir, `s${seg}_${slot}.${ext}`);
          if (existsSync(f)) { try { copyFileSync(f, join(arc, `s${seg}_${slot}.${ts}.${ext}`)); unlinkSync(f); moved++; } catch { } }
        }
        clearManifestSlot(slug, seg, slot);
        return sendJson(res, 200, { ok: true, moved });
      }

      // 收進素材庫：把目前槽素材複製進 assets/<slug>/real-library/，追加 MANIFEST.csv（clearance=🟡待人工確認）
      if (path === '/api/slot/save-to-library' && req.method === 'POST') {
        const { slug, seg, slot } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '') || !intOk(seg) || !intOk(slot)) return sendJson(res, 400, { ok: false, error: '參數不合法' });
        const file = currentSlotFile(slug, seg, slot);
        if (!file) return sendJson(res, 404, { ok: false, error: '此槽尚無素材可收藏' });
        const ext = extname(file).slice(1).toLowerCase() || 'jpg';
        const isVid = /^(mp4|webm|mov|gif)$/i.test(ext);
        const RL = join(ROOT, 'assets', slug, 'real-library');
        const dstDir = join(RL, isVid ? 'video' : 'images'); mkdirSync(dstDir, { recursive: true });
        const base = file.split(/[\\/]/).pop();
        const fname = `${ymd()}_real-${fileSlug('slot-' + seg + '-' + slot + '-' + base)}.${ext}`;
        const dst = join(dstDir, fname);
        try { if (!existsSync(dst)) copyFileSync(file, dst); } catch (e) { return sendJson(res, 500, { ok: false, error: String(e) }); }
        try {
          appendManifest(join(RL, 'MANIFEST.csv'), [{
            filename: fname, type: isVid ? 'video' : 'image', category: categoryOf(base, isVid ? 'video' : 'image'),
            description: `素材檢視台收藏（段 ${seg}.${slot}）`, source: 'segment-editor', source_url: '',
            license_type: '待人工確認', attribution: 'see file page', commercial_ok: 'Y',
            deidentify: SENSITIVE_RE.test(base) ? 'Y' : 'N', clearance: '🟡待人工確認', notes: '由素材檢視台收進庫',
          }]);
        } catch { }
        return sendJson(res, 200, { ok: true, filename: fname });
      }

      // 挑片：列 Wikimedia Commons 候選（不下載），供 gallery 選一。query 預設＝該槽現有查詢詞。
      if (path === '/api/slot/candidates' && req.method === 'GET') {
        const q = new URL(url, 'http://x').searchParams;
        const slug = (q.get('slug') || '').replace(/[^a-z0-9-]/g, '');
        const query = (q.get('query') || '').trim();
        if (!slug || !query) return sendJson(res, 400, { ok: false, error: '缺 slug 或 query' });
        const list = await searchCommonsCandidates(query, { limit: 12 });
        const cands = list.map(c => ({
          url: c.url, title: c.title, license: c.license, creator: c.creator,
          source: c.descriptionurl || c.url, video: /^video\//i.test(c.mime || ''), mime: c.mime || '', size: c.size || 0,
        }));
        return sendJson(res, 200, { ok: true, query, candidates: cands });
      }

      // 挑片 commit：下載選定候選 → manual 覆寫（sN_k.<ext>＋.real 標記＝真實、不烙示意圖）＋更新 manifest
      if (path === '/api/slot/pick' && req.method === 'POST') {
        const { slug, seg, slot, url: mediaUrl, video, license, creator, title, source } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '') || !intOk(seg) || !intOk(slot)) return sendJson(res, 400, { ok: false, error: '參數不合法' });
        if (!/^https?:\/\//.test(mediaUrl || '')) return sendJson(res, 400, { ok: false, error: 'url 不合法' });
        const mdir = join(CASES, slug, 'production', 'manual'); mkdirSync(mdir, { recursive: true });
        const m = String(mediaUrl).match(/\.([a-z0-9]+)(?:\?|$)/i);
        const rawExt = (m ? m[1] : (video ? 'webm' : 'jpg')).toLowerCase();
        const ext = video ? (/(webm|mp4|mov)/.test(rawExt) ? rawExt : 'webm') : (/(png|webp|gif|jpe?g)/.test(rawExt) ? rawExt.replace('jpeg', 'jpg') : 'jpg');
        for (const e of ['mp4', 'webm', 'mov', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'real']) { const f = join(mdir, `s${seg}_${slot}.${e}`); if (existsSync(f)) { try { unlinkSync(f); } catch { } } }
        const dst = join(mdir, `s${seg}_${slot}.${ext}`);
        // 圖片抓 Commons 縮放版（1920 寬）而非全解析度原圖（避免 20MB+ 拖慢渲染）；影片用原 url。
        const dlUrl = (!video && title) ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(String(title))}?width=1920` : mediaUrl;
        let okDl = await downloadTo(dlUrl, dst, { minBytes: 2000, timeoutMs: 60000 });
        if (!okDl && dlUrl !== mediaUrl) okDl = await downloadTo(mediaUrl, dst, { minBytes: 2000, timeoutMs: 60000 });
        if (!okDl) return sendJson(res, 500, { ok: false, error: '下載候選失敗' });
        writeFileSync(join(mdir, `s${seg}_${slot}.real`), '', 'utf8');   // Commons＝真實、不烙示意圖
        setManifestSlot(slug, seg, slot, { type: video ? 'video' : 'image', tier: 'real', provider: 'Commons-pick', title: title || '', creator: creator || '', license: license || '', source: source || mediaUrl, isManual: true, file: relRoot(dst) });
        return sendJson(res, 200, { ok: true, file: `s${seg}_${slot}.${ext}` });
      }

      // 單段預覽：spawn make-demo --only-seg N（用已抓素材＋快取語音合一段預覽，吃渲染鎖）
      if (path === '/api/segment/preview' && req.method === 'POST') {
        const { slug, seg } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '') || !intOk(seg)) return sendJson(res, 400, { ok: false, error: '參數不合法' });
        const r = startMakeDemo(['--only-seg', String(seg)], slug); return sendJson(res, r.code, r.body);
      }

      // 設為原聲：標記該段改用影片原聲（寫 audio-overrides.json，整片重渲與單段預覽皆生效）
      if (path === '/api/segment/set-original-audio' && req.method === 'POST') {
        const { slug, seg, on } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '') || !intOk(seg)) return sendJson(res, 400, { ok: false, error: '參數不合法' });
        const dir = join(CASES, slug, 'production'); mkdirSync(dir, { recursive: true });
        const p = join(dir, 'audio-overrides.json');
        let ov = {}; try { ov = JSON.parse(readFileSync(p, 'utf8')) || {}; } catch { }
        if (on) ov[String(seg)] = 'original'; else delete ov[String(seg)];
        writeFileSync(p, JSON.stringify(ov, null, 2), 'utf8');
        return sendJson(res, 200, { ok: true, original: !!on });
      }

      if (path === '/api/select' && req.method === 'POST') {
        const { rank, selected } = await readBody(req);
        const p = join(ROOT, 'pipeline', 'radar-shortlist.md');
        const lines = readFileSync(p, 'utf8').split(/\r?\n/);
        let hit = false;
        for (let i = 0; i < lines.length; i++) {
          const c = lines[i].split('|').map(s => s.trim());
          if (/^\[[ x]\]$/i.test(c[1] || '') && Number(c[2]) === Number(rank)) {
            lines[i] = lines[i].replace(/\[[ x]\]/i, selected ? '[x]' : '[ ]');
            hit = true; break;
          }
        }
        if (!hit) return sendJson(res, 404, { ok: false, error: '找不到該排名' });
        writeFileSync(p, lines.join('\n'), 'utf8');
        return sendJson(res, 200, { ok: true });
      }

      if (path === '/api/build' && req.method === 'POST') {
        const { slug } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '')) return sendJson(res, 400, { ok: false, error: 'slug 不合法' });
        try { const out = execFileSync(process.execPath, [join(TOOLS, 'build-episode.mjs'), '--slug', slug], { cwd: ROOT, encoding: 'utf8' }); return sendJson(res, 200, { ok: true, out }); }
        catch (e) { return sendJson(res, 500, { ok: false, error: String(e.stderr || e.message || e) }); }
      }

      // 腳本頁編輯器：覆寫 script-natural.md（含每段〔畫面：…〕標籤），存完即重建 episode.json
      if (path === '/api/script-save' && req.method === 'POST') {
        const { slug, markdown } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '')) return sendJson(res, 400, { ok: false, error: 'slug 不合法' });
        const dir = join(CASES, slug);
        if (!existsSync(dir)) return sendJson(res, 404, { ok: false, error: '找不到案件' });
        const md = String(markdown || '');
        if (!/^##\s+\[/m.test(md)) return sendJson(res, 400, { ok: false, error: '內容不像腳本（缺少 ## [段落] 標頭），未存檔' });
        writeFileSync(join(dir, 'script-natural.md'), md, 'utf8');
        let build = '';
        try { build = execFileSync(process.execPath, [join(TOOLS, 'build-episode.mjs'), '--slug', slug], { cwd: ROOT, encoding: 'utf8' }); }
        catch (e) { return sendJson(res, 200, { ok: true, saved: true, build: false, error: String(e.stderr || e.message || e) }); }
        return sendJson(res, 200, { ok: true, saved: true, build: true, out: build });
      }

      if (path === '/api/render' && req.method === 'POST') {
        const { slug, voice } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '')) return sendJson(res, 400, { ok: false, error: 'slug 不合法' });
        if (render.running) return sendJson(res, 409, { ok: false, error: '已有渲染進行中：' + render.slug });
        render.running = true; render.slug = slug;
        const logFd = openSync(render.log, 'a');
        // voice===false → 無語音版（PILOT_NOVOICE）：旁白靜音、畫面/字幕/BGM 照常；其餘（含 cockpit 既有渲染鈕）維持含語音
        const env = { ...process.env, ...(voice === false ? { PILOT_NOVOICE: '1' } : {}) };
        const child = spawn(process.execPath, [join(TOOLS, 'make-demo.mjs'), '--slug', slug], { cwd: ROOT, stdio: ['ignore', logFd, logFd], env });
        child.on('exit', () => { render.running = false; render.slug = null; });
        child.on('error', () => { render.running = false; render.slug = null; });
        return sendJson(res, 200, { ok: true, started: slug, voice: voice !== false });
      }

      if (path === '/api/render-status' && req.method === 'GET') {
        let tail = '';
        try { const t = readFileSync(render.log, 'utf8'); tail = t.slice(-1500); } catch { }
        return sendJson(res, 200, { running: render.running, slug: render.slug, tail });
      }

      if (path === '/api/intake' && req.method === 'POST') {
        const { title, materials } = await readBody(req);
        if (!title || !String(title).trim()) return sendJson(res, 400, { ok: false, error: '缺少題目' });
        const slug = slugify(String(title));
        if (!/^[a-z0-9-]+$/.test(slug)) return sendJson(res, 400, { ok: false, error: '題目需含英文或數字以產生 slug（可在題目加註英文）' });
        const dir = join(CASES, slug);
        try { mkdirSync(dir, { recursive: true }); } catch { }
        const mat = String(materials || '').trim();
        const urls = mat.match(/https?:\/\/[^\s)]+/g) || [];
        const body = [
          `# 投稿素材 — ${String(title).trim()}`, '',
          '> 由製作工作台 intake 表單建立，作為 deep-research 的起始素材。',
          '> Claude 執行 deep-research 時應讀本檔、爬取下列連結查證，再寫 dossier/factcheck。', '',
          `- slug: ${slug}`, '',
          '## 貼上的素材', '', mat || '（無）', '',
          '## 偵測到的連結（待 Claude 爬取查證）', '',
          urls.length ? urls.map(u => `- ${u}`).join('\n') : '（無）', '',
        ].join('\n');
        writeFileSync(join(dir, 'intake.md'), body, 'utf8');
        return sendJson(res, 200, { ok: true, slug, urls: urls.length });
      }

      if (path === '/api/run' && req.method === 'POST') {
        const { slug, step } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '')) return sendJson(res, 400, { ok: false, error: 'slug 不合法' });
        if (!['research', 'arc', 'script', 'tts', 'package', 'production'].includes(step)) return sendJson(res, 400, { ok: false, error: '不支援的步驟' });
        if (claudeRun.running) return sendJson(res, 409, { ok: false, error: '已有 Claude 任務進行中：' + claudeRun.slug + ' / ' + claudeRun.step });
        let title = slug;
        const tp = parseTopics().find(x => x.slug === slug); if (tp && tp.title) title = tp.title;
        const cc = parseCases().find(x => x.slug === slug); if (cc && cc.title && cc.title !== slug) title = cc.title;
        title = String(title).replace(/"/g, '');
        const guard = '你在「Pilot 調查員」懸案頻道製作專案根目錄。用本專案既有 Skill 工具執行指定 workflow；全程不要詢問或等待確認，完成後結束。嚴守 brand/legal-redlines.md。';
        const prompts = {
          research: guard + `\n執行 skill「deep-research」，args={"slug":"${slug}","title":"${title}"}。若 cases/${slug}/intake.md 存在，先讀它並用 WebFetch 爬取其中連結作為素材。完成 cases/${slug}/dossier.md 與 factcheck.md。`,
          arc: guard + `\n執行 skill「story-arc」，args={"slug":"${slug}","lengthMin":20}。完成 cases/${slug}/story-arc.md。`,
          script: guard + `\n執行 skill「script-studio」，args={"slug":"${slug}","lengthMin":20}。只完成 cases/${slug}/script-natural.md 與 legal-review.md（每段含〔畫面：…〕標籤、含 [INTRO] 打字機日期卡與 [ENDING] 片尾）；先不要產 TTS 稿，待人工在腳本頁定稿後再生成。`,
          tts: guard + `\n執行 skill「script-tts」，args={"slug":"${slug}"}。讀已定稿的 cases/${slug}/script-natural.md，產 cases/${slug}/script-tts.md（HOST／INTRO／ENDING 段一併轉 SSML）。`,
          package: guard + `\n執行 skill「production-package」，args={"slug":"${slug}"}。完成 cases/${slug}/production/ 內容。`,
          production: guard + `\n執行 skill「production-package」，args={"slug":"${slug}"}。完成 cases/${slug}/production/ 內容。`,
        };
        claudeRun.running = true; claudeRun.slug = slug; claudeRun.step = step;
        let logFd; try { logFd = openSync(claudeRun.log, 'w'); } catch { claudeRun.running = false; return sendJson(res, 500, { ok: false, error: '無法建立 log' }); }
        // 工具權限由 .claude/settings.json 白名單預先授權；不使用 bypassPermissions（Option C）。
        // --output-format stream-json --verbose：逐事件串流（工具呼叫/訊息），讓前端能即時顯示進度，而非等到結束才出現。
        const child = spawn('claude', ['-p', '--verbose', '--output-format', 'stream-json', '--permission-mode', 'acceptEdits'], { cwd: ROOT, stdio: ['pipe', logFd, logFd], shell: true });
        child.on('exit', () => { claudeRun.running = false; });
        child.on('error', () => { claudeRun.running = false; });
        try { child.stdin.write(prompts[step]); child.stdin.end(); } catch { }
        return sendJson(res, 200, { ok: true, started: { slug, step } });
      }

      if (path === '/api/run-status' && req.method === 'GET') {
        let tail = '';
        try { tail = readFileSync(claudeRun.log, 'utf8').slice(-12000); } catch { }
        return sendJson(res, 200, { running: claudeRun.running, slug: claudeRun.slug, step: claudeRun.step, tail });
      }

      // 貼圖台（Plan B）：列出可貼圖鏡頭＋已貼圖
      if (path.startsWith('/api/shots/') && req.method === 'GET') {
        const slug = path.replace('/api/shots/', '').replace(/\/$/, '');
        const ep = join(CASES, slug, 'episode.json');
        if (!existsSync(ep)) return sendJson(res, 404, { error: 'no episode' });
        let data; try { data = JSON.parse(readFileSync(ep, 'utf8')); } catch { return sendJson(res, 500, { error: 'bad episode.json' }); }
        const mdir = join(CASES, slug, 'production', 'manual');
        const manual = existsSync(mdir) ? readdirSync(mdir) : [];
        const shots = (data.segments || []).filter(s => s.kind === 'narration')
          .map(s => ({ n: s.narrIndex, heading: s.heading, manual: manual.filter(f => f.startsWith('s' + s.narrIndex + '_') && !f.endsWith('.real')) }));
        return sendJson(res, 200, { slug, title: data.title, shots });
      }

      // 貼圖台：讀回已貼的縮圖（cases/ 不在 web 靜態根，需此端點提供）
      if (path.startsWith('/api/manual/') && req.method === 'GET') {
        const [slug, file] = path.replace('/api/manual/', '').split('/');
        if (!slug || !file || /[\\/]/.test(file) || file.includes('..')) return send(res, 400, 'bad', 'text/plain');
        const full = normalize(join(CASES, slug, 'production', 'manual', file));
        if (!full.startsWith(join(CASES, slug)) || !existsSync(full)) return send(res, 404, 'not found', 'text/plain');
        const type = MIME[extname(full).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': statSync(full).size });
        return createReadStream(full).pipe(res);
      }

      // 貼圖台：上傳手動貼圖 → cases/<slug>/production/manual/sN_k.<ext>
      if (path.startsWith('/api/manual/') && req.method === 'POST') {
        const [slug, name] = path.replace('/api/manual/', '').split('/');
        if (!/^[a-z0-9-]+$/.test(slug || '') || !/^s\d+_\d+$/.test(name || '')) return sendJson(res, 400, { ok: false, error: 'bad name（需 /api/manual/<slug>/s<段>_<槽>）' });
        const ct = (req.headers['content-type'] || '').toLowerCase();
        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('mp4') ? 'mp4' : ct.includes('webm') ? 'webm' : (ct.includes('jpeg') || ct.includes('jpg')) ? 'jpg' : null;
        if (!ext) return sendJson(res, 415, { ok: false, error: '不支援的型別：' + ct });
        const dir = join(CASES, slug, 'production', 'manual');
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
          try {
            const buf = Buffer.concat(chunks);
            if (buf.length < 1000) return sendJson(res, 400, { ok: false, error: '檔案過小／空' });
            mkdirSync(dir, { recursive: true });
            for (const e of ['png', 'webp', 'mp4', 'webm', 'jpg', 'jpeg', 'mov']) { const f = join(dir, name + '.' + e); if (existsSync(f)) try { unlinkSync(f); } catch { } }
            writeFileSync(join(dir, name + '.' + ext), buf);
            sendJson(res, 200, { ok: true, file: name + '.' + ext });
          } catch (e) { sendJson(res, 500, { ok: false, error: String(e) }); }
        });
        return;
      }

      return sendJson(res, 404, { error: 'unknown api' });
    }
    return serveStatic(req, res, url);
  } catch (e) {
    return send(res, 500, String(e.message || e), 'text/plain; charset=utf-8');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Pilot 製作工作台 → http://localhost:${PORT}（僅本機 127.0.0.1）\n  選題庫＝pipeline/radar-shortlist.md｜集數庫＝cases/ + pipeline/status.md\n  貼圖台（Plan B 手動補圖）→ http://localhost:${PORT}/manual.html\n  Ctrl+C 結束。\n`);
});
