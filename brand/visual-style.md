# 視覺風格指南 — visual-style

> WF4（製作包）的 agent 必讀。配圖提示詞與縮圖都以此為基底。

## 整體基調
- 紀錄片感、冷色調、暗部豐富、低飽和。懸疑但不血腥。
- 主色：深藍灰 / 墨黑 / 冷白；點綴用警示橘或檔案紙的暖黃。
- 質感：略帶顆粒、像舊檔案/監視器畫面，避免明亮商業感。

## 配圖提示詞基底（英文 base prompt）
所有 AI 生成圖以此為底，再接該段的具體描述：

```
cinematic documentary still, dark moody lighting, cold desaturated palette,
film grain, shallow depth of field, realistic, investigative tone, 16:9 --ar 16:9
```

依場景追加（範例）：
- 犯罪現場：`abandoned apartment interior at night, police tape, faint light through window`
- 證物/檔案：`evidence table, old case files, newspaper clippings, forensic photos, top-down`
- 地點/外景：`establishing shot of a quiet foreign suburb, overcast, 1990s`
- 人物剪影：`anonymous silhouette, face not visible, backlit`（**人物一律剪影/背影/去識別，不還原真實長相**）

## 禁忌（對齊 legal-redlines）
- 不生成可辨識的真實受害者/嫌疑人臉孔——用剪影、背影、馬賽克或示意。
- 未成年人完全不出現可辨識特徵。
- 不做血腥/獵奇畫面；暴力以暗示、留白處理。

## 素材配比目標（對標國外懸案長片，配比為類型推估非實測）
單集（約 40–45 分）以螢幕時間估算，分鏡師據此分配 materialType：

| 素材類型 | 目標佔比 | 角色 | 典型內容 |
|---|---|---|---|
| 真實素材（錨點） | 30–40% | 內容骨架，觀眾記得的關鍵畫面 | mugshot、bodycam、庭審、記者會、新聞片段、案發地街景、真實剪報/判決書 |
| Stock B-roll（氛圍） | 30–40% | 撐時間＋轉場 | 城市夜景、雨、森林、警燈、公路、generic 室內 |
| 動畫/動態圖 | 20–25% | 把抽象資訊視覺化 | 地圖、時間軸、證物 callout、字卡、Ken Burns 推拉靜照 |
| 解說員出鏡 | 0–5% | Pilot cutaway（見 character-shots） | 定格肖像全螢幕 |

原則：
- **真實素材重質不重量**：一個敘事段落有 3–5 個真實錨點即可，不必每秒都真。配比的「量」靠 stock＋動畫填滿。
- **AI 示意圖不算進上表四類**：它只是真實素材取不到時的退路（見下），不是獨立配額。
- 真實素材在 **deep-research 階段就踏查備齊**：產出 `assets/<slug>/real-footage-sources.md`（三層授權分析）＋ `real-library/seed.json`，並自動跑 `tools/real-picker.mjs --auto` 把安全授權（PD/CC0/聯邦/CC-BY/SA）下載進 `assets/<slug>/real-library/`、回填 MANIFEST.csv（clearance=🟡，發布前人工確認）。
- 要精挑或補抓：`node tools/real-picker.mjs --slug <slug> --category "<Commons分類>"`（互動列候選挑編號）或 `--query "<詞>"`。第三層受版權新聞/庭審/紀錄片一律不自動下載，只登錄於 sources 檔供人工合理使用判斷。
- 渲染端：make-demo **優先用已下載的本地 real-library**（依 `real-subjects.json` 詞做逐段對位，命中不到才退池子輪替），庫空才退即時 Commons/Pexels → AI 示意。`real-subjects.json` 由 script-studio 產出，現降為渲染端的逐段對位/補充搜尋詞。

## B-roll / 真實素材
- **核心原則＝能用真實就用真實（real-first）**：場景/地點/建築/街景/物件/檔案/時代影像一律優先**真實素材**（實拍影片 > 真實照片），**AI 示意圖只用於：會露真實被害人/嫌疑人臉孔、或真實暴力情節的畫面**（去識別）。
- 取材實作：make-demo 對「真實圖片/調用影片」段，依 `cases/<slug>/real-subjects.json` 的關鍵詞去 **Wikimedia Commons（PD/CC，免 key）** 抓真實場景照片/影片；有 `PEXELS_KEY` 時再優先 Pexels 實拍影片。取不到才退 AI 示意。
- 優先序：政府公開影像、法庭素材、公共領域地圖/街景、Commons PD/CC 場景照、實拍 B-roll。
- 新聞畫面/照片需標註版權與授權需求（見 legal-redlines）；真實素材清單見產出的 `<slug>-demo-credits.md` 與 `-real-manifest.md`，**發布前人工覆核授權**。
- 地圖與時間軸：用動畫呈現案發地理與事件序列，幫助理解。

## 縮圖風格
- 高對比、暗背景、一個強烈視覺焦點（剪影/物件/地點，**非真實人臉**）。
- 大字標題 4–8 字，警示色；可加問號製造懸念。
- 一致的字體與色塊，建立頻道辨識度。
