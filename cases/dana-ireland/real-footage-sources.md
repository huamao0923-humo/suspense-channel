# 案件真實畫面清單 — dana-ireland（達娜·愛爾蘭謀殺案）

> **製作自律準則，非法律意見。** 本檔彙整 Dana Ireland 案（1991，美國夏威夷大島 Puna/Hilo）真實素材的踏查結果，作為製作流程的素材風險控管參考。
> **本清單不構成法律意見，亦不代表任何素材可直接使用。** 任何素材實際使用/發布前，**一律須經人工審核並逐筆確認授權 / 取得書面授權**（把 `assets/dana-ireland/real-library/MANIFEST.csv` 的 clearance 由 🟡 改為 ✅）。
> 對齊 `brand/legal-redlines.md` §4 去識別、§5 版權。本案三名被告之定罪已撤銷平反、DNA 相符者未經定罪且已身亡——**所有可辨識人物一律去識別**（剪影/示意/AI）。

---

## ◆ 本案素材特性（與 GSK/Kürten 的關鍵差異）

本案**第一層特別貧瘠**：1991 年的**州級**案件（非聯邦），無 FBI 等聯邦 PD 素材；被害者、嫌疑人、被告之影像多屬新聞機構著作權（第三層，**不採用**）。
因此真實素材**以「案發地與設施場景」為主**：夏威夷大島地理（Kapoho、Puna 海岸、Hilo）、法院/聯邦大樓、以及**通用的監獄/鑑識實驗室 B-roll**（對應 `real-subjects.json` 已用通用詞 `prison exterior building`、`forensic DNA laboratory`）。人物與 DNA 抽象段一律 **AI 示意 + 去識別**。

---

## 第一層 — 公共領域 / 官方（優先採用）

| 素材 | 類型 | 來源 | 授權 | 風險 |
|---|---|---|---|---|
| 美國聯邦建物紀錄（HABS/HAER）郵局·法院·監獄外觀 | 設施 | Commons（US Federal works） | Public Domain (Federal) | 極低 |
| 夏威夷歷史影像（Honolulu 1922 等） | 時代影像 | Commons | PD（年代久遠） | 極低 |

## 第二層 — 可授權（須署名）

| 素材 | 類型 | 來源 | 授權 | 風險 |
|---|---|---|---|---|
| Hilo 市容、Hilo Federal Building、East Hawaii Cultural Center | 地點 | Commons（見 MANIFEST） | CC-BY/CC-BY-SA（須署名） | 低 |
| 大島地理／Puna 海岸／太平洋海景 | 地點/空景 | Commons | CC-BY/CC-BY-SA（須署名） | 低 |
| 通用監獄牢房/走廊、鑑識 DNA 實驗室 B-roll | 示意設施 | Commons | CC-BY/CC-BY-SA（須署名） | 低（**示意，非本案實景**，字幕須避免暗示為案發地） |

## 第三層 — 受版權新聞 / 影視（最後手段，不自動下載，僅登錄）

| 素材 | 來源 | 處置 |
|---|---|---|
| 被害者/被告/平反當事人新聞照片 | AP/地方台/Innocence Project 報導 | **避免**；改用剪影/AI 去識別示意 |
| 庭審/平反記者會新聞畫面 | 電視台 | 合理使用須逐項套降風險清單；他人紀錄片禁用 |

---

## ◆ 與 CLI 整合

- 本案無專屬 Commons 分類（`Dana Ireland` 查無檔），靠地點/設施場景詞。
- 已自動灌庫（安全授權）：`node tools/real-picker.mjs --slug dana-ireland --auto`（讀 `assets/dana-ireland/real-library/seed.json`）。
- 補抓：`node tools/real-picker.mjs --slug dana-ireland --query "Hilo Hawaii"` 等。
- 下載素材＋授權見 `assets/dana-ireland/real-library/MANIFEST.csv`（clearance=🟡，**發布前人工確認**）。**通用設施 B-roll 須在此關卡標明「示意非本案」**，避免誤導觀眾。

> 再次聲明：本清單為製作自律準則、非法律意見；所有素材使用前一律須完成人工授權確認。
