export const meta = {
  name: 'production-package',
  description: '製作包：拆段 → 批次分鏡+配圖提示詞 → 並行產縮圖/標題/SEO/來源',
  phases: [
    { title: '拆解', detail: '把定稿腳本切成場景段落' },
    { title: '分鏡與配圖', detail: '批次：每 agent 一次處理多段（分鏡+配圖提示詞）' },
    { title: '整片資產', detail: '並行產縮圖brief/標題SEO/來源清單/解說員出場表' },
    { title: '組裝', detail: '寫入 cases/<slug>/production/' },
  ],
}

// args 必填：{ slug }；可選：{ groupSize=5 }
// 防護：args 可能以 JSON 字串送入，需先解析
let cfg = args
if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch (e) { cfg = {} } }
cfg = cfg || {}
const slug = cfg.slug || 'untitled-case'
log(`為 ${slug} 產出製作包`)

phase('拆解')
const SEG_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    segments: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string', description: '段落編號如 00、01' },
          heading: { type: 'string', description: '段落小標' },
          excerpt: { type: 'string', description: '該段旁白原文（可節錄關鍵句）' },
        },
        required: ['id', 'heading', 'excerpt'],
      },
    },
  },
  required: ['segments'],
}
const segData = await agent(
  `讀取 cases/${slug}/script-natural.md。把這份旁白稿切成連續的場景段落（依小標或語意，約 10-16 段）。每段給 id、heading、excerpt（該段旁白原文，長段可節錄關鍵句）。\n` +
  `排除所有 [HOST-XX] 解說員 cutaway 段落——它們由 character-shots.md 另行處理，不進分鏡表。`,
  { label: 'segment', phase: '拆解', agentType: 'Explore', schema: SEG_SCHEMA }
)
const segs = (segData && segData.segments) || []
log(`腳本切成 ${segs.length} 段`)

phase('分鏡與配圖')
// 成本控制：每個 agent 一次處理 groupSize 段，且合併「分鏡 + 配圖提示詞」兩件事
const ITEM_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' },
          heading: { type: 'string' },
          shot: { type: 'string', description: '畫面描述' },
          camera: { type: 'string', description: '鏡頭/動態' },
          materialType: { type: 'string', description: 'AI圖 / B-roll / 地圖 / 時間軸 / 檔案 / AI角色' },
          estSec: { type: 'number', description: '估計秒數' },
          imagePrompt: { type: 'string', description: '英文 Midjourney/SD 提示詞（以 visual-style 基底為底）' },
          brollNeed: { type: 'string', description: '需要的真實素材與公開來源建議，無則寫「無」' },
        },
        required: ['id', 'heading', 'shot', 'camera', 'materialType', 'estSec', 'imagePrompt', 'brollNeed'],
      },
    },
  },
  required: ['items'],
}
const GROUP = cfg.groupSize || 5
const groups = []
for (let i = 0; i < segs.length; i += GROUP) groups.push(segs.slice(i, i + GROUP))
const pkgGroups = await parallel(groups.map((g, gi) => () =>
  agent(
    `你是懸案頻道的分鏡師＋配圖提示詞工程師。先讀一次 brand/visual-style.md（英文 base prompt、禁忌、與「素材配比目標」表）。\n` +
    `為下列每個腳本段落各做兩件事：(1) 設計一個畫面（faceless、暗色紀錄片感、不還原真實人臉）；(2) 產一條完整英文配圖提示詞（以 base prompt 起頭），並標出是否需要真實素材。逐段回傳 items（含 id、heading）。\n` +
    `配比鐵則：整批 materialType 的分布要逼近配比目標（真實素材30-40% / Stock B-roll 30-40% / 動畫(地圖·時間軸)20-25%）。能用真實就標真實錨點；填充與轉場段才用 Stock；抽象資訊（地理·序列·關係）用動畫。brollNeed 請寫清楚是「真實錨點(指明 mugshot/bodycam/庭審/街景/剪報等＋建議公開來源)」還是「Stock 氛圍(可用影片庫關鍵詞)」。\n` +
    `段落：\n${JSON.stringify(g.map(s => ({ id: s.id, heading: s.heading, excerpt: s.excerpt })), null, 2)}`,
    { label: `shots#${gi + 1}`, phase: '分鏡與配圖', agentType: 'Explore', schema: ITEM_SCHEMA }
  )
))
const pkg = pkgGroups.filter(Boolean).flatMap(r => (r.items || []))

