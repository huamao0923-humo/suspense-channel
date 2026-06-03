// tools/azure-tts.mjs
// Azure Speech REST TTS（零 npm 依賴）。用磁性中文男聲取代本機 WinRT Zhiwei。
// 需環境變數：
//   AZURE_SPEECH_KEY     你的 Speech 資源金鑰
//   AZURE_SPEECH_REGION  資源區域，如 eastasia / southeastasia / japaneast
// 預設 zh-CN-YunjianNeural + documentary-narration（懸案磁性旁白，最對味，但為大陸口音）。
// 改繁中台灣口音：set AZURE_TTS_VOICE=zh-TW-YunJheNeural、set AZURE_TTS_STYLE=（留空，YunJhe 無風格）。
// 端點/認證/格式依官方 REST 文件（cognitiveservices/v1，Ocp-Apim-Subscription-Key 可直接用）。
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function buildSsml(text, {
  voice = process.env.AZURE_TTS_VOICE || 'zh-CN-YunjianNeural',
  style = process.env.AZURE_TTS_STYLE ?? 'documentary-narration', // 設為 '' 可停用風格
  rate = process.env.AZURE_TTS_RATE || '-6%',
  pitch = process.env.AZURE_TTS_PITCH || '-3%',
} = {}) {
  const lang = voice.startsWith('zh-TW') ? 'zh-TW' : voice.startsWith('zh-HK') ? 'zh-HK' : 'zh-CN';
  const inner = `<prosody rate='${rate}' pitch='${pitch}'>${xml(text)}</prosody>`;
  const body = style ? `<mstts:express-as style='${style}'>${inner}</mstts:express-as>` : inner;
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' ` +
    `xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='${lang}'>` +
    `<voice name='${voice}'>${body}</voice></speak>`;
}

export async function synthToFile(text, outFile, opts = {}) {
  const KEY = process.env.AZURE_SPEECH_KEY || '';
  const REGION = process.env.AZURE_SPEECH_REGION || '';
  if (!KEY || !REGION) throw new Error('NO_AZURE_KEY'); // 讓呼叫端決定是否 fallback
  const fmt = process.env.AZURE_TTS_FORMAT || 'riff-24khz-16bit-mono-pcm'; // WAV，與既有 seg.wav 相容
  const ssml = buildSsml(text, opts);
  const r = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': fmt,
      'User-Agent': 'PilotChannel',
    },
    body: ssml,
  });
  if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error(`Azure TTS ${r.status}: ${t.slice(0, 200)}`); }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < 1000) throw new Error('Azure TTS empty audio');
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, buf);
  return buf.length;
}

// CLI 測試：node azure-tts.mjs "文字" out.wav [voice] [style]
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('azure-tts.mjs');
if (isMain) {
  const text = process.argv[2] || '晚安，這裡是 Pilot 調查員。今晚，我們走進一樁懸案。';
  const out = process.argv[3] || 'azure-test.wav';
  const opts = {};
  if (process.argv[4]) opts.voice = process.argv[4];
  if (process.argv[5] !== undefined) opts.style = process.argv[5];
  const n = await synthToFile(text, out, opts);
  console.log(`OK ${out} ${n} bytes`);
}
