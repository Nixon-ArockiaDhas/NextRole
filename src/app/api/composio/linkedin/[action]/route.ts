import { NextRequest } from "next/server";
import { z } from "zod";
import { currentAccount, limit } from "../../../../../services/accounts";
import { database, audit } from "../../../../../services/database";
import { composioLinkedInConfigured, composioRequest } from "../../../../../connectors/composio-linkedin";

type Context = { params: Promise<{ action: string }> };
type Connection = { _id: string; userId: string; connectedAccountId: string; identity?: string };

function result(message: string, success = false) {
  const query = new URLSearchParams({ portal: "linkedin", [success ? "success" : "error"]: message });
  return new Response(null, { status: 303, headers: { Location: `/portals?${query}`, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function POST(request: NextRequest, context: Context) {
  const { action } = await context.params;
  if (!["connect", "disconnect", "profile"].includes(action)) return new Response(null, { status: 404 });
  const origin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : request.nextUrl.origin;
  if (request.headers.get("origin") !== origin) return new Response(null, { status: 403 });
  try {
    const account = await currentAccount();
    if (!account) return result("Sign in to NextRole first.");
    if (!composioLinkedInConfigured()) return result("Composio setup is required.");
    const userId = account._id;
    if (!(await limit(`composio-linkedin:${userId}`, 12))) return result("Too many requests. Try again later.");
    const { db } = await database();
    const connections = db.collection<Connection>("composioLinkedInConnections");
    const connection = await connections.findOne({ _id: userId });
    if (action === "connect") {
      if (connection) return result("LinkedIn is already connected.", true);
      const link = z.object({ redirect_url: z.url() }).parse(await composioRequest("v3.1/connected_accounts/link", "POST", {
        auth_config_id: process.env.COMPOSIO_LINKEDIN_AUTH_CONFIG_ID?.trim(),
        user_id: userId,
      }));
      const url = new URL(link.redirect_url);
      if (url.origin !== "https://connect.composio.dev") throw new Error("Unexpected authorization host");
      return new Response(null, { status: 303, headers: { Location: url.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    }
    if (!connection) return result("Connect LinkedIn first.");
    if (action === "disconnect") {
      await composioRequest(`v3.1/connected_accounts/${encodeURIComponent(connection.connectedAccountId)}`, "DELETE");
      await connections.deleteOne({ _id: userId, connectedAccountId: connection.connectedAccountId });
      return result("LinkedIn disconnected.", true);
    }
    const response = z.object({
      successful: z.literal(true),
      data: z.object({ name: z.string().trim().min(1).max(200) }),
    }).parse(await composioRequest("v3/tools/execute/LINKEDIN_WHO_AM_I", "POST", {
      connected_account_id: connection.connectedAccountId, user_id: userId, arguments: {}, version: "latest",
    }));
    const updated = await connections.updateOne({ _id: userId, connectedAccountId: connection.connectedAccountId }, { $set: { identity: response.data.name } });
    if (!updated.matchedCount) return result("The LinkedIn connection changed.");
    return result("LinkedIn profile verified.", true);
  } catch {
    return result("Composio could not complete the LinkedIn request.");
  }
}

export async function GET(request: NextRequest, context: Context) {
  if ((await context.params).action !== "callback") return new Response(null, { status: 404 });
  const uri = request.nextUrl.searchParams.get("session_uri");
  if (!uri || uri.length > 4096 || !composioLinkedInConfigured()) return result("Start a new LinkedIn connection.");
  try {
    const account = await currentAccount();
    if (!account) return result("Sign in to NextRole and start a new connection.");
    const { client, db } = await database();
    const linked = z.object({ connected_account_id: z.string().min(1), toolkit_slug: z.literal("linkedin") })
      .parse(await composioRequest("v3.1/connected_accounts/complete_auth", "POST", { session_uri: uri, user_id: account._id }));
    await client.withSession(session => session.withTransaction(async () => {
      const saved = await db.collection<Connection>("composioLinkedInConnections").updateOne(
        { _id: account._id }, { $setOnInsert: { userId: account._id, connectedAccountId: linked.connected_account_id } },
        { session, upsert: true },
      );
      if (saved.upsertedCount) await audit(account._id, "LinkedIn connected through Composio", "linkedin", "USER", session);
    }));
    return result("LinkedIn connected through Composio.", true);
  } catch {
    return result("LinkedIn authorization could not be verified. Start a new connection.");
  }
}
