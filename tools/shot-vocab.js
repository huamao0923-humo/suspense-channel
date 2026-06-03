// tools/shot-vocab.js
// 鏡頭分類詞庫（可重複使用）：把畫面分成「類別」，每類定義好搜尋詞與用途。
// 之後腳本/分鏡只要為每個鏡頭標一個 category，retrieval（Pexels 影片 / Openverse 圖 / AI 生成）
// 就能依 category 調用對應 terms，不必每集重寫關鍵字。
// terms 同時適用 Pexels 影片搜尋與 Openverse 圖片搜尋（具體場景片語、暗色懸疑）。

export const CATEGORIES = {
  'establishing-town':     { zh: '城鎮地標空景', use: '開場、交代地點、章節轉場', terms: ['aerial small town dusk', 'suburban skyline overcast', 'quiet town street night', 'rural town aerial fog'] },
  'crime-scene-interior':  { zh: '犯罪現場·室內', use: '案發室內、棄屍處、密閉空間', terms: ['abandoned room dark', 'derelict interior dim light', 'empty concrete basement', 'abandoned house interior night'] },
  'crime-scene-exterior':  { zh: '犯罪現場·建築外觀', use: '案發建物外觀、廢棄處所', terms: ['abandoned building exterior night', 'derelict house dusk', 'old bank building facade', 'boarded up building'] },
  'vault-barrels':         { zh: '金庫/桶/容器', use: '藏屍金庫、桶、工業容器（本案標誌）', terms: ['dark cellar metal door', 'industrial barrels in shadow', 'rusty drums dim warehouse', 'old vault door'] },
  'neighborhood':          { zh: '社區/街道', use: '被害人生活的社區、邊緣住宅區', terms: ['run-down suburb street', 'empty alley night', 'working class houses overcast', 'deserted residential road dusk'] },
  'wilderness':            { zh: '荒野/自然', use: '棄屍荒野、偏遠地、開車鏡頭', terms: ['foggy field dawn', 'dark forest path', 'remote country road night', 'grey river bank'] },
  'police':                { zh: '警方/調查', use: '報案、搜查、現場封鎖', terms: ['police car lights night', 'patrol car rain', 'crime scene tape', 'police flashlight dark'] },
  'forensics':             { zh: '鑑識/證物', use: 'DNA、牙科、物證、鑑識', terms: ['evidence bags on table', 'forensic gloves dark', 'lab dim light', 'fingerprint dust dark'] },
  'court':                 { zh: '司法/法庭/監獄', use: '審判、判決、服刑', terms: ['courthouse exterior', 'empty courtroom', 'prison corridor', 'prison fence night'] },
  'anonymous-figure':      { zh: '匿名人物剪影', use: '兇手/被害人示意（不露臉，符合紅線）', terms: ['silhouette figure dark hallway', 'shadow person backlit', 'anonymous figure in fog', 'silhouette at window night'] },
  'object-closeup':        { zh: '物件特寫', use: '關鍵物件、線索特寫', terms: ['old rotary phone dark', 'rusty padlock close up', 'old keys on table dim', 'newspaper close up dark'] },
  'mood-transition':       { zh: '氛圍/轉場', use: '懸念鋪陳、爆點前後、章節轉場', terms: ['dark storm clouds timelapse', 'rain on window night', 'single candle in darkness', 'flickering light dark room'] },
  'archive-time':          { zh: '檔案/時間流逝', use: '舊案、年代、卷宗、時間跨度', terms: ['old file cabinet dim', 'newspaper clippings wall', 'old clock dark', 'dusty documents stack'] },
};

// 每集為每段指定類別清單（依劇情）。retrieval 會把這些類別的 terms 串起來循環取用。
// 之後新案件只要照樣填一份 SEG_CATEGORIES 即可，不必想關鍵字。
export const SNOWTOWN_SEG_CATEGORIES = {
  0: ['vault-barrels', 'crime-scene-interior', 'object-closeup', 'mood-transition'],
  1: ['neighborhood', 'anonymous-figure', 'establishing-town', 'mood-transition'],
  2: ['anonymous-figure', 'crime-scene-interior', 'neighborhood', 'wilderness', 'mood-transition'],
  3: ['police', 'vault-barrels', 'forensics', 'crime-scene-exterior', 'object-closeup'],
  4: ['court', 'forensics', 'archive-time', 'anonymous-figure', 'mood-transition'],
  5: ['court', 'mood-transition', 'wilderness', 'archive-time'],
};

// 第一層「真實案件素材」主題：每段一組真實地點/建物關鍵字，供 Wikimedia Commons / Street View 取材。
// 只用「地點/建物/標誌」類（無人臉，對齊 legal-redlines §4）。換案件只改這份即可。
// 以下主題已實測在 Wikimedia Commons 有 CC/公共領域真圖（含 Snowtown 那間真正的藏屍銀行）。
export const SNOWTOWN_SEG_REAL = {
  0: ['Snowtown former bank', 'Snowtown South Australia'],          // 冷開場：真正的藏屍銀行
  1: ['Snowtown South Australia', 'Salisbury South Australia'],     // 失蹤案發地
  2: ['Snowtown South Australia'],                                  // 被害人時間線
  3: ['Snowtown former bank', 'Snowtown South Australia'],          // 破獲現場
  4: ['Supreme Court of South Australia', 'Adelaide Magistrates Court'], // 審判
  5: ['Supreme Court of South Australia', 'Snowtown South Australia'],   // 判決與餘波
};

// 把類別清單展開成搜尋詞陣列
export function termsForCategories(cats) {
  const out = [];
  for (const c of (cats || [])) for (const t of (CATEGORIES[c]?.terms || [])) out.push(t);
  return out.length ? out : ['dark abandoned cinematic'];
}
