# 跨平台 (Windows & macOS) gcloud 安裝與認證指南

本文件提供跨平台偵測、安裝 Google Cloud SDK (gcloud) 與帳號認證綁定的詳細規範。

---

## 1. 環境預檢

先執行預檢腳本獲取系統狀態：
```bash
node skills/agy-agent-platform/scripts/check-env.mjs
```

---

## 2. Windows 平台安裝與設定

### 方式 A：透過 winget 自動安裝（推薦）
1. 檢查 winget 是否可用：
   ```powershell
   winget --version
   ```
2. 執行安裝：
   ```powershell
   winget install -e --id Google.CloudSDK --accept-source-agreements --accept-package-agreements
   ```
3. PATH 臨時相容處理（當前視窗尚未重新載入 PATH 時）：
   ```powershell
   $found = "C:\Program Files\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
   if (-not (Test-Path $found)) {
       $found = "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
   }
   & "$found" --version
   ```

### 方式 B：官方安裝程式（無 winget 或權限受限時）
* 下載網址：`https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe`
* 下載後執行並依照畫面精靈提示完成安裝。

---

## 3. macOS 平台安裝與設定

### 方式 A：透過 Homebrew 安裝（推薦）
1. 檢查 Homebrew：
   ```bash
   brew --version
   ```
2. 執行安裝：
   ```bash
   brew install --cask gcloud-cli
   ```
3. 設定 PATH（Apple Silicon Mac）：
   ```bash
   export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
   gcloud --version
   ```

### 方式 B：官方腳本安裝
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

---

## 4. 登入與帳號綁定（Authentication）

安裝完成後，必須完成兩階段認證綁定：

### 階段一：登入 Google Cloud 帳號
```bash
gcloud auth login
```
系統會自動開啟瀏覽器引導使用者選取帳號並同意授權。

### 階段二：設定應用程式預設憑證 (Application Default Credentials, ADC)
這是 Antigravity / Vertex AI / Agent Platform 存取模型的核心憑證：
```bash
gcloud auth application-default login --project=<PROJECT_ID>
```
* 若在無瀏覽器或遠端環境：加上 `--no-launch-browser` 參數透過 URL 驗證。
