/**
 * Consent is no longer required — the extension calls CAMS's own hosted
 * service, not a user-supplied third-party key. No personal code or diffs are
 * ever sent; only the snapshot text the user explicitly saves is transmitted.
 *
 * This stub is kept so call-sites compile without changes. It always returns
 * true and is a no-op for revoke.
 */
export class ConsentManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(_state: any) {}

  hasExtractionConsent(): boolean {
    return true;
  }

  async ensureExtractionConsent(_providerLabel: string): Promise<boolean> {
    return true;
  }

  revoke(): Promise<void> {
    return Promise.resolve();
  }
}
