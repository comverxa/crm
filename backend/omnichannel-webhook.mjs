/**
 * HTTP adapter for COMVERXA Omnichannel Core.
 *
 * Requirements:
 * - Attach under a protected, channel-specific POST route.
 * - Configure Evolution webhook/custom proxy to send x-webhook-secret; DO NOT
 *   treat the Evolution API key alone as proof of webhook authenticity.
 * - Verify Meta X-Hub-Signature-256 against RAW body before accepting events.
 * - All secrets are injected server-side, NEVER sent to clients or logs.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function equalConstantTime(received, expected) {
  if (!received || !expected || typeof received !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(received, "utf8"), b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createWebhookVerifier({ metaSecrets = {}, evolutionSecrets = {} } = {}) {
  return async ({ channel, credential, rawBody }) => {
    const cid = channel?.id;
    if (!cid || !credential || typeof rawBody !== "string") return false;
    if (channel.provider === "meta") {
      const secret = metaSecrets[cid];
      if (!secret || !/^sha256=[a-f0-9]{64}$/i.test(credential.signature ?? "")) return false;
      const digest = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
      return equalConstantTime(credential.signature.toLowerCase(), digest);
    }
    if (channel.provider === "evolution") {
      const secret = evolutionSecrets[cid];
      return !!secret && equalConstantTime(credential.apiKey, secret);
    }
    return false;
  };
}
const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
export function createWebhookHttpHandler({ inbox, maxBodyBytes = 1024 * 1024 } = {}) {
  if (!inbox || typeof inbox.receiveWebhook !== "function") throw Error("Inbox implementation required");
  return async function handleWebhook(request) {
    const match = new URL(request.url).pathname.match(/^\/api\/omnichannel\/webhook\/([a-zA-Z0-9_-]{1,100})$/);
    if (!match) return json(404, { error: "Not found" });
    if (request.method !== "POST") return json(405, { error: "Method not allowed" });
    const claimedSize = Number(request.headers.get("content-length"));
    if (Number.isFinite(claimedSize) && claimedSize > maxBodyBytes) return json(413, { error: "Payload too large" });
    let rawBody, payload;
    try {
      // This is a first-stage adapter; enforce body size at reverse proxy too.
      rawBody = await request.text();
      if (Buffer.byteLength(rawBody, "utf8") > maxBodyBytes) return json(413, { error: "Payload too large" });
      payload = JSON.parse(rawBody);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json(400, { error: "Invalid JSON" });
    } catch { return json(400, { error: "Invalid JSON" }); }
    try {
      const outcome = await inbox.receiveWebhook({
        channelId: match[1], rawBody, payload,
        credential: {
          signature: request.headers.get("x-hub-signature-256") ?? "",
          apiKey: request.headers.get("x-webhook-secret") ?? "",
        },
      });
      return json(200, { received: true, ...outcome });
    } catch (err) {
      // Avoid leaking channel existence, secrets, internal errors or lead info.
      if (/Invalid webhook authentication|Unknown channel/.test(String(err?.message))) return json(401, { error: "Unauthorized" });
      return json(500, { error: "Processing error" });
    }
  };
}
