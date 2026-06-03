// 無依賴 .env 載入器：把專案根目錄 .env 的 KEY=VALUE 灌進 process.env（不覆蓋已存在的真實環境變數）。
// 解決「Bash/某些 shell 不繼承 User 環境變數，導致 make-demo 拿不到 PEXELS_KEY / YOUTUBE_API_KEY」的問題。
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ENV_FILE = join(dirname(dirname(fileURLToPath(import.meta.url))), '.env');
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq < 1) continue;
    const k = s.slice(0, eq).trim();
    let v = s.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env) || !process.env[k]) process.env[k] = v;   // 真實環境變數優先
  }
}
