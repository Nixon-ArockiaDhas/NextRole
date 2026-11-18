import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function searchLinkedInMcp(query: { keywords: string; location?: string }) {
  const endpoint = process.env.LINKEDIN_MCP_URL;
  if (!endpoint) throw new Error("LinkedIn MCP server URL missing");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new Error("Remote MCP connections require HTTPS");
  }
  // This server must expose app-level public job search. Personal account sessions require per-user authorization.
  const client = new Client({ name: "nextrole-job-search", version: "1.0.0" });
  const token = process.env.LINKEDIN_MCP_TOKEN;
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: "error" },
  });
  try {
    await client.connect(transport, { timeout: 15000 });
    const result = CallToolResultSchema.parse(await client.callTool({
      name: "search-jobs", arguments: query,
    }, undefined, { timeout: 30000 }));
    if (result.isError) throw new Error("LinkedIn MCP search failed");
    if (result.structuredContent) return result.structuredContent;
    for (const content of result.content) {
      if (content.type === "text") return JSON.parse(content.text);
      if (content.type === "resource" && "text" in content.resource) return JSON.parse(content.resource.text);
    }
    throw new Error("LinkedIn MCP returned no structured job data");
  } finally {
    await client.close();
  }
}
