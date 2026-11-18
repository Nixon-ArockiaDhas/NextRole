import { MongoServerError } from "mongodb";
import { z } from "zod";
import { audit, database } from "./database";

export interface SavedJob {
  userId: string;
  sourceId: string;
  title: string;
  company: string;
  savedAt: Date;
}

const jobForm = z.object({
  url: z.string().trim().max(2048).url(),
  title: z.string().trim().min(1).max(150),
  company: z.string().trim().min(1).max(120),
});

export async function saveLinkedInJob(userId: string, form: FormData) {
  const parsed = jobForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) return "invalid";
  const { url, title, company } = parsed.data;
  const link = new URL(url);
  const sourceId = link.pathname.match(/^\/jobs\/view\/(?:[^/]+-)?(\d{1,20})\/?$/)?.[1];
  if (link.protocol !== "https:" || !["www.linkedin.com", "linkedin.com"].includes(link.hostname) ||
    link.port || link.username || link.password || !sourceId) return "invalid";

  const { client, db } = await database();
  try {
    return await client.withSession((session) => session.withTransaction(async () => {
      await db.collection<SavedJob>("savedLinkedInJobs").insertOne({ userId, sourceId, title, company, savedAt: new Date() }, { session });
      await audit(userId, "LinkedIn job saved", sourceId, "USER", session);
      return "saved";
    }));
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return "duplicate";
    throw error;
  }
}

export async function removeLinkedInJob(userId: string, sourceId: string) {
  const { client, db } = await database();
  return client.withSession((session) => session.withTransaction(async () => {
    const result = await db.collection<SavedJob>("savedLinkedInJobs").deleteOne({ userId, sourceId }, { session });
    if (result.deletedCount) await audit(userId, "Saved LinkedIn job removed", sourceId, "USER", session);
    return Boolean(result.deletedCount);
  }));
}
