---
name: antigravity-agent-platform:agy-agent-platform
description: 智慧偵測並協助安裝/綁定 gcloud CLI (支援 Windows 與 macOS)，設定 Agent Platform / Gemini 4 認證模式，並一鍵部署 90% 抵免額雲端自動熔斷防刷卡保護。當使用者輸入 /antigravity-agent-platform:agy-agent-platform 或要求設定 Agent Platform、切換至 Gemini 4、檢查 gcloud 環境、或設定抵免額 90% 熔斷防刷卡時觸發。
---

# Agent Platform & Gemini 4 Setup with 90% Billing Guard

本技能引導使用者在跨平台環境（Windows / macOS / Linux）下，全自動完成 Google Cloud SDK (gcloud) 檢查與安裝、帳號登入與 ADC 綁定、設定 Agent Platform / Gemini 4 旗艦推理模型，並部署 90% 抵免額雲端自動熔斷防刷卡安全機制。

## ⚠️ References 參照指引

本技能在執行過程中，會按需載入下列參考文件：
- [`references/install-gcloud.md`](references/install-gcloud.md) — 跨平台 (Windows & macOS) 安裝與認證詳細指令
- [`references/gemini4-setup.md`](references/gemini4-setup.md) — Gemini 4 Argon 與 Agent Platform 認證設定
- [`references/billing-guard.md`](references/billing-guard.md) — 90% 抵免額自動熔斷與防刷卡架構

---

## 🔄 核心作業流程

### 步驟 0：免責宣告與安全確認
向使用者說明：
> ⚠️ **免責與風險警告**：本設定將協助您配置 Agent Platform 與雲端 90% 抵免額自動熔斷機制。由於 Google Cloud API 未開放自動讀取「促銷抵免額（Promotional Credits）」剩餘額度，且雲端計費遙測具有固有延遲，使用者仍須自行至 Google Cloud 控制台（帳單 > 抵免額）確認各筆抵免額之適用產品範圍、有效期限與實際消耗狀況。本外掛程式僅提供輔助防護，**對任何雲端超額費用、信用卡扣款或額外支出概不負責**。

---

### 步驟 1：跨平台環境預檢
執行預檢腳本，偵測作業系統、gcloud 安裝路徑、帳號登入、ADC 狀態，以及目標專案綁定之帳單帳戶與預設幣別（`billingCurrency`，如 `TWD` 或 `USD`）：
```bash
node skills/agy-agent-platform/scripts/check-env.mjs
```

根據檢查結果分流：
* **狀態 A：未安裝 gcloud CLI** → 進入 **步驟 2（安裝協助）**
* **狀態 B：已安裝但尚未登入帳號** → 進入 **步驟 3（帳號登入與綁定）**
* **狀態 C：已安裝且已登入** → 進入 **步驟 4（專案與熔斷設定）**

---

### 步驟 2：跨平台 gcloud 安裝協助（Windows & macOS）

向使用者說明偵測到的作業系統，並提供最佳安裝路徑：

#### 若為 Windows 平台：
1. **優先使用 winget 自動安裝**：
   ```powershell
   winget install -e --id Google.CloudSDK --accept-source-agreements --accept-package-agreements
   ```
2. **若無 winget**：引導下載官方安裝包 `https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe` 並完成安裝。
3. 安裝完成後驗證：`gcloud --version`（必要時以絕對路徑呼叫）。

#### 若為 macOS 平台：
1. **優先使用 Homebrew 安裝**：
   ```bash
   brew install --cask gcloud-cli
   ```
2. **若無 Homebrew**：使用官方 curl 腳本：
   ```bash
   curl https://sdk.cloud.google.com | bash
   exec -l $SHELL
   ```
3. 安裝完成後驗證：`gcloud --version`。

---

### 步驟 3：gcloud 帳號登入與 ADC 憑證綁定

向使用者說明即將開啟瀏覽器進行 Google 帳號授權：
1. **登入 Google 帳號**：
   ```bash
   gcloud auth login
   ```
2. **設定應用程式預設憑證 (ADC)**：
   ```bash
   gcloud auth application-default login --project=<PROJECT_ID>
   ```
3. 確認憑證檔案已正確生成於使用者目錄。

---

### 步驟 4：確認 GCP 專案與 API 服務

1. 設定作用中專案：
   ```bash
   gcloud config set project <PROJECT_ID>
   ```
2. 確保一鍵啟用 Agent Platform 與 Gemini 必要之雲端 API：
   ```bash
   gcloud services enable aiplatform.googleapis.com cloudaicompanion.googleapis.com generativelanguage.googleapis.com agentregistry.googleapis.com geminicloudassist.googleapis.com --project=<PROJECT_ID>
   ```

---

### 步驟 5：部署方案 A（雲端 90% 抵免額自動熔斷機制）

為避免抵免額耗盡後被信用卡扣款，執行雲端即時熔斷設定：

