import * as vscode from 'vscode';
import { BackgroundSessionNamer } from '../capture/sessionNamer';
import { SessionManager } from '../capture/sessionManager';
import { CamsStatusBar } from '../ui/statusBar';

export async function renameTask(
  session: SessionManager,
  statusBar: CamsStatusBar,
  sessionNamer?: BackgroundSessionNamer
): Promise<void> {
  const current = await session.ensureActiveSession();
  const name = await vscode.window.showInputBox({
    title: 'CAMS: Name Current Session',
    prompt: 'Describe what you are working on. This becomes the goal in the handoff prompt.',
    value: current.name,
    placeHolder: 'Fix auth refresh bug',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? 'Name cannot be empty.' : undefined)
  });
  if (!name) return;

  const updated = await session.renameActive(name.trim());
  if (updated) {
    // User set an explicit name — prevent AI from overwriting it later
    sessionNamer?.lockSession(updated.id);
    statusBar.setActiveTask(updated);
    await vscode.window.showInformationMessage(`CAMS: session named "${updated.name}".`);
  }
}
