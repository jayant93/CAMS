import * as vscode from 'vscode';
import * as crypto from 'crypto';

const KEY_LICENSE = 'continuity.licenseKey';
const KEY_DEVICE_ID = 'continuity.deviceId';

export class SecretsStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  getLicenseKey(): Thenable<string | undefined> {
    return this.secrets.get(KEY_LICENSE);
  }

  setLicenseKey(value: string): Thenable<void> {
    return this.secrets.store(KEY_LICENSE, value);
  }

  clearLicenseKey(): Thenable<void> {
    return this.secrets.delete(KEY_LICENSE);
  }

  /**
   * Returns a stable anonymous device ID used for per-device rate limiting on
   * the free tier. Generated once and stored in SecretStorage — never tied to
   * any personal identity.
   */
  async getOrCreateDeviceId(): Promise<string> {
    const existing = await this.secrets.get(KEY_DEVICE_ID);
    if (existing) return existing;
    const id = crypto.randomUUID();
    await this.secrets.store(KEY_DEVICE_ID, id);
    return id;
  }
}
