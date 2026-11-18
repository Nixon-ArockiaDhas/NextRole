import { MongoClient, type ClientSession } from "mongodb";

const globalDb = globalThis as typeof globalThis & { nextRoleClient?: Promise<MongoClient> };

async function initialize(uri: string) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "nextrole");
    await Promise.all([
      db.collection("applications").createIndex({ userId: 1, sourceId: 1 }, { unique: true }),
      db.collection("applicationEvents").createIndex({ userId: 1, sourceId: 1, at: -1 }),
      db.collection("profileReviews").createIndex({ userId: 1, resumeId: 1, reviewedAt: -1 }),
      db.collection("users").createIndex({ email: 1 }, { unique: true }),
      db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("sessions").createIndex({ userId: 1 }),
      db.collection("portalOAuthStates").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("portalOAuthStates").createIndex({ userId: 1, portal: 1 }),
      db.collection("jobPortalConnections").createIndex({ userId: 1, portal: 1 }, { unique: true }),
      db.collection("jobPortalConnections").createIndex({ portal: 1, subject: 1 }, { unique: true }),
      db.collection("resetTokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("resetTokens").createIndex({ userId: 1 }),
      db.collection("rateLimits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("masterResumes").createIndex({ userId: 1, uploadedAt: -1 }),
      db.collection("savedLinkedInJobs").createIndex({ userId: 1, sourceId: 1 }, { unique: true }),
      db.collection("savedLinkedInJobs").createIndex({ userId: 1, savedAt: -1 }),
      db.collection("auditLogs").createIndex({ userId: 1, at: -1 }),
    ]);
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}

export async function database() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MongoDB must be configured.");
  globalDb.nextRoleClient ??= initialize(uri).catch((error: unknown) => {
    delete globalDb.nextRoleClient;
    throw error;
  });
  const client = await globalDb.nextRoleClient;
  return { client, db: client.db(process.env.MONGODB_DB || "nextrole") };
}

export async function audit(
  userId: string, event: string, entityId: string, actor: "USER" | "AI" | "SYSTEM",
  session: ClientSession, metadata: Record<string, unknown> = {},
) {
  const { db } = await database();
  await db.collection("auditLogs").insertOne({
    userId, event, entityId, actor, at: new Date(), status: "success", metadata,
    correlationId: crypto.randomUUID(),
  }, { session });
}
