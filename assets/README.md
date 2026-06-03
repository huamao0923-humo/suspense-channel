# 素材庫指南 — assets

> 本頻道的 B-roll、配圖、地圖、音樂音效與公共領域檔案的統一存放與管理規範。
> 視覺基調一律對齊 [`brand/visual-style.md`](../brand/visual-style.md)：紀錄片感、冷色調、暗部豐富、低飽和、略帶顆粒的舊檔案/監視器質感。所有挑選或生成的素材都要服務這個暗色紀錄片風格——明亮商業感、高飽和、乾淨棚拍的素材一律不收。

---

## ◆ 核心原則

1. **重複使用優先**：先翻庫內既有素材，能用就用。新增前先確認沒有同類素材，避免重複下載、重複生成、重複授權。
2. **風格先於數量**：寧缺勿濫。不符合 `visual-style.md` 暗色紀錄片基調的素材不進庫。
3. **每個素材都要可追溯**：來源、授權、是否需題名（attribution）、是否 AI 生成，全部記錄在 metadata，缺一不收。
4. **合規優先**：商用/YouTube 變現可用才收；editorial-only、non-commercial、no-derivatives 的素材另行隔離標註，預設不用。

---

## (A) 資料夾結構

頂層按「用途/可重用性」分類；通用素材跨集共用，案件專用素材獨立成資料夾。每個葉子資料夾建議不超過 500–1000 個檔案。

```
assets/
├── README.md              # 本指南
├── _index.csv             # 全庫 metadata 主表（見 D 節）
├── _licenses/             # 授權文件、收據、CC 條款截圖集中存放
│
├── stock-ai/              # 通用 AI 生成圖 / 影片（可跨集重用）
├── stock-footage/         # 通用空景 B-roll（實拍空景、天氣、夜景、轉場）
├── maps/                  # 地圖素材（街道圖、地形圖、轄區邊界、可動畫底圖）
├── archive/              # 公共領域檔案（歷史影像、新聞片、檔案照、政府公開素材）
├── music-sfx/            # 音樂與音效
└── <case-slug>/          # 各集專用素材（每集一個資料夾，slug 對應 cases/）
```

### 各類用途

| 資料夾 | 用途 | 可重用性 | 典型內容 |
|---|---|---|---|
| `stock-ai/` | 通用 AI 生成圖與短片，填補空缺、建立一致的暗色美學。剪影、氛圍空景、示意檔案、地圖動畫。 | 高（跨集共用） | AI 夜景、剪影人物、證物示意、抽象氛圍片段 |
| `stock-footage/` | 通用實拍空景 B-roll。天氣、時間轉場、夜城、空路、霧雨、暗水等「普世」鏡頭。 | 高（跨集共用） | 雨夜城市、起霧街道、日夜轉場、陰天外景 |
| `maps/` | 地圖與地理視覺化底圖，呈現案發地理與轄區。優先公共領域歷史地圖；現代地圖留意題名要求。 | 高（跨集共用） | 街道圖、地形圖、轄區邊界、可縮放/平移的動畫底圖 |
| `archive/` | 公共領域與 CC 授權的歷史檔案素材，提供真實感與時代質感。 | 高（依案件取用） | 舊新聞片、檔案照、政府公開影像、歷史法庭/警方公共領域影像 |
| `music-sfx/` | 背景音樂與音效，營造懸疑張力。務必逐檔確認商用/變現授權（部分平台 Restricted License 不可變現）。 | 高（跨集共用） | 暗色懸疑配樂、環境音、轉場音效、心跳/低頻氛圍 |
| `<case-slug>/` | 單一案件專用素材：該集特定地點、人物剪影、案件文件示意、客製 AI 生成。 | 低（單集為主） | 該案地點 establishing shot、客製剪影、案件地圖、專屬生成圖 |

> `<case-slug>` 命名須與 `cases/` 內的案件 slug 一致，便於對應。製作流程中通用素材優先放進 `stock-*`/`maps`/`archive`，只有確定僅此一集會用的才放 `<case-slug>/`。

#### `<case-slug>/real-library/` — 真實案件素材庫（圖片／影片／卷宗）

各案專屬的**真實案件素材**實際收納於 `<case-slug>/real-library/`，與 `real-footage-sources.md`（去哪找＋授權分析）分工。**只收免費／公開開源**：聯邦 PD（FBI/NIST）、CC0、CC-BY(-SA)、公開法院/FOIA 卷宗；付費圖庫、新聞台、紀錄片一律不收（走第三層合理使用另議）。

```
<case-slug>/real-library/
├── images/        # 素描、地圖、證物照、mugshot、地點實景
├── video/         # 公共領域影片（記者會、通緝、官方影像）
├── docs/          # 卷宗：搜索票/判決/起訴文件 PDF、FBI 公開檔案、FOIA 文件
└── MANIFEST.csv   # 本案目錄（_index.csv 子集 + deidentify / clearance 欄）
```

