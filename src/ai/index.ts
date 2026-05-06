import { ContinuitySettings } from '../types';
import { SecretsStore } from '../config/secrets';
import { ContinuityServiceProvider, DEFAULT_SERVICE_URL } from './serviceClient';
import { AIProvider } from './types';

export interface ProviderResolution {
  provider?: AIProvider;
  reason?: string;
}

export async function resolveAIProvider(
  settings: ContinuitySettings,
  secrets: SecretsStore
): Promise<ProviderResolution> {
  if (settings.offlineMode) {
    return { reason: 'Offline mode is enabled.' };
  }

  const licenseKey = await secrets.getLicenseKey();
  const serviceUrl = settings.serviceUrl ?? DEFAULT_SERVICE_URL;
  const deviceId = await secrets.getOrCreateDeviceId();

  return {
    provider: new ContinuityServiceProvider({ serviceUrl, licenseKey, deviceId })
  };
}

export { AIProvider, AIProviderError, SessionNameResult } from './types';
export { parseExtractionResponse } from './parse';
export {
  bundleActivityForEnrichment,
  hasEnrichableContent,
  dedupeAgainstExisting
} from './enrichment';
