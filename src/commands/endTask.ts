import * as vscode from 'vscode';
import { SessionManager } from '../capture/sessionManager';
import { TaskRepository } from '../storage/taskRepository';
import { CamsStatusBar } from '../ui/statusBar';

export async function endTask(
  repository: TaskRepository,
  session: SessionManager,
  statusBar: CamsStatusBar,
  rotate: boolean
): Promise<void> {
  const activeTask = await repository.getActiveTask();
  if (!activeTask) {
    await vscode.window.showInformationMessage('CAMS: no active session to end.');
    return;
  }

  if (rotate) {
    const fresh = await session.rotateSession();
    statusBar.setActiveTask(fresh);
    await vscode.window.showInformationMessage(
      `CAMS: closed "${activeTask.name}", started fresh session "${fresh.name}".`
    );
    return;
  }

  await repository.endActiveTask();
  statusBar.setActiveTask(undefined);
  await vscode.window.showInformationMessage(`CAMS: ended session "${activeTask.name}".`);
}
