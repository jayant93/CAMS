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
import { getCamsSettings, onCamsSettingsChanged } from './config/settings';
import { runAutoHandoff } from './injection/autoHandoff';
import { CamsDatabase } from './storage/db';
import { TaskRepository } from './storage/taskRepository';
import { CamsStatusBar, StatusBarTier } from './ui/statusBar';
import { CamsSidebarProvider } from './ui/sidebarProvider';

let database: CamsDatabase | undefined;
let fileWatcher: FileWatcher | undefined;
let assistantWatcher: AssistantWatcher | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('CAMS');
  context.subscriptions.push(output);

  database = new CamsDatabase();
  try {
    await database.initialize(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`Database initialization failed: ${message}`);
    await vscode.window.showErrorMessage(`CAMS failed to initialize storage: ${message}`);
    return;
  }

  const repository = new TaskRepository(database);
  const secrets = new SecretsStore(context.secrets);
  const consent = new ConsentManager(context.globalState);
  const statusBar = new CamsStatusBar();
  const session = new SessionManager(repository, output);
  const settingsProvider = () => getCamsSettings();

  // ── Sidebar Webview ─────────────────────────────────────────────────────────
  const sidebarProvider = new CamsSidebarProvider(context.extensionUri, repository);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CamsSidebarProvider.viewType, sidebarProvider)
  );

  const refreshTier = async () => {
    const cfg = settingsProvider();
    const hasLicenseKey = !!(await secrets.getLicenseKey());
    let tierInfo: StatusBarTier;
    if (cfg.offlineMode) {
      tierInfo = { label: 'Offline', detail: 'All network calls disabled.' };
    } else if (hasLicenseKey) {
      tierInfo = {
        label: 'Pro',
        detail: 'AI-enriched handoff active — 50 requests/day. Handoff auto-copied on assistant switch.'
      };
    } else {
      tierInfo = {
        label: 'Free',
        detail: 'AI handoff active — 5 requests/day. Run "CAMS: Configure Pro" for 50/day.'
      };
    }
    statusBar.setTier(tierInfo);
    sidebarProvider.updateTier(tierInfo);
  };
  await refreshTier();

  // Background mode: ensure a rolling session exists immediately.
  try {
    if (settingsProvider().sessionAutoStart) {
      const task = await session.ensureActiveSession();
      statusBar.setActiveTask(task);
      sidebarProvider.updateState(task);
    } else {
      const existing = await repository.getActiveTask();
      statusBar.setActiveTask(existing);
      sidebarProvider.updateState(existing ?? undefined);
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
    onCamsSettingsChanged(() => {
      const cfg = settingsProvider();
      if (cfg.autoHandoffOnAssistantSwitch) {
        assistantWatcher?.start();
      } else {
        assistantWatcher?.stop();
      }
      void refreshTier();
    }),
    vscode.commands.registerCommand('camsAI.refreshTier', () =>
      withErrorHandling(output, () => refreshTier())
    ),
    vscode.commands.registerCommand('camsAI.startTask', () =>
      withErrorHandling(output, async () => {
        await startTask(session, statusBar);
        await sidebarProvider.syncFromRepository();
      })
    ),
    vscode.commands.registerCommand('camsAI.renameTask', () =>
      withErrorHandling(output, async () => {
        await renameTask(session, statusBar, sessionNamer);
        await sidebarProvider.syncFromRepository();
      })
    ),
    vscode.commands.registerCommand('camsAI.snapshotTask', () =>
      withErrorHandling(output, async () => {
        await snapshotTask({ repository, secrets, consent, settings: settingsProvider, output });
        await sidebarProvider.syncFromRepository();
      })
    ),
    vscode.commands.registerCommand('camsAI.continueTask', () =>
      withErrorHandling(output, async () => {
        await fileWatcher?.flushAll();
        await continueTask({ repository, settings: settingsProvider, secrets, consent, output });
        await sidebarProvider.syncFromRepository();
      })
    ),
    vscode.commands.registerCommand('camsAI.endTask', () =>
      withErrorHandling(output, async () => {
        await fileWatcher?.flushAll();
        const rotate = settingsProvider().sessionAutoStart;
        await endTask(repository, session, statusBar, rotate);
        await sidebarProvider.syncFromRepository();
      })
    ),
    vscode.commands.registerCommand('camsAI.configureAI', () =>
      withErrorHandling(output, async () => {
        await configureAI(secrets);
        await refreshTier();
        await sidebarProvider.syncFromRepository();
      })
    ),
    vscode.commands.registerCommand('camsAI.openSidebar', () => {
      void vscode.commands.executeCommand('camsAI.sidebar.focus');
    })
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
    await vscode.window.showErrorMessage(`CAMS: ${message}`);
  }
}
