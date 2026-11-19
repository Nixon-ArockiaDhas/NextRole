import { load } from "cheerio";
import { simpleParser } from "mailparser";
import { audit, database } from "./database";

export const MAX_ALERT_BYTES = 1024 * 1024;

interface AlertJob {
  key: string;
  title: string;
  portal: string;
  url: string;
}

function directJob(value: string, label: string): AlertJob | null {
  const url = URL.parse(value);
  if (!url || url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname;
  const path = url.pathname;
  const isHost = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  let portal: string;
  let id: string | null | undefined;
  let canonical: string;

  if (isHost("linkedin.com")) {
    portal = "LinkedIn";
    id = path.match(/^\/jobs\/view\/(?:[^/]+-)?(\d{1,20})\/?$/)?.[1];
    canonical = `https://www.linkedin.com/jobs/view/${id}/`;
  } else if (isHost("indeed.com") || isHost("indeed.co.in") || isHost("indeed.co.uk")) {
    portal = "Indeed";
    id = /^\/(?:viewjob|rc\/clk|pagead\/clk)\/?$/i.test(path) ? url.searchParams.get("jk") : null;
    const posting = new URL("/viewjob", url.origin);
    if (id) posting.searchParams.set("jk", id);
    canonical = posting.href;
  } else if (isHost("naukri.com")) {
    portal = "Naukri";
    id = path.match(/^\/job-listings-[^/]+-(\d{6,})\/?$/i)?.[1];
    canonical = url.origin + path;
  } else if (isHost("glassdoor.com") || isHost("glassdoor.co.in") || isHost("glassdoor.co.uk")) {
    portal = "Glassdoor";
    id = /^\/(?:job-listing\/[^/]+|partner\/jobListing\.htm)\/?$/i.test(path)
      ? url.searchParams.get("jl") || url.searchParams.get("jobListingId") : null;
    const posting = new URL(path, url.origin);
    if (id) posting.searchParams.set(path.startsWith("/partner/") ? "jobListingId" : "jl", id);
    canonical = posting.href;
  } else if (isHost("monster.com") || isHost("foundit.in")) {
    portal = isHost("foundit.in") ? "Foundit" : "Monster Jobs";
    id = path.match(/^\/(?:job-openings|job)\/([^/]+)\/?$/i)?.[1] ??
      path.match(/^\/job-detail\/([^/]+)\/?$/i)?.[1];
    canonical = url.origin + path;
  } else {
    return null;
  }
  if (!id || !/^[\w%-]{1,200}$/.test(id)) return null;

  const cleanLabel = label.replace(/\s+/g, " ").trim().slice(0, 180);
  const meaningfulLabel = cleanLabel && !/^(?:https?:|view\b|apply\b|see\b|click\b|learn\b|show\b|open\b|details$)/i.test(cleanLabel);
  const slug = path.match(/\/([^/]+)\/?$/)?.[1] ?? "";
  const titleFromPath = slug.replace(/^job-listings-/i, "").replace(/(?:-J[VKO]_.*|-\d+|\.htm)$/i, "").replace(/[-_]+/g, " ").trim();
  const title = meaningfulLabel ? cleanLabel : /[a-z]{3}/i.test(titleFromPath) && !/^(?:viewjob|clk|jobListing)$/i.test(titleFromPath)
    ? titleFromPath.slice(0, 180) : `${portal} job listing`;
  return { key: `${portal}:${id.toLowerCase()}`, title, url: canonical, portal };
}

export async function parseJobAlert(input: string | Buffer) {
  const email = typeof input === "string" ? null : await simpleParser(input, { skipHtmlToText: true, skipTextToHtml: true, skipImageLinks: true });
  const text = email?.text || (typeof input === "string" ? input : "");
  const html = email?.html || (typeof input === "string" && /<a\s/i.test(input) ? input : "");
  const jobs = new Map<string, AlertJob>();
  function add(url: string, label = "") {
    const job = directJob(url, label);
    if (job && !jobs.has(job.key) && jobs.size < 100) jobs.set(job.key, job);
  }
  if (html) {
    const $ = load(html);
    $("a[href]").each((_, anchor) => {
      const item = $(anchor);
      add(item.attr("href") ?? "", item.text());
    });
  }
  for (const url of text.matchAll(/https:\/\/[^\s<>"']+/gi)) {
    const preceding = text.slice(Math.max(0, url.index - 300), url.index)
      .trimEnd().split(/\r?\n/).at(-1)?.replace(/\s*[-–:]+\s*$/, "").trim() ?? "";
    const label = preceding.length <= 140 && !/https?:|unsubscribe|job alert|@/i.test(preceding) ? preceding : "";
    add(url[0].replace(/[).,;\]]+$/, ""), label);
  }
  return [...jobs.values()];
}

interface StoredAlertJob extends AlertJob { userId: string; importedAt: Date }

export async function importJobAlert(userId: string, input: string | Buffer) {
  const jobs = await parseJobAlert(input);
  if (!jobs.length) return { found: 0, added: 0 };
  const { client, db } = await database();
  const added = await client.withSession(session => session.withTransaction(async () => {
    const importedAt = new Date();
    const result = await db.collection<StoredAlertJob>("jobAlertListings").bulkWrite(jobs.map(job => ({
      updateOne: { filter: { userId, key: job.key }, update: { $setOnInsert: { ...job, userId, importedAt } }, upsert: true },
    })), { session });
    await audit(userId, "Job alert imported", "job-alert", "USER", session, { added: result.upsertedCount, found: jobs.length });
    return result.upsertedCount;
  }));
  return { found: jobs.length, added };
}

export async function loadAlertRecommendations(userId: string, role: string, technicalSkills: string) {
  const { db } = await database();
  const terms = new Set(role.toLowerCase().match(/[a-z]{2,}/g) ?? []);
  const skills = technicalSkills.split(/[,;|\n]/).map(skill => skill.trim()).filter(skill => skill.length >= 3);
  const rows = await db.collection<StoredAlertJob>("jobAlertListings").find({ userId }).sort({ importedAt: -1 }).limit(500).toArray();
  return rows.map(job => {
    const title = job.title.toLowerCase();
    const matchingSkills = skills.filter(skill => title.includes(skill.toLowerCase()));
    const titleWords = new Set(title.match(/[a-z]{2,}/g) ?? []);
    const score = [...terms].filter(term => titleWords.has(term)).length * 4 + matchingSkills.length;
    return { ...job, id: `alert-${job.key}`, company: "From job alert", location: "Location unspecified",
      description: "", excerpt: "", minimumYears: null, visa: "unknown", salary: null, remote: false,
      matchingSkills, score, imported: true };
  });
}
