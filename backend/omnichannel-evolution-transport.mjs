/**
 * COMVERXA — Evolution API sendText transport (development module).
 * Credentials remain server-side. Instantiate ONLY after authenticated
 * tenant/channel lookups, connection health check, and an approved rollout.
 * Does not send anything until its returned function is explicitly invoked.
 */
export function createEvolutionTextTransport({ baseUrl, apiKey, instanceForChannel, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  if (typeof baseUrl !== "string" || !/^https:\/\//.test(baseUrl)) throw Error("HTTPS base URL required");
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash) throw Error("Invalid API base URL");
  if (typeof apiKey !== "string" || !apiKey.trim()) throw Error("Server-side API key required");
  if (typeof instanceForChannel !== "function" || typeof fetchImpl !== "function") throw Error("Trusted dependencies required");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) throw Error("Invalid timeout");
  return async ({ tenantId, channelId, provider, phone, text }) => {
    if (typeof tenantId !== "string" || !tenantId || typeof channelId !== "string" || !channelId || provider !== "evolution") throw Error("Invalid channel");
    if (typeof phone !== "string" || !/^\d{10,15}$/.test(phone)) throw Error("Invalid recipient");
    if (typeof text !== "string" || !text.trim() || text.length > 4000) throw Error("Invalid text");
    // This lookup MUST be server-side and scoped by tenant; never accept an
    // arbitrary instance name supplied by the user's browser or webhook.
    const instance = await instanceForChannel(tenantId, channelId);
    if (typeof instance !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(instance)) throw Error("Channel not configured");
    const url = new URL("message/sendText/" + encodeURIComponent(instance), base.href.endsWith("/") ? base.href : base.href + "/");
    if (url.origin !== base.origin) throw Error("Unexpected destination");
    const response = await fetchImpl(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", "apikey": apiKey },
      body: JSON.stringify({ number: phone, text: text.trim() }),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    if (!response.ok) throw Error("Provider rejected request");
    const answer = await response.json();
    const id = answer?.key?.id ?? answer?.id;
    if (typeof id !== "string" || !id) throw Error("Provider confirmation missing");
    return { id };
  };
}
