// tools/build-gsk-library.mjs
// 一次性建置「黃金州殺手案」真實素材庫：批次抓 Wikimedia Commons 分類（圖/影片/卷宗），
// 用機器可讀授權回填 MANIFEST.csv。只收免費/開源（PD/CC0/CC-BY/公開卷宗）；音檔（受害者訪談）不入庫。
// 對齊 brand/legal-redlines.md：下載僅標 clearance=🟡，發布前仍須人工確認授權。
// 執行：node tools/build-gsk-library.mjs
import { commonsCategory, downloadTo, csvCell as csv, fileSlug as slug, extOf, categoryOf as catOf } from './fetch-real.mjs';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'assets/golden-state-killer/real-library';
const DIRS = { image: join(ROOT, 'images'), video: join(ROOT, 'video'), doc: join(ROOT, 'docs') };
for (const d of Object.values(DIRS)) mkdirSync(d, { recursive: true });

const DATE = '20260531';
const SENSITIVE = /survivor|victim|recall|encounter|maggiore/i;

const rows = [['filename', 'type', 'category', 'description', 'source', 'source_url', 'license_type', 'attribution', 'commercial_ok', 'deidentify', 'clearance', 'notes']];

console.log('Fetching Commons category: Joseph James DeAngelo …');
const members = await commonsCategory('Joseph James DeAngelo', { limit: 500 });
console.log(`category members: ${members.length}`);

let ok = 0, skip = 0, fail = 0;
for (const m of members) {
  if (!m.url || !m.mime) { skip++; continue; }
  if (m.mime.startsWith('audio/')) { skip++; console.log('skip(audio/敏感):', m.title); continue; }
  if (/svg/.test(m.mime)) { skip++; continue; }
  let type, dir;
  if (m.mime.startsWith('image/')) { type = 'image'; dir = DIRS.image; }
  else if (m.mime.startsWith('video/')) { type = 'video'; dir = DIRS.video; }
  else if (m.mime.includes('pdf')) { type = 'doc'; dir = DIRS.doc; }
  else { skip++; continue; }

  const fname = `${DATE}_real-${slug(m.title)}.${extOf(m.title, m.mime)}`;
  const out = join(dir, fname);
  const got = existsSync(out) || await downloadTo(m.url, out, { timeoutMs: type === 'video' ? 180000 : 60000 });
  if (!got) { fail++; console.log('FAIL:', m.title); continue; }
  ok++; console.log(`ok(${type}):`, fname);

  const isPD = /cc0|public domain|pdmark|no restrictions|no known/i.test(m.license);
  const attribution = isPD ? 'N' : (m.creator && m.creator !== 'unknown' ? m.creator : 'see file page');
  rows.push([
    fname, type, catOf(m.title, type), m.title, 'Wikimedia Commons', m.descriptionurl,
    m.license, attribution, 'Y', SENSITIVE.test(m.title) ? 'Y' : 'N', '🟡待人工確認',
    SENSITIVE.test(m.title) ? '敏感:含受害者/倖存者脈絡,使用須去識別' : '',
  ]);
}

// FBI Image Repository 直連（可能 403，容錯）：素材若 Commons 已涵蓋可略
const fbiPoster = `${DATE}_real-fbi-ear-poster.png`;
const fbiOk = await downloadTo('https://www.fbi.gov/image-repository/ear_poster_grab2.png', join(DIRS.image, fbiPoster), { timeoutMs: 60000 });
if (fbiOk) {
  rows.push([fbiPoster, 'image', 'fbi-file', 'FBI East Area Rapist 通緝海報', 'FBI Image Repository', 'https://www.fbi.gov/image-repository/ear_poster_grab2.png/view', 'Public Domain (Federal/FBI)', 'N', 'Y', 'N', '🟡待人工確認', '聯邦PD']);
  console.log('ok(image): ' + fbiPoster);
} else {
  rows.push(['(待下載)', 'image', 'fbi-file', 'FBI East Area Rapist 通緝海報', 'FBI Image Repository', 'https://www.fbi.gov/image-repository/ear_poster_grab2.png/view', 'Public Domain (Federal/FBI)', 'N', 'Y', 'N', '⬜待下載', 'FBI直連可能403,改用瀏覽器或Commons同源檔']);
  console.log('FBI poster 直連失敗(可能403)，留待手動');
}

// NIST 合成素描：頁面為 HTML，需手動取原圖，先留規劃列
rows.push(['(待下載)', 'image', 'sketch', 'NIST 合成素描', 'NIST', 'https://www.nist.gov/image/goldenstatekillercompositepng', 'Public Domain (Federal/NIST)', 'N', 'Y', 'N', '⬜待下載', 'NIST頁面需手動取原圖URL']);

writeFileSync(join(ROOT, 'MANIFEST.csv'), rows.map((r) => r.map(csv).join(',')).join('\n') + '\n');
console.log(`\nDONE. downloaded=${ok} skipped=${skip} failed=${fail}. MANIFEST rows=${rows.length - 1}`);
