import * as vscode from 'vscode';
import { SessionManager } from '../capture/sessionManager';
import { TaskRepository } from '../storage/taskRepository';
import { ContinuityStatusBar } from '../ui/statusBar';

export async function endTask(
  repository: TaskRepository,
  session: SessionManager,
  statusBar: ContinuityStatusBar,
  rotate: boolean
): Promise<void> {
  const activeTask = await repository.getActiveTask();
  if (!activeTask) {
    await vscode.window.showInformationMessage('Continuity: no active session to end.');
    return;
  }

  if (rotate) {
    const fresh = await session.rotateSession();
    statusBar.setActiveTask(fresh);
    await vscode.window.showInformationMessage(
      `Continuity: closed "${activeTask.name}", started fresh session "${fresh.name}".`
    );
    return;
  }

  await repository.endActiveTask();
  statusBar.setActiveTask(undefined);
  await vscode.window.showInformationMessage(`Continuity: ended session "${activeTask.name}".`);
}
