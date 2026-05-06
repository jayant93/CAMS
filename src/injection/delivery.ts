import * as vscode from 'vscode';

const ASSISTANTS = ['Claude', 'Gemini', 'GitHub Copilot', 'Codex', 'Generic Assistant'];

export async function pickTargetAssistant(): Promise<string | undefined> {
  return vscode.window.showQuickPick(ASSISTANTS, {
    title: 'Continue Task In...',
    placeHolder: 'Choose the assistant you will paste the handoff into'
  });
}

export async function copyPromptToClipboard(prompt: string, targetAssistant: string): Promise<void> {
  await vscode.env.clipboard.writeText(prompt);
  await vscode.window.showInformationMessage(
    `Continuity: context copied for ${targetAssistant}. Paste it into your target assistant.`
  );
}
