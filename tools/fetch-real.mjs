// tools/fetch-real.mjs
// 第一層「真實案件素材」取材（零 npm 依賴）。
//   ① Wikimedia Commons：免 key，公共領域/CC，含真實案發地點照（如 Snowtown 那間真正的藏屍銀行）。
//   ② Google Street View Static（選配）：需 GOOGLE_MAPS_KEY；先查 metadata 再取圖，避免空圖計費。
// 一律標記 needsHumanLicense=true：依 brand/legal-redlines.md，真實素材最終須人工確認授權才可發布。
// 只查「地點/建物/標誌」類主題，不含人臉，對齊 legal-redlines §4 去識別。
import { writeFileSync, existsSync, readFileSync } from 'node:fs';

const UA = { 'User-Agent': 'PilotChannel/1.0 (faceless true-crime demo; contact huamao0923@gmail.com)' };
const stripHtml = (v) => String(v || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const firstWord = (s) => { const m = String(s).match(/[A-Za-z]{3,}/); return m ? m[0].toLowerCase() : ''; };

// Wikimedia Commons：依主題搜尋檔案，取第一張可下載的 CC/公共領域圖
export async function commonsImage(subjects, out, { width = 1920, minBytes = 30000 } = {}) {
  for (const subj of (Array.isArray(subjects) ? subjects : [subjects])) {
    try {
      const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
        `&generator=search&gsrsearch=${encodeURIComponent(subj)}&gsrnamespace=6&gsrlimit=8` +
        `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${width}`;
      const r = await fetch(u, { headers: UA });
      if (!r.ok) continue;
      const j = await r.json();
      let pages = Object.values(j?.query?.pages || {});
      const kw = firstWord(subj);
      // 先依搜尋相關性排序，再把「標題含主題關鍵字」者提前（降低抓到不相關檔案）
      pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
      pages.sort((a, b) => ((b.title || '').toLowerCase().includes(kw) ? 1 : 0) - ((a.title || '').toLowerCase().includes(kw) ? 1 : 0));
      for (const p of pages) {
        const ii = p.imageinfo?.[0]; if (!ii) continue;
        const link = ii.thumburl || ii.url; if (!link) continue;
        if (/\.svg(\?|$)/i.test(link)) continue; // 跳過向量圖
        try {
          const ir = await fetch(link, { headers: UA }); if (!ir.ok) continue;
          const buf = Buffer.from(await ir.arrayBuffer()); if (buf.length < minBytes) continue;
          writeFileSync(out, buf);
          const em = ii.extmetadata || {};
          return {
            provider: 'Wikimedia Commons', tier: 'real', needsHumanLicense: true,
            title: (p.title || subj).replace(/^File:/, ''),
            creator: stripHtml(em.Artist?.value) || 'unknown',
            license: stripHtml(em.LicenseShortName?.value) || 'see file page',
            licenseUrl: em.LicenseUrl?.value || '',
            source: ii.descriptionurl || link,
            subject: subj,
          };
        } catch { /* 下一張 */ }
      }
    } catch { /* 下一個主題 */ }
  }
  return null;
}

// Google Street View Static（選配）：先查 metadata 確認有影像，再取 640x640（免簽章上限）
export async function streetViewImage(location, out, { size = '640x640', minBytes = 15000 } = {}) {
  const KEY = process.env.GOOGLE_MAPS_KEY || '';
  if (!KEY) return null;
  const loc = Array.isArray(location) ? location[0] : location;
  try {
    const meta = await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodeURIComponent(loc)}&key=${KEY}`, { headers: UA });
    const mj = await meta.json().catch(() => ({}));
    if (!mj || mj.status !== 'OK') return null; // 無街景影像/額度問題 → 不取（不計費取空圖）
    const ir = await fetch(`https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${encodeURIComponent(loc)}&key=${KEY}`, { headers: UA });
    if (!ir.ok) return null;
    const buf = Buffer.from(await ir.arrayBuffer()); if (buf.length < minBytes) return null;
    writeFileSync(out, buf);
    return {
      provider: 'Google Street View', tier: 'real', needsHumanLicense: true,
      title: `Street View @ ${loc}`, creator: 'Google / contributors',
      license: 'Google Maps/Street View Terms（商用+影片須另行確認授權）',
      licenseUrl: 'https://www.google.com/permissions/geoguidelines/',
      source: `https://www.google.com/maps?q=${encodeURIComponent(loc)}&layer=c`,
      subject: loc, dateApprox: mj.date || '',
    };
  } catch { return null; }
}

// 統一入口：街景（選配，需 key + flag）優先案發確切地點，否則 Commons 真實照
export async function fetchRealImage(subjects, out, { streetView = false } = {}) {
  if (streetView) {
    const sv = await streetViewImage(subjects, out);
    if (sv) return sv;
  }
  return await commonsImage(subjects, out);
}

// Wikimedia Commons：列舉整個分類的全部檔案成員，回傳每檔 metadata（含實際授權，不下載）。
// 供「真實素材庫」批次建檔：用機器可讀的 extmetadata 直接捕捉每檔授權，免逐張人工查。
export async function commonsCategory(category, { limit = 500 } = {}) {
  const cat = String(category).startsWith('Category:') ? category : `Category:${category}`;
  try {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
      `&generator=categorymembers&gcmtitle=${encodeURIComponent(cat)}&gcmtype=file&gcmlimit=${limit}` +
      `&prop=imageinfo&iiprop=url|extmetadata|mime|size`;
    const r = await fetch(u, { headers: UA });
    if (!r.ok) return [];
    const j = await r.json();
    return Object.values(j?.query?.pages || {}).map((p) => {
      const ii = p.imageinfo?.[0] || {};
      const em = ii.extmetadata || {};
      return {
        title: (p.title || '').replace(/^File:/, ''),
        url: ii.url || '',
        mime: ii.mime || '',
        size: ii.size || 0,
        license: stripHtml(em.LicenseShortName?.value) || 'see file page',
        licenseUrl: em.LicenseUrl?.value || '',
        creator: stripHtml(em.Artist?.value) || 'unknown',
        descriptionurl: ii.descriptionurl || '',
      };
    });
  } catch { return []; }
}

