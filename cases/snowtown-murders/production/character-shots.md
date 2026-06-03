# 解說員出場表 — 雪鎮謀殺案（character-shots）

> WF4 production-package 產出。解說員 Pilot 的全螢幕 cutaway 規格表。
> 設定見 [brand/host-character.md](../../../brand/host-character.md)；台詞源 [script-natural.md](../script-natural.md) 的 `[HOST-XX]` 段。
> 素材類型：**AI角色**。一致性鐵則：**全片同一張 `brand/assets/host-reference.png`，不重產角色。**
> 本案共 **4 次**解說員出場（開場 reveal 1 ＋ 中段轉場 2 ＋ 結尾 1）；合計約 **29 秒**。

---

## 1) 一覽表格

| # | 插入位置（act 邊界） | 功能 | 神情·動態 | 估時(秒) |
|---|---|---|---|---|
| H1 | 全片最前 → [INTRO] 打字機日期卡 之前（ACT 1 起點） | 開場 reveal：自我介紹＋簡述背景＋帶入一九九二冬末 | 沉著直視鏡頭，眉宇凝重，微微前傾 | 8 |
| H2 | [03] 失蹤不成新聞（ACT 1 末）→ [04] 被選中的人（ACT 2 起）之間 | 轉場（輪廓→線索）：收束世界輪廓＋拋「為何串不起來」懸念 | 凝重，設問時眼神微抬，尾句加重 | 6 |
| H3 | [08] 地理對照（ACT 2→3）→ [09] 最後一塊拼圖（ACT 3 起）之間 | 轉場（線索→發現）：七年藏於光天化日＋拋「那扇門」 | 若有所思，壓低聲音時目光定住 | 6 |
| H4 | [16] 共犯與證人（ACT 4 末）→ [ENDING] 片尾 之間 | 結尾：收束判決反思＋記住名字＋簽名 | 沉穩回正視鏡頭，結尾簽名時神情堅定 | 9 |

> 出場全為全螢幕 cutaway，插在 act 邊界，**不打斷推理段落內部**。背景靜止（noir 書房），合用「坐鎮辦公桌」。
> H1 為開場，其後緊接 [INTRO] 黑屏打字機日期卡才進正片（順序＝解說員先 → 打字機 → 正片）。

---

## 2) 逐次規格

### H1 — 開場 reveal（對應 [HOST-01]）
- **對應台詞**（[HOST-01]）：
  > 撥開迷霧，看見真相！[停頓] 大家好，我是 Pilot 調查員。
  > 今天的故事來自澳洲——一群被社會遺忘的人，在將近七年裡一個接一個消失，而沒有人敲響警鐘。[停頓] 警方循一樁失蹤案找到答案，卻發現自己揭開的，遠比想像中更深。我們一步一步，拼湊出事情的全貌。
  > 現在，讓我們回到一九九二年那個冬末，南澳的阿得萊德北郊。
- **配音**：餵 TTS 稿（[HOST-01] 對應的 `script-tts.md` SSML）→ VoxCPM2 簽名聲線出 `production/character-clips/H1.wav`。
- **動畫**：`brand/assets/host-reference.png` ＋ `H1.wav` → 本機 lip-sync → `production/character-clips/H1.mp4`。
- **剪輯**：全螢幕 cutaway，插在全片最前、[INTRO] 打字機日期卡之前。素材類型：**AI角色**。

### H2 — 轉場 輪廓→線索（對應 [HOST-中段-01]）
- **對應台詞**（[HOST-中段-01]）：
  > 我們看清了這個世界的輪廓。[停頓] 但問題來了——這些失蹤案，是怎麼一個接一個發生，而警方卻一直沒能把它們串起來？
  > 跟我繼續追下去。
- **配音**：餵 TTS 稿（[HOST-中段-01]）→ VoxCPM2 → `production/character-clips/H2.wav`。
- **動畫**：`host-reference.png` ＋ `H2.wav` → 本機 lip-sync → `production/character-clips/H2.mp4`。
- **剪輯**：全螢幕 cutaway，插在 [03] 與 [04] 邊界（ACT 1→ACT 2）。素材類型：**AI角色**。

### H3 — 轉場 線索→發現（對應 [HOST-中段-02]）
- **對應台詞**（[HOST-中段-02]）：
  > 將近七年，這一切都藏在光天化日之下。[停頓]
  > 直到一九九九年，有人找到了那扇——本不該被打開的門。
- **配音**：餵 TTS 稿（[HOST-中段-02]）→ VoxCPM2 → `production/character-clips/H3.wav`。
- **動畫**：`host-reference.png` ＋ `H3.wav` → 本機 lip-sync → `production/character-clips/H3.mp4`。
- **剪輯**：全螢幕 cutaway，插在 [08] 與 [09] 邊界（ACT 2→ACT 3）。素材類型：**AI角色**。

### H4 — 結尾（對應 [HOST-結尾]）
- **對應台詞**（[HOST-結尾]）：
  > 二○○三年九月八日，南澳最高法院判定 John Bunting 十一項謀殺、Robert Wagner 十項謀殺，皆無假釋終身監禁。[停頓] 這場審判，是南澳史上最長的一次——從二○○二年十月開庭，到二○○三年九月結案，將近十二個月。
  > 但在判決的背後，是十二個生前無人聞問、死後才被看見的人。[停頓]
  > 願我們記得的，是他們的名字。而不只是，那些桶。
  > 我是 Pilot，我們，下一個案子見。
- **配音**：餵 TTS 稿（[HOST-結尾]）→ VoxCPM2 → `production/character-clips/H4.wav`。
- **動畫**：`host-reference.png` ＋ `H4.wav` → 本機 lip-sync → `production/character-clips/H4.mp4`。
- **剪輯**：全螢幕 cutaway，插在 [16] 結尾與 [ENDING] 片尾之間。素材類型：**AI角色**。

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

**命名建議**（存於 `cases/snowtown-murders/production/character-clips/`）
| 段 | 配音 | 影片 |
|---|---|---|
| H1 | `H1.wav` | `H1.mp4` |
| H2 | `H2.wav` | `H2.mp4` |
| H3 | `H3.wav` | `H3.mp4` |
| H4 | `H4.wav` | `H4.mp4` |

> 一致性鐵則：**四段共用同一張 `host-reference.png`、同一條 VoxCPM2 聲線；不重產角色，臉與聲永不漂移。**
