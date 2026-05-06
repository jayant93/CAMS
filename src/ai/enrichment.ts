import { ExtractionResult, FileEdit, TaskContext, TaskEvent } from '../types';

const MAX_BUNDLE_CHARS = 16000;
const MAX_DIFFS_PER_FILE = 2;
const MAX_TOTAL_DIFFS = 8;
const MAX_DIFF_CHARS = 1500;
const MAX_SNAPSHOTS = 3;
const MAX_SNAPSHOT_CHARS = 800;

/**
 * Builds a compact text bundle from a TaskContext that an AI provider can
 * read to infer goal / decisions / assumptions / pending. Only diffs and
 * developer-saved notes are included — never raw filesystem content.
 */
export function bundleActivityForEnrichment(context: TaskContext): string {
  const sections: string[] = [];

  sections.push(`Session name: ${context.task.name}`);

  const goal = latestEventContent(context.events, 'goal');
  if (goal && goal !== context.task.name) {
    sections.push(`Stated goal: ${goal}`);
  }

  const touched = uniqueFilePaths(context.fileEdits);
  if (touched.length > 0) {
    sections.push(`Touched files: ${touched.join(', ')}`);
  }

  const existingDecisions = eventContents(context.events, 'decision');
  const existingAssumptions = eventContents(context.events, 'assumption');
  const existingPending = eventContents(context.events, 'pending');

  if (existingDecisions.length > 0) {
    sections.push(`Already-known decisions:\n${listLines(existingDecisions)}`);
  }
  if (existingAssumptions.length > 0) {
    sections.push(`Already-known assumptions:\n${listLines(existingAssumptions)}`);
  }
  if (existingPending.length > 0) {
    sections.push(`Already-known pending:\n${listLines(existingPending)}`);
  }

  const snapshots = eventContents(context.events, 'snapshot').slice(-MAX_SNAPSHOTS);
  if (snapshots.length > 0) {
    sections.push('Developer notes / chat snapshots:');
    for (const [index, snapshot] of snapshots.entries()) {
      sections.push(`Snapshot ${index + 1}:\n${truncate(snapshot, MAX_SNAPSHOT_CHARS)}`);
    }
  }

  const diffs = selectRecentDiffs(context.fileEdits);
  if (diffs.length > 0) {
    sections.push('Recent file diffs (most recent last):');
    for (const edit of diffs) {
      sections.push(`File: ${edit.filePath} @ ${edit.timestamp}`);
      sections.push('```diff');
      sections.push(truncate(edit.diff.trim(), MAX_DIFF_CHARS));
      sections.push('```');
    }
  }

  const bundle = sections.join('\n\n');
  return enforceLimit(bundle, MAX_BUNDLE_CHARS);
}

/**
 * Whether there is any content worth sending to the AI. Avoids spending
 * budget on a near-empty session.
 */
export function hasEnrichableContent(context: TaskContext): boolean {
  if (context.fileEdits.length > 0) return true;
  return context.events.some((event) => event.type === 'snapshot');
}

/**
 * Removes items already present (case-insensitive, trimmed) so the enriched
 * prompt does not double-list the same point.
 */
export function dedupeAgainstExisting(
  enriched: ExtractionResult,
  existing: TaskContext
): ExtractionResult {
  const existingDecisions = lowercaseSet(eventContents(existing.events, 'decision'));
  const existingAssumptions = lowercaseSet(eventContents(existing.events, 'assumption'));
  const existingPending = lowercaseSet(eventContents(existing.events, 'pending'));
  return {
    goal: enriched.goal,
    decisions: enriched.decisions.filter((item) => !existingDecisions.has(item.toLowerCase())),
    assumptions: enriched.assumptions.filter((item) => !existingAssumptions.has(item.toLowerCase())),
    pending: enriched.pending.filter((item) => !existingPending.has(item.toLowerCase()))
  };
}

function lowercaseSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()));
}

function eventContents(events: TaskEvent[], type: TaskEvent['type']): string[] {
  return events.filter((event) => event.type === type).map((event) => event.content.trim()).filter(Boolean);
}

function latestEventContent(events: TaskEvent[], type: TaskEvent['type']): string | undefined {
  return eventContents(events, type).at(-1);
}

function uniqueFilePaths(edits: FileEdit[]): string[] {
  return [...new Set(edits.map((edit) => edit.filePath))];
}

function selectRecentDiffs(edits: FileEdit[]): FileEdit[] {
  const grouped = new Map<string, FileEdit[]>();
  for (const edit of edits) {
    const list = grouped.get(edit.filePath) ?? [];
    list.push(edit);
    grouped.set(edit.filePath, list);
  }

  const trimmed: FileEdit[] = [];
  for (const list of grouped.values()) {
    const recent = list.slice(-MAX_DIFFS_PER_FILE);
    trimmed.push(...recent);
  }

  trimmed.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return trimmed.slice(-MAX_TOTAL_DIFFS);
}

function listLines(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n[truncated at ${max} characters]`;
}

function enforceLimit(value: string, max: number): string {
  if (value.length <= max) return value;
  const marker = '\n\n[bundle truncated to fit AI input budget]';
  return `${value.slice(0, Math.max(0, max - marker.length))}${marker}`;
}
