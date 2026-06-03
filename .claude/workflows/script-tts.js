export const meta = {
  name: 'script-tts',
  description: 'TTS 稿生成：讀已定稿的 script-natural.md → 轉成 SSML 標記稿 script-tts.md（HOST／INTRO／ENDING 段一併轉）',
  phases: [
    { title: 'TTS稿', detail: '把定稿自然稿轉成 <break/>/<prosody>/<emphasis> 標記稿' },
  ],
}

// args 必填：{ slug }；防護：args 可能以 JSON 字串送入，需先解析
let cfg = args
if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch (e) { cfg = {} } }
cfg = cfg || {}
const slug = cfg.slug || 'untitled-case'
log(`為 ${slug} 由已定稿自然稿生成 TTS 稿`)

phase('TTS稿')
await agent(
  `讀取 cases/${slug}/script-natural.md（這是人工已定稿的自然旁白稿）與 brand/voice-guide.md 的「TTS 稿規格」。把自然稿轉成 TTS 友善稿，寫入 cases/${slug}/script-tts.md。\n` +
  `規則：\n` +
  `1) 把 [停頓][加重][放慢] 等演播提示轉成 <break/>、<prosody>、<emphasis> 標記；數字與年份標註中文讀法；句子斷乾淨避免破音。**文字內容一字不改**，只加標記與讀法。\n` +
  `2) 解說員段（## [HOST-XX]）一併轉成 TTS 標記，保留其標題與〔出鏡 cutaway〕註記；解說員與旁白用同一條簽名聲線。\n` +
  `3) [INTRO] 打字機日期卡：保留標題與〔畫面〕引言行；日期地點文字可一併給讀法（此段在影片中為無語音打字機卡，TTS 稿僅作存檔對齊，不必特別斷句）。\n` +
  `4) [ENDING] 片尾：保留標題與〔懸念問句〕〔畫面〕〔謝幕〕三行；其中懸念問句與謝幕詞若要配音，給適當 <prosody>/<break>。\n` +
  `5) 每段正片的「> 〔畫面：…〕」標籤行原樣保留（給人對照，不影響 TTS）。\n` +
  `完成後回報已寫入 script-tts.md 的段數。`,
  { label: 'write:tts', phase: 'TTS稿', agentType: 'general-purpose' }
)

return { slug, done: true }
