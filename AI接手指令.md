# AI 接手指令 — 貼給新電腦的 AI

> 把以下整段貼給新電腦上的 AI（Claude Code 等），它就能接手這個專案。

---

你接手一個既有專案：**Miao Channel — 繁體中文、faceless（不露臉）的國外懸案推理長片頻道**生產線。一律用繁體中文回覆。動手前先讀專案根目錄的 `CLAUDE.md`、`brand/legal-redlines.md`、`pipeline/status.md`。

## 這是什麼
用 workflow（在 `.claude/workflows/`）把一樁懸案，從選題→研究→故事編排→腳本→製作包，產出「製作藍圖包」，再用本機工具渲染成片。每案一個 `cases/<slug>/`，素材庫 `assets/<slug>/real-library/`，成片 `web/media/<slug>-demo.mp4`，集數索引 `episodes/ep0NN-<slug>/`（連結）。

## 生產線（依序）
1. `real-sourcing`（skill/workflow，args `{slug,title,country,year}`）→ 真實素材庫＋seed.json，**會撈到離題垃圾，須人工清**
2. `story-arc`（args `{slug,lengthMin}`）
3. `script-studio`（args `{slug,lengthMin}`）→ script-natural.md＋legal-review.md
4. `script-tts`（args `{slug}`）
5. `production-package`（args `{slug}`）
6. 渲染：`node tools/build-episode.mjs --slug <slug>` 再 `node tools/make-demo.mjs --slug <slug>`

## 環境相依（見 移機指南.md 完整版）
- `Miao Channel` 與 `voice-engine` 必須同層（make-demo 用上一層找語音引擎）
- 需 NVIDIA GPU、Node、ffmpeg(PATH)、Python3.11+py、yt-dlp、繁中字型 msjh.ttc
- API 金鑰在專案根 `.env`（make-demo 經 `tools/load-env.mjs` 讀取，不靠 shell 繼承）
- 語音：VoxCPM2 簽名聲線（`voice-engine`，cuda）

## 鐵則（務必遵守）
1. **法律紅線優先**：未定罪者用「涉嫌／被指控」、被動語態、去識別化、引判決書/起訴書。違反即重寫。
2. **事實與推測分離**：腳本不得超出 `factcheck.md` 已證實事實；不確定就標記，不得編造。
3. **渲染前先問使用者**：make-demo 吃 GPU、~50–70 分、與其他程式共用目錄/有渲染鎖，**開跑前一律先取得同意**。
4. **要使用者驗證成片時，先用檔案總管幫他開好該檔資料夾**（`explorer /select`），再等他看完。
5. **畫面素材五級優先序，永不退純文字卡**：①真實案件影片 ②真實案件圖 ③Pexels場景影片 ④Pexels場景圖 ⑤AI示意。make-demo 填充槽已照此實作。
6. **時代正確性**：剔除時代錯置的現代地標/近年街景；缺口寧可退 AI 示意。
7. 選題優先「天生免費素材多」的案：美國聯邦案（FBI 素描/mugshot 公領域）、歷史案（Bundesarchiv CC-BY）。

## 已知雷區
- `real-picker --auto` 會撈進無關檔（英國銀行、無關 PDF…），灌庫後**人工清** real-library 與 MANIFEST.csv，只留貼題者。
- workflow 的 args 是 JSON 字串（須能 JSON.parse）。
- make-demo 的 YouTube CC 多是 recap 幻燈片/談話頭，已有 ②靜圖偵測＋③頻道黑名單過濾；冷門案 archive.org 常 0 匹配。
- make-demo 輸出主檔名固定 `<slug>-demo.mp4`（網頁播放器依 slug 對位，不可改）；要標版本另存副本。

## 接手第一步
1. 跑 移機指南.md 的「驗證」段，確認 .env 金鑰、ffmpeg、yt-dlp、語音伺服器、GPU 都就緒。
2. 讀 `pipeline/status.md` 看各集進度（ep001 雪鎮、ep002 金州…）。
3. 問使用者下一步要做哪一集，再依生產線推進。渲染前先問。

（若使用者把舊機的 `.claude\...\memory\` 一併複製過來，你會有更完整的歷史脈絡。）
