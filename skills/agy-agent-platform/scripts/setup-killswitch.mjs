import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLOUD_FUNCTION_DIR = path.resolve(__dirname, '../../../cloud-function');

/**
 * 尋找跨平台 gcloud 執行檔路徑
 */
function resolveGcloudCmd() {
  try {
    execSync('gcloud --version', { stdio: 'ignore', windowsHide: true });
    return 'gcloud';
  } catch (e) {
    const isWin = os.platform() === 'win32';
    const candidates = isWin
      ? [
          path.join(process.env.LOCALAPPDATA || '', 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd'),
          'C:\\Program Files\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd',
          'C:\\Program Files (x86)\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd'
        ]
      : [
          '/opt/homebrew/bin/gcloud',
          '/opt/homebrew/share/google-cloud-sdk/bin/gcloud',
          '/usr/local/bin/gcloud',
          '/usr/local/share/google-cloud-sdk/bin/gcloud',
          path.join(os.homedir(), 'google-cloud-sdk', 'bin', 'gcloud')
        ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        return p.includes(' ') ? `"${p}"` : p;
      }
    }
    return 'gcloud';
  }
}

/**
 * 解析命令列參數 (--amount=10 --currency=USD --period=month --billing-account=... --control-project=... --target-project=... --region=us-central1 --skip-function-deploy --redeploy-function --dry-run-test)
 */
function parseCliArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (arg.startsWith('--amount=')) parsed.budgetAmount = arg.split('=')[1];
    else if (arg.startsWith('--currency=')) parsed.currency = arg.split('=')[1];
    else if (arg.startsWith('--billing-account=')) parsed.billingAccountId = arg.split('=')[1];
    else if (arg.startsWith('--control-project=')) parsed.controlProjectId = arg.split('=')[1];
    else if (arg.startsWith('--target-project=')) parsed.targetProjectId = arg.split('=')[1];
    else if (arg.startsWith('--period=')) parsed.calendarPeriod = arg.split('=')[1];
    else if (arg.startsWith('--region=')) parsed.region = arg.split('=')[1];
    else if (arg === '--skip-function-deploy') parsed.skipFunctionDeploy = true;
    else if (arg === '--redeploy-function') parsed.redeployFunction = true;
    else if (arg === '--dry-run-test') parsed.dryRunTest = true;
  }
  return parsed;
}

/**
 * 自動設定 90% 雲端熔斷防刷卡預算、Cloud Run 函式與 Pub/Sub 串接
 * 注意：禁止硬編碼預設金額，必須由使用者透過 ask_question 確認後傳入 budgetAmount
 */
