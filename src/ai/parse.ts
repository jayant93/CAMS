import { ExtractionResult } from '../types';
import { AIProviderError } from './types';

const MAX_ITEM_CHARS = 200;
const MAX_LIST_ITEMS = 10;

export function parseExtractionResponse(raw: string): ExtractionResult {
  const cleaned = stripCodeFences(raw.trim());
  if (cleaned.length === 0) {
    throw new AIProviderError('AI response was empty.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    const recovered = tryRecoverJson(cleaned);
    if (recovered === undefined) {
      throw new AIProviderError(
        `AI returned invalid JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    parsed = recovered;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AIProviderError('AI response was not a JSON object.');
  }

  const record = parsed as Record<string, unknown>;
  const goal = typeof record.goal === 'string' ? record.goal.trim() : '';

  return {
    goal: goal.length > 0 ? truncate(goal) : undefined,
    decisions: sanitizeList(record.decisions),
    assumptions: sanitizeList(record.assumptions),
    pending: sanitizeList(record.pending)
  };
}

function sanitizeList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const cleaned: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    cleaned.push(truncate(trimmed));
    if (cleaned.length >= MAX_LIST_ITEMS) break;
  }
  return cleaned;
}

function truncate(value: string): string {
  if (value.length <= MAX_ITEM_CHARS) return value;
  return value.slice(0, MAX_ITEM_CHARS - 1) + '…';
}

function stripCodeFences(value: string): string {
  if (!value.startsWith('```')) return value;
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

function tryRecoverJson(value: string): unknown {
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return undefined;
  try {
    return JSON.parse(value.slice(start, end + 1));
  } catch {
    return undefined;
  }
}
