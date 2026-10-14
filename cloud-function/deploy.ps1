# 一鍵部署 90% 抵免額自動熔斷 Cloud Run Function (Windows PowerShell)
param(
    [string]$TargetProjectId = "",
    [string]$ControlProjectId = "",
    [string]$Region = "us-central1"
)

$TopicName = "billing-kill-switch"

if ([string]::IsNullOrWhiteSpace($TargetProjectId)) {
    $DefaultProj = (gcloud config get-value project 2>$null)
    if ($DefaultProj -and $DefaultProj -ne "(unset)") {
        $TargetProjectId = $DefaultProj.Trim()
    }
}

if ([string]::IsNullOrWhiteSpace($TargetProjectId)) {
    Write-Host "❌ 錯誤：未指定目標專案 ID，且 gcloud 尚未設定預設專案。" -ForegroundColor Red
    Write-Host "💡 請先執行 gcloud config set project <PROJECT_ID> 或傳入 -TargetProjectId <PROJECT_ID>" -ForegroundColor Yellow
    exit 1
}

if ([string]::IsNullOrWhiteSpace($ControlProjectId)) {
    $ControlProjectId = $TargetProjectId
}

Write-Host "🔧 [1/4] 正在為專案 ($ControlProjectId) 啟用自動熔斷必要之雲端 API..." -ForegroundColor Cyan
gcloud services enable `
  cloudresourcemanager.googleapis.com `
  cloudbilling.googleapis.com `
  billingbudgets.googleapis.com `
  pubsub.googleapis.com `
  cloudfunctions.googleapis.com `
  run.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  eventarc.googleapis.com `
  --project=$ControlProjectId `
  --quiet

if ($TargetProjectId -ne $ControlProjectId) {
    gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com --project=$TargetProjectId --quiet
}

Write-Host "📨 [2/4] 正在確認 Cloud Pub/Sub 主題 ($TopicName)..." -ForegroundColor Cyan
gcloud pubsub topics describe $TopicName --project=$ControlProjectId *> $null
if ($LASTEXITCODE -ne 0) {
    gcloud pubsub topics create $TopicName --project=$ControlProjectId --quiet
    Write-Host "✅ 已建立 Pub/Sub 主題: projects/$ControlProjectId/topics/$TopicName" -ForegroundColor Green
} else {
    Write-Host "✅ Pub/Sub 主題已存在: projects/$ControlProjectId/topics/$TopicName" -ForegroundColor Green
}
gcloud pubsub topics add-iam-policy-binding $TopicName `
  --project=$ControlProjectId `
  --member="serviceAccount:billing-budget-alert@system.gserviceaccount.com" `
  --role="roles/pubsub.publisher" `
  --quiet *> $null

Write-Host "🚀 [3/4] 正在部署自動熔斷 Cloud Run Function 至專案: $ControlProjectId (保護目標: $TargetProjectId)..." -ForegroundColor Cyan
gcloud functions deploy billing-kill-switch-fn `
  --gen2 `
  --runtime=nodejs22 `
  --region=$Region `
  --source=$PSScriptRoot `
  --entry-point=stopBilling `
  --trigger-topic=$TopicName `
  --project=$ControlProjectId `
  --set-env-vars="TARGET_PROJECT_ID=$TargetProjectId,KILL_SWITCH_THRESHOLD=0.9" `
  --quiet

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 部署失敗，請檢查權限與錯誤訊息。" -ForegroundColor Red
    exit 1
}

Write-Host "🔐 [4/4] 正在為 Cloud Run 函式執行身分設定解除帳單關聯 (IAM) 權限..." -ForegroundColor Cyan
$RuntimeSa = (gcloud functions describe billing-kill-switch-fn --gen2 --region=$Region --project=$ControlProjectId --format="value(serviceConfig.serviceAccountEmail)" 2>$null)
if ([string]::IsNullOrWhiteSpace($RuntimeSa)) {
    $ProjectNumber = (gcloud projects describe $ControlProjectId --format="value(projectNumber)").Trim()
    $RuntimeSa = "$ProjectNumber-compute@developer.gserviceaccount.com"
} else {
    $RuntimeSa = $RuntimeSa.Trim()
}

gcloud projects add-iam-policy-binding $TargetProjectId `
  --member="serviceAccount:$RuntimeSa" `
  --role="roles/billing.projectManager" `
  --condition=None `
  --quiet *> $null

$BillingAccName = (gcloud billing projects describe $TargetProjectId --format="value(billingAccountName)" 2>$null)
if ($BillingAccName) {
    $BillingAccId = $BillingAccName.Trim().Replace("billingAccounts/", "")
    gcloud billing accounts add-iam-policy-binding $BillingAccId `
      --member="serviceAccount:$RuntimeSa" `
      --role="roles/billing.admin" `
      --quiet *> $null
}

Write-Host "✅ Cloud Run Function (billing-kill-switch-fn) 部署完成，並已授權服務帳戶 ($RuntimeSa) 執行專案帳單解綁！" -ForegroundColor Green
