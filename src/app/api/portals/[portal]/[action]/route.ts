import { randomBytes } from "node:crypto";
import { MongoServerError } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { identityProvider, resolveIdentity, startAuthorization } from "../../../../../connectors/identity";
import { currentAccount, currentSessionId, digest, limit } from "../../../../../services/accounts";
import { audit, database } from "../../../../../services/database";

type Context = { params: Promise<{ portal: string; action: string }> };

interface PendingAuthorization {
  _id: string;
  portal: string;
  userId: string;
  sessionId: string;
  verifier?: string;
  expiresAt: Date;
}

const responseHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

function feedback(message: string, success = false) {
  const query = new URLSearchParams({ [success ? "success" : "error"]: message });
  return new Response(null, { status: 303, headers: { ...responseHeaders, Location: `/portals?${query}` } });
}

function origin(request: NextRequest) {
  return process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
}

function callbackUrl(request: NextRequest, portal: string) {
  return new URL(`/api/portals/${portal}/callback`, origin(request)).href;
}

function signIn() {
  return new Response(null, { status: 303, headers: { ...responseHeaders, Location: "/login" } });
}

export async function POST(request: NextRequest, context: Context) {
  const { portal, action } = await context.params;
  const provider = identityProvider(portal);
  if (!provider || (action !== "connect" && action !== "disconnect")) return new Response(null, { status: 404 });
  if (request.headers.get("origin") !== origin(request)) return new Response(null, { status: 403 });
  try {
    const account = await currentAccount();
    const sessionId = await currentSessionId();
    if (!account || !sessionId) return signIn();
    const userId = account._id;
    if (!(await limit(`portal:${userId}:${portal}`, 12))) return feedback("Too many connection attempts. Try again in 15 minutes.");
    const { client, db } = await database();
    const pending = db.collection<PendingAuthorization>("portalOAuthStates");
    if (action === "disconnect") {
      await client.withSession((session) => session.withTransaction(async () => {
        await pending.deleteMany({ userId, portal }, { session });
        const result = await db.collection("jobPortalConnections").deleteOne({ userId, portal }, { session });
        if (result.deletedCount) await audit(userId, "Job portal unlinked", portal, "USER", session);
      }));
      return feedback("Portal account unlinked from NextRole.", true);
    }
    if (!provider.credentials) return feedback("This portal needs OAuth app credentials before you can link an account.");
    const state = randomBytes(32).toString("base64url");
    const { url, verifier } = startAuthorization(provider, callbackUrl(request, portal), state);
    await pending.insertOne({ _id: digest(state), userId, sessionId, portal, verifier, expiresAt: new Date(Date.now() + 10 * 60_000) });
    const response = NextResponse.redirect(url, 303);
    for (const [key, value] of Object.entries(responseHeaders)) response.headers.set(key, value);
    return response;
  } catch (error) {
    console.error("Portal operation failed", { portal, action, type: error instanceof Error ? error.name : "unknown" });
    return feedback("The portal connection could not be updated. Try again shortly.");
  }
}

export async function GET(request: NextRequest, context: Context) {
  const { portal, action } = await context.params;
  const provider = identityProvider(portal);
  if (!provider || action !== "callback") return new Response(null, { status: 404 });
  if (!provider.credentials) return feedback("This portal needs OAuth app credentials before you can link an account.");
  const { searchParams } = request.nextUrl;
  const state = searchParams.get("state");
  if (!state || !/^[\w-]{43}$/.test(state)) return feedback("Start a new connection from Job Portals.");
  try {
    const account = await currentAccount();
    const sessionId = await currentSessionId();
    if (!account || !sessionId) return signIn();
    const userId = account._id;
    const { client, db } = await database();
    const pending = db.collection<PendingAuthorization>("portalOAuthStates");
    const scope = { _id: digest(state), userId, sessionId, portal };
    const attempt = await pending.findOne({ ...scope, expiresAt: { $gt: new Date() } });
    if (!attempt) return feedback("This connection request expired or belongs to a different session. Start a new one.");
    const code = searchParams.get("code");
    const issuer = searchParams.get("iss");
    if (searchParams.has("error") || !code || code.length > 4096 || (issuer && issuer !== provider.issuer)) {
      await pending.deleteOne(scope);
      return feedback("The portal did not authorize the connection.");
    }
    const subject = await resolveIdentity(provider, callbackUrl(request, portal), code, attempt.verifier);
    const linked = await client.withSession((session) => session.withTransaction(async () => {
      const consumed = await pending.deleteOne({ ...scope, expiresAt: { $gt: new Date() } }, { session });
      if (!consumed.deletedCount) return false;
      const liveSession = await db.collection<{ _id: string; userId: string; expiresAt: Date }>("sessions")
        .findOne({ _id: sessionId, userId, expiresAt: { $gt: new Date() } }, { session });
      if (!liveSession) return false;
      await db.collection("jobPortalConnections").updateOne(
        { userId, portal }, { $set: { subject, linkedAt: new Date() } }, { session, upsert: true },
      );
      await audit(userId, "Job portal account linked", portal, "USER", session);
      return true;
    }));
    return linked ? feedback("Portal account linked.", true) : feedback("Start a new connection from Job Portals.");
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return feedback("This portal account is already linked to a NextRole workspace.");
    console.error("Portal callback failed", { portal, type: error instanceof Error ? error.name : "unknown" });
    return feedback("The portal connection could not be completed. Start a new connection and try again.");
  }
}
