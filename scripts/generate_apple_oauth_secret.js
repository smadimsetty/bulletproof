#!/usr/bin/env node
// Generates the Apple "Secret Key (for OAuth)" JWT that Supabase's Apple
// auth provider needs (Authentication -> Providers -> Apple -> Secret Key).
// Apple caps this token's lifetime at 6 months, so it needs regenerating
// on that cadence -- rerun this script and paste the new output in.
//
// Usage:
//   node scripts/generate_apple_oauth_secret.js <path-to-AuthKey.p8> <teamId> <keyId> <clientId>
//
// Example:
//   node scripts/generate_apple_oauth_secret.js ~/Downloads/AuthKey_L75S9685NJ.p8 72TFU8QSDR L75S9685NJ com.sohan.bulletproof.signin
//
// The private key file never leaves your machine -- only the printed JWT
// needs to be copied into Supabase's dashboard.

const crypto = require('crypto');
const fs = require('fs');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const [, , keyPath, teamId, keyId, clientId] = process.argv;
if (!keyPath || !teamId || !keyId || !clientId) {
  console.error(
    'Usage: node scripts/generate_apple_oauth_secret.js <path-to-.p8> <teamId> <keyId> <clientId>'
  );
  process.exit(1);
}

const privateKey = fs.readFileSync(keyPath, 'utf8');

const now = Math.floor(Date.now() / 1000);
const sixMonthsInSeconds = 15777000; // Apple's documented maximum
const exp = now + sixMonthsInSeconds;

const header = { alg: 'ES256', kid: keyId };
const payload = {
  iss: teamId,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: clientId,
};

const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

const sign = crypto.createSign('SHA256');
sign.update(signingInput);
sign.end();

// ES256 (JOSE) signatures need raw r||s, not the DER format Node produces
// by default -- dsaEncoding: 'ieee-p1363' gives the raw concatenated form.
const signature = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });

console.log(`${signingInput}.${base64url(signature)}`);
