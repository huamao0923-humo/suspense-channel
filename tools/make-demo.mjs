// tools/make-demo.mjs  (v2)
// 合成 Pilot 調查員 demo 影片：Zhiwei 男聲 + Pollinations AI 生成畫面 + Ken Burns + 燒錄字幕。
// 依賴：tools/winrt-tts.ps1、ffmpeg、ffprobe、網路（Pollinations 生圖）。零 npm 依賴。
import './load-env.mjs';   // 先把 .env 的 PEXELS_KEY / YOUTUBE_API_KEY 灌進 process.env（不依賴 shell 繼承）
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SNOWTOWN_SEG_CATEGORIES, SNOWTOWN_SEG_REAL, termsForCategories } from './shot-vocab.js';
import { fetchRealImage, parseCsvLine, appendManifest, categoryOf, fileSlug, SENSITIVE_RE } from './fetch-real.mjs';
import * as azureTts from './azure-tts.mjs';
import { renderChartClip } from './relations-chart.mjs';
import { renderStatsClip } from './stats-chart.mjs';
import { renderTimelineClip } from './timeline-chart.mjs';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TOOLS);
const BUILD = join(TOOLS, 'build');
const HEADS = join(BUILD, 'heads'), FONTS = join(BUILD, 'fonts'), CLIPS = join(BUILD, 'clips');
const OUTDIR = join(ROOT, 'web', 'media');
for (const d of [BUILD, HEADS, FONTS, CLIPS, OUTDIR]) mkdirSync(d, { recursive: true });
const FONT = join(FONTS, 'msjh.ttc');
if (!existsSync(FONT)) copyFileSync('C:/Windows/Fonts/msjh.ttc', FONT);

// 案件參數化：--slug，預設雪鎮
const argSlug = (() => { const i = process.argv.indexOf('--slug'); return i >= 0 ? process.argv[i + 1] : null; })();
const SLUG = argSlug || 'snowtown-murders';
// 單段/單槽操作旗標（供「逐段素材檢視台」）：給定時只處理該槽/段、更新 manifest 後退出，不重渲整片。
const _arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? (process.argv[i + 1] ?? '') : null; };
const ONLY_SLOT = _arg('--only-slot');    // "N:K" 重抓單槽（依 --set-mode/--set-query/--set-prompt）
const REGEN_SLOT = _arg('--regen-slot');  // "N:K" 強制 AI 重生單槽
const SET_MODE = _arg('--set-mode');      // video | real-photo | illust
const SET_QUERY = _arg('--set-query');    // 自訂查詢詞（最高優先）
const SET_PROMPT = _arg('--set-prompt');  // 自訂 AI 提示詞
const ONLY_SEG = _arg('--only-seg');      // "N" 只重渲該段、輸出預覽（L1c）
const SINGLE_SLOT_MODE = !!(ONLY_SLOT || REGEN_SLOT);
const CASE = join(ROOT, 'cases', SLUG);
// 音檔/圖快取依 slug 分名，避免跨案件污染（曾發生 GSK 誤用雪鎮殘留圖）；換案件不必再手動清快取
const AUDIO = join(BUILD, 'audio', SLUG), IMG = join(BUILD, 'img', SLUG);
mkdirSync(AUDIO, { recursive: true }); mkdirSync(IMG, { recursive: true });
// 渲染鎖：build/clips、heads、visuals/host-trim 等為跨案共用、非 slug 命名 → 兩個 make-demo 並行會互相覆寫 clip。
// 上鎖序列化；偵測到另一個渲染進行中就明確退出（殘鎖可手動刪 .render.lock）。設 PILOT_NOLOCK=1 跳過。
if (process.env.PILOT_NOLOCK !== '1') {
  const LOCK = join(BUILD, '.render.lock');
  if (existsSync(LOCK)) {
    let alive = false, info = '';
    try { const j = JSON.parse(readFileSync(LOCK, 'utf8')); info = `${j.slug} pid=${j.pid}`; try { process.kill(j.pid, 0); alive = true; } catch { } } catch { }
    if (alive) { console.error(`✋ 另一個渲染進行中（${info}）正佔用共用 build/ 目錄。請等它結束再跑；確定是殘鎖才刪：${LOCK}`); process.exit(2); }
  }
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, slug: SLUG, t: Date.now() }), 'utf8');
  const release = () => { try { if (existsSync(LOCK)) { const j = JSON.parse(readFileSync(LOCK, 'utf8')); if (j.pid === process.pid) unlinkSync(LOCK); } } catch { } };
  process.on('exit', release);
  process.on('SIGINT', () => { release(); process.exit(130); });
  process.on('SIGTERM', () => { release(); process.exit(143); });
}
const HOST_IMG = join(ROOT, 'brand', 'assets', 'host-reference.png'); // 調查員 Pilot 主參考圖（定格出鏡）
const MANUAL = join(CASE, 'production', 'manual'); // Plan B：手動貼圖（GPT 生圖等）放這，命名 sN_k.png/jpg/mp4，渲染最高優先

const RATE = '1.05', PITCH = '0.9';     // 語速（僅 WinRT 備援用）
const SPEED = Number(process.env.PILOT_SPEED || '1.18'); // 旁白語速：VoxCPM 不吃 RATE → 用 atempo 變速不變調
const FPS = 30, MAXSHOT = Number(process.env.PILOT_MAXSHOT || '5'); // 每個畫面最長秒數（超過就換素材；10 仍跟不上旁白＝圖落後一段，降到 5 讓換圖≈換句）
const BGM_VOL = 0.08;                   // BGM 僅鋪底（原 0.16 太大）
const CRF = Number(process.env.PILOT_CRF || '20'); // x264 畫質（越低越清晰/越大）；靜態圖內容 20 比預設 23 乾淨、檔案約 ×1.6
const BGM_END_VOL = Number(process.env.PILOT_BGM_END || '0.26'); // 片尾謝幕段 BGM 轉強（旁白已結束，讓收尾音樂浮上來）
const SUB_SIZE = Number(process.env.PILOT_SUBSIZE || '72'); // 燒錄字幕字級（再大一級；配窄邊距、每條≤2 行）
const SUB_WRAP = Number(process.env.PILOT_SUBWRAP || '18'); // 每行字幕最多字數（72 級配 18 字剛好不超寬）
const PAUSE = Number(process.env.PILOT_PAUSE || '0.8'); // 段落間停頓秒數（呼吸感／轉場；語速仍 1.15）
const REFETCH = process.env.PILOT_REFETCH === '1'; // =1 時跳過 img 快取、強制重抓素材（換來源/換案件時用）
const NOVOICE = process.env.PILOT_NOVOICE === '1'; // =1 不烙合成語音：旁白/解說員段改「估算時長的靜音」，畫面＋字幕＋BGM＋打字機音效照常（供無語音版／日後配真人聲）
const TITLE_SIZE = 60;                  // 逐段標題字級（原 44）
const HOST_NAME = 'Pilot · 調查員';     // 解說員出鏡時的姓名字卡
// Plan A 示意圖（沒真實素材時的補圖）：來源後端可切——
//   pollinations：雲端文字生圖，免 key 免安裝（預設，與 gen-host.mjs 同路）
//   local / a1111：你本機 GPU 的 Stable Diffusion WebUI / Forge（POST /sdapi/v1/txt2img）
//   off：不生 AI，直接退灰底圖卡
const ILLUST = (process.env.PILOT_ILLUST || 'pollinations').toLowerCase();
const SD_URL = process.env.SD_URL || 'http://127.0.0.1:7860';   // local 後端位址
const ILLUST_LABEL = process.env.PILOT_ILLUST_LABEL || '示意圖'; // 法律紅線：AI／圖卡一律烙印「非真實畫面」
const ILLUST_FIRST = process.env.PILOT_ILLUST_FIRST === '1'; // 全片卡通：旁白段一律 AI 卡通示意，跳過實拍/CC，與卡通主持人風格統一
// 示意圖畫風（PILOT_ILLUST_STYLE）：cartoon（預設，卡通）/ anime / storybook / noir（原暗色寫實插畫）；
// 也可直接給一段自訂風格字串。卡通系一律壓低彩度、保留沉穩懸疑感，避免過於歡樂牴觸案件語氣。
const ILLUST_STYLES = {
  realistic: 'photorealistic cinematic documentary still, dramatic chiaroscuro lighting, cold desaturated palette, film grain, shallow depth of field, realistic textures and materials, true-crime investigative tone, historically accurate period detail, photographic',
  cartoon: 'flat 2D cartoon illustration, bold clean outlines, cel shading, simple flat shapes, muted desaturated palette, somber mood, modern animated explainer style, non-photorealistic',
  anime: 'anime illustration, clean line art, soft cel shading, cool desaturated moody palette, somber, non-photorealistic',
  storybook: 'hand-drawn storybook illustration, ink and watercolor, textured paper, muted dark tones, non-photorealistic',
  noir: 'dark editorial illustration, stylized non-photorealistic, conceptual, cinematic noir',
};
// 預設寫實電影感（使用者要求）；仍烙印「示意圖」浮水印＋下方 illustPrompt 強制 no recognizable faces，避免被誤認真實證據（legal-redlines）。
const ILLUST_STYLE = process.env.PILOT_ILLUST_STYLE || 'realistic';
const STYLE_TEXT = ILLUST_STYLES[ILLUST_STYLE] || ILLUST_STYLE;
// 調查員稍微卡通化：把現有 host 影片／定格用 ffmpeg 風格化（免重生外部影片，可調濃淡）。PILOT_HOST_CARTOON=0 關閉。
// 預設不卡通化（使用者要寫實）：卡通 edgedetect 逐幀描邊本身會閃動＝加重「抽動」觀感。要卡通才設 PILOT_HOST_CARTOON=1。
const HOST_CARTOON = process.env.PILOT_HOST_CARTOON === '1';
const HOST_CARTOON_OP = process.env.PILOT_HOST_CARTOON_OP || '0.5';   // 0=原樣～1=全卡通；0.5=稍微
const HOST_CARTOON_SAT = process.env.PILOT_HOST_CARTOON_SAT || '1.3'; // 卡通層彩度
// 解說員鎖鏡：模型（Veo/Kling…）常自帶推鏡，提示詞擋不住 → 用 vidstab 反向穩定壓成定鏡。PILOT_HOST_LOCK=0 關。
const HOST_LOCK = process.env.PILOT_HOST_LOCK !== '0';
const HOST_LOCK_SMOOTH = process.env.PILOT_HOST_LOCK_SMOOTH || '100'; // 越大越像定鏡（壓掉慢推）；太大畫面會被裁更多
// 解說員循環：預設「只正放」＋環點交叉溶接（buildSeamlessLoop），避免倒放造成的不自然抽動；
// 真要回到舊的正放＋倒放 ping-pong 才設 PILOT_HOST_PINGPONG=1。
const HOST_PINGPONG = process.env.PILOT_HOST_PINGPONG === '1';

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opts });
const dur = (f) => parseFloat(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).trim());
function splitSentences(t) { const o = []; let b = ''; for (const c of t) { b += c; if ('。！？!?；;…\n'.includes(c)) { if (b.trim()) o.push(b.trim()); b = ''; } } if (b.trim()) o.push(b.trim()); return o; }
function assTime(s) { const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60; const sec = Math.floor(s); const cs = Math.round((s - sec) * 100); return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`; }
// 中文字幕斷行：保證最多 2 行（呼叫端已把每塊限在 ≤2*max 字）。
// 一行放得下就單行；否則就近中點切一刀（優先落在標點後），確保兩行皆 ≤max、不會擠出第 3 行。
function wrapCJK(t, max) {
  max = max || 20; t = (t || '').trim();
  if (t.length <= max) return t;
  const mid = Math.ceil(t.length / 2);
  let bp = -1, best = Infinity;
  for (let i = 1; i < t.length; i++) {
    if (/[，、；：,;:]/.test(t[i - 1]) && i <= max && (t.length - i) <= max) {
      const d = Math.abs(i - mid); if (d < best) { best = d; bp = i; }
    }
  }
  if (bp < 0) bp = Math.min(max, mid);
  return t.slice(0, bp) + '\\N' + t.slice(bp);
}
// 把一段旁白切成「每條 ≤ max 字」的字幕塊：先依句末標點，過長的句子再依逗號/頓號切，確保每條 ≤2 行
function subChunks(text, max) {
  const out = [];
  for (const sent of splitSentences(text)) {
    if (sent.length <= max) { out.push(sent); continue; }
    const parts = sent.split(/(?<=[，、；：,;:])/); let cur = '';
    for (const p of parts) {
      if ((cur + p).length > max && cur) { out.push(cur); cur = ''; }
      cur += p;
      while (cur.length > max) { out.push(cur.slice(0, max)); cur = cur.slice(max); }
    }
    if (cur) out.push(cur);
  }
  return out;
}

// 無縫正放循環：把一段乾淨的正放素材 src（時長 D）以「環點交叉溶接」鋪滿 cd 秒。
// 不倒放（避免人物倒著動的抽動）、不硬接（環點用 0.5s 溶接化掉跳格）→ 像連續自然影片。
function buildSeamlessLoop(src, D, cd, outPath) {
  const xf = 0.5;
  if (cd <= D + 0.05) {
    sh('ffmpeg', ['-y', '-t', cd.toFixed(3), '-i', src, '-an', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outPath]);
    return;
  }
  const copies = Math.max(2, Math.ceil((cd - xf) / (D - xf)));
  const inputs = []; for (let i = 0; i < copies; i++) inputs.push('-i', src);
  let fc = '', prev = '0:v', acc = D;
  for (let i = 1; i < copies; i++) {
    const off = (acc - xf).toFixed(3), o = (i === copies - 1) ? 'hlv' : `hl${i}`;
    fc += `[${prev}][${i}:v]xfade=transition=fade:duration=${xf}:offset=${off}[${o}];`;
    prev = o; acc = acc + D - xf;
  }
  fc = fc.replace(/;$/, '');
  sh('ffmpeg', ['-y', ...inputs, '-filter_complex', fc, '-map', '[hlv]', '-t', cd.toFixed(3), '-an', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outPath], { cwd: BUILD, maxBuffer: 1 << 27 });
}

// ---- 載入 episode.json（由 tools/build-episode.mjs 從 script-natural.md 產出，含解說員段）----
const epPath = join(CASE, 'episode.json');
if (!existsSync(epPath)) { console.error(`找不到 ${epPath}；請先跑：node tools/build-episode.mjs --slug ${SLUG}`); process.exit(1); }
const EP = JSON.parse(readFileSync(epPath, 'utf8')); const segs = EP.segments;
console.log(`載入 ${segs.length} 段（旁白 ${segs.filter(s => s.kind !== 'host').length} ／解說員 ${segs.filter(s => s.kind === 'host').length}）：${EP.title}`);

// ---- 人物關係圖（選配）：有 cases/<slug>/relations.json 時，指定的旁白段改用動態 org-chart 接管畫面 ----
const relPath = join(CASE, 'relations.json');
const RELATIONS = existsSync(relPath) ? JSON.parse(readFileSync(relPath, 'utf8')) : null;
const CHART_NARR = new Set(RELATIONS?.showOnNarrIndex || []);
if (RELATIONS) console.log(`關係圖：relations.json 已載入（${(RELATIONS.nodes || []).length} 節點），接管旁白段 ${[...CHART_NARR].join(',') || '（未指定）'}`);
// ---- 統計圖（選配）：有 cases/<slug>/stats.json 時，指定的旁白段改用統計長條圖接管畫面（與關係圖同機制）----
const statPath = join(CASE, 'stats.json');
const STATS = existsSync(statPath) ? JSON.parse(readFileSync(statPath, 'utf8')) : null;
const STAT_NARR = new Set(STATS?.showOnNarrIndex || []);
if (STATS) console.log(`統計圖：stats.json 已載入（${(STATS.bars || []).length} 長條），接管旁白段 ${[...STAT_NARR].join(',') || '（未指定）'}`);
// ---- 時間軸（選配）：有 cases/<slug>/timeline.json 時，指定的旁白段改用橫向時間軸接管畫面（與關係圖同機制）----
const tlPath = join(CASE, 'timeline.json');
const TIMELINE = existsSync(tlPath) ? JSON.parse(readFileSync(tlPath, 'utf8')) : null;
const TL_NARR = new Set(TIMELINE?.showOnNarrIndex || []);
if (TIMELINE) console.log(`時間軸：timeline.json 已載入（${(TIMELINE.events || []).length} 事件），接管旁白段 ${[...TL_NARR].join(',') || '（未指定）'}`);

// ---- 案件專屬真實素材關鍵詞（選配）：cases/<slug>/real-subjects.json＝{ narrIndex: ["搜尋詞", ...] }。
// 「真實圖片／調用影片」段優先用這些詞去 Wikimedia Commons 抓「該案的真實場景/地點/物件/檔案」（不含真人臉）。
const RSPath = join(CASE, 'real-subjects.json');
const REAL_SUBJ = existsSync(RSPath) ? (() => { try { return JSON.parse(readFileSync(RSPath, 'utf8')); } catch { return {}; } })() : {};
if (Object.keys(REAL_SUBJ).length) console.log(`真實素材詞庫：real-subjects.json 已載入（${Object.keys(REAL_SUBJ).length} 段指定真實搜尋詞）`);

// ---- 開場打字機日期卡 / 片尾收尾：就地插入「合成段」（不改 episode.json）。
//      順序＝解說員先 → 打字機 → 正片：打字機段插在第一個解說員段之後。片尾段接在最後。 ----
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// 打字機音效：只用「刻意放置的品牌檔」brand/assets/sfx/typewriter.*；否則用合成的「緩慢有力」敲擊聲。
// （移除 Openverse 自動抓取——那會拉到不可控的吵雜快速打字循環，正是使用者抱怨的來源。）
let TYPE_SFX = ['mp3', 'wav', 'm4a', 'ogg'].map(e => join(ROOT, 'brand', 'assets', 'sfx', 'typewriter.' + e)).find(f => existsSync(f)) || null;
console.log(TYPE_SFX ? '開場日期卡音效：品牌檔' : '開場日期卡音效：合成悶聲鍵盤敲擊聲（放 brand/assets/sfx/typewriter.mp3 可覆寫）');
if (EP.intro && (EP.intro.dateLines || []).length) {
  const chars = EP.intro.dateLines.reduce((a, l) => a + [...String(l)].length, 0) || 6;
  const d = clamp(chars * 0.12 + 1.0, 1.8, 3); // 打字加快、總長 ≤3s（原 8s 太久＝拖節奏）
  const hi = segs.findIndex(s => s.kind === 'host');
  segs.splice(hi >= 0 ? hi + 1 : 0, 0, { id: 'INTRO', kind: 'intro', heading: '', narration: '', dateLines: EP.intro.dateLines, _synthetic: true, _dur: d });
  console.log(`開場：牛皮紙日期卡（${EP.intro.dateLines.join(' / ')}，${d.toFixed(1)}s，插在解說員開場後）${TYPE_SFX ? '＋鍵盤音效' : '＋合成悶聲鍵盤敲擊聲'}`);
}
if (EP.ending) {
  const q = EP.ending.question || '', cr = EP.ending.credits || '';
  const qd = q ? clamp([...q].length * 0.16 + 2, 2.5, 7) : 0;
  const fd = 8, crd = cr ? clamp([...cr].length * 0.12 + 3, 4, 9) : 4;
  segs.push({ id: 'ENDING', kind: 'ending', heading: '', narration: '', ending: EP.ending, _synthetic: true, _dur: qd + fd + crd, _phases: { qd, fd, crd } });
  console.log(`片尾：懸念問句 → 真實素材 → 謝幕字卡（${(qd + fd + crd).toFixed(1)}s，BGM 收尾轉強 ${BGM_END_VOL}）`);
}
// ---- 中途牛皮紙時間卡（kind:'timecard'，由 build-episode 依腳本 [時間卡] 段產生）：標記為合成段。
//      牛皮紙＋打字機逐字敲出年代/時間，3–4s，無旁白，配悶聲鍵盤——年代跨度轉場用。----
for (const t of segs) {
  if (t.kind !== 'timecard') continue;
  const chars = (t.dateLines || []).reduce((a, l) => a + [...String(l)].length, 0) || 6;
  t._synthetic = true; t._dur = clamp(chars * 0.1 + 2.4, 3, 4);
  console.log(`時間卡：牛皮紙打字機（${(t.dateLines || []).join(' / ')}，${t._dur.toFixed(1)}s）`);
}

// ---- 解析 image-prompts.md → 每旁白段提示詞（編號＝narrIndex）----
const promptsBySeg = {};
const ipPath = join(CASE, 'production', 'image-prompts.md');
if (existsSync(ipPath)) {
  for (const blk of readFileSync(ipPath, 'utf8').split(/^##\s+/m).slice(1)) {
    const nl = blk.indexOf('\n'); const head = blk.slice(0, nl).trim();
    const m = head.match(/^(\d+)/); if (!m) continue;
    let body = blk.slice(nl + 1).replace(/```/g, '');
    const dash = body.indexOf('\n---'); if (dash >= 0) body = body.slice(0, dash);
    const prompt = body.replace(/\s+/g, ' ').trim();
    if (prompt) (promptsBySeg[+m[1]] ||= []).push(prompt);
  }
}
segs.forEach((s) => { if (s.kind === 'narration' && !promptsBySeg[s.narrIndex]?.length) promptsBySeg[s.narrIndex] = [s.imagePrompt || 'dark abandoned scene, cinematic, no people']; });

