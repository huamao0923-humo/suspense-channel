# 解說員出場表 — Harold Shipman「死亡醫生」案

> WF5 production-package 產出。本案有 **4 次**解說員（Pilot 列車長）出場：[HOST-01]、[HOST-02]、[HOST-03]、[HOST-結尾]。
> **素材類型：全部標 AI角色。**
> **一致性鐵則：全片同一張 `brand/assets/host-reference.png`，同一條 VoxCPM2 簽名聲線，不重產角色、臉永不漂移。**
> 動畫：每段一律拿同一張 `host-reference.png` ＋ 該段 `.wav` 跑本機 lip-sync；剪輯一律全螢幕 cutaway 插在對應 act 邊界（不打斷推理段內部）。

---

## 1. 一覽表格

| # | 插入位置（act 邊界） | 功能 | 神情·動態 | 估時(秒) |
|---|---|---|---|---|
| H1 [HOST-01] | [00]冷開場鉤子 之後、[INTRO]打字機日期卡 之前（開場） | 自我介紹＋案件背景帶入；結尾接「現在，讓我們回到一九九八年那個夏天」轉進正片 | 沉穩、正視鏡頭，輕微頷首；開場列車長的招呼感，眼神穩定 | 9 |
| H2 [HOST-02] | [03]假遺囑疑點 之後、[04]同業醫生通報 之前（轉場：警訊被放過 → 回溯職涯） | 一句收束（警訊曾響過、檔案合上）＋一句懸念（往回看一九七六年） | 收斂、半邊臉入暗，語氣壓低；陳述「檔案合上」時微停、眼神下沉 | 8 |
| H3 [HOST-03] | [14]逮捕 之後、[15]審判 之前（轉場：偵破完成 → 進入審判） | 一句收束（線索都指向他）＋設問（要證明謀殺從不簡單／法庭上會發生什麼） | 理性、略前傾，設問時眉峰微提；製造進入審判的張力 | 8 |
| H4 [HOST-結尾] | [16]反思 之後、[ENDING]片尾 之前（結尾） | 收束反思（信任被一個人慢慢用掉）＋到站收束＋簽名「我是 Pilot，調查列車不會停」 | 沉靜、收束感，末句抬眼正視鏡頭、堅定；簽名時定格出鏡 | 10 |

**出場合計估時：約 35 秒**（9 + 8 + 8 + 10）。

---

## 2. 逐次規格

### H1 — [HOST-01] 開場（背景＋帶入）

**台詞（對應 [HOST-01]）**
> 各位旅客，歡迎登上 Pilot 調查列車，我是列車長。
> 下一站，海德——英格蘭一座安靜的小鎮，一樁躲了二十餘年的懸案。[停頓]
> 一位最受信賴的家庭醫生，一份粗劣偽造的遺囑，和一個沒有人在看的體制。
> 請坐穩，車要開了。[放慢] 現在，讓我們回到一九九八年那個夏天。

- **配音**：餵 TTS 稿 → VoxCPM2 簽名聲線出 `production/character-clips/H1.wav`。語氣沉穩磁性、列車長招呼感；`[停頓][放慢]` 依 SSML 標記停頓與放慢；末句「回到一九九八年那個夏天」放慢、帶懸念，無縫接 [INTRO] 打字機日期卡。
- **動畫**：同一張 `brand/assets/host-reference.png` ＋ `H1.wav` → 本機 lip-sync → `production/character-clips/H1.mp4`。背景靜止（坐鎮辦公桌）。
- **剪輯**：全螢幕 cutaway，插在 [00] 之後、[INTRO] 之前。順序＝解說員 H1 → [INTRO] 打字機 → [01] 正片。
- **素材類型**：AI角色。

---

### H2 — [HOST-02] 轉場（警訊被放過 → 回溯職涯）

**台詞（對應 [HOST-02]）**
> 火化的表格，堆了起來。一位醫生提出疑慮。警察，來過一次。
> 然後，檔案，合上了。[停頓]
> 可是這個人，是怎麼一步步走到這裡的？要明白，得往回看——看一九七六年。

