export function composioLinkedInConfigured() {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim() && process.env.COMPOSIO_LINKEDIN_AUTH_CONFIG_ID?.trim());
}

export async function composioRequest(path: string, method: "POST" | "DELETE", body?: object) {
  const key = process.env.COMPOSIO_API_KEY?.trim();
  if (!key) throw new Error("Composio configuration missing");
  const response = await fetch(`https://backend.composio.dev/api/${path}`, {
    method,
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Composio request failed");
  return method === "DELETE" ? null : await response.json() as unknown;
}
