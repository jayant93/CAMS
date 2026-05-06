import { SessionManager } from '../capture/sessionManager';
import { ContinuityStatusBar } from '../ui/statusBar';
import { renameTask } from './renameTask';

// In background-mode, "start task" is equivalent to naming the auto-started session.
// Kept as a separate command to preserve the original command id from earlier alpha.
export async function startTask(session: SessionManager, statusBar: ContinuityStatusBar): Promise<void> {
  await renameTask(session, statusBar);
}
