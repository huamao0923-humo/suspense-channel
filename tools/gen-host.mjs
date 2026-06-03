// tools/gen-host.mjs
// 產生調查員 Pilot 的「主參考圖」brand/assets/host-reference.png（定格出鏡用）。
// 依 brand/host-character.md §3 提示詞，用免 key 的 Pollinations（Flux）生圖。
// 一致性鐵則：產一張就鎖定，全片重用；要換造型才重跑。
// 用法：node tools/gen-host.mjs [--seed 77] [--force]
import { writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(TOOLS);
const OUT = join(ROOT, 'brand', 'assets', 'host-reference.png');
mkdirSync(dirname(OUT), { recursive: true });

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SEED = arg('--seed', '77');
const FORCE = process.argv.includes('--force');

if (existsSync(OUT) && statSync(OUT).size > 20000 && !FORCE) {
  console.log(`已存在 ${OUT}（${Math.round(statSync(OUT).size / 1024)}KB）。要重產請加 --force。`);
  process.exit(0);
}

// 對齊 host-character.md §3 主參考圖提示詞（冷色調紀錄片、chiaroscuro、昏暗書房）
const PROMPT =
  'cinematic documentary still, dark moody lighting, cold desaturated palette, film grain, ' +
  'shallow depth of field, realistic, investigative tone, 16:9. A fictional male investigator ' +
  'in his mid-40s, calm analytical expression, seated at a dark wooden desk in a dim noir study ' +
  'at night. Cold blue rim-light on one side of the face, the other half in deep shadow (chiaroscuro). ' +
  "A warm green banker's lamp glows on the desk; an antique unrolled map lies under his hands; a " +
  'vintage typewriter and a globe sit softly out of focus behind. Dark navy suit. He looks slightly ' +
  'toward camera, composed. Centered medium shot, head-and-shoulders to mid-torso. no text, no watermark';

const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(PROMPT)}?width=1280&height=720&seed=${SEED}&nologo=true&model=flux`;
console.log(`生成調查員主參考圖（seed=${SEED}）...`);
try {
  const r = await fetch(url, { headers: { 'User-Agent': 'PilotChannel/1.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 20000) throw new Error('回傳影像過小（' + buf.length + ' bytes）');
  writeFileSync(OUT, buf);
  console.log(`✅ ${OUT}（${Math.round(buf.length / 1024)}KB）`);
  console.log(`   請把 seed=${SEED} 與工具(Pollinations/Flux)回填 brand/host-character.md §3 的 --seed <…>，此後鎖定不再重產。`);
} catch (e) {
  console.error('生圖失敗：' + (e.message || e));
  console.error('（make-demo.mjs 會自動退回灰底「Pilot · 調查員」字卡，不影響渲染）');
  process.exit(1);
}
