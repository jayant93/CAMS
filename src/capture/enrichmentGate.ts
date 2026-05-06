import { hasEnrichableContent } from '../ai/enrichment';
import { TaskContext } from '../types';

/** Minimum distinct files before we consider firing a background enrichment. */
export const MIN_DISTINCT_FILES = 3;

/** Cooldown between two background enrichments for the same session. */
export const ENRICH_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Pure decision logic for whether the background enricher should fire now.
 * No vscode imports — testable in Node directly.
 */
export function shouldEnrich(
  ctx: TaskContext,
  lastEnrichedAt: number | undefined,
  lastEditCount: number | undefined,
  now: number = Date.now()
): boolean {
  if (!hasEnrichableContent(ctx)) return false;
  const distinctFiles = new Set(ctx.fileEdits.map(e => e.filePath)).size;
  if (distinctFiles < MIN_DISTINCT_FILES) return false;

  const decisions = ctx.events.filter(e => e.type === 'decision').length;
  const assumptions = ctx.events.filter(e => e.type === 'assumption').length;
  const pending = ctx.events.filter(e => e.type === 'pending').length;
  const hasStructuredContent = decisions + assumptions + pending > 0;

  // First pass: fill the gap when nothing has been captured yet.
  if (!hasStructuredContent && lastEnrichedAt === undefined) {
    return true;
  }

  // Subsequent passes: only after cooldown AND meaningful new activity.
  if (lastEnrichedAt !== undefined) {
    const elapsed = now - lastEnrichedAt;
    if (elapsed < ENRICH_COOLDOWN_MS) return false;

    const newEdits = ctx.fileEdits.length - (lastEditCount ?? 0);
    if (newEdits < MIN_DISTINCT_FILES) return false;

    return true;
  }

  return false;
}
