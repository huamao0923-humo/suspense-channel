# 製作進度看板

> 每個案件一列。狀態：選題 → 研究 → 腳本 → 法律審查 → 製作包 → 渲染(外部) → 已上片

| 案件 (slug) | 標題 | 狀態 | 負責 workflow | 備註 |
|---|---|---|---|---|
| snowtown-murders (ep001) | 雪鎮謀殺案（Bodies in Barrels） | 成片完成 ✅（新流程重製） | 經 real-sourcing→story-arc→script-studio 全新流程重製 | `web/media/snowtown-murders-demo.mp4`（653.6s／197 字幕／VoxCPM2 簽名聲線／23 段腳本）。real-library 經人工剔除離題素材，僅留 4 張真雪鎮 Commons 圖（地名牌/位置圖/穀倉/案發銀行）＋AI 示意；archive.org 無匹配 CC 影片、本次未帶 YOUTUBE_API_KEY（key 已 setx 持久化，下次渲染啟用 YouTube CC 影片層）。發布前須確認 MANIFEST clearance 🟡→✅ 並做關卡2/3 複核 |
| golden-state-killer (ep002) | 黃金州殺手案（Golden State Killer） | 成片完成 ✅（新流程重製）| 經 real-sourcing→story-arc→script-studio 全新流程重製 | `web/media/golden-state-killer-demo.mp4`（718s／222 字幕／VoxCPM2 簽名聲線／25 段腳本）。**16 段真實影片**（YouTube-CC：受害者社區/門鎖/Exeter警局/兇器/犯案街景/IBGITD書封/鑑識證物/基因族譜，皆 CLIP 配對）＋real-library 真兇 mugshot/FBI素描/EAR-ONS信件/2018記者會＋Pexels 動態氛圍。已套 ②靜圖偵測＋③recap黑名單、PEXELS+YouTube key（.env）。發布前須確認 clearance＋關卡2/3 複核 |
| peter-kurten (ep003) | 杜塞道夫吸血鬼（Peter Kürten） | 成片完成 ✅（新流程重製） | 經 real-sourcing 重製 | `web/media/ep003-peter-kurten-demo.mp4`；real-library 經 `real-picker --auto` 灌入（Commons「Peter Kürten」Bundesarchiv＋杜塞道夫/科隆實景），渲染本地優先；已人工剔除離題素材；發布前須確認 MANIFEST clearance 🟡→✅ |
| dana-ireland (ep004) | 達娜·愛爾蘭謀殺案（Dana Ireland） | 成片完成 ✅（新流程重製） | 經 real-sourcing 重製 | `web/media/ep004-dana-ireland-demo.mp4`；real-library＝夏威夷 Kapoho/Puna/Hilo 實景＋通用監獄/鑑識 B-roll（示意非本案）；無案件專屬 Commons 分類；發布前須確認 clearance 🟡→✅ 並標示示意素材 |

---

## 生產線指令速查
1. **選題**：跑 `case-radar` → 編輯 `pipeline/radar-shortlist.md` 勾選想做的案件（關卡1）
2. **研究**：跑 `deep-research`，args `{ slug, title, country, year }` → 產 `cases/<slug>/dossier.md` + `factcheck.md`（末段自動委派 `real-sourcing`）
2b. **真實素材踏查**：`real-sourcing`（deep-research 已內含，也可單獨跑），args `{ slug, title, country, year }` → 產 `cases/<slug>/real-footage-sources.md`（三層授權）＋ `assets/<slug>/real-library/seed.json`，並自動跑 `tools/real-picker.mjs --auto` 灌 real-library。
   - 精挑/補抓：`node tools/real-picker.mjs --slug <slug> --category "<Commons分類>"`（互動列候選挑編號）或 `--query "<詞>"`。發布前人工把 MANIFEST clearance 🟡→✅。
3. **故事編排**：跑 `story-arc`，args `{ slug, lengthMin }` → 產 `cases/<slug>/story-arc.md`（起承轉合＋懸念＋反轉＋解說員位置）
4. **腳本**：跑 `script-studio`，args `{ slug, lengthMin }` → 依 story-arc 產雙稿 + `legal-review.md`（關卡2腳本、關卡3法律）
5. **製作包**：跑 `production-package`，args `{ slug }` → 填滿 `cases/<slug>/production/`
6. **渲染（本機）**：`node tools/build-episode.mjs --slug <slug>` → `node tools/make-demo.mjs --slug <slug>`（調查員定格出鏡、旁白響度標準化、字幕放大）
7. **外部**：TTS 配音升級 → 算圖 → 剪輯 → 縮圖 → 上片