> **`doc`（卷宗）為正式素材類別**：法院/警方/FBI/FOIA 文件 PDF。命名前綴 `real-`（如 `YYYYMMDD_real-doc_search-warrant_v001.pdf`）。卷宗多屬公開紀錄，惟發布前仍須人工確認去識別（受害者/第三人）與授權。

---

## (B) 推薦來源清單

### 免費 / 公共領域圖庫・影庫

| 來源 | 授權 | 適用 | 連結 | 注意事項 |
|---|---|---|---|---|
| Pexels | CC0（等同公共領域，免題名） | 全類 B-roll、空景 | https://www.pexels.com/ | 完全免費可商用含變現；庫大穩定，但犯罪題材小眾鏡頭需多翻 |
| Pixabay | Pixabay License（免版稅、免題名） | 天氣、城市天際線、抽象氛圍 | https://pixabay.com/ | 社群供稿，品質不一但整體佳 |
| Mixkit | Mixkit Video Free License（免題名） | 影片、音樂、音效 | https://mixkit.co/ | **逐檔確認授權**：Restricted License 影片不可變現 |
| Coverr | 免題名、可變現（含 AI 生成，明確標示） | 實拍 + AI 影片 | https://coverr.co/ | 已驗證商標/肖像授權；AI 片段一致可客製 |
| Archive.org（Internet Archive） | 多為公共領域 / CC | 歷史片、新聞片、紀錄片 | https://archive.org/ | 適合歷史懸案；**逐項確認授權**，含 NYPD 公共領域犯罪現場照 |
| Wikimedia Commons | 公共領域 / CC | 圖、影、音、地圖最高品質來源 | https://commons.wikimedia.org/ | **逐檔驗證授權標籤**；國際與機構檔案豐富 |
| NASA Image and Video Library | 公共領域（美國） | 太空、地球觀測、抽象 sci-fi | https://images.nasa.gov/ | 不可用 NASA 標誌於 AI 生成、不可暗示背書、可辨識人物需授權 |
| Library of Congress | 多為公共領域 | 歷史照、影片、地圖、海報 | https://loc.gov/pictures/ | 逐項看「Copyright and Other Restrictions」 |
| NYC Municipal Archives（NYPD 犯罪現場） | 公共領域（1914–1975） | 歷史犯罪現場真實照 | https://a860-collectionguides.nyc.gov/repositories/2/accessions/2817 | **敏感內容**：真實犯罪現場，須尊重受害者倫理使用 |
| UK National Archives | 多為「無已知版權限制」 | 英國案件歷史脈絡 | https://images.nationalarchives.gov.uk/ | 逐項確認；Flickr Commons 僅供研究≠商用授權 |
| The Met Collection（大都會博物館） | 公共領域 Open Access | 19–20 世紀歷史犯罪攝影 | https://www.metmuseum.org/art/ | 高品質歷史素材；敏感題材須負責任使用 |
| PICRYL | 聚合（須回原站驗證） | 公共領域跨庫批次搜尋 | https://picryl.com/ | 元搜尋工具；授權以原始來源為準 |

> 對齊 `visual-style.md`：B-roll/真實素材優先順序為——政府公開影像 → 法庭素材 → 公共領域地圖/街景。

### AI 生成工具

| 工具 | 費用 | 適用 | 連結 | 注意事項 |
|---|---|---|---|---|
| Google Veo 3.1 | 免費層：每帳號每月 10 次（≤8 秒 720p） | B-roll 填補、establishing shot、AI 配樂(Lyria 3) | https://deepmind.google/models/veo/ | 最易上手免費影片工具；免費層 720p，4K 需付費 |
| Runway ML (Gen-3) | $15/月起 | 圖生影、文生影，維持一致視覺語言 | https://runwayml.com/ | 專業級輸出，適合長片與量產；學習曲線較陡 |
| Pika Labs | 免費層；Pro $8/月 | 15–60 秒短片、Shorts/Reels | https://pika.art/ | 生成快、成本低；適合短影音 |
| Stable Diffusion | 免費開源（自架/Hugging Face） | 高度客製文生圖；ControlNet 保持一致 | https://huggingface.co/stability-ai | 需技術能力；negative prompt 可排除浮水印/AI 瑕疵 |
| Midjourney | $20/月起 | 高品質、風格一致的氛圍圖 | https://www.midjourney.com/ | 美學一致性佳；非免費但成品專業 |

> AI 生成一律以 `visual-style.md` 的英文 base prompt 起頭：
> `cinematic documentary still, dark moody lighting, cold desaturated palette, film grain, shallow depth of field, realistic, investigative tone, 16:9 --ar 16:9`
> **人物一律剪影/背影/去識別**，不還原真實受害者/嫌疑人臉孔（見 `brand/legal-redlines.md`）。

---

## (C) 取得素材標準流程

每需要一個素材，依序往下走，能在前一步解決就停：

1. **先查庫內可重複用**
   翻 `stock-ai/`、`stock-footage/`、`maps/`、`archive/`，並用 `_index.csv` 的標籤搜尋。已有合適的就直接用，零成本、零授權風險。

