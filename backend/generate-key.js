// Helper script to generate a CAMS Pro license key.
// Usage: node generate-key.js <deviceId> <licenseSecret>

const crypto = require('crypto');

function generateLicenseKey(deviceId, secret) {
  const hmac = crypto.createHmac('sha256', secret).update(deviceId).digest('hex');
  return Buffer.from(`${deviceId}:${hmac}`).toString('base64url');
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Error: Please provide both deviceId and licenseSecret.');
  console.log('Usage: node generate-key.js <deviceId> <licenseSecret>');
  console.log('Example: node generate-key.js "some-device-uuid-123" "my-super-secret-password"');
  process.exit(1);
}

const deviceId = args[0];
const secret = args[1];

const key = generateLicenseKey(deviceId, secret);
console.log('\n======================================');
console.log('  GENERATED PRO LICENSE KEY');
console.log('======================================');
console.log(key);
console.log('======================================\n');
