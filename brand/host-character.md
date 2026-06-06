# 解說員角色設定 — host-character

> 新增（解說員專案）。WF3 腳本生成、WF4 製作包的 agent 在處理 `[HOST]` 段落前必讀。
> 解說員是頻道唯一的出鏡人物，負責**轉場**與**製造懸疑**；其餘內容仍為 faceless 旁白。
> 「faceless」鐵則針對的是真實受害者/嫌疑人與創作者本人；虛構解說員兩者皆非，故不違反 legal-redlines。
> 一致性鐵則見文末——**每一集、每一次出場，都從同一張主參考圖做 lip-sync。**

---

## 1. 角色定位
- 名字：**Pilot**（沿用頻道名「Pilot 調查列車」；Pilot＝列車長／領航員）。
- 身分：他就是本頻道的旁白者本人，現在「給了臉」——一位冷靜、理性的調查者，也是這列**調查列車的列車長**，帶你駛過一樁懸案的迷霧。
- 功能：影片中段以全螢幕 cutaway 現身，做段落轉場與懸念鋪陳；不取代旁白，只在關鍵節點露面。
- 開場簽名（固定列車開場，見 [show-format.md](show-format.md)）：「**各位旅客，列車即將發車。歡迎登上 Pilot 調查列車——一列只駛過迷霧、開往真相的夜車。我是列車長，Pilot。**」接「**今晚，我們的終點站是 ◯◯。下一站，◯◯站——讓我們一起，探查這樁懸案的始末。**」
- 開場鉤子（HOST-01 結尾）：以「**請坐穩，車要開了。現在，讓我們回到 ◯◯ 年那個 ◯◯…**」帶入正片（年份照 factcheck 實填，季節依案件）。
- 結尾簽名：「**我是 Pilot，調查列車不會停。我們，下一站見。**」（其前可接「**◯◯站，到了。**」的到站收束）

> 名字／口頭禪可改；若改，同步更新本檔與各案 `character-shots.md`。

## 2. 聲音（沿用簽名聲線，不另養）
- 解說員＝旁白者，**同一條 VoxCPM2 簽名聲線**（跨專案共用，見 voice-engine 記憶）。
- 語氣完全依 `voice-guide.md`：沉穩磁性、抑揚頓挫、第二人稱拉近、克制不聳動。
- 出鏡台詞同樣寫進 `script-tts.md`，用相同 SSML 標記，與旁白無縫銜接。

## 3. 視覺（暗色電影感全臉）
- 風格：完整 AI 人臉，但用頻道冷色調紀錄片打光（半逆光、chiaroscuro，半邊臉入暗），非明亮商業主播感。
- 與 `visual-style.md` 對齊：以其 base prompt 為底（冷色調、暗部、顆粒、淺景深）。
- 場景：昏暗書房、深色木桌、暖綠檯燈、攤開的舊地圖、打字機與地球儀（呼應「領航／調查」意象）。

### 主參考圖提示詞（鎖定唯一一張，全片重用）
```
cinematic documentary still, dark moody lighting, cold desaturated palette, film grain,
shallow depth of field, realistic, investigative tone, 16:9 --ar 16:9.
A fictional male investigator in his mid-40s, calm analytical expression, seated at a dark
wooden desk in a dim noir study at night. Cold blue rim-light on one side of the face, the
other half in deep shadow (chiaroscuro). A warm green banker's lamp glows on the desk; an
antique unrolled map lies under his hands; a vintage typewriter and a globe sit softly out
of focus behind. Dark navy suit. He looks slightly toward camera, composed. Centered medium
shot, head-and-shoulders to mid-torso. --seed <產圖後填入鎖定 seed>
```
- 產圖工具：Midjourney／Flux／SD 皆可。挑一張定裝後**鎖定 seed**，最終 PNG 存成 `brand/assets/host-reference.png`，並把 seed 與工具版本回填到上面 `<…>`。
- 此後**不再重產角色**：所有出場都拿這張 PNG 去 lip-sync，臉永不漂移。
- 若日後需不同景別變體，再用 Midjourney `--cref <host-reference 連結> --cw 100` 衍生；v1 先用單一固定景別最簡單。

## 4. 出場規則（每集 3–4 次，全螢幕 cutaway；開頭與結尾必有）
| 位置 | 功能 | 估時 |
|---|---|---|
| 開場 [HOST-01] | 自我介紹＋簡述案件背景，**結尾必接一句「現在讓我們回到 <案發年份> 年那個 <季節>…」帶入正片**（年份照 factcheck 實際填，19XX 或 20XX 皆可；季節依案件，未必是冬天） | 6–10 秒 |
| 段落轉場 ×1–2 | 一句收束＋一句懸念，承接下一段 | 各 3–8 秒 |
| 結尾 [HOST-結尾] | 收束反思＋簽名（其後接 [ENDING] 片尾：懸念問句→真實素材→謝幕） | 6–10 秒 |
- 插在 act 邊界，**不打斷推理段落內部**。
- 台詞用「延遲揭露」（你以為…但其實…）與設問，把觀眾拉進下一段。
- 開場後緊接 **[INTRO] 黑屏打字機日期卡**（日期＋地點逐字浮現）才進正片；順序＝解說員先 → 打字機 → 正片。

