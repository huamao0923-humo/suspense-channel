// 逐段素材檢視 / 編輯台。讀 /api/segments/<slug>，逐段呈現每槽素材（影片/圖/AI），供配音前定稿。
// L3：檢視版面。L3b：每槽操作（改提示詞抓 / 重抓 / 重生 AI / 收進素材庫 / 歸檔 / 刪除）＋進度輪詢刷新。
'use strict';

const PER_PAGE = 6;
const state = { slug: null, data: null, page: 0, busy: false };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const KIND_LABEL = { narration: '旁白', host: '解說員', intro: '打字機', timecard: '打字機', ending: '片尾' };
const TIER_LABEL = { real: '真實素材', ai: 'AI 示意', manual: '手動', composed: '合成', unknown: '未取得' };

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function fillCases() {
  const sel = $('slug');
  const cases = (window.CASES || []).filter((c) => c.hasEpisode);
  sel.innerHTML = '';
  for (const c of cases) { const o = document.createElement('option'); o.value = c.slug; o.textContent = c.title || c.slug; sel.appendChild(o); }
  const fromUrl = new URLSearchParams(location.search).get('slug');
  if (fromUrl && cases.some((c) => c.slug === fromUrl)) sel.value = fromUrl;
  state.slug = sel.value;
}

async function load() {
  if (!state.slug) return;
  $('segs').innerHTML = '<p class="meta">載入中…</p>';
  let d;
  try { const r = await fetch('/api/segments/' + state.slug); if (!r.ok) throw new Error(await r.text()); d = await r.json(); }
  catch (e) { $('segs').innerHTML = '<p class="meta">讀取失敗：' + esc(e.message || e) + '</p>'; return; }
  state.data = d;
  renderSummary(); render();
}

function renderSummary() {
  const d = state.data; if (!d) return;
  const withMedia = d.segments.reduce((a, s) => a + s.slots.filter((x) => x.media).length, 0);
  const totalSlots = d.segments.reduce((a, s) => a + s.slots.length, 0);
  $('summary').textContent = `共 ${d.segments.length} 段 · ${withMedia}/${totalSlots} 槽有素材 · ${d.hasManifest ? '已讀 manifest' : '尚無 manifest（顯示硬碟槽檔）'}`;
}

function render() {
  const d = state.data; if (!d) return;
  const pages = Math.max(1, Math.ceil(d.segments.length / PER_PAGE));
  state.page = Math.min(state.page, pages - 1);
  const slice = d.segments.slice(state.page * PER_PAGE, state.page * PER_PAGE + PER_PAGE);
  $('segs').innerHTML = slice.map(segCard).join('');
  $('pageinfo').textContent = `第 ${state.page + 1} / ${pages} 頁`;
  $('prev').disabled = state.page === 0;
  $('next').disabled = state.page >= pages - 1;
}

