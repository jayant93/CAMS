import { ExtractionResult } from '../types';
import { parseExtractionResponse } from './parse';
import { AIProvider, AIProviderError, SessionNameResult } from './types';
import {
  SYSTEM_PROMPT_ACTIVITY,
  SYSTEM_PROMPT_CONVERSATION,
  SYSTEM_PROMPT_SESSION_NAME
} from './prompts';

/**
 * ─── Backend URL Configuration ───────────────────────────────────────────────
 * Leave empty for open-source builds; set `camsAI.ai.serviceUrl` in VS Code
 * settings after you deploy the extraction worker, or set a non-empty default
 * here when publishing a build that points at your hosted service.
 * ──────────────────────────────────────────────────────────────────────────────
 */
export const DEFAULT_SERVICE_URL = '';

const TIMEOUT_MS = 30_000;
const MAX_INPUT_CHARS = 20_000;

export interface ServiceClientConfig {
  serviceUrl: string;
  licenseKey?: string;
  deviceId: string;
}

/**
 * Calls your hosted extraction service instead of OpenRouter directly.
 * The service handles rate-limiting (free: 5/day, pro: 50/day) and
 * all model selection/billing internally.
 */
export class CamsServiceProvider implements AIProvider {
  readonly id = 'cams-service';
  readonly displayName = 'CAMS AI';

  constructor(private readonly config: ServiceClientConfig) {}

  async extract(rawText: string): Promise<ExtractionResult> {
    const content = await this.call('conversation', rawText);
    return parseExtractionResponse(content);
  }

  async enrichActivity(rawText: string): Promise<ExtractionResult> {
    const content = await this.call('activity', rawText);
    return parseExtractionResponse(content);
  }

  async inferSessionName(bundle: string): Promise<SessionNameResult> {
    const content = await this.call('session-name', bundle);
    try {
      const json = JSON.parse(content.trim());
      const name = typeof json.name === 'string' && json.name.trim() ? json.name.trim() : '';
      const goal = typeof json.goal === 'string' && json.goal.trim() ? json.goal.trim() : '';
      if (!name) throw new AIProviderError('Session name inference returned empty name.');
      return { name, goal };
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      throw new AIProviderError(`Failed to parse session name response: ${content}`);
    }
  }

  private async call(
    task: 'conversation' | 'activity' | 'session-name',
    text: string
  ): Promise<string> {
    const url = `${this.config.serviceUrl.replace(/\/$/, '')}/api/extract`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const systemPrompt =
      task === 'conversation'
        ? SYSTEM_PROMPT_CONVERSATION
        : task === 'activity'
        ? SYSTEM_PROMPT_ACTIVITY
        : SYSTEM_PROMPT_SESSION_NAME;

    const body = JSON.stringify({
      task,
      systemPrompt,
      userText: text.slice(0, MAX_INPUT_CHARS),
      deviceId: this.config.deviceId,
      licenseKey: this.config.licenseKey ?? null
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal
      });

      if (response.status === 429) {
        const json = (await response.json().catch(() => ({}))) as { message?: string; resetAt?: string };
        const reset = json.resetAt ? ` Resets at ${json.resetAt}.` : '';
        const hint = this.config.licenseKey
          ? ''
          : ' Upgrade to Pro for 50 requests/day.';
        throw new AIProviderError(
          `Daily AI request limit reached.${reset}${hint}`
        );
      }

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new AIProviderError(
          `CAMS service returned HTTP ${response.status}${detail ? ` — ${detail.slice(0, 200)}` : ''}.`
        );
      }

      const json = (await response.json()) as { content?: string; error?: string };
      if (json.error) throw new AIProviderError(`Service error: ${json.error}`);
      if (typeof json.content !== 'string') {
        throw new AIProviderError('Service response was missing content field.');
      }
      return json.content;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if ((err as Error)?.name === 'AbortError') {
        throw new AIProviderError('CAMS service request timed out.');
      }
      throw new AIProviderError(
        `CAMS service request failed: ${(err as Error).message ?? String(err)}`,
        err
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