## 5. 台詞紅線（與 legal-redlines 完全一致）
- 未定罪者一律「涉嫌／被指控」；已定讞者方可依法院認定陳述。
- 不得超出 `factcheck.md` 已證實事實；不得編造。
- 尊重受害者、去識別化；不美化犯罪。
- 解說員台詞同樣納入 `legal-review.md` 自檢。

## 6. 本機合成流程（lip-sync）
1. 解說員台詞 → VoxCPM2 出 `.wav`（簽名聲線）。
2. `host-reference.png` ＋ `.wav` → 本機 lip-sync → talking-head 片段。
   - 先試 **EchoMimicV2**（半身、中文嘴型佳）或 **Hallo2**（人像、品質高）；**SadTalker** 作最快 baseline。
   - 安裝需求／GPU 規格實作時以 WebSearch 取最新。
3. 片段在剪輯以全螢幕 cutaway 插入各 act 邊界。背景靜止（取自靜圖）對「坐鎮辦公桌」完全合用。

---

## ◆ 一致性鐵則
**同一張主參考圖、同一條聲線，貫穿所有影片。** 角色圖一旦鎖定就不更換；要改造型＝重啟一次定裝，並更新本檔與 `brand/assets/`。

---

## ◆ 卡通版（v2）

> 本節為 §3「日後明確轉風格」的正式版本：解說員改為**2D 卡通**造型，與全片卡通 b-roll 風格統一。沿用同一條 VoxCPM2 簽名聲線（聲音不變），故與一致性鐵則併存。

### 1. 卡通定裝圖提示詞（→ `brand/assets/host-reference.png`）
```
2D animated cartoon style, hand-drawn animated TV-series look, thick clean black outlines,
flat cel shading, limited muted color palette, graphic-novel illustration, strictly
NON-photorealistic, NOT 3D, NOT a photo. A fictional male investigator in his mid-40s, calm
serious analytical expression, short greying dark hair, light stubble, dark navy three-piece
suit, charcoal fedora hat. Seated at a dark wooden desk in a dim noir study at night. Warm
green banker's lamp on the desk, antique world map on the wall, vintage globe and old books
behind, rainy window with cold blue light. Dramatic chiaroscuro, cool rim-light on one side
of the face, the other half in shadow. Somber dignified suspenseful mood. Centered medium
shot, head-and-shoulders to mid-torso, looking slightly toward camera. 16:9
```
Negative：`photorealistic, photograph, realistic skin, 3d render, live action, chibi, cute mascot, childish, bright saturated colors, real celebrity, text, watermark, extra fingers, deformed hands`

### 2. 卡通講話影片提示詞（image-to-video，首幀＝上圖 → `brand/assets/host-reference.mp4`）
```
2D animated cartoon, keep the EXACT hand-drawn cartoon style of the input image — thick black
outlines, flat cel shading, limited palette, animated-series look, strictly non-photorealistic.
A seamless looping clip of the cartoon investigator talking directly to the camera: natural calm
lip movement as if narrating, subtle mouth animation, gentle expression, occasional blink and
small head nods, eyes looking straight into the camera. Begin and end with a relaxed closed-mouth
neutral pose for a seamless loop. LOCKED-OFF camera, fixed framing, absolutely no camera movement
— no zoom, no push-in, no pan, no tilt, no dolly, no parallax, no handheld. Static background.
16:9, ~5s, seamless loop.
```
Negative：`photorealistic, realistic, live action, 3d, losing cartoon style, camera movement, zoom, push in, pan, tilt, dolly, tracking, parallax, handheld, shaky, scene change, cut, exaggerated mouth, lip sync glitch, morphing face, distorted hands, extra fingers, text, watermark`

> 模型（Veo/Kling…）常無視「別運鏡」自帶推鏡 → 後製有 vidstab 二次鎖鏡兜底。

### 3. 素材落點
- 圖 → `brand/assets/host-reference.png`；影片 → `brand/assets/host-reference.mp4`（取代舊檔）。
- 舊寫實版（Veo）已備份於 `brand/assets/host-reference.veo-photoreal.bak.mp4`，要還原直接覆蓋回去即可。

### 4. 渲染（一鍵）
```
render-cartoon.cmd <slug>          ← 等同下列三旗標
PILOT_HOST_PINGPONG=0 PILOT_HOST_CARTOON=0 PILOT_ILLUST_FIRST=1 node tools/make-demo.mjs --slug <slug>
```
旗標意義（皆在 `tools/make-demo.mjs`）：
| 環境變數 | 預設 | 作用 |
|---|---|---|
| `PILOT_HOST_PINGPONG` | 1 | =0：講話版只正放（避免倒著講話）；=1：idle 版正放＋倒放無縫循環 |
| `PILOT_HOST_CARTOON` | 1(on) | 來源已是卡通時設 0，不再疊 edgedetect 濾鏡；`_OP`/`_SAT` 可調濃淡 |
| `PILOT_HOST_LOCK` / `_SMOOTH` | on / 100 | vidstab 反向穩定鎖鏡；推鏡很強時 `_SMOOTH` 調大（畫面會被裁更多） |
| `PILOT_ILLUST_FIRST` | 0 | =1：旁白段一律 AI 卡通示意，跳過實拍/CC（全片卡通統一） |
| `PILOT_ILLUST_STYLE` | cartoon | 示意圖畫風：cartoon/anime/storybook/noir 或自訂字串 |

> 解說員段時序：每段**整段一次播完不切槽**，片比段短用 `setpts` 放慢（≤1.8×）補滿、再不夠長定格末幀——絕不快轉或中途跳回。
