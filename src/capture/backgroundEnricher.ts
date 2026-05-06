import * as vscode from 'vscode';
import {
  bundleActivityForEnrichment,
  dedupeAgainstExisting,
  resolveAIProvider
} from '../ai';
import { ConsentManager } from '../config/consent';
import { SecretsStore } from '../config/secrets';
import { TaskRepository } from '../storage/taskRepository';
import { CamsSettings, ExtractionResult } from '../types';
import { shouldEnrich } from './enrichmentGate';

export { shouldEnrich } from './enrichmentGate';

/**
 * Fires AI enrichment in the background when a session has accumulated enough
 * activity but no decisions/assumptions/pending have been captured yet.
 * Persists the AI's inferences as task events so they survive across handoffs.
 */
export class BackgroundEnricher {
  /** taskId → timestamp of last successful enrichment */
  private readonly lastEnrichedAt = new Map<string, number>();
  /** Tracks how many file edits existed at last enrichment, to require new signal */
  private readonly lastEnrichmentEditCount = new Map<string, number>();

  constructor(
    private readonly repository: TaskRepository,
    private readonly secrets: SecretsStore,
    private readonly consent: ConsentManager,
    private readonly settings: () => CamsSettings,
    private readonly output: vscode.OutputChannel
  ) {}

  /** Called after each file flush. Never throws — logs failures silently. */
  async maybeEnrich(): Promise<void> {
    try {
      await this.attempt();
    } catch (err) {
      this.output.appendLine(
        `Background enrichment skipped: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async attempt(): Promise<void> {
    const cfg = this.settings();
    if (cfg.offlineMode || !cfg.enrichHandoffWithAI) return;
    if (!this.consent.hasExtractionConsent()) return;

    const task = await this.repository.getActiveTask();
    if (!task) return;

    const ctx = await this.repository.getTaskContext(task.id);
    if (!ctx) return;

    if (!shouldEnrich(ctx, this.lastEnrichedAt.get(task.id), this.lastEnrichmentEditCount.get(task.id))) {
      return;
    }

    const resolution = await resolveAIProvider(cfg, this.secrets);
    if (!resolution.provider) return;

    // Reserve the slot before the async call to prevent concurrent duplicate calls
    this.lastEnrichedAt.set(task.id, Date.now());
    this.lastEnrichmentEditCount.set(task.id, ctx.fileEdits.length);

    const bundle = bundleActivityForEnrichment(ctx);
    const raw = await resolution.provider.enrichActivity(bundle);
    const enriched = dedupeAgainstExisting(raw, ctx);

    await this.persistEnrichment(task.id, enriched);

    const total = enriched.decisions.length + enriched.assumptions.length + enriched.pending.length;
    if (total > 0) {
      vscode.window.setStatusBarMessage(
        `$(sparkle) CAMS: AI inferred ${total} item${total === 1 ? '' : 's'} from your changes`,
        6_000
      );
      this.output.appendLine(
        `Background enrichment persisted: +${enriched.decisions.length} decisions, ` +
        `+${enriched.assumptions.length} assumptions, +${enriched.pending.length} pending.`
      );
    } else {
      this.output.appendLine('Background enrichment ran but produced no new items.');
    }
  }

  private async persistEnrichment(taskId: string, enriched: ExtractionResult): Promise<void> {
    const meta = { source: 'background-enrichment' };
    if (enriched.goal) {
      await this.repository.addEvent(taskId, 'goal', enriched.goal, meta);
    }
    for (const decision of enriched.decisions) {
      await this.repository.addEvent(taskId, 'decision', decision, meta);
    }
    for (const assumption of enriched.assumptions) {
      await this.repository.addEvent(taskId, 'assumption', assumption, meta);
    }
    for (const pending of enriched.pending) {
      await this.repository.addEvent(taskId, 'pending', pending, meta);
    }
  }
}

