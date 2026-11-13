// apps/mobile/lib/appleJws.test.ts
//
// The StoreKit 2 signed-transaction verifier used by the verify-subscription Edge Function.
// No @types/node in this project: load Node's crypto and Buffer untyped (tests only).
declare const require: (m: string) => any;
const { createHash, createPrivateKey, sign } = require('crypto');
const { Buffer } = require('buffer');
import { APPLE_ROOT_G3_SHA256, _internal, verifyAppleJws } from '../../../supabase/functions/_shared/appleJws';
import { APPLE_ROOT_G3, FAKE_INT, FAKE_LEAF, FAKE_LEAF_BAD, FAKE_LEAF_BAD_KEY, FAKE_LEAF_KEY, FAKE_ROOT } from './appleJws.fixtures';

const b64url = (b: any) => Buffer.from(b).toString('base64url');
const rootSha = createHash('sha256').update(Buffer.from(FAKE_ROOT, 'base64')).digest('hex');
const SIGNED_AT = Date.UTC(2027, 0, 15); // inside the fixture certs' validity

function makeJws(payload: object, opts: { leaf?: string; key?: string; chain?: string[]; alg?: string } = {}) {
  const header = { alg: opts.alg ?? 'ES256', x5c: opts.chain ?? [opts.leaf ?? FAKE_LEAF, FAKE_INT, FAKE_ROOT] };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = sign('sha256', Buffer.from(input), { key: createPrivateKey(opts.key ?? FAKE_LEAF_KEY), dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64url(sig)}`;
}

const payload = { bundleId: 'com.sohan.bulletproof', productId: 'p', signedDate: SIGNED_AT };

test('accepts a correctly signed transaction and returns its payload', async () => {
  await expect(verifyAppleJws(makeJws(payload), { rootSha256: rootSha })).resolves.toEqual(payload);
});

test('rejects a chain that does not end in the pinned root', async () => {
  await expect(verifyAppleJws(makeJws(payload))).rejects.toThrow(/root/i);
});

test('rejects a tampered payload', async () => {
  const [h, , s] = makeJws(payload).split('.');
  const forged = `${h}.${b64url(JSON.stringify({ ...payload, productId: 'free-stuff' }))}.${s}`;
  await expect(verifyAppleJws(forged, { rootSha256: rootSha })).rejects.toThrow(/signature/i);
});

test('rejects a leaf without Apple\'s receipt-signing marker', async () => {
  const jws = makeJws(payload, { leaf: FAKE_LEAF_BAD, key: FAKE_LEAF_BAD_KEY });
  await expect(verifyAppleJws(jws, { rootSha256: rootSha })).rejects.toThrow(/marker/i);
});

test('rejects a leaf that the intermediate did not sign', async () => {
  // Root in the intermediate's slot: the leaf's signature does not verify against it.
  const jws = makeJws(payload, { chain: [FAKE_LEAF, FAKE_ROOT, FAKE_ROOT] });
  await expect(verifyAppleJws(jws, { rootSha256: rootSha })).rejects.toThrow();
});

test('rejects anything but ES256 and a malformed token', async () => {
  await expect(verifyAppleJws(makeJws(payload, { alg: 'none' }), { rootSha256: rootSha })).rejects.toThrow(/ES256/);
  await expect(verifyAppleJws('not.a.jws.at.all', { rootSha256: rootSha })).rejects.toThrow();
});

test('rejects a transaction signed outside the certificates\' validity', async () => {
  const jws = makeJws({ ...payload, signedDate: Date.UTC(2020, 0, 1) });
  await expect(verifyAppleJws(jws, { rootSha256: rootSha })).rejects.toThrow(/valid/i);
});

test("parses Apple's real root certificate and verifies its self-signature", async () => {
  const der = new Uint8Array(Buffer.from(APPLE_ROOT_G3, 'base64'));
  expect(createHash('sha256').update(der).digest('hex')).toBe(APPLE_ROOT_G3_SHA256);
  const c = _internal.parseCert(der);
  expect(c.notAfter).toBeGreaterThan(Date.UTC(2039, 0, 1));
  await expect(_internal.checkSignedBy(globalThis.crypto.subtle, c, c)).resolves.toBeUndefined();
});
