// tools/edge-tts.mjs
// 原生 Edge（Bing）神經語音 TTS 客戶端 — 零第三方依賴。
// 用 node:tls 手寫 WebSocket 握手與封包，以便設定伺服器要求的 Origin/User-Agent 標頭，
// 並帶上微軟要求的 Sec-MS-GEC 權杖。與 edge-tts 套件走同一個免費端點，但不安裝任何 npm 套件。
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import tls from 'node:tls';

const HOST = 'speech.platform.bing.com';
const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const GEC_VERSION = '1-140.0.3485.14';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
const ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';

function genSecMsGec(offsetMs = 0) {
  const WIN_EPOCH = 11644473600n;
  let ticks = (BigInt(Math.floor((Date.now() + offsetMs) / 1000)) + WIN_EPOCH) * 10000000n;
  ticks -= ticks % 3000000000n;
  return createHash('sha256').update(ticks.toString() + TOKEN, 'ascii').digest('hex').toUpperCase();
}

function pathWithQuery(offsetMs = 0) {
  return `/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${TOKEN}` +
    `&Sec-MS-GEC=${genSecMsGec(offsetMs)}` +
    `&Sec-MS-GEC-Version=${GEC_VERSION}` +
    `&ConnectionId=${randomUUID().replace(/-/g, '')}`;
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildSsml(text, { voice = 'zh-CN-YunjianNeural', rate = '-10%', pitch = '-6Hz', volume = '+0%' } = {}) {
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
    `<voice name='${voice}'><prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>` +
    `${xmlEscape(text)}</prosody></voice></speak>`;
}

// 編碼一個 client → server 的 WS frame（必須遮罩）
function encodeFrame(opcode, payload) {
  const len = payload.length;
  const mask = randomBytes(4);
  let head;
  if (len < 126) { head = Buffer.alloc(2); head[1] = 0x80 | len; }
  else if (len < 65536) { head = Buffer.alloc(4); head[1] = 0x80 | 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[1] = 0x80 | 127; head.writeBigUInt64BE(BigInt(len), 2); }
  head[0] = 0x80 | opcode;
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i & 3];
  return Buffer.concat([head, mask, masked]);
}

