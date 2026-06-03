export const meta = {
  name: 'script-studio',
  description: '腳本生成：多角度草稿 → 評審 → 綜合+法律改寫（含解說員段、每段畫面標籤、打字機開場、片尾）→ 校稿 → 寫自然稿與法律審查（TTS 稿改由 script-tts 於定稿後生成）',
  phases: [
    { title: '多角度草稿', detail: '懸疑/時間線 兩種敘事並行起草' },
    { title: '評審', detail: '並行評分各草稿，選出最佳' },
    { title: '綜合與法律改寫', detail: '融合最佳稿、依紅線改寫、插入解說員 cutaway／打字機開場／片尾、逐段標畫面類型，寫自然稿與法律審查' },
    { title: '校稿', detail: '逐段偵測不通順、重複句、重複段落，自動修正並輸出報告' },
  ],
}

// args 必填：{ slug }；可選：{ lengthMin=35 }
// 防護：args 可能以 JSON 字串送入，需先解析
let cfg = args
if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch (e) { cfg = {} } }
cfg = cfg || {}
const slug = cfg.slug || 'untitled-case'
const lengthMin = cfg.lengthMin || 35
log(`為 ${slug} 生成 ${lengthMin} 分鐘腳本`)

// 成本控制：預設 2 種敘事路線（要更多元可加回「推理視角」）
const ANGLES = [
  { key: '懸疑鋪陳', brief: '冷開場丟出最大謎團，層層揭露，懸念驅動' },
  { key: '時間線推進', brief: '嚴格依時序推進，讓觀眾跟著案情同步前進' },
]

phase('多角度草稿')
const drafts = (await parallel(ANGLES.map(a => () =>
  agent(
    `你是懸案頻道的腳本作家。依序讀取：cases/${slug}/story-arc.md（故事編排藍圖，若存在）、cases/${slug}/dossier.md、cases/${slug}/factcheck.md、brand/voice-guide.md、brand/legal-redlines.md。\n` +
    `**若 cases/${slug}/story-arc.md 存在：嚴格依其分幕（起承轉合）、懸念鉤子、反轉點與段落對應來鋪陳**，再以「${a.key}」敘事路線（${a.brief}）潤色；若不存在，才依 voice-guide 六段結構自行編排。\n` +
    `寫一份約 ${lengthMin} 分鐘的繁中旁白草稿。\n` +
    `硬規則：內容不得超出 factcheck 標為「已證實」的事實，「有爭議/未證實」項須在旁白中明示其不確定；未定讞者用「涉嫌」；加入 [停頓][加重] 等演播提示。\n` +
    `直接輸出完整草稿全文（不要任何前言或說明）。`,
    { label: `draft:${a.key}`, phase: '多角度草稿', agentType: 'Explore' }
  ).then(text => ({ angle: a.key, text }))
))).filter(Boolean)

phase('評審')
const SCORE = {
  type: 'object', additionalProperties: false,
  properties: {
    hook: { type: 'number', description: '開場鉤子 1-10' },
    pacing: { type: 'number', description: '節奏 1-10' },
    clarity: { type: 'number', description: '推理清晰 1-10' },
    emotion: { type: 'number', description: '情緒感染 1-10' },
    faithfulness: { type: 'number', description: '忠於 factcheck 1-10' },
    legalSafety: { type: 'number', description: '法律安全用語 1-10' },
    total: { type: 'number', description: '加權總分 1-10' },
    comment: { type: 'string' },
  },
  required: ['hook', 'pacing', 'clarity', 'emotion', 'faithfulness', 'legalSafety', 'total', 'comment'],
}

const judged = (await parallel(drafts.map(d => () =>
  agent(
    `你是嚴格的腳本評審。先讀 cases/${slug}/factcheck.md 與 brand/voice-guide.md。\n` +
    `為以下「${d.angle}」草稿打分（各 1-10）：開場鉤子、節奏、推理清晰、情緒感染、忠於 factcheck、法律安全，給加權 total 與評語。\n\n草稿：\n${d.text}`,
    { label: `judge:${d.angle}`, phase: '評審', agentType: 'Explore', schema: SCORE }
  ).then(s => ({ ...d, ...s }))
))).filter(Boolean)

judged.sort((a, b) => (b.total || 0) - (a.total || 0))
const winner = judged[0]
const others = judged.slice(1)
log(`最佳草稿：${winner.angle}（總分 ${winner.total}）`)

