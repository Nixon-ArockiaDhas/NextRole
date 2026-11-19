import { z } from "zod";
import { publicLinkedInEnabled, searchPublicLinkedInJobs } from "./linkedin-public-jobs";
import { postingDetails } from "./greenhouse-jobs";

const employers = [["Freshworks", "Freshworks"], ["BoschGroup", "Bosch"], ["Sutherland", "Sutherland"]] as const;
const portals = {
  linkedin: "LinkedIn",
  naukri: "Naukri",
  indeed: "Indeed",
  glassdoor: "Glassdoor",
  monster: "Monster Jobs",
};
const posting = z.object({
  id: z.string().regex(/^\d+$/),
  name: z.string(),
  location: z.object({ city: z.string().nullish(), region: z.string().nullish(), country: z.string().nullish(), remote: z.boolean().optional() }),
});
const publicFeed = z.object({ content: z.array(posting) });
const portalFeed = z.object({ jobs: z.array(z.object({
  id: z.string().min(1).max(200), title: z.string(), location: z.string(), company: z.string(),
  url: z.url({ protocol: /^https$/ }), description: z.string().optional(),
})).max(500) });

function normalize(portal: string, job: z.infer<typeof portalFeed>["jobs"][number]) {
  const details = postingDetails(job.description?.slice(0, 30000) ?? "");
  return { ...job, ...details, id: `${portal}-${job.id}`, portal, excerpt: details.description.slice(0, 190),
    matchingSkills: [] as string[], score: 0 };
}

async function employerJobs(board: string, company: string, role: string, location: string) {
  const url = new URL(`https://api.smartrecruiters.com/v1/companies/${board}/postings`);
  url.searchParams.set("destination", "PUBLIC");
  url.searchParams.set("limit", "100");
  if (location && !location.includes(",") && !/^(india|united states|united kingdom|canada|germany|australia)$/i.test(location)) {
    url.searchParams.set("city", location);
  }
  const response = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(7000), redirect: "error" });
  if (!response.ok) throw new Error("Employer source unavailable");
  const terms = new Set(role.toLowerCase().match(/[a-z]{2,}/g)?.filter(word => !["senior","junior","lead","staff","principal","and","with","the"].includes(word)) ?? []);
  const matches = publicFeed.parse(await response.json()).content.map(job => ({
    job, score: [...new Set(job.name.toLowerCase().match(/[a-z]{2,}/g) ?? [])].filter(word => terms.has(word)).length,
  })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
  return matches.map(({ job, score }) => ({
    ...normalize("SmartRecruiters", { id: `${board}-${job.id}`, title: job.name, company,
      location: [job.location.city, job.location.region, job.location.country === "in" ? "India" : job.location.country,
        job.location.remote ? "Remote" : ""].filter(Boolean).join(", "),
      url: `https://jobs.smartrecruiters.com/${board}/${job.id}` }),
    score: score * 4,
  }));
}

export async function searchAdditionalSources(role: string, location: string) {
  const [boards, portalResults] = await Promise.all([
    Promise.all(employers.map(async ([board, company]) => {
      try {
        const jobs = await employerJobs(board, company, role, location);
        return { company, matches: jobs.length, jobs };
      } catch {
        return { company, matches: null, jobs: [] };
      }
    })),
    Promise.all(Object.entries(portals).map(async ([portal, name]) => {
      const prefix = `${portal.toUpperCase()}_JOBS_FEED`;
      const endpoint = process.env[`${prefix}_URL`]?.trim();
      if (!endpoint && portal === "linkedin" && publicLinkedInEnabled()) {
        try {
          const jobs = (await searchPublicLinkedInJobs(role.slice(0, 150), location)).map(job => normalize(name, job));
          return { portal, configured: true, status: `${jobs.length} public listings before filters`, jobs };
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          const status = message.includes("no verifiable listings") ? "No listings returned or public access unavailable" :
            /HTTP (429|403)/.test(message) ? "LinkedIn limited public access" : "Public LinkedIn search unavailable";
          return { portal, configured: true, status, jobs: [] };
        }
      }
      if (!endpoint) return { portal, configured: false, status: "Search setup required", jobs: [] };
      try {
        const url = new URL(endpoint);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error("HTTPS feed required");
        url.searchParams.set("keywords", role.slice(0, 150));
        if (location) url.searchParams.set("location", location);
        const token = process.env[`${prefix}_TOKEN`]?.trim();
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000), redirect: "error",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined });
        if (!response.ok) throw new Error("Portal feed unavailable");
        const jobs = [...new Map(portalFeed.parse(await response.json()).jobs.map(job => [job.id, job])).values()]
          .map(job => normalize(name, job));
        return { portal, configured: true, status: `${jobs.length} matches before filters`, jobs };
      } catch {
        return { portal, configured: true, status: "Search temporarily unavailable", jobs: [] };
      }
    })),
  ]);
  return { boards, portalResults, jobs: [...boards.flatMap(board => board.jobs), ...portalResults.flatMap(portal => portal.jobs)] };
}
