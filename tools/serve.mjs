// tools/serve.mjs
// Pilot 調查員 製作工作台（本機伺服器，零 npm 依賴）。
// 把「選題庫 (radar-shortlist.md) → 集數庫 (cases/ + status.md) → 渲染」串成可操作工作流。
// 啟動：node tools/serve.mjs   然後開 http://localhost:8787
//
// 能點擊執行的（本機確定性步驟）：勾選案件、build-episode、make-demo 渲染、預覽各階段文件。
// Claude 驅動的步驟（deep-research / story-arc / script-studio / production-package）會顯示「在 Claude Code 執行」指令，
// 並依檔案存在自動偵測完成度——伺服器不代跑 Claude workflow（成本與隔離考量）。
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, createReadStream, openSync, mkdirSync, unlinkSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TOOLS);
const WEB = join(ROOT, 'web');
const CASES = join(ROOT, 'cases');
const PORT = Number(process.env.PORT) || 8787;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

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
    let title = slug, narr = 0, host = 0, chars = 0, subs = 0;
    if (stages.episode) { try { const e = JSON.parse(readFileSync(join(CASES, slug, 'episode.json'), 'utf8')); title = e.title || slug; const sg = e.segments || []; narr = sg.filter(s => s.kind !== 'host').length; host = sg.filter(s => s.kind === 'host').length; for (const s of sg) { const t = s.narration || ''; chars += t.length; subs += t.split(/[。！？!?；;…\n]/).filter(x => x.trim()).length; } } catch { } }
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
    out.push({ slug, title, stages, narr, host, chars, subs, docs, docMeta, video, realLib, realLibTotal, status: sm[slug]?.status || '', note: sm[slug]?.note || '' });
  }
  return out;
}

// ---- helpers ----
const send = (res, code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
const sendJson = (res, code, obj) => send(res, code, JSON.stringify(obj));
function readBody(req) { return new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); }); }

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
        const { slug } = await readBody(req);
        if (!/^[a-z0-9-]+$/.test(slug || '')) return sendJson(res, 400, { ok: false, error: 'slug 不合法' });
        if (render.running) return sendJson(res, 409, { ok: false, error: '已有渲染進行中：' + render.slug });
        render.running = true; render.slug = slug;
        const logFd = openSync(render.log, 'a');
        const child = spawn(process.execPath, [join(TOOLS, 'make-demo.mjs'), '--slug', slug], { cwd: ROOT, stdio: ['ignore', logFd, logFd] });
        child.on('exit', () => { render.running = false; render.slug = null; });
        child.on('error', () => { render.running = false; render.slug = null; });
        return sendJson(res, 200, { ok: true, started: slug });
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
          .map(s => ({ n: s.narrIndex, heading: s.heading, manual: manual.filter(f => f.startsWith('s' + s.narrIndex + '_')) }));
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
