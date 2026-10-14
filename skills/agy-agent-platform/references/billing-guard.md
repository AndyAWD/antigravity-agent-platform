# 90% 抵免額自動熔斷與防刷卡架構指南

本文件提供 Google Cloud 雲端即時熔斷機制（方案 A）的架構細節、IAM 權限綁定、運作邏輯與緊急處置程序。

---

## 1. 為什麼需要 90% 熔斷與物理限制說明？

* **計費延遲（Billing Telemetry Latency）**：Google Cloud 帳單與計費遙測通常有數十分鐘至數小時（官方文件標示最長可達 24 小時）的匯總延遲。若設定 100% 熔斷，收到通知時往往已經超額而被信用卡扣款。
* **10% 安全緩衝**：將熔斷觸發點設定在抵免額的 90%，預留的 10% 緩衝區能在一般日常開發速度下吸收計費延遲期間的權杖（Token）用量，大幅降低超額扣款風險。
* ⚠️ **高併發穿倉風險提醒**：若在極短時間（例如 1 小時內）啟動大量平行子代理（Subagents）高併發消耗超過 10% 緩衝額度，在 GCP 帳單系統完成結算並發送 Pub/Sub 訊息前仍可能突破 100% 抵免額。

---

## 2. 雲端熔斷架構（方案 A）

```text
[扣除抵免額前之原始用量達 90%] 
    ↓ 
[Cloud Billing 預算快訊 (exclude-all-credits)] 
    ↓ 透過 billing-budget-alert@system.gserviceaccount.com 發布事件
[Cloud Pub/Sub 主題 (billing-kill-switch)] 
    ↓ Eventarc / Pub/Sub 觸發執行
[Cloud Run Function (billing-kill-switch-fn, Node.js 22 ES Module)] 
    ↓ 以具備 roles/billing.projectManager 之服務帳戶呼叫 Cloud Billing API
[專案解除帳單關聯 (updateProjectBillingInfo -> billingAccountName: "")]
```

### 單一專案模式（預設）vs 獨立控制專案模式（進階）
* **單一專案模式（預設，最簡單）**：`deploy.sh`、`deploy.ps1` 與 `setup-killswitch.mjs` 預設直接將 Pub/Sub 與 Cloud Run Function 部署在您當前的目標專案中。當用量達到 90% 時，專案帳單仍處於啟用狀態，Cloud Run 函式會在 1 秒內執行完畢並將該專案自己的帳單拔除（自殺式斷電），無須額外建立第二個 GCP 專案。
* **獨立控制專案模式（進階選用）**：若您有多個開發專案，可傳入第二個參數（或 `--control-project=<CONTROL_PROJECT_ID>`），將 Pub/Sub 與 Cloud Run Function 集中部署於獨立控制專案中。

### 自動化 IAM 權限綁定（確保真能拔掉帳單）
為避免常見的「收到通知卻因 `PERMISSION_DENIED` 拔不掉帳單」問題，本外掛部署腳本會自動完成三項關鍵授權：
1. 授予預算通知服務代理 `billing-budget-alert@system.gserviceaccount.com` 對 `billing-kill-switch` 主題的 `roles/pubsub.publisher` 權限。
2. 授予執行 Cloud Run 函式的預設服務帳戶（`<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`）對目標專案的 `roles/billing.projectManager`（專案帳單管理員）權限。
3. 若環境允許，同步授予該服務帳戶在帳單帳戶上的 `roles/billing.admin` 權限。

---

## 3. 抵免額查詢限制、多筆抵免額切換與幣別／週期規則

### 3.1 為什麼必須以 `ask_question` 詢問抵免額總額？
* Google Cloud Billing API 與 `gcloud billing` 目前**並未開放**查詢「促銷抵免額（Promotional Credits / Free Trial Credits）剩餘餘額」的 API 端點（僅能在 Google Cloud 網頁控制台「帳單 > 抵免額」查看）。
* 因此，設定預算前必須透過 `ask_question` 讓使用者確認並輸入抵免額總額，嚴禁硬編碼預設金額。

### 3.2 預算計算起點與週期選擇：從設定當日起算（`custom` / `--start-date`）vs 每月重置（`month`）
* **`--period=custom`（預設推薦，自動套用 `--start-date=<YYYY-MM-DD>`）**：當啟用 `--credit-types-treatment=exclude-all-credits` 時，若使用 `year` 或 `month` 週期，Google Cloud 會回溯計算該年度（1/1 起）或當月（1 號起）所有已消耗掉的歷史抵免額；若歷史消耗早已超過目前剩餘抵免額的 90%，會導致預算建立當下立即誤發 90% 警告信。使用 `--start-date` 從設定當日起算，僅追蹤**設定日起之新增消耗**，讓使用者直接輸入「目前剩餘的可用抵免額總額」，在真正消耗達 90% 時才寄發唯一一封警告信並執行熔斷。
* **`--period=month`（適合當月尚無歷史消耗之每月固定配額）**：Google One AI Pro 每月發放 10 美元（USD 10）GCP 抵免額，選用 `month` 可在每月初自動歸零重新計算當月 90% 門檻。

### 3.3 多筆抵免額（Multiple Credits）會自動切換嗎？
* **會自動切換**，前提是滿足以下三項條件：
  1. **歸屬同一帳單帳戶（Billing Account）**：所有抵免額皆掛在目標專案所綁定的同一個帳單帳戶下。當第一筆抵免額扣完歸零時，Google Cloud Billing 會自動無縫接續扣抵下一筆（系統預設優先扣除最快到期或適用範圍較窄之抵免額）。
  2. **適用產品範圍（Scope）相符**：每筆抵免額的適用範圍皆須涵蓋您使用的服務（如 Vertex AI / Gemini API）。
  3. **處於有效期限內（Active）**：抵免額尚未過期。

### 3.4 幣別自動對齊與 `--credit-types-treatment=exclude-all-credits`
* **幣別對齊（Currency Code）**：Google Cloud 要求預算幣別必須與帳單帳戶綁定幣別一致。`check-env.mjs` 與 `setup-killswitch.mjs` 會透過 `gcloud billing accounts describe` 自動偵測 `currencyCode`（如 `TWD` 或 `USD`）並自動套用。
* **排除抵免額折抵計算（`exclude-all-credits`）**：GCP 預算預設為 `include-all-credits`（淨成本 = 原始費用 - 抵免額），這會導致在抵免額扣光前預算消耗永遠顯示為 `0`。本外掛強制設定 `--credit-types-treatment=exclude-all-credits`，直接追蹤**扣除抵免額前的原始累計用量**，確保在抵免額本身消耗達 90% 時即刻觸發熔斷。

---

## 4. 安全演練測試、緊急處置與手動復原

### 安全演練測試（Dry-Run Verification）
部署完成後，可隨時執行以下指令發送測試訊息，驗證 Cloud Run 函式能否正常讀取帳單狀態（不會實際拔除帳單）：
```bash
node skills/agy-agent-platform/scripts/setup-killswitch.mjs --dry-run-test
```

### 緊急手動熔斷（立刻止血）
若發現異常消耗，可直接在終端機執行：
```bash
gcloud billing projects unlink <TARGET_PROJECT_ID>
```

### 手動復原（重新啟用專案）
當下個月新的抵免額發放或確認繼續使用時：
```bash
gcloud billing projects link <TARGET_PROJECT_ID> --billing-account=<BILLING_ACCOUNT_ID>
```
重新連結後，專案的 API 呼叫會在數分鐘內自動恢復正常。
