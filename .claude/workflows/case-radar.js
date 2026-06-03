export const meta = {
  name: 'case-radar',
  description: '選題雷達：多軌搜尋國外懸案候選 → 批次評分 → 排序寫入 pipeline/radar-shortlist.md',
  phases: [
    { title: '掃描', detail: '4 條搜尋角度並行找候選，loop 到累積足量' },
    { title: '評分', detail: '批次評分（每 agent 一次評多個候選）' },
    { title: '輸出', detail: '排序並寫入 radar-shortlist.md（人工關卡1）' },
  ],
}

// args 可選：{ target:候選目標數=10, maxRounds:最多搜尋輪=2 }
// 防護：args 可能以 JSON 字串送入，需先解析
let A = args
if (typeof A === 'string') { try { A = JSON.parse(A) } catch (e) { A = {} } }
A = A || {}
const target = A.target || 10
const maxRounds = A.maxRounds || 2

const FIND_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string', description: '案件中文名稱' },
          country: { type: 'string' },
          year: { type: 'string' },
          hook: { type: 'string', description: '一句話鉤子' },
          status: { type: 'string', description: '法律狀態：已定讞/上訴中/未解等' },
          sources: { type: 'array', items: { type: 'string' }, description: '1-3 個可點擊來源連結' },
        },
        required: ['title', 'country', 'year', 'hook', 'status', 'sources'],
      },
    },
  },
  required: ['candidates'],
}

const ANGLES = [
  { key: '近期翻案', focus: '近 5 年有新事證、DNA 突破或翻案/新判決的國外舊案' },
  { key: '知名失蹤', focus: '國外知名且資料充足的未解失蹤案' },
  { key: '離奇命案', focus: '國外高戲劇張力、有反轉或謎團的命案' },
  { key: '連環犯罪', focus: '國外連環/連續犯罪、已定讞且年代較遠者' },
]

phase('掃描')
const seen = new Set()
const pool = []
let round = 0
while (pool.length < target && round < maxRounds) {
  round++
  const batches = await parallel(ANGLES.map(a => () =>
    agent(
      `你是懸案頻道的選題研究員。先讀取 brand/channel-identity.md 的「選題標準」表與 brand/legal-redlines.md。\n` +
      `用 WebSearch/WebFetch 搜尋【國外】懸案候選，搜尋角度：${a.focus}。\n` +
      `要求：繁中受眾會有興趣、資料可查證、適合做 30-50 分鐘推理長片。每個候選附 1-3 個可點擊來源連結。\n` +
      `避免：台灣本地案件、以未成年為核心、純進行中偵查的爭議案。\n` +
      `這是第 ${round} 輪，請盡量提出與常見清單不同的新案件。回傳 4-6 個候選。`,
      { label: `finder:${a.key}#${round}`, phase: '掃描', agentType: 'Explore', schema: FIND_SCHEMA }
    )))
  for (const b of batches.filter(Boolean)) {
    for (const c of (b.candidates || [])) {
      const k = (String(c.title) + '|' + String(c.country)).toLowerCase().trim()
      if (!seen.has(k)) { seen.add(k); pool.push(c) }
    }
  }
  log(`第 ${round} 輪後累積 ${pool.length}/${target} 個不重複候選`)
}

phase('評分')
// 成本控制：批次評分，每個 agent 一次評 SGROUP 個候選
const SCORE_BATCH = {
  type: 'object', additionalProperties: false,
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title: { type: 'string' },
          drama: { type: 'number', description: '戲劇張力 1-10' },
          sourcing: { type: 'number', description: '資料充足度 1-10' },
          uniqueness: { type: 'number', description: '獨特性 1-10' },
          legalSafety: { type: 'number', description: '法律隱私安全度 1-10（越高越安全）' },
          resonance: { type: 'number', description: '中文受眾共鳴 1-10' },
          total: { type: 'number', description: '加權總分 1-10' },
          rationale: { type: 'string' },
          redFlags: { type: 'string', description: '疑慮，無則寫「無」' },
        },
        required: ['title', 'drama', 'sourcing', 'uniqueness', 'legalSafety', 'resonance', 'total', 'rationale', 'redFlags'],
      },
    },
  },
  required: ['scores'],
}
const SGROUP = 6
const sgroups = []
for (let i = 0; i < pool.length; i += SGROUP) sgroups.push(pool.slice(i, i + SGROUP))
const rawScores = (await parallel(sgroups.map((grp, gi) => () =>
  agent(
    `你是懸案頻道的選題評審。先讀取 brand/channel-identity.md 的選題標準表與 brand/legal-redlines.md。\n` +
    `為下列每個候選打分（各維度 1-10、加權 total、簡短理由與 red flags），逐筆回傳 scores（每筆含對應 title）。\n` +
    `候選：\n${JSON.stringify(grp.map(x => ({ title: x.title, country: x.country, year: x.year, hook: x.hook, status: x.status })), null, 2)}`,
    { label: `score#${gi + 1}`, phase: '評分', agentType: 'Explore', schema: SCORE_BATCH }
  )
))).filter(Boolean).flatMap(r => (r.scores || []))

const byTitle = new Map(pool.map(x => [String(x.title), x]))
const scored = rawScores.map(s => ({ ...(byTitle.get(String(s.title)) || {}), ...s })).filter(x => x.title)
const ranked = scored.sort((a, b) => (b.total || 0) - (a.total || 0))

phase('輸出')
await agent(
  `把以下排序後的選題候選寫成一份繁中 markdown 清單，存到 pipeline/radar-shortlist.md（覆蓋既有內容）。\n` +
  `最上方：標題、一句說明，並提醒使用者「在想做的案件前把 [ ] 改成 [x]，再對該案跑 deep-research」。\n` +
  `接著一個表格欄位：勾選 | 排名 | 案件 | 國家 | 年份 | 法律狀態 | 總分 | 一句鉤子。\n` +
  `表格下方，每個案件附一小段：評分細項（drama/sourcing/uniqueness/legalSafety/resonance）、理由、red flags、來源連結。\n` +
  `資料如下（JSON，已依 total 由高到低排序）：\n${JSON.stringify(ranked, null, 2)}`,
  { label: 'write:shortlist', phase: '輸出', agentType: 'general-purpose' }
)

return { count: ranked.length, top: ranked.slice(0, 5).map(r => ({ title: r.title, total: r.total })) }
