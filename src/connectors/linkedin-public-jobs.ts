import { load } from "cheerio";
import { query } from "linkedin-jobs-api";
import { z } from "zod";

const listing = z.object({
  position: z.string().trim().min(1),
  company: z.string().trim().min(1),
  location: z.string().trim().nullish(),
  jobUrl: z.url(),
});

export function publicLinkedInEnabled() {
  if (process.env.LINKEDIN_PUBLIC_JOBS_LOCAL !== "true") return false;
  const origin = URL.parse(process.env.APP_URL ?? "");
  return origin !== null && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
}

async function publicPage(url: URL, revalidate: number) {
  const response = await fetch(url, {
    headers: { Accept: "text/html" },
    next: { revalidate },
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`LinkedIn public endpoint returned HTTP ${response.status}`);
  return load(await response.text());
}

export async function searchPublicLinkedInJobs(keywords: string, location: string) {
  if (!publicLinkedInEnabled()) throw new Error("Local LinkedIn search is disabled");
  const rows = z.array(z.unknown()).parse(await query({
    keyword: keywords, location, limit: "25",
  }));
  // The package returns an empty array when some upstream requests fail.
  if (!rows.length) throw new Error("LinkedIn package returned no verifiable listings");

  const jobs = new Map<string, { id: string; title: string; company: string; location: string; url: string }>();
  for (const row of rows) {
    const parsed = listing.safeParse(row);
    if (!parsed.success) continue;
    const job = parsed.data;
    const posting = URL.parse(job.jobUrl);
    if (!posting || posting.protocol !== "https:" ||
      (posting.hostname !== "linkedin.com" && !posting.hostname.endsWith(".linkedin.com"))) continue;
    const id = posting.pathname.match(/^\/jobs\/view\/(?:[^/]+-)?(\d{1,20})\/?$/)?.[1];
    if (!id) continue;
    jobs.set(id, { id, title: job.position, company: job.company, location: job.location ?? "",
      url: `https://www.linkedin.com/jobs/view/${id}/` });
  }
  if (!jobs.size) throw new Error("LinkedIn package returned unrecognized listings");
  return [...jobs.values()];
}

export async function publicLinkedInJobDescription(id: string) {
  if (!publicLinkedInEnabled() || !/^\d{1,20}$/.test(id)) return "";
  const $ = await publicPage(new URL(`https://www.linkedin.com/jobs/view/${id}/`), 900);
  return $(".show-more-less-html__markup, .description__text").first().text().trim();
}