- **配音**：餵 TTS 稿 → VoxCPM2 簽名聲線出 `production/character-clips/H2.wav`。語氣壓低、克制；「檔案，合上了」後 `[停頓]`，末句設問引導觀眾往回看。
- **動畫**：同一張 `brand/assets/host-reference.png` ＋ `H2.wav` → 本機 lip-sync → `production/character-clips/H2.mp4`。背景靜止。
- **剪輯**：全螢幕 cutaway，插在 [03] 之後、[04] 之前（act 邊界，不打斷推理段內部）。
- **素材類型**：AI角色。

---

### H3 — [HOST-03] 轉場（偵破完成 → 進入審判）

**台詞（對應 [HOST-03]）**
> 現在，所有的線索，都指向了他。
> 但你要知道——要證明謀殺，尤其是殺害一個已經下葬的人，從來，都不簡單。[停頓]
> 法庭上，會發生什麼？

- **配音**：餵 TTS 稿 → VoxCPM2 簽名聲線出 `production/character-clips/H3.wav`。語氣理性、略帶張力；「都不簡單」後 `[停頓]`，末句設問「法庭上，會發生什麼？」上揚收尾，帶進審判段。
- **動畫**：同一張 `brand/assets/host-reference.png` ＋ `H3.wav` → 本機 lip-sync → `production/character-clips/H3.mp4`。背景靜止。
- **剪輯**：全螢幕 cutaway，插在 [14] 之後、[15] 之前（act 邊界）。
- **素材類型**：AI角色。

---

### H4 — [HOST-結尾] 結尾（收束反思＋簽名）

**台詞（對應 [HOST-結尾]）**
> 兩百多條人命的疑問，最後，敗給了一張假遺囑。這不是巧合。
> 這是一個體制，如何讓「信任」這兩個字，被一個人，慢慢地用掉。一個制度給了他完整的自由，卻沒有任何人，在看。[停頓]
> 海德站，到了。
> 有些問題，我們在這一站找到了答案；有些——你信任的那個人，真的在保護你嗎？——只能帶往下一站。
> [加重] 我是 Pilot，調查列車不會停。我們，下一站見。

- **配音**：餵 TTS 稿 → VoxCPM2 簽名聲線出 `production/character-clips/H4.wav`。語氣沉靜收束；「海德站，到了」為到站收束，末句簽名 `[加重]` 堅定有力。其後接 [ENDING] 片尾（懸念問句 → 真實素材 → 謝幕）。
- **動畫**：同一張 `brand/assets/host-reference.png` ＋ `H4.wav` → 本機 lip-sync → `production/character-clips/H4.mp4`。背景靜止；末句簽名定格出鏡。
- **剪輯**：全螢幕 cutaway，插在 [16] 之後、[ENDING] 之前（結尾）。
- **素材類型**：AI角色。

---

## 3. 本機合成備忘

**流程（每段 H1–H4 相同）**
1. 解說員台詞 → VoxCPM2 簽名聲線 → `production/character-clips/H<n>.wav`（簽名聲線跨案共用，不另養）。
2. `brand/assets/host-reference.png`（**唯一一張，全片重用**）＋ `H<n>.wav` → 本機 lip-sync → `production/character-clips/H<n>.mp4`。背景靜止（取自靜圖，坐鎮辦公桌完全合用）。
3. 剪輯時以全螢幕 cutaway 插入對應 act 邊界（見上各段「剪輯」）。

**候選模型**
- **EchoMimicV2** — 半身、中文嘴型佳（首選）。
- **Hallo2** — 人像、品質高（次選）。
- **SadTalker** — 最快 baseline。
- GPU 規格／安裝需求實作時以 WebSearch 取最新。

**命名建議**
```
production/character-clips/H1.wav   production/character-clips/H1.mp4
production/character-clips/H2.wav   production/character-clips/H2.mp4
production/character-clips/H3.wav   production/character-clips/H3.mp4
production/character-clips/H4.wav   production/character-clips/H4.mp4
```

**一致性鐵則**：全片同一張 `brand/assets/host-reference.png` ＋ 同一條 VoxCPM2 簽名聲線；不重產角色，臉與聲音永不漂移。
