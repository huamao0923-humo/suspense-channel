# 鏡頭分類提示詞庫 — prompt-library

> 目的：把畫面**分類定義**，每類預先備好搜尋詞，之後腳本只要為每個鏡頭標一個「類別」，
> retrieval（Pexels 真實影片 / Openverse CC 圖 / AI 生成提示詞）就能依類別自動**調用**對應詞，
> 不必每集重想關鍵字。程式定義在 [tools/shot-vocab.js](../tools/shot-vocab.js)。

## 類別總表

| 類別 key | 中文 | 用途 | 範例搜尋詞 |
|---|---|---|---|
| `establishing-town` | 城鎮地標空景 | 開場、交代地點、轉場 | aerial small town dusk / quiet town street night |
| `crime-scene-interior` | 犯罪現場·室內 | 案發室內、棄屍處 | abandoned room dark / empty concrete basement |
| `crime-scene-exterior` | 犯罪現場·建築外觀 | 案發建物、廢棄處所 | abandoned building exterior night / old bank facade |
| `vault-barrels` | 金庫/桶/容器 | 藏屍金庫、桶（本案標誌） | dark cellar metal door / industrial barrels in shadow |
| `neighborhood` | 社區/街道 | 被害人生活的邊緣社區 | run-down suburb street / empty alley night |
| `wilderness` | 荒野/自然 | 棄屍荒野、偏遠地、開車 | foggy field dawn / remote country road night |
| `police` | 警方/調查 | 報案、搜查、封鎖 | police car lights night / crime scene tape |
| `forensics` | 鑑識/證物 | DNA、牙科、物證 | evidence bags on table / forensic gloves dark |
| `court` | 司法/法庭/監獄 | 審判、判決、服刑 | empty courtroom / prison corridor |
| `anonymous-figure` | 匿名人物剪影 | 兇手/被害人示意（不露臉） | silhouette figure dark hallway / shadow person backlit |
| `object-closeup` | 物件特寫 | 關鍵物件、線索 | rusty padlock close up / old keys on table dim |
| `mood-transition` | 氛圍/轉場 | 懸念鋪陳、爆點前後 | rain on window night / single candle in darkness |
| `archive-time` | 檔案/時間流逝 | 舊案、年代、卷宗 | newspaper clippings wall / old file cabinet dim |

> 全部詞以暗色懸疑、紀錄片感為基調，且對齊 [legal-redlines](../brand/legal-redlines.md)：人物一律剪影、不露真實臉孔。

## 怎麼「調用」

1. **腳本/分鏡標類別**：每集為每段（或每鏡）指定一組類別 → 程式裡的 `SEG_CATEGORIES`（見 shot-vocab.js 的 `SNOWTOWN_SEG_CATEGORIES`）。
2. **展開搜尋詞**：`termsForCategories(['vault-barrels','mood-transition'])` → 回傳該些類別的所有搜尋詞。
3. **三層 retrieval 依序取用**（對齊 [footage-sourcing](footage-sourcing.md)）：
   - 有 `PEXELS_KEY` → 抓**真實影片**（第 2 層）
   - 否則 → Openverse **CC 圖**（第 2 層）
   - 都沒有 → 灰底備援
   - AI 生成（第 1 層）與案件真實新聞（第 3 層）也可吃同一組詞當提示。

## 換新案件怎麼做
1. 在 `shot-vocab.js` 複製一份 `<案件>_SEG_CATEGORIES`，依該案每段劇情填類別清單。
2. `make-demo.mjs` 改引用該案的 SEG_CATEGORIES。
3. 不夠用的場景類別，直接在 `CATEGORIES` 新增一類（key + zh + use + terms），全頻道共用。
