// supabase/functions/_shared/apple.ts
//
// Sign in with Apple server calls (token exchange + revocation). App Store
// guideline 5.1.1(v) requires revoking the user's Apple tokens when they
// delete their account. Needs four function secrets; when any is missing,
// `appleConfig()` returns null and callers skip quietly, so the app still
// works before Sohan adds the Sign in with Apple key.
import { importPKCS8, SignJWT } from "npm:jose@5";

export interface AppleConfig {
  teamId: string;
  keyId: string;
  privateKey: string;
  clientId: string;
}

export function appleConfig(): AppleConfig | null {
  const teamId = Deno.env.get("APPLE_TEAM_ID");
  const keyId = Deno.env.get("APPLE_KEY_ID");
  // Secrets often arrive with literal "\n" instead of newlines.
  const privateKey = Deno.env.get("APPLE_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  const clientId = Deno.env.get("APPLE_CLIENT_ID");
  if (!teamId || !keyId || !privateKey || !clientId) return null;
  return { teamId, keyId, privateKey, clientId };
}

/** ES256 client secret JWT, valid 5 minutes. */
async function clientSecret(c: AppleConfig): Promise<string> {
  const key = await importPKCS8(c.privateKey, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: c.keyId })
    .setIssuer(c.teamId)
    .setSubject(c.clientId)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(key);
}

/** Exchanges a one-time authorization code for a refresh token. */
export async function exchangeAuthorizationCode(c: AppleConfig, code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: await clientSecret(c),
    code,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.refresh_token) {
    throw new Error(`Apple token exchange failed (${res.status}): ${data.error ?? "no refresh_token"}`);
  }
  return data.refresh_token as string;
}

export async function revokeRefreshToken(c: AppleConfig, refreshToken: string): Promise<void> {
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: await clientSecret(c),
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
  const res = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Apple revoke failed (${res.status})`);
}
