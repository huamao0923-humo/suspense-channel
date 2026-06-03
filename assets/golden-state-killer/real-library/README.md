# 真實素材庫 — golden-state-killer（real-library）

> 本資料夾**實際收納**黃金州殺手案的真實案件素材檔案（圖片／影片／卷宗）。
> 與 `../real-footage-sources.md` 分工：sources 檔是「**去哪找＋授權分析**」，本庫是「**實際收進來的檔案＋目錄**」。
> 對齊 `assets/README.md`（全庫規範）、`assets/copyright-guide.md`、`brand/legal-redlines.md`（§4 去識別、§5 版權，最高優先）。

---

## ◆ 收錄鐵則：只收「免費 ＋ 公開開源」

**僅以下授權可進本庫**（對齊 copyright-guide 第一層 / 部分第二層）：

- ✅ **聯邦政府作品**（FBI、NIST 等，17 U.S.C. §105）＝公共領域
- ✅ **CC0 / Public Domain**（Wikimedia Commons 標示）
- ✅ **CC-BY / CC-BY-SA**（須署名；SA 須相同方式分享）— 商用可
- ✅ **公開法院 / 警方 / FOIA 紀錄**（卷宗、搜索票、判決、文件）

**一律不收**（→ 改走 `real-footage-sources.md` 第三層，合理使用另案處理）：
- ❌ AP / Getty / 新聞台畫面、商業圖庫付費素材
- ❌ HBO 等紀錄片/影視（legal-redlines §5 禁用）
- ❌ NC（禁商用）／ND（禁改作）授權
- ❌ editorial-only / 含隱藏限制者

> **加州分界提醒**：**聯邦**（FBI/NIST）＝PD；**加州州/地方**（Sheriff mugshot、加州法庭畫面）**不自動 PD**，須逐筆確認後才標 ✅。

---

## ◆ 資料夾分類

| 子資料夾 | 收什麼 | 典型內容 |
|---|---|---|
| `images/` | 靜態圖 | FBI 素描、犯罪地圖、證物照、被告 mugshot、案發地點實景 |
| `video/` | 影片 | FBI 記者會 .webm、通緝影片、探員訪談（公共領域者） |
| `docs/` | **卷宗（文件）** | 去識別搜索票 PDF、法院判決/起訴文件、FBI 公開檔案、FOIA 取得文件 |

檔名沿用 `assets/README.md` 規則，類別前綴用 `real`：
`YYYYMMDD_real-<類別>_<描述>_vNNN.<副檔名>`
範例：`20260531_real-sketch_ear-composite_v001.jpg`、`20260531_real-doc_search-warrant_v001.pdf`、`20260531_real-video_fbi-presser_v001.webm`

---

## ◆ 目錄檔 `MANIFEST.csv`

本案單一事實來源（欄位為 `assets/_index.csv` 子集 + 真實素材專屬欄）。每收一個檔案補一列。欄位：

| 欄位 | 說明 |
|---|---|
| `filename` | 入庫後檔名（上方規則）；尚未下載填規劃檔名 |
| `type` | image / video / doc |
| `category` | sketch / map / evidence / mugshot / location / press-conf / warrant / court-doc / fbi-file |
| `description` | 內容描述 |
| `source` | 來源平台（Wikimedia Commons / FBI / NIST …） |
| `source_url` | 原始連結 |
| `license_type` | CC0 / Public Domain (Federal) / CC-BY / CC-BY-SA / Public Record |
| `attribution` | 須署名則填署名文字，否則 N |
| `commercial_ok` | Y/N |
| `deidentify` | 使用時是否須去識別（Y＝受害者/可辨識人臉須遮蔽；N＝可直接呈現，如被告 mugshot/素描/地圖） |
| `clearance` | ⬜待下載 / 🟡待人工確認授權 / ✅已確認可用 / 🔴須授權（不應出現於本庫） |
| `notes` | 備註 |

---

## ◆ 清關流程（legal-redlines：發布前一律人工確認）

1. **下載** → 進對應子資料夾，依命名規則改名，`clearance=⬜→🟡`。
2. **逐檔確認授權**：點開來源頁核對授權標籤（PD/CC0/CC-BY…）、記下署名需求 → `clearance=✅`。
3. **去識別判定**：受害者/倖存者/可辨識第三人 → `deidentify=Y`（使用時剪影/馬賽克）；被告（已定讞）mugshot、素描、地圖、文件 → `deidentify=N`。
4. **CC-BY/SA**：把署名文字寫入 `attribution`，發布時標註。
5. **同步主目錄**：確認可用者補一列到 `assets/_index.csv`（`folder=golden-state-killer`、`tags` 加 `real,archival`）。

> 任何素材**實際使用/發布前**一律須最終人工確認授權（本檔為製作自律準則，非法律意見）。

---

## ◆ 待填充（待你點頭後執行）

下載來源已在 `MANIFEST.csv` 規劃好（`clearance=⬜待下載`），主要批次：
- **Wikimedia Commons `Category:Joseph James DeAngelo`**（38 檔，多 FBI 源）→ images/ + video/（可用 `tools/fetch-real.mjs` 擴充批次抓取）
- **FBI Image Repository**（通緝海報、證物照）→ images/
- **NIST**（合成素描）→ images/
- **去識別搜索票 PDF（123 頁）**→ docs/