// 從 accumulator 解出完整 frames，回傳 {frames, rest}
function parseFrames(buf) {
  const frames = [];
  let off = 0;
  while (off + 2 <= buf.length) {
    const b0 = buf[off], b1 = buf[off + 1];
    const fin = (b0 & 0x80) !== 0;
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let p = off + 2;
    if (len === 126) { if (p + 2 > buf.length) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (p + 8 > buf.length) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    let maskKey = null;
    if (masked) { if (p + 4 > buf.length) break; maskKey = buf.slice(p, p + 4); p += 4; }
    if (p + len > buf.length) break;
    let payload = buf.slice(p, p + len);
    if (masked) { const u = Buffer.from(payload); for (let i = 0; i < u.length; i++) u[i] ^= maskKey[i & 3]; payload = u; }
    frames.push({ fin, opcode, payload });
    off = p + len;
  }
  return { frames, rest: buf.slice(off) };
}

function connectOnce(text, opts = {}, offsetMs = 0) {
  return new Promise((resolve, reject) => {
    const reqId = randomUUID().replace(/-/g, '');
    const ts = new Date().toString();
    const sock = tls.connect(443, HOST, { servername: HOST }, () => {
      const key = randomBytes(16).toString('base64');
      const req =
        `GET ${pathWithQuery(offsetMs)} HTTP/1.1\r\n` +
        `Host: ${HOST}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        `Origin: ${ORIGIN}\r\n` +
        `User-Agent: ${UA}\r\n` +
        `Accept-Language: en-US,en;q=0.9\r\n` +
        `Pragma: no-cache\r\nCache-Control: no-cache\r\n\r\n`;
      sock.write(req);
    });

    let phase = 'http';
    let acc = Buffer.alloc(0);
    const audio = [];
    let curOpcode = 0, curChunks = [];
    const timer = setTimeout(() => { try { sock.destroy(); } catch (e) {} reject(new Error('TTS timeout')); }, 30000);
    const fail = (m) => { clearTimeout(timer); try { sock.destroy(); } catch (e) {} reject(new Error(m)); };

    function handleMessage(opcode, payload) {
      if (opcode === 1) { // text
        const s = payload.toString('utf8');
        if (s.includes('Path:turn.end')) { clearTimeout(timer); try { sock.end(); } catch (e) {} resolve(Buffer.concat(audio)); }
      } else if (opcode === 2) { // binary：2-byte header len + header + audio
        if (payload.length < 2) return;
        const hlen = payload.readUInt16BE(0);
        const header = payload.slice(2, 2 + hlen).toString('utf8');
        if (header.includes('Path:audio')) audio.push(payload.slice(2 + hlen));
      } else if (opcode === 8) { fail('server closed'); }
    }

    sock.on('data', (d) => {
      acc = Buffer.concat([acc, d]);
      if (phase === 'http') {
        const i = acc.indexOf('\r\n\r\n');
        if (i < 0) return;
        const head = acc.slice(0, i).toString('utf8');
        if (!/HTTP\/1\.1 101/.test(head)) {
          const m = head.match(/^date:\s*(.+)$/im);
          const serverMs = m ? Date.parse(m[1].trim()) : NaN;
          if (process.env.TTS_DEBUG) console.error(`[handshake] offset=${offsetMs} status="${head.split('\r\n')[0]}" date="${m ? m[1].trim() : 'NONE'}" body="${acc.slice(i + 4).toString('utf8').slice(0, 240).replace(/\s+/g, ' ')}"`);
          clearTimeout(timer); try { sock.destroy(); } catch (e) {}
          if (!Number.isNaN(serverMs) && offsetMs === 0) return reject({ __retry: true, offset: serverMs - Date.now() });
          return reject(new Error('handshake failed: ' + head.split('\r\n')[0]));
        }
        acc = acc.slice(i + 4);
        phase = 'ws';
        // 連線成功 → 送 config + ssml
        const cfg = `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"${OUTPUT_FORMAT}"}}}}`;
        sock.write(encodeFrame(1, Buffer.from(cfg, 'utf8')));
        const msg = `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n` + buildSsml(text, opts);
        sock.write(encodeFrame(1, Buffer.from(msg, 'utf8')));
      }
      if (phase === 'ws') {
        const { frames, rest } = parseFrames(acc);
        acc = rest;
        for (const f of frames) {
          if (f.opcode === 9) { sock.write(encodeFrame(10, f.payload)); continue; } // ping → pong
          if (f.opcode === 0) { curChunks.push(f.payload); }
          else { curOpcode = f.opcode; curChunks = [f.payload]; }
          if (f.fin) { handleMessage(curOpcode, Buffer.concat(curChunks)); curChunks = []; }
        }
      }
    });
    sock.on('error', (e) => fail('socket error: ' + e.message));
    sock.on('close', () => { /* 若已 resolve 不影響 */ });
  });
}

// 包裝：首次用本機時間；若 403 則用伺服器 Date 校正時差後重試一次
export async function synthesize(text, opts = {}) {
  try { return await connectOnce(text, opts, 0); }
  catch (e) { if (e && e.__retry) return await connectOnce(text, opts, e.offset); throw e; }
}

export async function synthToFile(text, outFile, opts = {}) {
  const buf = await synthesize(text, opts);
  if (!buf.length) throw new Error('empty audio');
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, buf);
  return buf.length;
}

// CLI 測試： node edge-tts.mjs "文字" out.mp3 [voice]
const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('edge-tts.mjs');
if (isMain) {
  const text = process.argv[2] || '晚安，這裡是 Pilot 調查員。今晚，我們走進一樁懸案。';
  const out = process.argv[3] || 'test.mp3';
  const voice = process.argv[4] || 'zh-CN-YunjianNeural';
  const n = await synthToFile(text, out, { voice });
  console.log(`OK ${out} ${n} bytes`);
}
