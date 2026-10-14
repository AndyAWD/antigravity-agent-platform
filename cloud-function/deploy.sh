#!/usr/bin/env bash
# 一鍵部署 90% 抵免額自動熔斷 Cloud Run Function (macOS / Linux)
set -e

DEFAULT_PROJ="$(gcloud config get-value project 2>/dev/null | tr -d '\r')"
if [ "$DEFAULT_PROJ" = "(unset)" ]; then
  DEFAULT_PROJ=""
fi

TARGET_PROJECT_ID="${1:-$DEFAULT_PROJ}"
CONTROL_PROJECT_ID="${2:-$TARGET_PROJECT_ID}"
REGION="${3:-us-central1}"
TOPIC_NAME="billing-kill-switch"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "$TARGET_PROJECT_ID" ]; then
  echo "❌ 錯誤：未指定目標專案 ID，且 gcloud 尚未設定預設專案。"
  echo "💡 請先執行 gcloud config set project <PROJECT_ID> 或執行：bash cloud-function/deploy.sh <TARGET_PROJECT_ID>"
  exit 1
fi

echo "🔧 [1/4] 正在為專案 (${CONTROL_PROJECT_ID}) 啟用自動熔斷必要之雲端 API..."
gcloud services enable \
  cloudresourcemanager.googleapis.com \
  cloudbilling.googleapis.com \
  billingbudgets.googleapis.com \
  pubsub.googleapis.com \
  cloudfunctions.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  eventarc.googleapis.com \
  --project="${CONTROL_PROJECT_ID}" \
  --quiet

if [ "${TARGET_PROJECT_ID}" != "${CONTROL_PROJECT_ID}" ]; then
  gcloud services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com --project="${TARGET_PROJECT_ID}" --quiet
fi

echo "📨 [2/4] 正在確認 Cloud Pub/Sub 主題 (${TOPIC_NAME})..."
if ! gcloud pubsub topics describe "${TOPIC_NAME}" --project="${CONTROL_PROJECT_ID}" >/dev/null 2>&1; then
  gcloud pubsub topics create "${TOPIC_NAME}" --project="${CONTROL_PROJECT_ID}" --quiet
  echo "✅ 已建立 Pub/Sub 主題: projects/${CONTROL_PROJECT_ID}/topics/${TOPIC_NAME}"
else
  echo "✅ Pub/Sub 主題已存在: projects/${CONTROL_PROJECT_ID}/topics/${TOPIC_NAME}"
fi
gcloud pubsub topics add-iam-policy-binding "${TOPIC_NAME}" \
  --project="${CONTROL_PROJECT_ID}" \
  --member="serviceAccount:billing-budget-alert@system.gserviceaccount.com" \
  --role="roles/pubsub.publisher" \
  --quiet >/dev/null 2>&1 || true

echo "🚀 [3/4] 正在部署自動熔斷 Cloud Run Function 至專案: ${CONTROL_PROJECT_ID} (保護目標: ${TARGET_PROJECT_ID})..."
gcloud functions deploy billing-kill-switch-fn \
  --gen2 \
  --runtime=nodejs22 \
  --region="${REGION}" \
  --source="${DIR}" \
  --entry-point=stopBilling \
  --trigger-topic="${TOPIC_NAME}" \
  --project="${CONTROL_PROJECT_ID}" \
  --set-env-vars="TARGET_PROJECT_ID=${TARGET_PROJECT_ID},KILL_SWITCH_THRESHOLD=0.9" \
  --quiet

echo "🔐 [4/4] 正在為 Cloud Run 函式執行身分設定解除帳單關聯 (IAM) 權限..."
RUNTIME_SA="$(gcloud functions describe billing-kill-switch-fn --gen2 --region="${REGION}" --project="${CONTROL_PROJECT_ID}" --format="value(serviceConfig.serviceAccountEmail)" 2>/dev/null | tr -d '\r')"
if [ -z "$RUNTIME_SA" ]; then
  PROJECT_NUMBER="$(gcloud projects describe "${CONTROL_PROJECT_ID}" --format="value(projectNumber)" | tr -d '\r')"
  RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi

# 授予目標專案之 Project Billing Manager 權限 (允許呼叫 updateProjectBillingInfo 拔除帳單)
gcloud projects add-iam-policy-binding "${TARGET_PROJECT_ID}" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role="roles/billing.projectManager" \
  --condition=None \
  --quiet >/dev/null

# 若可取得帳單帳戶 ID，同步授予帳單帳戶管理員權限以確保雙重保障
BILLING_ACCOUNT_NAME="$(gcloud billing projects describe "${TARGET_PROJECT_ID}" --format="value(billingAccountName)" 2>/dev/null | tr -d '\r')"
if [ -n "$BILLING_ACCOUNT_NAME" ]; then
  BILLING_ACCOUNT_ID="${BILLING_ACCOUNT_NAME#billingAccounts/}"
  gcloud billing accounts add-iam-policy-binding "${BILLING_ACCOUNT_ID}" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/billing.admin" \
    --quiet >/dev/null 2>&1 || true
fi
echo "✅ Cloud Run Function (billing-kill-switch-fn) 部署完成，並已授權服務帳戶 (${RUNTIME_SA}) 執行專案帳單解綁！"
