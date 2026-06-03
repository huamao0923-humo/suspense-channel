# 解說員出場表 — 達娜·愛爾蘭謀殺案（Dana Ireland）

> 角色：**Pilot 調查員**（頻道唯一出鏡人物）。素材類型：**AI 角色**。
> **一致性鐵則**：全片 4 次出場一律用同一張 `brand/assets/host-reference.png` 跑本機 lip-sync，**不重產角色、臉永不漂移**。
> 聲音：同一條 VoxCPM2 簽名聲線（跨專案共用）。
> 本案共 **4 次** 解說員 cutaway（開場＋轉場 ×2＋結尾），全螢幕插在 act 邊界。

---

## 1) 一覽表格

| # | 插入位置（act 邊界） | 功能 | 神情·動態 | 估時(秒) |
|---|---|---|---|---|
| H1 | 全片開場（[HOST-01]，其後接 [INTRO] 打字機 → 正片 [01]） | 自我介紹＋案件背景帶入，收尾「回到一九九一年那個聖誕」 | 沉穩注視鏡頭，冷靜分析神情；簽名開場後一次停頓 | 8 |
| H2 | 幕一／幕二之間（[09] 之後、[10] 之前；[HOST-轉場 1]） | 解說 DNA 悖論——排除卻仍定罪的不合邏輯，收於「代價是三個人的人生」 | 微蹙眉、稍前傾，昏暗書房定格肖像，語氣下沉 | 7 |
| H3 | 幕二／幕三之間（[14] 之後、[15] 之前；[HOST-轉場 2]） | 為逮捕爭議預埋兩個法律概念（追訴時效、合理依據），推進死胡同懸念 | 收束沉著，豎指點數「兩件事」，眼神帶懸念 | 8 |
| H4 | 全片結尾（[20] 之後；[HOST-結尾]，其後接 [ENDING] 片尾） | 收束反思＋簽名告別 | 沉穩餘韻，最後一句直視鏡頭收尾 | 9 |

合計約 **32 秒** 解說員出鏡。

---

## 2) 逐次規格

### H1 — 開場（[HOST-01]）
- **台詞（[HOST-01]）**：
  > [沉穩磁性聲線，胸腔共鳴]
  > 撥開迷霧，我是 Pilot。
  > 今晚這樁案子，有一份從不說謊的 DNA、三個被它證明清白、卻仍坐了逾二十年牢的人，還有一個始終無法走進法庭的名字。
  > [停頓]
  > 現在，讓我們回到一九九一年那個聖誕。
- **配音**：上列台詞餵 TTS 稿（`script-tts.md` 對應段）→ VoxCPM2 簽名聲線 → 輸出 `production/character-clips/H1.wav`。
- **動畫**：`brand/assets/host-reference.png` ＋ `H1.wav` 跑本機 lip-sync → `production/character-clips/H1.mp4`。
- **剪輯**：全螢幕 cutaway 插在全片最開頭；H1 結束後接 [INTRO] 黑屏打字機日期卡，再進正片 [01]。

### H2 — 轉場 1（[HOST-轉場 1]）
- **台詞（[HOST-轉場 1]）**：
  > [全螢幕 Pilot cutaway，昏暗書房定格肖像，簽名聲線]
  > 我知道，這聽起來不合邏輯。一份排除了他們的 DNA，怎麼會敵不過一句話？
  > 但在那個年代，DNA 能說「不是這幾個人」，卻還不足以讓陪審團放手。
  > [停頓] 而代價，是三個人的人生。
- **配音**：餵 TTS 稿 → VoxCPM2 簽名聲線 → `production/character-clips/H2.wav`。
- **動畫**：`brand/assets/host-reference.png` ＋ `H2.wav` 本機 lip-sync → `production/character-clips/H2.mp4`。
- **剪輯**：全螢幕 cutaway，插在 [09]／[10] 的 act 邊界（幕一收尾、幕二開始之間），不打斷推理段內部。

### H3 — 轉場 2（[HOST-轉場 2]）
- **台詞（[HOST-轉場 2]）**：
  > [全螢幕 Pilot cutaway，簽名聲線]
  > 接下來，你只要先記住兩件事。
  > 第一，有些罪會因為時間太久，「過了追訴期」，再也告不了。
  > [停頓]
  > 第二，要逮捕一個人，法律要的不只是「相符」，而是足夠的「合理依據」。
  > [停頓 1.5 秒]
  > 等一下你就會明白，這兩件事，是怎麼把一樁案子，推進了死胡同。
- **配音**：餵 TTS 稿 → VoxCPM2 簽名聲線 → `production/character-clips/H3.wav`。
- **動畫**：`brand/assets/host-reference.png` ＋ `H3.wav` 本機 lip-sync → `production/character-clips/H3.mp4`。
- **剪輯**：全螢幕 cutaway，插在 [14]／[15] 的 act 邊界（幕二收尾、幕三開始之間）。

### H4 — 結尾（[HOST-結尾]）
- **台詞（[HOST-結尾]）**：
  > [全螢幕 Pilot cutaway，簽名聲線]
  > 三個無辜的人終於被平反，但被偷走的那些年，沒有人能還給他們。
  > 而那個 DNA 相符的名字，也永遠無法在法庭上，回答任何一個問題。
  > [停頓]
  > 我是 Pilot，我們，下一樁懸案見。
- **配音**：餵 TTS 稿 → VoxCPM2 簽名聲線 → `production/character-clips/H4.wav`。
- **動畫**：`brand/assets/host-reference.png` ＋ `H4.wav` 本機 lip-sync → `production/character-clips/H4.mp4`。
- **剪輯**：全螢幕 cutaway，插在正片 [20] 之後；H4 結束後接 [ENDING] 片尾（懸念問句 → 真實素材 → 謝幕，收尾 BGM 轉強）。

---

## 3) 本機合成備忘

**流程（每段共用）**
1. 解說員台詞 → VoxCPM2 出 `.wav`（簽名聲線）→ `production/character-clips/H{1..4}.wav`。
2. `brand/assets/host-reference.png` ＋ 對應 `.wav` → 本機 lip-sync → `production/character-clips/H{1..4}.mp4`。
3. 剪輯以全螢幕 cutaway 插入各 act 邊界（H1 開場、H2＝[09]/[10]、H3＝[14]/[15]、H4＝結尾）。背景靜止（取自靜圖）對「坐鎮辦公桌」完全合用。

**候選模型（本機 GPU）**
- **EchoMimicV2**：半身、中文嘴型佳（首選）。
- **Hallo2**：人像、品質高（次選）。
- **SadTalker**：最快 baseline（兜底）。
- 安裝需求／GPU 規格實作時以 WebSearch 取最新。

**命名建議**
```
production/character-clips/H1.wav   production/character-clips/H1.mp4
production/character-clips/H2.wav   production/character-clips/H2.mp4
production/character-clips/H3.wav   production/character-clips/H3.mp4
production/character-clips/H4.wav   production/character-clips/H4.mp4
```

> 一致性鐵則重申：**全片同一張 `brand/assets/host-reference.png`，不重產角色**；改造型＝重啟定裝並同步更新 `brand/host-character.md` 與本檔。
