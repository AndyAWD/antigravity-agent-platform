# antigravity-agent-platform

[English](README.md) | 繁體中文

`antigravity-agent-platform` 是專為 Google Antigravity 生態系設計的官方標準外掛程式（Plugin），完整支援 Antigravity 命令列介面（Command-Line Interface）（`agy`）、Antigravity 整合開發環境（Integrated Development Environment）以及 Antigravity 2.0 桌面應用程式（Desktop Application）。

本外掛提供跨平台（Windows 與 macOS）Google Cloud SDK（`gcloud`）自動預檢與安裝指引、快速設定 Agent Platform 與 Gemini 4 Argon 旗艦推理模型認證，並整合 90% 抵免額雲端即時熔斷機制（方案 A），協助降低抵免額耗盡後被信用卡扣款的風險。

> [!WARNING]
> **免責聲明與費用風險警告（Disclaimer & Billing Risk Warning）**
> 使用本外掛程式（Plugin）時，您仍須自行至 Google Cloud 控制台（帳單 > 抵免額）確認各筆抵免額（Credits）之適用服務範圍、有效期限與即時消耗狀況。由於 Google Cloud 帳單遙測具有數小時之固有延遲，且不同抵免額可能有特定產品限制或設定差異，本外掛程式僅作為輔助防護工具，**對任何雲端超額費用、信用卡扣款或額外支出概不負責**。

## 如何安裝

請在終端機執行以下指令進行安裝：

```bash
agy plugin install https://github.com/AndyAWD/antigravity-agent-platform
```

## 特色亮點

- **跨平台智慧預檢與安裝引導**：自動辨識 Windows 與 macOS 作業系統，引導透過系統套件管理工具（`winget`、Homebrew）或官方安裝包設定 `gcloud` 命令列工具。
- **支援 `agy` CLI `/logout` 切換雲端專案與免金鑰認證**：針對透過 `/logout` 將 `agy` CLI 切換為 Google Cloud 專案隨用即付模式（如運用 Google One AI Pro 每月 $10 美元 GCP 抵免額呼叫 Gemini 4 Argon）的使用者，自動對齊本機 `gcloud` 與應用程式預設憑證（Application Default Credentials）（ADC），無須手動產生 API 金鑰。
- **Agent Platform 與 Gemini 4 Argon 一鍵開通**：為全新雲端專案一鍵啟用 `aiplatform.googleapis.com`、`cloudaicompanion.googleapis.com`、`generativelanguage.googleapis.com`、`agentregistry.googleapis.com` 與 `geminicloudassist.googleapis.com`，支援 1,048,576 權杖（Tokens）輸入上限與 32,768 權杖輸出上限。
- **90% 抵免額雲端自動熔斷機制（端到端自動部署）**：
  - 自動偵測帳單帳戶綁定幣別（`currencyCode`），設定前強制透過 `ask_question` 互動詢問實際抵免額總額與週期（支援 `month` 月度配額如 AI Pro 每月 $10 美元，或 `year` 年度抵免額）。
  - 一鍵完成 Cloud Billing 預算快訊（強制啟用 `exclude-all-credits` 追蹤抵免前原始總消耗量）、Cloud Pub/Sub 主題、Cloud Run 函式（Node.js 22 ES Modules）部署，並**自動綁定服務帳戶解除帳單所需之身分與存取權管理（Identity and Access Management）（IAM）權限**（`roles/billing.projectManager` 與 `roles/billing.admin`）。
  - 內建 `--dry-run-test` 安全演練模式，可在不實際切斷帳單的情況下驗證 Pub/Sub 觸發與帳單 API 權限。
- **官方標準外掛架構**：遵循 Antigravity 官方 `plugin.json` 清單規範，通過 `agy plugin validate` 驗證，支援多裝置快速分發與無縫熱更新。

## 如何管理與切換外掛程式

• 列出已安裝外掛：

  ```bash
  agy plugin list
  ```

• 啟用外掛：

  ```bash
  agy plugin enable antigravity-agent-platform
  ```

• 停用外掛：

  ```bash
  agy plugin disable antigravity-agent-platform
  ```

• 移除外掛：

  ```bash
  agy plugin uninstall antigravity-agent-platform
  ```

## 專案資料夾目錄

```text
antigravity-agent-platform/
├── plugin.json
├── package.json
├── rules/
│   └── AGENTS.md
├── skills/
│   └── agy-agent-platform/
│       ├── SKILL.md
│       ├── references/
│       │   ├── install-gcloud.md
│       │   ├── gemini4-setup.md
│       │   └── billing-guard.md
│       └── scripts/
│           ├── check-env.mjs
│           ├── install-gcloud.mjs
│           └── setup-killswitch.mjs
├── cloud-function/
│   ├── package.json
│   ├── index.js
│   ├── deploy.ps1
│   └── deploy.sh
├── README.md
└── README.zh-TW.md
```

## 指令功能說明

### `/antigravity-agent-platform:agy-agent-platform`

```text
/antigravity-agent-platform:agy-agent-platform
```

- **使用情境**：
  - 在 `agy` CLI 透過 `/logout` 切換為 GCP 雲端專案模式以使用 Gemini 4 Argon，需要設定 90% 抵免額自動熔斷防刷卡保護時。
  - 在新電腦上初次設定 Google Cloud SDK（`gcloud`）與專案 API 時。

- **運作流程**：
  1. **跨平台環境預檢**：自動偵測作業系統、`gcloud` 安裝路徑、身分登入狀態、應用程式預設憑證（ADC）、帳單帳戶預設幣別（`currencyCode`）以及自動熔斷函式部署狀態。
  2. **智慧安裝與綁定引導**：若缺少 `gcloud`，依作業系統引導自動安裝；若未登入，開啟瀏覽器完成帳號與憑證綁定。
  3. **雲端 API 啟用**：為目標專案啟用 Agent Platform、Vertex AI 與 Cloud Billing Budgets 相關 API。
  4. **互動確認抵免額與雲端 90% 熔斷部署**：先透過 `ask_question`（JSON 格式，不列出誤導性預設金額選項）引導使用者輸入可用抵免額總額與週期（`month` 或 `year`），再自動部署 `billing-kill-switch-fn` Cloud Run 函式、配置 IAM 解綁權限，並建立 90% 預算警示（`exclude-all-credits`）與 Pub/Sub 主題串接。
  5. **安全演練與連線驗證**：支援透過 `--dry-run-test` 驗證熔斷管線權限，並確認專案可於 `agy` CLI、Antigravity 2.0 桌面版與 IDE 正常連線。

- **參數說明**：
  - 無需強制參數，直接輸入指令即可啟動互動式引導流程。

## 授權條款

本專案採用 [MIT License](LICENSE) 授權條款。