// 解說員定格圖：無 host-reference.png 時用灰底字卡備援
let hostImgPath = HOST_IMG;

// ---- 1. 逐段合成男聲 + 時長 ----
// TTS 引擎優先序：VoxCPM2 簽名聲線（共用 voice-engine，本機 GPU）→ Azure 磁性男聲 → 本機 WinRT Zhiwei。
const ENGINE = join(dirname(ROOT), 'voice-engine');
const ENGINE_PY = join(ENGINE, '.venv', 'Scripts', 'python.exe');
const SIG_WAV = join(ENGINE, 'voices', 'signature', 'reference.wav');
// 共用語音引擎就緒（venv + tts.py + 簽名音都在）就自動啟用；設 PILOT_VOICE=off 可強制關閉。
const VOXCPM_ON = process.env.PILOT_VOICE !== 'off' && existsSync(ENGINE_PY) && existsSync(join(ENGINE, 'tts.py')) && existsSync(SIG_WAV);
const AZURE_ON = !VOXCPM_ON && !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
const AZURE_VOICE = process.env.AZURE_TTS_VOICE || 'zh-CN-YunjianNeural';
const winrtTTS = (txt, wav) => sh('powershell', ['-NoProfile', '-File', join(TOOLS, 'winrt-tts.ps1'), '-TextFile', txt, '-Out', wav, '-Rate', RATE, '-Pitch', PITCH]);
console.log(`TTS 引擎：${VOXCPM_ON ? 'VoxCPM2 簽名聲線（共用 voice-engine，本機 GPU）' : AZURE_ON ? 'Azure ' + AZURE_VOICE : 'WinRT Zhiwei（本機；放 voice-engine 簽名音或設 AZURE_SPEECH_KEY 可升級）'}`);

// 段落結構或台詞變更 → 失效舊的逐段語音快取，避免（1）索引錯位把音檔接到別段（2）改了台詞卻重用舊語音。
// sig 同時納入「段落 ID」與「台詞內容雜湊」：只要任一段文字被編輯，sig 即變、整案語音重生（最簡單、零誤接風險）。
{
  const djb2 = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const sigFile = join(AUDIO, '_sig.txt'), sig = (NOVOICE ? 'silent|' : 'voice|') + segs.map(s => s.id + ':' + djb2(s.narration || s.heading || '')).join(',');
  if (!existsSync(sigFile) || readFileSync(sigFile, 'utf8') !== sig) {
    for (const f of (existsSync(AUDIO) ? readdirSync(AUDIO) : [])) if (/^seg\d+\.wav$/.test(f)) { try { unlinkSync(join(AUDIO, f)); } catch { } }
    writeFileSync(sigFile, sig, 'utf8');
  }
}
// 合成段（打字機／片尾）：用打字機音效或靜音填出對應時長，讓既有 TTS／串接／字幕流程照常處理（不必特判）
// 打字機聲來源優先序：本地檔/Openverse（TYPE_SFX）＞ ffmpeg 合成敲擊聲（保證有聲，不再靜音）。
// 悶聲塑膠鍵盤敲擊感（非響亮打字機／非清脆機械軸）：每擊衰減快（exp(-60)）＝短促「噗」聲，
// 但 lowpass=2200 砍掉高頻亮音＝悶、highpass=120 保留一點鍵程低身、volume=0.2 壓成背景襯底。
// 每 0.16s 一擊＝自然的鍵盤打字節奏（非打字機那種慢而響的「答…答…」）。要換真實鍵盤音放 brand/assets/sfx/typewriter.* 覆寫。
const synthTypewriter = (wav, d) => sh('ffmpeg', ['-y', '-f', 'lavfi',
  '-i', `aevalsrc=exprs='(random(0)*2-1)*exp(-60*mod(t,0.16))':s=44100:d=${d}`,
  '-af', 'highpass=f=120,lowpass=f=2200,volume=0.2', '-ac', '2', wav]);
for (let i = 0; i < segs.length; i++) {
  if (!segs[i]._synthetic) continue;
  const wav = join(AUDIO, `seg${i}.wav`), d = segs[i]._dur.toFixed(2);
  if (segs[i].kind === 'intro' || segs[i].kind === 'timecard') {
    if (TYPE_SFX) { try { sh('ffmpeg', ['-y', '-stream_loop', '-1', '-t', d, '-i', TYPE_SFX, '-af', 'volume=0.35', '-ar', '44100', '-ac', '2', wav]); } catch { try { synthTypewriter(wav, d); } catch { sh('ffmpeg', ['-y', '-f', 'lavfi', '-t', d, '-i', 'anullsrc=r=44100:cl=stereo', wav]); } } }
    else { try { synthTypewriter(wav, d); } catch { sh('ffmpeg', ['-y', '-f', 'lavfi', '-t', d, '-i', 'anullsrc=r=44100:cl=stereo', wav]); } } // 無音效檔→合成敲擊聲，避免黑屏卡靜音
  } else { sh('ffmpeg', ['-y', '-f', 'lavfi', '-t', d, '-i', 'anullsrc=r=44100:cl=stereo', wav]); }
}

// 逐段表現力：出鏡（調查員人格能量點）＋冷開場鉤子（narrIndex 0）拉高生成細緻度、放開引導(cfg↓)讓語調更有起伏；
// 其餘旁白用 config 預設。目的＝避免整片同一種低沉緩慢語調（聽久想睡）。數值偏保守，可再聽再調。
const exprFor = (s) => (s.kind === 'host' || s.narrIndex === 0) ? { inference_timesteps: 16, cfg_value: 1.6 } : {};
// VoxCPM 批次預合成：一次載入模型、連產所有未快取段（最省時），失敗則退回下方 Azure/WinRT 迴圈
if (VOXCPM_ON && !NOVOICE) {
  const todo = [];
  for (let i = 0; i < segs.length; i++) {
    const wav = join(AUDIO, `seg${i}.wav`);
    if (existsSync(wav) && statSync(wav).size > 20000) continue;
    todo.push({ text: segs[i].narration || segs[i].heading || '。', out: wav, ...exprFor(segs[i]) });
  }
  if (todo.length) {
    const manifest = join(BUILD, 'voxcpm-manifest.json');
    writeFileSync(manifest, JSON.stringify(todo), 'utf8');
    console.log(`  VoxCPM 批次合成 ${todo.length} 段（簽名聲線）...`);
    try { sh(ENGINE_PY, [join(ENGINE, 'tts.py'), '--batch', manifest], { stdio: ['ignore', 'inherit', 'inherit'] }); }
    catch (e) { console.log('  VoxCPM 批次失敗，改用 Azure/WinRT：' + (e.message || e)); }
  }
}
const meta = [];
for (let i = 0; i < segs.length; i++) {
  const txt = join(BUILD, `txt${i}.txt`), wav = join(AUDIO, `seg${i}.wav`);
  if (existsSync(wav) && statSync(wav).size > 20000) { const d = dur(wav); meta.push({ i, wav, d }); console.log(`  TTS seg${i} (快取) ${d.toFixed(1)}s`); continue; }
  // 無語音模式：旁白/解說員段改用「估算時長的靜音」（中文約 5 字/秒 + 起停墊），畫面/字幕/BGM 照常
  if (NOVOICE && !segs[i]._synthetic) {
    const chars = (segs[i].narration || segs[i].heading || '').replace(/\s+/g, '').length;
    const d = Math.max(2.5, Math.round((chars / 5 + 1.2) * 10) / 10);
    sh('ffmpeg', ['-y', '-f', 'lavfi', '-t', d.toFixed(2), '-i', 'anullsrc=r=44100:cl=stereo', wav]);
    meta.push({ i, wav, d }); console.log(`  seg${i} 無語音靜音 ${d}s`); continue;
  }
  const sayText = segs[i].narration || segs[i].heading || '。';
  writeFileSync(txt, sayText, 'utf8');
  process.stdout.write(`  TTS seg${i} (${segs[i].heading}) ... `);
  if (AZURE_ON) {
    try { await azureTts.synthToFile(sayText, wav); }
    catch (e) { process.stdout.write(`Azure失敗(${e.message})→WinRT `); winrtTTS(txt, wav); }
  } else { winrtTTS(txt, wav); }
  const d = dur(wav); meta.push({ i, wav, d }); console.log(`${d.toFixed(1)}s`);
}

// ---- 2. 串接旁白（+ atempo 變速不變調，解決 VoxCPM 沉悶）----
const narration = join(BUILD, 'narration.wav');
// 逐段語速：出鏡段略快＝更有精神，與旁白形成抑揚對比（打破整片同一速度的沉悶）。
const HOST_SPEED = Number(process.env.PILOT_HOST_SPEED || '1.12'); // 出鏡段略慢＝更有份量，與旁白形成抑揚對比
const spd = (k) => (segs[meta[k].i].kind === 'host' ? HOST_SPEED : SPEED);
// 每段：先變速(atempo)再尾接 PAUSE 秒靜音(apad) → 段落間有呼吸停頓；最後串接
const aChain = meta.map((_, i) => `[${i}:a]atempo=${spd(i).toFixed(3)},apad=pad_dur=${PAUSE}[a${i}]`).join(';') + ';' +
  meta.map((_, i) => `[a${i}]`).join('') + `concat=n=${meta.length}:v=0:a=1[a]`;
sh('ffmpeg', ['-y', ...meta.flatMap(m => ['-i', m.wav]), '-filter_complex', aChain, '-map', '[a]', '-ar', '44100', '-ac', '2', narration]);
meta.forEach((m, i) => { m.d = m.d / spd(i) + PAUSE; });   // 視訊/字幕時間軸同步：變速後 + 段尾停頓
const total = dur(narration); console.log(`旁白總長 ${total.toFixed(1)}s（atempo ${SPEED}）`);

