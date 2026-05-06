import * as vscode from 'vscode';
import { AssistantWatcher } from './capture/assistantWatcher';
import { BackgroundEnricher } from './capture/backgroundEnricher';
import { FileWatcher } from './capture/fileWatcher';
import { SessionManager } from './capture/sessionManager';
import { BackgroundSessionNamer } from './capture/sessionNamer';
import { configureAI } from './commands/configureAI';
import { continueTask } from './commands/continueTask';
import { endTask } from './commands/endTask';
import { renameTask } from './commands/renameTask';
import { snapshotTask } from './commands/snapshotTask';
import { startTask } from './commands/startTask';
import { ConsentManager } from './config/consent';
import { SecretsStore } from './config/secrets';
import { getContinuitySettings, onContinuitySettingsChanged } from './config/settings';
import { runAutoHandoff } from './injection/autoHandoff';
import { ContinuityDatabase } from './storage/db';
import { TaskRepository } from './storage/taskRepository';
import { ContinuityStatusBar } from './ui/statusBar';

let database: ContinuityDatabase | undefined;
let fileWatcher: FileWatcher | undefined;
let assistantWatcher: AssistantWatcher | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Continuity');
  context.subscriptions.push(output);

  database = new ContinuityDatabase();
  try {
    await database.initialize(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Database initialization failed: ${message}`);
    await vscode.window.showErrorMessage(`Continuity failed to initialize storage: ${message}`);
    return;
  }

  const repository = new TaskRepository(database);
  const secrets = new SecretsStore(context.secrets);
  const consent = new ConsentManager(context.globalState);
  const statusBar = new ContinuityStatusBar();
  const session = new SessionManager(repository, output);
  const settingsProvider = () => getContinuitySettings();

  const refreshTier = async () => {
    const cfg = settingsProvider();
    const hasLicenseKey = !!(await secrets.getLicenseKey());
    if (cfg.offlineMode) {
      statusBar.setTier({ label: 'Offline', detail: 'All network calls disabled.' });
    } else if (hasLicenseKey) {
      statusBar.setTier({
        label: 'Pro',
        detail: 'AI-enriched handoff active — 50 requests/day. Handoff auto-copied on assistant switch.'
      });
    } else {
      statusBar.setTier({
        label: 'Free',
        detail: 'AI handoff active — 5 requests/day. Run "Continuity: Configure Pro" for 50/day.'
      });
    }
  };
  await refreshTier();

  // Background mode: ensure a rolling session exists immediately.
  try {
    if (settingsProvider().sessionAutoStart) {
      const task = await session.ensureActiveSession();
      statusBar.setActiveTask(task);
    } else {
      const existing = await repository.getActiveTask();
      statusBar.setActiveTask(existing);
    }
  } catch (err) {
    output.appendLine(`Session bootstrap failed: ${err instanceof Error ? err.message : err}`);
  }

  const sessionNamer = new BackgroundSessionNamer(
    repository, secrets, consent, settingsProvider, statusBar, output
  );
  const backgroundEnricher = new BackgroundEnricher(
    repository, secrets, consent, settingsProvider, output
  );

  fileWatcher = new FileWatcher(repository, output);
  fileWatcher.setOnAfterFlush(() => {
    void sessionNamer.maybeNameSession();
    void backgroundEnricher.maybeEnrich();
  });
  fileWatcher.start();

  assistantWatcher = new AssistantWatcher(
    (switchInfo) => {
      void runAutoHandoff({
        repository,
        settings: settingsProvider,
        output,
        switchInfo,
        flushFileWatcher: () => fileWatcher?.flushAll() ?? Promise.resolve(),
        secrets,
        consent
      }).catch((err) => {
        output.appendLine(`Auto handoff failed: ${err instanceof Error ? err.message : err}`);
      });
    },
    output
  );
  if (settingsProvider().autoHandoffOnAssistantSwitch) {
    assistantWatcher.start();
  }

  context.subscriptions.push(
    statusBar,
    fileWatcher,
    assistantWatcher,
    onContinuitySettingsChanged(() => {
      const cfg = settingsProvider();
      if (cfg.autoHandoffOnAssistantSwitch) {
        assistantWatcher?.start();
      } else {
        assistantWatcher?.stop();
      }
      void refreshTier();
    }),
    vscode.commands.registerCommand('continuity.refreshTier', () =>
      withErrorHandling(output, () => refreshTier())
    ),
    vscode.commands.registerCommand('continuity.startTask', () =>
      withErrorHandling(output, () => startTask(session, statusBar))
    ),
    vscode.commands.registerCommand('continuity.renameTask', () =>
      withErrorHandling(output, () => renameTask(session, statusBar, sessionNamer))
    ),
    vscode.commands.registerCommand('continuity.snapshotTask', () =>
      withErrorHandling(output, () =>
        snapshotTask({ repository, secrets, consent, settings: settingsProvider, output })
      )
    ),
    vscode.commands.registerCommand('continuity.continueTask', () =>
      withErrorHandling(output, async () => {
        await fileWatcher?.flushAll();
        await continueTask({ repository, settings: settingsProvider, secrets, consent, output });
      })
    ),
    vscode.commands.registerCommand('continuity.endTask', () =>
      withErrorHandling(output, async () => {
        await fileWatcher?.flushAll();
        const rotate = settingsProvider().sessionAutoStart;
        await endTask(repository, session, statusBar, rotate);
      })
    ),
    vscode.commands.registerCommand('continuity.configureAI', () =>
      withErrorHandling(output, async () => {
        await configureAI(secrets);
        await refreshTier();
      })
    )
  );
}

export async function deactivate(): Promise<void> {
  await fileWatcher?.flushAll();
  database?.dispose();
}

async function withErrorHandling(
  output: vscode.OutputChannel,
  action: () => Promise<void>
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Command failed: ${message}`);
    await vscode.window.showErrorMessage(`Continuity: ${message}`);
  }
}
