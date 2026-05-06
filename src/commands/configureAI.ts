import * as vscode from 'vscode';
import { SecretsStore } from '../config/secrets';

/**
 * "CAMS: Configure Pro" command.
 * Users enter a license key to upgrade to the Pro tier (50 AI requests/day).
 * Free tier (5/day) works without any configuration.
 */
export async function configureAI(secrets: SecretsStore): Promise<void> {
  interface ConfigureChoice extends vscode.QuickPickItem {
    value: 'set-key' | 'clear-key' | 'open-settings';
  }

  const existing = await secrets.getLicenseKey();

  const items: ConfigureChoice[] = [
    {
      label: existing ? '$(key) Replace Pro license key' : '$(key) Enter Pro license key',
      description: existing
        ? 'A key is already saved — replace it.'
        : 'Unlock 50 AI context requests per day.',
      value: 'set-key'
    },
    {
      label: '$(trash) Remove license key',
      description: 'Revert to free tier (5 AI requests/day).',
      value: 'clear-key'
    },
    {
      label: '$(gear) Open CAMS settings',
      description: 'Offline mode, capture options, service URL override.',
      value: 'open-settings'
    }
  ];

  const choice = await vscode.window.showQuickPick(items, {
    title: 'CAMS: Configure Pro',
    placeHolder: existing
      ? 'Pro license key is active (50 requests/day)'
      : 'Free tier active — 5 AI requests/day'
  });
  if (!choice) return;

  switch (choice.value) {
    case 'set-key':
      await setLicenseKey(secrets);
      return;
    case 'clear-key':
      await secrets.clearLicenseKey();
      await vscode.window.showInformationMessage(
        'CAMS: license key removed. Running on free tier (5 AI requests/day).'
      );
      return;
    case 'open-settings':
      await vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:camsAI.camsAI'
      );
      return;
  }
}

async function setLicenseKey(secrets: SecretsStore): Promise<void> {
  const key = await vscode.window.showInputBox({
    title: 'CAMS Pro License Key',
    prompt: 'Paste your license key. It is stored in VS Code SecretStorage and never logged.',
    placeHolder: 'CAMS-XXXX-XXXX-XXXX',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (value.trim().length === 0) return null;
      if (value.trim().length < 10) {
        return {
          message: 'This looks too short for a valid license key.',
          severity: vscode.InputBoxValidationSeverity.Warning
        };
      }
      return null;
    }
  });

  const trimmed = key?.trim();
  if (!trimmed) return;

  await secrets.setLicenseKey(trimmed);
  await vscode.window.showInformationMessage(
    'CAMS: Pro license key saved. Enjoy 50 AI context requests per day. ✨'
  );
}
