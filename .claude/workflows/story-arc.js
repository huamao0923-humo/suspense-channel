export const meta = {
  name: 'story-arc',
  description: '故事編排：依研究與查核，產出起承轉合 beat-sheet（懸念鉤子＋反轉點＋解說員 cutaway 位置），供 script-studio 依循',
  phases: [
    { title: '多版編排', detail: '冷開場/反轉/情緒 三種編排思路並行起草 beat-sheet' },
    { title: '評審', detail: '並行評分各 beat-sheet（鉤子/節奏/反轉強度/忠於 factcheck），選最佳' },
    { title: '綜合定稿', detail: '融合最佳版，寫 cases/<slug>/story-arc.md' },
  ],
}

// args 必填：{ slug }；可選：{ lengthMin=35 }
// 防護：args 可能以 JSON 字串送入，需先解析
let cfg = args
if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch (e) { cfg = {} } }
cfg = cfg || {}
const slug = cfg.slug || 'untitled-case'
const lengthMin = cfg.lengthMin || 35
log(`為 ${slug} 編排 ${lengthMin} 分鐘故事結構（起承轉合＋懸念＋反轉）`)

// 三種編排思路（成本控制：先 2–3 種）
const ANGLES = [
  { key: '冷開場最大化', brief: '把全片最反直覺的畫面/事實提到最前，先製造最大謎團，後面層層回填' },
  { key: '反轉驅動', brief: '以 factcheck 中 2–3 個反直覺已證實事實為支點，整片圍繞「你以為…其實…」鋪設反轉' },
  { key: '情緒曲線', brief: '依被害者—加害者—體制三層，讓情緒從不安→憤怒→寒意逐步推進，反思收束' },
]

phase('多版編排')
const drafts = (await parallel(ANGLES.map(a => () =>
  agent(
    `你是懸案頻道的故事結構師（story editor），不是寫稿員。依序讀取：cases/${slug}/dossier.md、cases/${slug}/factcheck.md、brand/voice-guide.md（懸疑與反轉技法）。\n` +
    `用「${a.key}」思路（${a.brief}）為一支約 ${lengthMin} 分鐘的影片設計 beat-sheet（故事編排藍圖，不是旁白稿）。\n` +
    `必須產出：\n` +
    `1) 一句話定位；2) 冷開場鉤子（拋謎不解答）；3) 起承轉合分幕——每幕標明：目的、情緒、用到的關鍵已證實事實、對應旁白段落（[01][02]…）；\n` +
    `4) 懸念鉤子清單（每幕收尾一句「但…／然而…」往下一段拉）；\n` +
    `5) 反轉點 2–3 個——每個反轉**必須是 factcheck 標為「已證實」的反直覺事實**，註明來源依據；嚴禁編造或用未證實項當反轉；\n` +
    `6) 解說員 Pilot 的 3–4 次 cutaway（開頭與結尾必有）：位置（[HOST-01] 開場＝自我介紹＋背景，結尾以「現在讓我們回到 <案發年份> 年那個 <季節>」帶入正片（年份照案件實際填，19XX 或 20XX 皆可，季節依案件）；1–2 個 act 邊界轉場；[HOST-結尾]）＋各自功能＋一句台詞方向（不寫完整台詞）。另標出：開場後的「打字機日期卡 [INTRO]」要顯示哪個日期與地點，以及片尾 [ENDING] 的「懸念問句」方向。\n` +
    `7) 若案件牽涉明確地理位置：標出可放「地圖串場」（從全國快速縮放到該地區）的段落與該地點名稱。\n` +
    `硬規則：所有事實不得超出 factcheck「已證實」；未定讞者以「涉嫌」描述。直接輸出完整 beat-sheet（markdown，無前言）。`,
    { label: `arc:${a.key}`, phase: '多版編排', agentType: 'Explore' }
  ).then(text => ({ angle: a.key, text }))
))).filter(Boolean)

phase('評審')
const SCORE = {
  type: 'object', additionalProperties: false,
  properties: {
    hook: { type: 'number', description: '冷開場鉤子強度 1-10' },
    pacing: { type: 'number', description: '起承轉合節奏 1-10' },
    twist: { type: 'number', description: '反轉力道且忠於已證實事實 1-10' },
    faithfulness: { type: 'number', description: '忠於 factcheck、無編造 1-10' },
    hostUse: { type: 'number', description: '解說員 cutaway 安排是否到位 1-10' },
    total: { type: 'number', description: '加權總分 1-10' },
    comment: { type: 'string' },
  },
  required: ['hook', 'pacing', 'twist', 'faithfulness', 'hostUse', 'total', 'comment'],
}

const judged = (await parallel(drafts.map(d => () =>
  agent(
    `你是嚴格的故事結構評審。先讀 cases/${slug}/factcheck.md 與 brand/voice-guide.md。\n` +
    `為以下「${d.angle}」beat-sheet 打分（各 1-10）：冷開場鉤子、起承轉合節奏、反轉力道（且必須來自已證實事實）、忠於 factcheck、解說員安排，給加權 total 與評語。\n\nbeat-sheet：\n${d.text}`,
    { label: `judge:${d.angle}`, phase: '評審', agentType: 'Explore', schema: SCORE }
  ).then(s => ({ ...d, ...s }))
))).filter(Boolean)

judged.sort((a, b) => (b.total || 0) - (a.total || 0))
const winner = judged[0]
const others = judged.slice(1)
log(`最佳編排：${winner.angle}（總分 ${winner.total}）`)

phase('綜合定稿')
await agent(
  `你是懸案頻道的故事總監。讀取 cases/${slug}/factcheck.md、brand/voice-guide.md、brand/host-character.md。\n` +
  `以下是評分最高的 beat-sheet（${winner.angle}）與其他版本評語。以最佳版為主體，擷取其他版亮點，融合成一份**定稿故事編排**。\n` +
  `把它寫入 cases/${slug}/story-arc.md，固定包含這些小節（markdown）：\n` +
  `## 一句話定位\n## 冷開場鉤子\n## 分幕（起承轉合）\n（逐幕：目的｜情緒｜關鍵已證實事實｜對應旁白段落）\n## 懸念鉤子\n## 反轉點\n（每個反轉註明 factcheck 來源依據；只用已證實事實）\n## 解說員 Pilot cutaway（3–4 次）\n（位置｜功能｜一句台詞方向；[HOST-01] 結尾須帶「回到 <案發年份> 年」（年份照案件填，19XX/20XX 皆可）；標出 [INTRO] 日期地點與 [ENDING] 懸念問句方向）\n## 地圖串場（如有牽涉地區）\n（段落位置＋地點名稱）\n## 給 script-studio 的指示\n（明確說明 [HOST-01]/[INTRO]/轉場/[HOST-結尾]/[ENDING] 該放在哪兩段之間、每幕對應哪些旁白段落、各正片段建議的畫面類型）\n` +
  `硬規則：所有事實不得超出 factcheck「已證實」，未定讞者用「涉嫌」，不得編造。\n` +
  `寫檔後，只輸出 story-arc.md 的完整正文（不要附加說明）。\n\n` +
  `最佳版：\n${winner.text}\n\n其他版評語：\n${others.map(o => `【${o.angle}｜${o.total}】${o.comment}`).join('\n')}`,
  { label: 'synthesize:arc', phase: '綜合定稿', agentType: 'general-purpose' }
)

return { slug, winner: winner.angle, scores: judged.map(j => ({ angle: j.angle, total: j.total })) }
