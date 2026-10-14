# antigravity-agent-platform

English | [繁體中文](README.zh-TW.md)

`antigravity-agent-platform` is an official standard plugin for the Google Antigravity ecosystem, providing comprehensive support for the Antigravity Command-Line Interface (`agy`), the Antigravity Integrated Development Environment, and the Antigravity 2.0 Desktop Application.

This plugin offers cross-platform (Windows & macOS) automated pre-check and installation guidance for the Google Cloud SDK (`gcloud`), streamlined configuration for Agent Platform and Gemini 4 Argon frontier reasoning models, and an automated 90% Credit Cloud Kill Switch (Plan A) to help prevent unexpected credit card charges.

> [!WARNING]
> **Disclaimer & Billing Risk Warning**
> Even when using this plugin's 90% automated cloud kill switch, you remain solely responsible for monitoring your Google Cloud promotional credits, eligible service scopes, expiration dates, and actual billing usage in the Google Cloud Console (`Billing > Credits`). Due to inherent Google Cloud billing telemetry latency, credit scope restrictions, or configuration variances, this plugin is provided "AS IS" as an assistive safeguard and **assumes no liability or responsibility for any unexpected charges, credit card deductions, or additional cloud expenses**.

## How to Install

Run the following command in your terminal to install the plugin:

```bash
agy plugin install https://github.com/AndyAWD/antigravity-agent-platform
```

## Key Highlights

- **Cross-Platform Intelligent Pre-Check & Installation**: Automatically identifies Windows and macOS environments, guiding automated installation through native package managers (`winget`, Homebrew) or official installers.
- **`agy` CLI `/logout` GCP Project Switching & Keyless Auth**: Built for users switching `agy` CLI from consumer subscription login to a Google Cloud project via `/logout` (for example, using Google One AI Pro's $10/month GCP credits to access Gemini 4 Argon). Aligns `gcloud` and Application Default Credentials (ADC) without manual API key generation.
- **One-Click Agent Platform & Gemini 4 Argon Enablement**: Enables `aiplatform.googleapis.com`, `cloudaicompanion.googleapis.com`, `generativelanguage.googleapis.com`, `agentregistry.googleapis.com`, and `geminicloudassist.googleapis.com` in one command, unlocking 1,048,576 input tokens and 32,768 output tokens with extended thinking.
- **90% Credit Automated Cloud Kill Switch (End-to-End Deployment)**:
  - Automatically detects your Cloud Billing Account's currency (`currencyCode`) and prompts you via `ask_question` to confirm your remaining credit amount and calculation window (`custom` / `--start-date` starting from today by default to exclude previously consumed historical credits, or `month` for monthly resets).
  - Deploys Cloud Billing Budgets (`exclude-all-credits` to track gross spend before promotional credits are deducted), Cloud Pub/Sub, and the Cloud Run Function (`billing-kill-switch-fn` on Node.js 22 ES Modules), while **automatically binding the required IAM roles** (`roles/billing.projectManager` and `roles/billing.admin`) so the function has permission to unlink billing at 90%.
  - Includes a `--dry-run-test` mode to safely verify Pub/Sub delivery and Cloud Billing API permissions without unlinking your project's billing account.
- **Official Standard Plugin Architecture**: Complies with the Antigravity `plugin.json` manifest specification, verified via `agy plugin validate` for reliable multi-machine distribution.

## How to Manage and Switch Plugins

• List installed plugins:

  ```bash
  agy plugin list
  ```

• Enable plugin:

  ```bash
  agy plugin enable antigravity-agent-platform
  ```

• Disable plugin:

  ```bash
  agy plugin disable antigravity-agent-platform
  ```

• Uninstall plugin:

  ```bash
  agy plugin uninstall antigravity-agent-platform
  ```

## Project Directory Tree

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

## Command & Skill Reference

### `/antigravity-agent-platform:agy-agent-platform`

```text
/antigravity-agent-platform:agy-agent-platform
```

- **When to Use**:
  - Switching `agy` CLI via `/logout` to a GCP project to access Gemini 4 Argon and deploying the 90% credit cloud kill switch protection.
  - Setting up Antigravity on a new machine requiring Google Cloud SDK (`gcloud`) installation and API enablement.

- **How It Works**:
  1. **Cross-Platform Pre-Check**: Inspects operating system, `gcloud` installation path, active login session, ADC status, linked Billing Account, billing currency (`currencyCode`), and kill switch function status.
  2. **Intelligent Setup Guidance**: Automates `gcloud` installation if missing; launches browser authentication for account and credential binding if not logged in.
  3. **Cloud API Enablement**: Enables Agent Platform, Vertex AI, and Cloud Billing Budgets APIs for the target project.
  4. **Interactive Credit Confirmation & Cloud Kill Switch Deployment**: Uses `ask_question` (JSON format without misleading preset amount options) to prompt for your remaining credit amount and window (`custom` with `--start-date` from today or `month`), deploys the `billing-kill-switch-fn` Cloud Run Function, binds IAM roles (`roles/billing.projectManager` and `roles/billing.admin`), and links a 90% gross-spend budget alert (`exclude-all-credits`) to the Pub/Sub topic.
  5. **Dry-Run Verification & Model Connection Check**: Supports `--dry-run-test` to validate the pipeline safely and verifies project readiness across `agy` CLI, Antigravity 2.0 Desktop, and IDE.

- **Arguments**:
  - No required arguments. Launch the command directly to start the interactive wizard.

## License

This project is licensed under the [MIT License](LICENSE).
