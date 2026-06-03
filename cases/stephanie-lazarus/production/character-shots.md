# 解說員出場表 — 制服下的祕密（Stephanie Lazarus 案）

> 解說員＝Pilot 調查員，頻道唯一出鏡人物（虛構，非真實當事人），素材類型一律 **AI 角色**。
> **一致性鐵則**：全片同一張 `brand/assets/host-reference.png`，不重產角色；所有出場皆以此圖＋該段 `.wav` 跑本機 lip-sync。
> 本集 3 次出場：開場 [HOST-01] ＋ 1 轉場 [HOST-2] ＋ 結尾 [HOST-結尾]。設定見 `brand/host-character.md`。

---

## 1. 一覽表格

| # | 插入位置（act 邊界） | 功能 | 神情·動態 | 估時(秒) |
|---|---|---|---|---|
| H1 | 全片最開頭，[HOST-01] → 緊接 [INTRO] 打字機 → ACT I | 開場：自我介紹＋案件背景＋邀觀眾一起拼湊，帶入 1986 初春洛杉磯 | 沉穩開場，輕微前傾；唸到「擱在一邊」「咬痕」處眼神加重、放慢 | 8–10 |
| H2 | ACT IV 結尾（[11] 比對／逮捕之後）→ ACT V 開頭（[12] 審判）之間 | 轉場：收束「DNA 把她連上現場」＋拋出懸念「冷凍二十多年的咬痕還靠得住嗎」 | 由篤定轉為設問，眉頭微蹙；「動搖陪審團」處壓低聲音 | 6–8 |
| H3 | ACT V 結尾（[15] 假釋時序）之後 → 緊接 [ENDING] 片尾 | 結尾：收束反思（父親一開始就指了名）＋簽名收束 | 沉穩收束，最後一句簽名直視鏡頭、語氣放緩 | 8–10 |

合計解說員時長約 22–28 秒。

---

## 2. 逐次規格

### H1 — 開場 [HOST-01]
- **對應台詞**（餵 TTS 稿）：
  > 撥開迷霧，看見真相！大家好，我是 Pilot 調查員。
  > 今天這樁案子，有個很詭異的地方——被害人的父親，一開始就把一個名字送到了警方手上。[停頓] 而警方，把那個名字擱在了一邊。
  > 二十三年。[停頓] 一份被當成搶劫的命案檔案，靜靜地冷在資料室裡。
  > [加重] 直到一枚被保存了二十多年的咬痕，把調查指向了一個沒人敢懷疑的方向。
  > 我們一步一步，把事情的全貌拼湊出來。[停頓] 現在，讓我們回到 1986 年那個初春的洛杉磯。
- **配音**：上述自然稿 → script-tts 同段 SSML → VoxCPM2 簽名聲線出 `.wav`（與旁白同一條聲線，沉穩磁性、第二人稱、克制不聳動）。
- **動畫**：唯一主參考圖 `brand/assets/host-reference.png` ＋ `H1.wav` → 本機 lip-sync，產 talking-head 片段。**不重產角色臉**。
- **剪輯**：全螢幕 cutaway，插在全片最開頭；播完緊接 [INTRO] 打字機日期卡，再進 ACT I。
- **命名**：`production/character-clips/H1.wav`、`production/character-clips/H1.mp4`

### H2 — 轉場 [HOST-2]（逮捕 → 審判）
- **對應台詞**（餵 TTS 稿）：
  > [停頓] DNA，把她和現場連在了一起。
  > 但故事，還沒有走到終點。[停頓] 在法庭上，辯方握著一個問題——[停頓] 一枚在冷凍庫裡躺了二十多年的咬痕樣本，還靠得住嗎？
  > [壓低聲音] 這個質疑，會不會動搖陪審團？
- **配音**：上述自然稿 → script-tts 同段 SSML → VoxCPM2 簽名聲線出 `.wav`。
- **動畫**：同一張 `brand/assets/host-reference.png` ＋ `H2.wav` → 本機 lip-sync。
- **剪輯**：全螢幕 cutaway，插在 ACT IV 與 ACT V 的 act 邊界（[11] 之後、[12] 之前），不打斷推理段落內部。
- **命名**：`production/character-clips/H2.wav`、`production/character-clips/H2.mp4`

### H3 — 結尾 [HOST-結尾]
- **對應台詞**（餵 TTS 稿）：
  > [停頓] 被害人的父親，從一開始就指了名。[停頓] 他把那個名字，送到了警方手上。
  > 而當時得到的回答是：你犯罪劇看太多了。
  > [停頓] 二十三年後，真相，才被一枚被保存下來的咬痕掀開。
  > [停頓] [加重] 最危險的兇手，有時候，就站在你最信任的那身制服後面。
  > [停頓] 我是 Pilot，我們，下一個案子見。
- **配音**：上述自然稿 → script-tts 同段 SSML → VoxCPM2 簽名聲線出 `.wav`。
- **動畫**：同一張 `brand/assets/host-reference.png` ＋ `H3.wav` → 本機 lip-sync。
- **剪輯**：全螢幕 cutaway，插在 ACT V 結尾（[15] 之後）；播完緊接 [ENDING] 片尾（懸念問句→真實素材→謝幕）。
- **命名**：`production/character-clips/H3.wav`、`production/character-clips/H3.mp4`

---

## 3. 本機合成備忘

**流程**（每次出場相同）：
1. 解說員台詞 → VoxCPM2 出 `.wav`（簽名聲線，跨專案共用）。
2. `brand/assets/host-reference.png`（唯一主參考圖，全片重用）＋ 對應 `.wav` → 本機 lip-sync → talking-head 片段。
3. 片段在剪輯以全螢幕 cutaway 插入對應 act 邊界；背景靜止（取自靜圖）即可。

**候選模型**：
- **EchoMimicV2** — 半身、中文嘴型佳（首選）。
- **Hallo2** — 人像、品質高（次選）。
- **SadTalker** — 最快 baseline，先驗證流程用。
- GPU 規格／安裝需求實作時以 WebSearch 取最新。

**命名建議**：
```
production/character-clips/H1.wav  H1.mp4
production/character-clips/H2.wav  H2.mp4
production/character-clips/H3.wav  H3.mp4
```

**素材類型**：全部標 **AI 角色**。
**一致性鐵則**：全片同一張 `brand/assets/host-reference.png`，臉永不漂移，不重產角色。
