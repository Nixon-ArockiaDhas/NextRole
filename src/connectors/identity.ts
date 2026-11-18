import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const providers = {
  linkedin: {
    clientId: () => process.env.LINKEDIN_CLIENT_ID,
    secret: () => process.env.LINKEDIN_CLIENT_SECRET,
    authorize: "https://www.linkedin.com/oauth/v2/authorization",
    token: "https://www.linkedin.com/oauth/v2/accessToken",
    userinfo: "https://api.linkedin.com/v2/userinfo",
    issuer: "https://www.linkedin.com",
    scope: "openid",
    pkce: false,
  },
  indeed: {
    clientId: () => process.env.INDEED_CLIENT_ID,
    secret: () => process.env.INDEED_CLIENT_SECRET,
    authorize: "https://secure.indeed.com/oauth/v2/authorize",
    token: "https://apis.indeed.com/oauth/v2/tokens",
    userinfo: "https://secure.indeed.com/v2/api/userinfo",
    issuer: "https://secure.indeed.com",
    scope: "email",
    pkce: true,
  },
} as const;

export function identityProvider(portal: string) {
  if (!Object.hasOwn(providers, portal)) return undefined;
  const provider = providers[portal as keyof typeof providers];
  const clientId = provider.clientId()?.trim();
  const secret = provider.secret()?.trim();
  return { ...provider, credentials: clientId && secret ? { clientId, secret } : null };
}

type Provider = NonNullable<ReturnType<typeof identityProvider>>;

export function startAuthorization(provider: Provider, callback: string, state: string) {
  if (!provider.credentials) throw new Error("Portal credentials unavailable");
  const url = new URL(provider.authorize);
  url.search = new URLSearchParams({
    client_id: provider.credentials.clientId, redirect_uri: callback, response_type: "code",
    scope: provider.scope, state,
  }).toString();
  const verifier = provider.pkce ? randomBytes(32).toString("base64url") : undefined;
  if (verifier) {
    url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
  }
  return { url, verifier };
}

export async function resolveIdentity(provider: Provider, callback: string, code: string, verifier?: string) {
  if (!provider.credentials) throw new Error("Portal credentials unavailable");
  const token = await fetch(provider.token, {
    method: "POST", redirect: "error", cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", client_id: provider.credentials.clientId,
      client_secret: provider.credentials.secret, redirect_uri: callback, code,
      ...(verifier ? { code_verifier: verifier } : {}),
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!token.ok) throw new Error("Portal authorization failed");
  const { access_token } = z.object({ access_token: z.string().min(1) }).parse(await token.json());
  const user = await fetch(provider.userinfo, {
    redirect: "error", cache: "no-store",
    headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!user.ok) throw new Error("Portal identity unavailable");
  return z.object({ sub: z.string().min(1).max(512) }).parse(await user.json()).sub;
}
