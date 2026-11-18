"use client";

import { Input } from "@/components/ui/input";


import { Button } from "@/components/ui/button";


import { useState, type FormEvent } from "react";
import type { LinkedInSearchResult } from "../connectors/linkedin-search";

export function LinkedInSearch({ configured, profileQuery }: {
  configured: boolean;
  profileQuery?: { keywords: string; location: string };
}) {
  const [jobs, setJobs] = useState<LinkedInSearchResult[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const query = Object.fromEntries(new FormData(event.currentTarget));
    setPending(true);
    setJobs(null);
    setError("");
    try {
      const response = await fetch("/api/portals/linkedin/search", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query),
      });
      const result = await response.json();
      if (!response.ok) setError(result.error ?? "LinkedIn search is unavailable.");
      else setJobs(result.jobs);
    } catch {
      setError("LinkedIn search is unavailable. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  return <section className="panel form-panel" aria-busy={pending}>
    <h2>Search LinkedIn jobs</h2>
    {configured ? <form className="upload-form" onSubmit={search}>
      <label>Job title or keyword<Input name="keywords" defaultValue={profileQuery?.keywords} maxLength={100} required /></label>
      <label>Location<Input name="location" defaultValue={profileQuery?.location} maxLength={100} /></label>
      <Button className="button" type="submit" disabled={pending}>{pending ? "Searching…" : profileQuery ? "Find jobs for my profile" : "Search jobs"}</Button>
    </form> : <p>Connect a LinkedIn MCP server to enable job search in this workspace.</p>}
    {error && <p role="alert" className="notice error">{error}</p>}
    {jobs && (jobs.length ? <ul className="activity">{jobs.map((job) => {
      const url = `https://www.linkedin.com/jobs/view/${job.id}/`;
      return <li key={job.id}>
        <div className="resume-name"><strong>{job.title}</strong><small>{[job.company, job.location].filter(Boolean).join(" · ")}</small></div>
        <a className="button secondary compact" href={url} target="_blank" rel="noreferrer">View posting</a>
        {job.company && <form method="post" action="/api/workspace/save-job">
          <input type="hidden" name="url" value={url} />
          <input type="hidden" name="title" value={job.title} />
          <input type="hidden" name="company" value={job.company} />
          <Button className="button secondary compact" type="submit">Save job</Button>
        </form>}
      </li>;
    })}</ul> : <p role="status">No LinkedIn jobs matched this search.</p>)}
  </section>;
}