2. **再找公共領域 / 免費圖庫**
   到 Pexels / Pixabay / Mixkit / Coverr 找通用空景；到 Archive.org / Wikimedia / LoC / 政府檔案找歷史與真實素材。逐檔通過授權檢查清單後入庫到對應通用資料夾。

3. **再 AI 生成**
   庫內與公共領域都沒有合適素材時，用 Veo / Runway / Pika / SD / Midjourney 生成。以 `visual-style.md` base prompt 起頭，保持暗色紀錄片風格與人物去識別。產物入 `stock-ai/`（通用）或 `<case-slug>/`（單集專用），並記錄提示詞與參數。

4. **最後才考慮授權新聞素材**
   只有前三步都無法滿足、且該畫面對敘事不可或缺時，才評估付費/授權新聞影像或照片。必須在 metadata 標明版權、授權範圍與題名需求，並把授權文件存入 `_licenses/`。新聞畫面/照片的版權與授權處理遵循 `brand/legal-redlines.md`。

### 授權檢查清單（入庫前必過）

- [ ] 授權支援商用 + YouTube 變現？
- [ ] 是否需要題名（attribution）？需要就記進 metadata。
- [ ] 有無浮水印？
- [ ] 有無地理/editorial-only 使用限制？
- [ ] 是否為 AI 生成（須揭露）？
- [ ] 含可辨識人臉/品牌 logo？是否有肖像權/商標清除？
- [ ] 是否符合 `visual-style.md` 暗色紀錄片基調？

> 注意：許多標榜「Free」的素材有隱藏限制（editorial only、non-commercial、no derivatives）。讀完整授權條款，不要只看「Free」標籤。

---

## (D) 命名與 Metadata 規則

### 檔案命名

格式：`YYYYMMDD_類別_描述_vNNN.副檔名`

- 只用字母、數字、連字符、底線；**禁空格與特殊字元**。
- 日期一律 `YYYYMMDD` 確保時間排序。
- 版本號三位數 `v001`、`v002` 維持正確排序。
- 描述用簡短英文或拼音關鍵詞，便於跨平台相容。

範例：

```
20260530_footage_rainy-night-city_v001.mp4
20260530_ai_silhouette-backlit_v002.png
20260530_map_suburb-jurisdiction_v001.png
20260530_archive_newsreel-1972_v001.mp4
20260530_music_dark-suspense-loop_v001.mp3
```

案件專用素材放在 `<case-slug>/`，檔名同規則（類別可用 `case` 或對應 B-roll 類別）。

### Metadata 主表 `_index.csv`

每入庫一個素材就新增一列，作為全庫單一事實來源，也作合規檢查與備份依據。欄位：

| 欄位 | 說明 |
|---|---|
| `filename` | 檔名（同上規則） |
| `folder` | 所在資料夾（stock-ai / stock-footage / maps / archive / music-sfx / `<case-slug>`） |
| `description` | 內容描述 |
| `tags` | 多維標籤，逗號分隔（見下） |
| `source` | 來源平台或工具（Pexels / Archive.org / Veo / Midjourney…） |
| `source_url` | 原始連結 |
| `license_type` | 授權類型（CC0 / Pixabay / Mixkit-Free / Public Domain / Editorial / 付費授權…） |
| `attribution` | 是否需題名（Y/N）；需要則填題名文字 |
| `commercial_ok` | 是否可商用變現（Y/N） |
| `ai_generated` | 是否 AI 生成（Y/N） |
| `prompt` | AI 生成的提示詞與關鍵參數（非 AI 留空） |
| `acquired_date` | 取得日期 `YYYYMMDD` |
| `license_expiry` | 授權到期日（無則留空） |
| `cost` | 取得成本（免費填 0） |
| `used_in` | 用於哪幾集（case-slug，逗號分隔；可跨集累加） |
| `resolution` | 解析度（如 1920x1080） |
| `notes` | 限制/敏感內容/備註 |

### 標籤體系（`tags` 欄位用，統一詞彙）

- **B-roll 類別**：`establishing`（地點/外景）、`archival`（檔案/文件）、`document`（卷宗：法院/警方/FBI/FOIA 文件 PDF）、`maps`、`atmospheric`（夜景/天氣/抽象）、`investigation`（警示/調查元素）、`transition`（時間/天氣轉場）。
- **色彩主調**：`cold`、`monochrome`、`warm-accent`（檔案紙暖黃/警示橘點綴）。
- **應用場景**：`intro`、`background`、`transition`、`outro`。
- **去識別**：`silhouette`、`anonymized`（含人物但已剪影/背影/馬賽克）。

> 統一用受控詞彙（controlled vocabulary），不要自創同義標籤，否則搜尋會漏。

### 授權文件存放

付費或需題名的素材，授權證明/收據/CC 條款截圖存入 `assets/_licenses/`，檔名對應素材檔名，方便發布前最終合規檢查與日後查核。
