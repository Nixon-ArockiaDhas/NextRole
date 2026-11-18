import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DeleteResume } from "./delete-resume";
import { LinkedInSearch } from "./linkedin-search";
import Link from "next/link";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, BriefcaseBusiness, ChevronRight, CircleHelp,
  ClipboardList, Compass, FileText, History, LayoutDashboard, LockKeyhole, Mail,
  Network, Radar, Settings, ShieldCheck, Sparkles, Target, UploadCloud, UserRound, Zap,
} from "lucide-react";
import { connectors } from "../connectors/registry";
import { profileFields, type Field, type MasterResume, type Profile } from "../services/resumes";
import type { SavedJob } from "../services/saved-jobs";
import type { Account } from "../services/accounts";

export const navigation = [
  ["/", "Overview", LayoutDashboard], ["/discover", "Discover Jobs", Compass],
  ["/recommended", "Recommended Jobs", Sparkles], ["/applications", "My Applications", BriefcaseBusiness],
  ["/resumes", "Resume Studio", FileText], ["/cover-letters", "Cover Letters", Mail],
  ["/portals", "Job Portals", Network], ["/notifications", "Notifications", Bell],
  ["/automation", "Automation Center", Zap], ["/audit", "Audit Trail", History],
  ["/profile", "My Profile", UserRound], ["/settings", "Settings", Settings],
] as const;

const api = "/api/workspace";
const clock = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
type Feedback = { error?: string; success?: string };

export function Notice({ error, success }: Feedback) {
  if (error) return <p role="alert" className="notice error">{error}</p>;
  if (success) return <p role="status" className="notice success">{success}</p>;
  return null;
}

function Brand() {
  return <Link href="/" className="brand"><span className="brand-icon"><Radar size={22} /></span>NextRole<span className="brand-dot">.</span></Link>;
}

export function Shell({ path, account, children }: { path: string; account: Account | null; children: React.ReactNode }) {
  const name = navigation.find(([url]) => url === path)?.[1] ?? "Overview";
  return <div className="shell">
    <aside className="sidebar">
      <Brand />
      <nav aria-label="Workspace">
        {navigation.map(([url, label, Icon], index) => <div key={url}>
          {[0, 4, 8, 10].includes(index) && <p className="nav-label">{({ 0: "Workspace", 4: "Resources", 8: "Operations", 10: "Account" })[index as 0 | 4 | 8 | 10]}</p>}
          <Link href={url} className={url === path ? "nav-link selected" : "nav-link"} aria-current={url === path ? "page" : undefined}><Icon size={17} />{label}</Link>
        </div>)}
      </nav>
      <div className="side-footer"><ShieldCheck size={16} /> Private workspace</div>
    </aside>
    <div className="main">
      <header className="topbar">
        <span className="breadcrumb">Workspace <ChevronRight size={14} /> <strong>{name}</strong></span>
        <div className="top-actions">
          <Link className="icon-button" aria-label="Notifications" href="/notifications"><Bell size={19} /></Link>
          {account ? <Link className="avatar" aria-label="My profile" href="/profile">{account.name.slice(0, 2).toUpperCase()}</Link> : <Link className="button secondary compact" href="/login">Sign in <ArrowRight size={15} /></Link>}
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  </div>;
}

export function Auth({ mode, token, feedback }: { mode: "login" | "register" | "forgot" | "reset"; token?: string; feedback: Feedback }) {
  const titles = { login: "Welcome back", register: "Create your workspace", forgot: "Recover your account", reset: "Set a new password" };
  const submit = { login: "Sign in", register: "Create account", forgot: "Send reset link", reset: "Update password" };
  return <main className="auth-layout">
    <div className="auth-brand"><Brand /></div>
    <section className="auth-card panel">
      <span className="tile-icon"><LockKeyhole size={22} /></span>
      <h1>{titles[mode]}</h1>
      <Notice {...feedback} />
      {mode === "reset" && !token ? <Link className="button" href="/forgot">Request a reset link</Link> : <form action={`${api}/${mode}`} method="post" className="stack">
        {mode === "register" && <label>Full name<Input name="name" autoComplete="name" maxLength={100} required /></label>}
        {mode !== "reset" && <label>Email address<Input type="email" name="email" autoComplete="email" required /></label>}
        {mode === "reset" && <input type="hidden" name="token" value={token} />}
        {mode !== "forgot" && <label>Password<Input name="password" type="password" minLength={mode === "login" ? 1 : 12} maxLength={72} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>}
        <Button className="button" type="submit">{submit[mode]} <ArrowRight size={16} /></Button>
      </form>}
      <div className="auth-links">
        {mode === "login" ? <><Link href="/register">Create account</Link><Link href="/forgot">Forgot password?</Link></> : <Link href="/login">Back to sign in</Link>}
      </div>
    </section>
  </main>;
}

