/* Pilot 調查員 — 動態分鏡 Demo 播放器
   依賴 window.EPISODE（episode-data.js）+ 瀏覽器 SpeechSynthesis。
   旁白以「句子佇列」朗讀，避免 Chrome 對超長語句中途停止的問題。 */
(function () {
  var $ = function (id) { return document.getElementById(id); };

  // 由 ?slug= 取案件；預設第一個。資料來自 episodes.js（window.EPISODES）
  var EPISODES = window.EPISODES || (window.EPISODE ? { _: window.EPISODE } : {});
  var slug = new URLSearchParams(location.search).get('slug');
  if (!slug || !EPISODES[slug]) slug = Object.keys(EPISODES)[0];
  var EP = slug ? EPISODES[slug] : null;

  if (!EP || !EP.segments || !EP.segments.length) {
    $('epTitle').textContent = '找不到劇集資料（請先跑 tools/build-episode.mjs）';
    return;
  }

  $('epTitle').textContent = EP.title || '動態分鏡';
  $('epLegal').textContent = EP.legalStatus ? ('法律狀態：' + EP.legalStatus) : '';
  var vid = $('epVideo');
  if (vid && EP.slug) { vid.src = 'media/' + EP.slug + '-demo.mp4'; }

  var segs = EP.segments;
  var cur = 0;
  var playing = false;
  var queue = [];   // 當前段落切成的句子
  var qi = 0;

  // ---- voices ----
  var voiceSel = $('voice');
  var voices = [];
  function loadVoices() {
    var all = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    var zh = all.filter(function (v) { return /zh|cmn|Chinese|中文|Han|Mandarin/i.test(v.lang + ' ' + v.name); });
    voices = zh.length ? zh : all;
    voiceSel.innerHTML = '';
    if (!voices.length) {
      var o = document.createElement('option'); o.textContent = '（此瀏覽器無可用語音）'; voiceSel.appendChild(o); return;
    }
    voices.forEach(function (v, i) {
      var o = document.createElement('option'); o.value = i; o.textContent = v.name + ' (' + v.lang + ')'; voiceSel.appendChild(o);
    });
    var pref = voices.findIndex(function (v) { return /zh[-_]?TW|Hant/i.test(v.lang + v.name); });
    if (pref < 0) pref = voices.findIndex(function (v) { return /zh[-_]?CN|Hans/i.test(v.lang + v.name); });
    voiceSel.value = pref < 0 ? 0 : pref;
  }
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

  // ---- rate ----
  var rate = $('rate'), rateVal = $('rateVal');
  rate.addEventListener('input', function () { rateVal.textContent = rate.value; });

  // ---- render ----
  function render() {
    var s = segs[cur];
    $('segHead').textContent = (s.id ? '[' + s.id + '] ' : '') + (s.heading || '');
    $('segIdx').textContent = (cur + 1) + ' / ' + segs.length;
    $('segPrompt').textContent = s.imagePrompt || '（此段使用真實素材／地圖／時間軸，無 AI 配圖）';
    $('narr').textContent = s.narration || '';
    $('bar').style.width = (segs.length > 1 ? (cur / (segs.length - 1) * 100) : 100) + '%';
    Array.prototype.forEach.call(document.querySelectorAll('.seg'), function (el, i) {
      el.classList.toggle('active', i === cur);
    });
    var act = document.querySelector('.seg.active');
    if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  }

  // ---- 句子切分（不用 lookbehind，相容性較佳）----
  function splitSentences(t) {
    var out = [], buf = '';
    for (var i = 0; i < t.length; i++) {
      buf += t[i];
      if (/[。！？!?；;…\n]/.test(t[i])) { if (buf.trim()) out.push(buf.trim()); buf = ''; }
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  function stopSpeak() { if (window.speechSynthesis) speechSynthesis.cancel(); $('narr').classList.remove('speaking'); }

  function speakCurrent() {
    if (!window.speechSynthesis) return;
    stopSpeak();
    var s = segs[cur];
    queue = splitSentences(s.narration || s.heading || '');
    qi = 0;
    $('narr').classList.add('speaking');
    speakNext();
  }

  function speakNext() {
    if (!playing) return;
    if (qi >= queue.length) { $('narr').classList.remove('speaking'); onSegEnd(); return; }
    var u = new SpeechSynthesisUtterance(queue[qi]);
    var vi = parseInt(voiceSel.value, 10);
    if (voices[vi]) { u.voice = voices[vi]; u.lang = voices[vi].lang; } else { u.lang = 'zh-TW'; }
    u.rate = parseFloat(rate.value) || 0.9;
    u.pitch = 0.95;
    u.onend = function () { qi++; if (playing) speakNext(); };
    u.onerror = function () { qi++; if (playing) speakNext(); };
    speechSynthesis.speak(u);
  }

  function onSegEnd() {
    if (cur < segs.length - 1) { cur++; render(); speakCurrent(); }
    else { setPlaying(false); }
  }

  // ---- controls ----
  function setPlaying(p) { playing = p; $('play').textContent = p ? '⏸ 暫停' : '▶ 播放'; }
  $('play').addEventListener('click', function () {
    if (playing) { setPlaying(false); stopSpeak(); }
    else { setPlaying(true); speakCurrent(); }
  });
  $('next').addEventListener('click', function () { stopSpeak(); if (cur < segs.length - 1) cur++; render(); if (playing) speakCurrent(); });
  $('prev').addEventListener('click', function () { stopSpeak(); if (cur > 0) cur--; render(); if (playing) speakCurrent(); });

  // ---- segment list ----
  var list = $('segList');
  segs.forEach(function (s, i) {
    var el = document.createElement('div');
    el.className = 'seg' + (s.kind === 'host' ? ' host' : '');
    var tag = s.kind === 'host' ? '🎙 ' : '';
    el.innerHTML = '<span class="sid">' + (s.id || (i + 1)) + '</span>' + tag + (s.heading || ('段落 ' + (i + 1)));
    el.addEventListener('click', function () { stopSpeak(); cur = i; render(); if (playing) speakCurrent(); });
    list.appendChild(el);
  });

  window.addEventListener('beforeunload', stopSpeak);
  render();
})();