function segCard(seg) {
  const kind = seg.kind || 'narration';
  const composed = kind !== 'narration';
  const dateText = (seg.dateLines && seg.dateLines.length) ? seg.dateLines.join('　') : '';
  // 解說員段顯示其旁白（列車長台詞）；打字機/時間卡顯示日期卡文字；旁白段顯示旁白
  const contentText = kind === 'host' ? seg.narration
    : (kind === 'intro' || kind === 'timecard') ? (dateText || seg.narration)
      : seg.narration;
  const stat = `估時 ${seg.durationEst}s · ${composed ? '合成畫面' : seg.slots.length + ' 支素材'}`;
  const segacts = composed ? '' : `
      <span class="segacts">
        <button class="segact${seg.originalAudio ? ' on' : ''}" data-segaction="orig">${seg.originalAudio ? '🔊 原聲（點擊改回 TTS）' : '設為原聲'}</button>
        <button class="segact" data-segaction="preview">產生預覽</button>
      </span>`;
  const preview = (!composed && seg.preview) ? `<div class="preview"><div class="lbl">單段預覽（最近一次產生）：</div><video controls preload="metadata" src="${esc(seg.preview)}"></video></div>` : '';
  let body;
  if (composed) {
    const note = kind === 'host' ? '畫面：Pilot 定格出鏡（自動合成）' : (kind === 'intro' || kind === 'timecard') ? '畫面：打字機日期卡（自動逐字浮現）' : '畫面：自動合成';
    body = `<div class="seg-body"><div class="seg-main">${contentText ? `<div class="narr">${esc(contentText)}</div>` : ''}<div class="composed-note">${note}，不需逐槽配素材。</div></div></div>`;
  } else {
    // 每槽時間區間（累加 dur，依 k 順序＝時間順序）＋重複偵測
    const counts = {};
    for (const sl of seg.slots) { const f = fileKey(sl.media); if (f) counts[f] = (counts[f] || 0) + 1; }
    let t = 0; const infoByK = {};
    for (const sl of seg.slots) { infoByK[sl.k] = { start: t, end: t + (sl.dur || 0), dup: counts[fileKey(sl.media)] > 1 }; t += (sl.dur || 0); }
    // 分層：主素材（k0）大顯示；填充 B-roll 收合，可展開逐一抽換
    const primary = seg.slots.filter((s) => !s.isFill);
    const fills = seg.slots.filter((s) => s.isFill);
    const primaryHtml = primary.map((sl) => slotCell(seg, sl, infoByK[sl.k])).join('');
    const fillTotal = Math.round(fills.reduce((a, s) => a + (s.dur || 0), 0) * 10) / 10;
    const fillsHtml = fills.length
      ? `<details class="fills"><summary>${fills.length} 個自動填充 B-roll · 共 ${fillTotal}s（展開可逐一抽換）</summary><div class="fillgrid">${fills.map((sl) => slotCell(seg, sl, infoByK[sl.k])).join('')}</div></details>`
      : '';
    const slots = `<div class="slots">${primaryHtml}</div>${fillsHtml}`;
    body = `<div class="seg-body">
         <div class="seg-main">${seg.narration ? `<div class="narr">${esc(seg.narration)}</div>` : ''}${preview}</div>
         <div class="seg-slotcol">${slots}</div>
       </div>`;
  }
  return `
    <div class="seg" data-idx="${seg.idx}" data-n="${seg.narrIndex}">
      <div class="seg-hd">
        <span class="kind ${esc(kind)}">${esc(KIND_LABEL[kind] || kind)}</span>
        <span class="seg-id">${esc(seg.id)}${seg.narrIndex != null ? ' · #' + seg.narrIndex : ''}</span>
        <span class="seg-title">${esc(seg.heading)}</span>
        ${segacts}
        <span class="seg-stat">${stat}</span>
      </div>
      ${body}
    </div>`;
}

