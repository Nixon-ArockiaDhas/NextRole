import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { RecommendedJobs } from "../../components/recommended-jobs";
import { profileFromResumeText } from "../../services/resume-profile";
import { composioLinkedInConfigured } from "../../connectors/composio-linkedin";
import { linkedInSearchConfigured } from "../../connectors/linkedin-search";
import type { SavedJob } from "../../services/saved-jobs";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { currentAccount } from "../../services/accounts";
import { database } from "../../services/database";
import { connectors } from "../../connectors/registry";
import { identityProvider } from "../../connectors/identity";
import type { Profile } from "../../services/resumes";
import {
  ApplicationTracker, type TrackedApplication, Activity, Auth, Automation, DiscoverJobs, EmptySection, Heading, navigation, Notice, Overview, Portals,
  ProfilePage, ResumeStudio, Shell, type AuditItem, type ResumeItem,
} from "../../components/workspace";

type Query = Record<string, string | string[] | undefined>;

export default async function Workspace({ params, searchParams }: {
  params: Promise<{ section?: string[] }>;
  searchParams: Promise<Query>;
}) {
  const { section = [] } = await params;
  const path = "/" + section.join("/");
  const query = await searchParams;
  const feedback = {
    error: typeof query.error === "string" ? query.error.slice(0, 240) : undefined,
    success: typeof query.success === "string" ? query.success.slice(0, 240) : undefined,
  };
  const mode = section[0];
  if (section.length === 1 && (mode === "login" || mode === "register" || mode === "forgot" || mode === "reset")) {
    return <Auth mode={mode} token={typeof query.token === "string" ? query.token : undefined} feedback={feedback} />;
  }
  if (!navigation.some(([url]) => url === path)) notFound();

  let account;
  try {
    account = await currentAccount();
  } catch {
    return <Shell path={path} account={null}><Heading title="Workspace unavailable" detail="The database connection timed out. Try again shortly." /><Link href="/login" className="button secondary">Sign in</Link></Shell>;
  }
  const publicPage = path === "/" || path === "/portals" || path === "/discover";
  if (!account && !publicPage) redirect("/login");

  let profile: Profile = {};
  let candidateResume: Profile | undefined;
  let events: AuditItem[] = [];
  let resumes: ResumeItem[] = [];
  let resumeCount = 0;
  let linked: string[] = [];
  let active = false;
  let savedJobs: SavedJob[] = [];
  let applications: TrackedApplication[] = [];
  if (account) {
    const { db } = await database();
    const userId = account._id;
    const scope = { userId };
    if (path === "/" || path === "/audit") {
      const actor = typeof query.actor === "string" && ["USER", "SYSTEM", "AI"].includes(query.actor) ? query.actor : undefined;
      events = await db.collection<AuditItem>("auditLogs").find(path === "/audit" && actor ? { ...scope, actor } : scope)
        .sort({ at: -1 }).limit(path === "/" ? 4 : 100).toArray();
    }
    if (path === "/" || path === "/portals") {
      linked = await db.collection("jobPortalConnections").distinct<string>("portal", scope);
    }
    if (path === "/") resumeCount = await db.collection("masterResumes").countDocuments(scope);
    if (path === "/resumes") {
      resumes = await db.collection<ResumeItem>("masterResumes")
        .find(scope).project<ResumeItem>({ name: 1, uploadedAt: 1, parseStatus: 1, sha256: 1 })
        .sort({ uploadedAt: -1 }).toArray();
    }
    if (path === "/applications") {
      applications = await db.collection<TrackedApplication>("applications").find(scope).sort({ updatedAt: -1 }).toArray();
    }
    if (path === "/discover") {
      savedJobs = await db.collection<SavedJob>("savedLinkedInJobs").find(scope).sort({ savedAt: -1 }).toArray();
    }
    if (path === "/recommended") {
      const latestResume = await db.collection<{ userId: string; text: string; extracted?: Profile }>("masterResumes")
        .find(scope).sort({ uploadedAt: -1 }).project<{ text: string; extracted?: Profile }>({ text: 1, extracted: 1 }).limit(1).next();
      if (latestResume) candidateResume = { ...profileFromResumeText(latestResume.text ?? ""), ...latestResume.extracted };
    }
    if (path === "/profile") profile = (await db.collection<{ fields: Profile }>("userProfiles").findOne(scope))?.fields ?? {};
    if (path === "/" || path === "/automation") active = (await db.collection<{ active: boolean }>("userPreferences").findOne(scope))?.active ?? false;
  }

  let content;
  switch (path) {
    case "/": content = <Overview account={account} resumeCount={resumeCount} linkedCount={linked.length} events={events} active={active} />; break;
    case "/portals": {
      const setup = Object.fromEntries(connectors.flatMap(({ id }) => {
        const provider = identityProvider(id);
        return provider ? [[id, Boolean(provider.credentials)]] : [];
      }));
      const composioReady = composioLinkedInConfigured();
      const connection = composioReady && account
        ? await (await database()).db.collection<{ _id: string; identity?: string }>("composioLinkedInConnections").findOne({ _id: account._id }, { projection: { identity: 1 } })
        : null;
      content = <Portals composioReady={composioReady} composioLinked={Boolean(connection)} composioIdentity={connection?.identity} signedIn={Boolean(account)} linked={linked} setup={setup} feedback={feedback} selected={typeof query.portal === "string" ? query.portal : undefined} />;
      break;
    }
    case "/resumes": content = <ResumeStudio resumes={resumes} feedback={feedback} />; break;
    case "/profile": content = <ProfilePage profile={profile} account={account!} feedback={feedback} />; break;
    case "/automation": content = <Automation active={active} feedback={feedback} />; break;
    case "/audit": content = <>
      <Heading title="Audit Trail" detail="Recent activity recorded for your workspace." />
      <section className="panel form-panel">
        <form method="get" className="upload-form">
          <label>Performed by<NativeSelect name="actor" defaultValue={typeof query.actor === "string" ? query.actor : ""}><option value="">Everyone</option><option value="USER">User</option><option value="AI">AI</option><option value="SYSTEM">System</option></NativeSelect></label>
          <Button className="button secondary" type="submit">Filter</Button>
        </form><Activity events={events} />
      </section>
    </>; break;
    case "/settings": content = <>
      <Heading title="Settings" detail="Manage your account and session." />
      <Notice {...feedback} />
      <section className="panel form-panel">
        <h2>Account</h2><p>{account?.email}</p>
        <div className="settings-actions"><Link href="/forgot" className="button secondary">Reset password</Link>
          <form action="/api/workspace/logout" method="post"><input type="hidden" name="action" value="logout" /><Button type="submit" className="button">Sign out</Button></form>
        </div>
      </section>
    </>; break;
    case "/discover": content = <DiscoverJobs signedIn={Boolean(account)} jobs={savedJobs} feedback={feedback} searchConfigured={linkedInSearchConfigured()} selectedJob={typeof query.job === "string" && /^\d{1,20}$/.test(query.job) ? query.job : undefined} />; break;
    case "/applications": content = <ApplicationTracker applications={applications} feedback={feedback} />; break;
    case "/recommended": content = <RecommendedJobs resume={candidateResume} query={query} userId={account!._id} feedback={feedback} />; break;
    case "/cover-letters":
    case "/notifications": content = <EmptySection path={path} />; break;
    default: notFound();
  }
  return <Shell path={path} account={account}>{content}</Shell>;
}
