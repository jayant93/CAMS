import { ExtractionResult } from '../types';

export interface SessionNameResult {
  name: string;
  goal: string;
}

export interface AIProvider {
  readonly id: string;
  readonly displayName: string;
  /** Distil decisions/assumptions/pending from a developer-AI chat snapshot. */
  extract(rawText: string): Promise<ExtractionResult>;
  /** Infer the same structure from a bundle of file diffs and notes. */
  enrichActivity(rawText: string): Promise<ExtractionResult>;
  /** Suggest a short session name + goal from accumulated diffs (runs once per session). */
  inferSessionName(bundle: string): Promise<SessionNameResult>;
}

export class AIProviderError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'AIProviderError';
  }
}
