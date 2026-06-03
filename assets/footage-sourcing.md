# 影片畫面素材：三層來源策略 — footage-sourcing

> 對齊 `assets/copyright-guide.md` 與 `brand/legal-redlines.md`。畫面不該只靠 AI——
> 真實與空景素材能大幅提升可信度與質感。每個鏡頭在 shotlist 標一個 `source`。

## 三層來源

### 第 1 層 — AI 生成（依提示詞）
- 工具：Pollinations（免 key，已整合 `tools/make-demo.mjs`）、Midjourney、Stable Diffusion、Runway/Pika（影片）。
- 用途：找不到真實/空景素材、需要特定構圖或氛圍、或不便用真實畫面（去識別）時。
- 規範：套 `brand/visual-style.md` 基底；無臉孔、無真實人物還原、無浮水印文字。

### 第 2 層 — 影片庫調用（stock B-roll，依提示詞關鍵字）
- 流程：從該鏡頭的英文配圖提示詞**萃取關鍵字** → 查影片庫 → 下載可商用空景 B-roll → 直接嵌入。
- 來源：
  - **Pexels Videos / Pixabay Videos**：免費、可商用、需免費 API key（建議主力）。
  - **Archive.org / Wikimedia Commons**：公共領域 / CC，免 key。
  - **Coverr / Mixkit / Videvo**：免費授權（多需手動下載）。
- 工具：`tools/fetch-stock.mjs`。有 `PEXELS_KEY`（環境變數）時自動搜尋下載；無 key 時產出每鏡頭的關鍵字清單供手動抓取。
- 授權：只用「可商用、可嵌入」者（CC0 / Public Domain / Pexels / Pixabay License）；避開 NC（禁商用）與 ND（禁改作）。

### 第 3 層 — 案件真實畫面（針對本案搜尋）
- 流程：研究 agent 搜尋此案真實的**新聞報導、紀錄片、法庭/警方影像、檔案照片、案發地點實景** → 產出 `assets/<slug>/real-footage-sources.md`（來源、類型、授權、可用方式、風險）。
- 用途：真實地點/報導/檔案能建立可信度，是這賽道差異化的關鍵。
- 版權（**最謹慎，對齊 copyright-guide 第三層**）：
  - 優先**公共領域真實素材**：警方公開影像、法庭錄影、FOIA 取得檔案、政府/公共領域照片。
  - 受版權新聞片段＝最後手段：僅必要片段、加實質分析評論、明確標出處、預期 Content ID、必要時改用授權或**重繪/動畫/模糊**替代。
  - 涉未成年/受害者一律去識別（legal-redlines §4）。
  - **不自動嵌入**；此層一律人工審核/取得授權後才用。

## 每鏡頭的來源決策（shotlist 增 `source` 欄位）
`ai`（AI 生成）｜`stock`（影片庫空景）｜`real-pd`（真實·公共領域）｜`real-licensed`（真實·已授權）｜`map`（地圖動畫）｜`archive`（檔案示意）

**選用優先序（可信度高且風險低者優先）**：
`real-pd` ＞ `stock` ＞ `ai` ＞ `real-licensed` ＞（受版權新聞素材，最後且謹慎）

## 依案件年代調整來源重心

優先序不變，但**案件越久遠，重心越往「AI 重繪＋歷史公共領域檔案」移**：

- **近代案件**（如黃金州殺手）：真實素材充足（FBI/警方/法院公開、新聞、Wikimedia），第 3 層 `real-pd` 為主力，AI 僅補空缺與去識別。
- **久遠／歷史案件**：真實影像稀少或根本不存在 → 以 **AI 生成**（依 `brand/visual-style.md` 重繪時代場景、人物剪影）＋**公開資訊／歷史 PD 檔案抓取**為主力。年代久的好處是**素材多已進入公共領域、風險更低**。
  - 歷史 PD 來源：Library of Congress、Wikimedia Commons、各國國家檔案館、PICRYL / GetArchive、公共領域舊報紙與檔案照（見 `assets/README.md` (B) 來源清單）。
  - AI 重繪兼具「高轉化性（降版權風險）＋去識別（合隱私紅線）」，是歷史場景的首選。

## 與生產線整合
- WF4 `production-package` 的 shotlist 之後可為每鏡頭標 `source` 與 stock 關鍵字。
- `tools/fetch-stock.mjs`：抓 stock B-roll。
- `tools/make-demo.mjs`：合成時若該鏡頭有真實/stock 影片檔則優先採用，否則用 AI 圖（目前預設全 AI，後續接入素材檔即可混用）。
- 各案 `assets/<slug>/`：`asset-plan.md`（逐鏡素材計畫）、`real-footage-sources.md`（真實畫面清單）、`stock-footage.md`（stock 關鍵字/下載清單）。
