import { load } from "cheerio";
import { postingDetails } from "./greenhouse-jobs";

const boards = [
  ["spotify", "Spotify"], ["bounteous", "Bounteous"],
  ["jumpcloud", "JumpCloud"], ["crypto", "Crypto.com"],
] as const;

function terms(text: string) {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

async function publicHtml(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6500), redirect: "error", next: { revalidate: 900 } });
  if (!response.ok) throw new Error("Lever board unavailable");
  return load(await response.text());
}

export async function searchLeverJobs(role: string, technicalSkills: string) {
  const keywords = terms(role);
  for (const word of ["senior", "junior", "lead", "staff", "principal", "and", "the", "with"]) keywords.delete(word);
  const skills = technicalSkills.split(/[,;|\n]/).map(skill => skill.trim()).filter(skill => skill.length >= 3).slice(0, 40);
  const feeds = await Promise.allSettled(boards.map(async ([board, company]) => {
    const $ = await publicHtml(`https://jobs.lever.co/${board}`);
    const jobs = new Map<string, {
      id: string; title: string; company: string; location: string; url: string; portal: string;
      description: string; excerpt: string; remote: boolean; score: number; matchingSkills: string[];
      minimumYears: null; visa: string; salary: null;
    }>();
    $(".posting").each((_, element) => {
      const posting = $(element);
      const link = posting.find("a.posting-title").first();
      const url = URL.parse(link.attr("href") ?? "", "https://jobs.lever.co");
      if (!url || url.origin !== "https://jobs.lever.co") return;
      const [site, id, extra] = url.pathname.slice(1).split("/");
      if (site !== board || !id || !/^[a-f0-9-]{36}$/i.test(id) || extra) return;
      const title = link.find("h5").text().trim() || link.text().trim();
      const titleWords = terms(title);
      const roleMatches = [...keywords].filter(word => titleWords.has(word) || titleWords.has(`${word}er`));
      const matchingSkills = skills.filter(skill => ` ${[...titleWords].join(" ")} `.includes(` ${[...terms(skill)].join(" ")} `));
      if (!roleMatches.length && !matchingSkills.length) return;
      const locations = posting.find(".posting-categories .location").map((_, location) => $(location).text().trim()).get();
      const workplace = posting.find(".posting-categories .workplaceTypes").text().trim();
      jobs.set(id, { id: `lever-${id}`, title, company, location: [...new Set([...locations, workplace].filter(Boolean))].join(" · "),
        url: `https://jobs.lever.co/${board}/${id}`, portal: "Lever", description: "", excerpt: "",
        remote: /^remote$/i.test(workplace), score: roleMatches.length * 4 + matchingSkills.length,
        matchingSkills, minimumYears: null, visa: "unknown", salary: null });
    });
    return [...jobs.values()];
  }));
  return {
    jobs: feeds.flatMap(feed => feed.status === "fulfilled" ? feed.value : []),
    boards: boards.map(([, company], index) => {
      const feed = feeds[index];
      return { company, matches: feed.status === "fulfilled" ? feed.value.length : null };
    }),
  };
}

export async function leverJobDescription(value: string) {
  const url = URL.parse(value);
  if (!url || url.origin !== "https://jobs.lever.co" || url.username || url.password) return "";
  const match = url.pathname.match(/^\/([a-z0-9-]+)\/([a-f0-9-]{36})\/?$/i);
  if (!match || !boards.some(([board]) => board === match[1])) return "";
  const $ = await publicHtml(`https://jobs.lever.co/${match[1]}/${match[2]}`);
  const content = $(".posting-page [data-qa='job-description'], .posting-page [data-qa='posting-requirements'], .posting-page [data-qa='closing-description']");
  content.find("script, style").remove();
  const html = content.map((_, section) => $(section).html() ?? "").get().join(" ");
  return postingDetails(html).description.trim();
}