// ---- 3. 取真實 CC 授權圖（Openverse，免 key，依提示詞關鍵字）+ 灰底備援 ----
const UA = { 'User-Agent': 'PilotChannel/1.0 (demo)' };
function keywords(prompt) {
  const BASE = /cinematic documentary still|dark moody lighting|cold desaturated palette|film grain|shallow depth of field|realistic|investigative tone|establishing shot|photorealistic|high contrast|no people|no text|anonymous|silhouettes?|16:9|--ar 16:9|--quality \d/gi;
  let s = prompt.replace(BASE, ' ').replace(/[.,|—-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const w = s.split(' ').filter(x => /^[a-zA-Z]{3,}$/.test(x));
  return w.slice(0, 4).join(' ') || 'dark abandoned scene';
}
async function openverse(query, out) {
  try {
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&license_type=commercial&page_size=6&mature=false`, { headers: UA });
    if (!r.ok) return null;
    const j = await r.json();
    for (const it of (j.results || [])) {
      try {
        const ir = await fetch(it.url, { headers: UA });
        if (!ir.ok) continue;
        const buf = Buffer.from(await ir.arrayBuffer());
        if (buf.length < 8000) continue;
        writeFileSync(out, buf);
        return { creator: it.creator || 'unknown', license: `${it.license || ''} ${it.license_version || ''}`.trim(), source: it.foreign_landing_url || it.url, title: it.title || query };
      } catch { }
    }
  } catch { }
  return null;
}
// 免 key 關鍵字影片：Wikimedia Commons（公共領域/CC，webm/ogv）。沒 Pexels key 時的「影片庫擴充」來源。
async function commonsVideo(query, out) {
  try {
    const s = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=10&srsearch=${encodeURIComponent(query + ' filetype:video')}`, { headers: UA });
    if (!s.ok) return null;
    const sj = await s.json();
    const qw = String(query).toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    for (const hit of (sj.query?.search || [])) {
      const tt = String(hit.title).toLowerCase();
      if (qw.length && !qw.some(w => tt.includes(w))) continue; // 相關性守門：標題須含查詢詞，避免抓到離題影片（如死刑紀錄片當監獄畫面）
      try {
        const ir = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|mime|size&titles=${encodeURIComponent(hit.title)}`, { headers: UA });
        if (!ir.ok) continue;
        const ij = await ir.json();
        const page = Object.values(ij.query?.pages || {})[0];
        const info = page?.imageinfo?.[0];
        if (!info || !/video\/(webm|ogg)/.test(info.mime || '')) continue;
        if ((info.size || 0) > 80_000_000 || (info.size || 0) < 80_000) continue; // 避免超大/極小檔
        const vr = await fetch(info.url, { headers: UA });
        if (!vr.ok) continue;
        const buf = Buffer.from(await vr.arrayBuffer());
        if (buf.length < 80_000) continue;
        writeFileSync(out, buf);
        return { creator: 'Wikimedia Commons', license: 'PD/CC（見檔案頁，發布前覆核）', source: info.descriptionurl || info.url, title: hit.title };
      } catch { }
    }
  } catch { }
  return null;
}
// 免 key 關鍵字真實圖片：Wikimedia Commons（PD/CC 真實照片，含大量地點/歷史/檔案場景，無需 key）。
async function commonsImage(query, out) {
  try {
    const s = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search&srnamespace=6&srlimit=12&srsearch=${encodeURIComponent(query)}`, { headers: UA });
    if (!s.ok) return null;
    const sj = await s.json();
    for (const hit of (sj.query?.search || [])) {
      if (!/\.(jpe?g|png)$/i.test(hit.title)) continue;           // 只取點陣圖（排除 svg/地圖/圖標）
      try {
        const ir = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=1600&titles=${encodeURIComponent(hit.title)}`, { headers: UA });
        if (!ir.ok) continue;
        const ij = await ir.json();
        const info = Object.values(ij.query?.pages || {})[0]?.imageinfo?.[0];
        if (!info || !/image\/(jpeg|png)/.test(info.mime || '')) continue;
        const vr = await fetch(info.thumburl || info.url, { headers: UA });   // 用 1600px 縮圖避免超大原圖
        if (!vr.ok) continue;
        const buf = Buffer.from(await vr.arrayBuffer());
        if (buf.length < 10000) continue;
        writeFileSync(out, buf);
        const em = info.extmetadata || {};
        const strip = s => String(s || '').replace(/<[^>]+>/g, '').trim();
        return { creator: strip(em.Artist?.value) || 'Wikimedia Commons', license: strip(em.LicenseShortName?.value) || 'PD/CC', source: info.descriptionurl || info.url, title: hit.title.replace(/^File:/, '') };
      } catch { }
    }
  } catch { }
  return null;
}
// 真實素材搜尋詞順序：案件專屬詞（real-subjects.json）→ 本段鏡頭詞 q →（establishing 槽再補地點）。最多試 3 個。
function realQueries(n, q, establishing) {
  const out = [];
  if (REAL_SUBJ[n]) out.push(...(Array.isArray(REAL_SUBJ[n]) ? REAL_SUBJ[n] : [REAL_SUBJ[n]]));
  if (q) out.push(q);
  if (establishing) { const mp = mapPlace(); if (mp) out.push(mp.replace(/（.*?）/g, '').trim()); }
  return [...new Set(out.filter(Boolean))].slice(0, 3);
}
async function openverseAudio(query, out) {
  try {
    const r = await fetch(`https://api.openverse.org/v1/audio/?q=${encodeURIComponent(query)}&license_type=commercial&page_size=12`, { headers: UA });
    if (!r.ok) return null;
    const j = await r.json();
    const list = (j.results || []).slice().sort((a, b) => (a.license === 'cc0' ? 0 : 1) - (b.license === 'cc0' ? 0 : 1));
    for (const it of list) {
      try {
        const u = it.url; if (!u || !/\.(mp3|wav|ogg)(\?|$)/i.test(u)) continue;
        const ir = await fetch(u, { headers: UA }); if (!ir.ok) continue;
        const buf = Buffer.from(await ir.arrayBuffer()); if (buf.length < 20000) continue;
        writeFileSync(out, buf);
        return { title: it.title || query, license: it.license || '', source: it.foreign_landing_url || u };
      } catch { }
    }
  } catch { }
  return null;
}
const PEXELS_KEY = process.env.PEXELS_KEY || '';
async function pexelsVideo(query, out) {
  if (!PEXELS_KEY) return null;
  try {
    const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=6&size=medium`, { headers: { Authorization: PEXELS_KEY, ...UA } });
    if (!r.ok) return null;
    const j = await r.json();
    for (const v of (j.videos || [])) {
      try {
        if (srcOver('px:' + v.id)) continue;                         // 同支 Pexels 來源影片全片最多 2 次
        const files = (v.video_files || []).filter(f => /mp4/i.test(f.file_type || '') && f.width >= 1280 && f.width <= 1920);
        const pick = files.sort((a, b) => b.width - a.width)[0] || (v.video_files || [])[0];
        if (!pick || !pick.link) continue;
        const ir = await fetch(pick.link, { headers: UA }); if (!ir.ok) continue;
        const buf = Buffer.from(await ir.arrayBuffer()); if (buf.length < 50000) continue;
        writeFileSync(out, buf);
        srcMark('px:' + v.id);
        return { creator: (v.user && v.user.name) || 'Pexels', license: 'Pexels License', source: v.url || pick.link, title: query };
      } catch { }
    }
  } catch { }
  return null;
}
// Pexels 場景圖（優先序第 4 級：真實影片→真實圖→Pexels影片→★Pexels圖→AI示意）。有 PEXELS_KEY 才試。
async function pexelsImage(query, out) {
  if (!PEXELS_KEY) return null;
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=8`, { headers: { Authorization: PEXELS_KEY, ...UA } });
    if (!r.ok) return null;
    const j = await r.json();
    for (const p of (j.photos || [])) {
      try {
        if (srcOver('pxi:' + p.id)) continue;                          // 同張 Pexels 圖全片最多 2 次
        const link = (p.src && (p.src.large2x || p.src.large || p.src.original)); if (!link) continue;
        const ir = await fetch(link, { headers: UA }); if (!ir.ok) continue;
        const buf = Buffer.from(await ir.arrayBuffer()); if (buf.length < 8000) continue;
        writeFileSync(out, buf);
        srcMark('pxi:' + p.id);
        return { creator: p.photographer || 'Pexels', license: 'Pexels License', source: p.url || link, title: query };
      } catch { }
    }
  } catch { }
  return null;
}
// ★主要影片策略（使用者定調 2026-06-02）：YouTube 只搜 creativeCommon 授權影片，yt-dlp 取中段 20s 剪成乾淨 mp4。
// 版權：僅 CC 授權；credits 記作者＋連結＋CC-BY，clearance 標 🟡 待人工確認（轉授權風險由發布前人工關卡把關）。
// 過濾 talking-head／解說頻道（標題或頻道含下列詞），降低拿到真人講解片的機率，優先時代/地點空景。
const YT_KEY = process.env.YOUTUBE_API_KEY || '';
// yt-dlp 調用解析（修 2026-06-04）：`py` launcher 預設 Python 可能未裝 yt_dlp 模組（曾因預設指向 Python312 而每段 YouTube-CC 下載靜默失敗＝真實影片層全失效）。
// 改為啟動時偵測「能跑的」調用，優先 PATH 上的 yt-dlp 二進位，依序退 py -3.10 / python / py。
const YTDLP = (() => {
  for (const [cmd, pre] of [['yt-dlp', []], ['py', ['-3.10', '-m', 'yt_dlp']], ['python', ['-m', 'yt_dlp']], ['py', ['-m', 'yt_dlp']]]) {
    try { if (spawnSync(cmd, [...pre, '--version'], { stdio: 'ignore', timeout: 10000 }).status === 0) return { cmd, pre }; } catch { }
  }
  return { cmd: 'yt-dlp', pre: [] };
})();
console.log(`yt-dlp 調用：${YTDLP.cmd} ${YTDLP.pre.join(' ')}`.trim());
const YT_BLOCK = /reaction|react\b|podcast|explained|explainer|analys|breakdown|review|panel|true ?crime|documentary|interview|tutorial|deep ?dive|recap|commentary|essay|vlog|story ?time/i;
// ③ recap/談話頭頻道黑名單（畫面會動但無用：固定圖旁白、主持人講解、二次剪輯）。
const CHANNEL_BLOCK = /behavior panel|hot news|crime time|weird darkness|darkest|velvet vibe|monsters|dark truth|real crime|true heroes|crónica|cronica|evoluciona|emprendedores|kingbynature|de africa|10 ?minute|shadow productions|curious|crime ?&|crime and justice/i;
// ② 靜圖偵測：mpdecimate 數「去重後存活幀」比例，< PILOT_MOTION_MIN（預設 8%）視為幻燈片/固定圖 → 棄用。
const MOTION_MIN = Number(process.env.PILOT_MOTION_MIN || '0.08');
function clipMotionOK(file) {
  try {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vf', 'mpdecimate', '-an', '-f', 'null', '-'], { encoding: 'utf8', timeout: 30000 });
    const fm = [...String(r.stderr || '').matchAll(/frame=\s*(\d+)/g)]; const kept = fm.length ? Number(fm[fm.length - 1][1]) : 0;
    const p = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'default=nk=1:nw=1', file], { encoding: 'utf8', timeout: 30000 });
    const total = Number(String(p.stdout || '').trim()) || 0;
    if (!total || !kept) return true;                 // 量不到就不擋
    return kept / total >= MOTION_MIN;
  } catch { return true; }
}
// CLIP 視覺配對：在地 GPU（voice-engine venv 的 torch+transformers）跑 clip-score.py。PILOT_CLIP=0 可關。
const CLIP_PY = join(dirname(ROOT), 'voice-engine', '.venv', 'Scripts', 'python.exe');
const CLIP_SCRIPT = join(TOOLS, 'clip-score.py');
const CLIP_ON = process.env.PILOT_CLIP !== '0' && existsSync(CLIP_PY) && existsSync(CLIP_SCRIPT);
// 視覺配對（本地檔）：對 videoPath 每 interval 秒抽幀（上限 60 張）→CLIP 用 matchText 挑「畫面最貼題」影格→回起始秒。
//   失敗（無 CLIP／抽幀失敗／無命中）回 null。純空景片也適用（看畫面不靠字幕）。
function visionPickLocal(videoPath, matchText, interval = 4) {
  if (!CLIP_ON || !matchText || !existsSync(videoPath)) return null;
  const adir = join(IMG, 'vframes');
  try {
    mkdirSync(adir, { recursive: true });
    for (const f of readdirSync(adir)) { try { unlinkSync(join(adir, f)); } catch { } }
    sh('ffmpeg', ['-y', '-i', videoPath, '-vf', `fps=1/${interval},scale=320:-1`, '-frames:v', '60', join(adir, 'f%04d.jpg'), '-loglevel', 'error']);
    if (!readdirSync(adir).some(f => f.endsWith('.jpg'))) return null;
    const res = JSON.parse(execFileSync(CLIP_PY, [CLIP_SCRIPT, matchText.slice(0, 280), adir], { timeout: 120000, encoding: 'utf8' }).trim().split(/\r?\n/).pop());
    if (res && typeof res.best_index === 'number') return Math.max(0, res.best_index * interval - 2);
  } catch { } finally { try { for (const f of readdirSync(adir)) unlinkSync(join(adir, f)); } catch { } }
  return null;
}
// YouTube：下載低清分析片（前 4 分鐘 ≤480p）→ visionPickLocal 挑起點。
function visionPickStart(id, url, matchText) {
  if (!CLIP_ON || !matchText) return null;
  const adir = join(IMG, `an_${id}`);
  try {
    mkdirSync(adir, { recursive: true });
    for (const f of readdirSync(adir)) { try { unlinkSync(join(adir, f)); } catch { } }
    execFileSync(YTDLP.cmd, [...YTDLP.pre, '-q', '--no-warnings', '--no-playlist', '--download-sections', '*0-240',
      '-f', 'best[height<=480][ext=mp4]/best[height<=480]/worst', '-o', join(adir, 'a.%(ext)s'), url], { timeout: 90000, stdio: 'ignore' });
    const anf = readdirSync(adir).find(f => /^a\.(mp4|mkv|webm)$/i.test(f));
    if (!anf) return null;
    return visionPickLocal(join(adir, anf), matchText, 4);
  } catch { return null; } finally { try { for (const f of readdirSync(adir)) unlinkSync(join(adir, f)); } catch { } }
}
// ★片段配對核心（使用者定調 2026-06-02）：剪哪一段 YouTube＝依「當下旁白文字情境」用 CLIP 視覺配對挑最貼題畫面。
//   matchText＝本段 imagePrompt＋標題＋查詢詞。每個剪出的素材（影片+20s 桶）守 2 次上限。
async function youtubeCC(terms, out, matchText) {
  if (!YT_KEY) return null;
  let tries = 0;
  for (const term of terms) {
    let j;
    try {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoLicense=creativeCommon&videoEmbeddable=true&maxResults=8&q=${encodeURIComponent(term)}&key=${YT_KEY}`, { headers: UA });
      if (!r.ok) continue;
      j = await r.json();
    } catch { continue; }
    for (const it of (j.items || [])) {
      const id = it.id && it.id.videoId; if (!id) continue;
      const title = (it.snippet && it.snippet.title) || '';
      const ch = (it.snippet && it.snippet.channelTitle) || '';
      if (YT_BLOCK.test(title) || YT_BLOCK.test(ch)) continue;       // 跳過解說/真人頻道
      if (CHANNEL_BLOCK.test(ch) || CHANNEL_BLOCK.test(title)) continue;  // ③ recap/談話頭頻道黑名單
      if (++tries > 3) return null;                                  // 限制每段下載嘗試數，避免拖垮整片
      const url = `https://www.youtube.com/watch?v=${id}`;
      // 1) CLIP 視覺配對挑起點；失敗→預設 20s 起。
      let start = visionPickStart(id, url, matchText);
      const matched = start != null;
      if (start == null) start = 20;
      // 2) 素材去重：以「影片+20s 桶」為一個素材，最多 2 次；該桶滿了就順移 20s 找未滿的鄰近段。
      let bucket = Math.floor(start / 20) * 20;
      if (srcOver(`yt:${id}:${bucket}`)) {
        let moved = false;
        for (let off = 20; off <= 160; off += 20) { if (!srcOver(`yt:${id}:${bucket + off}`)) { bucket += off; start = bucket; moved = true; break; } }
        if (!moved) continue;                                        // 此片鄰近段都用滿 → 換下一支
      }
      const sa = start, sb = start + 20, stem = `yt_${id}_${sa}`;
      try {
        execFileSync(YTDLP.cmd, [...YTDLP.pre, '-q', '--no-warnings', '--no-playlist',
          '--download-sections', `*${sa}-${sb}`, '--force-keyframes-at-cuts',
          '-f', 'best[height<=1080][ext=mp4]/best[height<=1080]/best',
          '-o', join(IMG, `${stem}.%(ext)s`), url], { timeout: 60000, stdio: 'ignore' });
      } catch { continue; }
      const got = (existsSync(IMG) ? readdirSync(IMG) : []).find(f => f.startsWith(`${stem}.`) && /\.(mp4|mkv|webm)$/i.test(f));
      if (!got) continue;
      const raw = join(IMG, got);
      try { sh('ffmpeg', ['-y', '-i', raw, '-an', '-t', '20', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out]); } catch { try { unlinkSync(raw); } catch { } continue; }
      try { unlinkSync(raw); } catch { }
      if (existsSync(out) && statSync(out).size > 50000) {
        if (!clipMotionOK(out)) { try { unlinkSync(out); } catch { } continue; }   // ② 幻燈片/固定圖棄用
        srcMark(`yt:${id}:${bucket}`); return { creator: ch || 'YouTube', license: 'CC BY 3.0（YouTube，待人工確認）', source: url, title: term, section: `${sa}-${sb}s`, matched };
      }
    }
  }
  return null;
}
// archive.org（Internet Archive）：只取 CC/PD 授權的 movies（授權最乾淨、時代/檔案素材強）。
//   下載小體積 mp4 衍生檔 → visionPickLocal 視覺配對挑起點 → 剪 20s。每個素材（identifier）守 2 次上限。
async function archiveVideo(terms, out, matchText) {
  let tries = 0;
  for (const term of terms) {
    let docs = [];
    try {
      const r = await fetch(`https://archive.org/advancedsearch.php?q=${encodeURIComponent('(' + term + ') AND mediatype:movies')}&fl[]=identifier&fl[]=title&fl[]=licenseurl&rows=10&sort[]=downloads+desc&output=json`, { headers: UA });
      if (!r.ok) continue;
      const j = await r.json(); docs = (j.response && j.response.docs) || [];
    } catch { continue; }
    const qw = String(term).toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    for (const d of docs) {
      const id = d.identifier; if (!id) continue;
      if (!/creativecommons|publicdomain/i.test(String(d.licenseurl || ''))) continue;  // 只取 CC/PD（授權乾淨）
      const tt = String(d.title || '').toLowerCase();
      if (qw.length && !qw.some(w => tt.includes(w))) continue;     // 相關性守門：標題須含查詢詞
      if (srcOver(`ar:${id}`)) continue;
      if (++tries > 2) return null;
      let file = null, server = null, ddir = null;
      try {
        const mj = await (await fetch(`https://archive.org/metadata/${id}`, { headers: UA })).json();
        server = mj.server; ddir = mj.dir;
        const cands = (mj.files || []).filter(f => /\.mp4$/i.test(f.name) && Number(f.size || 0) > 50000 && Number(f.size) < 120e6).sort((a, b) => Number(a.size) - Number(b.size));
        file = cands[0] && cands[0].name;
      } catch { continue; }
      if (!file || !server || !ddir) continue;
      const raw = join(IMG, `ar_${id}.mp4`);
      try { execFileSync('curl', ['-sL', '--max-time', '150', '-o', raw, `https://${server}${ddir}/${encodeURIComponent(file)}`], { timeout: 160000 }); } catch { try { unlinkSync(raw); } catch { } continue; }
      if (!existsSync(raw) || statSync(raw).size < 50000) { try { unlinkSync(raw); } catch { } continue; }
      let start = visionPickLocal(raw, matchText, 8); const matched = start != null; if (start == null) start = 10;
      try { sh('ffmpeg', ['-y', '-ss', String(start), '-t', '20', '-i', raw, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out]); } catch { try { unlinkSync(raw); } catch { } continue; }
      try { unlinkSync(raw); } catch { }
      if (existsSync(out) && statSync(out).size > 50000) { srcMark(`ar:${id}`); return { creator: 'Internet Archive', license: `Archive.org（${/publicdomain/i.test(String(d.licenseurl)) ? 'PD' : 'CC'}，待人工確認）`, source: `https://archive.org/details/${id}`, title: term, section: `${start}-${start + 20}s`, matched }; }
    }
  }
  return null;
}
function gradientFallback(out, label) {
  writeFileSync(join(HEADS, 'fb.txt'), label, 'utf8');
  sh('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'gradients=s=1280x720:c0=0x16202c:c1=0x080b10', '-frames:v', '1', '-update', '1',
    '-vf', `drawtext=fontfile=fonts/msjh.ttc:textfile=heads/fb.txt:fontcolor=0x55657a:fontsize=40:x=(w-tw)/2:y=(h-th)/2`, out], { cwd: BUILD });
}

// Plan B：手動貼圖。檔名 sN_k.<ext>（與自動槽位命名一致），放 cases/<slug>/production/manual/
function manualFor(n, k) {
  if (!existsSync(MANUAL)) return null;
  for (const ext of ['mp4', 'webm', 'mov', 'png', 'jpg', 'jpeg', 'webp']) {
    const f = join(MANUAL, `s${n}_${k}.${ext}`);
    // .real 標記＝此覆寫是真實素材（素材檢視台重抓/挑片寫入），渲染時不烙「示意圖」；無標記（如 GPT 生圖手貼）仍視為示意圖。
    if (existsSync(f) && statSync(f).size > 2000) return { path: f, video: /mp4|webm|mov/.test(ext), real: existsSync(join(MANUAL, `s${n}_${k}.real`)) };
  }
  return null;
}

// Plan A：把場景提示詞改寫成「示意／非寫實」風格，避免被誤認成真實證據（對齊 legal-redlines）
function illustPrompt(p) {
  const base = String(p || 'dark abandoned scene').replace(/--ar 16:9|--quality \d+/g, '').trim();
  return base + ', ' + STYLE_TEXT + ', no real persons, no recognizable faces, no text, 16:9';
}

