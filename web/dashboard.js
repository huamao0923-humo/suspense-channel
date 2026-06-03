/* Pilot 調查員 — 製作主控台
   依賴 window.CASES（各案進度）+ window.EPISODES（可播放案件）。
   兩者由 tools/build-episode.mjs 產生於 episodes.js。 */
(function () {
  var box = document.getElementById('caseList');
  var CASES = window.CASES || [];
  var EPISODES = window.EPISODES || {};

  if (!box) return;
  if (!CASES.length) {
    box.innerHTML = '<div class="card"><p>尚無案件。先跑 workflow 並執行 ' +
      '<code>node tools/build-episode.mjs --slug &lt;slug&gt;</code>。</p></div>';
    return;
  }

  function esc(s) { return (s || '').replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  box.innerHTML = CASES.map(function (c) {
    var ep = EPISODES[c.slug];
    var narr = ep ? ep.segments.filter(function (s) { return s.kind !== 'host'; }).length : 0;
    var host = ep ? ep.segments.filter(function (s) { return s.kind === 'host'; }).length : 0;

    var stats = ep
      ? '<div class="stats">' +
        '<div class="stat"><b>' + (narr + host) + '</b>分段</div>' +
        '<div class="stat"><b>' + narr + '</b>旁白段</div>' +
        '<div class="stat"><b>' + host + '</b>解說員出鏡</div>' +
        '</div>'
      : '<p style="color:var(--muted);margin:6px 0 0">尚未產生 episode.json（跑 build-episode）。</p>';

    var actions = ep
      ? '<a class="btn" href="media/' + c.slug + '-demo.mp4">▶ 看合成影片</a>' +
        '<a class="btn ghost" href="episode.html?slug=' + encodeURIComponent(c.slug) + '">互動分鏡 / 換語音</a>'
      : '';

    return '<div class="ep">' +
      '<div class="frame">FRAME 16:9<br>' + esc(c.slug) + '</div>' +
      '<div class="meta">' +
        '<span class="badge">' + esc(c.status || '進行中') + '</span>' +
        '<h3>' + esc(c.title) + '</h3>' +
        (c.note ? '<p style="color:var(--muted);margin:0">' + esc(c.note) + '</p>' : '') +
        stats +
        actions +
      '</div>' +
    '</div>';
  }).join('');
})();
