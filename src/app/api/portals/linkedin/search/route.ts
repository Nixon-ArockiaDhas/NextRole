import { NextRequest, NextResponse } from "next/server";
import { LinkedInSearchError, linkedInSearchConfigured, linkedInSearchQuery, searchLinkedInJobs } from "../../../../../connectors/linkedin-search";
import { currentAccount, limit } from "../../../../../services/accounts";

function json(data: object, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const origin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
  if (request.headers.get("origin") !== origin) return json({ error: "Request origin is not allowed." }, 403);

  try {
    const account = await currentAccount();
    if (!account) return json({ error: "Sign in to search LinkedIn jobs." }, 401);
    if (!linkedInSearchConfigured()) return json({ error: "LinkedIn job search needs deployment setup." }, 503);

    const size = Number(request.headers.get("content-length"));
    if (!Number.isFinite(size) || size <= 0 || size > 4096) return json({ error: "Invalid search request." }, 400);
    const query = linkedInSearchQuery.safeParse(await request.json().catch(() => null));
    if (!query.success) return json({ error: "Enter a job title or keyword and an optional location." }, 400);
    if (!(await limit(`linkedin-search:${account._id}`, 12)) || !(await limit("linkedin-search:deployment", 100))) {
      return json({ error: "Search limit reached. Try again in 15 minutes." }, 429);
    }

    return json({ jobs: await searchLinkedInJobs(query.data) });
  } catch (error) {
    if (error instanceof LinkedInSearchError) return json({ error: error.message }, error.status);
    console.error("LinkedIn search failed", { type: error instanceof Error ? error.name : "unknown" });
    return json({ error: "LinkedIn search is temporarily unavailable." }, 502);
  }
}
