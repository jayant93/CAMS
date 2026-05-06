export interface ModelOption {
  id: string;
  label: string;
  description: string;
}

// Curated OpenRouter model ids that work well for structured JSON extraction.
// Users can also paste any model id manually (see configureAI "Custom model…").
export const CURATED_OPENROUTER_MODELS: ModelOption[] = [
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o mini',
    description: 'OpenAI · cheap, fast, reliable JSON mode. Recommended default.'
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    description: 'OpenAI · higher quality, more expensive.'
  },
  {
    id: 'anthropic/claude-3.5-haiku',
    label: 'Claude 3.5 Haiku',
    description: 'Anthropic · fast, strong reasoning, JSON-friendly.'
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    label: 'Claude 3.5 Sonnet',
    description: 'Anthropic · top-tier reasoning, more expensive.'
  },
  {
    id: 'google/gemini-2.0-flash-exp',
    label: 'Gemini 2.0 Flash',
    description: 'Google · very fast, generous free tier.'
  },
  {
    id: 'google/gemini-pro-1.5',
    label: 'Gemini 1.5 Pro',
    description: 'Google · large context, solid extraction.'
  },
  {
    id: 'deepseek/deepseek-chat',
    label: 'DeepSeek V3',
    description: 'DeepSeek · cheapest tier, capable JSON mode.'
  },
  {
    id: 'deepseek/deepseek-r1',
    label: 'DeepSeek R1',
    description: 'DeepSeek · reasoning model, slower but strong.'
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B',
    description: 'Meta · open-weights, decent extraction quality.'
  },
  {
    id: 'mistralai/mistral-large',
    label: 'Mistral Large',
    description: 'Mistral · multilingual, strong instruction following.'
  }
];

export const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
