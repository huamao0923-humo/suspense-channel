# CLAUDE.md — 懸案推理頻道製作規範

> 本檔是「Miao Channel」懸案推理頻道的製作總綱。所有 workflow 與其 agent 動工前，**必先讀取對應的 `brand/` 文件**，並嚴格遵守 `brand/legal-redlines.md`。
>
> **一律以繁體中文回覆使用者。**

---

## ◆ 頻道一句話

繁體中文、faceless（不露臉）的**國外懸案推理長片**頻道：用嚴謹、尊重、理性的敘事，帶觀眾一步步看懂一樁懸案。對標 @xdiaocha、謎案追蹤、奇聞觀察室、迷霧調查組。

詳見 [brand/channel-identity.md](brand/channel-identity.md)。

---

## ◆ 內容生產線（5 個 workflow + 3 個人工關卡）

```
WF1 case-radar ──▶【關卡1 你勾選案件】──▶ WF2 deep-research ──▶（複閱 dossier）
   └▶ WF2 並踏查真實素材：產 real-footage-sources.md＋seed.json（含 `avoidTerms` 排除詞），自動灌 real-library（PD/CC0/聯邦/CC-BY 安全授權）──▶【關卡 你覆核庫＋精挑補抓：node tools/real-picker.mjs】**時代正確性把關：剔除時代錯置的現代地標/天際線、建築工地/開挖、近年街景；缺口寧可留給 render 退 AI 示意，也不上不貼題的現代照**
   └▶ WF3 story-arc（故事編排：起承轉合＋懸念＋反轉＋解說員位置 → story-arc.md）
   └▶ WF4 script-studio（依 story-arc 寫稿，含解說員段）──▶【關卡2 腳本定稿】+【關卡3 法律審查】
   └▶ WF5 production-package ──▶（外部）build-episode → make-demo 渲染（含調查員定格出鏡）→ TTS/算圖/剪輯/縮圖/上片
```

- 渲染前置：`node tools/build-episode.mjs --slug <slug>`（把 `script-natural.md` 含 `[HOST]` 段轉成 `cases/<slug>/episode.json` 並重建 `web/episodes.js`），再 `node tools/make-demo.mjs --slug <slug>`。
- 調查員 Pilot 以**定格肖像＋簽名聲線**全螢幕 cutaway 出場；主參考圖 `brand/assets/host-reference.png`（`node tools/gen-host.mjs` 生成）。
- **make-demo 標準防線（皆為刻意預設，環境變數可調）**：①調查員只正放＋環點溶接無縫循環（不倒放/不硬接，`PILOT_HOST_PINGPONG=1` 才回舊行為）②字幕保證 ≤2 行（`PILOT_SUBWRAP`）③地圖 3840 超採樣消抖、單段最多 `PILOT_MAPMAX`（預設 8s）④素材黑名單＝通用詞＋seed.avoidTerms、同一素材最多用 2 次，用滿退 AI 示意（`PILOT_LIB_BLOCK` 覆寫）⑤**渲染鎖**：`build/clips`、`heads`、`visuals` 等跨案共用，**不可並行兩案 make-demo**；啟動會上鎖（`.render.lock`），偵測到別的渲染進行中就退出（`PILOT_NOLOCK=1` 跳過）。單格失敗自動退灰底、不中斷全片。

- workflow 腳本在 [.claude/workflows/](.claude/workflows/)，以名稱呼叫、用 `args` 帶入案件。
- **Claude Code 的終點是「製作藍圖包」**：腳本、分鏡、配圖提示詞、縮圖brief、SEO、來源清單。
- 配音、算圖、剪輯由外部工具執行，不在 workflow 範圍內。

每個案件一個資料夾：`cases/<case-slug>/`。進度看板：[pipeline/status.md](pipeline/status.md)。

---

## ◆ 鐵則（每個 agent 都適用）

1. **法律紅線優先**：未定罪者一律「涉嫌／被指控」，被動語態，引用判決書/起訴書，去識別化。違反即重寫。完整規則見 [brand/legal-redlines.md](brand/legal-redlines.md)。
2. **事實與推測分離**：凡主張必附來源；無硬來源者標記「推測」並註明出處。腳本不得超出 `factcheck.md` 已證實的事實。
3. **尊重受害者**：理性、不聳動、不消費悲劇。
4. **題材限國外案件**（本階段）：降低法律與隱私風險。
5. **沿用既有風格與模板**：輸出格式依 [templates/](templates/)，語氣依 [brand/voice-guide.md](brand/voice-guide.md)，視覺依 [brand/visual-style.md](brand/visual-style.md)。

---

## ◆ 工具規則

- 研究類 agent 必須用 WebSearch / WebFetch 查證，附上可點擊來源連結。
- 不確定就標記不確定，**不得編造**案件事實、日期、姓名、來源。
