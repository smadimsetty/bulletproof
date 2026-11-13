// supabase/functions/_shared/appleJws.ts
//
// Verifies a StoreKit 2 signed transaction (a compact JWS whose header carries the x5c
// certificate chain) without any library, the way Apple's own server library does:
//  1. the chain's last certificate must be Apple Root CA - G3 (pinned by SHA-256),
//  2. each certificate must be signed by the next one,
//  3. the intermediate and leaf must carry Apple's marker OIDs (so another Apple-issued
//     certificate, e.g. for Apple Pay, can't be used to sign fake transactions),
//  4. every certificate must be valid at the transaction's signedDate,
//  5. the JWS signature must verify with the leaf's key (ES256).
// Only WebCrypto, atob and TextEncoder are used, so this runs the same in Deno (the Edge
// Function) and Node (the jest tests). Supabase's runtime does not implement
// node:crypto's X509Certificate.verify, which is why certificates are parsed by hand.

export const APPLE_ROOT_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

// DER-encoded OID values (the bytes after the 06 tag and length).
const OID = {
  ecdsaSha256: '2a8648ce3d040302',
  ecdsaSha384: '2a8648ce3d040303',
  p256: '2a8648ce3d030107',
  p384: '2b81040022',
  appleIntermediate: '2a864886f76364060201', // 1.2.840.113635.100.6.2.1
  appleReceiptSigning: '2a864886f76364060b01', // 1.2.840.113635.100.6.11.1
};

type Bytes = Uint8Array;

interface Tlv {
  tag: number;
  start: number; // first byte of the TLV
  valueStart: number;
  end: number; // one past the last byte
}

function readTlv(buf: Bytes, off: number): Tlv {
  const tag = buf[off];
  let len = buf[off + 1];
  let valueStart = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('Bad certificate: unsupported length');
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[off + 2 + i];
    valueStart += n;
  }
  const end = valueStart + len;
  if (end > buf.length) throw new Error('Bad certificate: truncated');
  return { tag, start: off, valueStart, end };
}

function children(buf: Bytes, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let off = parent.valueStart; off < parent.end; ) {
    const t = readTlv(buf, off);
    out.push(t);
    off = t.end;
  }
  return out;
}

const hex = (b: Bytes) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const value = (buf: Bytes, t: Tlv) => buf.subarray(t.valueStart, t.end);
const whole = (buf: Bytes, t: Tlv) => buf.subarray(t.start, t.end);

function parseTime(buf: Bytes, t: Tlv): number {
  const s = new TextDecoder().decode(value(buf, t));
  const full = t.tag === 0x17 ? (Number(s.slice(0, 2)) >= 50 ? '19' : '20') + s : s; // UTCTime has a 2-digit year
  const m = full.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) throw new Error('Bad certificate: unreadable validity');
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

interface Cert {
  der: Bytes;
  tbs: Bytes;
  sigAlg: string;
  signature: Bytes; // DER-encoded ECDSA signature
  spki: Bytes;
  curve: string;
  notBefore: number;
  notAfter: number;
  tbsHex: string;
}

function parseCert(der: Bytes): Cert {
  const root = readTlv(der, 0);
  const [tbsT, algT, sigT] = children(der, root);
  if (!tbsT || !algT || !sigT || sigT.tag !== 0x03) throw new Error('Bad certificate: structure');
  const tbsKids = children(der, tbsT);
  const i = tbsKids[0].tag === 0xa0 ? 1 : 0; // skip the explicit [0] version
  const validity = children(der, tbsKids[i + 3]);
  const spkiT = tbsKids[i + 5];
  const spkiAlg = children(der, children(der, spkiT)[0]);
  return {
    der,
    tbs: whole(der, tbsT),
    sigAlg: hex(value(der, children(der, algT)[0])),
    signature: value(der, sigT).subarray(1), // drop the BIT STRING's unused-bits byte
    spki: whole(der, spkiT),
    curve: hex(value(der, spkiAlg[1])),
    notBefore: parseTime(der, validity[0]),
    notAfter: parseTime(der, validity[1]),
    tbsHex: hex(whole(der, tbsT)),
  };
}

