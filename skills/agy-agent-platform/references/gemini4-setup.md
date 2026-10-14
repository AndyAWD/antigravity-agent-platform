# Gemini 4 Argon 與 Agent Platform 認證設定指南

本文件指導如何在 Google Antigravity 全生態系（包含 Antigravity CLI `agy`、Antigravity 2.0 桌面版與 Antigravity IDE）及 Google Cloud 專案中，一鍵開通並存取 Agent Platform 與 Gemini 4 Argon 旗艦推理模型。

---

## 1. 專案必要 API 服務一鍵啟用

在目標 GCP 專案上啟用 Agent Platform、Gemini for Google Cloud 與 Vertex AI 核心服務：
```bash
gcloud services enable \
  aiplatform.googleapis.com \
  cloudaicompanion.googleapis.com \
  generativelanguage.googleapis.com \
  agentregistry.googleapis.com \
  geminicloudassist.googleapis.com \
  --project=<PROJECT_ID>
```

---

## 2. Gemini 4 Argon 模型規格概覽

* **模型識別代碼**：`models/gemini-4-argon`
* **輸入限制（Input Tokens）**：1,048,576 Tokens（1M）
* **輸出限制（Output Tokens）**：32,768 Tokens
* **核心特色**：具備原生深度思考推理（Extended Thinking）、長時程多步驟規劃與進階軟體重構能力。

---

## 3. Antigravity 專案切換與認證對齊（免產生雲端金鑰）

與傳統工具需要手動去主控台產生 API 金鑰或服務帳戶 JSON 金鑰不同，Antigravity（`agy` CLI、Antigravity 2.0 桌面版與 IDE）已整合 Google OAuth 與應用程式預設憑證（ADC），**無須產生任何 API 金鑰**：

### 方式 A：在 `agy` CLI 透過 `/logout` 切換為 GCP 雲端專案模式（推薦）
若您原本使用 Google One AI Pro 個人訂閱登入 `agy` CLI，可直接切換為 GCP 雲端專案隨用即付模式（搭配每月 $10 USD 抵免額）以解鎖 Gemini 4 Argon：
1. 在 `agy` CLI 互動介面輸入 `/logout` 登出目前的個人訂閱模式。
2. 重新登入時選擇 Google Cloud 專案模式，並指定已完成上方第 1 步 API 啟用且綁定帳單帳戶的 `<PROJECT_ID>`（或啟動時執行 `agy --project <PROJECT_ID>`）。
3. **Antigravity 2.0 桌面版 / Antigravity IDE**：於專案選擇器（Project Selector）直接選取或輸入 `<PROJECT_ID>`。

### 方式 B：對齊本機 `gcloud` 預設專案與 ADC 配額專案
為確保本機 `gcloud`、外掛程式（Plugin）自動化熔斷部署腳本與雲端配額專案一致，建議同步對齊本機設定：
```bash
gcloud config set project <PROJECT_ID>
gcloud auth application-default login --project=<PROJECT_ID>
```
若需透過環境變數指定 ADC 專案，亦可設定：
```bash
export AGY_ADC_AUTH=true
export GOOGLE_CLOUD_PROJECT="<PROJECT_ID>"
export GOOGLE_CLOUD_LOCATION="global"
```
