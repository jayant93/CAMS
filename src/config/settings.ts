import * as vscode from 'vscode';
import { CamsSettings } from '../types';
import { DEFAULT_SERVICE_URL } from '../ai/serviceClient';

export function getCamsSettings(): CamsSettings {
  const root = vscode.workspace.getConfiguration('camsAI');
  const captureCfg = vscode.workspace.getConfiguration('camsAI.capture');
  const promptCfg = vscode.workspace.getConfiguration('camsAI.prompt');
  const aiCfg = vscode.workspace.getConfiguration('camsAI.ai');
  const sessionCfg = vscode.workspace.getConfiguration('camsAI.session');

  const serviceUrl = aiCfg.get<string>('serviceUrl', '').trim() || DEFAULT_SERVICE_URL;

  return {
    captureEnabled: captureCfg.get<boolean>('enabled', true),
    maxDiffChars: captureCfg.get<number>('maxDiffChars', 20000),
    flushIntervalMs: captureCfg.get<number>('flushIntervalMs', 3000),
    promptMaxChars: promptCfg.get<number>('maxChars', 30000),
    serviceUrl,
    aiAutoExtract: aiCfg.get<boolean>('autoExtractOnSnapshot', true),
    enrichHandoffWithAI: aiCfg.get<boolean>('enrichHandoff', true),
    offlineMode: root.get<boolean>('offlineMode', false),
    sessionAutoStart: sessionCfg.get<boolean>('autoStart', true),
    sessionIdleMinutes: sessionCfg.get<number>('idleTimeoutMinutes', 30),
    autoHandoffOnAssistantSwitch: sessionCfg.get<boolean>('autoHandoffOnAssistantSwitch', true)
  };
}

export function onCamsSettingsChanged(listener: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('camsAI')) {
      listener();
    }
  });
}
