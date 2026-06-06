/* Pilot 調查員 — 製作工作台（單案件 · 上方流程切換 · 下方工作區）
   連 tools/serve.mjs（http）時可操作；未連時退回唯讀靜態模式（episodes.js）。
   一次編一集：caseSel 選案 → stagebar 切流程 → workspace 呈現該流程的動作＋即時 feed＋文件 wiki。 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var live = false;
  var state = { topics: [], cases: [], render: { running: false }, claude: { running: false } };
  var activeCase = null;
  var activeStage = 'pick';
  var runPolling = false, renderPolling = false, lastWsSig = '';
  var topicPage = 0;                                       // 選題庫分頁（0-based）
  var TOPIC_PAGE_SIZE = 8;
  var wsDocOpen = null, wsDocsSig = '', wsDocText = '';   // 工作區資料檢視器：目前開啟的文件 / 文件清單簽章 / 最後內容（用於即時更新且不打斷捲動）

  function toast(msg, bad) {
    var t = $('toast'); if (!t) return; t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : '');
    clearTimeout(t._t); t._t = setTimeout(function () { t.className = 'toast hidden'; }, 3600);
  }
  function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function api(path, opts) { return fetch(path, opts).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }); }
  function copy(text) {
    function fb() { try { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('已複製指令'); } catch (e) { toast('複製失敗', true); } }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast('已複製指令'); }, fb); else fb();
  }
  window._copy = copy;

  // ---- Claude 即時活動 feed（解析 stream-json）----
  function frow(icon, text) { return '<div class="frow"><span class="fi">' + icon + '</span><span class="ft">' + esc(text) + '</span></div>'; }
  function toolIcon(n) { n = n || ''; if (/Task|Agent/.test(n)) return '🤖'; if (/Write|Edit|Notebook/.test(n)) return '✍️'; if (/WebSearch/.test(n)) return '🔎'; if (/WebFetch/.test(n)) return '🌐'; if (/Read|Grep|Glob/.test(n)) return '📖'; if (/Workflow|Skill/.test(n)) return '⚙️'; if (/Todo/.test(n)) return '🗒'; if (/Bash|Power/.test(n)) return '💻'; return '🔧'; }
  function toolText(n, inp) {
    n = n || '工具'; inp = inp || {}; var d = '';
    if (/Write|Edit|Read/.test(n) && inp.file_path) d = String(inp.file_path).split(/[\\\/]/).pop();
    else if (/WebSearch/.test(n) && inp.query) d = inp.query;
    else if (/WebFetch/.test(n) && inp.url) d = String(inp.url).slice(0, 64);
    else if (/Task|Agent/.test(n) && inp.description) d = inp.description;
    else if (/Workflow|Skill/.test(n)) d = inp.name || inp.command || '';
    return n + (d ? ' · ' + d : '');
  }
  function eventToRows(ev) {
    if (!ev || !ev.type) return '';
    if (ev.type === 'system') return frow('●', 'Claude 啟動 — 載入技能與工具');
    if (ev.type === 'result') { var n = (ev.num_turns != null) ? (' · ' + ev.num_turns + ' turns') : ''; return frow(ev.is_error ? '⚠️' : '✅', (ev.is_error ? '結束（有錯）' : '本步驟完成') + n); }
    if (ev.type === 'assistant' && ev.message && ev.message.content) {
      return ev.message.content.map(function (b) {
        if (b.type === 'text' && b.text && b.text.trim()) return frow('💬', b.text.trim().slice(0, 160));
        if (b.type === 'tool_use') return frow(toolIcon(b.name), toolText(b.name, b.input));
        return '';
      }).join('');
    }
    if (ev.type === 'user' && ev.message && ev.message.content) {
      return ev.message.content.some(function (b) { return b.type === 'tool_result'; }) ? frow('↳', '工具結果已回') : '';
    }
    return '';
  }
  function renderFeed(tail) {
    if (!tail) return '';
    var lines = tail.split('\n'), out = [];
    for (var i = 1; i < lines.length; i++) {
      var ln = lines[i].trim(); if (!ln) continue;
      var ev; try { ev = JSON.parse(ln); } catch (e) { continue; }
      var r = eventToRows(ev); if (r) out.push(r);
    }
    return out.slice(-60).join('');
  }

  // ---- 極簡 Markdown → HTML（wiki 呈現）----
  function mdInline(t) {
    t = esc(t);
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1<em>$2</em>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/(^|[\s(（])(https?:\/\/[^\s)）]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    return t;
  }
  function splitRow(r) { return r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); }); }
  function mdToHtml(md) {
    var lines = String(md || '').replace(/\r/g, '').split('\n'), html = '', i = 0;
    while (i < lines.length) {
      var ln = lines[i];
      if (/^```/.test(ln)) { var buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; } i++; html += '<pre class="cb">' + esc(buf.join('\n')) + '</pre>'; continue; }
      if (/^\s*$/.test(ln)) { i++; continue; }
      var h = ln.match(/^(#{1,6})\s+(.*)$/); if (h) { var lv = h[1].length; html += '<h' + lv + '>' + mdInline(h[2]) + '</h' + lv + '>'; i++; continue; }
      if (/^\s*(---+|\*\*\*+)\s*$/.test(ln)) { html += '<hr>'; i++; continue; }
      if (/\|/.test(ln) && i + 1 < lines.length && /\|/.test(lines[i + 1]) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        var head = splitRow(ln); i += 2; var body = [];
        while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) { body.push(splitRow(lines[i])); i++; }
        html += '<table class="mdt"><thead><tr>' + head.map(function (c) { return '<th>' + mdInline(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          body.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + mdInline(c) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
        continue;
      }
      if (/^\s*>/.test(ln)) { var bq = []; while (i < lines.length && /^\s*>/.test(lines[i])) { bq.push(lines[i].replace(/^\s*>\s?/, '')); i++; } html += '<blockquote>' + mdInline(bq.join(' ')) + '</blockquote>'; continue; }
      if (/^\s*[-*]\s+/.test(ln)) { var items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; } html += '<ul>' + items.map(function (x) { return '<li>' + mdInline(x) + '</li>'; }).join('') + '</ul>'; continue; }
      if (/^\s*\d+\.\s+/.test(ln)) { var its = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { its.push(lines[i].replace(/^\s*\d+\.\s+/, '')); i++; } html += '<ol>' + its.map(function (x) { return '<li>' + mdInline(x) + '</li>'; }).join('') + '</ol>'; continue; }
      var para = [ln]; i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|\s*>|```)/.test(lines[i])) { para.push(lines[i]); i++; }
      html += '<p>' + mdInline(para.join(' ')) + '</p>';
    }
    return html;
  }

  // ---- 流程定義 ----
  var WF = {
    research: { label: '深度研究', cmd: function (c) { return 'deep-research { slug: "' + c.slug + '", title: "' + (c.title || '').replace(/"/g, '') + '"' + (c.stages && c.stages.intake ? ', intake: true' : '') + ' }'; } },
    arc: { label: '故事編排', cmd: function (c) { return 'story-arc { slug: "' + c.slug + '" }'; } },
    script: { label: '腳本生成', cmd: function (c) { return 'script-studio { slug: "' + c.slug + '" }'; } },
    production: { label: '製作包', cmd: function (c) { return 'production-package { slug: "' + c.slug + '" }'; } }
  };
  var STAGES = [
    { key: 'pick', label: '選題 / 投稿' },
    { key: 'research', label: '研究' },
    { key: 'arc', label: '故事編排' },
    { key: 'script', label: '腳本' },
    { key: 'production', label: '製作包' },
    { key: 'render', label: '渲染' },
    { key: 'db', label: '📚 資料庫' }
  ];
  var STAGE_DOCS = {
    research: ['intake.md', 'dossier.md', 'factcheck.md', 'real-footage-sources.md'],
    arc: ['story-arc.md'],
    script: ['script-natural.md', 'script-tts.md', 'legal-review.md', 'proofreading.md'],
    production: ['production/shotlist.md', 'production/image-prompts.md', 'production/seo-package.md', 'production/sources.md']
  };
  function docLabel(d) {
    var m = { 'intake.md': '📥 投稿素材', 'dossier.md': '🗂 研究檔案 dossier', 'factcheck.md': '✅ 事實查核', 'real-footage-sources.md': '🎥 真實素材來源', 'story-arc.md': '🎬 故事編排 beat-sheet', 'script-natural.md': '📜 旁白稿', 'script-tts.md': '🔊 TTS 稿', 'legal-review.md': '⚖️ 法律審查', 'proofreading.md': '✏️ 校稿報告', 'production/shotlist.md': '🎞 分鏡', 'production/image-prompts.md': '🖼 配圖提示', 'production/seo-package.md': '🔎 SEO', 'production/sources.md': '🔗 來源' };
    return m[d] || d.replace('production/', '');
  }
  function stageLabel(k) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].key === k) return STAGES[i].label; return k; }
  function fmtBytes(b) { if (b == null) return '—'; if (b < 1024) return b + ' B'; if (b < 1048576) return (b / 1024).toFixed(0) + ' KB'; return (b / 1048576).toFixed(1) + ' MB'; }
  function fmtTime(ms) { if (!ms) return ''; var d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; }; return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function docStageLabel(name) { for (var k in STAGE_DOCS) if (STAGE_DOCS[k].indexOf(name) >= 0) return stageLabel(k); return ''; }
  function topicOf(slug) { var r = null; (state.topics || []).forEach(function (t) { if (t.slug === slug) r = t; }); return r; }

  // 常駐案件總覽列
  function caseOverview(c) {
    var tp = topicOf(c.slug), meta = [];
    if (tp) { if (tp.country) meta.push(esc(tp.country)); if (tp.year) meta.push(esc(tp.year)); if (tp.legal) meta.push(esc(tp.legal)); }
    var done = ['research', 'arc', 'script', 'production', 'rendered'].filter(function (k) { return c.stages && c.stages[k]; }).length;
    var chips = '';
    if (epLabel(c)) chips += '<span class="ov ep">' + epLabel(c) + '</span>';
    if (fmtDate(c.updated)) chips += '<span class="ov">📅 ' + fmtDate(c.updated) + '</span>';
    if (tp && tp.score) chips += '<span class="ov score">雷達 ' + esc(tp.score) + '</span>';
    chips += '<span class="ov">進度 ' + done + '/5</span>';
    if (c.chars) chips += '<span class="ov">' + c.chars + ' 字</span>';
    chips += '<span class="ov">' + ((c.docs || []).length) + ' 檔</span>';
    if (c.realLibTotal) chips += '<span class="ov">🎥 真實素材 ' + c.realLibTotal + '</span>';
    if (c.stages && c.stages.episode) chips += '<span class="ov">' + c.narr + ' 旁白 · ' + c.host + ' 解說員</span>';
    return '<div class="overview"><div class="ovtop"><span class="ovtitle">' + esc(c.title) + '</span>' + chips + '</div>' +
      (meta.length ? '<div class="ovmeta">' + meta.join(' · ') + '</div>' : '') +
      (tp && tp.hook ? '<div class="ovhook">「' + esc(tp.hook) + '」</div>' : '') + '</div>';
  }

  // 📚 資料庫：跨步驟全部檔案總表 + wiki 檢視
  function dbBody(c) {
    var docs = c.docs || [], meta = c.docMeta || {};
    if (!docs.length) return '<div class="wf"><div class="wfhead"><h3>' + esc(c.title) + '</h3><span class="stagetag">📚 資料庫</span></div><p class="muted">此案目前沒有任何產出檔案。從「研究」開始。</p></div>';
    var rows = docs.map(function (d, i) { var m = meta[d] || {}; return '<tr class="dbrow" onclick="_docInline(\'' + c.slug + '\',\'' + d + '\',' + i + ')"><td>' + docLabel(d) + '</td><td class="sub2">' + docStageLabel(d) + '</td><td class="num">' + (m.lines || '') + '</td><td class="num sub2">' + fmtTime(m.mtime) + '</td></tr>'; }).join('');
    var nav = docs.map(function (d, i) { return '<button class="wnav" onclick="_docInline(\'' + c.slug + '\',\'' + d + '\',' + i + ')">' + docLabel(d) + '</button>'; }).join('');
    return '<div class="wf"><div class="wfhead"><h3>' + esc(c.title) + '</h3><span class="stagetag">📚 資料庫</span><span class="pill on">' + docs.length + ' 檔</span></div>' +
      '<table class="tbl dbtbl"><thead><tr><th>檔案</th><th>步驟</th><th>行</th><th>更新</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="wsdocs"><div class="wiki"><nav class="wnavbar">' + nav + '</nav><article class="md" id="wsDoc"><p class="muted">點上方檔案檢視</p></article></div></div></div>';
  }

  // ---- 案件清單（選題勾選 + 既有 cases）----
  function workflowList() {
    if (!live) return state.cases || [];
    var by = {};
    (state.topics || []).filter(function (t) { return t.selected; }).forEach(function (t) {
      by[t.slug] = { slug: t.slug, title: t.title, stages: {}, docs: [], narr: 0, host: 0, status: '', note: '' };
    });
    (state.cases || []).forEach(function (c) {
      by[c.slug] = { slug: c.slug, title: c.title, ep: c.ep, updated: c.updated, stages: c.stages || {}, docs: c.docs || [], docMeta: c.docMeta || {}, narr: c.narr || 0, host: c.host || 0, chars: c.chars || 0, subs: c.subs || 0, video: c.video || null, status: c.status || '', note: c.note || '' };
    });
    return Object.keys(by).map(function (k) { return by[k]; });
  }
  function getCase(slug) { var l = workflowList(); for (var i = 0; i < l.length; i++) if (l[i].slug === slug) return l[i]; return null; }
  function stageDone(c, key) { if (key === 'pick') return true; if (key === 'render') return !!(c && c.stages && c.stages.rendered); return !!(c && c.stages && c.stages[key]); }
  // 案件目前所在階段（取已完成的最遠一階；供下拉選單一眼看出進度）
  function caseStageLabel(c) {
    var s = (c && c.stages) || {};
    if (s.rendered) return '✅ 已渲染';
    if (s.production) return '製作包';
    if (s.script) return '腳本';
    if (s.arc) return '故事編排';
    if (s.research) return '研究';
    return '待研究';
  }
  function epLabel(c) { return (c && c.ep != null) ? 'EP' + (c.ep < 10 ? '0' + c.ep : c.ep) : ''; }
  function fmtDate(ms) { if (!ms) return ''; var d = new Date(ms), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function stageRunning(c, key) {
    if (!c) return false;
    if (WF[key]) return !!(state.claude && state.claude.running && state.claude.slug === c.slug && state.claude.step === key);
    if (key === 'render') return !!(state.render && state.render.running && state.render.slug === c.slug);
    return false;
  }
  function stageDocs(c, key) { var want = STAGE_DOCS[key] || [], have = (c && c.docs) || []; return want.filter(function (d) { return have.indexOf(d) >= 0; }); }
  // 腳本步驟的「唯讀」文件（script-natural.md 改由分段編輯器處理，不放進唯讀 wiki）
  function viewDocs(c, key) { var d = stageDocs(c, key); return key === 'script' ? d.filter(function (x) { return x !== 'script-natural.md'; }) : d; }

  // ---- 載入狀態（自癒：掉靜態也持續重試）----
  function load() {
    return fetch('/api/state').then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { live = true; state = j; ensureActive(); renderAll(); if (state.claude && state.claude.running && !runPolling) pollRun(); })
      .catch(function () { live = false; buildStaticState(); ensureActive(); renderAll(); });
  }
  function buildStaticState() {
    var CASES = window.CASES || [], EP = window.EPISODES || {};
    state.topics = [];
    state.cases = CASES.map(function (c) {
      var e = EP[c.slug];
      return { slug: c.slug, title: c.title || c.slug, status: c.status || '', note: c.note || '', docs: [], stages: { episode: !!e, rendered: false }, narr: e ? e.segments.filter(function (s) { return s.kind !== 'host'; }).length : 0, host: e ? e.segments.filter(function (s) { return s.kind === 'host'; }).length : 0 };
    });
    state.render = { running: false }; state.claude = { running: false };
  }
  function ensureActive() { var l = workflowList(); if (!l.length) { activeCase = null; return; } if (!activeCase || !getCase(activeCase)) activeCase = l[0].slug; }

  function renderAll() {
    if ($('conn')) { $('conn').textContent = live ? '● 已連線（可操作）' : '○ 靜態模式（唯讀）'; $('conn').className = 'conn ' + (live ? 'on' : 'off'); }
    renderCaseSel(); renderStageBar();
    var pick = activeStage === 'pick';
    if ($('panel-pick')) $('panel-pick').style.display = pick ? '' : 'none';
    if ($('workspace')) $('workspace').style.display = pick ? 'none' : '';
    if (pick) renderTopics(); else { renderWorkspace(); refreshDocs(); }
  }

  function renderCaseSel() {
    var sel = $('caseSel'); if (!sel) return;
    var l = workflowList().slice().sort(function (a, b) {
      var ae = a.ep == null ? 9999 : a.ep, be = b.ep == null ? 9999 : b.ep;   // 有集數的依序在前，未編號排後
      return ae - be;
    });
    if (!l.length) { sel.innerHTML = '<option value="">（尚無案件 — 先到選題勾選或投稿）</option>'; return; }
    sel.innerHTML = l.map(function (c) {
      var ep = epLabel(c), dt = fmtDate(c.updated);
      var prefix = ep ? ep + ' · ' : '';
      var suffix = '　〔' + caseStageLabel(c) + '〕' + (dt ? ' · ' + dt : '');
      return '<option value="' + c.slug + '"' + (c.slug === activeCase ? ' selected' : '') + '>' + prefix + esc(c.title) + suffix + '</option>';
    }).join('');
  }
  window._case = function (slug) { activeCase = slug; if (activeStage === 'pick') activeStage = 'research'; lastWsSig = ''; renderAll(); };

  function renderStageBar() {
    var c = getCase(activeCase);
    $('stagebar').innerHTML = STAGES.map(function (s) {
      var done = c ? stageDone(c, s.key) : (s.key === 'pick'), running = c ? stageRunning(c, s.key) : false, on = activeStage === s.key;
      var icon = s.key === 'pick' ? '📋' : (running ? '●' : (done ? '✓' : '·'));
      return '<button class="stab' + (on ? ' on' : '') + (done ? ' done' : '') + (running ? ' running' : '') + '" onclick="_stage(\'' + s.key + '\')">' + icon + ' ' + s.label + '</button>';
    }).join('<span class="sarr">›</span>');
  }
  window._stage = function (k) { if (k !== 'pick' && !getCase(activeCase)) { toast('先在「選題 / 投稿」選或投稿一集', true); k = 'pick'; } activeStage = k; lastWsSig = ''; renderAll(); };

  // ---- 選題庫 ----
  function renderTopics() {
    var box = $('topics'); if (!box) return;
    var all = state.topics || [];
    var onlySel = $('onlySel') && $('onlySel').checked;
    var list = onlySel ? all.filter(function (t) { return t.selected; }) : all;
    if ($('topicCount')) $('topicCount').textContent = all.length ? (all.filter(function (t) { return t.selected; }).length + ' / ' + all.length + ' 已選') : '';
    if (!all.length) { box.innerHTML = '<p class="muted">選題庫空。連伺服器後讀 pipeline/radar-shortlist.md；或先在 Claude Code 跑 <code>case-radar</code>。</p>'; return; }
    // 分頁：避免一次列出全部，太長不好找
    var pages = Math.max(1, Math.ceil(list.length / TOPIC_PAGE_SIZE));
    if (topicPage > pages - 1) topicPage = pages - 1;
    if (topicPage < 0) topicPage = 0;
    var start = topicPage * TOPIC_PAGE_SIZE;
    var pageList = list.slice(start, start + TOPIC_PAGE_SIZE);
    var rows = pageList.map(function (t) {
      var cb = '<input type="checkbox" ' + (t.selected ? 'checked' : '') + ' ' + (live ? '' : 'disabled') + ' onchange="_sel(' + t.rank + ',this.checked)">';
      var st = t.selected ? '<span class="pill sel">已加入清單 ↑</span>' : '<span class="pill">勾選以開始</span>';
      return '<tr class="' + (t.selected ? 'selrow' : '') + '"><td>' + cb + '</td><td class="num">' + t.rank + '</td>' +
        '<td><b>' + esc(t.title) + '</b><div class="sub2">' + esc(t.country) + ' · ' + esc(t.year) + ' · ' + esc(t.legal) + '</div><div class="hook">' + esc(t.hook) + '</div></td>' +
        '<td class="num"><span class="score">' + esc(t.score) + '</span></td><td>' + st + '</td></tr>';
    }).join('');
    var pager = pages > 1 ? '<div class="pager">' +
      '<button class="pgbtn" ' + (topicPage <= 0 ? 'disabled' : '') + ' onclick="_topicPage(-1)">‹ 上一頁</button>' +
      '<span class="pginfo">第 ' + (topicPage + 1) + ' / ' + pages + ' 頁（共 ' + list.length + ' 題）</span>' +
      '<button class="pgbtn" ' + (topicPage >= pages - 1 ? 'disabled' : '') + ' onclick="_topicPage(1)">下一頁 ›</button>' +
      '</div>' : '';
    box.innerHTML = '<table class="tbl"><thead><tr><th></th><th>#</th><th>案件</th><th>分</th><th>狀態</th></tr></thead><tbody>' + rows + '</tbody></table>' + pager;
  }
  window._topicPage = function (d) { topicPage += d; renderTopics(); };
  window._sel = function (rank, selected) {
    api('/api/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rank: rank, selected: selected }) })
      .then(function (r) { if (r.ok && r.j.ok) { toast(selected ? '已加入清單 #' + rank : '已移出 #' + rank); load(); } else { toast(r.j.error || '失敗', true); load(); } })
      .catch(function () { toast('需要伺服器才能勾選', true); });
  };

  // ---- 工作區 ----
  function wsSig(c) { return activeStage + '|' + (c ? c.slug : '') + '|' + (c ? JSON.stringify(c.stages) : '') + '|' + (state.claude && state.claude.running ? state.claude.slug + state.claude.step : '') + '|' + (state.render && state.render.running ? state.render.slug : ''); }
  function statusPill(c, stage) { if (stageRunning(c, stage)) return '<span class="pill sel">● 執行中</span>'; if (stageDone(c, stage)) return '<span class="pill on">✓ 已完成</span>'; return '<span class="pill">待執行</span>'; }

  function renderWorkspace() {
    var box = $('workspace'); if (!box) return;
    var c = getCase(activeCase);
    if (!c) { box.innerHTML = '<div class="wf"><p class="muted">尚未選擇案件。切到「選題 / 投稿」勾選或投稿一集。</p></div>'; lastWsSig = ''; return; }
    var sig = wsSig(c);
    if (sig === lastWsSig) return;        // 無變化：不重建，避免打斷你正在讀的文件（feed 與資料檢視器由 poll 獨立更新）
    lastWsSig = sig;
    wsDocOpen = null; wsDocsSig = ''; wsDocText = '';   // 換案/換流程：資料檢視器重置

    var stage = activeStage;
    var ov = caseOverview(c);
    if (stage === 'db') { box.innerHTML = ov + dbBody(c); var dd = c.docs || []; if (dd.length) _docInline(c.slug, dd[0], 0); return; }
    var head = '<div class="wfhead"><span class="stagetag">' + stageLabel(stage) + '</span>' + statusPill(c, stage) + '</div>';
    box.innerHTML = ov + '<div class="wf">' + head + (WF[stage] ? claudeStageBody(c, stage) : renderStageBody(c)) + '</div>';
    if (stage === 'script') buildScriptEditor(c.slug);
    if (WF[stage]) { var docs = viewDocs(c, stage); if (docs.length) _docInline(c.slug, docs[0], 0); }
    else if (stage === 'render' && (c.docs || []).indexOf('production/sources.md') >= 0) { _docInline(c.slug, 'production/sources.md', 0); }
    if (stageRunning(c, stage)) { if (stage === 'render') pollRender(); else pollRun(); }
  }

  function claudeStageBody(c, stage) {
    var cmd = WF[stage].cmd(c), done = stageDone(c, stage), running = stageRunning(c, stage), anyRun = state.claude && state.claude.running;
    var act;
    if (running) act = '<span class="runbadge">● Claude 執行中…（背景，數分鐘～十幾分鐘）</span>';
    else {
      var dis = anyRun ? ' disabled title="已有 Claude 任務在跑"' : '';
      act = '<button class="btn"' + dis + ' onclick="_run(\'' + c.slug + '\',\'' + stage + '\')">' + (done ? '↻ 重跑此步驟' : '▶ 執行（呼叫 Claude）') + '</button>' +
        '<button class="mini" onclick="_copy(\'' + cmd.replace(/'/g, "\\'") + '\')">⧉ 或複製指令到 Claude Code</button>';
    }
    var feed = running ? '<div class="runwrap"><div class="runhead"><span class="dot"></span>即時活動</div><div class="feed" id="runlog">啟動中，等待第一個事件…</div></div>' : '';
    if (stage === 'script') return '<div class="wfact">' + act + '</div>' + feed + scriptEditorShell(c) + docShell(c, stage);
    if (stage === 'production') {
      var segLink = (c.stages && c.stages.episode) ? '<a class="btn ghost" href="segments.html?slug=' + encodeURIComponent(c.slug) + '" target="_blank">🎬 素材檢視 / 編輯（逐段素材包）</a>' : '';
      return '<div class="wfact">' + act + segLink + '</div>' + feed + docShell(c, stage);
    }
    return '<div class="wfact">' + act + '</div>' + feed + docShell(c, stage);
  }
  function renderStageBody(c) {
    var s = c.stages || {}, rendering = stageRunning(c, 'render'), act;
    if (!s.episode) act = '<button class="btn" onclick="_build(\'' + c.slug + '\')">▶ 產生 episode 資料</button><span class="hint">把腳本（含解說員段）轉成可渲染資料</span>';
    else if (rendering) act = '<button class="btn" disabled>● 渲染中…</button>';
    else act = '<button class="btn" onclick="_render(\'' + c.slug + '\')">▶ ' + (s.rendered ? '重新渲染' : '渲染影片') + '</button><button class="mini" onclick="_build(\'' + c.slug + '\')">重建資料</button>';
    var feed = rendering ? '<div class="runwrap"><div class="runhead"><span class="dot"></span>渲染進度</div><pre class="rawlog" id="runlog">啟動中…</pre></div>' : '';
    var view;
    if (s.rendered) {
      var info = '<div class="vinfo">' +
        '<span class="vchip"><b>' + (c.narr + c.host) + '</b> 段（' + c.host + ' 解說員出鏡）</span>' +
        '<span class="vchip"><b>' + (c.subs || '—') + '</b> 句字幕</span>' +
        '<span class="vchip"><b>' + (c.chars || '—') + '</b> 字旁白</span>' +
        '<span class="vchip"><b>' + fmtBytes(c.video && c.video.bytes) + '</b> 檔案</span>' +
        '<span class="vchip">片長 <b id="vdur">—</b></span>' +
        (c.video && c.video.mtime ? '<span class="vchip sub2">渲染於 ' + fmtTime(c.video.mtime) + '</span>' : '') + '</div>';
      var vid = '<video class="wsvid" controls preload="metadata" src="media/' + c.slug + '-demo.mp4" onloadedmetadata="var e=document.getElementById(\'vdur\');if(e)e.textContent=Math.floor(this.duration/60)+\':\'+(\'0\'+Math.floor(this.duration%60)).slice(-2)"></video>';
      var actions = '<div class="actions"><a class="btn ghost" href="episode.html?slug=' + encodeURIComponent(c.slug) + '">互動分鏡</a><a class="btn ghost" href="segments.html?slug=' + encodeURIComponent(c.slug) + '" target="_blank">🎬 素材檢視 / 編輯</a><a class="mini" href="media/' + c.slug + '-demo.mp4" download>下載 mp4</a></div>';
      var src = (c.docs && c.docs.indexOf('production/sources.md') >= 0) ? '<div class="wsdocs"><div class="dlabel">🔗 來源清單與授權（sources.md）：</div><div class="wiki"><nav class="wnavbar"><button class="wnav on" onclick="_docInline(\'' + c.slug + '\',\'production/sources.md\',0)">🔗 來源</button></nav><article class="md" id="wsDoc"><p class="muted">載入中…</p></article></div></div>' : '';
      view = info + vid + actions + src;
    } else view = '<p class="muted">尚未產出影片。' + (s.episode ? '按上方「渲染影片」。' : '先「產生 episode 資料」再渲染。') + '</p>';
    return '<div class="wfact">' + act + '</div>' + feed + view;
  }
  function docsInner(c, stage, docs) {
    if (!docs.length) {
      var running = stageRunning(c, stage);
      return '<p class="muted">' + (running
        ? '⏳ 資料產出中… Claude 正在查證與撰寫，產出的檔案會即時出現在這裡供你檢視。'
        : '此步驟尚無產出。執行後，新增的檔案會在這裡以 wiki 呈現。') + '</p>';
    }
    var nav = docs.map(function (d, i) { return '<button class="wnav" id="wn' + i + '" onclick="_docInline(\'' + c.slug + '\',\'' + d + '\',' + i + ')">' + docLabel(d) + '</button>'; }).join('');
    return '<div class="dlabel">📚 查到的資料（即時更新，可點擊檢視）：</div><div class="wiki"><nav class="wnavbar">' + nav + '</nav><article class="md" id="wsDoc"><p class="muted">載入中…</p></article></div>';
  }
  function docShell(c, stage) {
    var docs = viewDocs(c, stage);
    wsDocsSig = docs.join(',');
    return '<div class="wsdocs">' + docsInner(c, stage, docs) + '</div>';
  }
  // 即時刷新資料檢視器：不重建整個工作區（避免打斷活動 feed），只更新文件清單與目前開啟文件的內容。
  function refreshDocs() {
    var c = getCase(activeCase); if (!c) return;
    var stage = activeStage; if (!WF[stage]) return;
    var host = document.querySelector('#workspace .wsdocs'); if (!host) return;
    var docs = viewDocs(c, stage), sig = docs.join(',');
    if (sig !== wsDocsSig) {                                  // 文件清單有變（新檔產出）→ 重建導覽，保留目前選取
      wsDocsSig = sig;
      host.innerHTML = docsInner(c, stage, docs);
      var keep = (wsDocOpen && docs.indexOf(wsDocOpen.name) >= 0) ? docs.indexOf(wsDocOpen.name) : (docs.length ? 0 : -1);
      if (keep >= 0) { wsDocText = ''; _docInline(c.slug, docs[keep], keep); }
    } else if (wsDocOpen && docs.indexOf(wsDocOpen.name) >= 0) { // 清單未變、有開啟文件 → 靜默重抓內容（檔案邊寫邊長）
      refetchOpenDoc();
    }
  }
  function refetchOpenDoc() {
    if (!wsDocOpen) return;
    fetch('/api/doc?slug=' + encodeURIComponent(wsDocOpen.slug) + '&name=' + encodeURIComponent(wsDocOpen.name))
      .then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (t) {
        if (t === wsDocText) return;                          // 內容未變：不動 DOM，保留捲動位置
        wsDocText = t; var el = $('wsDoc'); if (!el) return;
        var follow = el.scrollHeight - el.scrollTop - el.clientHeight < 48;  // 原本貼著底部 → 跟著新內容捲動
        el.innerHTML = mdToHtml(t); if (follow) el.scrollTop = el.scrollHeight;
      }).catch(function () { });
  }
  window._docInline = function (slug, name, idx) {
    wsDocOpen = { slug: slug, name: name, idx: idx }; wsDocText = '';
    var navs = document.querySelectorAll('#workspace .wnav'); for (var i = 0; i < navs.length; i++) navs[i].classList.toggle('on', i === idx);
    if ($('wsDoc')) $('wsDoc').innerHTML = '<p class="muted">載入中…</p>';
    fetch('/api/doc?slug=' + encodeURIComponent(slug) + '&name=' + encodeURIComponent(name))
      .then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (t) { wsDocText = t; if ($('wsDoc')) $('wsDoc').innerHTML = mdToHtml(t); })
      .catch(function () { if ($('wsDoc')) $('wsDoc').innerHTML = '<p class="muted">需要伺服器才能讀取，或檔案不存在。</p>'; });
  };

  // ---- 腳本分段編輯器（每段可勾畫面類型＋改旁白；單一真實來源＝script-natural.md）----
  var VISUALS = ['調用影片', '真實圖片', '生成圖片', '生成圖表', '地圖', '解說員辦公桌'];
  var scriptEdit = { slug: null, header: '' };   // 反序列化時保留稿頭（法律狀態等）

  function scriptEditorShell(c) {
    return '<div class="scriptedit"><div class="se-bar">' +
      '<button class="btn" onclick="_scriptSave(\'' + c.slug + '\',false)">💾 儲存腳本</button>' +
      '<button class="mini" onclick="_scriptSave(\'' + c.slug + '\',true)">✅ 定稿 → 生成 TTS 稿</button>' +
      '<span class="hint">每段可勾「畫面類型」並編輯旁白；存檔即重建 episode 資料。TTS 稿請定稿後再生成，避免與自然稿不同步。</span>' +
      '</div><div id="scriptEditor"><p class="muted">載入腳本中…</p></div></div>';
  }

  // 解析 script-natural.md → {header, segs:[{id,title,kind,visual:[],body}]}
  function scriptParse(md) {
    var lines = String(md || '').replace(/\r/g, '').split('\n');
    var firstH = -1;
    for (var i = 0; i < lines.length; i++) { if (/^##\s+\[/.test(lines[i])) { firstH = i; break; } }
    var header = firstH < 0 ? md : lines.slice(0, firstH).join('\n').replace(/\s+$/, '');
    var segs = [], cur = null;
    var push = function () { if (cur) { cur.body = cur.bodyLines.join('\n').replace(/^\n+|\n+$/g, ''); delete cur.bodyLines; segs.push(cur); cur = null; } };
    for (var j = (firstH < 0 ? lines.length : firstH); j < lines.length; j++) {
      var ln = lines[j];
      var h = ln.match(/^##\s+\[(HOST-[^\]]+|INTRO|ENDING|\d+)\]\s*(.*)$/);
      if (h) { push(); cur = { id: h[1], title: h[2].trim(), kind: /^\d+$/.test(h[1]) ? 'narr' : (/^HOST/.test(h[1]) ? 'host' : h[1].toLowerCase()), visual: [], bodyLines: [] }; continue; }
      if (/^##\s/.test(ln)) continue;   // 略過非 [標籤] 的 H2 分幕標題
      if (!cur) continue;
      if (/^\s*---+\s*$/.test(ln)) continue;                    // 分段線（序列化時重建）
      // 只有「敘事段」的 〔畫面：…〕由勾選框接管並從本文移除；其餘段（host/intro/ending）連同其引言原樣保留在本文
      if (cur.kind === 'narr') {
        var vm = ln.match(/^\s*>\s*〔畫面[：:]\s*(.+?)〕\s*$/);
        if (vm) { cur.visual = vm[1].split(/[＋+、,／/|｜]/).map(function (s) { return s.trim(); }).filter(function (s) { return VISUALS.indexOf(s) >= 0; }); continue; }
      }
      cur.bodyLines.push(ln);
    }
    push();
    return { header: header, segs: segs };
  }

  // {header, segs} → script-natural.md
  function scriptSerialize(model) {
    var blocks = model.segs.map(function (s) {
      var out = '## [' + s.id + '] ' + s.title + '\n\n';
      if (s.kind === 'narr' && s.visual.length) out += '> 〔畫面：' + s.visual.join('＋') + '〕\n\n';
      out += (s.body || '').replace(/\s+$/, '') + '\n';
      return out;
    });
    return model.header.replace(/\s+$/, '') + '\n\n' + blocks.join('\n---\n\n');
  }

  function segCard(s, si) {
    var kindTag = s.kind === 'host' ? '🎙 解說員辦公桌' : s.kind === 'intro' ? '⌨ 打字機開場' : s.kind === 'ending' ? '🎬 片尾' : '';
    var head = '<div class="seg-head"><span class="seg-id">[' + esc(s.id) + ']</span> <span class="seg-title">' + esc(s.title) + '</span>' +
      (kindTag ? '<span class="seg-lock">' + kindTag + '</span>' : '') + '</div>';
    var vis = '';
    if (s.kind === 'narr') {
      vis = '<div class="seg-visuals">' + VISUALS.slice(0, 5).map(function (v) {  // 敘事段可勾前 5 種（含地圖串場）；解說員辦公桌僅 HOST 段
        var on = s.visual.indexOf(v) >= 0;
        return '<label class="vchk' + (on ? ' on' : '') + '"><input type="checkbox" data-v="' + v + '"' + (on ? ' checked' : '') + ' onchange="_segChk(this)"> ' + v + '</label>';
      }).join('') + '</div>';
    }
    var rows = Math.min(14, Math.max(3, (s.body || '').split('\n').length + 1));
    var ta = '<textarea class="seg-body" rows="' + rows + '" spellcheck="false">' + esc(s.body) + '</textarea>';
    return '<div class="seg-edit" data-si="' + si + '" data-id="' + esc(s.id) + '" data-title="' + esc(s.title) + '" data-kind="' + s.kind + '">' + head + vis + ta + '</div>';
  }

  function buildScriptEditor(slug) {
    var box = $('scriptEditor'); if (!box) return;
    fetch('/api/doc?slug=' + encodeURIComponent(slug) + '&name=script-natural.md')
      .then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (md) {
        var model = scriptParse(md);
        scriptEdit.slug = slug; scriptEdit.header = model.header;
        var el = $('scriptEditor'); if (!el) return;
        el.innerHTML = model.segs.length ? model.segs.map(segCard).join('') : '<p class="muted">腳本沒有可解析的段落。</p>';
      })
      .catch(function () { var el = $('scriptEditor'); if (el) el.innerHTML = '<p class="muted">尚無腳本。先按上方「執行（呼叫 Claude）」用 script-studio 產生草稿，再回來編輯。</p>'; });
  }

  window._segChk = function (cb) { var l = cb.closest('.vchk'); if (l) l.classList.toggle('on', cb.checked); };

  // 從 DOM 重建 model（含使用者編輯）→ markdown
  function collectScript() {
    var cards = document.querySelectorAll('#scriptEditor .seg-edit');
    var segs = [];
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i], kind = card.getAttribute('data-kind');
      var visual = [];
      if (kind === 'narr') { var cbs = card.querySelectorAll('.seg-visuals input:checked'); for (var k = 0; k < cbs.length; k++) visual.push(cbs[k].getAttribute('data-v')); }
      var ta = card.querySelector('.seg-body');
      segs.push({ id: card.getAttribute('data-id'), title: card.getAttribute('data-title'), kind: kind, visual: visual, body: ta ? ta.value : '' });
    }
    return scriptSerialize({ header: scriptEdit.header, segs: segs });
  }

  window._scriptSave = function (slug, thenTts) {
    if (!live) return toast('需要伺服器：node tools/serve.mjs', true);
    if (!$('scriptEditor') || !document.querySelector('#scriptEditor .seg-edit')) return toast('沒有可儲存的腳本內容', true);
    var md = collectScript();
    toast('儲存腳本中…');
    api('/api/script-save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: slug, markdown: md }) })
      .then(function (r) {
        if (!(r.ok && r.j.ok)) return toast((r.j && r.j.error) || '存檔失敗', true);
        toast(r.j.build ? '已存檔並重建 episode 資料' : '已存檔（episode 重建失敗，見 console）');
        if (r.j.build === false) console.warn('build-episode 失敗：', r.j.error);
        if (thenTts) { if (state.claude && state.claude.running) return toast('已有 Claude 任務在跑，TTS 稍後再生成', true); window._run(slug, 'tts'); }
        else { lastWsSig = ''; load(); }   // 刷新進度/字數；非 TTS 時才重建（TTS 會自行 poll）
      })
      .catch(function () { toast('存檔失敗，需要伺服器', true); });
  };

  // ---- 動作 ----
  window._run = function (slug, step) {
    if (!live) return toast('需要伺服器：node tools/serve.mjs', true);
    if (state.claude && state.claude.running) return toast('已有 Claude 任務在跑：' + state.claude.slug, true);
    toast('呼叫 Claude 執行：' + stageLabel(step) + '（背景）');
    api('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: slug, step: step }) })
      .then(function (r) { if (r.ok && r.j.ok) { load().then(function () { pollRun(); }); } else toast(r.j.error || '執行失敗', true); });
  };
  function pollRun() {
    if (runPolling) return; runPolling = true;
    (function tick() {
      fetch('/api/run-status').then(function (r) { return r.json(); }).then(function (j) {
        var el = $('runlog'); if (el) { var f = renderFeed(j.tail); if (f) { el.innerHTML = f; el.scrollTop = el.scrollHeight; } }
        refreshDocs();                       // 跑動中即時把新產出/邊寫邊長的內容帶進資料檢視器
        if (j.running) setTimeout(tick, 3000);
        else { runPolling = false; toast('Claude 任務結束：' + stageLabel(j.step)); lastWsSig = ''; load(); }
      }).catch(function () { runPolling = false; });
    })();
  }
  window._build = function (slug) {
    if (!live) return toast('需要伺服器：node tools/serve.mjs', true);
    toast('產生 episode 資料…');
    api('/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: slug }) })
      .then(function (r) { if (r.ok && r.j.ok) { toast('episode 資料完成'); lastWsSig = ''; load(); } else toast(r.j.error || '失敗', true); });
  };
  window._render = function (slug) {
    if (!live) return toast('需要伺服器：node tools/serve.mjs', true);
    api('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: slug }) })
      .then(function (r) { if (r.ok && r.j.ok) { toast('開始渲染（背景）'); load().then(function () { pollRender(); }); } else toast(r.j.error || '失敗', true); });
  };
  function pollRender() {
    if (renderPolling) return; renderPolling = true;
    (function tick() {
      fetch('/api/render-status').then(function (r) { return r.json(); }).then(function (j) {
        var el = $('runlog'); if (el && j.tail) { el.textContent = j.tail.slice(-2000); el.scrollTop = el.scrollHeight; }
        if (j.running) setTimeout(tick, 3000);
        else { renderPolling = false; toast('渲染完成'); lastWsSig = ''; load(); }
      }).catch(function () { renderPolling = false; });
    })();
  }
  window._intake = function () {
    if (!live) return toast('需要伺服器：node tools/serve.mjs', true);
    var title = ($('inTitle').value || '').trim(), materials = ($('inMaterials').value || '').trim();
    if (!title) return toast('請先輸入題目', true);
    $('inBtn').disabled = true;
    api('/api/intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title, materials: materials }) })
      .then(function (r) {
        $('inBtn').disabled = false;
        if (r.ok && r.j.ok) { $('inTitle').value = ''; $('inMaterials').value = ''; activeCase = r.j.slug; activeStage = 'research'; lastWsSig = ''; toast('已建立「' + title + '」（偵測 ' + r.j.urls + ' 連結）→ 切到研究'); load(); }
        else toast(r.j.error || '失敗', true);
      })
      .catch(function () { $('inBtn').disabled = false; toast('投稿失敗，需要伺服器', true); });
  };

  // ---- init ----
  if ($('onlySel')) $('onlySel').addEventListener('change', function () { topicPage = 0; renderTopics(); });
  if ($('inBtn')) $('inBtn').addEventListener('click', window._intake);
  if ($('caseSel')) $('caseSel').addEventListener('change', function () { window._case(this.value); });
  setInterval(function () { load(); }, 8000);   // 自癒＋進度同步（工作區有變更才重建）
  load();
})();
