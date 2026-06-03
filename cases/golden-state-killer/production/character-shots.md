# 解說員出場表 — 黃金州殺手（Golden State Killer）

> WF4 production-package 產出。解說員 Pilot 的全螢幕 cutaway 規格表。
> 設定見 [brand/host-character.md](../../../brand/host-character.md)；台詞源 [script-natural.md](../script-natural.md)。
> 素材類型：**AI角色**。一致性鐵則：**全片同一張 `brand/assets/host-reference.png`，不重產角色。**
> 本案共 **4 次**解說員出場（開場 1 ＋ 中場轉場 2 ＋ 結尾 1）；合計約 **18–36 秒**（估時區間取自腳本演播提示）。

---

## 1) 一覽表格

| # | 插入位置（act 邊界） | 功能 | 神情·動態 | 估時(秒) |
|---|---|---|---|---|
| H1 | 片頭 → [INTRO] 打字機日期卡 之前 | 開場 reveal：簽名自我介紹＋拋核心謎團（垃圾桶衛生紙／公開基因庫／McNamara）＋帶入 1974 夏天加州 | 沉穩直視鏡頭，眉宇凝重，停頓時微微前傾 | 6–10 |
| H2 | ACT II 結尾 [09] → ACT III 開頭 [10] 之間 | 中場轉場（停手→冷案重燃）：三十年沉寂收束＋帶出 Michelle McNamara | 沉著側目，「直到一個女人」時眼神微抬定住 | 3–8 |
| H3 | ACT III 結尾 [15] → ACT IV 開頭 [16] 之間 | 中場轉場（科技→司法）：DNA 指出名字收束＋拋「等答案的人」 | 若有所思，壓低聲音時眉頭微蹙 | 3–8 |
| H4 | ACT IV 結尾 [19] → [ENDING] 片尾 之間 | 結尾：四十年等待收束＋隱私時代留白＋簽名 | 沉穩回正視鏡頭，放慢簽名時神情堅定 | 6–10 |

> 出場全為全螢幕 cutaway，插在 act 邊界，**不打斷推理段落內部**。背景靜止（noir 書房），合用「坐鎮辦公桌」。
> 開場順序：解說員 H1 先 → [INTRO] 黑屏打字機日期卡（1974–1986／加州）→ 正片 ACT I。

---

## 2) 逐次規格

### H1 — 開場 reveal（對應 [HOST-01]）
- **對應台詞**（[HOST-01]，script-natural.md 11–18 行）：
  > 撥開迷霧，看見真相！大家好，我是 Pilot 調查員。
  >
  > 今晚這樁案子，是美國刑案史上最不尋常的逮捕之一——[停頓] 一個塵封四十年的冷案，最後靠的，是一份被丟進垃圾桶的衛生紙、一個公開的基因資料庫，還有一個叫 Michelle McNamara 的女人。
  >
  > [放慢] 我們一步一步，拼湊出事情的全貌。現在，讓我們回到 1974 年那個夏天，加州。
- **配音**：餵 TTS 稿（[HOST-01] 對應的 `script-tts.md` SSML）→ VoxCPM2 簽名聲線出 `production/character-clips/H1.wav`。
- **動畫**：`brand/assets/host-reference.png` ＋ `H1.wav` → 本機 lip-sync → `production/character-clips/H1.mp4`。
- **剪輯**：全螢幕 cutaway，插在片頭與 [INTRO] 打字機日期卡之前（順序：H1 → [INTRO] → ACT I）。素材類型：**AI角色**。

### H2 — 中場轉場 停手→冷案重燃（對應 [HOST-中場1]）
- **對應台詞**（[HOST-中場1]，script-natural.md 129–132 行）：
  > 此後三十年，這個名字，像是從世上消失了。警方放棄了。[停頓] 直到一個女人，決定不放手——她叫 Michelle McNamara。
- **配音**：餵 TTS 稿（[HOST-中場1]）→ VoxCPM2 → `production/character-clips/H2.wav`。
- **動畫**：`host-reference.png` ＋ `H2.wav` → 本機 lip-sync → `production/character-clips/H2.mp4`。
- **剪輯**：全螢幕 cutaway，插在 ACT II 結尾 [09] 與 ACT III 開頭 [10] 之間。素材類型：**AI角色**。

### H3 — 中場轉場 科技→司法（對應 [HOST-中場2]）
- **對應台詞**（[HOST-中場2]，script-natural.md 204–207 行）：
  > 科技，指出了一個名字。[停頓] 但接下來要面對的，是四十年來，一直在等一個答案的那些人。
- **配音**：餵 TTS 稿（[HOST-中場2]）→ VoxCPM2 → `production/character-clips/H3.wav`。
- **動畫**：`host-reference.png` ＋ `H3.wav` → 本機 lip-sync → `production/character-clips/H3.mp4`。
- **剪輯**：全螢幕 cutaway，插在 ACT III 結尾 [15] 與 ACT IV 開頭 [16] 之間。素材類型：**AI角色**。

### H4 — 結尾（對應 [HOST-結尾]）
- **對應台詞**（[HOST-結尾]，script-natural.md 251–256 行）：
  > 四十年的等待，終於有了答案。[停頓] 而我們每一個人，也都被推到了同一個問題面前——在這個基因可以被查詢、被比對的時代，隱私，還握在自己手裡嗎？
  >
  > [放慢] 我是 Pilot，我們，下一個案子見。
- **配音**：餵 TTS 稿（[HOST-結尾]）→ VoxCPM2 → `production/character-clips/H4.wav`。
- **動畫**：`host-reference.png` ＋ `H4.wav` → 本機 lip-sync → `production/character-clips/H4.mp4`。
- **剪輯**：全螢幕 cutaway，插在 ACT IV 結尾 [19] 與 [ENDING] 片尾之間（其後接 [ENDING]：懸念問句→真實素材→謝幕）。素材類型：**AI角色**。

---

## 3) 本機合成備忘

**流程（每段 H1–H4 同一套）**
1. 解說員台詞 → 餵對應 TTS 稿 → **VoxCPM2**（簽名聲線，跨集共用）出 `.wav`。
2. **同一張** `brand/assets/host-reference.png` ＋ 該段 `.wav` → 本機 **lip-sync** → talking-head `.mp4`。
3. 片段在剪輯以**全螢幕 cutaway** 插入對應 act 邊界；背景靜止（noir 書房靜圖），合用「坐鎮辦公桌」。

**候選模型（依序試）**
- **EchoMimicV2** — 半身、中文嘴型佳（首選）。
- **Hallo2** — 人像、品質高（次選）。
- **SadTalker** — 最快 baseline（保底）。
- 安裝需求／GPU 規格於實作時以 WebSearch 取最新。

**命名建議**（存於 `cases/golden-state-killer/production/character-clips/`）
| 段 | 對應腳本標記 | 配音 | 影片 |
|---|---|---|---|
| H1 | [HOST-01] | `H1.wav` | `H1.mp4` |
| H2 | [HOST-中場1] | `H2.wav` | `H2.mp4` |
| H3 | [HOST-中場2] | `H3.wav` | `H3.mp4` |
| H4 | [HOST-結尾] | `H4.wav` | `H4.mp4` |

> 一致性鐵則：**四段共用同一張 `host-reference.png`、同一條 VoxCPM2 聲線；不重產角色，臉與聲永不漂移。**