phase('整片資產')
await parallel([
  // 1. 分鏡表 + 配圖提示詞 + B-roll 清單
  () => agent(
    `根據以下逐段製作資料，寫三個檔案到 cases/${slug}/production/（資料夾不存在請建立）：\n` +
    `1) shotlist.md：讀 templates/shotlist.md 沿用表格結構（每筆含 id/heading/shot/camera/materialType/estSec）。\n` +
    `2) image-prompts.md：每段一條英文配圖提示詞（imagePrompt），標上對應段落編號。\n` +
    `3) broll-list.md：彙整所有 brollNeed（需要的真實素材與公開來源建議），標註版權注意。\n\n` +
    `資料(JSON)：\n${JSON.stringify(pkg, null, 2)}`,
    { label: 'write:shotlist+prompts', phase: '整片資產', agentType: 'general-purpose' }
  ),
  // 2. 縮圖 brief
  () => agent(
    `讀取 brand/visual-style.md 與 cases/${slug}/dossier.md。依 templates/thumbnail-brief.md 結構，為本案產出 3 個縮圖方向（含英文生成提示詞），存到 cases/${slug}/production/thumbnail-brief.md。規範：暗色高對比、單一強焦點、不使用可辨識真實人臉。`,
    { label: 'write:thumbnail', phase: '整片資產', agentType: 'general-purpose' }
  ),
  // 3. 標題 + SEO + 發布包
  () => agent(
    `讀取 cases/${slug}/dossier.md、brand/channel-identity.md、brand/legal-redlines.md。依 templates/seo-package.md 結構，產出標題 A/B/C（數字+懸念風格、不誇大、不定罪未定讞者）、影片描述、章節、標籤、置頂留言聲明，存到 cases/${slug}/production/seo-package.md。`,
    { label: 'write:seo', phase: '整片資產', agentType: 'general-purpose' }
  ),
  // 4. 來源與版權清單
  () => agent(
    `讀取 cases/${slug}/dossier.md 與 cases/${slug}/factcheck.md。彙整本案所有來源，寫成 cases/${slug}/production/sources.md：列出每項素材/事實的來源連結、類型（判決書/官方/新聞/維基/論壇）與授權狀態（公共領域/需授權/合理使用），供影片描述引用。`,
    { label: 'write:sources', phase: '整片資產', agentType: 'general-purpose' }
  ),
  // 5. 解說員出場表（character-shots）
  () => agent(
    `讀取 cases/${slug}/script-natural.md 的所有 [HOST-XX] 解說員段落，以及 brand/host-character.md。若腳本沒有 [HOST] 段，寫「本案無解說員段」即可。\n` +
    `為本案產出解說員出場表，存到 cases/${slug}/production/character-shots.md：\n` +
    `1) 一覽表格：# / 插入位置（act 邊界）/ 功能 / 神情·動態 / 估時(秒)。\n` +
    `2) 逐次規格：對應 [HOST-XX] 台詞、配音（餵 TTS 稿 → VoxCPM2 簽名聲線出 .wav）、動畫（一律用同一張 brand/assets/host-reference.png ＋該段 .wav 跑本機 lip-sync）、剪輯（全螢幕 cutaway 插在對應 act 邊界）。\n` +
    `3) 本機合成備忘：流程與候選模型（EchoMimicV2／Hallo2，SadTalker baseline），命名建議 production/character-clips/H1.wav、H1.mp4。\n` +
    `素材類型一律標 AI角色；一致性鐵則：全片同一張 host-reference.png，不重產角色。`,
    { label: 'write:character-shots', phase: '整片資產', agentType: 'general-purpose' }
  ),
])

return { slug, segments: segs.length, packaged: pkg.length }
