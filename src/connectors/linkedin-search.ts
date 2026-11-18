import { searchLinkedInMcp } from "./linkedin-mcp";
import { z } from "zod";

const tokenResponse = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() });
const searchResponse = z.object({ elements: z.array(z.unknown()) });
const posting = z.object({
  id: z.union([z.string(), z.number().int().safe()]).transform(String).pipe(z.string().regex(/^\d{1,20}$/)),
  title: z.string().trim().min(1).max(150),
  companyName: z.string().trim().min(1).max(120).optional(),
  company: z.object({ name: z.string().trim().min(1).max(120) }).optional(),
  location: z.string().trim().max(150).optional(),
});

export const linkedInSearchQuery = z.object({
  keywords: z.string().trim().min(1).max(100),
  location: z.string().trim().max(100).optional(),
});

export interface LinkedInSearchResult {
  id: string;
  title: string;
  company?: string;
  location?: string;
}

export class LinkedInSearchError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function credentials() {
  const clientId = process.env.LINKEDIN_SEARCH_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_SEARCH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function linkedInSearchConfigured() {
  return Boolean(process.env.LINKEDIN_MCP_URL?.trim() || credentials());
}

type AccessToken = { value: string; expiresAt: number };
let cachedToken: AccessToken | undefined;
let refreshing: Promise<AccessToken> | undefined;

async function accessToken(config: NonNullable<ReturnType<typeof credentials>>) {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken;
  refreshing ??= (async () => {
    const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({
        grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret,
      }),
    });
    if (response.status === 429) throw new LinkedInSearchError(429, "LinkedIn is rate limiting searches. Try again later.");
    if (!response.ok) throw new LinkedInSearchError(503, "LinkedIn did not authorize the configured search app.");
    const token = tokenResponse.parse(await response.json());
    cachedToken = { value: token.access_token, expiresAt: Date.now() + Math.max(0, token.expires_in - 30) * 1000 };
    return cachedToken;
  })().finally(() => { refreshing = undefined; });
  return refreshing;
}

export async function searchLinkedInJobs(query: z.infer<typeof linkedInSearchQuery>): Promise<LinkedInSearchResult[]> {
  if (process.env.LINKEDIN_MCP_URL?.trim()) {
    const result = searchResponse.parse(await searchLinkedInMcp(query));
    return result.elements.slice(0, 50).map(item => {
      const job = posting.parse(item);
      return { id: job.id, title: job.title, company: job.companyName || job.company?.name, location: job.location };
    });
  }
  const config = credentials();
  if (!config) throw new LinkedInSearchError(503, "LinkedIn job search has not been configured for this workspace.");
  const token = await accessToken(config);
  const url = new URL("https://api.linkedin.com/v2/jobs/search");
  url.searchParams.set("keywords", query.keywords);
  if (query.location) url.searchParams.set("location", query.location);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token.value}`, Accept: "application/json" },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 && cachedToken === token) cachedToken = undefined;
  if ([401, 403, 404].includes(response.status)) {
    throw new LinkedInSearchError(503, "The configured LinkedIn app could not access the job search endpoint.");
  }
  if (response.status === 429) throw new LinkedInSearchError(429, "LinkedIn is rate limiting searches. Try again later.");
  if (!response.ok) throw new LinkedInSearchError(502, "LinkedIn job search is temporarily unavailable.");
  const { elements } = searchResponse.parse(await response.json());
  const jobs = new Map<string, LinkedInSearchResult>();
  for (const item of elements.slice(0, 50)) {
    const job = posting.safeParse(item);
    if (!job.success) continue;
    const { id, title, companyName, company, location } = job.data;
    jobs.set(id, { id, title, company: companyName || company?.name, location });
  }
  if (elements.length && !jobs.size) throw new LinkedInSearchError(502, "LinkedIn returned an unsupported job result format.");
  return [...jobs.values()];
}
