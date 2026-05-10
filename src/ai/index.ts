import { CamsSettings } from '../types';
import { SecretsStore } from '../config/secrets';
import { CamsServiceProvider, DEFAULT_SERVICE_URL } from './serviceClient';
import { AIProvider } from './types';

export interface ProviderResolution {
  provider?: AIProvider;
  reason?: string;
}

export async function resolveAIProvider(
  settings: CamsSettings,
  secrets: SecretsStore
): Promise<ProviderResolution> {
  if (settings.offlineMode) {
    return { reason: 'Offline mode is enabled.' };
  }

  const licenseKey = await secrets.getLicenseKey();
  const serviceUrl = (settings.serviceUrl ?? DEFAULT_SERVICE_URL).trim();
  const deviceId = await secrets.getOrCreateDeviceId();

  if (!serviceUrl) {
    return {
      reason:
        'No extraction service URL is set. Deploy the backend (see `backend/README.md`), then set `camsAI.ai.serviceUrl` to your worker URL, or set `DEFAULT_SERVICE_URL` in `src/ai/serviceClient.ts` before packaging.'
    };
  }

  return {
    provider: new CamsServiceProvider({ serviceUrl, licenseKey, deviceId })
  };
}

export { AIProvider, AIProviderError, SessionNameResult } from './types';
export { parseExtractionResponse } from './parse';
export {
  bundleActivityForEnrichment,
  hasEnrichableContent,
  dedupeAgainstExisting
} from './enrichment';