// 下載任一 URL 到檔案（容錯：逾時/失敗回 false，不中斷批次）。
export async function downloadTo(url, out, { minBytes = 1000, timeoutMs = 60000 } = {}) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < minBytes) return false;
    writeFileSync(out, buf);
    return true;
  } catch { return false; }
}

// Wikimedia Commons：依關鍵詞搜尋檔案，回傳候選清單（含機器可讀授權，不下載）。供 picker 列候選挑選。
export async function searchCommonsCandidates(query, { limit = 12 } = {}) {
  try {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json` +
      `&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=${limit}` +
      `&prop=imageinfo&iiprop=url|extmetadata|mime|size`;
    const r = await fetch(u, { headers: UA });
    if (!r.ok) return [];
    const j = await r.json();
    const pages = Object.values(j?.query?.pages || {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    return pages.map((p) => {
      const ii = p.imageinfo?.[0] || {};
      const em = ii.extmetadata || {};
      return {
        title: (p.title || '').replace(/^File:/, ''),
        url: ii.url || '', mime: ii.mime || '', size: ii.size || 0,
        license: stripHtml(em.LicenseShortName?.value) || 'see file page',
        licenseUrl: em.LicenseUrl?.value || '',
        creator: stripHtml(em.Artist?.value) || 'unknown',
        descriptionurl: ii.descriptionurl || '',
      };
    }).filter((c) => c.url && c.mime);
  } catch { return []; }
}

// ── MANIFEST.csv 共用工具（picker 與 build-gsk-library 共用，避免重複）──────────
export const MANIFEST_HEADER = ['filename', 'type', 'category', 'description', 'source', 'source_url', 'license_type', 'attribution', 'commercial_ok', 'deidentify', 'clearance', 'notes'];
export const SENSITIVE_RE = /survivor|victim|recall|encounter/i;
export const csvCell = (v) => { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
export const fileSlug = (s) => s.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 48);
export const extOf = (title, mime) => {
  const m = String(title).match(/\.([A-Za-z0-9]+)$/); if (m) return m[1].toLowerCase();
  if (String(mime).includes('pdf')) return 'pdf';
  if (String(mime).startsWith('image/')) return mime.split('/')[1];
  if (String(mime).startsWith('video/')) return 'webm';
  return 'bin';
};
export const categoryOf = (title, type) => {
  if (type === 'doc') return 'court-doc';
  if (type === 'video') return 'video';
  const s = String(title).toLowerCase();
  if (/sketch|composite|artist rendering|mask/.test(s)) return 'sketch';
  if (/map|escape|punishment/.test(s)) return 'map';
  if (/mugshot/.test(s)) return 'mugshot';
  if (/evidence|shoelace|ransack|evidence room/.test(s)) return 'evidence';
  return 'image';
};
// 判定授權是否「免費可用」（PD/CC0/聯邦/CC-BY/CC-BY-SA）；排除 NC/ND。
export const isFreeLicense = (license) => {
  const s = String(license).toLowerCase();
  if (/\bnc\b|noncommercial|non-commercial|\bnd\b|noderiv/.test(s)) return false;
  return /cc0|public domain|pdmark|no restrictions|no known|cc[ -]?by(-sa)?|attribution/.test(s);
};
// 引號感知 CSV 單行解析（欄位可含逗號/跳脫雙引號）
export function parseCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  }
  out.push(cur); return out;
}
// 讀取既有 MANIFEST.csv（若有），依 source_url 去重後附加 rows，寫回。rows 為物件陣列（鍵＝MANIFEST_HEADER）。
export function appendManifest(manifestPath, rows) {
  const existingUrls = new Set();
  let lines = [];
  if (existsSync(manifestPath)) {
    lines = readFileSync(manifestPath, 'utf8').replace(/\n+$/, '').split('\n');
    const urlIdx = MANIFEST_HEADER.indexOf('source_url');
    for (const ln of lines.slice(1)) { const cols = parseCsvLine(ln); if (cols[urlIdx]) existingUrls.add(cols[urlIdx]); }
  }
  if (!lines.length) lines = [MANIFEST_HEADER.join(',')];
  let added = 0;
  for (const row of rows) {
    if (row.source_url && existingUrls.has(row.source_url)) continue;
    lines.push(MANIFEST_HEADER.map((h) => csvCell(row[h])).join(','));
    if (row.source_url) existingUrls.add(row.source_url);
    added++;
  }
  writeFileSync(manifestPath, lines.join('\n') + '\n');
  return added;
}

// CLI 測試：node fetch-real.mjs "Snowtown former bank" out.jpg
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('fetch-real.mjs');
if (isMain) {
  const subj = process.argv[2] || 'Snowtown former bank';
  const out = process.argv[3] || 'real-test.jpg';
  const r = await fetchRealImage(subj.split('|'), out, { streetView: process.env.PILOT_STREETVIEW === '1' });
  console.log(r ? `OK ${out}\n` + JSON.stringify(r, null, 2) : '無真實素材命中');
}