phase('綜合與法律改寫')
const finalNatural = await agent(
  `你是懸案頻道的主筆兼法律把關。讀取 cases/${slug}/story-arc.md（若存在）、cases/${slug}/factcheck.md、brand/voice-guide.md、brand/legal-redlines.md、brand/host-character.md。\n` +
  `以下是評分最高的草稿（${winner.angle}）與其他草稿評語。以最佳稿為主體，擷取其他稿亮點，融合成一份定稿自然旁白。\n` +
  `接著嚴格依 legal-redlines 逐句把關並改寫（涉嫌/被動語態/引用判決/去識別/事實與推測分離）。\n` +
  `解說員段（全片 3–4 次，開頭與結尾必有）：依 host-character.md，在 act 邊界插入解說員 Pilot 全螢幕 cutaway——[HOST-01] 開場（自我介紹＋講案件背景，**結尾必須以一句「現在讓我們回到 <案發年份> 年那個 <季節>」帶入正片**，年份與季節取自 factcheck，年份照案件實際填（19XX 或 20XX 皆可），季節依案件未必是冬天）、1–2 個段落轉場（一句收束＋一句懸念）、[HOST-結尾]（收束＋簽名）。**若 story-arc.md 存在，解說員的插入位置、功能與台詞方向一律依其「解說員 cutaway」小節**。每段標題「## [HOST-XX] 解說員 — <功能>」，下一行加「> 〔解說員出鏡 cutaway〕全螢幕｜主參考圖 brand/assets/host-reference.png｜估時 X 秒」；台詞用簽名聲線語氣、同受 legal-redlines 約束、不得超出 factcheck。\n` +
  `打字機開場 [INTRO]：在 [HOST-01] 之後、第一個正片段之前，插入一段「## [INTRO] 打字機日期卡」，下一行「> 〔畫面：黑屏打字機｜逐字浮現〕」，再用 1–2 行純文字寫日期與地點（如「1979 年 2 月」「加州 山區」，取自 factcheck，無台詞）。\n` +
  `片尾 [ENDING]：在 [HOST-結尾] 之後，插入「## [ENDING] 片尾」，內含三行引言：「> 〔懸念問句〕……」（一句發人深省／懸而未決的問句）、「> 〔畫面：真實案件圖片／庭審影片〕」、「> 〔謝幕〕……」（電影謝幕式感謝詞）。\n` +
  `每段畫面類型（**僅正片敘事段 [00][01]… 需要**，解說員/INTRO/ENDING 不需）：在每個正片段標題下一行加「> 〔畫面：A＋B〕」，A/B 從這幾項複選：調用影片、真實圖片、生成圖片、生成圖表、地圖。\n` +
  `**核心原則＝能用真實就用真實（real-first）**：場景/地點/建築/街景/物件/檔案/時代影像 → **真實圖片**或**調用影片**（優先實拍影片）；**只有會露出真實被害人/嫌疑人臉孔、或真實暴力情節的段，才用生成圖片（AI 示意，去識別）**；人物關係或時間線 → 生成圖表；牽涉地理位置、需要「從全國快速縮放到該地區」的轉場段 → 地圖。多選時把真實類放前面（real-first）。**地圖段務必用正規「## [數字]」段落標頭（不要用「## 地圖串場」這類無編號標題，會被解析器忽略），且該段旁白宜短（1–2 句帶出地點即可），全集至多 1–2 個地圖段**；地點取自 [INTRO] 或 cases/<slug>/map.json。\n` +
  `段落標頭規範：正片用「## [數字]」、解說員用「## [HOST-XX]」、開場卡「## [INTRO]」、片尾「## [ENDING]」；分幕分隔可用「## ACT N：…」（會被渲染忽略，僅供閱讀）。\n` +
  `任務：\n` +
  `1) 將定稿自然稿（含解說員段、[INTRO]、[ENDING]、每段畫面標籤）寫入 cases/${slug}/script-natural.md（用 templates/script.md 結構，含演播提示）。\n` +
  `2) 將法律審查寫入 cases/${slug}/legal-review.md：逐項列出你改寫掉的「斷言未定罪者有罪」風險句、去識別處理、未證實主張的標示方式，以及殘留風險提醒與案件法律狀態；解說員台詞同樣逐句納入審查。\n` +
  `3) **不要產生 TTS 稿**——TTS 稿改由人工在腳本頁定稿後另跑 script-tts 生成。\n` +
  `4) 依 real-first 原則，產 cases/${slug}/real-subjects.json＝{ 旁白段 narrIndex（從 0 起算，僅數正片段）: ["真實搜尋詞", ...] }，為每個『真實圖片/調用影片』段填 2 個該案真實場景/地點/建築/物件/檔案的英文搜尋詞（**不含真人臉**，供 make-demo 去 Wikimedia Commons 抓真實素材）；人物/抽象段不必列。\n` +
  `5) 最後，只輸出 script-natural.md 的完整正文（不要附加說明）。\n\n` +
  `最佳稿：\n${winner.text}\n\n其他稿評語：\n${others.map(o => `【${o.angle}｜${o.total}】${o.comment}`).join('\n')}`,
  { label: 'synthesize+legal', phase: '綜合與法律改寫', agentType: 'general-purpose' }
)

phase('校稿')
await agent(
  `讀 cases/${slug}/script-natural.md，逐段進行以下校稿：
  1. 找不通順或語義重複的句子（例：連續兩句幾乎同義、主詞重複累贅、語序倒裝影響理解）
  2. 偵測跨段落重複——旁白內容高度相似（>60%）即為重複段，列出段號
  3. 偵測同一 [HOST-XX] / [數字] 標頭出現兩次以上（段落 ID 重複生成）
  修正後直接覆寫 cases/${slug}/script-natural.md（保留所有 ## 標頭、> 畫面標籤、[INTRO][ENDING] 結構不動，只修改旁白本文）。
  同時產 cases/${slug}/proofreading.md，格式如下：
  ## 校稿報告
  ### 修改清單
  - [段號] 原句 → 改後句（一行一條，簡述改因）
  ### 偵測到的重複段
  - （若有）段號 + 重複描述；若無則寫「無」
  ### 剩餘疑慮
  - （若有）列出改不動或需人工判斷的項目；若無則寫「無」`,
  { label: 'proofread', phase: '校稿', agentType: 'general-purpose' }
)

return { slug, winner: winner.angle, scores: judged.map(j => ({ angle: j.angle, total: j.total })), natural: finalNatural.length }
