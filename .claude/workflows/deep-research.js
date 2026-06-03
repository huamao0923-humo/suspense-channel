export const meta = {
  name: 'deep-research',
  description: '深度研究+事實查核+真實素材踏查：分面並行研究 → 批次對抗式查核 → 寫 dossier/factcheck → 踏查真實素材並自動灌庫',
  phases: [
    { title: '多軌研究', detail: '6 個分面並行研究，每項附來源' },
    { title: '事實查核', detail: '抽取關鍵主張，批次對抗式查證' },
    { title: '輸出', detail: '寫入 cases/<slug>/dossier.md 與 factcheck.md' },
    { title: '真實素材踏查', detail: '查公開素材來源 → 寫 real-footage-sources.md＋seed.json → 自動灌 real-library' },
  ],
}

// args 必填：{ slug, title }；可選：{ country, year, note, claimCap=18 }
// 防護：args 可能以 JSON 字串送入，需先解析
let c = args
if (typeof c === 'string') { try { c = JSON.parse(c) } catch (e) { c = {} } }
c = c || {}
const slug = c.slug || 'untitled-case'
const caseRef = JSON.stringify({ title: c.title, country: c.country, year: c.year, note: c.note })
log(`研究案件：${c.title || slug}（slug: ${slug}）`)

const FACETS = [
  { key: '時間線', focus: '完整事件時間線（日期 → 事件），嚴格按時序' },
  { key: '人物關係', focus: '受害者、嫌疑人、調查者、證人及其關係（未定讞者標「涉嫌」、未成年用代號）' },
  { key: '證據鑑識', focus: '物證、鑑識結果、關鍵證據與其可靠性' },
  { key: '警方司法歷程', focus: '報案、調查、起訴、判決、上訴歷程，附判決書/起訴書出處' },
  { key: '理論爭議', focus: '各方理論與爭議點，每個理論標明出處（一律視為推測）' },
  { key: '社會背景', focus: '案件的社會、文化、地理背景脈絡' },
]

const RESEARCH_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    facet: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          point: { type: 'string' },
          sources: { type: 'array', items: { type: 'string' }, description: '可點擊來源連結' },
        },
        required: ['point', 'sources'],
      },
    },
    keyClaims: { type: 'array', items: { type: 'string' }, description: '本面向需要查核的關鍵事實主張' },
  },
  required: ['facet', 'findings', 'keyClaims'],
}

phase('多軌研究')
const research = (await parallel(FACETS.map(f => () =>
  agent(
    `你是懸案頻道的研究員。先讀取 brand/legal-redlines.md。\n` +
    `用 WebSearch/WebFetch 深入研究這樁【國外】案件：${caseRef}\n` +
    `研究面向：${f.focus}\n` +
    `規則：每條 finding 附可點擊來源；未定讞者用「涉嫌」；嚴禁編造日期/姓名/來源。把本面向需查核的關鍵主張列入 keyClaims。`,
    { label: `research:${f.key}`, phase: '多軌研究', agentType: 'Explore', schema: RESEARCH_SCHEMA }
  )
))).filter(Boolean)

// 收集並去重關鍵主張
const claimSet = new Set()
const claims = []
for (const r of research) {
  for (const cl of (r.keyClaims || [])) {
    const k = String(cl).trim().toLowerCase()
    if (k && !claimSet.has(k)) { claimSet.add(k); claims.push(cl) }
  }
}
const CLAIM_CAP = c.claimCap || 18
const toVerify = claims.slice(0, CLAIM_CAP)
if (claims.length > CLAIM_CAP) log(`關鍵主張共 ${claims.length} 條，查核前 ${CLAIM_CAP} 條`)
else log(`抽取出 ${toVerify.length} 條關鍵主張待查核`)

phase('事實查核')
// 成本控制：批次查核，每個 agent 一次查 VGROUP 條主張
const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          claim: { type: 'string' },
          status: { type: 'string', enum: ['已證實', '有爭議', '未證實'] },
          support: { type: 'array', items: { type: 'string' }, description: '支持來源連結' },
          against: { type: 'string', description: '反證或疑點，無則寫「無」' },
          note: { type: 'string' },
        },
        required: ['claim', 'status', 'support', 'against', 'note'],
      },
    },
  },
  required: ['verdicts'],
}
const VGROUP = 6
const cgroups = []
for (let i = 0; i < toVerify.length; i += VGROUP) cgroups.push(toVerify.slice(i, i + VGROUP))
const verdicts = (await parallel(cgroups.map((grp, gi) => () =>
  agent(
    `你是嚴格的事實查核員，預設懷疑。針對以下關於案件「${c.title || slug}」的多條主張，逐條用 WebSearch/WebFetch 找硬來源或加以反駁，回傳 verdicts 陣列（每筆含原 claim）。\n` +
    `判定規則：有判決書/官方文件/兩個以上信譽新聞 → 已證實；來源互相矛盾 → 有爭議；找不到硬來源或僅單一說法 → 未證實（預設）。\n` +
    `主張：\n${grp.map((x, i) => `${i + 1}. ${x}`).join('\n')}`,
    { label: `verify#${gi + 1}`, phase: '事實查核', agentType: 'Explore', schema: VERDICT_SCHEMA }
  )
))).filter(Boolean).flatMap(r => (r.verdicts || []))

phase('輸出')
await parallel([
  () => agent(
    `把以下研究資料整理成案件檔案，存到 cases/${slug}/dossier.md（資料夾不存在請建立）。\n` +
    `先讀取 templates/case-dossier.md 沿用其結構，並讀 brand/legal-redlines.md 確保用語安全（涉嫌/被動語態/去識別）。\n` +
    `案件基本資料：${caseRef}\n研究資料(JSON)：\n${JSON.stringify(research, null, 2)}`,
    { label: 'write:dossier', phase: '輸出', agentType: 'general-purpose' }
  ),
  () => agent(
    `把以下查核結果整理成事實查核報告，存到 cases/${slug}/factcheck.md（資料夾不存在請建立）。\n` +
    `先讀取 templates/factcheck.md 沿用其結構（狀態圖例、明細表、高風險主張、結論）。\n` +
    `查核資料(JSON)：\n${JSON.stringify(verdicts, null, 2)}`,
    { label: 'write:factcheck', phase: '輸出', agentType: 'general-purpose' }
  ),
])

// ── 真實素材踏查：委派給 real-sourcing skill（研究時就備齊真實素材來源＋授權並自動灌庫）──
let realResult = null
try { realResult = await workflow('real-sourcing', { slug, title: c.title, country: c.country, year: c.year, note: c.note }) }
catch (e) { log(`real-sourcing 委派失敗（不影響研究產出）：${e.message || e}`) }

const counts = { 已證實: 0, 有爭議: 0, 未證實: 0 }
for (const v of verdicts) counts[v.status] = (counts[v.status] || 0) + 1
return { slug, facets: research.length, claimsVerified: verdicts.length, counts, realCategories: (realResult && realResult.categories) || [] }