export function Heading({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{detail}</p></div>{action}</div>;
}

export type AuditItem = { event: string; actor: string; at: Date; status: string };
export type ResumeItem = Pick<MasterResume, "_id" | "name" | "uploadedAt" | "parseStatus" | "sha256">;

export function Activity({ events }: { events: AuditItem[] }) {
  return events.length ? <ul className="activity">{events.map((event, index) => <li key={index}>
    <span className="small-icon"><History size={16} /></span><div><strong>{event.event}</strong><small>{event.actor} · {clock.format(event.at)}</small></div>
  </li>)}</ul> : <p className="inline-empty">Workspace activity will appear here.</p>;
}

export function Overview({ account, resumeCount, linkedCount, events, active }: { account: Account | null; resumeCount: number; linkedCount: number; events: AuditItem[]; active: boolean }) {
  return <>
    <Heading title="Overview" detail="Manage your job search from one workspace." action={<Link className="button secondary" href="/portals">View job portals <ArrowUpRight size={16} /></Link>} />
    <section className="hero">
      <div className="hero-body">
        <span className="hero-status"><span />{!account ? "Workspace preview" : active ? "Job search active" : "Job search paused"}</span>
        <h2>{account ? `Welcome, ${account.name.split(" ")[0]}.` : "Your next role starts here."}</h2>
        <p>{account ? resumeCount ? "Review your professional profile and keep your job preferences up to date." : "Upload your master resume to start building your professional profile." : "Create an account to build your profile, store your master resume and manage job-search preferences."}</p>
        <Link className="button white" href={account ? resumeCount ? "/profile" : "/resumes" : "/register"}>{account ? resumeCount ? "Review profile" : "Upload resume" : "Create workspace"} <ArrowRight size={17} /></Link>
      </div>
      <div className="hero-graphic pointer-events-none" aria-hidden="true"><div className="orbit outer" /><div className="orbit middle" /><div className="orbit inner" /><div className="orbit-center"><Radar size={53} strokeWidth={1.3} /></div><span className="point p1 pointer-events-none" /><span className="point p2" /><span className="point p3" /></div>
    </section>
    <div className="metrics">
      {([[Target, "Matching jobs", "No active sources"], [ClipboardList, "Applications", "No submissions"], [FileText, "Master resumes", "Private document library"], [Network, "Connected portals", "Linked portal accounts"]] as const).map(([Icon, label, detail], index) => <article key={label} className="panel metric">
        <span className={`tile-icon metric-icon tone-${index}`}><Icon size={19} /></span>
        <p>{label}</p><strong>{index === 2 ? resumeCount : index === 3 ? linkedCount : 0}</strong><small>{detail}</small>
      </article>)}
    </div>
    <div className="overview-grid">
      <section className="panel lower-panel">
        <div className="panel-heading"><div><h2>Job discoveries</h2><p>Keep track of jobs you want to revisit.</p></div><Link href="/discover" className="text-link">View jobs <ArrowRight size={15} /></Link></div>
        <div className="empty"><span className="tile-icon"><Compass size={22} /></span><h3>Save LinkedIn jobs</h3><p>Add a posting to your private list in Discover Jobs.</p></div>
      </section>
      <section className="panel lower-panel">
        <div className="panel-heading"><div><h2>Recent activity</h2><p>Updates from your workspace.</p></div><Link href="/audit" className="text-link">Audit trail <ArrowRight size={15} /></Link></div>
        <Activity events={events.slice(0, 4)} />
      </section>
    </div>
  </>;
}

export function Portals({ signedIn, linked, setup, feedback, selected, composioReady, composioLinked, composioIdentity }: {
  composioReady: boolean;
  composioLinked: boolean;
  composioIdentity?: string;
  signedIn: boolean;
  linked: string[];
  setup: Record<string, boolean>;
  selected?: string;
  feedback: Feedback;
}) {
  const current = connectors.find((portal) => portal.id === selected);
  return <>
    {current ? <Heading title={current.name} detail="Manage this portal connection in NextRole." action={<Link className="button secondary" href="/portals">All job portals</Link>} /> : <Heading title="Job Portals" detail="Link supported accounts and browse jobs directly on each portal." />}
    <Notice {...feedback} />
    {current?.id === "linkedin" && <section className="panel form-panel">
      <h2>LinkedIn through Composio</h2>
      {!composioReady ? <p>Composio setup is required to connect your account.</p> : !signedIn ? <Link className="button" href="/login">Sign in to connect</Link> : <>
        <p>{composioLinked ? composioIdentity ? `Connected as ${composioIdentity}` : "Account connected" : "Authorize your LinkedIn account through Composio."}</p>
        <div className="upload-form">
          {(composioLinked ? [["profile", "Verify LinkedIn profile"], ["disconnect", "Disconnect"]] : [["connect", "Connect with Composio"]]).map(([action, label]) =>
            <form key={action} method="post" action={`/api/composio/linkedin/${action}`}>
              <Button className="button secondary" type="submit">{label}</Button>
            </form>)}
        </div>
      </>}
    </section>}
    <div className="portal-grid">{(current ? [current] : connectors).map((portal) => {
      const isLinked = linked.includes(portal.id);
      const supported = Object.hasOwn(setup, portal.id);
      const ready = setup[portal.id];
      const status = isLinked ? "Linked" : ready ? "Ready to connect" : supported ? "OAuth setup required" : "Direct access only";
      const action = isLinked ? "disconnect" : "connect";
      return <article key={portal.id} className="panel portal">
        <span className="portal-icon" style={{ backgroundColor: portal.color }}>{portal.initials}</span>
        <h2>{portal.name}</h2><span className="badge">{status}</span>
        <dl><div><dt>Account linking</dt><dd>{supported ? "OAuth" : "Unavailable"}</dd></div><div><dt>Job search</dt><dd>On portal</dd></div><div><dt>Applications</dt><dd>On portal</dd></div></dl>
        {current && supported && !ready && !isLinked && <p className="portal-note">Add the {portal.name} OAuth app credentials to enable account linking.</p>}
        {current && <p className="portal-note">{portal.id === "linkedin" ? "Search for LinkedIn jobs in Discover Jobs when authorized search access is configured." : "Automatic job sync requires a separate job discovery integration."}</p>}
        <div className="portal-actions">
          {!current && portal.id === "linkedin" ? <Link className="button" href="/portals?portal=linkedin">Manage LinkedIn <ArrowRight size={16} /></Link> : <>
          {isLinked || ready ? signedIn ? <form method="post" action={`/api/portals/${portal.id}/${action}`}>
            <Button className={isLinked ? "button secondary" : "button"} type="submit">{isLinked ? "Unlink account" : "Connect account"}</Button>
          </form> : <Link className="button" href="/login">Sign in to connect</Link> : null}
          {current && portal.id === "linkedin" && <Link className="button secondary" href="/discover">Discover LinkedIn jobs</Link>}
          <a className="button secondary" href={portal.url} target="_blank" rel="noreferrer">Open {portal.name} job board <ArrowUpRight size={16} /></a>
          </>}
        </div>
      </article>;
    })}</div>
  </>;
}

const resumeLabels: Record<MasterResume["parseStatus"], string> = { parsed: "Profile extracted", local: "Profile details extracted", unconfigured: "No profile fields extracted", failed: "AI extraction failed", no_text: "No extractable text", unreadable: "File unreadable by parser" };

export function ResumeStudio({ resumes, feedback }: { resumes: ResumeItem[]; feedback: Feedback }) {
  return <>
    <Heading title="Resume Studio" detail="Upload and download your read-only master resumes." action={<Link className="button secondary" href="/recommended">See recommended jobs</Link>} />
    <Notice {...feedback} />
    <section className="panel form-panel">
      <span className="tile-icon"><UploadCloud size={22} /></span><h2>Upload a master resume</h2><p>PDF, DOCX or TXT. Up to 5 MB. Each upload fills available blank profile fields. With AI enabled, extracted resume text is sent to the configured AI provider for parsing.</p>
      <form action={`${api}/upload`} method="post" encType="multipart/form-data" className="upload-form">
        <label>Resume file<Input type="file" name="resume" accept=".pdf,.docx,.txt" required /></label>
        <Button className="button" type="submit">Save original <UploadCloud size={17} /></Button>
      </form>
    </section>
    <section className="panel form-panel"><div className="panel-heading"><h2>Upload history</h2><Link className="text-link" href="/profile">Review my profile <ArrowRight size={15} /></Link></div>
      {resumes.length ? <ul className="activity">{resumes.map((resume) => <li key={resume._id}>
        <span className="small-icon"><FileText size={18} /></span><div className="resume-name"><strong>{resume.name}</strong><small>{clock.format(resume.uploadedAt)} · {resumeLabels[resume.parseStatus]}</small></div>
        <Link className="button secondary compact" href={`/resumes/${resume._id}/review`}>Review details</Link>
        <form action={`${api}/fill-profile`} method="post">
          <input type="hidden" name="resumeId" value={resume._id} />
          <Button className="button secondary compact" type="submit">Fill profile</Button>
        </form>
        <DeleteResume id={resume._id} name={resume.name} />
        <a className="button secondary compact" href={`${api}/download/${resume._id}`}><ArrowDownToLine size={16} /> Original</a>
      </li>)}</ul> : <p>No master resumes uploaded.</p>}
    </section>
  </>;
}

export function ProfilePage({ profile, account, feedback }: { profile: Profile; account: Account; feedback: Feedback }) {
  return <>
    <Heading title="My Profile" detail="Review extracted information and edit your job preferences." />
    <Notice {...feedback} />
    <form action={`${api}/profile`} method="post" className="profile-form">
      {[["Personal information", 0, 8], ["Professional information", 8, 24], ["Job preferences", 24, 35]].map(([title, start, end]) => <section key={title} className="panel form-panel">
        <h2>{title}</h2>
        <div className="field-grid">{Object.entries(profileFields).slice(Number(start), Number(end)).map(([key, label]) =>
          <label key={key}>{label}<Input name={key} maxLength={2000} defaultValue={profile[key as Field] ?? (key === "name" ? account.name : key === "email" ? account.email : "")} /></label>)}</div>
      </section>)}
      <Button className="button" type="submit">Save profile <ArrowRight size={16} /></Button>
    </form>
  </>;
}

export function Automation({ active, feedback }: { active: boolean; feedback: Feedback }) {
  return <>
    <Heading title="Automation Center" detail="Manage your job-search preference and see the status of automated applications." />
    <Notice {...feedback} />
    <section className="panel form-panel control">
      <div><h2>Actively looking for a job</h2><p>Current preference is {active ? "on" : "off"}.</p></div>
      <form action={`${api}/automation`} method="post"><input type="hidden" name="active" value={String(!active)} />
        <Button type="submit" role="switch" aria-label="Actively looking for a job" aria-checked={active} className={active ? "toggle on" : "toggle"}><span /></Button>
      </form>
    </section>
    <section className="panel form-panel"><h2>Automatic applications</h2><p>Unavailable. Automatic applications require a supported submission integration and a server-side worker.</p></section>
  </>;
}

export function DiscoverJobs({ signedIn, jobs, feedback, selectedJob, searchConfigured }: { signedIn: boolean; jobs: SavedJob[]; feedback: Feedback; selectedJob?: string; searchConfigured: boolean }) {
  return <>
    <Heading title="Discover Jobs" detail="Search for LinkedIn postings and save jobs to your workspace." />
    <Notice {...feedback} />
    {signedIn && <LinkedInSearch configured={searchConfigured} />}
    <section className="panel form-panel">
      <h2>Save a posting by URL</h2>
      <p>{selectedJob ? "Posting received from the browser connector. Enter its title and company to save it." : "Paste a LinkedIn posting link to save a job you already found."}</p>
      {signedIn ? <form className="upload-form" action={`${api}/save-job`} method="post">
        <label>LinkedIn job URL<Input name="url" type="url" defaultValue={selectedJob ? `https://www.linkedin.com/jobs/view/${selectedJob}/` : undefined} placeholder="https://www.linkedin.com/jobs/view/…" maxLength={2048} required /></label>
        <label>Job title<Input name="title" maxLength={150} required /></label>
        <label>Company<Input name="company" maxLength={120} required /></label>
        <Button className="button" type="submit">Save job</Button>
      </form> : <div className="upload-form"><Link className="button" href="/login">Sign in to save jobs</Link></div>}
    </section>
    {signedIn && <section className="panel form-panel">
      <h2>Saved jobs</h2>
      {jobs.length ? <ul className="activity">{jobs.map((job) => <li key={job.sourceId}>
        <span className="small-icon"><BriefcaseBusiness size={17} /></span>
        <div className="resume-name"><strong>{job.title}</strong><small>{job.company} · LinkedIn</small></div>
        <div className="portal-actions">
          <a className="button secondary compact" href={`https://www.linkedin.com/jobs/view/${job.sourceId}/`} target="_blank" rel="noreferrer">View posting <ArrowUpRight size={15} /></a>
          <form method="post" action={`${api}/track-job`}>
            <input type="hidden" name="sourceId" value={job.sourceId} />
            <Button className="button secondary compact" type="submit">Track application</Button>
          </form>
          <form method="post" action={`${api}/remove-job`}>
            <input type="hidden" name="sourceId" value={job.sourceId} />
            <Button className="button secondary compact" type="submit" aria-label={`Remove ${job.title}`}>Remove</Button>
          </form>
        </div>
      </li>)}</ul> : <p>No saved jobs yet.</p>}
    </section>}
  </>;
}

const emptySections = {
  "/applications": ["Track job applications and their outcomes.", "No applications recorded", "Submission and tracking integrations are pending."],
  "/cover-letters": ["Job-specific cover letters.", "No cover letters", "Cover letter generation is pending."],
  "/notifications": ["Updates about jobs, applications and connectors.", "No notifications", "Notification delivery is pending."],
} as const;

export function EmptySection({ path }: { path: keyof typeof emptySections }) {
  const [detail, title, explanation] = emptySections[path];
  return <>
    <Heading title={navigation.find(([url]) => url === path)![1]} detail={detail} />
    <section className="panel empty section-empty"><span className="tile-icon"><CircleHelp size={23} /></span><h2>{title}</h2><p>{explanation}</p>
    </section>
  </>;
}

export interface TrackedApplication {
  sourceId: string;
  title: string;
  company: string;
  status: string;
  updatedAt: Date;
}

export function ApplicationTracker({ applications, feedback }: { applications: TrackedApplication[]; feedback: Feedback }) {
  return <>
    <Heading title="My Applications" detail="Manage preparation and track jobs requiring your action." />
    <Notice {...feedback} />
    <section className="panel form-panel">
      {applications.length ? <ul className="activity">{applications.map((application) => <li key={application.sourceId}>
        <div className="resume-name"><strong>{application.title}</strong><small>{application.company} · {application.status} · {clock.format(application.updatedAt)}</small></div>
        <a className="button secondary compact" target="_blank" rel="noreferrer" href={`https://www.linkedin.com/jobs/view/${application.sourceId}/`}>Open application</a>
        {application.status !== "Applied" && <form className="upload-form" method="post" action={`${api}/application-status`}>
          <input type="hidden" name="sourceId" value={application.sourceId} />
          <label>Status<NativeSelect name="status" defaultValue={application.status}>
            {["Requires User Action", "Viewed Only", "Preparing Application", "Withdrawn"].map(status => <option key={status}>{status}</option>)}
          </NativeSelect></label>
          <Button className="button secondary compact" type="submit">Update</Button>
        </form>}
      </li>)}</ul> : <p>Add a saved job from Discover Jobs to start tracking an application.</p>}
    </section>
  </>;
}
