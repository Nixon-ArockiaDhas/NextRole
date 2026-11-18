import { z } from "zod";

const defaultBoards = "airbnb:Airbnb,gitlab:GitLab,figma:Figma,datadog:Datadog,cloudflare:Cloudflare,rubrik:Rubrik,okta:Okta,twilio:Twilio,stripe:Stripe,coinbase:Coinbase";
const jobSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  location: z.object({ name: z.string() }),
  content: z.string().nullish(),
  absolute_url: z.url({ protocol: /^https$/ }),
});
const feedSchema = z.object({ jobs: z.array(z.unknown()) });
const stopWords = new Set(["senior", "junior", "lead", "staff", "principal", "and", "the", "of", "with"]);

function words(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export function postingDetails(content: string) {
  const description = content.replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/\s+/g, " ");
  const experience = [...description.matchAll(/\b(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\+?\s+years?\s+(?:of\s+)?(?:[\w-]+\s+){0,4}experience\b/gi)]
    .map(match => Number(match[1]));
  const deniesVisa = /(?:cannot|can not|does not|do not|unable to|will not)\s+(?:offer |provide |support )?(?:visa )?sponsor|(?:no|without)\s+(?:employment |work )?visa sponsorship|visa sponsorship is not (?:available|offered|provided)/i.test(description);
  const offersVisa = /(?:we (?:offer|provide)|eligible for) (?:employment |work )?visa sponsorship|visa sponsorship (?:is available|is provided|available)/i.test(description);
  const annual = description.match(/\b(USD|INR|GBP|EUR|CAD|AUD)\s*([\d,]+)(?:\s*[-–]\s*(?:\1\s*)?([\d,]+))?\s*(?:per year|annually|\/year)\b/i);
  return {
    description,
    remote: /\b(?:fully remote|remote (?:role|position|opportunity)|(?:role|position) is remote|work from anywhere)\b/i.test(description),
    minimumYears: experience.length ? Math.max(...experience) : null,
    visa: deniesVisa ? "unavailable" : offersVisa ? "available" : "unknown",
    salary: annual ? { currency: annual[1].toUpperCase(), minimum: Number(annual[2].replaceAll(",", "")), maximum: Number((annual[3] ?? annual[2]).replaceAll(",", "")) } : null,
  };
}

export async function searchEmployerJobs(role: string, technicalSkills: string) {
  const boards = [...new Map((process.env.GREENHOUSE_JOB_BOARDS || defaultBoards).split(",")
    .flatMap(entry => {
      const [token, company] = entry.split(":").map(part => part.trim());
      return /^[a-z0-9_-]+$/.test(token) && company ? [[token, company] as const] : [];
    })).entries()];
  const terms = [...new Set(words(role))].filter(word => !stopWords.has(word));
  const skills = [...new Set(technicalSkills.split(/[,;|\n]/).map(skill => skill.trim()))]
    .filter(skill => skill.length >= 2 && skill.length <= 60).slice(0, 40);
  const feeds = await Promise.allSettled(boards.map(async ([board, company]) => {
    const endpoint = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs`;
    async function load(url: string) {
      const response = await fetch(url, {
        next: { revalidate: 900 }, signal: AbortSignal.timeout(7000), redirect: "error",
      });
      if (!response.ok) throw new Error("Employer feed unavailable");
      return feedSchema.parse(await response.json()).jobs;
    }
    const listings = await load(`${endpoint}?content=true`).catch(() => load(endpoint));
    return listings.flatMap(raw => {
      const parsed = jobSchema.safeParse(raw);
      if (!parsed.success) return [];
      const job = parsed.data;
      const title = words(job.title);
      const roleMatches = terms.filter(term => title.includes(term) || title.includes(`${term}er`));
      if (!roleMatches.length && !skills.length) return [];
      const { description, minimumYears, visa, salary, remote } = postingDetails(job.content ?? "");
      const normalized = ` ${words(description).join(" ")} `;
      const matchingSkills = skills.filter(skill => {
        const phrase = words(skill).join(" ");
        return phrase.length >= 2 && normalized.includes(` ${phrase} `);
      });
      if (!roleMatches.length && matchingSkills.length < 2) return [];
      return [{ id: `${board}-${job.id}`, title: job.title, company, location: job.location.name, url: job.absolute_url,
        description: description.trim().slice(0, 18000), excerpt: description.trim().slice(0, 190), score: roleMatches.length * 4 + Math.min(matchingSkills.length, 8), matchingSkills, minimumYears, visa, salary, remote }];
    });
  }));
  return {
    jobs: feeds.flatMap(feed => feed.status === "fulfilled" ? feed.value : []).sort((a, b) => b.score - a.score),
    unavailable: feeds.filter(feed => feed.status === "rejected").length,
    totalBoards: boards.length,
    boards: boards.map(([, company], index) => {
      const feed = feeds[index];
      return { company, matches: feed.status === "fulfilled" ? feed.value.length : null };
    }),
  };
}
