import { searchAdditionalSources } from "../connectors/additional-job-sources";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { analyzeJobMatch } from "@/app/actions/job-match";
import { JobMatch } from "@/components/job-match";
import Link from "next/link";
import { BriefcaseBusiness, Search, MapPin, ArrowUpRight, Building2, Linkedin } from "lucide-react";
import { searchEmployerJobs } from "../connectors/greenhouse-jobs";
import type { Profile } from "../services/resumes";
import { linkedInSearchConfigured, searchLinkedInJobs } from "../connectors/linkedin-search";
import { connectors } from "../connectors/registry";
import { limit } from "../services/accounts";
import { Heading } from "./workspace";

type Query = Record<string, string | string[] | undefined>;
const currencies = ["INR", "USD", "EUR", "GBP", "CAD", "AUD"];

export async function RecommendedJobs({ resume, query, userId }: { resume?: Profile; query: Query; userId: string }) {
  const resumeRole = resume?.title || "";
  const searchText = typeof query.role === "string" ? query.role.trim().slice(0, 150) : "";
  const role = searchText || resumeRole;
  const skills = resume?.technicalSkills || "";
  if (!resumeRole && !skills) return <>
    <Heading title="Recommended Jobs" detail="Find jobs matched to your resume." />
    <section className="panel form-panel">
      <p>Upload a readable resume with a job title or skills to get recommendations.</p>
      <Link className="button" href="/resumes">Open Resume Studio</Link>
    </section>
  </>;

  const location = typeof query.place === "string" ? query.place.trim().slice(0, 100) : "";
  const visa = query.visa === "available" || query.visa === "unavailable" ? query.visa : "";
  const years = typeof query.years === "string" && /^\d{1,2}$/.test(query.years) ? Number(query.years) : null;
  const currency = typeof query.currency === "string" && currencies.includes(query.currency) ? query.currency : "";
  const salary = currency && typeof query.salary === "string" && /^\d{1,10}$/.test(query.salary) ? Number(query.salary) : null;
  const workplace = query.workplace === "remote" || query.workplace === "hybrid" || query.workplace === "onsite" ? query.workplace : "";
  const opportunity = query.opportunity === "remote-or-visa" ? query.opportunity : "";
  const requireExperience = query.experienceListed === "yes";
  const linkedInReady = !process.env.LINKEDIN_JOBS_FEED_URL?.trim() && linkedInSearchConfigured();
  const linkedInKeywords = (role || skills.split(/[,;|\n]/)[0]).trim().slice(0, 100);
  const [results, additional, linkedIn] = await Promise.all([
    searchEmployerJobs(role, skills),
    searchAdditionalSources(role || skills.split(/[,;|\n]/)[0], location),
    (async () => {
      if (!linkedInReady || !linkedInKeywords) return { status: "Search setup required", jobs: [] };
      try {
        if (!(await limit(`linkedin-search:${userId}`, 12)) || !(await limit("linkedin-search:deployment", 100))) {
          return { status: "Search limit reached", jobs: [] };
        }
        const jobs = await searchLinkedInJobs({ keywords: linkedInKeywords, location });
        return { status: `${jobs.length} matches before filters`, jobs: jobs.map(job => ({
          id: `linkedin-${job.id}`, title: job.title, company: job.company || "Company unspecified",
          location: job.location || "Location unspecified", url: `https://www.linkedin.com/jobs/view/${job.id}/`,
          description: "", excerpt: "", minimumYears: null, visa: "unknown", salary: null, remote: false,
          matchingSkills: [] as string[], score: 0, portal: "LinkedIn",
        })) };
      } catch {
        return { status: "Search temporarily unavailable", jobs: [] };
      }
    })(),
  ]);
  const candidates = [...results.jobs.map(job => ({ ...job, portal: "Greenhouse" })), ...additional.jobs, ...linkedIn.jobs].sort((a, b) => b.score - a.score);
  const boards = [...results.boards, ...additional.boards];
  const availableBoards = boards.filter(board => board.matches !== null).length;
  const matches = candidates.filter(job => {
    const place = job.location.toLowerCase();
    const isRemote = job.remote || /\bremote\b/.test(place);
    if (opportunity && !isRemote && job.visa !== "available") return false;
    if (location && !location.toLowerCase().split(/[\s,]+/).every(word => place.includes(word))) return false;
    if (workplace && !(workplace === "remote" && job.remote) && !place.replace(/[- ]/g, "").includes(workplace)) return false;
    if (visa && job.visa !== visa) return false;
    if (requireExperience && job.minimumYears === null) return false;
    if (years !== null && job.minimumYears !== null && job.minimumYears > years) return false;
    if (currency && job.salary?.currency !== currency) return false;
    return salary === null || (job.salary !== null && job.salary.maximum >= salary);
  });
  const pageSize = 25;
  const lastPage = Math.max(1, Math.ceil(matches.length / pageSize));
  const requestedPage = typeof query.page === "string" && /^\d{1,6}$/.test(query.page) ? Number(query.page) : 1;
  const page = Math.max(1, Math.min(lastPage, requestedPage));
  const filters = new URLSearchParams({ role: searchText, place: location, visa, opportunity, experienceListed: requireExperience ? "yes" : "", years: years?.toString() ?? "", currency, salary: salary?.toString() ?? "", workplace });
  const unfilteredUrl = `/recommended?${new URLSearchParams({ role: searchText })}`;
  const pageUrl = (number: number) => `/recommended?${new URLSearchParams({ ...Object.fromEntries(filters), page: String(number) })}`;

  return <div className="job-board">
    <header className="job-board-hero">
      <h1>Find your next role</h1>
      <p>Open jobs matched to your resume, in India and abroad.</p>
      <div className="job-board-location">
        <label className="job-board-role"><Search size={20} aria-hidden="true" /><Input form="recommendation-filters" name="role" aria-label="Job title or keywords" defaultValue={role} placeholder="Job title or keywords" maxLength={150} /></label>
        <label><MapPin size={20} /><Input form="recommendation-filters" name="place" aria-label="City or country" defaultValue={location} placeholder="City or country" maxLength={100} /></label>
        <Button form="recommendation-filters" className="button" type="submit">Find matches</Button>
      </div>
    </header>
    <div className="job-board-layout">
      <section aria-labelledby="job-results-title" className="job-board-results">
        <div className="job-board-results-header">
          <h2 id="job-results-title">{matches.length} matching {matches.length === 1 ? "job" : "jobs"}</h2>
          <small>{availableBoards} of {boards.length} employer boards available</small>
        </div>
        <details className="job-board-card" style={{ marginBottom: 16 }}>
          <summary>Sources searched · {candidates.length} matches before filters</summary>
          <ul>{boards.map(board => <li key={board.company}>{board.company} · {board.matches === null ? "Feed unavailable" : `${board.matches} matches`}</li>)}</ul>
          <h3>Job portals</h3>
          <ul>{connectors.map(portal => <li key={portal.id}>{portal.name} · {additional.portalResults.find(source => source.portal === portal.id && source.configured)?.status ?? (portal.id === "linkedin" ? linkedIn.status : "Search setup required")}{" "}<a href={portal.url} target="_blank" rel="noreferrer">Open portal</a></li>)}</ul>
        </details>
        {matches.length ? <ul className="job-board-cards">{matches.slice((page - 1) * pageSize, page * pageSize).map(job => <li key={job.id}><Card className="job-board-card gap-0">
          <div className="job-board-card-header">
            <span className="job-board-company" aria-hidden="true">{job.company.slice(0, 2).toUpperCase()}</span>
            <div><h3>{job.title}</h3><p><strong>{job.company}</strong><span className="job-board-source">{job.portal === "LinkedIn" ? <Linkedin size={14} aria-hidden="true" /> : <Building2 size={14} aria-hidden="true" />}{job.portal}</span><span><MapPin size={15} />{job.location}</span></p></div>
          </div>
          {job.excerpt && <p className="job-board-excerpt">{job.excerpt}</p>}
          {job.matchingSkills.length > 0 && <ul className="job-board-skills" aria-label="Matching resume skills">{job.matchingSkills.slice(0, 5).map(skill => <li key={skill}>{skill}</li>)}</ul>}
          {job.description ? <JobMatch action={analyzeJobMatch.bind(null, { title: job.title, description: job.description })} /> :
            <p className="job-board-excerpt">Match analysis requires a job description.</p>}
          <div className="job-board-card-footer">
            <div><p><BriefcaseBusiness size={16} />{job.minimumYears === null ? "Experience unspecified" : `${job.minimumYears}+ years`} · {job.visa === "unknown" ? "Visa unspecified" : `Visa ${job.visa}`}</p>
            <p>{job.salary ? `${job.salary.currency} ${job.salary.minimum.toLocaleString("en-IN")}–${job.salary.maximum.toLocaleString("en-IN")} per year` : "Annual salary unspecified"}</p></div>
            <a className="button" href={job.url} target="_blank" rel="noreferrer">View job <ArrowUpRight size={15} /></a>
          </div>
        </Card></li>)}</ul> : <div className="job-board-card">
          <p role="status">{candidates.length ? `${candidates.length} jobs matched before filters. None meet all the selected filters.` : availableBoards > 0 ? "No openings matched this search." : "Employer boards are currently unavailable."}</p>
          {candidates.length > 0 && <Link className="button secondary compact" href={unfilteredUrl}>Clear filters for this search</Link>}
        </div>}
        {lastPage > 1 && <div className="upload-form">
          {page > 1 && <Link className="button secondary compact" href={pageUrl(page - 1)}>Previous</Link>}
          <span>Page {page} of {lastPage}</span>
          {page < lastPage && <Link className="button secondary compact" href={pageUrl(page + 1)}>Next</Link>}
        </div>}
      </section>
      <aside className="job-board-filters" aria-labelledby="job-filters-title">
        <div><h2 id="job-filters-title">Filters</h2><Link href="/recommended">Reset</Link></div>
        <form id="recommendation-filters" method="get" action="/recommended">
          <label>Opportunity preference<NativeSelect name="opportunity" defaultValue={opportunity}><option value="">All opportunities</option><option value="remote-or-visa">Remote or visa sponsorship</option></NativeSelect></label>
          <label>Work arrangement<NativeSelect name="workplace" defaultValue={workplace}><option value="">Any arrangement</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option><option value="onsite">On-site</option></NativeSelect></label>
          <label>Years of experience<Input name="years" type="number" min="0" max="99" defaultValue={years ?? ""} placeholder="Any experience" /></label>
          <label className="job-board-checkbox"><Input type="checkbox" name="experienceListed" value="yes" defaultChecked={requireExperience} /> Require stated experience</label>
          <label>Visa sponsorship<NativeSelect name="visa" defaultValue={visa}><option value="">Any status</option><option value="available">Offered</option><option value="unavailable">Unavailable</option></NativeSelect></label>
          <label>Salary currency<NativeSelect name="currency" defaultValue={currency}><option value="">Any currency</option>{currencies.map(value => <option key={value}>{value}</option>)}</NativeSelect></label>
          <label>Minimum annual salary<Input name="salary" type="number" min="0" max="9999999999" defaultValue={salary ?? ""} placeholder="Choose a currency" /></label>
          <Button className="button" type="submit">Apply filters</Button>
        </form>
        {opportunity && <p>Check each remote listing for eligible countries.</p>}
        <p>Jobs with unspecified experience stay visible unless you require stated experience. Visa and salary filters use details stated in the posting.</p>
      </aside>
    </div>
  </div>;
}
