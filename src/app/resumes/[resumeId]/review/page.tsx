import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { notFound, redirect } from "next/navigation";
import { currentAccount } from "../../../../services/accounts";
import { database } from "../../../../services/database";
import { profileRevision } from "../../../../services/profile-review";
import { profileFromResumeText } from "../../../../services/resume-profile";
import { profileFields, type Field, type MasterResume, type Profile } from "../../../../services/resumes";
import { Shell, Heading, Notice } from "../../../../components/workspace";

export default async function ResumeReview({ params, searchParams }: {
  params: Promise<{ resumeId: string }>; searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const account = await currentAccount();
  if (!account) redirect("/login");
  const { resumeId } = await params;
  const { db } = await database();
  const resume = await db.collection<MasterResume>("masterResumes").findOne({ _id: resumeId, userId: account._id }, { projection: { file: 0 } });
  if (!resume) notFound();
  const profile = await db.collection<{ userId: string; fields: Profile }>("userProfiles").findOne({ userId: account._id });
  const fields = profile?.fields ?? {};
  const extracted = { ...profileFromResumeText(resume.text), ...resume.extracted };
  return <Shell path="/resumes" account={account}>
    <Heading title="Review resume details" detail={resume.name} />
    <Notice {...await searchParams} />
    <details className="panel form-panel"><summary>View extracted resume text</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{resume.text || "No readable text extracted."}</pre></details>
    <form action="/api/workspace/review-profile" method="post">
      <input type="hidden" name="resumeId" value={resumeId} />
      <input type="hidden" name="revision" value={profileRevision(fields)} />
      <section className="panel form-panel">
        <p>Select the extracted values you want to use in your profile. Review conflicting details before approving.</p>
        {Object.entries(profileFields).map(([key, label]) => {
          const current = fields[key as Field];
          const proposed = extracted[key as Field];
          const conflict = current && proposed && current !== proposed;
          return <div key={key} className="review-field">
            <h3>{label}</h3>
            <p>Current value — {current || "Missing"}</p>
            <p>Extracted value — {proposed || "No value extracted"}</p>
            {conflict && <p className="notice error">This differs from your profile.</p>}
            {proposed && <label className="review-choice"><Input type="checkbox" name="fields" value={key} />Use extracted value</label>}
          </div>;
        })}
      </section>
      <Button className="button" type="submit">Approve review</Button>
    </form>
  </Shell>;
}
