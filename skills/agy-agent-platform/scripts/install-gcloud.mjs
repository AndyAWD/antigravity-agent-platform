import { execSync } from 'child_process';
import os from 'os';

/**
 * 跨平台 gcloud 自動安裝輔助腳本 (Install gcloud helper)
 * 支援 Windows (winget/msi) 與 macOS (Homebrew/curl)
 */
export function getInstallPlan() {
  const platform = os.platform();
  const isWin = platform === 'win32';
  const isMac = platform === 'darwin';

  if (isWin) {
    let hasWinget = false;
    try {
      execSync('winget --version', { stdio: 'ignore', windowsHide: true });
      hasWinget = true;
    } catch (e) {}

    return {
      platform: 'windows',
      hasPackageManager: hasWinget,
      packageManagerName: 'winget',
      command: hasWinget
        ? 'winget install -e --id Google.CloudSDK --accept-source-agreements --accept-package-agreements'
        : '請下載官方安裝程式：https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe',
      instructions: hasWinget
        ? '在 PowerShell 或命令提示字元執行 winget 指令進行靜默/引導安裝。'
        : '請前往官網下載 GoogleCloudSDKInstaller.exe 並依照畫面提示完成安裝。'
    };
  } else if (isMac) {
    let hasBrew = false;
    try {
      execSync('brew --version', { stdio: 'ignore' });
      hasBrew = true;
    } catch (e) {}

    return {
      platform: 'macos',
      hasPackageManager: hasBrew,
      packageManagerName: 'brew',
      command: hasBrew
        ? 'brew install --cask gcloud-cli'
        : 'curl https://sdk.cloud.google.com | bash',
      instructions: hasBrew
        ? '在終端機執行 brew install --cask gcloud-cli 進行安裝。'
        : '在終端機執行 curl https://sdk.cloud.google.com | bash 進行官方腳本安裝，完成後執行 exec -l $SHELL 重新載入設定。'
    };
  } else {
    return {
      platform: 'linux',
      hasPackageManager: false,
      command: 'curl https://sdk.cloud.google.com | bash',
      instructions: '在終端機執行 curl https://sdk.cloud.google.com | bash 進行安裝。'
    };
  }
}

if (process.argv[1] && process.argv[1].endsWith('install-gcloud.mjs')) {
  console.log(JSON.stringify(getInstallPlan(), null, 2));
}
