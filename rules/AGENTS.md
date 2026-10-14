# Agent Platform & 防刷卡安全代理守則

當啟用本外掛或執行 Agent Platform / Gemini 4 相關操作時，人工智慧（AI）代理必須嚴格遵守以下準則：

## 1. 抵免額優先與零刷卡保障
* 代理在引導使用者進行雲端專案設定時，必須優先確認專案抵免額狀態與 90% 雲端自動熔斷機制是否已部署。
* **嚴禁猜測或硬編碼抵免額金額**：由於 Google Cloud API 未開放查詢促銷抵免額（Promotional Credits）餘額，代理在建立或更新 90% 預算警報前，**必須強制呼叫 `ask_question` 工具（JSON 格式）** 詢問使用者目前的可用抵免額總額（`options` 至少需提供 2 個非金額之功能性輔助選項，**嚴禁傳入空陣列 `[]` 以免觸發工具參數驗證錯誤，亦嚴禁列出預設金額選項以免誤導使用者**，應引導使用者於自訂輸入欄直接輸入數字），同時自動偵測帳單帳戶綁定幣別（`currencyCode`）與啟用 `--credit-types-treatment=exclude-all-credits`。
* 若發生 `BILLING_DISABLED`、`Billing not enabled` 或 `403 Quota exceeded` 等錯誤，代表已觸發 90% 自動熔斷防刷卡保護，代理應主動向使用者說明，**嚴禁**私自嘗試重新綁定帳單或重試耗費大量 Token 的高成本操作。

## 2. 跨平台環境相容性（Windows & macOS）
* 進行環境偵測與 gcloud 安裝指引時，必須主動識別作業系統（Windows / macOS / Linux），並提供該平台專屬的黃金路徑（如 Windows 的 winget 或官方安裝包、macOS 的 Homebrew 或 curl 腳本）。
* 在 Windows 平台上執行指令時，嚴禁硬編碼含空格之路徑，需以 `powershell -Command "& '<path>' ..."` 安全呼叫；在 macOS/Linux 上需自動繼承 PATH。