// Plan A：產生 AI 示意圖。回傳 {backend} 或 null（失敗→由呼叫端退灰底圖卡）
async function aiIllustrate(prompt, out, seed) {
  if (ILLUST === 'off') return null;
  const p = illustPrompt(prompt);
  try {
    if (ILLUST === 'local' || ILLUST === 'a1111') {
      const r = await fetch(`${SD_URL}/sdapi/v1/txt2img`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: p, negative_prompt: 'photorealistic, photographic, photo, 3d render, realistic skin, watermark, text, deformed, extra limbs', width: 1280, height: 720, steps: 26, cfg_scale: 6.5 }),
      });
      if (!r.ok) return null;
      const j = await r.json(); const b64 = j?.images?.[0]; if (!b64) return null;
      const buf = Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      if (buf.length < 8000) return null;
      writeFileSync(out, buf); return { backend: 'local-sd' };
    }
    // pollinations（雲端，免 key；與 gen-host.mjs 同路）
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=1280&height=720&nologo=true&seed=${(((seed || 0) % 99991) + 99991) % 99991}`;
    const buf = execFileSync('curl', ['-sL', '--max-time', '120', url], { encoding: 'buffer', maxBuffer: 1 << 26 });
    if (!buf || buf.length < 8000) return null;
    writeFileSync(out, buf); return { backend: 'pollinations' };
  } catch { return null; }
}
// 依鏡頭分類詞庫（tools/shot-vocab.js）展開每段搜尋詞——換案件只改 SEG_CATEGORIES 即可
const GENERIC = ['dark abandoned building cinematic', 'foggy forest dark', 'old empty room night'];
// 填充槽用的場景詞庫（較豐富＝避免同源≤2 次上限太快用光、退 AI）。氛圍/轉場用，非案件專屬。
const SCENE_FILL = ['dark night street rain', 'quiet suburban house night', 'police car lights night', 'empty road headlights night', 'foggy forest path', 'old documents on desk', 'city skyline dusk', 'rain on window night', 'forensic lab equipment', 'courtroom interior empty', 'highway driving at night', 'abandoned room dim light', 'neighborhood street day', 'aerial suburb houses', 'desk lamp paperwork', 'cold case files'];
const segImages = {}; const credits = []; const realCredits = []; let imgCount = 0;
// 本案 real-library 已下載的真實素材（影片/圖，免 key）：沒 Pexels key 時當「素材庫影片」用，交錯成有圖有片
const LIBV = join(ROOT, 'assets', SLUG, 'real-library', 'video'), LIBI = join(ROOT, 'assets', SLUG, 'real-library', 'images');
// 素材黑名單：排除「工地/開挖」與「時代錯置的現代地標」——寧可退 AI 示意也不上不貼題的現代照。
// 詞庫＝通用詞 ＋ 本案 seed.avoidTerms（案件時代意識，與 picker 同一份）。可用 PILOT_LIB_BLOCK 覆寫（regex）；空字串=不過濾。
const LIB_BLOCK = (() => {
  const s = process.env.PILOT_LIB_BLOCK;
  if (s === '') return null;
  if (s) { try { return new RegExp(s, 'i'); } catch { return null; } }
  let terms = ['ausgrabung', 'baustelle', 'construction', 'crane', 'excavat', 'medienhafen', 'rheinturm', 'rheinkniebr', 'kniebr', 'hafenzufahrt', 'stahlhof'];
  try { const sd = JSON.parse(readFileSync(join(ROOT, 'assets', SLUG, 'real-library', 'seed.json'), 'utf8')); if (Array.isArray(sd.avoidTerms)) terms = terms.concat(sd.avoidTerms.map(String)); } catch { }
  const esc = [...new Set(terms)].map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  try { return new RegExp(esc.join('|'), 'i'); } catch { return null; }
})();
const libKeep = f => !LIB_BLOCK || !LIB_BLOCK.test(f.split(/[\\\/]/).pop());
const libVids = existsSync(LIBV) ? readdirSync(LIBV).filter(f => /\.(mp4|webm|mov)$/i.test(f)).map(f => join(LIBV, f)).filter(libKeep) : [];
const libImgs = existsSync(LIBI) ? readdirSync(LIBI).filter(f => /\.(jpe?g|png|gif)$/i.test(f)).map(f => join(LIBI, f)).filter(libKeep) : [];
// 同一素材最多用 2 次（使用者定調 2026-06-04）：超過就跳過、改抽別張或退 AI 示意（避免整片重複同幾張）。
// （本地 real-library 走這條 path 計數；過去設 3 才是「整片同一張出現三次」的來源，已對齊 srcUse 的 2 次上限。）
const usageCount = new Map();
const overUsed = p => (usageCount.get(p) || 0) >= 2;
const markUse = p => usageCount.set(p, (usageCount.get(p) || 0) + 1);
// 素材去重（使用者定調 2026-06-02）：每個「素材（片段）」最多用 2 次——非整支影片最多 2 次。
//   YouTube：key=`yt:<videoId>:<section起點>`，同一支影片可切多個 section＝多個素材，各自上限 2 次。
//   Pexels：key=`px:<videoId>`，一支 Pexels 影片＝一個素材，上限 2 次。
//   解決「每段把同片下載成不同檔→繞過 path 計數→同一片段重複超過 2 次」。
const srcUse = new Map();
const srcOver = k => (srcUse.get(k) || 0) >= 2;
const srcMark = k => srcUse.set(k, (srcUse.get(k) || 0) + 1);
// AI 填充圖池：庫圖用滿後的填充槽優先「重用已生成的 AI 圖（≤2 次）」，全用滿才生新的——
// 避免 pollinations 限流時每槽逐張久等（曾發生每張 ~90s、整片卡 40 分鐘）。
const aiFillPool = [];
// real-library 影片池：把「少數影片」平均散佈在「多數圖片」之間（不再前段把影片用光、後段全靜圖）
// 動態 GIF 視為「影片」走 -stream_loop 分支（靜圖分支的 -loop 1 不支援 gif demuxer，會報 Option loop not found）
const isMotion = p => /\.gif$/i.test(p);
const libPool = [];
{
  const V = libVids.length, I = libImgs.length;
  const step = V ? Math.max(1, Math.round((V + I) / V)) : Infinity; // 每隔約 step 槽放一支影片
  let vi = 0, ii = 0;
  for (let pos = 0; vi < V || ii < I; pos++) {
    if (vi < V && pos % step === 0) libPool.push({ path: libVids[vi++], video: true });
    else if (ii < I) { const p = libImgs[ii++]; libPool.push({ path: p, video: isMotion(p) }); }
    else if (vi < V) libPool.push({ path: libVids[vi++], video: true });
  }
}
let libIdx = 0;
if (libPool.length) console.log(`real-library：${libVids.length} 影片 + ${libImgs.length} 圖可用（優先採用，圖片影片交錯）`);
// real-library MANIFEST 對位：讀每檔的描述/類別，供「依本段 real-subjects 詞挑最貼題的真實素材」（純關鍵詞比對）
const LIBMETA = {}; // basename(lower) → { desc, category }
{
  const mf = join(ROOT, 'assets', SLUG, 'real-library', 'MANIFEST.csv');
  if (existsSync(mf)) for (const ln of readFileSync(mf, 'utf8').split(/\r?\n/).slice(1)) {
    if (!ln.trim()) continue;
    const c = parseCsvLine(ln);
    if (c[0]) LIBMETA[c[0].toLowerCase()] = { desc: (c[3] || '').toLowerCase(), category: (c[2] || '').toLowerCase() };
  }
}
// 依本段 real-subjects 詞挑一個「描述/類別命中」的本地素材；只回「尚未用滿 2 次」者，否則 null（讓上層改抽別張或退 AI）。
// 不在此處 markUse——由實際採用的呼叫端標記，避免「挑了卻沒用」也被計數。
function libMatchForSeg(n, pool) {
  const terms = (REAL_SUBJ[n] || []).map(t => String(t).toLowerCase()).filter(Boolean);
  if (!terms.length) return null;
  const matches = pool.filter(item => {
    const meta = LIBMETA[String(item.path || item).split(/[\\\/]/).pop().toLowerCase()]; if (!meta) return false;
    const hay = meta.desc + ' ' + meta.category;
    return terms.some(t => t.split(/\s+/).some(w => w.length >= 3 && hay.includes(w)));
  });
  return matches.find(m => !overUsed(m.path || m)) || null;
}
// 單一庫素材是否「命中本段 real-subjects 詞」（描述/類別含任一詞）
function libItemMatchesSeg(n, item) {
  const terms = (REAL_SUBJ[n] || []).map(t => String(t).toLowerCase()).filter(Boolean);
  if (!terms.length) return false;
  const meta = LIBMETA[String(item.path || item).split(/[\\\/]/).pop().toLowerCase()]; if (!meta) return false;
  const hay = meta.desc + ' ' + meta.category;
  return terms.some(t => t.split(/\s+/).some(w => w.length >= 3 && hay.includes(w)));
}
// 填充選材：把「命中本段詞」的庫素材排前面，再以每段游標輪替＝貼題優先且有變化（取代「同幾張用滿」的舊行為）
const segFillPool = {}, segFillCursor = {};
function pickFill(n) {
  if (!libPool.length) return null;
  if (!segFillPool[n]) {
    const matched = libPool.filter(p => libItemMatchesSeg(n, p));
    const rest = libPool.filter(p => !matched.includes(p));
    segFillPool[n] = matched.length ? [...matched, ...rest] : libPool.slice();
    segFillCursor[n] = 0;
  }
  const pool = segFillPool[n];
  const hasVid = pool.some(p => p.video);
  let cand = null, tries = 0;
  do { cand = pool[segFillCursor[n] % pool.length]; segFillCursor[n]++; } while (((hasVid && !cand.video) || overUsed(cand.path)) && ++tries < pool.length * 2);
  return (cand && !overUsed(cand.path)) ? cand : null;
}
const STREETVIEW_ON = process.env.PILOT_STREETVIEW === '1'; // 街景選配：需 GOOGLE_MAPS_KEY + 此旗標
// 解說員定格圖：有 host-reference.png 用它，否則灰底字卡備援（生圖：node tools/gen-host.mjs）
if (!existsSync(hostImgPath)) { hostImgPath = join(IMG, 'host_fallback.jpg'); if (!existsSync(hostImgPath)) gradientFallback(hostImgPath, HOST_NAME); }
// 解說員出鏡畫面：★預設「單張定格肖像＋極緩慢 Ken Burns」＝永遠不抖。
// 物理事實：解說員只有 10s 短片、出鏡段需 ~40s，任何把短片循環/接成長片的做法（正放/倒放/環點溶接）在接點都必有不連續＝抖動，
// 再加 vidstab 穩定化會讓邊緣扭動。已多次驗證循環必抖 → 改定格肖像（無接點、無 vidstab）＝零抖動，緩慢推鏡保留生命感。
// 真要會動的影片版（接受短片循環接點）才設 PILOT_HOST_VIDEO=1。
let hostClip = null;
const HOST_VID = join(ROOT, 'brand', 'assets', 'host-reference.mp4');
const HOST_VIDEO_MODE = process.env.PILOT_HOST_VIDEO === '1';
// ★預設：解說員用「自然會動的影片」——去頭去尾取乾淨正放段，再以環點交叉溶接做無縫正放循環（不倒放、不定格）。
//   設 PILOT_HOST_STILL=1 才退回定格肖像＋Ken Burns（零抖動但不會動）。實際循環在 clip 迴圈的 host 分支。
const HOST_MOVING = process.env.PILOT_HOST_STILL !== '1' && existsSync(HOST_VID);
if (existsSync(HOST_VID) && !HOST_VIDEO_MODE) {
  // 仍取一張中段定格當「退路圖」（影片不可用時備援）。HOST_MOVING 時不覆蓋 hostImgPath（影片直接走 clip 迴圈）。
  const still = join(IMG, 'host_still.png');
  try { sh('ffmpeg', ['-y', '-ss', '4', '-i', HOST_VID, '-frames:v', '1', still]); if (existsSync(still) && statSync(still).size > 5000 && !HOST_MOVING) hostImgPath = still; } catch { }
  console.log(HOST_MOVING ? '解說員：host-reference.mp4 原始素材循環到該段秒數硬切（自然會動、不壓縮、不去頭尾）' : '解說員：影片中段定格肖像＋緩慢 Ken Burns（無循環＝零抖動）');
}
if (existsSync(HOST_VID) && HOST_VIDEO_MODE) {
  hostClip = join(BUILD, 'host-pingpong.mp4');
  // 鎖鏡前處理：vidstab 二階段（偵測→反向穩定）把自帶運鏡壓成定鏡；無 vidstab 退 deshake
  let hostSrc = HOST_VID;
  if (HOST_LOCK) {
    const trf = 'host.trf'; // 相對路徑（cwd=BUILD）：絕對路徑含空白（Claude profect）會讓 vidstab 濾鏡解析失敗而誤退 deshake
    const locked = join(BUILD, 'host-locked.mp4');
    try {
      sh('ffmpeg', ['-y', '-i', HOST_VID, '-vf', `vidstabdetect=shakiness=10:accuracy=15:result=${trf}`, '-f', 'null', '-'], { cwd: BUILD });
      sh('ffmpeg', ['-y', '-i', HOST_VID, '-vf', `vidstabtransform=input=${trf}:smoothing=${HOST_LOCK_SMOOTH}:optzoom=1:zoom=0,unsharp=5:5:0.6`, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', locked], { cwd: BUILD });
      hostSrc = locked; console.log(`解說員：vidstab 鎖鏡（smoothing=${HOST_LOCK_SMOOTH}），壓掉自帶運鏡`);
    } catch (e1) {
      try { sh('ffmpeg', ['-y', '-i', HOST_VID, '-vf', 'deshake', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', locked]); hostSrc = locked; console.log('解說員：deshake 鎖鏡（vidstab 不可用）'); }
      catch (e2) { console.log('解說員鎖鏡失敗，用原片：' + (e2.message || e2)); }
    }
  }
  try {
    // 稍微卡通化：edgedetect colormix + 提彩，再以 opacity 疊回原片（PILOT_HOST_CARTOON=0 關）
    // 來源可能直式(720x1280)或橫式：一律「模糊填邊」置中成 1920x1080——直式不被裁掉、橫式仍滿版
    const fill = `[0:v]fps=${FPS},split[bg][fg];[bg]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,gblur=sigma=24,eq=brightness=-0.12:saturation=0.7[bgb];[fg]scale=-2:1080[fgs];[bgb][fgs]overlay=(W-w)/2:0`;
    const styled = HOST_CARTOON
      ? `${fill}[fb];[fb]split[ho][hc];[hc]edgedetect=mode=colormix:high=0,eq=saturation=${HOST_CARTOON_SAT}:contrast=1.06[hcart];[ho][hcart]blend=all_mode=normal:all_opacity=${HOST_CARTOON_OP},format=yuv420p[st]`
      : `${fill},format=yuv420p[st]`;
    const fc = HOST_PINGPONG
      ? `${styled};[st]split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]`   // idle 版：正放＋倒放無縫循環
      : `${styled};[st]null[v]`;                                            // 講話版：只正放，避免「倒著講話」
    sh('ffmpeg', ['-y', '-i', hostSrc, '-filter_complex', fc,
      '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', hostClip]);
    console.log(`解說員：host-reference.mp4 → ${HOST_PINGPONG ? '正放＋倒放 ping-pong' : '只正放循環（講話版）'}`);
  } catch (e) { hostClip = null; console.log('解說員 ping-pong 失敗，退回定格圖：' + (e.message || e)); }
}
// 沒有 host 影片時，定格肖像也套同樣的稍微卡通化
if (HOST_CARTOON && !hostClip && existsSync(hostImgPath)) {
  const hc = join(IMG, 'host_cartoon.jpg');
  try {
    sh('ffmpeg', ['-y', '-i', hostImgPath, '-vf', `split[o][c];[c]edgedetect=mode=colormix:high=0,eq=saturation=${HOST_CARTOON_SAT}:contrast=1.06[cart];[o][cart]blend=all_mode=normal:all_opacity=${HOST_CARTOON_OP},format=yuv420p`, '-frames:v', '1', hc]);
    hostImgPath = hc; console.log('解說員定格：已套稍微卡通化');
  } catch { }
}
// ---- 依「畫面類型」標籤（episode.json 每段 visual[]）取單一槽素材：video / real-photo / illust ----
// 取不到就逐級降級（影片→真實圖→AI示意），永不開天窗；relations/host 由各自分支處理，這裡只管這三種。
async function acquireMode(mode, n, k, q, prompt, heading) {
  const vidOut = join(IMG, `s${n}_${k}.mp4`), imgOut = join(IMG, `s${n}_${k}.jpg`), aiOut = join(IMG, `s${n}_${k}.ai.jpg`);
  if (mode === 'video') {
    if (!REFETCH && existsSync(vidOut) && statSync(vidOut).size > 50000) return { path: vidOut, video: true };
    const mt = [prompt, heading, q].filter(Boolean).join(' ');     // CLIP 視覺配對用的文字情境
    // ★主要策略：YouTube CC 授權影片（CLIP 依本段文字 prompt 配對最貼題時間段；CC-BY，發布前人工確認授權）
    const yc = await youtubeCC(realQueries(n, q, k === 0), vidOut, mt);
    if (yc) { credits.push({ seg: n, k, ...yc, tier: 'real', query: yc.title }); realCredits.push({ seg: n, k, subject: yc.title, title: 'YouTube CC 片段', creator: yc.creator, license: yc.license, licenseUrl: yc.source, source: yc.source, provider: 'YouTube-CC' }); console.log(`  s${n}_${k} 〔影片〕YouTube-CC「${yc.title}」✓ ${yc.section}${yc.matched ? '（CLIP配對）' : ''}`); return { path: vidOut, video: true }; }
    // 其次：archive.org PD/CC 真檔案（授權最乾淨；同樣 CLIP 視覺配對）
    const av = await archiveVideo(realQueries(n, q, k === 0), vidOut, mt);
    if (av) { credits.push({ seg: n, k, ...av, tier: 'real', query: av.title }); realCredits.push({ seg: n, k, subject: av.title, title: 'archive.org 片段', creator: av.creator, license: av.license, licenseUrl: av.source, source: av.source, provider: 'Archive.org' }); console.log(`  s${n}_${k} 〔影片〕archive.org ✓ ${av.section}${av.matched ? '（CLIP配對）' : ''}`); return { path: vidOut, video: true }; }
    // 再來：Commons 真實影片（即時爬該段查詢詞）。Pexels 影片素材已移至「真實素材皆無」後（使用者定序 2026-06-04：本案真實影片→本案真實照片→影片素材→AI生圖→圖片素材）。
    for (const term of realQueries(n, q, k === 0)) {
      const cv = await commonsVideo(term, vidOut);
      if (cv) { credits.push({ seg: n, k, ...cv, tier: 'real', query: term }); realCredits.push({ seg: n, k, subject: term, title: cv.title, creator: cv.creator, license: cv.license, licenseUrl: '', source: cv.source, provider: 'Commons-video' }); console.log(`  s${n}_${k} 〔影片〕Commons「${term}」✓`); return { path: vidOut, video: true }; }
    }
    // 備援：live 取不到才用已下載的 real-library 影片（命中本段詞者優先，否則輪替；≤2 次）
    if (libVids.length) {
      const m = libMatchForSeg(n, libVids.map(p => ({ path: p })));
      let lv = (m && m.path) || null;
      if (!lv) for (let t = 0; t < libVids.length; t++) { const c = libVids[(n + k + t) % libVids.length]; if (!overUsed(c)) { lv = c; break; } }
      if (lv) { markUse(lv); credits.push({ seg: n, k, title: lv.split(/[\\\/]/).pop(), creator: 'real-library', license: 'PD/CC', source: lv, tier: 'real', query: q }); console.log(`  s${n}_${k} 〔影片〕real-library（備援）✓`); return { path: lv, video: true }; }
    }
    console.log(`  s${n}_${k} 〔影片〕無 → 退真實圖`); return acquireMode('real-photo', n, k, q, prompt, heading);
  }
  if (mode === 'real-photo') {
    if (!REFETCH && existsSync(imgOut) && statSync(imgOut).size > 8000) return { path: imgOut, video: false };
    if (k === 0 && SLUG === 'snowtown-murders' && (SNOWTOWN_SEG_REAL[n] || []).length) {
      const rr = await fetchRealImage(SNOWTOWN_SEG_REAL[n], imgOut, { streetView: STREETVIEW_ON });
      if (rr) { realCredits.push({ seg: n, k, ...rr }); credits.push({ seg: n, k, ...rr, query: rr.subject }); console.log(`  s${n}_${k} 〔真實圖〕Commons ✓`); return { path: imgOut, video: false }; }
    }
    // live 為主：即時爬該段查詢詞（Wikimedia Commons，PD/CC，無真人臉）——命中率高、素材多
    for (const term of realQueries(n, q, k === 0)) {
      const ci = await commonsImage(term, imgOut);
      if (ci) { realCredits.push({ seg: n, k, subject: term, title: ci.title, creator: ci.creator, license: ci.license, licenseUrl: '', source: ci.source, provider: 'Commons' }); credits.push({ seg: n, k, ...ci, tier: 'real', query: term }); console.log(`  s${n}_${k} 〔真實圖〕Commons「${term}」✓`); return { path: imgOut, video: false }; }
    }
    // 備援：live 取不到才用已下載的 real-library 圖（命中本段詞者優先，否則輪替；≤2 次）
    if (libImgs.length) {
      const m = libMatchForSeg(n, libImgs.map(p => ({ path: p })));
      let li = (m && m.path) || null;
      if (!li) for (let t = 0; t < libImgs.length; t++) { const c = libImgs[(n + k + t) % libImgs.length]; if (!overUsed(c)) { li = c; break; } }
      if (li) { markUse(li); const fn = li.split(/[\\\/]/).pop(); realCredits.push({ seg: n, k, subject: 'real-library', title: fn, creator: 'real-library', license: '見 real-library/MANIFEST.csv', licenseUrl: '', source: li, provider: 'real-library' }); credits.push({ seg: n, k, title: fn, creator: 'real-library', license: 'PD/CC', source: li, tier: 'real', query: q }); console.log(`  s${n}_${k} 〔真實圖〕real-library（備援）✓`); return { path: li, video: isMotion(li) }; }
    }
    // 真實案件素材皆無 → 非真實素材依使用者定序(2026-06-04)：③影片素材 → ④AI模擬生圖 → ⑤圖片素材
    // ③ 影片素材：Pexels 場景影片（動態，優於 AI 靜圖）
    let sv = await pexelsVideo(q, vidOut); if (!sv) for (const g of GENERIC) { sv = await pexelsVideo(g, vidOut); if (sv) break; }
    if (sv) { credits.push({ seg: n, k, ...sv, query: q }); console.log(`  s${n}_${k} 〔影片素材〕Pexels ✓`); return { path: vidOut, video: true }; }
    // ④ AI 模擬生圖（在圖片素材之前）
    if (!REFETCH && existsSync(aiOut) && statSync(aiOut).size > 8000) return { path: aiOut, video: false, illustrative: true };
    const ai4 = await aiIllustrate(prompt, aiOut, n * 97 + k * 13);
    if (ai4) { credits.push({ seg: n, k, title: 'AI 示意圖', creator: ai4.backend, license: 'AI 生成（示意圖，非真實畫面）', source: '', query: q, tier: 'ai' }); console.log(`  s${n}_${k} 〔生成圖〕AI ✓ ${ai4.backend}`); return { path: aiOut, video: false, illustrative: true }; }
    // ⑤ 圖片素材：Openverse CC 圖 → Pexels 場景圖
    let cc = await openverse(q, imgOut); if (!cc) for (const g of GENERIC) { cc = await openverse(g, imgOut); if (cc) break; }
    if (cc) { credits.push({ seg: n, k, ...cc, query: q }); console.log(`  s${n}_${k} 〔圖片素材〕Openverse CC ✓`); return { path: imgOut, video: false }; }
    let px = await pexelsImage(q, imgOut); if (!px) for (const g of GENERIC) { px = await pexelsImage(g, imgOut); if (px) break; }
    if (px) { credits.push({ seg: n, k, ...px, query: q }); console.log(`  s${n}_${k} 〔圖片素材〕Pexels ✓`); return { path: imgOut, video: false }; }
    gradientFallback(imgOut, heading); console.log(`  s${n}_${k} 〔圖片素材〕無 → 灰底`); return { path: imgOut, video: false, illustrative: true };
  }
  if (!REFETCH && existsSync(aiOut) && statSync(aiOut).size > 8000) return { path: aiOut, video: false, illustrative: true };
  const ai = await aiIllustrate(prompt, aiOut, n * 97 + k * 13);
  if (ai) { credits.push({ seg: n, k, title: 'AI 示意圖', creator: ai.backend, license: 'AI 生成（示意圖，非真實畫面）', source: '', query: q, tier: 'ai' }); console.log(`  s${n}_${k} 〔生成圖〕AI ✓ ${ai.backend}`); return { path: aiOut, video: false, illustrative: true }; }
  gradientFallback(imgOut, heading); console.log(`  s${n}_${k} 〔生成圖〕AI失敗→灰底`); return { path: imgOut, video: false, illustrative: true };
}

// ---- 地圖串場：真實地圖從全國快速縮放到案發地區（牽涉地點的轉場段用，visual 標 map）----
// 地點解析：cases/<slug>/map.json 的 place > EP.location > [INTRO] 日期卡的地點行。geocode 用 Nominatim（免 key）。
function mapPlace() {
  try { const mp = join(CASE, 'map.json'); if (existsSync(mp)) { const j = JSON.parse(readFileSync(mp, 'utf8')); if (j.place) return j.place; } } catch { }
  if (EP.location) return EP.location;
  const dl = (EP.intro && EP.intro.dateLines) || [];
  for (let i = dl.length - 1; i >= 0; i--) { const raw = String(dl[i]); if (!/^[\s0-9０-９年月日.,]+$/.test(raw)) return raw.replace(/[0-9０-９]+\s*[年月日]/g, '').trim() || raw; }
  return null;
}
async function geocode(place) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`, { headers: UA });
    if (!r.ok) return null; const j = await r.json(); if (!j[0]) return null;
    return { lat: +j[0].lat, lng: +j[0].lon };
  } catch { return null; }
}
function staticMap(lat, lng, zoom, out) {
  const key = process.env.GOOGLE_MAPS_KEY;
  let url;
  if (key) {
    url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=640x360&scale=2&maptype=terrain&markers=color:red%7C${lat},${lng}&key=${key}`;
  } else {
    // 免 key：Esri ArcGIS World_Topo 匯出（穩定、有地名/邊界，適合「全國→該區」縮放）。由 zoom 推算 bbox。
    const lonHalf = 900 / Math.pow(2, zoom), latHalf = lonHalf * 0.5625;
    const xmin = Math.max(-180, lng - lonHalf).toFixed(5), xmax = Math.min(180, lng + lonHalf).toFixed(5);
    const ymin = Math.max(-85, lat - latHalf).toFixed(5), ymax = Math.min(85, lat + latHalf).toFixed(5);
    url = `https://services.arcgisonline.com/arcgis/rest/services/World_Topo_Map/MapServer/export?bbox=${xmin},${ymin},${xmax},${ymax}&bboxSR=4326&imageSR=3857&size=3840,2160&format=png&transparent=false&f=image`;
  }
  try { const buf = execFileSync('curl', ['-sL', '--max-time', '40', url], { encoding: 'buffer', maxBuffer: 1 << 26 }); if (!buf || buf.length < 5000) return false; writeFileSync(out, buf); return true; }
  catch { return false; }
}
async function mapZoomClip(outPath, place, cd) {
  if (!place) { console.log('  地圖串場：無地點 → 略過'); return false; }
  const loc = await geocode(place);
  if (!loc) { console.log(`  地圖串場：找不到「${place}」座標 → 略過`); return false; }
  // ★預設：單張高解析地圖（3840×2160）做一鏡連續推近。
  //   消抖關鍵：用「同一張圖、同一套標註」推近——舊作法把 z5→z13 多張不同級圖磚 xfade 疊接，
  //   各級標註/路網位置不同，溶接時特徵位移＝不自然抖動。單張無磚界＝無跳動。PILOT_MAP_SINGLE=0 回退多磚。
  if (process.env.PILOT_MAP_SINGLE !== '0') {
    const FR = FPS;
    const Z = Number(process.env.PILOT_MAP_ZOOM || '7');      // 起始拉寬到州/區域級＝「從遠到近」旅程感更明顯（單張無抖；可用 env 調框）
    const zoomDur = Math.min(cd * 0.62, 10);                  // 推近放慢、拉長＝更明顯可見
    const f = join(IMG, `map_single_${Z}.png`);
    if (REFETCH || !existsSync(f) || statSync(f).size < 5000) staticMap(loc.lat, loc.lng, Z, f);
    if (existsSync(f) && statSync(f).size > 5000) {
      const nf = Math.max(2, Math.round(cd * FR));
      // ★徹底消抖：不用 zoompan（其逐幀整數 x/y 在慢速推近時會次像素抖動）。
      //   改成「scale 連續放大（lanczos 內插）＋固定置中 crop」——crop 位置恆定＝無位移抖動，
      //   放大倍率由 1×→3×（起點整張寬域入鏡、終點中央 3× 近景＝拉近更明顯），全程 lanczos 重採樣＝平滑。
      //   p = min(t/zoomDur, 1)：前 zoomDur 推近，其餘 hold。源 3840×2160；scale 寬 1920→5760（中段後輕度上採，仍平滑無抖）。
      const p = `min(t/${zoomDur.toFixed(3)}\\,1)`;
      let vf = `scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,`;
      vf += `scale=w='1920*(1+2*${p})':h='1080*(1+2*${p})':eval=frame:flags=lanczos,crop=1920:1080`;
      vf += `,drawtext=fontfile=fonts/msjh.ttc:text='●':fontcolor=0xff3b30:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2:alpha='0.6+0.4*sin(2*PI*t)',format=yuv420p`;
      try { sh('ffmpeg', ['-y', '-loop', '1', '-i', f, '-vf', vf, '-frames:v', String(nf), '-r', String(FR), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outPath], { cwd: BUILD }); console.log(`  地圖串場：${place}（單張 scale 連續推近 z${Z}，無 zoompan＝無抖）✓ ${process.env.GOOGLE_MAPS_KEY ? 'Google' : 'OSM'}`); return true; }
      catch (e) { console.log('  地圖串場（單張）失敗 → 退多磚：' + (e.message || e)); }
    } else console.log('  地圖串場（單張）取圖失敗 → 退多磚');
  }
  const ZF = 5, ZT = 13, frames = [];   // 回退：z5（廣域）→ z13（街區級）多磚連續滑入
  for (let z = ZF; z <= ZT; z++) {
    const f = join(IMG, `map_${String(z).padStart(2, '0')}.png`);
    if (REFETCH || !existsSync(f) || statSync(f).size < 5000) { if (!staticMap(loc.lat, loc.lng, z, f)) break; await new Promise(r => setTimeout(r, 150)); }
    if (existsSync(f) && statSync(f).size > 5000) frames.push(f);
  }
  if (frames.length < 2) { console.log('  地圖串場：地圖張數不足 → 略過'); return false; }
  // 連續滑入（取代舊「一格一格跳」）：每張 tile 內部用 zoompan 連續推近 1.0→2.0，
  // 剛好等於下一張 tile（縮放差一級＝尺度 2×）在 1.0 時的畫面 → 接點地理尺度相符；
  // 張間用長交叉溶接（overlap）疊上去，整體像一鏡到底慢慢拉近，順滑無跳格。
  const FR = FPS, overlap = 1.4;
  const zoomDur = Math.min(cd * 0.5, 8), holdDur = Math.max(0, cd - zoomDur); // 加快 ~30%（多磚回退）
  const seg = (zoomDur + overlap * (frames.length - 1)) / frames.length; // 含重疊的每張時長
  const parts = [];
  for (let i = 0; i < frames.length; i++) {
    const last = i === frames.length - 1;
    const nf = Math.max(2, Math.round((seg + (last ? holdDur : 0)) * FR));
    const d = nf / FR;
    const c = join(CLIPS, `mz_${String(i).padStart(2, '0')}.mp4`);
    // zoompan 連續推近；中心固定＝地點。最後一張疊脈動紅色定位點標出案發地。
    // -frames:v 限長（非 -t）：zoompan 在 -loop 1 下每張輸入展開 d 幀，用輸出幀數限制才不爆長。
    // 超採樣：源放到 3840×2160 再 zoompan 縮回 1920×1080——z 推到 2.0 時剛好對應 1:1 原畫素（不上採樣＝清晰），亦消掉 zoompan 次像素抖動。
    let vf = `scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='min(1.0+1.0*on/${nf},2.0)':d=${nf}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=${FR}`;
    if (last) vf += `,drawtext=fontfile=fonts/msjh.ttc:text='●':fontcolor=0xff3b30:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2:alpha='0.6+0.4*sin(2*PI*t)'`;
    vf += `,format=yuv420p`;
    sh('ffmpeg', ['-y', '-loop', '1', '-i', frames[i], '-vf', vf, '-frames:v', String(nf), '-r', String(FR), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', c], { cwd: BUILD });
    parts.push({ file: c, dur: d });
  }
  const inputs = parts.flatMap(p => ['-i', p.file]); let fc = '', prev = '0:v', acc = parts[0].dur;
  for (let i = 1; i < parts.length; i++) { const off = (acc - overlap).toFixed(3), o = (i === parts.length - 1) ? 'mzv' : `mz${i}`; fc += `[${prev}][${i}:v]xfade=transition=fade:duration=${overlap.toFixed(3)}:offset=${off}[${o}];`; prev = o; acc = acc + parts[i].dur - overlap; }
  fc = fc.replace(/;$/, '');
  try { sh('ffmpeg', ['-y', ...inputs, '-filter_complex', fc, '-map', '[mzv]', '-t', cd.toFixed(3), '-r', String(FR), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outPath], { cwd: BUILD, maxBuffer: 1 << 27 }); console.log(`  地圖串場：${place}（z${ZF}→z${ZF + frames.length - 1} 連續滑入＋紅點）✓ ${process.env.GOOGLE_MAPS_KEY ? 'Google' : 'OSM'}`); return true; }
  catch (e) { console.log('  地圖串場 xfade 失敗 → 略過：' + (e.message || e)); return false; }
}

// 片尾真實素材：優先手動上傳 production/manual/ending_*；否則退 real-library；皆無回 null（用漸層底）
// ★尊重「每素材 ≤2 次」上限：庫素材若已用滿(overUsed)就不再拿來當片尾——寧可退灰底，也不讓同一張破第 3 次。
function endingFootage() {
  if (existsSync(MANUAL)) for (let k = 0; k < 8; k++) for (const ext of ['mp4', 'webm', 'mov', 'png', 'jpg', 'jpeg', 'webp']) { const f = join(MANUAL, `ending_${k}.${ext}`); if (existsSync(f) && statSync(f).size > 2000) return { path: f, video: /mp4|webm|mov/.test(ext) }; }
  const v = libVids.find(p => !overUsed(p)); if (v) { markUse(v); return { path: v, video: true }; }
  const i = libImgs.find(p => !overUsed(p)); if (i) { markUse(i); return { path: i, video: false }; }
  return null; // 庫素材全用滿 → 回 null，片尾用漸層底（buildEndingClip 已有退路）
}
// 字卡斷行（drawtext 由 textfile 讀，檔內換行即多行）
function wrapForCard(t, max) { t = (t || '').trim(); if (!t) return ''; const out = []; let cur = ''; for (const ch of [...t]) { cur += ch; if (cur.length >= max && /[，。！？、,.!?；;…\s]/.test(ch)) { out.push(cur.trim()); cur = ''; } } if (cur.trim()) out.push(cur.trim()); return out.join('\n'); }

// 羊皮紙打字機：日期地點在羊皮紙上一個字一個字敲出（每字一個短窗 drawtext，前 60% 時間打字、後 40% 定住）。
// 底：brand/assets/parchment.* 羊皮紙圖＞sepia 漸層（無檔退用）；墨色字。完成的行恆顯到結束＝原本的字不消失。
function buildTypewriterClip(outPath, dateLines, cd) {
  const lines = (dateLines || []).slice(0, 3).map(l => [...String(l)]);
  const allChars = lines.reduce((a, l) => a + l.length, 0) || 1;
  const per = (cd * 0.6) / allChars; let tAcc = 0; const draws = [];
  lines.forEach((chars, li) => {
    const y = `(h/2)-${(lines.length - 1) * 64}+${li * 128}`;
    for (let c = 1; c <= chars.length; c++) {
      // 每一行的「最後一字」恆顯到 cd（c===chars.length → end=cd）＝完成的行不消失；
      // 先前只把「末行末字」設到 cd，導致前面行被後面行開始打字時整行消失。
      const start = tAcc; tAcc += per; const end = (c === chars.length) ? cd : tAcc;
      writeFileSync(join(HEADS, `iv_${li}_${c}.txt`), chars.slice(0, c).join(''), 'utf8');
      draws.push(`drawtext=fontfile=fonts/msjh.ttc:textfile=heads/iv_${li}_${c}.txt:fontcolor=0x3a2a18:fontsize=66:x=(w-tw)/2:y=${y}:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);
    }
  });
  const PARCH = ['jpg', 'jpeg', 'png', 'webp'].map(e => join(ROOT, 'brand', 'assets', 'parchment.' + e)).find(f => existsSync(f)) || null;
  const vfPre = PARCH ? 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,' : '';
  const vf = vfPre + (draws.length ? draws.join(',') + ',' : '') + 'format=yuv420p';
  const bgIn = PARCH ? ['-loop', '1', '-i', PARCH] : ['-f', 'lavfi', '-i', `gradients=s=1920x1080:c0=0xc9b285:c1=0xa88a5c`];
  sh('ffmpeg', ['-y', ...bgIn, '-t', cd.toFixed(3), '-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outPath], { cwd: BUILD });
}

// 片尾序列：懸念問句（黑底）→ 真實素材 → 電影謝幕字卡，硬切串成單一 clip（外層再 xfade 進主時間軸）
function buildEndingClip(outPath, ending, phases, cd) {
  const { qd, fd, crd } = phases; const parts = [];
  if (qd > 0 && ending.question) {
    const qf = join(CLIPS, 'end_q.mp4'); writeFileSync(join(HEADS, 'end_q.txt'), wrapForCard(ending.question, 13), 'utf8');
    sh('ffmpeg', ['-y', '-f', 'lavfi', '-t', qd.toFixed(3), '-i', `color=c=black:s=1920x1080:r=${FPS}`, '-vf', `drawtext=fontfile=fonts/msjh.ttc:textfile=heads/end_q.txt:fontcolor=0xe6edf3:fontsize=58:x=(w-tw)/2:y=(h-text_h)/2:line_spacing=18:alpha='if(lt(t,0.8),t/0.8,1)',format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', qf], { cwd: BUILD });
    parts.push(qf);
  }
  const foot = endingFootage(); const ff = join(CLIPS, 'end_foot.mp4');
  if (foot && foot.video) sh('ffmpeg', ['-y', '-stream_loop', '-1', '-t', fd.toFixed(3), '-i', foot.path, '-an', '-vf', `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,eq=brightness=-0.03:saturation=0.85,format=yuv420p`, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ff], { cwd: BUILD });
  else if (foot) { const fr = Math.max(1, Math.round(fd * FPS)); sh('ffmpeg', ['-y', '-loop', '1', '-i', foot.path, '-vf', `scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='min(1.0+0.0008*on,1.18)':d=${fr}:s=1920x1080:fps=${FPS},format=yuv420p`, '-frames:v', String(fr), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ff], { cwd: BUILD }); }
  else sh('ffmpeg', ['-y', '-f', 'lavfi', '-t', fd.toFixed(3), '-i', `gradients=s=1920x1080:c0=0x0c1118:c1=0x05080c`, '-vf', 'format=yuv420p', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ff], { cwd: BUILD });
  parts.push(ff);
  const cf = join(CLIPS, 'end_cr.mp4'); writeFileSync(join(HEADS, 'end_cr.txt'), wrapForCard(ending.credits || '感謝收看，我們下一樁懸案見。', 16), 'utf8');
  sh('ffmpeg', ['-y', '-f', 'lavfi', '-t', crd.toFixed(3), '-i', `color=c=black:s=1920x1080:r=${FPS}`, '-vf', `drawtext=fontfile=fonts/msjh.ttc:textfile=heads/end_cr.txt:fontcolor=0xcdd6e0:fontsize=46:x=(w-tw)/2:y=(h-text_h)/2:line_spacing=16:alpha='if(lt(t,1),t,1)',format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', cf], { cwd: BUILD });
  parts.push(cf);
  writeFileSync(join(BUILD, 'end_concat.txt'), parts.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n') + '\n', 'utf8');
  sh('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', 'end_concat.txt', '-t', cd.toFixed(3), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', outPath], { cwd: BUILD });
}

// ---- 單槽操作（--only-slot / --regen-slot）：只重抓/重生指定槽 → 寫回 build/img 快取＋更新 segment-manifest → 退出 ----
// 不跑整段 clip 組裝；前置 TTS 走 sig 快取（文字未變＝快）、素材詞庫/級聯已就緒，直接複用 acquireMode/aiIllustrate。
if (SINGLE_SLOT_MODE) {
  const mm = /^(\d+):(\d+)$/.exec(String(ONLY_SLOT || REGEN_SLOT).trim());
  if (!mm) { console.error('--only-slot/--regen-slot 需 N:K 格式'); process.exit(2); }
  const N = +mm[1], K = +mm[2];
  const seg = segs.find(s => s.narrIndex === N);
  if (!seg) { console.error(`找不到 narrIndex=${N} 的段`); process.exit(2); }
  const visual = seg.visual || [];
  const mode = REGEN_SLOT ? 'illust' : (SET_MODE || (visual.includes('video') ? 'video' : visual.includes('real-photo') ? 'real-photo' : 'illust'));
  if (SET_QUERY) REAL_SUBJ[N] = [SET_QUERY];   // 自訂查詢詞最高優先（realQueries 優先取 REAL_SUBJ[N]）
  const q = SET_QUERY || (termsForCategories(SNOWTOWN_SEG_CATEGORIES[N]) || GENERIC)[0];
  const prompt = SET_PROMPT || (promptsBySeg[N] || [])[K] || seg.imagePrompt || 'dark abandoned scene, cinematic, no people';
  for (const ext of ['mp4', 'jpg', 'ai.jpg']) { const f = join(IMG, `s${N}_${K}.${ext}`); if (existsSync(f)) try { unlinkSync(f); } catch { } }  // 清舊快取＝強制重抓
  console.log(`單槽操作：s${N}_${K} mode=${mode}${SET_QUERY ? ` query="${SET_QUERY}"` : ''}`);
  const item = await acquireMode(mode, N, K, q, prompt, seg.heading);
  if (!item || !item.path) { console.error('單槽取材失敗'); process.exit(1); }
  const c = credits.find(x => x.seg === N && x.k === K) || {};
  // 落地為 manual 覆寫（最高優先＝survive 整片重渲與 mode 不符）；real tier 另寫 .real 標記＝渲染不烙「示意圖」。
  const isReal = c.tier ? c.tier === 'real' : !item.illustrative;
  mkdirSync(MANUAL, { recursive: true });
  const srcExt = (String(item.path).match(/\.(mp4|webm|mov|jpg|jpeg|png|webp|gif)$/i) || [, 'jpg'])[1].toLowerCase();
  const manExt = item.video ? (srcExt === 'webm' || srcExt === 'mov' ? srcExt : 'mp4') : (srcExt === 'png' || srcExt === 'webp' ? srcExt : 'jpg');
  for (const e of ['mp4', 'webm', 'mov', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'real']) { const f = join(MANUAL, `s${N}_${K}.${e}`); if (existsSync(f)) try { unlinkSync(f); } catch { } }
  const manPath = join(MANUAL, `s${N}_${K}.${manExt}`);
  copyFileSync(item.path, manPath);
  if (isReal) writeFileSync(join(MANUAL, `s${N}_${K}.real`), '', 'utf8');
  try {   // 更新 segment-manifest（若存在）該槽
    const mp = join(CASE, 'production', 'segment-manifest.json');
    if (existsSync(mp)) {
      const man = JSON.parse(readFileSync(mp, 'utf8'));
      const relToRoot = (p) => { const r = String(p).replace(/\\/g, '/'); const base = ROOT.replace(/\\/g, '/').replace(/\/+$/, '') + '/'; return r.startsWith(base) ? r.slice(base.length) : r; };
      const sg = (man.segments || []).find(x => x.narrIndex === N);
      if (sg) {
        sg.slots = sg.slots || [];
        let slot = sg.slots.find(x => x.k === K);
        if (!slot) { slot = { k: K }; sg.slots.push(slot); sg.slots.sort((a, b) => a.k - b.k); }
        Object.assign(slot, {
          type: item.video ? 'video' : 'image', tier: isReal ? 'real' : (item.illustrative ? 'ai' : (c.tier || 'unknown')),
          provider: c.provider || '', title: c.title || '', creator: c.creator || '',
          license: c.license || '', source: c.source || '', query: c.query || q,
          prompt, isManual: true, file: relToRoot(manPath),
        });
        writeFileSync(mp, JSON.stringify(man, null, 2), 'utf8');
      }
    }
  } catch (e) { console.log('manifest 更新略過：' + (e.message || e)); }
  console.log(`✓ 單槽完成：s${N}_${K} → ${manPath}${isReal ? '（真實，不烙示意圖）' : ''}`);
  process.exit(0);
}

// ---- 單段預覽（--only-seg N）：用該段「已抓素材＋快取語音」獨立合一段預覽 mp4，不碰主組裝、不重抓其他段 ----
// 設為原聲：cases/<slug>/production/audio-overrides.json 標 {"<narrIndex>":"original"} 時，該段改用影片原聲（取代 TTS）。
if (ONLY_SEG !== null && String(ONLY_SEG).trim() !== '') {
  const N = +String(ONLY_SEG).trim();
  const s = segs.findIndex(x => x.narrIndex === N);
  if (s < 0) { console.error(`找不到 narrIndex=${N} 的段`); process.exit(2); }
  const PREVDIR = join(BUILD, 'preview', SLUG); mkdirSync(PREVDIR, { recursive: true });
  const ttsWav = join(AUDIO, `seg${s}.wav`);
  if (!existsSync(ttsWav)) { console.error(`缺語音快取 ${ttsWav}（請先整片渲染一次建立 segN.wav）`); process.exit(2); }
  // 設為原聲？
  let useOriginal = false;
  try { const ov = JSON.parse(readFileSync(join(CASE, 'production', 'audio-overrides.json'), 'utf8')); useOriginal = ov && ov[String(N)] === 'original'; } catch { }
  // 收集該段已存在的槽檔（manual 覆寫優先；否則 build/img）
  const items = [];
  for (let k = 0; k < 12; k++) {
    const man = manualFor(N, k);   // {path,video,real} 或 null
    if (man) { items.push({ path: man.path, video: !!man.video, illustrative: !man.video && !man.real }); continue; }
    let p, vid = false; for (const ext of ['mp4', 'jpg', 'ai.jpg']) { const c = join(IMG, `s${N}_${k}.${ext}`); if (existsSync(c)) { p = c; vid = ext === 'mp4'; break; } }
    if (p) items.push({ path: p, video: vid, illustrative: /\.ai\.jpg$/i.test(p) });
  }
  if (!items.length) { const g = join(PREVDIR, `s${N}_g.jpg`); gradientFallback(g, segs[s].heading || ''); items.push({ path: g, video: false, illustrative: true }); }
  const audioDur = dur(ttsWav) || 6;
  const per = Math.max(1.2, audioDur / items.length);
  writeFileSync(join(HEADS, 'illust.txt'), ILLUST_LABEL, 'utf8');
  const parts = [];
  for (let j = 0; j < items.length; j++) {
    const it = items[j]; const clip = join(PREVDIR, `c${j}.mp4`);
    try {
      if (it.video) {
        sh('ffmpeg', ['-y', '-stream_loop', '-1', '-t', per.toFixed(3), '-i', it.path, '-an',
          '-vf', `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,eq=brightness=-0.05:saturation=0.82,format=yuv420p`, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clip]);
      } else {
        const brand = it.illustrative ? `,drawtext=fontfile=fonts/msjh.ttc:textfile=heads/illust.txt:fontcolor=0xddddddcc:fontsize=34:x=w-tw-36:y=h-th-30:box=1:boxcolor=0x00000066:boxborderw=10` : '';
        sh('ffmpeg', ['-y', '-loop', '1', '-t', per.toFixed(3), '-i', it.path,
          '-vf', `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080${brand},format=yuv420p`, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clip], { cwd: BUILD });
      }
    } catch (e) { gradientFallback(clip.replace(/\.mp4$/, '.jpg'), segs[s].heading || ''); sh('ffmpeg', ['-y', '-loop', '1', '-t', per.toFixed(3), '-i', clip.replace(/\.mp4$/, '.jpg'), '-vf', `scale=1920:1080,format=yuv420p`, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clip], { cwd: BUILD }); }
    parts.push(clip);
  }
  const listF = join(PREVDIR, 'list.txt');
  writeFileSync(listF, parts.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n') + '\n', 'utf8');
  const visuals = join(PREVDIR, 'visuals.mp4');
  sh('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listF, '-vf', `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=${FPS}`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', visuals]);
  // 音軌：設為原聲＝取第一個影片槽的原聲，否則用 TTS 快取
  let audioSrc = ttsWav, audioNote = 'TTS';
  if (useOriginal) { const v = items.find(x => x.video); if (v) { audioSrc = v.path; audioNote = '影片原聲'; } }
  const out = join(PREVDIR, `seg${N}.mp4`);
  sh('ffmpeg', ['-y', '-i', visuals, '-i', audioSrc, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', out]);
  console.log(`✓ 單段預覽：seg${N}（${items.length} 槽／音軌=${audioNote}）→ ${out}`);
  process.exit(0);
}

console.log('取材：establishing 槽優先真實案件素材（Commons），其餘氛圍空景（Pexels/Openverse）；解說員段用' + (hostClip ? '循環影片' : '定格肖像') + '...');
for (let s = 0; s < segs.length; s++) {
  const seg = segs[s];
  segImages[s] = [];
  // 解說員段：單張全螢幕定格肖像（同一條簽名聲線於 TTS 迴圈處理）
  if (seg.kind === 'host') {
    if (hostClip) segImages[s].push({ path: hostClip, video: true, host: true });           // PILOT_HOST_VIDEO=1：ping-pong 版
    else if (HOST_MOVING) segImages[s].push({ path: HOST_VID, video: true, host: true });    // ★預設：自然正放無縫循環（clip 迴圈處理）
    else segImages[s].push({ path: hostImgPath, video: false, host: true });                 // PILOT_HOST_STILL=1：定格
    imgCount++; continue;
  }
  // 合成段：打字機開場／片尾收尾（實際畫面在 clip 迴圈渲染）
  if (seg.kind === 'intro' || seg.kind === 'timecard') { segImages[s].push({ intro: true }); imgCount++; continue; }
  if (seg.kind === 'ending') { segImages[s].push({ ending: true }); imgCount++; continue; }
  const n = seg.narrIndex;
  // 每段「畫面類型」標籤（episode.json visual[]）：chart 走關係圖；video/real-photo/illust 走 acquireMode；無標籤→沿用既有優先序
  const visualModes = (seg.visual || []).filter(Boolean);
  // 關係圖段：只由 relations.json 的 showOnNarrIndex 精準控制（avoid 過去「episode 標了 11 個 chart 段→關係圖出現 11 次」）。
  // episode.json 的 visual:"chart" 標記僅供 story-arc 參考，實際出不出由 relations.json 決定。動態 org-chart 接管整段，渲染延到 clip 迴圈。
  if (RELATIONS && CHART_NARR.has(n)) { segImages[s].push({ chart: true }); imgCount++; console.log(`  s${n} 人物關係圖（動態 org-chart）✓`); continue; }
  if (STATS && STAT_NARR.has(n)) { segImages[s].push({ stat: true }); imgCount++; console.log(`  s${n} 統計長條圖（動態）✓`); continue; }
  if (TIMELINE && TL_NARR.has(n)) { segImages[s].push({ timeline: true }); imgCount++; console.log(`  s${n} 橫向時間軸（動態）✓`); continue; }
  // 地圖串場段：真實地圖快速縮放接管整段（牽涉地點的轉場），實際渲染延到 clip 迴圈
  if (visualModes.includes('map')) { const place = mapPlace(); segImages[s].push({ map: true, place }); imgCount++; console.log(`  s${n} 地圖串場（${place || '未知地點'}）`); continue; }
  const segModes = visualModes.filter(m => m !== 'chart' && m !== 'host' && m !== 'map');
  const prompts = promptsBySeg[n] || [seg.imagePrompt || 'dark abandoned scene, cinematic, no people'];
  const qlist = termsForCategories(SNOWTOWN_SEG_CATEGORIES[n]) || GENERIC; // 換案件無詞庫時自動退回 GENERIC
  for (let k = 0; k < prompts.length; k++) {
    const q = qlist[k % qlist.length];
    const vidOut = join(IMG, `s${n}_${k}.mp4`);
    const imgOut = join(IMG, `s${n}_${k}.jpg`);
    const aiOut = join(IMG, `s${n}_${k}.ai.jpg`);
    // Plan B：手動貼圖最優先，覆蓋所有自動來源（含真實素材）
    const man = manualFor(n, k);
    if (man) { segImages[s].push({ path: man.path, video: man.video, illustrative: !man.video && !man.real }); imgCount++; console.log(`  s${n}_${k} 手動貼圖${man.real ? '（真實）' : ''} ✓`); continue; }
    // ★影片優先（使用者定調 2026-06-02）：場景段每一槽都從 'video' 起跳，acquireMode 自動級聯
    //   真實影片 → 真實圖片 → AI 寫實示意，盡量取到真實影片。涉真人臉/暴力段查詢詞本就只含場景（不含臉），無紅線風險。
    if (segModes.length) { const item = await acquireMode('video', n, k, q, prompts[k] || seg.imagePrompt, seg.heading); segImages[s].push(item); imgCount++; continue; }
    if (!REFETCH && existsSync(aiOut) && statSync(aiOut).size > 8000) { segImages[s].push({ path: aiOut, video: false, illustrative: true }); imgCount++; continue; }
    // 全片卡通：跳過實拍/CC 與其快取，旁白段一律 AI 卡通示意（失敗退灰底圖卡）
    if (ILLUST_FIRST) {
      process.stdout.write(`  s${n}_${k} AI卡通 ... `);
      const ai = await aiIllustrate(prompts[k] || seg.imagePrompt, aiOut, n * 97 + k * 13);
      if (ai) { credits.push({ seg: n, k, title: 'AI 卡通示意圖', creator: ai.backend, license: 'AI 生成（示意圖，非真實畫面）', source: '', query: q, tier: 'ai' }); console.log('✓ ' + ai.backend); segImages[s].push({ path: aiOut, video: false, illustrative: true }); imgCount++; }
      else { gradientFallback(imgOut, seg.heading); console.log('AI失敗→灰底圖卡'); segImages[s].push({ path: imgOut, video: false, illustrative: true }); imgCount++; }
      await new Promise(r => setTimeout(r, 200));
      continue;
    }
    if (!REFETCH && existsSync(vidOut) && statSync(vidOut).size > 50000) { segImages[s].push({ path: vidOut, video: true }); imgCount++; continue; }
    if (!REFETCH && existsSync(imgOut) && statSync(imgOut).size > 8000) { segImages[s].push({ path: imgOut, video: false }); imgCount++; continue; }
    process.stdout.write(`  s${n}_${k} "${q}" ... `);
    // 0) establishing 槽（每段第一張）優先「第一層真實案件素材」（Wikimedia Commons / 選配 Street View）
    if (k === 0 && SLUG === 'snowtown-murders' && (SNOWTOWN_SEG_REAL[n] || []).length) {
      const rr = await fetchRealImage(SNOWTOWN_SEG_REAL[n], imgOut, { streetView: STREETVIEW_ON });
      if (rr) { realCredits.push({ seg: n, k, ...rr }); credits.push({ seg: n, k, ...rr, query: rr.subject }); console.log('真實素材 ✓ ' + rr.provider); segImages[s].push({ path: imgOut, video: false }); imgCount++; await new Promise(r => setTimeout(r, 300)); continue; }
    }
    // 1) 已下載的本地 real-library 優先於 live 抓取（命中本段詞者優先，否則影片/圖交錯輪替）；同一張 ≤2 次，全用滿才往下退
    if (libPool.length) {
      let a = libMatchForSeg(n, libPool);
      if (!a) { let tries = 0; do { a = libPool[libIdx % libPool.length]; libIdx++; } while (overUsed(a.path) && ++tries < libPool.length); if (overUsed(a.path)) a = null; }
      if (a) {
        markUse(a.path);
        const fn = a.path.split(/[\\\/]/).pop();
        realCredits.push({ seg: n, k, subject: 'real-library', title: fn, creator: 'real-library', license: '見 real-library/MANIFEST.csv', licenseUrl: '', source: a.path, provider: 'real-library' });
        credits.push({ seg: n, k, title: fn, creator: 'real-library', license: 'PD/CC', source: a.path, tier: 'real', query: q });
        console.log('real-library ' + (a.video ? '影片' : '圖') + ' ✓ ' + fn);
        segImages[s].push({ path: a.path, video: a.video }); imgCount++; continue;
      }
      console.log('real-library 已全部用滿 → 退 live/AI');
    }
    // 2) Pexels 真實影片（有 PEXELS_KEY 才嘗試；庫空才走 live）
    const pv = await pexelsVideo(q, vidOut);
    if (pv) { credits.push({ seg: n, k, ...pv, query: q }); console.log('Pexels 影片 ✓'); segImages[s].push({ path: vidOut, video: true }); imgCount++; await new Promise(r => setTimeout(r, 300)); continue; }
    // 3) Openverse CC 真實圖
    let cc = await openverse(q, imgOut);
    if (!cc) for (const g of GENERIC) { cc = await openverse(g, imgOut); if (cc) break; }
    if (cc) { credits.push({ seg: n, k, ...cc, query: q }); console.log('CC 圖 ✓'); segImages[s].push({ path: imgOut, video: false }); imgCount++; }
    else {
      // 3) Plan A：AI 示意圖（非真實畫面；後端 pollinations 雲端／local 本機 GPU），失敗才退灰底圖卡
      const ai = await aiIllustrate(prompts[k] || seg.imagePrompt, aiOut, n * 97 + k * 13);
      if (ai) { credits.push({ seg: n, k, title: 'AI 示意圖', creator: ai.backend, license: 'AI 生成（示意圖，非真實畫面）', source: '', query: q, tier: 'ai' }); console.log('AI 示意 ✓ ' + ai.backend); segImages[s].push({ path: aiOut, video: false, illustrative: true }); imgCount++; }
      else { gradientFallback(imgOut, seg.heading); console.log('灰底圖卡'); segImages[s].push({ path: imgOut, video: false, illustrative: true }); imgCount++; }
    }
    await new Promise(r => setTimeout(r, 400));
  }
}
// ---- live 命中歸檔：把本次 live 取得的真實素材沉澱進 real-library（description 含來源查詢詞→下次精準對位；clearance=🟡 待人工覆核）----
try {
  const RL = join(ROOT, 'assets', SLUG, 'real-library');
  const _d = new Date(), _p = x => String(x).padStart(2, '0');
  const ADATE = `${_d.getFullYear()}${_p(_d.getMonth() + 1)}${_p(_d.getDate())}`;
  const arch = [];
  for (const c of realCredits) {
    if (!c.provider || /real-library/i.test(c.provider)) continue;                 // 已在庫者略過
    const isVid = /video/i.test(c.provider || '');
    const src = join(IMG, `s${c.seg}_${c.k}.${isVid ? 'mp4' : 'jpg'}`);
    if (!existsSync(src)) continue;
    const q = String(c.subject || c.query || '').trim();
    const fname = `${ADATE}_real-${fileSlug((q ? q + '-' : '') + (c.title || 'item'))}.${isVid ? 'mp4' : 'jpg'}`;
    const dstDir = join(RL, isVid ? 'video' : 'images');
    mkdirSync(dstDir, { recursive: true });
    const dst = join(dstDir, fname);
    if (!existsSync(dst)) { try { copyFileSync(src, dst); } catch { continue; } }
    arch.push({ filename: fname, type: isVid ? 'video' : 'image', category: categoryOf(c.title || q, isVid ? 'video' : 'image'),
      description: (q ? q + ' — ' : '') + (c.title || ''), source: c.provider, source_url: c.source || '',
      license_type: c.license || 'PD/CC', attribution: /cc0|public domain|\bpd\b/i.test(c.license || '') ? 'N' : (c.creator || 'see file page'),
      commercial_ok: 'Y', deidentify: SENSITIVE_RE.test(c.title || '') ? 'Y' : 'N', clearance: '🟡待人工確認', notes: 'live 命中自動歸檔' });
  }
  if (arch.length) { const added = appendManifest(join(RL, 'MANIFEST.csv'), arch); console.log(`live 命中歸檔：real-library 新增 ${added} 筆（含來源查詢詞，待人工覆核）`); }
} catch (e) { console.log('live 歸檔略過：' + (e.message || e)); }

// ---- 逐段素材清單（segment-manifest.json）：驅動「逐段素材檢視/編輯台」----
// 把本次實際採用的每段每槽素材（檔案/來源/授權/查詢詞）寫成結構化檔，供 web/segments.html 讀取。
// 資料全來自上方迴圈已備好的 segImages（實際採用）＋ credits（來源/授權/query），不重抓。
try {
  const relToRoot = (p) => {
    if (!p) return null;
    let r = String(p).replace(/\\/g, '/');
    const rootU = ROOT.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
    return r.startsWith(rootU) ? r.slice(rootU.length) : r;
  };
  const slotType = (it) => {
    if (!it) return 'none';
    if (it.host) return 'host';
    if (it.intro) return 'intro';
    if (it.ending) return 'ending';
    if (it.chart) return 'chart';
    if (it.stat) return 'stat';
    if (it.timeline) return 'timeline';
    if (it.map) return 'map';
    return it.video ? 'video' : 'image';
  };
  const composedTypes = new Set(['host', 'intro', 'ending', 'chart', 'stat', 'timeline', 'map']);
  const estSec = (txt) => {
    const chars = (txt || '').replace(/\s+/g, '').length;   // 與整片語速一致的粗估：中文約 5.5 字/秒，加段間停頓
    return Math.round((chars / 5.5 + PAUSE) * 10) / 10;
  };
  // 跨渲染累積的槽位來源（快取命中時 acquireMode 不推 credit→本次 credits 缺該槽；用上次存的補上，來源欄不空白）
  let prevCred = {};
  try { prevCred = JSON.parse(readFileSync(join(CASE, 'production', 'slot-credits.json'), 'utf8')) || {}; } catch { }
  const manifestSegs = segs.map((seg, s) => {
    const n = seg.narrIndex;
    const hasN = typeof n === 'number';
    const items = segImages[s] || [];
    const slots = items.map((it, k) => {
      const c = (hasN ? credits.find(x => x.seg === n && x.k === k) : null) || (hasN ? prevCred[`${n}_${k}`] : null) || null;
      const prompts = hasN ? (promptsBySeg[n] || []) : [];
      const ty = slotType(it);
      return {
        k, type: ty,
        // 來源分類：有 credit 用其 tier；否則 AI/灰底→ai、合成段→composed、有實際媒體檔（影片/真實圖，非 AI）→real、全空→unknown
        tier: c?.tier || (it.illustrative ? 'ai' : composedTypes.has(ty) ? 'composed' : (it.path || it.video ? 'real' : 'unknown')),
        provider: c?.provider || (c ? '' : (it.illustrative ? 'AI/灰底' : composedTypes.has(ty) ? '合成' : it.path ? '（快取，來源待確認）' : '')),
        title: c?.title || '',
        creator: c?.creator || '',
        license: c?.license || '',
        source: c?.source || '',
        query: c?.query || '',
        prompt: prompts[k] || seg.imagePrompt || '',
        isManual: hasN && !!manualFor(n, k),
        file: relToRoot(it.path || (hasN ? join(IMG, `s${n}_${k}.${it.video ? 'mp4' : 'jpg'}`) : null)),
      };
    });
    return {
      idx: s, id: seg.id, kind: seg.kind,
      narrIndex: hasN ? n : null,
      heading: seg.heading || '',
      narration: seg.narration || '',
      visual: seg.visual || [],
      // 實際渲染時長（meta[s].d，含語音/靜音實測）優先；取不到才退字數估算
      durationEst: meta.find(x => x.i === s)?.d != null ? Math.round(meta.find(x => x.i === s).d * 10) / 10 : estSec(seg.narration),
      slots,
    };
  });
  const pmDir = join(CASE, 'production');
  mkdirSync(pmDir, { recursive: true });
  writeFileSync(join(pmDir, 'segment-manifest.json'),
    JSON.stringify({ slug: SLUG, title: EP.title || SLUG, renderedAt: new Date().toISOString(), segments: manifestSegs }, null, 2), 'utf8');
  // 累積本次新抓到的槽位來源（只記數字槽 k；fill 槽略過），供下次快取渲染補來源
  const merged = { ...prevCred };
  for (const cr of credits) if (typeof cr.seg === 'number' && Number.isInteger(cr.k)) merged[`${cr.seg}_${cr.k}`] = { tier: cr.tier || '', provider: cr.provider || '', title: cr.title || '', creator: cr.creator || '', license: cr.license || '', source: cr.source || '', query: cr.query || '' };
  writeFileSync(join(pmDir, 'slot-credits.json'), JSON.stringify(merged, null, 2), 'utf8');
  console.log(`segment-manifest.json：${manifestSegs.length} 段已寫出（驅動逐段素材檢視台）`);
} catch (e) { console.log('segment-manifest 寫出略過：' + (e.message || e)); }

// BGM（心跳/脈動式緊張鋪底，優先 CC0）。手動覆寫：放 brand/assets/ending-bgm.mp3 即優先採用該曲。
const BGM = join(BUILD, 'bgm.mp3');
const BGM_OVERRIDE = join(ROOT, 'brand', 'assets', 'ending-bgm.mp3');
let bgmInfo = null;
if (existsSync(BGM_OVERRIDE) && statSync(BGM_OVERRIDE).size > 20000) { copyFileSync(BGM_OVERRIDE, BGM); bgmInfo = { title: '(自選 ending-bgm.mp3)', license: '', source: '' }; console.log('BGM：採用 brand/assets/ending-bgm.mp3'); }
else if (existsSync(BGM) && statSync(BGM).size > 20000) { bgmInfo = { title: '(快取)', license: '', source: '' }; console.log('BGM：快取'); }
else { console.log('取 BGM（Openverse 音訊，心跳/脈動式緊張）...'); bgmInfo = await openverseAudio('tense heartbeat pulse suspense', BGM) || await openverseAudio('dark pulsing tension cinematic', BGM) || await openverseAudio('cinematic dark drone', BGM); console.log(bgmInfo ? ('BGM ✓ ' + bgmInfo.title) : 'BGM：無，略過'); }
const hasBgm = existsSync(BGM) && statSync(BGM).size > 20000;

const atmos = credits.filter(c => c.tier !== 'real');
writeFileSync(join(OUTDIR, `${SLUG}-demo-credits.md`),
  `# Demo 影片素材出處與授權\n\n> 兩類素材：①真實案件素材（Wikimedia Commons／選配 Street View，公共領域/CC，**發布前須人工確認授權**，見 real-manifest）②氛圍空景（Pexels／Openverse CC）。CC-BY/BY-SA 發布時須於說明欄署名並標出處。\n\n` +
  `## 一、真實案件素材（第一層；發布前人工覆核）\n` +
  (realCredits.length ? realCredits.map(c => `- [${c.seg}.${c.k}] ${c.title} — ${c.creator} — ${c.license} — ${c.source}`).join('\n') : '（本次未取得，皆用氛圍空景）') +
  `\n\n## 二、氛圍空景（Pexels／Openverse CC）\n` +
  (atmos.length ? atmos.map(c => `- [${c.seg}.${c.k}] ${c.title} — ${c.creator} — ${c.license} — ${c.source}`).join('\n') : '（本次皆為灰底備援或快取）') +
  `\n\n## 三、BGM\n` + (hasBgm && bgmInfo ? `- ${bgmInfo.title} — ${bgmInfo.license} — ${bgmInfo.source}` : '（無）') + '\n', 'utf8');

// 真實素材人工覆核清單（對齊 brand/legal-redlines.md：真實素材最終須人工確認/授權後才可發布）
writeFileSync(join(OUTDIR, `${SLUG}-demo-real-manifest.md`),
  `# ⚠️ 真實案件素材 — 發布前人工覆核清單\n\n` +
  `> 本片初剪**已自動取用**下列「第一層真實案件素材」（公共領域/CC，含真實案發地點照）。\n` +
  `> 依 \`brand/legal-redlines.md\` §5 與 \`assets/snowtown-murders/real-footage-sources.md\`：真實素材**最終一律須人工確認授權後才可發布**。\n` +
  `> CC BY/BY-SA 類須於影片說明欄**署名＋標出處＋連結授權**；BY-SA 另注意「相同方式分享」。\n\n` +
  `| 段.槽 | 主題 | 來源/檔案 | 作者 | 授權 | 授權連結 | 出處 |\n|---|---|---|---|---|---|---|\n` +
  (realCredits.length ? realCredits.map(c => `| ${c.seg}.${c.k} | ${c.subject || ''} | ${c.title} | ${c.creator} | ${c.license} | ${c.licenseUrl || ''} | ${c.source} |`).join('\n') : '| — | — | 本次未取得真實素材 | — | — | — | — |') +
  `\n\n## 覆核待辦\n- [ ] 逐筆確認上列授權狀態仍有效，且涵蓋「商用＋YouTube 發布＋衍生」。\n- [ ] CC BY/BY-SA：說明欄完成署名（作者＋檔名＋授權＋連結）。\n- [ ] Street View（若有）：另行確認 Google Maps/Geo 準則是否允許本片用途。\n- [ ] 確認畫面中無可辨識真實人臉（依 legal-redlines §4）。\n`, 'utf8');

console.log(`\n素材圖：${imgCount} 張（真實案件 ${realCredits.length}／氛圍 CC ${atmos.length}）；BGM：${hasBgm ? '有' : '無'}`);

// ---- 4. 靜態片段（無運鏡＝無抖動）+ 交叉溶接（xfade）讓切換平順 ----
const XF = 0.8; // 交叉溶接秒數
writeFileSync(join(HEADS, 'illust.txt'), ILLUST_LABEL, 'utf8'); // 示意圖烙印文字
const clipMeta = []; let clipIdx = 0;
const segSlots = {};  // 每段實際採用的多素材（含填充槽），clip 迴圈後覆寫進 manifest＝反映真實素材包
for (let s = 0; s < segs.length; s++) {
  const segDur = meta[s].d; const imgs = segImages[s];
  const isChart = imgs[0] && (imgs[0].chart || imgs[0].stat || imgs[0].timeline);
  const isSynthetic = imgs[0] && (imgs[0].intro || imgs[0].ending);
  const isMap = imgs[0] && imgs[0].map;
  const fixedOne = segs[s].kind === 'host' || isChart || isSynthetic;
  // 換圖節奏：以 MAXSHOT 推估槽數，但不超過句數（避免在句子中間閃圖），也不少於既有素材數。
  const sentCount = (fixedOne || isMap) ? 1 : Math.max(1, subChunks(segs[s].narration || '', SUB_WRAP * 2).length);
  // 地圖段：地圖只占前 MAP_MAX 秒，其餘槽改放素材——避免長旁白段整段卡在地圖上（過去 seg2 旁白很長＝地圖停 20s+）。
  const MAP_MAX = Number(process.env.PILOT_MAPMAX || '8');
  let slotDurs;
  if (fixedOne) slotDurs = [segDur];
  else if (isMap) {
    const mapDur = Math.min(segDur, MAP_MAX);
    const rest = segDur - mapDur;
    const extra = rest > 1.5 ? Math.max(1, Math.ceil(rest / MAXSHOT)) : 0;
    slotDurs = [mapDur, ...Array.from({ length: extra }, () => rest / extra)];
  } else {
    const slots0 = Math.max(imgs.length, Math.min(Math.ceil(segDur / MAXSHOT), sentCount));
    slotDurs = Array.from({ length: slots0 }, () => segDur / slots0);
  }
  const slots = slotDurs.length;
  for (let j = 0; j < slots; j++) {
    // 前幾槽用本段既有素材；多出來的填充槽改抽 real-library 沒用滿（≤2 次）的不同素材（影片優先＝更動態），
    // 全部用滿就退 AI 示意——絕不讓同一張重複超過兩次、也不在整段久放同一張。
    let item;
    // 填充槽（j>=既有素材數）也吃手動覆寫 manual/sN_j.*＝每個槽都可抽換；無覆寫才走自動填充
    const manFill = (segs[s].kind !== 'host' && j >= imgs.length) ? manualFor(segs[s].narrIndex ?? s, j) : null;
    if (manFill) { item = { path: manFill.path, video: manFill.video, illustrative: !manFill.video && !manFill.real }; }
    else if (segs[s].kind !== 'host' && j >= imgs.length) {
      const sidM = segs[s].narrIndex ?? s;
      const cand = pickFill(sidM);   // ★命中本段詞的庫素材排前＋每段游標輪替＝貼題優先且有變化
      if (cand) { markUse(cand.path); item = cand; }
      else {
        // ★填充優先序（使用者定調 2026-06-03）：real-library(上方) → Pexels場景影片 → Pexels場景圖 → AI示意 → 灰底(永不觸及)
        const sid = segs[s].narrIndex ?? s;
        const pxv = join(IMG, `s${sid}_fill${j}.px.mp4`), pxi = join(IMG, `s${sid}_fill${j}.px.jpg`);
        const sceneA = SCENE_FILL[(s * 3 + j) % SCENE_FILL.length], sceneB = SCENE_FILL[(s * 3 + j + 7) % SCENE_FILL.length];
        if (!REFETCH && existsSync(pxv) && statSync(pxv).size > 50000) item = { path: pxv, video: true };
        else if (!REFETCH && existsSync(pxi) && statSync(pxi).size > 8000) item = { path: pxi, video: false };
        else {
          const pv = await pexelsVideo(sceneA, pxv);
          if (pv) { credits.push({ seg: sid, k: 'fill' + j, ...pv, query: sceneA }); item = { path: pxv, video: true }; }
          else { const pi = await pexelsImage(sceneB, pxi); if (pi) { credits.push({ seg: sid, k: 'fill' + j, ...pi, query: sceneB }); item = { path: pxi, video: false }; } }
        }
        if (!item) {
          // Pexels 取不到才退 AI 示意；先重用未用滿的既生成填充圖（pollinations 限流時加速）。
          let aiPath = aiFillPool.find(p => !overUsed(p));
          if (!aiPath) {
            const aiOut = join(IMG, `s${sid}_fill${j}.ai.jpg`);
            const ai = (!REFETCH && existsSync(aiOut) && statSync(aiOut).size > 8000) ? { backend: 'cache' } : await aiIllustrate(segs[s].imagePrompt || segs[s].heading || 'dark atmospheric scene, cinematic', aiOut, s * 131 + j * 17);
            if (ai) { aiPath = aiOut; aiFillPool.push(aiOut); credits.push({ seg: sid, k: 'fill' + j, title: 'AI 示意圖', creator: ai.backend, license: 'AI 生成（示意圖，非真實畫面）', source: '', tier: 'ai' }); }
          }
          if (aiPath) { markUse(aiPath); item = { path: aiPath, video: false, illustrative: true }; }
          else { // 所有來源皆失敗（極罕見）：退漸層底圖
            const g = join(IMG, `s${sid}_fill${j}.jpg`);
            try { if (REFETCH || !existsSync(g) || statSync(g).size < 2000) gradientFallback(g, segs[s].heading || ''); } catch (e) { console.log(`  s${sid} fill${j} 漸層退檔失敗（交 clip 迴圈補）：${String(e.message || e).split('\n')[0]}`); }
            item = { path: g, video: false, illustrative: true };
          }
        }
      }
    }
    else item = imgs[j % imgs.length];
    // 記錄本段第 j 槽實際採用的素材（含填充槽），供渲染後覆寫 manifest 的多素材清單
    (segSlots[s] ||= []).push({ path: (item && item.path) || null, video: !!(item && item.video), illustrative: !!(item && item.illustrative), chart: !!(item && item.chart), stat: !!(item && item.stat), timeline: !!(item && item.timeline), map: !!(item && item.map), intro: !!(item && item.intro), ending: !!(item && item.ending), host: !!(item && item.host), k: j, dur: Math.round(slotDurs[j] * 10) / 10 });
    const cd = slotDurs[j] + XF;
    const clip = join(CLIPS, `c${String(clipIdx).padStart(3, '0')}.mp4`);
    try {
    if (item && item.chart) {
      // 動態人物關係圖：整段渲成一段 org-chart（節點隨旁白逐一浮現），直接當本 clip
      renderChartClip({ outPath: clip, durationSec: cd, relations: RELATIONS, buildDir: BUILD, fps: FPS });
      clipMeta.push({ file: clip, dur: cd }); clipIdx++; continue;
    }
    if (item && item.stat) {
      // 動態統計長條圖：整段渲成一段 bar chart（長條隨旁白逐一浮現），直接當本 clip
      renderStatsClip({ outPath: clip, durationSec: cd, stats: STATS, buildDir: BUILD, fps: FPS });
      clipMeta.push({ file: clip, dur: cd }); clipIdx++; continue;
    }
    if (item && item.timeline) {
      // 動態橫向時間軸：整段渲成一段 timeline（事件由左至右逐一浮現），直接當本 clip
      renderTimelineClip({ outPath: clip, durationSec: cd, timeline: TIMELINE, buildDir: BUILD, fps: FPS });
      clipMeta.push({ file: clip, dur: cd }); clipIdx++; continue;
    }
    if (item && item.intro) { buildTypewriterClip(clip, segs[s].dateLines, cd); clipMeta.push({ file: clip, dur: cd }); clipIdx++; continue; }
    if (item && item.ending) { buildEndingClip(clip, segs[s].ending, segs[s]._phases, cd); clipMeta.push({ file: clip, dur: cd }); clipIdx++; continue; }
    if (item && item.map && j === 0) {
      const ok = await mapZoomClip(clip, item.place, cd);
      if (!ok) sh('ffmpeg', ['-y', '-f', 'lavfi', '-t', cd.toFixed(3), '-i', `gradients=s=1920x1080:c0=0x16202c:c1=0x080b10`, '-vf', 'format=yuv420p', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clip], { cwd: BUILD });
      clipMeta.push({ file: clip, dur: cd }); clipIdx++; continue;
    }
    if (item && item.host) {
      // 解說員片：★使用者定調（2026-06-02）＝直接用原始素材「循環到該段秒數切掉」即可。
      // 不去頭尾、不壓縮秒數、不倒放、不溶接——素材本身就是自然說話，loop 填滿 cd 秒後硬切。
      const HOST_VF = `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p`;
      if (item.video) {
        sh('ffmpeg', ['-y', '-stream_loop', '-1', '-t', cd.toFixed(3), '-i', item.path,
          '-an', '-vf', HOST_VF, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clip], { cwd: BUILD });
        console.log(`解說員：原始素材循環到 ${cd.toFixed(1)}s 切掉（不壓縮、不去頭尾、不溶接）`);
      } else {
        // ★定格肖像＋極緩慢 Ken Burns（預設）：無循環接點、無 vidstab＝零抖動；3840 超採樣消 zoompan 次像素抖；
        // 緩推 1.0→1.05（整段）＝畫面持續有生命感但不晃。這是徹底解決「解說員抖動」的做法。
        const hframes = Math.max(1, Math.round(cd * FPS));
        sh('ffmpeg', ['-y', '-loop', '1', '-i', item.path,
          '-an', '-vf', `scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='min(1.0+0.00017*on,1.05)':d=${hframes}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=${FPS},format=yuv420p`,
          '-frames:v', String(hframes), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clip], { cwd: BUILD });
      }
    } else if (item && item.video) {
      // 真實影片：循環填滿 cd 秒、靜音、縮放裁切、壓暗降飽和
      sh('ffmpeg', ['-y', '-stream_loop', '-1', '-t', cd.toFixed(3), '-i', item.path,
        '-an', '-vf', `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,eq=brightness=-0.05:saturation=0.82,format=yuv420p`, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clip]);
    } else if (item && item.illustrative) {
      // Plan A 示意圖／圖卡：Ken Burns 推拉鏡（3840 超取樣消抖）+「示意圖」烙印（法律：非真實畫面）
      const frames = Math.max(1, Math.round(cd * FPS));
      const mode = clipIdx % 3; // 0 推近 1 拉遠 2 平移
      const z = mode === 1 ? `max(1.2-0.0009*on,1.0)` : mode === 2 ? `1.1` : `min(1.0+0.0009*on,1.2)`;
      const xExpr = mode === 2 ? `(iw-iw/zoom)*on/${frames}` : `iw/2-(iw/zoom/2)`;
      // -frames:v（非 -t）限長：zoompan 在 -loop 1 下每張輸入會展開 d 幀，用輸出幀數限制才不會爆長
      sh('ffmpeg', ['-y', '-loop', '1', '-i', item.path,
        '-vf', `scale=3840:2160:force_original_aspect_ratio=increase,crop=3840:2160,zoompan=z='${z}':d=${frames}:x='${xExpr}':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=${FPS},drawtext=fontfile=fonts/msjh.ttc:textfile=heads/illust.txt:fontcolor=0xddddddcc:fontsize=34:x=w-tw-36:y=h-th-30:box=1:boxcolor=0x00000066:boxborderw=10,format=yuv420p`,
        '-frames:v', String(frames), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clip], { cwd: BUILD });
    } else {
      sh('ffmpeg', ['-y', '-loop', '1', '-t', cd.toFixed(3), '-i', (item && item.path) || item,
        '-vf', `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p`,
        '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clip]);
    }
    } catch (clipErr) {
      // 單格失敗（如庫檔在渲染中途被改/消失）→ 退灰底，保時間軸完整，不讓整片崩潰
      console.log(`  clip ${clipIdx} 失敗→灰底（${String(clipErr.message || clipErr).split('\n')[0]}）`);
      try { sh('ffmpeg', ['-y', '-f', 'lavfi', '-t', cd.toFixed(3), '-i', `gradients=s=1920x1080:c0=0x16202c:c1=0x080b10`, '-vf', `drawtext=fontfile=fonts/msjh.ttc:textfile=heads/illust.txt:fontcolor=0x55657a:fontsize=34:x=(w-tw)/2:y=(h-th)/2,format=yuv420p`, '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clip], { cwd: BUILD }); } catch { }
    }
    clipMeta.push({ file: clip, dur: cd });
    clipIdx++;
  }
}
console.log(`建立 ${clipIdx} 個靜態片段，交叉溶接中...`);
// ---- 用 clip 迴圈實際採用的「每段多素材」覆寫 manifest 的 slots（含填充槽，反映真實素材包與時長）----
try {
  const mp = join(CASE, 'production', 'segment-manifest.json');
  if (existsSync(mp)) {
    const man = JSON.parse(readFileSync(mp, 'utf8'));
    const r2r = (p) => { if (!p) return null; const r = String(p).replace(/\\/g, '/'); const base = ROOT.replace(/\\/g, '/').replace(/\/+$/, '') + '/'; return r.startsWith(base) ? r.slice(base.length) : r; };
    const cT = new Set(['host', 'intro', 'ending', 'chart', 'stat', 'timeline', 'map']);
    const tyOf = (it) => it.host ? 'host' : it.intro ? 'intro' : it.ending ? 'ending' : it.chart ? 'chart' : it.stat ? 'stat' : it.timeline ? 'timeline' : it.map ? 'map' : it.video ? 'video' : 'image';
    for (const sg of man.segments || []) {
      const arr = segSlots[sg.idx]; if (!arr || !arr.length) continue;
      const n = sg.narrIndex, hasN = typeof n === 'number';
      sg.slots = arr.map((it) => {
        const k = it.k;
        const cr = hasN ? credits.find(x => x.seg === n && (x.k === k || x.k === 'fill' + k)) : null;
        const ty = tyOf(it);
        const isReal = cr ? cr.tier === 'real' : (!it.illustrative && !cT.has(ty) && !!it.path);
        return {
          k, type: ty, dur: it.dur,
          tier: cr?.tier || (it.illustrative ? 'ai' : cT.has(ty) ? 'composed' : it.path ? 'real' : 'unknown'),
          provider: cr?.provider || (cr ? '' : it.illustrative ? 'AI/灰底' : cT.has(ty) ? '合成' : it.path ? '（自動填充，來源待確認）' : ''),
          title: cr?.title || '', creator: cr?.creator || '', license: cr?.license || '', source: cr?.source || '', query: cr?.query || '',
          prompt: (hasN ? (promptsBySeg[n] || []) : [])[k] || segs[sg.idx]?.imagePrompt || '',
          isManual: hasN && !!manualFor(n, k),
          file: r2r(it.path),
        };
      });
    }
    writeFileSync(mp, JSON.stringify(man, null, 2), 'utf8');
    console.log('segment-manifest：已用實際 clip 素材覆寫各段 slots（含填充槽）');
  }
} catch (e) { console.log('manifest slots 覆寫略過：' + (e.message || e)); }
const visuals = join(BUILD, 'visuals.mp4');
try {
  if (clipMeta.length < 2) throw new Error('片段太少');
  const inputs = clipMeta.flatMap(c => ['-i', c.file]);
  let fc = ''; let prev = '0:v'; let accLen = clipMeta[0].dur;
  for (let i = 1; i < clipMeta.length; i++) {
    const off = (accLen - XF).toFixed(3);
    const out = (i === clipMeta.length - 1) ? 'vout' : `x${i}`;
    fc += `[${prev}][${i}:v]xfade=transition=fade:duration=${XF}:offset=${off}[${out}];`;
    prev = out; accLen = accLen + clipMeta[i].dur - XF;
  }
  fc = fc.replace(/;$/, '');
  sh('ffmpeg', ['-y', ...inputs, '-filter_complex', fc, '-map', '[vout]', '-r', String(FPS), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', visuals], { cwd: BUILD, maxBuffer: 1 << 27 });
  console.log('xfade 溶接完成');
} catch (e) {
  // 硬切串接退路：**重編碼**（非 -c copy）並**跳過缺檔/壞檔**——避免漸層退檔 clip 的 SAR/timebase 不一致，
  // 或單格缺檔，導致 concat 在中途截斷（這是過去成片被截短的真兇）。重編碼統一參數＝保證全長。
  const present = clipMeta.filter(c => { try { return existsSync(c.file) && statSync(c.file).size > 1000; } catch { return false; } });
  console.log(`xfade 失敗，改用硬切串接（重編碼，${present.length}/${clipMeta.length} 個有效 clip）：` + (e.message || e));
  writeFileSync(join(BUILD, 'clips.txt'), present.map(c => `file '${c.file.replace(/\\/g, '/')}'`).join('\n') + '\n', 'utf8');
  sh('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', 'clips.txt', '-vf', `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=${FPS}`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', 'visuals.mp4'], { cwd: BUILD, maxBuffer: 1 << 27 });
}

// ---- 5. 時間軸：句子字幕（左上角段名與姓名字卡已依需求移除；底部旁白字幕保留）----
let t = 0; const subs = []; let endingRange = null;
meta.forEach((m, i) => {
  const start = t, end = t + m.d;
  if (segs[i].kind === 'ending') endingRange = { start, end };   // 片尾段時間：BGM 收尾轉強用
  // 字幕：長句切成 ≤2 行的短塊；只鋪在「講話時段」(扣掉段尾停頓)，停頓處留白＝呼吸
  const speak = Math.max(0.1, m.d - PAUSE);
  const chunks = subChunks(segs[i].narration || '', SUB_WRAP * 2); const tc = chunks.reduce((a, x) => a + x.length, 0) || 1;
  let st = start; for (const x of chunks) { const d = speak * (x.length / tc); subs.push({ start: st, end: Math.min(st + d, start + speak), text: wrapCJK(x, SUB_WRAP) }); st += d; }
  t = end;
});
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft JhengHei,${SUB_SIZE},&H00FFFFFF,&H000000FF,&H00101010,&H64000000,-1,0,0,0,100,100,0,0,1,4,2,2,160,160,96,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
` + subs.map(s => `Dialogue: 0,${assTime(s.start)},${assTime(s.end)},Default,,0,0,0,,${s.text.replace(/\n/g, ' ')}`).join('\n') + '\n';
writeFileSync(join(BUILD, 'sub.ass'), ass, 'utf8');

// ---- 6. 最終合成：畫面 + 字幕 + 暈影 + 男聲（依需求移除左上角段名與「Pilot 調查員」姓名字卡）----
const out = join(OUTDIR, `${SLUG}-demo.mp4`);
const fargs = ['-y', '-i', 'visuals.mp4', '-i', 'narration.wav'];
let fc2 = `[0:v]subtitles=sub.ass:fontsdir=fonts,vignette[v]`;
let amap = '[a]';
if (hasBgm) {
  fargs.push('-stream_loop', '-1', '-i', 'bgm.mp3');
  // 旁白 loudnorm 拉到廣播級響度；BGM 鋪底並淡入，片尾謝幕段（旁白已結束）轉強讓收尾音樂浮上來
  const bgmVolExpr = endingRange ? `volume='if(gte(t,${endingRange.start.toFixed(2)}),${BGM_END_VOL},${BGM_VOL})':eval=frame` : `volume=${BGM_VOL}`;
  fc2 += `;[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[nv];[2:a]${bgmVolExpr},afade=t=in:st=0:d=2[bg];[nv][bg]amix=inputs=2:duration=first:normalize=0[a]`;
} else {
  fc2 += `;[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]`;
}
fargs.push('-filter_complex', fc2, '-map', '[v]', '-map', amap, '-c:v', 'libx264', '-preset', 'medium', '-crf', String(CRF), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-r', String(FPS), '-shortest', out);
sh('ffmpeg', fargs, { cwd: BUILD, stdio: ['ignore', 'inherit', 'inherit'] });

console.log(`\n✅ 完成：${out}`);
console.log(`   ${Math.round(total)}s、${clipIdx} 個運鏡片段、${imgCount} 張素材圖、${subs.length} 句字幕、語速 atempo ${SPEED}`);

// 另存時間戳副本到 history/ 歸檔，保留每版供 A/B 對照；根目錄只留主檔 <slug>-demo.mp4（網頁播放器依 slug 對位，不可改主檔名）
try {
  const histDir = join(OUTDIR, 'history');
  if (!existsSync(histDir)) mkdirSync(histDir, { recursive: true });
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const archived = join(histDir, `${SLUG}-demo-${stamp}.mp4`);
  copyFileSync(out, archived);
  console.log(`   時間戳副本（歸檔）：${archived}`);
} catch (e) { console.log('   時間戳副本失敗：' + (e.message || e)); }
