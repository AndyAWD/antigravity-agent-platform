import { CloudBillingClient } from '@google-cloud/billing';
const billingClient = new CloudBillingClient();

const DEFAULT_TARGET_PROJECT_ID =
  process.env.TARGET_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.GCLOUD_PROJECT ||
  '';
const KILL_SWITCH_THRESHOLD = Number(process.env.KILL_SWITCH_THRESHOLD || 0.9);

/**
 * 解析 Cloud Functions Gen1 (Legacy Event) 與 Gen2 (Eventarc / CloudEvent) 的 Pub/Sub 訊息內容
 */
function parsePubSubPayload(event) {
  if (!event) return {};

  // 取得可能的 base64 字串來源 (相容 Gen1 event.data 與 Gen2 event.data.message.data / event.message.data)
  const rawBase64 =
    typeof event.data === 'string'
      ? event.data
      : typeof event.data?.message?.data === 'string'
      ? event.data.message.data
      : typeof event.message?.data === 'string'
      ? event.message.data
      : null;

  if (rawBase64) {
    try {
      const decoded = Buffer.from(rawBase64, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (err) {
      console.warn('Failed to parse base64 Pub/Sub payload as JSON:', err.message);
      return {};
    }
  }

  if (typeof event.data === 'object' && event.data !== null && !event.data.message) {
    return event.data;
  }

  return {};
}

/**
 * 接收 Cloud Billing 預算警示的 Cloud Pub/Sub 觸發事件
 * 當支出達 90% 時自動將專案解除帳單關聯 (Unlink)，達成硬性斷電熔斷
 */
export const stopBilling = async (event, context) => {
  console.log('Received billing alert notification via Pub/Sub');

  const budgetData = parsePubSubPayload(event);
  console.log('Budget Alert Data:', JSON.stringify(budgetData));

  const targetProjectId = budgetData.targetProjectId || DEFAULT_TARGET_PROJECT_ID;
  if (!targetProjectId) {
    console.error('[ERROR] TARGET_PROJECT_ID is not configured in environment variables or payload.');
    return;
  }

  const projectResourceName = `projects/${targetProjectId}`;

  // 支援安全演練模式 (Dry-Run)：驗證 Cloud Billing API 讀取權限，但不實際拔除帳單
  if (budgetData.dryRun) {
    const [billingInfo] = await billingClient.getProjectBillingInfo({
      name: projectResourceName,
    });
    console.log(
      `[DRY RUN] Permission check passed for ${targetProjectId}. Current billingEnabled=${billingInfo.billingEnabled}, billingAccountName=${billingInfo.billingAccountName}`
    );
    return;
  }

  const costAmount = Number(budgetData.costAmount || 0);
  const budgetAmount = Number(budgetData.budgetAmount || 0);
  const alertThresholdExceeded = Number(budgetData.alertThresholdExceeded || 0);
  const forceKill = Boolean(budgetData.forceKill);

  // Cloud Billing Pub/Sub 每天會發送多次例行進度通知，必須確認用量已達 90% 門檻才執行解綁
  if (
    !forceKill &&
    budgetAmount > 0 &&
    costAmount < budgetAmount * KILL_SWITCH_THRESHOLD &&
    alertThresholdExceeded < KILL_SWITCH_THRESHOLD
  ) {
    console.log(
      `[SAFE] Current spend (${costAmount} ${budgetData.currencyCode || ''}) is below ${
        KILL_SWITCH_THRESHOLD * 100
      }% of budget (${budgetAmount} ${budgetData.currencyCode || ''}). No action needed.`
    );
    return;
  }

  if (!forceKill && budgetAmount <= 0 && alertThresholdExceeded < KILL_SWITCH_THRESHOLD) {
    console.log('[SAFE] No valid threshold or budget amount exceeded in payload. Skipping unlink.');
    return;
  }

  console.log(`Threshold reached! Checking current billing info for: ${targetProjectId}...`);

  try {
    const [billingInfo] = await billingClient.getProjectBillingInfo({
      name: projectResourceName,
    });

    if (billingInfo.billingEnabled) {
      console.log(`[KILL SWITCH] Disabling billing for project ${targetProjectId} to prevent credit card charges...`);
      // 將 billingAccountName 設為空字串即為解除帳單關聯 (Unlink)
      await billingClient.updateProjectBillingInfo({
        name: projectResourceName,
        projectBillingInfo: { billingAccountName: '' },
      });
      console.log(`[KILL SWITCH] Successfully unlinked billing for project ${targetProjectId}! All billable API calls stopped.`);
    } else {
      console.log(`Billing is already disabled/unlinked for project: ${targetProjectId}. No action needed.`);
    }
  } catch (error) {
    console.error(`[ERROR] Failed to disable billing for project ${targetProjectId}:`, error);
    throw error;
  }
};