/** ECDSA signatures in certificates are DER SEQUENCE{r, s}; WebCrypto wants r||s, each padded to the curve size. */
function derSigToRaw(sig: Bytes, size: number): Bytes {
  const seq = readTlv(sig, 0);
  const [r, s] = children(sig, seq);
  const out = new Uint8Array(size * 2);
  for (const [k, t] of [[0, r], [1, s]] as const) {
    let v = value(sig, t);
    while (v.length > size && v[0] === 0) v = v.subarray(1);
    if (v.length > size) throw new Error('Bad certificate: signature size');
    out.set(v, k * size + (size - v.length));
  }
  return out;
}

const CURVES: Record<string, { name: string; size: number }> = {
  [OID.p256]: { name: 'P-256', size: 32 },
  [OID.p384]: { name: 'P-384', size: 48 },
};
const HASHES: Record<string, string> = { [OID.ecdsaSha256]: 'SHA-256', [OID.ecdsaSha384]: 'SHA-384' };

async function importKey(subtle: SubtleCrypto, cert: Cert): Promise<{ key: CryptoKey; size: number }> {
  const curve = CURVES[cert.curve];
  if (!curve) throw new Error('Bad certificate: unsupported key');
  const key = await subtle.importKey('spki', cert.spki as BufferSource, { name: 'ECDSA', namedCurve: curve.name }, false, ['verify']);
  return { key, size: curve.size };
}

async function checkSignedBy(subtle: SubtleCrypto, child: Cert, issuer: Cert): Promise<void> {
  const hash = HASHES[child.sigAlg];
  if (!hash) throw new Error('Bad certificate: unsupported signature algorithm');
  const { key, size } = await importKey(subtle, issuer);
  const ok = await subtle.verify({ name: 'ECDSA', hash }, key, derSigToRaw(child.signature, size) as BufferSource, child.tbs as BufferSource);
  if (!ok) throw new Error('Certificate chain does not verify');
}

function b64ToBytes(s: string): Bytes {
  const std = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export interface VerifyOptions {
  /** Hex SHA-256 of the root certificate to trust. Tests pass their own; production uses Apple's. */
  rootSha256?: string;
  subtle?: SubtleCrypto;
}

export async function verifyAppleJws(jws: string, opts: VerifyOptions = {}): Promise<Record<string, any>> {
  const subtle = opts.subtle ?? globalThis.crypto.subtle;
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Malformed signed transaction');
  const header = JSON.parse(new TextDecoder().decode(b64ToBytes(parts[0])));
  if (header.alg !== 'ES256') throw new Error('Signed transaction must use ES256');
  if (!Array.isArray(header.x5c) || header.x5c.length !== 3) throw new Error('Signed transaction needs a 3-certificate chain');
  const payload = JSON.parse(new TextDecoder().decode(b64ToBytes(parts[1])));

  const [leaf, inter, root] = (header.x5c as string[]).map((c) => parseCert(b64ToBytes(c)));
  const rootSha = hex(new Uint8Array(await subtle.digest('SHA-256', root.der as BufferSource)));
  if (rootSha !== (opts.rootSha256 ?? APPLE_ROOT_G3_SHA256)) throw new Error('Untrusted root certificate');

  await checkSignedBy(subtle, leaf, inter);
  await checkSignedBy(subtle, inter, root);
  if (!inter.tbsHex.includes(`06${(OID.appleIntermediate.length / 2).toString(16).padStart(2, '0')}${OID.appleIntermediate}`)) {
    throw new Error('Intermediate certificate lacks the Apple marker');
  }
  if (!leaf.tbsHex.includes(`06${(OID.appleReceiptSigning.length / 2).toString(16).padStart(2, '0')}${OID.appleReceiptSigning}`)) {
    throw new Error('Signing certificate lacks the Apple marker');
  }

  const at = typeof payload.signedDate === 'number' ? payload.signedDate : Date.now();
  for (const c of [leaf, inter, root]) {
    if (at < c.notBefore || at > c.notAfter) throw new Error('Certificate not valid at the signing date');
  }

  const { key } = await importKey(subtle, leaf);
  const ok = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    b64ToBytes(parts[2]) as BufferSource,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`) as BufferSource,
  );
  if (!ok) throw new Error('Signed transaction signature does not verify');
  return payload;
}

/** Exposed for tests only. */
export const _internal = { parseCert, checkSignedBy };