export function setupKillSwitch({
  billingAccountId = process.env.BILLING_ACCOUNT_ID || '',
  targetProjectId = process.env.TARGET_PROJECT_ID || '',
  controlProjectId = process.env.CONTROL_PROJECT_ID || '',
  budgetAmount = process.env.BUDGET_AMOUNT || '',
  currency = process.env.BILLING_CURRENCY || '',
  calendarPeriod = process.env.BUDGET_PERIOD || 'month',
  region = process.env.FUNCTION_REGION || 'us-central1',
  topicName = 'billing-kill-switch',
  functionName = 'billing-kill-switch-fn',
  skipFunctionDeploy = false,
  redeployFunction = false,
  dryRunTest = false
} = {}) {
  const gcloud = resolveGcloudCmd();

  // 1. 自動偵測目標專案與控制專案 ID (預設單一專案模式，不硬編碼私人專案 ID)
  if (!targetProjectId) {
    try {
      const proj = execSync(`${gcloud} config get-value project`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true
      }).trim();
      if (proj && proj !== '(unset)') {
        targetProjectId = proj;
      }
    } catch (e) {}
  }

  if (!targetProjectId) {
    console.error('❌ 錯誤：未指定目標專案 ID，且 gcloud 尚未設定預設專案。');
    console.error('💡 請先執行 gcloud config set project <PROJECT_ID> 或傳入 --target-project=<PROJECT_ID>');
    process.exitCode = 1;
    return false;
  }

  if (!controlProjectId) {
    controlProjectId = targetProjectId;
  }

  // 若為 --dry-run-test 模式，發送測試演練訊息至 Pub/Sub 驗證管線 (使用雙引號轉義相容 Windows cmd 與 POSIX sh)
  if (dryRunTest) {
    console.log(`🧪 正在發送安全演練 (Dry-Run) 測試訊息至 projects/${controlProjectId}/topics/${topicName} ...`);
    try {
      const payload = JSON.stringify({ dryRun: true, targetProjectId });
      const escapedPayload = JSON.stringify(payload);
      execSync(`${gcloud} pubsub topics publish ${topicName} --project=${controlProjectId} --message=${escapedPayload}`, {
        stdio: 'inherit',
        windowsHide: true
      });
      console.log('✅ 測試訊息已發送！Cloud Run 函式將驗證帳單 API 讀取權限（不會實際拔除帳單）。');
      return true;
    } catch (err) {
      console.error('❌ 發送測試訊息失敗，請確認 Pub/Sub 主題是否已建立。');
      process.exitCode = 1;
      return false;
    }
  }

  if (!budgetAmount || String(budgetAmount).trim() === '') {
    console.error('❌ 錯誤：未指定抵免額預算金額 (budgetAmount)！');
    console.error('💡 Google Cloud API 未開放自動查詢促銷抵免額餘額，請先使用 ask_question 詢問使用者抵免額總額，再以 --amount=<金額> 執行：');
    console.error('   node skills/agy-agent-platform/scripts/setup-killswitch.mjs --amount=10 --period=month');
    process.exitCode = 1;
    return false;
  }

  // 2. 自動偵測帳單帳戶 ID
  if (!billingAccountId) {
    try {
      const projBilling = JSON.parse(
        execSync(`${gcloud} billing projects describe ${targetProjectId} --format=json`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
          windowsHide: true
        })
      );
      if (projBilling.billingAccountName) {
        billingAccountId = projBilling.billingAccountName.replace('billingAccounts/', '');
      }
    } catch (e) {}
  }

  if (!billingAccountId) {
    console.error(`❌ 無法從專案 (${targetProjectId}) 自動偵測帳單帳戶 ID，請確認該專案已連結有效帳單帳戶，或使用 --billing-account=<ACCOUNT_ID> 指定。`);
    process.exitCode = 1;
    return false;
  }

  // 3. 確保自動熔斷與預算所需之雲端 API 已啟用
  try {
    console.log(`🔧 正在確認專案 (${controlProjectId}) 已啟用自動熔斷與預算必要 API...`);
    execSync(
      `${gcloud} services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com billingbudgets.googleapis.com pubsub.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com eventarc.googleapis.com --project=${controlProjectId} --quiet`,
      { stdio: 'ignore', windowsHide: true }
    );
    if (targetProjectId !== controlProjectId) {
      execSync(
        `${gcloud} services enable cloudresourcemanager.googleapis.com cloudbilling.googleapis.com --project=${targetProjectId} --quiet`,
        { stdio: 'ignore', windowsHide: true }
      );
    }
  } catch (e) {}

  // 4. 自動查詢帳單帳戶綁定之預設幣別 (currencyCode，如 TWD 或 USD)
  let detectedCurrency = currency ? currency.toUpperCase() : '';
  try {
    const accInfo = JSON.parse(
      execSync(`${gcloud} billing accounts describe ${billingAccountId} --format=json`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true
      })
    );
    if (accInfo.currencyCode) {
      detectedCurrency = accInfo.currencyCode.toUpperCase();
    }
  } catch (e) {}

  // 5. 解析並正規化金額與幣別 (GCP 要求預算幣別必須與帳單帳戶幣別一致)
  const rawStr = String(budgetAmount).trim().replace(/,/g, '').replace(/^\$/, '');
  const match = rawStr.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]{3})?$/);
  if (!match) {
    console.error(`❌ 金額格式無效: "${budgetAmount}"。請輸入純數字 (如 10 或 1500) 或含幣別格式 (如 10USD)。`);
    process.exitCode = 1;
    return false;
  }

  const numericAmount = match[1];
  const inputCurrency = match[2] ? match[2].toUpperCase() : '';
  const finalCurrency = detectedCurrency || inputCurrency || 'USD';

  if (inputCurrency && detectedCurrency && inputCurrency !== detectedCurrency) {
    console.warn(`⚠️ 注意：輸入幣別 (${inputCurrency}) 與帳單帳戶綁定幣別 (${detectedCurrency}) 不同，已自動對齊為帳單帳戶幣別 ${detectedCurrency}。`);
  }

  const normalizedAmount = `${numericAmount}${finalCurrency}`;
  const threshold90 = (Number(numericAmount) * 0.9).toFixed(2).replace(/\.00$/, '');
  const validPeriod = ['month', 'quarter', 'year'].includes(calendarPeriod) ? calendarPeriod : 'month';
  console.log(
    `[Kill Switch Setup] 目標專案: ${targetProjectId} | 帳單帳戶: ${billingAccountId} | 設定抵免額: ${numericAmount} ${finalCurrency} (週期: ${validPeriod}, 90% 熔斷門檻: ${threshold90} ${finalCurrency})`
  );

  // 6. 確認 / 建立 Pub/Sub Topic 並授予 Cloud Billing Budget 服務帳戶發布權限
  try {
    execSync(`${gcloud} pubsub topics describe ${topicName} --project=${controlProjectId}`, { stdio: 'ignore', windowsHide: true });
    console.log(`✅ Pub/Sub 主題已存在: projects/${controlProjectId}/topics/${topicName}`);
  } catch (e) {
    console.log(`正在建立 Pub/Sub 主題: ${topicName}...`);
    execSync(`${gcloud} pubsub topics create ${topicName} --project=${controlProjectId}`, { stdio: 'inherit', windowsHide: true });
  }

  try {
    execSync(
      `${gcloud} pubsub topics add-iam-policy-binding ${topicName} --project=${controlProjectId} --member="serviceAccount:billing-budget-alert@system.gserviceaccount.com" --role="roles/pubsub.publisher" --quiet`,
      { stdio: 'ignore', windowsHide: true }
    );
  } catch (e) {}

  // 7. 檢查並確保自動熔斷 Cloud Run 函式 (billing-kill-switch-fn) 已部署
  let runtimeSa = '';
  if (!skipFunctionDeploy && fs.existsSync(path.join(CLOUD_FUNCTION_DIR, 'index.js'))) {
    let functionReady = false;
    if (!redeployFunction) {
      try {
        const fnDescRaw = execSync(
          `${gcloud} functions describe ${functionName} --gen2 --region=${region} --project=${controlProjectId} --format=json`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
        );
        const fnDesc = JSON.parse(fnDescRaw);
        const envTarget = fnDesc?.serviceConfig?.environmentVariables?.TARGET_PROJECT_ID;
        runtimeSa = fnDesc?.serviceConfig?.serviceAccountEmail || '';
        if (fnDesc?.state === 'ACTIVE' && envTarget === targetProjectId) {
          functionReady = true;
          console.log(`✅ 偵測到自動熔斷 Cloud Run 函式 (${functionName}) 已就緒 (保護目標: ${targetProjectId})。`);
        }
      } catch (e) {}
    }

    if (!functionReady) {
      console.log(`🚀 正在部署自動熔斷 Cloud Run 函式 (${functionName}) 至專案 ${controlProjectId} (保護目標: ${targetProjectId})...`);
      const sourceArg = CLOUD_FUNCTION_DIR.includes(' ') ? `"${CLOUD_FUNCTION_DIR}"` : CLOUD_FUNCTION_DIR;
      execSync(
        [
          `${gcloud} functions deploy ${functionName}`,
          '--gen2',
          '--runtime=nodejs22',
          `--region=${region}`,
          `--source=${sourceArg}`,
          '--entry-point=stopBilling',
          `--trigger-topic=${topicName}`,
          `--project=${controlProjectId}`,
          `--set-env-vars="TARGET_PROJECT_ID=${targetProjectId},KILL_SWITCH_THRESHOLD=0.9"`,
          '--quiet'
        ].join(' '),
        { stdio: 'inherit', windowsHide: true }
      );
      try {
        runtimeSa = execSync(
          `${gcloud} functions describe ${functionName} --gen2 --region=${region} --project=${controlProjectId} --format="value(serviceConfig.serviceAccountEmail)"`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
        ).trim();
      } catch (e) {}
    }
  }

  // 8. 確保 Cloud Run 執行服務帳戶具備解除目標專案帳單的 IAM 權限
  try {
    if (!runtimeSa) {
      const projNum = execSync(`${gcloud} projects describe ${controlProjectId} --format="value(projectNumber)"`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true
      }).trim();
      if (projNum) {
        runtimeSa = `${projNum}-compute@developer.gserviceaccount.com`;
      }
    }
    if (runtimeSa) {
      execSync(
        `${gcloud} projects add-iam-policy-binding ${targetProjectId} --member="serviceAccount:${runtimeSa}" --role="roles/billing.projectManager" --condition=None --quiet`,
        { stdio: 'ignore', windowsHide: true }
      );
      execSync(
        `${gcloud} billing accounts add-iam-policy-binding ${billingAccountId} --member="serviceAccount:${runtimeSa}" --role="roles/billing.admin" --quiet`,
        { stdio: 'ignore', windowsHide: true }
      );
      console.log(`✅ 已確認服務帳戶 (${runtimeSa}) 具備解除專案 (${targetProjectId}) 帳單之 IAM 權限。`);
    }
  } catch (e) {
    console.warn(`⚠️ 警告：設定服務帳戶 (${runtimeSa}) 之帳單解綁 IAM 權限時發生例外，請確認您擁有目標專案之 Owner 或 Project IAM Admin 權限。`);
  }

  // 9. 檢查是否已有綁定相同 Pub/Sub 主題的熔斷預算，若有則更新，若無則新建
  const fullTopic = `projects/${controlProjectId}/topics/${topicName}`;
  const budgetDisplayName = `90% Credit Kill-Switch Guard (${numericAmount} ${finalCurrency} / ${validPeriod})`;

  let existingBudgetName = '';
  try {
    const listOut = execSync(
      `${gcloud} billing budgets list --billing-account=${billingAccountId} --billing-project=${controlProjectId} --format=json --quiet`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
    );
    const budgets = JSON.parse(listOut || '[]');
    const found = budgets.find((b) => {
      const rule = b.notificationsRule || b.allUpdatesRule;
      return rule && rule.pubsubTopic === fullTopic;
    });
    if (found && found.name) {
      existingBudgetName = found.name.split('/').pop();
    }
  } catch (e) {}

  try {
    if (existingBudgetName) {
      console.log(`正在更新既有 90% 熔斷預算 (${existingBudgetName}) 金額為 ${normalizedAmount} (週期: ${validPeriod})...`);
      const updateCmd = [
        `${gcloud} billing budgets update ${existingBudgetName}`,
        `--billing-account=${billingAccountId}`,
        `--billing-project=${controlProjectId}`,
        `--display-name="${budgetDisplayName}"`,
        `--budget-amount=${normalizedAmount}`,
        `--credit-types-treatment=exclude-all-credits`,
        `--calendar-period=${validPeriod}`,
        '--quiet'
      ].join(' ');
      execSync(updateCmd, { stdio: 'inherit', windowsHide: true });
      console.log(`✅ 90% 熔斷預算已成功更新為 ${numericAmount} ${finalCurrency} (90% 觸發點: ${threshold90} ${finalCurrency})！`);
    } else {
      console.log(`正在建立 90% 預算警示 (金額: ${normalizedAmount}, 週期: ${validPeriod})...`);
      const createCmd = [
        `${gcloud} billing budgets create`,
        `--billing-account=${billingAccountId}`,
        `--billing-project=${controlProjectId}`,
        `--display-name="${budgetDisplayName}"`,
        `--budget-amount=${normalizedAmount}`,
        `--credit-types-treatment=exclude-all-credits`,
        `--calendar-period=${validPeriod}`,
        '--threshold-rule=percent=0.9,basis=current-spend',
        '--threshold-rule=percent=1.0,basis=current-spend',
        `--notifications-rule-pubsub-topic=${fullTopic}`,
        '--quiet'
      ].join(' ');
      execSync(createCmd, { stdio: 'inherit', windowsHide: true });
      console.log(`✅ 90% 預算警示與 Pub/Sub 串接建立成功 (${numericAmount} ${finalCurrency}，90% 觸發點: ${threshold90} ${finalCurrency})！`);
    }
    return true;
  } catch (err) {
    console.error('❌ 設定預算失敗，請檢查權限或帳單帳戶 ID 是否正確。');
    process.exitCode = 1;
    return false;
  }
}

if (process.argv[1] && process.argv[1].endsWith('setup-killswitch.mjs')) {
  const cliOptions = parseCliArgs(process.argv.slice(2));
  setupKillSwitch(cliOptions);
}
