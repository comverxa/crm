/**
 * COMVERXA — HTTP sending endpoint adapter (prototype, not mounted in production).
 * Only mount behind existing authenticated same-origin CRM session middleware.
 * The supplied getSession must validate the session server-side. CSRF validation
 * must be enforced by verifyCsrf; no client-provided role/tenant is trusted.
 */
const reply = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
export function createOmnichannelSendHandler({ outbound, getSession, verifyCsrf, enabled = false, maxBodyBytes = 8192 } = {}) {
  if (!outbound || typeof outbound.sendText !== "function" ||
      typeof getSession !== "function" || typeof verifyCsrf !== "function") {
    throw Error("Authenticated endpoint dependencies required");
  }
  return async (request) => {
    let pathname;
    try { pathname = new URL(request.url).pathname; } catch { return reply(404, { error: "Not found" }); }
    if (pathname !== "/api/omnichannel/messages/send") return reply(404, { error: "Not found" });
    if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
    if (!enabled) return reply(503, { error: "Channel sending not enabled" });
    let session;
    try { session = await getSession(request); } catch { return reply(401, { error: "Unauthorized" }); }
    if (!session?.tenantId || !session?.userId) return reply(401, { error: "Unauthorized" });
    if (!(await verifyCsrf(request, session))) return reply(403, { error: "Forbidden" });
    const claimedLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(claimedLength) && claimedLength > maxBodyBytes) return reply(413, { error: "Payload too large" });
    if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) {
      return reply(415, { error: "JSON required" });
    }
    let body;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) return reply(413, { error: "Payload too large" });
      body = JSON.parse(raw);
      if (!body || typeof body !== "object" || Array.isArray(body)) return reply(400, { error: "Invalid JSON" });
    } catch { return reply(400, { error: "Invalid JSON" }); }
    try {
      const { conversationId, text, requestId } = body;
      const result = await outbound.sendText(session, { conversationId, text, requestId });
      return reply(result.status === "unknown-outcome" ? 202 : 200, result);
    } catch (error) {
      const msg = String(error?.message ?? "");
      if (msg === "Unauthorized") return reply(401, { error: "Unauthorized" });
      if (msg === "Forbidden") return reply(403, { error: "Forbidden" });
      if (msg === "Not found" || msg === "Channel unavailable") return reply(404, { error: "Not found" });
      if (msg === "Invalid request" || msg === "Invalid message") return reply(400, { error: "Invalid message request" });
      if (msg === "Outbound transport not configured") return reply(503, { error: "Sending unavailable" });
      return reply(500, { error: "Sending error" });
    }
  };
}
