"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import type { MatchState } from "@/app/actions/job-match";

export function JobMatch({ action }: { action: (previous: MatchState) => Promise<MatchState> }) {
  const [state, submit, pending] = useActionState(action, {});
  const analysis = state.analysis;
  return <section className="job-match" aria-label="Resume match analysis">
    <form action={submit}>
      <Button type="submit" variant="outline" disabled={pending}>
        <Sparkles aria-hidden="true" />{pending ? "Analyzing…" : analysis ? "Analyze again" : "Analyze resume match"}
      </Button>
    </form>
    {pending && <div role="status"><p>Comparing the job description with your resume using NVIDIA.</p><Progress value={null} aria-label="Analysis in progress" /></div>}
    {state.error && <p role="alert">{state.error}</p>}
    {analysis && <div className="job-match-result" aria-live="polite">
      <div className="job-match-heading"><strong>Resume match</strong><Badge>{analysis.score}%</Badge></div>
      <Slider min={10} max={100} value={[analysis.score]} disabled aria-hidden="true" />
      <p>{analysis.summary}</p>
      {analysis.strengths.length > 0 && <div><strong>Matching evidence</strong><ul>{analysis.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      {analysis.gaps.length > 0 && <div><strong>Gaps to review</strong><ul>{analysis.gaps.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    </div>}
  </section>;
}
