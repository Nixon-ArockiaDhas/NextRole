import { createHash } from "node:crypto";
import { database, audit } from "./database";
import { type Profile, type MasterResume, type Field, profileFields } from "./resumes";
import { profileFromResumeText } from "./resume-profile";

export function profileRevision(fields: Profile) {
  return createHash("sha256").update(JSON.stringify(Object.keys(profileFields).map(key => fields[key as Field] ?? ""))).digest("hex");
}

export async function reviewProfile(userId: string, resumeId: string, revision: string, selected: string[]) {
  const { client, db } = await database();
  return client.withSession(session => session.withTransaction(async () => {
    const resume = await db.collection<MasterResume>("masterResumes").findOne({ _id: resumeId, userId }, { session });
    if (!resume) return "missing";
    const profiles = db.collection<{ _id: string; userId: string; fields: Profile }>("userProfiles");
    const profile = await profiles.findOne({ _id: userId, userId }, { session });
    const fields = { ...profile?.fields };
    if (profileRevision(fields) !== revision) return "stale";
    const extracted = { ...profileFromResumeText(resume.text), ...resume.extracted };
    for (const key of selected) {
      if (!Object.hasOwn(profileFields, key) || !extracted[key as Field]) return "invalid";
      fields[key as Field] = extracted[key as Field];
    }
    await profiles.updateOne({ _id: userId }, { $set: { userId, fields } }, { upsert: true, session });
    await db.collection("profileReviews").insertOne({
      userId, resumeId, selectedFields: selected, previousRevision: revision,
      approvedRevision: profileRevision(fields), reviewedAt: new Date(), schemaVersion: 1,
    }, { session });
    await audit(userId, "Resume extraction reviewed", resumeId, "USER", session, { selectedFields: selected });
    return "saved";
  }));
}
