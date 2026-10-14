import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * 跨平台環境預檢腳本 (Check Environment)
 * 檢查 gcloud、登入狀態、ADC 憑證、GCP 專案與帳單狀態
 */
export function checkEnv({ targetProject = '' } = {}) {
  const platform = os.platform(); // 'win32', 'darwin', 'linux'
  const isWin = platform === 'win32';
  const isMac = platform === 'darwin';

  const result = {
    platform,
    isWindows: isWin,
    isMacOS: isMac,
    gcloudInstalled: false,
    gcloudPath: '',
    gcloudVersion: '',
    authenticatedAccount: '',
    currentProject: targetProject || '',
    adcExists: false,
    adcPath: '',
    adcQuotaProject: '',
    billingEnabled: false,
    billingAccountId: '',
    billingAccountDisplayName: '',
    billingCurrency: '',
    killSwitchFunctionDeployed: false,
    creditCheckNote: 'Google Cloud API 未開放查詢促銷抵免額 (Promotional Credits) 餘額。設定 90% 預算警報前，必須先使用 ask_question 詢問使用者實際抵免額總額與週期 (month/year)。',
    recommendation: ''
  };

  // 1. 搜尋 gcloud 執行檔
  try {
    const versionOut = execSync('gcloud --version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    result.gcloudInstalled = true;
    result.gcloudPath = 'gcloud';
    result.gcloudVersion = versionOut.split('\n')[0].trim();
  } catch (e) {
    // 嘗試常見路徑搜尋
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
        try {
          const vOut = execSync(`"${p}" --version`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
          result.gcloudInstalled = true;
          result.gcloudPath = p;
          result.gcloudVersion = vOut.split('\n')[0].trim();
          break;
        } catch (err) {}
      }
    }
  }

  // 2. 檢查登入身分、預設專案與帳單帳戶幣別
  if (result.gcloudInstalled) {
    const gCmd = result.gcloudPath.includes(' ') ? `"${result.gcloudPath}"` : result.gcloudPath;

    try {
      const acc = execSync(`${gCmd} config get-value account`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }).trim();
      if (acc && acc !== '(unset)') {
        result.authenticatedAccount = acc;
      }
    } catch (e) {}

    if (!result.currentProject) {
      try {
        const proj = execSync(`${gCmd} config get-value project`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }).trim();
        if (proj && proj !== '(unset)') {
          result.currentProject = proj;
        }
      } catch (e) {}
    }

    if (result.authenticatedAccount && result.currentProject) {
      try {
        const billingProjRaw = execSync(`${gCmd} billing projects describe ${result.currentProject} --format=json`, {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'ignore'],
          windowsHide: true
        });
        const billingProj = JSON.parse(billingProjRaw);
        result.billingEnabled = Boolean(billingProj.billingEnabled);
        if (billingProj.billingAccountName) {
          result.billingAccountId = billingProj.billingAccountName.replace('billingAccounts/', '');
        }
      } catch (e) {}

      if (result.billingAccountId) {
        try {
          const billingAccRaw = execSync(`${gCmd} billing accounts describe ${result.billingAccountId} --format=json`, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true
          });
          const billingAcc = JSON.parse(billingAccRaw);
          result.billingCurrency = billingAcc.currencyCode || '';
          result.billingAccountDisplayName = billingAcc.displayName || '';
        } catch (e) {}
      }

      try {
        const fnState = execSync(
          `${gCmd} functions describe billing-kill-switch-fn --gen2 --region=us-central1 --project=${result.currentProject} --format="value(state)"`,
          { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }
        ).trim();
        if (fnState === 'ACTIVE') {
          result.killSwitchFunctionDeployed = true;
        }
      } catch (e) {}
    }
  }

  // 3. 檢查 ADC 憑證路徑與配額專案 (quota_project_id)
  const adcPaths = isWin
    ? [
        path.join(process.env.APPDATA || '', 'gcloud', 'application_default_credentials.json'),
        path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json')
      ]
    : [
        path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json')
      ];

  for (const ap of adcPaths) {
    if (fs.existsSync(ap)) {
      result.adcExists = true;
      result.adcPath = ap;
      try {
        const adcJson = JSON.parse(fs.readFileSync(ap, 'utf8'));
        if (adcJson.quota_project_id) {
          result.adcQuotaProject = adcJson.quota_project_id;
        }
      } catch (e) {}
      break;
    }
  }

  // 4. 產生診斷建議
  if (!result.gcloudInstalled) {
    result.recommendation = isWin
      ? '未偵測到 gcloud CLI。建議使用 winget 或官方安裝程式進行安裝。'
      : isMac
      ? '未偵測到 gcloud CLI。建議使用 Homebrew (brew install --cask gcloud-cli) 進行安裝。'
      : '未偵測到 gcloud CLI。請使用官方 curl 腳本安裝。';
  } else if (!result.authenticatedAccount) {
    result.recommendation = '已安裝 gcloud，但尚未登入 Google 帳號。請執行 gcloud auth login 完成登入。';
  } else if (!result.currentProject) {
    result.recommendation = '已登入 gcloud，但尚未設定預設 GCP 專案。請執行 gcloud config set project <PROJECT_ID>。';
  } else if (!result.billingEnabled) {
    result.recommendation = `目前專案 (${result.currentProject}) 尚未綁定有效帳單帳戶 (或未啟用 cloudbilling.googleapis.com)。請先確認專案已連結帳單帳戶。`;
  } else if (!result.adcExists) {
    result.recommendation = `已設定專案 (${result.currentProject})，但尚未設定應用程式預設憑證 (ADC)。建議執行 gcloud auth application-default login --project=${result.currentProject}。`;
  } else if (result.currentProject && result.adcQuotaProject && result.currentProject !== result.adcQuotaProject) {
    result.recommendation = `目前 gcloud 預設專案 (${result.currentProject}) 與 ADC 配額專案 (${result.adcQuotaProject}) 不一致。若需使用 ADC，建議執行 gcloud auth application-default login --project=${result.currentProject} 重新對齊。`;
  } else {
    const currencyHint = result.billingCurrency ? ` (帳單預設幣別: ${result.billingCurrency})` : '';
    result.recommendation = `環境完備${currencyHint}。設定 90% 自動熔斷預算前，請務必使用 ask_question 向使用者確認抵免額總額與週期 (month/year)。`;
  }

  return result;
}

if (process.argv[1] && process.argv[1].endsWith('check-env.mjs')) {
  const projArg = process.argv.slice(2).find((a) => a.startsWith('--project='));
  const targetProject = projArg ? projArg.split('=')[1] : '';
  console.log(JSON.stringify(checkEnv({ targetProject }), null, 2));
}
