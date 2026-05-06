import { ExtractionResult } from '../types';
import { parseExtractionResponse } from './parse';
import { SYSTEM_PROMPT_ACTIVITY, SYSTEM_PROMPT_CONVERSATION, SYSTEM_PROMPT_SESSION_NAME } from './prompts';
import { AIProvider, AIProviderError, SessionNameResult } from './types';

const DEFAULT_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_INPUT_CHARS = 20000;
const REFERER = 'https://github.com/continuity-vscode/continuity';
const APP_TITLE = 'Continuity VS Code Extension';

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  endpoint?: string;
  timeoutMs?: number;
}

export class OpenRouterProvider implements AIProvider {
  readonly id = 'openrouter';
  readonly displayName = 'OpenRouter';

  constructor(private readonly config: OpenRouterConfig) {}

  get model(): string {
    return this.config.model;
  }

  /** Conversation-style extraction (used by manual snapshot). */
  async extract(rawText: string): Promise<ExtractionResult> {
    const content = await this.chat(SYSTEM_PROMPT_CONVERSATION, rawText);
    return parseExtractionResponse(content);
  }

  /** Activity-style enrichment (used by auto handoff to read diffs + notes). */
  async enrichActivity(rawText: string): Promise<ExtractionResult> {
    const content = await this.chat(SYSTEM_PROMPT_ACTIVITY, rawText);
    return parseExtractionResponse(content);
  }

  /** Session naming — runs once per session after enough diffs accumulate. */
  async inferSessionName(bundle: string): Promise<SessionNameResult> {
    const content = await this.chat(SYSTEM_PROMPT_SESSION_NAME, bundle);
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

  private async chat(systemPrompt: string, userText: string): Promise<string> {
    const endpoint = this.config.endpoint ?? DEFAULT_ENDPOINT;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30000);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': REFERER,
          'X-Title': APP_TITLE
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText.slice(0, MAX_INPUT_CHARS) }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await safeReadError(response);
        throw new AIProviderError(
          `OpenRouter API returned HTTP ${response.status}${detail ? ` — ${detail}` : ''}.`
        );
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (json.error?.message) {
        throw new AIProviderError(`OpenRouter error: ${json.error.message}`);
      }

      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new AIProviderError('OpenRouter response was missing content.');
      }
      return content;
    } catch (err) {
      if (err instanceof AIProviderError) throw err;
      if ((err as Error)?.name === 'AbortError') {
        throw new AIProviderError('OpenRouter request timed out.');
      }
      throw new AIProviderError(
        `OpenRouter request failed: ${(err as Error).message ?? String(err)}`,
        err
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function safeReadError(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    const trimmed = text.trim();
    if (trimmed.length === 0) return undefined;
    return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
  } catch {
    return undefined;
  }
}