function fileKey(media) { return media ? (media.split('path=').pop() || media) : ''; }
function fmtT(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function slotCell(seg, sl, info) {
  info = info || {};
  const media = sl.media
    ? (sl.video
      ? `<video controls preload="metadata" src="${esc(sl.media)}"></video>`
      : `<img loading="lazy" src="${esc(sl.media)}">`)
    : `<div class="empty">尚無素材（待渲染或重抓）</div>`;
  const tier = sl.tier || 'unknown';
  const tag = sl.provider || TIER_LABEL[tier] || tier;
  const range = (sl.dur != null) ? `⏱ ${fmtT(info.start)}–${fmtT(info.end)} · ${sl.dur}s` : '';
  const role = sl.isFill ? '<span class="tag fill">填充 B-roll</span>' : '<span class="tag main">主素材</span>';
  const dup = info.dup ? '<span class="tag dup">↻ 重複用</span>' : '';
  const pq = (sl.query || sl.prompt || '');
  const defMode = (seg.visual || []).includes('video') ? 'video' : (seg.visual || []).includes('real-photo') ? 'real-photo' : 'illust';
  const opt = (v, label) => `<option value="${v}"${v === defMode ? ' selected' : ''}>${label}</option>`;
  return `
    <div class="slot" data-n="${seg.narrIndex}" data-k="${sl.k}">
      <div class="slot-top">${range ? `<span class="range">${range}</span>` : ''}${role}${dup}</div>
      ${media}
      <div><span class="tag ${esc(tier)}">${esc(tag)}</span>${sl.isManual ? ' <span class="tag manual">手動</span>' : ''}</div>
      ${sl.title ? `<div class="fn">${esc(sl.title)}</div>` : ''}
      ${sl.license ? `<div class="lic">授權：${esc(sl.license)}</div>` : ''}
      <div class="ctrl">
        <select class="mode" title="抓素材模式">${opt('video', '影片')}${opt('real-photo', '真實圖')}${opt('illust', 'AI 示意')}</select>
      </div>
      <textarea class="pq" title="抓素材提示詞／查詢詞">${esc(pq)}</textarea>
      <div class="acts">
        <button class="act primary" data-action="refetch">改提示詞並抓素材</button>
        <button class="act" data-action="pick">挑片</button>
        <button class="act" data-action="regen">重生 AI</button>
        <button class="act" data-action="save">收進素材庫</button>
        <button class="act" data-action="archive">歸檔</button>
        <button class="act danger" data-action="delete">刪除</button>
      </div>
    </div>`;
}

function setBusy(on, msg) {
  state.busy = on;
  $('segs').classList.toggle('busy', on);
  $('status').classList.toggle('run', on);
  $('status').textContent = msg || '';
  for (const b of [$('refresh'), $('prev'), $('next'), $('slug')]) b.disabled = on || (b === $('prev') && state.page === 0);
}

// spawn 類動作（重抓/重生）：啟動後輪詢 render-status，完成即重載
async function runSpawn(api, body, label) {
  if (state.busy) return;
  setBusy(true, '⏳ ' + label + ' 啟動中…');
  let r;
  try { r = await (await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); }
  catch (e) { setBusy(false); toast('啟動失敗：' + (e.message || e)); return; }
  if (!r.ok) { setBusy(false); toast(r.error || '啟動失敗'); return; }
  pollUntilDone(label);
}

function pollUntilDone(label) {
  let n = 0;
  const tick = async () => {
    n++;
    let st;
    try { st = await (await fetch('/api/render-status')).json(); } catch { st = { running: true }; }
    if (st.running) {
      const tail = (st.tail || '').trim().split('\n').pop() || '';
      $('status').textContent = `⏳ ${label} 進行中（${n * 2}s）… ${tail.slice(-70)}`;
      setTimeout(tick, 2000);
    } else {
      setBusy(false); toast(label + ' 完成'); load();
    }
  };
  setTimeout(tick, 1500);
}

async function runSync(api, body, label) {
  if (state.busy) return;
  setBusy(true, '⏳ ' + label + '…');
  let r;
  try { r = await (await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json(); }
  catch (e) { setBusy(false); toast('失敗：' + (e.message || e)); return; }
  setBusy(false);
  if (!r.ok) { toast(r.error || '失敗'); return; }
  toast(label + ' 完成' + (r.filename ? '：' + r.filename : ''));
  load();
}

function onAction(e) {
  const seg = e.target.closest('.segact');
  if (seg) {
    const card = seg.closest('.seg'); const n = +card.dataset.n;
    const a = seg.dataset.segaction;
    if (a === 'preview') runSpawn('/api/segment/preview', { slug: state.slug, seg: n }, `產生預覽 段${n}`);
    else if (a === 'orig') runSync('/api/segment/set-original-audio', { slug: state.slug, seg: n, on: !seg.classList.contains('on') }, `段${n} 音軌設定`);
    return;
  }
  const btn = e.target.closest('.act'); if (!btn) return;
  const slot = btn.closest('.slot'); if (!slot) return;
  const n = +slot.dataset.n, k = +slot.dataset.k;
  const mode = slot.querySelector('.mode').value;
  const val = slot.querySelector('.pq').value.trim();
  const base = { slug: state.slug, seg: n, slot: k };
  const act = btn.dataset.action;
  if (act === 'refetch') runSpawn('/api/slot/refetch', { ...base, mode, query: val, prompt: val }, `重抓 段${n}.${k}`);
  else if (act === 'pick') openPicker(n, k, val, slot);
  else if (act === 'regen') runSpawn('/api/slot/regen', { ...base, prompt: val }, `AI 重生 段${n}.${k}`);
  else if (act === 'save') runSync('/api/slot/save-to-library', base, `收進素材庫 段${n}.${k}`);
  else if (act === 'archive') { if (confirm(`歸檔 段${n}.${k} 的素材？（可從 production/_archive 復原）`)) runSync('/api/slot/archive', base, `歸檔 段${n}.${k}`); }
  else if (act === 'delete') { if (confirm(`刪除 段${n}.${k} 的素材？此槽將退回空白，待重抓或重渲。`)) runSync('/api/slot/delete', base, `刪除 段${n}.${k}`); }
}

// ---- 挑片：Commons 候選 gallery（目前那張＝預設），選一即下載成該槽 ----
function ensureModal() {
  let m = document.querySelector('.pk-mask');
  if (m) return m;
  m = document.createElement('div'); m.className = 'pk-mask';
  m.innerHTML = `<div class="pk"><div class="pk-hd"><b>挑片</b><span class="pk-q meta"></span><button class="x" title="關閉">✕</button></div><div class="pk-body"></div></div>`;
  document.body.appendChild(m);
  m.querySelector('.x').onclick = () => m.classList.remove('show');
  m.onclick = (e) => { if (e.target === m) m.classList.remove('show'); };
  m.querySelector('.pk-body').addEventListener('click', (e) => {
    const card = e.target.closest('.pk-card'); if (!card || card.classList.contains('cur')) return;
    const c = m._cands && m._cands[+card.dataset.i]; if (!c) return;
    m.classList.remove('show');
    runSync('/api/slot/pick', { slug: state.slug, seg: +m.dataset.n, slot: +m.dataset.k, url: c.url, video: c.video, license: c.license, creator: c.creator, title: c.title, source: c.source }, `挑片 段${m.dataset.n}.${m.dataset.k}`);
  });
  return m;
}

async function openPicker(n, k, query, slotEl) {
  if (!query) { toast('先在提示詞框輸入查詢詞，再挑片'); return; }
  const m = ensureModal();
  m.dataset.n = n; m.dataset.k = k;
  m.querySelector('.pk-q').textContent = `段 ${n}.${k}｜查詢：${query}`;
  m.querySelector('.pk-body').innerHTML = '<p class="meta">搜尋 Wikimedia Commons 候選中…</p>';
  m.classList.add('show');
  let d;
  try { d = await (await fetch(`/api/slot/candidates?slug=${encodeURIComponent(state.slug)}&query=${encodeURIComponent(query)}`)).json(); }
  catch (e) { m.querySelector('.pk-body').innerHTML = '搜尋失敗：' + esc(e.message || e); return; }
  if (!d.ok || !d.candidates || !d.candidates.length) { m.querySelector('.pk-body').innerHTML = '<p class="meta">查無候選（換個查詢詞）</p>'; return; }
  m._cands = d.candidates;
  const cur = slotEl.querySelector('video, img');
  const curHtml = cur ? `<div class="pk-card cur"><div class="pk-cap" style="margin-bottom:5px;color:#93d8a3">✓ 目前（預設）</div>${cur.tagName === 'VIDEO' ? `<video src="${cur.getAttribute('src')}" muted></video>` : `<img src="${cur.getAttribute('src')}">`}</div>` : '';
  m.querySelector('.pk-body').innerHTML = curHtml + d.candidates.map((c, i) =>
    `<div class="pk-card" data-i="${i}" title="點此採用">${c.video ? `<video src="${esc(c.url)}" muted preload="metadata"></video>` : `<img loading="lazy" src="${esc(c.url)}">`}<div class="pk-cap">${esc(c.license)}${c.creator ? ' · ' + esc(c.creator).replace(/<[^>]+>/g, '').slice(0, 24) : ''}</div></div>`).join('');
}

function init() {
  fillCases();
  $('slug').onchange = (e) => { state.slug = e.target.value; state.page = 0; history.replaceState(null, '', '?slug=' + state.slug); load(); };
  $('refresh').onclick = load;
  $('rerender').onclick = () => { if (confirm('整片重渲（無語音）？畫面＋字幕＋BGM，旁白不烙合成語音，供日後配真人聲。需數分鐘。')) runSpawn('/api/render', { slug: state.slug, voice: false }, '整片重渲（無語音）'); };
  $('rerenderVoice').onclick = () => { if (confirm('合成語音版？整片重渲並合成 TTS 旁白，較久（含語音合成）。')) runSpawn('/api/render', { slug: state.slug, voice: true }, '合成語音版'); };
  $('prev').onclick = () => { state.page--; render(); };
  $('next').onclick = () => { state.page++; render(); };
  $('segs').addEventListener('click', onAction);
  if (state.slug) { history.replaceState(null, '', '?slug=' + state.slug); load(); }
}

init();
