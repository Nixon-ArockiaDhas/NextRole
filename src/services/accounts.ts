import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { hash, compare } from "bcryptjs";
import type { ClientSession } from "mongodb";
import { z } from "zod";
import { audit, database } from "./database";

const sessionCookie = "nextrole_session";
const sessionDuration = 7 * 24 * 60 * 60;
const dummyHash = "$2b$12$h8VF0.8PKFSdERqUYmUeBu2QzTk7Czm2P1ZY2AIVB4djqLkjuC3SG";
export const emailField = z.string().trim().toLowerCase().email().max(254);
export const passwordField = z.string().min(12).refine((value) => Buffer.byteLength(value) <= 72, "Use a password within 72 bytes.");
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export interface Account {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "member";
}

export async function currentSessionId() {
  const token = (await cookies()).get(sessionCookie)?.value;
  return token ? digest(token) : null;
}

export async function currentAccount() {
  const sessionId = await currentSessionId();
  if (!sessionId) return null;
  const { db } = await database();
  const session = await db.collection<{ _id: string; userId: string; expiresAt: Date }>("sessions")
    .findOne({ _id: sessionId, expiresAt: { $gt: new Date() } });
  return session ? db.collection<Account>("users").findOne({ _id: session.userId }) : null;
}

export async function limit(key: string, maximum: number) {
  const { db } = await database();
  const interval = 15 * 60 * 1000;
  const bucket = Math.floor(Date.now() / interval);
  const item = await db.collection<{ _id: string; count: number; expiresAt: Date }>("rateLimits").findOneAndUpdate(
    { _id: digest(`${key}:${bucket}`) },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 1) * interval) } },
    { upsert: true, returnDocument: "after" },
  );
  return (item?.count ?? 0) <= maximum;
}

async function newSession(userId: string, session: ClientSession) {
  const { db } = await database();
  const token = randomBytes(32).toString("base64url");
  await db.collection<{ _id: string; userId: string; expiresAt: Date }>("sessions").insertOne({
    _id: digest(token), userId, expiresAt: new Date(Date.now() + sessionDuration * 1000),
  }, { session });
  return token;
}

async function setSessionCookie(token: string) {
  (await cookies()).set(sessionCookie, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.APP_URL?.startsWith("https:") ?? process.env.NODE_ENV === "production",
    path: "/", maxAge: sessionDuration,
  });
}

export async function register(name: string, email: string, password: string) {
  const { client, db } = await database();
  const userId = crypto.randomUUID();
  const passwordHash = await hash(password, 12);
  const token = await client.withSession((session) => session.withTransaction(async () => {
    await db.collection<Account>("users").insertOne({ _id: userId, name, email, passwordHash, role: "member" }, { session });
    await audit(userId, "Account created", userId, "USER", session);
    return newSession(userId, session);
  }));
  await setSessionCookie(token);
}

export async function login(email: string, password: string) {
  const { client, db } = await database();
  const account = await db.collection<Account>("users").findOne({ email });
  if (!(await compare(password, account?.passwordHash ?? dummyHash)) || !account) return false;
  const token = await client.withSession((session) => session.withTransaction(async () => {
    await audit(account._id, "Signed in", account._id, "USER", session);
    return newSession(account._id, session);
  }));
  await setSessionCookie(token);
  return true;
}

export async function logout(userId: string) {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (token) {
    const { client, db } = await database();
    await client.withSession((session) => session.withTransaction(async () => {
      await db.collection<{ _id: string }>("sessions").deleteOne({ _id: digest(token) }, { session });
      await audit(userId, "Signed out", userId, "USER", session);
    }));
  }
  (await cookies()).delete(sessionCookie);
}