1. **【強制前置步驟】使用 `ask_question` 詢問使用者抵免額總額與計算週期（嚴禁自行猜測或硬編碼金額）**：
   - **為什麼不能只靠 `gcloud` 自動加總？** Google Cloud Billing API 目前僅開放查詢帳單帳戶狀態與預設幣別（`currencyCode`），**並未開放查詢「促銷抵免額（Promotional Credits）」剩餘餘額與明細的 API 端點**。因此，代理**絕對不可**自行假設預設金額（如 `10000TWD` 或 `10USD`）。
   - **向使用者說明多筆抵免額、計算週期與幣別規則**：
     - **每月固定抵免額 vs 單筆累計抵免額**：若為 Google One AI Pro 每月發放之 10 美元（USD 10）抵免額，預算週期應設定為 `--period=month`（每月重置）；若為單筆長效抵免額（如新戶試用或活動贈點），則可設定為 `--period=year`（年度累計）。
     - **多筆抵免額自動切換**：若同一帳單帳戶下擁有不只一筆抵免額，只要皆在有效期限內且適用範圍（Scope）涵蓋 Vertex AI / Gemini，Google Cloud 會在單筆抵免額用盡時**自動無縫切換**扣抵下一筆。請使用者將當期所有可用抵免額**加總後**輸入總金額。
     - **帳單幣別自動對齊**：Google Cloud 規定預算金額幣別必須與帳單帳戶綁定幣別（`billingCurrency`，由 `check-env.mjs` 自動偵測，如 `TWD` 或 `USD`）一致，腳本會自動套用該幣別（若您的帳單帳戶為 `TWD`，請將美元抵免額換算或查看控制台顯示之對應幣別金額後輸入）。
   - **呼叫 `ask_question` 工具（JSON 格式）**：
     - ⚠️ **Cortex 工具限制與防誤導規範**：`ask_question` 工具底層強制要求 `options` 陣列**至少包含 2 個選項**（傳入空陣列 `[]` 會觸發 `invalid_args: each question requires at least 2 options, got 0` 錯誤）；但同時**嚴禁在 `options` 中列出硬編碼預設金額**（如 `1500 TWD`、`3000 TWD`），以免誤導使用者以為只能從預設數字中挑選。
     - 請提供 2 個非金額之功能性輔助選項，並在 `question` 題幹中明確引導使用者直接使用對話框底部的**預設自訂輸入欄（Write-in）**手動輸入實際總金額（純數字，例如 `10` 或 `1500`）：
     ```json
     {
       "questions": [
         {
           "question": "請於下方自訂輸入欄（Other / Write-in）直接輸入您在 Google Cloud「帳單 > 抵免額 (Credits)」中當期可用抵免額加總後的總金額（請直接輸入與帳單幣別相符的純數字，例如 10 或 320；系統將於消耗達 90% 時自動斷電解綁）：",
           "is_multi_select": false,
           "options": [
             "我還不清楚抵免額總額，請先指引我至 Google Cloud 控制台查詢",
             "暫不設定或略過 90% 雲端自動熔斷預算"
           ]
         },
         {
           "question": "請選擇此筆抵免額的預算累計週期：",
           "is_multi_select": false,
           "options": [
             "(Recommended) 每月重置 (month) — 適合 AI Pro 每月發放 10 美元抵免額",
             "年度累計 (year) — 適合單筆長效或活動贈送之抵免額"
           ]
         }
       ]
     }
     ```
     - 若使用者點選「我還不清楚抵免額總額，請先指引我至 Google Cloud 控制台查詢」，請引導其前往 `https://console.cloud.google.com/billing` 查看「抵免額（Credits）」頁面加總可用餘額後，再次詢問確認。

2. **部署 Cloud Run 熔斷函式並自動綁定 IAM 解綁權限**：
   腳本會自動啟用所需之 Cloud Billing / Pub/Sub / Cloud Functions / Cloud Run API，建立 `billing-kill-switch` 主題，並自動為服務帳戶綁定 `roles/billing.projectManager` 與 `roles/billing.admin` 權限（預設直接使用當前 GCP 專案，無須額外建立第二個專案）：
   - Windows：
     ```powershell
     powershell -File "cloud-function/deploy.ps1" -TargetProjectId "<TARGET_PROJECT_ID>"
     ```
   - macOS / Linux：
     ```bash
     bash cloud-function/deploy.sh "<TARGET_PROJECT_ID>"
     ```

3. **建立或更新 90% 預算警示與 Pub/Sub 主題串接**：
   將使用者於 `ask_question` 確認之金額與週期（`month` 或 `year`）傳入執行（腳本會自動套用 `--credit-types-treatment=exclude-all-credits` 追蹤扣除抵免額前的原始總消耗量，並自動對齊帳單帳戶幣別）：
   ```bash
   node skills/agy-agent-platform/scripts/setup-killswitch.mjs --amount=<USER_CONFIRMED_AMOUNT> --period=<month|year>
   ```

4. **執行安全演練測試（Dry-Run Verification）**：
   發送一筆帶有 `{"dryRun": true}` 的測試訊息至 Pub/Sub，驗證 Cloud Run 函式與 Cloud Billing API 權限是否正常運作（不會實際拔除帳單）：
   ```bash
   node skills/agy-agent-platform/scripts/setup-killswitch.mjs --dry-run-test
   ```

---

### 步驟 6：切換 Antigravity 專案與完成提醒

1. **在 Antigravity 切換至 GCP 專案（隨用即付模式）**：
   - 告知使用者：
     - 若在 **Antigravity CLI（`agy`）** 中原先使用 Google One AI Pro 個人訂閱登入，可先輸入 `/logout` 登出，再重新登入並切換至上述已設定防刷卡保護的 GCP 雲端專案（或執行 `agy --project <PROJECT_ID>`），即可透過 Agent Platform 隨用即付模式使用 **Gemini 4 Argon**（`models/gemini-4-argon`）。
     - 在 **Antigravity 2.0 桌面版與 IDE** 中，直接於專案選擇器選取 `<PROJECT_ID>` 即可，無須手動產生任何 API 金鑰。
2. **安全復原提醒**：
   - 說明日後若觸發 90% 自動熔斷（收到 `403 Billing disabled`），在確認抵免額補充或下個月額度生效後，可隨時執行 `gcloud billing projects link <PROJECT_ID> --billing-account=<BILLING_ACCOUNT_ID>` 重新連結帳單恢復使用。
