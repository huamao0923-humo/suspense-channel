export const meta = {
  name: 'real-sourcing',
  description: '真實素材踏查：查公開素材來源（三層授權）→ 寫 real-footage-sources.md＋seed.json → 自動跑 picker 灌 real-library',
  whenToUse: '研究階段備齊真實素材：對標頻道靠「研究時就把 bodycam/庭審/記者會/mugshot 來源＋授權找好存檔」堆出大量真實畫面。本 skill 把這步做進工作流。',
  phases: [
    { title: '踏查', detail: '查公開真實素材來源，三層風險分層，每筆查證 URL' },
    { title: '輸出與灌庫', detail: '寫 sources/seed → 跑 real-picker --auto 下載安全授權進 real-library' },
  ],
}

// args 必填：{ slug }；可選：{ title, country, year, note }
let c = args
if (typeof c === 'string') { try { c = JSON.parse(c) } catch (e) { c = {} } }
c = c || {}
const slug = c.slug || 'untitled-case'
const caseRef = JSON.stringify({ title: c.title, country: c.country, year: c.year, note: c.note })
log(`真實素材踏查：${c.title || slug}（slug: ${slug}）`)

phase('踏查')
const REAL_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    tiers: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          level: { type: 'number', description: '1=公共領域/官方 2=可授權 3=受版權(僅登錄不下載)' },
          label: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                material: { type: 'string', description: '素材描述' },
                type: { type: 'string', description: 'sketch/map/evidence/mugshot/press-conf/location/court-doc/news 等' },
                sourceUrl: { type: 'string', description: '已查證存在的來源連結；無法查證標「推測，待人工核」' },
                license: { type: 'string', description: '授權研判，如 Public Domain (Federal)、CC-BY-SA、受版權' },
                usage: { type: 'string', description: '可如何使用' },
                risk: { type: 'string', description: '極低/低/中/高' },
              },
              required: ['material', 'type', 'sourceUrl', 'license', 'usage', 'risk'],
            },
          },
        },
        required: ['level', 'label', 'items'],
      },
    },
    categories: { type: 'array', items: { type: 'string' }, description: '已查證存在的 Wikimedia Commons 分類名（不含 Category: 前綴）' },
    queries: { type: 'array', items: { type: 'string' }, description: '建議的 Commons 英文搜尋詞（真實場景/地點/物件/檔案，不含真人臉）。優先時代正確的檔案：當代報紙/卷宗/警方檔案/國家檔案館(如 Bundesarchiv)影像、年代久遠 PD 照' },
    avoidTerms: { type: 'array', items: { type: 'string' }, description: '下載時要排除的詞（時代錯置的現代地標/天際線、建築工地/開挖、近年街景與年份）。picker 與 render 會用它過濾。例：1929 年案件→["rheinturm","medienhafen","kniebrücke","construction","ausgrabung","2010","2015","2020","2024"]' },
    institutions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { name: { type: 'string' }, url: { type: 'string' }, license: { type: 'string' } },
        required: ['name', 'url', 'license'],
      },
      description: '官方機構直連（FBI/NIST/法院/FOIA 等），含授權研判',
    },
  },
  required: ['tiers', 'categories', 'queries', 'avoidTerms', 'institutions'],
}
const scout = await agent(
  `你是懸案頻道的素材研究員。先讀 brand/legal-redlines.md（§4 去識別、§5 版權）。\n` +
  `用 WebSearch/WebFetch 踏查這樁【國外】案件可用的真實影像素材來源：${caseRef}\n` +
  `依風險三層整理（對齊製作自律準則，非法律意見）：\n` +
  `  第一層 公共領域/官方：聯邦作品(FBI/NIST=PD)、公開法院/FOIA 卷宗、Wikimedia Commons PD/CC0、歷史 PD 影像（年代久遠者）。\n` +
  `  第二層 可授權：Commons CC-BY/CC-BY-SA（須署名）、Google 街景。\n` +
  `  第三層 受版權新聞/影視：僅「登錄」供人工合理使用判斷，不下載；他人紀錄片禁用。\n` +
  `鐵則：你列出的每個 sourceUrl 必須用 WebFetch/WebSearch 實際查證存在；查不到的標「推測，待人工核」，嚴禁編造分類名/檔名/連結。\n` +
  `★時代正確性（最重要）：本案是【${c.year || '某年代'}】的案件。素材要貼合那個年代——優先當代報紙/法院卷宗/警方檔案/國家檔案館(如 Bundesarchiv)影像、年代久遠的 PD 照與時代地點舊照。\n` +
  `  像 ${'`'}城市名${'`'} 這種泛分類在 Commons 多半被現代照（電視塔、現代橋、媒體港、建築工地/開挖、近年街景）灌滿——這些一律不要。queries 要夠精準（加年代、加「historic/old/archive/Bundesarchiv」等限定詞），別只丟城市名。\n` +
  `另外給出：categories（已查證存在的 Commons 分類名）、queries（精準英文搜尋詞，含時代限定）、avoidTerms（要排除的現代地標/工地/近年年份詞，picker 與 render 會用來過濾）。`,
  { label: 'real-scout', phase: '踏查', agentType: 'Explore', schema: REAL_SCHEMA }
)

phase('輸出與灌庫')
if (scout) {
  await agent(
    `把以下真實素材踏查結果寫成兩個檔（資料夾不存在請建立）：\n` +
    `1) cases/${slug}/real-footage-sources.md：先讀 assets/golden-state-killer/real-footage-sources.md 沿用其【三層風險分層】格式與開頭免責聲明（製作自律準則，非法律意見；發布前一律人工確認授權），逐層列素材表（素材/類型/來源連結/授權/可如何使用/風險）。結尾加「與 CLI 整合」段：列出 categories 與 queries，並附可直接複製的指令 \`node tools/real-picker.mjs --slug ${slug} --auto\`（自動下載安全授權）與 \`node tools/real-picker.mjs --slug ${slug} --category "<分類>"\`（互動精挑）。\n` +
    `2) assets/${slug}/real-library/seed.json：嚴格輸出 JSON＝{ "categories": [...], "queries": [...], "avoidTerms": [...], "institutions": [...] }，內容照下方資料，不要加註解。\n\n` +
    `踏查資料(JSON)：\n${JSON.stringify(scout, null, 2)}`,
    { label: 'write:real-sources', phase: '輸出與灌庫', agentType: 'general-purpose' }
  )
  // 自動灌庫：跑 picker --auto，把第一層安全授權（PD/CC0/聯邦/CC-BY/SA）直接下載進 real-library
  await agent(
    `執行終端指令：node tools/real-picker.mjs --slug ${slug} --auto\n` +
    `這會讀 assets/${slug}/real-library/seed.json，把 Wikimedia Commons 授權安全的真實素材下載進 real-library 並回填 MANIFEST.csv（clearance=🟡）。\n` +
    `照實回報下載成功/失敗數量；若分類不存在或無候選，照實說，不要編造。第三層受版權素材不在自動範圍。`,
    { label: 'auto-populate', phase: '輸出與灌庫', agentType: 'general-purpose' }
  )
}

return { slug, categories: (scout && scout.categories) || [], queries: (scout && scout.queries) || [] }
